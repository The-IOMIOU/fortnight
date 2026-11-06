// F-010 / F-021: the same deterministic code must give identical hashes in Node, Chromium and Firefox.
import { expect, test } from '@playwright/test';
import { scriptedRun } from '../../src/sim/scripted';
import { generateMap } from '../../src/sim/world/mapgen';
import { hex } from '../../src/sim/core/hash';
import { MAP_SIZES } from '../../src/sim/core/tuning';
import { openGame } from './helpers';

test('sim state hashes at ticks 100/1000/10000 match Node', async ({ page, browserName }) => {
  const node = scriptedRun('det-seed', 'small', 4, [100, 1000, 10000]);
  await openGame(page, 'det-check');
  const browser = await page.evaluate(() => (window as any).__game.scripted('det-seed', 'small', 4, [100, 1000, 10000]));
  console.log(`[F-010] ${browserName}:`, JSON.stringify(browser), 'node:', JSON.stringify(node));
  expect(browser).toEqual(node);
});

test('F-195 globe world: scripted match hashes and globe/sea map hashes match Node', async ({ page, browserName }) => {
  const world = { globe: true, sea: 'mixed' as const, continents: 3 };
  const node = scriptedRun('det-globe', 'small', 4, [100, 1000, 5000], undefined, world);
  await openGame(page, 'det-check');
  const browser = await page.evaluate((w) => (window as any).__game.scripted('det-globe', 'small', 4, [100, 1000, 5000], w), world);
  const maps: Record<string, string> = {};
  for (const size of MAP_SIZES) for (const sea of ['close', 'mixed', 'far'] as const) maps[`${size}/${sea}`] = hex(generateMap('globe-x', size, { globe: true, sea }).hash);
  const bmaps = await page.evaluate((sizes) => { const o: Record<string, string> = {}; for (const size of sizes) for (const sea of ['close', 'mixed', 'far']) o[`${size}/${sea}`] = (window as any).__game.mapHashOf('globe-x', size, { globe: true, sea }); return o; }, MAP_SIZES);
  console.log(`[F-195] ${browserName}: globe match ${JSON.stringify(browser)} node ${JSON.stringify(node)}; ${Object.keys(maps).length} globe maps, ${Object.keys(maps).filter((k) => maps[k] !== bmaps[k]).length} mismatches`);
  expect(browser).toEqual(node);
  expect(bmaps).toEqual(maps);
});

test('map hashes for 20 seeds × 4 sizes match Node', async ({ page, browserName }) => {
  await openGame(page, 'det-check');
  const seeds = Array.from({ length: 20 }, (_, i) => 'cross-' + i);
  const node: Record<string, string> = {};
  for (const size of MAP_SIZES) for (const s of seeds) node[`${size}/${s}`] = hex(generateMap(s, size).hash);
  const browser = await page.evaluate(({ seeds, sizes }) => {
    const out: Record<string, string> = {};
    for (const size of sizes) for (const s of seeds) out[`${size}/${s}`] = (window as any).__game.mapHashOf(s, size);
    return out;
  }, { seeds, sizes: MAP_SIZES });
  const mismatches = Object.keys(node).filter((k) => node[k] !== browser[k]);
  console.log(`[F-021] ${browserName}: ${Object.keys(node).length} maps compared, ${mismatches.length} mismatches`);
  expect(mismatches).toEqual([]);
});
