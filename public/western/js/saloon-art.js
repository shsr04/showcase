// Note: small period pieces for the playable saloon: floor litter, wall dressing and window shafts; each is opt-in through a per-cell patch, so no other building changes.

import { SCALE } from './config.js';
import { C } from './palette.js';
import { pen, hash as hh, tint, tone } from './draw.js';

const px = pen(SCALE).px;

// Note: a brass cuspidor seen from above: a lip, a dark mouth and a brown ring of tobacco.
function spittoon(L, x, y) {
  L.ell(tint(C.VOID, 0.36), x + 0.7, y + 0.8, 2.9, 2.6);
  L.ell(tone(C.GOLD, -0.5), x, y, 2.7, 2.7);
  L.ell(C.GOLD, x - 0.2, y - 0.2, 2.3, 2.3);
  L.ell(C.GOLD_L, x - 0.9, y - 0.9, 1, 0.7);
  L.ell(tone(C.GOLD, -0.35), x + 0.2, y + 0.2, 1.5, 1.5);
  L.ell(C.DARK, x + 0.2, y + 0.2, 1.1, 1.1);
  L.ell(C.WOOD_D, x + 0.4, y + 0.5, 0.6, 0.5);
}

// Note: sawdust drifts: pale flecks in clumps, thickest toward the middle of the drift.
function sawdust(L, x, y, at, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = hh(x * 7 + i, y, 201) * Math.PI * 2;
    const r = hh(x, y * 5 + i, 202) * 5.6;
    const col = i % 3 ? C.SAND_L : i % 2 ? C.PLASTER : C.SAND;
    L.rect(tint(col, 0.55), at.x + Math.cos(a) * r, at.y + Math.sin(a) * r * 0.7, px * 2, px);
  }
}

// Note: a wet stain from a spilled drink, with a brighter rim.
function stain(L, at) {
  L.ell(tint(C.VOID, 0.2), at.x, at.y, 3.4, 2.4);
  L.ell(tint(C.WOOD_D, 0.28), at.x + 0.3, at.y + 0.2, 2.6, 1.7);
  L.ell(tint(C.GOLD, 0.12), at.x - 0.6, at.y - 0.4, 1.2, 0.7);
}

// Note: a playing card dropped face up, a little askew.
function card(L, at, tilt) {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const pt = (u, v) => [at.x + u * c - v * s, at.y + u * s + v * c];
  L.poly(tint(C.VOID, 0.3), [pt(-1.1, -1.6), pt(1.3, -1.6), pt(1.3, 1.8), pt(-1.1, 1.8)].map(([a, b]) => [a + 0.4, b + 0.4]));
  L.poly(C.BONE, [pt(-1.1, -1.6), pt(1.1, -1.6), pt(1.1, 1.6), pt(-1.1, 1.6)]);
  L.poly(hh(at.x, at.y, 9) < 0.5 ? C.RED : C.DARK, [pt(-0.4, -0.7), pt(0.4, -0.7), pt(0.4, 0.2), pt(-0.4, 0.2)]);
}

// Note: a cigar stub with a grey ash tip.
function stub(L, at) {
  L.line(C.WOOD_D, at.x - 1.2, at.y, at.x + 1, at.y + 0.4, 0.9);
  L.rect(C.STONE_L, at.x + 1, at.y, px * 2, px * 2);
}

// Note: a few boot prints of mud, heel and toe, walking in from the street.
function mud(L, at, flip) {
  for (let i = 0; i < 3; i++) {
    const my = at.y - i * 5;
    const mx = at.x + (i % 2 ? 2.2 : -2.2) * flip;
    L.ell(tint(C.WOOD_D, 0.34), mx, my, 1.6, 2.1);
    L.ell(tint(C.WOOD_D, 0.3), mx, my + 2.6, 1.1, 0.8);
  }
}

// Note: shards of a broken glass.
function shards(L, at) {
  L.line(C.GLASS_L, at.x - 1.4, at.y, at.x + 0.6, at.y - 1.1, px * 1.5);
  L.line(C.GLASS, at.x + 0.4, at.y + 0.6, at.x + 1.8, at.y + 1.4, px * 1.5);
  L.rect(tint(C.GLASS_L, 0.7), at.x - 0.4, at.y + 1.2, px * 1.5, px * 1.5);
}

// Note: the brass foot rail along the bar's foot with its two brackets.
function footrail(L) {
  L.rect(tint(C.VOID, 0.34), 0, 2.6, 16, 1.6);
  L.rect(tone(C.GOLD, -0.35), 0, 1.4, 16, 1.6);
  L.rect(C.GOLD, 0, 1.4, 16, 1.1);
  L.rect(C.GOLD_L, 0, 1.4, 16, px);
  for (const bx of [2.6, 12.6]) {
    L.rect(C.IRON, bx, 0.4, 1.2, 1.2);
    L.rect(C.IRON_L, bx, 0.4, px, 1.2);
  }
}

