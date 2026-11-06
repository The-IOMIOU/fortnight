in progress | Core written (PRNG, fixed-point, hash, Sim, scripted run); tests written but not yet run |in progress | Generation time measured (Node): Small 16 ms, Medium 37, Large 89, Huge 170. Menu default not built yet |in progress | Node: 20 seeds × 4 sizes give identical hashes/arrays on repeat runs, 30 seeds all distinct. Browser comparison not yet run |done-verified | 2026-11-05 same test: tundra, snow, desert and sea ice present on all 200 maps |done-verified | 2026-11-05 `tests/mapgen.test.ts`: 50 seeds × 4 sizes passed, every biome above its minimum, main continent 100 % of land on all 200 maps, ocean border on all |# FEATURES.md — Feature Ledger

Rules (from spec §0): a feature is `done-verified` only after its acceptance test has been **run** and the observation recorded under Evidence. Statuses: `not started` / `in progress` / `done-verified` / `blocked`. Work not listed here goes to **PROPOSALS** first.

Thresholds written as `T:` are proposed defaults; final values live in `TUNING.md` once they exist.
"Derived" = not named directly in the spec but required for a named requirement to work (see PLAN.md §7-A).

Phase column = phase in which the feature is built (spec §10).

---

## A. Process & delivery (spec §0, §9)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-001 | 0 | Feature ledger covering every requirement | Traceability table (bottom of file) maps every spec section/bullet to ≥1 F-id; reviewed and approved by owner | done-verified | Owner approved Phase 0 on 2026-11-05 ("okay do phase 1"), amendments recorded in PLAN.md header and F-097/F-112 |
| F-002 | 1 | `TUNING.md` lists every tuned balance/physics constant with value and reason | `tools/check-tuning` compares constants in `src/data/tuning*.json` with `TUNING.md`; zero missing entries | done-verified | 2026-11-06 `npm run check`: check-tuning OK, 49 constants in tuning.json all documented with matching values |
| F-003 | 1 | `ASSETS.md` records licenses for all art/audio | `tools/check-assets` finds every non-code asset file listed in ASSETS.md with a license | done-verified | 2026-11-06 check-assets OK: 0 asset files (all visuals generated in code, see ASSETS.md) |
| F-004 | 1 | Repo stays small and clean: no large binaries | `tools/check-repo` fails on any tracked file > 200 KB or binary asset outside an allow-list; total tracked size reported | done-verified | 2026-11-06 check-repo OK: 51 files, 250 KB total, no binaries, nothing over 200 KB except package-lock.json (allow-listed) |
| F-005 | 1 | Static-site build deployable to GitHub Pages | `npm run build` → serve `dist/` with a plain static server → game loads and New Game starts | done-verified | 2026-11-06 `npm run build` → `dist/` served by `vite preview` (static file server) → game loads and starts; all Playwright tests run against this build. Not yet deployed to GitHub Pages itself |
| F-006 | 2 | Single-player fully offline (no network, no server) | Load built game, set browser offline, start and play a Small match for 2 min; zero network requests after load | not started | — |
| F-007 | 1 | First build small and fast to load | Initial JS ≤ 400 KB gzipped (T:); Small map New Game → playable in ≤ 3 s on dev machine (measured) | in progress | Initial JS 154 KB gzipped (limit 400). Load-to-playable time not measured separately yet |

