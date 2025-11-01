import { calculateDistance } from './geocoding';
import { getConfig } from './config';
import type { SimilarityResult } from '../types/index';

const config = getConfig();

/**
 * Calculate similarity score for deduplication decisions
 */
export function calculateSimilarityScore(
  textSimilarity: number,
  geoDistanceMeters: number,
  timeDifferenceHours: number
): SimilarityResult {
  // Geo factor: closer = higher score
  let geoFactor: number;
  if (geoDistanceMeters < config.GEO_RADIUS_METERS) {
    geoFactor = 1.0;
  } else if (geoDistanceMeters < config.GEO_RADIUS_METERS * 2) {
    geoFactor = 0.8;
  } else {
    geoFactor = 0.4;
  }

  // Time factor: recent = higher score
  let timeFactor: number;
  if (timeDifferenceHours < 24) {
    timeFactor = 1.0;
  } else if (timeDifferenceHours < config.TIME_WINDOW_HOURS) {
    timeFactor = 0.8;
  } else {
    timeFactor = 0.5;
  }

  // Combined score (weighted)
  const finalScore = 0.7 * textSimilarity + 0.3 * (geoFactor + timeFactor) / 2;

  // Calculate borderline threshold as 10% below the similarity threshold
  const borderlineThreshold = Math.max(0.6, config.SIMILARITY_THRESHOLD - 0.1);

  return {
    score: finalScore,
    duplicate: finalScore >= config.SIMILARITY_THRESHOLD,
    borderline: finalScore >= borderlineThreshold && finalScore < config.SIMILARITY_THRESHOLD
  };
}

/**
 * Normalize text for comparison (remove noise, standardize format)
 */
export function normalizeTextForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Create embedding text from ticket data for similarity comparison
 */
export function createEmbeddingText(
  description: string,
  category?: string,
  crossStreet?: string
): string {
  const parts = [description];

  if (category) {
    parts.push(`category: ${category}`);
  }

  if (crossStreet) {
    parts.push(`location: ${crossStreet}`);
  }

  return parts.join(' | ');
}

/**
 * Simple cosine similarity calculation for vectors
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Find candidate tickets for deduplication
 */
export function findDedupCandidates(
  ticketLat: number,
  ticketLon: number,
  allTickets: Array<{
    id: string;
    lat?: number;
    lon?: number;
    created_at: string;
    status: string;
    parent_id?: string;
  }>
): Array<{ id: string; distance: number; timeDiff: number }> {
  const candidates = [];
  const ticketTime = new Date().getTime(); // Current time for new ticket

  for (const ticket of allTickets) {
    // Skip tickets without location
    if (!ticket.lat || !ticket.lon) continue;

    // Skip closed tickets and children (only compare with potential parents)
    if (ticket.status === 'closed' || ticket.parent_id) continue;

    // Calculate distance
    const distance = calculateDistance(
      ticketLat,
      ticketLon,
      ticket.lat,
      ticket.lon
    );

    // Skip if too far away
    if (distance > config.GEO_RADIUS_METERS * 2) continue;

    // Calculate time difference
    const existingTime = new Date(ticket.created_at).getTime();
    const timeDiffHours = (ticketTime - existingTime) / (1000 * 60 * 60);

    // Skip if too old
    if (timeDiffHours > config.TIME_WINDOW_HOURS) continue;

    candidates.push({
      id: ticket.id,
      distance,
      timeDiff: timeDiffHours
    });
  }

  // Sort by combined proximity score (closer and more recent first)
  return candidates.sort((a, b) => {
    const scoreA = (1 / (a.distance + 1)) * (1 / (a.timeDiff + 1));
    const scoreB = (1 / (b.distance + 1)) * (1 / (b.timeDiff + 1));
    return scoreB - scoreA;
  });
}
