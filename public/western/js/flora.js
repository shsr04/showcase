// Note: desert and riverside plants and boulders; each painter stays inside its 16x16.

import { SCALE } from './config.js';
import { C } from './palette.js';
import { pen, hash as hh, tone, tint } from './draw.js';
import { floraKind } from './regional-look.js';
import { paintRegionalTree, paintRegionalSpiny, paintRegionalScrub, ROCK_STYLES, bankPalette, tintWater } from './regional-flora.js';

const px = pen(SCALE).px;

const LIGHT = [-0.6, -0.8];

// Note: a rotated ellipse as a polygon, for pads and leaves the axis-aligned ellipse cannot draw.
function slant(cx, cy, rx, ry, rot, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    pts.push([cx + ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot)]);
  }
  return pts;
}

// Note: a rosette seen from above; two rings of pointed leaves, the ones that face the light lit, a dark heart.
function rosette(L, cx, cy, count, reach, half, shades, seed) {
  const [dark, mid, lit] = shades;
  for (let ring = 0; ring < 2; ring++) {
    const r = reach * (ring ? 0.66 : 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * Math.PI / count + (hh(seed, i, ring + 5) - 0.5) * 0.25;
      const len = r * (0.88 + hh(seed, i, ring + 9) * 0.2);
      const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.92];
      const left = [cx + Math.cos(a + 1.57) * half, cy + Math.sin(a + 1.57) * half];
      const right = [cx + Math.cos(a - 1.57) * half, cy + Math.sin(a - 1.57) * half];
      const facing = Math.cos(a) * LIGHT[0] + Math.sin(a) * LIGHT[1];
      L.g(ring ? mid : dark, [left, tip, right]);
      L.l(facing > 0.2 ? lit : mid, cx, cy, cx + (tip[0] - cx) * 0.9, cy + (tip[1] - cy) * 0.9, px);
      if (!ring && facing < -0.2) L.r(tint(C.VOID, 0.35), tip[0] - px, tip[1] - px, px * 2, px * 2);
    }
  }
  L.e(dark, cx, cy, 1.3, 1.1);
  L.e(mid, cx - 0.2, cy - 0.2, 0.6, 0.5);
}

// Note: an agave, a fat rosette of blue-grey leaves with pale spines on the rims.
function agave(L, x, y) {
  const cx = 8 + (hh(x, y, 11) - 0.5) * 1.6;
  const cy = 8.4 + (hh(y, x, 12) - 0.5) * 1.6;
  L.e(tint(C.VOID, 0.28), cx + 0.9, cy + 1.1, 6.4, 5.2);
  rosette(L, cx, cy, 9, 6.6, 1.35, [tone(C.GLASS, -0.55), tone(C.GLASS, -0.3), tone(C.GLASS, 0.05)], x * 31 + y);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    L.r(tint(C.BONE, 0.7), cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.0, px, px);
  }
}

// Note: a yucca, narrow green bayonet leaves in a starburst; now and then a pale flower stalk stands up through it.
function yucca(L, x, y) {
  const cx = 8 + (hh(x, y, 13) - 0.5) * 1.4;
  const cy = 8.6 + (hh(y, x, 14) - 0.5) * 1.4;
  L.e(tint(C.VOID, 0.26), cx + 0.8, cy + 1.2, 6, 4.8);
  rosette(L, cx, cy, 15, 6.8, 0.62, [tone(C.GREEN_D, -0.15), C.GREEN, tone(C.GREEN, 0.38)], x * 17 + y * 3);
  if (hh(x, y, 15) < 0.35) {
    L.l(tone(C.PLANK_L, 0.1), cx, cy, cx + 0.8, cy - 6.6, px * 1.5);
    for (let i = 0; i < 6; i++) L.e(C.BONE, cx + 0.8 + (hh(x, y, 16 + i) - 0.5) * 1.8, cy - 3.2 - i * 0.62, 0.75, 0.55);
  }
}

