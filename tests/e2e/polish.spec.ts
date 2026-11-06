// Phase 9: tutorial played through (F-181) and touch controls (F-177).
import { expect, test, type Page } from '@playwright/test';
import { openGame, state } from './helpers';

const g = (page: Page, fn: string): Promise<any> => page.evaluate(`(async () => { const G = window.__game; const game = G.game; ${fn} })()`);

test('F-181 tutorial: every step completes from real game actions; skip works', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?menu=new');
  await page.getByTestId('tutorial-btn').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await expect(page.getByTestId('tutorial')).toContainText('Welcome');
  await page.getByTestId('tutorial-next').click();
  await expect(page.getByTestId('tutorial')).toContainText('Select your workers');
  const workers: number[] = await g(page, `const ws = game.units.visible.filter(v => v.owner === 0 && v.kind === 2).map(v => v.id); ws.forEach(id => game.units.selected.add(id)); return ws;`);
  await expect(page.getByTestId('tutorial')).toContainText('Build a house', { timeout: 10_000 });
  await page.evaluate(() => (window as any).__game.setSpeed('veryFast'));
  // try tiles around the capital until one takes the house (the sim checks placement)
  await g(page, `const cap = game.units.visible.find(v => v.owner === 0 && v.kind === 64); const w = game.map.w;
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) G.cmd({ type: 'place', ids: ${JSON.stringify(workers)}.slice(0, 1), btype: 2, tile: (Math.floor(cap.z) + dy) * w + Math.floor(cap.x) + dx });`);
  await expect(page.getByTestId('tutorial')).toContainText('Gather wood', { timeout: 90_000 });
  await g(page, `const cap = game.units.visible.find(v => v.owner === 0 && v.kind === 64); const w = game.map.w; let best = -1, bd = 1e9;
    for (let t = 0; t < game.map.resType.length; t++) if (game.map.resType[t] === 1) { const d = Math.abs(t % w - cap.x) + Math.abs(Math.floor(t / w) - cap.z); if (d < bd) { bd = d; best = t; } }
    G.cmd({ type: 'gather', ids: ${JSON.stringify(workers)}.slice(1), tile: best });`);
  await expect(page.getByTestId('tutorial')).toContainText('Train a worker', { timeout: 120_000 });
  await g(page, `const cap = game.units.visible.find(v => v.owner === 0 && v.kind === 64); G.cmd({ type: 'train', building: cap.id, utype: 1 });`);
  await expect(page.getByTestId('tutorial')).toContainText('Research', { timeout: 90_000 });
  await page.getByTestId('tech-btn').click();
  await expect(page.getByTestId('tutorial')).toContainText('You are ready', { timeout: 10_000 });
  await page.getByTestId('tech-panel').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('tutorial-next').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  // skip from the start
  await page.evaluate(() => (window as any).__game.state && (window as any).__game.game && 0);
  await page.goto('/?menu=new');
  await page.getByTestId('tutorial-btn').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  console.log('[F-181] all 7 tutorial steps completed by game actions (select, house, wood, train, research); skip closes it');
});

test('F-177 touch: one-finger drag pans, pinch zooms, tap selects, long press orders', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  await openGame(page, 'touch-1', 'small');
  const cam = () => page.evaluate(() => { const c = (window as any).__game.game.cam; return { x: c.targetX, z: c.targetZ, d: c.distance }; });
  const touch = (id: number, type: string, x: number, y: number) => page.evaluate(([i, t, px, py]) => { const el = document.querySelector('canvas')!; el.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: 'touch', clientX: px as number, clientY: py as number, bubbles: true, isPrimary: i === 1 })); }, [id, type, x, y]);
  const c0 = await cam();
  await touch(1, 'pointerdown', 450, 350); for (let k = 1; k <= 6; k++) await touch(1, 'pointermove', 450 - 20 * k, 350); await touch(1, 'pointerup', 330, 350);
  const c1 = await cam();
  expect(c1.x).toBeGreaterThan(c0.x); // dragged left → view moves right
  // fingers together → zoom out (the game starts fully zoomed in)
  await touch(1, 'pointerdown', 250, 350); await touch(2, 'pointerdown', 650, 350);
  for (let k = 1; k <= 8; k++) { await touch(1, 'pointermove', 250 + 20 * k, 350); await touch(2, 'pointermove', 650 - 20 * k, 350); }
  await touch(1, 'pointerup', 410, 350); await touch(2, 'pointerup', 490, 350);
  const c2 = await cam();
  expect(c2.d).toBeGreaterThan(c1.d);
  // tap on own scout selects it; long press elsewhere orders a move
  const scout = await page.evaluate(() => { const G = (window as any).__game.game; const s = G.units.visible.find((v: any) => v.owner === 0 && v.kind === 1); const p = G.screenOf(s); return { id: s.id, x: p.x, y: p.y }; });
  await touch(1, 'pointerdown', scout.x, scout.y); await touch(1, 'pointerup', scout.x, scout.y);
  await page.waitForFunction(() => (window as any).__game.state().selected > 0, null, { timeout: 5000 });
  const sel = (await state(page)).selection.units;
  await touch(1, 'pointerdown', scout.x + 120, scout.y + 40); await page.waitForTimeout(600); await touch(1, 'pointerup', scout.x + 120, scout.y + 40);
  const pos = (): Promise<{ x: number; z: number }> => page.evaluate((id) => { const v = (window as any).__game.game.units.get(id); return { x: v.x, z: v.z }; }, scout.id);
  const p0 = await pos();
  await page.waitForTimeout(2000);
  const p1 = await pos();
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  expect(moved).toBeGreaterThan(0.5);
  console.log(`[F-177] drag panned x ${c0.x.toFixed(1)} → ${c1.x.toFixed(1)}; pinch zoomed out ${c1.d.toFixed(1)} → ${c2.d.toFixed(1)}; tap selected ${JSON.stringify(sel)}; long press sent the scout ${moved.toFixed(1)} tiles`);
  expect(Object.keys(sel).length).toBeGreaterThan(0);
  await ctx.close();
});
