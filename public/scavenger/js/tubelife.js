// Note: tube life; plans lamps, signs, doors, rails, columns, ladders and catwalks as pure data, then meshes them.

import {
  L, STYLE, FACE_SIGN, CELL_ARR, DISTRICTS,
} from './config.js';
import { hash4, u01, clamp } from './rand.js';
import * as V from './path.js';
import {
  ringHit, ringAtAngle, edgeY, edgeX, axisSlots, emitRib, lateralRef, sOfCoord,
} from './tubegeo.js';
import { WALLITEMS } from './props.js';

const TAU = Math.PI * 2;
const ad = V.madd;
const UPW = [0, 1, 0];
const HELIX_PITCH = 64;
const HELIX_HW = 1.65;
const ROUND_MIN = 12;
export const GATE_W = 1.2;

// Note: space descriptors of a cell: one per stub plus the through tube.
export function tubeList(plan) {
  const out = [];
  for (const s of plan.stubs) {
    out.push({
      id: 'S' + s.f, kind: 'stub', f: s.f, fa: -1, fb: s.f, path: s.path, W: s.W, H: s.H, Rr: s.Rr, edgeA: s.edge, edgeB: s.edge,
    });
  }
  if (plan.through) {
    const t = plan.through;
    out.push({
      id: 'T', kind: 'through', f: 9, fa: t.fa, fb: t.fb, path: t.path, W: t.W, H: t.H, Rr: t.Rr, edgeA: t.ea, edgeB: t.eb,
    });
  }
  return out;
}

// Note: interpolated section at arc length s: centre, frame and profile size.
function planSec(t, s) {
  const { path, W, H, Rr } = t;
  const c = clamp(s, 0, path.len);
  const { i, f } = V.locate(path, c);
  const fr = V.frameAt(path, c);
  return {
    p: fr.p,
    r: fr.r,
    u: fr.u,
    t: fr.t,
    w: W[i] + (W[i + 1] - W[i]) * f,
    h: H[i] + (H[i + 1] - H[i]) * f,
    rr: Rr[i] + (Rr[i + 1] - Rr[i]) * f,
  };
}

function pickWeighted(table, r) {
  let total = 0;
  for (const k in table) total += table[k];
  let x = r * total;
  for (const k in table) {
    x -= table[k];
    if (x <= 0) return k;
  }
  return 'none';
}

const pad4 = (v) => String(Math.max(0, Math.round(v))).padStart(4, '0');
const worldHalf = (axis, along, lat, up) => {
  const h = [0, up, 0];
  h[axis] = along;
  h[axis === 0 ? 2 : 0] = lat;
  return h;
};

// -- lamps --

// Note: lamp family per tube class; hl and hw are the fixture half length and width, k the intensity boost.
function lampSpec(type) {
  const r = Math.max(12, type.light * 1.35);
  if (type.id === 'silo') return { hl: 3.8, hw: 0.5, k: 1.9, halo: 8.5, r: 46, q: 0.04 };
  if (type.id === 'nave') return { hl: 2.6, hw: 0.9, k: 3.4, halo: 11, r: 64, q: 0.02 };
  if (type.id === 'well') return { hl: 3.2, hw: 0.42, k: 1.5, halo: 6.5, r: 34 };
  if (type.id === 'gallery') return { hl: 1.7, hw: 0.5, k: 1.45, halo: 4.8, r: 30 };
  if (type.w > 12) return { hl: 1.3, hw: 0.36, k: 1.35, halo: 3.6, r };
  if (type.w < 6) return { hl: 0.65, hw: 0.17, k: 1, halo: 0, r };
  return { hl: 1.0, hw: 0.26, k: 1, halo: 0, r };
}

// Note: lamp mounts per station; ang is a world azimuth on a vertical tube, x a lateral fraction of the ceiling.
function lampMounts(type, vertical, k) {
  if (type.hoop) return [0, 1, 2, 3].map((q) => ({ ang: (q * 0.5 + (k & 1) * 0.25) * Math.PI }));
  if (vertical) return [{ ang: (k & 1) * Math.PI }];
  if (type.id === 'nave') return [-0.5, 0.5].map((x) => ({ x, drop: 11 }));
  if (type.id === 'gallery') return [-0.4, 0.4].map((x) => ({ x, drop: 5 }));
  if (type.w > 12) return [-0.4, 0.4].map((x) => ({ x, drop: 0 }));
  return [{ x: 0, drop: 0 }];
}

function lightState(plan, h) {
  const D = plan.D;
  const r = u01(h);
  if (r < D.fail * 0.55) return 'dead';
  if (r < D.fail) return 'flicker';
  if (r < D.fail + 0.06) return 'alarm';
  return 'on';
}

// Note: long dark stretches along a run, decided per 120 m window so neighbouring cells agree; the ends of a run stay lit.
function darkWindow(plan, e, u) {
  if (e.idx === 0 || e.idx === e.run.len - 1) return false;
  return u01(hash4(e.run.seed, Math.floor(u / 120) & 0xffff, 5, 9)) < 0.14 + plan.D.fail * 0.5;
}

function addLamp(plan, t, s, e, k, q, m) {
  const sec = planSec(t, s);
  const spec = lampSpec(e.type);
  let phi;
  if (m.ang !== undefined) {
    const v = [Math.cos(m.ang), 0, Math.sin(m.ang)];
    phi = Math.atan2(V.dot(v, sec.u), V.dot(v, sec.r));
  } else phi = Math.atan2(sec.h / 2, m.x * (sec.w / 2) || 1e-3);
  const hit = ringHit(sec.w, sec.h, sec.rr, phi);
  const inw = V.norm(ad(V.mul(sec.r, hit.nx), sec.u, hit.ny));
  const anchor = ad(ad(sec.p, sec.r, hit.x), sec.u, hit.y);
  const drop = m.drop || 0;
  const lp = ad(anchor, inw, 0.45 + drop);
  const D = plan.D;
  let state = lightState(plan, hash4(plan.seed ^ e.seed, t.id.charCodeAt(0), k, q + 91));
  if (state !== 'alarm' && darkWindow(plan, e, lp[e.axis])) {
    state = u01(hash4(e.seed, k, q, 17)) < 0.85 ? 'dead' : 'flicker';
  }
  let color = D.lamp;
  let style = STYLE.STATIC;
  let intensity = 1;
  if (state === 'dead') intensity = 0;
  else if (state === 'flicker') style = u01(hash4(e.seed, k, q, 5)) < 0.5 ? STYLE.FAIL : STYLE.FLICKER2;
  else if (state === 'alarm') {
    color = D.alarm;
    style = STYLE.BEACON;
    intensity = 1.3;
  }
  const light = {
    p: lp, n: inw, c: color, i: intensity * spec.k, r: spec.r, style, kind: 'strip', state, sp: t.id,
    axisR: V.norm(V.cross(sec.t, inw)), axisT: sec.t, anchor, drop, hl: spec.hl, hw: spec.hw,
  };
  if (spec.halo) light.halo = spec.halo;
  if (spec.q) light.q = spec.q;
  plan.lights.push(light);
}

