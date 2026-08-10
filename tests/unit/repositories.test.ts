import { createRequire } from 'node:module';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');
import {
  SessionRepository,
  EventRepository,
  LogRepository,
} from '../../src/database/repositories.js';

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
  log_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  stream TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  return db;
}

describe('SessionRepository', () => {
  it('create + get roundtrips a session', () => {
    const db = makeDb();
    const repo = new SessionRepository(db);
    const s = repo.create({ id: 'a', projectPath: '/p', status: 'starting' });
    expect(s.id).toBe('a');
    expect(s.status).toBe('starting');
    expect(s.projectPath).toBe('/p');
    expect(s.pid).toBeNull();
    expect(s.logPath).toBeNull();
    expect(repo.get('a')?.id).toBe('a');
    expect(repo.get('missing')).toBeNull();
  });

  it('update patches only supplied fields', () => {
    const db = makeDb();
    const repo = new SessionRepository(db);
    repo.create({ id: 'a', projectPath: '/p', status: 'starting' });
    repo.update('a', { status: 'working', pid: 42 });
    const s = repo.get('a')!;
    expect(s.status).toBe('working');
    expect(s.pid).toBe(42);
    repo.update('a', {}); // no-op
    expect(repo.get('a')?.status).toBe('working');
  });

  it('list filters by explicit status and by active', () => {
    const db = makeDb();
    const repo = new SessionRepository(db);
    repo.create({ id: '1', projectPath: '/p', status: 'starting' });
    repo.create({ id: '2', projectPath: '/p', status: 'working' });
    repo.create({ id: '3', projectPath: '/p', status: 'completed' });
    repo.create({ id: '4', projectPath: '/p', status: 'waiting' });

    expect(repo.list().length).toBe(4);
    expect(repo.list({ status: 'completed' }).map((s) => s.id)).toEqual(['3']);
    const active = repo.activeSessions().map((s) => s.id).sort();
    expect(active).toEqual(['1', '2', '4']);
  });
});

describe('EventRepository', () => {
  it('append + listForSession returns newest first', () => {
    const db = makeDb();
    const repo = new EventRepository(db);
    repo.append('sess', 'a.happened', { x: 1 });
    repo.append('sess', 'b.happened', { y: 2 });
    repo.append('other', 'c.happened', {});
    const rows = repo.listForSession('sess');
    expect(rows.length).toBe(2);
    expect(rows[0]!.type).toBe('b.happened');
    expect(JSON.parse(rows[0]!.payload)).toEqual({ y: 2 });
  });

  it('accepts null session id', () => {
    const db = makeDb();
    const repo = new EventRepository(db);
    expect(() => repo.append(null, 'daemon.started', null)).not.toThrow();
  });
});

describe('LogRepository', () => {
  it('append + tail returns lines in chronological order', () => {
    const db = makeDb();
    const repo = new LogRepository(db);
    repo.append('sess', 'stdout', 'one\n');
    repo.append('sess', 'stderr', 'two\n');
    repo.append('sess', 'stdout', 'three\n');
    const lines = repo.tail('sess');
    expect(lines.map((l) => l.content)).toEqual(['one\n', 'two\n', 'three\n']);
    expect(lines[1]!.stream).toBe('stderr');
  });

  it('tail respects limit and keeps the most recent', () => {
    const db = makeDb();
    const repo = new LogRepository(db);
    for (let i = 0; i < 10; i++) repo.append('sess', 'stdout', `${i}`);
    const lines = repo.tail('sess', 3);
    expect(lines.map((l) => l.content)).toEqual(['7', '8', '9']);
  });

  it('purgeOlderThan deletes rows older than cutoff', () => {
    const db = makeDb();
    const repo = new LogRepository(db);
    // Insert an old row directly to bypass nowIso()
    const oldTs = new Date(Date.now() - 30 * 86400_000).toISOString();
    db.prepare(
      `INSERT INTO logs (session_id, stream, content, created_at) VALUES (?, ?, ?, ?)`
    ).run('sess', 'stdout', 'ancient', oldTs);
    repo.append('sess', 'stdout', 'fresh');

    const purged = repo.purgeOlderThan(7);
    expect(purged).toBe(1);
    expect(repo.tail('sess').map((l) => l.content)).toEqual(['fresh']);
  });

  it('purgeOlderThan(0) is a no-op', () => {
    const db = makeDb();
    const repo = new LogRepository(db);
    repo.append('sess', 'stdout', 'x');
    expect(repo.purgeOlderThan(0)).toBe(0);
    expect(repo.tail('sess').length).toBe(1);
  });
});
