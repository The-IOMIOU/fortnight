// A bot player: reads only its BotView, keeps a small serialisable memory, emits ordinary commands.
// Decisions are deterministic (own seeded RNG), so bot-only matches are reproducible and saves resume
// identically.
import { BotView, UNKNOWN, type BuildingInfo, type MapMemory, type UnitInfo } from './view';
import { difficultyDef, personality, scoreGoals, boredom, type Difficulty, type Goal, type Situation } from './utility';
import type { CommandBody } from '../sim/commands';
import { Rng } from '../sim/core/prng';
import { TUNING } from '../sim/core/tuning';
import { Biome, isWaterBiome } from '../sim/world/mapgen';
import { BUILDING_TYPES, Kind, Res, RES_NONE, Task, UNIT_TYPES, buildingDef, unitDef, type BuildingTypeName, type UnitTypeName } from '../sim/defs';

const MILITARY = new Set<number>([Kind.SPEARMAN, Kind.ARCHER, Kind.RIDER, Kind.RAM, Kind.SABOTEUR]);
const TOWN: BuildingTypeName[] = ['capital', 'settlement'];
const B = (b: BuildingTypeName): number => BUILDING_TYPES.indexOf(b);
const U = (u: UnitTypeName): number => UNIT_TYPES.indexOf(u);

export type NavalState = 'none' | 'dock' | 'ships' | 'explore' | 'board' | 'sail' | 'landed';

export interface BotState {
  player: number;
  personality: string;
  difficulty: Difficulty;
  seq: number;
  rng: [number, number, number, number];
  goal: Goal;
  scores: Record<Goal, number>;
  lastThink: number;
  /** Current attack target (enemy building id) and ids known to be unreachable over land. */
  target: number;
  overseas: number[];
  attackIssuedAt: number;
  naval: NavalState;
  navalSince: number;
  landing: number;
  exploreStep: number;
  scoutTarget: number;
  /** Metrics for tests and the debug overlay. */
  /** A remembered tile of enemy territory (seen from the coast), refreshed every 30 s; −1 if none. */
  enemyLand: number;
  /** Exploration targets already tried (skipped next time). */
  triedTargets: number[];
  /** Soldiers that sailed in an invasion (they fight on the far shore; everyone else is the home army). */
  landedIds: number[];
  /** Unload attempts at the current landing, and landing spots the ships could not reach. */
  landTries: number;
  badLandings: number[];
  /** Settlement sites a settler was sent to (a site tried 3 times without a town is skipped), and towns founded. */
  siteTries: number[];
  foundedIds: number[];
  firstAttack: number;
  settlementsFounded: number;
  defencesBuilt: number;
  lastDefenceAt: number;
}

export class Bot {
  readonly s: BotState;
  readonly mem: MapMemory;
  private rng: Rng;
  private out: CommandBody[] = [];

  constructor(state: BotState, mem: MapMemory) {
    this.s = state;
    state.landedIds ??= []; state.landTries ??= 0; state.badLandings ??= []; state.siteTries ??= []; state.foundedIds ??= []; // saves from before these fields
    this.mem = mem;
    this.rng = new Rng(0);
    this.rng.setState(state.rng);
  }

  static create(player: number, pers: string, difficulty: Difficulty, seed: string, mem: MapMemory): Bot {
    const r = Rng.stream(seed, 'bot-' + player);
    const st: BotState = {
      player, personality: pers, difficulty, seq: 0, rng: r.getState(), goal: 'economy',
      scores: { economy: 0, expand: 0, defense: 0, attack: 0, raid: 0, diplomacy: 0 }, lastThink: -1,
      target: -1, overseas: [], attackIssuedAt: -1, naval: 'none', navalSince: 0, landing: -1, exploreStep: 0, scoutTarget: -1,
      enemyLand: -1, triedTargets: [], landedIds: [], landTries: 0, badLandings: [], siteTries: [], foundedIds: [], firstAttack: -1, settlementsFounded: 0, defencesBuilt: 0, lastDefenceAt: -100000,
    };
    return new Bot(st, mem);
  }

  private get diff() { return difficultyDef(this.s.difficulty); }
  private chance(): boolean { return this.rng.int(100) < this.diff.actionChancePct; }
  private cmd(c: CommandBody): void { this.out.push(c); }

  // ------------------------------------------------------------------ geometry helpers

  private dist(a: number, b: number, w: number): number { return Math.max(Math.abs((a % w) - (b % w)), Math.abs(Math.floor(a / w) - Math.floor(b / w))); }

