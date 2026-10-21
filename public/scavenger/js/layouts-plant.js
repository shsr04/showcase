// Note: layouts of plant rooms: substation, pumphouse, relay and pressure lock.

import { L, STYLE } from './config.js';
import { PAL, itemHalf } from './props.js';
import './props-plant.js';
import {
  COL, lampGrid, corner, longFrame, hazardFrame,
} from './layhelp.js';

const SIDES = [0, 1, 4, 5];

const TRAFO_TINTS = [[0.46, 0.55, 0.5], [0.5, 0.52, 0.58], [0.55, 0.5, 0.45], [0.42, 0.5, 0.56]];
const SWG_TINTS = [[0.52, 0.58, 0.56], [0.5, 0.55, 0.62], [0.58, 0.56, 0.5]];
const PORCELAIN = [0.62, 0.42, 0.28];

function wallMid(R, f) {
  const [a, b] = R.wallSpan(f);
  return (a + b) / 2;
}

// Note: rows of transformers under three-phase busbars and floodlit gantries, switchgear along both walls.
function substation(R) {
  const F = longFrame(R);
  const { hu, hv } = F;
  R.lanes(R.cx, R.cz, 2.4);
  const rowU = Math.min(hu * 0.56, hu - 5.2);
  const yb = Math.min(R.height - 3.6, 8.6);
  const step = 9.4;
  const count = Math.max(2, Math.floor((2 * hv - 11) / step) + 1);
  const bars = [-1.1, 0, 1.1];
  const trafos = [];
  let n = 0;
  for (const s of [-1, 1]) {
    for (let k = 0; k < count; k++) {
      const v = (k - (count - 1) / 2) * step;
      n++;
      if (R.chance(0.1)) continue;
      const it = R.put('transformer', F.x(s * rowU, v), F.z(s * rowU, v), F.yawU(-s), {
        gap: 1.6, name: `T-${n}`, tint: R.pick(TRAFO_TINTS),
      });
      if (it) trafos.push(it);
    }
  }
  for (const it of trafos) {
    const hh = itemHalf(it);
    hazardFrame(R, it.p[0], it.p[2], hh[0] + 0.3, hh[2] + 0.3, 0.4);
    for (const z of bars) {
      const bp = R.at(it, 0.7, 5.55, z);
      R.pipe(bp, [bp[0], R.y0 + yb, bp[2]], 0.05, { tint: PAL.steel[1], n: 6 });
    }
  }
  // Note: three phases per row run the length of the hall at the same height.
  const half = hv - 1.6;
  for (const s of [-1, 1]) {
    for (const d of bars) {
      const u = s * rowU + d;
      const c = [F.x(u, 0), R.y0 + yb, F.z(u, 0)];
      const hs = F.alongZ ? [0.12, 0.12, half] : [half, 0.12, 0.12];
      if (!R.boxClear(c, hs, 0)) continue;
      R.pipe([F.x(u, -half), c[1], F.z(u, -half)], [F.x(u, half), c[1], F.z(u, half)], 0.1, { tint: PAL.steel[s > 0 ? 1 : 0], every: 5 });
    }
  }
  // Note: gantries between transformer bays carry the busbar insulators and the flood lamps.
  let floods = 0;
  for (let k = 0; k < count - 1; k += 2) {
    const v = (k - (count - 1) / 2 + 0.5) * step;
    const a = [F.x(-hu + 0.2, v), yb + 0.7, F.z(-hu + 0.2, v)];
    const b = [F.x(hu - 0.2, v), yb + 0.7, F.z(hu - 0.2, v)];
    if (!R.beam(a, b, F.alongZ ? [0, 0.3, 0.3] : [0.3, 0.3, 0])) continue;
    for (const s of [-1, 1]) {
      for (const d of bars) {
        const u = s * rowU + d;
        const x = F.x(u, v);
        const z = F.z(u, v);
        R.pipe([x, R.y0 + yb + 0.4, z], [x, R.y0 + yb + 0.08, z], 0.09, { tint: PORCELAIN, n: 8 });
      }
    }
    for (const u of [-hu * 0.5, 0, hu * 0.5]) {
      R.flood(F.x(u, v), F.z(u, v), yb + 0.4, { c: floods % 4 === 3 ? COL.cold : COL.amber, i: 2.5, r: 30, failMul: 1.2 });
      floods++;
    }
  }
  lampGrid(R, { y: yb - 1.0, spacing: 16, i: 1.3, r: 24, c: COL.cold, failMul: 1.6 });
  // Note: switchgear stands shoulder to shoulder along both long walls with the odd gap.
  for (const s of [-1, 1]) {
    const f = F.wallU(s);
    const [t0, t1] = R.wallSpan(f);
    for (let t = t0 + 2.6; t < t1 - 2.6; t += 1.3) {
      if (R.chance(0.12)) {
        t += 1.3;
        continue;
      }
      R.onWall(f, 'switchgear', t, { gap: 0, tint: R.pick(SWG_TINTS) });
    }
  }
  const kioskWall = F.wallV(1);
  const warnWall = F.wallV(-1);
  const desk = R.fitWall(kioskWall, 'console', { s: [3.0, 1.9, 1.1], gap: 1.2, color: COL.amber });
  if (desk) {
    R.poi('telemetry', R.at(desk, 0, 1.4, -0.2), R.front(desk), {});
    R.emitter('relay', R.at(desk, 0, 1.2, 0), { r: 14 });
  }
  R.sign(kioskWall, wallMid(R, kioskWall), Math.min(R.height - 2.4, 7), ['SUBSTATION', R.plan.sector], {
    size: 0.9, color: COL.amber, emis: 1.4, margin: 0.2,
  });
  R.sign(warnWall, wallMid(R, warnWall), Math.min(R.height - 2.4, 6), ['HIGH VOLTAGE', 'KEEP CLEAR'], {
    size: 0.8, color: COL.red, emis: 1.4, margin: 0.2,
  });
  for (const k of [-5, 5]) R.poster(warnWall, wallMid(R, warnWall) + k, 2.4, L.WARN_SIGNS, 1.6, 1.6, {});
  if (trafos.length) {
    const it = R.pick(trafos);
    R.poi('plaque', R.at(it, 0, 3.1, 1.6), R.front(it), { r: 7 });
    const arc = R.pick(trafos);
    const ap = R.at(arc, 0.7, 5.8, 0);
    R.glow(ap, { c: [0.6, 0.8, 1.0], i: 1.5, r: 16, style: STYLE.SPARK });
    R.emitter('buzz', ap, { r: 16, i: 0.7 });
    for (const t of trafos.slice(0, 2)) {
      const bp = R.at(t, -0.85, 5.1, 0);
      R.beacon(bp[0], 5.1, bp[2], { r: 14 });
    }
  }
  for (const s of [-1, 1]) R.emitter('transformer', [F.x(s * rowU, 0), R.y0 + 3, F.z(s * rowU, 0)], { r: 42 });
}

