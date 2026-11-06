# fortnight
defend your fort at night

A browser real-time 2.5D strategy game on a world of continents (TypeScript, Three.js, deterministic simulation in a Web Worker). Build: `npm install`, `npm run dev`; tests: `npx vitest run`.

## Progress and handoff (keep this section up to date)

**Any Claude continuing this project: read this section first**, then `CONTINENT_STRATEGY_GAME.md` (master spec), `PLAN.md` (owner amendments at the top) and `FEATURES.md` (feature ledger). When you stop or finish a step, rewrite this section: what you did, what is left, and anything unverified. Then commit and push.

### Phase status
| Phase | Status |
|---|---|
| 0 Plan, stack, ledger | done, approved |
| 1 Map, 2.5D view, fog, minimap | done, approved |
| 2 Economy, save/load | done, approved |
| 3 Combat, naval, conquest | done, approved |
| 4 Bots (utility AI, personalities, difficulty) | done, approved (3 targets unmet, see below) |
| 4b Modes, Earth-like continents, globe, settings, test options | done (committed "Phase 4b: …"), waiting for owner review; Short-mode length target unmet, Firefox and FPS not re-measured (see below) |
| 5 Tech, equipment, first 6–8 races | **in progress**: sim, data and tests pushed as WIP; UI, bots, render left (see "Phase 5" below) |
| 6–9 | not started |

Last updated: 2026-11-06.

### Owner and rules
- Repo: `E:\fortnight` (first machine), `C:\Users\sergi\OneDrive\Desktop\Programme\MeineProjekte\fortnight` (second machine), GitHub `The-IOMIOU/fortnight`, branch `main`. **Commit directly to `main` and push after every phase.** End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or whatever attribution your session gives).
- Anti-drift contract (spec §0): every feature is a ledger row with an acceptance test; a row is `done-verified` only after the test was **run** and the observation written into Evidence; report unmet thresholds honestly; unlisted work goes to PROPOSALS; constants live in `src/data/tuning.json` and are explained in `TUNING.md` (`node tools/check-tuning.mjs` enforces it); stop at phase gates. The owner's current instruction: **"Phase 4 is good, do phase 4b and 5"** (build both, commit each, then report).
- Owner preferences: plain-language reports; honest status; the owner sometimes asks for things mid-phase. Record them as PLAN amendments and ledger rows.
- **Owner rule (2026-11-06): always write what you did and what is left in this README section and push it, so another Claude can continue.**

### State
- Commits: `8750cb1 Phase 4: bots …` (approved), `7ba7d3d Phase 4b (WIP)`, then the final "Phase 4b: …" commit (verification, docs, fixes).

### Phase 4b scope (owner request, PLAN amendment 10, ledger F-193–F-199)
- **F-193 Game modes** Short / Long / Continental / Custom: data in `tuning.json` → `modes`; helper `src/app/modes.ts`; menu mode cards (`data-testid="mode-<id>"`).
- **F-194 Earth-like continents**: `src/sim/world/mapgen.ts` `MapOpts { globe, continents, sea: 'close'|'mixed'|'far' }`. With `sea` set: "partner" continents are placed next to each other (narrow strait), others spread apart; size-weighted borders; per-pair strait widths `map.seaWidths`. Without `sea` the original maps are generated bit-for-bit (old hashes unchanged). Measurement: `src/sim/world/geo.ts continentGaps()`.
- **F-195 Globe world** (wrap east–west): owner did not answer "wrap vs real 3D planet". I implemented a wrap-around world drawn curved, as proposed in PLAN. Design: the seam always lies in open ocean (`map.globeSeamOcean` = 14 tiles of ocean each side), so only ships cross it.
  - Sim: `src/sim/core/topo.ts` (wrapX, wdelta, tileAt, inSpanX, spanDistX) used by A* (`astar.ts`), flow fields, fog (`stampCircle`), movement (`Sim.moveUnits`, posX wraps), arrival/goal rects, `visibleTo`, military `dist2` and the spatial grid, bot `dist()`.
  - Render: `RtsCamera(…, wrap)` wraps targetX; `Game.frame` draws the world again with the camera shifted ±map width when the view crosses the seam; `pickTile` wraps and undoes the curve; `screenOf` uses the nearest copy; minimap draws the view box wrapped; terrain has no edge walls at the seam.
  - Curved look: `src/render/curve.ts` (shader patch, uniform `CURVE`, strength `map.globeCurveStrength` = 0.06). Display setting `globeCurve` (Settings modal, `data-testid="globe-curve"`).
