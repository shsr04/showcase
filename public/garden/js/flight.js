// Note: balloon flight paths and clearance planning; pure helpers shared by the sim, the view and the checks.

import { N, PLANT_KINDS, BALLOON_SCALE } from './config.js';
import { knowRelic } from './rareisles.js';

const VN = N + 1;
const TAU = Math.PI * 2;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => u * u * (3 - 2 * u);

// Note: the arrival balloon is 0.72 * scale wide (radius) and 2.3 * scale + 0.22 tall; the basket origin is its bottom.
export const FLIGHT = {
  D: 60, // approach distance along the bearing
  rise: 38, // base cruise height above the pad
  tH: 0.62, tV: 0.5, // horizontal run ends at tH*dur, the vertical drop starts at tV*dur
  rad: 0.72 * BALLOON_SCALE, high: 2.3 * BALLOON_SCALE + 0.22,
  swayMax: 0.7 * 2.1 * 1.6, // widest wind rocking (gust cap 2.1)
  margin: 0.2, ovh: 0.2, sep: 3, timing: 1.5,
  step: 0.25,
  levels: [38, 47, 56, 66, 78],
  bearings: 24,
  plant: { flower: 0.4, bush: 0.6, tree: 2.3, pine: 2.6, fruittree: 2.1, wheat: 0.7, reed: 1, vine: 0.8, glowcap: 0.4 },
  building: 3, prop: 1.4, memorial: 2.4,
  // Note: set-piece props of rare islands; terrain-baked features (spire, cone, pool, plinth) already show in the heights.
  rareProp: { column: 1.8, arch: 3.4, post: 1.5 },
  // Note: tier 4 model heights from the model bounding boxes plus 0.3; unknown ids use the flat building height.
  bld: { storehouse: 2, hut: 1.94, campfire: 1.6, bonfire: 2.6, pad: 1.57, lookout: 3.17, sawmill: 2, charcoal: 1.07, ropewalk: 1.36, dock: 1.48, brickkiln: 2.26, smelter: 2.29, smithy: 2.34, windmill: 2.62, oven: 2.24, smokehouse: 2.55, loom: 2.06, coop: 1.54, pen: 1.28, glassgarden: 2.32, hall: 2.02, lampworks: 1.66, council: 2.76 },
};

// Note: the same formula as the view's bPos plus the rest height of the basket on the pad.
export function padPoint(isl, pad) {
  const fx = pad.x + pad.size / 2; const fz = pad.y + pad.size / 2;
  return { x: isl.wx + fx - N / 2, z: isl.wz + fz - N / 2, rest: isl.heightAt(fx, fz) + 0.18 };
}

export function flightTotal(ar) { return ar.dur + ar.stay + ar.lift; }

// Note: approach along the bearing at cruise height, then a vertical drop onto the pad; the lift is that path reversed.
function arrivePhase(ar, t) {
  const tH = ar.dur * FLIGHT.tH; const tV = ar.dur * FLIGHT.tV;
  const s = clamp01(t / tH);
  const q = clamp01((t - tV) / (ar.dur - tV));
  return { off: FLIGHT.D * (1 - s) * (1 - s), alt: 1 - smooth(q) };
}

export function flightPhase(ar, ts) {
  if (ts < ar.dur) return arrivePhase(ar, ts);
  if (ts < ar.dur + ar.stay) return arrivePhase(ar, ar.dur);
  return arrivePhase(ar, ar.dur * (1 - clamp01((ts - ar.dur - ar.stay) / ar.lift)));
}

// Note: sway grows with height above the pad, so the last metres of the drop are still.
export const airOf = (h) => { const u = clamp01(h / 20); return u * u; };

// Note: centre path without wind: x, y, z, height above rest, air factor and the touchdown bounce.
export function flightBase(ar, ts, x0, z0, rest) {
  const { off, alt } = flightPhase(ar, ts);
  const h = ar.rise * alt;
  const tb = ts - ar.dur;
  const bounce = tb > 0 && tb < 4 ? Math.abs(Math.sin(tb * 3.4)) * 0.55 * Math.exp(-tb * 1.2) : 0;
  return { x: x0 + Math.cos(ar.ang) * off, y: rest + h + bounce, z: z0 + Math.sin(ar.ang) * off, h, air: airOf(h) };
}

