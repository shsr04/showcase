// Note: front-facing pixel portraits (items 311, 312): a look's layers painted in palette colours on a sepia ground, 40 by 48 art pixels.

import { C } from './palette.js';
import { pen, tone, tint, makeCanvas } from './draw.js';
import { portraitLayers } from './camp/looks.js';

export const PORTRAIT_W = 40;
export const PORTRAIT_H = 48;
const CX = 20;

// Note: one painter per layer name; a name may carry a variant after a colon.
const PAINT = {
  backdrop(P, l) {
    P.r(C.SAND_D, 0, 0, PORTRAIT_W, PORTRAIT_H);
    for (let y = 0; y < PORTRAIT_H; y += 4) P.r(tint(C.WOOD_D, 0.1 + (y / PORTRAIT_H) * 0.25), 0, y, PORTRAIT_W, 4);
    P.e(tint(C.SAND_L, 0.35), CX, 18, 16, 14);
    if (l.kind === 'nemesis') P.r(tint(C.RED_D, 0.25), 0, 0, PORTRAIT_W, PORTRAIT_H);
  },
  shoulders(P, l) {
    if (l.sex === 'f') return bodice(P, l);
    P.g(C.DARK, [[2, 48], [6, 37], [14, 33], [26, 33], [34, 37], [38, 48]]);
    P.g(l.coat, [[3, 48], [7, 38], [15, 34], [25, 34], [33, 38], [37, 48]]);
    P.g(l.shirt ?? C.PLASTER, [[16, 34], [24, 34], [22, 48], [18, 48]]);
    if (l.vest != null) {
      P.g(l.vest, [[12, 36], [17, 35], [19, 48], [11, 48]]);
      P.g(l.vest, [[28, 36], [23, 35], [21, 48], [29, 48]]);
    }
    P.l(tone(l.coat, -0.35), 15, 34, 12, 48, 1);
    P.l(tone(l.coat, -0.35), 25, 34, 28, 48, 1);
  },
  // Note: a shawl over both shoulders, its ends crossed and knotted at the breast, with a fringe along the edge.
  shawl(P, l) {
    const dk = tone(l.shawl, -0.3);
    for (const s of [-1, 1]) {
      P.g(dk, [[CX + s * 17.4, 48], [CX + s * 13.4, 37.6], [CX + s * 5.4, 34.2], [CX + s * 0.8, 45], [CX + s * 3, 48]]);
      P.g(l.shawl, [[CX + s * 16.6, 48], [CX + s * 13, 38.4], [CX + s * 5.8, 35], [CX + s * 1.6, 44.6], [CX + s * 3.6, 48]]);
      for (let t = 0; t <= 4; t++) P.r(dk, CX + s * (5.4 - t * 1.05) - 0.3, 35.6 + t * 2.3, 0.6, 1.2);
    }
    P.e(dk, CX, 45.2, 1.7, 1.3);
    P.e(l.shawl, CX, 45, 1.2, 0.9);
  },
  neck(P, l) {
    const nw = l.sex === 'f' ? 5 : 6;
    P.r(tone(l.skin, -0.2), CX - nw / 2, 29, nw, 6);
  },
  // Note: the high collar of a woman's blouse, closed at the throat with a brooch.
  collar(P, l) {
    const sh = l.shirt ?? C.PLASTER_L;
    P.g(tone(sh, -0.25), [[16.2, 31], [23.8, 31], [23.6, 35.6], [20, 37], [16.4, 35.6]]);
    P.g(sh, [[16.8, 31.4], [23.2, 31.4], [23, 35.2], [20, 36.4], [17, 35.2]]);
    P.e(C.WOOD_D, CX, 35.4, 1.1, 0.9);
    P.e(C.GOLD_L, CX, 35.3, 0.7, 0.6);
  },
  face(P, l) {
    const w = (l.sex === 'f' ? [7.4, 7.8, 8.2] : [8, 8.6, 9.2])[l.jaw];
    P.e(C.DARK, CX, 21, w + 1, 11);
    P.e(l.skin, CX, 21, w, 10);
    P.e(tone(l.skin, 0.12), CX - 2, 18, w * 0.5, 4);
    P.e(tone(l.skin, -0.18), CX, 29, w * 0.7, 2);
    P.e(l.skin, CX - w - 0.5, 21, 1.5, 2.5);
    P.e(l.skin, CX + w + 0.5, 21, 1.5, 2.5);
  },
  eyes(P, l) {
    for (const s of [-1, 1]) {
      P.r(C.BONE, CX + s * 4 - 1.5, 19, 3, 1.6);
      P.r(l.eyes, CX + s * 4 - 0.5, 19, 1.4, 1.6);
      P.r(C.VOID, CX + s * 4 - 0.2, 19.4, 0.8, 0.8);
    }
  },
  lashes(P) {
    for (const s of [-1, 1]) {
      P.l(C.VOID, CX + s * 4 - 1.8, 18.8, CX + s * 4 + 1.8, 18.8, 0.5);
      P.l(C.VOID, CX + s * 5.6, 18.9, CX + s * 6.3, 18.2, 0.5);
    }
  },
  brow(P, l) {
    if (l.sex === 'f') {
      // Note: a woman's brows are thin and arched.
      for (const s of [-1, 1]) {
        P.l(tone(l.hair, -0.2), CX + s * 2.2, 17.4, CX + s * 4, 16.7, 0.7);
        P.l(tone(l.hair, -0.2), CX + s * 4, 16.7, CX + s * 6, 17.3, 0.7);
      }
      return;
    }
    const d = [0, 0.6, -0.4][l.brow];
    for (const s of [-1, 1]) P.l(tone(l.hair, -0.2), CX + s * 2, 17.6 + d * s * 0.5, CX + s * 6, 17.2 - d, 1);
  },
  nose(P, l) {
    const n = [1.2, 1.6, 2][l.nose];
    P.g(tone(l.skin, -0.22), [[CX, 19.5], [CX + n, 24], [CX - n, 24]]);
    P.r(tone(l.skin, -0.4), CX - n, 24, n * 2, 0.7);
  },
  mouth(P, l) {
    P.l(tone(l.skin, -0.45), CX - 2.5, 27, CX + 2.5, 27, 0.8);
  },
  lips(P) {
    P.l(tint(C.RED_D, 0.55), CX - 2.2, 26.5, CX + 2.2, 26.5, 0.5);
    P.e(tint(C.RED_D, 0.5), CX, 27.8, 2.1, 0.8);
    for (const s of [-1, 1]) P.e(tint(C.RED_L, 0.2), CX + s * 5, 24, 1.8, 1.1);
  },
  lines(P, l) {
    P.l(tone(l.skin, -0.3), CX - 5, 15, CX - 1, 15, 0.5);
    if (l.age > 1) {
      P.l(tone(l.skin, -0.3), CX - 6.5, 21, CX - 5.5, 23, 0.5);
      P.l(tone(l.skin, -0.3), CX + 6.5, 21, CX + 5.5, 23, 0.5);
    }
  },
  hair(P, l, v) {
    if (WOMAN_HAIR[v]) return womanHair(P, l, v);
    if (v === 'bald') {
      P.e(tone(l.hair, -0.1), CX - 8.5, 20, 1.6, 3);
      P.e(tone(l.hair, -0.1), CX + 8.5, 20, 1.6, 3);
      return;
    }
    P.e(l.hair, CX, 13, 9.4, 5.2);
    P.r(l.hair, CX - 9.4, 13, 2, v === 'long' ? 18 : 8);
    P.r(l.hair, CX + 7.4, 13, 2, v === 'long' ? 18 : 8);
    if (v === 'curly') for (let x = -8; x <= 8; x += 4) P.e(tone(l.hair, 0.12), CX + x, 11, 2, 1.6);
    if (v === 'parted') P.l(tone(l.hair, -0.4), CX - 2, 9, CX - 3, 14, 0.6);
  },
  beard(P, l, v) {
    const col = tone(l.hair, -0.05);
    if (v === 'stubble') for (let x = -6; x <= 6; x += 2) for (let y = 25; y <= 30; y += 2) P.r(tint(l.hair, 0.5), CX + x, y, 0.6, 0.6);
    if (v === 'full') P.g(col, [[CX - 8, 22], [CX + 8, 22], [CX + 6, 30], [CX, 33], [CX - 6, 30]]);
    if (v === 'goatee') P.g(col, [[CX - 2.5, 28], [CX + 2.5, 28], [CX + 1.5, 32], [CX - 1.5, 32]]);
    if (v === 'chops') for (const s of [-1, 1]) P.g(col, [[CX + s * 8.6, 18], [CX + s * 7, 18], [CX + s * 5, 27], [CX + s * 8, 25]]);
  },
  moustache(P, l, v) {
    const col = tone(l.hair, -0.1);
    if (v === 'thin') P.l(col, CX - 3, 25.6, CX + 3, 25.6, 0.7);
    if (v === 'walrus') P.g(col, [[CX - 4.5, 25], [CX + 4.5, 25], [CX + 4, 27.6], [CX - 4, 27.6]]);
    if (v === 'handlebar') {
      P.l(col, CX - 4, 25.4, CX + 4, 25.4, 1);
      for (const s of [-1, 1]) P.l(col, CX + s * 4, 25.4, CX + s * 6, 23.6, 0.8);
    }
  },
  scar(P, l, v) {
    const col = tone(l.skin, 0.3);
    if (v === 'cheek') P.l(col, CX + 4, 21, CX + 7, 26, 0.7);
    if (v === 'brow') P.l(col, CX - 5, 15, CX - 3, 20.5, 0.7);
    if (v === 'lip') P.l(col, CX + 1, 25.5, CX + 2, 28.5, 0.7);
  },
  bandana(P, l) {
    P.g(C.DARK, [[13, 30], [27, 30], [24, 36], [20, 38], [16, 36]]);
    P.g(l.bandana, [[14, 30.5], [26, 30.5], [23.5, 35.5], [20, 37.2], [16.5, 35.5]]);
  },
  badge(P) {
    P.g(C.WOOD_D, star(29, 41, 3.4));
    P.g(C.GOLD_L, star(29, 41, 2.8));
  },
  hat(P, l, v) {
    if (v === 'bonnet' && l.sex === 'f') return bonnet(P, l);
    if (v === 'bonnet' || v === 'visor' || v === 'cap') {
      P.e(C.DARK, CX, 11, 10.5, 5.5);
      P.e(l.hat, CX, 11, 9.6, 4.8);
      return;
    }
    const brim = { wide: 17, round: 14, pinched: 14.5, flat: 15.5, bowler: 12, sombrero: 19 }[v] || 14;
    const crownH = { flat: 5, bowler: 7, pinched: 8 }[v] || 7;
    P.e(C.DARK, CX, 12.5, brim + 0.8, 2.6);
    P.e(l.hat, CX, 12.2, brim, 2);
    P.g(C.DARK, [[CX - 8.8, 12], [CX - 8, 12 - crownH - 0.8], [CX + 8, 12 - crownH - 0.8], [CX + 8.8, 12]]);
    P.g(l.hat, [[CX - 8, 12], [CX - 7.2, 12 - crownH], [CX + 7.2, 12 - crownH], [CX + 8, 12]]);
    if (v === 'pinched') P.g(tone(l.hat, -0.3), [[CX - 1, 12 - crownH], [CX + 1, 12 - crownH], [CX, 12 - crownH + 3]]);
    if (v === 'bowler') P.e(l.hat, CX, 12 - crownH, 7.2, 3);
    P.r(l.band ?? C.DARK, CX - 8, 9.6, 16, 1.6);
    P.e(tone(l.hat, 0.15), CX - 4, 12 - crownH + 2, 2.4, 1);
  },
  wound(P, l, v) {
    if (v === 'head') {
      P.r(C.BONE, CX - 9, 14, 18, 2.4);
      P.r(tint(C.RED, 0.9), CX + 3, 14, 3, 2.4);
    }
    if (v === 'old-head') P.l(tone(l.skin, 0.32), CX - 7, 18, CX - 4, 23, 0.8);
    if (v === 'chest') {
      P.e(tint(C.RED_D, 0.85), CX + 4, 41, 3.4, 2.8);
      P.e(tint(C.RED, 0.8), CX + 4, 40.6, 1.8, 1.4);
    }
    if (v === 'arm') {
      P.g(C.BONE, [[30, 37], [34, 40], [27, 48], [23, 48]]);
      P.r(tint(C.RED, 0.8), 30, 41, 2, 2);
    }
    if (v === 'leg') P.r(C.BONE, 4, 45, 8, 3);
  },
};

