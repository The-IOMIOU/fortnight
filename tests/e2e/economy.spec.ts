// Phase 2 browser acceptance tests: grow an economy through the real UI, then check the stats
// panel against the simulation; HUD, mouse/keyboard, save/load, offline play, UI scale, sound.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { openGame, state } from './helpers';

const g = (page: Page, fn: string): Promise<any> => page.evaluate(`(async () => { const G = window.__game; const game = G.game; ${fn} })()`);

/** Screen position of an entity (by id) on the canvas. */
const screenOf = (page: Page, id: number): Promise<{ x: number; y: number }> =>
  g(page, `const v = game.units.get(${id}); return game.screenOf(v, 0.4);`);

async function ownUnits(page: Page, kind: number): Promise<number[]> {
  return g(page, `return game.units.visible.filter(v => v.owner === 0 && v.kind === ${kind}).map(v => v.id);`);
}

test('F-059 / F-171 / F-172 / F-155: grow an economy through the UI; stats panel equals the sim', async ({ page }) => {
  await openGame(page, 'ui-economy', 'small', '&rivals=2');
  // record every notification that appears in the feed (F-155)
  await page.evaluate(() => {
    (window as any).__notes = [];
    new MutationObserver(() => document.querySelectorAll('.note').forEach((n) => { const t = n.textContent!; if (!(window as any).__notes.includes(t)) (window as any).__notes.push(t); }))
      .observe(document.body, { childList: true, subtree: true });
  });
  await g(page, `game.cam.distance = 22; game.cam.apply();`);
  await page.waitForTimeout(500);
  // Box-select the three workers (left-drag around them).
  const workers = await ownUnits(page, 2);
  expect(workers.length).toBe(3);
  const pts = await Promise.all(workers.map((id) => screenOf(page, id)));
  const pad = 25;
  const x0 = Math.min(...pts.map((p) => p.x)) - pad, y0 = Math.min(...pts.map((p) => p.y)) - pad;
  const x1 = Math.max(...pts.map((p) => p.x)) + pad, y1 = Math.max(...pts.map((p) => p.y)) + pad;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const sel = await state(page);
  console.log(`[F-172] box-select picked ${sel.selection.units.worker ?? 0} workers (+${sel.selection.units.scout ?? 0} scouts)`);
  expect(sel.selection.units.worker).toBe(3);
  await expect(page.getByTestId('buildmenu')).toBeVisible();
  // Build a house: click the build button, then a valid spot (found via the client's own preview check).
  await page.getByTestId('build-house').click();
  expect((await state(page)).placing).toBe('house');
  const spot = await g(page, `
    const w = game.map.w, cap = game.units.visible.find(v => v.owner === 0 && v.kind === 64);
    for (let r = 3; r < 9; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const ax = cap.anchorX + 1 + dx, az = cap.anchorZ + 1 + dz;
      if (game.placementValid('house', az * w + ax)) { const p = game.screenOf({ x: ax + 0.5, y: 0, z: az + 0.5 }, 0); const t = game.pickTile(p.x, p.y);
        if (t && Math.floor(t.x) === ax && Math.floor(t.z) === az) return p; }
    }
    return null;`);
  expect(spot).not.toBeNull();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await page.waitForTimeout(300);
  // Right-click a tree with... the house builders are busy; select the capital and train a worker via the panel.
  const cap = (await g(page, `return game.units.visible.find(v => v.owner === 0 && v.kind === 64).id;`)) as number;
  const cp = await screenOf(page, cap);
  await page.mouse.click(cp.x, cp.y);
  await expect(page.getByTestId('building-panel')).toBeVisible();
  await page.getByTestId('train-worker').click();
  await page.waitForTimeout(300);
  expect((await g(page, `return game.snapshot.buildings.find(b => b.id === ${cap}).queue.length;`))).toBe(1);
  // Speed up and let the economy run.
  await page.getByTestId('speed-veryFast').click();
  await page.waitForFunction(() => (window as any).__game.state().tick > 700, null, { timeout: 60_000 });
  // New worker → send it to chop wood with a right-click on a tree.
  const after = await ownUnits(page, 2);
  const fresh = after.filter((id) => !workers.includes(id));
  expect(fresh.length).toBeGreaterThanOrEqual(1);
  const fp = await screenOf(page, fresh[0]);
  await page.mouse.click(fp.x, fp.y);
  const tree = await g(page, `
    const w = game.map.w; const u = game.units.get(${fresh[0]});
    for (let r = 1; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(u.x) + dx, z = Math.floor(u.z) + dz, t = z * w + x;
      if (x < 0 || z < 0 || x >= w) continue;
      if (game.nature.resTypeAt(t) === 1) { const p = game.screenOf({ x: x + 0.5, y: 0.5, z: z + 0.5 }, 0); const k = game.pickTile(p.x, p.y);
        if (k && Math.floor(k.x) === x && Math.floor(k.z) === z) return p; }
    }
    return null;`);
  expect(tree).not.toBeNull();
  await page.mouse.click(tree.x, tree.y, { button: 'right' });
  await page.waitForTimeout(400);
  await page.waitForFunction(() => (window as any).__game.state().tick > 2400, null, { timeout: 90_000 });
  await page.getByTestId('pause').click();
  await page.waitForTimeout(400);
  // Open the stats panel and compare every number with the simulation's own dump at the same tick.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('stats-panel')).toBeVisible();
  await page.waitForTimeout(400);
  const dump = await g(page, `return await G.dump();`);
  const text = async (id: string): Promise<string> => (await page.getByTestId(id).textContent())!.trim();
  const pct = (pm: number): string => `${(pm / 10).toFixed(1)} %`;
  expect(await text('st-land')).toBe(`${dump.landOwned} / ${dump.landTotal} (${pct(dump.landPermille)})`);
  expect(await text('st-pop')).toBe(`${dump.pop} / ${dump.housing}`);
  expect(await text('st-food')).toBe(`+${dump.foodIncomePerMin} − ${dump.foodUpkeepPerMin} = ${dump.foodBalancePerMin >= 0 ? '+' : ''}${dump.foodBalancePerMin} /min${dump.starving ? ' (starving)' : ''}`);
  expect(await text('st-army')).toBe(String(dump.army));
  expect(await text('st-buildings')).toBe(String(dump.buildings));
  for (let i = 0; i < 6; i++) {
    expect(await text('st-stock-' + i)).toBe(String(dump.stock[i]));
    expect(await text('st-income-' + i)).toBe(String(dump.incomePerMin[i]));
    if (i > 0) expect(await text('st-found-' + i)).toBe(String(dump.depositsFound[i]));
  }
  for (const c of dump.continents) expect(await text('st-cont-' + c.index)).toBe(`${c.owned} / ${c.total}`);
  for (const c of dump.census) expect(await text('st-census-land-' + c.player)).toBe(pct(c.landPermille));
  console.log(`[F-059] tick ${dump.tick}: panel = sim for land ${dump.landOwned}/${dump.landTotal}, pop ${dump.pop}/${dump.housing}, food ${dump.foodBalancePerMin}/min, stock ${JSON.stringify(dump.stock)}, income ${JSON.stringify(dump.incomePerMin)}, deposits ${JSON.stringify(dump.depositsFound)}, buildings ${dump.buildings}, ${dump.census.length} census rows`);
  expect(dump.buildings).toBeGreaterThanOrEqual(2); // capital + house
  expect(dump.units.worker).toBeGreaterThanOrEqual(4);
  expect(dump.incomePerMin[1] + dump.stock[1]).toBeGreaterThan(0);
  // HUD panels present (F-171) and the feed showed events (F-155)
  for (const id of ['resbar', 'pop', 'pause', 'clock']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('feed')).toBeAttached();
  await expect(page.locator('.minimap')).toBeVisible();
  const notes: string[] = await page.evaluate(() => (window as any).__notes);
  console.log(`[F-155] notifications shown during the run: ${JSON.stringify(notes)}`);
  expect(notes).toContain('House complete');
  expect(notes).toContain('Worker ready');
});

