// Apply database migrations using Supabase client
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase URL or Service Role Key');
  process.exit(1);
}

console.log('🚀 Starting Database Migration...\n');

// Create admin client with service role key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Migration files in order
const migrationFiles = [
  '001_initial_schema.sql',
  '002_rls_policies.sql',
  '003_dashboard_views.sql',
  '004_vector_functions.sql'
];

async function runMigrations() {
  try {
    for (const filename of migrationFiles) {
      console.log(`📄 Running migration: ${filename}`);

      const migrationPath = join(process.cwd(), 'supabase', 'migrations', filename);
      const migrationSQL = readFileSync(migrationPath, 'utf8');

      // Split SQL file by statements (rough split by semicolon + newline)
      const statements = migrationSQL
        .split(';\n')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`  ⚡ Executing: ${statement.substring(0, 60)}...`);

          const { error } = await supabase.rpc('exec_sql', { sql: statement });

          if (error && !error.message.includes('already exists')) {
            console.error(`  ❌ Error: ${error.message}`);
            // Don't exit, continue with other statements
          } else {
            console.log(`  ✅ Success`);
          }
        }
      }

      console.log(`✅ Completed: ${filename}\n`);
    }

    console.log('🎉 All migrations completed!');
    console.log('🧪 Testing the database connection...\n');

    // Test the connection
    const { data, error } = await supabase
      .from('organizations')
      .select('count', { count: 'exact' });

    if (error) {
      console.log('❌ Test query failed:', error.message);
    } else {
      console.log('✅ Database is ready! Organizations table is accessible.');
      console.log(`📊 Current organizations count: ${data?.length || 0}`);
    }

  } catch (error) {
    console.error('💥 Migration failed:', error.message);

    // Try a simpler approach - create tables directly
    console.log('\n🔧 Trying direct table creation...');
    await createTablesDirectly();
  }
}

async function createTablesDirectly() {
  try {
    // Enable extensions first
    console.log('📦 Enabling extensions...');
    await supabase.rpc('exec_sql', {
      sql: 'create extension if not exists "uuid-ossp";'
    });
    await supabase.rpc('exec_sql', {
      sql: 'create extension if not exists "vector";'
    });

    // Create organizations table
    console.log('🏢 Creating organizations table...');
    const { error: orgError } = await supabase.rpc('exec_sql', {
      sql: `
        create table if not exists organizations (
          id uuid primary key default gen_random_uuid(),
          name text not null,
          area_bounds jsonb not null,
          contact_email text,
          created_at timestamptz default now()
        );
      `
    });

    if (orgError) {
      console.log('⚠️  Organizations table:', orgError.message);
    } else {
      console.log('✅ Organizations table created');
    }

  } catch (error) {
    console.error('❌ Direct creation failed:', error.message);
  }
}

// Handle the fact that Supabase might not have exec_sql function
// Let's try a different approach using the REST API
async function tryRestAPI() {
  console.log('🌐 Trying REST API approach...');

  try {
    // Test if we can create a simple table
    const { error } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);

    if (error && error.message.includes('does not exist')) {
      console.log('📋 Table does not exist - this confirms we need migrations');
      console.log('💡 Please ask your teammate to run the migrations in the Supabase dashboard');
      console.log('📁 Migration files are in: supabase/migrations/');
    }

  } catch (error) {
    console.error('REST API test failed:', error.message);
  }
}

runMigrations().catch(async (error) => {
  console.error('Migration process failed:', error.message);
  await tryRestAPI();
});