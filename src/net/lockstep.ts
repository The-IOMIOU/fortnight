// Host-ordered deterministic lockstep (PLAN §4, F-161), independent of the transport (WebRTC in the browser,
// direct calls in tests). The host runs the sim and ALL bots; after each tick it sends the commands the sim
// applied in that tick (a "turn"). Clients run the same sim, one turn at a time, a little behind the host,
// so no rollback is ever needed. Clients send their orders to the host, which stamps them for its next tick.
// Every `hashEvery` ticks the host adds its state hash to the turn; clients compare (desync detection, F-167).
import { TUNING } from '../sim/core/tuning';
import type { Sim } from '../sim/sim';
import type { Command, CommandBody } from '../sim/commands';
import type { BotManager } from '../ai/manager';
import { saveSim, loadSim, type SaveData } from '../sim/serialize';

export const MP = TUNING.multiplayer;

export interface Turn { tick: number; cmds: Command[]; hash?: number }

/** Messages on the wire (JSON). */
export type HostMsg =
  | { t: 'welcome'; player: number; save: SaveData; turns: Turn[] }
  | { t: 'turn'; turn: Turn }
  | { t: 'full'; reason: string }
  | { t: 'vote'; vote: VoteInfo | null }
  | { t: 'paused'; paused: boolean; by: number }
  | { t: 'hostLeft' }
  | { t: 'desync'; player: number; tick: number };
export type ClientMsg =
  | { t: 'hello'; name: string; token: string }
  | { t: 'cmd'; body: CommandBody }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'voteYes'; id: number; yes: boolean }
  | { t: 'pauseRequest'; paused: boolean };

export interface VoteInfo { id: number; kind: 'testOption' | 'pause'; flag: number; on: boolean; by: number; yes: number[]; no: number[]; deadline: number; humans: number[] }

/** One human seat: who sits there (token) and whether they are connected. */
export interface Seat { player: number; token: string; name: string; connected: boolean }

export class HostLockstep {
  /** Turns kept for clients that (re)join: the last `MP.keepTurns`. */
  private history: Turn[] = [];
  readonly seats: Seat[] = [];
  vote: VoteInfo | null = null;
  private nextVote = 1;
  paused = false;
  /** Called for every message to every client (or one client when `to` ≥ 0). */
  send: (to: number, m: HostMsg) => void = () => {};
  onDesync: (player: number, tick: number) => void = () => {};

  constructor(public sim: Sim, public bots: BotManager | null, readonly hostPlayer: number, humanSlots: number[], readonly pauseMode: 'host' | 'vote' = 'host') {
    for (const p of humanSlots) if (p !== hostPlayer) this.seats.push({ player: p, token: '', name: '', connected: false });
  }

  get humans(): number[] { return [this.hostPlayer, ...this.seats.filter((s) => s.token).map((s) => s.player)]; }

  /** A peer says hello. Returns the seat (reconnects keep theirs) or null when the game is full (F-168). */
  join(token: string, name: string): Seat | null {
    let seat = this.seats.find((s) => s.token === token) ?? null;
    if (!seat) {
      if (this.humans.length >= MP.maxHumans) return null;
      seat = this.seats.find((s) => !s.token) ?? null;
      if (!seat) return null;
      seat.token = token; seat.name = name;
    }
    seat.connected = true;
    return seat;
  }
  /** Full state for a joining / reconnecting peer: a save plus nothing else (turns follow live). */
  welcome(seat: Seat, extra?: unknown): HostMsg {
    const save = saveSim(this.sim);
    if (extra !== undefined) save.extra = extra;
    return { t: 'welcome', player: seat.player, save, turns: [] };
  }
  leave(player: number): void { const s = this.seats.find((x) => x.player === player); if (s) s.connected = false; }

  /** A command from a peer (or the host's own UI): runs on the host's next tick. */
  command(player: number, body: CommandBody): void {
    if (body.type === 'testOption') { this.startVote(player, 'testOption', body.flag, body.on); return; }
    const seq = this.sim.ps[player].seq++;
    this.sim.enqueue({ ...body, tick: this.sim.tick, player, seq } as Command);
  }

  /** Test options (F-199) and, in vote mode, pausing need every human (pause: a majority) to say yes before the deadline. */
  startVote(by: number, kind: VoteInfo['kind'], flag: number, on: boolean): void {
    if (this.vote) return;
    const humans = this.humans;
    this.vote = { id: this.nextVote++, kind, flag, on, by, yes: [by], no: [], deadline: Date.now() + MP.voteMs, humans };
    this.resolveVote();
    if (this.vote) this.send(-1, { t: 'vote', vote: this.vote });
  }
  castVote(player: number, id: number, yes: boolean): void {
    const v = this.vote;
    if (!v || v.id !== id || !v.humans.includes(player) || v.yes.includes(player) || v.no.includes(player)) return;
    (yes ? v.yes : v.no).push(player);
    this.resolveVote();
  }
  /** Check the open vote; `now` lets tests drive the deadline. */
  resolveVote(now = Date.now()): void {
    const v = this.vote;
    if (!v) return;
    const need = v.kind === 'pause' ? Math.floor(v.humans.length / 2) + 1 : v.humans.length;
    const passed = v.yes.length >= need;
    const failed = v.no.length > v.humans.length - need || now > v.deadline;
    if (!passed && !failed) return;
    this.vote = null;
    if (passed) {
      if (v.kind === 'testOption') for (const p of v.humans) { const seq = this.sim.ps[p].seq++; this.sim.enqueue({ type: 'testOption', flag: v.flag, on: v.on, tick: this.sim.tick, player: p, seq } as Command); }
      else this.setPaused(v.on, v.by);
    }
    this.send(-1, { t: 'vote', vote: null });
  }