## B. Simulation core (spec §8 determinism, §9 worker/data-oriented, §1 speed)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-010 | 1 | Deterministic sim: seeded PRNG streams, fixed 10 Hz tick, integer/fixed-point state | Same seed + same command log run twice in Node and once in Chrome and Firefox → identical state hash at ticks 100, 1 000, 10 000; ban-list script finds no `Math.random`/`Date`/`performance.now`/trig in `src/sim` | done-verified | 2026-11-06 scripted 4-player run, hashes at ticks 100/1000/10000 = 3776629615/3132915563/1870461472, identical in Node (twice), Chromium and Firefox (`tests/e2e/determinism.spec.ts`). check-sim-purity OK on 12 files and fails on a planted `Math.random` |
| F-011 | 1 | Simulation runs in a Web Worker, separate from rendering | Performance trace shows sim tick on worker thread; injecting a 200 ms stall in the worker keeps render loop ≥ 55 FPS | done-verified | 2026-11-06 headed Chromium (RTX 3060): worker blocked by back-to-back 200 ms busy-waits for 4 s → render avg 144 FPS, p95 7.0 ms, worst 7.3 ms; sim advanced only 38 ticks (worker starved, render unaffected) |
| F-012 | 1 | Data-oriented entity storage (SoA typed arrays) | Benchmark: 10 000 moving entities, movement system ≤ 2 ms/tick in Node on dev machine (T:) | done-verified | 2026-11-06 `tests/sim.test.ts`: 10 000 moving entities 0.97 ms/tick in Node (limit 2 ms) |
| F-013 | 1 | Game speed controls: pause, slow 0.5×, normal 1×, fast 2×, very fast 4× | Measured ticks/s at each setting within ±5 % of target over 20 s; pause → tick counter unchanged for 10 s | done-verified | 2026-11-06 Chromium, clicking the speed buttons, 20 s each: 4.99 / 9.98 / 19.96 / 39.98 ticks/s for 5/10/20/40 targets; paused: tick 1578 → 1578 over 10 s; Space resumes |
| F-014 | 1 | Orders while paused (single-player) | Pause, issue move order: tick does not advance, order shown as pending; unpause → order executes on next tick | done-verified | 2026-11-06 Chromium: paused at tick 6, clicked scout, right-clicked ground → '1 order queued', tick unchanged for 2 s, scout unmoved; unpaused → pending 0, scout moved (22.5,44.5)→(26.8,45.8) |
| F-015 | 1 | Shareable seed (seed string + share link) | Copy share link → open in new tab → identical map hash | done-verified | 2026-11-06 Chromium: menu start (seed golden-fjord-404, Medium) map 1bafb748; share link in a new tab → same map 1bafb748, size medium |
| F-016 | 2 | Save / load (local IndexedDB + file download/upload), resume Large/Huge | Save at tick T, load, run 1 000 ticks → hash equals an uninterrupted run; save file loads after browser restart; old-version save rejected with clear message | not started | — |
| F-017 | 7 | Replays from seed + command log | Record a 10-min bot match; replay → final hash identical | not started | — |

