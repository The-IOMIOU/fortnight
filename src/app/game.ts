// Game controller: owns the sim worker, Three.js renderer, camera, controls, minimap and perf stats.
import * as THREE from 'three';
import { TUNING, SPEED_NAMES, type MapSize, type SpeedName } from '../sim/core/tuning';
import { FP_ONE } from '../sim/core/fixed';
import { hex } from '../sim/core/hash';
import type { FromWorker, MapPayload, Snapshot, ToWorker } from '../worker/protocol';
import { Terrain, tileTopY } from '../render/terrain';
import { UnitLayer } from '../render/units';
import { RtsCamera } from '../render/camera';
import { Minimap } from '../render/minimap';
import { Controls } from '../input/controls';
import { store } from './store';

THREE.ColorManagement.enabled = false;

export interface NewGameOptions { seed: string; size: MapSize; speed: SpeedName; players: number; spectator?: boolean }

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private worker: Worker;
  private terrain!: Terrain;
  private units!: UnitLayer;
  cam!: RtsCamera;
  private controls!: Controls;
  minimap!: Minimap;
  map!: MapPayload;
  private sun = new THREE.DirectionalLight(0xffffff, 0.9);
  private amb = new THREE.AmbientLight(0xffffff, 0.55);
  private lastSnap: Snapshot | null = null;
  private snapTime = 0;
  private startTile = 0;
  private frameTimes: number[] = [];
  private lastFrame = performance.now();
  private raf = 0;
  private hashWaiters = new Map<number, (h: { tick: number; hash: number }) => void>();
  private reqId = 0;
  private lastMinimapDraw = 0;
  private disposed = false;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  /** Frame callback used by benchmark sweeps. */
  private frameHook: ((dt: number) => void) | null = null;

  constructor(private host: HTMLElement, readonly opts: NewGameOptions) {
    this.ready = new Promise((r) => (this.resolveReady = r));
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0b0e13);
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.sun, this.amb);
    this.sun.position.set(0.45, 1, 0.3);
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
    this.send({ type: 'init', settings: { seed: opts.seed, size: opts.size, players: opts.players }, viewer: opts.spectator ? -1 : 0, speed: opts.speed, paused: false });
    store.set({ screen: 'loading', seed: opts.seed, size: opts.size, speed: opts.speed, paused: false });
    window.addEventListener('resize', this.onResize);
  }

  whenReady(): Promise<void> { return this.ready; }
  private send(m: ToWorker): void { this.worker.postMessage(m); }

  private onWorker(m: FromWorker): void {
    if (this.disposed) return;
    if (m.type === 'map') this.onMap(m.map, m.startTile);
    else if (m.type === 'snap') this.onSnap(m);
    else if (m.type === 'hash') { this.hashWaiters.get(m.reqId)?.({ tick: m.tick, hash: m.hash }); this.hashWaiters.delete(m.reqId); }
  }

  private onMap(map: MapPayload, startTile: number): void {
    this.map = map;
    this.startTile = startTile;
    this.terrain = new Terrain(map);
    this.units = new UnitLayer(map);
    this.scene.add(this.terrain.group, this.units.group);
    const r = this.host.getBoundingClientRect();
    this.cam = new RtsCamera(map.w, map.h, r.width / Math.max(1, r.height));
    this.jumpToStart();
    this.minimap = new Minimap(map, (x, z) => this.cam.setTarget(x, z));
    this.host.appendChild(this.minimap.root);
    this.controls = new Controls(this.renderer.domElement, this.cam, {
      onLeftClick: (x, y, shift) => this.select(x, y, shift),
      onRightClick: (x, y) => this.order(x, y),
      onKey: (e) => this.onKey(e),
    });
    this.onResize();
    store.set({ screen: 'game', mapHash: hex(map.hash), tick: 0 });
    this.raf = requestAnimationFrame(this.frame);
    this.resolveReady();
  }

  private onSnap(s: Snapshot): void {
    if (!this.terrain) return;
    if (s.fog) { this.terrain.setFog(s.fog); this.minimap.setFog(s.fog); }
    if (s.owner) { this.terrain.setOwner(s.owner); this.minimap.setOwner(s.owner); }
    if (!this.lastSnap || s.tick !== this.lastSnap.tick) { this.units.update(s.ents); this.snapTime = performance.now(); }
    this.units.setMarkers(s.pending);
    this.lastSnap = s;
    const perf = store.state.perf;
    store.set({
      tick: s.tick, isNight: s.isNight, dayPhase: s.dayPhase, dayLength: s.dayLength, speed: s.speed, paused: s.paused,
      pendingOrders: s.pending.length, perf: { ...perf, simMs: s.simMsPerTick, tps: s.ticksPerSec, dropped: s.droppedTicks, entities: s.ents.length / 6 },
    });
  }

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
    const night = s ? nightness(s.dayPhase, s.dayLength, TUNING.dayNight.nightTicks) : 0;
    this.terrain.setLighting(night, now / 1000);
    this.sun.intensity = 0.9 - 0.65 * night;
    this.amb.intensity = 0.55 - 0.3 * night;
    this.renderer.render(this.scene, this.cam.camera);
    if (now - this.lastMinimapDraw > 250) {
      this.lastMinimapDraw = now;
      this.minimap.redraw();
      const perf = this.perfNow();
      store.set({ perf: { ...store.state.perf, ...perf }, selected: this.units.selected.size });
    }
    this.minimap.drawView(this.viewCorners(), this.units.visible);
  };

  private perfNow(): { fps: number; p95Ms: number; drawCalls: number; triangles: number } {
    const recent = this.frameTimes.slice(-120);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const sorted = this.frameTimes.slice(-300).sort((a, b) => a - b);
    const info = this.renderer.info.render;
    return { fps: avg > 0 ? 1000 / avg : 0, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, drawCalls: info.calls, triangles: info.triangles };
  }

  private viewCorners(): ({ x: number; z: number } | null)[] {
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => {
      const p = this.cam.groundAt(x, y, 1);
      return p ? { x: p.x, z: p.z } : null;
    });
  }

  private ndc(clientX: number, clientY: number): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1];
  }

  /** Tile hit by a screen point, by marching the view ray over the terraced heightfield. */
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

  private select(clientX: number, clientY: number, shift: boolean): void {
    let best = -1, bestD = 22 * 22;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    for (const u of this.units.visible) {
      if (u.owner !== 0) continue;
      v.set(u.x, tileTopY(this.map, Math.floor(u.z) * this.map.w + Math.floor(u.x)) + 0.5, u.z).project(this.cam.camera);
      const sx = ((v.x + 1) / 2) * r.width + r.left, sy = ((1 - v.y) / 2) * r.height + r.top;
      const d = (sx - clientX) ** 2 + (sy - clientY) ** 2;
      if (d < bestD) { bestD = d; best = u.id; }
    }
    if (!shift) this.units.selected.clear();
    if (best >= 0) this.units.selected.add(best);
    store.set({ selected: this.units.selected.size });
  }

  private order(clientX: number, clientY: number): void {
    if (this.units.selected.size === 0) return;
    const t = this.pickTile(clientX, clientY);
    if (!t) return;
    this.moveSelected(t.x, t.z);
  }

  moveSelected(tileX: number, tileZ: number): void {
    this.send({ type: 'move', ids: [...this.units.selected], x: Math.floor(tileX * FP_ONE), y: Math.floor(tileZ * FP_ONE) });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === ' ') { e.preventDefault(); this.setPaused(!store.state.paused); }
    else if (e.key === '=' || e.key === '+') this.stepSpeed(1);
    else if (e.key === '-' || e.key === '_') this.stepSpeed(-1);
    else if (e.key === 'F3') { e.preventDefault(); store.set({ showPerf: !store.state.showPerf }); }
    else if (e.key === 'Home') this.jumpToStart();
    else if (e.key.toLowerCase() === 'o') this.setOwnerOverlay(!store.state.ownerOverlay);
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

  // ---------- debug / test hooks ----------
  requestHash(): Promise<{ tick: number; hash: number }> {
    const id = ++this.reqId;
    return new Promise((res) => { this.hashWaiters.set(id, res); this.send({ type: 'hash', reqId: id }); });
  }
  stallWorker(ms: number): void { this.send({ type: 'stall', ms }); }
  get snapshot(): Snapshot | null { return this.lastSnap; }

  /** Scripted camera sweep across the map; returns frame statistics. */
  sweep(seconds: number, distance = 40): Promise<{ frames: number; avgFps: number; p95Ms: number; p99Ms: number; worstMs: number }> {
    return new Promise((resolve) => {
      const times: number[] = [];
      let t = 0;
      const startDist = this.cam.distance;
      this.cam.distance = distance;
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
