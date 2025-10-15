import { createSupabaseClient } from '../services/supabase.js';
import { sendSMS } from '../services/twilio.js';
import type { FlowState } from '../types/index.js';

const supabase = createSupabaseClient();

interface NotifyOptions {
  merged: boolean;
  parentTicketId?: string;
  channel: 'sms' | 'voice';
}

interface NotifyResult {
  success: boolean;
  error?: string;
}

/**
 * Notification Agent - Sends confirmations and updates to users
 */
export async function notifyAgent(state: FlowState, options: NotifyOptions): Promise<NotifyResult> {
  try {
    if (!state.ticketId) {
      throw new Error('No ticket ID in state');
    }

    // Get user and ticket info
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select(`
        *,
        users!inner (
          phone_hash
        ),
        tickets!inner (
          id,
          description,
          parent_id
        )
      `)
      .eq('ticket_id', state.ticketId)
      .single();

    if (reportError || !report) {
      throw new Error('Report not found');
    }

    // Skip SMS notifications for voice calls (already notified)
    if (options.channel === 'voice') {
      state.llm_reasoning_trace?.push('Skipping SMS notification for voice call');
      return { success: true };
    }

    // Generate confirmation message
    let message: string;
    if (options.merged && options.parentTicketId) {
      message = `Thanks! Your report #${state.ticketId.slice(-4)} is logged under parent ticket #${options.parentTicketId.slice(-4)}. We've received similar reports and are prioritizing this issue.`;
    } else {
      message = `Thanks! Your report #${state.ticketId.slice(-4)} has been received and is being processed. You'll receive updates as we work on this issue.`;
    }

    // For demo purposes, we'll simulate SMS sending
    // In production, you'd need the actual phone number (stored encrypted)
    state.llm_reasoning_trace?.push(`SMS notification prepared: "${message}"`);

    // Log notification event
    await supabase
      .from('workflow_events')
      .insert({
        ticket_id: state.ticketId,
        event_type: 'notification.sent',
        payload: {
          channel: 'sms',
          message,
          merged: options.merged,
          parent_ticket_id: options.parentTicketId
        }
      });

    return { success: true };

  } catch (error) {
    console.error('Notify agent error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Notification failed'
    };
  }
}

/**
 * Send digest notifications (used by cron jobs)
 */
export async function sendDailyDigest(orgId: string): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    // Get users with open tickets
    const { data: usersWithTickets, error } = await supabase
      .from('users')
      .select(`
        id,
        phone_hash,
        reports!inner (
          tickets!inner (
            id,
            status,
            description,
            created_at
          )
        )
      `)
      .eq('reports.tickets.status', 'open')
      .eq('reports.tickets.org_id', orgId);

    if (error) {
      throw error;
    }

    for (const user of usersWithTickets || []) {
      try {
        const openTickets = user.reports
          .map(r => r.tickets)
          .filter(t => t.status === 'open');

        if (openTickets.length === 0) continue;

        const message = `Daily update: You have ${openTickets.length} open report(s). We're working on your issues and will notify you of any updates.`;

        // Log digest notification (actual SMS sending would happen here)
        await supabase
          .from('workflow_events')
          .insert({
            ticket_id: openTickets[0].id,
            event_type: 'digest.sent',
            payload: {
              user_id: user.id,
              message,
              ticket_count: openTickets.length
            }
          });

        sent++;

      } catch (userError) {
        console.error(`Failed to send digest to user ${user.id}:`, userError);
        failed++;
      }
    }

  } catch (error) {
    console.error('Daily digest error:', error);
  }

  return { sent, failed };
}