## C. Map & world (spec §2)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-020 | 1 | Procedural world per seed with **several massive continents separated by ocean** (owner correction 2026-11-06): land, coast, mountains, forests, plains, desert, swamp, rivers, lakes, ocean | For 50 seeds × 4 sizes: every listed biome present above min tile count; continent count (land masses ≥ 8 % of land) ≥ max(2, target − 1) for the size; every pair of continents separated by water; map border is ocean; players spread across continents | done-verified | 2026-11-06 `tests/mapgen.test.ts` (multi-continent version): 50 seeds × 4 sizes, every biome above its minimum, continents per map Small 3/3 on all 50, Medium 4/4, Large 5/5, Huge 7 on 46 and 6 on 4 (need ≥ 6); no two continents touch; first starts on distinct continents; ocean border on all. Visually checked on Medium (4 continents) in the browser |
| F-021 | 1 | Same seed → same map | Tile-array hash identical across 2 runs and across Node vs browser for 20 seeds | done-verified | 2026-11-06 Node: 20 seeds × 4 sizes repeat-identical, 30 seeds distinct. Chromium and Firefox: same 80 map hashes as Node, 0 mismatches |
| F-022 | 1 | Map sizes Small / Medium / Large / Huge; Small default and fast | Menu defaults to Small; generation time measured per size; Small ≤ 1 s (T:) | done-verified | 2026-11-06 menu defaults to Small (Playwright). Generation in Node: Small 16 ms, Medium 41, Large 99, Huge 186 |
| F-023 | 2 | Biomes affect resources, food and movement | Scripted unit crosses N swamp tiles vs N plains tiles: time ratio matches movement-cost table ±5 %; deposit/food yield per biome matches table | not started | — |
| F-024 | 1 | 2.5D rendering with height (angled view, terraced elevation) | Screenshot of Small and Medium maps shows distinct elevation levels, coastline, rivers, biome colors | done-verified | 2026-11-06 browser screenshots of Small (start area) and Medium (whole world, spectator view): terraced elevation with cliffs, coastlines, rivers, lakes, snow peaks and biome colors visible |
| F-025 | 1 | Camera: pan (drag + keys), zoom (wheel), edge-scroll, bounds clamped | Automated input test: drag/keys/edge/wheel each change camera state in the expected direction; camera cannot leave map bounds | done-verified | 2026-11-06 Chromium input test: wheel 40→44.8 distance and back; W z 103.5→87.9; D x 160.5→176.7; middle-drag right x 176.7→164.7; pointer at left edge x 164.7→145.5; setTarget(-500,99999) clamped to (0,192) |
| F-026 | 1 | Fog of war with scouting (unexplored / explored / visible) | Unit moving across map reveals tiles within vision radius only; enemy entities on non-visible tiles are absent from the render snapshot (checked in snapshot data, not just visually) | done-verified | 2026-11-06 Node: 177 tiles visible at start → 396 explored after 40 ticks, every visible tile within vision radius or own territory; enemy scouts absent from snapshot until in range. Chromium: viewer snapshot contains only owner 0 with 4 players on map |
| F-027 | 1 | Minimap with ownership overlay, click-to-jump | Minimap matches tile data (pixel sample test); ownership colors match territory array; click moves camera to that tile | done-verified | 2026-11-06 Chromium: minimap click at (50 %, 25 %) → camera (64, 32) on 128 map; unexplored tile pixel (8,9,12); owned start tile tinted toward player blue (27,115,122). Ownership is the starting claim for now; full territory rules are F-055 (Phase 2) |
| F-028 | 1 | 60 FPS on Small and Medium (Phase 1 gate) | Perf HUD over a 30 s scripted camera sweep: avg ≥ 60 FPS, p95 frame time ≤ 20 ms on dev machine; also reported under 4× CPU throttle | done-verified | 2026-11-06 headed Chromium, i5-10400F + RTX 3060, 1280×800, 30 s camera sweep: Small and Medium avg 144.0 FPS, p95 7.3 ms (also Large and Huge 144.0, p95 7.3); fully zoomed out the same; with 4× CPU throttle Small 143.9 / Medium 144.0 / Large 143.3 / Huge 144.0 FPS. 144 is the monitor's refresh cap (vsync), so true headroom is higher and unmeasured. Desktop numbers, not a laptop (PLAN §7-E) |
| F-029 | 1 | **Derived:** day/night cycle (Tidal folk, visuals) | `isNight` toggles on configured period; visual tint changes; sun-dependent abilities read the flag | not started | — |
| F-030 | 1 | **Derived:** temperature zones incl. cold biome (tundra/snow) and sea ice; hot zones (desert) | 50 seeds: every map has cold and hot tiles; ice tiles exist on cold coasts | done-verified | 2026-11-06 same test as F-020: tundra, snow, desert and sea ice present on all 200 maps |
| F-031 | 2 | **Derived:** wild animals (huntable; tameable later) | Animals spawn by biome, wander, can be hunted for food at the TUNING rate | not started | — |

## D. Terrain modification (spec §2)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-040 | 3 | Walls and gates | Wall line blocks enemy pathing (units reroute or stop); own/allied units pass through gate; enemies cannot | not started | — |
| F-041 | 3 | Dig trenches and holes | Workers dig a tile → height lowered; land units path around or slow per TUNING; combat modifier applies to units in/attacking from trench | not started | — |
| F-042 | 3 | Fill trenches with water from adjacent water → moats | Trench connected to lake/river fills within N ticks and becomes water; trench not connected stays dry; land units cannot cross moat | not started | — |
| F-043 | 3 | Terrain changes update pathing | Placing a wall across an active path → all affected units reroute within 2 s; removing it restores the original route; no unit walks through walls (1 000-tick fuzz) | not started | — |
| F-044 | 5 | Build on water (piers, platforms, water bases), tech-gated | Locked before tech; after research, pier/platform placeable only on valid water tiles; land units can stand on them | not started | — |
| F-045 | 3 | **Derived:** fire (spreads through forest, damages buildings/units) | Ignite forest tile → spread follows TUNING rule; fire stops at non-flammable tiles and burns out | not started | — |

