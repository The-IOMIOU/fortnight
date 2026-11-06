// Space around the 3D globe view (F-195): a star field and a thin atmosphere glow at the planet's
// edge, brighter on the sunlit side. True 3D objects: the globe projection is not applied to them.
import * as THREE from 'three';

const STAR_V = /* glsl */ `
attribute float aSize; attribute float aB;
uniform float uPx; varying float vB;
void main() { vB = aB; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uPx; }`;
const STAR_F = /* glsl */ `
varying float vB;
void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p); gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * (exp(-d * 36.0) + exp(-d * 9.0) * 0.2) * vB, 1.0); }`;
const ATMO_V = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_F = /* glsl */ `
uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  float rim = pow(smoothstep(0.0, 0.3, -dot(n, v)), 2.0);
  float s = smoothstep(-0.4, 0.5, dot(n, uSun));
  vec3 c = mix(vec3(0.9, 0.45, 0.25), vec3(0.38, 0.66, 1.0), smoothstep(0.1, 0.6, s));
  gl_FragColor = vec4(c * rim * (0.12 + 1.1 * s), 1.0);
}`;

const CAP_V = /* glsl */ `
varying vec3 vN; varying vec3 vP;
void main() { vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CAP_F = /* glsl */ `
uniform vec3 uSun; uniform float uEdge; varying vec3 vN; varying vec3 vP;
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
void main() {
  vec3 n = normalize(vP); float lat = abs(n.y);
  float wob = n3(n * 9.0) * 0.6 + n3(n * 23.0) * 0.4;
  float a = smoothstep(uEdge - 0.0015, uEdge + 0.0015, lat + (wob - 0.5) * 0.02);
  if (a < 0.01) discard;
  float streak = n3(vec3(n.x * 60.0, n.y * 4.0, n.z * 60.0));
  vec3 ice = vec3(0.86, 0.92, 0.97) + (streak - 0.5) * 0.06;
  ice = mix(vec3(0.62, 0.78, 0.9), ice, smoothstep(uEdge, uEdge + 0.01, lat)); // bluish shelf at the edge
  float l = 0.5 + 0.6 * max(dot(n, uSun), 0.0);
  gl_FragColor = vec4(ice * l * a, a);
}`;

export class SpaceLayer {
  readonly group = new THREE.Group();
  private atmoU = { uSun: { value: new THREE.Vector3(1, 0, 0) } };

  /** @param capDeg degrees from each pole covered by ice */
  constructor(radius: number, pixelRatio: number, capDeg = 18) {
    this.group.userData.noGlobe = true;
    // stars on a far sphere
    const n = 2200, pos = new Float32Array(n * 3), size = new Float32Array(n), bright = new Float32Array(n);
    let s = 777;
    const r = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u), d = radius * 14;
      pos.set([k * Math.cos(a) * d, u * d, k * Math.sin(a) * d], i * 3);
      const big = r(); size[i] = big > 0.98 ? 3.2 : big > 0.9 ? 2.2 : 1.3; bright[i] = 0.3 + r() * 0.7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aB', new THREE.BufferAttribute(bright, 1));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uPx: { value: pixelRatio } }, vertexShader: STAR_V, fragmentShader: STAR_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    stars.frustumCulled = false;
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 96, 64), new THREE.ShaderMaterial({ uniforms: this.atmoU, vertexShader: ATMO_V, fragmentShader: ATMO_F, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // polar ice caps over the pinched polar rows (just above the sea surface, which is at +0.32)
    const capU = { uSun: this.atmoU.uSun, uEdge: { value: Math.cos((capDeg * Math.PI) / 180) } };
    const capMat = new THREE.ShaderMaterial({ uniforms: capU, vertexShader: CAP_V, fragmentShader: CAP_F, transparent: true, premultipliedAlpha: true, depthWrite: true });
    const caps = [0, 1].map((k) => new THREE.Mesh(new THREE.SphereGeometry(radius + 0.5, 96, 24, 0, Math.PI * 2, k ? Math.PI - (capDeg + 6) * Math.PI / 180 : 0, (capDeg + 6) * Math.PI / 180), capMat));
    for (const o of [stars, atmo, ...caps]) o.userData.noGlobe = true;
    this.group.add(stars, atmo, ...caps);
  }

  setSun(dir: THREE.Vector3): void { this.atmoU.uSun.value.copy(dir); }

  dispose(): void {
    this.group.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); });
  }
}
