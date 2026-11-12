// Note: furniture of the ten building themes, seen from above and lit from the north west; every piece stays inside its 16 x 16 cell.

import { SCALE } from './config.js';
import { C } from './palette.js';
import { pen, hash as hh, tint, tone } from './draw.js';
import { T } from './tiles.js';

const px = pen(SCALE).px;
const edge = (col) => tone(col, -0.5);
const drop = (L, w, h) => L.ell(tint(C.VOID, 0.34), 8.8, 9.4, w / 2, h / 2);
const dab = (L, col, x, y, rx, ry = rx) => {
  L.ell(tint(C.VOID, 0.3), x + 0.35, y + 0.4, rx, ry);
  L.ell(col, x, y, rx, ry);
};

// Note: a slab of planks with a dark outline, a bright north-west rim, a shaded south-east rim, seams and grain.
function slab(L, x, y, w, h, wood, seed, bands = 3) {
  L.rect(edge(wood), x, y, w, h);
  const bh = (h - 1.4) / bands;
  for (let i = 0; i < bands; i++) {
    const top = y + 0.7 + i * bh;
    L.rect(tone(wood, (hh(seed, i, 5) - 0.5) * 0.16), x + 0.7, top, w - 1.4, bh);
    if (i < bands - 1) L.rect(tone(wood, -0.28), x + 0.7, top + bh - px, w - 1.4, px);
    for (let g = 0; g < 2; g++) L.rect(tone(wood, -0.13), x + 1.2 + hh(seed, i * 3 + g, 7) * (w - 5), top + 0.5 + g * (bh * 0.45), 1.8 + hh(seed, i, 9 + g) * 3, px);
  }
  L.rect(tone(wood, 0.3), x + 0.7, y + 0.7, w - 1.4, px * 1.5);
  L.rect(tone(wood, 0.2), x + 0.7, y + 0.7, px * 1.5, h - 1.4);
  L.rect(tone(wood, -0.32), x + 0.7, y + h - 0.7 - px * 1.5, w - 1.4, px * 1.5);
  L.rect(tone(wood, -0.24), x + w - 0.7 - px * 1.5, y + 0.7, px * 1.5, h - 1.4);
}

// Note: a round top of planks with a bevel that is bright to the north west and dark to the south east.
function disc(L, cx, cy, r, wood, seed) {
  L.ell(edge(wood), cx, cy, r, r);
  L.ell(tone(wood, -0.22), cx + 0.3, cy + 0.3, r - 0.7, r - 0.7);
  L.ell(wood, cx - 0.3, cy - 0.3, r - 1.3, r - 1.3);
  L.ell(tone(wood, 0.14), cx - 0.8, cy - 0.8, (r - 1.3) * 0.7, (r - 1.3) * 0.7);
  for (const o of [-0.38, 0.32]) {
    const d = o * (r - 1);
    const half = Math.sqrt(Math.max(0, (r - 1.2) ** 2 - d * d));
    L.rect(tone(wood, -0.24), cx - half, cy + d, half * 2, px);
    L.rect(tone(wood, 0.12), cx - half, cy + d + px, half * 2, px);
  }
  for (let g = 0; g < 3; g++) L.rect(tone(wood, -0.12), cx - r * 0.55 + hh(seed, g, 11) * r * 0.6, cy - r * 0.6 + hh(seed, g, 12) * r * 1.2, 1.6 + hh(seed, g, 13) * 2, px);
}

function bottle(L, x, y, col) {
  L.ell(tint(C.VOID, 0.3), x + 0.5, y + 0.6, 1.1, 1.5);
  L.ell(edge(col), x, y, 1.15, 1.55);
  L.ell(col, x, y, 0.85, 1.25);
  L.rect(tint(C.GLASS_L, 0.8), x - 0.5, y - 0.9, px * 1.5, 1.2);
  L.rect(C.DARK, x - 0.3, y - 2.1, 0.6, 0.8);
  L.rect(C.BONE, x - 0.8, y - 0.1, 1.6, 0.7);
}

function glass(L, x, y) {
  L.ell(tint(C.VOID, 0.28), x + 0.4, y + 0.4, 1, 1);
  L.ell(tint(C.GLASS_L, 0.85), x, y, 0.95, 0.95);
  L.ell(C.GOLD, x, y, 0.55, 0.55);
  L.rect(C.BONE, x - 0.55, y - 0.6, px * 1.5, px);
}

function candle(L, x, y) {
  L.ell(tint(C.GOLD_L, 0.28), x, y - 0.4, 2.2, 2.2);
  L.rect(C.BONE, x - 0.45, y - 0.2, 0.9, 1.6);
  L.ell(C.GOLD_L, x, y - 0.6, 0.5, 0.75);
}

function plate(L, x, y, r) {
  L.ell(tint(C.VOID, 0.3), x + 0.35, y + 0.4, r, r);
  L.ell(C.STONE_L, x, y, r, r);
  L.ell(C.BONE, x, y, r - 0.35, r - 0.35);
  L.ell(C.PLASTER_L, x, y, r - 1.1, r - 1.1);
  L.rect(C.WOOD_D, x - r * 0.4, y - r * 0.1, r * 0.5, px);
}

// Note: a long faro table over two cells; the left half is theme.half 'l' and the right 'r', and both paint the same world so the seam cannot show.
function faroTop(L, theme, x, y) {
  const o = theme.half === 'r' ? 16 : 0;
  const wood = theme.wood;
  const wx = (v) => v - o;
  slab(L, wx(0.8), 1.6, 30.4, 12.6, wood, hh(x - o / 16, y, 31) * 90, 3);
  L.rect(edge(theme.fabric), wx(2.2), 2.6, 27.6, 9.4);
  L.rect(theme.fabric, wx(2.7), 3.1, 26.6, 8.4);
  L.rect(tone(theme.fabric, 0.14), wx(2.7), 3.1, 26.6, px * 2);
  L.rect(tone(theme.fabric, -0.2), wx(2.7), 11.5 - px * 2, 26.6, px * 2);
  // Note: the suit of spades laid out in thirteen ranks, the layout players stake on.
  for (let i = 0; i < 13; i++) {
    const cx = 3.9 + i * 2.0;
    L.rect(tint(C.VOID, 0.3), wx(cx) + 0.3, 4.5, 1.5, 2.4);
    L.rect(C.BONE, wx(cx), 4.2, 1.5, 2.4);
    L.rect(tone(C.BONE, -0.2), wx(cx), 4.2, px * 1.5, 2.4);
    L.rect(C.DARK, wx(cx) + 0.5, 5.1, 0.5, 0.6);
  }
  for (const [cx, n, col] of [[6, 3, C.GOLD], [10.6, 2, C.RED], [18.4, 4, C.GOLD_L], [23, 2, C.GOLD], [26.4, 3, C.RED]]) for (let k = 0; k < n; k++) dab(L, col, wx(cx), 9.4 - k * 0.55, 0.9, 0.65);
  // Note: the dealing box with the top card showing, and the case keeper beside it.
  L.rect(tint(C.VOID, 0.35), wx(13.6), 8.2, 4.6, 3.2);
  L.rect(C.WOOD_D, wx(13.2), 7.8, 4.6, 3.2);
  L.rect(C.BONE, wx(13.8), 8.2, 2.4, 2.2);
  L.rect(C.RED_D, wx(14.3), 8.7, 1.4, 1.2);
  L.rect(C.WOOD_D, wx(19.4), 8, 4.2, 2.6);
  for (let r = 0; r < 3; r++) L.rect(C.GOLD, wx(19.8), 8.4 + r * 0.7, 3.4, px * 1.5);
  glass(L, wx(1.2) + 1.4, 11.2);
  L.rect(tone(wood, -0.35), wx(1.6), 12.3, 28.8, 1.4);
  for (let dx = 3; dx < 30; dx += 4.2) L.rect(C.GOLD, wx(dx), 12.8, 1.2, px * 1.5);
}

