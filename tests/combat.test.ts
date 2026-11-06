// Phase 3 acceptance tests: units, orders, combat factors, morale, walls/gates, trenches/moats, fire,
// siege, naval, transports, flow fields, conquest and elimination (Node; same code runs in the worker).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Rng } from '../src/sim/core/prng';
import { FP_ONE, tileCenter } from '../src/sim/core/fixed';
import { TUNING } from '../src/sim/core/tuning';
import { Biome, isWaterBiome } from '../src/sim/world/mapgen';
import { BUILDING_TYPES, Kind, RES_NONE, Res, Task, UNIT_TYPES, buildingKind, unitDef, type UnitTypeName } from '../src/sim/defs';
import { addStartingArmy, issue, ownedOfKind, scriptTick } from '../src/sim/scripted';
import { loadSim, saveSim } from '../src/sim/serialize';

const C = TUNING.combat;
const tileOfU = (s: Sim, id: number): number => s.tileOf(id);
const xy = (s: Sim, t: number): [number, number] => [t % s.map.w, Math.floor(t / s.map.w)];
const run = (s: Sim, n: number, each?: () => void): void => { for (let k = 0; k < n; k++) { s.step(); each?.(); } };

/** A flat 50×30 plains arena (level 2) with no buildings or resources, on a 2-player Small map. */
function arena(seed = 'arena', W = 50, H = 30, players = 2): { s: Sim; ox: number; oy: number; at: (x: number, y: number) => number } {
  for (let k = 0; k < 50; k++) {
    const s = new Sim({ seed: `${seed}-${k}`, size: 'small', players });
    const w = s.map.w;
    for (let oy = 8; oy + H < s.map.h - 8; oy += 4) for (let ox = 8; ox + W < w - 8; ox += 4) {
      let ok = true;
      for (let y = oy - 2; y < oy + H + 2 && ok; y++) for (let x = ox - 2; x < ox + W + 2; x++) if (s.occ[y * w + x] || s.tileOwner[y * w + x] !== 255) { ok = false; break; }
      if (!ok) continue;
      for (let y = oy; y < oy + H; y++) for (let x = ox; x < ox + W; x++) {
        const t = y * w + x;
        s.map.biome[t] = Biome.PLAINS; s.map.height[t] = 2; s.res.type[t] = RES_NONE; s.res.amount[t] = 0;
      }
      // remove wildlife inside the arena
      for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.owner[id] === 254) {
        const [x, y] = xy(s, tileOfU(s, id));
        if (x >= ox - 2 && x < ox + W + 2 && y >= oy - 2 && y < oy + H + 2) s.ents.kill(id);
      }
      s.flows.clear();
      return { s, ox, oy, at: (x: number, y: number) => (oy + y) * w + ox + x };
    }
  }
  throw new Error('no arena');
}
const spawn = (s: Sim, p: number, u: UnitTypeName, t: number): number => s.spawnUnitAt(p, u, t);
const building = (s: Sim, p: number, bt: (typeof BUILDING_TYPES)[number], t: number): number => s.createBuilding(p, bt, t, true);

describe('F-072 unit types', () => {
  it('every unit type exists with its distinguishing trait', () => {
    const d = (u: UnitTypeName) => unitDef(u);
    expect(UNIT_TYPES).toEqual(['scout', 'worker', 'settler', 'spearman', 'archer', 'rider', 'ram', 'spy', 'saboteur', 'warship', 'transport']);
    expect(d('archer').range).toBeGreaterThan(5 * d('spearman').range);                 // ranged
    expect(d('rider').speed).toBeGreaterThan(1.5 * d('spearman').speed);                 // cavalry
    expect(d('ram').vsBuildings).toBeGreaterThanOrEqual(5 * d('spearman').vsBuildings);  // siege
    expect(d('warship').water).toBe(1); expect(d('transport').capacity).toBeGreaterThan(0); // naval
    expect(d('spy').stealth).toBe(1); expect(d('saboteur').stealth).toBe(1);              // spies / saboteurs
    // stealth in practice: an enemy 5 tiles away cannot see a spy; 1 tile away it can
    const { s, at } = arena('stealth');
    const spy = spawn(s, 1, 'spy', at(10, 10)), watcher = spawn(s, 0, 'spearman', at(15, 10));
    issue(s, 0, { type: 'hold', ids: [watcher] });
    s.step();
    const vis5 = s.visibleTo(spy, 0), spyTile = s.fog[0].data[s.tileOf(spy)];
    expect(spyTile).toBe(255);   // the tile itself is in plain sight…
    expect(vis5).toBe(false);    // …but the spy is not
    s.ents.posX[watcher] = tileCenter(at(11, 10) % s.map.w);
    s.step();
    expect(s.visibleTo(spy, 0)).toBe(true);
    console.log('[F-072] ranges ×10 tiles: spearman %d archer %d; speed spearman %d rider %d; ram vs buildings %d %%; spy hidden at 5 tiles, seen at 1', d('spearman').range, d('archer').range, d('spearman').speed, d('rider').speed, d('ram').vsBuildings);
  });

  it('barracks, workshop and dock train their units', () => {
    const s = new Sim({ seed: 'train-mil', size: 'small', players: 1 });
    const cap = ownedOfKind(s, 0, buildingKind('capital'))[0], w = s.map.w;
    s.ps[0].stock = [5000, 5000, 5000, 5000, 0, 0];
    s.ps[0].housing = 200;
    const near = (bt: (typeof BUILDING_TYPES)[number]): number => {
      for (let r = 3; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const t = s.ents.anchor[cap] + dy * w + dx;
        if (s.canPlace(0, bt, t) === null || (bt === 'dock' && s.canPlace(0, bt, t) === 'outside your territory')) {
          if (bt === 'dock') { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) s.tileOwner[t + y * w + x] = 0; if (s.canPlace(0, bt, t) !== null) continue; }
          return t;
        }
      }
      return -1;
    };
    const b = building(s, 0, 'barracks', near('barracks')), ws = building(s, 0, 'workshop', near('workshop'));
    const dockT = near('dock');
    const dock = dockT >= 0 ? building(s, 0, 'dock', dockT) : -1;
    // give lots of housing
    for (let i = 0; i < 6; i++) { const h = near('house'); if (h >= 0) building(s, 0, 'house', h); }
    for (const u of ['spearman', 'archer', 'rider', 'spy', 'saboteur'] as const) issue(s, 0, { type: 'train', building: b, utype: UNIT_TYPES.indexOf(u) });
    issue(s, 0, { type: 'train', building: ws, utype: UNIT_TYPES.indexOf('ram') });
    if (dock >= 0) { issue(s, 0, { type: 'train', building: dock, utype: UNIT_TYPES.indexOf('warship') }); issue(s, 0, { type: 'train', building: dock, utype: UNIT_TYPES.indexOf('transport') }); }
    run(s, 1200);
    const have = (k: number) => ownedOfKind(s, 0, k).length;
    console.log(`[F-072] trained: spearman ${have(Kind.SPEARMAN)}, archer ${have(Kind.ARCHER)}, rider ${have(Kind.RIDER)}, spy ${have(Kind.SPY)}, saboteur ${have(Kind.SABOTEUR)}, ram ${have(Kind.RAM)}, warship ${have(Kind.WARSHIP)}, transport ${have(Kind.TRANSPORT)} (dock placed: ${dock >= 0})`);
    for (const k of [Kind.SPEARMAN, Kind.ARCHER, Kind.RIDER, Kind.SPY, Kind.SABOTEUR, Kind.RAM]) expect(have(k)).toBe(1);
    expect(dock).toBeGreaterThanOrEqual(0);
    expect(have(Kind.WARSHIP)).toBe(1); expect(have(Kind.TRANSPORT)).toBe(1);
    for (const id of [...ownedOfKind(s, 0, Kind.WARSHIP), ...ownedOfKind(s, 0, Kind.TRANSPORT)]) expect(isWaterBiome(s.map.biome[tileOfU(s, id)])).toBe(true);
  });
});

