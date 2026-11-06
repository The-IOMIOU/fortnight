// Phase 7 UI: host invites (link + answer code), seats, votes, "host left" and desync notices, guest answer code.
import { useState } from 'preact/hooks';
import type { Game } from '../app/game';
import { store, useStore } from '../app/store';
import { playerLabel } from '../render/palette';

export const joinLink = (code: string): string => { const u = new URL(location.href); u.search = new URLSearchParams({ join: code }).toString(); return u.toString(); };
/** Link that joins a room straight away (F-162). */
export const roomLink = (code: string): string => { const u = new URL(location.href); u.search = new URLSearchParams({ room: code }).toString(); u.hash = ''; return u.toString(); };

export function NetButton() {
  const net = useStore((s) => s.net);
  if (!net || net.role !== 'host') return null;
  const on = net.seats.filter((s) => s.connected).length;
  const room = useStore((s) => s.room);
  return <button onClick={() => store.set({ netOpen: !store.state.netOpen })} data-testid="net-btn" title="Invite friends">Online {on + 1}/{net.seats.length + 1}{room?.code ? ` · ${room.code}` : ''}</button>;
}

export function NetPanel({ game }: { game: Game }) {
  const s = useStore((st) => ({ open: st.netOpen, net: st.net, invites: st.invites, room: st.room }));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  if (!s.open || !s.net) return null;
  const copy = (t: string): void => { void navigator.clipboard?.writeText(t).catch(() => {}); };
  return (
    <div class="modal" data-testid="net-panel"><div class="panel dip-panel">
      <div class="sel-title">Online game <button onClick={() => store.set({ netOpen: false })} aria-label="Close">✕</button></div>
      <div class="room-box" data-testid="room-box">
        {s.room?.code ? <>
          <small>Room code: friends enter it under Multiplayer → Join</small>
          <button class="room-code" title="Click to copy" onClick={() => { copy(s.room!.code); store.set({ toast: 'Code copied' }); setTimeout(() => store.set({ toast: '' }), 1500); }} data-testid="room-code">{s.room.code}</button>
          <button onClick={() => { copy(roomLink(s.room!.code)); store.set({ toast: 'Invite link copied' }); setTimeout(() => store.set({ toast: '' }), 1500); }} data-testid="room-link">Copy invite link</button>
        </> : s.room?.error ? <p class="warn" data-testid="room-error">{s.room.error} You can still use a manual invite below.</p> : <small>Opening a room…</small>}
      </div>
      <p class="sel-sub">The game runs browser to browser. A free PeerJS server only introduces you to each other.</p>
      <table class="dip-table"><tbody>
        <tr><td>{playerLabel(game.viewer)}</td><td>you (host)</td></tr>
        {s.net.seats.map((st) => <tr data-testid={'seat-' + st.player}><td>{playerLabel(st.player)}</td><td>{st.token ? (st.connected ? `connected${st.name ? ` (${st.name})` : ''}` : 'disconnected: they can rejoin with a new invite') : 'free seat'}</td></tr>)}
      </tbody></table>
      <details class="more" data-testid="manual-invite"><summary>No internet matchmaking? Manual invite (link + answer code)</summary>
      <button disabled={busy} onClick={() => { setBusy(true); void game.invite().finally(() => setBusy(false)); }} data-testid="net-invite">{busy ? 'Preparing…' : 'Create invite'}</button>
      {s.invites.map((inv) => (
        <div class="tech-row" data-testid={'invite-' + inv.peer}>
          <div><b>Invite {inv.peer}</b> <small>{inv.state}</small>
            {inv.state === 'waiting' && <>
              <div class="row"><input readOnly value={joinLink(inv.code)} data-testid={'invite-link-' + inv.peer} /><button onClick={() => copy(joinLink(inv.code))}>Copy link</button></div>
              <div class="row"><input placeholder="Paste their answer code" value={answers[inv.peer] ?? ''} onInput={(e) => setAnswers({ ...answers, [inv.peer]: (e.target as HTMLInputElement).value })} data-testid={'invite-answer-' + inv.peer} />
                <button onClick={() => void game.completeInvite(inv.peer, answers[inv.peer] ?? '').catch(() => store.set({ toast: 'That answer code could not be read' }))} data-testid={'invite-connect-' + inv.peer}>Connect</button></div>
            </>}
          </div>
        </div>
      ))}
      </details>
    </div></div>
  );
}

/** Votes on test options (all humans) or pauses (majority), F-166 / F-199. */
export function VoteBanner({ game }: { game: Game }) {
  const net = useStore((s) => s.net);
  const v = net?.vote;
  if (!v) return null;
  const me = game.viewer, voted = v.yes.includes(me) || v.no.includes(me);
  const what = v.kind === 'pause' ? (v.on ? 'pause the game' : 'resume the game') : `${v.on ? 'turn on' : 'turn off'} a test option for everyone (the run counts as modified)`;
  return (
    <div class="vote-banner" data-testid="vote-banner">
      {playerLabel(v.by)} wants to {what}. Yes {v.yes.length} / {v.humans.length}{v.no.length ? `, no ${v.no.length}` : ''}.
      {!voted && <> <button onClick={() => game.vote(v.id, true)} data-testid="vote-yes">Yes</button> <button onClick={() => game.vote(v.id, false)} data-testid="vote-no">No</button></>}
    </div>
  );
}

/** Host left (F-165) and desync (F-167) notices for guests. */
export function NetNotices({ onSave, onRehost }: { onSave: () => void; onRehost: () => void }) {
  const net = useStore((s) => s.net);
  if (!net || net.role !== 'client') return null;
  if (net.hostLeft) return (
    <div class="modal" data-testid="host-left"><div class="panel">
      <h2>The host left</h2>
      <p>The game stopped. You have the full game state: save it, or host it yourself so the others can rejoin.</p>
      <div class="row"><button onClick={onSave} data-testid="host-left-save">Download save</button><button onClick={onRehost} data-testid="host-left-rehost">Host from here</button></div>
    </div></div>
  );
  if (net.desyncAt >= 0) return <div class="vote-banner warn" data-testid="desync-banner">Out of sync with the host since tick {net.desyncAt}. Rejoin with a new invite to resync.</div>;
  if (net.paused) return <div class="vote-banner" data-testid="net-paused">The host paused the game.</div>;
  return null;
}

/** Guest, while connecting: the answer code to send back to the host. */
export function JoinWaiting() {
  const answer = useStore((s) => s.netAnswer), room = useStore((s) => s.joinRoom);
  if (room) return <div class="loading" data-testid="join-room-wait">Connecting to room {room}…</div>;
  if (!answer) return <div class="loading">Reading the invite…</div>;
  return (
    <div class="loading join-wait" data-testid="join-wait">
      <p>Send this answer code to the host and wait until they paste it:</p>
      <textarea readOnly rows={4} value={answer} data-testid="join-answer" />
      <button onClick={() => { void navigator.clipboard?.writeText(answer).catch(() => {}); }}>Copy</button>
    </div>
  );
}
