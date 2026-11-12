// Note: code-defined pixel art; tiles are painted in art units (1/16 tile) so every size scales with SCALE, people come from people.js.

import { C } from './palette.js';
import { T, DS, WS, isFlight, TILE_ART_BASE } from './tiles.js';
import { SCALE, TILE, MAP_W, MAP_H } from './config.js';
import { tileAt, stateAt, railStrip, RAIL_T } from './map.js';
import { flightLower } from './nav.js';
import { pen, hash as hh, tone, tint, makeCanvas, clipTo } from './draw.js';
import { paintThemeCell, paintThemeWindowWall, landmarkPatch } from './themed-art.js';
import { paintGround, heapField, terrainOf } from './ground.js';
import { paintCactus, paintMesquite, paintScrub, paintRock, paintBank, paintWater } from './flora.js';
import { lookOfMap } from './regional-look.js';
import { paintMaterialWall } from './regional-flora.js';

export { makeCanvas };
export { personDesc, personKey, ensurePerson, variantOf, weaponKind, PERSON_SIZE, DENSE, PEOPLE_MAX } from './people.js';

const P = pen(SCALE);
// Note: one device pixel in art units; detail lines and dots are this thick.
const px = P.px;

// Note: a painter bound to one cell; coordinates are art units from the cell's top-left corner.
function local(ctx, ox, oy) {
  return {
    r: (col, x, y, w, h) => P.rect(ctx, col, ox + x, oy + y, w, h),
    e: (col, cx, cy, rx, ry) => P.ell(ctx, col, ox + cx, oy + cy, rx, ry),
    l: (col, x0, y0, x1, y1, w) => P.line(ctx, col, ox + x0, oy + y0, ox + x1, oy + y1, w),
    g: (col, pts) => P.poly(ctx, col, pts.map(([x, y]) => [ox + x, oy + y])),
  };
}

// Note: a painter bound to one cell that cannot spill into its neighbours; the clip is in device pixels.
const clippedLocal = (ctx, ox, oy) => local(clipTo(ctx, ox * SCALE, oy * SCALE, 16 * SCALE), ox, oy);

// Note: a door or window listed here is painted without its leaf or sash; js/fx.js animates the part that moves.
export const HIDE = new Set();
export const cellKey = (f, x, y) => `${f}:${x}:${y}`;
export const EMPTY = -1;

const WALLISH = new Set([T.ADOBE, T.FRAME, T.PARTITION, T.VOID, T.DOOR, T.WINDOW]);
const WALLS = new Set([T.ADOBE, T.FRAME, T.PARTITION, T.VOID]);
const wallish = (map, f, x, y) => WALLISH.has(tileAt(map, f, x, y));
const isWall = (map, f, x, y) => WALLS.has(tileAt(map, f, x, y));

// Note: a door or window sits in a wall; the wall runs east-west when its left and right neighbours are wall.
function horizontal(map, f, x, y) {
  const h = (wallish(map, f, x - 1, y) ? 1 : 0) + (wallish(map, f, x + 1, y) ? 1 : 0);
  const v = (wallish(map, f, x, y - 1) ? 1 : 0) + (wallish(map, f, x, y + 1) ? 1 : 0);
  return h >= v;
}

// Note: the view needs to know which way a door runs to animate its leaf.
export const doorHorizontal = horizontal;

function wallKind(map, f, x, y) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const t = tileAt(map, f, x + dx, y + dy);
    if (t === T.ADOBE || t === T.FRAME || t === T.PARTITION) return t;
  }
  return T.FRAME;
}

function nail(L, x, y) {
  L.r(C.IRON, x, y, 2 * px, 2 * px);
  L.r(C.IRON_L, x, y, px, px);
}

// Note: planks run east-west, four to a tile; each has its own tone, grain, joints with nails, and now and then a knot or a gap.
function paintFloorBoards(ctx, ox, oy, x, y, f, base, seam, alt) {
  const L = local(ctx, ox, oy);
  for (let r = 0; r < 4; r++) {
    const by = r * 4;
    const hv = hh(x, y * 4 + r, f + 7);
    const ci = hv < 0.3 ? alt : base;
    const k = (hv - 0.5) * 0.18;
    L.r(tone(ci, k), 0, by, 16, 4);
    L.r(tone(ci, k + 0.14), 0, by, 16, px);
    L.r(tone(seam, -0.25), 0, by + 4 - 2 * px, 16, 2 * px);
    const lo = tone(ci, k - 0.12);
    const hi = tone(ci, k + 0.1);
    const grains = 3 + Math.floor(hh(x, y * 4 + r, 21) * 3);
    for (let g = 0; g < grains; g++) {
      const gy = by + 4 * px + hh(x * 7 + g, y * 4 + r, 11) * (4 - 8 * px);
      const gx = hh(x * 5 + g, y * 4 + r, 12) * 11;
      const gl = 3 + hh(x * 3 + g, y * 4 + r, 13) * 8;
      L.r(lo, gx, gy, gl, px);
      if (g % 2) L.r(hi, gx + 1, gy + 2 * px, gl * 0.6, px);
    }
    const sx = 1.5 + hh(x, y * 4 + r, f + 3) * 12;
    L.r(tone(seam, -0.3), sx, by, 1.5 * px, 4 - 2 * px);
    L.r(hi, sx + 1.5 * px, by + px, px, 4 - 3 * px);
    nail(L, sx - 1.5, by + 1.2);
    nail(L, sx + 1.0, by + 1.2);
    if (hh(x + 11, y * 4 + r, 5) < 0.14) {
      const kx = 2 + hh(x, y, r + 30) * 11;
      L.e(tone(ci, k - 0.3), kx, by + 2, 1.1, 0.8);
      L.e(tone(ci, k - 0.5), kx, by + 2, 0.55, 0.4);
      L.r(lo, kx - 3, by + 0.9, 2, px);
      L.r(lo, kx + 1.3, by + 2.9, 2.4, px);
    }
    if (hh(x + 3, y * 4 + r, 99) < 0.06) L.r(C.SHADOW, hh(x, y, r + 50) * 10, by + 4 - 3 * px, 3 + hh(y, x, r) * 4, 3 * px);
  }
}

// Note: the ground of the scene's terrain, painted by ground.js.
function ground(ctx, map, f, ox, oy, x, y, opts = {}) {
  paintGround(ctx, map, f, ox, oy, x, y, { ...opts, patch: f === 0 ? landmarkPatch(map) : null });
}

// Note: how worn a floor tile is; boards beside a door or the stairs are walked pale.
function wearAt(map, f, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(map, f, x + dx, y + dy);
      if (t === T.DOOR || t === T.STAIRS) n++;
    }
  }
  return Math.min(2, n);
}

// Note: ambient occlusion; a wall darkens the floor along its foot in soft steps.
function paintAO(ctx, map, f, ox, oy, x, y) {
  const L = local(ctx, ox, oy);
  const steps = [0.3, 0.18, 0.09, 0.04];
  const wn = isWall(map, f, x, y - 1);
  const ws = isWall(map, f, x, y + 1);
  const ww = isWall(map, f, x - 1, y);
  const we = isWall(map, f, x + 1, y);
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    const d = i * 0.8;
    if (wn) L.r(tint(C.VOID, a), 0, d, 16, 0.8);
    if (ws) L.r(tint(C.VOID, a * 0.7), 0, 16 - d - 0.8, 16, 0.8);
    if (ww) L.r(tint(C.VOID, a * 0.8), d, 0, 0.8, 16);
    if (we) L.r(tint(C.VOID, a * 0.8), 16 - d - 0.8, 0, 0.8, 16);
  }
}

function baseFor(map, f, x, y) {
  let floorN = 0;
  let porchN = 0;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const t = tileAt(map, f, x + dx, y + dy);
    if (t === T.FLOOR || t === T.RUG) floorN++;
    else if (t === T.PORCH) porchN++;
  }
  return floorN > 0 ? 'floor' : porchN > 0 ? 'porch' : 'sand';
}

function paintBase(ctx, map, kind, ox, oy, x, y, f) {
  const L = local(ctx, ox, oy);
  if (kind === 'floor' || kind === 'porch') {
    if (kind === 'floor') paintFloorBoards(ctx, ox, oy, x, y, f, C.WOOD_L, C.WOOD, C.PLANK);
    else paintFloorBoards(ctx, ox, oy, x, y, f, C.PLANK, C.WOOD_D, C.PLANK_L);
    const wear = wearAt(map, f, x, y);
    if (wear) L.e(tint(C.PLANK_L, 0.1 * wear), 8, 8, 7.4, 5);
    if (hh(x, y, 41) < 0.09) {
      const sx = 3 + hh(x, y, 43) * 10;
      const sy = 3 + hh(x, y, 44) * 10;
      L.e(tint(C.SHADOW, 0.14), sx, sy, 2.2 + hh(x, y, 45) * 2.6, 1.6 + hh(x, y, 46) * 2);
      L.e(tint(C.SHADOW, 0.1), sx + 0.3, sy + 0.2, 1.2, 0.9);
    }
    if (hh(x, y, 47) < 0.14) {
      const sx = 1 + hh(x, y, 48) * 11;
      const sy = 1 + hh(x, y, 49) * 13;
      L.r(tint(C.PLANK_L, 0.3), sx, sy, 3, px);
      L.r(tint(C.PLANK_L, 0.22), sx + 1, sy + 1.2, 2.4, px);
    }
  } else ground(ctx, map, f, ox, oy, x, y);
  paintAO(ctx, map, f, ox, oy, x, y);
}

// Note: a soft drop shadow under furniture, in three growing layers.
function shadow(L, x, y, w, h) {
  L.r(tint(C.VOID, 0.16), x + 1.8, y + 2.6, w, h);
  L.r(tint(C.VOID, 0.14), x + 1.2, y + 1.8, w + 0.4, h + 0.4);
  L.r(tint(C.VOID, 0.1), x + 0.6, y + 1.0, w + 0.8, h + 0.8);
}

