// Start-screen backdrop (UI only, not part of the simulation): a slowly turning planet built from a
// real generated globe map — relief-lit continents, sun glint on the oceans, drifting clouds, an
// atmosphere rim, city lights on the night side, a small moon and a twinkling star field.
import * as THREE from 'three';
import { generateMap, Biome, isWaterBiome, type GameMap } from '../sim/world/mapgen';
import { BIOME_COLORS } from './palette';

const TW = 1024, TH = 512; // equirectangular textures (row 0 = south pole)
const LAT_SPAN = 70;       // map rows cover ±70°, the rest are polar ice

const SUN = new THREE.Vector3(-0.8, 0.32, 0.42).normalize();

// ---------------------------------------------------------------- textures

function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
/** Smooth value noise on a coarse random grid, wrapping east–west (cell must divide TW). Fast enough for 0.5 M pixels. */
function field(seed: number, cell: number): (x: number, y: number) => number {
  const gw = TW / cell, gh = Math.ceil(TH / cell) + 2, g = new Float32Array(gw * gh);
  let st = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < g.length; i++) { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; g[i] = st / 4294967296; }
  return (x, y) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const xa = ((x0 % gw) + gw) % gw, xb = (xa + 1) % gw, ya = Math.min(gh - 1, Math.max(0, y0)), yb = Math.min(gh - 1, ya + 1);
    const a = g[ya * gw + xa] + (g[ya * gw + xb] - g[ya * gw + xa]) * tx, b = g[yb * gw + xa] + (g[yb * gw + xb] - g[yb * gw + xa]) * tx;
    return a + (b - a) * ty;
  };
}

