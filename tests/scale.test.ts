// Phase 8 F-191: per-size unit caps (even with the "no housing cap" test option).
import { expect, it } from 'vitest';
import { Sim, TestOpt } from '../src/sim/sim';
import { TUNING } from '../src/sim/core/tuning';
import { issue } from '../src/sim/scripted';

it('F-191 population stops at the per-size unit cap', () => {
  for (const size of ['small', 'huge'] as const) {
    const s = new Sim({ seed: 'cap-' + size, size, players: 2, testOptions: [TestOpt.NO_HOUSING | TestOpt.INSTANT_TRAIN, 0] });
    s.ps[0].stock = [1e7, 1e7, 1e7, 1e7, 1e7, 1e7];
    let cap = -1;
    for (let id = 0; id < s.ents.count; id++) if (s.ents.alive[id] && s.ents.owner[id] === 0 && s.ents.kind[id] === 64) cap = id;
    for (let k = 0; k < TUNING.map.sizes[size].unitCap * 3; k++) { issue(s, 0, { type: 'train', building: cap, utype: 1 }); s.step(); }
    expect(s.ps[0].pop).toBe(TUNING.map.sizes[size].unitCap);
    console.log(`[F-191] ${size}: population held at ${s.ps[0].pop} (cap ${TUNING.map.sizes[size].unitCap}) with unlimited housing`);
  }
});