function paintWall(ctx, map, f, ox, oy, x, y, kind) {
  const L = local(ctx, ox, oy);
  const north = wallish(map, f, x, y - 1);
  const south = wallish(map, f, x, y + 1);
  const west = wallish(map, f, x - 1, y);
  const east = wallish(map, f, x + 1, y);
  // Note: a regional massive wall of sod, stone or log replaces the adobe courses; map.material is unset for the Cochise look.
  if (kind === T.ADOBE && map.material && map.material !== 'adobe' && paintMaterialWall(L, map.material, x, y, { n: !north, s: !south, w: !west, e: !east })) return;
  if (kind === T.ADOBE) {
    L.r(C.ADOBE, 0, 0, 16, 16);
    for (let i = 0; i < 12; i++) {
      const v = hh(x, y * 12 + i, 2);
      L.e(v < 0.5 ? tint(C.ADOBE_D, 0.3) : tint(C.ADOBE_L, 0.3), hh(x, y * 12 + i, 3) * 16, hh(x, y * 12 + i, 4) * 13, 1.2 + v * 2.4, 0.8 + hh(x, y * 12 + i, 5) * 1.6);
    }
    for (let r = 0; r < 4; r++) {
      L.r(tint(C.ADOBE_D, 0.7), 0, r * 4, 16, px);
      L.r(tint(C.ADOBE_L, 0.35), 0, r * 4 + px, 16, px);
      const off = (r % 2) * 4 + Math.floor(hh(x, y, r) * 3);
      for (let c = off % 8; c < 16; c += 8) {
        L.r(tint(C.ADOBE_D, 0.55), c, r * 4 + 2 * px, px * 1.5, 4 - 2 * px);
      }
    }
    for (let i = 0; i < 16; i++) {
      L.r(hh(x, y, i + 70) < 0.5 ? C.ADOBE_D : C.ADOBE_L, hh(x, y, i + 90) * 15.5, hh(y, x, i + 110) * 11.5, px * 2, px);
    }
    if (hh(x, y, 55) < 0.35) {
      let cx = 2 + hh(x, y, 56) * 12;
      let cy = 0.5;
      for (let i = 0; i < 5; i++) {
        const nx = cx + (hh(x, y, 57 + i) - 0.5) * 3;
        const ny = cy + 1.4 + hh(x, y, 63 + i) * 1.2;
        L.l(tint(C.DARK, 0.7), cx, cy, nx, ny, px);
        cx = nx;
        cy = ny;
        if (cy > 11.5) break;
      }
    }
    if (!north) {
      L.r(tone(C.ADOBE_L, 0.12), 0, 0, 16, 2 * px);
      L.r(C.ADOBE_L, 0, 2 * px, 16, px);
    }
    if (!west) L.r(tint(C.ADOBE_L, 0.7), 0, 0, 2 * px, 16);
    if (!east) L.r(tint(C.ADOBE_D, 0.8), 16 - 2 * px, 0, 2 * px, 16);
    if (!south) {
      L.r(C.ADOBE_D, 0, 12, 16, 4);
      for (let c = 1 + (x % 2) * 3; c < 16; c += 6) L.r(tint(C.DARK, 0.3), c, 12 + px, px * 1.5, 3 - 2 * px);
      L.r(tint(C.DARK, 0.4), 0, 12, 16, px * 2);
      L.r(tint(C.ADOBE_L, 0.4), 0, 12 + 2 * px, 16, px);
      L.r(tint(C.VOID, 0.2), 0, 13.6, 16, 2.4);
      L.r(tint(C.VOID, 0.2), 0, 14.8, 16, 1.2);
      L.r(C.WOOD_D, 0, 15, 16, 1);
    }
  } else if (kind === T.FRAME) {
    L.r(C.PLASTER, 0, 0, 16, 16);
    for (let r = 0; r < 4; r++) {
      const hv = hh(x, y * 4 + r, 17);
      L.r(tone(C.PLASTER, (hv - 0.5) * 0.08), 0, r * 4, 16, 3);
      L.r(C.PLASTER_L, 0, r * 4, 16, px);
      L.r(C.SAND_L, 0, r * 4 + 3, 16, px * 2);
      L.r(tint(C.SAND_D, 0.7), 0, r * 4 + 3 + 2 * px, 16, px);
      for (let g = 0; g < 3; g++) L.r(tint(C.SAND_D, 0.3), hh(x * 3 + g, y * 4 + r, 18) * 12, r * 4 + 1 + g * 0.7, 2 + hh(g, x + r, 19) * 4, px);
      nail(L, 1 + hh(x, y * 4 + r, 20) * 1.5, r * 4 + 1.2);
      nail(L, 13 + hh(x, y * 4 + r, 21) * 1.5, r * 4 + 1.2);
      if (hh(x, y * 4 + r, 22) < 0.2) L.r(tint(C.WOOD, 0.5), hh(x, y, r + 5) * 13, r * 4 + 1, 1.2, 1.2);
    }
    if (!north) {
      L.r(C.PLASTER_L, 0, 0, 16, 2 * px);
      L.r(C.BONE, 0, 0, 16, px);
    }
    if (!west) L.r(tint(C.PLASTER_L, 0.8), 0, 0, 2 * px, 16);
    if (!east) L.r(tint(C.SAND_D, 0.7), 16 - 2 * px, 0, 2 * px, 16);
    if (!south) {
      L.r(C.SAND, 0, 12, 16, 4);
      for (let c = 0; c < 16; c += 3) L.r(tint(C.SAND_D, 0.55), c, 12, px, 3);
      L.r(tint(C.SAND_D, 0.8), 0, 12, 16, px * 2);
      L.r(tint(C.VOID, 0.16), 0, 13.6, 16, 2.4);
      L.r(C.WOOD_D, 0, 15, 16, 1);
    }
  } else {
    L.r(C.WOOD_L, 0, 0, 16, 16);
    for (let c = 0; c < 16; c += 4) {
      const hv = hh(x * 4 + c, y, 23);
      L.r(tone(C.WOOD_L, (hv - 0.5) * 0.14), c, 0, 4, 16);
      L.r(C.WOOD, c, 0, px * 1.5, 16);
      L.r(tint(C.PLANK_L, 0.5), c + 2 * px, 0, px, 16);
      for (let g = 0; g < 3; g++) L.r(tint(C.WOOD_D, 0.35), c + 1 + g * 0.8, hh(c + g, y + x, 24) * 11, px, 2 + hh(g, c + x, 25) * 4);
      nail(L, c + 1.2, 1);
      nail(L, c + 1.2, 12.8);
    }
    if (!north) {
      L.r(C.PLANK, 0, 0, 16, 2 * px);
      L.r(C.PLANK_L, 0, 0, 16, px);
    }
    if (!south) {
      L.r(C.WOOD, 0, 12, 16, 4);
      for (let c = 0; c < 16; c += 4) L.r(C.WOOD_D, c, 12, px * 1.5, 4);
      L.r(tint(C.VOID, 0.2), 0, 13.6, 16, 2.4);
      L.r(C.WOOD_D, 0, 15, 16, 1);
    }
  }
}

// Note: the closed leaf in door-local units, a along the wall from the hinge end and b across; it is also the texture the moving leaf wears.
export function doorLeaf(ctx, ox, oy, hor, locked) {
  const t = (a, b, w, h) => (hor ? [a, b, w, h] : [b, a, h, w]);
  const R = (col, a, b, w, h) => {
    const [rx, ry, rw, rh] = t(a, b, w, h);
    P.rect(ctx, col, ox + rx, oy + ry, rw, rh);
  };
  R(C.WOOD_D, 0, 0, 16, 16);
  R(tone(C.WOOD, -0.1), 1.2, 1.2, 13.6, 13.6);
  R(C.WOOD_L, 1.2, 1.2, 13.6, px);
  R(C.WOOD_L, 1.2, 1.2, px, 13.6);
  // Note: four raised panels, each a bevelled inset.
  for (const [pa, pb] of [[2.6, 2.6], [8.6, 2.6], [2.6, 8.8], [8.6, 8.8]]) {
    const w = 4.8;
    const h = 4.6;
    R(tone(C.WOOD, -0.22), pa, pb, w, h);
    R(tone(C.WOOD, 0.04), pa + 2 * px, pb + 2 * px, w - 4 * px, h - 4 * px);
    R(tone(C.WOOD, -0.3), pa, pb, w, px);
    R(tone(C.WOOD, -0.3), pa, pb, px, h);
    R(tone(C.PLANK, 0.1), pa + 2 * px, pb + h - 3 * px, w - 4 * px, px);
    R(tone(C.PLANK, 0.1), pa + w - 3 * px, pb + 2 * px, px, h - 4 * px);
    for (let g = 0; g < 3; g++) R(tint(C.WOOD_D, 0.4), pa + 2 * px + g * 1.4, pb + 3 * px, px, h - 6 * px);
  }
  for (let g = 0; g < 4; g++) R(tint(C.WOOD_D, 0.5), 1.4 + g * 3.4, 7.6, 2.2, px);
  // Note: iron hinges on the hinge end.
  for (const hb of [2.3, 12.2]) {
    R(C.IRON, 0.2, hb, 3, 1.6);
    R(C.IRON_L, 0.2, hb, 3, px);
    R(C.DARK, 0.2, hb + 1.6 - px, 3, px);
    R(C.IRON_L, 2.1, hb + 0.55, 0.7, 0.5);
    R(C.IRON_L, 0.6, hb + 0.55, 0.7, 0.5);
  }
  if (locked) {
    R(C.IRON, 10.2, 5.4, 4.4, 5.4);
    R(C.IRON_L, 10.2, 5.4, 4.4, px);
    R(C.DARK, 10.2, 10.8 - px, 4.4, px);
    R(C.IRON_L, 10.5, 5.7, px, px);
    R(C.IRON_L, 14.0, 5.7, px, px);
    R(C.GOLD_L, 12.0, 6.9, 1.0, 1.2);
    R(C.DARK, 12.2, 8.1, 0.6, 1.4);
  } else {
    R(C.IRON, 12.2, 6.4, 1.8, 3.2);
    R(C.IRON_L, 12.2, 6.4, 1.8, px);
    R(C.GOLD_L, 12.6, 7.6, 1.2, 1.2);
    R(C.GOLD, 12.9, 7.9, 0.7, 0.7);
    R(C.BONE, 12.7, 7.6, px, px);
  }
}

function paintDoor(ctx, map, f, ox, oy, x, y, state) {
  const hor = horizontal(map, f, x, y);
  const t = (a, b, w, h) => (hor ? [a, b, w, h] : [b, a, h, w]);
  const R = (col, a, b, w, h) => {
    const [rx, ry, rw, rh] = t(a, b, w, h);
    P.rect(ctx, col, ox + rx, oy + ry, rw, rh);
  };
  if (state === DS.CLOSED || state === DS.LOCKED) {
    doorLeaf(ctx, ox, oy, hor, state === DS.LOCKED);
    return;
  }
  paintFloorBoards(ctx, ox, oy, x, y, f, C.WOOD_L, C.WOOD, C.PLANK);
  // Note: door frame stubs at both ends of the opening.
  for (const a of [0, 14.8]) {
    R(C.WOOD_D, a, 0, 1.2, 2.2);
    R(C.WOOD_D, a, 13.8, 1.2, 2.2);
    R(C.WOOD, a + (a ? 0 : 0.8), 0, px * 1.5, 2.2);
  }
  R(tint(C.VOID, 0.25), 0, 2.2, 16, px * 2);
  R(tint(C.VOID, 0.25), 0, 13.8 - px * 2, 16, px * 2);
  if (state === DS.OPEN || state === EMPTY) {
    // Note: the open leaf is swung against the hinge side, seen edge-on.
    if (state === DS.OPEN) {
      R(C.WOOD, 0, 2.2, 2, 11.6);
      R(C.WOOD_L, 0, 2.2, px * 2, 11.6);
      R(C.WOOD_D, 2 - px, 2.2, px * 1.5, 11.6);
      R(C.IRON, 0, 3, 2, 1.2);
      R(C.IRON, 0, 11.8, 2, 1.2);
      R(C.GOLD, 1, 8.5, 1, 1);
      R(tint(C.VOID, 0.3), 2, 2.4, 1.2, 11.2);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const a = Math.floor(hh(x, y, i) * 13) + 1;
      const b = hh(y, x, i + 3) < 0.5 ? hh(i, x, y) * 3 : 13 + hh(i, y, x) * 2.6;
      const w = 1 + (i % 3) * 1.1;
      R(i % 3 === 0 ? C.WOOD_D : C.WOOD, a, b, w, 0.8);
      R(tint(C.PLANK_L, 0.5), a, b, w, px);
    }
    R(C.WOOD, 0, 3, 2, 5.5);
    R(C.WOOD_L, 0, 3, px * 2, 5.5);
    R(C.IRON, 0.6, 5, 0.9, 0.9);
    R(C.WOOD_D, 0.4, 3, 1.8, px);
  }
}

