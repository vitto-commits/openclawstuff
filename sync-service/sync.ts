#!/usr/bin/env node

/**
 * Supabase Sync Service - REST API Version  
 * Reads local session JSONL files and syncs to Supabase via REST API
 * Runs as a background service, syncing every 60 seconds
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SESSION_DIR = path.join(
  process.env.HOME || "/home/vtto",
  ".openclaw/agents/main/sessions"
);
const SYNC_STATE_FILE = path.join(__dirname, "../data/sync-state.json");
const SYNC_INTERVAL = 60000; // 60 seconds

interface SyncState {
  lastSync: number;
  processedLines?: { [filePath: string]: number };
  processedFiles?: { [filePath: string]: number }; // line count
}

interface SessionEntry {
  type: string;
  id?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: Array<any>;
    provider?: string;
    model?: string;
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      totalTokens: number;
      cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
      };
    };
  };
  [key: string]: any;
}

let syncState: SyncState;
let agentId: string = "";

// Fetch helper with proper header handling
async function supabaseFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }

  const finalOptions: RequestInit = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      Prefer: "return=minimal",
      ...options.headers,
    },
  };

  return fetch(url, finalOptions);
}

// Parse JSON response safely
async function parseJsonResponse(response: Response): Promise<any> {
  const contentLength = response.headers.get("content-length");
  if (contentLength === "0" || !contentLength) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;

  return JSON.parse(text);
}

function loadSyncState(): SyncState {
  try {
    if (fs.existsSync(SYNC_STATE_FILE)) {
      const data = fs.readFileSync(SYNC_STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("Could not load sync state, starting fresh:", err);
  }

  return {
    lastSync: Date.now(),
    processedFiles: {},
  };
}

function saveSyncState() {
  try {
    const dir = path.dirname(SYNC_STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(syncState, null, 2));
  } catch (err) {
    console.error("Error saving sync state:", err);
  }
}

async function getOrCreateAgent(name: string = "otto"): Promise<string> {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }

  try {
    // Try to fetch existing agent
    const url = new URL(`${SUPABASE_URL}/rest/v1/agents`);
    url.searchParams.append("name", `eq.${name}`);
    url.searchParams.append("select", "id");
    url.searchParams.append("limit", "1");

    const response = await supabaseFetch(url.toString());
    if (response.ok) {
      const agents: any = await parseJsonResponse(response);
      if (agents && agents.length > 0) {
        return agents[0].id;
      }
    }
  } catch (err) {
    console.warn("Could not fetch existing agent:", err);
  }

  // Create new agent
  try {
    const response = await supabaseFetch(`${SUPABASE_URL}/rest/v1/agents`, {
      method: "POST",
      body: JSON.stringify({
        name,
        machine: process.env.HOSTNAME || "unknown",
        model: process.env.DEFAULT_MODEL || "anthropic/claude-haiku-4-5",
        status: "online",
        metadata: { provider: "OpenClaw" },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create agent: ${response.status} ${err}`);
    }

    const result = await parseJsonResponse(response);
    if (result && result[0]) {
      return result[0].id;
    }

    // If no result, query for the newly created agent
    const agents: any = await fetch(`${SUPABASE_URL}/rest/v1/agents?name=eq.${name}&select=id`, {
      headers: {
        apikey: SUPABASE_ANON_KEY || "",
      },
    }).then((r) => r.json());

    if (agents && agents.length > 0) {
      return agents[0].id;
    }

    throw new Error("Could not create or fetch agent");
  } catch (err) {
    console.error(`Error creating agent ${name}:`, err);
    throw err;
  }
}

function extractTextContent(contentArray: any[]): string {
  if (!Array.isArray(contentArray)) return "";

  const textParts: string[] = [];
  for (const item of contentArray) {
    if (item.type === "text" && item.text) {
      textParts.push(item.text);
    }
  }

  return textParts.join("\n").trim();
}

function findToolCall(contentArray: any[], toolName?: string): any {
  if (!Array.isArray(contentArray)) return null;

  for (const item of contentArray) {
    if (item.type === "toolCall" && (!toolName || item.name === toolName)) {
      return item;
    }
  }

  return null;
}

async function processSyncEntry(entry: SessionEntry) {
  if (entry.type !== "message" || !entry.message) {
    return;
  }

  const { message } = entry;
  const { role, content, model, usage } = message;
  const timestamp = entry.timestamp || new Date().toISOString();

  if (!SUPABASE_URL) {
    return;
  }

  try {
    // Handle costs from usage data
    if (usage && usage.cost && usage.cost.total > 0) {
      try {
        const response = await supabaseFetch(`${SUPABASE_URL}/rest/v1/costs`, {
          method: "POST",
          body: JSON.stringify({
            agent_id: agentId,
            model: model || "unknown",
            input_tokens: usage.input || 0,
            output_tokens: usage.output || 0,
            cache_tokens: (usage.cacheRead || 0) + (usage.cacheWrite || 0),
            cost_usd: usage.cost.total,
            session_id: entry.id || "unknown",
            created_at: new Date(timestamp).toISOString(),
          }),
        });

        if (!response.ok) {
          // Log but don't throw
        }
      } catch (err) {
        // Silently ignore cost errors
      }
    }

    // Handle task spawning (sessions_spawn toolCall)
    if (role === "assistant") {
      const spawnCall = findToolCall(content, "sessions_spawn");
      if (spawnCall && spawnCall.arguments) {
        try {
          const args = spawnCall.arguments || {};
          const taskLabel = args.label || "Spawned task";

          const response = await supabaseFetch(`${SUPABASE_URL}/rest/v1/tasks`, {
            method: "POST",
            body: JSON.stringify({
              label: taskLabel,
              description: (args.task || "").substring(0, 500),
              status: "in_progress",
              agent_id: agentId,
              model: args.model || model || "unknown",
              created_at: new Date(timestamp).toISOString(),
              metadata: {
                tool: "sessions_spawn",
                spawn_timestamp: timestamp,
              },
            }),
          });

          if (!response.ok) {
            // Log but don't throw
          }
        } catch (err) {
          // Silently ignore task creation errors
        }
      }
    }

    // Handle task completion/failure (look for [System Message] in user messages)
    if (role === "user") {
      const textContent = extractTextContent(content);

      if (textContent.includes("[System Message]") && textContent.includes("subagent task")) {
        try {
          const isCompleted = textContent.includes("completed successfully");
          const isFailed = textContent.includes("failed");

          if (isCompleted || isFailed) {
            // Extract task name from "[System Message] ... subagent task \"xxx\" ..."
            const taskMatch = textContent.match(/subagent task "([^"]+)"/);
            const taskName = taskMatch ? taskMatch[1] : null;

            if (taskName) {
              // Query for the most recent task with this label
              const url = new URL(`${SUPABASE_URL}/rest/v1/tasks`);
              url.searchParams.append("label", `eq.${taskName}`);
              url.searchParams.append("agent_id", `eq.${agentId}`);
              url.searchParams.append("order", "created_at.desc");
              url.searchParams.append("limit", "1");

              const response = await supabaseFetch(url.toString());
              if (response.ok) {
                const tasks: any = await parseJsonResponse(response);

                if (tasks && tasks.length > 0) {
                  const task = tasks[0];
                  const status = isCompleted ? "done" : "failed";

                  // Use direct fetch for PATCH
                  const updateUrl = `${SUPABASE_URL}/rest/v1/tasks?id=eq.${task.id}`;
                  await supabaseFetch(updateUrl, {
                    method: "PATCH",
                    body: JSON.stringify({
                      status,
                      completed_at: new Date(timestamp).toISOString(),
                    }),
                  });
                }
              }
            }
          }
        } catch (err) {
          // Silently ignore task completion errors
        }
      }
    }
  } catch (err) {
    console.error("Unexpected error in processSyncEntry:", err);
  }
}

async function syncSessionFiles() {
  if (!fs.existsSync(SESSION_DIR)) {
    console.log(`Session directory not found: ${SESSION_DIR}`);
    return;
  }

  const files = fs
    .readdirSync(SESSION_DIR)
    .filter((f) => f.endsWith(".jsonl") && !f.includes(".deleted") && !f.includes(".reset"))
    .sort();

  console.log(`    Found ${files.length} session files`);

  // Migrate old format: processedLines -> processedFiles
  if (syncState.processedLines && !syncState.processedFiles) {
    syncState.processedFiles = syncState.processedLines;
  }
  if (!syncState.processedFiles) {
    syncState.processedFiles = {};
  }

  let totalProcessed = 0;

  for (const file of files) {
    const filePath = path.join(SESSION_DIR, file);
    const lastProcessedLine = syncState.processedFiles[filePath] || 0;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      if (lines.length <= lastProcessedLine) {
        continue; // Nothing new
      }

      const newLines = lines.slice(lastProcessedLine);
      console.log(`    Processing ${file}: ${newLines.length} new lines`);

      let processedCount = 0;
      for (let i = 0; i < newLines.length; i++) {
        const line = newLines[i];
        try {
          const entry: SessionEntry = JSON.parse(line);
          await processSyncEntry(entry);
          totalProcessed++;
          processedCount++;
        } catch (parseErr) {
          // Skip JSON parsing errors silently
        }
      }
      console.log(`      ✓ Processed ${processedCount}/${newLines.length} lines`);

      syncState.processedFiles[filePath] = lines.length;
      saveSyncState();
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  console.log(`    ✓ Total: ${totalProcessed} entries synced`);
}

async function generateDailyJournals() {
  if (!SUPABASE_URL) {
    return;
  }

  // Generate journal entries if new activity today
  const today = new Date().toISOString().split("T")[0];

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/journal_entries`);
    url.searchParams.append("date", `eq.${today}`);
    url.searchParams.append("agent_id", `eq.${agentId}`);

    const response = await supabaseFetch(url.toString());
    if (response.ok) {
      const existing: any = await parseJsonResponse(response);

      if (existing && existing.length > 0) {
        return; // Already generated today
      }
    }

    // Get today's tasks (completed ones)
    const tasksUrl = new URL(`${SUPABASE_URL}/rest/v1/tasks`);
    tasksUrl.searchParams.append("agent_id", `eq.${agentId}`);
    tasksUrl.searchParams.append("status", `eq.done`);
    tasksUrl.searchParams.append("created_at", `gte.${today}T00:00:00Z,lte.${today}T23:59:59Z`);

    const tasksResponse = await supabaseFetch(tasksUrl.toString());
    const tasks = tasksResponse.ok ? await parseJsonResponse(tasksResponse) : [];

    const accomplishments = (tasks || []).map((t: any) => `✓ ${t.label}`);

    // Create journal entry
    const journalResponse = await supabaseFetch(`${SUPABASE_URL}/rest/v1/journal_entries`, {
      method: "POST",
      body: JSON.stringify({
        date: today,
        agent_id: agentId,
        tags: ["automated"],
        accomplishments,
        problems: [],
        struggles: [],
        stats: {
          tasks_completed: accomplishments.length,
          total_cost: 0,
          activity_count: 0,
        },
      }),
    });

    if (journalResponse.ok) {
      console.log(`✓ Generated journal entry for ${today}`);
    }
  } catch (err) {
    // Silently ignore journal errors
  }
}

async function sync() {
  console.log(`[${new Date().toISOString()}] Starting sync...`);

  try {
    console.log("  → Syncing session files...");
    await syncSessionFiles();
    
    console.log("  → Generating daily journals...");
    await generateDailyJournals();

    // Update agent last_active
    if (SUPABASE_URL && agentId) {
      const updateUrl = `${SUPABASE_URL}/rest/v1/agents?id=eq.${agentId}`;
      const response = await supabaseFetch(updateUrl, {
        method: "PATCH",
        body: JSON.stringify({
          last_active: new Date().toISOString(),
          status: "online",
        }),
      });

      if (!response.ok) {
        // Ignore
      }
    }

    console.log(`[${new Date().toISOString()}] ✓ Sync complete`);
  } catch (err) {
    console.error("Sync error:", err);
  }
}

async function main() {
  console.log("🚀 Supabase Sync Service Starting...");
  console.log(`   Session directory: ${SESSION_DIR}`);
  console.log(`   Sync state file: ${SYNC_STATE_FILE}`);
  console.log(`   Interval: ${SYNC_INTERVAL / 1000}s\n`);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables required");
    process.exit(1);
  }

  syncState = loadSyncState();

  // Get or create agent
  try {
    agentId = await getOrCreateAgent();
    console.log(`✓ Using agent: ${agentId}\n`);
  } catch (err) {
    console.error("❌ Could not get/create agent:", err);
    process.exit(1);
  }

  // Initial sync
  await sync();

  // Periodic sync
  setInterval(sync, SYNC_INTERVAL);

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("\n👋 Shutting down gracefully...");
    saveSyncState();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down gracefully...");
    saveSyncState();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
