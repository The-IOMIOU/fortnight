/// <reference lib="webworker" />
// Simulation Web Worker: owns the Sim, runs ticks at the chosen speed, posts fog-filtered snapshots.
import { Sim, TestOpt, packVisibleEntities, type SimEvent } from '../sim/sim';
import { TickScheduler } from '../sim/core/scheduler';
import { TUNING, type SpeedName } from '../sim/core/tuning';
import { computeStats } from '../sim/stats';
import { loadSim, saveSim, SaveError } from '../sim/serialize';
import { BUILDING_TYPES, Task, UNIT_TYPES, isBuildingKind, unitDef, upgradeDef } from '../sim/defs';
import { FOG_VISIBLE } from '../sim/world/fog';
import type { Command } from '../sim/commands';
import type { BuildingInfo, FromWorker, Snapshot, ToWorker } from './protocol';
import { BotManager, type BotSave } from '../ai/manager';

declare const self: DedicatedWorkerGlobalScope;

let sim: Sim | null = null;
let bots: BotManager | null = null;
let viewer = 0;
let speedName: SpeedName = 'normal';
const sched = new TickScheduler(TUNING.sim.tickHz, TUNING.sim.maxCatchUpTicks);
let last = performance.now();
let stepMsAvg = 0;
const tickTimes: number[] = [];
let pendingTiles = new Set<number>();
let events: SimEvent[] = [];
let fogSentOnce = false;
let shots: number[] = [];
let spectating = false;

function post(msg: FromWorker, transfer: Transferable[] = []): void { self.postMessage(msg, transfer); }

/** Whose eyes the snapshot uses: −1 (everything) for spectators and with the 'reveal map' test option. */
let lastEye = 0;
function eye(): number { return viewer < 0 || (sim && (sim.ps[viewer].opts & TestOpt.REVEAL)) ? -1 : viewer; }
/** Speeds above 4× need the 'extra speeds' test option (F-197). */
function allowedSpeed(n: SpeedName): SpeedName { return TUNING.sim.speeds[n] > 4 && !(sim && viewer >= 0 && sim.ps[viewer].opts & TestOpt.FAST_SPEEDS) ? 'veryFast' : n; }

function collectAfterStep(): void {
  if (!sim) return;
  for (const t of sim.drainChangedTiles()) pendingTiles.add(t);
  const sh = sim.mil.shots, e = sim.ents;
  for (let k = 0; k < sh.length; k += 2) {
    const a = sh[k], t = sh[k + 1];
    const E = eye();
    if (E < 0 || sim.visibleTo(a, E) || sim.visibleTo(t, E)) shots.push(e.posX[a], e.posY[a], e.posX[t], e.posY[t]);
  }
  if (shots.length > 4 * 400) shots = shots.slice(-4 * 400);
  for (const ev of sim.drainEvents()) {
    if (viewer < 0 || ev.player === viewer || ev.type === 'victory' || ev.type === 'eliminated') events.push(ev);
    if (ev.type === 'eliminated' && ev.player === viewer && viewer >= 0) { viewer = -1; spectating = true; fogSentOnce = false; sim.ownerDirty = true; }
  }
}

function buildingInfo(s: Sim): BuildingInfo[] {
  if (viewer < 0) return [];
  const e = s.ents, out: BuildingInfo[] = [];
  const workers = new Map<number, number>();
  for (let id = 0; id < e.count; id++) if (e.alive[id] && e.task[id] === Task.WORK) workers.set(e.taskEnt[id], (workers.get(e.taskEnt[id]) ?? 0) + 1);
  for (let id = 0; id < e.count; id++) {
    if (!e.alive[id] || e.owner[id] !== viewer || !isBuildingKind(e.kind[id])) continue;
    const q = e.queues[id];
    const tt = q.length ? unitDef(UNIT_TYPES[q[0]]).trainTicks : 1;
    const up = e.upTo[id] ? upgradeDef(BUILDING_TYPES[e.btype[id]], e.upTo[id])?.ticks ?? 1 : 1;
    out.push({ id, queue: q.slice(), trainPermille: Math.min(1000, Math.floor((e.trainProgress[id] * 1000) / tt)), upTo: e.upTo[id], upPermille: Math.floor((e.upProgress[id] * 1000) / up), workers: workers.get(id) ?? 0 });
  }
  return out;
}

