// Note: layouts of working rooms: hangar, junction, valves, cargo, reactor, control, observatory.

import { L, SP, STYLE } from './config.js';
import { PAL } from './props.js';
import { yawToward, WALLS } from './roomplan.js';
import {
  COL, lampGrid, corner, scatter, hazardFrame,
} from './layhelp.js';

function hangar(R) {
  R.lanes(R.cx, R.cz, 2.8);
  const bare = R.bareWalls();
  // Note: parked shuttle backed by a wide window to the stars.
  let shuttle = null;
  let wall = null;
  for (const f of [...bare, 0, 1, 4, 5]) {
    shuttle = R.fitWall(f, 'shuttle', { inset: 3.6, gap: 2, name: R.world.seedStr });
    if (shuttle) {
      wall = f;
      break;
    }
  }
  if (!shuttle) shuttle = R.put('shuttle', R.cx + R.hx * 0.35, R.cz + R.hz * 0.35, 0, { gap: 2, name: R.world.seedStr });
  if (shuttle) {
    const [sx, , sz] = shuttle.p;
    const odd = shuttle.yaw & 1;
    hazardFrame(R, sx, sz, (odd ? 6.9 : 8.1), (odd ? 8.1 : 6.9), 0.7);
    for (const [px, pz] of [[-8.9, -7.6], [8.9, -7.6], [-8.9, 7.6], [8.9, 7.6]]) {
      const p = R.at(shuttle, px, 0, pz);
      R.beacon(p[0], 0, p[2], { c: pz > 0 ? COL.green : COL.red, r: 10 });
    }
    const tail = R.at(shuttle, 0, 6.3, -4.4);
    R.beacon(tail[0], tail[1] - R.y0, tail[2], { r: 14 });
    const eng = R.at(shuttle, 0, 2.7, -6.6);
    R.glow(eng, { c: [0.5, 0.78, 1.0], i: 1.8, r: 16, style: STYLE.BREATH, n: R.front(shuttle).map((v) => -v) });
    const nose = R.at(shuttle, 0, 2.4, 6.5);
    R.poi('plaque', nose, R.front(shuttle), { r: 8 });
  }
  if (wall !== null) {
    const t = shuttle.p[wall < 2 ? 2 : 0];
    const len = R.wallLen(wall);
    R.window(wall, t, 9, Math.min(26, len - 5), 9, { bars: 3, frame: 0.4 });
  }
  // Note: gantry beams carry the flood lamps.
  const gy = Math.min(R.height - 2.2, 10.5);
  const nb = 3;
  let floods = 0;
  for (let k = 0; k < nb; k++) {
    const z = R.z0 + ((k + 1) / (nb + 1)) * (R.z1 - R.z0);
    if (!R.beam([R.x0 + 0.2, gy, z], [R.x1 - 0.2, gy, z], [0, 0.3, 0.3])) continue;
    const nf = Math.max(2, Math.round((R.x1 - R.x0) / 12));
    for (let m = 0; m < nf; m++) {
      const x = R.x0 + ((m + 0.5) / nf) * (R.x1 - R.x0);
      const warm = (floods + k) % 5 === 2;
      R.flood(x, z, gy - 0.3, {
        c: warm ? COL.amber : COL.cold, i: warm ? 2.2 : 2.7, r: 30, failMul: 0.5,
      });
      floods++;
    }
  }
  if (floods === 0) lampGrid(R, { y: 6, spacing: 12, i: 2.6, r: 28, c: COL.cold });
  // Note: wall dressing and a big bay sign.
  const others = [0, 1, 4, 5].filter((f) => f !== wall);
  const signWall = others.find((f) => !R.wallHole(f)) ?? others[0];
  const mid = (R.wallSpan(signWall)[0] + R.wallSpan(signWall)[1]) / 2;
  R.sign(signWall, mid, Math.min(R.height - 3, 12), ['BAY 04', R.world.seedStr], {
    size: 1.1, color: COL.amber, emis: 1.5, margin: 0.2,
  });
  for (const f of others) {
    R.fitWall(f, 'stack', { s: [3.8, 2.4, 3.2], gap: 2.5, shift: R.range(-8, 8) });
    R.fitWall(f, 'tank', { s: [2.6, 5, 2.6], gap: 2, shift: R.range(-10, 10) });
  }
  const desk = R.fitWall(others[others.length - 1], 'console', { s: [3.4, 1.9, 1.1], gap: 1.5, shift: R.range(-6, 6) });
  if (desk) {
    R.poi('terminal', R.at(desk, 0, 1.4, -0.2), R.front(desk), { r: 8 });
    R.emitter('relay', R.at(desk, 0, 1.2, 0), { r: 14 });
  }
  scatter(R, 'crate', 6, { margin: 2.5, gap: 1.6 });
  scatter(R, 'barrel', 9, { margin: 2.5, gap: 0.3 });
  scatter(R, 'forklift', 1, { margin: 3, gap: 2 });
  scatter(R, 'cart', 2, { margin: 3, gap: 1.5 });
  R.emitter('hum', [R.cx, R.y0 + 5, R.cz], { r: 50 });
  for (let i = 0; i < 2; i++) R.emitter('fan', [i ? R.x1 - 1 : R.x0 + 1, R.y0 + 6, R.cz + R.range(-8, 8)], { r: 18 });
}