// Note: an upright piano against the wall over two cells (theme.half 'l' or 'r'), keys to the south.
function pianoTop(L, theme, x, y) {
  const o = theme.half === 'r' ? 16 : 0;
  const wx = (v) => v - o;
  const wood = C.WOOD_D;
  L.rect(tint(C.VOID, 0.35), wx(1.4), 2.6, 30, 11.4);
  L.rect(edge(wood), wx(0.8), 1.6, 30.4, 11.6);
  L.rect(tone(wood, -0.1), wx(1.5), 2.3, 29, 10.2);
  L.rect(tone(wood, 0.32), wx(1.5), 2.3, 29, px * 2);
  L.rect(tone(wood, 0.2), wx(1.5), 2.3, px * 2, 10.2);
  L.rect(tone(wood, -0.3), wx(1.5), 12.5 - px * 2, 29, px * 2);
  for (const lx of [4, 12, 20, 28]) L.rect(tone(wood, 0.1), wx(lx), 3.2, px * 1.5, 3.8);
  // Note: the music stand, then the keys: white keys with a row of black ones, and a gilt strip over them.
  L.rect(C.PLASTER_L, wx(12.6), 5, 6.8, 2.8);
  for (let r = 0; r < 3; r++) L.rect(C.STONE, wx(13.2), 5.6 + r * 0.7, 5.6, px);
  L.rect(C.DARK, wx(2.6), 8.4, 26.8, 3.6);
  L.rect(C.BONE, wx(3), 8.8, 26, 3);
  for (let k = 1; k < 13; k++) L.rect(tone(C.BONE, -0.3), wx(3 + k * 2), 8.8, px, 3);
  for (let k = 0; k < 12; k++) if (k !== 2 && k !== 6 && k !== 9) L.rect(C.DARK, wx(4.6 + k * 2), 8.8, 0.9, 1.8);
  L.rect(C.GOLD, wx(2.6), 8, 26.8, px * 2);
  for (const cx of [3.6, 28.4]) candle(L, wx(cx), 4.6);
}

function tableTop(L, theme, x, y, square) {
  if (theme.variant === 'faro') return faroTop(L, theme, x, y);
  if (theme.variant === 'piano') return pianoTop(L, theme, x, y);
  const wood = theme.wood;
  if (square) slab(L, 0.8, 1.6, 14.4, 12.6, wood, hh(x, y, 31) * 90, 3);
  else disc(L, 8, 7.6, 7, wood, hh(x, y, 31) * 90);
  const cx = 8;
  const cy = square ? 7.2 : 7.6;
  if (theme.motif === 'cards') {
    L.ell(edge(theme.fabric), cx, cy, 5, 3.9);
    L.ell(theme.fabric, cx, cy, 4.6, 3.5);
    L.ell(tone(theme.fabric, 0.16), cx - 0.8, cy - 0.7, 3, 2);
    for (const [a, b, last] of [[4, 6.8, 0], [5.1, 6.3, 0], [6.2, 5.8, 1]]) {
      L.rect(tint(C.VOID, 0.3), a + 0.4, b + 0.4, 2.2, 3.2);
      L.rect(C.BONE, a, b, 2.2, 3.2);
      L.rect(tone(C.BONE, -0.2), a, b, px * 1.5, 3.2);
      if (last) {
        L.rect(C.RED, a + 0.7, b + 0.7, 0.8, 0.8);
        L.rect(C.RED, a + 0.7, b + 1.9, 0.8, 0.5);
      }
    }
    for (const k of [0, 1]) {
      L.rect(tint(C.VOID, 0.3), 9.9 - k * 0.3, 5.1 - k * 0.3, 2.2, 3.2);
      L.rect(C.BONE, 9.5 - k * 0.3, 4.7 - k * 0.3, 2.2, 3.2);
    }
    L.rect(C.RED_D, 9.9, 5.1, 1.4, 2.4);
    L.rect(tone(C.RED_D, 0.3), 10.4, 5.5, px * 1.5, 1.6);
    for (const [dx, dy, col] of [[0, 0, C.GOLD], [0, -0.6, C.GOLD], [1.5, 0.2, C.RED], [1.5, -0.4, C.RED]]) dab(L, col, 11.2 + dx, 9.6 + dy, 0.85, 0.65);
    glass(L, 4.4, 10.2);
  } else if (theme.motif === 'key') {
    L.rect(tint(C.VOID, 0.3), 4.5, 4.9, 7.8, 5.6);
    L.rect(C.WOOD_D, 4, 4.4, 8, 5.6);
    L.rect(C.PLASTER_L, 4.5, 4.9, 3.4, 4.6);
    L.rect(C.PLASTER, 8.1, 4.9, 3.4, 4.6);
    for (let row = 0; row < 4; row++) {
      L.rect(tint(C.WOOD_D, 0.6), 4.9, 5.5 + row * 1.1, 2.6, px);
      L.rect(tint(C.WOOD_D, 0.6), 8.5, 5.5 + row * 1.1, 2.6, px);
    }
    dab(L, C.GOLD, 11.6, 10.4, 1.3);
    L.ell(C.GOLD_L, 11.3, 10.1, 0.5);
    L.rect(C.DARK, 11.5, 8.7, px, 0.9);
    L.ell(C.IRON, 5.2, 10.6, 0.8);
    L.line(C.IRON_L, 5.2, 10.6, 7.2, 10.8, px * 1.5);
  } else if (theme.motif === 'ledger') {
    L.rect(tint(C.VOID, 0.28), 3.8, 4.4, 8.6, 7.8);
    L.rect(C.PLASTER, 3.3, 3.9, 8.6, 7.8);
    L.rect(C.BONE, 3.8, 4.4, 7.6, 6.8);
    L.rect(C.WOOD_D, 7.5, 3.9, px * 1.5, 7.8);
    for (let row = 0; row < 5; row++) {
      L.rect(C.STONE, 4.4, 5.2 + row * 1.2, 2.6, px);
      if (row < 4) L.rect(C.STONE, 8.2, 5.2 + row * 1.2, 2.6 - (row === 3 ? 1 : 0), px);
    }
    dab(L, C.DARK, 12, 4.6, 1.1);
    L.ell(C.GLASS_L, 11.7, 4.3, 0.35);
    L.line(C.BONE, 11.4, 5.6, 9.2, 9.4, px * 1.5);
    L.rect(C.DARK, 9.1, 9.3, 0.6, 0.6);
  } else if (theme.motif === 'quilt') {
    L.ell(edge(C.PLASTER_L), cx, cy, 5.6, 4.4);
    L.ell(C.PLASTER_L, cx, cy, 5.2, 4.1);
    for (let i = 0; i < 5; i++) L.rect(tint(theme.fabric, 0.55), cx - 4.1 + i * 2, cy - 3.2, 0.8, 6.4);
    plate(L, 5.6, 7.8, 1.9);
    plate(L, 10.4, 7.8, 1.9);
    L.ell(C.WOOD, 5.6, 7.8, 0.9, 0.9);
    L.ell(C.ADOBE, 8, 5, 1.6, 1.1);
    L.line(C.ADOBE_L, 7, 4.8, 9, 4.8, px * 1.5);
    L.rect(C.IRON_L, 9.4, 8.5, 1.8, px);
  } else if (theme.motif === 'hearth') {
    L.ell(edge(C.RED_D), cx, cy, 5.2, 4.2);
    L.ell(C.RED_D, cx, cy, 4.8, 3.8);
    for (const o of [-1.6, 0, 1.6]) L.rect(tint(C.BONE, 0.7), cx - 4.4, cy + o - 0.4, 8.8, px * 1.5);
    for (const o of [-2.2, 2.2]) L.rect(tint(C.BONE, 0.7), cx + o - 0.4, cy - 3.4, px * 1.5, 6.8);
    plate(L, 6, 6.6, 1.6);
    plate(L, 10, 8.4, 1.6);
    candle(L, 8.2, 7.4);
    L.ell(C.WOOD_L, 9.8, 5.6, 0.8, 0.8);
  } else if (theme.motif === 'drinks') {
    bottle(L, 6, 6.4, [C.GREEN, C.RED_D, C.BLUE][Math.floor(hh(x, y, 32) * 3)]);
    glass(L, 9.8, 5.8);
    glass(L, 10.4, 9.4);
    glass(L, 5, 10);
    candle(L, 8.2, 8.6);
  } else {
    plate(L, 5.4, 6.4, 1.9);
    L.ell(C.WOOD, 5.4, 6.4, 0.9, 0.9);
    dab(L, C.IRON_L, 10.8, 9.2, 1.4);
    L.ell(C.DARK, 10.8, 9.2, 0.8);
    L.rect(C.WOOD_L, 12.2, 8.7, 1.3, px * 2);
    L.rect(C.STONE_L, 7.6, 9.6, 2, px);
  }
  if (square) {
    L.rect(tone(wood, -0.35), 1.6, 12.3, 12.8, 1.4);
    for (const dx of [2.6, 7.4, 11.4]) L.rect(C.GOLD, dx, 12.8, 1.2, px * 1.5);
    for (const dx of [6.4, 10.4]) L.rect(tone(wood, -0.5), dx, 12.3, px, 1.4);
  }
}

