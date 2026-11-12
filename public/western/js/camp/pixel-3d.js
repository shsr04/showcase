// Note: a small ray caster for the pixel panels (item 312): a pinhole camera in world space (metres, y up), boxes and rectangles with procedural materials, point lights with falloff, and a shade per pixel stepped along the palette's ramps with ordered dither.

import { C } from '../palette.js';
import { Px, step, dith } from './pixel-art.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Note: yaw turns the view from +x toward -z (to the left of +x), pitch tilts it down; f is the focal length in pixels.
export function camera3(pos, yaw, pitch, f, w = 320, h = 180) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const fwd = [cy * cp, -sp, -sy * cp];
  const right = [sy, 0, cy];
  const up = [cy * sp, cp, -sy * sp];
  return {
    pos, fwd, right, up, f, w, h,
    // Note: a world point to the screen, with its depth along the view.
    project(p) {
      const v = sub(p, pos);
      const z = dot(v, fwd);
      return [w / 2 + (f * dot(v, right)) / z, h / 2 - (f * dot(v, up)) / z, z];
    },
    ray(x, y) {
      const dx = (x + 0.5 - w / 2) / f;
      const dy = -(y + 0.5 - h / 2) / f;
      return norm([fwd[0] + right[0] * dx + up[0] * dy, fwd[1] + right[1] * dx + up[1] * dy, fwd[2] + right[2] * dx + up[2] * dy]);
    },
    // Note: pixels a metre tall measures standing at p.
    scaleAt(p) { return this.f / dot(sub(p, pos), fwd); },
  };
}

// Note: an axis-aligned box; mat(p, n) gives the colour at a hit and may return null to let the ray pass (a hole).
export const box = (min, max, mat, o = {}) => ({ min, max, mat, ...o });

// Note: the nearest hit of a ray among the boxes, after tMin; returns the box, the point and the face normal.
function hit(boxes, o, d, tMin = 1e-4) {
  let best = null;
  for (const b of boxes) {
    let t0 = tMin;
    let t1 = 1e9;
    let nIn = null;
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < b.min[a] || o[a] > b.max[a]) { ok = false; break; }
        continue;
      }
      let ta = (b.min[a] - o[a]) / d[a];
      let tb = (b.max[a] - o[a]) / d[a];
      let na = -1;
      if (ta > tb) { [ta, tb] = [tb, ta]; na = 1; }
      if (ta > t0) { t0 = ta; nIn = [0, 0, 0]; nIn[a] = na; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (!ok || !nIn) continue;
    if (best && t0 >= best.t) continue;
    const p = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
    best = { t: t0, p, n: nIn, b };
  }
  return best;
}

// Note: the first hit whose material is solid; a material returning null lets the ray go on through.
export function trace(boxes, o, d) {
  let t = 1e-4;
  for (let k = 0; k < 8; k++) {
    const h2 = hit(boxes, o, d, t);
    if (!h2) return null;
    const m = h2.b.mat(h2.p, h2.n);
    if (m != null) return { ...h2, m };
    t = h2.t + 1e-3;
  }
  return null;
}

// Note: light at a point: ambient plus each light's falloff, facing and visibility; returns a level near 1 for full light.
export function lightAt(p, n, lights, boxes, ambient) {
  let L = ambient;
  for (const li of lights) {
    const to = sub(li.pos, p);
    const d = len(to);
    const l = [to[0] / d, to[1] / d, to[2] / d];
    const face = Math.max(0, dot(n, l));
    if (face <= 0) continue;
    if (li.visible && !li.visible(p)) continue;
    if (li.shadows) {
      const h2 = trace(boxes.filter((b) => !b.noShadow), [p[0] + n[0] * 1e-3, p[1] + n[1] * 1e-3, p[2] + n[2] * 1e-3], l);
      if (h2 && h2.t < d) continue;
    }
    L += (li.power * face) / (1 + (d / li.reach) ** 2);
  }
  return L;
}

// Note: a light level to a colour: steps along the base colour's ramp, dithered between steps; the darkest shade turns to night blue when cool.
export function shadeOf(base, level, x, y, cool = false) {
  const stops = [0.07, 0.16, 0.3, 0.52, 0.85, 1.35, 2.1];
  let k = -3;
  let frac = 0;
  for (let i = 0; i < stops.length; i++) {
    if (level < stops[i]) {
      const lo = i ? stops[i - 1] : 0;
      frac = (level - lo) / (stops[i] - lo);
      break;
    }
    k = i - 2;
    frac = 1;
  }
  if (level >= stops[stops.length - 1]) { k = 4; frac = 0; }
  const kk = frac < 1 && dith(x, y, frac) ? k + 1 : k;
  const c = step(base, kk - 1);
  if (cool && level < 0.2 && dith(x, y, 0.3)) return C.BLUE_D;
  return c;
}

// Note: renders the boxes through the camera into a buffer; sky(d, x, y) colours the rays that hit nothing; info collects per pixel what was hit.
export function render(cam, boxes, lights, { ambient = 0.1, sky = () => C.BLUE_D, cool = true } = {}) {
  const px = new Px(cam.w, cam.h);
  const info = new Array(cam.w * cam.h);
  for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
    const d = cam.ray(x, y);
    const h2 = trace(boxes, cam.pos, d);
    if (!h2) { px.a[y * cam.w + x] = sky(d, x, y); continue; }
    const m = h2.m;
    if (m.emit != null) { px.a[y * cam.w + x] = m.emit; info[y * cam.w + x] = h2; continue; }
    const lv = lightAt(h2.p, h2.n, lights, boxes, (m.ambient ?? 1) * ambient) * (m.k ?? 1);
    px.a[y * cam.w + x] = shadeOf(m.c, lv, x, y, cool);
    info[y * cam.w + x] = h2;
  }
  return { px, info };
}

// Note: a cheap hash of a position, for grain, knots and dirt.
export const noise = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
