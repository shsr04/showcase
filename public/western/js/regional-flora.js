// Note: regional plants, rocks, banks, water tints and walls, called only for a non-base look and kept inside their 16x16.

import { SCALE } from './config.js';
import { C, PAL } from './palette.js';
import { pen, hash as hh } from './draw.js';

const px = pen(SCALE).px;

// Warning: own exact-key colour caches, since priming the rounded ones of draw.js could change Cochise colours.
const rgbOf = (i) => [parseInt(PAL[i].slice(1, 3), 16), parseInt(PAL[i].slice(3, 5), 16), parseInt(PAL[i].slice(5, 7), 16)];
const shades = new Map();
function regionTone(i, k) {
  const key = `${i}:${k}`;
  let s = shades.get(key);
  if (!s) {
    const [r, g, b] = rgbOf(i);
    const [tr, tg, tb] = rgbOf(k > 0 ? C.BONE : C.VOID);
    const t = Math.min(1, Math.abs(k));
    s = `rgb(${Math.round(r + (tr - r) * t)},${Math.round(g + (tg - g) * t)},${Math.round(b + (tb - b) * t)})`;
    shades.set(key, s);
  }
  return s;
}
export function regionTint(i, a) {
  const key = `a${i}:${a}`;
  let s = shades.get(key);
  if (!s) {
    const [r, g, b] = rgbOf(i);
    s = `rgba(${r},${g},${b},${a})`;
    shades.set(key, s);
  }
  return s;
}
const jit = (x, y, s, amp) => (hh(x, y, s) - 0.5) * amp;

const LOBES = [[8, 8, 5.8], [5, 6.5, 3.8], [11, 6.5, 3.8], [5.2, 10.4, 3.6], [11, 10.4, 3.6], [8, 4.8, 3.2], [8, 11.6, 3.2]];

// Note: a rounded crown from above in the shape of the mesquite: shadow, dark lobes, lit lobes, speckle, a few boughs and the trunk.
function crown(L, x, y, o) {
  const k = (o.size || 1) * (0.9 + hh(x, y, 380) * 0.22);
  const lobes = o.lobes || LOBES;
  L.e(regionTint(C.VOID, 0.3), 9.4, 9.8, 6.8 * k, 5.8 * k);
  lobes.forEach(([cx, cy, rr], i) => L.e(i % 2 ? o.shade : o.deep, 8 + (cx - 8) * k + jit(x, y, 381 + i, 1.2), 8 + (cy - 8) * k + jit(y, x, 390 + i, 1.2), rr * k, rr * k * 0.9));
  lobes.slice(0, 5).forEach(([cx, cy, rr], i) => {
    const lx = 8 + (cx - 8) * k - 0.9;
    const ly = 8 + (cy - 8) * k - 1;
    L.e(o.lit, lx, ly, rr * k * 0.58, rr * k * 0.48);
    for (let t = 0; t < 4; t++) L.e(o.speck || regionTone(C.GREEN, 0.3), lx + jit(x + t, y, 400 + i, rr), ly + jit(y + t, x, 410 + i, rr * 0.8), 0.9, 0.6);
  });
  for (const [col, p] of o.fleck || []) {
    for (let i = 0; i < 6; i++) if (hh(x, y, 500 + i) < p) L.e(col, 3.5 + hh(y, x, 510 + i) * 9, 3.5 + hh(x, y, 520 + i) * 8, 0.8, 0.7);
  }
  for (let i = 0; i < 10; i++) L.r(regionTint(C.VOID, 0.32), 3 + hh(x, y, 420 + i) * 10, 3.2 + hh(y, x, 430 + i) * 10, px * 2, px);
  if (o.hang) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const ex = 8 + Math.cos(a) * 6.2 * k;
      const ey = 8 + Math.sin(a) * 5.4 * k;
      L.l(o.hang, ex, ey, ex + jit(x, i, 530, 1.2), Math.min(15.4, ey + 1.6 + hh(y, i, 531) * 1.6), px);
    }
  }
  if (o.bough !== false) for (let i = 0; i < 4; i++) L.l(regionTone(C.WOOD, -0.1), 8 + jit(x, y, 440 + i, 9), 8 + jit(y, x, 450 + i, 7), 8 + jit(x, y, 460 + i, 12), 8 + jit(y, x, 470 + i, 10), px);
  L.e(o.trunk || C.WOOD_D, 8, 8.6, 1, 0.9);
}

