// Integer math helpers for the deterministic simulation.
// Positions are fixed-point with FP_ONE units per tile.

export const FP_SHIFT = 10;
export const FP_ONE = 1 << FP_SHIFT; // 1024 sub-units per tile
export const FP_HALF = FP_ONE >> 1;

/** floor(sqrt(n)) for a non-negative integer n < 2^53, without Math.sqrt. */
export function isqrt(n: number): number {
  if (n < 2) return n < 0 ? 0 : n;
  // Initial guess: a power of two ≥ sqrt(n).
  let x = 1;
  let t = n;
  while (t >= 4) { t = Math.floor(t / 4); x *= 2; }
  x *= 2;
  for (;;) {
    const y = Math.floor((x + Math.floor(n / x)) / 2);
    if (y >= x) return x;
    x = y;
  }
}

/** Integer division truncating toward zero (deterministic for |a|,|b| < 2^53). */
export function idiv(a: number, b: number): number { return Math.trunc(a / b); }

export const toTile = (fp: number): number => fp >> FP_SHIFT;
export const tileCenter = (tile: number): number => (tile << FP_SHIFT) + FP_HALF;
