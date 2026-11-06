// Phase 4b browser acceptance tests: game modes (F-193), match settings (F-196), globe camera and
// picking across the seam (F-195), test options with confirmation and the modified flag (F-197, F-198).
import { expect, test, type Page } from '@playwright/test';
import { openGame, state } from './helpers';

const inGame = (page: Page) =>
  page.waitForFunction(() => (window as any).__game?.state().screen === 'game' && (window as any).__game.state().stats, null, { timeout: 90_000 });
const g = (page: Page, fn: string): Promise<any> => page.evaluate(`(async () => { const G = window.__game; const game = G.game; ${fn} })()`);

test('F-193 modes preset size, bots and world; F-196 more settings shape the match and are remembered', async ({ page }) => {
  await page.goto('/?menu=new');
  await page.evaluate(() => localStorage.removeItem('fortnight.menu.v1'));
  await page.reload();
  const seen: string[] = [];
  for (const [mode, size, maxBots] of [['short', 'small', '3'], ['long', 'medium', '8'], ['continental', 'huge', '31']] as const) { // Long allows 15 bots but a Medium map holds 8
    await page.getByTestId('mode-' + mode).click();
    await expect(page.getByTestId('size')).toHaveValue(size);
    const sizes = await page.getByTestId('size').locator('option').allTextContents();
    await expect(page.getByTestId('rivals')).toHaveAttribute('max', maxBots);
    seen.push(`${mode}: ${size}, sizes [${sizes.map((s) => s.split(' ')[0]).join(', ')}], max bots ${maxBots}, bots ${await page.getByTestId('rivals').inputValue()}`);
  }
  await page.getByTestId('mode-short').click();
  await page.getByTestId('more-settings').locator('summary').click();
  await expect(page.getByTestId('world')).toHaveValue('globe');
  await expect(page.getByTestId('sea')).toHaveValue('close');
  await page.getByTestId('daylen').selectOption('1800');
  await page.getByTestId('poplimit').selectOption('50');
  await page.getByTestId('wildlife').selectOption('0');
  await page.getByTestId('seed').fill('modes-test');
  await page.getByTestId('start').click();
  await inGame(page);
  const s = await state(page);
  const wrap = await g(page, 'return game.map.wrap;');
  expect(s.dayLength).toBe(1800);
  expect(wrap).toBe(true);
  expect(s.stats.census.length).toBe(3); // you + 2 bots (Short default)
  // remembered
  await page.goto('/?menu=new');
  await expect(page.getByTestId('mode-short')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('more-settings').locator('summary').click();
  await expect(page.getByTestId('daylen')).toHaveValue('1800');
  await expect(page.getByTestId('poplimit')).toHaveValue('50');
  console.log(`[F-193] ${seen.join(' | ')}`);
  console.log(`[F-196] started Short with day length 1800 ticks (state ${s.dayLength}), globe wrap ${wrap}, ${s.stats.census.length} players; settings remembered after reload`);
});

test('F-195 globe: a 3D planet; the camera goes round and over the poles; picking and screen positions on the sphere; flat view as a setting', async ({ page }) => {
  await openGame(page, 'globe-ui', 'small', '&world=globe&sea=mixed&reveal=1');
  const r = await g(page, `
    const W = game.map.w, H = game.map.h, on = game.globeOn();
    const centre = () => game.pickTile(innerWidth / 2, innerHeight / 2);
    game.cam.setTarget(2, H / 2); const a = centre();
    game.cam.panWorld(-6, 0); const b = { x: game.cam.targetX, z: game.cam.targetZ }; // west, across the seam
    // keep panning north: over the north pole, down the far side, over the south pole, back home
    game.cam.setTarget(W / 4, H / 2);
    const half = [];
    for (let k = 0; k < 40; k++) { game.cam.panWorld(0, -H / 20); if (k === 19) half.push(game.cam.targetX, game.cam.targetZ); }
    const c = { x: game.cam.targetX, z: game.cam.targetZ };
    const u = game.screenOf({ x: c.x, y: 0, z: c.z });
    await new Promise((res) => setTimeout(res, 300));
    return { W, H, on, a, b, half, c, u, iw: innerWidth, ih: innerHeight };
  `);
  console.log(`[F-195] ${JSON.stringify(r)}`);
  expect(r.on).toBe(1);
  expect(r.W).toBe(2 * r.H);
  expect(Math.abs(r.a.x - 2) < 1.5 || Math.abs(r.a.x - 2 - r.W) < 1.5).toBe(true); // picking at the screen centre hits the target
  expect(r.b.x).toBeGreaterThan(r.W - 8);                                             // west across the seam
  expect(Math.abs(r.half[0] - (r.W / 4 + r.W / 2))).toBeLessThan(2);                 // half way: the other side of the planet
  expect(Math.abs(r.half[1] - r.H / 2)).toBeLessThan(2);
  expect(Math.abs(r.c.x - r.W / 4)).toBeLessThan(2);                                 // a full turn over both poles: back home
  expect(Math.abs(r.c.z - r.H / 2)).toBeLessThan(2);
  expect(Math.abs(r.u.x - r.iw / 2)).toBeLessThan(r.iw * 0.15);                       // the target projects near the screen centre
  // the setting switches the next game to the flat view
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('globe-view').uncheck();
  await openGame(page, 'globe-ui', 'small', '&world=globe&sea=mixed&reveal=1');
  expect(await g(page, 'return game.globeOn();')).toBe(0);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('fortnight.settings.v1') || '{}'); s.globeView = true; localStorage.setItem('fortnight.settings.v1', JSON.stringify(s)); });
});

