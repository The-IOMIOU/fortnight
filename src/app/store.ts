// Tiny observable store shared by the game controller and the Preact UI.
import { useEffect, useState } from 'preact/hooks';
import type { SpeedName } from '../sim/core/tuning';

export interface PerfStats { fps: number; p95Ms: number; simMs: number; tps: number; drawCalls: number; triangles: number; entities: number; dropped: number }

export interface GameState {
  screen: 'menu' | 'loading' | 'game';
  seed: string;
  size: string;
  mapHash: string;
  tick: number;
  isNight: boolean;
  dayPhase: number;
  dayLength: number;
  speed: SpeedName;
  paused: boolean;
  pendingOrders: number;
  selected: number;
  ownerOverlay: boolean;
  showPerf: boolean;
  perf: PerfStats;
  toast: string;
}

type Listener = () => void;

export class Store {
  state: GameState = {
    screen: 'menu', seed: '', size: 'small', mapHash: '', tick: 0, isNight: false, dayPhase: 0, dayLength: 1,
    speed: 'normal', paused: false, pendingOrders: 0, selected: 0, ownerOverlay: true, showPerf: true,
    perf: { fps: 0, p95Ms: 0, simMs: 0, tps: 0, drawCalls: 0, triangles: 0, entities: 0, dropped: 0 }, toast: '',
  };
  private listeners = new Set<Listener>();
  set(patch: Partial<GameState>): void { this.state = { ...this.state, ...patch }; for (const l of this.listeners) l(); }
  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
}

export const store = new Store();

export function useStore<T>(sel: (s: GameState) => T): T {
  const [v, setV] = useState(() => sel(store.state));
  useEffect(() => store.subscribe(() => setV(() => sel(store.state))), []);
  return v;
}
