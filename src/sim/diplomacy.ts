// Phase 6: diplomacy (F-151, F-152), chat (F-150), covert actions (F-140–F-142), economic victory (F-134).
// Deterministic sim state: every change comes from a command; numbers live in tuning.json → diplomacy / covert.
import { TUNING } from './core/tuning';
import { FP_ONE, FP_SHIFT } from './core/fixed';
import { wdelta } from './core/topo';
import { NUM_RES, Res, TOWN_CENTERS, buildingTypeOfKind, isBuildingKind, isUnitKind, Kind } from './defs';
import { GEAR_IDS, TECH_IDS } from './abilities';
import type { Sim } from './sim';

export const D = TUNING.diplomacy;
export const CV = TUNING.covert;

export const Rel = { WAR: 0, PEACE: 1, CEASEFIRE: 2, ALLIANCE: 3, TRADE: 4 } as const;
export const REL_NAMES = ['war', 'peace', 'ceasefire', 'alliance', 'trade pact'] as const;
export type Treaty = 'peace' | 'ceasefire' | 'alliance' | 'tradePact';
const TREATY_REL: Record<Treaty, number> = { peace: Rel.PEACE, ceasefire: Rel.CEASEFIRE, alliance: Rel.ALLIANCE, tradePact: Rel.TRADE };

/** What one side hands over in a deal. */
export interface Deal { res?: number[]; gear?: number[]; tech?: string[]; /** own outposts / settlements (building ids) */ towns?: number[] }
export interface Offer { id: number; from: number; to: number; give: Deal; get: Deal; treaty: Treaty | null; tick: number; expires: number; /** reply to (counter of) another offer */ counterOf: number }
export interface ChatMsg { tick: number; from: number; to: number; text: string }

export interface DiploState {
  /** Relation per ordered pair p*P+q (kept symmetric). */
  rel: number[];
  /** Tick a ceasefire ends (per pair). */
  ceasefireUntil: number[];
  /** Relationship −100..100 of p towards q (p*P+q): what bots base decisions on. */
  feel: number[];
  /** Public reputation 0..100 per player; drops when treaties are broken. */
  reputation: number[];
  offers: Offer[];
  nextOffer: number;
  chat: ChatMsg[];
  /** Spy reveals: [player, tile, radius, untilTick]. */
  reveals: number[][];
  /** Town-centre (well) poisoning: until tick per player. */
  wellPoisonUntil: number[];
  /** Economic victory hold counter per team leader. */
  econTicks: number[];
}

