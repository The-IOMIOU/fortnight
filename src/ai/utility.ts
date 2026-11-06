// Utility AI (F-124): score each goal 0..~100 from a plain-number summary of what the bot knows,
// multiply by the personality's weights, pick the highest. Pure functions → easy to unit-test.
import personalitiesJson from '../data/personalities.json' with { type: 'json' };
import { TUNING } from '../sim/core/tuning';

export const GOALS = ['economy', 'expand', 'defense', 'attack', 'raid', 'diplomacy'] as const;
export type Goal = (typeof GOALS)[number];

export interface Personality {
  id: string; name: string; description: string;
  weights: Record<Goal, number>;
  armyFactor: number; defences: number; riders: number; archers: number; spies?: number;
}
export const PERSONALITIES: Personality[] = personalitiesJson as Personality[];
export const personality = (id: string): Personality => PERSONALITIES.find((p) => p.id === id) ?? PERSONALITIES[0];

export type Difficulty = 'easy' | 'hard' | 'impossible';
export const DIFFICULTIES: Difficulty[] = ['easy', 'hard', 'impossible'];
export const difficultyDef = (d: Difficulty) => TUNING.bots[d];

/** What the bot knows, boiled down to numbers. */
export interface Situation {
  minutes: number;
  workers: number;
  idleWorkers: number;
  workerTarget: number;
  pop: number;
  housing: number;
  foodBalance: number;
  towns: number;
  maxTowns: number;
  settlers: number;
  expansionSites: number;
  army: number;
  armyStrength: number;
  attackSize: number;
  /** Strength of visible enemy soldiers near our buildings. */
  threat: number;
  /** Enemy soldiers inside our territory. */
  intruders: number;
  /** Known enemy towns reachable over land / only over sea. */
  enemyTownsLand: number;
  enemyTownsSea: number;
  /** Visible enemy workers/outlying buildings that are lightly guarded. */
  softTargets: number;
  barracks: number;
}

const clamp = (x: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, x));

export function boredom(minutes: number): number {
  const { boredomStartMin: a, boredomFullMin: b } = TUNING.bots;
  return clamp((minutes - a) / (b - a), 0, 1);
}

/** Raw (unweighted) goal scores. */
export function rawScores(s: Situation): Record<Goal, number> {
  const bore = boredom(s.minutes);
  const economy = clamp(70 * (1 - s.workers / Math.max(1, s.workerTarget)) + Math.min(20, s.idleWorkers * 5) + (s.foodBalance < 0 ? 20 : 0) + (s.housing - s.pop <= 2 ? 15 : 0) + 10);
  const expand = s.towns >= s.maxTowns ? 0 : clamp((s.expansionSites > 0 ? 55 : 12) * (1 - s.towns / s.maxTowns) + (s.minutes > 4 ? 10 : 0) - s.settlers * 30);
  const defense = s.intruders > 0 ? 95 : clamp((60 * s.threat) / Math.max(10, s.armyStrength) + (s.barracks === 0 && s.minutes > 6 ? 15 : 0));
  const ready = Math.min(1.5, s.army / Math.max(1, s.attackSize));
  const targets = s.enemyTownsLand > 0 ? 1 : s.enemyTownsSea > 0 ? 0.75 : 0.45; // nothing known yet → explore/seek
  // late game: everyone escalates towards war so matches end (even pacifists)
  const late = Math.max(0, Math.min(60, (s.minutes - 30) * 4));
  const attack = clamp((40 * ready + 45 * bore) * targets + late);
  const raid = s.softTargets > 0 ? clamp(35 + 30 * bore) : 0; // nothing to raid → no raid
  return { economy, expand, defense, attack, raid, diplomacy: 0 /* treaties and trade arrive in Phase 6 */ };
}

export function scoreGoals(s: Situation, p: Personality): { goal: Goal; scores: Record<Goal, number> } {
  const raw = rawScores(s);
  const scores = {} as Record<Goal, number>;
  let goal: Goal = 'economy', best = -1;
  for (const g of GOALS) {
    // floors: late wars end matches; intruders at home outrank every plan, whatever the personality
    const wgt = g === 'attack' && s.minutes > 35 ? Math.max(p.weights[g], 0.9) : g === 'defense' && s.intruders > 0 ? Math.max(p.weights[g], 1.1) : p.weights[g];
    scores[g] = Math.round(raw[g] * wgt);
    if (scores[g] > best) { best = scores[g]; goal = g; }
  }
  return { goal, scores };
}
