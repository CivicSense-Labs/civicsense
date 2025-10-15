import OpenAI from 'openai';
import axios from 'axios';
import { loadConfig } from '../utils/config.js';

const config = loadConfig();

/**
 * Transcribe audio from a URL using OpenAI Whisper API
 */
export async function transcribeAudio(audioUrl: string): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    if (!config.llm.openaiApiKey) {
      throw new Error('OpenAI API key not configured for transcription');
    }

    const openai = new OpenAI({
      apiKey: config.llm.openaiApiKey
    });

    // Download audio file
    const response = await axios.get(audioUrl, {
      responseType: 'stream',
      timeout: 30000
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed'
    };
  }
}

/**
 * Alternative transcription using Anthropic Claude for text processing
 * (if we need to process already transcribed text)
 */
export async function enhanceTranscription(rawText: string): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    // This could be used to clean up or enhance transcribed text
    // For now, just return the original text
    return {
      success: true,
      text: rawText.trim()
    };
  } catch (error) {
    console.error('Transcription enhancement error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Enhancement failed'
    };
  }
}