// Note: the pixel toolkit of the storyboard panels (item 312): a palette-indexed buffer with shading ramps, lit shapes, ordered dither, outlines, cast shadows, glow, haze, perspective planes and a small lettering font.

import { PAL, C } from '../palette.js';

const NONE = 255;

// Note: dark to light runs of the palette; a colour steps along the first run it belongs to.
const RAMPS = [
  [C.VOID, C.SHADOW, C.DARK, C.WOOD_D, C.WOOD, C.WOOD_L, C.PLANK, C.PLANK_L],
  [C.WOOD_D, C.SAND_D, C.SAND, C.SAND_L, C.PLASTER, C.PLASTER_L],
  [C.WOOD_D, C.ADOBE_D, C.ADOBE, C.ADOBE_L, C.PLASTER, C.PLASTER_L],
  [C.SHADOW, C.IRON, C.IRON_L, C.STONE, C.STONE_L, C.BONE],
  [C.SHADOW, C.RED_D, C.RED, C.RED_L, C.ADOBE_L],
  [C.WOOD_D, C.WOOD_L, C.GOLD, C.GOLD_L, C.PLASTER_L],
  [C.VOID, C.BLUE_D, C.BLUE, C.GLASS, C.GLASS_L],
  [C.SHADOW, C.GREEN_D, C.GREEN, C.SAND_D],
];
const RAMP_OF = new Map();
for (const r of RAMPS) r.forEach((c, i) => { if (!RAMP_OF.has(c)) RAMP_OF.set(c, [r, i]); });
RAMP_OF.set(C.BONE, [RAMPS[3], 5]);
RAMP_OF.set(C.PLASTER_L, [RAMPS[1], 5]);

