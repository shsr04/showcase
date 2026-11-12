// Note: shared pieces of the pixel storyboard panels (item 312): the frame size, laying a figure into a scene with its outline, rim light and cast shadow, sky bands, plank walls, shade polygons and puffs of smoke or dust.

import { C } from '../palette.js';
import { Px, step, dith, NONE } from './pixel-art.js';

export const PW = 320;
export const PH = 180;

// Note: a figure laid over the scene: outlined, leaning when asked, clipped to a box when it stands behind a window.
export function place(base, fig, { lx = -1, ly = 0, lean = 0, foot = PH, clip = null, shadow = null, rim = 0 } = {}) {
  let L = fig;
  if (lean) {
    L = new Px(fig.w, fig.h);
    for (let y = 0; y < fig.h; y++) for (let x = 0; x < fig.w; x++) {
      const p = fig.a[y * fig.w + x];
      if (p !== NONE) L.set(x + (foot - y) * lean, y, p);
    }
  }
  // Note: rim light: the edge facing the light catches it, so a dark figure stands off a dark ground.
  if (rim) {
    const dx = Math.sign(Math.round(lx));
    const dy = Math.sign(Math.round(ly));
    const edge = [];
    for (let i = 0; i < L.a.length; i++) {
      if (L.a[i] === NONE) continue;
      const x = i % L.w;
      const y = (i / L.w) | 0;
      if (L.get(x + dx, y + dy) === NONE) edge.push(i);
    }
    for (const i of edge) L.a[i] = step(L.a[i], rim);
  }
  L.outline(lx, ly);
  if (shadow) L.castOnto(base, shadow.foot, shadow.sx, shadow.sy, shadow.k ?? -1);
  for (let i = 0; i < L.a.length; i++) {
    const p = L.a[i];
    if (p === NONE) continue;
    const x = i % L.w;
    const y = (i / L.w) | 0;
    if (clip && (x < clip[0] || y < clip[1] || x >= clip[2] || y >= clip[3])) continue;
    base.a[i] = p;
  }
}

// Note: sky bands from the top down, joined by dither.
export function skyBands(px, bands, bottom) {
  const n = bands.length;
  const hgt = bottom / n;
  for (let i = 0; i < n; i++) px.rect(0, i * hgt, PW, hgt + 1, bands[i]);
  for (let i = 1; i < n; i++) px.wash(0, i * hgt - 4, PW, 8, bands[i - 1], (x, y) => 1 - (y - (i * hgt - 4)) / 8);
}

// Note: a wall of upright planks with seams, grain and nail heads.
export function planks(px, x0, y0, x1, y1, r, base = C.WOOD) {
  for (let x = x0, i = 0; x < x1; x += 9, i++) {
    const c = r.chance(0.3) ? step(base, -1) : r.chance(0.2) ? step(base, 1) : base;
    px.rect(x, y0, 9, y1 - y0, c);
    px.rect(x, y0, 1, y1 - y0, step(base, -2));
    for (let g = 0; g < 4; g++) {
      const gx = x + 2 + r.int(0, 5);
      const gy = y0 + r.int(0, y1 - y0 - 8);
      px.rect(gx, gy, 1, r.int(3, 9), step(c, -1));
    }
    if (r.chance(0.25)) px.ellipse(x + 4.5, y0 + r.int(6, y1 - y0 - 6), 1.2, 1.8, step(c, -1));
    px.set(x + 2, y0 + 2, C.SHADOW);
    px.set(x + 2, y1 - 3, C.SHADOW);
  }
}

// Note: a cast-shadow darkening of everything already drawn inside a polygon, dithered at the edge.
export function shade(px, pts, k = -1) {
  for (const i of Px.cover(pts, px.w, px.h)) {
    const p = px.a[i];
    if (p !== NONE) px.a[i] = step(p, k);
  }
}

// Note: a puff of smoke or dust, thinning out at the rim.
export function puff(px, cx, cy, rx, ry, c, density = 0.8) {
  px.wash(cx - rx, cy - ry, rx * 2, ry * 2, c, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    return d >= 1 ? 0 : (1 - d * d) * density;
  });
}

