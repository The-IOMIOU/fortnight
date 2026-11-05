# REAL-TIME CONTINENT STRATEGY GAME: Master Prompt

You are the lead developer of an original browser-based, real-time, 2.5D strategy game about growing a civilization on a randomly generated continent and conquering the whole map. It plays with the quick, readable feel of a small-scale tile strategy game combined with the pace and unit-deployment feel of a real-time lane-battler, but it is NOT turn-based and must NOT copy any existing game's assets, names, units, art, UI, or code. Everything (names, races, art, text) is ORIGINAL.

Choose the tech stack and architecture yourself, justify it briefly, and wait for my approval of the Phase 0 plan before building. If a requirement cannot be met as written, say so and propose the closest workable version. Do not silently replace or drop it.

---

## 0. HOW YOU MUST WORK (anti-drift contract: obey always)

1. **Feature ledger.** Before any gameplay code, create `FEATURES.md`: numbered features (F-001, F-002, ...) covering every requirement below. Each entry: description, concrete acceptance test, status (`not started` / `in progress` / `done-verified` / `blocked`), and evidence.
2. **Done means demonstrated.** Mark a feature `done-verified` only after running its acceptance test and recording what you observed. Never mark done from reading code. If you could not run it, say so.
3. **No unlisted work.** Do not add features, systems, assets, or refactors that are not in the ledger. Propose them in a PROPOSALS section of `FEATURES.md` and wait for approval.
4. **No invented APIs.** If you are not sure a library function, browser feature, or setting exists, check the docs or test it in a small script. Say "unsure" instead of guessing.
5. **Honest status.** After each session report: what works (with evidence), what is broken, what is unverified, and anything you changed that was not asked.
6. **Stop at each phase gate** and wait for my approval. Never continue to the next phase on your own.
7. **Finish one feature (verified) before starting the next.**
8. **Keep `TUNING.md`** listing every balance/physics constant you tune, its value, and why.
9. Keep the repository small and clean (see section 9).

---

## 1. CORE CONCEPT

- Real-time strategy on a randomly generated continent. Each match generates a new continent from a seed (shareable).
- The player picks a RACE with a special ability, a weakness, and a unique evolution tree. The goal is to take control of the whole continent ("the globe") by conquest, colonization, trade/diplomacy, or economic and tech dominance.
- Matches are short by default (small map, a few bots), but scale up to huge maps with up to 32 AI/human players.
- Game speed controls: pause, slow, normal, fast, very fast. Pausing allows giving orders (the sim does not advance). Multiplayer speed is host-controlled or voted.
- Perspective: 2.5D (isometric or angled tile-based view with height), with a camera that pans, zooms, and edge-scrolls; touch support where practical.

### 1.1 Winning and losing
- **Conquest victory:** control every capital (or every enemy capital destroyed or captured) on the continent.
- **Domination victory:** hold a set percentage of land tiles (default 70%, configurable) for a set time.
- **Alliance/co-op victory:** the whole team meets one of the above.
- Optional victories (enabled in settings): tech/evolution completion, economic victory (hold a majority of a key resource trade).
- **Elimination:** a player is eliminated when they lose their capital and all settlements. Eliminated humans can spectate.
- Match length targets: Small about 15-25 minutes, Medium 30-60, Large and Huge are long sessions with save/resume.

## 2. MAP AND WORLD

- Procedurally generated continent per seed: land, coast, mountains, forests, plains, desert, swamp, rivers, lakes, and ocean around it. Biomes affect resources, food, and movement.
- Map size selection: Small, Medium, Large, Huge (the largest supports up to 32 players/bots). Small is the default and loads quickly.
- Fog of war with scouting.
- **Terrain modification:** build walls and gates, dig trenches and holes, fill trenches with water from adjacent water to make moats. Terrain changes affect pathing and combat. Later tech allows building on water (piers, platforms, water bases).
- **Continent stats panel:** shows land tiles owned vs total, population, food balance, resource stocks and income, per-resource deposits found, and a minimap with ownership overlay.

## 3. RESOURCES AND ECONOMY

- Resources: food, wood, stone, gold, carbon, adamite (a rare metal), plus race-specific ones. Resources are mined, farmed, fished, hunted, or traded.
- Population is limited by food and housing; buildings cost resources and need workers.
- Equipment tiers: tools, armor, swords/spears/bows, advanced weapons (including late-game firearms and unique race tech), crafted from resource chains (for example carbon + adamite → alloy). Gear is crafted at buildings and assigned to troops.
- Tech/evolution tree (see section 5) gates buildings, units, and gear.
- Economic actions: build, harvest, upgrade, trade, **steal** (raids and thieves), **spy** (reveal enemy info, sabotage), **poison** (poison wells, crops, or units; limited by race and tech), **destroy** (siege and demolition), **colonize** (claim new land with settlers and outposts).

## 4. UNITS AND COMBAT

