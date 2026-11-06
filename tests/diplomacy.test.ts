// Phase 6 acceptance tests: diplomatic states (F-152), trade offers (F-151), chat with bot replies (F-150),
// bot negotiation behaviours (F-153), steal / spy / sabotage / poison (F-140–F-142), economic victory (F-134).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { TUNING } from '../src/sim/core/tuning';
import { Biome } from '../src/sim/world/mapgen';
import { Kind, RES_NONE, Res } from '../src/sim/defs';
import { issue } from '../src/sim/scripted';
import { loadSim, saveSim } from '../src/sim/serialize';
import { Rel } from '../src/sim/diplomacy';
import { GEAR_IDS } from '../src/sim/abilities';
import { BotManager } from '../src/ai/manager';
import { BotView, newMapMemory } from '../src/ai/view';
import { diplomacyPlan, judge, newDiploMemory, say } from '../src/ai/diplomacy';
import { PERSONALITIES } from '../src/ai/utility';
import type { CommandBody } from '../src/sim/commands';

const D = TUNING.diplomacy, CV = TUNING.covert;
const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };
const step = (s: Sim): void => s.step();
const res = (r: Partial<Record<number, number>>): number[] => Array.from({ length: 6 }, (_, i) => r[i] ?? 0);

/** Flat empty arena on a Small map (no owner, no wildlife). */
function arena(players = 3, seed = 'dip'): { s: Sim; at: (x: number, y: number) => number } {
  for (let k = 0; k < 50; k++) {
    const s = new Sim({ seed: `${seed}-${k}`, size: 'small', players });
    const w = s.map.w;
    for (let oy = 8; oy + 30 < s.map.h - 8; oy += 4) for (let ox = 8; ox + 50 < w - 8; ox += 4) {
      let ok = true;
      for (let y = oy - 2; y < oy + 32 && ok; y++) for (let x = ox - 2; x < ox + 52; x++) if (s.occ[y * w + x] || s.tileOwner[y * w + x] !== 255) { ok = false; break; }
      if (!ok) continue;
      for (let y = oy; y < oy + 30; y++) for (let x = ox; x < ox + 50; x++) { const t = y * w + x; s.map.biome[t] = Biome.PLAINS; s.map.height[t] = 2; s.res.type[t] = RES_NONE; s.res.amount[t] = 0; }
      for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.owner[id] === 254) { const t = s.tileOf(id), x = t % w, y = Math.floor(t / w); if (x >= ox - 2 && x < ox + 52 && y >= oy - 2 && y < oy + 32) s.ents.kill(id); }
      s.flows.clear();
      for (const ps of s.ps) ps.stock = [5000, 5000, 5000, 5000, 5000, 5000];
      return { s, at: (x: number, y: number) => (oy + y) * w + ox + x };
    }
  }
  throw new Error('no arena');
}
const offerNow = (s: Sim, from: number, to: number, body: Omit<Extract<CommandBody, { type: 'offer' }>, 'type' | 'to'>): number => {
  issue(s, from, { type: 'offer', to, ...body }); step(s);
  return s.dip.st.offers.find((o) => o.from === from && o.to === to)!.id;
};
const accept = (s: Sim, p: number, id: number, yes = true): void => { issue(s, p, { type: 'respond', offer: id, accept: yes }); step(s); };

