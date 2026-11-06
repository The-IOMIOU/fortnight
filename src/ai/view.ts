// BotView: everything a bot may know, and nothing more (F-122).
// This is the ONLY module in src/ai that touches the Sim. Bots see:
//  - their own (and allied) units/buildings in full;
//  - other entities only when the sim says the player can see them (sim.visibleTo, the same rule
//    the renderer uses — enemy buildings are remembered once explored, units only while visible);
//  - terrain and resources from their own memory, updated only from tiles they currently see;
//  - tile ownership on explored tiles; public census numbers (same as the stats panel).
// tools/check-ai-fog.mjs fails the build if any other file in src/ai imports the sim.
import type { Sim } from '../sim/sim';
import { computeStats, type PlayerStats } from '../sim/stats';
import { FOG_UNEXPLORED } from '../sim/world/fog';
import { Biome, isWaterBiome } from '../sim/world/mapgen';
import {
  BUILDABLE, BUILDING_TYPES, FARM_YIELD, Kind, RES_NONE, buildingDef, buildingTypeOfKind, isBuildingKind, isUnitKind, type BuildingTypeName,
} from '../sim/defs';
import { FP_SHIFT } from '../sim/core/fixed';
import { TestOpt } from '../sim/sim';

export const UNKNOWN = 255;

/** Per-bot memory of the map: last seen biome and resource type of every tile. */
export interface MapMemory { biome: Uint8Array; res: Uint8Array }
export const newMapMemory = (n: number): MapMemory => ({ biome: new Uint8Array(n).fill(UNKNOWN), res: new Uint8Array(n).fill(UNKNOWN) });

export interface UnitInfo { id: number; kind: number; owner: number; tile: number; task: number; hp: number; maxHp: number; moving: boolean; carrier: number; carry: number; /** own units only: resource type carried (−1 = none) */ carryRes: number; /** own units only: entity the task is aimed at (−1 = none) */ target: number; /** own units only: underground (Delvers) */ burrowed?: boolean; /** own units only: weapon / armour tier */ weapon?: number; armor?: number }
export interface BuildingInfo { id: number; kind: number; btype: BuildingTypeName; owner: number; anchor: number; size: number; complete: boolean; level: number; hp: number; maxHp: number; queue: number; upgrading: boolean; garrison: number }

export class BotView {
  readonly w: number;
  readonly h: number;
  readonly tick: number;
  /** Globe map: x wraps (F-195). */
  readonly wrap: boolean;
  /** A player switched on the 'peaceful bots' test option: bots never start fights (F-197). */
  readonly peaceful: boolean;
  readonly stats: PlayerStats;
  readonly myUnits: UnitInfo[] = [];
  readonly myBuildings: BuildingInfo[] = [];
  readonly alliedUnits: UnitInfo[] = [];
  /** Visible (or remembered, for buildings) entities of other players. */
  readonly enemyUnits: UnitInfo[] = [];
  readonly enemyBuildings: BuildingInfo[] = [];
  /** Visible wild animals and carcasses. */
  readonly animals: UnitInfo[] = [];
  /** Phase 6: visible entities of players we are not at war with (peace, ceasefire, trade pact). */
  readonly neutralUnits: UnitInfo[] = [];
  readonly neutralBuildings: BuildingInfo[] = [];
  // ---- Phase 5: own people, research and gear (public knowledge for the player itself)
  readonly race: string;
  readonly researched: readonly string[];
  readonly researching: string;
  readonly gear: readonly number[];
  readonly isNight: boolean;

