// People picker gallery (F-209) and people builder with save slots (F-208).
// Picker: every people as a card; the chosen one shows its buffs (+) and debuffs (−) in plain words with
// their point numbers, an animated preview of each ability, its own troops and its evolution branches.
// Builder: pick buffs and debuffs, each with a number; buffs are positive, debuffs negative, bigger effects
// bigger numbers. Save and play only when the total is 0 or less and there are at most 3 buffs.
import { useEffect, useRef, useState } from 'preact/hooks';
import { TUNING } from '../sim/core/tuning';
import { ABILITY_IDS, PLAYABLE_RACES, RACES, STAT_KEYS, raceBuffs, raceById, racePoints, validateRace, type AbilityId, type RaceDef, type StatKey } from '../sim/races';
import type { UnitTypeName, BuildingTypeName } from '../sim/defs';
import { ABILITY_NAME, ABILITY_TEXT, STAT_LABEL, raceTraits, signed, statPhrase, unlockLines } from './describe';
import { drawPreview, PREVIEW_H, PREVIEW_W } from './previews';
import { BUILDING_NAMES, UNIT_NAMES } from './names';
import { clearSlot, draftToRace, loadSlots, raceToDraft, saveSlot, type PeopleDraft } from '../app/peoples';

/** Looping animated preview; cycles through `ids` every 4 s unless one is chosen. */
export function AbilityPreview({ ids, pick }: { ids: string[]; pick?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cur, setCur] = useState(0);
  const id = pick && ids.includes(pick) ? pick : ids[cur % Math.max(1, ids.length)];
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d');
    if (!cv || !c || !id) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number): void => {
      const t = ((now - t0) / 4000) % 1;
      drawPreview(c, id, t);
      if (!pick && now - t0 > 4000 && ids.length > 1) { setCur((k) => k + 1); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [id, pick, ids.join(',')]);
  if (!ids.length) return null;
  return (
    <figure class="preview" data-testid="ability-preview" data-ability={id}>
      <canvas ref={ref} width={PREVIEW_W} height={PREVIEW_H} />
      <figcaption>{ABILITY_NAME[id] ?? id}</figcaption>
    </figure>
  );
}

function Traits({ race, onPick, picked }: { race: RaceDef; onPick?: (a: string) => void; picked?: string }) {
  return (
    <ul class="traits" data-testid="people-traits">
      {raceTraits(race).map((t) => (
        <li class={'trait ' + t.kind + (t.ability && t.ability === picked ? ' on' : '')} onClick={() => t.ability && onPick?.(t.ability)} title={t.ability ? 'Show it in the preview' : ''}>
          <span class={'pts ' + t.kind}>{signed(t.points)}</span>
          <div><b>{t.kind === 'buff' ? '▲' : '▼'} {t.name}</b><small>{t.text}</small></div>
        </li>
      ))}
    </ul>
  );
}

function Evolution({ race }: { race: RaceDef }) {
  if (!race.evolution_tree.length) return <p class="muted">No own evolution: this people only uses the shared tech tree.</p>;
  const trunk = race.evolution_tree.filter((n) => !n.branch), branches = [...new Set(race.evolution_tree.filter((n) => n.branch).map((n) => n.branch!))];
  const steps = (ns: typeof trunk) => <ol>{ns.map((n) => <li><b>{n.name}</b>{n.capstone && <small class="tag">capstone</small>} <small>{unlockLines(n.unlocks).join('. ')}</small></li>)}</ol>;
  return (
    <div class="evo" data-testid="people-evolution">
      <div><h5>Own path</h5>{steps(trunk)}</div>
      {branches.map((b) => <div class="branch"><h5>Branch: {b}</h5>{steps(race.evolution_tree.filter((n) => n.branch === b))}</div>)}
      {branches.length === 2 && <small class="muted">You pick one branch during the match; the other one closes.</small>}
    </div>
  );
}

