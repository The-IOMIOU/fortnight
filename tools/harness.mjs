// npm run harness -- --matches 500 [--minutes 40]: runs the balance harness in parallel, then prints the report.
import { spawnSync } from 'node:child_process';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const env = { ...process.env, HARNESS_MATCHES: arg('matches', '90'), HARNESS_MINUTES: arg('minutes', '40') };
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.harness.config.ts'], { stdio: 'inherit', env, shell: true });
if (r.status) process.exit(r.status);
spawnSync('node', ['tools/harness-report.mjs'], { stdio: 'inherit', shell: true });
