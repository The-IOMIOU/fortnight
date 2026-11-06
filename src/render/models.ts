// Procedural low-poly models with per-part colors (original, generated in code; no asset files).
// Each model = a detailed "body" (vertex colors: plaster, timber, stone, glass…) and an owner-colored
// "trim" (roofs, banners, hats) so teams stay readable. Front faces +z (towards the camera).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingTypeName, UnitTypeName } from '../sim/defs';

export interface Model { body: THREE.BufferGeometry; trim: THREE.BufferGeometry }

// ---- palette (display-space colors) ----
const PLASTER = 0xe6dcc3, TIMBER = 0x5b3d25, DARKWOOD = 0x3f2a1a, STONE = 0x8d8a84, STONE_D = 0x6e6b66, GLASS = 0x4f6f86;
const THATCH = 0xc9a85b, PLANK = 0x9a7046, SOIL = 0x6b4a2c, CROP = 0x9cbc4a, CROP2 = 0xd8c25a, HAY = 0xd9bd62, IRON = 0x55595f;
const SKIN = 0xe0b48f, CLOTH = 0x8a7357, CLOTH2 = 0x6c5a44, CANVAS = 0xeee6d0, FUR = 0x8a5a35, FUR_L = 0xc79c6a;
const LEAF = 0x2f6b34, LEAF2 = 0x3d7d3a, LEAF3 = 0x4f8f3f, BARK = 0x5a4029;

// ---- geometry helpers ----
type G = THREE.BufferGeometry;
function paint(g: G, hex: number): G {
  const n = g.index ? g.toNonIndexed() : g;
  n.deleteAttribute('uv');
  const c = new THREE.Color(hex), count = n.getAttribute('position').count, arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return n;
}
const plain = (g: G): G => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
const merge = (gs: G[]): G => mergeGeometries(gs)!;
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0): G => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, seg: number, x = 0, y = 0, z = 0, r2 = r): G => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y + h / 2, z);
const cone = (r: number, h: number, seg: number, x = 0, y = 0, z = 0): G => new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z);
const ball = (r: number, x = 0, y = 0, z = 0, ws = 7, hs = 5): G => new THREE.SphereGeometry(r, ws, hs).translate(x, y, z);
/** Box rotated about Z (for braces) */
const brace = (len: number, t: number, angle: number, x: number, y: number, z: number): G => new THREE.BoxGeometry(len, t, t).rotateZ(angle).translate(x, y, z);

/**
 * Gable roof: ridge along X, two sloped planes with overhang.
 * Returns [roof planes (owner-colored), gable-end attic walls, roof-tile rows + ridge cap (body)].
 */
function gable(w: number, d: number, rise: number, y: number, over = 0.06, t = 0.04, cx = 0, cz = 0): [G, G, G] {
  const half = d / 2 + over, len = Math.hypot(half, rise * (half / (d / 2))), ang = Math.atan2(rise, d / 2);
  const planes: G[] = [], rows: G[] = [];
  for (const sgn of [1, -1]) {
    const place = (g: G): G => g.rotateX(sgn * ang).translate(cx, y + rise / 2, cz + sgn * (d / 4 + over / 4));
    planes.push(plain(place(new THREE.BoxGeometry(w + over * 2, t, len))));
    const n = Math.max(3, Math.round(len / 0.07));
    for (let i = 1; i < n; i++) rows.push(paint(place(new THREE.BoxGeometry(w + over * 2, 0.014, 0.014).translate(0, t / 2 + 0.004, -len / 2 + (i * len) / n)), 0x3a2418));
  }
  rows.push(paint(new THREE.BoxGeometry(w + over * 2 + 0.02, t * 1.6, t * 1.6).translate(cx, y + rise + t * 0.35, cz), 0x4a3426));
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const attic = new THREE.ExtrudeGeometry(tri, { depth: w, bevelEnabled: false }).rotateY(Math.PI / 2).translate(cx - w / 2, y, cz);
  return [merge(planes), attic, merge(rows)];
}

/** Window with frame on the front (+z) or side (+x) face. */
function windowAt(x: number, y: number, z: number, side: 'z' | 'x', w = 0.1, h = 0.11): G[] {
  const fw = side === 'z' ? [w + 0.03, h + 0.03, 0.015] : [0.015, h + 0.03, w + 0.03];
  const gw = side === 'z' ? [w, h, 0.02] : [0.02, h, w];
  return [paint(box(fw[0], fw[1], fw[2], x, y - 0.015, z), TIMBER), paint(box(gw[0], gw[1], gw[2], x + (side === 'x' ? 0.004 : 0), y, z + (side === 'z' ? 0.004 : 0)), GLASS)];
}