## E. Resources & economy (spec §3)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-050 | 2 | Resources: food, wood, stone, gold, carbon, adamite (+ race-specific slots) | Deposits generated by biome table; each resource can be obtained in a scripted test | not started | — |
| F-051 | 2 | Gathering methods: mine, farm, fish, hunt (trade in F-151) | Scripted worker per method: income/min matches TUNING rate ±5 % | not started | — |
| F-052 | 2 | Workers gather, carry and return to drop-off; build | Worker loop observed for 5 min: stock increases by expected amount | not started | — |
| F-053 | 2 | Buildings: placement rules, resource cost, workers required, build time | Cannot place on invalid tiles or without resources; build time scales with assigned workers per TUNING | not started | — |
| F-054 | 2 | Population limited by food and housing | Training blocked at housing cap; food deficit triggers starvation effect per TUNING | not started | — |
| F-055 | 2 | Territory / land ownership | Settlements and outposts claim tiles within radius; land-owned count equals tiles with owner = player | not started | — |
| F-056 | 2 | Colonize: settlers and outposts claim new land | Settler founds outpost on unclaimed land → territory and land count increase | not started | — |
| F-057 | 2 | Building upgrades | Upgrade costs resources/time and changes stats per data | not started | — |
| F-058 | 5 | Equipment tiers (tools, armor, swords/spears/bows, advanced incl. firearms, race tech) crafted from resource chains (e.g. carbon + adamite → alloy) at buildings, assigned to troops | Craft alloy → craft gear → assign to unit → unit stats change per data; chain inputs consumed exactly | not started | — |
| F-059 | 2 | Continent stats panel: land owned vs total, population, food balance, stocks and income, deposits found, army strength, per-player comparison, minimap with ownership | Automated test: every panel value equals the sim debug dump at the same tick (Phase 2 gate) | not started | — |

## F. Units & combat (spec §4)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-070 | 3 | Orders: move, attack, hold, retreat, patrol, garrison, simple formations, rally points | One scripted test per order verifying resulting unit behavior | not started | — |
| F-071 | 3 | Units auto-fight unless on hold/retreat | Enemy enters range → unit engages without orders; held unit does not chase | not started | — |
| F-072 | 3 | Unit types: workers, scouts, infantry, ranged, cavalry/beasts, siege, naval, spies, saboteurs | Each type exists in data and is spawnable; each has its distinguishing behavior (range, speed, water, siege bonus, stealth) tested | not started | — |
| F-073 | 9 | Heroes (optional, later) | Spec marks optional — scoped at Phase 9 only if approved | not started | — |
| F-074 | 3 | Combat factors: stats, armor/weapon tiers, terrain height and cover, walls, moats, morale, race abilities | Scripted duels isolate each factor; damage/outcome difference matches formula | not started | — |
| F-075 | 3 | Morale (simple) | Unit below morale threshold retreats; morale recovers per TUNING | not started | — |
| F-076 | 3 | Siege and demolition (destroy buildings and walls) | Siege unit destroys wall in expected time; demolished tile becomes passable | not started | — |
| F-077 | 3 | Naval units and water movement | Naval units path only on water; can attack coast in range | not started | — |
| F-078 | 3 | Group pathfinding with flow fields | 200 units ordered across Medium map: ≥ 98 % arrive, path compute time measured, no unit stuck > 10 s | not started | — |
| F-079 | 3 | Scripted battle: defended wall + moat measurably changes outcome (Phase 3 gate) | Same attacking force vs same defenders, with/without wall+moat, 20 seeds: defender survival and attacker losses differ significantly; numbers recorded | not started | — |
| F-080 | 4 | Performance: 60 FPS on Medium + 8 bots; Huge playable with lower unit cap and reduced effects | Perf HUD during bot match on Medium: avg ≥ 60 FPS; Huge: avg ≥ 30 FPS and sim keeps up at 1×; measured numbers + hardware reported | not started | — |
| F-083 | 3 | **Derived (multi-continent world):** transport ships carry land units between continents (embark at coast, disembark on another shore) | Scripted: units embark, ship crosses a channel, units land on the other continent; ship sunk → cargo lost | not started | — |
| F-081 | 5 | **Derived:** air/glider movement class (Sky nomads) | Glider ignores ground pathing within glide rules; lands per TUNING | not started | — |
| F-082 | 5 | **Derived:** tunnel layer (Stone clans) | Units travel underground (invisible to enemies), surface and attack; tunnel blocked by water | not started | — |