- Real-time combat with units that auto-fight but can be given orders: move, attack, hold, retreat, patrol, garrison, formations (simple), and rally points.
- Unit types come from race and tech: workers, scouts, infantry, ranged, cavalry/beasts, siege, naval/water units, spies, saboteurs, and heroes (optional, later).
- Combat factors: unit stats, armor/weapon tiers, terrain height and cover, walls and moats, morale (simple), and race abilities.
- Performance budget: the sim must run at 60 FPS rendering on a mid-range laptop with the Medium map and 8 bots, and remain playable on Huge with a lower unit cap and reduced effects. Report measured numbers.

## 5. RACES (data-driven, target 100)

- Every race is a data entry (JSON or similar), not hardcoded: name, description, stat modifiers, one special ability, one real weakness, preferred biomes, starting units, and an **evolution branch** that unlocks unique advanced troops and buildings.
- Example designs (use as style guides; create original names):
  - **Tidal folk:** can breathe and build underwater, fast in water, but take damage in sunlight outside water, so they can only expand on land at night. Evolution: water bases, deep-sea beasts.
  - **Beastcallers:** can tame any wild animal. Evolution: war beasts, reviving dead animals, and (after long research) reviving extinct giant reptiles.
  - **Stone clans:** tunnel under terrain and strike from beneath; weak at sea.
  - **Sporekin:** spread fungal growth that poisons land; slow growth and fragile.
  - **Sky nomads:** gliders and fast scouts, poor at defense.
- Delivery plan: build the systems with **6-8 fully designed races first**, then add races in batches using the same data format until 100 exist. Do not hand-code each race. Provide a **balance harness**: a headless mode that runs many bot-vs-bot matches with random races and seeds and reports win rates per race; flag any race above or below sensible bounds. Race creation is data plus ability components; abilities are reusable modules (for example `underwaterBreathing`, `sunDamage`, `tameAnimals`, `tunneling`) combined by data.

### 5.1 Race data template (every race must fill all fields)
- `id`, `name`, `description`, `biome_preference`
- `stat_modifiers` (gather speed, build speed, unit health/damage, vision, movement)
- `special_ability` (one, built from reusable ability modules) and `weakness` (one, a real, exploitable cost)
- `starting_units`, `starting_buildings`
- `evolution_tree`: branch nodes with research cost, prerequisites, what each unlocks (buildings, units, gear, abilities), and a final "capstone" unit or building
- `unique_units` (2-4) and `unique_building` (1)
- `bot_hints`: which personalities and strategies the race suits
- Validation: a schema check runs at startup and in the balance harness; invalid races are reported by id and field.

### 5.2 Starter race seeds (create original names; use as design guides for the first batch)
1. Tidal folk: breathe and build underwater; burn in sunlight, so surface expansion only at night
2. Beastcallers: tame wild animals; evolution leads to reviving dead animals and, much later, extinct giant reptiles
3. Stone clans: tunnel under terrain and strike from below; weak at sea
4. Sporekin: spread fungal growth that poisons enemy land; slow and fragile
5. Sky nomads: gliders and fast scouts; poor defense
6. Forgeborn: cheaper and stronger metal gear; heavy units, slow movement
7. Marsh dwellers: fast and hidden in swamps; weak on open plains
8. Frostkin: strong in cold biomes, food bonus from ice fishing; lose output in heat
9. Dune raiders: excel at stealing and ambush; poor farming
10. Scholars: very fast research and spies; fragile army
11. Treewardens: forests grant defense and growth; vulnerable to fire
12. Reefbuilders: build water bases early; weak land armies

## 6. AI BOTS

- Bot count is selectable (0 to 32). Difficulty: **Easy, Hard, Impossible.** Define clearly in `TUNING.md` what each does. Easy: slow, mistakes. Hard: efficient play with no resource cheating. Impossible: best decision-making plus an optional, toggled resource bonus that is shown in the settings if enabled. Never cheat on fog of war unless I approve it.
- **Bot personalities** (stereotypes that change decisions and chat tone): Berserker (charges fearlessly), Pacifist builder (turtles, trades), Merchant (trades and bribes, avoids war), Schemer (spies, poisons, backstabs), Expansionist (colonizes fast), Defender (walls and moats), Raider (steals and harasses). Add more as data.
- Bots decide through utility-based AI with clear goals (expand, economy, defense, attack, diplomacy) so behavior is debuggable. Provide a debug overlay of each bot's current goal.

## 7. DIPLOMACY, TRADE, AND CHAT

- A chat panel with players and bots. Trade offers (resources, gear, tech, land, alliances, ceasefires) can be sent, accepted, or countered.
- Bot negotiation uses rule-based logic with personality-driven templated dialogue (no external AI service in the first versions). Bots can lie, threaten, request help, propose alliances, betray, and demand tribute depending on personality and relationship.
- Diplomatic states: war, peace, ceasefire, alliance, trade pact, with consequences for breaking them.
- Chat between humans in multiplayer works the same way, with mute/block options.

