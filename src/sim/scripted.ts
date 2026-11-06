// Deterministic scripted run used by tests (Node) and by the in-browser determinism check:
// identical code path on every JS engine, so hashes must match exactly.
// Each player's script exercises the economy: scouting, gathering, hunting, training, building.
import { Sim } from './sim';
import type { MapOpts } from './world/mapgen';
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

/** Small starting army per player (4 spearmen, 2 archers) so scripted matches always include combat. */
export function addStartingArmy(sim: Sim): void {
  for (let p = 0; p < sim.players; p++) {
    const cap = ownedOfKind(sim, p, Kind.BUILDING_BASE)[0];
    if (cap === undefined) continue;
    const r = sim.footprintRect(cap, 2);
    for (const u of ['spearman', 'spearman', 'spearman', 'spearman', 'archer', 'archer'] as const) {
      const t = sim.freeTileNear(r, false);
      const id = sim.spawnUnitAt(p, u, t);
      r.x0--; r.y0--; r.x1++; r.y1++;
      void id;
    }
  }
}

export function issue(sim: Sim, p: number, body: CommandBody): void {
  const seq = sim.ps[p].seq++;
  sim.enqueue({ ...body, tick: sim.tick, player: p, seq } as Command);
}

/** Runs a match with a seeded scripted command log; returns state hash at each checkpoint tick. */
export function scriptedRun(seed: string, size: MapSize, players: number, checkpoints: number[], onTick?: (sim: Sim) => void, world?: MapOpts): Record<number, number> {
  const sim = new Sim(world ? { seed, size, players, world } : { seed, size, players });
  addStartingArmy(sim);
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
      const farms = ownedOfKind(sim, p, Kind.BUILDING_BASE + BUILDING_TYPES.indexOf('farm')).filter((f) => sim.ents.complete[f]);
      for (const id of idle) {
        if (sim.ps[p].stock[Res.FOOD] < 150 && farms.length) {
          // feed the people: put idle workers on a farm with a free slot
          const f = farms.find((b) => sim.workersAt(b) < 2);
          if (f !== undefined) { issue(sim, p, { type: 'interact', ids: [id], target: f }); continue; }
        }
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
      } else if (ps.stock[Res.WOOD] >= 70 && workers.length > 3 && (ps.stock[Res.FOOD] < 150 || rng.int(3) === 0)) {
        const a = findPlacement(sim, p, 'farm', capTile);
        if (a >= 0) issue(sim, p, { type: 'place', ids: [workers[1]], btype: BUILDING_TYPES.indexOf('farm'), tile: a });
      }
      // ---- military (Phase 3) ----
      const barracks = ownedOfKind(sim, p, Kind.BUILDING_BASE + BUILDING_TYPES.indexOf('barracks'));
      if (!barracks.length && t > 1200 && ps.stock[Res.WOOD] >= 120 && ps.stock[Res.STONE] >= 30 && workers.length > 2) {
        const a = findPlacement(sim, p, 'barracks', capTile);
        if (a >= 0) issue(sim, p, { type: 'place', ids: [workers[2]], btype: BUILDING_TYPES.indexOf('barracks'), tile: a });
      } else if (barracks.length && sim.ents.complete[barracks[0]] && sim.ents.queues[barracks[0]].length < 1 && ps.stock[Res.FOOD] >= 60 && ps.stock[Res.WOOD] >= 50) {
        issue(sim, p, { type: 'train', building: barracks[0], utype: UNIT_TYPES.indexOf(rng.int(2) ? 'spearman' : 'archer') });
      }
      if (t % 300 === 3) {
        const army = [...ownedOfKind(sim, p, Kind.SPEARMAN), ...ownedOfKind(sim, p, Kind.ARCHER)].filter((id) => sim.ents.task[id] === Task.IDLE);
        if (army.length) {
          // attack the nearest enemy on the same continent, else patrol near the capital
          let target = -1, bd = 80 * FP_ONE;
          const home = sim.map.continent[sim.tileOf(army[0])];
          for (let o = 0; o < sim.ents.count; o++) if (sim.ents.alive[o] && sim.ents.owner[o] !== p && sim.ents.owner[o] < sim.players && sim.ents.carrier[o] < 0 && !sim.ps[sim.ents.owner[o]].eliminated && sim.map.continent[sim.tileOf(o)] === home) {
            const d = Math.abs(sim.ents.posX[o] - sim.ents.posX[army[0]]) + Math.abs(sim.ents.posY[o] - sim.ents.posY[army[0]]);
            if (d < bd) { bd = d; target = o; }
          }
          if (target >= 0) issue(sim, p, { type: 'attack', ids: army, target });
          else issue(sim, p, { type: 'patrol', ids: army, x: (capTile % w) * FP_ONE + rng.int(16 * FP_ONE) - 8 * FP_ONE, y: Math.floor(capTile / w) * FP_ONE + rng.int(16 * FP_ONE) - 8 * FP_ONE });
        }
      }
      if (t % 700 === 3 && ps.stock[Res.STONE] >= 40 && workers.length > 2) {
        const x = (capTile % w) + 6, y = Math.floor(capTile / w) - 2;
        const line = [0, 1, 2].map((k) => (y + k) * w + x);
        issue(sim, p, rng.int(2) ? { type: 'placeLine', ids: [workers[0]], btype: BUILDING_TYPES.indexOf('wall'), tiles: line } : { type: 'dig', ids: [workers[1]], tiles: line.map((q) => q + 1) });
      }
    }
  }
}
