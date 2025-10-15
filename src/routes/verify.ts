import { Router } from 'express';
import { createSupabaseClient } from '../services/supabase.js';
import { hashPhone } from '../utils/crypto.js';
import { verifyOTP } from '../services/twilio.js';
import type { VerifyCheckPayload } from '../types/index.js';

const router = Router();
const supabase = createSupabaseClient();

router.post('/check', async (req, res) => {
  try {
    const { phone, code }: VerifyCheckPayload = req.body;

    if (!phone || !code) {
      return res.status(400).json({
        error: 'Missing required fields: phone and code'
      });
    }

    // Verify OTP with Twilio
    const verificationResult = await verifyOTP(phone, code);

    if (!verificationResult.success) {
      return res.status(400).json({
        error: 'Invalid verification code'
      });
    }

    // Update user verification status
    const phoneHash = hashPhone(phone);
    const { error: updateError } = await supabase
      .from('users')
      .update({ verified: true })
      .eq('phone_hash', phoneHash);

    if (updateError) {
      console.error('User verification update error:', updateError);
      throw updateError;
    }

    res.json({
      ok: true,
      message: 'Phone number verified successfully'
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      error: 'Verification failed'
    });
  }
});

export { router as verifyRouter };