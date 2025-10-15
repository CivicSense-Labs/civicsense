-- CivicSense Database Setup Script
-- Run this script in the Supabase Dashboard SQL Editor
-- Go to: https://supabase.com/dashboard/project/cwrpfyiggnoqhxoebbnj/sql/new

-- ========================================
-- STEP 1: Enable Required Extensions
-- ========================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Enable password hashing
create extension if not exists "pgcrypto";

-- Enable vector similarity search (for AI deduplication)
create extension if not exists "vector";

-- ========================================
-- STEP 2: Helper Functions
-- ========================================

-- SHA256 hashing function for privacy (phone numbers)
create or replace function sha256_hex(text)
returns text
language sql
immutable as $$
  select encode(digest($1,'sha256'),'hex');
$$;

-- Automatic timestamp update trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ========================================
-- STEP 3: Core Tables
-- ========================================

-- Organizations (municipalities, cities, etc.)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_bounds jsonb not null, -- GeoJSON polygon defining service area
  contact_email text,
  created_at timestamptz default now()
);

-- Users with privacy-protected phone numbers
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone_hash text unique not null, -- SHA256 hash of phone number
  email text,
  verified boolean default false,
  last_active timestamptz,
  created_at timestamptz default now()
);

-- Tickets (main issue reports)
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  parent_id uuid references tickets(id) on delete set null, -- For merged tickets
  description text not null,
  category text, -- Determined by AI agent
  cross_street text,
  lat double precision,
  lon double precision,
  status text default 'open' check (status in ('open', 'closed', 'pending_dedup')),
  sentiment_score real check (sentiment_score >= -1 and sentiment_score <= 1),
  priority text default 'normal' check (priority in ('normal', 'high', 'critical')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Individual reports from citizens (many reports can create one ticket)
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  channel text not null check (channel in ('sms', 'voice')),
  transcript text not null,
  urgency_score real default 0 check (urgency_score >= 0 and urgency_score <= 1),
  created_at timestamptz default now()
);

-- AI embeddings for deduplication (vector similarity search)
create table if not exists ticket_embeddings (
  ticket_id uuid primary key references tickets(id) on delete cascade,
  embedding vector(1536) -- OpenAI ada-002 embeddings size
);

-- Daily analytics rollup
create table if not exists analytics_daily (
  org_id uuid references organizations(id),
  date date not null,
  total_tickets int default 0,
  open_tickets int default 0,
  closed_tickets int default 0,
  avg_time_to_close real,
  top_category text,
  sentiment_avg real,
  primary key (org_id, date)
);

-- Rate limiting per phone number
create table if not exists rate_limiter (
  phone_hash text,
  day date,
  count int default 0,
  primary key (phone_hash, day)
);

-- Agent workflow coordination
create table if not exists workflow_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  event_type text not null, -- 'new_report', 'dedup_complete', etc.
  payload jsonb,
  processed boolean default false,
  created_at timestamptz default now()
);

-- User organization roles (for dashboard access)
create table if not exists user_org_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz default now(),
  unique(user_id, org_id)
);

-- ========================================
-- STEP 4: Triggers
-- ========================================

-- Auto-update timestamps
drop trigger if exists t_tickets_updated on tickets;
create trigger t_tickets_updated
  before update on tickets
  for each row
  execute function set_updated_at();

-- ========================================
-- STEP 5: Performance Indexes
-- ========================================

-- Ticket lookups
create index if not exists idx_tickets_org_status on tickets(org_id, status);
create index if not exists idx_tickets_location on tickets(lat, lon) where lat is not null and lon is not null;
create index if not exists idx_tickets_created_at on tickets(created_at);
create index if not exists idx_tickets_parent_id on tickets(parent_id) where parent_id is not null;

-- Report lookups
create index if not exists idx_reports_ticket_id on reports(ticket_id);
create index if not exists idx_reports_user_id on reports(user_id);

-- Workflow processing
create index if not exists idx_workflow_events_processed on workflow_events(processed, created_at);

-- Rate limiting
create index if not exists idx_rate_limiter_lookup on rate_limiter(phone_hash, day);

-- User organization access
create index if not exists idx_user_org_roles_user on user_org_roles(user_id);
create index if not exists idx_user_org_roles_org on user_org_roles(org_id);

-- ========================================
-- STEP 6: Row Level Security (RLS)
-- ========================================

-- Enable RLS on all tables
alter table tickets enable row level security;
alter table reports enable row level security;
alter table organizations enable row level security;
alter table analytics_daily enable row level security;
alter table workflow_events enable row level security;
alter table user_org_roles enable row level security;

-- Service role has full access (for API)
create policy "service_role_all_tickets"
  on tickets for all
  using (auth.role() = 'service_role');

create policy "service_role_all_reports"
  on reports for all
  using (auth.role() = 'service_role');

create policy "service_role_all_organizations"
  on organizations for all
  using (auth.role() = 'service_role');

create policy "service_role_all_analytics"
  on analytics_daily for all
  using (auth.role() = 'service_role');

create policy "service_role_all_events"
  on workflow_events for all
  using (auth.role() = 'service_role');

create policy "service_role_all_user_org_roles"
  on user_org_roles for all
  using (auth.role() = 'service_role');

-- Organization members can read their org's data
create policy "org_members_read_tickets"
  on tickets for select
  using (
    org_id in (
      select org_id from user_org_roles
      where user_id = auth.uid()
    )
  );

create policy "org_members_read_reports"
  on reports for select
  using (
    ticket_id in (
      select t.id from tickets t
      join user_org_roles uor on t.org_id = uor.org_id
      where uor.user_id = auth.uid()
    )
  );

create policy "org_members_read_analytics"
  on analytics_daily for select
  using (
    org_id in (
      select org_id from user_org_roles
      where user_id = auth.uid()
    )
  );

-- Additional RLS index for performance
create index if not exists idx_tickets_org_rls on tickets(org_id) where org_id is not null;

-- ========================================
-- STEP 7: Sample Data (Optional - for testing)
-- ========================================

-- Insert a demo organization
insert into organizations (id, name, area_bounds, contact_email)
values (
  gen_random_uuid(),
  'Demo City',
  '{"type":"Polygon","coordinates":[[[-122.4194,37.7749],[-122.4094,37.7749],[-122.4094,37.7849],[-122.4194,37.7849],[-122.4194,37.7749]]]}',
  'demo@civicsense.dev'
) on conflict do nothing;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

select 'Database setup completed successfully! 🎉' as message;