// Note: lamp stations are measured from the shared faces so both cells of a face agree on the spacing.
function planLamps(plan, t) {
  const { path, edgeA, edgeB } = t;
  const len = path.len;
  const stations = [];
  if (t.kind === 'through') {
    const sa = edgeA.type.light;
    const sb = edgeB.type.light;
    for (let k = 0; ; k++) {
      const s = sa * (k + 0.5);
      if (s > len * 0.5) break;
      stations.push([s, edgeA, k]);
    }
    for (let k = 0; ; k++) {
      const s = len - sb * (k + 0.5);
      if (s < len * 0.5) break;
      const last = stations[stations.length - 1];
      if (last && Math.abs(last[0] - s) < Math.min(sa, sb) * 0.55) continue;
      stations.push([s, edgeB, k + 100]);
    }
  } else {
    for (let k = 0; ; k++) {
      const s = len - edgeA.type.light * (k + 0.5);
      if (s < 4) break;
      stations.push([s, edgeA, k + 100]);
    }
  }
  for (const [s, e, k] of stations) {
    const ms = lampMounts(e.type, e.axis === 1, k);
    for (let q = 0; q < ms.length; q++) addLamp(plan, t, s, e, k, q, ms[q]);
  }
}

// -- life planning --

// Note: kit per tunnel type; weights of the overlay features placed between the distance markers.
const OVERLAY = {
  corridor: { hatch: 3, cab: 2, jbox: 2, none: 3 },
  service: { hatch: 3, cab: 3, jbox: 2, none: 2 },
  pipeway: { jbox: 3, none: 5 },
  trunk: { gear: 4, jbox: 1, none: 2 },
  gallery: { gear: 5, none: 2 },
  nave: { gear: 4, none: 3 },
  duct: { jbox: 1, none: 5 },
  crawl: { jbox: 1, none: 5 },
};

// Note: bulkhead rings stand at faces owned by the cell on the low side, so each face is drawn once.
function planGate(t, life) {
  const gates = [];
  if (t.kind === 'stub') {
    if (FACE_SIGN[t.fb] > 0 && t.edgeA.gate) gates.push([t.path.len, t.edgeA]);
  } else {
    if (FACE_SIGN[t.fa] > 0 && t.edgeA.gate) gates.push([0, t.edgeA]);
    if (FACE_SIGN[t.fb] > 0 && t.edgeB.gate) gates.push([t.path.len, t.edgeB]);
  }
  for (const [s, e] of gates) {
    life.push({
      sp: t.id, kind: 'gate', s, atStart: s === 0, change: e.dLo !== e.dHi, dLo: e.dLo, dHi: e.dHi, tag: e.run.seed & 0xfff,
    });
  }
}

// Note: ladders and platforms of a vertical shaft; wells get a spiral catwalk instead.
function planShaft(plan, t, life, h0, h1, e) {
  const { path } = t;
  const type = e.type;
  const run = e.run;
  const ang = (hash4(run.seed, 41, 1, 1) % 8) * (TAU / 8);
  const lo = Math.max(h0, t.kind === 'stub' ? 3.5 : 0.15);
  const hi = Math.min(h1, path.len - 0.15);
  const wide = type.w >= ROUND_MIN * 2;
  for (const sl of axisSlots(path, 1, 32, 0, lo + 1, hi - 1)) {
    if (u01(hash4(run.seed, sl.k, 0x7e1, 5)) < 0.3) continue;
    life.push({
      sp: t.id, kind: 'mark', s: sl.s, dir: [Math.cos(ang + 1.2), 0, Math.sin(ang + 1.2)], deck: 60 + Math.floor(sl.u / 8), vertical: true,
    });
  }
  if (wide) {
    planHelix(plan, t, life, run);
    return;
  }
  life.push({
    sp: t.id, kind: 'ladder', s0: lo, s1: hi, ang,
  });
  for (const sl of axisSlots(path, 1, 16, 0.5, Math.max(lo, 2), Math.min(hi, path.len - 2))) {
    if (u01(hash4(run.seed, sl.k, 0x91a, 4)) < 0.2) continue;
    const sec = planSec(t, sl.s);
    const R = Math.min(sec.w, sec.h) / 2;
    const ww = Math.min(1.3, R * 0.34);
    life.push({
      sp: t.id, kind: 'plat', s: sl.s, ang, ww,
    });
    plan.prims.push({
      kind: 'solid', shape: 'ring', tube: true, c: sec.p.slice(), r0: R - ww, r1: R, ht: 0.1, h: [R, 0.1, R], gap: ang, gw: 0.34,
    });
  }
}

