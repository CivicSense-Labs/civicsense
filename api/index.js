// Vercel API handler - catch-all route
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// File-level runtime config removed; runtime is configured in vercel.json

export default async function handler(req, res) {
  const { method, url } = req;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Route handling
    if (url === '/health' || url === '/api/health') {
      // Health check endpoint
      const { data, error } = await supabase
        .from('organizations')
        .select('count', { count: 'exact' });

      const dbStatus = error ? 'disconnected' : 'connected';
      const dbMessage = error ? error.message : `${data?.length || 0} organizations`;

      return res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'CivicSense API is running!',
        database: {
          status: dbStatus,
          message: dbMessage
        },
        environment: process.env.NODE_ENV || 'production'
      });
    }

    if (url === '/organizations' || url === '/api/organizations') {
      // Organizations endpoint
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

      return res.json({
        organizations: organizations || [],
        count: organizations?.length || 0,
        message: organizations?.length === 0
          ? 'No organizations found. Run the database setup script first!'
          : `Found ${organizations.length} organization(s)`
      });
    }

    if (url?.includes('/dashboard/') || url?.includes('/api/dashboard/')) {
      // Dashboard endpoint
      const orgId = url.split('/dashboard/')[1] || url.split('/api/dashboard/')[1];

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

      const { data: tickets } = await adminSupabase
        .from('tickets')
        .select('*')
        .eq('org_id', orgId);

      const { data: reports } = await adminSupabase
        .from('reports')
        .select('*')
        .in('ticket_id', tickets?.map(t => t.id) || []);

      const openTickets = tickets?.filter(t => t.status === 'open') || [];
      const parentTickets = tickets?.filter(t => !t.parent_id) || [];
      const mergedTickets = tickets?.filter(t => t.parent_id) || [];
      const criticalTickets = tickets?.filter(t => t.priority === 'critical' && t.status === 'open') || [];

      const avgSentiment = tickets?.length > 0
        ? tickets.reduce((sum, t) => sum + (t.sentiment_score || 0), 0) / tickets.length
        : 0;

      return res.json({
        organization: org,
        metrics: {
          open_parent_tickets: parentTickets.length,
          total_open_tickets: openTickets.length,
          merged_tickets: mergedTickets.length,
          critical_open: criticalTickets.length,
          avg_sentiment: Number(avgSentiment.toFixed(2)),
          total_reports: reports?.length || 0
        },
        parentTickets: parentTickets.slice(0, 10),
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
    }

    if ((url === '/webhooks/sms' || url === '/api/webhooks/sms') && method === 'POST') {
      // SMS webhook endpoint
      const { From: phoneNumber, Body: messageBody } = req.body;

      const urgentKeywords = ['emergency', 'urgent', 'dangerous', 'broken', 'fire', 'flood', 'accident'];
      const negativeKeywords = ['terrible', 'awful', 'frustrated', 'angry', 'disappointed'];

      const bodyLower = messageBody.toLowerCase();
      const isUrgent = urgentKeywords.some(word => bodyLower.includes(word));
      const isNegative = negativeKeywords.some(word => bodyLower.includes(word));

      const urgencyScore = isUrgent ? 0.9 : 0.3;
      const sentimentScore = isNegative ? -0.7 : isUrgent ? -0.4 : -0.1;
      const priority = isUrgent ? 'critical' : 'normal';

      const locationMatch = messageBody.match(/on\s+([A-Za-z\s]+(?:street|st|avenue|ave|road|rd|blvd|boulevard))/i);
      const crossStreet = locationMatch ? locationMatch[1].trim() : 'Location not specified';

      const { data: org } = await adminSupabase
        .from('organizations')
        .select('id')
        .eq('name', 'Demo City')
        .single();

      if (!org) {
        throw new Error('Demo City organization not found');
      }

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

      const { data: ticket } = await adminSupabase
        .from('tickets')
        .insert({
          org_id: org.id,
          description: messageBody,
          category: 'general',
          cross_street: crossStreet,
          status: 'open',
          sentiment_score: sentimentScore,
          priority: priority,
          lat: 37.7749 + (Math.random() - 0.5) * 0.01,
          lon: -122.4194 + (Math.random() - 0.5) * 0.01
        })
        .select()
        .single();

      await adminSupabase
        .from('reports')
        .insert({
          ticket_id: ticket.id,
          user_id: user.id,
          channel: 'sms',
          transcript: messageBody,
          urgency_score: urgencyScore
        });

      const responseMessage = isUrgent
        ? `🚨 URGENT report received! Ticket #${ticket.id.slice(0,8)} created. Emergency teams notified.`
        : `✅ Report received! Ticket #${ticket.id.slice(0,8)} created. We'll investigate within 24 hours.`;

      res.setHeader('Content-Type', 'text/xml');
      return res.send(`
        <Response>
          <Message>${responseMessage}</Message>
        </Response>
      `);
    }

    // Default response
    return res.status(404).json({
      error: 'Not found',
      path: url,
      message: 'This endpoint is not implemented'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}