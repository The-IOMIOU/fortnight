// Typed ids for resources, unit and building types, entity kinds, tasks — all derived from tuning data.
import { TUNING } from './core/tuning';
import { Biome } from './world/mapgen';

export const Res = { FOOD: 0, WOOD: 1, STONE: 2, GOLD: 3, CARBON: 4, ADAMITE: 5 } as const;
export const RES_NAMES = ['food', 'wood', 'stone', 'gold', 'carbon', 'adamite'] as const;
export type ResName = (typeof RES_NAMES)[number];
export const NUM_RES = RES_NAMES.length;
export const RES_NONE = 255;

export const UNIT_TYPES = ['scout', 'worker', 'settler', 'spearman', 'archer', 'rider', 'ram', 'spy', 'saboteur', 'warship', 'transport',
  // Phase 5: race units (unlocked by each race's evolution tree; beasts also come from taming)
  'beast', 'warbeast', 'thunderlizard', 'tideguard', 'leviathan', 'burrower', 'deepDrill', 'sporeling', 'bloomHulk',
  'glider', 'skyLancer', 'ironguard', 'steamGolem', 'bogStalker', 'mireHorror', 'frostWarden', 'mammoth'] as const;
export type UnitTypeName = (typeof UNIT_TYPES)[number];
export const BUILDING_TYPES = ['capital', 'settlement', 'house', 'farm', 'lumberCamp', 'mineCamp', 'fishingHut', 'storehouse', 'outpost', 'barracks', 'workshop', 'dock', 'wall', 'gate', 'tower',
  // Phase 5: shared tech buildings, then one unique building per race
  'forge', 'pier', 'tidepool', 'beastPen', 'tunnelHall', 'sporeTower', 'aerie', 'greatForge', 'stiltHall', 'iceLodge'] as const;
export type BuildingTypeName = (typeof BUILDING_TYPES)[number];

/** Entity kinds: units 1..63 (1 + unit index), buildings 64.. (64 + building index), nature 128+. */
export const Kind = {
  SCOUT: 1, WORKER: 2, SETTLER: 3, SPEARMAN: 4, ARCHER: 5, RIDER: 6, RAM: 7, SPY: 8, SABOTEUR: 9, WARSHIP: 10, TRANSPORT: 11, BEAST: 12,
  BUILDING_BASE: 64,
  ANIMAL: 128, CARCASS: 129,
} as const;
export const unitKind = (u: UnitTypeName): number => 1 + UNIT_TYPES.indexOf(u);
export const unitTypeOfKind = (k: number): UnitTypeName => UNIT_TYPES[k - 1];
export const isUnitKind = (k: number): boolean => k >= 1 && k < 64;
export const buildingKind = (b: BuildingTypeName): number => Kind.BUILDING_BASE + BUILDING_TYPES.indexOf(b);
export const isBuildingKind = (k: number): boolean => k >= 64 && k < 128;
export const buildingTypeOfKind = (k: number): BuildingTypeName => BUILDING_TYPES[k - Kind.BUILDING_BASE];

export const NATURE_OWNER = 254;

export const Task = {
  IDLE: 0, MOVE: 1, GATHER: 2, RETURN: 3, BUILD: 4, WORK: 5, HUNT: 6, SETTLE: 7,
  ATTACK: 8, HOLD: 9, RETREAT: 10, PATROL: 11, GARRISON: 12, BOARD: 13, DIG: 14, IGNITE: 15, UNLOAD: 16, ROUT: 17,
  TAME: 18, COVERT: 19,
} as const;
export const TASK_NAMES = ['idle', 'moving', 'gathering', 'returning', 'building', 'working', 'hunting', 'settling',
  'attacking', 'holding', 'retreating', 'patrolling', 'garrisoning', 'boarding', 'digging', 'setting fire', 'unloading', 'routing', 'taming', 'on a secret mission'];

export interface UnitDef {
  food: number; wood: number; gold: number; trainTicks: number; pop: number; speed: number; vision: number;
  hp: number; attack: number; range: number; cooldown: number; armor: number; vsUnits: number; vsBuildings: number;
  water: number; stealth: number; capacity: number;
}
export interface BuildingDef {
  size: number; wood: number; stone: number; buildPoints: number; housing: number; territory: number; vision: number; maxWorkers?: number;
  hp: number; attack: number; range: number; cooldown: number; garrison: number;
}
export const unitDef = (u: UnitTypeName): UnitDef => TUNING.unitTypes[u];
export const buildingDef = (b: BuildingTypeName): BuildingDef => TUNING.buildingTypes[b];

