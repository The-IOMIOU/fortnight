import { expect, test, type Page } from '@playwright/test';
import { openGame, state } from './helpers';

const cam = (page: Page) => page.evaluate(() => { const c = (window as any).__game.game.cam; return { x: c.targetX, z: c.targetZ, d: c.distance }; });

test('F-022 menu defaults to Small; F-015 menu start and share link give the same map', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('size')).toHaveValue('small');
  await page.getByTestId('seed').fill('golden-fjord-404');
  await page.getByTestId('mode-custom').click(); // Short mode (the default) only offers Small
  await page.getByTestId('size').selectOption('medium');
  // the world shape (Phase 4b) is part of the map, so the link carries what the menu shows
  const world = await page.getByTestId('world').inputValue(), sea = await page.getByTestId('sea').inputValue(), continents = await page.getByTestId('continents').inputValue();
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  const a = await state(page);
  const link = await page.evaluate((w) => { const u = new URL(location.href); u.search = new URLSearchParams({ seed: 'golden-fjord-404', size: 'medium', ...w, play: '1' }).toString(); return u.toString(); }, { world, sea, continents });
  const page2 = await context.newPage();
  await page2.goto(link);
  await page2.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  const b = await state(page2);
  console.log(`[F-015] menu start map=${a.mapHash}, share link map=${b.mapHash}`);
  expect(b.mapHash).toBe(a.mapHash);
  expect(b.size).toBe('medium');
});

test('F-013 speed buttons: measured ticks/s within 5 % over 20 s; pause freezes the tick for 10 s', async ({ page }) => {
  await openGame(page, 'speed-test');
  const targets: [string, number][] = [['slow', 5], ['normal', 10], ['fast', 20], ['veryFast', 40]];
  const results: string[] = [];
  for (const [name, tps] of targets) {
    await page.getByTestId('speed-' + name).click();
    await page.waitForTimeout(500);
    const t0 = await page.evaluate(() => [(window as any).__game.state().tick, performance.now()]);
    await page.waitForTimeout(20_000);
    const t1 = await page.evaluate(() => [(window as any).__game.state().tick, performance.now()]);
    const measured = ((t1[0] - t0[0]) * 1000) / (t1[1] - t0[1]);
    results.push(`${name}: ${measured.toFixed(2)} ticks/s (target ${tps})`);
    expect(Math.abs(measured - tps)).toBeLessThan(tps * 0.05);
  }
  await page.getByTestId('pause').click();
  await page.waitForTimeout(300);
  const p0 = (await state(page)).tick;
  await page.waitForTimeout(10_000);
  const p1 = (await state(page)).tick;
  results.push(`paused: tick ${p0} → ${p1} over 10 s`);
  console.log('[F-013] ' + results.join(' | '));
  expect(p1).toBe(p0);
  await page.keyboard.press(' ');
  await page.waitForTimeout(1000);
  expect((await state(page)).tick).toBeGreaterThan(p1);
});

