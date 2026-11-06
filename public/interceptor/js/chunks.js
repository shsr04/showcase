// Note: paints world chunks into canvas textures on demand and drops them when far away; also builds roofs.

import { CHUNK, CHUNK_PX, TILE, CELL, DENSE } from './config.js';
import { PAL, C } from './palette.js';
import { T, TILE_PROPS, CANOPY } from './tiles.js';
import { sampleTile, tileAt, roadX } from './worldgen.js';
import { hash3, u01 } from './rand.js';

const ABGR = PAL.map((hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (255 << 24) | (b << 16) | (g << 8) | r;
});

const SOLID_PAINT = new Set([T.DEEP, T.WALL, T.DOOR, T.TREE, T.FENCE, T.TANK, T.PUMP, T.COUNTER, T.RAIL, T.PINE, T.CEDAR, T.ROCK, T.JACK, T.REDROCK]);
const ROADISH = new Set([T.ASPHALT, T.CRACKED, T.BRIDGE]);

// Note: block class for sub-tile painting keeps solid tiles aligned to the collision grid.
function blockClass(tileCls, sub) {
  if (SOLID_PAINT.has(tileCls)) return tileCls;
  if (sub === T.DEEP) return T.WATER;
  if (SOLID_PAINT.has(sub)) return tileCls;
  return sub;
}

