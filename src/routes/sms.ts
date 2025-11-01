import { Router, Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { adminSupabase } from '../services/supabase';
import { hashPhone } from '../utils/crypto';
import { checkRateLimit } from '../utils/rate-limit';
import { sendOTP } from '../services/twilio';
import { processIntakeWorkflow } from '../agents/workflow';
import { getConfig } from '../utils/config';
import type { SMSWebhookPayload } from '../types/index';
import { createMessagingResponse } from '../utils/twiloHelper';

const router = Router();
const config = getConfig();

// Twilio webhook signature validation
const validateTwilioSignature = (req: Request, res: Response, next: NextFunction) => {
  const twilioSignatureHeader = req.headers['x-twilio-signature'];
  const url = `${config.BASE_URL}${req.originalUrl}`;

  if (!twilioSignatureHeader) {
    const twiml = createMessagingResponse();
    twiml.message('Unauthorized request');
    return res.status(401).type('text/xml').send(twiml.toString());
  }

  // Handle case where header might be an array (get first value)
  const twilioSignature = Array.isArray(twilioSignatureHeader) ? twilioSignatureHeader[0] : twilioSignatureHeader;

  const isValid = twilio.validateRequest(
    config.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid && config.NODE_ENV === 'production') {
    const twiml = createMessagingResponse();
    twiml.message('Unauthorized request.');
    return res.status(401).type('text/xml').send(twiml.toString());
  }

  return next();
};

router.post('/', validateTwilioSignature, async (req: Request, res: Response) => {
  try {
    const { From, Body, MessageSid }: SMSWebhookPayload = req.body;

    // Log incoming SMS for debugging
    console.log(`SMS received - MessageSid: ${MessageSid}, From: ${From?.slice(-4)}, Length: ${Body?.length || 0}`);

    if (!From) {
      const twiml = createMessagingResponse();
      twiml.message('Missing phone number.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Validate message body
    if (!Body || Body.trim().length === 0) {
      const twiml = createMessagingResponse();
      twiml.message('Please send a message describing the issue you want to report.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Normalize and hash phone number
    const phoneHash = hashPhone(From);

    // Check rate limiting
    const rateLimitResult = await checkRateLimit(phoneHash);
    if (!rateLimitResult.allowed) {
      const twiml = createMessagingResponse();
      twiml.message(`You've reached the daily limit of ${rateLimitResult.limit} reports. Try again tomorrow.`);
      return res.type('text/xml').send(twiml.toString());
    }

    // Upsert user
    const { data: user, error: userError } = await adminSupabase
      .from('users')
      .upsert({
        phone_hash: phoneHash,
        last_active: new Date().toISOString()
      }, {
        onConflict: 'phone_hash'
      })
      .select()
      .single();

    if (userError || !user) {
      console.error('User upsert error:', userError);
      throw userError ?? new Error('User upsert failed');
    }

    // Check if user is verified
    if (!user.verified) {
      // Send OTP
      const otpResult = await sendOTP(From);
      if (!otpResult.success) {
        const twiml = createMessagingResponse();
        console.error('Failed to send OTP:', otpResult.error);
        twiml.message('We could not send a verification code. Please try again later.');
        return res.type('text/xml').send(twiml.toString());
      }

      const twiml = createMessagingResponse();
      twiml.message('Please verify your phone number. Enter the 6-digit code we just sent you.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Get organization (assuming single org for demo, expand for multi-org)
    const { data: org, error: orgError } = await adminSupabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (orgError || !org) {
      const twiml = createMessagingResponse();
      console.error('Organization fetch error:', orgError);
      twiml.message('No organization configured. Please contact support.');
      return res.type('text/xml').send(twiml.toString());
    }

    // Process the report through the agent workflow
    const workflowResult = await processIntakeWorkflow({
      userId: user.id,
      orgId: org.id,
      rawText: Body,
      channel: 'sms'
    });

    // Send confirmation response
    const twiml = createMessagingResponse();
    if (workflowResult?.success) {
      twiml.message(`Thanks! Processing your report... you'll get a ticket # shortly.`);
    } else {
      twiml.message(`We couldn't process your report: ${workflowResult?.error || 'Unknown error'}. Please try again with more details.`);
    }

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('SMS webhook error:', error);

    const twiml = createMessagingResponse();
    twiml.message('Sorry, we encountered an error processing your report. Please try again later.');
    res.type('text/xml').send(twiml.toString());
  }
});

export { router as smsRouter };
