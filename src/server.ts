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

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [config.BASE_URL]
    : ['http://localhost:3000', 'http://localhost:8501'], // Include Streamlit port
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// API routes
app.use('/webhooks', smsRouter);
app.use('/webhooks', voiceRouter);
app.use('/verify', verifyRouter);
app.use('/dashboard', dashboardRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

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
  console.log(`📊 Dashboard available at ${config.BASE_URL}/dashboard`);
  console.log(`🔧 Environment: ${config.NODE_ENV}`);
});

export default app;
