// Start screen: planet backdrop, pixel title, three choices (+ Continue with a save), Multiplayer screen.
import { expect, test } from '@playwright/test';

test('Start screen shows the title and only Play / Multiplayer / Tutorial; keyboard works; backdrop renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByRole('img', { name: 'FORTNIGHT' })).toBeVisible();
  const items = await page.locator('.home-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(items).toEqual(['home-play', 'home-multiplayer', 'home-tutorial']); // no save yet → no Continue
  // keyboard: the first entry has focus, Down moves, Enter opens
  await expect(page.getByTestId('home-play')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('home-multiplayer')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('multiplayer')).toBeVisible();
  await page.getByTestId('mp-back').click();
  // the backdrop builds the planet and keeps drawing frames
  await expect(page.getByTestId('backdrop')).toHaveAttribute('data-planet', 'ready', { timeout: 15_000 });
  const f0 = +(await page.getByTestId('backdrop').getAttribute('data-frames') ?? 0);
  await page.waitForTimeout(1000);
  const f1 = +(await page.getByTestId('backdrop').getAttribute('data-frames') ?? 0);
  console.log(`[home] items ${items.join(', ')}; planet ready; ${f1 - f0} backdrop frames in 1 s`);
  expect(f1 - f0).toBeGreaterThan(2); // headless Chromium renders WebGL in software (≈8 fps here); a GPU runs it at full rate
  await page.getByTestId('home-play').click();
  await expect(page.getByTestId('start')).toBeVisible();
  await page.getByTestId('menu-back').click();
  await expect(page.getByTestId('home')).toBeVisible();
});

test('Tutorial starts from the start screen; Continue appears after a save', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-tutorial').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await page.evaluate(async () => { await (window as any).__game.game.whenReady(); });
  // save into the Continue slot, quit to the start screen
  await page.getByTestId('save').click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByTestId('home-continue')).toBeVisible({ timeout: 10_000 });
  const items = await page.locator('.home-item').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  expect(items[0]).toBe('home-continue');
  await page.getByTestId('home-continue').click();
  await page.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  console.log(`[home] tutorial started; after saving, Continue is the first entry and loads the game`);
});
