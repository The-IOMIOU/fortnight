// F-193: Short mode bot-only match lengths (target median 15–25 min) — reported, not asserted.
// Same bot line-ups as F-126 (2–4 Hard bots, Small), but on the Short mode's world (globe, 2 continents, close seas).
import { expect, it } from 'vitest';
import { f126Spec, median, runAll } from './common';
import { modeSettings } from '../../src/app/modes';

it('F-193 Short mode match lengths are reported', () => {
  const { world } = modeSettings('short', { seed: 'x' });
  const rs = runAll('f193-short', Array.from({ length: 10 }, (_, k) => {
    const s = f126Spec(k);
    return { ...s, seed: `f193-short-${k}`, bots: s.bots.slice(0, 3), world };
  }));
  const done = rs.filter((r) => r.finished).map((r) => r.minutes);
  console.log(`[F-193] Short: ${done.length}/${rs.length} finished; median ${median(done).toFixed(1)} min (target 15–25)`);
  expect(rs.length).toBe(10);
});
