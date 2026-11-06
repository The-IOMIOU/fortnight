# Phase 0 Plan — Real-Time Continent Strategy Game

Status: **approved 2026-11-05** ("okay do phase 1") with these owner amendments:

1. **Multiplayer is peer-to-peer.** WebRTC between browsers, no game server. The host-ordered lockstep in §4 stays P2P: the host is just one of the peers.
2. **Fewer races for the web version.** The web build ships a small hand-made set. The 100-race target becomes "unbounded" for a later app version, including **player-made races**.
3. **Race builder rule (new, F-112):** every power-up has a point score and every power-down a negative score. A race is valid only when its total is exactly 0.
4. **Compute:** the owner's Kaggle account may be used for heavy headless runs (balance harness) if local cores aren't enough. It's only used with the owner's go-ahead at that time; not needed before Phase 8.

5. **Several continents, not one (2026-11-06).** Each map has several massive continents separated by ocean (Small 3, Medium 4, Large 5, Huge 7; tunable). Players are spread across them. Crossing to another continent needs transport ships (derived feature F-083, Phase 3).

6. **Phase 2 with full autonomy (2026-11-06).** Decisions taken without asking, all recorded in the ledger: the Baseline race (P-001); single-unit A* pathfinding now (flow fields stay Phase 3, F-078); a move order onto water goes to the nearest walkable tile; the simulation worker is inlined into the page bundle so offline play needs no extra file.
7. **Higher-quality models (2026-11-06, owner request, F-184):** detailed but stylized models generated in code. Photo-realistic models would need external texture/model assets, which conflicts with the small-repo and original-art rules (§9) and the performance budget; that remains an option for later (CC0 packs or generated models, recorded in ASSETS.md).

Items in §7 that weren't commented on are taken as accepted. Proposals P-001…P-005 stay open until answered.

Companion files: [FEATURES.md](FEATURES.md) (feature ledger), [CONTINENT_STRATEGY_GAME.md](CONTINENT_STRATEGY_GAME.md) (master spec).

---

## 1. Stack (and why)

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | Required by spec; strict types matter for a large data-driven sim. |
| Bundler / dev server | **Vite** | Static `dist/` output for GitHub Pages, fast HMR, first-class module Web Workers (`new Worker(new URL(...), { type: 'module' })`). |
| 3D / 2.5D rendering | **Three.js** (WebGL2) | Angled camera over a real heightmap gives "2.5D with height" for free, and trenches, walls and moats are just height and tile edits. `InstancedMesh` draws thousands of units in a few draw calls. All art is low-poly geometry generated in code, so there are no binary assets in git and nothing borrowed from other games. A sprite engine (PixiJS) would need hand-drawn isometric art for every height and tile combination plus manual depth sorting. |
| UI (menus, HUD, panels) | **Preact** + plain CSS | About 4 KB. The HUD has many panels (stats, tech tree, chat, diplomacy), so components help, but React's size isn't needed. UI is DOM over the canvas, so text scales and stays accessible. |
| Simulation | **Hand-written, data-oriented TS** (struct-of-arrays typed arrays), no ECS library | Full control over determinism and memory layout. The same code runs in the browser worker and in Node (balance harness, tests). |
| Data and validation | **JSON data files + Zod schemas** | Races, units, buildings, tech, personalities and dialogue are all data. Zod error paths give "race `<id>`: field `<path>`" messages, as §5.1 requires. |
| Tests | **Vitest** (unit, determinism, scripted battles), **Playwright** (browser acceptance, screenshots, FPS capture) | One runner for sim logic in Node. Playwright drives the real built page. |
| Headless runner | Node 24 + `tsx` (verify in Phase 1), `worker_threads` for parallel matches | The balance harness runs many bot matches in parallel on all cores. |
| Networking (Phase 7) | Browser **WebRTC DataChannels**, star topology to host. Signaling: see §5 | Approved decision in §8 of the spec. |
| Persistence | IndexedDB (autosave) + file download/upload (`.save`), gzip via `CompressionStream` | Works offline. Saves can be shared. |
| Audio | WebAudio, procedurally synthesized SFX (no audio files to start) | Original by construction, zero bytes in git. |