  constructor(private sim: Sim, readonly player: number, readonly mem: MapMemory) {
    const m = sim.map;
    this.w = m.w; this.h = m.h; this.tick = sim.tick; this.wrap = sim.wrap;
    this.peaceful = sim.ps.some((ps) => (ps.opts & TestOpt.PEACEFUL_BOTS) !== 0);
    const me = sim.ps[player];
    this.race = me.race; this.researched = me.researched.slice(); this.researching = me.researching; this.gear = me.gear.slice(); this.isNight = sim.isNight;
    // refresh memory from what is visible right now
    for (const t of sim.fog[player].visibleTiles()) { mem.biome[t] = m.biome[t]; mem.res[t] = sim.res.amount[t] > 0 ? sim.res.type[t] : RES_NONE; }
    this.stats = computeStats(sim, player);
    const e = sim.ents;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id]) continue;
      const k = e.kind[id], o = e.owner[id];
      const mine = o === player, ally = !mine && o < sim.players && sim.allied(o, player);
      if (!mine && !ally && !sim.visibleTo(id, player)) continue;
      if (isUnitKind(k)) {
        const u: UnitInfo = { id, kind: k, owner: o, tile: sim.tileOf(id), task: mine ? e.task[id] : 0, hp: e.hp[id], maxHp: e.maxHp[id], moving: !!e.moving[id], carrier: e.carrier[id], carry: mine ? e.carryAmt[id] : 0, carryRes: mine && e.carryAmt[id] > 0 ? e.carryType[id] : -1, target: mine ? e.taskEnt[id] : -1 };
        if (mine) { u.burrowed = !!e.burrowed[id]; u.weapon = e.weaponTier[id]; u.armor = e.armorTier[id]; }
        (mine ? this.myUnits : ally ? this.alliedUnits : sim.hostile(o, player) ? this.enemyUnits : this.neutralUnits).push(u);
      } else if (isBuildingKind(k)) {
        const bt = buildingTypeOfKind(k);
        const b: BuildingInfo = { id, kind: k, btype: bt, owner: o, anchor: e.anchor[id], size: buildingDef(bt).size, complete: !!e.complete[id], level: e.level[id], hp: e.hp[id], maxHp: e.maxHp[id], queue: e.queues[id].length, upgrading: !!e.upTo[id], garrison: mine ? sim.mil.garrisonCount(id) : 0 };
        if (mine) this.myBuildings.push(b); else if (!ally) (sim.hostile(o, player) ? this.enemyBuildings : this.neutralBuildings).push(b);
      } else if (k === Kind.ANIMAL || k === Kind.CARCASS) {
        this.animals.push({ id, kind: k, owner: o, tile: sim.tileOf(id), task: 0, hp: 0, maxHp: 0, moving: !!e.moving[id], carrier: -1, carry: e.food[id], carryRes: -1, target: -1 });
      }
    }
  }

  explored(t: number): boolean { return this.sim.fog[this.player].data[t] !== FOG_UNEXPLORED; }
  visible(t: number): boolean { return this.sim.fog[this.player].data[t] === 255; }
  /** Last seen biome, or UNKNOWN. */
  biome(t: number): number { return this.mem.biome[t]; }
  /** Last seen resource type (RES_NONE if none), or UNKNOWN. */
  resource(t: number): number { return this.mem.res[t]; }
  /** Current owner of an explored tile (255 = nobody), or −1 if unexplored. */
  owner(t: number): number { return this.explored(t) ? this.sim.tileOwner[t] : -1; }
  // ---- Phase 6 diplomacy (public: relations, reputation; private: own feelings, offers and chat addressed to us)
  relation(q: number): number { return this.sim.dip.rel(this.player, q); }
  atWar(q: number): boolean { return this.sim.hostile(this.player, q); }
  reputation(q: number): number { return this.sim.dip.st.reputation[q]; }
  feel(q: number): number { return this.sim.dip.feel(this.player, q); }
  teamOf(q: number): number { return this.sim.teamOf(q); }
  offersToMe(): import('../sim/diplomacy').Offer[] { return this.sim.dip.st.offers.filter((o) => o.to === this.player); }
  myOffers(): import('../sim/diplomacy').Offer[] { return this.sim.dip.st.offers.filter((o) => o.from === this.player); }
  chatSince(tick: number): import('../sim/diplomacy').ChatMsg[] { return this.sim.dip.st.chat.filter((m) => m.tick >= tick && m.from !== this.player && (m.to === this.player || m.to === -1)); }
  /** Census of another player (same numbers as the public stats panel). */
  strengthOf(q: number): number { return computeStats(this.sim, q).army; }
  dealValue(o: import('../sim/diplomacy').Offer): { gain: number; cost: number } { return this.sim.dip.dealValue(o); }
  isAlly(p: number): boolean { return p < this.sim.players && this.sim.allied(p, this.player); }
  get players(): number { return this.sim.players; }
  eliminated(p: number): boolean { return this.sim.ps[p].eliminated; }
  /** Land path cost from memory: unknown tiles are treated as walkable (the engine paths for real). */
  knownWalkable(t: number): boolean { const b = this.mem.biome[t]; return b === UNKNOWN || (!isWaterBiome(b) || b === Biome.RIVER); }

  /** Building placement judged from the bot's own knowledge (the sim re-checks authoritatively). */
  canPlace(bt: BuildingTypeName, anchor: number): boolean {
    const { w, h } = this, d = buildingDef(bt), ax = anchor % w, ay = (anchor - ax) / w;
    if (anchor < 0 || ax + d.size > w || ay + d.size > h || ax < 1 || ay < 1) return false;
    for (let dy = 0; dy < d.size; dy++) for (let dx = 0; dx < d.size; dx++) {
      const t = (ay + dy) * w + ax + dx, b = this.mem.biome[t];
      if (b === UNKNOWN || isWaterBiome(b) || !BUILDABLE[b] || this.mem.res[t] !== RES_NONE) return false;
      if (bt === 'farm' && FARM_YIELD[b] <= 0) return false;
      const o = this.owner(t);
      if (bt === 'settlement') { if (o !== 255) return false; }
      else if (bt === 'outpost' || bt === 'wall' || bt === 'gate' || bt === 'tower') { if (o !== 255 && o !== this.player) return false; }
      else if (o !== this.player) return false;
    }
    for (const list of [this.myBuildings, this.enemyBuildings]) for (const b of list) {
      const bx = b.anchor % w, by = (b.anchor - bx) / w;
      if (ax < bx + b.size && ax + d.size > bx && ay < by + b.size && ay + d.size > by) return false;
    }
    if (bt === 'fishingHut' || bt === 'dock' || bt === 'tidepool' || bt === 'iceLodge' || bt === 'reefDock') {
      let water = false;
      for (let dy = -1; dy <= d.size && !water; dy++) for (let dx = -1; dx <= d.size; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const b = this.mem.biome[y * w + x];
        if (b === Biome.OCEAN || b === Biome.LAKE || (b === Biome.RIVER && (bt === 'fishingHut' || bt === 'tidepool')) || (b === Biome.ICE && bt === 'iceLodge')) { water = true; break; }
      }
      if (!water) return false;
    }
    return true;
  }

  canDig(t: number): boolean {
    const b = this.mem.biome[t];
    if (b === UNKNOWN || isWaterBiome(b) || b === Biome.TRENCH || b === Biome.MOUNTAIN || b === Biome.SNOW || this.mem.res[t] !== RES_NONE) return false;
    const o = this.owner(t);
    return o === this.player;
  }

  /** Fixed-point helpers for issuing move orders. */
  static fp(t: number, w: number): [number, number] { const x = t % w; return [(x << FP_SHIFT) + 512, (((t - x) / w) << FP_SHIFT) + 512]; }
}

export { BUILDING_TYPES };
