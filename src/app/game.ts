// Game controller: owns the sim worker, Three.js renderer, camera, controls, minimap and HUD state.
import * as THREE from 'three';
import { NetSession, netToken } from '../net/session';
import SimWorker from '../worker/sim.worker.ts?worker&inline';
import { TUNING, SPEED_NAMES, type MapSize, type SpeedName } from '../sim/core/tuning';
import { FP_ONE } from '../sim/core/fixed';
import { hex } from '../sim/core/hash';
import type { CommandBody } from '../sim/commands';
import type { SaveData } from '../sim/serialize';
import type { SimSettings } from '../sim/sim';
import { RACES, ensureRaces } from '../sim/races';
import type { BotConfig } from '../ai/manager';
import type { PlayerStats } from '../sim/stats';
import {
  BUILDABLE, BUILDING_TYPES, DROPOFF, FARM_YIELD, Kind, RES_NAMES, RES_NONE, TRAINS, UNIT_TYPES, buildingDef, isBuildingKind,
  isUnitKind, unitTypeOfKind, upgradeDef, DEFENSIVE, buildingTypeOfKind, type BuildingTypeName,
} from '../sim/defs';
import { Biome, isWaterBiome } from '../sim/world/mapgen';
import type { BuildingInfo, FromWorker, MapPayload, Snapshot, ToWorker } from '../worker/protocol';
import { Terrain, tileTopY } from '../render/terrain';
import { UnitLayer, type EntityView } from '../render/units';
import { NatureLayer } from '../render/nature';
import { RtsCamera } from '../render/camera';
import { Minimap } from '../render/minimap';
import { Controls } from '../input/controls';
import { sfx, setVolume } from '../audio/sfx';
import { store, type FeedItem } from './store';
import { qualityParams } from './settings';
import { BUILDING_NAMES, RES_LABELS, UNIT_NAMES } from '../ui/names';
import { actionsFor, eventKey, keyFor } from './keymap';
import { EffectsLayer } from '../render/effects';
import { GLOBE, fromGlobe, globeRadius, globeScene, toGlobe } from '../render/globe';
import { GlobeCamera, type ViewCamera } from '../render/globeCamera';
import { SpaceLayer } from '../render/space';

THREE.ColorManagement.enabled = false;

/** Speeds offered to the player: above 4× only with the 'extra speeds' test option. */
export const availableSpeeds = (opts: number): SpeedName[] => SPEED_NAMES.filter((n) => TUNING.sim.speeds[n] <= 4 || (opts & 64) !== 0);