export function PeoplePicker({ value, onPick, onClose, onBuild }: { value: string; onPick: (id: string) => void; onClose: () => void; onBuild: (edit?: RaceDef) => void }) {
  const [sel, setSel] = useState(value);
  const [ab, setAb] = useState<string | undefined>(undefined);
  const race = raceById(sel);
  const abil = raceTraits(race).filter((t) => t.ability).map((t) => t.ability!);
  const list = [...PLAYABLE_RACES.filter((r) => !r.custom), ...RACES.filter((r) => r.reference), ...RACES.filter((r) => r.custom)];
  return (
    <div class="modal" data-testid="people-picker" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="panel people-panel">
        <div class="sel-title">Choose your people <button onClick={onClose} aria-label="Close">✕</button></div>
        <div class="people-body">
          <div class="people-grid" role="listbox" aria-label="Peoples">
            {list.map((r) => {
              const tr = raceTraits(r);
              return (
                <button type="button" role="option" aria-selected={r.id === sel} class={'pcard' + (r.id === sel ? ' on' : '') + (r.custom ? ' custom' : '')} onClick={() => { setSel(r.id); setAb(undefined); }} data-testid={'people-' + r.id}>
                  <b>{r.name}</b>
                  <small>{r.custom ? 'Made by you' : r.reference ? 'No gifts, no weaknesses' : tr.filter((t) => t.ability).map((t) => t.name).join(' · ')}</small>
                </button>
              );
            })}
            <button type="button" class="pcard new" onClick={() => onBuild()} data-testid="people-create"><b>+ Create your own</b><small>Pick buffs and debuffs</small></button>
          </div>
          <div class="people-detail" data-testid="people-detail">
            <h3>{race.name} {race.custom && <small class="tag">made by you</small>}</h3>
            <p class="desc">{race.description}</p>
            {abil.length > 0 && <AbilityPreview ids={abil} pick={ab} />}
            <h4>Buffs and debuffs <small class="muted">(click one to see it)</small></h4>
            <Traits race={race} onPick={setAb} picked={ab} />
            <div class="pts-total">Total: <b>{signed(racePoints(race))}</b> <small class="muted">{race.custom ? 'made-up peoples total 0 or less' : 'every people is balanced to 0'}</small></div>
            {race.unique_units.length > 0 && <>
              <h4>Own troops and building</h4>
              <p>{race.unique_units.map((u) => UNIT_NAMES[u as UnitTypeName]).join(', ')}{race.unique_building ? ' · ' + BUILDING_NAMES[race.unique_building as BuildingTypeName] : ''}</p>
            </>}
            <h4>Evolution</h4>
            <Evolution race={race} />
            <p class="muted">Likes: {race.biome_preference.join(', ')}. {race.bot_hints.strategy}</p>
            <div class="row">
              <button class="primary" onClick={() => onPick(race.id)} data-testid="people-choose">Play as {race.name}</button>
              {race.custom && <button onClick={() => onBuild(race)} data-testid="people-edit">Edit</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEP = TUNING.races.statPctPerPoint;
const A = TUNING.races.abilities as Record<string, { points: number }>;
const freshDraft = (): PeopleDraft => ({ name: '', base: PLAYABLE_RACES[0].id, stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 100])) as Record<StatKey, number>, abilities: [] });