// Note: the catwalk winds along the wall of a well wherever the tube is wide; its angle depends on absolute height only.
function planHelix(plan, t, life, run) {
  const { path, W } = t;
  const idx = [];
  for (let i = 0; i < path.n; i++) if (W[i] >= ROUND_MIN * 2) idx.push(i);
  if (idx.length < 4) return;
  const order = idx.slice().sort((a, b) => path.P[a * 3 + 1] - path.P[b * 3 + 1]);
  const y0 = path.P[order[0] * 3 + 1];
  const y1 = path.P[order[order.length - 1] * 3 + 1];
  const rmid = Float32Array.from(order, (i) => W[i] / 2 - 0.3 - HELIX_HW);
  const cx = path.P[order[0] * 3];
  const cz = path.P[order[0] * 3 + 2];
  const th0 = u01(hash4(run.seed, 77, 3, 5)) * TAU;
  const rmax = Math.max(...rmid) + HELIX_HW;
  life.push({
    sp: t.id, kind: 'helix', y0, y1, cx, cz, th0, rmid, hw: HELIX_HW, ht: 0.14,
  });
  plan.prims.push({
    kind: 'solid', shape: 'helix', tube: true, c: [cx, (y0 + y1) / 2, cz], h: [rmax, (y1 - y0) / 2, rmax], y0, y1, rmid, hw: HELIX_HW, ht: 0.14, th0, yRef: 0, pitch: HELIX_PITCH,
  });
}

// Note: rows of pillars along both walls at the rib stations; vast tubes get fat ones.
function planColumns(plan, t, life, h0, h1, axis, type) {
  const big = type.w > 50;
  const rad = big ? 1.7 : 0.62;
  for (const sl of axisSlots(t.path, axis, type.rib, 0.5, Math.max(h0, 2.5), Math.min(h1, t.path.len - 2.5))) {
    const sec = planSec(t, sl.s);
    if (sec.w < type.w * (big ? 0.985 : 0.65)) continue;
    // Note: capitals need a flat floor under them, so pillars stand no further out than where the floor starts to curve.
    const x = Math.min(sec.w / 2 - (big ? 6.5 : 3.6), sec.w / 2 - sec.rr + 0.5);
    for (const side of [-1, 1]) {
      const xs = x * side;
      const yf = edgeY(sec.w, sec.h, sec.rr, xs, -1);
      const yc = edgeY(sec.w, sec.h, sec.rr, xs, 1);
      life.push({
        sp: t.id, kind: 'col', s: sl.s, x: xs, yf, yc, rad,
      });
      const c = ad(ad(sec.p, sec.r, xs), sec.u, (yf + yc) / 2);
      plan.prims.push({ kind: 'solid', tube: true, c, h: worldHalf(axis, rad + 0.24, rad + 0.24, (yc - yf) / 2) });
    }
  }
}

// Note: gantries cross a vast tube from wall to wall, low or high; slots sit at world coordinates so cells agree.
function planSpans(plan, t, life, h0, h1, axis, e) {
  const type = e.type;
  for (const sl of axisSlots(t.path, axis, 96, 0.5, Math.max(h0, 4), Math.min(h1, t.path.len - 4))) {
    const hsh = hash4(e.run.seed, sl.k, 0x5a9, axis);
    if (u01(hsh) < 0.4) continue;
    const sec = planSec(t, sl.s);
    if (sec.w < type.w * 0.95) continue;
    const y = (hsh >>> 8) & 1 ? sec.h / 2 - 8 : -sec.h / 2 + 6.5;
    const hx = edgeX(sec.w, sec.h, sec.rr, y) - 0.2;
    life.push({
      sp: t.id, kind: 'span', s: sl.s, y, hx, seed: hsh >>> 3,
    });
    plan.prims.push({ kind: 'solid', tube: true, c: ad(sec.p, sec.u, y + 0.3), h: worldHalf(axis, 1.7, hx, 0.9) });
  }
}

// Note: half extents of the gear variants (crate stack, barrels, generator) as lateral, up and along the tube.
const GEAR_HALF = [[0.95, 1.2, 0.95], [0.95, 0.55, 0.95], [0.8, 0.9, 0.5]];

function planGear(plan, t, life, base, type) {
  const sec = planSec(t, base.s);
  const flat = sec.w / 2 - sec.rr;
  if (flat < 3) return;
  const k = type.vast ? 2.5 : 1;
  const x = base.side * Math.min(flat - 1.6 * k, 2.4 * k + u01(hash4(base.seed, 3, 1, 1)) * Math.max(0, flat - 4.5 * k));
  const yf = edgeY(sec.w, sec.h, sec.rr, x, -1);
  const variant = base.seed % 3;
  const c = ad(ad(sec.p, sec.r, x), sec.u, yf);
  const [lat, up, along] = GEAR_HALF[variant].map((v) => v * k);
  plan.prims.push({ kind: 'solid', tube: true, c: [c[0], c[1] + up, c[2]], h: worldHalf(base.axis, along, lat, up) });
  life.push({
    ...base, kind: 'gear', x, yf, variant, k,
  });
}

function planLife(plan, t) {
  const life = plan.life;
  const { path, edgeA, edgeB } = t;
  const len = path.len;
  planGate(t, life);
  if (edgeA.axis !== edgeB.axis) return;
  const axis = edgeA.axis;
  const mid = len / 2;
  const same = edgeA.run === edgeB.run && edgeA.typeId === edgeB.typeId;
  const halves = same ? [[0, len, edgeA]] : [[0, mid, edgeA], [mid, len, edgeB]];
  const sMin = t.kind === 'stub' ? 4.5 : 1.0;
  const sMax = len - 1.0;
  for (const [h0, h1, e] of halves) {
    const type = e.type;
    const run = e.run;
    const lo = Math.max(h0, sMin);
    const hi = Math.min(h1, sMax);
    if (axis === 1) {
      planShaft(plan, t, life, h0, h1, e);
      continue;
    }
    const flat = type.h / 2 - type.r;
    for (const sl of axisSlots(path, axis, 40, 0.5, lo, hi)) {
      const side = u01(hash4(run.seed, sl.k, 0x5d1, axis)) < 0.5 ? -1 : 1;
      const yRel = type.vast ? type.h * 0.42 : flat >= 0.9 ? Math.min(Math.max(2.6, type.h * 0.3), Math.max(1.0, type.h - type.r - 0.8)) : Math.max(1.0, type.h / 2);
      life.push({
        sp: t.id, kind: 'mark', s: sl.s, side, yRel, dist: Math.abs(sl.u - (run.n0 + 0.5) * CELL_ARR[axis]), axis,
      });
    }
    const kit = OVERLAY[type.id];
    if (kit) {
      for (const sl of axisSlots(path, axis, 40, 1, Math.max(lo, 3), Math.min(hi, len - 3))) {
        const hsh = hash4(run.seed, sl.k, 0x7a1, axis);
        const what = pickWeighted(kit, u01(hsh));
        if (what === 'none') continue;
        const base = {
          sp: t.id, kind: what, s: sl.s, side: (hsh >>> 9) & 1 ? 1 : -1, axis, seed: hsh >>> 3,
        };
        if (what === 'gear') planGear(plan, t, life, base, type);
        else life.push(base);
      }
    }
    if (type.id === 'gallery' || type.id === 'nave') planColumns(plan, t, life, h0, h1, axis, type);
    if (type.id === 'nave') planSpans(plan, t, life, h0, h1, axis, e);
    if (type.id === 'gallery' || type.id === 'nave') {
      life.push({
        sp: t.id, kind: 'cove', s0: h0, s1: h1, axis, type: type.id,
      });
    }
    if (type.id === 'service' || type.id === 'trunk' || type.id === 'gallery' || type.id === 'nave') {
      life.push({
        sp: t.id, kind: 'rails', s0: h0, s1: h1, type: type.id,
      });
    }
    if (type.id !== 'duct' && type.id !== 'crawl' && type.id !== 'pipeway') {
      life.push({
        sp: t.id, kind: 'lane', s0: h0, s1: h1, type: type.id,
      });
    }
  }
}

