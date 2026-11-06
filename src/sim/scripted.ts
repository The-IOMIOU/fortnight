// Deterministic scripted run used by tests (Node) and by the in-browser determinism check:
// identical code path on every JS engine, so hashes must match exactly.
// Each player's script exercises the economy: scouting, gathering, hunting, training, building.
import { Sim } from './sim';
import { Rng } from './core/prng';
import { FP_ONE } from './core/fixed';
import type { MapSize } from './core/tuning';
import type { Command, CommandBody } from './commands';
import { BUILDING_TYPES, Kind, Res, RES_NONE, Task, UNIT_TYPES } from './defs';

export function ownedOfKind(sim: Sim, p: number, kind: number): number[] {
  const e = sim.ents, out: number[] = [];
  for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && e.kind[id] === kind) out.push(id);
  return out;
}

export function nearestResource(sim: Sim, fromTile: number, type: number, maxR = 30): number {
  const { w, h } = sim.map, x0 = fromTile % w, y0 = (fromTile - x0) / w;
  for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const t = y * w + x;
    if (sim.res.type[t] === type && sim.res.amount[t] > 0) return t;
  }
  return -1;
}

/** First valid anchor for a building near a tile, scanning rings outward. */
export function findPlacement(sim: Sim, p: number, btype: (typeof BUILDING_TYPES)[number], near: number, maxR = 12): number {
  const { w, h } = sim.map, x0 = near % w, y0 = (near - x0) / w;
  for (let r = 2; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (sim.canPlace(p, btype, y * w + x) === null) return y * w + x;
  }
  return -1;
}

export function issue(sim: Sim, p: number, body: CommandBody): void {
  const seq = sim.ps[p].seq++;
  sim.enqueue({ ...body, tick: sim.tick, player: p, seq } as Command);
}

/** Runs a match with a seeded scripted command log; returns state hash at each checkpoint tick. */
export function scriptedRun(seed: string, size: MapSize, players: number, checkpoints: number[], onTick?: (sim: Sim) => void): Record<number, number> {
  const sim = new Sim({ seed, size, players });
  const rng = Rng.stream(seed, 'script');
  const out: Record<number, number> = {};
  const last = Math.max(...checkpoints);
  const cps = new Set(checkpoints);
  while (sim.tick < last) {
    scriptTick(sim, rng);
    sim.step();
    onTick?.(sim);
    if (cps.has(sim.tick)) out[sim.tick] = sim.hash();
  }
  return out;
}

/** One tick of every player's script (deterministic given sim state + rng). */
export function scriptTick(sim: Sim, rng: Rng): void {
  const w = sim.map.w;
  for (let p = 0; p < sim.players; p++) {
    const t = sim.tick;
    if (t % 25 === 0) {
      for (const s of ownedOfKind(sim, p, Kind.SCOUT)) issue(sim, p, { type: 'move', ids: [s], x: rng.int(w * FP_ONE), y: rng.int(sim.map.h * FP_ONE) });
    }
    if (t % 50 === 3) {
      const cap = ownedOfKind(sim, p, Kind.BUILDING_BASE)[0];
      if (cap === undefined) continue;
      const capTile = sim.ents.anchor[cap];
      const workers = ownedOfKind(sim, p, Kind.WORKER);
      const idle = workers.filter((id) => sim.ents.task[id] === Task.IDLE);
      for (const id of idle) {
        const pick = rng.int(4);
        if (pick === 0) {
          // hunt the nearest visible-or-not animal (script only, not an AI)
          let best = -1, bd = 1e9;
          for (let a = 0; a < sim.ents.count; a++) if (sim.ents.alive[a] && (sim.ents.kind[a] === Kind.ANIMAL || sim.ents.kind[a] === Kind.CARCASS)) {
            const d = Math.abs(sim.ents.posX[a] - sim.ents.posX[id]) + Math.abs(sim.ents.posY[a] - sim.ents.posY[id]);
            if (d < bd) { bd = d; best = a; }
          }
          if (best >= 0 && bd < 20 * FP_ONE) { issue(sim, p, { type: 'interact', ids: [id], target: best }); continue; }
        }
        const type = pick === 1 ? Res.STONE : Res.WOOD;
        const r = nearestResource(sim, capTile, type);
        if (r >= 0 && sim.res.type[r] !== RES_NONE) issue(sim, p, { type: 'gather', ids: [id], tile: r });
      }
      const ps = sim.ps[p];
      if (ps.stock[Res.FOOD] >= 60 && sim.ents.queues[cap].length < 2 && ps.pop < 12) issue(sim, p, { type: 'train', building: cap, utype: UNIT_TYPES.indexOf('worker') });
      if (ps.stock[Res.WOOD] >= 70 && ps.pop + 2 >= ps.housing && workers.length) {
        const a = findPlacement(sim, p, 'house', capTile);
        if (a >= 0) issue(sim, p, { type: 'place', ids: [workers[0]], btype: BUILDING_TYPES.indexOf('house'), tile: a });
      } else if (ps.stock[Res.WOOD] >= 120 && workers.length > 3 && rng.int(3) === 0) {
        const a = findPlacement(sim, p, 'farm', capTile);
        if (a >= 0) issue(sim, p, { type: 'place', ids: [workers[1]], btype: BUILDING_TYPES.indexOf('farm'), tile: a });
      }
    }
  }
}