test('F-014 select scout and order a move while paused: queued, executes after unpause', async ({ page }) => {
  await openGame(page, 'pause-orders');
  await page.getByTestId('pause').click();
  await page.waitForTimeout(300);
  // Screen position of our scout.
  const pos = await page.evaluate(() => {
    const g = (window as any).__game.game;
    const u = g.units.visible.find((v: any) => v.owner === 0 && v.kind === 1);
    const THREE_V = g.cam.camera.position.clone();
    const v = THREE_V.set(u.x, u.y + 0.4, u.z).project(g.cam.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { sx: ((v.x + 1) / 2) * r.width + r.left, sy: ((1 - v.y) / 2) * r.height + r.top, id: u.id, x: u.x, z: u.z };
  });
  await page.mouse.click(pos.sx, pos.sy);
  expect((await state(page)).selected).toBe(1);
  const tick0 = (await state(page)).tick;
  await page.mouse.click(pos.sx + 120, pos.sy + 40, { button: 'right' });
  await page.waitForTimeout(500);
  let s = await state(page);
  expect(s.pendingOrders).toBe(1);
  await expect(page.locator('.paused-tag')).toContainText('1 order queued');
  await page.waitForTimeout(2000);
  s = await state(page);
  expect(s.tick).toBe(tick0);
  const before = await page.evaluate((id) => (window as any).__game.game.units.visible.find((v: any) => v.id === id), pos.id);
  expect(before.x).toBeCloseTo(pos.x, 5);
  await page.getByTestId('pause').click();
  await page.waitForTimeout(1500);
  s = await state(page);
  const after = await page.evaluate((id) => (window as any).__game.game.units.visible.find((v: any) => v.id === id), pos.id);
  console.log(`[F-014] paused at tick ${tick0}, order queued (pending=1), unpaused → tick ${s.tick}, scout moved (${pos.x.toFixed(2)},${pos.z.toFixed(2)}) → (${after.x.toFixed(2)},${after.z.toFixed(2)})`);
  expect(s.pendingOrders).toBe(0);
  expect(Math.hypot(after.x - pos.x, after.z - pos.z)).toBeGreaterThan(1);
});

test('F-025 camera: wheel zoom, WASD, middle-drag, edge scroll, bounds clamp', async ({ page }) => {
  await openGame(page, 'camera-test', 'medium');
  const canvas = page.locator('canvas.game-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const out: string[] = [];
  // Wheel
  await page.mouse.move(cx, cy);
  let c0 = await cam(page);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  let c1 = await cam(page);
  out.push(`wheel down: dist ${c0.d.toFixed(1)}→${c1.d.toFixed(1)}`);
  expect(c1.d).toBeGreaterThan(c0.d);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(200);
  expect((await cam(page)).d).toBeLessThan(c1.d);
  // Keyboard
  c0 = await cam(page);
  await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
  c1 = await cam(page);
  out.push(`W: z ${c0.z.toFixed(1)}→${c1.z.toFixed(1)}`);
  expect(c1.z).toBeLessThan(c0.z);
  c0 = c1;
  await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d');
  c1 = await cam(page);
  out.push(`D: x ${c0.x.toFixed(1)}→${c1.x.toFixed(1)}`);
  expect(c1.x).toBeGreaterThan(c0.x);
  // Middle drag: dragging right moves the view target left (ground follows the pointer).
  c0 = c1;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + 150, cy, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  c1 = await cam(page);
  out.push(`middle-drag right: x ${c0.x.toFixed(1)}→${c1.x.toFixed(1)}`);
  expect(c1.x).toBeLessThan(c0.x);
  // Edge scroll: pointer at the left edge pans left.
  c0 = c1;
  await page.mouse.move(box.x + 3, cy);
  await page.waitForTimeout(500);
  c1 = await cam(page);
  await page.mouse.move(cx, cy);
  out.push(`left edge: x ${c0.x.toFixed(1)}→${c1.x.toFixed(1)}`);
  expect(c1.x).toBeLessThan(c0.x);
  // Clamp
  const cl = await page.evaluate(() => { const g = (window as any).__game.game; g.cam.setTarget(-500, 99999); return { x: g.cam.targetX, z: g.cam.targetZ, w: g.map.w, h: g.map.h }; });
  out.push(`clamp: (-500,99999)→(${cl.x},${cl.z})`);
  expect(cl.x).toBe(0);
  expect(cl.z).toBe(cl.h);
  console.log('[F-025] ' + out.join(' | '));
});

test('F-027 minimap: click jumps camera; pixels match fog and ownership; F-026 snapshot has no fogged enemies', async ({ page }) => {
  await openGame(page, 'minimap-test', 'small');
  await page.waitForTimeout(800);
  const mm = (await page.locator('.minimap canvas').nth(1).boundingBox())!;
  await page.mouse.click(mm.x + mm.width * 0.5, mm.y + mm.height * 0.25);
  const c = await cam(page);
  const w = await page.evaluate(() => (window as any).__game.game.map.w);
  console.log(`[F-027] minimap click at (50%,25%) → camera target (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) on ${w}×${w} map`);
  expect(Math.abs(c.x - w * 0.5)).toBeLessThan(2);
  expect(Math.abs(c.z - w * 0.25)).toBeLessThan(2);
  const px = await page.evaluate(() => {
    const g = (window as any).__game.game;
    g.minimap.redraw();
    const start = g.map.starts[0];
    // A tile far from our start is unexplored at tick ~0.
    const far = g.map.starts[1] ?? 0;
    return { owned: g.minimap.pixel(start), far: g.minimap.pixel(far) };
  });
  console.log(`[F-027] owned start tile pixel=${px.owned}, far unexplored tile pixel=${px.far}`);
  expect(px.far).toEqual([8, 9, 12]);
  // Owned tile is tinted toward player 0 blue (0,114,178): blue channel dominates.
  expect(px.owned[2]).toBeGreaterThan(px.owned[0]);
  const owners = await page.evaluate(() => {
    const e = (window as any).__game.state && (window as any).__game.game.snapshot.ents as Int32Array;
    const set = new Set<number>(); for (let k = 0; k < e.length; k += 9) if (e[k + 1] < 64) set.add(e[k + 2]); return [...set];
  });
  console.log(`[F-026] owners present in viewer snapshot: ${JSON.stringify(owners)} (4 players on map)`);
  expect(owners).toEqual([0]);
});
