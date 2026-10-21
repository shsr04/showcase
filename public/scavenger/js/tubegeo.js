// Note: tube cross-section geometry; rounded-rectangle rings swept along a path with section lookup helpers.

import { clamp } from './rand.js';
import { rrIn } from './collide.js';
import * as V from './path.js';

const SHAPES = new Map();

export function shape(K) {
  let s = SHAPES.get(K);
  if (!s) {
    const N = 4 * (K + 1);
    const cosA = new Float32Array(N);
    const sinA = new Float32Array(N);
    for (let c = 0; c < 4; c++) {
      for (let t = 0; t <= K; t++) {
        const a = ((-90 + 90 * c + (90 * t) / K) * Math.PI) / 180;
        cosA[c * (K + 1) + t] = Math.cos(a);
        sinA[c * (K + 1) + t] = Math.sin(a);
      }
    }
    s = { K, N, cosA, sinA };
    SHAPES.set(K, s);
  }
  return s;
}

// Note: fills profile-space ring arrays for half sizes hw, hh, corner radius r, shrunk by inset.
function ringProfile(sh, hw, hh, r, inset, out) {
  const { N, cosA, sinA } = sh;
  const K1 = sh.K + 1;
  const w = Math.max(0.05, hw - inset);
  const h = Math.max(0.05, hh - inset);
  const rad = Math.min(Math.max(0.02, r - inset), w, h);
  for (let j = 0; j < N; j++) {
    const c = (j / K1) | 0;
    const cx = c < 2 ? w - rad : -w + rad;
    const cy = c === 0 || c === 3 ? -h + rad : h - rad;
    out.x[j] = cx + rad * cosA[j];
    out.y[j] = cy + rad * sinA[j];
    out.nx[j] = cosA[j];
    out.ny[j] = sinA[j];
  }
  return out;
}

export const newRing = (N) => ({
  x: new Float32Array(N), y: new Float32Array(N), nx: new Float32Array(N), ny: new Float32Array(N),
});

// Note: ring segments are grouped into floor, wall and ceiling runs so each run can use its own layer.
function bandRuns(sh, floored) {
  const { N, sinA } = sh;
  const band = new Array(N);
  for (let j = 0; j < N; j++) {
    const ny = (sinA[j] + sinA[(j + 1) % N]) / 2;
    band[j] = !floored ? 1 : ny < -0.55 ? 0 : ny > 0.55 ? 2 : 1;
  }
  let start = -1;
  for (let j = 0; j < N; j++) {
    if (band[j] !== band[(j - 1 + N) % N]) {
      start = j;
      break;
    }
  }
  if (start < 0) return [{ band: band[0], start: 0, count: N }];
  const runs = [];
  let cur = null;
  for (let m = 0; m < N; m++) {
    const j = (start + m) % N;
    if (cur && cur.band === band[j]) cur.count++;
    else {
      cur = { band: band[j], start: j, count: 1 };
      runs.push(cur);
    }
  }
  return runs;
}

export class TubeGeo {
  constructor(path, prof, K, floored) {
    this.path = path;
    this.W = prof.W;
    this.H = prof.H;
    this.Rr = prof.Rr;
    this.sh = shape(K);
    this.floored = floored;
    this.runs = bandRuns(this.sh, floored);
    this.rings = [];
    for (let i = 0; i < path.n; i++) {
      this.rings.push(ringProfile(this.sh, this.W[i] / 2, this.H[i] / 2, this.Rr[i], 0, newRing(this.sh.N)));
    }
    this.tmp = newRing(this.sh.N);
  }

  // Note: interpolated section at arc length s, clamped to the path.
  sec(s) {
    const path = this.path;
    const { i, f } = V.locate(path, clamp(s, 0, path.len));
    const fr = V.frameAt(path, clamp(s, 0, path.len));
    return {
      p: fr.p, t: fr.t, r: fr.r, u: fr.u, i, f,
      w: this.W[i] + (this.W[i + 1] - this.W[i]) * f,
      h: this.H[i] + (this.H[i + 1] - this.H[i]) * f,
      rr: this.Rr[i] + (this.Rr[i + 1] - this.Rr[i]) * f,
    };
  }

