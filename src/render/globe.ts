// 3D globe view (F-195): the flat game world (x = east, y = up, z = south, in tiles) is drawn wrapped
// onto a sphere, like Earth's longitude and latitude: x → longitude (the map wraps all the way round),
// z → latitude (top row at the north pole, bottom row at the south pole), y → height above the sea.
// One vertex-shader function does it for every material, so terrain, trees, units, buildings, rings
// and effects all follow; normals are rotated into the sphere's local frame so lighting stays right.
// The simulation never sees any of this: it keeps its grid. Picking and screen positions use the
// JavaScript mirror below.
import * as THREE from 'three';

/** Shared uniforms: on (0/1) and (map width, map height, radius). */
export const GLOBE = { on: { value: 0 }, size: { value: new THREE.Vector3(1, 1, 1) } };

/** The sphere radius whose equator is the map width: a tile at the equator is 1 unit wide. */
export const globeRadius = (w: number): number => w / (2 * Math.PI);

export const GLOBE_GLSL = /* glsl */ `
uniform float uGlobeOn;
uniform vec3 uGlobeSize;
vec3 gUp(vec3 p) {
  float lon = p.x / uGlobeSize.x * 6.28318530718;
  float lat = (0.5 - p.z / uGlobeSize.y) * 3.14159265359;
  float cl = cos(lat);
  return vec3(cl * sin(lon), sin(lat), cl * cos(lon));
}
vec3 gPos(vec3 p) { return gUp(p) * (uGlobeSize.z + p.y); }
// columns: where flat east (x), up (y) and south (z) point on the sphere at p
mat3 gFrame(vec3 p) {
  float lon = p.x / uGlobeSize.x * 6.28318530718;
  vec3 up = gUp(p);
  vec3 east = vec3(cos(lon), 0.0, -sin(lon));
  vec3 north = cross(up, east);
  return mat3(east, up, -north);
}
`;

const NORMAL_PATCH = /* glsl */ `#include <defaultnormal_vertex>
if (uGlobeOn > 0.5) {
  vec4 gw = vec4(position, 1.0);
  vec3 gn = objectNormal;
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw; gn = mat3(instanceMatrix) * gn;
  #endif
  gw = modelMatrix * gw; gn = mat3(modelMatrix) * gn;
  transformedNormal = mat3(viewMatrix) * normalize(gFrame(gw.xyz) * gn);
}`;
const PROJECT_PATCH = /* glsl */ `vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
#endif
if (uGlobeOn > 0.5) { vec4 gw2 = modelMatrix * mvPosition; gw2.xyz = gPos(gw2.xyz); mvPosition = viewMatrix * gw2; }
else mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;

/** Patch a built-in material (Lambert, Basic, …) so it follows the globe. Custom shaders do it themselves. */
export function globeMaterial(m: THREE.Material): void {
  const mm = m as THREE.Material & { __globe?: boolean };
  if (mm.__globe || m instanceof THREE.ShaderMaterial || m.userData.noGlobe) return;
  mm.__globe = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uGlobeOn = GLOBE.on;
    sh.uniforms.uGlobeSize = GLOBE.size;
    sh.vertexShader = GLOBE_GLSL + sh.vertexShader.replace('#include <defaultnormal_vertex>', NORMAL_PATCH).replace('#include <project_vertex>', PROJECT_PATCH);
  };
  m.needsUpdate = true;
}

/** Patch every material under `root` (already-patched ones are skipped, so this is cheap). */
export function globeScene(root: THREE.Object3D): void {
  const on = GLOBE.on.value > 0.5;
  root.traverse((o) => {
    if (o.userData.noGlobe) return;
    // bounds are in flat map space, so three.js can't tell what is on screen on the sphere
    if (on) o.frustumCulled = false;
    const mat = (o as THREE.Mesh).material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach(globeMaterial); else globeMaterial(mat);
  });
}

// ---------------------------------------------------------------- JavaScript mirror

const TAU = Math.PI * 2;
/** Unit vector "up" at map point (x, z). */
export function globeUp(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const s = GLOBE.size.value, lon = (x / s.x) * TAU, lat = (0.5 - z / s.y) * Math.PI, cl = Math.cos(lat);
  return out.set(cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon));
}
/** World position on the globe of a flat map point. */
export function toGlobe(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return globeUp(x, z, out).multiplyScalar(GLOBE.size.value.z + y);
}
/** Map coordinates (x wrapped into [0, w)), and height above the sea, of a world point near the globe. */
export function fromGlobe(v: THREE.Vector3): { x: number; z: number; h: number } {
  const s = GLOBE.size.value, r = v.length() || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, v.y / r))), lon = Math.atan2(v.x, v.z);
  let x = (lon / TAU) * s.x; if (x < 0) x += s.x;
  return { x, z: (0.5 - lat / Math.PI) * s.y, h: r - s.z };
}
/** North tangent at a unit "up" vector (east × up gives north). */
export function northAt(up: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const lon = Math.atan2(up.x, up.z), east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  return out.crossVectors(up, east).normalize();
}
