# CivicSense — AI‑Powered 311 & Property Issue Reporter Hackathon Scaffold

> **Goal:** Build a multi‑agent, voice/SMS reporting system that deduplicates incidents, validates locations, maintains state across agents, and ships actionable outputs tickets, merges, notifications, dashboards — all implementable in a 1‑day hackathon.

---

## 0 Elevator Pitch for judges

Residents text/call one number to report local issues potholes, leaks, noise. Our agents validate the location, dedupe near‑identical reports, create/merge tickets, and keep everyone updated. A mini dashboard shows open issues, duplicates merged, SLAs, and sentiment. Privacy guardrails and OTP verification prevent abuse.

**Live demo flow:** two users report the same pothole → system auto‑merges into a parent ticket → nightly digest SMS + a dashboard card that updates in real time.

---

## 1 Architecture at a Glance

**Channels**

* Twilio Voice → STT Whisper or provider of choice → Intake Agent
* Twilio SMS → Webhook → Intake Agent

**Core Services**

* **Intake Agent** → creates ticket/report; validates payload & location
* **Dedup/Merge Agent** → vector + geo match → merge under parent
* **Escalation/Notify Agent** → SMS confirms, org webhook updates, SLA flags
* **Sentiment/Analytics Agent** → classify tone & compute KPIs
* **Daily Update Agent** → digests to users + orgs via scheduled job

**Data & State**

* PostgreSQL Supabase for **source of truth** tickets, reports, users
* Vector store Supabase pgvector or Pinecone for similarity search
* Files optional photos later
* "Memory" = DB state + embeddings + stateless prompts that re‑hydrate from DB at each step

**Dashboards**

* Streamlit/Retool fastest reading from Postgres views

**Hosting**

* Vercel webhooks + dashboard + Supabase Edge Functions cron

---

## 2 Environment & Secrets .env template

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_VERIFY_SERVICE_SID=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_MAPS_API_KEY=
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CITY_BOUNDARY_GEOJSON_PATH=./data/city_polygon.geojson
BASE_URL=https://your-vercel-app.vercel.app
```

> Use one LLM provider in code via `LLM_PROVIDER=anthropic|openai` flag to stay portable.

---

## 3 Data Model SQL

```sql
create table organizations 
  id uuid primary key default gen_random_uuid,
  name text not null,
  area_bounds jsonb not null, -- GeoJSON polygon
  contact_email text,
  created_at timestamptz default now
;

create extension if not exists vector; -- pgvector if using Supabase

create table users 
  id uuid primary key default gen_random_uuid,
  name text,
  phone_hash text unique not null,
  email text,
  verified boolean default false,
  last_active timestamptz
;

create table tickets 
  id uuid primary key default gen_random_uuid,
  org_id uuid references organizationsid,
  parent_id uuid references ticketsid on delete set null,
  description text not null,
  category text,
  cross_street text,
  lat double precision,
  lon double precision,
  status text default 'open', -- open|closed
  sentiment_score real, -- -1 to +1
  priority text default 'normal', -- normal|high|critical
  created_at timestamptz default now,
  updated_at timestamptz default now
;

create table reports 
  id uuid primary key default gen_random_uuid,
  ticket_id uuid references ticketsid on delete cascade,
  user_id uuid references usersid on delete set null,
  channel text not null, -- 'sms' | 'voice'
  transcript text not null,
  urgency_score real default 0,
  created_at timestamptz default now
;

-- Embeddings for deduplication
create table ticket_embeddings 
  ticket_id uuid primary key references ticketsid on delete cascade,
  embedding vector1536 -- size depends on model
;

-- Daily analytics snapshot denormalized for dashboard
create table analytics_daily 
  org_id uuid references organizationsid,
  date date not null,
  total_tickets int,
  open_tickets int,
  closed_tickets int,
  avg_time_to_close real,
  top_category text,
  sentiment_avg real,
  primary key org_id, date
