// Phase 2 acceptance tests for the economy (run in Node; the same code runs in the browser worker).
import { describe, expect, it } from 'vitest';
import { Sim, type SimEvent } from '../src/sim/sim';
import { Rng } from '../src/sim/core/prng';
import { FP_ONE, tileCenter } from '../src/sim/core/fixed';
import { TUNING } from '../src/sim/core/tuning';
import { Biome, isWaterBiome } from '../src/sim/world/mapgen';
import { BUILDING_TYPES, FARM_YIELD, Kind, MOVE_COST, Res, RES_NAMES, RES_NONE, Task, UNIT_TYPES, buildingKind } from '../src/sim/defs';
import { findPlacement, issue, ownedOfKind, scriptTick } from '../src/sim/scripted';
import { computeStats } from '../src/sim/stats';
import { loadSim, saveSim, SaveError } from '../src/sim/serialize';

const ECO = TUNING.economy;
const B = (n: (typeof BUILDING_TYPES)[number]): number => BUILDING_TYPES.indexOf(n);
const capitalOf = (sim: Sim, p: number): number => ownedOfKind(sim, p, buildingKind('capital'))[0];

/** Nearest tile of resource `type` reachable on foot from `from` (BFS over passable tiles). */
function nearestReachable(sim: Sim, from: number, type: number): number {
  const { w, h } = sim.map, seen = new Uint8Array(w * h), q = [from];
  seen[from] = 1;
  while (q.length) {
    const t = q.shift()!, x = t % w, y = (t - x) / w;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      if (sim.res.type[j] === type && sim.res.amount[j] > 0) return j;
      if (sim.cost(j) > 0) q.push(j);
    }
  }
  return -1;
}
const unitTile = (sim: Sim, id: number): number => (sim.ents.posY[id] >> 10) * sim.map.w + (sim.ents.posX[id] >> 10);
const run = (sim: Sim, n: number, each?: () => void): void => { for (let k = 0; k < n; k++) { sim.step(); each?.(); } };
const acting = (sim: Sim, id: number, task: number): boolean => sim.ents.task[id] === task && !sim.ents.moving[id] && !sim.ents.waitPath[id];

describe('F-099 / P-001 starting race (Baseline)', () => {
  it('each player starts with a capital, 3 workers, 1 scout and the race starting resources', () => {
    const sim = new Sim({ seed: 'start', size: 'small', players: 4 });
    for (let p = 0; p < 4; p++) {
      expect(ownedOfKind(sim, p, buildingKind('capital')).length).toBe(1);
      expect(ownedOfKind(sim, p, Kind.WORKER).length).toBe(3);
      expect(ownedOfKind(sim, p, Kind.SCOUT).length).toBe(1);
      expect(sim.ps[p].stock).toEqual([200, 200, 100, 0, 0, 0]);
      expect(sim.ps[p].pop).toBe(4);
      expect(sim.ps[p].housing).toBe(10);
    }
  });
});

describe('F-050 resources and deposits', () => {
  it('all six resources obtainable: deposits of every type on every map; stone and gold near each start', () => {
    const out: string[] = [];
    for (const size of ['small', 'medium'] as const) for (let s = 0; s < 10; s++) {
      const sim = new Sim({ seed: `dep-${s}`, size, players: TUNING.map.sizes[size].maxPlayers });
      const counts = new Array(6).fill(0);
      for (let t = 0; t < sim.res.type.length; t++) if (sim.res.type[t] !== RES_NONE) counts[sim.res.type[t]]++;
      for (const r of [Res.WOOD, Res.STONE, Res.GOLD, Res.CARBON, Res.ADAMITE]) expect(counts[r]).toBeGreaterThan(0);
      const animals = ownedOfKind(sim, 254, Kind.ANIMAL).length;
      expect(animals).toBeGreaterThan(0); // food by hunting
      const R = TUNING.deposits.startGuaranteeRadius, w = sim.map.w;
      for (let p = 0; p < sim.players; p++) {
        const st = sim.map.starts[p], sx = st % w, sy = (st - sx) / w;
        for (const r of [Res.STONE, Res.GOLD]) {
          let ok = false;
          for (let t = 0; t < sim.res.type.length && !ok; t++) if (sim.res.type[t] === r) { const x = t % w, y = (t - x) / w; ok = (x - sx) * (x - sx) + (y - sy) * (y - sy) <= R * R; }
          expect(ok).toBe(true);
        }
      }
      if (s === 0) out.push(`${size}: deposit tiles ${RES_NAMES.map((n, i) => `${n}=${counts[i]}`).join(' ')}, animals=${animals}`);
    }
    console.log('[F-050] ' + out.join(' | '));
  });
});

