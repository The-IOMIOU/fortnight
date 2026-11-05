// Struct-of-arrays entity storage. Entity handle = slot index; `gen` guards against stale handles.

export const Kind = { SCOUT: 1 } as const;

export class Entities {
  capacity: number;
  count = 0; // high-water mark of used slots
  alive: Uint8Array;
  gen: Uint16Array;
  kind: Uint8Array;
  owner: Uint8Array;
  posX: Int32Array;
  posY: Int32Array;
  tgtX: Int32Array;
  tgtY: Int32Array;
  moving: Uint8Array;
  speed: Int32Array; // fixed-point sub-units per tick
  vision: Uint8Array; // tiles
  private free: number[] = [];

  constructor(capacity = 1024) {
    this.capacity = capacity;
    this.alive = new Uint8Array(capacity);
    this.gen = new Uint16Array(capacity);
    this.kind = new Uint8Array(capacity);
    this.owner = new Uint8Array(capacity);
    this.posX = new Int32Array(capacity);
    this.posY = new Int32Array(capacity);
    this.tgtX = new Int32Array(capacity);
    this.tgtY = new Int32Array(capacity);
    this.moving = new Uint8Array(capacity);
    this.speed = new Int32Array(capacity);
    this.vision = new Uint8Array(capacity);
  }

  private grow(): void {
    const cap = this.capacity * 2;
    const g = <T extends Uint8Array | Uint16Array | Int32Array>(a: T): T => {
      const b = new (a.constructor as { new (n: number): T })(cap);
      b.set(a);
      return b;
    };
    this.alive = g(this.alive); this.gen = g(this.gen); this.kind = g(this.kind); this.owner = g(this.owner);
    this.posX = g(this.posX); this.posY = g(this.posY); this.tgtX = g(this.tgtX); this.tgtY = g(this.tgtY);
    this.moving = g(this.moving); this.speed = g(this.speed); this.vision = g(this.vision);
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
    this.alive[id] = 1; this.kind[id] = kind; this.owner[id] = owner;
    this.posX[id] = x; this.posY[id] = y; this.tgtX[id] = x; this.tgtY[id] = y;
    this.moving[id] = 0; this.speed[id] = speed; this.vision[id] = vision;
    return id;
  }

  kill(id: number): void {
    if (!this.alive[id]) return;
    this.alive[id] = 0; this.moving[id] = 0;
    this.gen[id] = (this.gen[id] + 1) & 0xffff;
    this.free.push(id);
  }

  /** Arrays included in the state hash (only the used prefix). */
  hashViews(): ArrayBufferView[] {
    const n = this.count;
    return [this.alive.subarray(0, n), this.kind.subarray(0, n), this.owner.subarray(0, n), this.posX.subarray(0, n),
      this.posY.subarray(0, n), this.tgtX.subarray(0, n), this.tgtY.subarray(0, n), this.moving.subarray(0, n)];
  }
}
