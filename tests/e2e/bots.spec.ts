// Phase 4 browser acceptance tests: bot count + clamp message, difficulty and personality,
// Impossible bonus toggle, victory options, menu choices persisting, bot goal overlay (F-125).
import { expect, test } from '@playwright/test';
import { openGame, state } from './helpers';

const inGame = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as any).__game?.state().screen === 'game' && (window as any).__game.state().stats, null, { timeout: 60_000 });

test('F-120 bot count 0..max per size; over-limit is clamped with a message; each count starts', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-custom').click(); // every size
  await page.getByTestId('size').selectOption('medium');
  await page.getByTestId('rivals').fill('8');
  await page.getByTestId('size').selectOption('small');
  await expect(page.getByTestId('clamp-msg')).toBeVisible();
  const msg = await page.getByTestId('clamp-msg').innerText();
  await expect(page.getByTestId('rivals')).toHaveValue('3');
  console.log(`[F-120] clamp message: "${msg}"`);
  const started: string[] = [];
  for (const n of [0, 1, 3]) {
    await page.goto('/');
    await page.getByTestId('mode-custom').click();
    await page.getByTestId('seed').fill(`bots-count-${n}`);
    await page.getByTestId('size').selectOption('small');
    await page.getByTestId('rivals').fill(String(n));
    await page.getByTestId('start').click();
    await inGame(page);
    await page.waitForFunction((k) => ((window as any).__game.state().bots ?? []).length === k, n, { timeout: 30_000 });
    const s = await state(page);
    started.push(`${n} bots → census ${s.stats.census.length} players, ${s.bots.length} bot brains`);
    expect(s.stats.census.length).toBe(n + 1);
    expect(s.bots.map((b: any) => b.player)).toEqual(Array.from({ length: n }, (_, k) => k + 1));
  }
  console.log(`[F-120] ${started.join('; ')}`);
});

test('F-121 / F-170 / F-178 difficulty, personality, victory options shape the match and persist; Impossible bonus off by default and shown when on', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('fortnight.menu.v1'));
  await page.reload();
  await page.getByTestId('seed').fill('bots-imp');
  await page.getByTestId('rivals').fill('2');
  await expect(page.getByTestId('bonus')).toHaveCount(0); // only offered for Impossible
  await page.getByTestId('difficulty').selectOption('impossible');
  await expect(page.getByTestId('bonus')).not.toBeChecked();
  await page.getByTestId('personality').selectOption('berserker');
  await page.getByTestId('more-settings').locator('summary').click();
  await page.getByTestId('v-domination').uncheck();
  // both victory conditions off → Start disabled
  await page.getByTestId('v-conquest').uncheck();
  await expect(page.getByTestId('start')).toBeDisabled();
  await page.getByTestId('v-conquest').check();
  await page.getByTestId('bonus').check();
  await page.getByTestId('start').click();
  await inGame(page);
  await page.waitForFunction(() => ((window as any).__game.state().bots ?? []).length === 2, null, { timeout: 30_000 });
  const s = await state(page);
  expect(s.bots.every((b: any) => b.difficulty === 'impossible' && b.personality === 'berserker')).toBe(true);
  await expect(page.getByTestId('bonus-badge')).toBeVisible();
  await page.getByTestId('settings-btn').click();
  await expect(page.getByTestId('settings-bonus')).toBeVisible();
  const badge = await page.getByTestId('bonus-badge').innerText();
  // back to the menu: the choices are remembered
  await page.goto('/');
  await expect(page.getByTestId('difficulty')).toHaveValue('impossible');
  await expect(page.getByTestId('personality')).toHaveValue('berserker');
  await page.getByTestId('more-settings').locator('summary').click();
  await expect(page.getByTestId('v-domination')).not.toBeChecked();
  await expect(page.getByTestId('rivals')).toHaveValue('2');
  await expect(page.getByTestId('bonus')).toBeChecked();
  // without the bonus no badge
  await page.getByTestId('bonus').uncheck();
  await page.getByTestId('seed').fill('bots-imp2');
  await page.getByTestId('start').click();
  await inGame(page);
  await expect(page.getByTestId('bonus-badge')).toHaveCount(0);
  console.log(`[F-121] bots ${JSON.stringify(s.bots.map((b: any) => `${b.personality}/${b.difficulty}`))}; badge "${badge}"; settings line shown; no badge with bonus off; menu choices persisted across reload`);
});

test('F-125 bot goal overlay shows the goal the bot reports at the same tick', async ({ page }) => {
  await openGame(page, 'bots-overlay', 'small', '&bots=3&difficulty=hard');
  await page.evaluate(() => (window as any).__game.setSpeed('veryFast'));
  await page.waitForFunction(() => (window as any).__game.state().tick > 1500, null, { timeout: 90_000 });
  await page.keyboard.press('F4');
  await expect(page.getByTestId('bot-overlay')).toBeVisible();
  const seen: string[] = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => (window as any).__game.setPaused(true));
    await page.waitForTimeout(400); // last snapshot rendered
    const r = await page.evaluate(() => {
      const st = (window as any).__game.state();
      return { tick: st.tick, log: st.bots.map((b: any) => b.goal), dom: st.bots.map((b: any) => document.querySelector(`[data-testid="bot-goal-${b.player}"]`)?.textContent) };
    });
    seen.push(`t${r.tick}: ${r.log.join('/')}`);
    expect(r.dom).toEqual(r.log);
    await page.evaluate(() => (window as any).__game.setPaused(false));
    await page.waitForTimeout(3000);
  }
  await page.getByTestId('bots-btn').click();
  await expect(page.getByTestId('bot-overlay')).toHaveCount(0);
  console.log(`[F-125] overlay = bot log at ${seen.join('; ')}`);
});
