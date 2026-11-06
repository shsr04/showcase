// Note: code-defined pixel art; every texture is drawn into a canvas with palette colors at boot or on first use.

import { PAL, C, rgb } from './palette.js';
import { VEHICLE } from './vehicles.js';
import { PX_PER_M } from './config.js';
import { hash3, u01 } from './rand.js';

const cache = new Set();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function px(ctx, x, y, col, w = 1, h = 1) {
  ctx.fillStyle = PAL[col];
  ctx.fillRect(x, y, w, h);
}

function add(scene, key, cnv) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cnv);
  cache.add(key);
  return key;
}

// Note: a palette-index grid for the denser art; -1 stays transparent.
function grid(w, h) {
  const g = new Int16Array(w * h).fill(-1);
  return {
    w,
    h,
    g,
    get: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : g[y * w + x]),
    set(x, y, c) {
      if (x >= 0 && y >= 0 && x < w && y < h) g[y * w + x] = c;
    },
    rect(x, y, rw, rh, c) {
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) this.set(i, j, c);
    },
  };
}

function blit(ctx, G) {
  const img = ctx.createImageData(G.w, G.h);
  for (let i = 0; i < G.g.length; i++) {
    if (G.g[i] < 0) continue;
    const [r, g, b] = rgb(G.g[i]);
    img.data.set([r, g, b, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
}

// Note: lit and shaded neighbors of each paint color, for the denser art.
const SHADE = {
  [C.VOID]: [C.SHADOW, C.VOID],
  [C.SHADOW]: [C.ASPH_D, C.VOID],
  [C.ASPH_D]: [C.ASPH, C.SHADOW],
  [C.CONC]: [C.DUST, C.ASPH_L],
  [C.DUST]: [C.BONE, C.CONC],
  [C.BONE]: [C.BONE_L, C.DUST],
  [C.BONE_L]: [C.WHITE, C.BONE],
  [C.WHITE]: [C.WHITE, C.BONE_L],
  [C.MAROON]: [C.RED, C.RUST_D],
  [C.RED]: [C.RUST_L, C.MAROON],
  [C.STEEL]: [C.WATER_L, C.NAVY],
  [C.NAVY]: [C.STEEL, C.WATER_D],
  [C.AMBER]: [C.YELLOW, C.RUST_L],
  [C.GRASS_D]: [C.GRASS, C.MARSH_D],
  [C.DIRT_L]: [C.SAND, C.DIRT],
  [C.RUST]: [C.RUST_L, C.RUST_D],
  [C.RUST_D]: [C.RUST, C.SHADOW],
};
const lite = (c) => SHADE[c]?.[0] ?? c;
const deep = (c) => SHADE[c]?.[1] ?? c;

// Note: a wreck's lost hood and tire are picked from its seed, so both densities show the same car.
function wreckLoss(wreck, seed) {
  if (!wreck) return { hood: false, tire: -1, burnt: false };
  return {
    hood: u01(hash3(seed, 11, 3)) < 0.3,
    tire: u01(hash3(seed, 12, 3)) < 0.35 ? Math.floor(u01(hash3(seed, 13, 3)) * 4) : -1,
    burnt: u01(hash3(seed, 7, 7)) < 0.25,
  };
}

const RUST = [C.RUST_D, C.RUST, C.MUD, C.SHADOW];
const fine3 = (seed, x, y) => u01(hash3(seed + 3, x, y)) < 0.3;

// Note: section layout along the body from rear (0) to front (1).
const LAYOUT = {
  sedan: { trunk: 0.2, rearGlass: 0.3, roof: 0.55, wind: 0.67 },
  coupe: { trunk: 0.15, rearGlass: 0.3, roof: 0.5, wind: 0.62 },
  compact: { trunk: 0.12, rearGlass: 0.25, roof: 0.55, wind: 0.68 },
  suv: { trunk: 0.02, rearGlass: 0.08, roof: 0.62, wind: 0.72 },
  van: { trunk: 0.02, rearGlass: 0.05, roof: 0.75, wind: 0.85 },
  pickup: { bed: 0.42, trunk: 0.42, rearGlass: 0.46, roof: 0.62, wind: 0.72 },
};

// Note: paint = {body, trim, police, stripe}; wreck adds rust, broken glass and missing panels; d is texels per world px.
export function drawCar(model, paint, wreck = 0, seed = 1, d = 1) {
  const v = VEHICLE[model];
  const L = v.len * d;
  const W = v.wid * d;
  const cnv = canvas(L, W);
  const ctx = cnv.getContext('2d');
  if (v.body === 'bike') return d === 2 ? drawBikeFine(cnv, ctx, paint, wreck) : drawBike(cnv, ctx, paint, wreck);
  if (d === 2) return drawCarFine(cnv, ctx, v, paint, wreck, seed);
  const lay = LAYOUT[v.body];
  const X = (f) => Math.round(f * L);
  const body = paint.body;
  const dark = C.SHADOW;
  const lost = wreckLoss(wreck, seed);
  // Note: wheels poke out at the corners.
  const wf = X(0.78);
  const wr = X(0.16);
  [wr, wf].forEach((wx, i) => {
    if (lost.tire !== i * 2) px(ctx, wx - 2, 0, C.VOID, 5, 1);
    if (lost.tire !== i * 2 + 1) px(ctx, wx - 2, W - 1, C.VOID, 5, 1);
  });
  px(ctx, 0, 1, body, L, W - 2);
  // Note: rounded corners and a dark outline read well at 1x.
  for (const [x, y] of [[0, 1], [L - 1, 1], [0, W - 2], [L - 1, W - 2]]) px(ctx, x, y, C.VOID);
  px(ctx, 1, 1, dark, L - 2, 1);
  px(ctx, 1, W - 2, dark, L - 2, 1);
  px(ctx, 0, 2, dark, 1, W - 4);
  px(ctx, L - 1, 2, dark, 1, W - 4);
  if (paint.police) {
    // Note: black-and-white: black hood and trunk, white doors and roof.
    px(ctx, X(lay.trunk) + 1, 2, paint.trim, X(lay.wind) - X(lay.trunk) - 1, W - 4);
  }
  if (lay.bed) {
    px(ctx, 2, 3, C.ASPH_D, X(lay.bed) - 3, W - 6);
    px(ctx, 1, 2, paint.trim ?? body, X(lay.bed) - 1, 1);
    px(ctx, 1, W - 3, paint.trim ?? body, X(lay.bed) - 1, 1);
  }
  const glass = wreck ? C.SHADOW : C.NAVY;
  px(ctx, X(lay.trunk), 3, glass, Math.max(1, X(lay.rearGlass) - X(lay.trunk)), W - 6);
  const roofCol = paint.police ? paint.trim : paint.roof ?? body;
  px(ctx, X(lay.rearGlass), 3, roofCol, X(lay.roof) - X(lay.rearGlass), W - 6);
  px(ctx, X(lay.roof), 2, glass, X(lay.wind) - X(lay.roof), W - 4);
  // Note: side windows as thin dark lines along the cabin.
  px(ctx, X(lay.rearGlass), 2, glass, X(lay.roof) - X(lay.rearGlass), 1);
  px(ctx, X(lay.rearGlass), W - 3, glass, X(lay.roof) - X(lay.rearGlass), 1);
  if (paint.stripe != null) px(ctx, X(lay.wind), Math.floor(W / 2) - 1, paint.stripe, L - X(lay.wind) - 1, 2);
  if (paint.police) {
    const lb = Math.round((X(lay.rearGlass) + X(lay.roof)) / 2);
    px(ctx, lb, 3, C.RED, 2, Math.floor((W - 6) / 2));
    px(ctx, lb, 3 + Math.floor((W - 6) / 2), C.BLUE, 2, Math.ceil((W - 6) / 2));
    px(ctx, L - 3, 2, C.STEEL, 2, W - 4);
  }
  if (paint.ram) px(ctx, L - 2, 1, C.CONC, 2, W - 2);
  if (lost.hood) px(ctx, X(lay.wind) + 1, 3, C.ASPH_D, L - X(lay.wind) - 3, W - 6);
  // Note: mirrors, headlights, taillights.
  px(ctx, X(lay.roof) + 1, 0, body);
  px(ctx, X(lay.roof) + 1, W - 1, body);
  px(ctx, L - 1, 2, wreck ? C.ASPH : C.BONE_L, 1, 2);
  px(ctx, L - 1, W - 4, wreck ? C.ASPH : C.BONE_L, 1, 2);
  px(ctx, 0, 2, C.RED, 1, 2);
  px(ctx, 0, W - 4, C.RED, 1, 2);
  if (wreck) {
    const id = ctx.getImageData(0, 0, L, W);
    const dt = id.data;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < L; x++) {
        const i = (y * L + x) * 4;
        if (dt[i + 3] === 0) continue;
        const h = u01(hash3(seed, x, y));
        let col = -1;
        if (lost.burnt && h < 0.75) col = h < 0.4 ? C.SHADOW : h < 0.6 ? C.RUST_D : C.ASPH_D;
        else if (h < 0.18) col = RUST[Math.floor(h * 22) % 4];
        else if (h > 0.97) col = C.BONE;
        if (col >= 0) {
          const hex = PAL[col];
          dt[i] = parseInt(hex.slice(1, 3), 16);
          dt[i + 1] = parseInt(hex.slice(3, 5), 16);
          dt[i + 2] = parseInt(hex.slice(5, 7), 16);
        }
      }
    }
    ctx.putImageData(id, 0, 0);
  }
  return cnv;
}

// Note: the on-foot car at two texels per world px; layers run tires, body, panels, outline, then edge details.
function drawCarFine(cnv, ctx, v, paint, wreck, seed) {
  const L = cnv.width;
  const W = cnv.height;
  const G = grid(L, W);
  const lay = LAYOUT[v.body];
  const X = (f) => Math.round(f * L);
  const body = paint.body;
  const top = paint.police ? paint.trim : paint.roof ?? body;
  const door = paint.police ? paint.trim : body;
  const glass = wreck ? C.SHADOW : C.NAVY;
  const line = body === C.SHADOW || body === C.VOID ? C.VOID : C.SHADOW;
  const lost = wreckLoss(wreck, seed);
  const mid = W >> 1;
  const xt = X(lay.trunk);
  const xg = X(lay.rearGlass);
  const xr = X(lay.roof);
  const xw = X(lay.wind);
  // Note: tire length is the real tire diameter; the outer row alternates for tread.
  const tire = Math.round((v.drive.tire / Math.PI) * PX_PER_M * 2);
  const wheels = [X(0.16), X(0.78)];
  wheels.forEach((wx, i) => {
    for (const side of [0, 1]) {
      if (lost.tire === i * 2 + side) continue;
      const x0 = wx - (tire >> 1);
      G.rect(x0, side ? W - 2 : 0, tire, 2, C.VOID);
      for (let k = 1; k < tire; k += 2) G.set(x0 + k, side ? W - 1 : 0, C.SHADOW);
    }
  });
  // Note: the body narrows over the last two texels at each end for rounded bumpers.
  const inset = (x) => (x === 0 || x === L - 1 ? 2 : x === 1 || x === L - 2 ? 1 : 0);
  const inBody = (x, y) => x >= 0 && x < L && y >= 1 + inset(x) && y <= W - 2 - inset(x);
  for (let x = 0; x < L; x++) for (let y = 1 + inset(x); y <= W - 2 - inset(x); y++) G.set(x, y, body);
  // Note: wheel arches darken the flank over each tire.
  for (const wx of wheels) {
    G.rect(wx - (tire >> 1) + 1, 2, tire - 2, 1, deep(body));
    G.rect(wx - (tire >> 1) + 1, W - 3, tire - 2, 1, deep(body));
  }
  // Note: doors run from the trunk to the cowl; police doors are white.
  G.rect(xt + 1, 2, xw - xt - 1, 1, door);
  G.rect(xt + 1, W - 3, xw - xt - 1, 1, door);
  if (paint.police) {
    G.rect(xt + 1, 3, xw - xt - 1, W - 6, door);
  }
  // Note: hood and trunk lid gaps.
  G.rect(xw + 1, 3, L - xw - 3, 1, deep(body));
  G.rect(xw + 1, W - 4, L - xw - 3, 1, deep(body));
  G.rect(xw, 3, 1, W - 6, deep(body));
  if (!lay.bed) {
    G.rect(2, 3, xt - 1, 1, deep(body));
    G.rect(2, W - 4, xt - 1, 1, deep(body));
    G.rect(xt, 3, 1, W - 6, deep(body));
  }
  if (v.body === 'coupe') {
    // Note: the GT's hood scoop.
    G.rect(xw + 4, mid - 2, 4, 4, deep(body));
    G.rect(xw + 7, mid - 1, 1, 2, C.VOID);
  }
  if (lay.bed) {
    const xb = X(lay.bed);
    const rail = paint.trim ?? body;
    G.rect(3, 3, xb - 4, W - 6, C.ASPH_D);
    for (let y = 4; y < W - 4; y += 3) G.rect(3, y, xb - 4, 1, C.ASPH);
    G.rect(1, 2, xb - 1, 1, rail);
    G.rect(1, W - 3, xb - 1, 1, rail);
    G.rect(xb - 1, 2, 1, W - 4, body);
    G.rect(2, 3, 1, W - 6, deep(body));
    // Note: wheel wells bulge into the bed.
    G.rect(wheels[0] - (tire >> 1) + 1, 3, tire - 2, 2, C.ASPH_L);
    G.rect(wheels[0] - (tire >> 1) + 1, W - 5, tire - 2, 2, C.ASPH_L);
  }
  // Note: cabin: rear glass, roof between side glass, windshield wider at the cowl; panes are tracked for broken glass.
  const pane = new Uint8Array(L * W);
  const glassRect = (x, y, w, h) => {
    G.rect(x, y, w, h, glass);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pane[j * L + i] = 1;
  };
  for (let x = xt; x < xg; x++) {
    const t = x === xt && xg - xt > 2 ? 1 : 0;
    glassRect(x, 4 + t, 1, W - 8 - 2 * t);
  }
  G.rect(xg, 4, xr - xg, W - 8, top);
  glassRect(xg - 1, 3, xr - xg + 2, 1);
  glassRect(xg - 1, W - 4, xr - xg + 2, 1);
  for (let x = xr; x < xw; x++) {
    const t = x === xr ? 1 : 0;
    glassRect(x, 3 + t, 1, W - 6 - 2 * t);
  }
  if (!wreck) {
    // Note: a sky glint across both glasses.
    for (let k = 0; k < 3; k++) G.set(xr + 1 + k, 5 + k, C.STEEL);
    if (xw - xr > 3) G.set(xr + 2, 5, C.WATER_L);
    if (xg - xt > 2) G.set(xt + 1, 6, C.STEEL);
  }
  // Note: pillars split the side glass; seams mark the doors.
  const bp = Math.round((xg + xr) / 2);
  const seams = v.body === 'coupe' || lay.bed ? [xw - 1] : v.body === 'van' ? [xw - 1, X(0.62)] : [xw - 1, bp];
  if (v.body !== 'coupe' && !lay.bed && v.body !== 'van') seams.push(xg);
  for (const sx of seams) {
    G.rect(sx, 2, 1, 2, deep(door));
    G.rect(sx, W - 4, 1, 2, deep(door));
  }
  if (v.body !== 'van') {
    G.set(bp, 3, top);
    G.set(bp, W - 4, top);
  }
  if (v.body === 'suv') {
    // Note: roof rails with two crossbars.
    G.rect(xg + 2, 5, xr - xg - 4, 1, C.ASPH_L);
    G.rect(xg + 2, W - 6, xr - xg - 4, 1, C.ASPH_L);
    for (const cx of [xg + 5, xr - 5]) G.rect(cx, 5, 1, W - 10, C.ASPH_L);
  }
  if (v.body === 'van') {
    for (let x = xg + 3; x < xr - 1; x += 4) G.rect(x, 4, 1, W - 8, deep(top));
  }
  if (paint.stripe != null) {
    G.rect(xw + 1, mid - 3, L - xw - 3, 2, paint.stripe);
    G.rect(xw + 1, mid + 1, L - xw - 3, 2, paint.stripe);
  }
  if (lost.hood) {
    // Note: an open engine bay: block, valve covers and radiator.
    G.rect(xw + 2, 3, L - xw - 5, W - 6, C.ASPH_D);
    G.rect(xw + 3, mid - 3, Math.max(2, L - xw - 9), 6, C.ASPH_L);
    G.rect(xw + 3, mid - 3, Math.max(2, L - xw - 9), 1, C.STEEL);
    G.rect(xw + 3, mid + 2, Math.max(2, L - xw - 9), 1, C.STEEL);
    G.rect(L - 4, 4, 1, W - 8, C.SHADOW);
  }
  // Note: outline wherever the body meets open air.
  for (let x = 0; x < L; x++) {
    for (let y = 0; y < W; y++) {
      if (!inBody(x, y)) continue;
      if (!inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1)) G.set(x, y, line);
    }
  }
  // Note: lights sit in the bumpers; mirrors stand off the doors.
  const head = wreck ? C.ASPH : C.BONE_L;
  G.rect(L - 2, 3, 2, 2, head);
  G.rect(L - 2, W - 5, 2, 2, head);
  if (!wreck) {
    G.set(L - 1, 3, C.WHITE);
    G.set(L - 1, W - 4, C.WHITE);
  }
  G.rect(0, 3, 2, 2, C.RED);
  G.rect(0, W - 5, 2, 2, C.RED);
  G.set(1, 4, C.MAROON);
  G.set(1, W - 5, C.MAROON);
  for (let y = 6; y < W - 6; y += 2) G.set(L - 2, y, deep(body) === line ? C.ASPH_D : deep(body));
  G.rect(xr + 1, 0, 2, 1, door === body ? deep(body) : deep(door));
  G.rect(xr + 1, W - 1, 2, 1, door === body ? deep(body) : deep(door));
  G.set(xr + 1, 1, line);
  G.set(xr + 1, W - 2, line);
  if (paint.police) {
    // Note: light bar across the roof, push bar on the nose, spotlight by the driver's mirror.
    const lb = bp - 1;
    G.rect(lb - 1, 4, 5, W - 8, C.SHADOW);
    const half = (W - 10) >> 1;
    G.rect(lb, 5, 3, half, wreck ? C.RUST_D : C.RED);
    G.rect(lb, 5 + half, 3, W - 10 - half, wreck ? C.NAVY : C.BLUE);
    G.rect(lb, mid - 1, 3, 1, C.CONC);
    G.rect(L - 1, 5, 1, W - 10, C.STEEL);
    G.rect(L - 2, 5, 1, W - 10, C.SHADOW);
    G.set(L - 2, 6, C.STEEL);
    G.set(L - 2, W - 7, C.STEEL);
    G.set(xr + 3, 2, C.CONC);
  }
  if (paint.ram) {
    G.rect(L - 3, 2, 3, W - 4, C.CONC);
    G.rect(L - 3, 2, 1, W - 4, C.SHADOW);
    G.set(L - 2, 4, C.ASPH_L);
    G.set(L - 2, W - 5, C.ASPH_L);
  }
  if (wreck) {
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < L; x++) {
        const c = G.get(x, y);
        if (c < 0) continue;
        // Note: rust grows in 4x4 blots with ragged rims; a burnt shell chars over most blots.
        const blot = u01(hash3(seed + 2, (x + (fine3(seed, x, y) ? 1 : 0)) >> 2, y >> 2));
        const fine = u01(hash3(seed + 1, x, y));
        let col = -1;
        if (pane[y * L + x] && c === glass) col = fine < 0.1 ? C.ASPH_L : fine < 0.14 ? C.BONE : -1;
        else if (lost.burnt && blot < 0.75) col = fine < 0.45 ? C.SHADOW : fine < 0.7 ? C.ASPH_D : fine < 0.9 ? C.RUST_D : C.ASPH;
        else if (blot < 0.2) col = fine < 0.45 ? C.RUST_D : fine < 0.85 ? C.RUST : C.MUD;
        else if (fine < 0.03) col = fine < 0.02 ? C.RUST_D : C.BONE;
        if (col >= 0) G.set(x, y, col);
      }
    }
  }
  blit(ctx, G);
  return cnv;
}

