import { ConfigSchema } from '../../src/shared/config.js';
import { DEFAULT_HOST, DEFAULT_PORT } from '../../src/shared/constants.js';

describe('ConfigSchema', () => {
  it('applies all defaults for an empty object', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.port).toBe(DEFAULT_PORT);
    expect(cfg.host).toBe(DEFAULT_HOST);
    expect(cfg.preventSleep).toBe(true);
    expect(cfg.notifications).toBe(true);
    expect(cfg.logRetentionDays).toBe(7);
    expect(cfg.autoResume).toBe(false);
  });

  it('merges partial input with defaults', () => {
    const cfg = ConfigSchema.parse({ port: 9000, preventSleep: false });
    expect(cfg.port).toBe(9000);
    expect(cfg.preventSleep).toBe(false);
    expect(cfg.host).toBe(DEFAULT_HOST);
    expect(cfg.notifications).toBe(true);
  });

  it('rejects out-of-range port', () => {
    expect(() => ConfigSchema.parse({ port: 0 })).toThrow();
    expect(() => ConfigSchema.parse({ port: 70000 })).toThrow();
    expect(() => ConfigSchema.parse({ port: 1.5 })).toThrow();
  });

  it('rejects wrong types', () => {
    expect(() => ConfigSchema.parse({ preventSleep: 'yes' })).toThrow();
    expect(() => ConfigSchema.parse({ host: 42 })).toThrow();
    expect(() => ConfigSchema.parse({ logRetentionDays: -1 })).toThrow();
  });
});