// Note: a conifer from above: a layered star of boughs with dark whorls and a lit side to the north west.
function star(L, x, y, o) {
  const cx = 8 + jit(x, y, 540, 1);
  const cy = 8 + jit(y, x, 541, 1);
  const n = o.n;
  const R = o.R * (0.92 + hh(x, y, 542) * 0.16);
  L.e(regionTint(C.VOID, 0.32), cx + 1.2, cy + 1.4, R * 0.95, R * 0.8);
  const ring = (rad, ink, dx = 0, dy = 0, rot = 0) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + rot;
      const rr = i % 2 ? rad * o.inner : rad * (0.9 + hh(x, i, 543) * 0.2);
      pts.push([cx + dx + Math.cos(a) * rr, cy + dy + Math.sin(a) * rr * 0.92]);
    }
    L.g(ink, pts);
  };
  ring(R, o.deep);
  ring(R * 0.82, o.mid, -0.2, -0.2, 0.15);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.15;
    L.l(regionTint(C.VOID, 0.4), cx, cy, cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.8, px);
  }
  ring(R * 0.52, o.lit, -0.8, -0.9, 0.3);
  for (let i = 0; i < 6; i++) L.r(regionTint(C.BONE, 0.26), cx - 3 + hh(x, y, 550 + i) * 3.5, cy - 3.4 + hh(y, x, 560 + i) * 3.5, px, px);
  L.e(o.trunk || C.WOOD, cx, cy, 0.9, 0.8);
}

const TREES = {
  oak: (L, x, y) => crown(L, x, y, { size: 1.08, deep: regionTone(C.GREEN_D, -0.05), shade: regionTone(C.GREEN, -0.25), lit: C.GREEN, speck: regionTone(C.GREEN, 0.28) }),
  liveoak: (L, x, y) => crown(L, x, y, { size: 1.14, deep: regionTone(C.GREEN_D, -0.2), shade: regionTone(C.GREEN_D, 0.05), lit: regionTone(C.GREEN, -0.15), speck: regionTone(C.GREEN, 0.12), hang: regionTint(C.STONE_L, 0.55) }),
  hardwood: (L, x, y) => crown(L, x, y, { size: 1.06, deep: regionTone(C.GREEN_D, -0.1), shade: C.GREEN_D, lit: regionTone(C.GREEN, 0.05), fleck: [[C.GOLD, 0.35], [C.RED_L, 0.2]] }),
  aspen: (L, x, y) => crown(L, x, y, { size: 0.86, deep: C.GREEN, shade: regionTone(C.GREEN, 0.12), lit: regionTone(C.GREEN, 0.38), speck: C.GOLD_L, fleck: [[C.GOLD, 0.45]], trunk: C.BONE }),
  willow: (L, x, y) => crown(L, x, y, { size: 1, deep: regionTone(C.GREEN, -0.1), shade: C.GREEN, lit: regionTone(C.GREEN, 0.25), speck: regionTone(C.GREEN, 0.45), hang: regionTone(C.GREEN, 0.15), bough: false }),
  cypress: (L, x, y) => crown(L, x, y, { size: 0.98, deep: regionTone(C.WOOD, -0.05), shade: regionTone(C.GREEN_D, 0.1), lit: regionTone(C.GREEN, -0.05), speck: regionTone(C.ADOBE, 0.1), hang: regionTint(C.WOOD, 0.7) }),
  juniper: (L, x, y) => crown(L, x, y, { size: 0.78, lobes: LOBES.slice(0, 4), deep: regionTone(C.GREEN_D, -0.15), shade: regionTone(C.GREEN_D, 0.08), lit: regionTone(C.GREEN, -0.12), speck: regionTone(C.GLASS, -0.25), trunk: C.WOOD }),
  pinyon: (L, x, y) => crown(L, x, y, { size: 0.8, lobes: LOBES.slice(0, 5), deep: regionTone(C.GREEN_D, 0.02), shade: C.GREEN_D, lit: regionTone(C.GREEN, 0.02), speck: regionTone(C.GREEN, 0.3), trunk: C.WOOD }),
  brush: (L, x, y) => crown(L, x, y, { size: 0.9, lobes: [[8, 8, 4.6], [5, 7.4, 3.4], [11, 7.2, 3.4], [6, 11, 3.2], [11, 11, 3], [8, 5, 2.8]], deep: regionTone(C.GREEN, -0.2), shade: regionTone(C.GREEN, 0.1), lit: regionTone(C.GREEN, 0.34), speck: regionTone(C.STONE_L, 0.3), fleck: [[C.GOLD, 0.3]], bough: false, trunk: C.WOOD }),
  ponderosa: (L, x, y) => star(L, x, y, { n: 9, R: 7.6, inner: 0.58, deep: regionTone(C.GREEN_D, -0.05), mid: regionTone(C.GREEN, -0.3), lit: regionTone(C.GREEN, -0.02), trunk: C.ADOBE_D }),
  fir: (L, x, y) => star(L, x, y, { n: 8, R: 7.7, inner: 0.6, deep: regionTone(C.GREEN_D, -0.35), mid: regionTone(C.GREEN_D, -0.1), lit: regionTone(C.GREEN, -0.2) }),
  spruce: (L, x, y) => star(L, x, y, { n: 10, R: 7.2, inner: 0.52, deep: regionTone(C.BLUE_D, -0.2), mid: regionTone(C.GREEN_D, -0.18), lit: regionTone(C.GREEN, -0.1) }),
  pine: (L, x, y) => star(L, x, y, { n: 11, R: 7.6, inner: 0.66, deep: regionTone(C.GREEN, -0.25), mid: regionTone(C.GREEN, -0.02), lit: regionTone(C.GREEN, 0.28), trunk: C.PLANK }),
};