;
```

**Geo helpers** optional: Store `geog geographypoint` or compute distance via Haversine in queries.

---

## 4 API Endpoints Vercel serverless or Node Express

### 4.1 Twilio SMS Webhook POST `/webhooks/sms`

**In:** form‑encoded `From`, `Body`, `MessageSid`
**Out:** TwiML or 200 OK we reply via Messaging Service
**Steps:**

1. Normalize phone → hash; upsert `users`
2. If not verified → send OTP Twilio Verify → reply asking to confirm
3. If verified → call **Intake Agent** with `{ body, userId }`

**Response if verified:** `"Thanks! Processing your report… you'll get a ticket # shortly."`

### 4.2 Twilio Verify Check POST `/verify/check`

**In:** `{ phone, code }`
**Out:** `{ ok: true }` and mark user `verified=true`

### 4.3 Voice Webhook POST `/webhooks/voice`

* Return TwiML to record message; upon recording complete, call STT → Intake Agent

### 4.4 Dashboard GET `/dashboard/:orgId`

* Returns JSON for charts / or serve Streamlit/Retool separately

---

## 5 Agent Specs built from scratch

> Implement with your own LangGraph or similar nodes + custom functions. No prebuilt “agent frameworks” that solve tasks for you.

### 5.1 Intake Agent

**Input:** `{ userId, rawText, channel, orgId }`
**LLM Contract JSON schema:**

```json
{
  "type":"object",
  "properties":{
    "category": {"type":"string","enum":["pothole","leak","noise","trash","other"]},
    "description":{"type":"string"},
    "cross_street":{"type":"string"},
    "lat":{"type":"number"},
    "lon":{"type":"number"},
    "urgency_score":{"type":"number","minimum":0,"maximum":1}
  },
  "required":["description"],
  "additionalProperties":false
}
```

**Tools:**

* Geocode `cross_street` → lat/lon using Google Maps
* City boundary check: point‑in‑polygon vs `organizations.area_bounds`
  **Guardrails:** Reject if missing valid location; ask clarifying question
  **Output:** new `ticket` + `report` row temporary ‘pending_dedup’ status if desired

### 5.2 Dedup/Merge Agent

**Trigger:** new ticket or periodic task
**Logic:**

* Build embedding for ticket.description + location string
* Vector search top‑k open tickets within **R=120m**
* Compute **cosine similarity**; if `≥ 0.85` and time window `< 48h` → treat as duplicate
* Choose earliest ticket as **parent**
* Update `tickets.parent_id` for duplicates; consolidate description summary in parent
* Write merge event + notify previous reporters

### 5.3 Escalation/Notification Agent

**Rules:**

* If `urgency_score ≥ 0.8` or sentiment ≤ −0.4 → `priority=critical`
* Send SMS: `"Thanks, your report #A113 is logged under parent #P52."`
* Post webhook or push to dashboard channel for org

### 5.4 Sentiment/Analytics Agent

**Task:**

* Classify report text into sentiment in [−1, 1]
* Compute org‑level metrics and materialize into `analytics_daily`

### 5.5 Daily Update Agent Cron

**When:** nightly via Supabase Scheduled Function
**Work:**

* SMS each user with open ticket status
* Email org: open/closed counts, critical items, avg TTR

---

## 6 State & Memory Across Agents

**Single source of truth:** Postgres rows are the canonical “memory.”

**State object passed in LangGraph:**

```ts
interface FlowState {
  userId: string;
  orgId: string;
  ticketId?: string;
  reportId?: string;
  llm_reasoning_trace?: string[]; // append-only, for audit
  validations: { geo_ok: boolean; otp_ok: boolean; spam_ok: boolean };
}
```

* Each node fetches fresh DB state for `ticketId` on entry re‑hydrate pattern.
* Hand‑off uses a **Task Contract**: the downstream agent receives `{ticketId, context}` only, never raw PII.

**Event bus simple:**

* Use a `workflow_events` table or Supabase Realtime channel
* Events: `ticket.created`, `ticket.merged`, `ticket.closed`, `digest.send`

---

## 7 Guardrails & Anti‑Hallucination

1. **Constrained outputs** via JSON Schema reject/repair parsing
2. **Tool‑first design**: LLM never invents coordinates — it must call Geocode tool; if tool fails → ask user
3. **Confidence thresholds**: if similarity ∈ [0.75, 0.85, require human/second signal user confirmation or additional reporter
4. **City boundary check** mandatory to proceed
5. **Rate limiting** per phone hash; spam flags written to DB
6. **Minimal PII exposure**: only hashed phone; role‑based access for org users
7. **Trace log**: store `llm_reasoning_trace` high‑level summaries, not private chain‑of‑thought for auditability

---

## 8 Minimal Prompts seed

> Keep **short**; rely on tools + schemas. Examples for Anthropic or OpenAI JSON mode.

**Intake system:**
"""
You extract structured fields about municipal issues from short SMS/voice transcripts.

* Use the tools to geocode addresses; do not guess coordinates.
* Respond **only** with valid JSON per the provided schema.
  """

**Dedup system:**
"""
Given a new ticket and a list of candidate open tickets text + lat/lon, decide if it is a duplicate.
Return a JSON with { is_duplicate: boolean, parent_ticket_id?: string, similarity: number, reasons: string }.
"""

**Sentiment system:**
"""
Classify the sentiment of the text in range [-1,1]. Avoid location or PII in the response. Output JSON { score, label }.
"""

---

## 9 LangGraph Sketch TypeScript‑like pseudocode

```ts
const graph = graphBuilder
  .node'intake', intakeNode
  .node'validate_geo', validateGeoNode
  .node'dedup', dedupNode
  .node'merge', mergeNode
  .node'notify', notifyNode
  .edge'intake','validate_geo'
  .edgeIf'validate_geo','dedup', s => s.validations.geo_ok
  .edge'dedup','merge'
  .edge'merge','notify'
  .build;
