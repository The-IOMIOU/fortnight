// Phase 7 in real browsers: two pages connect over WebRTC with the manual invite link + answer code (F-160,
// F-162 fallback), play in lockstep without desync (F-161, F-167), chat (F-154), and the guest sees "host left" (F-165).
import { expect, test } from '@playwright/test';

const st = (p: import('@playwright/test').Page): Promise<any> => p.evaluate(() => (window as any).__game.state());

test('F-160 host invites a guest by link + answer code; lockstep without desync; chat; host left', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const host = await ctxA.newPage(), guest = await ctxB.newPage();
  await host.goto('/?menu=new');
  await host.getByTestId('seed').fill('mp-browser');
  await host.getByTestId('online').locator('summary').click();
  await host.getByTestId('online-host').check();
  await host.getByTestId('start').click();
  await host.waitForFunction(() => (window as any).__game?.state().net?.role === 'host', null, { timeout: 60_000 });
  await host.getByTestId('net-btn').click();
  await host.getByTestId('manual-invite').locator('summary').click(); // the manual invite is the fallback now
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

test('Start screen: Multiplayer → Host and Multiplayer → Join game connect two browsers', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const host = await ctxA.newPage(), guest = await ctxB.newPage();
  await host.goto('/');
  await host.getByTestId('home-multiplayer').click();
  await host.getByTestId('mp-host').click();
  await expect(host.getByTestId('online-host')).toBeChecked(); // Host opens New Game with online play on
  await host.getByTestId('seed').fill('mp-home');
  await host.getByTestId('start').click();
  await host.waitForFunction(() => (window as any).__game?.state().net?.role === 'host', null, { timeout: 60_000 });
  await host.getByTestId('net-btn').click();
  await host.getByTestId('manual-invite').locator('summary').click(); // the manual invite is the fallback now
  await host.getByTestId('net-invite').click();
  const link = await host.getByTestId('invite-link-1').inputValue({ timeout: 20_000 });
  // the guest pastes the link into the Join game screen
  await guest.goto('/');
  await guest.getByTestId('home-multiplayer').click();
  await expect(guest.getByTestId('mp-join')).toBeDisabled();
  await guest.getByTestId('mp-code').fill(link);
  await guest.getByTestId('mp-name').fill('Robin');
  await guest.getByTestId('mp-join').click();
  const answer = await guest.getByTestId('join-answer').inputValue({ timeout: 20_000 });
  await host.getByTestId('invite-answer-1').fill(answer);
  await host.getByTestId('invite-connect-1').click();
  await guest.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await host.waitForFunction(() => (window as any).__game.state().net.seats.some((s: any) => s.connected && s.name === 'Robin'), null, { timeout: 20_000 });
  console.log('[home] guest joined from the start screen\'s Join game form (name Robin) and the host saw the seat connect');
  await ctxA.close(); await ctxB.close();
});

test('F-162 room codes (like the friend\'s game): host gets a code, the guest types it and is in, no answer code', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext();
  const host = await ctxA.newPage(), guest = await ctxB.newPage();
  await host.goto('/');
  await host.getByTestId('home-multiplayer').click();
  await host.getByTestId('mp-host').click();
  await host.getByTestId('seed').fill('mp-room');
  await host.getByTestId('start').click();
  await host.waitForFunction(() => (window as any).__game?.state().net?.role === 'host', null, { timeout: 60_000 });
  await host.getByTestId('net-btn').click();
  const code = (await host.getByTestId('room-code').innerText({ timeout: 30_000 })).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  await expect(host.getByTestId('net-btn')).toContainText(code);
  // the guest types the code (lower case and with a space, as people do)
  await guest.goto('/');
  await guest.getByTestId('home-multiplayer').click();
  await guest.getByTestId('mp-code').fill(code.toLowerCase().slice(0, 2) + ' ' + code.slice(2));
  await guest.getByTestId('mp-name').fill('Robin');
  await guest.getByTestId('mp-join').click();
  await guest.waitForFunction(() => (window as any).__game?.state().screen === 'game', null, { timeout: 60_000 });
  await host.waitForFunction(() => (window as any).__game.state().net.seats.some((s: any) => s.connected && s.name === 'Robin'), null, { timeout: 30_000 });
  const t0 = await guest.evaluate(() => (window as any).__game.state().tick);
  await guest.waitForTimeout(3000);
  const t1 = await guest.evaluate(() => (window as any).__game.state().tick);
  // a ?room= link joins directly too
  const ctxC = await browser.newContext(), third = await ctxC.newPage();
  await third.goto(`/?room=${code}`);
  await expect(third.getByTestId('join-room-wait')).toBeVisible();
  console.log(`[F-162] room ${code}: guest typed it and joined as Robin, ${t1 - t0} lockstep ticks in 3 s; ?room= link opens the room join`);
  expect(t1).toBeGreaterThan(t0);
  await ctxA.close(); await ctxB.close(); await ctxC.close();
});

test('F-162 a wrong room code gives a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('home-multiplayer').click();
  await page.getByTestId('mp-code').fill('ZZZZ9');
  await page.getByTestId('mp-join').click();
  await expect(page.getByTestId('mp-error')).toContainText(/No game with this code|matchmaking|does not answer/, { timeout: 40_000 });
  console.log(`[F-162] wrong code: "${await page.getByTestId('mp-error').innerText()}"`);
});
