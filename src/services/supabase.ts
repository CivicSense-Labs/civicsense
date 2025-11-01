import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../utils/config';
import type { Database } from '../types/supabase';

const cfg = getConfig();

// Public (anon) client — use for RLS-protected reads where appropriate.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// Admin (service-role) client — server-only tasks (inserts/merges/embeddings).
export const adminSupabase: SupabaseClient<Database> = createClient<Database>(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
