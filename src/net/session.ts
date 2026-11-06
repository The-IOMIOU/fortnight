// Main-thread side of multiplayer: holds the WebRTC links and relays messages between them and the sim
// worker. Host: one link per guest (peer ids 1, 2, …). Guest: a single link to the host (peer 0).
import { acceptInvite, createInvite, fromDataChannel, fromPeerConnection, Wire, type Channel } from './peer';
import { joinRoom, openRoom } from './rooms';
import type { Peer as PeerT } from 'peerjs';

export interface Invite { peer: number; code: string; complete: (answer: string) => Promise<void>; state: 'waiting' | 'connected' | 'closed' | 'failed' }

export class NetSession {
  private wires = new Map<number, Wire>();
  readonly invites: Invite[] = [];
  private nextPeer = 1;
  /** Host: the open room's code ('' while opening), or why it could not open. */
  room = { code: '', error: '' };
  private peerjs: PeerT | null = null;
  /** Message from a peer → worker; a peer went away → worker. */
  onMessage: (peer: number, msg: unknown) => void = () => {};
  onGone: (peer: number) => void = () => {};
  onChange: () => void = () => {};

  constructor(readonly role: 'host' | 'guest') {}

  // ---- host
  async invite(): Promise<Invite> {
    const peer = this.nextPeer++;
    const inv = await createInvite();
    const entry: Invite = { peer, code: inv.code, complete: inv.complete, state: 'waiting' };
    this.invites.push(entry);
    inv.channel.then((dc) => { entry.state = 'connected'; this.attach(peer, fromDataChannel(dc)); this.onChange(); }, () => { entry.state = 'failed'; this.onChange(); });
    this.onChange();
    return entry;
  }

  /** Host: open a room; guests who type its code are connected as peers 1, 2, … */
  async openRoom(): Promise<string> {
    try {
      const r = await openRoom((conn) => { this.attach(this.nextPeer++, fromPeerConnection(conn)); this.onChange(); });
      this.peerjs = r.peer; this.room = { code: r.code, error: '' };
    } catch (e) { this.room = { code: '', error: (e as Error).message }; }
    this.onChange();
    return this.room.code;
  }

  /** Guest: connect to a room by its code. */
  async joinRoom(code: string): Promise<void> {
    const r = await joinRoom(code);
    this.peerjs = r.peer;
    this.attach(0, fromPeerConnection(r.conn));
    this.onChange();
  }

  // ---- guest (manual invite fallback)
  async join(code: string): Promise<{ answer: string; open: Promise<void> }> {
    const a = await acceptInvite(code);
    const open = a.channel.then((dc) => { this.attach(0, fromDataChannel(dc)); this.onChange(); });
    return { answer: a.answer, open };
  }

  private attach(peer: number, ch: Channel): void {
    const w = new Wire(ch);
    w.onMessage = (m) => this.onMessage(peer, m);
    w.onClose = () => { this.wires.delete(peer); const inv = this.invites.find((i) => i.peer === peer); if (inv) inv.state = 'closed'; this.onGone(peer); this.onChange(); };
    this.wires.set(peer, w);
  }

  /** Worker → network: peer −1 = everyone. */
  send(peer: number, msg: unknown): void {
    if (peer < 0) for (const w of this.wires.values()) w.send(msg);
    else this.wires.get(peer)?.send(msg);
  }
  get connections(): number { return this.wires.size; }
  close(): void {
    for (const w of this.wires.values()) { if (this.role === 'host') w.send({ t: 'hostLeft' }); w.close(); }
    this.wires.clear();
    const p = this.peerjs; this.peerjs = null;
    if (p) setTimeout(() => p.destroy(), 300); // let the goodbye go out first
  }
}

/** A stable per-browser token so a guest gets its seat back after a reconnect (F-164). */
export function netToken(): string {
  try {
    let t = localStorage.getItem('fortnight.netToken');
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('fortnight.netToken', t); } // UI only, never in the sim
    return t;
  } catch { return 'guest-' + Math.random().toString(36).slice(2); }
}
