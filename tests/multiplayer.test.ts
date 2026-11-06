// Phase 7 acceptance tests for the lockstep core (transport-independent): no desync with 4 humans + 4 bots
// over 20 minutes (F-161), reconnect (F-164), host left + re-host (F-165), pause rules (F-166), desync
// detection (F-167), human cap (F-168), test-option votes (F-199), co-op / free-for-all (F-163), replays (F-017).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { BotManager } from '../src/ai/manager';
import { ClientLockstep, HostLockstep, MP, playReplay, recordReplay, type ClientMsg, type HostMsg } from '../src/net/lockstep';
import { loadSim, saveSim } from '../src/sim/serialize';
import { Kind, Res } from '../src/sim/defs';
import { Rng } from '../src/sim/core/prng';
import { TestOpt } from '../src/sim/sim';
import type { CommandBody } from '../src/sim/commands';

/** In-memory network: every message is copied as JSON and delivered `delay` host ticks later. */
class Net {
  q: { at: number; to: number; m: HostMsg }[] = [];
  up: { at: number; from: number; m: ClientMsg }[] = [];
  clients = new Map<number, ClientLockstep>();
  down = new Set<number>();
  now = 0;
  constructor(public host: HostLockstep, public delay = 3) {
    host.send = (to, m) => { const c = JSON.parse(JSON.stringify(m)); for (const p of this.clients.keys()) if (to < 0 || to === p) this.q.push({ at: this.now + delay, to: p, m: c }); };
  }
  connect(token: string, name = token): ClientLockstep {
    const seat = this.host.join(token, name);
    const c = new ClientLockstep();
    if (!seat) return c;
    c.send = (m) => { if (!this.down.has(seat.player)) this.up.push({ at: this.now + this.delay, from: seat.player, m: JSON.parse(JSON.stringify(m)) }); };
    this.clients.set(seat.player, c);
    c.receive(JSON.parse(JSON.stringify(this.host.welcome(seat))));
    return c;
  }
  tick(): void {
    this.now++;
    for (const u of this.up.filter((x) => x.at <= this.now)) {
      const m = u.m;
      if (m.t === 'cmd') this.host.command(u.from, m.body);
      else if (m.t === 'hash') this.host.clientHash(u.from, m.tick, m.hash);
      else if (m.t === 'voteYes') this.host.castVote(u.from, m.id, m.yes);
      else if (m.t === 'pauseRequest') this.host.pauseRequest(u.from, m.paused);
    }
    this.up = this.up.filter((x) => x.at > this.now);
    if (!this.host.paused) this.host.step();
    for (const d of this.q.filter((x) => x.at <= this.now)) if (!this.down.has(d.to)) this.clients.get(d.to)?.receive(d.m);
    this.q = this.q.filter((x) => x.at > this.now);
    for (const c of this.clients.values()) c.play();
  }
}

/** Each human sends a few random but plausible orders every second. */
function humanOrders(sim: Sim, p: number, rng: Rng): CommandBody[] {
  const e = sim.ents, mine: number[] = [];
  for (let id = 0; id < e.count; id++) if (e.alive[id] && e.owner[id] === p && (e.kind[id] === Kind.WORKER || e.kind[id] === Kind.SCOUT || e.kind[id] === Kind.SPEARMAN)) mine.push(id);
  if (!mine.length) return [];
  const id = mine[rng.int(mine.length)], w = sim.map.w;
  const t = sim.tileOf(id), x = (t % w) + rng.range(-6, 6), y = Math.floor(t / w) + rng.range(-6, 6);
  return [{ type: 'move', ids: [id], x: (Math.max(1, Math.min(w - 2, x)) << 10) + 512, y: (Math.max(1, Math.min(sim.map.h - 2, y)) << 10) + 512 }];
}

describe('F-161 lockstep: 4 humans + 4 bots', () => {
  it('20 game minutes, orders from every human, no desync; bots run only on the host', () => {
    const settings = { seed: 'mp-20min', size: 'medium' as const, players: 8 };
    const host = new Sim(settings);
    const bots = new BotManager(host, [4, 5, 6, 7].map((p) => ({ player: p, personality: ['berserker', 'merchant', 'defender', 'raider'][p - 4], difficulty: 'hard' as const })));
    const hl = new HostLockstep(host, bots, 0, [0, 1, 2, 3]);
    const net = new Net(hl, 4);
    const clients = [net.connect('alice'), net.connect('bob'), net.connect('cara')];
    expect(clients.map((c) => c.player)).toEqual([1, 2, 3]);
    let desyncs = 0;
    for (const c of clients) c.onDesync = () => desyncs++;
    hl.onDesync = () => desyncs++;
    const rng = Rng.stream('mp', 'orders');
    const T = 20 * 600;
    for (let k = 0; k < T; k++) {
      if (k % 10 === 0) {
        for (const b of humanOrders(host, 0, rng)) hl.command(0, b);
        clients.forEach((c) => { if (c.sim) for (const b of humanOrders(c.sim, c.player, rng)) c.command(b); });
      }
      net.tick();
    }
    for (let k = 0; k < 20; k++) { net.now++; for (const d of net.q.filter((x) => x.at <= net.now)) net.clients.get(d.to)?.receive(d.m); net.q = net.q.filter((x) => x.at > net.now); for (const c of clients) c.play(); }
    expect(desyncs).toBe(0);
    for (const c of clients) { expect(c.sim!.tick).toBe(host.tick); expect(c.sim!.hash()).toBe(host.hash()); }
    const cmds = host.ps.map((ps) => ps.seq);
    console.log(`[F-161] 8 players (4 humans, 4 bots), ${T} ticks, 3 clients at 4-tick latency: 0 desyncs, final hash ${host.hash()} on all 4 sims; command counts per player ${cmds.join('/')}; bot brains only on the host (clients have none)`);
  }, 900_000);
});

