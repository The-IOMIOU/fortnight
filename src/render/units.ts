// Instanced unit rendering with interpolation between the last two sim snapshots.
import * as THREE from 'three';
import { ENTITY_STRIDE } from '../sim/sim';
import { FP_ONE } from '../sim/core/fixed';
import type { MapPayload } from '../worker/protocol';
import { playerColor } from './palette';
import { tileTopY } from './terrain';

const MAX_UNITS = 4096;

export interface UnitView { id: number; kind: number; owner: number; x: number; z: number }

export class UnitLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private ring: THREE.InstancedMesh;
  private marker: THREE.InstancedMesh;
  private prev = new Map<number, [number, number]>();
  private curr = new Map<number, { kind: number; owner: number; x: number; y: number }>();
  readonly selected = new Set<number>();
  visible: UnitView[] = [];

  constructor(private map: MapPayload) {
    const body = new THREE.ConeGeometry(0.32, 0.95, 7);
    body.translate(0, 0.48, 0);
    this.mesh = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_UNITS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 20);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7fffb0, side: THREE.DoubleSide }), MAX_UNITS);
    this.ring.count = 0; this.ring.frustumCulled = false;
    const flag = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6);
    flag.translate(0, 0.6, 0);
    this.marker = new THREE.InstancedMesh(flag, new THREE.MeshBasicMaterial({ color: 0xffe066 }), 64);
    this.marker.count = 0; this.marker.frustumCulled = false;
    this.group.add(this.mesh, this.ring, this.marker);
  }

  /** New snapshot: current becomes previous. */
  update(ents: Int32Array): void {
    this.prev.clear();
    for (const [id, c] of this.curr) this.prev.set(id, [c.x, c.y]);
    this.curr.clear();
    for (let k = 0; k < ents.length; k += ENTITY_STRIDE) {
      this.curr.set(ents[k], { kind: ents[k + 1], owner: ents[k + 2], x: ents[k + 3], y: ents[k + 4] });
    }
    for (const id of [...this.selected]) if (!this.curr.has(id)) this.selected.delete(id);
  }

  setMarkers(pending: { x: number; y: number }[]): void {
    const m = new THREE.Matrix4();
    let n = 0;
    for (const p of pending) {
      if (n >= 64) break;
      const tx = p.x / FP_ONE, tz = p.y / FP_ONE;
      const ti = Math.floor(tz) * this.map.w + Math.floor(tx);
      m.makeTranslation(tx, tileTopY(this.map, ti), tz);
      this.marker.setMatrixAt(n++, m);
    }
    this.marker.count = n;
    this.marker.instanceMatrix.needsUpdate = true;
  }

  /** alpha ∈ [0,1]: interpolation between previous and current snapshot. */
  render(alpha: number): void {
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0, r = 0;
    this.visible.length = 0;
    for (const [id, c] of this.curr) {
      if (n >= MAX_UNITS) break;
      const p = this.prev.get(id);
      const fx = p ? p[0] + (c.x - p[0]) * alpha : c.x, fy = p ? p[1] + (c.y - p[1]) * alpha : c.y;
      const x = fx / FP_ONE, z = fy / FP_ONE;
      const ti = Math.floor(z) * this.map.w + Math.floor(x);
      const y = tileTopY(this.map, ti);
      m.makeTranslation(x, y, z);
      this.mesh.setMatrixAt(n, m);
      const pc = playerColor(c.owner);
      this.mesh.setColorAt(n, col.setRGB(pc[0], pc[1], pc[2]));
      n++;
      if (this.selected.has(id)) { m.makeTranslation(x, y + 0.03, z); this.ring.setMatrixAt(r++, m); }
      this.visible.push({ id, kind: c.kind, owner: c.owner, x, z });
    }
    this.mesh.count = n; this.ring.count = r;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
  }
}
