// Test options ("cheats", F-197/F-198): rule changes for trying things out. None of them ever adds
// resources. Turning any on needs a separate confirmation, and the run is then marked as modified.
import { useState } from 'preact/hooks';
import { TestOpt } from '../sim/sim';

export const TEST_OPTIONS: { flag: number; id: string; name: string; desc: string }[] = [
  { flag: TestOpt.REVEAL, id: 'reveal', name: 'See the whole map', desc: 'No fog of war for you: every tile and unit is visible.' },
  { flag: TestOpt.NO_HOUSING, id: 'nohousing', name: 'Unlimited units', desc: 'Housing no longer limits training (costs still apply).' },
  { flag: TestOpt.INSTANT_BUILD, id: 'instantbuild', name: 'Instant building', desc: 'Your buildings finish the moment you place them (costs still apply).' },
  { flag: TestOpt.INSTANT_TRAIN, id: 'instanttrain', name: 'Instant training', desc: 'Units come out in a tenth of a second (costs still apply).' },
  { flag: TestOpt.INVULNERABLE, id: 'invulnerable', name: 'Invulnerable', desc: 'Your units and buildings take no damage.' },
  { flag: TestOpt.PEACEFUL_BOTS, id: 'peaceful', name: 'Peaceful bots', desc: 'Bots defend themselves but never start an attack.' },
  { flag: TestOpt.FAST_SPEEDS, id: 'fastspeeds', name: 'Extra speeds', desc: 'Adds 8× and 16× game speed.' },
];

/** Checkbox list. Turning an option on asks first (unless the run is already modified and confirmed). */
export function TestOptionList({ mask, onChange, modified }: { mask: number; onChange: (mask: number) => void; modified: boolean }) {
  const [ask, setAsk] = useState<number>(0);
  return (
    <div class="testopts" data-testid="test-options">
      <p class="later">These change the rules to test things. They never give resources. Turning one on marks this run as <b>Modified</b> for good.</p>
      {TEST_OPTIONS.map((o) => (
        <label class="row" title={o.desc}>
          <input type="checkbox" checked={(mask & o.flag) !== 0} data-testid={'opt-' + o.id}
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              (e.target as HTMLInputElement).checked = (mask & o.flag) !== 0; // wait for the answer
              if (on) setAsk(o.flag); else onChange(mask & ~o.flag);
            }} />
          {o.name} <small>{o.desc}</small>
        </label>
      ))}
      {ask !== 0 && (
        <div class="modal confirm" role="alertdialog" aria-label="Confirm test option" data-testid="opt-confirm">
          <div class="panel">
            <h2>Turn on “{TEST_OPTIONS.find((o) => o.flag === ask)?.name}”?</h2>
            <p>{modified ? 'This run is already marked as modified.' : 'This invalidates your run: it will be marked as Modified in the game, on the end screen and in your save, and that can’t be undone.'}</p>
            <div class="row">
              <button class="primary warn-btn" data-testid="opt-confirm-yes" onClick={() => { onChange(mask | ask); setAsk(0); }}>Turn it on</button>
              <button data-testid="opt-confirm-no" onClick={() => setAsk(0)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
