// Note: tunnel meshes; sweeps a rounded-rectangle ring along a path and adds ribs, pipes, cables and the planned life.

import { L } from './config.js';
import {
  hash4, u01, Rand, pfbm2, clamp,
} from './rand.js';
import * as V from './path.js';
import {
  TubeGeo, ringAtAngle, emitRib, axisSlots, crossDir,
} from './tubegeo.js';
import { emitLife } from './tubelife.js';

// Note: ring resolution per tube class; big round tubes need more corner segments to look round.
const kOf = (type) => (type.r >= 12 ? 10 : type.r >= 1.4 ? 4 : 2);

// Note: decoration stations measured from the shared face(s) so both cells agree on the spacing; used by bent tubes.
function stationsFromEnds(len, spacing, from, minS, maxS) {
  const out = [];
  if (from === 'end' || from === 'both') {
    for (let k = 0; ; k++) {
      const s = len - spacing * (k + 0.5);
      if (s < minS) break;
      if (s <= maxS) out.push(s);
    }
  }
  if (from === 'start' || from === 'both') {
    for (let k = 0; ; k++) {
      const s = spacing * (k + 0.5);
      if (s > len - minS) break;
      if (s >= minS) out.push(s);
    }
  }
  out.sort((a, b) => a - b);
  const merged = [];
  for (const s of out) {
    if (!merged.length || s - merged[merged.length - 1] > spacing * 0.7) merged.push(s);
  }
  return merged;
}

// Note: wall layers and tints depend on the run seed, so a whole run keeps its look from one cell to the next.
function pickLayers(plan, edge) {
  const D = plan.D;
  const h = hash4(edge.run.seed, 11, 3, 7);
  const tints = [D.tintA, D.tintB, D.tintC];
  const ti = (h >>> 9) % 3;
  return {
    wall: L[D.wall[h % 3]],
    ceil: L[D.wall[(h >>> 4) % 3]],
    floor: L[D.floor],
    tint: tints[ti],
    tint2: tints[(ti + 1) % 3],
  };
}

const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Note: emits the shell of a tube as band runs; uv u follows ring length, v follows the along coordinate.
function emitShell(b, geo, plan, segs, noise, along) {
  const path = geo.path;
  const N = geo.sh.N;
  for (const seg of segs) {
    const style = pickLayers(plan, seg.edge);
    for (const run of geo.runs) {
      const layer = run.band === 0 ? style.floor : run.band === 2 ? style.ceil : style.wall;
      b.mat(layer, [1, 1, 1]);
      const tile = b.tile();
      const rows = [];
      const cnt = run.count + 1;
      const tn = run.band === 0 ? style.tint2 : style.tint;
      for (let i = seg.i0; i <= seg.i1; i++) {
        const ring = geo.rings[i];
        const o = i * 3;
        const P = path.P;
        const R = path.R;
        const U = path.U;
        const row = [];
        const a = along(i);
        let cum = 0;
        for (let m = 0; m < cnt; m++) {
          const j = (run.start + m) % N;
          if (m > 0) {
            const jp = (run.start + m - 1) % N;
            cum += Math.hypot(ring.x[j] - ring.x[jp], ring.y[j] - ring.y[jp]);
          }
          const x = ring.x[j];
          const y = ring.y[j];
          const nxp = ring.nx[j];
          const nyp = ring.ny[j];
          const px = P[o] + R[o] * x + U[o] * y;
          const py = P[o + 1] + R[o + 1] * x + U[o + 1] * y;
          const pz = P[o + 2] + R[o + 2] * x + U[o + 2] * y;
          const nX = -(R[o] * nxp + U[o] * nyp);
          const nY = -(R[o + 1] * nxp + U[o + 1] * nyp);
          const nZ = -(R[o + 2] * nxp + U[o + 2] * nyp);
          // Note: grime noise darkens the tint along the tube so panels do not look uniform.
          const g = 0.72 + 0.5 * pfbm2(noise, a * 0.11 + m * 0.37, j * 0.9, 64, 2);
          b.tint = [tn[0] * g, tn[1] * g, tn[2] * g];
          row.push(b.v(px, py, pz, nX, nY, nZ, cum / tile, a / tile));
        }
        rows.push(row);
      }
      for (let i = 0; i < rows.length - 1; i++) {
        for (let m = 0; m < cnt - 1; m++) {
          b.quadIdx(rows[i][m], rows[i][m + 1], rows[i + 1][m + 1], rows[i + 1][m], b.nrmOf(rows[i][m]));
        }
      }
    }
  }
  b.tint = [1, 1, 1];
}

// Note: ring angle of a world cross-section direction at path sample i.
function phiAt(path, i, v) {
  const o = i * 3;
  const y = v[0] * path.U[o] + v[1] * path.U[o + 1] + v[2] * path.U[o + 2];
  const x = v[0] * path.R[o] + v[1] * path.R[o + 1] + v[2] * path.R[o + 2];
  return Math.atan2(y, x);
}

