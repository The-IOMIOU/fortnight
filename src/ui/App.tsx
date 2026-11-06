import { useEffect, useRef, useState } from 'preact/hooks';
import { Game, type NewGameOptions } from '../app/game';
import { store, useStore } from '../app/store';
import { MAP_SIZES, SPEED_NAMES, TUNING, type MapSize, type SpeedName } from '../sim/core/tuning';
import { scriptedRun } from '../sim/scripted';
import { generateMap } from '../sim/world/mapgen';
import { hex } from '../sim/core/hash';

const SPEED_LABEL: Record<SpeedName, string> = { slow: '0.5×', normal: '1×', fast: '2×', veryFast: '4×' };
const WORDS_A = ['amber', 'quiet', 'rust', 'salt', 'ember', 'misty', 'iron', 'bright', 'hollow', 'wild', 'frost', 'golden'];
const WORDS_B = ['ridge', 'delta', 'fjord', 'mesa', 'marsh', 'vale', 'cove', 'steppe', 'basin', 'reef', 'crag', 'grove'];

export function randomSeed(): string {
  const r = (n: number): number => Math.floor(Math.random() * n); // UI only — never used inside the sim
  return `${WORDS_A[r(WORDS_A.length)]}-${WORDS_B[r(WORDS_B.length)]}-${100 + r(900)}`;
}

function readUrl(): Partial<NewGameOptions> & { play: boolean } {
  const q = new URLSearchParams(location.search);
  const size = q.get('size') as MapSize | null;
  return {
    seed: q.get('seed') ?? undefined,
    size: size && MAP_SIZES.includes(size) ? size : undefined,
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

export function App() {
  const screen = useStore((s) => s.screen);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const url = useRef(readUrl());

  const start = (o: NewGameOptions): void => {
    gameRef.current?.dispose();
    const g = new Game(hostRef.current!, o);
    gameRef.current = g;
    window.__game = {
      game: g,
      ready: () => g.whenReady(),
      mapHash: () => store.state.mapHash,
      state: () => store.state,
      hash: () => g.requestHash(),
      setSpeed: (s: SpeedName) => g.setSpeed(s),
      setPaused: (p: boolean) => g.setPaused(p),
      stall: (ms: number) => g.stallWorker(ms),
      sweep: (sec: number, dist?: number) => g.sweep(sec, dist),
      // Runs the shared deterministic code path on this page's JS engine (F-010 / F-021 cross-engine check).
      scripted: (seed: string, size: MapSize, players: number, cps: number[]) => scriptedRun(seed, size, players, cps),
      mapHashOf: (seed: string, size: MapSize) => hex(generateMap(seed, size).hash),
    };
  };
  const quit = (): void => { gameRef.current?.dispose(); gameRef.current = null; store.set({ screen: 'menu' }); };

  useEffect(() => {
    const u = url.current;
    if (u.play && u.seed) start({ seed: u.seed, size: u.size ?? 'small', speed: 'normal', players: defaultPlayers(u.size ?? 'small'), spectator: u.spectator });
  }, []);

  return (
    <div class="app">
      <div class="game-host" ref={hostRef} />
      {screen === 'menu' && <Menu initial={url.current} onStart={start} />}
      {screen === 'loading' && <div class="loading">Generating continent…</div>}
      {screen === 'game' && <Hud game={gameRef} onQuit={quit} />}
    </div>
  );
}

/** Phase 1: other start slots hold idle scouts (stand-ins until bots arrive in Phase 4). */
const defaultPlayers = (size: MapSize): number => Math.min(4, TUNING.map.sizes[size].maxPlayers);

function Menu({ initial, onStart }: { initial: Partial<NewGameOptions>; onStart: (o: NewGameOptions) => void }) {
  const [seed, setSeed] = useState(initial.seed ?? randomSeed());
  const [size, setSize] = useState<MapSize>(initial.size ?? 'small');
  const [speed, setSpeed] = useState<SpeedName>('normal');
  return (
    <div class="menu">
      <h1>Fortnight</h1>
      <p class="subtitle">Grow a civilization. Take the continent.</p>
      <section class="panel">
        <h2>New Game</h2>
        <label>Map size
          <select value={size} onChange={(e) => setSize((e.target as HTMLSelectElement).value as MapSize)} data-testid="size">
            {MAP_SIZES.map((s) => <option value={s}>{s[0].toUpperCase() + s.slice(1)} ({TUNING.map.sizes[s].tiles}×{TUNING.map.sizes[s].tiles})</option>)}
          </select>
        </label>
        <label>Seed
          <span class="row">
            <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value)} data-testid="seed" />
            <button type="button" onClick={() => setSeed(randomSeed())}>Random</button>
          </span>
        </label>
        <label>Game speed
          <select value={speed} onChange={(e) => setSpeed((e.target as HTMLSelectElement).value as SpeedName)}>
            {SPEED_NAMES.map((s) => <option value={s}>{SPEED_LABEL[s]}</option>)}
          </select>
        </label>
        <p class="later">Race, bots and victory settings arrive in later phases.</p>
        <button class="primary" data-testid="start" disabled={!seed.trim()} onClick={() => onStart({ seed: seed.trim(), size, speed, players: defaultPlayers(size) })}>Start</button>
      </section>
      <section class="panel muted">
        <button disabled title="Phase 7">Join Game</button>
        <button disabled title="Later phase">Settings</button>
        <button disabled title="Phase 9">Tutorial</button>
      </section>
    </div>
  );
}

