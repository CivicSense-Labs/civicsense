import twilio from 'twilio';
import { getConfig } from '../utils/config';

const config = getConfig();
const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

/**
 * Send OTP verification code via Twilio Verify
 */
export async function sendOTP(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  try {
    await client.verify.v2
      .services(config.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: phoneNumber, channel: 'sms' });

    return { success: true };
  } catch (error) {
    console.error('OTP send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send OTP'
    };
  }
}

/**
 * Verify OTP code via Twilio Verify
 */
export async function verifyOTP(phoneNumber: string, code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const verification = await client.verify.v2
      .services(config.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phoneNumber, code });

    return {
      success: verification.status === 'approved'
    };
  } catch (error) {
    console.error('OTP verification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify OTP'
    };
  }
}

/**
 * Send SMS message via Twilio Messaging Service
 */
export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  try {
    const message = await client.messages.create({
      to,
      body,
      messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID
    });

    return {
      success: true,
      messageSid: message.sid
    };
  } catch (error) {
    console.error('SMS send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS'
    };
  }
}
