// F-127: Medium match length (target 30–60 min) — reported, not asserted; Small lengths come from F-126.
import { expect, it } from 'vitest';
import { f126Spec, median, runAll } from './common';

it('F-127 Medium bot-only match lengths are reported', () => {
  const rs = runAll('f127-medium', Array.from({ length: 4 }, (_, k) => {
    const s = f126Spec(k, 'medium');
    return { ...s, bots: [...s.bots, ...s.bots.map((b, j) => ({ ...b, player: s.bots.length + j }))] }; // 4–8 bots
  }));
  const done = rs.filter((r) => r.finished).map((r) => r.minutes);
  console.log(`[F-127] Medium: ${done.length}/${rs.length} finished; median ${median(done).toFixed(1)} min (target 30–60)`);
  expect(rs.length).toBe(4);
});
