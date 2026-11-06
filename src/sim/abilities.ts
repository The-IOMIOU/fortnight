// Phase 5 rules: race stats, reusable ability modules (F-092), the shared tech tree and race evolution
// (F-093, F-094), and gear (F-058). Every module is switched on by data (a race's special_ability /
// weakness, or an evolution node's unlocks.abilities); its numbers come from tuning.json → races.abilities.
// Integer math only, like the rest of the sim.
import { TUNING } from './core/tuning';
import { FP_ONE, FP_SHIFT } from './core/fixed';
import { Biome, isWaterBiome } from './world/mapgen';
import { RES_NAMES, NUM_RES, UNIT_TYPES, isBuildingKind, isUnitKind, buildingTypeOfKind, isMilitaryType, unitDef, unitTypeOfKind, type BuildingTypeName, type UnitTypeName } from './defs';
import { ABILITY_IDS, STAT_KEYS, raceById, type AbilityId, type RaceDef, type StatKey } from './races';
import type { Sim } from './sim';

export const AB = TUNING.races.abilities;
export const abilityBit = (a: AbilityId): number => 1 << ABILITY_IDS.indexOf(a);

export type TechId = keyof typeof TUNING.tech.nodes;
export const TECH_IDS = Object.keys(TUNING.tech.nodes) as TechId[];
export type GearId = keyof typeof TUNING.gear.items;
export const GEAR_IDS = Object.keys(TUNING.gear.items) as GearId[];
export const gearIndex = (g: GearId): number => GEAR_IDS.indexOf(g);

/** Units that glide (air movement class, F-081). */
export const GLIDERS: ReadonlySet<UnitTypeName> = new Set(['glider', 'skyLancer']);
/** Race units, each owned by exactly one race (the one whose tree unlocks it). */
export const RACE_UNITS: ReadonlySet<UnitTypeName> = new Set(UNIT_TYPES.slice(UNIT_TYPES.indexOf('beast')));
const COLD = new Set<number>([Biome.TUNDRA, Biome.SNOW, Biome.ICE]);
const HOT = new Set<number>([Biome.DESERT]);
const OPEN = new Set<number>([Biome.PLAINS, Biome.DESERT]);

/** A research option: a shared tech node or a node of the player's race tree. */
export interface ResearchDef { id: string; cost: number[]; ticks: number; requires: string[]; units: string[]; buildings: string[]; gear: string[]; abilities: string[]; stats: Partial<Record<StatKey, number>>; capstone: boolean; shared: boolean }

export function sharedTech(id: string): ResearchDef | null {
  const n = (TUNING.tech.nodes as unknown as Record<string, { ticks: number; requires: string[]; buildings: string[]; gear: string[] } | undefined>)[id];
  if (!n) return null;
  const cost = new Array(NUM_RES).fill(0);
  RES_NAMES.forEach((r, i) => { cost[i] = (n as unknown as Record<string, number>)[r] ?? 0; });
  return { id, cost, ticks: n.ticks, requires: n.requires as string[], units: [], buildings: n.buildings as string[], gear: n.gear as string[], abilities: [], stats: {}, capstone: false, shared: true };
}

export function raceNode(race: RaceDef, id: string): ResearchDef | null {
  const n = race.evolution_tree.find((x) => x.id === id);
  if (!n) return null;
  const cost = new Array(NUM_RES).fill(0);
  RES_NAMES.forEach((r, i) => { cost[i] = n.cost[r] ?? 0; });
  return { id, cost, ticks: n.ticks, requires: n.requires, units: n.unlocks.units ?? [], buildings: n.unlocks.buildings ?? [], gear: [], abilities: n.unlocks.abilities ?? [], stats: n.unlocks.stats ?? {}, capstone: !!n.capstone, shared: false };
}

/** Per-player race state derived from the race and what was researched (recomputed, never saved). */
export class RaceRules {
  race: RaceDef[] = [];
  /** Ability bits per player (base + unlocked). */
  abil: number[] = [];
  /** Stat percent per player and stat. */
  stat: number[][] = [];
  unitsOk: Set<string>[] = [];
  buildingsOk: Set<string>[] = [];
  gearOk: Set<string>[] = [];

  constructor(private s: Sim) {}

