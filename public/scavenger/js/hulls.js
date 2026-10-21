// Note: far hulls of the station as capsules around the viewer; pure data so Node can check them.

import { Rand, clamp } from './rand.js';

export const HULL_COUNT = 8;

// Note: sun and planet directions of the sky; the cube map, the hull shader and the checks all read these.
export const SKY_SUN = [-0.62, 0.34, 0.72];
export const SKY_PLANET = [0.36, -0.42, 0.83];

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Note: smallest gap in metres between a ray from the origin and a capsule surface, with the ray distance there.
export function rayGap(d, hull) {
  const { c, a, hl, r } = hull;
  const b = dot(d, a);
  const e = dot(d, c);
  const f = dot(a, c);
  const u = clamp((e * b - f) / Math.max(1 - b * b, 1e-4), -hl, hl);
  const t = e + u * b;
  if (t <= 0) return { gap: Infinity, t: 0 };
  const off = [d[0] * t - c[0] - a[0] * u, d[1] * t - c[1] - a[1] * u, d[2] * t - c[2] - a[2] * u];
  return { gap: Math.hypot(off[0], off[1], off[2]) - r, t };
}

// Note: distance from the origin to the capsule axis segment; the viewer must never sit inside a hull.
function axisDist(hull) {
  const { c, a, hl } = hull;
  const u = clamp(-dot(c, a), -hl, hl);
  return Math.hypot(c[0] + a[0] * u, c[1] + a[1] * u, c[2] + a[2] * u);
}

export function makeHulls(seed, sunDir) {
  const rr = new Rand(((seed | 0) * 7919 + 0x51ab) >>> 0);
  const phase = rr.range(0, Math.PI * 2);
  const hulls = [];
  for (let i = 0; i < HULL_COUNT; i++) {
    const spire = i >= HULL_COUNT - 2;
    // Note: big slabs ring the horizon where windows look; thin spires stand anywhere on the sphere.
    for (let tries = 0; tries < 40; tries++) {
      const ang = phase + i * ((Math.PI * 2) / (HULL_COUNT - 2)) + rr.range(-0.35, 0.35);
      const y = spire ? rr.range(-0.9, 0.9) : rr.range(-0.4, 0.55);
      const s = Math.sqrt(1 - y * y);
      const dir = spire ? [Math.cos(ang * 2.3) * s, y, Math.sin(ang * 2.3) * s] : [Math.cos(ang) * s, y, Math.sin(ang) * s];
      const r = spire ? rr.range(18, 45) : 90 + 230 * rr.next() ** 2;
      const hl = spire ? rr.range(600, 1800) : rr.range(300, 1300);
      const dist = r * 2.6 + (spire ? rr.range(1200, 2800) : rr.range(300, 1700));
      let a;
      if (spire) {
        a = norm([rr.range(-0.5, 0.5), 1, rr.range(-0.5, 0.5)]);
      } else {
        // Note: slabs lie across the line of sight so their length shows.
        const side = norm([rr.range(-1, 1), rr.range(-1, 1), rr.range(-1, 1)]);
        const perp = norm([dir[1] * side[2] - dir[2] * side[1], dir[2] * side[0] - dir[0] * side[2], dir[0] * side[1] - dir[1] * side[0]]);
        a = norm([perp[0] + dir[0] * rr.range(-0.35, 0.35), perp[1] + dir[1] * rr.range(-0.35, 0.35), perp[2] + dir[2] * rr.range(-0.35, 0.35)]);
      }
      const off = rr.range(-0.4, 0.4) * hl;
      const c = [dir[0] * dist + a[0] * off, dir[1] * dist + a[1] * off, dir[2] * dist + a[2] * off];
      const hull = { c, a, hl, r };
      if (axisDist(hull) < r * 2.2 + 200) continue;
      const g = rayGap(sunDir, hull);
      // Note: the sun keeps a few degrees of clear sky around it.
      if (g.t > 0 && g.gap < g.t * 0.08) continue;
      hulls.push(hull);
      break;
    }
  }
  return hulls;
}

// Note: flat uniform arrays for the shader; unused slots keep radius zero.
export function packHulls(hulls) {
  const A = new Float32Array(HULL_COUNT * 4);
  const B = new Float32Array(HULL_COUNT * 4);
  hulls.forEach((h, i) => {
    A.set([h.c[0], h.c[1], h.c[2], h.r], i * 4);
    B.set([h.a[0], h.a[1], h.a[2], h.hl], i * 4);
  });
  return { A, B };
}