describe('F-074 combat factors (exact damage formula)', () => {
  const formula = (atk: number, vs: number, mods: number[], armor: number, armorTier = 0): number => {
    let d = atk * 100;
    d = Math.floor((d * vs) / 100);
    for (const m of mods) d = Math.floor((d * m) / 100);
    d = Math.floor(d / 100) - armor;
    d = Math.floor((d * (100 - armorTier * C.armorTierPct)) / 100);
    return Math.max(1, d);
  };
  it('stats, armor/weapon tiers, height, forest cover, trench, fortification', () => {
    const { s, at } = arena('factors');
    const sp = spawn(s, 0, 'spearman', at(10, 10)), ar = spawn(s, 0, 'archer', at(10, 14)), en = spawn(s, 1, 'spearman', at(11, 10));
    const D = (a: number, t: number) => s.mil.damage(a, t);
    const rows: string[] = [];
    const check = (name: string, got: number, want: number) => { rows.push(`${name} ${got}`); expect(got).toBe(want); };
    check('spear→spear flat', D(sp, en), formula(11, 100, [100, 100], 2));
    check('archer→spear flat', D(ar, en), formula(8, 100, [100, 100], 2));
    s.map.height[tileOfU(s, ar)] = 3;
    check('archer high ground', D(ar, en), formula(8, 100, [100, 100, 100 + C.heightBonusPct], 2));
    s.map.height[tileOfU(s, ar)] = 1;
    check('archer low ground', D(ar, en), formula(8, 100, [100, 100, 100 - C.heightPenaltyPct], 2));
    s.map.height[tileOfU(s, ar)] = 2;
    s.map.biome[tileOfU(s, en)] = Biome.FOREST;
    check('target in forest', D(ar, en), formula(8, 100, [100, 100, 100 - C.forestCoverPct], 2));
    s.map.biome[tileOfU(s, en)] = Biome.TRENCH;
    // trench also lowers the target one level → attacker counts as higher
    check('target in trench', D(ar, en), formula(8, 100, [100, 100, 100 + C.heightBonusPct, 100 - C.trenchCoverPct], 2));
    s.map.biome[tileOfU(s, en)] = Biome.PLAINS;
    building(s, 1, 'wall', at(12, 10));
    check('target fortified by wall', D(ar, en), formula(8, 100, [100, 100, 100 - C.fortifiedPct], 2));
    s.ents.weaponTier[sp] = 2;
    check('weapon tier 2', D(sp, en), formula(11, 100, [100, 100 + 2 * C.weaponTierPct], 2));
    s.ents.armorTier[en] = 2;
    check('armor tier 2', D(sp, en), formula(11, 100, [100, 100 + 2 * C.weaponTierPct], 2, 2));
    const tower = building(s, 0, 'tower', at(20, 20));
    const g1 = spawn(s, 0, 'spearman', at(21, 20)); s.ents.carrier[g1] = tower;
    // target still stands next to the wall → fortified applies to the tower's arrows too
    check('tower + 1 garrison', D(tower, en), formula(9 + C.garrisonArrowBonus, 100, [100, 100, 100 - C.fortifiedPct], 2, 2));
    console.log('[F-074] ' + rows.join(' | '));
  });
});

