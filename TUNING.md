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
| `sim.speeds.x8` | 8 | 80 ticks/s. Test speed (F-197): the worker clamps it to `veryFast` unless the FAST_SPEEDS test option is on. |
| `sim.speeds.x16` | 16 | 160 ticks/s. Same rule as `x8`; measured 170 ticks/s on a Small map in Chromium, so the sim keeps up. |

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
| `map.startQualityRadius` | 6 | Start spots are scored by farmland yield within this many tiles (F-192). |
| `map.startForestWanted` | 12 | Forest tiles near a start that count towards its score (wood for the first houses). |
| `map.startQualityPct` | 80 | Only spots scoring ≥ 80 % of the best on their continent are used; then players are spread apart. Added in Phase 4: before, farthest-point sampling pushed starts to continent edges (often desert/tundra) and the poorest start had 0–17 % of the richest start's farmland. |
| `map.seaWidths.0` | 3 | Earth-like seas (F-194): ocean strip between "partner" continents. A narrow strait that transports cross in seconds. |
| `map.seaWidths.1` | 10 | Medium sea, used for about 30 % of non-partner pairs on maps with 6+ continents in `mixed` mode. |
| `map.seaWidths.2` | 30 | Open ocean between continent clusters (`mixed`) and between all pairs (`far`). The 192-wide Medium map can't fit 30 everywhere, so measured farthest gaps there are 15+. |
| `map.globeSeamOcean` | 14 | Globe world (F-195): tiles of forced ocean on each side of the east–west seam, so only ships cross it and no continent is cut in two. |
| `map.globePolarOceanPct` | 12 | Globe maps: the top and bottom 12 % of rows stay ocean (under the ice caps). In the 3D globe view these rows pinch together at the poles, so no land or towns should be there. |
| `map.straitReach` | 16 | Next to a narrow strait the continent's edge falloff fades out over this many tiles, so both coasts actually reach the strait instead of leaving a wide gap. |
| `map.partnerDistPct` | 145 | Partner continent centres are placed at 145/200 of their summed radii, so their falloffs overlap and only the forced strait separates them. |

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

## Biomes (F-023)

Movement cost, farm yield and buildability per land biome. Ocean, lake and sea ice are impassable for land units.

| Constant | Value | Why |
|---|---|---|
| `biomes.coast.moveCost` | 10 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.coast.farmYield` | 80 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.coast.buildable` | 1 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.plains.moveCost` | 10 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.plains.farmYield` | 100 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.plains.buildable` | 1 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.forest.moveCost` | 15 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.forest.farmYield` | 0 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.forest.buildable` | 0 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.desert.moveCost` | 13 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.desert.farmYield` | 35 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.desert.buildable` | 1 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.swamp.moveCost` | 22 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.swamp.farmYield` | 60 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.swamp.buildable` | 1 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.mountain.moveCost` | 28 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.mountain.farmYield` | 0 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.mountain.buildable` | 0 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.tundra.moveCost` | 13 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.tundra.farmYield` | 45 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.tundra.buildable` | 1 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.snow.moveCost` | 32 | Path cost ×10 per tile; speed on a tile = base speed × 10 / cost. Swamp, mountain and snow slow armies down, so terrain matters in Phase 3. |
| `biomes.snow.farmYield` | 0 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.snow.buildable` | 0 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |
| `biomes.river.moveCost` | 30 | Rivers can be forded, but slowly (3×). Without this, rivers would cut continents into pieces. |
| `biomes.river.farmYield` | 0 | Farm output in % of base. Plains are best; desert and tundra poor; forest/mountain/snow can't be farmed. |
| `biomes.river.buildable` | 0 | 1 = buildings allowed. Forest must be cleared first; mountains, snow and rivers never. |

## Deposits (F-050)

Placed by a separate seeded stream, so map hashes did not change.

| Constant | Value | Why |
|---|---|---|
| `deposits.woodPerForestTile` | 200 | Wood per forest tile. A worker cuts a tile in about 8 minutes, so forests recede visibly over a match. |
| `deposits.stone.clustersPer1000Land` | 3 | Deposit clusters per 1000 land tiles. Stone is common, gold rarer, adamite rare (spec §3 calls it a rare metal). |
| `deposits.stone.tiles` | 5 | Tiles per cluster. |
| `deposits.stone.amount` | 400 | Units per deposit tile. |
| `deposits.gold.clustersPer1000Land` | 1 | Deposit clusters per 1000 land tiles. Stone is common, gold rarer, adamite rare (spec §3 calls it a rare metal). |
| `deposits.gold.tiles` | 4 | Tiles per cluster. |
| `deposits.gold.amount` | 300 | Units per deposit tile. |
| `deposits.carbon.clustersPer1000Land` | 2 | Deposit clusters per 1000 land tiles. Stone is common, gold rarer, adamite rare (spec §3 calls it a rare metal). |
| `deposits.carbon.tiles` | 4 | Tiles per cluster. |
| `deposits.carbon.amount` | 300 | Units per deposit tile. |
| `deposits.adamite.clustersPer1000Land` | 0.4 | Deposit clusters per 1000 land tiles. Stone is common, gold rarer, adamite rare (spec §3 calls it a rare metal). |
| `deposits.adamite.tiles` | 3 | Tiles per cluster. |
| `deposits.adamite.amount` | 150 | Units per deposit tile. |
| `deposits.startGuaranteeRadius` | 12 | Every start gets stone and gold within this many tiles, so no start is crippled by bad luck. |

## Wildlife (F-031)

| Constant | Value | Why |
|---|---|---|
| `animals.landTilesPerAnimal` | 250 | One wild animal per 250 land tiles: enough hunting for an early food boost, not a full economy. |
| `animals.food` | 120 | Food in a carcass. |
| `animals.speed` | 200 | Fixed-point sub-units per tick (≈2 tiles/s), slower than a worker so hunters can catch them. |
| `animals.wanderRadius` | 6 | Animals stay within this many tiles of where they spawned. |
| `animals.wanderEveryTicks` | 80 | How often an idle animal picks a new spot (8 s). |

## Economy (F-051 – F-057, F-131)

Rates are integers per minute; the sim converts them with exact integer accumulators (no rounding drift).