// Note: plans lamps and life of every tube of a cell; life entries carry the space id of their tube.
export function planTubes(plan) {
  plan.life = [];
  for (const t of tubeList(plan)) {
    planLamps(plan, t);
    planLife(plan, t);
  }
}

// -- meshing --

// Note: right and up vectors of a wall-mounted item whose front faces n; up follows the world unless the wall is a floor or ceiling.
function frameOf(n, tangent) {
  const up = Math.abs(n[1]) > 0.8 ? tangent : UPW;
  const right = V.norm(V.cross(up, n));
  return { right, up: V.cross(n, right) };
}

// Note: wall point of a section in a world direction from its axis; n points into the tube, x and y are profile coordinates.
function wallAt(geo, sec, v) {
  const phi = Math.atan2(V.dot(v, sec.u), V.dot(v, sec.r));
  const hit = ringAtAngle(geo.secRing(sec, 0), geo.sh.N, phi);
  return {
    p: geo.at(sec, hit.x, hit.y), n: V.norm(geo.inward(sec, hit.nx, hit.ny)), x: hit.x, y: hit.y,
  };
}

// Note: a flat plate of half width d sags into a curved wall at its ends; this is the standoff that keeps them outside.
function sagInset(sec, wp, d) {
  const flat = Math.abs(wp.x) < sec.w / 2 - sec.rr - 1e-3 || Math.abs(wp.y) < sec.h / 2 - sec.rr - 1e-3;
  return flat ? 0 : Math.min((d * d) / (2 * sec.rr), d * 0.6);
}

// Note: world direction from the axis to a wall point at a given side and height above the floor.
function sideVec(sec, axis, side, yRel) {
  return ad(V.mul(lateralRef(axis), side * sec.w / 2), sec.u, yRel - sec.h / 2);
}

// Note: full-texture quad with the image upright; v grows downwards in the texture array.
function picture(b, c, right, up, w, h, n) {
  const p0 = ad(ad(c, right, -w / 2), up, -h / 2);
  const p1 = ad(ad(c, right, w / 2), up, -h / 2);
  const p2 = ad(ad(c, right, w / 2), up, h / 2);
  const p3 = ad(ad(c, right, -w / 2), up, h / 2);
  b.quad(p0, p1, p2, p3, n, [0, 1, 1, 1, 1, 0, 0, 0]);
}

function emitLamp(b, l) {
  const n = l.n;
  const T = l.axisT;
  const R = l.axisR;
  const { hl, hw } = l;
  const on = l.state !== 'dead';
  const c = ad(l.anchor, n, l.drop);
  if (l.drop > 0) {
    b.mat(L.PLATE_DARK, [0.3, 0.3, 0.33]);
    const wire = hw > 0.7 ? 0.06 : 0.025;
    for (const sg of [-1, 1]) b.cyl(ad(l.anchor, T, sg * hl * 0.75), ad(c, T, sg * hl * 0.75), wire, wire, 5);
  }
  b.mat(L.PLATE_DARK, [0.5, 0.5, 0.52]);
  b.obox(ad(c, n, 0.07), R, n, T, hw + 0.04, 0.07, hl + 0.06, l.drop > 0 ? '' : 'ny');
  const panel = ad(c, n, 0.145);
  if (on) b.mat(L.LIGHT_PANEL, [l.c[0], l.c[1], l.c[2]], 1.5, l.style);
  else b.mat(L.PLASTIC, [0.07, 0.07, 0.08], 0, 0);
  const p0 = ad(ad(panel, R, -hw), T, -hl);
  const p1 = ad(ad(panel, R, hw), T, -hl);
  const p2 = ad(ad(panel, R, hw), T, hl);
  const p3 = ad(ad(panel, R, -hw), T, hl);
  b.quad(p0, p1, p2, p3, n, [0, 0, 1, 0, 1, 1, 0, 1]);
}

// Note: distance and deck markers; a glowing plate on the wall with the sector code.
function emitMark(b, geo, f, plan, atlas) {
  const sec = geo.sec(f.s);
  const small = Math.min(sec.w, sec.h);
  let v;
  let lines;
  let size;
  if (f.vertical) {
    v = f.dir;
    lines = [plan.sector, 'DECK ' + f.deck];
    size = clamp(small * 0.055, 0.2, 2.4);
  } else {
    v = sideVec(sec, f.axis, f.side, f.yRel);
    lines = [plan.sector, pad4(f.dist) + ' M'];
    size = clamp(small * (small > 30 ? 0.04 : 0.05), 0.16, 1.8);
  }
  const wp = wallAt(geo, sec, v);
  const fr = frameOf(wp.n, sec.t);
  let width = Math.max(...lines.map((t) => t.length)) * size * 0.5 + size * 0.7;
  // Note: where the walls close in fast (funnels) a flat plate would cut into them, so it shrinks.
  const drift = Math.abs(geo.sec(f.s + 1).w - geo.sec(f.s - 1).w) / 4;
  if (drift > 0.01) {
    const k = clamp(0.3 / ((width / 2) * drift), 0.3, 1);
    size *= k;
    width *= k;
  }
  WALLITEMS.sign(b, {
    p: ad(wp.p, wp.n, sagInset(sec, wp, width / 2 + 0.05)), n: wp.n, up: fr.up, text: lines, size, color: plan.D.lamp, emis: 0.9, plate: [0.07, 0.07, 0.09], edge: [0.22, 0.22, 0.25],
  }, { atlas });
}

