import OpenAI from 'openai';
import axios from 'axios';
import { getConfig } from '../utils/config';

const config = getConfig();

function validateTwilioUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Only allow Twilio domains for security.
      return parsed.hostname.includes('twilio.com') ||
             parsed.hostname.includes('twiml.com') ||
             parsed.hostname.includes('amazonaws.com'); // Twilio uses AWS for storage
    } catch {
      return false;
    }
}

// OpenAI client initialization.
let openai: OpenAI | null = null;
if (config.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
}


interface TranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
}

/**
 * Transcribe audio from a URL using OpenAI Whisper API
 */
  export async function transcribeAudio(audioUrl: string): Promise<TranscriptionResult> {
    try {
      // Validate OpenAI client
      if (!openai) {
        throw new Error('OpenAI client not initialized - check API key configuration');
      }

      // Validate URL for security
      if (!validateTwilioUrl(audioUrl)) {
        throw new Error('Invalid or unauthorized audio URL');
      }

      // Download audio file with safety limits
      const response = await axios.get(audioUrl, {
        responseType: 'stream',
        timeout: 30000, // 30 second timeout
        maxContentLength: 25 * 1024 * 1024, // 25MB limit
        maxBodyLength: 25 * 1024 * 1024,
        headers: {
          'User-Agent': 'CivicSense-Transcription/1.0'
        }
      });

      // Create a temporary file-like object for the API
      const audioStream = response.data;
      audioStream.path = 'recording.wav';

      // Transcribe using Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1',
        language: 'en', // Specify English for better accuracy
        prompt: 'This is a report about a municipal issue like potholes, leaks, noise complaints, or trash problems.'
      });

      return {
        success: true,
        text: transcription.text.trim()
      };

    } catch (error) {
      console.error('Transcription error:', error);

      // Cast to any for property access - common pattern for error handling.
      const err = error as any;

      // Better error classification
      if (err.code === 'ECONNABORTED') {
        return { success: false, error: 'Audio download timeout - file too large or slow connection' };
      }
      if (err.response?.status === 403) {
        return { success: false, error: 'Audio file not accessible or expired' };
      }
      if (err.response?.status === 404) {
        return { success: false, error: 'Audio file not found' };
      }
      if (err.message?.includes('API key')) {
        return { success: false, error: 'OpenAI API configuration error' };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transcription failed'
      };
    }
}