test('F-173 hotkeys: build menu, control groups, training, speed', async ({ page }) => {
  await openGame(page, 'hotkeys', 'small');
  await page.waitForTimeout(500);
  const workers = await ownUnits(page, 2);
  await g(page, `${JSON.stringify(workers)}.forEach(id => game.units.selected.add(id));`);
  await page.waitForTimeout(300);
  await page.keyboard.press('h');
  expect((await state(page)).placing).toBe('house');
  await page.keyboard.press('Escape');
  expect((await state(page)).placing).toBeNull();
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  expect((await state(page)).selected).toBe(0);
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  expect((await state(page)).selected).toBe(3);
  // building hotkey: select capital, Q trains a worker
  const cap = (await g(page, `return game.units.visible.find(v => v.owner === 0 && v.kind === 64).id;`)) as number;
  await g(page, `game.units.selected.clear(); game.units.selected.add(${cap});`);
  await page.waitForTimeout(300);
  await page.keyboard.press('q');
  await page.waitForTimeout(400);
  expect((await g(page, `return game.snapshot.buildings.find(b => b.id === ${cap}).queue.length;`))).toBe(1);
  await page.keyboard.press('=');
  await page.waitForTimeout(200);
  expect((await state(page)).speed).toBe('fast');
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await page.waitForTimeout(200);
  expect((await state(page)).speed).toBe('slow');
  console.log('[F-173] H opened house placement, Esc cancelled; Ctrl+1 / 1 restored 3 workers; Q queued a worker; +/− changed speed fast → slow');
});