// Note: a colour k steps lighter (k > 0) or darker along its ramp.
export function step(c, k) {
  const e = RAMP_OF.get(c);
  if (!e) return c;
  const [r, i] = e;
  return r[Math.max(0, Math.min(r.length - 1, i + k))];
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Note: true where an ordered dither of this level (0 to 1) sets the pixel.
export const dith = (x, y, level) => BAYER[(y & 3) * 4 + (x & 3)] < level * 16;

export class Px {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.a = new Uint8Array(w * h).fill(NONE);
  }

  get(x, y) {
    x |= 0; y |= 0;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? NONE : this.a[y * this.w + x];
  }

  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c === NONE || c == null) return;
    this.a[y * this.w + x] = c;
  }

  rect(x, y, w, h, c) {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.set(i, j, c);
  }

  // Note: the pixels inside a polygon, by scanline at pixel centres.
  static cover(pts, w, h) {
    const out = [];
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(w, Math.round(xs[k + 1])); x++) out.push(y * w + x);
      }
    }
    return out;
  }

  poly(pts, c) {
    for (const i of Px.cover(pts, this.w, this.h)) this.a[i] = c;
  }

  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / Math.max(0.5, rx);
      const dy = (y + 0.5 - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }

  // Note: a filled shape lit from the direction (lx, ly) pointing at the light: a light edge toward it, a dithered shade and a core shadow away from it.
  lit(pts, c, { lx = -0.7, ly = -0.7, depth = 0.38, hi = true, edge = true, cool = false } = {}) {
    const idx = Px.cover(pts, this.w, this.h);
    if (!idx.length) return idx;
    const inside = new Set(idx);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const i of idx) { const x = i % this.w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const s = Math.max(1.5, (x1 - x0 + 1) * depth);
    const n = Math.hypot(lx, ly) || 1;
    const ux = lx / n;
    const uy = ly / n;
    const at = (x, y) => inside.has(Math.round(y) * this.w + Math.round(x));
    const dark = cool ? (k) => (step(c, -1) === c ? C.BLUE_D : step(c, -k)) : (k) => step(c, -k);
    for (const i of idx) {
      const x = i % this.w;
      const y = (i / this.w) | 0;
      let col = c;
      if (!at(x - ux * s, y - uy * s)) col = dark(1);
      else if (!at(x - ux * (s + 1.5), y - uy * (s + 1.5)) && dith(x, y, 0.5)) col = dark(1);
      if (!at(x - ux * 1.2, y - uy * 1.2) && edge) col = dark(2);
      if (hi && !at(x + ux * 1.2, y + uy * 1.2)) col = step(c, 1);
      this.a[i] = col;
    }
    return idx;
  }

  // Note: an ordered-dither wash of one colour over a box, at a level from 0 to 1, or a level from a function of the pixel.
  wash(x, y, w, h, c, level) {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) {
      const lv = typeof level === 'function' ? level(i, j) : level;
      if (lv > 0 && dith(i, j, lv)) this.set(i, j, c);
    }
  }

  // Note: shifts every pixel in a box along its ramp by k, dithered by level.
  shift(x, y, w, h, k, level = 1) {
    for (let j = Math.max(0, Math.round(y)); j < Math.min(this.h, Math.round(y + h)); j++) for (let i = Math.max(0, Math.round(x)); i < Math.min(this.w, Math.round(x + w)); i++) {
      const lv = typeof level === 'function' ? level(i, j) : level;
      const p = this.a[j * this.w + i];
      if (p !== NONE && lv > 0 && dith(i, j, Math.min(1, lv))) this.a[j * this.w + i] = step(p, lv > 1 ? k * 2 : k);
    }
  }

  // Note: a light source: the pixels around it brighten with distance, dithered, two steps near the middle.
  glow(cx, cy, r, strength = 1, warm = false) {
    this.shift(cx - r, cy - r, r * 2, r * 2, 1, (x, y) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.1) / r;
      return d >= 1 ? 0 : (1 - d) * 1.6 * strength;
    });
    if (warm) this.wash(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2, C.GOLD_L, (x, y) => Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (r * 0.6)) * 0.5);
  }

  // Note: lays another buffer over this one; haze replaces a share of its pixels with a far colour, as air between.
  over(top, { haze = null, amount = 0 } = {}) {
    for (let i = 0; i < top.a.length; i++) {
      const p = top.a[i];
      if (p === NONE) continue;
      const x = i % top.w;
      const y = (i / top.w) | 0;
      this.a[i] = haze != null && dith(x, y, amount) ? haze : p;
    }
  }

  // Note: a dark outline around everything drawn, lighter on the lit side (selective outline).
  outline(lx = -1, ly = 0, c = C.VOID) {
    const out = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a[y * this.w + x] !== NONE) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.get(x + dx, y + dy);
        if (n === NONE) continue;
        const litSide = dx * lx + dy * ly > 0.3;
        out.push([x, y, litSide ? step(n, -2) : c]);
        break;
      }
    }
    for (const [x, y, c2] of out) this.set(x, y, c2);
  }

  // Note: the shadow this buffer's shapes cast on flat ground at the foot line: each pixel sheared along (sx, sy) per pixel of height.
  castOnto(base, foot, sx, sy, k = -1, x0 = 0, x1 = this.w) {
    const seen = new Set();
    for (let y = 0; y < Math.min(foot + 1, this.h); y++) for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) {
      if (this.a[y * this.w + x] === NONE) continue;
      const hgt = foot - y;
      const gx = Math.round(x + hgt * sx);
      const gy = Math.round(foot + hgt * sy);
      for (const [ox, oy] of [[0, 0], [1, 0]]) {
        const key = (gy + oy) * base.w + gx + ox;
        if (seen.has(key) || gx + ox < 0 || gx + ox >= base.w || gy + oy < 0 || gy + oy >= base.h) continue;
        seen.add(key);
        const p = base.a[key];
        if (p !== NONE) base.a[key] = step(p, k);
      }
    }
  }

  // Note: writes the buffer to a 2D context, one canvas pixel per art pixel.
  paint(ctx) {
    const img = ctx.createImageData(this.w, this.h);
    const rgb = PAL.map((hx) => [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]);
    for (let i = 0; i < this.a.length; i++) {
      const [r, g, b] = rgb[this.a[i] === NONE ? C.VOID : this.a[i]] || rgb[0];
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
}

// Note: a plane in perspective: (u, v) in the unit square to the quad's corners (top left, top right, bottom right, bottom left) by a homography.
export function plane(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  return (u, v) => {
    const w = g * u + hh * v + 1;
    return [(a * u + b * v + x0) / w, (d * u + e * v + y0) / w];
  };
}

// Note: a 3 by 5 capital font, each glyph as five rows of three bits.
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 5, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [6, 1, 2, 4, 7], '3': [6, 1, 2, 1, 6],
  '4': [5, 5, 7, 1, 1], '5': [7, 4, 6, 1, 6], '6': [3, 4, 6, 5, 2], '7': [7, 1, 2, 2, 2], '8': [2, 5, 2, 5, 2], '9': [2, 5, 3, 1, 6], '&': [2, 5, 2, 5, 3], '$': [3, 6, 2, 3, 6], '-': [0, 0, 7, 0, 0], "'": [2, 2, 0, 0, 0], ',': [0, 0, 0, 2, 4], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], ':': [0, 2, 0, 2, 0], '/': [1, 1, 2, 4, 4], '#': [5, 7, 5, 7, 5],
};
// Note: the letters that need five columns to read, W and M.
const WIDE = { W: [17, 17, 21, 21, 10], M: [17, 27, 21, 17, 17] };
const glyphOf = (ch) => (WIDE[ch] ? { rows: WIDE[ch], w: 5 } : { rows: FONT[ch] || FONT[' '], w: 3 });
// Note: accents as two rows of three bits, drawn above a letter (with one clear row) or just below it; an accented letter is its base letter plus its marks.
const ABOVE = { '\u0300': [4, 2], '\u0301': [1, 2], '\u0302': [2, 5], '\u0303': [3, 6], '\u0306': [5, 2], '\u0308': [5, 0], '\u030A': [2, 5], '\u030B': [5, 5], '\u030C': [5, 2] };
const BELOW = { '\u0327': [2, 6], '\u0328': [2, 3] };
// Note: letters with no decomposition are spelt with the nearest capitals.
const SPELL = { 'Æ': 'AE', 'Œ': 'OE', 'ß': 'SS', 'ẞ': 'SS', 'Ø': 'O', 'Ł': 'L', 'Đ': 'D', 'Þ': 'TH', 'Ð': 'D' };
const glyphsOf = (str) => [...String(str).toUpperCase()].map((ch) => SPELL[ch] || ch).join('').normalize('NFKD');
const isMark = (ch) => ABOVE[ch] || BELOW[ch] || /\p{M}/u.test(ch);
export function text(px, str, x, y, c, scale = 1) {
  let cx = Math.round(x);
  let last = null;
  for (const ch of glyphsOf(str)) {
    if (isMark(ch)) {
      // Note: a mark sits centred on the letter before it; an unknown mark is dropped.
      const mark = ABOVE[ch] || BELOW[ch];
      if (!mark || !last) continue;
      const mx = last.x + ((last.w - 3) >> 1) * scale;
      const my = ABOVE[ch] ? y - 3 * scale : y + 5 * scale;
      for (let r = 0; r < 2; r++) for (let b = 0; b < 3; b++) if (mark[r] & (1 << (2 - b))) px.rect(mx + b * scale, my + r * scale, scale, scale, c);
      continue;
    }
    const g = glyphOf(ch);
    for (let r = 0; r < 5; r++) for (let b = 0; b < g.w; b++) if (g.rows[r] & (1 << (g.w - 1 - b))) px.rect(cx + b * scale, y + r * scale, scale, scale, c);
    last = { x: cx, w: g.w };
    cx += (g.w + 1) * scale;
  }
}
export const textWidth = (str, scale = 1) => [...glyphsOf(str)].filter((ch) => !isMark(ch)).reduce((n, ch) => n + (glyphOf(ch).w + 1) * scale, 0) - scale;

