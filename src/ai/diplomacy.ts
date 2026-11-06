// Bot negotiation (F-153): rule-based, personality-driven, templated dialogue (no external AI).
// Behaviours: answer offers (accept / decline / counter), propose alliances, demand tribute (and threaten),
// ask allies for help, lie (offer peace planning to break it), betray weak allies, declare war when bored.
// Reads only BotView.
import { TUNING } from '../sim/core/tuning';
import { NUM_RES, Res } from '../sim/defs';
import type { CommandBody } from '../sim/commands';
import type { Offer } from '../sim/diplomacy';
import dialogue from '../data/dialogue.json' with { type: 'json' };
import { personality } from './utility';
import { BotView } from './view';

export type Line = 'greet' | 'accept' | 'decline' | 'counter' | 'proposeAlliance' | 'tribute' | 'tributeRefused' | 'helpRequest' | 'helpReply' | 'betray' | 'liePeace' | 'war' | 'reply';
const DLG = dialogue as unknown as Record<string, Record<Line, string[]>>;
const B = TUNING.bots;
const REL = { WAR: 0, PEACE: 1, CEASEFIRE: 2, ALLIANCE: 3, TRADE: 4 };

export interface DiploMemory {
  /** Last tick chat was read. */
  chatSeen: number;
  lastProposal: number;
  /** Players we offered peace to while planning to betray them (schemer's lie), with the tick to strike. */
  lies: number[][];
  /** Tribute demands waiting for an answer: [player, tick, relation then, our feeling then]. */
  demands: number[][];
  lastHelpCall: number;
}
export const newDiploMemory = (): DiploMemory => ({ chatSeen: 0, lastProposal: 0, lies: [], demands: [], lastHelpCall: -100000 });

export interface DiploCtx {
  v: BotView; pers: string; minutes: number; myArmy: number; intruders: number;
  roll: (n: number) => number; cmd: (c: CommandBody) => void;
}

/** A templated line for a personality ({name}, {res} filled in). */
export function say(pers: string, line: Line, roll: (n: number) => number, vars: Record<string, string> = {}): string {
  const list = (DLG[pers] ?? DLG.merchant)[line];
  let t = list[roll(list.length)];
  for (const [k, v] of Object.entries(vars)) t = t.replace(`{${k}}`, v);
  return t;
}
const resText = (res: number[]): string => res.map((v, i) => (v ? `${v} ${['food', 'wood', 'stone', 'gold', 'carbon', 'adamite'][i]}` : '')).filter(Boolean).join(', ');

