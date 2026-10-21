// Note: small vector helpers plus Bezier path sampling with rotation-minimizing frames.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const mix3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

export function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

// Note: returns a path resampled at uniform arc length; arrays are Float32Array(n*3) except S.
export function samplePath(p0, p1, p2, p3, spacing = 2) {
  const N = 64;
  const dense = [];
  const cum = [0];
  for (let i = 0; i <= N; i++) {
    const p = bezier(p0, p1, p2, p3, i / N);
    dense.push(p);
    if (i > 0) cum.push(cum[i - 1] + dist(dense[i - 1], p));
  }
  const total = cum[N];
  const n = Math.max(2, Math.ceil(total / spacing) + 1);
  const P = new Float32Array(n * 3);
  const S = new Float32Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (seg < N - 1 && cum[seg + 1] < target) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / span;
    const p = mix3(dense[seg], dense[seg + 1], f);
    P[i * 3] = p[0];
    P[i * 3 + 1] = p[1];
    P[i * 3 + 2] = p[2];
    S[i] = target;
  }
  const T = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const t = norm([P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]]);
    T[i * 3] = t[0];
    T[i * 3 + 1] = t[1];
    T[i * 3 + 2] = t[2];
  }
  const t0 = norm(sub(p1, p0).some((v) => v !== 0) ? sub(p1, p0) : sub(p3, p0));
  const t1 = norm(sub(p3, p2).some((v) => v !== 0) ? sub(p3, p2) : sub(p3, p0));
  T.set(t0, 0);
  T.set(t1, (n - 1) * 3);
  return { n, len: total, P, T, S, R: null, U: null };
}

function reflect(v, axis, c) {
  const k = (2 / c) * dot(axis, v);
  return [v[0] - k * axis[0], v[1] - k * axis[1], v[2] - k * axis[2]];
}

// Note: symmetry 'round' drops twist, 'square' keeps it modulo 90 degrees, 'none' keeps all.
export function buildFrames(path, startFrame, endFrame, symmetry = 'none') {
  const { n, P, T } = path;
  const R = new Float32Array(n * 3);
  const U = new Float32Array(n * 3);
  const get = (A, i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]];
  const t0 = get(T, 0);
  // Note: pick the sign of the symmetric profile x axis so that up = tangent x right matches the canonical up.
  const orient = (fr, t) => {
    let r = norm(sub(fr.r, mul(t, dot(fr.r, t))));
    if (dot(cross(t, r), fr.u) < 0) r = mul(r, -1);
    return r;
  };
  const r0 = orient(startFrame, t0);
  R.set(r0, 0);
  U.set(norm(cross(t0, r0)), 0);
  for (let i = 0; i < n - 1; i++) {
    const x0 = get(P, i);
    const x1 = get(P, i + 1);
    const v1 = sub(x1, x0);
    const c1 = dot(v1, v1);
    if (c1 < 1e-12) {
      R.set(get(R, i), (i + 1) * 3);
      U.set(get(U, i), (i + 1) * 3);
      continue;
    }
    const ri = get(R, i);
    const ti = get(T, i);
    const tj = get(T, i + 1);
    const rL = reflect(ri, v1, c1);
    const tL = reflect(ti, v1, c1);
    const v2 = sub(tj, tL);
    const c2 = dot(v2, v2);
    const rj = c2 < 1e-14 ? rL : reflect(rL, v2, c2);
    const rn = norm(sub(rj, mul(tj, dot(rj, tj))));
    R.set(rn, (i + 1) * 3);
    U.set(norm(cross(tj, rn)), (i + 1) * 3);
  }
  const tn = get(T, n - 1);
  const rE = get(R, n - 1);
  const uE = get(U, n - 1);
  const rT = orient(endFrame, tn);
  const uT = norm(cross(tn, rT));
  let theta = Math.atan2(dot(cross(uE, uT), tn), dot(uE, uT));
  if (symmetry === 'round') theta = 0;
  else if (symmetry === 'square') {
    const q = Math.PI / 2;
    theta = theta - Math.round(theta / q) * q;
  }
  if (Math.abs(theta) > 1e-4) {
    for (let i = 0; i < n; i++) {
      const f = path.len > 0 ? path.S[i] / path.len : 0;
      const phi = theta * (f * f * (3 - 2 * f));
      const t = get(T, i);
      const rr = get(R, i);
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const tr = cross(t, rr);
      const rn = norm([rr[0] * c + tr[0] * s, rr[1] * c + tr[1] * s, rr[2] * c + tr[2] * s]);
      R.set(rn, i * 3);
      U.set(norm(cross(t, rn)), i * 3);
    }
  }
  path.R = R;
  path.U = U;
  return path;
}

// Note: fractional sample lookup for arc length s; returns index i and blend f.
export function locate(path, s) {
  const { n, S } = path;
  if (s <= 0) return { i: 0, f: 0 };
  if (s >= path.len) return { i: n - 2, f: 1 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = S[hi] - S[lo] || 1;
  return { i: lo, f: (s - S[lo]) / span };
}

export function frameAt(path, s) {
  const { i, f } = locate(path, s);
  const a = i * 3;
  const b = (i + 1) * 3;
  const l = (A) => [
    A[a] + (A[b] - A[a]) * f,
    A[a + 1] + (A[b + 1] - A[a + 1]) * f,
    A[a + 2] + (A[b + 2] - A[a + 2]) * f,
  ];
  const T = norm(l(path.T));
  let R = l(path.R);
  R = norm(sub(R, mul(T, dot(R, T))));
  const U = norm(cross(T, R));
  return { p: l(path.P), t: T, r: R, u: U };
}