| Constant | Value | Why |
|---|---|---|
| `economy.carryCapacity` | 10 | Units a worker carries before walking back to a drop-off. Drop-off placement matters. |
| `economy.gatherPerMin.wood` | 24 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.gatherPerMin.stone` | 18 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.gatherPerMin.gold` | 14 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.gatherPerMin.carbon` | 16 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.gatherPerMin.adamite` | 8 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.gatherPerMin.carcass` | 30 | Per working worker per minute (measured exactly by tests/economy.test.ts). Rarer resources gather slower. |
| `economy.farmFoodPerWorkerPerMin` | 18 | Per worker on plains (×biome yield). 2 workers feed 18 people. |
| `economy.fishFoodPerWorkerPerMin` | 20 | Per worker at full water. Fishing slightly beats farming but needs a coast. |
| `economy.fishWaterTilesForFull` | 12 | Water tiles within 3 tiles of the hut needed for 100 % yield. |
| `economy.foodPerPopPerMin` | 2 | Upkeep per person. Food is the constant pressure that drives expansion. |
| `economy.starvingRatePct` | 50 | Gather/build speed while starving (training also stops). Harsh but recoverable. |
| `economy.buildPointsPerWorkerTick` | 1 | Each builder adds this per tick, so build time halves with two workers (verified). |
| `economy.trainQueueMax` | 5 | Queued units per building. |
| `economy.settlementMinDistance` | 10 | Towns at least this far apart, so expansion spreads across continents. |
| `economy.outpostReachOutsideTerritory` | 2 | Outposts can be placed this many tiles beyond your border: the way to push territory without settlers. |
| `economy.dominationPct` | 70 | Spec §1.1 default 70 %. |
| `economy.dominationHoldTicks` | 3000 | Hold for 5 minutes, so others have time to react. |

## Units (Phase 2)

| Constant | Value | Why |
|---|---|---|
| `unitTypes.worker.food` | 50 | Cost in food. |
| `unitTypes.worker.wood` | 0 | Cost in wood. |
| `unitTypes.worker.trainTicks` | 120 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.worker.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.worker.speed` | 280 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.worker.vision` | 5 | Vision radius in tiles. |
| `unitTypes.settler.food` | 120 | Cost in food. |
| `unitTypes.settler.wood` | 60 | Cost in wood. |
| `unitTypes.settler.trainTicks` | 250 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.settler.pop` | 2 | Housing used. Settlers count double: they are a family. |
| `unitTypes.settler.speed` | 240 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.settler.vision` | 5 | Vision radius in tiles. |
| `unitTypes.scout.food` | 40 | Cost in food. |
| `unitTypes.scout.wood` | 0 | Cost in wood. |
| `unitTypes.scout.trainTicks` | 100 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.scout.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.scout.speed` | 358 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.scout.vision` | 7 | Vision radius in tiles. |

## Buildings (F-053)

| Constant | Value | Why |
|---|---|---|
| `buildingTypes.capital.size` | 3 | Footprint in tiles (square). |
| `buildingTypes.capital.wood` | 0 | Cost in wood. |
| `buildingTypes.capital.stone` | 0 | Cost in stone. |
| `buildingTypes.capital.buildPoints` | 0 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.capital.housing` | 10 | People housed. |
| `buildingTypes.capital.territory` | 7 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.capital.vision` | 9 | Vision radius in tiles. |
| `buildingTypes.settlement.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.settlement.wood` | 0 | Cost in wood. |
| `buildingTypes.settlement.stone` | 0 | Cost in stone. |
| `buildingTypes.settlement.buildPoints` | 0 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.settlement.housing` | 5 | People housed. |
| `buildingTypes.settlement.territory` | 6 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.settlement.vision` | 8 | Vision radius in tiles. |
| `buildingTypes.house.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.house.wood` | 40 | Cost in wood. |
| `buildingTypes.house.stone` | 0 | Cost in stone. |
| `buildingTypes.house.buildPoints` | 200 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.house.housing` | 6 | People housed. |
| `buildingTypes.house.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.house.vision` | 3 | Vision radius in tiles. |
| `buildingTypes.farm.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.farm.wood` | 60 | Cost in wood. |
| `buildingTypes.farm.stone` | 0 | Cost in stone. |
| `buildingTypes.farm.buildPoints` | 250 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.farm.housing` | 0 | People housed. |
| `buildingTypes.farm.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.farm.vision` | 3 | Vision radius in tiles. |
| `buildingTypes.farm.maxWorkers` | 2 | Workers that can work here at once. |
| `buildingTypes.lumberCamp.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.lumberCamp.wood` | 50 | Cost in wood. |
| `buildingTypes.lumberCamp.stone` | 0 | Cost in stone. |
| `buildingTypes.lumberCamp.buildPoints` | 150 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.lumberCamp.housing` | 0 | People housed. |
| `buildingTypes.lumberCamp.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.lumberCamp.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.mineCamp.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.mineCamp.wood` | 60 | Cost in wood. |
| `buildingTypes.mineCamp.stone` | 0 | Cost in stone. |
| `buildingTypes.mineCamp.buildPoints` | 200 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.mineCamp.housing` | 0 | People housed. |
| `buildingTypes.mineCamp.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.mineCamp.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.fishingHut.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.fishingHut.wood` | 50 | Cost in wood. |
| `buildingTypes.fishingHut.stone` | 0 | Cost in stone. |
| `buildingTypes.fishingHut.buildPoints` | 180 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.fishingHut.housing` | 0 | People housed. |
| `buildingTypes.fishingHut.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.fishingHut.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.fishingHut.maxWorkers` | 3 | Workers that can work here at once. |
| `buildingTypes.storehouse.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.storehouse.wood` | 80 | Cost in wood. |
| `buildingTypes.storehouse.stone` | 20 | Cost in stone. |
| `buildingTypes.storehouse.buildPoints` | 300 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.storehouse.housing` | 0 | People housed. |
| `buildingTypes.storehouse.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.storehouse.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.outpost.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.outpost.wood` | 40 | Cost in wood. |
| `buildingTypes.outpost.stone` | 40 | Cost in stone. |
| `buildingTypes.outpost.buildPoints` | 250 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.outpost.housing` | 0 | People housed. |
| `buildingTypes.outpost.territory` | 4 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.outpost.vision` | 7 | Vision radius in tiles. |

## Upgrades (F-057)

Key = building + target level.

| Constant | Value | Why |
|---|---|---|
| `upgrades.capital2.wood` | 150 | Upgrade cost in wood. |
| `upgrades.capital2.stone` | 100 | Upgrade cost in stone. |
| `upgrades.capital2.gold` | 0 | Upgrade cost in gold (first use of gold). |
| `upgrades.capital2.ticks` | 400 | Upgrade time in ticks (no workers needed). |
| `upgrades.capital2.housing` | 10 | Extra housing at the new level. |
| `upgrades.capital2.territory` | 2 | Extra territory radius at the new level. |
| `upgrades.capital3.wood` | 300 | Upgrade cost in wood. |
| `upgrades.capital3.stone` | 250 | Upgrade cost in stone. |
| `upgrades.capital3.gold` | 100 | Upgrade cost in gold (first use of gold). |
| `upgrades.capital3.ticks` | 600 | Upgrade time in ticks (no workers needed). |
| `upgrades.capital3.housing` | 10 | Extra housing at the new level. |
| `upgrades.capital3.territory` | 2 | Extra territory radius at the new level. |
| `upgrades.house2.wood` | 40 | Upgrade cost in wood. |
| `upgrades.house2.stone` | 30 | Upgrade cost in stone. |
| `upgrades.house2.gold` | 0 | Upgrade cost in gold (first use of gold). |
| `upgrades.house2.ticks` | 150 | Upgrade time in ticks (no workers needed). |
| `upgrades.house2.housing` | 4 | Extra housing at the new level. |
| `upgrades.house2.territory` | 0 | Extra territory radius at the new level. |
| `upgrades.farm2.wood` | 60 | Upgrade cost in wood. |
| `upgrades.farm2.stone` | 40 | Upgrade cost in stone. |
| `upgrades.farm2.gold` | 0 | Upgrade cost in gold (first use of gold). |
| `upgrades.farm2.ticks` | 200 | Upgrade time in ticks (no workers needed). |
| `upgrades.farm2.yieldPct` | 30 | Extra farm yield (%) at level 2. |

## Units (Phase 2)

| Constant | Value | Why |
|---|---|---|
| `unitTypes.scout.gold` | 0 | Cost in gold. |
| `unitTypes.scout.hp` | 50 | Hit points. |
| `unitTypes.scout.attack` | 3 | Damage per hit before modifiers. |
| `unitTypes.scout.range` | 12 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.scout.cooldown` | 12 | Ticks between hits (10 = 1 s). |
| `unitTypes.scout.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.scout.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.scout.vsBuildings` | 30 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.scout.water` | 0 | 1 = sails on water only. |
| `unitTypes.scout.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.scout.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.worker.gold` | 0 | Cost in gold. |
| `unitTypes.worker.hp` | 40 | Hit points. |
| `unitTypes.worker.attack` | 2 | Damage per hit before modifiers. |
| `unitTypes.worker.range` | 12 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.worker.cooldown` | 15 | Ticks between hits (10 = 1 s). |
| `unitTypes.worker.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.worker.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.worker.vsBuildings` | 30 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.worker.water` | 0 | 1 = sails on water only. |
| `unitTypes.worker.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.worker.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.settler.gold` | 0 | Cost in gold. |
| `unitTypes.settler.hp` | 60 | Hit points. |
| `unitTypes.settler.attack` | 0 | Damage per hit before modifiers. |
| `unitTypes.settler.range` | 0 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.settler.cooldown` | 0 | Ticks between hits (10 = 1 s). |
| `unitTypes.settler.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.settler.vsUnits` | 0 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.settler.vsBuildings` | 0 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.settler.water` | 0 | 1 = sails on water only. |
| `unitTypes.settler.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.settler.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.spearman.food` | 50 | Cost in food. |
| `unitTypes.spearman.wood` | 20 | Cost in wood. |
| `unitTypes.spearman.gold` | 0 | Cost in gold. |
| `unitTypes.spearman.trainTicks` | 150 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.spearman.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.spearman.speed` | 260 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.spearman.vision` | 6 | Vision radius in tiles. |
| `unitTypes.spearman.hp` | 110 | Hit points. |
| `unitTypes.spearman.attack` | 11 | Damage per hit before modifiers. |
| `unitTypes.spearman.range` | 12 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.spearman.cooldown` | 10 | Ticks between hits (10 = 1 s). |
| `unitTypes.spearman.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.spearman.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.spearman.vsBuildings` | 50 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.spearman.water` | 0 | 1 = sails on water only. |
| `unitTypes.spearman.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.spearman.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.archer.food` | 40 | Cost in food. |
| `unitTypes.archer.wood` | 45 | Cost in wood. |
| `unitTypes.archer.gold` | 0 | Cost in gold. |
| `unitTypes.archer.trainTicks` | 160 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.archer.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.archer.speed` | 270 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.archer.vision` | 8 | Vision radius in tiles. |
| `unitTypes.archer.hp` | 65 | Hit points. |
| `unitTypes.archer.attack` | 8 | Damage per hit before modifiers. |
| `unitTypes.archer.range` | 65 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.archer.cooldown` | 15 | Ticks between hits (10 = 1 s). |
| `unitTypes.archer.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.archer.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.archer.vsBuildings` | 20 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.archer.water` | 0 | 1 = sails on water only. |
| `unitTypes.archer.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.archer.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.rider.food` | 80 | Cost in food. |
| `unitTypes.rider.wood` | 0 | Cost in wood. |
| `unitTypes.rider.gold` | 40 | Cost in gold. |
| `unitTypes.rider.trainTicks` | 200 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.rider.pop` | 2 | Housing used. Settlers count double: they are a family. |
| `unitTypes.rider.speed` | 430 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.rider.vision` | 8 | Vision radius in tiles. |
| `unitTypes.rider.hp` | 150 | Hit points. |
| `unitTypes.rider.attack` | 13 | Damage per hit before modifiers. |
| `unitTypes.rider.range` | 13 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.rider.cooldown` | 12 | Ticks between hits (10 = 1 s). |
| `unitTypes.rider.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.rider.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.rider.vsBuildings` | 40 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.rider.water` | 0 | 1 = sails on water only. |
| `unitTypes.rider.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.rider.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.ram.food` | 0 | Cost in food. |
| `unitTypes.ram.wood` | 120 | Cost in wood. |
| `unitTypes.ram.gold` | 0 | Cost in gold. |
| `unitTypes.ram.trainTicks` | 300 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.ram.pop` | 3 | Housing used. Settlers count double: they are a family. |
| `unitTypes.ram.speed` | 150 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.ram.vision` | 4 | Vision radius in tiles. |
| `unitTypes.ram.hp` | 260 | Hit points. |
| `unitTypes.ram.attack` | 30 | Damage per hit before modifiers. |
| `unitTypes.ram.range` | 13 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.ram.cooldown` | 25 | Ticks between hits (10 = 1 s). |
| `unitTypes.ram.armor` | 6 | Flat damage reduction per hit. |
| `unitTypes.ram.vsUnits` | 20 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.ram.vsBuildings` | 500 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.ram.water` | 0 | 1 = sails on water only. |
| `unitTypes.ram.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.ram.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.spy.food` | 40 | Cost in food. |
| `unitTypes.spy.wood` | 0 | Cost in wood. |
| `unitTypes.spy.gold` | 40 | Cost in gold. |
| `unitTypes.spy.trainTicks` | 150 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.spy.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.spy.speed` | 320 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.spy.vision` | 9 | Vision radius in tiles. |
| `unitTypes.spy.hp` | 40 | Hit points. |
| `unitTypes.spy.attack` | 0 | Damage per hit before modifiers. |
| `unitTypes.spy.range` | 0 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.spy.cooldown` | 0 | Ticks between hits (10 = 1 s). |
| `unitTypes.spy.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.spy.vsUnits` | 0 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.spy.vsBuildings` | 0 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.spy.water` | 0 | 1 = sails on water only. |
| `unitTypes.spy.stealth` | 1 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.spy.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.saboteur.food` | 40 | Cost in food. |
| `unitTypes.saboteur.wood` | 0 | Cost in wood. |
| `unitTypes.saboteur.gold` | 50 | Cost in gold. |
| `unitTypes.saboteur.trainTicks` | 180 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.saboteur.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.saboteur.speed` | 300 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.saboteur.vision` | 6 | Vision radius in tiles. |
| `unitTypes.saboteur.hp` | 50 | Hit points. |
| `unitTypes.saboteur.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.saboteur.range` | 12 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.saboteur.cooldown` | 20 | Ticks between hits (10 = 1 s). |
| `unitTypes.saboteur.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.saboteur.vsUnits` | 30 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.saboteur.vsBuildings` | 300 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.saboteur.water` | 0 | 1 = sails on water only. |
| `unitTypes.saboteur.stealth` | 1 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.saboteur.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.warship.food` | 0 | Cost in food. |
| `unitTypes.warship.wood` | 150 | Cost in wood. |
| `unitTypes.warship.gold` | 20 | Cost in gold. |
| `unitTypes.warship.trainTicks` | 300 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.warship.pop` | 3 | Housing used. Settlers count double: they are a family. |
| `unitTypes.warship.speed` | 300 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.warship.vision` | 9 | Vision radius in tiles. |
| `unitTypes.warship.hp` | 220 | Hit points. |
| `unitTypes.warship.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.warship.range` | 55 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.warship.cooldown` | 18 | Ticks between hits (10 = 1 s). |
| `unitTypes.warship.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.warship.vsUnits` | 100 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.warship.vsBuildings` | 60 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.warship.water` | 1 | 1 = sails on water only. |
| `unitTypes.warship.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.warship.capacity` | 0 | Transport capacity in housing (pop) units. |
| `unitTypes.transport.food` | 0 | Cost in food. |
| `unitTypes.transport.wood` | 100 | Cost in wood. |
| `unitTypes.transport.gold` | 0 | Cost in gold. |
| `unitTypes.transport.trainTicks` | 220 | Training time in ticks (10 = 1 s at 1×). |
| `unitTypes.transport.pop` | 1 | Housing used. Settlers count double: they are a family. |
| `unitTypes.transport.speed` | 320 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.transport.vision` | 6 | Vision radius in tiles. |
| `unitTypes.transport.hp` | 160 | Hit points. |
| `unitTypes.transport.attack` | 0 | Damage per hit before modifiers. |
| `unitTypes.transport.range` | 0 | Weapon range in tenths of a tile (12 = melee, 65 = 6.5 tiles). |
| `unitTypes.transport.cooldown` | 0 | Ticks between hits (10 = 1 s). |
| `unitTypes.transport.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.transport.vsUnits` | 0 | Damage vs units, % (rams are weak against soldiers). |
| `unitTypes.transport.vsBuildings` | 0 | Damage vs buildings, % (rams ×5, archers barely scratch walls). |
| `unitTypes.transport.water` | 1 | 1 = sails on water only. |
| `unitTypes.transport.stealth` | 0 | 1 = invisible to enemies more than 2 tiles away. |
| `unitTypes.transport.capacity` | 8 | Transport capacity in housing (pop) units. |

## Buildings (F-053)

| Constant | Value | Why |
|---|---|---|
| `buildingTypes.capital.hp` | 2200 | Hit points. Lowered from 3000 in Phase 4: bot armies of ~12 soldiers + 2 rams took over 10 minutes to raze a capital, so many headless matches timed out. |
| `buildingTypes.capital.attack` | 6 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.capital.range` | 70 | Arrow range in tenths of a tile. |
| `buildingTypes.capital.cooldown` | 15 | Ticks between arrows. |
| `buildingTypes.capital.garrison` | 10 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.settlement.hp` | 1500 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.settlement.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.settlement.range` | 70 | Arrow range in tenths of a tile. |
| `buildingTypes.settlement.cooldown` | 15 | Ticks between arrows. |
| `buildingTypes.settlement.garrison` | 6 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.house.hp` | 300 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.house.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.house.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.house.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.house.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.farm.hp` | 250 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.farm.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.farm.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.farm.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.farm.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.lumberCamp.hp` | 300 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.lumberCamp.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.lumberCamp.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.lumberCamp.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.lumberCamp.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.mineCamp.hp` | 300 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.mineCamp.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.mineCamp.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.mineCamp.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.mineCamp.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.fishingHut.hp` | 250 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.fishingHut.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.fishingHut.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.fishingHut.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.fishingHut.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.storehouse.hp` | 600 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.storehouse.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.storehouse.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.storehouse.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.storehouse.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.outpost.hp` | 400 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.outpost.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.outpost.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.outpost.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.outpost.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.barracks.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.barracks.wood` | 120 | Cost in wood. |
| `buildingTypes.barracks.stone` | 30 | Cost in stone. |
| `buildingTypes.barracks.buildPoints` | 350 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.barracks.housing` | 0 | People housed. |
| `buildingTypes.barracks.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.barracks.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.barracks.hp` | 900 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.barracks.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.barracks.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.barracks.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.barracks.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.workshop.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.workshop.wood` | 150 | Cost in wood. |
| `buildingTypes.workshop.stone` | 60 | Cost in stone. |
| `buildingTypes.workshop.buildPoints` | 400 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.workshop.housing` | 0 | People housed. |
| `buildingTypes.workshop.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.workshop.vision` | 4 | Vision radius in tiles. |
| `buildingTypes.workshop.hp` | 800 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.workshop.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.workshop.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.workshop.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.workshop.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.dock.size` | 2 | Footprint in tiles (square). |
| `buildingTypes.dock.wood` | 120 | Cost in wood. |
| `buildingTypes.dock.stone` | 0 | Cost in stone. |
| `buildingTypes.dock.buildPoints` | 350 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.dock.housing` | 0 | People housed. |
| `buildingTypes.dock.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.dock.vision` | 6 | Vision radius in tiles. |
| `buildingTypes.dock.hp` | 700 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.dock.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.dock.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.dock.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.dock.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.wall.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.wall.wood` | 0 | Cost in wood. |
| `buildingTypes.wall.stone` | 8 | Cost in stone. |
| `buildingTypes.wall.buildPoints` | 50 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.wall.housing` | 0 | People housed. |
| `buildingTypes.wall.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.wall.vision` | 3 | Vision radius in tiles. |
| `buildingTypes.wall.hp` | 500 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.wall.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.wall.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.wall.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.wall.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.gate.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.gate.wood` | 10 | Cost in wood. |
| `buildingTypes.gate.stone` | 20 | Cost in stone. |
| `buildingTypes.gate.buildPoints` | 80 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.gate.housing` | 0 | People housed. |
| `buildingTypes.gate.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.gate.vision` | 3 | Vision radius in tiles. |
| `buildingTypes.gate.hp` | 600 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.gate.attack` | 0 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.gate.range` | 0 | Arrow range in tenths of a tile. |
| `buildingTypes.gate.cooldown` | 0 | Ticks between arrows. |
| `buildingTypes.gate.garrison` | 0 | Soldiers that can shelter inside (each adds arrows). |
| `buildingTypes.tower.size` | 1 | Footprint in tiles (square). |
| `buildingTypes.tower.wood` | 40 | Cost in wood. |
| `buildingTypes.tower.stone` | 60 | Cost in stone. |
| `buildingTypes.tower.buildPoints` | 300 | Worker-ticks to build (one worker = this many ticks). Capital/settlement are never built by workers. |
| `buildingTypes.tower.housing` | 0 | People housed. |
| `buildingTypes.tower.territory` | 0 | Land claimed around the building (radius in tiles, only unclaimed land). |
| `buildingTypes.tower.vision` | 9 | Vision radius in tiles. |
| `buildingTypes.tower.hp` | 800 | Hit points. Under construction, HP grows with build progress. |
| `buildingTypes.tower.attack` | 9 | Arrow damage (towers, capital) before garrison bonus. |
| `buildingTypes.tower.range` | 70 | Arrow range in tenths of a tile. |
| `buildingTypes.tower.cooldown` | 15 | Ticks between arrows. |
| `buildingTypes.tower.garrison` | 4 | Soldiers that can shelter inside (each adds arrows). |

## Combat (F-074)

Damage = attack × vs% × tier% × height% × cover% → minus armor → × armor-tier%, minimum 1; integer math, each factor floored in order (tests/combat.test.ts checks the exact numbers).

| Constant | Value | Why |
|---|---|---|
| `combat.heightBonusPct` | 25 | Attacker on a higher terrace deals +25 %: high ground matters. |
| `combat.heightPenaltyPct` | 15 | Attacking uphill deals −15 %. |
| `combat.forestCoverPct` | 25 | Ranged damage −25 % against units in forest. |
| `combat.trenchCoverPct` | 35 | Ranged damage −35 % against units in a trench. |
| `combat.trenchMeleePenaltyPct` | 20 | Fighting out of a trench in melee: −20 %. |
| `combat.fortifiedPct` | 40 | Ranged damage −40 % against units next to a friendly wall, gate or tower. |
| `combat.weaponTierPct` | 15 | +15 % damage per weapon tier (gear arrives in Phase 5). |
| `combat.armorTierPct` | 15 | −15 % damage taken per armor tier. |
| `combat.garrisonArrowBonus` | 3 | Each garrisoned soldier adds 3 to a tower/town arrow. |
| `combat.acquireRange` | 7 | Idle/patrolling soldiers attack enemies within this many tiles. |
| `combat.meleeBlockedSearch` | 12 | A melee unit that cannot reach its target attacks the nearest enemy wall/gate/tower within this many tiles (once). |

## Morale (F-075)

| Constant | Value | Why |
|---|---|---|
| `morale.max` | 100 | Full morale. |
| `morale.routBelow` | 25 | Below this, soldiers flee home (rout). |
| `morale.rallyAbove` | 55 | Routing soldiers stop fleeing once morale is back above this. |
| `morale.lossPerHpPct` | 150 | Morale lost per % of max HP lost, ×1.5: soldiers break at about half health (tuned in Phase 3: at 60 they died before ever routing). |
| `morale.allyDeathLoss` | 15 | Morale lost when a nearby ally dies. |
| `morale.allyDeathRadius` | 4 | Tiles. |
| `morale.recoverPerSecond` | 4 | Morale regained per second once not hit for recoverDelayTicks (doubled while retreating). |
| `morale.recoverDelayTicks` | 50 | 5 s without being hit before morale recovers. |

## Trenches and moats (F-041, F-042)

| Constant | Value | Why |
|---|---|---|
| `terrainEdit.trenchBuildPoints` | 120 | Worker-ticks to dig one trench tile (12 s for one worker). |
| `terrainEdit.trenchMoveCost` | 35 | Trenches are slow to cross (3.5× plains) but passable until flooded. |
| `terrainEdit.moatFillTicks` | 20 | Water advances one trench tile every 2 s from adjacent sea, lake, river or moat. |

## Fire (F-045)

| Constant | Value | Why |
|---|---|---|
| `fire.burnTicks` | 300 | A tile burns for 30 s. |
| `fire.spreadEveryTicks` | 20 | Spread attempt every 2 s. |
| `fire.spreadChancePct` | 35 | Chance per attempt to ignite each adjacent forest/building tile (seeded RNG stream, deterministic). |
| `fire.unitDamagePerSecond` | 6 | Damage to units standing in fire. |
| `fire.buildingDamagePerSecond` | 25 | Damage to burning buildings (a house burns down in ~12 s). |
| `fire.igniteTicks` | 30 | Time a unit needs to set something alight. |

## Groups and transports (F-078, F-083)

| Constant | Value | Why |
|---|---|---|
| `groups.flowFieldMinUnits` | 6 | Groups this big share one flow field instead of one A* path each. |
| `groups.flowFieldCache` | 12 | Flow fields kept (LRU). Cleared on any terrain/building change; recomputing is deterministic. |
| `groups.transportBoardRange` | 2 | Land units board a transport from up to 2 tiles away. |

## Bot difficulty (F-121)

The same bot code runs at every difficulty; only these numbers change. No difficulty sees through fog (F-122) — Impossible plays faster and wider, it does not cheat. Its +income bonus is optional, off by default, and shown in the HUD and settings when on.

| Constant | Easy | Hard | Impossible | What it does |
|---|---|---|---|---|
| `bots.easy.thinkEvery` / `bots.hard.thinkEvery` / `bots.impossible.thinkEvery` | 40 | 10 | 5 | Ticks between decisions (10 = 1 s). Easy reacts every 4 s, Hard every second, Impossible twice a second. |
| `bots.easy.actionChancePct` / `bots.hard.actionChancePct` / `bots.impossible.actionChancePct` | 55 | 100 | 100 | Chance to act on a decision each think (training, building, settling, fortifying). Easy hesitates almost half the time. |
| `bots.easy.workerTarget` / `bots.hard.workerTarget` / `bots.impossible.workerTarget` | 11 | 20 | 26 | Workers the bot aims for. More workers = stronger economy. |
| `bots.easy.armyAttackSize` / `bots.hard.armyAttackSize` / `bots.impossible.armyAttackSize` | 5 | 12 | 16 | Soldiers gathered before a land attack or an invasion wave. |
| `bots.easy.maxBarracks` / `bots.hard.maxBarracks` / `bots.impossible.maxBarracks` | 1 | 2 | 3 | Barracks the bot builds (production rate of soldiers). |
| `bots.easy.useDefences` / `bots.hard.useDefences` / `bots.impossible.useDefences` | 0 | 1 | 1 | 1 = builds towers and walls when its goal is defense (only personalities with defences ≥ 0.5). |
| `bots.easy.sizeWaves` / `bots.hard.sizeWaves` / `bots.impossible.sizeWaves` | 0 | 1 | 1 | 1 = counts visible defenders around the target and sends invasion waves big enough to beat them. |
| `bots.easy.retreatWounded` / `bots.hard.retreatWounded` / `bots.impossible.retreatWounded` | 0 | 0 | 1 | 1 = pulls soldiers below 30 % HP out of fights (micro). |
| `bots.easy.maxTowns` / `bots.hard.maxTowns` / `bots.impossible.maxTowns` | 2 | 3 | 4 | Towns (capital + settlements) the bot tries to own. |

| Constant | Value | Why |
|---|---|---|
| `bots.impossibleIncomeBonusPct` | 25 | Optional extra income for Impossible bots (menu toggle, off by default; badge in HUD when on). |
| `bots.boredomStartMin` | 8 | From this minute the attack drive starts to grow even without a full army, so bots don't turtle forever. |
| `bots.boredomFullMin` | 25 | Boredom reaches its maximum here. After minute 30 every personality escalates further, and after 35 the attack weight is at least 0.9 (pacifists too) so matches end. |
| `bots.threatRadius` | 12 | Enemy soldiers within this many tiles of the bot's buildings count as a threat (defense score). |
| `bots.matchLimitMin` | 90 | Headless harness time limit (game minutes). Raised from 60 to 90: invasions across the sea on Small maps often decide the match after minute 45. |

## Game modes (F-193)

Presets for the New Game menu. The player can still change every value under "More settings" (or pick Custom).

| Constant | Value | Why |
|---|---|---|
| `modes.short.sizes.0` | small | Short games only use the Small map. |
| `modes.short.defaultSize` | small | |
| `modes.short.maxBots` | 3 | Small maps hold 4 players (`map.sizes.small.maxPlayers`). |
| `modes.short.defaultBots` | 2 | Few opponents keep the game in the 15–25 min target. |
| `modes.short.globe` | 1 | 1 = wrap-around globe world by default. |
| `modes.short.sea` | close | Narrow straits everywhere, so invasions start early. |
| `modes.short.continents` | 2 | Two continents: less sea to explore, shorter games (the Phase 4 Small median was 34.6 min with 3). |
| `modes.short.targetMin` | 20 | Target match length shown on the mode card. |
| `modes.long.sizes.0` | medium | |
| `modes.long.sizes.1` | large | |
| `modes.long.defaultSize` | medium | |
| `modes.long.maxBots` | 15 | Large maps hold 16 players; the menu also caps by the chosen size. |
| `modes.long.defaultBots` | 5 | |
| `modes.long.globe` | 1 | |
| `modes.long.sea` | mixed | Partner continents on narrow straits, open ocean between pairs (Earth-like). |
| `modes.long.continents` | 4 | |
| `modes.long.targetMin` | 45 | Target 30–60 min. |
| `modes.continental.sizes.0` | large | |
| `modes.continental.sizes.1` | huge | |
| `modes.continental.defaultSize` | huge | |
| `modes.continental.maxBots` | 31 | Spec maximum of 32 players. |
| `modes.continental.defaultBots` | 9 | Kept moderate by default for performance; the player can raise it. |
| `modes.continental.globe` | 1 | |
| `modes.continental.sea` | mixed | |
| `modes.continental.continents` | 7 | |
| `modes.continental.targetMin` | 120 | Played over several sessions with save and resume. |

## Race units (Phase 5, F-096)

Each race unit is trained at its race's unique building once the evolution node that unlocks it is researched. Capstones cost about as much as 5–6 basic soldiers and are worth about as much.

| Constant | Value | Why |
|---|---|---|
| `unitTypes.beast.food` | 60 | Wildbond: a tamed (free) or revived animal. Mid-strength melee, a bit faster than a spearman. Cost in food. |
| `unitTypes.beast.wood` | 0 | Cost in wood. |
| `unitTypes.beast.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.beast.trainTicks` | 150 | Training time in ticks. |
| `unitTypes.beast.pop` | 1 | Housing used. |
| `unitTypes.beast.speed` | 300 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.beast.vision` | 6 | Vision radius in tiles. |
| `unitTypes.beast.hp` | 120 | Hit points. |
| `unitTypes.beast.attack` | 10 | Damage per hit before modifiers. |
| `unitTypes.beast.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.beast.cooldown` | 11 | Ticks between hits. |
| `unitTypes.beast.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.beast.vsUnits` | 100 | Damage % against units. |
| `unitTypes.beast.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.beast.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.beast.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.beast.capacity` | 0 | Transport capacity (0). |
| `unitTypes.warbeast.food` | 90 | Wildbond tier 1: fast heavy melee, between a spearman and a rider. Cost in food. |
| `unitTypes.warbeast.wood` | 0 | Cost in wood. |
| `unitTypes.warbeast.gold` | 20 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.warbeast.trainTicks` | 220 | Training time in ticks. |
| `unitTypes.warbeast.pop` | 2 | Housing used. |
| `unitTypes.warbeast.speed` | 340 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.warbeast.vision` | 7 | Vision radius in tiles. |
| `unitTypes.warbeast.hp` | 220 | Hit points. |
| `unitTypes.warbeast.attack` | 16 | Damage per hit before modifiers. |
| `unitTypes.warbeast.range` | 13 | Reach ×10 tiles (12 = melee). |
| `unitTypes.warbeast.cooldown` | 12 | Ticks between hits. |
| `unitTypes.warbeast.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.warbeast.vsUnits` | 110 | Damage % against units. |
| `unitTypes.warbeast.vsBuildings` | 60 | Damage % against buildings. |
| `unitTypes.warbeast.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.warbeast.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.warbeast.capacity` | 0 | Transport capacity (0). |
| `unitTypes.thunderlizard.food` | 300 | Wildbond capstone (long research): a giant reptile worth about 6 spearmen, strong against buildings. Cost in food. |
| `unitTypes.thunderlizard.wood` | 0 | Cost in wood. |
| `unitTypes.thunderlizard.gold` | 120 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.thunderlizard.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.thunderlizard.pop` | 6 | Housing used. |
| `unitTypes.thunderlizard.speed` | 220 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.thunderlizard.vision` | 9 | Vision radius in tiles. |
| `unitTypes.thunderlizard.hp` | 900 | Hit points. |
| `unitTypes.thunderlizard.attack` | 40 | Damage per hit before modifiers. |
| `unitTypes.thunderlizard.range` | 15 | Reach ×10 tiles (12 = melee). |
| `unitTypes.thunderlizard.cooldown` | 18 | Ticks between hits. |
| `unitTypes.thunderlizard.armor` | 5 | Flat damage reduction per hit. |
| `unitTypes.thunderlizard.vsUnits` | 120 | Damage % against units. |
| `unitTypes.thunderlizard.vsBuildings` | 250 | Damage % against buildings. |
| `unitTypes.thunderlizard.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.thunderlizard.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.thunderlizard.capacity` | 0 | Transport capacity (0). |
| `unitTypes.tideguard.food` | 60 | Deepkin tier 1: a slightly tougher spearman (all Deepkin units walk underwater). Cost in food. |
| `unitTypes.tideguard.wood` | 20 | Cost in wood. |
| `unitTypes.tideguard.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.tideguard.trainTicks` | 160 | Training time in ticks. |
| `unitTypes.tideguard.pop` | 1 | Housing used. |
| `unitTypes.tideguard.speed` | 270 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.tideguard.vision` | 6 | Vision radius in tiles. |
| `unitTypes.tideguard.hp` | 120 | Hit points. |
| `unitTypes.tideguard.attack` | 11 | Damage per hit before modifiers. |
| `unitTypes.tideguard.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.tideguard.cooldown` | 10 | Ticks between hits. |
| `unitTypes.tideguard.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.tideguard.vsUnits` | 100 | Damage % against units. |
| `unitTypes.tideguard.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.tideguard.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.tideguard.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.tideguard.capacity` | 0 | Transport capacity (0). |
| `unitTypes.leviathan.food` | 250 | Deepkin capstone: huge deep-sea beast; with amphibious movement it crosses straits on its own. Cost in food. |
| `unitTypes.leviathan.wood` | 0 | Cost in wood. |
| `unitTypes.leviathan.gold` | 100 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.leviathan.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.leviathan.pop` | 6 | Housing used. |
| `unitTypes.leviathan.speed` | 260 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.leviathan.vision` | 9 | Vision radius in tiles. |
| `unitTypes.leviathan.hp` | 850 | Hit points. |
| `unitTypes.leviathan.attack` | 34 | Damage per hit before modifiers. |
| `unitTypes.leviathan.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.leviathan.cooldown` | 16 | Ticks between hits. |
| `unitTypes.leviathan.armor` | 4 | Flat damage reduction per hit. |
| `unitTypes.leviathan.vsUnits` | 110 | Damage % against units. |
| `unitTypes.leviathan.vsBuildings` | 200 | Damage % against buildings. |
| `unitTypes.leviathan.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.leviathan.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.leviathan.capacity` | 0 | Transport capacity (0). |
| `unitTypes.burrower.food` | 55 | Delvers tier 1: tough infantry; burrowing is what makes Delvers special, not this unit. Cost in food. |
| `unitTypes.burrower.wood` | 15 | Cost in wood. |
| `unitTypes.burrower.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.burrower.trainTicks` | 160 | Training time in ticks. |
| `unitTypes.burrower.pop` | 1 | Housing used. |
| `unitTypes.burrower.speed` | 250 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.burrower.vision` | 5 | Vision radius in tiles. |
| `unitTypes.burrower.hp` | 125 | Hit points. |
| `unitTypes.burrower.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.burrower.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.burrower.cooldown` | 10 | Ticks between hits. |
| `unitTypes.burrower.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.burrower.vsUnits` | 100 | Damage % against units. |
| `unitTypes.burrower.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.burrower.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.burrower.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.burrower.capacity` | 0 | Transport capacity (0). |
| `unitTypes.deepDrill.food` | 0 | Delvers capstone: siege engine (6× a spearman against buildings), nearly useless against soldiers. Cost in food. |
| `unitTypes.deepDrill.wood` | 200 | Cost in wood. |
| `unitTypes.deepDrill.gold` | 80 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.deepDrill.trainTicks` | 500 | Training time in ticks. |
| `unitTypes.deepDrill.pop` | 4 | Housing used. |
| `unitTypes.deepDrill.speed` | 160 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.deepDrill.vision` | 4 | Vision radius in tiles. |
| `unitTypes.deepDrill.hp` | 500 | Hit points. |
| `unitTypes.deepDrill.attack` | 45 | Damage per hit before modifiers. |
| `unitTypes.deepDrill.range` | 13 | Reach ×10 tiles (12 = melee). |
| `unitTypes.deepDrill.cooldown` | 22 | Ticks between hits. |
| `unitTypes.deepDrill.armor` | 6 | Flat damage reduction per hit. |
| `unitTypes.deepDrill.vsUnits` | 30 | Damage % against units. |
| `unitTypes.deepDrill.vsBuildings` | 600 | Damage % against buildings. |
| `unitTypes.deepDrill.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.deepDrill.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.deepDrill.capacity` | 0 | Transport capacity (0). |
| `unitTypes.sporeling.food` | 30 | Mycelids tier 1: cheap and fast to train to offset slow growth, but fragile. Cost in food. |
| `unitTypes.sporeling.wood` | 0 | Cost in wood. |
| `unitTypes.sporeling.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.sporeling.trainTicks` | 90 | Training time in ticks. |
| `unitTypes.sporeling.pop` | 1 | Housing used. |
| `unitTypes.sporeling.speed` | 270 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.sporeling.vision` | 5 | Vision radius in tiles. |
| `unitTypes.sporeling.hp` | 50 | Hit points. |
| `unitTypes.sporeling.attack` | 7 | Damage per hit before modifiers. |
| `unitTypes.sporeling.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.sporeling.cooldown` | 9 | Ticks between hits. |
| `unitTypes.sporeling.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.sporeling.vsUnits` | 100 | Damage % against units. |
| `unitTypes.sporeling.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.sporeling.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.sporeling.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.sporeling.capacity` | 0 | Transport capacity (0). |
| `unitTypes.bloomHulk.food` | 250 | Mycelids capstone: slow, massive brute. Cost in food. |
| `unitTypes.bloomHulk.wood` | 100 | Cost in wood. |
| `unitTypes.bloomHulk.gold` | 60 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.bloomHulk.trainTicks` | 550 | Training time in ticks. |
| `unitTypes.bloomHulk.pop` | 5 | Housing used. |
| `unitTypes.bloomHulk.speed` | 180 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.bloomHulk.vision` | 6 | Vision radius in tiles. |
| `unitTypes.bloomHulk.hp` | 800 | Hit points. |
| `unitTypes.bloomHulk.attack` | 30 | Damage per hit before modifiers. |
| `unitTypes.bloomHulk.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.bloomHulk.cooldown` | 18 | Ticks between hits. |
| `unitTypes.bloomHulk.armor` | 3 | Flat damage reduction per hit. |
| `unitTypes.bloomHulk.vsUnits` | 100 | Damage % against units. |
| `unitTypes.bloomHulk.vsBuildings` | 150 | Damage % against buildings. |
| `unitTypes.bloomHulk.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.bloomHulk.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.bloomHulk.capacity` | 0 | Transport capacity (0). |
| `unitTypes.glider.food` | 50 | Windriders tier 1: fragile ranged flier; range 40 so it can harass from beyond melee reach. Cost in food. |
| `unitTypes.glider.wood` | 40 | Cost in wood. |
| `unitTypes.glider.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.glider.trainTicks` | 170 | Training time in ticks. |
| `unitTypes.glider.pop` | 1 | Housing used. |
| `unitTypes.glider.speed` | 420 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.glider.vision` | 10 | Vision radius in tiles. |
| `unitTypes.glider.hp` | 60 | Hit points. |
| `unitTypes.glider.attack` | 8 | Damage per hit before modifiers. |
| `unitTypes.glider.range` | 40 | Reach ×10 tiles (12 = melee). |
| `unitTypes.glider.cooldown` | 14 | Ticks between hits. |
| `unitTypes.glider.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.glider.vsUnits` | 100 | Damage % against units. |
| `unitTypes.glider.vsBuildings` | 20 | Damage % against buildings. |
| `unitTypes.glider.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.glider.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.glider.capacity` | 0 | Transport capacity (0). |
| `unitTypes.skyLancer.food` | 120 | Windriders capstone: heavy flying lancer. Cost in food. |
| `unitTypes.skyLancer.wood` | 60 | Cost in wood. |
| `unitTypes.skyLancer.gold` | 60 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.skyLancer.trainTicks` | 350 | Training time in ticks. |
| `unitTypes.skyLancer.pop` | 3 | Housing used. |
| `unitTypes.skyLancer.speed` | 440 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.skyLancer.vision` | 10 | Vision radius in tiles. |
| `unitTypes.skyLancer.hp` | 200 | Hit points. |
| `unitTypes.skyLancer.attack` | 24 | Damage per hit before modifiers. |
| `unitTypes.skyLancer.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.skyLancer.cooldown` | 14 | Ticks between hits. |
| `unitTypes.skyLancer.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.skyLancer.vsUnits` | 110 | Damage % against units. |
| `unitTypes.skyLancer.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.skyLancer.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.skyLancer.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.skyLancer.capacity` | 0 | Transport capacity (0). |
| `unitTypes.ironguard.food` | 60 | Anvilborn tier 1: armour 4, the best-protected basic infantry; benefits most from gear. Cost in food. |
| `unitTypes.ironguard.wood` | 10 | Cost in wood. |
| `unitTypes.ironguard.gold` | 20 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.ironguard.trainTicks` | 180 | Training time in ticks. |
| `unitTypes.ironguard.pop` | 1 | Housing used. |
| `unitTypes.ironguard.speed` | 240 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.ironguard.vision` | 6 | Vision radius in tiles. |
| `unitTypes.ironguard.hp` | 150 | Hit points. |
| `unitTypes.ironguard.attack` | 13 | Damage per hit before modifiers. |
| `unitTypes.ironguard.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.ironguard.cooldown` | 10 | Ticks between hits. |
| `unitTypes.ironguard.armor` | 4 | Flat damage reduction per hit. |
| `unitTypes.ironguard.vsUnits` | 100 | Damage % against units. |
| `unitTypes.ironguard.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.ironguard.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.ironguard.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.ironguard.capacity` | 0 | Transport capacity (0). |
| `unitTypes.steamGolem.food` | 0 | Anvilborn capstone: walking siege engine with armour 8. Cost in food. |
| `unitTypes.steamGolem.wood` | 150 | Cost in wood. |
| `unitTypes.steamGolem.gold` | 150 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.steamGolem.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.steamGolem.pop` | 6 | Housing used. |
| `unitTypes.steamGolem.speed` | 170 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.steamGolem.vision` | 6 | Vision radius in tiles. |
| `unitTypes.steamGolem.hp` | 1000 | Hit points. |
| `unitTypes.steamGolem.attack` | 38 | Damage per hit before modifiers. |
| `unitTypes.steamGolem.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.steamGolem.cooldown` | 18 | Ticks between hits. |
| `unitTypes.steamGolem.armor` | 8 | Flat damage reduction per hit. |
| `unitTypes.steamGolem.vsUnits` | 100 | Damage % against units. |
| `unitTypes.steamGolem.vsBuildings` | 200 | Damage % against buildings. |
| `unitTypes.steamGolem.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.steamGolem.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.steamGolem.capacity` | 0 | Transport capacity (0). |
| `unitTypes.bogStalker.food` | 50 | Fenfolk tier 1: quick skirmisher; best in swamps where it is hidden. Cost in food. |
| `unitTypes.bogStalker.wood` | 20 | Cost in wood. |
| `unitTypes.bogStalker.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.bogStalker.trainTicks` | 150 | Training time in ticks. |
| `unitTypes.bogStalker.pop` | 1 | Housing used. |
| `unitTypes.bogStalker.speed` | 300 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.bogStalker.vision` | 7 | Vision radius in tiles. |
| `unitTypes.bogStalker.hp` | 90 | Hit points. |
| `unitTypes.bogStalker.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.bogStalker.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.bogStalker.cooldown` | 10 | Ticks between hits. |
| `unitTypes.bogStalker.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.bogStalker.vsUnits` | 100 | Damage % against units. |
| `unitTypes.bogStalker.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.bogStalker.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.bogStalker.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.bogStalker.capacity` | 0 | Transport capacity (0). |
| `unitTypes.mireHorror.food` | 260 | Fenfolk capstone: bog monster. Cost in food. |
| `unitTypes.mireHorror.wood` | 0 | Cost in wood. |
| `unitTypes.mireHorror.gold` | 90 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.mireHorror.trainTicks` | 550 | Training time in ticks. |
| `unitTypes.mireHorror.pop` | 5 | Housing used. |
| `unitTypes.mireHorror.speed` | 230 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.mireHorror.vision` | 7 | Vision radius in tiles. |
| `unitTypes.mireHorror.hp` | 750 | Hit points. |
| `unitTypes.mireHorror.attack` | 32 | Damage per hit before modifiers. |
| `unitTypes.mireHorror.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.mireHorror.cooldown` | 16 | Ticks between hits. |
| `unitTypes.mireHorror.armor` | 3 | Flat damage reduction per hit. |
| `unitTypes.mireHorror.vsUnits` | 100 | Damage % against units. |
| `unitTypes.mireHorror.vsBuildings` | 150 | Damage % against buildings. |
| `unitTypes.mireHorror.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.mireHorror.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.mireHorror.capacity` | 0 | Transport capacity (0). |
| `unitTypes.frostWarden.food` | 60 | Rimeborn tier 1: hardy infantry (armour 3). Cost in food. |
| `unitTypes.frostWarden.wood` | 20 | Cost in wood. |
| `unitTypes.frostWarden.gold` | 0 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.frostWarden.trainTicks` | 170 | Training time in ticks. |
| `unitTypes.frostWarden.pop` | 1 | Housing used. |
| `unitTypes.frostWarden.speed` | 260 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.frostWarden.vision` | 6 | Vision radius in tiles. |
| `unitTypes.frostWarden.hp` | 130 | Hit points. |
| `unitTypes.frostWarden.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.frostWarden.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.frostWarden.cooldown` | 10 | Ticks between hits. |
| `unitTypes.frostWarden.armor` | 3 | Flat damage reduction per hit. |
| `unitTypes.frostWarden.vsUnits` | 100 | Damage % against units. |
| `unitTypes.frostWarden.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.frostWarden.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.frostWarden.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.frostWarden.capacity` | 0 | Transport capacity (0). |
| `unitTypes.mammoth.food` | 300 | Rimeborn capstone: woolly giant that tramples armies and gates. Cost in food. |
| `unitTypes.mammoth.wood` | 0 | Cost in wood. |
| `unitTypes.mammoth.gold` | 80 | Cost in gold (charged since Phase 5; before, unit gold costs were shown but never taken). |
| `unitTypes.mammoth.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.mammoth.pop` | 6 | Housing used. |
| `unitTypes.mammoth.speed` | 230 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.mammoth.vision` | 7 | Vision radius in tiles. |
| `unitTypes.mammoth.hp` | 950 | Hit points. |
| `unitTypes.mammoth.attack` | 36 | Damage per hit before modifiers. |
| `unitTypes.mammoth.range` | 15 | Reach ×10 tiles (12 = melee). |
| `unitTypes.mammoth.cooldown` | 18 | Ticks between hits. |
| `unitTypes.mammoth.armor` | 4 | Flat damage reduction per hit. |
| `unitTypes.mammoth.vsUnits` | 110 | Damage % against units. |
| `unitTypes.mammoth.vsBuildings` | 220 | Damage % against buildings. |
| `unitTypes.mammoth.water` | 0 | 1 = ships only (0 for every race unit). |
| `unitTypes.mammoth.stealth` | 0 | 1 = hidden like spies (0: race stealth comes from abilities). |
| `unitTypes.mammoth.capacity` | 0 | Transport capacity (0). |