function paintPixel(cls, lx, ly, wx, wy, h, nb) {
  const p = TILE_PROPS[cls].paint;
  const a0 = p.acc[0];
  const a1 = p.acc[1];
  switch (p.kind) {
    case 'water': {
      const wave = (wx + ((wy * 3) >> 1) + ((wy >> 3) & 3) * 5) % 11;
      if (wave === 0 && h < 0.7) return a0;
      if (h < 0.04) return a1;
      return p.base;
    }
    case 'speckle':
      return h < 0.12 ? a0 : h < 0.17 ? a1 : p.base;
    case 'grass': {
      const blade = u01(hash3(77, wx, wy >> 1));
      return blade < 0.12 ? a0 : blade < 0.16 ? a1 : p.base;
    }
    case 'gravel':
      return h < 0.22 ? a0 : h < 0.33 ? a1 : p.base;
    case 'asphalt':
      return h < 0.07 ? a0 : h < 0.1 ? a1 : p.base;
    case 'cracked': {
      const crack = u01(hash3(91, wx >> 2, wy)) < 0.05 || u01(hash3(92, wx, wy >> 2)) < 0.04;
      return crack ? a1 : h < 0.12 ? a0 : p.base;
    }
    case 'concrete':
      if (lx === 0 || ly === 0) return a1;
      return h < 0.08 ? a0 : p.base;
    case 'planksH':
      if (wy % 48 === 0) return a1;
      return h < 0.08 ? a0 : p.base;
    case 'rail':
      if (lx >= 6 && lx <= 8) return lx === 8 ? C.SHADOW : C.CONC;
      if (lx > 8 && (wy & 7) === 0) return C.SHADOW;
      return (wx + wy) % 9 === 0 ? C.WATER : C.WATER_D;
    case 'planks':
      if (ly % 4 === 3) return a0;
      if ((lx + (ly >> 2) * 5) % 13 === 0) return a0;
      return h < 0.06 ? a1 : p.base;
    case 'wall': {
      if (!nb.down) {
        if (ly >= 12) return ly >= 14 ? C.SHADOW : a0;
      }
      if (!nb.up && ly === 0) return C.BONE_L;
      return h < 0.1 ? a0 : p.base;
    }
    case 'door':
      if (lx < 2 || lx > 13) return a1;
      return ly % 5 === 0 ? a0 : p.base;
    case 'trunk':
      return h < 0.2 ? a0 : h < 0.3 ? a1 : p.base;
    case 'fence': {
      const ground = h < 0.1 ? C.GRASS_D : p.base;
      const horiz = nb.left || nb.right || !(nb.up || nb.down);
      const vert = nb.up || nb.down;
      if (horiz && (ly === 7 || ly === 8)) return ly === 7 ? C.DUST : C.SHADOW;
      if (vert && (lx === 7 || lx === 8)) return lx === 7 ? C.DUST : C.SHADOW;
      if ((horiz && lx % 6 === 1 && ly >= 5 && ly <= 10) || (vert && ly % 6 === 1 && lx >= 5 && lx <= 10)) return C.MUD;
      return ground;
    }
    case 'tank': {
      const dx = lx - 7.5;
      const dy = ly - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 7.5) return C.CONC;
      if (r > 6.5) return C.SHADOW;
      if (r < 1.5) return C.ASPH_L;
      if (dx + dy < -4) return C.BONE;
      return h < 0.08 ? a0 : p.base;
    }
    case 'pump':
      if (lx >= 4 && lx <= 11 && ly >= 3 && ly <= 12) {
        if (ly <= 5) return C.WHITE;
        return lx === 4 || lx === 11 ? C.SHADOW : a0;
      }
      return lx === 0 || ly === 0 ? C.ASPH_L : p.base;
    case 'bay':
      if (lx === 0 || lx === 15) return a0;
      if (u01(hash3(93, wx >> 3, wy >> 3)) < 0.3 && h < 0.5) return C.ASPH;
      return h < 0.06 ? a1 : p.base;
    case 'reeds': {
      const stalk = u01(hash3(94, wx, wy >> 2));
      return stalk < 0.18 ? a0 : stalk < 0.26 ? a1 : h < 0.1 ? C.WATER : p.base;
    }
    case 'rubble':
      return h < 0.3 ? a0 : h < 0.42 ? a1 : p.base;
    case 'counter':
      if (ly === 0 || lx === 0) return C.BONE;
      if (ly === 15 || lx === 15) return a1;
      return h < 0.1 ? a0 : p.base;
    case 'lot':
      if ((wy >> 4) % 2 === 0 && ly === 0 && lx > 1 && lx < 14) return a1;
      return h < 0.07 ? a0 : p.base;
    case 'rock': {
      // Note: ledges catch light on top and drop a shadow below, like walls.
      if (!nb.down && ly >= 13) return ly >= 15 ? C.SHADOW : a1;
      if (!nb.up && ly <= 1) return a0;
      const crack = u01(hash3(96, wx >> 2, wy >> 1)) < 0.06;
      return crack ? C.SHADOW : h < 0.12 ? a0 : h < 0.22 ? a1 : p.base;
    }
    case 'scrub': {
      const dx = lx - 7.5 + (u01(hash3(97, wx >> 4, wy >> 4)) - 0.5) * 4;
      const dy = ly - 7.5 + (u01(hash3(98, wx >> 4, wy >> 4)) - 0.5) * 4;
      const r = Math.sqrt(dx * dx + dy * dy) + u01(hash3(99, wx >> 1, wy >> 1)) * 2;
      if (r < 4.5) return h < 0.3 ? a1 : a0;
      if (r < 6) return h < 0.5 ? a0 : C.SHADOW;
      return h < 0.1 ? C.DIRT_L : p.base;
    }
    case 'jack':
      // Note: a pumpjack from above: base frame, walking beam, horsehead and counterweight.
      if (lx >= 4 && lx <= 11 && ly >= 9 && ly <= 12) return lx === 4 || lx === 11 || ly === 12 ? C.SHADOW : a0;
      if (ly >= 6 && ly <= 8 && lx >= 1 && lx <= 13) return ly === 8 ? C.RUST_D : a1;
      if (lx <= 2 && ly >= 4 && ly <= 10) return C.ASPH_D;
      if (lx >= 12 && lx <= 14 && ly >= 4 && ly <= 10) return C.SHADOW;
      return h < 0.15 ? C.SHADOW : h < 0.3 ? C.DUST : p.base;
    default:
      return p.base;
  }
}

// Note: highway lines at pixel precision: white edges, dashed white lanes, double yellow center.
function roadMark(world, wx, wy, cls) {
  if (!ROADISH.has(cls) || (world.kind === 'level' && !world.roadCx)) return -1;
  const d = wx / TILE - (world.kind === 'level' ? world.roadCx(wy / TILE) : roadX(world, wy / TILE));
  const ad = Math.abs(d);
  if (Math.abs(ad - 3.15) < 0.07) return cls === T.CRACKED && u01(hash3(5, wy >> 3, 0)) < 0.4 ? -1 : C.BONE;
  if (Math.abs(ad - 1.55) < 0.06 && (wy >> 4) % 3 === 0) return cls === T.CRACKED ? -1 : C.BONE;
  if (ad > 0.04 && ad < 0.16 && !(cls === T.CRACKED && u01(hash3(6, wy >> 2, 0)) < 0.5)) return C.AMBER;
  return -1;
}

