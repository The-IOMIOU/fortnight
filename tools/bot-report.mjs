// Combined report of the headless bot suites: node tools/bot-report.mjs (after npm run test:bots).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const dir = 'test-results/bots';
if (!existsSync(dir)) { console.log('No results yet: run npm run test:bots first.'); process.exit(0); }
const sets = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))]));
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN; };
const f126 = Object.entries(sets).filter(([k]) => k.startsWith('f126-')).flatMap(([, v]) => v);
if (f126.length) {
  const done = f126.filter((r) => r.finished);
  console.log(`F-126 Small: ${done.length}/${f126.length} finished (${done.filter((r) => r.victory === 'conquest').length} conquest, ${done.filter((r) => r.victory === 'domination').length} domination)`);
  console.log(`F-127 Small: median ${median(done.map((r) => r.minutes)).toFixed(1)} min over finished matches (min ${Math.min(...done.map((r) => r.minutes)).toFixed(1)}, max ${Math.max(...done.map((r) => r.minutes)).toFixed(1)}); target 15–25`);
  console.log(`Sim speed: median ${median(f126.map((r) => r.msPerTick)).toFixed(2)} ms/tick incl. bots ${median(f126.map((r) => r.botMsPerTick)).toFixed(2)} ms/tick`);
  for (const r of f126.filter((x) => !x.finished)) console.log(`  not finished: ${r.seed} (${r.metrics.map((m) => m.personality).join(' v ')})`);
}
for (const [k, v] of Object.entries(sets)) if (!k.startsWith('f126-')) {
  const done = v.filter((r) => r.finished);
  const wins = {}; for (const r of done) { const d = r.metrics[r.winner].difficulty; wins[d] = (wins[d] ?? 0) + 1; }
  console.log(`${k}: ${done.length}/${v.length} finished, median ${median(done.map((r) => r.minutes)).toFixed(1)} min, wins by difficulty ${JSON.stringify(wins)}`);
}
if (sets.personalities) {
  const all = sets.personalities.flatMap((r) => r.metrics);
  const ids = [...new Set(all.map((m) => m.personality))];
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  for (const id of ids) {
    const ms = all.filter((m) => m.personality === id);
    console.log(`F-123 ${id}: settlements founded ${mean(ms.map((m) => m.settlementsFounded)).toFixed(2)}, walls+towers ${mean(ms.map((m) => m.walls + m.towers)).toFixed(2)}, first attack median min ${median(ms.map((m) => (m.firstAttack < 0 ? 99 : m.firstAttack / 600))).toFixed(1)}, peak army ${mean(ms.map((m) => m.peakArmy)).toFixed(1)}`);
  }
}
