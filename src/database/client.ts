import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_FILE, SESSIONS_LOG_DIR } from '../shared/constants.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  claude_session_id TEXT,
  pid INTEGER,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, id);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id, id);
`;

export type DB = DatabaseSync;

export function openDatabase(): DB {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_LOG_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec(`PRAGMA journal_mode = WAL;`);
  db.exec(`PRAGMA foreign_keys = ON;`);
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}

/** Idempotent additive migrations for columns added after v1. */
function applyMigrations(db: DB): void {
  const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as any[];
  const has = (name: string) => cols.some((c) => c.name === name);
  if (!has('log_path')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN log_path TEXT`);
  }
}
