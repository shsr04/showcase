// Note: layouts of living rooms: lounge, greenhouse, nursery, archive, arcade, dorm, promenade, chapel, atrium.

import { L, STYLE } from './config.js';
import { PAL } from './props.js';
import { yawToward, WALLS } from './roomplan.js';
import {
  COL, APPS, lampGrid, scatter, longFrame, rug,
} from './layhelp.js';

const SIDES = [0, 1, 4, 5];
const UP3 = [0, 1, 0];

function wallMid(R, f) {
  const [a, b] = R.wallSpan(f);
  return (a + b) / 2;
}

function lounge(R) {
  R.lanes();
  lampGrid(R, {
    y: Math.min(3.8, R.height - 2), spacing: 8, i: 1.9, r: 16, c: COL.warm, failMul: 0.7, shade: [0.5, 0.2, 0.14],
  });
  const bare = R.bareWalls();
  const barWall = bare[0] ?? R.pick(SIDES);
  const bar = R.fitWall(barWall, 'bar', { s: [5.6, 1.2, 1.0], gap: 3.2 });
  if (bar) {
    for (let i = 0; i < 5; i++) {
      const q = R.at(bar, -2.2 + i * 1.1, 0, 1.2);
      R.deco('stool', q[0], 0, q[2], 0, { tint: PAL.cloth[i % 3] });
    }
    const t = barWall < 2 ? bar.p[2] : bar.p[0];
    R.sign(barWall, t, 3.4, ['OPEN', 'ALL NIGHT'], { size: 0.5, color: COL.pink, emis: 2.0, style: STYLE.BREATH, margin: 0.2 });
    R.light({
      p: R.at(bar, 0, 3.0, 0.8), c: COL.pink, i: 1.4, r: 12, n: R.front(bar), state: 'on', halo: 0, style: STYLE.BREATH,
    });
  }
  const jb = R.fitWall(bare[1] ?? R.pick(SIDES), 'jukebox', { gap: 2, color: COL.amber });
  if (jb) {
    R.poi('jukebox', R.at(jb, 0, 1.45, 0.4), R.front(jb), { r: 7 });
    R.emitter('jukebox', R.at(jb, 0, 1.2, 0.3), { r: 22 });
    R.light({
      p: R.at(jb, 0, 1.6, 1.0), c: COL.amber, i: 1.3, r: 9, n: R.front(jb), state: 'on', halo: 0, style: STYLE.BREATH,
    });
  }
  // Note: seating groups of round tables with armchairs.
  const groups = R.rr.int(2, 3);
  for (let g = 0; g < groups; g++) {
    for (let tries = 0; tries < 12; tries++) {
      const x = R.range(R.x0 + 5, R.x1 - 5);
      const z = R.range(R.z0 + 5, R.z1 - 5);
      const t = R.put('rtable', x, z, 0, { s: [1.3, 0.78, 1.3], gap: 3.2, lamp: COL.warm });
      if (!t) continue;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + R.range(0, 1);
        R.put('armchair', x + Math.cos(a) * 1.5, z + Math.sin(a) * 1.5, yawToward(-Math.cos(a), -Math.sin(a)), {
          gap: 0, tint: PAL.cloth[(g + k) % 6], force: true,
        });
      }
      rug(R, x, z, 2.8, 2.8, L.CARPET, [0.9, 0.55, 0.45]);
      break;
    }
  }
  const sofa = R.fitWall(bare[2] ?? R.pick(SIDES), 'couch', { s: [2.6, 0.9, 0.95], gap: 1.5, tint: PAL.cloth[0] });
  if (sofa) {
    const q = R.at(sofa, 0, 0, 1.6);
    R.put('table', q[0], q[2], sofa.yaw, { s: [1.2, 0.5, 0.7], gap: 0, force: true });
  }
  const wf = bare.find((f) => f !== barWall) ?? R.pick(SIDES);
  R.window(wf, wallMid(R, wf), 4.2, Math.min(14, R.wallLen(wf) - 4), 4.2, { bars: 3, sill: true });
  for (const f of SIDES) {
    R.poster(f, wallMid(R, f) + R.range(-5, 5), 3.0, R.pick([L.POSTER_SPACE, L.POSTER_KIDS]), 2.0, 1.4);
    R.sconce(f, wallMid(R, f) + R.range(-7, 7), 3.0, { c: COL.warm, i: 1.3 });
  }
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
  R.emitter('tick', [R.x0 + 1, R.y0 + 3, R.cz], { r: 10 });
}

