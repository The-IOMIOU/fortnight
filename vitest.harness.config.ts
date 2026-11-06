import { defineConfig } from 'vitest/config';

// Balance harness (F-098): `npm run harness -- --matches 500 [--minutes 40]`, then the report prints.
export default defineConfig({
  test: { include: ['tests/harness/**/*.test.ts'], environment: 'node', testTimeout: 24 * 3600 * 1000, maxWorkers: 9 },
});
