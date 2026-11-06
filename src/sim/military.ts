// Phase 3 systems: combat (targeting, damage factors, morale), military orders, garrisons, transports,
// walls/gates, trenches → moats, fire, building destruction, elimination and conquest.
// Deterministic like the rest of the sim: integer math, id-ordered iteration, one seeded RNG stream (fire).
import { TUNING } from './core/tuning';
import { FP_ONE, FP_SHIFT, isqrt, tileCenter } from './core/fixed';
import { Biome, isWaterBiome } from './world/mapgen';
import { FlowFields } from './path/flowfield';
import type { GoalRect } from './path/astar';
import type { Command } from './commands';
import {
  BUILDING_TYPES, DEFENSIVE, Kind, Res, RES_NONE, TOWN_CENTERS, Task, UNIT_TYPES, buildingDef, buildingTypeOfKind, isBuildingKind, isUnitKind,
  unitDef, unitTypeOfKind, type BuildingTypeName, type UnitDef,
} from './defs';
import { NO_OWNER, costOf, type Sim } from './sim';

const C = TUNING.combat, M = TUNING.morale, T = TUNING.terrainEdit, F = TUNING.fire, GRP = TUNING.groups;
const CELL = 8;
const MILITARY: ReadonlySet<number> = new Set([Kind.SPEARMAN, Kind.ARCHER, Kind.RIDER, Kind.RAM, Kind.SABOTEUR, Kind.WARSHIP]);
export const isMilitaryKind = (k: number): boolean => MILITARY.has(k);

export class Military {
  /** Spatial hash of targetable entities, rebuilt each tick. */
  private grid: number[][] = [];
  private gw: number;
  private gh: number;
  /** [attacker, target] pairs of ranged shots this tick (visual only). */
  shots: number[] = [];

  constructor(private s: Sim) {
    this.gw = Math.ceil(s.map.w / CELL);
    this.gh = Math.ceil(s.map.h / CELL);
  }

  // ------------------------------------------------------------------ helpers

