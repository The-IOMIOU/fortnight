// Phase 5 acceptance tests: race data format and validation (F-090, F-091), point rule (F-112), ability
// modules combined by data (F-092), evolution and shared tech (F-093, F-094), gear (F-058), and one scripted
// test per race for its special ability and its weakness (F-100–F-107).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { tileCenter } from '../src/sim/core/fixed';
import { TUNING } from '../src/sim/core/tuning';
import { Biome } from '../src/sim/world/mapgen';
import { Kind, RES_NONE, Res, type BuildingTypeName, type UnitTypeName } from '../src/sim/defs';
import { issue } from '../src/sim/scripted';
import { loadSim, saveSim } from '../src/sim/serialize';
import { PLAYABLE_RACES, RACES, STAT_KEYS, loadRaces, racePoints, registerRace, validateRace } from '../src/sim/races';
import { AB, GEAR_IDS, gearIndex } from '../src/sim/abilities';
import deepkin from '../src/data/races/deepkin.json' with { type: 'json' };

const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };
const xOf = (s: Sim, id: number): number => s.tileOf(id) % s.map.w;
const NIGHT = TUNING.dayNight.dayLengthTicks - TUNING.dayNight.nightTicks + 10;

/** A flat plains arena (no owner, no resources, no wildlife) on a Small map with the given races. */
function arena(races: string[], seed = 'race-arena', W = 50, H = 30): { s: Sim; at: (x: number, y: number) => number } {
  for (let k = 0; k < 50; k++) {
    const s = new Sim({ seed: `${seed}-${k}`, size: 'small', players: races.length, races });
    const w = s.map.w;
    for (let oy = 8; oy + H < s.map.h - 8; oy += 4) for (let ox = 8; ox + W < w - 8; ox += 4) {
      let ok = true;
      for (let y = oy - 2; y < oy + H + 2 && ok; y++) for (let x = ox - 2; x < ox + W + 2; x++) if (s.occ[y * w + x] || s.tileOwner[y * w + x] !== 255 || (s.fungus && s.fungus[y * w + x])) { ok = false; break; }
      if (!ok) continue;
      for (let y = oy; y < oy + H; y++) for (let x = ox; x < ox + W; x++) {
        const t = y * w + x;
        s.map.biome[t] = Biome.PLAINS; s.map.height[t] = 2; s.res.type[t] = RES_NONE; s.res.amount[t] = 0;
      }
      for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.owner[id] === 254) {
        const t = s.tileOf(id), x = t % w, y = Math.floor(t / w);
        if (x >= ox - 2 && x < ox + W + 2 && y >= oy - 2 && y < oy + H + 2) s.ents.kill(id);
      }
      s.flows.clear();
      return { s, at: (x: number, y: number) => (oy + y) * w + ox + x };
    }
  }
  throw new Error('no arena');
}
const spawn = (s: Sim, p: number, u: UnitTypeName, t: number): number => s.spawnUnitAt(p, u, t);
const own = (s: Sim, p: number, ts: number[]): void => { for (const t of ts) { s.tileOwner[t] = p; s.ownedList[p].push(t); } };
const rect = (at: (x: number, y: number) => number, x0: number, y0: number, x1: number, y1: number): number[] => { const o: number[] = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push(at(x, y)); return o; };
const unlock = (s: Sim, p: number, ...ids: string[]): void => { s.ps[p].researched.push(...ids); s.rules.refresh(p); };
function spawnAnimal(s: Sim, t: number): number {
  const w = s.map.w, id = s.ents.spawn(Kind.ANIMAL, 254, tileCenter(t % w), tileCenter(Math.floor(t / w)), TUNING.animals.speed, 0);
  s.ents.food[id] = TUNING.animals.food; s.ents.homeTile[id] = t;
  return id;
}
/** A tile in p's territory where `bt` can be placed. */
function placeable(s: Sim, p: number, bt: BuildingTypeName): number {
  for (const t of s.ownedList[p]) if (!s.canPlace(p, bt, t)) return t;
  throw new Error('no spot for ' + bt);
}