```

Each node:

```ts
async function intakeNodes: FlowState{ /* parse JSON; insert ticket+report */ }
async function validateGeoNodes: FlowState{ /* tools.geocode + insidePolygon */ }
async function dedupNodes: FlowState{ /* embed + vector search + thresholds */ }
async function mergeNodes: FlowState{ /* parent assignment + events */ }
async function notifyNodes: FlowState{ /* SMS + dashboard push */ }
```

---

## 10 Dedup Details

* **Embedding text:** `category + description + normalized cross_street`
* **Geo gate:** only compare within **120m** and **48h** window
* **Score:** final = `0.7*similarity + 0.3*geo_time_factor`
* **Thresholds:**

  * `≥0.85` auto‑merge
  * `0.75–0.85` ask confirmation: "We have a similar report at Broad & Market from 2h ago. Merge yours with #P101? Y/N"

---

## 11 Location Validation

* Google Maps Geocode → lat/lon
* Point‑in‑polygon against `organizations.area_bounds`
* If fail → ask clarifying SMS: "We couldn't find '5th & Pine' in Newark. Can you share a nearby landmark or address?"

---

## 12 Dashboard MVP widgets

* **Counters:** Open, Closed 24h, Duplicates Merged, Critical
* **Table:** Parent tickets with child count
* **Map:** cluster of open tickets
* **Chart:** Avg time‑to‑close line, sentiment avg bar

> Streamlit reads directly from SQL views keep queries simple. Retool alternative with 3 components.

---

## 13 Daily Cron Supabase Edge Function

* Aggregate per org → upsert `analytics_daily`
* Send SMS to users with open tickets limit once/day
* Send email to `organizations.contact_email`

---

## 14 Testing & Demo Script

**Seed data**

* Org: `City of Newark` with polygon
* Two SMS:

  1. `"There's a pothole at Broad and Market."`
  2. `"Big pothole near Broad & Market by the bus stop."`

**Expected:** two reports, one parent ticket with merged duplicate, dashboard shows `child_count=2`, nightly SMS updates.

**cURL quick checks**

```bash
curl -X POST $BASE_URL/webhooks/sms -d 'From=+15551234567&Body=There is a pothole at Broad and Market'
```

---

## 15 1‑Day Build Plan Hour by Hour

* **10–11 AM** Twilio SMS webhook + Users table + OTP flow stub OK
* **11–12 PM** Tickets/Reports schema + Intake Agent JSON parse + Geocode tool
* **12–1 PM** City boundary validator + happy‑path ticket create
* **1–2 PM** Embeddings + vector search + dedup thresholds
* **2–3 PM** Merge + Notify agent SMS replies + simple dashboard table
* **3–4 PM** Sentiment pass + dashboard counters
* **4–5 PM** Scripted demo, add logs, polish messages

Cut if needed: voice, fancy charts → keep SMS + dedup rock‑solid.

---

## 16 Security & Privacy

* Phone numbers hashed at ingest; store hash only
* OTP via Twilio Verify to gate actions
* PII fields encrypted at rest if stored Supabase RLS + Vault
* Rate limiting by phone hash e.g., 5/day
* Audit table for all merges/updates with timestamps & actor

---

## 17 Risks & Fallbacks

* **Geocode failure** → request clarification; allow landmark free‑text
* **Over‑merge** → retain child reports list; allow unmerge via admin button
* **LLM variance** → constrained JSON + retry w/ temperature 0 + tool results

---

## 18 Judge‑Friendly Metrics to Surface

* # of reports merged automatically
* % tickets with verified location
* Avg response latency ms from SMS to ticket creation
* Sentiment trend over demo window

---

## 19 Implementation Stubs TypeScript‑ish

**Haversine meters**

```ts
function distMlat1,lon1,lat2,lon2{
  const R=6371e3; const toRad=d=>d*Math.PI/180;
  const dLat=toRadlat2-lat1, dLon=toRadlon2-lon1;
  const a=Math.sindLat/2**2+Math.costoRadlat1*Math.costoRadlat2*Math.sindLon/2**2;
  return 2*R*Math.asinMath.sqrta;
}
```

**Phone hashing**

```ts
import crypto from 'crypto';
const phoneHash = e164 => crypto.createHash'sha256'.updatee164.digest'hex';
```

**Similarity decision**

```ts
const DECISION = sim, meters, hours=>{
  const geo = meters<120?1:meters<250?0.8:0.4;
  const time = hours<24?1:hours<48?0.8:0.5;
  const score = 0.7*sim + 0.3*geo+time/2;
  return {score, duplicate: score>=0.85, borderline: score>=0.75 && score<0.85};
}
```

---

## 20 Hand‑Off Contract Between Agents

```json
{
  "ticketId": "uuid",
  "orgId": "uuid",
  "context": {
    "lat": 40.735,
    "lon": -74.172,
    "category": "pothole",
    "priority": "critical"
  }
}
```

* Downstream agents must **re‑hydrate** from DB by `ticketId`; do not trust upstream free‑text.

---

## 21 Stretch Goals post‑demo

* Photo uploads with vision validation detect pothole/water/leak
* Open311 connector for municipal systems
* Neighborhood “memory shards” for hyper‑local dedup
* Voice sentiment from prosody features

---

## 22 Claude Code: Scaffolding Tasks

Copy/paste these into Claude to generate boilerplate:

1. **Generate DB schema + migration scripts** for the SQL above Postgres + pgvector
2. **Create Node/Express app** with routes: `/webhooks/sms`, `/verify/check`, `/dashboard/:orgId`
3. **Implement Twilio Verify helper** and phone hashing utility
4. **Add Geocode tool** Google Maps and polygon check util
5. **Implement embedding service** provider‑selectable and vector search wrapper
6. **Write LangGraph nodes** for the 5 agents using the state interface
7. **Build Streamlit/Retool dashboard**: counters, table, map
8. **Cron function** to compute daily analytics + send digests

---

## 23 Ready‑to‑Paste Claude Prompts

**/agents/intake.prompt**
"""
SYSTEM: You are a strict JSON extractor for municipal issue intake. Use tools to geocode; never invent coordinates. If missing location, ask a single clarifying question.
SCHEMA: <paste JSON Schema from section 5.1>
OUTPUT: Only valid JSON. No prose.
"""

**/agents/dedup.prompt**
"""
SYSTEM: Decide if the new ticket is a duplicate of any candidate. Prefer the earliest ticket as parent. Return JSON { is_duplicate, parent_ticket_id, similarity, reasons }.
"""

**/agents/sentiment.prompt**
"""
SYSTEM: Score sentiment in [-1,1] and label {negative|neutral|positive}. Output JSON only.
"""

---

## 24 Definition of Done Hackathon

* SMS → ticket created with geovalidation
* Second SMS near‑identical → system merges under parent
* SMS confirmations sent; dashboard shows parent+children
* Nightly digest function runs can be forced manually and prints payloads

---

## 25 Judge Script verbatim

1. “User A texts: *There’s a pothole at Broad & Market*.”
2. “User B texts: *Big pothole near Broad & Market by the bus stop*.”
3. Show dashboard: Parent ticket `#P101`, `children=1`.
4. Trigger nightly digest → show SMS preview: *Issue still open; 2 people reported the same.*
5. Close parent ticket in admin → both users get *Resolved. Thank you!*.

