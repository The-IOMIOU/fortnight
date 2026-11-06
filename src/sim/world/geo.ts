// Map geography measurements (F-194): shortest sea crossing between continents.
import type { GameMap } from './mapgen';
import { Biome } from './mapgen';

/** Shortest sea crossing between every pair of continents in tiles (minor islands count like water:
 *  only ships cross); matrix[a*K+b], 0xffff = not connected. Wrap-aware on globes. */
export function continentGaps(m: GameMap): { k: number; gap: number[] } {
  const { w, h } = m, K = m.continentSizes.length, n = w * h;
  const gap = new Array(K * K).fill(0xffff);
  const dist = new Int32Array(n);
  for (let a = 0; a < K; a++) {
    dist.fill(-1);
    let layer: number[] = [];
    for (let i = 0; i < n; i++) if (m.continent[i] === a) { dist[i] = 0; layer.push(i); }
    // 0-1 search by layers: island tiles cost 0 (same layer), open water costs 1 (next layer)
    for (let d = 0; layer.length; d++) {
      const next: number[] = [];
      for (let qi = 0; qi < layer.length; qi++) {
        const i = layer[qi];
        if (dist[i] !== d) continue;
        const x = i % w, y = (i - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let nx = x + dx; const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          if (nx < 0 || nx >= w) { if (!m.wrap) continue; nx = (nx + w) % w; }
          const j = ny * w + nx, c = m.continent[j];
          if (c === a) continue;
          if (c !== 255) { if (d < gap[a * K + c]) gap[a * K + c] = d; continue; }
          const water = true; void Biome; // every non-continent tile costs one step
          const nd = water ? d + 1 : d;
          if (dist[j] >= 0 && dist[j] <= nd) continue;
          dist[j] = nd;
          (water ? next : layer).push(j);
        }
      }
      layer = next;
    }
  }
  return { k: K, gap };
}
