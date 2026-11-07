// Short looping "videos" of every ability module for the people picker and builder (F-209). Each scene is
// drawn on a small 2D canvas from the loop time t (0…1), with simple shapes: ground, water, people,
// houses and bars. "Yours" is drawn in blue, normal/enemy in grey or red.
type Ctx = CanvasRenderingContext2D;
const YOU = '#5fb3ff', THEM = '#d9675b', NORMAL = '#9aa6b5';
const W = 240, H = 135;

function sky(c: Ctx, night = 0): void {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix('#78b6e8', '#0d1630', night)); g.addColorStop(1, mix('#cfe6f5', '#1d2a4a', night));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function mix(a: string, b: string, k: number): string {
  const p = (s: string, i: number): number => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) * (1 - k) + p(b, i) * k)).join(',')})`;
}
function ground(c: Ctx, color: string, y = 100, x0 = 0, x1 = W): void { c.fillStyle = color; c.fillRect(x0, y, x1 - x0, H - y); }
function water(c: Ctx, x0: number, x1: number, y = 100, t = 0): void {
  c.fillStyle = '#2f6fa8'; c.fillRect(x0, y - 2, x1 - x0, H - y + 2);
  c.strokeStyle = '#8cc8f0'; c.lineWidth = 1; c.beginPath();
  for (let x = x0; x <= x1; x += 4) c.lineTo(x, y - 2 + Math.sin(x / 9 + t * 12) * 1.2);
  c.stroke();
}
function person(c: Ctx, x: number, y: number, color: string, t = 0, s = 1, alpha = 1): void {
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(s, s);
  const sw = Math.sin(t * 40) * 3;
  c.strokeStyle = '#1a1f27'; c.lineWidth = 2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -8); c.lineTo(-sw, 0); c.moveTo(0, -8); c.lineTo(sw, 0); c.stroke();
  c.fillStyle = color; c.fillRect(-3.5, -17, 7, 10);
  c.fillStyle = '#f0c9a0'; c.beginPath(); c.arc(0, -20, 3.4, 0, 7); c.fill();
  c.restore();
}
function house(c: Ctx, x: number, y: number, color: string, w = 26): void {
  c.fillStyle = '#c9b48f'; c.fillRect(x - w / 2, y - w * 0.6, w, w * 0.6);
  c.fillStyle = color; c.beginPath(); c.moveTo(x - w / 2 - 3, y - w * 0.6); c.lineTo(x, y - w); c.lineTo(x + w / 2 + 3, y - w * 0.6); c.fill();
  c.fillStyle = '#5a4630'; c.fillRect(x - 3, y - 9, 6, 9);
}
function tower(c: Ctx, x: number, y: number, color: string): void {
  c.fillStyle = '#8f8a80'; c.fillRect(x - 7, y - 34, 14, 34);
  c.fillStyle = color; c.fillRect(x - 9, y - 38, 18, 6);
}
function wall(c: Ctx, x: number, y: number, h = 26): void { c.fillStyle = '#8f8a80'; c.fillRect(x - 5, y - h, 10, h); c.fillStyle = '#6f6a60'; for (let k = 0; k < h; k += 6) c.fillRect(x - 5, y - h + k, 10, 1); }
function tree(c: Ctx, x: number, y: number, k = 1): void {
  c.fillStyle = '#5a3d22'; c.fillRect(x - 1.5, y - 8 * k, 3, 8 * k);
  c.fillStyle = '#2f7a3a'; c.beginPath(); c.moveTo(x - 9 * k, y - 6 * k); c.lineTo(x, y - 28 * k); c.lineTo(x + 9 * k, y - 6 * k); c.fill();
}
function ship(c: Ctx, x: number, y: number, color: string, dir = 1): void {
  c.fillStyle = '#6b4a2b'; c.beginPath(); c.moveTo(x - 14, y - 6); c.lineTo(x + 14, y - 6); c.lineTo(x + 9 * dir, y + 2); c.lineTo(x - 9 * dir, y + 2); c.fill();
  c.fillStyle = color; c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x, y - 8); c.lineTo(x + 11 * dir, y - 10); c.fill();
  c.strokeStyle = '#3a2a18'; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x, y - 27); c.stroke();
}
function animal(c: Ctx, x: number, y: number, color: string, t = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y - 8, 9, 5, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(x + 9, y - 11, 3.5, 0, 7); c.fill();
  c.strokeStyle = color; c.lineWidth = 2; const s = Math.sin(t * 40) * 2;
  c.beginPath(); c.moveTo(x - 5, y - 4); c.lineTo(x - 5 + s, y); c.moveTo(x + 5, y - 4); c.lineTo(x + 5 - s, y); c.stroke();
}
function hp(c: Ctx, x: number, y: number, frac: number, color = '#6fd39a', w = 22): void {
  c.fillStyle = '#0008'; c.fillRect(x - w / 2, y, w, 4);
  c.fillStyle = frac < 0.35 ? '#ff7a6a' : color; c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4);
}
function label(c: Ctx, text: string, x: number, y: number, color = '#fff', size = 10, align: CanvasTextAlign = 'center'): void {
  c.font = `600 ${size}px system-ui, sans-serif`; c.textAlign = align; c.lineWidth = 3; c.strokeStyle = '#000a'; c.strokeText(text, x, y); c.fillStyle = color; c.fillText(text, x, y);
}
/** Two bars racing: normal vs yours (rate in % of normal). */
function race(c: Ctx, t: number, rate: number, what: string, y = 18): void {
  const n = Math.min(1, t * 1.6), m = Math.min(1, (t * 1.6 * rate) / 100);
  c.fillStyle = '#000a'; c.fillRect(8, y - 12, W - 16, 38);
  label(c, 'Normal', 14, y, NORMAL, 9, 'left'); label(c, 'Yours', 14, y + 16, YOU, 9, 'left');
  c.fillStyle = '#ffffff1a'; c.fillRect(52, y - 8, W - 66, 7); c.fillRect(52, y + 8, W - 66, 7);
  c.fillStyle = NORMAL; c.fillRect(52, y - 8, (W - 66) * n, 7);
  c.fillStyle = rate >= 100 ? '#6fd39a' : '#ff8a7a'; c.fillRect(52, y + 8, (W - 66) * m, 7);
  label(c, what, W - 14, y + 3 + 16 + 12, '#fff', 9, 'right');
}
function sun(c: Ctx, x: number, y: number): void { c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
function moon(c: Ctx, x: number, y: number): void { c.fillStyle = '#e8ecf5'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.fillStyle = '#0d1630'; c.beginPath(); c.arc(x + 3, y - 2, 6, 0, 7); c.fill(); }
function bolt(c: Ctx, x1: number, y1: number, x2: number, y2: number, k: number, color = '#ffe08a', size = 2): void {
  const x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k - Math.sin(k * Math.PI) * 12;
  c.fillStyle = color; c.beginPath(); c.arc(x, y, size, 0, 7); c.fill();
}
function flame(c: Ctx, x: number, y: number, t: number, s = 1): void {
  for (let k = 0; k < 3; k++) {
    const h = (10 + Math.sin(t * 50 + k * 2) * 4) * s;
    c.fillStyle = ['#ff5a1f', '#ff9b2f', '#ffe066'][k];
    c.beginPath(); c.moveTo(x - (6 - k * 2) * s, y); c.quadraticCurveTo(x, y - h * (1.6 - k * 0.3), x + (6 - k * 2) * s, y); c.fill();
  }
}

const GRASS = '#5f8f45', SAND = '#d8bf7a', SNOW = '#e9eef2', SWAMP = '#4f6b4a', FOREST = '#3f6a35';
const lerp = (a: number, b: number, k: number): number => a + (b - a) * Math.max(0, Math.min(1, k));

const SCENES: Record<string, (c: Ctx, t: number) => void> = {
  amphibious(c, t) {
    sky(c); ground(c, GRASS, 100, 0, 90); water(c, 90, W, 100, t);
    const x = t < 0.35 ? lerp(20, 90, t / 0.35) : lerp(90, 230, (t - 0.35) / 0.65 * 1.3);
    const under = x > 92;
    person(c, x, under ? 118 : 100, YOU, t, 1, under ? 0.75 : 1);
    if (under) { c.fillStyle = '#ffffff88'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 4, 96 - ((t * 200 + k * 9) % 26), 1.6, 0, 7); c.fill(); } }
    label(c, under ? 'Walks underwater, faster' : 'No boat needed', W / 2, 20);
  },
  sunburn(c, t) {
    const night = t > 0.5 ? Math.min(1, (t - 0.5) * 6) : 0;
    sky(c, night); ground(c, GRASS);
    if (night < 0.5) sun(c, 200, 24); else moon(c, 200, 24);
    const x = lerp(30, 210, t);
    person(c, x, 100, YOU, t);
    const life = t < 0.5 ? 1 - t * 1.1 : 0.45;
    hp(c, x, 72, life);
    if (night < 0.5 && Math.sin(t * 90) > 0.3) label(c, '−2', x + 10, 72, '#ff7a6a', 10);
    label(c, night < 0.5 ? 'Day: sunlight burns your units' : 'Night: safe to move and settle', W / 2, 52);
  },
  tameAnimals(c, t) {
    sky(c); ground(c, GRASS);
    const sx = lerp(20, 120, t * 2);
    const tamed = t > 0.55;
    person(c, sx, 100, YOU, t);
    const ax = tamed ? lerp(150, 120, (t - 0.55) * 3) + Math.sin(t * 20) * 4 : 160;
    animal(c, ax, 100, tamed ? YOU : '#8a6a44', t);
    if (t > 0.48 && t < 0.62) label(c, '♥', 150, 78, '#ff7aa8', 16);
    label(c, tamed ? 'Tamed: now it fights for you' : 'Scout walks up to a wild animal', W / 2, 20);
  },
  frailBuildings(c, t) {
    sky(c); ground(c, GRASS);
    house(c, 70, 100, NORMAL); house(c, 170, 100, YOU);
    const k = (t * 3) % 1;
    bolt(c, 10, 60, 70, 85, k, '#555', 3); bolt(c, 230, 60, 170, 85, k, '#555', 3);
    hp(c, 70, 58, 1 - t * 0.5, NORMAL, 30); hp(c, 170, 58, 1 - t * 0.5 / 0.7, YOU, 30);
    label(c, 'Normal', 70, 120); label(c, 'Yours: 30 % less health', 170, 120, YOU);
  },
  tunneling(c, t) {
    sky(c); ground(c, GRASS); wall(c, 120, 100, 34);
    c.fillStyle = '#4a3a28'; c.fillRect(0, 108, W, 27);
    const x = lerp(20, 220, t);
    let y = 100;
    const under = x > 80 && x < 165;
    if (under) { y = 124; c.setLineDash([3, 3]); c.strokeStyle = '#d8b88a'; c.beginPath(); c.moveTo(80, 124); c.lineTo(x, 124); c.stroke(); c.setLineDash([]); }
    person(c, x, y, YOU, t, under ? 0.8 : 1, under ? 0.7 : 1);
    if (x > 165 && x < 185) label(c, 'Surprise! ×1.5', x, 70, '#ffe08a', 11);
    label(c, under ? 'Digging under the wall' : 'Tunnelers', W / 2, 20);
  },
  poorSailors(c, t) {
    sky(c); water(c, 0, W, 92, t);
    ship(c, 60, 100, YOU, 1); ship(c, 180, 100, THEM, -1);
    const k = (t * 2.5) % 1;
    bolt(c, 70, 80, 170, 80, k, '#ffe08a', 1.5); bolt(c, 170, 80, 70, 80, k, '#ffe08a', 3);
    hp(c, 60, 62, 0.6 - t * 0.3, YOU, 30); hp(c, 180, 62, 1 - t * 0.2, THEM, 30);
    label(c, 'Your ships: less health, weaker shots', W / 2, 20);
  },
  fungalSpread(c, t) {
    sky(c); ground(c, GRASS); house(c, 60, 100, YOU, 30);
    const r = 20 + t * 140;
    c.fillStyle = '#a05ab899'; for (let x = 30; x < Math.min(W, 60 + r); x += 10) c.fillRect(x, 100, 9, 5);
    for (let k = 0; k < 8; k++) { const x = 70 + ((k * 23) % 120); if (x < 60 + r) { c.fillStyle = '#c47ad8'; c.beginPath(); c.arc(x, 98, 3, Math.PI, 0); c.fill(); } }
    const inside = 160 < 60 + r;
    person(c, 160, 100, THEM, 0); hp(c, 160, 72, inside ? 1 - (t - 0.6) * 1.5 : 1, THEM);
    if (inside && Math.sin(t * 80) > 0) label(c, '−2', 172, 74, '#e59bf5', 10);
    label(c, 'Fungus spreads and hurts enemies in it', W / 2, 20);
  },
  slowGrowth(c, t) { sky(c); ground(c, GRASS); house(c, 120, 100, YOU, 34); race(c, t, 72, 'Training takes 40 % longer'); },
  gliders(c, t) {
    sky(c); ground(c, GRASS, 100, 0, 80); water(c, 80, 160, 100, t); ground(c, GRASS, 100, 160, W); wall(c, 70, 100, 30);
    const x = lerp(20, 220, t), y = x > 55 && x < 175 ? 100 - Math.sin(((x - 55) / 120) * Math.PI) * 60 : 100;
    person(c, x, y, YOU, t);
    if (y < 98) { c.fillStyle = '#e8e0c8'; c.beginPath(); c.moveTo(x - 16, y - 18); c.lineTo(x, y - 24); c.lineTo(x + 16, y - 18); c.fill(); }
    label(c, 'Glides over walls and water', W / 2, 20);
  },
  poorDefense(c, t) {
    sky(c); ground(c, GRASS); tower(c, 50, 100, YOU); wall(c, 80, 100, 26);
    person(c, lerp(230, 130, t), 100, THEM, t);
    const k = (t * 3) % 1; bolt(c, 50, 64, lerp(230, 130, t), 85, k, '#ffe08a', 1.4);
    hp(c, 50, 54, 0.6, YOU, 26); hp(c, 80, 66, 0.6, YOU, 18);
    label(c, 'Weaker walls and towers', W / 2, 20); label(c, '−40 %', 50, 120, '#ff8a7a');
  },
  masterSmiths(c, t) {
    sky(c); ground(c, GRASS); house(c, 70, 100, '#6b6b6b', 34);
    flame(c, 70, 92, t, 0.6);
    const k = (t * 2) % 1;
    c.fillStyle = '#c0c6cf'; c.fillRect(lerp(80, 160, k), 84, 14, 4); c.fillRect(lerp(80, 160, k) + 10, 80, 3, 12);
    person(c, 175, 100, YOU, 0);
    label(c, 'Gear: 100 → 60', 150, 40, '#ffe08a', 12); label(c, 'and one level better', 150, 56, '#fff', 10);
  },
  heavyFooted(c, t) {
    sky(c); ground(c, GRASS);
    person(c, lerp(20, 220, t), 80, NORMAL, t); person(c, lerp(20, 220, t * 0.8), 112, YOU, t * 0.8);
    label(c, 'Normal', 14, 60, NORMAL, 9, 'left'); label(c, 'Your soldiers: 20 % slower', 14, 128, YOU, 9, 'left');
  },
  swampStalkers(c, t) {
    sky(c); ground(c, GRASS, 100, 0, 70); ground(c, SWAMP, 100, 70, W);
    for (let k = 0; k < 10; k++) { c.fillStyle = '#6d8c5f'; c.fillRect(80 + k * 16, 96 - (k % 3) * 2, 2, 8); }
    const x = t < 0.25 ? lerp(10, 70, t / 0.25) : lerp(70, 240, (t - 0.25) * 1.6);
    person(c, x, 100, YOU, t, 1, x > 72 ? 0.35 : 1);
    person(c, 200, 100, THEM, 0);
    label(c, x > 72 ? 'Fast and hidden in swamps' : 'Swamp stalkers', W / 2, 20);
  },
  openGroundWeak(c, t) {
    sky(c); ground(c, SAND);
    person(c, 100, 100, YOU, t * 0.3); person(c, 140, 100, THEM, t * 0.3);
    const k = (t * 3) % 1;
    label(c, '−7', 140, lerp(80, 60, k), '#ffe08a', 10); label(c, '−10', 100, lerp(80, 60, k), '#ffe08a', 12);
    label(c, 'On open plains and desert you hit 30 % softer', W / 2, 20);
  },
  frostAdapted(c, t) {
    sky(c, 0.15); ground(c, SNOW); for (let k = 0; k < 12; k++) { c.fillStyle = '#fff'; c.fillRect((k * 37 + t * 60) % W, (k * 23 + t * 140) % 100, 2, 2); }
    person(c, 70, 100, YOU, t * 0.4); tree(c, 95, 100);
    race(c, t, 130, 'Cold lands: gather 30 % faster, hit 25 % harder', 116);
  },
  heatWeak(c, t) {
    sky(c); ground(c, SAND); sun(c, 210, 22);
    for (let k = 0; k < 3; k++) { c.strokeStyle = '#fff6'; c.beginPath(); for (let x = 30; x < 210; x += 6) c.lineTo(x, 60 + k * 10 + Math.sin(x / 8 + t * 20) * 2); c.stroke(); }
    person(c, 120, 100, YOU, t * 0.3);
    race(c, t, 60, 'Desert: 40 % slower work, 20 % weaker', 116);
  },
  thieves(c, t) {
    sky(c); ground(c, SAND); house(c, 170, 100, THEM, 34);
    const x = t < 0.5 ? lerp(20, 150, t * 2) : lerp(150, 30, (t - 0.5) * 2);
    person(c, x, 100, '#3a3a3a', t);
    if (t > 0.5) for (let k = 0; k < 4; k++) { c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(x + 8 + k * 5, 80 - (k % 2) * 4, 2.6, 0, 7); c.fill(); }
    label(c, t > 0.5 ? 'Steals twice as much' : 'Spy sneaks in', W / 2, 20);
  },
  poorFarmers(c, t) {
    sky(c); ground(c, GRASS);
    for (let k = 0; k < 6; k++) { c.fillStyle = '#c9b04a'; c.fillRect(30 + k * 30, 94, 20, 6); }
    race(c, t, 60, 'Farms make 40 % less food', 30);
  },
  quickStudy(c, t) {
    sky(c); ground(c, GRASS); house(c, 120, 100, '#6c5aa8', 34);
    c.fillStyle = '#f2ead2'; c.fillRect(110 + Math.sin(t * 20) * 2, 50, 20, 14); c.strokeStyle = '#6c5aa8'; c.strokeRect(110 + Math.sin(t * 20) * 2, 50, 20, 14);
    race(c, t, 167, 'Research 40 % faster', 18);
  },
  fragileArmy(c, t) {
    sky(c); ground(c, GRASS);
    person(c, 80, 100, NORMAL, t * 0.2); person(c, 160, 100, YOU, t * 0.2);
    hp(c, 80, 70, 1, NORMAL, 36); hp(c, 160, 70, 0.75, YOU, 36);
    label(c, 'Normal', 80, 122); label(c, 'Yours: 25 % less health', 160, 122, YOU);
  },
  forestKin(c, t) {
    sky(c); ground(c, FOREST); for (let k = 0; k < 8; k++) tree(c, 15 + k * 30, 100, 0.9 + (k % 3) * 0.15);
    person(c, 120, 100, YOU, t * 0.3);
    const k = (t * 3) % 1; bolt(c, 240, 60, 120, 85, k, '#555', 2.5);
    label(c, '−7 instead of −10', 120, 60, '#ffe08a', 11);
    label(c, 'Forests protect you; wood 30 % faster', W / 2, 20);
  },
  flammable(c, t) {
    sky(c, 0.2); ground(c, GRASS); house(c, 80, 100, NORMAL, 30); house(c, 170, 100, YOU, 30);
    flame(c, 80, 82, t, 0.6); flame(c, 170, 82, t, 1.4);
    hp(c, 80, 52, 1 - t * 0.3, NORMAL, 30); hp(c, 170, 52, 1 - t * 0.75, YOU, 30);
    label(c, 'Fire hurts you 2.5 times more', W / 2, 20);
  },
  reefBuilders(c, t) {
    sky(c); ground(c, GRASS, 100, 0, 90); water(c, 90, W, 100, t);
    const k = Math.min(1, t * 1.6);
    c.fillStyle = '#8a6a44'; c.fillRect(90, 96, 110 * k, 6);
    for (let x = 100; x < 90 + 110 * k; x += 18) c.fillRect(x, 96, 3, 16);
    person(c, 80, 100, YOU, t);
    label(c, 'Piers from the start, half price', W / 2, 20);
  },
  weakLandArmy(c, t) {
    sky(c); ground(c, GRASS, 100, 0, 140); water(c, 140, W, 100, t);
    person(c, 50, 100, YOU, t * 0.3); person(c, 90, 100, THEM, t * 0.3); ship(c, 195, 104, YOU);
    const k = (t * 3) % 1;
    label(c, '−7', 90, lerp(80, 62, k), '#ffe08a', 10); label(c, 'ships normal', 195, 64, '#fff', 9);
    label(c, 'Land soldiers hit 25 % softer', W / 2, 20);
  },
};

/** Draw ability `id` at loop time t (0…1) on a 240×135 canvas context. */
export function drawPreview(c: Ctx, id: string, t: number): void {
  c.save(); c.clearRect(0, 0, W, H);
  (SCENES[id] ?? ((cc: Ctx) => { sky(cc); ground(cc, GRASS); }))(c, t);
  c.restore();
}
export const PREVIEW_IDS = Object.keys(SCENES);
export const PREVIEW_W = W, PREVIEW_H = H;
