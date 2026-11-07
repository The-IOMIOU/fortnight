// F-207 evolution branches and F-208 made-up peoples (owner 2026-11-07: "special evolution branches that
// are diff on each population"; "make your own populations … u can only save and play with it IF you
// balance it out to 0 … u cant start with too many buffs").
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { AB } from '../src/sim/abilities';
import { PLAYABLE_RACES, raceBuffs, racePoints, raceById, validateRace, type RaceDef } from '../src/sim/races';
import { TUNING } from '../src/sim/core/tuning';
import { loadSim, saveSim } from '../src/sim/serialize';
import { HostLockstep, ClientLockstep } from '../src/net/lockstep';
import { issue } from '../src/sim/scripted';
import { researchOrder } from '../src/ai/race';

const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };

describe('F-207 evolution branches', () => {
  it('every playable people has two branches of three steps', () => {
    for (const r of PLAYABLE_RACES) {
      const names = [...new Set(r.evolution_tree.filter((n) => n.branch).map((n) => n.branch))];
      expect(names.length, r.id).toBe(2);
      for (const b of names) expect(r.evolution_tree.filter((n) => n.branch === b).length, `${r.id} ${b}`).toBe(3);
    }
    console.log('[F-207] ' + PLAYABLE_RACES.map((r) => `${r.name}: ${[...new Set(r.evolution_tree.filter((n) => n.branch).map((n) => n.branch))].join(' / ')}`).join('; '));
  });

  it('after starting branch A, branch B can not be researched (and bots stick to one branch)', () => {
    const s = new Sim({ seed: 'branch', size: 'small', players: 1, races: ['deepkin'] });
    s.ps[0].stock = [9000, 9000, 9000, 9000, 9000, 9000];
    s.ps[0].researched.push('tidecraft'); s.rules.refresh(0);
    expect(s.rules.canResearch(0, 'saltLungs')).toBe(null);
    expect(s.rules.canResearch(0, 'coralPlate')).toBe(null);
    issue(s, 0, { type: 'research', node: 'saltLungs' }); s.step();
    expect(s.ps[0].researching).toBe('saltLungs');
    expect(s.rules.canResearch(0, 'coralPlate')).not.toBe(null);
    run(s, 800);
    expect(s.ps[0].researched).toContain('saltLungs');
    const why = s.rules.canResearch(0, 'coralPlate');
    console.log(`[F-207] Deepkin chose Tidewalkers; Abyssal says: "${why}"`);
    expect(why).toBe('you chose the other branch');
    expect(s.rules.canResearch(0, 'pearlBeds')).toBe(null);
    issue(s, 0, { type: 'research', node: 'coralPlate' }); run(s, 5);
    expect(s.ps[0].researching).not.toBe('coralPlate');
    for (const r of PLAYABLE_RACES) {
      const o = researchOrder(r), br = new Set(r.evolution_tree.filter((n) => n.branch && o.includes(n.id)).map((n) => n.branch));
      expect(br.size, r.id).toBe(1);
    }
  });
});

const base = raceById('scholars');
const custom = (over: Partial<RaceDef>): RaceDef => ({
  ...base, id: 'custom_test', name: 'Test folk', custom: true, base: 'scholars', special_ability: null, weakness: null,
  stat_modifiers: { gather_speed: 100, build_speed: 100, unit_health: 100, unit_damage: 100, vision: 100, movement: 100 }, ...over,
});

describe('F-208 made-up peoples', () => {
  it('total above 0 or more than 3 buffs is rejected; 0 or below is accepted', () => {
    const tooStrong = custom({ extra_abilities: ['quickStudy'] }); // +6
    const four = custom({ stat_modifiers: { gather_speed: 105, build_speed: 105, unit_health: 105, unit_damage: 105, vision: 100, movement: 100 }, extra_abilities: ['fragileArmy'] });
    const even = custom({ extra_abilities: ['quickStudy', 'fragileArmy'] });
    const weak = custom({ extra_abilities: ['quickStudy', 'fragileArmy', 'poorFarmers'] });
    const msg = (r: RaceDef): string => validateRace(r).map((e) => e.message).join('; ');
    console.log(`[F-208] +${racePoints(tooStrong)}: "${msg(tooStrong)}" · ${raceBuffs(four)} buffs: "${msg(four)}" · ${racePoints(even)}: ok · ${racePoints(weak)}: ok`);
    expect(msg(tooStrong)).toMatch(/too strong/);
    expect(raceBuffs(four)).toBe(4);
    expect(msg(four)).toMatch(new RegExp(`at most ${TUNING.races.custom.maxBuffs} buffs`));
    expect(validateRace(even)).toEqual([]);
    expect(validateRace(weak)).toEqual([]);
    expect(racePoints(weak)).toBeLessThan(0);
  });

  it('a made-up people plays, its abilities work, and it survives save/load and a two-peer match', () => {
    const r = custom({ id: 'custom_play', extra_abilities: ['quickStudy', 'fragileArmy', 'poorFarmers'], stat_modifiers: { gather_speed: 100, build_speed: 100, unit_health: 100, unit_damage: 100, vision: 100, movement: 110 } });
    const s = new Sim({ seed: 'custom', size: 'small', players: 2, races: ['custom_play', 'baseline'], customRaces: [r] });
    expect(s.ps[0].race).toBe('custom_play');
    expect(s.rules.researchTicks(0, 600)).toBe(Math.floor((600 * AB.quickStudy.researchTimePct) / 100));
    expect(s.rules.has(0, 'poorFarmers')).toBe(true);
    expect(s.rules.unitStats(0, 'spearman').hp).toBe(Math.floor((TUNING.unitTypes.spearman.hp * AB.fragileArmy.militaryHpPct) / 100));
    expect(s.rules.unitStats(0, 'worker').speed).toBeGreaterThan(s.rules.unitStats(1, 'worker').speed);
    run(s, 300);
    const save = JSON.parse(JSON.stringify(saveSim(s)));
    expect(save.settings.customRaces[0].id).toBe('custom_play');
    const l = loadSim(save);
    expect(l.ps[0].race).toBe('custom_play');
    expect(l.hash()).toBe(s.hash());
    // two peers: the guest builds its match from the host's welcome (settings carry the people)
    const host = new HostLockstep(s, null, 0, [0, 1]);
    const seat = host.join('guest', 'Guest')!;
    const c = new ClientLockstep();
    c.receive(JSON.parse(JSON.stringify(host.welcome(seat))));
    expect(c.sim!.ps[0].race).toBe('custom_play');
    expect(c.sim!.hash()).toBe(s.hash());
    console.log(`[F-208] custom people "${r.name}" (${racePoints(r)} points, ${raceBuffs(r)} buffs): research ${s.rules.researchTicks(0, 600)}/600 ticks, spearman hp ${s.rules.unitStats(0, 'spearman').hp}; save/load and guest hashes match`);
  });
});