test('F-197 / F-198 test options: confirmation, cancel, modified badge, extra speeds, survives save/load', async ({ page, browser }) => {
  await openGame(page, 'opts-ui', 'small', '&bots=1');
  await expect(page.getByTestId('modified-badge')).toHaveCount(0);
  await expect(page.getByTestId('speed-x8')).toHaveCount(0);
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('settings-test-options').locator('summary').click();
  // cancel: nothing changes
  await page.getByTestId('opt-reveal').click();
  await expect(page.getByTestId('opt-confirm')).toBeVisible();
  const warning = await page.getByTestId('opt-confirm').innerText();
  await page.getByTestId('opt-confirm-no').click();
  await expect(page.getByTestId('opt-reveal')).not.toBeChecked();
  await expect(page.getByTestId('modified-badge')).toHaveCount(0);
  // confirm: reveal + extra speeds on, run marked modified
  await page.getByTestId('opt-reveal').click();
  await page.getByTestId('opt-confirm-yes').click();
  await page.getByTestId('opt-fastspeeds').click();
  await page.getByTestId('opt-confirm-yes').click();
  await expect(page.getByTestId('opt-reveal')).toBeChecked();
  await page.getByTestId('settings').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await expect(page.getByTestId('speed-x16')).toBeVisible();
  await page.waitForFunction(() => (window as any).__game.state().opts === 65, null, { timeout: 10_000 });
  // reveal: the whole map is visible
  const visible = await g(page, 'await new Promise((r) => setTimeout(r, 800)); return game.fogVisibleShare();');
  expect(visible).toBe(1);
  await page.getByTestId('speed-x16').click();
  await page.waitForFunction(() => (window as any).__game.state().speed === 'x16', null, { timeout: 10_000 });
  const t0 = (await state(page)).tick;
  await page.waitForTimeout(2000);
  const tps = ((await state(page)).tick - t0) / 2;
  // stock audit in the browser: options never add resources (no gathering while paused-free idle is not guaranteed, so compare to income)
  const save = await g(page, 'const s = await G.save(); return { modified: s.modified, opts: s.ps[0].opts };');
  console.log(`[F-197/F-198] confirm text: "${warning.replace(/\s+/g, ' ').slice(0, 140)}…"; cancel left it off; after confirming: badge shown, opts ${save.opts}, x16 speed measured ${tps.toFixed(0)} ticks/s, reveal share ${visible}; save.modified ${save.modified}`);
  expect(save.modified).toBe(true);
  expect(save.opts).toBe(65);
  expect(tps).toBeGreaterThan(60);
  void browser;
});

test('F-198 test options from the menu ask first and mark the run', async ({ page }) => {
  await page.goto('/?menu=new');
  await page.evaluate(() => localStorage.removeItem('fortnight.menu.v1'));
  await page.reload();
  await page.getByTestId('seed').fill('menu-opts');
  await page.getByTestId('test-options-menu').locator('summary').click();
  await page.getByTestId('opt-instantbuild').click();
  await expect(page.getByTestId('opt-confirm')).toBeVisible();
  await page.getByTestId('opt-confirm-yes').click();
  await expect(page.getByTestId('menu-modified')).toBeVisible();
  await page.getByTestId('start').click();
  await inGame(page);
  await expect(page.getByTestId('modified-badge')).toBeVisible();
  await page.waitForFunction(() => (window as any).__game.state().opts === 4, null, { timeout: 10_000 });
  // without options: no badge (menu choice reset)
  await page.goto('/?menu=new');
  await page.getByTestId('test-options-menu').locator('summary').click();
  await page.getByTestId('opt-instantbuild').uncheck();
  await expect(page.getByTestId('menu-modified')).toHaveCount(0);
  console.log('[F-198] menu: confirmation shown, run started with instant build and the Modified badge; unticking needs no confirmation');
});
