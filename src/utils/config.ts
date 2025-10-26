import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object( {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),

    //Twilio.
    TWILIO_ACCOUNT_SID: z.string(),
    TWILIO_AUTH_TOKEN: z.string(),
    TWILIO_MESSAGING_SERVICE_SID: z.string(),
    TWILIO_VERIFY_SERVICE_SID: z.string(),

    // OPEN AI / ANTHROPIC.
    OPENAI_API_KEY: z.string().min(10),
    ANTHROPIC_API_KEY: z.string().optional(),

    // LLM.
    LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),

    // Agent thresholds (with reasonable defaults):
    URGENCY_CRITICAL_THRESHOLD: z.coerce.number().default(0.8),
    SIMILARITY_THRESHOLD: z.coerce.number().default(0.85),
    GEO_RADIUS_METERS: z.coerce.number().default(120),
    TIME_WINDOW_HOURS: z.coerce.number().default(48),
    SENTIMENT_CRITICAL_THRESHOLD: z.coerce.number().default(-0.4),

    // Supabase.
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

    // Google Maps.
    GOOGLE_MAPS_API_KEY: z.string(),

    // BaseURL.
    BASE_URL: z.string().url().default(
    process.env.NODE_ENV === 'production'
      ? 'https://your-app.vercel.app'
      : 'http://localhost:3000'
  ),

});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  cached = parsed.data;
  return parsed.data;
}