test('F-016 save to file, reload in a fresh browser context, identical state; old-version file rejected', async ({ page, browser }) => {
  await openGame(page, 'save-ui', 'small', '&rivals=1');
  await page.getByTestId('speed-veryFast').click();
  await page.waitForFunction(() => (window as any).__game.state().tick > 600, null, { timeout: 60_000 });
  await page.getByTestId('pause').click();
  await page.waitForTimeout(300);
  const before = await g(page, `return await G.hash();`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save').click()]);
  const path = await dl.path();
  const bytes = readFileSync(path!);
  console.log(`[F-016] downloaded ${dl.suggestedFilename()} (${(bytes.length / 1024).toFixed(0)} KB gzip) at tick ${before.tick}, hash ${before.hash}`);
  // Fresh context = like a browser restart.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/?menu=new');
  await p2.getByTestId('load-input').setInputFiles({ name: dl.suggestedFilename(), mimeType: 'application/gzip', buffer: bytes });
  await p2.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await p2.waitForTimeout(500);
  const loaded = await p2.evaluate(() => (window as any).__game.hash());
  console.log(`[F-016] loaded in new context: tick ${loaded.tick}, hash ${loaded.hash}`);
  expect(loaded).toEqual(before);
  // Old version → clear message on the menu.
  const json = JSON.parse(gunzipSync(bytes).toString());
  json.version = 1;
  const old = gzipSync(Buffer.from(JSON.stringify(json)));
  writeFileSync(path! + '.old', old);
  const p3 = await ctx2.newPage();
  await p3.goto('/?menu=new');
  await p3.getByTestId('load-input').setInputFiles({ name: 'old.fnsave', mimeType: 'application/gzip', buffer: old });
  await expect(p3.getByTestId('menu-error')).toContainText('different game version');
  console.log('[F-016] old-version save rejected: ' + (await p3.getByTestId('menu-error').textContent()));
  await ctx2.close();
});

test('F-006 single-player works fully offline (no requests after load)', async ({ page, context }) => {
  await page.goto('/?menu=new');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await context.setOffline(true);
  await page.getByTestId('seed').fill('offline-test');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  const t0 = (await state(page)).tick;
  await page.waitForTimeout(120_000);
  const s = await state(page);
  console.log(`[F-006] offline for 2 min: tick ${t0} → ${s.tick}, stats present: ${!!s.stats}; requests after load: ${requests.length} ${JSON.stringify(requests.slice(0, 5))}`);
  expect(s.tick - t0).toBeGreaterThan(1100);
  expect(requests.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);
  await context.setOffline(false);
});

test('F-176 UI scale 200 % on 1366×768: nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?menu=new');
  await page.evaluate(() => localStorage.setItem('fortnight.settings.v1', JSON.stringify({ uiScale: 2, quality: 'high', volume: 0.6, muted: false })));
  await openGame(page, 'scale-test', 'small');
  const workers = await ownUnits(page, 2);
  await g(page, `${JSON.stringify(workers)}.forEach(id => game.units.selected.add(id)); G.state();`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out: string[] = [];
    for (const sel of ['.topbar', '.selpanel', '.stats', '.minimap', '.feed']) {
      const el = document.querySelector(sel);
      if (!el) { out.push(sel + ' missing'); continue; }
      const b = el.getBoundingClientRect();
      if (b.left < -1 || b.right > W + 1 || b.top < -1 || b.bottom > H + 1) out.push(`${sel} [${b.left.toFixed(0)},${b.top.toFixed(0)},${b.right.toFixed(0)},${b.bottom.toFixed(0)}]`);
    }
    return { fontSize: getComputedStyle(document.documentElement).fontSize, scrollW: document.documentElement.scrollWidth, W, overflow: out };
  });
  console.log(`[F-176] root font ${r.fontSize}, scrollWidth ${r.scrollW} / ${r.W}, out of view: ${JSON.stringify(r.overflow)}`);
  expect(r.fontSize).toBe('30px');
  expect(r.scrollW).toBeLessThanOrEqual(r.W);
  expect(r.overflow).toEqual([]);
});

