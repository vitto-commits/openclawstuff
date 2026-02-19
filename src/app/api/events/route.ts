import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');
const DATA_DIR = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'data');

// Reuse the parsing logic from existing API routes by fetching them internally
async function fetchData(type: string, baseUrl: string) {
  try {
    const url = type === 'activity' ? `${baseUrl}/api/activity?limit=100` : `${baseUrl}/api/${type}`;
    const res = await fetch(url);
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      const heartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { closed = true; }
      };

      // Debounce helper
      const debounceTimers = new Map<string, NodeJS.Timeout>();
      const debounced = (key: string, fn: () => void, ms = 150) => {
        const existing = debounceTimers.get(key);
        if (existing) clearTimeout(existing);
        debounceTimers.set(key, setTimeout(fn, ms));
      };

      const watchers: fs.FSWatcher[] = [];

      // Push all data for a given event type
      const pushEvent = async (event: string) => {
        const data = await fetchData(event === 'activity' ? 'activity' : event, baseUrl);
        if (data) send(event, data);
      };

      // Watch sessions directory
      try {
        if (fs.existsSync(SESSIONS_DIR)) {
          const w = fs.watch(SESSIONS_DIR, { recursive: false }, (_eventType, filename) => {
            if (!filename?.endsWith('.jsonl')) return;
            debounced('tasks', () => pushEvent('tasks'));
            debounced('activity', () => pushEvent('activity'));
            debounced('agents', () => pushEvent('agents'));
            debounced('costs', () => pushEvent('costs'));
          });
          watchers.push(w);
        }
      } catch {}

      // Watch data directory for todo.json, chat-log.json, cron-jobs.json
      try {
        if (fs.existsSync(DATA_DIR)) {
          const w = fs.watch(DATA_DIR, { recursive: false }, (_eventType, filename) => {
            if (!filename) return;
            if (filename === 'todo.json') {
              debounced('tasks', () => pushEvent('tasks'));
            }
            if (filename === 'chat-log.json') {
              debounced('activity', () => pushEvent('activity'));
            }
            if (filename === 'cron-jobs.json') {
              // No specific SSE event for cron, but could be activity
              debounced('activity', () => pushEvent('activity'));
            }
          });
          watchers.push(w);
        }
      } catch {}

      // Heartbeat every 30s
      const hbInterval = setInterval(heartbeat, 30000);

      // Cleanup on close
      req.signal.addEventListener('abort', () => {
        closed = true;
        for (const w of watchers) {
          try { w.close(); } catch {}
        }
        clearInterval(hbInterval);
        for (const t of debounceTimers.values()) clearTimeout(t);
        debounceTimers.clear();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
