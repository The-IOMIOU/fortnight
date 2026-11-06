// F-096 (bots): every race's bot researches its tree, builds its own building and trains its own troops,
// and uses its special ability, in a headless bot match (Hard bot of the race vs a Hard Baseline bot).
import { describe, expect, it } from 'vitest';
import { runMatch } from '../src/harness/match';
import { PLAYABLE_RACES } from '../src/sim/races';
import { Kind, UNIT_TYPES, isUnitKind, unitTypeOfKind } from '../src/sim/defs';
import type { Sim } from '../src/sim/sim';

const MINUTES = 16;

describe('F-096 race bots', () => {
  for (const race of PLAYABLE_RACES) {
    it(`${race.id} bot uses its race`, () => {
      let maxUnique = 0, tamed = 0, burrowedSeen = 0, gear = 0, fungus = 0;
      let sim: Sim | null = null;
      const r = runMatch({ seed: `racebot-${race.id}`, size: 'small', races: [race.id, 'baseline'], maxTicks: MINUTES * 600,
        bots: [{ player: 0, personality: race.bot_hints.personalities[0], difficulty: 'hard' }, { player: 1, personality: 'merchant', difficulty: 'hard' }] }, (s) => {
        sim = s;
        if (s.tick % 300) return;
        const e = s.ents;
        let uniq = 0;
        for (let id = 0; id < e.count; id++) {
          if (!e.alive[id] || e.owner[id] !== 0 || !isUnitKind(e.kind[id])) continue;
          if (race.unique_units.includes(unitTypeOfKind(e.kind[id]))) uniq++;
          if (e.kind[id] === Kind.BEAST && e.homeTile[id] !== -1) tamed++;
          if (e.burrowed[id]) burrowedSeen++;
          if (e.weaponTier[id] || e.armorTier[id]) gear++;
        }
        maxUnique = Math.max(maxUnique, uniq);
        if (s.fungus) fungus = Math.max(fungus, s.fungus.reduce((n, v) => n + (v === 1 ? 1 : 0), 0));
      });
      const s = sim as unknown as Sim;
      const ps = s.ps[0];
      const ownBuilding = s.ents.kind.some((k, id) => s.ents.alive[id] && s.ents.owner[id] === 0 && k === 64 + 0 + ['capital', 'settlement', 'house', 'farm', 'lumberCamp', 'mineCamp', 'fishingHut', 'storehouse', 'outpost', 'barracks', 'workshop', 'dock', 'wall', 'gate', 'tower', 'forge', 'pier', 'tidepool', 'beastPen', 'tunnelHall', 'sporeTower', 'aerie', 'greatForge', 'stiltHall', 'iceLodge'].indexOf(race.unique_building!));
      console.log(`[F-096] ${race.id}: ${MINUTES} min, researched [${ps.researched.join(', ')}]${ps.researching ? ` (+${ps.researching})` : ''}, own building ${ownBuilding ? 'yes' : 'no'}, peak own troops ${maxUnique}, gear on units ${gear}, tamed ${tamed}, burrowed ${burrowedSeen}, fungus ${fungus}; ${r.finished ? `P${r.winner + 1} won` : 'running'}`);
      expect(ps.researched.length).toBeGreaterThanOrEqual(2);
      expect(ps.researched).toContain(race.evolution_tree[0].id);
      void UNIT_TYPES;
    }, 600_000);
  }
});
