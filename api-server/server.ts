import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || '/home/vtto';

const app: Express = express();
const PORT = 3001;

// Configuration paths
const SESSIONS_DIR = path.join(HOME, '.openclaw', 'agents', 'main', 'sessions');
const SKILLS_CUSTOM_DIR = path.join(HOME, '.openclaw', 'skills');
const SKILLS_BUILTIN_DIR = path.join(HOME, '.npm-global', 'lib', 'node_modules', 'openclaw', 'skills');
const DATA_DIR = path.join(HOME, 'agent-dashboard', 'data');
const UPLOAD_DIR = path.join(HOME, 'agent-dashboard', 'uploads');
const WORKSPACE_DIR = path.join(HOME, '.openclaw', 'workspace');

const TODO_FILE = path.join(DATA_DIR, 'todo.json');
const CHAT_LOG_FILE = path.join(DATA_DIR, 'chat-log.json');
const CRON_FILE = path.join(DATA_DIR, 'cron-jobs.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: UPLOAD_DIR });

// ============ TASKS ROUTE ============
interface TodoItem {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

interface AgentTask {
  id: string;
  label: string;
  description: string;
  model: string;
  status: 'in_progress' | 'done' | 'failed';
  spawned_at: string;
  completed_at?: string;
  duration?: string;
  sessionId?: string;
}

function readTodos(): TodoItem[] {
  try {
    return JSON.parse(fs.readFileSync(TODO_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeTodos(todos: TodoItem[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2));
}

function parseSessionFiles(): AgentTask[] {
  const tasks: AgentTask[] = [];
  if (!fs.existsSync(SESSIONS_DIR)) return tasks;

  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n').filter(Boolean);
    const spawns: Map<string, { label: string; task: string; model: string; timestamp: string; childSessionKey: string }> = new Map();
    const completions: Map<string, { success: boolean; timestamp: string }> = new Map();

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type !== 'message') continue;
      const msg = entry.message;
      if (!msg) continue;

      // Look for spawn toolCalls
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'toolCall' && block.name === 'sessions_spawn') {
            const args = typeof block.arguments === 'string' ? (() => { try { return JSON.parse(block.arguments); } catch { return block.arguments; } })() : block.arguments;
            const label = args?.label || 'unnamed';
            const task = args?.task || '';
            const model = args?.model || 'default';
            spawns.set(label, {
              label,
              task,
              model,
              timestamp: entry.timestamp || msg.timestamp ? new Date(entry.timestamp || msg.timestamp).toISOString() : new Date().toISOString(),
              childSessionKey: '',
            });
          }
        }
      }

      // Look for spawn results to get childSessionKey
      if (msg.role === 'toolResult' && msg.toolName === 'sessions_spawn') {
        const content = Array.isArray(msg.content) ? msg.content : [];
        for (const c of content) {
          if (c.type === 'text') {
            try {
              const parsed = JSON.parse(c.text);
              if (parsed.childSessionKey) {
                // Find the most recent spawn without a session key
                for (const [key, spawn] of spawns) {
                  if (!spawn.childSessionKey) {
                    spawn.childSessionKey = parsed.childSessionKey;
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      }

      // Look for completion system messages
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text?.includes('[System Message]') && block.text?.includes('subagent task')) {
            // Extract label from: A subagent task "label" just completed
            const labelMatch = block.text.match(/subagent task "([^"]+)"/);
            if (labelMatch) {
              const success = block.text.includes('completed successfully');
              completions.set(labelMatch[1], {
                success,
                timestamp: entry.timestamp || new Date().toISOString(),
              });
            }
          }
        }
      }
    }

    // Build tasks from spawns
    for (const [label, spawn] of spawns) {
      const completion = completions.get(label);
      const spawnTime = new Date(spawn.timestamp);
      let duration: string | undefined;
      let completedAt: string | undefined;

      if (completion) {
        completedAt = completion.timestamp;
        const compTime = new Date(completion.timestamp);
        const diffMs = compTime.getTime() - spawnTime.getTime();
        if (diffMs > 0) {
          const secs = Math.floor(diffMs / 1000);
          if (secs < 60) duration = `${secs}s`;
          else if (secs < 3600) duration = `${Math.floor(secs / 60)}m ${secs % 60}s`;
          else duration = `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
        }
      }

      // Truncate description
      const shortDesc = spawn.task.length > 200 ? spawn.task.substring(0, 200) + '…' : spawn.task;

      tasks.push({
        id: `${file}-${label}`,
        label: spawn.label,
        description: shortDesc,
        model: spawn.model,
        status: completion ? (completion.success ? 'done' : 'failed') : 'in_progress',
        spawned_at: spawn.timestamp,
        completed_at: completedAt,
        duration,
        sessionId: file.replace('.jsonl', ''),
      });
    }
  }

  // Sort by spawned_at descending
  tasks.sort((a, b) => new Date(b.spawned_at).getTime() - new Date(a.spawned_at).getTime());
  return tasks;
}

app.get('/api/tasks', (req: Request, res: Response) => {
  const todos = readTodos();
  const agentTasks = parseSessionFiles();

  return res.json({
    todo: todos,
    in_progress: agentTasks.filter(t => t.status === 'in_progress'),
    done: agentTasks.filter(t => t.status === 'done' || t.status === 'failed'),
  });
});

app.post('/api/tasks', (req: Request, res: Response) => {
  const body = req.body;
  const todos = readTodos();
  const item: TodoItem = {
    id: crypto.randomUUID(),
    title: body.title || '',
    description: body.description || '',
    created_at: new Date().toISOString(),
  };
  todos.push(item);
  writeTodos(todos);
  return res.status(201).json(item);
});

app.delete('/api/tasks', (req: Request, res: Response) => {
  const { id } = req.body;
  let todos = readTodos();
  todos = todos.filter(t => t.id !== id);
  writeTodos(todos);
  return res.json({ ok: true });
});

// ============ SKILLS ROUTE ============
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

app.get('/api/skills', (req: Request, res: Response) => {
  const custom = scanDir(SKILLS_CUSTOM_DIR, 'custom');
  const builtin = scanDir(SKILLS_BUILTIN_DIR, 'built-in');
  return res.json({ custom, builtin });
});

// ============ AGENTS ROUTE ============
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

function isRecent(timestamp: string): boolean {
  if (!timestamp) return false;
  const diff = Date.now() - new Date(timestamp).getTime();
  return diff < 30 * 60 * 1000; // 30 minutes
}

function parseAgentSessionFiles(): AgentInfo[] {
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
        } catch {}
      }
      
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
  
  // If no agents found, return a default
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

app.get('/api/agents', (req: Request, res: Response) => {
  const agents = parseAgentSessionFiles();
  return res.json(agents);
});

app.put('/api/agents', (req: Request, res: Response) => {
  return res.json({ ok: true });
});

// ============ ACTIVITY ROUTE ============
interface ActivityItem {
  id: string;
  agent: string;
  action: string;
  details: string;
  level: string;
  created_at: string;
  session?: string;
}

function getTextContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const t = content.find((c: any) => c.type === 'text');
    return t?.text || '';
  }
  return '';
}

function parseSessionActivity(limit: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  
  if (!fs.existsSync(SESSIONS_DIR)) return items;
  
  // Get session files sorted by modification time (newest first)
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10); // Only parse recent sessions
  
  for (const file of files) {
    const filePath = path.join(SESSIONS_DIR, file.name);
    const sessionId = file.name.replace('.jsonl', '').slice(0, 8);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          if (entry.type === 'session') {
            items.push({
              id: entry.id,
              agent: 'main',
              action: 'Session started',
              details: `Session ${entry.id.slice(0, 8)}`,
              level: 'info',
              created_at: entry.timestamp,
              session: sessionId,
            });
          }
          
          if (entry.type === 'model_change') {
            items.push({
              id: entry.id,
              agent: 'main',
              action: 'Model changed',
              details: `${entry.provider}/${entry.modelId}`,
              level: 'info',
              created_at: entry.timestamp,
              session: sessionId,
            });
          }
          
          if (entry.type === 'message' && entry.message) {
            const msg = entry.message;
            
            if (msg.role === 'user') {
              const text = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                : String(msg.content || '');
              items.push({
                id: entry.id,
                agent: 'user',
                action: 'User message',
                details: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                level: 'info',
                created_at: entry.timestamp,
                session: sessionId,
              });
            }
            
            if (msg.role === 'assistant') {
              // Check for tool calls
              const toolCalls = Array.isArray(msg.content)
                ? msg.content.filter((c: any) => c.type === 'toolCall')
                : [];
              
              if (toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  items.push({
                    id: `${entry.id}-${tc.id}`,
                    agent: 'main',
                    action: `Tool: ${tc.name}`,
                    details: typeof tc.arguments === 'string' 
                      ? tc.arguments.slice(0, 150)
                      : JSON.stringify(tc.arguments || {}).slice(0, 150),
                    level: 'info',
                    created_at: entry.timestamp,
                    session: sessionId,
                  });
                }
              } else {
                const text = Array.isArray(msg.content)
                  ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                  : String(msg.content || '');
                if (text.trim()) {
                  items.push({
                    id: entry.id,
                    agent: 'main',
                    action: 'Assistant response',
                    details: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                    level: 'success',
                    created_at: entry.timestamp,
                    session: sessionId,
                  });
                }
              }
              
              // Log cost if available
              if (msg.usage?.cost?.total) {
                items.push({
                  id: `${entry.id}-cost`,
                  agent: 'main',
                  action: 'API cost',
                  details: `$${msg.usage.cost.total.toFixed(4)} (${msg.usage.totalTokens || 0} tokens) - ${msg.model}`,
                  level: 'info',
                  created_at: entry.timestamp,
                  session: sessionId,
                });
              }
            }
            
            if (msg.role === 'toolResult') {
              const text = Array.isArray(msg.content)
                ? msg.content.find((c: any) => c.type === 'text')?.text || ''
                : String(msg.content || '');
              items.push({
                id: entry.id,
                agent: 'main',
                action: `Result: ${msg.toolName || 'tool'}`,
                details: text.slice(0, 150) + (text.length > 150 ? '...' : ''),
                level: text.toLowerCase().includes('error') ? 'error' : 'info',
                created_at: entry.timestamp,
                session: sessionId,
              });
            }
          }
        } catch {}
      }
    } catch {}
  }
  
  // Also include chat log entries
  try {
    if (fs.existsSync(CHAT_LOG_FILE)) {
      const chatItems: any[] = JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf-8'));
      for (const c of chatItems) {
        items.push({
          id: `chat-${c.timestamp}`,
          agent: c.agent || 'user',
          action: 'Chat message',
          details: c.message,
          level: 'info',
          created_at: c.timestamp,
        });
      }
    }
  } catch {}
  
  // Sort by timestamp descending and limit
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items.slice(0, limit);
}

app.get('/api/activity', (req: Request, res: Response) => {
  const limit = parseInt((req.query.limit as string) || '100');
  const items = parseSessionActivity(limit);
  return res.json(items);
});

app.post('/api/activity', (req: Request, res: Response) => {
  return res.status(201).json({ ok: true });
});

// ============ JOURNAL ROUTE ============
interface NarrativeJournal {
  date: string;
  dayLabel: string;
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

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDate();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${weekday} ${month} ${year}`;
}

function labelToReadable(label: string): string {
  return label
    .replace(/[-_]/g, ' ')
    .replace(/\bv\d+$/i, '')
    .trim();
}

function cleanTaskSummary(taskLine: string, label?: string): string {
  let text = taskLine.replace(/^\[Subagent Task\]:\s*/i, '').trim();
  const sentenceEnd = text.search(/[.!]\s|$/);
  if (sentenceEnd > 0 && sentenceEnd < text.length - 1) {
    text = text.slice(0, sentenceEnd + 1);
  }
  text = text.replace(/\s+at\s+~\/[\w\-/]+\.?\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  text = text.replace(/\.\s*$/, '');

  const imperativeMap: Record<string, string> = {
    'Add': 'Added', 'Refactor': 'Refactored', 'Replace': 'Replaced', 'Make': 'Made',
    'Build': 'Built', 'Create': 'Created', 'Fix': 'Fixed', 'Update': 'Updated',
    'Implement': 'Implemented', 'Remove': 'Removed', 'Connect': 'Connected',
    'Rebuild': 'Rebuilt', 'Completely rebuild': 'Completely rebuilt', 'Refine': 'Refined',
  };
  for (const [imp, past] of Object.entries(imperativeMap)) {
    if (text.startsWith(imp + ' ')) {
      text = past + text.slice(imp.length);
      break;
    }
  }

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

function looksLikeCodeOrFileContent(text: string): boolean {
  const trimmed = text.trim();
  if (/^['"]use (client|server)['"];/.test(trimmed)) return true;
  if (/^import\s+[\{a-zA-Z]/.test(trimmed)) return true;
  if (/^export\s+(default\s+)?/.test(trimmed)) return true;
  if (/^(const|let|var|function|class|interface|type)\s+/.test(trimmed)) return true;
  if (/^<[a-zA-Z]/.test(trimmed)) return true;
  if (/^\{[\s\n]*"/.test(trimmed)) return true;
  if (/^\[[\s\n]*\{/.test(trimmed)) return true;
  if (/^(\/[\w.\-]+){3,}/.test(trimmed) && trimmed.split('\n').length > 2) return true;
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

function extractRealError(text: string, toolName?: string): RealError | null {
  if (looksLikeCodeOrFileContent(text)) return null;

  const lower = text.toLowerCase();
  const firstLine = text.split('\n')[0].trim();

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { summary: 'Hit API rate limit (429) — resolved after retry', category: 'rate-limit' };
  }

  if (/\b5\d{2}\b/.test(firstLine) && (lower.includes('internal server') || lower.includes('server error'))) {
    return { summary: `Server error (${firstLine.match(/\b5\d{2}\b/)?.[0]}) encountered`, category: 'http-error' };
  }

  if (lower.includes('build failed') || lower.includes('compilation failed') || lower.includes('module not found') ||
      lower.includes('syntaxerror') || lower.includes('typeerror:') || lower.includes('cannot find module')) {
    const errorLine = text.split('\n').find(l =>
      /error/i.test(l) && !looksLikeCodeOrFileContent(l)
    ) || firstLine;
    const short = errorLine.slice(0, 100).trim();
    return { summary: `Build error: ${short}`, category: 'build-error' };
  }

  if (lower.includes('enoent') || (lower.includes('no such file') && lower.includes('error'))) {
    const pathMatch = text.match(/['"]([^'"]+)['"]/);
    const target = pathMatch ? pathMatch[1].split('/').pop() : 'file';
    return { summary: `File not found: ${target}`, category: 'file-error' };
  }

  if (lower.includes('permission denied') || lower.includes('eacces')) {
    return { summary: 'Permission denied error', category: 'file-error' };
  }

  if (/^error[:\s]/i.test(firstLine) && firstLine.length < 200 && !looksLikeCodeOrFileContent(text)) {
    return { summary: firstLine.slice(0, 100), category: 'other' };
  }

  if (lower.includes('exit code') && /[1-9]\d*/.test(text.match(/exit code[:\s]*(\d+)/i)?.[1] || '')) {
    return { summary: `Command failed (${firstLine.slice(0, 80)})`, category: 'other' };
  }

  return null;
}

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

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      tags.add(tag);
    }
  }

  for (const label of taskLabels) {
    const parts = label.replace(/[-_]/g, ' ').replace(/\bv\d+$/i, '').trim().split(/\s+/);
    for (const part of parts) {
      if (part.length > 2) tags.add(part.toLowerCase());
    }
  }

  if (toolsUsed.has('browser') || toolsUsed.has('web_fetch') || toolsUsed.has('web_search')) tags.add('browser');
  if (toolsUsed.has('exec')) tags.add('dev');
  if (toolsUsed.has('tts')) tags.add('voice');
  if (toolsUsed.has('nodes')) tags.add('nodes');
  if (toolsUsed.has('canvas')) tags.add('canvas');

  const generic = new Set(['the', 'and', 'for', 'with', 'from', 'dev']);
  for (const g of generic) tags.delete(g);

  return Array.from(tags).sort().slice(0, 12);
}

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

        if (msg.role === 'toolResult') {
          const text = getTextContent(msg.content);
          const realError = extractRealError(text, lastToolName);
          if (realError) {
            errorPatterns[realError.category] = (errorPatterns[realError.category] || 0) + 1;

            if (!seenProblems.has(realError.summary)) {
              seenProblems.add(realError.summary);
              problems.push(`**Problem:** ${realError.summary}`);
            }
          }
          lastToolName = undefined;
        }
      }

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

  if (accomplishments.length === 0 && allTextParts.length > 0) {
    accomplishments.push('Worked on various tasks throughout the day');
  }

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

app.get('/api/journal', (req: Request, res: Response) => {
  const dateParam = req.query.date as string | undefined;
  const targetDate = dateParam || new Date().toISOString().slice(0, 10);
  const data = parseSessionsForDate(targetDate);
  return res.json(data);
});

// ============ COSTS ROUTE ============
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

app.get('/api/costs', (req: Request, res: Response) => {
  const data = parseCosts();
  return res.json(data);
});

app.post('/api/costs', (req: Request, res: Response) => {
  return res.status(201).json({ ok: true });
});

// ============ FILES (UPLOADS) ROUTE ============
app.get('/api/files', (req: Request, res: Response) => {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const files = fs.readdirSync(UPLOAD_DIR).map(name => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    return { name, size: stat.size, modified: stat.mtime.toISOString() };
  });
  return res.json(files);
});

app.post('/api/files', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  const originalName = req.file.originalname;
  const tempPath = req.file.path;
  const finalPath = path.join(UPLOAD_DIR, originalName);
  
  try {
    fs.renameSync(tempPath, finalPath);
    const stat = fs.statSync(finalPath);
    return res.status(201).json({ name: originalName, size: stat.size });
  } catch {
    return res.status(500).json({ error: 'Upload failed' });
  }
});

app.delete('/api/files', (req: Request, res: Response) => {
  const { name } = req.body;
  const filePath = path.join(UPLOAD_DIR, name);
  if (!filePath.startsWith(UPLOAD_DIR)) return res.status(403).json({ error: 'Access denied' });
  try { fs.unlinkSync(filePath); } catch {}
  return res.json({ ok: true });
});

// ============ MEMORY ROUTE ============
const TOP_LEVEL_FILES = ['MEMORY.md', 'SOUL.md', 'USER.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md'];

app.get('/api/memory', (req: Request, res: Response) => {
  const file = req.query.file as string | undefined;
  
  if (file) {
    const safePath = path.resolve(WORKSPACE_DIR, file);
    if (!safePath.startsWith(WORKSPACE_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    try {
      const content = fs.readFileSync(safePath, 'utf-8');
      return res.json({ path: file, content });
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
  }

  const files: { name: string; path: string; size: number; modified: string; category: string }[] = [];
  
  const addFile = (filePath: string, category: string) => {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;
      const rel = path.relative(WORKSPACE_DIR, filePath);
      files.push({ name: path.basename(filePath), path: rel, size: stat.size, modified: stat.mtime.toISOString(), category });
    } catch {}
  };

  for (const f of TOP_LEVEL_FILES) {
    addFile(path.join(WORKSPACE_DIR, f), 'workspace');
  }
  
  const memDir = path.join(WORKSPACE_DIR, 'memory');
  if (fs.existsSync(memDir)) {
    fs.readdirSync(memDir)
      .filter(f => f.endsWith('.md') || f.endsWith('.json'))
      .sort()
      .reverse()
      .forEach(f => addFile(path.join(memDir, f), 'memory'));
  }

  return res.json(files);
});

// ============ CHAT ROUTE ============
function readChatLog(): any[] {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeChatLog(items: any[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(items, null, 2));
}

app.get('/api/chat', (req: Request, res: Response) => {
  return res.json(readChatLog());
});

app.post('/api/chat', (req: Request, res: Response) => {
  const body = req.body;
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
  
  return res.status(201).json({ ok: true, entry });
});

// ============ CRON ROUTE ============
function readCronJobs(): any[] {
  try {
    return JSON.parse(fs.readFileSync(CRON_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeCronJobs(jobs: any[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
}

app.get('/api/cron', (req: Request, res: Response) => {
  return res.json(readCronJobs());
});

app.post('/api/cron', (req: Request, res: Response) => {
  const body = req.body;
  const jobs = readCronJobs();
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
  writeCronJobs(jobs);
  return res.status(201).json(newJob);
});

app.put('/api/cron', (req: Request, res: Response) => {
  const body = req.body;
  const jobs = readCronJobs();
  const idx = jobs.findIndex((j: any) => j.id === body.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  jobs[idx] = { ...jobs[idx], ...body };
  writeCronJobs(jobs);
  return res.json(jobs[idx]);
});

app.delete('/api/cron', (req: Request, res: Response) => {
  const id = req.query.id as string | undefined;
  let jobs = readCronJobs();
  jobs = jobs.filter((j: any) => j.id !== id);
  writeCronJobs(jobs);
  return res.json({ ok: true });
});

// ============ EVENTS (SSE) ROUTE ============
const watchers = new Map<string, fs.FSWatcher>();

function cleanupWatchers(): void {
  for (const w of watchers.values()) {
    try { w.close(); } catch {}
  }
  watchers.clear();
}

app.get('/api/events', (req: Request, res: Response) => {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller: ReadableStreamDefaultController<Uint8Array>) {
      const send = (event: string, data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      const heartbeat = () => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch { closed = true; }
      };

      const debounceTimers = new Map<string, NodeJS.Timeout>();
      const debounced = (key: string, fn: () => void, ms = 150) => {
        const existing = debounceTimers.get(key);
        if (existing) clearTimeout(existing);
        debounceTimers.set(key, setTimeout(fn, ms));
      };

      const pushEvent = async (event: string) => {
        try {
          if (event === 'tasks') send('tasks', { todo: readTodos(), in_progress: parseSessionFiles().filter(t => t.status === 'in_progress'), done: parseSessionFiles().filter(t => t.status === 'done' || t.status === 'failed') });
          else if (event === 'activity') send('activity', parseSessionActivity(100));
          else if (event === 'agents') send('agents', parseAgentSessionFiles());
          else if (event === 'costs') send('costs', parseCosts());
        } catch {}
      };

      // Watch sessions directory
      try {
        if (fs.existsSync(SESSIONS_DIR)) {
          const w = fs.watch(SESSIONS_DIR, { recursive: false }, (_eventType, filename) => {
            if (!filename?.endsWith('.jsonl')) return;
            debounced('tasks', () => pushEvent('tasks'));
            debounced('activity', () => pushEvent('activity'));
            debounced('agents', () => pushEvent('agents'));
            debounced('costs', () => pushEvent('costs'));
          });
          watchers.set('sessions', w);
        }
      } catch {}

      // Watch data directory
      try {
        if (fs.existsSync(DATA_DIR)) {
          const w = fs.watch(DATA_DIR, { recursive: false }, (_eventType, filename) => {
            if (!filename) return;
            if (filename === 'todo.json') debounced('tasks', () => pushEvent('tasks'));
            if (filename === 'chat-log.json') debounced('activity', () => pushEvent('activity'));
            if (filename === 'cron-jobs.json') debounced('activity', () => pushEvent('activity'));
          });
          watchers.set('data', w);
        }
      } catch {}

      // Heartbeat every 30s
      const hbInterval = setInterval(heartbeat, 30000);

      // Cleanup on close
      req.on('close', () => {
        closed = true;
        for (const [key] of watchers) {
          if (key === 'sessions' || key === 'data') {
            const w = watchers.get(key);
            if (w) try { w.close(); } catch {}
            watchers.delete(key);
          }
        }
        clearInterval(hbInterval);
        for (const t of debounceTimers.values()) clearTimeout(t);
        debounceTimers.clear();
        try { controller.close(); } catch {}
      });
    },
  } as any);

  return res.setHeader('Content-Type', 'text/event-stream')
    .setHeader('Cache-Control', 'no-cache, no-transform')
    .setHeader('Connection', 'keep-alive')
    .setHeader('X-Accel-Buffering', 'no')
    .send(stream);
});

// ============ HEALTH CHECK ============
app.get('/health', (req: Request, res: Response) => {
  return res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`✓ Agent Dashboard API Server running on port ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  cleanupWatchers();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  cleanupWatchers();
  process.exit(0);
});
