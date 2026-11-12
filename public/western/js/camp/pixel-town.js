// Note: shared pieces of the 3D street panels (item 312): moods with a sun and a sky, false fronts with painted signs, boardwalks, far hills, and laying people into a filmed scene with depth, light and cast shadows.

import { C } from '../palette.js';
import { Px, step, dith, text, textWidth, signText, NONE } from './pixel-art.js';
import { box, noise, lightAt } from './pixel-3d.js';
import { PW, PH, place } from './pixel-kit.js';

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Note: the moods: where the sun stands (toward it), how hard it shines, the ambient light, and the sky as colour stops by height above the horizon.
const MOODS = {
  day: { sun: [-0.82, 0.38, 0.44], power: 1.55, ambient: 0.38, cool: false, stops: [[0, C.BONE], [0.05, C.PLASTER_L], [0.14, C.GLASS_L], [0.3, C.GLASS], [0.6, C.BLUE]], disc: C.BONE, cloud: C.BONE, hills: [C.STONE, C.GLASS] },
  dusk: { sun: [-0.9, 0.16, 0.34], power: 2.2, ambient: 0.27, cool: true, stops: [[0, C.GOLD_L], [0.05, C.GOLD], [0.14, C.RED_L], [0.28, C.RED], [0.5, C.BLUE_D]], disc: C.BONE, cloud: C.GOLD_L, hills: [C.RED_D, C.BLUE_D] },
  dawn: { sun: [0.9, 0.15, 0.3], power: 1.9, ambient: 0.3, cool: true, stops: [[0, C.BONE], [0.05, C.GOLD_L], [0.12, C.ADOBE_L], [0.24, C.GLASS_L], [0.42, C.GLASS], [0.7, C.BLUE]], disc: C.BONE, cloud: C.ADOBE_L, hills: [C.BLUE, C.GLASS] },
  night: { sun: [-0.5, 0.6, 0.5], power: 0.38, ambient: 0.1, cool: true, stops: [[0, C.BLUE], [0.3, C.BLUE_D], [0.8, C.SHADOW]], disc: C.GLASS_L, cloud: C.BLUE, hills: [C.BLUE_D, C.SHADOW], stars: true },
  grey: { sun: [0, 1, 0], power: 0.25, ambient: 0.62, cool: false, stops: [[0, C.STONE_L], [0.25, C.STONE], [0.7, C.IRON_L]], disc: null, cloud: C.STONE_L, hills: [C.STONE, C.IRON_L], flat: true },
};

// Note: the stock sun direction of a mood (toward the sun), for a scene that mirrors or turns it.
export const sunOf = (name) => [...(MOODS[name] || MOODS.day).sun];

// Note: a mood made ready for one camera: the sun, the sky function (gradient, streaks of cloud, stars, the sun's disc), and the light for figures.
export function rig(name, cam, over = {}) {
  const m = { ...(MOODS[name] || MOODS.day), ...over };
  const sun = unit3(m.sun);
  const sky = (d, x, y) => {
    const e = Math.max(0, d[1]);
    const st = m.stops;
    let i = 0;
    while (i < st.length - 2 && e > st[i + 1][0]) i++;
    const f = Math.max(0, Math.min(1, (e - st[i][0]) / (st[i + 1][0] - st[i][0])));
    let c = dith(x, y, f) ? st[i + 1][1] : st[i][1];
    // Note: long streaks of cloud, thinning toward the horizon, their undersides catching the sun.
    const k = e + 0.07;
    const cu = d[0] / k;
    const cv = d[2] / k;
    const n = noise(Math.floor(cu * 1.1), Math.floor(cv * 6));
    if (n > 0.64 && e > 0.03 && e < 0.7) c = noise(Math.floor(cu * 1.1), Math.floor(cv * 6) + 40) > 0.5 && dith(x, y, 0.5) ? m.cloud : step(c, 1);
    if (m.stars && noise(x, y) > 0.985) c = C.GLASS_L;
    const s = dot3(d, sun);
    if (m.disc != null) {
      if (s > 0.9993) c = m.disc;
      else if (s > 0.9975) c = C.PLASTER_L;
      else if (s > 0.992) c = C.GOLD_L;
      else if (s > 0.97 && dith(x, y, (s - 0.97) / 0.022)) c = C.GOLD_L;
      else if (s > 0.9 && dith(x, y, ((s - 0.9) / 0.07) ** 2 * 0.7)) c = C.GOLD;
    }
    return c;
  };
  const lx = dot3(sun, cam.right);
  const ly = -dot3(sun, cam.up);
  return { ...m, name, sun, sky, lx: lx || -0.01, ly, back: dot3(sun, cam.fwd) > 0.25, cam };
}