## 8. MULTIPLAYER

- Local single-player is the default. Multiplayer is optional: host a game and friends join with a link or code. Co-op (shared team vs bots) and free-for-all.
- **APPROVED DECISION: peer-to-peer over WebRTC, host-authoritative.** The host runs the deterministic simulation and ALL bots; human clients send commands and render. Do not run a full mesh: humans connect only to the host, so the connection count equals the number of humans, not the number of players. Realistic human cap over P2P is about 4 to 8; the rest are bots.
- Use a minimal free signaling mechanism (room code or shareable link). Document a TURN/relay fallback plan for networks where direct connections fail. In Phase 0, report the cost, limits, and failure modes of the signaling and relay choices.
- The simulation must be deterministic for a given seed and command stream. This also enables replays and the headless balance harness.
- Single-player must work fully offline, with no network and no server. The client must be deployable as a static site (for example GitHub Pages); only the signaling/relay piece may need a separate service.
- Handle disconnects, reconnects, host migration (or a clear "host left" outcome), pause rules, and desync detection (compare state hashes periodically and report mismatches).
- Handle disconnects, reconnects, and pausing rules for multiplayer.

## 8.5 UI AND CONTROLS

- **Main menu:** New Game (race, map size, seed, bot count and difficulty, victory conditions, game speed), Join Game (room code), Settings, Tutorial.
- **In-game HUD:** resource bar with income rates, population and food, game speed controls with pause, minimap with ownership overlay, notification feed (attacks, discoveries, diplomacy), selected-unit/building panel, build menu, tech/evolution screen, chat and diplomacy panel.
- **Continent stats panel:** land owned vs total, resources found and income, food balance, population, army strength, per-player comparison.
- **Controls:** mouse (select, box-select, right-click orders, drag camera, scroll zoom), keyboard shortcuts (hotkeys for build menu, speed, control groups), edge scrolling. Touch controls as a stretch goal, not a blocker.
- **Pause rules:** in single-player, pausing allows orders. In multiplayer, pausing is host-controlled or voted.
- **Accessibility:** colorblind-friendly team colors, scalable UI text, and rebindable keys.

## 9. TECH AND DELIVERY

- Browser game, runs from a GitHub repository (the client must be deployable as a static site). Use TypeScript and a bundler of your choice. Keep the repository small: no large binary assets in git; generate or use light compressed assets. All art and audio original or properly licensed (record licenses in `ASSETS.md`).
- Run the simulation in a Web Worker (or equivalent) separate from rendering, with a data-oriented design for large unit counts and efficient pathfinding (flow fields or similar for groups).
- Settings: map size, bot count and difficulty, race, seed, game speed, graphics quality, and sound.
- Save/load and seed sharing. Basic tutorial (short, optional).
- Keep the first build small and fast to load.

## 10. BUILD ORDER (stop after each phase for my approval)

**PHASE 0: Plan.** Choose the stack, justify it, create `FEATURES.md`, list the biggest technical risks, propose the folder structure and the simulation architecture. Wait for approval.

**PHASE 1: Map and view.** Seeded procedural continent, 2.5D rendering, camera, fog of war, minimap, game speed controls with pause. Acceptance: the same seed produces the same map; 60 FPS on Small and Medium; speed controls work.

**PHASE 2: Economy core.** One race, workers, resource gathering, buildings, population and food, continent stats panel. Acceptance: a player can grow an economy and the numbers in the stats panel match the simulation.

**PHASE 3: Combat and terrain.** Units, orders, combat, walls, digging and moats. Acceptance: a defended wall plus moat measurably changes the outcome of a scripted battle.

**PHASE 4: Bots.** Utility AI with at least three personalities, difficulty levels, and the debug overlay. Acceptance: bot-only matches run headless and finish; difficulty levels show measurable differences.

**PHASE 5: Tech and evolution.** The tech tree, equipment crafting chain, and the first 6-8 races with their abilities and evolution branches. Acceptance: each race plays distinctly and its special ability and weakness work as described.

**PHASE 6: Diplomacy and chat.** Trade, treaties, personality-driven negotiation, steal/spy/poison actions.

**PHASE 7: Multiplayer and co-op.**

**PHASE 8: Scale.** Huge maps with 32 players/bots, performance tuning, balance harness, expand races in batches toward 100.

**PHASE 9: Polish, tutorial, release preparation.**

## 11. BIGGEST RISKS (acknowledge in Phase 0)
1. Real-time simulation performance with many units and 32 players.
2. Deterministic simulation and multiplayer sync.
3. Balance across 100 races (use the harness and data-driven design).
4. Scope: this is large; the ledger and phase gates exist to keep it finishable.
5. Bot negotiation quality without an external AI service.

## 12. FINAL RULE
If a requirement cannot be done as written, say so and propose the closest workable version. Do not silently replace it with something else.
