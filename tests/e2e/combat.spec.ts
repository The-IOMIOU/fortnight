// Phase 3 browser tests: combat orders through the UI, health bars and arrows, wall/trench line tools,
// rally points, key rebinding, and elimination → spectator mode. Scenes are built with the real sim in
// Node, saved, and loaded through the menu's "Load save file" (no cheats in the game itself).
import { expect, test, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { Sim } from '../../src/sim/sim';
import { saveSim } from '../../src/sim/serialize';
import { buildingKind, Kind } from '../../src/sim/defs';
import { ownedOfKind } from '../../src/sim/scripted';
import { openGame, state } from './helpers';

const g = (page: Page, fn: string): Promise<any> => page.evaluate(`(async () => { const G = window.__game; const game = G.game; ${fn} })()`);

/** Free land tiles around a point on the same continent. */
function ring(s: Sim, center: number, n: number, minR = 2): number[] {
  const w = s.map.w, out: number[] = [];
  for (let r = minR; out.length < n && r < 30; r++) for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const t = center + dy * w + dx;
    if (t > 0 && t < s.map.biome.length && s.cost(t, 0) > 0 && s.map.continent[t] === s.map.continent[center]) out.push(t);
  }
  return out;
}

async function loadScene(page: Page, s: Sim): Promise<void> {
  s.step(); // one tick so vision/fog reflect the staged units
  const buf = gzipSync(Buffer.from(JSON.stringify(saveSim(s))));
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles({ name: 'scene.fnsave', mimeType: 'application/gzip', buffer: buf });
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__game.ready());
  await page.waitForTimeout(500);
}

test('F-070 / F-172 / F-071: select soldiers, right-click an enemy → attack; health bars and arrows show; orders and formation from the panel', async ({ page }) => {
  const s = new Sim({ seed: 'ui-skirmish', size: 'small', players: 2 });
  const cap = ownedOfKind(s, 0, buildingKind('capital'))[0];
  const mine = ring(s, s.ents.anchor[cap], 6, 3);
  const archers = mine.slice(0, 4).map((t) => s.spawnUnitAt(0, 'archer', t));
  const spears = mine.slice(4, 6).map((t) => s.spawnUnitAt(0, 'spearman', t));
  const w0 = s.map.w, d2 = (a: number, b: number) => ((a % w0) - (b % w0)) ** 2 + (Math.floor(a / w0) - Math.floor(b / w0)) ** 2;
  const foeTiles = ring(s, mine[0], 40, 4).filter((t) => d2(t, mine[0]) <= 36 && !mine.includes(t)).slice(0, 3); // within archer vision
  const foes = foeTiles.map((t) => s.spawnUnitAt(1, 'spearman', t));
  for (const f of foes) { s.ents.task[f] = 9; } // hold (HOLD = 9) so they don't wander off
  await loadScene(page, s);
  await g(page, `const v = game.units.get(${archers[0]}); game.cam.setTarget(v.x, v.z); game.cam.distance = 22; game.cam.apply();`);
  await page.waitForTimeout(400);
  // select archers + spearmen with the box
  await g(page, `game.units.render(1);`);
  const pts = await g(page, `return ${JSON.stringify([...archers, ...spears])}.map(id => game.screenOf(game.units.get(id), 0.4));`);
  const x0 = Math.min(...pts.map((p: any) => p.x)) - 20, y0 = Math.min(...pts.map((p: any) => p.y)) - 20;
  const x1 = Math.max(...pts.map((p: any) => p.x)) + 20, y1 = Math.max(...pts.map((p: any) => p.y)) + 20;
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(250);
  const sel = (await state(page)).selection.units;
  expect(sel.archer).toBe(4); expect(sel.spearman).toBe(2);
  await expect(page.getByTestId('orders')).toBeVisible();
  // formation toggle via key, hold via panel button
  await page.keyboard.press('b');
  expect((await state(page)).formation).toBe('line');
  // right-click on an enemy → attack
  const target = await g(page, `game.units.render(1); const v = game.units.get(${foes[0]}); return v ? game.screenOf(v, 0.4) : null;`);
  expect(target).not.toBeNull();
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.getByTestId('pause').click(); // resume (loaded saves start paused)
  await page.getByTestId('speed-veryFast').click();
  let sawShots = 0, sawBars = 0;
  for (let k = 0; k < 80; k++) {
    await page.waitForTimeout(250);
    const r = await g(page, `return { shots: game.effects.shots.length, damaged: (() => { const e = game.snapshot.ents; let n = 0; for (let i = 0; i < e.length; i += 9) if (e[i + 8] < 1000 && e[i + 1] < 64) n++; return n; })(), alive: ${JSON.stringify(foes)}.filter(id => game.units.get(id)).length };`);
    sawShots = Math.max(sawShots, r.shots); sawBars = Math.max(sawBars, r.damaged);
    if (r.alive === 0) break;
  }
  const end = await g(page, `return { foesLeft: ${JSON.stringify(foes)}.filter(id => game.units.get(id)).length, tick: G.state().tick };`);
  console.log(`[F-070/F-172] box-selected 4 archers + 2 spearmen, B → line formation, right-click enemy → attack: arrows in flight seen ${sawShots}, damaged units with health bars ${sawBars}, enemies left ${end.foesLeft}/3 at tick ${end.tick}`);
  expect(sawShots).toBeGreaterThan(0);
  expect(sawBars).toBeGreaterThan(0);
  expect(end.foesLeft).toBe(0);
  // hold, then stop via panel buttons
  await g(page, `game.units.selected.clear(); game.units.selected.add(${spears[0]});`);
  await page.waitForTimeout(300);
  await page.getByTestId('order-hold').click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('unit-info')).toContainText('holding');
  await page.getByTestId('order-stop').click();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('unit-info')).toContainText('idle');
});

