// Phase 5 UI: choose a people in the menu (F-099/F-096), research from the research panel (F-095),
// see the unlocked building in the build menu (F-094). Since the era tree (F-205) the forge needs Mining → Bronze → Smithing.
import { expect, test } from '@playwright/test';
import { state } from './helpers';

test('F-095 choose Anvilborn, research Guild halls from the panel, the great forge appears in the build menu', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?menu=new');
  await page.getByTestId('race').selectOption('anvilborn');
  await expect(page.getByTestId('race-summary')).toContainText('Gear costs 40 % less');
  await expect(page.getByTestId('race-points')).toContainText('Point balance: 0');
  await page.getByTestId('bot-race').selectOption('delvers');
  await page.getByTestId('seed').fill('race-ui-1');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as any).__game?.state().me, null, { timeout: 60_000 });
  const me0 = (await state(page)).me;
  expect(me0.race).toBe('anvilborn');
  await page.getByTestId('tech-btn').click();
  await expect(page.getByTestId('tech-panel')).toBeVisible();
  await expect(page.getByTestId('tech-guildHalls')).toContainText('Ironguard');
  await expect(page.getByTestId('tech-smithing')).toContainText('needs Bronze working');
  await page.getByTestId('research-guildHalls').click();
  await page.waitForFunction(() => (window as any).__game.state().me.researching === 'guildHalls', null, { timeout: 20_000 });
  await expect(page.getByTestId('cancel-research')).toBeVisible();
  await page.evaluate(() => (window as any).__game.setSpeed('veryFast'));
  await page.waitForFunction(() => (window as any).__game.state().me.researched.includes('guildHalls'), null, { timeout: 120_000 });
  await page.getByTestId('tech-panel').getByRole('button', { name: 'Close' }).click();
  // select a worker: the forge is now in its build menu (worker kind = 2)
  await page.evaluate(() => { const game = (window as any).__game.game; for (const v of game.units.visible) if (v.owner === 0 && v.kind === 2) { game.units.selected.add(v.id); break; } });
  await expect(page.getByTestId('build-greatForge')).toBeVisible();
  await expect(page.getByTestId('build-forge')).toHaveCount(0); // needs Smithing first
  console.log('[F-095] Anvilborn researched Guild halls from the panel; the great forge appeared in the build menu, the forge (Smithing) did not');
});
