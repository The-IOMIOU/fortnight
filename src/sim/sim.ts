// The deterministic simulation. No DOM, no wall-clock time, no Math.random, no floats in state.
// Runs identically in the Web Worker, on the main thread (tests/debug) and in Node (harness).

import { TUNING, type MapSize } from './core/tuning';
import { Hasher } from './core/hash';
import { FP_ONE, FP_SHIFT, isqrt, tileCenter } from './core/fixed';
import { generateMap, isWaterBiome, type GameMap } from './world/mapgen';
import { FogLayer, circleOffsets, FOG_VISIBLE } from './world/fog';
import { Entities, Kind } from './entities/entities';
import { compareCommands, type Command } from './commands';

export interface SimSettings {
  seed: string;
  size: MapSize;
  /** Number of player slots on the map (1..maxPlayers for the size). */
  players: number;
}

export const NO_OWNER = 255;

export class Sim {
  readonly map: GameMap;
  readonly ents: Entities;
  readonly fog: FogLayer[];
  readonly tileOwner: Uint8Array;
  readonly players: number;
  tick = 0;
  private pending: Command[] = [];
  private lastTile: Int32Array;
  private ownedTiles: number[][];
  readonly dayLength = TUNING.dayNight.dayLengthTicks;
  readonly nightStart = TUNING.dayNight.dayLengthTicks - TUNING.dayNight.nightTicks;

  constructor(readonly settings: SimSettings) {
    this.map = generateMap(settings.seed, settings.size);
    const { w, h } = this.map;
    const maxP = TUNING.map.sizes[settings.size].maxPlayers;
    this.players = Math.max(1, Math.min(maxP, settings.players | 0));
    this.ents = new Entities(256);
    this.fog = [];
    this.tileOwner = new Uint8Array(w * h).fill(NO_OWNER);
    this.ownedTiles = [];
    const scout = TUNING.units.scout;
    for (let p = 0; p < this.players; p++) {
      this.fog.push(new FogLayer(w, h));
      const s = this.map.starts[p], sx = s % w, sy = (s - sx) / w;
      // Starting claim (territory rules proper arrive in Phase 2, F-055).
      const owned: number[] = [];
      const off = circleOffsets(TUNING.map.startClaimRadius);
      for (let k = 0; k < off.length; k += 2) {
        const x = sx + off[k], y = sy + off[k + 1];
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (isWaterBiome(this.map.biome[i]) || this.tileOwner[i] !== NO_OWNER) continue;
        this.tileOwner[i] = p; owned.push(i);
      }
      this.ownedTiles.push(owned);
      this.ents.spawn(Kind.SCOUT, p, tileCenter(sx), tileCenter(sy), scout.speed, scout.vision);
    }
    this.lastTile = new Int32Array(this.ents.capacity).fill(-1);
    this.updateFog(true);
  }

  get isNight(): boolean { return this.tick % this.dayLength >= this.nightStart; }
  /** 0..dayLength-1 */
  get dayPhase(): number { return this.tick % this.dayLength; }

  /** Queue a command. Commands for past ticks are rejected (returns false). */
  enqueue(cmd: Command): boolean {
    if (cmd.tick < this.tick) return false;
    let i = this.pending.length;
    while (i > 0 && compareCommands(this.pending[i - 1], cmd) > 0) i--;
    this.pending.splice(i, 0, cmd);
    return true;
  }
  get pendingCommands(): readonly Command[] { return this.pending; }

  step(): void {
    // 1. commands for this tick
    let n = 0;
    while (n < this.pending.length && this.pending[n].tick === this.tick) n++;
    const now = this.pending.splice(0, n);
    for (const c of now) this.apply(c);
    // 2. movement
    this.moveSystem();
    // 3. vision
    this.updateFog(false);
    this.tick++;
  }