---

**That’s it — tight, testable, and demo‑ready.**

---

## 26 Supabase Addendum DB, RLS, Realtime, Cron

**Why:** You chose Supabase → let’s lock in the exact setup so Claude Code can scaffold correctly.

### 26.1 Extensions & Performance

* Enable:

  * `pgvector` similarity search
  * `postgis` optional; accurate geo + indexes
  * `uuid-ossp` or use `gen_random_uuid` from `pgcrypto`
  * `pgcrypto` hashing, encryption helpers
* Indexes:

  * `create index on tickets using gist ST_SetSRIDST_MakePointlon,lat,4326;` PostGIS **or** btree on `status, created_at` and a functional index on rounded lat/lon for proximity buckets.
  * `create index on ticket_embeddings using ivfflat embedding vector_cosine_ops with lists=100;` after analyzing table

### 26.2 Column Encryption & Phone Hashing

* **Hash recommended:** store `phone_hash sha256e164` only

  ```sql
  -- helper via pgcrypto
  create or replace function sha256_hextext returns text language sql immutable as $$
    select encodedigest$1,'sha256','hex';
  $$;
  ```
* **Optional encryption:**

  ```sql
  -- example: encrypt email at rest
  alter table users add column email_enc bytea;
  -- app writes: pgp_sym_encryptemail, current_setting'app.encryption_key'
  ```

  > Store `app.encryption_key` in Supabase **Vault** and set via Postgres config.