export { NONE };

// Note: a copy of a layer turned by ang radians about (cx, cy), nearest pixel; small turns only (a lean, a fall).
export function rotated(src, cx, cy, ang) {
  const out = new Px(src.w, src.h);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const p = src.get(Math.round(cx + dx * c - dy * s), Math.round(cy + dx * s + dy * c));
    if (p !== NONE) out.a[y * src.w + x] = p;
  }
  return out;
}

// Note: a camera on a flat street: the horizon row and the eye height in metres; scaleAt(foot) is pixels per metre at the depth whose ground row is foot.
export const camera = (hz, eye) => ({ hz, eye, scaleAt: (foot) => (foot - hz) / eye, footAt: (scale) => hz + scale * eye });

// Note: the inverse of plane(q): a screen point to (u, v) on the quad's unit square.
export function unplane(q) {
  const f = plane(q);
  const [x00, y00] = f(0, 0);
  const o = [f(1, 0), f(0, 1), f(1, 1)];
  // Note: solve the homography's matrix from the forward map, then invert it.
  const m = homography([[0, 0], [1, 0], [0, 1], [1, 1]], [[x00, y00], ...o]);
  const inv = invert3(m);
  return (x, y) => {
    const w = inv[6] * x + inv[7] * y + inv[8];
    return [(inv[0] * x + inv[1] * y + inv[2]) / w, (inv[3] * x + inv[4] * y + inv[5]) / w];
  };
}

function homography(src, dst) {
  const A = [];
  const B = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    B.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    B.push(y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [B[c], B[p]] = [B[p], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j];
      B[r] -= k * B[c];
    }
  }
  return [...B.map((b, i) => b / A[i][i]), 1];
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const Cc = d * h - e * g;
  const det = a * A + b * B + c * Cc;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

// Note: lays a flat picture into a quad on the screen, through the perspective of that quad.
export function warpInto(dst, src, q) {
  const inv = unplane(q);
  for (const i of Px.cover(q, dst.w, dst.h)) {
    const x = i % dst.w;
    const y = (i / dst.w) | 0;
    const [u, v] = inv(x + 0.5, y + 0.5);
    const p = src.get(Math.floor(u * src.w), Math.floor(v * src.h));
    if (p !== NONE) dst.a[i] = p;
  }
}

// Note: bold lettering for painted signs: the 3 by 5 font at scale with a drop shadow and an optional outline.
export function signText(px, str, x, y, c, { scale = 2, shadow = null, outline = null } = {}) {
  if (outline != null) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) text(px, str, x + dx, y + dy, outline, scale);
  if (shadow != null) text(px, str, x + 1, y + 1, shadow, scale);
  text(px, str, x, y, c, scale);
}