## G. Races (spec §5)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-090 | 5 | Race data format: all §5.1 fields (id, name, description, biome_preference, stat_modifiers, special_ability, weakness, starting_units, starting_buildings, evolution_tree, unique_units 2–4, unique_building, bot_hints) | Schema has every field as required; sample race validates | not started | — |
| F-091 | 5 | Schema validation at startup and in harness; invalid races reported by id and field | Inject 5 broken races → each error names race id + field path; valid races still load | not started | — |
| F-092 | 5 | Reusable ability modules combined by data (e.g. underwaterBreathing, sunDamage, tameAnimals, tunneling) | A new test race built only from JSON with existing modules works with zero code changes | not started | — |
| F-093 | 5 | Evolution tree per race: nodes, research cost, prerequisites, unlocks, capstone | Research respects prerequisites and cost; capstone unlocks at the end; unlocked items become buildable | not started | — |
| F-094 | 5 | Shared tech tree gates buildings, units, gear | Locked items unbuildable before research, buildable after | not started | — |
| F-095 | 5 | Tech/evolution screen (UI) | Shows tree, costs, prerequisites; research started from UI appears in sim | not started | — |
| F-096 | 5 | First 6–8 fully designed races (original names); each plays distinctly (Phase 5 gate) | Per race: scripted test for ability and weakness (F-100–F-107) + recorded playtest notes; harness shows distinct stat/behavior profiles | not started | — |
| F-097 | 8 | Remaining starter seeds (F-108–F-111) and more races in batches, same data format. *Amended 2026-11-05: web version ships fewer races; an unbounded count (incl. player-made) is the later app target* | Race count reported; all validate; harness distinctness checks pass (PLAN §7-G) | not started | — |
| F-112 | 5 | **Owner-requested:** point-buy race builder. Each power-up (ability, stat bonus) has a positive score, each power-down (weakness, stat penalty) a negative score; a race is valid only when the total is exactly 0. Hand-made races follow the same rule | Validator rejects a race whose total ≠ 0, naming the total; all shipped races total 0; builder UI shows a running total and blocks saving at ≠ 0 | not started | — |
| F-098 | 8 | Balance harness: headless bot-vs-bot, random races and seeds, win rates per race, outlier flags | `npm run harness -- --matches 500` completes in parallel, outputs per-race win rate + confidence interval, flags races outside bounds (T: 35–65 % in 1v1 pools) | not started | — |
| F-099 | 2 | Race selection in New Game | Selected race's starting units/buildings appear at match start | not started | — |

### G.1 Starter race seeds (each: ability + weakness verified by scripted test)

