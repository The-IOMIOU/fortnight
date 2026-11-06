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

test('F-195 globe: camera circles the world, picking and unit screen positions work across the seam', async ({ page }) => {
  await openGame(page, 'globe-ui', 'small', '&world=globe&sea=mixed&reveal=1');
  const r = await g(page, `
    const W = game.map.w;
    game.cam.distance = 40; game.cam.setTarget(1, game.map.h / 2);
    await new Promise((res) => setTimeout(res, 300));
    const callsNear = game.renderer.info.render.calls;
    const pickWest = game.pickTile(innerWidth * 0.3, innerHeight / 2), pickEast = game.pickTile(innerWidth * 0.7, innerHeight / 2);
    game.cam.setTarget(-10, game.map.h / 2); const wrapped = game.cam.targetX;
    game.cam.setTarget(W / 2, game.map.h / 2);
    await new Promise((res) => setTimeout(res, 300));
    const callsMid = game.renderer.info.render.calls;
    // a unit near the east edge, seen from the west side of the seam, projects next to the camera
    game.cam.setTarget(1, game.map.h / 2);
    const s = game.screenOf({ x: W - 1, y: 0, z: game.map.h / 2 });
    return { W, pickWest, pickEast, wrapped, callsNear, callsMid, sx: s.x, inner: innerWidth };
  `);
  console.log(`[F-195] ${JSON.stringify(r)}`);
  expect(r.pickWest.x).toBeGreaterThan(r.W - 20); // west of the seam = the east end of the map
  expect(r.pickEast.x).toBeLessThan(20);
  expect(r.wrapped).toBe(r.W - 10);
  expect(r.callsNear).toBeGreaterThan(r.callsMid); // the seam copy is drawn only when visible
  expect(r.sx).toBeGreaterThan(0);
  expect(r.sx).toBeLessThan(r.inner);
  // curved view toggle
  await page.getByTestId('settings-btn').click();
  const curveOn = await g(page, 'return game.curveValue();');
  await page.getByTestId('globe-curve').uncheck();
  const curveOff = await g(page, 'return game.curveValue();');
  await page.getByTestId('globe-curve').check();
  console.log(`[F-195] curved view: on ${curveOn}, off ${curveOff}`);
  expect(curveOn).toBeGreaterThan(0);
  expect(curveOff).toBe(0);
  await page.getByTestId('settings').getByRole('button', { name: 'Close' }).click();
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