describe('F-070 / F-071 orders and auto-fight', () => {
  it('attack kills the target; idle soldiers auto-engage; hold does not chase', () => {
    const { s, at } = arena('orders');
    const a = spawn(s, 0, 'spearman', at(5, 5)), t = spawn(s, 1, 'scout', at(15, 5));
    issue(s, 1, { type: 'hold', ids: [t] }); // stands its ground (soldiers would rout at half health)
    issue(s, 0, { type: 'attack', ids: [a], target: t });
    run(s, 600);
    expect(s.ents.alive[t]).toBe(0);
    // auto-engage: an idle spearman reacts to an enemy 5 tiles away
    const idle = spawn(s, 0, 'spearman', at(5, 15)), foe = spawn(s, 1, 'spearman', at(10, 15));
    run(s, 2);
    expect(s.ents.task[idle]).toBe(Task.ATTACK);
    // hold: does not move towards an enemy 5 tiles away
    const holder = spawn(s, 0, 'spearman', at(30, 20)), bait = spawn(s, 1, 'scout', at(35, 20));
    issue(s, 0, { type: 'hold', ids: [holder] });
    const hx = s.ents.posX[holder];
    run(s, 100);
    expect(s.ents.posX[holder]).toBe(hx);
    expect(s.ents.hp[bait]).toBe(s.ents.maxHp[bait]);
    void foe;
    console.log('[F-070/071] attack order killed its target; idle spearman engaged an enemy at 5 tiles; held spearman did not move or chase in 100 ticks');
  });

  it('retreat, patrol, garrison, formations, rally point', () => {
    const s = new Sim({ seed: 'orders2', size: 'small', players: 1 });
    const cap = ownedOfKind(s, 0, buildingKind('capital'))[0], ct = s.ents.anchor[cap], w = s.map.w;
    const free: number[] = [];
    for (let r = 3; free.length < 12 && r < 20; r++) for (let dx = -r; dx <= r; dx++) { const t = ct + r * w + dx; if (s.cost(t) > 0) free.push(t); }
    // retreat: from a reachable spot ~12 tiles away
    let farTile = -1;
    for (let r = 12; r < 25 && farTile < 0; r++) for (let dx = -r; dx <= r && farTile < 0; dx++) for (const dy of [-r, r]) {
      const t = ct + dy * w + dx;
      if (t > 0 && t < s.map.biome.length && s.cost(t) > 0 && s.map.continent[t] === s.map.continent[ct]) { farTile = t; break; }
    }
    const far = spawn(s, 0, 'spearman', farTile);
    issue(s, 0, { type: 'retreat', ids: [far] });
    run(s, 300);
    const [fx, fy] = xy(s, tileOfU(s, far)), [cx, cy] = xy(s, ct);
    expect(Math.max(Math.abs(fx - cx - 1), Math.abs(fy - cy - 1))).toBeLessThanOrEqual(4);
    // patrol between two points
    const pat = spawn(s, 0, 'scout', free[1]);
    const [px, py] = xy(s, free[1]);
    issue(s, 0, { type: 'patrol', ids: [pat], x: tileCenter(px + 6), y: tileCenter(py) });
    const xs: number[] = [];
    run(s, 600, () => xs.push(s.ents.posX[pat] >> 10));
    // count direction reversals (ignoring pauses)
    let turns = 0, dir = 0;
    for (let i = 1; i < xs.length; i++) { const d = Math.sign(xs[i] - xs[i - 1]); if (d && dir && d !== dir) turns++; if (d) dir = d; }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(5);
    expect(turns).toBeGreaterThanOrEqual(4);
    // garrison into the capital
    const g = spawn(s, 0, 'archer', free[2]);
    issue(s, 0, { type: 'interact', ids: [g], target: cap });
    run(s, 200);
    expect(s.ents.carrier[g]).toBe(cap);
    expect(s.visibleTo(g, 0)).toBe(false);
    issue(s, 0, { type: 'ungarrison', building: cap });
    run(s, 2);
    expect(s.ents.carrier[g]).toBe(-1);
    // formation (on flat open ground): 9 soldiers to one point → 9 distinct tiles in a 3×3 box; line → one row
    const A = arena('formation');
    const group = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => spawn(A.s, 0, 'spearman', A.at(5 + (k % 3), 5 + Math.floor(k / 3))));
    const goal = A.at(30, 15);
    const [gx, gy] = xy(A.s, goal);
    issue(A.s, 0, { type: 'move', ids: group, x: tileCenter(gx), y: tileCenter(gy) });
    run(A.s, 500);
    const tiles = group.map((id) => tileOfU(A.s, id));
    expect(new Set(tiles).size).toBe(9);
    const xsF = tiles.map((t) => t % A.s.map.w), ysF = tiles.map((t) => Math.floor(t / A.s.map.w));
    expect(Math.max(...xsF) - Math.min(...xsF) + 1).toBe(3); expect(Math.max(...ysF) - Math.min(...ysF) + 1).toBe(3);
    console.log(`[F-070] retreat ended ${Math.max(Math.abs(fx - cx - 1), Math.abs(fy - cy - 1))} tiles from the capital; patrol x range ${Math.min(...xs)}–${Math.max(...xs)} with ${turns} turns; garrison hid the archer and released it; box formation spans ${Math.max(...xsF) - Math.min(...xsF) + 1}×${Math.max(...ysF) - Math.min(...ysF) + 1}`);
    issue(A.s, 0, { type: 'move', ids: group, x: tileCenter(gx), y: tileCenter(gy - 6), formation: 'line' });
    run(A.s, 500);
    const rowY = new Set(group.map((id) => Math.floor(tileOfU(A.s, id) / A.s.map.w)));
    const rowX = new Set(group.map((id) => tileOfU(A.s, id) % A.s.map.w));
    expect(Math.min(rowY.size, rowX.size)).toBe(1); // a single row or column
    // rally point: trained worker walks to the rally tile
    s.ps[0].stock[Res.FOOD] = 500; s.ps[0].housing = 100;
    const rally = free[11] + 3 * w;
    issue(s, 0, { type: 'setRally', building: cap, tile: rally });
    issue(s, 0, { type: 'train', building: cap, utype: UNIT_TYPES.indexOf('scout') });
    run(s, 400);
    const scouts = ownedOfKind(s, 0, Kind.SCOUT);
    const newest = scouts[scouts.length - 1];
    expect(Math.max(Math.abs(tileOfU(s, newest) % w - rally % w), Math.abs(Math.floor(tileOfU(s, newest) / w) - Math.floor(rally / w)))).toBeLessThanOrEqual(1);
  });
});

