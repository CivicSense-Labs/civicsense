import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { adminSupabase  } from '../services/supabase';
import { getConfig } from '../utils/config';
import type { FlowState, IntakeData } from '../types/index';

const config = getConfig();
const supabase = adminSupabase;

// Initialize LLM clients
let openai: OpenAI | null = null;
let anthropic: Anthropic | null = null;

if (config.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
}

if (config.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
}

// JSON Schema for intake data validation
const intakeSchema = z.object({
  category: z.enum(['pothole', 'leak', 'noise', 'trash', 'other']).optional(),
  description: z.string().min(1),
  cross_street: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  urgency_score: z.number().min(0).max(1).optional()
});

interface IntakeResult {
  success: boolean;
  ticketId?: string;
  reportId?: string;
  data?: IntakeData;
  error?: string;
}

/**
 * Intake Agent - Extracts structured data from raw SMS/voice reports
 */
export async function intakeAgent(rawText: string, state: FlowState): Promise<IntakeResult> {
  try {
    state.llm_reasoning_trace?.push('Starting intake processing');

    // Extract structured data using LLM
    const extractionResult = await extractStructuredData(rawText);
    if (!extractionResult.success) {
      return {
        success: false,
        error: extractionResult.error
      };
    }

    const intakeData = extractionResult.data!;
    state.llm_reasoning_trace?.push(`Extracted: ${JSON.stringify(intakeData)}`);

    // Create ticket record
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        org_id: state.orgId,
        description: intakeData.description,
        category: intakeData.category,
        cross_street: intakeData.cross_street,
        lat: intakeData.lat,
        lon: intakeData.lon,
        status: 'pending_dedup',
        priority: intakeData.urgency_score && intakeData.urgency_score >= config.URGENCY_CRITICAL_THRESHOLD
          ? 'critical'
          : 'normal'
      })
      .select()
      .single();

    if (ticketError) {
      console.error('Ticket creation error:', ticketError);
      throw ticketError;
    }

    // Create report record
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        ticket_id: ticket.id,
        user_id: state.userId,
        channel: rawText.length > 200 ? 'voice' : 'sms', // Heuristic
        transcript: rawText,
        urgency_score: intakeData.urgency_score || 0
      })
      .select()
      .single();

    if (reportError) {
      console.error('Report creation error:', reportError);
      throw reportError;
    }

    state.llm_reasoning_trace?.push(`Created ticket ${ticket.id} and report ${report.id}`);

    return {
      success: true,
      ticketId: ticket.id,
      reportId: report.id,
      data: intakeData
    };

  } catch (error) {
    console.error('Intake agent error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Intake processing failed'
    };
  }
}

/**
 * Extract structured data from raw text using LLM
 */
async function extractStructuredData(rawText: string): Promise<{ success: boolean; data?: IntakeData; error?: string }> {
  try {
    if (config.LLM_PROVIDER === 'anthropic' && anthropic) {
      return await extractWithAnthropic(rawText);
    } else if (config.LLM_PROVIDER === 'openai' && openai) {
      return await extractWithOpenAI(rawText);
    } else {
      throw new Error('No LLM provider configured');
    }
  } catch (error) {
    console.error('LLM extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed'
    };
  }
}

/**
 * Extract using Anthropic Claude
 */
async function extractWithAnthropic(rawText: string): Promise<{ success: boolean; data?: IntakeData; error?: string }> {
  const prompt = `Extract structured municipal issue data from this report: "${rawText}"

You are a strict JSON extractor for municipal issue intake. Extract ONLY the following fields and return valid JSON:

- category: one of "pothole", "leak", "noise", "trash", "other" (based on the issue type)
- description: clear summary of the issue (required)
- cross_street: street intersection if mentioned (e.g., "Broad & Market")
- urgency_score: number 0-1 based on severity (0.8+ for emergencies)

Do NOT invent coordinates. Return only valid JSON with no additional text.`;

  try {
    const response = await anthropic!.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    const jsonText = content.text.trim();
    const parsed = JSON.parse(jsonText);
    const validated = intakeSchema.parse(parsed);

    return {
      success: true,
      data: validated
    };

  } catch (error) {
    console.error('Anthropic extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Anthropic extraction failed'
    };
  }
}

/**
 * Extract using OpenAI with JSON mode
 */
async function extractWithOpenAI(rawText: string): Promise<{ success: boolean; data?: IntakeData; error?: string }> {
  const prompt = `Extract structured municipal issue data from this SMS/voice report. Return valid JSON only.

Report: "${rawText}"

Extract these fields:
- category: "pothole", "leak", "noise", "trash", or "other"
- description: clear summary (required)
- cross_street: street intersection if mentioned
- urgency_score: 0-1 based on severity

Return only JSON, no other text.`;

  try {
    const response = await openai!.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a JSON extractor. Return only valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const parsed = JSON.parse(content);
    const validated = intakeSchema.parse(parsed);

    return {
      success: true,
      data: validated
    };

  } catch (error) {
    console.error('OpenAI extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OpenAI extraction failed'
    };
  }
}