describe('F-152 diplomatic states', () => {
  it('war by default; peace stops fighting; ceasefire runs out; alliance shares vision; breaking a treaty costs reputation', () => {
    const { s, at } = arena();
    expect(s.dip.rel(0, 1)).toBe(Rel.WAR);
    const a = s.spawnUnitAt(0, 'spearman', at(10, 10)), b = s.spawnUnitAt(1, 'spearman', at(11, 10));
    accept(s, 1, offerNow(s, 0, 1, { give: {}, get: {}, treaty: 'peace' }));
    expect(s.dip.rel(0, 1)).toBe(Rel.PEACE);
    const hpA = s.ents.hp[a], hpB = s.ents.hp[b];
    run(s, 100);
    expect([s.ents.hp[a], s.ents.hp[b]]).toEqual([hpA, hpB]); // side by side, nobody fights
    // ceasefire with player 2 runs out after ceasefireTicks
    accept(s, 2, offerNow(s, 0, 2, { give: {}, get: {}, treaty: 'ceasefire' }));
    expect(s.dip.rel(0, 2)).toBe(Rel.CEASEFIRE);
    run(s, D.ceasefireTicks + 1);
    expect(s.dip.rel(0, 2)).toBe(Rel.WAR);
    // alliance: shared vision
    const far = s.spawnUnitAt(1, 'scout', at(45, 25));
    expect(s.visibleTo(far, 0)).toBe(false);
    accept(s, 1, offerNow(s, 0, 1, { give: {}, get: {}, treaty: 'alliance' }));
    expect(s.dip.rel(0, 1)).toBe(Rel.ALLIANCE);
    expect(s.visibleTo(far, 0)).toBe(true);
    // betrayal
    const rep0 = s.dip.st.reputation[0], f10 = s.dip.feel(1, 0), f20 = s.dip.feel(2, 0);
    issue(s, 0, { type: 'declareWar', to: 1 }); step(s);
    expect(s.dip.rel(0, 1)).toBe(Rel.WAR);
    expect(s.dip.st.reputation[0]).toBe(rep0 - D.betrayAlliancePenalty);
    expect(s.dip.feel(1, 0)).toBe(f10 - D.victimFeelPenalty);
    expect(s.dip.feel(2, 0)).toBe(f20 - D.othersFeelPenalty);
    // declaring war while already at war costs nothing
    issue(s, 0, { type: 'declareWar', to: 2 }); step(s);
    expect(s.dip.st.reputation[0]).toBe(rep0 - D.betrayAlliancePenalty);
    console.log(`[F-152] peace: no fighting for 10 s side by side; ceasefire ended after ${D.ceasefireTicks} ticks; alliance shared vision; betrayal: reputation ${rep0} → ${s.dip.st.reputation[0]}, victim feeling ${f10} → ${s.dip.feel(1, 0)}`);
  });

  it('trade pact: both partners gather extra gold', () => {
    const { s } = arena(2);
    expect(s.dip.tradeBonusPct(0)).toBe(0);
    accept(s, 1, offerNow(s, 0, 1, { give: {}, get: {}, treaty: 'tradePact' }));
    expect(s.dip.tradeBonusPct(0)).toBe(D.tradePactGoldPct);
    expect(s.dip.tradeBonusPct(1)).toBe(D.tradePactGoldPct);
  });
});