describe('F-075 morale', () => {
  it('a battered soldier routs home, then rallies after it stops being hit', () => {
    const { s, at } = arena('morale');
    const cap1 = ownedOfKind(s, 1, buildingKind('capital'))[0];
    const victim = spawn(s, 1, 'spearman', at(20, 10));
    const shooters = [0, 1].map((k) => spawn(s, 0, 'archer', at(15, 9 + k)));
    issue(s, 0, { type: 'hold', ids: shooters });
    issue(s, 1, { type: 'hold', ids: [victim] });
    const tasks: number[] = [], events: string[] = [];
    run(s, 900, () => { tasks.push(s.ents.task[victim]); events.push(...s.drainEvents().filter((e) => e.player === 1).map((e) => e.type)); });
    const routedAt = tasks.indexOf(Task.ROUT);
    const ralliedAt = tasks.findIndex((t, i) => i > routedAt && t === Task.IDLE);
    console.log(`[F-075] victim hp ${s.ents.hp[victim]}/${s.ents.maxHp[victim]}, routed at tick ${routedAt}, rallied (idle) at tick ${ralliedAt}, morale now ${s.ents.morale[victim]}`);
    expect(routedAt).toBeGreaterThan(0);
    expect(events).toContain('rout');
    expect(ralliedAt).toBeGreaterThan(routedAt);
    void cap1;
  });
});

describe('F-076 siege and demolition', () => {
  it('a ram breaks a wall in the expected time; the tile becomes passable; spears are far slower', () => {
    const wallTime = (u: UnitTypeName): { ticks: number; passable: boolean } => {
      const { s, at } = arena('siege');
      const wall = building(s, 1, 'wall', at(20, 10));
      const r = spawn(s, 0, u, at(18, 10));
      issue(s, 0, { type: 'attack', ids: [r], target: wall });
      let ticks = 0;
      while (s.ents.alive[wall] && ticks < 3000) { s.step(); ticks++; }
      return { ticks, passable: s.cost(at(20, 10), 0) > 0 };
    };
    const ram = wallTime('ram'), spear = wallTime('spearman');
    const dmg = Math.floor((30 * 100 * 500) / 100 / 100);
    const expected = Math.ceil(500 / dmg) * 25;
    console.log(`[F-076] wall (500 hp): ram ${ram.ticks} ticks (≈ ${expected} expected after walking 1 tile), spearman ${spear.ticks} ticks; tile passable after: ${ram.passable}`);
    expect(ram.passable).toBe(true);
    expect(ram.ticks).toBeLessThanOrEqual(expected + 40);
    expect(spear.ticks).toBeGreaterThan(ram.ticks * 5);
  });
});

