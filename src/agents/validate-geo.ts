import { adminSupabase } from '../services/supabase';
import { enhancedGeocode, validateCityBounds } from '../utils/geocoding';
import type { FlowState } from '../types/index';
import type { Polygon } from 'geojson';

const supabase = adminSupabase;
interface GeoValidationResult {
  success: boolean;
  error?: string;
}

/**
 * Geo Validation Agent - Validates and geocodes ticket locations
 */
export async function validateGeoAgent(state: FlowState): Promise<GeoValidationResult> {
  try {
    if (!state.ticketId) {
      throw new Error('No ticket ID in state');
    }

    // Get ticket data
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', state.ticketId)
      .single();

    if (ticketError || !ticket) {
      throw new Error('Ticket not found');
    }

    // Skip if already has valid coordinates
    if (ticket.lat && ticket.lon) {
      state.llm_reasoning_trace?.push('Ticket already has coordinates');
      return { success: true };
    }

    // Try to geocode if we have a cross street
    if (ticket.cross_street) {
      const geoResult = await enhancedGeocode(ticket.cross_street);

      if (geoResult.success && geoResult.result) {
        // Get organization bounds
        const { data: org } = await supabase
          .from('organizations')
          .select('area_bounds')
          .eq('id', ticket.org_id ?? 'default_org_id')
          .single();

        // Validate city bounds if organization has them
        let withinBounds = true;
        if (org?.area_bounds) {
          withinBounds = await validateCityBounds(
            geoResult.result.lat,
            geoResult.result.lon,
            org.area_bounds as unknown as Polygon
          );
        }

        if (!withinBounds) {
          state.llm_reasoning_trace?.push('Location outside city bounds');
          return {
            success: false,
            error: 'Location appears to be outside the service area'
          };
        }

        // Update ticket with coordinates
        await supabase
          .from('tickets')
          .update({
            lat: geoResult.result.lat,
            lon: geoResult.result.lon,
            cross_street: geoResult.result.formatted_address
          })
          .eq('id', state.ticketId);

        state.llm_reasoning_trace?.push(`Geocoded: ${geoResult.result.formatted_address}`);
        return { success: true };
      }
    }

    // No location info or geocoding failed
    state.llm_reasoning_trace?.push('Location validation failed - no geocodable address');
    return {
      success: false,
      error: 'Please provide a specific location or cross streets'
    };

  } catch (error) {
    console.error('Geo validation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Location validation failed'
    };
  }
}