describe('F-090 / F-112 race data', () => {
  it('8 playable races + the Baseline reference; every §5.1 field present; each totals exactly 0 points', () => {
    expect(PLAYABLE_RACES.map((r) => r.id)).toEqual(['deepkin', 'wildbond', 'delvers', 'mycelids', 'windriders', 'anvilborn', 'fenfolk', 'rimeborn']);
    for (const r of RACES) {
      for (const f of ['id', 'name', 'description', 'biome_preference', 'stat_modifiers', 'special_ability', 'weakness', 'starting_units', 'starting_buildings', 'evolution_tree', 'unique_units', 'unique_building', 'bot_hints']) expect(r, `${r.id}.${f}`).toHaveProperty(f);
      expect(validateRace(r)).toEqual([]);
      expect(racePoints(r)).toBe(0);
    }
    for (const r of PLAYABLE_RACES) {
      expect(r.unique_units.length).toBeGreaterThanOrEqual(2); expect(r.unique_units.length).toBeLessThanOrEqual(4);
      expect(r.evolution_tree.filter((n) => n.capstone).length).toBe(1);
    }
    // distinct: no two races share an ability + weakness pair, and every special ability is different
    const pairs = new Set(PLAYABLE_RACES.map((r) => `${r.special_ability}/${r.weakness}`));
    expect(pairs.size).toBe(PLAYABLE_RACES.length);
    expect(new Set(PLAYABLE_RACES.map((r) => r.special_ability)).size).toBe(PLAYABLE_RACES.length);
    console.log('[F-112] points: ' + RACES.map((r) => `${r.id} ${racePoints(r)}`).join(', '));
  });

  it('F-112 a race whose total is not 0 is rejected, and the message names the total', () => {
    const r = { ...deepkin, id: 'deepkin_plus', stat_modifiers: { ...deepkin.stat_modifiers, vision: 120 } };
    const es = validateRace(r);
    expect(es.map((e) => e.field)).toEqual(['points']);
    expect(es[0].message).toContain('+4');
    console.log(`[F-112] ${es[0].race}: ${es[0].message}`);
  });
});

describe('F-091 validation', () => {
  it('5 broken races are each reported by race id and field path; valid races still load', () => {
    const broken = [
      { ...deepkin, id: 'b1', name: '' },
      { ...deepkin, id: 'b2', special_ability: 'laserEyes' },
      { ...deepkin, id: 'b3', stat_modifiers: { ...deepkin.stat_modifiers, vision: 103 } },
      { ...deepkin, id: 'b4', evolution_tree: [deepkin.evolution_tree[0], { ...deepkin.evolution_tree[1], requires: ['nowhere'] }, deepkin.evolution_tree[2]] },
      { ...deepkin, id: 'b5', unique_units: ['tideguard', 'dragon'] },
    ];
    const { races, errors } = loadRaces([deepkin, ...broken]);
    expect(races.map((r) => r.id)).toEqual(['deepkin']);
    const got = errors.map((e) => `${e.race}:${e.field}`);
    expect(got).toEqual(['b1:name', 'b2:special_ability', 'b3:stat_modifiers.vision', 'b4:evolution_tree[1].requires[0]', 'b5:unique_units[1]']);
    for (const e of errors) console.log(`[F-091] race ${e.race}: ${e.field}: ${e.message}`);
  });
});

describe('F-092 ability modules combined by data', () => {
  it('a new race made only from JSON (amphibious + heat weakness) works with no code changes', () => {
    const errs = registerRace({
      ...deepkin, id: 'testfolk', name: 'Test folk', weakness: 'heatWeak',
      stat_modifiers: { ...deepkin.stat_modifiers, gather_speed: 90 }, // 8 − 6 − 2 = 0
    });
    expect(errs).toEqual([]);
    const { s, at } = arena(['testfolk', 'baseline'], 'testfolk');
    const sea = at(20, 10);
    s.map.biome[sea] = Biome.OCEAN;
    expect(s.cost(sea, 0)).toBeGreaterThan(0); // amphibious
    expect(s.cost(sea, 1)).toBe(0);
    const dune = at(5, 5);
    s.map.biome[dune] = Biome.DESERT;
    expect(s.rules.workPct(0, dune, 'gather', false)).toBe(54); // 90 % × 60 %
    expect(s.rules.workPct(1, dune, 'gather', false)).toBe(100);
  });
});