// Note: a dirt bike with its rider, seen from above, front at +x.
function drawBike(cnv, ctx, paint, wreck) {
  const L = cnv.width;
  const W = cnv.height;
  const y0 = (W >> 1) - 1;
  px(ctx, 0, y0, C.VOID, 2, 2);
  px(ctx, L - 2, y0, C.VOID, 2, 2);
  px(ctx, 2, y0, paint.body, L - 4, 2);
  px(ctx, L - 4, 0, C.CONC, 1, W);
  if (!wreck) {
    px(ctx, Math.round(L * 0.3), 0, paint.trim ?? C.SHADOW, Math.round(L * 0.3), W);
    px(ctx, Math.round(L * 0.42), y0, C.DIRT_L, 2, 2);
  }
  return cnv;
}

// Note: the on-foot bike: knobby tires, tank, seat, bars, and a rider leaning over the tank.
function drawBikeFine(cnv, ctx, paint, wreck) {
  const L = cnv.width;
  const W = cnv.height;
  const G = grid(L, W);
  const m = W >> 1;
  for (const x0 of [0, L - 6]) {
    G.rect(x0, m - 1, 6, 2, C.VOID);
    G.set(x0 + 1, m - 2, C.SHADOW);
    G.set(x0 + 4, m - 2, C.SHADOW);
    G.set(x0 + 1, m + 1, C.SHADOW);
    G.set(x0 + 4, m + 1, C.SHADOW);
  }
  G.rect(5, m - 1, L - 10, 2, C.ASPH_L);
  G.rect(Math.round(L * 0.45), m - 2, Math.round(L * 0.25), 4, paint.body);
  G.rect(Math.round(L * 0.45), m - 2, Math.round(L * 0.25), 1, lite(paint.body));
  G.rect(Math.round(L * 0.25), m - 1, Math.round(L * 0.2), 2, C.SHADOW);
  G.rect(L - 7, 0, 1, W, C.CONC);
  G.set(L - 7, 0, C.SHADOW);
  G.set(L - 7, W - 1, C.SHADOW);
  G.set(L - 1, m - 1, wreck ? C.ASPH : C.BONE_L);
  if (!wreck) {
    const jacket = paint.trim ?? C.SHADOW;
    const rx = Math.round(L * 0.3);
    G.rect(rx, 1, 5, W - 2, jacket);
    G.rect(rx, 1, 1, W - 2, deep(jacket));
    G.rect(rx + 5, 1, L - 7 - rx - 5, 1, jacket);
    G.rect(rx + 5, W - 2, L - 7 - rx - 5, 1, jacket);
    G.rect(rx + 2, m - 1, 3, 2, C.DIRT_L);
    G.rect(rx + 2, m - 1, 2, 2, C.SHADOW);
    G.set(rx + 4, m - 1, C.STEEL);
  }
  blit(ctx, G);
  return cnv;
}

