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

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  const ctype = req.headers['content-type'] || '';
  try {
    if (ctype.includes('application/json')) {
      return raw ? JSON.parse(raw) : {};
    }
    if (ctype.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
  } catch (_) {}
  return {};
}

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
    // Root: serve minimal Dashboard viewer
    if (method === 'GET' && (url === '/' || url === '/api')) {
      // Find default organization (prefer "Demo City", fallback to first)
      let defaultOrgId = null;
      try {
        const { data: demoOrg } = await adminSupabase
          .from('organizations')
          .select('id,name')
          .eq('name', 'Demo City')
          .single();
        if (demoOrg?.id) defaultOrgId = demoOrg.id;
      } catch (_) {}
      if (!defaultOrgId) {
        const { data: orgs } = await adminSupabase
          .from('organizations')
          .select('id,name')
          .order('created_at', { ascending: true })
          .limit(1);
        defaultOrgId = orgs?.[0]?.id || '';
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CivicSense – Dashboard</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;max-width:960px;margin:0 auto;background:#0b1020;color:#e5e7eb}
    h1{margin:0 0 12px}
    .muted{color:#94a3b8}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
    .card{background:#0f172a;border:1px solid #1f2937;border-radius:12px;padding:16px}
    .kpi{font-size:28px;font-weight:700;margin:4px 0}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    a{color:#93c5fd}
  </style>
  <script>
    const ORG_ID = ${JSON.stringify(defaultOrgId)};
    async function load(){
      const endpoint = ORG_ID ? '/api/dashboard/' + ORG_ID : '/api/organizations';
      const res = await fetch(endpoint);
      const data = await res.json();
      if(ORG_ID){
        const m = data.metrics || {};
        document.getElementById('org-name').textContent = data.organization?.name || ORG_ID;
        document.getElementById('kpi-open-parent').textContent = m.open_parent_tickets ?? '-';
        document.getElementById('kpi-open-total').textContent = m.total_open_tickets ?? '-';
        document.getElementById('kpi-merged').textContent = m.merged_tickets ?? '-';
        document.getElementById('kpi-critical').textContent = m.critical_open ?? '-';
        document.getElementById('kpi-reports').textContent = m.total_reports ?? '-';
        document.getElementById('kpi-sentiment').textContent = (m.avg_sentiment ?? 0).toFixed(2);
      } else {
        document.getElementById('org-name').textContent = 'No organizations found';
      }
    }
    window.addEventListener('DOMContentLoaded', load);
  </script>
</head>
<body>
  <h1>Dashboard – <span id="org-name" class="muted">Loading…</span></h1>
  <div class="row muted">
    <a href="/manual">Manual Ticket Form</a>
    <span>·</span>
    <a href="/api/organizations">Organizations JSON</a>
    <span>·</span>
    <a href="/api/health">Health</a>
  </div>
  <div class="grid">
    <div class="card"><div>Open Parent Tickets</div><div id="kpi-open-parent" class="kpi">-</div></div>
    <div class="card"><div>Total Open Tickets</div><div id="kpi-open-total" class="kpi">-</div></div>
    <div class="card"><div>Merged Tickets</div><div id="kpi-merged" class="kpi">-</div></div>
    <div class="card"><div>Critical Open</div><div id="kpi-critical" class="kpi">-</div></div>
    <div class="card"><div>Total Reports</div><div id="kpi-reports" class="kpi">-</div></div>
    <div class="card"><div>Avg Sentiment</div><div id="kpi-sentiment" class="kpi">-</div></div>
  </div>
</body>
</html>`);
    }

    // Manual ticket form moved to /manual
    if (method === 'GET' && (url === '/manual' || url === '/api/manual')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CivicSense – Manual Ticket</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;max-width:720px;margin:0 auto;background:#fafafa;color:#111}
    .card{background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
    label{display:block;font-weight:600;margin:12px 0 6px}
    input,textarea{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;font:inherit}
    button{margin-top:14px;background:#111;color:#fff;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}
    .row{display:grid;gap:12px}
  </style>
  <script>
    async function submitTicket(e){
      e.preventDefault();
      const phone=document.getElementById('from').value.trim();
      const text=document.getElementById('body').value.trim();
      const res=await fetch('/api/webhooks/sms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:phone,Body:text})});
      const ct=res.headers.get('content-type')||'';
      if(ct.includes('application/json')){const data=await res.json();alert('Submitted! '+JSON.stringify(data));}
      else{const t=await res.text();alert('Submitted! '+t)}
    }
  </script>
</head>
<body>
  <h1>Manual Ticket Submission</h1>
  <p>Use this form to create a ticket if SMS/voice/agents are down.</p>
  <div class="card">
    <form onsubmit="submitTicket(event)">
      <div class="row">
        <div>
          <label for="from">Phone (From)</label>
          <input id="from" name="From" placeholder="+15551234567" required />
        </div>
        <div>
          <label for="body">Description (Body)</label>
          <textarea id="body" name="Body" rows="5" placeholder="Describe the issue and location" required></textarea>
        </div>
      </div>
      <button type="submit">Submit Ticket</button>
    </form>
  </div>
  <p style="margin-top:16px"><a href="/">Back to Dashboard</a> · <a href="/api/health">Health</a></p>
</body>
</html>`);
    }
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
      const body = await parseRequestBody(req);
      const { From: phoneNumber, Body: messageBody } = body || {};
      if (!phoneNumber || !messageBody) {
        return res.status(400).json({ error: 'Invalid payload', message: 'Expected fields: From, Body' });
      }

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