// Note: district dressers for small hubs; each places a handful of props along the walls.
const DRESS = {
  engineering(R) {
    for (let i = 0; i < 4; i++) {
      if (R.chance(0.6)) corner(R, i, 'manifold', { s: [2.2, R.height - 0.2, 2.2], pal: i, gap: 1.2 });
    }
    scatter(R, 'barrel', 4, { margin: 1.5, gap: 0.2 });
    scatter(R, 'crate', 3, { margin: 1.5, gap: 1.2 });
    for (const f of [0, 1, 4, 5]) {
      if (R.chance(0.7)) R.poster(f, (R.wallSpan(f)[0] + R.wallSpan(f)[1]) / 2 + R.range(-3, 3), 2.2, L.WARN_SIGNS, 1.5, 1.5, {});
    }
    const hz = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.amber });
    if (hz) R.poi('telemetry', R.at(hz, 0, 1.4, -0.2), R.front(hz), {});
    R.emitter('steam', [R.cx + R.range(-3, 3), R.y0 + 2, R.cz + R.range(-3, 3)], { r: 12 });
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
  },
  habitat(R) {
    const f = R.pick(R.bareWalls().concat([0, 1, 4, 5]));
    R.fitWall(f, 'couch', { gap: 1, tint: R.pick(PAL.cloth) });
    const t = R.fitWall(R.pick([0, 1, 4, 5]), 'table', { s: [1.6, 0.78, 0.9], gap: 1, lamp: COL.warm });
    scatter(R, 'planter', 2, { s: [2.4, 1.0, 1.0], margin: 1.2, gap: 1 });
    const board = R.fitWall(R.pick([0, 1, 4, 5]), 'notice', { gap: 0.6 });
    if (board) R.poi('note', R.at(board, 0, 0.95, 0.1), R.front(board), {});
    R.fitWall(R.pick([0, 1, 4, 5]), 'vending', { gap: 1, color: COL.cyan });
    for (const w of [0, 1, 4, 5]) {
      const mid = (R.wallSpan(w)[0] + R.wallSpan(w)[1]) / 2;
      R.poster(w, mid + R.range(-4, 4), 3.0, R.pick([L.POSTER_SPACE, L.POSTER_KIDS, L.POSTER_NOTICE]), 2.0, 1.4);
      R.sconce(w, mid + R.range(-6, 6), 3.2, { c: COL.warm, i: 1.6 });
    }
    if (t) R.deco('crate', t.p[0], 0.78, t.p[2], 0, { s: [0.3, 0.2, 0.3], solid: false });
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
  },
  research(R) {
    const a = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [3.0, 1.9, 1.1], gap: 1.2, color: COL.cyan });
    R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.green });
    R.fitWall(R.pick([0, 1, 4, 5]), 'rack', { s: [0.85, 2.2, 0.9], gap: 0.5, style: STYLE.STATIC });
    R.fitWall(R.pick([0, 1, 4, 5]), 'rack', { s: [0.85, 2.2, 0.9], gap: 0.5, style: STYLE.SLOW });
    const d = R.fitWall(R.pick([0, 1, 4, 5]), 'desk', { crt: true, lamp: COL.green, papers: true, gap: 1 });
    scatter(R, 'planter', 1, { s: [2.0, 1.0, 1.0], margin: 1.2, gap: 1 });
    if (a) {
      R.poi('terminal', R.at(a, 0, 1.4, -0.2), R.front(a), {});
      R.emitter('relay', R.at(a, 0, 1.2, 0), { r: 12 });
    }
    if (d) R.chance(0.5) && R.poi('desk', R.at(d, 0, 0.9, 0), R.front(d), {});
    for (const w of [0, 1, 4, 5]) {
      const mid = (R.wallSpan(w)[0] + R.wallSpan(w)[1]) / 2;
      if (R.chance(0.6)) R.poster(w, mid + R.range(-4, 4), 2.6, L.METER, 1.6, 1.6, { emis: 0.4 });
    }
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 26 });
  },
  cargo(R) {
    const stacks = scatter(R, 'stack', 3, { s: [3.8, 2.4, 3.0], margin: 1.8, gap: 1.6 });
    const sh = R.fitWall(R.pick([0, 1, 4, 5]), 'shelf', { s: [3.2, 2.4, 0.8], gap: 0.8, kind: 'boxes' });
    R.fitWall(R.pick([0, 1, 4, 5]), 'shelf', { s: [3.2, 2.4, 0.8], gap: 0.8, kind: 'boxes' });
    scatter(R, 'cart', 1, { margin: 1.5, gap: 1 });
    for (const it of stacks.slice(0, 1)) {
      hazardFrame(R, it.p[0], it.p[2], 2.1, 1.7, 0.4);
      R.poi('manifest', R.at(it, 0, 1.1, 1.65), R.front(it), {});
    }
    if (sh && !stacks.length) R.poi('manifest', R.at(sh, 0, 1.3, 0.5), R.front(sh), {});
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
  },
  command(R) {
    const a = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [3.4, 1.9, 1.1], gap: 1.2, color: COL.blue });
    const b = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.green });
    for (const it of [a, b]) {
      if (!it) continue;
      const q = R.at(it, 0, 0, 1.2);
      R.put('chair', q[0], q[2], (it.yaw + 2) & 3, { gap: 0, tint: PAL.cloth[1] });
    }
    R.fitWall(R.pick([0, 1, 4, 5]), 'rack', { s: [0.85, 2.2, 0.9], gap: 0.5 });
    for (const w of [0, 1, 4, 5]) {
      const mid = (R.wallSpan(w)[0] + R.wallSpan(w)[1]) / 2;
      R.poster(w, mid + R.range(-3, 3), 3.0, SP.SCREEN, 3.2, 1.8, { tint: COL.green, emis: 1.2 });
    }
    if (a) {
      R.poi('telemetry', R.at(a, 0, 1.4, -0.2), R.front(a), {});
      R.emitter('relay', R.at(a, 0, 1.2, 0), { r: 14 });
    }
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 26 });
  },
  decay(R) {
    scatter(R, 'stack', 2, { s: [3.0, 1.2, 2.6], margin: 1.5, gap: 1.2 });
    scatter(R, 'barrel', 3, { margin: 1.5, gap: 0.3 });
    scatter(R, 'planter', 2, { s: [2.4, 1.0, 1.1], margin: 1.2, gap: 1, green: [0.35, 0.55, 0.3] });
    scatter(R, 'cart', 1, { margin: 1.5, gap: 1 });
    const n = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.red });
    if (n) R.poi('terminal', R.at(n, 0, 1.4, -0.2), R.front(n), {});
    R.emitter('drip', [R.cx + R.range(-4, 4), R.y1 - 1, R.cz + R.range(-4, 4)], { r: 16 });
    R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 20 });
  },
};