test('F-180 sound plays on events; muted = silent', async ({ page }) => {
  await openGame(page, 'sound-test', 'small');
  const cap = (await g(page, `return game.units.visible.find(v => v.owner === 0 && v.kind === 64).id;`)) as number;
  const c0 = await g(page, `return G.sfxCount();`);
  await g(page, `game.train(${cap}, 1);`);
  await page.getByTestId('speed-veryFast').click();
  await page.waitForFunction(() => (window as any).__game.state().tick > 200, null, { timeout: 60_000 });
  const c1 = await g(page, `return G.sfxCount();`);
  // mute via settings UI, then train again
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('mute').check();
  await page.locator('[data-testid=settings] button.primary').click();
  const c2 = await g(page, `return G.sfxCount();`);
  await g(page, `game.train(${cap}, 1);`);
  await page.waitForFunction(() => (window as any).__game.state().tick > 400, null, { timeout: 60_000 });
  const c3 = await g(page, `return G.sfxCount();`);
  console.log(`[F-180] sounds scheduled: before ${c0}, after training+trained event ${c1}; muted: ${c2} → ${c3}`);
  expect(c1).toBeGreaterThan(c0);
  expect(c3).toBe(c2);
});

test('F-099 / F-170 menu: race and rivals shape the started match', async ({ page }) => {
  await page.goto('/?menu=new');
  await expect(page.getByTestId('race')).toHaveValue('baseline');
  await page.getByTestId('seed').fill('menu-test');
  await page.getByTestId('rivals').fill('2');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game' && (window as any).__game.state().stats, null, { timeout: 60_000 });
  const d = await g(page, `return await G.dump();`);
  console.log(`[F-099] Wayfolk start: ${JSON.stringify(d.units)}, stock ${JSON.stringify(d.stock)}, census rows ${d.census.length}`);
  expect(Object.entries(d.units).filter(([, n]) => n)).toEqual([['scout', 1], ['worker', 3]]); // every other unit type starts at 0
  expect(d.census.length).toBe(3);
});
