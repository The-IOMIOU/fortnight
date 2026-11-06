// Mouse + keyboard camera controls and click events.
// Middle- or right-drag pans, wheel zooms, WASD/arrows pan, screen edges scroll.
// A right click without dragging is an order; a left click selects.
import type { RtsCamera } from '../render/camera';

export interface ControlHandlers {
  onLeftClick(clientX: number, clientY: number, shift: boolean): void;
  onRightClick(clientX: number, clientY: number): void;
  onKey(ev: KeyboardEvent): void;
}

const EDGE_PX = 12;
const DRAG_THRESHOLD = 5;

export class Controls {
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inside: false };
  private drag: { button: number; x: number; y: number; moved: boolean } | null = null;
  edgeScroll = true;
  private disposers: (() => void)[] = [];

  constructor(private el: HTMLElement, private cam: RtsCamera, private h: ControlHandlers) {
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener));
    };
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(el, 'pointerdown', (e: PointerEvent) => {
      this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
      if (e.button === 1) e.preventDefault();
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      const d = this.drag;
      if (!d || d.button === 0) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      // Drag the ground: move the target opposite to the pointer.
      const k = (this.cam.distance * 1.6) / el.clientHeight;
      this.cam.panWorld(-dx * k, -dy * k);
      d.x = e.clientX; d.y = e.clientY;
    });
    on(el, 'pointerup', (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved) return;
      if (e.button === 0) this.h.onLeftClick(e.clientX, e.clientY, e.shiftKey);
      else if (e.button === 2) this.h.onRightClick(e.clientX, e.clientY);
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