## Phase 5 buildings (F-044, F-058, F-096)

Costs sit between a barracks and a workshop: they are a mid-game investment.

| Constant | Value | Why |
|---|---|---|
| `buildingTypes.forge.size` | 2 | Shared, needs Smithing: crafts alloy, tools, weapons and armour (F-058). Footprint in tiles. |
| `buildingTypes.forge.wood` | 120 | Cost in wood. |
| `buildingTypes.forge.stone` | 80 | Cost in stone. |
| `buildingTypes.forge.buildPoints` | 350 | Work needed to build. |
| `buildingTypes.forge.housing` | 0 | Housing provided. |
| `buildingTypes.forge.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.forge.vision` | 4 | Vision radius. |
| `buildingTypes.forge.hp` | 900 | Hit points. |
| `buildingTypes.forge.attack` | 0 | Arrow damage (0). |
| `buildingTypes.forge.range` | 0 | Arrow range (0). |
| `buildingTypes.forge.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.forge.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.pier.size` | 2 | Shared, needs Piers: a deck on open water that land units can stand on (F-044). Footprint in tiles. |
| `buildingTypes.pier.wood` | 60 | Cost in wood. |
| `buildingTypes.pier.stone` | 0 | Cost in stone. |
| `buildingTypes.pier.buildPoints` | 200 | Work needed to build. |
| `buildingTypes.pier.housing` | 0 | Housing provided. |
| `buildingTypes.pier.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.pier.vision` | 5 | Vision radius. |
| `buildingTypes.pier.hp` | 400 | Hit points. |
| `buildingTypes.pier.attack` | 0 | Arrow damage (0). |
| `buildingTypes.pier.range` | 0 | Arrow range (0). |
| `buildingTypes.pier.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.pier.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.tidepool.size` | 2 | Deepkin unique building: must touch water. Footprint in tiles. |
| `buildingTypes.tidepool.wood` | 100 | Cost in wood. |
| `buildingTypes.tidepool.stone` | 40 | Cost in stone. |
| `buildingTypes.tidepool.buildPoints` | 350 | Work needed to build. |
| `buildingTypes.tidepool.housing` | 0 | Housing provided. |
| `buildingTypes.tidepool.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.tidepool.vision` | 4 | Vision radius. |
| `buildingTypes.tidepool.hp` | 900 | Hit points. |
| `buildingTypes.tidepool.attack` | 0 | Arrow damage (0). |
| `buildingTypes.tidepool.range` | 0 | Arrow range (0). |
| `buildingTypes.tidepool.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.tidepool.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.beastPen.size` | 2 | Wildbond unique building. Footprint in tiles. |
| `buildingTypes.beastPen.wood` | 120 | Cost in wood. |
| `buildingTypes.beastPen.stone` | 20 | Cost in stone. |
| `buildingTypes.beastPen.buildPoints` | 300 | Work needed to build. |
| `buildingTypes.beastPen.housing` | 0 | Housing provided. |
| `buildingTypes.beastPen.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.beastPen.vision` | 4 | Vision radius. |
| `buildingTypes.beastPen.hp` | 800 | Hit points. |
| `buildingTypes.beastPen.attack` | 0 | Arrow damage (0). |
| `buildingTypes.beastPen.range` | 0 | Arrow range (0). |
| `buildingTypes.beastPen.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.beastPen.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.tunnelHall.size` | 2 | Delvers unique building; stone-heavy and sturdy. Footprint in tiles. |
| `buildingTypes.tunnelHall.wood` | 80 | Cost in wood. |
| `buildingTypes.tunnelHall.stone` | 120 | Cost in stone. |
| `buildingTypes.tunnelHall.buildPoints` | 400 | Work needed to build. |
| `buildingTypes.tunnelHall.housing` | 0 | Housing provided. |
| `buildingTypes.tunnelHall.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.tunnelHall.vision` | 4 | Vision radius. |
| `buildingTypes.tunnelHall.hp` | 1100 | Hit points. |
| `buildingTypes.tunnelHall.attack` | 0 | Arrow damage (0). |
| `buildingTypes.tunnelHall.range` | 0 | Arrow range (0). |
| `buildingTypes.tunnelHall.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.tunnelHall.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.sporeTower.size` | 1 | Mycelids unique building: spreads fungus faster than a town (`races.abilities.fungalSpread.towerTries`). Footprint in tiles. |
| `buildingTypes.sporeTower.wood` | 60 | Cost in wood. |
| `buildingTypes.sporeTower.stone` | 40 | Cost in stone. |
| `buildingTypes.sporeTower.buildPoints` | 250 | Work needed to build. |
| `buildingTypes.sporeTower.housing` | 0 | Housing provided. |
| `buildingTypes.sporeTower.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.sporeTower.vision` | 6 | Vision radius. |
| `buildingTypes.sporeTower.hp` | 500 | Hit points. |
| `buildingTypes.sporeTower.attack` | 0 | Arrow damage (0). |
| `buildingTypes.sporeTower.range` | 0 | Arrow range (0). |
| `buildingTypes.sporeTower.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.sporeTower.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.aerie.size` | 2 | Windriders unique building; vision 7 for spotting. Footprint in tiles. |
| `buildingTypes.aerie.wood` | 140 | Cost in wood. |
| `buildingTypes.aerie.stone` | 20 | Cost in stone. |
| `buildingTypes.aerie.buildPoints` | 350 | Work needed to build. |
| `buildingTypes.aerie.housing` | 0 | Housing provided. |
| `buildingTypes.aerie.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.aerie.vision` | 7 | Vision radius. |
| `buildingTypes.aerie.hp` | 700 | Hit points. |
| `buildingTypes.aerie.attack` | 0 | Arrow damage (0). |
| `buildingTypes.aerie.range` | 0 | Arrow range (0). |
| `buildingTypes.aerie.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.aerie.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.greatForge.size` | 2 | Anvilborn unique building; also counts as an equipping site. Footprint in tiles. |
| `buildingTypes.greatForge.wood` | 100 | Cost in wood. |
| `buildingTypes.greatForge.stone` | 140 | Cost in stone. |
| `buildingTypes.greatForge.buildPoints` | 450 | Work needed to build. |
| `buildingTypes.greatForge.housing` | 0 | Housing provided. |
| `buildingTypes.greatForge.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.greatForge.vision` | 4 | Vision radius. |
| `buildingTypes.greatForge.hp` | 1200 | Hit points. |
| `buildingTypes.greatForge.attack` | 0 | Arrow damage (0). |
| `buildingTypes.greatForge.range` | 0 | Arrow range (0). |
| `buildingTypes.greatForge.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.greatForge.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.stiltHall.size` | 2 | Fenfolk unique building. Footprint in tiles. |
| `buildingTypes.stiltHall.wood` | 140 | Cost in wood. |
| `buildingTypes.stiltHall.stone` | 0 | Cost in stone. |
| `buildingTypes.stiltHall.buildPoints` | 300 | Work needed to build. |
| `buildingTypes.stiltHall.housing` | 0 | Housing provided. |
| `buildingTypes.stiltHall.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.stiltHall.vision` | 4 | Vision radius. |
| `buildingTypes.stiltHall.hp` | 800 | Hit points. |
| `buildingTypes.stiltHall.attack` | 0 | Arrow damage (0). |
| `buildingTypes.stiltHall.range` | 0 | Arrow range (0). |
| `buildingTypes.stiltHall.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.stiltHall.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.iceLodge.size` | 2 | Rimeborn unique building: a fishing hut that also counts sea ice, up to 3 workers. Footprint in tiles. |
| `buildingTypes.iceLodge.wood` | 120 | Cost in wood. |
| `buildingTypes.iceLodge.stone` | 20 | Cost in stone. |
| `buildingTypes.iceLodge.buildPoints` | 300 | Work needed to build. |
| `buildingTypes.iceLodge.housing` | 0 | Housing provided. |
| `buildingTypes.iceLodge.territory` | 0 | Territory radius (0 = none). |
| `buildingTypes.iceLodge.vision` | 5 | Vision radius. |
| `buildingTypes.iceLodge.hp` | 800 | Hit points. |
| `buildingTypes.iceLodge.attack` | 0 | Arrow damage (0). |
| `buildingTypes.iceLodge.range` | 0 | Arrow range (0). |
| `buildingTypes.iceLodge.cooldown` | 0 | Arrow cooldown (0). |
| `buildingTypes.iceLodge.garrison` | 0 | Garrison slots (0). |
| `buildingTypes.iceLodge.maxWorkers` | 3 | Workers that can fish here. |

