import {
  MemorySessionRepository,
  MemoryEventRepository,
  MemoryLogRepository,
} from '../../src/database/memory-store.js';

describe('MemorySessionRepository', () => {
  it('creates and reads a session with defaults', () => {
    const repo = new MemorySessionRepository();
    const s = repo.create({ id: 'ck_1', projectPath: '/x', status: 'starting' });
    expect(s.id).toBe('ck_1');
    expect(s.status).toBe('starting');
    expect(s.endedAt).toBeNull();
    expect(s.exitCode).toBeNull();
    expect(repo.get('ck_1')?.projectPath).toBe('/x');
    expect(repo.get('missing')).toBeNull();
  });

  it('updates fields and bumps updatedAt', () => {
    const repo = new MemorySessionRepository();
    repo.create({ id: 'ck_1', projectPath: '/x', status: 'working' });
    repo.update('ck_1', { status: 'completed', exitCode: 0, endedAt: '2020-01-01T00:00:00Z' });
    const s = repo.get('ck_1')!;
    expect(s.status).toBe('completed');
    expect(s.exitCode).toBe(0);
    expect(s.endedAt).toBe('2020-01-01T00:00:00Z');
  });

  it('filters active sessions', () => {
    const repo = new MemorySessionRepository();
    repo.create({ id: 'a', projectPath: '/a', status: 'working' });
    repo.create({ id: 'b', projectPath: '/b', status: 'completed' });
    repo.create({ id: 'c', projectPath: '/c', status: 'waiting' });
    const active = repo.activeSessions().map((s) => s.id).sort();
    expect(active).toEqual(['a', 'c']);
    expect(repo.list({ status: 'completed' }).map((s) => s.id)).toEqual(['b']);
  });

  it('returns copies, not internal references', () => {
    const repo = new MemorySessionRepository();
    const s = repo.create({ id: 'a', projectPath: '/a', status: 'working' });
    s.status = 'failed';
    expect(repo.get('a')?.status).toBe('working');
  });
});

describe('MemoryEventRepository', () => {
  it('appends and lists newest-first, tolerates null session id', () => {
    const repo = new MemoryEventRepository();
    repo.append('s1', 'a', { x: 1 });
    repo.append('s1', 'b', {});
    repo.append(null, 'global', {});
    const rows = repo.listForSession('s1');
    expect(rows.map((r) => r.type)).toEqual(['b', 'a']);
    expect(rows[0].payload).toBe('{}');
  });
});

describe('MemoryLogRepository', () => {
  it('appends, tails in order, and purges by age', () => {
    const repo = new MemoryLogRepository();
    repo.append('s1', 'stdout', 'one');
    repo.append('s1', 'stderr', 'two');
    repo.append('s2', 'stdout', 'other');
    const tail = repo.tail('s1');
    expect(tail.map((l) => l.content)).toEqual(['one', 'two']);
    expect(tail[1].stream).toBe('stderr');
    expect(repo.purgeOlderThan(0)).toBe(0); // disabled
    // everything is "now", so purging older-than-1-day removes nothing
    expect(repo.purgeOlderThan(1)).toBe(0);
  });

  it('respects the tail limit', () => {
    const repo = new MemoryLogRepository();
    for (let i = 0; i < 10; i++) repo.append('s', 'stdout', String(i));
    expect(repo.tail('s', 3).map((l) => l.content)).toEqual(['7', '8', '9']);
  });
});
