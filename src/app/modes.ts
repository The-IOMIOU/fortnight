// Game modes (F-193): presets over map size, opponent count and world shape. Data in tuning.json.
import { TUNING, type MapSize } from '../sim/core/tuning';
import type { MapOpts, SeaWidth } from '../sim/world/mapgen';

export type ModeId = 'short' | 'long' | 'continental' | 'custom';
export interface ModeDef { id: Exclude<ModeId, 'custom'>; name: string; blurb: string; sizes: MapSize[]; defaultSize: MapSize; maxBots: number; defaultBots: number; globe: boolean; sea: SeaWidth; continents: number; targetMin: number }

const BLURB: Record<string, [string, string]> = {
  short: ['Short', 'Small map, a few opponents, continents close together. About 15–25 minutes.'],
  long: ['Long', 'Bigger map, more opponents, some seas narrow and some wide. About 30–60 minutes.'],
  continental: ['Continental', 'Massive world of real-continent geography. Hours long: save and come back.'],
};

export const MODES: ModeDef[] = (Object.entries(TUNING.modes) as [ModeDef['id'], (typeof TUNING.modes)['short']][]).map(([id, m]) => ({
  id, name: BLURB[id][0], blurb: BLURB[id][1], sizes: m.sizes as MapSize[], defaultSize: m.defaultSize as MapSize,
  maxBots: m.maxBots, defaultBots: m.defaultBots, globe: !!m.globe, sea: m.sea as SeaWidth, continents: m.continents, targetMin: m.targetMin,
}));
export const modeDef = (id: ModeId): ModeDef | undefined => MODES.find((m) => m.id === id);

/** Size, player count and world for a mode; explicit choices override the preset, within its limits. */
export function modeSettings(id: ModeId, o: { seed: string; bots?: number; size?: MapSize; globe?: boolean; sea?: SeaWidth; continents?: number }): { size: MapSize; players: number; world: Required<MapOpts> } {
  const m = modeDef(id);
  const size = o.size && (!m || m.sizes.includes(o.size)) ? o.size : m?.defaultSize ?? 'small';
  const maxBots = Math.min(m?.maxBots ?? 31, TUNING.map.sizes[size].maxPlayers - 1);
  const bots = Math.max(0, Math.min(maxBots, o.bots ?? m?.defaultBots ?? 3));
  return {
    size, players: bots + 1,
    world: { globe: o.globe ?? m?.globe ?? true, sea: o.sea ?? m?.sea ?? 'mixed', continents: o.continents ?? m?.continents ?? TUNING.map.sizes[size].continents },
  };
}