/** Which resources each building accepts as a drop-off. */
export const DROPOFF: Partial<Record<BuildingTypeName, number[]>> = {
  capital: [0, 1, 2, 3, 4, 5], settlement: [0, 1, 2, 3, 4, 5], storehouse: [0, 1, 2, 3, 4, 5],
  lumberCamp: [Res.WOOD], mineCamp: [Res.STONE, Res.GOLD, Res.CARBON, Res.ADAMITE],
};
/** Which units each building can train. */
export const TRAINS: Partial<Record<BuildingTypeName, UnitTypeName[]>> = {
  capital: ['worker', 'settler', 'scout'], settlement: ['worker', 'scout'],
  barracks: ['spearman', 'archer', 'rider', 'spy', 'saboteur'], workshop: ['ram'], dock: ['warship', 'transport'],
  // race buildings: what they may train is further limited by the owner's race and evolution (Sim.canTrain)
  tidepool: ['tideguard', 'leviathan'], beastPen: ['warbeast', 'beast', 'thunderlizard'], tunnelHall: ['burrower', 'deepDrill'],
  sporeTower: ['sporeling', 'bloomHulk'], aerie: ['glider', 'skyLancer'], greatForge: ['ironguard', 'steamGolem'],
  stiltHall: ['bogStalker', 'mireHorror'], iceLodge: ['frostWarden', 'mammoth'],
};
/** Unit types that move on water (and only on water). */
export const isNavalUnit = (u: UnitTypeName): boolean => unitDef(u).water === 1;
/** Buildings that block movement for everyone (gates: only for enemies). */
export const DEFENSIVE: Partial<Record<BuildingTypeName, boolean>> = { wall: true, gate: true, tower: true };
/** Buildings units can walk across (fields). */
export const WALKABLE_BUILDING: Partial<Record<BuildingTypeName, boolean>> = { farm: true, pier: true };
/** Buildings that count as settlements (capital + settlement) for territory and elimination. */
export const TOWN_CENTERS: BuildingTypeName[] = ['capital', 'settlement'];

export interface UpgradeDef { wood: number; stone: number; gold: number; ticks: number; housing?: number; territory?: number; yieldPct?: number }
/** Upgrade from level L to L+1 for a building type, if any. */
export function upgradeDef(b: BuildingTypeName, toLevel: number): UpgradeDef | null {
  const key = `${b}${toLevel}` as keyof typeof TUNING.upgrades;
  return (TUNING.upgrades[key] as UpgradeDef | undefined) ?? null;
}

// ---- Biome rules (F-023) ----
const BIOME_KEY: Record<number, keyof typeof TUNING.biomes | null> = {
  [Biome.OCEAN]: null, [Biome.LAKE]: null, [Biome.ICE]: null, [Biome.RIVER]: 'river',
  [Biome.COAST]: 'coast', [Biome.PLAINS]: 'plains', [Biome.FOREST]: 'forest', [Biome.DESERT]: 'desert',
  [Biome.SWAMP]: 'swamp', [Biome.MOUNTAIN]: 'mountain', [Biome.TUNDRA]: 'tundra', [Biome.SNOW]: 'snow',
  [Biome.TRENCH]: null, [Biome.MOAT]: null,
};
export const MOVE_COST = new Int32Array(16);
export const FARM_YIELD = new Int32Array(16);
export const BUILDABLE = new Uint8Array(16);
for (const [b, key] of Object.entries(BIOME_KEY)) {
  if (!key) continue;
  const d = TUNING.biomes[key];
  MOVE_COST[+b] = d.moveCost; FARM_YIELD[+b] = d.farmYield; BUILDABLE[+b] = d.buildable;
}
MOVE_COST[Biome.TRENCH] = TUNING.terrainEdit.trenchMoveCost;
/** Water-class movement: ships sail ocean, lakes and rivers. */
export const WATER_COST = new Int32Array(16);
WATER_COST[Biome.OCEAN] = 10; WATER_COST[Biome.LAKE] = 10; WATER_COST[Biome.RIVER] = 12;

export const TICKS_PER_MIN = TUNING.sim.tickHz * 60;

/** Fighting unit types (auto-acquire targets, count as army). Phase 5 race units are all fighters. */
export const MILITARY_UNIT_TYPES: ReadonlySet<UnitTypeName> = new Set<UnitTypeName>(['spearman', 'archer', 'rider', 'ram', 'saboteur', 'warship', ...UNIT_TYPES.slice(UNIT_TYPES.indexOf('beast'))]);
export const isMilitaryType = (u: UnitTypeName): boolean => MILITARY_UNIT_TYPES.has(u);
