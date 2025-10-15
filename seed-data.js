// Add sample data for testing
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role for inserts
);

console.log('🌱 Adding sample data to CivicSense database...\n');

async function seedData() {
  try {
    // Insert sample organization
    console.log('🏢 Creating Demo City organization...');
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: 'Demo City',
        area_bounds: {
          "type": "Polygon",
          "coordinates": [[
            [-122.4194, 37.7749],
            [-122.4094, 37.7749],
            [-122.4094, 37.7849],
            [-122.4194, 37.7849],
            [-122.4194, 37.7749]
          ]]
        },
        contact_email: 'demo@civicsense.dev'
      })
      .select()
      .single();

    if (orgError) {
      console.error('❌ Organization error:', orgError.message);
      return;
    }

    console.log('✅ Organization created:', org.name, `(ID: ${org.id})`);

    // Insert sample user
    console.log('\n👤 Creating sample user...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        name: 'Jane Citizen',
        phone_hash: 'hash_555_123_4567', // Simulated hash
        email: 'jane@example.com',
        verified: true
      })
      .select()
      .single();

    if (userError) {
      console.error('❌ User error:', userError.message);
      return;
    }

    console.log('✅ User created:', user.name, `(ID: ${user.id})`);

    // Insert sample tickets
    console.log('\n🎫 Creating sample tickets...');

    const tickets = [
      {
        org_id: org.id,
        description: 'Large pothole on Main Street near the library causing vehicle damage',
        category: 'road_maintenance',
        cross_street: 'Main St & Library Ave',
        lat: 37.7749,
        lon: -122.4194,
        status: 'open',
        priority: 'high',
        sentiment_score: -0.3
      },
      {
        org_id: org.id,
        description: 'Broken streetlight in downtown park - safety concern at night',
        category: 'utilities',
        cross_street: 'Park Ave & 2nd St',
        lat: 37.7759,
        lon: -122.4184,
        status: 'open',
        priority: 'critical',
        sentiment_score: -0.6
      },
      {
        org_id: org.id,
        description: 'Graffiti on public building needs cleanup',
        category: 'maintenance',
        cross_street: 'City Hall',
        lat: 37.7739,
        lon: -122.4204,
        status: 'open',
        priority: 'normal',
        sentiment_score: -0.1
      }
    ];

    const { data: insertedTickets, error: ticketsError } = await supabase
      .from('tickets')
      .insert(tickets)
      .select();

    if (ticketsError) {
      console.error('❌ Tickets error:', ticketsError.message);
      return;
    }

    console.log(`✅ Created ${insertedTickets.length} sample tickets`);

    // Insert sample reports
    console.log('\n📱 Creating sample reports...');

    const reports = [
      {
        ticket_id: insertedTickets[0].id,
        user_id: user.id,
        channel: 'sms',
        transcript: 'There is a huge pothole on Main Street that damaged my tire yesterday. It needs immediate attention!',
        urgency_score: 0.8
      },
      {
        ticket_id: insertedTickets[0].id,
        user_id: null, // Anonymous report
        channel: 'voice',
        transcript: 'I wanted to report the same pothole issue. Multiple cars have been affected.',
        urgency_score: 0.7
      },
      {
        ticket_id: insertedTickets[1].id,
        user_id: user.id,
        channel: 'sms',
        transcript: 'The streetlight in the park has been broken for weeks. Very dangerous at night.',
        urgency_score: 0.9
      }
    ];

    const { data: insertedReports, error: reportsError } = await supabase
      .from('reports')
      .insert(reports)
      .select();

    if (reportsError) {
      console.error('❌ Reports error:', reportsError.message);
      return;
    }

    console.log(`✅ Created ${insertedReports.length} sample reports`);

    console.log('\n🎉 Sample data setup complete!');
    console.log('📋 Summary:');
    console.log(`   • 1 organization: ${org.name}`);
    console.log(`   • 1 user: ${user.name}`);
    console.log(`   • ${insertedTickets.length} tickets (1 critical, 1 high, 1 normal priority)`);
    console.log(`   • ${insertedReports.length} reports across multiple channels`);
    console.log('\n🧪 Now you can test the endpoints:');
    console.log(`   • Health: curl localhost:3000/health`);
    console.log(`   • Organizations: curl localhost:3000/organizations`);
    console.log(`   • Dashboard: curl localhost:3000/dashboard/${org.id}`);

  } catch (error) {
    console.error('💥 Seeding failed:', error.message);
  }
}

seedData();