describe('F-093 / F-094 research', () => {
  it('shared tech: locked before, buildable after; prerequisites and exact cost enforced', () => {
    const s = new Sim({ seed: 'tech', size: 'small', players: 2, races: ['baseline', 'baseline'] });
    s.ps[0].stock = [5000, 5000, 5000, 5000, 5000, 5000];
    const spot = placeable(s, 0, 'house');
    expect(s.canPlace(0, 'forge', spot)).toBe('not researched yet');
    issue(s, 0, { type: 'research', node: 'toolmaking' }); // needs smithing first
    s.step();
    expect(s.ps[0].researching).toBe('');
    const before = s.ps[0].stock.slice();
    issue(s, 0, { type: 'research', node: 'smithing' });
    s.step();
    expect(s.ps[0].researching).toBe('smithing');
    const n = TUNING.tech.nodes.smithing;
    expect(before[Res.WOOD] - s.ps[0].stock[Res.WOOD]).toBe(n.wood);
    expect(before[Res.STONE] - s.ps[0].stock[Res.STONE]).toBe(n.stone);
    run(s, n.ticks);
    expect(s.ps[0].researched).toEqual(['smithing']);
    expect(s.canPlace(0, 'forge', placeable(s, 0, 'forge'))).toBeNull();
    expect(s.rules.gearOk[0].has('ironWeapons')).toBe(true);
  });

  it('race evolution: units unlock in tree order, the capstone last; other races cannot use them', () => {
    const s = new Sim({ seed: 'evo', size: 'small', players: 2, races: ['wildbond', 'baseline'] });
    s.ps[0].stock = [9000, 9000, 9000, 9000, 9000, 9000];
    const order: string[] = [];
    const steps = ['warTraining', 'revival', 'ancientRevival'];
    expect(s.rules.canResearch(0, 'ancientRevival')).toBe('needs earlier research');
    for (const node of steps) {
      issue(s, 0, { type: 'research', node }); s.step();
      while (s.ps[0].researching) s.step();
      order.push(`${node}:${['warbeast', 'beast', 'thunderlizard'].filter((u) => s.rules.unitAllowed(0, u as UnitTypeName)).join('+')}`);
    }
    expect(order).toEqual(['warTraining:warbeast', 'revival:warbeast+beast', 'ancientRevival:warbeast+beast+thunderlizard']);
    expect(s.rules.unitAllowed(1, 'warbeast')).toBe(false);
    expect(s.rules.buildingAllowed(1, 'beastPen')).toBe(false);
    console.log('[F-093] Wildbond unlock order: ' + order.join(' → '));
  });
});

describe('F-058 gear', () => {
  it('carbon + adamite → alloy → alloy weapons → equipped soldier hits harder; inputs consumed exactly', () => {
    const { s, at } = arena(['baseline', 'baseline'], 'gear');
    own(s, 0, rect(at, 0, 0, 20, 20));
    unlock(s, 0, 'smithing', 'alloys');
    const forge = s.createBuilding(0, 'forge', at(5, 5), true);
    s.ps[0].stock = [1000, 0, 0, 100, 10, 5]; // food so the player isn't starving (starving pauses crafting)
    issue(s, 0, { type: 'craft', building: forge, item: gearIndex('alloy') });
    issue(s, 0, { type: 'craft', building: forge, item: gearIndex('alloy') });
    s.step();
    expect(s.ps[0].stock[Res.CARBON]).toBe(10 - 2 * 2);
    expect(s.ps[0].stock[Res.ADAMITE]).toBe(5 - 2 * 1);
    run(s, 2 * TUNING.gear.items.alloy.ticks + 2);
    expect(s.ps[0].gear[gearIndex('alloy')]).toBe(2);
    issue(s, 0, { type: 'craft', building: forge, item: gearIndex('alloyWeapons') });
    s.step();
    expect(s.ps[0].gear[gearIndex('alloy')]).toBe(1);
    expect(s.ps[0].stock[Res.GOLD]).toBe(100 - 15);
    run(s, TUNING.gear.items.alloyWeapons.ticks + 2);
    const sp = spawn(s, 0, 'spearman', at(8, 8)), foe = spawn(s, 1, 'spearman', at(9, 8));
    const d0 = s.mil.damage(sp, foe);
    issue(s, 0, { type: 'equip', ids: [sp], item: gearIndex('alloyWeapons') });
    s.step();
    expect(s.ents.weaponTier[sp]).toBe(2);
    expect(s.ps[0].gear[gearIndex('alloyWeapons')]).toBe(0);
    const d1 = s.mil.damage(sp, foe);
    expect(d1).toBeGreaterThan(d0);
    console.log(`[F-058] alloy chain: carbon −4, adamite −2 → 2 alloy; alloy weapons −1 alloy −15 gold; spearman damage ${d0} → ${d1} (tier 2)`);
  });
});