- **F-196 Match settings** (`SimSettings`): `world`, `wildlifePct`, `dayLengthTicks`, `popLimit`, `testOptions`; menu "More settings" (`world`, `continents`, `sea`, `wildlife`, `daylen`, `poplimit`, allies, victory, per-bot difficulty/personality rows). Menu choices persist in localStorage `fortnight.menu.v1`.
- **F-197 Test options ("cheats")**: `TestOpt` bits in `src/sim/sim.ts` (REVEAL 1, NO_HOUSING 2, INSTANT_BUILD 4, INSTANT_TRAIN 8, INVULNERABLE 16, PEACEFUL_BOTS 32, FAST_SPEEDS 64). Command `{ type: 'testOption', flag, on }`; per-player `ps[p].opts`. **None adds resources** (unit test audits stock). Speeds `x8`/`x16` exist in tuning but the worker clamps them unless FAST_SPEEDS is on. Reveal is handled in the worker (`eye()`).
- **F-198 Confirmation + modified flag**: `src/ui/testOptions.tsx` (`TestOptionList`, confirm dialog `opt-confirm`). `sim.modified` is set for good, saved (`SaveData.modified`), hashed only when true (so old hashes are unchanged). HUD badge `modified-badge`, game-over note `gameover-modified`.
- **F-199 Multiplayer vote**: Phase 7, not started.

### Phase 4b result (2026-11-06, second machine)
- Unit tests 84/84, `npm run check` OK (TUNING.md now documents the 4b constants: seas, globe seam, curve, modes, x8/x16 speeds).
- Chromium suite: 25/26 passed in the full run; the one failure was fixed and passes on re-run. Two fixes: (1) `tests/e2e/ui.spec.ts` F-022/F-015 picked Medium in Short mode (Short only offers Small): it now clicks `mode-custom` first. (2) The same test showed a real issue: a link with only seed + size gave a different map than the menu, because the world shape (globe, seas, continents) is part of the map. `shareLink()` now carries `world`, `sea`, `continents`, and the test builds the link from the menu's values (menu map 646cea9c = link map 646cea9c).
- **Not verified on this machine:** Firefox (Playwright gets `spawn UNKNOWN` launching Firefox, also outside the sandbox) and every headed test (perf/FPS, same error with headed Chromium). Only headless Chromium works here. A globe FPS test was added to `tests/e2e/perf.spec.ts` (`F-195 globe world …`) but has never run. Run `npx playwright test --project=firefox --project=perf` on the first machine.
- **Short mode misses its length target:** `tests/bots/f193-short.test.ts` (new, part of `npm run test:bots`; `MatchSpec` now takes `world`): 10 matches with 2–3 Hard bots on the Short world → 6/10 finished, median 37.1 min (target 15–25). Closer seas did not shorten matches; P-008's stalemate breaker / bot behaviour is the likelier fix. Owner decision needed.
- Ledger: F-194, F-196, F-197, F-198 done-verified; F-193 and F-195 in progress (reasons in Evidence). PLAN amendment 10 records the globe interpretation and the F-194 threshold change; the owner hasn't confirmed either.

