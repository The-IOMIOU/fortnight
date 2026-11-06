// Display names and default hotkeys (rebinding arrives with F-174 in Phase 3).
import type { BuildingTypeName, UnitTypeName } from '../sim/defs';

export const BUILDING_NAMES: Record<BuildingTypeName, string> = {
  capital: 'Capital', settlement: 'Settlement', house: 'House', farm: 'Farm', lumberCamp: 'Lumber camp',
  mineCamp: 'Mine camp', fishingHut: 'Fishing hut', storehouse: 'Storehouse', outpost: 'Outpost',
};
export const BUILDING_HELP: Record<BuildingTypeName, string> = {
  capital: 'Seat of your people. Trains workers, settlers and scouts. Accepts all resources.',
  settlement: 'A new town founded by a settler. Claims land, houses people, accepts all resources.',
  house: 'Housing for more people.',
  farm: 'Up to 2 workers grow food. Yield depends on the ground (plains best, desert poor).',
  lumberCamp: 'Drop-off point for wood.',
  mineCamp: 'Drop-off point for stone, gold, carbon and adamite.',
  fishingHut: 'Up to 3 workers fish. Must be next to water; more water nearby means more fish.',
  storehouse: 'Drop-off point for every resource.',
  outpost: 'Claims nearby land and gives vision. Can be built just outside your borders.',
};
export const UNIT_NAMES: Record<UnitTypeName, string> = { scout: 'Scout', worker: 'Worker', settler: 'Settler' };
export const RES_LABELS = ['Food', 'Wood', 'Stone', 'Gold', 'Carbon', 'Adamite'];
export const RES_COLORS = ['#e8705f', '#b98a55', '#a9adb3', '#f2c844', '#585d66', '#8fd9e6'];

/** Building hotkeys while workers (or a settler) are selected. */
export const BUILD_KEYS: Partial<Record<BuildingTypeName, string>> = {
  house: 'h', farm: 'f', lumberCamp: 'l', mineCamp: 'm', fishingHut: 'g', storehouse: 'k', outpost: 't', settlement: 'n',
};
/** Training hotkeys while a building is selected. */
export const TRAIN_KEYS: Record<UnitTypeName, string> = { worker: 'q', scout: 'e', settler: 'r' };
export const UPGRADE_KEY = 'u';