// Note: crowns at the car's scale (5.6 px/m): oak 6-9 m, pine 4-6 m, cedar 3-4 m across.
const CANOPY_LOOK = {
  oak: { r: 18, rv: 8, wob: 4, mid: C.GRASS_D, lit: C.GRASS, dark: C.MARSH_D, fleck: C.STRAW },
  pine: { r: 12, rv: 5, wob: 5, mid: C.MARSH_D, lit: C.GRASS_D, dark: C.SHADOW, fleck: C.MUD },
  cedar: { r: 8, rv: 4, wob: 2.5, mid: C.WATER_D, lit: C.MARSH_D, dark: C.SHADOW, fleck: C.GRASS_D },
};
const CROWN_VARIANTS = 8;
const CROWN_SHADOW = 4;
// Note: crowns stop at pavement, lots, shoulders, back roads and buildings, as if trimmed back.
const NO_CANOPY = new Set([T.ASPHALT, T.CRACKED, T.LANE, T.EDGE, T.BRIDGE, T.RAIL, T.GRAVEL, T.DIRT, T.CALICHE, T.CONCRETE,
  T.LOT, T.FLOOR, T.CARPET, T.WALL, T.DOOR, T.COUNTER, T.BAY, T.PUMP, T.TANK]);
const crownCache = {};

// Note: each kind gets a few pre-shaded crowns; a stamp holds a palette index per crown pixel, -2 for shadow only, -1 for none.
function crownStamps(kind) {
  if (crownCache[kind]) return crownCache[kind];
  const L = CANOPY_LOOK[kind];
  const seed = 900 + kind.length * 31;
  const list = [];
  for (let v = 0; v < CROWN_VARIANTS; v++) {
    const r = L.r + (v / (CROWN_VARIANTS - 1)) * L.rv;
    const R = Math.ceil(r + CROWN_SHADOW + 1);
    const size = 2 * R + 1;
    const px = new Int16Array(size * size).fill(-1);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const wob = u01(hash3(seed + v, x >> 1, y >> 1)) * L.wob;
        const dist = Math.sqrt(x * x + y * y);
        const i = (y + R) * size + (x + R);
        if (dist < r - wob) {
          const lit = -(x + y) / r;
          const h = u01(hash3(seed + 50 + v, x, y));
          let col = L.mid;
          if (lit > 0.55 && h < 0.7) col = L.lit;
          else if (lit < -0.45 || dist > r - wob - 1.5) col = L.dark;
          if (h < 0.06) col = L.fleck;
          px[i] = col;
        } else {
          // Note: the shadow falls to the lower right.
          const sx = x - CROWN_SHADOW;
          const sy = y - CROWN_SHADOW;
          if (Math.sqrt(sx * sx + sy * sy) < r - 1) px[i] = -2;
        }
      }
    }
    list.push({ R, size, px });
  }
  crownCache[kind] = list;
  return list;
}

// Note: open(lx, ly) says whether chunk pixel (lx, ly) sits on ground a crown may cover; the ground gets dithered shade, top gets the crown.
function paintCanopy(buf, top, ox, oy, cx, cy, seed, kind, open) {
  const list = crownStamps(kind);
  const st = list[Math.floor(u01(hash3(seed, cx, cy)) * list.length)];
  const mx = Math.round(cx * TILE + 8 + (u01(hash3(seed + 1, cx, cy)) - 0.5) * 8) - ox;
  const my = Math.round(cy * TILE + 8 + (u01(hash3(seed + 2, cx, cy)) - 0.5) * 8) - oy;
  const x0 = Math.max(0, mx - st.R);
  const x1 = Math.min(CHUNK_PX - 1, mx + st.R);
  const y0 = Math.max(0, my - st.R);
  const y1 = Math.min(CHUNK_PX - 1, my + st.R);
  for (let ly = y0; ly <= y1; ly++) {
    const row = (ly - my + st.R) * st.size - mx + st.R;
    for (let lx = x0; lx <= x1; lx++) {
      const col = st.px[row + lx];
      if (col === -1 || !open(lx, ly)) continue;
      const i = ly * CHUNK_PX + lx;
      // Note: under the crown the shade is sparser, so a courier seen through the canopy hole stays readable.
      const gx = ox + lx;
      const gy = oy + ly;
      if (col >= 0 ? ((gx | gy) & 1) === 0 : ((gx + gy) & 1) === 0) buf[i] = ABGR[C.SHADOW];
      if (col >= 0) {
        top[i] = ABGR[col];
        top.used = true;
      }
    }
  }
}

