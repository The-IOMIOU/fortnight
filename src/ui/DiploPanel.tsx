// Phase 6 UI: diplomacy panel (relations, reputation, treaties, trade offers, incoming offers) and chat
// with players and bots, with mute (F-150–F-152); covert-act buttons for selected spies (F-140–F-142).
import { useState } from 'preact/hooks';
import type { Game } from '../app/game';
import { store, useStore } from '../app/store';
import { TUNING } from '../sim/core/tuning';
import { NUM_RES } from '../sim/defs';
import { REL_NAMES, type Deal, type Offer, type Treaty } from '../sim/diplomacy';
import { raceById } from '../sim/races';
import { playerLabel } from '../render/palette';
import { RES_LABELS } from './names';

const resLine = (r?: number[]): string => (r ?? []).map((v, i) => (v ? `${v} ${RES_LABELS[i].toLowerCase()}` : '')).filter(Boolean).join(', ');
function dealText(d: Deal): string {
  const parts = [resLine(d.res)];
  if (d.gear?.some(Boolean)) parts.push(`${d.gear.reduce((a, b) => a + b, 0)} gear`);
  if (d.tech?.length) parts.push(`tech: ${d.tech.join(', ')}`);
  if (d.towns?.length) parts.push(`${d.towns.length} town(s)`);
  return parts.filter(Boolean).join('; ') || 'nothing';
}
const offerText = (o: Offer, me: number): string => {
  const t = o.treaty ? ` + ${o.treaty === 'tradePact' ? 'trade pact' : o.treaty}` : '';
  return o.from === me ? `You give ${dealText(o.give)}, you ask ${dealText(o.get)}${t}` : `They give ${dealText(o.give)}, they ask ${dealText(o.get)}${t}`;
};

export function DiploButton() {
  const dip = useStore((s) => s.dip);
  if (!dip) return null;
  const incoming = dip.offers.filter((o) => o.to !== o.from && o.from !== 0 && o.to === 0).length;
  return <button onClick={() => store.set({ dipOpen: !store.state.dipOpen })} data-testid="dip-btn" title="Diplomacy and chat">Diplomacy{incoming ? ` (${incoming})` : ''}</button>;
}