// Note: true where a ray from p toward the sun runs into one of the casters.
function blocked(p, s, cs) {
  for (const b of cs) {
    let t0 = 1e-3;
    let t1 = 1e9;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(s[a]) < 1e-9) {
        if (p[a] < b.min[a] || p[a] > b.max[a]) { t1 = -1; break; }
        continue;
      }
      let ta = (b.min[a] - p[a]) / s[a];
      let tb = (b.max[a] - p[a]) / s[a];
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) break;
    }
    if (t0 <= t1) return true;
  }
  return false;
}

// Note: the sun as a far point light; the boxes marked cast keep it off what they shade.
export function sunLight(rg, boxes) {
  const cs = boxes.filter((b) => b.cast);
  const s = rg.sun;
  return { pos: [s[0] * 220, s[1] * 220, s[2] * 220], power: rg.power, reach: 900, visible: rg.power > 0.5 ? (p) => !blocked(p, s, cs) : null };
}

// Note: planks with seams, grain and the odd knot, read off two coordinates of the hit point.
export const boards = (c, along, across, width = 0.19) => {
  const u = along / width;
  const i2 = Math.floor(u);
  const f2 = u - i2;
  if (f2 < 0.08) return { c: step(c, -2) };
  const base = noise(i2, 7) < 0.3 ? step(c, -1) : c;
  if (noise(i2 * 3 + Math.floor(f2 * 4), Math.floor(across * 14)) > 0.9) return { c: step(base, -1) };
  if (noise(i2, Math.floor(across * 2)) > 0.97 && Math.abs(f2 - 0.5) < 0.2) return { c: step(base, -2) };
  return { c: base };
};

// Note: beaten street dirt: fine grit and pebbles whose size follows the distance from the eye so they stay a pixel or two, and the long ruts of wheels.
export const dirt = (p, ruts = [], light = C.SAND, eye = null, axis = 2) => {
  const dist = eye ? Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) : 12;
  const cell = 0.018 * 2 ** Math.max(0, Math.floor(Math.log2(dist / 2.5)));
  const g = noise(Math.floor(p[0] / cell), Math.floor(p[2] / cell));
  for (const z of ruts) if (Math.abs(p[axis] - z) < 0.09 + cell) return { c: g > 0.6 ? step(light, -2) : step(light, -1) };
  if (g > 0.965) return { c: step(light, -2) };
  if (g < 0.06) return { c: step(light, 1) };
  if (noise(Math.floor(p[0] / (cell * 8)), Math.floor(p[2] / (cell * 8))) > 0.82) return { c: step(light, -1) };
  return { c: light };
};

