// Deterministic A* on the tile grid (8-neighbour, no corner cutting), integer costs.
// Used for single units (workers, settlers, scouts). Group flow fields come in Phase 3 (F-078).

const SQRT2_10 = 14; // diagonal step cost ×10

/** Inclusive tile rectangle. */
export interface GoalRect { x0: number; y0: number; x1: number; y1: number }
export const tileRect = (t: number, w: number, margin = 0): GoalRect => {
  const x = t % w, y = (t - x) / w;
  return { x0: x - margin, y0: y - margin, x1: x + margin, y1: y + margin };
};

/** Binary min-heap of node indices keyed by (f, h, index): fully deterministic ordering. */
class Heap {
  private a: number[] = [];
  constructor(private f: Int32Array, private h: Int32Array) {}
  get size(): number { return this.a.length; }
  private less(i: number, j: number): boolean {
    const x = this.a[i], y = this.a[j];
    return this.f[x] < this.f[y] || (this.f[x] === this.f[y] && (this.h[x] < this.h[y] || (this.h[x] === this.h[y] && x < y)));
  }
  push(n: number): void {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop(): number {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(l, m)) m = l;
        if (r < a.length && this.less(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
  clear(): void { this.a.length = 0; }
}

export class PathFinder {
  private g: Int32Array;
  private f: Int32Array;
  private h: Int32Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closedStamp: Uint32Array;
  private gen = 0;
  private heap: Heap;
  /** Nodes expanded by the last search (for profiling). */
  lastExpanded = 0;

  constructor(readonly w: number, readonly h_: number, private cost: (tile: number) => number) {
    const n = w * h_;
    this.g = new Int32Array(n); this.f = new Int32Array(n); this.h = new Int32Array(n);
    this.from = new Int32Array(n); this.stamp = new Uint32Array(n); this.closedStamp = new Uint32Array(n);
    this.heap = new Heap(this.f, this.h);
  }

  private heur(a: number, r: GoalRect, minCost: number): number {
    const x = a % this.w, y = (a - x) / this.w;
    const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
    const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
    const diag = Math.min(dx, dy), straight = Math.max(dx, dy) - diag;
    return Math.floor(((diag * SQRT2_10 + straight * 10) * minCost) / 10);
  }

  /**
   * Path from `start` to any passable tile inside `goal` (inclusive tile rectangle), returned as a
   * tile list excluding the start. `cost(tile)` ≤ 0 means impassable. Null if unreachable within maxNodes.
   */
  find(start: number, goal: GoalRect, opts: { maxNodes?: number; minCost?: number } = {}): number[] | null {
    const w = this.w, H = this.h_;
    const maxNodes = opts.maxNodes ?? 40000, minCost = opts.minCost ?? 10;
    const reached = (t: number): boolean => {
      const x = t % w, y = (t - x) / w;
      return x >= goal.x0 && x <= goal.x1 && y >= goal.y0 && y <= goal.y1;
    };
    if (reached(start)) return [];
    this.gen = (this.gen + 1) >>> 0;
    if (this.gen === 0) { this.stamp.fill(0); this.closedStamp.fill(0); this.gen = 1; }
    const gen = this.gen;
    this.heap.clear();
    this.g[start] = 0; this.h[start] = this.heur(start, goal, minCost); this.f[start] = this.h[start];
    this.from[start] = -1; this.stamp[start] = gen;
    this.heap.push(start);
    let expanded = 0;
    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (this.closedStamp[cur] === gen) continue;
      this.closedStamp[cur] = gen;
      if (reached(cur)) {
        const path: number[] = [];
        for (let t = cur; t !== start; t = this.from[t]) path.push(t);
        path.reverse();
        this.lastExpanded = expanded;
        return path;
      }
      if (++expanded > maxNodes) break;
      const x = cur % w, y = (cur - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= H) continue;
        const nb = ny * w + nx;
        if (this.closedStamp[nb] === gen) continue;
        const c = this.cost(nb);
        if (c <= 0) continue;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting past impassable tiles
          if (this.cost(y * w + nx) <= 0 || this.cost(ny * w + x) <= 0) continue;
        }
        const step = dx !== 0 && dy !== 0 ? (c * SQRT2_10) / 10 : c;
        const ng = this.g[cur] + Math.floor(step);
        if (this.stamp[nb] === gen && ng >= this.g[nb]) continue;
        this.stamp[nb] = gen;
        this.g[nb] = ng;
        this.h[nb] = this.heur(nb, goal, minCost);
        this.f[nb] = ng + this.h[nb];
        this.from[nb] = cur;
        this.heap.push(nb);
      }
    }
    this.lastExpanded = expanded;
    return null;
  }
}