function fmtTime(tick: number): string {
  const s = Math.floor(tick / TUNING.sim.tickHz);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Hud({ game, onQuit }: { game: { current: Game | null }; onQuit: () => void }) {
  const s = useStore((st) => st);
  const g = game.current;
  if (!g) return null;
  const copy = (): void => {
    const link = shareLink(s.seed, s.size);
    navigator.clipboard?.writeText(link).then(() => store.set({ toast: 'Share link copied' }), () => store.set({ toast: link }));
    setTimeout(() => store.set({ toast: '' }), 2500);
  };
  return (
    <>
      <div class="topbar">
        <div class="speed" role="group" aria-label="Game speed">
          <button class={s.paused ? 'on' : ''} onClick={() => g.setPaused(!s.paused)} data-testid="pause" title="Pause (Space)">{s.paused ? '▶' : '❚❚'}</button>
          {SPEED_NAMES.map((n) => (
            <button class={!s.paused && s.speed === n ? 'on' : s.speed === n ? 'sel' : ''} onClick={() => { g.setSpeed(n); if (s.paused) g.setPaused(false); }} data-testid={'speed-' + n}>{SPEED_LABEL[n]}</button>
          ))}
        </div>
        <div class="clock" data-testid="clock">{fmtTime(s.tick)} <span title={s.isNight ? 'Night' : 'Day'}>{s.isNight ? '☾' : '☀'}</span></div>
        {s.paused && <div class="paused-tag">PAUSED{s.pendingOrders > 0 ? ` · ${s.pendingOrders} order${s.pendingOrders > 1 ? 's' : ''} queued` : ''}</div>}
        <div class="spacer" />
        <div class="seed">Seed <b>{s.seed}</b> · {s.size}</div>
        <button onClick={copy}>Copy link</button>
        <button onClick={() => g.setOwnerOverlay(!s.ownerOverlay)} title="Ownership overlay (O)">{s.ownerOverlay ? 'Owners: on' : 'Owners: off'}</button>
        <button onClick={onQuit}>Menu</button>
      </div>
      {s.showPerf && (
        <div class="perf" data-testid="perf">
          <div>FPS {s.perf.fps.toFixed(0)} · p95 {s.perf.p95Ms.toFixed(1)} ms</div>
          <div>sim {s.perf.simMs.toFixed(2)} ms/tick · {s.perf.tps.toFixed(1)} ticks/s</div>
          <div>draws {s.perf.drawCalls} · tris {(s.perf.triangles / 1000).toFixed(0)}k · ents {s.perf.entities}</div>
          <div>tick {s.tick} · map {s.mapHash}</div>
        </div>
      )}
      <div class="help">Left-click: select scout · Right-click: move · Drag (middle/right) or WASD: pan · Wheel: zoom · Space: pause · +/−: speed · O: owners · F3: stats</div>
      {s.toast && <div class="toast">{s.toast}</div>}
    </>
  );
}