function seat(L, theme, x, y) {
  const wood = theme.wood;
  if (theme.motif === 'cards') {
    L.ell(edge(wood), 8, 8, 4.9, 4.9);
    L.ell(tone(wood, 0.3), 7.9, 7.9, 4.5, 4.5);
    L.ell(wood, 8.1, 8.1, 4.3, 4.3);
    L.ell(edge(theme.fabric), 8, 7.8, 3.8, 3.8);
    L.ell(theme.fabric, 7.8, 7.6, 3.4, 3.4);
    L.ell(tone(theme.fabric, 0.2), 7.2, 6.9, 2, 1.6);
    L.ell(tone(theme.fabric, -0.25), 9, 9, 1.8, 1.4);
    for (let a = 0; a < 6; a++) L.rect(C.GOLD, 8 + Math.cos(a * 1.05) * 3.5 - 0.2, 7.8 + Math.sin(a * 1.05) * 3.5 - 0.2, 0.5, 0.5);
    return;
  }
  if (theme.motif === 'forge' || theme.motif === 'freight') {
    slab(L, 3, 3, 10, 10, C.PLANK, hh(x, y, 41) * 90, 3);
    L.line(C.IRON, 3.6, 3.6, 12.4, 12.4, 1.1);
    L.line(C.IRON, 12.4, 3.6, 3.6, 12.4, 1.1);
    L.line(C.IRON_L, 3.6, 3.3, 12.4, 12.1, px);
    for (const [rx, ry] of [[3.6, 3.6], [12.2, 3.6], [3.6, 12.2], [12.2, 12.2]]) dab(L, C.IRON_L, rx, ry, 0.5);
    return;
  }
  L.rect(tint(C.VOID, 0.3), 3.7, 3.7, 9.6, 10);
  for (const [lx, ly] of [[3.2, 11.8], [11.8, 11.8]]) L.rect(edge(wood), lx, ly, 1.4, 1.8);
  L.rect(edge(wood), 3.2, 3, 9.6, 10);
  L.rect(tone(wood, -0.1), 3.8, 3.5, 8.4, 3);
  L.rect(tone(wood, 0.2), 3.8, 3.5, 8.4, px * 1.5);
  for (let s = 0; s < 4; s++) L.rect(tone(wood, -0.35), 4.8 + s * 2, 4, px * 1.5, 2);
  L.rect(theme.trim, 3.4, 3.2, 9.2, 1.1);
  L.rect(edge(theme.fabric), 3.8, 6.6, 8.4, 6);
  L.rect(theme.fabric, 4.3, 7.1, 7.4, 5);
  L.rect(tone(theme.fabric, 0.22), 4.3, 7.1, 7.4, px * 2);
  L.rect(tone(theme.fabric, 0.12), 4.3, 7.1, px * 2, 5);
  L.rect(tone(theme.fabric, -0.28), 4.3, 12.1 - px * 2, 7.4, px * 2);
  L.rect(tint(theme.trim, 0.8), 4.3, 9.4, 7.4, px);
  for (const sx of [4.6, 11.2]) dab(L, C.GOLD, sx, 3.8, 0.4);
}