export interface NewGameOptions {
  seed: string; size: MapSize; speed: SpeedName; players: number; spectator?: boolean;
  /** Bot players (Phase 4); slots without a bot stay idle. */
  bots?: BotConfig[];
  teams?: number[];
  victory?: SimSettings['victory'];
  /** Optional Impossible-bot income bonus (shown in settings when enabled). */
  impossibleBonus?: boolean;
  // ---- Phase 4b ----
  mode?: string;
  world?: SimSettings['world'];
  wildlifePct?: number;
  dayLengthTicks?: number;
  popLimit?: number;
  /** Peace at the start in ticks (0 = none). */
  peaceTicks?: number;
  /** Test options for you (player 0) from the start; the run counts as modified. */
  testOptions?: number;
  // ---- Phase 5 ----
  /** Race id per player (you are player 0). */
  races?: string[];
  // ---- Phase 7 ----
  /** Host an online game: player slots kept for human guests (no bot there) and the pause rule. */
  online?: { seats: number[]; pauseMode: 'host' | 'vote' };
  /** Phase 9: start with the tutorial overlay. */
  tutorial?: boolean;
}
export type StartOptions = { kind: 'new'; opts: NewGameOptions } | { kind: 'load'; save: SaveData; online?: NewGameOptions['online']; viewer?: number } | { kind: 'join'; code: string; name: string } | { kind: 'room'; code: string; name: string };

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private worker: Worker;
  private terrain!: Terrain;
  units!: UnitLayer;
  private nature!: NatureLayer;
  cam!: ViewCamera;
  /** Globe map drawn as a 3D planet (F-195); false = flat view (flat maps, or the setting is off). */
  globeView = false;
  private space: SpaceLayer | null = null;
  private sunDir = new THREE.Vector3(0.5, 1, 0.75).normalize();
  private controls!: Controls;
  minimap!: Minimap;
  map!: MapPayload;
  viewer = 0;
  private owner!: Uint8Array;
  private sun = new THREE.DirectionalLight(0xffffff, 0.9);
  private amb = new THREE.AmbientLight(0xffffff, 0.55);
  private ghost: THREE.Mesh;
  private ghostLine: THREE.InstancedMesh;
  private lineStart = -1;
  private effects!: EffectsLayer;
  private lastSnap: Snapshot | null = null;
  private buildingInfo = new Map<number, BuildingInfo>();
  private snapTime = 0;
  private startTile = 0;
  private frameTimes: number[] = [];
  private lastFrame = performance.now();
  private raf = 0;
  private waiters = new Map<number, (v: unknown) => void>();
  private reqId = 0;
  private lastHud = 0;
  private disposed = false;
  private ready: Promise<void>;
  private resolveReady!: () => void;
  private frameHook: ((dt: number) => void) | null = null;
  private groups = new Map<number, number[]>();
  private lastGroupKey = { key: -1, at: 0 };
  private hover = { x: 0, y: 0 };
  private feedSeq = 0;
  private lastFeedAt = new Map<string, number>();

  constructor(private host: HTMLElement, start: StartOptions) {
    this.ready = new Promise((r) => (this.resolveReady = r));
    const q = qualityParams(store.state.settings.quality);
    this.renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setClearColor(0x0b0e13);
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.add(this.sun, this.amb);
    this.sun.position.set(0.5, 1, 0.75); // light the camera-facing (+z) walls too
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.ghostLine = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.5, 0.96).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }), 64);
    this.ghostLine.count = 0; this.ghostLine.frustumCulled = false;
    this.scene.add(this.ghostLine);
    setVolume(store.state.settings.volume, store.state.settings.muted);
    this.worker = new SimWorker();
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
    if (start.kind === 'new') {
      const o = start.opts;
      this.viewer = o.spectator ? -1 : 0;
      const bonus = Array.from({ length: o.players }, (_, p) => (o.impossibleBonus && o.bots?.find((b) => b.player === p)?.difficulty === 'impossible' ? TUNING.bots.impossibleIncomeBonusPct : 0));
      const settings: SimSettings = { seed: o.seed, size: o.size, players: o.players, teams: o.teams, victory: o.victory, incomeBonusPct: bonus };
      const work = Array.from({ length: o.players }, (_, p) => { const b = o.bots?.find((x) => x.player === p); return b ? TUNING.bots[b.difficulty].workPct : 100; });
      if (work.some((v) => v !== 100)) settings.workPct = work;
      if (o.world) settings.world = o.world;
      if (o.wildlifePct !== undefined && o.wildlifePct !== 100) settings.wildlifePct = o.wildlifePct;
      if (o.dayLengthTicks && o.dayLengthTicks !== TUNING.dayNight.dayLengthTicks) settings.dayLengthTicks = o.dayLengthTicks;
      if (o.popLimit) settings.popLimit = o.popLimit;
      if (o.peaceTicks) settings.peaceTicks = o.peaceTicks;
      if (o.races && o.races.some((r) => r !== 'baseline')) settings.races = o.races;
      const custom = RACES.filter((r) => r.custom && o.races?.includes(r.id));
      if (custom.length) settings.customRaces = custom;
      if (o.testOptions) settings.testOptions = [o.testOptions];
      this.send({ type: 'init', settings, viewer: this.viewer, speed: o.speed, paused: false, bots: o.bots ?? [] });
      if (o.online) { void this.setupNet('host').openRoom(); this.send({ type: 'hostNet', humans: [0, ...o.online.seats], pauseMode: o.online.pauseMode }); }
      store.set({ myTeam: o.teams?.[0] ?? 0, impossibleBonusOn: !!o.impossibleBonus && !!o.bots?.some((b) => b.difficulty === 'impossible') });
      store.set({ screen: 'loading', seed: o.seed, size: o.size, speed: o.speed, paused: false, winner: -1, feed: [], stats: null, error: '', tutorial: o.tutorial ? 0 : -1 });
    } else if (start.kind === 'room') {
      // join by room code (F-162): no answer code, the connection opens by itself
      this.viewer = -1;
      const n = this.setupNet('guest');
      store.set({ screen: 'loading', paused: false, winner: -1, feed: [], stats: null, error: '', netAnswer: '', joinRoom: start.code });
      void n.joinRoom(start.code).then(() => this.send({ type: 'joinNet', token: netToken(), name: start.name }))
        .catch((e: Error) => { store.set({ screen: 'menu', error: e.message, joinRoom: '' }); this.dispose(); });
    } else if (start.kind === 'join') {
      this.viewer = -1;
      const n = this.setupNet('guest');
      store.set({ screen: 'loading', paused: false, winner: -1, feed: [], stats: null, error: '', netAnswer: '' });
      void n.join(start.code).then(({ answer, open }) => {
        store.set({ netAnswer: answer });
        void open.then(() => this.send({ type: 'joinNet', token: netToken(), name: start.name }));
      }).catch(() => store.set({ screen: 'menu', error: 'That invite code could not be read.' }));
    } else {
      this.viewer = start.viewer ?? 0;
      this.send({ type: 'load', save: start.save, viewer: this.viewer, speed: 'normal' });
      if (start.online) { void this.setupNet('host').openRoom(); this.send({ type: 'hostNet', humans: [this.viewer, ...start.online.seats.filter((p) => p !== this.viewer)], pauseMode: start.online.pauseMode }); }
      store.set({ screen: 'loading', seed: start.save.settings.seed, size: start.save.settings.size, paused: true, winner: -1, feed: [], stats: null, error: '' });
    }
    window.addEventListener('resize', this.onResize);
  }

  whenReady(): Promise<void> { return this.ready; }
  private send(m: ToWorker): void { this.worker.postMessage(m); }
  cmd(body: CommandBody): void { this.send({ type: 'cmd', body }); }
  // ---- Phase 7: multiplayer session (null in single-player)
  net: NetSession | null = null;
  private setupNet(role: 'host' | 'guest'): NetSession {
    const n = new NetSession(role);
    n.onMessage = (peer, msg) => this.send({ type: 'netIn', peer, msg });
    n.onGone = (peer) => this.send({ type: 'netGone', peer });
    n.onChange = () => store.set({ invites: n.invites.map((i) => ({ peer: i.peer, code: i.code, state: i.state })), room: n.role === 'host' ? { ...n.room } : null });
    this.net = n;
    return n;
  }
  async invite(): Promise<string> { const inv = await this.net!.invite(); return inv.code; }
  async completeInvite(peer: number, answer: string): Promise<void> { const inv = this.net?.invites.find((i) => i.peer === peer); if (inv) await inv.complete(answer); }
  vote(id: number, yes: boolean): void { this.send({ type: 'netVote', id, yes }); }

  private request<T>(make: (id: number) => ToWorker): Promise<T> {
    const id = ++this.reqId;
    return new Promise<T>((res) => { this.waiters.set(id, res as (v: unknown) => void); this.send(make(id)); });
  }

  private onWorker(m: FromWorker): void {
    if (this.disposed) return;
    if (m.type === 'map') { ensureRaces(m.customRaces); this.viewer = m.viewer; this.onMap(m.map, m.startTile, m.players); }
    else if (m.type === 'snap') this.onSnap(m);
    else if (m.type === 'error') { store.set({ screen: 'menu', error: m.message }); this.dispose(); }
    else if (m.type === 'netOut') this.net?.send(m.peer, m.msg);
    else {
      const w = this.waiters.get(m.reqId);
      this.waiters.delete(m.reqId);
      if (m.type === 'hash') w?.({ tick: m.tick, hash: m.hash });
      else if (m.type === 'save') w?.(m.save);
      else if (m.type === 'dump') w?.(m.stats);
    }
  }

  private onMap(map: MapPayload, startTile: number, players: number): void {
    this.map = map;
    this.startTile = startTile;
    this.owner = new Uint8Array(map.w * map.h).fill(255);
    const q = qualityParams(store.state.settings.quality);
    this.terrain = new Terrain(map);
    this.terrain.material.uniforms.uWater.value = q.water ? 1 : 0;
    this.nature = new NatureLayer(map, q.treeDensity);
    this.units = new UnitLayer(map);
    this.effects = new EffectsLayer(map);
    this.scene.add(this.terrain.group, this.nature.group, this.units.group, this.effects.group);
    const r = this.host.getBoundingClientRect();
    this.globeView = map.wrap && store.state.settings.globeView;
    GLOBE.on.value = this.globeView ? 1 : 0;
    GLOBE.size.value.set(map.w, map.h, globeRadius(map.w));
    if (this.globeView) {
      this.cam = new GlobeCamera(map.w, map.h, r.width / Math.max(1, r.height));
      this.space = new SpaceLayer(globeRadius(map.w), this.renderer.getPixelRatio());
      this.scene.add(this.space.group);
      this.renderer.setClearColor(0x02040a);
    } else this.cam = new RtsCamera(map.w, map.h, r.width / Math.max(1, r.height), map.wrap);
    globeScene(this.scene);
    this.jumpToStart();
    this.minimap = new Minimap(map, (x, z) => this.cam.setTarget(x, z));
    this.host.appendChild(this.minimap.root);
    this.controls = new Controls(this.renderer.domElement, this.cam, {
      onLeftClick: (x, y, shift) => this.leftClick(x, y, shift),
      onRightClick: (x, y, shift) => this.rightClick(x, y, shift),
      onKey: (e) => this.onKey(e),
      onBoxDrag: (rect) => store.set({ box: rect }),
      onBoxSelect: (rect, shift) => this.boxSelect(rect, shift),
      onHover: (x, y) => { this.hover.x = x; this.hover.y = y; },
    });
    this.onResize();
    store.set({ screen: 'game', mapHash: hex(map.hash), tick: 0, players });
    this.raf = requestAnimationFrame(this.frame);
    this.resolveReady();
  }

  private onSnap(s: Snapshot): void {
    if (!this.terrain) return;
    if (s.tiles) { this.terrain.applyTiles(s.tiles); this.nature.applyTiles(s.tiles); this.minimap.applyTiles(s.tiles); }
    if (s.fog) { this.terrain.setFog(s.fog); this.minimap.setFog(s.fog); this.nature.setFog(s.fog); }
    if (s.owner) { this.owner = s.owner.slice(); this.terrain.setOwner(s.owner); this.minimap.setOwner(s.owner); }
    if (!this.lastSnap || s.tick !== this.lastSnap.tick) { this.units.update(s.ents); this.snapTime = performance.now(); }
    if (s.shots) {
      const now = performance.now(), sh = s.shots, w = this.map.w;
      const at = (x: number, y: number) => ({ x: x / FP_ONE, z: y / FP_ONE, y: tileTopY(this.map, Math.floor(y / FP_ONE) * w + Math.floor(x / FP_ONE)) });
      for (let k = 0; k < sh.length; k += 4) this.effects.addShot(at(sh[k], sh[k + 1]), at(sh[k + 2], sh[k + 3]), now);
    }
    this.effects.setFires(s.fires);
    if (s.spectating && !store.state.spectating) { this.viewer = -1; store.set({ spectating: true }); }
    this.buildingInfo.clear();
    for (const b of s.buildings) this.buildingInfo.set(b.id, b);
    this.lastSnap = s;
    for (const ev of s.events) this.onEvent(ev.type, ev.player, ev.a, ev.b);
    const perf = store.state.perf;
    store.set({
      tick: s.tick, isNight: s.isNight, dayPhase: s.dayPhase, dayLength: s.dayLength, speed: s.speed, paused: s.paused,
      pendingOrders: s.pending.length, stats: s.stats, winner: s.winner, winnerTeam: s.winnerTeam, bots: s.bots, modified: s.modified, opts: s.opts, peaceLeft: s.peaceLeft, me: s.me, dip: s.dip, net: s.net,
      perf: { ...perf, simMs: s.simMsPerTick, tps: s.ticksPerSec, dropped: s.droppedTicks, entities: s.ents.length / 9 },
    });
  }

  // ---------------------------------------------------------------- notifications (F-155)

  private onEvent(type: string, player: number, a?: number, b?: number): void {
    const bn = (i?: number): string => (i !== undefined && i >= 0 ? BUILDING_NAMES[BUILDING_TYPES[i]] : 'building');
    let text = '', kind: FeedItem['kind'] = 'info';
    switch (type) {
      case 'built': text = `${bn(a)} complete`; kind = 'good'; sfx.built(); break;
      case 'trained': text = `${UNIT_NAMES[UNIT_TYPES[a ?? 0]]} ready`; kind = 'good'; sfx.trained(); break;
      case 'upgraded': text = `${bn(a)} upgraded`; kind = 'good'; sfx.built(); break;
      case 'settled': text = 'New settlement founded'; kind = 'good'; sfx.built(); break;
      case 'deposit': text = `${RES_LABELS[a ?? 0]} deposit discovered`; sfx.discovery(); break;
      case 'depleted': text = `A ${RES_LABELS[a ?? 0].toLowerCase()} source ran out`; break;
      case 'housing': text = 'Not enough housing: build houses'; kind = 'warn'; sfx.warning(); break;
      case 'nothingNear': text = `A worker ran out of ${RES_LABELS[a ?? 1].toLowerCase()} nearby and is waiting: send them to a new spot`; kind = 'warn'; break;
      case 'peaceOver': text = 'Peace is over: rivals can attack now'; kind = 'warn'; sfx.warning(); break;
      case 'starving': text = 'Your people are starving! Work halves and training stops'; kind = 'warn'; sfx.warning(); break;
      case 'fed': text = 'Food supply restored'; kind = 'good'; break;
      case 'cantPlace': text = `Can't build ${bn(a).toLowerCase()} there`; kind = 'warn'; break;
      case 'cantAfford': text = 'Not enough resources'; kind = 'warn'; break;
      case 'researched': if (player !== this.viewer) return; text = `Research complete${a === undefined || a < 0 ? '' : ''}${b ? ': capstone reached!' : ''}`; kind = 'good'; sfx.built(); break;
      case 'cantResearch': text = "Can't research that now"; kind = 'warn'; break;
      case 'crafted': text = 'Gear crafted'; kind = 'good'; break;
      case 'tamed': text = 'An animal was tamed'; kind = 'good'; sfx.trained(); break;
      case 'offer': text = `P${(a ?? 0) + 1} sent you an offer (Diplomacy)`; sfx.discovery(); break;
      case 'offerAccepted': text = `Deal with P${(a ?? 0) + 1} done`; kind = 'good'; break;
      case 'offerDeclined': text = `P${(a ?? 0) + 1} declined your offer`; kind = 'warn'; break;
      case 'relation': text = `P${(a ?? 0) + 1}: now ${['at war', 'at peace', 'in a ceasefire', 'allied', 'in a trade pact'][b ?? 0]}`; kind = b === 0 ? 'warn' : 'good'; break;
      case 'treatyBroken': text = `Treaty with P${(a ?? 0) + 1} broken`; kind = 'warn'; sfx.warning(); break;
      case 'stole': text = `Your spy stole ${b} ${RES_LABELS[a ?? 0].toLowerCase()}`; kind = 'good'; break;
      case 'robbed': text = `A thief stole ${b} ${RES_LABELS[a ?? 0].toLowerCase()}!`; kind = 'warn'; break;
      case 'spyCaught': text = `An enemy agent of P${(a ?? 0) + 1} was caught`; kind = 'good'; break;
      case 'spyLost': text = 'Your agent was caught and executed'; kind = 'warn'; break;
      case 'intel': text = `Spy report: P${(a ?? 0) + 1} holds ${b} resources`; break;
      case 'sabotaged': text = 'Sabotage succeeded'; kind = 'good'; break;
      case 'wasSabotaged': text = `${bn(a)} was sabotaged!`; kind = 'warn'; sfx.warning(); break;
      case 'poisoned': text = 'Poison delivered'; kind = 'good'; break;
      case 'wasPoisoned': text = 'Poison! Something of yours was poisoned'; kind = 'warn'; sfx.warning(); break;
      case 'chat': return;
      case 'noDropoff': text = `No drop-off for ${RES_LABELS[a ?? 0].toLowerCase()}: build a camp or storehouse`; kind = 'warn'; break;
      case 'unreachable': text = "Can't reach that place"; kind = 'warn'; break;
      case 'victory': { const how = a === 1 ? 'conquest' : a === 2 ? 'technology' : a === 3 ? 'economy' : 'domination'; text = player === this.viewer ? `Victory by ${how}!` : `P${player + 1} has won by ${how}`; kind = player === this.viewer ? 'good' : 'warn'; sfx.victory(); break; }
      case 'unitLost': text = `${UNIT_NAMES[UNIT_TYPES[(a ?? 1) - 1]] ?? 'Unit'} lost`; kind = 'warn'; break;
      case 'buildingLost': text = `${bn(a)} destroyed`; kind = 'warn'; sfx.warning(); break;
      case 'capitalLost': text = 'Your capital has fallen!'; kind = 'warn'; sfx.warning(); break;
      case 'eliminated': text = player === this.viewer || store.state.spectating ? (player === 0 && store.state.spectating ? 'You have been eliminated: now spectating' : `P${player + 1} has been eliminated`) : `P${player + 1} has been eliminated`; kind = 'warn'; break;
      case 'rout': text = 'Your soldiers are routing!'; kind = 'warn'; break;
      case 'garrisonFull': text = 'That building is full'; kind = 'warn'; break;
      case 'transportFull': text = 'The transport is full'; kind = 'warn'; break;
      case 'cantDig': text = "Can't dig there"; kind = 'warn'; break;
      default: return;
    }
    const now = performance.now(), last = this.lastFeedAt.get(text) ?? -1e9;
    if (now - last < 4000) return; // de-duplicate bursts
    this.lastFeedAt.set(text, now);
    const feed = [...store.state.feed, { id: ++this.feedSeq, text, kind, at: now }].slice(-6);
    store.set({ feed });
    void b;
  }

  // ---------------------------------------------------------------- frame

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.frameTimes.push(now - this.lastFrame);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    this.lastFrame = now;
    this.frameHook?.(dt);
    this.controls.update(dt);
    const s = this.lastSnap;
    const tickMs = 1000 / (TUNING.sim.tickHz * TUNING.sim.speeds[s?.speed ?? 'normal']);
    const alpha = !s || s.paused ? 1 : Math.min(1, (now - this.snapTime) / tickMs);
    this.units.render(alpha);
    this.effects.render(now);
    this.updateGhost();
    const night = s ? nightness(s.dayPhase, s.dayLength, TUNING.dayNight.nightTicks) : 0;
    if (this.globeView && s) {
      // the sun circles the planet once a day: your home is in darkness exactly when the game says night
      const W = this.map.w, homeX = this.startTile % W, mid = s.dayLength - TUNING.dayNight.nightTicks / 2;
      const sunX = homeX + W / 2 + ((s.dayPhase - mid) / s.dayLength) * W;
      toGlobe(sunX, 0, this.map.h * 0.42, this.sunDir).normalize();
      this.sun.position.copy(this.sunDir).multiplyScalar(1000);
      (this.terrain.material.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);
      this.space?.setSun(this.sunDir);
      this.terrain.setLighting(0.15, now / 1000); // the night side keeps enough light to play
      this.sun.intensity = 0.95; this.amb.intensity = 0.55;
    } else {
      this.terrain.setLighting(night, now / 1000);
      this.sun.intensity = 0.75 - 0.5 * night;
      this.amb.intensity = 0.8 - 0.42 * night;
    }
    if (++this.curveFrames % 30 === 1) globeScene(this.scene); // new materials follow the globe
    const corners = this.viewCorners();
    this.renderer.render(this.scene, this.cam.camera);
    if (this.map.wrap && !this.globeView) {
      // globe in the flat view: draw the copies of the world east and west of the seam by moving the camera one map
      // width over (same depth buffer, so the copies overlap correctly); only when the view crosses it
      const xs = corners.map((c) => (c ? c.x : NaN));
      const open = xs.some((x) => Number.isNaN(x)), m = 2;
      const offs: number[] = [];
      if (open || Math.min(...xs) < m) offs.push(this.map.w);
      if (open || Math.max(...xs) > this.map.w - m) offs.push(-this.map.w);
      if (offs.length) {
        const c = this.cam.camera, x0 = c.position.x, auto = this.renderer.autoClear;
        this.renderer.autoClear = false;
        for (const off of offs) { c.position.x = x0 + off; c.updateMatrixWorld(); this.renderer.render(this.scene, c); }
        c.position.x = x0; c.updateMatrixWorld();
        this.renderer.autoClear = auto;
      }
    }
    if (now - this.lastHud > 200) {
      this.lastHud = now;
      this.minimap.redraw();
      const feed = store.state.feed.filter((f) => now - f.at < 12000);
      store.set({ perf: { ...store.state.perf, ...this.perfNow() }, selected: this.units.selected.size, selection: this.selectionInfo(), feed: feed.length === store.state.feed.length ? store.state.feed : feed });
    }
    this.minimap.drawView(corners, this.units.visible.filter((v) => v.owner !== 254 && v.owner !== 255));
  };

  private curveFrames = 0;
  /** Curved globe look on (display setting) for globe maps only. */
  /** Test hooks: is the 3D globe view on, and the share of tiles the fog shows as visible. */
  globeOn(): number { return GLOBE.on.value; }
  fogVisibleShare(): number { const f = this.terrain.fogData(); let n = 0; for (let i = 0; i < f.length; i++) if (f[i] === 255) n++; return n / f.length; }

  private perfNow(): { fps: number; p95Ms: number; drawCalls: number; triangles: number } {
    const recent = this.frameTimes.slice(-120);
    const avg = recent.reduce((a, b) => a + b, 0) / Math.max(1, recent.length);
    const sorted = this.frameTimes.slice(-300).sort((a, b) => a - b);
    const info = this.renderer.info.render;
    return { fps: avg > 0 ? 1000 / avg : 0, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, drawCalls: info.calls, triangles: info.triangles };
  }

  private selectionInfo(): typeof store.state.selection {
    const units: Record<string, number> = {};
    let building: typeof store.state.selection.building = null, unit: typeof store.state.selection.unit = null;
    const ids = [...this.units.selected];
    for (const id of ids) {
      const v = this.units.get(id);
      if (!v) continue;
      if (isUnitKind(v.kind)) {
        const t = unitTypeOfKind(v.kind);
        units[t] = (units[t] ?? 0) + 1;
        if (ids.length === 1) unit = { id, type: t, task: v.a, carryAmt: v.b & 0xffff, carryType: (v.b >> 16) & 255, hp: v.hp };
      } else if (isBuildingKind(v.kind) && ids.length === 1) {
        building = { id, btype: v.btype!, level: (v.a >> 8) & 255, complete: (v.flags & 2) !== 0, progressPermille: v.b, info: this.buildingInfo.get(id) ?? null, owner: v.owner, garrison: (v.a >> 20) & 15, hp: v.hp };
      }
    }
    return { units, building, unit };
  }

  private viewCorners(): ({ x: number; z: number } | null)[] {
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => {
      const p = this.cam.groundAt(x, y, 1);
      return p ? { x: p.x, z: p.z } : null;
    });
  }

  // ---------------------------------------------------------------- picking

  private ndc(clientX: number, clientY: number): [number, number] {
    const r = this.renderer.domElement.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1];
  }

  /** Point hit by a screen position, by marching the view ray over the terraced heightfield. */
  pickTile(clientX: number, clientY: number): { x: number; z: number } | null {
    const [nx, ny] = this.ndc(clientX, clientY);
    const ray = this.cam.ray(nx, ny);
    const W = this.map.w, H = this.map.h;
    if (this.globeView) {
      // march from where the ray meets the highest terrain shell down to the surface
      const R = GLOBE.size.value.z, top = new THREE.Sphere(new THREE.Vector3(), R + 3), p = new THREE.Vector3();
      if (!ray.intersectSphere(top, p)) return null;
      const step = ray.direction.clone().multiplyScalar(0.08);
      for (let k = 0; k < 4000; k++) {
        const m = fromGlobe(p);
        const tx = Math.min(W - 1, Math.max(0, Math.floor(m.x))), tz = Math.min(H - 1, Math.max(0, Math.floor(m.z)));
        if (m.h <= tileTopY(this.map, tz * W + tx)) return { x: m.x, z: m.z };
        p.add(step);
        if (p.length() < R - 2) return null;
      }
      return null;
    }
    const p = ray.origin.clone(), step = ray.direction.clone().multiplyScalar(0.15);
    for (let k = 0; k < 8000; k++) {
      p.add(step);
      let gx = p.x;
      if (this.map.wrap) gx = ((gx % W) + W) % W;
      if (gx < 0 || p.z < 0 || gx >= W || p.z >= H) { if (p.y < -50) return null; continue; }
      const i = Math.floor(p.z) * W + Math.floor(gx);
      if (p.y <= tileTopY(this.map, i)) return { x: gx, z: p.z };
    }
    return null;
  }

  screenOf(v: { x: number; y: number; z: number }, lift = 0.4): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect();
    let p: THREE.Vector3;
    if (this.globeView) {
      p = toGlobe(v.x, v.y + lift, v.z);
      // on the far side of the planet: off screen
      if (p.clone().normalize().dot(this.cam.camera.position.clone().sub(p)) < 0) return { x: -1e5, y: -1e5 };
    } else {
      // flat globe view: project the copy of the entity nearest the camera
      const W = this.map.w, x = this.map.wrap ? v.x + W * Math.round((this.cam.targetX - v.x) / W) : v.x;
      p = new THREE.Vector3(x, v.y + lift, v.z);
    }
    p.project(this.cam.camera);
    return { x: ((p.x + 1) / 2) * r.width + r.left, y: ((1 - p.y) / 2) * r.height + r.top };
  }

  /** Entity under the cursor: units/animals by screen distance, buildings by footprint. */
  private entityAt(clientX: number, clientY: number): EntityView | null {
    let best: EntityView | null = null, bestD = 20 * 20;
    for (const v of this.units.visible) {
      if (isBuildingKind(v.kind)) continue;
      const s = this.screenOf(v);
      const d = (s.x - clientX) ** 2 + (s.y - clientY) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) return best;
    const t = this.pickTile(clientX, clientY);
    if (!t) return null;
    for (const v of this.units.visible) {
      if (!isBuildingKind(v.kind)) continue;
      if (t.x >= v.anchorX! && t.x < v.anchorX! + v.size! && t.z >= v.anchorZ! && t.z < v.anchorZ! + v.size!) return v;
    }
    return null;
  }

  private leftClick(clientX: number, clientY: number, shift: boolean): void {
    const mode = store.state.placing;
    if (mode === 'patrol' || mode === 'ignite') {
      const t = this.pickTile(clientX, clientY);
      if (t) {
        const ids = this.ownSelectedUnits();
        if (mode === 'patrol') this.cmd({ type: 'patrol', ids, x: Math.floor(t.x * FP_ONE), y: Math.floor(t.z * FP_ONE) });
        else this.cmd({ type: 'ignite', ids, tile: Math.floor(t.z) * this.map.w + Math.floor(t.x) });
        sfx.order();
      }
      if (!shift) this.cancelPlacement();
      return;
    }
    if (mode) { this.placeAt(clientX, clientY, shift); return; }
    const v = this.entityAt(clientX, clientY);
    if (!shift) this.units.selected.clear();
    if (v && (v.owner === this.viewer || this.viewer < 0 || !isUnitKind(v.kind))) {
      if (isBuildingKind(v.kind) || !isUnitKind(v.kind)) { this.units.selected.clear(); this.units.selected.add(v.id); }
      else this.units.selected.add(v.id);
    }
    sfx.click();
    store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
  }

  private boxSelect(r: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void {
    if (!shift) this.units.selected.clear();
    for (const v of this.units.visible) {
      if (v.owner !== this.viewer || !isUnitKind(v.kind)) continue;
      const s = this.screenOf(v);
      if (s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1) this.units.selected.add(v.id);
    }
    store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
  }

  private ownSelectedUnits(): number[] {
    return [...this.units.selected].filter((id) => { const v = this.units.get(id); return v && v.owner === this.viewer && isUnitKind(v.kind); });
  }

  /** Context order decided by what's under the cursor: attack an enemy, gather/hunt/build/work/drop off,
   *  garrison or board, unload a transport, set a rally point, or move. */
  private rightClick(clientX: number, clientY: number, _shift: boolean): void {
    if (store.state.placing) { this.cancelPlacement(); return; }
    const ids = this.ownSelectedUnits();
    const v = this.entityAt(clientX, clientY);
    const t = this.pickTile(clientX, clientY);
    const tile = t ? Math.floor(t.z) * this.map.w + Math.floor(t.x) : -1;
    if (!ids.length) {
      // a selected own building: right-click sets its rally point
      const b = [...this.units.selected].map((id) => this.units.get(id)).find((x) => x && isBuildingKind(x.kind) && x.owner === this.viewer);
      if (b && tile >= 0) { this.cmd({ type: 'setRally', building: b.id, tile }); sfx.order(); store.set({ toast: 'Rally point set' }); setTimeout(() => store.set({ toast: '' }), 1200); }
      return;
    }
    const workers = ids.filter((id) => this.units.get(id)?.kind === Kind.WORKER);
    const others = ids.filter((id) => !workers.includes(id));
    // a covert act chosen in the panel: spies / saboteurs go for the clicked target (F-140–F-142)
    const act = store.state.covertAct;
    if (act && v && v.owner !== this.viewer && v.owner < 254) {
      this.cmd({ type: 'covert', ids, act: act as never, target: v.id }); store.set({ covertAct: null }); sfx.order(); return;
    }
    // enemy under the cursor → attack with everyone who can fight
    if (v && v.owner !== this.viewer && v.owner < 254 && (isUnitKind(v.kind) || isBuildingKind(v.kind))) {
      this.cmd({ type: 'attack', ids, target: v.id }); sfx.order(); return;
    }
    // own transport: board; own building with room: garrison (soldiers) / build-work-dropoff (workers)
    if (v && v.owner === this.viewer && (v.kind === Kind.TRANSPORT || isBuildingKind(v.kind))) {
      this.cmd({ type: 'interact', ids, target: v.id }); sfx.order(); return;
    }
    if (v && (workers.length || ids.some((id) => this.units.get(id)?.kind === Kind.SCOUT)) && (v.kind === Kind.ANIMAL || v.kind === Kind.CARCASS)) {
      this.cmd({ type: 'interact', ids: workers.length ? workers : ids, target: v.id }); // scouts of tamers tame (Phase 5)
      if (others.length) this.moveTo(others, v.x, v.z);
      sfx.order(); return;
    }
    if (!t) return;
    // a selected transport + a land tile → sail there and unload
    const ship = ids.find((id) => this.units.get(id)?.kind === Kind.TRANSPORT);
    if (ship !== undefined && !isWaterBiome(this.map.biome[tile])) { this.cmd({ type: 'unload', ship, tile }); sfx.order(); return; }
    if (workers.length && this.nature.resTypeAt(tile) !== RES_NONE) {
      this.cmd({ type: 'gather', ids: workers, tile });
      if (others.length) this.moveTo(others, t.x, t.z);
    } else this.moveTo(ids, t.x, t.z);
    sfx.order();
  }

  private moveTo(ids: number[], x: number, z: number): void {
    this.cmd({ type: 'move', ids, x: Math.floor(x * FP_ONE), y: Math.floor(z * FP_ONE), formation: store.state.formation });
  }

  /** Back-compat for tests: move whatever is selected. */
  moveSelected(tileX: number, tileZ: number): void { this.moveTo(this.ownSelectedUnits(), tileX, tileZ); }

  // ---------------------------------------------------------------- placement

  /** Start placing a building, a wall/gate/tower line, a trench line ('dig'), or a target mode ('patrol', 'ignite'). */
  startPlacement(bt: BuildingTypeName | 'dig' | 'patrol' | 'ignite'): void {
    const ids = this.ownSelectedUnits();
    if (bt === 'patrol' || bt === 'ignite') { if (ids.length) store.set({ placing: bt }); return; }
    const need = bt === 'settlement' ? Kind.SETTLER : Kind.WORKER;
    if (!ids.some((id) => this.units.get(id)?.kind === need)) return;
    this.lineStart = -1;
    store.set({ placing: bt });
  }
  cancelPlacement(): void { store.set({ placing: null }); this.ghost.visible = false; this.ghostLine.count = 0; this.lineStart = -1; }
  private isLineTool(mode: string | null): boolean { return mode === 'wall' || mode === 'gate' || mode === 'tower' || mode === 'dig'; }

  /** Tiles on a straight line (Bresenham), max 64. */
  lineTiles(a: number, b: number): number[] {
    const w = this.map.w;
    let x0 = a % w, y0 = Math.floor(a / w);
    const x1 = b % w, y1 = Math.floor(b / w), dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const out: number[] = [];
    for (;;) {
      out.push(y0 * w + x0);
      if ((x0 === x1 && y0 === y1) || out.length >= 64) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  /** Client-side check for one line tile. */
  lineTileValid(mode: string, t: number): boolean {
    const b = this.map.biome[t], o = this.owner[t];
    if (isWaterBiome(b) || this.nature.resTypeAt(t) !== RES_NONE) return false;
    if (o !== 255 && o !== this.viewer) return false;
    for (const v of this.units.visible) if (isBuildingKind(v.kind)) {
      const x = t % this.map.w, z = Math.floor(t / this.map.w);
      if (x >= v.anchorX! && x < v.anchorX! + v.size! && z >= v.anchorZ! && z < v.anchorZ! + v.size!) return false;
    }
    if (mode === 'dig') return b !== Biome.TRENCH && b !== Biome.MOUNTAIN && b !== Biome.SNOW;
    return BUILDABLE[b] === 1;
  }

  private anchorAt(clientX: number, clientY: number, bt: BuildingTypeName): number {
    const t = this.pickTile(clientX, clientY);
    if (!t) return -1;
    const s = buildingDef(bt).size;
    const ax = Math.round(t.x - s / 2), az = Math.round(t.z - s / 2);
    if (ax < 0 || az < 0 || ax + s > this.map.w || az + s > this.map.h) return -1;
    return az * this.map.w + ax;
  }

  /** Client-side preview check (the sim re-checks authoritatively). */
  placementValid(bt: BuildingTypeName, anchor: number): boolean {
    if (anchor < 0) return false;
    if (DEFENSIVE[bt]) return this.lineTileValid(bt, anchor);
    const { w } = this.map, s = buildingDef(bt).size, ax = anchor % w, az = (anchor - ax) / w;
    let nearWater = false;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const t = (az + dz) * w + ax + dx, b = this.map.biome[t];
      if (isWaterBiome(b) || !BUILDABLE[b] || this.nature.resTypeAt(t) !== RES_NONE) return false;
      if (bt === 'farm' && FARM_YIELD[b] <= 0) return false;
      const o = this.owner[t];
      if (bt === 'settlement' ? o !== 255 : bt === 'outpost' ? o !== 255 && o !== this.viewer : o !== this.viewer) return false;
    }
    for (const v of this.units.visible) {
      if (!isBuildingKind(v.kind)) continue;
      if (ax < v.anchorX! + v.size! && ax + s > v.anchorX! && az < v.anchorZ! + v.size! && az + s > v.anchorZ!) return false;
    }
    if (bt === 'fishingHut' || bt === 'dock') {
      for (let dz = -1; dz <= s; dz++) for (let dx = -1; dx <= s; dx++) {
        const x = ax + dx, z = az + dz;
        if (x < 0 || z < 0 || x >= w || z >= this.map.h) continue;
        const b = this.map.biome[z * w + x];
        if (b === Biome.OCEAN || b === Biome.LAKE || (b === Biome.RIVER && bt === 'fishingHut')) nearWater = true;
      }
      if (!nearWater) return false;
    }
    return true;
  }

  private updateGhost(): void {
    const mode = store.state.placing;
    this.ghostLine.count = 0;
    if (!mode || mode === 'patrol' || mode === 'ignite') { this.ghost.visible = false; return; }
    if (this.isLineTool(mode)) {
      this.ghost.visible = false;
      const t = this.pickTile(this.hover.x, this.hover.y);
      if (!t) return;
      const end = Math.floor(t.z) * this.map.w + Math.floor(t.x);
      const tiles = this.lineStart >= 0 ? this.lineTiles(this.lineStart, end) : [end];
      const m = new THREE.Matrix4(), c = new THREE.Color();
      tiles.forEach((q, i) => {
        const x = q % this.map.w, z = Math.floor(q / this.map.w);
        m.makeScale(1, mode === 'dig' ? 0.2 : 1, 1).setPosition(x + 0.5, tileTopY(this.map, q), z + 0.5);
        this.ghostLine.setMatrixAt(i, m);
        this.ghostLine.setColorAt(i, this.lineTileValid(mode, q) ? c.setHex(mode === 'dig' ? 0xc89a5a : 0x55ff88) : c.setHex(0xff5555));
      });
      this.ghostLine.count = tiles.length;
      this.ghostLine.instanceMatrix.needsUpdate = true;
      if (this.ghostLine.instanceColor) this.ghostLine.instanceColor.needsUpdate = true;
      return;
    }
    const bt = mode as BuildingTypeName;
    const a = this.anchorAt(this.hover.x, this.hover.y, bt);
    if (a < 0) { this.ghost.visible = false; return; }
    const s = buildingDef(bt).size, ax = a % this.map.w, az = (a - ax) / this.map.w;
    let y = 0;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) y = Math.max(y, tileTopY(this.map, (az + dz) * this.map.w + ax + dx));
    this.ghost.scale.set(s, 1, s);
    this.ghost.position.set(ax + s / 2, y, az + s / 2);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(this.placementValid(bt, a) ? 0x55ff88 : 0xff5555);
    this.ghost.visible = true;
  }

  private placeAt(clientX: number, clientY: number, keep: boolean): void {
    const mode = store.state.placing!;
    if (this.isLineTool(mode)) {
      const t = this.pickTile(clientX, clientY);
      if (!t) return;
      const tile = Math.floor(t.z) * this.map.w + Math.floor(t.x);
      if (this.lineStart < 0) { this.lineStart = tile; return; } // first click: line start
      const tiles = this.lineTiles(this.lineStart, tile);
      const workers = this.ownSelectedUnits().filter((id) => this.units.get(id)?.kind === Kind.WORKER);
      if (mode === 'dig') this.cmd({ type: 'dig', ids: workers, tiles });
      else this.cmd({ type: 'placeLine', ids: workers, btype: BUILDING_TYPES.indexOf(mode as BuildingTypeName), tiles });
      sfx.order();
      this.lineStart = keep ? tile : -1;
      if (!keep) this.cancelPlacement();
      return;
    }
    const bt = mode as BuildingTypeName;
    const a = this.anchorAt(clientX, clientY, bt);
    if (a < 0) return;
    const need = bt === 'settlement' ? Kind.SETTLER : Kind.WORKER;
    const ids = this.ownSelectedUnits().filter((id) => this.units.get(id)?.kind === need);
    this.cmd({ type: 'place', ids, btype: BUILDING_TYPES.indexOf(bt), tile: a });
    sfx.order();
    if (!keep) this.cancelPlacement();
  }

  // ---------------------------------------------------------------- building actions

  train(building: number, utype: number): void { this.cmd({ type: 'train', building, utype }); sfx.click(); }
  cancelTrain(building: number, index: number): void { this.cmd({ type: 'cancelTrain', building, index }); sfx.click(); }
  upgrade(building: number): void { this.cmd({ type: 'upgrade', building }); sfx.click(); }
  // ---- Phase 5 ----
  research(node: string): void { this.cmd({ type: 'research', node }); sfx.click(); }
  cancelResearch(): void { this.cmd({ type: 'cancelResearch' }); sfx.click(); }
  craft(building: number, item: number): void { this.cmd({ type: 'craft', building, item }); sfx.click(); }
  equip(item: number): void { const ids = this.ownSelectedUnits(); if (ids.length) { this.cmd({ type: 'equip', ids, item }); sfx.click(); } }
  // ---- Phase 6 ----
  offer(to: number, give: import('../sim/diplomacy').Deal, get: import('../sim/diplomacy').Deal, treaty: import('../sim/diplomacy').Treaty | null): void { this.cmd({ type: 'offer', to, give, get, treaty }); sfx.click(); }
  respond(offer: number, accept: boolean): void { this.cmd({ type: 'respond', offer, accept }); sfx.click(); }
  declareWar(to: number): void { this.cmd({ type: 'declareWar', to }); sfx.warning(); }
  chat(to: number, text: string): void { if (text.trim()) this.cmd({ type: 'chat', to, text: text.trim() }); }
  burrow(on: boolean): void { const ids = this.ownSelectedUnits(); if (ids.length) { this.cmd({ type: 'burrow', ids, on }); sfx.order(); } }
  ungarrison(building: number): void { this.cmd({ type: 'ungarrison', building }); sfx.click(); }
  demolish(building: number): void { this.cmd({ type: 'demolish', building }); sfx.click(); }
  /** Stop / hold / retreat for the selected units. */
  order(type: 'stop' | 'hold' | 'retreat'): void { const ids = this.ownSelectedUnits(); if (ids.length) { this.cmd({ type, ids }); sfx.order(); } }
  toggleFormation(): void { store.set({ formation: store.state.formation === 'box' ? 'line' : 'box' }); sfx.click(); }

  /** Can the viewer afford a cost right now (UI enabling)? */
  canAfford(cost: Partial<Record<(typeof RES_NAMES)[number], number>>): boolean {
    const st = store.state.stats?.stock;
    if (!st) return false;
    return RES_NAMES.every((r, i) => st[i] >= (cost[r] ?? 0));
  }

  // ---------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent): void {
    const key = eventKey(e);
    if (key === 'escape') { if (store.state.placing) this.cancelPlacement(); else { this.units.selected.clear(); store.set({ selected: 0, selection: this.selectionInfo() }); } return; }
    if (key === 'f3') { e.preventDefault(); store.set({ showPerf: !store.state.showPerf }); return; }
    if (key === 'f4') { e.preventDefault(); store.set({ showBots: !store.state.showBots }); return; }
    const g = actionsFor(e, 'global')[0];
    if (g) {
      e.preventDefault();
      if (g === 'pause') this.setPaused(!store.state.paused);
      else if (g === 'faster') this.stepSpeed(1);
      else if (g === 'slower') this.stepSpeed(-1);
      else if (g === 'stats') store.set({ showStats: !store.state.showStats });
      else if (g === 'owners') this.setOwnerOverlay(!store.state.ownerOverlay);
      else if (g === 'home') this.jumpToStart();
      return;
    }
    if (key === '+') { this.stepSpeed(1); return; }
    // control groups: Ctrl+digit assigns, digit recalls (twice quickly = centre camera)
    if (/^[0-9]$/.test(e.key)) {
      const n = +e.key;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups.set(n, [...this.units.selected]); return; }
      const grp = (this.groups.get(n) ?? []).filter((id) => this.units.get(id));
      if (!grp.length) return;
      this.units.selected.clear();
      for (const id of grp) this.units.selected.add(id);
      const now = performance.now();
      if (this.lastGroupKey.key === n && now - this.lastGroupKey.at < 400) { const v = this.units.get(grp[0])!; this.cam.setTarget(v.x, v.z); }
      this.lastGroupKey = { key: n, at: now };
      store.set({ selected: this.units.selected.size, selection: this.selectionInfo() });
      return;
    }
    const sel = this.selectionInfo();
    if (sel.building && sel.building.owner === this.viewer && sel.building.complete) {
      const bt = sel.building.btype as BuildingTypeName;
      for (const a of actionsFor(e, 'building')) {
        if (a.startsWith('train.')) { const u = a.slice(6); if (TRAINS[bt]?.includes(u as never)) { this.train(sel.building.id, UNIT_TYPES.indexOf(u as never)); return; } }
        if (a === 'upgrade' && upgradeDef(bt, sel.building.level + 1)) { this.upgrade(sel.building.id); return; }
        if (a === 'ungarrison') { this.ungarrison(sel.building.id); return; }
        if (a === 'demolish' && bt !== 'capital') { this.demolish(sel.building.id); return; }
      }
    }
    if (sel.units.worker) for (const a of actionsFor(e, 'workers')) {
      if (a === 'dig') { this.startPlacement('dig'); return; }
      if (a.startsWith('build.')) { this.startPlacement(a.slice(6) as BuildingTypeName); return; }
    }
    if (sel.units.settler) for (const a of actionsFor(e, 'settler')) if (a === 'build.settlement') { this.startPlacement('settlement'); return; }
    if (Object.keys(sel.units).length) for (const a of actionsFor(e, 'military')) {
      if (a === 'stop' || a === 'hold' || a === 'retreat') { this.order(a); return; }
      if (a === 'patrol' || a === 'ignite') { this.startPlacement(a); return; }
      if (a === 'formation') { this.toggleFormation(); return; }
    }
    void keyFor; void buildingTypeOfKind;
  }

  setSpeed(speed: SpeedName): void { this.send({ type: 'speed', speed }); store.set({ speed }); }
  setPaused(paused: boolean): void { this.send({ type: 'pause', paused }); store.set({ paused }); }
  /** Switch test options for you (F-197); the HUD asks for confirmation first. */
  setTestOptions(mask: number): void {
    const cur = store.state.opts;
    for (const flag of [1, 2, 4, 8, 16, 32, 64]) if ((cur & flag) !== (mask & flag)) this.cmd({ type: 'testOption', flag, on: (mask & flag) !== 0 });
    store.set({ opts: mask, modified: store.state.modified || mask !== 0 });
  }
  stepSpeed(dir: number): void {
    const names = availableSpeeds(store.state.opts), i = names.indexOf(store.state.speed);
    this.setSpeed(names[Math.max(0, Math.min(names.length - 1, i + dir))]);
  }
  setOwnerOverlay(on: boolean): void {
    this.terrain.material.uniforms.uOwnerOverlay.value = on ? 1 : 0;
    this.minimap.setOwnerOverlay(on);
    store.set({ ownerOverlay: on });
  }
  jumpToStart(): void {
    const x = this.startTile % this.map.w, z = Math.floor(this.startTile / this.map.w);
    this.cam.setTarget(x + 0.5, z + 0.5);
  }

  private onResize = (): void => {
    const r = this.host.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height);
    this.cam?.resize(r.width / Math.max(1, r.height));
  };

  // ---------------------------------------------------------------- save / debug hooks

  save(): Promise<SaveData> { return this.request<SaveData>((reqId) => ({ type: 'save', reqId })); }
  dumpStats(): Promise<PlayerStats> { return this.request<PlayerStats>((reqId) => ({ type: 'dump', reqId })); }
  requestHash(): Promise<{ tick: number; hash: number }> { return this.request((reqId) => ({ type: 'hash', reqId })); }
  stallWorker(ms: number): void { this.send({ type: 'stall', ms }); }
  get snapshot(): Snapshot | null { return this.lastSnap; }
  dropoffAccepts(bt: BuildingTypeName, res: number): boolean { return !!DROPOFF[bt]?.includes(res); }

  /** Scripted camera sweep across the map; returns frame statistics. */
  sweep(seconds: number, distance = 40): Promise<{ frames: number; avgFps: number; p95Ms: number; p99Ms: number; worstMs: number }> {
    return new Promise((resolve) => {
      const times: number[] = [];
      let t = 0;
      const startDist = this.cam.distance;
      this.cam.distance = Math.min(distance, this.cam.maxDist);
      this.frameHook = (dt) => {
        t += dt;
        times.push(dt * 1000);
        const a = (t / seconds) * Math.PI * 2;
        this.cam.setTarget(this.map.w * (0.5 + 0.35 * Math.sin(a)), this.map.h * (0.5 + 0.35 * Math.sin(a * 2)));
        if (t >= seconds) {
          this.frameHook = null;
          this.cam.distance = startDist; this.cam.apply();
          const sorted = times.slice(5).sort((x, y) => x - y);
          const avg = sorted.reduce((x, y) => x + y, 0) / sorted.length;
          resolve({ frames: sorted.length, avgFps: 1000 / avg, p95Ms: sorted[Math.floor(sorted.length * 0.95)], p99Ms: sorted[Math.floor(sorted.length * 0.99)], worstMs: sorted[sorted.length - 1] });
        }
      };
    });
  }

  dispose(): void {
    this.net?.close(); this.net = null;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.worker.terminate();
    this.controls?.dispose();
    this.terrain?.dispose();
    this.nature?.dispose();
    this.units?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.minimap?.root.remove();
  }
}

/** 0 = full day, 1 = full night, with a short dusk/dawn ramp. */
export function nightness(phase: number, dayLen: number, nightTicks: number): number {
  const ramp = 120, start = dayLen - nightTicks;
  if (phase < start - ramp) return 0;
  if (phase < start) return (phase - (start - ramp)) / ramp;
  if (phase >= dayLen - ramp) return 1 - (phase - (dayLen - ramp)) / ramp;
  return 1;
}
