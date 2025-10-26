import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { adminSupabase } from '../services/supabase';
import { getConfig } from '../utils/config';
import type { FlowState, SentimentResult } from '../types/index';

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

interface SentimentAnalysisResult {
  success: boolean;
  sentiment?: SentimentResult;
  error?: string;
}

/**
 * Sentiment Analysis Agent - Classifies report tone and urgency
 */
export async function sentimentAgent(state: FlowState): Promise<SentimentAnalysisResult> {
  try {
    if (!state.ticketId) {
      throw new Error('No ticket ID in state');
    }

    // Get the report text
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('transcript')
      .eq('ticket_id', state.ticketId)
      .single();

    if (reportError || !report) {
      throw new Error('Report not found');
    }

    // Analyze sentiment
    const sentimentResult = await analyzeSentiment(report.transcript);

    if (sentimentResult.success && sentimentResult.sentiment) {
      // Update ticket with sentiment score
      await supabase
        .from('tickets')
        .update({
          sentiment_score: sentimentResult.sentiment.score
        })
        .eq('id', state.ticketId);

      // Update priority if sentiment is very negative
      if (sentimentResult.sentiment.score <= config.SENTIMENT_CRITICAL_THRESHOLD) {
        await supabase
          .from('tickets')
          .update({ priority: 'critical' })
          .eq('id', state.ticketId);

        state.llm_reasoning_trace?.push('Priority escalated due to negative sentiment');
      }

      return {
        success: true,
        sentiment: sentimentResult.sentiment
      };
    }

    return sentimentResult;

  } catch (error) {
    console.error('Sentiment agent error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sentiment analysis failed'
    };
  }
}

/**
 * Analyze sentiment using configured LLM provider
 */
async function analyzeSentiment(text: string): Promise<SentimentAnalysisResult> {
  try {
    if (config.LLM_PROVIDER === 'anthropic' && anthropic) {
      return await analyzeWithAnthropic(text);
    } else if (config.LLM_PROVIDER === 'openai' && openai) {
      return await analyzeWithOpenAI(text);
    } else {
      throw new Error('No LLM provider configured');
    }
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed'
    };
  }
}

async function analyzeWithAnthropic(text: string): Promise<SentimentAnalysisResult> {
  const prompt = `Analyze the sentiment of this municipal report: "${text}"

Return JSON with:
- score: number from -1 (very negative) to +1 (very positive)
- label: "negative", "neutral", or "positive"

Focus on the emotional tone, not the issue severity. Return only JSON.`;

  try {
    const response = await anthropic!.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const result = JSON.parse(content.text.trim());
    return {
      success: true,
      sentiment: {
        score: result.score,
        label: result.label
      }
    };

  } catch (error) {
    console.error('Anthropic sentiment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Anthropic analysis failed'
    };
  }
}

async function analyzeWithOpenAI(text: string): Promise<SentimentAnalysisResult> {
  try {
    const response = await openai!.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Analyze sentiment and return JSON with score (-1 to 1) and label (negative/neutral/positive).'
        },
        {
          role: 'user',
          content: `Analyze sentiment: "${text}"`
        }
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in response');
    }

    const result = JSON.parse(content);
    return {
      success: true,
      sentiment: {
        score: result.score,
        label: result.label
      }
    };

  } catch (error) {
    console.error('OpenAI sentiment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OpenAI analysis failed'
    };
  }
}