// Note: a prickly pear: flat oval pads with pale spines and red fruit on the rims.
function pricklyPear(L, x, y) {
  L.e(tint(C.VOID, 0.28), 9.2, 10.4, 6.4, 4.6);
  const pads = [[8, 10.2, 3, 2.5, 0.1]];
  const count = 3 + Math.floor(hh(x, y, 21) * 3);
  for (let i = 0; i < count; i++) {
    const [px0, py0] = pads[Math.floor(hh(x, y, 22 + i) * pads.length)];
    const a = -1.2 + hh(x, y, 30 + i) * 2.4 + (hh(x, y, 40 + i) < 0.4 ? Math.PI : 0);
    pads.push([Math.max(3, Math.min(13, px0 + Math.cos(a) * 3.4)), Math.max(3.4, Math.min(12.4, py0 + Math.sin(a) * 3)), 2.7 - i * 0.12, 2.2, a]);
  }
  for (const [cx, cy, rx, ry, rot] of pads) {
    L.g(tone(C.GREEN_D, -0.1), slant(cx, cy, rx + 0.5, ry + 0.5, rot));
    L.g(tone(C.GREEN, -0.12), slant(cx, cy, rx, ry, rot));
    L.g(tone(C.GREEN, 0.1), slant(cx - 0.5, cy - 0.6, rx * 0.6, ry * 0.55, rot));
    for (let k = 0; k < 5; k++) L.r(tint(C.BONE, 0.85), cx + (hh(cx * 7, k, 51) - 0.5) * rx * 1.5, cy + (hh(cy * 7, k, 52) - 0.5) * ry * 1.5, px, px);
  }
  for (let i = 0; i < 3; i++) {
    const [cx, cy, rx] = pads[Math.floor(hh(x, y, 60 + i) * pads.length)];
    const a = hh(x, y, 64 + i) * Math.PI * 2;
    L.e(C.RED, cx + Math.cos(a) * (rx + 0.3), cy + Math.sin(a) * 2.3, 0.75, 0.65);
    L.r(tone(C.RED, 0.3), cx + Math.cos(a) * (rx + 0.3) - 0.3, cy + Math.sin(a) * 2.3 - 0.3, px, px);
  }
  if (hh(x, y, 70) < 0.4) {
    const [cx, cy] = pads[pads.length - 1];
    L.e(C.GOLD, cx, cy - 2.4, 1.2, 0.9);
    L.e(C.GOLD_L, cx - 0.2, cy - 2.5, 0.6, 0.45);
  }
}

// Note: a cholla, a bristling bush of jointed arms; the spines make a pale haze round every joint.
function cholla(L, x, y) {
  L.e(tint(C.VOID, 0.26), 9.3, 10.6, 5.2, 4);
  const cx = 8;
  const cy = 11;
  const arms = 6 + Math.floor(hh(x, y, 80) * 3);
  for (let i = 0; i < arms; i++) {
    const a = -Math.PI / 2 + (i / (arms - 1) - 0.5) * 2.6 + (hh(x, y, 81 + i) - 0.5) * 0.4;
    const len = 4.6 + hh(x, y, 90 + i) * 2.8;
    const mx = cx + Math.cos(a) * len * 0.5;
    const my = cy + Math.sin(a) * len * 0.5;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    L.l(tone(C.GREEN_D, -0.1), cx, cy, mx, my, 1.7);
    L.l(tone(C.GREEN, -0.15), mx, my, ex, ey, 1.5);
    L.e(tone(C.GREEN, -0.05), ex, ey, 0.95, 0.9);
    L.l(tone(C.GREEN, 0.2), cx - 0.3, cy - 0.3, mx - 0.3, my - 0.3, px);
    for (const [sx, sy] of [[mx, my], [ex, ey]]) {
      for (let k = 0; k < 6; k++) L.r(tint(C.PLASTER_L, 0.8), sx + (hh(x, i * 7 + k, 100) - 0.5) * 3, sy + (hh(y, i * 7 + k, 101) - 0.5) * 3, px, px);
    }
  }
  L.e(C.WOOD_D, cx, cy, 1.3, 1);
}