// Note: the sides of a box by wall face: the axis a wall faces along and which way, and a box slab out from the wall plane.
const FACE = { '+z': [2, 1], '-z': [2, -1], '+x': [0, 1], '-x': [0, -1] };
export function slab(face, at, a, b, y0, y1, d0, d1) {
  const [ax, sg] = FACE[face];
  const lo = [0, y0, 0];
  const hi = [0, y1, 0];
  const al = ax === 2 ? 0 : 2;
  lo[al] = a;
  hi[al] = b;
  const q0 = at + sg * d0;
  const q1 = at + sg * d1;
  lo[ax] = Math.min(q0, q1);
  hi[ax] = Math.max(q0, q1);
  return [lo, hi];
}
// Note: the distance along a wall from the viewer's left edge, for a viewer facing the wall.
const alongOf = (face, a, b, p) => (face === '+z' ? p[0] - a : face === '-z' ? b - p[0] : face === '+x' ? b - p[2] : p[2] - a);
// Note: the world extent along the wall of a stretch measured from the viewer's left edge.
const rangeOf = (face, a, b, u0, u1) => (face === '+z' || face === '-x' ? [a + u0, a + u1] : [b - u1, b - u0]);
const isFront = (face, n) => n[FACE[face][0]] * FACE[face][1] > 0.5;

// Note: the painted face of a sign as a texture: one texel is one screen pixel at its distance. Styles: board (a plate), arch (a plate under a curved top), paint (letters on the wall).
export function signTexture(sp, wM, hM, ppm, ts = 2) {
  const W = Math.max(8, Math.round(wM * ppm));
  const H = Math.max(8, Math.round(hM * ppm));
  const t = new Px(W, H);
  const bw = textWidth(sp.big, ts);
  const bx = Math.round((W - bw) / 2);
  const by = 4;
  const bh = 5 * ts;
  if (sp.style !== 'paint') {
    const bg = sp.bg ?? C.DARK;
    t.rect(bx - 6, by - 4, bw + 12, bh + 8, bg);
    t.rect(bx - 6, by - 4, bw + 12, 1, step(bg, 1));
    t.rect(bx - 6, by + bh + 3, bw + 12, 1, C.DARK);
    t.rect(bx - 7, by - 5, 1, bh + 10, C.DARK);
    t.rect(bx + bw + 6, by - 5, 1, bh + 10, C.DARK);
    t.rect(bx - 7, by - 5, bw + 14, 1, C.DARK);
    t.rect(bx - 7, by + bh + 4, bw + 14, 1, C.DARK);
    signText(t, sp.big, bx, by, sp.col, { scale: ts, shadow: sp.sh ?? C.DARK });
  } else signText(t, sp.big, bx, by, sp.col, { scale: ts, shadow: sp.sh ?? C.DARK, outline: sp.out ?? null });
  // Note: a star or diamond either side of the name.
  const mid = by + Math.floor(bh / 2);
  for (const ox of [bx - 10, bx + bw + 8]) {
    t.set(ox, mid - 2, sp.col); t.set(ox - 1, mid - 1, sp.col); t.set(ox + 1, mid - 1, sp.col);
    t.rect(ox - 2, mid, 5, 1, sp.col);
    t.set(ox - 1, mid + 1, sp.col); t.set(ox + 1, mid + 1, sp.col); t.set(ox, mid + 2, sp.col);
  }
  const sw = textWidth(sp.small);
  if (sw < W - 4) signText(t, sp.small, Math.round((W - sw) / 2), by + bh + 6, sp.style === 'board' ? C.BONE : sp.col, { scale: 1, shadow: C.DARK });
  return t;
}

// Note: the house rows' lettering by style.
export const SIGNS = [
  { big: 'SALOON', small: 'BILLIARDS & CIGARS', style: 'board', col: C.BONE, sh: C.RED_D, bg: C.RED_D },
  { big: 'HOTEL', small: 'ROOMS & BATHS', style: 'paint', col: C.BONE, sh: C.DARK, out: C.DARK },
  { big: 'BANK', small: 'EST. 1879', style: 'arch', col: C.GOLD_L, sh: C.DARK, bg: C.BLUE_D },
  { big: 'DRY GOODS', small: 'J.B. MORROW & SONS', style: 'paint', col: C.PLASTER_L, sh: C.WOOD_D, out: C.DARK },
  { big: 'LIVERY', small: 'FEED & STABLE', style: 'board', col: C.DARK, sh: C.PLANK_L, bg: C.PLANK },
  { big: 'ASSAY', small: 'GOLD BOUGHT', style: 'arch', col: C.GOLD_L, sh: C.DARK, bg: C.GREEN_D },
  { big: 'SHERIFF', small: 'LAW & ORDER', style: 'board', col: C.BONE, sh: C.DARK, bg: C.WOOD_D },
  { big: 'BARBER', small: 'SHAVE & BATH', style: 'paint', col: C.PLASTER_L, sh: C.RED_D, out: C.DARK },
];