export function DiploPanel({ game }: { game: Game }) {
  const s = useStore((st) => ({ open: st.dipOpen, dip: st.dip, players: st.players, tick: st.tick, muted: st.muted, blocked: st.blocked }));
  const [to, setTo] = useState(-1);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState(100);
  const [resIdx, setResIdx] = useState(0);
  if (!s.open || !s.dip) return null;
  const me = game.viewer, d = s.dip, P = d.rel.length;
  const others = [...Array(P).keys()].filter((q) => q !== me);
  const res = (n: number): number[] => Array.from({ length: NUM_RES }, (_, i) => (i === resIdx ? n : 0));
  const treaty = (q: number, t: Treaty): void => game.offer(q, {}, {}, t);
  const mute = (q: number): void => store.set({ muted: s.muted.includes(q) ? s.muted.filter((x) => x !== q) : [...s.muted, q] });
  const block = (q: number): void => store.set({ blocked: s.blocked.includes(q) ? s.blocked.filter((x) => x !== q) : [...s.blocked, q] });
  // mute hides a player's chat; block also hides their offers (both only for you, F-154)
  const chat = d.chat.filter((m) => !s.muted.includes(m.from) && !s.blocked.includes(m.from));
  const offers = d.offers.filter((o) => !(o.to === me && s.blocked.includes(o.from)));
  return (
    <div class="modal" data-testid="dip-panel"><div class="panel dip-panel">
      <div class="sel-title">Diplomacy <button onClick={() => store.set({ dipOpen: false })} aria-label="Close">✕</button></div>
      <table class="dip-table">
        <thead><tr><th>Player</th><th>People</th><th>Relation</th><th>Reputation</th><th /></tr></thead>
        <tbody>
          {others.map((q) => (
            <tr data-testid={'dip-row-' + q}>
              <td>{playerLabel(q)}</td>
              <td>{raceById(d.races[q]).name}</td>
              <td data-testid={'rel-' + q}>{REL_NAMES[d.rel[q]]}{d.rel[q] === 2 ? ` (${Math.max(0, Math.ceil((d.ceasefireUntil[q] - s.tick) / 600))} min)` : ''}</td>
              <td>{d.reputation[q]}</td>
              <td class="dip-actions">
                {d.rel[q] === 0 && <button onClick={() => treaty(q, 'ceasefire')} data-testid={'ceasefire-' + q}>Ceasefire</button>}
                {d.rel[q] === 0 && <button onClick={() => treaty(q, 'peace')} data-testid={'peace-' + q}>Peace</button>}
                {d.rel[q] !== 3 && <button onClick={() => treaty(q, 'alliance')} data-testid={'alliance-' + q}>Alliance</button>}
                {d.rel[q] !== 4 && d.rel[q] !== 3 && <button onClick={() => treaty(q, 'tradePact')} data-testid={'trade-' + q}>Trade pact</button>}
                {d.rel[q] !== 0 && <button onClick={() => game.declareWar(q)} data-testid={'war-' + q} title={`Breaking a treaty costs ${TUNING.diplomacy.breakTreatyPenalty}–${TUNING.diplomacy.betrayAlliancePenalty} reputation`}>Declare war</button>}
                <button onClick={() => game.offer(q, { res: res(amount) }, {}, null)} data-testid={'gift-' + q}>Give</button>
                <button onClick={() => game.offer(q, {}, { res: res(amount) }, null)} data-testid={'ask-' + q}>Ask</button>
                <button onClick={() => mute(q)} data-testid={'mute-' + q}>{s.muted.includes(q) ? 'Unmute' : 'Mute'}</button>
                <button onClick={() => block(q)} data-testid={'block-' + q}>{s.blocked.includes(q) ? 'Unblock' : 'Block'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row">Give / ask amount
        <input type="number" min="10" max="5000" step="10" value={amount} onInput={(e) => setAmount(Math.max(0, +(e.target as HTMLInputElement).value || 0))} data-testid="deal-amount" />
        <select value={resIdx} onChange={(e) => setResIdx(+(e.target as HTMLSelectElement).value)} data-testid="deal-res">{RES_LABELS.map((r, i) => <option value={i}>{r}</option>)}</select>
      </div>
      <h3>Offers</h3>
      {offers.length === 0 && <div class="sel-sub">No open offers.</div>}
      {offers.map((o) => (
        <div class="tech-row" data-testid={'offer-' + o.id}>
          <div><b>{o.from === me ? `To ${playerLabel(o.to)}` : `From ${playerLabel(o.from)}`}</b> <small>{offerText(o, me)}</small></div>
          {o.to === me ? <span><button onClick={() => game.respond(o.id, true)} data-testid={'accept-' + o.id}>Accept</button> <button onClick={() => game.respond(o.id, false)} data-testid={'decline-' + o.id}>Decline</button></span> : <small>waiting</small>}
        </div>
      ))}
      <h3>Chat</h3>
      <div class="chat-log" data-testid="chat-log">
        {chat.map((m) => <div class="chat-line"><b>{m.from === me ? 'You' : playerLabel(m.from)}{m.to >= 0 && m.to !== me ? ` → ${playerLabel(m.to)}` : m.to === -1 ? ' (all)' : ''}:</b> {m.text}</div>)}
      </div>
      <form class="row" onSubmit={(e) => { e.preventDefault(); game.chat(to, text); setText(''); }}>
        <select value={to} onChange={(e) => setTo(+(e.target as HTMLSelectElement).value)} data-testid="chat-to"><option value={-1}>Everyone</option>{others.map((q) => <option value={q}>{playerLabel(q)}</option>)}</select>
        <input value={text} maxLength={TUNING.diplomacy.chatMaxLength} onInput={(e) => setText((e.target as HTMLInputElement).value)} placeholder="Message" data-testid="chat-input" />
        <button type="submit" data-testid="chat-send">Send</button>
      </form>
    </div></div>
  );
}

/** Selected spies / saboteurs: pick an act, then right-click the target. */
export function CovertBar() {
  const act = useStore((s) => s.covertAct);
  const b = (id: string, label: string, title: string) => <button class={act === id ? 'on' : ''} onClick={() => store.set({ covertAct: act === id ? null : id })} data-testid={'covert-' + id} title={title}>{label}</button>;
  return (
    <div class="buildmenu" data-testid="covert-bar">
      {b('steal', 'Steal', 'Spy: steal from an enemy town or storehouse')}
      {b('reveal', 'Spy on', 'Spy: reveal the area and stock around the target')}
      {b('sabotage', 'Sabotage', 'Saboteur: shut a building down for a while')}
      {b('poison', 'Poison', 'Spy or saboteur: poison a unit, a farm or a town well (needs Toxins)')}
      {act && <small>Right-click the target</small>}
    </div>
  );
}
