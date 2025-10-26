// Database types
export interface Organization {
  id: string;
  name: string;
  area_bounds: GeoJSON.Polygon;
  contact_email?: string;
  created_at: string;
}

export interface User {
  id: string;
  name?: string;
  phone_hash: string;
  email?: string;
  verified: boolean;
  last_active?: string;
  created_at: string;
}

export interface Ticket {
  id: string;
  org_id: string;
  parent_id?: string;
  description: string;
  category?: string;
  cross_street?: string;
  lat?: number;
  lon?: number;
  status: 'open' | 'closed' | 'pending_dedup';
  sentiment_score?: number;
  priority: 'normal' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  ticket_id: string;
  user_id?: string;
  channel: 'sms' | 'voice';
  transcript: string;
  urgency_score: number;
  created_at: string;
}

export interface TicketEmbedding {
  ticket_id: string;
  embedding: number[];
}

// Agent workflow types
export interface FlowState {
  userId: string;
  orgId: string;
  ticketId?: string;
  reportId?: string;
  llm_reasoning_trace?: string[];
  validations: {
    geo_ok: boolean;
    otp_ok: boolean;
    spam_ok: boolean;
  };
}

export interface IntakeData {
  category?: 'pothole' | 'leak' | 'noise' | 'trash' | 'other';
  description: string;
  cross_street?: string;
  lat?: number;
  lon?: number;
  urgency_score?: number;
}

export interface DedupResult {
  is_duplicate: boolean;
  parent_ticket_id?: string;
  similarity: number;
  reasons: string;
}

export interface SentimentResult {
  score: number;
  label: 'negative' | 'neutral' | 'positive';
}

// API types
export interface SMSWebhookPayload {
  From: string;
  Body: string;
  MessageSid: string;
}

export interface VoiceWebhookPayload {
  From: string;
  RecordingUrl?: string;
  CallSid: string;
}

export interface VerifyCheckPayload {
  phone: string;
  code: string;
}

// Utility types
export interface GeocodingResult {
  lat: number;
  lon: number;
  formatted_address: string;
  accuracy: 'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE';
}

export interface SimilarityResult {
  score: number;
  duplicate: boolean;
  borderline: boolean;
}

export interface RateLimitInfo {
  allowed: boolean;
  count: number;
  limit: number;
  reset_time: string;
}

// Dashboard types
export interface DashboardMetrics {
  org_id: string;
  org_name: string;
  open_parent_tickets: number;
  closed_parent_tickets: number;
  total_open_tickets: number;
  total_closed_tickets: number;
  merged_tickets: number;
  critical_open: number;
  avg_sentiment: number;
  reports_today: number;
  tickets_today: number;
}

export interface TicketSummary {
  id: string;
  org_id: string;
  parent_id?: string;
  description: string;
  category?: string;
  cross_street?: string;
  lat?: number;
  lon?: number;
  status: string;
  priority: string;
  sentiment_score?: number;
  created_at: string;
  updated_at: string;
  root_ticket_id: string;
  child_count: number;
  report_count: number;
  channels_used: string[];
  first_reported_at: string;
  last_reported_at: string;
}
