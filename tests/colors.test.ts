// F-175: team colors stay distinguishable under simulated color-vision deficiency.
// Simulation: Machado, Oliveira & Fernandes (2009) matrices at severity 1.0, applied in linear RGB.
// Distance: CIE76 ΔE in CIELAB (D65). Players 9–32 add a pattern + label on top of these 8 hues.
import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PLAYER_PATTERNS, playerLabel, playerPattern } from '../src/render/palette';

type V3 = [number, number, number];
const M: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (x: number): number => Math.min(1, Math.max(0, x));
function lab(rgb: V3): V3 {
  const [r, g, b] = rgb;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function simulate(c: V3, m: number[][]): V3 {
  const l = c.map(toLin) as V3;
  return [0, 1, 2].map((i) => clamp(m[i][0] * l[0] + m[i][1] * l[1] + m[i][2] * l[2])) as V3;
}
const dE = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('F-175 colorblind-friendly team colors', () => {
  it('8 base hues: minimum pairwise ΔE ≥ 12 under normal, protan, deutan and tritan vision', () => {
    const report: string[] = [];
    for (const [name, m] of Object.entries(M)) {
      const labs = PLAYER_COLORS.map((c) => lab(simulate(c, m)));
      let min = Infinity, pair = '';
      for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) {
        const d = dE(labs[i], labs[j]);
        if (d < min) { min = d; pair = `${playerLabel(i)}/${playerLabel(j)}`; }
      }
      report.push(`${name}: min ΔE ${min.toFixed(1)} (${pair})`);
      expect(min).toBeGreaterThanOrEqual(12);
    }
    console.log('[F-175] ' + report.join(' | '));
  });
  it('players 1–32 are unique by (hue, pattern) and each has a label', () => {
    const keys = new Set<string>();
    for (let p = 0; p < 32; p++) keys.add(`${p % PLAYER_COLORS.length}/${playerPattern(p)}`);
    expect(keys.size).toBe(32);
    expect(PLAYER_PATTERNS.length * PLAYER_COLORS.length).toBeGreaterThanOrEqual(32);
    expect(playerLabel(31)).toBe('P32');
  });
});