  refresh(p: number): void {
    const s = this.s, ps = s.ps[p], race = raceById(ps.race);
    this.race[p] = race;
    let bits = 0;
    if (race.special_ability) bits |= abilityBit(race.special_ability);
    if (race.weakness) bits |= abilityBit(race.weakness);
    const st = STAT_KEYS.map((k) => race.stat_modifiers[k]);
    const units = new Set<string>(), buildings = new Set<string>(), gear = new Set<string>();
    for (const id of ps.researched) {
      const n = this.node(p, id);
      if (!n) continue;
      n.units.forEach((u) => units.add(u)); n.buildings.forEach((b) => buildings.add(b)); n.gear.forEach((g) => gear.add(g));
      for (const a of n.abilities) bits |= abilityBit(a as AbilityId);
      for (const [k, v] of Object.entries(n.stats)) st[STAT_KEYS.indexOf(k as StatKey)] += v ?? 0;
    }
    this.abil[p] = bits; this.stat[p] = st; this.unitsOk[p] = units; this.buildingsOk[p] = buildings; this.gearOk[p] = gear;
  }

  has(p: number, a: AbilityId): boolean { return p >= 0 && p < this.s.players && (this.abil[p] & abilityBit(a)) !== 0; }
  pct(p: number, k: StatKey): number { return p >= 0 && p < this.s.players ? this.stat[p][STAT_KEYS.indexOf(k)] : 100; }

  /** A research option for player p (shared tech or own race node). */
  node(p: number, id: string): ResearchDef | null { return sharedTech(id) ?? raceNode(raceById(this.s.ps[p].race), id); }

  canResearch(p: number, id: string): string | null {
    const ps = this.s.ps[p], n = this.node(p, id);
    if (!n) return 'unknown research';
    if (ps.researched.includes(id)) return 'already researched';
    if (ps.researching) return 'already researching';
    if (!n.requires.every((q) => ps.researched.includes(q))) return 'needs earlier research';
    return null;
  }

  /** Can player p build this building type at all (tech and race)? */
  buildingAllowed(p: number, bt: BuildingTypeName): boolean {
    if (bt === 'forge' || bt === 'pier') return this.buildingsOk[p].has(bt);
    const owner = RACE_BUILDINGS.get(bt);
    if (owner) return this.race[p].unique_building === bt && this.buildingsOk[p].has(bt);
    return true;
  }
  /** Can player p train this unit type at all (race units need the race and the unlocking node)? */
  unitAllowed(p: number, u: UnitTypeName): boolean {
    if (!RACE_UNITS.has(u)) return true;
    return this.race[p].unique_units.includes(u) && this.unitsOk[p].has(u);
  }

  // ---------------------------------------------------------------- stat hooks

  /** Max HP, speed and vision of a freshly spawned (or re-equipped) unit. */
  unitStats(p: number, u: UnitTypeName): { hp: number; speed: number; vision: number } {
    const d = unitDef(u);
    let hp = Math.floor((d.hp * this.pct(p, 'unit_health')) / 100);
    let speed = Math.floor((d.speed * this.pct(p, 'movement')) / 100);
    const vision = Math.max(1, Math.floor((d.vision * this.pct(p, 'vision') + 50) / 100));
    if (d.water && this.has(p, 'poorSailors')) hp = Math.floor((hp * AB.poorSailors.navalHpPct) / 100);
    if (u === 'scout' && this.has(p, 'gliders')) speed = Math.floor((speed * AB.gliders.scoutSpeedPct) / 100);
    if (this.has(p, 'heavyFooted') && isMilitaryType(u)) speed = Math.floor((speed * AB.heavyFooted.militarySpeedPct) / 100);
    if (this.has(p, 'fragileArmy') && isMilitaryType(u)) hp = Math.floor((hp * AB.fragileArmy.militaryHpPct) / 100);
    return { hp: Math.max(1, hp), speed: Math.max(1, speed), vision };
  }

  buildingHp(p: number, bt: BuildingTypeName, base: number): number {
    let hp = base;
    if (p < this.s.players && this.has(p, 'frailBuildings')) hp = Math.floor((hp * AB.frailBuildings.hpPct) / 100);
    if (p < this.s.players && this.has(p, 'poorDefense') && (bt === 'wall' || bt === 'gate' || bt === 'tower')) hp = Math.floor((hp * AB.poorDefense.defenceHpPct) / 100);
    return Math.max(1, hp);
  }