// Note: a false front: the wall with its parapet, cornice, windows and door as one box whose material reads the hit point, and a lettered sign board a hand's breadth in front of it.
// Note: b: { a, b (along-axis extent), h, wall, kind, top, sign, door (0 to 1), storeys, lit (windows with a lamp) }; o: { face, at, ppm, depth, y0 }.
export function building(b, o) {
  const { face, at } = o;
  const depth = o.depth ?? 6;
  const W = b.b - b.a;
  const wall = b.wall ?? C.WOOD;
  const top = b.top ?? 'flat';
  const H = b.h;
  const edge = top === 'flat' ? H : H - 0.9;
  const prof = (u) => {
    if (top === 'step') return u < 0.9 || u > W - 0.9 ? edge : H;
    if (top === 'arch') return edge + 0.9 * Math.sqrt(Math.max(0, 1 - ((u - W / 2) / (W * 0.36)) ** 2)) * (Math.abs(u - W / 2) < W * 0.36 ? 1 : 0);
    if (top === 'gable') return edge + Math.max(0, 0.9 - Math.abs(u - W / 2) * 0.5);
    return H;
  };
  const du = b.door ?? 0.5;
  const doorA = W * du - 0.55;
  const doorB = doorA + 1.1;
  const nWin = b.wins ?? Math.max(1, Math.round(W / 3.2));
  const wins = [];
  for (let k = 0; k < nWin; k++) {
    const cx = W * ((k + 0.5) / nWin);
    if (Math.abs(cx - W * du) < 1.15) continue;
    wins.push(cx);
  }
  const inR = (x, y, x0, x1, y0, y1) => x > x0 && x < x1 && y > y0 && y < y1;
  const winRows = b.storeys === 2 ? [[1.15, 2.4], [3.85, 5.0]] : [[1.2, 2.5]];
  const base = o.y0 ?? 0;
  const mat = (p, n) => {
    const y = p[1] - base;
    const u = alongOf(face, b.a, b.b, p);
    if (!isFront(face, n)) return n[1] > 0.5 ? { c: C.WOOD_D } : boards(step(wall, -1), face[1] === 'z' ? p[2] : p[0], y, 0.3);
    if (y > prof(u)) return null;
    // Note: the cornice at the top of the front: a heavy band on brackets with a light lip.
    const ph = prof(u);
    if (y > ph - 0.1) return { c: step(wall, 2) };
    if (y > ph - 0.5) {
      const br = Math.floor(u / 0.45);
      const f = u / 0.45 - br;
      return { c: f < 0.25 ? step(wall, -2) : step(wall, y > ph - 0.2 ? 1 : 0) };
    }
    // Note: the door: a dark opening under a lintel, with batwing doors on a saloon.
    if (inR(u, y, doorA - 0.1, doorB + 0.1, -1, 2.45)) {
      if (inR(u, y, doorA, doorB, 0, 2.3)) {
        if (b.swing && y > 0.85 && y < 1.9) return Math.abs(u - (doorA + doorB) / 2) < 0.03 ? null : { c: Math.floor((y - 0.85) / 0.12) % 2 ? C.WOOD : C.WOOD_L };
        return b.lamp && y < 2.2 ? { emit: C.GOLD } : null;
      }
      return { c: C.WOOD_D };
    }
    for (const cx of wins) for (const [wy0, wy1] of winRows) {
      if (inR(u, y, cx - 0.62, cx + 0.62, wy0 - 0.1, wy1 + 0.1)) {
        if (inR(u, y, cx - 0.52, cx + 0.52, wy0, wy1)) {
          if (Math.abs(u - cx) < 0.04 || Math.abs(y - (wy0 + wy1) / 2) < 0.04) return { c: C.WOOD_D };
          return b.lit && b.lit(cx) ? { emit: y > (wy0 + wy1) / 2 ? C.GOLD_L : C.GOLD } : { c: C.SHADOW, ambient: 0.4 };
        }
        return { c: y < wy0 ? C.WOOD_L : C.WOOD_D };
      }
    }
    // Note: the wall itself by kind: boards, clapboard lines, plaster or brick.
    if (b.kind === 'clap') {
      const f = ((y / 0.17) % 1 + 1) % 1;
      if (f < 0.14) return { c: step(wall, -2) };
      return { c: noise(Math.floor(u * 4), Math.floor(y / 0.17)) > 0.9 ? step(wall, -1) : f > 0.85 ? step(wall, 1) : wall };
    }
    if (b.kind === 'adobe') {
      const g = noise(Math.floor(u * 7), Math.floor(y * 7));
      return { c: g > 0.9 ? step(wall, -1) : g < 0.08 ? step(wall, 1) : wall };
    }
    if (b.kind === 'brick') {
      const row = Math.floor(y / 0.13);
      const f = (y / 0.13) - row;
      const col = u / 0.3 + (row % 2) * 0.5;
      if (f < 0.12 || col - Math.floor(col) < 0.06) return { c: step(wall, 1) };
      return { c: noise(Math.floor(col), row) > 0.8 ? step(wall, -1) : wall };
    }
    return boards(wall, u, y, 0.19);
  };
  const boxes = [box(...slab(face, at, b.a, b.b, 0, base + H, -depth, 0), mat, { cast: true })];
  // Note: the sign: a board standing a hand out from the front, sampled from a texture; painted lettering leaves the wall bare around the letters.
  const sp = b.sign;
  if (sp) {
    const ppm = o.ppm ?? 11;
    const ts = ppm >= 17 ? 3 : 2;
    const sw = Math.min(W - 0.4, (textWidth(sp.big, ts) + 24) / ppm + 0.4);
    const su = (W - sw) / 2;
    const sh = (5 * ts + 16) / ppm;
    const sy1 = base + edge - 0.55;
    const tex = signTexture(sp, sw, sh, ppm, ts);
    const sMat = (p, n) => {
      if (!isFront(face, n)) return { c: C.WOOD_D };
      const tx = Math.floor(((alongOf(face, b.a, b.b, p) - su) / sw) * tex.w);
      const ty = Math.floor(((sy1 - p[1]) / sh) * tex.h);
      const c = tex.get(tx, ty);
      return c === NONE ? null : { c };
    };
    const [wa, wb] = rangeOf(face, b.a, b.b, su, su + sw);
    boxes.push(box(...slab(face, at, wa, wb, sy1 - sh, sy1, 0, 0.08), sMat, { noShadow: true }));
  }
  return boxes;
}

