// Per-player fog of war. Values double as the renderer's fog texture: 0 unexplored, 128 explored, 255 visible.
import { TUNING } from '../core/tuning';

export const FOG_UNEXPLORED = 0;
export const FOG_EXPLORED = TUNING.fog.explored;
export const FOG_VISIBLE = TUNING.fog.visible;

const circleCache = new Map<number, Int32Array>();
/** (dx, dy) pairs inside a vision circle of radius r tiles. */
export function circleOffsets(r: number): Int32Array {
  let c = circleCache.get(r);
  if (c) return c;
  const pts: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) pts.push(dx, dy);
  c = new Int32Array(pts);
  circleCache.set(r, c);
  return c;
}

export class FogLayer {
  readonly data: Uint8Array;
  private visible: Int32Array;
  private visibleCount = 0;
  dirty = true;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h);
    this.visible = new Int32Array(1024);
  }
  /** Start a vision pass: currently visible tiles become explored. */
  begin(): void {
    const d = this.data;
    for (let k = 0; k < this.visibleCount; k++) d[this.visible[k]] = FOG_EXPLORED;
    this.visibleCount = 0;
  }
  /** Tiles that went from unexplored to visible since the last drain. */
  newlyExplored: number[] = [];
  private mark(i: number): void {
    const v = this.data[i];
    if (v === FOG_VISIBLE) return;
    if (v === FOG_UNEXPLORED) this.newlyExplored.push(i);
    this.data[i] = FOG_VISIBLE;
    if (this.visibleCount >= this.visible.length) {
      const b = new Int32Array(this.visible.length * 2); b.set(this.visible); this.visible = b;
    }
    this.visible[this.visibleCount++] = i;
  }
  stampCircle(tx: number, ty: number, r: number): void {
    const off = circleOffsets(r), w = this.w, h = this.h;
    for (let k = 0; k < off.length; k += 2) {
      const x = tx + off[k], y = ty + off[k + 1];
      if (x >= 0 && y >= 0 && x < w && y < h) this.mark(y * w + x);
    }
  }
  stampTile(i: number): void { this.mark(i); }
  /** Currently visible tile list (for save files). */
  visibleTiles(): number[] { return Array.from(this.visible.subarray(0, this.visibleCount)); }
  restore(data: ArrayLike<number>, visible: number[]): void {
    this.data.set(data);
    this.visibleCount = 0;
    for (const t of visible) {
      if (this.visibleCount >= this.visible.length) { const b = new Int32Array(this.visible.length * 2); b.set(this.visible); this.visible = b; }
      this.visible[this.visibleCount++] = t;
    }
    this.dirty = true;
  }
  isVisible(i: number): boolean { return this.data[i] === FOG_VISIBLE; }
}
