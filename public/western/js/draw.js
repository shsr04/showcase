// Note: hard-edged drawing helpers in art units; a pen with factor k turns one unit into k device pixels, so the art keeps its shape at every SCALE.

import { PAL, C } from './palette.js';

export function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Note: a canvas painted once and handed to Phaser as a texture; Phaser reads the whole canvas back when it adopts it, which on a GPU canvas waits for the GPU, so this one is a software canvas from the start.
export function makeTextureCanvas(w, h) {
  const c = makeCanvas(w, h);
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

const rgbOf = (i) => {
  const h = PAL[i];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};

const toneCache = new Map();
// Note: a palette colour pushed toward the lightest bone tone (k > 0) or toward black (k < 0); the result stays in the palette's family.
export function tone(i, k) {
  const key = `${i}:${Math.round(k * 100)}`;
  let s = toneCache.get(key);
  if (s) return s;
  const [r, g, b] = rgbOf(i);
  const [tr, tg, tb] = k > 0 ? rgbOf(C.BONE) : rgbOf(C.VOID);
  const t = Math.min(1, Math.abs(k));
  s = `rgb(${Math.round(r + (tr - r) * t)},${Math.round(g + (tg - g) * t)},${Math.round(b + (tb - b) * t)})`;
  toneCache.set(key, s);
  return s;
}

const alphaCache = new Map();
// Note: a palette colour with an alpha, for shadows, sheen and stains.
export function tint(i, a) {
  const key = `${i}:${Math.round(a * 1000)}`;
  let s = alphaCache.get(key);
  if (s) return s;
  const [r, g, b] = rgbOf(i);
  s = `rgba(${r},${g},${b},${a})`;
  alphaCache.set(key, s);
  return s;
}

const fillOf = (c) => (typeof c === 'number' ? PAL[c] : c);

// Note: a ctx stand-in that draws only inside the square at (x0, y0) of the given size, so a painter cannot spill into the next tile.
export function clipTo(ctx, x0, y0, size) {
  return {
    set fillStyle(v) {
      ctx.fillStyle = v;
    },
    fillRect(rx, ry, w, h) {
      const l = Math.max(rx, x0);
      const t = Math.max(ry, y0);
      const r = Math.min(rx + w, x0 + size);
      const b = Math.min(ry + h, y0 + size);
      if (r > l && b > t) ctx.fillRect(l, t, r - l, b - t);
    },
  };
}

// Note: k is device pixels per art unit; every helper takes unit coordinates and rounds shared edges to the same pixel.
export function pen(k) {
  const rect = (ctx, col, x, y, w = 1, h = 1) => {
    const x0 = Math.round(x * k);
    const y0 = Math.round(y * k);
    const x1 = Math.round((x + w) * k);
    const y1 = Math.round((y + h) * k);
    ctx.fillStyle = fillOf(col);
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };

  const ell = (ctx, col, cx, cy, rx, ry = rx) => {
    ctx.fillStyle = fillOf(col);
    const px = cx * k;
    const py = cy * k;
    const qx = rx * k;
    const qy = ry * k;
    for (let y = Math.floor(py - qy); y <= Math.ceil(py + qy); y++) {
      const d = (y + 0.5 - py) / qy;
      if (d < -1 || d > 1) continue;
      const half = qx * Math.sqrt(1 - d * d);
      const x0 = Math.round(px - half);
      const x1 = Math.round(px + half);
      if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
    }
  };

  const disc = (ctx, col, cx, cy, r) => ell(ctx, col, cx, cy, r, r);

  // Note: stamps a square pen along the line, so thick strokes keep the chunky pixel feel.
  const line = (ctx, col, x0, y0, x1, y1, w = 1) => {
    ctx.fillStyle = fillOf(col);
    const ax = x0 * k;
    const ay = y0 * k;
    const bx = x1 * k;
    const by = y1 * k;
    const sz = Math.max(1, Math.round(w * k));
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
    const off = Math.floor((sz - 1) / 2);
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(Math.round(ax + ((bx - ax) * i) / n) - off, Math.round(ay + ((by - ay) * i) / n) - off, sz, sz);
    }
  };

  // Note: even-odd scanline fill of a polygon given as [x, y] unit pairs.
  const poly = (ctx, col, pts) => {
    ctx.fillStyle = fillOf(col);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [, y] of pts) {
      lo = Math.min(lo, y * k);
      hi = Math.max(hi, y * k);
    }
    for (let y = Math.floor(lo); y <= Math.ceil(hi); y++) {
      const yy = y + 0.5;
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const ya = pts[i][1] * k;
        const yb = pts[j][1] * k;
        if (ya > yy === yb > yy) continue;
        xs.push(pts[i][0] * k + ((yy - ya) / (yb - ya)) * (pts[j][0] - pts[i][0]) * k);
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.round(xs[i]);
        const x1 = Math.round(xs[i + 1]);
        if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
      }
    }
  };

  return { rect, ell, disc, line, poly, px: 1 / k };
}