### 26.3 Row‑Level Security RLS Policies copy‑paste

```sql
alter table users enable row level security;
alter table tickets enable row level security;
alter table reports enable row level security;

-- 1 Service role Edge Functions bypass via `auth.role = 'service_role'`
create policy "service can do all"
  on users for all using auth.role = 'service_role';
create policy "service can do all"
  on tickets for all using auth.role = 'service_role';
create policy "service can do all"
  on reports for all using auth.role = 'service_role';

-- 2 Org dashboard: org members can read only their org's data
create policy "org members read org tickets"
  on tickets for select
  using exists 
    select 1 from auth.users au
    join user_org_roles uor on uor.user_id = au.id
    where uor.org_id = tickets.org_id and au.id = auth.uid
  ;

-- 3 End users SMS reporters can read their own ticket summaries by phone hash token served by Edge Function only
-- Dashboard/API should proxy this — do NOT expose RLS directly to anonymous
```

> Add a small `user_org_rolesuser_id uuid, org_id uuid, role text` table if you need dashboard users.

### 26.4 Triggers & Timestamps

```sql
create or replace function set_updated_at returns trigger as $$
begin new.updated_at = now; return new; end; $$ language plpgsql;
create trigger t_tickets_updated before update on tickets for each row execute function set_updated_at;
```

### 26.5 Realtime Channels dashboard live updates

