// Phase 4b acceptance tests (Node): globe world wrap (F-195), Earth-like seas (F-194), game modes
// (F-193), match settings (F-196) and test options (F-197, F-198).
import { describe, expect, it } from 'vitest';
import { Sim, TestOpt } from '../src/sim/sim';
import { FP_ONE, FP_SHIFT } from '../src/sim/core/fixed';
import { TUNING } from '../src/sim/core/tuning';
import { Biome, generateMap } from '../src/sim/world/mapgen';
import { continentGaps } from '../src/sim/world/geo';
import { Kind, Res, buildingKind, unitKind } from '../src/sim/defs';
import { ownedOfKind } from '../src/sim/scripted';
import { loadSim, saveSim } from '../src/sim/serialize';
import { MODES, modeSettings } from '../src/app/modes';

const cmd = (s: Sim, player: number, body: object): void => { s.enqueue({ tick: s.tick, player, seq: s.ps[player].seq++, ...body } as never); };
const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };

describe('F-195 globe world (east–west wrap)', () => {
  const globe = () => new Sim({ seed: 'globe', size: 'small', players: 2, world: { globe: true, sea: 'mixed' } });
  it('the seam lies in open ocean: no land within the seam band', () => {
    for (const size of ['small', 'medium', 'large', 'huge'] as const) {
      const m = generateMap('seam', size, { globe: true, sea: 'mixed' }), B = TUNING.map.globeSeamOcean;
      let land = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if ((x < B || x >= m.w - B) && m.biome[y * m.w + x] !== Biome.OCEAN && m.biome[y * m.w + x] !== Biome.ICE) land++;
      expect(land).toBe(0);
      expect(m.wrap).toBe(true);
    }
  });
  it('a transport sails across the seam by the short way; the far side sees it', () => {
    const s = globe(), w = s.map.w, y = Math.floor(s.map.h / 2);
    const from = y * w + 3, to = y * w + (w - 4); // 7 tiles apart across the seam, w−7 the long way
    const ship = s.spawnUnitAt(0, 'transport', from);
    const spotter = s.spawnUnitAt(1, 'transport', y * w + (w - 2));
    expect(ship).toBeGreaterThanOrEqual(0);
    cmd(s, 0, { type: 'move', ids: [ship], x: ((w - 4) << FP_SHIFT) + 512, y: (y << FP_SHIFT) + 512 });
    let crossedAt = -1, sawIt = false, middle = 0;
    for (let k = 0; k < 400; k++) {
      s.step();
      const x = s.ents.posX[ship] >> FP_SHIFT;
      if (x > 10 && x < w - 10) middle++;
      if (crossedAt < 0 && x >= w - 10) crossedAt = s.tick;
      if (s.visibleTo(ship, 1)) sawIt = true;
      if (s.tileOf(ship) === to && !s.ents.moving[ship]) break;
    }
    console.log(`[F-195] ship ${from % w}→${to % w} on a ${w}-wide globe: crossed the seam at tick ${crossedAt}, arrived at tile x=${s.tileOf(ship) % w}; ticks spent in the middle of the map ${middle}; seen by the other side: ${sawIt}`);
    expect(s.tileOf(ship)).toBe(to);
    expect(crossedAt).toBeGreaterThan(0);
    // short way only: never sailed through the middle of the map
    expect(middle).toBe(0);
    expect(sawIt).toBe(true);
    void spotter;
  });
  it('the water path across the seam is the wrapped length', () => {
    const s = globe(), w = s.map.w, y = Math.floor(s.map.h / 2);
    const path = s.pfWater.find(y * w + 2, { x0: w - 3, y0: y, x1: w - 3, y1: y });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(5);
    const flat = new Sim({ seed: 'globe', size: 'small', players: 2 });
    expect(flat.wrap).toBe(false);
  });
  it('globe matches are deterministic and survive save/load', () => {
    const mk = () => { const s = new Sim({ seed: 'globe-det', size: 'small', players: 3, world: { globe: true, sea: 'close', continents: 3 } }); run(s, 1500); return s; };
    const a = mk(), b = mk();
    expect(a.hash()).toBe(b.hash());
    const c = loadSim(JSON.parse(JSON.stringify(saveSim(a))));
    expect(c.wrap).toBe(true);
    run(a, 500); run(c, 500);
    expect(c.hash()).toBe(a.hash());
  });
});

