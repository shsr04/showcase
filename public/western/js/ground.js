// Note: the ground of every outdoor cell, painted from world noise so tiles show no seams.

import { C } from './palette.js';
import { SCALE } from './config.js';
import { T } from './tiles.js';
import { tileAt } from './map.js';
import { pen, hash as hh, tone, tint, clipTo } from './draw.js';
import { lookOfMap } from './regional-look.js';
import { regionTint } from './regional-flora.js';
import { paintRelief } from './relief-art.js';

const P = pen(SCALE);
const px = P.px;

// Note: a painter bound to one cell; coordinates are art units from the cell's top-left corner.
function local(ctx, ox, oy) {
  // Note: ox and oy are art units; the clip keeps every stroke inside the cell.
  const c = clipTo(ctx, ox * SCALE, oy * SCALE, 16 * SCALE);
  return {
    r: (col, x, y, w, h) => P.rect(c, col, ox + x, oy + y, w, h),
    e: (col, cx, cy, rx, ry) => P.ell(c, col, ox + cx, oy + cy, rx, ry),
    l: (col, x0, y0, x1, y1, w) => P.line(c, col, ox + x0, oy + y0, ox + x1, oy + y1, w),
    g: (col, pts) => P.poly(c, col, pts.map(([x, y]) => [ox + x, oy + y])),
  };
}

// Note: the terrain of a scene as the generator named it; a map without one (a house, a test map) reads as desert scrub.
export const terrainOf = (map) => (map && map.terrain) || 'desert-scrub';

// Note: flat tints the cell, dark and light are blob kinds, tuft is straw on bare ground.
const GROUNDS = {
  'desert-scrub': { base: C.SAND, flat: [C.ADOBE, 0.05], dark: [C.SAND_D, 0.2], light: [C.SAND_L, 0.2], blobs: 0.8, pebbles: 0.9, pebble: [C.STONE, C.STONE_L, C.ADOBE_L], tuft: 0.04 },
  wash: { base: C.SAND, flat: [C.SAND_D, 0.14], dark: [C.ADOBE_D, 0.14], light: [C.SAND_L, 0.22], blobs: 0.8, pebbles: 2, pebble: [C.STONE, C.STONE_L, C.SAND_L], tuft: 0 },
  'rocky-hills': { base: C.SAND, flat: [C.ADOBE, 0.24], dark: [C.ADOBE_D, 0.24], light: [C.STONE_L, 0.12], blobs: 1, pebbles: 3, pebble: [C.STONE, C.IRON_L, C.ADOBE_L, C.STONE_L], tuft: 0.02 },
  grassland: { base: C.SAND, flat: [C.GOLD, 0.1], dark: [C.GREEN_D, 0.1], light: [C.SAND_L, 0.26], blobs: 0.9, pebbles: 0.4, pebble: [C.STONE, C.SAND_L], tuft: 0.34 },
  'mining-camp': { base: C.SAND, flat: [C.STONE, 0.2], dark: [C.ADOBE_D, 0.2], light: [C.STONE_L, 0.14], blobs: 0.9, pebbles: 2, pebble: [C.STONE, C.IRON_L, C.ADOBE_L, C.STONE_L], ore: [C.GOLD, C.GREEN, C.RED_L], tuft: 0.01 },
  ranch: { base: C.SAND, flat: [C.PLANK_L, 0.07], dark: [C.ADOBE_D, 0.12], light: [C.SAND_L, 0.24], blobs: 0.8, pebbles: 0.5, pebble: [C.STONE, C.SAND_L], tuft: 0.16 },
  riverbank: { base: C.SAND, flat: [C.ADOBE_D, 0.12], dark: [C.SAND_D, 0.26], light: [C.SAND_L, 0.12], blobs: 0.9, pebbles: 1, pebble: [C.STONE, C.STONE_L, C.SAND_L, C.ADOBE_L], tuft: 0.12 },
  'stage-road': { base: C.SAND, flat: [C.SAND_L, 0.14], dark: [C.SAND_D, 0.16], light: [C.SAND_L, 0.24], blobs: 0.8, pebbles: 0.7, pebble: [C.STONE, C.SAND_L], tuft: 0.05 },
};

