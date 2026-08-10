import type { ILogRepository } from '../database/repo-types.js';
import type { Config } from '../shared/config.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function startLogRotation(logRepo: ILogRepository, config: Config): () => void {
  const run = () => {
    try {
      const purged = logRepo.purgeOlderThan(config.logRetentionDays);
      if (purged) console.log(`[claudekeeper] purged ${purged} old log lines`);
    } catch (err) {
      console.error('[claudekeeper] log rotation failed:', err);
    }
  };
  run();
  const timer = setInterval(run, SIX_HOURS_MS);
  timer.unref();
  return () => clearInterval(timer);
}