// Note: bunded storage tanks under a manifold of overhead pipes; duty pumps along the walls feed a header.
function pumphouse(R) {
  R.lanes(R.cx, R.cz, 2.3);
  const th = Math.min(R.height - 3.2, 11);
  const rad = 3.0;
  const gx = Math.min(R.hx * 0.38, 7.5);
  const gz = Math.min(R.hz * 0.38, 7.5);
  const tanks = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    if (R.chance(0.15)) continue;
    const it = R.put('tank', R.cx + sx * gx, R.cz + sz * gz, 0, {
      s: [rad * 2, th, rad * 2], gap: 2, tint: R.pick([[0.82, 0.84, 0.88], [0.7, 0.78, 0.74], [0.85, 0.8, 0.7]]),
    });
    if (it) {
      tanks.push(it);
      R.decal(it.p[0], it.p[2], rad + 0.9, rad + 0.9, L.WATER, { tint: [0.5, 0.7, 0.8], emis: 0.1 });
    }
  }
  const ty = R.y0 + th + 0.6;
  for (let i = 0; i < tanks.length; i++) {
    for (let j = i + 1; j < tanks.length; j++) {
      const a = tanks[i].p;
      const b = tanks[j].p;
      if (Math.abs(a[0] - b[0]) > 0.1 && Math.abs(a[2] - b[2]) > 0.1) continue;
      const c = [(a[0] + b[0]) / 2, ty, (a[2] + b[2]) / 2];
      if (R.boxClear(c, [Math.abs(a[0] - b[0]) / 2 + 0.3, 0.3, Math.abs(a[2] - b[2]) / 2 + 0.3], 0)) {
        R.pipe([a[0], ty, a[2]], [b[0], ty, b[2]], 0.28, { tint: PAL.steel[0] });
      }
    }
  }
  const yh = R.y0 + Math.min(R.height - 2.8, 5.4);
  for (const f of R.bareWalls().slice(0, 2)) {
    const [t0, t1] = R.wallSpan(f);
    const pumps = [];
    for (let t = t0 + 4; t < t1 - 4 && pumps.length < 5; t += 5.2) {
      const it = R.onWall(f, 'pump', t, { gap: 0.6, tint: R.pick([PAL.steel[2], PAL.steel[0], [0.45, 0.6, 0.55]]) });
      if (it) pumps.push(it);
    }
    if (pumps.length < 2) continue;
    const a = R.at(pumps[0], 0.95, 0, 0);
    const b = R.at(pumps[pumps.length - 1], 0.95, 0, 0);
    R.pipe([a[0], yh, a[2]], [b[0], yh, b[2]], 0.3, { tint: PAL.steel[1] });
    for (const p of pumps) {
      const q = R.at(p, 0.95, 1.9, 0);
      R.pipe(q, [q[0], yh, q[2]], 0.18, { tint: PAL.steel[1] });
    }
    R.emitter('pump', R.at(pumps[Math.floor(pumps.length / 2)], 0, 1, 0), { r: 30 });
  }
  for (let i = 0; i < 4; i++) {
    if (R.chance(0.5)) corner(R, i, 'manifold', { s: [2.4, R.height - 0.2, 2.4], pal: i, gap: 1.2 });
  }
  lampGrid(R, {
    y: Math.min(R.height - 2.4, 6.4), spacing: 10, i: 2.0, r: 22, c: [0.7, 0.95, 0.85], failMul: 1.2,
  });
  for (const f of SIDES) {
    const mid = wallMid(R, f);
    R.poster(f, mid + R.range(-4, 4), 2.8, L.METER, 1.5, 1.5, { emis: 0.4, margin: 0.4 });
  }
  const board = R.bareWalls()[0] ?? R.pick(SIDES);
  R.sign(board, wallMid(R, board), Math.min(R.height - 2.6, 7.4), ['PUMPHOUSE', R.plan.sector], {
    size: 0.9, color: [0.5, 0.95, 0.85], emis: 1.4, margin: 0.2,
  });
  const c = R.fitWall(R.pick(SIDES), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.cyan });
  if (c) R.poi('telemetry', R.at(c, 0, 1.4, -0.2), R.front(c), {});
  R.emitter('water', [R.cx + R.range(-3, 3), R.y0 + 1.2, R.cz + R.range(-3, 3)], { r: 26 });
  R.emitter('steam', [R.cx + R.range(-6, 6), R.y0 + 1.5, R.cz + R.range(-6, 6)], { r: 16 });
  R.emitter('drip', [R.cx + R.range(-6, 6), R.y1 - 1, R.cz + R.range(-6, 6)], { r: 16 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 28 });
}