// Note: the canopy hole is a dithered disc, so crowns thin out around the courier without blended colours.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function holeKey(scene, r) {
  const key = `canopyHole:${r}`;
  if (scene.textures.exists(key)) return key;
  const n = 2 * r;
  const cnv = document.createElement('canvas');
  cnv.width = n;
  cnv.height = n;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = Math.min(1, Math.max(0, (1 - Math.hypot(x + 0.5 - r, y + 0.5 - r) / r) / 0.4));
      if (a * 16 > BAYER[(y & 3) * 4 + (x & 3)]) img.data.fill(255, (y * n + x) * 4, (y * n + x) * 4 + 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, cnv);
  return key;
}

function chunkCanvas() {
  const cnv = document.createElement('canvas');
  cnv.width = CHUNK_PX;
  cnv.height = CHUNK_PX;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(CHUNK_PX, CHUNK_PX);
  return { cnv, ctx, img, buf: new Uint32Array(img.data.buffer) };
}

// Note: returns the ground canvas and, where trees stand, a canopy canvas that is drawn above cars and people.
export function paintChunk(world, cx, cy) {
  const G = chunkCanvas();
  const buf = G.buf;
  const tx0 = cx * CHUNK;
  const ty0 = cy * CHUNK;
  // Note: a three-tile margin covers the widest crown reaching in from a neighbor chunk.
  const M = 3;
  const N = CHUNK + 2 * M;
  const cls = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) cls[y * N + x] = tileAt(world, tx0 + x - M, ty0 + y - M);
  }
  const at = (x, y) => cls[(y + M) * N + (x + M)];
  const seed = world.seed;
  for (let ty = 0; ty < CHUNK; ty++) {
    for (let tx = 0; tx < CHUNK; tx++) {
      const tc = at(tx, ty);
      const nb = { up: at(tx, ty - 1) === tc, down: at(tx, ty + 1) === tc, left: at(tx - 1, ty) === tc, right: at(tx + 1, ty) === tc };
      const uniform = nb.up && nb.down && nb.left && nb.right && at(tx - 1, ty - 1) === tc && at(tx + 1, ty + 1) === tc
        && at(tx + 1, ty - 1) === tc && at(tx - 1, ty + 1) === tc;
      const wxT = (tx0 + tx) * TILE;
      const wyT = (ty0 + ty) * TILE;
      const needRoad = ROADISH.has(tc);
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
          let bc = tc;
          if (!uniform) bc = blockClass(tc, sampleTile(world, tx0 + tx + (bx * 4 + 2) / TILE, ty0 + ty + (by * 4 + 2) / TILE));
          for (let py = 0; py < 4; py++) {
            for (let pxl = 0; pxl < 4; pxl++) {
              const lx = bx * 4 + pxl;
              const ly = by * 4 + py;
              const wx = wxT + lx;
              const wy = wyT + ly;
              const h = u01(hash3(seed, wx, wy));
              let col = paintPixel(bc, lx, ly, wx, wy, h, nb);
              if (needRoad || ROADISH.has(bc)) {
                const m = roadMark(world, wx, wy, bc);
                if (m >= 0) col = m;
              }
              buf[(ty * TILE + ly) * CHUNK_PX + tx * TILE + lx] = ABGR[col];
            }
          }
        }
      }
    }
  }
  // Note: canopies from trees in this chunk and its margin.
  const bare = new Uint8Array(CHUNK * CHUNK);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) bare[y * CHUNK + x] = NO_CANOPY.has(at(x, y)) ? 1 : 0;
  const open = (lx, ly) => !bare[((ly / TILE) | 0) * CHUNK + ((lx / TILE) | 0)];
  const top = new Uint32Array(CHUNK_PX * CHUNK_PX);
  for (let y = -M; y < CHUNK + M; y++) {
    for (let x = -M; x < CHUNK + M; x++) {
      const kind = CANOPY[at(x, y)];
      if (kind) paintCanopy(buf, top, tx0 * TILE, ty0 * TILE, tx0 + x, ty0 + y, seed + 900, kind, open);
    }
  }
  G.ctx.putImageData(G.img, 0, 0);
  if (!top.used) return { ground: G.cnv, canopy: null };
  const K = chunkCanvas();
  K.buf.set(top);
  K.ctx.putImageData(K.img, 0, 0);
  return { ground: G.cnv, canopy: K.cnv };
}