// Note: a porch roof on posts over a boardwalk, and the boardwalk itself with its edge; one long box each, the posts a pattern of holes.
export function porch(face, at, a, b, { roof = 3.0, walk = 0.42, wide = 2.6, ppost = 3.2, rail = false, light = C.WOOD } = {}) {
  const post = (u) => Math.abs(((u - a) % ppost + ppost) % ppost - 0.15) < 0.09;
  const out = [];
  // Note: the walk's top planks run from the wall to the street; its edge face is a darker board.
  out.push(box(...slab(face, at, a, b, 0, walk, 0, wide), (p, n) => (n[1] > 0.5 ? (noise(Math.floor((face[1] === 'z' ? p[0] : p[2]) * 5), Math.floor(((face[1] === 'z' ? p[2] : p[0])) * 1.3)) > 0.96 ? { c: C.SHADOW } : boards(light, face[1] === 'z' ? p[0] : p[2], face[1] === 'z' ? p[2] : p[0], 0.2)) : { c: step(light, n[1] < -0.5 ? -3 : -2) }), { cast: true }));
  out.push(box(...slab(face, at, a, b, roof, roof + 0.14, 0, wide + 0.15), (p, n) => (n[1] < -0.5 ? { c: Math.abs(((face[1] === 'z' ? p[0] : p[2]) % 0.55) - 0.27) < 0.05 ? C.SHADOW : C.WOOD_D } : { c: C.WOOD_D }), { cast: true }));
  out.push(box(...slab(face, at, a, b, walk, roof, wide - 0.2, wide - 0.1), (p) => {
    const u = face[1] === 'z' ? p[0] : p[2];
    if (post(u) && p[1] < roof) return { c: p[1] < walk + 0.2 ? C.WOOD_D : C.WOOD };
    if (rail && p[1] < walk + 1.0 && p[1] > walk + 0.9) return { c: C.WOOD };
    if (rail && p[1] < walk + 1.0 && ((u % 0.22) + 0.22) % 0.22 < 0.05) return { c: C.WOOD };
    return null;
  }, { noShadow: true }));
  return out;
}