  udef(id: number): UnitDef { return unitDef(unitTypeOfKind(this.s.ents.kind[id])); }
  isEnemy(a: number, b: number): boolean {
    const e = this.s.ents, oa = e.owner[a], ob = e.owner[b], P = this.s.players;
    return oa !== ob && oa < P && ob < P && !this.s.ps[ob].eliminated && !this.s.ps[oa].eliminated;
  }
  private targetable(id: number): boolean {
    const e = this.s.ents;
    return e.alive[id] === 1 && e.owner[id] < this.s.players && e.carrier[id] < 0 && (isUnitKind(e.kind[id]) || isBuildingKind(e.kind[id]));
  }
  /** Squared fixed-point distance from entity a's centre to entity b (unit centre or building footprint). */
  dist2(a: number, b: number): number {
    const e = this.s.ents, ax = e.posX[a], ay = e.posY[a];
    if (isBuildingKind(e.kind[b])) {
      const r = this.s.footprintRect(b);
      const x0 = r.x0 << FP_SHIFT, y0 = r.y0 << FP_SHIFT, x1 = (r.x1 + 1) << FP_SHIFT, y1 = (r.y1 + 1) << FP_SHIFT;
      const dx = ax < x0 ? x0 - ax : ax > x1 ? ax - x1 : 0, dy = ay < y0 ? y0 - ay : ay > y1 ? ay - y1 : 0;
      return dx * dx + dy * dy;
    }
    const dx = e.posX[b] - ax, dy = e.posY[b] - ay;
    return dx * dx + dy * dy;
  }
  /** Weapon range (fixed-point) of an attacker. */
  range(id: number): number {
    const e = this.s.ents;
    const r = isBuildingKind(e.kind[id]) ? buildingDef(buildingTypeOfKind(e.kind[id])).range : this.udef(id).range;
    return Math.floor((r * FP_ONE) / 10);
  }
  private inRange(a: number, b: number): boolean {
    const r = this.range(a) + (isUnitKind(this.s.ents.kind[b]) ? 300 : 0);
    return this.dist2(a, b) <= r * r;
  }
  garrisonCount(b: number): number {
    const e = this.s.ents;
    let n = 0;
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.carrier[id] === b && isUnitKind(e.kind[id])) n++;
    return n;
  }
  private nearOwnTerritory(p: number, t: number, reach: number): boolean {
    const { w, h } = this.s.map, x0 = t % w, y0 = (t - x0) / w;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && this.s.tileOwner[y * w + x] === p) return true;
    }
    return false;
  }
  /** Nearest own completed town centre to a unit (for retreat/rout). */
  private homeOf(id: number): number {
    const e = this.s.ents, p = e.owner[id];
    let best = -1, bd = 0;
    for (let b = 0; b < e.count; b++) {
      if (!e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b]) || !e.complete[b]) continue;
      if (!TOWN_CENTERS.includes(buildingTypeOfKind(e.kind[b]))) continue;
      const d = this.dist2(id, b);
      if (best < 0 || d < bd) { best = b; bd = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ spatial hash

  private buildGrid(): void {
    const e = this.s.ents;
    if (this.grid.length !== this.gw * this.gh) this.grid = Array.from({ length: this.gw * this.gh }, () => []);
    for (const c of this.grid) c.length = 0;
    for (let id = 0; id < e.count; id++) {
      if (!this.targetable(id)) continue;
      const cx = Math.min(this.gw - 1, (e.posX[id] >> FP_SHIFT) >> 3), cy = Math.min(this.gh - 1, (e.posY[id] >> FP_SHIFT) >> 3);
      this.grid[cy * this.gw + cx].push(id);
    }
  }

  /** Nearest enemy within `radiusTiles` (units preferred over buildings). Stealthed units only within 2 tiles. */
  acquire(id: number, radiusTiles: number): number {
    const e = this.s.ents;
    const cx = (e.posX[id] >> FP_SHIFT) >> 3, cy = (e.posY[id] >> FP_SHIFT) >> 3, cr = Math.ceil(radiusTiles / CELL) + 1;
    const r2 = (radiusTiles * FP_ONE) * (radiusTiles * FP_ONE), stealthR2 = (2 * FP_ONE) * (2 * FP_ONE);
    let bestU = -1, bdU = 0, bestB = -1, bdB = 0;
    for (let gy = Math.max(0, cy - cr); gy <= Math.min(this.gh - 1, cy + cr); gy++) for (let gx = Math.max(0, cx - cr); gx <= Math.min(this.gw - 1, cx + cr); gx++) {
      for (const t of this.grid[gy * this.gw + gx]) {
        if (!this.isEnemy(id, t) || e.hp[t] <= 0) continue;
        const d = this.dist2(id, t);
        if (d > r2) continue;
        if (isUnitKind(e.kind[t])) {
          if (this.udef(t).stealth && d > stealthR2) continue;
          if (bestU < 0 || d < bdU || (d === bdU && t < bestU)) { bestU = t; bdU = d; }
        } else if (bestB < 0 || d < bdB || (d === bdB && t < bestB)) { bestB = t; bdB = d; }
      }
    }
    return bestU >= 0 ? bestU : bestB;
  }

  // ------------------------------------------------------------------ damage

  private tileH(id: number): number {
    const t = this.s.tileOf(id);
    return this.s.map.height[t] - (this.s.map.biome[t] === Biome.TRENCH ? 1 : 0);
  }
  /** Target stands next to a friendly wall, gate or tower. */
  private fortified(t: number): boolean {
    const e = this.s.ents, { w, h } = this.s.map, tile = this.s.tileOf(t), x0 = tile % w, y0 = (tile - x0) / w, p = e.owner[t];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = this.s.occ[y * w + x];
      if (o && e.owner[o - 1] === p && DEFENSIVE[buildingTypeOfKind(e.kind[o - 1])] && e.complete[o - 1]) return true;
    }
    return false;
  }

  /** Damage dealt by attacker a to target t (all combat factors, integer math). */
  damage(a: number, t: number): number {
    const e = this.s.ents, aBuilding = isBuildingKind(e.kind[a]), tBuilding = isBuildingKind(e.kind[t]);
    let base: number, ranged: boolean, vsU = 100, vsB = 100;
    if (aBuilding) {
      const d = buildingDef(buildingTypeOfKind(e.kind[a]));
      base = d.attack + C.garrisonArrowBonus * this.garrisonCount(a);
      ranged = true; vsB = 20;
    } else {
      const d = this.udef(a);
      base = d.attack; ranged = d.range > 20; vsU = d.vsUnits; vsB = d.vsBuildings;
    }
    let dmg = base * 100;                                         // ×100 fixed point
    dmg = Math.floor((dmg * (tBuilding ? vsB : vsU)) / 100);
    dmg = Math.floor((dmg * (100 + e.weaponTier[a] * C.weaponTierPct)) / 100);
    const ha = this.tileH(a), ht = this.tileH(t);
    if (ha > ht) dmg = Math.floor((dmg * (100 + C.heightBonusPct)) / 100);
    else if (ha < ht) dmg = Math.floor((dmg * (100 - C.heightPenaltyPct)) / 100);
    if (!tBuilding) {
      const tb = this.s.map.biome[this.s.tileOf(t)];
      if (ranged && tb === Biome.FOREST) dmg = Math.floor((dmg * (100 - C.forestCoverPct)) / 100);
      if (ranged && tb === Biome.TRENCH) dmg = Math.floor((dmg * (100 - C.trenchCoverPct)) / 100);
      if (ranged && this.fortified(t)) dmg = Math.floor((dmg * (100 - C.fortifiedPct)) / 100);
    }
    if (!ranged && !aBuilding && this.s.map.biome[this.s.tileOf(a)] === Biome.TRENCH) dmg = Math.floor((dmg * (100 - C.trenchMeleePenaltyPct)) / 100);
    const armor = tBuilding ? 0 : this.udef(t).armor;
    dmg = Math.floor(dmg / 100) - armor;
    dmg = Math.floor((dmg * (100 - Math.min(90, e.armorTier[t] * C.armorTierPct))) / 100);
    return Math.max(1, dmg);
  }

  private hit(a: number, t: number): void {
    const e = this.s.ents, dmg = this.damage(a, t);
    e.hp[t] -= dmg;
    e.lastHit[t] = this.s.tick;
    if (isUnitKind(e.kind[t]) && e.maxHp[t] > 0) {
      const loss = Math.floor((Math.floor((dmg * 100) / e.maxHp[t]) * M.lossPerHpPct) / 100);
      e.morale[t] = Math.max(0, e.morale[t] - loss);
    }
    if (this.range(a) > 2 * FP_ONE) this.shots.push(a, t);
  }

  // ------------------------------------------------------------------ per tick

  combatTick(): void {
    const s = this.s, e = s.ents;
    this.shots.length = 0;
    this.buildGrid();
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] >= s.players || e.carrier[id] >= 0) continue;
      const k = e.kind[id];
      if (e.cooldown[id] > 0) e.cooldown[id]--;
      let tgt = -1;
      if (isBuildingKind(k)) {
        if (!e.complete[id]) continue;
        const d = buildingDef(buildingTypeOfKind(k));
        if (d.range <= 0 || (d.attack <= 0 && this.garrisonCount(id) === 0)) continue;
        tgt = this.acquire(id, Math.floor(d.range / 10));
        if (tgt >= 0 && this.inRange(id, tgt) && e.cooldown[id] === 0) { this.hit(id, tgt); e.cooldown[id] = d.cooldown; }
        continue;
      }
      if (!isUnitKind(k)) continue;
      const d = this.udef(id);
      if (d.attack <= 0) continue;
      const task = e.task[id];
      if (task === Task.ATTACK) {
        tgt = e.taskEnt[id];
        if (tgt < 0 || !this.targetable(tgt) || !this.isEnemy(id, tgt) || e.hp[tgt] <= 0) { this.onTargetGone(id); continue; }
      } else if (isMilitaryKind(k) && (task === Task.IDLE || task === Task.HOLD || task === Task.PATROL) && s.tick >= e.repathAt[id]) {
        tgt = this.acquire(id, task === Task.HOLD ? Math.ceil(d.range / 10) + 1 : C.acquireRange);
        if (tgt < 0) continue;
        if (task !== Task.HOLD) {
          e.resumeTask[id] = task;
          e.task[id] = Task.ATTACK; e.taskEnt[id] = tgt;
        }
      } else continue;
      if (this.inRange(id, tgt)) {
        if (e.moving[id] && e.task[id] === Task.ATTACK) { e.moving[id] = 0; e.paths[id] = null; e.flowGoal[id] = -1; }
        if (e.cooldown[id] === 0) { this.hit(id, tgt); e.cooldown[id] = d.cooldown; }
      } else if (e.task[id] === Task.ATTACK && !e.waitPath[id]) {
        // chase: re-target the path every second or when idle
        if (!e.moving[id] || s.tick % 10 === id % 10) this.chase(id, tgt);
      }
    }
  }

  private chase(id: number, tgt: number): void {
    const s = this.s, e = s.ents;
    const m = Math.max(1, Math.floor(this.udef(id).range / 10));
    let r: GoalRect;
    if (isBuildingKind(e.kind[tgt])) r = s.footprintRect(tgt, m);
    else { const t = s.tileOf(tgt), w = s.map.w, x = t % w, y = (t - x) / w; r = { x0: x - m, y0: y - m, x1: x + m, y1: y + m }; }
    if (e.moving[id] && e.gx0[id] === r.x0 && e.gy0[id] === r.y0 && e.gx1[id] === r.x1 && e.gy1[id] === r.y1) return;
    s.goTo(id, r);
  }

  private onTargetGone(id: number): void {
    const s = this.s, e = s.ents;
    const resume = e.resumeTask[id];
    s.stop(id);
    if (resume === Task.PATROL && e.patrolA[id] >= 0) { e.task[id] = Task.PATROL; this.patrolLeg(id); }
    else if (resume === Task.HOLD) e.task[id] = Task.HOLD;
  }

  /** Path to the target failed (e.g. behind a wall and moat): melee units attack the nearest enemy defence instead. */
  onAttackPathFailed(id: number): void {
    const s = this.s, e = s.ents, t = e.taskEnt[id];
    // one fallback only: if the nearest enemy defence is unreachable too, give up for a while
    if (this.udef(id).range <= 20 && t >= 0 && e.srcEnt[id] < 0) {
      let best = -1, bd = 0;
      const lim = C.meleeBlockedSearch * FP_ONE;
      for (let b = 0; b < e.count; b++) {
        if (!e.alive[b] || !isBuildingKind(e.kind[b]) || !this.isEnemy(id, b) || b === t) continue;
        if (!DEFENSIVE[buildingTypeOfKind(e.kind[b])]) continue;
        const d = this.dist2(id, b);
        if (d > lim * lim) continue;
        if (best < 0 || d < bd) { best = b; bd = d; }
      }
      if (best >= 0) { e.srcEnt[id] = best; e.taskEnt[id] = best; s.goTo(id, s.footprintRect(best, 1)); return; }
    }
    s.emit(e.owner[id], 'unreachable', id);
    this.onTargetGone(id);
    e.repathAt[id] = s.tick + 100; // don't immediately re-acquire the same unreachable enemy
  }

  moraleTick(): void {
    const s = this.s, e = s.ents;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || !isMilitaryKind(e.kind[id]) || e.carrier[id] >= 0 || e.kind[id] === Kind.RAM || e.kind[id] === Kind.WARSHIP) continue;
      const task = e.task[id];
      if (s.tick - e.lastHit[id] >= M.recoverDelayTicks && s.tick % 10 === 0) {
        e.morale[id] = Math.min(M.max, e.morale[id] + M.recoverPerSecond * (task === Task.RETREAT ? 2 : 1));
      }
      if (task !== Task.ROUT && task !== Task.RETREAT && e.morale[id] < M.routBelow) {
        s.stop(id);
        e.task[id] = Task.ROUT;
        this.goHome(id);
        s.emit(e.owner[id], 'rout', id);
      } else if (task === Task.ROUT && e.morale[id] >= M.rallyAbove) s.stop(id);
    }
  }

  private goHome(id: number): void {
    const h = this.homeOf(id);
    if (h >= 0) this.s.goTo(id, this.s.footprintRect(h, 2));
  }

  /** Called on unit death: nearby allies lose morale. */
  private allyDied(id: number): void {
    const e = this.s.ents, p = e.owner[id], R = M.allyDeathRadius * FP_ONE;
    for (let o = 0; o < e.count; o++) {
      if (o === id || !e.alive[o] || e.owner[o] !== p || !isMilitaryKind(e.kind[o])) continue;
      const dx = e.posX[o] - e.posX[id], dy = e.posY[o] - e.posY[id];
      if (dx * dx + dy * dy <= R * R) e.morale[o] = Math.max(0, e.morale[o] - M.allyDeathLoss);
    }
  }

  /** Remove dead units and destroyed buildings. */
  cleanupDead(): void {
    const s = this.s, e = s.ents;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] >= s.players || e.maxHp[id] <= 0 || e.hp[id] > 0) continue;
      if (isUnitKind(e.kind[id])) this.killUnit(id);
      else if (isBuildingKind(e.kind[id])) this.destroyBuilding(id, true);
    }
  }

  killUnit(id: number): void {
    const s = this.s, e = s.ents;
    for (let c = 0; c < e.count; c++) if (e.alive[c] && e.carrier[c] === id) { s.stop(c); e.kill(c); } // cargo sinks with the ship
    s.fogForce[e.owner[id]] = 1;
    if (isMilitaryKind(e.kind[id])) this.allyDied(id);
    s.emit(e.owner[id], 'unitLost', e.kind[id], id);
    s.stop(id);
    e.kill(id);
    s.fogForce[e.owner[id]] = 1;
  }

  destroyBuilding(id: number, announce: boolean): void {
    const s = this.s, e = s.ents, p = e.owner[id], bt = buildingTypeOfKind(e.kind[id]);
    const r = s.footprintRect(id), changed: number[] = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const t = y * s.map.w + x; if (s.occ[t] === id + 1) { s.occ[t] = 0; changed.push(t); } }
    // garrison walks out
    for (let c = 0; c < e.count; c++) if (e.alive[c] && e.carrier[c] === id) this.eject(c, id);
    const claimed = s.territoryRadius(id) > 0 && e.complete[id];
    e.kill(id);
    if (claimed) this.recomputeTerritory(p);
    if (announce) { s.emit(p, bt === 'capital' ? 'capitalLost' : 'buildingLost', BUILDING_TYPES.indexOf(bt)); }
    s.fogForce[p] = 1;
    this.onTerrainChanged(changed);
  }

  private eject(c: number, from: number): void {
    const s = this.s, e = s.ents;
    const t = s.freeTileNear(s.footprintRect(from, 1), e.kind[c] === Kind.WARSHIP || e.kind[c] === Kind.TRANSPORT);
    e.carrier[c] = -1;
    const x = t % s.map.w;
    e.posX[c] = tileCenter(x); e.posY[c] = tileCenter((t - x) / s.map.w);
    s.stop(c);
    s.fogForce[e.owner[c]] = 1;
  }

  recomputeTerritory(p: number): void {
    const s = this.s, e = s.ents;
    for (const t of s.ownedList[p]) if (s.tileOwner[t] === p) s.tileOwner[t] = NO_OWNER;
    s.ownedList[p] = []; s.ps[p].landOwned = 0;
    for (let b = 0; b < e.count; b++) if (e.alive[b] && e.owner[b] === p && isBuildingKind(e.kind[b]) && e.complete[b]) s.claimAround(b);
    s.ownerDirty = true; s.fogForce[p] = 1;
  }

  /** Terrain or a building changed: flow fields are stale; units whose path crosses a changed tile re-path. */
  onTerrainChanged(tiles: number[]): void {
    if (!tiles.length) return;
    const s = this.s, e = s.ents;
    s.flows.clear();
    const set = new Set(tiles);
    for (let id = 0; id < e.count; id++) {
      const path = e.paths[id];
      if (!e.alive[id] || !path) continue;
      for (let k = e.pathIdx[id]; k < path.length; k++) if (set.has(path[k])) {
        s.goTo(id, { x0: e.gx0[id], y0: e.gy0[id], x1: e.gx1[id], y1: e.gy1[id] }, e.hasFinal[id] ? e.finX[id] : -1, e.finY[id]);
        break;
      }
    }
  }

  // ------------------------------------------------------------------ orders

  /** Phase 3 commands. Returns true when handled. */
  apply(c: Command): boolean {
    const s = this.s, e = s.ents, p = c.player, w = s.map.w;
    switch (c.type) {
      case 'attack': {
        const t = c.target;
        if (t < 0 || t >= e.count || !this.targetable(t)) return true;
        for (const id of s.ownUnits(p, c.ids)) {
          if (this.udef(id).attack <= 0 || !this.isEnemy(id, t)) continue;
          s.stop(id); e.task[id] = Task.ATTACK; e.taskEnt[id] = t; e.srcEnt[id] = -1; e.resumeTask[id] = Task.IDLE;
        }
        return true;
      }
      case 'stop': for (const id of s.ownUnits(p, c.ids)) s.stop(id); return true;
      case 'hold': for (const id of s.ownUnits(p, c.ids)) { s.stop(id); e.task[id] = Task.HOLD; } return true;
      case 'retreat': for (const id of s.ownUnits(p, c.ids)) { s.stop(id); e.task[id] = Task.RETREAT; this.goHome(id); } return true;
      case 'patrol': {
        let t = (Math.max(0, Math.min(s.map.h * FP_ONE - 1, c.y)) >> FP_SHIFT) * w + (Math.max(0, Math.min(w * FP_ONE - 1, c.x)) >> FP_SHIFT);
        if (s.cost(t, p) === 0) { t = s.nearestPassable(t, 8, p); if (t < 0) return true; }
        for (const id of s.ownUnits(p, c.ids)) {
          s.stop(id); e.task[id] = Task.PATROL; e.patrolA[id] = s.tileOf(id); e.patrolB[id] = t; e.phase[id] = 0;
          this.patrolLeg(id);
        }
        return true;
      }
      case 'setRally': {
        const b = c.building;
        if (b >= 0 && b < e.count && e.alive[b] && e.owner[b] === p && isBuildingKind(e.kind[b])) e.rally[b] = c.tile;
        return true;
      }
      case 'demolish': {
        const b = c.building;
        if (b >= 0 && b < e.count && e.alive[b] && e.owner[b] === p && isBuildingKind(e.kind[b]) && buildingTypeOfKind(e.kind[b]) !== 'capital') this.destroyBuilding(b, true);
        return true;
      }
      case 'ungarrison': {
        const b = c.building;
        if (b >= 0 && b < e.count && e.alive[b] && e.owner[b] === p) for (let u = 0; u < e.count; u++) if (e.alive[u] && e.carrier[u] === b && isBuildingKind(e.kind[b])) this.eject(u, b);
        return true;
      }
      case 'dig': {
        const tiles = c.tiles.filter((t) => this.canDig(p, t)).slice(0, 64);
        if (!tiles.length) { s.emit(p, 'cantDig'); return true; }
        for (const id of s.ownUnits(p, c.ids, (k) => k === Kind.WORKER)) {
          s.stop(id); e.task[id] = Task.DIG; e.queues[id] = tiles.slice(); e.acc[id] = 0;
          this.nextDig(id);
        }
        return true;
      }
      case 'ignite': {
        const t = c.tile;
        if (t < 0 || t >= s.map.biome.length || !this.flammable(t)) return true;
        for (const id of s.ownUnits(p, c.ids, (k) => k !== Kind.SETTLER && k !== Kind.WARSHIP && k !== Kind.TRANSPORT)) {
          s.stop(id); e.task[id] = Task.IGNITE; e.taskTile[id] = t; e.acc[id] = 0; s.goTo(id, s.tileRectAround(t));
        }
        return true;
      }
      case 'placeLine': {
        const bt = BUILDING_TYPES[c.btype];
        if (bt !== 'wall' && bt !== 'gate' && bt !== 'tower') return true;
        const d = buildingDef(bt), cost = costOf(d.wood, d.stone, 0, 0), sites: number[] = [];
        for (const t of c.tiles.slice(0, 64)) {
          if (s.canPlace(p, bt, t) !== null) continue;
          if (!s.canAfford(p, cost)) { s.emit(p, 'cantAfford', c.btype); break; }
          s.pay(p, cost);
          sites.push(s.createBuilding(p, bt, t, false));
        }
        if (!sites.length) { s.emit(p, 'cantPlace', c.btype); return true; }
        for (const id of s.ownUnits(p, c.ids, (k) => k === Kind.WORKER)) {
          s.stop(id); e.task[id] = Task.BUILD; e.taskEnt[id] = sites[0]; e.queues[id] = sites.slice(1);
          s.goTo(id, s.footprintRect(sites[0], 1));
        }
        return true;
      }
      case 'unload': {
        const ship = c.ship;
        if (ship < 0 || ship >= e.count || !e.alive[ship] || e.owner[ship] !== p || e.kind[ship] !== Kind.TRANSPORT) return true;
        s.stop(ship); e.task[ship] = Task.UNLOAD; e.taskTile[ship] = c.tile; s.goTo(ship, s.tileRectAround(c.tile));
        return true;
      }
    }
    return false;
  }

  /** Smart interaction targets added in Phase 3: garrison, board, attack. Returns true if handled. */
  interact(p: number, ids: number[], tg: number): boolean {
    const s = this.s, e = s.ents;
    const k = e.kind[tg];
    if (isBuildingKind(k) && e.owner[tg] === p && e.complete[tg] && buildingDef(buildingTypeOfKind(k)).garrison > 0) {
      // workers interacting with a capital still drop off cargo; soldiers and scouts garrison
      const soldiers = s.ownUnits(p, ids, (kk) => kk !== Kind.WARSHIP && kk !== Kind.TRANSPORT && kk !== Kind.SETTLER && kk !== Kind.RAM && kk !== Kind.WORKER);
      if (!soldiers.length) return false;
      for (const id of soldiers) { s.stop(id); e.task[id] = Task.GARRISON; e.taskEnt[id] = tg; s.goTo(id, s.footprintRect(tg, 1)); }
      return soldiers.length === s.ownUnits(p, ids).length;
    }
    if (k === Kind.TRANSPORT && e.owner[tg] === p) {
      for (const id of s.ownUnits(p, ids, (kk) => kk !== Kind.WARSHIP && kk !== Kind.TRANSPORT)) {
        s.stop(id); e.task[id] = Task.BOARD; e.taskEnt[id] = tg; s.goTo(id, s.tileRectAround(s.tileOf(tg), GRP.transportBoardRange));
      }
      return true;
    }
    if ((isUnitKind(k) || isBuildingKind(k)) && e.owner[tg] !== p && e.owner[tg] < s.players) {
      this.apply({ type: 'attack', ids, target: tg, tick: s.tick, player: p, seq: -1 });
      return true;
    }
    return false;
  }

  private patrolLeg(id: number): void {
    const s = this.s, e = s.ents;
    const to = (e.phase[id] & 1) === 0 ? e.patrolB[id] : e.patrolA[id];
    s.goTo(id, s.tileRectAround(to, 0));
  }

  // ------------------------------------------------------------------ tasks

  taskTick(id: number): void {
    const s = this.s, e = s.ents;
    if (e.waitPath[id]) return;
    switch (e.task[id]) {
      case Task.RETREAT:
      case Task.ROUT:
        if (!e.moving[id] && s.arrived(id) && e.task[id] === Task.RETREAT) s.stop(id);
        else if (!e.moving[id] && !s.arrived(id) && s.tick >= e.repathAt[id]) { e.repathAt[id] = s.tick + 30; this.goHome(id); }
        return;
      case Task.PATROL:
        if (!e.moving[id]) { if (s.arrived(id)) e.phase[id] ^= 1; this.patrolLeg(id); }
        return;
      case Task.GARRISON: {
        const b = e.taskEnt[id];
        if (b < 0 || !e.alive[b] || e.owner[b] !== e.owner[id]) { s.stop(id); return; }
        if (e.moving[id]) return;
        if (!s.arrived(id)) { if (s.tick >= e.repathAt[id]) { e.repathAt[id] = s.tick + 30; s.goTo(id, s.footprintRect(b, 1)); } return; }
        if (this.garrisonCount(b) >= buildingDef(buildingTypeOfKind(e.kind[b])).garrison) { s.emit(e.owner[id], 'garrisonFull', b); s.stop(id); return; }
        s.stop(id);
        e.carrier[id] = b;
        s.fogForce[e.owner[id]] = 1;
        return;
      }
      case Task.BOARD: {
        const ship = e.taskEnt[id];
        if (ship < 0 || !e.alive[ship] || e.kind[ship] !== Kind.TRANSPORT) { s.stop(id); return; }
        const st = s.tileOf(ship), ut = s.tileOf(id), w = s.map.w;
        const near = Math.max(Math.abs((st % w) - (ut % w)), Math.abs(Math.floor(st / w) - Math.floor(ut / w))) <= GRP.transportBoardRange;
        if (near) {
          let n = 0;
          for (let c = 0; c < e.count; c++) if (e.alive[c] && e.carrier[c] === ship) n += unitDef(unitTypeOfKind(e.kind[c])).pop;
          if (n + this.udef(id).pop > unitDef('transport').capacity) { s.emit(e.owner[id], 'transportFull', ship); s.stop(id); return; }
          s.stop(id); e.carrier[id] = ship;
          s.fogForce[e.owner[id]] = 1;
          return;
        }
        if (!e.moving[id]) s.goTo(id, s.tileRectAround(st, GRP.transportBoardRange));
        return;
      }
      case Task.UNLOAD: {
        if (e.moving[id]) return;
        if (!s.arrived(id)) { s.emit(e.owner[id], 'unreachable', id); s.stop(id); return; }
        const r = s.tileRectAround(e.taskTile[id], 1);
        for (let c = 0; c < e.count; c++) {
          if (!e.alive[c] || e.carrier[c] !== id) continue;
          const t = s.freeTileNear(r, false);
          e.carrier[c] = -1;
          const x = t % s.map.w;
          e.posX[c] = tileCenter(x); e.posY[c] = tileCenter((t - x) / s.map.w);
          s.stop(c);
          s.fogForce[e.owner[c]] = 1;
        }
        s.stop(id);
        return;
      }
      case Task.DIG: {
        const t = e.queues[id][0];
        if (t === undefined) { s.stop(id); return; }
        if (e.moving[id]) return;
        if (!this.canDig(e.owner[id], t)) { e.queues[id].shift(); this.nextDig(id); return; }
        if (!s.arrived(id)) { if (s.tick >= e.repathAt[id]) { e.repathAt[id] = s.tick + 30; s.goTo(id, s.tileRectAround(t)); } return; }
        e.acc[id] += TUNING.economy.buildPointsPerWorkerTick * s.mult(e.owner[id]);
        if (e.acc[id] >= T.trenchBuildPoints * 100) {
          e.acc[id] = 0;
          e.queues[id].shift();
          this.makeTrench(t);
          this.nextDig(id);
        }
        return;
      }
      case Task.IGNITE: {
        if (e.moving[id]) return;
        if (!s.arrived(id)) { s.stop(id); return; }
        if (++e.acc[id] >= F.igniteTicks) { this.ignite(e.taskTile[id]); s.stop(id); }
        return;
      }
    }
  }

  private nextDig(id: number): void {
    const s = this.s, e = s.ents, q = e.queues[id];
    while (q.length && !this.canDig(e.owner[id], q[0])) q.shift();
    if (!q.length) { s.stop(id); return; }
    e.task[id] = Task.DIG;
    s.goTo(id, s.tileRectAround(q[0]));
  }

  // ------------------------------------------------------------------ terrain: trenches and moats

  canDig(p: number, t: number): boolean {
    const s = this.s;
    if (t < 0 || t >= s.map.biome.length) return false;
    const b = s.map.biome[t];
    if (isWaterBiome(b) || b === Biome.TRENCH || b === Biome.MOUNTAIN || b === Biome.SNOW) return false;
    if (s.occ[t] || (s.res.type[t] !== RES_NONE && s.res.amount[t] > 0)) return false;
    const o = s.tileOwner[t];
    return o === p || (o === NO_OWNER && this.nearOwnTerritory(p, t, TUNING.economy.outpostReachOutsideTerritory));
  }

  makeTrench(t: number): void {
    const s = this.s;
    s.setBiome(t, Biome.TRENCH);
    s.trenchList.push(t);
    this.onTerrainChanged([t]);
  }

  /** Water flows into trenches touching water (one tile per interval), turning them into moats. */
  moatTick(): void {
    const s = this.s;
    if (!s.trenchList.length || s.tick % T.moatFillTicks !== 0) return;
    const { w, h, biome } = s.map;
    const fill: number[] = [];
    for (const t of s.trenchList) {
      if (biome[t] !== Biome.TRENCH) continue;
      const x = t % w, y = (t - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const b = biome[ny * w + nx];
        if (b === Biome.OCEAN || b === Biome.LAKE || b === Biome.RIVER || b === Biome.MOAT) { fill.push(t); break; }
      }
    }
    if (!fill.length) return;
    for (const t of fill) s.setBiome(t, Biome.MOAT);
    s.trenchList = s.trenchList.filter((t) => biome[t] === Biome.TRENCH);
    // land units caught in the water climb out to the nearest dry tile
    const e = s.ents, set = new Set(fill);
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0 || this.udef(id).water) continue;
      const t = s.tileOf(id);
      if (!set.has(t)) continue;
      const d = s.nearestPassable(t, 4, e.owner[id]);
      if (d >= 0) { const x = d % w; e.posX[id] = tileCenter(x); e.posY[id] = tileCenter((d - x) / w); }
    }
    for (const t of fill) s.emit(NO_OWNER, 'moat', t);
    this.onTerrainChanged(fill);
  }

  // ------------------------------------------------------------------ fire

  flammable(t: number): boolean {
    const s = this.s, o = s.occ[t];
    if (o) { const bt = buildingTypeOfKind(s.ents.kind[o - 1]); return !DEFENSIVE[bt]; }
    return s.map.biome[t] === Biome.FOREST && s.res.type[t] === Res.WOOD && s.res.amount[t] > 0;
  }

  ignite(t: number): void {
    const s = this.s;
    if (!this.flammable(t) || s.burning[t] > 0) return;
    s.burning[t] = F.burnTicks;
    s.burningList.push(t);
    s.changedTiles.push(t);
  }

  fireTick(): void {
    const s = this.s;
    if (!s.burningList.length) return;
    const { w, h } = s.map, e = s.ents;
    const spread = s.tick % F.spreadEveryTicks === 0, second = s.tick % 10 === 0;
    let unitsByTile: Map<number, number[]> | null = null;
    if (second) {
      unitsByTile = new Map();
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || !isUnitKind(e.kind[id]) || e.carrier[id] >= 0 || e.owner[id] >= s.players) continue;
        const t = s.tileOf(id), l = unitsByTile.get(t);
        if (l) l.push(id); else unitsByTile.set(t, [id]);
      }
    }
    const list = s.burningList.slice();
    const out: number[] = [];
    for (const t of list) {
      if (second) {
        for (const id of unitsByTile!.get(t) ?? []) { e.hp[id] -= F.unitDamagePerSecond; e.lastHit[id] = s.tick; }
        const o = s.occ[t];
        if (o) { e.hp[o - 1] -= F.buildingDamagePerSecond; e.lastHit[o - 1] = s.tick; }
      }
      if (spread) {
        const x = t % w, y = (t - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nb = ny * w + nx;
          if (s.burning[nb] === 0 && this.flammable(nb) && s.rngFire.int(100) < F.spreadChancePct) this.ignite(nb);
        }
      }
      s.burning[t]--;
      if (s.burning[t] <= 0) {
        s.burning[t] = 0;
        if (s.map.biome[t] === Biome.FOREST) s.depleteTile(t); // burnt forest → plains
        s.changedTiles.push(t);
      } else out.push(t);
    }
    // keep burning tiles plus anything ignited this tick, in deterministic order
    const fresh = s.burningList.slice(list.length);
    s.burningList = out.concat(fresh.filter((t) => s.burning[t] > 0));
  }

  // ------------------------------------------------------------------ elimination & conquest

  victoryTick(): void {
    const s = this.s, e = s.ents;
    if (s.tick % 10 !== 0) return;
    const hasTown = new Array(s.players).fill(false), hasCapital = new Array(s.players).fill(false);
    for (let b = 0; b < e.count; b++) {
      if (!e.alive[b] || !isBuildingKind(e.kind[b]) || !e.complete[b] || e.owner[b] >= s.players) continue;
      const bt = buildingTypeOfKind(e.kind[b]);
      if (bt === 'capital') { hasCapital[e.owner[b]] = true; hasTown[e.owner[b]] = true; }
      else if (bt === 'settlement') hasTown[e.owner[b]] = true;
    }
    for (let p = 0; p < s.players; p++) if (!s.ps[p].eliminated && !hasTown[p]) this.eliminate(p);
    if (s.players < 2 || s.winner >= 0) return;
    const withCapital = [];
    for (let p = 0; p < s.players; p++) if (!s.ps[p].eliminated && hasCapital[p]) withCapital.push(p);
    if (withCapital.length === 1) { s.winner = withCapital[0]; s.emit(withCapital[0], 'victory', 1); }
  }

  eliminate(p: number): void {
    const s = this.s, e = s.ents;
    s.ps[p].eliminated = true;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] !== p) continue;
      if (isUnitKind(e.kind[id])) { s.stop(id); e.kill(id); }
    }
    s.fogForce[p] = 1;
    const freed: number[] = [];
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || e.owner[id] !== p || !isBuildingKind(e.kind[id])) continue;
      const r = s.footprintRect(id);
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const t = y * s.map.w + x; if (s.occ[t] === id + 1) { s.occ[t] = 0; freed.push(t); } }
      e.kill(id);
    }
    for (const t of s.ownedList[p]) if (s.tileOwner[t] === p) s.tileOwner[t] = NO_OWNER;
    s.ownedList[p] = []; s.ps[p].landOwned = 0; s.ownerDirty = true;
    s.emit(p, 'eliminated', p);
    this.onTerrainChanged(freed);
  }

  /** Army strength for stats: Σ attack × max HP / 100 over military units. */
  armyStrength(p: number): number {
    const e = this.s.ents;
    let n = 0;
    for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && isMilitaryKind(e.kind[id])) n += Math.ceil((this.udef(id).attack * e.maxHp[id]) / 100);
    return n;
  }
}

/** Formation slots (tile indices) for a group moving to `goal` (box = square grid, line = one row). */
export function formationSlots(s: Sim, ids: number[], goal: number, line: boolean): number[] {
  const w = s.map.w, gx = goal % w, gy = (goal - gx) / w, n = ids.length;
  const e = s.ents;
  let cx = 0, cy = 0;
  for (const id of ids) { cx += e.posX[id] >> FP_SHIFT; cy += e.posY[id] >> FP_SHIFT; }
  cx = Math.floor(cx / n); cy = Math.floor(cy / n);
  const horizontal = Math.abs(gy - cy) >= Math.abs(gx - cx); // moving mostly north/south → row runs east-west
  const cols = line ? n : Math.ceil(isqrt(n * 4) / 2) || 1;
  const rows = Math.ceil(n / cols);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const a = c - Math.floor((cols - 1) / 2), b = r - Math.floor((rows - 1) / 2);
    const x = Math.max(0, Math.min(w - 1, gx + (horizontal ? a : b))), y = Math.max(0, Math.min(s.map.h - 1, gy + (horizontal ? b : a)));
    out.push(y * w + x);
  }
  return out;
}

export { FlowFields };
