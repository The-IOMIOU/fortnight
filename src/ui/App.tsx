import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Game, type NewGameOptions, type StartOptions } from '../app/game';
import { store, useStore } from '../app/store';
import { applyUiScale } from '../app/settings';
import { decodeSave, downloadBlob, encodeSave, getContinue, putContinue } from '../app/savefile';
import { MAP_SIZES, SPEED_NAMES, TUNING, type MapSize, type SpeedName } from '../sim/core/tuning';
import { scriptedRun } from '../sim/scripted';
import { generateMap } from '../sim/world/mapgen';
import { hex } from '../sim/core/hash';
import { RACES, PLAYABLE_RACES } from '../sim/races';
import { RaceSummary } from './RacePanels';
import { Hud, SettingsModal } from './Hud';
import { DIFFICULTIES, PERSONALITIES, type Difficulty } from '../ai/utility';
import { Rng } from '../sim/core/prng';
import type { BotConfig } from '../ai/manager';
import { sfxPlayed } from '../audio/sfx';
import { MODES, modeDef, type ModeId } from '../app/modes';
import type { MapOpts, SeaWidth } from '../sim/world/mapgen';
import type { SimSettings } from '../sim/sim';
import { TestOptionList } from './testOptions';

const SPEED_LABEL: Record<SpeedName, string> = { slow: '0.5×', normal: '1×', fast: '2×', veryFast: '4×', x8: '8×', x16: '16×' };
const WORDS_A = ['amber', 'quiet', 'rust', 'salt', 'ember', 'misty', 'iron', 'bright', 'hollow', 'wild', 'frost', 'golden'];
const WORDS_B = ['ridge', 'delta', 'fjord', 'mesa', 'marsh', 'vale', 'cove', 'steppe', 'basin', 'reef', 'crag', 'grove'];
const AUTOSAVE_MS = 120_000;

export function randomSeed(): string {
  const r = (n: number): number => Math.floor(Math.random() * n); // UI only — never used inside the sim
  return `${WORDS_A[r(WORDS_A.length)]}-${WORDS_B[r(WORDS_B.length)]}-${100 + r(900)}`;
}

function readUrl(): Partial<NewGameOptions> & { play: boolean; botCount?: number; difficulty?: Difficulty; personality?: string; allies?: number } {
  const q = new URLSearchParams(location.search);
  const size = q.get('size') as MapSize | null;
  const rivals = q.get('rivals'), bots = q.get('bots');
  return {
    seed: q.get('seed') ?? undefined,
    size: size && MAP_SIZES.includes(size) ? size : undefined,
    players: rivals !== null ? +rivals + 1 : undefined,
    botCount: bots !== null ? +bots : undefined,
    difficulty: (q.get('difficulty') as Difficulty | null) ?? undefined,
    personality: q.get('personality') ?? undefined,
    allies: q.get('allies') !== null ? +q.get('allies')! : undefined,
    world: q.get('world') ? { globe: q.get('world') === 'globe', sea: (q.get('sea') ?? 'mixed') as SeaWidth, continents: q.get('continents') ? +q.get('continents')! : TUNING.map.sizes[size && MAP_SIZES.includes(size) ? size : 'small'].continents } : undefined,
    testOptions: q.get('opts') ? +q.get('opts')! : undefined,
    play: q.get('play') === '1',
    spectator: q.get('reveal') === '1',
  };
}

/** Link that starts the same map: seed, size and (since Phase 4b) the world shape. */
export function shareLink(seed: string, size: string, world?: SimSettings['world']): string {
  const u = new URL(location.href);
  const q: Record<string, string> = { seed, size, play: '1' };
  if (world) { q.world = world.globe ? 'globe' : 'flat'; if (world.sea) q.sea = world.sea; if (world.continents) q.continents = String(world.continents); }
  u.search = new URLSearchParams(q).toString();
  return u.toString();
}

declare global { interface Window { __game?: unknown } }

const defaultPlayers = (size: MapSize): number => Math.min(4, TUNING.map.sizes[size].maxPlayers);

