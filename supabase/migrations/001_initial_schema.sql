-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Helper function for SHA256 hashing
create or replace function sha256_hex(text)
returns text
language sql
immutable as $$
  select encode(digest($1,'sha256'),'hex');
$$;

-- Function to update updated_at timestamp
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Organizations table
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_bounds jsonb not null, -- GeoJSON polygon
  contact_email text,
  created_at timestamptz default now()
);

-- Users table with hashed phone numbers
create table users (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone_hash text unique not null,
  email text,
  verified boolean default false,
  last_active timestamptz,
  created_at timestamptz default now()
);

-- Tickets table
create table tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  parent_id uuid references tickets(id) on delete set null,
  description text not null,
  category text,
  cross_street text,
  lat double precision,
  lon double precision,
  status text default 'open' check (status in ('open', 'closed', 'pending_dedup')),
  sentiment_score real check (sentiment_score >= -1 and sentiment_score <= 1),
  priority text default 'normal' check (priority in ('normal', 'high', 'critical')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Reports table
create table reports (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  channel text not null check (channel in ('sms', 'voice')),
  transcript text not null,
  urgency_score real default 0 check (urgency_score >= 0 and urgency_score <= 1),
  created_at timestamptz default now()
);

-- Ticket embeddings for deduplication
create table ticket_embeddings (
  ticket_id uuid primary key references tickets(id) on delete cascade,
  embedding vector(1536) -- OpenAI ada-002 size, adjust based on model
);

-- Daily analytics snapshot
create table analytics_daily (
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

-- Rate limiting table
create table rate_limiter (
  phone_hash text,
  day date,
  count int default 0,
  primary key (phone_hash, day)
);

-- Workflow events for agent coordination
create table workflow_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  processed boolean default false,
  created_at timestamptz default now()
);

-- Add updated_at trigger to tickets
create trigger t_tickets_updated
  before update on tickets
  for each row
  execute function set_updated_at();

-- Indexes for performance
create index idx_tickets_org_status on tickets(org_id, status);
create index idx_tickets_location on tickets(lat, lon) where lat is not null and lon is not null;
create index idx_tickets_created_at on tickets(created_at);
create index idx_tickets_parent_id on tickets(parent_id) where parent_id is not null;
create index idx_reports_ticket_id on reports(ticket_id);
create index idx_reports_user_id on reports(user_id);
create index idx_workflow_events_processed on workflow_events(processed, created_at);
create index idx_rate_limiter_lookup on rate_limiter(phone_hash, day);

-- Vector similarity index (create after data is loaded)
-- create index on ticket_embeddings using ivfflat (embedding vector_cosine_ops) with (lists=100);