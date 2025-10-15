-- Dashboard views for optimized queries

-- View for ticket summaries with parent/child relationships
create or replace view ticket_summaries as
select
  t.id,
  t.org_id,
  t.parent_id,
  t.description,
  t.category,
  t.cross_street,
  t.lat,
  t.lon,
  t.status,
  t.priority,
  t.sentiment_score,
  t.created_at,
  t.updated_at,
  case when t.parent_id is null then t.id else t.parent_id end as root_ticket_id,
  (select count(*) from tickets children where children.parent_id = t.id) as child_count,
  (select count(*) from reports r where r.ticket_id = t.id) as report_count,
  array_agg(distinct r.channel) filter (where r.channel is not null) as channels_used,
  min(r.created_at) as first_reported_at,
  max(r.created_at) as last_reported_at
from tickets t
left join reports r on r.ticket_id = t.id
group by t.id, t.org_id, t.parent_id, t.description, t.category,
         t.cross_street, t.lat, t.lon, t.status, t.priority,
         t.sentiment_score, t.created_at, t.updated_at;

-- View for org-level dashboard metrics
create or replace view org_dashboard_metrics as
select
  o.id as org_id,
  o.name as org_name,
  count(t.id) filter (where t.status = 'open' and t.parent_id is null) as open_parent_tickets,
  count(t.id) filter (where t.status = 'closed' and t.parent_id is null) as closed_parent_tickets,
  count(t.id) filter (where t.status = 'open') as total_open_tickets,
  count(t.id) filter (where t.status = 'closed') as total_closed_tickets,
  count(t.id) filter (where t.parent_id is not null) as merged_tickets,
  count(t.id) filter (where t.priority = 'critical' and t.status = 'open') as critical_open,
  avg(t.sentiment_score) as avg_sentiment,
  count(distinct case when r.created_at >= current_date then r.id end) as reports_today,
  count(distinct case when t.created_at >= current_date then t.id end) as tickets_today
from organizations o
left join tickets t on t.org_id = o.id
left join reports r on r.ticket_id = t.id
group by o.id, o.name;

-- View for recent activity feed
create or replace view recent_activity as
select
  'ticket_created' as activity_type,
  t.id as ticket_id,
  t.org_id,
  t.description,
  t.category,
  t.priority,
  t.created_at as activity_time,
  null as user_phone_hash,
  'system' as actor
from tickets t
where t.created_at >= current_date - interval '7 days'

union all

select
  'report_submitted' as activity_type,
  r.ticket_id,
  t.org_id,
  left(r.transcript, 100) || '...' as description,
  t.category,
  t.priority,
  r.created_at as activity_time,
  u.phone_hash as user_phone_hash,
  'user' as actor
from reports r
join tickets t on t.id = r.ticket_id
join users u on u.id = r.user_id
where r.created_at >= current_date - interval '7 days'

union all

select
  'ticket_merged' as activity_type,
  t.id as ticket_id,
  t.org_id,
  'Merged with parent ticket #' || coalesce(t.parent_id::text, 'unknown') as description,
  t.category,
  t.priority,
  t.updated_at as activity_time,
  null as user_phone_hash,
  'system' as actor
from tickets t
where t.parent_id is not null
and t.updated_at >= current_date - interval '7 days'

order by activity_time desc;

-- Function to compute daily analytics (used by cron job)
create or replace function compute_daily_analytics(target_date date default current_date)
returns void as $$
declare
  org_record record;
begin
  for org_record in select id from organizations loop
    insert into analytics_daily (
      org_id,
      date,
      total_tickets,
      open_tickets,
      closed_tickets,
      avg_time_to_close,
      top_category,
      sentiment_avg
    )
    select
      org_record.id,
      target_date,
      count(*) filter (where date(t.created_at) = target_date),
      count(*) filter (where t.status = 'open' and date(t.created_at) <= target_date),
      count(*) filter (where t.status = 'closed' and date(t.updated_at) = target_date),
      avg(extract(epoch from (t.updated_at - t.created_at))/3600) filter (where t.status = 'closed' and date(t.updated_at) = target_date),
      mode() within group (order by t.category) filter (where date(t.created_at) = target_date),
      avg(t.sentiment_score) filter (where date(t.created_at) = target_date)
    from tickets t
    where t.org_id = org_record.id
    and (date(t.created_at) <= target_date or date(t.updated_at) = target_date)

    on conflict (org_id, date) do update set
      total_tickets = excluded.total_tickets,
      open_tickets = excluded.open_tickets,
      closed_tickets = excluded.closed_tickets,
      avg_time_to_close = excluded.avg_time_to_close,
      top_category = excluded.top_category,
      sentiment_avg = excluded.sentiment_avg;
  end loop;
end;
$$ language plpgsql;