describe('F-051 / F-052 gathering', () => {
  for (const [name, type] of [['wood', Res.WOOD], ['stone', Res.STONE], ['gold', Res.GOLD], ['carbon', Res.CARBON], ['adamite', Res.ADAMITE]] as const) {
    it(`${name}: gather rate while working matches TUNING (±5 %), and resources are conserved`, () => {
      let sim: Sim | null = null, tile = -1, worker = -1;
      for (let s = 0; s < 40 && tile < 0; s++) {
        sim = new Sim({ seed: `gather-${name}-${s}`, size: 'small', players: 1 });
        worker = ownedOfKind(sim, 0, Kind.WORKER)[0];
        tile = nearestReachable(sim, unitTile(sim, worker), type);
      }
      expect(tile).toBeGreaterThanOrEqual(0);
      const s = sim!;
      // need a drop-off: capital accepts everything
      const total = (): number => { let n = 0; for (let t = 0; t < s.res.type.length; t++) if (s.res.type[t] === type) n += s.res.amount[t]; return n; };
      const startTotal = total(), startStock = s.ps[0].stock[type];
      let actTicks = 0;
      issue(s, 0, { type: 'gather', ids: [worker], tile });
      run(s, 6000, () => { if (acting(s, worker, Task.GATHER)) actTicks++; });
      const removed = startTotal - total();
      const delivered = s.ps[0].stock[type] - startStock, carried = s.ents.carryAmt[worker];
      const rate = (removed * 600) / actTicks;
      const want = ECO.gatherPerMin[name];
      console.log(`[F-051] ${name}: ${removed} gathered in ${actTicks} working ticks = ${rate.toFixed(2)}/min (TUNING ${want}); delivered ${delivered}, carrying ${carried}`);
      expect(Math.abs(rate - want)).toBeLessThanOrEqual(want * 0.05);
      expect(delivered + carried).toBe(removed); // F-052 conservation: nothing lost or duplicated
      expect(delivered).toBeGreaterThan(0);
    });
  }

  it('forest tiles turn into plains when cut down (terrain change)', () => {
    const sim = new Sim({ seed: 'cut', size: 'small', players: 1 });
    const w = ownedOfKind(sim, 0, Kind.WORKER)[0];
    const target = nearestReachable(sim, unitTile(sim, w), Res.WOOD);
    sim.res.amount[target] = 3; // nearly cut down already (test setup)
    issue(sim, 0, { type: 'gather', ids: [w], tile: target });
    const changed: number[] = [];
    run(sim, 3000, () => changed.push(...sim.drainChangedTiles()));
    expect(sim.res.type[target]).toBe(RES_NONE);
    expect(sim.map.biome[target]).toBe(Biome.PLAINS);
    expect(changed).toContain(target); // renderer gets a tile delta
  });
});