// Note: any tree kind but mesquite and cottonwood, which flora.js paints itself.
export function paintRegionalTree(L, x, y, kind) {
  (TREES[kind] || TREES.oak)(L, x, y);
}

// Note: a Joshua tree: a stout trunk with a few forks, each ending in a starburst of dagger leaves.
function joshua(L, x, y) {
  L.e(regionTint(C.VOID, 0.28), 9, 10.4, 5.4, 3.6);
  const heads = [[8 + jit(x, y, 600, 1.5), 3.6 + hh(x, y, 601) * 1.4]];
  for (let i = 0; i < 2; i++) heads.push([4 + hh(x, y, 602 + i) * 8, 6 + hh(y, x, 604 + i) * 2.6]);
  for (const [hx, hy] of heads) {
    L.l(regionTone(C.WOOD, -0.1), 8, 12.4, hx, hy + 1, px * 2.2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = 3 + hh(x + i, y, 606) * 1.6;
      L.l(i % 2 ? regionTone(C.GREEN, 0.15) : C.GREEN_D, hx, hy, hx + Math.cos(a) * len, hy + Math.sin(a) * len * 0.85, px);
    }
    L.e(regionTone(C.PLASTER, 0.1), hx, hy, 0.9, 0.8);
  }
  L.e(C.WOOD_D, 8, 12.6, 1.5, 1);
}

// Note: a barrel cactus from above: a ribbed ball with a crown of red hooked spines, now and then a yellow flower.
function barrel(L, x, y) {
  L.e(regionTint(C.VOID, 0.28), 9, 9.6, 5.2, 4.4);
  L.e(C.GREEN_D, 8, 8.4, 4.8, 4.6);
  L.e(C.GREEN, 7.8, 8.2, 4.1, 3.9);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    L.l(regionTone(C.GREEN_D, 0.05), 8, 8.2, 8 + Math.cos(a) * 4.4, 8.2 + Math.sin(a) * 4.2, px);
    L.r(regionTint(C.RED_L, 0.8), 8 + Math.cos(a) * 3.2, 8.2 + Math.sin(a) * 3, px, px);
  }
  L.e(regionTone(C.GREEN, 0.3), 7, 6.8, 1.6, 1.2);
  if (hh(x, y, 620) < 0.4) L.e(C.GOLD, 8, 8.2, 1.3, 1.1);
}

