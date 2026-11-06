// F-028 (60 FPS on Small and Medium) and F-011 (render loop survives worker stalls).
// Headed Chromium on the real GPU. Numbers are machine-specific; they are printed for the ledger.
import { expect, test } from '@playwright/test';
import { openGame, state } from './helpers';

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

// F-080: frame rate with bots playing. Bots run in the sim worker; the game first runs at 4× for a
// few minutes so the bots have grown economies and armies, then the camera sweeps at 1×.
for (const [size, bots, minFps] of [['medium', 8, 60], ['huge', 31, 30]] as const) {
  test(`F-080 ${size} with ${bots} bots: avg ≥ ${minFps} FPS and the sim keeps up at 1×`, async ({ page }) => {
    test.setTimeout(900_000);
    await openGame(page, `perf-bots-${size}`, size, `&bots=${bots}&difficulty=hard&reveal=1`);
    await page.evaluate(() => (window as any).__game.setSpeed('veryFast'));
    const warm = size === 'huge' ? 3000 : 4800;
    await page.waitForFunction((t) => (window as any).__game.state().tick > t, warm, { timeout: 800_000, polling: 1000 });
    await page.evaluate(() => (window as any).__game.setSpeed('normal'));
    await page.waitForTimeout(3000);
    const t0 = (await state(page)).tick;
    const s: Sweep = await page.evaluate(() => (window as any).__game.sweep(30, 40));
    const st = await state(page);
    const tps = (st.tick - t0) / 30;
    console.log(`[F-080] ${size} + ${bots} bots at tick ${st.tick}: ${fmt(s)}; sim ${st.perf.simMs?.toFixed(2)} ms/tick, ${tps.toFixed(2)} ticks/s at 1× (target 10), ${st.perf.entities} entities`);
    expect(s.avgFps).toBeGreaterThanOrEqual(minFps - 1);
    expect(tps).toBeGreaterThanOrEqual(9.5);
  });
}
