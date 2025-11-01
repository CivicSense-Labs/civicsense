import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { smsRouter } from './routes/sms';
import { voiceRouter } from './routes/voice';
import { verifyRouter } from './routes/verify';
import { dashboardRouter } from './routes/dashboard';
import { getConfig } from './utils/config';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const config = getConfig();

// Security / Core.
app.use(helmet());

// Cors.
app.use(
  cors({
  origin: 
    process.env.NODE_ENV === 'production'
    ? [config.BASE_URL]
    : ['http://localhost:3000', 'http://localhost:8501'], // Include Streamlit port
  credentials: true
  })
);

/**
 * IMPORTANT for Twilio:
 * Twilio sends application/x-www-form-urlencoded
 * so urlencoded MUST come before json,
 * and extended should be false for signature matching.
 */

app.use(express.urlencoded({ extended: false, limit: '2mb' }));  // <-- Twilio
app.use(express.json({ limit: '2mb' })); // <-- API/dashboard

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

/**
 * Webhook routes
 * Each webhook gets its own mount so we don't end up with /webhooks/sms/sms, etc.
 * Our route files should define router.post('/') ...
 */
app.use('/webhooks/sms', smsRouter);
app.use('/webhooks/voice', voiceRouter);

// OTP / verify.
app.use('/verify', verifyRouter);

// Dashboard / API
app.use('/dashboard', dashboardRouter);

// 500 handler
app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Start server
const port = config.PORT;
app.listen(port, () => {
  console.log(`🚀 CivicSense API server running on port ${port}`);
  console.log(`📡 SMS webhook: POST ${config.BASE_URL}/webhooks/sms`);
  console.log(`📡 Voice webhook: POST ${config.BASE_URL}/webhooks/voice`);
  console.log(`📊 Dashboard available at ${config.BASE_URL}/dashboard`);
  console.log(`🔧 Environment: ${config.NODE_ENV}`);
});

export default app;
