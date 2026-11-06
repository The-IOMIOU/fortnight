// Rebindable keys (F-174). Actions → default key; overrides are stored per browser.
export interface KeyAction { id: string; label: string; context: 'global' | 'workers' | 'military' | 'building' | 'settler'; key: string }

export const DEFAULT_KEYS: KeyAction[] = [
  { id: 'pause', label: 'Pause / resume', context: 'global', key: ' ' },
  { id: 'faster', label: 'Faster', context: 'global', key: '=' },
  { id: 'slower', label: 'Slower', context: 'global', key: '-' },
  { id: 'stats', label: 'Continent stats', context: 'global', key: 'tab' },
  { id: 'owners', label: 'Ownership overlay', context: 'global', key: 'o' },
  { id: 'home', label: 'Jump to capital', context: 'global', key: 'home' },
  { id: 'build.house', label: 'Build house', context: 'workers', key: 'h' },
  { id: 'build.farm', label: 'Build farm', context: 'workers', key: 'f' },
  { id: 'build.lumberCamp', label: 'Build lumber camp', context: 'workers', key: 'l' },
  { id: 'build.mineCamp', label: 'Build mine camp', context: 'workers', key: 'm' },
  { id: 'build.fishingHut', label: 'Build fishing hut', context: 'workers', key: 'g' },
  { id: 'build.storehouse', label: 'Build storehouse', context: 'workers', key: 'k' },
  { id: 'build.outpost', label: 'Build outpost', context: 'workers', key: 't' },
  { id: 'build.barracks', label: 'Build barracks', context: 'workers', key: 'q' },
  { id: 'build.workshop', label: 'Build siege workshop', context: 'workers', key: 'e' },
  { id: 'build.dock', label: 'Build dock', context: 'workers', key: 'r' },
  { id: 'build.wall', label: 'Build wall line', context: 'workers', key: 'j' },
  { id: 'build.gate', label: 'Build gate', context: 'workers', key: 'n' },
  { id: 'build.tower', label: 'Build tower', context: 'workers', key: 'y' },
  { id: 'dig', label: 'Dig trench line', context: 'workers', key: 'i' },
  { id: 'build.settlement', label: 'Found settlement', context: 'settler', key: 'n' },
  { id: 'stop', label: 'Stop', context: 'military', key: 'x' },
  { id: 'hold', label: 'Hold position', context: 'military', key: 'c' },
  { id: 'retreat', label: 'Retreat home', context: 'military', key: 'v' },
  { id: 'patrol', label: 'Patrol (then click)', context: 'military', key: 'p' },
  { id: 'formation', label: 'Toggle box / line formation', context: 'military', key: 'b' },
  { id: 'ignite', label: 'Set fire (then click)', context: 'military', key: 'u' },
  { id: 'train.worker', label: 'Train worker', context: 'building', key: 'q' },
  { id: 'train.scout', label: 'Train scout', context: 'building', key: 'e' },
  { id: 'train.settler', label: 'Train settler', context: 'building', key: 'r' },
  { id: 'train.spearman', label: 'Train spearman', context: 'building', key: 'q' },
  { id: 'train.archer', label: 'Train archer', context: 'building', key: 'w' },
  { id: 'train.rider', label: 'Train rider', context: 'building', key: 'e' },
  { id: 'train.spy', label: 'Train spy', context: 'building', key: 'r' },
  { id: 'train.saboteur', label: 'Train saboteur', context: 'building', key: 't' },
  { id: 'train.ram', label: 'Build ram', context: 'building', key: 'q' },
  { id: 'train.warship', label: 'Build warship', context: 'building', key: 'q' },
  { id: 'train.transport', label: 'Build transport', context: 'building', key: 'e' },
  { id: 'upgrade', label: 'Upgrade building', context: 'building', key: 'u' },
  { id: 'ungarrison', label: 'Release garrison', context: 'building', key: 'z' },
  { id: 'demolish', label: 'Demolish building', context: 'building', key: 'delete' },
];

const STORE = 'fortnight.keys.v1';
let overrides: Record<string, string> = {};
try { overrides = JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { overrides = {}; }

export const keyFor = (id: string): string => overrides[id] ?? DEFAULT_KEYS.find((a) => a.id === id)?.key ?? '';
export function setKey(id: string, key: string): void {
  overrides[id] = key.toLowerCase();
  try { localStorage.setItem(STORE, JSON.stringify(overrides)); } catch { /* storage unavailable */ }
}
export function resetKeys(): void { overrides = {}; try { localStorage.removeItem(STORE); } catch { /* ignore */ } }
/** Normalised name of a keyboard event's key. */
export const eventKey = (e: KeyboardEvent): string => (e.key === ' ' ? ' ' : e.key.toLowerCase());
/** Pretty label for a key. */
export const keyLabel = (k: string): string => (!k ? '' : k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
/** Action ids in a context whose key matches the event. */
export function actionsFor(e: KeyboardEvent, context: KeyAction['context']): string[] {
  const k = eventKey(e);
  return DEFAULT_KEYS.filter((a) => a.context === context && keyFor(a.id) === k).map((a) => a.id);
}
