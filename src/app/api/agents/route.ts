import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');

interface AgentInfo {
  id: string;
  name: string;
  model: string;
  status: string;
  last_active: string;
  session: string;
  provider: string;
  total_sessions: number;
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
  const agents = parseSessionFiles();
  return NextResponse.json(agents);
}

export async function PUT(req: NextRequest) {
  // Status toggle is cosmetic only for real agents
  return NextResponse.json({ ok: true });
}
