import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:7642',
    },
  },
  build: {
    // Emit to repo-root/dist-dashboard — the daemon's first lookup path, and a
    // location included in the published package's `files` (unlike src/**).
    outDir: path.resolve(__dirname, '../../dist-dashboard'),
    emptyOutDir: true,
  },
});