// Note: wind rocking on top of the base path; time is the smooth render clock, never a stepped sim value.
export function flightSway(ar, time, wd, air) {
  const gust = 0.5 + Math.min(wd.s, 1) * 1.6;
  const ph = ar.ang * 5;
  const bob = (Math.sin(time * 1.4 + ph) * 0.14 + Math.sin(time * 2.7 + ph * 2) * 0.05) * gust * (0.35 + 0.65 * air);
  const sway = Math.sin(time * 0.8 + ph) * 0.7 * gust * air;
  return { x: sway + wd.x * sway * 0.6, y: bob, z: wd.z * sway * 0.6, ph, gust };
}

// Note: clearance model per island: solid top height per cell (terrain, plants, buildings, props) and a lateral overhang.
export function buildField(world) {
  const isls = [];
  let maxTop = -1e9;
  for (const isl of world.islands.values()) {
    if (!isl.revealed) continue;
    const top = new Float32Array(N * N).fill(-1e9);
    const ovh = new Float32Array(N * N);
    let mx = -1e9;
    const lift = (i, j, add, o) => {
      if (i < 0 || j < 0 || i >= N || j >= N) return;
      const c = j * N + i;
      const a = j * VN + i;
      const base = Math.max(isl.h[a], isl.h[a + 1], isl.h[a + VN], isl.h[a + VN + 1]);
      top[c] = Math.max(top[c], base + add);
      ovh[c] = Math.max(ovh[c], o);
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = j * N + i;
      let near = isl.mask[c] === 1;
      for (let d = 0; d < 4 && !near; d++) { const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0); const nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0); if (ni >= 0 && nj >= 0 && ni < N && nj < N && isl.mask[nj * N + ni] === 1) near = true; }
      if (!near) continue;
      lift(i, j, 0, 0);
      const pk = isl.plant[c];
      if (pk) lift(i, j, FLIGHT.plant[PLANT_KINDS[pk]] ?? 1, 0.2);
      if (isl.stone[c] || isl.dep[c]) lift(i, j, FLIGHT.prop, 0);
    }
    for (const b of isl.buildings) {
      if (!b || b.gone) continue;
      for (let j = b.y; j < b.y + b.size; j++) for (let i = b.x; i < b.x + b.size; i++) lift(i, j, FLIGHT.bld[b.id] ?? FLIGHT.building, FLIGHT.ovh);
    }
    for (const m of isl.memorials || []) lift(m.i, m.j, FLIGHT.memorial, 0.2);
    const kr = knowRelic(isl);
    if (kr && !kr.taken) lift(kr.i, kr.j, FLIGHT.memorial, 0.2);
    // Note: columns, ice arches and pier posts of a rare island stand on the terrain; an arch lifts the cells between its feet too.
    for (const f of (isl.rare && isl.rare.features) || []) {
      const h = FLIGHT.rareProp[f.kind];
      if (!h) continue;
      lift(f.i, f.j, h, 0.2);
      if (f.kind === 'arch' && f.i2 !== undefined) {
        const n = Math.max(Math.abs(f.i2 - f.i), Math.abs(f.j2 - f.j));
        for (let k = 1; k <= n; k++) lift(Math.round(f.i + (f.i2 - f.i) * k / n), Math.round(f.j + (f.j2 - f.j) * k / n), h, 0.2);
      }
    }
    // Note: deed memorials are not buildings, so they lift the field here.
    for (const d of world.deeds || []) if (d.isl === isl.id) lift(d.x, d.z, FLIGHT.memorial, 0.2);
    for (let c = 0; c < N * N; c++) if (top[c] > mx) mx = top[c];
    maxTop = Math.max(maxTop, mx);
    isls.push({ isl, top, ovh, maxTop: mx });
  }
  const lanes = [];
  for (const l of world.links) {
    if (!l.type || !l.pts || l.state === 'none') continue;
    let hi = -1e9; let lo = 1e9;
    for (const p of l.pts) { hi = Math.max(hi, p.y); lo = Math.min(lo, p.y); }
    // Note: balloon vehicles ride 0.95 above the lane and stand 2.7 tall.
    const balloon = l.type === 'balloon';
    lanes.push({ link: l, pts: l.pts, r: balloon ? 0.8 : 0.5, lo: lo - 0.6, hi: hi + (balloon ? 0.95 + 2.7 : 3.2) });
    maxTop = Math.max(maxTop, hi + (balloon ? 3.65 : 3.2));
  }
  return { isls, lanes, maxTop };
}

function segDist(p, q, x, z) {
  const dx = q.x - p.x; const dz = q.z - p.z;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 1e-9 ? clamp01(((x - p.x) * dx + (z - p.z) * dz) / l2) : 0;
  return Math.hypot(x - (p.x + dx * u), z - (p.z + dz * u));
}

