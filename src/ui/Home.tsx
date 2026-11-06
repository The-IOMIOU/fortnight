// Start screen: a living planet behind a short list of choices (Play, Multiplayer, Tutorial; Continue
// when a save exists). Multiplayer opens a small Host / Join screen. Settings sits in the footer.
import { useEffect, useRef, useState } from 'preact/hooks';
import { PlanetBackground, type BgView } from '../render/planetBg';
import { PixelText } from './pixelFont';
import { store } from '../app/store';
import { PLAYABLE_RACES } from '../sim/races';

export function Backdrop({ view }: { view: BgView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bg = useRef<PlanetBackground | null>(null);
  useEffect(() => {
    try { bg.current = new PlanetBackground(ref.current!); } catch { bg.current = null; } // no WebGL: the CSS sky remains
    return () => { bg.current?.dispose(); bg.current = null; };
  }, []);
  useEffect(() => { bg.current?.setView(view); }, [view]);
  return (
    <div class="backdrop" aria-hidden="true">
      <canvas ref={ref} class="backdrop-canvas" data-testid="backdrop" />
      <div class="backdrop-vignette" />
    </div>
  );
}

/** Up/Down arrows move between the menu entries (Enter / Space press them, as for any button). */
function arrowNav(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const list = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button.home-item'));
  const i = list.indexOf(document.activeElement as HTMLButtonElement);
  const next = list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1) + (i < 0 ? 0 : 0)) % list.length] ?? list[0];
  next?.focus();
  e.preventDefault();
}

function Item({ label, onClick, testid, hint }: { label: string; onClick: () => void; testid: string; hint?: string }) {
  return (
    <button class="home-item" onClick={onClick} data-testid={testid} aria-label={hint ? `${label}: ${hint}` : label}>
      <span class="home-caret" aria-hidden="true"><PixelText text=">" px={3} shadow={false} /></span>
      <PixelText text={label} px={4} />
      {hint && <small class="home-hint">{hint}</small>}
    </button>
  );
}

export function Home({ onPlay, onMultiplayer, onTutorial, onContinue, continueLabel }: {
  onPlay: () => void; onMultiplayer: () => void; onTutorial: () => void; onContinue: (() => void) | null; continueLabel: string;
}) {
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => { first.current?.querySelector<HTMLButtonElement>('button.home-item')?.focus({ preventScroll: true }); }, []);
  return (
    <div class="home" data-testid="home">
      <div class="home-col">
        <div class="home-title">
          <PixelText text="FORTNIGHT" px={9} class="title-px" />
          <p class="home-tag">Grow a civilization. Cross the seas. Take the world.</p>
        </div>
        <nav class="home-list" ref={first} onKeyDown={arrowNav} aria-label="Main menu">
          {onContinue && <Item label="CONTINUE" hint={continueLabel} onClick={onContinue} testid="home-continue" />}
          <Item label="PLAY" onClick={onPlay} testid="home-play" />
          <Item label="MULTIPLAYER" onClick={onMultiplayer} testid="home-multiplayer" />
          <Item label="TUTORIAL" onClick={onTutorial} testid="home-tutorial" />
        </nav>
      </div>
      <footer class="home-foot">
        <span>{PLAYABLE_RACES.length} peoples · 4 world sizes · up to 32 players · plays offline</span>
        <button class="home-link" onClick={() => store.set({ settingsOpen: true })} data-testid="home-settings">Settings</button>
      </footer>
    </div>
  );
}

/** Host or join. Hosting opens New Game with online play on; joining takes an invite link or code. */
export function MultiplayerScreen({ onBack, onHost, onJoin }: { onBack: () => void; onHost: () => void; onJoin: (code: string, name: string) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(() => { try { return localStorage.getItem('fortnight.name') ?? ''; } catch { return ''; } });
  const join = (): void => {
    const c = code.trim();
    if (!c) return;
    let k = c;
    try { if (c.includes('join=')) k = new URL(c).searchParams.get('join') ?? c; } catch { /* plain code */ }
    try { localStorage.setItem('fortnight.name', name.trim()); } catch { /* storage unavailable */ }
    onJoin(k, name.trim() || 'Guest');
  };
  return (
    <div class="home mp" data-testid="multiplayer">
      <div class="home-col">
        <button class="home-back" onClick={onBack} data-testid="mp-back" aria-label="Back"><PixelText text="< BACK" px={2} shadow={false} /></button>
        <PixelText text="MULTIPLAYER" px={6} class="title-px" />
        <p class="home-tag">Play with friends straight from the browser. No accounts, no game server.</p>
        <div class="mp-cards">
          <section class="mp-card">
            <PixelText text="HOST A GAME" px={3} />
            <p>Choose the world and seats for your friends, start, then send each friend an invite link from the in-game <b>Online</b> panel.</p>
            <button class="home-btn" onClick={onHost} data-testid="mp-host"><PixelText text="HOST" px={3} shadow={false} /></button>
          </section>
          <section class="mp-card">
            <PixelText text="JOIN A GAME" px={3} />
            <label>Invite link or code from your friend
              <textarea rows={2} value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} placeholder="https://…?join=…" data-testid="mp-code" />
            </label>
            <label>Your name
              <input value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="Guest" data-testid="mp-name" />
            </label>
            <button class="home-btn" disabled={!code.trim()} onClick={join} data-testid="mp-join"><PixelText text="JOIN" px={3} shadow={false} /></button>
            <small>After joining you get an answer code: send it back to the host so they can let you in.</small>
          </section>
        </div>
      </div>
    </div>
  );
}
