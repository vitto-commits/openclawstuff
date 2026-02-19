# Agent Dashboard

A clean, minimal web UI for managing OpenClaw AI agents.

## Quick Start

```bash
cd ~/agent-dashboard
npm run build    # first time only
npm run start    # starts on port 3000
# or: npx next start -p 3333
```

For development: `npm run dev`

## Features

- **📋 Task Board** — Kanban with drag-and-drop (To Do → In Progress → Done)
- **🤖 Agent Panel** — View agents, models, online status
- **📡 Activity Feed** — Real-time log of agent actions (auto-refreshes)
- **💰 Cost Tracker** — Token usage and API costs per agent
- **📁 File Upload** — Drag-and-drop files to ~/agent-dashboard/uploads/
- **🧠 Memory Viewer** — Browse agent memory files (MEMORY.md, memory/*.md)
- **💬 Quick Chat** — Send messages to agents

## Tech Stack

- Next.js 14 (App Router)
- SQLite (better-sqlite3)
- Tailwind CSS 3
- TypeScript

## Data

- Database: `~/agent-dashboard/data.db` (SQLite, created automatically)
- Uploads: `~/agent-dashboard/uploads/`
- Memory files read from: `~/.openclaw/workspace/`
