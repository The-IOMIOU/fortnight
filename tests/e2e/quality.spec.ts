// F-179: graphics quality presets measurably change frame time. Runs headed Chromium with vsync and the
// frame-rate cap disabled so frame time reflects real GPU/CPU work (not the monitor's refresh rate).
import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

const sweep = async (page: import('@playwright/test').Page, quality: string): Promise<{ avgFps: number; p95Ms: number; tris: number }> => {
  await page.goto('/?menu=new');
  await page.evaluate((q) => localStorage.setItem('fortnight.settings.v1', JSON.stringify({ uiScale: 1, quality: q, volume: 0, muted: true })), quality);
  await openGame(page, 'quality-seed', 'huge', '&reveal=1');
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => (window as any).__game.sweep(15, 1e9));
  const tris = await page.evaluate(() => (window as any).__game.game.renderer.info.render.triangles);
  return { avgFps: s.avgFps, p95Ms: s.p95Ms, tris };
};

test('F-179 Low preset renders faster than High (Huge map, fully zoomed out, uncapped)', async ({ page }) => {
  const high = await sweep(page, 'high');
  const low = await sweep(page, 'low');
  console.log(`[F-179] uncapped, Huge zoomed out: High ${high.avgFps.toFixed(0)} FPS (p95 ${high.p95Ms.toFixed(2)} ms, ${(high.tris / 1e6).toFixed(2)}M tris) vs Low ${low.avgFps.toFixed(0)} FPS (p95 ${low.p95Ms.toFixed(2)} ms, ${(low.tris / 1e6).toFixed(2)}M tris)`);
  expect(low.avgFps).toBeGreaterThan(high.avgFps * 1.05);
});