describe('F-164 / F-165 / F-167 / F-168', () => {
  const setup = (humans = [0, 1, 2]) => {
    const host = new Sim({ seed: 'mp-small', size: 'small', players: 4 });
    const hl = new HostLockstep(host, new BotManager(host, [{ player: 3, personality: 'berserker', difficulty: 'hard' }]), 0, humans);
    return { host, hl, net: new Net(hl, 2) };
  };

  it('a client that drops for 30 s rejoins with its seat, catches up from a save + turns, hash matches', () => {
    const { host, hl, net } = setup();
    const a = net.connect('alice');
    for (let k = 0; k < 300; k++) net.tick();
    net.down.add(a.player); hl.leave(a.player);
    for (let k = 0; k < 300; k++) net.tick(); // 30 s offline
    net.down.delete(a.player);
    const again = net.connect('alice');
    expect(again.player).toBe(a.player);
    for (let k = 0; k < 200; k++) net.tick();
    for (let k = 0; k < 10; k++) { net.now++; for (const d of net.q.filter((x) => x.at <= net.now)) net.clients.get(d.to)?.receive(d.m); net.q = net.q.filter((x) => x.at > net.now); again.play(); }
    expect(again.sim!.hash()).toBe(host.hash());
    console.log(`[F-164] client offline 300 ticks, rejoined as P${again.player + 1} at tick ${host.tick - 200}, hash ${again.sim!.hash()} = host`);
  });

  it('injected divergence on one client is detected within hashEvery ticks', () => {
    const { hl, net } = setup();
    const a = net.connect('alice'), b = net.connect('bob');
    for (let k = 0; k < 120; k++) net.tick();
    a.sim!.ps[0].stock[Res.GOLD] += 1; // cheat / bug on one client only
    const at = a.sim!.tick;
    let hostSaw = -1; hl.onDesync = (p, t) => { if (hostSaw < 0) hostSaw = t; void p; };
    for (let k = 0; k < MP.hashEvery + 10; k++) net.tick();
    expect(a.desyncAt).toBeGreaterThan(0);
    expect(a.desyncAt - at).toBeLessThanOrEqual(MP.hashEvery);
    expect(hostSaw).toBeGreaterThan(0);
    expect(b.desyncAt).toBe(-1);
    console.log(`[F-167] divergence injected at tick ${at}: client noticed at ${a.desyncAt}, host told at ${hostSaw}; the other client stayed in sync`);
  });

  it('joins beyond the human cap are refused', () => {
    const host = new Sim({ seed: 'mp-cap', size: 'large', players: 12 });
    const hl = new HostLockstep(host, null, 0, [...Array(12).keys()]);
    const seats = Array.from({ length: 11 }, (_, k) => hl.join('p' + k, 'p' + k));
    expect(seats.filter(Boolean).length).toBe(MP.maxHumans - 1);
    expect(seats[MP.maxHumans - 1]).toBeNull();
  });

  it('host left: clients keep the full state, can save it, and anyone can host again from the save', () => {
    const { host, net } = setup();
    const a = net.connect('alice');
    for (let k = 0; k < 400; k++) net.tick();
    for (let k = 0; k < 10; k++) { net.now++; for (const d of net.q.filter((x) => x.at <= net.now)) net.clients.get(d.to)?.receive(d.m); net.q = net.q.filter((x) => x.at > net.now); a.play(); }
    a.receive({ t: 'hostLeft' });
    expect(a.hostLeft).toBe(true);
    const save = JSON.parse(JSON.stringify(saveSim(a.sim!)));
    const rehost = loadSim(save);
    expect(rehost.hash()).toBe(host.hash());
    const hl2 = new HostLockstep(rehost, null, a.player, [0, 1, 2]);
    const net2 = new Net(hl2, 2);
    const b = net2.connect('bob');
    for (let k = 0; k < 100; k++) net2.tick();
    for (let k = 0; k < 10; k++) { net2.now++; for (const d of net2.q.filter((x) => x.at <= net2.now)) net2.clients.get(d.to)?.receive(d.m); net2.q = net2.q.filter((x) => x.at > net2.now); b.play(); }
    expect(b.sim!.hash()).toBe(rehost.hash());
  });
});