describe('F-051 farming, fishing, hunting', () => {
  it('farm: 2 workers produce 2 × 18 × yield food/min (±5 %)', () => {
    const sim = new Sim({ seed: 'farm', size: 'small', players: 1 });
    const cap = capitalOf(sim, 0), ws = ownedOfKind(sim, 0, Kind.WORKER);
    const a = findPlacement(sim, 0, 'farm', sim.ents.anchor[cap]);
    expect(a).toBeGreaterThanOrEqual(0);
    issue(sim, 0, { type: 'place', ids: [ws[0], ws[1]], btype: B('farm'), tile: a });
    let farm = -1, i0 = -1, t0 = -1, ticks = 0;
    run(sim, 9000, () => {
      if (farm < 0) farm = ownedOfKind(sim, 0, buildingKind('farm'))[0] ?? -1;
      if (farm >= 0 && sim.ents.complete[farm] && acting(sim, ws[0], Task.WORK) && acting(sim, ws[1], Task.WORK)) {
        if (t0 < 0) { t0 = sim.tick; i0 = sim.ps[0].totalIncome[Res.FOOD]; }
        ticks++;
      }
    });
    const made = sim.ps[0].totalIncome[Res.FOOD] - i0;
    const rate = (made * 600) / ticks, want = (2 * ECO.farmFoodPerWorkerPerMin * sim.ents.yieldPct[farm]) / 100;
    console.log(`[F-051] farm (yield ${sim.ents.yieldPct[farm]} %): ${made} food in ${ticks} ticks with 2 workers = ${rate.toFixed(2)}/min (expected ${want})`);
    expect(Math.abs(rate - want)).toBeLessThanOrEqual(want * 0.05);
  });

  it('fishing hut: 3 workers produce 3 × 20 × water factor food/min (±5 %)', () => {
    let sim: Sim | null = null, a = -1;
    for (let s = 0; s < 30 && a < 0; s++) {
      sim = new Sim({ seed: `fish-${s}`, size: 'small', players: 1 });
      sim.ps[0].stock[Res.WOOD] = 500;
      a = findPlacement(sim, 0, 'fishingHut', sim.ents.anchor[capitalOf(sim, 0)], 8);
    }
    expect(a).toBeGreaterThanOrEqual(0);
    const s = sim!, ws = ownedOfKind(s, 0, Kind.WORKER);
    issue(s, 0, { type: 'place', ids: ws, btype: B('fishingHut'), tile: a });
    let hut = -1, i0 = -1, ticks = 0;
    run(s, 9000, () => {
      if (hut < 0) hut = ownedOfKind(s, 0, buildingKind('fishingHut'))[0] ?? -1;
      if (hut >= 0 && ws.every((w) => acting(s, w, Task.WORK))) { if (i0 < 0) i0 = s.ps[0].totalIncome[Res.FOOD]; ticks++; }
    });
    const made = s.ps[0].totalIncome[Res.FOOD] - i0;
    const rate = (made * 600) / ticks, want = (3 * ECO.fishFoodPerWorkerPerMin * s.ents.yieldPct[hut]) / 100;
    console.log(`[F-051] fishing hut (water factor ${s.ents.yieldPct[hut]} %): ${made} food in ${ticks} ticks = ${rate.toFixed(2)}/min (expected ${want})`);
    expect(Math.abs(rate - want)).toBeLessThanOrEqual(want * 0.05);
  });

  it('F-031 hunting: animal → carcass → food at 30/min while gathering (±5 %)', () => {
    let sim: Sim | null = null, animal = -1, w = -1;
    for (let s = 0; s < 30 && animal < 0; s++) {
      sim = new Sim({ seed: `hunt-${s}`, size: 'small', players: 1 });
      w = ownedOfKind(sim, 0, Kind.WORKER)[0];
      let best = 1e9;
      for (const a of ownedOfKind(sim, 254, Kind.ANIMAL)) {
        const d = Math.abs(sim.ents.posX[a] - sim.ents.posX[w]) + Math.abs(sim.ents.posY[a] - sim.ents.posY[w]);
        if (d < best && d < 25 * FP_ONE && sim.map.continent[unitTile(sim, a)] === sim.map.continent[unitTile(sim, w)]) { best = d; animal = a; }
      }
    }
    expect(animal).toBeGreaterThanOrEqual(0);
    const s = sim!;
    issue(s, 0, { type: 'interact', ids: [w], target: animal });
    let actTicks = 0, killedAt = -1;
    const f0 = s.ps[0].totalIncome[Res.FOOD];
    run(s, 9000, () => {
      if (killedAt < 0 && s.ents.kind[animal] === Kind.CARCASS) killedAt = s.tick;
      if (s.ents.srcEnt[w] === animal && acting(s, w, Task.GATHER)) actTicks++;
    });
    const got = s.ps[0].totalIncome[Res.FOOD] - f0 + s.ents.carryAmt[w];
    const rate = (Math.min(got, TUNING.animals.food) * 600) / actTicks;
    console.log(`[F-031] animal killed at tick ${killedAt}; ${got} food gathered over ${actTicks} working ticks = ${rate.toFixed(2)}/min (TUNING 30)`);
    expect(killedAt).toBeGreaterThan(0);
    expect(got).toBe(TUNING.animals.food);
    expect(Math.abs(rate - ECO.gatherPerMin.carcass)).toBeLessThanOrEqual(ECO.gatherPerMin.carcass * 0.05);
  });

  it('F-031 animals spawn on plains/forest/tundra and wander near home', () => {
    const sim = new Sim({ seed: 'zoo', size: 'medium', players: 2 });
    const as = ownedOfKind(sim, 254, Kind.ANIMAL);
    const okBiome = new Set<number>([Biome.PLAINS, Biome.FOREST, Biome.TUNDRA]);
    for (const a of as) expect(okBiome.has(sim.map.biome[sim.ents.homeTile[a]])).toBe(true);
    const start = as.map((a) => [sim.ents.posX[a], sim.ents.posY[a]]);
    run(sim, 1500);
    const moved = as.filter((a, i) => sim.ents.posX[a] !== start[i][0] || sim.ents.posY[a] !== start[i][1]).length;
    const R = TUNING.animals.wanderRadius + 1, w = sim.map.w;
    for (const a of as) {
      const h = sim.ents.homeTile[a], hx = h % w, hy = (h - hx) / w, t = unitTile(sim, a), x = t % w, y = (t - x) / w;
      expect(Math.max(Math.abs(x - hx), Math.abs(y - hy))).toBeLessThanOrEqual(R);
    }
    console.log(`[F-031] ${as.length} animals; ${moved} moved in 1500 ticks; all within ${R} tiles of home`);
    expect(moved).toBeGreaterThan(as.length / 2);
  });
});

