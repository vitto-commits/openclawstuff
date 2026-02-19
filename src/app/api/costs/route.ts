import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface CostEntry {
  agent: string;
  model: string;
  provider: string;
  total_input: number;
  total_output: number;
  cache_read: number;
  cache_write: number;
  total_cost: number;
  sessions: number;
  messages: number;
}

interface SupabaseCost {
  id: string;
  agent_id?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_tokens?: number;
  cost_usd: number;
  session_id?: string;
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

async function getSupabaseCosts() {
  try {
    const costs = await fetchSupabase('GET', '/costs?select=*&order=created_at.desc');
    if (!Array.isArray(costs)) return { byModel: [], bySession: [] };

    const modelMap = new Map<string, CostEntry>();
    const sessionMap = new Map<string, any>();

    for (const cost of costs) {
      const model = cost.model || 'unknown';
      const key = model;

      if (modelMap.has(key)) {
        const entry = modelMap.get(key)!;
        entry.total_input += cost.input_tokens || 0;
        entry.total_output += cost.output_tokens || 0;
        entry.cache_read += cost.cache_tokens || 0;
        entry.total_cost += cost.cost_usd || 0;
        entry.messages += 1;
      } else {
        modelMap.set(key, {
          agent: cost.agent_id || 'main',
          model,
          provider: 'anthropic', // Default provider
          total_input: cost.input_tokens || 0,
          total_output: cost.output_tokens || 0,
          cache_read: cost.cache_tokens || 0,
          cache_write: 0,
          total_cost: cost.cost_usd || 0,
          sessions: 1,
          messages: 1,
        });
      }

      // Track sessions
      if (cost.session_id) {
        if (!sessionMap.has(cost.session_id)) {
          sessionMap.set(cost.session_id, {
            id: cost.session_id.slice(0, 8),
            model,
            cost: 0,
            tokens: 0,
            messages: 0,
            timestamp: cost.created_at,
          });
        }
        const session = sessionMap.get(cost.session_id)!;
        session.cost += cost.cost_usd || 0;
        session.tokens += (cost.input_tokens || 0) + (cost.output_tokens || 0) + (cost.cache_tokens || 0);
        session.messages += 1;
      }
    }

    return {
      byModel: Array.from(modelMap.values()).sort((a, b) => b.total_cost - a.total_cost),
      bySession: Array.from(sessionMap.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    };
  } catch (error) {
    console.error('Failed to fetch costs from Supabase:', error);
    throw error;
  }
}

function parseCosts(): { byModel: CostEntry[]; bySession: any[] } {
  const modelMap = new Map<string, CostEntry>();
  const sessionList: any[] = [];
  
  if (!fs.existsSync(SESSIONS_DIR)) return { byModel: [], bySession: [] };
  
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
  
  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    const sessionId = file.replace('.jsonl', '');
    
    let sessionCost = 0;
    let sessionTokens = 0;
    let sessionModel = '';
    let sessionTimestamp = '';
    let msgCount = 0;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (entry.type === 'session' && entry.timestamp) {
            sessionTimestamp = entry.timestamp;
          }
          
          if (entry.type === 'message' && entry.message?.usage) {
            const msg = entry.message;
            const usage = msg.usage;
            const model = msg.model || 'unknown';
            const provider = msg.provider || 'unknown';
            sessionModel = model;
            msgCount++;
            
            const inputTokens = usage.input || 0;
            const outputTokens = usage.output || 0;
            const cacheRead = usage.cacheRead || 0;
            const cacheWrite = usage.cacheWrite || 0;
            const cost = usage.cost?.total || 0;
            
            sessionCost += cost;
            sessionTokens += usage.totalTokens || (inputTokens + outputTokens + cacheRead + cacheWrite);
            
            const key = `${provider}/${model}`;
            const existing = modelMap.get(key);
            if (existing) {
              existing.total_input += inputTokens;
              existing.total_output += outputTokens;
              existing.cache_read += cacheRead;
              existing.cache_write += cacheWrite;
              existing.total_cost += cost;
              existing.messages += 1;
            } else {
              modelMap.set(key, {
                agent: 'main',
                model,
                provider,
                total_input: inputTokens,
                total_output: outputTokens,
                cache_read: cacheRead,
                cache_write: cacheWrite,
                total_cost: cost,
                sessions: 0,
                messages: 1,
              });
            }
          }
        } catch {}
      }
      
      if (msgCount > 0) {
        // Increment session count for the primary model used
        const key = `${sessionModel ? 'anthropic' : 'unknown'}/${sessionModel}`;
        for (const [k, v] of modelMap) {
          if (k.includes(sessionModel)) {
            v.sessions += 1;
            break;
          }
        }
        
        sessionList.push({
          id: sessionId.slice(0, 8),
          model: sessionModel,
          cost: sessionCost,
          tokens: sessionTokens,
          messages: msgCount,
          timestamp: sessionTimestamp,
        });
      }
    } catch {}
  }
  
  return {
    byModel: Array.from(modelMap.values()).sort((a, b) => b.total_cost - a.total_cost),
    bySession: sessionList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
  };
}

export async function GET() {
  if (useSupabase) {
    try {
      const data = await getSupabaseCosts();
      return NextResponse.json(data);
    } catch (error) {
      console.error('Supabase fetch failed, falling back to local files:', error);
    }
  }

  // Fallback to local files
  const data = parseCosts();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true }, { status: 201 });
}
