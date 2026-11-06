// F-121: Impossible beats Hard in at least 70 % of 1v1 matches (same personality on both sides, sides swapped).
import { expect, it } from 'vitest';
import { runAll } from './common';
import { PERSONALITIES } from '../../src/ai/utility';
import type { MatchSpec } from '../../src/harness/match';

it('F-121 Impossible vs Hard ≥ 70 %', () => {
  const specs: MatchSpec[] = Array.from({ length: 10 }, (_, k) => {
    const pers = PERSONALITIES[k % PERSONALITIES.length].id, impFirst = k % 2 === 0;
    return { seed: `diff-ih-${k}`, size: 'small', bots: [0, 1].map((p) => ({ player: p, personality: pers, difficulty: (p === 0) === impFirst ? 'impossible' as const : 'hard' as const })) };
  });
  const rs = runAll('difficulty-imp-hard', specs);
  const wins = rs.filter((r) => r.finished && r.metrics[r.winner].difficulty === 'impossible').length;
  console.log(`[F-121] Impossible won ${wins}/${rs.length} vs Hard`);
  expect(wins / rs.length).toBeGreaterThanOrEqual(0.7);
});
