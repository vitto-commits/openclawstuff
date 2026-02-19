import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'data');
const CHAT_LOG = path.join(DATA_DIR, 'chat-log.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readChatLog(): any[] {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(CHAT_LOG, 'utf-8'));
  } catch {
    return [];
  }
}

function writeChatLog(items: any[]) {
  ensureDataDir();
  fs.writeFileSync(CHAT_LOG, JSON.stringify(items, null, 2));
}

export async function GET() {
  try {
    return NextResponse.json(readChatLog());
  } catch (error) {
    // Return empty list if chat history is not available (e.g., on Vercel)
    return NextResponse.json({
      items: [],
      local_only: true,
      message: 'Chat history is stored locally. This endpoint is not available on Vercel.'
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = readChatLog();
    
    const entry = {
      agent: body.agent || 'unknown',
      message: body.message,
      timestamp: new Date().toISOString(),
    };
    
    items.push(entry);
    
    // Keep last 500 messages
    if (items.length > 500) items.splice(0, items.length - 500);
    
    writeChatLog(items);
    
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    // If local storage is not available, return error but don't crash
    return NextResponse.json({ 
      ok: false, 
      local_only: true,
      message: 'Chat history storage not available on this environment'
    }, { status: 201 });
  }
}
