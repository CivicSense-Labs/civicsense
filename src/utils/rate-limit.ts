import { createSupabaseClient } from '../services/supabase.js';
import { loadConfig } from './config.js';
import type { RateLimitInfo } from '../types/index.js';

const supabase = createSupabaseClient();
const config = loadConfig();

/**
 * Check and update rate limiting for a phone hash
 */
export async function checkRateLimit(phoneHash: string): Promise<RateLimitInfo> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  const maxReports = parseInt(process.env.MAX_REPORTS_PER_DAY || '5');

  try {
    // Get or create rate limit entry for today
    const { data: rateLimitEntry, error: fetchError } = await supabase
      .from('rate_limiter')
      .select('*')
      .eq('phone_hash', phoneHash)
      .eq('day', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Rate limit fetch error:', fetchError);
      throw fetchError;
    }

    let currentCount = 0;

    if (rateLimitEntry) {
      currentCount = rateLimitEntry.count;
    }

    // Check if limit exceeded
    if (currentCount >= maxReports) {
      return {
        allowed: false,
        count: currentCount,
        limit: maxReports,
        reset_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Tomorrow
      };
    }

    // Increment counter
    const newCount = currentCount + 1;

    if (rateLimitEntry) {
      // Update existing entry
      const { error: updateError } = await supabase
        .from('rate_limiter')
        .update({ count: newCount })
        .eq('phone_hash', phoneHash)
        .eq('day', today);

      if (updateError) {
        console.error('Rate limit update error:', updateError);
        throw updateError;
      }
    } else {
      // Create new entry
      const { error: insertError } = await supabase
        .from('rate_limiter')
        .insert({
          phone_hash: phoneHash,
          day: today,
          count: newCount
        });

      if (insertError) {
        console.error('Rate limit insert error:', insertError);
        throw insertError;
      }
    }

    return {
      allowed: true,
      count: newCount,
      limit: maxReports,
      reset_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

  } catch (error) {
    console.error('Rate limiting error:', error);
    // Allow request on error to avoid blocking legitimate users
    return {
      allowed: true,
      count: 0,
      limit: maxReports,
      reset_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }
}

/**
 * Reset rate limiting for a specific phone hash (admin function)
 */
export async function resetRateLimit(phoneHash: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('rate_limiter')
    .delete()
    .eq('phone_hash', phoneHash)
    .eq('day', today);

  if (error) {
    console.error('Rate limit reset error:', error);
    throw error;
  }
}