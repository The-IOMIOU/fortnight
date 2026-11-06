// Basic tutorial (F-181): short, optional, skippable. Each step checks the game state and moves on by itself.
import { useEffect, useRef } from 'preact/hooks';
import { store, useStore, type GameState } from '../app/store';

interface Step { title: string; text: string; done?: (s: GameState, start: GameState) => boolean }
export const TUTORIAL: Step[] = [
  { title: 'Welcome', text: 'Your people start with a capital, three workers and a scout. Drag with the middle mouse button (or WASD) to look around, use the wheel to zoom. On a touch screen: drag to pan, pinch to zoom, tap to select, long-press to give an order.' },
  { title: 'Select your workers', text: 'Left-drag a box around your workers (or click one).', done: (s) => (s.selection.units.worker ?? 0) > 0 },
  { title: 'Build a house', text: 'With workers selected, click "House" in the panel below (or press H), then click on your land. Houses let your population grow.', done: (s, a) => (s.stats?.housing ?? 0) > (a.stats?.housing ?? 0) },
  { title: 'Gather wood', text: 'Select a worker and right-click a forest. Workers carry the wood back to the capital.', done: (s) => (s.stats?.incomePerMin[1] ?? 0) > 0 },
  { title: 'Train a worker', text: 'Click your capital and train a worker. More workers, more resources.', done: (s, a) => (s.stats?.pop ?? 0) > (a.stats?.pop ?? 0) },
  { title: 'Research', text: 'Open "Research" in the top bar: shared tech and your people\'s own evolution unlock buildings, troops and gear.', done: (s) => s.techOpen },
  { title: 'You are ready', text: 'Expand with settlers, defend with walls and towers, talk and trade in "Diplomacy", and win by conquest or domination. Good luck!' },
];

export function TutorialPanel() {
  const step = useStore((s) => s.tutorial);
  const st = useStore((s) => s);
  const start = useRef<GameState | null>(null);
  useEffect(() => { start.current = store.state; }, [step]);
  if (step < 0 || step >= TUTORIAL.length) return null;
  const cur = TUTORIAL[step];
  if (cur.done && start.current && cur.done(st, start.current)) setTimeout(() => { if (store.state.tutorial === step) store.set({ tutorial: step + 1 }); }, 0);
  const last = step === TUTORIAL.length - 1;
  return (
    <div class="tutorial" data-testid="tutorial" role="dialog" aria-label="Tutorial">
      <div class="sel-title">{step + 1}/{TUTORIAL.length} · {cur.title}</div>
      <p data-testid="tutorial-text">{cur.text}</p>
      <div class="row">
        {!cur.done && <button onClick={() => store.set({ tutorial: last ? -1 : step + 1 })} data-testid="tutorial-next">{last ? 'Finish' : 'Next'}</button>}
        {cur.done && <small>Do it in the game; this moves on by itself.</small>}
        {!last && <button onClick={() => store.set({ tutorial: -1 })} data-testid="tutorial-skip">Skip tutorial</button>}
      </div>
    </div>
  );
}