describe('F-053 buildings', () => {
  it('rejects invalid placements and unaffordable buildings', () => {
    const sim = new Sim({ seed: 'place', size: 'small', players: 1 });
    const cap = capitalOf(sim, 0), w = sim.map.w, ws = ownedOfKind(sim, 0, Kind.WORKER);
    const water = Array.from(sim.map.biome.keys()).find((t) => sim.map.biome[t] === Biome.OCEAN)!;
    const outside = Array.from(sim.map.biome.keys()).find((t) => !isWaterBiome(sim.map.biome[t]) && sim.tileOwner[t] === 255 && sim.map.biome[t] === Biome.PLAINS)!;
    expect(sim.canPlace(0, 'house', water)).toBe('terrain');
    expect(sim.canPlace(0, 'house', outside)).toBe('outside your territory');
    expect(sim.canPlace(0, 'house', sim.ents.anchor[cap])).toBe('occupied');
    const evs: SimEvent[] = [];
    issue(sim, 0, { type: 'place', ids: [ws[0]], btype: B('house'), tile: water });
    sim.step(); evs.push(...sim.drainEvents());
    sim.ps[0].stock[Res.WOOD] = 0;
    const ok = findPlacement(sim, 0, 'house', sim.ents.anchor[cap]);
    issue(sim, 0, { type: 'place', ids: [ws[0]], btype: B('house'), tile: ok });
    sim.step(); evs.push(...sim.drainEvents());
    expect(evs.map((e) => e.type)).toEqual(['cantPlace', 'cantAfford']);
    expect(ownedOfKind(sim, 0, buildingKind('house')).length).toBe(0);
    void w;
  });

  it('build time scales with workers: 2 workers ≈ half the time of 1', () => {
    const time = (n: number): number => {
      const sim = new Sim({ seed: 'buildtime', size: 'small', players: 1 });
      const ws = ownedOfKind(sim, 0, Kind.WORKER).slice(0, n);
      const a = findPlacement(sim, 0, 'house', unitTile(sim, ws[0]), 6);
      issue(sim, 0, { type: 'place', ids: ws, btype: B('house'), tile: a });
      let first = -1, done = -1;
      run(sim, 2000, () => {
        const h = ownedOfKind(sim, 0, buildingKind('house'))[0];
        if (h === undefined) return;
        if (first < 0 && sim.ents.progress[h] > 0) first = sim.tick;
        if (done < 0 && sim.ents.complete[h]) done = sim.tick;
      });
      return done - first;
    };
    const t1 = time(1), t2 = time(2);
    console.log(`[F-053] house (${TUNING.buildingTypes.house.buildPoints} build points): 1 worker ${t1} ticks, 2 workers ${t2} ticks, ratio ${(t1 / t2).toFixed(2)}`);
    expect(t1 / t2).toBeGreaterThan(1.75);
    expect(t1 / t2).toBeLessThanOrEqual(2.05);
  });
});

