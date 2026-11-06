// Continent stats (F-059): computed inside the sim so the panel shows exactly the simulation's numbers.
import { TUNING } from './core/tuning';
import { isWaterBiome } from './world/mapgen';
import { NUM_RES, UNIT_TYPES, isBuildingKind, isUnitKind, unitTypeOfKind } from './defs';
import { RING, type Sim } from './sim';

export interface CensusRow { player: number; landOwned: number; landPermille: number; pop: number; settlements: number }
export interface PlayerStats {
  tick: number;
  player: number;
  landOwned: number;
  landTotal: number;
  /** owned land in tenths of a percent */
  landPermille: number;
  pop: number;
  housing: number;
  foodIncomePerMin: number;
  foodUpkeepPerMin: number;
  foodBalancePerMin: number;
  starving: boolean;
  stock: number[];
  incomePerMin: number[];
  depositsFound: number[];
  units: Record<string, number>;
  buildings: number;
  /** army strength: Σ attack × max HP / 100 over military units */
  army: number;
  continents: { index: number; owned: number; total: number }[];
  census: CensusRow[];
  dominationTicks: number;
  winner: number;
}

let continentTotals: { key: string; totals: number[] } | null = null;

export function computeStats(sim: Sim, p: number): PlayerStats {
  const ps = sim.ps[p], e = sim.ents, m = sim.map;
  const incomePerMin = new Array(NUM_RES).fill(0);
  for (let r = 0; r < NUM_RES; r++) for (let b = 0; b < RING; b++) incomePerMin[r] += ps.ring[r * RING + b];
  const units: Record<string, number> = {};
  for (const u of UNIT_TYPES) units[u] = 0;
  let buildings = 0;
  const settlements = new Array(sim.players).fill(0);
  for (let id = 0; id < e.count; id++) {
    if (!e.alive[id]) continue;
    const k = e.kind[id], o = e.owner[id];
    if (o === p && isUnitKind(k)) units[unitTypeOfKind(k)]++;
    if (isBuildingKind(k) && o < sim.players && e.complete[id]) {
      if (o === p) buildings++;
      if (e.btype[id] <= 1) settlements[o]++; // capital, settlement
    }
  }
  // land per continent
  const key = `${m.seed}/${m.size}`;
  if (!continentTotals || continentTotals.key !== key) {
    const totals = new Array(m.continentSizes.length).fill(0);
    for (let i = 0; i < m.continent.length; i++) if (m.continent[i] !== 255 && !isWaterBiome(m.biome[i])) totals[m.continent[i]]++;
    continentTotals = { key, totals };
  }
  const owned = new Array(m.continentSizes.length).fill(0);
  for (const t of sim.ownedList[p]) { const c = m.continent[t]; if (c !== 255) owned[c]++; }
  const upkeep = ps.pop * TUNING.economy.foodPerPopPerMin;
  return {
    tick: sim.tick, player: p,
    landOwned: ps.landOwned, landTotal: sim.totalLand, landPermille: Math.floor((ps.landOwned * 1000) / sim.totalLand),
    pop: ps.pop, housing: ps.housing,
    foodIncomePerMin: incomePerMin[0], foodUpkeepPerMin: upkeep, foodBalancePerMin: incomePerMin[0] - upkeep, starving: ps.starving,
    stock: ps.stock.slice(), incomePerMin, depositsFound: ps.found.slice(), units, buildings, army: sim.mil.armyStrength(p),
    continents: continentTotals.totals.map((total, index) => ({ index, owned: owned[index], total })),
    census: sim.ps.map((q, i) => ({ player: i, landOwned: q.landOwned, landPermille: Math.floor((q.landOwned * 1000) / sim.totalLand), pop: q.pop, settlements: settlements[i] })),
    dominationTicks: ps.dominationTicks, winner: sim.winner,
  };
}
