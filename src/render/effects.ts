// Visual-only effects: arrows/bolts flying between shooter and target, and flames on burning tiles.
// Nothing here feeds back into the simulation.
import * as THREE from 'three';
import type { MapPayload } from '../worker/protocol';
import { tileTopY } from './terrain';
import { TUNING, type MapSize } from '../sim/core/tuning';

const MAX_SHOTS = 512, MAX_FLAMES = 2048, FLIGHT_MS = 280;

interface Shot { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; born: number }

export class EffectsLayer {
  readonly group = new THREE.Group();
  private arrows: THREE.InstancedMesh;
  private flames: THREE.InstancedMesh;
  private shots: Shot[] = [];
  private fireTiles: number[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  /** Reduced effects on big maps (F-191): arrows and flames drawn at once. */
  private shotBudget = MAX_SHOTS;
  private flameBudget = MAX_FLAMES;
  constructor(private map: MapPayload) {
    const pct = TUNING.map.sizes[map.size as MapSize]?.effectsPct ?? 100;
    this.shotBudget = Math.max(32, Math.floor((MAX_SHOTS * pct) / 100)); this.flameBudget = Math.max(64, Math.floor((MAX_FLAMES * pct) / 100));
    this.arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: 0x3a2a1c }), MAX_SHOTS);
    const flame = new THREE.ConeGeometry(0.22, 0.6, 6).translate(0, 0.3, 0);
    this.flames = new THREE.InstancedMesh(flame, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), MAX_FLAMES);
    for (const im of [this.arrows, this.flames]) { im.frustumCulled = false; im.count = 0; this.group.add(im); }
  }

  /** New shots from the latest snapshot (world positions of shooter and target). */
  addShot(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, now: number): void {
    if (this.shots.length >= this.shotBudget) this.shots.shift();
    this.shots.push({ x0: from.x, y0: from.y + 0.5, z0: from.z, x1: to.x, y1: to.y + 0.4, z1: to.z, born: now });
  }

  setFires(tiles: number[]): void { this.fireTiles = tiles; }

  render(now: number): void {
    // arrows: parabolic arc, oriented along their velocity
    this.shots = this.shots.filter((s) => now - s.born < FLIGHT_MS);
    let n = 0;
    for (const s of this.shots) {
      const t = (now - s.born) / FLIGHT_MS;
      const dist = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const arc = Math.min(1.5, dist * 0.15);
      const x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t, y = s.y0 + (s.y1 - s.y0) * t + Math.sin(Math.PI * t) * arc;
      const dy = (s.y1 - s.y0) + Math.cos(Math.PI * t) * Math.PI * arc;
      this.v.set(s.x1 - s.x0, dy, s.z1 - s.z0).normalize();
      this.q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.v);
      this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
      this.arrows.setMatrixAt(n++, this.m);
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
    // flames: flickering cones, 2 per burning tile
    const c = new THREE.Color();
    let f = 0;
    for (const t of this.fireTiles) {
      if (f >= this.flameBudget - 1) break;
      const w = this.map.w, x = t % w, z = (t - x) / w, y = tileTopY(this.map, t);
      for (let k = 0; k < 2; k++) {
        const ph = now / 120 + t * 1.7 + k * 2.1;
        const s = 0.8 + 0.35 * Math.sin(ph) + (k ? -0.2 : 0);
        this.m.makeScale(s, s * (1.1 + 0.3 * Math.sin(ph * 1.3)), s).setPosition(x + 0.35 + k * 0.3, y + 0.05, z + 0.4 + k * 0.2);
        this.flames.setMatrixAt(f, this.m);
        this.flames.setColorAt(f, c.setRGB(1, 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(ph * 2)), 0.1));
        f++;
      }
    }
    this.flames.count = f;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const im of [this.arrows, this.flames]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); }
  }
}
