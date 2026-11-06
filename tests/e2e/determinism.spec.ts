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