describe('F-100 Deepkin', () => {
  it('walk underwater and faster in water; sunburn on open land by day only; settle only at night', () => {
    const { s, at } = arena(['deepkin', 'baseline'], 'deepkin');
    for (let y = 0; y < 30; y++) for (let x = 18; x <= 24; x++) s.map.biome[at(x, y)] = Biome.OCEAN;
    s.flows.clear();
    expect(s.cost(at(20, 10), 0)).toBeGreaterThan(0);
    expect(s.cost(at(20, 10), 1)).toBe(0);
    const swimmer = spawn(s, 0, 'spearman', at(10, 10));
    const [tx, ty] = Sim.tileCenterFp(at(32, 10), s.map.w);
    issue(s, 0, { type: 'move', ids: [swimmer], x: tx, y: ty });
    let crossed = false;
    for (let k = 0; k < 600 && !crossed; k++) { s.step(); crossed = s.tileOf(swimmer) === at(32, 10); }
    expect(crossed).toBe(true);
    // sunburn: by day on land outside own territory → damage; in water → none; at night → none
    const onLand = spawn(s, 0, 'spearman', at(5, 20)), inWater = spawn(s, 0, 'spearman', at(20, 20));
    const hp = s.ents.hp[onLand];
    run(s, 41);
    expect(s.ents.hp[onLand]).toBeLessThan(hp);
    expect(s.ents.hp[inWater]).toBe(s.ents.maxHp[inWater]);
    s.tick = NIGHT;
    const night = spawn(s, 0, 'spearman', at(6, 22));
    run(s, 41);
    expect(s.ents.hp[night]).toBe(s.ents.maxHp[night]);
    // expansion on land only at night
    s.tick = 100;
    expect(s.canPlace(0, 'outpost', at(3, 3))).toContain('only at night');
    s.tick = NIGHT;
    expect(s.canPlace(0, 'outpost', at(3, 3)) ?? '').not.toContain('only at night');
    expect(s.canPlace(1, 'settlement', at(40, 3)) ?? '').not.toContain('only at night');
    console.log(`[F-100] swimmer crossed 7 tiles of ocean; land unit by day ${hp} → ${s.ents.hp[onLand] ?? 0} HP, water unit and night unit unhurt`);
  });
});

describe('F-101 Wildbond', () => {
  it('scouts tame wild animals into beasts; other peoples cannot; their buildings are frail', () => {
    const { s, at } = arena(['wildbond', 'baseline'], 'wildbond');
    const a = spawnAnimal(s, at(20, 10)), b = spawnAnimal(s, at(20, 20));
    const tamer = spawn(s, 0, 'scout', at(14, 10)), other = spawn(s, 1, 'scout', at(14, 20));
    issue(s, 0, { type: 'tame', ids: [tamer], target: a });
    issue(s, 1, { type: 'tame', ids: [other], target: b });
    run(s, AB.tameAnimals.tameTicks + 200);
    expect(s.ents.kind[a]).toBe(Kind.BEAST);
    expect(s.ents.owner[a]).toBe(0);
    expect(s.ents.kind[b]).toBe(Kind.ANIMAL);
    expect(s.ents.owner[b]).toBe(254);
    const h0 = s.createBuilding(0, 'house', at(30, 5), true), h1 = s.createBuilding(1, 'house', at(35, 5), true);
    expect(s.ents.maxHp[h0]).toBe(Math.floor((TUNING.buildingTypes.house.hp * AB.frailBuildings.hpPct) / 100));
    expect(s.ents.maxHp[h1]).toBe(TUNING.buildingTypes.house.hp);
    console.log(`[F-101] animal ${a} tamed into a beast (HP ${s.ents.maxHp[a]}); Baseline scout could not tame; house HP ${s.ents.maxHp[h0]} vs ${s.ents.maxHp[h1]}`);
  });
});

