// F-028 (60 FPS on Small and Medium) and F-011 (render loop survives worker stalls).
// Headed Chromium on the real GPU. Numbers are machine-specific; they are printed for the ledger.
import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

type Sweep = { frames: number; avgFps: number; p95Ms: number; p99Ms: number; worstMs: number };
const fmt = (s: Sweep): string => `avg ${s.avgFps.toFixed(1)} FPS, p95 ${s.p95Ms.toFixed(1)} ms, p99 ${s.p99Ms.toFixed(1)} ms, worst ${s.worstMs.toFixed(1)} ms, ${s.frames} frames`;

for (const size of ['small', 'medium', 'large', 'huge']) {
  test(`F-028 30 s camera sweep on ${size}`, async ({ page }) => {
    await openGame(page, 'perf-seed', size, '&reveal=1');
    await page.waitForTimeout(1000);
    const gpu = await page.evaluate(() => {
      const gl = document.querySelector('canvas')!.getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    const s: Sweep = await page.evaluate(() => (window as any).__game.sweep(30, 40));
    const zoomedOut: Sweep = await page.evaluate(() => (window as any).__game.sweep(10, 1e9));
    const tris = await page.evaluate(() => (window as any).__game.state().perf.triangles);
    console.log(`[F-028] ${size} (${gpu}): mid zoom ${fmt(s)} | fully zoomed out ${fmt(zoomedOut)} | terrain tris in view ${tris}`);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t: Sweep = await page.evaluate(() => (window as any).__game.sweep(15, 40));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`[F-028] ${size} with 4x CPU throttle: ${fmt(t)}`);
    if (size === 'small' || size === 'medium') {
      expect(s.avgFps).toBeGreaterThanOrEqual(59);
      expect(s.p95Ms).toBeLessThanOrEqual(20);
    }
  });
}

test('F-011 render loop keeps running while the sim worker is blocked', async ({ page }) => {
  await openGame(page, 'stall-seed', 'small');
  await page.waitForTimeout(1000);
  const r = await page.evaluate(async () => {
    const g = (window as any).__game;
    const t0 = g.state().tick;
    // Block the worker with back-to-back 200 ms busy-waits for ~4 s while the camera sweeps.
    const iv = setInterval(() => g.stall(200), 200);
    const s = await g.sweep(4, 40);
    clearInterval(iv);
    return { sweep: s, ticksDuring: g.state().tick - t0 };
  });
  console.log(`[F-011] during 4 s of worker stalls: ${fmt(r.sweep)}; sim advanced ${r.ticksDuring} ticks (worker starved)`);
  expect(r.sweep.avgFps).toBeGreaterThanOrEqual(55);
});