// Note: a clump of big sagebrush: grey-green mounds with a pale underside and a few seed stalks.
function sage(L, x, y) {
  L.e(regionTint(C.VOID, 0.28), 9.2, 10.6, 6.4, 4.4);
  for (let i = 0; i < 5; i++) {
    const cx = 4.5 + hh(x, y, 630 + i) * 7;
    const cy = 6.4 + hh(y, x, 635 + i) * 5;
    const rr = 2.2 + hh(x, y, 640 + i) * 1.6;
    L.e(regionTone(C.GREEN, -0.15), cx, cy, rr, rr * 0.85);
    L.e(regionTone(C.GREEN, 0.18), cx - 0.3, cy - 0.4, rr * 0.75, rr * 0.6);
    L.e(regionTone(C.GREEN, 0.45), cx - 0.6, cy - 0.8, rr * 0.35, rr * 0.28);
  }
  for (let i = 0; i < 5; i++) L.l(C.SAND_L, 3 + hh(x, y, 645 + i) * 10, 5 + hh(y, x, 650 + i) * 6, 3 + hh(x, y, 655 + i) * 10, 4 + hh(y, x, 660 + i) * 4, px);
}

// Note: a bramble thicket: arching canes with small leaves, thorns and dark berries.
function bramble(L, x, y) {
  L.e(regionTint(C.VOID, 0.26), 9, 10, 6, 4.6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + hh(x, y, 670) * 0.5;
    const len = 4 + hh(x, y, 671 + i) * 2.6;
    const mx = 8 + Math.cos(a) * len * 0.55;
    const my = 8 + Math.sin(a) * len * 0.5 - 1.2;
    const ex = 8 + Math.cos(a) * len;
    const ey = 8 + Math.sin(a) * len * 0.8;
    L.l(regionTone(C.WOOD, -0.05), 8, 8, mx, my, px * 1.2);
    L.l(regionTone(C.WOOD, 0.1), mx, my, ex, ey, px);
    L.e(i % 2 ? C.GREEN_D : C.GREEN, ex, ey, 1.4, 1.1);
    L.e(C.GREEN, mx - 0.4, my - 0.4, 1.2, 0.9);
    if (hh(x, y, 690 + i) < 0.45) L.e(hh(y, x, 700 + i) < 0.5 ? C.RED_D : C.BLUE_D, ex + 0.5, ey + 0.4, 0.55, 0.5);
  }
  L.e(C.GREEN_D, 8, 8, 2.2, 1.8);
}

// Note: a windfall: two or three fallen trunks with cut ends, bark and a touch of moss.
function deadfall(L, x, y) {
  L.e(regionTint(C.VOID, 0.3), 9, 10.8, 6.6, 3.4);
  const logs = 2 + (hh(x, y, 710) < 0.5 ? 1 : 0);
  for (let i = 0; i < logs; i++) {
    const a = -0.5 + hh(x, y, 711 + i) * 1.2;
    const cy = 5 + i * 3.4 + jit(y, x, 715 + i, 1);
    const x0 = 2 + hh(x, y, 720 + i) * 2;
    const x1 = 12 + hh(y, x, 725 + i) * 2.4;
    const y0 = cy + Math.sin(a) * 1.5;
    const y1 = cy - Math.sin(a) * 1.5;
    L.l(regionTone(C.WOOD_D, -0.2), x0, y0 + 0.5, x1, y1 + 0.5, px * 4.4);
    L.l(C.WOOD, x0, y0, x1, y1, px * 4);
    L.l(regionTone(C.WOOD, 0.22), x0, y0 - 0.9, x1, y1 - 0.9, px);
    L.e(C.PLANK_L, x1, y1, 1.3, 1.1);
    L.e(C.WOOD_D, x1, y1, 0.6, 0.5);
    if (hh(x, y, 730 + i) < 0.5) L.l(regionTone(C.GREEN, -0.1), x0 + 2, y0, x0 + 7, y0 + (y1 - y0) * 0.5, px * 1.6);
  }
}