/** Half-timbered wall block (plaster with dark posts, beams and a brace) of size w×h×d. */
function timberBlock(w: number, h: number, d: number, y = 0, cx = 0, cz = 0): G[] {
  const t = 0.035, parts: G[] = [paint(box(w, h, d, cx, y, cz), PLASTER)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(paint(box(t, h, t, cx + sx * (w / 2 - t / 2), y, cz + sz * (d / 2 - t / 2)), TIMBER));
  for (const sz of [-1, 1]) {
    parts.push(paint(box(w, t, t, cx, y + h - t, cz + sz * (d / 2)), TIMBER));
    parts.push(paint(box(w, t, t, cx, y + h * 0.5, cz + sz * (d / 2)), TIMBER));
  }
  const bl = Math.hypot(w * 0.3, h * 0.45);
  parts.push(paint(brace(bl, t * 0.8, Math.atan2(h * 0.45, w * 0.3), cx - w * 0.3, y + h * 0.72, cz + d / 2 + 0.004), TIMBER));
  parts.push(paint(brace(bl, t * 0.8, -Math.atan2(h * 0.45, w * 0.3), cx + w * 0.3, y + h * 0.72, cz + d / 2 + 0.004), TIMBER));
  return parts;
}

function house(w = 0.66, d = 0.56, h = 0.46): Model {
  const [roof, attic, tiles] = gable(w, d, 0.2, 0.06 + h, 0.07);
  return {
    body: merge([
      paint(box(w + 0.08, 0.06, d + 0.08), STONE),
      ...timberBlock(w, h, d, 0.06),
      paint(attic, PLASTER), tiles,
      paint(box(0.12, 0.22, 0.02, 0.12, 0.06, d / 2 + 0.006), DARKWOOD),
      paint(box(0.16, 0.025, 0.04, 0.12, 0.06, d / 2 + 0.03), STONE_D),
      ...windowAt(-0.15, 0.24, d / 2 + 0.006, 'z'),
      ...windowAt(w / 2 + 0.006, 0.24, 0, 'x'),
      paint(box(0.09, 0.3, 0.09, -w * 0.28, h + 0.06, -d * 0.12), STONE),
      paint(box(0.11, 0.03, 0.11, -w * 0.28, h + 0.36, -d * 0.12), STONE_D),
    ]),
    trim: roof,
  };
}

/** Building models sized to their footprint (s tiles), centred on the footprint centre. */
export function buildingModel(bt: BuildingTypeName, s: number): Model {
  switch (bt) {
    case 'house': return house();
    case 'capital': {
      const [hallRoof, hallAttic, hallTiles] = gable(1.7, 1.1, 0.42, 0.12 + 0.75, 0.08, 0.05, 0, 0.35);
      const towers: G[] = [], towerRoofs: G[] = [];
      for (const [x, z] of [[1.15, -1.0], [-1.15, 1.05], [1.15, 1.05]]) {
        towers.push(paint(cyl(0.22, 1.25, 8, x, 0.12, z), STONE), paint(cyl(0.25, 0.08, 8, x, 1.37, z), STONE_D));
        towers.push(...windowAt(x, 0.85, z + 0.22, 'z', 0.07, 0.12));
        towerRoofs.push(plain(cone(0.3, 0.5, 8, x, 1.45, z)));
      }
      const crenels: G[] = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i === 0 || j === 0 || i === 3 || j === 3) crenels.push(paint(box(0.1, 0.1, 0.1, -0.85 - 0.33 + i * 0.22, 1.9, -0.75 - 0.33 + j * 0.22), STONE));
      return {
        body: merge([
          paint(box(2.8, 0.12, 2.8), STONE_D),
          ...timberBlock(1.7, 0.75, 1.1, 0.12, 0, 0.35), paint(hallAttic, PLASTER), hallTiles,
          paint(box(0.3, 0.42, 0.03, 0, 0.12, 0.91), DARKWOOD), paint(box(0.38, 0.05, 0.04, 0, 0.54, 0.92), STONE),
          ...windowAt(-0.5, 0.5, 0.91, 'z'), ...windowAt(0.5, 0.5, 0.91, 'z'), ...windowAt(-0.5, 0.82, 0.91, 'z', 0.08, 0.08), ...windowAt(0.5, 0.82, 0.91, 'z', 0.08, 0.08),
          paint(box(0.8, 1.78, 0.8, -0.85, 0.12, -0.75), STONE),
          ...windowAt(-0.85, 1.35, -0.34, 'z', 0.1, 0.16), ...windowAt(-0.85, 0.8, -0.34, 'z', 0.1, 0.16),
          ...crenels, ...towers,
          paint(cyl(0.025, 0.9, 5, -0.85, 1.9, -0.75), DARKWOOD),
          paint(cyl(0.18, 0.25, 8, 0.85, 0.12, 1.0), STONE), paint(cyl(0.14, 0.02, 8, 0.85, 0.37, 1.0), 0x3d6f8f),
        ]),
        trim: merge([hallRoof, ...towerRoofs, plain(box(0.36, 0.22, 0.015, -0.67, 2.5, -0.75))]),
      };
    }
    case 'settlement': {
      const [roof, attic, tiles] = gable(1.1, 0.8, 0.32, 0.08 + 0.55, 0.07, 0.045, 0, 0.1);
      const posts: G[] = [];
      for (let i = 0; i <= 8; i++) { const a = -0.85 + i * 0.2125; posts.push(paint(cyl(0.035, 0.3, 5, a, 0, -0.85), PLANK), paint(cyl(0.035, 0.3, 5, -0.85, 0, a), PLANK), paint(cyl(0.035, 0.3, 5, 0.85, 0, a), PLANK)); }
      return {
        body: merge([
          paint(box(1.8, 0.05, 1.8), SOIL),
          ...timberBlock(1.1, 0.55, 0.8, 0.08, 0, 0.1), paint(attic, PLASTER), tiles,
          paint(box(0.2, 0.32, 0.03, 0, 0.08, 0.51), DARKWOOD), ...windowAt(-0.32, 0.4, 0.51, 'z'), ...windowAt(0.32, 0.4, 0.51, 'z'),
          ...posts,
          paint(cyl(0.13, 0.2, 8, 0.6, 0.05, 0.65), STONE), paint(cyl(0.02, 0.5, 4, 0.6, 0.05, 0.65), DARKWOOD),
        ]),
        trim: merge([roof, plain(box(0.26, 0.16, 0.012, 0.73, 0.4, 0.65))]),
      };
    }
    case 'farm': {
      const rows: G[] = [];
      for (let i = 0; i < 7; i++) {
        const z = -0.78 + i * 0.2;
        rows.push(paint(box(1.15, 0.06, 0.1, -0.3, 0.04, z), SOIL), paint(box(1.1, 0.1, 0.07, -0.3, 0.07, z), i % 2 ? CROP : CROP2));
      }
      const fence: G[] = [];
      for (let i = 0; i <= 9; i++) { const a = -0.9 + i * 0.2; fence.push(paint(cyl(0.02, 0.18, 4, a, 0, 0.93), PLANK), paint(cyl(0.02, 0.18, 4, -0.93, 0, a), PLANK)); }
      fence.push(paint(box(1.86, 0.025, 0.025, 0, 0.12, 0.93), PLANK), paint(box(0.025, 0.025, 1.86, -0.93, 0.12, 0), PLANK));
      const [roof, attic, tiles] = gable(0.5, 0.55, 0.24, 0.42, 0.05, 0.035, 0.6, -0.35);
      return {
        body: merge([
          paint(box(1.9, 0.04, 1.9), 0x7a5a36), ...rows, ...fence,
          paint(box(0.5, 0.42, 0.55, 0.6, 0, -0.35), 0x8b5a3c), paint(attic, 0x8b5a3c), tiles,
          paint(box(0.2, 0.28, 0.02, 0.6, 0, -0.07), DARKWOOD),
          paint(cyl(0.16, 0.22, 8, 0.62, 0, 0.4, 0.05), HAY), paint(cyl(0.12, 0.18, 8, 0.38, 0, 0.62, 0.04), HAY),
        ]),
        trim: roof,
      };
    }
    case 'lumberCamp': {
      const logs: G[] = [];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) logs.push(paint(cyl(0.05, 0.42, 7).rotateZ(Math.PI / 2).translate(0, 0, 0), BARK).translate(0.1, 0.05 + r * 0.09, 0.28 - 0.1 + i * 0.1 + r * 0.05));
      return {
        body: merge([
          paint(box(0.8, 0.03, 0.75), SOIL),
          ...[[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.05], [0.3, 0.05]].map(([x, z]) => paint(cyl(0.03, z < 0 ? 0.45 : 0.32, 5, x, 0, z - 0.05), TIMBER)),
          paint(box(0.62, 0.03, 0.42, 0, 0.0, -0.15), PLANK),
          ...logs,
          paint(cyl(0.08, 0.12, 8, -0.25, 0, 0.25), BARK), paint(box(0.02, 0.18, 0.02, -0.25, 0.12, 0.25).rotateZ(0.4), DARKWOOD), paint(box(0.08, 0.05, 0.015, -0.2, 0.26, 0.25), IRON),
        ]),
        trim: plain(new THREE.BoxGeometry(0.7, 0.035, 0.52).rotateX(-0.28).translate(0, 0.42, -0.12)),
      };
    }
    case 'mineCamp': {
      return {
        body: merge([
          paint(box(0.85, 0.05, 0.8), STONE_D),
          paint(new THREE.ConeGeometry(0.42, 0.45, 4).rotateY(Math.PI / 4).scale(1.2, 1, 0.8).translate(0, 0.27, -0.15), STONE),
          paint(box(0.32, 0.3, 0.06, 0, 0.05, 0.12), 0x1d1d20),
          paint(box(0.04, 0.34, 0.04, -0.17, 0.05, 0.15), TIMBER), paint(box(0.04, 0.34, 0.04, 0.17, 0.05, 0.15), TIMBER), paint(box(0.42, 0.05, 0.05, 0, 0.37, 0.15), TIMBER),
          paint(box(0.04, 0.02, 0.5, -0.06, 0.05, 0.4), IRON), paint(box(0.04, 0.02, 0.5, 0.06, 0.05, 0.4), IRON),
          paint(box(0.18, 0.1, 0.14, 0, 0.09, 0.45), PLANK), paint(ball(0.06, 0, 0.21, 0.45), 0x2b2b2e),
          paint(ball(0.1, 0.28, 0.08, 0.28), 0x3a3a3e), paint(ball(0.08, -0.28, 0.07, 0.3), STONE),
        ]),
        trim: plain(box(0.14, 0.1, 0.01, -0.17, 0.4, 0.17)),
      };
    }
    case 'fishingHut': {
      const [roof, attic, tiles] = gable(0.5, 0.42, 0.18, 0.42, 0.05, 0.03, 0, -0.1);
      const legs: G[] = [];
      for (const [x, z] of [[-0.22, -0.28], [0.22, -0.28], [-0.22, 0.08], [0.22, 0.08], [-0.08, 0.4], [0.08, 0.4]]) legs.push(paint(cyl(0.025, 0.14, 5, x, 0, z), TIMBER));
      return {
        body: merge([
          ...legs, paint(box(0.55, 0.03, 0.75, 0, 0.12, 0), PLANK),
          paint(box(0.5, 0.27, 0.42, 0, 0.15, -0.1), PLANK), paint(attic, PLANK), tiles,
          paint(box(0.12, 0.2, 0.02, 0, 0.15, 0.115), DARKWOOD), ...windowAt(0.26, 0.3, -0.1, 'x', 0.08, 0.08),
          paint(box(0.03, 0.3, 0.03, -0.28, 0.15, 0.3), TIMBER), paint(box(0.03, 0.3, 0.03, 0.28, 0.15, 0.3), TIMBER),
          paint(box(0.56, 0.18, 0.005, 0, 0.27, 0.3), 0xa89a7a),
          paint(cyl(0.05, 0.08, 6, 0.17, 0.15, 0.25), PLANK),
        ]),
        trim: roof,
      };
    }
    case 'storehouse': {
      const [roof, attic, tiles] = gable(1.55, 1.15, 0.4, 0.06 + 0.62, 0.08, 0.045);
      const crates: G[] = [];
      for (const [x, z, h] of [[0.65, 0.75, 0], [0.45, 0.78, 0], [0.55, 0.77, 0.16]]) crates.push(paint(box(0.16, 0.16, 0.16, x, 0.06 + h, z), PLANK));
      for (const [x, z] of [[-0.6, 0.78], [-0.42, 0.8]]) crates.push(paint(cyl(0.07, 0.18, 8, x, 0.06, z), 0x7a5232), paint(cyl(0.072, 0.015, 8, x, 0.12, z), IRON));
      return {
        body: merge([
          paint(box(1.75, 0.06, 1.35), STONE),
          paint(box(1.55, 0.62, 1.15, 0, 0.06, 0), PLANK), paint(attic, PLANK), tiles,
          ...[-0.7, -0.35, 0, 0.35, 0.7].map((x) => paint(box(0.04, 0.62, 0.02, x, 0.06, 0.58), TIMBER)),
          paint(box(0.5, 0.48, 0.03, 0, 0.06, 0.585), DARKWOOD), paint(brace(0.62, 0.03, 0.75, 0, 0.3, 0.6), TIMBER),
          ...windowAt(0.55, 0.5, 0.585, 'z'), ...windowAt(-0.55, 0.5, 0.585, 'z'),
          ...crates,
        ]),
        trim: roof,
      };
    }
    case 'outpost': {
      const legs: G[] = [];
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) legs.push(paint(cyl(0.035, 1.1, 5, x, 0, z, 0.03), TIMBER));
      const rails: G[] = [];
      for (const sz of [-1, 1]) { rails.push(paint(box(0.5, 0.02, 0.02, 0, 1.28, sz * 0.25), PLANK), paint(box(0.02, 0.02, 0.5, sz * 0.25, 1.28, 0), PLANK)); }
      return {
        body: merge([
          ...legs, paint(brace(0.55, 0.025, 1.0, 0, 0.5, 0.2), TIMBER), paint(brace(0.55, 0.025, -1.0, 0, 0.5, -0.2), TIMBER),
          paint(box(0.56, 0.05, 0.56, 0, 1.1, 0), PLANK), ...rails,
          ...[[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].map(([x, z]) => paint(cyl(0.02, 0.45, 4, x, 1.15, z), TIMBER)),
          paint(cyl(0.015, 0.55, 4, 0, 1.6, 0), DARKWOOD),
        ]),
        trim: merge([plain(cone(0.42, 0.25, 4, 0, 1.6, 0).rotateY(Math.PI / 4)), plain(box(0.22, 0.13, 0.01, 0.11, 2.0, 0))]),
      };
    }
    case 'barracks': {
      const [roof, attic, tiles] = gable(1.5, 0.95, 0.36, 0.06 + 0.55, 0.07, 0.045, 0, -0.25);
      const racks: G[] = [];
      for (let i = 0; i < 4; i++) racks.push(paint(cyl(0.012, 0.42, 4, -0.55 + i * 0.09, 0.06, 0.62), DARKWOOD), paint(cone(0.02, 0.06, 4, -0.55 + i * 0.09, 0.48, 0.62), IRON));
      return {
        body: merge([
          paint(box(1.85, 0.06, 1.85), SOIL), paint(box(1.6, 0.06, 1.05, 0, 0, -0.25), STONE),
          ...timberBlock(1.5, 0.55, 0.95, 0.06, 0, -0.25), paint(attic, PLASTER), tiles,
          paint(box(0.28, 0.38, 0.03, 0, 0.06, 0.24), DARKWOOD), ...windowAt(-0.45, 0.42, 0.235, 'z'), ...windowAt(0.45, 0.42, 0.235, 'z'),
          paint(box(0.9, 0.04, 0.04, -0.4, 0.4, 0.6), TIMBER), ...racks,
          paint(cyl(0.12, 0.1, 10, 0.55, 0.06, 0.6), HAY), paint(box(0.04, 0.4, 0.04, 0.55, 0.16, 0.6), TIMBER),
        ]),
        trim: merge([roof, plain(box(0.22, 0.32, 0.01, 0.55, 0.3, 0.63))]),
      };
    }
    case 'workshop': {
      const [roof, attic, tiles] = gable(1.4, 1.0, 0.32, 0.06 + 0.6, 0.07, 0.045, 0, -0.2);
      return {
        body: merge([
          paint(box(1.85, 0.05, 1.85), SOIL),
          paint(box(1.4, 0.6, 1.0, 0, 0.06, -0.2), PLANK), paint(attic, PLANK), tiles,
          paint(box(0.7, 0.5, 0.03, 0, 0.06, 0.31), DARKWOOD),
          paint(cyl(0.06, 0.9, 8, 0.45, 0.07, 0.65).rotateZ(Math.PI / 2).translate(0.45, 0.07, 0), BARK),
          paint(cyl(0.12, 0.05, 10, 0.4, 0.12, 0.62).rotateX(Math.PI / 2), DARKWOOD), paint(cyl(0.12, 0.05, 10, -0.4, 0.12, 0.62).rotateX(Math.PI / 2), DARKWOOD),
          paint(box(0.3, 0.2, 0.2, -0.6, 0.05, 0.6), PLANK),
        ]),
        trim: roof,
      };
    }
    case 'dock': {
      const piles: G[] = [];
      for (const [x, z] of [[-0.8, 0.5], [-0.3, 0.5], [0.2, 0.5], [0.7, 0.5], [-0.8, 0.9], [0.7, 0.9]]) piles.push(paint(cyl(0.04, 0.35, 6, x, -0.2, z), TIMBER));
      const [roof, attic, tiles] = gable(0.8, 0.6, 0.24, 0.45, 0.05, 0.035, -0.4, -0.45);
      return {
        body: merge([
          ...piles, paint(box(1.8, 0.05, 0.6, 0, 0.12, 0.65), PLANK),
          paint(box(0.8, 0.45, 0.6, -0.4, 0, -0.45), PLANK), paint(attic, PLANK), tiles,
          paint(box(0.2, 0.3, 0.02, -0.4, 0, -0.14), DARKWOOD),
          paint(cyl(0.02, 1.1, 5, 0.5, 0.12, -0.3), DARKWOOD), paint(box(0.5, 0.02, 0.02, 0.5, 1.05, -0.3), DARKWOOD),
          paint(cyl(0.06, 0.12, 8, 0.4, 0.17, 0.6), PLANK),
        ]),
        trim: merge([roof, plain(box(0.25, 0.15, 0.01, 0.62, 0.85, -0.3))]),
      };
    }
    case 'wall': return {
      body: merge([
        paint(box(0.98, 0.62, 0.62), STONE), paint(box(0.98, 0.04, 0.66, 0, 0.62, 0), STONE_D),
        ...[-0.36, 0, 0.36].map((x) => paint(box(0.18, 0.14, 0.62, x, 0.66, 0), STONE)),
        paint(box(0.98, 0.08, 0.66, 0, 0, 0), STONE_D),
      ]),
      trim: plain(box(0.001, 0.001, 0.001)),
    };
    case 'gate': return {
      body: merge([
        paint(box(0.3, 0.85, 0.66, -0.34, 0, 0), STONE), paint(box(0.3, 0.85, 0.66, 0.34, 0, 0), STONE),
        paint(box(0.98, 0.22, 0.66, 0, 0.63, 0), STONE), paint(box(0.38, 0.6, 0.06, 0, 0, 0.0), DARKWOOD),
        ...[-0.08, 0.08].map((x) => paint(box(0.02, 0.6, 0.07, x, 0, 0), IRON)),
      ]),
      trim: merge([plain(box(0.2, 0.2, 0.01, -0.34, 0.95, 0.34)), plain(box(0.2, 0.2, 0.01, 0.34, 0.95, 0.34))]),
    };
    case 'tower': {
      const crenels: G[] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; crenels.push(paint(box(0.11, 0.12, 0.11, Math.cos(a) * 0.36, 1.56, Math.sin(a) * 0.36), STONE)); }
      return {
        body: merge([
          paint(cyl(0.4, 1.5, 10, 0, 0, 0, 0.36), STONE), paint(cyl(0.44, 0.08, 10, 0, 1.48, 0), STONE_D), ...crenels,
          paint(box(0.18, 0.3, 0.03, 0, 0.02, 0.38), DARKWOOD), ...windowAt(0, 0.9, 0.38, 'z', 0.06, 0.14), ...windowAt(0.38, 1.15, 0, 'x', 0.06, 0.12),
          paint(cyl(0.02, 0.55, 4, 0, 1.56, 0), DARKWOOD),
        ]),
        trim: plain(box(0.26, 0.17, 0.01, 0.13, 1.9, 0)),
      };
    }
    // ---- Phase 5 buildings (original, generated in code) ----
    case 'forge': {
      const [roof, attic, tiles] = gable(1.4, 1.0, 0.3, 0.7, 0.07);
      return {
        body: merge([
          paint(box(1.7, 0.08, 1.4), STONE_D), paint(box(1.4, 0.62, 1.0, 0, 0.08, 0), STONE), paint(attic, STONE_D), tiles,
          paint(box(0.3, 1.5, 0.3, 0.5, 0.08, -0.3), STONE_D), paint(box(0.36, 0.06, 0.36, 0.5, 1.58, -0.3), IRON),
          paint(box(0.36, 0.3, 0.02, -0.3, 0.08, 0.51), 0xd8692f), paint(box(0.3, 0.12, 0.2, -0.3, 0.08, 0.75), IRON), paint(box(0.12, 0.2, 0.12, 0.35, 0.08, 0.75), IRON),
        ]),
        trim: roof,
      };
    }
    case 'pier': {
      const posts: G[] = [];
      for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85], [0, -0.85], [0, 0.85]]) posts.push(paint(cyl(0.06, 0.5, 6, x, -0.3, z), DARKWOOD));
      const planks: G[] = [];
      for (let i = 0; i < 9; i++) planks.push(paint(box(0.2, 0.06, 1.9, -0.84 + i * 0.21, 0.14, 0), i % 2 ? PLANK : 0x8a6440));
      return { body: merge([...posts, ...planks]), trim: plain(box(0.04, 0.4, 0.04, 0.85, 0.2, 0.85)) };
    }
    case 'tidepool': return {
      body: merge([paint(cyl(0.95, 0.12, 12), STONE), paint(cyl(0.8, 0.05, 12, 0, 0.12, 0), 0x2f7f9a), paint(cone(0.25, 0.8, 7, -0.5, 0.1, -0.3), 0xd9826a), paint(cone(0.18, 0.6, 7, 0.55, 0.1, 0.25), 0xe2a07c), paint(ball(0.22, 0, 0.3, 0.5), 0xcfe3e8)]),
      trim: plain(cone(0.3, 0.5, 6, 0, 0.4, -0.55)),
    };
    case 'beastPen': {
      const fence: G[] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fence.push(paint(cyl(0.04, 0.45, 5, Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85), DARKWOOD)); }
      for (const z of [-0.85, 0.85]) fence.push(paint(box(1.7, 0.05, 0.04, 0, 0.3, z), TIMBER));
      const [roof, attic] = gable(0.8, 0.6, 0.25, 0.45, 0.06, 0.04, -0.3, -0.3);
      return { body: merge([paint(box(1.8, 0.04, 1.8), SOIL), ...fence, paint(box(0.8, 0.45, 0.6, -0.3, 0, -0.3), TIMBER), paint(attic, TIMBER), paint(box(0.5, 0.12, 0.3, 0.45, 0, 0.4), HAY)]), trim: roof };
    }
    case 'tunnelHall': return {
      body: merge([paint(cone(1.0, 0.9, 8), STONE_D), paint(box(0.5, 0.5, 0.2, 0, 0, 0.75), 0x2a2622), paint(box(0.62, 0.1, 0.25, 0, 0.5, 0.75), STONE), paint(cyl(0.05, 0.4, 5, -0.4, 0, 0.8), DARKWOOD), paint(cyl(0.05, 0.4, 5, 0.4, 0, 0.8), DARKWOOD)]),
      trim: plain(box(0.5, 0.12, 0.05, 0, 0.62, 0.86)),
    };
    case 'sporeTower': return {
      body: merge([paint(cyl(0.18, 1.0, 8, 0, 0, 0, 0.12), 0xd8cfb8), paint(ball(0.12, 0.2, 0.5, 0.1), 0xb98bc9), paint(ball(0.1, -0.18, 0.35, -0.05), 0xb98bc9)]),
      trim: plain(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 1.0, 0)),
    };
    case 'aerie': {
      const [roof] = gable(1.2, 0.9, 0.3, 1.2, 0.06);
      return {
        body: merge([paint(box(1.6, 0.06, 1.6), STONE), ...[[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]].map(([x, z]) => paint(cyl(0.06, 1.2, 6, x, 0, z), TIMBER)), paint(box(1.3, 0.06, 1.0, 0, 1.15, 0), PLANK), paint(box(0.9, 0.04, 0.3, 0, 0.6, 0.65).rotateX(0.2), CANVAS)]),
        trim: roof,
      };
    }
    case 'greatForge': {
      const [roof, attic, tiles] = gable(1.5, 1.1, 0.35, 0.85, 0.07);
      return {
        body: merge([
          paint(box(1.8, 0.1, 1.5), STONE_D), paint(box(1.5, 0.75, 1.1, 0, 0.1, 0), IRON), paint(attic, STONE_D), tiles,
          paint(cyl(0.16, 1.8, 8, -0.5, 0.1, -0.35), STONE_D), paint(cyl(0.16, 1.6, 8, 0.5, 0.1, -0.35), STONE_D), paint(box(0.5, 0.35, 0.02, 0, 0.1, 0.56), 0xe0792f),
        ]),
        trim: roof,
      };
    }
    case 'stiltHall': {
      const [roof, attic] = gable(1.3, 1.0, 0.45, 0.95, 0.08);
      return {
        body: merge([...[[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4], [0, 0]].map(([x, z]) => paint(cyl(0.05, 0.5, 5, x, 0, z), DARKWOOD)), paint(box(1.3, 0.45, 1.0, 0, 0.5, 0), TIMBER), paint(attic, THATCH), paint(box(0.3, 0.06, 0.6, 0, 0.25, 0.75).rotateX(-0.4), PLANK)]),
        trim: roof,
      };
    }
    // ---- Phase 8 buildings: variants of earlier shapes
    case 'caravanserai': { const m = buildingModel('storehouse', s); return { body: merge([m.body.clone(), paint(box(1.6, 0.05, 0.6, 0, 0.9, 0.5), 0xd9b56a)]), trim: m.trim.clone() }; }
    case 'library': { const m = buildingModel('barracks', s); return { body: merge([m.body.clone(), paint(cyl(0.25, 0.3, 10, 0.5, 1.2, -0.4), 0xe6dcc3), paint(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.5, 1.5, -0.4), 0x9fd0ff)]), trim: m.trim.clone() }; }
    case 'grove': return { body: merge([paint(box(1.8, 0.04, 1.8), SOIL), ...[[-0.5, -0.5], [0.5, -0.4], [-0.4, 0.5], [0.5, 0.5]].map(([x, z]) => paint(cyl(0.07, 0.6, 6, x, 0, z), BARK)), ...[[-0.5, -0.5], [0.5, -0.4], [-0.4, 0.5], [0.5, 0.5]].map(([x, z]) => paint(ball(0.32, x, 0.8, z), LEAF2)), paint(cyl(0.3, 0.12, 10), STONE)]), trim: plain(box(0.06, 0.4, 0.06, 0, 0.12, 0)) };
    case 'reefDock': { const m = buildingModel('dock', s); return { body: merge([m.body.clone(), paint(cone(0.2, 0.5, 6, -0.6, 0, 0.6), 0xd9826a), paint(cone(0.15, 0.4, 6, 0.6, 0, 0.6), 0xe2a07c)]), trim: m.trim.clone() }; }
    case 'iceLodge': return {
      body: merge([paint(new THREE.SphereGeometry(0.8, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe4eef2), paint(box(0.4, 0.4, 0.5, 0, 0, 0.75), 0xd2e0e6), paint(box(0.24, 0.3, 0.02, 0, 0, 1.01), 0x3a4a55), paint(box(0.3, 0.08, 0.3, 0.6, 0, -0.55), 0x9fc6d6)]),
      trim: plain(box(0.04, 0.5, 0.25, -0.5, 0.6, 0)),
    };
  }
  void s;
}

