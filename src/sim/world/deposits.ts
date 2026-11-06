// Resource deposits (stone, gold, carbon, adamite clusters + wood on forest tiles) and wildlife spawn
// points. Separate RNG stream so map generation results are unchanged.

import { Rng } from '../core/prng';
import { TUNING } from '../core/tuning';
import { Biome, isWaterBiome, type GameMap } from './mapgen';
import { Res, RES_NONE } from '../defs';

export interface ResourceLayer { type: Uint8Array; amount: Int32Array }

const N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function nearMountain(m: GameMap, x: number, y: number): boolean {
  for (const [dx, dy] of N8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && m.biome[ny * m.w + nx] === Biome.MOUNTAIN) return true;
  }
  return false;
}

/** Can this tile host a deposit of the given resource? */
function suits(m: GameMap, i: number, res: number): boolean {
  const b = m.biome[i], x = i % m.w, y = (i - x) / m.w;
  if (isWaterBiome(b) || b === Biome.FOREST || b === Biome.SNOW && res !== Res.ADAMITE) return false;
  switch (res) {
    case Res.STONE: return m.height[i] >= 4 || nearMountain(m, x, y);
    case Res.GOLD: return (b === Biome.MOUNTAIN || b === Biome.DESERT || m.height[i] >= 4);
    case Res.CARBON: return b === Biome.SWAMP || b === Biome.TUNDRA || (b === Biome.PLAINS && m.height[i] >= 3);
    case Res.ADAMITE: return b === Biome.SNOW || b === Biome.TUNDRA || (b === Biome.MOUNTAIN && m.height[i] >= 6);
  }
  return false;
}

const DEPOSIT_KEYS: [number, 'stone' | 'gold' | 'carbon' | 'adamite'][] = [[Res.STONE, 'stone'], [Res.GOLD, 'gold'], [Res.CARBON, 'carbon'], [Res.ADAMITE, 'adamite']];

function growCluster(m: GameMap, layer: ResourceLayer, seed: number, res: number, tiles: number, amount: number): number {
  const q = [seed], placed: number[] = [];
  const seen = new Set<number>([seed]);
  while (q.length && placed.length < tiles) {
    const t = q.shift()!;
    if (layer.type[t] !== RES_NONE || !suits(m, t, res)) continue;
    layer.type[t] = res; layer.amount[t] = amount; placed.push(t);
    const x = t % m.w, y = (t - x) / m.w;
    for (const [dx, dy] of N8.slice(0, 4)) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (!seen.has(j)) { seen.add(j); q.push(j); }
    }
  }
  return placed.length;
}

export function placeResources(m: GameMap, players: number): ResourceLayer {
  const N = m.w * m.h, cfg = TUNING.deposits;
  const layer: ResourceLayer = { type: new Uint8Array(N).fill(RES_NONE), amount: new Int32Array(N) };
  for (let i = 0; i < N; i++) if (m.biome[i] === Biome.FOREST) { layer.type[i] = Res.WOOD; layer.amount[i] = cfg.woodPerForestTile; }
  const rng = Rng.stream(m.seed, 'deposits');
  let land = 0;
  for (let i = 0; i < N; i++) if (!isWaterBiome(m.biome[i])) land++;
  const startTiles = Array.from(m.starts.slice(0, players));
  const farFromStarts = (t: number, r: number): boolean => {
    const x = t % m.w, y = (t - x) / m.w;
    return startTiles.every((s) => { const sx = s % m.w, sy = (s - sx) / m.w; return (sx - x) * (sx - x) + (sy - y) * (sy - y) > r * r; });
  };
  for (const [res, key] of DEPOSIT_KEYS) {
    const d = cfg[key];
    const clusters = Math.max(1, Math.floor((land * d.clustersPer1000Land) / 1000));
    let made = 0;
    for (let attempt = 0; attempt < clusters * 60 && made < clusters; attempt++) {
      const t = rng.int(N);
      if (!suits(m, t, res) || layer.type[t] !== RES_NONE || !farFromStarts(t, 5)) continue;
      if (growCluster(m, layer, t, res, d.tiles, d.amount) > 0) made++;
    }
  }
  // Fairness: every start gets stone and gold within startGuaranteeRadius.
  const R = cfg.startGuaranteeRadius;
  for (const s of startTiles) {
    const sx = s % m.w, sy = (s - sx) / m.w;
    for (const [res, key] of [[Res.STONE, 'stone'], [Res.GOLD, 'gold']] as const) {
      let has = false;
      for (let dy = -R; dy <= R && !has; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x >= 0 && y >= 0 && x < m.w && y < m.h && layer.type[y * m.w + x] === res && dx * dx + dy * dy <= R * R) { has = true; break; }
      }
      if (has) continue;
      // nearest suitable tile at distance 5..R in deterministic ring order; relax biome rules if needed
      let placed = false;
      for (let r = 5; r <= R && !placed; r++) for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        const t = y * m.w + x, b = m.biome[t];
        if (layer.type[t] !== RES_NONE || isWaterBiome(b) || b === Biome.FOREST || b === Biome.SNOW) continue;
        const want = TUNING.deposits[key];
        let n = 0;
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const j = (y + oy) * m.w + (x + ox);
          if (x + ox < m.w && y + oy < m.h && layer.type[j] === RES_NONE && !isWaterBiome(m.biome[j]) && m.biome[j] !== Biome.FOREST && n < want.tiles) {
            layer.type[j] = res; layer.amount[j] = want.amount; n++;
          }
        }
        placed = n > 0;
        if (placed) break;
      }
    }
  }
  return layer;
}

/** Wildlife spawn tiles (plains/forest/tundra, away from starts). */
export function animalSpawns(m: GameMap, players: number, layer: ResourceLayer): number[] {
  const N = m.w * m.h, rng = Rng.stream(m.seed, 'animals-spawn');
  let land = 0;
  for (let i = 0; i < N; i++) if (!isWaterBiome(m.biome[i])) land++;
  const want = Math.floor(land / TUNING.animals.landTilesPerAnimal);
  const starts = Array.from(m.starts.slice(0, players));
  const out: number[] = [];
  for (let attempt = 0; attempt < want * 30 && out.length < want; attempt++) {
    const t = rng.int(N), b = m.biome[t];
    if (!(b === Biome.PLAINS || b === Biome.FOREST || b === Biome.TUNDRA) || layer.type[t] > Res.WOOD && layer.type[t] !== RES_NONE) continue;
    const x = t % m.w, y = (t - x) / m.w;
    if (starts.some((s) => { const sx = s % m.w, sy = (s - sx) / m.w; return (sx - x) * (sx - x) + (sy - y) * (sy - y) < 36; })) continue;
    out.push(t);
  }
  return out;
}
