-- Enable Row Level Security
alter table users enable row level security;
alter table tickets enable row level security;
alter table reports enable row level security;
alter table organizations enable row level security;
alter table analytics_daily enable row level security;
alter table workflow_events enable row level security;

-- Service role policies (bypass RLS for server operations)
create policy "service_role_all_users"
  on users for all
  using (auth.role() = 'service_role');

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

-- Public read access for organizations (needed for boundary checks)
create policy "public_read_organizations"
  on organizations for select
  using (true);

-- User table for org members (optional extension)
create table user_org_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  role text not null check (role in ('admin', 'viewer', 'analyst')),
  created_at timestamptz default now(),
  unique(user_id, org_id)
);

alter table user_org_roles enable row level security;

create policy "service_role_all_user_org_roles"
  on user_org_roles for all
  using (auth.role() = 'service_role');

-- Org members can read their organization's data
create policy "org_members_read_tickets"
  on tickets for select
  using (
    exists (
      select 1 from user_org_roles uor
      where uor.org_id = tickets.org_id
      and uor.user_id = auth.uid()
    )
  );

create policy "org_members_read_reports"
  on reports for select
  using (
    exists (
      select 1 from tickets t
      join user_org_roles uor on uor.org_id = t.org_id
      where t.id = reports.ticket_id
      and uor.user_id = auth.uid()
    )
  );

create policy "org_members_read_analytics"
  on analytics_daily for select
  using (
    exists (
      select 1 from user_org_roles uor
      where uor.org_id = analytics_daily.org_id
      and uor.user_id = auth.uid()
    )
  );

-- Create indexes for RLS performance
create index idx_user_org_roles_lookup on user_org_roles(user_id, org_id);
create index idx_tickets_org_rls on tickets(org_id) where org_id is not null;