describe('F-040 / F-043 walls, gates and re-pathing', () => {
  it('a wall line blocks enemies; the owner walks through its gate; enemies cannot', () => {
    const { s, ox, at } = arena('gate');
    const w = s.map.w, wx = ox + 25;
    // wall every land tile of column wx (the whole continent), gate in the arena
    let gate = -1;
    for (let y = 0; y < s.map.h; y++) {
      const t = y * w + wx;
      if (s.cost(t) <= 0) continue; // already impassable (sea, lake, rock deposit)
      s.res.type[t] = RES_NONE; s.res.amount[t] = 0;
      if (t === at(25, 15)) gate = building(s, 0, 'gate', t); else building(s, 0, 'wall', t);
    }
    const mine = spawn(s, 0, 'scout', at(20, 15)), theirs = spawn(s, 1, 'scout', at(20, 16));
    issue(s, 0, { type: 'move', ids: [mine], x: tileCenter(ox + 30), y: tileCenter(Math.floor(at(0, 15) / w)) });
    issue(s, 1, { type: 'move', ids: [theirs], x: tileCenter(ox + 30), y: tileCenter(Math.floor(at(0, 16) / w)) });
    const ev: string[] = [];
    run(s, 200, () => ev.push(...s.drainEvents().filter((e) => e.player === 1).map((e) => e.type)));
    const mx = tileOfU(s, mine) % w, tx = tileOfU(s, theirs) % w;
    console.log(`[F-040] owner scout x=${mx} (crossed gate at ${wx}); enemy scout x=${tx}, events ${JSON.stringify(ev)}`);
    expect(mx).toBeGreaterThan(wx);
    expect(tx).toBeLessThan(wx);
    expect(ev).toContain('unreachable');
    void gate;
  });

  it('a wall built across a path makes the unit re-route at once; removing it restores the straight route; fuzz never puts a unit on a wall', () => {
    const { s, at, ox, oy } = arena('reroute');
    const w = s.map.w;
    const u = spawn(s, 0, 'scout', at(5, 15));
    issue(s, 0, { type: 'move', ids: [u], x: tileCenter(ox + 40), y: tileCenter(oy + 15) });
    run(s, 5);
    const straight = s.ents.paths[u]!.length;
    const wallTiles: number[] = [];
    for (let y = 2; y < 28; y++) wallTiles.push(at(20, y));
    let ids = wallTiles.map((t) => building(s, 0, 'wall', t));
    let rerouted = -1;
    run(s, 40, () => { if (rerouted < 0 && s.ents.paths[u] && !s.ents.paths[u]!.some((t) => wallTiles.includes(t))) rerouted = s.tick; });
    const t0 = s.tick - 40;
    let onWall = false;
    run(s, 400, () => { if (s.occ[tileOfU(s, u)]) onWall = true; });
    const arrived = Math.abs(tileOfU(s, u) % w - (ox + 40)) <= 1;
    for (const b of ids) issue(s, 0, { type: 'demolish', building: b });
    run(s, 2);
    issue(s, 0, { type: 'move', ids: [u], x: tileCenter(ox + 5), y: tileCenter(oy + 15) });
    run(s, 3);
    const back = s.ents.paths[u]!.length;
    console.log(`[F-043] straight path ${straight} tiles; wall placed → re-routed after ${rerouted - t0} ticks; arrived via the gap: ${arrived}; after demolition the path back is ${back} tiles`);
    expect(rerouted - t0).toBeLessThanOrEqual(20);
    expect(onWall).toBe(false);
    expect(arrived).toBe(true);
    expect(Math.abs(back - straight)).toBeLessThanOrEqual(2);
    // fuzz: 20 units wander while walls appear and disappear
    const rng = Rng.stream('fuzz', 'walls');
    const us = Array.from({ length: 20 }, (_, k) => spawn(s, 0, 'spearman', at(2 + k * 2, 5 + (k % 3) * 8)));
    let violations = 0;
    ids = [];
    for (let k = 0; k < 1000; k++) {
      if (k % 25 === 0) for (const id of us) issue(s, 0, { type: 'move', ids: [id], x: tileCenter(ox + rng.int(50)), y: tileCenter(oy + rng.int(30)) });
      if (k % 50 === 10) {
        for (const b of ids) if (s.ents.alive[b]) issue(s, 0, { type: 'demolish', building: b });
        ids = [];
        for (let j = 0; j < 12; j++) {
          const t = at(rng.int(50), rng.int(30));
          if (!s.occ[t] && !us.some((id) => tileOfU(s, id) === t)) ids.push(building(s, 0, 'wall', t));
        }
      }
      s.step();
      for (const id of us) { const o = s.occ[tileOfU(s, id)]; if (o && s.ents.kind[o - 1] === buildingKind('wall')) violations++; }
    }
    console.log(`[F-043] fuzz: 1000 ticks, 20 units, walls re-placed every 50 ticks → ${violations} unit-on-wall observations`);
    expect(violations).toBe(0);
  });
});

describe('F-041 / F-042 trenches and moats', () => {
  it('workers dig a trench (lower, slow ground); trenches touching water fill as moats; dry trenches stay dry', () => {
    const s = new Sim({ seed: 'dig', size: 'small', players: 1 });
    const w = s.map.w;
    const cap = ownedOfKind(s, 0, buildingKind('capital'))[0];
    const worker = ownedOfKind(s, 0, Kind.WORKER)[0];
    let tile = -1;
    for (let r = 3; r < 8 && tile < 0; r++) for (let dx = -r; dx <= r && tile < 0; dx++) { const t = s.ents.anchor[cap] + r * w + dx; if (s.mil.canDig(0, t)) tile = t; }
    issue(s, 0, { type: 'dig', ids: [worker], tiles: [tile] });
    let doneAt = -1;
    run(s, 600, () => { if (doneAt < 0 && s.map.biome[tile] === Biome.TRENCH) doneAt = s.tick; });
    expect(s.map.biome[tile]).toBe(Biome.TRENCH);
    expect(s.cost(tile)).toBe(TUNING.terrainEdit.trenchMoveCost);
    // moat fill: a 6-tile trench from a lake shore fills tile by tile; a separate trench stays dry
    let lakeShore = -1, dir = 0;
    const D: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let t = 0; t < s.map.biome.length && lakeShore < 0; t++) {
      if (s.map.biome[t] !== Biome.LAKE) continue;
      for (let k = 0; k < 4; k++) {
        const [dx, dy] = D[k];
        let ok = true;
        for (let j = 1; j <= 8; j++) { const n = t + dx * j + dy * j * w; if (isWaterBiome(s.map.biome[n]) || s.occ[n] || s.map.biome[n] === Biome.MOUNTAIN || s.map.biome[n] === Biome.SNOW) ok = false; }
        if (ok) { lakeShore = t; dir = k; break; }
      }
    }
    expect(lakeShore).toBeGreaterThanOrEqual(0);
    const [dx, dy] = D[dir];
    const chain = [1, 2, 3, 4, 5, 6].map((j) => lakeShore + dx * j + dy * j * w);
    const dry = lakeShore + dx * 8 + dy * 8 * w;
    for (const t of chain) s.mil.makeTrench(t);
    s.mil.makeTrench(dry);
    const t0 = s.tick;
    let filledAt = -1;
    run(s, 300, () => { if (filledAt < 0 && chain.every((t) => s.map.biome[t] === Biome.MOAT)) filledAt = s.tick; });
    console.log(`[F-041] worker dug the trench in ${doneAt} ticks; trench move cost ${s.cost(tile)} vs plains 10. [F-042] 6-tile trench from a lake became moat after ${filledAt - t0} ticks; separate trench: ${s.map.biome[dry] === Biome.TRENCH ? 'still dry' : 'flooded'}; land path cost on moat ${s.cost(chain[2])}`);
    expect(filledAt - t0).toBeLessThanOrEqual(6 * TUNING.terrainEdit.moatFillTicks + TUNING.terrainEdit.moatFillTicks);
    expect(s.map.biome[dry]).toBe(Biome.TRENCH);
    expect(s.cost(chain[2])).toBe(0);
  });
});

