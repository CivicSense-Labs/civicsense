import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { smsRouter } from './routes/sms.js';
import { voiceRouter } from './routes/voice.js';
import { verifyRouter } from './routes/verify.js';
import { dashboardRouter } from './routes/dashboard.js';
import { loadConfig } from './utils/config.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const config = loadConfig();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [config.app.baseUrl]
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
    environment: config.app.environment
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
const port = config.app.port;
app.listen(port, () => {
  console.log(`🚀 CivicSense API server running on port ${port}`);
  console.log(`📊 Dashboard available at ${config.app.baseUrl}/dashboard`);
  console.log(`🔧 Environment: ${config.app.environment}`);
});

export default app;