// Game controller: owns the sim worker, Three.js renderer, camera, controls, minimap and HUD state.
import * as THREE from 'three';
import SimWorker from '../worker/sim.worker.ts?worker&inline';
import { TUNING, SPEED_NAMES, type MapSize, type SpeedName } from '../sim/core/tuning';
import { FP_ONE } from '../sim/core/fixed';
import { hex } from '../sim/core/hash';
import type { CommandBody } from '../sim/commands';
import type { SaveData } from '../sim/serialize';
import type { PlayerStats } from '../sim/stats';
import {
  BUILDABLE, BUILDING_TYPES, DROPOFF, FARM_YIELD, Kind, RES_NAMES, RES_NONE, TRAINS, UNIT_TYPES, buildingDef, isBuildingKind,
  isUnitKind, unitTypeOfKind, upgradeDef, type BuildingTypeName,
} from '../sim/defs';
import { Biome, isWaterBiome } from '../sim/world/mapgen';
import type { BuildingInfo, FromWorker, MapPayload, Snapshot, ToWorker } from '../worker/protocol';
import { Terrain, tileTopY } from '../render/terrain';
import { UnitLayer, type EntityView } from '../render/units';
import { NatureLayer } from '../render/nature';
import { RtsCamera } from '../render/camera';
import { Minimap } from '../render/minimap';
import { Controls } from '../input/controls';
import { sfx, setVolume } from '../audio/sfx';
import { store, type FeedItem } from './store';
import { qualityParams } from './settings';
import { BUILD_KEYS, BUILDING_NAMES, RES_LABELS, TRAIN_KEYS, UNIT_NAMES, UPGRADE_KEY } from '../ui/names';

THREE.ColorManagement.enabled = false;

