import path from 'node:path';
import type { EventBus } from './events.js';
import type { SessionRepository } from '../database/repositories.js';
import type { Config } from '../shared/config.js';
import type { KeeperEvent } from '../shared/types.js';
import { notify } from '../macos/system.js';
import { shortId } from '../cli/format.js';

const DEBOUNCE_MS = 5000;
const RATE_LIMIT_MS = 1000;

export class Notifier {
  private unsubscribe: (() => void) | null = null;
  private recent = new Map<string, number>(); // key -> lastSentMs
  private lastSentAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private bus: EventBus,
    private sessionRepo: SessionRepository,
    private config: Config
  ) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.bus.subscribe((event) => this.handle(event));
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private handle(event: KeeperEvent): void {
    if (!this.config.notifications) return;
    let title: string | null = null;
    let body: string | null = null;
    switch (event.type) {
      case 'session.completed': {
        const name = this.projectName(event.sessionId);
        title = `Claude finished · ${name}`;
        body = `session ${shortId(event.sessionId)} completed`;
        break;
      }
      case 'session.failed': {
        title = 'Claude failed';
        body = `session ${shortId(event.sessionId)} failed (exit ${event.exitCode ?? 'n/a'})`;
        break;
      }
      case 'session.crashed': {
        title = 'Claude crashed';
        body = `session ${shortId(event.sessionId)} crashed${event.error ? `: ${event.error}` : ''}`;
        break;
      }
      default:
        return;
    }
    if (!title || !body) return;
    this.dispatch(title, body);
  }

  private dispatch(title: string, body: string): void {
    const key = `${title}\n${body}`;
    const now = Date.now();
    const last = this.recent.get(key) ?? 0;
    if (now - last < DEBOUNCE_MS) return;
    this.recent.set(key, now);
    // prune old entries occasionally
    if (this.recent.size > 64) {
      for (const [k, ts] of this.recent) {
        if (now - ts > DEBOUNCE_MS * 4) this.recent.delete(k);
      }
    }
    this.queue = this.queue.then(async () => {
      const gap = Date.now() - this.lastSentAt;
      if (gap < RATE_LIMIT_MS) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - gap));
      }
      this.lastSentAt = Date.now();
      try {
        await notify(title, body);
      } catch {
        /* best-effort */
      }
    });
  }

  private projectName(sessionId: string): string {
    const s = this.sessionRepo.get(sessionId);
    if (!s) return 'session';
    return path.basename(s.projectPath.replace(/\/$/, '')) || s.projectPath;
  }
}
