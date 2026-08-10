import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 10_000,
    server: {
      deps: {
        // node:sqlite is a Node builtin — keep it out of Vite's module graph.
        external: [/^node:/, 'node:sqlite'],
      },
    },
  },
});