// Note: far hills and mesas as emissive silhouettes in front of the sky; they take the haze colours of the mood.
export function hills(rg, { z = -260, h = 36, x0 = -420, x1 = 420, seed = 1, far = 0, plateau = 0.7, gap = null } = {}) {
  const [c0, c1] = rg.hills;
  const prof = (x) => {
    let v = h * (0.4 + 0.22 * Math.sin(x * 0.012 + seed) + 0.14 * Math.sin(x * 0.037 + seed * 2.1) + 0.06 * Math.sin(x * 0.11 + seed));
    v = Math.min(v, h * plateau * (1 + 0.15 * Math.sin(x * 0.02 + seed)));
    // Note: a gap in the line of hills where the sun comes up: the height falls away to a low swell around x = gap.
    if (gap != null) v *= 0.06 + 0.94 * Math.min(1, Math.abs(x - gap) / (z * -0.25));
    return v;
  };
  return box([x0, -2, z], [x1, h * 1.2, z + 2], (p) => {
    if (p[1] > prof(p[0])) return null;
    const stripe = Math.floor(p[1] / 3) % 4 === 0;
    const base = far ? c1 : c0;
    return { emit: stripe ? step(base, far ? 1 : -1) : base };
  }, { noShadow: true });
}

// Note: the people laid into a filmed scene.
export class Film {
  constructor(cam, info, px, rg, boxes, lights, ambient) {
    Object.assign(this, { cam, info, px, rg, boxes, lights, ambient });
    this.fwd = cam.fwd;
  }

  // Note: the depth along the view of what the ray at pixel i hit, or Infinity for sky.
  zAt(i) {
    const h = this.info[i];
    if (!h) return Infinity;
    const { w, h: ch, f } = this.cam;
    const dx = ((i % w) + 0.5 - w / 2) / f;
    const dy = (((i / w) | 0) + 0.5 - ch / 2) / f;
    return h.t / Math.sqrt(1 + dx * dx + dy * dy);
  }

  // Note: air between: everything farther than from is dithered toward the colour c, more with distance up to the amount.
  haze(c, from, to, amount) {
    const { px, info } = this;
    for (let i = 0; i < info.length; i++) {
      if (!info[i]) continue;
      const lv = Math.min(1, (this.zAt(i) - from) / (to - from)) * amount;
      if (lv > 0 && dith(i % PW, (i / PW) | 0, lv)) px.a[i] = c;
    }
  }

  // Note: how brightly the light falls on a person standing at a world point, from the sun and the lamps.
  levelAt(foot) {
    const p = [foot[0], foot[1] + 1.1, foot[2]];
    const to = unit3([this.cam.pos[0] - p[0], this.cam.pos[1] - p[1], this.cam.pos[2] - p[2]]);
    return lightAt(p, to, this.lights, this.boxes, this.ambient);
  }