// Note: the glass of a window as a pane in window-local units; the sash image in fx.js wears the same art.
export function windowPane(ctx, ox, oy, hor, bolted, h = 8) {
  const R = (col, a, b, w, hh2) => (hor ? P.rect(ctx, col, ox + a, oy + b, w, hh2) : P.rect(ctx, col, ox + b, oy + a, hh2, w));
  const G = (col, pts) => P.poly(ctx, col, pts.map(([a, b]) => (hor ? [ox + a, oy + b] : [ox + b, oy + a])));
  R(C.GLASS, 2, 4, 12, h);
  R(tone(C.GLASS, 0.1), 2, 4, 12, h * 0.45);
  R(tone(C.GLASS, -0.14), 2, 4 + h - 1.6, 12, 1.6);
  if (h > 5) {
    G(tint(C.GLASS_L, 0.55), [[3.2, 11.6], [5.4, 4.4], [6.6, 4.4], [4.4, 11.6]]);
    G(tint(C.GLASS_L, 0.35), [[7.2, 11.6], [8.6, 7.4], [9.4, 7.4], [8.0, 11.6]]);
    R(C.BONE, 3.6, 5.0, 0.7, 0.5);
    R(C.WOOD_D, 7.2, 4, 1.6, h);
    R(C.WOOD, 7.2, 4, px, h);
    R(C.WOOD_D, 2, 7.2, 12, 1.6);
    R(C.WOOD, 2, 7.2, 12, px);
    if (bolted) {
      R(C.IRON, 6, 7, 4, 2);
      R(C.IRON_L, 6, 7, 4, px);
      R(C.IRON_L, 7, 7.5, 2, 0.6);
      R(C.DARK, 6, 9 - px, 4, px);
    }
  } else {
    R(C.WOOD_D, 2, 4 + h, 12, 1);
    R(C.WOOD, 2, 4 + h, 12, px);
  }
}

function paintWindow(ctx, map, f, ox, oy, x, y, state) {
  const wall = wallKind(map, f, x, y);
  if (!paintThemeWindowWall(ctx, map, f, x, y, wall)) paintWall(ctx, map, f, ox, oy, x, y, wall);
  const hor = horizontal(map, f, x, y);
  const R = (col, a, b, w, h) => (hor ? P.rect(ctx, col, ox + a, oy + b, w, h) : P.rect(ctx, col, ox + b, oy + a, h, w));
  const G = (col, pts) => P.poly(ctx, col, pts.map(([a, b]) => (hor ? [ox + a, oy + b] : [ox + b, oy + a])));
  R(tone(C.WOOD_D, -0.1), 0.6, 2.4, 14.8, 11);
  R(C.WOOD, 1, 2.8, 14, px);
  R(C.WOOD, 1, 2.8, px, 10.2);
  R(C.WOOD_D, 1.4, 3.2, 13.2, 9.6);
  // Note: the sill is a lit ledge under the frame, with a shadow beneath.
  R(C.PLASTER_L, 0.3, 13.4, 15.4, 1.2);
  R(C.BONE, 0.3, 13.4, 15.4, px);
  R(tint(C.VOID, 0.35), 0.3, 14.6, 15.4, 0.8);
  if (state === EMPTY) {
    R(C.SHADOW, 2, 4, 12, 8);
  } else if (state === WS.CLOSED || state === WS.BOLTED) {
    windowPane(ctx, ox, oy, hor, state === WS.BOLTED);
  } else if (state === WS.OPEN) {
    R(C.SHADOW, 2, 4, 12, 8);
    R(C.GLASS, 2, 4, 12, 3);
    R(tone(C.GLASS, 0.1), 2, 4, 12, 1.2);
    G(tint(C.GLASS_L, 0.5), [[3.2, 6.8], [4.8, 4.2], [5.8, 4.2], [4.2, 6.8]]);
    R(C.WOOD_D, 2, 6.8, 12, 1);
    R(C.WOOD, 2, 6.8, 12, px);
    R(C.PLASTER_L, 11, 8, 3, 4);
    R(C.BONE, 11, 8, 3, px);
    R(tint(C.SAND_D, 0.7), 11, 8 + 4 - px * 2, 3, px * 2);
  } else {
    R(C.SHADOW, 2, 4, 12, 8);
    // Note: shards stick out of the frame like teeth.
    G(C.GLASS_L, [[2, 4], [6.6, 4], [4.2, 7.4]]);
    G(C.GLASS, [[7.2, 4], [11, 4], [9, 6.2]]);
    G(C.GLASS_L, [[11.4, 4], [14, 4], [14, 8.4]]);
    G(C.GLASS_L, [[2, 12], [3.6, 9.2], [5.4, 12]]);
    G(C.GLASS, [[8, 12], [9.6, 9.8], [11.6, 12]]);
    G(C.GLASS_L, [[12.2, 12], [14, 10], [14, 12]]);
    R(C.WOOD_D, 7, 6, 1.4, 4.6);
    R(C.BONE, 4.8, 5.2, px, px);
  }
}

// Note: the flight is ten treads over two tiles, five on each; part 0 is the south tile (the foot), part 1 the north one (the head).
// Note: downstairs the treads rise under the ceiling and lighten as they climb; upstairs the same treads fall away from the floor edge into the dark.
function paintFlight(ctx, up, ox, oy, part) {
  const L = local(ctx, ox, oy);
  L.r(C.SHADOW, 0, 0, 16, 16);
  for (let i = 0; i < 5; i++) {
    const y = 13 - i * 3;
    const rise = (part * 5 + i) / 9;
    const depth = ((1 - part) * 5 + (4 - i)) / 9;
    const tread = up ? tone(C.WOOD, -0.3 + 0.55 * rise) : tone(C.WOOD, -0.12 - 0.6 * depth);
    L.r(tread, 1.2, y, 13.6, 2.3);
    L.r(up ? tone(C.PLANK_L, -0.12 + 0.2 * rise) : tone(C.PLANK_L, -0.3 - 0.5 * depth), 1.2, y, 13.6, px);
    for (let g = 0; g < 3; g++) L.r(tint(C.WOOD_D, 0.4), 1.8 + hh(i, g + part * 7, 5) * 6, y + 0.7 + g * 0.5, 3 + hh(g, i + part * 7, 6) * 5, px);
    L.r(up ? tone(C.WOOD_D, 0.05 + 0.15 * rise) : tone(C.WOOD_D, -0.2 - 0.5 * depth), 1.2, y + 2.3, 13.6, 0.7);
    L.r(tint(C.VOID, 0.35), 1.2, y + 3 - px, 13.6, px);
    if (!up) L.r(tint(C.VOID, 0.05 + 0.5 * depth), 1.2, y, 13.6, 3);
  }
  // Note: upstairs the north edge of the run is the floor edge, with a lit nosing board over the drop.
  if (!up && part === 1) {
    L.r(C.PLANK_L, 0, 0, 16, 1.4);
    L.r(tone(C.PLANK_L, 0.2), 0, 0, 16, px);
    L.r(tint(C.VOID, 0.45), 0, 1.4, 16, 1.2);
  }
  for (const sx of [0, 14.8]) {
    L.r(C.WOOD_D, sx, 0, 1.2, 16);
    L.r(tone(C.WOOD_D, 0.18), sx + (sx ? 0 : 1.2 - px), 0, px, 16);
  }
  L.r(tint(C.VOID, up ? 0.12 : 0.3), 1.2, 0, 2.2, 16);
}

// Note: a rail is a thin wooden balustrade on the tile edge that faces the flight, exactly as wide as the strip that blocks; the rest of the tile is open floor.
function paintRail(ctx, map, f, ox, oy, x, y) {
  const L = local(ctx, ox, oy);
  const t = RAIL_T * 16;
  const strip = railStrip(map, f, x, y);
  const side = strip ? strip.side : 'n';
  if (side === 'w' || side === 'e') {
    const x0 = side === 'w' ? 0 : 16 - t;
    if (side === 'w') {
      L.r(tint(C.VOID, 0.18), t, 0, 2.2, 16);
      L.r(tint(C.VOID, 0.1), t + 2.2, 0, 1.4, 16);
    }
    L.r(C.WOOD, x0, 0, t, 16);
    L.r(C.WOOD_L, side === 'w' ? x0 : x0 + t - 0.9, 0, 0.9, 16);
    for (let p = 1; p < 16; p += 5) {
      L.r(C.WOOD_D, x0, p, t, 1.6);
      L.r(C.PLANK_L, x0 + 0.2, p, t - 0.6, px);
    }
    return;
  }
  const y0 = side === 's' ? 16 - t : 0;
  if (side === 'n') {
    L.r(tint(C.VOID, 0.2), 0, t, 16, 2.2);
    L.r(tint(C.VOID, 0.1), 0, t + 2.2, 16, 1.4);
  }
  L.r(C.WOOD, 0, y0, 16, t);
  L.r(C.WOOD_L, 0, side === 's' ? y0 : y0 + t - 0.9, 16, 0.9);
  for (let p = 1; p < 16; p += 5) {
    L.r(C.WOOD_D, p, y0, 1.6, t);
    L.r(C.PLANK_L, p + 0.2, y0 + 0.2, px, t - 0.6);
  }
}

