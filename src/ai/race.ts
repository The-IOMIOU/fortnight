// Phase 5 bot behaviour: use the race (F-096 "each race plays distinctly", bots included). Reads only
// BotView and static data (races, tech, gear tables), never the sim state.
import { TUNING } from '../sim/core/tuning';
import { BUILDING_TYPES, Kind, Res, Task, UNIT_TYPES, unitDef, type BuildingTypeName, type UnitTypeName } from '../sim/defs';
import { GEAR_IDS, TECH_IDS, raceNode, sharedTech, techNode, type GearId, type ResearchDef } from '../sim/abilities';
import { raceById, type RaceDef } from '../sim/races';
import { BotView, type UnitInfo } from './view';
import type { CommandBody } from '../sim/commands';

const B = (b: BuildingTypeName): number => BUILDING_TYPES.indexOf(b);
const U = (u: UnitTypeName): number => UNIT_TYPES.indexOf(u);
const gi = (g: GearId): number => GEAR_IDS.indexOf(g);

/** Research order: the race's own steps woven between the shared techs a bot needs most (each preceded by
 *  its prerequisites, F-205), then the rest of the era tree, era by era. One evolution branch only (F-207). */
export function researchOrder(race: RaceDef): string[] {
  const branch = race.evolution_tree.find((n) => n.branch)?.branch;
  const t = race.evolution_tree.filter((n) => !n.branch || n.branch === branch).map((n) => n.id);
  const out: string[] = [];
  const add = (id: string | undefined): void => {
    if (!id || out.includes(id)) return;
    const n = techNode(id);
    if (n) n.requires.forEach(add); // prerequisites first
    else race.evolution_tree.find((x) => x.id === id)?.requires.forEach(add);
    out.push(id);
  };
  const key = race.reference ? ['agriculture', 'smithing', 'toolmaking', 'alloys', 'firearms'] : [t[0], 'agriculture', 'smithing', t[1], 'toolmaking', t[2], t[3], 'alloys', t[4], t[5], 'firearms'];
  key.forEach(add);
  t.forEach(add);
  [...TECH_IDS].sort((x, y) => (techNode(x)!.era - techNode(y)!.era)).forEach(add);
  return out;
}

export interface RaceCtx {
  v: BotView; home: number; workers: UnitInfo[]; army: UnitInfo[]; scouts: UnitInfo[]; stock: number[];
  wantArmy: boolean; minutes: number;
  /** Difficulty limits: research start, special heavy units, gear (Easy has none of the last two). */
  researchFromMin: number; heavyUnits: boolean; gear: boolean;
  cmd: (c: CommandBody) => void; pick: (workers: UnitInfo[], near: number) => number; spot: (bt: BuildingTypeName, near: number, minR: number, maxR: number) => number;
  dist: (a: number, b: number) => number; roll: (n: number) => number;
}

const affordable = (n: ResearchDef, stock: number[], reserve: number): boolean => n.cost.every((c, i) => stock[i] >= c + (c > 0 ? reserve : 0));