// Note: streams chunk images around the camera; one new chunk per frame keeps hitches small; canopies go into the given layer.
export class ChunkLayer {
  constructor(scene, world, depth = 0, canopy = null) {
    this.scene = scene;
    this.world = world;
    this.depth = depth;
    this.canopy = canopy;
    this.live = new Map();
    this.prefix = `chunk:${world.seedStr}:${world.kind}:`;
  }

  key(cx, cy) {
    return `${this.prefix}${cx},${cy}`;
  }

  ensure(cx, cy) {
    const k = this.key(cx, cy);
    if (this.live.has(k)) return false;
    const { ground, canopy } = paintChunk(this.world, cx, cy);
    const tex = this.scene.textures;
    if (tex.exists(k)) tex.remove(k);
    tex.addCanvas(k, ground);
    const img = this.scene.add.image(cx * CHUNK_PX, cy * CHUNK_PX, k).setOrigin(0, 0).setDepth(this.depth);
    let top = null;
    if (canopy && this.canopy) {
      if (tex.exists(`${k}:top`)) tex.remove(`${k}:top`);
      tex.addCanvas(`${k}:top`, canopy);
      top = this.scene.make.image({ x: cx * CHUNK_PX, y: cy * CHUNK_PX, key: `${k}:top` }, false).setOrigin(0, 0);
      this.canopy.add(top);
    }
    this.live.set(k, { img, top, cx, cy });
    return true;
  }

  update(view, budget = 1) {
    const cx0 = Math.floor((view.x - 64) / CHUNK_PX);
    const cy0 = Math.floor((view.y - 64) / CHUNK_PX);
    const cx1 = Math.floor((view.x + view.width + 64) / CHUNK_PX);
    const cy1 = Math.floor((view.y + view.height + 64) / CHUNK_PX);
    let made = 0;
    // Note: chunks under the view are always painted, even past the budget, so the screen never shows holes.
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.live.has(this.key(cx, cy))) continue;
        const visible = cx * CHUNK_PX < view.x + view.width && (cx + 1) * CHUNK_PX > view.x
          && cy * CHUNK_PX < view.y + view.height && (cy + 1) * CHUNK_PX > view.y;
        if (!visible && made >= budget) continue;
        this.ensure(cx, cy);
        made++;
      }
    }
    for (const [k, c] of this.live) {
      if (c.cx < cx0 - 2 || c.cx > cx1 + 2 || c.cy < cy0 - 2 || c.cy > cy1 + 2) {
        this.drop(k, c);
        this.live.delete(k);
      }
    }
  }

  drop(k, c) {
    c.img.destroy();
    c.top?.destroy();
    for (const key of [k, `${k}:top`]) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }

  destroy() {
    for (const [k, c] of this.live) this.drop(k, c);
    this.live.clear();
  }
}

const ROOFED = new Set([T.WALL, T.FLOOR, T.CARPET, T.COUNTER, T.DOOR]);
const INDOOR = new Set([T.FLOOR, T.CARPET, T.COUNTER]);
const SHELL = new Set([T.WALL, T.DOOR]);
// Note: texels per cell in building and roof images.
const CT = CELL * DENSE;

