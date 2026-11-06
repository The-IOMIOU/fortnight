// Terraced 2.5D terrain: one flat quad per tile at its level height, plus vertical cliff quads
// where a neighbour is lower. Built in 32×32-tile chunks for frustum culling and later edits.
// Fog of war, ownership overlay and day/night lighting are applied in a small custom shader.

import * as THREE from 'three';
import { Biome, isWaterBiome } from '../sim/world/mapgen';
import type { MapPayload } from '../worker/protocol';
import { BIOME_COLORS, CLIFF_COLOR, OCEAN_DEEP, PLAYER_COLORS } from './palette';

export const LEVEL_H = 0.5;
export const OCEAN_Y = 0.32;
const INLAND_WATER_DROP = 0.18;
const CHUNK = 32;

/** World-space top height of a tile (what units stand on / water surface). */
export function tileTopY(map: MapPayload, i: number): number {
  const b = map.biome[i];
  if (b === Biome.OCEAN || b === Biome.ICE) return OCEAN_Y + (b === Biome.ICE ? 0.04 : 0);
  if (b === Biome.LAKE || b === Biome.RIVER) return map.height[i] * LEVEL_H - INLAND_WATER_DROP;
  return map.height[i] * LEVEL_H;
}

function jitter(i: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  return ((h & 255) / 255 - 0.5) * 0.08;
}

