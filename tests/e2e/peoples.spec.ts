// Owner 2026-11-07 expansion in the browser: the era tech tree screen (F-206), the people builder with save
// slots (F-208) and the people picker gallery with animated previews (F-209). Headless only.
import { expect, test, type Page } from '@playwright/test';
import { state } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string): Promise<void> => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

async function startFromMenu(page: Page, seed: string): Promise<void> {
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('start').click();
  await page.waitForFunction(() => (window as any).__game?.state().me, null, { timeout: 60_000 });
}

test('F-209 people picker: every people shows its running preview and plain text; choosing one starts the match with it', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?menu=new');
  await page.getByTestId('people-open').click();
  await expect(page.getByTestId('people-picker')).toBeVisible();
  const ids: string[] = await page.$$eval('[data-testid^="people-"].pcard', (els) => els.map((e) => e.getAttribute('data-testid')!.slice(7)));
  const playable = ids.filter((id) => id !== 'baseline' && id !== 'create');
  expect(playable.length).toBeGreaterThanOrEqual(12);
  const seen: string[] = [];
  for (const id of playable) {
    await page.getByTestId('people-' + id).click();
    const prev = page.getByTestId('ability-preview');
    await expect(prev).toBeVisible();
    await expect(page.getByTestId('people-traits')).toContainText(/[+−]\d/);
    await expect(page.getByTestId('people-evolution')).toContainText('Branch:');
    // the preview is animating: two frames differ
    const frame = (): Promise<string> => page.$eval('[data-testid="ability-preview"] canvas', (c) => (c as HTMLCanvasElement).toDataURL());
    const a = await frame(); await page.waitForTimeout(250); const b = await frame();
    expect(a).not.toBe(b);
    seen.push(`${id}:${await prev.getAttribute('data-ability')}`);
  }
  console.log(`[F-209] ${playable.length} peoples, each with a running preview: ${seen.join(', ')}`);
  await page.getByTestId('people-windriders').click();
  await shot(page, 'picker');
  await page.getByTestId('people-choose').click();
  await expect(page.getByTestId('race')).toHaveValue('windriders');
  await startFromMenu(page, 'picker-1');
  expect((await state(page)).me.race).toBe('windriders');
});

test('F-208 people builder: unbalanced peoples can not be saved; a balanced one saves to a slot, survives a reload and plays', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?menu=new');
  await page.evaluate(() => localStorage.removeItem('fortnight.peoples.v1'));
  await page.reload();
  await page.getByTestId('builder-open').click();
  await page.getByTestId('builder-name').fill('Test folk');
  await page.getByTestId('pick-quickStudy').click();
  await expect(page.getByTestId('builder-total')).toContainText('+6');
  await expect(page.getByTestId('builder-error')).toContainText('too strong');
  await expect(page.getByTestId('builder-save')).toBeDisabled();
  // four buffs are too many even when balanced
  for (const k of ['gather_speed', 'build_speed', 'vision']) await page.getByTestId('stat-up-' + k).click();
  for (const a of ['fragileArmy', 'flammable']) await page.getByTestId('pick-' + a).click();
  await expect(page.getByTestId('builder-buffs')).toContainText('4 / 3');
  await expect(page.getByTestId('builder-error')).toContainText('at most 3 buffs');
  for (const k of ['gather_speed', 'build_speed', 'vision']) await page.getByTestId('stat-down-' + k).click();
  await page.getByTestId('pick-flammable').click(); // remove it again: +6 −6 = 0
  await expect(page.getByTestId('builder-total')).toContainText('0');
  await expect(page.getByTestId('builder-save')).toBeEnabled();
  await shot(page, 'builder');
  await page.getByTestId('builder-save').click();
  await expect(page.getByTestId('slot-0')).toContainText('Test folk');
  await page.reload();
  await page.getByTestId('builder-open').click();
  await expect(page.getByTestId('slot-0')).toContainText('Test folk (0)');
  await page.getByRole('button', { name: 'Close' }).click();
  const opt = await page.$eval('[data-testid="race"]', (s) => [...(s as HTMLSelectElement).options].find((o) => o.text.includes('Test folk'))?.value ?? '');
  expect(opt).toMatch(/^custom_/);
  await page.getByTestId('race').selectOption(opt);
  await expect(page.getByTestId('race-summary')).toContainText('Quick learners');
  await startFromMenu(page, 'builder-1');
  const me = (await state(page)).me;
  console.log(`[F-208] builder: +6 rejected, 4 buffs rejected, balanced "Test folk" saved in slot 1, still there after reload, match started as ${me.race}`);
  expect(me.race).toBe(opt);
  const save = await page.evaluate(() => (window as any).__game.save());
  expect(JSON.stringify(save)).toContain('Test folk');
});

test('F-206 research screen: the tree by era with lines, locked/available/done states, research starts from it; branches close', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?menu=new');
  await page.getByTestId('race').selectOption('deepkin');
  await startFromMenu(page, 'tree-1');
  await page.getByTestId('tech-btn').click();
  await expect(page.getByTestId('tech-tree')).toBeVisible();
  for (let e = 1; e <= 5; e++) await expect(page.getByTestId('era-' + e)).toBeVisible();
  const lines = await page.locator('.tlines path').count();
  expect(lines).toBeGreaterThan(30);
  await expect(page.getByTestId('tech-firearms')).toHaveClass(/locked/);
  await expect(page.getByTestId('tech-firearms')).toContainText('needs');
  await expect(page.getByTestId('tech-mining')).toHaveClass(/ready/);
  await page.getByTestId('tech-mining').hover();
  await expect(page.locator('.tlines path.hl')).toHaveCount(0); // mining has no prerequisites
  await page.getByTestId('tech-bronze').hover();
  await expect(page.locator('.tlines path.hl')).toHaveCount(1);
  await page.getByTestId('research-mining').click();
  await page.waitForFunction(() => (window as any).__game.state().me.researching === 'mining', null, { timeout: 20_000 });
  await expect(page.getByTestId('tech-mining')).toHaveClass(/busy/);
  await expect(page.getByTestId('branch-Tidewalkers')).toBeVisible();
  await expect(page.getByTestId('branch-Abyssal')).toBeVisible();
  await shot(page, 'tree');
  await page.evaluate(() => (window as any).__game.setSpeed('veryFast'));
  await page.waitForFunction(() => (window as any).__game.state().me.researched.includes('mining'), null, { timeout: 120_000 });
  await expect(page.getByTestId('tech-mining')).toHaveClass(/done/);
  await expect(page.getByTestId('tech-bronze')).toHaveClass(/ready/);
  console.log(`[F-206] tree: 5 eras, ${lines} prerequisite lines, Gunpowder locked, Mining researched from the panel (ready → busy → done), Bronze unlocked; Deepkin branches shown`);
});