// Note: ground under things that are not ground themselves takes the weight of the cells round them.
const OPEN_GROUND = new Set([T.SAND, T.SCRUB, T.GRASS, T.ROAD, T.WASH, T.WATER, T.BANK, T.DROP, T.VOID]);

// Note: a smooth 0 to 1 field over a cell, blended between the four nearest cell centres.
function fieldFrom(x, y, cellWeight) {
  const W = new Array(9);
  const unknown = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const v = cellWeight(x + i - 1, y + j - 1);
      W[j * 3 + i] = v;
      if (v === null) unknown.push(j * 3 + i);
    }
  }
  const known = W.slice();
  for (const k of unknown) {
    const i = k % 3;
    const j = Math.floor(k / 3);
    let sum = 0;
    let n = 0;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const v = i + di >= 0 && i + di < 3 && j + dj >= 0 && j + dj < 3 ? known[(j + dj) * 3 + i + di] : null;
      if (v !== null) {
        sum += v;
        n++;
      }
    }
    W[k] = n ? sum / n : 0;
  }
  let lo = 1;
  let hi = 0;
  for (const v of W) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const blend = (u, v) => {
    const fu = u - 0.5;
    const fv = v - 0.5;
    const di = fu < 0 ? -1 : 1;
    const dj = fv < 0 ? -1 : 1;
    const a = W[4];
    const b = W[4 + di];
    const c = W[4 + 3 * dj];
    const d = W[4 + di + 3 * dj];
    const tu = Math.abs(fu);
    const tv = Math.abs(fv);
    return (a + (b - a) * tu) * (1 - tv) + (c + (d - c) * tu) * tv;
  };
  // Note: world noise, a fine and a coarse lattice; the contour of a plain blend sits on the cell border, this pushes it off.
  if (lo === hi) {
    const flat = () => lo;
    flat.lo = lo;
    flat.hi = hi;
    return flat;
  }
  const fine = nodes(x, y, 4, 811);
  const coarse = nodes(x, y, 2, 823);
  const at = (u, v) => {
    const a = blend(u, v);
    if (a <= 0 || a >= 1) return a;
    const n = 0.45 * sample(fine, 4, u, v) + 0.55 * sample(coarse, 2, u, v);
    return Math.max(0, Math.min(1, a + (n - 0.5) * WOBBLE * 4 * a * (1 - a)));
  };
  at.lo = lo;
  at.hi = hi;
  return at;
}

const smooth = (t) => t * t * (3 - 2 * t);
const WOBBLE = 2.4;

// Note: hashed values at k nodes per cell, one node beyond the cell on each side, shared by neighbouring cells.
function nodes(x, y, k, seed) {
  const n = k + 3;
  const a = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) a[j * n + i] = hh(x * k + i - 1, y * k + j - 1, seed);
  return a;
}

// Note: smooth bilinear value of a node grid at (u, v) in cell units, from -0.25 to 1.25.
function sample(a, k, u, v) {
  const n = k + 3;
  const fu = u * k;
  const fv = v * k;
  const i = Math.floor(fu);
  const j = Math.floor(fv);
  const tu = smooth(fu - i);
  const tv = smooth(fv - j);
  const m = (j + 1) * n + i + 1;
  return (a[m] + (a[m + 1] - a[m]) * tu) * (1 - tv) + (a[m + n] + (a[m + n + 1] - a[m + n]) * tu) * tv;
}