// Note: a saw palmetto: a fan of stiff blades from a low stem.
function palmetto(L, x, y) {
  L.e(regionTint(C.VOID, 0.26), 9, 10.4, 5.6, 3.6);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.95 + (i / (n - 1)) * Math.PI * 0.9 + jit(x, i, 740, 0.2);
    const len = 5.6 + hh(x, y + i, 741) * 2;
    const ex = 8 + Math.cos(a) * len;
    const ey = 11.4 + Math.sin(a) * len * 0.95;
    const side = [Math.cos(a + 1.57) * 0.8, Math.sin(a + 1.57) * 0.8];
    L.g(i % 2 ? C.GREEN_D : C.GREEN, [[8 + side[0], 11.4 + side[1]], [ex, ey], [8 - side[0], 11.4 - side[1]]]);
    L.l(regionTone(C.GREEN, 0.3), 8, 11.4, ex, ey, px);
  }
  L.e(C.WOOD, 8, 11.6, 1.2, 0.9);
}

const SPINY = { joshua, barrel, sage, bramble, deadfall, palmetto };

// Note: the spiny or obstacle kinds flora.js does not hold; the cactus tile is a thin solid plant, so each of these is low and open to sight.
export function paintRegionalSpiny(L, x, y, kind) {
  (SPINY[kind] || bramble)(L, x, y);
}

// Note: a tuft of narrow blades fanning from a point; colours are chosen by the caller.
function blades(L, x, y, seed, cx, cy, n, spread, lenLo, lenHi, cols) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * spread + jit(x, y * 3 + seed, 760 + i, 0.3);
    const len = lenLo + hh(y, x + seed, 780 + i) * (lenHi - lenLo);
    L.l(cols[i % cols.length], cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, px);
  }
}

function sagebrush(L, x, y) {
  for (let i = 0; i < 2; i++) {
    const cx = 4 + hh(x, y, 800 + i) * 8;
    const cy = 6 + hh(y, x, 802 + i) * 7;
    const rr = 1.8 + hh(x, y, 804 + i) * 1.4;
    L.e(regionTint(C.VOID, 0.24), cx + 0.7, cy + 0.9, rr, rr * 0.8);
    L.e(regionTone(C.GREEN, -0.12), cx, cy, rr, rr * 0.85);
    L.e(regionTone(C.GREEN, 0.2), cx - 0.3, cy - 0.4, rr * 0.7, rr * 0.55);
    L.r(regionTone(C.GREEN, 0.5), cx - 0.8, cy - 0.9, px * 2, px);
  }
}

function bunch(L, x, y) {
  for (let t = 0; t < 2; t++) {
    const cx = 4.5 + hh(x, y, 810 + t) * 7;
    const cy = 7 + hh(y, x, 812 + t) * 5;
    L.e(regionTint(C.VOID, 0.2), cx + 0.7, cy + 1, 3, 1.5);
    blades(L, x, y, t, cx, cy + 1, 11, 2.4, 2.6, 5, [regionTone(C.GREEN, 0.3), C.STONE_L, C.SAND_L]);
    L.e(regionTone(C.GREEN, -0.1), cx, cy + 1, 1, 0.6);
  }
}