describe('F-102 Delvers', () => {
  it('burrowed units are hidden, pass under a wall line, come up with an ambush strike; blocked by water; weak at sea', () => {
    const { s, at } = arena(['delvers', 'baseline'], 'delvers');
    for (let y = 0; y < 30; y++) s.createBuilding(1, 'wall', at(20, y), true);
    const d = spawn(s, 0, 'spearman', at(10, 10)), watcher = spawn(s, 1, 'spearman', at(16, 10));
    issue(s, 1, { type: 'hold', ids: [watcher] });
    issue(s, 0, { type: 'burrow', ids: [d], on: true });
    s.step();
    expect(s.ents.burrowed[d]).toBe(1);
    expect(s.visibleTo(d, 1)).toBe(false);
    expect(s.costFor(d, at(20, 5))).toBeGreaterThan(0); // under the wall
    const [tx, ty] = Sim.tileCenterFp(at(30, 10), s.map.w);
    issue(s, 0, { type: 'move', ids: [d], x: tx, y: ty });
    for (let k = 0; k < 900 && s.tileOf(d) !== at(30, 10); k++) s.step();
    expect(s.tileOf(d)).toBe(at(30, 10));
    expect(s.ents.hp[d]).toBe(s.ents.maxHp[d]); // the watcher never saw it
    // water blocks tunnels
    s.map.biome[at(40, 10)] = Biome.RIVER;
    expect(s.costFor(d, at(40, 10))).toBe(0);
    // ambush: surfacing makes the next strikes hit harder
    const foe = spawn(s, 1, 'spearman', at(31, 10));
    const plain = s.mil.damage(d, foe);
    issue(s, 0, { type: 'burrow', ids: [d], on: false });
    s.step();
    expect(s.ents.burrowed[d]).toBe(0);
    const ambush = s.mil.damage(d, foe);
    expect(ambush).toBeGreaterThanOrEqual(Math.floor((plain * AB.tunneling.ambushPct) / 100) - 1);
    // weak at sea
    s.map.biome[at(45, 25)] = Biome.OCEAN;
    const ship = spawn(s, 0, 'warship', at(45, 25)), ship1 = spawn(s, 1, 'warship', at(45, 25));
    expect(s.ents.maxHp[ship]).toBeLessThan(Math.floor(s.ents.maxHp[ship1] * 0.7));
    console.log(`[F-102] burrowed spearman passed under a 30-tile wall unseen; damage ${plain} → ${ambush} after surfacing; warship HP ${s.ents.maxHp[ship]} vs ${s.ents.maxHp[ship1]}`);
  });
});

describe('F-103 Mycelids', () => {
  it('fungus spreads from towns, poisons enemy units and chokes enemy farms; slow growth and fragile', () => {
    const s = new Sim({ seed: 'spores', size: 'small', players: 2, races: ['mycelids', 'baseline'] });
    const count = (): number => s.fungus!.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
    const c0 = count();
    run(s, 3000);
    const c1 = count();
    expect(c1).toBeGreaterThan(c0 + 20);
    // a Baseline unit standing on Mycelid fungus is poisoned; a Mycelid unit is not
    // two remote land tiles, far from every building (no tower or capital fire), each given Mycelid fungus
    const w = s.map.w, far = (i: number): boolean => { for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.owner[id] < 2) { const d = s.tileOf(id); if (Math.abs((d % w) - (i % w)) < 25 && Math.abs(Math.floor(d / w) - Math.floor(i / w)) < 25) return false; } return true; };
    const spots: number[] = [];
    for (let i = 0; i < s.fungus!.length && spots.length < 2; i += 37) if (s.cost(i, 1) > 0 && !s.occ[i] && far(i) && spots.every((o) => Math.abs((o % w) - (i % w)) > 15)) spots.push(i);
    const t = spots[0];
    for (const i of spots) s.fungus![i] = 1;
    const enemy = spawn(s, 1, 'spearman', spots[0]), friend = spawn(s, 0, 'spearman', spots[1]);
    const hpE = s.ents.hp[enemy];
    run(s, 41);
    expect(s.ents.hp[enemy]).toBeLessThan(hpE);
    expect(s.ents.hp[friend]).toBe(s.ents.maxHp[friend]);
    // enemy farm on fungus yields less
    const anchor = t - (t % w) + Math.max(0, (t % w) - 1);
    for (const k of [anchor, anchor + 1, anchor + w, anchor + w + 1]) s.fungus![k] = 1;
    expect(s.rules.farmPct(1, anchor, 2)).toBe(AB.fungalSpread.farmYieldPct);
    expect(s.rules.farmPct(0, anchor, 2)).toBe(100);
    // weakness: slow growth and fragile
    expect(s.rules.trainTicks(0, 'worker')).toBe(Math.floor((TUNING.unitTypes.worker.trainTicks * AB.slowGrowth.trainTimePct) / 100));
    expect(s.rules.trainTicks(1, 'worker')).toBe(TUNING.unitTypes.worker.trainTicks);
    expect(s.rules.unitStats(0, 'spearman').hp).toBe(Math.floor(TUNING.unitTypes.spearman.hp * 0.8));
    console.log(`[F-103] fungus ${c0} → ${c1} tiles in 5 min; enemy on fungus ${hpE} → ${s.ents.hp[enemy]} HP; enemy farm ${s.rules.farmPct(1, anchor, 2)} %; worker train ${s.rules.trainTicks(0, 'worker')} vs ${s.rules.trainTicks(1, 'worker')} ticks`);
  });
});

