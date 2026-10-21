// Note: hub room shell mesh; walls are tessellated grids with holes where tunnels attach.

import { L, FACE_AXIS, FACE_SIGN } from './config.js';
import { noise3 } from './rand.js';

const MAX_CELL = 1.6;

function breaks(lo, hi, cuts) {
  const pts = [lo];
  for (const c of cuts) if (c > lo + 0.05 && c < hi - 0.05) pts.push(c);
  pts.push(hi);
  pts.sort((a, b) => a - b);
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const bnd = pts[i];
    const n = Math.max(1, Math.ceil((bnd - a) / MAX_CELL));
    for (let k = 1; k <= n; k++) out.push(a + ((bnd - a) * k) / n);
  }
  return out;
}

// Note: one wall of the room box; hole is {lo:[v1,v2], hi:[v1,v2]} in the wall's tangent axes or null.
function emitWall(b, room, f, hole, layer, tint, noiseSeed, opts = {}) {
  const axis = FACE_AXIS[f];
  const sign = FACE_SIGN[f];
  const a1 = (axis + 1) % 3;
  const a2 = (axis + 2) % 3;
  const pos = room.c[axis] + sign * room.h[axis];
  const n = [0, 0, 0];
  n[axis] = -sign;
  const lo1 = room.c[a1] - room.h[a1];
  const hi1 = room.c[a1] + room.h[a1];
  const lo2 = room.c[a2] - room.h[a2];
  const hi2 = room.c[a2] + room.h[a2];
  const g1 = breaks(lo1, hi1, hole ? [hole.lo[0], hole.hi[0]] : []);
  const g2 = breaks(lo2, hi2, hole ? [hole.lo[1], hole.hi[1]] : []);
  b.mat(layer, tint);
  b.uvScale = opts.uvScale || 0;
  const tile = b.tile();
  const ids = new Map();
  const vert = (i, j) => {
    const key = i * 4096 + j;
    let id = ids.get(key);
    if (id !== undefined) return id;
    const p = [0, 0, 0];
    p[axis] = pos;
    p[a1] = g1[i];
    p[a2] = g2[j];
    const gn = 0.68 + 0.6 * noise3(noiseSeed, p[0] * 0.09, p[1] * 0.13, p[2] * 0.09);
    b.tint = [tint[0] * gn, tint[1] * gn, tint[2] * gn];
    let u;
    let v;
    if (axis === 0) {
      u = p[2] / tile;
      v = p[1] / tile;
    } else if (axis === 1) {
      u = p[0] / tile;
      v = p[2] / tile;
    } else {
      u = p[0] / tile;
      v = p[1] / tile;
    }
    id = b.v(p[0], p[1], p[2], n[0], n[1], n[2], u, v);
    ids.set(key, id);
    return id;
  };
  for (let i = 0; i < g1.length - 1; i++) {
    for (let j = 0; j < g2.length - 1; j++) {
      if (hole) {
        const mx = (g1[i] + g1[i + 1]) / 2;
        const my = (g2[j] + g2[j + 1]) / 2;
        if (mx > hole.lo[0] && mx < hole.hi[0] && my > hole.lo[1] && my < hole.hi[1]) continue;
      }
      b.quadIdx(vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1), n);
    }
  }
  b.uvScale = 0;
  b.tint = [1, 1, 1];
}

export function holeRects(plan) {
  const rects = new Array(6).fill(null);
  for (const p of plan.portals) {
    if (p.kind !== 'hole') continue;
    const f = Number(p.b.slice(1));
    const half = [0, 0, 0];
    half[p.rw] = p.hw;
    half[p.uh] = p.hh;
    const axis = FACE_AXIS[f];
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    rects[f] = {
      lo: [p.c[a1] - half[a1], p.c[a2] - half[a2]],
      hi: [p.c[a1] + half[a1], p.c[a2] + half[a2]],
      c: p.c, half, axis, f,
    };
  }
  return rects;
}

// Note: shell = floor (-Y), ceiling (+Y) and four walls, each with its own layer and tint; one closure per piece for time slicing.
export function roomShellParts(plan, style) {
  const room = plan.room;
  const holes = holeRects(plan);
  const seed = plan.seed ^ 0x51ed;
  const parts = [];
  for (let f = 0; f < 6; f++) {
    let layer = style.wall;
    let tint = style.tintW;
    if (f === 3) {
      layer = style.floor;
      tint = style.tintF;
    } else if (f === 2) {
      layer = style.ceil;
      tint = style.tintC;
    }
    parts.push((b) => emitWall(b, room, f, holes[f], layer, tint, seed + f, { uvScale: style.uvScale?.[f] }));
  }
  parts.push((b) => emitHoleFrames(b, room, holes));
  return parts;
}

// Note: a plain trim frame around every hole hides the seam between wall and tunnel.
function emitHoleFrames(b, room, holes) {
  b.mat(L.PLATE_DARK, [0.45, 0.45, 0.47]);
  for (const hr of holes) {
    if (!hr) continue;
    const { axis, f } = hr;
    const sign = FACE_SIGN[f];
    const a1 = (axis + 1) % 3;
    const a2 = (axis + 2) % 3;
    const wallPos = room.c[axis] + sign * room.h[axis];
    const depth = 0.22;
    const t = 0.26;
    const c = [0, 0, 0];
    const hs = [0, 0, 0];
    const cen1 = (hr.lo[0] + hr.hi[0]) / 2;
    const cen2 = (hr.lo[1] + hr.hi[1]) / 2;
    const h1 = (hr.hi[0] - hr.lo[0]) / 2;
    const h2 = (hr.hi[1] - hr.lo[1]) / 2;
    const place = (c1, c2, e1, e2) => {
      c[axis] = wallPos - sign * depth / 2;
      c[a1] = c1;
      c[a2] = c2;
      hs[axis] = depth / 2;
      hs[a1] = e1;
      hs[a2] = e2;
      b.box(c[0], c[1], c[2], hs[0], hs[1], hs[2], sign > 0 ? 'p' + 'xyz'[axis] : 'n' + 'xyz'[axis]);
    };
    place(cen1, hr.hi[1] + t / 2, h1 + t, t / 2);
    place(cen1, hr.lo[1] - t / 2, h1 + t, t / 2);
    place(hr.lo[0] - t / 2, cen2, t / 2, h2);
    place(hr.hi[0] + t / 2, cen2, t / 2, h2);
  }
}
