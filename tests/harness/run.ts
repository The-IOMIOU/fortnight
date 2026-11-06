// Balance harness (F-098): headless 1v1 bot matches with random peoples, personalities and seeds.
// Each shard file runs every 9th match; results go to harness-results/<shard>.json; tools/harness-report.mjs sums up.
import { mkdirSync, writeFileSync } from 'node:fs';
import { runMatch } from '../../src/harness/match';
import { RACES } from '../../src/sim/races';
import { Rng } from '../../src/sim/core/prng';
import { computeStats } from '../../src/sim/stats';
import type { Sim } from '../../src/sim/sim';

export const SHARDS = 9;
export interface HarnessResult { k: number; seed: string; races: string[]; pers: string[]; finished: boolean; winner: number; byScore: boolean; minutes: number; score: number[] }

export function runShard(shard: number): HarnessResult[] {
  const total = +(process.env.HARNESS_MATCHES ?? 90), minutes = +(process.env.HARNESS_MINUTES ?? 40);
  const out: HarnessResult[] = [];
  for (let k = shard; k < total; k += SHARDS) {
    const rng = Rng.stream('harness', String(k));
    const a = RACES[rng.int(RACES.length)];
    let b = RACES[rng.int(RACES.length)];
    if (b.id === a.id) b = RACES[(RACES.indexOf(a) + 1 + rng.int(RACES.length - 1)) % RACES.length];
    const pa = a.bot_hints.personalities[rng.int(a.bot_hints.personalities.length)], pb = b.bot_hints.personalities[rng.int(b.bot_hints.personalities.length)];
    let last: Sim | null = null;
    const seed = `harness-${k}`;
    const r = runMatch({ seed, size: 'small', races: [a.id, b.id], maxTicks: minutes * 600, bots: [{ player: 0, personality: pa, difficulty: 'hard' }, { player: 1, personality: pb, difficulty: 'hard' }] }, (s) => { last = s; });
    const s = last as unknown as Sim;
    // unfinished: the side with more land + army wins on points (reported separately)
    const score = [0, 1].map((p) => { const st = computeStats(s, p); return st.landOwned + st.army; });
    const winner = r.finished ? r.winner : score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
    out.push({ k, seed, races: [a.id, b.id], pers: [pa, pb], finished: r.finished, winner, byScore: !r.finished, minutes: r.minutes, score });
  }
  mkdirSync('harness-results', { recursive: true });
  writeFileSync(`harness-results/shard-${shard}.json`, JSON.stringify(out, null, 1));
  return out;
}
