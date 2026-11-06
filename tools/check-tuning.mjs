// F-002: every constant in src/data/tuning.json must be documented in TUNING.md (as `dotted.path`).
import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync('src/data/tuning.json', 'utf8'));
const md = readFileSync('TUNING.md', 'utf8');
const leaves = [];
const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; v && typeof v === 'object' ? walk(v, q) : leaves.push([q, v]); } };
walk(t, '');
const missing = leaves.filter(([k]) => !md.includes('`' + k + '`'));
// Table rows look like: | `dotted.path` | value | why |
const documented = new Map();
for (const line of md.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length > 3 && cells[1].startsWith('`') && cells[1].endsWith('`')) documented.set(cells[1].slice(1, -1), cells[2]);
}
const wrong = leaves.filter(([k, v]) => documented.has(k) && documented.get(k) !== String(v));
if (missing.length || wrong.length) {
  console.error('check-tuning FAILED');
  for (const [k] of missing) console.error('  missing in TUNING.md: ' + k);
  for (const [k, v] of wrong) console.error(`  value mismatch: ${k} (json = ${v})`);
  process.exit(1);
}
console.log(`check-tuning OK (${leaves.length} constants documented)`);