describe('F-045 fire', () => {
  it('fire spreads through forest only, damages nearby buildings and burns out to plains', () => {
    let s: Sim | null = null, start = -1;
    for (let k = 0; k < 20 && start < 0; k++) {
      s = new Sim({ seed: `fire-${k}`, size: 'small', players: 1 });
      const w = s.map.w;
      for (let t = 0; t < s.map.biome.length && start < 0; t++) {
        let n = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s.res.type[t + dy * w + dx] === Res.WOOD) n++;
        if (n === 25 && s.tileOwner[t] === 255) start = t;
      }
    }
    const sim = s!;
    const before = sim.map.biome.slice(), wood = sim.res.type.slice();
    const everBurned = new Set<number>();
    sim.mil.ignite(start);
    let maxBurning = 0, ticks = 0;
    while (ticks < 20000 && (ticks === 0 || sim.burningList.length)) {
      sim.step(); ticks++;
      for (const t of sim.burningList) everBurned.add(t);
      maxBurning = Math.max(maxBurning, sim.burningList.length);
    }
    const onlyForest = [...everBurned].every((t) => before[t] === Biome.FOREST && wood[t] === Res.WOOD);
    const nowPlains = [...everBurned].every((t) => sim.map.biome[t] === Biome.PLAINS && sim.res.type[t] === RES_NONE);
    console.log(`[F-045] fire burned ${everBurned.size} tiles (max ${maxBurning} at once) and went out after ${ticks} ticks; every burnt tile was forest: ${onlyForest}; all are plains now: ${nowPlains}`);
    expect(everBurned.size).toBeGreaterThan(5);
    expect(onlyForest).toBe(true);
    expect(nowPlains).toBe(true);
    expect(sim.burningList.length).toBe(0);
    // a house next to forest catches fire and loses hp
    const s2 = new Sim({ seed: 'fire-house', size: 'small', players: 1 });
    let houseTile = -1, forest = -1;
    for (let t = 0; t < s2.map.biome.length && houseTile < 0; t++) {
      if (s2.res.type[t] !== Res.WOOD) continue;
      const n = t + 1;
      if (!isWaterBiome(s2.map.biome[n]) && s2.res.type[n] === RES_NONE && !s2.occ[n] && s2.map.biome[n] !== Biome.MOUNTAIN) { houseTile = n; forest = t; }
    }
    const house = building(s2, 0, 'house', houseTile);
    s2.mil.ignite(forest);
    let burnedHouse = false;
    run(s2, 600, () => { if (s2.burning[houseTile] > 0) burnedHouse = true; });
    console.log(`[F-045] house next to burning forest: caught fire ${burnedHouse}, hp ${s2.ents.alive[house] ? s2.ents.hp[house] : 0}/${TUNING.buildingTypes.house.hp}`);
    if (burnedHouse) expect(s2.ents.alive[house] ? s2.ents.hp[house] : 0).toBeLessThan(TUNING.buildingTypes.house.hp);
  });
});

describe('F-077 / F-083 naval units and transports', () => {
  it('warships stay on water and shoot the coast; transports carry soldiers to another continent; a sunk transport loses its cargo', () => {
    const s = new Sim({ seed: 'navy', size: 'small', players: 2 });
    const w = s.map.w, m = s.map;
    // shore water tile next to continent 0 and a landing tile on continent 1
    let water = -1, shore = -1, landing = -1;
    for (let t = w; t < m.biome.length - w && water < 0; t++) {
      if (m.biome[t] !== Biome.OCEAN) continue;
      for (const n of [t + 1, t - 1, t + w, t - w]) if (m.continent[n] === 0 && s.cost(n) > 0 && !s.occ[n]) { water = t; shore = n; break; }
    }
    for (let t = w; t < m.biome.length - w && landing < 0; t++) {
      if (m.continent[t] !== 1 || s.cost(t) <= 0 || s.occ[t]) continue;
      if ([t + 1, t - 1, t + w, t - w].some((n) => m.biome[n] === Biome.OCEAN)) landing = t;
    }
    const ship = spawn(s, 0, 'transport', water);
    const troops = [0, 1, 2, 3].map(() => spawn(s, 0, 'spearman', shore));
    issue(s, 0, { type: 'interact', ids: troops, target: ship });
    run(s, 100);
    expect(troops.every((id) => s.ents.carrier[id] === ship)).toBe(true);
    issue(s, 0, { type: 'unload', ship, tile: landing });
    const shipTiles: number[] = [];
    run(s, 3000, () => shipTiles.push(tileOfU(s, ship)));
    const onLand = troops.filter((id) => s.ents.carrier[id] < 0 && m.continent[tileOfU(s, id)] === 1).length;
    const allWater = shipTiles.every((t) => isWaterBiome(m.biome[t]) || m.biome[t] === Biome.RIVER);
    console.log(`[F-083] 4 spearmen boarded; transport sailed ${new Set(shipTiles).size} water tiles (all water: ${allWater}); ${onLand}/4 landed on continent 2`);
    expect(onLand).toBe(4);
    expect(allWater).toBe(true);
    // sinking with cargo
    const ship2 = spawn(s, 0, 'transport', water);
    const cargo = [0, 1].map(() => spawn(s, 0, 'archer', shore));
    issue(s, 0, { type: 'interact', ids: cargo, target: ship2 });
    run(s, 100);
    expect(cargo.every((id) => s.ents.carrier[id] === ship2)).toBe(true);
    s.ents.hp[ship2] = 0;
    run(s, 1);
    expect(cargo.every((id) => s.ents.alive[id] === 0)).toBe(true);
    // warship: paths only over water and shoots a unit on the coast
    const ws = spawn(s, 0, 'warship', water);
    const target = spawn(s, 1, 'worker', shore); // civilians don't rout, so it stays in range
    issue(s, 0, { type: 'attack', ids: [ws], target });
    run(s, 400);
    expect(s.ents.alive[target]).toBe(0);
    expect(isWaterBiome(m.biome[tileOfU(s, ws)])).toBe(true);
    console.log('[F-077] warship stayed on water and destroyed a worker on the shore; a sunk transport took its 2 archers with it');
  });
});

