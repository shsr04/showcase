// Note: the boot hill as a place in metres, shared by every grave panel (items 386, 389–392): the marker, the old graves, the picket fence and the gate, scrub, a dead tree, the hill dropping to the town in the distance, the sky of each hour, and the helpers that film it.

import { C } from '../palette.js';
import { Px, step, dith, text, textWidth, signText, NONE } from './pixel-art.js';
import { pixelFigure, pixelSide } from './pixel-figure.js';
import { box, trace, lightAt, shadeOf, noise } from './pixel-3d.js';
import { PW, PH } from './pixel-kit.js';

// Note: the hero marker stands at the origin's x, 3.5 m inside the back fence; mourners stand on the +z side and look toward -z, the town lies that way and below.
export const HERO = { x: 0, z: -3.5 };
const EDGE = -13;
const TOWN_Z = -72;
const BASE = -5.4;

const fract = (v) => v - Math.floor(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const n3 = (a, b, c) => noise(a + c * 17.3, b * 1.7 + c * 5.1);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Note: smooth value noise for clouds and soil patches.
export function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noise(xi, yi);
  const b = noise(xi + 1, yi);
  const c = noise(xi, yi + 1);
  const d = noise(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// Note: a colour ramp read at a position t from 0 to the last index, dithered between neighbours.
export const rampAt = (ramp, t, x, y) => {
  const tt = clamp(t, 0, ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(tt));
  return dith(x, y, tt - i) ? ramp[i + 1] : ramp[i];
};

// Note: the hours of the yard: the sky by ray direction, the light from the sun and the sky, the haze of distance and the sprites' light.
const SUN_DAWN = (() => { const v = [0.78, 0.13, -0.62]; const l = Math.hypot(...v); return v.map((a) => a / l); })();
export const MOODS = {
  grey: {
    markerK: 1.3, ambient: 0.27, haze: C.STONE_L, hazeFrom: 14, hazeTo: 380, sprite: { lx: -0.35, ly: -1 },
    lights: [{ pos: [-70, 130, 90], power: 0.34, reach: 3000 }, { pos: [20, 6, 40], power: 0.16, reach: 90 }],
    sky: (d, x, y) => {
      const e = clamp(d[1], 0, 1);
      const cloud = vnoise(x / 26 + d[0] * 3, y / 7) * 0.55 + vnoise(x / 9, y / 3) * 0.18;
      return rampAt([C.STONE_L, C.STONE_L, C.STONE, C.IRON_L, C.IRON_L], 0.2 + e * 2.6 + cloud * 1.3 - 0.4, x, y);
    },
  },
  dawn: {
    markerK: 2.6, ambient: 0.2, haze: C.ADOBE_L, hazeFrom: 40, hazeTo: 460, sun: SUN_DAWN, sprite: { lx: 0.8, ly: -0.15, cool: true },
    lights: [{ pos: SUN_DAWN.map((a) => a * 400), power: 0.95, reach: 3000, shadows: true }, { pos: [-30, 30, 60], power: 0.55, reach: 140 }],
    sky: (d, x, y) => {
      const e = clamp(d[1], 0, 1);
      const ang = Math.acos(clamp(dot(d, SUN_DAWN), -1, 1));
      let t = Math.pow(e, 0.62) * 5.6;
      // Note: thin streaks of cloud under the light, catching the red of the sun.
      const streak = vnoise(x / 30 + d[0] * 5, y / 2.2) * vnoise(x / 80, y / 12);
      if (e > 0.05 && e < 0.5 && streak > 0.42) t -= 1.1;
      const c = rampAt([C.GOLD_L, C.GOLD, C.ADOBE_L, C.PLASTER, C.GLASS_L, C.GLASS, C.BLUE, C.BLUE_D], t, x, y);
      if (ang < 0.035) return C.BONE;
      if (ang < 0.09 && dith(x, y, 1 - ang / 0.09)) return C.PLASTER_L;
      if (ang < 0.3 && dith(x, y, (1 - ang / 0.3) * 0.6)) return step(c, 1);
      return c;
    },
  },
};

// Note: the dusk light of the poster: a low warm sun behind the camera on the right.
const SUN_DUSK = (() => { const v = [0.55, 0.3, 0.78]; const l = Math.hypot(...v); return v.map((a) => a / l); })();
MOODS.dusk = {
  markerK: 1.4, ambient: 0.2, haze: C.ADOBE_L, hazeFrom: 10, hazeTo: 200, sun: SUN_DUSK, sprite: { lx: 0.7, ly: -0.3, cool: true },
  lights: [{ pos: SUN_DUSK.map((a) => a * 400), power: 1.05, reach: 3000, shadows: true }, { pos: [-20, 8, 20], power: 0.3, reach: 60 }],
  sky: (d, x, y) => {
    const e = clamp(d[1], 0, 1);
    const cloud = vnoise(x / 22, y / 5) * 0.4;
    return rampAt([C.ADOBE_L, C.ADOBE, C.GLASS, C.BLUE, C.BLUE_D], Math.pow(e, 0.7) * 5 + cloud - 0.2, x, y);
  },
};

// Note: the picket fence and the town are seen over the crest; the hill drops in broad terraces.
function boardsMat(c, along, across, width = 0.19) {
  const u = along / width;
  const i = Math.floor(u);
  const f = u - i;
  if (f < 0.07) return { c: step(c, -2) };
  const base = noise(i, 7) < 0.3 ? step(c, -1) : c;
  if (noise(i * 3 + Math.floor(f * 9), Math.floor(across * 34)) > 0.9) return { c: step(base, -1) };
  if (noise(i, Math.floor(across * 6)) > 0.985 && Math.abs(f - 0.5) < 0.2) return { c: step(base, -2) };
  return { c: base };
}
export const boards = boardsMat;

// Note: the track from the gate, as a polyline in the ground plane.
const TRACKS = [
  [[2.6, -1.4], [3.2, -5], [3.9, -10], [5.2, -14], [9, -26], [14, -40], [18, -56], [20, -72], [22, -100]],
  [[10, -0.4], [6.5, -1.6], [3.2, -3.5]],
];
function trackDist(x, z) {
  let best = 99;
  for (const track of TRACKS) {
    for (let i = 0; i + 1 < track.length; i++) {
      const [ax, az] = track[i];
      const [bx, bz] = track[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
  }
  return best;
}

// Note: dry soil at a fine scale: dust, grit, stones and tufts of dead grass, a packed track from the gate.
function dirt(p, far = false) {
  const [x, , z] = p;
  const s = far ? 4 : 18;
  const cx = Math.floor(x * s);
  const cz = Math.floor(z * s);
  const n = noise(cx, cz);
  const patch = vnoise(x / 3.2, z / 3.2);
  const tr = trackDist(x, z);
  let c = patch > 0.6 ? C.SAND_D : C.SAND;
  if (tr < 0.85) {
    c = tr < 0.3 && Math.abs(((x * 0.4 + z * 0.9) % 1.1)) < 0.5 ? C.SAND_L : C.SAND;
    if (n < 0.12) c = step(c, -1);
    if (n > 0.95) c = C.STONE_L;
    if (tr > 0.62 && noise(cx * 2, cz) > 0.7) c = step(c, -1);
    return { c };
  }
  if (n < 0.12) c = step(c, -1);
  else if (n > 0.94) c = patch > 0.6 ? C.SAND : C.SAND_L;
  else if (n > 0.88 && patch < 0.5) c = C.STONE;
  // Note: tufts of dead grass, a tall blade and a short one.
  const t = noise(Math.floor(x * (far ? 2 : 9)) + 3, Math.floor(z * (far ? 2 : 9)) + 11);
  if (t > 0.9 && patch < 0.55) c = fract(z * (far ? 2 : 9)) < 0.4 ? C.GREEN : C.GREEN_D;
  else if (t < 0.06 && patch < 0.6) c = C.SAND_L;
  return { c };
}

// Note: wood with vertical grain, as a post or a plank cut from weathered boards.
const grain = (c, along, across, k = 14) => {
  const g = noise(Math.floor(along * k), Math.floor(across * 3));
  if (g > 0.86) return { c: step(c, -1) };
  if (g < 0.1) return { c: step(c, 1) };
  return { c };
};

// Note: raw earth of a mound: clods and small stones.
const earth = (c) => (p) => {
  const n = n3(Math.floor(p[0] * 34), Math.floor(p[2] * 34), Math.floor(p[1] * 34));
  if (n > 0.975) return { c: C.STONE_L };
  if (n < 0.07) return { c: step(c, -1) };
  if (n > 0.93) return { c: step(c, 1) };
  return { c, k: 0.8 };
};

// Note: a point in the star's outline (five points, pointing up): the polygon of ten corners.
const STAR_PTS = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    const r = i % 2 ? 0.46 : 1;
    pts.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return pts;
})();
export function inStar(dx, dy, R) {
  const x = dx / R;
  const y = dy / R;
  let inside = false;
  for (let i = 0, j = STAR_PTS.length - 1; i < STAR_PTS.length; j = i++) {
    const [xi, yi] = STAR_PTS[i];
    const [xj, yj] = STAR_PTS[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Note: the sheriff's star as a thin gold plate; the face carries a darker rim and a highlight on the upper points.
export function starBox(cx, cy, z, R = 0.1, facing = 1) {
  const z0 = facing > 0 ? z : z - 0.014;
  return box([cx - R, cy - R, z0], [cx + R, cy + R, z0 + 0.014], (p, n) => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    if (!inStar(dx, dy, R)) return null;
    if (!inStar(dx, dy, R * 0.82)) return { c: C.WOOD_L, k: 1.6 };
    // Note: a tip ball at each point, a bright middle and a lit upper-left face.
    if (Math.hypot(dx, dy) < R * 0.16) return { c: C.GOLD_L, k: 1.5 };
    return { c: dx * 0.7 - dy * 0.7 < 0 && dy > -R * 0.2 ? C.GOLD_L : C.GOLD, k: 1.5 };
  }, { noShadow: true });
}

// Note: name and date cut into the board: bold dark letters with a light lower edge so they read incised; a long name goes onto two lines, a worn board loses a few specks.
export function markerTexture(name, date, w, h, ppm, { old = false, star = true } = {}) {
  const tw = Math.max(24, Math.round(w * ppm));
  const th = Math.max(24, Math.round(h * ppm));
  const t = new Px(tw, th);
  const base = old ? C.PLANK : C.PLANK_L;
  for (let x = 0; x < tw; x++) {
    const plank = Math.floor(x / Math.max(8, tw / 4.5));
    for (let y = 0; y < th; y++) {
      const g = noise(x, Math.floor(y / 5) + plank * 9);
      const c = (x % Math.max(8, Math.round(tw / 4.5)) === 0) ? step(base, -2) : g > 0.9 ? step(base, -1) : g < 0.07 ? step(base, 1) : noise(plank, 4) < 0.35 ? step(base, -1) : base;
      t.a[y * tw + x] = c;
    }
  }
  // Note: a rim cut round the board.
  const rim = old ? C.WOOD_D : C.WOOD;
  t.rect(2, 2, tw - 4, 1, rim);
  t.rect(2, th - 3, tw - 4, 1, rim);
  t.rect(2, 2, 1, th - 4, rim);
  t.rect(tw - 3, 2, 1, th - 4, rim);
  const ink = old ? C.DARK : C.SHADOW;
  const hi = old ? C.PLANK : C.SAND_L;
  // Note: one line of letters with the incised look: ink, and a light line one pixel below and right.
  const carve = (str, y, sc, x0 = null) => {
    const wd = textWidth(str, sc);
    const x = x0 ?? Math.round((tw - wd) / 2);
    text(t, str, x + 1, y + 1, hi, sc);
    text(t, str, x, y, ink, sc);
    if (sc > 1) text(t, str, x + 1, y, ink, sc);
    return wd;
  };
  const room = tw - 12;
  const nm = String(name || '').toUpperCase();
  const words = nm.split(' ').filter(Boolean);
  const top = star ? Math.round(th * 0.22) : Math.round(th * 0.12);
  const avail = th - top - 6;
  // Note: the biggest lettering that fits the board: one or two lines at the large scale, then at the small one.
  const split = (sc) => {
    if (textWidth(nm, sc) <= room) return [nm];
    if (words.length < 2) return null;
    for (let k = words.length - 1; k >= 1; k--) {
      const a2 = words.slice(0, k).join(' ');
      const b2 = words.slice(k).join(' ');
      if (textWidth(a2, sc) <= room && textWidth(b2, sc) <= room) return [a2, b2];
    }
    return null;
  };
  let sc = 1;
  let lines = split(1) || [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')].filter(Boolean);
  for (const trial of [2, 1]) {
    const got = split(trial);
    if (got && got.length * (trial * 5 + 2) + 9 <= avail + 2) { sc = trial; lines = got; break; }
  }
  const lineH = sc * 5 + 2;
  const dateH = 5;
  const total = lines.length * lineH + 4 + dateH;
  let y = top + Math.max(0, Math.round((avail - total) / 2));
  for (const ln of lines) { carve(ln, y, sc); y += lineH; }
  // Note: a rule with a small diamond, then the date.
  y += 1;
  const mid = Math.round(tw / 2);
  t.rect(mid - 14, y, 11, 1, ink);
  t.rect(mid + 4, y, 11, 1, ink);
  t.rect(mid - 1, y - 1, 3, 3, ink);
  t.set(mid, y, hi);
  carve(String(date || '').toUpperCase(), y + 4, 1);
  if (old) for (let i = 0; i < tw * th * 0.012; i++) t.set(noise(i, 3) * tw, noise(i, 9) * th, step(base, -1));
  return t;
}

// Note: a marker: two posts and a round-topped board facing +z, with the texture on the front face; optionally the star on a nail above the writing.
function markerBoxes(m, ppm, markerK = 1.3) {
  const { x, z, name, date, star, raise = 0, old = false, lean = 0 } = m;
  const bw = 0.98;
  const bh = 0.7;
  const y0 = 0.42;
  const tex = markerTexture(name, date, bw, bh, ppm, { old, star: star != null });
  const wood = old ? C.PLANK : C.PLANK_L;
  const out = [];
  for (const s of [-1, 1]) {
    const px0 = x + s * 0.36;
    out.push(box([px0 - 0.045, 0, z], [px0 + 0.045, y0 + 0.4, z + 0.08], (p) => grain(wood, p[1], p[0], 18)));
  }
  const top = y0 + bh;
  out.push(box([x - bw / 2 + lean, y0, z + 0.08], [x + bw / 2 + lean, top, z + 0.13], (p, n) => {
    const rx = p[0] - x - lean;
    const ry = p[1] - y0;
    const arc = bh - 0.18;
    if (ry > arc) {
      const t = (ry - arc) / 0.18;
      if (Math.abs(rx) > (bw / 2) * Math.sqrt(Math.max(0, 1 - t * t))) return null;
    }
    if (n[2] > 0.5) {
      const u = Math.floor(((rx + bw / 2) / bw) * tex.w);
      const v = Math.floor(((top - p[1]) / bh) * tex.h);
      const c = tex.get(clamp(u, 0, tex.w - 1), clamp(v, 0, tex.h - 1));
      return { c: c === NONE ? wood : c, k: markerK };
    }
    return { c: step(wood, -1) };
  }));
  // Note: the star's nail and the star itself, standing a little off the board; raised means lifted off the nail.
  if (star) {
    const sy = top - 0.1;
    out.push(box([x - 0.012 + lean, sy - 0.012, z + 0.13], [x + 0.012 + lean, sy + 0.012, z + 0.16], () => ({ c: C.IRON_L }), { noShadow: true }));
    out.push(starBox(x + lean, sy + raise, z + 0.14 + raise * 0.3, 0.085));
  }
  return out;
}

// Note: an older grave: a low mound with a stone border and either a cross or a plain board, in bleached wood, leaning a little.
function oldGrave(x, z, kind, seed) {
  const out = [];
  const wood = [C.WOOD_L, C.STONE, C.PLANK, C.STONE_L][Math.floor(noise(seed, 5) * 4)];
  const lean = (noise(seed, 8) - 0.5) * 0.09;
  const len = 1.7 + noise(seed, 2) * 0.4;
  out.push(box([x - 0.42, 0, z + 0.1], [x + 0.42, 0.13, z + len], earth(noise(seed, 1) > 0.5 ? C.SAND_D : C.ADOBE_D), { noShadow: true }));
  out.push(box([x - 0.3, 0.13, z + 0.3], [x + 0.3, 0.2, z + len - 0.3], earth(C.SAND_D), { noShadow: true }));
  // Note: stones laid along the edge of the mound.
  for (let i = 0; i < 5; i++) {
    const sz = z + 0.2 + (i / 4) * (len - 0.4);
    const side = i % 2 ? 0.46 : -0.46;
    out.push(box([x + side - 0.06, 0, sz - 0.06], [x + side + 0.06, 0.1 + noise(seed, i) * 0.06, sz + 0.06], (p) => ({ c: noise(Math.floor(p[0] * 30), Math.floor(p[2] * 30)) > 0.6 ? C.STONE_L : C.STONE }), { noShadow: true }));
  }
  if (kind === 'cross') {
    out.push(box([x - 0.035, 0, z], [x + 0.035, 0.55, z + 0.07], (p) => grain(wood, p[1], p[0], 20)));
    out.push(box([x - 0.035 + lean, 0.55, z], [x + 0.035 + lean, 1.05, z + 0.07], (p) => grain(wood, p[1], p[0], 20)));
    out.push(box([x - 0.25 + lean, 0.78, z], [x + 0.25 + lean, 0.84, z + 0.06], (p) => grain(wood, p[0], p[1], 20)));
  } else {
    out.push(box([x - 0.2, 0, z], [x + 0.2, 0.5, z + 0.05], (p) => grain(wood, p[1], p[0], 16)));
    out.push(box([x - 0.2 + lean, 0.5, z], [x + 0.2 + lean, 0.78, z + 0.05], (p) => (p[1] > 0.74 && Math.abs(p[0] - x - lean) > 0.14 ? null : grain(wood, p[1], p[0], 16))));
  }
  return out;
}

// Note: sage scrub: a stack of three leafy blocks with holes in them, grey-green and dry.
function scrub(x, z, s = 1, y0 = 0) {
  const holey = (c1, c2) => (p) => {
    const n = n3(Math.floor(p[0] * 14), Math.floor(p[1] * 14), Math.floor(p[2] * 14));
    if (n < 0.33) return null;
    return { c: n > 0.8 ? c2 : n < 0.5 ? step(c1, -1) : c1 };
  };
  return [
    box([x - 0.34 * s, y0, z - 0.3 * s], [x + 0.34 * s, y0 + 0.2 * s, z + 0.3 * s], holey(C.GREEN_D, C.SAND), { noShadow: true }),
    box([x - 0.25 * s, y0 + 0.2 * s, z - 0.22 * s], [x + 0.25 * s, y0 + 0.38 * s, z + 0.22 * s], holey(C.GREEN, C.SAND_L), { noShadow: true }),
    box([x - 0.14 * s, y0 + 0.38 * s, z - 0.13 * s], [x + 0.14 * s, y0 + 0.5 * s, z + 0.13 * s], holey(C.GREEN, C.SAND_L), { noShadow: true }),
  ];
}

// Note: a boulder as two or three stacked blocks.
function rock(x, z, s = 1) {
  const m = (c) => (p) => {
    const n = noise(Math.floor(p[0] * 12), Math.floor(p[1] * 12) + Math.floor(p[2] * 12));
    return { c: n > 0.88 ? step(c, 1) : n < 0.18 ? step(c, -1) : c };
  };
  return [
    box([x - 0.7 * s, 0, z - 0.55 * s], [x + 0.7 * s, 0.5 * s, z + 0.55 * s], m(C.STONE)),
    box([x - 0.5 * s, 0.5 * s, z - 0.4 * s], [x + 0.45 * s, 0.85 * s, z + 0.35 * s], m(C.STONE_L)),
    box([x - 0.25 * s, 0.85 * s, z - 0.2 * s], [x + 0.22 * s, 1.0 * s, z + 0.18 * s], m(C.STONE)),
  ];
}

// Note: a dead tree: a bark trunk, the fork, and bare limbs of different lengths.
function deadTree(x, z) {
  const bark = (p) => {
    const g = noise(Math.floor((p[0] + p[2]) * 22), Math.floor(p[1] * 2));
    return { c: g > 0.7 ? C.WOOD : g < 0.2 ? C.SHADOW : C.WOOD_D };
  };
  const out = [box([x - 0.24, 0, z - 0.22], [x + 0.24, 2.7, z + 0.22], bark), box([x - 0.19, 2.7, z - 0.18], [x + 0.19, 4.0, z + 0.16], bark)];
  const limb = (x0, y0, len, dir, th = 0.09) => out.push(box([x + (dir > 0 ? x0 : x0 - len), y0, z - th], [x + (dir > 0 ? x0 + len : x0), y0 + th * 1.4, z + th], bark));
  limb(0.1, 3.0, 1.7, 1);
  limb(1.6, 3.3, 0.9, 1, 0.06);
  limb(1.3, 3.1, 0.15, 1, 0.05);
  limb(-0.1, 3.4, 1.9, -1);
  limb(-1.6, 3.7, 1.1, -1, 0.06);
  limb(0.0, 3.9, 0.9, 1, 0.06);
  limb(0.5, 4.1, 0.6, 1, 0.045);
  return out;
}

// Note: a picket fence run: pickets with pointed tops and gaps in one thin box, two rails behind, posts between; axis 'x' runs along x at a fixed z, 'z' along z at a fixed x.
function fence(axis, fixed, a0, a1, gap = null) {
  const out = [];
  const pick = (j) => (p, n) => {
    const along = p[j];
    const u = along / 0.17;
    const i = Math.floor(u);
    const f = u - i;
    if (gap && along > gap[0] && along < gap[1]) return null;
    if (f > 0.72 || noise(i, 3) > 0.95) return null;
    const tri = 1 - Math.abs(f - 0.36) / 0.36;
    const top = (noise(i, 6) > 0.9 ? 0.55 : 1.04) + 0.1 * tri;
    if (p[1] > top) return null;
    const c = noise(i, 2) > 0.7 ? C.STONE_L : noise(i, 2) > 0.3 ? C.PLANK_L : C.SAND;
    if (noise(Math.floor(p[1] * 22), i * 7 + 1) > 0.9) return { c: C.STONE };
    if (Math.abs(p[1] - 0.3) < 0.02 || Math.abs(p[1] - 0.82) < 0.02) return { c: step(c, -2) };
    return { c };
  };
  const rail = () => ({ c: C.WOOD_D });
  const post = () => ({ c: C.WOOD });
  if (axis === 'x') {
    out.push(box([a0, 0, fixed - 0.02], [a1, 1.3, fixed + 0.02], pick(0)));
    for (const ry of [0.22, 0.75]) out.push(box([a0, ry, fixed - 0.07], [a1, ry + 0.09, fixed - 0.02], rail));
    for (let px0 = a0; px0 <= a1 + 0.01; px0 += 3.4) if (!gap || px0 < gap[0] || px0 > gap[1]) out.push(box([px0 - 0.07, 0, fixed - 0.1], [px0 + 0.07, 1.3, fixed + 0.04], post));
  } else {
    out.push(box([fixed - 0.02, 0, a0], [fixed + 0.02, 1.3, a1], pick(2)));
    for (const ry of [0.22, 0.75]) out.push(box([fixed - 0.07, ry, a0], [fixed - 0.02, ry + 0.09, a1], rail));
    for (let pz = a0; pz <= a1 + 0.01; pz += 3.4) if (!gap || pz < gap[0] - 0.2 || pz > gap[1] + 0.2) out.push(box([fixed - 0.1, 0, pz - 0.07], [fixed + 0.04, 1.3, pz + 0.07], post));
  }
  return out;
}

// Note: the lettering on the arch over the gate, a white-on-black board at 60 px a metre.
function gateSign() {
  const bw = 1.9;
  const bh = 0.5;
  const t = new Px(Math.round(bw * 60), Math.round(bh * 60));
  t.rect(0, 0, t.w, t.h, C.DARK);
  t.rect(2, 2, t.w - 4, t.h - 4, C.WOOD_D);
  t.rect(3, 3, t.w - 6, 1, C.SAND);
  t.rect(3, t.h - 4, t.w - 6, 1, C.SAND);
  const word = 'BOOT HILL';
  const x = Math.round((t.w - textWidth(word, 2)) / 2);
  text(t, word, x + 1, 11, C.SHADOW, 2);
  text(t, word, x, 10, C.PLASTER, 2);
  for (const sx of [8, t.w - 11]) t.rect(sx, 14, 3, 3, C.GOLD);
  return t;
}

// Note: the whole yard for one mood; o carries the hero marker (name, date, star, raise, old) and ppm, the texture resolution for the lettering.
export function yard(o = {}) {
  const mood = MOODS[o.mood] || MOODS.grey;
  const boxes = [];
  // Note: the crest, then the hill dropping in terraces to the plain with the town.
  boxes.push(box([-400, -40, EDGE], [400, 0, 80], (p) => dirt(p)));
  const N = 12;
  const span = (EDGE - TOWN_Z) / N;
  for (let k = 0; k < N; k++) {
    const top = BASE * ((k + 1) / N);
    boxes.push(box([-400, -40, EDGE - span * (k + 1)], [400, top, EDGE - span * k], (p) => dirt(p, true), { noShadow: true }));
  }
  boxes.push(box([-900, -40, -4000], [900, BASE, TOWN_Z], (p) => dirt(p, true), { noShadow: true }));
  // Note: the town on the plain: false fronts with a lit window here and there, a steeple, a water tower; far mesas behind.
  const town = [[-62, 9, 5.2], [-50, 7, 4.4], [-41, 10, 6.4], [-29, 8, 4.8], [-19, 9, 5.8], [-8, 8, 4.6], [1, 11, 6.6], [14, 8, 5.0], [24, 9, 6.0], [36, 7, 4.4], [46, 10, 5.6], [60, 8, 4.8]];
  town.forEach(([tx, tw, th], i) => {
    const wall = [C.WOOD, C.ADOBE, C.WOOD_L, C.PLANK, C.ADOBE_D][i % 5];
    boxes.push(box([tx, BASE, TOWN_Z - 9], [tx + tw, BASE + th, TOWN_Z - 3 - (i % 3)], (p, n) => {
      if (n[1] > 0.5) return { c: step(wall, -1), ambient: 2 };
      const lx = (p[0] - tx) % 2.6;
      const wy = p[1] - BASE;
      if (n[2] > 0.5 && wy > 1.3 && wy < 2.5 && lx > 0.6 && lx < 1.6) return noise(i, Math.floor((p[0] - tx) / 2.6)) > 0.7 && o.mood === 'dawn' ? { emit: C.GOLD } : { c: step(wall, -3), ambient: 1.2 };
      return { ...boardsMat(wall, p[0], p[1], 0.25), ambient: 2 };
    }, { noShadow: true }));
  });
  boxes.push(box([6, BASE, TOWN_Z - 12], [10, BASE + 11, TOWN_Z - 8], (p) => boardsMat(C.SAND, p[0] + p[2], p[1], 0.3), { noShadow: true }));
  boxes.push(box([6.6, BASE + 11, TOWN_Z - 11.4], [9.4, BASE + 13, TOWN_Z - 8.6], () => ({ c: C.WOOD_D }), { noShadow: true }));
  boxes.push(box([7.4, BASE + 13, TOWN_Z - 10.6], [8.6, BASE + 15, TOWN_Z - 9.4], () => ({ c: C.WOOD_D }), { noShadow: true }));
  for (const [mx, mw, mh, mz] of [[-380, 160, 52, -1500], [-150, 100, 34, -1400], [20, 190, 62, -1650], [260, 120, 40, -1450]]) {
    boxes.push(box([mx, BASE, mz - 60], [mx + mw, BASE + mh, mz], (p) => ({ c: p[1] > BASE + mh * 0.7 ? step(mood.haze, -1) : step(mood.haze, -2) }), { noShadow: true }));
  }
  // Note: the fence round the yard: the gate in the right side, a sign across it.
  boxes.push(...fence('x', -10, -10, -5.4), ...fence('x', -10, 5.6, 10));
  boxes.push(...fence('z', -10, -10, 9));
  boxes.push(...fence('z', 10, -10, 9, [-1.1, 0.5]));
  boxes.push(...fence('x', 9, -10, 10));
  for (const gz of [-1.1, 0.5]) boxes.push(box([9.9, 0, gz - 0.09], [10.1, 2.3, gz + 0.09], (p) => grain(C.WOOD, p[1], p[2], 14)));
  const gs = gateSign();
  boxes.push(box([9.93, 2.0, -1.1], [10.0, 2.5, 0.5], (p, n) => {
    if (n[0] < -0.5) {
      const u = Math.floor(((0.5 - p[2]) / 1.6) * gs.w * 0.84);
      const v = Math.floor(((2.5 - p[1]) / 0.5) * gs.h);
      return { c: gs.get(clamp(u, 0, gs.w - 1), clamp(v, 0, gs.h - 1)) };
    }
    return { c: C.WOOD_D };
  }));
  // Note: the open gate leaf swung inward, hanging a little off its post.
  boxes.push(box([9.0, 0, 0.5], [9.05, 1.1, 1.3], () => ({ c: C.WOOD })));
  // Note: the older graves, scattered in rows that do not quite line up.
  const OLD = [[-3.8, -6.6, 'cross'], [-5.9, -3.2, 'board'], [3.6, -7.4, 'cross'], [5.7, -3.6, 'cross'], [4.4, -1.4, 'board'], [-4.5, -8.4, 'cross'], [7.4, -6.0, 'board'], [-7.8, -5.6, 'cross'], [-2.4, -8.8, 'board'], [8.0, -8.6, 'cross'], [-8.2, -1.8, 'cross']];
  OLD.forEach(([gx, gz, kind], i) => boxes.push(...oldGrave(gx, gz, kind, i + 3)));
  // Note: the hero grave: a fresh mound in tiers with a shovel upright beside it, or an old grown-over one; the marker over it.
  const { x: hx, z: hz } = HERO;
  if (o.old) {
    boxes.push(box([hx - 0.5, 0, hz + 0.12], [hx + 0.5, 0.1, hz + 2.1], earth(C.SAND_D), { noShadow: true }));
    boxes.push(box([hx - 0.36, 0.1, hz + 0.3], [hx + 0.36, 0.17, hz + 1.9], (p) => (noise(Math.floor(p[0] * 10), Math.floor(p[2] * 10)) > 0.55 ? { c: C.GREEN_D } : earth(C.SAND_D)(p)), { noShadow: true }));
  } else {
    boxes.push(box([hx - 0.58, 0, hz + 0.12], [hx + 0.58, 0.16, hz + 2.1], earth(C.WOOD)));
    boxes.push(box([hx - 0.46, 0.16, hz + 0.22], [hx + 0.46, 0.27, hz + 1.95], earth(C.WOOD)));
    boxes.push(box([hx - 0.32, 0.27, hz + 0.34], [hx + 0.32, 0.34, hz + 1.8], earth(C.WOOD)));
    boxes.push(box([hx + 0.95, 0, hz + 0.1], [hx + 1.35, 0.14, hz + 0.6], earth(C.WOOD)));
    if (o.shovel !== false) {
      // Note: the shovel left standing by the marker, blade in the earth, a T grip at the top.
      const sx = hx + 0.95;
      const sz = hz + 0.32;
      boxes.push(box([sx - 0.02, 0.16, sz - 0.02], [sx + 0.02, 1.22, sz + 0.02], (p) => grain(C.WOOD_L, p[1], p[2], 20)));
      boxes.push(box([sx - 0.13, 1.2, sz - 0.025], [sx + 0.13, 1.25, sz + 0.025], () => ({ c: C.WOOD })));
      boxes.push(box([sx - 0.09, 0.1, sz - 0.01], [sx + 0.09, 0.44, sz + 0.01], (p) => ({ c: p[1] < 0.2 ? C.IRON : C.IRON_L })));
    }
    boxes.push(box([hx - 0.54, 0.0, hz + 2.04], [hx + 0.54, 0.05, hz + 2.14], earth(C.ADOBE_D)));
    // Note: a tin cup of wild flowers at the foot of the marker.
    boxes.push(box([hx + 0.5, 0, hz + 0.18], [hx + 0.62, 0.11, hz + 0.3], () => ({ c: C.IRON_L })));
    for (const [fx, fy, fz, fc] of [[0.52, 0.12, 0.2, C.RED_L], [0.58, 0.15, 0.26, C.GOLD_L], [0.55, 0.13, 0.29, C.BONE], [0.6, 0.12, 0.2, C.RED]]) boxes.push(box([hx + fx, fy, hz + fz], [hx + fx + 0.04, fy + 0.07, hz + fz + 0.04], () => ({ c: fc }), { noShadow: true }));
  }
  boxes.push(...markerBoxes({ x: hx, z: hz, name: o.name, date: o.date, star: o.star ? true : null, raise: o.raise || 0, old: !!o.old, lean: o.old ? 0.025 : 0 }, o.ppm || 90, mood.markerK));
  // Note: scrub, rocks and the dead tree outside the fence, a few bushes inside along it.
  for (const [sx, sz, ss] of [[-12.5, -2, 1.2], [-13.5, -10, 1.5], [-15, 3, 1], [12.8, -8, 1.3], [13.4, 2.4, 1], [-6.4, -9.4, 0.9], [11.6, -12, 1.4], [-9, -12.5, 1.3], [7.6, -9.5, 0.8], [-10.8, 6, 1.1], [-18, -7, 1.6], [16, -5.5, 1.2], [-3.4, -12, 1.2], [4.2, -11.6, 1.3]]) boxes.push(...scrub(sx, sz, ss));
  boxes.push(...rock(-14, -5, 1.4), ...rock(13.4, -2.2, 1.0), ...rock(-11.2, -13.6, 1.1));
  boxes.push(...deadTree(-12.4, -7.5));
  if (o.extra) boxes.push(...o.extra);
  return { boxes, lights: mood.lights, ambient: mood.ambient, sky: mood.sky, mood, hero: HERO };
}

// Note: a ray caster like render() in pixel-3d, but each 8 pixel tile tests only the boxes whose projection covers it, so a yard of two hundred boxes stays fast.
function tiledRender(cam, boxes, lights, { ambient, sky, cool }) {
  const T = 8;
  const tx = Math.ceil(cam.w / T);
  const ty = Math.ceil(cam.h / T);
  const lists = Array.from({ length: tx * ty }, () => []);
  for (const b of boxes) {
    let front = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]];
      const v = sub(p, cam.pos);
      const z = dot(v, cam.fwd);
      if (z < 0.05) continue;
      front++;
      const sx = cam.w / 2 + (cam.f * dot(v, cam.right)) / z;
      const sy = cam.h / 2 - (cam.f * dot(v, cam.up)) / z;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    if (!front) continue;
    const all = front < 8;
    const a = all ? 0 : Math.max(0, Math.floor(x0 / T) - 0);
    const c = all ? tx - 1 : Math.min(tx - 1, Math.floor(x1 / T));
    const d = all ? 0 : Math.max(0, Math.floor(y0 / T));
    const e = all ? ty - 1 : Math.min(ty - 1, Math.floor(y1 / T));
    for (let j = d; j <= e; j++) for (let i = a; i <= c; i++) lists[j * tx + i].push(b);
  }
  const casters = boxes.filter((b) => !b.noShadow);
  const px = new Px(cam.w, cam.h);
  const info = new Array(cam.w * cam.h);
  for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
    const d = cam.ray(x, y);
    const h2 = trace(lists[Math.floor(y / T) * tx + Math.floor(x / T)], cam.pos, d);
    const i = y * cam.w + x;
    if (!h2) { px.a[i] = sky(d, x, y); continue; }
    const m = h2.m;
    info[i] = h2;
    if (m.emit != null) { px.a[i] = m.emit; continue; }
    const lv = lightAt(h2.p, h2.n, lights, casters, (m.ambient ?? 1) * ambient) * (m.k ?? 1);
    px.a[i] = shadeOf(m.c, lv, x, y, cool);
  }
  return { px, info };
}

// Note: renders a yard through a camera, then lays haze over what lies far away; returns the picture and what each pixel hit.
export function film(cam, world, extra = []) {
  const { px, info } = tiledRender(cam, [...world.boxes, ...extra], world.lights, { ambient: world.ambient, sky: world.sky, cool: world.mood.cool ?? true });
  const m = world.mood;
  for (let i = 0; i < info.length; i++) {
    const h = info[i];
    if (!h) continue;
    const a = clamp((h.t - m.hazeFrom) / (m.hazeTo - m.hazeFrom), 0, 1);
    if (a > 0 && dith(i % cam.w, (i / cam.w) | 0, a)) px.a[i] = m.haze;
  }
  return { px, info };
}

// Note: depth along the view of a hit.
export const zOf = (cam, p) => dot(sub(p, cam.pos), cam.fwd);

// Note: a hat held in a hand: brim as a flat ellipse and the crown above it, in the look's hat colour.
export function holdHat(L, hx, hy, w, look, light) {
  const c = look && look.hat != null ? look.hat : C.DARK;
  const band = look && look.band != null ? look.band : C.DARK;
  const lt = { ...light, depth: 0.5, hi: false, edge: false };
  // Note: a wide brim seen from slightly above, the crown standing out of it with its band; held at the brim.
  L.lit([[hx - w * 0.55, hy + w * 0.03], [hx - w * 0.3, hy - w * 0.1], [hx + w * 0.3, hy - w * 0.1], [hx + w * 0.55, hy + w * 0.03], [hx + w * 0.3, hy + w * 0.14], [hx - w * 0.3, hy + w * 0.14]], c, lt);
  L.lit([[hx - w * 0.22, hy], [hx - w * 0.2, hy - w * 0.4], [hx + w * 0.2, hy - w * 0.4], [hx + w * 0.22, hy]], c, lt);
  L.rect(hx - w * 0.21, hy - w * 0.17, w * 0.42, Math.max(1, w * 0.07), band);
  L.rect(hx - w * 0.52, hy + w * 0.02, w * 1.04, 1, step(c, -1));
}

// Note: a person standing at a world point, drawn only where nothing nearer is in the way; side on (default) or from behind (back: true); hatless people hold their hat in a hand.
export function actor(cam, info, foot3, look, pose, o = {}) {
  const [sx, sy, depth] = cam.project(foot3);
  const hgt = cam.scaleAt(foot3) * (o.tall ?? 1.8);
  const opt = { hatless: !!o.hat, ...o };
  // Note: seen from behind, pale hair is toned down a little so the back of the head cannot be mistaken for a bare face.
  const paleHair = look && [C.SAND, C.RED_L, C.STONE_L, C.PLASTER].includes(look.hair);
  const seen = o.back && paleHair ? { ...look, hair: step(look.hair, -2) } : look;
  const fig = o.back ? pixelFigure(PW, PH, sx, sy, hgt, seen, pose, opt) : pixelSide(PW, PH, sx, sy, hgt, seen, pose, opt);
  // Note: the bare nape under the hair sits in the shadow of the hat and collar, so it reads as a neck and not a chin.
  if (o.back) {
    const skin = (look && look.skin) ?? C.ADOBE;
    const Hh = hgt / 7.5;
    for (let y = Math.max(0, Math.round(sy - 6.4 * Hh)); y <= Math.min(PH - 1, Math.round(sy - 5.3 * Hh)); y++) {
      for (let x = Math.max(0, Math.round(sx - 0.35 * Hh)); x <= Math.min(PW - 1, Math.round(sx + 0.35 * Hh)); x++) {
        const p = fig.a[y * PW + x];
        if (p === skin || p === step(skin, -1) || p === step(skin, 1)) fig.a[y * PW + x] = C.WOOD_D;
      }
    }
  }
  if (o.hat) {
    const H = hgt / 7.5;
    const dir = o.dir || 1;
    const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.6, cool: !!o.cool };
    const hand = o.back ? [sx - dir * H * 1.2 * 1.0, sy - H * 3.1] : [sx + dir * H * 0.35, sy - H * 3.0];
    holdHat(fig, hand[0], hand[1], Math.max(5, H * 1.3), look, light);
  }
  const L = new Px(PW, PH);
  for (let i = 0; i < fig.a.length; i++) {
    if (fig.a[i] === NONE) continue;
    const h = info[i];
    if (h && zOf(cam, h.p) < depth - 0.35) continue;
    L.a[i] = fig.a[i];
  }
  return { L, sx, sy, depth, hgt };
}

// Note: wind: streaks of dust blown across the picture, thicker low down, some grit nearer the camera.
export function dustWind(px, r, { c = C.SAND_L, amount = 1, ymin = 40, ymax = PH, dir = 1 } = {}) {
  for (let i = 0; i < 70 * amount; i++) {
    const y = ymin + r.next() * (ymax - ymin);
    const x = r.next() * PW;
    const len = 6 + r.next() * 26 * (y / PH + 0.3);
    const dy = (r.next() - 0.5) * 0.16;
    for (let k = 0; k < len; k++) {
      if (dith(Math.round(x + k * dir), Math.round(y + k * dy), 0.4 * (1 - k / len) + 0.1)) px.set(x + k * dir, y + k * dy, c);
    }
  }
}

// Note: a limb drawn through world points (shoulder, elbow, wrist): a lit band whose width is in metres, shaded like the figures beside it.
export function limb(cam, L, pts, widths, c, light) {
  const q = pts.map((p) => cam.project(p));
  const sc = pts.map((p) => cam.scaleAt(p));
  const left = [];
  const right = [];
  for (let i = 0; i < q.length; i++) {
    const a = q[Math.max(0, i - 1)];
    const b = q[Math.min(q.length - 1, i + 1)];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / n;
    const ny = (b[0] - a[0]) / n;
    const w = widths[i] * sc[i];
    left.push([q[i][0] + nx * w, q[i][1] + ny * w]);
    right.push([q[i][0] - nx * w, q[i][1] - ny * w]);
  }
  L.lit([...left, ...right.reverse()], c, { ...light, depth: 0.45 });
  return q;
}

// Note: an arm coming in from outside the frame through world points (far, mid, wrist, pinch): a coat sleeve with its cuff, and a hand whose thumb and forefinger meet at the pinch point, drawn into a fresh layer.
export function reach(cam, pts, look, light) {
  const L = new Px(PW, PH);
  const lk = look || {};
  const coat = lk.coat ?? C.BLUE;
  const skin = lk.skin ?? C.ADOBE;
  const [far, mid, wr, tip] = pts;
  const k = cam.scaleAt(wr);
  const [wx, wy] = cam.project(wr);
  const [tx, ty] = cam.project(tip);
  limb(cam, L, [far, mid, wr], [0.058, 0.05, 0.04], coat, light);
  // Note: seams and a fold of cloth along the sleeve, then the cuff.
  const [mx, my] = cam.project(mid);
  L.line(mx, my - k * 0.03, wx - k * 0.02, wy - k * 0.025, step(coat, -1));
  limb(cam, L, [[wr[0] + (mid[0] - wr[0]) * 0.07, wr[1] + (mid[1] - wr[1]) * 0.07, wr[2] + (mid[2] - wr[2]) * 0.07], wr], [0.044, 0.044], lk.shirt ?? C.PLASTER, light);
  // Note: the hand points from the wrist toward the pinch; the palm, the forefinger on the far side, the thumb on the near side, the other fingers curled.
  const len = Math.hypot(tx - wx, ty - wy) || 1;
  const dx = (tx - wx) / len;
  const dy = (ty - wy) / len;
  const nx = -dy;
  const ny = dx;
  const at = (a, b) => [wx + dx * k * a + nx * k * b, wy + dy * k * a + ny * k * b];
  L.lit([at(0, -0.04), at(0.09, -0.045), at(0.11, 0.04), at(0, 0.04)], skin, { ...light, depth: 0.4, hi: false });
  const finger = (a0, b0, a1, b1, w) => L.lit([at(a0, b0 - w), at(a1, b1 - w * 0.6), at(a1, b1 + w * 0.6), at(a0, b0 + w)], skin, { ...light, depth: 0.5, hi: false });
  const dist = len / k;
  finger(0.09, -0.03, Math.max(0.11, dist), -0.008, 0.014);
  finger(0.09, 0.03, Math.max(0.11, dist), 0.01, 0.013);
  for (let i = 0; i < 3; i++) L.ellipse(...at(0.13 + i * 0.002, 0.045 - i * 0.02), Math.max(1, k * 0.013), Math.max(1, k * 0.017), step(skin, -1));
  L.line(...at(0.02, -0.05), ...at(0.1, -0.055), step(skin, 1));
  // Note: knuckles on the back of the hand and the line of the thumb along the palm.
  for (let i = 0; i < 4; i++) L.set(...at(0.095, -0.03 + i * 0.02), step(skin, 1));
  L.line(...at(0.03, 0.035), ...at(0.085, 0.02), step(skin, -2));
  return L;
}

// Note: a crow in profile perched at a point on the screen, size in pixels: body, tail, wing, head, beak and an eye-glint.
export function crow(px, x, y, size, dir = 1) {
  const k = size / 20;
  const X = (u) => x + u * k * dir;
  const Y = (v) => y - v * k;
  px.poly([[X(-8), Y(5)], [X(-3), Y(10)], [X(5), Y(9)], [X(8), Y(5)], [X(5), Y(1)], [X(-2), Y(0.5)], [X(-9), Y(2)]], C.SHADOW);
  px.poly([[X(-12), Y(1)], [X(-6), Y(5)], [X(-6), Y(1.5)], [X(-11), Y(-1)]], C.SHADOW);
  px.ellipse(X(7), Y(9.5), 2.6 * k, 2.3 * k, C.SHADOW);
  px.poly([[X(9), Y(9.8)], [X(13), Y(9)], [X(9), Y(8.4)]], C.DARK);
  px.line(X(-5), Y(8), X(2), Y(8.5), C.IRON);
  px.set(X(7.4), Y(10), C.GLASS_L);
  px.line(X(1), Y(0.5), X(1), Y(-1.5), C.SHADOW);
  px.line(X(3), Y(0.5), X(3.4), Y(-1.5), C.SHADOW);
}

// Note: a tumbleweed rolling past: a ball of dry scribbled twigs, blurred by a smear of dust behind it.
export function tumbleweed(px, r, cx, cy, rad, dir = 1) {
  // Note: a smear of dust behind it first, then the ball of twigs in two shades over it.
  for (let i = 0; i < 14; i++) px.line(cx - dir * rad, cy + (i - 7) * rad * 0.11, cx - dir * (rad + 8 + r.next() * 16), cy + (i - 7) * rad * 0.11, C.SAND_L);
  px.ellipse(cx, cy, rad * 0.92, rad * 0.88, C.WOOD_D);
  for (let i = 0; i < 46; i++) {
    const a = r.next() * Math.PI * 2;
    const b = a + 0.8 + r.next() * 2.2;
    const rr = rad * (0.5 + r.next() * 0.5);
    px.line(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, cx + Math.cos(b) * rr, cy + Math.sin(b) * rr * 0.92, i % 3 ? C.WOOD_L : i % 2 ? C.SAND_D : C.SAND);
  }
  px.line(cx - rad, cy - rad * 0.2, cx - rad * 1.15, cy - rad * 0.5, C.WOOD_L);
  px.line(cx + rad * 0.9, cy + rad * 0.4, cx + rad * 1.1, cy + rad * 0.55, C.WOOD_L);
}

// Note: a man kneeling on one knee, in profile and bareheaded, bending to set something down: the near arm reaches forward and low, the far hand rests on the front knee and his hat lies on the ground ahead; returns the layer and where the reaching hand is.
// Note: where the pinch of the reaching hand lies from the foot, in head units, when the arm reaches down or up.
export const KNEEL_HAND = { down: [2.46, 1.67], up: [2.62, 5.35] };

export function kneel(w, h, x, foot, height, look, o = {}) {
  const L = new Px(w, h);
  const lk = { skin: C.ADOBE, hair: C.WOOD_D, coat: C.WOOD_D, shirt: C.PLASTER, hat: C.DARK, ...(look || {}), legs: o.legs ?? C.IRON };
  const dir = o.dir || 1;
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.4, cool: !!o.cool };
  const H = height / 7.5;
  const X = (u) => x + u * H * dir;
  const Y = (v) => foot - v * H;
  const P = (list) => list.map(([u, v]) => [X(u), Y(v)]);
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  // Note: a limb as a tapered band through points, widths in head units.
  const band = (pts, ws) => {
    const q = P(pts);
    const left = [];
    const right = [];
    for (let i = 0; i < q.length; i++) {
      const a = q[Math.max(0, i - 1)];
      const b = q[Math.min(q.length - 1, i + 1)];
      const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      left.push([q[i][0] - ((b[1] - a[1]) / n) * ws[i] * H, q[i][1] + ((b[0] - a[0]) / n) * ws[i] * H]);
      right.push([q[i][0] + ((b[1] - a[1]) / n) * ws[i] * H, q[i][1] - ((b[0] - a[0]) / n) * ws[i] * H]);
    }
    return [...left, ...right.reverse()];
  };
  const far = (c) => step(c, -1);
  // Note: the far arm and the rear leg first, the leg folded under with the boot's sole turned up behind.
  lit(band([[0.7, 4.7], [1.0, 3.5], [1.0, 2.5]], [0.3, 0.26, 0.2]), far(lk.coat), { depth: 0.5 });
  lit(band([[0.0, 2.7], [-0.6, 0.45]], [0.48, 0.4]), far(lk.legs), { depth: 0.4 });
  lit(band([[-0.6, 0.4], [-2.0, 0.3]], [0.34, 0.3]), far(lk.legs), { depth: 0.4 });
  lit(P([[-1.9, 0.0], [-2.7, 0.0], [-2.65, 0.75], [-2.0, 0.65]]), C.DARK, { depth: 0.5 });
  L.line(X(-2.0), Y(0.35), X(-2.65), Y(0.35), C.IRON);
  // Note: the coat tail hanging behind, then the torso bent forward from the hip, the gun belt across it.
  lit(P([[-0.6, 3.0], [-1.25, 0.95], [-0.3, 0.55], [0.35, 2.5]]), lk.coat, { depth: 0.5 });
  lit(band(o.up ? [[-0.05, 2.75], [0.3, 3.9], [0.6, 4.85]] : [[-0.05, 2.75], [0.45, 3.9], [0.8, 4.85]], [0.66, 0.62, 0.5]), lk.coat, { depth: 0.5 });
  lit(band([[-0.12, 2.95], [0.3, 2.95]], [0.14, 0.14]), C.WOOD, { depth: 0.3, edge: false });
  L.line(X(-0.55), Y(3.2), X(-0.95), Y(1.4), step(lk.coat, -1));
  // Note: the front leg: the thigh forward and the shin upright, the boot flat on the ground.
  lit(band([[0.05, 2.75], [1.2, 2.0]], [0.5, 0.42]), lk.legs, { depth: 0.45 });
  lit(band([[1.2, 2.0], [1.05, 0.45]], [0.4, 0.3]), lk.legs, { depth: 0.45 });
  lit(P([[0.7, 0.55], [1.35, 0.5], [1.4, 0.2], [2.05, 0.12], [2.05, 0.0], [0.65, 0.0]]), C.WOOD_D, { depth: 0.5 });
  L.set(X(0.62), Y(0.15), C.GOLD_L);
  // Note: the neck and the bowed head in profile: skin, hair at the back and top, an ear, a closed eye, a nose.
  lit(band(o.up ? [[0.65, 4.85], [0.85, 5.35]] : [[0.85, 4.85], [1.05, 5.35]], [0.2, 0.2]), step(lk.skin, -1), { depth: 0.5 });
  const hu = o.up ? -0.25 : 0;
  const hs = (list) => list.map(([u, v]) => [u + hu, v]);
  lit(P(hs([[0.68, 5.3], [0.72, 6.1], [1.1, 6.4], [1.5, 6.25], [1.62, 5.9], [1.85, 5.72], [1.66, 5.6], [1.64, 5.32], [1.4, 5.12], [0.98, 5.12]])), lk.skin, { depth: 0.3, edge: false });
  lit(P(hs([[0.64, 5.35], [0.68, 6.2], [1.1, 6.5], [1.55, 6.3], [1.35, 6.05], [1.05, 5.9], [0.95, 5.4]])), lk.hair, { depth: 0.4, edge: false });
  L.ellipse(X(1.0 + hu), Y(5.65), Math.max(0.6, H * 0.1), Math.max(1, H * 0.15), step(lk.skin, -1));
  L.set(X(1.5 + hu), Y(5.9), C.VOID);
  L.set(X(1.45 + hu), Y(6.0), step(lk.hair, -1));
  if (lk.moustache && lk.moustache !== 'none') L.rect(Math.min(X(1.55 + hu), X(1.8 + hu)), Y(5.55), Math.max(1, H * 0.25), 1, step(lk.hair, -1));
  // Note: the near arm reaching forward and down, the cuff and the hand at its end; the hat on the ground ahead.
  const up = !!o.up;
  const arm = up ? [[0.7, 4.7], [1.55, 4.5], [2.3, 5.05]] : [[0.8, 4.7], [1.65, 3.45], [2.3, 2.1]];
  lit(band(arm, [0.3, 0.26, 0.2]), step(lk.coat, 1), { depth: 0.45 });
  L.line(X(1.55), Y(up ? 4.6 : 3.5), X(1.7), Y(up ? 4.35 : 3.25), step(lk.coat, -1));
  const [wx, wy] = P([arm[2]])[0];
  lit(band(up ? [[2.1, 4.9], [2.3, 5.05]] : [[2.12, 2.4], [2.3, 2.1]], [0.23, 0.23]), lk.shirt, { depth: 0.3, edge: false });
  const hx = X(up ? 2.55 : 2.48);
  const hy = Y(up ? 5.3 : 1.8);
  lit([[wx - H * 0.2 * dir, wy], [wx + H * 0.15 * dir, wy], [hx + H * 0.15 * dir, hy + H * 0.1], [hx - H * 0.05 * dir, hy + H * 0.28], [wx - H * 0.2 * dir, wy + H * 0.1]], lk.skin, { depth: 0.4, hi: false });
  L.line(hx, hy + H * 0.05, hx + dir * H * 0.2, hy + H * 0.3, step(lk.skin, -1));
  holdHat(L, X(-3.7), Y(0.45), H * 1.6, lk, light);
  return { L, hand: [hx + dir * H * 0.1, hy + H * 0.15] };
}