describe('F-054 population, housing, food', () => {
  it('training never exceeds housing; housing-cap event fires', () => {
    const sim = new Sim({ seed: 'housing', size: 'small', players: 1 });
    sim.ps[0].stock[Res.FOOD] = 5000;
    const cap = capitalOf(sim, 0);
    const evs: string[] = [];
    let maxOver = -99;
    for (let k = 0; k < 4000; k++) {
      if (sim.ents.queues[cap].length < 2) issue(sim, 0, { type: 'train', building: cap, utype: UNIT_TYPES.indexOf('worker') });
      sim.step();
      evs.push(...sim.drainEvents().map((e) => e.type));
      maxOver = Math.max(maxOver, sim.ps[0].pop - sim.ps[0].housing);
    }
    console.log(`[F-054] after 4000 ticks: pop ${sim.ps[0].pop} / housing ${sim.ps[0].housing}; trained ${evs.filter((e) => e === 'trained').length}; housing events ${evs.filter((e) => e === 'housing').length}`);
    expect(maxOver).toBeLessThanOrEqual(0);
    expect(sim.ps[0].pop).toBe(sim.ps[0].housing);
    expect(evs).toContain('housing');
  });

  it('food deficit → starving: event, training paused, gather rate halved', () => {
    const sim = new Sim({ seed: 'starve', size: 'small', players: 1 });
    sim.ps[0].stock[Res.FOOD] = 0;
    const w = ownedOfKind(sim, 0, Kind.WORKER)[0];
    const tile = nearestReachable(sim, unitTile(sim, w), Res.WOOD);
    issue(sim, 0, { type: 'gather', ids: [w], tile });
    const evs: string[] = [];
    let actTicks = 0, removed0 = 0;
    const amt = (): number => { let n = 0; for (let t = 0; t < sim.res.type.length; t++) if (sim.res.type[t] === Res.WOOD) n += sim.res.amount[t]; return n; };
    removed0 = amt();
    run(sim, 4000, () => { evs.push(...sim.drainEvents().map((e) => e.type)); if (sim.ps[0].starving && acting(sim, w, Task.GATHER)) actTicks++; });
    const rate = ((removed0 - amt()) * 600) / actTicks;
    console.log(`[F-054] starving: events ${JSON.stringify([...new Set(evs)])}; wood rate while starving ${rate.toFixed(2)}/min (normal ${ECO.gatherPerMin.wood}, expected ${(ECO.gatherPerMin.wood * ECO.starvingRatePct) / 100})`);
    expect(evs).toContain('starving');
    expect(sim.ps[0].starving).toBe(true);
    expect(Math.abs(rate - (ECO.gatherPerMin.wood * ECO.starvingRatePct) / 100)).toBeLessThanOrEqual(ECO.gatherPerMin.wood * 0.03);
    // training paused while starving
    const cap = capitalOf(sim, 0);
    sim.ps[0].stock[Res.FOOD] = 5; // can't pay 50
    issue(sim, 0, { type: 'train', building: cap, utype: UNIT_TYPES.indexOf('worker') });
    sim.step();
    expect(sim.ents.queues[cap].length).toBe(0);
  });
});

