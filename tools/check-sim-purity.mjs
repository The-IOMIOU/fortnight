// F-010: the deterministic sim must not use wall-clock time, Math.random or engine-approximated math.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  [/Math\.random/, 'Math.random'], [/\bDate\b/, 'Date'], [/performance\.now/, 'performance.now'],
  [/Math\.(sin|cos|tan|asin|acos|atan2?|exp|expm1|log\w*|pow|sqrt|cbrt|hypot|sinh|cosh|tanh)\b/, 'transcendental Math'],
  [/\*\*/, 'exponent operator'], [/\bsetTimeout|setInterval|requestAnimationFrame/, 'timers'],
];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && files.push(p); } };
walk('src/sim');
const problems = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  src.split('\n').forEach((line, i) => { for (const [re, name] of BANNED) if (re.test(line)) problems.push(`${f}:${i + 1}: ${name}: ${line.trim()}`); });
}
if (problems.length) { console.error('check-sim-purity FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`check-sim-purity OK (${files.length} files in src/sim)`);