  /** Gather / farm / build rate percent for a worker standing on tile t. */
  workPct(p: number, t: number, kind: 'gather' | 'build' | 'work', tools: boolean): number {
    let pct = this.pct(p, kind === 'build' ? 'build_speed' : 'gather_speed');
    const b = this.s.map.biome[t];
    if (kind !== 'build' && tools) pct = Math.floor((pct * TUNING.gear.toolsGatherPct) / 100);
    if (this.has(p, 'frostAdapted') && COLD.has(b) && kind !== 'build') pct = Math.floor((pct * AB.frostAdapted.coldGatherPct) / 100);
    if (this.has(p, 'heatWeak') && HOT.has(b)) pct = Math.floor((pct * AB.heatWeak.hotOutputPct) / 100);
    return pct;
  }

  trainTicks(p: number, u: UnitTypeName): number {
    const t = unitDef(u).trainTicks;
    return this.has(p, 'slowGrowth') ? Math.floor((t * AB.slowGrowth.trainTimePct) / 100) : t;
  }

  /** Damage percent from the attacker's race (stat, terrain abilities, naval weakness, ambush). */
  damagePct(a: number): number {
    const s = this.s, e = s.ents, p = e.owner[a];
    if (p >= s.players) return 100;
    let pct = 100;
    const b = s.map.biome[s.tileOf(a)];
    if (isBuildingKind(e.kind[a])) {
      if (this.has(p, 'poorDefense') && buildingTypeOfKind(e.kind[a]) === 'tower') pct = AB.poorDefense.towerAttackPct;
      return pct;
    }
    pct = this.pct(p, 'unit_damage');
    if (this.has(p, 'poorSailors') && unitDef(unitTypeOfKind(e.kind[a])).water) pct = Math.floor((pct * AB.poorSailors.navalAttackPct) / 100);
    if (this.has(p, 'openGroundWeak') && OPEN.has(b)) pct = Math.floor((pct * AB.openGroundWeak.damagePct) / 100);
    if (this.has(p, 'frostAdapted') && COLD.has(b)) pct = Math.floor((pct * AB.frostAdapted.coldDamagePct) / 100);
    if (this.has(p, 'heatWeak') && HOT.has(b)) pct = Math.floor((pct * AB.heatWeak.hotDamagePct) / 100);
    if (s.tick < e.ambushUntil[a]) pct = Math.floor((pct * AB.tunneling.ambushPct) / 100);
    if (this.has(p, 'weakLandArmy') && !unitDef(unitTypeOfKind(e.kind[a])).water) pct = Math.floor((pct * AB.weakLandArmy.landDamagePct) / 100);
    return pct;
  }

  /** Damage percent from the pair attacker → target (Phase 8): ambush on quiet targets, forest cover. */
  targetPct(a: number, t: number): number {
    const s = this.s, e = s.ents, p = e.owner[a], q = e.owner[t];
    let pct = 100;
    if (p < s.players && isUnitKind(e.kind[a]) && isUnitKind(e.kind[t]) && this.has(p, 'thieves') && s.tick - e.lastHit[t] > AB.thieves.ambushQuietTicks) pct = Math.floor((pct * AB.thieves.ambushPct) / 100);
    if (q < s.players && isUnitKind(e.kind[t]) && this.has(q, 'forestKin') && s.map.biome[s.tileOf(t)] === Biome.FOREST) pct = Math.floor((pct * AB.forestKin.forestDamageTakenPct) / 100);
    return pct;
  }

  // ---------------------------------------------------------------- movement

  /** Land path cost adjustments: returns −1 for "use the default". */
  landCost(p: number, t: number, base: number): number {
    const b = this.s.map.biome[t];
    if (this.has(p, 'amphibious') && isWaterBiome(b) && b !== Biome.ICE && !this.s.occ[t]) return AB.amphibious.waterMoveCost;
    if (base > 0 && b === Biome.SWAMP && this.has(p, 'swampStalkers')) return Math.max(1, Math.floor((base * AB.swampStalkers.swampCostPct) / 100));
    return base;
  }

  /** Movement budget divisor for a unit on its tile (10 = normal). */
  moveCostHere(id: number, t: number, base: number): number {
    const p = this.s.ents.owner[id];
    if (p >= this.s.players) return base;
    const b = this.s.map.biome[t];
    if (isWaterBiome(b) && b !== Biome.ICE && this.has(p, 'amphibious')) return Math.max(1, Math.floor((10 * 100) / AB.amphibious.waterSpeedPct));
    if (b === Biome.SWAMP && this.has(p, 'swampStalkers')) return Math.max(1, Math.floor((base * AB.swampStalkers.swampCostPct) / 100));
    return base;
  }

