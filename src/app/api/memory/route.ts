import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import memoryCache from '@/data/memory-cache.json';

const WORKSPACE = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'workspace');

// Files to show in memory viewer
const TOP_LEVEL_FILES = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md'];

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file');
  
  if (file) {
    const safePath = path.resolve(WORKSPACE, file);
    if (!safePath.startsWith(WORKSPACE)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    try {
      const content = fs.readFileSync(safePath, 'utf-8');
      return NextResponse.json({ path: file, content });
    } catch {
      // Fallback to cache contents when local filesystem unavailable (Vercel)
      const cache = memoryCache as { files: unknown[]; contents?: Record<string, string> };
      if (cache.contents && cache.contents[file]) {
        return NextResponse.json({ path: file, content: cache.contents[file], from_cache: true });
      }
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  // List all relevant workspace files
  const files: { name: string; path: string; size: number; modified: string; category: string }[] = [];
  
  const addFile = (filePath: string, category: string) => {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;
      const rel = path.relative(WORKSPACE, filePath);
      files.push({ name: path.basename(filePath), path: rel, size: stat.size, modified: stat.mtime.toISOString(), category });
    } catch {}
  };

  // Top-level workspace files
  for (const f of TOP_LEVEL_FILES) {
    addFile(path.join(WORKSPACE, f), 'workspace');
  }
  
  // memory/*.md
  const memDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memDir)) {
    fs.readdirSync(memDir)
      .filter(f => f.endsWith('.md') || f.endsWith('.json'))
      .sort()
      .reverse()
      .forEach(f => addFile(path.join(memDir, f), 'memory'));
  }

  // If no files found, likely running on Vercel (no local filesystem) — use cache
  if (files.length === 0) {
    const cache = memoryCache as { files: typeof files; contents?: Record<string, string> };
    return NextResponse.json({
      files: cache.files || [],
      local_only: false,
      from_cache: true,
    });
  }

  return NextResponse.json({ files, local_only: false });
}
