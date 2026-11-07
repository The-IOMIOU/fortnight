// Races (F-090, F-091, F-092, F-112). A race is pure data: stat modifiers plus one special ability and one
// weakness, each the id of a reusable ability module (src/sim/abilities.ts). Balance numbers of every module
// live in tuning.json → races.abilities. Point-buy rule (owner amendment 3): every power-up scores positive
// points, every power-down negative; a race is valid only when the total is exactly 0.
import { TUNING } from './core/tuning';
import { RES_NAMES, UNIT_TYPES, BUILDING_TYPES } from './defs';
import baseline from '../data/races/baseline.json' with { type: 'json' };
import deepkin from '../data/races/deepkin.json' with { type: 'json' };
import wildbond from '../data/races/wildbond.json' with { type: 'json' };
import delvers from '../data/races/delvers.json' with { type: 'json' };
import mycelids from '../data/races/mycelids.json' with { type: 'json' };
import windriders from '../data/races/windriders.json' with { type: 'json' };
import anvilborn from '../data/races/anvilborn.json' with { type: 'json' };
import fenfolk from '../data/races/fenfolk.json' with { type: 'json' };
import rimeborn from '../data/races/rimeborn.json' with { type: 'json' };
import duneraiders from '../data/races/duneraiders.json' with { type: 'json' };
import scholars from '../data/races/scholars.json' with { type: 'json' };
import treewardens from '../data/races/treewardens.json' with { type: 'json' };
import reefbuilders from '../data/races/reefbuilders.json' with { type: 'json' };

export const STAT_KEYS = ['gather_speed', 'build_speed', 'unit_health', 'unit_damage', 'vision', 'movement'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Effects a tech or evolution step can add (summed per player; percent points or flat). F-205. */
export const EFFECT_KEYS = ['farmYieldPct', 'housingPct', 'carryPlus', 'researchTimePct', 'trainTimePct', 'buildingHpPct', 'towerDamagePct', 'navalSpeedPct'] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];

export type AbilityId = keyof typeof TUNING.races.abilities;
export const ABILITY_IDS = Object.keys(TUNING.races.abilities) as AbilityId[];

export interface EvolutionNode {
  id: string;
  name: string;
  /** Research cost per resource name. */
  cost: Partial<Record<(typeof RES_NAMES)[number], number>>;
  ticks: number;
  requires: string[];
  /** Units and buildings it unlocks, extra ability modules, and permanent stat bonuses (+ percent points). */
  unlocks: { units?: string[]; buildings?: string[]; abilities?: AbilityId[]; stats?: Partial<Record<StatKey, number>>; effects?: Partial<Record<EffectKey, number>> };
  /** Evolution branch (F-207): starting a node of one branch locks the other. Nodes without a branch are open to all. */
  branch?: string;
  capstone?: boolean;
}

export interface RaceDef {
  id: string;
  name: string;
  description: string;
  /** Reference race (P-001): not counted towards the race target, may have no ability, weakness or tree. */
  reference?: boolean;
  biome_preference: string[];
  stat_modifiers: Record<StatKey, number>;
  special_ability: AbilityId | null;
  weakness: AbilityId | null;
  /** More ability modules, buffs or debuffs (made-up peoples, F-208). */
  extra_abilities?: AbilityId[];
  /** Made with the people builder (F-208): total may be below 0, at most races.custom.maxBuffs buffs. */
  custom?: boolean;
  /** Builder: the shipped people whose troops, building and evolution tree it uses. */
  base?: string;
  starting_units: Record<string, number>;
  starting_buildings: string[];
  starting_resources: Record<string, number>;
  evolution_tree: EvolutionNode[];
  unique_units: string[];
  unique_building: string | null;
  bot_hints: { personalities: string[]; strategy: string };
}

export interface RaceError { race: string; field: string; message: string }

const BIOMES = Object.keys(TUNING.biomes);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Point value of a race (F-112): stats score 1 point per `statPctPerPoint` % away from 100, abilities by data. */
export function racePoints(r: Pick<RaceDef, 'stat_modifiers' | 'special_ability' | 'weakness'> & { extra_abilities?: AbilityId[] }): number {
  const R = TUNING.races;
  let total = 0;
  for (const k of STAT_KEYS) total += Math.trunc(((r.stat_modifiers?.[k] ?? 100) - 100) / R.statPctPerPoint);
  if (r.special_ability && R.abilities[r.special_ability]) total += R.abilities[r.special_ability].points;
  if (r.weakness && R.abilities[r.weakness]) total += R.abilities[r.weakness].points;
  for (const a of r.extra_abilities ?? []) if (R.abilities[a]) total += R.abilities[a].points;
  return total;
}

