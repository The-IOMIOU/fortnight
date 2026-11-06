// Seeded procedural continent generator. Pure and deterministic: same (seed, size) → same map
// on every JS engine (integer math only, single seeded PRNG stream, fixed iteration order).

import { Rng } from '../core/prng';
import { hashArrays } from '../core/hash';
import { isqrt } from '../core/fixed';
import { TUNING, type MapSize } from '../core/tuning';
import { fbm, valueNoise } from './noise';

export const Biome = {
  OCEAN: 0, LAKE: 1, RIVER: 2, ICE: 3,
  COAST: 4, PLAINS: 5, FOREST: 6, DESERT: 7, SWAMP: 8, MOUNTAIN: 9, TUNDRA: 10, SNOW: 11,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];
export const BIOME_NAMES = ['ocean', 'lake', 'river', 'ice', 'coast', 'plains', 'forest', 'desert', 'swamp', 'mountain', 'tundra', 'snow'];
export const isWaterBiome = (b: number): boolean => b <= Biome.ICE;

export interface GameMap {
  seed: string;
  size: MapSize;
  w: number;
  h: number;
  /** Terrace level per tile. 0 = ocean surface; land 1..heightLevels; lakes/rivers store their surface level. */
  height: Uint8Array;
  biome: Uint8Array;
  /** 0 (coldest) .. 255 (hottest) */
  temp: Uint8Array;
  /** 0 (dry) .. 255 (wet) */
  moisture: Uint8Array;
  /** Tile index of each candidate start position, length = maxPlayers for this size. */
  starts: Int32Array;
  riverCount: number;
  lakeCount: number;
  /** Land tiles incl. rivers. */
  landTiles: number;
  /** Continent index per tile (0 = largest), 255 = water or minor island. */
  continent: Uint8Array;
  /** Tile count of each continent, largest first. */
  continentSizes: number[];
  hash: number;
}

const NB4X = [1, -1, 0, 0];
const NB4Y = [0, 0, 1, -1];