/** A small humanoid: legs, tunic, arms, head. Height ≈ 0.6. */
function person(tunic: number, extra: G[] = []): G {
  return merge([
    paint(box(0.06, 0.2, 0.07, -0.045, 0, 0), CLOTH2), paint(box(0.06, 0.2, 0.07, 0.045, 0, 0), CLOTH2),
    paint(box(0.17, 0.22, 0.11, 0, 0.2, 0), tunic),
    paint(box(0.045, 0.2, 0.05, -0.11, 0.22, 0), tunic), paint(box(0.045, 0.2, 0.05, 0.11, 0.22, 0), tunic),
    paint(ball(0.07, 0, 0.5, 0, 8, 6), SKIN),
    ...extra,
  ]);
}

export type UnitModelName = UnitTypeName | 'animal' | 'carcass';

/** Four-legged beast (tamed animals, war beasts, mammoths), scaled up from the wild-animal shape. */
function beastModel(fur: number, light: number, k: number, armored = false, tusks = false): Model {
  const legs: G[] = [];
  for (const [x, z] of [[-0.12, -0.05], [-0.12, 0.05], [0.12, -0.05], [0.12, 0.05]]) legs.push(paint(box(0.04, 0.18, 0.04, x, 0, z), fur));
  const extra: G[] = [];
  if (tusks) extra.push(paint(cone(0.015, 0.14, 5).rotateZ(-1.9).translate(0.3, 0.33, 0.04), 0xf3ead8), paint(cone(0.015, 0.14, 5).rotateZ(-1.9).translate(0.3, 0.33, -0.04), 0xf3ead8));
  return {
    body: merge([...legs, paint(ball(0.11, 0, 0.26, 0, 8, 6).scale(1.6, 0.95, 0.85), fur), paint(ball(0.08, 0.21, 0.38, 0, 6, 5), light), ...extra]).scale(k, k, k),
    trim: (armored ? plain(box(0.26, 0.05, 0.2, 0, 0.36, 0)) : plain(box(0.1, 0.02, 0.17, -0.02, 0.36, 0))).scale(k, k, k),
  };
}