## Races and ability modules (F-090–F-112)

Point rule (owner amendment 3): stat changes score 1 point per `races.statPctPerPoint` % away from 100 (above = +, below = −); each ability module has the `points` below (positive = power, negative = weakness). A race is valid only when everything adds up to exactly 0.

| Constant | Value | Why |
|---|---|---|
| `races.statPctPerPoint` | 5 | Stats move in 5 % steps; each step is worth 1 point. |
| `races.statMin` | 50 | No stat below half normal: a race must still be playable. |
| `races.statMax` | 150 | No stat above 1.5× normal. |
| `races.abilities.amphibious.points` | 8 | Big: armies cross straits without transports. |
| `races.abilities.amphibious.waterMoveCost` | 14 | Path cost of a water tile (land is 10) — slightly dearer than plains so paths prefer land when it is close. |
| `races.abilities.amphibious.waterSpeedPct` | 130 | Speed in water: 30 % faster than on plains. |
| `races.abilities.sunburn.points` | -8 | Equal and opposite to amphibious: land expansion is limited to the night and armies burn on enemy land by day. |
| `races.abilities.sunburn.everyTicks` | 20 | Damage interval (2 s). |
| `races.abilities.sunburn.damage` | 2 | HP lost per interval outside own territory by day: a spearman (110 HP) survives about 18 minutes, a worker about 7 — painful but not instantly fatal. |
| `races.abilities.tameAnimals.points` | 6 | Free units from wildlife, plus the beast tree. |
| `races.abilities.tameAnimals.tameTicks` | 50 | Ticks a scout must stay next to the animal (5 s). |
| `races.abilities.tameAnimals.range` | 2 | Tiles from the animal that count as next to it. |
| `races.abilities.frailBuildings.points` | -6 | Raids hurt much more. |
| `races.abilities.frailBuildings.hpPct` | 70 | Building HP 70 %. |
| `races.abilities.tunneling.points` | 8 | Walls and moats stop working against them. |
| `races.abilities.tunneling.speedPct` | 60 | Underground speed 60 %. |
| `races.abilities.tunneling.ambushPct` | 150 | Damage 150 % right after surfacing. |
| `races.abilities.tunneling.ambushTicks` | 30 | Ambush window after surfacing (3 s). |
| `races.abilities.tunneling.surfaceTicks` | 10 | Coming up takes 1 s: no attack, and the ambush window starts after it. |
| `races.abilities.poorSailors.points` | -6 | Most maps need ships to reach other continents. |
| `races.abilities.poorSailors.navalHpPct` | 60 | Ship HP 60 %. |
| `races.abilities.poorSailors.navalAttackPct` | 70 | Ship damage 70 %. |
| `races.abilities.fungalSpread.points` | 8 | Slow, map-wide pressure on neighbours. |
| `races.abilities.fungalSpread.spreadEveryTicks` | 30 | Spread attempts every 3 s. |
| `races.abilities.fungalSpread.spreadTries` | 3 | Attempts per town each time. |
| `races.abilities.fungalSpread.towerTries` | 4 | Attempts per spore tower. |
| `races.abilities.fungalSpread.poisonEveryTicks` | 20 | Poison interval (2 s). |
| `races.abilities.fungalSpread.poisonDamage` | 2 | HP lost per interval by enemy units on the fungus. |
| `races.abilities.fungalSpread.farmYieldPct` | 50 | Enemy farm tiles on fungus yield 50 %. |
| `races.abilities.fungalSpread.ownTerritoryOnlyStart` | 1 | Reserved: 1 = the start patch covers only the capital area (current behaviour). |
| `races.abilities.slowGrowth.points` | -4 | Smaller penalty than most, because Mycelids are also fragile (unit_health 80). |
| `races.abilities.slowGrowth.trainTimePct` | 140 | Training takes 140 %. |
| `races.abilities.gliders.points` | 6 | Fly over walls, rivers and straits. |
| `races.abilities.gliders.scoutSpeedPct` | 130 | Scouts 30 % faster. |
| `races.abilities.gliders.glideTiles` | 16 | Longest single flight; a flight always ends on land. |
| `races.abilities.gliders.restTicks` | 50 | Rest after each long flight (5 s). |
| `races.abilities.poorDefense.points` | -6 | Turtling does not work for them. |
| `races.abilities.poorDefense.defenceHpPct` | 60 | Walls, gates and towers have 60 % HP. |
| `races.abilities.poorDefense.towerAttackPct` | 60 | Towers shoot for 60 %. |
| `races.abilities.masterSmiths.points` | 6 | Gear is the strongest late-game multiplier. |
| `races.abilities.masterSmiths.gearCostPct` | 60 | Gear costs 60 % (rounded up). |
| `races.abilities.masterSmiths.gearTierBonus` | 1 | Weapons and armour count one tier higher. |
| `races.abilities.heavyFooted.points` | -6 | Slow armies are easy to outmanoeuvre. |
| `races.abilities.heavyFooted.militarySpeedPct` | 80 | Soldiers move at 80 % (workers and scouts are not affected). |
| `races.abilities.swampStalkers.points` | 5 | Strong but only where swamps are. |
| `races.abilities.swampStalkers.swampCostPct` | 40 | Swamp movement cost 40 % (swamp is otherwise very slow). |
| `races.abilities.swampStalkers.swampStealth` | 1 | 1 = hidden in swamp unless an enemy is within 2 tiles. |
| `races.abilities.openGroundWeak.points` | -5 | Plains and deserts are common, so this is a real cost. |
| `races.abilities.openGroundWeak.damagePct` | 70 | Damage 70 % when standing on plains or desert. |
| `races.abilities.frostAdapted.points` | 6 | Strong only on cold maps or cold starts. |
| `races.abilities.frostAdapted.coldDamagePct` | 125 | Damage 125 % on tundra, snow and ice. |
| `races.abilities.frostAdapted.coldGatherPct` | 130 | Gathering 130 % on cold tiles. |
| `races.abilities.frostAdapted.iceFishPct` | 150 | Ice lodge fishing 150 %. |
| `races.abilities.heatWeak.points` | -6 | Deserts become no-go areas. |
| `races.abilities.heatWeak.hotOutputPct` | 60 | Gathering, farming and building 60 % on desert. |
| `races.abilities.heatWeak.hotDamagePct` | 80 | Damage 80 % on desert. |

