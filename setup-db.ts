#!/usr/bin/env node

/**
 * Supabase Database Schema Setup
 * Creates tables for agents, tasks, activity, costs, journal_entries, and files
 * Run with: npx ts-node setup-db.ts
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

if (!SUPABASE_URL) {
  console.error("Error: SUPABASE_URL not set");
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY && !SUPABASE_ANON_KEY) {
  console.error(
    "Error: Either SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set"
  );
  process.exit(1);
}

// Use service key if available for full admin access, otherwise use anon key
const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const supabase: any = createClient(SUPABASE_URL, key, {
  auth: {
    persistSession: false,
  },
});

async function setupDatabase() {
  console.log("🚀 Setting up Supabase database schema...\n");

  try {
    // Create tables using REST API
    console.log("📦 Creating database tables...");

    const tables = [
      {
        name: "agents",
        sql: `
          CREATE TABLE IF NOT EXISTS agents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            machine TEXT,
            model TEXT,
            status TEXT DEFAULT 'offline',
            last_active TIMESTAMPTZ DEFAULT now(),
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
          CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
        `,
      },
      {
        name: "tasks",
        sql: `
          CREATE TABLE IF NOT EXISTS tasks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            label TEXT,
            description TEXT,
            status TEXT DEFAULT 'todo',
            agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
            model TEXT,
            duration_seconds INT,
            created_at TIMESTAMPTZ DEFAULT now(),
            completed_at TIMESTAMPTZ,
            metadata JSONB
          );
          CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks(agent_id);
          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
          CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
        `,
      },
      {
        name: "activity",
        sql: `
          CREATE TABLE IF NOT EXISTS activity (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
            type TEXT,
            content TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            metadata JSONB
          );
          CREATE INDEX IF NOT EXISTS idx_activity_agent_id ON activity(agent_id);
          CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at DESC);
        `,
      },
      {
        name: "costs",
        sql: `
          CREATE TABLE IF NOT EXISTS costs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
            model TEXT,
            input_tokens BIGINT,
            output_tokens BIGINT,
            cache_tokens BIGINT DEFAULT 0,
            cost_usd NUMERIC(10, 6),
            session_id TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_costs_agent_id ON costs(agent_id);
          CREATE INDEX IF NOT EXISTS idx_costs_created_at ON costs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_costs_session_id ON costs(session_id);
        `,
      },
      {
        name: "journal_entries",
        sql: `
          CREATE TABLE IF NOT EXISTS journal_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date DATE NOT NULL,
            agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
            tags TEXT[],
            accomplishments TEXT[],
            problems TEXT[],
            struggles TEXT[],
            stats JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(date, agent_id)
          );
          CREATE INDEX IF NOT EXISTS idx_journal_agent_id ON journal_entries(agent_id);
          CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date DESC);
        `,
      },
      {
        name: "files",
        sql: `
          CREATE TABLE IF NOT EXISTS files (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT,
            path TEXT,
            size_bytes BIGINT,
            uploaded_by UUID REFERENCES agents(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(uploaded_by);
          CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
        `,
      },
    ];

    for (const table of tables) {
      console.log(`  Creating ${table.name}...`);
      try {
        const result = await supabase.rpc("exec_sql", { sql: table.sql });
        console.log(`  ✓ ${table.name} created`);
      } catch (err: any) {
        if (err.message && err.message.includes("already exists")) {
          console.log(`  ℹ️  ${table.name} already exists`);
        } else {
          console.warn(`  ⚠️  ${err.message}`);
        }
      }
    }

    console.log("\n✅ Database schema setup complete!\n");

    // Insert default agent (Otto)
    console.log("🤖 Inserting default agent (Otto)...");
    try {
      const { data: existingAgent } = await supabase
        .from("agents")
        .select("id")
        .eq("name", "otto")
        .single();

      if (!existingAgent) {
        const { error: insertError } = await supabase.from("agents").insert([
          {
            name: "otto",
            machine: process.env.HOSTNAME || "vtto-System-Product-Name",
            model: "anthropic/claude-haiku-4-5",
            status: "online",
            metadata: {
              provider: "OpenClaw",
              session_count: 0,
            },
          },
        ]);

        if (insertError) {
          console.error("⚠️  Could not insert default agent:", insertError);
        } else {
          console.log("✓ Default agent (Otto) inserted");
        }
      } else {
        console.log("ℹ️  Default agent (Otto) already exists");
      }
    } catch (err) {
      console.error("⚠️  Error with agent setup:", err);
    }

    console.log("\n🎉 Setup complete!\n");
    console.log("Environment variables to use:");
    console.log(`  NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}`);
    console.log(`  NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>`);
  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

setupDatabase();
