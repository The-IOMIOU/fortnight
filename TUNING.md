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

## Bot difficulty

Defined in Phase 4 (F-121).
