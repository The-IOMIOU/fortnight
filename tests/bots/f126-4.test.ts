// F-126 slice 4/5: headless bot-only Small matches must reach a victory within the time limit.
import { expect, it } from 'vitest';
import { f126Spec, runAll } from './common';

it('F-126 slice 4: 10 Small bot-only matches finish', () => {
  const rs = runAll('f126-4', Array.from({ length: 10 }, (_, j) => f126Spec(4 * 10 + j)));
  expect(rs.filter((r) => !r.finished).map((r) => r.seed)).toEqual([]);
});
