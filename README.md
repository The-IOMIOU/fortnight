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
| 5 Tech, equipment, first 6–8 races | done (committed "Phase 5: …"), waiting for owner review; race builder UI and some render work left (see below) |
| 6 Diplomacy, trade, chat, covert actions | done (committed "Phase 6: …") |
| 7–9 | in progress, see below |

Last updated: 2026-11-06.

### Owner and rules
- Repo: `E:\fortnight` (first machine), `C:\Users\sergi\OneDrive\Desktop\Programme\MeineProjekte\fortnight` (second machine), GitHub `The-IOMIOU/fortnight`, branch `main`. **Commit directly to `main` and push after every phase.** End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or whatever attribution your session gives).
- Anti-drift contract (spec §0): every feature is a ledger row with an acceptance test; a row is `done-verified` only after the test was **run** and the observation written into Evidence; report unmet thresholds honestly; unlisted work goes to PROPOSALS; constants live in `src/data/tuning.json` and are explained in `TUNING.md` (`node tools/check-tuning.mjs` enforces it); stop at phase gates. The owner's current instruction: **"Phase 4 is good, do phase 4b and 5"** (build both, commit each, then report).
- Owner preferences: plain-language reports; honest status; the owner sometimes asks for things mid-phase. Record them as PLAN amendments and ledger rows.
- **Owner rule (2026-11-06): always write what you did and what is left in this README section and push it, so another Claude can continue.**

### State
- Commits: `8750cb1 Phase 4: bots …` (approved), `7ba7d3d Phase 4b (WIP)`, `074b66c Phase 4b: …`, `6698256 Phase 5 (WIP)`, then the "Phase 5: …" commit.
- **Next step for whoever continues:** wait for the owner's review of 4b and 5 (open questions: globe interpretation, Short-mode length, PLAN amendment 11). Then Phase 6 (diplomacy and chat), or the Phase 5 leftovers below.

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

### Phase 5 (built 2026-11-06; waiting for owner review; PLAN amendment 11 lists the decisions)
**What exists (all tested):**
- **Peoples** (F-090–F-092, F-112): `src/data/races/*.json`, validated by `src/sim/races.ts` (`validateRace`, `loadRaces`, `racePoints`, `registerRace`; a broken file stops startup with "race <id>: <field>: <message>"). Baseline (reference) + 8: **Deepkin** amphibious / sunburn, **Wildbond** tameAnimals / frailBuildings, **Delvers** tunneling / poorSailors, **Mycelids** fungalSpread / slowGrowth, **Windriders** gliders / poorDefense, **Anvilborn** masterSmiths / heavyFooted, **Fenfolk** swampStalkers / openGroundWeak, **Rimeborn** frostAdapted / heatWeak. Every people totals 0 points.
- **Ability modules** (`src/sim/abilities.ts`, class `RaceRules`, numbers in `tuning.races.abilities`): hooks for unit stats, building HP, work rates, damage, path cost, stealth, per-tick sunburn / fungus / research. Path modes in `Sim.modeOf`: 2 = tunnel (under walls, not water), 3 = glide (over everything, ≤ `glideTiles` per hop, then rest).
- **Research** (F-093–F-095, F-133): shared tree `tuning.tech.nodes` + each people's 3-node tree; commands `research` / `cancelResearch`; research panel (`src/ui/RacePanels.tsx`, top-bar "Research"); optional tech victory `victory.tech`.
- **Gear** (F-058): forge crafts into `ps.gear`; `equip` near a forge/barracks/town sets weapon/armour tier; tools on workers.
- **Piers** (F-044), 17 race units, 10 buildings (models, names, help), menu people choice with gift/weakness/points summary and rival peoples (random or one), HUD forge/equip/burrow buttons.
- **Bots** (`src/ai/race.ts`): research in order and save up for it, build their own building and a forge, train own troops, craft and equip, Wildbond scouts tame, Delvers burrow when away from home, Deepkin only settle at night. `BotView` exposes own race/research/gear.
- Save format v5. Phase 5 state is hashed only once `sim.p5` is set, so Baseline matches keep their hashes (F-010 hashes checked unchanged).
- Tests: `tests/races.test.ts` (18: validation, points, research, gear, piers, tech victory, one test per people for ability and weakness, determinism + save/load), `tests/races-bots.test.ts` (8 bot matches, ~2 min total), `tests/e2e/races.spec.ts` (menu → research panel → forge in build menu). Unit suite 110/110; Chromium suite 27/27.