function tall(L, x, y) {
  for (let t = 0; t < 2; t++) {
    const cx = 4 + hh(x, y, 820 + t) * 8;
    const cy = 9 + hh(y, x, 822 + t) * 5;
    L.e(regionTint(C.VOID, 0.18), cx + 0.6, cy + 0.8, 2.8, 1.2);
    for (let i = 0; i < 9; i++) {
      const lean = -0.9 + (i / 8) * 1.8 + jit(x, y + t, 824 + i, 0.4);
      const len = 6 + hh(y, x + t, 835 + i) * 3.4;
      const ex = cx + lean * 3;
      const ey = cy - len;
      L.l(i % 3 === 0 ? C.GOLD : i % 3 === 1 ? regionTone(C.GREEN, 0.05) : C.GREEN_D, cx, cy, ex, ey, px);
      if (i % 3 === 0) L.r(regionTone(C.GOLD_L, -0.1), ex - px, ey - px, px * 2.4, px * 2);
    }
  }
}

function fern(L, x, y) {
  const cx = 8 + jit(x, y, 850, 2);
  const cy = 10.6 + jit(y, x, 851, 1.5);
  L.e(regionTint(C.VOID, 0.22), cx + 0.6, cy + 0.8, 4.6, 1.8);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI + jit(x, i, 852, 0.2);
    const len = 4.2 + hh(x, y + i, 858) * 2.2;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len * 0.9;
    L.l(C.GREEN_D, cx, cy, ex, ey, px * 1.2);
    for (let k = 1; k < 6; k++) {
      const fx = cx + (ex - cx) * (k / 6);
      const fy = cy + (ey - cy) * (k / 6);
      L.l(k % 2 ? C.GREEN : regionTone(C.GREEN, 0.18), fx, fy, fx + Math.sin(a) * 1.3, fy - Math.cos(a) * 1.3, px);
      L.l(k % 2 ? C.GREEN : regionTone(C.GREEN, 0.18), fx, fy, fx - Math.sin(a) * 1.3, fy + Math.cos(a) * 1.3, px);
    }
  }
}

function litter(L, x, y) {
  for (let i = 0; i < 12; i++) {
    const cx = 1.5 + hh(x, y, 860 + i) * 13;
    const cy = 1.5 + hh(y, x, 870 + i) * 13;
    const a = hh(x + i, y, 880) * Math.PI;
    L.l(i % 3 ? regionTone(C.PLANK, -0.15) : regionTone(C.ADOBE_D, -0.1), cx, cy, cx + Math.cos(a) * 1.8, cy + Math.sin(a) * 1.8, px);
  }
  if (hh(x, y, 890) < 0.5) {
    const cx = 4 + hh(x, y, 891) * 8;
    const cy = 5 + hh(y, x, 892) * 7;
    L.e(regionTint(C.VOID, 0.3), cx + 0.4, cy + 0.5, 1.3, 0.9);
    L.e(C.WOOD, cx, cy, 1.2, 0.8);
    L.r(regionTone(C.WOOD, 0.25), cx - 0.6, cy - 0.5, px * 1.5, px);
  }
}

function sedge(L, x, y) {
  for (let t = 0; t < 3; t++) {
    const cx = 3 + hh(x, y, 900 + t) * 10;
    const cy = 7 + hh(y, x, 903 + t) * 6;
    L.e(regionTint(C.VOID, 0.2), cx + 0.5, cy + 0.8, 2.4, 1);
    blades(L, x, y, t, cx, cy + 1, 8, 2.2, 2.4, 4.4, [C.GREEN_D, C.GREEN, regionTone(C.GREEN, 0.25)]);
  }
  if (hh(x, y, 906) < 0.3) L.r(regionTint(C.GLASS_L, 0.7), 2 + hh(x, y, 907) * 10, 12 + hh(y, x, 908) * 3, 3, px);
}

function flower(L, x, y) {
  const cols = [C.RED_L, C.GOLD_L, C.BLUE, C.BONE];
  const pick = Math.floor(hh(x, y, 910) * cols.length);
  blades(L, x, y, 0, 6 + hh(x, y, 911) * 4, 11, 8, 2.2, 2.8, 4.6, [C.GREEN, regionTone(C.GREEN, 0.2), C.SAND_L]);
  for (let i = 0; i < 7; i++) {
    const fx = 2 + hh(x, y, 912 + i) * 12;
    const fy = 3 + hh(y, x, 920 + i) * 9;
    L.r(C.GREEN_D, fx, fy + 0.8, px, 1.6);
    L.e(cols[(pick + (i % 2)) % cols.length], fx, fy, 0.75, 0.65);
  }
}

