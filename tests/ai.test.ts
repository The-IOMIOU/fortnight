// Phase 4 acceptance tests (fast part): utility scoring, bot fog rules, team victory, bot
// determinism and save/load. The long headless match batches live in tests/bots-*.test.ts.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Rng } from '../src/sim/core/prng';
import { buildingKind } from '../src/sim/defs';
import { ownedOfKind } from '../src/sim/scripted';
import { loadSim, saveSim } from '../src/sim/serialize';
import { BotManager, type BotConfig } from '../src/ai/manager';
import { BotView, UNKNOWN } from '../src/ai/view';
import { PERSONALITIES, personality, rawScores, scoreGoals, boredom, type Situation } from '../src/ai/utility';
import { TUNING } from '../src/sim/core/tuning';

const base: Situation = {
  minutes: 3, workers: 8, idleWorkers: 0, workerTarget: 20, pop: 10, housing: 20, foodBalance: 5, towns: 1, maxTowns: 3,
  settlers: 0, expansionSites: 2, army: 0, armyStrength: 0, attackSize: 12, threat: 0, intruders: 0,
  enemyTownsLand: 0, enemyTownsSea: 0, softTargets: 0, barracks: 0,
};
const S = (o: Partial<Situation>): Situation => ({ ...base, ...o });