// Note: skip lists the own pad cells; the balloon lands there by design.
export function blockedAt(F, x, y, z, air, skip, margin = FLIGHT.margin) {
  const r = FLIGHT.rad + margin + FLIGHT.swayMax * air;
  const vs = 0.37 * (0.35 + 0.65 * air) + 0.1;
  const yb = y - vs;
  for (const e of F.isls) {
    if (yb >= e.maxTop) continue;
    const isl = e.isl;
    const lx = x - isl.wx + N / 2; const lz = z - isl.wz + N / 2;
    const R = r + 0.3;
    if (lx < -R || lz < -R || lx > N + R || lz > N + R) continue;
    const i0 = Math.max(0, Math.floor(lx - R)); const i1 = Math.min(N - 1, Math.floor(lx + R));
    const j0 = Math.max(0, Math.floor(lz - R)); const j1 = Math.min(N - 1, Math.floor(lz + R));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * N + i;
      if (yb >= e.top[c]) continue;
      if (skip && skip.isl === isl && skip.cells.has(c)) continue;
      const dx = Math.max(i - lx, 0, lx - (i + 1)); const dz = Math.max(j - lz, 0, lz - (j + 1));
      if (Math.hypot(dx, dz) < r + e.ovh[c]) return `island ${isl.id} cell ${i},${j}`;
    }
  }
  for (const L of F.lanes) {
    if (yb >= L.hi || y + FLIGHT.high <= L.lo) continue;
    const rr = r + L.r;
    const p = L.pts;
    for (let k = 0; k + 1 < p.length; k++) if (segDist(p[k], p[k + 1], x, z) < rr) return `lane ${L.link.id}`;
  }
  return null;
}

export function padCells(pad) {
  const s = new Set();
  for (let j = pad.y; j < pad.y + pad.size; j++) for (let i = pad.x; i < pad.x + pad.size; i++) s.add(j * N + i);
  return s;
}

function geoOf(ar) { return { x0: ar.x0, z0: ar.z0, rest: ar.rest }; }

// Note: first obstacle or other balloon this flight meets, or null; others fly in sync from their own clock.
export function flightBlocked(F, ar, others, margin = FLIGHT.margin) {
  const skip = { isl: ar.isl, cells: padCells(ar.pad) };
  const T = flightTotal(ar) + 2;
  const g = geoOf(ar);
  for (let tau = 0; tau <= T; tau += FLIGHT.step) {
    const a = flightBase(ar, tau, g.x0, g.z0, g.rest);
    if (!(a.x + a.y + a.z === a.x + a.y + a.z)) return 'nan';
    const why = blockedAt(F, a.x, a.y, a.z, a.air, skip, margin);
    if (why) return why;
    for (const o of others) {
      const to = o.t + tau;
      if (to > flightTotal(o) + 2) continue;
      const b = flightBase(o, to, o.x0, o.z0, o.rest);
      const need = FLIGHT.sep + FLIGHT.timing + FLIGHT.swayMax * (a.air + b.air) + 0.8;
      if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < need) return 'balloon';
    }
  }
  return null;
}

// Note: bearings ordered outward from the island cluster first, widening in 15 degree steps.
export function bearingOrder(world, isl, jitter) {
  let cx = 0; let cz = 0; let n = 0;
  for (const o of world.islands.values()) if (o.revealed) { cx += o.wx; cz += o.wz; n++; }
  const out = n > 1 ? Math.atan2(isl.wz - cz / n, isl.wx - cx / n) : 0;
  const base = out + jitter;
  const list = [base];
  const stp = TAU / FLIGHT.bearings;
  for (let k = 1; list.length < FLIGHT.bearings; k++) { list.push(base + k * stp); if (list.length < FLIGHT.bearings) list.push(base - k * stp); }
  return list;
}

// Note: finds a bearing and a cruise height with a clear swept path; null means hold the arrival.
export function planFlight(world, isl, pad, proto, jitter = 0) {
  const F = buildField(world);
  const pp = padPoint(isl, pad);
  const others = world.arrivals;
  const levels = FLIGHT.levels.slice();
  const high = F.maxTop + FLIGHT.rad + FLIGHT.swayMax + 1.5 + 0.5 - pp.rest;
  if (high > levels[levels.length - 1]) levels.push(Math.ceil(high));
  const ar = { ...proto, isl, pad, x0: pp.x, z0: pp.z, rest: pp.rest, t: 0 };
  for (const rise of levels) {
    for (const ang of bearingOrder(world, isl, jitter)) {
      ar.ang = ang; ar.rise = rise;
      if (!flightBlocked(F, ar, others)) return { ang, rise, x0: pp.x, z0: pp.z, rest: pp.rest };
    }
  }
  return null;
}