function shrub(L, x, y) {
  const n = 1 + (hh(x, y, 930) < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const cx = 5 + hh(x, y, 931 + i) * 7;
    const cy = 8 + hh(y, x, 934 + i) * 4;
    const rr = 2.4 + hh(x, y, 937 + i) * 1.4;
    L.e(regionTint(C.VOID, 0.26), cx + 0.8, cy + 1, rr, rr * 0.8);
    L.e(regionTone(C.GREEN_D, -0.05), cx, cy, rr, rr * 0.9);
    L.e(C.GREEN, cx - 0.4, cy - 0.5, rr * 0.7, rr * 0.6);
    for (let k = 0; k < 5; k++) L.r(hh(x, y, 940 + k) < 0.3 ? C.RED_L : regionTone(C.GREEN, 0.3), cx - rr + hh(x + k, y, 945) * rr * 2, cy - rr * 0.7 + hh(y + k, x, 946) * rr * 1.4, px * 1.5, px * 1.5);
  }
}

const SCRUB = { sagebrush, bunch, tall, fern, litter, sedge, flower, shrub };

// Note: the low plants of the scrub tile that flora.js does not hold; the three Cochise kinds stay there.
export function paintRegionalScrub(L, x, y, kind) {
  (SCRUB[kind] || shrub)(L, x, y);
}

// Note: boulder colours by rock type; rim and body are the outline and the face, glow the sun-lit tint, hi the top light and speck the grains.
export const ROCK_STYLES = {
  granite: { rim: C.IRON, body: regionTone(C.STONE, 0.1), glow: null, hi: regionTone(C.STONE_L, 0.18), speck: [C.BONE, C.STONE_L] },
  redrock: { rim: regionTone(C.RED_D, -0.25), body: regionTone(C.ADOBE, -0.12), glow: C.RED_L, hi: regionTone(C.ADOBE_L, 0.1), speck: [C.ADOBE_L, C.RED_L] },
  basalt: { rim: C.DARK, body: C.IRON, glow: null, hi: C.IRON_L, speck: [C.IRON_L, C.STONE] },
  limestone: { rim: C.STONE, body: regionTone(C.PLASTER, -0.08), glow: C.PLASTER_L, hi: C.PLASTER_L, speck: [C.BONE, C.SAND_L] },
  sandstone: { rim: C.ADOBE_D, body: regionTone(C.ADOBE_L, -0.05), glow: C.SAND_L, hi: C.PLASTER, speck: [C.SAND_L, C.ADOBE_L] },
};

// Note: cut-bank colours; the default is the ochre of the Cochise washes, the others are red clay, black loam, grey clay and pale marl.
const BANKS = {
  red: { d: C.RED_D, m: C.RED, l: C.RED_L, lip: C.ADOBE_L, layers: [C.RED, regionTone(C.RED_D, 0.14), C.RED_L, regionTone(C.RED, -0.1), regionTone(C.ADOBE_D, -0.1)], crumb: [C.RED, C.ADOBE_D] },
  dark: { d: C.WOOD_D, m: C.WOOD, l: C.ADOBE_D, lip: C.SAND_D, layers: [C.WOOD, regionTone(C.WOOD_D, 0.14), C.ADOBE_D, regionTone(C.WOOD, -0.1), regionTone(C.WOOD_D, -0.1)], crumb: [C.WOOD, C.ADOBE_D] },
  grey: { d: C.STONE, m: C.STONE_L, l: C.SAND_L, lip: C.PLASTER, layers: [C.STONE_L, regionTone(C.STONE, 0.14), C.SAND_L, regionTone(C.STONE_L, -0.1), regionTone(C.STONE, -0.1)], crumb: [C.STONE_L, C.STONE] },
  pale: { d: C.SAND_D, m: C.SAND, l: C.SAND_L, lip: C.PLASTER_L, layers: [C.SAND, regionTone(C.SAND_D, 0.14), C.SAND_L, regionTone(C.SAND, -0.1), regionTone(C.SAND_D, -0.1)], crumb: [C.SAND, C.SAND_D] },
};
export const bankPalette = (kind) => BANKS[kind] || null;