## Shared tech tree (F-094) and tech victory (F-133)

Research happens at the capital (one at a time per player, paid up front, refunded on cancel). Race evolution nodes are researched the same way; their costs are in each race file.

| Constant | Value | Why |
|---|---|---|
| `tech.researchAt` | capital | Research needs a completed capital; losing it pauses research. |
| `tech.victoryCapstonePlusPct` | 60 | Optional tech victory: own capstone + at least 60 % of the shared nodes (PLAN §7-D). Off unless chosen. |
| `tech.nodes.smithing.wood` | 100 | Unlocks the forge and iron gear: the entry point of the gear chain. Cost in wood. |
| `tech.nodes.smithing.stone` | 100 | Cost in stone. |
| `tech.nodes.smithing.gold` | 0 | Cost in gold. |
| `tech.nodes.smithing.carbon` | 0 | Cost in carbon. |
| `tech.nodes.smithing.adamite` | 0 | Cost in adamite. |
| `tech.nodes.smithing.ticks` | 600 | Research time in ticks. |
| `tech.nodes.smithing.buildings.0` | forge | Building unlocked. |
| `tech.nodes.smithing.gear.0` | ironWeapons | Gear unlocked. |
| `tech.nodes.smithing.gear.1` | ironArmor | Gear unlocked. |
| `tech.nodes.toolmaking.wood` | 80 | Tools: workers gather 20 % faster. Cost in wood. |
| `tech.nodes.toolmaking.stone` | 40 | Cost in stone. |
| `tech.nodes.toolmaking.gold` | 20 | Cost in gold. |
| `tech.nodes.toolmaking.carbon` | 0 | Cost in carbon. |
| `tech.nodes.toolmaking.adamite` | 0 | Cost in adamite. |
| `tech.nodes.toolmaking.ticks` | 450 | Research time in ticks. |
| `tech.nodes.toolmaking.requires.0` | smithing | Must be researched first. |
| `tech.nodes.toolmaking.gear.0` | tools | Gear unlocked. |
| `tech.nodes.alloys.wood` | 0 | Carbon + adamite → alloy, and alloy weapons/armour. Cost in wood. |
| `tech.nodes.alloys.stone` | 60 | Cost in stone. |
| `tech.nodes.alloys.gold` | 60 | Cost in gold. |
| `tech.nodes.alloys.carbon` | 40 | Cost in carbon. |
| `tech.nodes.alloys.adamite` | 20 | Cost in adamite. |
| `tech.nodes.alloys.ticks` | 900 | Research time in ticks. |
| `tech.nodes.alloys.requires.0` | smithing | Must be researched first. |
| `tech.nodes.alloys.gear.0` | alloy | Gear unlocked. |
| `tech.nodes.alloys.gear.1` | alloyWeapons | Gear unlocked. |
| `tech.nodes.alloys.gear.2` | alloyArmor | Gear unlocked. |
| `tech.nodes.firearms.wood` | 0 | Late game: tier 3 weapons. Cost in wood. |
| `tech.nodes.firearms.stone` | 0 | Cost in stone. |
| `tech.nodes.firearms.gold` | 150 | Cost in gold. |
| `tech.nodes.firearms.carbon` | 80 | Cost in carbon. |
| `tech.nodes.firearms.adamite` | 40 | Cost in adamite. |
| `tech.nodes.firearms.ticks` | 1500 | Research time in ticks. |
| `tech.nodes.firearms.requires.0` | alloys | Must be researched first. |
| `tech.nodes.firearms.gear.0` | firearms | Gear unlocked. |
| `tech.nodes.piers.wood` | 150 | Build on water (F-044). Cost in wood. |
| `tech.nodes.piers.stone` | 0 | Cost in stone. |
| `tech.nodes.piers.gold` | 20 | Cost in gold. |
| `tech.nodes.piers.carbon` | 0 | Cost in carbon. |
| `tech.nodes.piers.adamite` | 0 | Cost in adamite. |
| `tech.nodes.piers.ticks` | 450 | Research time in ticks. |
| `tech.nodes.piers.buildings.0` | pier | Building unlocked. |

