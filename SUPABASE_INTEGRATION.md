# Agent Dashboard - Supabase Integration

This document describes the Supabase integration for the Agent Dashboard. The dashboard now uses Supabase as a central database instead of local files, allowing for cloud-based data persistence and real-time sync capabilities.

## Architecture

```
Local Agent Session Files (JSONL)
    ↓
    ├─→ Sync Service (sync.ts)
    │     ├─ Reads new entries every 60s
    │     ├─ Parses tasks, costs, activity
    │     └─ Pushes to Supabase
    │
    ├─→ API Server (api-server/server.ts)
    │     ├─ Queries Supabase for tasks, costs, activity, journal, agents
    │     ├─ Reads local files for skills, memory, chat, cron
    │     └─ Exposes REST API on port 3001
    │
    └─→ Frontend (Next.js)
          ├─ Queries API server for all data
          ├─ Uses Supabase client for real-time subscriptions (optional)
          └─ Renders dashboard at localhost:3000
```

## Database Schema

### agents
- `id` (UUID) - Primary key
- `name` (text) - Agent name (e.g., "otto")
- `machine` (text) - Machine name/hostname
- `model` (text) - Default model (e.g., "anthropic/claude-haiku-4-5")
- `status` (text) - online/offline
- `last_active` (timestamptz) - Last activity timestamp
- `metadata` (jsonb) - Extra fields (provider, session_count, etc.)
- `created_at` (timestamptz) - Creation timestamp

**Indexes:** name, status

### tasks
- `id` (UUID) - Primary key
- `label` (text) - Task title
- `description` (text) - Task details
- `status` (text) - todo/in_progress/done/failed
- `agent_id` (UUID) - Foreign key to agents
- `model` (text) - Model used
- `duration_seconds` (int) - Time taken
- `created_at` (timestamptz) - Creation timestamp
- `completed_at` (timestamptz) - Completion timestamp
- `metadata` (jsonb) - Extra fields

**Indexes:** agent_id, status, created_at

### activity
- `id` (UUID) - Primary key
- `agent_id` (UUID) - Foreign key to agents
- `type` (text) - chat/tool/subagent/error/model_change
- `content` (text) - Activity description
- `created_at` (timestamptz) - Activity timestamp
- `metadata` (jsonb) - Extra fields

**Indexes:** agent_id, created_at

### costs
- `id` (UUID) - Primary key
- `agent_id` (UUID) - Foreign key to agents
- `model` (text) - Model name
- `input_tokens` (bigint) - Input token count
- `output_tokens` (bigint) - Output token count
- `cache_tokens` (bigint) - Cache token count
- `cost_usd` (numeric) - Calculated cost
- `session_id` (text) - Session identifier
- `created_at` (timestamptz) - Timestamp

**Indexes:** agent_id, created_at, session_id

### journal_entries
- `id` (UUID) - Primary key
- `date` (date) - Journal date
- `agent_id` (UUID) - Foreign key to agents
- `tags` (text[]) - Tags array
- `accomplishments` (text[]) - Completed tasks
- `problems` (text[]) - Issues encountered
- `struggles` (text[]) - Struggles/learning
- `stats` (jsonb) - Metrics/statistics
- `created_at` (timestamptz) - Entry timestamp

**Unique constraint:** (date, agent_id)
**Indexes:** agent_id, date

### files
- `id` (UUID) - Primary key
- `name` (text) - File name
- `path` (text) - Local file path
- `size_bytes` (bigint) - File size
- `uploaded_by` (UUID) - Foreign key to agents
- `created_at` (timestamptz) - Upload timestamp

**Indexes:** uploaded_by, created_at

## Components

### 1. Setup Script (`setup-supabase.sh`)

Automates the initial setup:

```bash
./setup-supabase.sh
```

**What it does:**
- Validates Supabase credentials
- Installs npm dependencies (frontend, API, sync service)
- Runs the database schema setup script
- Builds the API server
- Shows next steps

**Requirements:**
- `SUPABASE_URL` environment variable
- `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY` environment variable