describe('F-124 utility AI: goal scores from situations', () => {
  it('early game with few workers → economy', () => {
    expect(scoreGoals(S({}), personality('defender')).goal).toBe('economy');
  });
  it('enemy soldiers inside our land → defense, whatever the personality', () => {
    for (const p of PERSONALITIES) expect(scoreGoals(S({ intruders: 4, threat: 30, workers: 20 }), p).goal).toBe('defense');
  });
  it('full army, known land target, bored → attack (berserker sooner than pacifist)', () => {
    const ready = S({ minutes: 20, workers: 20, army: 14, armyStrength: 140, enemyTownsLand: 1, towns: 3 });
    expect(scoreGoals(ready, personality('berserker')).goal).toBe('attack');
    const b = scoreGoals(ready, personality('berserker')).scores.attack, p = scoreGoals(ready, personality('pacifist')).scores.attack;
    expect(b).toBeGreaterThan(p);
  });
  it('free sites and room for towns → expansionist expands', () => {
    expect(scoreGoals(S({ minutes: 6, workers: 18 }), personality('expansionist')).goal).toBe('expand');
  });
  it('no town slots left → expand scores 0; nothing to raid → raid scores 0', () => {
    const r = rawScores(S({ towns: 3, maxTowns: 3 }));
    expect(r.expand).toBe(0);
    expect(r.raid).toBe(0);
    expect(rawScores(S({ softTargets: 2 })).raid).toBeGreaterThan(0);
  });
  it('boredom ramps from 0 to 1 and late game escalates even pacifists to attack', () => {
    expect(boredom(0)).toBe(0);
    expect(boredom(TUNING.bots.boredomFullMin + 1)).toBe(1);
    expect(scoreGoals(S({ minutes: 45, workers: 20, army: 20, armyStrength: 200, enemyTownsLand: 1, towns: 3 }), personality('pacifist')).goal).toBe('attack');
  });
  it('scores are deterministic integers', () => {
    const a = scoreGoals(S({ minutes: 12, army: 5 }), personality('raider')), b = scoreGoals(S({ minutes: 12, army: 5 }), personality('raider'));
    expect(a).toEqual(b);
    for (const v of Object.values(a.scores)) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('F-122 bots see only what their player sees', () => {
  it('fuzz: every BotView entity is own/allied or visibleTo; unexplored tiles read UNKNOWN / −1', () => {
    const configs: BotConfig[] = [0, 1, 2, 3].map((p) => ({ player: p, personality: PERSONALITIES[p].id, difficulty: 'hard' }));
    const sim = new Sim({ seed: 'fog-fuzz', size: 'small', players: 4, teams: [0, 0, 2, 3] });
    const bots = new BotManager(sim, configs);
    const rng = Rng.stream('fog-fuzz', 'probe');
    let checked = 0, unknownSeen = 0;
    for (let k = 0; k < 6000; k++) {
      bots.tick(); sim.step();
      if (k % 500 !== 499) continue;
      for (const b of bots.bots) {
        const p = b.s.player, v = new BotView(sim, p, b.mem);
        for (const u of [...v.enemyUnits, ...v.enemyBuildings]) { expect(sim.visibleTo(u.id, p)).toBe(true); expect(sim.allied(u.owner, p) && u.owner < sim.players).toBe(false); checked++; }
        for (const u of v.alliedUnits) expect(sim.allied(u.owner, p)).toBe(true);
        for (const u of v.myUnits) expect(u.owner).toBe(p);
        for (let j = 0; j < 400; j++) {
          const t = rng.int(sim.map.w * sim.map.h);
          if (!v.explored(t)) { expect(v.biome(t)).toBe(UNKNOWN); expect(v.resource(t)).toBe(UNKNOWN); expect(v.owner(t)).toBe(-1); unknownSeen++; }
          else if (v.visible(t)) expect(v.biome(t)).toBe(sim.map.biome[t]);
        }
      }
    }
    console.log(`[F-122] ${checked} enemy entity sightings checked against visibleTo; ${unknownSeen} unexplored tile probes all UNKNOWN`);
    expect(checked).toBeGreaterThan(0);
    expect(unknownSeen).toBeGreaterThan(0);
  });
});

describe('F-132 teams and alliances', () => {
  it('allied players are not enemies; the last team with a capital wins together', () => {
    const s = new Sim({ seed: 'teams', size: 'small', players: 3, teams: [0, 0, 2] });
    expect(s.allied(0, 1)).toBe(true);
    expect(s.allied(0, 2)).toBe(false);
    s.ents.hp[ownedOfKind(s, 2, buildingKind('capital'))[0]] = 0;
    const ev: { type: string; a?: number; b?: number }[] = [];
    for (let k = 0; k < 20; k++) { s.step(); ev.push(...s.drainEvents()); }
    expect(s.ps[2].eliminated).toBe(true);
    expect(s.winnerTeam).toBe(0);
    expect([0, 1]).toContain(s.winner);
    expect(ev.find((e) => e.type === 'victory')?.b).toBe(0);
  });
  it('conquest can be switched off', () => {
    const s = new Sim({ seed: 'teams', size: 'small', players: 2, victory: { conquest: false, domination: true } });
    s.ents.hp[ownedOfKind(s, 1, buildingKind('capital'))[0]] = 0;
    for (let k = 0; k < 20; k++) s.step();
    expect(s.winner).toBe(-1);
  });
});

describe('Phase 4 determinism and save/load with bots', () => {
  const configs: BotConfig[] = [
    { player: 0, personality: 'berserker', difficulty: 'hard' },
    { player: 1, personality: 'expansionist', difficulty: 'easy' },
    { player: 2, personality: 'merchant', difficulty: 'impossible' },
  ];
  const run = (sim: Sim, bots: BotManager, n: number): void => { for (let k = 0; k < n; k++) { bots.tick(); sim.step(); sim.drainEvents(); } };
  it('a bot match repeats exactly; save/load (incl. bot memory) continues identically', () => {
    const mk = (): [Sim, BotManager] => { const s = new Sim({ seed: 'bot-det', size: 'small', players: 3, incomeBonusPct: [0, 0, 25] }); return [s, new BotManager(s, configs)]; };
    const [a, ba] = mk(), [b, bb] = mk();
    run(a, ba, 6000); run(b, bb, 6000);
    expect(a.hash()).toBe(b.hash());
    const sv = saveSim(a);
    sv.extra = { bots: ba.save() };
    const json = JSON.parse(JSON.stringify(sv));
    const c = loadSim(json), bc = BotManager.restore(c, (json.extra as { bots: ReturnType<BotManager['save']> }).bots);
    run(a, ba, 3000); run(c, bc, 3000);
    console.log(`[Phase 4] bot match hash at 6000 equal on repeat; after save/load +3000 ticks: ${a.hash()} vs ${c.hash()}`);
    expect(c.hash()).toBe(a.hash());
    expect(JSON.stringify(bc.debug())).toBe(JSON.stringify(ba.debug()));
  }, 120000);
});