## Gear (F-058)

Crafted at a forge from stock into a per-player gear store, then handed to units within `gear.assignRange` tiles of a forge, great forge, barracks or town. `slot` 1 = weapon, 2 = armour, 3 = tools (workers), 0 = intermediate (alloy). Weapon and armour tiers use `combat.weaponTierPct` / `combat.armorTierPct`.

| Constant | Value | Why |
|---|---|---|
| `gear.craftAt` | forge | Where gear is crafted. |
| `gear.assignRange` | 6 | Units must come home to be equipped: gear is not teleported to the front. |
| `gear.toolsGatherPct` | 120 | Gathering and farming with tools: 120 %. |
| `gear.items.alloy.food` | 0 | The chain's intermediate: 2 carbon + 1 adamite. Cost in food. |
| `gear.items.alloy.wood` | 0 | Cost in wood. |
| `gear.items.alloy.stone` | 0 | Cost in stone. |
| `gear.items.alloy.gold` | 0 | Cost in gold. |
| `gear.items.alloy.carbon` | 2 | Cost in carbon. |
| `gear.items.alloy.adamite` | 1 | Cost in adamite. |
| `gear.items.alloy.alloy` | 0 | Cost in alloy. |
| `gear.items.alloy.ticks` | 80 | Crafting time in ticks. |
| `gear.items.alloy.slot` | 0 | Slot (see above). |
| `gear.items.alloy.tier` | 0 | Tier given to the unit. |
| `gear.items.tools.food` | 0 | Cheap; pays for itself in a few minutes of gathering. Cost in food. |
| `gear.items.tools.wood` | 15 | Cost in wood. |
| `gear.items.tools.stone` | 10 | Cost in stone. |
| `gear.items.tools.gold` | 0 | Cost in gold. |
| `gear.items.tools.carbon` | 0 | Cost in carbon. |
| `gear.items.tools.adamite` | 0 | Cost in adamite. |
| `gear.items.tools.alloy` | 0 | Cost in alloy. |
| `gear.items.tools.ticks` | 60 | Crafting time in ticks. |
| `gear.items.tools.slot` | 3 | Slot (see above). |
| `gear.items.tools.tier` | 1 | Tier given to the unit. |
| `gear.items.ironWeapons.food` | 0 | Tier 1 weapon. Cost in food. |
| `gear.items.ironWeapons.wood` | 5 | Cost in wood. |
| `gear.items.ironWeapons.stone` | 20 | Cost in stone. |
| `gear.items.ironWeapons.gold` | 10 | Cost in gold. |
| `gear.items.ironWeapons.carbon` | 0 | Cost in carbon. |
| `gear.items.ironWeapons.adamite` | 0 | Cost in adamite. |
| `gear.items.ironWeapons.alloy` | 0 | Cost in alloy. |
| `gear.items.ironWeapons.ticks` | 80 | Crafting time in ticks. |
| `gear.items.ironWeapons.slot` | 1 | Slot (see above). |
| `gear.items.ironWeapons.tier` | 1 | Tier given to the unit. |
| `gear.items.ironArmor.food` | 0 | Tier 1 armour. Cost in food. |
| `gear.items.ironArmor.wood` | 0 | Cost in wood. |
| `gear.items.ironArmor.stone` | 30 | Cost in stone. |
| `gear.items.ironArmor.gold` | 10 | Cost in gold. |
| `gear.items.ironArmor.carbon` | 0 | Cost in carbon. |
| `gear.items.ironArmor.adamite` | 0 | Cost in adamite. |
| `gear.items.ironArmor.alloy` | 0 | Cost in alloy. |
| `gear.items.ironArmor.ticks` | 90 | Crafting time in ticks. |
| `gear.items.ironArmor.slot` | 2 | Slot (see above). |
| `gear.items.ironArmor.tier` | 1 | Tier given to the unit. |
| `gear.items.alloyWeapons.food` | 0 | Tier 2 weapon: 1 alloy. Cost in food. |
| `gear.items.alloyWeapons.wood` | 0 | Cost in wood. |
| `gear.items.alloyWeapons.stone` | 0 | Cost in stone. |
| `gear.items.alloyWeapons.gold` | 15 | Cost in gold. |
| `gear.items.alloyWeapons.carbon` | 0 | Cost in carbon. |
| `gear.items.alloyWeapons.adamite` | 0 | Cost in adamite. |
| `gear.items.alloyWeapons.alloy` | 1 | Cost in alloy. |
| `gear.items.alloyWeapons.ticks` | 100 | Crafting time in ticks. |
| `gear.items.alloyWeapons.slot` | 1 | Slot (see above). |
| `gear.items.alloyWeapons.tier` | 2 | Tier given to the unit. |
| `gear.items.alloyArmor.food` | 0 | Tier 2 armour: 2 alloy. Cost in food. |
| `gear.items.alloyArmor.wood` | 0 | Cost in wood. |
| `gear.items.alloyArmor.stone` | 0 | Cost in stone. |
| `gear.items.alloyArmor.gold` | 15 | Cost in gold. |
| `gear.items.alloyArmor.carbon` | 0 | Cost in carbon. |
| `gear.items.alloyArmor.adamite` | 0 | Cost in adamite. |
| `gear.items.alloyArmor.alloy` | 2 | Cost in alloy. |
| `gear.items.alloyArmor.ticks` | 110 | Crafting time in ticks. |
| `gear.items.alloyArmor.slot` | 2 | Slot (see above). |
| `gear.items.alloyArmor.tier` | 2 | Tier given to the unit. |
| `gear.items.firearms.food` | 0 | Tier 3 weapon: 2 alloy + carbon. Cost in food. |
| `gear.items.firearms.wood` | 0 | Cost in wood. |
| `gear.items.firearms.stone` | 0 | Cost in stone. |
| `gear.items.firearms.gold` | 30 | Cost in gold. |
| `gear.items.firearms.carbon` | 2 | Cost in carbon. |
| `gear.items.firearms.adamite` | 0 | Cost in adamite. |
| `gear.items.firearms.alloy` | 2 | Cost in alloy. |
| `gear.items.firearms.ticks` | 140 | Crafting time in ticks. |
| `gear.items.firearms.slot` | 1 | Slot (see above). |
| `gear.items.firearms.tier` | 3 | Tier given to the unit. |