export function racePlan(c: RaceCtx): void {
  const { v, stock } = c;
  const race = raceById(v.race);
  const done = (id: string): boolean => v.researched.includes(id);
  // 1. research (from minute 3, keeping a reserve so the economy keeps running)
  if (!v.researching && c.minutes >= c.researchFromMin) {
    for (const id of researchOrder(race)) {
      if (done(id)) continue;
      const n = sharedTech(id) ?? raceNode(race, id);
      if (!n || !n.requires.every(done)) continue;
      if (affordable(n, stock, 60)) c.cmd({ type: 'research', node: id });
      break; // research strictly in order
    }
  }
  const mine = (bt: BuildingTypeName): boolean => v.myBuildings.some((b) => b.btype === bt);
  const unlockedB = (bt: BuildingTypeName): boolean => v.researched.some((id) => (sharedTech(id) ?? raceNode(race, id))?.buildings.includes(bt));
  const unlockedU = (u: UnitTypeName): boolean => v.researched.some((id) => (sharedTech(id) ?? raceNode(race, id))?.units.includes(u));
  // 2. the race's own building, then a forge
  for (const bt of [race.unique_building, 'forge'] as (BuildingTypeName | null)[]) {
    if (!bt || mine(bt) || !unlockedB(bt) || c.workers.length < 6) continue;
    const d = TUNING.buildingTypes[bt];
    if (stock[Res.WOOD] < d.wood + 40 || stock[Res.STONE] < d.stone) continue;
    const t = c.spot(bt, c.home, 3, 12);
    if (t >= 0) { c.cmd({ type: 'place', ids: [c.pick(c.workers, t)], btype: B(bt), tile: t }); break; }
  }
  // 3. own troops: the capstone when affordable, else the first unlocked unique unit
  const own = v.myBuildings.find((b) => b.btype === race.unique_building && b.complete && b.queue < 2);
  if (own && c.heavyUnits && c.wantArmy && v.stats.pop + 2 <= v.stats.housing) {
    const opts = race.unique_units.filter((u) => unlockedU(u as UnitTypeName)).map((u) => u as UnitTypeName).reverse();
    for (const u of opts) {
      const d = unitDef(u);
      if (stock[Res.FOOD] >= d.food + 40 && stock[Res.WOOD] >= d.wood && stock[Res.GOLD] >= d.gold) { c.cmd({ type: 'train', building: own.id, utype: U(u) }); break; }
    }
  }
  // 4. gear: keep the forge busy and hand gear out at home
  const forge = c.gear ? v.myBuildings.find((b) => b.btype === 'forge' && b.complete) : undefined;
  if (forge && forge.queue === 0) {
    const want: GearId[] = [];
    if (done('alloys')) { if (v.gear[gi('alloy')] < 2 && stock[Res.CARBON] >= 4 && stock[Res.ADAMITE] >= 2) want.push('alloy'); else want.push(c.roll(2) ? 'alloyWeapons' : 'alloyArmor'); }
    if (done('toolmaking') && c.workers.some((w) => !w.weapon) && v.gear[gi('tools')] < 2) want.unshift('tools');
    want.push(c.roll(2) ? 'ironWeapons' : 'ironArmor');
    for (const g of want) {
      const it = TUNING.gear.items[g] as unknown as Record<string, number>;
      if (stock[Res.WOOD] >= (it.wood ?? 0) + 30 && stock[Res.STONE] >= (it.stone ?? 0) && stock[Res.GOLD] >= (it.gold ?? 0) && stock[Res.CARBON] >= (it.carbon ?? 0) && stock[Res.ADAMITE] >= (it.adamite ?? 0) && v.gear[gi('alloy')] >= it.alloy) {
        c.cmd({ type: 'craft', building: forge.id, item: gi(g) }); break;
      }
    }
  }
  for (const g of GEAR_IDS) {
    if (!v.gear[gi(g)] || TUNING.gear.items[g].slot === 0) continue;
    const slot = TUNING.gear.items[g].slot, tier = TUNING.gear.items[g].tier;
    const who = slot === 3 ? c.workers.filter((u) => !u.weapon) : c.army.filter((u) => (slot === 2 ? (u.armor ?? 0) : (u.weapon ?? 0)) < tier && c.dist(u.tile, c.home) <= TUNING.gear.assignRange + 2);
    if (who.length) c.cmd({ type: 'equip', ids: who.map((u) => u.id), item: gi(g) });
  }
  // 5. abilities
  const mods = [race.special_ability, ...(race.extra_abilities ?? [])];
  if (mods.includes('tameAnimals')) {
    const idle = c.scouts.filter((s) => s.task === Task.IDLE || s.task === Task.MOVE);
    const prey = v.animals.filter((a) => a.kind === Kind.ANIMAL && c.dist(a.tile, c.home) <= 18);
    if (idle.length && prey.length) c.cmd({ type: 'tame', ids: [idle[0].id], target: prey[0].id });
  }
  if (mods.includes('tunneling')) {
    const away = c.army.filter((u) => !u.burrowed && (u.task === Task.ATTACK || u.task === Task.MOVE) && c.dist(u.tile, c.home) > 10);
    if (away.length) c.cmd({ type: 'burrow', ids: away.map((u) => u.id), on: true });
    const back = c.army.filter((u) => u.burrowed && u.task === Task.IDLE && c.dist(u.tile, c.home) <= 6);
    if (back.length) c.cmd({ type: 'burrow', ids: back.map((u) => u.id), on: false });
  }
}

/** Deepkin may only settle at night: don't waste (and blacklist) settlement sites by day. */
export const canExpandNow = (v: BotView): boolean => raceById(v.race).weakness !== 'sunburn' || v.isNight;

/** Resources set aside for the next research in order (from minute 4), so the economy doesn't spend them. */
export function researchSaving(v: BotView, minutes: number): number[] {
  const save = new Array(6).fill(0);
  if (v.researching || minutes < 4) return save;
  const race = raceById(v.race), done = (id: string): boolean => v.researched.includes(id);
  for (const id of researchOrder(race)) {
    if (done(id)) continue;
    const n = sharedTech(id) ?? raceNode(race, id);
    if (n && n.requires.every(done)) n.cost.forEach((c, i) => { save[i] = c; });
    break;
  }
  return save;
}