// Note: maintenance hatch with a status lamp, set into the side wall.
function emitHatch(b, geo, f) {
  const sec = geo.sec(f.s);
  const wp = wallAt(geo, sec, sideVec(sec, f.axis, f.side, 1.0));
  const fr = frameOf(wp.n, sec.t);
  const c = ad(wp.p, fr.up, 0.1);
  b.mat(L.PLATE_DARK, [0.42, 0.42, 0.45]);
  b.obox(ad(c, wp.n, 0.05), fr.right, fr.up, wp.n, 0.6, 1.15, 0.05, 'nz');
  b.mat(L.DOOR, [0.95, 0.93, 0.88]);
  picture(b, ad(c, wp.n, 0.103), fr.right, fr.up, 1.0, 2.1, wp.n);
  const k = f.seed % 5;
  b.mat(L.LAMP_WARM, k === 0 ? [1, 0.2, 0.1] : k === 1 ? [1, 0.7, 0.2] : [0.3, 1, 0.45], 1.8, k === 0 ? STYLE.BEACON : 0);
  b.disc(ad(ad(c, wp.n, 0.11), fr.up, 1.4), wp.n, fr.right, fr.up, 0.07, 8);
}

// Note: equipment cabinet with a blinking face on the floor against the wall.
function emitCab(b, geo, f) {
  const sec = geo.sec(f.s);
  const wp = wallAt(geo, sec, sideVec(sec, f.axis, f.side, 1.0));
  const fr = frameOf(wp.n, sec.t);
  const hh = 1.15;
  const c = ad(ad(wp.p, wp.n, 0.42), fr.up, hh - 1.0 + 0.02);
  b.mat(L.PLATE_DARK, [0.5, 0.52, 0.56]);
  b.obox(c, fr.right, fr.up, wp.n, 0.7, hh, 0.4, 'nz');
  b.mat(L.LED_RACK, [1, 1, 1], 1.1, f.seed % 7 === 0 ? STYLE.FLICKER : 0);
  picture(b, ad(ad(c, wp.n, 0.405), fr.up, -0.01), fr.right, fr.up, 1.24, 2.1, wp.n);
  b.mat(L.HAZARD, [1, 1, 1]);
  b.obox(ad(c, fr.up, -hh + 0.04), fr.right, fr.up, wp.n, 0.71, 0.04, 0.41, 'ny');
}

function emitJbox(b, geo, f) {
  const sec = geo.sec(f.s);
  const wp = wallAt(geo, sec, sideVec(sec, f.axis, f.side, Math.max(1.2, sec.h * 0.35)));
  const fr = frameOf(wp.n, sec.t);
  b.mat(L.PLATE_DARK, [0.4, 0.4, 0.44]);
  b.obox(ad(wp.p, wp.n, 0.12), fr.right, fr.up, wp.n, 0.28, 0.22, 0.12, 'nz');
  b.mat(L.METAL_BRIGHT, [0.8, 0.8, 0.8]);
  b.obox(ad(wp.p, wp.n, 0.25), fr.right, fr.up, wp.n, 0.2, 0.15, 0.015);
  b.mat(L.PIPE, [0.55, 0.55, 0.58]);
  b.cyl(ad(wp.p, fr.up, 0.2), ad(wp.p, fr.up, 1.4), 0.04, 0.04, 6);
}

const CRATE_TINTS = [[1, 1, 1], [0.82, 0.92, 0.78], [0.95, 0.82, 0.62], [0.72, 0.82, 0.96]];
const BARREL_TINTS = [[0.7, 0.28, 0.22], [0.55, 0.65, 0.75], [0.9, 0.55, 0.32], [0.78, 0.74, 0.7]];

// Note: crate stack, barrel cluster or generator on the floor of a big tube; matches the planned collision box; k scales it.
function emitGear(b, geo, f) {
  const sec = geo.sec(f.s);
  const base = ad(ad(sec.p, sec.r, f.x), sec.u, f.yf);
  const T = sec.t;
  const R = sec.r;
  const U = sec.u;
  const k = f.k || 1;
  if (f.variant === 0) {
    const cols = [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]];
    for (let q = 0; q < 4; q++) {
      b.mat(L.CRATE, CRATE_TINTS[(f.seed + q) % 4]);
      b.obox(ad(ad(ad(base, R, cols[q][0] * k), T, cols[q][1] * k), U, 0.6 * k), R, U, T, 0.6 * k, 0.6 * k, 0.6 * k);
    }
    b.mat(L.CRATE, CRATE_TINTS[(f.seed + 1) % 4]);
    b.obox(ad(base, U, 1.8 * k), R, U, T, 0.6 * k, 0.6 * k, 0.6 * k);
    return;
  }
  if (f.variant === 1) {
    const pos = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
    for (let q = 0; q < 4; q++) {
      b.mat(L.PIPE, BARREL_TINTS[(f.seed + q) % 4]);
      const o = ad(ad(base, R, pos[q][0] * k), T, pos[q][1] * k);
      b.cyl(o, ad(o, U, 1.1 * k), 0.42 * k, 0.42 * k, k > 1 ? 14 : 10, true);
    }
    return;
  }
  b.mat(L.PLATE_DARK, [0.45, 0.5, 0.55]);
  b.obox(ad(base, U, 0.9 * k), R, U, T, 0.75 * k, 0.9 * k, 0.45 * k);
  b.mat(L.LED_RACK, [1, 1, 1], 1.1, STYLE.SLOW);
  picture(b, ad(ad(base, U, 0.95 * k), T, 0.455 * k), R, U, 1.2 * k, 1.2 * k, T);
  b.mat(L.PIPE, [0.55, 0.55, 0.58]);
  b.cyl(ad(base, U, 1.8 * k), ad(base, U, 3.0 * k), 0.13 * k, 0.13 * k, 8);
}