  secRing(sec, inset) {
    return ringProfile(this.sh, sec.w / 2, sec.h / 2, sec.rr, inset, newRing(this.sh.N));
  }

  // Note: world point for profile coordinates on a section.
  at(sec, x, y, out = [0, 0, 0]) {
    out[0] = sec.p[0] + sec.r[0] * x + sec.u[0] * y;
    out[1] = sec.p[1] + sec.r[1] * x + sec.u[1] * y;
    out[2] = sec.p[2] + sec.r[2] * x + sec.u[2] * y;
    return out;
  }

  // Note: world-space inward normal from profile outward normal components.
  inward(sec, nx, ny) {
    return [-(sec.r[0] * nx + sec.u[0] * ny), -(sec.r[1] * nx + sec.u[1] * ny), -(sec.r[2] * nx + sec.u[2] * ny)];
  }
}

// Note: finds the ring point whose direction from the centre matches angle phi; returns profile x, y and normal.
export function ringAtAngle(ring, N, phi) {
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    const x0 = ring.x[j];
    const y0 = ring.y[j];
    const ex = ring.x[j2] - x0;
    const ey = ring.y[j2] - y0;
    const den = ex * dy - ey * dx;
    if (Math.abs(den) < 1e-9) continue;
    const t = -(x0 * dy - y0 * dx) / den;
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    const lam = (x0 + t * ex) * dx + (y0 + t * ey) * dy;
    if (lam <= 0) continue;
    const nx = ring.nx[j] + (ring.nx[j2] - ring.nx[j]) * t;
    const ny = ring.ny[j] + (ring.ny[j2] - ring.ny[j]) * t;
    const nl = Math.hypot(nx, ny) || 1;
    return { x: x0 + t * ex, y: y0 + t * ey, nx: nx / nl, ny: ny / nl };
  }
  return { x: ring.x[0], y: ring.y[0], nx: ring.nx[0], ny: ring.ny[0] };
}

// Note: where a ray from the profile centre at angle phi meets a rounded rectangle; n is the inward normal in profile axes.
export function ringHit(w, h, r, phi) {
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.min(r, hw, hh);
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  let lo = 0;
  let hi = Math.hypot(hw, hh) * 1.02;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) / 2;
    if (rrIn(dx * m, dy * m, hw, hh, rad) > 0) lo = m;
    else hi = m;
  }
  const x = dx * lo;
  const y = dy * lo;
  const e = 0.01;
  const gx = rrIn(x + e, y, hw, hh, rad) - rrIn(x - e, y, hw, hh, rad);
  const gy = rrIn(x, y + e, hw, hh, rad) - rrIn(x, y - e, hw, hh, rad);
  const gl = Math.hypot(gx, gy) || 1;
  return { x, y, nx: gx / gl, ny: gy / gl };
}

// Note: profile y of the boundary on the vertical line at lateral x, searching from the centre outwards (sign +1 up, -1 down).
export function edgeY(w, h, r, x, sign) {
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.min(r, hw, hh);
  const ax = clamp(x, -hw + 0.01, hw - 0.01);
  let lo = 0;
  let hi = hh * 1.01;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (rrIn(ax, sign * m, hw, hh, rad) > 0) lo = m;
    else hi = m;
  }
  return sign * lo;
}

// Note: profile x of the boundary on the horizontal line at height y, searching from the centre to the right.
export function edgeX(w, h, r, y) {
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.min(r, hw, hh);
  const ay = clamp(y, -hh + 0.01, hh - 0.01);
  let lo = 0;
  let hi = hw * 1.01;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (rrIn(m, ay, hw, hh, rad) > 0) lo = m;
    else hi = m;
  }
  return lo;
}

// Note: arc length where the path crosses world coordinate u on an axis, or -1; the path must be monotone on that axis.
export function sOfCoord(path, axis, u) {
  const { n, P, S } = path;
  const val = (i) => P[i * 3 + axis];
  const inc = val(n - 1) > val(0);
  if (inc ? u < val(0) || u > val(n - 1) : u > val(0) || u < val(n - 1)) return -1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (inc ? val(m) <= u : val(m) >= u) lo = m;
    else hi = m;
  }
  const span = val(hi) - val(lo) || 1;
  return S[lo] + ((S[hi] - S[lo]) * (u - val(lo))) / span;
}