function greenhouse(R) {
  R.lanes(R.cx, R.cz, 2.2);
  R.skylightFree(R.hx * 0.6, R.hz * 0.6, { bars: 5 });
  R.glow([R.cx, R.y1 - 5, R.cz], { c: [0.5, 0.66, 1.0], i: 2.4, r: 40, n: [0, -1, 0] });
  const rowsN = Math.max(2, Math.floor((2 * R.hz - 8) / 5.5));
  let first = null;
  for (let k = 0; k < rowsN; k++) {
    const z = R.z0 + 4 + (k * (2 * R.hz - 8)) / Math.max(1, rowsN - 1);
    for (const side of [-1, 1]) {
      const x = R.cx + side * R.hx * 0.52;
      const p = R.put('planter', x, z, 0, { s: [6, 1.0, 1.5], gap: 2.2 });
      if (!p) continue;
      first = first || p;
      R.light({
        p: [x, R.y0 + 3.2, z], anchor: [x, R.y0 + 3.4, z], fix: 'tube', axis: 'x', len: 2.6, drop: R.height - 3.4,
        c: COL.pink, i: 1.9, r: 14, n: [0, -1, 0],
      });
    }
  }
  scatter(R, 'tree', 4, { s: [1.6, 4.2, 1.6], margin: 3, gap: 2 });
  if (first) R.poi('bloom', R.at(first, 0, 1.2, 0.2), R.front(first), { r: 8 });
  const term = R.fitWall(R.pick(SIDES), 'console', { s: [2.6, 1.9, 1.1], gap: 1.5, color: COL.green });
  if (term) R.poi('terminal', R.at(term, 0, 1.4, -0.2), R.front(term), {});
  for (const f of SIDES) {
    R.sconce(f, wallMid(R, f) + R.range(-6, 6), 3.0, { c: [0.7, 0.9, 1.0], i: 1.4 });
    R.fitWall(f, 'shelf', { s: [3.2, 2.2, 0.8], kind: 'boxes', gap: 1, shift: R.range(-10, 10) });
  }
  R.emitter('water', [R.cx + R.range(-6, 6), R.y0 + 0.6, R.cz + R.range(-6, 6)], { r: 16 });
  R.emitter('fan', [R.x0 + 1, R.y0 + 6, R.cz], { r: 20 });
  R.emitter('hum', [R.cx, R.y0 + 4, R.cz], { r: 30 });
}