**Version pinning:** exact versions are pinned when Phase 1 scaffolds the project. I'll pick releases that are at least 14 days old rather than "latest". As of today npm shows three 0.187, vite 8.3, typescript 7.0, preact 11.1, zod 4.6, vitest 5.1. TypeScript 7 (the native compiler) is very new. If it causes tooling problems, I'll fall back to the last 6.x release and say so.

**Dev machine (where all measurements will come from):** Intel i5-10400F (6C/12T), NVIDIA RTX 3060, 24 GB RAM, Windows 11. This is **stronger than a "mid-range laptop"**, especially the GPU (see §7, item E).

---

## 2. Simulation architecture

```
 ┌──────────────── Main thread ─────────────────┐        ┌────────────── Sim Web Worker ───────────────┐
 │ Input → Command builder ──── commands ───────┼──────► │ Command queue (stamped with execute tick)   │
 │ Three.js renderer (interpolates snapshots)   │        │ Bot AIs (read fog-filtered views, emit cmds)│
 │ Preact HUD / menus                           │ ◄──────┼─ Deterministic tick (10 Hz sim time)        │
 │ Net layer (Phase 7, WebRTC) ◄──── cmds ────► │ snaps  │ Snapshot builder (fog-filtered, transfer)   │
 └──────────────────────────────────────────────┘        └─────────────────────────────────────────────┘
                     Node (no DOM): same sim + bots → tests, replays, balance harness
```

**Tick pipeline (fixed order, every tick):**
apply commands → abilities/status (sun damage, poison, fungus spread) → economy (gather, production, crafting, research) → construction and terrain edits (dig, fill, water flow) → pathing (flow-field requests) → movement and separation → combat (target acquisition via spatial hash) → morale → deaths/cleanup → territory → fog/vision → victory check → state hash (every N ticks).

**Determinism rules (enforced, not just intended):**
- Authoritative state is **integers only**: positions are fixed-point (1/1024 tile), and stats and timers are ints. No `Math.sin/cos/exp/pow` in `src/sim`. Trig uses integer lookup tables, square roots use an integer `isqrt`. (I'm unsure whether every engine rounds `Math.sqrt` identically, so I won't rely on it.)
- One seeded PRNG (xoshiro128**/sfc32 written by hand with `Math.imul`), split into named streams (mapgen, combat, AI) so adding a feature doesn't shift another stream's numbers.
- No `Math.random`, `Date`, `performance.now`, or object/`Map` iteration whose order depends on insertion timing in `src/sim`. Entities are iterated by index. A check script bans these APIs inside `src/sim` (part of F-010).
- Time advances only by tick. Game speed changes **how many ticks run per real second** (0.5×/1×/2×/4×), never the tick length, so the results are the same at every speed.
- State hash = FNV/xxhash-style integer hash over all typed arrays. It's used by tests, replays and multiplayer desync detection.

**Data layout:** each component is a typed array indexed by entity slot (e.g. `posX: Int32Array`, `hp: Int32Array`, `owner: Uint8Array`), with generation counters for safe handles. Tiles are flat typed arrays (height, biome, feature, owner, fog-per-player bitsets, water level).

**Pathfinding:** a region/sector graph (connected areas per movement class: land, water, air, tunnel) answers "is this reachable?" instantly. **Flow fields** per (goal, movement class) serve group orders and are cached with LRU eviction and a memory cap. Single units on short paths use A*. A terrain edit (wall, trench, moat) invalidates only the affected sectors and the flow fields that pass through them.

**Worker ↔ render:** the worker posts a snapshot each tick: entity transforms, type, owner, HP and animation state for entities the local player can see, plus tile deltas (terrain, fog, ownership). These go as **transferable ArrayBuffers**. `SharedArrayBuffer` is avoided on purpose, because it needs COOP/COEP headers and GitHub Pages can't set them. The renderer interpolates between the last two snapshots so motion stays smooth at 60 FPS while the sim runs at 10 Hz.

