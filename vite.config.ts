import { defineConfig } from 'vitest/config';

// Relative base so the built site works from any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 120000 },
});
