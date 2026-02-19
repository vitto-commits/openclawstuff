import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'uploads');

export async function GET() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const files = fs.readdirSync(UPLOAD_DIR).map(name => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    return { name, size: stat.size, modified: stat.mtime.toISOString() };
  });
  return NextResponse.json(files);
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