/** Long reptile or sea beast (thunder lizard, leviathan). */
function reptileModel(skin: number, belly: number, k: number, fins = false): Model {
  const legs: G[] = [];
  for (const [x, z] of [[-0.12, -0.07], [-0.12, 0.07], [0.12, -0.07], [0.12, 0.07]]) legs.push(paint(box(0.04, 0.12, 0.04, x, 0, z), skin));
  return {
    body: merge([...legs, paint(ball(0.1, 0, 0.2, 0, 8, 6).scale(2.2, 0.8, 0.8), skin), paint(ball(0.06, 0.28, 0.27, 0, 6, 5).scale(1.4, 0.8, 0.8), belly), paint(cone(0.06, 0.3, 6).rotateZ(Math.PI / 2).translate(-0.32, 0.2, 0), skin)]).scale(k, k, k),
    trim: (fins ? plain(cone(0.05, 0.14, 3, 0, 0.26, 0).scale(1.8, 1, 0.3)) : plain(box(0.3, 0.03, 0.02, 0, 0.29, 0))).scale(k, k, k),
  };
}

/** Unit models. */
export function unitModel(kind: UnitModelName): Model {
  switch (kind) {
    case 'spearman': return {
      body: person(0x6e6a64, [paint(box(0.19, 0.12, 0.13, 0, 0.3, 0), IRON), paint(cyl(0.013, 0.85, 4, 0.15, 0.0, 0.05), DARKWOOD), paint(cone(0.03, 0.12, 4, 0.15, 0.85, 0.05), IRON)]),
      trim: merge([plain(new THREE.BoxGeometry(0.03, 0.26, 0.2).translate(-0.15, 0.3, 0.04)), plain(cyl(0.075, 0.06, 8, 0, 0.55, 0, 0.06))]),
    };
    case 'archer': return {
      body: person(0x5d6b48, [paint(new THREE.TorusGeometry(0.17, 0.012, 4, 10, Math.PI).rotateZ(Math.PI / 2).translate(0.15, 0.32, 0.03), DARKWOOD), paint(cyl(0.04, 0.24, 6, -0.03, 0.22, -0.08), PLANK)]),
      trim: plain(cone(0.09, 0.14, 8, 0, 0.55, 0)),
    };
    case 'rider': {
      const legs: G[] = [];
      for (const [x, z] of [[-0.16, -0.07], [-0.16, 0.07], [0.16, -0.07], [0.16, 0.07]]) legs.push(paint(box(0.05, 0.26, 0.05, x, 0, z), 0x4e3423));
      return {
        body: merge([
          ...legs, paint(ball(0.13, 0, 0.34, 0, 8, 6).scale(1.7, 0.85, 0.8), 0x6b4428), paint(box(0.08, 0.2, 0.08, 0.26, 0.38, 0).rotateZ(-0.6).translate(0.08, 0, 0), 0x6b4428),
          paint(ball(0.07, 0.36, 0.53, 0), 0x6b4428),
          paint(box(0.14, 0.2, 0.12, 0, 0.45, 0), 0x6e6a64), paint(ball(0.065, 0, 0.72, 0), SKIN), paint(cyl(0.012, 0.7, 4, 0.08, 0.45, 0.1).rotateZ(-1.2).translate(0.3, 0.2, 0), DARKWOOD),
        ]),
        trim: merge([plain(box(0.36, 0.03, 0.26, 0, 0.42, 0)), plain(cone(0.07, 0.1, 8, 0, 0.77, 0))]),
      };
    }
    case 'ram': {
      const wheels: G[] = [];
      for (const [x, z] of [[-0.25, 0.2], [0.25, 0.2], [-0.25, -0.2], [0.25, -0.2]]) wheels.push(paint(cyl(0.11, 0.04, 10).rotateX(Math.PI / 2).translate(x, 0.11, z), DARKWOOD));
      const [roof] = gable(0.7, 0.42, 0.28, 0.22, 0.04, 0.035);
      return {
        body: merge([...wheels, paint(box(0.7, 0.06, 0.42, 0, 0.12, 0), PLANK), paint(cyl(0.07, 0.95, 8).rotateZ(Math.PI / 2).translate(0.05, 0.3, 0), BARK), paint(cone(0.09, 0.12, 8).rotateZ(-Math.PI / 2).translate(0.58, 0.3, 0), IRON)]),
        trim: roof,
      };
    }
    case 'spy': return {
      body: person(0x2e3138, [paint(cone(0.12, 0.3, 8, 0, 0.0, 0).scale(1, 1, 0.8), 0x2e3138)]),
      trim: plain(new THREE.SphereGeometry(0.085, 8, 5, 0, Math.PI * 2, 0, Math.PI / 1.8).translate(0, 0.51, 0)),
    };
    case 'saboteur': return {
      body: person(0x3b3530, [paint(ball(0.06, 0.15, 0.18, 0.05), 0x222222), paint(cyl(0.006, 0.08, 3, 0.15, 0.24, 0.05), 0xe8d26a)]),
      trim: plain(box(0.17, 0.05, 0.12, 0, 0.36, 0)),
    };
    case 'warship': {
      return {
        body: merge([
          paint(box(1.0, 0.18, 0.36, 0, 0.0, 0), PLANK), paint(cone(0.18, 0.3, 4).rotateZ(-Math.PI / 2).scale(1, 1, 1).translate(0.62, 0.09, 0), PLANK),
          paint(box(0.3, 0.15, 0.3, -0.35, 0.18, 0), DARKWOOD), paint(cyl(0.025, 0.9, 5, 0.05, 0.18, 0), DARKWOOD),
          ...[-0.2, 0.1, 0.4].map((x) => paint(cyl(0.03, 0.12, 6, x, 0.12, 0.18).rotateX(Math.PI / 2).translate(0, 0, 0.0), IRON)),
        ]),
        trim: merge([plain(box(0.04, 0.5, 0.5, 0.05, 0.45, 0)), plain(box(0.15, 0.08, 0.01, 0.13, 1.03, 0))]),
      };
    }
    case 'transport': return {
      body: merge([
        paint(box(0.9, 0.16, 0.42, 0, 0, 0), PLANK), paint(cone(0.21, 0.26, 4).rotateZ(-Math.PI / 2).translate(0.56, 0.08, 0), PLANK),
        paint(box(0.5, 0.05, 0.36, -0.1, 0.16, 0), DARKWOOD), paint(cyl(0.02, 0.7, 5, 0.1, 0.16, 0), DARKWOOD),
        ...[-0.3, -0.1].map((x) => paint(box(0.14, 0.12, 0.14, x, 0.18, 0.06), PLANK)),
      ]),
      trim: plain(box(0.04, 0.4, 0.42, 0.1, 0.38, 0)),
    };
    case 'worker': return {
      body: person(CLOTH, [paint(cyl(0.012, 0.32, 4, 0.14, 0.12, 0.04), DARKWOOD), paint(box(0.1, 0.035, 0.03, 0.14, 0.42, 0.04), IRON)]),
      trim: plain(cyl(0.075, 0.05, 8, 0, 0.55, 0, 0.05)),
    };
    case 'scout': return {
      body: person(CLOTH2, [paint(cyl(0.012, 0.7, 4, 0.15, 0.02, 0), DARKWOOD), paint(cone(0.025, 0.08, 4, 0.15, 0.72, 0), IRON)]),
      trim: merge([plain(new THREE.BoxGeometry(0.2, 0.32, 0.03).translate(0, 0.28, -0.07)), plain(cone(0.08, 0.1, 8, 0, 0.55, 0))]),
    };
    case 'settler': {
      const wheels: G[] = [];
      for (const [x, z] of [[-0.18, 0.16], [0.18, 0.16], [-0.18, -0.16], [0.18, -0.16]]) wheels.push(paint(cyl(0.09, 0.03, 10).rotateX(Math.PI / 2).translate(x, 0.09, z), DARKWOOD));
      const cover = new THREE.CylinderGeometry(0.16, 0.16, 0.48, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.22, 0);
      return {
        body: merge([...wheels, paint(box(0.48, 0.08, 0.28, 0, 0.12, 0), PLANK), paint(cover.rotateZ(0), CANVAS), paint(box(0.22, 0.02, 0.02, 0.36, 0.14, 0), DARKWOOD), paint(box(0.08, 0.06, 0.06, 0.22, 0.2, 0.0), 0x6b5a3a)]),
        trim: plain(box(0.14, 0.09, 0.005, -0.12, 0.42, 0)),
      };
    }
    // ---- Phase 5 units ----
    case 'beast': return beastModel(FUR, FUR_L, 1.25);
    case 'warbeast': return beastModel(0x5e4636, 0x9c8167, 1.6, true);
    case 'thunderlizard': return reptileModel(0x4d6b3a, 0x8fa66a, 2.6);
    case 'tideguard': return { body: person(0x2f7f9a, [paint(cyl(0.012, 0.8, 4, 0.15, 0.0, 0.05), DARKWOOD), paint(cone(0.05, 0.14, 3, 0.15, 0.8, 0.05), 0xd9826a)]), trim: plain(cone(0.09, 0.16, 6, 0, 0.55, 0)) };
    case 'leviathan': return reptileModel(0x2c5f73, 0x7fb3c4, 2.8, true);
    case 'burrower': return { body: person(0x5c544a, [paint(box(0.2, 0.14, 0.14, 0, 0.3, 0), IRON), paint(cyl(0.014, 0.5, 4, 0.15, 0.1, 0.05), DARKWOOD), paint(box(0.16, 0.06, 0.03, 0.15, 0.58, 0.05), IRON)]), trim: plain(cyl(0.08, 0.07, 8, 0, 0.55, 0, 0.07)) };
    case 'deepDrill': {
      const wheels: G[] = [];
      for (const [x, z] of [[-0.3, 0.22], [0.3, 0.22], [-0.3, -0.22], [0.3, -0.22]]) wheels.push(paint(cyl(0.12, 0.05, 10).rotateX(Math.PI / 2).translate(x, 0.12, z), IRON));
      return { body: merge([...wheels, paint(box(0.8, 0.22, 0.46, 0, 0.12, 0), IRON), paint(cone(0.17, 0.5, 8).rotateZ(-Math.PI / 2).translate(0.62, 0.34, 0), 0x9a9da3)]), trim: plain(box(0.36, 0.18, 0.36, -0.15, 0.34, 0)) };
    }
    case 'sporeling': return { body: merge([paint(cyl(0.07, 0.3, 6, 0, 0, 0, 0.05), 0xd8cfb8), paint(ball(0.04, 0.05, 0.2, 0.06), 0xb98bc9)]), trim: plain(new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.3, 0)) };
    case 'bloomHulk': return { body: merge([paint(cyl(0.3, 0.9, 8, 0, 0, 0, 0.22), 0xd8cfb8), paint(cyl(0.08, 0.5, 6, -0.32, 0.25, 0), 0xd8cfb8), paint(cyl(0.08, 0.5, 6, 0.32, 0.25, 0), 0xd8cfb8), paint(ball(0.08, 0.15, 0.6, 0.25), 0xb98bc9)]), trim: plain(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.9, 0)) };
    case 'glider': return { body: person(CLOTH2, [paint(cyl(0.01, 0.4, 4, 0, 0.55, 0), DARKWOOD), paint(cyl(0.01, 0.5, 4, 0.12, 0.05, 0.04), DARKWOOD)]), trim: plain(new THREE.ConeGeometry(0.55, 0.12, 3).rotateX(-Math.PI / 2).scale(1, 1, 0.5).translate(0, 0.9, 0)) };
    case 'skyLancer': return { body: person(0x6e6a64, [paint(box(0.19, 0.12, 0.13, 0, 0.3, 0), IRON), paint(cyl(0.013, 1.0, 4, 0.15, 0.0, 0.05).rotateZ(-0.3), DARKWOOD), paint(cyl(0.01, 0.4, 4, 0, 0.55, 0), DARKWOOD)]), trim: plain(new THREE.ConeGeometry(0.7, 0.14, 3).rotateX(-Math.PI / 2).scale(1, 1, 0.5).translate(0, 0.95, 0)) };
    case 'ironguard': return { body: person(IRON, [paint(box(0.21, 0.26, 0.15, 0, 0.18, 0), 0x7d828a), paint(box(0.04, 0.32, 0.24, -0.15, 0.15, 0.04), IRON), paint(box(0.03, 0.4, 0.03, 0.15, 0.1, 0.05), 0x9a9da3)]), trim: plain(cyl(0.08, 0.1, 8, 0, 0.5, 0, 0.075)) };
    case 'steamGolem': return { body: merge([paint(box(0.18, 0.4, 0.18, -0.15, 0, 0), IRON), paint(box(0.18, 0.4, 0.18, 0.15, 0, 0), IRON), paint(box(0.6, 0.5, 0.4, 0, 0.4, 0), 0x7d828a), paint(box(0.14, 0.45, 0.14, -0.38, 0.4, 0), IRON), paint(box(0.14, 0.45, 0.14, 0.38, 0.4, 0), IRON), paint(cyl(0.06, 0.3, 6, -0.15, 0.9, -0.1), STONE_D), paint(box(0.24, 0.18, 0.2, 0, 0.9, 0.05), 0x7d828a)]), trim: plain(box(0.26, 0.06, 0.06, 0, 0.98, 0.16)) };
    case 'bogStalker': return { body: person(0x4f5e3a, [paint(cyl(0.012, 0.7, 4, 0.15, 0.0, 0.05), DARKWOOD), paint(box(0.24, 0.05, 0.14, 0, 0.42, 0), 0x6b7a3f)]), trim: plain(cone(0.1, 0.12, 6, 0, 0.55, 0)) };
    case 'mireHorror': return { body: merge([paint(ball(0.4, 0, 0.4, 0, 9, 6).scale(1, 1.1, 0.9), 0x4a5a34), paint(cyl(0.1, 0.4, 6, -0.25, 0, 0), 0x3b4a2a), paint(cyl(0.1, 0.4, 6, 0.25, 0, 0), 0x3b4a2a), paint(ball(0.05, -0.1, 0.65, 0.33), 0xe8e070), paint(ball(0.05, 0.1, 0.65, 0.33), 0xe8e070)]), trim: plain(box(0.5, 0.06, 0.06, 0, 0.85, 0)) };
    case 'frostWarden': return { body: person(0xc9d8e0, [paint(box(0.2, 0.12, 0.14, 0, 0.3, 0), 0xe8eef0), paint(cyl(0.013, 0.8, 4, 0.15, 0.0, 0.05), DARKWOOD), paint(box(0.08, 0.12, 0.02, 0.15, 0.72, 0.05), 0x9fc6d6)]), trim: plain(cone(0.1, 0.16, 8, 0, 0.55, 0)) };
    case 'mammoth': return beastModel(0x6b4a33, 0x8a6648, 2.6, true, true);
    // ---- Phase 8 units ----
    case 'duneRider': { const r = unitModel('rider'); return { body: r.body.clone(), trim: merge([r.trim.clone(), plain(box(0.3, 0.04, 0.2, 0, 0.62, 0))]) }; }
    case 'sandWyrm': return reptileModel(0xc8a565, 0xe3cc94, 2.8);
    case 'arcanist': return { body: person(0x3e4f8a, [paint(cyl(0.012, 0.75, 4, 0.15, 0.0, 0.05), DARKWOOD), paint(ball(0.04, 0.15, 0.78, 0.05), 0x9fd0ff)]), trim: plain(cone(0.09, 0.22, 8, 0, 0.55, 0)) };
    case 'colossus': return { body: merge([paint(box(0.22, 0.5, 0.22, -0.18, 0, 0), 0xb08d57), paint(box(0.22, 0.5, 0.22, 0.18, 0, 0), 0xb08d57), paint(box(0.7, 0.6, 0.45, 0, 0.5, 0), 0xc9a76a), paint(box(0.3, 0.25, 0.3, 0, 1.1, 0), 0xb08d57), paint(ball(0.05, -0.06, 1.25, 0.16), 0x9fd0ff), paint(ball(0.05, 0.06, 1.25, 0.16), 0x9fd0ff)]), trim: plain(box(0.75, 0.08, 0.5, 0, 0.95, 0)) };
    case 'grovewarden': return { body: person(0x3f6b3a, [paint(new THREE.TorusGeometry(0.17, 0.012, 4, 10, Math.PI).rotateZ(Math.PI / 2).translate(0.15, 0.32, 0.03), DARKWOOD), paint(box(0.24, 0.05, 0.14, 0, 0.42, 0), LEAF2)]), trim: plain(cone(0.1, 0.14, 6, 0, 0.55, 0)) };
    case 'treant': return { body: merge([paint(cyl(0.18, 1.0, 7, 0, 0, 0, 0.14), BARK), paint(cyl(0.06, 0.5, 5, -0.25, 0.5, 0).rotateZ(0.6), BARK), paint(cyl(0.06, 0.5, 5, 0.25, 0.5, 0).rotateZ(-0.6), BARK), paint(ball(0.35, 0, 1.15, 0), LEAF), paint(ball(0.25, 0.2, 1.0, 0.1), LEAF2)]), trim: plain(box(0.3, 0.06, 0.06, 0, 0.7, 0.15)) };
    case 'reefguard': return { body: person(0x2f6f8a, [paint(box(0.04, 0.3, 0.24, -0.15, 0.15, 0.04), 0xd9826a), paint(cyl(0.012, 0.8, 4, 0.15, 0.0, 0.05), DARKWOOD)]), trim: plain(cone(0.09, 0.14, 6, 0, 0.55, 0)) };
    case 'kraken': return { body: merge([paint(ball(0.35, 0, 0.25, 0, 9, 6).scale(1, 0.8, 1), 0x7a3f6b), ...[0, 1, 2, 3, 4, 5].map((k) => paint(cyl(0.05, 0.6, 5).rotateZ(Math.PI / 2.4).rotateY((k / 6) * Math.PI * 2).translate(0, 0.1, 0), 0x8e4d7d)), paint(ball(0.05, 0.12, 0.42, 0.3), 0xf3e070), paint(ball(0.05, -0.12, 0.42, 0.3), 0xf3e070)]).scale(1.6, 1.6, 1.6), trim: plain(box(0.3, 0.05, 0.05, 0, 0.9, 0)) };
    case 'animal': {
      const legs: G[] = [];
      for (const [x, z] of [[-0.12, -0.05], [-0.12, 0.05], [0.12, -0.05], [0.12, 0.05]]) legs.push(paint(box(0.035, 0.18, 0.035, x, 0, z), FUR));
      return {
        body: merge([
          ...legs, paint(ball(0.1, 0, 0.24, 0, 8, 6).scale(1.6, 0.85, 0.8), FUR), paint(ball(0.08, 0.2, 0.4, 0, 6, 5).scale(1, 1, 0.9).translate(0, 0, 0), FUR_L),
          paint(box(0.05, 0.12, 0.05, 0.16, 0.28, 0).rotateZ(-0.5), FUR), paint(ball(0.03, -0.17, 0.27, 0), 0xf3e7d6),
        ]),
        trim: merge([plain(brace(0.12, 0.012, 1.0, 0.2, 0.52, 0.04)), plain(brace(0.12, 0.012, 1.0, 0.2, 0.52, -0.04))]),
      };
    }
    case 'carcass': return {
      body: merge([paint(ball(0.1, 0, 0.06, 0, 8, 6).scale(1.6, 0.6, 0.8), 0x7a4a2b), paint(ball(0.06, 0.2, 0.05, 0), FUR_L), ...[-0.1, 0.05].map((x) => paint(box(0.16, 0.03, 0.03, x, 0.03, 0.12), FUR))]),
      trim: plain(box(0.001, 0.001, 0.001)),
    };
  }
}