// Note: a woman's bodice: narrower shoulders, puffed sleeve heads, a lighter front panel and a row of buttons.
function bodice(P, l) {
  P.g(C.DARK, [[3, 48], [7, 38.5], [15, 34.5], [25, 34.5], [33, 38.5], [37, 48]]);
  P.g(l.coat, [[4, 48], [8, 39.2], [15.4, 35.4], [24.6, 35.4], [32, 39.2], [36, 48]]);
  for (const s of [-1, 1]) P.e(tone(l.coat, 0.12), CX + s * 12.5, 38.8, 3.2, 1.6);
  P.g(tone(l.coat, 0.1), [[17, 35.4], [23, 35.4], [21.5, 48], [18.5, 48]]);
  for (let y = 38; y < 48; y += 3) P.r(C.BONE, 19.6, y, 0.9, 0.9);
  P.l(tone(l.coat, -0.35), 15.4, 35.4, 13, 48, 0.8);
  P.l(tone(l.coat, -0.35), 24.6, 35.4, 27, 48, 0.8);
}

// Note: one painter per woman's hair style, over a crown parted in the middle; a knot on top shows only when no hat covers it.
const WOMAN_HAIR = {
  bun: (P, l, k) => k.knot(4.3, 3.1),
  fringe: (P, l, k) => {
    for (let x = -6; x <= 6; x += 3) {
      P.e(k.dk, CX + x, 14.8, 1.9, 1.5);
      P.e(l.hair, CX + x, 14.5, 1.6, 1.2);
    }
    k.knot(3, 2.2);
  },
  loose: (P, l, k) => {
    for (const s of [-1, 1]) {
      P.g(l.hair, [[CX + s * 7.8, 12.5], [CX + s * 10.4, 12], [CX + s * 12.2, 22], [CX + s * 12.6, 36], [CX + s * 10.6, 39], [CX + s * 8.8, 34], [CX + s * 8.6, 24]]);
      P.l(k.dk, CX + s * 10.5, 16, CX + s * 11, 35, 0.5);
    }
  },
  braids: (P, l, k) => {
    for (const s of [-1, 1]) k.braid(s, 7, 0);
  },
  plait: (P, l, k) => k.braid(1, 9, -0.6),
};