function counter(L, theme, x, y) {
  const wood = theme.wood;
  // Note: a bar made of several cells joins them: the slab and the apron run on to the cell edge where a neighbour continues the bar.
  const a = theme.joinW ? 0 : 0.4;
  const b = theme.joinE ? 16 : 15.6;
  const ia = theme.joinW ? 0 : 0.9;
  const ib = theme.joinE ? 16 : 15.1;
  const sa = theme.joinW ? -0.7 : 0.4;
  slab(L, sa, 1.8, (theme.joinE ? 16.7 : 15.6) - sa, 9.8, wood, hh(x, y, 51) * 90, 3);
  L.rect(edge(wood), a, 11.4, b - a, 2.8);
  L.rect(tone(wood, -0.12), ia, 11.6, ib - ia, 2.2);
  for (let i = 0; i < 4; i++) {
    L.rect(tone(wood, 0.05), 1.3 + i * 3.5, 11.9, 3, 1.7);
    L.rect(tone(wood, -0.3), 1.3 + i * 3.5, 11.9, 3, px);
  }
  L.rect(theme.trim, ia, 11.2, ib - ia, 0.9);
  L.rect(tone(theme.trim, 0.3), ia, 11.2, ib - ia, px);
  L.rect(tint(C.VOID, 0.4), ia, 14, ib - ia, px * 2);
  if (theme.rail) {
    // Note: a brass foot rail along the customers' side of the bar.
    L.rect(tint(C.VOID, 0.35), 0, 15, 16, 0.9);
    L.rect(C.GOLD, 0, 14.5, 16, 0.9);
    L.rect(C.GOLD_L, 0, 14.5, 16, px);
  }
  if (theme.motif === 'chapel') {
    L.rect(tint(C.VOID, 0.25), 1.8, 2.6, 12.8, 7);
    L.rect(C.BONE, 1.4, 2.2, 12.8, 7);
    L.rect(tone(C.BONE, -0.14), 1.4, 8.6, 12.8, 0.6);
    for (const cx of [3, 13]) L.rect(theme.trim, cx - 0.5, 2.6, 1, 6);
    L.rect(C.GOLD, 7.3, 2.8, 1.4, 5.8);
    L.rect(C.GOLD, 5.4, 4.2, 5.2, 1.3);
    L.rect(C.GOLD_L, 7.3, 2.8, px * 1.5, 5.8);
    for (const cx of [3.6, 12.4]) candle(L, cx, 4.2);
  } else if (theme.motif === 'forge') {
    L.poly(tint(C.VOID, 0.3), [[3.6, 5.6], [8.6, 4.4], [12.6, 5.6], [13.8, 8.6], [10.6, 9.2], [9.6, 10.6], [5.6, 10.6], [6, 8.4], [3.6, 7.6]]);
    L.poly(C.IRON, [[3, 5], [8, 3.8], [12, 5], [13, 8], [10, 8.6], [9, 10], [5, 10], [5.4, 7.8], [3, 7]]);
    L.poly(C.IRON_L, [[3.4, 5.2], [8, 4.2], [11.6, 5.2], [11.4, 6], [3.8, 6.2]]);
    L.line(C.DARK, 4, 8.2, 12.2, 8.2, px);
    L.line(C.WOOD_L, 2, 10.8, 8, 3.2, 1.3);
    L.rect(C.IRON_L, 7.4, 2.6, 2.2, 1.6);
  } else if (theme.bar) {
    // Note: the top of a bar is mostly clear: a few glasses, now and then a bottle, a rag.
    const k = hh(x, y, 53);
    if (k < 0.35) bottle(L, 4 + hh(x, y, 54) * 8, 6.4, [C.GREEN, C.RED_D, C.BLUE][Math.floor(hh(x, y, 55) * 3)]);
    glass(L, 2.6 + hh(x, y, 56) * 3, 7.6);
    if (k > 0.45) glass(L, 10 + hh(x, y, 57) * 3, 6.8);
    if (k > 0.8) {
      L.rect(tint(C.VOID, 0.25), 6.4, 4.4, 4, 2);
      L.rect(C.PLASTER_L, 6, 4, 4, 2);
      L.rect(tone(C.PLASTER_L, -0.2), 6, 5.4, 4, 0.6);
    }
  } else if (theme.motif === 'cards' || theme.motif === 'goods') {
    L.rect(tint(C.VOID, 0.22), 1.4, 8.4, 13.6, 1);
    for (const [cx, col] of [[3.4, C.GREEN], [6.2, C.RED_D], [9, C.BLUE], [11.8, C.GREEN_D]]) bottle(L, cx, 6.2, col);
    glass(L, 13.8, 7.4);
    glass(L, 1.8, 7.6);
  } else if (theme.motif === 'coin') {
    L.rect(tint(C.VOID, 0.25), 2.4, 5.2, 5.6, 4.2);
    L.rect(C.PLASTER_L, 2, 4.8, 5.6, 4.2);
    L.rect(tone(C.PLASTER_L, -0.2), 2, 8.4, 5.6, 0.6);
    for (let r = 0; r < 3; r++) L.rect(C.STONE, 2.6, 5.6 + r * 1, 3.6, px);
    for (const [cx, cy, n] of [[10.8, 5, 3], [12.4, 7.4, 2], [10.2, 8.6, 4]]) for (let i = 0; i < n; i++) dab(L, i % 2 ? C.GOLD_L : C.GOLD, cx, cy - i * 0.55, 1.1, 0.75);
    L.line(C.IRON_L, 8.6, 3.4, 8.6, 6.4, px * 1.5);
    L.ell(C.IRON_L, 8.6, 3.2, 0.7, 0.5);
  } else {
    L.rect(tint(C.VOID, 0.25), 2.4, 4.4, 4.4, 3);
    L.rect(C.PLASTER, 2, 4, 4.4, 3);
    L.rect(C.STONE, 2.6, 4.8, 3, px);
    dab(L, C.IRON, 9.6, 5.6, 1.6);
    L.ell(C.IRON_L, 9.2, 5.2, 0.7);
    L.line(C.IRON, 9.6, 5.6, 12.4, 8, 0.9);
    dab(L, C.PLASTER_L, 12.2, 8.6, 1.4);
  }
}

function bed(L, theme, x, y) {
  const wood = theme.wood;
  const stripe = tone(theme.fabric, -0.28);
  L.rect(edge(wood), 0.8, 0.8, 14.4, 14.4);
  L.rect(tone(wood, -0.05), 1.4, 1.4, 13.2, 13.2);
  L.rect(edge(wood), 0.8, 0.8, 14.4, 2.6);
  L.rect(tone(wood, 0.04), 1.3, 1.3, 13.4, 1.8);
  L.rect(tone(wood, 0.32), 1.3, 1.3, 13.4, px * 1.5);
  for (const fx of [1.3, 13.1]) {
    dab(L, tone(wood, 0.1), fx + 0.8, 1.9, 0.9);
    L.rect(tone(wood, 0.35), fx + 0.4, 1.4, px * 2, px * 2);
  }
  L.rect(C.PLASTER_L, 2, 3.4, 12, 9.8);
  L.rect(tone(C.PLASTER_L, -0.12), 2, 3.4, px * 2, 9.8);
  L.rect(tint(C.VOID, 0.22), 3.6, 4.2, 8.8, 3.2);
  L.rect(edge(C.BONE), 3.2, 3.6, 8.8, 3.2);
  L.rect(C.BONE, 3.6, 4, 8, 2.4);
  L.rect(tone(C.BONE, 0.14), 3.6, 4, 8, px * 1.5);
  L.rect(tone(C.BONE, -0.18), 3.6, 6.2, 8, px * 1.5);
  for (const [dx, dy] of [[3.2, 3.6], [11.6, 3.6], [3.2, 6.4], [11.6, 6.4]]) L.rect(tone(C.BONE, -0.1), dx, dy, 0.5, 0.5);
  L.line(tone(C.BONE, -0.25), 5.2, 5.6, 7.4, 4.4, px);
  L.line(tone(C.BONE, -0.25), 8.2, 5.8, 10.4, 4.6, px);
  L.rect(theme.fabric, 2, 7.6, 12, 5.8);
  L.rect(tone(theme.fabric, 0.2), 2, 7.6, 12, 1.1);
  L.rect(C.PLASTER_L, 2, 7.2, 12, 0.7);
  L.rect(tone(theme.fabric, -0.32), 2, 8.7, 12, px);
  for (let s = 0; s < 4; s++) L.rect(stripe, 2.6 + s * 3.2, 9.6, 1.1, 3.8);
  L.poly(tint(C.VOID, 0.16), [[2, 9], [8.6, 9.4], [5, 11.6], [2, 12.8]]);
  L.poly(tone(theme.fabric, 0.16), [[9.4, 9.2], [14, 9], [14, 10], [11.2, 10.6]]);
  for (let s = 0; s < 3; s++) L.rect(C.GOLD, 3.6 + s * 3.4, 12.2, px * 2, px * 2);
  L.rect(edge(wood), 0.8, 13.6, 14.4, 1.6);
  L.rect(tone(wood, 0.04), 1.3, 13.8, 13.4, 1);
  L.rect(tone(wood, 0.3), 1.3, 13.8, 13.4, px);
}

