import { createSupabaseClient } from '../services/supabase.js';
import type { FlowState } from '../types/index.js';

const supabase = createSupabaseClient();

interface MergeResult {
  success: boolean;
  error?: string;
}

/**
 * Merge Agent - Merges duplicate tickets under a parent
 */
export async function mergeAgent(state: FlowState, parentTicketId: string): Promise<MergeResult> {
  try {
    if (!state.ticketId) {
      throw new Error('No ticket ID in state');
    }

    // Update the current ticket to be a child of the parent
    const { error: updateError } = await supabase
      .from('tickets')
      .update({
        parent_id: parentTicketId,
        status: 'open' // Child tickets are still "open" but under parent
      })
      .eq('id', state.ticketId);

    if (updateError) {
      throw updateError;
    }

    // Update parent ticket description to include merged info
    const { data: parentTicket, error: parentError } = await supabase
      .from('tickets')
      .select('description')
      .eq('id', parentTicketId)
      .single();

    if (parentError) {
      console.error('Failed to fetch parent ticket:', parentError);
      // Don't fail the merge for this
    } else if (parentTicket) {
      // Get child count for parent ticket
      const { count: childCount } = await supabase
        .from('tickets')
        .select('id', { count: 'exact' })
        .eq('parent_id', parentTicketId);

      // Optionally update parent description to mention merge count
      // For hackathon, we'll keep it simple and just log the event
      state.llm_reasoning_trace?.push(`Ticket merged as child #${childCount || 0 + 1} of parent ${parentTicketId}`);
    }

    // Log merge event
    await supabase
      .from('workflow_events')
      .insert({
        ticket_id: state.ticketId,
        event_type: 'ticket.merged',
        payload: {
          parent_ticket_id: parentTicketId,
          merge_reason: 'duplicate_detection'
        }
      });

    return { success: true };

  } catch (error) {
    console.error('Merge agent error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Merge failed'
    };
  }
}