const LITTER = { footrail, spit: (L, d) => spittoon(L, d.x, d.y), card: (L, d, x, y) => card(L, d, hh(x, y, 11) * 3), stub, stain, mud: (L, d) => mud(L, d, d.flip || 1), shards };

// Note: the floor litter of one cell; each item is {k, x, y} in 16 x 16 art units, and dust is the sawdust count.
export function paintFloorDecor(L, theme, x, y) {
  const d = theme.decor;
  if (!d) return;
  if (d.dust) sawdust(L, x, y, { x: 8 + (hh(x, y, 203) - 0.5) * 6, y: 8 + (hh(y, x, 204) - 0.5) * 6 }, d.dust);
  for (const item of d.items || []) if (LITTER[item.k]) LITTER[item.k](L, item, x, y);
}

// Note: a sheet pinned to the wall: a wanted bill with a face, a theatre bill, a plain notice or a tin sign.
function sheet(L, kind, x, y) {
  const tilt = (hh(x, y, 21) - 0.5) * 1.2;
  const bx = 4 + tilt;
  if (kind === 'wanted') {
    L.rect(tint(C.VOID, 0.3), bx + 0.5, 2.2, 8, 10.4);
    L.rect(C.PLASTER, bx, 1.6, 8, 10.4);
    L.rect(tone(C.PLASTER, -0.18), bx, 11.2, 8, 0.8);
    L.rect(C.DARK, bx + 1.2, 2.5, 5.6, 1.3);
    L.ell(C.ADOBE, bx + 4, 6.6, 1.7, 2);
    L.rect(C.DARK, bx + 2.2, 4.8, 3.6, 1);
    L.rect(C.DARK, bx + 1.2, 9.4, 5.6, px * 1.5);
    L.rect(C.DARK, bx + 1.8, 10.4, 4.4, px * 1.5);
  } else if (kind === 'bill') {
    L.rect(tint(C.VOID, 0.3), bx - 0.3, 2.2, 9, 11);
    L.rect(C.BONE, bx - 0.8, 1.6, 9, 11);
    L.rect(C.RED, bx - 0.2, 2.2, 7.8, 9.8);
    L.rect(C.GOLD, bx + 0.6, 3, 6.2, px * 2);
    L.poly(C.GOLD_L, [[bx + 3.4, 4.6], [bx + 4.2, 6.4], [bx + 6, 6.6], [bx + 4.6, 7.8], [bx + 5, 9.6], [bx + 3.4, 8.6], [bx + 1.8, 9.6], [bx + 2.2, 7.8], [bx + 0.8, 6.6], [bx + 2.6, 6.4]]);
    L.rect(C.BONE, bx + 0.8, 10.4, 5.6, px * 1.5);
  } else if (kind === 'ad') {
    L.rect(tint(C.VOID, 0.3), 2.8, 3.4, 11, 7);
    L.rect(C.IRON, 2.2, 2.8, 11, 7);
    L.rect(C.BLUE_D, 2.8, 3.4, 9.8, 5.8);
    L.rect(C.GOLD, 2.8, 3.4, 9.8, 1.2);
    L.ell(C.PLASTER_L, 5.4, 6.8, 1.2, 1.5);
    L.rect(C.PLASTER_L, 8, 5.8, 3.2, px * 2);
    L.rect(C.PLASTER_L, 8, 7.2, 2.4, px * 2);
  } else {
    L.rect(tint(C.VOID, 0.3), bx + 0.6, 2.8, 6.6, 8);
    L.rect(C.BONE, bx, 2.2, 6.6, 8);
    for (let r = 0; r < 5; r++) L.rect(C.STONE, bx + 0.8, 3.4 + r * 1.2, 5 - (r === 4 ? 2 : 0), px);
  }
  for (const [pxx, pyy] of [[bx + 0.8, 2.2], [bx + 6, 2.2]]) L.rect(C.IRON_L, pxx, pyy, px * 2, px * 2);
}

// Note: steer horns on a shield, a trophy over the bar.
function horns(L) {
  L.ell(tint(C.VOID, 0.34), 8.5, 8.4, 3.6, 3.2);
  L.ell(tone(C.WOOD_D, -0.3), 8, 7.8, 3.5, 3.1);
  L.ell(C.WOOD, 8, 7.6, 3, 2.7);
  L.ell(tone(C.WOOD, 0.2), 7.4, 7, 1.5, 1.1);
  for (const s of [-1, 1]) {
    L.line(C.DARK, 8 + s * 2.6, 8.4, 8 + s * 6.2, 6, 2.1);
    L.line(C.PLASTER, 8 + s * 2.6, 8.2, 8 + s * 6.2, 5.8, 1.5);
    L.line(C.BONE, 8 + s * 6, 5.9, 8 + s * 6.8, 3.2, 1.1);
    L.line(tone(C.PLASTER, -0.35), 8 + s * 2.8, 8.9, 8 + s * 6.2, 6.5, px);
  }
}