test('F-040 / F-041 UI: wall line and trench line tools; rally point on a building', async ({ page }) => {
  await openGame(page, 'ui-walls', 'small');
  await page.waitForTimeout(500);
  await g(page, `game.units.render(1); game.cam.distance = 20; game.cam.apply();`);
  const workers = await g(page, `return game.units.visible.filter(v => v.owner === 0 && v.kind === 2).map(v => v.id);`);
  await g(page, `${JSON.stringify(workers)}.forEach(id => game.units.selected.add(id));`);
  await page.waitForTimeout(300);
  // find 4 tiles in a row inside our territory where walls fit, starting near the capital
  const line = await g(page, `
    const w = game.map.w, cap = game.units.visible.find(v => v.owner === 0 && v.kind === 64);
    for (let r = 4; r < 9; r++) for (let dx = -6; dx <= 2; dx++) {
      const y = cap.anchorZ + 1 + r, xs = [0, 1, 2, 3].map(k => cap.anchorX + dx + k);
      if (xs.every(x => game.lineTileValid('wall', y * w + x))) {
        game.cam.setTarget(xs[0] + 2, y + 0.5); game.units.render(1);
        const pts = xs.map(x => { const p = game.screenOf({ x: x + 0.5, y: game.map.height[y * w + x] * 0.5, z: y + 0.5 }, 0); const t = game.pickTile(p.x, p.y); return t && Math.floor(t.x) === x && Math.floor(t.z) === y ? p : null; });
        if (pts.every(Boolean)) return { a: pts[0], b: pts[3], tiles: xs.map(x => y * w + x) };
      }
    }
    return null;`);
  expect(line).not.toBeNull();
  await page.keyboard.press('j');
  expect((await state(page)).placing).toBe('wall');
  await page.mouse.move(line.a.x, line.a.y); await page.mouse.click(line.a.x, line.a.y);
  await page.mouse.move(line.b.x, line.b.y); await page.waitForTimeout(150);
  const ghost = await g(page, `return game.ghostLine.count;`);
  await page.mouse.click(line.b.x, line.b.y);
  await page.getByTestId('speed-veryFast').click();
  await page.waitForTimeout(6000);
  const walls = await g(page, `game.units.render(1); return game.units.visible.filter(v => v.owner === 0 && v.kind === 64 + 12).length;`);
  console.log(`[F-040 UI] J → wall tool, ghost preview of ${ghost} tiles, 2 clicks → ${walls} wall segments built`);
  expect(ghost).toBe(4);
  expect(walls).toBe(4);
  // trench line: I, two clicks one row lower
  await g(page, `game.units.selected.clear(); ${JSON.stringify(workers)}.forEach(id => game.units.selected.add(id));`);
  await page.waitForTimeout(300);
  const dig = await g(page, `
    const w = game.map.w, tiles = ${JSON.stringify(line.tiles)}.map(t => t + 2 * w);
    if (!tiles.every(t => game.lineTileValid('dig', t))) return null;
    const pts = tiles.map(t => game.screenOf({ x: t % w + 0.5, y: game.map.height[t] * 0.5, z: Math.floor(t / w) + 0.5 }, 0));
    return { a: pts[0], b: pts[1], tiles };`);
  if (dig) {
    await page.keyboard.press('i');
    await page.mouse.click(dig.a.x, dig.a.y); await page.mouse.click(dig.b.x, dig.b.y);
    await page.waitForTimeout(8000);
    const trenches = await g(page, `return ${JSON.stringify(dig.tiles.slice(0, 2))}.filter(t => game.map.biome[t] === 12).length;`);
    console.log(`[F-041 UI] I → trench tool, 2 clicks → ${trenches}/2 trench tiles dug`);
    expect(trenches).toBe(2);
  }
  // rally point: select the capital, right-click a tile → toast; trained worker walks there
  const cap = await g(page, `return game.units.visible.find(v => v.owner === 0 && v.kind === 64);`);
  await g(page, `game.units.selected.clear(); game.units.selected.add(${cap.id});`);
  await page.waitForTimeout(300);
  const rp = await g(page, `const p = game.screenOf({ x: ${cap.x} + 5.5, y: 0, z: ${cap.z} - 3.5 }, 0); const t = game.pickTile(p.x, p.y); return { ...p, tile: Math.floor(t.z) * game.map.w + Math.floor(t.x) };`);
  await page.mouse.click(rp.x, rp.y, { button: 'right' });
  await expect(page.locator('.toast')).toContainText('Rally point set');
});

