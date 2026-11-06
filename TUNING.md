# TUNING.md: balance and simulation constants

Source of truth is [src/data/tuning.json](src/data/tuning.json). `npm run check` (tools/check-tuning.mjs) fails if a constant there is missing here or its value differs.

## Simulation

| Constant | Value | Why |
|---|---|---|
| `sim.tickHz` | 10 | Fixed sim rate. 10 Hz is enough for RTS orders, keeps lockstep traffic small, and leaves CPU headroom for 32 players. The renderer interpolates to 60 FPS. |
| `sim.maxCatchUpTicks` | 8 | Most ticks run in one loop iteration after a stall. Beyond this, ticks are dropped (shown as "dropped" in the perf HUD) so the page never freezes trying to catch up. |
| `sim.speeds.slow` | 0.5 | 5 ticks/s |
| `sim.speeds.normal` | 1 | 10 ticks/s |
| `sim.speeds.fast` | 2 | 20 ticks/s |
| `sim.speeds.veryFast` | 4 | 40 ticks/s. Speed changes how many ticks run per second, never what a tick does, so results are identical at every speed. |

## Map

| Constant | Value | Why |
|---|---|---|
| `map.sizes.small.tiles` | 128 | 16k tiles. Loads fast (generation about 16 ms in Node), fits 2–4 players for 15–25 min games. |
| `map.sizes.small.maxPlayers` | 4 | |
| `map.sizes.small.rivers` | 5 | Target river count (the generator may place fewer if no valid source is found). |
| `map.sizes.small.lakes` | 2 | Minimum lakes. Extra lakes are carved if natural basins are fewer. |
| `map.sizes.medium.tiles` | 192 | 37k tiles, up to 9 players (player + 8 bots, spec §4 performance target). |
| `map.sizes.medium.maxPlayers` | 9 | |
| `map.sizes.medium.rivers` | 8 | |
| `map.sizes.medium.lakes` | 4 | |
| `map.sizes.large.tiles` | 288 | 83k tiles, up to 16 players. |
| `map.sizes.large.maxPlayers` | 16 | |
| `map.sizes.large.rivers` | 12 | |
| `map.sizes.large.lakes` | 7 | |
| `map.sizes.huge.tiles` | 384 | 147k tiles, up to 32 players (spec maximum). |
| `map.sizes.huge.maxPlayers` | 32 | |
| `map.sizes.huge.rivers` | 16 | |
| `map.sizes.huge.lakes` | 10 | |
| `map.sizes.small.continents` | 3 | Target number of continents (owner decision 2026-11-06: several massive continents separated by ocean). Few enough that each one stays massive. |
| `map.sizes.medium.continents` | 4 | |
| `map.sizes.large.continents` | 5 | |
| `map.sizes.huge.continents` | 7 | |
| `map.channelWidth` | 7 | Minimum ocean strip (tiles) forced along the border between two continents, so they never merge and crossing needs ships. |
| `map.continentMinShareOfLand` | 0.08 | A land mass counts as a continent if it holds ≥ 8 % of all land; smaller ones are islands. |
| `map.landFraction` | 0.42 | Share of tiles above sea level. Gives a large continent with a clear ocean ring. |
| `map.borderOcean` | 6 | Tiles at the map edge forced to ocean, so the continent is always surrounded by sea. |
| `map.minIslandTiles` | 40 | Islands smaller than this are removed. |
| `map.islandKeepFractionOfMain` | 0.03 | Islands smaller than 3 % of the largest continent are also removed, so small specks don't clutter the sea between continents. |
| `map.heightLevels` | 7 | Terrace levels for land. Few enough to read at a glance, enough for high-ground play later. |
| `map.mountainPercentile` | 0.9 | Top 10 % of land elevation is mountain (top 5 % = highest level). |
| `map.snowPeakPercentile` | 0.985 | The highest 1.5 % of land is always snow-capped, so snow exists even when no mountains fall in the cold zone. |
| `map.coldPercentile` | 0.12 | Coldest 12 % of land is tundra/snow. Percentile thresholds guarantee every biome exists on every seed. |
| `map.hotPercentile` | 0.85 | Hottest 15 % of land can become desert. |
| `map.swampMoisturePercentile` | 0.9 | Wettest 10 % of low land becomes swamp. |
| `map.forestMoisturePercentile` | 0.55 | Wetter than median → forest. |
| `map.desertMaxMoisturePercentile` | 0.6 | Hot tiles drier than this become desert. |
| `map.seaIceRange` | 3 | Cold ocean within 3 tiles of land freezes (sea ice for ice fishing, F-107). |
| `map.startMinCoastDistance` | 3 | Start positions sit at least 3 tiles inland. |
| `map.startClaimRadius` | 4 | Starting territory radius. Territory rules proper come in Phase 2 (F-055). |

## Day/night

| Constant | Value | Why |
|---|---|---|
| `dayNight.dayLengthTicks` | 3600 | 6 minutes per full day at 1×: about 3–4 cycles in a Small match, so night-only mechanics (Tidal folk) matter several times. |
| `dayNight.nightTicks` | 1260 | 35 % of the cycle is night. |

## Units

| Constant | Value | Why |
|---|---|---|
| `units.scout.speed` | 358 | Fixed-point sub-units per tick (1024 = 1 tile): about 3.5 tiles/s at 1×. |
| `units.scout.vision` | 7 | Vision radius in tiles. |

## Fog

| Constant | Value | Why |
|---|---|---|
| `fog.explored` | 128 | Fog value for explored-but-not-visible tiles. Also used directly as fog texture intensity. |
| `fog.visible` | 255 | Fog value for currently visible tiles. |

## Bot difficulty

Defined in Phase 4 (F-121).