function emitCol(b, geo, f) {
  const sec = geo.sec(f.s);
  const bot = ad(ad(sec.p, sec.r, f.x), sec.u, f.yf);
  const top = ad(ad(sec.p, sec.r, f.x), sec.u, f.yc);
  const rad = f.rad || 0.62;
  const k = rad / 0.62;
  b.mat(L.CONCRETE, [0.78, 0.76, 0.72]);
  b.cyl(ad(bot, sec.u, 0.5 * k), ad(top, sec.u, -0.5 * k), rad, rad, k > 1.5 ? 18 : 12);
  b.mat(L.PLATE_DARK, [0.55, 0.55, 0.58]);
  b.obox(ad(bot, sec.u, 0.25 * k), sec.r, sec.u, sec.t, 0.85 * k, 0.25 * k, 0.85 * k);
  b.obox(ad(top, sec.u, -0.25 * k), sec.r, sec.u, sec.t, 0.85 * k, 0.25 * k, 0.85 * k);
  b.mat(L.HAZARD, [1, 1, 1]);
  b.cyl(ad(bot, sec.u, 0.5 * k), ad(bot, sec.u, 1.9 * k), rad + 0.03 * k, rad + 0.03 * k, k > 1.5 ? 18 : 12);
}

// Note: two thin rails with sleepers along a floored tube.
function emitRails(b, geo, f, detail) {
  const len = geo.path.len;
  const t0 = clamp(f.s0, 0, len);
  const t1 = clamp(f.s1, 0, len);
  const gauge = f.type === 'service' ? 0.7 : f.type === 'nave' ? 2.2 : 1.1;
  const k = f.type === 'nave' ? 2.2 : 1;
  let prev = null;
  for (let s = t0 + 0.2; s <= t1 - 0.2 + 1e-3; s += 1.8) {
    const sec = geo.sec(s);
    const yf = edgeY(sec.w, sec.h, sec.rr, 0, -1);
    const cur = [-1, 1].map((side) => ad(ad(sec.p, sec.r, side * gauge), sec.u, yf + 0.1));
    if (prev) {
      b.mat(L.METAL_BRIGHT, [0.7, 0.7, 0.72]);
      for (let q = 0; q < 2; q++) {
        const d = V.norm(V.sub(cur[q], prev[q]));
        b.obox(V.mix3(prev[q], cur[q], 0.5), sec.r, sec.u, d, 0.05 * k, 0.07 * k, V.dist(prev[q], cur[q]) / 2 + 0.01, 'ny');
      }
    }
    if (detail >= 1) {
      b.mat(L.PLATE_DARK, [0.38, 0.34, 0.3]);
      b.obox(ad(sec.p, sec.u, yf + 0.04 * k), sec.r, sec.u, sec.t, gauge + 0.35 * k, 0.04 * k, 0.12 * k, 'ny');
    }
    prev = cur;
  }
}

// Note: painted lane lines along the flat floor; the hazard texture runs across the strip.
function emitLanes(b, geo, f) {
  const len = geo.path.len;
  const t0 = clamp(f.s0, 0, len);
  const t1 = clamp(f.s1, 0, len);
  const sec0 = geo.sec((t0 + t1) / 2);
  const flat = sec0.w / 2 - sec0.rr;
  const edge = Math.max(0.8, flat - 0.5);
  const xs = f.type === 'nave' ? [-17, -11.4, -5.8, 5.8, 11.4, 17] : f.type === 'gallery' ? [-11.4, -5.8, 5.8, 11.4] : [-edge, edge];
  const hw = f.type === 'nave' ? 0.22 : 0.13;
  b.mat(L.HAZARD, [1, 1, 1]);
  const tile = b.tile();
  for (const x of xs) {
    if (Math.abs(x) > flat) continue;
    let prev = null;
    for (let s = t0; s <= t1 + 1e-3; s += 3) {
      const ss = Math.min(s, t1);
      const sec = geo.sec(ss);
      const yf = edgeY(sec.w, sec.h, sec.rr, x, -1) + 0.012;
      const l = ad(ad(sec.p, sec.r, x - hw), sec.u, yf);
      const r = ad(ad(sec.p, sec.r, x + hw), sec.u, yf);
      if (prev) b.quad(prev.l, prev.r, r, l, sec.u, [0, prev.s / tile, 2 * hw / tile, prev.s / tile, 2 * hw / tile, ss / tile, 0, ss / tile]);
      prev = { l, r, s: ss };
    }
  }
}

// Note: ladder up the wall with a rung every half metre; side rails join every second rung.
function emitLadder(b, geo, f, detail) {
  const v = [Math.cos(f.ang), 0, Math.sin(f.ang)];
  const step = detail >= 1 ? 0.5 : 1.0;
  const every = detail >= 1 ? 2 : 1;
  let prev = null;
  let q = 0;
  for (let s = f.s0; s <= f.s1 + 1e-3; s += step, q++) {
    const sec = geo.sec(Math.min(s, f.s1));
    const wp = wallAt(geo, sec, v);
    const fr = frameOf(wp.n, sec.t);
    const c = ad(wp.p, wp.n, 0.3);
    b.mat(L.METAL_BRIGHT, [0.62, 0.62, 0.64]);
    b.obox(c, fr.right, UPW, wp.n, 0.28, 0.022, 0.022, 'nz');
    if (q % every) continue;
    const cur = [ad(c, fr.right, -0.28), ad(c, fr.right, 0.28)];
    if (prev) {
      b.mat(L.PLATE_DARK, [0.5, 0.5, 0.54]);
      for (let k = 0; k < 2; k++) {
        b.obox(V.mix3(prev[k], cur[k], 0.5), fr.right, wp.n, V.norm(V.sub(cur[k], prev[k])), 0.025, 0.025, V.dist(prev[k], cur[k]) / 2 + 0.01, 'ny');
      }
    }
    prev = cur;
  }
}

