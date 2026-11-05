// Converts real elapsed time into a whole number of sim ticks for the current speed.
// Lives outside the deterministic core: it only decides *how many* ticks run, never what they do.

export class TickScheduler {
  private acc = 0;
  speed = 1;
  paused = false;
  droppedTicks = 0;
  constructor(readonly tickHz: number, readonly maxCatchUp: number) {}
  advance(dtMs: number): number {
    if (this.paused || dtMs <= 0) return 0;
    this.acc += (dtMs * this.tickHz * this.speed) / 1000;
    let n = Math.floor(this.acc);
    if (n > this.maxCatchUp) { this.droppedTicks += n - this.maxCatchUp; n = this.maxCatchUp; this.acc = 0; }
    else this.acc -= n;
    return n;
  }
  /** Fraction of the way to the next tick (for render interpolation). */
  get alpha(): number { return this.acc; }
}