| ID | Ph | Seed | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-100 | 5 | Tidal folk: breathe/build underwater; sunlight damage outside water → surface expansion only at night | Units survive underwater; surface units take damage by day, not at night/in water; land outposts placeable only at night | not started | — |
| F-101 | 5 | Beastcallers: tame wild animals; evolution: war beasts → revive dead animals → (long research) revive extinct giant reptiles | Tame converts animal ownership; each evolution step unlocks its units in order | not started | — |
| F-102 | 5 | Stone clans: tunnel and strike from below; weak at sea | Tunnel attack works (F-082); naval units/water combat penalty applies | not started | — |
| F-103 | 5 | Sporekin: fungal growth poisons enemy land; slow growth, fragile | Fungus spreads per rule and damages enemy yield/units; slower growth + lower HP verified | not started | — |
| F-104 | 5 | Sky nomads: gliders, fast scouts; poor defense | Glider movement (F-081), scout speed bonus; defensive structure/unit penalty | not started | — |
| F-105 | 5 | Forgeborn: cheaper and stronger metal gear; heavy, slow units | Gear cost/stat modifiers and move-speed penalty verified | not started | — |
| F-106 | 5 | Marsh dwellers: fast and hidden in swamps; weak on open plains | Swamp speed + stealth; plains combat penalty | not started | — |
| F-107 | 5 | Frostkin: strong in cold biomes, ice-fishing food bonus; lose output in heat | Cold bonus, ice fishing, heat penalty verified on F-030 tiles | not started | — |
| F-108 | 8 | Dune raiders: stealing and ambush; poor farming | Steal/ambush bonus; farm yield penalty | not started | — |
| F-109 | 8 | Scholars: very fast research and spies; fragile army | Research speed + spy bonus; unit HP penalty | not started | — |
| F-110 | 8 | Treewardens: forests grant defense and growth; vulnerable to fire | Forest bonus; extra fire damage (F-045) | not started | — |
| F-111 | 8 | Reefbuilders: early water bases; weak land armies | Water-base tech unlocked at start; land unit penalty | not started | — |

(Which 8 seeds form the Phase 5 batch is a proposal: default is F-100–F-107.)

## H. AI bots (spec §6)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-120 | 4 | Bot count selectable 0–32 (bounded by map size) | Each count starts; over-limit for a map size is clamped with a message | not started | — |
| F-121 | 4 | Difficulty Easy / Hard / Impossible, defined in TUNING.md; Impossible's optional resource bonus is a toggle shown in settings | TUNING.md defines each; harness: Hard beats Easy ≥ 80 %, Impossible beats Hard ≥ 70 % (T:); bonus off by default and visible when on | not started | — |
| F-122 | 4 | No fog-of-war cheating | Fuzz test: `BotView` never returns entities/tiles outside the bot's vision or explored memory | not started | — |
| F-123 | 4 | Personalities as data: Berserker, Pacifist builder, Merchant, Schemer, Expansionist, Defender, Raider (≥3 by Phase 4, all 7 by Phase 6) | Harness metrics differ by personality (e.g. Expansionist settles earliest, Defender builds most walls, Berserker attacks first) | not started | — |
| F-124 | 4 | Utility AI with goals: expand, economy, defense, attack, diplomacy | Unit tests: given state fixtures, the expected goal scores highest | not started | — |
| F-125 | 4 | Debug overlay: each bot's current goal (+ scores) | Overlay shows the goal the bot log reports at the same tick | not started | — |
| F-126 | 4 | Bot-only matches run headless and finish (Phase 4 gate) | 50 headless bot-only Small matches all reach a victory state within the time limit | not started | — |
| F-127 | 1–4 | Match length targets: Small 15–25 min, Medium 30–60, Large/Huge long with save/resume | Harness median match length per size reported against targets | not started | — |

## I. Victory & elimination (spec §1.1)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-130 | 3 | Conquest victory: control/destroy every enemy capital | Scripted: capture last enemy capital → victory fires | not started | — |
| F-131 | 2 | Domination victory: hold X % of land (default 70 %, configurable) for Y time | Scripted: hold 70 % for Y → victory; drop below → timer resets | not started | — |
| F-132 | 4 | Alliance / co-op victory (team meets a condition) | Allied team jointly reaches condition → team victory | not started | — |
| F-133 | 5 | Optional tech/evolution victory (enabled in settings) | Off by default; when on, completing condition (PLAN §7-D) wins | not started | — |
| F-134 | 6 | Optional economic victory (enabled in settings) | Off by default; when on, condition (PLAN §7-C) wins | not started | — |
| F-135 | 3 | Elimination when capital and all settlements lost; eliminated humans can spectate | Player loses all → eliminated, switches to spectator view with full map | not started | — |