describe('F-151 trade offers', () => {
  it('resources, gear, tech and a town change hands exactly; decline and counter work; unpaid offers fail', () => {
    const { s, at } = arena(2);
    s.ps[0].gear[0] = 3; s.ps[0].researched.push('smithing'); s.rules.refresh(0);
    s.tileOwner.fill(255, 0, 0);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { s.tileOwner[at(x, y)] = 0; s.ownedList[0].push(at(x, y)); }
    const outpost = s.createBuilding(0, 'outpost', at(5, 5), true);
    const before = [s.ps[0].stock.slice(), s.ps[1].stock.slice()];
    const id = offerNow(s, 0, 1, { give: { res: res({ [Res.GOLD]: 100 }), gear: [2], tech: ['smithing'], towns: [outpost] }, get: { res: res({ [Res.FOOD]: 300 }) }, treaty: null });
    accept(s, 1, id);
    expect(s.ps[0].stock[Res.GOLD]).toBe(before[0][Res.GOLD] - 100);
    expect(s.ps[1].stock[Res.GOLD]).toBe(before[1][Res.GOLD] + 100);
    expect(s.ps[0].stock[Res.FOOD]).toBe(before[0][Res.FOOD] + 300);
    expect(s.ps[1].stock[Res.FOOD]).toBe(before[1][Res.FOOD] - 300);
    expect([s.ps[0].gear[0], s.ps[1].gear[0]]).toEqual([1, 2]);
    expect(s.ps[1].researched).toContain('smithing');
    expect(s.ents.owner[outpost]).toBe(1);
    expect(s.tileOwner[at(5, 5)]).toBe(1);
    // decline
    const d = offerNow(s, 0, 1, { give: {}, get: { res: res({ [Res.GOLD]: 10 }) }, treaty: null });
    accept(s, 1, d, false);
    expect(s.dip.st.offers.length).toBe(0);
    // counter: replaces the original
    const o = offerNow(s, 0, 1, { give: { res: res({ [Res.WOOD]: 50 }) }, get: { res: res({ [Res.STONE]: 200 }) }, treaty: null });
    issue(s, 1, { type: 'offer', to: 0, give: { res: res({ [Res.STONE]: 100 }) }, get: { res: res({ [Res.WOOD]: 50 }) }, treaty: null, counterOf: o }); step(s);
    expect(s.dip.st.offers.map((x) => x.from)).toEqual([1]);
    // an offer the sender can no longer pay fails on accept and changes nothing
    s.ps[1].stock[Res.STONE] = 0;
    const st0 = s.ps[0].stock.slice();
    accept(s, 0, s.dip.st.offers[0].id);
    expect(s.ps[0].stock).toEqual(st0);
    void GEAR_IDS; void Kind;
  });
});

