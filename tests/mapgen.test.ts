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
    it(`50 seeds on ${size}: all biomes, several separated continents, players spread, ocean border`, () => {
      const failures: string[] = [];
      const target = TUNING.map.sizes[size].continents;
      const need = Math.max(2, target - 1);
      const hist: Record<number, number> = {};
      for (let s = 0; s < 50; s++) {
        const seed = `content-${size}-${s}`;
        const m = generateMap(seed, size);
        const c = biomeCounts(m);
        for (const [b, min] of Object.entries(MIN_TILES)) if (c[b] < min) failures.push(`${seed}: ${b}=${c[b]} < ${min}`);
        const nc = m.continentSizes.length;
        hist[nc] = (hist[nc] ?? 0) + 1;
        if (nc < need) failures.push(`${seed}: only ${nc} continents (need ≥ ${need})`);
        // Separation: no land/river tile of one continent touches a tile of another (4-neighbour).
        for (let i = 0; i < m.continent.length; i++) {
          const a = m.continent[i];
          if (a === 255) continue;
          const x = i % m.w;
          for (const j of [x + 1 < m.w ? i + 1 : -1, i + m.w < m.continent.length ? i + m.w : -1]) {
            if (j >= 0 && m.continent[j] !== 255 && m.continent[j] !== a) { failures.push(`${seed}: continents ${a} and ${m.continent[j]} touch at ${i}`); break; }
          }
        }
        // Players spread: the first min(players, continents) starts are on distinct continents.
        const firstN = Math.min(nc, m.starts.length);
        const onCont = new Set(Array.from(m.starts.slice(0, firstN), (t) => m.continent[t]));
        if (onCont.size !== firstN || onCont.has(255)) failures.push(`${seed}: starts not spread across continents`);
        const W = m.w, bo = TUNING.map.borderOcean;
        for (let i = 0; i < W; i++) for (const j of [i, (W - 1) * W + i, i * W, i * W + W - 1])
          if (m.biome[j] !== Biome.OCEAN && m.biome[j] !== Biome.ICE) { failures.push(`${seed}: border tile ${j} is ${BIOME_NAMES[m.biome[j]]}`); break; }
        expect(bo).toBeGreaterThan(0);
        if (m.lakeCount < 1) failures.push(`${seed}: no lakes`);
        if (m.riverCount < 1) failures.push(`${seed}: no rivers`);
      }
      console.log(`[${size}] target ${target} continents; continent-count histogram over 50 seeds: ${JSON.stringify(hist)}`);
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