## Diplomacy (F-150–F-153, F-134)

Everyone starts at war (as before Phase 6), so matches without diplomacy play exactly as they did. Reputation is public; "feel" (−100…100) is one player's private relationship to another and drives bot decisions.

| Constant | Value | Why |
|---|---|---|
| `diplomacy.reputationStart` | 70 | Reputation everyone starts with (0–100). High enough that a first deal is believed. |
| `diplomacy.breakTreatyPenalty` | 20 | Reputation lost for breaking peace, a ceasefire or a trade pact. |
| `diplomacy.betrayAlliancePenalty` | 35 | Reputation lost for attacking an ally: the worst betrayal. |
| `diplomacy.victimFeelPenalty` | 50 | How much the betrayed player's relationship drops. |
| `diplomacy.othersFeelPenalty` | 10 | Everyone else trusts the breaker a little less. |
| `diplomacy.ceasefireTicks` | 3000 | A ceasefire lasts 5 minutes, then the war resumes on its own. |
| `diplomacy.offerTicks` | 600 | An unanswered offer expires after 1 minute. |
| `diplomacy.dealFeel` | 5 | Relationship gained by both sides for every accepted deal. |
| `diplomacy.feelPerValue` | 20 | A generous deal adds 1 relationship per this much value (food-equivalents) in the receiver's favour. |
| `diplomacy.recoverEveryTicks` | 600 | Every minute reputation recovers by 1 (up to the start value) and relationships drift 1 towards 0: grudges fade slowly. |
| `diplomacy.tradePactGoldPct` | 10 | Extra gold income per trade-pact partner. |
| `diplomacy.tradePactMaxPartners` | 3 | At most 3 partners count (+30 % gold). |
| `diplomacy.chatMaxLength` | 200 | Longest chat message (characters). |
| `diplomacy.chatKeep` | 200 | Chat lines kept in the match (older ones drop off). |
| `diplomacy.resValue.0` | 1 | Value of one food in deals (food = 1; rarer resources are worth more). |
| `diplomacy.resValue.1` | 1 | Value of one wood in deals (food = 1; rarer resources are worth more). |
| `diplomacy.resValue.2` | 2 | Value of one stone in deals (food = 1; rarer resources are worth more). |
| `diplomacy.resValue.3` | 3 | Value of one gold in deals (food = 1; rarer resources are worth more). |
| `diplomacy.resValue.4` | 3 | Value of one carbon in deals (food = 1; rarer resources are worth more). |
| `diplomacy.resValue.5` | 6 | Value of one adamite in deals (food = 1; rarer resources are worth more). |
| `diplomacy.gearValue` | 40 | Value of one gear item in deals. |
| `diplomacy.techValue` | 250 | Value of a shared tech node in deals. |
| `diplomacy.townValue` | 400 | Value of a town or outpost (with its land) in deals. |
| `diplomacy.econSharePct` | 50 | Economic victory (PLAN §7-C): share of all adamite income in the last minute. |
| `diplomacy.econHoldTicks` | 3000 | How long the economic share must be held (5 min). |
| `diplomacy.econMinIncome` | 30 | No economic victory while almost nobody mines adamite (total per minute below this). |

## Covert actions (F-140–F-142)

Spies steal, spy on and poison; saboteurs sabotage and poison. Agents must stand within 2 tiles of the target. Each act has a detection chance; a caught agent is executed, and if it happens in peace time the treaty is broken.

