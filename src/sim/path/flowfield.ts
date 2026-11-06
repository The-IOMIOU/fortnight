// Flow fields for group movement (F-078): one Dijkstra distance field per (goal tile, player), shared by
// every unit heading there. Units step to the neighbour with the lowest distance. Fields are derived
// data: the cache is cleared on any terrain/building change, and recomputing gives identical results,
// so cache hits/misses never affect the simulation.

import { tileAt } from '../core/topo';

export const UNREACHABLE = 0x7fffffff;
const DIAG = 14, STRAIGHT = 10;

export class FlowFields {
  private cache = new Map<string, Int32Array>();
  /** Total fields computed (for profiling). */
  computed = 0;
  lastMs = 0;

  constructor(readonly w: number, readonly h: number, readonly capacity: number, readonly wrap = false) {}

  clear(): void { this.cache.clear(); }

  /** Distance field towards `goal` for a player's cost function (cost ≤ 0 = impassable). */
  get(goal: number, key: string, cost: (t: number) => number): Int32Array {
    const k = `${key}:${goal}`;
    const hit = this.cache.get(k);
    if (hit) { this.cache.delete(k); this.cache.set(k, hit); return hit; } // LRU touch
    const f = this.compute(goal, cost);
    this.cache.set(k, f);
    while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!);
    return f;
  }

  private compute(goal: number, cost: (t: number) => number): Int32Array {
    this.computed++;
    const { w, h } = this, n = w * h;
    const dist = new Int32Array(n).fill(UNREACHABLE);
    // binary heap of tiles keyed by (dist, tile)
    const heap: number[] = [];
    const less = (a: number, b: number): boolean => dist[a] < dist[b] || (dist[a] === dist[b] && a < b);
    const push = (t: number): void => {
      heap.push(t);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
    };
    const pop = (): number => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
        }
      }
      return top;
    };
    const done = new Uint8Array(n);
    dist[goal] = 0;
    push(goal);
    while (heap.length) {
      const t = pop();
      if (done[t]) continue;
      done[t] = 1;
      const x = t % w, y = (t - x) / w, d = dist[t];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nb = tileAt(x + dx, y + dy, w, h, this.wrap);
        if (nb < 0 || done[nb]) continue;
        // entering cost is paid by the neighbour (we search backwards from the goal): use the
        // neighbour's own cost so that moving *out of* a slow tile is what costs time
        const c = cost(nb);
        if (c <= 0) continue;
        if (dx !== 0 && dy !== 0 && (cost(tileAt(x + dx, y, w, h, this.wrap)) <= 0 || cost(tileAt(x, y + dy, w, h, this.wrap)) <= 0)) continue;
        const nd = d + Math.floor(((dx !== 0 && dy !== 0 ? DIAG : STRAIGHT) * c) / 10);
        if (nd < dist[nb]) { dist[nb] = nd; push(nb); }
      }
    }
    return dist;
  }

  /** Best next tile from `t` (lowest distance neighbour, no corner cutting); -1 at goal or if stuck. */
  static next(field: Int32Array, t: number, w: number, h: number, cost: (t: number) => number, wrap = false): number {
    const x = t % w, y = (t - x) / w;
    let best = -1, bd = field[t];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nb = tileAt(x + dx, y + dy, w, h, wrap);
      if (nb < 0 || field[nb] >= bd) continue;
      if (dx !== 0 && dy !== 0 && (cost(tileAt(x + dx, y, w, h, wrap)) <= 0 || cost(tileAt(x, y + dy, w, h, wrap)) <= 0)) continue;
      bd = field[nb]; best = nb;
    }
    return best;
  }
}
