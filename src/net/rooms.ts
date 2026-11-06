// Room codes (owner request: "do the invite system like" a friend's game): the host opens a room with
// a short code; guests type the code (or open a ?room= link) and connect straight away. A public
// PeerJS server only introduces the browsers to each other (it sees connection details such as IP
// addresses, never game data); the game itself still flows browser to browser. PeerJS is loaded only
// when you host or join, so single-player stays fully offline (F-006).
import type { DataConnection, Peer as PeerT, PeerError } from 'peerjs';
import { TUNING } from '../sim/core/tuning';

const PREFIX = 'fortnight-v1-';
/** No 0/O or 1/I: easy to read out loud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LEN = 5;

const ICE: RTCIceServer[] = [
  ...TUNING.multiplayer.iceServers.map((u) => ({ urls: u })),
  // PeerJS's free public relay, for networks where a direct connection fails
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
];

export const makeRoomCode = (): string => Array.from({ length: ROOM_CODE_LEN }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); // UI only, never in the sim
/** Normalise what a player typed or pasted: a code, or a link with ?room=. Empty if it isn't one. */
export function roomCodeFrom(text: string): string {
  let t = text.trim();
  try { if (t.includes('room=')) t = new URL(t).searchParams.get('room') ?? t; } catch { /* not a link */ }
  t = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return t.length >= 4 && t.length <= 8 ? t : '';
}

function explain(e: unknown): string {
  const type = (e as PeerError<string> | undefined)?.type;
  if (type === 'peer-unavailable') return 'No game with this code was found. Check the code (the host must have the game open).';
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return 'No connection to the matchmaking service. Check your internet connection.';
  if (type === 'browser-incompatible') return 'This browser does not support online play.';
  return (e as Error | undefined)?.message || 'Connection error.';
}

async function openPeer(id?: string): Promise<PeerT> {
  const { Peer } = await import('peerjs');
  const peer = id ? new Peer(id, { config: { iceServers: ICE } }) : new Peer({ config: { iceServers: ICE } });
  return new Promise<PeerT>((res, rej) => {
    const fail = (e: unknown): void => { peer.destroy(); rej(e); };
    peer.once('open', () => { peer.off('error', fail); res(peer); });
    peer.once('error', fail);
  });
}

/** Host: open a room (a few tries in case a code is taken). Guests arrive through `onGuest`. */
export async function openRoom(onGuest: (conn: DataConnection) => void): Promise<{ code: string; peer: PeerT }> {
  let last: unknown = null;
  for (let k = 0; k < 4; k++) {
    const code = makeRoomCode();
    try {
      const peer = await openPeer(PREFIX + code);
      peer.on('connection', (conn) => conn.on('open', () => onGuest(conn)));
      peer.on('error', (e) => { if (e.type !== 'peer-unavailable') console.warn('PeerJS', e.type); });
      return { code, peer };
    } catch (e) {
      last = e;
      if ((e as PeerError<string>).type !== 'unavailable-id') break; // code taken: try another
    }
  }
  throw new Error(explain(last));
}

/** Guest: connect to a room by code. */
export async function joinRoom(code: string, timeoutMs = 20000): Promise<{ conn: DataConnection; peer: PeerT }> {
  let peer: PeerT;
  try { peer = await openPeer(); } catch (e) { throw new Error(explain(e)); }
  return new Promise((res, rej) => {
    const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
    const timer = setTimeout(() => { peer.destroy(); rej(new Error('The host does not answer. Check the code, or try another network.')); }, timeoutMs);
    conn.once('open', () => { clearTimeout(timer); res({ conn, peer }); });
    const fail = (e: unknown): void => { clearTimeout(timer); peer.destroy(); rej(new Error(explain(e))); };
    peer.once('error', fail);
    conn.once('error', fail);
  });
}
