import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');
const CHAT_LOG = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'data', 'chat-log.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface ActivityItem {
  id: string;
  agent: string;
  action: string;
  details: string;
  level: string;
  created_at: string;
  session?: string;
}

interface SupabaseActivity {
  id: string;
  agent_id?: string;
  type: string;
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}

async function fetchSupabase(method: string, path: string, body?: any) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY!,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY!}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Supabase API error: ${response.status} ${response.statusText}`);
  }

  if (method === 'DELETE' || response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

async function getSupabaseActivity(limit: number) {
  try {
    const items = await fetchSupabase('GET', `/activity?select=*&order=created_at.desc&limit=${limit}`);
    if (!Array.isArray(items)) return [];

    return items.map((a: SupabaseActivity) => ({
      id: a.id,
      agent: a.agent_id || 'main',
      action: a.type,
      details: a.content,
      level: a.metadata?.level || 'info',
      created_at: a.created_at,
    }));
  } catch (error) {
    console.error('Failed to fetch activity from Supabase:', error);
    throw error;
  }
}

function parseSessionActivity(limit: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  
  if (!fs.existsSync(SESSIONS_DIR)) return items;
  
  // Get session files sorted by modification time (newest first)
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10); // Only parse recent sessions
  
  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file.name);
    const sessionId = file.name.replace('.jsonl', '').slice(0, 8);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (entry.type === 'session') {
            items.push({
              id: entry.id,
              agent: 'main',
              action: 'Session started',
              details: `Session ${entry.id.slice(0, 8)}`,
              level: 'info',
              created_at: entry.timestamp,
              session: sessionId,
            });
          }
          
          if (entry.type === 'model_change') {
            items.push({
              id: entry.id,
              agent: 'main',
              action: 'Model changed',
              details: `${entry.provider}/${entry.modelId}`,
              level: 'info',
              created_at: entry.timestamp,
              session: sessionId,
            });
          }
          
          if (entry.type === 'message' && entry.message) {
            const msg = entry.message;
            
            if (msg.role === 'user') {
              const text = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                : String(msg.content || '');
              items.push({
                id: entry.id,
                agent: 'user',
                action: 'User message',
                details: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                level: 'info',
                created_at: entry.timestamp,
                session: sessionId,
              });
            }
            
            if (msg.role === 'assistant') {
              // Check for tool calls
              const toolCalls = Array.isArray(msg.content)
                ? msg.content.filter((c: any) => c.type === 'toolCall')
                : [];
              
              if (toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  items.push({
                    id: `${entry.id}-${tc.id}`,
                    agent: 'main',
                    action: `Tool: ${tc.name}`,
                    details: typeof tc.arguments === 'string' 
                      ? tc.arguments.slice(0, 150)
                      : JSON.stringify(tc.arguments || {}).slice(0, 150),
                    level: 'info',
                    created_at: entry.timestamp,
                    session: sessionId,
                  });
                }
              } else {
                const text = Array.isArray(msg.content)
                  ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                  : String(msg.content || '');
                if (text.trim()) {
                  items.push({
                    id: entry.id,
                    agent: 'main',
                    action: 'Assistant response',
                    details: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                    level: 'success',
                    created_at: entry.timestamp,
                    session: sessionId,
                  });
                }
              }
              
              // Log cost if available
              if (msg.usage?.cost?.total) {
                items.push({
                  id: `${entry.id}-cost`,
                  agent: 'main',
                  action: 'API cost',
                  details: `$${msg.usage.cost.total.toFixed(4)} (${msg.usage.totalTokens || 0} tokens) - ${msg.model}`,
                  level: 'info',
                  created_at: entry.timestamp,
                  session: sessionId,
                });
              }
            }
            
            if (msg.role === 'toolResult') {
              const text = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                : String(msg.content || '');
              items.push({
                id: entry.id,
                agent: 'main',
                action: `Result: ${msg.toolName || 'tool'}`,
                details: text.slice(0, 150) + (text.length > 150 ? '...' : ''),
                level: text.toLowerCase().includes('error') ? 'error' : 'info',
                created_at: entry.timestamp,
                session: sessionId,
              });
            }
          }
        } catch {}
      }
    } catch {}
  }
  
  // Also include chat log entries
  try {
    if (fs.existsSync(CHAT_LOG)) {
      const chatItems: any[] = JSON.parse(fs.readFileSync(CHAT_LOG, 'utf-8'));
      for (const c of chatItems) {
        items.push({
          id: `chat-${c.timestamp}`,
          agent: c.agent || 'user',
          action: 'Chat message',
          details: c.message,
          level: 'info',
          created_at: c.timestamp,
        });
      }
    }
  } catch {}
  
  // Sort by timestamp descending and limit
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items.slice(0, limit);
}

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100');
  
  if (useSupabase) {
    try {
      const items = await getSupabaseActivity(limit);
      return NextResponse.json(items);
    } catch (error) {
      console.error('Supabase fetch failed, falling back to local files:', error);
    }
  }

  // Fallback to local files
  const items = parseSessionActivity(limit);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  // For manually posted activity, just return ok (activity comes from real sessions now)
  return NextResponse.json({ ok: true }, { status: 201 });
}