**Bots:** bots sit **outside the deterministic core**. They read a fog-filtered `BotView` (they physically can't see raw state) and emit ordinary commands, just like a human. Every command, including bot commands, goes into the command log. So replays and multiplayer clients never need to run bot code, and bot code can be optimized freely without breaking determinism. Utility AI: goals (expand, economy, defense, attack, diplomacy) are scored by personality weights, and the top goal and its scores are exposed to a debug overlay.

**Rendering:** the terrain is chunked into 32×32-tile meshes with terraced heights and biome vertex colors. Water is its own surface. Fog, ownership and day/night come from small data textures sampled in the terrain shader. Units and buildings are `InstancedMesh` per type. The minimap is drawn to a 2D canvas from the same tile data. The graphics quality setting drops shadows, decorations and animation detail.

**Save / replay:** save = format version + seed + settings + full state snapshot (typed arrays) + command log tail, gzip-compressed. Replay = seed + settings + full command log.

---

## 3. Folder structure

```
/
├─ CONTINENT_STRATEGY_GAME.md  PLAN.md  FEATURES.md  TUNING.md  ASSETS.md  README.md  LICENSE
├─ package.json  tsconfig.json  vite.config.ts  index.html  .gitignore
├─ src/
│  ├─ sim/                # deterministic core — NO DOM, NO floats in state
│  │  ├─ core/            # fixed-point math, PRNG, tick loop, hashing, serialization
│  │  ├─ world/           # mapgen, biomes, terrain edits, water, fog, territory, day/night
│  │  ├─ entities/        # SoA component stores, entity allocator
│  │  ├─ systems/         # economy, construction, movement, combat, morale, research…
│  │  ├─ path/            # region graph, flow fields, A*
│  │  ├─ abilities/       # reusable ability modules (sunDamage, tunneling, tameAnimals…)
│  │  ├─ commands/        # command types + validation
│  │  └─ rules/           # victory, elimination, diplomacy states
│  ├─ data/               # JSON content: races/, units/, buildings/, tech/, personalities/, dialogue/
│  │  └─ schema/          # Zod schemas + validator (startup + harness)
│  ├─ ai/                 # utility-AI bots: BotView, goals, personalities, negotiation
│  ├─ worker/             # sim worker entry + message protocol
│  ├─ render/             # Three.js scene, terrain, units, fog, picking, camera
│  ├─ ui/                 # Preact menus, HUD, panels
│  ├─ input/              # mouse/keyboard/touch, rebindable keymap
│  ├─ net/                # (Phase 7) WebRTC transport, signaling client, lockstep, desync
│  └─ app/                # bootstrap, settings, save/load
├─ tools/                 # check scripts (determinism ban-list, repo size, ledger), balance harness
├─ tests/                 # vitest (unit/determinism/scripted battles), e2e/ (Playwright)
└─ signaling/             # (Phase 7) tiny signaling worker — deployed separately
```

---

## 4. Multiplayer model: my interpretation, which needs your confirmation

§8 says "host-authoritative; humans send commands and render", **and** it also asks for "desync detection by comparing state hashes". Comparing hashes only makes sense if clients run the sim too. So I propose **host-ordered deterministic lockstep**:

- The host decides the order of all commands and the tick each one executes on, runs **all bots**, and broadcasts each tick's command batch (human + bot commands).
- Every peer runs the same deterministic sim from that stream and renders locally. Peers send state hashes every N ticks, and the host reports mismatches.
- It's a star topology: humans connect only to the host (connections = number of humans).
- **Why not stream state from the host?** With thousands of units, full state streaming costs far more bandwidth and host upload than a command stream (roughly 100 KB/s+ vs. about 1–4 KB/s), and replays and the harness need the deterministic command model anyway.
- **Known cost:** every peer holds the full state, so a modified client could cheat past fog of war. That's acceptable for games among friends. I'll document it rather than hide it.

---

## 5. Signaling and relay report (cost, limits, failure modes)

Once peers are connected, signaling is idle; it's needed only for joining and reconnecting. Gameplay traffic is a small command stream. My estimate: host→client about 1–4 KB/s with many bots, client→host under 0.5 KB/s. So a 1-hour match with 7 relayed clients uses only about 100 MB of relay traffic.

| Option | Cost | Limits | Failure modes |
|---|---|---|---|
| **A. Own tiny signaling service on Cloudflare Workers** (WebSocket room per code; also mints short-lived TURN credentials). **Recommended.** | Free tier. Workers free plan is about 100k requests/day. Durable Objects for rooms: I believe they're on the free plan now, but I'm **unsure** and will verify before Phase 7. | Needs a Cloudflare account and a one-time `wrangler deploy` by you. | Cloudflare outage or quota hit → **new joins and reconnects fail**, while running matches continue. |
| B. Trystero (signals over public Nostr relays / MQTT brokers / BitTorrent trackers) | Free, no account | Third-party relays with no SLA. Joining can take seconds. | Relays down, rate-limited or blocked by school/corporate networks. |
| C. PeerJS public cloud server | Free | Shared public server, no SLA | Historical outages, ID collisions/rate limits. |
| D. Manual copy-paste of connection codes (no server at all) | Free | Clunky: two codes swapped by hand per player | Always works for signaling, but it's poor UX. **Built in as the last-resort fallback.** |

**STUN:** public STUN servers (Google `stun.l.google.com:19302`, Cloudflare `stun.cloudflare.com:3478`) are free, with no SLA and undocumented limits.

**TURN fallback plan:** TURN is needed when direct connection fails (symmetric NAT, strict firewalls; often quoted at about 10–20% of pairs, though I'm **unsure** of the exact figure).
1. Cloudflare Realtime TURN, pay per GB. I'm **unsure** of the current free allowance and price and will verify. At about 100 MB/match, the cost is cents.
2. Or self-hosted **coturn** on a ~$5/month VPS, listening on TLS 443 so strict firewalls let it through.

TURN credentials are minted short-lived by the signaling service, so no secret ever ships in the static site. If both direct and TURN fail, the join screen shows "can't connect; try the relay/manual code" and never fails silently.

Other failure modes I'm planning for: the host's tab is backgrounded (browsers throttle timers; I'm **unsure** how much Chromium/Firefox throttle dedicated workers and will test early in Phase 7), host upload or CPU saturation, and the host leaving (→ §7, item H).

---

## 6. Biggest risks (spec §11 plus ones I found)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Sim performance**: many units, 32 players, Huge map (384² ≈ 147k tiles) | SoA typed arrays, spatial hash for targeting (no O(n²)), flow-field cache with memory cap, per-map-size unit caps, sim profiling in the harness from Phase 3 on. |
| 2 | **Determinism / MP sync**: floats, transcendental math, iteration order, accidental `Math.random` | Integer-only state, ban-list check script, determinism tests: Node vs Chrome vs Firefox, same seed + commands → same hash at ticks 100/1k/10k. |
| 3 | **Balance across 100 races** | Data-driven races, headless harness with confidence intervals, outlier flags. Caveat: weak bot play for a race can look like a weak race, so bot hints per race. Compute: about 30+ matches/race × 100 races ≈ 3,000+ matches, run overnight on 12 threads. |
| 4 | **Scope** | Ledger + phase gates. 6–8 races before scaling. Optional items stay optional. |
| 5 | **Bot negotiation quality without external AI** | Rule-based offer evaluation (value model per resource + relationship + personality), templated dialogue with variety, logged decisions so behavior can be debugged. |
| 6 | **Render performance on a real mid-range laptop** | I can only measure on this RTX 3060 desktop, plus CPU-throttled runs. Mitigation: a low graphics preset and a conservative draw-call/triangle budget, reported honestly. |
| 7 | **Terrain edits vs pathfinding**: walls, trenches and moats invalidate paths often | Sector-local invalidation, recompute spread across ticks, tests for "wall placed → units reroute". |
| 8 | **Fog leak in lockstep MP** | Documented. Bots never see unfogged state (BotView). |
| 9 | **Host tab throttling / host as single point of failure** | Early Phase 7 test. A "host left" outcome with downloadable save. |
| 10 | **Save compatibility across versions** | Versioned save format. Old saves are rejected with a clear message rather than loaded wrong. |
| 11 | **Race mechanics that are frustrating** (e.g. Tidal folk land expansion only at night) | Tunable day/night length in TUNING.md, harness win rates, playtest notes. |
| 12 | **Brand-new toolchain versions** (TS 7, Vite 8) | Pin versions ≥14 days old. Fall back to the previous major if something breaks. |

---

## 7. Requirements I can't meet exactly as written: proposed closest version (needs your OK)

- **A. Mechanics the races imply but the spec never lists.** To work as described, the races need: a **day/night cycle** (Tidal folk), **temperature with cold/hot biomes, including tundra/snow and sea ice** (Frostkin; the §2 biome list has no cold biome), **fire** (Treewardens), **wild animals** (hunting, Beastcallers), **fungal spread** (Sporekin), a **tunnel layer** (Stone clans), **air/glider movement** (Sky nomads), and **underwater building** (Tidal folk). I've put these in the ledger as features marked *derived*, not as extras. Tell me if you'd rather cut or simplify any of them.
- **B. Colorblind-friendly colors for 32 players.** 32 hues can't all be told apart under color-vision deficiency. Proposal: 8 colorblind-safe hues × 4 patterns/emblem shapes, plus a player number label on the minimap and stats.
- **C. Economic victory** ("hold a majority of a key resource trade") is vague. Proposal: control ≥50% of continent-wide income of a chosen key resource (default adamite) for N minutes.
- **D. Tech victory.** Proposal: complete your race's evolution capstone plus X% of the shared tech tree.
- **E. "60 FPS on a mid-range laptop."** I can't certify this on a laptop. I'll report numbers measured here (desktop with RTX 3060) and with 4× CPU throttling, and keep a low-graphics preset for weaker GPUs.
- **F. "Impossible = best decision-making."** "Best" can't be proven. Proposal: fastest reaction, full micro, lookahead heuristics, and it must beat Hard in ≥70% of harness matches (Hard must beat Easy in ≥80%).
- **G. "100 races that each play distinctly."** I'll hand-verify the first 6–8 races (Phase 5). For later batches, "distinct" is enforced by harness checks: no two races share the same ability+weakness combination, stat vectors differ by a minimum distance, and win rates stay in bounds. Not every one of the 100 will be hand-playtested.
- **H. Host migration.** Proposal: first a clear "host left" outcome (pause, everyone can download the save, any player can re-host from it). Seamless migration is listed as a proposal (P-003).
- **I. Touch support** is a stretch goal (as §8.5 already says) and doesn't block any phase.
- **J.** §8's line "Handle disconnects, reconnects, and pausing rules" appears twice. I've treated it as one requirement.
- **K. Phase 2 needs "one race"** before the race system exists. Proposal (P-001): a neutral **Baseline** reference race used for Phase 2–4 tests and as the harness control group. It doesn't count toward the 100.

---

## 8. How "done-verified" evidence will be produced

- Sim features: Vitest tests run in Node; the evidence is the test name plus its output (hashes, measured values).
- Visual and UI features: Playwright and/or the in-app browser against `vite preview`, with screenshots saved outside the repo and observations recorded in the ledger.
- Performance: an in-page perf HUD (FPS, p95 frame time, sim ms/tick). Evidence is a 30-second camera sweep, with average and p95 recorded together with the hardware.
- Anything I couldn't actually run is recorded as **unverified**, never as done.

## 9. Git workflow

Each phase ends with one commit (plus small fix-up commits if needed) on `main` of `github.com/The-IOMIOU/fortnight`, pushed after the phase's verification.