### Phase 5 (in progress; spec "tech, equipment crafting chain, first 6–8 races")
**Done and tested (Node, `tests/races.test.ts`, 16 tests; whole unit suite 100/100):**
- **Race data and validation** (F-090, F-091, F-112): `src/sim/races.ts` (`validateRace`, `loadRaces`, `racePoints`, `registerRace`; startup throws with "race <id>: <field>: <message>"). Races in `src/data/races/*.json`: Baseline (reference, P-001) + 8 playable: **Deepkin** (amphibious / sunburn), **Wildbond** (tameAnimals / frailBuildings), **Delvers** (tunneling / poorSailors), **Mycelids** (fungalSpread / slowGrowth), **Windriders** (gliders / poorDefense), **Anvilborn** (masterSmiths / heavyFooted), **Fenfolk** (swampStalkers / openGroundWeak), **Rimeborn** (frostAdapted / heatWeak). Point rule: 1 point per 5 % stat step + module `points` (tuning `races.abilities.*.points`); every race totals 0.
- **Ability modules** (F-092): `src/sim/abilities.ts` `RaceRules` (per-player race, ability bits, stats incl. research bonuses; hooks for unit stats, building HP, work rates, damage, path cost, stealth, per-tick sunburn/fungus/research). A JSON-only race combining existing modules works with no code change (test `F-092`).
- **Research** (F-093, F-094): shared tree `tuning.tech.nodes` (smithing → forge + iron gear, toolmaking, alloys, firearms, piers) and each race's `evolution_tree` (3 nodes: unique building + tier-1 unit, a stat bonus, capstone unit). Commands `research` / `cancelResearch`; done at the capital, one at a time, paid up front.
- **Gear** (F-058): forge crafts into `ps.gear` (alloy = 2 carbon + 1 adamite → alloy weapons/armour → firearms); command `equip` near a forge/barracks/town sets `weaponTier`/`armorTier` (tools on workers = +20 % gathering).
- **New sim pieces**: unit types `beast…mammoth` (17), buildings `forge, pier, tidepool, beastPen, tunnelHall, sporeTower, aerie, greatForge, stiltHall, iceLodge`; entity fields `burrowed, ambushUntil, restUntil`; `Task.TAME`; path modes (`Sim.modeOf`: 2 tunnel under walls/not water, 3 glide over everything, max `glideTiles` per hop then rest); fungus layer `sim.fungus`; commands `craft, equip, burrow, tame`; settings `races[]`, `victory.tech` (F-133). Save format v5. Phase 5 state is hashed only when `sim.p5` is set, so Baseline matches keep their old hashes (checked: F-010 hashes unchanged).
- **Bug fixed on the way:** units with a gold cost (rider, spy, saboteur, warship) never had their gold charged although the HUD showed and required it. `train` now charges `d.gold` (and `cancelTrain` refunds it). This changes Baseline bot matches slightly.
- Models for all new units/buildings in `src/render/models.ts`; names/help in `src/ui/names.ts`; TUNING.md documents every new constant.

**Left to do (in this order):**
1. Menu: race choice for the player (and per bot: random or by `bot_hints`) → `settings.races`; HUD: research panel at the capital (`research` command), craft buttons at the forge, equip button for selected units, burrow toggle (Delvers), race info and point breakdown. F-095 tech screen. F-112 builder UI (running total, block saving at ≠ 0) is still open.
2. Bots (`src/ai`, fog-safe): research in order (smithing + own tree), train unique units when unlocked, craft/equip gear, Wildbond scouts tame nearby animals, Delvers burrow before attacking, Deepkin settle at night. `BotView` must expose own research/gear state.
3. Render: fungus tint on terrain, burrowed units hidden/dimmed for the owner, glider flight height.
4. Browser tests for the new UI; harness: bot matches with random races (distinct profiles, F-096).
5. Ledger rows F-058, F-081, F-082, F-090–F-096, F-100–F-107, F-112, F-133, F-044 with the evidence printed by `tests/races.test.ts` (run with `--silent=false`).

### Key facts and gotchas
- Stack: TypeScript 7 strict, Vite 8 (worker inlined), Three.js 0.186, Preact, Vitest 5, Playwright 1.64. The sim is integer-only and deterministic (`tools/check-sim-purity.mjs` bans Math.random/Date/trig/`**` in `src/sim`). Sim runs in a Web Worker. 10 Hz tick.
- Test commands: `npx vitest run` (unit, `tests/*.test.ts`), `npm run test:bots` (long headless bot suites, about 15 min, results in `test-results/bots/`), `npx playwright test --project=chromium|firefox|perf|perf-uncapped` (needs `npm run build`; preview server on 4173).
- Save format v4 (`src/sim/serialize.ts`); `extra.bots` holds bot memory.
- Phase 4 open items (owner accepted the gate): F-126 43/50 finish, F-127 Small median 34.6 min, F-121 Impossible beats Hard only 4/10 (proposals P-007, P-008).
- Don't start a second long background test run while one is still running: they wrote into the same log/result files once (Phase 4).
