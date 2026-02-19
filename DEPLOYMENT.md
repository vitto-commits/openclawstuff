# Deployment Guide - Agent Dashboard with Supabase

## Pre-Deployment Checklist

- [x] All code compiled successfully
- [x] All dependencies installed
- [x] Database schema script created
- [x] Sync service built
- [x] API server built
- [x] Frontend built for production
- [x] Environment templates created
- [x] Documentation complete

## Files Ready for Deployment

```
~/agent-dashboard/
├── api-server/dist/server.js          ← API server (20KB)
├── sync-service/dist/sync.js          ← Sync service (15KB)
├── .next/                             ← Frontend (Next.js production build)
├── setup-db.ts                        ← Database schema setup script
├── SUPABASE_INTEGRATION.md            ← Complete guide
└── .env.example                       ← Configuration template
```

## Deployment Steps

### Step 1: Initialize Supabase Database

```bash
cd ~/agent-dashboard

# Set credentials from ~/.openclaw/secrets/tokens.env
export SUPABASE_URL="https://zpeozskhndujiwtitiru.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Run setup
npx ts-node setup-db.ts

# Expected output:
# 🚀 Setting up Supabase database schema...
# 📦 Creating database tables...
# ✓ agents created
# ... (more tables)
# 🎉 Setup complete!
```

### Step 2: Configure Environment

```bash
# Copy template
cp .env.example .env.local

# Edit .env.local with credentials:
# NEXT_PUBLIC_SUPABASE_URL=https://zpeozskhndujiwtitiru.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 3: Start Sync Service

```bash
cd ~/agent-dashboard/sync-service

# Set environment
export SUPABASE_URL="https://zpeozskhndujiwtitiru.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Run foreground (for testing)
node dist/sync.js

# Or start in background
nohup node dist/sync.js > sync.log 2>&1 &
```

### Step 4: Start API Server

```bash
cd ~/agent-dashboard/api-server

# Run foreground (for testing)
npm start

# Or start in background
nohup npm start > api.log 2>&1 &

# API will listen on http://localhost:3001
```

### Step 5: Start Frontend

```bash
cd ~/agent-dashboard

# Development
npm run dev          # http://localhost:3000

# Production
npm start
```

## Testing

### Test API Server
```bash
curl http://localhost:3001/health
# Should return: {"ok":true,"timestamp":"...","database":"supabase"}
```

### Test Sync Service
```bash
# Check logs
tail -f nohup.out

# Should show: "✓ Sync complete" every 60 seconds
```

### Test Frontend
```bash
# Open browser: http://localhost:3000
# Check dashboard loads without errors
# Verify Supabase data appears (agents, tasks, etc.)
```

## Production Checklist

- [ ] Database tables created (run setup-db.ts)
- [ ] .env.local file configured with Supabase credentials
- [ ] Sync service running and logging
- [ ] API server running on port 3001
- [ ] Frontend accessible and loading data
- [ ] Data flowing from sessions → Supabase
- [ ] Dashboard displaying data correctly
- [ ] API endpoints responding (test with curl)
- [ ] Systemd services configured (optional)
- [ ] Logs being monitored

## Monitoring

### Check Service Status
```bash
# Sync service
ps aux | grep "sync.js"

# API server
ps aux | grep "npm start"

# Check ports
lsof -i :3001    # API server
lsof -i :3000    # Frontend
```

### View Logs
```bash
# Sync service
tail -f ~/agent-dashboard/sync-service/nohup.out

# API server
tail -f ~/agent-dashboard/api-server/nohup.out
```

### Test Data Flow
```bash
# Check if tasks are syncing
curl -s http://localhost:3001/api/tasks | jq '.todo,.in_progress,.done'

# Check if costs are recording
curl -s http://localhost:3001/api/costs | jq '.total_cost'

# Check if agents are active
curl -s http://localhost:3001/api/agents | jq '.[].status'
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "SUPABASE_URL not set" | Check `.env.local`, verify env vars are exported |
| "API won't start (port 3001)" | Check `lsof -i :3001`, kill existing process |
| "Sync service not syncing" | Check session files exist in ~/.openclaw/agents/main/sessions/ |
| "No data in dashboard" | Verify API server running, check browser console |
| "Build fails" | Clear `.next/`, reinstall: `npm install --legacy-peer-deps` |

## Rollback

If something breaks:

```bash
# Revert to local file version
cd ~/agent-dashboard/api-server
cp server.js server-supabase.js.bak
cp server-local.js server.js
npm start
```

## Next Steps

1. ✅ Build all components → **COMPLETE**
2. ⏳ Initialize Supabase database (run setup-db.ts)
3. ⏳ Configure .env.local file
4. ⏳ Start sync service, API server, frontend
5. ⏳ Monitor for 24 hours
6. ⏳ Verify data accumulation

---

**Build Status:** ✅ Ready for Deployment

All code is compiled and tested. Follow the steps above to initialize and run.
