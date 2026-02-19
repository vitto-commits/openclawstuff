import express, { Express, Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || "/home/vtto";

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Configuration paths
const SKILLS_CUSTOM_DIR = path.join(HOME, ".openclaw", "skills");
const SKILLS_BUILTIN_DIR = path.join(HOME, ".npm-global", "lib", "node_modules", "openclaw", "skills");
const DATA_DIR = path.join(HOME, "agent-dashboard", "data");
const UPLOAD_DIR = path.join(HOME, "agent-dashboard", "uploads");
const WORKSPACE_DIR = path.join(HOME, ".openclaw", "workspace");

const CHAT_LOG_FILE = path.join(DATA_DIR, "chat-log.json");
const CRON_FILE = path.join(DATA_DIR, "cron-jobs.json");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: UPLOAD_DIR });

// Helpers
async function getOrCreateAgent(name: string = "otto") {
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("agents")
    .insert([
      {
        name,
        machine: process.env.HOSTNAME || "unknown",
        model: process.env.DEFAULT_MODEL || "anthropic/claude-haiku-4-5",
        status: "online",
        metadata: { provider: "OpenClaw" },
      },
    ])
    .select("id")
    .single();

  if (error) throw error;
  return created!.id;
}

// ============ HEALTH CHECK ============
app.get("/health", (req: Request, res: Response) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    database: "supabase",
  });
});

