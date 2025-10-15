// Simple Express server for initial testing
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'CivicSense API is running!'
  });
});

// SMS webhook placeholder
app.post('/webhooks/sms', (req, res) => {
  console.log('📱 SMS webhook received:', req.body);
  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Message>Thanks for your report! CivicSense is processing it now. This is a demo response.</Message>
    </Response>
  `);
});

// Dashboard placeholder
app.get('/dashboard/:orgId', (req, res) => {
  res.json({
    message: 'Dashboard API placeholder',
    orgId: req.params.orgId,
    metrics: {
      open_parent_tickets: 2,
      total_open_tickets: 5,
      merged_tickets: 3,
      critical_open: 1,
      avg_sentiment: -0.1
    },
    parentTickets: [],
    recentActivity: []
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    message: 'This endpoint is not yet implemented in the demo version'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 CivicSense API server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`📱 SMS webhook: POST http://localhost:${port}/webhooks/sms`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\n🎯 This is a simplified demo server. Full TypeScript implementation is being prepared.\n');
});

export default app;