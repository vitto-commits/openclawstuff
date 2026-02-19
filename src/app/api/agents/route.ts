import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface AgentInfo {
  id: string;
  name: string;
  model: string;
  status: string;
  last_active: string;
  session: string;
  provider: string;
  total_sessions: number;
  machine?: string;
}

interface SupabaseAgent {
  id: string;
  name: string;
  machine?: string;
  model?: string;
  status?: string;
  last_active?: string;
  metadata?: Record<string, any>;
  created_at: string;
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

async function getSupabaseAgents() {
  try {
    const agents = await fetchSupabase('GET', '/agents?select=*&order=last_active.desc');
    if (!Array.isArray(agents)) return [];

    return agents.map((a: SupabaseAgent) => ({
      id: a.id,
      name: a.name || 'Unknown Agent',
      model: a.model || 'unknown',
      status: a.status || 'offline',
      last_active: a.last_active || a.created_at || new Date().toISOString(),
      session: '',
      provider: a.metadata?.provider || 'unknown',
      total_sessions: a.metadata?.total_sessions || 0,
      machine: a.machine,
    }));
  } catch (error) {
    console.error('Failed to fetch agents from Supabase:', error);
    throw error;
  }
}

function parseSessionFiles(): AgentInfo[] {
  const agents = new Map<string, AgentInfo>();
  
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl')).sort();
  
  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    const sessionId = file.replace('.jsonl', '');
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      let agentId = 'main';
      let model = '';
      let provider = '';
      let lastTimestamp = '';
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (entry.timestamp) {
            if (!lastTimestamp || entry.timestamp > lastTimestamp) {
              lastTimestamp = entry.timestamp;
            }
          }
          
          if (entry.type === 'model_change') {
            model = entry.modelId || '';
            provider = entry.provider || '';
          }
          
          if (entry.type === 'message' && entry.message?.model) {
            model = entry.message.model;
            provider = entry.message.provider || provider;
          }
          
          // Check for subagent sessions
          if (entry.type === 'session' && entry.id) {
            // subagent sessions have specific patterns
          }
        } catch {}
      }
      
      const key = `${agentId}-${provider}-${model}`;
      const existing = agents.get(agentId);
      
      if (!existing || (lastTimestamp && lastTimestamp > (existing.last_active || ''))) {
        agents.set(agentId, {
          id: agentId,
          name: agentId === 'main' ? 'Main Agent' : agentId,
          model: model || 'unknown',
          provider: provider || 'unknown',
          status: isRecent(lastTimestamp) ? 'online' : 'offline',
          last_active: lastTimestamp,
          session: sessionId,
          total_sessions: (existing?.total_sessions || 0) + 1,
        });
      } else if (existing) {
        existing.total_sessions = (existing.total_sessions || 0) + 1;
      }
    } catch {}
  }
  
  // If no agents found, return a default based on known config
  if (agents.size === 0) {
    agents.set('main', {
      id: 'main',
      name: 'Main Agent',
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      status: 'online',
      last_active: new Date().toISOString(),
      session: '',
      total_sessions: 0,
    });
  }
  
  return Array.from(agents.values());
}

function isRecent(timestamp: string): boolean {
  if (!timestamp) return false;
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff < 30 * 60 * 1000; // 30 minutes
}

export async function GET() {
  if (useSupabase) {
    try {
      const agents = await getSupabaseAgents();
      return NextResponse.json(agents);
    } catch (error) {
      console.error('Supabase fetch failed, falling back to local files:', error);
    }
  }

  // Fallback to local files
  const agents = parseSessionFiles();
  return NextResponse.json(agents);
}

export async function PUT(req: NextRequest) {
  // Status toggle is cosmetic only for real agents
  return NextResponse.json({ ok: true });
}