  private apply(c: Command): void {
    const e = this.ents, { w, h } = this.map;
    if (c.type === 'move') {
      const x = Math.max(0, Math.min(w * FP_ONE - 1, c.x | 0));
      const y = Math.max(0, Math.min(h * FP_ONE - 1, c.y | 0));
      for (const id of c.ids) {
        if (id < 0 || id >= e.count || !e.alive[id] || e.owner[id] !== c.player) continue;
        e.tgtX[id] = x; e.tgtY[id] = y; e.moving[id] = 1;
      }
    }
  }

  private moveSystem(): void {
    const e = this.ents, m = this.map, w = m.w;
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id] || !e.moving[id]) continue;
      const dx = e.tgtX[id] - e.posX[id], dy = e.tgtY[id] - e.posY[id];
      const dist = isqrt(dx * dx + dy * dy), sp = e.speed[id];
      let nx: number, ny: number;
      if (dist <= sp) { nx = e.tgtX[id]; ny = e.tgtY[id]; }
      else { nx = e.posX[id] + Math.trunc((dx * sp) / dist); ny = e.posY[id] + Math.trunc((dy * sp) / dist); }
      // Phase 1 has no pathfinding (F-078, Phase 3): straight lines, stop at water.
      const ti = (ny >> FP_SHIFT) * w + (nx >> FP_SHIFT);
      if (isWaterBiome(m.biome[ti])) { e.moving[id] = 0; continue; }
      e.posX[id] = nx; e.posY[id] = ny;
      if (nx === e.tgtX[id] && ny === e.tgtY[id]) e.moving[id] = 0;
    }
  }

  private updateFog(force: boolean): void {
    const e = this.ents, w = this.map.w;
    if (this.lastTile.length < e.capacity) {
      const b = new Int32Array(e.capacity).fill(-1); b.set(this.lastTile); this.lastTile = b;
    }
    const changed = new Uint8Array(this.players);
    for (let id = 0; id < e.count; id++) {
      if (!e.alive[id]) continue;
      const t = (e.posY[id] >> FP_SHIFT) * w + (e.posX[id] >> FP_SHIFT);
      if (t !== this.lastTile[id]) { this.lastTile[id] = t; changed[e.owner[id]] = 1; }
    }
    for (let p = 0; p < this.players; p++) {
      if (!force && !changed[p]) continue;
      const f = this.fog[p];
      f.begin();
      for (const i of this.ownedTiles[p]) f.stampTile(i);
      for (let id = 0; id < e.count; id++) {
        if (!e.alive[id] || e.owner[id] !== p) continue;
        f.stampCircle(e.posX[id] >> FP_SHIFT, e.posY[id] >> FP_SHIFT, e.vision[id]);
      }
      f.dirty = true;
    }
  }

  /** Is entity `id` visible to `viewer`? (-1 = spectator sees all.) */
  visibleTo(id: number, viewer: number): boolean {
    const e = this.ents;
    if (viewer < 0 || e.owner[id] === viewer) return true;
    const t = (e.posY[id] >> FP_SHIFT) * this.map.w + (e.posX[id] >> FP_SHIFT);
    return this.fog[viewer].data[t] === FOG_VISIBLE;
  }

  hash(): number {
    const hs = new Hasher();
    hs.u32(this.tick);
    hs.u32(this.map.hash);
    for (const v of this.ents.hashViews()) { hs.u32(v.byteLength); hs.bytes(v); }
    for (const f of this.fog) hs.bytes(f.data);
    hs.bytes(this.tileOwner);
    hs.u32(this.pending.length);
    return hs.digest();
  }
}

export const ENTITY_STRIDE = 6; // id, kind, owner, posX, posY, moving

/** Fog-filtered entity list for one viewer (what the renderer may know about). */
export function packVisibleEntities(sim: Sim, viewer: number): Int32Array {
  const e = sim.ents;
  const out: number[] = [];
  for (let id = 0; id < e.count; id++) {
    if (!e.alive[id] || !sim.visibleTo(id, viewer)) continue;
    out.push(id, e.kind[id], e.owner[id], e.posX[id], e.posY[id], e.moving[id]);
  }
  return new Int32Array(out);
}
