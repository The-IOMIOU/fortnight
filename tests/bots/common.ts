// Shared helpers for the long headless bot-match suites (npm run test:bots).
// Each file runs its own slice of matches (vitest runs files in parallel) and writes its results to
// test-results/bots/<name>.json; `node tools/bot-report.mjs` prints the combined report.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runMatch, type MatchResult, type MatchSpec } from '../../src/harness/match';
import { PERSONALITIES, type Difficulty } from '../../src/ai/utility';
import { Rng } from '../../src/sim/core/prng';
import type { MapSize } from '../../src/sim/core/tuning';

/** Match k of the F-126 set: Small map, 2–4 Hard bots with seeded random personalities. */
export function f126Spec(k: number, size: MapSize = 'small', diff: Difficulty = 'hard'): MatchSpec {
  const rng = Rng.stream('f126', `${size}-${k}`);
  const n = 2 + rng.int(3);
  return { seed: `f126-${size}-${k}`, size, bots: Array.from({ length: n }, (_, p) => ({ player: p, personality: PERSONALITIES[rng.int(PERSONALITIES.length)].id, difficulty: diff })) };
}

export function line(r: MatchResult): string {
  const who = r.metrics.map((m) => `${m.personality}/${m.difficulty}`).join(' v ');
  return `${r.seed} [${who}]: ${r.finished ? `P${r.winner + 1} (${r.metrics[r.winner].personality}/${r.metrics[r.winner].difficulty}) won by ${r.victory}` : 'NOT FINISHED'} at ${r.minutes.toFixed(1)} min, ${r.msPerTick.toFixed(2)} ms/tick (bots ${r.botMsPerTick.toFixed(2)})`;
}

export function runAll(name: string, specs: MatchSpec[]): MatchResult[] {
  const out: MatchResult[] = [];
  for (const s of specs) { const r = runMatch(s); out.push(r); console.log(`[${name}] ${line(r)}`); }
  mkdirSync('test-results/bots', { recursive: true });
  writeFileSync(`test-results/bots/${name}.json`, JSON.stringify(out, null, 1));
  return out;
}

export const median = (xs: number[]): number => { const a = [...xs].sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : NaN; };
