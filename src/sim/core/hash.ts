// FNV-1a 32-bit hashing over typed arrays and integers (deterministic state hashes).

export class Hasher {
  h = 0x811c9dc5;
  byte(b: number): void { this.h = Math.imul(this.h ^ (b & 0xff), 0x01000193); }
  u32(v: number): void { this.byte(v); this.byte(v >>> 8); this.byte(v >>> 16); this.byte(v >>> 24); }
  bytes(a: ArrayBufferView, length = a.byteLength): void {
    const u8 = new Uint8Array(a.buffer, a.byteOffset, length);
    let h = this.h;
    for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 0x01000193);
    this.h = h;
  }
  digest(): number { return this.h >>> 0; }
}

export function hashArrays(...arrays: ArrayBufferView[]): number {
  const hs = new Hasher();
  for (const a of arrays) { hs.u32(a.byteLength); hs.bytes(a); }
  return hs.digest();
}

export const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