function sofa(L, theme, x, y) {
  const wood = theme.wood;
  if (theme.motif === 'chapel') {
    L.rect(edge(wood), 0.6, 1.8, 14.8, 11.8);
    L.rect(tone(wood, -0.08), 1.2, 2.4, 13.6, 10.6);
    L.rect(tone(wood, 0.28), 1.2, 2.4, 13.6, px * 1.5);
    for (const sy of [4.2, 8.4]) {
      L.rect(tone(wood, -0.35), 1.8, sy, 12.4, 2.4);
      L.rect(tone(wood, 0.12), 1.8, sy + px * 2, 12.4, 1.4);
      L.rect(tone(wood, 0.3), 1.8, sy + px * 2, 12.4, px);
    }
    L.rect(C.GOLD, 7.4, 4.4, 1.2, 5.2);
    L.rect(C.GOLD, 5.8, 6, 4.4, 1);
    L.rect(tint(C.VOID, 0.3), 1.8, 12.2, 12.4, px * 2);
    for (const cx of [3.4, 12.2]) L.rect(C.RED_D, cx, 9, 1.4, 1.6);
    return;
  }
  const f = theme.fabric;
  L.rect(tint(C.VOID, 0.3), 1, 2.6, 14.4, 12.6);
  L.rect(edge(f), 0.6, 1.8, 14.8, 12.8);
  L.rect(tone(f, -0.18), 1.2, 2.2, 13.6, 3.4);
  for (let b = 0; b < 5; b++) {
    L.ell(tone(f, -0.42), 2.6 + b * 2.7, 3.8, 0.5);
    L.ell(tone(f, 0.14), 2.5 + b * 2.7, 3.6, 0.3);
  }
  L.rect(tone(f, 0.2), 1.2, 2.2, 13.6, px * 1.5);
  for (const cx of [1.2, 8]) {
    L.rect(edge(f), cx, 5.4, 6.8, 8.2);
    L.rect(f, cx + 0.5, 5.9, 5.8, 7.2);
    L.rect(tone(f, 0.22), cx + 0.5, 5.9, 5.8, px * 2);
    L.rect(tone(f, 0.12), cx + 0.5, 5.9, px * 2, 7.2);
    L.rect(tone(f, -0.28), cx + 0.5, 13.1 - px * 2, 5.8, px * 2);
    L.rect(tint(theme.trim, 0.8), cx + 0.5, 7.2, 5.8, px);
    dab(L, tone(f, -0.4), cx + 3.4, 9.6, 0.5);
  }
  for (const ax of [0.6, 13.6]) {
    L.rect(edge(f), ax, 4.6, 1.8, 9.4);
    L.rect(tone(f, 0.08), ax + 0.4, 5, 1, 8.6);
    L.rect(tone(f, 0.24), ax + 0.4, 5, 1, px * 1.5);
  }
  for (const fx of [0.8, 13.8]) L.rect(edge(wood), fx, 14.2, 1.4, 1);
}

function cabinet(L, theme, x, y, wardrobe) {
  const wood = theme.wood;
  L.rect(edge(wood), 0.8, 0.6, 14.4, 14.2);
  L.rect(tone(wood, -0.06), 1.4, 1.2, 13.2, 13);
  L.rect(tone(wood, 0.32), 1.4, 1.2, 13.2, px * 2);
  L.rect(tone(wood, 0.2), 1.4, 1.2, px * 2, 13);
  L.rect(tone(wood, -0.3), 1.4, 13.6, 13.2, px * 2);
  L.rect(tone(wood, -0.2), 14.6 - px * 2, 1.2, px * 2, 13);
  if (wardrobe) {
    for (const lx of [0, 5.7]) {
      L.rect(edge(wood), 2 + lx, 2.4, 5.4, 10.6);
      L.rect(tone(wood, 0.05 + lx * 0.004), 2.5 + lx, 2.9, 4.4, 9.6);
      L.rect(tone(wood, 0.2), 2.5 + lx, 2.9, 4.4, px);
      L.rect(tone(wood, -0.18), 3.1 + lx, 4, 3.2, 7.4);
      L.rect(tone(wood, 0.1), 3.4 + lx, 4.3, 2.6, 6.8);
      for (let g = 0; g < 3; g++) L.rect(tone(wood, -0.08), 3.6 + lx + g * 0.8, 4.6 + hh(x, g + lx, 61) * 1.6, px, 4.4);
    }
    L.rect(edge(wood), 7.4, 2.4, 1.2, 10.6);
    for (const kx of [6.5, 9.5]) dab(L, theme.trim, kx, 7.8, 0.7);
    L.rect(C.GOLD_L, 6.3, 7.4, px, px);
    L.rect(C.GOLD_L, 9.3, 7.4, px, px);
    for (const hy of [3.4, 11.4]) L.rect(C.IRON, 1.9, hy, 0.8, 1.4);
    return;
  }
  if (theme.backbar === 'mirror') {
    // Note: the long gilt mirror behind a bar, with a slanting glint.
    L.rect(edge(C.GOLD), 1.6, 1.6, 12.8, 11.8);
    L.rect(C.GOLD, 2, 2, 12, 11);
    L.rect(C.DARK, 2.7, 2.7, 10.6, 9.6);
    L.rect(tone(C.GLASS, -0.3), 3, 3, 10, 9);
    L.rect(tone(C.GLASS, -0.12), 3, 3, 10, 3.2);
    L.line(C.GLASS_L, 5.2, 11.2, 8.4, 3.6, 1.1);
    L.line(tint(C.GLASS_L, 0.6), 8.6, 11.2, 10.6, 6.4, px * 2);
    L.rect(C.GOLD_L, 2, 2, 12, px);
    return;
  }
  for (let row = 0; row < 2; row++) {
    const sy = 2.2 + row * 5.4;
    L.rect(C.DARK, 2, sy, 12, 4.4);
    L.rect(tint(C.VOID, 0.55), 2, sy, 12, 1.1);
    L.rect(tone(wood, -0.2), 2, sy + 4.4, 12, 0.8);
    L.rect(tone(wood, 0.2), 2, sy + 4.4, 12, px);
    if (theme.backbar) {
      // Note: bottles and glasses stand along the back bar shelves.
      const cols = [C.GREEN, C.RED_D, C.BLUE, C.GREEN_D, C.WOOD_L];
      for (let c = 0; c < 4; c++) {
        const k = hh(x * 3 + c, y + row, 67);
        if (k < 0.16) glass(L, 3.4 + c * 3, sy + 3.1);
        else bottle(L, 3.4 + c * 3, sy + 2.5, cols[Math.floor(hh(x + c, y * 2 + row, 68) * cols.length)]);
      }
    } else if (theme.motif === 'forge') {
      for (const cx of [4, 8, 12]) {
        dab(L, C.IRON_L, cx, sy + 2.4, 1.1);
        L.ell(C.DARK, cx, sy + 2.4, 0.6);
        L.rect(C.IRON, cx - 0.35, sy + 0.9, 0.7, 1.2);
      }
    } else if (theme.motif === 'freight') {
      for (const cx of [4, 7.8, 11.6]) {
        L.rect(tint(C.VOID, 0.3), cx - 1.1, sy + 1.3, 2.8, 2.6);
        L.rect(C.PLASTER, cx - 1.4, sy + 1, 2.8, 2.6);
        L.rect(tone(C.PLASTER, -0.2), cx - 1.4, sy + 3.2, 2.8, 0.4);
        L.rect(C.WOOD_D, cx - 0.8, sy + 1.8, 1.6, px);
      }
    } else {
      let cx = 2.5;
      for (let c = 0; c < 6 && cx < 13; c++) {
        const k = hh(x + c, y + row, 63);
        const w = 1.2 + hh(x + c, y + row, 64) * 1.2;
        const col = [theme.fabric, C.BONE, theme.trim, C.GREEN, C.RED_D, C.BLUE][Math.floor(k * 6)];
        if (theme.motif === 'goods' && k > 0.55) {
          L.rect(tint(C.VOID, 0.3), cx + 0.3, sy + 1.5, w, 2.6);
          L.rect(edge(col), cx, sy + 1.1, w, 3);
          L.rect(col, cx + 0.3, sy + 1.4, w - 0.6, 2.4);
          L.rect(tone(col, 0.4), cx + 0.3, sy + 1.4, px, 2.4);
        } else {
          L.rect(edge(col), cx, sy + 0.9, w, 3.4);
          L.rect(col, cx + 0.3, sy + 1.2, w - 0.6, 2.8);
          L.rect(tone(col, 0.35), cx + 0.3, sy + 1.2, px, 2.8);
          L.rect(tone(col, -0.3), cx + w - 0.3 - px, sy + 1.2, px, 2.8);
          L.rect(tint(C.GOLD, 0.8), cx + 0.3, sy + 1.9, w - 0.6, px);
        }
        cx += w + 0.35;
      }
    }
  }
}