export interface NewGameOptions { seed: string; size: MapSize; speed: SpeedName; players: number; spectator?: boolean }
export type StartOptions = { kind: 'new'; opts: NewGameOptions } | { kind: 'load'; save: SaveData };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private worker: Worker;
  private terrain!: Terrain;
  units!: UnitLayer;
  private nature!: NatureLayer;
  cam!: RtsCamera;
  private controls!: Controls;
  minimap!: Minimap;
  map!: MapPayload;
  viewer = 0;
  private owner!: Uint8Array;
  private sun = new THREE.DirectionalLight(0xffffff, 0.9);
  private amb = new THREE.AmbientLight(0xffffff, 0.55);
  private ghost: THREE.Mesh;
  private lastSnap: Snapshot | null = null;
  private buildingInfo = new Map<number, BuildingInfo>();
  private snapTime = 0;
  private startTile = 0;
  private frameTimes: number[] = [];
  private lastFrame = performance.now();
  private raf = 0;
  private waiters = new Map<number, (v: unknown) => void>();
  private reqId = 0;
  private lastHud = 0;
  private disposed = false;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private frameHook: ((dt: number) => void) | null = null;
  private groups = new Map<number, number[]>();
  private lastGroupKey = { key: -1, at: 0 };
  private hover = { x: 0, y: 0 };
  private feedSeq = 0;
  private lastFeedAt = new Map<string, number>();

  constructor(private host: HTMLElement, start: StartOptions) {
    this.ready = new Promise((r) => (this.resolveReady = r));
    const q = qualityParams(store.state.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setClearColor(0x0b0e13);
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.sun, this.amb);
    this.sun.position.set(0.5, 1, 0.75); // light the camera-facing (+z) walls too
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    setVolume(store.state.settings.volume, store.state.settings.muted);
    this.worker = new SimWorker();
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
    if (start.kind === 'new') {
      const o = start.opts;
      this.viewer = o.spectator ? -1 : 0;
      this.send({ type: 'init', settings: { seed: o.seed, size: o.size, players: o.players }, viewer: this.viewer, speed: o.speed, paused: false });
      store.set({ screen: 'loading', seed: o.seed, size: o.size, speed: o.speed, paused: false, winner: -1, feed: [], stats: null, error: '' });
    } else {
      this.viewer = 0;
      this.send({ type: 'load', save: start.save, viewer: 0, speed: 'normal' });
      store.set({ screen: 'loading', seed: start.save.settings.seed, size: start.save.settings.size, paused: true, winner: -1, feed: [], stats: null, error: '' });
    }
    window.addEventListener('resize', this.onResize);
  }

  whenReady(): Promise<void> { return this.ready; }
  private send(m: ToWorker): void { this.worker.postMessage(m); }
  cmd(body: CommandBody): void { this.send({ type: 'cmd', body }); }

  private request<T>(make: (id: number) => ToWorker): Promise<T> {
    const id = ++this.reqId;
    return new Promise<T>((res) => { this.waiters.set(id, res as (v: unknown) => void); this.send(make(id)); });
  }

  private onWorker(m: FromWorker): void {
    if (this.disposed) return;
    if (m.type === 'map') this.onMap(m.map, m.startTile, m.players);
    else if (m.type === 'snap') this.onSnap(m);
    else if (m.type === 'error') { store.set({ screen: 'menu', error: m.message }); this.dispose(); }
    else {
      const w = this.waiters.get(m.reqId);
      this.waiters.delete(m.reqId);
      if (m.type === 'hash') w?.({ tick: m.tick, hash: m.hash });
      else if (m.type === 'save') w?.(m.save);
      else if (m.type === 'dump') w?.(m.stats);
    }
  }

  private onMap(map: MapPayload, startTile: number, players: number): void {
    this.map = map;
    this.startTile = startTile;
    this.owner = new Uint8Array(map.w * map.h).fill(255);
    const q = qualityParams(store.state.settings.quality);
    this.terrain = new Terrain(map);
    this.terrain.material.uniforms.uWater.value = q.water ? 1 : 0;
    this.nature = new NatureLayer(map, q.treeDensity);
    this.units = new UnitLayer(map);
    this.scene.add(this.terrain.group, this.nature.group, this.units.group);
    const r = this.host.getBoundingClientRect();
    this.cam = new RtsCamera(map.w, map.h, r.width / Math.max(1, r.height));
    this.jumpToStart();
    this.minimap = new Minimap(map, (x, z) => this.cam.setTarget(x, z));
    this.host.appendChild(this.minimap.root);
    this.controls = new Controls(this.renderer.domElement, this.cam, {
      onLeftClick: (x, y, shift) => this.leftClick(x, y, shift),
      onRightClick: (x, y, shift) => this.rightClick(x, y, shift),
      onKey: (e) => this.onKey(e),
      onBoxDrag: (rect) => store.set({ box: rect }),
      onBoxSelect: (rect, shift) => this.boxSelect(rect, shift),
      onHover: (x, y) => { this.hover.x = x; this.hover.y = y; },
    });
    this.onResize();
    store.set({ screen: 'game', mapHash: hex(map.hash), tick: 0, players });
    this.raf = requestAnimationFrame(this.frame);
    this.resolveReady();
  }

  private onSnap(s: Snapshot): void {
    if (!this.terrain) return;
    if (s.tiles) { this.terrain.applyTiles(s.tiles); this.nature.applyTiles(s.tiles); this.minimap.applyTiles(s.tiles); }
    if (s.fog) { this.terrain.setFog(s.fog); this.minimap.setFog(s.fog); this.nature.setFog(s.fog); }
    if (s.owner) { this.owner = s.owner.slice(); this.terrain.setOwner(s.owner); this.minimap.setOwner(s.owner); }
    if (!this.lastSnap || s.tick !== this.lastSnap.tick) { this.units.update(s.ents); this.snapTime = performance.now(); }
    this.buildingInfo.clear();
    for (const b of s.buildings) this.buildingInfo.set(b.id, b);
    this.lastSnap = s;
    for (const ev of s.events) this.onEvent(ev.type, ev.player, ev.a, ev.b);
    const perf = store.state.perf;
    store.set({
      tick: s.tick, isNight: s.isNight, dayPhase: s.dayPhase, dayLength: s.dayLength, speed: s.speed, paused: s.paused,
      pendingOrders: s.pending.length, stats: s.stats, winner: s.winner,
      perf: { ...perf, simMs: s.simMsPerTick, tps: s.ticksPerSec, dropped: s.droppedTicks, entities: s.ents.length / 8 },
    });
  }

  // ---------------------------------------------------------------- notifications (F-155)

  private onEvent(type: string, player: number, a?: number, b?: number): void {
    const bn = (i?: number): string => (i !== undefined && i >= 0 ? BUILDING_NAMES[BUILDING_TYPES[i]] : 'building');
    let text = '', kind: FeedItem['kind'] = 'info';
    switch (type) {
      case 'built': text = `${bn(a)} complete`; kind = 'good'; sfx.built(); break;
      case 'trained': text = `${UNIT_NAMES[UNIT_TYPES[a ?? 0]]} ready`; kind = 'good'; sfx.trained(); break;
      case 'upgraded': text = `${bn(a)} upgraded`; kind = 'good'; sfx.built(); break;
      case 'settled': text = 'New settlement founded'; kind = 'good'; sfx.built(); break;
      case 'deposit': text = `${RES_LABELS[a ?? 0]} deposit discovered`; sfx.discovery(); break;
      case 'depleted': text = `A ${RES_LABELS[a ?? 0].toLowerCase()} source ran out`; break;
      case 'housing': text = 'Not enough housing: build houses'; kind = 'warn'; sfx.warning(); break;
      case 'starving': text = 'Your people are starving! Work halves and training stops'; kind = 'warn'; sfx.warning(); break;
      case 'fed': text = 'Food supply restored'; kind = 'good'; break;
      case 'cantPlace': text = `Can't build ${bn(a).toLowerCase()} there`; kind = 'warn'; break;
      case 'cantAfford': text = 'Not enough resources'; kind = 'warn'; break;
      case 'noDropoff': text = `No drop-off for ${RES_LABELS[a ?? 0].toLowerCase()}: build a camp or storehouse`; kind = 'warn'; break;
      case 'unreachable': text = "Can't reach that place"; kind = 'warn'; break;
      case 'victory': text = player === this.viewer ? 'Victory! You dominate the world' : `P${player + 1} has won by domination`; kind = player === this.viewer ? 'good' : 'warn'; sfx.victory(); break;
      default: return;
    }
    const now = performance.now(), last = this.lastFeedAt.get(text) ?? -1e9;
    if (now - last < 4000) return; // de-duplicate bursts
    this.lastFeedAt.set(text, now);
    const feed = [...store.state.feed, { id: ++this.feedSeq, text, kind, at: now }].slice(-6);
    store.set({ feed });
    void b;
  }

  // ---------------------------------------------------------------- frame

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.frameTimes.push(now - this.lastFrame);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.lastFrame = now;
    this.frameHook?.(dt);
    this.controls.update(dt);
    const s = this.lastSnap;
    const tickMs = 1000 / (TUNING.sim.tickHz * TUNING.sim.speeds[s?.speed ?? 'normal']);
    const alpha = !s || s.paused ? 1 : Math.min(1, (now - this.snapTime) / tickMs);
    this.units.render(alpha);
    this.updateGhost();
    const night = s ? nightness(s.dayPhase, s.dayLength, TUNING.dayNight.nightTicks) : 0;
    this.terrain.setLighting(night, now / 1000);
    this.sun.intensity = 0.75 - 0.5 * night;
    this.amb.intensity = 0.8 - 0.42 * night;
    this.renderer.render(this.scene, this.cam.camera);
    if (now - this.lastHud > 200) {
      this.lastHud = now;
      this.minimap.redraw();
      const feed = store.state.feed.filter((f) => now - f.at < 12000);
      store.set({ perf: { ...store.state.perf, ...this.perfNow() }, selected: this.units.selected.size, selection: this.selectionInfo(), feed: feed.length === store.state.feed.length ? store.state.feed : feed });
    }
    this.minimap.drawView(this.viewCorners(), this.units.visible.filter((v) => v.owner !== 254 && v.owner !== 255));
  };

  private perfNow(): { fps: number; p95Ms: number; drawCalls: number; triangles: number } {
    const recent = this.frameTimes.slice(-120);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const sorted = this.frameTimes.slice(-300).sort((a, b) => a - b);
    const info = this.renderer.info.render;
    return { fps: avg > 0 ? 1000 / avg : 0, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, drawCalls: info.calls, triangles: info.triangles };
  }

  private selectionInfo(): typeof store.state.selection {
    const units: Record<string, number> = {};
    let building: typeof store.state.selection.building = null, unit: typeof store.state.selection.unit = null;
    const ids = [...this.units.selected];
    for (const id of ids) {
      const v = this.units.get(id);
      if (!v) continue;
      if (isUnitKind(v.kind)) {
        const t = unitTypeOfKind(v.kind);
        units[t] = (units[t] ?? 0) + 1;
        if (ids.length === 1) unit = { id, type: t, task: v.a, carryAmt: v.b & 0xffff, carryType: (v.b >> 16) & 255 };
      } else if (isBuildingKind(v.kind) && ids.length === 1) {
        building = { id, btype: v.btype!, level: (v.a >> 8) & 255, complete: (v.flags & 2) !== 0, progressPermille: v.b, info: this.buildingInfo.get(id) ?? null, owner: v.owner };
      }
    }
    return { units, building, unit };
  }

  private viewCorners(): ({ x: number; z: number } | null)[] {
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => {
      const p = this.cam.groundAt(x, y, 1);
      return p ? { x: p.x, z: p.z } : null;
    });
  }

  // ---------------------------------------------------------------- picking

  private ndc(clientX: number, clientY: number): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1];
  }

  /** Point hit by a screen position, by marching the view ray over the terraced heightfield. */
  pickTile(clientX: number, clientY: number): { x: number; z: number } | null {
    const [nx, ny] = this.ndc(clientX, clientY);
    const ray = this.cam.ray(nx, ny);
    const p = ray.origin.clone(), step = ray.direction.clone().multiplyScalar(0.15);
    for (let k = 0; k < 8000; k++) {
      p.add(step);
      if (p.x < 0 || p.z < 0 || p.x >= this.map.w || p.z >= this.map.h) { if (p.y < 0) return null; continue; }
      const i = Math.floor(p.z) * this.map.w + Math.floor(p.x);
      if (p.y <= tileTopY(this.map, i)) return { x: p.x, z: p.z };
    }
    return null;
  }

  screenOf(v: { x: number; y: number; z: number }, lift = 0.4): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector3(v.x, v.y + lift, v.z).project(this.cam.camera);
    return { x: ((p.x + 1) / 2) * r.width + r.left, y: ((1 - p.y) / 2) * r.height + r.top };
  }

  /** Entity under the cursor: units/animals by screen distance, buildings by footprint. */
  private entityAt(clientX: number, clientY: number): EntityView | null {
    let best: EntityView | null = null, bestD = 20 * 20;
    for (const v of this.units.visible) {
      if (isBuildingKind(v.kind)) continue;
      const s = this.screenOf(v);
      const d = (s.x - clientX) ** 2 + (s.y - clientY) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) return best;
    const t = this.pickTile(clientX, clientY);
    if (!t) return null;
    for (const v of this.units.visible) {
      if (!isBuildingKind(v.kind)) continue;
      if (t.x >= v.anchorX! && t.x < v.anchorX! + v.size! && t.z >= v.anchorZ! && t.z < v.anchorZ! + v.size!) return v;
    }
    return null;
  }

  private leftClick(clientX: number, clientY: number, shift: boolean): void {
    if (store.state.placing) { this.placeAt(clientX, clientY, shift); return; }
    const v = this.entityAt(clientX, clientY);
    if (!shift) this.units.selected.clear();
    if (v && (v.owner === this.viewer || this.viewer < 0 || !isUnitKind(v.kind))) {
      if (isBuildingKind(v.kind) || !isUnitKind(v.kind)) { this.units.selected.clear(); this.units.selected.add(v.id); }
      else this.units.selected.add(v.id);
    }
    sfx.click();
    store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
  }

  private boxSelect(r: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    if (!shift) this.units.selected.clear();
    for (const v of this.units.visible) {
      if (v.owner !== this.viewer || !isUnitKind(v.kind)) continue;
      const s = this.screenOf(v);
      if (s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1) this.units.selected.add(v.id);
    }
    store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
  }

  private ownSelectedUnits(): number[] {
    return [...this.units.selected].filter((id) => { const v = this.units.get(id); return v && v.owner === this.viewer && isUnitKind(v.kind); });
  }

  /** Context order: gather / hunt / build / work / drop off / move — decided by what's under the cursor. */
  private rightClick(clientX: number, clientY: number, _shift: boolean): void {
    if (store.state.placing) { this.cancelPlacement(); return; }
    const ids = this.ownSelectedUnits();
    if (!ids.length) return;
    const workers = ids.filter((id) => this.units.get(id)?.kind === Kind.WORKER);
    const v = this.entityAt(clientX, clientY);
    if (v && workers.length && (v.kind === Kind.ANIMAL || v.kind === Kind.CARCASS || (isBuildingKind(v.kind) && v.owner === this.viewer))) {
      this.cmd({ type: 'interact', ids: workers, target: v.id });
      const rest = ids.filter((id) => !workers.includes(id));
      if (rest.length) this.moveTo(rest, v.x, v.z);
      sfx.order();
      return;
    }
    const t = this.pickTile(clientX, clientY);
    if (!t) return;
    const tile = Math.floor(t.z) * this.map.w + Math.floor(t.x);
    if (workers.length && this.nature.resTypeAt(tile) !== RES_NONE) {
      this.cmd({ type: 'gather', ids: workers, tile });
      const rest = ids.filter((id) => !workers.includes(id));
      if (rest.length) this.moveTo(rest, t.x, t.z);
    } else this.moveTo(ids, t.x, t.z);
    sfx.order();
  }

  private moveTo(ids: number[], x: number, z: number): void {
    this.cmd({ type: 'move', ids, x: Math.floor(x * FP_ONE), y: Math.floor(z * FP_ONE) });
  }

  /** Back-compat for tests: move whatever is selected. */
  moveSelected(tileX: number, tileZ: number): void { this.moveTo(this.ownSelectedUnits(), tileX, tileZ); }

  // ---------------------------------------------------------------- placement

  startPlacement(bt: BuildingTypeName): void {
    const ids = this.ownSelectedUnits();
    const need = bt === 'settlement' ? Kind.SETTLER : Kind.WORKER;
    if (!ids.some((id) => this.units.get(id)?.kind === need)) return;
    store.set({ placing: bt });
  }
  cancelPlacement(): void { store.set({ placing: null }); this.ghost.visible = false; }

  private anchorAt(clientX: number, clientY: number, bt: BuildingTypeName): number {
    const t = this.pickTile(clientX, clientY);
    if (!t) return -1;
    const s = buildingDef(bt).size;
    const ax = Math.round(t.x - s / 2), az = Math.round(t.z - s / 2);
    if (ax < 0 || az < 0 || ax + s > this.map.w || az + s > this.map.h) return -1;
    return az * this.map.w + ax;
  }

  /** Client-side preview check (the sim re-checks authoritatively). */
  placementValid(bt: BuildingTypeName, anchor: number): boolean {
    if (anchor < 0) return false;
    const { w } = this.map, s = buildingDef(bt).size, ax = anchor % w, az = (anchor - ax) / w;
    let nearWater = false;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const t = (az + dz) * w + ax + dx, b = this.map.biome[t];
      if (isWaterBiome(b) || !BUILDABLE[b] || this.nature.resTypeAt(t) !== RES_NONE) return false;
      if (bt === 'farm' && FARM_YIELD[b] <= 0) return false;
      const o = this.owner[t];
      if (bt === 'settlement' ? o !== 255 : bt === 'outpost' ? o !== 255 && o !== this.viewer : o !== this.viewer) return false;
    }
    for (const v of this.units.visible) {
      if (!isBuildingKind(v.kind)) continue;
      if (ax < v.anchorX! + v.size! && ax + s > v.anchorX! && az < v.anchorZ! + v.size! && az + s > v.anchorZ!) return false;
    }
    if (bt === 'fishingHut') {
      for (let dz = -1; dz <= s; dz++) for (let dx = -1; dx <= s; dx++) {
        const x = ax + dx, z = az + dz;
        if (x < 0 || z < 0 || x >= w || z >= this.map.h) continue;
        const b = this.map.biome[z * w + x];
        if (b === Biome.OCEAN || b === Biome.LAKE || b === Biome.RIVER) nearWater = true;
      }
      if (!nearWater) return false;
    }
    return true;
  }

  private updateGhost(): void {
    const bt = store.state.placing as BuildingTypeName | null;
    if (!bt) { this.ghost.visible = false; return; }
    const a = this.anchorAt(this.hover.x, this.hover.y, bt);
    if (a < 0) { this.ghost.visible = false; return; }
    const s = buildingDef(bt).size, ax = a % this.map.w, az = (a - ax) / this.map.w;
    let y = 0;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) y = Math.max(y, tileTopY(this.map, (az + dz) * this.map.w + ax + dx));
    this.ghost.scale.set(s, 1, s);
    this.ghost.position.set(ax + s / 2, y, az + s / 2);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(this.placementValid(bt, a) ? 0x55ff88 : 0xff5555);
    this.ghost.visible = true;
  }

  private placeAt(clientX: number, clientY: number, keep: boolean): void {
    const bt = store.state.placing as BuildingTypeName;
    const a = this.anchorAt(clientX, clientY, bt);
    if (a < 0) return;
    const need = bt === 'settlement' ? Kind.SETTLER : Kind.WORKER;
    const ids = this.ownSelectedUnits().filter((id) => this.units.get(id)?.kind === need);
    this.cmd({ type: 'place', ids, btype: BUILDING_TYPES.indexOf(bt), tile: a });
    sfx.order();
    if (!keep) this.cancelPlacement();
  }

  // ---------------------------------------------------------------- building actions

  train(building: number, utype: number): void { this.cmd({ type: 'train', building, utype }); sfx.click(); }
  cancelTrain(building: number, index: number): void { this.cmd({ type: 'cancelTrain', building, index }); sfx.click(); }
  upgrade(building: number): void { this.cmd({ type: 'upgrade', building }); sfx.click(); }

  /** Can the viewer afford a cost right now (UI enabling)? */
  canAfford(cost: Partial<Record<(typeof RES_NAMES)[number], number>>): boolean {
    const st = store.state.stats?.stock;
    if (!st) return false;
    return RES_NAMES.every((r, i) => st[i] >= (cost[r] ?? 0));
  }

  // ---------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { if (store.state.placing) this.cancelPlacement(); else { this.units.selected.clear(); store.set({ selected: 0, selection: this.selectionInfo() }); } return; }
    if (e.key === ' ') { e.preventDefault(); this.setPaused(!store.state.paused); return; }
    if (e.key === '=' || e.key === '+') { this.stepSpeed(1); return; }
    if (e.key === '-' || e.key === '_') { this.stepSpeed(-1); return; }
    if (e.key === 'F3') { e.preventDefault(); store.set({ showPerf: !store.state.showPerf }); return; }
    if (e.key === 'Tab') { e.preventDefault(); store.set({ showStats: !store.state.showStats }); return; }
    if (e.key === 'Home') { this.jumpToStart(); return; }
    if (k === 'o') { this.setOwnerOverlay(!store.state.ownerOverlay); return; }
    // control groups: Ctrl+digit assigns, digit recalls (twice quickly = centre camera)
    if (/^[0-9]$/.test(e.key)) {
      const n = +e.key;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups.set(n, [...this.units.selected]); return; }
      const g = (this.groups.get(n) ?? []).filter((id) => this.units.get(id));
      if (!g.length) return;
      this.units.selected.clear();
      for (const id of g) this.units.selected.add(id);
      const now = performance.now();
      if (this.lastGroupKey.key === n && now - this.lastGroupKey.at < 400) { const v = this.units.get(g[0])!; this.cam.setTarget(v.x, v.z); }
      this.lastGroupKey = { key: n, at: now };
      store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
      return;
    }
    const sel = this.selectionInfo();
    if (sel.building && sel.building.owner === this.viewer && sel.building.complete) {
      const bt = sel.building.btype as BuildingTypeName;
      for (const [u, key] of Object.entries(TRAIN_KEYS)) if (k === key && TRAINS[bt]?.includes(u as never)) { this.train(sel.building.id, UNIT_TYPES.indexOf(u as never)); return; }
      if (k === UPGRADE_KEY && upgradeDef(bt, sel.building.level + 1)) { this.upgrade(sel.building.id); return; }
    }
    if (sel.units.worker || sel.units.settler) {
      for (const [bt, key] of Object.entries(BUILD_KEYS)) if (k === key) { if ((bt === 'settlement') === !!sel.units.settler || (bt !== 'settlement' && sel.units.worker)) this.startPlacement(bt as BuildingTypeName); return; }
    }
  }

  setSpeed(speed: SpeedName): void { this.send({ type: 'speed', speed }); store.set({ speed }); }
  setPaused(paused: boolean): void { this.send({ type: 'pause', paused }); store.set({ paused }); }
  stepSpeed(dir: number): void {
    const i = SPEED_NAMES.indexOf(store.state.speed);
    this.setSpeed(SPEED_NAMES[Math.max(0, Math.min(SPEED_NAMES.length - 1, i + dir))]);
  }
  setOwnerOverlay(on: boolean): void {
    this.terrain.material.uniforms.uOwnerOverlay.value = on ? 1 : 0;
    this.minimap.setOwnerOverlay(on);
    store.set({ ownerOverlay: on });
  }
  jumpToStart(): void {
    const x = this.startTile % this.map.w, z = Math.floor(this.startTile / this.map.w);
    this.cam.setTarget(x + 0.5, z + 0.5);
  }

  private onResize = (): void => {
    const r = this.host.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height);
    this.cam?.resize(r.width / Math.max(1, r.height));
  };

  // ---------------------------------------------------------------- save / debug hooks

  save(): Promise<SaveData> { return this.request<SaveData>((reqId) => ({ type: 'save', reqId })); }
  dumpStats(): Promise<PlayerStats> { return this.request<PlayerStats>((reqId) => ({ type: 'dump', reqId })); }
  requestHash(): Promise<{ tick: number; hash: number }> { return this.request((reqId) => ({ type: 'hash', reqId })); }
  stallWorker(ms: number): void { this.send({ type: 'stall', ms }); }
  get snapshot(): Snapshot | null { return this.lastSnap; }
  dropoffAccepts(bt: BuildingTypeName, res: number): boolean { return !!DROPOFF[bt]?.includes(res); }

  /** Scripted camera sweep across the map; returns frame statistics. */
  sweep(seconds: number, distance = 40): Promise<{ frames: number; avgFps: number; p95Ms: number; p99Ms: number; worstMs: number }> {
    return new Promise((resolve) => {
      const times: number[] = [];
      let t = 0;
      const startDist = this.cam.distance;
      this.cam.distance = Math.min(distance, this.cam.maxDist);
      this.frameHook = (dt) => {
        t += dt;
        times.push(dt * 1000);
        const a = (t / seconds) * Math.PI * 2;
        this.cam.setTarget(this.map.w * (0.5 + 0.35 * Math.sin(a)), this.map.h * (0.5 + 0.35 * Math.sin(a * 2)));
        if (t >= seconds) {
          this.frameHook = null;
          this.cam.distance = startDist; this.cam.apply();
          const sorted = times.slice(5).sort((x, y) => x - y);
          const avg = sorted.reduce((x, y) => x + y, 0) / sorted.length;
          resolve({ frames: sorted.length, avgFps: 1000 / avg, p95Ms: sorted[Math.floor(sorted.length * 0.95)], p99Ms: sorted[Math.floor(sorted.length * 0.99)], worstMs: sorted[sorted.length - 1] });
        }
      };
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.worker.terminate();
    this.controls?.dispose();
    this.terrain?.dispose();
    this.nature?.dispose();
    this.units?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.minimap?.root.remove();
  }
}

/** 0 = full day, 1 = full night, with a short dusk/dawn ramp. */
export function nightness(phase: number, dayLen: number, nightTicks: number): number {
  const ramp = 120, start = dayLen - nightTicks;
  if (phase < start - ramp) return 0;
  if (phase < start) return (phase - (start - ramp)) / ramp;
  if (phase >= dayLen - ramp) return 1 - (phase - (dayLen - ramp)) / ramp;
  return 1;
}
