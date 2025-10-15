import { Router } from 'express';
import twilio from 'twilio';
import { createSupabaseClient } from '../services/supabase.js';
import { hashPhone } from '../utils/crypto.js';
import { checkRateLimit } from '../utils/rate-limit.js';
import { sendOTP } from '../services/twilio.js';
import { processIntakeWorkflow } from '../agents/workflow.js';
import { loadConfig } from '../utils/config.js';
import type { SMSWebhookPayload } from '../types/index.js';

const router = Router();
const config = loadConfig();
const supabase = createSupabaseClient();

// Twilio webhook signature validation
const validateTwilioSignature = (req: any, res: any, next: any) => {
  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${config.app.baseUrl}${req.originalUrl}`;

  if (!twilioSignature) {
    return res.status(401).json({ error: 'Missing Twilio signature' });
  }

  const isValid = twilio.validateRequest(
    config.twilio.authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid && config.app.environment === 'production') {
    return res.status(401).json({ error: 'Invalid Twilio signature' });
  }

  next();
};

router.post('/sms', validateTwilioSignature, async (req, res) => {
  try {
    const { From, Body, MessageSid }: SMSWebhookPayload = req.body;

    // Normalize and hash phone number
    const phoneHash = hashPhone(From);

    // Check rate limiting
    const rateLimitResult = await checkRateLimit(phoneHash);
    if (!rateLimitResult.allowed) {
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(`You've reached the daily limit of ${rateLimitResult.limit} reports. Try again tomorrow.`);
      return res.type('text/xml').send(twiml.toString());
    }

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

    // Check if user is verified
    if (!user.verified) {
      // Send OTP
      const otpResult = await sendOTP(From);
      if (!otpResult.success) {
        throw new Error('Failed to send OTP');
      }

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message('Please verify your phone number. Enter the 6-digit code we just sent you.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Get organization (assuming single org for demo, expand for multi-org)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .single();

    if (orgError || !org) {
      console.error('Organization fetch error:', orgError);
      throw new Error('No organization configured');
    }

    // Process the report through the agent workflow
    const workflowResult = await processIntakeWorkflow({
      userId: user.id,
      orgId: org.id,
      rawText: Body,
      channel: 'sms'
    });

    // Send confirmation response
    const twiml = new twilio.twiml.MessagingResponse();
    if (workflowResult.success) {
      twiml.message(`Thanks! Processing your report... you'll get a ticket # shortly.`);
    } else {
      twiml.message(`We couldn't process your report: ${workflowResult.error}. Please try again with more details.`);
    }

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('SMS webhook error:', error);

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Sorry, we encountered an error processing your report. Please try again later.');
    res.type('text/xml').send(twiml.toString());
  }
});

export { router as smsRouter };