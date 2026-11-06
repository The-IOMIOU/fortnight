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
| `map.straitReach` | 16 | Next to a narrow strait the continent's edge falloff fades out over this many tiles, so both coasts actually reach the strait instead of leaving a wide gap. |
| `map.partnerDistPct` | 145 | Partner continent centres are placed at 145/200 of their summed radii, so their falloffs overlap and only the forced strait separates them. |
| `map.globeCurveStrength` | 0.06 | Render only: how strongly the globe view bends down towards the horizon. Strong enough to read as a globe when zoomed out, weak enough that picking stays accurate. |

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