describe('F-150 chat and F-153 bot negotiation', () => {
  it('a message to a bot gets a reply from the bot', () => {
    const s = new Sim({ seed: 'chat', size: 'small', players: 2 });
    const bots = new BotManager(s, [{ player: 1, personality: 'merchant', difficulty: 'hard' }]);
    issue(s, 0, { type: 'chat', to: 1, text: 'Hello there!' });
    for (let k = 0; k < 60; k++) { bots.tick(); s.step(); }
    const replies = s.dip.st.chat.filter((m) => m.from === 1 && m.to === 0);
    expect(s.dip.st.chat[0]).toMatchObject({ from: 0, to: 1, text: 'Hello there!' });
    expect(replies.length).toBeGreaterThan(0);
    console.log(`[F-150] P1 → bot: "Hello there!" · bot: "${replies[0].text}"`);
  });

  /** Run the bot's diplomacy once on a prepared state, return its commands. */
  function decide(s: Sim, pers: string, myArmy: number, intruders = 0, mem = newDiploMemory()): CommandBody[] {
    const out: CommandBody[] = [];
    let r = 0;
    diplomacyPlan({ v: new BotView(s, 1, newMapMemory(s.map.w * s.map.h)), pers, minutes: 10, myArmy, intruders, roll: (n) => (r++ % n), cmd: (c) => out.push(c) }, mem);
    return out;
  }

  it('demands tribute (and threatens) when much stronger; proposes alliances to friends; asks allies for help; lies and betrays', () => {
    const { s } = arena(3, 'neg');
    s.tick = 6000;
    // berserker, much stronger than everyone → tribute demand with a threat
    const t = decide(s, 'berserker', 500);
    expect(t.some((c) => c.type === 'offer' && (c.get.res?.[Res.GOLD] ?? 0) > 0)).toBe(true);
    expect(t.some((c) => c.type === 'chat' && /\d+ (gold|food)/.test(c.text))).toBe(true);
    // the demand is refused → war is declared (the threat is kept)
    const s2 = arena(3, 'neg2').s; s2.tick = 6000;
    s2.dip.st.rel[1 * 3 + 0] = s2.dip.st.rel[0 * 3 + 1] = Rel.PEACE;
    const mem = newDiploMemory();
    const first = decide(s2, 'raider', 500, 0, mem);
    const dem = first.find((c) => c.type === 'offer')!;
    issue(s2, 1, dem); step(s2);
    const oid = s2.dip.st.offers.find((o) => o.from === 1)!.id;
    issue(s2, 0, { type: 'respond', offer: oid, accept: false }); step(s2); step(s2); step(s2);
    const after = decide(s2, 'raider', 500, 0, mem);
    expect(after.some((c) => c.type === 'declareWar')).toBe(true);
    // pacifist with a good relationship proposes an alliance
    const s3 = arena(3, 'neg3').s; s3.tick = 6000;
    s3.dip.st.feel[1 * 3 + 0] = 40;
    expect(decide(s3, 'pacifist', 50).some((c) => c.type === 'offer' && c.treaty === 'alliance')).toBe(true);
    // under attack with an ally → asks for help
    const s4 = arena(3, 'neg4').s; s4.tick = 6000;
    s4.dip.st.rel[1 * 3 + 2] = s4.dip.st.rel[2 * 3 + 1] = Rel.ALLIANCE;
    const help = decide(s4, 'defender', 50, 3);
    expect(help.some((c) => c.type === 'chat' && c.to === 2)).toBe(true);
    // schemer facing a stronger enemy: offers peace (a lie) and declares war when the time comes
    const a5 = arena(3, 'neg5'), s5 = a5.s; s5.tick = 6000;
    for (let k = 0; k < 8; k++) s5.spawnUnitAt(0, 'spearman', a5.at(5 + k, 5)); // a stronger enemy
    const m5 = newDiploMemory();
    const lie = decide(s5, 'schemer', 0, 0, m5);
    expect(lie.some((c) => c.type === 'offer' && c.treaty === 'peace')).toBe(true);
    expect(m5.lies.length).toBe(1);
    s5.dip.st.rel[1 * 3 + m5.lies[0][0]] = s5.dip.st.rel[m5.lies[0][0] * 3 + 1] = Rel.PEACE;
    s5.tick = m5.lies[0][1] + 1; m5.lastProposal = 0;
    expect(decide(s5, 'schemer', 0, 0, m5).some((c) => c.type === 'declareWar')).toBe(true);
    // betrayal of a weak ally by a warlike bot (late game)
    const s6 = arena(3, 'neg6').s; s6.tick = 30000;
    s6.dip.st.rel[1 * 3 + 0] = s6.dip.st.rel[0 * 3 + 1] = Rel.ALLIANCE;
    let betrayed = false;
    for (let k = 0; k < 8 && !betrayed; k++) { const m = newDiploMemory(); const cs: CommandBody[] = []; let r = k; diplomacyPlan({ v: new BotView(s6, 1, newMapMemory(s6.map.w * s6.map.h)), pers: 'berserker', minutes: 50, myArmy: 1000, intruders: 0, roll: (n) => (r++ % n), cmd: (c) => cs.push(c) }, m); betrayed = cs.some((c) => c.type === 'declareWar' && c.to === 0); }
    expect(betrayed).toBe(true);
    console.log('[F-153] tribute demand + threat, threat kept after refusal, alliance offer from a fond pacifist, help request to an ally, schemer peace lie then war, berserker betrays a weak ally');
  });

  it('offers are judged by value, relationship and personality; tone differs per personality', () => {
    const { s } = arena(2, 'judge');
    const v = new BotView(s, 1, newMapMemory(s.map.w * s.map.h));
    const gift = { id: 1, from: 0, to: 1, give: { res: res({ [Res.GOLD]: 200 }) }, get: {}, treaty: null, tick: 0, expires: 9999, counterOf: 0 };
    const robbery = { ...gift, give: {}, get: { res: res({ [Res.GOLD]: 500 }) } };
    expect(judge({ v, pers: 'merchant', myArmy: 10 }, gift)).toBe('accept');
    expect(judge({ v, pers: 'merchant', myArmy: 10 }, robbery)).toBe('decline');
    const peace = { ...gift, give: {}, get: {}, treaty: 'peace' as const };
    expect(judge({ v, pers: 'pacifist', myArmy: 10 }, peace)).toBe('accept');
    expect(judge({ v, pers: 'berserker', myArmy: 10 }, peace)).not.toBe('accept');
    const lines = PERSONALITIES.map((p) => say(p.id, 'decline', () => 0));
    expect(new Set(lines).size).toBe(PERSONALITIES.length);
    console.log('[F-153] "decline" per personality: ' + lines.map((l, i) => `${PERSONALITIES[i].id}: "${l}"`).join(' | '));
  });
});