function junction(R) {
  const d = R.D.id;
  R.lanes();
  lampGrid(R, {
    y: Math.min(5.0, R.height - 2.2),
    spacing: 9.5,
    i: d === 'decay' ? 1.8 : 2.1,
    r: 20,
    c: R.D.lamp,
    failMul: d === 'decay' ? 1.4 : 1,
  });
  DRESS[d](R);
  // Note: ceiling pipes along one wall pair give the volume some scale.
  if (d === 'engineering' || d === 'cargo' || d === 'decay') {
    const z = R.cz + R.range(-R.hz * 0.5, R.hz * 0.5);
    const y = R.y1 - 0.9;
    if (R.boxClear([R.cx, y, z], [R.hx, 0.3, 0.3], 0)) {
      R.pipe([R.x0 + 0.2, y, z], [R.x1 - 0.2, y, z], 0.28, { tint: PAL.steel[d === 'decay' ? 3 : 1] });
    }
  }
}

function valves(R) {
  R.lanes();
  lampGrid(R, { y: Math.min(4.6, R.height - 2), spacing: 9, i: 2.0, r: 18, c: [1.0, 0.62, 0.3], failMul: 1.2 });
  const n = 2 + R.rr.int(0, 1);
  for (let i = 0; i < 4 && i < n + 1; i++) corner(R, i, 'manifold', { s: [2.4, R.height - 0.2, 2.4], pal: i, gap: 1.2 });
  scatter(R, 'barrel', 3, { margin: 1.5, gap: 0.2 });
  for (const f of [0, 1, 4, 5]) {
    const mid = (R.wallSpan(f)[0] + R.wallSpan(f)[1]) / 2;
    R.poster(f, mid + R.range(-3, 3), 2.0, L.WARN_SIGNS, 1.4, 1.4);
    R.sconce(f, mid + R.range(-4, 4), 3.0, { c: COL.red, i: 1.2, style: STYLE.BEACON, state: 'on', halo: 0 });
  }
  const c = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [2.6, 1.9, 1.1], gap: 1.2, color: COL.amber });
  if (c) R.poi('telemetry', R.at(c, 0, 1.4, -0.2), R.front(c), {});
  R.emitter('steam', [R.cx + R.range(-3, 3), R.y0 + 1.5, R.cz + R.range(-3, 3)], { r: 14 });
  R.emitter('steam', [R.cx + R.range(-5, 5), R.y0 + 1.5, R.cz + R.range(-5, 5)], { r: 14 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
}

function cargo(R) {
  R.lanes(R.cx, R.cz, 2.4);
  const gy = Math.min(R.height - 2.0, 8.5);
  let beams = 0;
  for (const s of [-0.5, 0.5]) {
    const z = R.cz + s * R.hz;
    if (!R.beam([R.x0 + 0.2, gy, z], [R.x1 - 0.2, gy, z], [0, 0.3, 0.3])) continue;
    beams++;
    const nf = Math.max(2, Math.round((R.x1 - R.x0) / 11));
    for (let m = 0; m < nf; m++) {
      R.flood(R.x0 + ((m + 0.5) / nf) * (R.x1 - R.x0), z, gy - 0.3, { c: R.D.lamp, i: 2.4, r: 28, failMul: 1.2 });
    }
  }
  if (!beams) lampGrid(R, { y: 6, spacing: 11, i: 2.3, r: 26, c: R.D.lamp });
  // Note: crate blocks in loose rows leave wide aisles.
  for (let i = 0; i < 7; i++) {
    R.put('stack', R.x0 + 5 + R.range(0, R.x1 - R.x0 - 10), R.z0 + 5 + R.range(0, R.z1 - R.z0 - 10), 0, {
      s: [R.range(3.5, 6.2), 3.6, R.range(2.6, 4.8)], gap: 2.6,
    });
  }
  for (const f of [0, 1, 4, 5]) {
    R.fitWall(f, 'shelf', { s: [3.4, 2.6, 0.9], gap: 1, kind: 'boxes', shift: R.range(-6, 6) });
    R.fitWall(f, 'shelf', { s: [3.4, 2.6, 0.9], gap: 1, kind: 'boxes', shift: R.range(-12, 12) });
  }
  scatter(R, 'forklift', 1, { margin: 3, gap: 2 });
  scatter(R, 'cart', 3, { margin: 2, gap: 1.2 });
  scatter(R, 'barrel', 5, { margin: 2, gap: 0.3 });
  const found = R.items.filter((it) => it.t === 'stack');
  if (found.length) {
    const it = found[0];
    hazardFrame(R, it.p[0], it.p[2], it.s[0] / 2 + 0.2, it.s[2] / 2 + 0.2, 0.5);
    R.poi('manifest', R.at(it, 0, 1.2, it.s[2] / 2 + 0.05), R.front(it), {});
  }
  const signWall = R.pick([0, 1, 4, 5]);
  const mid = (R.wallSpan(signWall)[0] + R.wallSpan(signWall)[1]) / 2;
  R.sign(signWall, mid, Math.min(R.height - 3, 7), ['LOGISTICS', R.plan.sector], {
    size: 0.9, color: COL.amber, emis: 1.4, margin: 0.2,
  });
  R.emitter('hum', [R.cx, R.y0 + 5, R.cz], { r: 40 });
}

function reactor(R) {
  // Note: the core moves aside when a shaft opens in the floor below the room centre.
  const [kx, kz] = R.centre(7.2, 7.2, 20) || [R.cx, R.cz];
  const core = R.put('core', kx, kz, 0, { s: [8, Math.min(20, R.height - 2), 8], force: true, gap: 0 });
  const top = core ? core.s[1] : 14;
  R.light({
    p: [kx, R.y0 + 3, kz], c: [0.4, 0.8, 1.0], i: 3.4, r: 36, style: STYLE.BREATH, n: [0, 1, 0], state: 'on', halo: 0,
  });
  R.light({
    p: [kx, R.y0 + top * 0.55, kz], c: [0.45, 0.85, 1.0], i: 3.0, r: 36, style: STYLE.BREATH, n: [0, 1, 0], state: 'on', halo: 0,
  });
  R.light({
    p: [kx, R.y0 + top + 0.8, kz], c: [0.5, 0.85, 1.0], i: 2.4, r: 30, style: STYLE.BREATH, n: [0, -1, 0], state: 'on', halo: 0,
  });
  R.decal(kx, kz, 7, 7, L.HAZARD, { tint: [1, 1, 1] });
  R.decal(kx, kz, 5.4, 5.4, L.PLATE_DARK, { tint: [0.4, 0.45, 0.5] });
  const rad = Math.min(R.hx, R.hz) - 5;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = R.cx + Math.cos(a) * rad;
    const z = R.cz + Math.sin(a) * rad;
    R.hang(x, z, Math.min(7, R.height - 3), { c: [0.55, 0.85, 1.0], i: 2.2, r: 22, failMul: 0.6 });
    if (k % 2 === 0) R.put('column', x * 0.97 + R.cx * 0.03, z * 0.97 + R.cz * 0.03, 0, { s: [1.4, R.height - 0.1, 1.4], band: true, gap: 1 });
  }
  for (const f of [0, 1, 4, 5]) {
    R.wallRun(f, 'rack', R.wallSpan(f)[0] + 5, R.wallSpan(f)[1] - 5, 2.4, { s: [0.85, 2.3, 0.9], gap: 0.1, style: STYLE.SLOW });
    R.fitWall(f, 'tank', { s: [3, 6, 3], gap: 1.5, shift: R.range(-8, 8) });
    const mid = (R.wallSpan(f)[0] + R.wallSpan(f)[1]) / 2;
    R.sign(f, mid, Math.min(R.height - 4, 9), ['REACTOR ' + R.plan.sector, 'AUTHORISED ONLY'], {
      size: 0.7, color: COL.red, emis: 1.3, margin: 0.2,
    });
  }
  const c = R.fitWall(R.pick([0, 1, 4, 5]), 'console', { s: [3.6, 1.9, 1.1], gap: 1.5, color: COL.cyan });
  if (c) R.poi('telemetry', R.at(c, 0, 1.4, -0.2), R.front(c), {});
  R.emitter('reactor', [kx, R.y0 + top * 0.5, kz], { r: 60 });
}

