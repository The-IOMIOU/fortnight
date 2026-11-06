// The deterministic simulation. No DOM, no wall-clock time, no Math.random, no floats in state.
// Runs identically in the Web Worker, on the main thread (tests/debug) and in Node (harness).

import { TUNING, type MapSize } from './core/tuning';
import { Hasher } from './core/hash';
import { Rng } from './core/prng';
import { FP_ONE, FP_SHIFT, isqrt, tileCenter } from './core/fixed';
import { Biome, generateMap, isWaterBiome, type GameMap } from './world/mapgen';
import { FogLayer, circleOffsets, FOG_VISIBLE, FOG_UNEXPLORED } from './world/fog';
import { animalSpawns, placeResources, type ResourceLayer } from './world/deposits';
import { Entities } from './entities/entities';
import { PathFinder, type GoalRect } from './path/astar';
import { compareCommands, type Command } from './commands';
import { FlowFields } from './path/flowfield';
import { Military, formationSlots } from './military';
import baselineRace from '../data/races/baseline.json' with { type: 'json' };
import {
  BUILDABLE, BUILDING_TYPES, DROPOFF, FARM_YIELD, Kind, MOVE_COST, NATURE_OWNER, NUM_RES, Res, RES_NONE, TICKS_PER_MIN, TOWN_CENTERS,
  TRAINS, Task, UNIT_TYPES, WALKABLE_BUILDING, WATER_COST, DEFENSIVE, buildingDef, buildingKind, buildingTypeOfKind, isBuildingKind, isUnitKind,
  unitDef, unitKind, unitTypeOfKind, upgradeDef, type BuildingTypeName, type UnitTypeName,
} from './defs';

export interface SimSettings {
  seed: string;
  size: MapSize;
  /** Number of player slots on the map (1..maxPlayers for the size). */
  players: number;
  /** Team id per player (allies share a team id). Default: everyone on their own team. */
  teams?: number[];
  /** Extra income % per player (the optional Impossible-bot bonus; 0 = none). */
  incomeBonusPct?: number[];
  /** Which victories are enabled (default: both) and the domination share in %. */
  victory?: { domination?: boolean; conquest?: boolean; dominationPct?: number };
}

export const NO_OWNER = 255;
export const RING = 60; // one-second income buckets (one minute window)

export interface PlayerState {
  stock: number[];
  /** Income ring: res * RING + bucket. */
  ring: number[];
  upkeepAcc: number;
  starving: boolean;
  pop: number;
  housing: number;
  landOwned: number;
  /** Explored deposit tiles per resource. */
  found: number[];
  foundMask: number;
  dominationTicks: number;
  housingWarned: boolean;
  seq: number;
  /** Cumulative income per resource since the start. */
  totalIncome: number[];
  /** Lost every town (Phase 3): units removed, may only spectate. */
  eliminated: boolean;
  /** Fractional income-bonus accumulator per resource (×100). */
  bonusAcc: number[];
}

export interface SimEvent { tick: number; player: number; type: string; a?: number; b?: number }

const ECO = TUNING.economy;

export class Sim {
  readonly map: GameMap;
  ents: Entities;
  readonly fog: FogLayer[];
  readonly tileOwner: Uint8Array;
  readonly res: ResourceLayer;
  /** Building id + 1 occupying each tile (0 = none). */
  readonly occ: Int32Array;
  readonly players: number;
  readonly ps: PlayerState[] = [];
  readonly totalLand: number;
  tick = 0;
  winner = -1;
  /** Winning team (−1 while undecided). */
  winnerTeam = -1;
  pending: Command[] = [];
  pathQueue: number[] = [];
  rngAnimals: Rng;
  events: SimEvent[] = [];
  /** Tiles whose biome/resource changed since last drain (render deltas). */
  changedTiles: number[] = [];
  ownerDirty = true;
  /** Tiles owned by each player (derived from tileOwner; kept for fast vision stamping). */
  ownedList: number[][] = [];
  fogForce: Uint8Array;
  private lastTile: Int32Array;
  private pf: PathFinder;
  private pfWater: PathFinder;
  /** Player whose gates count as open during the current land path search. */
  private pathPlayer = -1;
  readonly flows: FlowFields;
  readonly mil: Military;
  /** Remaining burn ticks per tile (0 = not burning) and the burning tile list. */
  burning: Uint16Array;
  burningList: number[] = [];
  rngFire: Rng;
  /** Dry trench tiles (candidates for flooding). */
  trenchList: number[] = [];
  readonly dayLength = TUNING.dayNight.dayLengthTicks;
  readonly nightStart = TUNING.dayNight.dayLengthTicks - TUNING.dayNight.nightTicks;

  constructor(readonly settings: SimSettings, opts: { skipSetup?: boolean } = {}) {
    this.map = generateMap(settings.seed, settings.size);
    const { w, h } = this.map;
    const maxP = TUNING.map.sizes[settings.size].maxPlayers;
    this.players = Math.max(1, Math.min(maxP, settings.players | 0));
    this.ents = new Entities(256);
    this.fog = [];
    this.tileOwner = new Uint8Array(w * h).fill(NO_OWNER);
    this.occ = new Int32Array(w * h);
    this.res = placeResources(this.map, this.players);
    this.rngAnimals = Rng.stream(settings.seed, 'animals');
    this.fogForce = new Uint8Array(this.players).fill(1);
    this.lastTile = new Int32Array(256).fill(-1);
    this.pf = new PathFinder(w, h, (t) => this.cost(t, this.pathPlayer));
    this.pfWater = new PathFinder(w, h, (t) => this.waterCost(t));
    this.flows = new FlowFields(w, h, TUNING.groups.flowFieldCache);
    this.burning = new Uint16Array(w * h);
    this.rngFire = Rng.stream(settings.seed, 'fire');
    this.mil = new Military(this);
    let land = 0;
    for (let i = 0; i < w * h; i++) if (!isWaterBiome(this.map.biome[i])) land++;
    this.totalLand = land;
    for (let p = 0; p < this.players; p++) {
      this.fog.push(new FogLayer(w, h));
      this.ownedList.push([]);
      this.ps.push({
        stock: new Array(NUM_RES).fill(0), ring: new Array(NUM_RES * RING).fill(0), upkeepAcc: 0, starving: false, pop: 0, housing: 0,
        landOwned: 0, found: new Array(NUM_RES).fill(0), foundMask: 0, dominationTicks: 0, housingWarned: false, seq: 0,
        totalIncome: new Array(NUM_RES).fill(0), eliminated: false, bonusAcc: new Array(NUM_RES).fill(0),
      });
    }
    if (opts.skipSetup) return;
    this.setupStart();
    this.recount();
    this.updateFog();
    this.events.length = 0;
  }

  // ------------------------------------------------------------------ setup