  /** Ring search for a placement near a tile, using only the bot's knowledge. */
  private spotNear(v: BotView, bt: BuildingTypeName, near: number, minR: number, maxR: number, ok?: (t: number) => boolean): number {
    const w = v.w, x0 = near % w, y0 = Math.floor(near / w);
    for (let r = minR; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= v.h - 1) continue;
      const t = y * w + x;
      if (v.canPlace(bt, t) && (!ok || ok(t))) return t;
    }
    return -1;
  }

  /** True if a building of `size` at `anchor` touches remembered ocean (a lake dock can't reach anyone). */
  private touchesOcean(anchor: number, size: number, w: number, h: number): boolean {
    const ax = anchor % w, ay = (anchor - ax) / w;
    for (let dy = -1; dy <= size; dy++) for (let dx = -1; dx <= size; dx++) {
      const x = ax + dx, y = ay + dy;
      if (x >= 0 && y >= 0 && x < w && y < h && this.mem.biome[y * w + x] === Biome.OCEAN) return true;
    }
    return false;
  }

  /** Nearest remembered tile with resource `type` around `near`. */
  private nearestRes(v: BotView, type: number, near: number, maxR: number): number {
    const w = v.w, x0 = near % w, y0 = Math.floor(near / w);
    for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= v.h) continue;
      const t = y * w + x;
      if (this.mem.res[t] === type) return t;
    }
    return -1;
  }

  // ------------------------------------------------------------------ think

  think(v: BotView): CommandBody[] {
    this.out = [];
    const s = this.s, w = v.w, d = this.diff, pers = personality(s.personality);
    s.lastThink = v.tick;
    const towns = v.myBuildings.filter((b) => TOWN.includes(b.btype) && b.complete);
    const capital = towns.find((b) => b.btype === 'capital') ?? towns[0];
    if (!capital) { this.saveRng(); return this.out; }
    const home = capital.anchor + Math.floor(capital.size / 2) * (w + 1);
    const units = v.myUnits.filter((u) => u.carrier < 0);
    const workers = units.filter((u) => u.kind === Kind.WORKER);
    const army = units.filter((u) => MILITARY.has(u.kind));
    const settlers = units.filter((u) => u.kind === Kind.SETTLER);
    const scouts = units.filter((u) => u.kind === Kind.SCOUT);
    const transports = v.myUnits.filter((u) => u.kind === Kind.TRANSPORT);
    const st = v.stats, stock = st.stock;
    const has = (bt: BuildingTypeName, complete = true) => v.myBuildings.filter((b) => b.btype === bt && (!complete || b.complete));
    const building = (bt: BuildingTypeName) => v.myBuildings.some((b) => b.btype === bt && !b.complete);
    const minutes = v.tick / 600;

    // ---- what do we know about enemies?
    if (v.tick % 300 < this.diff.thinkEvery || (s.enemyLand >= 0 && !(v.owner(s.enemyLand) >= 0 && v.owner(s.enemyLand) !== 255 && !v.isAlly(v.owner(s.enemyLand))))) s.enemyLand = this.findEnemyLand(v, home);
    const enemyTowns = v.enemyBuildings.filter((b) => TOWN.includes(b.btype));
    s.overseas = s.overseas.filter((id) => v.enemyBuildings.some((b) => b.id === id));
    const landTowns = enemyTowns.filter((b) => !s.overseas.includes(b.id));
    const seaTowns = enemyTowns.filter((b) => s.overseas.includes(b.id));
    const myTiles = (t: number) => v.owner(t) === v.player;
    const nearMine = (t: number, r: number) => v.myBuildings.some((b) => this.dist(b.anchor, t, w) <= r);
    const enemySoldiers = v.enemyUnits.filter((u) => MILITARY.has(u.kind));
    const intruders = enemySoldiers.filter((u) => myTiles(u.tile) || nearMine(u.tile, 6));
    const threat = enemySoldiers.filter((u) => nearMine(u.tile, TUNING.bots.threatRadius)).reduce((a, u) => a + u.hp / 10, 0);
    const soft = v.enemyUnits.filter((u) => u.kind === Kind.WORKER).length + v.enemyBuildings.filter((b) => b.btype === 'farm' || b.btype === 'house' || b.btype === 'lumberCamp' || b.btype === 'mineCamp').length;
    for (const b of v.myBuildings) if (b.btype === 'settlement' && !this.s.foundedIds.includes(b.id)) this.s.foundedIds.push(b.id);
    this.s.settlementsFounded = this.s.foundedIds.length;
    const sites = this.settlementSites(v, home, enemyTowns, towns).filter((t) => this.s.siteTries.filter((q) => this.dist(q, t, v.w) <= 2).length < 3);

    const sit: Situation = {
      minutes, workers: workers.length, idleWorkers: workers.filter((u) => u.task === Task.IDLE).length,
      workerTarget: d.workerTarget, pop: st.pop, housing: st.housing, foodBalance: st.foodBalancePerMin,
      towns: towns.length, maxTowns: d.maxTowns, settlers: settlers.length, expansionSites: sites.length,
      army: army.length, armyStrength: st.army, attackSize: Math.round(d.armyAttackSize * pers.armyFactor),
      threat, intruders: intruders.length, enemyTownsLand: landTowns.length, enemyTownsSea: seaTowns.length, softTargets: soft,
      barracks: has('barracks').length,
    };
    const { goal, scores } = scoreGoals(sit, pers);
    s.goal = goal; s.scores = scores;

    // ---- 1. defend: soldiers attack intruders first
    if (intruders.length) {
      const free = army.filter((u) => u.task !== Task.ATTACK || u.hp < u.maxHp);
      if (free.length) this.cmd({ type: 'attack', ids: free.map((u) => u.id), target: this.nearest(intruders, home, w).id });
    }
    // an invasion waiting for transports gets first call on wood (houses and soldiers otherwise eat it all)
    const shipWood = (s.naval === 'ships' || s.naval === 'board' || s.naval === 'dock') && transports.length < 2 ? 130 : 0;
    const spend = shipWood ? stock.map((x, i) => (i === Res.WOOD ? Math.max(0, x - shipWood) : x)) : stock;
    // ---- 2. economy, always
    this.economy(v, home, capital, workers, units, spend, goal === 'economy');
    // ---- 3. military production when it matters
    const wantArmy = goal === 'attack' || goal === 'defense' || goal === 'raid' || threat > 0 || boredom(minutes) > 0.2;
    if (wantArmy && this.chance()) this.militaryProduction(v, home, workers, army, spend, pers);
    // ---- 4. goal-specific
    if (goal === 'expand' && this.chance()) this.expand(v, capital, settlers, sites, stock, st.pop, st.housing);
    if (goal === 'defense' && d.useDefences && pers.defences >= 0.5 && this.chance()) this.fortify(v, home, workers, spend);
    if (s.naval !== 'none' && !intruders.length) {
      // an overseas campaign keeps going whatever today's goal is
      this.campaign(v, home, army.filter((u) => u.kind !== Kind.WARSHIP), enemyTowns, seaTowns, workers, transports, stock, sit.attackSize);
    } else if ((goal === 'attack' || goal === 'raid') && !intruders.length) {
      if (d.retreatWounded) for (const u of army) if (u.hp * 100 < u.maxHp * 30 && u.task === Task.ATTACK) this.cmd({ type: 'retreat', ids: [u.id] });
      if (!(goal === 'raid' && soft > 0 && this.raid(v, army, home))) this.attack(v, home, army, landTowns, seaTowns, enemyTowns, workers, transports, stock, sit.attackSize, scouts);
    } else if (!intruders.length && scouts.length) this.explore(v, scouts, home);
    // spare settlers always try to settle
    if (goal !== 'expand' && settlers.some((u) => u.task === Task.IDLE)) this.expand(v, capital, settlers, sites, stock, st.pop, st.housing);
    this.saveRng();
    return this.out;
  }

  private saveRng(): void { this.s.rng = this.rng.getState(); }
  private nearest<T extends { tile: number }>(list: T[], from: number, w: number): T {
    let best = list[0], bd = 1e9;
    for (const x of list) { const dd = this.dist(x.tile, from, w); if (dd < bd) { bd = dd; best = x; } }
    return best;
  }

  // ------------------------------------------------------------------ economy

  private economy(v: BotView, home: number, capital: BuildingInfo, workers: UnitInfo[], units: UnitInfo[], stock: number[], focus: boolean): void {
    const w = v.w, d = this.diff, st = v.stats;
    const target = d.workerTarget + (focus ? 4 : 0);
    // train workers
    const savingForSettler = this.s.goal === 'expand' && !v.myUnits.some((u) => u.kind === Kind.SETTLER) && stock[Res.FOOD] < 160;
    if (workers.length < target && capital.queue < 2 && stock[Res.FOOD] >= (savingForSettler ? 200 : 60) && st.pop < st.housing && this.chance()) this.cmd({ type: 'train', building: capital.id, utype: U('worker') });
    // houses
    if (st.housing - st.pop <= 3 && !v.myBuildings.some((b) => b.btype === 'house' && !b.complete) && stock[Res.WOOD] >= 40 && workers.length) {
      const t = this.spotNear(v, 'house', home, 3, 9);
      if (t >= 0) this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w)], btype: B('house'), tile: t });
    }
    // food: enough farm workers to feed everyone with a margin, more while raising an army
    const farms = v.myBuildings.filter((b) => b.btype === 'farm');
    const upkeep = st.pop * TUNING.economy.foodPerPopPerMin;
    const growth = workers.length < target ? 25 : 0, war = this.s.goal === 'attack' || this.s.goal === 'defense' || this.s.goal === 'raid' ? 30 : 10;
    const surplus = stock[Res.WOOD] > 600 ? 20 + Math.min(40, Math.floor((stock[Res.WOOD] - 600) / 100) * 5) : 0; // turn a wood glut into food
    const foodWorkers = units.filter((u) => u.task === Task.WORK || u.task === Task.HUNT).length;
    let foodNeed = Math.ceil(((upkeep + growth + war + surplus) * 100) / (TUNING.economy.farmFoodPerWorkerPerMin * 85));
    // poor farmland: if food stays short and income barely covers upkeep, keep adding food workers
    if (stock[Res.FOOD] < 100 && st.foodIncomePerMin < upkeep + 30) foodNeed = Math.max(foodNeed, foodWorkers + 2);
    const slots = farms.length * 2 + v.myBuildings.filter((b) => b.btype === 'fishingHut').length * 3;
    const pendingFarms = farms.filter((b) => !b.complete).length;
    if (slots < foodNeed && pendingFarms < 2 && stock[Res.WOOD] >= 60 && workers.length > 2 && this.chance()) {
      // farmland around the capital first, then around each settlement; no farmland left: fish instead
      const towns = [home, ...v.myBuildings.filter((b) => b.btype === 'settlement' && b.complete).map((b) => b.anchor)];
      let t = -1, bt: BuildingTypeName = 'farm';
      for (const c of towns) { t = this.spotNear(v, 'farm', c, 3, 12); if (t >= 0) break; }
      if (t < 0) { bt = 'fishingHut'; for (const c of towns) { t = this.spotNear(v, 'fishingHut', c, 2, 12); if (t >= 0) break; } }
      if (t >= 0) this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w)], btype: B(bt), tile: t });
    }
    // unfinished buildings nobody is working on get the nearest available worker
    for (const b of v.myBuildings) {
      if (b.complete || b.btype === 'settlement' || units.some((u) => u.task === Task.BUILD && u.target === b.id)) continue;
      const free = workers.filter((u) => u.task !== Task.BUILD && u.task !== Task.WORK);
      if (!free.length) break;
      const pick = this.nearest(free, b.anchor, w);
      workers.splice(workers.indexOf(pick), 1);
      this.cmd({ type: 'interact', ids: [pick.id], target: b.id });
    }
    // idle workers: food first, then a wood/stone/gold mix
    const idle = workers.filter((u) => u.task === Task.IDLE);
    let foodShort = Math.max(0, foodNeed - foodWorkers);
    const huts = v.myBuildings.filter((b) => b.btype === 'fishingHut' && b.complete);
    const freeFarm = [...farms.filter((b) => b.complete), ...huts].map((b) => ({ b, room: (b.btype === 'farm' ? 2 : 3) - units.filter((u) => u.task === Task.WORK && u.target === b.id).length }));
    // not enough idle hands: move up to 2 gatherers per think onto farms with room
    if (foodShort > idle.length) {
      let moved = 0;
      for (const f of freeFarm) while (f.room > 0 && moved < 2 && foodShort > idle.length) {
        const g = workers.filter((u) => u.task === Task.GATHER || u.task === Task.RETURN);
        if (!g.length) break;
        const pick = this.nearest(g, f.b.anchor, w);
        workers.splice(workers.indexOf(pick), 1);
        this.cmd({ type: 'interact', ids: [pick.id], target: f.b.id });
        f.room--; foodShort--; moved++;
      }
    }
    // rebalance: a glut of stone or gold while wood runs short moves up to 2 of those gatherers to wood
    if (stock[Res.WOOD] < 200) {
      let moved = 0;
      for (const r of [Res.STONE, Res.GOLD]) {
        if (stock[r] < (stock[Res.WOOD] < 80 ? 120 : 300)) continue;
        for (const u of workers.filter((x) => x.task === Task.GATHER && x.carryRes === r)) {
          if (moved >= 2) break;
          const t = this.nearestRes(v, Res.WOOD, u.tile, 18) >= 0 ? this.nearestRes(v, Res.WOOD, u.tile, 18) : this.nearestRes(v, Res.WOOD, home, 45);
          if (t < 0) break;
          workers.splice(workers.indexOf(u), 1);
          this.cmd({ type: 'gather', ids: [u.id], tile: t }); moved++;
        }
      }
    }
    const gatherers = (r: number) => workers.filter((x) => (x.task === Task.GATHER || x.task === Task.RETURN) && x.carryRes === r).length;
    let woodAssigned = gatherers(Res.WOOD), stoneAssigned = gatherers(Res.STONE), goldAssigned = gatherers(Res.GOLD);
    for (const u of idle) {
      if (foodShort > 0) {
        const f = freeFarm.find((x) => x.room > 0);
        if (f) { f.room--; foodShort--; this.cmd({ type: 'interact', ids: [u.id], target: f.b.id }); continue; }
        const a = v.animals.filter((x) => this.dist(x.tile, home, w) < 14);
        if (a.length) { foodShort--; this.cmd({ type: 'interact', ids: [u.id], target: this.nearest(a, u.tile, w).id }); continue; }
      }
      const woodRich = stock[Res.WOOD] > 500;
      // wood first (houses, farms, barracks); stone and gold by deficit once 2+ workers cut wood
      const woodOk = woodAssigned >= 2 || woodRich;
      const wantStone = woodOk && stock[Res.STONE] < 250 && stoneAssigned < (woodRich ? 3 : 2), wantGold = woodOk && stock[Res.GOLD] < 200 && goldAssigned < (woodRich ? 2 : 1) && v.tick > 4000;
      const type = wantStone && stoneAssigned <= goldAssigned ? Res.STONE : wantGold ? Res.GOLD : wantStone ? Res.STONE : Res.WOOD;
      let t = this.nearestRes(v, type, u.tile, 18);
      if (t < 0 && type !== Res.WOOD) t = this.nearestRes(v, Res.WOOD, u.tile, 18);
      if (t < 0) t = this.nearestRes(v, Res.WOOD, home, 45); // forest-poor start: walk further for wood
      if (t < 0 && type === Res.WOOD) t = this.nearestRes(v, Res.STONE, u.tile, 18);
      if (t < 0) continue;
      if (type === Res.STONE) stoneAssigned++;
      if (type === Res.WOOD) woodAssigned++;
      if (type === Res.GOLD) goldAssigned++;
      this.cmd({ type: 'gather', ids: [u.id], tile: t });
    }
    // drop-off camps near far resources (inside our territory)
    if (workers.length >= 6 && v.tick % 300 < this.diff.thinkEvery && this.chance()) {
      for (const [type, bt] of [[Res.WOOD, 'lumberCamp'], [Res.STONE, 'mineCamp']] as const) {
        const r = this.nearestRes(v, type, home, type === Res.WOOD ? 30 : 16);
        if (r < 0 || this.dist(r, home, w) < 7) continue;
        if (v.myBuildings.some((b) => (b.btype === bt || b.btype === 'storehouse') && this.dist(b.anchor, r, w) <= 5)) continue;
        const def = buildingDef(bt);
        if (stock[Res.WOOD] < def.wood + 20) continue;
        const t = this.spotNear(v, bt, r, 1, 4);
        if (t >= 0) { this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w)], btype: B(bt), tile: t }); break; }
        // forest outside our land: push the border towards it with an outpost (one at a time)
        if (type === Res.WOOD && !v.myBuildings.some((b) => b.btype === 'outpost' && !b.complete) && stock[Res.WOOD] >= 60 && stock[Res.STONE] >= 40) {
          const d = this.dist(r, home, w), hx = home % w, hy = (home - hx) / w, rx = r % w, ry = (r - rx) / w;
          let o = -1;
          for (let k = Math.min(d - 2, 13); k >= 6 && o < 0; k--) o = this.spotNear(v, 'outpost', Math.round(hy + ((ry - hy) * k) / d) * w + Math.round(hx + ((rx - hx) * k) / d), 0, 2, (q) => v.owner(q) === 255);
          if (o >= 0) { this.cmd({ type: 'place', ids: [this.pickWorker(workers, o, w)], btype: B('outpost'), tile: o }); break; }
        }
      }
    }
    // better farms (+yield) once wood and stone pile up
    if (stock[Res.WOOD] >= 120 && stock[Res.STONE] >= 80) {
      const f = farms.find((x) => x.complete && x.level < 2 && !x.upgrading);
      if (f) this.cmd({ type: 'upgrade', building: f.id });
    }
    // upgrade the capital once rich
    if (focus && capital.level < 3 && !capital.upgrading && stock[Res.WOOD] >= 350 && stock[Res.STONE] >= 300 && stock[Res.GOLD] >= 100) this.cmd({ type: 'upgrade', building: capital.id });
  }

  private pickWorker(workers: UnitInfo[], near: number, w: number): number {
    const free = workers.filter((u) => u.task !== Task.BUILD);
    return this.nearest(free.length ? free : workers, near, w).id;
  }

  // ------------------------------------------------------------------ expansion

  private settlementSites(v: BotView, home: number, enemyTowns: BuildingInfo[], towns: BuildingInfo[]): number[] {
    if (v.tick % 100 >= this.diff.thinkEvery && this.s.goal !== 'expand') return [];
    const w = v.w, out: number[] = [];
    const minD = TUNING.economy.settlementMinDistance + 2;
    const all = [...towns, ...enemyTowns];
    for (let r = 12; r <= 34 && out.length < 3; r += 2) for (let k = 0; k < 16 && out.length < 3; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round((home % w) + Math.cos(a) * r), y = Math.round(Math.floor(home / w) + Math.sin(a) * r);
      if (x < 2 || y < 2 || x >= w - 3 || y >= v.h - 3) continue;
      const t = y * w + x;
      if (!v.canPlace('settlement', t)) continue;
      if (all.some((b) => this.dist(b.anchor, t, w) < minD)) continue;
      out.push(t);
    }
    return out;
  }

  private expand(v: BotView, capital: BuildingInfo, settlers: UnitInfo[], sites: number[], stock: number[], pop: number, housing: number): void {
    if (!settlers.length) {
      if (capital.queue < 1 && stock[Res.FOOD] >= 140 && stock[Res.WOOD] >= 70 && pop + 2 <= housing && sites.length) this.cmd({ type: 'train', building: capital.id, utype: U('settler') });
      return;
    }
    const s = settlers.find((u) => u.task === Task.IDLE);
    if (!s || !sites.length) return;
    this.cmd({ type: 'place', ids: [s.id], btype: B('settlement'), tile: sites[0] });
    this.s.siteTries.push(sites[0]);
    if (this.s.siteTries.length > 60) this.s.siteTries.shift();
  }

  // ------------------------------------------------------------------ military

  private militaryProduction(v: BotView, home: number, workers: UnitInfo[], army: UnitInfo[], stock: number[], pers: ReturnType<typeof personality>): void {
    const w = v.w, d = this.diff;
    const barracks = v.myBuildings.filter((b) => b.btype === 'barracks');
    if (barracks.length < d.maxBarracks && !barracks.some((b) => !b.complete) && stock[Res.WOOD] >= 130 && stock[Res.STONE] >= 30 && workers.length >= 6) {
      const t = this.spotNear(v, 'barracks', home, 4, 12);
      if (t >= 0) this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w)], btype: B('barracks'), tile: t });
    }
    const st = v.stats;
    const reserve = this.s.naval !== 'none' && this.s.naval !== 'landed' ? 3 : 0; // keep room for transports
    for (const b of barracks.filter((x) => x.complete && x.queue < 2)) {
      if (st.pop + 1 + reserve > st.housing || stock[Res.FOOD] < 110) break;
      const roll = this.rng.int(100);
      let u: UnitTypeName = 'spearman';
      if (roll < pers.riders * 100 && stock[Res.GOLD] >= 40 && stock[Res.FOOD] >= 80) u = 'rider';
      else if (roll < (pers.riders + pers.archers) * 100 && stock[Res.WOOD] >= 45) u = 'archer';
      const ud = unitDef(u);
      if (stock[Res.FOOD] < ud.food || stock[Res.WOOD] < ud.wood || stock[Res.GOLD] < ud.gold) continue;
      this.cmd({ type: 'train', building: b.id, utype: U(u) });
    }
    if ((this.s.goal === 'attack' || this.s.naval !== 'none' || this.s.firstAttack >= 0) && barracks.some((b) => b.complete) && !v.myBuildings.some((b) => b.btype === 'workshop') && stock[Res.WOOD] >= 180 && stock[Res.STONE] >= 70 && workers.length >= 8) {
      const t = this.spotNear(v, 'workshop', home, 4, 12);
      if (t >= 0) this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w)], btype: B('workshop'), tile: t });
    }
    // rams for walls: one per few soldiers once a workshop exists
    const ws = v.myBuildings.find((b) => b.btype === 'workshop' && b.complete);
    if (ws && ws.queue === 0 && stock[Res.WOOD] >= 140 && army.filter((u) => u.kind === Kind.RAM).length < 1 + Math.floor(army.length / 6)) this.cmd({ type: 'train', building: ws.id, utype: U('ram') });
    // gather idle soldiers just in front of home
    const idle = army.filter((u) => u.task === Task.IDLE && this.dist(u.tile, home, w) > 6);
    if (idle.length >= 3) { const [x, y] = BotView.fp(home + 3 * w + 2, w); this.cmd({ type: 'move', ids: idle.map((u) => u.id), x, y }); }
  }

  private fortify(v: BotView, home: number, workers: UnitInfo[], stock: number[]): void {
    const w = v.w;
    if (v.tick - this.s.lastDefenceAt < 1800 || workers.length < 6) return;
    if (stock[Res.STONE] >= 70 && stock[Res.WOOD] >= 50) {
      const t = this.spotNear(v, 'tower', home, 5, 9);
      if (t >= 0) { this.cmd({ type: 'placeLine', ids: [this.pickWorker(workers, t, w)], btype: B('tower'), tiles: [t] }); this.s.defencesBuilt++; this.s.lastDefenceAt = v.tick; return; }
    }
    if (stock[Res.STONE] >= 50) {
      // a short wall across the most open side: 5 tiles, 7 tiles from home towards the nearest known enemy (or south)
      const enemy = v.enemyBuildings[0];
      const ex = enemy ? Math.sign((enemy.anchor % w) - (home % w)) : 0, ey = enemy ? Math.sign(Math.floor(enemy.anchor / w) - Math.floor(home / w)) : 1;
      const cx = (home % w) + ex * 7, cy = Math.floor(home / w) + ey * 7;
      const tiles: number[] = [];
      for (let k = -2; k <= 2; k++) { const x = ey !== 0 ? cx + k : cx, y = ey !== 0 ? cy : cy + k; const t = y * w + x; if (v.canPlace('wall', t)) tiles.push(t); }
      if (tiles.length >= 3) { this.cmd({ type: 'placeLine', ids: [this.pickWorker(workers, tiles[0], w)], btype: B('wall'), tiles }); this.s.defencesBuilt++; this.s.lastDefenceAt = v.tick; }
    }
  }

  private explore(v: BotView, scouts: UnitInfo[], home: number): void {
    const w = v.w, sc = scouts[0];
    if (sc.task !== Task.IDLE) return;
    // nearest remembered-land tile that borders unknown ground
    const x0 = sc.tile % w, y0 = Math.floor(sc.tile / w);
    for (let r = 4; r < Math.max(w, v.h); r += 2) for (let k = 0; k < 24; k++) {
      const a = ((k + this.s.exploreStep) / 24) * Math.PI * 2;
      const x = Math.round(x0 + Math.cos(a) * r), y = Math.round(y0 + Math.sin(a) * r);
      if (x < 1 || y < 1 || x >= w - 1 || y >= v.h - 1) continue;
      const t = y * w + x;
      if (this.mem.biome[t] !== UNKNOWN) continue;
      const nb = [t - 1, t + 1, t - w, t + w].find((q) => { const b = this.mem.biome[q]; return b !== UNKNOWN && (!isWaterBiome(b) || b === Biome.RIVER); });
      if (nb === undefined) continue;
      this.s.exploreStep = (this.s.exploreStep + 5) % 24;
      const [fx, fy] = BotView.fp(t, w);
      this.cmd({ type: 'move', ids: [sc.id], x: fx, y: fy });
      return;
    }
    void home;
  }

  /** Returns false when there is nothing reachable to raid (the caller then attacks instead). */
  private raid(v: BotView, army: UnitInfo[], home: number): boolean {
    const w = v.w;
    const fast = army.filter((u) => u.kind === Kind.RIDER && u.task !== Task.ATTACK);
    const group = (fast.length >= 2 ? fast : army.filter((u) => u.task === Task.IDLE)).slice(0, 5);
    if (group.length < 2) return false;
    const targets: { id: number; tile: number }[] = [
      ...v.enemyUnits.filter((u) => u.kind === Kind.WORKER),
      ...v.enemyBuildings.filter((b) => b.btype === 'farm' || b.btype === 'house' || b.btype === 'lumberCamp' || b.btype === 'mineCamp').map((b) => ({ id: b.id, tile: b.anchor })),
    ].filter((t) => !this.s.overseas.includes(t.id) && this.dist(t.tile, home, w) <= 45);
    if (!targets.length) return false;
    const t = this.nearest(targets, home, w);
    this.cmd({ type: 'attack', ids: group.map((u) => u.id), target: t.id });
    if (this.s.firstAttack < 0) this.s.firstAttack = v.tick;
    return true;
  }

  private attack(v: BotView, home: number, army: UnitInfo[], landTowns: BuildingInfo[], seaTowns: BuildingInfo[], allTowns: BuildingInfo[],
    workers: UnitInfo[], transports: UnitInfo[], stock: number[], attackSize: number, scouts: UnitInfo[]): void {
    const s = this.s, w = v.w;
    const land = army.filter((u) => u.kind !== Kind.WARSHIP);
    // feedback: an attack order whose soldiers all gave up means the target is across water
    if (s.target >= 0 && s.attackIssuedAt >= 0 && v.tick - s.attackIssuedAt > 60 && s.naval === 'none') {
      const tb = v.enemyBuildings.find((b) => b.id === s.target);
      const gaveUp = !land.some((u) => u.task === Task.ATTACK);
      const nobodyClose = v.tick - s.attackIssuedAt > 400 && tb !== undefined && !land.some((u) => this.dist(u.tile, tb.anchor, w) <= 15);
      if (tb && (gaveUp || nobodyClose) && !s.overseas.includes(s.target)) { s.overseas.push(s.target); s.attackIssuedAt = -1; }
    }
    if (landTowns.length) {
      if (land.length < attackSize) return;
      const tgt = this.nearestBuilding(landTowns, land.length ? land[0].tile : home, w);
      // walls and towers in the way: send rams at them; everyone else at the town
      if (s.target !== tgt.id || v.tick - s.attackIssuedAt > 200) {
        s.target = tgt.id; s.attackIssuedAt = v.tick;
        if (s.firstAttack < 0) s.firstAttack = v.tick;
        const ids = land.map((u) => u.id);
        if (ids.length) this.cmd({ type: 'attack', ids, target: tgt.id });
      }
      return;
    }
    // no land target: go by sea if we know an overseas town or enemy land, or have explored our continent
    // no enemy found on our land by minute 12 (or already seen overseas): go by sea
    if (seaTowns.length || s.enemyLand >= 0 || v.tick > 7200 || (scouts.length && scouts[0].task === Task.IDLE && this.landExplored(v, home))) { s.naval = 'dock'; s.navalSince = v.tick; return; }
    if (scouts.length) this.explore(v, scouts, home);
    else if (land.length && v.tick % 600 < this.diff.thinkEvery) this.explore(v, land.slice(0, 1), home);
  }

  private nearestBuilding(list: BuildingInfo[], from: number, w: number): BuildingInfo {
    let best = list[0], bd = 1e9;
    for (const b of list) { const dd = this.dist(b.anchor, from, w); if (dd < bd) { bd = dd; best = b; } }
    return best;
  }

  /** True when no remembered land tile near home borders unknown ground (our continent is mapped). */
  private landExplored(v: BotView, home: number): boolean {
    const w = v.w, x0 = home % w, y0 = Math.floor(home / w);
    for (let r = 4; r < 40; r += 3) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = Math.round(x0 + Math.cos(a) * r), y = Math.round(y0 + Math.sin(a) * r);
      if (x < 1 || y < 1 || x >= w - 1 || y >= v.h - 1) continue;
      const t = y * w + x, b = this.mem.biome[t];
      if (b === UNKNOWN && [t - 1, t + 1, t - w, t + w].some((q) => { const c = this.mem.biome[q]; return c !== UNKNOWN && !isWaterBiome(c); })) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ naval invasion

  /** Overseas campaign: run the naval state machine; landed troops fight; new waves follow. */
  private campaign(v: BotView, home: number, land: UnitInfo[], allTowns: BuildingInfo[], seaTowns: BuildingInfo[], workers: UnitInfo[], transports: UnitInfo[], stock: number[], attackSize: number): void {
    const s = this.s, w = v.w;
    s.landedIds = s.landedIds.filter((id) => land.some((u) => u.id === id));
    const ashore = land.filter((u) => u.carrier < 0 && s.landedIds.includes(u.id));
    // troops already on enemy soil: hit the nearest town, else march into their land
    if (ashore.length) {
      if (allTowns.length) {
        const tgt = this.nearestBuilding(allTowns, ashore[0].tile, w);
        if (s.target !== tgt.id || v.tick - s.attackIssuedAt > 200) { s.target = tgt.id; s.attackIssuedAt = v.tick; if (s.firstAttack < 0) s.firstAttack = v.tick; this.cmd({ type: 'attack', ids: ashore.map((u) => u.id), target: tgt.id }); }
      } else if (s.enemyLand >= 0 && ashore.every((u) => u.task === Task.IDLE)) {
        const [x, y] = BotView.fp(s.enemyLand, w);
        this.cmd({ type: 'move', ids: ashore.map((u) => u.id), x, y });
      }
    }
    if (s.naval === 'landed') {
      // send the next wave once enough soldiers wait at home
      const homeArmy = land.length - ashore.length;
      if (homeArmy >= Math.max(5, Math.round(attackSize * 0.6))) { s.naval = 'board'; s.navalSince = v.tick; }
      return;
    }
    const landTowns = allTowns.filter((b) => !s.overseas.includes(b.id));
    if (landTowns.length && (s.naval === 'dock' || s.naval === 'ships' || s.naval === 'explore')) { s.naval = 'none'; return; } // reachable on foot after all
    this.naval(v, home, land.filter((u) => !ashore.includes(u)), (seaTowns.length ? seaTowns : allTowns).map((b) => b.anchor), workers, transports, stock, attackSize);
  }


  private naval(v: BotView, home: number, land: UnitInfo[], townTiles: number[], workers: UnitInfo[], transports: UnitInfo[], stock: number[], attackSize: number): void {
    const s = this.s, w = v.w;
    transports = transports.filter((t) => this.mem.biome[t.tile] !== Biome.LAKE); // lake boats can't invade
    const targets = townTiles.length ? townTiles : s.enemyLand >= 0 ? [s.enemyLand] : [];
    const dock = v.myBuildings.find((b) => b.btype === 'dock' && this.touchesOcean(b.anchor, b.size, w, v.h));
    const since = v.tick - s.navalSince;
    const advance = (n: NavalState) => { s.naval = n; s.navalSince = v.tick; };
    switch (s.naval) {
      case 'dock':
        if (dock) { advance('ships'); return; }
        if (stock[Res.WOOD] < 130 || !workers.length) return;
        {
          const t = this.spotNear(v, 'dock', home, 2, 20, (q) => this.touchesOcean(q, buildingDef('dock').size, w, v.h));
          if (t >= 0) { this.cmd({ type: 'place', ids: [this.pickWorker(workers, t, w), this.pickWorker(workers, t + 1, w)], btype: B('dock'), tile: t }); return; }
          // our land doesn't reach the sea yet: push the border towards the nearest known coast with an outpost
          if (!v.myBuildings.some((b) => b.btype === 'outpost' && !b.complete) && stock[Res.WOOD] >= 40 && stock[Res.STONE] >= 40) {
            const o = this.coastOutpost(v, home);
            if (o >= 0) this.cmd({ type: 'place', ids: [this.pickWorker(workers, o, w)], btype: B('outpost'), tile: o });
            else if (since > 3000) advance('none');
          }
        }
        return;
      case 'ships':
        if (!dock) { if (since > 1500) advance('dock'); return; }
        if (!dock.complete) return;
        if (transports.length < 2) { if (dock.queue === 0 && stock[Res.WOOD] >= 100) this.cmd({ type: 'train', building: dock.id, utype: U('transport') }); return; }
        advance(targets.length ? 'board' : 'explore');
        return;
        return;
      case 'explore': {
        if (targets.length) { advance('board'); return; }
        const ship = transports[0];
        if (!ship) { advance('ships'); return; }
        if (ship.task === Task.IDLE || since > 900) {
          // frontier exploration: sail towards the nearest never-seen tile we haven't already tried;
          // fall back to a loop just inside the ocean border, then an inner ring
          let goal = -1, gd = 1e9;
          for (let t = 0; t < w * v.h; t += 3) {
            if (this.mem.biome[t] !== UNKNOWN || s.triedTargets.some((q) => this.dist(q, t, w) < 6)) continue;
            if (![t - 3, t + 3, t - 3 * w, t + 3 * w].some((q) => q >= 0 && q < w * v.h && this.mem.biome[q] === Biome.OCEAN)) continue; // sea frontier only
            const d = this.dist(t, ship.tile, w);
            if (d < gd) { gd = d; goal = t; }
          }
          if (goal < 0) { const [x, y] = this.exploreWaypoint(s.exploreStep, w, v.h); s.exploreStep = (s.exploreStep + 1) % 24; goal = y * w + x; }
          s.triedTargets.push(goal);
          if (s.triedTargets.length > 40) s.triedTargets.shift();
          const [fx, fy] = BotView.fp(goal, w);
          this.cmd({ type: 'move', ids: [ship.id], x: fx, y: fy });
          s.navalSince = v.tick;
        }
        return;
      }
      case 'board': {
        if (!transports.length) { advance('ships'); return; }
        // more hulls for a bigger army (each carries 8 housing)
        const armyPop = land.reduce((a, u) => a + unitDef(UNIT_TYPES[u.kind - 1]).pop, 0);
        if (dock && dock.complete && dock.queue === 0 && transports.length < Math.min(5, Math.ceil(armyPop / 8)) && stock[Res.WOOD] >= 100) this.cmd({ type: 'train', building: dock.id, utype: U('transport') });
        const tgtTile = targets.length ? targets[0] : -1;
        const defenders = this.diff.sizeWaves && tgtTile >= 0 ? v.enemyUnits.filter((u) => MILITARY.has(u.kind) && this.dist(u.tile, tgtTile, w) <= 12).length : 0;
        const need = Math.max(6, attackSize, Math.ceil(defenders * 1.3));
        if (land.length < need && since < 4800) return;
        const loaded = v.myUnits.filter((u) => u.carrier >= 0 && MILITARY.has(u.kind)).length;
        const ashore = land.filter((u) => u.carrier < 0 && u.task !== Task.BOARD);
        // ships come home to the dock, soldiers gather there, then board
        if (dock) {
          const far = transports.filter((t) => this.dist(t.tile, dock.anchor, w) > 6 && t.task === Task.IDLE);
          if (far.length) { const [x, y] = BotView.fp(dock.anchor, w); this.cmd({ type: 'move', ids: far.map((t) => t.id), x, y }); }
          const away = ashore.filter((u) => this.dist(u.tile, dock.anchor, w) > 5 && u.task !== Task.MOVE);
          if (away.length) { const [x, y] = BotView.fp(dock.anchor + 2 * w, w); this.cmd({ type: 'move', ids: away.map((u) => u.id), x, y }); }
          if (since < 1800 && (far.length || away.length > ashore.length / 2)) return; // gather first, but never forever
        }
        if (ashore.length && since % 100 < this.diff.thinkEvery) {
          // fill transports by housing capacity
          let k = 0;
          for (const ship of transports) {
            const chunk: number[] = [];
            let pop = 0;
            while (k < ashore.length && pop + unitDef(UNIT_TYPES[ashore[k].kind - 1]).pop <= unitDef('transport').capacity) { pop += unitDef(UNIT_TYPES[ashore[k].kind - 1]).pop; chunk.push(ashore[k++].id); }
            if (chunk.length) this.cmd({ type: 'interact', ids: chunk, target: ship.id });
          }
        }
        if ((loaded > 0 && ashore.length === 0) || (loaded >= 4 && since > 900)) {
          let tgt = targets[0];
          for (const t of targets) if (this.dist(t, home, w) < this.dist(tgt, home, w)) tgt = t;
          s.target = -1;
          s.landing = this.landingNear(v, tgt);
          if (s.landing < 0) { advance('explore'); return; }
          for (const ship of transports) this.cmd({ type: 'unload', ship: ship.id, tile: s.landing });
          s.landTries = 0;
          advance('sail');
        }
        return;
      }
      case 'sail': {
        const aboard = v.myUnits.filter((u) => u.carrier >= 0);
        for (const u of aboard) if (!s.landedIds.includes(u.id)) s.landedIds.push(u.id);
        const loaded = aboard.length;
        if (loaded === 0) { advance('landed'); s.attackIssuedAt = -1; return; }
        if (since > 3000 || transports.every((t) => t.task === Task.IDLE)) {
          // ships can't get there: after 3 tries pick another beach near the target
          if (++s.landTries >= 3) {
            s.badLandings.push(s.landing);
            if (s.badLandings.length > 30) s.badLandings.shift();
            let tgt = targets.length ? targets[0] : s.landing;
            for (const t of targets) if (this.dist(t, home, w) < this.dist(tgt, home, w)) tgt = t;
            s.landing = this.landingNear(v, tgt);
            s.landTries = 0;
            if (s.landing < 0) { advance('board'); return; } // nowhere to land: back to the dock, explore again
          }
          for (const ship of transports) this.cmd({ type: 'unload', ship: ship.id, tile: s.landing });
          s.navalSince = v.tick;
        }
        return;
      }
    }
  }

  /** Exploration route: 16 points on a rectangle 9 tiles inside the map edge, then 8 on an inner ring. */
  private exploreWaypoint(step: number, w: number, h: number): [number, number] {
    const m = 9;
    if (step < 16) {
      const side = Math.floor(step / 4), f = (step % 4) / 4;
      const L = m, R = w - 1 - m, T = m, Bm = h - 1 - m;
      if (side === 0) return [Math.round(L + (R - L) * f), T];
      if (side === 1) return [R, Math.round(T + (Bm - T) * f)];
      if (side === 2) return [Math.round(R - (R - L) * f), Bm];
      return [L, Math.round(Bm - (Bm - T) * f)];
    }
    const a = ((step - 16) / 8) * Math.PI * 2;
    return [Math.round(w / 2 + Math.cos(a) * w * 0.3), Math.round(h / 2 + Math.sin(a) * h * 0.3)];
  }

  /** A remembered tile of enemy territory (explored and owned by a living non-ally), nearest to home. */
  private findEnemyLand(v: BotView, home: number): number {
    const w = v.w;
    let best = -1, bd = 1e9;
    for (let t = 0; t < w * v.h; t += 3) {
      const o = v.owner(t);
      if (o < 0 || o === 255 || o === v.player || v.isAlly(o) || v.eliminated(o)) continue;
      const d = this.dist(t, home, w);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** Outpost spot on our border, as close as possible to the nearest remembered ocean tile. */
  private coastOutpost(v: BotView, home: number): number {
    const w = v.w, x0 = home % w, y0 = Math.floor(home / w);
    let sea = -1;
    for (let r = 3; r <= 45 && sea < 0; r++) for (let dy = -r; dy <= r && sea < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x >= 0 && y >= 0 && x < w && y < v.h && this.mem.biome[y * w + x] === Biome.OCEAN) { sea = y * w + x; break; }
    }
    if (sea < 0) return -1;
    let best = -1, bd = 1e9;
    const R = 26;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= v.h - 1) continue;
      const t = y * w + x;
      if (v.owner(t) !== 255 || !v.canPlace('outpost', t)) continue;
      // must be within 2 tiles of our land (the sim's outpost rule)
      let near = false;
      for (let ey = -2; ey <= 2 && !near; ey++) for (let ex = -2; ex <= 2; ex++) { const q = t + ey * w + ex; if (q >= 0 && q < w * v.h && v.owner(q) === v.player) { near = true; break; } }
      if (!near) continue;
      const d = this.dist(t, sea, w);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** A remembered coastal land tile near a target (land with known open water next to it). */
  private landingNear(v: BotView, target: number): number {
    const w = v.w, x0 = target % w, y0 = Math.floor(target / w);
    for (let r = 2; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 1 || y < 1 || x >= w - 1 || y >= v.h - 1) continue;
      const t = y * w + x, b = this.mem.biome[t];
      if (b === UNKNOWN || isWaterBiome(b) || b === Biome.MOUNTAIN || b === Biome.SNOW) continue;
      if (this.s.badLandings.some((q) => this.dist(q, t, w) <= 3)) continue;
      if ([t - 1, t + 1, t - w, t + w].some((q) => this.mem.biome[q] === Biome.OCEAN)) return t;
    }
    return -1;
  }

  /** Snapshot for the debug overlay. */
  debug(): { player: number; personality: string; difficulty: Difficulty; goal: Goal; scores: Record<Goal, number>; naval: NavalState; target: number } {
    const s = this.s;
    return { player: s.player, personality: s.personality, difficulty: s.difficulty, goal: s.goal, scores: { ...s.scores }, naval: s.naval, target: s.target };
  }
}

export { RES_NONE };