function nursery(R) {
  R.lanes();
  lampGrid(R, {
    y: Math.min(3.6, R.height - 2), spacing: 9, i: 1.2, r: 15, c: [1.0, 0.8, 0.46], shade: [0.9, 0.7, 0.4], failMul: 0.6,
  });
  R.items.push({
    t: 'stars', y: R.y1 - 0.06, x0: R.x0 + 1, x1: R.x1 - 1, z0: R.z0 + 1, z1: R.z1 - 1, count: 90, seed: R.rr.int(1, 99999),
    tint: [1, 0.9, 0.55],
  });
  const mx = R.cx + R.range(-3, 3);
  const mz = R.cz + R.range(-3, 3);
  R.put('mat', mx, mz, 0, { s: [6, 0.03, 6], layer: L.FABRIC, tint: [0.7, 1.0, 1.5], gap: 0.5 });
  for (let i = 0; i < 6; i++) R.deco('blocks', mx + R.range(-2, 2), 0.03, mz + R.range(-2, 2), R.rr.int(0, 3), {});
  const cribs = [];
  for (const f of SIDES) {
    const c = R.fitWall(f, 'crib', { gap: 1.2, shift: R.range(-6, 6), tint: PAL.toy[cribs.length % 5] });
    if (c) cribs.push(c);
  }
  const f = R.pick(SIDES);
  const t = wallMid(R, f) + R.range(-3, 3);
  R.sign(f, t, 1.0, ['1.4', '1.2', '1.0', '0.8', '0.6'], {
    size: 0.15, color: [0.35, 0.25, 0.15], plate: [0.85, 0.72, 0.5], edge: [0.6, 0.45, 0.3], emis: 0, margin: 0.2,
  });
  const hw = WALLS.find((w) => w.f === f);
  const hp = f < 2 ? [R.wallPos(f) + hw.n[0] * 0.3, R.y0 + 1.0, t] : [t, R.y0 + 1.0, R.wallPos(f) + hw.n[2] * 0.3];
  R.poi('height', hp, hw.n, { r: 6 });
  let drawn = 0;
  for (const g of SIDES) {
    const tt = wallMid(R, g) + R.range(-6, 6);
    const p = R.poster(g, tt, 1.9, L.POSTER_KIDS, 2.6, 1.8, { margin: 0.6 });
    if (p && drawn++ === 0) {
      const w = WALLS.find((x) => x.f === g);
      R.poi('drawing', [p.p[0] + w.n[0] * 0.3, p.p[1], p.p[2] + w.n[2] * 0.3], w.n, { r: 7 });
    }
    R.sconce(g, wallMid(R, g) + R.range(-8, 8), 2.6, { c: [1.0, 0.85, 0.55], i: 1.2 });
  }
  scatter(R, 'table', 2, { s: [1.3, 0.5, 0.9], margin: 2, gap: 1.2, tint: [0.9, 0.7, 0.5] });
  scatter(R, 'stool', 6, { margin: 2, gap: 0.5, tint: PAL.toy[1] });
  R.emitter('chime', [mx, R.y0 + 1.2, mz], { r: 14 });
  R.emitter('tick', [R.x0 + 1, R.y0 + 3, R.cz], { r: 9 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 20 });
}