function control(R) {
  const f = R.bareWalls()[0] ?? 5;
  const wl = WALLS.find((w) => w.f === f);
  const [t0, t1] = R.wallSpan(f);
  const mid = (t0 + t1) / 2;
  // Note: a bank of screens fills the bare wall; operators sit in rows facing it.
  const len = Math.min(R.wallLen(f) - 3, 24);
  const nScr = Math.max(2, Math.round(len / 4));
  for (let i = 0; i < nScr; i++) {
    const t = mid - len / 2 + ((i + 0.5) / nScr) * len;
    R.poster(f, t, 4.6, SP.SCREEN, len / nScr - 0.3, 3.0, { tint: i % 3 === 2 ? COL.amber : COL.green, emis: 1.4 });
  }
  const spot = (u, dist) => (f < 2 ? [R.wallPos(f) + wl.n[0] * dist, mid + u] : [mid + u, R.wallPos(f) + wl.n[2] * dist]);
  const per = Math.max(2, Math.min(5, Math.floor((len - 2) / 4)));
  for (let rI = 0; rI < 2; rI++) {
    for (let i = 0; i < per; i++) {
      const [x, z] = spot(-((per - 1) / 2) * 4 + i * 4, 6.5 + rI * 4.6);
      const it = R.put('console', x, z, wl.yaw, { s: [3.0, 1.9, 1.1], gap: 1.0, color: rI ? COL.green : COL.blue });
      if (!it) continue;
      const q = R.at(it, 0, 0, 1.3);
      R.put('chair', q[0], q[2], (it.yaw + 2) & 3, { gap: 0, tint: PAL.cloth[1] });
      if (rI === 0 && i === 1) R.poi('telemetry', R.at(it, 0, 1.4, -0.2), R.front(it), {});
      if (rI === 1 && i === 0) R.poi('intercom', R.at(it, 0, 1.4, -0.2), R.front(it), {});
    }
  }
  for (const g of [0, 1, 4, 5]) {
    if (g === f) continue;
    R.wallRun(g, 'rack', R.wallSpan(g)[0] + 4, R.wallSpan(g)[1] - 4, 2.0, { s: [0.85, 2.3, 0.9], gap: 0.1 });
  }
  lampGrid(R, { y: Math.min(5, R.height - 2.2), spacing: 11, i: 1.8, r: 20, c: [0.55, 0.75, 1.0] });
  R.glow(f < 2 ? [R.wallPos(f) + wl.n[0] * 3, R.y0 + 4.6, mid] : [mid, R.y0 + 4.6, R.wallPos(f) + wl.n[2] * 3], {
    c: COL.green, i: 1.4, r: 18, n: wl.n,
  });
  R.emitter('relay', [R.cx, R.y0 + 2, R.cz], { r: 20 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 30 });
}