function womanHair(P, l, v) {
  const dk = tone(l.hair, -0.25);
  const hi = tone(l.hair, 0.15);
  P.e(l.hair, CX, 12, 9.6, 4.4);
  P.r(l.hair, CX - 9.6, 12, 1.8, 6);
  P.r(l.hair, CX + 7.8, 12, 1.8, 6);
  for (const s of [-1, 1]) P.e(hi, CX + s * 4, 9.8, 2.6, 0.9);
  if (v !== 'fringe') P.l(dk, CX, 7.8, CX, 12, 0.6);
  const k = {
    dk,
    knot: (rx, ry) => {
      if (l.hat != null) return;
      P.e(dk, CX, 6.2, rx, ry);
      P.e(l.hair, CX, 6.2, rx - 0.6, ry - 0.5);
      P.l(dk, CX - rx * 0.6, 6.4, CX + rx * 0.6, 6, 0.5);
    },
    // Note: a braid of n links from behind the ear on side s, leaning by lean per link, tied off with a ribbon.
    braid: (s, n, lean) => {
      P.r(l.hair, s < 0 ? CX - 10.8 : CX + 9.2, 13, 1.6, 10);
      let x = CX + s * 10;
      let y = 23;
      for (let i = 0; i < n; i++, x += lean, y += 2.6) {
        P.e(dk, x, y, 1.9, 1.5);
        P.e(i % 2 ? l.hair : hi, x, y, 1.5, 1.2);
      }
      P.e(l.ribbon ?? C.RED_L, x, y - 0.8, 1.6, 0.9);
    },
  };
  WOMAN_HAIR[v](P, l, k);
}