| Constant | Value | Why |
|---|---|---|
| `covert.detectPct.0` | 25 | Detection chance for stealing: bolder acts are riskier. |
| `covert.detectPct.1` | 15 | Detection chance for spying: bolder acts are riskier. |
| `covert.detectPct.2` | 30 | Detection chance for sabotage: bolder acts are riskier. |
| `covert.detectPct.3` | 35 | Detection chance for poison: bolder acts are riskier. |
| `covert.guardDetectPct` | 20 | Extra detection chance next to an enemy tower or town centre (within 6 tiles). |
| `covert.caughtFeel` | 25 | Relationship lost by the victim when they catch an agent. |
| `covert.stealAmount` | 60 | Resources taken per successful theft (the victim's richest of gold, food, wood, stone). |
| `covert.revealRadius` | 10 | Spying reveals this many tiles around the target … |
| `covert.revealTicks` | 600 | … for 1 minute (plus a stock report). |
| `covert.sabotageTicks` | 450 | A sabotaged building produces, trains, crafts and shoots nothing for 45 s. |
| `covert.unitPoisonTicks` | 300 | A poisoned unit suffers for 30 s … |
| `covert.unitPoisonEveryTicks` | 20 | … losing HP every 2 s … |
| `covert.unitPoisonDamage` | 3 | … this much each time (a spearman loses about 45 HP). |
| `covert.cropPoisonTicks` | 900 | A poisoned farm yields nothing for 90 s. |
| `covert.wellPoisonTicks` | 900 | A poisoned town well lasts 90 s … |
| `covert.wellUpkeepPct` | 200 | … during which the victim's food upkeep is doubled. |
| `covert.cooldownTicks` | 300 | An agent rests 30 s between missions. |
| `bots.allianceFeel` | 15 | Bots only offer or accept an alliance from this relationship up (about three good deals). |
| `bots.allianceReputation` | 50 | Bots don't ally with players whose reputation is below this (known treaty breakers). |
| `bots.counterMargin` | 120 | An offer this close to acceptable (in value points) gets a counter-offer instead of a plain no. |
| `tech.nodes.toxins.wood` | 0 | Cost in wood. |
| `tech.nodes.toxins.stone` | 0 | Cost in stone. |
| `tech.nodes.toxins.gold` | 80 | Toxins (Phase 6): allows poisoning (Mycelids can without it). Cost in gold. |
| `tech.nodes.toxins.carbon` | 30 | Cost in carbon. |
| `tech.nodes.toxins.adamite` | 0 | Cost in adamite. |
| `tech.nodes.toxins.ticks` | 600 | Research time in ticks. |

## Multiplayer (Phase 7, F-160–F-168)

Host-ordered lockstep (PLAN §4): the host runs the sim and all bots and sends every tick's commands; guests replay them a few ticks behind.

| Constant | Value | Why |
|---|---|---|
| `multiplayer.maxHumans` | 8 | Spec: about 4–8 humans over peer-to-peer; the rest are bots. A 9th join is refused. |
| `multiplayer.hashEvery` | 50 | The host adds its state hash every 5 s; a guest that differs reports a desync within that time. |
| `multiplayer.keepTurns` | 600 | Host keeps the last minute of turns to check guests' hash reports against. |
| `multiplayer.voteMs` | 20000 | Votes (test options, pauses in vote mode) close after 20 s; no answer counts as no. |
| `multiplayer.maxCatchUpPerCall` | 40 | A guest that fell behind plays at most 40 turns per worker loop, so its screen keeps updating while it catches up. |
| `multiplayer.iceServers.0` | stun:stun.l.google.com:19302 | Free public STUN server (no SLA) to find a public address. |
| `multiplayer.iceServers.1` | stun:stun.cloudflare.com:3478 | Second free STUN server in case the first is down. No TURN relay is configured yet (needs the owner's account). |

## Scale (Phase 8, F-191)

Per map size: the most population one player may have (the menu population limit can only lower it; the "no housing cap" test option does not lift it, for performance), and how many arrows and flames are drawn at once.

| Constant | Value | Why |
|---|---|---|
| `map.sizes.small.unitCap` | 200 | Few players: a generous cap that normal games never reach. |
| `map.sizes.small.effectsPct` | 100 | Full effects. |
| `map.sizes.medium.unitCap` | 200 | Few players: a generous cap that normal games never reach. |
| `map.sizes.medium.effectsPct` | 100 | Full effects. |
| `map.sizes.large.unitCap` | 150 | 16 players × 150. |
| `map.sizes.large.effectsPct` | 60 | Reduced effects on big maps: share of the arrow and flame budget drawn. |
| `map.sizes.huge.unitCap` | 100 | 32 players × 100 keeps the Huge sim within its budget (F-190). |
| `map.sizes.huge.effectsPct` | 35 | Reduced effects on big maps: share of the arrow and flame budget drawn. |

## Race units, peoples 9–12 (Phase 8, F-108–F-111)

Same scale as the first eight peoples' units.

| Constant | Value | Why |
|---|---|---|
| `unitTypes.duneRider.food` | 70 | Dune raiders tier 1: the fastest land unit, for raids. Cost in food. |
| `unitTypes.duneRider.wood` | 0 | Cost in wood. |
| `unitTypes.duneRider.gold` | 30 | Cost in gold. |
| `unitTypes.duneRider.trainTicks` | 180 | Training time in ticks. |
| `unitTypes.duneRider.pop` | 2 | Housing used. |
| `unitTypes.duneRider.speed` | 450 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.duneRider.vision` | 8 | Vision radius in tiles. |
| `unitTypes.duneRider.hp` | 120 | Hit points. |
| `unitTypes.duneRider.attack` | 12 | Damage per hit before modifiers. |
| `unitTypes.duneRider.range` | 13 | Reach ×10 tiles (12 = melee). |
| `unitTypes.duneRider.cooldown` | 11 | Ticks between hits. |
| `unitTypes.duneRider.armor` | 1 | Flat damage reduction per hit. |
| `unitTypes.duneRider.vsUnits` | 110 | Damage % against units. |
| `unitTypes.duneRider.vsBuildings` | 60 | Damage % against buildings. |
| `unitTypes.duneRider.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.duneRider.stealth` | 0 | 0. |
| `unitTypes.duneRider.capacity` | 0 | 0. |
| `unitTypes.sandWyrm.food` | 280 | Dune raiders capstone. Cost in food. |
| `unitTypes.sandWyrm.wood` | 0 | Cost in wood. |
| `unitTypes.sandWyrm.gold` | 120 | Cost in gold. |
| `unitTypes.sandWyrm.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.sandWyrm.pop` | 6 | Housing used. |
| `unitTypes.sandWyrm.speed` | 280 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.sandWyrm.vision` | 8 | Vision radius in tiles. |
| `unitTypes.sandWyrm.hp` | 800 | Hit points. |
| `unitTypes.sandWyrm.attack` | 36 | Damage per hit before modifiers. |
| `unitTypes.sandWyrm.range` | 15 | Reach ×10 tiles (12 = melee). |
| `unitTypes.sandWyrm.cooldown` | 16 | Ticks between hits. |
| `unitTypes.sandWyrm.armor` | 4 | Flat damage reduction per hit. |
| `unitTypes.sandWyrm.vsUnits` | 110 | Damage % against units. |
| `unitTypes.sandWyrm.vsBuildings` | 200 | Damage % against buildings. |
| `unitTypes.sandWyrm.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.sandWyrm.stealth` | 0 | 0. |
| `unitTypes.sandWyrm.capacity` | 0 | 0. |
| `unitTypes.arcanist.food` | 50 | Scholars tier 1: ranged (6 tiles), fragile. Cost in food. |
| `unitTypes.arcanist.wood` | 40 | Cost in wood. |
| `unitTypes.arcanist.gold` | 30 | Cost in gold. |
| `unitTypes.arcanist.trainTicks` | 170 | Training time in ticks. |
| `unitTypes.arcanist.pop` | 1 | Housing used. |
| `unitTypes.arcanist.speed` | 260 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.arcanist.vision` | 9 | Vision radius in tiles. |
| `unitTypes.arcanist.hp` | 70 | Hit points. |
| `unitTypes.arcanist.attack` | 11 | Damage per hit before modifiers. |
| `unitTypes.arcanist.range` | 60 | Reach ×10 tiles (12 = melee). |
| `unitTypes.arcanist.cooldown` | 15 | Ticks between hits. |
| `unitTypes.arcanist.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.arcanist.vsUnits` | 110 | Damage % against units. |
| `unitTypes.arcanist.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.arcanist.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.arcanist.stealth` | 0 | 0. |
| `unitTypes.arcanist.capacity` | 0 | 0. |
| `unitTypes.colossus.food` | 0 | Scholars capstone: costly in gold and adamite. Cost in food. |
| `unitTypes.colossus.wood` | 180 | Cost in wood. |
| `unitTypes.colossus.gold` | 200 | Cost in gold. |
| `unitTypes.colossus.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.colossus.pop` | 6 | Housing used. |
| `unitTypes.colossus.speed` | 180 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.colossus.vision` | 7 | Vision radius in tiles. |
| `unitTypes.colossus.hp` | 1100 | Hit points. |
| `unitTypes.colossus.attack` | 40 | Damage per hit before modifiers. |
| `unitTypes.colossus.range` | 15 | Reach ×10 tiles (12 = melee). |
| `unitTypes.colossus.cooldown` | 20 | Ticks between hits. |
| `unitTypes.colossus.armor` | 7 | Flat damage reduction per hit. |
| `unitTypes.colossus.vsUnits` | 100 | Damage % against units. |
| `unitTypes.colossus.vsBuildings` | 220 | Damage % against buildings. |
| `unitTypes.colossus.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.colossus.stealth` | 0 | 0. |
| `unitTypes.colossus.capacity` | 0 | 0. |
| `unitTypes.grovewarden.food` | 45 | Treewardens tier 1: forest archer. Cost in food. |
| `unitTypes.grovewarden.wood` | 50 | Cost in wood. |
| `unitTypes.grovewarden.gold` | 0 | Cost in gold. |
| `unitTypes.grovewarden.trainTicks` | 160 | Training time in ticks. |
| `unitTypes.grovewarden.pop` | 1 | Housing used. |
| `unitTypes.grovewarden.speed` | 270 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.grovewarden.vision` | 8 | Vision radius in tiles. |
| `unitTypes.grovewarden.hp` | 75 | Hit points. |
| `unitTypes.grovewarden.attack` | 9 | Damage per hit before modifiers. |
| `unitTypes.grovewarden.range` | 65 | Reach ×10 tiles (12 = melee). |
| `unitTypes.grovewarden.cooldown` | 15 | Ticks between hits. |
| `unitTypes.grovewarden.armor` | 0 | Flat damage reduction per hit. |
| `unitTypes.grovewarden.vsUnits` | 100 | Damage % against units. |
| `unitTypes.grovewarden.vsBuildings` | 20 | Damage % against buildings. |
| `unitTypes.grovewarden.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.grovewarden.stealth` | 0 | 0. |
| `unitTypes.grovewarden.capacity` | 0 | 0. |
| `unitTypes.treant.food` | 250 | Treewardens capstone: tough, slow, burns easily (flammable). Cost in food. |
| `unitTypes.treant.wood` | 200 | Cost in wood. |
| `unitTypes.treant.gold` | 0 | Cost in gold. |
| `unitTypes.treant.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.treant.pop` | 6 | Housing used. |
| `unitTypes.treant.speed` | 170 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.treant.vision` | 7 | Vision radius in tiles. |
| `unitTypes.treant.hp` | 1000 | Hit points. |
| `unitTypes.treant.attack` | 34 | Damage per hit before modifiers. |
| `unitTypes.treant.range` | 14 | Reach ×10 tiles (12 = melee). |
| `unitTypes.treant.cooldown` | 18 | Ticks between hits. |
| `unitTypes.treant.armor` | 5 | Flat damage reduction per hit. |
| `unitTypes.treant.vsUnits` | 100 | Damage % against units. |
| `unitTypes.treant.vsBuildings` | 250 | Damage % against buildings. |
| `unitTypes.treant.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.treant.stealth` | 0 | 0. |
| `unitTypes.treant.capacity` | 0 | 0. |
| `unitTypes.reefguard.food` | 55 | Reefbuilders tier 1: coastal infantry. Cost in food. |
| `unitTypes.reefguard.wood` | 25 | Cost in wood. |
| `unitTypes.reefguard.gold` | 0 | Cost in gold. |
| `unitTypes.reefguard.trainTicks` | 160 | Training time in ticks. |
| `unitTypes.reefguard.pop` | 1 | Housing used. |
| `unitTypes.reefguard.speed` | 265 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.reefguard.vision` | 6 | Vision radius in tiles. |
| `unitTypes.reefguard.hp` | 115 | Hit points. |
| `unitTypes.reefguard.attack` | 11 | Damage per hit before modifiers. |
| `unitTypes.reefguard.range` | 12 | Reach ×10 tiles (12 = melee). |
| `unitTypes.reefguard.cooldown` | 10 | Ticks between hits. |
| `unitTypes.reefguard.armor` | 2 | Flat damage reduction per hit. |
| `unitTypes.reefguard.vsUnits` | 100 | Damage % against units. |
| `unitTypes.reefguard.vsBuildings` | 40 | Damage % against buildings. |
| `unitTypes.reefguard.water` | 0 | 1 = sails (kraken), 0 = land. |
| `unitTypes.reefguard.stealth` | 0 | 0. |
| `unitTypes.reefguard.capacity` | 0 | 0. |
| `unitTypes.kraken.food` | 250 | Reefbuilders capstone: a sea unit (water = 1) that shoots coasts. Cost in food. |
| `unitTypes.kraken.wood` | 50 | Cost in wood. |
| `unitTypes.kraken.gold` | 120 | Cost in gold. |
| `unitTypes.kraken.trainTicks` | 600 | Training time in ticks. |
| `unitTypes.kraken.pop` | 6 | Housing used. |
| `unitTypes.kraken.speed` | 300 | Fixed-point sub-units per tick on plains (1024 = 1 tile). |
| `unitTypes.kraken.vision` | 9 | Vision radius in tiles. |
| `unitTypes.kraken.hp` | 900 | Hit points. |
| `unitTypes.kraken.attack` | 32 | Damage per hit before modifiers. |
| `unitTypes.kraken.range` | 45 | Reach ×10 tiles (12 = melee). |
| `unitTypes.kraken.cooldown` | 16 | Ticks between hits. |
| `unitTypes.kraken.armor` | 4 | Flat damage reduction per hit. |
| `unitTypes.kraken.vsUnits` | 110 | Damage % against units. |
| `unitTypes.kraken.vsBuildings` | 150 | Damage % against buildings. |
| `unitTypes.kraken.water` | 1 | 1 = sails (kraken), 0 = land. |
| `unitTypes.kraken.stealth` | 0 | 0. |
| `unitTypes.kraken.capacity` | 0 | 0. |
| `buildingTypes.caravanserai.size` | 2 | Dune raiders unique building. Footprint in tiles. |
| `buildingTypes.caravanserai.wood` | 120 | Cost in wood. |
| `buildingTypes.caravanserai.stone` | 40 | Cost in stone. |
| `buildingTypes.caravanserai.buildPoints` | 320 | Work needed to build. |
| `buildingTypes.caravanserai.housing` | 0 | 0. |
| `buildingTypes.caravanserai.territory` | 0 | 0. |
| `buildingTypes.caravanserai.vision` | 6 | Vision radius. |
| `buildingTypes.caravanserai.hp` | 900 | Hit points. |
| `buildingTypes.caravanserai.attack` | 0 | 0. |
| `buildingTypes.caravanserai.range` | 0 | 0. |
| `buildingTypes.caravanserai.cooldown` | 0 | 0. |
| `buildingTypes.caravanserai.garrison` | 0 | 0. |
| `buildingTypes.library.size` | 2 | Scholars unique building. Footprint in tiles. |
| `buildingTypes.library.wood` | 100 | Cost in wood. |
| `buildingTypes.library.stone` | 80 | Cost in stone. |
| `buildingTypes.library.buildPoints` | 350 | Work needed to build. |
| `buildingTypes.library.housing` | 0 | 0. |
| `buildingTypes.library.territory` | 0 | 0. |
| `buildingTypes.library.vision` | 6 | Vision radius. |
| `buildingTypes.library.hp` | 800 | Hit points. |
| `buildingTypes.library.attack` | 0 | 0. |
| `buildingTypes.library.range` | 0 | 0. |
| `buildingTypes.library.cooldown` | 0 | 0. |
| `buildingTypes.library.garrison` | 0 | 0. |
| `buildingTypes.grove.size` | 2 | Treewardens unique building. Footprint in tiles. |
| `buildingTypes.grove.wood` | 160 | Cost in wood. |
| `buildingTypes.grove.stone` | 0 | Cost in stone. |
| `buildingTypes.grove.buildPoints` | 300 | Work needed to build. |
| `buildingTypes.grove.housing` | 0 | 0. |
| `buildingTypes.grove.territory` | 0 | 0. |
| `buildingTypes.grove.vision` | 4 | Vision radius. |
| `buildingTypes.grove.hp` | 900 | Hit points. |
| `buildingTypes.grove.attack` | 0 | 0. |
| `buildingTypes.grove.range` | 0 | 0. |
| `buildingTypes.grove.cooldown` | 0 | 0. |
| `buildingTypes.grove.garrison` | 0 | 0. |
| `buildingTypes.reefDock.size` | 2 | Reefbuilders unique building; must touch the sea or a lake. Footprint in tiles. |
| `buildingTypes.reefDock.wood` | 140 | Cost in wood. |
| `buildingTypes.reefDock.stone` | 20 | Cost in stone. |
| `buildingTypes.reefDock.buildPoints` | 350 | Work needed to build. |
| `buildingTypes.reefDock.housing` | 0 | 0. |
| `buildingTypes.reefDock.territory` | 0 | 0. |
| `buildingTypes.reefDock.vision` | 6 | Vision radius. |
| `buildingTypes.reefDock.hp` | 800 | Hit points. |
| `buildingTypes.reefDock.attack` | 0 | 0. |
| `buildingTypes.reefDock.range` | 0 | 0. |
| `buildingTypes.reefDock.cooldown` | 0 | 0. |
| `buildingTypes.reefDock.garrison` | 0 | 0. |
| `races.abilities.thieves.points` | 6 | Raiding economy: steals double, ambushes. |
| `races.abilities.thieves.stealPct` | 200 | Theft takes 200 % of `covert.stealAmount`. |
| `races.abilities.thieves.detectMinusPct` | 10 | Spies 10 points less likely to be caught. |
| `races.abilities.thieves.ambushPct` | 130 | Damage 130 % against units not hit in the last … |
| `races.abilities.thieves.ambushQuietTicks` | 100 | … 10 s (a foe not yet in a fight). |
| `races.abilities.poorFarmers.points` | -6 | Food is the base of every economy. |
| `races.abilities.poorFarmers.farmYieldPct` | 60 | Farms yield 60 %. |
| `races.abilities.quickStudy.points` | 6 | The tech race is theirs. |
| `races.abilities.quickStudy.researchTimePct` | 60 | Research takes 60 % of the time. |
| `races.abilities.quickStudy.detectMinusPct` | 10 | Spies 10 points less likely to be caught. |
| `races.abilities.fragileArmy.points` | -6 | Every fight costs them more. |
| `races.abilities.fragileArmy.militaryHpPct` | 75 | Soldiers have 75 % HP (workers and scouts don't). |
| `races.abilities.forestKin.points` | 6 | Strong only where forests are; forests are common. |
| `races.abilities.forestKin.forestDamageTakenPct` | 70 | Units in forest take 70 % damage. |
| `races.abilities.forestKin.woodGatherPct` | 130 | Wood gathering 130 %. |
| `races.abilities.flammable.points` | -6 | Fire becomes a real threat (Set fire order). |
| `races.abilities.flammable.fireDamagePct` | 250 | Fire damage 250 % to their units and buildings. |
| `races.abilities.reefBuilders.points` | 6 | Water bases from the first minute. |
| `races.abilities.reefBuilders.pierCostPct` | 50 | Piers cost 50 %; the Piers research is free. |
| `races.abilities.weakLandArmy.points` | -6 | They must win at sea or behind towers. |
| `races.abilities.weakLandArmy.landDamagePct` | 75 | Land soldiers deal 75 % damage. |
