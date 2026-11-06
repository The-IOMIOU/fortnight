// Mouse + keyboard camera controls and click events.
// Middle- or right-drag pans, wheel zooms, WASD/arrows pan, screen edges scroll.
// A right click without dragging is an order; a left click selects.
// Touch (F-177): tap selects, one-finger drag pans, long press orders, two-finger pinch zooms.
import type { ViewCamera } from '../render/globeCamera';

export interface ControlHandlers {
  onLeftClick(clientX: number, clientY: number, shift: boolean): void;
  onRightClick(clientX: number, clientY: number, shift: boolean): void;
  onKey(ev: KeyboardEvent): void;
  /** Box selection in progress (null when finished/cancelled). */
  onBoxDrag(rect: { x0: number; y0: number; x1: number; y1: number } | null): void;
  onBoxSelect(rect: { x0: number; y0: number; x1: number; y1: number }, shift: boolean): void;
  onHover(clientX: number, clientY: number): void;
}

const EDGE_PX = 12;
const DRAG_THRESHOLD = 5;

export class Controls {
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inside: false };
  private drag: { button: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  edgeScroll = true;
  private disposers: (() => void)[] = [];
  private touches = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinch = 0;
  private touchMoved = false;
  /** Long press time (ms) that turns a tap into an order. */
  static LONG_PRESS_MS = 450;

  constructor(private el: HTMLElement, private cam: ViewCamera, private h: ControlHandlers) {
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(el, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'touch') { this.touchDown(e); return; }
      this.drag = { button: e.button, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
      if (e.button === 1) e.preventDefault();
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      if (e.pointerType === 'touch') { this.touchMove(e); return; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      this.h.onHover(e.clientX, e.clientY);
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      if (d.button === 0) { this.h.onBoxDrag(this.rect(d.sx, d.sy, e.clientX, e.clientY)); return; }
      // Drag the ground: move the target opposite to the pointer.
      const k = (this.cam.distance * 1.6) / el.clientHeight;
      this.cam.panWorld(-dx * k, -dy * k);
      d.x = e.clientX; d.y = e.clientY;
    });
    on(el, 'pointerup', (e: PointerEvent) => {
      if (e.pointerType === 'touch') { this.touchUp(e); return; }
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.moved) {
        if (d.button === 0) { this.h.onBoxDrag(null); this.h.onBoxSelect(this.rect(d.sx, d.sy, e.clientX, e.clientY), e.shiftKey); }
        return;
      }
      if (e.button === 0) this.h.onLeftClick(e.clientX, e.clientY, e.shiftKey);
      else if (e.button === 2) this.h.onRightClick(e.clientX, e.clientY, e.shiftKey);
    });
    on(el, 'pointerleave', () => { this.mouse.inside = false; });
    on(el, 'wheel', (e: WheelEvent) => { e.preventDefault(); this.cam.zoom(Math.sign(e.deltaY)); }, { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.keys.add(e.key.toLowerCase());
      this.h.onKey(e);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => { this.keys.clear(); this.mouse.inside = false; });
  }

  // ---- touch
  private touchDown(e: PointerEvent): void {
    try { this.el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    this.edgeScroll = false;
    if (this.touches.size === 1) this.touchMoved = false;
    if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.touchMoved = true; }
  }
  private touchMove(e: PointerEvent): void {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    if (this.touches.size >= 2) {
      const [a, b] = [...this.touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && Math.abs(d / this.pinch - 1) > 0.15) { this.cam.zoom(d > this.pinch ? -1 : 1); this.pinch = d; }
      const k = (this.cam.distance * 0.8) / this.el.clientHeight;
      this.cam.panWorld(-dx * k, -dy * k);
      return;
    }
    if (!this.touchMoved && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < DRAG_THRESHOLD * 2) return;
    this.touchMoved = true;
    const k = (this.cam.distance * 1.6) / this.el.clientHeight;
    this.cam.panWorld(-dx * k, -dy * k);
  }
  private touchUp(e: PointerEvent): void {
    const t = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    if (!t || this.touches.size > 0) return;
    if (!this.touchMoved) {
      if (performance.now() - t.t >= Controls.LONG_PRESS_MS) this.h.onRightClick(e.clientX, e.clientY, false);
      else this.h.onLeftClick(e.clientX, e.clientY, false);
    }
    this.pinch = 0;
  }

  private rect(ax: number, ay: number, bx: number, by: number): { x0: number; y0: number; x1: number; y1: number } {
    return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  }

  /** Per-frame continuous movement (keys + edge scroll). dt in seconds. */
  update(dt: number): void {
    let dx = 0, dz = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) dx -= 1;
    if (k.has('d') || k.has('arrowright')) dx += 1;
    if (k.has('w') || k.has('arrowup')) dz -= 1;
    if (k.has('s') || k.has('arrowdown')) dz += 1;
    if (this.edgeScroll && this.mouse.inside && !this.drag) {
      const r = this.el.getBoundingClientRect();
      if (this.mouse.x - r.left < EDGE_PX) dx -= 1;
      if (r.right - this.mouse.x < EDGE_PX) dx += 1;
      if (this.mouse.y - r.top < EDGE_PX) dz -= 1;
      if (r.bottom - this.mouse.y < EDGE_PX) dz += 1;
    }
    if (dx || dz) this.cam.pan(dx * dt * 1.2, dz * dt * 1.2);
  }

  dispose(): void { for (const d of this.disposers) d(); }
}
