// Tiny observable store shared by the game controller and the Preact UI.
import { useEffect, useState } from 'preact/hooks';
import type { SpeedName } from '../sim/core/tuning';
import type { PlayerStats } from '../sim/stats';
import type { BuildingInfo, Snapshot } from '../worker/protocol';
import { loadSettings, type Settings } from './settings';

export interface PerfStats { fps: number; p95Ms: number; simMs: number; tps: number; drawCalls: number; triangles: number; entities: number; dropped: number }

export interface FeedItem { id: number; text: string; kind: 'info' | 'good' | 'warn'; at: number }

export interface SelectionInfo {
  units: Record<string, number>;
  /** single selected building, if any */
  building: null | {
    id: number; btype: string; level: number; complete: boolean; progressPermille: number;
    info: BuildingInfo | null; owner: number; garrison: number; hp: number;
  };
  /** single selected unit details */
  unit: null | { id: number; type: string; task: number; carryAmt: number; carryType: number; hp: number };
}

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
  selection: SelectionInfo;
  ownerOverlay: boolean;
  showPerf: boolean;
  showStats: boolean;
  settingsOpen: boolean;
  perf: PerfStats;
  stats: PlayerStats | null;
  feed: FeedItem[];
  placing: string | null;
  winner: number;
  players: number;
  toast: string;
  error: string;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  settings: Settings;
  formation: 'box' | 'line';
  spectating: boolean;
  keysOpen: boolean;
  winnerTeam: number;
  myTeam: number;
  bots: Snapshot['bots'];
  showBots: boolean;
  impossibleBonusOn: boolean;
  /** Phase 4b: this run used test options (F-198), and your active test options (F-197). */
  modified: boolean;
  opts: number;
}

type Listener = () => void;

export class Store {
  state: GameState = {
    screen: 'menu', seed: '', size: 'small', mapHash: '', tick: 0, isNight: false, dayPhase: 0, dayLength: 1,
    speed: 'normal', paused: false, pendingOrders: 0, selected: 0, selection: { units: {}, building: null, unit: null },
    ownerOverlay: true, showPerf: false, showStats: false, settingsOpen: false,
    perf: { fps: 0, p95Ms: 0, simMs: 0, tps: 0, drawCalls: 0, triangles: 0, entities: 0, dropped: 0 },
    stats: null, feed: [], placing: null, winner: -1, players: 1, toast: '', error: '', box: null, settings: loadSettings(), formation: 'box', spectating: false, keysOpen: false, winnerTeam: -1, myTeam: 0, bots: [], showBots: false, impossibleBonusOn: false, modified: false, opts: 0,
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