// Note: stations at world coordinates (k + off) * spacing along an axis whose arc length lies in [lo, hi); neighbouring cells agree on them.
export function axisSlots(path, axis, spacing, off, lo, hi) {
  const { n, P } = path;
  const a0 = P[axis];
  const a1 = P[(n - 1) * 3 + axis];
  const out = [];
  if (Math.abs(a1 - a0) < 1) return out;
  for (let k = Math.ceil(Math.min(a0, a1) / spacing - off); (k + off) * spacing <= Math.max(a0, a1); k++) {
    const u = (k + off) * spacing;
    const s = sOfCoord(path, axis, u);
    if (s >= lo && s < hi) out.push({ k, u, s });
  }
  return out;
}

// Note: lateral world vector of a horizontal tube per axis; angle 0 of a cross-section points along it and 90 degrees up.
const REF = [[0, 0, 1], [1, 0, 0], [1, 0, 0]];

// Note: world direction inside the cross-section of a tube along axis; vertical tubes use the azimuth.
export function crossDir(axis, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === 1) return [c, 0, s];
  const r = REF[axis];
  return [r[0] * c, s, r[2] * c];
}

export const lateralRef = (axis) => REF[axis];

// Note: ring-shaped rib with a flat inner face; face and side are { layer, tint, emis? }, depth is the inward protrusion.
export function emitRib(b, geo, s0, s1, depth, face, side = face) {
  const sec0 = geo.sec(s0);
  const sec1 = geo.sec(s1);
  const N = geo.sh.N;
  const o0 = geo.secRing(sec0, 0);
  const i0 = geo.secRing(sec0, depth);
  const o1 = geo.secRing(sec1, 0);
  const i1 = geo.secRing(sec1, depth);
  const T = sec0.t;
  const T1 = sec1.t;
  const ringVerts = (sec, ring, nrmFn, vv, perim) => {
    const ids = [];
    let cum = 0;
    for (let j = 0; j <= N; j++) {
      const jj = j % N;
      if (j > 0) cum += Math.hypot(ring.x[jj] - ring.x[(jj - 1 + N) % N], ring.y[jj] - ring.y[(jj - 1 + N) % N]);
      const p = geo.at(sec, ring.x[jj], ring.y[jj]);
      const nn = nrmFn(jj);
      ids.push(b.v(p[0], p[1], p[2], nn[0], nn[1], nn[2], cum / perim, vv));
    }
    return ids;
  };
  const nA = [-T[0], -T[1], -T[2]];
  b.mat(side.layer, side.tint, side.emis || 0);
  const tileS = b.tile();
  const sideA = ringVerts(sec0, o0, () => nA, 0, tileS);
  const sideAi = ringVerts(sec0, i0, () => nA, depth / tileS, tileS);
  for (let j = 0; j < N; j++) b.quadIdx(sideA[j], sideA[j + 1], sideAi[j + 1], sideAi[j], nA);
  const sideB = ringVerts(sec1, o1, () => T1, 0, tileS);
  const sideBi = ringVerts(sec1, i1, () => T1, depth / tileS, tileS);
  for (let j = 0; j < N; j++) b.quadIdx(sideB[j], sideB[j + 1], sideBi[j + 1], sideBi[j], T1);
  b.mat(face.layer, face.tint, face.emis || 0);
  const tileF = b.tile();
  const inward = (sec, ring) => (j) => geo.inward(sec, ring.nx[j], ring.ny[j]);
  const innerA = ringVerts(sec0, i0, inward(sec0, i0), 0, tileF);
  const innerB = ringVerts(sec1, i1, inward(sec1, i1), (s1 - s0) / tileF, tileF);
  for (let j = 0; j < N; j++) b.quadIdx(innerA[j], innerA[j + 1], innerB[j + 1], innerB[j], geo.inward(sec0, i0.nx[j], i0.ny[j]));
}
