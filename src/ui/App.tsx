import { useEffect, useRef, useState } from 'preact/hooks';
import { Game, type NewGameOptions, type StartOptions } from '../app/game';
import { store, useStore } from '../app/store';
import { applyUiScale } from '../app/settings';
import { decodeSave, downloadBlob, encodeSave, getContinue, putContinue } from '../app/savefile';
import { MAP_SIZES, SPEED_NAMES, TUNING, type MapSize, type SpeedName } from '../sim/core/tuning';
import { scriptedRun } from '../sim/scripted';
import { generateMap } from '../sim/world/mapgen';
import { hex } from '../sim/core/hash';
import baseline from '../data/races/baseline.json';
import { Hud, SettingsModal } from './Hud';
import { sfxPlayed } from '../audio/sfx';

const SPEED_LABEL: Record<SpeedName, string> = { slow: '0.5×', normal: '1×', fast: '2×', veryFast: '4×' };
const WORDS_A = ['amber', 'quiet', 'rust', 'salt', 'ember', 'misty', 'iron', 'bright', 'hollow', 'wild', 'frost', 'golden'];
const WORDS_B = ['ridge', 'delta', 'fjord', 'mesa', 'marsh', 'vale', 'cove', 'steppe', 'basin', 'reef', 'crag', 'grove'];
const RACES = [baseline];
const AUTOSAVE_MS = 120_000;

export function randomSeed(): string {
  const r = (n: number): number => Math.floor(Math.random() * n); // UI only — never used inside the sim
  return `${WORDS_A[r(WORDS_A.length)]}-${WORDS_B[r(WORDS_B.length)]}-${100 + r(900)}`;
}

function readUrl(): Partial<NewGameOptions> & { play: boolean } {
  const q = new URLSearchParams(location.search);
  const size = q.get('size') as MapSize | null;
  const rivals = q.get('rivals');
  return {
    seed: q.get('seed') ?? undefined,
    size: size && MAP_SIZES.includes(size) ? size : undefined,
    players: rivals !== null ? +rivals + 1 : undefined,
    play: q.get('play') === '1',
    spectator: q.get('reveal') === '1',
  };
}

export function shareLink(seed: string, size: string): string {
  const u = new URL(location.href);
  u.search = new URLSearchParams({ seed, size, play: '1' }).toString();
  return u.toString();
}

declare global { interface Window { __game?: unknown } }

/** Phase 1–3: rival start slots hold idle civilizations (bots arrive in Phase 4). */
const defaultPlayers = (size: MapSize): number => Math.min(4, TUNING.map.sizes[size].maxPlayers);

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
      scripted: (seed: string, size: MapSize, players: number, cps: number[]) => scriptedRun(seed, size, players, cps),
      mapHashOf: (seed: string, size: MapSize) => hex(generateMap(seed, size).hash),
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
    if (u.play && u.seed) start({ kind: 'new', opts: { seed: u.seed, size: u.size ?? 'small', speed: 'normal', players: u.players ?? defaultPlayers(u.size ?? 'small'), spectator: u.spectator } });
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

function Menu({ initial, onStart }: { initial: Partial<NewGameOptions>; onStart: (s: StartOptions) => void }) {
  const [seed, setSeed] = useState(initial.seed ?? randomSeed());
  const [size, setSize] = useState<MapSize>(initial.size ?? 'small');
  const [speed, setSpeed] = useState<SpeedName>('normal');
  const [rivals, setRivals] = useState(defaultPlayers(initial.size ?? 'small') - 1);
  const [race, setRace] = useState(RACES[0].id);
  const [cont, setCont] = useState<{ label: string; blob: Blob } | null>(null);
  const error = useStore((s) => s.error);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxRivals = TUNING.map.sizes[size].maxPlayers - 1;
  useEffect(() => { void getContinue().then((c) => c && setCont(c)); }, []);
  useEffect(() => { if (rivals > maxRivals) setRivals(maxRivals); }, [size]);

  const loadBlob = async (b: Blob): Promise<void> => {
    try { onStart({ kind: 'load', save: await decodeSave(b) }); }
    catch { store.set({ error: 'That file is not a readable Fortnight save.' }); }
  };
  const chosen = RACES.find((r) => r.id === race)!;

  return (
    <div class="menu">
      <h1>Fortnight</h1>
      <p class="subtitle">Grow a civilization. Take the world.</p>
      {error && <p class="error" role="alert" data-testid="menu-error">{error}</p>}
      <section class="panel">
        <h2>New Game</h2>
        <label>People
          <select value={race} onChange={(e) => setRace((e.target as HTMLSelectElement).value)} data-testid="race">
            {RACES.map((r) => <option value={r.id}>{r.name}</option>)}
          </select>
          <small class="later">{chosen.description}</small>
        </label>
        <label>Map size
          <select value={size} onChange={(e) => setSize((e.target as HTMLSelectElement).value as MapSize)} data-testid="size">
            {MAP_SIZES.map((s) => <option value={s}>{s[0].toUpperCase() + s.slice(1)} ({TUNING.map.sizes[s].tiles}×{TUNING.map.sizes[s].tiles}, {TUNING.map.sizes[s].continents} continents)</option>)}
          </select>
        </label>
        <label>Seed
          <span class="row">
            <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} data-testid="seed" />
            <button type="button" onClick={() => setSeed(randomSeed())}>Random</button>
          </span>
        </label>
        <label>Rival civilizations: {rivals}
          <input type="range" min="0" max={maxRivals} value={rivals} onInput={(e) => setRivals(+(e.target as HTMLInputElement).value)} data-testid="rivals" />
          <small class="later">Rivals stay idle until bots arrive (Phase 4).</small>
        </label>
        <label>Game speed
          <select value={speed} onChange={(e) => setSpeed((e.target as HTMLSelectElement).value as SpeedName)}>
            {SPEED_NAMES.map((s) => <option value={s}>{SPEED_LABEL[s]}</option>)}
          </select>
        </label>
        <p class="later">Victory: hold {TUNING.economy.dominationPct} % of all land for {TUNING.economy.dominationHoldTicks / 600} minutes. Conquest arrives with combat (Phase 3).</p>
        <button class="primary" data-testid="start" disabled={!seed.trim()} onClick={() => { store.set({ error: '' }); onStart({ kind: 'new', opts: { seed: seed.trim(), size, speed, players: rivals + 1 } }); }}>Start</button>
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
