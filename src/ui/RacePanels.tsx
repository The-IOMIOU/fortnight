// Phase 5 UI: research panel (shared tech + own evolution tree, F-095), forge crafting, gear and burrow
// buttons, and the race summary shown in the menu (ability, weakness, point breakdown, F-112).
import type { Game } from '../app/game';
import { store, useStore } from '../app/store';
import { TUNING } from '../sim/core/tuning';
import { RES_NAMES, type BuildingTypeName, type UnitTypeName } from '../sim/defs';
import { GEAR_IDS, RACE_UNITS, TECH_IDS, isRaceBuilding, raceNode, sharedTech, type GearId, type ResearchDef } from '../sim/abilities';
import { STAT_KEYS, raceById, racePoints, type RaceDef } from '../sim/races';
import { BUILDING_NAMES, RES_COLORS, UNIT_NAMES } from './names';

export const ABILITY_TEXT: Record<string, string> = {
  amphibious: 'Breathe and walk underwater; faster in water.',
  sunburn: 'Sunlight burns units on land outside your territory by day; settle and build outposts only at night.',
  tameAnimals: 'Scouts tame wild animals into fighting beasts (right-click an animal).',
  frailBuildings: 'Buildings have 30 % less health.',
  tunneling: 'Units burrow: hidden, they pass under walls and moats (not water) and strike harder when they surface.',
  poorSailors: 'Ships have less health and deal less damage.',
  fungalSpread: 'Fungus spreads from your towns into nearby land, poisoning enemy units and halving enemy farm yield.',
  slowGrowth: 'Training takes 40 % longer.',
  gliders: 'Gliders fly over walls, water and mountains in hops; scouts are 30 % faster.',
  poorDefense: 'Walls, gates and towers are weaker; towers shoot softer.',
  masterSmiths: 'Gear costs 40 % less and counts one tier higher.',
  heavyFooted: 'Soldiers move 20 % slower.',
  swampStalkers: 'Fast and hidden in swamps.',
  openGroundWeak: 'Fight 30 % worse on plains and deserts.',
  frostAdapted: 'Stronger and faster gathering in cold lands; ice fishing bonus.',
  heatWeak: 'Work and fight worse in deserts.',
};
const STAT_LABEL: Record<string, string> = { gather_speed: 'gathering', build_speed: 'building', unit_health: 'health', unit_damage: 'damage', vision: 'vision', movement: 'speed' };

const costOf = (c: number[]): Record<string, number> => Object.fromEntries(c.map((v, i) => [RES_NAMES[i], v]).filter(([, v]) => v));
function Cost({ c }: { c: Record<string, number> }) {
  return <span class="cost">{Object.entries(c).map(([k, v]) => <span key={k}><i class="dot" style={{ background: RES_COLORS[RES_NAMES.indexOf(k as (typeof RES_NAMES)[number])] }} />{v}</span>)}</span>;
}

/** What a player of race `r` has unlocked after `researched` (mirrors RaceRules on the client). */
export function unlocks(raceId: string, researched: string[]): { buildings: Set<string>; units: Set<string>; gear: Set<string> } {
  const r = raceById(raceId), b = new Set<string>(), u = new Set<string>(), g = new Set<string>();
  for (const id of researched) {
    const n = sharedTech(id) ?? raceNode(r, id);
    if (!n) continue;
    n.buildings.forEach((x) => b.add(x)); n.units.forEach((x) => u.add(x)); n.gear.forEach((x) => g.add(x));
  }
  return { buildings: b, units: u, gear: g };
}
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

/** Menu: race summary with the point breakdown (power-ups +, power-downs −, total must be 0). */
export function RaceSummary({ race }: { race: RaceDef }) {
  const A = TUNING.races.abilities as Record<string, { points: number }>;
  const stats = STAT_KEYS.filter((k) => race.stat_modifiers[k] !== 100);
  return (
    <div class="race-summary" data-testid="race-summary">
      {race.special_ability && <div><b>Gift:</b> {ABILITY_TEXT[race.special_ability]} <small>({A[race.special_ability].points > 0 ? '+' : ''}{A[race.special_ability].points})</small></div>}
      {race.weakness && <div><b>Weakness:</b> {ABILITY_TEXT[race.weakness]} <small>({A[race.weakness].points})</small></div>}
      {stats.length > 0 && <div><b>Traits:</b> {stats.map((k) => `${STAT_LABEL[k]} ${race.stat_modifiers[k]} %`).join(', ')}</div>}
      {race.unique_units.length > 0 && <div><b>Own troops:</b> {race.unique_units.map((u) => UNIT_NAMES[u as UnitTypeName]).join(', ')} · <b>building:</b> {race.unique_building ? BUILDING_NAMES[race.unique_building as BuildingTypeName] : '—'}</div>}
      <div><small data-testid="race-points">Point balance: {racePoints(race)} (every people totals 0)</small></div>
    </div>
  );
}

