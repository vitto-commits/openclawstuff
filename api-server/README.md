# Agent Dashboard - Standalone API Server

A lightweight Express.js server that serves all Agent Dashboard data independently. This allows the Next.js frontend to fetch from a remote or separate API instance.

## Features

- **Standalone**: Runs independently from the Next.js frontend
- **Complete API**: All endpoints from the Next.js API routes replicated
- **File Watching**: Real-time SSE (Server-Sent Events) for live data updates
- **Session Parsing**: Reads OpenClaw session JSONL files directly
- **CORS Enabled**: Allows cross-origin requests from any frontend

## API Endpoints

### Tasks
- `GET /api/tasks` — Get todo items and agent tasks
- `POST /api/tasks` — Add a todo item
- `DELETE /api/tasks` — Delete a todo item (requires `id` in body)

### Skills
- `GET /api/skills` — List all custom and built-in skills

### Agents
- `GET /api/agents` — List agent status and info
- `PUT /api/agents` — Update agent status

### Activity
- `GET /api/activity?limit=100` — Get recent activity (default: 100 items)
- `POST /api/activity` — Record an activity item

### Journal
- `GET /api/journal?date=YYYY-MM-DD` — Get daily narrative journal

### Costs
- `GET /api/costs` — Get cost breakdown by model and session
- `POST /api/costs` — Record cost data

### Files
- `GET /api/files` — List uploaded files
- `POST /api/files` — Upload a file (multipart form-data)
- `DELETE /api/files` — Delete a file (requires `name` in body)

### Memory
- `GET /api/memory` — List workspace memory files
- `GET /api/memory?file=FILENAME` — Read a specific file

### Chat
- `GET /api/chat` — Get chat history
- `POST /api/chat` — Add a chat message

### Cron
- `GET /api/cron` — List cron jobs
- `POST /api/cron` — Create a cron job
- `PUT /api/cron` — Update/toggle a cron job
- `DELETE /api/cron?id=ID` — Delete a cron job

### Events (SSE)
- `GET /api/events` — Connect to server-sent events stream
  - Events: `tasks`, `activity`, `agents`, `costs`
  - Heartbeat every 30 seconds
  - Reconnects automatically

### Health
- `GET /health` — Health check endpoint

## Installation

```bash
cd ~/agent-dashboard/api-server
npm install
npm run build
npm start
```

Or use the unified launcher:

```bash
~/agent-dashboard/start-all.sh
```

## Development

```bash
npm run dev  # Uses ts-node for instant TypeScript execution
```

## Environment Variables

- `HOME` — User home directory (defaults to /home/vtto)
- `PORT` — Server port (defaults to 3001)

The server automatically locates:
- Session files: `~/.openclaw/agents/main/sessions/*.jsonl`
- Skills: `~/.openclaw/skills/` and `~/.npm-global/lib/node_modules/openclaw/skills/`
- Data files: `~/agent-dashboard/data/`
- Uploads: `~/agent-dashboard/uploads/`
- Workspace: `~/.openclaw/workspace/`

## Usage with Next.js Frontend

### Local Development (Same Machine)

No configuration needed — frontend uses relative URLs (`/api/*`).

### Remote API (External Server)

Set the `NEXT_PUBLIC_API_URL` environment variable when building/running the frontend:

```bash
# For local testing with remote API
NEXT_PUBLIC_API_URL=http://remote-host:3001 npm run dev

# Via Cloudflare tunnel
NEXT_PUBLIC_API_URL=https://xyz.trycloudflare.com npm run dev

# Build for production with remote API
NEXT_PUBLIC_API_URL=https://api.example.com npm run build
```

## Data Flow

1. **Session Parsing**: Reads `.jsonl` files from OpenClaw sessions
2. **JSONL Parsing**: Extracts messages, tasks, costs, and activity
3. **Task Extraction**: Identifies subagent spawns and completions
4. **Cost Aggregation**: Totals tokens and costs by model
5. **Journal Generation**: Creates narrative summaries with accomplishments/problems
6. **File Watching**: Monitors sessions and data directories for changes
7. **SSE Broadcasting**: Sends updates to connected clients in real-time

## Architecture

```
┌─────────────────────────────────────┐
│  Next.js Frontend (Optional)         │
│  Uses NEXT_PUBLIC_API_URL            │
└──────────┬──────────────────────────┘
           │ HTTP(S) Requests
           ▼
┌─────────────────────────────────────┐
│  Express.js API Server (Port 3001)   │
│  ├─ Routes (11 endpoints)            │
│  ├─ File Watchers                    │
│  ├─ JSONL Parsers                    │
│  └─ SSE Stream                       │
└──────────┬──────────────────────────┘
           │
           ├─▶ Session Files (.jsonl)
           ├─▶ Data Files (JSON)
           ├─▶ Workspace Files
           └─▶ File Uploads
```

## Performance Considerations

- **Session Parsing**: Scans most recent 10 sessions for activity
- **Cost Aggregation**: Parses all sessions (expensive, cached via SSE)
- **Journal Generation**: Parses entire session logs for a date range
- **File Watching**: Debounced to 150ms to prevent excessive updates
- **Memory**: ~50-100MB typical usage

## Troubleshooting

### API server won't start

Check logs:
```bash
tail -f /tmp/agent-dashboard/api-server.log
```

Common issues:
- Port 3001 already in use: `lsof -i :3001`
- Session directory doesn't exist: Create `~/.openclaw/agents/main/sessions/`
- Permissions: Check file read permissions

### Frontend can't reach API

1. Check API server is running: `curl http://localhost:3001/health`
2. Verify `NEXT_PUBLIC_API_URL` is set correctly
3. Check CORS: API allows all origins by default
4. Check network: Firewalls, VPNs, proxies

### SSE connection drops

1. Normal on long timeouts (browsers close idle connections)
2. Browser auto-reconnects after 3 seconds
3. Fallback polling happens if SSE fails
4. Check browser console for errors

## Security Notes

- **CORS**: Currently allows all origins. For production, restrict to specific domains:
  ```javascript
  app.use(cors({ origin: 'https://your-domain.com' }));
  ```
  
- **Authentication**: No auth required. Add if exposing to untrusted networks:
  ```javascript
  app.use((req, res, next) => {
    if (!req.headers.authorization) return res.status(401).send('Unauthorized');
    next();
  });
  ```

- **File Access**: Protected by path resolution checks, but avoid running as root

## License

Same as Agent Dashboard
