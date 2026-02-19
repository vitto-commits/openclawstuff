import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SESSIONS_DIR = path.join(process.env.HOME || '/home/vtto', '.openclaw', 'agents', 'main', 'sessions');
const DATA_DIR = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'data');
const TODO_FILE = path.join(DATA_DIR, 'todo.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

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

interface SupabaseTask {
  id: string;
  label: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done' | 'failed';
  agent_id?: string;
  model?: string;
  duration_seconds?: number;
  created_at: string;
  completed_at?: string;
  metadata?: Record<string, any>;
}

// Supabase REST API helpers
async function fetchSupabase(method: string, path: string, body?: any) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY!,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY!}`,
    'Content-Type': 'application/json',
  };

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

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

async function getSupabaseTasks() {
  try {
    const tasks = await fetchSupabase('GET', '/tasks?select=*&order=created_at.desc');
    if (!Array.isArray(tasks)) return { todo: [], in_progress: [], done: [] };

    const todoItems = tasks
      .filter((t: SupabaseTask) => t.status === 'todo')
      .map((t: SupabaseTask) => ({
        id: t.id,
        title: t.label || t.description || 'Untitled',
        description: t.description || '',
        created_at: t.created_at,
      }));

    const mapAgentTask = (t: SupabaseTask) => ({
      id: t.id,
      label: t.label || 'Untitled',
      description: t.description || '',
      model: t.model || 'unknown',
      status: t.status as 'in_progress' | 'done' | 'failed',
      spawned_at: t.created_at,
      completed_at: t.completed_at,
      duration: t.duration_seconds ? `${Math.floor(t.duration_seconds / 60)}m ${t.duration_seconds % 60}s` : undefined,
    });

    const grouped = {
      todo: todoItems,
      in_progress: tasks.filter((t: SupabaseTask) => t.status === 'in_progress').map(mapAgentTask),
      done: tasks.filter((t: SupabaseTask) => t.status === 'done' || t.status === 'failed').map(mapAgentTask),
    };

    return grouped;
  } catch (error) {
    console.error('Failed to fetch from Supabase:', error);
    throw error;
  }
}

function readTodos(): TodoItem[] {
  try {
    return JSON.parse(fs.readFileSync(TODO_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeTodos(todos: TodoItem[]) {
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

export async function GET() {
  try {
    if (useSupabase) {
      const tasks = await getSupabaseTasks();
      return NextResponse.json(tasks);
    }
  } catch (error) {
    console.error('Supabase fetch failed, falling back to local files:', error);
  }

  // Fallback to local files
  const todos = readTodos();
  const agentTasks = parseSessionFiles();

  return NextResponse.json({
    todo: todos,
    in_progress: agentTasks.filter(t => t.status === 'in_progress'),
    done: agentTasks.filter(t => t.status === 'done' || t.status === 'failed'),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  if (useSupabase) {
    try {
      const task: SupabaseTask = {
        id,
        label: body.title || body.label || '',
        description: body.description || '',
        status: 'todo',
        created_at: createdAt,
      };
      const result = await fetchSupabase('POST', '/tasks', task);
      return NextResponse.json(result || task, { status: 201 });
    } catch (error) {
      console.error('Supabase insert failed, falling back to local files:', error);
    }
  }

  // Fallback to local files
  const todos = readTodos();
  const item: TodoItem = {
    id,
    title: body.title || '',
    description: body.description || '',
    created_at: createdAt,
  };
  todos.push(item);
  writeTodos(todos);
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();

  if (useSupabase) {
    try {
      await fetchSupabase('DELETE', `/tasks?id=eq.${id}`);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('Supabase delete failed, falling back to local files:', error);
    }
  }

  // Fallback to local files
  let todos = readTodos();
  todos = todos.filter(t => t.id !== id);
  writeTodos(todos);
  return NextResponse.json({ ok: true });
}