/** Build the match: player 0 is you, players 1..n are bots; the first `allies` bots share your team. */
/** Race per player: yours, then the bots' (one race for all, or seeded random over the playable races: same link → same peoples). */
export function matchRaces(seed: string, mine: string, bots: string, players: number): string[] {
  const rng = Rng.stream(seed, 'menu-races');
  return Array.from({ length: players }, (_, p) => (p === 0 ? mine : bots === 'random' ? PLAYABLE_RACES[rng.int(PLAYABLE_RACES.length)].id : bots));
}

export function makeMatch(seed: string, size: MapSize, botCount: number, difficulty: Difficulty, personality: string, allies: number): Pick<NewGameOptions, 'players' | 'bots' | 'teams'> {
  const max = TUNING.map.sizes[size].maxPlayers - 1;
  const n = Math.max(0, Math.min(max, botCount));
  const rng = Rng.stream(seed, 'menu-personalities'); // same link → same opponents
  const bots: BotConfig[] = Array.from({ length: n }, (_, k) => ({
    player: k + 1, difficulty, personality: personality === 'random' ? PERSONALITIES[rng.int(PERSONALITIES.length)].id : personality,
  }));
  const teams = Array.from({ length: n + 1 }, (_, p) => (p === 0 || p <= allies ? 0 : p));
  return { players: n + 1, bots, teams };
}

export function App() {
  const screen = useStore((s) => s.screen);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const url = useRef(readUrl());
  const autosave = useRef(0);

  useEffect(() => { applyUiScale(store.state.settings.uiScale); }, []);

  const start = (s: StartOptions): void => {
    gameRef.current?.dispose();
    const g = new Game(hostRef.current!, s);
    gameRef.current = g;
    clearInterval(autosave.current);
    autosave.current = window.setInterval(() => { void doSave(false); }, AUTOSAVE_MS);
    window.__game = {
      game: g,
      ready: () => g.whenReady(),
      mapHash: () => store.state.mapHash,
      state: () => store.state,
      hash: () => g.requestHash(),
      dump: () => g.dumpStats(),
      save: () => g.save(),
      cmd: (body: never) => g.cmd(body),
      setSpeed: (s: SpeedName) => g.setSpeed(s),
      setPaused: (p: boolean) => g.setPaused(p),
      stall: (ms: number) => g.stallWorker(ms),
      sweep: (sec: number, dist?: number) => g.sweep(sec, dist),
      // Runs the shared deterministic code path on this page's JS engine (F-010 / F-021 cross-engine check).
      scripted: (seed: string, size: MapSize, players: number, cps: number[], world?: MapOpts) => scriptedRun(seed, size, players, cps, undefined, world),
      mapHashOf: (seed: string, size: MapSize, opts?: MapOpts) => hex(generateMap(seed, size, opts).hash),
      sfxCount: () => sfxPlayed(),
    };
  };
  const quit = (): void => {
    clearInterval(autosave.current);
    gameRef.current?.dispose(); gameRef.current = null;
    store.set({ screen: 'menu', placing: null, selection: { units: {}, building: null, unit: null }, showStats: false, winner: -1 });
  };

  /** Save: always to the local "continue" slot; `download` also hands the player a file. */
  const doSave = async (download: boolean): Promise<void> => {
    const g = gameRef.current;
    if (!g) return;
    const data = await g.save();
    const blob = await encodeSave(data);
    const label = `${data.settings.seed} · ${data.settings.size} · ${Math.floor(data.tick / 600)} min`;
    const stored = await putContinue(blob, label);
    if (download) {
      downloadBlob(blob, `fortnight-${data.settings.seed}-t${data.tick}.fnsave`);
      store.set({ toast: stored ? 'Saved (file downloaded; also kept for “Continue”)' : 'Saved (file downloaded)' });
      setTimeout(() => store.set({ toast: '' }), 3000);
    }
  };

  useEffect(() => {
    const u = url.current;
    if (u.play && u.seed) {
      const size = u.size ?? 'small';
      const m = u.botCount !== undefined ? makeMatch(u.seed, size, u.botCount, u.difficulty ?? 'hard', u.personality ?? 'random', u.allies ?? 0) : { players: u.players ?? defaultPlayers(size) };
      start({ kind: 'new', opts: { seed: u.seed, size, speed: 'normal', spectator: u.spectator, ...m, world: u.world, testOptions: u.testOptions } });
    }
  }, []);

  return (
    <div class="app">
      <div class="game-host" ref={hostRef} />
      {screen === 'menu' && <Menu initial={url.current} onStart={start} />}
      {screen === 'loading' && <div class="loading">Generating continents…</div>}
      {screen === 'game' && gameRef.current && <Hud game={gameRef.current} onQuit={quit} onSave={() => void doSave(true)} />}
    </div>
  );
}

