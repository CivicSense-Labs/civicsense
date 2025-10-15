import axios from 'axios';
import { loadConfig } from './config.js';
import type { GeocodingResult } from '../types/index.js';

const config = loadConfig();

/**
 * Geocode an address or cross-street using Google Maps API
 */
export async function geocodeAddress(address: string): Promise<{ success: boolean; result?: GeocodingResult; error?: string }> {
  try {
    if (!config.googleMaps.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = {
      address,
      key: config.googleMaps.apiKey,
      region: 'us', // Bias towards US results
      language: 'en'
    };

    const response = await axios.get(url, {
      params,
      timeout: 10000
    });

    if (response.data.status !== 'OK') {
      return {
        success: false,
        error: `Geocoding failed: ${response.data.status}`
      };
    }

    const result = response.data.results[0];
    if (!result) {
      return {
        success: false,
        error: 'No geocoding results found'
      };
    }

    return {
      success: true,
      result: {
        lat: result.geometry.location.lat,
        lon: result.geometry.location.lng,
        formatted_address: result.formatted_address,
        accuracy: result.geometry.location_type
      }
    };

  } catch (error) {
    console.error('Geocoding error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Geocoding failed'
    };
  }
}

/**
 * Validate that a point is within a city's boundary
 */
export async function validateCityBounds(
  lat: number,
  lon: number,
  cityBoundsGeoJSON: GeoJSON.Polygon
): Promise<boolean> {
  try {
    // Simple point-in-polygon check using ray casting algorithm
    const point: [number, number] = [lon, lat]; // GeoJSON uses [lon, lat] format
    const polygon = cityBoundsGeoJSON.coordinates[0]; // First ring (exterior)

    let inside = false;
    let j = polygon.length - 1;

    for (let i = 0; i < polygon.length; i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      if (((yi > point[1]) !== (yj > point[1])) &&
          (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
      j = i;
    }

    return inside;

  } catch (error) {
    console.error('City bounds validation error:', error);
    // Return true on error to avoid blocking legitimate reports
    return true;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Enhanced geocoding that tries multiple strategies
 */
export async function enhancedGeocode(input: string): Promise<{ success: boolean; result?: GeocodingResult; suggestions?: string[]; error?: string }> {
  // Try direct geocoding first
  let result = await geocodeAddress(input);
  if (result.success) {
    return result;
  }

  // Try adding city context if not present
  if (!input.toLowerCase().includes('newark')) {
    const withCity = `${input}, Newark, NJ`;
    result = await geocodeAddress(withCity);
    if (result.success) {
      return result;
    }
  }

  // Try cross-street variations
  const crossStreetPatterns = [
    input.replace(/\band\b/gi, ' & '),
    input.replace(/\b&\b/g, ' and '),
    input.replace(/\bst\b/gi, ' street'),
    input.replace(/\bave\b/gi, ' avenue'),
    input.replace(/\brd\b/gi, ' road'),
    input.replace(/\bbvd\b/gi, ' boulevard')
  ];

  for (const pattern of crossStreetPatterns) {
    if (pattern !== input) {
      result = await geocodeAddress(pattern);
      if (result.success) {
        return result;
      }
    }
  }

  return {
    success: false,
    error: 'Could not geocode location',
    suggestions: [
      'Try including cross streets (e.g., "Broad & Market")',
      'Include the full street name (e.g., "Broad Street & Market Street")',
      'Add a nearby landmark or address'
    ]
  };
}