describe('F-140 – F-142 covert actions', () => {
  /** Run a covert act with seeds until one succeeds and one is caught (both outcomes are checked). */
  function covert(act: 'steal' | 'reveal' | 'sabotage' | 'poison', targetKind: 'farm' | 'capital' | 'unit' | 'barracks', research = true) {
    const { s, at } = arena(2, 'cov-' + act + targetKind);
    for (let y = 0; y < 12; y++) for (let x = 30; x < 42; x++) { s.tileOwner[at(x, y)] = 1; s.ownedList[1].push(at(x, y)); }
    const target = targetKind === 'unit' ? s.spawnUnitAt(1, 'spearman', at(36, 20)) : s.createBuilding(1, targetKind === 'capital' ? 'settlement' : targetKind, at(35, 5), true);
    if (research) { s.ps[0].researched.push('toxins'); s.rules.refresh(0); }
    const agent = s.spawnUnitAt(0, act === 'sabotage' ? 'saboteur' : 'spy', at(30, targetKind === 'unit' ? 20 : 5));
    issue(s, 1, { type: 'hold', ids: [target] });
    return { s, at, agent, target };
  }

  it('steal moves stealAmount of the richest resource; caught agents die and the victim is told', () => {
    let ok = 0, caught = 0;
    for (let k = 0; k < 12 && (!ok || !caught); k++) {
      const { s, agent, target } = covert('steal', 'capital');
      for (let j = 0; j < k; j++) s.rngCovert.int(100);
      s.ps[1].stock = [100, 100, 100, 900, 0, 0]; const g0 = s.ps[0].stock[Res.GOLD];
      issue(s, 0, { type: 'covert', ids: [agent], act: 'steal', target });
      let done = false;
      for (let t = 0; t < 400 && !done; t++) { s.step(); for (const ev of s.drainEvents()) { if (ev.type === 'stole') { ok++; done = true; expect(s.ps[0].stock[Res.GOLD] - g0).toBe(CV.stealAmount); } if (ev.type === 'spyCaught') { caught++; done = true; } } }
      expect(done).toBe(true);
    }
    expect(ok).toBeGreaterThan(0); expect(caught).toBeGreaterThan(0);
    console.log(`[F-140] steal: ${ok} successes (exactly ${CV.stealAmount} gold each) and ${caught} caught agents across seeds`);
  });

  it('spy reveals an area; saboteur disables a building; poison hits units, crops and wells, and needs Toxins', () => {
    const find = (fn: (s: Sim) => boolean, mk: () => ReturnType<typeof covert>, act: 'reveal' | 'sabotage' | 'poison') => {
      for (let k = 0; k < 12; k++) {
        const c = mk();
        for (let j = 0; j < k; j++) c.s.rngCovert.int(100);
        issue(c.s, 0, { type: 'covert', ids: [c.agent], act, target: c.target });
        for (let t = 0; t < 400; t++) { c.s.step(); if (fn(c.s)) return c; }
      }
      throw new Error('never succeeded');
    };
    const r = find((s) => s.dip.st.reveals.length > 0, () => covert('reveal', 'capital'), 'reveal');
    expect(r.s.fog[0].data[r.at(41, 11)]).toBe(255); // far corner of the target area is visible
    const sb = find((s) => s.ents.disabledUntil.some((v) => v > s.tick), () => covert('sabotage', 'barracks'), 'sabotage');
    issue(sb.s, 1, { type: 'train', building: sb.target, utype: 3 });
    run(sb.s, 200);
    expect(sb.s.ents.trainProgress[sb.target]).toBe(0); // no training while sabotaged
    const pu = find((s) => s.ents.poisonUntil.some((v) => v > s.tick), () => covert('poison', 'unit'), 'poison');
    const hp = pu.s.ents.hp[pu.target]; run(pu.s, 61);
    expect(pu.s.ents.hp[pu.target]).toBeLessThan(hp);
    const pw = find((s) => s.dip.st.wellPoisonUntil[1] > s.tick, () => covert('poison', 'capital'), 'poison');
    expect(pw.s.dip.st.wellPoisonUntil[1]).toBeGreaterThan(pw.s.tick);
    const pf = find((s) => s.ents.poisonUntil.some((v) => v > s.tick), () => covert('poison', 'farm'), 'poison');
    expect(pf.s.ents.poisonUntil[pf.target]).toBeGreaterThan(pf.s.tick);
    // without Toxins (and not Mycelids) poison is refused
    const no = covert('poison', 'unit', false);
    issue(no.s, 0, { type: 'covert', ids: [no.agent], act: 'poison', target: no.target }); step(no.s);
    expect(no.s.ents.task[no.agent]).toBe(0);
    console.log('[F-141/F-142] reveal stamps the target area into fog; sabotaged barracks trained nothing for 20 s; poisoned unit lost HP; well and crop poison set; poison refused without Toxins');
  });

  it('caught in peace time breaks the treaty', () => {
    for (let k = 0; k < 30; k++) {
      const { s, agent, target } = covert('steal', 'capital');
      s.dip.st.rel[1] = s.dip.st.rel[2] = Rel.PEACE;
      for (let j = 0; j < k; j++) s.rngCovert.int(100);
      issue(s, 0, { type: 'covert', ids: [agent], act: 'steal', target });
      for (let t = 0; t < 400; t++) {
        s.step();
        if (s.drainEvents().some((e) => e.type === 'spyCaught')) { expect(s.dip.rel(0, 1)).toBe(Rel.WAR); expect(s.dip.st.reputation[0]).toBeLessThan(D.reputationStart); return; }
      }
    }
    throw new Error('never caught');
  });
});