function barrel(L, theme, x, y) {
  const wood = theme.wood;
  L.ell(edge(wood), 8, 8, 6.7, 6.7);
  L.ell(tone(C.IRON, -0.15), 8, 8, 6.2, 6.2);
  L.ell(C.IRON_L, 7.6, 7.6, 5.9, 5.9);
  L.ell(tone(wood, -0.3), 8, 8, 5.3, 5.3);
  L.ell(wood, 7.8, 7.8, 4.9, 4.9);
  L.ell(tone(wood, 0.14), 7.2, 7.2, 3.4, 3.4);
  for (const s of [-2.4, -0.8, 0.8, 2.4]) {
    const half = Math.sqrt(Math.max(0, 4.8 * 4.8 - s * s));
    L.rect(tone(wood, -0.3), 8 + s, 8 - half, px, half * 2);
    L.rect(tone(wood, 0.16), 8 + s + px, 8 - half + 0.4, px, half * 2 - 0.8);
  }
  L.ell(C.DARK, 9.6, 6.4, 0.9, 0.9);
  L.ell(tone(wood, -0.2), 9.6, 6.4, 0.55, 0.55);
  for (const a of [0.4, 1.7, 3.1, 4.5, 5.6]) dab(L, C.IRON_L, 8 + Math.cos(a) * 5.7, 8 + Math.sin(a) * 5.7, 0.35);
  L.rect(tint(theme.trim, 0.7), 5.4 + hh(x, y, 66) * 1.4, 9.2, 2.4, px * 1.5);
  L.rect(tint(C.PLANK_L, 0.6), 4.2, 5, 1.6, px);
}

function crate(L, theme, x, y) {
  const wood = theme.wood;
  L.rect(tint(C.VOID, 0.12), 1.8, 2.6, 13.6, 12.8);
  slab(L, 1, 1.4, 14, 13.4, wood, hh(x, y, 71) * 90, 4);
  const brace = tone(wood, -0.1);
  for (const [a, b, c, d] of [[2.4, 2.8, 13.6, 13.2], [13.6, 2.8, 2.4, 13.2]]) {
    L.line(edge(wood), a, b, c, d, 2);
    L.line(brace, a, b, c, d, 1.4);
    L.line(tone(wood, 0.25), a, b - 0.5, c, d - 0.5, px);
  }
  L.rect(tint(theme.trim, 0.75), 1.6, 1.9, 12.8, px * 2);
  for (const [nx, ny] of [[2, 2], [13.6, 2], [2, 13.2], [13.6, 13.2], [7.8, 7.8]]) {
    L.rect(C.DARK, nx, ny, 0.7, 0.7);
    L.rect(C.IRON_L, nx, ny, 0.5, 0.4);
  }
  if (theme.motif === 'freight' || theme.motif === 'goods') {
    L.rect(tint(C.VOID, 0.25), 5.3, 6.2, 6.2, 3.8);
    L.rect(C.PLASTER_L, 4.9, 5.8, 6.2, 3.8);
    L.rect(tone(C.PLASTER_L, -0.15), 4.9, 9.2, 6.2, 0.4);
    L.rect(theme.trim, 5.5, 6.5, 1.1, 2);
    L.rect(theme.trim, 7.1, 6.5, 2.6, px * 2);
    L.rect(theme.trim, 7.1, 7.6, 2.6, px * 2);
  }
}

function stove(L, theme, x, y) {
  L.rect(edge(C.IRON), 1, 1.2, 14, 13.4);
  L.rect(C.IRON, 1.7, 1.9, 12.6, 12);
  L.rect(C.IRON_L, 1.7, 1.9, 12.6, px * 2);
  L.rect(C.IRON_L, 1.7, 1.9, px * 2, 12);
  L.rect(tone(C.IRON, -0.3), 1.7, 13.9 - px * 2, 12.6, px * 2);
  L.rect(tone(C.IRON, -0.2), 14.3 - px * 2, 1.9, px * 2, 12);
  if (theme.motif === 'forge') {
    L.rect(tone(C.IRON, -0.45), 2.6, 2.8, 10.8, 7.6);
    L.rect(tone(C.IRON, -0.15), 2.6, 2.8, 10.8, px * 1.5);
    L.ell(C.DARK, 8, 6.6, 4.8, 3.2);
    L.ell(C.RED_D, 8, 6.6, 4.1, 2.6);
    L.ell(C.RED, 7.6, 6.4, 3.1, 1.8);
    L.ell(C.GOLD, 7.2, 6.2, 1.8, 1.1);
    L.ell(C.GOLD_L, 6.9, 6, 0.7, 0.5);
    for (const [cx, cy] of [[5, 7.8], [10.6, 5.2], [11.2, 7.6]]) dab(L, C.RED_D, cx, cy, 0.5);
    L.line(C.IRON_L, 3, 11.8, 12.6, 11.8, 1.1);
    for (const hx of [4.6, 11.4]) L.rect(C.GOLD, hx, 12.4, 1.2, px * 2);
  } else {
    L.ell(C.DARK, 5.2, 5.6, 3.3, 3.3);
    L.ell(C.IRON_L, 5, 5.4, 2.9, 2.9);
    L.ell(C.IRON, 5.2, 5.6, 2.4, 2.4);
    L.ell(tone(C.IRON, -0.25), 5.2, 5.6, 1.4, 1.4);
    L.rect(C.IRON_L, 4.4, 5.4, 1.6, px);
    L.rect(C.IRON_L, 5.1, 4.7, px, 1.6);
    L.ell(C.DARK, 11.2, 6.2, 3.1, 3.1);
    L.ell(C.PLASTER, 11, 6, 2.6, 2.6);
    L.ell(tone(C.PLASTER, -0.2), 11.4, 6.4, 2.1, 2.1);
    L.ell(tone(C.PLASTER, 0.2), 10.6, 5.6, 1.3, 1);
    dab(L, C.IRON, 11, 5.8, 0.7);
    L.line(C.IRON, 12.6, 7, 14.2, 8.6, 1);
    L.line(C.IRON_L, 8.6, 4.2, 12, 3.6, px * 1.5);
    L.rect(tone(C.IRON, -0.2), 2.6, 9.8, 10.8, 3.8);
    L.rect(C.IRON_L, 2.6, 9.8, 10.8, px);
    for (const sx of [6.2, 9.8]) L.rect(tone(C.IRON, -0.45), sx, 9.9, px, 3.6);
    for (const hx of [4, 8, 11.6]) L.rect(C.GOLD, hx, 11.4, 1.2, px * 1.5);
  }
  dab(L, C.IRON, 13.2, 3, 1.4);
  L.ell(C.IRON_L, 13, 2.8, 0.5);
  for (const [rx, ry] of [[2.2, 2.4], [13, 13], [2.2, 13]]) L.rect(C.IRON_L, rx, ry, px * 2, px * 2);
}

