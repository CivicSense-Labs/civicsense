import OpenAI from 'openai';
import { adminSupabase } from './supabase';
import { getConfig } from '../utils/config';
import { createEmbeddingText, cosineSimilarity } from '../utils/similarity';

const config = getConfig();
const supabase = adminSupabase;

// Vector conversion helpers.
const vectorToString = (vector: number[]): string => JSON.stringify(vector);

const stringToVector = (str: string | null): number[] => {
    if (!str) throw new Error('Invalid embedding data');
    try {
      const vector = JSON.parse(str) as number[];
      if (!Array.isArray(vector) || vector.length !== 1536) {
        throw new Error('Invalid vector format or dimensions');
      }
      return vector;
    } catch (error) {
      throw new Error('Failed to parse embedding vector');
    }
};

interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
}

interface SimilaritySearchResult {
  success: boolean;
  similarities?: SimilarityMatch[];
  error?: string;
}

interface SimilarityMatch {
  ticket_id: string;
  similarity: number;
  ticket_data?: any;
}

interface UpsertResult {
  success: boolean;
  error?: string;
}

// Initialize LLM client
let openai: OpenAI | null = null;

if (config.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
}

/**
 * Generate embeddings using OpenAI's text-embedding-ada-002 model
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
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
): Promise<UpsertResult> {
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
        embedding: vectorToString(embeddingResult.embedding!)
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
): Promise<SimilaritySearchResult> {
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

  // Try RPC function first (faster if available)
  try {
    const { data: similarities, error: searchError } = await supabase.rpc(
      'find_similar_tickets',
      {
        target_embedding: vectorToString(stringToVector(targetEmbedding.embedding)),
        similarity_threshold: threshold,
        match_limit: limit,
        exclude_ticket_id: ticketId
      }
    );

    if (!searchError && similarities) {
      return {
        success: true,
        similarities: similarities.map((s: any) => ({
          ticket_id: s.ticket_id,
          similarity: s.similarity,
          ticket_data: s.ticket_data
        }))
      };
    }
  } catch (rpcError) {
    console.log('RPC function not available, falling back to manual calculation');
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
    let targetVector: number[];
    try {
      targetVector = stringToVector(targetEmbedding.embedding);
    } catch (conversionError) {
      throw new Error('Invalid target embedding format');
    }

    for (const embedding of allEmbeddings || []) {
      // Skip child tickets (only compare with potential parents)
      if (embedding.tickets.parent_id) continue;

      try {
        // Convert and calculate - both operations can fail
        const embeddingVector = stringToVector(embedding.embedding);
        const similarity = cosineSimilarity(targetVector, embeddingVector);

        if (similarity >= threshold) {
          similarities.push({
            ticket_id: embedding.ticket_id,
            similarity,
            ticket_data: embedding.tickets
          });
        }
      } catch (conversionError) {
        console.warn(`Skipping embedding for ticket ${embedding.ticket_id}: invalid format`);
        continue;
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
  console.log('find_similar_tickets RPC function should be created via database migrations');
  // Function already exists in migrations - no dynamic creation needed
}