// Note: one cell-grid building drawn at double density; nb(dx, dy) gives a neighbor's class, 255 outside the block.
function paintCellPixel(cls, lx, ly, wx, wy, h, nb) {
  const p = TILE_PROPS[cls].paint;
  const a0 = p.acc[0];
  const a1 = p.acc[1];
  const L = CT - 1;
  switch (cls) {
    case T.WALL: {
      // Note: a lit top edge, then a dark face where the wall drops to open floor or ground below.
      const down = nb(0, 1);
      if (down !== T.WALL && down !== T.DOOR) {
        if (ly >= L - 2) return ly === L ? C.SHADOW : a0;
      }
      if (nb(0, -1) !== T.WALL && ly === 0) return C.BONE_L;
      if (nb(-1, 0) !== T.WALL && lx === 0) return C.BONE_L;
      if (nb(1, 0) !== T.WALL && lx === L) return a0;
      return h < 0.08 ? a0 : p.base;
    }
    case T.DOOR: {
      // Note: the frame runs along the wall line; the leaf shows a seam and a knob.
      const vert = SHELL.has(nb(0, -1)) || SHELL.has(nb(0, 1));
      const along = vert ? ly : lx;
      const across = vert ? lx : ly;
      const lo = vert ? nb(0, -1) : nb(-1, 0);
      const hi = vert ? nb(0, 1) : nb(1, 0);
      if ((along === 0 && lo !== T.DOOR) || (along === L && hi !== T.DOOR)) return C.SHADOW;
      if (across === 0 || across === L) return a0;
      if (along === (lo === T.DOOR ? 1 : L - 1) && across === 3) return C.AMBER;
      return (along & 3) === 0 ? a0 : p.base;
    }
    case T.FLOOR:
      if ((wy & 3) === 3) return a0;
      if (((wx >> 1) + (wy >> 2) * 5) % 11 === 0) return a0;
      return h < 0.06 ? a1 : p.base;
    case T.COUNTER:
      if (nb(0, -1) !== T.COUNTER && ly === 0) return C.BONE;
      if (nb(-1, 0) !== T.COUNTER && lx === 0) return C.BONE;
      if (nb(0, 1) !== T.COUNTER && ly === L) return C.SHADOW;
      if (nb(1, 0) !== T.COUNTER && lx === L) return a1;
      return h < 0.1 ? a0 : p.base;
    case T.BAY:
      if (nb(-1, 0) !== T.BAY && lx === 0) return C.YELLOW;
      if (nb(1, 0) !== T.BAY && lx === L) return C.YELLOW;
      if (u01(hash3(93, wx >> 3, wy >> 3)) < 0.3 && h < 0.5) return C.ASPH;
      return h < 0.06 ? a1 : p.base;
    case T.PUMP: {
      // Note: a pump island: concrete curb, a white-topped dispenser and a red stripe.
      if (nb(0, -1) !== T.PUMP && ly === 0) return C.BONE;
      if (nb(0, 1) !== T.PUMP && ly === L) return C.SHADOW;
      if (lx >= 2 && lx <= 5 && ly >= 1 && ly <= 6) {
        if (ly === 1) return C.WHITE;
        return lx === 2 || lx === 5 ? C.SHADOW : a0;
      }
      return p.base;
    }
    case T.FENCE: {
      // Note: a single rail through the cell center, a post every second cell.
      const ground = h < 0.1 ? C.GRASS_D : p.base;
      const vert = nb(0, -1) === T.FENCE || nb(0, 1) === T.FENCE;
      const horiz = nb(-1, 0) === T.FENCE || nb(1, 0) === T.FENCE || !vert;
      const post = (((wx >> 3) + (wy >> 3)) & 1) === 0 && lx >= 3 && lx <= 4 && ly >= 3 && ly <= 4;
      if (post) return C.MUD;
      if (horiz && (ly === 3 || ly === 4)) return ly === 3 ? C.DUST : C.SHADOW;
      if (vert && (lx === 3 || lx === 4)) return lx === 3 ? C.DUST : C.SHADOW;
      return ground;
    }
    default:
      return paintPixel(cls, lx * 2, ly * 2, wx, wy, h, { up: nb(0, -1) === cls, down: nb(0, 1) === cls, left: nb(-1, 0) === cls, right: nb(1, 0) === cls });
  }
}