## J. Economic actions & diplomacy (spec §3, §7)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-140 | 6 | Steal (raids and thieves) | Thief/raid transfers resources per TUNING; detection chance works | not started | — |
| F-141 | 6 | Spy: reveal enemy info, sabotage | Spy reveals target fog area/stats; sabotage disables building for N s | not started | — |
| F-142 | 6 | Poison: wells, crops, units (limited by race and tech) | Each poison target applies its effect; unavailable without race/tech | not started | — |
| F-150 | 6 | Chat panel with players and bots | Messages appear for both sides; bots reply | not started | — |
| F-151 | 6 | Trade offers: resources, gear, tech, land, alliances, ceasefires; send / accept / counter | Each offer type round-trips; accepted trade transfers exactly | not started | — |
| F-152 | 6 | Diplomatic states: war, peace, ceasefire, alliance, trade pact; consequences for breaking | State machine tests; breaking a treaty applies reputation/relationship penalty | not started | — |
| F-153 | 6 | Rule-based bot negotiation with personality-templated dialogue (no external AI): lie, threaten, request help, propose alliance, betray, demand tribute | Each behavior triggered by a state fixture; dialogue tone differs per personality | not started | — |
| F-154 | 7 | Human chat in multiplayer with mute/block | Muted/blocked player's messages hidden for that user only | not started | — |
| F-155 | 2 | Notification feed (attacks, discoveries, diplomacy) | Scripted events each produce a notification | not started | — |

## K. Multiplayer (spec §8)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-160 | 7 | Host a game; friends join via link or room code (WebRTC, star topology to host) | Two browsers on different networks join via code; connection count = number of humans | not started | — |
| F-161 | 7 | Host-ordered deterministic lockstep; host runs all bots (PLAN §4) | 4 humans + 4 bots, 20 min: no desync; bot code runs only on host | not started | — |
| F-162 | 7 | Minimal free signaling + documented TURN/relay fallback (PLAN §5) | Join works via signaling; with direct path blocked, TURN relay connects; manual-code fallback works | not started | — |
| F-163 | 7 | Co-op (team vs bots) and free-for-all modes | Both modes start and resolve victory correctly | not started | — |
| F-164 | 7 | Disconnect and reconnect | Client drops for 30 s → rejoins, catches up via snapshot + commands, hash matches | not started | — |
| F-165 | 7 | Host left: clear outcome (PLAN §7-H) | Host closes tab → clients see "host left", can download save; save can be re-hosted | not started | — |
| F-166 | 7 | MP pause and speed: host-controlled or voted | Both modes behave per setting | not started | — |
| F-167 | 7 | Desync detection: periodic state-hash comparison, mismatch reported | Injected divergence on one client is detected and reported within N ticks | not started | — |
| F-168 | 7 | Human cap 4–8 over P2P; rest are bots | Join beyond cap refused with message | not started | — |

## L. UI, controls, settings (spec §8.5, §9)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-170 | 1–2 | Main menu: New Game (race, map size, seed, bot count & difficulty, victory conditions, speed), Join Game (room code), Settings, Tutorial | Each option changes the started match accordingly | in progress | Phase 1 part works: New Game with map size, seed (+ Random) and speed. Join/Settings/Tutorial shown disabled; race, bots and victory options come in later phases |
| F-171 | 2 | In-game HUD: resource bar with income rates, population and food, speed controls, minimap, notifications, selection panel, build menu | All panels visible; values match sim | not started | — |
| F-172 | 2–3 | Mouse: select, box-select, right-click orders, drag camera, wheel zoom | Automated input tests per action | not started | — |
| F-173 | 2–3 | Keyboard: build-menu hotkeys, speed hotkeys, control groups | Hotkeys trigger actions; Ctrl+N assigns and N recalls group | not started | — |
| F-174 | 3 | Rebindable keys | Rebind a key, reload → new binding works, old one doesn't | not started | — |
| F-175 | 2 | Colorblind-friendly team colors (PLAN §7-B: 8 safe hues × patterns + labels) | Palette passes a CVD simulation check (deuteranopia/protanopia/tritanopia) for min contrast; >8 players distinguishable by pattern/label | not started | — |
| F-176 | 2 | Scalable UI text | UI scale 75–200 % setting; layout doesn't overflow at 200 % on 1366×768 | not started | — |
| F-177 | 9 | Touch controls (stretch goal, not a blocker) | Pan/zoom/select on a touch device or emulation | not started | — |
| F-178 | 1–9 | Settings: map size, bot count, difficulty, race, seed, game speed, graphics quality, sound | Each setting persists and takes effect | in progress | Map size, seed and game speed work. Others in later phases |
| F-179 | 2 | Graphics quality presets (incl. reduced effects for Huge) | Low preset measurably lowers frame time vs High | not started | — |
| F-180 | 2 | Sound: original/procedural SFX, volume and mute | Events play sounds; volume 0 = silent | not started | — |
| F-181 | 9 | Basic tutorial (short, optional) | New player completes tutorial steps; skippable | not started | — |
| F-182 | 1 | Perf/debug HUD (FPS, p95 frame time, sim ms/tick) — needed to report measured numbers (§4) | HUD values agree with browser performance trace within 10 % | done-verified | 2026-11-06 perf HUD (F3) shows FPS, p95, sim ms/tick, ticks/s, draws, triangles, entities. In the visible pane it read 144 FPS / p95 7.3 ms, matching the Playwright sweep (144.0 / 7.3) within 10 % |