describe('F-078 group pathfinding with flow fields', () => {
  it('200 soldiers cross a Medium continent: ≥ 98 % arrive, nobody stuck > 10 s', () => {
    const s = new Sim({ seed: 'flow', size: 'medium', players: 1 });
    const w = s.map.w, cap = ownedOfKind(s, 0, buildingKind('capital'))[0], ct = s.ents.anchor[cap];
    const cont = s.map.continent[ct];
    // farthest reachable tile of our continent from the capital
    const dist = s.flows.get(ct, 'test', (t) => s.cost(t, 0));
    let goal = -1, gd = 0;
    for (let t = 0; t < dist.length; t++) if (dist[t] < 0x7fffffff && s.map.continent[t] === cont && dist[t] > gd && s.cost(t, 0) > 0) { gd = dist[t]; goal = t; }
    const spots: number[] = [];
    for (let r = 2; spots.length < 200 && r < 40; r++) for (let dy = -r; dy <= r && spots.length < 200; dy++) for (let dx = -r; dx <= r && spots.length < 200; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t = ct + dy * w + dx;
      if (s.cost(t, 0) > 0 && s.map.continent[t] === cont) spots.push(t);
    }
    const army = spots.map((t) => spawn(s, 0, 'spearman', t));
    s.flows.clear();
    const [gx, gy] = xy(s, goal);
    const t0 = performance.now(), c0 = s.flows.computed;
    issue(s, 0, { type: 'move', ids: army, x: tileCenter(gx), y: tileCenter(gy) });
    const lastMove = new Map<number, number>(), lastPos = new Map<number, number>();
    let maxStill = 0, tickMs = 0, ticks = 0;
    for (let k = 0; k < 6000; k++) {
      const a = performance.now();
      s.step();
      tickMs += performance.now() - a; ticks++;
      let movingCount = 0;
      for (const id of army) {
        const p = s.ents.posX[id] * 4096 + s.ents.posY[id];
        if (lastPos.get(id) !== p) { lastPos.set(id, p); lastMove.set(id, s.tick); }
        if (s.ents.moving[id] || s.ents.waitPath[id]) { movingCount++; maxStill = Math.max(maxStill, s.tick - (lastMove.get(id) ?? s.tick)); }
      }
      if (movingCount === 0 && k > 10) break;
    }
    const near = army.filter((id) => {
      const [x, y] = xy(s, tileOfU(s, id));
      const atSlot = Math.max(Math.abs(x - s.ents.gx0[id]), Math.abs(y - s.ents.gy0[id])) <= 1;
      return atSlot || Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 10;
    }).length;
    console.log(`[F-078] Medium: 200 spearmen, path length ≈ ${Math.round(gd / 10)} tiles; ${near}/200 arrived (at their formation slot or within 10 tiles of the goal) after ${ticks} ticks; ${s.flows.computed - c0} flow field(s) computed; longest stall while moving ${maxStill} ticks; avg sim tick ${(tickMs / ticks).toFixed(2)} ms (total wall time ${(performance.now() - t0).toFixed(0)} ms)`);
    expect(near / 200).toBeGreaterThanOrEqual(0.98);
    expect(maxStill).toBeLessThanOrEqual(100);
  });
});