// Note: a poke bonnet: a crown over the hair, flaps past the ears, a light brim edge and ribbons tied in a bow under the chin.
function bonnet(P, l) {
  const band = l.band ?? C.RED_L;
  P.e(C.DARK, CX, 9, 12.6, 6.4);
  P.e(l.hat, CX, 9, 11.8, 5.7);
  for (const s of [-1, 1]) {
    P.g(C.DARK, [[CX + s * 12.6, 9.5], [CX + s * 8.6, 10.5], [CX + s * 8.4, 25], [CX + s * 11.6, 26.5]]);
    P.g(l.hat, [[CX + s * 11.8, 10], [CX + s * 9.2, 11], [CX + s * 9, 24.5], [CX + s * 11, 25.6]]);
    P.l(band, CX + s * 9.6, 25, CX + s * 2.5, 31.6, 0.9);
  }
  P.r(band, CX - 10.4, 8.6, 20.8, 1.4);
  P.e(tone(l.hat, 0.18), CX, 14, 9.6, 1);
  for (const s of [-1, 1]) P.e(band, CX + s * 1.4, 32.2, 1.4, 0.9);
  P.e(tone(band, -0.2), CX, 32.2, 0.7, 0.7);
}

function star(x, y, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return pts;
}

// Note: paints the layers onto ctx at k device pixels per art pixel; the hair is drawn under the hat, the wounds last.
export function paintPortrait(ctx, look, marks = [], k = 4) {
  const Q = pen(k);
  const P = {
    r: (col, x, y, w, h) => Q.rect(ctx, col, x, y, w, h),
    e: (col, x, y, rx, ry) => Q.ell(ctx, col, x, y, rx, ry),
    l: (col, x0, y0, x1, y1, w) => Q.line(ctx, col, x0, y0, x1, y1, w),
    g: (col, pts) => Q.poly(ctx, col, pts),
  };
  const layers = portraitLayers(look, marks);
  for (const name of layers) {
    const [part, variant] = name.split(':');
    PAINT[part](P, look, variant);
  }
  return layers;
}

// Note: a canvas element holding the portrait; the sepia and gunsmoke grade is the CSS of .c-portrait.
export function portraitCanvas(look, marks = [], k = 4) {
  const cv = makeCanvas(PORTRAIT_W * k, PORTRAIT_H * k);
  cv.className = 'c-portrait';
  const ctx = cv.getContext && cv.getContext('2d');
  if (ctx) paintPortrait(ctx, look, marks, k);
  return cv;
}