## M. Scale (spec §1, §4, §10 Phase 8)

| ID | Ph | Feature | Acceptance test | Status | Evidence |
|---|---|---|---|---|---|
| F-190 | 8 | Huge map with up to 32 players/bots | 1 human + 31 bots on Huge runs 30 min with F-080's Huge thresholds; memory measured | not started | — |
| F-191 | 8 | Per-size unit caps and reduced effects | Caps from TUNING enforced; effects reduced on Huge preset | not started | — |

---

## PROPOSALS (not approved — nothing here gets built without your OK)

| ID | Proposal | Why |
|---|---|---|
| P-001 | **Baseline** reference race (dev/test only; not counted toward 100) | Phase 2–4 need "one race" before the race system exists; also a control group for the balance harness |
| P-002 | Phase 5 batch = seeds 1–8 (F-100–F-107) | They cover the most mechanics (water, taming, tunnels, fungus, air, gear, swamp, cold), so the systems get stress-tested early |
| P-003 | Seamless host migration (beyond the "host left" outcome) | Possible since all peers hold full state, but adds complexity; worth it only after F-165 works |
| P-004 | GitHub Actions CI: tests + determinism checks + Pages deploy on push | Catches desync regressions automatically; not requested |
| P-005 | Zero-setup signaling via Trystero as an alternative to the Cloudflare worker | No account needed, but third-party relays are less reliable |
| P-006 | Interpretations in PLAN.md §7 (A–K) | Each needs an explicit yes/no |

---

## Traceability (spec section → features)

| Spec | Features |
|---|---|
| §0 anti-drift contract | F-001, F-002, F-004 (process rules followed throughout) |
| §1 core concept, seed, races, scale, speed, pause, 2.5D camera, touch | F-010, F-013, F-014, F-015, F-020, F-022, F-024, F-025, F-099, F-177, F-190 |
| §1.1 victory / elimination / match length | F-130–F-135, F-127, F-016 |
| §2 map, biomes, sizes, fog, terrain mods, water building, stats panel | F-020–F-031, F-040–F-045, F-059 |
| §3 resources, population, gear, tech gating, economic actions | F-050–F-058, F-094, F-140–F-142, F-076, F-056 |
| §4 units, orders, combat factors, performance | F-070–F-082 |
| §5 / §5.1 / §5.2 races, template, validation, harness | F-090–F-111 |
| §6 bots | F-120–F-126 |
| §7 diplomacy, trade, chat | F-150–F-155 |
| §8 multiplayer, signaling, determinism, offline, static, disconnects, desync | F-160–F-168, F-010, F-017, F-005, F-006 |
| §8.5 UI and controls, accessibility | F-170–F-182, F-095, F-059 |
| §9 tech & delivery (TS, static, small repo, assets, worker, data-oriented, flow fields, settings, save, tutorial, small first build) | F-003–F-007, F-011, F-012, F-078, F-178, F-016, F-181 |
| §10 phase gates | F-028 (P1), F-059 (P2), F-079 (P3), F-126 + F-121 (P4), F-096 (P5) |
| §11 risks | PLAN.md §6 |
| §12 final rule | PLAN.md §7 |
