// F-123: personalities are data and behave measurably differently. Four-bot Small matches (first
// 30 minutes) with Expansionist, Defender, Berserker and Merchant in rotating start slots.
import { expect, it } from 'vitest';
import { median, runAll } from './common';
import type { MatchSpec } from '../../src/harness/match';

const CAST = ['expansionist', 'defender', 'berserker', 'merchant'];

it('F-123 personality metrics differ (Expansionist settles most, Defender fortifies most, Berserker attacks first)', () => {
  const specs: MatchSpec[] = Array.from({ length: 8 }, (_, k) => ({
    seed: `pers-${k}`, size: 'small', maxTicks: 30 * 600,
    bots: CAST.map((_, p) => ({ player: p, personality: CAST[(p + k) % 4], difficulty: 'hard' as const })),
  }));
  const rs = runAll('personalities', specs);
  const all = rs.flatMap((r) => r.metrics);
  const by = (id: string) => all.filter((m) => m.personality === id);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const settle = Object.fromEntries(CAST.map((id) => [id, mean(by(id).map((m) => m.settlementsFounded))]));
  const fort = Object.fromEntries(CAST.map((id) => [id, mean(by(id).map((m) => m.walls + m.towers))]));
  const first = Object.fromEntries(CAST.map((id) => [id, median(by(id).map((m) => (m.firstAttack < 0 ? 99 : m.firstAttack / 600)))]));
  console.log(`[F-123] settlements founded (mean): ${JSON.stringify(settle)}`);
  console.log(`[F-123] walls+towers (mean peak): ${JSON.stringify(fort)}`);
  console.log(`[F-123] first attack (median minute, 99 = never): ${JSON.stringify(first)}`);
  for (const id of CAST) if (id !== 'expansionist') expect(settle.expansionist).toBeGreaterThan(settle[id]);
  for (const id of CAST) if (id !== 'defender') expect(fort.defender).toBeGreaterThan(fort[id]);
  for (const id of CAST) if (id !== 'berserker') expect(first.berserker).toBeLessThan(first[id]);
});