// Note: grating ring inside a shaft with a gap at the ladder; points are flattened to the platform height.
function emitPlatform(b, geo, f, detail) {
  const sec = geo.sec(f.s);
  const M = 20;
  const outer = [];
  const inner = [];
  for (let k = 0; k <= M; k++) {
    const a = (k / M) * TAU;
    const wp = wallAt(geo, sec, [Math.cos(a), 0, Math.sin(a)]);
    const o = [wp.p[0], sec.p[1], wp.p[2]];
    const radial = V.norm([o[0] - sec.p[0], 0, o[2] - sec.p[2]]);
    outer.push(o);
    inner.push(ad(o, radial, -f.ww));
  }
  const dz = 0.1;
  for (let k = 0; k < M; k++) {
    let d = Math.abs(((k + 0.5) / M) * TAU - f.ang) % TAU;
    if (d > Math.PI) d = TAU - d;
    if (d < 0.34) continue;
    const o0 = outer[k];
    const o1 = outer[k + 1];
    const i0 = inner[k];
    const i1 = inner[k + 1];
    b.mat(L.GRATING, [0.8, 0.8, 0.82]);
    b.quad(ad(i0, UPW, dz), ad(i1, UPW, dz), ad(o1, UPW, dz), ad(o0, UPW, dz), UPW);
    b.mat(L.PLATE_DARK, [0.45, 0.45, 0.48]);
    b.quad(ad(i1, UPW, -dz), ad(i0, UPW, -dz), ad(o0, UPW, -dz), ad(o1, UPW, -dz), [0, -1, 0]);
    const mid = V.mix3(i0, i1, 0.5);
    const inward = V.norm([sec.p[0] - mid[0], 0, sec.p[2] - mid[2]]);
    b.quad(ad(i0, UPW, -dz), ad(i1, UPW, -dz), ad(i1, UPW, dz), ad(i0, UPW, dz), inward);
    if (detail >= 1) {
      const tan = V.norm(V.sub(i1, i0));
      const half = V.dist(i0, i1) / 2;
      b.mat(L.PLATE_DARK, [0.5, 0.5, 0.54]);
      b.obox(ad(mid, UPW, 1.0), inward, UPW, tan, 0.03, 0.03, half);
      b.obox(ad(mid, UPW, 0.5), inward, UPW, tan, 0.02, 0.02, half);
      b.obox(ad(i0, UPW, 0.55), inward, UPW, tan, 0.03, 0.55, 0.03);
    }
  }
}

// Note: spiral catwalk with a top rail; one slab per 2.2 m of height, radius follows the wall.
function emitHelix(b, f, detail) {
  const n = f.rmid.length - 1;
  let prev = null;
  for (let y = f.y0; y <= f.y1 + 1e-3; y += 2.2) {
    const yy = Math.min(y, f.y1);
    const t = ((yy - f.y0) / (f.y1 - f.y0)) * n;
    const i0 = Math.min(n - 1, Math.floor(t));
    const rm = f.rmid[i0] + (f.rmid[i0 + 1] - f.rmid[i0]) * (t - i0);
    const th = f.th0 + (TAU * yy) / HELIX_PITCH;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const mk = (r, dy) => [f.cx + cs * r, yy + dy, f.cz + sn * r];
    const cur = {
      it: mk(rm - f.hw, f.ht), ot: mk(rm + f.hw, f.ht), ib: mk(rm - f.hw, -f.ht), ob: mk(rm + f.hw, -f.ht), dir: [cs, 0, sn],
    };
    if (prev) {
      b.mat(L.GRATING, [0.8, 0.8, 0.82]);
      b.quad(prev.it, cur.it, cur.ot, prev.ot, UPW);
      b.mat(L.PLATE_DARK, [0.45, 0.45, 0.48]);
      b.quad(cur.ib, prev.ib, prev.ob, cur.ob, [0, -1, 0]);
      const e = V.sub(cur.it, prev.it);
      const inward = V.norm([-(cur.dir[0] + prev.dir[0]), 0, -(cur.dir[2] + prev.dir[2])]);
      b.quad(prev.ib, cur.ib, cur.it, prev.it, inward);
      if (detail >= 1) {
        const mid = V.mix3(prev.it, cur.it, 0.5);
        const tdir = V.norm(e);
        const half = V.len(e) / 2 + 0.02;
        b.mat(L.PLATE_DARK, [0.5, 0.5, 0.54]);
        b.obox(ad(mid, UPW, 1.0), inward, UPW, tdir, 0.03, 0.03, half);
        b.obox(ad(mid, UPW, 0.5), inward, UPW, tdir, 0.02, 0.02, half);
        b.obox(ad(cur.it, UPW, 0.5), inward, UPW, tdir, 0.03, 0.5, 0.03);
      }
    }
    prev = cur;
  }
}

// Note: gantry from wall to wall; grating deck, two girders, rails with posts and a red lamp at each end.
function emitSpan(b, geo, f, detail) {
  const sec = geo.sec(f.s);
  const T = sec.t;
  const R = sec.r;
  const U = sec.u;
  const c = ad(sec.p, U, f.y);
  const hx = f.hx;
  b.mat(L.GRATING, [0.8, 0.8, 0.82]);
  b.obox(c, R, U, T, hx, 0.1, 1.6);
  b.mat(L.PLATE_DARK, [0.42, 0.42, 0.46]);
  for (const sg of [-1, 1]) {
    b.obox(ad(ad(c, T, sg * 1.5), U, -0.5), R, U, T, hx, 0.45, 0.12);
    b.obox(ad(ad(c, T, sg * 1.5), U, 1.1), R, U, T, hx, 0.03, 0.03);
    b.obox(ad(ad(c, T, sg * 1.5), U, 0.55), R, U, T, hx, 0.02, 0.02);
  }
  const step = detail >= 1 ? 3.5 : 7;
  for (let x = -hx + 0.6; x <= hx - 0.3; x += step) {
    for (const sg of [-1, 1]) b.obox(ad(ad(ad(c, R, x), T, sg * 1.5), U, 0.55), R, U, T, 0.03, 0.55, 0.03);
  }
  // Note: cross ties under the deck every 6 m keep the girders from looking like loose bars.
  for (let x = -hx + 3; x <= hx - 2; x += 6) b.obox(ad(ad(c, R, x), U, -0.35), R, U, T, 0.12, 0.12, 1.5);
  b.mat(L.LAMP_RED, [1, 1, 1], 1.6, STYLE.BEACON);
  for (const sg of [-1, 1]) {
    for (const dir of [1, -1]) b.disc(ad(ad(ad(c, R, sg * (hx - 0.5)), U, 1.25), T, dir * 0.06), V.mul(T, dir), R, U, 0.14, 8);
  }
}

