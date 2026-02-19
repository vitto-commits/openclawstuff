import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.env.HOME || '/home/vtto', 'agent-dashboard', 'data.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initDb(_db);
  return _db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      agent TEXT DEFAULT '',
      priority TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT DEFAULT '',
      status TEXT DEFAULT 'offline',
      last_active TEXT DEFAULT '',
      session TEXT DEFAULT '',
      config_path TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT DEFAULT '',
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      level TEXT DEFAULT 'info',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT DEFAULT '',
      session TEXT DEFAULT '',
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      model TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed some agents if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM agents').get() as any;
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO agents (id, name, model, status, last_active) VALUES (?, ?, ?, ?, ?)');
    insert.run('main', 'Main Agent', 'claude-opus-4-6', 'online', new Date().toISOString());
    insert.run('coder', 'Coder Agent', 'gpt-5.2-codex', 'offline', '');
    insert.run('researcher', 'Researcher', 'claude-sonnet-4-20250514', 'offline', '');
  }
}