// Note: the field of a kind of tile; objects take the weight of the ground round them.
function field(map, f, x, y, weight) {
  return fieldFrom(x, y, (cx, cy) => {
    const t = tileAt(map, f, cx, cy);
    return OPEN_GROUND.has(t) ? weight(t) : null;
  });
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Note: paints col where the field beats a Bayer threshold, so soft edges carry across cells.
function dither(ctx, ox, oy, x, y, at, col, step = 1, bias = 0) {
  if (at.hi + bias <= 0.02) return;
  const L = local(ctx, ox, oy);
  if (at.lo + bias >= 0.98) {
    L.r(col, 0, 0, 16, 16);
    return;
  }
  const n = 16 / step;
  for (let bj = 0; bj < n; bj++) {
    let run = -1;
    for (let bi = 0; bi <= n; bi++) {
      let on = false;
      if (bi < n) {
        const wi = x * n + bi;
        const wj = y * n + bj;
        const d = at((bi + 0.5) / n, (bj + 0.5) / n) + bias + (hh(wi, wj, 801) - 0.5) * 0.12;
        on = d > (BAYER[(wj & 3) * 4 + (wi & 3)] + 0.5) / 16;
      }
      if (on && run < 0) run = bi;
      else if (!on && run >= 0) {
        L.r(col, run * step, bj * step, (bi - run) * step, step);
        run = -1;
      }
    }
  }
}

// Note: an ellipse cut to the cell box row by row, so no clip is needed.
function cellEllipse(ctx, col, ox, oy, cx, cy, rx, ry) {
  const x0 = ox * SCALE;
  const y0 = oy * SCALE;
  const x1 = x0 + 16 * SCALE;
  const y1 = y0 + 16 * SCALE;
  const px0 = cx * SCALE;
  const py0 = cy * SCALE;
  const qx = rx * SCALE;
  const qy = ry * SCALE;
  ctx.fillStyle = col;
  const top = Math.max(Math.floor(py0 - qy), Math.round(y0));
  const bottom = Math.min(Math.ceil(py0 + qy), Math.round(y1) - 1);
  for (let y = top; y <= bottom; y++) {
    const d = (y + 0.5 - py0) / qy;
    if (d <= -1 || d >= 1) continue;
    const half = qx * Math.sqrt(1 - d * d);
    const a = Math.max(Math.round(px0 - half), Math.round(x0));
    const b = Math.min(Math.round(px0 + half), Math.round(x1));
    if (b > a) ctx.fillRect(a, y, b - a, 1);
  }
}

// Note: soft blobs on a world lattice, each cell paints its own part.
function worldBlobs(ctx, ox, oy, [idx, alpha], seed, size, chance, rmin, rmax) {
  // Note: three nested layers make a soft edge out of hard pixels; the centre is about one and a half times the alpha.
  const layers = [[1, tint(idx, alpha * 0.5)], [0.72, tint(idx, alpha * 0.4)], [0.44, tint(idx, alpha * 0.3)]];
  const g0 = Math.floor((ox - rmax) / size);
  const g1 = Math.floor((ox + 16 + rmax) / size);
  const h0 = Math.floor((oy - rmax) / size);
  const h1 = Math.floor((oy + 16 + rmax) / size);
  for (let gj = h0; gj <= h1; gj++) {
    for (let gi = g0; gi <= g1; gi++) {
      if (hh(gi, gj, seed) > chance) continue;
      const cx = (gi + 0.15 + hh(gi, gj, seed + 1) * 0.7) * size;
      const cy = (gj + 0.15 + hh(gi, gj, seed + 2) * 0.7) * size;
      const rx = rmin + hh(gi, gj, seed + 3) * (rmax - rmin);
      const ry = rx * (0.45 + hh(gi, gj, seed + 4) * 0.4);
      if (cx + rx < ox || cx - rx > ox + 16 || cy + ry < oy || cy - ry > oy + 16) continue;
      for (const [k, col] of layers) cellEllipse(ctx, col, ox, oy, cx, cy, rx * k, ry * k);
    }
  }
}

// Note: a landmark's trodden ground, a frayed rounded rectangle drawn by every cell it reaches.
function paintPatch(ctx, ox, oy, x, y, patch) {
  const inside = (cx, cy) => (cx >= patch.x && cx < patch.x + patch.w && cy >= patch.y && cy < patch.y + patch.h ? 1 : 0);
  const at = fieldFrom(x, y, inside);
  if (at.hi <= 0) return;
  const col = patch.col === C.SAND ? C.SAND_L : patch.col;
  const k = patch.col === C.SAND ? 0.5 : 0.66;
  dither(ctx, ox, oy, x, y, scaled(at, 1.05), tint(col, k), 1, -0.1);
  dither(ctx, ox, oy, x, y, scaled(at, 1.4, -0.45), tint(col, 0.3), 2, 0);
}

const grassWeight = (t) => (t === T.GRASS ? 1 : 0);
const bedWeight = (t) => (t === T.WASH ? 1 : t === T.BANK ? 0.8 : 0);
const roadWeight = (t) => (t === T.ROAD ? 1 : 0);

// Note: a field stretched by k and shifted, with the bounds the dither needs.
const scaled = (at, k, add = 0) => {
  const g = (u, v) => Math.max(0, Math.min(1, at(u, v) * k + add));
  g.lo = Math.max(0, Math.min(1, at.lo * k + add));
  g.hi = Math.max(0, Math.min(1, at.hi * k + add));
  return g;
};

// Note: the plain ground of one cell; opts.dark is the unreachable ground seen from above.
export function paintGround(ctx, map, f, ox, oy, x, y, opts = {}) {
  const terrain = terrainOf(map);
  // Note: RG is the regional ground family, or null for the Cochise look, which paints the plain ground.
  const look = lookOfMap(map);
  const RG = look && look.ground;
  const G0 = GROUNDS[terrain] || GROUNDS['desert-scrub'];
  const G = RG ? { ...G0, dark: [RG.dark, G0.dark[1]], light: [RG.light, G0.light[1]], pebble: RG.pebble, pebbles: G0.pebbles * RG.pebbles } : G0;
  const L = local(ctx, ox, oy);
  L.r(tone(G.base, (hh(x, y, 1) - 0.5) * 0.02), 0, 0, 16, 16);
  L.r(tint(G.flat[0], G.flat[1]), 0, 0, 16, 16);
  if (RG && RG.tint) L.r(regionTint(RG.tint[0], RG.tint[1]), 0, 0, 16, 16);
  // Note: a broad blob scale for the land and a small one for tone patches.
  worldBlobs(ctx, ox, oy, G.dark, 11, 26, G.blobs, 7, 15);
  worldBlobs(ctx, ox, oy, G.light, 21, 22, G.blobs, 6, 13);
  worldBlobs(ctx, ox, oy, [G.dark[0], G.dark[1] * 0.8], 31, 11, G.blobs * 0.8, 2.6, 5.5);
  worldBlobs(ctx, ox, oy, [G.light[0], G.light[1] * 0.9], 41, 9, G.blobs * 0.7, 2.2, 4.4);
  if (opts.patch) paintPatch(ctx, ox, oy, x, y, opts.patch);
  // Note: wind ripples, a dark line with a lit line just under it.
  for (let i = 0; i < (RG && RG.ripples === false ? 0 : 3); i++) {
    if (hh(x, y, 70 + i) < 0.55) continue;
    const yy = 2 + hh(x, y, 80 + i) * 12;
    const xx = hh(y, x, 85 + i) * 9;
    const len = 3 + hh(x, y, 90 + i) * 5;
    L.r(tint(C.SAND_D, 0.5), xx, yy, len, px);
    L.r(tint(C.SAND_L, 0.5), xx + 2 * px, yy + 2 * px, len - 1, px);
  }
  const specks = Math.round(18 * (0.6 + G.pebbles * 0.2));
  for (let i = 0; i < specks; i++) {
    const v = hh(x + i, y, 9);
    const col = v < 0.5 ? C.SAND_D : v < 0.85 ? C.SAND_L : G.pebble[i % G.pebble.length];
    L.r(col, hh(x, y, i) * 15.6, hh(y, x, i + 40) * 15.6, px * (v > 0.93 ? 2 : 1), px * (v > 0.96 ? 2 : 1));
  }
  const stones = Math.floor(G.pebbles * (0.5 + hh(x, y, 61) * 1.1));
  for (let i = 0; i < stones; i++) {
    const cx = 2 + hh(x, y, 62 + i * 3) * 12;
    const cy = 2 + hh(y, x, 63 + i * 3) * 12;
    const rx = 0.55 + hh(x, y, 64 + i * 3) * 0.9;
    const c = G.pebble[Math.floor(hh(x, y, 65 + i) * G.pebble.length)];
    L.e(tint(C.SHADOW, 0.35), cx + 0.4, cy + 0.5, rx, rx * 0.75);
    L.e(c, cx, cy, rx, rx * 0.75);
    L.r(tone(c, 0.35), cx - rx * 0.5, cy - rx * 0.45, 1.5 * px, px);
  }
  // Note: a flake of ore in a mining country, rare; copper green, gold and rust.
  if (G.ore && hh(x, y, 66) < 0.22) {
    const c = G.ore[Math.floor(hh(x, y, 67) * G.ore.length)];
    L.r(c, 1 + hh(x, y, 68) * 13, 1 + hh(y, x, 69) * 13, px * 2, px * 1.5);
  }
  const green = field(map, f, x, y, grassWeight);
  const base = RG ? Math.max(terrain === 'grassland' ? 0.22 : 0, RG.cover) : terrain === 'grassland' ? 0.22 : 0;
  if (green.hi > 0 || base) paintGrassOn(ctx, ox, oy, x, y, green, base, RG && RG.grass);
  if (terrain === 'riverbank') paintDamp(ctx, ox, oy, x, y, map, f);
  // Note: a wash and a road shade the ground round them so their edges fray.
  const bed = field(map, f, x, y, bedWeight);
  if (bed.hi > 0) {
    dither(ctx, ox, oy, x, y, scaled(bed, 1.3), tint(C.SAND_D, 0.6), 1, -0.05);
    dither(ctx, ox, oy, x, y, scaled(bed, 1.1, -0.15), tint(C.ADOBE_D, 0.24), 2, -0.05);
  }
  const road = field(map, f, x, y, roadWeight);
  if (road.hi > 0) {
    dither(ctx, ox, oy, x, y, scaled(road, 1.3), RG && RG.road != null ? regionTint(RG.road, 0.72) : tint(C.SAND_L, 0.72), 1, -0.05);
    dither(ctx, ox, oy, x, y, scaled(road, 1.2, -0.4), tint(C.PLASTER, 0.3), 2, 0);
    dither(ctx, ox, oy, x, y, scaled(road, 1.5, -0.65), tint(C.WOOD_D, 0.16), 1, 0);
  }
  const heap = heapField(map, f, x, y);
  if (heap.hi > 0) paintHeap(ctx, ox, oy, x, y, heap);
  // Note: item 485: the lie of the ground, drawn over the soil and under anything standing on it.
  if (f === 0 && map && map.relief) paintRelief(ctx, map, ox, oy, x, y);
  if (opts.dark) L.r('rgba(10,8,6,0.45)', 0, 0, 16, 16);
}

// Note: a mine dump of broken rock; soft bands from a dark rim to a pale crown, lit from the north west.
function paintHeap(ctx, ox, oy, x, y, at) {
  const band = (edge, col, step = 1, du = 0) => {
    const g = scaled((u, v) => at(u + du, v + du), 2.4, 0.5 - 2.4 * edge);
    g.lo = Math.max(0, Math.min(1, at.lo * 2.4 + 0.5 - 2.4 * edge));
    g.hi = Math.max(0, Math.min(1, at.hi * 2.4 + 0.5 - 2.4 * edge));
    dither(ctx, ox, oy, x, y, g, col, step, 0);
  };
  band(0.36, tint(C.SHADOW, 0.34), 2, -0.14);
  band(0.46, tone(C.ADOBE_D, -0.3), 1, -0.1);
  band(0.55, C.ADOBE_D);
  band(0.7, C.ADOBE);
  band(0.86, tone(C.ADOBE, 0.12), 1, 0.12);
  band(0.93, tone(C.ADOBE, 0.26), 1, 0.2);
}

// Note: the field of a dump; ground cells beside it paint the fray of its edge too, so it is not cut at the cell border.
export const heapField = (map, f, x, y) => fieldFrom(x, y, (cx, cy) => (tileAt(map, f, cx, cy) === T.TAILINGS ? 1 : 0));

// Note: a green wash that fades with the grass, then blades; bare ground gets thin straw.
function paintGrassOn(ctx, ox, oy, x, y, green, base, pal) {
  const L = local(ctx, ox, oy);
  const lushness = (u, v) => Math.min(1, green(u, v) * 1.15 + base * 0.2);
  lushness.lo = Math.min(1, green.lo * 1.15 + base * 0.2);
  lushness.hi = Math.min(1, green.hi * 1.15 + base * 0.2);
  dither(ctx, ox, oy, x, y, lushness, pal ? regionTint(pal.wash[0], pal.wash[1]) : tint(C.GREEN, 0.3), 1, -0.06);
  const LU = pal ? pal.lush : [C.GREEN_D, C.SAND_L, C.GREEN];
  const DR = pal ? pal.dry : [C.SAND_L, C.GOLD, C.SAND_D];
  const blades = 16;
  for (let i = 0; i < blades; i++) {
    const gx = 0.5 + hh(x, y, 200 + i) * 14.5;
    const gy = 0.5 + hh(y, x, 220 + i) * 12;
    const d = Math.max(green(gx / 16, gy / 16), base);
    if (hh(x + i, y, 250) > d) continue;
    const v = hh(x + i, y, 240);
    const lush = green(gx / 16, gy / 16) > 0.35;
    const h = 1.6 + v * 2.6;
    const ci = lush ? (v < 0.45 ? LU[0] : v < 0.8 ? LU[1] : LU[2]) : v < 0.5 ? DR[0] : v < 0.8 ? DR[1] : DR[2];
    L.r(tone(ci, 0.05), gx, gy, px, h);
    L.r(tone(ci, 0.05), gx + 1.2 * px, gy + 0.5, px, h - 0.8);
    L.r(tone(ci, -0.2), gx - 1.1 * px, gy + 0.8, px, h - 1.2);
    if (lush && v > 0.85) L.r(tone(C.GOLD_L, -0.1), gx, gy - 0.6, px * 2, px);
  }
}

const waterWeight = (t) => (t === T.WATER ? 1 : 0);

// Note: damp soil where water is near; a darker band that fades with the distance, with a few reed blades at the edge.
function paintDamp(ctx, ox, oy, x, y, map, f) {
  const wet = field(map, f, x, y, waterWeight);
  if (wet.hi <= 0) return;
  const L = local(ctx, ox, oy);
  const damp = (u, v) => Math.min(1, wet(u, v) * 1.5);
  damp.lo = Math.min(1, wet.lo * 1.5);
  damp.hi = Math.min(1, wet.hi * 1.5);
  dither(ctx, ox, oy, x, y, damp, tint(C.WOOD_D, 0.3), 1, -0.05);
  for (let i = 0; i < 6; i++) {
    const gx = 0.5 + hh(x, y, 520 + i) * 14.5;
    const gy = 0.5 + hh(y, x, 530 + i) * 12;
    const d = wet(gx / 16, gy / 16);
    if (d < 0.25 || hh(x + i, y, 540) > d) continue;
    L.r(C.GREEN_D, gx, gy, px, 2.4);
    L.r(C.GREEN, gx + px, gy + 0.4, px, 2);
    L.r(C.GOLD, gx, gy - 0.4, px, px);
  }
}