export function paintFor(model, variant = 0) {
  const v = VEHICLE[model];
  const cols = v.colors;
  if (v.police) return { body: cols[0], trim: cols[1], police: true };
  return { body: cols[variant % cols.length], trim: cols[(variant + 1) % cols.length] };
}

export function carKey(scene, model, paint, wreck = 0, seed = 1, d = 1) {
  const key = `car:${model}:${paint.body}:${paint.trim ?? ''}:${paint.police ? 1 : 0}:${paint.stripe ?? ''}:${paint.ram ? 1 : 0}:${wreck ? seed : 0}:${d}`;
  if (!cache.has(key)) add(scene, key, drawCar(model, paint, wreck, seed, d));
  return key;
}

// Note: people face +x; looks pick shirt, head and accent colors.
export const LOOKS = {
  courier: { shirt: C.DIRT_L, dark: C.DIRT, head: C.MUD, hat: null },
  company: { shirt: C.STEEL, dark: C.NAVY, head: C.DIRT_L, hat: C.YELLOW },
  brigade: { shirt: C.RUST_D, dark: C.SHADOW, head: C.DIRT_L, hat: C.RED },
  coop: { shirt: C.GRASS, dark: C.GRASS_D, head: C.MUD, hat: C.STRAW },
  drifters: { shirt: C.DUST, dark: C.ASPH, head: C.DIRT_L, hat: null },
  residents: { shirt: C.BONE, dark: C.WATER, head: C.MUD, hat: null },
  mechanic: { shirt: C.NAVY, dark: C.SHADOW, head: C.DIRT_L, hat: C.RED },
  local: { shirt: C.MAROON, dark: C.RUST_D, head: C.MUD, hat: null },
  clerk: { shirt: C.WATER_L, dark: C.WATER, head: C.DIRT_L, hat: null },
  preacher: { shirt: C.SHADOW, dark: C.VOID, head: C.MUD, hat: null },
  hunter: { shirt: C.SHADOW, dark: C.VOID, head: C.DIRT_L, hat: C.DIRT },
  broker: { shirt: C.BONE_L, dark: C.CONC, head: C.DIRT_L, hat: null },
  elder: { shirt: C.STRAW, dark: C.DIRT, head: C.BONE, hat: null },
  doc: { shirt: C.MAROON, dark: C.SHADOW, head: C.BONE, hat: C.WATER_L },
};

