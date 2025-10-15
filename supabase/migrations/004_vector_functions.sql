-- Vector similarity search function
create or replace function find_similar_tickets(
  target_embedding vector(1536),
  similarity_threshold float default 0.7,
  match_limit int default 10,
  exclude_ticket_id uuid default null
)
returns table (
  ticket_id uuid,
  similarity float,
  ticket_data json
)
language sql
as $$
  select
    te.ticket_id,
    1 - (te.embedding <=> target_embedding) as similarity,
    to_json(t.*) as ticket_data
  from ticket_embeddings te
  join tickets t on t.id = te.ticket_id
  where
    t.status = 'open'
    and t.parent_id is null
    and (exclude_ticket_id is null or te.ticket_id != exclude_ticket_id)
    and 1 - (te.embedding <=> target_embedding) >= similarity_threshold
  order by te.embedding <=> target_embedding
  limit match_limit;
$$;

-- Function to rebuild vector index (call after loading data)
create or replace function rebuild_vector_index()
returns void
language sql
as $$
  -- Drop existing index if it exists
  drop index if exists idx_ticket_embeddings_vector;

  -- Create new index with appropriate list count
  create index idx_ticket_embeddings_vector
  on ticket_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = greatest(100, (select count(*) / 1000 from ticket_embeddings)::int));
$$;

-- Helper function to get embedding statistics
create or replace function embedding_stats()
returns table (
  total_embeddings bigint,
  avg_dimension int,
  index_exists boolean
)
language sql
as $$
  select
    count(*) as total_embeddings,
    case when count(*) > 0 then array_length(embedding, 1) else 0 end as avg_dimension,
    exists(
      select 1 from pg_indexes
      where tablename = 'ticket_embeddings'
      and indexname = 'idx_ticket_embeddings_vector'
    ) as index_exists
  from ticket_embeddings;
$$;