function paintFurniture(ctx, map, f, ox, oy, x, y, tile) {
  const base = baseFor(map, f, x, y);
  const kind = tile === T.FENCE || tile === T.POST || tile === T.CACTUS ? (base === 'porch' ? 'porch' : 'sand') : base;
  // Note: outdoors an object stands on the ground around it; a house has only sand underfoot.
  if (kind === 'sand' && !sandUnder(map, f, x, y)) ground(ctx, map, f, ox, oy, x, y);
  else paintBase(ctx, map, kind, ox, oy, x, y, f);
  const L = local(ctx, ox, oy);
  const v = hh(x, y, 77);
  switch (tile) {
    case T.RAIL: paintRail(ctx, map, f, ox, oy, x, y); break;
    case T.TABLE: {
      shadow(L, 1, 1, 14, 14);
      L.r(tone(C.WOOD_D, -0.15), 1, 1, 14, 14);
      L.r(C.PLANK, 1.8, 1.8, 12.4, 12.4);
      for (let b = 0; b < 3; b++) {
        L.r(tone(C.PLANK, (hh(x, y, 80 + b) - 0.5) * 0.14), 1.8, 1.8 + b * 4.13, 12.4, 4.13);
        L.r(C.WOOD, 1.8, 1.8 + b * 4.13 + 4.13 - px, 12.4, px);
        for (let g = 0; g < 3; g++) L.r(tint(C.WOOD, 0.45), 2.6 + hh(x + g, y + b, 83) * 5, 2.6 + b * 4.13 + g * 1.1, 3 + hh(g, b + x, 84) * 5, px);
      }
      L.r(C.PLANK_L, 1.8, 1.8, 12.4, px * 2);
      L.r(C.PLANK_L, 1.8, 1.8, px * 2, 12.4);
      L.r(C.WOOD_D, 1.8, 14.2 - px, 12.4, px);
      if (v < 0.4) {
        L.r(C.PLASTER_L, 3, 3.4, 10, 9.2);
        for (let i = 0; i < 5; i++) {
          L.r(C.RED, 3, 3.4 + i * 2, 10, 0.9);
          L.r(C.RED, 3 + i * 2, 3.4, 0.9, 9.2);
        }
        L.r(tint(C.RED_D, 0.5), 3, 12.6 - px, 10, px);
      }
      L.e(tint(C.VOID, 0.3), 5.4, 5.5, 1.9, 1.9);
      L.e(C.BONE, 5, 5, 1.9, 1.9);
      L.e(C.PLASTER_L, 5, 5, 1.2, 1.2);
      L.r(C.STONE_L, 4.2, 4.2, px * 2, px);
      L.e(tint(C.VOID, 0.35), 11.4, 10.4, 1.5, 1.5);
      L.e(C.STONE_L, 11, 10, 1.3, 1.3);
      L.e(C.DARK, 11, 10, 0.8, 0.8);
      L.r(C.STONE, 12.1, 9.4, 1.1, 1.2);
      L.r(C.BONE, 10.2, 9.2, px * 2, px);
      break;
    }
    case T.CHAIR: {
      const side = Math.floor(v * 4);
      shadow(L, 3.6, 3.6, 8.8, 8.8);
      L.r(C.WOOD_D, 4, 4, 8, 8);
      L.r(C.WOOD, 4.5, 4.5, 7, 7);
      L.r(C.WOOD_L, 5, 5, 6, 6);
      for (let g = 0; g < 3; g++) L.r(tint(C.WOOD, 0.5), 5.4, 6 + g * 2, 5.2, px);
      L.r(C.PLANK, 5, 5, 6, px);
      for (const [cx, cy] of [[4, 4], [11, 4], [4, 11], [11, 11]]) L.r(C.DARK, cx, cy, 1, 1);
      if (side === 0) {
        L.r(C.WOOD_D, 3.6, 2.8, 8.8, 2);
        for (let s = 0; s < 4; s++) L.r(C.WOOD, 4.4 + s * 2.4, 3, px * 2, 1.4);
      } else if (side === 1) {
        L.r(C.WOOD_D, 3.6, 11.2, 8.8, 2);
        for (let s = 0; s < 4; s++) L.r(C.WOOD, 4.4 + s * 2.4, 11.6, px * 2, 1.4);
      } else if (side === 2) {
        L.r(C.WOOD_D, 2.8, 3.6, 2, 8.8);
        for (let s = 0; s < 4; s++) L.r(C.WOOD, 3, 4.4 + s * 2.4, 1.4, px * 2);
      } else {
        L.r(C.WOOD_D, 11.2, 3.6, 2, 8.8);
        for (let s = 0; s < 4; s++) L.r(C.WOOD, 11.6, 4.4 + s * 2.4, 1.4, px * 2);
      }
      break;
    }
    case T.BED: {
      shadow(L, 1, 1, 14, 14);
      L.r(C.WOOD_D, 1, 1, 14, 14);
      L.r(C.WOOD, 1, 1, 14, 1.6);
      L.r(C.WOOD_L, 1, 1, 14, px);
      L.r(C.PLASTER_L, 2, 2.6, 12, 11.4);
      L.r(tint(C.SAND_D, 0.4), 2, 2.6, 12, px);
      L.e(tint(C.VOID, 0.18), 5.6, 4.9, 3.5, 1.9);
      L.e(C.BONE, 5.4, 4.6, 3.5, 1.9);
      L.e(C.PLASTER_L, 5.2, 4.3, 2.4, 1.1);
      L.r(tint(C.SAND_D, 0.55), 5.4, 4.7, 3, px);
      L.e(tint(C.VOID, 0.18), 10.6, 4.9, 2.6, 1.9);
      L.e(C.BONE, 10.4, 4.6, 2.6, 1.9);
      const bc = v < 0.5 ? C.RED : C.BLUE;
      const bl = v < 0.5 ? C.RED_L : C.BLUE;
      const bd = v < 0.5 ? C.RED_D : C.BLUE_D;
      L.r(bc, 2, 7.2, 12, 6.8);
      L.r(bl, 2, 7.2, 12, 1.1);
      L.r(bd, 2, 8.3, 12, px * 2);
      for (let s = 0; s < 4; s++) L.r(bd, 2 + s * 3.2, 9.4, 1.4, 4.4);
      for (let s = 0; s < 3; s++) L.r(C.GOLD, 3.6 + s * 3.4, 10.4, px * 2, px * 2);
      L.r(tint(C.VOID, 0.2), 2, 13.4, 12, 0.6);
      L.g(tint(C.VOID, 0.14), [[2, 8.4], [8, 8.8], [4, 11], [2, 12]]);
      L.r(C.WOOD_D, 1, 13.4, 14, 1.6);
      L.r(C.WOOD, 1, 13.4, 14, px);
      for (const [px0, py0] of [[1, 1], [13.6, 1], [1, 13.6], [13.6, 13.6]]) {
        L.r(C.WOOD_D, px0, py0, 1.4, 1.4);
        L.r(C.WOOD_L, px0, py0, 1.4, px);
      }
      break;
    }
    case T.WARDROBE:
      shadow(L, 1, 1, 14, 14);
      L.r(tone(C.WOOD_D, -0.1), 1, 1, 14, 14);
      L.r(C.WOOD, 1.8, 1.8, 12.4, 12.4);
      L.r(C.WOOD_L, 1.8, 1.8, 12.4, px * 2);
      L.r(C.WOOD_L, 1.8, 1.8, px * 2, 12.4);
      for (const lx of [0, 6.6]) {
        L.r(tone(C.WOOD, -0.14), 2.6 + lx, 3, 5, 10);
        L.r(tone(C.WOOD, 0.06), 3 + lx, 3.4, 4.2, 9.2);
        L.r(tone(C.WOOD, -0.3), 2.6 + lx, 3, 5, px);
        for (let g = 0; g < 4; g++) L.r(tint(C.WOOD_D, 0.4), 3.4 + lx + g * 1.0, 4, px, 7 - (g % 2));
      }
      L.r(C.WOOD_D, 7.6, 2.4, 0.9, 11.2);
      L.r(C.IRON, 2.2, 3.4, 0.8, 1.4);
      L.r(C.IRON, 2.2, 11, 0.8, 1.4);
      L.e(C.GOLD, 6.3, 8.6, 0.8, 1.1);
      L.e(C.GOLD, 9.7, 8.6, 0.8, 1.1);
      L.r(C.GOLD_L, 6.0, 8.1, px, px);
      L.r(C.GOLD_L, 9.4, 8.1, px, px);
      L.r(C.WOOD_D, 1.8, 14.2 - px, 12.4, px);
      break;
    case T.COUNTER:
      shadow(L, 0, 0, 16, 15);
      L.r(C.WOOD_D, 0, 0, 16, 15);
      L.r(C.PLANK_L, 0.8, 0.8, 14.4, 11.6);
      for (let b = 0; b < 3; b++) {
        L.r(tone(C.PLANK_L, (hh(x, y, 90 + b) - 0.5) * 0.1), 0.8, 0.8 + b * 3.9, 14.4, 3.9);
        L.r(C.PLANK, 0.8, 4.7 + b * 3.9 - px, 14.4, px * 1.5);
        for (let g = 0; g < 3; g++) L.r(tint(C.PLANK, 0.5), 1.6 + hh(x + g, y + b, 93) * 8, 1.6 + b * 3.9 + g * 1, 3 + hh(g, b + y, 94) * 4, px);
      }
      L.r(C.BONE, 0.8, 0.8, 14.4, px);
      L.r(C.WOOD_D, 0.8, 12.4, 14.4, 2);
      L.r(C.WOOD, 0.8, 12.4, 14.4, px);
      for (let i = 1; i < 4; i++) L.r(tint(C.VOID, 0.3), i * 4, 12.8, px, 1.4);
      L.e(tint(C.VOID, 0.3), 5.4, 5.6, 2, 2);
      L.e(C.STONE_L, 5, 5, 2, 2);
      L.e(C.DARK, 5, 5, 1.3, 1.3);
      L.r(C.STONE, 6.8, 4.4, 1.6, 1.4);
      L.r(C.BONE, 4.2, 4.0, px * 2, px);
      L.r(tint(C.VOID, 0.3), 9.4, 9.6, 4.4, 2.2);
      L.r(C.PLASTER_L, 9, 9, 4.4, 2.2);
      L.r(C.RED_D, 9, 9, 1, 2.2);
      L.r(C.IRON, 9, 9 + 2.2 - px, 4.4, px);
      for (let i = 0; i < 3; i++) L.r(C.SAND_D, 10.4, 9.5 + i * 0.6, 2.6, px);
      L.e(C.GREEN_D, 13, 3.4, 1.1, 1.1);
      L.e(C.GREEN, 12.8, 3.2, 0.7, 0.7);
      L.r(C.GLASS_L, 12.5, 2.8, px, px);
      break;
    case T.STOVE:
      shadow(L, 1, 1, 14, 14);
      L.r(C.DARK, 1, 1, 14, 14);
      L.r(C.IRON, 1.6, 1.6, 12.8, 12.8);
      L.r(C.IRON_L, 1.6, 1.6, 12.8, px * 2);
      L.r(C.IRON_L, 1.6, 1.6, px * 2, 12.8);
      for (const bx of [5.2, 10.8]) {
        L.e(C.DARK, bx, 5.2, 3.2, 3.2);
        L.e(C.IRON_L, bx, 5.2, 2.5, 2.5);
        L.e(C.IRON, bx, 5.2, 2.0, 2.0);
        L.e(C.DARK, bx, 5.2, 0.8, 0.8);
        L.r(C.IRON_L, bx - 1.4, 4.0, px * 2, px);
      }
      L.r(C.DARK, 3.4, 9.6, 9.2, 3.6);
      L.r(C.RED_D, 4, 10.2, 8, 2.4);
      L.r(C.RED, 5, 10.7, 3, 1.3);
      L.r(C.GOLD, 8.2, 11, 2, px * 2);
      L.r(C.IRON_L, 3.4, 9.6, 9.2, px);
      L.e(C.DARK, 13.2, 2.8, 1.5, 1.5);
      L.e(C.IRON, 13.2, 2.8, 1.1, 1.1);
      L.e(C.IRON_L, 13, 2.6, 0.5, 0.5);
      for (const [rx, ry] of [[2.2, 2.2], [13, 13], [2.2, 13]]) L.r(C.IRON_L, rx, ry, px * 2, px * 2);
      L.r(tint(C.VOID, 0.35), 1.6, 13.4, 12.8, 1);
      break;
    case T.SHELF:
      shadow(L, 0, 0, 16, 14);
      L.r(C.WOOD_D, 0, 0, 16, 14);
      for (let r = 0; r < 3; r++) {
        const sy = 1 + r * 4.2;
        L.r(C.DARK, 1, sy, 14, 3.2);
        L.r(tint(C.VOID, 0.3), 1, sy, 14, 1);
        let cx = 1.4;
        for (let c = 0; c < 5 && cx < 13.6; c++) {
          const k = hh(x + c, y + r, 3);
          const w = 1.2 + hh(x + c, y + r, 4) * 1.6;
          const col = [C.RED, C.BLUE, C.GOLD, C.GREEN, C.BONE, C.RED_D][Math.floor(k * 6)];
          if (k > 0.66) {
            L.e(col, cx + w / 2, sy + 2, w / 2, 1.1);
            L.r(C.STONE_L, cx + 0.3, sy + 1.2, px * 1.5, px);
          } else {
            L.r(col, cx, sy + 0.6, w, 2.6);
            L.r(tone(C.BONE, 0.2), cx, sy + 0.6, px, 2.6);
            L.r(tint(C.VOID, 0.35), cx + w - px, sy + 0.6, px, 2.6);
          }
          cx += w + 0.5 + hh(x + c, y + r, 6) * 0.5;
        }
        L.r(C.WOOD, 0.6, sy + 3.2, 14.8, 0.9);
        L.r(C.PLANK, 0.6, sy + 3.2, 14.8, px);
      }
      L.r(C.WOOD_L, 0, 0, 16, px);
      break;
    case T.BARREL: {
      L.e(tint(C.VOID, 0.26), 9, 9, 7, 7);
      L.e(C.WOOD_D, 8, 8, 7, 7);
      L.e(C.IRON, 8, 8, 6.4, 6.4);
      L.e(tone(C.IRON, -0.25), 8, 8, 6.0, 6.0);
      L.e(C.WOOD, 8, 8, 5.7, 5.7);
      L.e(C.IRON_L, 8, 8, 4.7, 4.7);
      L.e(C.WOOD_L, 8, 8, 4.3, 4.3);
      for (let s = -2; s <= 2; s++) {
        const ex = 8 + s * 1.5;
        const hy = Math.sqrt(Math.max(0, 4.3 * 4.3 - (s * 1.5) ** 2));
        L.r(s % 2 ? tone(C.WOOD_L, -0.08) : tone(C.WOOD_L, 0.05), ex - 0.7, 8 - hy, 1.5, hy * 2);
        L.r(C.WOOD, ex - 0.75, 8 - hy, px * 1.5, hy * 2);
      }
      L.e(C.WOOD_D, 9.6, 6.6, 0.7, 0.7);
      L.e(C.DARK, 9.6, 6.6, 0.4, 0.4);
      for (const a of [0.5, 2.0, 3.6, 5.2]) L.r(C.IRON_L, 8 + Math.cos(a) * 5.1, 8 + Math.sin(a) * 5.1, px * 2, px * 2);
      L.r(tint(C.PLANK_L, 0.7), 4.6, 4.8, 2.2, px);
      L.r(tint(C.PLANK_L, 0.5), 4.2, 5.6, px, 1.6);
      L.r(C.IRON_L, 3.0, 3.6, 2.4, px);
      break;
    }
    case T.CRATE: {
      shadow(L, 1, 1, 14, 14);
      L.r(tone(C.WOOD_D, -0.15), 1, 1, 14, 14);
      L.r(C.PLANK_L, 1.8, 1.8, 12.4, 12.4);
      for (let b = 0; b < 4; b++) {
        L.r(tone(C.PLANK_L, (hh(x, y, 100 + b) - 0.5) * 0.14), 1.8, 1.8 + b * 3.1, 12.4, 2.8);
        L.r(C.WOOD_D, 1.8, 1.8 + b * 3.1 + 2.8, 12.4, 0.3);
        for (let g = 0; g < 2; g++) L.r(tint(C.PLANK, 0.5), 2.6 + hh(x + g, y + b, 103) * 6, 2.5 + b * 3.1 + g, 3 + hh(g, b + y, 104) * 4, px);
      }
      L.l(C.WOOD, 2.6, 2.6, 13.4, 13.4, 1.6);
      L.l(C.PLANK, 2.6, 2.4, 13.4, 13.2, px * 1.5);
      L.l(C.WOOD, 13.4, 2.6, 2.6, 13.4, 1.6);
      L.l(C.PLANK, 13.4, 2.4, 2.6, 13.2, px * 1.5);
      for (const [nx, ny] of [[2.2, 2.2], [13, 2.2], [2.2, 13], [13, 13], [7.6, 7.6]]) nail(L, nx, ny);
      L.r(tint(C.RED_D, 0.7), 5.4, 6.2, 1.1, 1.8);
      L.r(tint(C.RED_D, 0.7), 7.0, 6.2, 1.4, px * 2);
      L.r(tint(C.RED_D, 0.7), 7.0, 7.2, 1.4, px * 2);
      L.r(tint(C.RED_D, 0.7), 8.8, 6.2, 1.1, 1.8);
      break;
    }
    case T.FENCE: {
      const hor = tileAt(map, f, x - 1, y) === T.FENCE || tileAt(map, f, x + 1, y) === T.FENCE || tileAt(map, f, x - 1, y) === T.POST || tileAt(map, f, x + 1, y) === T.POST;
      // Note: a rail with a whitewashed picket every four units; the vertical fence is the same art turned a quarter.
      if (hor) {
        L.r(tint(C.VOID, 0.28), 0, 8.4, 16, 2.6);
        L.r(C.PLASTER, 0, 6, 16, 2.6);
        L.r(C.PLASTER_L, 0, 6, 16, px * 2);
        L.r(tint(C.SAND_D, 0.8), 0, 8.6 - px * 2, 16, px * 2);
        for (let c = 0.8; c < 16; c += 4) {
          L.r(tint(C.VOID, 0.25), c + 1.4, 5.4, 2.2, 6.6);
          L.r(C.PLASTER, c, 4, 2.2, 7);
          L.r(C.PLASTER_L, c, 4, px * 2, 7);
          L.r(tint(C.SAND_D, 0.8), c + 2.2 - px * 2, 4, px * 2, 7);
          L.g(C.PLASTER, [[c, 4], [c + 1.1, 2.8], [c + 2.2, 4]]);
          L.g(C.PLASTER_L, [[c, 4], [c + 1.1, 2.8], [c + 1.1, 4]]);
          if (hh(x, c, 107) < 0.4) L.r(tint(C.WOOD, 0.7), c + 0.5, 5 + hh(c, x, 108) * 4, 1, 1.4);
          nail(L, c + 0.1, 6.8);
        }
      } else {
        L.r(tint(C.VOID, 0.28), 8.4, 0, 2.6, 16);
        L.r(C.PLASTER, 6, 0, 2.6, 16);
        L.r(C.PLASTER_L, 6, 0, px * 2, 16);
        L.r(tint(C.SAND_D, 0.8), 8.6 - px * 2, 0, px * 2, 16);
        for (let c = 0.8; c < 16; c += 4) {
          L.r(tint(C.VOID, 0.25), 5.4, c + 1.4, 6.6, 2.2);
          L.r(C.PLASTER, 4, c, 7, 2.2);
          L.r(C.PLASTER_L, 4, c, 7, px * 2);
          L.r(tint(C.SAND_D, 0.8), 4, c + 2.2 - px * 2, 7, px * 2);
          nail(L, 6.8, c + 0.1);
        }
      }
      break;
    }
    case T.POST:
      L.r(tint(C.VOID, 0.25), 0, 7.4, 16, 3);
      L.r(C.WOOD, 0, 6, 16, 3);
      L.r(C.PLANK, 0, 6, 16, px * 2);
      L.r(C.WOOD_D, 0, 9 - px * 2, 16, px * 2);
      for (let g = 0; g < 5; g++) L.r(tint(C.WOOD_D, 0.5), hh(x, g, 110) * 13, 7 + (g % 3) * 0.7, 2 + hh(g, x, 111) * 3, px);
      L.e(tint(C.VOID, 0.3), 9, 9, 3.4, 3.4);
      L.e(C.WOOD_D, 8, 8, 3.4, 3.4);
      L.e(C.WOOD, 8, 8, 2.8, 2.8);
      L.e(C.WOOD_L, 8, 8, 2.1, 2.1);
      L.e(C.WOOD, 8, 8, 1.2, 1.2);
      L.e(C.WOOD_D, 8, 8, 0.5, 0.5);
      L.r(C.PLANK_L, 6.4, 6.4, 1.2, px);
      break;
    case T.SOFA:
      shadow(L, 0, 1, 16, 14);
      L.r(C.RED_D, 0, 1, 16, 14);
      L.r(tone(C.RED_D, 0.12), 0, 1, 16, px);
      L.r(tone(C.RED_D, -0.2), 0, 1, 16, 3.6);
      for (let b = 0; b < 4; b++) L.e(C.GOLD, 2 + b * 4, 2.8, 0.45, 0.45);
      L.r(C.RED, 1.4, 5, 13.2, 9.4);
      L.r(C.RED_L, 1.4, 5, 13.2, 1.2);
      for (const cx of [1.4, 8.2]) {
        L.r(C.RED, cx, 5.4, 6.4, 8.6);
        L.r(tone(C.RED, 0.12), cx + 0.4, 5.8, 5.6, 1);
        L.r(tint(C.VOID, 0.3), cx, 5.2, px * 1.5, 8.8);
        L.r(tint(C.RED_D, 0.9), cx + 6.4 - px * 2, 5.4, px * 2, 8.6);
        L.r(tint(C.RED_D, 0.6), cx + 0.6, 13.4, 5.2, px * 2);
      }
      L.r(C.RED_D, 0, 4.6, 1.6, 10);
      L.r(C.RED_D, 14.4, 4.6, 1.6, 10);
      L.r(C.RED, 0.2, 4.8, px * 2, 9.6);
      L.r(C.RED, 14.6, 4.8, px * 2, 9.6);
      L.r(C.WOOD_D, 0.2, 14.6, 1.2, 0.8);
      L.r(C.WOOD_D, 14.6, 14.6, 1.2, 0.8);
      break;
    case T.DESK:
      shadow(L, 1, 1, 14, 14);
      L.r(tone(C.WOOD_D, -0.1), 1, 1, 14, 14);
      L.r(C.WOOD, 1.8, 1.8, 12.4, 12.4);
      L.r(C.WOOD_L, 1.8, 1.8, 12.4, px);
      L.r(C.GREEN_D, 3, 3.4, 8, 8);
      L.r(tone(C.GREEN_D, 0.15), 3.3, 3.7, 7.4, 7.4);
      L.r(C.GOLD, 3, 3.4, 8, px);
      L.r(C.GOLD, 3, 11.4 - px, 8, px);
      L.r(C.BONE, 3.8, 4.4, 4.4, 5.6);
      L.r(tint(C.VOID, 0.2), 3.8, 9.9, 4.4, px * 2);
      for (let i = 0; i < 4; i++) L.r(C.STONE, 4.4, 5.2 + i * 1.1, 3 - (i === 3 ? 1.4 : 0), px);
      L.e(C.IRON, 11.7, 5.4, 1.3, 1.3);
      L.e(C.BLUE_D, 11.7, 5.4, 0.7, 0.7);
      L.e(C.IRON_L, 11.3, 5.0, 0.3, 0.3);
      L.l(C.BONE, 10.2, 8.6, 12.6, 6.8, px * 1.5);
      L.r(C.WOOD_D, 1.8, 12.4, 12.4, 1.8);
      for (const dx of [3.5, 8, 12]) L.r(C.GOLD, dx, 13, 1.2, px * 2);
      for (let i = 0; i < 3; i++) L.r(tint(C.WOOD_D, 0.5), 3.6 + i * 4.2, 12.4, px, 1.8);
      break;
    case T.CACTUS:
      paintCactus(clippedLocal(ctx, ox, oy), x, y, lookOfMap(map));
      break;
    default:
      break;
  }
}