function drawPerson(look, frame, armed) {
  const cnv = canvas(12, 12);
  const ctx = cnv.getContext('2d');
  const L = LOOKS[look] || LOOKS.local;
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  // Note: feet peek out ahead and behind while walking.
  if (step) {
    px(ctx, 6 + step * 2, 3, C.SHADOW, 2, 2);
    px(ctx, 6 - step * 2, 7, C.SHADOW, 2, 2);
  }
  px(ctx, 4, 2, L.dark, 4, 8);
  px(ctx, 3, 3, L.dark, 6, 6);
  px(ctx, 4, 3, L.shirt, 4, 6);
  px(ctx, 5, 2, L.shirt, 2, 8);
  if (armed) px(ctx, 8, 7, C.VOID, 4, 1);
  else px(ctx, 7, 2 + (step > 0 ? 0 : 1), L.head, 1, 1);
  px(ctx, 5, 4, L.hat ?? L.head, 3, 4);
  px(ctx, 6, 5, L.hat ? L.hat : C.SHADOW, 1, 2);
  return cnv;
}

// Note: the car-view person at one texel per world px: shirt around the shoulders, head or hat on top.
function drawPersonTiny(look, frame, armed) {
  const cnv = canvas(6, 6);
  const ctx = cnv.getContext('2d');
  const L = LOOKS[look] || LOOKS.local;
  if (frame) px(ctx, frame === 1 ? 4 : 0, frame === 1 ? 1 : 4, C.SHADOW);
  px(ctx, 1, 1, L.shirt, 3, 4);
  px(ctx, 1, 1, L.dark);
  px(ctx, 1, 4, L.dark);
  px(ctx, 2, 2, L.hat ?? L.head, 2, 2);
  if (armed) px(ctx, 4, 3, C.VOID, 2, 1);
  return cnv;
}