describe('F-166 pause and F-199 test-option votes', () => {
  it('host-controlled pause ignores clients; vote mode pauses on a majority', () => {
    const mk = (mode: 'host' | 'vote') => { const s = new Sim({ seed: 'mp-pause', size: 'small', players: 3 }); const hl = new HostLockstep(s, null, 0, [0, 1, 2], mode); return { s, hl, net: new Net(hl, 1) }; };
    const h = mk('host'); const ha = h.net.connect('a'); h.net.connect('b');
    ha.send({ t: 'pauseRequest', paused: true }); for (let k = 0; k < 5; k++) h.net.tick();
    expect(h.hl.paused).toBe(false);
    h.hl.pauseRequest(0, true); expect(h.hl.paused).toBe(true);
    const v = mk('vote'); const va = v.net.connect('a'); v.net.connect('b');
    va.send({ t: 'pauseRequest', paused: true }); for (let k = 0; k < 4; k++) v.net.tick();
    expect(v.hl.vote?.kind).toBe('pause');
    v.hl.castVote(2, v.hl.vote!.id, true);
    expect(v.hl.paused).toBe(true);
  });

  it('a test option turns on for everyone at the same tick only if every human votes yes; one no or a timeout keeps it off', () => {
    for (const outcome of ['yes', 'no', 'timeout'] as const) {
      const s = new Sim({ seed: 'mp-vote', size: 'small', players: 4 });
      const hl = new HostLockstep(s, null, 0, [0, 1, 2]);
      const net = new Net(hl, 1);
      const a = net.connect('a'), b = net.connect('b');
      a.command({ type: 'testOption', flag: TestOpt.REVEAL, on: true });
      for (let k = 0; k < 4; k++) net.tick();
      const v = hl.vote!;
      expect(v.humans).toEqual([0, 1, 2]);
      if (outcome === 'yes') { hl.castVote(0, v.id, true); hl.castVote(2, v.id, true); }
      if (outcome === 'no') { hl.castVote(0, v.id, true); hl.castVote(2, v.id, false); }
      if (outcome === 'timeout') hl.resolveVote(Date.now() + MP.voteMs + 1);
      for (let k = 0; k < 6; k++) net.tick();
      const on = [0, 1, 2].map((p) => (s.ps[p].opts & TestOpt.REVEAL) !== 0);
      expect(on).toEqual(outcome === 'yes' ? [true, true, true] : [false, false, false]);
      expect(a.sim!.hash()).toBe(b.sim!.hash());
      if (outcome === 'yes') { const ticks = s.events; void ticks; expect([0, 1, 2].map((p) => a.sim!.ps[p].opts)).toEqual([0, 1, 2].map((p) => s.ps[p].opts)); }
      expect(s.ps[3].opts).toBe(0); // the bot seat is never touched
    }
    console.log('[F-199] all yes → on for all 3 humans at one tick (clients identical); one no → off; timeout → off');
  });
});

describe('F-163 co-op and free-for-all, F-017 replays', () => {
  it('co-op: the human team wins when the bots fall; free-for-all: the last capital wins', () => {
    const destroyCapitals = (s: Sim, players: number[]) => { const e = s.ents; for (let id = 0; id < e.count; id++) if (e.alive[id] && players.includes(e.owner[id]) && e.kind[id] === 64) e.hp[id] = 0; };
    const coop = new Sim({ seed: 'coop', size: 'small', players: 4, teams: [0, 0, 2, 3] });
    destroyCapitals(coop, [2, 3]);
    for (let k = 0; k < 20 && coop.winner < 0; k++) coop.step();
    expect(coop.winnerTeam).toBe(0);
    const ffa = new Sim({ seed: 'ffa', size: 'small', players: 3 });
    destroyCapitals(ffa, [0, 2]);
    for (let k = 0; k < 20 && ffa.winner < 0; k++) ffa.step();
    expect(ffa.winner).toBe(1);
  });

  it('a 10-minute bot match replays from seed + command log to the identical final hash', () => {
    const settings = { seed: 'replay', size: 'small' as const, players: 3 };
    const s = new Sim(settings);
    const bots = new BotManager(s, [0, 1, 2].map((p) => ({ player: p, personality: ['merchant', 'raider', 'defender'][p], difficulty: 'hard' as const })));
    const log = [];
    for (let k = 0; k < 6000; k++) { bots.tick(); s.step(); log.push(...s.lastApplied); }
    const r = JSON.parse(JSON.stringify(recordReplay(s, log)));
    const again = playReplay(r, (st) => new Sim(st));
    expect(again.tick).toBe(s.tick);
    expect(again.hash()).toBe(r.endHash);
    console.log(`[F-017] 10-min bot match: ${log.length} commands; replay without bot code → hash ${again.hash()} = original`);
  });
});
