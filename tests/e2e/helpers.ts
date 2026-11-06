import type { Page } from '@playwright/test';

/** Open a game directly from a share-style URL and wait until the map is rendered. */
export async function openGame(page: Page, seed: string, size = 'small', extra = ''): Promise<void> {
  await page.goto(`/?seed=${encodeURIComponent(seed)}&size=${size}&play=1${extra}`);
  await page.waitForFunction(() => (window as any).__game && (window as any).__game.state().screen === 'game', null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__game.ready());
}

export const state = (page: Page): Promise<any> => page.evaluate(() => (window as any).__game.state());
