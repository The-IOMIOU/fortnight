// Plain-language words for everything a people, tech or evolution step does (owner 2026-11-07: "more
// detailed and easier vocabulary on what they have as buffs or debuffs"). Used by the tech tree, the
// people picker and the people builder.
import { TUNING } from '../sim/core/tuning';
import { STAT_KEYS, type AbilityId, type EffectKey, type RaceDef, type StatKey } from '../sim/races';
import type { BuildingTypeName, UnitTypeName } from '../sim/defs';
import { BUILDING_NAMES, UNIT_NAMES } from './names';

export const ABILITY_NAME: Record<string, string> = {
  amphibious: 'Amphibious', sunburn: 'Sunburn', tameAnimals: 'Animal tamers', frailBuildings: 'Frail buildings', tunneling: 'Tunnelers',
  poorSailors: 'Poor sailors', fungalSpread: 'Fungus spread', slowGrowth: 'Slow growth', gliders: 'Gliders', poorDefense: 'Weak defences',
  masterSmiths: 'Master smiths', heavyFooted: 'Heavy feet', swampStalkers: 'Swamp stalkers', openGroundWeak: 'Weak in the open',
  frostAdapted: 'Made for the cold', heatWeak: 'Hates the heat', thieves: 'Thieves', poorFarmers: 'Bad farmers', quickStudy: 'Quick learners',
  fragileArmy: 'Fragile soldiers', forestKin: 'Forest folk', flammable: 'Burns easily', reefBuilders: 'Reef builders', weakLandArmy: 'Weak on land',
};

/** What each ability module does, in short everyday words with its numbers. */
export const ABILITY_TEXT: Record<string, string> = {
  amphibious: 'Your people can walk underwater and swim faster than they run. No boats needed to cross short seas.',
  sunburn: 'Sunlight hurts your units on land outside your borders in the day. Expand and explore at night.',
  tameAnimals: 'Scouts can tame wild animals and turn them into fighting beasts (right-click an animal).',
  frailBuildings: 'Your buildings have 30 % less health.',
  tunneling: 'Units can dig underground: hidden, they pass under walls (not water) and hit harder when they pop up.',
  poorSailors: 'Your ships have 40 % less health and hit 30 % softer.',
  fungalSpread: 'Fungus grows out of your towns. It hurts enemy units standing in it and halves enemy farm food there.',
  slowGrowth: 'Training new units takes 40 % longer.',
  gliders: 'Gliders hop over walls, water and mountains. Scouts move 30 % faster.',
  poorDefense: 'Your walls, gates and towers have 40 % less health, and towers shoot 40 % softer.',
  masterSmiths: 'Gear costs 40 % less and counts as one level better.',
  heavyFooted: 'Your soldiers walk 20 % slower.',
  swampStalkers: 'In swamps your units move fast and are hard to see.',
  openGroundWeak: 'Your soldiers hit 30 % softer on open plains and deserts.',
  frostAdapted: 'In cold lands your workers gather 30 % faster and soldiers hit 25 % harder. Ice fishing gives more food.',
  heatWeak: 'In deserts your people work 40 % slower and fight 20 % worse.',
  thieves: 'Spies steal twice as much and get caught less. Soldiers hit 30 % harder on enemies that are not fighting yet.',
  poorFarmers: 'Farms make 40 % less food.',
  quickStudy: 'Research takes 40 % less time. Spies get caught less.',
  fragileArmy: 'Soldiers have 25 % less health.',
  forestKin: 'In forests your units take 30 % less damage. Wood is gathered 30 % faster.',
  flammable: 'Fire does 2.5 times more damage to your units and buildings.',
  reefBuilders: 'You can build piers from the start, at half price.',
  weakLandArmy: 'Soldiers on land hit 25 % softer (ships are normal).',
};

const STAT_WORDS: Record<StatKey, [string, string, string, string]> = {
  // [short label, sentence start, word when higher, word when lower]
  gather_speed: ['Gathering', 'Workers gather', 'faster', 'slower'],
  build_speed: ['Building', 'Workers build', 'faster', 'slower'],
  unit_health: ['Health', 'Units have', 'more health', 'less health'],
  unit_damage: ['Damage', 'Units hit', 'harder', 'softer'],
  vision: ['Sight', 'Units see', 'further', 'less far'],
  movement: ['Speed', 'Units move', 'faster', 'slower'],
};
export const STAT_LABEL: Record<StatKey, string> = Object.fromEntries(STAT_KEYS.map((k) => [k, STAT_WORDS[k][0]])) as Record<StatKey, string>;
/** "Units hit 10 % harder" for a change of +10 points. */
export function statPhrase(k: StatKey, delta: number): string {
  const w = STAT_WORDS[k];
  return `${w[1]} ${Math.abs(delta)} % ${delta >= 0 ? w[2] : w[3]}`;
}

