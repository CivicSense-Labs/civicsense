import { Config } from '../types/index.js';

export function loadConfig(): Config {
  const requiredEnvVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  // Check for required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const config: Config = {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID!,
      authToken: process.env.TWILIO_AUTH_TOKEN!,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID!
    },
    llm: {
      provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'anthropic',
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    },
    supabase: {
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
    },
    googleMaps: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY!
    },
    app: {
      baseUrl: process.env.BASE_URL || 'http://localhost:3000',
      port: parseInt(process.env.PORT || '3000'),
      environment: process.env.NODE_ENV || 'development'
    },
    agents: {
      similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.85'),
      geoRadiusMeters: parseInt(process.env.GEO_RADIUS_METERS || '120'),
      timeWindowHours: parseInt(process.env.TIME_WINDOW_HOURS || '48'),
      urgencyCriticalThreshold: parseFloat(process.env.URGENCY_CRITICAL_THRESHOLD || '0.8'),
      sentimentCriticalThreshold: parseFloat(process.env.SENTIMENT_CRITICAL_THRESHOLD || '-0.4')
    }
  };

  return config;
}