function paintRug(ctx, map, f, ox, oy, x, y) {
  const L = local(ctx, ox, oy);
  paintFloorBoards(ctx, ox, oy, x, y, f, C.WOOD_L, C.WOOD, C.PLANK);
  const n = tileAt(map, f, x, y - 1) === T.RUG;
  const s = tileAt(map, f, x, y + 1) === T.RUG;
  const w = tileAt(map, f, x - 1, y) === T.RUG;
  const e = tileAt(map, f, x + 1, y) === T.RUG;
  const x0 = w ? 0 : 0.6;
  const x1 = e ? 16 : 15.4;
  const y0 = n ? 0 : 0.8;
  const y1 = s ? 16 : 15.2;
  L.r(tint(C.VOID, 0.2), x0 + 0.4, y0 + 0.6, x1 - x0, y1 - y0);
  L.r(C.RED_D, x0, y0, x1 - x0, y1 - y0);
  L.r(C.RED, x0 + 1, y0, x1 - x0 - 2, y1 - y0);
  // Note: weave, every other row a touch darker, like cloth.
  for (let r = 0; r < 16; r += 2) L.r(tint(C.RED_D, 0.22), x0, r + 0.5, x1 - x0, px);
  for (let c = 1; c < 15; c += 3) L.r(tint(C.RED_L, 0.18), c, y0, px, y1 - y0);
  L.r(C.GOLD, x0 + 1.6, y0, px * 2, y1 - y0);
  L.r(C.GOLD, x1 - 1.6 - px * 2, y0, px * 2, y1 - y0);
  L.r(C.GOLD_L, x0 + 2.4, y0, px, y1 - y0);
  L.r(C.GOLD_L, x1 - 2.4 - px, y0, px, y1 - y0);
  L.g(C.BLUE_D, [[8, 3.4], [12, 8], [8, 12.6], [4, 8]]);
  L.g(C.RED_D, [[8, 4.6], [10.6, 8], [8, 11.4], [5.4, 8]]);
  L.g(C.GOLD, [[8, 5.8], [9.4, 8], [8, 10.2], [6.6, 8]]);
  L.e(C.BLUE_D, 8, 8, 0.9, 0.9);
  for (const [cx, cy] of [[4, 2.6], [12, 2.6], [4, 13.4], [12, 13.4]]) L.g(C.GOLD, [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]);
  // Note: fringe at an open end, short cords sticking out of the cloth.
  if (!n) for (let c = 1.4; c < 15; c += 1.4) L.r(C.PLASTER, c, 0, px * 1.5, 0.8);
  if (!s) for (let c = 1.4; c < 15; c += 1.4) L.r(C.PLASTER, c, 15.2, px * 1.5, 0.8);
  if (!n) L.r(C.GOLD_L, x0 + 1, y0, x1 - x0 - 2, px);
  if (!s) L.r(C.GOLD_L, x0 + 1, y1 - px, x1 - x0 - 2, px);
  paintAO(ctx, map, f, ox, oy, x, y);
}

