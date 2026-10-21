// Note: free-space field over box, tube and solid prims; positive values are inside open space.

import { CELL_ARR, FACE_DIR } from './config.js';

const BIG = 1e4;

function boxIn(p, x, y, z) {
  const c = p.c;
  const h = p.h;
  return Math.min(h[0] - Math.abs(x - c[0]), h[1] - Math.abs(y - c[1]), h[2] - Math.abs(z - c[2]));
}

const TAU = Math.PI * 2;

// Note: flat ring (platform) around a vertical axis; r0 inner and r1 outer radius, ht half thickness, optional gap of half width gw at azimuth gap.
function ringDist(p, x, y, z) {
  const dx = x - p.c[0];
  const dz = z - p.c[2];
  const rad = Math.hypot(dx, dz);
  let dr = Math.max(p.r0 - rad, rad - p.r1);
  if (p.gw !== undefined) {
    let a = Math.abs(Math.atan2(dz, dx) - p.gap) % TAU;
    if (a > Math.PI) a = TAU - a;
    dr = Math.max(dr, (p.gw - a) * rad);
  }
  const dv = Math.abs(y - p.c[1]) - p.ht;
  return Math.hypot(dr > 0 ? dr : 0, dv > 0 ? dv : 0) + Math.min(Math.max(dr, dv), 0);
}

// Note: helical ramp around a vertical axis; rmid holds the walkway centre radius at even heights between y0 and y1.
function helixDist(p, x, y, z) {
  const dyr = Math.max(p.y0 - y, y - p.y1);
  const n = p.rmid.length - 1;
  const t = Math.min(1, Math.max(0, (y - p.y0) / (p.y1 - p.y0))) * n;
  const i0 = Math.min(n - 1, Math.floor(t));
  const rm = p.rmid[i0] + (p.rmid[i0 + 1] - p.rmid[i0]) * (t - i0);
  const dx = x - p.c[0];
  const dz = z - p.c[2];
  const rad = Math.hypot(dx, dz);
  const dr = Math.abs(rad - rm) - p.hw;
  if (dr > 3) return Math.max(dr, dyr);
  const frac = (Math.atan2(dz, dx) - p.th0) / TAU;
  const k = Math.round((y - p.yRef) / p.pitch - frac);
  const yr = p.yRef + p.pitch * (frac + k);
  const ca = (TAU * rad) / Math.hypot(TAU * rad, p.pitch);
  const dv = Math.abs(y - yr) * ca - p.ht;
  const d = Math.hypot(dr > 0 ? dr : 0, dv > 0 ? dv : 0) + Math.min(Math.max(dr, dv), 0);
  return Math.max(d, dyr);
}

function solidDist(p, x, y, z) {
  if (p.shape === 'ring') return ringDist(p, x, y, z);
  if (p.shape === 'helix') return helixDist(p, x, y, z);
  const c = p.c;
  const h = p.h;
  const qx = Math.abs(x - c[0]) - h[0];
  const qy = Math.abs(y - c[1]) - h[1];
  const qz = Math.abs(z - c[2]) - h[2];
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0);
}

// Note: signed inside distance for a rounded rectangle with half sizes hw, hh and corner radius r.
export function rrIn(a, b, hw, hh, r) {
  const qx = Math.abs(a) - (hw - r);
  const qy = Math.abs(b) - (hh - r);
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return -(Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r);
}

