import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../utils/config.js';

let supabaseClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseClient() {
  if (!supabaseClient) {
    const config = loadConfig();
    supabaseClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabaseClient;
}

export function createSupabaseAnonClient() {
  const config = loadConfig();
  return createClient(
    config.supabase.url,
    config.supabase.anonKey
  );
}