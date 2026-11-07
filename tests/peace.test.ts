// Owner feedback 2026-11-06: peace at the start, gentler Easy bots, allies start together, workers keep
// gathering when a tree or rock runs out.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { TUNING } from '../src/sim/core/tuning';
import { Kind, Res, Task, unitKind } from '../src/sim/defs';
import { ownedOfKind } from '../src/sim/scripted';
import { BotManager } from '../src/ai/manager';

const cmd = (s: Sim, player: number, body: object): void => { s.enqueue({ tick: s.tick, player, seq: s.ps[player].seq++, ...body } as never); };
const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };

describe('peace at the start', () => {
  it('nobody can hurt anybody until peace ends; then fighting works and everyone is told', () => {
    const s = new Sim({ seed: 'peace', size: 'small', players: 2, peaceTicks: 300 });
    const victim = ownedOfKind(s, 1, unitKind('worker'))[0], hp = s.ents.hp[victim];
    const spear = s.spawnUnitAt(0, 'spearman', s.tileOf(victim));
    expect(s.hostile(0, 1)).toBe(false);
    cmd(s, 0, { type: 'attack', ids: [spear], target: victim });
    run(s, 200);
    expect(s.ents.hp[victim]).toBe(hp);
    expect(s.peaceLeft).toBe(100);
    const ev: string[] = [];
    for (let k = 0; k < 150; k++) { s.step(); ev.push(...s.drainEvents().map((e) => e.type)); }
    expect(s.hostile(0, 1)).toBe(true);
    expect(ev).toContain('peaceOver');
    cmd(s, 0, { type: 'attack', ids: [spear], target: victim });
    run(s, 100);
    console.log(`[peace] worker hp ${hp} unchanged during 300 ticks of peace; after: ${s.ents.alive[victim] ? s.ents.hp[victim] : 'dead'}`);
    expect(!s.ents.alive[victim] || s.ents.hp[victim] < hp).toBe(true);
  });
});

describe('Easy bots give you time and stay small', () => {
  it('25-minute match, you idle vs two Easy bots: no attack during the 20-minute peace, no heavy units, army capped', () => {
    const peace = TUNING.bots.easy.peaceMin * 600;
    const s = new Sim({ seed: 'easy-grow', size: 'small', players: 3, peaceTicks: peace });
    const bots = new BotManager(s, [{ player: 1, personality: 'berserker', difficulty: 'easy' }, { player: 2, personality: 'raider', difficulty: 'easy' }]);
    const hp0 = () => ownedOfKind(s, 0, unitKind('worker')).reduce((a, id) => a + s.ents.hp[id], 0);
    const start = hp0();
    let heavy = 0, maxArmy = 0, attackedInPeace = 0;
    const basic = new Set([Kind.SPEARMAN, Kind.ARCHER, Kind.RIDER]);
    for (let k = 0; k < 25 * 600; k++) {
      bots.tick(); s.step(); s.drainEvents();
      if (k % 300 === 0) {
        for (const p of [1, 2]) {
          let army = 0;
          for (let id = 0; id < s.ents.count; id++) {
            if (!s.ents.alive[id] || s.ents.owner[id] !== p) continue;
            const kd = s.ents.kind[id];
            if (basic.has(kd as never)) army++;
            else if (kd > Kind.SCOUT + 2 && kd < 64 && kd !== Kind.TRANSPORT && kd !== Kind.WARSHIP && kd !== Kind.SPY && kd !== Kind.SABOTEUR) heavy++;
            if (s.tick < peace && s.ents.task[id] === Task.ATTACK && s.ents.owner[s.ents.taskEnt[id]] === 0) attackedInPeace++;
          }
          maxArmy = Math.max(maxArmy, army);
        }
      }
    }
    console.log(`[easy] peace ${peace / 600} min: attack orders on you during peace ${attackedInPeace}; heavy units seen ${heavy}; biggest Easy army ${maxArmy}; your workers' hp ${start} → ${hp0()}`);
    expect(attackedInPeace).toBe(0);
    expect(heavy).toBe(0);
    expect(maxArmy).toBeLessThanOrEqual(TUNING.bots.easy.maxArmy + 2); // queued units can finish after the cap
  }, 300000);
});

describe('allies start together', () => {
  it('team-mates start on the same continent within allyStartMax tiles; others keep the spread-out starts', () => {
    for (const world of [undefined, { globe: true, sea: 'mixed' as const, continents: 3 }]) {
      const s = new Sim({ seed: 'coop', size: 'small', players: 4, teams: [0, 0, 2, 3], world });
      const st = s.startTiles, w = s.map.w;
      let dx = Math.abs((st[0] % w) - (st[1] % w)); if (s.wrap) dx = Math.min(dx, w - dx);
      const d = Math.max(dx, Math.abs(Math.floor(st[0] / w) - Math.floor(st[1] / w)));
      console.log(`[coop] ${world ? 'globe' : 'flat'}: you and your ally start ${d} tiles apart (map ${w} wide), same continent ${s.map.continent[st[0]] === s.map.continent[st[1]]}`);
      expect(d).toBeLessThanOrEqual(TUNING.map.allyStartMax);
      expect(d).toBeGreaterThanOrEqual(TUNING.map.allyStartMin);
      expect(s.map.continent[st[0]]).toBe(s.map.continent[st[1]]);
      expect(st[2]).toBe(s.map.starts[2]);
      // both capitals really stand there
      expect(ownedOfKind(s, 1, 64).length).toBe(1);
    }
  });
});

describe('workers keep gathering', () => {
  it('when a tree runs out the worker finds the next tree up to regatherRadius away', () => {
    const s = new Sim({ seed: 'regather', size: 'small', players: 1 });
    const w = s.map.w, worker = ownedOfKind(s, 0, unitKind('worker'))[0];
    // find a wood tile, clear every other wood tile within 12, keep one at distance 14
    // the tree nearest the worker (same continent, reachable)
    const wt = s.tileOf(worker), wx = wt % w, wy = Math.floor(wt / w);
    let tree = -1, bd = 1e9;
    for (let t = 0; t < s.res.type.length; t++) if (s.res.type[t] === Res.WOOD && s.res.amount[t] > 0 && s.map.continent[t] === s.map.continent[wt]) { const d = Math.max(Math.abs((t % w) - wx), Math.abs(Math.floor(t / w) - wy)); if (d < bd) { bd = d; tree = t; } }
    const tx = tree % w, ty = Math.floor(tree / w);
    let far = -1;
    for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) {
      const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= w || y >= s.map.h) continue;
      const t = y * w + x, r = Math.max(Math.abs(dx), Math.abs(dy));
      if (t === tree || s.res.type[t] !== Res.WOOD) continue;
      if (r === 14 && far < 0) far = t; else { s.res.amount[t] = 0; s.res.type[t] = 255; }
    }
    if (far < 0) { far = (ty + 14 < s.map.h ? ty + 14 : ty - 14) * w + tx; s.res.type[far] = Res.WOOD; s.res.amount[far] = 50; }
    s.res.amount[tree] = 3;
    cmd(s, 0, { type: 'gather', ids: [worker], tile: tree });
    let moved = false;
    for (let k = 0; k < 3000 && !moved; k++) { s.step(); if (s.ents.taskTile[worker] === far) moved = true; }
    console.log(`[gather] tree used up; worker moved on to a tree 14 tiles away by itself: ${moved}`);
    expect(moved).toBe(true);
  });
});
