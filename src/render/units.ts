// Instanced rendering of everything in the sim snapshot: units, buildings, wildlife, carried cargo,
// selection rings. Moving things are interpolated between the last two snapshots.
import * as THREE from 'three';
import { ENTITY_STRIDE } from '../sim/sim';
import { FP_ONE } from '../sim/core/fixed';
import { BUILDING_TYPES, Kind, NATURE_OWNER, buildingDef, isBuildingKind, isUnitKind, unitTypeOfKind, type BuildingTypeName } from '../sim/defs';
import type { MapPayload } from '../worker/protocol';
import { playerColor } from './palette';
import { tileTopY } from './terrain';
import { buildingModel, cargoGeometry, unitModel, type Model } from './models';

const MAX = 4096;

export interface EntityView {
  id: number; kind: number; owner: number; x: number; z: number; y: number;
  flags: number; a: number; b: number;
  /** buildings only */
  btype?: BuildingTypeName; size?: number; anchorX?: number; anchorZ?: number;
}

interface Pair { body: THREE.InstancedMesh; trim: THREE.InstancedMesh; n: number }

const CARGO_COLORS: [number, number, number][] = [[0.85, 0.3, 0.3], [0.55, 0.35, 0.18], [0.66, 0.66, 0.68], [0.95, 0.78, 0.25], [0.15, 0.15, 0.17], [0.55, 0.85, 0.9]];

export class UnitLayer {
  readonly group = new THREE.Group();
  private pairs = new Map<string, Pair>();
  private ring: THREE.InstancedMesh;
  private bigRing: THREE.InstancedMesh;
  private cargo: THREE.InstancedMesh;
  private prev = new Map<number, [number, number]>();
  private curr = new Map<number, { kind: number; owner: number; x: number; y: number; flags: number; a: number; b: number }>();
  readonly selected = new Set<number>();
  visible: EntityView[] = [];
  private byId = new Map<number, EntityView>();
  private baseY = new Map<number, number>();
  private yaw = new Map<number, number>();
  private tmpM = new THREE.Matrix4();
  private tmpC = new THREE.Color();