function archive(R) {
  const F = longFrame(R);
  R.lanes(R.cx, R.cz, 1.5);
  lampGrid(R, {
    y: Math.min(3.8, R.height - 2), spacing: 10, i: 1.2, r: 14, c: [1.0, 0.84, 0.52], failMul: 0.7, shade: [0.2, 0.3, 0.22],
  });
  const pairs = Math.max(1, Math.floor((2 * F.hu - 4) / 6));
  let kindFlip = 0;
  for (let k = 0; k < pairs; k++) {
    const u = (pairs === 1 ? 0 : -((pairs - 1) / 2) * 6 + k * 6);
    for (let v = -F.hv + 4; v <= F.hv - 4; v += 3.15) {
      const kind = (kindFlip++ & 1) ? 'files' : 'books';
      R.put('shelf', F.x(u - 0.4, v), F.z(u - 0.4, v), F.yawU(-1), { s: [3.0, 2.6, 0.7], gap: 0.05, kind });
      R.put('shelf', F.x(u + 0.4, v), F.z(u + 0.4, v), F.yawU(1), { s: [3.0, 2.6, 0.7], gap: 0.05, kind });
    }
  }
  for (const s of [-1, 1]) {
    const d = R.fitWall(F.wallV(s), 'desk', { crt: true, lamp: COL.green, papers: true, gap: 1.4, amber: s > 0, shift: R.range(-4, 4) });
    if (d) {
      R.light({
        p: R.at(d, 0.7, 1.15, -0.2), c: COL.green, i: 1.5, r: 8, n: [0, -1, 0], state: 'on', halo: 0.7,
      });
      if (s > 0) R.poi('desk', R.at(d, 0, 0.9, 0.1), R.front(d), { r: 7 });
    }
  }
  const cat = R.fitWall(F.wallU(R.chance(0.5) ? 1 : -1), 'locker', { s: [2.4, 1.3, 0.5], tint: [0.75, 0.55, 0.4], gap: 1.2 });
  if (cat) R.poi('catalog', R.at(cat, 0, 0.9, 0.3), R.front(cat), { r: 6 });
  for (const f of SIDES) R.sconce(f, wallMid(R, f) + R.range(-6, 6), 3.2, { c: COL.warm, i: 1.2 });
  R.emitter('tick', [R.cx, R.y0 + 2, R.cz], { r: 10 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
}

function arcade(R) {
  const F = longFrame(R);
  const palette = [COL.pink, COL.cyan, COL.yellow, COL.green, COL.violet, COL.amber];
  let app = R.rr.int(0, APPS.length - 1);
  const cabs = [];
  const cab = (u, v, yaw, color, style = 0) => {
    const it = R.put('cabinet', F.x(u, v), F.z(u, v), yaw, {
      name: APPS[app % APPS.length], color, gap: 0.02, margin: 0.02, style,
    });
    if (it) {
      cabs.push(it);
      app++;
    }
    return it;
  };
  for (const s of [-1, 1]) {
    for (let v = -F.hv + 2.5; v <= F.hv - 4.5; v += 1.0) {
      cab(s * (F.hu - 0.55), v, F.yawU(-s), palette[(Math.floor((v + F.hv) / 4) + (s > 0 ? 0 : 3)) % 6], R.chance(0.08) ? STYLE.FAIL : 0);
    }
  }
  if (F.hu >= 9) {
    for (let v = -F.hv * 0.55; v <= F.hv * 0.55; v += 1.0) {
      if (Math.abs(v) < 1.2 && R.rr.chance(0.5)) continue;
      cab(-0.5, v, F.yawU(-1), palette[R.rr.int(0, 5)]);
      cab(0.5, v, F.yawU(1), palette[R.rr.int(0, 5)]);
    }
  }
  for (const u of [-5, -1.7, 1.7, 5]) {
    if (Math.abs(u) > F.hu - 3) continue;
    R.put('pinball', F.x(u, F.hv - 2.2), F.z(u, F.hv - 2.2), F.yawV(-1), { gap: 0.4, color: palette[R.rr.int(0, 5)] });
  }
  for (const u of [-3, 3]) {
    if (Math.abs(u) > F.hu - 3) continue;
    R.put('claw', F.x(u, -F.hv + 2.2), F.z(u, -F.hv + 2.2), F.yawV(1), { gap: 0.4, color: palette[R.rr.int(0, 5)] });
  }
  const endWall = F.wallV(1);
  R.sign(endWall, wallMid(R, endWall), Math.min(R.height - 2, 6.2), ['ARCADE', 'INSERT COIN'], {
    size: 0.8, color: COL.pink, emis: 2.0, style: STYLE.BREATH, margin: 0.2,
  });
  for (const s of [-1, 1]) {
    const f = F.wallU(s);
    for (let k = -1; k <= 1; k++) {
      R.poster(f, wallMid(R, f) + k * 7.5, 4.4, k % 2 ? L.NEON_CYAN : L.NEON_PINK, 2.6, 2.6, { emis: 1.8, style: STYLE.BREATH, margin: 0.3 });
    }
  }
  // Note: neon tubes alternate pink and cyan along the long axis, hung low.
  const nTubes = Math.max(2, Math.floor((2 * F.hv) / 6.5));
  for (let i = 0; i < nTubes; i++) {
    const v = -F.hv + 3 + (i * (2 * F.hv - 6)) / Math.max(1, nTubes - 1);
    for (const s of [-1, 1]) {
      const u = s * F.hu * 0.5;
      const col = (i + (s > 0 ? 1 : 0)) % 2 ? COL.pink : COL.cyan;
      R.light({
        p: [F.x(u, v), R.y0 + 3.9, F.z(u, v)], anchor: [F.x(u, v), R.y0 + 4.1, F.z(u, v)], fix: 'tube', axis: F.alongZ ? 'z' : 'x',
        len: 1.4, drop: R.height - 4.1, c: col, i: 1.8, r: 13, n: [0, -1, 0],
      });
    }
  }
  const poiCab = cabs[R.rr.int(0, Math.max(0, cabs.length - 1))];
  if (poiCab) R.poi('cabinet', R.at(poiCab, 0, 1.46, 0.3), R.front(poiCab), { r: 5, ctx: { name: poiCab.name } });
  for (let k = 0; k < 3; k++) {
    const v = -F.hv * 0.6 + k * F.hv * 0.6;
    R.emitter('arcade', [F.x(0, v), R.y0 + 1.4, F.z(0, v)], { r: 18 });
  }
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
}

function dorm(R) {
  const F = longFrame(R);
  R.lanes(R.cx, R.cz, 1.6);
  lampGrid(R, {
    y: Math.min(3.2, R.height - 1.8), spacing: 7, i: 1.4, r: 13, c: [0.8, 0.85, 1.0], failMul: 1.2, jitter: 0.3,
  });
  for (const s of [-1, 1]) {
    const f = F.wallU(s);
    const span = R.wallSpan(f);
    const bunks = R.wallRun(f, 'bunk', span[0] + 2.5, span[1] - 2.5, 1.35, (i) => ({ gap: 0.1, tint: PAL.cloth[(i + (s > 0 ? 2 : 0)) % 6], s: [1.1, 1.95, 2.2] }));
    bunks.forEach((b, i) => {
      if (i % 2 === 0) {
        const q = R.at(b, 0, 1.0, 1.5);
        R.light({
          p: q, c: [0.55, 0.65, 1.0], i: 0.9, r: 7, n: R.front(b), state: R.roll(2) === 'dead' ? 'dead' : 'on', halo: 0,
        });
      }
    });
    if (bunks.length && s > 0) {
      const b = bunks[Math.floor(bunks.length / 2)];
      R.poi('bunk', R.at(b, 0, 0.7, 0.8), R.front(b), { r: 6 });
    }
  }
  for (const s of [-1, 1]) {
    const f = F.wallV(s);
    const span = R.wallSpan(f);
    const row = R.wallRun(f, 'locker', span[0] + 3, span[1] - 3, 2.1, { s: [2.0, 1.95, 0.5], gap: 0.05, tint: [0.55, 0.62, 0.7] });
    if (s < 0 && row.length) R.poi('locker', R.at(row[Math.floor(row.length / 2)], 0, 1.2, 0.3), R.front(row[0]), { r: 6 });
  }
  for (const f of SIDES) R.sconce(f, wallMid(R, f) + R.range(-6, 6), 3.0, { c: [0.6, 0.7, 1.0], i: 1.0, failMul: 2 });
  R.emitter('hum', [R.cx, R.y0 + 2.5, R.cz], { r: 20 });
  R.emitter('drip', [R.cx + R.range(-2, 2), R.y1 - 1, R.cz + R.range(-6, 6)], { r: 12 });
}

function promenade(R) {
  const F = longFrame(R);
  R.lanes(R.cx, R.cz, 1.8);
  const NAMES = ['CAFE ORBIT', 'RECORDS', 'NOODLES', 'BOOKS', 'FILM', 'TOYS', 'TAILOR', 'ARCADE', 'FLORIST', 'PHARMACY', 'CINEMA', 'SWEETS'];
  let n = R.rr.int(0, NAMES.length - 1);
  const cols = [COL.pink, COL.cyan, COL.yellow, COL.green, COL.amber, COL.violet];
  let shopsPlaced = 0;
  let lightN = 0;
  for (const s of [-1, 1]) {
    const f = F.wallU(s);
    const wl = WALLS.find((w) => w.f === f);
    const [t0, t1] = R.wallSpan(f);
    for (let t = t0 + 4.5; t <= t1 - 4.5; t += 7.4) {
      const col = cols[(n + shopsPlaced) % 6];
      const it = R.wallItem('shop', f, t, 2.5, {
        w: 6.2, h: 5.0, text: NAMES[n++ % NAMES.length], color: col, size: 0.6, style: R.chance(0.15) ? STYLE.FAIL : 0, margin: 0.4,
        shutter: R.chance(0.3) ? 2.2 : 0,
      });
      if (!it) continue;
      shopsPlaced++;
      if (lightN++ < 12) {
        R.light({
          p: [it.p[0] + wl.n[0] * 1.6, R.y0 + 3.0, it.p[2] + wl.n[2] * 1.6], c: col, i: 1.5, r: 11, n: wl.n, state: 'on', halo: 0,
        });
      }
      if (shopsPlaced === 2) R.poi('sign', [it.p[0] + wl.n[0] * 0.8, R.y0 + 3.6, it.p[2] + wl.n[2] * 0.8], wl.n, { r: 8, ctx: { name: it.text } });
    }
  }
  for (let v = -F.hv + 6; v <= F.hv - 6; v += 8) {
    R.put('pew', F.x(0, v), F.z(0, v), F.yawU(1), { s: [2.6, 0.95, 0.7], gap: 1.6, tint: [0.7, 0.55, 0.45] });
    R.put('pew', F.x(0, v + 3.2), F.z(0, v + 3.2), F.yawU(-1), { s: [2.6, 0.95, 0.7], gap: 0.4, tint: [0.7, 0.55, 0.45] });
    R.put('planter', F.x(0, v + 5.6), F.z(0, v + 5.6), F.yawU(1), { s: [2.4, 1.0, 1.1], gap: 0.8 });
  }
  const clockWall = F.wallV(1);
  R.sign(clockWall, wallMid(R, clockWall), Math.min(R.height - 2, 6.5), ['03:17'], {
    size: 1.1, color: COL.red, emis: 1.8, margin: 0.2,
  });
  const winWall = F.wallV(-1);
  R.window(winWall, wallMid(R, winWall), 4.6, Math.min(10, R.wallLen(winWall) - 3), 5, { bars: 2, sill: true });
  lampGrid(R, {
    y: Math.min(5.0, R.height - 2.4), spacing: 10, i: 1.8, r: 18, c: [1.0, 0.9, 0.75], failMul: 0.9,
  });
  R.emitter('chime', [R.cx, R.y0 + 3, R.cz], { r: 18 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 26 });
}

function chapel(R) {
  const f = R.bareWalls()[0] ?? 5;
  const wl = WALLS.find((w) => w.f === f);
  const mid = wallMid(R, f);
  const altar = R.onWall(f, 'altar', mid, { s: [2.6, 1.15, 0.9], gap: 0.5 });
  const P = (d, lat) => (f < 2 ? [R.wallPos(f) + wl.n[0] * d, mid + lat] : [mid + lat, R.wallPos(f) + wl.n[2] * d]);
  if (altar) {
    for (const s of [-1, 1]) {
      const [x, z] = P(1.2, s * 2.4);
      R.put('candles', x, z, 0, { gap: 0.1, force: true });
      R.light({
        p: [x, R.y0 + 1.5, z], c: [1.0, 0.72, 0.38], i: 1.6, r: 10, state: 'on', style: STYLE.FLICKER, halo: 1.0, n: UP3,
      });
    }
    R.poi('altar', R.at(altar, 0, 1.2, 0.2), R.front(altar), { r: 8 });
    const [hx, hz] = P(2.4, 0);
    R.hang(hx, hz, 3.2, { c: [1.0, 0.78, 0.5], i: 2.2, r: 16, failMul: 0.3 });
  }
  const depth = (f < 2 ? R.hx : R.hz) * 2;
  const width = (f < 2 ? R.hz : R.hx) * 2;
  const rows = Math.max(2, Math.floor((depth - 9) / 1.8));
  for (let r = 0; r < rows; r++) {
    for (const lat of [-1, 1]) {
      const [x, z] = P(6.2 + r * 1.8, lat * Math.min(2.2, width * 0.18));
      R.put('pew', x, z, (wl.yaw + 2) & 3, { s: [Math.min(3.4, width * 0.3), 0.95, 0.7], gap: 0.1, tint: [0.7, 0.5, 0.4] });
    }
  }
  // Note: stained glass panels glow along the two side walls.
  const sideWalls = f < 2 ? [4, 5] : [0, 1];
  const glass = [L.LAMP_COOL, L.LAMP_WARM, L.LAMP_RED, L.NEON_CYAN, L.NEON_PINK];
  for (const g of sideWalls) {
    const [t0, t1] = R.wallSpan(g);
    const cnt = Math.max(2, Math.floor((t1 - t0) / 4));
    for (let k = 0; k < cnt; k++) {
      const t = t0 + ((k + 0.5) / cnt) * (t1 - t0);
      const lyr = glass[(k + g) % glass.length];
      R.poster(g, t, Math.min(R.height * 0.55, 8), lyr, 1.6, 4.8, { emis: 1.5, margin: 0.2, style: STYLE.SLOW });
    }
  }
  R.hang(R.cx, R.cz, 4.4, { c: [1.0, 0.82, 0.55], i: 1.8, r: 18, failMul: 0.4 });
  R.emitter('chime', [R.cx, R.y0 + 4, R.cz], { r: 18 });
  R.emitter('hum', [R.cx, R.y0 + 4, R.cz], { r: 22 });
}

function atrium(R) {
  // Note: fountain and skylight step aside when shafts open in the floor or ceiling at the room centre.
  const [fx, fz] = R.centre(2.6, 2.6, 1.6) || [R.cx, R.cz];
  R.put('fountain', fx, fz, 0, { s: [4.6, 1.6, 4.6], force: true, gap: 0 });
  R.light({
    p: [fx, R.y0 + 2.5, fz], c: [0.6, 0.85, 1.0], i: 2.2, r: 20, n: UP3, state: 'on', style: STYLE.SLOW, halo: 0,
  });
  const sp = R.skylightFree(Math.min(R.hx * 0.55, 12), Math.min(R.hz * 0.55, 12), { bars: 4 });
  R.glow([sp ? sp[0] : R.cx, R.y1 - 6, sp ? sp[1] : R.cz], { c: [0.5, 0.66, 1.0], i: 3.0, r: 46, n: [0, -1, 0] });
  const gx = R.hx - 6;
  const gz = R.hz - 6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    R.put('column', R.cx + sx * gx, R.cz + sz * gz, 0, { s: [1.8, R.height - 0.1, 1.8], gap: 1, band: true, layer: L.CONCRETE });
    R.hang(R.cx + sx * gx * 0.6, R.cz + sz * gz * 0.6, Math.min(7, R.height - 4), { c: R.D.lamp, i: 2.4, r: 26, failMul: 0.7 });
  }
  const rad = 6.4;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = R.cx + Math.cos(a) * rad;
    const z = R.cz + Math.sin(a) * rad;
    R.put('pew', x, z, yawToward(-Math.cos(a), -Math.sin(a)), { s: [2.6, 0.95, 0.7], gap: 0, force: true, tint: [0.65, 0.65, 0.7] });
  }
  scatter(R, 'planter', 4, { s: [2.4, 1.0, 1.1], margin: 3, gap: 1.5 });
  for (const f of SIDES) {
    const mid = wallMid(R, f);
    for (const k of [-1, 1]) {
      R.poster(f, mid + k * 6, Math.min(R.height * 0.4, 8), L.POSTER_SPACE, 3.2, 4.4, { margin: 0.5 });
    }
  }
  const b = R.fitWall(R.pick(SIDES), 'console', { s: [2.8, 1.9, 1.1], gap: 1.5, color: COL.cyan });
  if (b) R.poi('terminal', R.at(b, 0, 1.4, -0.2), R.front(b), {});
  R.poi('plaque', [fx, R.y0 + 1.9, fz + 2.6], [0, 0, 1], { r: 9 });
  R.emitter('water', [fx, R.y0 + 1.5, fz], { r: 24 });
  R.emitter('hum', [R.cx, R.y0 + 6, R.cz], { r: 40 });
}

export const LIFE = {
  lounge, greenhouse, nursery, archive, arcade, dorm, promenade, chapel, atrium,
};