// Note: an ocotillo: bare grey canes with thorns, leaf dots, red tips.
function ocotillo(L, x, y) {
  L.e(tint(C.VOID, 0.24), 9, 11.4, 5, 3);
  const cx = 8;
  const cy = 12;
  const canes = 8 + Math.floor(hh(x, y, 110) * 3);
  const flower = hh(x, y, 111) < 0.5;
  const leafy = hh(x, y, 112) < 0.5;
  for (let i = 0; i < canes; i++) {
    const a = -Math.PI / 2 + (i / (canes - 1) - 0.5) * 1.7 + (hh(x, y, 113 + i) - 0.5) * 0.3;
    const len = 8 + hh(x, y, 125 + i) * 3;
    const ex = cx + Math.cos(a) * len * 0.8 + (hh(x, y, 140 + i) - 0.5) * 1.6;
    const ey = cy + Math.sin(a) * len;
    L.l(tone(C.WOOD_D, -0.2), cx, cy, ex, ey, 1.2);
    L.l(tone(C.IRON_L, -0.1), cx - 0.2, cy, ex - 0.2, ey, px);
    if (leafy) for (let k = 1; k < 6; k++) L.r(tone(C.GREEN, 0.05), cx + (ex - cx) * k / 6 + (k % 2 ? 0.7 : -0.9), cy + (ey - cy) * k / 6, px * 1.5, px * 1.5);
    if (flower) {
      L.e(C.RED, ex, ey - 0.2, 0.85, 1.1);
      L.r(tone(C.RED, 0.35), ex - 0.3, ey - 0.8, px, px);
    }
  }
  L.e(C.WOOD_D, cx, cy, 1.4, 0.9);
}

// Note: a saguaro with an arm to each side, ribbed and lit from the top left, a red fruit at the crown.
function saguaro(L, x, y) {
  L.e(tint(C.VOID, 0.28), 9, 9.4, 4.8, 4.2);
  L.r(C.GREEN_D, 6, 3, 4, 11.2);
  L.e(C.GREEN_D, 8, 3.2, 2, 1.4);
  L.e(C.GREEN_D, 8, 13.4, 2.2, 1);
  L.r(C.GREEN, 6.6, 3, 2.8, 11);
  L.r(tone(C.GREEN, 0.18), 6.9, 3, px * 2, 11);
  L.r(tint(C.VOID, 0.3), 9.3, 3, px * 2, 11);
  const left = hh(x, y, 150) < 0.85;
  const right = hh(x, y, 151) < 0.85;
  const lift = hh(x, y, 152) * 2;
  if (left) {
    L.r(C.GREEN_D, 2, 6.4 + lift, 5, 3);
    L.e(C.GREEN_D, 2.2, 7.9 + lift, 1.1, 1.5);
    L.r(C.GREEN, 2.4, 6.8 + lift, 4, 2.2);
    L.r(C.GREEN_D, 3.2, 4 + lift, 3, 3.2);
    L.r(C.GREEN, 3.5, 4.3 + lift, 2.2, 2.8);
  }
  if (right) {
    L.r(C.GREEN_D, 10, 8 - lift, 5, 3);
    L.e(C.GREEN_D, 14.8, 9.5 - lift, 1.1, 1.5);
    L.r(C.GREEN, 10.6, 8.4 - lift, 4, 2.2);
    L.r(C.GREEN_D, 11.6, 5.4 - lift, 3, 3.2);
    L.r(C.GREEN, 11.9, 5.7 - lift, 2.2, 2.8);
  }
  for (let i = 0; i < 16; i++) L.r(tint(C.BONE, 0.9), 3 + hh(x, y, 120 + i) * 11, 3 + hh(y, x, 140 + i) * 11, px, px);
  L.e(C.RED_L, 8, 2.4, 1.1, 0.8);
  L.e(C.GOLD_L, 8, 2.3, 0.5, 0.4);
}