/** "Farms grow 15 % more food" for an effect value. Research and training times are better when negative. */
export function effectPhrase(k: EffectKey, v: number): string {
  const a = Math.abs(v), up = v >= 0;
  switch (k) {
    case 'farmYieldPct': return `Farms grow ${a} % ${up ? 'more' : 'less'} food`;
    case 'housingPct': return `Houses and towns hold ${a} % ${up ? 'more' : 'fewer'} people`;
    case 'carryPlus': return `Workers carry ${a} ${up ? 'more' : 'less'} per trip`;
    case 'researchTimePct': return `Research is ${a} % ${up ? 'slower' : 'faster'}`;
    case 'trainTimePct': return `Training is ${a} % ${up ? 'slower' : 'faster'}`;
    case 'buildingHpPct': return `Buildings have ${a} % ${up ? 'more' : 'less'} health`;
    case 'towerDamagePct': return `Towers shoot ${a} % ${up ? 'harder' : 'softer'}`;
    case 'navalSpeedPct': return `Ships sail ${a} % ${up ? 'faster' : 'slower'}`;
  }
}

export interface Unlockish { units?: string[]; buildings?: string[]; gear?: string[]; abilities?: string[]; stats?: Partial<Record<StatKey, number>>; effects?: Partial<Record<EffectKey, number>> }
const GEAR_WORDS: Record<string, string> = { alloy: 'alloy', tools: 'tools', ironWeapons: 'iron weapons', ironArmor: 'iron armour', alloyWeapons: 'alloy weapons', alloyArmor: 'alloy armour', firearms: 'guns' };
/** Everything a research step gives, as short sentences. */
export function unlockLines(u: Unlockish): string[] {
  const out: string[] = [];
  if (u.units?.length) out.push('New troops: ' + u.units.map((x) => UNIT_NAMES[x as UnitTypeName] ?? x).join(', '));
  if (u.buildings?.length) out.push('New building: ' + u.buildings.map((x) => BUILDING_NAMES[x as BuildingTypeName] ?? x).join(', '));
  if (u.gear?.length) out.push('Forge can make ' + u.gear.map((g) => GEAR_WORDS[g] ?? g).join(', '));
  for (const a of u.abilities ?? []) out.push(`${ABILITY_NAME[a] ?? a}: ${ABILITY_TEXT[a] ?? ''}`);
  for (const [k, v] of Object.entries(u.stats ?? {})) if (v) out.push(statPhrase(k as StatKey, v));
  for (const [k, v] of Object.entries(u.effects ?? {})) if (v) out.push(effectPhrase(k as EffectKey, v));
  return out;
}

export interface Trait { kind: 'buff' | 'debuff'; name: string; text: string; points: number; ability?: AbilityId; stat?: StatKey }
/** A people's buffs and debuffs with their point numbers (buffs +, debuffs −). */
export function raceTraits(r: RaceDef): Trait[] {
  const A = TUNING.races.abilities as Record<string, { points: number }>, out: Trait[] = [];
  for (const a of [r.special_ability, r.weakness, ...(r.extra_abilities ?? [])]) {
    if (!a) continue;
    const p = A[a].points;
    out.push({ kind: p > 0 ? 'buff' : 'debuff', name: ABILITY_NAME[a] ?? a, text: ABILITY_TEXT[a] ?? '', points: p, ability: a });
  }
  for (const k of STAT_KEYS) {
    const d = r.stat_modifiers[k] - 100;
    if (!d) continue;
    out.push({ kind: d > 0 ? 'buff' : 'debuff', name: `${STAT_LABEL[k]} ${d > 0 ? '+' : '−'}${Math.abs(d)} %`, text: statPhrase(k, d) + '.', points: Math.trunc(d / TUNING.races.statPctPerPoint), stat: k });
  }
  return out.sort((x, y) => y.points - x.points);
}

export const signed = (n: number): string => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0');
