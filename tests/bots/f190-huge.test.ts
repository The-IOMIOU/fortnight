// F-190: Huge map, 1 idle human seat + 31 Hard bots with random peoples, 30 game minutes, headless.
// Reports sim + bot cost per tick (the browser runs 10 ticks/s at 1×, so < 100 ms/tick keeps up; target ≤ 50)
// and memory. Frame rate needs the headed perf suite (not runnable on every machine).
import { expect, it } from 'vitest';
import { Sim } from '../../src/sim/sim';
import { BotManager } from '../../src/ai/manager';
import { PLAYABLE_RACES } from '../../src/sim/races';
import { PERSONALITIES } from '../../src/ai/utility';
import { Rng } from '../../src/sim/core/prng';

it('F-190 Huge with 32 players runs 30 minutes; sim keeps up', () => {
  const rng = Rng.stream('f190', 'setup');
  const races = Array.from({ length: 32 }, () => PLAYABLE_RACES[rng.int(PLAYABLE_RACES.length)].id);
  const s = new Sim({ seed: 'f190-huge', size: 'huge', players: 32, races });
  const bots = new BotManager(s, Array.from({ length: 31 }, (_, k) => ({ player: k + 1, personality: PERSONALITIES[rng.int(PERSONALITIES.length)].id, difficulty: 'hard' as const })));
  const T = 30 * 600, per: number[] = [];
  let worst = 0, minuteMs = 0;
  const heap0 = process.memoryUsage().heapUsed;
  for (let k = 0; k < T && s.winner < 0; k++) {
    const t0 = performance.now();
    bots.tick(); s.step();
    const dt = performance.now() - t0;
    minuteMs += dt; worst = Math.max(worst, dt);
    if ((k + 1) % 600 === 0) { per.push(minuteMs / 600); minuteMs = 0; }
  }
  const heap = process.memoryUsage().heapUsed;
  let units = 0;
  for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.kind[id] < 64) units++;
  const avg = per.reduce((a, b) => a + b, 0) / per.length;
  console.log(`[F-190] Huge, 32 players (31 Hard bots, random peoples), ${s.tick} ticks: avg ${avg.toFixed(2)} ms/tick, slowest minute ${Math.max(...per).toFixed(2)} ms/tick, worst single tick ${worst.toFixed(0)} ms; ${units} units, ${s.ents.count} entity slots; heap ${(heap / 1048576).toFixed(0)} MB (+${((heap - heap0) / 1048576).toFixed(0)} MB during the match); per-minute ms/tick ${per.map((x) => x.toFixed(1)).join(' ')}`);
  expect(s.tick).toBeGreaterThan(0);
  expect(avg).toBeLessThan(100);
});
