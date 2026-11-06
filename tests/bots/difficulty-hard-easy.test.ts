// F-121: Hard beats Easy in at least 80 % of 1v1 matches (same personality on both sides, sides swapped).
import { expect, it } from 'vitest';
import { runAll } from './common';
import { PERSONALITIES } from '../../src/ai/utility';
import type { MatchSpec } from '../../src/harness/match';

it('F-121 Hard vs Easy ≥ 80 %', () => {
  const specs: MatchSpec[] = Array.from({ length: 10 }, (_, k) => {
    const pers = PERSONALITIES[k % PERSONALITIES.length].id, hardFirst = k % 2 === 0;
    return { seed: `diff-he-${k}`, size: 'small', bots: [0, 1].map((p) => ({ player: p, personality: pers, difficulty: (p === 0) === hardFirst ? 'hard' as const : 'easy' as const })) };
  });
  const rs = runAll('difficulty-hard-easy', specs);
  const wins = rs.filter((r) => r.finished && r.metrics[r.winner].difficulty === 'hard').length;
  console.log(`[F-121] Hard won ${wins}/${rs.length} vs Easy`);
  expect(wins / rs.length).toBeGreaterThanOrEqual(0.8);
});
