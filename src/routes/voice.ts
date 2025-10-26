import { Router } from 'express';
import twilio from 'twilio';
import { adminSupabase } from '../services/supabase';
import { hashPhone } from '../utils/crypto';
import { checkRateLimit } from '../utils/rate-limit';
import { transcribeAudio } from '../services/transcription';
import { processIntakeWorkflow } from '../agents/workflow';
import { getConfig } from '../utils/config';
import type { VoiceWebhookPayload } from '../types/index.js';

const router = Router();
const config = getConfig();
const supabase = adminSupabase;

// Initial voice call webhook
router.post('/voice', async (req, res) => {
  try {
    const { From }: VoiceWebhookPayload = req.body;
    const phoneHash = hashPhone(From);

    // Check rate limiting
    const rateLimitResult = await checkRateLimit(phoneHash);
    if (!rateLimitResult.allowed) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say(`You've reached the daily limit of ${rateLimitResult.limit} reports. Please try again tomorrow.`);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Create TwiML response to record message
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Thank you for calling CivicSense. Please describe the issue you want to report after the beep.');

    twiml.record({
      action: '/webhooks/voice/recording',
      method: 'POST',
      maxLength: 120, // 2 minutes max
      finishOnKey: '#',
      transcribe: false // We'll handle transcription ourselves
    });

    twiml.say('We did not receive a recording. Please try again.');
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('Voice webhook error:', error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we encountered an error. Please try again later.');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Recording completion webhook
router.post('/voice/recording', async (req, res) => {
  try {
    const { From, RecordingUrl, CallSid } = req.body;

    if (!RecordingUrl) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('No recording was received. Please try calling again.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Normalize and hash phone number
    const phoneHash = hashPhone(From);

    // Upsert user
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        phone_hash: phoneHash,
        last_active: new Date().toISOString()
      }, {
        onConflict: 'phone_hash'
      })
      .select()
      .single();

    if (userError) {
      console.error('User upsert error:', userError);
      throw userError;
    }

    // Get organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (orgError || !org) {
      throw new Error('No organization configured');
    }

    // Transcribe the recording
    const transcription = await transcribeAudio(RecordingUrl);

    if (!transcription.success) {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('We could not process your recording. Please try calling again and speak clearly.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Process through agent workflow
    const workflowResult = await processIntakeWorkflow({
      userId: user.id,
      orgId: org.id,
      rawText: transcription.text!,
      channel: 'voice'
    });

    // Respond to caller
    const twiml = new twilio.twiml.VoiceResponse();
    if (workflowResult.success) {
      twiml.say('Thank you for your report. We are processing it and will send you updates via text message.');
    } else {
      twiml.say('We could not process your report. Please try again with more specific details about the location.');
    }
    twiml.hangup();

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('Recording processing error:', error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we encountered an error processing your report. Please try again later.');
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

export { router as voiceRouter };