// Note: a lattice mast through the middle of the room, rows of racks either side and a lone operator desk.
function relay(R) {
  R.lanes(R.cx, R.cz, 2.0);
  const mh = R.height - 0.3;
  const spot = R.centre(1.0, 1.0, mh, 1.0) || [R.cx, R.cz];
  const [mx, mz] = spot;
  R.put('mast', mx, mz, 0, { s: [1.6, mh, 1.6], force: true, gap: 0 });
  R.glow([mx, R.y0 + mh - 0.1, mz], { c: COL.red, i: 1.4, r: 18, style: STYLE.BEACON });
  R.glow([mx, R.y0 + 3, mz + 1.2], { c: COL.cyan, i: 1.2, r: 14, style: STYLE.BREATH });
  const rowZ = Math.min(R.hz - 3, 5.6);
  const nRack = Math.max(4, Math.floor(2 * (R.hx - 4)));
  for (const s of [-1, 1]) {
    R.run('rack', R.x0 + 4, R.cz + s * rowZ, R.x1 - 4, R.cz + s * rowZ, nRack, s > 0 ? 2 : 0, (i) => ({
      s: [0.85, 2.2, 0.9], gap: 0.05, style: i % 5 === 3 ? STYLE.SLOW : STYLE.STATIC,
    }));
    R.slab([R.cx, 3.1, R.cz + s * rowZ], [R.hx - 3.6, 0.07, 0.4], L.CABLES, [0.6, 0.6, 0.65]);
  }
  for (const k of [-0.55, 0, 0.55]) {
    R.panel(R.cx + k * R.hx, R.cz, { c: [0.6, 0.8, 1.0], i: 1.5, r: 18, failMul: 1.4 });
  }
  lampGrid(R, { y: Math.min(R.height - 2.4, 6), spacing: 11, i: 1.6, r: 18, c: [0.6, 0.78, 1.0], failMul: 1.5 });
  const desk = R.fitWall(R.pick(SIDES), 'desk', { crt: true, lamp: COL.green, papers: true, gap: 1 });
  if (desk) {
    R.poi('terminal', R.at(desk, 0, 0.9, 0), R.front(desk), {});
    R.emitter('static', R.at(desk, 0, 1.0, 0), { r: 18 });
  }
  const board = R.bareWalls()[0] ?? R.pick(SIDES);
  R.sign(board, wallMid(R, board), Math.min(R.height - 2.6, 6), ['RELAY ' + R.plan.sector, 'LINK LOST'], {
    size: 0.7, color: COL.cyan, emis: 1.4, margin: 0.2,
  });
  const note = R.fitWall(R.pick(SIDES), 'notice', { gap: 0.6 });
  if (note) R.poi('intercom', R.at(note, 0, 0.95, 0.1), R.front(note), {});
  R.emitter('relay', [R.cx, R.y0 + 2, R.cz + rowZ], { r: 20 });
  R.emitter('fan', [R.cx, R.y0 + 4, R.cz - rowZ], { r: 18 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 28 });
}