describe('F-055 / F-056 / F-057 territory, settlers, upgrades', () => {
  it('land-owned counter always equals tiles owned (scripted 4-player match)', () => {
    const sim = new Sim({ seed: 'land', size: 'small', players: 4 });
    const rng = Rng.stream('land', 'script');
    for (let k = 0; k < 3000; k++) {
      scriptTick(sim, rng); sim.step();
      if (k % 500 === 0) for (let p = 0; p < 4; p++) expect(sim.ps[p].landOwned).toBe(sim.tileOwner.filter((o) => o === p).length);
    }
    for (let p = 0; p < 4; p++) expect(sim.ps[p].landOwned).toBe(sim.tileOwner.filter((o) => o === p).length);
  });

  it('settler founds a settlement on unclaimed land; too close to a town is rejected', () => {
    const sim = new Sim({ seed: 'settle', size: 'small', players: 1 });
    const cap = capitalOf(sim, 0), w = sim.map.w;
    sim.ps[0].stock[Res.FOOD] = 1000; sim.ps[0].stock[Res.WOOD] = 1000;
    issue(sim, 0, { type: 'train', building: cap, utype: UNIT_TYPES.indexOf('settler') });
    run(sim, 400);
    const settler = ownedOfKind(sim, 0, Kind.SETTLER)[0];
    expect(settler).toBeDefined();
    // too close: right next to the capital
    expect(sim.canPlace(0, 'settlement', sim.ents.anchor[cap] + 5)).not.toBeNull();
    // a valid spot on the same continent 12–30 tiles away
    const ct = sim.map.continent[sim.ents.anchor[cap]];
    let spot = -1;
    const cx = sim.ents.anchor[cap] % w, cy = (sim.ents.anchor[cap] - cx) / w;
    for (let t = 0; t < sim.map.biome.length && spot < 0; t++) {
      const x = t % w, y = (t - x) / w, d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d >= 12 && d <= 30 && sim.map.continent[t] === ct && sim.canPlace(0, 'settlement', t) === null && nearestReachable(sim, unitTile(sim, settler), RES_NONE) !== -2) spot = t;
    }
    expect(spot).toBeGreaterThanOrEqual(0);
    const land0 = sim.ps[0].landOwned;
    issue(sim, 0, { type: 'place', ids: [settler], btype: B('settlement'), tile: spot });
    const evs: string[] = [];
    run(sim, 3000, () => evs.push(...sim.drainEvents().map((e) => e.type)));
    const settlements = ownedOfKind(sim, 0, buildingKind('settlement'));
    console.log(`[F-056] settler → settlement: events ${JSON.stringify(evs.filter((e) => e !== 'deposit'))}; land ${land0} → ${sim.ps[0].landOwned}; settler alive=${!!sim.ents.alive[settler]}`);
    expect(settlements.length).toBe(1);
    expect(sim.ps[0].landOwned).toBeGreaterThan(land0 + 50);
    expect(ownedOfKind(sim, 0, Kind.SETTLER).length).toBe(0);
  });

  it('upgrades: house +4 housing; capital level 2 claims more land', () => {
    const sim = new Sim({ seed: 'upgrade', size: 'small', players: 1 });
    sim.ps[0].stock[Res.WOOD] = 2000; sim.ps[0].stock[Res.STONE] = 2000;
    const cap = capitalOf(sim, 0), ws = ownedOfKind(sim, 0, Kind.WORKER);
    issue(sim, 0, { type: 'place', ids: ws, btype: B('house'), tile: findPlacement(sim, 0, 'house', sim.ents.anchor[cap]) });
    run(sim, 600);
    const house = ownedOfKind(sim, 0, buildingKind('house'))[0];
    expect(sim.ents.complete[house]).toBe(1);
    const h0 = sim.ps[0].housing, l0 = sim.ps[0].landOwned;
    issue(sim, 0, { type: 'upgrade', building: house });
    issue(sim, 0, { type: 'upgrade', building: cap });
    run(sim, 450);
    console.log(`[F-057] house level ${sim.ents.level[house]}, capital level ${sim.ents.level[cap]}: housing ${h0} → ${sim.ps[0].housing}, land ${l0} → ${sim.ps[0].landOwned}`);
    expect(sim.ents.level[house]).toBe(2);
    expect(sim.ents.level[cap]).toBe(2);
    expect(sim.ps[0].housing).toBe(h0 + 4 + 10);
    expect(sim.ps[0].landOwned).toBeGreaterThan(l0);
  });
});