const CACTI = [
  [0.3, pricklyPear],
  [0.5, agave],
  [0.68, yucca],
  [0.82, cholla],
  [0.92, ocotillo],
  [1, saguaro],
];

const LEGACY_SPINY = { pricklypear: pricklyPear, agave, yucca, cholla, ocotillo, saguaro };

// Note: the one cactus tile stands for the whole spiny flora of the county; the cell picks a plant from its place, or from the region's look.
export function paintCactus(L, x, y, look = null) {
  if (look) {
    const kind = floraKind(look, 'spiny', x, y);
    return LEGACY_SPINY[kind] ? LEGACY_SPINY[kind](L, x, y) : paintRegionalSpiny(L, x, y, kind);
  }
  const v = hh(x, y, 77);
  for (const [limit, paint] of CACTI) {
    if (v < limit) return paint(L, x, y);
  }
  return saguaro(L, x, y);
}

// Note: mesquite from above; beside a river it becomes a broader, brighter cottonwood.
export function paintMesquite(L, x, y, terrain, look = null) {
  let river = terrain === 'riverbank';
  if (look) {
    const kind = floraKind(look, 'tree', x, y, terrain);
    if (kind !== 'mesquite' && kind !== 'cottonwood') return paintRegionalTree(L, x, y, kind);
    river = kind === 'cottonwood';
  }
  const k = 0.88 + hh(x, y, 380) * 0.24;
  L.e(tint(C.VOID, 0.3), 9.4, 9.8, 6.8 * k, 5.8 * k);
  const lobes = river
    ? [[8, 8, 6.4], [4.6, 6.4, 4.2], [11.4, 6.4, 4.2], [4.8, 10.6, 4], [11.2, 10.6, 4], [8, 4.2, 3.6], [8, 11.6, 3.6]]
    : [[8, 8, 5.8], [5, 6.5, 3.8], [11, 6.5, 3.8], [5.2, 10.4, 3.6], [11, 10.4, 3.6], [8, 4.8, 3.2]];
  const deep = river ? C.GREEN_D : tone(C.GREEN_D, -0.12);
  const shade = river ? C.GREEN : C.GREEN_D;
  lobes.forEach(([cx, cy, rr], i) => L.e(i % 2 ? shade : deep, 8 + (cx - 8) * k + (hh(x, y, 381 + i) - 0.5) * 1.2, 8 + (cy - 8) * k + (hh(y, x, 390 + i) - 0.5) * 1.2, rr * k, rr * k * 0.9));
  lobes.slice(0, 5).forEach(([cx, cy, rr], i) => {
    const lx = 8 + (cx - 8) * k - 0.9;
    const ly = 8 + (cy - 8) * k - 1;
    L.e(river ? tone(C.GREEN, 0.12) : C.GREEN, lx, ly, rr * k * 0.58, rr * k * 0.48);
    for (let t = 0; t < 4; t++) L.e(tone(C.GREEN, 0.28 + (i % 2) * 0.08), lx + (hh(x + t, y, 400 + i) - 0.5) * rr, ly + (hh(y + t, x, 410 + i) - 0.5) * rr * 0.8, 0.9, 0.6);
  });
  for (let i = 0; i < 10; i++) L.r(tint(C.VOID, 0.35), 3 + hh(x, y, 420 + i) * 10, 3.2 + hh(y, x, 430 + i) * 10, px * 2, px);
  for (let i = 0; i < 5; i++) L.l(tone(C.WOOD, -0.1), 8 + (hh(x, y, 440 + i) - 0.5) * 11, 8 + (hh(y, x, 450 + i) - 0.5) * 9, 8 + (hh(x, y, 460 + i) - 0.5) * 15, 8 + (hh(y, x, 470 + i) - 0.5) * 13, px);
  L.e(C.WOOD_D, 8, 8.6, 1, 0.9);
}

