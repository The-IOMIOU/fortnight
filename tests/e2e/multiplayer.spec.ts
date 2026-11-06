// Phase 7 in real browsers: two pages connect over WebRTC with the manual invite link + answer code (F-160,
// F-162 fallback), play in lockstep without desync (F-161, F-167), chat (F-154), and the guest sees "host left" (F-165).
import { expect, test } from '@playwright/test';

const st = (p: import('@playwright/test').Page): Promise<any> => p.evaluate(() => (window as any).__game.state());

test('F-160 host invites a guest by link + answer code; lockstep without desync; chat; host left', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const host = await ctxA.newPage(), guest = await ctxB.newPage();
  await host.goto('/');
  await host.getByTestId('seed').fill('mp-browser');
  await host.getByTestId('online').locator('summary').click();
  await host.getByTestId('online-host').check();
  await host.getByTestId('start').click();
  await host.waitForFunction(() => (window as any).__game?.state().net?.role === 'host', null, { timeout: 60_000 });
  await host.getByTestId('net-btn').click();
  await host.getByTestId('net-invite').click();
  const link = await host.getByTestId('invite-link-1').inputValue({ timeout: 20_000 });
  expect(link).toContain('join=');
  await guest.goto(link);
  const answer = await guest.getByTestId('join-answer').inputValue({ timeout: 20_000 });
  await host.getByTestId('invite-answer-1').fill(answer);
  await host.getByTestId('invite-connect-1').click();
  await guest.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  const g0 = await st(guest);
  expect(g0.net.role).toBe('client');
  expect(g0.me).not.toBeNull();
  await host.waitForFunction(() => (window as any).__game.state().net.seats.some((s: any) => s.connected), null, { timeout: 20_000 });
  // play on: the guest follows the host's turns and reports hashes; no desync
  const t0 = (await st(guest)).tick;
  await guest.waitForFunction((t) => (window as any).__game.state().tick > t + 150, t0, { timeout: 60_000 });
  const g1 = await st(guest), h1 = await st(host);
  expect(g1.net.desyncAt).toBe(-1);
  expect(h1.tick - g1.tick).toBeLessThan(40);
  // chat from the guest reaches the host (commands travel guest → host → everyone)
  await guest.evaluate(() => (window as any).__game.cmd({ type: 'chat', to: -1, text: 'hi from the guest' }));
  await host.waitForFunction(() => (window as any).__game.state().dip.chat.some((m: any) => m.text === 'hi from the guest'), null, { timeout: 20_000 });
  const peers = await host.evaluate(() => (window as any).__game.game.net.connections);
  expect(peers).toBe(1); // star topology: one connection per human guest
  // the host leaves
  await host.close();
  await guest.waitForFunction(() => (window as any).__game.state().net?.hostLeft, null, { timeout: 30_000 });
  await expect(guest.getByTestId('host-left')).toBeVisible();
  console.log(`[F-160] guest joined by link + answer code as P${g0.me ? '' : '?'}${(await guest.evaluate(() => (window as any).__game.game.viewer)) + 1}; ${g1.tick - t0} lockstep ticks with no desync (host ${h1.tick - g1.tick} ticks ahead); chat delivered; host connections ${peers}; "host left" shown`);
  await ctxA.close(); await ctxB.close();
});
