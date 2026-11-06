// BotManager: runs the bots of a match. Each bot thinks on its own schedule (difficulty), sees the
// game only through a fresh BotView, and its commands enter the sim exactly like a player's.
// Runs in the sim worker for single-player and in Node for headless matches.
import type { Sim } from '../sim/sim';
import type { Command } from '../sim/commands';
import { Bot, type BotState } from './bot';
import { BotView, newMapMemory, type MapMemory } from './view';
import { difficultyDef, type Difficulty } from './utility';

export interface BotConfig { player: number; personality: string; difficulty: Difficulty }
export interface BotSave { state: BotState; biome: string; res: string }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const enc = (u8: Uint8Array): string => { let o = ''; for (let i = 0; i < u8.length; i += 3) { const a = u8[i], b = u8[i + 1] ?? 0, c = u8[i + 2] ?? 0; o += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < u8.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < u8.length ? B64[c & 63] : '='); } return o; };
const dec = (s: string, n: number): Uint8Array => { const out = new Uint8Array(n); const c = s.replace(/=+$/, ''); let o = 0; for (let i = 0; i < c.length; i += 4) { const v = (B64.indexOf(c[i]) << 18) | (B64.indexOf(c[i + 1]) << 12) | ((B64.indexOf(c[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(c[i + 3] ?? 'A') & 63); if (o < n) out[o++] = (v >> 16) & 255; if (o < n) out[o++] = (v >> 8) & 255; if (o < n) out[o++] = v & 255; } return out; };

export class BotManager {
  readonly bots: Bot[] = [];
  /** Total wall-clock ms spent thinking (profiling only, never affects decisions). */
  thinkMs = 0;

  constructor(private sim: Sim, configs: BotConfig[]) {
    const n = sim.map.w * sim.map.h;
    for (const c of configs) this.bots.push(Bot.create(c.player, c.personality, c.difficulty, sim.settings.seed, newMapMemory(n)));
  }

  static restore(sim: Sim, saves: BotSave[]): BotManager {
    const m = new BotManager(sim, []);
    const n = sim.map.w * sim.map.h;
    for (const sv of saves) {
      const mem: MapMemory = { biome: dec(sv.biome, n), res: dec(sv.res, n) };
      m.bots.push(new Bot(JSON.parse(JSON.stringify(sv.state)), mem));
    }
    return m;
  }

  save(): BotSave[] { return this.bots.map((b) => ({ state: JSON.parse(JSON.stringify(b.s)), biome: enc(b.mem.biome), res: enc(b.mem.res) })); }

  /** Call once per tick, before sim.step(): due bots think and queue their commands for this tick. */
  tick(): void {
    const sim = this.sim;
    if (sim.winner >= 0) return;
    for (const bot of this.bots) {
      const p = bot.s.player;
      if (p >= sim.players || sim.ps[p].eliminated) continue;
      const every = difficultyDef(bot.s.difficulty).thinkEvery;
      if ((sim.tick + p * 7) % every !== 0) continue;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const cmds = bot.think(new BotView(sim, p, bot.mem));
      if (typeof performance !== 'undefined') this.thinkMs += performance.now() - t0;
      for (const body of cmds) {
        const seq = bot.s.seq++;
        sim.enqueue({ ...body, tick: sim.tick, player: p, seq } as Command);
      }
    }
  }

  debug(): ReturnType<Bot['debug']>[] { return this.bots.map((b) => b.debug()); }
}
