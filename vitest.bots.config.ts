import { defineConfig } from 'vitest/config';

// Long headless bot-match suites (F-121, F-123, F-126, F-127): `npm run test:bots`, then
// `node tools/bot-report.mjs` for the combined report. Not part of the quick `npm test`.
export default defineConfig({
  test: { include: ['tests/bots/**/*.test.ts'], environment: 'node', testTimeout: 6 * 3600 * 1000, maxWorkers: 9 },
});
