// WebRTC data channels with manual signaling (F-162 fallback that always works, no server): the host makes an
// invite (an SDP offer with all ICE candidates, gzip + base64url) that travels as a link; the guest answers with
// a code the host pastes. Star topology: every guest connects only to the host (F-160).
import { TUNING } from '../sim/core/tuning';

const ICE: RTCIceServer[] = TUNING.multiplayer.iceServers.map((u) => ({ urls: u }));

async function pack(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out: Uint8Array = bytes;
  if (typeof CompressionStream !== 'undefined') out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let s = '';
  for (const b of out) s += String.fromCharCode(b);
  return (typeof CompressionStream !== 'undefined' ? 'z' : 'p') + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack<T>(code: string): Promise<T> {
  const kind = code[0], b64 = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (kind === 'z') bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
function gathered(pc: RTCPeerConnection, ms = 4000): Promise<void> {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const done = (): void => { if (pc.iceGatheringState === 'complete') res(); };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, ms); // use what we have
  });
}

export interface PeerLink { pc: RTCPeerConnection; channel: Promise<RTCDataChannel> }

/** Host: a new invite for one guest. Returns the code (put it in a link) and a function that takes the guest's answer. */
export async function createInvite(): Promise<PeerLink & { code: string; complete: (answer: string) => Promise<void> }> {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel('fortnight', { ordered: true });
  const channel = new Promise<RTCDataChannel>((res, rej) => { dc.onopen = () => res(dc); pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') rej(new Error('connection failed')); }; });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const code = await pack({ v: 1, sdp: pc.localDescription!.sdp });
  return { pc, channel, code, complete: async (answer: string) => { const a = await unpack<{ sdp: string }>(answer.trim()); await pc.setRemoteDescription({ type: 'answer', sdp: a.sdp }); } };
}

/** Guest: accept an invite code; returns the answer code to send back to the host. */
export async function acceptInvite(code: string): Promise<PeerLink & { answer: string }> {
  const o = await unpack<{ v: number; sdp: string }>(code.trim());
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const channel = new Promise<RTCDataChannel>((res, rej) => {
    pc.ondatachannel = (ev) => { const dc = ev.channel; if (dc.readyState === 'open') res(dc); else dc.onopen = () => res(dc); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') rej(new Error('connection failed')); };
  });
  await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { pc, channel, answer: await pack({ v: 1, sdp: pc.localDescription!.sdp }) };
}

/** The bits of a connection the wire needs: a raw WebRTC data channel (manual invites) or a PeerJS
 *  data connection in raw mode (room codes). */
export interface Channel {
  isOpen(): boolean;
  send(s: string): void;
  close(): void;
  listen(onData: (s: string) => void, onClose: () => void): void;
}
export function fromDataChannel(dc: RTCDataChannel): Channel {
  return {
    isOpen: () => dc.readyState === 'open',
    send: (x) => dc.send(x),
    close: () => dc.close(),
    listen: (onData, onClose) => { dc.onmessage = (ev) => onData(String(ev.data)); dc.onclose = onClose; },
  };
}
export function fromPeerConnection(conn: { open: boolean; send(d: unknown): void; close(): void; on(ev: string, f: (d?: unknown) => void): unknown }): Channel {
  return {
    isOpen: () => conn.open,
    send: (x) => conn.send(x),
    close: () => conn.close(),
    listen: (onData, onClose) => { conn.on('data', (d) => onData(String(d))); conn.on('close', onClose); conn.on('error', onClose); },
  };
}

/** JSON messages over a channel, split into chunks (saves are large; channels cap message size). */
export class Wire {
  private parts: string[] = [];
  onMessage: (m: unknown) => void = () => {};
  onClose: () => void = () => {};
  private closed = false;
  constructor(readonly ch: Channel) {
    ch.listen((s) => {
      if (s[0] === '+') { this.parts.push(s.slice(1)); return; }
      const whole = this.parts.join('') + s.slice(1);
      this.parts = [];
      try { this.onMessage(JSON.parse(whole)); } catch { /* ignore a broken message */ }
    }, () => { if (!this.closed) { this.closed = true; this.onClose(); } });
  }
  send(m: unknown): void {
    if (!this.ch.isOpen()) return;
    const s = JSON.stringify(m), CH = 16000;
    for (let i = 0; i < s.length; i += CH) this.ch.send((i + CH < s.length ? '+' : '.') + s.slice(i, i + CH));
    if (!s.length) this.ch.send('.');
  }
  close(): void { try { this.ch.close(); } catch { /* already closed */ } }
}