export function diplomacyPlan(c: DiploCtx, m: DiploMemory): void {
  const { v } = c, me = v.player, w = personality(c.pers).weights, P = v.players;
  const talk = (to: number, line: Line, vars?: Record<string, string>): void => c.cmd({ type: 'chat', to, text: say(c.pers, line, c.roll, vars) });
  // ---- 1. answer offers
  for (const o of v.offersToMe()) {
    const verdict = judge(c, o);
    if (verdict === 'accept') { c.cmd({ type: 'respond', offer: o.id, accept: true }); talk(o.from, 'accept'); }
    else if (verdict === 'counter') {
      // ask for a bit more of what they offered nothing of: food and gold
      const ask = new Array(NUM_RES).fill(0); ask[Res.GOLD] = 30; ask[Res.FOOD] = 50;
      c.cmd({ type: 'respond', offer: o.id, accept: false });
      c.cmd({ type: 'offer', to: o.from, give: o.get, get: { ...o.give, res: (o.give.res ?? new Array(NUM_RES).fill(0)).map((x, i) => x + ask[i]) }, treaty: o.treaty, counterOf: o.id });
      talk(o.from, 'counter');
    } else { c.cmd({ type: 'respond', offer: o.id, accept: false }); talk(o.from, 'decline'); }
  }
  // ---- 2. tribute demands that were refused or expired → threats are kept
  // an answered demand: accepting raises our feeling for them (+dealFeel), declining or ignoring doesn't
  const pending = new Set(v.myOffers().map((o) => o.to));
  const answered = m.demands.filter((d) => v.tick > d[1] + 2 && !pending.has(d[0]));
  for (const d of answered) {
    const paid = v.feel(d[0]) > d[3];
    if (!paid) { talk(d[0], 'tributeRefused'); if (!v.atWar(d[0])) c.cmd({ type: 'declareWar', to: d[0] }); }
  }
  m.demands = m.demands.filter((d) => !answered.includes(d));
  // ---- 3. chat replies
  for (const msg of v.chatSince(m.chatSeen)) {
    if (msg.from >= P) continue;
    const t = msg.text.toLowerCase();
    if (/\bhelp\b/.test(t) && v.isAlly(msg.from)) talk(msg.from, 'helpReply');
    else if (/\b(peace|ceasefire|truce)\b/.test(t) && v.atWar(msg.from) && w.diplomacy >= 0.8 && c.myArmy <= v.strengthOf(msg.from)) {
      c.cmd({ type: 'offer', to: msg.from, give: {}, get: {}, treaty: 'peace' }); talk(msg.from, 'reply');
    } else if (/\b(hi|hello|hey|greetings)\b/.test(t)) talk(msg.from, 'greet');
    else talk(msg.from, 'reply');
  }
  m.chatSeen = v.tick + 1;
  // ---- 4. ask allies for help when attacked
  if (c.intruders > 0 && v.tick - m.lastHelpCall > 1800) {
    for (let q = 0; q < P; q++) if (q !== me && v.isAlly(q) && !v.eliminated(q) && v.teamOf(q) !== v.teamOf(me)) { talk(q, 'helpRequest'); m.lastHelpCall = v.tick; }
  }
  // ---- 5. proposals, at most once a minute
  if (v.tick - m.lastProposal < 600 || c.minutes < 3) return;
  m.lastProposal = v.tick;
  const others = [...Array(P).keys()].filter((q) => q !== me && !v.eliminated(q) && v.teamOf(q) !== v.teamOf(me));
  if (!others.length) return;
  const strength = (q: number): number => Math.max(1, v.strengthOf(q));
  // schemer: keep the lie, strike when the time comes
  for (const l of m.lies) if (v.tick >= l[1] && !v.atWar(l[0])) { talk(l[0], 'betray'); c.cmd({ type: 'declareWar', to: l[0] }); }
  m.lies = m.lies.filter((l) => v.tick < l[1]);
  // betray a weak ally when it pays (schemer, berserker, raider, expansionist)
  if (w.attack >= 1 || c.pers === 'schemer') for (const q of others) {
    if (v.relation(q) === REL.ALLIANCE && strength(q) * 2 < c.myArmy && c.minutes >= 20 && c.roll(4) === 0) { talk(q, 'betray'); c.cmd({ type: 'declareWar', to: q }); return; }
  }
  // demand tribute from much weaker neighbours (berserker, raider, expansionist, schemer)
  if (w.attack + w.raid >= 1.6 || c.pers === 'schemer') {
    const weak = others.filter((q) => c.myArmy >= 1.5 * strength(q) && v.relation(q) !== REL.ALLIANCE);
    if (weak.length) {
      const q = weak[c.roll(weak.length)], res = new Array(NUM_RES).fill(0);
      res[Res.GOLD] = 40; res[Res.FOOD] = 80;
      c.cmd({ type: 'offer', to: q, give: {}, get: { res }, treaty: v.atWar(q) ? 'peace' : null });
      m.demands.push([q, v.tick, v.relation(q), v.feel(q)]);
      talk(q, 'tribute', { res: resText(res) });
      return;
    }
  }
  // propose alliances and peace (diplomatic personalities), schemers lie
  const fond = others.filter((q) => v.feel(q) >= B.allianceFeel && v.reputation(q) >= B.allianceReputation && v.relation(q) !== REL.ALLIANCE);
  if (w.diplomacy >= 1 && fond.length) { const q = fond[0]; c.cmd({ type: 'offer', to: q, give: {}, get: {}, treaty: 'alliance' }); talk(q, 'proposeAlliance'); return; }
  const strong = others.filter((q) => v.atWar(q) && strength(q) > 1.3 * Math.max(1, c.myArmy));
  if (strong.length && (w.diplomacy >= 0.8 || c.pers === 'schemer')) {
    const q = strong[0];
    c.cmd({ type: 'offer', to: q, give: {}, get: {}, treaty: c.pers === 'schemer' ? 'peace' : 'ceasefire' });
    if (c.pers === 'schemer') { talk(q, 'liePeace'); m.lies.push([q, v.tick + 6000]); } else talk(q, 'greet');
    return;
  }
  // nobody left to fight: bored bots pick the weakest non-ally (matches must end)
  if (c.minutes >= B.boredomFullMin && !others.some((q) => v.atWar(q))) {
    const q = others.filter((x) => v.relation(x) !== REL.ALLIANCE).sort((a, b) => strength(a) - strength(b))[0];
    if (q !== undefined) { talk(q, 'war'); c.cmd({ type: 'declareWar', to: q }); }
  }
}