// Note: d is texels per world px; d=2 is the on-foot art, d=1 the half-size car-view art.
export function personKey(scene, look, frame = 0, armed = false, d = 2) {
  const key = `p:${look}:${frame}:${armed ? 1 : 0}:${d}`;
  if (!cache.has(key)) add(scene, key, d === 2 ? drawPerson(look, frame, armed) : drawPersonTiny(look, frame, armed));
  return key;
}

function drawBodyTiny(look) {
  const cnv = canvas(8, 6);
  const ctx = cnv.getContext('2d');
  const L = LOOKS[look] || LOOKS.local;
  px(ctx, 1, 2, C.MAROON, 6, 3);
  px(ctx, 0, 3, C.RUST_D, 7, 1);
  px(ctx, 1, 2, L.shirt, 4, 2);
  px(ctx, 5, 2, L.head, 2, 2);
  return cnv;
}

function drawBody(look) {
  const cnv = canvas(16, 12);
  const ctx = cnv.getContext('2d');
  const L = LOOKS[look] || LOOKS.local;
  px(ctx, 2, 5, C.MAROON, 11, 5);
  px(ctx, 1, 6, C.RUST_D, 13, 3);
  px(ctx, 3, 4, L.shirt, 8, 4);
  px(ctx, 11, 4, L.head, 3, 3);
  px(ctx, 1, 4, C.SHADOW, 3, 2);
  return cnv;
}