const VERT = /* glsl */ `
attribute vec3 tcol;
attribute float water;
uniform float uTime;
uniform float uWater;
uniform vec2 uMapSize;
varying vec3 vCol;
varying vec3 vNormal;
varying vec2 vMapUv;
varying float vWater;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  if (water > 0.5 && uWater > 0.5) p.y += sin(uTime * 1.3 + p.x * 0.37 + p.z * 0.29) * 0.02;
  vCol = tcol; vNormal = normal; vWater = water; vWorld = p;
  vMapUv = vec2(p.x / uMapSize.x, p.z / uMapSize.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uFog;
uniform sampler2D uOwner;
uniform sampler2D uPalette;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform float uOwnerOverlay;
uniform float uTime;
uniform float uWater;
varying vec3 vCol;
varying vec3 vNormal;
varying vec2 vMapUv;
varying float vWater;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  float l = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 c = vCol * (uAmb + uSunCol * l);
  if (vWater > 0.5 && uWater > 0.5) c += vec3(0.015, 0.022, 0.03) * sin(uTime * 1.2 + vWorld.x * 0.31 + vWorld.z * 0.23);
  float o = texture2D(uOwner, vMapUv).r * 255.0;
  if (o < 254.5 && uOwnerOverlay > 0.5) {
    vec4 pc = texture2D(uPalette, vec2((floor(o + 0.5) + 0.5) / 32.0, 0.5));
    float pat = floor(pc.a * 4.0 + 0.5);
    float on = 1.0;
    if (pat > 0.5 && pat < 1.5) on = step(0.5, fract((vWorld.x + vWorld.z) * 1.5));
    else if (pat > 1.5 && pat < 2.5) on = step(0.18, length(fract(vWorld.xz * 2.0) - 0.5)) ;
    else if (pat > 2.5) on = mod(floor(vWorld.x * 2.0) + floor(vWorld.z * 2.0), 2.0);
    c = mix(c, pc.rgb, 0.38 * (0.35 + 0.65 * on));
  }
  float f = texture2D(uFog, vMapUv).r;
  float vis = smoothstep(0.6, 0.95, f);
  float seen = smoothstep(0.05, 0.4, f);
  vec3 grey = vec3(dot(c, vec3(0.3, 0.59, 0.11)));
  vec3 remembered = mix(c, grey, 0.55) * 0.42;
  vec3 col = mix(vec3(0.02, 0.025, 0.035), remembered, seen);
  col = mix(col, c, vis);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Terrain {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly fogTex: THREE.DataTexture;
  readonly ownerTex: THREE.DataTexture;
  triangles = 0;

  constructor(readonly map: MapPayload) {
    const { w, h } = map;
    this.fogTex = new THREE.DataTexture(new Uint8Array(w * h), w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTex.magFilter = THREE.LinearFilter; this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.unpackAlignment = 1; this.fogTex.needsUpdate = true;
    this.ownerTex = new THREE.DataTexture(new Uint8Array(w * h).fill(255), w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.ownerTex.magFilter = THREE.NearestFilter; this.ownerTex.minFilter = THREE.NearestFilter;
    this.ownerTex.unpackAlignment = 1; this.ownerTex.needsUpdate = true;
    const pal = new Uint8Array(32 * 4);
    for (let p = 0; p < 32; p++) {
      const c = PLAYER_COLORS[p % PLAYER_COLORS.length];
      pal[p * 4] = c[0] * 255; pal[p * 4 + 1] = c[1] * 255; pal[p * 4 + 2] = c[2] * 255;
      pal[p * 4 + 3] = Math.floor(p / PLAYER_COLORS.length) * 64; // pattern index in alpha
    }
    const palTex = new THREE.DataTexture(pal, 32, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    palTex.magFilter = THREE.NearestFilter; palTex.minFilter = THREE.NearestFilter; palTex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uFog: { value: this.fogTex }, uOwner: { value: this.ownerTex }, uPalette: { value: palTex },
        uMapSize: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.45, 1, 0.3) }, uSunCol: { value: new THREE.Vector3(0.75, 0.73, 0.68) },
        uAmb: { value: new THREE.Vector3(0.45, 0.46, 0.5) }, uOwnerOverlay: { value: 1 }, uWater: { value: 1 },
      },
    });

    for (let cy = 0; cy < h; cy += CHUNK) for (let cx = 0; cx < w; cx += CHUNK) this.rebuildChunk(cx / CHUNK, cy / CHUNK);
  }

  private chunks = new Map<number, THREE.Mesh>();
  private rebuildChunk(cx: number, cy: number): void {
    const key = cy * 1000 + cx, old = this.chunks.get(key);
    if (old) { this.triangles -= (old.geometry.index?.count ?? 0) / 3; old.geometry.dispose(); this.group.remove(old); this.chunks.delete(key); }
    const { w, h } = this.map;
    const mesh = this.buildChunk(cx * CHUNK, cy * CHUNK, Math.min(w, (cx + 1) * CHUNK), Math.min(h, (cy + 1) * CHUNK));
    if (mesh) { this.group.add(mesh); this.chunks.set(key, mesh); }
  }

  /** Apply tile deltas ([tile, biome, resType] triples) and rebuild affected chunks (incl. neighbours' cliffs). */
  applyTiles(tiles: Int32Array): void {
    const dirty = new Set<number>();
    const { w, h } = this.map;
    for (let k = 0; k < tiles.length; k += 3) {
      const t = tiles[k];
      this.map.biome[t] = tiles[k + 1];
      const x = t % w, y = (t - x) / w;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) dirty.add(Math.floor(ny / CHUNK) * 1000 + Math.floor(nx / CHUNK));
      }
    }
    for (const key of dirty) this.rebuildChunk(key % 1000, Math.floor(key / 1000));
  }

  private buildChunk(x0: number, y0: number, x1: number, y1: number): THREE.Mesh | null {
    const map = this.map, { w, h } = map;
    const pos: number[] = [], nor: number[] = [], col: number[] = [], wat: number[] = [], idx: number[] = [];
    // ocean depth shading: distance to nearest land within 4 tiles
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
      dx: number, dy: number, dz: number, nx: number, ny: number, nz: number, c: number[], water: number): void => {
      const base = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let k = 0; k < 4; k++) { nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); wat.push(water); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * w + x, b = map.biome[i], top = tileTopY(map, i);
      const water = isWaterBiome(b) && b !== Biome.ICE ? 1 : 0;
      let base = BIOME_COLORS[b];
      if (b === Biome.OCEAN) {
        let near = 0;
        for (let d = 1; d <= 4 && !near; d++) for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !isWaterBiome(map.biome[ny * w + nx])) { near = 5 - d; break; }
        }
        const t = near / 4;
        base = [OCEAN_DEEP[0] + (base[0] - OCEAN_DEEP[0]) * t, OCEAN_DEEP[1] + (base[1] - OCEAN_DEEP[1]) * t, OCEAN_DEEP[2] + (base[2] - OCEAN_DEEP[2]) * t];
      }
      const j = 1 + jitter(i) + (isWaterBiome(b) ? 0 : (map.height[i] - 3) * 0.025);
      const c = [base[0] * j, base[1] * j, base[2] * j];
      // top face (counter-clockwise seen from above: +y normal)
      quad(x, top, y, x, top, y + 1, x + 1, top, y + 1, x + 1, top, y, 0, 1, 0, c, water);
      // cliffs toward lower neighbours
      const cc = isWaterBiome(b) ? c : [CLIFF_COLOR[0] * j, CLIFF_COLOR[1] * j, CLIFF_COLOR[2] * j];
      const sides: [number, number, number, number, number, number, number, number, number, number][] = [
        // nx, ny, then edge start (sx,sz), edge end (ex,ez), normal (nx,nz)
        [x + 1, y, x + 1, y + 1, x + 1, y, 1, 0, 0, 0],
        [x - 1, y, x, y, x, y + 1, -1, 0, 0, 0],
        [x, y + 1, x, y + 1, x + 1, y + 1, 0, 1, 0, 0],
        [x, y - 1, x + 1, y, x, y, 0, -1, 0, 0],
      ];
      for (const [nx, ny, sx, sz, ex, ez, nnx, nnz] of sides) {
        const low = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : tileTopY(map, ny * w + nx);
        if (low >= top - 1e-4) continue;
        quad(sx, top, sz, sx, low, sz, ex, low, ez, ex, top, ez, nnx, 0, nnz, cc, 0);
      }
    }
    if (idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('tcol', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('water', new THREE.Float32BufferAttribute(wat, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.triangles += idx.length / 3;
    return new THREE.Mesh(g, this.material);
  }

  setFog(data: Uint8Array): void { (this.fogTex.image.data as Uint8Array).set(data); this.fogTex.needsUpdate = true; }
  setOwner(data: Uint8Array): void { (this.ownerTex.image.data as Uint8Array).set(data); this.ownerTex.needsUpdate = true; }

  /** nightness 0 (day) .. 1 (night) */
  setLighting(nightness: number, time: number): void {
    const u = this.material.uniforms;
    const lerp = (a: number, b: number): number => a + (b - a) * nightness;
    (u.uSunCol.value as THREE.Vector3).set(lerp(0.75, 0.16), lerp(0.73, 0.2), lerp(0.68, 0.34));
    (u.uAmb.value as THREE.Vector3).set(lerp(0.45, 0.17), lerp(0.46, 0.2), lerp(0.5, 0.33));
    u.uTime.value = time;
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.material.dispose(); this.fogTex.dispose(); this.ownerTex.dispose();
  }
}
