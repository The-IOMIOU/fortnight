// Balance report (F-098): win rate per people with a 95 % Wilson interval; flags peoples outside 35–65 %.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const dir = 'harness-results';
if (!existsSync(dir)) { console.log('No results: run npm run harness first.'); process.exit(0); }
const all = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
const LO = 35, HI = 65;
const wilson = (w, n) => { if (!n) return [0, 100]; const z = 1.96, p = w / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n)); return [((c - m) / d) * 100, ((c + m) / d) * 100]; };
const stat = new Map();
for (const r of all) r.races.forEach((race, i) => {
  const s = stat.get(race) ?? { n: 0, w: 0, fin: 0 };
  if (r.winner >= 0) { s.n++; if (r.winner === i) s.w++; }
  if (r.finished) s.fin++;
  stat.set(race, s);
});
const fin = all.filter((r) => r.finished).length;
console.log(`Balance harness: ${all.length} matches (1v1 Small, Hard bots), ${fin} finished, ${all.length - fin} decided on points (land + army) at the time limit; ties left out.`);
console.log('people          games  wins  win %   95 % interval   flag');
const rows = [...stat.entries()].sort((a, b) => b[1].w / Math.max(1, b[1].n) - a[1].w / Math.max(1, a[1].n));
for (const [race, s] of rows) {
  const p = s.n ? (100 * s.w) / s.n : 0, [lo, hi] = wilson(s.w, s.n);
  const flag = s.n < 10 ? 'too few games' : p < LO ? `LOW (< ${LO} %)` : p > HI ? `HIGH (> ${HI} %)` : '';
  console.log(`${race.padEnd(15)} ${String(s.n).padStart(5)} ${String(s.w).padStart(5)} ${p.toFixed(1).padStart(6)}   ${lo.toFixed(0).padStart(3)}–${hi.toFixed(0).padEnd(3)} %      ${flag}`);
}