**Not done / not verified:**
- F-112 race-builder UI (running total, block saving at ≠ 0). F-096 human playtest notes and the harness comparison of race profiles (Phase 8 harness). Delvers bots never got to burrow in the 16-min test (no attack happened).
- Render: fungus is not drawn on the terrain yet, burrowed units are drawn like normal units for their owner (enemies don't see them), gliders fly at ground height.
- Firefox and headed (FPS) tests can't run on the second machine (see Phase 4b result).
- Balance is untested beyond the scripted checks: numbers are first guesses documented in TUNING.md.

### Phase 6 (built 2026-11-06; PLAN amendment 12 lists the decisions)
- **Sim:** `src/sim/diplomacy.ts` (`Diplomacy` on `sim.dip`: relation matrix, ceasefire timers, reputation, relationship "feel", offers, chat, spy reveals, well poison, economic-victory counter; covert acts `doCovert`). `Sim.allied` now includes treaty alliances; new `Sim.hostile` (at war) decides auto-combat and fungus poison. Commands `offer, respond, declareWar, chat, covert`; `Task.COVERT`; entity fields `disabledUntil, poisonUntil`; research "toxins"; `victory.economic`. Diplomacy state is saved (v5 save, optional fields) and hashed once `sim.p5` is set.
- **Bots:** `src/ai/diplomacy.ts` (`diplomacyPlan`, `judge`, `covertPlan`), dialogue `src/data/dialogue.json`. `BotView` puts non-hostile players into `neutralUnits/neutralBuildings` (never targeted) and exposes relations, reputation, own feelings, offers and chat for the bot.
- **UI:** `src/ui/DiploPanel.tsx` (top-bar "Diplomacy": relations, reputation, treaty buttons, give/ask, incoming offers, chat with recipient choice, mute), covert-act buttons for selected spies/saboteurs (pick, then right-click the target), menu victory options Technology and Economy. Scouts-only right-click on an animal now sends them (Wildbond taming).
- **Tests:** `tests/diplomacy.test.ts` (11), `tests/e2e/diplomacy.spec.ts`. Unit suite 121/121. Short-mode bot suite with diplomacy: 7/10 finished, median 38.2 min (before 6/10, 37.1): bots still end matches.
- **Not done:** human-to-human chat and offers between browsers (needs Phase 7 networking; the command path is the same). Block (as opposed to mute) only matters with humans, so also Phase 7.

### Key facts and gotchas
- Stack: TypeScript 7 strict, Vite 8 (worker inlined), Three.js 0.186, Preact, Vitest 5, Playwright 1.64. The sim is integer-only and deterministic (`tools/check-sim-purity.mjs` bans Math.random/Date/trig/`**` in `src/sim`). Sim runs in a Web Worker. 10 Hz tick.
- Test commands: `npx vitest run` (unit, `tests/*.test.ts`), `npm run test:bots` (long headless bot suites, about 15 min, results in `test-results/bots/`), `npx playwright test --project=chromium|firefox|perf|perf-uncapped` (needs `npm run build`; preview server on 4173).
- Save format v4 (`src/sim/serialize.ts`); `extra.bots` holds bot memory.
- Phase 4 open items (owner accepted the gate): F-126 43/50 finish, F-127 Small median 34.6 min, F-121 Impossible beats Hard only 4/10 (proposals P-007, P-008).
- Don't start a second long background test run while one is still running: they wrote into the same log/result files once (Phase 4).