/** Buffs of a people: raised stats and positive ability modules (F-208 caps this for made-up peoples). */
export function raceBuffs(r: Pick<RaceDef, 'stat_modifiers' | 'special_ability' | 'weakness'> & { extra_abilities?: AbilityId[] }): number {
  const A = TUNING.races.abilities;
  let n = STAT_KEYS.filter((k) => (r.stat_modifiers?.[k] ?? 100) > 100).length;
  for (const a of [r.special_ability, r.weakness, ...(r.extra_abilities ?? [])]) if (a && A[a] && A[a].points > 0) n++;
  return n;
}

/** Validate one race object. Every error names the race id and the field path. */
export function validateRace(raw: unknown, unitNames: readonly string[] = UNIT_TYPES, buildingNames: readonly string[] = BUILDING_TYPES): RaceError[] {
  const errs: RaceError[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id ? r.id : '<no id>';
  const err = (field: string, message: string): void => { errs.push({ race: id, field, message }); };
  const R = TUNING.races;
  const str = (f: string): void => { if (typeof r[f] !== 'string' || !(r[f] as string).length) err(f, 'must be a non-empty string'); };
  str('id'); str('name'); str('description');
  if (typeof r.id === 'string' && !/^[a-z][a-z0-9_]*$/.test(r.id)) err('id', 'must be lower-case letters, digits or _');
  const ref = r.reference === true, custom = r.custom === true;

  if (!Array.isArray(r.biome_preference) || !r.biome_preference.length) err('biome_preference', 'must be a non-empty list');
  else r.biome_preference.forEach((b, i) => { if (!BIOMES.includes(b as string)) err(`biome_preference[${i}]`, `unknown biome "${b}"`); });

  const sm = r.stat_modifiers as Record<string, unknown> | undefined;
  if (!sm || typeof sm !== 'object') err('stat_modifiers', 'missing');
  else {
    for (const k of STAT_KEYS) {
      const v = sm[k];
      if (!isInt(v)) err(`stat_modifiers.${k}`, 'must be a whole number (percent, 100 = normal)');
      else if (v < R.statMin || v > R.statMax) err(`stat_modifiers.${k}`, `must be between ${R.statMin} and ${R.statMax}`);
      else if ((v - 100) % R.statPctPerPoint) err(`stat_modifiers.${k}`, `must be a multiple of ${R.statPctPerPoint} away from 100`);
    }
    for (const k of Object.keys(sm)) if (!(STAT_KEYS as readonly string[]).includes(k)) err(`stat_modifiers.${k}`, 'unknown stat');
  }

  const abil = (f: 'special_ability' | 'weakness', sign: 1 | -1): void => {
    const v = r[f];
    if (v === null || v === undefined) { if (!ref && !custom) err(f, 'required (only reference races may leave it empty)'); return; }
    if (typeof v !== 'string' || !(ABILITY_IDS as string[]).includes(v)) { err(f, `unknown ability module "${String(v)}"`); return; }
    const pts = R.abilities[v as AbilityId].points;
    if (sign > 0 && pts <= 0) err(f, `"${v}" is a weakness module (points ${pts}), not an ability`);
    if (sign < 0 && pts >= 0) err(f, `"${v}" is an ability module (points ${pts}), not a weakness`);
  };
  abil('special_ability', 1); abil('weakness', -1);
  if (r.extra_abilities !== undefined) {
    if (!Array.isArray(r.extra_abilities)) err('extra_abilities', 'must be a list');
    else r.extra_abilities.forEach((a, i) => {
      if (!(ABILITY_IDS as string[]).includes(a)) err(`extra_abilities[${i}]`, `unknown ability module "${a}"`);
      else if ([r.special_ability, r.weakness, ...(r.extra_abilities as string[]).slice(0, i)].includes(a)) err(`extra_abilities[${i}]`, `"${a}" is listed twice`);
    });
  }

  const su = r.starting_units as Record<string, unknown> | undefined;
  if (!su || typeof su !== 'object') err('starting_units', 'missing');
  else for (const [u, n] of Object.entries(su)) {
    if (!unitNames.includes(u)) err(`starting_units.${u}`, 'unknown unit type');
    if (!isInt(n) || n < 0 || n > 20) err(`starting_units.${u}`, 'must be a whole number 0–20');
  }
  if (!Array.isArray(r.starting_buildings) || !r.starting_buildings.includes('capital')) err('starting_buildings', 'must be a list that contains "capital"');
  else r.starting_buildings.forEach((b, i) => { if (!buildingNames.includes(b as string)) err(`starting_buildings[${i}]`, `unknown building "${b}"`); });
  const sr = r.starting_resources as Record<string, unknown> | undefined;
  if (!sr || typeof sr !== 'object') err('starting_resources', 'missing');
  else for (const [k, v] of Object.entries(sr)) {
    if (!(RES_NAMES as readonly string[]).includes(k)) err(`starting_resources.${k}`, 'unknown resource');
    if (!isInt(v) || v < 0) err(`starting_resources.${k}`, 'must be a whole number ≥ 0');
  }

  const tree = r.evolution_tree;
  if (!Array.isArray(tree)) err('evolution_tree', 'must be a list');
  else {
    if (!ref && tree.length < 3) err('evolution_tree', 'needs at least 3 nodes');
    const ids = new Set<string>();
    tree.forEach((n: Record<string, unknown>, i) => {
      const f = `evolution_tree[${i}]`;
      if (typeof n?.id !== 'string' || !n.id) { err(`${f}.id`, 'must be a non-empty string'); return; }
      if (ids.has(n.id)) err(`${f}.id`, `duplicate node "${n.id}"`);
      if (typeof n.name !== 'string' || !n.name) err(`${f}.name`, 'must be a non-empty string');
      if (!isInt(n.ticks) || n.ticks <= 0) err(`${f}.ticks`, 'must be a whole number > 0');
      const c = n.cost as Record<string, unknown> | undefined;
      if (!c || typeof c !== 'object') err(`${f}.cost`, 'missing');
      else for (const [k, v] of Object.entries(c)) {
        if (!(RES_NAMES as readonly string[]).includes(k)) err(`${f}.cost.${k}`, 'unknown resource');
        if (!isInt(v) || v < 0) err(`${f}.cost.${k}`, 'must be a whole number ≥ 0');
      }
      if (!Array.isArray(n.requires)) err(`${f}.requires`, 'must be a list');
      else n.requires.forEach((q, j) => { if (!ids.has(q as string)) err(`${f}.requires[${j}]`, `"${q}" is not an earlier node`); });
      const un = n.unlocks as EvolutionNode['unlocks'] | undefined;
      if (!un || typeof un !== 'object') err(`${f}.unlocks`, 'missing');
      else {
        (un.units ?? []).forEach((u, j) => { if (!unitNames.includes(u)) err(`${f}.unlocks.units[${j}]`, `unknown unit type "${u}"`); });
        (un.buildings ?? []).forEach((b, j) => { if (!buildingNames.includes(b)) err(`${f}.unlocks.buildings[${j}]`, `unknown building "${b}"`); });
        (un.abilities ?? []).forEach((a, j) => { if (!(ABILITY_IDS as string[]).includes(a) || R.abilities[a].points <= 0) err(`${f}.unlocks.abilities[${j}]`, `"${a}" is not an ability module`); });
        for (const [k, v] of Object.entries(un.stats ?? {})) {
          if (!(STAT_KEYS as readonly string[]).includes(k)) err(`${f}.unlocks.stats.${k}`, 'unknown stat');
          else if (!isInt(v) || v < -50 || v > 50) err(`${f}.unlocks.stats.${k}`, 'must be a whole number −50…50');
        }
        for (const [k, v] of Object.entries(un.effects ?? {})) {
          if (!(EFFECT_KEYS as readonly string[]).includes(k)) err(`${f}.unlocks.effects.${k}`, 'unknown effect');
          else if (!isInt(v) || v < -50 || v > 50) err(`${f}.unlocks.effects.${k}`, 'must be a whole number −50…50');
        }
        for (const k of Object.keys(un)) if (!['units', 'buildings', 'abilities', 'stats', 'effects'].includes(k)) err(`${f}.unlocks.${k}`, 'unknown unlock kind');
      }
      if (n.branch !== undefined) {
        if (typeof n.branch !== 'string' || !n.branch) err(`${f}.branch`, 'must be a non-empty string');
        else for (const q of (n.requires as string[]) ?? []) {
          const pb = (tree as Record<string, unknown>[]).find((x) => x?.id === q)?.branch;
          if (pb !== undefined && pb !== n.branch) err(`${f}.requires`, `"${q}" is in another branch`);
        }
      }
      ids.add(n.id);
    });
    if (!ref && !tree.some((n: Record<string, unknown>) => n?.capstone === true)) err('evolution_tree', 'needs one node with "capstone": true');
    const branches = [...new Set(tree.map((n: Record<string, unknown>) => n?.branch).filter((b) => typeof b === 'string'))];
    if (branches.length && branches.length !== 2) err('evolution_tree', `needs exactly two branches or none, found ${branches.length}`);
  }

  const uu = r.unique_units;
  if (!Array.isArray(uu)) err('unique_units', 'must be a list');
  else {
    if (!ref && (uu.length < 2 || uu.length > 4)) err('unique_units', 'needs 2–4 entries');
    uu.forEach((u, i) => { if (!unitNames.includes(u as string)) err(`unique_units[${i}]`, `unknown unit type "${u}"`); });
  }
  if (r.unique_building === undefined || (r.unique_building === null && !ref)) err('unique_building', 'required');
  else if (r.unique_building !== null && !buildingNames.includes(r.unique_building as string)) err('unique_building', `unknown building "${r.unique_building}"`);

  const bh = r.bot_hints as Record<string, unknown> | undefined;
  if (!bh || typeof bh !== 'object') err('bot_hints', 'missing');
  else {
    if (!Array.isArray(bh.personalities) || !bh.personalities.length) err('bot_hints.personalities', 'must be a non-empty list');
    if (typeof bh.strategy !== 'string' || !bh.strategy) err('bot_hints.strategy', 'must be a non-empty string');
  }

  if (!errs.length) {
    const total = racePoints(r as unknown as RaceDef);
    if (custom) {
      if (total > 0) err('points', `too strong: buffs and debuffs must add up to 0 or less, this people totals +${total}`);
      const buffs = raceBuffs(r as unknown as RaceDef);
      if (buffs > R.custom.maxBuffs) err('buffs', `at most ${R.custom.maxBuffs} buffs, this people has ${buffs}`);
    } else if (total !== 0) err('points', `power-ups and power-downs must total exactly 0, this race totals ${total > 0 ? '+' : ''}${total}`);
  }
  return errs;
}

/** Validate a list of races; valid ones load, invalid ones are reported (F-091). */
export function loadRaces(raw: unknown[]): { races: RaceDef[]; errors: RaceError[] } {
  const races: RaceDef[] = [], errors: RaceError[] = [], seen = new Set<string>();
  for (const r of raw) {
    const es = validateRace(r);
    const id = (r as RaceDef)?.id;
    if (!es.length && seen.has(id)) es.push({ race: id, field: 'id', message: 'duplicate race id' });
    if (es.length) errors.push(...es); else { races.push(r as RaceDef); seen.add(id); }
  }
  return { races, errors };
}

const loaded = loadRaces([baseline, deepkin, wildbond, delvers, mycelids, windriders, anvilborn, fenfolk, rimeborn, duneraiders, scholars, treewardens, reefbuilders]);
if (loaded.errors.length) throw new Error('Invalid race data:\n' + loaded.errors.map((e) => `  race ${e.race}: ${e.field}: ${e.message}`).join('\n'));

/** All shipped races (validated at startup: an invalid file stops the game with a clear message). */
export const RACES: RaceDef[] = loaded.races;
export const raceById = (id: string | undefined): RaceDef => RACES.find((r) => r.id === id) ?? RACES[0];
/** Playable races (not the reference race). */
export const PLAYABLE_RACES = RACES.filter((r) => !r.reference);

/** Make sure these peoples exist here (made-up peoples travel inside the match settings: saves and multiplayer, F-208). */
export function ensureRaces(list: readonly RaceDef[] | undefined): RaceError[] {
  const errs: RaceError[] = [];
  for (const r of list ?? []) if (!RACES.some((x) => x.id === r.id)) errs.push(...registerRace(r));
  return errs;
}

/** Add a race at runtime (mods, tests, the future race builder). Returns the validation errors; on success the race can be chosen like a shipped one. */
export function registerRace(raw: unknown): RaceError[] {
  const { races, errors } = loadRaces([raw]);
  if (errors.length) return errors;
  if (RACES.some((r) => r.id === races[0].id)) return [{ race: races[0].id, field: 'id', message: 'duplicate race id' }];
  RACES.push(races[0]);
  if (!races[0].reference) PLAYABLE_RACES.push(races[0]);
  return [];
}