describe('F-194 Earth-like seas', () => {
  it('mixed seas: most maps have a close pair (≤ 6 tiles in ≥ 8 of 10), every map a far one (≥ 12 Medium, ≥ 25 Large/Huge)', () => {
    const rows: string[] = [], closeBySize: Record<string, number> = {};
    for (const size of ['medium', 'large', 'huge'] as const) for (let k = 0; k < 10; k++) {
      const m = generateMap('seas-' + k, size, { globe: true, sea: 'mixed', continents: size === 'medium' ? 4 : size === 'large' ? 5 : 7 });
      const { k: K, gap } = continentGaps(m);
      const gs: number[] = [];
      for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) if (gap[a * K + b] < 0xffff) gs.push(gap[a * K + b]);
      const lo = Math.min(...gs), hi = Math.max(...gs);
      if (k < 2) rows.push(`${size}#${k}: ${K} continents, closest ${lo}, farthest ${hi}`);
      closeBySize[size] = (closeBySize[size] ?? 0) + (lo <= 6 ? 1 : 0);
      expect(hi).toBeGreaterThanOrEqual(size === 'medium' ? 12 : 25);
    }
    console.log(`[F-194] ${rows.join('; ')}; maps with a close pair (≤ 6) out of 10: ${JSON.stringify(closeBySize)}`);
    // partners sometimes merge into one supercontinent (Medium globes are tight), so: most maps, not all
    for (const n of Object.values(closeBySize)) expect(n).toBeGreaterThanOrEqual(8);
  });
  it('sea width setting: close < far', () => {
    const near = (sea: 'close' | 'far') => {
      let sum = 0;
      for (let k = 0; k < 5; k++) {
        const { k: K, gap } = continentGaps(generateMap('sw-' + k, 'medium', { sea, continents: 4 }));
        for (let a = 0; a < K; a++) sum += Math.min(...Array.from({ length: K }, (_, b) => (b === a ? 1e9 : gap[a * K + b])));
      }
      return sum;
    };
    const c = near('close'), f = near('far');
    console.log(`[F-194] summed nearest-neighbour gaps, 5 Medium maps: close ${c}, far ${f}`);
    expect(c).toBeLessThan(f);
  });
});

describe('F-193 / F-196 modes and match settings', () => {
  it('each mode maps to its sizes, opponent limits and world', () => {
    for (const m of MODES) {
      const st = modeSettings(m.id, { seed: 'mode', bots: 99 });
      expect(m.sizes).toContain(st.size);
      expect(st.players - 1).toBeLessThanOrEqual(m.maxBots);
      const sim = new Sim({ seed: 'mode-' + m.id, size: st.size, players: st.players, world: st.world });
      const T = TUNING.map.sizes[st.size].tiles; // globe maps are 2:1 with about the same area
      expect(Math.abs(sim.map.w * sim.map.h - T * T) / (T * T)).toBeLessThan(0.08);
      if (st.world.globe) expect(sim.map.w).toBe(2 * sim.map.h);
    }
    expect(modeSettings('short', { seed: 'x' }).world.sea).toBe('close');
  });
  it('wildlife, day length and population limit change the match', () => {
    const count = (pct: number) => { const s = new Sim({ seed: 'wild', size: 'small', players: 2, wildlifePct: pct }); return ownedOfKind(s, 254, Kind.ANIMAL).length; };
    const none = count(0), normal = count(100), many = count(200);
    console.log(`[F-196] animals: none ${none}, normal ${normal}, many ${many}`);
    expect(none).toBe(0);
    expect(many).toBeGreaterThan(normal);
    const d = new Sim({ seed: 'day', size: 'small', players: 1, dayLengthTicks: 1200 });
    expect(d.dayLength).toBe(1200);
    const lim = new Sim({ seed: 'pop', size: 'small', players: 1, popLimit: 5, testOptions: [TestOpt.NO_HOUSING | TestOpt.INSTANT_TRAIN] });
    lim.ps[0].stock[Res.FOOD] = 2000;
    const cap = ownedOfKind(lim, 0, buildingKind('capital'))[0];
    for (let k = 0; k < 5; k++) cmd(lim, 0, { type: 'train', building: cap, utype: 1 });
    run(lim, 60);
    expect(lim.ps[0].pop).toBe(5);
  });
});

