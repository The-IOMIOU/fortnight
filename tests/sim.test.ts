import { describe, expect, it } from 'vitest';
import { Sim, packVisibleEntities, ENTITY_STRIDE } from '../src/sim/sim';
import { TickScheduler } from '../src/sim/core/scheduler';
import { FP_ONE, isqrt, tileCenter } from '../src/sim/core/fixed';
import { Entities } from '../src/sim/entities/entities';
import { Kind } from '../src/sim/defs';
import { FOG_UNEXPLORED, FOG_VISIBLE } from '../src/sim/world/fog';
import { TUNING } from '../src/sim/core/tuning';
import { scriptedRun, ownedOfKind } from '../src/sim/scripted';

describe('fixed-point helpers', () => {
  it('isqrt is exact floor(sqrt) on edge cases and pseudo-random values', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 2 ** 31, 2 ** 40 + 7, 2 ** 52 - 1]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    let x = 12345;
    for (let k = 0; k < 2000; k++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const n = x * 4099, r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
  });
});

describe('F-010 deterministic sim (Node)', () => {
  it('same seed + command log → identical hashes at ticks 100 / 1000 / 10000, twice', () => {
    const a = scriptedRun('det-seed', 'small', 4, [100, 1000, 10000]);
    const b = scriptedRun('det-seed', 'small', 4, [100, 1000, 10000]);
    console.log('[F-010 node hashes]', JSON.stringify(a));
    expect(a).toEqual(b);
    const c = scriptedRun('det-seed-2', 'small', 4, [100, 1000]);
    expect(c[100]).not.toBe(a[100]);
  });
});

describe('F-026 fog of war', () => {
  it('starts mostly unexplored; moving scout reveals tiles only within some own vision radius', () => {
    const sim = new Sim({ seed: 'fog-test', size: 'small', players: 2 });
    const f = sim.fog[0].data, w = sim.map.w;
    const scout = ownedOfKind(sim, 0, Kind.SCOUT)[0];
    const visibleAtStart = f.filter((v) => v === FOG_VISIBLE).length;
    expect(f.filter((v) => v === FOG_UNEXPLORED).length).toBeGreaterThan(f.length * 0.85);
    const s = sim.map.starts[0];
    const tx = Math.floor(w / 2), ty = Math.floor(w / 2);
    sim.enqueue({ type: 'move', tick: sim.tick, player: 0, seq: 0, ids: [scout], x: tileCenter(tx), y: tileCenter(ty) });
    for (let k = 0; k < 60; k++) sim.step();
    const explored = f.filter((v) => v !== FOG_UNEXPLORED).length;
    console.log(`[F-026] visible at start=${visibleAtStart}, explored after 60 ticks=${explored}`);
    expect(explored).toBeGreaterThan(visibleAtStart);
    expect(f[s]).not.toBe(FOG_UNEXPLORED);
    // every visible tile is own territory or inside the vision circle of some own entity
    const e = sim.ents;
    const own: [number, number, number][] = [];
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === 0) own.push([e.posX[id] >> 10, e.posY[id] >> 10, e.vision[id]]);
    for (let i = 0; i < f.length; i++) if (f[i] === FOG_VISIBLE && sim.tileOwner[i] !== 0) {
      const x = i % w, y = (i - x) / w;
      expect(own.some(([ex, ey, r]) => (x - ex) * (x - ex) + (y - ey) * (y - ey) <= r * r + r)).toBe(true);
    }
  });

  it('enemy units on non-visible tiles are absent from the viewer snapshot', () => {
    const sim = new Sim({ seed: 'fog-test', size: 'small', players: 4 });
    sim.step();
    const units = (snap: Int32Array, owner: number): number => { let n = 0; for (let k = 0; k < snap.length; k += ENTITY_STRIDE) if (snap[k + 2] === owner && snap[k + 1] < 64) n++; return n; };
    const snap = packVisibleEntities(sim, 0);
    for (const p of [1, 2, 3]) expect(units(snap, p)).toBe(0);
    expect(units(packVisibleEntities(sim, -1), 1)).toBeGreaterThan(0);
    // Put an enemy scout two tiles from our scout by direct state edit (test only) → now visible.
    const e = sim.ents, mine = ownedOfKind(sim, 0, Kind.SCOUT)[0], theirs = ownedOfKind(sim, 1, Kind.SCOUT)[0];
    e.posX[theirs] = e.posX[mine] + 2 * FP_ONE; e.posY[theirs] = e.posY[mine];
    expect(units(packVisibleEntities(sim, 0), 1)).toBe(1);
  });
});