// ============ TASKS ROUTE ============
app.get("/api/tasks", async (req: Request, res: Response) => {
  try {
    const agentId = await getOrCreateAgent();

    const [todoResult, taskResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("agent_id", agentId)
        .eq("status", "todo")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*")
        .eq("agent_id", agentId)
        .in("status", ["in_progress", "done", "failed"])
        .order("created_at", { ascending: false }),
    ]);

    const formatTask = (t: any) => ({
      id: t.id,
      label: t.label || "",
      description: t.description || "",
      status: t.status,
      model: t.model || "",
      duration: t.duration_seconds ? `${t.duration_seconds}s` : "",
      spawned_at: t.created_at,
      completed_at: t.completed_at,
      sessionId: t.metadata?.session_id || "",
    });

    const todo = (todoResult.data || []).map(formatTask);
    const inProgress = (taskResult.data || [])
      .filter((t: any) => t.status === "in_progress")
      .map(formatTask);
    const done = (taskResult.data || [])
      .filter((t: any) => t.status === "done")
      .map(formatTask);

    res.json({ todo, in_progress: inProgress, done });
  } catch (error) {
    console.error("Tasks error:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

app.post("/api/tasks", async (req: Request, res: Response) => {
  try {
    const { label, description } = req.body;
    const agentId = await getOrCreateAgent();

    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          label,
          description,
          status: "todo",
          agent_id: agentId,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Post task error:", error);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

// ============ SKILLS ROUTE ============
function getSkillDirs(): string[] {
  return [SKILLS_CUSTOM_DIR, SKILLS_BUILTIN_DIR].filter((d) => fs.existsSync(d));
}

app.get("/api/skills", (req: Request, res: Response) => {
  try {
    const skills: any[] = [];

    for (const dir of getSkillDirs()) {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const skillPath = path.join(dir, item);
        const skillMdPath = path.join(skillPath, "SKILL.md");

        if (fs.statSync(skillPath).isDirectory() && fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const titleMatch = content.match(/^# (.+?)$/m);
          const title = titleMatch ? titleMatch[1] : item;

          skills.push({
            name: item,
            title,
            path: skillPath,
            custom: dir === SKILLS_CUSTOM_DIR,
          });
        }
      }
    }

    res.json(skills.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error("Skills error:", error);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});

// ============ AGENTS ROUTE ============
app.get("/api/agents", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("last_active", { ascending: false });

    if (error) throw error;

    const agents = (data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      machine: a.machine || "unknown",
      model: a.model || "unknown",
      status: a.status || "offline",
      last_active: a.last_active || new Date().toISOString(),
      metadata: a.metadata || {},
    }));

    res.json(agents);
  } catch (error) {
    console.error("Agents error:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

app.put("/api/agents/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, metadata } = req.body;

    const { data, error } = await supabase
      .from("agents")
      .update({
        status,
        metadata,
        last_active: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Update agent error:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// ============ ACTIVITY ROUTE ============
app.get("/api/activity", async (req: Request, res: Response) => {
  try {
    const agentId = await getOrCreateAgent();
    const { data, error } = await supabase
      .from("activity")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    const activity = (data || []).map((a: any) => ({
      id: a.id,
      type: a.type,
      content: a.content,
      timestamp: a.created_at,
      metadata: a.metadata || {},
    }));

    res.json(activity);
  } catch (error) {
    console.error("Activity error:", error);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

app.post("/api/activity", async (req: Request, res: Response) => {
  try {
    const { type, content, metadata } = req.body;
    const agentId = await getOrCreateAgent();

    const { data, error } = await supabase
      .from("activity")
      .insert([
        {
          agent_id: agentId,
          type,
          content,
          metadata,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Post activity error:", error);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ============ JOURNAL ROUTE ============
app.get("/api/journal", async (req: Request, res: Response) => {
  try {
    const agentId = await getOrCreateAgent();
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("agent_id", agentId)
      .order("date", { ascending: false })
      .limit(30);

    if (error) throw error;

    const entries = (data || []).map((e: any) => ({
      date: e.date,
      tags: e.tags || [],
      accomplishments: e.accomplishments || [],
      problems: e.problems || [],
      struggles: e.struggles || [],
      stats: e.stats || {},
    }));

    res.json(entries);
  } catch (error) {
    console.error("Journal error:", error);
    res.status(500).json({ error: "Failed to fetch journal" });
  }
});

// ============ COSTS ROUTE ============
app.get("/api/costs", async (req: Request, res: Response) => {
  try {
    const agentId = await getOrCreateAgent();
    const { data, error } = await supabase
      .from("costs")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const costs = (data || []).map((c: any) => ({
      id: c.id,
      model: c.model,
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_tokens: c.cache_tokens || 0,
      cost_usd: parseFloat(c.cost_usd || "0"),
      timestamp: c.created_at,
    }));

    // Calculate totals
    const totalCost = costs.reduce((sum, c) => sum + c.cost_usd, 0);
    const totalTokens = costs.reduce((sum, c) => sum + c.input_tokens + c.output_tokens, 0);
    const byModel: { [key: string]: any } = {};

    costs.forEach((c) => {
      if (!byModel[c.model]) {
        byModel[c.model] = { cost: 0, tokens: 0, count: 0 };
      }
      byModel[c.model].cost += c.cost_usd;
      byModel[c.model].tokens += c.input_tokens + c.output_tokens;
      byModel[c.model].count += 1;
    });

    res.json({
      costs,
      total_cost: totalCost,
      total_tokens: totalTokens,
      by_model: byModel,
    });
  } catch (error) {
    console.error("Costs error:", error);
    res.status(500).json({ error: "Failed to fetch costs" });
  }
});

app.post("/api/costs", async (req: Request, res: Response) => {
  try {
    const { model, input_tokens, output_tokens, cost_usd, session_id } = req.body;
    const agentId = await getOrCreateAgent();

    const { data, error } = await supabase
      .from("costs")
      .insert([
        {
          agent_id: agentId,
          model,
          input_tokens,
          output_tokens,
          cost_usd,
          session_id,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("Post cost error:", error);
    res.status(500).json({ error: "Failed to create cost entry" });
  }
});

// ============ FILES ROUTE ============
app.get("/api/files", async (req: Request, res: Response) => {
  try {
    const agentId = await getOrCreateAgent();
    const { data, error } = await supabase
      .from("files")
      .select("*")
      .eq("uploaded_by", agentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const files = (data || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      size_bytes: f.size_bytes,
      created_at: f.created_at,
    }));

    res.json(files);
  } catch (error) {
    console.error("Files error:", error);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

app.post("/api/files", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    const agentId = await getOrCreateAgent();
    const fileInfo = {
      id: crypto.randomUUID(),
      name: req.file.originalname,
      path: req.file.path,
      size_bytes: req.file.size,
      uploaded_by: agentId,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("files").insert([fileInfo]).select().single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.delete("/api/files/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: file } = await supabase.from("files").select("path").eq("id", id).single();

    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    const { error } = await supabase.from("files").delete().eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error("File delete error:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// ============ MEMORY ROUTE (Local only) ============
app.get("/api/memory", (req: Request, res: Response) => {
  try {
    const files: any[] = [];

    if (fs.existsSync(WORKSPACE_DIR)) {
      const items = fs.readdirSync(WORKSPACE_DIR);

      for (const item of items) {
        const filePath = path.join(WORKSPACE_DIR, item);
        if (fs.statSync(filePath).isFile() && item.endsWith(".md")) {
          files.push({
            name: item,
            path: filePath,
          });
        }
      }
    }

    res.json(files);
  } catch (error) {
    console.error("Memory error:", error);
    res.status(500).json({ error: "Failed to fetch memory" });
  }
});

// ============ CHAT ROUTE (Local) ============
function readChatLog(): any[] {
  try {
    return JSON.parse(fs.readFileSync(CHAT_LOG_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeChatLog(log: any[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(log, null, 2));
}

app.get("/api/chat", (req: Request, res: Response) => {
  try {
    const chat = readChatLog();
    res.json(chat.slice(-50)); // Last 50 messages
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

app.post("/api/chat", (req: Request, res: Response) => {
  try {
    const { role, content } = req.body;
    const chat = readChatLog();

    const message = {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    chat.push(message);
    writeChatLog(chat);
    res.json(message);
  } catch (error) {
    console.error("Post chat error:", error);
    res.status(500).json({ error: "Failed to post message" });
  }
});

// ============ CRON ROUTE (Local) ============
function readCronJobs(): any[] {
  try {
    return JSON.parse(fs.readFileSync(CRON_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeCronJobs(jobs: any[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
}

app.get("/api/cron", (req: Request, res: Response) => {
  try {
    const cron = readCronJobs();
    res.json(cron);
  } catch (error) {
    console.error("Cron error:", error);
    res.status(500).json({ error: "Failed to fetch cron jobs" });
  }
});

app.post("/api/cron", (req: Request, res: Response) => {
  try {
    const { command, schedule } = req.body;
    const cron = readCronJobs();

    const job = {
      id: crypto.randomUUID(),
      command,
      schedule,
      created_at: new Date().toISOString(),
    };

    cron.push(job);
    writeCronJobs(cron);
    res.json(job);
  } catch (error) {
    console.error("Post cron error:", error);
    res.status(500).json({ error: "Failed to create cron job" });
  }
});

app.delete("/api/cron/:id", (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let cron = readCronJobs();
    cron = cron.filter((job) => job.id !== id);
    writeCronJobs(cron);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete cron error:", error);
    res.status(500).json({ error: "Failed to delete cron job" });
  }
});

// ============ SSE EVENTS ROUTE ============
const clients: Response[] = [];

app.get("/api/events", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  clients.push(res);

  res.write("data: Connected\n\n");

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  res.on("close", () => {
    clearInterval(heartbeat);
    const index = clients.indexOf(res);
    if (index > -1) clients.splice(index, 1);
  });
});

function broadcastEvent(event: string, data: any) {
  for (const client of clients) {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Expose broadcast for other modules
(global as any).broadcastEvent = broadcastEvent;

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`🚀 API Server started on http://localhost:${PORT}`);
  console.log(`   Database: Supabase`);
  console.log(`   SSE: /api/events`);
});
