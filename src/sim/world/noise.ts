// Integer value noise (fixed-point, 12-bit fractions). Deterministic on every JS engine:
// only Math.imul, shifts, integer +,-,* and floor-division are used.

export const N_ONE = 4096; // noise values are in [0, N_ONE)

export function hash2(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Smoothstep on [0, N_ONE] → [0, N_ONE]. */
function smooth(t: number): number {
  return Math.floor((t * t * (3 * N_ONE - 2 * t)) / (N_ONE * N_ONE));
}

/** Value noise at integer tile coordinate (x, y) with lattice spacing `cell` tiles. */
export function valueNoise(seed: number, x: number, y: number, cell: number): number {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = Math.floor(((x - gx * cell) * N_ONE) / cell);
  const fy = Math.floor(((y - gy * cell) * N_ONE) / cell);
  const sx = smooth(fx), sy = smooth(fy);
  const v00 = hash2(seed, gx, gy) & 4095, v10 = hash2(seed, gx + 1, gy) & 4095;
  const v01 = hash2(seed, gx, gy + 1) & 4095, v11 = hash2(seed, gx + 1, gy + 1) & 4095;
  const a = v00 + (((v10 - v00) * sx) >> 12);
  const b = v01 + (((v11 - v01) * sx) >> 12);
  return a + (((b - a) * sy) >> 12);
}

/** Fractal (multi-octave) value noise in [0, N_ONE). Weights 16,8,4,2,1. */
export function fbm(seed: number, x: number, y: number, baseCell: number, octaves: number): number {
  let sum = 0, wsum = 0, cell = baseCell, w = 1 << (octaves - 1);
  for (let o = 0; o < octaves && cell >= 2; o++) {
    sum += valueNoise((seed + Math.imul(o, 0x9e3779b1)) | 0, x, y, cell) * w;
    wsum += w;
    cell = cell >> 1;
    w = w >> 1;
  }
  return Math.floor(sum / wsum);
}
