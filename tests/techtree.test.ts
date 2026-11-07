// F-205 era tech tree (owner 2026-11-07: "u dont directly unlock guns, i want a whole tree of evolution like
// civilisation iv") and F-204 (Easy bots gather slower).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { ERAS, TECH_TREE, techNode, EFFECT_KEYS } from '../src/sim/abilities';
import { Res, unitKind } from '../src/sim/defs';
import { issue, nearestResource, ownedOfKind } from '../src/sim/scripted';
import { TUNING } from '../src/sim/core/tuning';

const run = (s: Sim, n: number): void => { for (let k = 0; k < n; k++) s.step(); };
const give = (s: Sim, p: number, ...ids: string[]): void => { s.ps[p].researched.push(...ids); s.rules.refresh(p); };

/** Every tech needed (transitively) before `id`. */
function ancestors(id: string, seen = new Set<string>()): Set<string> {
  for (const q of techNode(id)!.requires) if (!seen.has(q)) { seen.add(q); ancestors(q, seen); }
  return seen;
}

describe('F-205 era tech tree data', () => {
  it('≈32 techs in 5 eras; prerequisites exist, come from the same or an earlier era, no cycles', () => {
    const n = TECH_TREE.nodes;
    console.log(`[F-205] ${n.length} techs in eras ${ERAS.join(', ')}: ${ERAS.map((_, i) => n.filter((x) => x.era === i + 1).length).join('/')}`);
    expect(ERAS.length).toBe(5);
    expect(n.length).toBeGreaterThanOrEqual(30);
    expect(new Set(n.map((x) => x.id)).size).toBe(n.length);
    for (const t of n) {
      expect(t.era).toBeGreaterThanOrEqual(1); expect(t.era).toBeLessThanOrEqual(ERAS.length);
      expect(t.text.length).toBeGreaterThan(5);
      for (const q of t.requires) {
        const r = techNode(q);
        expect(r, `${t.id} needs unknown ${q}`).toBeTruthy();
        expect(r!.era, `${t.id} needs ${q} from a later era`).toBeLessThanOrEqual(t.era);
      }
      expect(ancestors(t.id).has(t.id), `${t.id} is in a cycle`).toBe(false);
      for (const k of Object.keys(t.effects ?? {})) expect(EFFECT_KEYS as readonly string[]).toContain(k);
      if (t.era > 1) expect(t.requires.length, `${t.id} has no prerequisite`).toBeGreaterThan(0);
    }
  });

  it('guns come late: the firearms gear needs ≥ 10 earlier techs, and only the Gunpowder era gives it', () => {
    const guns = TECH_TREE.nodes.filter((t) => t.gear?.includes('firearms'));
    expect(guns.length).toBe(1);
    const before = ancestors(guns[0].id);
    console.log(`[F-205] guns (${guns[0].name}, era ${ERAS[guns[0].era - 1]}) need ${before.size} earlier techs: ${[...before].join(', ')}`);
    expect(before.size).toBeGreaterThanOrEqual(10);
    expect(ERAS[guns[0].era - 1]).toBe('Gunpowder');
  });

  it('research is blocked until the prerequisites are done', () => {
    const s = new Sim({ seed: 'tree', size: 'small', players: 1 });
    expect(s.rules.canResearch(0, 'firearms')).toBe('needs earlier research');
    expect(s.rules.canResearch(0, 'mining')).toBe(null);
    give(s, 0, 'mining');
    expect(s.rules.canResearch(0, 'bronze')).toBe(null);
  });
});

