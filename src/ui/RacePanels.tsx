// Research screen (F-206: the era tech tree with prerequisite lines, plus the people's own evolution with
// its two branches, F-207), forge crafting, gear and burrow buttons, and the people summary in the menu.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Game } from '../app/game';
import { store, useStore } from '../app/store';
import { TUNING } from '../sim/core/tuning';
import { RES_NAMES, type BuildingTypeName, type UnitTypeName } from '../sim/defs';
import { ERAS, GEAR_IDS, RACE_UNITS, TECH_TREE, isRaceBuilding, raceNode, sharedTech, techNode, type GearId, type ResearchDef } from '../sim/abilities';
import { raceById, racePoints, type AbilityId, type RaceDef } from '../sim/races';
import { BUILDING_NAMES, RES_COLORS, UNIT_NAMES } from './names';
import { ABILITY_TEXT, raceTraits, signed, unlockLines } from './describe';

export { ABILITY_TEXT };

const costOf = (c: number[]): Record<string, number> => Object.fromEntries(c.map((v, i) => [RES_NAMES[i], v]).filter(([, v]) => v));
function Cost({ c }: { c: Record<string, number> }) {
  return <span class="cost">{Object.entries(c).map(([k, v]) => <span key={k}><i class="dot" style={{ background: RES_COLORS[RES_NAMES.indexOf(k as (typeof RES_NAMES)[number])] }} />{v}</span>)}</span>;
}

/** What a player of race `r` has unlocked after `researched` (mirrors RaceRules on the client). */
export function unlocks(raceId: string, researched: string[]): { buildings: Set<string>; units: Set<string>; gear: Set<string>; abilities: Set<string> } {
  const r = raceById(raceId), b = new Set<string>(), u = new Set<string>(), g = new Set<string>(), a = new Set<string>();
  for (const x of [r.special_ability, r.weakness, ...(r.extra_abilities ?? [])]) if (x) a.add(x);
  for (const id of researched) {
    const n = sharedTech(id) ?? raceNode(r, id);
    if (!n) continue;
    n.buildings.forEach((x) => b.add(x)); n.units.forEach((x) => u.add(x)); n.gear.forEach((x) => g.add(x)); n.abilities.forEach((x) => a.add(x));
  }
  return { buildings: b, units: u, gear: g, abilities: a };
}
/** Does this player have the ability module (own, made-up or unlocked by evolution)? */
export const hasAbility = (raceId: string, researched: string[], a: AbilityId): boolean => unlocks(raceId, researched).abilities.has(a);
export function buildingAllowed(raceId: string, researched: string[], bt: BuildingTypeName): boolean {
  const un = unlocks(raceId, researched);
  if (bt === 'forge' || bt === 'pier') return un.buildings.has(bt);
  if (isRaceBuilding(bt)) return raceById(raceId).unique_building === bt && un.buildings.has(bt);
  return true;
}
export function unitAllowed(raceId: string, researched: string[], u: UnitTypeName): boolean {
  if (!RACE_UNITS.has(u)) return true;
  return raceById(raceId).unique_units.includes(u) && unlocks(raceId, researched).units.has(u);
}

/** Menu: the people's buffs (+) and debuffs (−) with their numbers; shipped peoples total 0. */
export function RaceSummary({ race }: { race: RaceDef }) {
  const traits = raceTraits(race);
  return (
    <div class="race-summary" data-testid="race-summary">
      {traits.map((t) => <div class={'trait ' + t.kind}><b>{t.name}</b> <small class="pts">{signed(t.points)}</small> {t.text}</div>)}
      {race.unique_units.length > 0 && <div><b>Own troops:</b> {race.unique_units.map((u) => UNIT_NAMES[u as UnitTypeName]).join(', ')} · <b>building:</b> {race.unique_building ? BUILDING_NAMES[race.unique_building as BuildingTypeName] : '—'}</div>}
      <div><small data-testid="race-points">Point balance: {racePoints(race)} ({race.custom ? 'made-up peoples total 0 or less' : 'every people totals 0'})</small></div>
    </div>
  );
}

/** Top-bar button + research panel. */
export function TechButton() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  return <button onClick={() => store.set({ techOpen: !store.state.techOpen })} data-testid="tech-btn" title="Research and evolution">Research{me.researching ? ` ${Math.floor(me.researchPermille / 10)} %` : ''}</button>;
}

type NodeState = 'done' | 'busy' | 'ready' | 'locked' | 'closed';

/** Every node needed (transitively) before `id` in the shared tree. */
function ancestors(id: string, out = new Set<string>()): Set<string> {
  for (const q of techNode(id)?.requires ?? []) if (!out.has(q)) { out.add(q); ancestors(q, out); }
  return out;
}