// Note: pipe swept along the path in a world direction from the axis, offset inward from the wall.
function emitPipe(b, geo, dir, rad, layer, tint, sFrom, sTo, segs = 7) {
  const path = geo.path;
  const N = geo.sh.N;
  b.mat(layer, tint);
  const tile = b.tile();
  const samples = [];
  for (let i = 0; i < path.n; i++) {
    if (path.S[i] >= sFrom - 1e-3 && path.S[i] <= sTo + 1e-3) samples.push(i);
  }
  if (samples.length < 2) return;
  const rows = [];
  for (const i of samples) {
    const hit = ringAtAngle(geo.rings[i], N, phiAt(path, i, dir));
    const o = i * 3;
    const R = [path.R[o], path.R[o + 1], path.R[o + 2]];
    const U = [path.U[o], path.U[o + 1], path.U[o + 2]];
    const T = [path.T[o], path.T[o + 1], path.T[o + 2]];
    const inw = [-(R[0] * hit.nx + U[0] * hit.ny), -(R[1] * hit.nx + U[1] * hit.ny), -(R[2] * hit.nx + U[2] * hit.ny)];
    const off = rad + 0.04;
    const c = [
      path.P[o] + R[0] * hit.x + U[0] * hit.y + inw[0] * off,
      path.P[o + 1] + R[1] * hit.x + U[1] * hit.y + inw[1] * off,
      path.P[o + 2] + R[2] * hit.x + U[2] * hit.y + inw[2] * off,
    ];
    const e1 = V.norm(V.sub(inw, V.mul(T, V.dot(inw, T))));
    const e2 = V.cross(T, e1);
    const row = [];
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const d = [e1[0] * ca + e2[0] * sa, e1[1] * ca + e2[1] * sa, e1[2] * ca + e2[2] * sa];
      row.push(b.v(c[0] + d[0] * rad, c[1] + d[1] * rad, c[2] + d[2] * rad, d[0], d[1], d[2], (k / segs) * ((Math.PI * 2 * rad) / tile), path.S[i] / tile));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < segs; k++) b.quadIdx(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k], b.nrmOf(rows[i][k]));
  }
}

// Note: flat cable ribbon pressed against the wall, optionally drooping between clamp stations.
function emitCable(b, geo, dir, width, tint, stations, droop, sFrom, sTo) {
  const path = geo.path;
  const N = geo.sh.N;
  b.mat(L.CABLES, tint);
  const tile = b.tile();
  const rows = [];
  for (let i = 0; i < path.n; i++) {
    const s = path.S[i];
    if (s < sFrom - 1e-3 || s > sTo + 1e-3) continue;
    const hit = ringAtAngle(geo.rings[i], N, phiAt(path, i, dir));
    const o = i * 3;
    const R = [path.R[o], path.R[o + 1], path.R[o + 2]];
    const U = [path.U[o], path.U[o + 1], path.U[o + 2]];
    const T = [path.T[o], path.T[o + 1], path.T[o + 2]];
    const inw = [-(R[0] * hit.nx + U[0] * hit.ny), -(R[1] * hit.nx + U[1] * hit.ny), -(R[2] * hit.nx + U[2] * hit.ny)];
    const side = V.cross(T, inw);
    let off = 0.02;
    if (droop && stations.length > 1) {
      let k = 0;
      while (k < stations.length - 2 && stations[k + 1] < s) k++;
      const a = stations[k];
      const c2 = stations[k + 1];
      off += droop * Math.sin(Math.PI * clamp((s - a) / (c2 - a), 0, 1));
    }
    const c = [
      path.P[o] + R[0] * hit.x + U[0] * hit.y + inw[0] * off,
      path.P[o + 1] + R[1] * hit.x + U[1] * hit.y + inw[1] * off,
      path.P[o + 2] + R[2] * hit.x + U[2] * hit.y + inw[2] * off,
    ];
    const l = V.madd(c, side, -width / 2);
    const r = V.madd(c, side, width / 2);
    rows.push([
      b.v(l[0], l[1], l[2], inw[0], inw[1], inw[2], 0, s / tile),
      b.v(r[0], r[1], r[2], inw[0], inw[1], inw[2], width / tile, s / tile),
    ]);
  }
  for (let i = 0; i < rows.length - 1; i++) b.quadIdx(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0], b.nrmOf(rows[i][0]));
}

// Note: pipe angles are world angles in the cross-section; the same run always gets the same set.
const PIPE_SLOTS_H = [-35, -10, 15, 40, 65, 115, 140, 165, 190, 215];
const PIPE_SLOTS_V = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

function pipeSpecs(edge) {
  const rr = new Rand(edge.run.seed ^ 0x91e5);
  const type = edge.type;
  const slots = edge.axis === 1 ? PIPE_SLOTS_V : PIPE_SLOTS_H;
  const out = [];
  const used = new Set();
  const small = type.w < 4;
  for (let k = 0; k < type.pipes; k++) {
    let si = rr.int(0, slots.length - 1);
    for (let tries = 0; used.has(si) && tries < 10; tries++) si = (si + 1) % slots.length;
    used.add(si);
    out.push({
      a: (slots[si] * Math.PI) / 180,
      rad: small ? rr.range(0.05, 0.12) : type.vast ? rr.range(0.35, type.hoop ? 1.5 : 1.1) : rr.range(0.08, type.w > 12 ? 0.45 : 0.24),
      kind: rr.int(0, 3),
    });
  }
  return out;
}