  private setupStart(): void {
    const { w } = this.map;
    const race = baselineRace;
    for (let p = 0; p < this.players; p++) {
      const s = this.map.starts[p], sx = s % w, sy = (s - sx) / w;
      // make sure the capital footprint is solid buildable ground
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = (sy + dy) * w + (sx + dx);
        if (isWaterBiome(this.map.biome[t]) || !BUILDABLE[this.map.biome[t]]) this.setBiome(t, Biome.PLAINS);
      }
      const st = this.ps[p].stock;
      Object.entries(race.starting_resources).forEach(([k, v]) => { st[resIndex(k)] = v; });
      const cap = this.createBuilding(p, 'capital', (sy - 1) * w + (sx - 1), true);
      for (const [u, n] of Object.entries(race.starting_units)) for (let k = 0; k < n; k++) this.spawnUnitNear(p, u as UnitTypeName, cap);
    }
    for (const t of animalSpawns(this.map, this.players, this.res)) {
      const x = t % w, y = (t - x) / w;
      const id = this.ents.spawn(Kind.ANIMAL, NATURE_OWNER, tileCenter(x), tileCenter(y), TUNING.animals.speed, 0);
      this.ents.food[id] = TUNING.animals.food;
      this.ents.homeTile[id] = t;
    }
  }

  // ------------------------------------------------------------------ tiles

  /** Land path cost of entering a tile for player p (gates open only for their owner); 0 = impassable. */
  cost(t: number, p = -1): number {
    const b = this.map.biome[t];
    if (isWaterBiome(b) && b !== Biome.RIVER) return 0;
    const o = this.occ[t];
    if (o) {
      const bt = buildingTypeOfKind(this.ents.kind[o - 1]);
      if (bt === 'gate') return p >= 0 && p < this.players && this.allied(this.ents.owner[o - 1], p) && this.ents.complete[o - 1] ? 10 : 0;
      if (!WALKABLE_BUILDING[bt]) return 0;
    }
    const rt = this.res.type[t];
    if (rt !== RES_NONE && rt !== Res.WOOD && this.res.amount[t] > 0) return 0;
    return MOVE_COST[b];
  }

  /** Ship path cost: open water only. */
  waterCost(t: number): number { return this.occ[t] ? 0 : WATER_COST[this.map.biome[t]]; }
  isNaval(id: number): boolean { return isUnitKind(this.ents.kind[id]) && unitDef(unitTypeOfKind(this.ents.kind[id])).water === 1; }
  /** Cost of entering tile t for unit id. */
  costFor(id: number, t: number): number { return this.isNaval(id) ? this.waterCost(t) : this.cost(t, this.ents.owner[id]); }

  tileOf(id: number): number { return (this.ents.posY[id] >> FP_SHIFT) * this.map.w + (this.ents.posX[id] >> FP_SHIFT); }

  setBiome(t: number, b: number): void {
    if (this.map.biome[t] === b) return;
    this.map.biome[t] = b;
    this.changedTiles.push(t);
    this.flows?.clear();
  }

  /** Remove resource from a tile; forests become plains when cut down. */
  depleteTile(t: number): void {
    if (this.res.type[t] === Res.WOOD) this.setBiome(t, Biome.PLAINS);
    this.res.type[t] = RES_NONE; this.res.amount[t] = 0;
    this.changedTiles.push(t);
    this.flows?.clear();
  }

  // ------------------------------------------------------------------ buildings

  footprintRect(id: number, margin = 0): GoalRect {
    const e = this.ents, a = e.anchor[id], w = this.map.w, s = buildingDef(buildingTypeOfKind(e.kind[id])).size;
    const x = a % w, y = (a - x) / w;
    return { x0: x - margin, y0: y - margin, x1: x + s - 1 + margin, y1: y + s - 1 + margin };
  }

  /** Why a building can't go here (null = OK). */
  canPlace(p: number, bt: BuildingTypeName, anchor: number): string | null {
    const { w, h, biome } = this.map, d = buildingDef(bt);
    const ax = anchor % w, ay = (anchor - ax) / w;
    if (anchor < 0 || ax + d.size > w || ay + d.size > h) return 'outside map';
    let nearWater = false, nearOwn = false;
    for (let dy = 0; dy < d.size; dy++) for (let dx = 0; dx < d.size; dx++) {
      const t = (ay + dy) * w + (ax + dx), b = biome[t];
      if (isWaterBiome(b) || !BUILDABLE[b]) return 'terrain';
      if (this.occ[t]) return 'occupied';
      if (this.res.type[t] !== RES_NONE && this.res.amount[t] > 0) return 'resource in the way';
      if (bt === 'farm' && FARM_YIELD[b] <= 0) return 'cannot farm here';
      const o = this.tileOwner[t];
      if (bt === 'settlement') { if (o !== NO_OWNER) return 'land already claimed'; }
      else if (bt === 'outpost' || DEFENSIVE[bt]) { if (o !== NO_OWNER && o !== p) return 'enemy land'; }
      else if (o !== p) return 'outside your territory';
    }
    for (let dy = -1; dy <= d.size; dy++) for (let dx = -1; dx <= d.size; dx++) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const t = y * w + x, b = biome[t];
      if (b === Biome.OCEAN || b === Biome.LAKE || b === Biome.RIVER) nearWater = true;
    }
    if (bt === 'fishingHut' && !nearWater) return 'must be next to water';
    if (bt === 'dock') {
      let sea = false;
      for (let dy = -1; dy <= d.size && !sea; dy++) for (let dx = -1; dx <= d.size; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && (biome[y * w + x] === Biome.OCEAN || biome[y * w + x] === Biome.LAKE)) { sea = true; break; }
      }
      if (!sea) return 'must be next to the sea or a lake';
    }
    if (bt === 'outpost' || DEFENSIVE[bt]) {
      const r = ECO.outpostReachOutsideTerritory;
      for (let dy = -r; dy < d.size + r && !nearOwn; dy++) for (let dx = -r; dx < d.size + r; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && this.tileOwner[y * w + x] === p) { nearOwn = true; break; }
      }
      if (!nearOwn) return 'too far from your territory';
    }
    if (bt === 'settlement') {
      const md = ECO.settlementMinDistance, e = this.ents;
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || !isBuildingKind(e.kind[id]) || !TOWN_CENTERS.includes(buildingTypeOfKind(e.kind[id]))) continue;
        const dx = (e.posX[id] >> FP_SHIFT) - ax, dy = (e.posY[id] >> FP_SHIFT) - ay;
        if (dx * dx + dy * dy < md * md) return 'too close to another town';
      }
    }
    return null;
  }

  createBuilding(p: number, bt: BuildingTypeName, anchor: number, complete: boolean): number {
    const { w } = this.map, d = buildingDef(bt);
    const ax = anchor % w, ay = (anchor - ax) / w;
    const cx = (ax << FP_SHIFT) + ((d.size << FP_SHIFT) >> 1), cy = (ay << FP_SHIFT) + ((d.size << FP_SHIFT) >> 1);
    const id = this.ents.spawn(buildingKind(bt), p, cx, cy, 0, d.vision);
    const e = this.ents;
    e.anchor[id] = anchor; e.level[id] = 1; e.btype[id] = BUILDING_TYPES.indexOf(bt);
    e.maxHp[id] = d.hp; e.hp[id] = complete ? d.hp : Math.max(1, Math.floor(d.hp / 10));
    const footprint: number[] = [];
    let yieldSum = 0, water = 0;
    for (let dy = 0; dy < d.size; dy++) for (let dx = 0; dx < d.size; dx++) {
      const t = (ay + dy) * w + (ax + dx);
      if (this.res.type[t] !== RES_NONE) this.depleteTile(t); // starting capital may sit on trees
      this.occ[t] = id + 1;
      footprint.push(t);
      yieldSum += FARM_YIELD[this.map.biome[t]];
    }
    if (bt === 'farm') e.yieldPct[id] = Math.floor(yieldSum / (d.size * d.size));
    if (bt === 'fishingHut') {
      const off = circleOffsets(3);
      for (let k = 0; k < off.length; k += 2) {
        const x = ax + off[k], y = ay + off[k + 1];
        if (x < 0 || y < 0 || x >= w || y >= this.map.h) continue;
        const b = this.map.biome[y * w + x];
        if (b === Biome.OCEAN || b === Biome.LAKE || b === Biome.RIVER) water++;
      }
      e.yieldPct[id] = Math.min(100, Math.floor((water * 100) / ECO.fishWaterTilesForFull));
    }
    this.fogForce[p] = 1;
    if (complete) this.completeBuilding(id, false);
    if (this.mil) this.mil.onTerrainChanged(footprint);
    return id;
  }

  completeBuilding(id: number, announce = true): void {
    const e = this.ents, p = e.owner[id], bt = buildingTypeOfKind(e.kind[id]);
    e.complete[id] = 1; e.progress[id] = buildingDef(bt).buildPoints; e.hp[id] = e.maxHp[id];
    this.flows?.clear();
    this.claimAround(id);
    this.fogForce[p] = 1;
    if (announce) this.emit(p, 'built', e.btype[id], id);
  }

  /** Territory radius for a building at its current level. */
  territoryRadius(id: number): number {
    const e = this.ents, bt = buildingTypeOfKind(e.kind[id]);
    let r = buildingDef(bt).territory;
    if (r === 0) return 0;
    for (let l = 2; l <= e.level[id]; l++) r += upgradeDef(bt, l)?.territory ?? 0;
    return r;
  }
  housingOf(id: number): number {
    const e = this.ents, bt = buildingTypeOfKind(e.kind[id]);
    let hs = buildingDef(bt).housing;
    for (let l = 2; l <= e.level[id]; l++) hs += upgradeDef(bt, l)?.housing ?? 0;
    return hs;
  }

  claimAround(id: number): void {
    const r = this.territoryRadius(id);
    if (r <= 0) return;
    const e = this.ents, p = e.owner[id], { w, h } = this.map;
    const cx = e.posX[id] >> FP_SHIFT, cy = e.posY[id] >> FP_SHIFT;
    const off = circleOffsets(r);
    let gained = 0;
    for (let k = 0; k < off.length; k += 2) {
      const x = cx + off[k], y = cy + off[k + 1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const t = y * w + x;
      if (this.tileOwner[t] !== NO_OWNER || isWaterBiome(this.map.biome[t])) continue;
      this.tileOwner[t] = p; this.ps[p].landOwned++; this.ownedList[p].push(t); gained++;
    }
    if (gained) { this.ownerDirty = true; this.fogForce[p] = 1; }
  }

  // ------------------------------------------------------------------ units

  spawnUnitNear(p: number, u: UnitTypeName, buildingId: number): number {
    const d = unitDef(u), r0 = this.footprintRect(buildingId, 1), { w, h } = this.map;
    let tile = -1;
    for (let m = 1; m <= 6 && tile < 0; m++) {
      const r = { x0: r0.x0 - (m - 1), y0: r0.y0 - (m - 1), x1: r0.x1 + (m - 1), y1: r0.y1 + (m - 1) };
      for (let y = r.y0; y <= r.y1 && tile < 0; y++) for (let x = r.x0; x <= r.x1; x++) {
        if (x !== r.x0 && x !== r.x1 && y !== r.y0 && y !== r.y1) continue;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = y * w + x;
        if ((d.water ? this.waterCost(t) : this.cost(t, p)) > 0 && !this.unitOnTile(t)) { tile = t; break; }
      }
    }
    if (tile < 0) tile = this.ents.anchor[buildingId];
    const x = tile % w, y = (tile - x) / w;
    const id = this.ents.spawn(unitKind(u), p, tileCenter(x), tileCenter(y), d.speed, d.vision);
    this.ents.hp[id] = this.ents.maxHp[id] = d.hp;
    this.ents.morale[id] = TUNING.morale.max;
    this.ensureLastTile();
    return id;
  }

  /** Spawn a unit on a tile (setup, tests, transports unloading). */
  spawnUnitAt(p: number, u: UnitTypeName, tile: number): number {
    const d = unitDef(u), x = tile % this.map.w, y = (tile - x) / this.map.w;
    const id = this.ents.spawn(unitKind(u), p, tileCenter(x), tileCenter(y), d.speed, d.vision);
    this.ents.hp[id] = this.ents.maxHp[id] = d.hp;
    this.ents.morale[id] = TUNING.morale.max;
    this.ensureLastTile();
    if (p < this.players) this.fogForce[p] = 1;
    return id;
  }

  private unitOnTile(t: number): boolean {
    const e = this.ents;
    for (let id = 0; id < e.count; id++) if (e.alive[id] && isUnitKind(e.kind[id]) && this.tileOf(id) === t) return true;
    return false;
  }

  private ensureLastTile(): void {
    if (this.lastTile.length < this.ents.capacity) {
      const b = new Int32Array(this.ents.capacity).fill(-1); b.set(this.lastTile); this.lastTile = b;
    }
  }

  /** Ask for a path to `rect` (processed in deterministic FIFO order, budgeted per tick). */
  goTo(id: number, rect: GoalRect, finX = -1, finY = -1): void {
    const e = this.ents;
    e.gx0[id] = rect.x0; e.gy0[id] = rect.y0; e.gx1[id] = rect.x1; e.gy1[id] = rect.y1;
    e.hasFinal[id] = finX >= 0 ? 1 : 0; e.finX[id] = finX; e.finY[id] = finY;
    e.paths[id] = null; e.moving[id] = 0;
    if (!e.waitPath[id]) { e.waitPath[id] = 1; this.pathQueue.push(id); }
  }

  stop(id: number): void {
    const e = this.ents;
    e.task[id] = Task.IDLE; e.phase[id] = 0; e.moving[id] = 0; e.paths[id] = null; e.taskEnt[id] = -1; e.srcEnt[id] = -1;
    if (e.waitPath[id]) { e.waitPath[id] = 0; this.pathQueue = this.pathQueue.filter((q) => q !== id); }
  }

  tileRectAround(t: number, margin = 1): GoalRect { const w = this.map.w, x = t % w, y = (t - x) / w; return { x0: x - margin, y0: y - margin, x1: x + margin, y1: y + margin }; }

  /** First free tile in rings around a rectangle (land or water class). */
  freeTileNear(r0: GoalRect, water: boolean): number {
    const { w, h } = this.map;
    for (let m = 0; m <= 8; m++) {
      const r = { x0: r0.x0 - m, y0: r0.y0 - m, x1: r0.x1 + m, y1: r0.y1 + m };
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
        if (x !== r.x0 && x !== r.x1 && y !== r.y0 && y !== r.y1) continue;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = y * w + x;
        if ((water ? this.waterCost(t) : this.cost(t)) > 0) return t;
      }
    }
    return Math.max(0, r0.y0) * w + Math.max(0, r0.x0);
  }

  private processPaths(): void {
    const budget = 24, e = this.ents;
    let n = 0;
    while (this.pathQueue.length && n < budget) {
      const id = this.pathQueue.shift()!;
      if (!e.alive[id] || !e.waitPath[id]) continue;
      e.waitPath[id] = 0;
      n++;
      const goal = { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] };
      let path: number[] | null;
      if (this.isNaval(id)) path = this.pfWater.find(this.tileOf(id), goal);
      else {
        this.pathPlayer = e.owner[id];
        // chases are re-planned often: cap their search so unreachable targets fail fast
        path = this.pf.find(this.tileOf(id), goal, e.task[id] === Task.ATTACK ? { maxNodes: 6000 } : {});
        this.pathPlayer = -1;
      }
      if (!path) {
        // unreachable (e.g. on another continent): hunters keep trying, everyone else gives up
        if (e.task[id] === Task.HUNT) { e.repathAt[id] = this.tick + 30; e.moving[id] = 0; }
        else if (e.task[id] === Task.ATTACK) this.mil.onAttackPathFailed(id);
        // home unreachable (e.g. on another continent): stand fast, try again in 10 s
        else if (e.task[id] === Task.ROUT || e.task[id] === Task.RETREAT) { e.repathAt[id] = this.tick + 100; e.moving[id] = 0; }
        else { this.emit(e.owner[id], 'unreachable', id); this.stop(id); }
        continue;
      }
      e.paths[id] = path; e.pathIdx[id] = 0; e.moving[id] = path.length > 0 || e.hasFinal[id] ? 1 : 0;
    }
  }

  arrived(id: number): boolean {
    const e = this.ents, t = this.tileOf(id), x = t % this.map.w, y = (t - x) / this.map.w;
    return x >= e.gx0[id] && x <= e.gx1[id] && y >= e.gy0[id] && y <= e.gy1[id] && !e.moving[id];
  }

  private moveUnits(): void {
    const e = this.ents, w = this.map.w;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || !e.moving[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0) continue;
      // Movement budget for this tick depends on the terrain the unit starts the tick on.
      const mc = this.isNaval(id) ? 10 : MOVE_COST[this.map.biome[this.tileOf(id)]] || 10;
      let budget = Math.max(1, Math.floor((e.speed[id] * 10) / mc));
      // Spend the budget along the path; leftover carries past waypoints within the same tick.
      for (let guard = 0; guard < 8 && budget > 0 && e.moving[id]; guard++) {
        if (e.flowGoal[id] >= 0 && (!e.paths[id] || e.pathIdx[id] >= e.paths[id]!.length) && !this.flowStep(id)) break;
        const path = e.paths[id];
        let tx: number, ty: number;
        const last = !path || e.pathIdx[id] >= path.length;
        if (last) {
          if (!e.hasFinal[id]) { e.moving[id] = 0; e.paths[id] = null; break; }
          tx = e.finX[id]; ty = e.finY[id];
        } else {
          const t = path![e.pathIdx[id]];
          if (this.costFor(id, t) === 0) { // something was built in the way: ask for a new path
            this.goTo(id, { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] }, e.hasFinal[id] ? e.finX[id] : -1, e.finY[id]);
            break;
          }
          const x = t % w;
          tx = tileCenter(x); ty = tileCenter((t - x) / w);
          if (e.pathIdx[id] === path!.length - 1 && e.hasFinal[id]) { tx = e.finX[id]; ty = e.finY[id]; }
        }
        const dx = tx - e.posX[id], dy = ty - e.posY[id];
        const dist = isqrt(dx * dx + dy * dy);
        if (dist > budget) { e.posX[id] += Math.trunc((dx * budget) / dist); e.posY[id] += Math.trunc((dy * budget) / dist); break; }
        e.posX[id] = tx; e.posY[id] = ty;
        budget -= dist;
        if (last) { e.moving[id] = 0; e.paths[id] = null; break; }
        e.pathIdx[id]++;
        if (e.flowGoal[id] >= 0) continue; // next flow-field step
        if (e.pathIdx[id] >= path!.length && !(e.hasFinal[id] && (tx !== e.finX[id] || ty !== e.finY[id]))) { e.moving[id] = 0; e.paths[id] = null; }
      }
    }
  }

  /** Advance a flow-field unit by one tile (returns false when it stopped). Near its slot it switches to A*. */
  private flowStep(id: number): boolean {
    const e = this.ents, w = this.map.w, here = this.tileOf(id);
    const gt = e.gy0[id] * w + e.gx0[id], x = here % w, y = (here - x) / w;
    if (Math.max(Math.abs(x - e.gx0[id]), Math.abs(y - e.gy0[id])) <= 3) {
      e.flowGoal[id] = -1;
      this.goTo(id, { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] }, e.hasFinal[id] ? e.finX[id] : -1, e.finY[id]);
      return false;
    }
    const p = e.owner[id];
    const field = this.flows.get(e.flowGoal[id], 'L' + p, (t) => this.cost(t, p));
    const nxt = FlowFields.next(field, here, w, this.map.h, (t) => this.cost(t, p));
    if (nxt < 0) { e.flowGoal[id] = -1; this.goTo(id, { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] }, e.hasFinal[id] ? e.finX[id] : -1, e.finY[id]); return false; }
    e.paths[id] = [nxt]; e.pathIdx[id] = 0;
    void gt;
    return true;
  }

  // ------------------------------------------------------------------ commands

  /** Queue a command. Commands for past ticks are rejected (returns false). */
  enqueue(cmd: Command): boolean {
    if (cmd.tick < this.tick) return false;
    let i = this.pending.length;
    while (i > 0 && compareCommands(this.pending[i - 1], cmd) > 0) i--;
    this.pending.splice(i, 0, cmd);
    return true;
  }
  get pendingCommands(): readonly Command[] { return this.pending; }

  ownUnits(p: number, ids: number[], filter?: (k: number) => boolean): number[] {
    const e = this.ents, out: number[] = [];
    for (const id of ids) {
      if (id < 0 || id >= e.count || !e.alive[id] || e.owner[id] !== p || !isUnitKind(e.kind[id])) continue;
      if (filter && !filter(e.kind[id])) continue;
      if (!out.includes(id)) out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  canAfford(p: number, cost: number[]): boolean { return cost.every((c, r) => this.ps[p].stock[r] >= c); }
  pay(p: number, cost: number[], sign = 1): void { cost.forEach((c, r) => { this.ps[p].stock[r] -= sign * c; }); }

  private apply(c: Command): void {
    const e = this.ents, { w, h } = this.map, p = c.player;
    if (p < 0 || p >= this.players || this.ps[p].eliminated) return;
    if (this.mil.apply(c)) return;
    switch (c.type) {
      case 'move': {
        let x = Math.max(0, Math.min(w * FP_ONE - 1, c.x | 0)), y = Math.max(0, Math.min(h * FP_ONE - 1, c.y | 0));
        const raw = (y >> FP_SHIFT) * w + (x >> FP_SHIFT);
        let t = raw;
        const all = this.ownUnits(p, c.ids);
        // ships sail to the clicked water tile (or the nearest water to it)
        const ships = all.filter((id) => this.isNaval(id));
        if (ships.length) {
          const st = this.waterCost(raw) > 0 ? raw : this.nearestWater(raw, 12);
          if (st >= 0) for (const id of ships) { const [sx, sy] = Sim.tileCenterFp(st, w); this.stop(id); e.task[id] = Task.MOVE; this.goTo(id, this.tileRectAround(st, 0), sx, sy); }
        }
        const units = all.filter((id) => !this.isNaval(id));
        if (!units.length) break;
        if (this.cost(t, p) === 0) {
          // clicked on water/rock: head for the nearest walkable tile instead
          const near = this.nearestPassable(t, 8, p);
          if (near < 0) return;
          t = near; [x, y] = Sim.tileCenterFp(t, w);
        }
        if (units.length <= 1) {
          for (const id of units) { this.stop(id); e.task[id] = Task.MOVE; this.goTo(id, this.tileRectAround(t, 0), x, y); }
          break;
        }
        // groups: formation slots; big land groups share a flow field to the centre
        const slots = formationSlots(this, units, t, c.formation === 'line');
        const land = units.filter((id) => !this.isNaval(id));
        const useFlow = land.length >= TUNING.groups.flowFieldMinUnits;
        const used = new Set<number>();
        units.forEach((id, i) => {
          let slot = slots[i];
          if (!this.isNaval(id) && (this.costFor(id, slot) === 0 || used.has(slot))) { const n = this.nearestFree(slot, 6, p, used); if (n >= 0) slot = n; }
          used.add(slot);
          const [sx, sy] = Sim.tileCenterFp(slot, w);
          this.stop(id); e.task[id] = Task.MOVE;
          this.goTo(id, this.tileRectAround(slot, 0), sx, sy);
          if (useFlow && !this.isNaval(id)) {
            // skip A*: follow the shared field until close to the slot
            e.waitPath[id] = 0; this.pathQueue = this.pathQueue.filter((q) => q !== id);
            e.flowGoal[id] = t; e.paths[id] = null; e.moving[id] = 1;
          }
        });
        break;
      }
      case 'gather': {
        const t = c.tile;
        if (t < 0 || t >= w * h || this.res.type[t] === RES_NONE || this.res.amount[t] <= 0) return;
        for (const id of this.ownUnits(p, c.ids, (k) => k === Kind.WORKER)) this.startGather(id, t);
        break;
      }
      case 'interact': {
        const tg = c.target;
        if (tg < 0 || tg >= e.count || !e.alive[tg]) return;
        if (this.mil.interact(p, c.ids, tg)) return;
        const k = e.kind[tg];
        const workers = this.ownUnits(p, c.ids, (kk) => kk === Kind.WORKER);
        if (k === Kind.ANIMAL) for (const id of workers) { this.stop(id); e.task[id] = Task.HUNT; e.taskEnt[id] = tg; this.goTo(id, this.tileRectAround(this.tileOf(tg))); }
        else if (k === Kind.CARCASS) for (const id of workers) this.startGatherCarcass(id, tg);
        else if (isBuildingKind(k) && e.owner[tg] === p) {
          const bt = buildingTypeOfKind(k), def = buildingDef(bt);
          for (const id of workers) {
            if (!e.complete[tg]) { this.stop(id); e.task[id] = Task.BUILD; e.taskEnt[id] = tg; this.goTo(id, this.footprintRect(tg, 1)); }
            else if (def.maxWorkers && this.workersAt(tg) < def.maxWorkers) { this.stop(id); e.task[id] = Task.WORK; e.taskEnt[id] = tg; this.goTo(id, this.footprintRect(tg, 1)); }
            else if (e.carryAmt[id] > 0 && DROPOFF[bt]?.includes(e.carryType[id])) { const keepTile = e.taskTile[id]; this.stop(id); e.taskTile[id] = keepTile; e.task[id] = Task.RETURN; e.taskEnt[id] = tg; this.goTo(id, this.footprintRect(tg, 1)); }
          }
        }
        break;
      }
      case 'place': {
        const bt = BUILDING_TYPES[c.btype];
        if (!bt || bt === 'capital') return;
        if (bt === 'settlement') {
          const settlers = this.ownUnits(p, c.ids, (k) => k === Kind.SETTLER);
          if (!settlers.length) return;
          const why = this.canPlace(p, bt, c.tile);
          if (why) { this.emit(p, 'cantPlace', c.btype); return; }
          const id = settlers[0];
          this.stop(id); e.task[id] = Task.SETTLE; e.taskTile[id] = c.tile;
          this.goTo(id, this.tileRectAround(c.tile));
          return;
        }
        const d = buildingDef(bt), cost = costOf(d.wood, d.stone, 0, 0);
        const why = this.canPlace(p, bt, c.tile);
        if (why) { this.emit(p, 'cantPlace', c.btype); return; }
        if (!this.canAfford(p, cost)) { this.emit(p, 'cantAfford', c.btype); return; }
        this.pay(p, cost);
        const b = this.createBuilding(p, bt, c.tile, false);
        for (const id of this.ownUnits(p, c.ids, (k) => k === Kind.WORKER)) { this.stop(id); e.task[id] = Task.BUILD; e.taskEnt[id] = b; this.goTo(id, this.footprintRect(b, 1)); }
        break;
      }
      case 'train': {
        const b = c.building, ut = UNIT_TYPES[c.utype];
        if (!ut || b < 0 || b >= e.count || !e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b]) || !e.complete[b]) return;
        if (!TRAINS[buildingTypeOfKind(e.kind[b])]?.includes(ut)) return;
        if (e.queues[b].length >= ECO.trainQueueMax) return;
        const d = unitDef(ut), cost = costOf(d.wood, 0, 0, d.food);
        if (!this.canAfford(p, cost)) { this.emit(p, 'cantAfford', -1); return; }
        this.pay(p, cost);
        e.queues[b].push(c.utype);
        break;
      }
      case 'cancelTrain': {
        const b = c.building;
        if (b < 0 || b >= e.count || !e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b])) return;
        const q = e.queues[b];
        if (c.index < 0 || c.index >= q.length) return;
        const d = unitDef(UNIT_TYPES[q[c.index]]);
        this.pay(p, costOf(d.wood, 0, 0, d.food), -1);
        q.splice(c.index, 1);
        if (c.index === 0) e.trainProgress[b] = 0;
        break;
      }
      case 'upgrade': {
        const b = c.building;
        if (b < 0 || b >= e.count || !e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b]) || !e.complete[b] || e.upTo[b]) return;
        const u = upgradeDef(buildingTypeOfKind(e.kind[b]), e.level[b] + 1);
        if (!u) return;
        const cost = costOf(u.wood, u.stone, u.gold, 0);
        if (!this.canAfford(p, cost)) { this.emit(p, 'cantAfford', -1); return; }
        this.pay(p, cost);
        e.upTo[b] = e.level[b] + 1; e.upProgress[b] = 0;
        break;
      }
    }
  }


  workersAt(b: number): number {
    const e = this.ents;
    let n = 0;
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.task[id] === Task.WORK && e.taskEnt[id] === b) n++;
    return n;
  }

  startGather(id: number, t: number): void {
    const e = this.ents;
    const carryKeep = e.carryType[id] === this.res.type[t] ? e.carryAmt[id] : 0;
    this.stop(id);
    e.task[id] = Task.GATHER; e.taskTile[id] = t; e.carryAmt[id] = carryKeep; e.carryType[id] = this.res.type[t];
    this.goTo(id, this.tileRectAround(t));
  }
  private startGatherCarcass(id: number, c: number): void {
    const e = this.ents;
    const keep = e.carryType[id] === Res.FOOD ? e.carryAmt[id] : 0;
    this.stop(id);
    e.task[id] = Task.GATHER; e.taskTile[id] = -1; e.srcEnt[id] = c; e.carryAmt[id] = keep; e.carryType[id] = Res.FOOD;
    this.goTo(id, this.tileRectAround(this.tileOf(c)));
  }

  // ------------------------------------------------------------------ step

  step(): void {
    if (this.winner >= 0) return; // match over
    let n = 0;
    while (n < this.pending.length && this.pending[n].tick === this.tick) n++;
    const now = this.pending.splice(0, n);
    for (const c of now) this.apply(c);
    if (this.tick % 10 === 0) { const b = Math.floor(this.tick / 10) % RING; for (const ps of this.ps) for (let r = 0; r < NUM_RES; r++) ps.ring[r * RING + b] = 0; }
    this.processPaths();
    this.moveUnits();
    this.syncCarried();
    this.moveAnimals();
    this.mil.combatTick();
    this.unitTasks();
    this.mil.moraleTick();
    this.mil.fireTick();
    this.mil.moatTick();
    this.production();
    this.mil.cleanupDead();
    this.mil.victoryTick();
    this.recount();
    this.upkeep();
    this.updateFog();
    this.checkVictory();
    this.tick++;
  }

  mult(p: number): number { return this.ps[p].starving ? ECO.starvingRatePct : 100; }

  teamOf(p: number): number { return this.settings.teams?.[p] ?? p; }
  allied(p: number, q: number): boolean { return p === q || (p < this.players && q < this.players && this.teamOf(p) === this.teamOf(q)); }
  victoryEnabled(kind: 'domination' | 'conquest'): boolean { return this.settings.victory?.[kind] ?? true; }

  private addIncome(p: number, r: number, amt: number): void {
    const bonus = this.settings.incomeBonusPct?.[p] ?? 0;
    if (bonus > 0) {
      const ps = this.ps[p];
      ps.bonusAcc[r] += amt * bonus;
      const extra = Math.floor(ps.bonusAcc[r] / 100);
      ps.bonusAcc[r] -= extra * 100;
      amt += extra;
    }
    this.ps[p].stock[r] += amt;
    this.ps[p].totalIncome[r] += amt;
    this.ps[p].ring[r * RING + (Math.floor(this.tick / 10) % RING)] += amt;
  }

  private unitTasks(): void {
    const e = this.ents;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0) continue;
      const task = e.task[id];
      if (task === Task.IDLE) continue;
      if (task >= Task.ATTACK) { this.mil.taskTick(id); continue; }
      if (e.waitPath[id]) continue;
      if (!e.moving[id] && !this.arrived(id)) {
        // path failed or never reached: retry later
        if (this.tick >= e.repathAt[id]) { e.repathAt[id] = this.tick + 30; this.goTo(id, { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] }, e.hasFinal[id] ? e.finX[id] : -1, e.finY[id]); }
        if (task === Task.HUNT) this.huntTick(id);
        continue;
      }
      if (e.moving[id]) { if (task === Task.HUNT) this.huntTick(id); continue; }
      switch (task) {
        case Task.MOVE: this.stop(id); break;
        case Task.GATHER: this.gatherTick(id); break;
        case Task.RETURN: this.returnTick(id); break;
        case Task.BUILD: this.buildTick(id); break;
        case Task.WORK: this.workTick(id); break;
        case Task.HUNT: this.huntTick(id); break;
        case Task.SETTLE: this.settleTick(id); break;
      }
    }
  }

  private gatherTick(id: number): void {
    const e = this.ents, p = e.owner[id];
    const src = e.srcEnt[id], t = e.taskTile[id];
    const cap = ECO.carryCapacity;
    let available: number;
    let rate: number;
    if (src >= 0) {
      if (!e.alive[src] || e.kind[src] !== Kind.CARCASS) { this.afterSourceGone(id); return; }
      available = e.food[src]; rate = ECO.gatherPerMin.carcass;
    } else {
      if (this.res.amount[t] <= 0) { this.afterSourceGone(id); return; }
      available = this.res.amount[t];
      rate = ECO.gatherPerMin[resKey(this.res.type[t])];
    }
    if (available <= 0) { this.afterSourceGone(id); return; }
    e.acc[id] += rate * this.mult(p);
    while (e.acc[id] >= TICKS_PER_MIN * 100 && e.carryAmt[id] < cap) {
      e.acc[id] -= TICKS_PER_MIN * 100;
      e.carryAmt[id]++;
      if (src >= 0) { e.food[src]--; if (e.food[src] <= 0) { this.ents.kill(src); break; } }
      else { this.res.amount[t]--; if (this.res.amount[t] <= 0) { this.depleteTile(t); this.emit(p, 'depleted', this.res.type[t]); break; } }
    }
    if (e.carryAmt[id] >= cap) this.startReturn(id);
  }

  /** Current source exhausted: find the next tile of the same type nearby, else return cargo / idle. */
  private afterSourceGone(id: number): void {
    const e = this.ents, type = e.carryType[id], t = e.taskTile[id];
    const next = t >= 0 && type !== Res.FOOD ? this.findNearbyResource(t, type, 8) : -1;
    if (e.carryAmt[id] > 0) { e.taskTile[id] = next; e.srcEnt[id] = -1; this.startReturn(id); return; }
    if (next >= 0) this.startGather(id, next); else this.stop(id);
  }

  /** Nearest walkable tile not in `used` (formation slots). */
  nearestFree(t: number, R: number, p: number, used: Set<number>): number {
    const { w, h } = this.map, x0 = t % w, y0 = (t - x0) / w;
    for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const q = y * w + x;
      if (!used.has(q) && this.cost(q, p) > 0) return q;
    }
    return -1;
  }

  nearestWater(t: number, R: number): number {
    const { w, h } = this.map, x0 = t % w, y0 = (t - x0) / w;
    for (let r = 1; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && this.waterCost(y * w + x) > 0) return y * w + x;
    }
    return -1;
  }

  nearestPassable(t: number, R: number, p = -1): number {
    const { w, h } = this.map, x0 = t % w, y0 = (t - x0) / w;
    for (let r = 1; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && this.cost(y * w + x, p) > 0) return y * w + x;
    }
    return -1;
  }

  private findNearbyResource(t: number, type: number, R: number): number {
    const { w, h } = this.map, x0 = t % w, y0 = (t - x0) / w;
    for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = y * w + x;
      if (this.res.type[j] === type && this.res.amount[j] > 0) return j;
    }
    return -1;
  }

  private startReturn(id: number): void {
    const e = this.ents, p = e.owner[id], type = e.carryType[id];
    const ux = e.posX[id] >> FP_SHIFT, uy = e.posY[id] >> FP_SHIFT;
    let best = -1, bestD = 0;
    for (let b = 0; b < e.count; b++) {
      if (!e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b]) || !e.complete[b]) continue;
      if (!DROPOFF[buildingTypeOfKind(e.kind[b])]?.includes(type)) continue;
      const dx = (e.posX[b] >> FP_SHIFT) - ux, dy = (e.posY[b] >> FP_SHIFT) - uy, d = dx * dx + dy * dy;
      if (best < 0 || d < bestD) { best = b; bestD = d; }
    }
    if (best < 0) { e.task[id] = Task.IDLE; e.moving[id] = 0; this.emit(p, 'noDropoff', type); return; }
    e.task[id] = Task.RETURN; e.taskEnt[id] = best;
    this.goTo(id, this.footprintRect(best, 1));
  }

  private returnTick(id: number): void {
    const e = this.ents, p = e.owner[id], b = e.taskEnt[id];
    if (b < 0 || !e.alive[b] || e.owner[b] !== p) { this.startReturn(id); return; }
    if (e.carryAmt[id] > 0) this.addIncome(p, e.carryType[id], e.carryAmt[id]);
    e.carryAmt[id] = 0;
    const t = e.taskTile[id], src = e.srcEnt[id];
    if (src >= 0 && e.alive[src] && e.kind[src] === Kind.CARCASS) this.startGatherCarcass(id, src);
    else if (t >= 0 && this.res.amount[t] > 0) this.startGather(id, t);
    else if (t >= 0) { const n = this.findNearbyResource(t, e.carryType[id], 8); if (n >= 0) this.startGather(id, n); else this.stop(id); }
    else this.stop(id);
  }

  private buildTick(id: number): void {
    const e = this.ents, b = e.taskEnt[id], p = e.owner[id];
    if (b < 0 || !e.alive[b] || !isBuildingKind(e.kind[b])) { this.stop(id); return; }
    if (e.complete[b]) { this.afterBuilt(id, b); return; }
    e.acc[id] += ECO.buildPointsPerWorkerTick * this.mult(p);
    while (e.acc[id] >= 100) { e.acc[id] -= 100; e.progress[b]++; }
    const bp = buildingDef(buildingTypeOfKind(e.kind[b])).buildPoints;
    e.hp[b] = Math.max(e.hp[b], Math.floor((e.maxHp[b] * Math.min(e.progress[b], bp)) / bp));
    if (e.progress[b] >= bp) { this.completeBuilding(b); this.afterBuilt(id, b); }
  }

  private afterBuilt(id: number, b: number): void {
    const e = this.ents, def = buildingDef(buildingTypeOfKind(e.kind[b]));
    const q = e.queues[id];
    while (q.length && !(e.alive[q[0]] && isBuildingKind(e.kind[q[0]]) && !e.complete[q[0]])) q.shift();
    if (q.length) { const nb = q.shift()!; e.task[id] = Task.BUILD; e.taskEnt[id] = nb; this.goTo(id, this.footprintRect(nb, 1)); return; }
    this.stop(id);
    if (def.maxWorkers && this.workersAt(b) < def.maxWorkers) { e.task[id] = Task.WORK; e.taskEnt[id] = b; this.goTo(id, this.footprintRect(b, 1)); }
  }

  private workTick(id: number): void {
    const e = this.ents, b = e.taskEnt[id], p = e.owner[id];
    if (b < 0 || !e.alive[b] || !e.complete[b]) { this.stop(id); return; }
    const bt = buildingTypeOfKind(e.kind[b]);
    const rate = bt === 'farm' ? ECO.farmFoodPerWorkerPerMin : ECO.fishFoodPerWorkerPerMin;
    let pct = e.yieldPct[b];
    if (bt === 'farm') for (let l = 2; l <= e.level[b]; l++) pct = Math.floor((pct * (100 + (upgradeDef('farm', l)?.yieldPct ?? 0))) / 100);
    // exact integer accumulator: food per minute × pct × mult, one food per TICKS_PER_MIN × 10000
    e.acc[id] += rate * pct * this.mult(p);
    const unit = TICKS_PER_MIN * 10000;
    while (e.acc[id] >= unit) { e.acc[id] -= unit; this.addIncome(p, Res.FOOD, 1); }
  }

  private huntTick(id: number): void {
    const e = this.ents, a = e.taskEnt[id];
    if (a < 0 || !e.alive[a]) { this.stop(id); return; }
    if (e.kind[a] === Kind.CARCASS) { this.startGatherCarcass(id, a); return; }
    if (e.kind[a] !== Kind.ANIMAL) { this.stop(id); return; }
    const ut = this.tileOf(id), at = this.tileOf(a), w = this.map.w;
    const ux = ut % w, uy = (ut - ux) / w, ax = at % w, ay = (at - ax) / w;
    if (Math.abs(ux - ax) <= 1 && Math.abs(uy - ay) <= 1) {
      e.kind[a] = Kind.CARCASS; e.moving[a] = 0; e.food[a] = TUNING.animals.food;
      this.startGatherCarcass(id, a);
      return;
    }
    // animal wandered off the goal area: re-target every 10 ticks
    if (this.tick % 10 === id % 10 && !(ax >= e.gx0[id] && ax <= e.gx1[id] && ay >= e.gy0[id] && ay <= e.gy1[id])) {
      this.goTo(id, this.tileRectAround(at));
    } else if (!e.moving[id] && !e.waitPath[id]) this.goTo(id, this.tileRectAround(at));
  }

  private settleTick(id: number): void {
    const e = this.ents, p = e.owner[id], t = e.taskTile[id];
    const why = this.canPlace(p, 'settlement', t);
    if (why) { this.emit(p, 'cantPlace', BUILDING_TYPES.indexOf('settlement')); this.stop(id); return; }
    const b = this.createBuilding(p, 'settlement', t, true);
    this.ents.kill(id);
    this.emit(p, 'settled', b);
  }

  private production(): void {
    const e = this.ents;
    for (let b = 0; b < e.count; b++) {
      if (!e.alive[b] || !isBuildingKind(e.kind[b]) || !e.complete[b]) continue;
      const p = e.owner[b];
      if (e.upTo[b]) {
        const u = upgradeDef(buildingTypeOfKind(e.kind[b]), e.upTo[b])!;
        if (++e.upProgress[b] >= u.ticks) {
          e.level[b] = e.upTo[b]; e.upTo[b] = 0; e.upProgress[b] = 0;
          this.claimAround(b);
          this.emit(p, 'upgraded', e.btype[b], b);
        }
      }
      const q = e.queues[b];
      if (!q.length) continue;
      const ut = UNIT_TYPES[q[0]], d = unitDef(ut);
      if (e.trainProgress[b] < d.trainTicks) {
        if (this.ps[p].starving) continue;
        e.trainProgress[b]++;
        continue;
      }
      if (this.ps[p].pop + d.pop > this.ps[p].housing) {
        if (!this.ps[p].housingWarned) { this.ps[p].housingWarned = true; this.emit(p, 'housing'); }
        continue;
      }
      this.ps[p].housingWarned = false;
      q.shift();
      e.trainProgress[b] = 0;
      const nu = this.spawnUnitNear(p, ut, b);
      const rally = e.rally[b];
      if (rally >= 0) {
        if (ut === 'worker' && this.res.type[rally] !== RES_NONE && this.res.amount[rally] > 0) this.startGather(nu, rally);
        else if (this.costFor(nu, rally) > 0 || this.isNaval(nu)) { e.task[nu] = Task.MOVE; const [rx, ry] = Sim.tileCenterFp(rally, this.map.w); this.goTo(nu, this.tileRectAround(rally, 0), rx, ry); }
      }
      this.ps[p].pop += d.pop;
      this.emit(p, 'trained', UNIT_TYPES.indexOf(ut));
    }
  }

  /** Recompute population and housing from scratch (cheap, keeps them exact). */
  private recount(): void {
    const e = this.ents;
    for (const ps of this.ps) { ps.pop = 0; ps.housing = 0; }
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id]) continue;
      const p = e.owner[id];
      if (p >= this.players) continue;
      const k = e.kind[id];
      if (isUnitKind(k)) this.ps[p].pop += unitDef(unitTypeOfKind(k)).pop;
      else if (isBuildingKind(k) && e.complete[id]) this.ps[p].housing += this.housingOf(id);
    }
  }

  private upkeep(): void {
    for (let p = 0; p < this.players; p++) {
      const ps = this.ps[p];
      ps.upkeepAcc += ps.pop * ECO.foodPerPopPerMin;
      while (ps.upkeepAcc >= TICKS_PER_MIN) {
        ps.upkeepAcc -= TICKS_PER_MIN;
        if (ps.stock[Res.FOOD] > 0) ps.stock[Res.FOOD]--;
        else if (!ps.starving) { ps.starving = true; this.emit(p, 'starving'); }
      }
      if (ps.starving && ps.stock[Res.FOOD] >= 10) { ps.starving = false; this.emit(p, 'fed'); }
    }
  }

  /** Units inside a building or ship move with it. */
  private syncCarried(): void {
    const e = this.ents;
    for (let id = 0; id < e.count; id++) {
      const c = e.carrier[id];
      if (!e.alive[id] || c < 0) continue;
      if (!e.alive[c]) { e.carrier[id] = -1; continue; }
      e.posX[id] = e.posX[c]; e.posY[id] = e.posY[c]; e.moving[id] = 0;
    }
  }

  private moveAnimals(): void {
    const e = this.ents, A = TUNING.animals, { w, h } = this.map;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.kind[id] !== Kind.ANIMAL) continue;
      if (!e.moving[id]) {
        if (this.tick % A.wanderEveryTicks !== id % A.wanderEveryTicks) continue;
        const home = e.homeTile[id], hx = home % w, hy = (home - hx) / w, R = A.wanderRadius;
        const x = Math.max(0, Math.min(w - 1, hx + this.rngAnimals.range(-R, R)));
        const y = Math.max(0, Math.min(h - 1, hy + this.rngAnimals.range(-R, R)));
        if (this.cost(y * w + x) <= 0) continue;
        e.tgtX[id] = tileCenter(x); e.tgtY[id] = tileCenter(y); e.moving[id] = 1;
        continue;
      }
      const dx = e.tgtX[id] - e.posX[id], dy = e.tgtY[id] - e.posY[id];
      const dist = isqrt(dx * dx + dy * dy), sp = e.speed[id];
      let nx: number, ny: number;
      if (dist <= sp) { nx = e.tgtX[id]; ny = e.tgtY[id]; } else { nx = e.posX[id] + Math.trunc((dx * sp) / dist); ny = e.posY[id] + Math.trunc((dy * sp) / dist); }
      if (this.cost((ny >> FP_SHIFT) * w + (nx >> FP_SHIFT)) <= 0) { e.moving[id] = 0; continue; }
      e.posX[id] = nx; e.posY[id] = ny;
      if (nx === e.tgtX[id] && ny === e.tgtY[id]) e.moving[id] = 0;
    }
  }

  private updateFog(): void {
    const e = this.ents, w = this.map.w;
    this.ensureLastTile();
    const changed = this.fogForce;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] >= this.players) continue;
      const t = (e.posY[id] >> FP_SHIFT) * w + (e.posX[id] >> FP_SHIFT);
      if (t !== this.lastTile[id]) { this.lastTile[id] = t; changed[e.owner[id]] = 1; }
    }
    for (let p = 0; p < this.players; p++) {
      if (!changed[p]) continue;
      changed[p] = 0;
      const f = this.fog[p];
      f.begin();
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || e.owner[id] !== p || e.carrier[id] >= 0) continue;
        f.stampCircle(e.posX[id] >> FP_SHIFT, e.posY[id] >> FP_SHIFT, e.vision[id]);
      }
      // own territory is always visible
      for (const t of this.ownedList[p]) f.stampTile(t);
      f.dirty = true;
      if (f.newlyExplored.length) {
        const ps = this.ps[p];
        for (const t of f.newlyExplored) {
          const rt = this.res.type[t];
          if (rt === RES_NONE) continue;
          ps.found[rt]++;
          if (!(ps.foundMask & (1 << rt))) { ps.foundMask |= 1 << rt; if (rt !== Res.WOOD) this.emit(p, 'deposit', rt, t); }
        }
        f.newlyExplored.length = 0;
      }
    }
  }

  /** Domination: a team holding ≥ dominationPct of all land for the hold time wins (counter kept on the team's lowest player). */
  private checkVictory(): void {
    if (this.winner >= 0 || !this.victoryEnabled('domination')) return;
    const pct = this.settings.victory?.dominationPct ?? ECO.dominationPct;
    const land = new Map<number, number>(), lead = new Map<number, number>();
    for (let p = 0; p < this.players; p++) {
      if (this.ps[p].eliminated) continue;
      const t = this.teamOf(p);
      land.set(t, (land.get(t) ?? 0) + this.ps[p].landOwned);
      if (!lead.has(t)) lead.set(t, p);
    }
    for (let p = 0; p < this.players; p++) {
      const t = this.teamOf(p);
      if (lead.get(t) !== p) { this.ps[p].dominationTicks = 0; continue; }
      const ps = this.ps[p];
      if ((land.get(t) ?? 0) * 100 >= pct * this.totalLand) {
        if (++ps.dominationTicks >= ECO.dominationHoldTicks) { this.winner = p; this.winnerTeam = t; this.emit(p, 'victory', 0, t); return; }
      } else ps.dominationTicks = 0;
    }
  }

  emit(player: number, type: string, a?: number, b?: number): void { this.events.push({ tick: this.tick, player, type, a, b }); }
  drainEvents(): SimEvent[] { const ev = this.events; this.events = []; return ev; }
  drainChangedTiles(): number[] { const c = this.changedTiles; this.changedTiles = []; return c; }

  // ------------------------------------------------------------------ queries

  get isNight(): boolean { return this.tick % this.dayLength >= this.nightStart; }
  get dayPhase(): number { return this.tick % this.dayLength; }

  /** Is entity `id` visible to `viewer`? (-1 = spectator sees all.) */
  visibleTo(id: number, viewer: number): boolean {
    const e = this.ents;
    if (e.carrier[id] >= 0) return false;
    if (viewer < 0 || e.owner[id] === viewer) return true;
    if (e.owner[id] < this.players && this.allied(e.owner[id], viewer)) return true; // allies see each other's units
    if (isUnitKind(e.kind[id]) && unitDef(unitTypeOfKind(e.kind[id])).stealth) {
      // stealthed units are only seen by enemies within 2 tiles of one of their entities
      const R = 2 * FP_ONE;
      let seen = false;
      for (let o = 0; o < e.count && !seen; o++) {
        if (!e.alive[o] || e.owner[o] !== viewer || e.carrier[o] >= 0) continue;
        const dx = e.posX[o] - e.posX[id], dy = e.posY[o] - e.posY[id];
        seen = dx * dx + dy * dy <= R * R;
      }
      if (!seen) return false;
    }
    if (isBuildingKind(e.kind[id])) {
      // buildings are remembered once seen (any footprint tile explored)
      const r = this.footprintRect(id);
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (this.fog[viewer].data[y * this.map.w + x] !== FOG_UNEXPLORED) return true;
      return false;
    }
    return this.fog[viewer].data[this.tileOf(id)] === FOG_VISIBLE;
  }

  hash(): number {
    const hs = new Hasher();
    hs.u32(this.tick);
    hs.u32(this.map.hash);
    for (const v of this.ents.hashViews()) { hs.u32(v.byteLength); hs.bytes(v); }
    for (let id = 0; id < this.ents.count; id++) {
      const p = this.ents.paths[id];
      hs.u32(p ? p.length : 0xffffffff);
      if (p) for (const t of p) hs.u32(t);
      for (const q of this.ents.queues[id] ?? []) hs.u32(q);
    }
    for (const f of this.fog) hs.bytes(f.data);
    hs.bytes(this.tileOwner); hs.bytes(this.occ); hs.bytes(this.map.biome); hs.bytes(this.res.type); hs.bytes(this.res.amount);
    for (const ps of this.ps) {
      for (const v of ps.stock) hs.u32(v);
      for (const v of ps.ring) hs.u32(v);
      for (const v of ps.totalIncome) hs.u32(v);
      hs.u32(ps.upkeepAcc); hs.u32(ps.starving ? 1 : 0); hs.u32(ps.landOwned); hs.u32(ps.dominationTicks); hs.u32(ps.foundMask);
    }
    hs.u32(this.pending.length);
    for (const q of this.pathQueue) hs.u32(q);
    for (const s of this.rngAnimals.getState()) hs.u32(s);
    for (const s of this.rngFire.getState()) hs.u32(s);
    hs.bytes(this.burning);
    for (const t of this.burningList) hs.u32(t);
    for (const t of this.trenchList) hs.u32(t);
    for (const ps of this.ps) hs.u32(ps.eliminated ? 1 : 0);
    hs.u32(this.winner + 1);
    hs.u32(this.winnerTeam + 1);
    for (const ps of this.ps) for (const v of ps.bonusAcc) hs.u32(v);
    return hs.digest();
  }

  /** Fixed-point world position of a tile centre (helper for clients/tests). */
  static tileCenterFp(t: number, w: number): [number, number] { const x = t % w; return [tileCenter(x), tileCenter((t - x) / w)]; }
}