// Note: a regulator clock: a wooden case, a white face, two hands and a pendulum.
function clock(L) {
  L.rect(tint(C.VOID, 0.3), 4.6, 2.6, 7.4, 11.4);
  L.rect(tone(C.WOOD_D, -0.2), 4, 2, 7.4, 11.4);
  L.rect(C.WOOD, 4.6, 2.6, 6.2, 10.2);
  L.ell(tone(C.GOLD, -0.3), 7.7, 5.6, 2.9, 2.9);
  L.ell(C.BONE, 7.7, 5.6, 2.4, 2.4);
  L.line(C.DARK, 7.7, 5.6, 7.7, 3.9, px * 1.5);
  L.line(C.DARK, 7.7, 5.6, 9, 6.4, px * 1.5);
  L.rect(C.DARK, 5.6, 8.8, 4.2, 3);
  L.rect(C.GLASS, 5.8, 9, 3.8, 2.6);
  L.line(C.GOLD, 7.7, 8.8, 7.7, 11, px * 1.5);
  L.ell(C.GOLD_L, 7.7, 11, 1.1, 0.9);
}

// Note: a landscape in a gilt frame: sky, hills and a low sun.
function picture(L) {
  L.rect(tint(C.VOID, 0.3), 2.4, 3.4, 12, 9.4);
  L.rect(tone(C.GOLD, -0.3), 2, 3, 12, 9.4);
  L.rect(C.GOLD, 2.4, 3.4, 11.2, 8.6);
  L.rect(C.GLASS_L, 3.4, 4.4, 9.2, 6.6);
  L.rect(tint(C.GOLD_L, 0.5), 3.4, 7.6, 9.2, 1.6);
  L.ell(C.GOLD_L, 10, 7.4, 1.2, 1.2);
  L.poly(C.GREEN_D, [[3.4, 11], [3.4, 8.8], [6, 7.4], [8.6, 9.2], [11, 8], [12.6, 9], [12.6, 11]]);
  L.poly(C.GREEN, [[3.4, 11], [5, 9.8], [7.4, 10.4], [9.6, 9.6], [12.6, 11]]);
  L.rect(tint(C.BONE, 0.4), 2.4, 3.4, 11.2, px);
}

// Note: an oil lamp on a brass bracket with a tin reflector; the flame is a warm dot, the light itself is the room's.
function sconce(L) {
  L.ell(tint(C.GOLD_L, 0.22), 8, 6.6, 6.6, 6.6);
  L.ell(tint(C.GOLD_L, 0.2), 8, 6.6, 3.8, 3.8);
  L.rect(tint(C.VOID, 0.3), 5.6, 3.2, 5.6, 9);
  L.rect(C.IRON, 5.2, 2.6, 5.6, 9);
  L.rect(C.IRON_L, 5.2, 2.6, px * 2, 9);
  L.ell(tone(C.GOLD, -0.2), 8, 5.8, 2.7, 2.7);
  L.ell(C.GLASS_L, 8, 5.8, 1.9, 1.9);
  L.ell(C.GOLD_L, 8, 6.2, 0.9, 1.2);
  L.rect(C.GOLD, 6.4, 9.2, 3.2, 1.2);
  L.rect(C.DARK, 7.4, 10.6, 1.2, 1.6);
}

const WALL_ART = { wanted: (L, x, y) => sheet(L, 'wanted', x, y), bill: (L, x, y) => sheet(L, 'bill', x, y), ad: (L, x, y) => sheet(L, 'ad', x, y), notice: (L, x, y) => sheet(L, 'notice', x, y), horns, clock, picture, sconce };

// Note: what hangs on one wall cell, named by theme.deco.
export function paintWallDecor(L, theme, x, y) {
  const f = theme.deco && WALL_ART[theme.deco];
  if (f) f(L, x, y);
}

// Note: a shaft of daylight on the floor: a pale slanted band with the window's mullion shadows across it and a few motes; each is {pts, a} in room art units.
export function paintShafts(L, theme, x, y) {
  const ox = x * 16;
  const oy = y * 16;
  for (const s of theme.shafts || []) {
    const local = s.pts.map(([u, v]) => [u - ox, v - oy]);
    L.poly(tint(C.PLASTER_L, s.a), local);
    L.poly(tint(C.GOLD_L, s.a * 0.7), s.core.map(([u, v]) => [u - ox, v - oy]));
    for (const m of s.bars) L.poly(tint(C.VOID, s.a * 0.9), m.map(([u, v]) => [u - ox, v - oy]));
    for (const [u, v] of s.motes) L.rect(tint(C.BONE, 0.5), u - ox, v - oy, px * 2, px * 2);
  }
}