const PIPE_TINTS = [
  [0.78, 0.74, 0.7], [0.9, 0.55, 0.32], [0.55, 0.65, 0.75], [0.7, 0.28, 0.22],
];
const CABLE_ANGLES = [-60, 20, 160, 235];

// Note: builds one tube (stub or through) into the builder; bake must already be set by the caller.
export function buildTube(b, plan, tube, atlas, detail = 1) {
  const { path, edgeA, edgeB } = tube;
  const len = path.len;
  const aligned = edgeA.axis === edgeB.axis;
  const axis = aligned ? edgeA.axis : -1;
  const geo = new TubeGeo(path, tube, Math.max(kOf(edgeA.type), kOf(edgeB.type)), edgeA.axis !== 1 && edgeB.axis !== 1);
  const same = edgeA === edgeB || (edgeA.run === edgeB.run && edgeA.typeId === edgeB.typeId);
  const midI = (path.n - 1) >> 1;
  const midS = path.S[midI];
  const halves = same
    ? [{ s0: 0, s1: len, i0: 0, i1: path.n - 1, edge: edgeA }]
    : [{ s0: 0, s1: midS, i0: 0, i1: midI, edge: edgeA }, { s0: midS, s1: len, i0: midI, i1: path.n - 1, edge: edgeB }];
  // Note: tubes along one axis use world coordinates for texture phase and grime, so cells join without seams.
  const along = aligned ? (i) => path.P[i * 3 + axis] : (i) => path.S[i];
  const noise = aligned ? edgeA.run.seed : hash4(plan.seed, tube.id.charCodeAt(0), tube.f ?? 9, 5);
  emitShell(b, geo, plan, halves, noise, along);
  const gateAt = plan.life.filter((f) => f.sp === tube.id && f.kind === 'gate').map((f) => f.atStart);
  const stub = tube.kind === 'stub';
  const loEnd = gateAt.includes(true) ? 2.0 : stub ? 3.2 : 1.0;
  const hiEnd = gateAt.includes(false) ? 2.0 : 1.0;
  for (const h of halves) {
    const type = h.edge.type;
    const style = pickLayers(plan, h.edge);
    const ribW = type.vast && type.hoop ? 1.0 : type.vast ? 1.6 : type.w > 12 ? 0.9 : 0.34;
    const lo = Math.max(h.s0, loEnd);
    const hi = Math.min(h.s1, len - hiEnd);
    const stations = aligned
      ? axisSlots(path, axis, type.rib, 0.5, lo, hi).map((q) => q.s)
      : stationsFromEnds(len, type.rib, tube.kind === 'through' ? 'both' : 'end', 3.2, len - 0.2).filter((s) => s >= lo && s < hi);
    const ribTint = scale3(style.tint2, 0.9);
    const sideFace = { layer: L.PLATE_DARK, tint: scale3(style.tint2, 0.85) };
    for (const s of stations) {
      const hoop = !!type.hoop;
      const col = u01(hash4(h.edge.run.seed, Math.round(s * 10), 2, 3)) < 0.25 ? L.BEAM : L.PLATE_DARK;
      // Note: vast hoops glow dimmer and some rings are dead, so the wall has a worn rhythm.
      const hu = u01(hash4(h.edge.run.seed, Math.round(s * 10), 6, 1));
      const lit = hoop && !(type.vast && hu < 0.25);
      const face = lit ? { layer: L.LIGHT_PANEL, tint: plan.D.lamp, emis: type.vast ? 0.4 + 0.45 * hu : 1.1 } : { layer: col, tint: ribTint };
      emitRib(b, geo, s - ribW / 2, s + ribW / 2, type.ribD, face, hoop ? sideFace : face);
    }
    if (detail < 1 || !aligned) continue;
    for (const sp of pipeSpecs(h.edge)) {
      emitPipe(b, geo, crossDir(axis, sp.a), sp.rad, L.PIPE, scale3(PIPE_TINTS[sp.kind], 0.8), Math.max(h.s0, stub ? 1.0 : 0), Math.min(h.s1, len), sp.rad > 0.2 ? 9 : 7);
    }
    if (type.w >= 4) {
      const rrc = new Rand(h.edge.run.seed ^ 0xca81);
      for (let c = 0; c < 2; c++) {
        const a = ((rrc.pick(CABLE_ANGLES) + rrc.range(-6, 6)) * Math.PI) / 180;
        emitCable(b, geo, crossDir(axis, a), type.vast ? 0.9 : 0.3, [0.55, 0.52, 0.5], stations, type.vast ? 0.6 : 0.18, Math.max(h.s0, stub ? 1.0 : 0), Math.min(h.s1, len));
      }
    }
  }
  emitLife(b, plan, tube, geo, atlas, detail);
}
