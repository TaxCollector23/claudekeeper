import { spawn, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ChildProcess } from 'node:child_process';
import { SESSIONS_LOG_DIR } from '../shared/constants.js';

const execFile = promisify(execFileCb);

const SEARCH_PATHS = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(os.homedir(), '.local/bin/claude'),
  path.join(os.homedir(), '.claude/local/claude'),
];

export interface ClaudeStartOptions {
  cwd: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  /** Session id — used to derive the log file path. */
  sessionId: string;
}

export interface ClaudeResumeOptions {
  cwd: string;
  claudeSessionId: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  sessionId: string;
}

export interface StartedClaude {
  child: ChildProcess;
  executable: string;
  pid: number;
  logPath: string;
}

export interface ClaudeAdapter {
  findExecutable(): Promise<string | null>;
  isInstalled(): Promise<boolean>;
  start(options: ClaudeStartOptions): Promise<StartedClaude>;
  resume(options: ClaudeResumeOptions): Promise<StartedClaude>;
}

export class DefaultClaudeAdapter implements ClaudeAdapter {
  private cached: string | null | undefined;

  async findExecutable(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    try {
      const { stdout } = await execFile('which', ['claude']);
      const p = stdout.trim();
      if (p && fs.existsSync(p)) {
        this.cached = p;
        return p;
      }
    } catch {
      /* not on PATH */
    }
    for (const p of SEARCH_PATHS) {
      if (fs.existsSync(p)) {
        this.cached = p;
        return p;
      }
    }
    this.cached = null;
    return null;
  }

  async isInstalled(): Promise<boolean> {
    return (await this.findExecutable()) !== null;
  }

  async start(options: ClaudeStartOptions): Promise<StartedClaude> {
    return this.spawnDetached(options.sessionId, options.cwd, options.args ?? [], options.env);
  }

  async resume(options: ClaudeResumeOptions): Promise<StartedClaude> {
    const args = ['--resume', options.claudeSessionId, ...(options.args ?? [])];
    return this.spawnDetached(options.sessionId, options.cwd, args, options.env);
  }

  private async spawnDetached(
    sessionId: string,
    cwd: string,
    args: string[],
    env?: NodeJS.ProcessEnv
  ): Promise<StartedClaude> {
    const exe = await this.findExecutable();
    if (!exe) throw new Error('Claude Code executable not found. Install it or configure its path.');
    fs.mkdirSync(SESSIONS_LOG_DIR, { recursive: true });
    const logPath = path.join(SESSIONS_LOG_DIR, `${sessionId}.log`);
    // Open a single interleaved log file for both stdout and stderr; append mode.
    const outFd = fs.openSync(logPath, 'a');
    const errFd = fs.openSync(logPath, 'a');
    try {
      const child = spawn(exe, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', outFd, errFd],
        detached: true,
      });
      if (!child.pid) {
        throw new Error('Failed to spawn Claude Code');
      }
      child.unref();
      return { child, executable: exe, pid: child.pid, logPath };
    } finally {
      // The child inherits the fds; close our handles to avoid leaking descriptors in the daemon.
      try { fs.closeSync(outFd); } catch { /* ignore */ }
      try { fs.closeSync(errFd); } catch { /* ignore */ }
    }
  }
}