describe('F-197 / F-198 test options', () => {
  it('each option changes the rules', () => {
    // instant build + instant train + no housing cap
    const s = new Sim({ seed: 'opts', size: 'small', players: 2 });
    const cap = ownedOfKind(s, 0, buildingKind('capital'))[0];
    cmd(s, 0, { type: 'testOption', flag: TestOpt.INSTANT_TRAIN | TestOpt.NO_HOUSING | TestOpt.INSTANT_BUILD, on: true });
    s.step();
    expect(s.modified).toBe(true);
    s.ps[0].stock[Res.FOOD] = 5000;
    for (let k = 0; k < 5; k++) cmd(s, 0, { type: 'train', building: cap, utype: 1 });
    run(s, 12);
    for (let k = 0; k < 5; k++) cmd(s, 0, { type: 'train', building: cap, utype: 1 });
    run(s, 12);
    expect(s.ps[0].pop).toBeGreaterThan(s.ps[0].housing); // trained past the housing cap within 2.4 s
    // invulnerable: hits do no damage
    const t = ownedOfKind(s, 0, unitKind('worker'))[0], hp = s.ents.hp[t];
    cmd(s, 0, { type: 'testOption', flag: TestOpt.INVULNERABLE, on: true });
    s.step();
    const enemy = s.spawnUnitAt(1, 'spearman', s.tileOf(t));
    cmd(s, 1, { type: 'attack', ids: [enemy], target: t });
    run(s, 100);
    expect(s.ents.hp[t]).toBe(hp);
    // switching an option off restores the rule, the run stays modified
    cmd(s, 0, { type: 'testOption', flag: TestOpt.INVULNERABLE, on: false });
    run(s, 100);
    expect(s.ents.hp[t]).toBeLessThan(hp);
    expect(s.modified).toBe(true);
  });
  it('no option ever creates resources: with every option on and nobody working, stock never rises', () => {
    const s = new Sim({ seed: 'audit', size: 'small', players: 2, testOptions: [127, 127] });
    for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.kind[id] === Kind.WORKER) s.ents.kill(id); // nobody gathers
    const before = s.ps.map((p) => p.stock.slice());
    let rose = 0;
    for (let k = 0; k < 3000; k++) {
      const prev = s.ps.map((p) => p.stock.slice());
      s.step();
      s.ps.forEach((p, i) => p.stock.forEach((v, r) => { if (v > prev[i][r]) rose++; }));
    }
    console.log(`[F-197] all 7 options on for 3000 ticks, no workers: stock ${JSON.stringify(before)} → ${JSON.stringify(s.ps.map((p) => p.stock))}; increases ${rose}`);
    expect(rose).toBe(0);
  });
  it('the modified flag survives save/load; an unmodified run stays unmodified', () => {
    const s = new Sim({ seed: 'mod', size: 'small', players: 1 });
    expect(s.modified).toBe(false);
    const h0 = s.hash();
    cmd(s, 0, { type: 'testOption', flag: TestOpt.REVEAL, on: true });
    s.step();
    const c = loadSim(JSON.parse(JSON.stringify(saveSim(s))));
    expect(c.modified).toBe(true);
    expect(c.ps[0].opts & TestOpt.REVEAL).toBeTruthy();
    expect(c.hash()).toBe(s.hash());
    void h0; void FP_ONE;
  });
});