// Note: a building block as a canvas at double density, transparent where the block leaves the ground showing.
export function paintStruct(st, seed) {
  const w = st.w * CT;
  const h = st.h * CT;
  const cnv = document.createElement('canvas');
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const buf = new Uint32Array(img.data.buffer);
  const at = (x, y) => (x < 0 || y < 0 || x >= st.w || y >= st.h ? 255 : st.grid[y * st.w + x]);
  for (let cy = 0; cy < st.h; cy++) {
    for (let cx = 0; cx < st.w; cx++) {
      const cls = at(cx, cy);
      if (cls === 255) continue;
      const nb = (dx, dy) => at(cx + dx, cy + dy);
      for (let ly = 0; ly < CT; ly++) {
        for (let lx = 0; lx < CT; lx++) {
          const wx = (st.x + cx) * CT + lx;
          const wy = (st.y + cy) * CT + ly;
          buf[(cy * CT + ly) * w + cx * CT + lx] = ABGR[paintCellPixel(cls, lx, ly, wx, wy, u01(hash3(seed + 7, wx, wy)), nb)];
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

// Note: one roof per connected building, in public cells; doors merge into one opening per run of door cells.
export function buildRoofs(world) {
  const roofs = [];
  for (const s of world.structs) {
    const seen = new Uint8Array(s.w * s.h);
    for (let i = 0; i < s.grid.length; i++) {
      if (seen[i] || !ROOFED.has(s.grid[i])) continue;
      const stack = [i];
      const cells = [];
      let indoor = 0;
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop();
        cells.push(j);
        if (INDOOR.has(s.grid[j])) indoor++;
        const x = j % s.w;
        const y = (j / s.w) | 0;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
          const k = ny * s.w + nx;
          if (!seen[k] && ROOFED.has(s.grid[k])) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      if (!indoor) continue;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const set = new Set();
      for (const j of cells) {
        const x = s.x + (j % s.w);
        const y = s.y + ((j / s.w) | 0);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
        set.add(`${x},${y}`);
      }
      const doors = [];
      const done = new Set();
      for (const j of cells.sort((p, q) => p - q)) {
        if (s.grid[j] !== T.DOOR || done.has(j)) continue;
        let a = j;
        let b = j;
        const step = s.grid[j + 1] === T.DOOR && (j + 1) % s.w ? 1 : s.w;
        while (b + step < s.grid.length && s.grid[b + step] === T.DOOR && (step === s.w || (b + step) % s.w)) b += step;
        for (let k = a; k <= b; k += step) done.add(k);
        const ax = s.x + (a % s.w);
        const ay = s.y + ((a / s.w) | 0);
        const bx = s.x + (b % s.w);
        const by = s.y + ((b / s.w) | 0);
        doors.push({ x: (ax + bx + 1) / 2, y: (ay + by + 1) / 2, w: bx - ax + 1, h: by - ay + 1 });
      }
      roofs.push({ id: `${s.id}:roof${roofs.length}`, site: s.site, type: s.type, x0, y0, x1, y1, set, doors });
    }
  }
  return roofs;
}

// Note: roofs are drawn at double density too; one cell is CT texels.
export function paintRoof(roof, seed) {
  const w = (roof.x1 - roof.x0 + 1) * CT;
  const h = (roof.y1 - roof.y0 + 1) * CT;
  const cnv = document.createElement('canvas');
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const buf = new Uint32Array(img.data.buffer);
  const metal = roof.type === 'gas' || roof.type === 'garage' || roof.type === 'refinery' || roof.type === 'farm';
  const horiz = w >= h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = roof.x0 + Math.floor(x / CT);
      const ty = roof.y0 + Math.floor(y / CT);
      if (!roof.set.has(`${tx},${ty}`)) continue;
      const edge = !roof.set.has(`${tx + (x % CT === CT - 1 ? 1 : x % CT === 0 ? -1 : 0)},${ty + (y % CT === CT - 1 ? 1 : y % CT === 0 ? -1 : 0)}`);
      const hsh = u01(hash3(seed, roof.x0 * CT + x, roof.y0 * CT + y));
      let col;
      if (metal) {
        const band = horiz ? x : y;
        col = band % 4 === 0 ? C.RUST_D : band % 4 === 1 ? C.RUST_L : C.RUST;
        if (hsh < 0.05) col = C.MUD;
      } else {
        const row = horiz ? y : x;
        col = row % 4 === 0 ? C.ASPH_D : hsh < 0.1 ? C.ASPH_L : C.ASPH;
      }
      const ridge = horiz ? Math.abs(y - h / 2) < 1 : Math.abs(x - w / 2) < 1;
      if (ridge) col = metal ? C.RUST_D : C.DUST;
      if (edge) col = C.SHADOW;
      buf[y * w + x] = ABGR[col];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

export const isIndoorTile = (t) => TILE_PROPS[t].indoor;