const PROPS = {
  crate(ctx) {
    px(ctx, 1, 2, C.DIRT, 10, 8);
    px(ctx, 1, 2, C.DIRT_L, 10, 2);
    px(ctx, 1, 9, C.MUD, 10, 1);
    px(ctx, 5, 2, C.MUD, 2, 8);
  },
  case(ctx) {
    px(ctx, 2, 3, C.SHADOW, 8, 6);
    px(ctx, 3, 4, C.STEEL, 6, 4);
    px(ctx, 5, 2, C.SHADOW, 2, 1);
  },
  folder(ctx) {
    px(ctx, 2, 3, C.SHADOW, 8, 7);
    px(ctx, 2, 2, C.STRAW, 7, 7);
    px(ctx, 3, 4, C.BONE, 5, 1);
    px(ctx, 3, 6, C.BONE, 4, 1);
  },
  radio(ctx) {
    px(ctx, 1, 3, C.SHADOW, 10, 7);
    px(ctx, 1, 2, C.CONC, 10, 7);
    px(ctx, 2, 3, C.ASPH_D, 4, 3);
    px(ctx, 7, 3, C.AMBER, 2, 2);
    px(ctx, 7, 6, C.RED, 1, 1);
    px(ctx, 9, 0, C.STEEL, 1, 3);
  },
  lamp(ctx) {
    px(ctx, 4, 4, C.SHADOW, 4, 4);
    px(ctx, 5, 5, C.AMBER, 2, 2);
  },
  fire(ctx) {
    px(ctx, 2, 6, C.ASPH, 8, 3);
    px(ctx, 4, 3, C.RUST_L, 4, 4);
    px(ctx, 5, 2, C.YELLOW, 2, 3);
  },
  barrier(ctx) {
    px(ctx, 0, 3, C.CONC, 12, 6);
    px(ctx, 0, 3, C.BONE, 12, 1);
    px(ctx, 2, 5, C.RED, 2, 2);
    px(ctx, 8, 5, C.RED, 2, 2);
  },
  spikes(ctx) {
    for (let x = 0; x < 12; x += 3) px(ctx, x, 5, C.CONC, 2, 2);
    px(ctx, 0, 6, C.SHADOW, 12, 1);
  },
  bike(ctx) {
    px(ctx, 0, 5, C.VOID, 3, 2);
    px(ctx, 9, 5, C.VOID, 3, 2);
    px(ctx, 2, 5, C.RUST, 8, 2);
    px(ctx, 8, 3, C.CONC, 1, 6);
  },
};

