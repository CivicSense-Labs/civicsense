import { adminSupabase } from '../services/supabase';
import { intakeAgent } from './intake';
import { validateGeoAgent } from './validate-geo';
import { dedupAgent } from './dedup';
import { mergeAgent } from './merge';
import { notifyAgent } from './notify';
import { sentimentAgent } from './sentiment';
import type { FlowState } from '../types/index';

const supabase = adminSupabase;

interface WorkflowInput {
  userId: string;
  orgId: string;
  rawText: string;
  channel: 'sms' | 'voice';
}

export interface WorkflowResult {
  success: boolean;
  ticketId?: string;
  error?: string;
  reasoning?: string[];
}

/**
 * Main workflow orchestrator for processing intake reports
 * Implements a simplified LangGraph-like state management pattern
 */
export async function processIntakeWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  // Initialize flow state
  const state: FlowState = {
    userId: input.userId,
    orgId: input.orgId,
    llm_reasoning_trace: [],
    validations: {
      geo_ok: false,
      otp_ok: true, // Assumed true at this point since user is verified
      spam_ok: true  // Rate limiting already checked
    }
  };

  try {
    // Log workflow start
    state.llm_reasoning_trace?.push(`Starting intake workflow for ${input.channel} report`);

    // Step 1: Intake Agent - Parse and extract structured data
    const intakeResult = await intakeAgent(input.rawText, state);
    if (!intakeResult.success) {
      return {
        success: false,
        error: intakeResult.error,
        reasoning: state.llm_reasoning_trace
      };
    }

    state.ticketId = intakeResult.ticketId;
    state.reportId = intakeResult.reportId;
    state.llm_reasoning_trace?.push(`Intake completed: ticket ${intakeResult.ticketId}`);

    // Step 2: Geo Validation Agent - Validate location
    const geoResult = await validateGeoAgent(state);
    if (!geoResult.success) {
      return {
        success: false,
        error: geoResult.error,
        reasoning: state.llm_reasoning_trace
      };
    }

    state.validations.geo_ok = true;
    state.llm_reasoning_trace?.push('Location validation passed');

    // Step 3: Sentiment Analysis Agent - Classify sentiment
    const sentimentResult = await sentimentAgent(state);
    if (sentimentResult.success) {
      state.llm_reasoning_trace?.push(`Sentiment analysis: ${sentimentResult.sentiment?.label}`);
    }

    // Step 4: Deduplication Agent - Find similar tickets
    const dedupResult = await dedupAgent(state);
    state.llm_reasoning_trace?.push(`Dedup check: ${dedupResult.decision}`);

    // Step 5: Merge Agent (if duplicate found)
    if (dedupResult.success && dedupResult.should_merge && dedupResult.parent_ticket_id) {
      const mergeResult = await mergeAgent(state, dedupResult.parent_ticket_id);
      if (mergeResult.success) {
        state.llm_reasoning_trace?.push(`Merged with parent ticket ${dedupResult.parent_ticket_id}`);
      }
    }

    // Step 6: Notification Agent - Send confirmations
    const notifyResult = await notifyAgent(state, {
      merged: dedupResult.should_merge,
      parentTicketId: dedupResult.parent_ticket_id,
      channel: input.channel
    });

    if (notifyResult.success) {
      state.llm_reasoning_trace?.push('Notifications sent');
    }

    // Log workflow completion
    await logWorkflowEvent(state.ticketId!, 'workflow.completed', {
      steps_completed: ['intake', 'geo_validation', 'sentiment', 'dedup', 'merge', 'notify'],
      final_state: state.validations,
      reasoning_trace: state.llm_reasoning_trace
    });

    return {
      success: true,
      ticketId: state.ticketId,
      reasoning: state.llm_reasoning_trace
    };

  } catch (error) {
    console.error('Workflow error:', error);

    // Log workflow failure
    if (state.ticketId) {
      await logWorkflowEvent(state.ticketId, 'workflow.failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reasoning_trace: state.llm_reasoning_trace
      });
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Workflow failed',
      reasoning: state.llm_reasoning_trace
    };
  }
}

/**
 * Log workflow events for debugging and audit trail
 */
async function logWorkflowEvent(
  ticketId: string,
  eventType: string,
  payload: any
): Promise<void> {
  try {
    await supabase
      .from('workflow_events')
      .insert({
        ticket_id: ticketId,
        event_type: eventType,
        payload,
        processed: false
      });
  } catch (error) {
    console.error('Failed to log workflow event:', error);
    // Don't throw - logging failures shouldn't break the workflow
  }
}

/**
 * Re-process tickets that failed during workflow
 * Used by background jobs to retry failed processing
 */
export async function reprocessFailedTickets(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  try {
    // Get tickets that failed processing
    const { data: failedEvents, error } = await supabase
      .from('workflow_events')
      .select(`
        ticket_id,
        payload,
        tickets!inner (
          id,
          org_id,
          status,
          reports!inner (
            user_id,
            channel,
            transcript
          )
        )
      `)
      .eq('event_type', 'workflow.failed')
      .eq('processed', false)
      .limit(10); // Process in batches

    if (error) {
      throw error;
    }

    for (const event of failedEvents || []) {
      try {
        const ticket = event.tickets;
        const report = ticket.reports[0]; // Get first report

        // Retry the workflow
        const result = await processIntakeWorkflow({
          userId: report.user_id ?? '',
          orgId: ticket.org_id ?? '',
          rawText: report.transcript,
          channel: report.channel as 'sms' | 'voice'
        });

        if (result.success) {
          processed++;
          // Mark event as processed
          await supabase
            .from('workflow_events')
            .update({ processed: true })
            .eq('ticket_id', event.ticket_id as string)
            .eq('event_type', 'workflow.failed');
        } else {
          failed++;
        }

      } catch (retryError) {
        console.error(`Failed to reprocess ticket ${event.ticket_id}:`, retryError);
        failed++;
      }
    }

  } catch (error) {
    console.error('Failed to reprocess tickets:', error);
  }

  return { processed, failed };
}