export function costOf(wood: number, stone: number, gold: number, food: number): number[] {
  const c = new Array(NUM_RES).fill(0);
  c[Res.WOOD] = wood; c[Res.STONE] = stone; c[Res.GOLD] = gold; c[Res.FOOD] = food;
  return c;
}
function resIndex(name: string): number { return ['food', 'wood', 'stone', 'gold', 'carbon', 'adamite'].indexOf(name); }
function resKey(r: number): 'wood' | 'stone' | 'gold' | 'carbon' | 'adamite' { return (['food', 'wood', 'stone', 'gold', 'carbon', 'adamite'] as const)[r] as 'wood'; }

export const ENTITY_STRIDE = 9; // id, kind, owner, posX, posY, flags, a, b, hp‰

/**
 * Fog-filtered entity list for one viewer (what the renderer may know about).
 * flags: bit0 moving, bit1 complete (buildings), bit2 carrying.
 * a/b: units → task, carryAmt | carryType<<16; buildings → btype | level<<8 | upTo<<16, progress ‰;
 * animals/carcasses → food, 0.
 */
export function packVisibleEntities(sim: Sim, viewer: number): Int32Array {
  const e = sim.ents;
  const out: number[] = [];
  for (let id = 0; id < e.count; id++) {
    if (!e.alive[id] || !sim.visibleTo(id, viewer)) continue;
    const k = e.kind[id];
    let a = 0, b = 0;
    const flags = (e.moving[id] ? 1 : 0) | (e.complete[id] ? 2 : 0) | (e.carryAmt[id] > 0 ? 4 : 0);
    if (isUnitKind(k)) { a = e.task[id]; b = e.carryAmt[id] | (e.carryType[id] << 16); }
    else if (isBuildingKind(k)) {
      a = e.btype[id] | (e.level[id] << 8) | (e.upTo[id] << 16) | (Math.min(15, sim.mil.garrisonCount(id)) << 20);
      const bp = buildingDef(buildingTypeOfKind(k)).buildPoints;
      b = e.complete[id] ? 1000 : bp > 0 ? Math.floor((e.progress[id] * 1000) / bp) : 1000;
    } else a = e.food[id];
    out.push(id, k, e.owner[id], e.posX[id], e.posY[id], flags, a, b, e.maxHp[id] > 0 ? Math.max(0, Math.floor((e.hp[id] * 1000) / e.maxHp[id])) : 1000);
  }
  return new Int32Array(out);
}