### 2. Database Setup Script (`scripts/setup-supabase-db.ts`)

Creates the Supabase database schema and initializes the default agent:

```bash
cd scripts
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm exec ts-node setup-supabase-db.ts
```

**Features:**
- Uses Supabase JS client to create tables
- Fallback SQL method if RPC unavailable
- Creates all required indexes
- Inserts default "otto" agent
- Handles idempotent creation (safe to run multiple times)

### 3. Sync Service (`sync-service/sync.ts`)

Background service that bridges local session files to Supabase:

```bash
cd sync-service
npm install
npm run build
SUPABASE_URL=... SUPABASE_ANON_KEY=... node dist/sync.js
```

**What it does:**
- Reads session JSONL files every 60 seconds
- Parses new entries since last sync
- Extracts and pushes to Supabase:
  - **Tasks**: Subagent spawns and completions
  - **Activity**: Tool usage, chat, errors
  - **Costs**: Model usage and pricing
  - **Journal**: Daily automated entries
- Maintains sync state in `data/sync-state.json`
- Updates agent `last_active` timestamp

**Running as systemd service:**

```bash
# Create service file
sudo cat > /etc/systemd/user/agent-dashboard-sync.service << 'EOF'
[Unit]
Description=Agent Dashboard Sync Service
After=network.target

[Service]
Type=simple
User=vtto
WorkingDirectory=/home/vtto/agent-dashboard
Environment="SUPABASE_URL=https://..."
Environment="SUPABASE_ANON_KEY=..."
ExecStart=/usr/bin/node /home/vtto/agent-dashboard/sync-service/dist/sync.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Enable and start
systemctl --user enable agent-dashboard-sync
systemctl --user start agent-dashboard-sync

# View logs
journalctl --user -u agent-dashboard-sync -f
```

### 4. API Server (`api-server/server.ts`)

Express.js server providing REST API endpoints backed by Supabase:

```bash
cd api-server
npm install
npm run build
npm start
```

**Endpoints:**
- `GET /health` - Health check
- `GET /api/tasks` - Get all tasks (from Supabase)
- `POST /api/tasks` - Create task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/agents` - Get all agents
- `PUT /api/agents/:id` - Update agent
- `GET /api/activity` - Get activity log (from Supabase)
- `POST /api/activity` - Log activity
- `GET /api/costs` - Get cost data (from Supabase)
- `POST /api/costs` - Record cost
- `GET /api/journal` - Get journal entries (from Supabase)
- `GET /api/files` - List uploaded files (from Supabase)
- `POST /api/files` - Upload file
- `DELETE /api/files/:id` - Delete file
- `GET /api/skills` - List available skills (local files)
- `GET /api/memory` - Get workspace memory files (local)
- `GET /api/chat` - Get chat history (local)
- `POST /api/chat` - Save chat message
- `GET /api/cron` - Get cron jobs (local)
- `POST /api/cron` - Create cron job
- `DELETE /api/cron/:id` - Delete cron job
- `GET /api/events` - Server-Sent Events stream

**Data sources:**
- **Supabase**: tasks, agents, activity, costs, journal_entries, files
- **Local files**: skills, memory, chat, cron jobs

### 5. Supabase Client (`src/lib/supabase.ts`)

Initializes the Supabase client for the Next.js frontend:

```typescript
import { supabase } from '@/lib/supabase';

// Use for client-side operations
const { data: tasks } = await supabase
  .from('tasks')
  .select('*')
  .eq('status', 'done');
```

**Environment variables:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key

### 6. Frontend API Utilities (`src/lib/api.ts`)

Wrapper around the API server endpoints (unchanged from previous implementation):

```typescript
import { apiJson } from '@/lib/api';

// Fetch tasks from API server
const tasks = await apiJson('/api/tasks');