/** Should the bot take this offer? Value model + relationship + personality. */
export function judge(c: Pick<DiploCtx, 'v' | 'pers' | 'myArmy'>, o: Offer): 'accept' | 'decline' | 'counter' {
  const { v } = c, w = personality(c.pers).weights;
  const { gain, cost } = v.dealValue(o);
  const feel = v.feel(o.from), rep = v.reputation(o.from);
  const theirs = Math.max(1, v.strengthOf(o.from));
  let ok = gain - cost + feel * 2 + (rep - 50);
  if (o.treaty === 'alliance') ok += (w.diplomacy - 1) * 150 + (feel >= B.allianceFeel ? 80 : -120) + (rep >= B.allianceReputation ? 0 : -200);
  if (o.treaty === 'peace' || o.treaty === 'ceasefire' || o.treaty === 'tradePact') {
    // the weaker side likes peace, warlike personalities don't
    ok += (theirs > c.myArmy ? 120 : -60) + (w.diplomacy - w.attack) * 120;
    if (o.treaty === 'tradePact') ok += (w.economy - 1) * 150;
  }
  if (ok >= 0) return 'accept';
  if (ok >= -B.counterMargin && !o.counterOf && (gain > 0 || cost > 0)) return 'counter';
  return 'decline';
}

/** Covert play (personalities with a spy weight, e.g. the Schemer): train spies, then steal, scout and sabotage. */
export function covertPlan(c: { v: BotView; pers: string; stock: number[]; roll: (n: number) => number; cmd: (b: CommandBody) => void }): void {
  const { v } = c, spyW = (personality(c.pers) as { spies?: number }).spies ?? 0;
  if (spyW <= 0) return;
  const spies = v.myUnits.filter((u) => u.kind === 8 && u.task === 0), saboteurs = v.myUnits.filter((u) => u.kind === 9 && u.task === 0);
  const barracks = v.myBuildings.find((b) => b.btype === 'barracks' && b.complete && b.queue === 0);
  const have = v.myUnits.filter((u) => u.kind === 8).length;
  if (barracks && have < 2 && c.stock[Res.GOLD] >= 60 && c.stock[Res.FOOD] >= 80 && c.roll(100) < spyW * 100) c.cmd({ type: 'train', building: barracks.id, utype: 7 /* spy */ });
  const towns = v.enemyBuildings.filter((b) => b.btype === 'capital' || b.btype === 'settlement' || b.btype === 'storehouse');
  if (!towns.length) return;
  for (const s of spies) {
    const t = towns[c.roll(towns.length)];
    c.cmd({ type: 'covert', ids: [s.id], act: c.roll(3) ? 'steal' : 'reveal', target: t.id });
  }
  const prod = v.enemyBuildings.filter((b) => b.btype === 'barracks' || b.btype === 'tower' || b.btype === 'workshop');
  for (const s of saboteurs) if (prod.length) c.cmd({ type: 'covert', ids: [s.id], act: 'sabotage', target: prod[c.roll(prod.length)].id });
}
