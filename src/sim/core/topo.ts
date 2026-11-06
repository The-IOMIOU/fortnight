// Map topology helpers (F-195). On a globe map the world wraps east–west; flat maps have hard edges.
// Integer-only; shared by the sim, pathfinding, fog, bots and the renderer.

/** Column x wrapped into [0, w) on a globe (unchanged on a flat map). */
export const wrapX = (x: number, w: number, wrap: boolean): number => (wrap ? ((x % w) + w) % w : x);

/** Shortest signed difference b − a along a wrapping axis of length `span` (plain b − a when flat). */
export function wdelta(a: number, b: number, span: number, wrap: boolean): number {
  let d = b - a;
  if (!wrap) return d;
  d = ((d % span) + span) % span;
  return d >= span >> 1 ? d - span : d;
}

/** Tile index at (x, y), wrapping x on a globe; −1 outside the map. */
export function tileAt(x: number, y: number, w: number, h: number, wrap: boolean): number {
  if (y < 0 || y >= h) return -1;
  if (x < 0 || x >= w) { if (!wrap) return -1; x = ((x % w) + w) % w; }
  return y * w + x;
}

/** Is column x inside [x0, x1] (inclusive), the interval possibly crossing the seam? */
export function inSpanX(x: number, x0: number, x1: number, w: number, wrap: boolean): boolean {
  if (!wrap) return x >= x0 && x <= x1;
  return ((((x - x0) % w) + w) % w) <= x1 - x0;
}

/** Distance in columns from x to the interval [x0, x1] (0 inside), wrap-aware. */
export function spanDistX(x: number, x0: number, x1: number, w: number, wrap: boolean): number {
  if (!wrap) return x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  if (inSpanX(x, x0, x1, w, true)) return 0;
  return Math.min(Math.abs(wdelta(x, x0, w, true)), Math.abs(wdelta(x, x1, w, true)));
}