const NEAR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Note: whether the ground under an object is plain sand, judged from its four neighbours; houses have no grass, wash or road, so they are sand.
function sandUnder(map, f, x, y) {
  let grass = 0;
  let wash = 0;
  let road = 0;
  for (const [dx, dy] of NEAR4) {
    const t = tileAt(map, f, x + dx, y + dy);
    if (t === T.GRASS) grass++;
    else if (t === T.WASH) wash++;
    else if (t === T.ROAD) road++;
  }
  return grass < 2 && wash < 2 && road < 2;
}

// Note: the dry bed of a wash: ripples, cracked mud, rounded stones, bank shade.
function paintWash(ctx, map, f, ox, oy, x, y) {
  const L = clippedLocal(ctx, ox, oy);
  ground(ctx, map, f, ox, oy, x, y);
  // Note: a regional creek bed is damp cobble, so it skips the sun-cracked mud and the sand ripples and gets extra stones.
  const look = lookOfMap(map);
  const creek = !!(look && look.creek);
  if (creek) {
    L.r(tint(C.IRON_L, 0.2), 0, 0, 16, 16);
    for (let i = 0; i < 5; i++) {
      const cx = 1.5 + hh(y, x, 360 + i) * 13;
      const cy = 1.5 + hh(x, y, 365 + i) * 13;
      L.e(tint(C.SHADOW, 0.3), cx + 0.4, cy + 0.5, 1.9, 1.4);
      L.e(i % 2 ? C.STONE : C.STONE_L, cx, cy, 1.8, 1.3);
      L.r(tint(C.BONE, 0.3), cx - 0.8, cy - 0.7, 1.6 * px, px);
    }
  }
  for (let i = 0; i < (creek ? 0 : 3); i++) {
    const yy = 2.5 + hh(x, y, 260 + i) * 11;
    const xx = hh(y, x, 264 + i) * 8;
    const len = 4 + hh(x, y, 268 + i) * 6;
    L.r(tint(C.SAND_D, 0.8), xx, yy, len, px);
    L.r(tint(C.SAND_L, 0.5), xx + 1.5 * px, yy + 2 * px, len - 1.5, px);
  }
  // Note: a patch of sun-dried mud that has curled into plates; dark cracks round pale flakes.
  if (!creek && hh(x, y, 281) < 0.35) {
    const cx = 4 + hh(x, y, 282) * 8;
    const cy = 4 + hh(y, x, 283) * 8;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + hh(x, y, 284 + i);
      const px0 = cx + Math.cos(a) * 2.6;
      const py0 = cy + Math.sin(a) * 2;
      L.e(tint(C.SAND_L, 0.4), px0, py0, 1.7, 1.3);
      L.l(tint(C.WOOD_D, 0.55), cx, cy, px0 + Math.cos(a) * 1.3, py0 + Math.sin(a) * 1.1, px);
    }
  }
  for (let i = 0; i < 3; i++) {
    if (hh(x, y, 272 + i) < 0.45) continue;
    const cx = 2 + hh(y, x, 275 + i) * 12;
    const cy = 2 + hh(x, y, 278 + i) * 12;
    L.e(tint(C.SHADOW, 0.3), cx + 0.3, cy + 0.4, 1.1, 0.8);
    L.e(C.STONE, cx, cy, 1.1, 0.8);
    L.r(C.STONE_L, cx - 0.5, cy - 0.5, 1.5 * px, px);
  }
  if (tileAt(map, f, x, y - 1) !== T.WASH) L.r(tint(C.VOID, 0.22), 0, 0, 16, 1.4);
  if (tileAt(map, f, x, y + 1) !== T.WASH) L.r(tint(C.VOID, 0.12), 0, 14.8, 16, 1.2);
}

// Note: a packed dirt road: wheel ruts, a hoof-trodden middle, loose gravel.
function paintRoad(ctx, map, f, ox, oy, x, y) {
  const L = local(ctx, ox, oy);
  ground(ctx, map, f, ox, oy, x, y);
  const across = tileAt(map, f, x - 1, y) === T.ROAD || tileAt(map, f, x + 1, y) === T.ROAD;
  for (const [k, w] of [[4.8, 0], [11.2, 1]]) {
    for (let i = 0; i < 16; i += 2) {
      if (hh(x, y, 290 + i + k) < 0.1) continue;
      const along = (across ? x : y) * 16 + i;
      const wobble = Math.sin(along * 0.11 + w * 2) * 0.7 + (hh(x, y, i) - 0.5) * 0.5;
      const rc = tint(C.WOOD, 0.5);
      if (across) {
        L.r(rc, i, k + wobble, 2.2, 1.6);
        L.r(tint(C.PLASTER, 0.28), i, k + wobble + 1.6, 2.2, px);
      } else {
        L.r(rc, k + wobble, i, 1.6, 2.2);
        L.r(tint(C.PLASTER, 0.28), k + wobble + 1.6, i, px, 2.2);
      }
    }
  }
  for (let i = 0; i < 7; i++) {
    const hx = 3 + hh(x, y, 340 + i) * 10;
    const hy = 3 + hh(y, x, 350 + i) * 10;
    L.r(tint(C.WOOD_D, 0.3), hx, hy, 1.1, 0.7);
  }
  for (let i = 0; i < 6; i++) L.r(hh(x, y, 310 + i) < 0.5 ? C.STONE : C.SAND_L, hh(x, y, 320 + i) * 15, hh(y, x, 330 + i) * 15, px * 2, px);
}

// Note: paints the ground under an object; ground.js reads the neighbours, so a wagon in a wash stands on the wash, and bare sand also takes the wall shade.
function paintGroundUnder(ctx, map, f, ox, oy, x, y) {
  ground(ctx, map, f, ox, oy, x, y);
  if (sandUnder(map, f, x, y)) paintAO(ctx, map, f, ox, oy, x, y);
}