// Note: a billiard table over three by two cells (theme.part {i, j} is this cell's place in it): dark rails with sights, green cloth, six pockets, a racked set and a cue.
function billiardTop(L, theme, x, y) {
  const { i = 0, j = 0 } = theme.part || {};
  const wx = (v) => v - i * 16;
  const wy = (v) => v - j * 16;
  const wood = theme.wood;
  const cloth = C.GREEN;
  L.rect(tint(C.VOID, 0.34), wx(1.8), wy(3.6), 46, 29);
  L.rect(edge(wood), wx(0.6), wy(1.2), 46.8, 29.6);
  L.rect(tone(wood, -0.12), wx(1.3), wy(1.9), 45.4, 28.2);
  L.rect(tone(wood, 0.18), wx(1.3), wy(1.9), 45.4, px * 1.5);
  L.rect(tone(wood, 0.1), wx(1.3), wy(1.9), px * 1.5, 28.2);
  L.rect(tone(wood, -0.44), wx(1.3), wy(30.1 - px * 1.5), 45.4, px * 1.5);
  L.rect(tone(wood, -0.38), wx(46.7 - px * 1.5), wy(1.9), px * 1.5, 28.2);
  L.rect(tone(cloth, -0.5), wx(4.2), wy(4.8), 39.6, 22.4);
  L.rect(cloth, wx(5.2), wy(5.8), 37.6, 20.4);
  L.rect(tone(cloth, 0.14), wx(5.2), wy(5.8), 37.6, px * 2);
  L.rect(tone(cloth, -0.22), wx(5.2), wy(26.2 - px * 2), 37.6, px * 2);
  for (let r = 0; r < 5; r++) L.rect(tint(C.VOID, 0.05), wx(5.2), wy(7.4 + r * 4), 37.6, px);
  for (const [cx, cy, r] of [[5.4, 6.4, 2.5], [42.6, 6.4, 2.5], [5.4, 25.6, 2.5], [42.6, 25.6, 2.5], [24, 5, 2.2], [24, 27, 2.2]]) {
    L.ell(tone(C.WOOD_D, -0.45), wx(cx), wy(cy), r + 0.9);
    L.ell(C.DARK, wx(cx), wy(cy), r);
    L.ell(tone(C.DARK, 0.1), wx(cx) - 0.3, wy(cy) - 0.3, r * 0.5);
  }
  for (const sx of [10.5, 15.5, 19.5, 28.5, 32.5, 37.5]) for (const sy of [3.3, 28.7]) L.rect(C.BONE, wx(sx), wy(sy), px * 1.5, px * 1.5);
  for (const sy of [10.5, 16, 21.5]) for (const sx of [2.6, 45.4]) L.rect(C.BONE, wx(sx), wy(sy), px * 1.5, px * 1.5);
  // Note: the racked balls in a pyramid, a cue ball near the other end and a cue lying on the cloth.
  const ball = (cx, cy, col) => {
    dab(L, col, wx(cx), wy(cy), 1.15);
    L.rect(tint(C.BONE, 0.7), wx(cx) - 0.55, wy(cy) - 0.6, px * 1.2, px * 1.2);
  };
  [[31, 16, C.RED], [33, 14.8, C.GOLD], [33, 17.2, C.BLUE], [35, 13.6, C.RED_L], [35, 16, C.GREEN_D], [35, 18.4, C.RED]].forEach(([cx, cy, col]) => ball(cx, cy, col));
  ball(13.5, 15.8, C.BONE);
  ball(22.4, 20.2, C.GOLD);
  L.line(tint(C.VOID, 0.3), wx(17.4), wy(8.4), wx(36.2), wy(8.8), 0.9);
  L.line(C.WOOD_L, wx(17), wy(7.8), wx(36), wy(8.2), 0.9);
  L.line(C.DARK, wx(33), wy(8.1), wx(36), wy(8.2), 1);
  L.rect(C.BLUE, wx(21), wy(2.3), 1.8, 1.2);
  L.rect(tone(C.BLUE, 0.3), wx(21), wy(2.3), 1.8, px);
}

// Note: a flight of stairs along a side wall over three cells (theme.part {j}, theme.side 'w' or 'e'); it climbs north into a dark gallery.
function stairsTop(L, theme) {
  const j = theme.part ? theme.part.j : 0;
  const wy = (v) => v - j * 16;
  const flip = theme.side === 'e';
  const fx = (a, w = 0) => (flip ? 16 - a - w : a);
  const wood = theme.wood;
  L.rect(edge(wood), fx(0.6, 14.6), wy(0), 14.6, 48);
  for (let k = 0; k < 16; k++) {
    const top = k * 3;
    L.rect(tone(wood, 0.16 - (k / 15) * 0.3), fx(1.4, 11.6), wy(top), 11.6, 2.1);
    L.rect(tint(C.BONE, 0.24), fx(1.4, 11.6), wy(top), 11.6, px);
    L.rect(tint(C.VOID, 0.55), fx(1.4, 11.6), wy(top + 2.1), 11.6, 0.9);
    if (k % 3 === 1) L.rect(tint(C.WOOD_D, 0.4), fx(3 + (k % 5), 4), wy(top + 1), 4, px);
  }
  L.rect(tint(C.DARK, 0.5), fx(0.6, 1), wy(0), 1, 48);
  // Note: the handrail on the room side with a post at every fourth tread, and a newel post with a brass cap at the foot.
  L.rect(edge(wood), fx(12.8, 2.2), wy(0), 2.2, 48);
  L.rect(tone(wood, 0.1), fx(13.2, 1.4), wy(0), 1.4, 48);
  L.rect(tint(C.BONE, 0.3), fx(13.2, px * 1.5), wy(0), px * 1.5, 48);
  for (const at of [0, 12, 24, 36]) {
    L.rect(edge(wood), fx(12.4, 3), wy(at + 1), 3, 2.6);
    L.rect(tone(wood, 0.24), fx(12.8, 2.2), wy(at + 1.3), 2.2, 1.8);
  }
  if (j === 2) {
    L.rect(tint(C.VOID, 0.3), fx(12, 4.6), wy(42.2), 4.6, 5.2);
    L.rect(edge(wood), fx(11.4, 4.2), wy(41.4), 4.2, 5.2);
    L.rect(tone(wood, 0.12), fx(11.8, 3.4), wy(41.8), 3.4, 4.4);
    L.ell(C.GOLD_L, fx(13.5), wy(41.4), 1.3, 1.1);
    L.ell(C.GOLD, fx(13.5), wy(41.6), 0.9, 0.7);
  }
  if (j === 0) {
    L.rect(tint(C.DARK, 0.82), fx(0.6, 14.6), wy(0), 14.6, 6.4);
    L.rect(tint(C.VOID, 0.4), fx(0.6, 14.6), wy(6.4), 14.6, 2.4);
    L.rect(tone(wood, -0.4), fx(0.2, 15.4), wy(6.2), 15.4, 1.5);
    L.rect(tint(C.BONE, 0.2), fx(0.2, 15.4), wy(6.2), 15.4, px);
    for (const bx of [2.4, 11.6]) L.rect(tone(wood, -0.3), fx(bx, 1.4), wy(6.8), 1.4, 2.2);
  }
}