describe('F-104 Windriders', () => {
  it('gliders fly over walls and water in hops of at most glideTiles, resting between; fast scouts; poor defences', () => {
    const { s, at } = arena(['windriders', 'baseline'], 'wind');
    for (let y = 0; y < 30; y++) s.createBuilding(1, 'wall', at(15, y), true);
    for (let y = 0; y < 30; y++) for (let x = 24; x <= 27; x++) s.map.biome[at(x, y)] = Biome.OCEAN;
    s.flows.clear();
    unlock(s, 0, 'aerieCraft');
    const g = spawn(s, 0, 'glider', at(3, 10));
    const [tx, ty] = Sim.tileCenterFp(at(44, 10), s.map.w);
    issue(s, 0, { type: 'move', ids: [g], x: tx, y: ty });
    const stops = [xOf(s, g)];
    let rested = 0, k = 0;
    for (; k < 2000 && s.tileOf(g) !== at(44, 10); k++) {
      s.step();
      if (!s.ents.moving[g]) { rested++; if (stops[stops.length - 1] !== xOf(s, g)) stops.push(xOf(s, g)); }
    }
    stops.push(xOf(s, g));
    const maxHop = Math.max(...stops.slice(1).map((x, i) => x - stops[i]));
    expect(s.tileOf(g)).toBe(at(44, 10)); // crossed the wall line and the strait
    expect(rested).toBeGreaterThanOrEqual(AB.gliders.restTicks);
    expect(maxHop, 'stops ' + stops.join(' → ')).toBeLessThanOrEqual(AB.gliders.glideTiles);
    expect(s.map.biome[s.tileOf(g)]).toBe(Biome.PLAINS);
    // fast scouts, flimsy defences
    expect(s.rules.unitStats(0, 'scout').speed).toBeGreaterThan(s.rules.unitStats(1, 'scout').speed * 1.3);
    const t0 = s.createBuilding(0, 'tower', at(40, 25), true), t1 = s.createBuilding(1, 'tower', at(42, 25), true);
    expect(s.ents.maxHp[t0]).toBe(Math.floor((TUNING.buildingTypes.tower.hp * AB.poorDefense.defenceHpPct) / 100));
    expect(s.rules.damagePct(t0)).toBe(AB.poorDefense.towerAttackPct);
    expect(s.rules.damagePct(t1)).toBe(100);
    console.log(`[F-104] glider crossed a wall and 4 tiles of sea to x=44 in ${k} ticks, ${rested} ticks resting, stops ${stops.join(' → ')}; tower HP ${s.ents.maxHp[t0]} vs ${s.ents.maxHp[t1]}`);
  });
});