  pauseRequest(player: number, paused: boolean): void {
    if (player === this.hostPlayer || this.pauseMode === 'host') { if (player === this.hostPlayer) this.setPaused(paused, player); return; }
    this.startVote(player, 'pause', 0, paused);
  }
  setPaused(paused: boolean, by: number): void { this.paused = paused; this.send(-1, { t: 'paused', paused, by }); }

  /** Run one host tick: bots think, the sim steps, the turn goes out. */
  step(): Turn {
    if (this.vote) this.resolveVote();
    const tick = this.sim.tick;
    this.bots?.tick();
    this.sim.step();
    const turn: Turn = { tick, cmds: this.sim.lastApplied };
    if ((tick + 1) % MP.hashEvery === 0) turn.hash = this.sim.hash();
    this.history.push(turn);
    if (this.history.length > MP.keepTurns) this.history.shift();
    this.send(-1, { t: 'turn', turn });
    return turn;
  }

  /** A client's hash report: mismatch → desync (F-167). */
  clientHash(player: number, tick: number, hash: number): void {
    const t = this.history.find((x) => x.tick + 1 === tick && x.hash !== undefined);
    if (t && t.hash !== hash) { this.onDesync(player, tick); this.send(-1, { t: 'desync', player, tick }); }
  }
}

export class ClientLockstep {
  sim: Sim | null = null;
  player = -1;
  private buffer: Turn[] = [];
  desyncAt = -1;
  hostLeft = false;
  paused = false;
  vote: VoteInfo | null = null;
  send: (m: ClientMsg) => void = () => {};
  onDesync: (tick: number) => void = () => {};

  receive(m: HostMsg, onWelcome?: (sim: Sim, m: Extract<HostMsg, { t: 'welcome' }>) => void): void {
    switch (m.t) {
      case 'welcome': {
        this.sim = loadSim(m.save); this.player = m.player; this.buffer = m.turns.slice(); this.desyncAt = -1;
        onWelcome?.(this.sim, m);
        break;
      }
      case 'turn': if (this.sim && m.turn.tick >= this.sim.tick) this.buffer.push(m.turn); break;
      case 'vote': this.vote = m.vote; break;
      case 'paused': this.paused = m.paused; break;
      case 'hostLeft': this.hostLeft = true; break;
      case 'desync': if (m.player === this.player && this.desyncAt < 0) this.desyncAt = m.tick; break;
      case 'full': break;
    }
  }

  /** Turns waiting to be played (the client is this many ticks behind the host). */
  get lag(): number { return this.buffer.length; }

  /** Play up to `max` buffered turns in order. Returns how many ticks ran. */
  play(max = MP.maxCatchUpPerCall): number {
    const s = this.sim;
    if (!s) return 0;
    let n = 0;
    while (n < max && this.buffer.length) {
      const t = this.buffer[0];
      if (t.tick < s.tick) { this.buffer.shift(); continue; } // already part of the welcome save
      if (t.tick > s.tick) break; // a gap: wait (should not happen on an ordered channel)
      this.buffer.shift();
      for (const c of t.cmds) s.enqueue({ ...c });
      s.step();
      n++;
      if (t.hash !== undefined) {
        const h = s.hash();
        this.send({ t: 'hash', tick: s.tick, hash: h });
        if (h !== t.hash && this.desyncAt < 0) { this.desyncAt = s.tick; this.onDesync(s.tick); }
      }
    }
    return n;
  }

  /** Orders from this client's UI go to the host, never straight into the local sim. */
  command(body: CommandBody): void { this.send({ t: 'cmd', body }); }
}

/** Replays (F-017): seed + settings + every applied command. Bots never need to run again. */
export interface Replay { format: 'fortnight-replay'; settings: Sim['settings']; cmds: Command[]; endTick: number; endHash: number }
export function recordReplay(sim: Sim, cmds: Command[]): Replay { return { format: 'fortnight-replay', settings: { ...sim.settings }, cmds: cmds.slice(), endTick: sim.tick, endHash: sim.hash() }; }
export function playReplay(r: Replay, make: (settings: Sim['settings']) => Sim, untilTick = r.endTick): Sim {
  const s = make(r.settings);
  for (const c of r.cmds) if (c.tick < untilTick) s.enqueue({ ...c });
  while (s.tick < untilTick && s.winner < 0) s.step();
  return s;
}
export { loadSim };
