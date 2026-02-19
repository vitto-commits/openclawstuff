import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');

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
  const data = parseCosts();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true }, { status: 201 });
}