// Note: true while a live arrival will cross this link's lane; link balloons then wait at the station.
export function laneBusy(world, link) {
  if (!world.arrivals.length || !link.pts) return false;
  const F = { isls: [], lanes: [{ link, pts: link.pts, r: 0.8, lo: 1e9, hi: -1e9 }], maxTop: 0 };
  let lo = 1e9; let hi = -1e9;
  for (const p of link.pts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
  F.lanes[0].lo = lo - 0.6; F.lanes[0].hi = hi + 0.95 + 2.7;
  for (const ar of world.arrivals) {
    if (ar.x0 === undefined || ar.t > flightTotal(ar) + 2) continue;
    for (let ts = ar.t; ts <= flightTotal(ar) + 2; ts += 0.5) {
      const a = flightBase(ar, ts, ar.x0, ar.z0, ar.rest);
      if (blockedAt(F, a.x, a.y, a.z, a.air, null, 0.8)) return true;
    }
  }
  return false;
}

// Note: lifts the interior of a balloon lane over buildings beside it, with a gentle ramp; the stations stay put.
export function raiseLane(world, link) {
  const P = link.pts;
  if (!P || P.length < 3) return 0;
  const reach = FLIGHT.rad + 0.27 + FLIGHT.ovh + 0.02;
  const need = new Float32Array(P.length).fill(-1e9);
  for (const isl of world.islands.values()) {
    if (!isl.revealed) continue;
    for (const b of isl.buildings) {
      if (!b || b.gone) continue;
      const top = FLIGHT.bld[b.id] ?? FLIGHT.building;
      for (let k = 1; k < P.length - 1; k++) {
        const lx = P[k].x - isl.wx + N / 2; const lz = P[k].z - isl.wz + N / 2;
        if (lx < b.x - reach || lx > b.x + b.size + reach || lz < b.y - reach || lz > b.y + b.size + reach) continue;
        for (let j = b.y; j < b.y + b.size; j++) for (let i = b.x; i < b.x + b.size; i++) {
          const dx = Math.max(i - lx, 0, lx - (i + 1)); const dz = Math.max(j - lz, 0, lz - (j + 1));
          if (Math.hypot(dx, dz) >= reach) continue;
          const a = j * VN + i;
          const base = Math.max(isl.h[a], isl.h[a + 1], isl.h[a + VN], isl.h[a + VN + 1]);
          need[k] = Math.max(need[k], base + top + 0.2295 + 0.05 - 0.95);
        }
      }
    }
  }
  let raised = 0;
  for (let k = 1; k < P.length - 1; k++) if (need[k] > P[k].y) { P[k].y = need[k]; raised++; }
  if (!raised) return 0;
  const slope = 0.45;
  const d = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].z - P[b].z);
  for (let k = 1; k < P.length - 1; k++) P[k].y = Math.max(P[k].y, P[k - 1].y - slope * d(k, k - 1));
  for (let k = P.length - 2; k >= 1; k--) P[k].y = Math.max(P[k].y, P[k + 1].y - slope * d(k, k + 1));
  return raised;
}

// Note: the first ride fells plants that stand in the vehicle's lane near a station; props and buildings stay.
export function clearLane(world, link) {
  if (!link.pts) return 0;
  raiseLane(world, link);
  let n = 0;
  for (const isl of world.islands.values()) {
    if (!isl.revealed) continue;
    for (const p of link.pts) {
      const lx = p.x - isl.wx + N / 2; const lz = p.z - isl.wz + N / 2;
      if (lx < -1 || lz < -1 || lx > N + 1 || lz > N + 1) continue;
      const yv = p.y + 0.95 - 0.1;
      for (let j = Math.max(0, Math.floor(lz - 1)); j <= Math.min(N - 1, Math.floor(lz + 1)); j++) for (let i = Math.max(0, Math.floor(lx - 1)); i <= Math.min(N - 1, Math.floor(lx + 1)); i++) {
        const c = j * N + i;
        const pk = isl.plant[c];
        if (!pk) continue;
        const dx = Math.max(i - lx, 0, lx - (i + 1)); const dz = Math.max(j - lz, 0, lz - (j + 1));
        if (Math.hypot(dx, dz) >= 0.72 + 0.2) continue;
        const a = j * VN + i;
        const base = Math.max(isl.h[a], isl.h[a + 1], isl.h[a + VN], isl.h[a + VN + 1]);
        if (base + (FLIGHT.plant[PLANT_KINDS[pk]] ?? 1) <= yv) continue;
        isl.plant[c] = 0; isl.grow[c] = 0; isl.touch('plant'); n++;
      }
    }
  }
  return n;
}