interface MenuPrefs {
  mode: ModeId; size: MapSize; speed: SpeedName; rivals: number; difficulty: Difficulty; pers: string; allies: number; conquest: boolean; domination: boolean; domPct: number; bonus: boolean;
  globe: boolean; continents: number; sea: SeaWidth; wildlife: number; dayLen: number; popLimit: number; perBot: boolean; botRows: { difficulty: Difficulty; personality: string }[]; testOpts: number;
  race: string; botRace: string; vTech: boolean; vEcon: boolean;
}
const MENU_KEY = 'fortnight.menu.v1';
function loadMenuPrefs(): Partial<MenuPrefs> { try { return JSON.parse(localStorage.getItem(MENU_KEY) ?? '{}') as Partial<MenuPrefs>; } catch { return {}; } }
function saveMenuPrefs(p: MenuPrefs): void { try { localStorage.setItem(MENU_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } }
const MENU_SPEEDS = SPEED_NAMES.filter((n) => TUNING.sim.speeds[n] <= 4);
const WILDLIFE: [number, string][] = [[0, 'None'], [50, 'Few'], [100, 'Normal'], [200, 'Many']];
const DAY_LENGTHS: [number, string][] = [[1800, 'Short (3 min)'], [TUNING.dayNight.dayLengthTicks, 'Normal (6 min)'], [7200, 'Long (12 min)']];
const POP_LIMITS: [number, string][] = [[0, 'No limit (housing only)'], [50, '50'], [100, '100'], [200, '200'], [400, '400']];

function Menu({ initial, onStart }: { initial: Partial<NewGameOptions>; onStart: (s: StartOptions) => void }) {
  const saved = useMemo(loadMenuPrefs, []);
  const [mode, setModeRaw] = useState<ModeId>(saved.mode ?? 'short');
  const [seed, setSeed] = useState(initial.seed ?? randomSeed());
  const [size, setSize] = useState<MapSize>(initial.size ?? (saved.size && MAP_SIZES.includes(saved.size) ? saved.size : 'small'));
  const [speed, setSpeed] = useState<SpeedName>(saved.speed && MENU_SPEEDS.includes(saved.speed) ? saved.speed : 'normal');
  const [rivals, setRivals] = useState(saved.rivals ?? defaultPlayers(initial.size ?? 'small') - 1);
  const [difficulty, setDifficulty] = useState<Difficulty>(saved.difficulty && DIFFICULTIES.includes(saved.difficulty) ? saved.difficulty : 'hard');
  const [pers, setPers] = useState(saved.pers ?? 'random');
  const [allies, setAllies] = useState(saved.allies ?? 0);
  const [conquest, setConquest] = useState(saved.conquest ?? true);
  const [domination, setDomination] = useState(saved.domination ?? true);
  const [vTech, setVTech] = useState(saved.vTech ?? false);
  const [vEcon, setVEcon] = useState(saved.vEcon ?? false);
  const [domPct, setDomPct] = useState(saved.domPct ?? TUNING.economy.dominationPct);
  const [bonus, setBonus] = useState(saved.bonus ?? false);
  const [globe, setGlobe] = useState(saved.globe ?? true);
  const [continents, setContinents] = useState(saved.continents ?? TUNING.modes.short.continents);
  const [sea, setSea] = useState<SeaWidth>(saved.sea ?? 'close');
  const [wildlife, setWildlife] = useState(saved.wildlife ?? 100);
  const [dayLen, setDayLen] = useState(saved.dayLen ?? TUNING.dayNight.dayLengthTicks);
  const [popLimit, setPopLimit] = useState(saved.popLimit ?? 0);
  const [perBot, setPerBot] = useState(saved.perBot ?? false);
  const [botRows, setBotRows] = useState<MenuPrefs['botRows']>(saved.botRows ?? []);
  const [testOpts, setTestOpts] = useState(saved.testOpts ?? 0);
  const [clampMsg, setClampMsg] = useState('');
  const [race, setRace] = useState(saved.race ?? RACES[0].id);
  const [botRace, setBotRace] = useState(saved.botRace ?? 'random');
  const [cont, setCont] = useState<{ label: string; blob: Blob } | null>(null);
  const error = useStore((s) => s.error);
  const fileRef = useRef<HTMLInputElement>(null);
  const md = modeDef(mode);
  const sizes = md ? md.sizes : MAP_SIZES;
  const maxRivals = Math.min(md?.maxBots ?? 31, TUNING.map.sizes[size].maxPlayers - 1);
  useEffect(() => { void getContinue().then((c) => c && setCont(c)); }, []);
  useEffect(() => {
    if (rivals > maxRivals) { setRivals(maxRivals); setClampMsg(`${md ? md.name + ' mode on a' : 'A'} ${size} map has room for ${maxRivals} bots, so the bot count was lowered.`); } else setClampMsg('');
    if (allies > Math.max(0, maxRivals - 1)) setAllies(Math.max(0, maxRivals - 1));
  }, [size, mode]);
  /** Picking a mode applies its preset (size, bots, world); everything stays adjustable. */
  const setMode = (id: ModeId): void => {
    setModeRaw(id);
    const m = modeDef(id);
    if (!m) return;
    const sz = m.sizes.includes(size) ? size : m.defaultSize;
    setSize(sz);
    setRivals(Math.min(m.defaultBots, TUNING.map.sizes[sz].maxPlayers - 1)); setClampMsg('');
    setGlobe(m.globe); setSea(m.sea); setContinents(m.continents);
  };
  const rows = Array.from({ length: rivals }, (_, k) => botRows[k] ?? { difficulty, personality: pers });
  const setRow = (k: number, patch: Partial<MenuPrefs['botRows'][number]>): void => { const r = rows.slice(); r[k] = { ...r[k], ...patch }; setBotRows(r); };

  const loadBlob = async (b: Blob): Promise<void> => {
    try { onStart({ kind: 'load', save: await decodeSave(b) }); }
    catch { store.set({ error: 'That file is not a readable Fortnight save.' }); }
  };
  const chosen = RACES.find((r) => r.id === race) ?? RACES[0];
  const start = (): void => {
    store.set({ error: '' });
    saveMenuPrefs({ mode, size, speed, rivals, difficulty, pers, allies, conquest, domination, domPct, bonus, globe, continents, sea, wildlife, dayLen, popLimit, perBot, botRows: rows, testOpts, race, botRace, vTech, vEcon });
    const m = makeMatch(seed.trim(), size, rivals, difficulty, pers, Math.min(allies, Math.max(0, rivals - 1)));
    if (perBot && m.bots) m.bots = m.bots.map((b, k) => ({ ...b, difficulty: rows[k].difficulty, personality: rows[k].personality === 'random' ? b.personality : rows[k].personality }));
    onStart({ kind: 'new', opts: {
      seed: seed.trim(), size, speed, ...m, victory: { conquest, domination, dominationPct: domPct, tech: vTech, economic: vEcon }, impossibleBonus: bonus && (m.bots ?? []).some((b) => b.difficulty === 'impossible'),
      world: { globe, sea, continents }, wildlifePct: wildlife, dayLengthTicks: dayLen, popLimit, testOptions: testOpts, mode,
      races: matchRaces(seed.trim(), race, botRace, m.players),
    } });
  };

  return (
    <div class="menu">
      <h1>Fortnight</h1>
      <p class="subtitle">Grow a civilization. Take the world.</p>
      {error && <p class="error" role="alert" data-testid="menu-error">{error}</p>}
      <section class="panel">
        <h2>New Game</h2>
        <div class="modes" role="radiogroup" aria-label="Game mode">
          {[...MODES, { id: 'custom' as const, name: 'Custom', blurb: 'Every setting by hand.' }].map((m) => (
            <button type="button" role="radio" aria-checked={mode === m.id} class={'mode' + (mode === m.id ? ' on' : '')} onClick={() => setMode(m.id)} data-testid={'mode-' + m.id}>
              <b>{m.name}</b><small>{m.blurb}</small>
            </button>
          ))}
        </div>
        <label>People
          <select value={race} onChange={(e) => setRace((e.target as HTMLSelectElement).value)} data-testid="race">
            {RACES.map((r) => <option value={r.id}>{r.name}</option>)}
          </select>
          <small class="later">{chosen.description}</small>
        </label>
        <RaceSummary race={chosen} />
        <label>Rival peoples
          <select value={botRace} onChange={(e) => setBotRace((e.target as HTMLSelectElement).value)} data-testid="bot-race">
            <option value="random">Random</option>
            {RACES.map((r) => <option value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>Map size
          <select value={size} onChange={(e) => { const z = (e.target as HTMLSelectElement).value as MapSize; setSize(z); if (mode === 'custom') setContinents(TUNING.map.sizes[z].continents); }} data-testid="size">
            {sizes.map((z) => <option value={z}>{z[0].toUpperCase() + z.slice(1)} ({TUNING.map.sizes[z].tiles}×{TUNING.map.sizes[z].tiles})</option>)}
          </select>
        </label>
        <label>Seed
          <span class="row">
            <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} data-testid="seed" />
            <button type="button" onClick={() => setSeed(randomSeed())}>Random</button>
          </span>
        </label>
        <label>Bots: {rivals} (up to {maxRivals}{md ? ` in ${md.name}` : ' on this map'})
          <input type="range" min="0" max={maxRivals} value={rivals} onInput={(e) => { setRivals(+(e.target as HTMLInputElement).value); setClampMsg(''); }} data-testid="rivals" />
          {clampMsg && <small class="warn" data-testid="clamp-msg">{clampMsg}</small>}
        </label>
        <div class="row2">
          <label>Bot difficulty
            <select value={difficulty} onChange={(e) => setDifficulty((e.target as HTMLSelectElement).value as Difficulty)} data-testid="difficulty">
              {DIFFICULTIES.map((d) => <option value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select>
          </label>
          <label>Bot personality
            <select value={pers} onChange={(e) => setPers((e.target as HTMLSelectElement).value)} data-testid="personality">
              <option value="random">Random mix</option>
              {PERSONALITIES.map((p) => <option value={p.id} title={p.description}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {(difficulty === 'impossible' || (perBot && rows.some((r) => r.difficulty === 'impossible'))) && (
          <label class="row"><input type="checkbox" checked={bonus} onChange={(e) => setBonus((e.target as HTMLInputElement).checked)} data-testid="bonus" /> Give Impossible bots +{TUNING.bots.impossibleIncomeBonusPct} % income (off by default; shown in-game when on)</label>
        )}
        <label>Game speed
          <select value={speed} onChange={(e) => setSpeed((e.target as HTMLSelectElement).value as SpeedName)}>
            {MENU_SPEEDS.map((z) => <option value={z}>{SPEED_LABEL[z]}</option>)}
          </select>
        </label>
        <details class="more" data-testid="more-settings">
          <summary>More settings</summary>
          <div class="row2">
            <label>World
              <select value={globe ? 'globe' : 'flat'} onChange={(e) => setGlobe((e.target as HTMLSelectElement).value === 'globe')} data-testid="world">
                <option value="globe">Globe (wraps east–west)</option><option value="flat">Flat map</option>
              </select>
            </label>
            <label>Continents
              <input type="number" min="1" max="8" value={continents} onInput={(e) => setContinents(Math.max(1, Math.min(8, +(e.target as HTMLInputElement).value || 1)))} data-testid="continents" />
            </label>
          </div>
          <div class="row2">
            <label>Seas between continents
              <select value={sea} onChange={(e) => setSea((e.target as HTMLSelectElement).value as SeaWidth)} data-testid="sea">
                <option value="close">Close (narrow straits)</option><option value="mixed">Mixed (like Earth)</option><option value="far">Far (wide oceans)</option>
              </select>
            </label>
            <label>Wildlife
              <select value={wildlife} onChange={(e) => setWildlife(+(e.target as HTMLSelectElement).value)} data-testid="wildlife">
                {WILDLIFE.map(([v, l]) => <option value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div class="row2">
            <label>Day length
              <select value={dayLen} onChange={(e) => setDayLen(+(e.target as HTMLSelectElement).value)} data-testid="daylen">
                {DAY_LENGTHS.map(([v, l]) => <option value={v}>{l}</option>)}
              </select>
            </label>
            <label>Population limit
              <select value={popLimit} onChange={(e) => setPopLimit(+(e.target as HTMLSelectElement).value)} data-testid="poplimit">
                {POP_LIMITS.map(([v, l]) => <option value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <label>Allied bots (co-op: you + allies vs the rest): {Math.min(allies, Math.max(0, rivals - 1))}
            <input type="range" min="0" max={Math.max(0, rivals - 1)} value={Math.min(allies, Math.max(0, rivals - 1))} onInput={(e) => setAllies(+(e.target as HTMLInputElement).value)} data-testid="allies" />
          </label>
          <div class="row2">
            <label class="row"><input type="checkbox" checked={conquest} onChange={(e) => setConquest((e.target as HTMLInputElement).checked)} data-testid="v-conquest" /> Conquest</label>
            <label class="row"><input type="checkbox" checked={domination} onChange={(e) => setDomination((e.target as HTMLInputElement).checked)} data-testid="v-domination" /> Domination at
              <input type="number" min="50" max="95" value={domPct} style={{ width: '4rem' }} onInput={(e) => setDomPct(Math.max(50, Math.min(95, +(e.target as HTMLInputElement).value || 70)))} data-testid="v-dompct" /> %</label>
            <label class="row"><input type="checkbox" checked={vTech} onChange={(e) => setVTech((e.target as HTMLInputElement).checked)} data-testid="v-tech" /> Technology</label>
            <label class="row"><input type="checkbox" checked={vEcon} onChange={(e) => setVEcon((e.target as HTMLInputElement).checked)} data-testid="v-economic" /> Economy</label>
          </div>
          <p class="later">Conquest: be the last team with a capital. Domination: your team holds the chosen share of all land for {TUNING.economy.dominationHoldTicks / 600} minutes. Technology: your people's capstone plus {TUNING.tech.victoryCapstonePlusPct} % of the shared tech. Economy: {TUNING.diplomacy.econSharePct} % of all adamite income for {TUNING.diplomacy.econHoldTicks / 600} minutes.</p>
          <label class="row"><input type="checkbox" checked={perBot} onChange={(e) => setPerBot((e.target as HTMLInputElement).checked)} data-testid="per-bot" /> Set each bot separately</label>
          {perBot && (
            <div class="botrows" data-testid="bot-rows">
              {rows.map((r, k) => (
                <div class="row">
                  <span>Bot {k + 1}</span>
                  <select value={r.difficulty} onChange={(e) => setRow(k, { difficulty: (e.target as HTMLSelectElement).value as Difficulty })} data-testid={'bot-diff-' + k}>
                    {DIFFICULTIES.map((d) => <option value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                  </select>
                  <select value={r.personality} onChange={(e) => setRow(k, { personality: (e.target as HTMLSelectElement).value })} data-testid={'bot-pers-' + k}>
                    <option value="random">Random</option>
                    {PERSONALITIES.map((p) => <option value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </details>
        <details class="more" data-testid="test-options-menu">
          <summary>Test options (cheats){testOpts ? ' · on' : ''}</summary>
          <TestOptionList mask={testOpts} onChange={setTestOpts} modified={false} />
        </details>
        {testOpts !== 0 && <p class="warn" data-testid="menu-modified">Test options are on: this run will be marked as Modified.</p>}
        <button class="primary" data-testid="start" onClick={start} disabled={!seed.trim() || (!conquest && !domination)}>Start</button>
      </section>
      <section class="panel">
        <h2>Saved games</h2>
        {cont ? <button onClick={() => void loadBlob(cont.blob)} data-testid="continue">Continue: {cont.label}</button> : <p class="later">No local save yet. The game autosaves every 2 minutes.</p>}
        <button onClick={() => fileRef.current?.click()} data-testid="load-file">Load save file…</button>
        <input ref={fileRef} type="file" accept=".fnsave,application/gzip,application/json" hidden data-testid="load-input" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void loadBlob(f); }} />
      </section>
      <section class="panel muted">
        <button disabled title="Phase 7">Join Game</button>
        <button onClick={() => store.set({ settingsOpen: true })}>Settings</button>
        <button disabled title="Phase 9">Tutorial</button>
      </section>
      <SettingsModal />
    </div>
  );
}