* Use **Supabase Realtime** on `tickets` and `reports` for events:

  * subscribe to `tickets` where `status='open'`
  * on `insert`/`update`, refresh dashboard counts and parent/child table
* Optional: write a lightweight `workflow_events` table and subscribe to it for explicit agent handoffs.

### 26.6 Edge Functions Deno & Cron

* **Functions to create:**

  * `ingest-sms` called by Express/Vercel webhook or directly by Twilio → recommended: via Vercel to centralize secrets
  * `verify-otp` server‑side Twilio Verify call
  * `daily-digest` compute `analytics_daily`, send SMS/email
  * `embed-ticket` idempotent: generate embedding & upsert `ticket_embeddings`
* **Cron:** Supabase **Scheduled Functions**

  ```toml
  # supabase/config.toml
  [functions.daily-digest.schedule]
  cron = "0 1 * * *"  # 1:00 AM UTC
  ```

### 26.7 Migrations & CLI

```bash
supabase init
supabase db start
supabase db reset   # apply migrations
supabase db diff -f init_schema  # generate migration from local changes
supabase functions new daily-digest
supabase functions serve daily-digest --env-file .env
```

### 26.8 Sample Policies for Rate Limiting log + enforce in Edge

* DB table:

```sql
create table rate_limiter 
  phone_hash text,
  day date,
  count int default 0,
  primary key phone_hash, day
;
```

* In Edge `ingest-sms`:

  * `upsert` today’s row; if `count > 5` → respond with polite limit message

### 26.9 Geo Boundary Storage

* Put the city polygon in `organizations.area_bounds` GeoJSON. In Edge, load polygon and run point‑in‑polygon check turf‑like lib or PostGIS query:

```sql
-- If using PostGIS
alter table tickets add column geog geographypoint;
update tickets set geog = ST_SetSRIDST_MakePointlon,lat,4326::geography;
-- city polygon table optional: org_geofencesorg_id uuid, geom geometry
-- check:
select ST_Containsgeom, ST_SetSRIDST_MakePoint:lon,:lat,4326 from org_geofences where org_id=:org;
```

### 26.10 Reproducible Dev Seed

```sql
insert into organizationsid,name,area_bounds values
  gen_random_uuid, 'City of Newark', '{"type":"Polygon","coordinates":[...]}'
;
-- create a couple of open tickets and reports for the demo
```

---

## 27 Claude Tasks — Supabase‑Specific

1. Generate **SQL migrations** for all tables + indexes + triggers above.
2. Create **RLS policies**: service‑role bypass, org‑member read, optional analyst role.
3. Scaffold **Edge Functions**: `daily-digest`, `embed-ticket`, `verify-otp`, `ingest-sms` with input/output JSON contracts.
4. Wire **Realtime subscriptions** in the dashboard starter Streamlit/Retool notes + simple web client snippet.
5. Implement **embedding upsert** flow: on ticket create → queue `embed-ticket` idempotent.
6. Provide a **Makefile or npm scripts**: `db:reset`, `func:serve`, `demo:seed`.

---

## 28 Extra Guardrails Supabase Context

* Never expose PII via Realtime; subscribe only to aggregated views or minimal columns.
* Keep all LLM calls inside Edge Functions/Server never from browser/Streamlit.
* Store **reasoning traces** as short bullet audit notes, not raw chain‑of‑thought.
* Add **over‑merge kill switch**: a boolean flag on parent ticket to prevent auto‑merges while under review.

---

## 29 Minimal Web Client Snippet optional

```ts
import { createClient } from '@supabase/supabase-js';
const sb = createClientimport.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY;

sb.channel'tickets'
  .on'postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, payload => {
    // refetch counters & table
  }
  .subscribe;
```

---

## 30 Final Checklist Supabase

* [ ] Extensions enabled pgvector, postgis/pgcrypto
* [ ] Migrations applied; RLS on; policies added
* [ ] Edge Functions deployed; `daily-digest` scheduled
* [ ] Realtime wired to dashboard
* [ ] Embedding ivfflat index analyzed & built after initial load
* [ ] Demo seed + judge script verified
