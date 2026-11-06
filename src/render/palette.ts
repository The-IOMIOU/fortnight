// Original color palette. Colors are display-space RGB in [0,1] (color management is disabled).

import { Biome } from '../sim/world/mapgen';

const hex = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export const BIOME_COLORS: [number, number, number][] = [];
BIOME_COLORS[Biome.OCEAN] = hex(0x1f5f8b);
BIOME_COLORS[Biome.LAKE] = hex(0x3d86b8);
BIOME_COLORS[Biome.RIVER] = hex(0x4590c2);
BIOME_COLORS[Biome.ICE] = hex(0xcfe6f2);
BIOME_COLORS[Biome.COAST] = hex(0xdccb8e);
BIOME_COLORS[Biome.PLAINS] = hex(0x8fbf5a);
BIOME_COLORS[Biome.FOREST] = hex(0x3f7d3a);
BIOME_COLORS[Biome.DESERT] = hex(0xe0b867);
BIOME_COLORS[Biome.SWAMP] = hex(0x5a6e3c);
BIOME_COLORS[Biome.MOUNTAIN] = hex(0x8a8178);
BIOME_COLORS[Biome.TUNDRA] = hex(0xa9b59a);
BIOME_COLORS[Biome.SNOW] = hex(0xf2f5f7);

export const CLIFF_COLOR = hex(0x6b5a45);
export const OCEAN_DEEP = hex(0x143f63);

/**
 * Team colors. First 8 are an Okabe–Ito-style colorblind-safe set; slots beyond 8 reuse hues
 * (patterns/labels distinguish them — PLAN §7-B, F-175 in Phase 2).
 */
export const PLAYER_COLORS: [number, number, number][] = [
  hex(0x0072b2), hex(0xe69f00), hex(0x009e73), hex(0xcc79a7),
  hex(0xd55e00), hex(0x56b4e9), hex(0xf0e442), hex(0xffffff),
];
export const playerColor = (p: number): [number, number, number] => PLAYER_COLORS[p % PLAYER_COLORS.length];
export const toCss = (c: [number, number, number]): string => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