// Note: half-size props for the car view.
const PROPS_TINY = {
  crate(ctx) {
    px(ctx, 1, 1, C.DIRT, 5, 4);
    px(ctx, 1, 1, C.DIRT_L, 5, 1);
    px(ctx, 1, 4, C.MUD, 5, 1);
    px(ctx, 3, 1, C.MUD, 1, 4);
  },
  case(ctx) {
    px(ctx, 1, 2, C.SHADOW, 4, 3);
    px(ctx, 1, 2, C.STEEL, 4, 2);
    px(ctx, 2, 1, C.SHADOW, 2, 1);
  },
  folder(ctx) {
    px(ctx, 1, 2, C.SHADOW, 4, 3);
    px(ctx, 1, 1, C.STRAW, 4, 3);
    px(ctx, 2, 2, C.BONE, 2, 1);
  },
  radio(ctx) {
    px(ctx, 0, 2, C.SHADOW, 6, 3);
    px(ctx, 0, 1, C.CONC, 6, 3);
    px(ctx, 1, 2, C.ASPH_D, 2, 1);
    px(ctx, 4, 2, C.AMBER, 1, 1);
    px(ctx, 5, 0, C.STEEL, 1, 1);
  },
  lamp(ctx) {
    px(ctx, 2, 2, C.SHADOW, 2, 2);
    px(ctx, 2, 2, C.AMBER, 1, 1);
  },
  fire(ctx) {
    px(ctx, 1, 3, C.ASPH, 4, 2);
    px(ctx, 2, 2, C.RUST_L, 2, 2);
    px(ctx, 2, 1, C.YELLOW, 1, 2);
  },
  barrier(ctx) {
    px(ctx, 0, 2, C.CONC, 6, 3);
    px(ctx, 0, 2, C.BONE, 6, 1);
    px(ctx, 1, 3, C.RED, 1, 1);
    px(ctx, 4, 3, C.RED, 1, 1);
  },
  spikes(ctx) {
    px(ctx, 0, 3, C.SHADOW, 6, 1);
    for (let x = 0; x < 6; x += 2) px(ctx, x, 2, C.CONC, 1, 1);
  },
  bike(ctx) {
    px(ctx, 0, 2, C.VOID, 1, 2);
    px(ctx, 5, 2, C.VOID, 1, 2);
    px(ctx, 1, 2, C.RUST, 4, 1);
    px(ctx, 4, 1, C.CONC, 1, 3);
  },
};

export function propKey(scene, name, d = 2) {
  const key = `prop:${name}:${d}`;
  if (!cache.has(key)) {
    const cnv = canvas(6 * d, 6 * d);
    (d === 2 ? PROPS : PROPS_TINY)[name](cnv.getContext('2d'));
    add(scene, key, cnv);
  }
  return key;
}

export function bodyKey(scene, look, d = 2) {
  const key = `body:${look}:${d}`;
  if (!cache.has(key)) add(scene, key, d === 2 ? drawBody(look) : drawBodyTiny(look));
  return key;
}

// Note: a soft white disc reused for muzzle flashes, sparks and smoke puffs.
export function dotKey(scene) {
  const key = 'fx:dot';
  if (!cache.has(key)) {
    const cnv = canvas(4, 4);
    const ctx = cnv.getContext('2d');
    px(ctx, 1, 0, C.WHITE, 2, 4);
    px(ctx, 0, 1, C.WHITE, 4, 2);
    add(scene, key, cnv);
  }
  return key;
}

export function resetSpriteCache() {
  cache.clear();
}
