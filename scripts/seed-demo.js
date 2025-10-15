import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../src/utils/config.js';
import { hashPhone } from '../src/utils/crypto.js';
import fs from 'fs/promises';

const config = loadConfig();
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

// Newark, NJ boundary (simplified polygon for demo)
const NEWARK_BOUNDS = {
  "type": "Polygon",
  "coordinates": [[
    [-74.17, 40.735],
    [-74.17, 40.775],
    [-74.14, 40.775],
    [-74.14, 40.735],
    [-74.17, 40.735]
  ]]
};

async function seedDemoData() {
  console.log('🌱 Seeding demo data...');

  try {
    // 1. Create organization
    console.log('Creating organization...');
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .upsert({
        name: 'City of Newark',
        area_bounds: NEWARK_BOUNDS,
        contact_email: 'admin@newark.gov'
      }, {
        onConflict: 'name'
      })
      .select()
      .single();

    if (orgError) throw orgError;
    console.log(`✅ Created organization: ${org.name}`);

    // 2. Create demo users
    console.log('Creating demo users...');
    const demoUsers = [
      { phone: '+15551234567', name: 'Alice Johnson' },
      { phone: '+15559876543', name: 'Bob Smith' }
    ];

    const users = [];
    for (const userData of demoUsers) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .upsert({
          phone_hash: hashPhone(userData.phone),
          name: userData.name,
          verified: true,
          last_active: new Date().toISOString()
        }, {
          onConflict: 'phone_hash'
        })
        .select()
        .single();

      if (userError) throw userError;
      users.push(user);
    }
    console.log(`✅ Created ${users.length} demo users`);

    // 3. Create demo tickets and reports
    console.log('Creating demo tickets and reports...');

    // First report - pothole at Broad & Market
    const { data: ticket1, error: ticket1Error } = await supabase
      .from('tickets')
      .insert({
        org_id: org.id,
        description: 'Large pothole at the intersection causing damage to vehicles',
        category: 'pothole',
        cross_street: 'Broad Street & Market Street',
        lat: 40.7589,
        lon: -74.1677,
        status: 'open',
        priority: 'normal',
        sentiment_score: -0.2
      })
      .select()
      .single();

    if (ticket1Error) throw ticket1Error;

    const { error: report1Error } = await supabase
      .from('reports')
      .insert({
        ticket_id: ticket1.id,
        user_id: users[0].id,
        channel: 'sms',
        transcript: 'There\'s a pothole at Broad and Market. It\'s pretty big and damaging cars.',
        urgency_score: 0.6
      });

    if (report1Error) throw report1Error;

    // Second report - similar pothole (should merge)
    const { data: ticket2, error: ticket2Error } = await supabase
      .from('tickets')
      .insert({
        org_id: org.id,
        description: 'Big pothole near Broad & Market by the bus stop causing issues',
        category: 'pothole',
        cross_street: 'Broad Street & Market Street',
        lat: 40.7589,
        lon: -74.1677,
        status: 'open',
        priority: 'normal',
        parent_id: ticket1.id, // Manually merge for demo
        sentiment_score: -0.4
      })
      .select()
      .single();

    if (ticket2Error) throw ticket2Error;

    const { error: report2Error } = await supabase
      .from('reports')
      .insert({
        ticket_id: ticket2.id,
        user_id: users[1].id,
        channel: 'sms',
        transcript: 'Big pothole near Broad & Market by the bus stop. Almost damaged my tire!',
        urgency_score: 0.7
      });

    if (report2Error) throw report2Error;

    // Additional tickets for variety
    const additionalTickets = [
      {
        description: 'Broken streetlight on Central Avenue creating safety hazard',
        category: 'other',
        cross_street: 'Central Avenue & Springfield Avenue',
        lat: 40.7505,
        lon: -74.1735,
        priority: 'high',
        sentiment_score: -0.6,
        transcript: 'The streetlight has been out for weeks on Central Ave. It\'s really dangerous at night.'
      },
      {
        description: 'Overflowing trash bins on Park Place need immediate attention',
        category: 'trash',
        cross_street: 'Park Place & Halsey Street',
        lat: 40.7448,
        lon: -74.1694,
        priority: 'normal',
        sentiment_score: -0.1,
        transcript: 'The garbage bins on Park Place are overflowing. Pretty gross.'
      },
      {
        description: 'Water leak visible on sidewalk near City Hall',
        category: 'leak',
        cross_street: 'Broad Street & Market Street',
        lat: 40.7370,
        lon: -74.1727,
        priority: 'critical',
        sentiment_score: 0.1,
        transcript: 'Water is leaking onto the sidewalk near City Hall. Should be checked out.'
      }
    ];

    for (let i = 0; i < additionalTickets.length; i++) {
      const ticketData = additionalTickets[i];

      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          org_id: org.id,
          description: ticketData.description,
          category: ticketData.category,
          cross_street: ticketData.cross_street,
          lat: ticketData.lat,
          lon: ticketData.lon,
          status: 'open',
          priority: ticketData.priority,
          sentiment_score: ticketData.sentiment_score
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      const { error: reportError } = await supabase
        .from('reports')
        .insert({
          ticket_id: ticket.id,
          user_id: users[i % users.length].id,
          channel: 'sms',
          transcript: ticketData.transcript,
          urgency_score: ticketData.priority === 'critical' ? 0.9 : 0.5
        });

      if (reportError) throw reportError;
    }

    console.log(`✅ Created ${additionalTickets.length + 2} demo tickets`);

    // 4. Compute initial analytics
    console.log('Computing initial analytics...');
    const { error: analyticsError } = await supabase
      .rpc('compute_daily_analytics');

    if (analyticsError) {
      console.warn('Analytics computation failed:', analyticsError);
    } else {
      console.log('✅ Initial analytics computed');
    }

    console.log('🎉 Demo data seeded successfully!');
    console.log('\nDemo scenario:');
    console.log('- Organization: City of Newark');
    console.log('- Users: Alice Johnson, Bob Smith');
    console.log('- Tickets: 5 total (1 parent with 1 merged child, 3 individual)');
    console.log('- Categories: pothole, other, trash, leak');
    console.log('- Ready for testing SMS workflow and dashboard');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoData();
}

export { seedDemoData };