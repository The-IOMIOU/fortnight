// Deterministic PRNG: sfc32 seeded from a string hash. Integer-only (Math.imul, shifts).

/** cyrb53-style 32-bit string hash → stable seed. */
export function hashString(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number) {
    this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = seed >>> 0;
    for (let i = 0; i < 16; i++) this.nextU32();
  }
  /** Independent stream derived from a seed string and a stream name. */
  static stream(seed: string, name: string): Rng { return new Rng(hashString(seed + '\u0000' + name)); }
  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
  /** Integer in [0, n). n must be ≤ 2^31. Uses rejection to avoid modulo bias. */
  int(n: number): number {
    const limit = 0x100000000 - (0x100000000 % n);
    let v = this.nextU32();
    while (v >= limit) v = this.nextU32();
    return v % n;
  }
  range(lo: number, hiInclusive: number): number { return lo + this.int(hiInclusive - lo + 1); }
}