describe('F-023 biomes affect movement and food', () => {
  it('crossing swamp vs plains: time ratio matches the movement-cost table (±5 %)', () => {
    const time = (biome: number): number => {
      const sim = new Sim({ seed: 'terrain', size: 'small', players: 1 });
      const s = ownedOfKind(sim, 0, Kind.SCOUT)[0], w = sim.map.w;
      // paint a 40×40 patch of the test biome around a point and teleport the scout there (test setup only)
      const cx = 40, cy = 40;
      for (let y = cy - 20; y < cy + 20; y++) for (let x = cx - 20; x < cx + 20; x++) {
        const t = y * w + x; sim.map.biome[t] = biome; sim.res.type[t] = RES_NONE; sim.res.amount[t] = 0; sim.occ[t] = 0;
      }
      sim.ents.posX[s] = tileCenter(cx - 10); sim.ents.posY[s] = tileCenter(cy);
      issue(sim, 0, { type: 'move', ids: [s], x: tileCenter(cx + 10), y: tileCenter(cy) });
      let n = 0;
      sim.step(); sim.step();
      while (sim.ents.moving[s] && n < 5000) { sim.step(); n++; }
      return n;
    };
    const plains = time(Biome.PLAINS), swamp = time(Biome.SWAMP);
    const want = MOVE_COST[Biome.SWAMP] / MOVE_COST[Biome.PLAINS];
    console.log(`[F-023] 20 tiles: plains ${plains} ticks, swamp ${swamp} ticks, ratio ${(swamp / plains).toFixed(3)} (table ${want})`);
    expect(Math.abs(swamp / plains - want)).toBeLessThanOrEqual(want * 0.05);
  });

  it('farm yield follows the biome table (plains 100 %, desert 35 %)', () => {
    const yieldOn = (biome: number): number => {
      const sim = new Sim({ seed: 'yield', size: 'small', players: 1 });
      const cap = capitalOf(sim, 0), a = findPlacement(sim, 0, 'farm', sim.ents.anchor[cap]), w = sim.map.w;
      for (const t of [a, a + 1, a + w, a + w + 1]) sim.map.biome[t] = biome;
      issue(sim, 0, { type: 'place', ids: [], btype: B('farm'), tile: a });
      sim.step();
      return sim.ents.yieldPct[ownedOfKind(sim, 0, buildingKind('farm'))[0]];
    };
    expect(yieldOn(Biome.PLAINS)).toBe(FARM_YIELD[Biome.PLAINS]);
    expect(yieldOn(Biome.DESERT)).toBe(FARM_YIELD[Biome.DESERT]);
  });
});

describe('F-131 domination victory', () => {
  const claim = (sim: Sim, p: number, pct: number): void => {
    for (let t = 0; t < sim.tileOwner.length && sim.ps[p].landOwned * 100 < pct * sim.totalLand; t++) {
      if (isWaterBiome(sim.map.biome[t]) || sim.tileOwner[t] !== 255) continue;
      sim.tileOwner[t] = p; sim.ps[p].landOwned++; sim.ownedList[p].push(t);
    }
  };
  it('holding 70 % of land for the hold time wins; dropping below resets the timer', () => {
    const sim = new Sim({ seed: 'dom', size: 'small', players: 2 });
    claim(sim, 0, 70);
    run(sim, 1000);
    expect(sim.ps[0].dominationTicks).toBe(1000);
    // lose some land → timer resets
    let lost = 0;
    for (let t = 0; t < sim.tileOwner.length && lost < sim.totalLand * 0.05; t++) if (sim.tileOwner[t] === 0) { sim.tileOwner[t] = 255; sim.ps[0].landOwned--; lost++; }
    sim.step();
    expect(sim.ps[0].dominationTicks).toBe(0);
    claim(sim, 0, 70);
    const t0 = sim.tick;
    run(sim, ECO.dominationHoldTicks + 5);
    console.log(`[F-131] winner ${sim.winner} after holding ${ECO.dominationPct} % for ${sim.tick - t0} ticks`);
    expect(sim.winner).toBe(0);
  });
});