// Note: scrub by place: creosote, straw grama grass or dead sage sticks.
const LEGACY_SCRUB = { creosote: 0.2, grama: 0.55, sticks: 0.9 };

export function paintScrub(L, x, y, look = null) {
  let v = hh(x, y, 335);
  if (look) {
    const kind = floraKind(look, 'scrub', x, y);
    if (LEGACY_SCRUB[kind] === undefined) return paintRegionalScrub(L, x, y, kind);
    v = LEGACY_SCRUB[kind];
  }
  if (v < 0.4) {
    for (let i = 0; i < 3; i++) {
      const cx = 3 + hh(x, y, 340 + i) * 10;
      const cy = 4 + hh(y, x, 344 + i) * 9;
      const rr = 1.5 + hh(x, y, 348 + i) * 1.4;
      L.e(tint(C.VOID, 0.24), cx + 0.7, cy + 0.9, rr, rr * 0.8);
      L.e(C.GREEN_D, cx, cy, rr, rr * 0.85);
      L.e(tone(C.GREEN, 0.02), cx - 0.3, cy - 0.4, rr * 0.7, rr * 0.55);
      for (let k = 0; k < 4; k++) L.r(k % 2 ? tone(C.SAND_L, 0.2) : C.GOLD, cx - rr + hh(x + k, y, 352 + i) * rr * 2, cy - rr * 0.7 + hh(y + k, x, 356 + i) * rr, px, px);
    }
  } else if (v < 0.75) {
    for (let t = 0; t < 2; t++) {
      const cx = 4.5 + hh(x, y, 360 + t) * 7;
      const cy = 6 + hh(y, x, 364 + t) * 6;
      L.e(tint(C.VOID, 0.2), cx + 0.7, cy + 1, 3, 1.6);
      const blades = 11;
      for (let i = 0; i < blades; i++) {
        const a = -Math.PI / 2 + (i / (blades - 1) - 0.5) * 2.5 + (hh(x, y * 3 + t, 368 + i) - 0.5) * 0.3;
        const len = 2.8 + hh(y, x + t, 380 + i) * 2.4;
        L.l(i % 3 === 0 ? C.GOLD : i % 3 === 1 ? tone(C.SAND_L, 0.1) : tone(C.PLANK_L, -0.1), cx, cy + 1, cx + Math.cos(a) * len, cy + 1 + Math.sin(a) * len, px);
      }
      L.e(tone(C.GREEN, -0.1), cx, cy + 1, 1, 0.6);
    }
  } else {
    const cx = 8;
    const cy = 10;
    L.e(tint(C.VOID, 0.2), cx + 0.7, cy + 0.8, 4, 1.8);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i / 8 - 0.5) * 2.2 + (hh(x, y, 390 + i) - 0.5) * 0.3;
      const len = 4 + hh(y, x, 400 + i) * 3.4;
      const ex = cx + Math.cos(a) * len;
      const ey = cy + Math.sin(a) * len;
      L.l(tone(C.PLANK, -0.15), cx, cy, ex, ey, px * 1.2);
      L.l(tone(C.PLANK_L, 0.1), ex, ey, ex + (hh(x, y, 410 + i) - 0.5) * 2, ey - 1, px);
    }
    L.e(tone(C.GREEN, -0.1), cx, cy, 1.3, 0.8);
  }
}

