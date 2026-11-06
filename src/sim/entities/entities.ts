// Struct-of-arrays entity storage for units, buildings and wildlife.
// Every typed-array field is registered in FIELDS, so growth, hashing and save/load cover all of them.

export { Kind } from '../defs';

type TA = Uint8Array | Uint16Array | Int32Array;
type Ctor = { new (n: number): TA };

const FIELDS: [string, Ctor][] = [
  ['alive', Uint8Array], ['gen', Uint16Array], ['kind', Uint8Array], ['owner', Uint8Array],
  ['posX', Int32Array], ['posY', Int32Array], ['tgtX', Int32Array], ['tgtY', Int32Array],
  ['moving', Uint8Array], ['speed', Int32Array], ['vision', Uint8Array],
  // units
  ['task', Uint8Array], ['phase', Uint8Array], ['taskTile', Int32Array], ['taskEnt', Int32Array],
  ['carryType', Uint8Array], ['carryAmt', Int32Array], ['acc', Int32Array], ['pathIdx', Int32Array], ['repathAt', Int32Array],
  ['srcEnt', Int32Array], ['waitPath', Uint8Array], ['hasFinal', Uint8Array],
  ['gx0', Int32Array], ['gy0', Int32Array], ['gx1', Int32Array], ['gy1', Int32Array], ['finX', Int32Array], ['finY', Int32Array],
  // buildings
  ['btype', Uint8Array], ['level', Uint8Array], ['progress', Int32Array], ['anchor', Int32Array], ['complete', Uint8Array],
  ['upTo', Uint8Array], ['upProgress', Int32Array], ['trainProgress', Int32Array], ['yieldPct', Int32Array],
  // wildlife
  ['food', Int32Array], ['homeTile', Int32Array],
  // combat (Phase 3)
  ['hp', Int32Array], ['maxHp', Int32Array], ['morale', Int32Array], ['cooldown', Int32Array], ['lastHit', Int32Array],
  ['weaponTier', Uint8Array], ['armorTier', Uint8Array], ['carrier', Int32Array],
  ['patrolA', Int32Array], ['patrolB', Int32Array], ['rally', Int32Array], ['flowGoal', Int32Array], ['resumeTask', Uint8Array],
  // Phase 5 (hashed only when Phase 5 rules are in play, so older matches keep their hashes)
  ['burrowed', Uint8Array], ['ambushUntil', Int32Array], ['restUntil', Int32Array],
];
const P5_FIELDS = new Set(['burrowed', 'ambushUntil', 'restUntil']);

export class Entities {
  capacity: number;
  count = 0; // high-water mark of used slots
  alive!: Uint8Array; gen!: Uint16Array; kind!: Uint8Array; owner!: Uint8Array;
  posX!: Int32Array; posY!: Int32Array; tgtX!: Int32Array; tgtY!: Int32Array;
  moving!: Uint8Array; speed!: Int32Array; vision!: Uint8Array;
  task!: Uint8Array; phase!: Uint8Array; taskTile!: Int32Array; taskEnt!: Int32Array;
  carryType!: Uint8Array; carryAmt!: Int32Array; acc!: Int32Array; pathIdx!: Int32Array; repathAt!: Int32Array;
  srcEnt!: Int32Array; waitPath!: Uint8Array; hasFinal!: Uint8Array;
  gx0!: Int32Array; gy0!: Int32Array; gx1!: Int32Array; gy1!: Int32Array; finX!: Int32Array; finY!: Int32Array;
  btype!: Uint8Array; level!: Uint8Array; progress!: Int32Array; anchor!: Int32Array; complete!: Uint8Array;
  upTo!: Uint8Array; upProgress!: Int32Array; trainProgress!: Int32Array; yieldPct!: Int32Array;
  food!: Int32Array; homeTile!: Int32Array;
  hp!: Int32Array; maxHp!: Int32Array; morale!: Int32Array; cooldown!: Int32Array; lastHit!: Int32Array;
  weaponTier!: Uint8Array; armorTier!: Uint8Array; carrier!: Int32Array;
  patrolA!: Int32Array; patrolB!: Int32Array; rally!: Int32Array; flowGoal!: Int32Array; resumeTask!: Uint8Array;
  burrowed!: Uint8Array; ambushUntil!: Int32Array; restUntil!: Int32Array;
  /** Path (tile list) per entity; null when none. */
  paths: (number[] | null)[] = [];
  /** Training queue (unit type indices) per building. */
  queues: number[][] = [];
  free: number[] = [];