/** Top-bar button + research panel. */
export function TechButton() {
  const me = useStore((s) => s.me);
  if (!me) return null;
  return <button onClick={() => store.set({ techOpen: !store.state.techOpen })} data-testid="tech-btn" title="Research and evolution">Research{me.researching ? ` ${Math.floor(me.researchPermille / 10)} %` : ''}</button>;
}

export function TechPanel({ game }: { game: Game }) {
  const s = useStore((st) => ({ open: st.techOpen, me: st.me, stats: st.stats }));
  if (!s.open || !s.me) return null;
  const me = s.me, race = raceById(me.race);
  const stock = s.stats?.stock ?? [];
  const row = (n: ResearchDef, name: string) => {
    const done = me.researched.includes(n.id), busy = me.researching === n.id;
    const ready = n.requires.every((q) => me.researched.includes(q));
    const afford = n.cost.every((c, i) => (stock[i] ?? 0) >= c);
    const what = [...n.buildings.map((b) => BUILDING_NAMES[b as BuildingTypeName]), ...n.units.map((u) => UNIT_NAMES[u as UnitTypeName]), ...n.gear.map((g) => GEAR_NAMES[g as GearId]),
      ...Object.entries(n.stats).map(([k, v]) => `${STAT_LABEL[k]} +${v} %`)].join(', ');
    return (
      <div class={'tech-row' + (done ? ' done' : '')} data-testid={'tech-' + n.id}>
        <div><b>{name}</b>{n.capstone && <small> (capstone)</small>} <small>{what}</small></div>
        <div class="sel-sub">{n.requires.length ? `needs ${n.requires.join(', ')} · ` : ''}{Math.round(n.ticks / TUNING.sim.tickHz)} s <Cost c={costOf(n.cost)} /></div>
        {done ? <small>done</small> : busy ? <span class="bar"><span style={{ width: `${me.researchPermille / 10}%` }} /></span>
          : <button disabled={!ready || !!me.researching || !afford} onClick={() => game.research(n.id)} data-testid={'research-' + n.id}>Research</button>}
      </div>
    );
  };
  return (
    <div class="modal" data-testid="tech-panel"><div class="panel tech-panel">
      <div class="sel-title">Research <button onClick={() => store.set({ techOpen: false })} aria-label="Close">✕</button></div>
      {me.researching && <button onClick={() => game.cancelResearch()} data-testid="cancel-research">Cancel current research (refund)</button>}
      <h3>Shared tech</h3>
      {TECH_IDS.map((id) => row(sharedTech(id)!, TECH_NAMES[id] ?? id))}
      {race.evolution_tree.length > 0 && <h3>{race.name} evolution</h3>}
      {race.evolution_tree.map((n) => row(raceNode(race, n.id)!, n.name))}
    </div></div>
  );
}

const TECH_NAMES: Record<string, string> = { smithing: 'Smithing', toolmaking: 'Toolmaking', alloys: 'Alloys', firearms: 'Firearms', piers: 'Piers' };
export const GEAR_NAMES: Record<GearId, string> = { alloy: 'Alloy', tools: 'Tools', ironWeapons: 'Iron weapons', ironArmor: 'Iron armour', alloyWeapons: 'Alloy weapons', alloyArmor: 'Alloy armour', firearms: 'Firearms' };

/** Forge: craft buttons and the gear store. */
export function ForgePanel({ game, building }: { game: Game; building: number }) {
  const me = useStore((s) => s.me);
  useStore((s) => s.stats);
  if (!me) return null;
  const ok = unlocks(me.race, me.researched).gear;
  const smiths = raceById(me.race).special_ability === 'masterSmiths';
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
  if (!items.length && race.special_ability !== 'tunneling') return null;
  return (
    <div class="buildmenu" data-testid="race-bar">
      {items.map(([g, n]) => <button onClick={() => game.equip(GEAR_IDS.indexOf(g))} data-testid={'equip-' + g} title={`Units within ${TUNING.gear.assignRange} tiles of a forge, barracks or town get it`}>Equip {GEAR_NAMES[g]} ({n})</button>)}
      {race.special_ability === 'tunneling' && <>
        <button onClick={() => game.burrow(true)} data-testid="burrow-on">Burrow</button>
        <button onClick={() => game.burrow(false)} data-testid="burrow-off">Surface</button>
      </>}
    </div>
  );
}
