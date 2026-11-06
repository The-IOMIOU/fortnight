// 2D-canvas minimap: biome colors, fog, ownership overlay, camera view outline, click/drag to move camera.
import { isWaterBiome } from '../sim/world/mapgen';
import type { MapPayload } from '../worker/protocol';
import { BIOME_COLORS, playerColor } from './palette';

export class Minimap {
  readonly root: HTMLDivElement;
  readonly base: HTMLCanvasElement;
  readonly overlay: HTMLCanvasElement;
  private img: ImageData;
  private baseRgb: Uint8ClampedArray;
  private fog: Uint8Array;
  private owner: Uint8Array;
  ownerOverlay = true;
  private dirty = true;

  constructor(private map: MapPayload, private onJump: (tileX: number, tileZ: number) => void) {
    const { w, h } = map;
    this.root = document.createElement('div');
    this.root.className = 'minimap';
    this.base = document.createElement('canvas');
    this.base.width = w; this.base.height = h;
    this.overlay = document.createElement('canvas');
    this.overlay.width = 256; this.overlay.height = 256;
    this.root.append(this.base, this.overlay);
    this.img = new ImageData(w, h);
    this.baseRgb = new Uint8ClampedArray(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      const b = map.biome[i], c = BIOME_COLORS[b];
      const shade = isWaterBiome(b) ? 1 : 0.85 + map.height[i] * 0.04;
      this.baseRgb[i * 3] = c[0] * 255 * shade; this.baseRgb[i * 3 + 1] = c[1] * 255 * shade; this.baseRgb[i * 3 + 2] = c[2] * 255 * shade;
    }
    this.fog = new Uint8Array(w * h);
    this.owner = new Uint8Array(w * h).fill(255);
    let dragging = false;
    const jump = (ev: PointerEvent): void => {
      const r = this.overlay.getBoundingClientRect();
      const tx = ((ev.clientX - r.left) / r.width) * w, tz = ((ev.clientY - r.top) / r.height) * h;
      this.onJump(Math.max(0, Math.min(w, tx)), Math.max(0, Math.min(h, tz)));
    };
    this.overlay.addEventListener('pointerdown', (ev) => { if (ev.button !== 0) return; dragging = true; this.overlay.setPointerCapture(ev.pointerId); jump(ev); ev.stopPropagation(); });
    this.overlay.addEventListener('pointermove', (ev) => { if (dragging) jump(ev); });
    this.overlay.addEventListener('pointerup', () => { dragging = false; });
    this.overlay.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  private baseColor(i: number): void {
    const b = this.map.biome[i], c = BIOME_COLORS[b];
    const shade = isWaterBiome(b) ? 1 : 0.85 + this.map.height[i] * 0.04;
    this.baseRgb[i * 3] = c[0] * 255 * shade; this.baseRgb[i * 3 + 1] = c[1] * 255 * shade; this.baseRgb[i * 3 + 2] = c[2] * 255 * shade;
  }
  /** Tile deltas ([tile, biome, resType]); the terrain layer already updated map.biome. */
  applyTiles(tiles: Int32Array): void { for (let k = 0; k < tiles.length; k += 3) this.baseColor(tiles[k]); this.dirty = true; }
  setFog(f: Uint8Array): void { this.fog.set(f); this.dirty = true; }
  setOwner(o: Uint8Array): void { this.owner.set(o); this.dirty = true; }
  setOwnerOverlay(on: boolean): void { this.ownerOverlay = on; this.dirty = true; }

  /** Pixel the minimap shows for tile i (used by tests). */
  pixel(i: number): [number, number, number] {
    const d = this.img.data;
    return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
  }

  redraw(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.map.w * this.map.h, d = this.img.data, rgb = this.baseRgb;
    for (let i = 0; i < n; i++) {
      const f = this.fog[i];
      let r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
      const o = this.owner[i];
      if (this.ownerOverlay && o !== 255) {
        const pc = playerColor(o), pat = Math.floor(o / 8) % 4, x = i % this.map.w, y = (i - x) / this.map.w;
        const on = pat === 0 || (pat === 1 && (x + y) % 3 !== 0) || (pat === 2 && (x % 2 === 0 || y % 2 === 0)) || (pat === 3 && (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0);
        const k = on ? 0.55 : 0.2;
        r = r * (1 - k) + pc[0] * 255 * k; g = g * (1 - k) + pc[1] * 255 * k; b = b * (1 - k) + pc[2] * 255 * k;
      }
      if (f === 0) { r = 8; g = 9; b = 12; } else if (f < 200) { r *= 0.45; g *= 0.45; b *= 0.45; }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    this.base.getContext('2d')!.putImageData(this.img, 0, 0);
  }

  /** Draw the camera footprint: corners in tile coordinates (null = sky). */
  drawView(corners: ({ x: number; z: number } | null)[], units: { x: number; z: number; owner: number }[]): void {
    const ctx = this.overlay.getContext('2d')!, S = this.overlay.width;
    const sx = S / this.map.w, sz = S / this.map.h;
    ctx.clearRect(0, 0, S, S);
    for (const u of units) {
      const c = playerColor(u.owner);
      ctx.fillStyle = `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`;
      ctx.fillRect(u.x * sx - 2, u.z * sz - 2, 4, 4);
    }
    if (corners.some((c) => !c)) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    // globe: the view rectangle can cross the seam; draw it again one map-width over (the canvas clips)
    for (const off of this.map.wrap ? [0, -S, S] : [0]) {
      ctx.beginPath();
      corners.forEach((c, k) => (k === 0 ? ctx.moveTo(c!.x * sx + off, c!.z * sz) : ctx.lineTo(c!.x * sx + off, c!.z * sz)));
      ctx.closePath();
      ctx.stroke();
    }
  }
}
