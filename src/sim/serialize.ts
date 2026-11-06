// Save / load (F-016). The map is regenerated from the seed (and checked against its hash);
// everything mutable is stored. Typed arrays are base64-encoded bytes.
import { Sim, type PlayerState, type SimSettings } from './sim';
import { Entities } from './entities/entities';
import type { Command } from './commands';

export const SAVE_VERSION = 5;

export interface SaveData {
  format: 'fortnight-save';
  version: number;
  settings: SimSettings;
  mapHash: number;
  tick: number;
  winner: number;
  biome: string;
  tileOwner: string;
  occ: string;
  resType: string;
  resAmount: string;
  fog: { data: string; visible: number[] }[];
  ents: ReturnType<Entities['serialize']>;
  ps: PlayerState[];
  pending: Command[];
  pathQueue: number[];
  rngAnimals: [number, number, number, number];
  rngFire: [number, number, number, number];
  burning: string;
  burningList: number[];
  trenchList: number[];
  winnerTeam: number;
  /** Phase 4b: a test option was used in this run (optional: older v4 saves lack it). */
  modified?: boolean;
  /** Phase 5 (v5): rules in play, fungus layer, fungus RNG. */
  p5?: boolean;
  fungus?: string;
  rngFungus?: [number, number, number, number];
  /** Phase 6: diplomacy state and covert RNG. */
  dip?: import('./diplomacy').DiploState;
  rngCovert?: [number, number, number, number];
  /** Data kept by the host outside the sim (bot memories). */
  extra?: unknown;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(view: ArrayBufferView): string {
  const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let out = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c = i + 2 < u8.length ? u8[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < u8.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < u8.length ? B64[c & 63] : '=');
  }
  return out;
}
function fromB64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) | (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
const i32 = (s: string): Int32Array => { const u = fromB64(s); return new Int32Array(u.buffer, 0, u.byteLength / 4); };

export function saveSim(sim: Sim): SaveData {
  return {
    format: 'fortnight-save', version: SAVE_VERSION, settings: { ...sim.settings }, mapHash: sim.map.hash, tick: sim.tick, winner: sim.winner,
    biome: toB64(sim.map.biome), tileOwner: toB64(sim.tileOwner), occ: toB64(sim.occ), resType: toB64(sim.res.type), resAmount: toB64(sim.res.amount),
    fog: sim.fog.map((f) => ({ data: toB64(f.data), visible: f.visibleTiles() })),
    ents: sim.ents.serialize(), ps: JSON.parse(JSON.stringify(sim.ps)), pending: JSON.parse(JSON.stringify(sim.pending)),
    pathQueue: sim.pathQueue.slice(), rngAnimals: sim.rngAnimals.getState(),
    rngFire: sim.rngFire.getState(), burning: toB64(sim.burning), burningList: sim.burningList.slice(), trenchList: sim.trenchList.slice(), winnerTeam: sim.winnerTeam, modified: sim.modified,
    p5: sim.p5, fungus: sim.fungus ? toB64(sim.fungus) : undefined, rngFungus: sim.rngFungus.getState(),
    dip: JSON.parse(JSON.stringify(sim.dip.st)), rngCovert: sim.rngCovert.getState(),
  };
}

export class SaveError extends Error {}

export function loadSim(d: SaveData): Sim {
  if (!d || d.format !== 'fortnight-save') throw new SaveError('Not a Fortnight save file.');
  if (d.version !== SAVE_VERSION) throw new SaveError(`This save is from a different game version (save v${d.version}, game v${SAVE_VERSION}) and can't be loaded.`);
  const sim = new Sim(d.settings, { skipSetup: true });
  if (sim.map.hash !== d.mapHash) throw new SaveError('Save does not match the generated map (different game version?).');
  sim.tick = d.tick; sim.winner = d.winner; sim.winnerTeam = d.winnerTeam; sim.modified = !!d.modified;
  sim.map.biome.set(fromB64(d.biome));
  sim.tileOwner.set(fromB64(d.tileOwner));
  sim.occ.set(i32(d.occ));
  sim.res.type.set(fromB64(d.resType));
  sim.res.amount.set(i32(d.resAmount));
  d.fog.forEach((f, p) => sim.fog[p].restore(fromB64(f.data), f.visible));
  sim.ents = Entities.deserialize(d.ents);
  d.ps.forEach((p, i) => Object.assign(sim.ps[i], JSON.parse(JSON.stringify(p))));
  sim.pending = JSON.parse(JSON.stringify(d.pending));
  sim.pathQueue = d.pathQueue.slice();
  sim.rngAnimals.setState(d.rngAnimals);
  sim.rngFire.setState(d.rngFire);
  { const u = fromB64(d.burning); sim.burning.set(new Uint16Array(u.buffer, 0, u.byteLength / 2)); }
  sim.burningList = d.burningList.slice();
  sim.trenchList = d.trenchList.slice();
  for (let p = 0; p < sim.players; p++) sim.ownedList[p] = [];
  for (let t = 0; t < sim.tileOwner.length; t++) if (sim.tileOwner[t] < sim.players) sim.ownedList[sim.tileOwner[t]].push(t);
  sim.p5 = !!d.p5;
  if (d.fungus && sim.fungus) sim.fungus.set(fromB64(d.fungus));
  if (d.rngFungus) sim.rngFungus.setState(d.rngFungus);
  if (d.dip) sim.dip.st = JSON.parse(JSON.stringify(d.dip));
  if (d.rngCovert) sim.rngCovert.setState(d.rngCovert);
  for (let p = 0; p < sim.players; p++) sim.rules.refresh(p);
  sim.ownerDirty = true;
  sim.fogForce.fill(1);
  return sim;
}