// Note: a boulder from above: shadow, weathered grey body, strata, lit face, chips.
function boulder(L, cx, cy, r, seedA, seedB, warm) {
  // Note: warm is a flag for the Cochise rocks or a ROCK_STYLES entry for a regional rock.
  const st = warm && typeof warm === 'object' ? warm : null;
  const pts = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hh(seedA, seedB, i) * 0.3;
    const rr = r * (0.76 + hh(seedB, seedA, i + 20) * 0.32);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.88]);
  }
  const rim = st ? st.rim : warm ? tone(C.ADOBE_D, -0.3) : C.IRON;
  const body = st ? st.body : warm ? tone(C.STONE, 0.04) : C.STONE;
  L.g(tint(C.VOID, 0.32), pts.map(([a, b]) => [a + 1, b + 1.2]));
  L.g(rim, pts);
  L.g(body, pts.map(([a, b]) => [cx + (a - cx) * 0.92 - 0.3, cy + (b - cy) * 0.92 - 0.4]));
  const inner = pts.map(([a, b]) => [cx + (a - cx) * 0.9 - 0.3, cy + (b - cy) * 0.9 - 0.4]);
  if (st ? st.glow : warm) L.g(tint(st ? st.glow : C.ADOBE, 0.4), inner.slice(0, 6));
  for (let s = 0; s < 3; s++) {
    const yy = cy - r * 0.4 + s * r * 0.45;
    L.l(tint(C.DARK, 0.35), cx - r * 0.7, yy + (hh(seedA, seedB, 30 + s) - 0.5), cx + r * 0.7, yy + (hh(seedB, seedA, 34 + s) - 0.5) * 1.6, px);
    L.l(tint(C.BONE, 0.14), cx - r * 0.6, yy + px * 2, cx + r * 0.6, yy + px * 2 + (hh(seedA, seedB, 38 + s) - 0.5), px);
  }
  const streak = cx - r * 0.3 + hh(seedA, seedB, 40) * r * 0.8;
  L.l(tint(C.DARK, 0.4), streak, cy - r * 0.2, streak + (hh(seedB, seedA, 41) - 0.5) * 2, cy + r * 0.7, px * 1.4);
  L.g(st ? st.hi : C.STONE_L, pts.map(([a, b]) => [cx + (a - cx) * 0.52 - 1, cy + (b - cy) * 0.48 - 1.2]));
  L.g(tint(C.BONE, 0.3), pts.slice(5, 9).map(([a, b]) => [cx + (a - cx) * 0.36 - 1.2, cy + (b - cy) * 0.3 - 1.5]));
  for (let k = 0; k < 4; k++) L.r(tint(st ? st.speck[k % 2] : k % 2 ? C.GOLD : C.ADOBE_L, 0.45), cx - r * 0.6 + hh(seedA, seedB, 50 + k) * r * 1.2, cy - r * 0.5 + hh(seedB, seedA, 55 + k) * r, px * 1.5, px);
}

// Note: a rock cell is one big boulder, a flat slab, or a boulder with a chip beside it.
export function paintRock(L, x, y, terrain, look = null) {
  const warm = look && look.rock ? ROCK_STYLES[look.rock] : terrain === 'mining-camp' || terrain === 'rocky-hills';
  const v = hh(x, y, 360);
  if (v < 0.22) {
    L.e(tint(C.VOID, 0.3), 9.2, 10.4, 6.8, 3.8);
    boulder(L, 8, 9, 6.4, x, y, warm);
    return;
  }
  boulder(L, 8, 8.2, 6.4 - v * 0.6, x, y, warm);
  if (v > 0.55) boulder(L, 3.5 + hh(x, y, 361) * 9, 3 + hh(x, y, 362) * 2.4, 2.2, y, x, warm);
  if (v > 0.8) boulder(L, 12.5, 13, 1.6, x + 1, y, warm);
}

// Note: a cut bank in layers of earth that wobble along the tile run; a pale lip, a dark overhang, crumbs at the foot.
// Note: built at paint time, so no shared colour cache is primed at import.
const ochreBank = () => ({ d: C.ADOBE_D, m: C.ADOBE, l: C.ADOBE_L, lip: C.SAND_L, layers: [C.ADOBE, tone(C.ADOBE_D, 0.14), C.ADOBE_L, tone(C.ADOBE, -0.1), tone(C.SAND_D, -0.1)], crumb: [C.ADOBE, C.SAND_D] });