/** Colour, aux (R = water, G = city lights, B = height) and cloud textures from a globe map. */
export function buildTextures(m: GameMap): { color: THREE.DataTexture; aux: THREE.DataTexture; clouds: THREE.DataTexture } {
  const W = m.w, H = m.h, N = W * H;
  // distance from land, for ocean depth colour (multi-source BFS, wraps east–west)
  const dist = new Float32Array(N).fill(99);
  const q: number[] = [];
  for (let i = 0; i < N; i++) if (!isWaterBiome(m.biome[i]) || m.biome[i] === Biome.RIVER) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (x + dx + W) % W, ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  const tileAt = (fx: number, fy: number): number => { const x = ((Math.floor(fx) % W) + W) % W, y = Math.min(H - 1, Math.max(0, Math.floor(fy))); return y * W + x; };
  const distAt = (fx: number, fy: number): number => {
    const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
    const d = (x: number, y: number): number => dist[tileAt(x + 0.5, y + 0.5)];
    return mix(mix(d(x0, y0), d(x0 + 1, y0), tx), mix(d(x0, y0 + 1), d(x0 + 1, y0 + 1), tx), ty);
  };

  // blurred land mask and heights: their bilinear contours give round coasts and smooth slopes
  const blur = (src: Float32Array, passes: number): Float32Array => {
    let a = src;
    for (let p = 0; p < passes; p++) {
      const b = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = Math.min(H - 1, Math.max(0, y + dy)); sum += a[yy * W + ((x + dx + W) % W)]; }
        b[y * W + x] = sum / 9;
      }
      a = b;
    }
    return a;
  };
  const landM = new Float32Array(N), hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) { const lw = !isWaterBiome(m.biome[i]) || m.biome[i] === Biome.RIVER; landM[i] = lw ? 1 : 0; hgt[i] = lw ? m.height[i] : 0; }
  const maskB = blur(landM, 1), hgtB = blur(hgt, 2);
  const bil = (a: Float32Array, fx: number, fy: number): number => {
    const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
    const v = (x: number, y: number): number => a[tileAt(x + 0.5, y + 0.5)];
    return mix(mix(v(x0, y0), v(x0 + 1, y0), tx), mix(v(x0, y0 + 1), v(x0 + 1, y0 + 1), tx), ty);
  };
  const col = new Uint8Array(TW * TH * 4), aux = new Uint8Array(TW * TH * 4), cl = new Uint8Array(TW * TH * 4);
  const deep = [0.04, 0.16, 0.34], mid = [0.08, 0.32, 0.52], shallow = [0.2, 0.58, 0.68];
  const fCoast = field(15, 4), wA = field(11, 32), wB = field(12, 8), wC = field(13, 32), wD = field(14, 8), fGrain = field(21, 2), fBroad = field(22, 64), fCap = field(31, 32);
  const c1 = field(41, 64), c2 = field(42, 16), c3 = field(43, 4);
  for (let py = 0; py < TH; py++) {
    const lat = -90 + ((py + 0.5) / TH) * 180;
    for (let px = 0; px < TW; px++) {
      const o = (py * TW + px) * 4;
      // organic coastlines: sample the tile grid through a smooth warp
      const wx = (wA(px, py) - 0.5) * 3.0 + (wB(px, py) - 0.5) * 1.1;
      const wy = (wC(px, py) - 0.5) * 3.0 + (wD(px, py) - 0.5) * 1.1;
      const fx = (px / TW) * W + wx, fy = ((LAT_SPAN - lat) / (2 * LAT_SPAN)) * H + wy;
      const grain = fGrain(px, py) - 0.5, broad = fBroad(px, py) - 0.5;
      const capEdge = LAT_SPAN - 4 - fCap(px, py) * 9;
      let r: number, g: number, b: number, water = 0, height = 0;
      if (Math.abs(lat) > capEdge) {
        const k = 0.86 + grain * 0.08 + broad * 0.06;
        r = 0.82 * k; g = 0.9 * k; b = 0.96 * k; height = 0.25 + grain * 0.1;
      } else {
        // bilinear blend of the four nearest tiles: smooth, curvy coasts and soft biome edges
        const gx = fx - 0.5, gy = fy - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), ax = gx - x0, ay = gy - y0;
        let landW = 0, lr = 0, lg = 0, lb = 0, lh = 0;
        for (let k = 0; k < 4; k++) {
          const tx = x0 + (k & 1), ty = y0 + (k >> 1), wgt = ((k & 1) ? ax : 1 - ax) * ((k >> 1) ? ay : 1 - ay);
          const tt = tileAt(tx + 0.5, ty + 0.5), bb = m.biome[tt];
          if (isWaterBiome(bb) && bb !== Biome.RIVER) continue;
          const c = BIOME_COLORS[bb] ?? BIOME_COLORS[Biome.PLAINS];
          landW += wgt; lr += c[0] * wgt; lg += c[1] * wgt; lb += c[2] * wgt; lh += m.height[tt] * wgt;
        }
        const t = tileAt(fx, fy), isLand = bil(maskB, fx, fy) + (fCoast(px, py) - 0.5) * 0.22 > 0.47;
        const bi = isLand ? (isWaterBiome(m.biome[t]) && m.biome[t] !== Biome.RIVER ? Biome.PLAINS : m.biome[t]) : (isWaterBiome(m.biome[t]) && m.biome[t] !== Biome.RIVER ? m.biome[t] : Biome.OCEAN);
        if (!isLand) {
          const d = Math.min(1, distAt(fx, fy) / 9), e = Math.pow(d, 0.6);
          const c = e < 0.35 ? [mix(shallow[0], mid[0], e / 0.35), mix(shallow[1], mid[1], e / 0.35), mix(shallow[2], mid[2], e / 0.35)] : [mix(mid[0], deep[0], (e - 0.35) / 0.65), mix(mid[1], deep[1], (e - 0.35) / 0.65), mix(mid[2], deep[2], (e - 0.35) / 0.65)];
          const k = 1 + broad * 0.12 + grain * 0.03;
          r = c[0] * k; g = c[1] * k; b = c[2] * k; water = 1;
          if (bi === Biome.ICE) { r = 0.78; g = 0.86; b = 0.92; water = 0.2; }
        } else {
          const base = landW > 0 ? [lr / landW, lg / landW, lb / landW] : BIOME_COLORS[bi] ?? BIOME_COLORS[Biome.PLAINS];
          const hh = Math.max(1, bil(hgtB, fx, fy) * 1.25); void lh;
          // muted, painterly palette: desaturate a little, vary with broad and fine noise
          const lum = base[0] * 0.3 + base[1] * 0.59 + base[2] * 0.11, sat = 0.8;
          const k = 0.9 + broad * 0.22 + grain * 0.1 + (hh - 2) * 0.03;
          r = mix(lum, base[0], sat) * k; g = mix(lum, base[1], sat) * k; b = mix(lum, base[2], sat) * k;
          height = Math.min(1, hh / 7 + grain * 0.06 + broad * 0.05);
          if (bi === Biome.RIVER) { r = 0.16; g = 0.42; b = 0.55; water = 0.6; }
        }
      }
      col[o] = Math.max(0, Math.min(255, r * 255)); col[o + 1] = Math.max(0, Math.min(255, g * 255)); col[o + 2] = Math.max(0, Math.min(255, b * 255)); col[o + 3] = 255;
      aux[o] = water * 255; aux[o + 2] = height * 255; aux[o + 3] = 255;
      // clouds: three octaves (the noise grids wrap east–west, so there is no seam)
      const cv = c1(px, py) * 0.62 + c2(px, py) * 0.28 + c3(px, py) * 0.1;
      const band = 0.75 + 0.25 * Math.cos((lat / 90) * Math.PI * 2.2); // storm belts
      const a = Math.max(0, Math.min(1, (cv * band - 0.43) * 3.6));
      cl[o] = 255; cl[o + 1] = 255; cl[o + 2] = 255; cl[o + 3] = a * 235;
    }
  }
  // city lights: warm clusters around good land near water (start spots first), with faint roads
  const rnd = (() => { let s = 0x9e3779b1; return (): number => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; })();
  const spots: [number, number][] = [];
  for (let i = 0; i < m.starts.length; i++) spots.push([m.starts[i] % W, Math.floor(m.starts[i] / W)]);
  for (let k = 0; spots.length < 70 && k < 20000; k++) {
    const t = Math.floor(rnd() * N), bi = m.biome[t];
    if ((bi === Biome.PLAINS || bi === Biome.COAST || bi === Biome.FOREST) && dist[t] === 0) {
      const x = t % W, y = Math.floor(t / W);
      let nearWater = false;
      for (let dy = -2; dy <= 2 && !nearWater; dy++) for (let dx = -2; dx <= 2; dx++) { const j = tileAt(x + dx + 0.5, y + dy + 0.5); if (isWaterBiome(m.biome[j])) { nearWater = true; break; } }
      if (nearWater || rnd() < 0.3) spots.push([x, y]);
    }
  }
  const toPx = (x: number, y: number): [number, number] => [((x + 0.5) / W) * TW, ((LAT_SPAN - ((y + 0.5) / H) * 2 * LAT_SPAN + 90) / 180) * TH];
  const glow = (cx: number, cy: number, rad: number, amp: number): void => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = ((Math.round(cx) + dx) % TW + TW) % TW, y = Math.round(cy) + dy;
      if (y < 0 || y >= TH) continue;
      const o = (y * TW + x) * 4;
      if (aux[o] > 128) continue; // not on water
      const v = amp * Math.exp(-(dx * dx + dy * dy) / (rad * rad * 0.35)) * (0.55 + 0.45 * rnd());
      aux[o + 1] = Math.min(255, aux[o + 1] + v * 255);
    }
  };
  for (const [sx, sy] of spots) {
    const [cx, cy] = toPx(sx, sy), size = 2 + Math.floor(rnd() * 4);
    glow(cx, cy, size + 2, 0.9);
    for (let k = 0; k < 6 + size * 2; k++) glow(cx + (rnd() - 0.5) * size * 6, cy + (rnd() - 0.5) * size * 4, 1 + Math.floor(rnd() * 2), 0.6);
  }
  for (let a = 0; a < spots.length; a++) {
    const [ax, ay] = toPx(...spots[a]);
    let best = -1, bd = 1e9;
    for (let b = 0; b < spots.length; b++) { if (b === a) continue; const [bx, by] = toPx(...spots[b]); const d = Math.hypot(bx - ax, by - ay); if (d < bd) { bd = d; best = b; } }
    if (best < 0 || bd > 70) continue;
    const [bx, by] = toPx(...spots[best]);
    for (let s = 0; s <= bd; s += 1.5) glow(mix(ax, bx, s / bd), mix(ay, by, s / bd), 1, 0.16);
  }
  const make = (data: Uint8Array, linear = true): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
    t.flipY = false; t.needsUpdate = true; void linear;
    return t;
  };
  return { color: make(col), aux: make(aux), clouds: make(cl) };
}

