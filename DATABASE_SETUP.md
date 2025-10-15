# Database Setup Instructions

## Quick Setup (5 minutes)

Your teammate needs to run the database setup script in the Supabase dashboard:

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/cwrpfyiggnoqhxoebbnj/sql/new
2. Login with the account that created the project

### Step 2: Run the Setup Script
1. Copy the entire contents of `setup-database.sql`
2. Paste it into the SQL editor
3. Click "Run" button

### Step 3: Verify Success
- The script should complete without errors
- You should see: "Database setup completed successfully! 🎉"
- Tables will be created: organizations, users, tickets, reports, etc.

## What the Script Does

✅ **Extensions**: Enables UUID, crypto, and vector extensions
✅ **Tables**: Creates all 8 core tables (organizations, tickets, reports, etc.)
✅ **Security**: Sets up Row Level Security (RLS) policies
✅ **Performance**: Adds database indexes for fast queries
✅ **Sample Data**: Inserts a "Demo City" organization for testing

## Testing the Setup

After running the script, test the connection:

```bash
node src/db-test.js
```

You should see:
- ✅ Connection successful!
- ✅ Service role connection successful!
- 📊 Organizations table has 1 records

## Alternative: Manual Table Creation

If the full script fails, your teammate can create tables one by one in this order:

1. **Organizations table** (run first):
```sql
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_bounds jsonb not null,
  contact_email text,
  created_at timestamptz default now()
);
```

2. **Users table**:
```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone_hash text unique not null,
  email text,
  verified boolean default false,
  last_active timestamptz,
  created_at timestamptz default now()
);
```

3. **Continue with other tables from setup-database.sql**

## Troubleshooting

**"Permission denied" errors**:
- Make sure you're logged in as the project owner
- The service role key should have full access

**"Extension does not exist" errors**:
- Some extensions might not be enabled by default
- Try enabling them one by one in the SQL editor

**Table already exists errors**:
- Safe to ignore - the script uses `if not exists` clauses
- This means tables were partially created before

## Next Steps

Once the database is set up:
1. Run `node src/db-test.js` to verify everything works
2. The demo server (`npm run dev`) will connect to the real database
3. You can start building the AI agents and API endpoints

## Support

If you run into issues:
- Check the Supabase project logs
- Make sure you're using the correct project: `cwrpfyiggnoqhxoebbnj`
- The database URL should be: `https://cwrpfyiggnoqhxoebbnj.supabase.co`