// Simple database connection test
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 Testing Supabase Connection...\n');

console.log('Configuration:');
console.log(`📍 Supabase URL: ${supabaseUrl}`);
console.log(`🔑 Anon Key: ${supabaseKey ? `${supabaseKey.substring(0, 20)}...` : '❌ Missing'}`);
console.log(`🔐 Service Key: ${serviceRoleKey ? `${serviceRoleKey.substring(0, 20)}...` : '❌ Missing'}`);
console.log('');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required Supabase credentials!');
  console.log('\n📋 To fix this:');
  console.log('1. Ask your teammate for the API keys from: https://supabase.com/dashboard/project/cwrpfyiggnoqhxoebbnj/settings/api');
  console.log('2. Update .env.local with the real keys');
  console.log('3. Run this test again: node src/db-test.js');
  process.exit(1);
}

// Test with anon key (public access)
const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    console.log('🧪 Testing basic connection...');

    // Test 1: Basic connection
    const { data, error } = await supabase.from('organizations').select('count', { count: 'exact' });

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('⚠️  Database tables not created yet (this is expected)');
        console.log('💡 You need to run the migrations first');
      } else {
        console.log('❌ Connection error:', error.message);
      }
    } else {
      console.log('✅ Connection successful!');
      console.log(`📊 Organizations table has ${data?.length || 0} records`);
    }

    // Test 2: Check if we can access auth
    console.log('\n🔒 Testing auth access...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.log('⚠️  Auth check (this is normal for anon key):', authError.message);
    } else {
      console.log('👤 User:', user ? 'Authenticated' : 'Anonymous');
    }

    // Test 3: Service role test (if available)
    if (serviceRoleKey) {
      console.log('\n🛡️  Testing service role access...');
      const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: serviceData, error: serviceError } = await serviceSupabase
        .from('organizations')
        .select('count', { count: 'exact' });

      if (serviceError) {
        if (serviceError.message.includes('does not exist')) {
          console.log('⚠️  Service role can access, but tables not created yet');
        } else {
          console.log('❌ Service role error:', serviceError.message);
        }
      } else {
        console.log('✅ Service role connection successful!');
      }
    }

    console.log('\n🎯 Next Steps:');
    console.log('1. Run migrations: supabase db push (if you have Supabase CLI)');
    console.log('2. Or ask your teammate to apply the migrations from supabase/migrations/');
    console.log('3. Then test again to see the tables working!');

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
  }
}

testConnection();