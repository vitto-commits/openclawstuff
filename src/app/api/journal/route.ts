import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface SupabaseJournalEntry {
  id: string;
  date: string;
  agent_id?: string;
  tags: string[];
  accomplishments: string[];
  problems: string[];
  struggles: string[];
  stats?: Record<string, any>;
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

async function getSupabaseJournalEntry(targetDate: string): Promise<NarrativeJournal | null> {
  try {
    const entries = await fetchSupabase('GET', `/journal_entries?date=eq.${targetDate}&select=*&limit=1`);
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const entry = entries[0] as SupabaseJournalEntry;
    const rawStats = entry.stats || {};
    return {
      date: entry.date,
      dayLabel: formatDayLabel(entry.date),
      tags: entry.tags || [],
      accomplishments: entry.accomplishments || [],
      problems: entry.problems || [],
      struggles: entry.struggles || [],
      stats: {
        totalTokens: (rawStats as Record<string, any>).totalTokens ?? 0,
        totalCost: (rawStats as Record<string, any>).totalCost ?? 0,
        subagentsSpawned: (rawStats as Record<string, any>).subagentsSpawned ?? 0,
        activeTimeMinutes: (rawStats as Record<string, any>).activeTimeMinutes ?? 0,
      },
    };
  } catch (error) {
    console.error('Failed to fetch journal from Supabase:', error);
    return null;
  }
}

interface NarrativeJournal {
  date: string;
  dayLabel: string;
  narrative?: string;
  tags: string[];
  accomplishments: string[];
  problems: string[];
  struggles: string[];
  stats: {
    totalTokens: number;
    totalCost: number;
    subagentsSpawned: number;
    activeTimeMinutes: number;
  };
}

function getTextContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content.find((c: any) => c.type === 'text');
    return t?.text || '';
  }
  return '';
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${weekday} ${month} ${year}`;
}

// ── Accomplishment extraction ──────────────────────────────────────

/** Turn a subagent label like "dashboard-sidebar" into a readable phrase */
function labelToReadable(label: string): string {
  return label
    .replace(/[-_]/g, ' ')
    .replace(/\bv\d+$/i, '') // strip version suffixes
    .trim();
}

/** Clean up a raw task description into a short, first-person summary */
function cleanTaskSummary(taskLine: string, label?: string): string {
  // Remove markdown/bullet prefixes
  let text = taskLine.replace(/^\[Subagent Task\]:\s*/i, '').trim();

  // Take first sentence only
  const sentenceEnd = text.search(/[.!]\s|$/);
  if (sentenceEnd > 0 && sentenceEnd < text.length - 1) {
    text = text.slice(0, sentenceEnd + 1);
  }

  // Remove path-heavy content and clean up double spaces
  text = text.replace(/\s+at\s+~\/[\w\-/]+\.?\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  // Remove trailing periods for consistency
  text = text.replace(/\.\s*$/, '');

  // Convert to first-person style if it starts with a verb-ish imperative
  const imperativeMap: Record<string, string> = {
    'Add': 'Added',
    'Refactor': 'Refactored',
    'Replace': 'Replaced',
    'Make': 'Made',
    'Build': 'Built',
    'Create': 'Created',
    'Fix': 'Fixed',
    'Update': 'Updated',
    'Implement': 'Implemented',
    'Remove': 'Removed',
    'Connect': 'Connected',
    'Rebuild': 'Rebuilt',
    'Completely rebuild': 'Completely rebuilt',
    'Refine': 'Refined',
  };
  for (const [imp, past] of Object.entries(imperativeMap)) {
    if (text.startsWith(imp + ' ')) {
      text = past + text.slice(imp.length);
      break;
    }
  }

  // Truncate
  if (text.length > 120) text = text.slice(0, 117) + '…';

  return text;
}

function extractSubagentInfo(text: string): { label?: string; task?: string } {
  const labelMatch = text.match(/Label:\s*(\S+)/);
  const taskMatch = text.match(/\[Subagent Task\]:\s*([^\n]+)/);
  return {
    label: labelMatch?.[1],
    task: taskMatch?.[1]?.trim(),
  };
}

// ── Problem detection ──────────────────────────────────────────────

/** Returns true if text looks like raw source code / file content (false positive) */
function looksLikeCodeOrFileContent(text: string): boolean {
  const trimmed = text.trim();
  // Starts with common code patterns
  if (/^['"]use (client|server)['"];/.test(trimmed)) return true;
  if (/^import\s+[\{a-zA-Z]/.test(trimmed)) return true;
  if (/^export\s+(default\s+)?/.test(trimmed)) return true;
  if (/^(const|let|var|function|class|interface|type)\s+/.test(trimmed)) return true;
  if (/^<[a-zA-Z]/.test(trimmed)) return true; // HTML/JSX
  if (/^\{[\s\n]*"/.test(trimmed)) return true; // JSON object
  if (/^\[[\s\n]*\{/.test(trimmed)) return true; // JSON array
  // File listing (multiple paths)
  if (/^(\/[\w.\-]+){3,}/.test(trimmed) && trimmed.split('\n').length > 2) return true;
  // More than 30% of lines start with spaces (indented code)
  const lines = trimmed.split('\n');
  if (lines.length > 3) {
    const indented = lines.filter(l => /^\s{2,}/.test(l)).length;
    if (indented / lines.length > 0.3) return true;
  }
  return false;
}

interface RealError {
  summary: string;
  category: 'rate-limit' | 'build-error' | 'file-error' | 'http-error' | 'other';
}

/** Try to extract a real, meaningful error from tool result text */
function extractRealError(text: string, toolName?: string): RealError | null {
  // Skip if it looks like source code
  if (looksLikeCodeOrFileContent(text)) return null;

  const lower = text.toLowerCase();
  const firstLine = text.split('\n')[0].trim();

  // Rate limit / 429
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { summary: 'Hit API rate limit (429) — resolved after retry', category: 'rate-limit' };
  }

  // HTTP 500
  if (/\b5\d{2}\b/.test(firstLine) && (lower.includes('internal server') || lower.includes('server error'))) {
    return { summary: `Server error (${firstLine.match(/\b5\d{2}\b/)?.[0]}) encountered`, category: 'http-error' };
  }

  // Build / compilation errors
  if (lower.includes('build failed') || lower.includes('compilation failed') || lower.includes('module not found') ||
      lower.includes('syntaxerror') || lower.includes('typeerror:') || lower.includes('cannot find module')) {
    // Extract the actual error line
    const errorLine = text.split('\n').find(l =>
      /error/i.test(l) && !looksLikeCodeOrFileContent(l)
    ) || firstLine;
    const short = errorLine.slice(0, 100).trim();
    return { summary: `Build error: ${short}`, category: 'build-error' };
  }

  // ENOENT / file not found - only if it's an actual error message, not just a path
  if (lower.includes('enoent') || (lower.includes('no such file') && lower.includes('error'))) {
    const pathMatch = text.match(/['"]([^'"]+)['"]/);
    const target = pathMatch ? pathMatch[1].split('/').pop() : 'file';
    return { summary: `File not found: ${target}`, category: 'file-error' };
  }

  // Permission denied
  if (lower.includes('permission denied') || lower.includes('eacces')) {
    return { summary: 'Permission denied error', category: 'file-error' };
  }

  // Explicit "Error:" prefix in output (but not in code)
  if (/^error[:\s]/i.test(firstLine) && firstLine.length < 200 && !looksLikeCodeOrFileContent(text)) {
    return { summary: firstLine.slice(0, 100), category: 'other' };
  }

  // Command exit with non-zero — check if exec output says "failed"
  if (lower.includes('exit code') && /[1-9]\d*/.test(text.match(/exit code[:\s]*(\d+)/i)?.[1] || '')) {
    return { summary: `Command failed (${firstLine.slice(0, 80)})`, category: 'other' };
  }

  return null;
}

// ── Tag extraction ─────────────────────────────────────────────────

const TAG_KEYWORDS: Record<string, string[]> = {
  dashboard: ['dashboard', 'agent-dashboard'],
  sidebar: ['sidebar'],
  navigation: ['navigation', 'nav bar', 'top tab'],
  sse: ['sse', 'server-sent', 'eventsource', 'real-time', 'realtime'],
  skills: ['skill', 'skills'],
  cron: ['cron', 'schedule'],
  journal: ['journal', 'daily brief', 'narrative'],
  memory: ['memory', 'MEMORY.md'],
  chat: ['chat', 'quickchat'],
  costs: ['cost', 'token', 'billing'],
  tasks: ['task', 'kanban'],
  subagents: ['subagent', 'spawn'],
  api: ['api', 'route', 'endpoint'],
  database: ['database', 'sqlite', 'sql'],
  git: ['git', 'commit', 'push'],
  browser: ['browser', 'scrape'],
  whatsapp: ['whatsapp'],
  discord: ['discord'],
  telegram: ['telegram'],
  ui: ['redesign', 'layout', 'styling', 'css', 'tailwind'],
};

function extractTags(allText: string, toolsUsed: Set<string>, taskLabels: string[]): string[] {
  const tags = new Set<string>();
  const lower = allText.toLowerCase();

  // From keyword matching
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      tags.add(tag);
    }
  }

  // From task labels
  for (const label of taskLabels) {
    const parts = label.replace(/[-_]/g, ' ').replace(/v\d+$/i, '').trim().split(/\s+/);
    for (const part of parts) {
      if (part.length > 2) tags.add(part.toLowerCase());
    }
  }

  // Tool-based
  if (toolsUsed.has('browser') || toolsUsed.has('web_fetch') || toolsUsed.has('web_search')) tags.add('browser');
  if (toolsUsed.has('exec')) tags.add('dev');
  if (toolsUsed.has('tts')) tags.add('voice');
  if (toolsUsed.has('nodes')) tags.add('nodes');
  if (toolsUsed.has('canvas')) tags.add('canvas');

  // Remove overly generic tags
  const generic = new Set(['the', 'and', 'for', 'with', 'from', 'dev']);
  for (const g of generic) tags.delete(g);

  // Limit to 12 most relevant
  return Array.from(tags).sort().slice(0, 12);
}

// ── Main parser ────────────────────────────────────────────────────

function parseSessionsForDate(targetDate: string): NarrativeJournal {
  const accomplishments: string[] = [];
  const problems: string[] = [];
  const struggles: string[] = [];
  const toolsUsed = new Set<string>();
  const allTextParts: string[] = [];
  const activeTimestamps: number[] = [];
  const taskLabels: string[] = [];
  let totalCost = 0;
  let totalTokens = 0;
  let subagentsSpawned = 0;

  // Track errors for struggle detection: key → count
  const errorPatterns: Record<string, number> = {};
  const seenAccomplishments = new Set<string>();
  const seenProblems = new Set<string>();

  if (!fs.existsSync(SESSIONS_DIR)) {
    return {
      date: targetDate, dayLabel: formatDayLabel(targetDate),
      tags: [], accomplishments: [], problems: [], struggles: [],
      stats: { totalTokens: 0, totalCost: 0, subagentsSpawned: 0, activeTimeMinutes: 0 },
    };
  }

  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8'); } catch { continue; }

    const lines = content.split('\n').filter(l => l.trim());
    // Track the tool name for the most recent toolCall (to pair with toolResult)
    let lastToolName: string | undefined;

    for (const line of lines) {
      let entry: any;
      try { entry = JSON.parse(line); } catch { continue; }
      if (!entry.timestamp) continue;
      if (entry.timestamp.slice(0, 10) !== targetDate) continue;

      activeTimestamps.push(new Date(entry.timestamp).getTime());

      if (entry.type === 'message' && entry.message) {
        const msg = entry.message;

        if (msg.role === 'user') {
          const text = getTextContent(msg.content);

          // Detect subagent spawn
          if (text.includes('[Subagent Task]') || text.includes('[Subagent Context]')) {
            subagentsSpawned++;
            const info = extractSubagentInfo(text);
            if (info.label) taskLabels.push(info.label);

            if (info.task) {
              const summary = cleanTaskSummary(info.task, info.label);
              if (!seenAccomplishments.has(summary)) {
                seenAccomplishments.add(summary);
                accomplishments.push(summary);
              }
            } else if (info.label) {
              const readable = labelToReadable(info.label);
              const summary = `Worked on ${readable}`;
              if (!seenAccomplishments.has(summary)) {
                seenAccomplishments.add(summary);
                accomplishments.push(summary);
              }
            }
          }

          // Collect text for tag extraction (but not full subagent prompts)
          const short = text.slice(0, 500);
          allTextParts.push(short);
        }

        if (msg.role === 'assistant') {
          if (msg.usage?.cost?.total) {
            totalCost += msg.usage.cost.total;
            totalTokens += msg.usage?.totalTokens || 0;
          }

          const contentArr = Array.isArray(msg.content) ? msg.content : [];
          for (const c of contentArr) {
            if (c.type === 'toolCall' && c.name) {
              toolsUsed.add(c.name);
              lastToolName = c.name;
            }
            if (c.type === 'text' && c.text) {
              allTextParts.push(c.text.slice(0, 300));
            }
          }
        }

        // Detect real errors from tool results
        if (msg.role === 'toolResult') {
          const text = getTextContent(msg.content);
          const realError = extractRealError(text, lastToolName);
          if (realError) {
            // Track for struggle detection
            errorPatterns[realError.category] = (errorPatterns[realError.category] || 0) + 1;

            if (!seenProblems.has(realError.summary)) {
              seenProblems.add(realError.summary);
              problems.push(`**Problem:** ${realError.summary}`);
            }
          }
          lastToolName = undefined;
        }
      }

      // Session-level errors
      if (entry.type === 'error') {
        const errText = typeof entry.error === 'string' ? entry.error : JSON.stringify(entry.error);
        const realError = extractRealError(errText);
        if (realError && !seenProblems.has(realError.summary)) {
          seenProblems.add(realError.summary);
          problems.push(`**Problem:** ${realError.summary}`);
          errorPatterns[realError.category] = (errorPatterns[realError.category] || 0) + 1;
        }
      }
    }
  }

  // Detect struggles: error categories that occurred 3+ times
  for (const [category, count] of Object.entries(errorPatterns)) {
    if (count >= 3) {
      const descriptions: Record<string, string> = {
        'rate-limit': `Hit rate limits ${count} times — required multiple retries`,
        'build-error': `Build/compilation failed ${count} times before succeeding`,
        'file-error': `File-related errors encountered ${count} times`,
        'http-error': `Server errors occurred ${count} times`,
        'other': `Encountered repeated failures (${count} occurrences)`,
      };
      struggles.push(descriptions[category] || `${category} errors occurred ${count} times`);
    }
  }

  // Fallback if nothing found
  if (accomplishments.length === 0 && allTextParts.length > 0) {
    accomplishments.push('Worked on various tasks throughout the day');
  }

  // Active time
  let activeMinutes = 0;
  if (activeTimestamps.length > 1) {
    activeTimestamps.sort((a, b) => a - b);
    activeMinutes = Math.round((activeTimestamps[activeTimestamps.length - 1] - activeTimestamps[0]) / 60000);
  }

  const tags = extractTags(allTextParts.join(' '), toolsUsed, taskLabels);

  return {
    date: targetDate,
    dayLabel: formatDayLabel(targetDate),
    tags,
    accomplishments,
    problems: problems.slice(0, 10),
    struggles,
    stats: {
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      subagentsSpawned,
      activeTimeMinutes: activeMinutes,
    },
  };
}

function isJournalEntryEmpty(data: NarrativeJournal): boolean {
  return (
    data.accomplishments.length === 0 &&
    data.problems.length === 0 &&
    data.struggles.length === 0
  );
}

function emptyJournal(targetDate: string): NarrativeJournal {
  return {
    date: targetDate,
    dayLabel: formatDayLabel(targetDate),
    tags: [],
    accomplishments: [],
    problems: [],
    struggles: [],
    stats: {
      totalTokens: 0,
      totalCost: 0,
      subagentsSpawned: 0,
      activeTimeMinutes: 0,
    },
  };
}

// --- Narrative generation ---

function labelToReadableNarrative(label: string): string {
  return label.replace(/[-_]/g, ' ').replace(/\bv\d+$/i, '').trim();
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface TaskRecord {
  label: string;
  description: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  model?: string;
}

function groupTasksByTheme(tasks: TaskRecord[]): Record<string, TaskRecord[]> {
  const groups: Record<string, TaskRecord[]> = {};
  for (const t of tasks) {
    const label = (t.label || '').toLowerCase();
    let theme = 'other';
    if (label.includes('journal')) theme = 'journal';
    else if (label.includes('sidebar') || label.includes('scroll') || label.includes('animation')) theme = 'ui-polish';
    else if (label.includes('sse') || label.includes('live') || label.includes('functional')) theme = 'real-time';
    else if (label.includes('supabase') || label.includes('sync') || label.includes('api')) theme = 'backend';
    else if (label.includes('skill')) theme = 'skills';
    else if (label.includes('cron')) theme = 'cron';
    else if (label.includes('chat')) theme = 'chat';
    else if (label.includes('bug') || label.includes('fix')) theme = 'bugfixes';
    else if (label.includes('dashboard')) theme = 'dashboard';
    if (!groups[theme]) groups[theme] = [];
    groups[theme].push(t);
  }
  return groups;
}

const THEME_INTROS: Record<string, string> = {
  'dashboard': 'Started the day by building out the agent dashboard',
  'ui-polish': 'Spent time polishing the UI',
  'real-time': 'Wired up real-time features',
  'backend': 'Did backend work',
  'journal': 'Iterated on the journal system',
  'skills': 'Set up the skills viewer',
  'cron': 'Added cron job management',
  'chat': 'Worked on the chat interface',
  'bugfixes': 'Fixed some bugs along the way',
  'other': 'Also tackled some other tasks',
};

function generateNarrative(tasks: TaskRecord[], targetDate: string): string {
  if (tasks.length === 0) return '';
  
  const done = tasks.filter(t => t.status === 'done');
  const failed = tasks.filter(t => t.status === 'failed');
  const totalTime = done.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
  
  const paragraphs: string[] = [];
  
  // Opening
  const d = new Date(targetDate + 'T12:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  
  if (done.length >= 10) {
    paragraphs.push(`Big ${weekday}. Spawned ${done.length} subagents and got a lot done${totalTime > 0 ? ` — about ${formatDuration(totalTime)} of compute time total` : ''}.`);
  } else if (done.length >= 5) {
    paragraphs.push(`Productive ${weekday}. Ran ${done.length} tasks${totalTime > 0 ? ` across ${formatDuration(totalTime)} of work` : ''}.`);
  } else if (done.length > 0) {
    paragraphs.push(`Quiet ${weekday}. Knocked out ${done.length} task${done.length > 1 ? 's' : ''}.`);
  }
  
  // Group by theme and narrate
  const groups = groupTasksByTheme(done);
  const themeOrder = ['dashboard', 'real-time', 'ui-polish', 'skills', 'cron', 'chat', 'journal', 'backend', 'bugfixes', 'other'];
  
  for (const theme of themeOrder) {
    const group = groups[theme];
    if (!group || group.length === 0) continue;
    
    const intro = THEME_INTROS[theme] || 'Worked on';
    if (group.length === 1) {
      const t = group[0];
      const desc = t.description ? extractFirstSentence(t.description) : labelToReadableNarrative(t.label);
      const dur = t.duration_seconds ? ` (${formatDuration(t.duration_seconds)})` : '';
      paragraphs.push(`${intro} — ${desc.toLowerCase()}${dur}.`);
    } else {
      const items = group.map(t => {
        const name = labelToReadableNarrative(t.label);
        const dur = t.duration_seconds ? ` (${formatDuration(t.duration_seconds)})` : '';
        return `${name}${dur}`;
      });
      if (items.length <= 3) {
        paragraphs.push(`${intro}: ${items.join(', ')}.`);
      } else {
        paragraphs.push(`${intro}: ${items.slice(0, 3).join(', ')}, and ${items.length - 3} more.`);
      }
    }
  }
  
  // Problems
  if (failed.length > 0) {
    const failNames = failed.map(t => labelToReadableNarrative(t.label)).join(', ');
    paragraphs.push(`Hit some issues with: ${failNames}. Will need another pass.`);
  }
  
  return paragraphs.join('\n\n');
}

function extractFirstSentence(text: string): string {
  // Strip markdown and paths
  let clean = text.replace(/\*\*[^*]+\*\*/g, '').replace(/~\/[\w\-/.]+/g, '').replace(/\/home\/[\w\-/.]+/g, '').trim();
  // Remove "You are..." preambles
  clean = clean.replace(/^You are [^.]+\.\s*/i, '');
  // Take first sentence
  const match = clean.match(/^[^.!?]+[.!?]/);
  if (match && match[0].length > 10) return match[0].trim();
  return clean.substring(0, 120).trim();
}

// Build journal from Supabase tasks for the given date
async function buildJournalFromTasks(targetDate: string): Promise<NarrativeJournal | null> {
  if (!useSupabase) return null;
  try {
    const tasks = await fetchSupabase('GET', `/tasks?select=*&created_at=gte.${targetDate}T00:00:00Z&created_at=lt.${targetDate}T23:59:59Z&order=created_at.asc`);
    if (!Array.isArray(tasks) || tasks.length === 0) return null;
    
    const taskRecords: TaskRecord[] = tasks.map((t: any) => ({
      label: t.label || '',
      description: t.description || '',
      status: t.status || 'done',
      duration_seconds: t.duration_seconds || null,
      created_at: t.created_at || '',
      model: t.model || undefined,
    }));
    
    const done = taskRecords.filter(t => t.status === 'done');
    const failed = taskRecords.filter(t => t.status === 'failed');
    
    if (done.length === 0 && failed.length === 0) return null;
    
    const accomplishments = done.map(t => t.label || t.description || 'Completed task');
    const problems = failed.map(t => `**Failed:** ${t.label || 'Unknown task'}`);
    
    const narrative = generateNarrative(taskRecords, targetDate);
    
    const tags = new Set<string>();
    for (const t of taskRecords) {
      const label = (t.label || '').toLowerCase();
      if (label.includes('dashboard')) tags.add('dashboard');
      if (label.includes('sidebar')) tags.add('sidebar');
      if (label.includes('journal')) tags.add('journal');
      if (label.includes('memory')) tags.add('memory');
      if (label.includes('skill')) tags.add('skills');
      if (label.includes('cron')) tags.add('cron');
      if (label.includes('sse')) tags.add('sse');
      if (label.includes('chat')) tags.add('chat');
      if (label.includes('bug')) tags.add('bugfix');
    }
    if (taskRecords.length > 0) tags.add('subagents');
    
    const totalTime = done.reduce((sum, t) => sum + (t.duration_seconds || 0), 0);
    
    return {
      date: targetDate,
      dayLabel: formatDayLabel(targetDate),
      narrative,
      tags: Array.from(tags).slice(0, 12),
      accomplishments,
      problems,
      struggles: [],
      stats: {
        totalTokens: 0,
        totalCost: 0,
        subagentsSpawned: taskRecords.length,
        activeTimeMinutes: Math.round(totalTime / 60),
      },
    };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const dateParam = req.nextUrl.searchParams.get('date');
  const targetDate = dateParam || new Date().toISOString().slice(0, 10);
  
  if (useSupabase) {
    try {
      const data = await getSupabaseJournalEntry(targetDate);
      if (data && !isJournalEntryEmpty(data)) {
        // Supabase has real data — return it
        return NextResponse.json(data);
      }
      // Supabase returned empty arrays — fall through to local parser
    } catch (error) {
      console.error('Supabase fetch failed, falling back to local files:', error);
    }
  }

  // Try local session parser (works locally, not on Vercel)
  if (fs.existsSync(SESSIONS_DIR)) {
    const data = parseSessionsForDate(targetDate);
    if (!isJournalEntryEmpty(data)) {
      return NextResponse.json(data);
    }
  }

  // On Vercel — try building journal from Supabase tasks
  if (useSupabase) {
    const fromTasks = await buildJournalFromTasks(targetDate);
    if (fromTasks) return NextResponse.json(fromTasks);
  }

  // No data for this date
  return NextResponse.json(emptyJournal(targetDate));
}
