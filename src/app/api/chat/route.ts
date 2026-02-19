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
  return NextResponse.json(readChatLog());
}

export async function POST(req: NextRequest) {
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
}
