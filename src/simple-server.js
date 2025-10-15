// Simple Express server for initial testing
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' });
}

// Initialize Supabase clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client for backend operations (bypasses RLS)
const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint with database connectivity
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const { data, error } = await supabase
      .from('organizations')
      .select('count', { count: 'exact' });

    const dbStatus = error ? 'disconnected' : 'connected';
    const dbMessage = error ? error.message : `${data?.length || 0} organizations`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'CivicSense API is running!',
      database: {
        status: dbStatus,
        message: dbMessage
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'CivicSense API is running!',
      database: {
        status: 'error',
        message: err.message
      }
    });
  }
});

// SMS webhook with real processing
app.post('/webhooks/sms', async (req, res) => {
  console.log('📱 SMS webhook received:', req.body);

  try {
    const { From: phoneNumber, Body: messageBody } = req.body;

    // Basic sentiment analysis (simple keyword-based)
    const urgentKeywords = ['emergency', 'urgent', 'dangerous', 'broken', 'fire', 'flood', 'accident'];
    const negativeKeywords = ['terrible', 'awful', 'frustrated', 'angry', 'disappointed'];

    const bodyLower = messageBody.toLowerCase();
    const isUrgent = urgentKeywords.some(word => bodyLower.includes(word));
    const isNegative = negativeKeywords.some(word => bodyLower.includes(word));

    const urgencyScore = isUrgent ? 0.9 : 0.3;
    const sentimentScore = isNegative ? -0.7 : isUrgent ? -0.4 : -0.1;
    const priority = isUrgent ? 'critical' : 'normal';

    // Simple location extraction
    const locationMatch = messageBody.match(/on\s+([A-Za-z\s]+(?:street|st|avenue|ave|road|rd|blvd|boulevard))/i);
    const crossStreet = locationMatch ? locationMatch[1].trim() : 'Location not specified';

    // Get Demo City organization
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id')
      .eq('name', 'Demo City')
      .single();

    if (!org) {
      throw new Error('Demo City organization not found');
    }

    // Create or get user (hash phone number for privacy)
    const phoneHash = `hash_${phoneNumber.replace(/\D/g, '')}`;
    let { data: user } = await adminSupabase
      .from('users')
      .select('id')
      .eq('phone_hash', phoneHash)
      .single();

    if (!user) {
      const { data: newUser } = await adminSupabase
        .from('users')
        .insert({
          phone_hash: phoneHash,
          name: `Citizen ${phoneNumber.slice(-4)}`,
          verified: true,
          last_active: new Date().toISOString()
        })
        .select('id')
        .single();
      user = newUser;
    }

    // Create ticket
    const { data: ticket } = await adminSupabase
      .from('tickets')
      .insert({
        org_id: org.id,
        description: messageBody,
        category: 'general', // Could be enhanced with AI categorization
        cross_street: crossStreet,
        status: 'open',
        sentiment_score: sentimentScore,
        priority: priority,
        lat: 37.7749 + (Math.random() - 0.5) * 0.01, // Random nearby location for demo
        lon: -122.4194 + (Math.random() - 0.5) * 0.01
      })
      .select()
      .single();

    // Create report linked to ticket
    await adminSupabase
      .from('reports')
      .insert({
        ticket_id: ticket.id,
        user_id: user.id,
        channel: 'sms',
        transcript: messageBody,
        urgency_score: urgencyScore
      });

    console.log(`✅ Created ticket ${ticket.id} with ${priority} priority`);

    // Respond based on urgency
    const responseMessage = isUrgent
      ? `🚨 URGENT report received! Ticket #${ticket.id.slice(0,8)} created. Emergency teams notified.`
      : `✅ Report received! Ticket #${ticket.id.slice(0,8)} created. We'll investigate within 24 hours.`;

    res.set('Content-Type', 'text/xml');
    res.send(`
      <Response>
        <Message>${responseMessage}</Message>
      </Response>
    `);

  } catch (error) {
    console.error('SMS processing error:', error);
    res.set('Content-Type', 'text/xml');
    res.send(`
      <Response>
        <Message>Thanks for your report! We're processing it now. (Error: ${error.message})</Message>
      </Response>
    `);
  }
});

// Dashboard with real data
app.get('/dashboard/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;

    // Get organization info
    const { data: org, error: orgError } = await adminSupabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) {
      return res.status(404).json({
        error: 'Organization not found',
        message: orgError.message
      });
    }

    // Get ticket metrics
    const { data: tickets, error: ticketsError } = await adminSupabase
      .from('tickets')
      .select('*')
      .eq('org_id', orgId);

    const { data: reports, error: reportsError } = await adminSupabase
      .from('reports')
      .select('*')
      .in('ticket_id', tickets?.map(t => t.id) || []);

    // Calculate metrics
    const openTickets = tickets?.filter(t => t.status === 'open') || [];
    const parentTickets = tickets?.filter(t => !t.parent_id) || [];
    const mergedTickets = tickets?.filter(t => t.parent_id) || [];
    const criticalTickets = tickets?.filter(t => t.priority === 'critical' && t.status === 'open') || [];

    const avgSentiment = tickets?.length > 0
      ? tickets.reduce((sum, t) => sum + (t.sentiment_score || 0), 0) / tickets.length
      : 0;

    res.json({
      organization: org,
      metrics: {
        open_parent_tickets: parentTickets.length,
        total_open_tickets: openTickets.length,
        merged_tickets: mergedTickets.length,
        critical_open: criticalTickets.length,
        avg_sentiment: Number(avgSentiment.toFixed(2)),
        total_reports: reports?.length || 0
      },
      parentTickets: parentTickets.slice(0, 10), // Latest 10
      recentActivity: [
        ...tickets?.slice(-5).map(t => ({
          type: 'ticket_created',
          timestamp: t.created_at,
          description: `New ticket: ${t.description?.substring(0, 50)}...`
        })) || [],
        ...reports?.slice(-5).map(r => ({
          type: 'report_received',
          timestamp: r.created_at,
          description: `Report via ${r.channel}: ${r.transcript?.substring(0, 50)}...`
        })) || []
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10)
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      error: 'Failed to load dashboard',
      message: err.message
    });
  }
});

// List organizations endpoint
app.get('/organizations', async (req, res) => {
  try {
    const { data: organizations, error } = await adminSupabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        error: 'Failed to fetch organizations',
        message: error.message
      });
    }

    res.json({
      organizations: organizations || [],
      count: organizations?.length || 0,
      message: organizations?.length === 0
        ? 'No organizations found. Run the database setup script first!'
        : `Found ${organizations.length} organization(s)`
    });

  } catch (err) {
    console.error('Organizations endpoint error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
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

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🚀 CivicSense API server running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`📱 SMS webhook: POST http://localhost:${port}/webhooks/sms`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n🎯 This is a simplified demo server. Full TypeScript implementation is being prepared.\n');
  });
}

export default app;