// ---------------------------------------------------------------- shaders

const PLANET_V = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const PLANET_F = /* glsl */ `
uniform sampler2D uColor, uAux, uClouds; uniform vec3 uSun; uniform vec2 uTexel; uniform float uCloudShift, uFade;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec4 aux = texture2D(uAux, vUv);
  // relief: bend the normal along the height-map gradient (land only)
  float hx = texture2D(uAux, vUv + vec2(uTexel.x, 0.0)).b - texture2D(uAux, vUv - vec2(uTexel.x, 0.0)).b;
  float hy = texture2D(uAux, vUv + vec2(0.0, uTexel.y)).b - texture2D(uAux, vUv - vec2(0.0, uTexel.y)).b;
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n)); vec3 b = cross(n, t);
  vec3 nb = normalize(n - (t * hx + b * hy) * 3.2 * (1.0 - aux.r));
  float sunN = dot(n, uSun);
  float day = smoothstep(-0.14, 0.28, sunN);
  vec3 albedo = texture2D(uColor, vUv).rgb;
  vec3 v = normalize(cameraPosition - vW);
  float diff = max(dot(nb, uSun), 0.0);
  // cloud shadows fall a little behind the clouds
  float shadow = texture2D(uClouds, vUv + vec2(uCloudShift - 0.004, 0.003)).a;
  vec3 col = albedo * (0.03 + 1.35 * pow(diff, 0.75) * (1.0 - shadow * 0.4));
  // warm band along the terminator
  float term = smoothstep(-0.05, 0.18, sunN) * (1.0 - smoothstep(0.18, 0.5, sunN));
  col += albedo * vec3(0.32, 0.12, 0.02) * term * 0.7;
  // sun glint on water
  vec3 h = normalize(uSun + v);
  float spec = pow(max(dot(n, h), 0.0), 140.0) * 0.9 + pow(max(dot(n, h), 0.0), 18.0) * 0.045;
  col += vec3(1.0, 0.92, 0.78) * spec * aux.r * day;
  // city lights on the night side
  col += aux.g * vec3(1.0, 0.7, 0.36) * pow(1.0 - day, 1.6) * 1.7;
  // atmosphere at the limb (day side blue, dusk orange)
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.4);
  vec3 sky = mix(vec3(1.0, 0.45, 0.2), vec3(0.32, 0.62, 1.0), smoothstep(-0.1, 0.35, sunN));
  col = mix(col, sky * (0.12 + 0.9 * day), fr * 0.62 * smoothstep(-0.35, 0.25, sunN));
  gl_FragColor = vec4(col * uFade, uFade);
}`;
const CLOUD_F = /* glsl */ `
uniform sampler2D uClouds; uniform vec3 uSun; uniform float uFade;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float a = texture2D(uClouds, vUv).a;
  float s = dot(n, uSun);
  float day = smoothstep(-0.18, 0.35, s);
  vec3 c = mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.05, 0.4, s)) * (0.04 + 0.96 * day);
  vec3 v = normalize(cameraPosition - vW);
  float limb = smoothstep(0.0, 0.35, dot(n, v)); // thin out towards the edge
  float al = a * (0.25 + 0.75 * day) * limb * 0.92 * uFade;
  gl_FragColor = vec4(c * al, al);
}`;
const ATMO_V = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_F = /* glsl */ `
uniform vec3 uSun; uniform float uFade;
varying vec3 vN; varying vec3 vW;
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  // back faces of a shell a little larger than the planet: −dot(n,v) runs from 0 at the shell's
  // outer edge to ≈0.38 at the planet's limb, so the glow hugs the planet and fades into space
  float rim = pow(smoothstep(0.0, 0.38, -dot(n, v)), 2.2);
  float s = smoothstep(-0.45, 0.55, dot(n, uSun));
  vec3 c = mix(vec3(0.95, 0.42, 0.22), vec3(0.36, 0.66, 1.0), smoothstep(0.15, 0.7, s));
  vec3 o = c * rim * (0.08 + 1.25 * s) * uFade;
  gl_FragColor = vec4(o, max(o.r, max(o.g, o.b)));
}`;
const STAR_V = /* glsl */ `
attribute float aSize; attribute float aPhase; attribute vec3 aColor;
uniform float uTime, uPx; varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.72 + 0.28 * sin(uTime * (0.6 + fract(aPhase * 7.1) * 1.8) + aPhase * 6.283);
  vA = tw; vC = aColor;
  gl_PointSize = aSize * uPx;
}`;
const STAR_F = /* glsl */ `
uniform float uFade; varying vec3 vC; varying float vA;
void main() {
  vec2 p = gl_PointCoord - 0.5; float d = dot(p, p);
  float core = exp(-d * 38.0), halo = exp(-d * 9.0) * 0.25;
  vec3 o = vC * (core + halo) * vA * uFade;
  gl_FragColor = vec4(o, max(o.r, max(o.g, o.b)));
}`;
const MOON_F = /* glsl */ `
uniform vec3 uSun; uniform float uFade; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 n = normalize(vN);
  float m = noise(vUv * vec2(24.0, 12.0)) * 0.5 + noise(vUv * vec2(60.0, 30.0)) * 0.3 + noise(vUv * vec2(7.0, 3.5)) * 0.4;
  vec3 c = mix(vec3(0.42, 0.41, 0.4), vec3(0.78, 0.76, 0.72), m);
  float d = max(dot(n, uSun), 0.0);
  gl_FragColor = vec4(c * (0.03 + pow(d, 0.8) * 1.3) * uFade, uFade);
}`;

