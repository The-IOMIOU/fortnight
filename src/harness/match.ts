// Headless bot-only match runner (F-126, groundwork for the Phase 8 balance harness F-098).
// Same sim + bots as the game, no rendering, runs as fast as the CPU allows.
import { Sim, type SimSettings } from '../sim/sim';
import { BotManager, type BotConfig } from '../ai/manager';
import { TUNING, type MapSize } from '../sim/core/tuning';
import { Kind, isBuildingKind, isUnitKind, isMilitaryType, buildingTypeOfKind, unitTypeOfKind } from '../sim/defs';
import type { Difficulty } from '../ai/utility';

export interface MatchSpec {
  seed: string;
  size: MapSize;
  bots: BotConfig[];
  maxTicks?: number;
  teams?: number[];
  victory?: SimSettings['victory'];
  impossibleBonus?: boolean;
  /** World shape (globe, continents, sea width); omitted = original flat map. */
  world?: SimSettings['world'];
  /** Race per player (Phase 5); omitted = Baseline for everyone. */
  races?: string[];
}

export interface BotMetrics {
  player: number; personality: string; difficulty: Difficulty;
  firstAttack: number; settlementsFounded: number; defencesBuilt: number;
  towns: number; peakArmy: number; landPeak: number; eliminatedAt: number; walls: number; towers: number;
}

export interface MatchResult {
  seed: string; size: MapSize; finished: boolean; winner: number; winnerTeam: number; victory: 'domination' | 'conquest' | 'none';
  ticks: number; minutes: number; msPerTick: number; botMsPerTick: number; metrics: BotMetrics[];
}

export function runMatch(spec: MatchSpec, onTick?: (sim: Sim, bots: BotManager) => void): MatchResult {
  const players = spec.bots.length;
  const bonus = spec.bots.map((b) => (spec.impossibleBonus && b.difficulty === 'impossible' ? TUNING.bots.impossibleIncomeBonusPct : 0));
  const sim = new Sim({ seed: spec.seed, size: spec.size, players, teams: spec.teams, victory: spec.victory, incomeBonusPct: bonus, world: spec.world, races: spec.races });
  const bots = new BotManager(sim, spec.bots);
  const maxTicks = spec.maxTicks ?? TUNING.bots.matchLimitMin * 600;
  const metrics: BotMetrics[] = spec.bots.map((b) => ({ ...b, firstAttack: -1, settlementsFounded: 0, defencesBuilt: 0, towns: 1, peakArmy: 0, landPeak: 0, eliminatedAt: -1, walls: 0, towers: 0 }));
  let victory: MatchResult['victory'] = 'none';
  const t0 = performance.now();
  while (sim.tick < maxTicks && sim.winner < 0) {
    bots.tick();
    sim.step();
    for (const ev of sim.drainEvents()) {
      if (ev.type === 'victory') victory = ev.a === 1 ? 'conquest' : 'domination';
      if (ev.type === 'eliminated' && metrics[ev.player]) metrics[ev.player].eliminatedAt = sim.tick;
    }
    sim.drainChangedTiles();
    if (sim.tick % 300 === 0) sample(sim, metrics);
    onTick?.(sim, bots);
  }
  sample(sim, metrics);
  const ms = performance.now() - t0;
  for (const b of bots.bots) {
    const m = metrics[b.s.player];
    m.firstAttack = b.s.firstAttack; m.settlementsFounded = b.s.settlementsFounded; m.defencesBuilt = b.s.defencesBuilt;
  }
  return {
    seed: spec.seed, size: spec.size, finished: sim.winner >= 0, winner: sim.winner, winnerTeam: sim.winnerTeam, victory,
    ticks: sim.tick, minutes: sim.tick / 600, msPerTick: ms / Math.max(1, sim.tick), botMsPerTick: bots.thinkMs / Math.max(1, sim.tick), metrics,
  };
}

function sample(sim: Sim, metrics: BotMetrics[]): void {
  const e = sim.ents;
  const army = new Array(sim.players).fill(0), towns = new Array(sim.players).fill(0), walls = new Array(sim.players).fill(0), towers = new Array(sim.players).fill(0);
  for (let id = 0; id < e.count; id++) {
    if (!e.alive[id] || e.owner[id] >= sim.players) continue;
    const k = e.kind[id], p = e.owner[id];
    if (isUnitKind(k) && isMilitaryType(unitTypeOfKind(k)) && k !== Kind.WARSHIP && k !== Kind.SABOTEUR) army[p]++;
    if (isBuildingKind(k) && e.complete[id]) {
      const bt = buildingTypeOfKind(k);
      if (bt === 'capital' || bt === 'settlement') towns[p]++;
      if (bt === 'wall') walls[p]++;
      if (bt === 'tower') towers[p]++;
    }
  }
  for (const m of metrics) {
    const p = m.player;
    m.peakArmy = Math.max(m.peakArmy, army[p]);
    m.towns = Math.max(m.towns, towns[p]);
    m.walls = Math.max(m.walls, walls[p]);
    m.towers = Math.max(m.towers, towers[p]);
    m.landPeak = Math.max(m.landPeak, sim.ps[p].landOwned);
  }
}
