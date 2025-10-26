import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { adminSupabase } from './supabase';
import { getConfig } from '../utils/config';
import { createEmbeddingText, cosineSimilarity } from '../utils/similarity';
import type { TicketEmbedding } from '../types/index';

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

/**
 * Generate embeddings using OpenAI's text-embedding-ada-002 model
 */
export async function generateEmbedding(text: string): Promise<{ success: boolean; embedding?: number[]; error?: string }> {
  try {
    if (!openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.substring(0, 8000), // Limit to avoid token limit
    });

    return {
      success: true,
      embedding: response.data[0].embedding
    };

  } catch (error) {
    console.error('Embedding generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate embedding'
    };
  }
}

/**
 * Store or update ticket embedding in the database
 */
export async function upsertTicketEmbedding(
  ticketId: string,
  description: string,
  category?: string,
  crossStreet?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create embedding text
    const embeddingText = createEmbeddingText(description, category, crossStreet);

    // Generate embedding
    const embeddingResult = await generateEmbedding(embeddingText);
    if (!embeddingResult.success) {
      throw new Error(embeddingResult.error);
    }

    // Store in database
    const { error } = await supabase
      .from('ticket_embeddings')
      .upsert({
        ticket_id: ticketId,
        embedding: embeddingResult.embedding
      }, {
        onConflict: 'ticket_id'
      });

    if (error) {
      console.error('Embedding upsert error:', error);
      throw error;
    }

    return { success: true };

  } catch (error) {
    console.error('Ticket embedding upsert error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upsert embedding'
    };
  }
}

/**
 * Find similar tickets using vector similarity search
 */
export async function findSimilarTickets(
  ticketId: string,
  threshold: number = 0.7,
  limit: number = 10
): Promise<{
  success: boolean;
  similarities?: Array<{
    ticket_id: string;
    similarity: number;
    ticket_data?: any;
  }>;
  error?: string;
}> {
  try {
    // Get the embedding for the target ticket
    const { data: targetEmbedding, error: embeddingError } = await supabase
      .from('ticket_embeddings')
      .select('embedding')
      .eq('ticket_id', ticketId)
      .single();

    if (embeddingError || !targetEmbedding) {
      throw new Error('Target ticket embedding not found');
    }

    // Use Supabase's vector similarity search if available
    if (supabase.sql) {
      const { data: similarities, error: searchError } = await supabase.rpc(
        'find_similar_tickets',
        {
          target_embedding: targetEmbedding.embedding,
          similarity_threshold: threshold,
          match_limit: limit,
          exclude_ticket_id: ticketId
        }
      );

      if (searchError) {
        console.error('Vector search error:', searchError);
        // Fall back to manual similarity calculation
      } else if (similarities) {
        return {
          success: true,
          similarities: similarities.map((s: any) => ({
            ticket_id: s.ticket_id,
            similarity: s.similarity,
            ticket_data: s.ticket_data
          }))
        };
      }
    }

    // Fallback: Manual similarity calculation
    const { data: allEmbeddings, error: allError } = await supabase
      .from('ticket_embeddings')
      .select(`
        ticket_id,
        embedding,
        tickets!inner (
          id,
          org_id,
          description,
          category,
          status,
          parent_id,
          lat,
          lon,
          created_at
        )
      `)
      .neq('ticket_id', ticketId)
      .eq('tickets.status', 'open');

    if (allError) {
      throw allError;
    }

    const similarities = [];
    const targetVector = targetEmbedding.embedding;

    for (const embedding of allEmbeddings || []) {
      // Skip child tickets (only compare with potential parents)
      if (embedding.tickets.parent_id) continue;

      const similarity = cosineSimilarity(targetVector, embedding.embedding);

      if (similarity >= threshold) {
        similarities.push({
          ticket_id: embedding.ticket_id,
          similarity,
          ticket_data: embedding.tickets
        });
      }
    }

    // Sort by similarity (highest first)
    similarities.sort((a, b) => b.similarity - a.similarity);

    return {
      success: true,
      similarities: similarities.slice(0, limit)
    };

  } catch (error) {
    console.error('Similar tickets search error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to find similar tickets'
    };
  }
}

/**
 * Create the vector similarity search function in Supabase
 * This should be called during database setup
 */
export async function createSimilaritySearchFunction(): Promise<void> {
  const sqlFunction = `
    create or replace function find_similar_tickets(
      target_embedding vector(1536),
      similarity_threshold float default 0.7,
      match_limit int default 10,
      exclude_ticket_id uuid default null
    )
    returns table (
      ticket_id uuid,
      similarity float,
      ticket_data json
    )
    language sql
    as $$
      select
        te.ticket_id,
        1 - (te.embedding <=> target_embedding) as similarity,
        to_json(t.*) as ticket_data
      from ticket_embeddings te
      join tickets t on t.id = te.ticket_id
      where
        t.status = 'open'
        and t.parent_id is null
        and (exclude_ticket_id is null or te.ticket_id != exclude_ticket_id)
        and 1 - (te.embedding <=> target_embedding) >= similarity_threshold
      order by te.embedding <=> target_embedding
      limit match_limit;
    $$;
  `;

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: sqlFunction });
    if (error) {
      console.error('Function creation error:', error);
    }
  } catch (error) {
    console.error('Failed to create similarity search function:', error);
  }
}