/** Multi-source BFS distance (4-neighbour). Sources get 0; tiles not passable stay 0xffff. */
function bfsDistance(w: number, h: number, isSource: Uint8Array, passable: Uint8Array): Uint16Array {
  const n = w * h;
  const dist = new Uint16Array(n).fill(0xffff);
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (isSource[i]) { dist[i] = 0; q[tail++] = i; }
  while (head < tail) {
    const i = q[head++], x = i % w, y = (i - x) / w, d = dist[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + NB4X[k], ny = y + NB4Y[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (dist[j] !== 0xffff || !passable[j]) continue;
      dist[j] = d; q[tail++] = j;
    }
  }
  return dist;
}

/** Label 4-connected components of tiles where mask=1. Returns labels (0 = none) and sizes (index = label). */
function components(w: number, h: number, mask: Uint8Array): { label: Int32Array; sizes: number[] } {
  const n = w * h, label = new Int32Array(n), sizes = [0], q = new Int32Array(n);
  let next = 1;
  for (let s = 0; s < n; s++) {
    if (!mask[s] || label[s]) continue;
    let head = 0, tail = 0, count = 0;
    q[tail++] = s; label[s] = next;
    while (head < tail) {
      const i = q[head++], x = i % w, y = (i - x) / w;
      count++;
      for (let k = 0; k < 4; k++) {
        const nx = x + NB4X[k], ny = y + NB4Y[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !label[j]) { label[j] = next; q[tail++] = j; }
      }
    }
    sizes.push(count); next++;
  }
  return { label, sizes };
}

/** Value at a quantile p∈[0,1) of the given values (deterministic numeric sort). */
function quantile(values: Int32Array, p: number): number {
  const s = values.slice().sort();
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

export function generateMap(seed: string, size: MapSize): GameMap {
  const cfg = TUNING.map;
  const sz = cfg.sizes[size];
  const W = sz.tiles, H = sz.tiles, N = W * H;
  const rng = Rng.stream(seed, 'mapgen');
  const sElev = rng.nextU32() | 0, sWarpX = rng.nextU32() | 0, sWarpY = rng.nextU32() | 0;
  const sMoist = rng.nextU32() | 0, sTemp = rng.nextU32() | 0;
  const coldNorth = rng.int(2) === 0;

  // ---- 1. Elevation: several continents. Each tile belongs to its nearest continent centre
  //         (warped Voronoi); elevation = fractal noise minus that continent's elliptical falloff,
  //         and a forced ocean channel runs along every border between two continents. ----
  const K = sz.continents;
  const border = cfg.borderOcean;
  const inset = border + Math.floor(W * 0.14);
  const ccx: number[] = [], ccy: number[] = [], crx: number[] = [], cry: number[] = [];
  for (let k = 0; k < K; k++) {
    let bx = 0, by = 0, bestD = -1;
    for (let t = 0; t < (k === 0 ? 1 : 40); t++) {
      const x = rng.range(inset, W - 1 - inset), y = rng.range(inset, H - 1 - inset);
      let d = Number.MAX_SAFE_INTEGER;
      for (let j = 0; j < k; j++) d = Math.min(d, (x - ccx[j]) * (x - ccx[j]) + (y - ccy[j]) * (y - ccy[j]));
      if (d > bestD) { bestD = d; bx = x; by = y; }
    }
    ccx.push(bx); ccy.push(by);
    const base = Math.floor((W * 62) / (100 * isqrt(K * 100) / 10));
    crx.push(Math.max(8, Math.floor((base * rng.range(85, 115)) / 100)));
    cry.push(Math.max(8, Math.floor((base * rng.range(85, 115)) / 100)));
  }
  const baseCell = Math.max(8, Math.floor(W / (6 + K))), warpCell = Math.max(8, W >> 2), warpAmp = W >> 4;
  const channel = cfg.channelWidth;
  const elev = new Int32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x < border || y < border || x >= W - border || y >= H - border) { elev[i] = -1000000; continue; }
      const wx = x + (((valueNoise(sWarpX, x, y, warpCell) - 2048) * warpAmp) >> 11);
      const wy = y + (((valueNoise(sWarpY, x, y, warpCell) - 2048) * warpAmp) >> 11);
      // nearest and second-nearest continent centre (by warped position)
      let k1 = 0, d1 = Number.MAX_SAFE_INTEGER, d2nd = Number.MAX_SAFE_INTEGER;
      for (let k = 0; k < K; k++) {
        const d = (wx - ccx[k]) * (wx - ccx[k]) + (wy - ccy[k]) * (wy - ccy[k]);
        if (d < d1) { d2nd = d1; d1 = d; k1 = k; } else if (d < d2nd) d2nd = d;
      }
      const n = fbm(sElev, wx, wy, baseCell, 5);
      const dx = wx - ccx[k1], dy = wy - ccy[k1];
      const fall = Math.floor((dx * dx * 4096) / (crx[k1] * crx[k1])) + Math.floor((dy * dy * 4096) / (cry[k1] * cry[k1]));
      let e = n + (n >> 1) - fall;
      if (K > 1) {
        const gap = isqrt(d2nd) - isqrt(d1); // ≈ 2 × distance to the border between two continents
        if (gap < channel) e -= (channel - gap) * 3000; // ocean strip ≈ `channel` tiles wide
      }
      elev[i] = e;
    }
  }

  // ---- 2. Sea level by land-fraction quantile; drop tiny islands ----
  const seaLevel = quantile(elev, 1 - cfg.landFraction);
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = elev[i] > seaLevel ? 1 : 0;
  {
    const { label, sizes } = components(W, H, land);
    let main = 1;
    for (let l = 1; l < sizes.length; l++) if (sizes[l] > sizes[main]) main = l;
    const keep = Math.max(cfg.minIslandTiles, Math.floor(sizes[main] * cfg.islandKeepFractionOfMain));
    for (let i = 0; i < N; i++) if (land[i] && sizes[label[i]] < keep) land[i] = 0;
  }

  // ---- 3. Water bodies: border-connected = ocean, enclosed ≥4 tiles = lake, smaller = filled ----
  const biome = new Uint8Array(N);
  {
    const water = new Uint8Array(N);
    for (let i = 0; i < N; i++) water[i] = land[i] ? 0 : 1;
    const { label, sizes } = components(W, H, water);
    const oceanLabel = label[0];
    for (let i = 0; i < N; i++) {
      if (land[i]) continue;
      if (label[i] === oceanLabel) biome[i] = Biome.OCEAN;
      else if (sizes[label[i]] >= 4) biome[i] = Biome.LAKE;
      else { land[i] = 1; elev[i] = seaLevel + 1; }
    }
  }

  // ---- 4. Terrace levels from land-elevation quantiles, capped by distance to ocean ----
  const isOcean = new Uint8Array(N), notOcean = new Uint8Array(N);
  for (let i = 0; i < N; i++) { isOcean[i] = biome[i] === Biome.OCEAN && !land[i] ? 1 : 0; notOcean[i] = isOcean[i] ? 0 : 1; }
  const distOcean = bfsDistance(W, H, isOcean, notOcean);
  let landCount = 0;
  for (let i = 0; i < N; i++) if (land[i]) landCount++;
  const landElev = new Int32Array(landCount);
  for (let i = 0, k = 0; i < N; i++) if (land[i]) landElev[k++] = elev[i];
  const L = cfg.heightLevels;
  const mountainCut = quantile(landElev, cfg.mountainPercentile);
  const peakCut = quantile(landElev, cfg.mountainPercentile + (1 - cfg.mountainPercentile) / 2);
  const lowCuts: number[] = [];
  for (let k = 1; k < L - 2; k++) lowCuts.push(quantile(landElev, (cfg.mountainPercentile * k) / (L - 2)));
  const height = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const e = elev[i];
    let lv: number;
    if (e >= peakCut) lv = L;
    else if (e >= mountainCut) lv = L - 1;
    else { lv = 1; for (const c of lowCuts) if (e >= c) lv++; }
    height[i] = Math.min(lv, Math.max(1, distOcean[i]));
  }
  const mountainLevel = L - 1;
  const snowPeakCut = quantile(landElev, cfg.snowPeakPercentile);

  // ---- 5. Extra lakes (guarantee the configured count) ----
  {
    const lakeMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) lakeMask[i] = biome[i] === Biome.LAKE ? 1 : 0;
    let lakes = components(W, H, lakeMask).sizes.length - 1;
    for (let attempt = 0; attempt < 400 && lakes < sz.lakes; attempt++) {
      const c = rng.int(N), x0 = c % W, y0 = (c - x0) / W;
      if (!land[c] || distOcean[c] < 6 || height[c] >= mountainLevel) continue;
      const r = 2 + rng.int(3);
      let ok = true;
      for (let dy = -r - 2; dy <= r + 2 && ok; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        const j = (y0 + dy) * W + (x0 + dx);
        if (!land[j]) { ok = false; break; }
      }
      if (!ok) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + (hashBit(c, dx, dy) ? r : 0)) continue;
        const j = (y0 + dy) * W + (x0 + dx);
        land[j] = 0; biome[j] = Biome.LAKE;
      }
      lakes++;
    }
  }
  // Lake surface level = lowest neighbouring land level.
  for (let i = 0; i < N; i++) {
    if (biome[i] !== Biome.LAKE || land[i]) continue;
    const x = i % W, y = (i - x) / W;
    let lv = L;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (land[j] && height[j] < lv) lv = height[j];
    }
    height[i] = Math.max(1, lv);
  }
  for (let i = 0; i < N; i++) if (biome[i] === Biome.LAKE && !land[i]) for (let k = 0; k < 4; k++) {
    // Lower lake shores to the lake level so lakes sit in basins.
    const x = i % W, y = (i - x) / W, nx = x + NB4X[k], ny = y + NB4Y[k];
    const j = ny * W + nx;
    if (land[j] && height[j] > height[i] + 1) height[j] = height[i] + 1;
  }

  // ---- 6. Rivers: steepest descent from highland sources until reaching water ----
  let riverCount = 0;
  {
    const visited = new Uint8Array(N);
    const sources: number[] = [];
    const minSep = Math.floor(W / 7);
    for (let attempt = 0; attempt < 600 && riverCount < sz.rivers; attempt++) {
      const s = rng.int(N);
      if (!land[s] || height[s] < 4 || biome[s] === Biome.RIVER) continue;
      const sx = s % W, sy = (s - sx) / W;
      let far = true;
      for (const o of sources) {
        const ox = o % W, oy = (o - ox) / W;
        if ((ox - sx) * (ox - sx) + (oy - sy) * (oy - sy) < minSep * minSep) { far = false; break; }
      }
      if (!far) continue;
      const path: number[] = [];
      let cur = s, reached = false;
      visited.fill(0);
      while (path.length < W * 3) {
        path.push(cur); visited[cur] = 1;
        const x = cur % W, y = (cur - x) / W;
        let best = -1, bestE = 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + NB4X[k], ny = y + NB4Y[k];
          const j = ny * W + nx;
          if (!land[j] || biome[j] === Biome.RIVER) { reached = true; break; }
          if (visited[j]) continue;
          if (best < 0 || elev[j] < bestE) { best = j; bestE = elev[j]; }
        }
        if (reached || best < 0) break;
        cur = best;
      }
      if (!reached || path.length < 6) continue;
      sources.push(s);
      let lv = height[path[0]];
      for (const t of path) {
        lv = Math.min(lv, height[t]);
        height[t] = lv;
        land[t] = 0;
        biome[t] = Biome.RIVER;
      }
      riverCount++;
    }
  }

  // ---- 7. Moisture and temperature ----
  const isWater = new Uint8Array(N), all = new Uint8Array(N).fill(1);
  for (let i = 0; i < N; i++) isWater[i] = land[i] ? 0 : 1;
  const distWater = bfsDistance(W, H, isWater, all);
  const isLand = new Uint8Array(N);
  for (let i = 0; i < N; i++) isLand[i] = land[i];
  const distLand = bfsDistance(W, H, isLand, all);
  const moist = new Int32Array(N), temp = new Int32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = coldNorth ? y : H - 1 - y;
    const latT = Math.floor((lat * 4095) / (H - 1));
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const near = distWater[i] < 7 ? (7 - distWater[i]) * 220 : 0;
      moist[i] = Math.min(4095, fbm(sMoist, x, y, baseCell, 4) + near);
      const lvPenalty = land[i] ? (height[i] - 1) * 200 : 0;
      temp[i] = Math.max(0, Math.min(4095, latT + ((fbm(sTemp, x, y, baseCell, 3) - 2048) >> 1) - lvPenalty));
    }
  }

  // ---- 8. Biomes (percentile thresholds guarantee every biome on every seed) ----
  const landTemp = new Int32Array(landCountOf(land)), landMoist = new Int32Array(landTemp.length);
  for (let i = 0, k = 0; i < N; i++) if (land[i]) { landTemp[k] = temp[i]; landMoist[k] = moist[i]; k++; }
  const cold = quantile(landTemp, cfg.coldPercentile), hot = quantile(landTemp, cfg.hotPercentile);
  const swampM = quantile(landMoist, cfg.swampMoisturePercentile);
  const forestM = quantile(landMoist, cfg.forestMoisturePercentile);
  const desertMaxM = quantile(landMoist, cfg.desertMaxMoisturePercentile);
  for (let i = 0; i < N; i++) {
    if (land[i]) {
      const t = temp[i], m = moist[i], lv = height[i];
      let b: number;
      if (lv >= mountainLevel) b = t <= cold || elev[i] >= snowPeakCut ? Biome.SNOW : Biome.MOUNTAIN; // cold mountains and the highest summits are snow
      else if (t <= cold) b = Biome.TUNDRA;
      else if (distOcean[i] === 1 && lv === 1) b = Biome.COAST;
      else if (t >= hot && m < desertMaxM) b = Biome.DESERT;
      else if (m >= swampM && lv <= 3) b = Biome.SWAMP;
      else if (m >= forestM) b = Biome.FOREST;
      else b = Biome.PLAINS;
      biome[i] = b;
    } else if (biome[i] === Biome.OCEAN && temp[i] <= cold && distLand[i] <= cfg.seaIceRange) {
      biome[i] = Biome.ICE;
    }
  }

  // ---- 9. Continents = land masses (land + rivers) holding ≥ continentMinShareOfLand of all land ----
  const landOrRiver = new Uint8Array(N);
  for (let i = 0; i < N; i++) landOrRiver[i] = land[i] || biome[i] === Biome.RIVER ? 1 : 0;
  const { label: landLabel, sizes: landSizes } = components(W, H, landOrRiver);
  const totalLand = landCountOf(landOrRiver);
  const contLabels: number[] = [];
  for (let l = 1; l < landSizes.length; l++) if (landSizes[l] >= totalLand * cfg.continentMinShareOfLand) contLabels.push(l);
  if (contLabels.length === 0) { let m = 1; for (let l = 1; l < landSizes.length; l++) if (landSizes[l] > landSizes[m]) m = l; contLabels.push(m); }
  contLabels.sort((a, b) => landSizes[b] - landSizes[a] || a - b);
  const continent = new Uint8Array(N).fill(255);
  const labelToCont = new Map<number, number>();
  contLabels.forEach((l, k) => labelToCont.set(l, k));
  for (let i = 0; i < N; i++) { const c = labelToCont.get(landLabel[i]); if (c !== undefined) continent[i] = c; }

  // ---- 10. Start positions: players spread round-robin over continents (largest first),
  //          farthest-point sampling inside each continent ----
  const nc = contLabels.length;
  const candByCont: number[][] = Array.from({ length: nc }, () => []);
  for (let i = 0; i < N; i++) {
    const c = continent[i], b = biome[i];
    if (c !== 255 && (b === Biome.PLAINS || b === Biome.FOREST) && height[i] <= 3 && distOcean[i] >= cfg.startMinCoastDistance) candByCont[c].push(i);
  }
  for (let c = 0; c < nc; c++) if (candByCont[c].length === 0) for (let i = 0; i < N; i++) if (continent[i] === c && land[i]) candByCont[c].push(i);
  const starts = new Int32Array(sz.maxPlayers);
  const chosen: number[] = [];
  for (let p = 0; p < sz.maxPlayers; p++) {
    const cand = candByCont[p % nc];
    let pick = 0;
    if (chosen.length === 0) pick = rng.int(cand.length);
    else {
      let best = -1;
      for (let c = 0; c < cand.length; c++) {
        const x = cand[c] % W, y = (cand[c] - x) / W;
        let md = Number.MAX_SAFE_INTEGER;
        for (const s of chosen) { const sx = s % W, sy = (s - sx) / W; md = Math.min(md, (x - sx) * (x - sx) + (y - sy) * (y - sy)); }
        if (md > best) { best = md; pick = c; }
      }
    }
    starts[p] = cand[pick];
    chosen.push(cand[pick]);
  }

  // ---- Pack outputs ----
  const temp8 = new Uint8Array(N), moist8 = new Uint8Array(N);
  for (let i = 0; i < N; i++) { temp8[i] = temp[i] >> 4; moist8[i] = moist[i] >> 4; }
  const lakeMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) lakeMask[i] = biome[i] === Biome.LAKE ? 1 : 0;
  const lakeCount = components(W, H, lakeMask).sizes.length - 1;
  const map: GameMap = {
    seed, size, w: W, h: H, height, biome, temp: temp8, moisture: moist8, starts,
    riverCount, lakeCount, landTiles: totalLand, continent, continentSizes: contLabels.map((l) => landSizes[l]), hash: 0,
  };
  map.hash = hashMap(map);
  return map;
}

function landCountOf(land: Uint8Array): number { let c = 0; for (let i = 0; i < land.length; i++) c += land[i]; return c; }
function hashBit(c: number, dx: number, dy: number): boolean { return ((c * 31 + dx * 7 + dy * 13) & 4) !== 0; }

export function hashMap(m: Pick<GameMap, 'height' | 'biome' | 'temp' | 'moisture' | 'starts'>): number {
  return hashArrays(m.height, m.biome, m.temp, m.moisture, m.starts);
}

export const tileWalkable = (m: GameMap, i: number): boolean => !isWaterBiome(m.biome[i]);
