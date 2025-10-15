import { createSupabaseClient } from '../services/supabase.js';
import { upsertTicketEmbedding, findSimilarTickets } from '../services/embeddings.js';
import { calculateSimilarityScore, findDedupCandidates } from '../utils/similarity.js';
import type { FlowState } from '../types/index.js';

const supabase = createSupabaseClient();

interface DedupResult {
  success: boolean;
  should_merge: boolean;
  parent_ticket_id?: string;
  decision: string;
  error?: string;
}

/**
 * Deduplication Agent - Finds and merges similar tickets
 */
export async function dedupAgent(state: FlowState): Promise<DedupResult> {
  try {
    if (!state.ticketId) {
      throw new Error('No ticket ID in state');
    }

    // Get current ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', state.ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket not found');
    }

    // Generate embedding for this ticket
    await upsertTicketEmbedding(
      ticket.id,
      ticket.description,
      ticket.category,
      ticket.cross_street
    );

    // Find similar tickets using vector search
    const similarResult = await findSimilarTickets(ticket.id, 0.7, 5);

    if (!similarResult.success || !similarResult.similarities?.length) {
      state.llm_reasoning_trace?.push('No similar tickets found');

      // Update status to open
      await supabase
        .from('tickets')
        .update({ status: 'open' })
        .eq('id', state.ticketId);

      return {
        success: true,
        should_merge: false,
        decision: 'no_duplicates_found'
      };
    }

    // Check the most similar ticket
    const bestMatch = similarResult.similarities[0];

    // Apply geo and time filtering if we have coordinates
    if (ticket.lat && ticket.lon && bestMatch.ticket_data.lat && bestMatch.ticket_data.lon) {
      const candidates = findDedupCandidates(
        ticket.lat,
        ticket.lon,
        [bestMatch.ticket_data]
      );

      if (candidates.length === 0) {
        return {
          success: true,
          should_merge: false,
          decision: 'outside_geo_time_window'
        };
      }

      const candidate = candidates[0];
      const similarityScore = calculateSimilarityScore(
        bestMatch.similarity,
        candidate.distance,
        candidate.timeDiff
      );

      if (similarityScore.duplicate) {
        state.llm_reasoning_trace?.push(`Auto-merge decision: similarity=${bestMatch.similarity.toFixed(3)}, distance=${candidate.distance}m`);

        return {
          success: true,
          should_merge: true,
          parent_ticket_id: bestMatch.ticket_id,
          decision: 'auto_merge'
        };
      } else if (similarityScore.borderline) {
        // For hackathon demo, auto-merge borderline cases
        // In production, this would trigger human review
        state.llm_reasoning_trace?.push(`Borderline case auto-merged: similarity=${bestMatch.similarity.toFixed(3)}`);

        return {
          success: true,
          should_merge: true,
          parent_ticket_id: bestMatch.ticket_id,
          decision: 'borderline_auto_merge'
        };
      }
    }

    // No merge needed
    await supabase
      .from('tickets')
      .update({ status: 'open' })
      .eq('id', state.ticketId);

    return {
      success: true,
      should_merge: false,
      decision: 'similarity_below_threshold'
    };

  } catch (error) {
    console.error('Dedup agent error:', error);
    return {
      success: false,
      should_merge: false,
      decision: 'error',
      error: error instanceof Error ? error.message : 'Deduplication failed'
    };
  }
}