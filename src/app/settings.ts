// Player settings (UI scale, graphics quality, sound), remembered per browser when storage is available.
export type Quality = 'low' | 'medium' | 'high';
export interface Settings { uiScale: number; quality: Quality; volume: number; muted: boolean }

const KEY = 'fortnight.settings.v1';
const DEFAULTS: Settings = { uiScale: 1, quality: 'high', volume: 0.6, muted: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function applyUiScale(scale: number): void {
  document.documentElement.style.fontSize = `${15 * scale}px`;
}

/** Renderer pixel ratio and detail per quality preset (F-179). */
export function qualityParams(q: Quality): { pixelRatio: number; antialias: boolean; treeDensity: number; water: boolean } {
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  if (q === 'low') return { pixelRatio: Math.min(dpr, 1) * 0.75, antialias: false, treeDensity: 0.5, water: false };
  if (q === 'medium') return { pixelRatio: Math.min(dpr, 1.5), antialias: true, treeDensity: 1, water: true };
  return { pixelRatio: Math.min(dpr, 2), antialias: true, treeDensity: 1, water: true };
}