  constructor(capacity = 1024) {
    this.capacity = capacity;
    const self = this as unknown as Record<string, TA>;
    for (const [name, C] of FIELDS) self[name] = new C(capacity);
  }

  private grow(): void {
    const cap = this.capacity * 2;
    const self = this as unknown as Record<string, TA>;
    for (const [name, C] of FIELDS) { const b = new C(cap); b.set(self[name]); self[name] = b; }
    this.capacity = cap;
  }

  /** Lowest free slot first, so allocation order is deterministic. */
  spawn(kind: number, owner: number, x: number, y: number, speed: number, vision: number): number {
    let id: number;
    if (this.free.length > 0) {
      this.free.sort((a, b) => b - a);
      id = this.free.pop()!;
    } else {
      if (this.count >= this.capacity) this.grow();
      id = this.count++;
    }
    const self = this as unknown as Record<string, TA>;
    const g = this.gen[id];
    for (const [name] of FIELDS) self[name][id] = 0;
    this.gen[id] = g;
    this.alive[id] = 1; this.kind[id] = kind; this.owner[id] = owner;
    this.posX[id] = x; this.posY[id] = y; this.tgtX[id] = x; this.tgtY[id] = y;
    this.speed[id] = speed; this.vision[id] = vision;
    this.taskEnt[id] = -1; this.taskTile[id] = -1; this.anchor[id] = -1; this.homeTile[id] = -1; this.srcEnt[id] = -1;
    this.carrier[id] = -1; this.patrolA[id] = -1; this.patrolB[id] = -1; this.rally[id] = -1; this.flowGoal[id] = -1; this.lastHit[id] = -100000;
    this.paths[id] = null; this.queues[id] = [];
    return id;
  }

  kill(id: number): void {
    if (!this.alive[id]) return;
    this.alive[id] = 0; this.moving[id] = 0;
    this.gen[id] = (this.gen[id] + 1) & 0xffff;
    this.paths[id] = null; this.queues[id] = [];
    this.free.push(id);
  }

  /** All typed arrays (used prefix) for hashing. */
  hashViews(phase5 = false): ArrayBufferView[] {
    const n = this.count, self = this as unknown as Record<string, TA>;
    return FIELDS.filter(([name]) => phase5 || !P5_FIELDS.has(name)).map(([name]) => self[name].subarray(0, n));
  }

  /** Plain-data snapshot for save files. */
  serialize(): { capacity: number; count: number; fields: Record<string, number[]>; paths: (number[] | null)[]; queues: number[][]; free: number[] } {
    const self = this as unknown as Record<string, TA>, fields: Record<string, number[]> = {};
    for (const [name] of FIELDS) fields[name] = Array.from(self[name].subarray(0, this.count));
    return { capacity: this.capacity, count: this.count, fields, paths: this.paths.slice(0, this.count), queues: this.queues.slice(0, this.count), free: this.free.slice() };
  }

  static deserialize(d: ReturnType<Entities['serialize']>): Entities {
    const e = new Entities(d.capacity);
    const self = e as unknown as Record<string, TA>;
    for (const [name] of FIELDS) if (d.fields[name]) self[name].set(d.fields[name]);
    e.count = d.count; e.paths = d.paths.map((p) => (p ? p.slice() : null)); e.queues = d.queues.map((q) => q.slice()); e.free = d.free.slice();
    return e;
  }
}