/** Two tree species (vertex-colored); instance color only dims them in fog. */
export const pineGeometry = (): G => merge([paint(cyl(0.05, 0.22, 6, 0, 0, 0, 0.04), BARK), paint(cone(0.34, 0.42, 7, 0, 0.16, 0), LEAF), paint(cone(0.27, 0.38, 7, 0, 0.38, 0), LEAF2), paint(cone(0.18, 0.32, 7, 0, 0.6, 0), LEAF3)]);
export const broadleafGeometry = (): G => merge([paint(cyl(0.05, 0.32, 6, 0, 0, 0, 0.035), BARK), paint(ball(0.24, 0, 0.5, 0), LEAF2), paint(ball(0.18, 0.13, 0.42, 0.06), LEAF3), paint(ball(0.17, -0.12, 0.44, -0.05), LEAF)]);
/** Deposit rock cluster; color comes from the instance (resource type). */
export const rockGeometry = (): G => merge([
  plain(new THREE.DodecahedronGeometry(0.22, 0).scale(1, 0.75, 1).translate(0, 0.12, 0)),
  plain(new THREE.DodecahedronGeometry(0.14, 0).scale(1, 0.8, 1).translate(0.2, 0.08, 0.12)),
  plain(new THREE.DodecahedronGeometry(0.11, 0).translate(-0.18, 0.07, 0.1)),
]);
export const cargoGeometry = (): G => plain(box(0.13, 0.13, 0.13, 0, 0.3, -0.1));