// Note: river water tinted by what it carries: brown with silt, green in bayous and lakes.
export function tintWater(L, kind) {
  if (kind === 'brown') {
    L.r(regionTint(C.ADOBE_D, 0.62), 0, 0, 16, 16);
    L.r(regionTint(C.GOLD, 0.1), 0, 0, 16, 16);
  } else if (kind === 'green') {
    L.r(regionTint(C.GREEN, 0.4), 0, 0, 16, 16);
    L.r(regionTint(C.GREEN_D, 0.16), 0, 0, 16, 16);
  }
}

// Note: colours of a massive wall by material; stone is cut or fieldstone, sod is cut turf, log is round timber.
const WALL_MATERIALS = {
  stone: { base: C.STONE_L, dark: C.STONE, light: C.SAND_L, wood: C.WOOD_D },
  sod: { base: C.ADOBE_D, dark: C.WOOD_D, light: C.GREEN, wood: C.WOOD_D },
  log: { base: C.WOOD, dark: C.WOOD_D, light: C.PLANK_L, wood: C.WOOD },
};

// Note: one wall tile of a non-adobe material; open is { n, s, w, e } and true where no wall neighbour lies on that side.
export function paintMaterialWall(L, material, x, y, open) {
  const M = WALL_MATERIALS[material];
  if (!M) return false;
  L.r(M.dark, 0, 0, 16, 16);
  for (let r = 0; r < 4; r++) {
    const top = r * 4;
    const v = hh(x, y * 4 + r, 520);
    if (material === 'log') {
      L.r(regionTone(M.base, (v - 0.5) * 0.16), 0, top, 16, 4 - px);
      L.r(regionTone(M.base, 0.2), 0, top + px, 16, px * 1.5);
      L.r(regionTone(M.dark, 0.1), 0, top + 3, 16, px);
      for (let g = 0; g < 2; g++) L.r(regionTint(C.VOID, 0.22), hh(x * 2 + g, y * 4 + r, 521) * 12, top + 1.6 + g, 3 + hh(g, x + r, 522) * 3, px);
    } else {
      const off = (r % 2) * 4 + Math.floor(hh(x, y, r + 530) * 3);
      for (let c = off - 8; c < 16; c += 8) {
        const w = 7.4 + hh(x + c, y * 4 + r, 523) * 0.6;
        const k = hh(x + c, y * 4 + r, 524);
        const left = Math.max(0, c);
        const right = Math.min(16, c + w);
        if (right <= left) continue;
        L.r(regionTone(M.base, (k - 0.5) * (material === 'stone' ? 0.3 : 0.14)), left, top + px, right - left, 4 - 2 * px);
        L.r(regionTint(C.BONE, 0.16), left, top + px, right - left, px);
        if (material === 'sod') for (let t = 0; t < 2; t++) L.r(regionTint(M.light, 0.55), left + hh(x + t, y + c, 525) * (right - left - 1), top + px, px * 1.5, px * 2);
      }
    }
  }
  for (let i = 0; i < 6; i++) L.r(regionTint(i % 2 ? C.VOID : C.BONE, 0.14), hh(x, y, i + 540) * 15, hh(y, x, i + 550) * 15, px * 2, px);
  if (open.n) L.r(regionTone(M.base, 0.18), 0, 0, 16, px * 2);
  if (open.w) L.r(regionTint(C.BONE, 0.16), 0, 0, px * 2, 16);
  if (open.e) L.r(regionTint(C.VOID, 0.2), 16 - px * 2, 0, px * 2, 16);
  if (open.s) {
    L.r(regionTint(C.VOID, 0.24), 0, 12, 16, 4);
    L.r(M.wood, 0, 15, 16, 1);
  }
  return true;
}
