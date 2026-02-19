import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard/data/cron-jobs.json');
const DATA_DIR = path.dirname(DATA_FILE);

function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJobs(jobs: any[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

export async function GET() {
  try {
    return NextResponse.json(readJobs());
  } catch (error) {
    // Return empty list if cron management is not available (e.g., on Vercel)
    return NextResponse.json({
      jobs: [],
      local_only: true,
      message: 'Cron jobs are managed locally. This endpoint is not available on Vercel.'
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const jobs = readJobs();
  const newJob = {
    id: Date.now().toString(),
    name: body.name || 'Untitled',
    scheduleType: body.scheduleType || 'cron',
    scheduleValue: body.scheduleValue || '',
    scheduleHuman: body.scheduleHuman || body.scheduleValue || '',
    description: body.description || '',
    enabled: body.enabled ?? true,
    lastRun: null,
    nextRun: null,
    createdAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  writeJobs(jobs);
  return NextResponse.json(newJob, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const jobs = readJobs();
  const idx = jobs.findIndex((j: any) => j.id === body.id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  jobs[idx] = { ...jobs[idx], ...body };
  writeJobs(jobs);
  return NextResponse.json(jobs[idx]);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  let jobs = readJobs();
  jobs = jobs.filter((j: any) => j.id !== id);
  writeJobs(jobs);
  return NextResponse.json({ ok: true });
}
