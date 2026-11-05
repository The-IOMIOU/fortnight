// Deterministic scripted run used by tests (Node) and by the in-browser determinism check:
// identical code path on every JS engine, so hashes must match exactly.
import { Sim } from './sim';
import { Rng } from './core/prng';
import { FP_ONE } from './core/fixed';
import type { MapSize } from './core/tuning';

/** Runs a match with a seeded pseudo-random command log; returns state hash at each checkpoint tick. */
export function scriptedRun(seed: string, size: MapSize, players: number, checkpoints: number[]): Record<number, number> {
  const sim = new Sim({ seed, size, players });
  const rng = Rng.stream(seed, 'script');
  const out: Record<number, number> = {};
  const last = Math.max(...checkpoints);
  const cps = new Set(checkpoints);
  const seqs = new Array(players).fill(0);
  while (sim.tick < last) {
    if (sim.tick % 25 === 0) {
      for (let p = 0; p < sim.players; p++) {
        sim.enqueue({ type: 'move', tick: sim.tick, player: p, seq: seqs[p]++, ids: [p],
          x: rng.int(sim.map.w * FP_ONE), y: rng.int(sim.map.h * FP_ONE) });
      }
    }
    sim.step();
    if (cps.has(sim.tick)) out[sim.tick] = sim.hash();
  }
  return out;
}
