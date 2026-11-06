import tuningJson from '../../data/tuning.json' with { type: 'json' };

export const TUNING = tuningJson;
export type MapSize = keyof typeof tuningJson.map.sizes;
export const MAP_SIZES = Object.keys(tuningJson.map.sizes) as MapSize[];
export type SpeedName = keyof typeof tuningJson.sim.speeds;
export const SPEED_NAMES = Object.keys(tuningJson.sim.speeds) as SpeedName[];