  // Note: a layer from make(x, y, pxPerMetre) set down with its foot at a world point: shaded by the light there, outlined, rimmed, hidden behind what stands nearer.
  put(foot, make, { rim = null, shadow = true, len = 1.8, half = [0.25, 0.25], level = null, fill = 0, sink = 0.15, order = null } = {}) {
    const { cam, rg, px } = this;
    const [sx, sy, depth] = cam.project(foot);
    if (depth < 0.3) return null;
    const S = cam.scaleAt(foot);
    const layer = make(sx, sy, S);
    const lv = Math.max(level ?? this.levelAt(foot), fill);
    if (lv < 0.62) layer.shift(0, 0, PW, PH, -1, 1);
    if (lv < 0.36) layer.shift(0, 0, PW, PH, -1, 1);
    const tmp = new Px(PW, PH);
    const lit = lv > 0.45;
    place(tmp, layer, { lx: lit ? rg.lx : -rg.lx * 0.2, ly: lit ? rg.ly : -0.4, rim: rim ?? (rg.back && lit ? 1 : 0) });
    if (shadow && rg.power > 0.5) this.castShadow(foot, len, half);
    for (let i = 0; i < tmp.a.length; i++) {
      const c = tmp.a[i];
      if (c === NONE) continue;
      if (this.zAt(i) < depth - sink - 0.02) continue;
      px.a[i] = c;
    }
    return { sx, sy, S, depth };
  }

  // Note: the shadow of a thing of height h standing on a footprint of half-sizes half, on the up-facing ground: the footprint swept out along the light's shadow, thinning toward the end.
  castShadow(foot, h, half = [0.25, 0.25], taper = 0.7, k = -2) {
    const { cam, rg, px, info } = this;
    const s = rg.sun;
    const hz = Math.hypot(s[0], s[2]);
    if (s[1] < 0.03 || hz < 0.02) return;
    const reach = Math.min(16, (h * hz) / s[1]);
    const wide = 2 + 6 * Math.max(0, 1 - s[1] / 0.3);
    const dx = (-s[0] / hz) * reach;
    const dz = (-s[2] / hz) * reach;
    const gy = foot[1] + 0.02;
    const pts = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push([foot[0] + sx * half[0], foot[2] + sz * half[1] * wide]);
      pts.push([foot[0] + dx + sx * half[0] * taper, foot[2] + dz + sz * half[1] * wide * taper]);
    }
    const poly = hull(pts).map(([x, z]) => cam.project([x, gy, z]));
    if (poly.some((q) => q[2] < 0.3)) return;
    for (const i of Px.cover(poly.map((q) => [q[0], q[1]]), PW, PH)) {
      const h2 = info[i];
      if (!h2 || h2.n[1] < 0.5 || Math.abs(h2.p[1] - gy) > 0.6) continue;
      px.a[i] = step(px.a[i], k);
    }
  }
}

// Note: the convex hull of points on the ground plane.
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

// Note: open ground: dirt with scrub, fading to haze with distance, lightened toward the horizon.
export const terrain = (p, { eye, light = C.SAND, scrub = 0.1, haze = 60, ruts = [], axis = 2 } = {}) => {
  const dist = Math.hypot(p[0] - eye[0], p[2] - eye[2]);
  let m = dirt(p, ruts, light, eye, axis);
  const cell = 0.018 * 2 ** Math.max(0, Math.floor(Math.log2(Math.max(dist, 1) / 2.5)));
  if (scrub > 0 && noise(Math.floor(p[0] / (cell * 4)) + 7, Math.floor(p[2] / (cell * 4))) > 1 - scrub * 0.5) m = { c: noise(Math.floor(p[0] / cell), Math.floor(p[2] / cell)) > 0.5 ? C.GREEN_D : step(light, -2) };
  if (dist > haze) m = { c: step(m.c, dist > haze * 2.4 ? 2 : 1) };
  return m;
};
