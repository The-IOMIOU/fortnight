// Messages between the main thread and the simulation worker.
import type { SimSettings } from '../sim/sim';
import type { SpeedName } from '../sim/core/tuning';

export interface MapPayload {
  seed: string; size: string; w: number; h: number; hash: number;
  height: Uint8Array; biome: Uint8Array; temp: Uint8Array; starts: Int32Array;
  riverCount: number; lakeCount: number;
}

export type ToWorker =
  | { type: 'init'; settings: SimSettings; viewer: number; speed: SpeedName; paused: boolean }
  | { type: 'move'; ids: number[]; x: number; y: number }
  | { type: 'speed'; speed: SpeedName }
  | { type: 'pause'; paused: boolean }
  | { type: 'stall'; ms: number }            // debug: block the worker (F-011 test)
  | { type: 'hash'; reqId: number };

export interface Snapshot {
  type: 'snap';
  tick: number;
  isNight: boolean;
  dayPhase: number;
  dayLength: number;
  ents: Int32Array;              // ENTITY_STRIDE ints per visible entity
  fog: Uint8Array | null;        // full fog layer of the viewer when it changed
  owner: Uint8Array | null;      // tile ownership when it changed
  pending: { tick: number; x: number; y: number; ids: number[] }[];
  simMsPerTick: number;
  ticksPerSec: number;
  droppedTicks: number;
  paused: boolean;
  speed: SpeedName;
}

export type FromWorker =
  | { type: 'map'; map: MapPayload; players: number; viewer: number; startTile: number }
  | Snapshot
  | { type: 'hash'; reqId: number; tick: number; hash: number };
