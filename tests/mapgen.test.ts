import { describe, expect, it } from 'vitest';
import { generateMap, BIOME_NAMES, Biome } from '../src/sim/world/mapgen';
import { MAP_SIZES, TUNING } from '../src/sim/core/tuning';

const MIN_TILES: Record<string, number> = { ocean: 100, lake: 4, river: 6, ice: 1, coast: 10, plains: 50, forest: 50, desert: 20, swamp: 10, mountain: 20, tundra: 20, snow: 1 };

function biomeCounts(m: ReturnType<typeof generateMap>): Record<string, number> {
  const c: Record<string, number> = {};
  for (const n of BIOME_NAMES) c[n] = 0;
  for (let i = 0; i < m.biome.length; i++) c[BIOME_NAMES[m.biome[i]]]++;
  return c;
}

describe('F-021 same seed → same map', () => {
  it('identical hash and arrays across two runs, 20 seeds × 4 sizes', () => {
    for (const size of MAP_SIZES) for (let s = 0; s < 20; s++) {
      const a = generateMap('seed-' + s, size), b = generateMap('seed-' + s, size);
      expect(a.hash).toBe(b.hash);
      expect(Buffer.from(a.biome).equals(Buffer.from(b.biome))).toBe(true);
      expect(Buffer.from(a.height).equals(Buffer.from(b.height))).toBe(true);
    }
  });
  it('different seeds give different maps', () => {
    const hashes = new Set<number>();
    for (let s = 0; s < 30; s++) hashes.add(generateMap('x' + s, 'small').hash);
    expect(hashes.size).toBe(30);
  });
});

describe('F-020 / F-030 continent content', () => {
  for (const size of MAP_SIZES) {
    it(`50 seeds on ${size}: all biomes, main continent ≥ 80 %, ocean border`, () => {
      const failures: string[] = [];
      let minMain = 1;
      for (let s = 0; s < 50; s++) {
        const seed = `content-${size}-${s}`;
        const m = generateMap(seed, size);
        const c = biomeCounts(m);
        for (const [b, min] of Object.entries(MIN_TILES)) if (c[b] < min) failures.push(`${seed}: ${b}=${c[b]} < ${min}`);
        const main = m.mainLandTiles / m.landTiles;
        minMain = Math.min(minMain, main);
        if (main < 0.8) failures.push(`${seed}: main continent ${(main * 100).toFixed(1)}%`);
        const W = m.w, bo = TUNING.map.borderOcean;
        for (let i = 0; i < W; i++) for (const j of [i, (W - 1) * W + i, i * W, i * W + W - 1])
          if (m.biome[j] !== Biome.OCEAN && m.biome[j] !== Biome.ICE) { failures.push(`${seed}: border tile ${j} is ${BIOME_NAMES[m.biome[j]]}`); break; }
        expect(bo).toBeGreaterThan(0);
        if (m.lakeCount < 1) failures.push(`${seed}: no lakes`);
        if (m.riverCount < 1) failures.push(`${seed}: no rivers`);
      }
      console.log(`[${size}] min main-continent share = ${(minMain * 100).toFixed(1)}%`);
      expect(failures).toEqual([]);
    });
  }
});

describe('F-022 generation time', () => {
  it('reports generation time per size; Small ≤ 1 s', () => {
    const out: string[] = [];
    for (const size of MAP_SIZES) {
      generateMap('warm', size);
      const t0 = performance.now();
      for (let k = 0; k < 3; k++) generateMap('timing-' + k, size);
      const ms = (performance.now() - t0) / 3;
      out.push(`${size}: ${ms.toFixed(0)} ms`);
      if (size === 'small') expect(ms).toBeLessThan(1000);
    }
    console.log('[mapgen time] ' + out.join(', '));
  });
});
