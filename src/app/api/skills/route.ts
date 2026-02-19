import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import skillsCache from '../../../data/skills-cache.json';

const CUSTOM_SKILLS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'skills');
const BUILTIN_SKILLS_DIR = path.join(process.env.HOME || '/home/vtto', '.npm-global', 'lib', 'node_modules', 'openclaw', 'skills');

interface Skill {
  name: string;
  description: string;
  source: 'built-in' | 'custom';
  content: string;
  dirName: string;
}

function parseFrontmatter(raw: string): { name: string; description: string; content: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { name: '', description: '', content: raw };
  const frontmatter = match[1];
  const content = match[2];
  
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*"?(.+?)"?\s*$/m);
  
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^"|"$/g, '') : '',
    description: descMatch ? descMatch[1].trim() : '',
    content: content.trim(),
  };
}

function scanDir(dir: string, source: 'built-in' | 'custom'): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMd)) continue;
    try {
      const raw = fs.readFileSync(skillMd, 'utf-8');
      const parsed = parseFrontmatter(raw);
      skills.push({
        name: parsed.name || entry.name,
        description: parsed.description,
        source,
        content: parsed.content,
        dirName: entry.name,
      });
    } catch { /* skip */ }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  const custom = scanDir(CUSTOM_SKILLS_DIR, 'custom');
  const builtin = scanDir(BUILTIN_SKILLS_DIR, 'built-in');
  
  // If no skills found, likely running on Vercel (no local filesystem) — use cache
  if (custom.length === 0 && builtin.length === 0) {
    const cache = skillsCache as { custom: typeof custom; builtin: typeof builtin };
    return NextResponse.json({
      custom: cache.custom || [],
      builtin: cache.builtin || [],
      local_only: false,
      from_cache: true,
    });
  }
  
  return NextResponse.json({ custom, builtin, local_only: false });
}