export function newDiploState(P: number): DiploState {
  return {
    rel: new Array(P * P).fill(Rel.WAR), ceasefireUntil: new Array(P * P).fill(0), feel: new Array(P * P).fill(0),
    reputation: new Array(P).fill(D.reputationStart), offers: [], nextOffer: 1, chat: [], reveals: [], wellPoisonUntil: new Array(P).fill(0), econTicks: new Array(P).fill(0),
  };
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export class Diplomacy {
  constructor(private s: Sim, public st: DiploState) {}

  get P(): number { return this.s.players; }
  rel(p: number, q: number): number { return p === q ? Rel.ALLIANCE : this.st.rel[p * this.P + q]; }
  /** Treaty alliance (teams are handled by Sim.allied). */
  treatyAllied(p: number, q: number): boolean { return p < this.P && q < this.P && p !== q && this.rel(p, q) === Rel.ALLIANCE; }
  /** At war: the only state in which units fight on their own. */
  atWar(p: number, q: number): boolean { return p !== q && this.rel(p, q) === Rel.WAR; }

  private setRel(p: number, q: number, r: number): void {
    const P = this.P;
    this.st.rel[p * P + q] = this.st.rel[q * P + p] = r;
    this.st.ceasefireUntil[p * P + q] = this.st.ceasefireUntil[q * P + p] = r === Rel.CEASEFIRE ? this.s.tick + D.ceasefireTicks : 0;
    this.s.fogForce[p] = 1; this.s.fogForce[q] = 1;
    this.s.flows.clear();
    this.s.emit(p, 'relation', q, r); this.s.emit(q, 'relation', p, r);
  }
  feelAdd(p: number, q: number, d: number): void { if (p !== q && p < this.P && q < this.P) this.st.feel[p * this.P + q] = clamp(this.st.feel[p * this.P + q] + d, -100, 100); }
  feel(p: number, q: number): number { return this.st.feel[p * this.P + q]; }

  /** Breaking a treaty (declaring war on a non-war partner, or a covert act caught in peace time). */
  breakTreaty(p: number, q: number, reason: 'declared' | 'caught'): void {
    const was = this.rel(p, q);
    if (was === Rel.WAR || this.s.teamOf(p) === this.s.teamOf(q)) return;
    const pen = was === Rel.ALLIANCE ? D.betrayAlliancePenalty : D.breakTreatyPenalty;
    this.st.reputation[p] = clamp(this.st.reputation[p] - pen, 0, 100);
    this.feelAdd(q, p, -D.victimFeelPenalty);
    for (let o = 0; o < this.P; o++) if (o !== p && o !== q) this.feelAdd(o, p, -D.othersFeelPenalty);
    this.setRel(p, q, Rel.WAR);
    this.s.emit(p, 'treatyBroken', q, reason === 'caught' ? 1 : 0); this.s.emit(q, 'treatyBroken', p, reason === 'caught' ? 1 : 0);
  }

  declareWar(p: number, q: number): void {
    if (q < 0 || q >= this.P || q === p || this.s.teamOf(p) === this.s.teamOf(q)) return;
    if (this.rel(p, q) !== Rel.WAR) this.breakTreaty(p, q, 'declared');
  }

  // ---------------------------------------------------------------- offers

  private canPay(p: number, d: Deal): boolean {
    const ps = this.s.ps[p], e = this.s.ents;
    if (d.res && d.res.some((v, i) => v < 0 || ps.stock[i] < v)) return false;
    if (d.gear && d.gear.some((v, i) => v < 0 || ps.gear[i] < v)) return false;
    if (d.tech && d.tech.some((t) => !TECH_IDS.includes(t as never) || !ps.researched.includes(t))) return false;
    if (d.towns && d.towns.some((b) => b < 0 || b >= e.count || !e.alive[b] || e.owner[b] !== p || !isBuildingKind(e.kind[b]) || !['outpost', 'settlement'].includes(buildingTypeOfKind(e.kind[b])))) return false;
    return true;
  }
  private transfer(from: number, to: number, d: Deal): void {
    const a = this.s.ps[from], b = this.s.ps[to];
    d.res?.forEach((v, i) => { if (i < NUM_RES && v > 0) { a.stock[i] -= v; b.stock[i] += v; } });
    d.gear?.forEach((v, i) => { if (i < GEAR_IDS.length && v > 0) { a.gear[i] -= v; b.gear[i] += v; } });
    let tech = false;
    for (const t of d.tech ?? []) if (!b.researched.includes(t)) { b.researched.push(t); tech = true; }
    if (tech) { this.s.rules.refresh(to); this.s.rules.restatUnits(to); }
    for (const id of d.towns ?? []) this.s.mil.transferBuilding(id, to);
  }
  private valueOf(d: Deal): number {
    let v = 0;
    d.res?.forEach((x, i) => { v += x * D.resValue[i]; });
    d.gear?.forEach((x) => { v += x * D.gearValue; });
    v += (d.tech?.length ?? 0) * D.techValue + (d.towns?.length ?? 0) * D.townValue;
    return v;
  }
  /** Value (in food-equivalents) of a deal for the side that receives `get` and pays `give`. */
  dealValue(o: Pick<Offer, 'give' | 'get'>): { gain: number; cost: number } { return { gain: this.valueOf(o.give), cost: this.valueOf(o.get) }; }

  offer(from: number, to: number, give: Deal, get: Deal, treaty: Treaty | null, counterOf = 0): void {
    if (to < 0 || to >= this.P || to === from || this.s.ps[to].eliminated) return;
    if (!this.canPay(from, give)) { this.s.emit(from, 'offerInvalid', to); return; }
    if (counterOf) this.st.offers = this.st.offers.filter((o) => o.id !== counterOf);
    // one open offer per direction: a new one replaces the old
    this.st.offers = this.st.offers.filter((o) => !(o.from === from && o.to === to));
    const o: Offer = { id: this.st.nextOffer++, from, to, give: norm(give), get: norm(get), treaty, tick: this.s.tick, expires: this.s.tick + D.offerTicks, counterOf };
    this.st.offers.push(o);
    this.s.emit(to, 'offer', from, o.id); this.s.emit(from, 'offerSent', to, o.id);
  }

  respond(p: number, id: number, accept: boolean): void {
    const o = this.st.offers.find((x) => x.id === id && x.to === p);
    if (!o) return;
    this.st.offers = this.st.offers.filter((x) => x !== o);
    if (!accept) { this.s.emit(o.from, 'offerDeclined', p, id); this.feelAdd(o.from, p, -1); return; }
    if (!this.canPay(o.from, o.give) || !this.canPay(p, o.get)) { this.s.emit(o.from, 'offerFailed', p, id); this.s.emit(p, 'offerFailed', o.from, id); return; }
    this.transfer(o.from, p, o.give);
    this.transfer(p, o.from, o.get);
    if (o.treaty) {
      const r = TREATY_REL[o.treaty];
      // an alliance replaces any other treaty; peace / trade / ceasefire replace war or each other
      this.setRel(o.from, p, r);
    }
    const net = this.valueOf(o.give) - this.valueOf(o.get);
    this.feelAdd(p, o.from, D.dealFeel + clamp(Math.floor(net / D.feelPerValue), -10, 20));
    this.feelAdd(o.from, p, D.dealFeel);
    this.s.emit(o.from, 'offerAccepted', p, id); this.s.emit(p, 'offerAccepted', o.from, id);
  }

  chat(from: number, to: number, text: string): void {
    const t = String(text ?? '').slice(0, D.chatMaxLength);
    if (!t) return;
    this.st.chat.push({ tick: this.s.tick, from, to, text: t });
    if (this.st.chat.length > D.chatKeep) this.st.chat.splice(0, this.st.chat.length - D.chatKeep);
    this.s.emit(from, 'chat', to);
  }

  // ---------------------------------------------------------------- per tick

  tick(): void {
    const s = this.s, P = this.P, st = this.st;
    for (let p = 0; p < P; p++) for (let q = p + 1; q < P; q++) {
      if (st.rel[p * P + q] === Rel.CEASEFIRE && s.tick >= st.ceasefireUntil[p * P + q]) this.setRel(p, q, Rel.WAR);
    }
    if (st.offers.length) st.offers = st.offers.filter((o) => { if (s.tick < o.expires) return true; s.emit(o.from, 'offerExpired', o.to, o.id); return false; });
    if (st.reveals.length) st.reveals = st.reveals.filter((r) => s.tick < r[3]);
    // slow recovery of reputation, relationships drift back towards 0
    if (s.tick % D.recoverEveryTicks === 0) {
      for (let p = 0; p < P; p++) st.reputation[p] = clamp(st.reputation[p] + (st.reputation[p] < D.reputationStart ? 1 : 0), 0, 100);
      for (let i = 0; i < st.feel.length; i++) st.feel[i] += st.feel[i] > 0 ? -1 : st.feel[i] < 0 ? 1 : 0;
    }
  }

  /** Income bonus for trade pacts (percent added to gathered gold). */
  tradeBonusPct(p: number): number {
    let n = 0;
    for (let q = 0; q < this.P; q++) if (q !== p && this.rel(p, q) === Rel.TRADE && !this.s.ps[q].eliminated) n++;
    return Math.min(D.tradePactMaxPartners, n) * D.tradePactGoldPct;
  }

  /** Economic victory (F-134, PLAN §7-C): a team with ≥ econSharePct of all adamite income over the last minute, held for econHoldTicks. */
  econTick(): void {
    const s = this.s;
    if (s.winner >= 0 || !s.settings.victory?.economic) return;
    const inc = s.ps.map((ps) => { let n = 0; for (let b = 0; b < 60; b++) n += ps.ring[Res.ADAMITE * 60 + b]; return ps.eliminated ? 0 : n; });
    const total = inc.reduce((a, b) => a + b, 0);
    const team = new Map<number, number>();
    for (let p = 0; p < this.P; p++) team.set(s.teamOf(p), (team.get(s.teamOf(p)) ?? 0) + inc[p]);
    for (let p = 0; p < this.P; p++) {
      const t = s.teamOf(p);
      if (s.ps[p].eliminated || [...Array(p).keys()].some((q) => s.teamOf(q) === t)) continue; // counter on the team's lowest player
      if (total >= D.econMinIncome && (team.get(t) ?? 0) * 100 >= D.econSharePct * total) {
        if (++this.st.econTicks[p] >= D.econHoldTicks) { s.winner = p; s.winnerTeam = t; s.emit(p, 'victory', 3, t); return; }
      } else this.st.econTicks[p] = 0;
    }
  }
}

const norm = (d: Deal): Deal => ({
  res: d.res ? Array.from({ length: NUM_RES }, (_, i) => Math.max(0, Math.floor(d.res![i] ?? 0))) : undefined,
  gear: d.gear ? Array.from({ length: GEAR_IDS.length }, (_, i) => Math.max(0, Math.floor(d.gear![i] ?? 0))) : undefined,
  tech: d.tech?.slice(0, 8), towns: d.towns?.slice(0, 8),
});

// ---------------------------------------------------------------- covert actions (F-140–F-142)

export type CovertAct = 'steal' | 'reveal' | 'sabotage' | 'poison';
export const COVERT_ACTS: CovertAct[] = ['steal', 'reveal', 'sabotage', 'poison'];

/** Which unit kinds may do which covert act. */
export function covertAllowed(kind: number, act: CovertAct): boolean {
  if (act === 'sabotage') return kind === Kind.SABOTEUR;
  if (act === 'poison') return kind === Kind.SPY || kind === Kind.SABOTEUR;
  return kind === Kind.SPY;
}

/** Carry out a covert act once the agent is next to its target. Returns true when done (success or caught). */
export function doCovert(s: Sim, id: number, act: CovertAct, target: number): boolean {
  const e = s.ents, p = e.owner[id], q = e.owner[target];
  if (!e.alive[target] || q >= s.players || q === p || s.allied(p, q)) return true;
  // detection: base chance, more next to an enemy tower or town centre
  let pct = CV.detectPct[COVERT_ACTS.indexOf(act)];
  for (let b = 0; b < e.count; b++) {
    if (!e.alive[b] || e.owner[b] !== q || !isBuildingKind(e.kind[b]) || !e.complete[b]) continue;
    const bt = buildingTypeOfKind(e.kind[b]);
    if ((bt === 'tower' || TOWN_CENTERS.includes(bt)) && s.mil.dist2(id, b) <= 36 * FP_ONE * FP_ONE) { pct += CV.guardDetectPct; break; }
  }
  const caught = s.rngCovert.int(100) < pct;
  if (caught) {
    e.hp[id] = 0; // executed
    s.emit(q, 'spyCaught', p, act === 'steal' ? 0 : COVERT_ACTS.indexOf(act)); s.emit(p, 'spyLost', q, COVERT_ACTS.indexOf(act));
    if (!s.dip.atWar(p, q)) s.dip.breakTreaty(p, q, 'caught');
    s.dip.feelAdd(q, p, -CV.caughtFeel);
    return true;
  }
  switch (act) {
    case 'steal': {
      const vs = s.ps[q].stock, order = [Res.GOLD, Res.FOOD, Res.WOOD, Res.STONE];
      let r = order[0];
      for (const x of order) if (vs[x] > vs[r]) r = x;
      const n = Math.min(CV.stealAmount, vs[r]);
      vs[r] -= n; s.ps[p].stock[r] += n;
      s.emit(p, 'stole', r, n); s.emit(q, 'robbed', r, n);
      break;
    }
    case 'reveal': {
      s.dip.st.reveals.push([p, s.tileOf(target), CV.revealRadius, s.tick + CV.revealTicks]);
      s.fogForce[p] = 1;
      s.emit(p, 'intel', q, s.ps[q].stock.reduce((a, b) => a + b, 0));
      break;
    }
    case 'sabotage': {
      if (!isBuildingKind(e.kind[target])) return true;
      e.disabledUntil[target] = s.tick + CV.sabotageTicks;
      s.emit(p, 'sabotaged', e.btype[target], target); s.emit(q, 'wasSabotaged', e.btype[target], target);
      break;
    }
    case 'poison': {
      if (isUnitKind(e.kind[target])) { e.poisonUntil[target] = s.tick + CV.unitPoisonTicks; }
      else if (buildingTypeOfKind(e.kind[target]) === 'farm') e.poisonUntil[target] = s.tick + CV.cropPoisonTicks;
      else if (TOWN_CENTERS.includes(buildingTypeOfKind(e.kind[target]))) s.dip.st.wellPoisonUntil[q] = s.tick + CV.wellPoisonTicks;
      else return true;
      s.emit(p, 'poisoned', q, target); s.emit(q, 'wasPoisoned', p, target);
      break;
    }
  }
  return true;
}

/** Poison on units: damage over time. */
export function poisonTick(s: Sim): void {
  if (s.tick % CV.unitPoisonEveryTicks) return;
  const e = s.ents;
  for (let id = 0; id < e.count; id++) if (e.alive[id] && isUnitKind(e.kind[id]) && s.tick < e.poisonUntil[id]) { e.hp[id] -= CV.unitPoisonDamage; e.lastHit[id] = s.tick; }
}

/** Is `t` within reach of the agent (2 tiles)? */
export function covertInReach(s: Sim, id: number, t: number): boolean {
  const e = s.ents;
  if (isBuildingKind(e.kind[t])) return s.mil.dist2(id, t) <= 4 * FP_ONE * FP_ONE;
  const dx = wdelta(e.posX[id], e.posX[t], s.map.w * FP_ONE, s.wrap), dy = e.posY[t] - e.posY[id];
  return dx * dx + dy * dy <= 4 * FP_ONE * FP_ONE && (e.posX[t] >> FP_SHIFT) >= 0;
}