export function paintBank(L, x, y, look = null) {
  const B = (look && bankPalette(look.bank)) || ochreBank();
  L.r(tint(C.VOID, 0.2), 0.6, 3.4, 15.4, 12);
  L.r(B.d, 0, 2, 16, 12);
  let top = 3.2;
  for (let i = 0; i < 5; i++) {
    const hgt = 1 + hh(0, y, 430 + i) * 1.6;
    const col = B.layers[(i + y) % 5];
    for (let c = 0; c < 16; c += 2) L.r(col, c, top + Math.sin((x * 16 + c) * 0.5 + i * 2.1) * 0.35, 2, hgt);
    L.r(tint(C.VOID, 0.2), 0, top + hgt, 16, px);
    top += hgt + 0.2;
  }
  L.r(B.l, 0, 2, 16, 1.2);
  L.r(B.lip, 0, 2, 16, px);
  L.r(tint(C.VOID, 0.4), 0, 3.2, 16, 0.7);
  L.r(tint(C.VOID, 0.35), 0, 13.2, 16, 0.9);
  for (let i = 0; i < 7; i++) L.r(hh(x, y, 430 + i) < 0.5 ? C.STONE : B.l, hh(x, y, 440 + i) * 15, 4 + hh(y, x, 450 + i) * 8, px * 2, px);
  for (let i = 0; i < 6; i++) L.e(hh(x, y, 460 + i) < 0.5 ? B.crumb[0] : B.crumb[1], 1 + hh(x, y, 470 + i) * 14, 13.8 + hh(y, x, 480 + i) * 1, 0.9, 0.5);
}

// Note: river water; depth is blended from the four tile corners so shores show no steps.
export function paintWater(L, x, y, isWater, look = null) {
  const corner = (i, j) => {
    let n = 0;
    for (let dy = j - 1; dy <= j; dy++) for (let dx = i - 1; dx <= i; dx++) if (isWater(dx, dy)) n++;
    return Math.max(0, (n / 4 - 0.5) * 2);
  };
  const d00 = corner(0, 0);
  const d10 = corner(1, 0);
  const d01 = corner(0, 1);
  const d11 = corner(1, 1);
  L.r(C.BLUE, 0, 0, 16, 16);
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      const u = (bx + 0.5) / 8;
      const v = (by + 0.5) / 8;
      const d0 = d00 + (d10 - d00) * u;
      const d1 = d01 + (d11 - d01) * u;
      const d = Math.max(0, Math.min(1, d0 + (d1 - d0) * v + (hh(x * 8 + bx, y * 8 + by, 495) - 0.5) * 0.3));
      if (d < 0.97) {
        L.r(tint(C.SAND_D, 0.62 * (1 - d)), bx * 2, by * 2, 2, 2);
        L.r(tint(C.GLASS, 0.28 * (1 - d)), bx * 2, by * 2, 2, 2);
      }
      if (d > 0.3) L.r(tint(C.BLUE_D, 0.46 * d), bx * 2, by * 2, 2, 2);
    }
  }
  if (look && look.water) tintWater(L, look.water);
  for (let i = 0; i < 6; i++) {
    const yy = 0.5 + hh(x, y, 460 + i) * 15;
    const xx = hh(y, x, 465 + i) * 10;
    L.r(tint(C.GLASS, 0.8), xx, yy, 3 + hh(x, y, 470 + i) * 3, px);
    L.r(tint(C.GLASS_L, 0.5), xx + 1, yy + 2 * px, 2, px);
  }
  if (hh(x, y, 490) < 0.35) L.r(tint(C.BONE, 0.7), 2 + hh(x, y, 491) * 11, 2 + hh(y, x, 492) * 11, px * 2, px);
}
