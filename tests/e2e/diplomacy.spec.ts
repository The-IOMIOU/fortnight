// Phase 6 UI: diplomacy panel, offers to a bot and chat with a reply (F-150, F-151, F-152).
import { expect, test } from '@playwright/test';
import { openGame, state } from './helpers';

test('F-150 / F-151 diplomacy panel: gift a bot, chat with it, it answers', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page, 'dip-ui', 'small', '&bots=1&difficulty=hard&personality=merchant');
  await page.getByTestId('dip-btn').click();
  await expect(page.getByTestId('dip-panel')).toBeVisible();
  await expect(page.getByTestId('rel-1')).toHaveText('war');
  // a gift: the merchant accepts it
  await page.getByTestId('deal-amount').fill('50');
  await page.getByTestId('deal-res').selectOption('0');
  const food0 = (await state(page)).stats.stock[0];
  await page.getByTestId('gift-1').click();
  await page.waitForFunction((f) => (window as any).__game.state().stats.stock[0] <= f - 40, food0, { timeout: 30_000 });
  // chat: the bot replies
  await page.getByTestId('chat-to').selectOption('1');
  await page.getByTestId('chat-input').fill('hello friend');
  await page.getByTestId('chat-send').click();
  await page.waitForFunction(() => (window as any).__game.state().dip.chat.some((m: any) => m.from === 1 && m.to === 0), null, { timeout: 30_000 });
  await expect(page.getByTestId('chat-log')).toContainText('hello friend');
  const reply = (await state(page)).dip.chat.find((m: any) => m.from === 1).text;
  // mute hides the bot's lines
  await page.getByTestId('mute-1').click();
  await expect(page.getByTestId('chat-log')).not.toContainText(reply);
  console.log(`[F-150] gift of 50 food accepted by the merchant bot; chat reply: "${reply}"; mute hid it`);
});