export function PeopleBuilder({ edit, onClose, onPlay }: { edit?: RaceDef; onClose: () => void; onPlay: (id: string) => void }) {
  const [d, setD] = useState<PeopleDraft>(edit ? raceToDraft(edit) : freshDraft());
  const [slots, setSlots] = useState(loadSlots());
  const [slot, setSlot] = useState(() => Math.max(0, edit ? slots.findIndex((s) => s?.id === edit.id) : slots.findIndex((s) => !s)));
  const [peek, setPeek] = useState<string | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const race = draftToRace(d);
  const total = racePoints(race), buffs = raceBuffs(race), errs = validateRace(race);
  const max = TUNING.races.custom.maxBuffs;
  const ok = !errs.length;
  const setStat = (k: StatKey, v: number): void => setD({ ...d, stats: { ...d.stats, [k]: Math.max(TUNING.races.statMin, Math.min(TUNING.races.statMax, v)) } });
  const toggle = (a: AbilityId): void => { setPeek(a); setD({ ...d, abilities: d.abilities.includes(a) ? d.abilities.filter((x) => x !== a) : [...d.abilities, a] }); };
  const save = (): string | null => {
    const e = saveSlot(slot, race);
    if (e.length) { setMsg(e[0].message); return null; }
    setSlots(loadSlots()); setMsg(`Saved in slot ${slot + 1}.`);
    return race.id;
  };
  const buffsList = ABILITY_IDS.filter((a) => A[a].points > 0).sort((x, y) => A[y].points - A[x].points);
  const debuffList = ABILITY_IDS.filter((a) => A[a].points < 0).sort((x, y) => A[x].points - A[y].points);
  const chip = (a: AbilityId) => (
    <button type="button" class={'chip ' + (A[a].points > 0 ? 'buff' : 'debuff') + (d.abilities.includes(a) ? ' on' : '')} onClick={() => toggle(a)} onMouseEnter={() => setPeek(a)} title={ABILITY_TEXT[a]} data-testid={'pick-' + a}>
      <span class={'pts ' + (A[a].points > 0 ? 'buff' : 'debuff')}>{signed(A[a].points)}</span> {ABILITY_NAME[a]}
    </button>
  );
  const meter = Math.max(-30, Math.min(30, total));
  return (
    <div class="modal" data-testid="people-builder">
      <div class="panel builder-panel">
        <div class="sel-title">Make your own people <button onClick={onClose} aria-label="Close">✕</button></div>
        <small class="muted">Buffs have a plus number, debuffs a minus number; stronger ones have bigger numbers. Your total must be 0 or less, and you can have at most {max} buffs. Extra debuffs are fine.</small>
        <div class="builder-body">
          <div class="builder-left">
            <label>Name <input value={d.name} maxLength={24} placeholder="My people" onInput={(e) => setD({ ...d, name: (e.target as HTMLInputElement).value })} data-testid="builder-name" /></label>
            <label>Troops, building and evolution from
              <select value={d.base} onChange={(e) => setD({ ...d, base: (e.target as HTMLSelectElement).value })} data-testid="builder-base">
                {PLAYABLE_RACES.filter((r) => !r.custom).map((r) => <option value={r.id}>{r.name} ({r.unique_units.map((u) => UNIT_NAMES[u as UnitTypeName]).join(', ')})</option>)}
              </select>
            </label>
            <h4>Stats <small class="muted">each {STEP} % = 1 point</small></h4>
            {STAT_KEYS.map((k) => {
              const v = d.stats[k], p = Math.trunc((v - 100) / STEP);
              return (
                <div class="statrow" data-testid={'stat-' + k}>
                  <span class="sl">{STAT_LABEL[k]}</span>
                  <button type="button" onClick={() => setStat(k, v - STEP)} aria-label={`Lower ${STAT_LABEL[k]}`} data-testid={'stat-down-' + k}>−</button>
                  <b class="sv">{v} %</b>
                  <button type="button" onClick={() => setStat(k, v + STEP)} aria-label={`Raise ${STAT_LABEL[k]}`} data-testid={'stat-up-' + k}>+</button>
                  <span class={'pts ' + (p > 0 ? 'buff' : p < 0 ? 'debuff' : '')}>{signed(p)}</span>
                  <small class="muted">{p ? statPhrase(k, v - 100) : ''}</small>
                </div>
              );
            })}
            <h4>Buffs</h4>
            <div class="chips">{buffsList.map(chip)}</div>
            <h4>Debuffs</h4>
            <div class="chips">{debuffList.map(chip)}</div>
          </div>
          <div class="builder-right">
            {peek && <AbilityPreview ids={[peek]} pick={peek} />}
            {peek && <p class="desc">{ABILITY_TEXT[peek]}</p>}
            <div class={'balance' + (total > 0 ? ' bad' : '')} data-testid="builder-total">
              <div class="bal-bar"><span class="zero" /><span class="mark" style={{ left: `${50 + (meter / 30) * 50}%` }} /></div>
              <div>Total <b>{signed(total)}</b> {total > 0 ? '— too strong: add debuffs or remove buffs' : total === 0 ? '— balanced' : '— weaker than normal (allowed)'}</div>
              <div class={buffs > max ? 'bad' : ''} data-testid="builder-buffs">Buffs {buffs} / {max}</div>
            </div>
            {race.extra_abilities!.length + STAT_KEYS.filter((k) => d.stats[k] !== 100).length > 0 && <Traits race={race} onPick={setPeek} picked={peek} />}
            <h4>Save slots</h4>
            <div class="slots" data-testid="builder-slots">
              {slots.map((s, i) => (
                <div class={'slot' + (i === slot ? ' on' : '')} onClick={() => setSlot(i)} data-testid={'slot-' + i}>
                  <b>{i + 1}</b> <span>{s ? `${s.name} (${signed(racePoints(s))})` : 'empty'}</span>
                  {s && <button type="button" onClick={(e) => { e.stopPropagation(); setD(raceToDraft(s)); setSlot(i); setMsg(`Loaded slot ${i + 1}.`); }} data-testid={'slot-load-' + i}>Load</button>}
                  {s && <button type="button" onClick={(e) => { e.stopPropagation(); clearSlot(i); setSlots(loadSlots()); }} aria-label={`Delete slot ${i + 1}`} data-testid={'slot-del-' + i}>✕</button>}
                </div>
              ))}
            </div>
            {!ok && <p class="error" data-testid="builder-error">{errs[0].message}</p>}
            {msg && <p class="muted" data-testid="builder-msg">{msg}</p>}
            <div class="row">
              <button disabled={!ok} onClick={save} data-testid="builder-save">Save to slot {slot + 1}</button>
              <button class="primary" disabled={!ok} onClick={() => { const id = save(); if (id) onPlay(id); }} data-testid="builder-play">Save and play</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
