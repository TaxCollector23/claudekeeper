import { spawn, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ChildProcess } from 'node:child_process';

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
}

export interface StartedClaude {
  child: ChildProcess;
  executable: string;
  pid: number;
}

export interface ClaudeAdapter {
  findExecutable(): Promise<string | null>;
  isInstalled(): Promise<boolean>;
  start(options: ClaudeStartOptions): Promise<StartedClaude>;
}

export class DefaultClaudeAdapter implements ClaudeAdapter {
  private cached: string | null | undefined;

  async findExecutable(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    // Try PATH lookup first
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
    const exe = await this.findExecutable();
    if (!exe) throw new Error('Claude Code executable not found. Install it or configure its path.');
    const child = spawn(exe, options.args ?? [], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    if (!child.pid) {
      throw new Error('Failed to spawn Claude Code');
    }
    return { child, executable: exe, pid: child.pid };
  }
}