function paintOutdoor(ctx, map, f, ox, oy, x, y, tile) {
  // Note: plants, rocks and water draw through a clip, so a crown or a shadow never spills into the next cell.
  const L = clippedLocal(ctx, ox, oy);
  if (tile === T.GRASS) return ground(ctx, map, f, ox, oy, x, y);
  if (tile === T.WASH) return paintWash(ctx, map, f, ox, oy, x, y);
  if (tile === T.ROAD) return paintRoad(ctx, map, f, ox, oy, x, y);
  paintGroundUnder(ctx, map, f, ox, oy, x, y);
  switch (tile) {
    case T.SCRUB:
      paintScrub(L, x, y, lookOfMap(map));
      break;
    case T.ROCK:
      paintRock(L, x, y, terrainOf(map), lookOfMap(map));
      break;
    case T.MESQUITE:
      paintMesquite(L, x, y, terrainOf(map), lookOfMap(map));
      break;
    case T.BANK:
      paintBank(L, x, y, lookOfMap(map));
      break;
    case T.WATER: {
      // Note: shallow river water; the shore gets a wet band and a pale edge where land touches.
      paintWater(L, x, y, (dx, dy) => tileAt(map, f, x + dx, y + dy) === T.WATER, lookOfMap(map));
      for (const [dx, dy, rx, ry, rw, rh] of [[-1, 0, 0, 0, 2.2, 16], [1, 0, 13.8, 0, 2.2, 16], [0, -1, 0, 0, 16, 2.2], [0, 1, 0, 13.8, 16, 2.2]]) {
        if (tileAt(map, f, x + dx, y + dy) === T.WATER) continue;
        L.r(tint(C.SAND_D, 0.7), rx, ry, rw, rh);
        L.r(tint(C.ADOBE_D, 0.35), rx, ry, rw, rh);
        L.r(tint(C.GLASS_L, 0.75), dx === 0 ? 0 : rx + (dx < 0 ? 2.2 : -px), dy === 0 ? 0 : ry + (dy < 0 ? 2.2 : -px), dx === 0 ? 16 : px, dy === 0 ? 16 : px);
      }
      break;
    }
    case T.WAGON: {
      // Note: a freight wagon from above; plank bed, side boards, iron-tyred wheels at the corners and a load of sacks.
      L.r(tint(C.VOID, 0.24), 2.4, 4.4, 13, 10);
      L.r(C.WOOD_D, 1, 3, 14, 10);
      L.r(C.PLANK, 1.8, 3.8, 12.4, 8.4);
      for (let i = 0; i < 4; i++) L.r(tone(C.PLANK, (hh(x, y, 480 + i) - 0.5) * 0.14), 1.8, 3.8 + i * 2.1, 12.4, 2.1 - px);
      L.r(C.PLANK_L, 1.8, 3.8, 12.4, px);
      for (const [wx, wy] of [[0.4, 1.4], [11, 1.4], [0.4, 12.4], [11, 12.4]]) {
        L.r(C.IRON, wx, wy, 4.6, 1.8);
        L.r(C.IRON_L, wx + 0.4, wy, 3.8, px);
      }
      L.e(C.PLASTER, 5, 7, 2.2, 1.6);
      L.e(C.PLASTER_L, 4.6, 6.6, 1.2, 0.8);
      L.e(tone(C.PLASTER, -0.15), 10, 8, 2.4, 1.8);
      L.e(C.WOOD, 8, 9.8, 1.8, 1.2);
      L.l(C.WOOD_D, 1, 8, 15, 8, px);
      break;
    }
    case T.TAILINGS: {
      // Note: a mine dump; ground.js paints the heap itself, here are the rocks, which lie only on the heap.
      const at = heapField(map, f, x, y);
      const on = (u, v) => at(u / 16, v / 16) > 0.62;
      for (let i = 0; i < 4; i++) {
        const cx = 3 + hh(x, y, 595 + i) * 10;
        const cy = 3 + hh(y, x, 599 + i) * 10;
        if (!on(cx, cy)) continue;
        L.e(tint(C.VOID, 0.35), cx + 0.6, cy + 0.7, 1.5, 1.1);
        L.e(i % 2 ? C.STONE : C.IRON, cx, cy, 1.4, 1);
        L.r(C.STONE_L, cx - 0.7, cy - 0.5, px * 2, px);
      }
      for (let i = 0; i < 28; i++) {
        const sx = 1.8 + hh(x, y, 500 + i) * 12.4;
        const sy = 1.8 + hh(y, x, 530 + i) * 12.4;
        if (!on(sx, sy)) continue;
        const col = hh(x + i, y, 560) < 0.4 ? C.STONE_L : hh(x + i, y, 561) < 0.7 ? C.IRON : C.ADOBE_L;
        L.r(col, sx, sy, px * 2, px * 1.5);
      }
      const gx = 3 + hh(x, y, 591) * 10;
      const gy = 3 + hh(y, x, 592) * 10;
      if (hh(x, y, 590) < 0.5 && on(gx, gy)) L.e(tint(C.GREEN, 0.5), gx, gy, 1.4, 0.9);
      break;
    }
    case T.SHAFT:
      // Note: a shaft collar, a square of timber round a black drop, a crossbeam and a coil of rope.
      L.r(tint(C.VOID, 0.28), 2.4, 3.2, 13, 12);
      L.r(C.WOOD_D, 1.4, 1.6, 13, 13);
      L.r(C.WOOD, 2, 2.2, 11.8, 11.8);
      L.r(C.VOID, 3.6, 3.8, 8.6, 8.6);
      L.r(tint(C.SHADOW, 0.7), 4.2, 4.4, 7.4, 7.4);
      L.r(C.WOOD_L, 2, 2.2, 11.8, px);
      L.r(C.WOOD_D, 1, 7.2, 14, 1.6);
      L.r(C.WOOD, 1, 7.2, 14, px);
      L.e(C.PLASTER, 12.2, 3.4, 1.2, 1);
      L.e(C.WOOD_D, 12.2, 3.4, 0.5, 0.4);
      break;
    case T.TROUGH:
      L.r(tint(C.VOID, 0.24), 1.8, 5.2, 14, 8);
      L.r(C.WOOD_D, 1, 4, 14, 8);
      L.r(C.WOOD, 1.6, 4.6, 12.8, 6.8);
      L.r(C.GLASS, 2.4, 5.4, 11.2, 5.2);
      L.r(C.BLUE, 2.4, 5.4, 11.2, 1.4);
      L.r(tint(C.GLASS_L, 0.7), 3.4, 7.6, 3, px);
      L.r(tint(C.GLASS_L, 0.7), 8.4, 8.8, 3.4, px);
      L.r(C.WOOD_L, 1.6, 4.6, 12.8, px);
      break;
    case T.HAY:
      // Note: a baled hay stack tied with two cords.
      L.r(tint(C.VOID, 0.24), 2.4, 3.6, 13, 11);
      L.r(C.PLANK_L, 1.4, 2.4, 13, 11);
      for (let i = 0; i < 14; i++) L.r(hh(x, y, 570 + i) < 0.5 ? C.SAND_L : tone(C.PLANK_L, -0.18), 1.6 + hh(y, x, 590 + i) * 11, 2.6 + (i % 7) * 1.5, 2 + hh(x, y, 610 + i) * 3, px);
      L.r(C.WOOD_D, 1.4, 5.4, 13, px * 1.5);
      L.r(C.WOOD_D, 1.4, 10, 13, px * 1.5);
      L.r(C.SAND_L, 1.4, 2.4, 13, px);
      break;
    default:
      break;
  }
}