// Note: a narrow chamber between two blast doors with hazard lanes, suit lockers and slow status beacons.
function lock(R) {
  const F = longFrame(R);
  const { hu, hv } = F;
  R.lanes(R.cx, R.cz, 2.0);
  for (const s of [-1, 1]) {
    const f = F.wallV(s);
    const w = Math.min(5.6, R.wallLen(f) - 6);
    if (w < 3) continue;
    R.wallItem('blastdoor', f, wallMid(R, f), 3.0, { w, h: 5.0, margin: 1.0 });
  }
  const strip = (u, wd) => {
    const along = hv - 4;
    R.decal(F.x(u, 0), F.z(u, 0), F.alongZ ? wd : along, F.alongZ ? along : wd, L.HAZARD, { tint: [1, 1, 1] });
  };
  strip(0, 0.6);
  strip(-hu + 3.4, 0.3);
  strip(hu - 3.4, 0.3);
  for (const s of [-1, 1]) {
    const f = F.wallU(s);
    const [t0, t1] = R.wallSpan(f);
    for (let t = t0 + 3; t < Math.min(t1 - 3, (t0 + t1) / 2 - 1); t += 2.1) {
      R.onWall(f, 'locker', t, { s: [2.0, 1.95, 0.5], gap: 0.1, tint: [0.78, 0.62, 0.25] });
    }
    for (const q of [-0.5, 0, 0.5]) {
      R.poster(f, (t0 + t1) / 2 + q * (t1 - t0) * 0.6, 3.6, L.METER, 1.3, 1.3, { emis: 0.5, margin: 0.3 });
    }
  }
  lampGrid(R, {
    y: Math.min(5, R.height - 2.2), spacing: 8, i: 2.0, r: 16, c: [0.9, 0.9, 0.75], failMul: 0.8,
  });
  for (const s of [-1, 1]) R.beacon(F.x(0, s * hv * 0.55), R.height - 1.4, F.z(0, s * hv * 0.55), { r: 16, c: COL.amber });
  const wall = F.wallU(R.pick([-1, 1]));
  const desk = R.fitWall(wall, 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.amber });
  if (desk) R.poi('terminal', R.at(desk, 0, 1.4, -0.2), R.front(desk), {});
  R.sign(wall, wallMid(R, wall), Math.min(R.height - 2.6, 6.4), ['LOCK ' + R.plan.sector, 'CYCLE READY'], {
    size: 0.7, color: COL.green, emis: 1.4, margin: 0.2,
  });
  R.emitter('lock', [R.cx, R.y0 + 3, R.cz], { r: 34 });
  R.emitter('steam', [R.cx, R.y0 + 1.5, R.cz + R.range(-4, 4)], { r: 16 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 22 });
}

export const PLANT = {
  substation, pumphouse, relay, lock,
};