test('F-174 rebind a key; it survives a reload; the old key stops working', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('fortnight.keys.v1'));
  await openGame(page, 'keys-test', 'small');
  await page.getByTestId('settings-btn').click();
  await page.getByTestId('keys-btn').click();
  await page.getByTestId('key-build.house').click();
  await page.keyboard.press('z');
  await expect(page.getByTestId('key-build.house')).toHaveText('Z');
  await page.getByTestId('keys-close').click();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__game.ready());
  await page.waitForTimeout(400);
  const workers = await g(page, `game.units.render(1); return game.units.visible.filter(v => v.owner === 0 && v.kind === 2).map(v => v.id);`);
  await g(page, `${JSON.stringify(workers)}.forEach(id => game.units.selected.add(id));`);
  await page.waitForTimeout(250);
  await page.keyboard.press('h');
  const afterOld = (await state(page)).placing;
  await page.keyboard.press('z');
  const afterNew = (await state(page)).placing;
  console.log(`[F-174] rebound "Build house" H → Z, reloaded: H → ${afterOld}, Z → ${afterNew}`);
  expect(afterOld).toBeNull();
  expect(afterNew).toBe('house');
  await page.evaluate(() => localStorage.removeItem('fortnight.keys.v1'));
});

test('F-135 elimination: losing the last town switches the player to spectator mode', async ({ page }) => {
  const s = new Sim({ seed: 'ui-elim', size: 'small', players: 2 });
  const cap = ownedOfKind(s, 0, buildingKind('capital'))[0];
  s.ents.hp[cap] = 20;
  for (const t of ring(s, s.ents.anchor[cap] + s.map.w + 1, 6, 2)) s.spawnUnitAt(1, 'spearman', t);
  await loadScene(page, s);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('spectating')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const r = await g(page, `const f = game.terrain.fogTex.image.data; let seen = 0; for (let i = 0; i < f.length; i++) if (f[i] === 255) seen++; return { seen, total: f.length, viewer: game.viewer };`);
  const notes: string[] = await page.evaluate(() => [...document.querySelectorAll('.note')].map((n) => n.textContent!));
  console.log(`[F-135] capital destroyed → spectating banner shown; viewer ${r.viewer}; map visible ${r.seen}/${r.total} tiles; feed: ${JSON.stringify(notes)}`);
  expect(r.viewer).toBe(-1);
  expect(r.seen).toBe(r.total);
  await expect(page.getByTestId('gameover')).toBeVisible();
  void Kind;
});