  /** Hidden from enemies unless they are within 2 tiles (swamp stalkers in swamp). Burrowed units are hidden completely. */
  stealthy(id: number): boolean {
    const s = this.s, e = s.ents, p = e.owner[id];
    if (!isUnitKind(e.kind[id]) || p >= s.players) return false;
    return AB.swampStalkers.swampStealth === 1 && this.has(p, 'swampStalkers') && s.map.biome[s.tileOf(id)] === Biome.SWAMP;
  }

  // ---------------------------------------------------------------- per tick

  tick(): void {
    const s = this.s, e = s.ents;
    // research
    for (let p = 0; p < s.players; p++) {
      const ps = s.ps[p];
      if (!ps.researching || ps.eliminated) continue;
      const n = this.node(p, ps.researching);
      if (!n) { ps.researching = ''; continue; }
      if (!this.hasResearchSite(p)) continue; // lost the capital: research pauses
      if (++ps.researchProgress >= this.researchTicks(p, n.ticks)) {
        ps.researched.push(ps.researching);
        const done = ps.researching;
        ps.researching = ''; ps.researchProgress = 0;
        this.refresh(p);
        this.restatUnits(p);
        s.emit(p, 'researched', TECH_IDS.indexOf(done as TechId), n.capstone ? 1 : 0);
      }
    }
    // sunburn: own units on land outside own territory take damage by day
    if (!s.isNight && s.tick % AB.sunburn.everyTicks === 0) {
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0) continue;
        const p = e.owner[id];
        if (p >= s.players || !this.has(p, 'sunburn') || e.burrowed[id]) continue;
        const t = s.tileOf(id), b = s.map.biome[t];
        if (isWaterBiome(b) || unitDef(unitTypeOfKind(e.kind[id])).water) continue;
        if (s.tileOwner[t] === p) continue;
        if (s.ps[p].opts & 16) continue; // INVULNERABLE test option
        e.hp[id] -= AB.sunburn.damage;
        e.lastHit[id] = s.tick;
      }
    }
    this.fungusTick();
    // tunnels: the unit stays underground only on tunnel-able ground
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.burrowed[id] && isWaterBiome(s.map.biome[s.tileOf(id)]) && s.map.biome[s.tileOf(id)] !== Biome.RIVER) this.surface(id);
  }

  /** Research time for player p (Scholars study faster). */
  researchTicks(p: number, ticks: number): number { return this.has(p, 'quickStudy') ? Math.max(1, Math.floor((ticks * AB.quickStudy.researchTimePct) / 100)) : ticks; }

  private hasResearchSite(p: number): boolean {
    const e = this.s.ents;
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && isBuildingKind(e.kind[id]) && e.complete[id] && buildingTypeOfKind(e.kind[id]) === TUNING.tech.researchAt) return true;
    return false;
  }

  /** Apply changed race stats (after research) to the player's existing units, keeping their HP share. */
  restatUnits(p: number): void {
    const e = this.s.ents;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] !== p || !isUnitKind(e.kind[id])) continue;
      const u = unitTypeOfKind(e.kind[id]);
      if (u === 'beast' && e.homeTile[id] === -2) continue; // tamed animals keep their own stats
      const st = this.unitStats(p, u);
      e.hp[id] = Math.max(1, Math.floor((e.hp[id] * st.hp) / Math.max(1, e.maxHp[id])));
      e.maxHp[id] = st.hp; e.vision[id] = st.vision;
      e.speed[id] = e.burrowed[id] ? Math.max(1, Math.floor((st.speed * AB.tunneling.speedPct) / 100)) : st.speed;
    }
  }

  // ---------------------------------------------------------------- tunneling

  burrow(id: number): void {
    const s = this.s, e = s.ents;
    if (e.burrowed[id] || unitDef(unitTypeOfKind(e.kind[id])).water || GLIDERS.has(unitTypeOfKind(e.kind[id]))) return;
    e.burrowed[id] = 1;
    e.speed[id] = Math.max(1, Math.floor((e.speed[id] * AB.tunneling.speedPct) / 100));
    s.fogForce[e.owner[id]] = 1;
  }
  /** Come up out of the tunnel: the next attacks within ambushTicks hit harder. Fails inside a wall or building. */
  surface(id: number): boolean {
    const s = this.s, e = s.ents;
    if (!e.burrowed[id]) return true;
    const t = s.tileOf(id);
    if (s.cost(t, e.owner[id]) === 0 && !isWaterBiome(s.map.biome[t])) return false;
    e.burrowed[id] = 0;
    e.speed[id] = this.unitStats(e.owner[id], unitTypeOfKind(e.kind[id])).speed;
    e.ambushUntil[id] = s.tick + AB.tunneling.surfaceTicks + AB.tunneling.ambushTicks;
    e.cooldown[id] = Math.max(e.cooldown[id], AB.tunneling.surfaceTicks);
    return true;
  }

  // ---------------------------------------------------------------- fungus

  /** Fungus spreads from Mycelid towns and spore towers into neighbouring land (any owner), poisons enemy units on it. */
  private fungusTick(): void {
    const s = this.s, f = s.fungus;
    if (!f) return;
    const F = AB.fungalSpread, { w, h } = s.map, e = s.ents;
    if (s.tick % F.spreadEveryTicks === 0) {
      for (let b = 0; b < e.count; b++) {
        if (!e.alive[b] || !isBuildingKind(e.kind[b]) || !e.complete[b]) continue;
        const p = e.owner[b];
        if (p >= s.players || !this.has(p, 'fungalSpread')) continue;
        const bt = buildingTypeOfKind(e.kind[b]);
        const tries = bt === 'sporeTower' ? F.towerTries : bt === 'capital' || bt === 'settlement' ? F.spreadTries : 0;
        if (!tries) continue;
        const cx = e.posX[b] >> FP_SHIFT, cy = e.posY[b] >> FP_SHIFT;
        for (let k = 0; k < tries; k++) {
          // random walk from the building over own fungus, then infect the first clean land tile
          let x = cx, y = cy;
          for (let step = 0; step < 24; step++) {
            const dir = s.rngFungus.int(4);
            x += dir === 0 ? 1 : dir === 1 ? -1 : 0; y += dir === 2 ? 1 : dir === 3 ? -1 : 0;
            if (s.wrap) x = ((x % w) + w) % w;
            if (x < 0 || y < 0 || x >= w || y >= h) break;
            const t = y * w + x;
            if (isWaterBiome(s.map.biome[t])) break;
            if (f[t] === p + 1) continue;
            if (s.burning[t]) break;
            f[t] = p + 1; s.changedTiles.push(t);
            break;
          }
        }
      }
    }
    if (s.tick % F.poisonEveryTicks === 0) {
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0 || e.burrowed[id]) continue;
        const o = e.owner[id];
        if (o >= s.players) continue;
        const q = f[s.tileOf(id)] - 1;
        if (q < 0 || q === o || !s.hostile(q, o) || (s.ps[o].opts & 16)) continue;
        e.hp[id] -= F.poisonDamage; e.lastHit[id] = s.tick;
      }
    }
    // fire burns fungus away
    for (const t of s.burningList) if (f[t]) { f[t] = 0; s.changedTiles.push(t); }
  }

  /** Farm yield percent on a tile, reduced by enemy fungus. */
  farmPct(p: number, anchor: number, size: number): number {
    const f = this.s.fungus;
    if (!f) return 100;
    const w = this.s.map.w, ax = anchor % w, ay = (anchor - ax) / w;
    let bad = 0;
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const q = f[(ay + dy) * w + ax + dx] - 1;
      if (q >= 0 && q !== p && !this.s.allied(q, p)) bad++;
    }
    return 100 - Math.floor((bad * (100 - AB.fungalSpread.farmYieldPct)) / (size * size));
  }

  // ---------------------------------------------------------------- gear

  gearCost(p: number, g: GearId): { res: number[]; alloy: number } {
    const it = TUNING.gear.items[g], pct = this.has(p, 'masterSmiths') ? AB.masterSmiths.gearCostPct : 100;
    const res = new Array(NUM_RES).fill(0);
    RES_NAMES.forEach((r, i) => { res[i] = Math.floor((((it as unknown as Record<string, number>)[r] ?? 0) * pct + 99) / 100); });
    return { res, alloy: it.alloy };
  }
  gearTier(p: number, g: GearId): number {
    const it = TUNING.gear.items[g];
    return it.tier + (it.slot === 1 || it.slot === 2 ? (this.has(p, 'masterSmiths') ? AB.masterSmiths.gearTierBonus : 0) : 0);
  }
}

/** Unique buildings and the race that owns each. */
const RACE_BUILDINGS = new Map<string, true>(['tidepool', 'beastPen', 'tunnelHall', 'sporeTower', 'aerie', 'greatForge', 'stiltHall', 'iceLodge', 'caravanserai', 'library', 'grove', 'reefDock'].map((b) => [b, true]));
export const isRaceBuilding = (bt: string): boolean => RACE_BUILDINGS.has(bt);