function snapshot(): void {
  if (!sim) return;
  let fog: Uint8Array | null = null;
  const E = eye();
  if (E !== lastEye) { lastEye = E; fogSentOnce = false; if (E < 0) for (let t = 0; t < sim.map.w * sim.map.h; t++) pendingTiles.add(t); }
  if (E < 0) { if (!fogSentOnce) fog = new Uint8Array(sim.map.w * sim.map.h).fill(255); }
  else { const f = sim.fog[E]; if (f.dirty || !fogSentOnce) fog = f.data.slice(); f.dirty = false; }
  fogSentOnce = true;
  const owner = sim.ownerDirty ? sim.tileOwner.slice() : null;
  sim.ownerDirty = false;
  // tile deltas the viewer can currently see
  let tiles: Int32Array | null = null;
  if (pendingTiles.size) {
    const out: number[] = [];
    const keep = new Set<number>();
    for (const t of pendingTiles) {
      if (E < 0 || sim.fog[E].data[t] === FOG_VISIBLE) out.push(t, sim.map.biome[t], sim.res.type[t]);
      else keep.add(t);
    }
    pendingTiles = keep;
    if (out.length) tiles = new Int32Array(out);
  }
  const ents = packVisibleEntities(sim, E);
  const now = performance.now();
  while (tickTimes.length && now - tickTimes[0] > 2000) tickTimes.shift();
  const tps = tickTimes.length > 1 ? ((tickTimes.length - 1) * 1000) / (tickTimes[tickTimes.length - 1] - tickTimes[0]) : 0;
  const pending = sim.pendingCommands.filter((c) => c.player === viewer).map((c) => ({ tick: c.tick, type: c.type }));
  const transfer: Transferable[] = [ents.buffer];
  if (fog) transfer.push(fog.buffer);
  if (owner) transfer.push(owner.buffer);
  if (tiles) transfer.push(tiles.buffer);
  const ev = events;
  events = [];
  const shotsArr = shots.length ? new Int32Array(shots) : null;
  shots = [];
  if (shotsArr) transfer.push(shotsArr.buffer);
  post({
    type: 'snap', tick: sim.tick, isNight: sim.isNight, dayPhase: sim.dayPhase, dayLength: sim.dayLength,
    ents, fog, owner, tiles, pending, stats: viewer >= 0 ? computeStats(sim, viewer) : spectating ? computeStats(sim, 0) : null, events: ev, buildings: buildingInfo(sim),
    bots: bots ? bots.debug().map((d) => ({ player: d.player, personality: d.personality, difficulty: d.difficulty, goal: d.goal, scores: d.scores, naval: d.naval })) : [], winnerTeam: sim.winnerTeam,
    shots: shotsArr, fires: E < 0 ? sim.burningList.slice() : sim.burningList.filter((t) => sim!.fog[E].data[t] === FOG_VISIBLE), spectating,
    modified: sim.modified, opts: viewer >= 0 ? sim.ps[viewer].opts : 0, me: viewer >= 0 ? meOf(sim, viewer) : null,
    winner: sim.winner, simMsPerTick: stepMsAvg, ticksPerSec: sched.paused ? 0 : tps,
    droppedTicks: sched.droppedTicks, paused: sched.paused, speed: speedName,
  }, transfer);
}

function meOf(s: Sim, p: number): Snapshot['me'] {
  const ps = s.ps[p], n = ps.researching ? s.rules.node(p, ps.researching) : null;
  return { race: ps.race, researched: ps.researched.slice(), researching: ps.researching, researchPermille: n ? Math.floor((ps.researchProgress * 1000) / n.ticks) : 0, gear: ps.gear.slice() };
}

function loop(): void {
  const now = performance.now();
  const n = sched.advance(now - last);
  last = now;
  if (sim && n > 0) {
    for (let k = 0; k < n; k++) {
      const t0 = performance.now();
      bots?.tick();
      sim.step();
      const t1 = performance.now();
      stepMsAvg = stepMsAvg * 0.9 + (t1 - t0) * 0.1;
      tickTimes.push(t1);
      collectAfterStep();
    }
    snapshot();
  }
  setTimeout(loop, 4);
}

function sendMap(s: Sim): void {
  const map = s.map;
  post({
    type: 'map', players: s.players, viewer, startTile: map.starts[Math.max(0, viewer)],
    map: { seed: map.seed, size: map.size, w: map.w, h: map.h, hash: map.hash, height: map.height.slice(), biome: map.biome.slice(),
      temp: map.temp.slice(), starts: map.starts.slice(), resType: s.res.type.slice(), continent: map.continent.slice(),
      riverCount: map.riverCount, lakeCount: map.lakeCount, wrap: map.wrap },
  });
}

let seq = 0;
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case 'init':
    case 'load': {
      try {
        sim = m.type === 'init' ? new Sim(m.settings) : loadSim(m.save);
        bots = m.type === 'init' ? new BotManager(sim, m.bots) : BotManager.restore(sim, ((m.save.extra as { bots?: BotSave[] } | undefined)?.bots) ?? []);
      } catch (err) {
        post({ type: 'error', message: err instanceof SaveError ? err.message : `Could not start: ${String(err)}` });
        return;
      }
      viewer = m.viewer;
      spectating = false;
      if (viewer >= 0 && sim.ps[viewer]?.eliminated) { viewer = -1; spectating = true; }
      speedName = allowedSpeed(m.speed);
      sched.speed = TUNING.sim.speeds[speedName];
      lastEye = viewer;
      sched.paused = m.type === 'init' ? m.paused : true;
      fogSentOnce = false;
      sim.ownerDirty = true;
      seq = sim.ps[Math.max(0, viewer)]?.seq ?? 0;
      sendMap(sim);
      collectAfterStep();
      snapshot();
      last = performance.now();
      break;
    }
    case 'cmd': {
      if (!sim || viewer < 0) return;
      // Executes on the next tick. While paused the sim does not advance, so the order waits as "pending".
      const cmd = { ...m.body, tick: sim.tick, player: viewer, seq: seq++ } as Command;
      sim.ps[viewer].seq = seq;
      sim.enqueue(cmd);
      snapshot();
      break;
    }
    case 'speed': speedName = allowedSpeed(m.speed); sched.speed = TUNING.sim.speeds[speedName]; snapshot(); break;
    case 'pause': sched.paused = m.paused; last = performance.now(); snapshot(); break;
    case 'stall': { const end = performance.now() + m.ms; while (performance.now() < end) { /* busy */ } break; }
    case 'hash': if (sim) post({ type: 'hash', reqId: m.reqId, tick: sim.tick, hash: sim.hash() }); break;
    case 'save': if (sim) { const sv = saveSim(sim); sv.extra = { bots: bots?.save() ?? [] }; post({ type: 'save', reqId: m.reqId, save: sv }); } break;
    case 'dump': if (sim && viewer >= 0) post({ type: 'dump', reqId: m.reqId, stats: computeStats(sim, viewer) }); break;
  }
};

loop();