describe('F-016 save / load', () => {
  it('save at tick 2000, load, run 1000 more → same hash as an uninterrupted run', () => {
    const a = new Sim({ seed: 'save-test', size: 'small', players: 3 });
    const rngA = Rng.stream('save-test', 'script');
    for (let k = 0; k < 2000; k++) { scriptTick(a, rngA); a.step(); }
    const json = JSON.stringify(saveSim(a));
    const b = loadSim(JSON.parse(json));
    const rngB = Rng.stream('x', 'y'); rngB.setState(rngA.getState());
    expect(b.hash()).toBe(a.hash());
    for (let k = 0; k < 1000; k++) { scriptTick(a, rngA); a.step(); scriptTick(b, rngB); b.step(); }
    console.log(`[F-016] save size ${(json.length / 1024).toFixed(0)} KB JSON; tick ${a.tick}: uninterrupted ${a.hash()} vs loaded ${b.hash()}`);
    expect(b.hash()).toBe(a.hash());
  });
  it('rejects a save from another version with a clear message', () => {
    const d = saveSim(new Sim({ seed: 'v', size: 'small', players: 1 }));
    d.version = 1;
    expect(() => loadSim(d)).toThrow(SaveError);
    expect(() => loadSim(d)).toThrow(/different game version/);
  });
});

describe('F-059 stats match the simulation', () => {
  it('every stat equals an independent recount of sim state', () => {
    const sim = new Sim({ seed: 'stats', size: 'small', players: 3 });
    const rng = Rng.stream('stats', 'script');
    for (let k = 0; k < 2500; k++) { scriptTick(sim, rng); sim.step(); }
    for (let p = 0; p < 3; p++) {
      const s = computeStats(sim, p), e = sim.ents;
      expect(s.landOwned).toBe(sim.tileOwner.filter((o) => o === p).length);
      let pop = 0, workers = 0;
      for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && e.kind[id] < 64) { pop += TUNING.unitTypes[UNIT_TYPES[e.kind[id] - 1]].pop; if (e.kind[id] === Kind.WORKER) workers++; }
      expect(s.pop).toBe(pop);
      expect(s.units.worker).toBe(workers);
      expect(s.stock).toEqual(sim.ps[p].stock);
      expect(s.foodBalancePerMin).toBe(s.foodIncomePerMin - pop * ECO.foodPerPopPerMin);
      let army = 0;
      for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && [Kind.SPEARMAN, Kind.ARCHER, Kind.RIDER, Kind.RAM, Kind.SABOTEUR, Kind.WARSHIP].includes(e.kind[id] as never)) army += Math.ceil((TUNING.unitTypes[UNIT_TYPES[e.kind[id] - 1]].attack * e.maxHp[id]) / 100);
      expect(s.army).toBe(army);
      expect(s.continents.reduce((a, c) => a + c.owned, 0)).toBeLessThanOrEqual(s.landOwned);
      if (p === 0) console.log(`[F-059] p0 @${s.tick}: land ${s.landOwned}/${s.landTotal}, pop ${s.pop}/${s.housing}, stock ${JSON.stringify(s.stock)}, income/min ${JSON.stringify(s.incomePerMin)}, deposits found ${JSON.stringify(s.depositsFound)}`);
    }
  });
});

describe('F-155 notification events', () => {
  it('scripted match produces build, train and discovery events', () => {
    const sim = new Sim({ seed: 'events', size: 'small', players: 2 });
    const rng = Rng.stream('events', 'script');
    const types = new Set<string>();
    for (let k = 0; k < 3000; k++) { scriptTick(sim, rng); sim.step(); for (const e of sim.drainEvents()) types.add(e.type); }
    console.log('[F-155] event types seen: ' + [...types].join(', '));
    for (const t of ['built', 'trained', 'deposit']) expect(types).toContain(t);
  });
});