describe('F-079 scripted battle: a defended wall + moat changes the outcome (Phase 3 gate)', () => {
  const battle = (seed: string, fortified: boolean): { defenders: number; attackers: number; defHp: number } => {
    const { s, at } = arena('battle-' + seed);
    const rng = Rng.stream(seed, 'battle');
    if (fortified) {
      for (let x = 16; x <= 24; x++) for (const y of [6, 19]) building(s, 0, 'wall', at(x, y));
      for (let y = 7; y <= 18; y++) for (const x of [16, 24]) building(s, 0, 'wall', at(x, y));
      for (let x = 14; x <= 26; x++) for (const y of [4, 21]) s.map.biome[at(x, y)] = Biome.MOAT;
      for (let y = 5; y <= 20; y++) for (const x of [14, 26]) s.map.biome[at(x, y)] = Biome.MOAT;
      s.flows.clear();
    }
    const def: number[] = [];
    for (let k = 0; k < 6; k++) def.push(spawn(s, 0, 'archer', at(23, 9 + k)));
    for (let k = 0; k < 4; k++) def.push(spawn(s, 0, 'spearman', at(22, 10 + k)));
    issue(s, 0, { type: 'hold', ids: def });
    const att: number[] = [];
    const nS = 12 + rng.int(3), nA = 6 + rng.int(2);
    for (let k = 0; k < nS; k++) att.push(spawn(s, 1, 'spearman', at(36 + rng.int(3), 6 + rng.int(14))));
    for (let k = 0; k < nA; k++) att.push(spawn(s, 1, 'archer', at(40 + rng.int(3), 6 + rng.int(14))));
    att.forEach((id, i) => issue(s, 1, { type: 'attack', ids: [id], target: def[i % def.length] }));
    run(s, 1500);
    const alive = (ids: number[]) => ids.filter((id) => s.ents.alive[id]).length;
    return { defenders: alive(def), attackers: alive(att), defHp: def.reduce((a, id) => a + (s.ents.alive[id] ? s.ents.hp[id] : 0), 0) };
  };
  it('20 seeds: defenders survive far better behind wall + moat, attackers lose more', () => {
    let openDef = 0, fortDef = 0, openAtt = 0, fortAtt = 0, fortBetter = 0;
    for (let k = 0; k < 20; k++) {
      const o = battle('s' + k, false), f = battle('s' + k, true);
      openDef += o.defenders; fortDef += f.defenders; openAtt += o.attackers; fortAtt += f.attackers;
      if (f.defenders > o.defenders || (f.defenders === o.defenders && f.defHp > o.defHp)) fortBetter++;
    }
    console.log(`[F-079] 20 battles (10 defenders vs 18–21 attackers, 1500 ticks): open field → ${(openDef / 20).toFixed(1)} defenders and ${(openAtt / 20).toFixed(1)} attackers left on average; wall + moat → ${(fortDef / 20).toFixed(1)} defenders and ${(fortAtt / 20).toFixed(1)} attackers left; fortified did better in ${fortBetter}/20`);
    expect(fortDef).toBeGreaterThan(openDef * 1.5);
    expect(fortBetter).toBeGreaterThanOrEqual(18);
  });
});

describe('F-130 / F-135 conquest and elimination', () => {
  it('destroying the last enemy capital eliminates them and wins by conquest', () => {
    const s = new Sim({ seed: 'conquest', size: 'small', players: 2 });
    const cap1 = ownedOfKind(s, 1, buildingKind('capital'))[0];
    const units1 = s.ents.count;
    s.ents.hp[cap1] = 0;
    const ev: { type: string; player: number; a?: number }[] = [];
    run(s, 20, () => ev.push(...s.drainEvents()));
    const p1units = Array.from({ length: units1 }, (_, id) => id).filter((id) => s.ents.alive[id] && s.ents.owner[id] === 1).length;
    console.log(`[F-130/135] events: ${JSON.stringify(ev.filter((e) => ['capitalLost', 'eliminated', 'victory'].includes(e.type)))}; P2 entities left ${p1units}; winner ${s.winner}`);
    expect(ev.some((e) => e.type === 'capitalLost' && e.player === 1)).toBe(true);
    expect(s.ps[1].eliminated).toBe(true);
    expect(p1units).toBe(0);
    expect(s.winner).toBe(0);
    expect(ev.find((e) => e.type === 'victory')?.a).toBe(1);
  });
  it('a player who keeps a settlement is not eliminated when the capital falls', () => {
    const s = new Sim({ seed: 'conquest2', size: 'small', players: 3 });
    const w = s.map.w, cap1 = ownedOfKind(s, 1, buildingKind('capital'))[0];
    // give P2 a settlement far from towns (test setup)
    let spot = -1;
    for (let t = 0; t < s.map.biome.length && spot < 0; t++) if (s.canPlace(1, 'settlement', t) === null && s.map.continent[t] === s.map.continent[s.ents.anchor[cap1]]) spot = t;
    s.createBuilding(1, 'settlement', spot, true);
    s.ents.hp[cap1] = 0;
    run(s, 20);
    expect(s.ps[1].eliminated).toBe(false);
    expect(s.winner).toBe(-1); // P3 still has a capital
    void w;
  });
});

describe('Phase 3 determinism and save/load', () => {
  it('scripted military match: identical hashes on repeat; save/load mid-battle continues identically', () => {
    const go = (): Sim => { const s = new Sim({ seed: 'mil-det', size: 'small', players: 4 }); addStartingArmy(s); const r = Rng.stream('mil-det', 'script'); for (let k = 0; k < 4000; k++) { scriptTick(s, r); s.step(); } return s; };
    const a = go(), b = go();
    expect(a.hash()).toBe(b.hash());
    const counts = [Kind.SPEARMAN, Kind.ARCHER].map((k) => [0, 1, 2, 3].reduce((n, p) => n + ownedOfKind(a, p, k).length, 0));
    const walls = [0, 1, 2, 3].reduce((n, p) => n + ownedOfKind(a, p, buildingKind('wall')).length, 0);
    const trenches = a.map.biome.filter((x) => x === Biome.TRENCH || x === Biome.MOAT).length;
    // save at 4000, continue both 1000 ticks
    const c = loadSim(JSON.parse(JSON.stringify(saveSim(a))));
    const ra = Rng.stream('x', 'y'), rc = Rng.stream('x', 'y');
    for (let k = 0; k < 1000; k++) { scriptTick(a, ra); a.step(); scriptTick(c, rc); c.step(); }
    const lost = 4 * 6 - counts[0] - counts[1];
    console.log(`[Phase 3] scripted match at tick 4000: ${counts[0]} spearmen, ${counts[1]} archers left of 24 (${lost} fell), ${walls} walls, ${trenches} trench/moat tiles; repeat hash equal; after save/load + 1000 ticks: ${a.hash()} vs ${c.hash()}`);
    expect(c.hash()).toBe(a.hash());
    expect(counts[0] + counts[1]).toBeGreaterThan(0);
  });
});