export function TechPanel({ game }: { game: Game }) {
  const s = useStore((st) => ({ open: st.techOpen, me: st.me, stats: st.stats }));
  const [hover, setHover] = useState('');
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null);
  const open = s.open && !!s.me;
  const me = s.me;
  const key = open && me ? me.researched.join(',') + '|' + me.researching + '|' + hover : '';
  // prerequisite lines: measured from the laid-out cards, drawn into one SVG behind them
  useLayoutEffect(() => {
    const w = wrap.current, g = svg.current;
    if (!open || !w || !g) return;
    const draw = (): void => {
      const box = w.getBoundingClientRect(), pos = new Map<string, DOMRect>();
      w.querySelectorAll<HTMLElement>('[data-node]').forEach((el) => pos.set(el.dataset.node!, el.getBoundingClientRect()));
      const hl = hover ? ancestors(hover).add(hover) : null;
      let html = '';
      for (const n of TECH_TREE.nodes) for (const q of n.requires) {
        const a = pos.get(q), b = pos.get(n.id);
        if (!a || !b) continue;
        const same = Math.abs(a.left - b.left) < 4;
        const x1 = (same ? a.left : a.right) - box.left + w.scrollLeft, y1 = a.top + a.height / 2 - box.top + w.scrollTop;
        const x2 = b.left - box.left + w.scrollLeft, y2 = b.top + b.height / 2 - box.top + w.scrollTop;
        const d = same ? `M${x1},${y1} C${x1 - 22},${y1} ${x2 - 22},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`;
        const done = me!.researched.includes(q);
        const on = hl && hl.has(n.id) && hl.has(q);
        html += `<path d="${d}" class="${on ? 'hl' : done ? 'done' : ''}"/>`;
      }
      g.setAttribute('width', String(w.scrollWidth)); g.setAttribute('height', String(w.scrollHeight));
      g.innerHTML = html;
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [key, open]);
  if (!open || !me) return null;
  const race = raceById(me.race);
  const stock = s.stats?.stock ?? [];
  const chosen = race.evolution_tree.find((n) => n.branch && (me.researched.includes(n.id) || me.researching === n.id))?.branch ?? '';
  const stateOf = (n: ResearchDef): NodeState => {
    if (me.researched.includes(n.id)) return 'done';
    if (me.researching === n.id) return 'busy';
    if (n.branch && chosen && n.branch !== chosen) return 'closed';
    return n.requires.every((q) => me.researched.includes(q)) ? 'ready' : 'locked';
  };
  const card = (n: ResearchDef, name: string, lines: string[]) => {
    const st = stateOf(n), afford = n.cost.every((c, i) => (stock[i] ?? 0) >= c);
    const needs = n.requires.filter((q) => !me.researched.includes(q)).map((q) => techNode(q)?.name ?? race.evolution_tree.find((x) => x.id === q)?.name ?? q);
    return (
      <div class={`tnode ${st}${n.capstone ? ' cap' : ''}`} data-node={n.id} data-testid={'tech-' + n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover('')}>
        <div class="tn-head"><b>{name}</b>{n.capstone && <small class="tag">capstone</small>}</div>
        <div class="tn-what">{lines.map((l) => <div>{l}</div>)}</div>
        <div class="tn-foot">
          {st === 'done' ? <small class="ok">✓ done</small>
            : st === 'busy' ? <span class="bar"><span style={{ width: `${me.researchPermille / 10}%` }} /></span>
            : st === 'closed' ? <small>Other branch chosen</small>
            : <>
              <span class="tn-cost"><Cost c={costOf(n.cost)} /> · {Math.round(n.ticks / TUNING.sim.tickHz)} s</span>
              {st === 'locked' ? <small class="needs">needs {needs.join(', ')}</small>
                : <button disabled={!!me.researching || !afford} title={!afford ? 'Not enough resources' : me.researching ? 'Already researching' : ''} onClick={() => game.research(n.id)} data-testid={'research-' + n.id}>Research</button>}
            </>}
        </div>
      </div>
    );
  };
  const trunk = race.evolution_tree.filter((n) => !n.branch);
  const branches = [...new Set(race.evolution_tree.filter((n) => n.branch).map((n) => n.branch!))];
  const doneShared = TECH_TREE.nodes.filter((n) => me.researched.includes(n.id)).length;
  return (
    <div class="modal" data-testid="tech-panel"><div class="panel tech-panel">
      <div class="sel-title">Research <small class="muted">{doneShared} / {TECH_TREE.nodes.length} techs</small>
        {me.researching && <button onClick={() => game.cancelResearch()} data-testid="cancel-research">Cancel current research (refund)</button>}
        <button onClick={() => store.set({ techOpen: false })} aria-label="Close">✕</button></div>
      <small class="muted">Each tech needs the ones linked before it. Hover a tech to light up its path. Guns come in the Gunpowder era.</small>
      <div class="ttree" ref={wrap} data-testid="tech-tree">
        <svg class="tlines" ref={svg} />
        {ERAS.map((era, i) => (
          <div class="tera" data-testid={'era-' + (i + 1)}>
            <h4>{era} era</h4>
            {TECH_TREE.nodes.filter((n) => n.era === i + 1).map((n) => card(sharedTech(n.id)!, n.name, [n.text]))}
          </div>
        ))}
      </div>
      {race.evolution_tree.length > 0 && <>
        <h3>{race.name} evolution</h3>
        <div class="tevo">
          <div class="tera"><h4>Own path</h4>{trunk.map((n) => card(raceNode(race, n.id)!, n.name, unlockLines(n.unlocks)))}</div>
          {branches.map((b) => (
            <div class={'tera branch' + (chosen && chosen !== b ? ' closed' : '') + (chosen === b ? ' chosen' : '')} data-testid={'branch-' + b}>
              <h4>{b} <small>{chosen === b ? '(your branch)' : chosen ? '(closed)' : '(pick one branch)'}</small></h4>
              {race.evolution_tree.filter((n) => n.branch === b).map((n) => card(raceNode(race, n.id)!, n.name, unlockLines(n.unlocks)))}
            </div>
          ))}
        </div>
        {branches.length === 2 && !chosen && <small class="muted">Choosing a branch closes the other one for the rest of the match.</small>}
      </>}
    </div></div>
  );
}

export const GEAR_NAMES: Record<GearId, string> = { alloy: 'Alloy', tools: 'Tools', ironWeapons: 'Iron weapons', ironArmor: 'Iron armour', alloyWeapons: 'Alloy weapons', alloyArmor: 'Alloy armour', firearms: 'Firearms' };

/** Forge: craft buttons and the gear store. */
export function ForgePanel({ game, building }: { game: Game; building: number }) {
  const me = useStore((s) => s.me);
  useStore((s) => s.stats);
  if (!me) return null;
  const ok = unlocks(me.race, me.researched).gear;
  const smiths = hasAbility(me.race, me.researched, 'masterSmiths');
  return (
    <div class="buildmenu" data-testid="forge-panel">
      {GEAR_IDS.filter((g) => ok.has(g)).map((g) => {
        const it = TUNING.gear.items[g] as unknown as Record<string, number>, pct = smiths ? TUNING.races.abilities.masterSmiths.gearCostPct : 100;
        const c: Record<string, number> = {};
        for (const r of RES_NAMES) if (it[r]) c[r] = Math.floor((it[r] * pct + 99) / 100);
        return (
          <button onClick={() => game.craft(building, GEAR_IDS.indexOf(g))} data-testid={'craft-' + g} title={`${GEAR_NAMES[g]}${it.alloy ? ` · ${it.alloy} alloy` : ''}`}>
            <b>{GEAR_NAMES[g]}</b><Cost c={c} />{it.alloy ? <small> +{it.alloy} alloy</small> : null}
          </button>
        );
      })}
      <div class="sel-sub" data-testid="gear-stock">In store: {GEAR_IDS.map((g, i) => (me.gear[i] ? `${GEAR_NAMES[g]} ${me.gear[i]}` : '')).filter(Boolean).join(', ') || 'nothing yet'}</div>
    </div>
  );
}

/** Selected units: equip gear from the store; Delvers burrow / surface. */
export function UnitRaceBar({ game }: { game: Game }) {
  const me = useStore((s) => s.me);
  if (!me) return null;
  const race = raceById(me.race), items = GEAR_IDS.map((g, i) => [g, me.gear[i]] as const).filter(([g, n]) => n > 0 && TUNING.gear.items[g].slot > 0);
  const digs = hasAbility(me.race, me.researched, 'tunneling');
  if (!items.length && !digs) return null;
  return (
    <div class="buildmenu" data-testid="race-bar">
      {items.map(([g, n]) => <button onClick={() => game.equip(GEAR_IDS.indexOf(g))} data-testid={'equip-' + g} title={`Units within ${TUNING.gear.assignRange} tiles of a forge, barracks or town get it`}>Equip {GEAR_NAMES[g]} ({n})</button>)}
      {digs && <>
        <button onClick={() => game.burrow(true)} data-testid="burrow-on">Burrow</button>
        <button onClick={() => game.burrow(false)} data-testid="burrow-off">Surface</button>
      </>}
    </div>
  );
}