describe('F-205 every effect type changes the game', () => {
  it('housing, building health, tower damage, train time, research time, naval speed', () => {
    const s = new Sim({ seed: 'fx', size: 'small', players: 2 });
    const out: string[] = [];
    // housing: the capital holds more people after Pottery
    run(s, 1); const h0 = s.ps[0].housing; give(s, 0, 'pottery'); run(s, 1);
    out.push(`housing ${h0}→${s.ps[0].housing}`); expect(s.ps[0].housing).toBeGreaterThan(h0);
    // building health
    const b0 = s.rules.buildingHp(0, 'house', 400); give(s, 0, 'mining', 'masonry');
    out.push(`house hp ${b0}→${s.rules.buildingHp(0, 'house', 400)}`); expect(s.rules.buildingHp(0, 'house', 400)).toBeGreaterThan(b0);
    // towers
    const t0 = s.rules.scale(1, 'towerDamagePct', 100); give(s, 0, 'writing', 'mathematics');
    out.push(`tower damage ${t0}→${s.rules.scale(0, 'towerDamagePct', 100)} %`); expect(s.rules.scale(0, 'towerDamagePct', 100)).toBeGreaterThan(t0);
    // research time (Writing + Mathematics' sibling Philosophy)
    const r1 = s.rules.researchTicks(1, 1000), r0 = s.rules.researchTicks(0, 1000);
    out.push(`research 1000→${r0} ticks`); expect(r0).toBeLessThan(r1);
    // train time
    const tr1 = s.rules.trainTicks(1, 'spearman'); give(s, 0, 'philosophy', 'medicine');
    out.push(`spearman training ${tr1}→${s.rules.trainTicks(0, 'spearman')} ticks`); expect(s.rules.trainTicks(0, 'spearman')).toBeLessThan(tr1);
    // naval speed
    const v1 = s.rules.unitStats(1, 'transport').speed; give(s, 0, 'sailing');
    out.push(`transport speed ${v1}→${s.rules.unitStats(0, 'transport').speed}`); expect(s.rules.unitStats(0, 'transport').speed).toBeGreaterThan(v1);
    console.log('[F-205] ' + out.join('; '));
  });

  it('farm yield and carry: Agriculture farms make more food; Animal husbandry workers carry more per trip', () => {
    const s = new Sim({ seed: 'fx2', size: 'small', players: 2 });
    const f1 = s.rules.scale(1, 'farmYieldPct', 100); give(s, 0, 'agriculture');
    expect(s.rules.scale(0, 'farmYieldPct', 100)).toBeGreaterThan(f1);
    // carry: a worker gathering wood comes back with a bigger load
    const maxLoad = (p: number): number => {
      const w = ownedOfKind(s, p, unitKind('worker'))[0];
      issue(s, p, { type: 'gather', ids: [w], tile: nearestResource(s, s.tileOf(w), Res.WOOD) });
      let m = 0; for (let k = 0; k < 2500; k++) { s.step(); m = Math.max(m, s.ents.carryAmt[w]); }
      return m;
    };
    const plain = maxLoad(1); give(s, 0, 'husbandry'); const more = maxLoad(0);
    console.log(`[F-205] farm yield ${f1}→${s.rules.scale(0, 'farmYieldPct', 100)} %; biggest load ${plain} → ${more} with Animal husbandry`);
    expect(more).toBe(plain + techNode('husbandry')!.effects!.carryPlus!);
  });
});

describe('F-204 Easy bots gather slower', () => {
  it('same three wood cutters: the Easy-speed player gets ≈ workPct % of the wood', () => {
    const wood = (workPct?: number[]): number => {
      const s = new Sim({ seed: 'easy-eco', size: 'small', players: 1, workPct });
      const ws = ownedOfKind(s, 0, unitKind('worker')).slice(0, 3);
      const w0 = s.ps[0].stock[Res.WOOD];
      for (const w of ws) issue(s, 0, { type: 'gather', ids: [w], tile: nearestResource(s, s.tileOf(w), Res.WOOD) });
      run(s, 6000);
      return s.ps[0].stock[Res.WOOD] - w0;
    };
    const normal = wood(), easy = wood([TUNING.bots.easy.workPct]);
    const pct = Math.round((easy * 100) / normal);
    console.log(`[F-204] 10 minutes, 3 wood cutters: normal ${normal} wood, Easy ${easy} wood (${pct} %, set to ${TUNING.bots.easy.workPct} %)`);
    expect(Math.abs(pct - TUNING.bots.easy.workPct)).toBeLessThanOrEqual(8);
  });
});