// Note: dashes of glow along the floor edge of a vast tube; dashes sit at world slots so cells agree.
function emitCove(b, geo, f, plan) {
  const { path } = geo;
  const { n, P } = path;
  const a0 = P[f.axis];
  const a1 = P[(n - 1) * 3 + f.axis];
  const lo = Math.min(a0, a1);
  const hi = Math.max(a0, a1);
  const sMin = Math.min(f.s0, f.s1);
  const sMax = Math.max(f.s0, f.s1);
  b.mat(L.GLOW_WHITE, [plan.D.lamp[0] * 0.9, plan.D.lamp[1] * 0.9, plan.D.lamp[2] * 0.9], 1.1, STYLE.STATIC);
  for (let k = Math.floor((lo - 8) / 12); k * 12 <= hi; k++) {
    const sa = sOfCoord(path, f.axis, clamp(k * 12, lo, hi));
    const sb = sOfCoord(path, f.axis, clamp(k * 12 + 8, lo, hi));
    const s0 = clamp(Math.min(sa, sb), sMin, sMax);
    const s1 = clamp(Math.max(sa, sb), sMin, sMax);
    if (s1 - s0 < 0.4) continue;
    for (const side of [-1, 1]) {
      let prev = null;
      for (let s = s0; s <= s1 + 1e-3; s += 2) {
        const sec = geo.sec(Math.min(s, s1));
        const wp = wallAt(geo, sec, sideVec(sec, f.axis, side, 1.2));
        const up = frameOf(wp.n, sec.t).up;
        const m = ad(wp.p, wp.n, 0.06);
        const cur = [ad(m, up, -0.22), ad(m, up, 0.22)];
        if (prev) b.quad(prev[0], cur[0], cur[1], prev[1], wp.n, [0, 0, 1, 0, 1, 1, 0, 1]);
        prev = cur;
      }
    }
  }
}

// Note: bulkhead ring with hazard faces plus a hanging plate that names the section or the district ahead.
function emitGate(b, geo, f, plan, atlas) {
  const len = geo.path.len;
  const s0 = f.atStart ? 0 : len - GATE_W;
  const s1 = f.atStart ? GATE_W : len;
  const sm = (s0 + s1) / 2;
  const sec = geo.sec(sm);
  const small = Math.min(sec.w, sec.h);
  const depth = clamp(small * 0.09, 0.45, 1.8);
  const tint = [0.9, 0.9, 0.92];
  emitRib(b, geo, s0, s1, depth, { layer: L.PLATE_DARK, tint }, { layer: L.HAZARD, tint });
  if (sec.h < 6) return;
  const size = clamp(small * 0.045, 0.3, small > 30 ? 2 : 0.9);
  const names = f.change ? [DISTRICTS[f.dHi].name, DISTRICTS[f.dLo].name] : null;
  const gate = 'G-' + (100 + (f.tag % 900));
  const lines = f.change ? [['ENTERING', names[0]], ['ENTERING', names[1]]] : [['SECTION GATE', gate], ['SECTION GATE', gate]];
  const plateH = 2 * size * 1.3 + size * 0.35;
  const top = ad(sec.p, sec.u, edgeY(sec.w, sec.h, sec.rr, 0, 1) - depth - 0.4);
  const c = ad(top, sec.u, -plateH / 2);
  b.mat(L.PLATE_DARK, [0.3, 0.3, 0.33]);
  const rod = size * 1.5;
  for (const sg of [-1, 1]) {
    const foot = ad(top, sec.r, sg * rod);
    b.cyl(foot, ad(foot, sec.u, 0.45), 0.03, 0.03, 5);
  }
  // Note: the plate that faces a traveller about to cross the face shows the district across it.
  const towardHi = V.mul(sec.t, f.atStart ? 1 : -1);
  const dirs = [towardHi, V.mul(towardHi, -1)];
  for (let k = 0; k < 2; k++) {
    WALLITEMS.sign(b, {
      p: ad(c, dirs[k], 0.03), n: dirs[k], up: sec.u, text: lines[k], size, color: f.change ? [1, 0.75, 0.3] : plan.D.lamp, emis: 1.2,
    }, { atlas });
  }
}

// Note: meshes lamps and planned life of one tube; t is the tube descriptor, geo its TubeGeo.
export function emitLife(b, plan, t, geo, atlas, detail) {
  for (const l of plan.lights) if (l.sp === t.id && l.kind === 'strip') emitLamp(b, l);
  for (const f of plan.life) {
    if (f.sp !== t.id) continue;
    switch (f.kind) {
      case 'mark': emitMark(b, geo, f, plan, atlas); break;
      case 'hatch': if (detail >= 1) emitHatch(b, geo, f); break;
      case 'cab': emitCab(b, geo, f); break;
      case 'jbox': if (detail >= 1) emitJbox(b, geo, f); break;
      case 'gear': emitGear(b, geo, f); break;
      case 'col': emitCol(b, geo, f); break;
      case 'span': emitSpan(b, geo, f, detail); break;
      case 'cove': emitCove(b, geo, f, plan); break;
      case 'rails': emitRails(b, geo, f, detail); break;
      case 'lane': emitLanes(b, geo, f); break;
      case 'ladder': emitLadder(b, geo, f, detail); break;
      case 'plat': emitPlatform(b, geo, f, detail); break;
      case 'helix': emitHelix(b, f, detail); break;
      case 'gate': emitGate(b, geo, f, plan, atlas); break;
      default: break;
    }
  }
}