// Post new task
const newTask = await apiJson('/api/tasks', {
  method: 'POST',
  body: JSON.stringify({ label: 'My task' })
});
```

## Setup Instructions

### 1. Get Supabase Credentials

From `~/.openclaw/secrets/tokens.env`:

```bash
source ~/.openclaw/secrets/tokens.env
echo "URL: $SUPABASE_URL"
echo "KEY: $SUPABASE_ANON_KEY"
```

### 2. Run Setup Script

```bash
cd ~/agent-dashboard
./setup-supabase.sh
```

### 3. Create Environment File

```bash
cp .env.example .env.local
```

Edit `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://zpeozskhndujiwtitiru.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4. Start Services

**Terminal 1 - Sync Service:**

```bash
cd ~/agent-dashboard/sync-service
npm run build
SUPABASE_URL=https://zpeozskhndujiwtitiru.supabase.co \
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
node dist/sync.js
```

**Terminal 2 - API Server:**

```bash
cd ~/agent-dashboard/api-server
npm start
```

**Terminal 3 - Frontend:**

```bash
cd ~/agent-dashboard
npm run dev
```

### 5. Access Dashboard

Open http://localhost:3000 in your browser.

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Integrate Supabase"
git push
```

### 2. Connect to Vercel

```bash
npm i -g vercel
vercel link
```

### 3. Set Environment Variables

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# Paste the values when prompted
```

### 4. Deploy

```bash
vercel deploy --prod
```

### 5. Deploy Sync Service & API Server

Option A: Deploy to Railway, Render, or other Node.js host:

```bash
# Copy api-server and sync-service to host
# Set environment variables on host
# Run: npm install && npm run build && npm start
```

Option B: Use Cloudflare Workers:

```bash
# Adapt API server to Cloudflare Workers format
# Deploy with `wrangler deploy`
```

## Common Issues & Solutions

### "Supabase URL not set"

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-key-here
```

### "Could not connect to database"

- Check Supabase project is active
- Verify credentials are correct
- Ensure RLS policies allow reads/writes (or disable RLS for testing)

### "Sync service not running"

- Check sync logs: `journalctl --user -u agent-dashboard-sync -f`
- Verify session files exist: `ls ~/.openclaw/agents/main/sessions/`
- Manually test sync: `SUPABASE_URL=... SUPABASE_ANON_KEY=... node sync-service/dist/sync.js`

### "API server port 3001 in use"

```bash
# Kill existing process
lsof -i :3001 | grep node | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=3002 npm start
```

### "Frontend can't reach Supabase"

- Check `NEXT_PUBLIC_SUPABASE_URL` is set correctly
- Check browser console for CORS errors
- Verify Supabase RLS policies

## Data Flow Example: Model Usage

1. **Local Session:** Agent runs model, logs to JSONL with `input_tokens`, `output_tokens`
2. **Sync Service:** Reads JSONL entry, calculates cost, inserts into `costs` table
3. **API Server:** Query `/api/costs` returns aggregated cost data
4. **Frontend:** Dashboard displays cost breakdown by model
5. **Vercel:** User views dashboard, cost data comes from Supabase via API server

## Best Practices

### RLS (Row Level Security)

For production, enable RLS on all tables:

```sql
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- etc.

-- Create policies (example for authenticated users)
CREATE POLICY "Users can see own data" ON tasks
  FOR SELECT USING (agent_id = auth.uid());
```

### Backups

Enable automated backups in Supabase dashboard (Settings → Backups).

### Monitoring

- Watch Supabase metrics (queries, storage, auth)
- Monitor sync service logs
- Check API server error logs
- Review cost trends in dashboard

### Security

- Keep `SUPABASE_SERVICE_KEY` secret (never commit to git)
- Use `SUPABASE_ANON_KEY` for public frontend
- Rotate keys periodically
- Enable RLS in production
- Use API server authentication if exposed publicly

## Next Steps

1. ✅ Database schema created
2. ✅ Sync service running
3. ✅ API server serving Supabase data
4. ✅ Frontend connected
5. 🔄 Optional: Set up real-time subscriptions with Supabase Realtime
6. 🔄 Optional: Add Supabase Auth for multi-user access
7. 🔄 Optional: Deploy to production

## Support

- Supabase Docs: https://supabase.com/docs
- API Reference: https://supabase.com/docs/reference/javascript
- Discord: https://discord.supabase.io