  constructor(private map: MapPayload) {
    const mk = (key: string, model: Model, cap: number): void => {
      const body = new THREE.InstancedMesh(model.body, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), cap);
      const trim = new THREE.InstancedMesh(model.trim, new THREE.MeshLambertMaterial({ color: 0xffffff }), cap);
      body.frustumCulled = trim.frustumCulled = false;
      body.count = trim.count = 0;
      this.group.add(body, trim);
      this.pairs.set(key, { body, trim, n: 0 });
    };
    for (const u of ['scout', 'worker', 'settler', 'animal', 'carcass'] as const) mk(u, unitModel(u), MAX);
    for (const b of BUILDING_TYPES) mk(b, buildingModel(b, buildingDef(b).size), 1024);
    const ringGeo = new THREE.RingGeometry(0.42, 0.55, 20).rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7fffb0, side: THREE.DoubleSide }), MAX);
    this.bigRing = new THREE.InstancedMesh(new THREE.RingGeometry(0.47, 0.5, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fffb0, side: THREE.DoubleSide }), 256);
    this.cargo = new THREE.InstancedMesh(cargoGeometry(), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    for (const m of [this.ring, this.bigRing, this.cargo]) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
  }

  /** New snapshot: current becomes previous. */
  update(ents: Int32Array): void {
    this.prev.clear();
    for (const [id, c] of this.curr) this.prev.set(id, [c.x, c.y]);
    this.curr.clear();
    for (let k = 0; k < ents.length; k += ENTITY_STRIDE) {
      this.curr.set(ents[k], { kind: ents[k + 1], owner: ents[k + 2], x: ents[k + 3], y: ents[k + 4], flags: ents[k + 5], a: ents[k + 6], b: ents[k + 7] });
    }
    for (const id of [...this.selected]) if (!this.curr.has(id)) this.selected.delete(id);
  }

  get(id: number): EntityView | undefined { return this.byId.get(id); }

  private keyOf(kind: number): string {
    if (isUnitKind(kind)) return unitTypeOfKind(kind);
    if (isBuildingKind(kind)) return BUILDING_TYPES[kind - Kind.BUILDING_BASE];
    return kind === Kind.ANIMAL ? 'animal' : 'carcass';
  }

  private groundY(id: number, kind: number, x: number, z: number): number {
    if (!isBuildingKind(kind)) return tileTopY(this.map, Math.floor(z) * this.map.w + Math.floor(x));
    let y = this.baseY.get(id);
    if (y === undefined) {
      const s = buildingDef(BUILDING_TYPES[kind - Kind.BUILDING_BASE]).size, ax = Math.round(x - s / 2), az = Math.round(z - s / 2);
      y = 0;
      for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) y = Math.max(y, tileTopY(this.map, (az + dz) * this.map.w + ax + dx));
      this.baseY.set(id, y);
    }
    return y;
  }

  /** alpha ∈ [0,1]: interpolation between previous and current snapshot. */
  render(alpha: number): void {
    for (const p of this.pairs.values()) p.n = 0;
    let r = 0, br = 0, cg = 0;
    this.visible.length = 0;
    this.byId.clear();
    const m = this.tmpM, col = this.tmpC;
    for (const [id, c] of this.curr) {
      const p = this.prev.get(id);
      const fx = p ? p[0] + (c.x - p[0]) * alpha : c.x, fy = p ? p[1] + (c.y - p[1]) * alpha : c.y;
      const x = fx / FP_ONE, z = fy / FP_ONE;
      const y = this.groundY(id, c.kind, x, z);
      const key = this.keyOf(c.kind), pair = this.pairs.get(key);
      if (!pair || pair.n >= pair.body.instanceMatrix.count) continue;
      const building = isBuildingKind(c.kind);
      const complete = (c.flags & 2) !== 0;
      const sy = building && !complete ? 0.25 + 0.75 * (c.b / 1000) : 1;
      m.makeScale(1, sy, 1).setPosition(x, y, z);
      if (!building) {
        // face the direction of travel (units and animals), or a stable random heading when standing
        const pp = this.prev.get(id), dx = pp ? c.x - pp[0] : 0, dz = pp ? c.y - pp[1] : 0;
        let yaw = this.yaw.get(id) ?? (((id * 2654435761) >>> 0) & 1023) / 160;
        const xForward = c.kind === Kind.ANIMAL || c.kind === Kind.CARCASS || c.kind === Kind.SETTLER;
        if (dx * dx + dz * dz > 4) yaw = xForward ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
        this.yaw.set(id, yaw);
        m.multiply(new THREE.Matrix4().makeRotationY(yaw));
      }
      pair.body.setMatrixAt(pair.n, m);
      pair.trim.setMatrixAt(pair.n, m);
      // body colors come from the model's vertex colors; the instance color only tints (pale while under construction)
      if (building && !complete) col.setRGB(1.05, 0.95, 0.75); else col.setRGB(1, 1, 1);
      pair.body.setColorAt(pair.n, col);
      const pc = c.owner === NATURE_OWNER ? [0.4, 0.28, 0.16] : playerColor(c.owner);
      // building roofs: team color blended toward clay so they read as roofs, not flat paint
      const k = building ? 0.62 : 1;
      pair.trim.setColorAt(pair.n, col.setRGB(pc[0] * k + 0.6 * (1 - k), pc[1] * k + 0.3 * (1 - k), pc[2] * k + 0.22 * (1 - k)));
      pair.n++;
      if (isUnitKind(c.kind) && (c.flags & 4)) {
        const ct = (c.b >> 16) & 255, cc = CARGO_COLORS[ct] ?? [1, 1, 1];
        this.cargo.setMatrixAt(cg, m); this.cargo.setColorAt(cg, col.setRGB(cc[0], cc[1], cc[2])); cg++;
      }
      const v: EntityView = { id, kind: c.kind, owner: c.owner, x, z, y, flags: c.flags, a: c.a, b: c.b };
      if (building) {
        v.btype = BUILDING_TYPES[c.kind - Kind.BUILDING_BASE];
        v.size = buildingDef(v.btype).size;
        v.anchorX = Math.round(x - v.size / 2); v.anchorZ = Math.round(z - v.size / 2);
      }
      if (this.selected.has(id)) {
        if (building) { m.makeScale(v.size! * 1.5, 1, v.size! * 1.5).setPosition(x, y + 0.05, z); this.bigRing.setMatrixAt(br++, m); }
        else { m.makeTranslation(x, y + 0.03, z); this.ring.setMatrixAt(r++, m); }
      }
      this.visible.push(v);
      this.byId.set(id, v);
    }
    for (const p of this.pairs.values()) {
      p.body.count = p.trim.count = p.n;
      for (const im of [p.body, p.trim]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    this.ring.count = r; this.bigRing.count = br; this.cargo.count = cg;
    for (const im of [this.ring, this.bigRing, this.cargo]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  }
}
