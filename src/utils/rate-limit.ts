import { adminSupabase } from '../services/supabase';
import { getConfig } from '../utils/config';
import type { RateLimitInfo } from '../types/index';

const supabase = adminSupabase;
const config = getConfig();

const getTomorrowISO = (): string => 
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

/**
 * Check and update rate limiting for a phone hash
 */
export async function checkRateLimit(phoneHash: string): Promise<RateLimitInfo> {
  const today = new Date().toISOString().split('T')[0];
  const maxReports = config.MAX_REPORTS_PER_DAY || 5;

  try {
    // Get current count first - maybeSingle() returns null if no record exists (safe for first-time users)
    const { data: existing } = await supabase
      .from('rate_limiter')
      .select('count')
      .eq('phone_hash', phoneHash)
      .eq('day', today)
      .maybeSingle();

    const currentCount = (existing?.count || 0) + 1;

    // Check limit before updating
    if (currentCount > maxReports) {
      return {
        allowed: false,
        count: currentCount - 1,
        limit: maxReports,
        reset_time: getTomorrowISO()
      };
    }

    // UPSERT with correct count
    await supabase
      .from('rate_limiter')
      .upsert({
        phone_hash: phoneHash,
        day: today,
        count: currentCount
      }, {
        onConflict: 'phone_hash,day'
      });

    return {
      allowed: true,
      count: currentCount,
      limit: maxReports,
      reset_time: getTomorrowISO()
    };

  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - allow request to avoid blocking legitimate users
    return {
      allowed: true,
      count: 0,
      limit: maxReports,
      reset_time: getTomorrowISO()
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
