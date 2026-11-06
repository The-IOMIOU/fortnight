// Curved "globe" look (F-195): every material bends vertices down with the square of their distance
// from the camera in view space, so the horizon curves away like a planet. Display only — the sim
// and picking work on the flat map (picking undoes the bend). Strength 0 = flat.
import * as THREE from 'three';

export const CURVE = { value: 0 };

const PATCH = '#include <project_vertex>\nmvPosition.y -= uCurve * dot(mvPosition.xz, mvPosition.xz);\ngl_Position = projectionMatrix * mvPosition;';

export function curveMaterial(m: THREE.Material): void {
  const mm = m as THREE.Material & { __curved?: boolean };
  if (mm.__curved || m instanceof THREE.ShaderMaterial) return; // the terrain shader bends itself
  mm.__curved = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uCurve = CURVE;
    sh.vertexShader = 'uniform float uCurve;\n' + sh.vertexShader.replace('#include <project_vertex>', PATCH);
  };
  m.needsUpdate = true;
}

/** Patch every material under `root` (cheap: already-patched materials are skipped). */
export function curveScene(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach(curveMaterial); else curveMaterial(mat);
  });
}

/** Curvature for a map of width w at strength s (1 ≈ a true sphere whose circumference is the map). */
export const curveFor = (w: number, s: number): number => (s * Math.PI) / w;
