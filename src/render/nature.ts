// Trees on forest tiles (two species) and rock clusters on deposit tiles, instanced. Fog is applied on
// the CPU: unexplored tiles hide their instance, explored-but-not-visible tiles are darkened.
import * as THREE from 'three';
import { Res, RES_NONE } from '../sim/defs';
import type { MapPayload } from '../worker/protocol';
import { broadleafGeometry, pineGeometry, rockGeometry } from './models';
import { tileTopY } from './terrain';

const ROCK_COLORS: Record<number, [number, number, number]> = {
  [Res.STONE]: [0.7, 0.69, 0.67], [Res.GOLD]: [0.98, 0.8, 0.28], [Res.CARBON]: [0.2, 0.2, 0.23], [Res.ADAMITE]: [0.55, 0.88, 0.95],
};

interface Kind { mesh: THREE.InstancedMesh; tiles: number[] }

export class NatureLayer {
  readonly group = new THREE.Group();
  private kinds: Kind[] = [];
  /** tile → (kind index << 24) | (instance index + 1); 0 = none */
  private slot: Int32Array;
  private fog: Uint8Array;
  private resType: Uint8Array;
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private map: MapPayload, density = 1) {
    const N = map.w * map.h;
    this.resType = map.resType.slice();
    this.fog = new Uint8Array(N);
    this.slot = new Int32Array(N);
    const pine: number[] = [], broad: number[] = [], rocks: number[] = [];
    for (let t = 0; t < N; t++) {
      const r = this.resType[t];
      const h = Math.imul(t ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
      if (r === Res.WOOD) {
        if (density < 1 && (h & 1)) continue;
        // more broadleaf in warm, low land; pines elsewhere
        (map.temp[t] > 140 && (h >> 3) % 3 !== 0 ? broad : pine).push(t);
      } else if (r !== RES_NONE) rocks.push(t);
    }
    const mk = (geo: THREE.BufferGeometry, tiles: number[], vertexColors: boolean): void => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors }), Math.max(1, tiles.length));
      mesh.frustumCulled = false;
      mesh.count = tiles.length;
      const black = new THREE.Color(0, 0, 0);
      const k = this.kinds.length;
      tiles.forEach((t, i) => { mesh.setMatrixAt(i, this.hidden); mesh.setColorAt(i, black); this.slot[t] = (k << 24) | (i + 1); });
      this.kinds.push({ mesh, tiles });
      this.group.add(mesh);
    };
    mk(pineGeometry(), pine, true);
    mk(broadleafGeometry(), broad, true);
    mk(rockGeometry(), rocks, false);
  }

  private placeMatrix(t: number, rock: boolean): THREE.Matrix4 {
    const w = this.map.w, x = t % w, z = (t - x) / w;
    const h = Math.imul(t ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    const jx = ((h & 255) / 255 - 0.5) * 0.4, jz = (((h >> 8) & 255) / 255 - 0.5) * 0.4;
    const s = rock ? 0.9 + ((h >> 16) & 63) / 120 : 0.8 + ((h >> 16) & 63) / 140;
    const m = new THREE.Matrix4().makeRotationY(((h >> 22) & 63) / 10);
    m.scale(new THREE.Vector3(s, s, s));
    m.setPosition(x + 0.5 + jx, tileTopY(this.map, t), z + 0.5 + jz);
    return m;
  }

  private refresh(t: number): void {
    const sl = this.slot[t];
    if (!sl) return;
    const kind = this.kinds[sl >>> 24], i = (sl & 0xffffff) - 1, rock = (sl >>> 24) === 2;
    const f = this.fog[t], k = f === 0 ? 0 : f < 200 ? 0.45 : 1, r = this.resType[t];
    const alive = rock ? r !== RES_NONE : r === Res.WOOD;
    kind.mesh.setMatrixAt(i, f === 0 || !alive ? this.hidden : this.placeMatrix(t, rock));
    const c = rock ? ROCK_COLORS[r] ?? [0, 0, 0] : [1, 1, 1];
    kind.mesh.setColorAt(i, new THREE.Color(c[0] * k, c[1] * k, c[2] * k));
  }

  private flush(): void {
    for (const { mesh } of this.kinds) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  /** Apply a new fog layer; only tiles whose fog value changed are touched. */
  setFog(f: Uint8Array): void {
    let any = false;
    for (let t = 0; t < f.length; t++) {
      if (f[t] === this.fog[t]) continue;
      this.fog[t] = f[t];
      if (this.slot[t]) { this.refresh(t); any = true; }
    }
    if (any) this.flush();
  }

  /** Tile deltas from the sim: [tile, biome, resType] triples. */
  applyTiles(tiles: Int32Array): void {
    for (let k = 0; k < tiles.length; k += 3) { const t = tiles[k]; this.resType[t] = tiles[k + 2]; this.refresh(t); }
    this.flush();
  }

  resTypeAt(t: number): number { return this.resType[t]; }

  dispose(): void {
    for (const { mesh } of this.kinds) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  }
}