describe('F-014 orders while paused (sim semantics)', () => {
  it('a queued order does not change positions until ticks are stepped', () => {
    const sim = new Sim({ seed: 'pause', size: 'small', players: 1 });
    const scout = ownedOfKind(sim, 0, Kind.SCOUT)[0];
    const t = sim.tick, x0 = sim.ents.posX[scout];
    sim.enqueue({ type: 'move', tick: sim.tick, player: 0, seq: 0, ids: [scout], x: x0 + 5 * FP_ONE, y: sim.ents.posY[scout] });
    expect(sim.tick).toBe(t);
    expect(sim.pendingCommands.length).toBe(1);
    expect(sim.ents.posX[scout]).toBe(x0);
    for (let k = 0; k < 5; k++) sim.step();
    expect(sim.pendingCommands.length).toBe(0);
    expect(sim.ents.posX[scout]).not.toBe(x0);
  });
  it('rejects past-tick commands and orders for units the player does not own', () => {
    const sim = new Sim({ seed: 'pause', size: 'small', players: 2 });
    sim.step();
    expect(sim.enqueue({ type: 'move', tick: 0, player: 0, seq: 0, ids: [0], x: 0, y: 0 })).toBe(false);
    const theirs = ownedOfKind(sim, 1, Kind.SCOUT)[0];
    sim.enqueue({ type: 'move', tick: sim.tick, player: 0, seq: 1, ids: [theirs], x: 5000, y: 5000 });
    sim.step();
    expect(sim.ents.task[theirs]).toBe(0);
    expect(sim.ents.waitPath[theirs]).toBe(0);
  });
});

describe('F-029 day/night cycle', () => {
  it('isNight toggles at the configured tick boundaries', () => {
    const sim = new Sim({ seed: 'day', size: 'small', players: 1 });
    const { dayLengthTicks, nightTicks } = TUNING.dayNight;
    const flips: number[] = [];
    let prev = sim.isNight;
    for (let k = 0; k < dayLengthTicks * 2; k++) { sim.step(); if (sim.isNight !== prev) { flips.push(sim.tick); prev = sim.isNight; } }
    expect(flips).toEqual([dayLengthTicks - nightTicks, dayLengthTicks, 2 * dayLengthTicks - nightTicks, 2 * dayLengthTicks]);
  });
});

describe('F-013 speed scheduler (fake clock)', () => {
  it('ticks per second match each speed within 5 %; paused yields 0', () => {
    for (const mult of Object.values(TUNING.sim.speeds)) {
      const s = new TickScheduler(TUNING.sim.tickHz, TUNING.sim.maxCatchUpTicks);
      s.speed = mult;
      let ticks = 0;
      for (let t = 0; t < 20000; t += 4) ticks += s.advance(4);
      expect(Math.abs(ticks / 20 - TUNING.sim.tickHz * mult)).toBeLessThan(0.05 * TUNING.sim.tickHz * mult);
    }
    const p = new TickScheduler(10, 8);
    p.paused = true;
    expect(p.advance(10000)).toBe(0);
  });
});

describe('F-012 SoA entity storage benchmark', () => {
  it('10 000 moving entities: movement loop ≤ 2 ms/tick (Node, dev machine)', () => {
    const e = new Entities(16);
    for (let k = 0; k < 10000; k++) {
      const id = e.spawn(Kind.SCOUT, k & 7, (k % 100) * FP_ONE, Math.floor(k / 100) * FP_ONE, 300, 5);
      e.tgtX[id] = 100 * FP_ONE - e.posX[id]; e.tgtY[id] = 100 * FP_ONE - e.posY[id]; e.moving[id] = 1;
    }
    const step = (): void => {
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || !e.moving[id]) continue;
        const dx = e.tgtX[id] - e.posX[id], dy = e.tgtY[id] - e.posY[id];
        const dist = isqrt(dx * dx + dy * dy), sp = e.speed[id];
        if (dist <= sp) { e.posX[id] = e.tgtX[id]; e.posY[id] = e.tgtY[id]; e.moving[id] = 0; continue; }
        e.posX[id] += Math.trunc((dx * sp) / dist); e.posY[id] += Math.trunc((dy * sp) / dist);
      }
    };
    for (let k = 0; k < 20; k++) step();
    const t0 = performance.now();
    for (let k = 0; k < 100; k++) step();
    const ms = (performance.now() - t0) / 100;
    console.log(`[F-012] 10k entities movement: ${ms.toFixed(3)} ms/tick`);
    expect(ms).toBeLessThan(2);
  });
});
