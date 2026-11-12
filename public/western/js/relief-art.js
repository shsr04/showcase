// Note: item 485: the picture of outdoor relief, built from cues that say which way is up: high ground casts a shadow away from a low north-west sun, the ground is tinted in half-metre bands (higher bands paler), each band edge is a contour lit on the side facing the sun and dark on the side away from it, and a soft hillshade rounds the slopes; all at art-pixel resolution and dithered, without cell edges.

import { SCALE } from './config.js';
import { blend } from './terrain-height.js';

// Note: metres between height bands and their contour lines.
export const CONTOUR = 0.5;
// Note: the sun in the north west, 28 degrees above the horizon; toSun is the ground direction towards it.
const SUN_ELEV = Math.tan((28 * Math.PI) / 180);
const TO_SUN = [-Math.SQRT1_2, -Math.SQRT1_2];
// Note: light for the hillshade, from the same quarter but higher, so slopes round off without going black.
const LIGHT = (() => {
  const v = [-1, -1, Math.SQRT2 * Math.tan((45 * Math.PI) / 180)];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();
// Note: shadow samples per cell along each axis, and how far (cells) a shadow can reach.
const Q = 4;
const REACH = 16;
// Note: tone steps for the dithered washes; each step adds this much alpha.
const STEPS = 6;
const LIGHT_STEP = 0.07;
const DARK_STEP = 0.075;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Note: the smoothed heights, their gradients, the height range and the cast-shadow grid, built once per relief array.
function shadeData(map) {
  const h = map.relief;
  if (map._reliefArt && map._reliefArt.src === h) return map._reliefArt;
  const { W, H } = map;
  const at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  // Note: two box passes round off the one-metre steps, so a slope shades as a slope and not as terraces of cells.
  let s = Float32Array.from(h);
  for (let pass = 0; pass < 2; pass++) {
    const src = s;
    const get = pass ? (x, y) => src[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))] : at;
    s = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += get(x + dx, y + dy) * (dx || dy ? (dx && dy ? 1 : 2) : 4);
      s[y * W + x] = n / 16;
    }
  }
  const sm = (x, y) => s[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const gx = new Float32Array(W * H);
  const gy = new Float32Array(W * H);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    gx[y * W + x] = (sm(x + 1, y) - sm(x - 1, y)) / 2;
    gy[y * W + x] = (sm(x, y + 1) - sm(x, y - 1)) / 2;
    const v = s[y * W + x];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // Note: the cast shadow: from each sample, walk towards the sun; ground that rises above the sun's line puts the sample in shade, softly at the edge.
  const SW = W * Q;
  const SH = H * Q;
  const shadow = new Float32Array(SW * SH);
  if (hi - lo > 0.2) {
    for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
      const u = (i + 0.5) / Q;
      const v = (j + 0.5) / Q;
      const h0 = blend(s, W, H, u, v);
      if (h0 >= hi - 0.05) continue;
      let dark = 0;
      for (let t = 0.5; t <= REACH; t += 0.5) {
        const pu = u + TO_SUN[0] * t;
        const pv = v + TO_SUN[1] * t;
        if (pu < 0 || pv < 0 || pu > W || pv > H) break;
        const over = blend(s, W, H, pu, pv) - h0 - t * SUN_ELEV;
        if (over > 0) dark = Math.max(dark, Math.min(1, over / 0.35));
        if (dark >= 1 || h0 + t * SUN_ELEV > hi) break;
      }
      shadow[j * SW + i] = dark;
    }
  }
  map._reliefArt = { src: h, s, gx, gy, lo, hi, W, H, shadow, SW, SH };
  return map._reliefArt;
}

// Note: the cast shadow at a point in cell units, blended between the shadow samples.
function shadowAt(d, u, v) {
  const fx = u * Q - 0.5;
  const fy = v * Q - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const g = (x, y) => d.shadow[Math.min(d.SH - 1, Math.max(0, y)) * d.SW + Math.min(d.SW - 1, Math.max(0, x))];
  return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
}