// Note: two kegs on their sides on a trestle, hooped and tapped, with a drip tray under the spigots.
function kegTop(L, theme, x, y) {
  const wood = theme.wood;
  L.rect(tint(C.VOID, 0.34), 1.4, 3.6, 14, 12.4);
  for (const ky of [2, 8.6]) {
    L.rect(edge(wood), 1.4, ky, 12.8, 5.8);
    L.ell(edge(wood), 1.9, ky + 2.9, 1, 2.9);
    L.ell(edge(wood), 13.7, ky + 2.9, 1, 2.9);
    L.rect(tone(wood, -0.05 + (hh(x, y + ky, 77) - 0.5) * 0.14), 2, ky + 0.5, 11.6, 4.8);
    L.rect(tone(wood, 0.26), 2, ky + 0.5, 11.6, px * 1.5);
    L.rect(tone(wood, -0.3), 2, ky + 4.8 - px * 1.5, 11.6, px * 1.5);
    for (const sy of [1.6, 3, 4.2]) L.rect(tone(wood, -0.22), 2.2, ky + sy, 11, px);
    for (const hx of [3.4, 7.6, 11.8]) {
      L.rect(tone(C.IRON, -0.15), hx, ky + 0.4, 1.3, 5);
      L.rect(C.IRON_L, hx, ky + 0.4, px * 1.2, 5);
    }
    L.ell(C.DARK, 7, ky + 2.2, 0.7, 0.7);
    L.rect(C.GOLD, 13.6, ky + 2.3, 1.8, 1.1);
    L.rect(C.GOLD_L, 13.6, ky + 2.3, 1.8, px);
    L.rect(C.GOLD, 14.7, ky + 3.1, 0.7, 1.4);
  }
  L.rect(tone(C.IRON, -0.2), 14.2, 12.2, 1.6, 3.2);
  L.rect(tint(C.GLASS_L, 0.5), 14.4, 12.6, 1.2, 2.4);
}

// Note: a wood box of split logs for the stove, with the cut ends toward the viewer and a hatchet on top.
function woodboxTop(L, theme, x, y) {
  const wood = theme.wood;
  L.rect(tint(C.VOID, 0.32), 2, 3, 13.4, 12.4);
  L.rect(edge(wood), 1.2, 1.6, 13.4, 12.8);
  L.rect(C.DARK, 2, 2.4, 11.8, 11.2);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const lx = 3.2 + c * 2.2 + (r % 2) * 0.9;
      const ly = 3.6 + r * 2.3;
      const bark = tone(C.WOOD_D, 0.12 + hh(x + c, y + r, 81) * 0.22);
      L.ell(edge(C.WOOD_D), lx, ly, 1.25, 1.2);
      L.ell(bark, lx, ly, 1, 0.95);
      L.ell(tone(C.PLANK_L, hh(x + c, y + r, 82) * 0.2), lx - 0.1, ly - 0.1, 0.55, 0.5);
    }
  }
  L.rect(tone(wood, 0.24), 1.2, 1.6, 13.4, px * 1.5);
  L.rect(tone(wood, -0.34), 1.2, 14.4 - px * 1.5, 13.4, px * 1.5);
  L.line(C.WOOD_L, 5.4, 11.4, 11.6, 7.2, 0.9);
  L.rect(C.IRON_L, 10.8, 6.2, 2.6, 2);
  L.rect(C.IRON, 10.8, 8, 2.6, px * 1.5);
}

// Note: a plank bench along a wall, a little worn at the middle, on two trestle feet.
function benchTop(L, theme, x, y) {
  const wood = theme.wood;
  L.rect(tint(C.VOID, 0.32), 1.8, 5.4, 14, 7.6);
  L.rect(edge(wood), 1, 4, 14, 7.6);
  L.rect(tone(wood, 0.04 + (hh(x, y, 83) - 0.5) * 0.12), 1.6, 4.6, 12.8, 6.4);
  L.rect(tone(wood, 0.3), 1.6, 4.6, 12.8, px * 1.5);
  L.rect(tone(wood, -0.3), 1.6, 7.7, 12.8, px);
  L.rect(tone(wood, -0.34), 1.6, 11 - px * 1.5, 12.8, px * 1.5);
  for (const bx of [3.4, 11.6]) L.rect(tone(wood, -0.4), bx, 11.4, 1.4, 1.8);
  L.rect(C.IRON, 2.4, 5.2, px * 1.5, px * 1.5);
  L.rect(C.IRON, 13, 5.2, px * 1.5, px * 1.5);
  L.ell(tint(C.VOID, 0.14), 8, 7.8, 2.6, 1);
}

// Note: a head-high barrel used as a standing table, with bottles, glasses and a candle on the lid.
function standTop(L, theme, x, y) {
  drop(L, 13, 13);
  barrel(L, theme, x, y);
  bottle(L, 6, 6.6, [C.GREEN, C.RED_D, C.BLUE][Math.floor(hh(x, y, 33) * 3)]);
  glass(L, 10, 6.2);
  glass(L, 9.4, 10);
  candle(L, 6.4, 10);
}

const PIECES = { billiard: billiardTop, stairs: stairsTop, keg: kegTop, woodbox: woodboxTop, bench: benchTop, stand: standTop };

// Note: base is the tile's art base; x and y only seed the grain and the wear, so equal pieces differ a little.
export function paintPiece(L, theme, base, x, y) {
  if (theme.variant && PIECES[theme.variant]) return PIECES[theme.variant](L, theme, x, y);
  if (base === T.TABLE || base === T.DESK) {
    drop(L, 14, 12);
    tableTop(L, theme, x, y, base === T.DESK);
  } else if (base === T.CHAIR) {
    drop(L, 9, 8);
    seat(L, theme, x, y);
  } else if (base === T.COUNTER) {
    drop(L, 15, 11);
    counter(L, theme, x, y);
  } else if (base === T.BED) {
    drop(L, 14, 12);
    bed(L, theme, x, y);
  } else if (base === T.SOFA) {
    drop(L, 14, 12);
    sofa(L, theme, x, y);
  } else if (base === T.SHELF || base === T.WARDROBE) {
    drop(L, 14, 11);
    cabinet(L, theme, x, y, base === T.WARDROBE);
  } else if (base === T.BARREL) {
    drop(L, 13, 13);
    barrel(L, theme, x, y);
  } else if (base === T.CRATE) {
    drop(L, 13, 12);
    crate(L, theme, x, y);
  } else if (base === T.STOVE) {
    drop(L, 13, 12);
    stove(L, theme, x, y);
  }
}