export function tubeIn(t, x, y, z) {
  const bb = t.bb;
  if (x < bb[0] || x > bb[3] || y < bb[1] || y > bb[4] || z < bb[2] || z > bb[5]) {
    const dx = Math.max(bb[0] - x, 0, x - bb[3]);
    const dy = Math.max(bb[1] - y, 0, y - bb[4]);
    const dz = Math.max(bb[2] - z, 0, z - bb[5]);
    return -Math.hypot(dx, dy, dz) - 0.5;
  }
  const path = t.path;
  const { n, P } = path;
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < n; k += 3) {
    const dx = x - P[k * 3];
    const dy = y - P[k * 3 + 1];
    const dz = z - P[k * 3 + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  const lo = Math.max(0, best - 3);
  const hi = Math.min(n - 1, best + 3);
  for (let k = lo; k <= hi; k++) {
    const dx = x - P[k * 3];
    const dy = y - P[k * 3 + 1];
    const dz = z - P[k * 3 + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  // Note: pick the segment next to the nearest sample whose projection falls inside it.
  let seg = best;
  let tt = 0;
  const T = path.T;
  const trySeg = (k) => {
    const ax = P[k * 3];
    const ay = P[k * 3 + 1];
    const az = P[k * 3 + 2];
    const vx = P[k * 3 + 3] - ax;
    const vy = P[k * 3 + 4] - ay;
    const vz = P[k * 3 + 5] - az;
    const l2 = vx * vx + vy * vy + vz * vz || 1;
    return ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / l2;
  };
  if (best >= n - 1) {
    seg = n - 2;
    tt = trySeg(seg);
  } else if (best === 0) {
    seg = 0;
    tt = trySeg(0);
  } else {
    const tPrev = trySeg(best - 1);
    if (tPrev > 1) {
      seg = best;
      tt = trySeg(best);
    } else if (tPrev >= 0) {
      seg = best - 1;
      tt = tPrev;
    } else {
      seg = best;
      tt = trySeg(best);
    }
  }
  const S = path.S;
  let s;
  let hw;
  let hh;
  let r;
  let a;
  let b;
  const R = path.R;
  const U = path.U;
  const W = t.W;
  const H = t.H;
  const Rr = t.Rr;
  if (seg === 0 && tt < 0) {
    const dx = x - P[0];
    const dy = y - P[1];
    const dz = z - P[2];
    s = dx * T[0] + dy * T[1] + dz * T[2];
    a = dx * R[0] + dy * R[1] + dz * R[2];
    b = dx * U[0] + dy * U[1] + dz * U[2];
    hw = W[0] / 2;
    hh = H[0] / 2;
    r = Rr[0];
  } else if (seg === n - 2 && tt > 1) {
    const e = (n - 1) * 3;
    const dx = x - P[e];
    const dy = y - P[e + 1];
    const dz = z - P[e + 2];
    s = path.len + dx * T[e] + dy * T[e + 1] + dz * T[e + 2];
    a = dx * R[e] + dy * R[e + 1] + dz * R[e + 2];
    b = dx * U[e] + dy * U[e + 1] + dz * U[e + 2];
    hw = W[n - 1] / 2;
    hh = H[n - 1] / 2;
    r = Rr[n - 1];
  } else {
    const f = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    const o = seg * 3;
    const o2 = o + 3;
    const px = P[o] + (P[o2] - P[o]) * f;
    const py = P[o + 1] + (P[o2 + 1] - P[o + 1]) * f;
    const pz = P[o + 2] + (P[o2 + 2] - P[o + 2]) * f;
    const rx = R[o] + (R[o2] - R[o]) * f;
    const ry = R[o + 1] + (R[o2 + 1] - R[o + 1]) * f;
    const rz = R[o + 2] + (R[o2 + 2] - R[o + 2]) * f;
    const ux = U[o] + (U[o2] - U[o]) * f;
    const uy = U[o + 1] + (U[o2 + 1] - U[o + 1]) * f;
    const uz = U[o + 2] + (U[o2 + 2] - U[o + 2]) * f;
    const dx = x - px;
    const dy = y - py;
    const dz = z - pz;
    a = dx * rx + dy * ry + dz * rz;
    b = dx * ux + dy * uy + dz * uz;
    s = S[seg] + (S[seg + 1] - S[seg]) * f;
    hw = (W[seg] + (W[seg + 1] - W[seg]) * f) / 2;
    hh = (H[seg] + (H[seg + 1] - H[seg]) * f) / 2;
    r = Rr[seg] + (Rr[seg + 1] - Rr[seg]) * f;
  }
  let v = rrIn(a, b, hw, hh, r);
  const cap = Math.min(s - t.sLo, t.sHi - s);
  if (cap < v) v = cap;
  return v;
}

export class FreeField {
  constructor() {
    this.prims = [];
    this.solids = [];
    this.skip = null;
  }

  // Note: collects prims of a cell and its face neighbours that touch the box around the given bounds.
  gather(world, i, j, k, bounds = null) {
    this.prims = [];
    this.solids = [];
    const cells = [world.cell(i, j, k)];
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f];
      cells.push(world.cell(i + d[0], j + d[1], k + d[2]));
    }
    for (const c of cells) {
      for (const p of c.prims) {
        if (bounds) {
          const bb = primBounds(p);
          if (bb[0] > bounds[3] || bb[3] < bounds[0] || bb[1] > bounds[4] || bb[4] < bounds[1] || bb[2] > bounds[5] || bb[5] < bounds[2]) continue;
        }
        if (p.kind === 'solid') this.solids.push(p);
        else this.prims.push(p);
      }
    }
    return this;
  }

  at(x, y, z) {
    let best = -BIG;
    const prims = this.prims;
    for (let n = 0; n < prims.length; n++) {
      const p = prims[n];
      const v = p.kind === 'box' ? boxIn(p, x, y, z) : tubeIn(p, x, y, z);
      if (v > best) best = v;
    }
    const solids = this.solids;
    const skip = this.skip;
    for (let n = 0; n < solids.length; n++) {
      if (solids[n] === skip) continue;
      const d = solidDist(solids[n], x, y, z);
      if (d < best) best = d;
    }
    return best;
  }

  // Note: numeric gradient of the field, normalised; used for push-out direction.
  grad(x, y, z, out, e = 0.15) {
    const gx = this.at(x + e, y, z) - this.at(x - e, y, z);
    const gy = this.at(x, y + e, z) - this.at(x, y - e, z);
    const gz = this.at(x, y, z + e) - this.at(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    out[0] = gx / l;
    out[1] = gy / l;
    out[2] = gz / l;
    return out;
  }
}

export function primBounds(p) {
  if (p.kind === 'tube') return p.bb;
  return [p.c[0] - p.h[0], p.c[1] - p.h[1], p.c[2] - p.h[2], p.c[0] + p.h[0], p.c[1] + p.h[1], p.c[2] + p.h[2]];
}

export { CELL_ARR };