function observatory(R) {
  const f = R.bareWalls()[0] ?? 5;
  const span = R.wallSpan(f);
  const mid = (span[0] + span[1]) / 2;
  R.window(f, mid, R.height * 0.5, Math.min(R.wallLen(f) - 4, 22), Math.min(R.height - 3, 10), { bars: 4, frame: 0.35, sill: true });
  const w = R.wallPos(f);
  const n = f < 2 ? [f === 0 ? -1 : 1, 0, 0] : [0, 0, f === 4 ? -1 : 1];
  R.glow([f < 2 ? w + n[0] * 3 : mid, R.y0 + R.height * 0.5, f < 2 ? mid : w + n[2] * 3], {
    c: [0.45, 0.62, 1.0], i: 2.4, r: 30, n, style: STYLE.STATIC,
  });
  const tx = f < 2 ? w + n[0] * 8 : mid;
  const tz = f < 2 ? mid : w + n[2] * 8;
  const tele = R.put('telescope', tx, tz, yawToward(-n[0], -n[2]), { gap: 2, s: [2.4, 3.2, 2.4] });
  if (tele) {
    R.poi('window', R.at(tele, 0, 1.8, 0), n, { r: 9 });
    R.hang(tx, tz, 4.5, { c: [0.6, 0.75, 1.0], i: 1.8, r: 14, failMul: 0.5 });
  }
  for (const g of [0, 1, 4, 5]) {
    if (g === f) continue;
    const d = R.fitWall(g, 'desk', { crt: true, lamp: COL.green, papers: true, gap: 1, shift: R.range(-6, 6) });
    if (d && R.chance(0.5)) R.poi('telemetry', R.at(d, 0, 0.9, 0), R.front(d), {});
  }
  lampGrid(R, { y: Math.min(4.6, R.height - 2.2), spacing: 14, i: 0.95, r: 16, c: [0.62, 0.74, 1.0] });
  scatter(R, 'chair', 2, { margin: 2, gap: 1 });
  R.emitter('hum', [R.cx, R.y0 + 3, R.cz], { r: 24 });
}

export const WORK = {
  hangar, junction, valves, cargo, reactor, control, observatory,
};