// ---------------------------------------------------------------- scene

export type BgView = 'home' | 'panel';

let texCache: ReturnType<typeof buildTextures> | null = null;

export class PlanetBackground {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  private globe = new THREE.Group();
  private planet: THREE.Mesh | null = null;
  private clouds: THREE.Mesh | null = null;
  private moonPivot = new THREE.Group();
  private stars: THREE.Points;
  private uniforms: { uFade: { value: number } }[] = [];
  private raf = 0;
  private t0 = performance.now();
  private last = performance.now();
  private fade = 0;
  private mouse = new THREE.Vector2();
  private view: BgView = 'home';
  private pose = { x: 1.15, y: -0.1, dist: 3.9 };
  private readonly reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.globe);
    this.globe.rotation.z = 0.36; // axial tilt
    this.stars = this.makeStars();
    this.scene.add(this.stars);
    this.resize();
    addEventListener('resize', this.resize);
    addEventListener('pointermove', this.onMove);
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.frame);
    // the planet needs a generated map: build it just after the first frames so the stars appear at once
    setTimeout(() => { if (!this.disposed) this.makePlanet(); }, 30);
  }

  setView(v: BgView): void { this.view = v; }

  private makeStars(): THREE.Points {
    const n = 2600, pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n), color = new Float32Array(n * 3);
    let s = 12345;
    const r = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      // a third of the stars crowd into a galactic band
      let x: number, y: number, z: number;
      if (i % 3 === 0) { const a = r() * Math.PI * 2, off = (r() - 0.5) * 0.28; x = Math.cos(a); y = off; z = Math.sin(a); }
      else { const u = r() * 2 - 1, a = r() * Math.PI * 2, k = Math.sqrt(1 - u * u); x = k * Math.cos(a); y = u; z = k * Math.sin(a); }
      const v = new THREE.Vector3(x, y, z).normalize().applyAxisAngle(new THREE.Vector3(1, 0, 0.4).normalize(), 1.1).multiplyScalar(120);
      pos.set([v.x, v.y, v.z], i * 3);
      const big = r();
      size[i] = big > 0.985 ? 3.6 : big > 0.9 ? 2.3 : 1.3 + r() * 0.6;
      phase[i] = r();
      const t = r(); // colour temperature: blue-white to warm
      const c = t < 0.15 ? [0.75, 0.82, 1.0] : t > 0.88 ? [1.0, 0.86, 0.68] : [0.95, 0.95, 1.0];
      const b = 0.35 + r() * 0.65;
      color.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const u = { uTime: { value: 0 }, uPx: { value: this.renderer.getPixelRatio() }, uFade: { value: 0 } };
    this.uniforms.push(u);
    return new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: STAR_V, fragmentShader: STAR_F, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor }));
  }

  private makePlanet(): void {
    if (!texCache) texCache = buildTextures(generateMap('fortnight-home', 'medium', { globe: true, sea: 'mixed', continents: 5 }));
    const tex = texCache;
    const sphere = new THREE.SphereGeometry(1, 160, 96);
    const pu = { uColor: { value: tex.color }, uAux: { value: tex.aux }, uClouds: { value: tex.clouds }, uSun: { value: SUN }, uTexel: { value: new THREE.Vector2(1 / TW, 1 / TH) }, uCloudShift: { value: 0 }, uFade: { value: 0 } };
    this.planet = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PLANET_V, fragmentShader: PLANET_F }));
    const cu = { uClouds: { value: tex.clouds }, uSun: { value: SUN }, uFade: { value: 0 } };
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 80), new THREE.ShaderMaterial({ uniforms: cu, vertexShader: PLANET_V, fragmentShader: CLOUD_F, transparent: true, depthWrite: false, premultipliedAlpha: true }));
    const au = { uSun: { value: SUN }, uFade: { value: 0 } };
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.085, 96, 64), new THREE.ShaderMaterial({ uniforms: au, vertexShader: ATMO_V, fragmentShader: ATMO_F, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor }));
    this.globe.add(this.planet, this.clouds);
    this.scene.add(atmo);
    atmo.userData.follow = true;
    const mu = { uSun: { value: SUN }, uFade: { value: 0 } };
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 48, 32), new THREE.ShaderMaterial({ uniforms: mu, vertexShader: PLANET_V, fragmentShader: MOON_F }));
    moon.position.set(-1.6, 0.66, 0.8); // in front, upper left of the planet: lit by the sun
    this.moonPivot.add(moon);
    this.moonPivot.rotation.set(0, 0, 0);
    this.scene.add(this.moonPivot);
    this.uniforms.push(pu, cu, au, mu);
    this.atmo = atmo;
    this.cloudU = pu;
    this.canvas.dataset.planet = 'ready'; // for tests: the planet is built
  }
  private atmo: THREE.Mesh | null = null;
  private cloudU: { uCloudShift: { value: number } } | null = null;

  private resize = (): void => {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };
  private onMove = (e: PointerEvent): void => { this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5); };
  private onVis = (): void => { if (!document.hidden) { this.last = performance.now(); } };

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    // composition: planet to the right on wide screens, low and centred on tall ones
    const wide = this.camera.aspect >= 1.05;
    const target = this.view === 'home'
      ? (wide ? { x: 0.95, y: -0.02, dist: 4.25 } : { x: 0, y: -1.75, dist: 5.6 })
      : (wide ? { x: 1.55, y: -0.1, dist: 4.9 } : { x: 0, y: -1.5, dist: 5.2 });
    const k = 1 - Math.exp(-dt * (this.view === 'home' ? 0.9 : 1.6));
    this.pose.x += (target.x - this.pose.x) * k; this.pose.y += (target.y - this.pose.y) * k; this.pose.dist += (target.dist - this.pose.dist) * k;
    const par = this.reduced ? 0 : 0.06;
    this.camera.position.set(-this.pose.x + this.mouse.x * par, -this.pose.y - this.mouse.y * par, this.pose.dist);
    this.camera.lookAt(-this.pose.x, -this.pose.y, 0);
    const spin = this.reduced ? 0.004 : 0.018;
    if (this.planet && this.clouds) {
      this.planet.rotation.y += dt * spin;
      this.clouds.rotation.y += dt * spin * 1.18;
      if (this.cloudU) this.cloudU.uCloudShift.value = -(this.clouds.rotation.y - this.planet.rotation.y) / (Math.PI * 2);
      this.moonPivot.rotation.y = Math.sin(t * 0.02) * 0.35; // drifts back and forth, never behind the planet
      this.fade = Math.min(1, this.fade + dt * 0.55);
    }
    this.stars.rotation.y = t * 0.0025;
    const starFade = Math.min(1, t * 0.8);
    for (const u of this.uniforms) u.uFade.value = u === this.uniforms[0] ? starFade : this.fade * (2 - this.fade); // ease-out
    (this.uniforms[0] as unknown as { uTime: { value: number } }).uTime.value = t;
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.frames = String(++this.frames);
  };
  private frames = 0;

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    removeEventListener('pointermove', this.onMove);
    document.removeEventListener('visibilitychange', this.onVis);
    this.scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | undefined; mat?.dispose?.(); });
    this.renderer.dispose();
  }
}