function paintFeatureArt(L, tile) {
  const paper = (x, y, w, h) => {
    L.r(tint(C.VOID, 0.35), x + 0.5, y + 0.8, w, h);
    L.r(C.BONE, x, y, w, h);
    L.r(C.PLASTER_L, x, y, w, px);
  };
  const bottle = (x, y, color) => {
    L.e(tint(C.VOID, 0.35), x + 1.1, y + 2.4, 1.5, 1.3);
    L.e(color, x + 0.7, y + 1.8, 1.3, 1.3);
    L.r(C.GLASS_L, x + 0.1, y + 0.9, px, 1.2);
    L.r(C.GOLD_L, x + 0.3, y, 0.8, 0.8);
  };
  const sack = (x, y, color = C.PLASTER) => {
    L.e(tint(C.VOID, 0.35), x + 2.6, y + 2.8, 3.2, 2.4);
    L.e(color, x + 2, y + 2, 3.2, 2.4);
    L.l(C.WOOD_D, x + 0.2, y + 1.1, x + 3.6, y + 3, px);
    L.r(C.BONE, x + 0.8, y + 0.7, 1.8, px);
  };
  const tool = (x, y) => {
    L.l(C.WOOD_D, x, y, x + 7, y + 7, 1.4);
    L.l(C.PLANK_L, x, y, x + 7, y + 7, px);
    L.l(C.IRON_L, x + 4.2, y + 0.2, x + 0.1, y + 4.4, 1.3);
    L.l(C.IRON, x + 4.2, y + 0.8, x + 0.5, y + 4.5, px);
  };
  switch (tile) {
    case T.CIRCLE_WAGON:
      L.r(C.WOOD_D, 2.2, 3.9, 11.6, 8.2);
      L.e(C.PLASTER, 8, 8, 5.6, 4.3);
      L.e(C.PLASTER_L, 7.5, 7.1, 4.8, 3.1);
      for (const x of [5, 8, 11]) L.l(C.WOOD, x, 4.2, x, 11.8, px);
      L.l(C.WOOD_D, 3, 8, 13, 8, px);
      break;
    case T.FREIGHT_CRATE:
      paper(4, 3.5, 8, 7);
      L.l(C.RED_D, 5, 8.7, 5, 5, 1.2);
      L.g(C.RED_D, [[3.8, 6], [5, 4.3], [6.2, 6]]);
      L.l(C.RED_D, 9.4, 8.7, 9.4, 5, 1.2);
      L.g(C.RED_D, [[8.2, 6], [9.4, 4.3], [10.6, 6]]);
      break;
    case T.CAMP_FIRE:
      for (let i = 0; i < 9; i++) {
        const angle = i * Math.PI * 2 / 9;
        L.e(C.STONE, 8 + Math.cos(angle) * 5.1, 8 + Math.sin(angle) * 4.6, 1.8, 1.4);
        L.e(C.STONE_L, 7.7 + Math.cos(angle) * 5.1, 7.7 + Math.sin(angle) * 4.6, 1, 0.7);
      }
      L.e(C.DARK, 8, 8, 4.3, 4);
      L.l(C.WOOD, 4.5, 10.5, 11.8, 5.5, 2);
      L.l(C.WOOD_L, 4.6, 5.4, 11.3, 10.8, 1.6);
      L.g(C.RED, [[5, 9.5], [6.5, 5.5], [7.4, 7], [9, 3.2], [11.3, 8.6], [9.3, 11.2]]);
      L.g(C.GOLD, [[6.7, 9.5], [8.3, 6.2], [9.8, 9.2], [8.4, 10.5]]);
      break;
    case T.CORRAL_TROUGH:
      L.r(C.PLANK_L, 2.6, 5.3, 10.8, 5.2);
      for (let i = 0; i < 6; i++) L.l(C.WOOD, 3 + i * 1.7, 6, 4 + i * 1.5, 9.7, px);
      L.r(C.SAND_L, 4, 6, 6, px);
      break;
    case T.STONE_POSITION:
      sack(1.5, 2, C.SAND_L);
      sack(8, 7, C.PLASTER);
      L.l(C.WOOD_D, 3, 12, 12, 3, 1);
      break;
    case T.SUPPLY_CHEST:
      L.r(C.WOOD_D, 2.4, 3.5, 11.2, 8.6);
      L.r(C.WOOD_L, 3, 4, 10, 7.3);
      L.r(C.IRON, 4.5, 4, 1, 7.3);
      L.r(C.IRON, 10.5, 4, 1, 7.3);
      L.r(C.GOLD, 7, 6.5, 2, 2);
      break;
    case T.CLAIM_SHAFT:
      tool(3, 3);
      L.e(C.GOLD, 11, 11, 1.6, 1.3);
      L.r(C.GOLD_L, 10.2, 10.2, 1.2, px);
      break;
    case T.HAY_STACK:
      sack(3, 4, C.SAND_L);
      L.l(C.WOOD_D, 2, 11, 13, 4, 1);
      L.l(C.WOOD_L, 2, 10.7, 13, 3.7, px);
      break;
    case T.ROADBLOCK_WAGON:
      L.r(C.DARK, 2.4, 4.2, 11, 7.4);
      L.l(C.WOOD_L, 3, 4.4, 12, 10.5, 1.4);
      L.l(C.WOOD, 12, 4, 3.4, 11, 1.8);
      L.r(C.RED_D, 8, 5, 3.5, 2.5);
      break;
    case T.WATER_STOP:
      L.e(C.IRON, 4, 5.7, 2.2, 2.2);
      L.e(C.GLASS_L, 4, 5.4, 1.4, 1.4);
      L.l(C.PLANK_L, 10.5, 2, 12, 12.5, 1.2);
      break;
    case T.WORK_SHAFT:
      tool(4, 4);
      L.r(C.RED_D, 9.5, 9.8, 3, 2);
      L.r(C.GOLD, 10, 10, 2, px);
      break;
    case T.HIDEOUT_BARREL:
      paper(4.2, 5, 6.8, 4.5);
      L.l(C.RED_D, 5, 8, 9.8, 6, px);
      L.r(C.DARK, 7, 6, 1, 1);
      break;
    case T.TRADER_WAGON:
      L.r(C.RED_D, 2.4, 4, 11.2, 7.5);
      L.r(C.BLUE_D, 2.8, 4.4, 10.4, 6.7);
      for (let x = 3.2; x < 13; x += 2.5) L.r(C.GOLD, x, 4.4, 0.8, 6.7);
      sack(5, 5, C.PLASTER_L);
      break;
    case T.FENCE_TROUGH:
      L.r(C.PLANK, 2.4, 5.4, 11.2, 5.2);
      L.l(C.WOOD_D, 3, 6, 13, 10, 1.4);
      L.l(C.WOOD_L, 3, 5.7, 13, 9.7, px);
      break;
    case T.OLD_SHAFT:
      L.l(C.PLANK, 3.2, 4.5, 12.8, 11.5, 2.1);
      L.l(C.WOOD_D, 4, 11.4, 12, 4.5, 1.6);
      L.r(C.WOOD_L, 5, 5, 2, px);
      break;
    case T.FEED_BALE:
      sack(4, 5, C.PLASTER);
      L.r(C.RED_D, 6, 6.3, 2.8, 1.6);
      L.r(C.BONE, 6.4, 6.8, 2, px);
      break;
    case T.HOUSE_SOFA:
      L.r(C.RED_D, 3, 4, 4.5, 4.5);
      L.r(C.RED_L, 3.4, 4.4, 3.5, px);
      L.r(C.GOLD, 5, 5.7, px * 2, px * 2);
      break;
    case T.SALOON_BAR:
      L.r(C.WOOD_D, 2.4, 2.3, 11.2, 9.3);
      L.r(C.WOOD_L, 2.6, 2.5, 10.8, 8.7);
      bottle(4, 4, C.GREEN_D);
      bottle(8, 5, C.RED_D);
      L.e(C.BONE, 12, 8.8, 1.3, 1.3);
      L.e(C.GOLD, 12, 8.8, 0.8, 0.8);
      break;
    case T.HOTEL_TABLE:
      paper(3.4, 3.7, 8.4, 7.6);
      for (let y = 5; y < 9.5; y += 1.5) L.r(C.WOOD, 4.5, y, 5.8, px);
      L.e(C.GOLD, 11, 10.5, 1.1, 1.1);
      L.l(C.GOLD, 10, 10.5, 7.4, 10.5, 0.9);
      break;
    case T.STORE_COUNTER:
      L.r(C.PLANK, 1.8, 2.4, 12.4, 8.8);
      bottle(3, 4, C.RED);
      bottle(7, 4, C.BLUE);
      bottle(11, 4, C.GREEN);
      paper(6, 8.6, 4, 2.4);
      break;
    case T.BANK_COUNTER:
      L.r(C.WOOD_D, 2.4, 2.2, 11.2, 9.7);
      paper(3, 3, 6, 6);
      for (const [x, y] of [[10.7, 4], [12, 5.3], [10.7, 7]]) {
        L.e(C.GOLD, x, y, 1.3, 1.2);
        L.e(C.GOLD_L, x - 0.3, y - 0.3, 0.6, 0.6);
      }
      break;
    case T.BOARDING_TABLE:
      L.r(C.PLASTER_L, 2.7, 3.1, 10.6, 9.8);
      L.l(C.RED_D, 3, 6, 13, 6, px);
      L.e(C.BONE, 5.2, 8.5, 2, 2);
      L.e(C.BONE, 10.8, 8.5, 2, 2);
      L.e(C.GOLD, 5.2, 8.5, 1, 1);
      L.e(C.GOLD, 10.8, 8.5, 1, 1);
      break;
    case T.WAREHOUSE_CRATE:
      L.r(C.WOOD_D, 4, 4, 8, 7);
      L.r(C.PLANK_L, 4.5, 4.5, 7, 6);
      L.r(C.RED_D, 5, 5, 6, 1);
      L.r(C.RED_D, 5, 7, 4.5, 1);
      L.r(C.RED_D, 5, 9, 5.5, 1);
      break;
    case T.OFFICE_DESK:
      paper(3.1, 3.6, 8.6, 7.2);
      for (let y = 5; y < 9.8; y += 1.5) L.r(C.WOOD, 4, y, 5.8, px);
      L.e(C.DARK, 12, 5, 1.4, 1.4);
      L.l(C.BONE, 11.6, 5.2, 9, 9.8, 0.8);
      break;
    case T.GRAVE_MARKER:
      L.r(C.STONE_L, 4, 2, 8, 12);
      L.r(C.PLASTER, 5, 3, 6, 10);
      L.r(C.IRON, 7.3, 4, 1.4, 6);
      L.r(C.IRON, 5.8, 5.5, 4.4, 1.4);
      break;
    case T.FREIGHT_CART:
      L.r(C.WOOD_D, 3, 4, 10, 7);
      L.r(C.PLANK_L, 3.6, 4.6, 8.8, 5.8);
      L.r(C.RED_D, 5, 6, 6, 2);
      L.r(C.IRON, 3, 9.5, 10, 1);
      break;
    case T.RUIN_CRATE:
      L.r(C.ADOBE, 3, 3, 10, 9);
      L.l(C.WOOD_D, 4, 4, 12, 11, 1);
      break;
    case T.TELEGRAPH_POLE:
      L.r(C.WOOD_L, 6, 2, 4, 12);
      L.r(C.WOOD, 1, 4, 14, 2);
      L.l(C.IRON, 0, 3, 16, 3, px);
      break;
    case T.CHURCH_ALTAR:
      L.r(C.BONE, 2, 3, 12, 5);
      L.r(C.GOLD, 7.2, 3.8, 1.6, 6.4);
      L.r(C.GOLD, 5.4, 5.3, 5.2, 1.4);
      break;
    case T.SMITH_FORGE:
      L.e(C.RED, 8, 7, 3.5, 2.5);
      L.e(C.GOLD, 7.4, 6.7, 1.8, 1.4);
      break;
  }
}

// Note: paints one cell of one floor into the 16 x 16 unit square at its map position.
export function paintCell(ctx, map, f, x, y) {
  const ox = x * 16;
  const oy = y * 16;
  const tile = tileAt(map, f, x, y);
  const state = stateAt(map, f, x, y);
  if (paintThemeCell(ctx, map, f, x, y, tile)) return;
  const artBase = TILE_ART_BASE[tile];
  if (artBase !== undefined) {
    if (tile === T.CAMP_FIRE) paintGroundUnder(ctx, map, f, ox, oy, x, y);
    else if ([T.WAGON, T.TROUGH, T.HAY, T.ROCK, T.SHAFT].includes(artBase)) paintOutdoor(ctx, map, f, ox, oy, x, y, artBase);
    else paintFurniture(ctx, map, f, ox, oy, x, y, artBase);
    paintFeatureArt(local(ctx, ox, oy), tile);
    return;
  }
  switch (tile) {
    case T.VOID: P.rect(ctx, C.VOID, ox, oy, 16, 16); break;
    case T.SAND: ground(ctx, map, f, ox, oy, x, y); paintAO(ctx, map, f, ox, oy, x, y); break;
    case T.DROP: ground(ctx, map, f, ox, oy, x, y, { dark: true }); break;
    case T.PORCH: paintBase(ctx, map, 'porch', ox, oy, x, y, f); break;
    case T.FLOOR: paintBase(ctx, map, 'floor', ox, oy, x, y, f); break;
    case T.RUG: paintRug(ctx, map, f, ox, oy, x, y); break;
    case T.ADOBE: case T.FRAME: case T.PARTITION: paintWall(ctx, map, f, ox, oy, x, y, tile); break;
    case T.DOOR: paintDoor(ctx, map, f, ox, oy, x, y, HIDE.has(cellKey(f, x, y)) ? EMPTY : state); break;
    case T.WINDOW: paintWindow(ctx, map, f, ox, oy, x, y, HIDE.has(cellKey(f, x, y)) ? EMPTY : state); break;
    case T.STAIRS: paintFlight(ctx, flightLower(map, f, x, y) === f, ox, oy, 0); break;
    case T.RUN: paintFlight(ctx, flightLower(map, f, x, y + 1) === f, ox, oy, 1); break;
    case T.ROCK: case T.MESQUITE: case T.SCRUB: case T.GRASS: case T.WASH: case T.BANK: case T.WATER: case T.WAGON: case T.TAILINGS: case T.SHAFT: case T.TROUGH: case T.HAY: case T.ROAD: paintOutdoor(ctx, map, f, ox, oy, x, y, tile); break;
    default: paintFurniture(ctx, map, f, ox, oy, x, y, tile); break;
  }
}

export function paintFloor(ctx, map, f) {
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) paintCell(ctx, map, f, x, y);
}

// Note: how far from a decal's centre it can still paint, in art units; the chunk layer uses it to pick the canvases to touch.
export const decalReach = (d) => (d.r || 0.3) * 16 * 0.7 * 3.4 + 2;

// Note: a blood spot painted once into the decal layer: a glossy pool with a dark core, a few smears and spatter around it.
export function paintDecal(ctx, d) {
  const cx = d.x * 16;
  const cy = d.y * 16;
  const r = Math.max(0.8, (d.r || 0.3) * 16 * 0.7);
  const sx = Math.floor(d.x * 100);
  const sy = Math.floor(d.y * 100);
  const blobs = 3 + Math.floor(hh(sx, sy, 1) * 3);
  for (let i = 0; i < blobs; i++) {
    const a = hh(sx, sy, 10 + i) * Math.PI * 2;
    const rr = hh(sx, sy, 20 + i) * r * 0.6;
    const br = r * (0.5 + hh(sx, sy, 30 + i) * 0.5);
    P.ell(ctx, 'rgba(92,24,18,0.62)', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, br, br * (0.6 + hh(sx, sy, 40 + i) * 0.4));
  }
  P.ell(ctx, 'rgba(74,16,12,0.7)', cx, cy, r * 0.55, r * 0.5);
  P.ell(ctx, 'rgba(110,26,18,0.55)', cx - r * 0.12, cy - r * 0.1, r * 0.3, r * 0.25);
  P.rect(ctx, 'rgba(226,150,130,0.4)', cx - r * 0.28, cy - r * 0.3, px * 2, px);
  const drops = 6 + Math.floor(hh(sx, sy, 50) * 9);
  const bias = hh(sx, sy, 51) * Math.PI * 2;
  for (let i = 0; i < drops; i++) {
    const a = bias + (hh(sx, sy, 60 + i) - 0.5) * 2.6;
    const rr = r * (0.8 + hh(sx, sy, 80 + i) * 2.4);
    const s = px * (1 + hh(sx, sy, 100 + i) * 2.6);
    const dx = cx + Math.cos(a) * rr;
    const dy = cy + Math.sin(a) * rr;
    P.ell(ctx, 'rgba(100,24,18,0.8)', dx, dy, s, s);
    if (hh(sx, sy, 120 + i) < 0.3) P.line(ctx, 'rgba(92,24,18,0.5)', cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, dx, dy, px);
  }
}

// Note: the cell paint size in device pixels; the chunk layers cut the map along it.
export const CELL_PX = TILE;
