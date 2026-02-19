import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'uploads');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface SupabaseFile {
  id: string;
  name: string;
  path?: string;
  size_bytes: number;
  uploaded_by?: string;
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

async function getSupabaseFiles() {
  try {
    const files = await fetchSupabase('GET', '/files?select=*&order=created_at.desc');
    if (!Array.isArray(files)) return [];

    return files.map((f: SupabaseFile) => ({
      name: f.name,
      size: f.size_bytes,
      modified: f.created_at,
    }));
  } catch (error) {
    console.error('Failed to fetch files from Supabase:', error);
    throw error;
  }
}

export async function GET() {
  if (useSupabase) {
    try {
      const files = await getSupabaseFiles();
      return NextResponse.json(files);
    } catch (error) {
      console.error('Supabase fetch failed, falling back to local files:', error);
    }
  }

  // Fallback to local filesystem
  try {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const files = fs.readdirSync(UPLOAD_DIR).map(name => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, name));
      return { name, size: stat.size, modified: stat.mtime.toISOString() };
    });
    return NextResponse.json(files);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const formData = await req.formData();
  const file = formData.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(UPLOAD_DIR, file.name);
  fs.writeFileSync(filePath, buffer);
  
  return NextResponse.json({ name: file.name, size: buffer.length }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  const filePath = path.join(UPLOAD_DIR, name);
  if (!filePath.startsWith(UPLOAD_DIR)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  try { fs.unlinkSync(filePath); } catch {}
  return NextResponse.json({ ok: true });
}