// Note: the light at a point, from -1 (deep shade) to +1 (full light): the band tint, the hillshade and the cast shadow; level ground of middle height is 0.
export function reliefTone(map, u, v) {
  const d = shadeData(map);
  const span = d.hi - d.lo;
  if (span < 0.2) return 0;
  const z = blend(d.s, d.W, d.H, u, v);
  const band = (Math.floor(z / CONTOUR) + 0.5) * CONTOUR;
  const tint = (Math.max(0, Math.min(1, (band - d.lo) / span)) - 0.5) * 0.8;
  const gx = blend(d.gx, d.W, d.H, u, v) * 1.6;
  const gy = blend(d.gy, d.W, d.H, u, v) * 1.6;
  const lambert = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / Math.hypot(gx, gy, 1);
  const shade = (lambert - LIGHT[2]) * 1.1;
  return Math.max(-1, Math.min(1, tint + shade - shadowAt(d, u, v) * 0.55));
}

// Note: paints over the ground of cell (x, y), whose top-left corner is (ox, oy) in art units; a map without relief is left alone.
export function paintRelief(ctx, map, ox, oy, x, y) {
  if (!map || !map.relief) return;
  const d = shadeData(map);
  if (d.hi - d.lo < 0.2) return;
  const k = SCALE;
  // Note: each art pixel gets a tone level, dithered between steps; equal neighbours in a row are filled as one run.
  const tone = new Int8Array(256);
  // Note: 0 no contour, 1 a contour on a slope facing the sun (lit), 2 one facing away (dark).
  const line = new Uint8Array(256);
  const hs = new Float32Array(17 * 17);
  for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) hs[j * 17 + i] = blend(d.s, d.W, d.H, x + (i + 0.5) / 16, y + (j + 0.5) / 16);
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const u = x + (i + 0.5) / 16;
      const v = y + (j + 0.5) / 16;
      const t = reliefTone(map, u, v);
      const wi = x * 16 + i;
      const wj = y * 16 + j;
      const q = Math.abs(t) * STEPS;
      const base = Math.floor(q);
      const lv = base + (q - base > (BAYER[(wj & 3) * 4 + (wi & 3)] + 0.5) / 16 ? 1 : 0);
      tone[j * 16 + i] = Math.sign(t) * Math.min(STEPS, lv);
      // Note: a band edge between this pixel and the next one east or south, drawn one pixel wide on this side.
      const c = hs[j * 17 + i];
      const lvl = Math.floor(c / CONTOUR);
      const e = Math.floor(hs[j * 17 + i + 1] / CONTOUR);
      const s2 = Math.floor(hs[(j + 1) * 17 + i] / CONTOUR);
      if (e !== lvl || s2 !== lvl) {
        // Note: the downhill direction against the way to the sun: a slope whose foot lies towards the sun faces it.
        const gx = blend(d.gx, d.W, d.H, u, v);
        const gy = blend(d.gy, d.W, d.H, u, v);
        line[j * 16 + i] = -gx * TO_SUN[0] - gy * TO_SUN[1] > 0 ? 1 : 2;
      }
    }
  }
  const x0 = ox * k;
  const y0 = oy * k;
  const runs = (val, fill) => {
    for (let j = 0; j < 16; j++) {
      let i = 0;
      while (i < 16) {
        const v = val(j * 16 + i);
        let e = i + 1;
        while (e < 16 && val(j * 16 + e) === v) e++;
        if (v) {
          ctx.fillStyle = fill(v);
          ctx.fillRect(Math.round(x0 + i * k), Math.round(y0 + j * k), Math.round((e - i) * k), Math.ceil(k));
        }
        i = e;
      }
    }
  };
  runs((p) => tone[p], (v) => (v > 0 ? `rgba(255,244,214,${(v * LIGHT_STEP).toFixed(3)})` : `rgba(40,24,14,${(-v * DARK_STEP).toFixed(3)})`));
  runs((p) => line[p], (v) => (v === 1 ? 'rgba(255,248,228,0.5)' : 'rgba(46,28,16,0.45)'));
}