describe('F-105 Anvilborn', () => {
  it('cheaper and stronger gear; heavy, slow soldiers', () => {
    const { s, at } = arena(['anvilborn', 'baseline'], 'anvil');
    const a = s.rules.gearCost(0, 'ironWeapons').res, b = s.rules.gearCost(1, 'ironWeapons').res;
    expect(a[Res.STONE]).toBe(Math.ceil((TUNING.gear.items.ironWeapons.stone * AB.masterSmiths.gearCostPct) / 100));
    expect(b[Res.STONE]).toBe(TUNING.gear.items.ironWeapons.stone);
    expect(s.rules.gearTier(0, 'ironWeapons')).toBe(2);
    expect(s.rules.gearTier(1, 'ironWeapons')).toBe(1);
    expect(s.rules.unitStats(0, 'spearman').speed).toBe(Math.floor((TUNING.unitTypes.spearman.speed * AB.heavyFooted.militarySpeedPct) / 100));
    expect(s.rules.unitStats(0, 'worker').speed).toBe(TUNING.unitTypes.worker.speed); // only soldiers are heavy
    void at;
    console.log(`[F-105] iron weapons stone ${a[Res.STONE]} vs ${b[Res.STONE]}, tier 2 vs 1; spearman speed ${s.rules.unitStats(0, 'spearman').speed} vs ${s.rules.unitStats(1, 'spearman').speed}`);
  });
});

describe('F-106 Fenfolk', () => {
  it('fast and hidden in swamps; weak on open plains', () => {
    const { s, at } = arena(['fenfolk', 'baseline'], 'fen');
    for (const t of rect(at, 10, 5, 30, 15)) s.map.biome[t] = Biome.SWAMP;
    s.flows.clear();
    expect(s.cost(at(12, 8), 0)).toBeLessThan(s.cost(at(12, 8), 1));
    const f = spawn(s, 0, 'spearman', at(20, 10)), watcher = spawn(s, 1, 'spearman', at(25, 10));
    issue(s, 1, { type: 'hold', ids: [watcher] });
    s.step();
    expect(s.visibleTo(f, 1)).toBe(false);
    s.ents.posX[watcher] = s.ents.posX[f] + 1024; s.step();
    expect(s.visibleTo(f, 1)).toBe(true); // within 2 tiles
    const p = spawn(s, 0, 'spearman', at(5, 25));
    expect(s.rules.damagePct(p)).toBe(AB.openGroundWeak.damagePct);
    expect(s.rules.damagePct(f)).toBe(100);
    console.log(`[F-106] swamp cost ${s.cost(at(12, 8), 0)} vs ${s.cost(at(12, 8), 1)}; hidden at 5 tiles, seen at 1; plains damage ${s.rules.damagePct(p)} %`);
  });
});

describe('F-107 Rimeborn', () => {
  it('strong in the cold, ice fishing bonus; lose output in heat', () => {
    const { s, at } = arena(['rimeborn', 'baseline'], 'rime');
    for (const t of rect(at, 0, 0, 9, 9)) s.map.biome[t] = Biome.TUNDRA;
    for (const t of rect(at, 40, 0, 49, 9)) s.map.biome[t] = Biome.DESERT;
    const cold = spawn(s, 0, 'spearman', at(5, 5)), hot = spawn(s, 0, 'spearman', at(45, 5));
    expect(s.rules.damagePct(cold)).toBe(AB.frostAdapted.coldDamagePct);
    expect(s.rules.damagePct(hot)).toBe(AB.heatWeak.hotDamagePct);
    expect(s.rules.workPct(0, at(5, 5), 'gather', false)).toBe(AB.frostAdapted.coldGatherPct);
    expect(s.rules.workPct(0, at(45, 5), 'gather', false)).toBe(AB.heatWeak.hotOutputPct);
    expect(s.rules.workPct(1, at(45, 5), 'gather', false)).toBe(100);
    // ice fishing: same lodge, same ice, one Rimeborn worker vs one Baseline worker
    for (const t of rect(at, 15, 15, 35, 17)) s.map.biome[t] = Biome.ICE;
    own(s, 0, rect(at, 15, 18, 24, 22)); unlock(s, 0, 'iceLodges');
    expect(s.canPlace(0, 'iceLodge', at(18, 18))).toBeNull();
    expect(s.canPlace(1, 'iceLodge', at(30, 18))).toBe('another people builds this');
    const l0 = s.createBuilding(0, 'iceLodge', at(18, 18), true), l1 = s.createBuilding(1, 'iceLodge', at(30, 18), true);
    const w0 = spawn(s, 0, 'worker', at(18, 21)), w1 = spawn(s, 1, 'worker', at(30, 21));
    issue(s, 0, { type: 'interact', ids: [w0], target: l0 }); issue(s, 1, { type: 'interact', ids: [w1], target: l1 });
    s.ps[0].stock[Res.FOOD] = 0; s.ps[1].stock[Res.FOOD] = 0;
    run(s, 1800);
    const f0 = s.ps[0].totalIncome[Res.FOOD], f1 = s.ps[1].totalIncome[Res.FOOD];
    expect(f0 / Math.max(1, f1)).toBeGreaterThan(1.35);
    console.log(`[F-107] cold damage ${s.rules.damagePct(cold)} %, desert ${s.rules.damagePct(hot)} %; ice fishing food in 3 min ${f0} vs ${f1}`);
  });
});

