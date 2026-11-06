/// <reference lib="webworker" />
// Simulation Web Worker: owns the Sim, runs ticks at the chosen speed, posts fog-filtered snapshots.
import { Sim, packVisibleEntities } from '../sim/sim';
import { TickScheduler } from '../sim/core/scheduler';
import { TUNING, type SpeedName } from '../sim/core/tuning';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let sim: Sim | null = null;
let viewer = 0;
let speedName: SpeedName = 'normal';
let seq = 0;
const sched = new TickScheduler(TUNING.sim.tickHz, TUNING.sim.maxCatchUpTicks);
let last = performance.now();
let ownerSent = false;
let stepMsAvg = 0;
const tickTimes: number[] = []; // real timestamps of recent ticks → measured ticks/s

function post(msg: FromWorker, transfer: Transferable[] = []): void { self.postMessage(msg, transfer); }

function snapshot(): void {
  if (!sim) return;
  let fog: Uint8Array | null = null;
  if (viewer < 0) { // spectator: everything visible
    if (!ownerSent) fog = new Uint8Array(sim.map.w * sim.map.h).fill(255);
  } else {
    const f = sim.fog[viewer];
    if (f.dirty) fog = f.data.slice();
    f.dirty = false;
  }
  const owner = ownerSent ? null : sim.tileOwner.slice();
  ownerSent = true;
  const ents = packVisibleEntities(sim, viewer);
  const now = performance.now();
  while (tickTimes.length && now - tickTimes[0] > 2000) tickTimes.shift();
  const tps = tickTimes.length > 1 ? ((tickTimes.length - 1) * 1000) / (tickTimes[tickTimes.length - 1] - tickTimes[0]) : 0;
  const pending = sim.pendingCommands.filter((c) => c.player === viewer).map((c) => ({ tick: c.tick, x: c.x, y: c.y, ids: c.ids }));
  const transfer: Transferable[] = [ents.buffer];
  if (fog) transfer.push(fog.buffer);
  if (owner) transfer.push(owner.buffer);
  post({
    type: 'snap', tick: sim.tick, isNight: sim.isNight, dayPhase: sim.dayPhase, dayLength: sim.dayLength,
    ents, fog, owner, pending, simMsPerTick: stepMsAvg, ticksPerSec: sched.paused ? 0 : tps,
    droppedTicks: sched.droppedTicks, paused: sched.paused, speed: speedName,
  }, transfer);
}

function loop(): void {
  const now = performance.now();
  const n = sched.advance(now - last);
  last = now;
  if (sim && n > 0) {
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      sim.step();
      const t1 = performance.now();
      stepMsAvg = stepMsAvg * 0.9 + (t1 - t0) * 0.1;
      tickTimes.push(t1);
    }
    snapshot();
  }
  setTimeout(loop, 4);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case 'init': {
      sim = new Sim(m.settings);
      viewer = m.viewer;
      speedName = m.speed;
      sched.speed = TUNING.sim.speeds[m.speed];
      sched.paused = m.paused;
      const map = sim.map;
      post({
        type: 'map', players: sim.players, viewer, startTile: map.starts[Math.max(0, viewer)],
        map: { seed: map.seed, size: map.size, w: map.w, h: map.h, hash: map.hash, height: map.height.slice(), biome: map.biome.slice(),
          temp: map.temp.slice(), starts: map.starts.slice(), riverCount: map.riverCount, lakeCount: map.lakeCount },
      });
      snapshot();
      last = performance.now();
      break;
    }
    case 'move': {
      if (!sim || viewer < 0) return;
      // Executes on the next tick. While paused the sim does not advance, so the order waits as "pending".
      sim.enqueue({ type: 'move', tick: sim.tick, player: viewer, seq: seq++, ids: m.ids, x: m.x, y: m.y });
      snapshot();
      break;
    }
    case 'speed': speedName = m.speed; sched.speed = TUNING.sim.speeds[m.speed]; snapshot(); break;
    case 'pause': sched.paused = m.paused; last = performance.now(); snapshot(); break;
    case 'stall': { const end = performance.now() + m.ms; while (performance.now() < end) { /* busy */ } break; }
    case 'hash': if (sim) post({ type: 'hash', reqId: m.reqId, tick: sim.tick, hash: sim.hash() }); break;
  }
};

loop();