describe('F-134 economic victory and Phase 6 saves', () => {
  it('off by default; when on, ≥ 50 % of all adamite income for the hold time wins', () => {
    for (const on of [false, true]) {
      const s = new Sim({ seed: 'econ', size: 'small', players: 2, victory: on ? { economic: true } : undefined });
      for (let k = 0; k < D.econHoldTicks + 20; k++) { for (let b = 0; b < 60; b++) s.ps[0].ring[Res.ADAMITE * 60 + b] = 2; s.step(); if (s.winner >= 0) break; }
      expect(s.winner).toBe(on ? 0 : -1);
    }
  });
  it('diplomacy state is deterministic and survives save/load', () => {
    const make = (): Sim => { const s = new Sim({ seed: 'dip-det', size: 'small', players: 3 }); issue(s, 0, { type: 'offer', to: 1, give: {}, get: {}, treaty: 'peace' }); issue(s, 2, { type: 'chat', to: -1, text: 'hi all' }); return s; };
    const a = make(), b = make();
    run(a, 5); issue(a, 1, { type: 'respond', offer: a.dip.st.offers[0].id, accept: true });
    run(b, 5); issue(b, 1, { type: 'respond', offer: b.dip.st.offers[0].id, accept: true });
    run(a, 300); run(b, 300);
    expect(a.hash()).toBe(b.hash());
    const c = loadSim(JSON.parse(JSON.stringify(saveSim(a))));
    expect(c.hash()).toBe(a.hash());
    expect(c.dip.rel(0, 1)).toBe(Rel.PEACE);
    expect(c.dip.st.chat[0].text).toBe('hi all');
  });
});
