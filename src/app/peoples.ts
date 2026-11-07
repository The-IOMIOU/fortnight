// Save slots for made-up peoples (F-208), kept in this browser. Valid ones are registered at startup so they
// can be picked like the shipped peoples; a match carries them in its settings (saves and multiplayer).
import { TUNING } from '../sim/core/tuning';
import { ensureRaces, raceById, validateRace, type AbilityId, type RaceDef, type RaceError, type StatKey } from '../sim/races';

const KEY = 'fortnight.peoples.v1';

export interface PeopleDraft { name: string; base: string; stats: Record<StatKey, number>; abilities: AbilityId[] }

export function loadSlots(): (RaceDef | null)[] {
  let raw: unknown = [];
  try { raw = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* storage unavailable */ }
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: TUNING.races.custom.slots }, (_, i) => {
    const r = list[i] as RaceDef | null;
    return r && typeof r === 'object' && !validateRace(r).length ? r : null;
  });
}
function writeSlots(s: (RaceDef | null)[]): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

/** Stable id from the content: the same people always gets the same id, two different ones never share it. */
function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Turn a builder draft into a full people: troops, building and evolution tree come from the base people. */
export function draftToRace(d: PeopleDraft): RaceDef {
  const b = raceById(d.base);
  const core = { name: d.name.trim() || 'My people', base: b.id, stats: d.stats, abilities: d.abilities };
  return {
    ...b, id: 'custom_' + hashId(JSON.stringify(core)), name: core.name, custom: true, base: b.id, reference: undefined,
    description: `A people you made. Troops, special building and evolution from the ${b.name}.`,
    stat_modifiers: { ...d.stats }, special_ability: null, weakness: null, extra_abilities: [...d.abilities],
  };
}
export function raceToDraft(r: RaceDef): PeopleDraft {
  return { name: r.name, base: r.base ?? r.id, stats: { ...r.stat_modifiers }, abilities: [r.special_ability, r.weakness, ...(r.extra_abilities ?? [])].filter((a): a is AbilityId => !!a) };
}

/** Save into slot i; only a valid (balanced) people is saved. Returns the errors, empty when saved. */
export function saveSlot(i: number, r: RaceDef): RaceError[] {
  const errs = validateRace(r);
  if (errs.length) return errs;
  const s = loadSlots(); s[i] = r; writeSlots(s);
  ensureRaces([r]);
  return [];
}
export function clearSlot(i: number): void { const s = loadSlots(); s[i] = null; writeSlots(s); }

/** Register every saved people (called once at startup). */
export function registerSavedPeoples(): void { ensureRaces(loadSlots().filter((r): r is RaceDef => !!r)); }