describe('Phase 5 determinism and saves', () => {
  it('a match with races, research and gear is deterministic and survives save/load', () => {
    const make = (): Sim => {
      const s = new Sim({ seed: 'p5-det', size: 'small', players: 3, races: ['mycelids', 'delvers', 'windriders'] });
      for (const ps of s.ps) ps.stock = [2000, 2000, 2000, 2000, 2000, 2000];
      issue(s, 0, { type: 'research', node: 'smithing' });
      issue(s, 1, { type: 'research', node: 'deepHalls' });
      return s;
    };
    const a = make(), b = make();
    run(a, 800); run(b, 800);
    expect(a.hash()).toBe(b.hash());
    const c = loadSim(JSON.parse(JSON.stringify(saveSim(a))));
    expect(c.hash()).toBe(a.hash());
    run(a, 400); run(c, 400);
    expect(c.hash()).toBe(a.hash());
    expect(c.ps[1].researched).toEqual(['deepHalls']);
    expect(GEAR_IDS.length).toBe(c.ps[0].gear.length);
    void STAT_KEYS;
  });
});

describe('F-044 piers and F-133 tech victory', () => {
  it('piers: locked before Piers, then placeable only on open water touching own land; land units walk on them', () => {
    const { s, at } = arena(['baseline', 'baseline'], 'pier');
    for (const t of rect(at, 20, 0, 29, 29)) s.map.biome[t] = Biome.OCEAN;
    own(s, 0, rect(at, 10, 5, 19, 15));
    expect(s.canPlace(0, 'pier', at(20, 8))).toBe('not researched yet');
    unlock(s, 0, 'piers');
    expect(s.canPlace(0, 'pier', at(20, 8))).toBeNull();
    expect(s.canPlace(0, 'pier', at(25, 8))).toBe('must touch your land');
    expect(s.canPlace(0, 'pier', at(18, 8))).toBe('must be on open water');
    const p = s.createBuilding(0, 'pier', at(20, 8), true);
    expect(s.cost(at(21, 9), 0)).toBeGreaterThan(0);
    expect(s.cost(at(22, 9), 0)).toBe(0);
    const u = spawn(s, 0, 'spearman', at(15, 9));
    const [x, y] = Sim.tileCenterFp(at(21, 9), s.map.w);
    issue(s, 0, { type: 'move', ids: [u], x, y });
    run(s, 200);
    expect(s.tileOf(u)).toBe(at(21, 9));
    void p;
  });

  it('tech victory is off by default; when on, own capstone + 60 % of the shared tree wins', () => {
    const make = (tech: boolean): Sim => new Sim({ seed: 'techwin', size: 'small', players: 2, races: ['rimeborn', 'baseline'], victory: tech ? { tech: true } : undefined });
    for (const on of [false, true]) {
      const s = make(on);
      unlock(s, 0, 'iceLodges', 'deepWinter', 'mammothHerds', 'smithing', 'toolmaking', 'alloys', 'piers'); // 4 of 6 shared
      s.step();
      expect(s.winner).toBe(on ? 0 : -1);
    }
    const s = make(true);
    unlock(s, 0, 'iceLodges', 'deepWinter', 'mammothHerds', 'smithing', 'toolmaking', 'alloys'); // 3 of 6 = 50 %
    s.step();
    expect(s.winner).toBe(-1);
  });
});
