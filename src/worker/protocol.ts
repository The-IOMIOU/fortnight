// Messages between the main thread and the simulation worker.
import type { SimSettings, SimEvent } from '../sim/sim';
import type { SpeedName } from '../sim/core/tuning';
import type { CommandBody } from '../sim/commands';
import type { PlayerStats } from '../sim/stats';
import type { SaveData } from '../sim/serialize';
import type { BotConfig } from '../ai/manager';
import type { Goal } from '../ai/utility';

export interface MapPayload {
  seed: string; size: string; w: number; h: number; hash: number;
  height: Uint8Array; biome: Uint8Array; temp: Uint8Array; starts: Int32Array;
  resType: Uint8Array;
  continent: Uint8Array;
  riverCount: number; lakeCount: number;
  /** Globe world: x wraps (F-195). */
  wrap: boolean;
}

export type ToWorker =
  | { type: 'init'; settings: SimSettings; viewer: number; speed: SpeedName; paused: boolean; bots: BotConfig[] }
  | { type: 'load'; save: SaveData; viewer: number; speed: SpeedName }
  | { type: 'cmd'; body: CommandBody }
  | { type: 'speed'; speed: SpeedName }
  | { type: 'pause'; paused: boolean }
  | { type: 'stall'; ms: number }            // debug: block the worker (F-011 test)
  | { type: 'hash'; reqId: number }
  | { type: 'save'; reqId: number }
  | { type: 'dump'; reqId: number };         // debug: stats straight from the sim (F-059 test)

export interface BuildingInfo { id: number; queue: number[]; trainPermille: number; upTo: number; upPermille: number; workers: number }

export interface Snapshot {
  type: 'snap';
  tick: number;
  isNight: boolean;
  dayPhase: number;
  dayLength: number;
  ents: Int32Array;              // ENTITY_STRIDE ints per visible entity
  fog: Uint8Array | null;        // full fog layer of the viewer when it changed
  owner: Uint8Array | null;      // tile ownership when it changed
  /** Changed tiles the viewer can see: [tile, biome, resType] triples. */
  tiles: Int32Array | null;
  pending: { tick: number; type: string }[];
  stats: PlayerStats | null;
  /** Phase 5: the viewer's people, research and gear store. */
  me: { race: string; researched: string[]; researching: string; researchPermille: number; gear: number[] } | null;
  /** Phase 6: the viewer's diplomacy (relations, reputations, offers and chat that concern the viewer). */
  dip: { rel: number[]; reputation: number[]; ceasefireUntil: number[]; offers: import('../sim/diplomacy').Offer[]; chat: import('../sim/diplomacy').ChatMsg[]; races: string[] } | null;
  /** A test option was used in this run (F-198), and the viewer's active test options. */
  modified: boolean;
  opts: number;
  events: SimEvent[];
  buildings: BuildingInfo[];
  /** Ranged shots since the last snapshot the viewer can see: [ax, ay, tx, ty] fixed-point quads. */
  shots: Int32Array | null;
  /** Burning tiles the viewer can see. */
  fires: number[];
  /** The viewer was eliminated and now watches the whole map. */
  spectating: boolean;
  /** Bot goals and utility scores for the debug overlay (F-125). */
  bots: { player: number; personality: string; difficulty: string; goal: Goal; scores: Record<Goal, number>; naval: string }[];
  winner: number;
  winnerTeam: number;
  simMsPerTick: number;
  ticksPerSec: number;
  droppedTicks: number;
  paused: boolean;
  speed: SpeedName;
}

export type FromWorker =
  | { type: 'map'; map: MapPayload; players: number; viewer: number; startTile: number }
  | Snapshot
  | { type: 'hash'; reqId: number; tick: number; hash: number }
  | { type: 'save'; reqId: number; save: SaveData }
  | { type: 'dump'; reqId: number; stats: PlayerStats }
  | { type: 'error'; message: string };
