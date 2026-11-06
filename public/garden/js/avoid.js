// Note: shared overlap avoidance: keep-out rects per building, mover steering and the end-of-tick resolve; pure, no three import.

import { N } from './config.js';
import { KEEP } from './footprints.js';
import { buildingYaw } from './spots.js';
import { linkPos } from './links.js';
import { cidx, inB } from './island.js';

// Note: body radii in cells; the overlap check uses the same table.
export const RAD = { folk: 0.17, dog: 0.2, hen: 0.13, sheep: 0.22 };
const walkableLink = (l) => l.state === 'done' && l.pts && (l.type === 'vine' || l.type === 'ropebridge');
const kindOf = (o) => o.kind || 'folk';
export const radOf = (o) => RAD[kindOf(o)] || 0.17;

// Note: counters for dev checks; they never reach a save.
export const AV = { nudge: 0, rect: 0, pass: 0, wait: 0, side: 0, shove: 0, thru: 0 };

// Note: buildings a mover may stand on or in (docks, built halls and stairs, doodles).
export const passable = (b) => b.id === 'dock' || b.id === 'stairs' || (b.id === 'hall' && b.built) || (b.id === 'art' && b.kind === 'doodle');

const FRONT_CLIP = 0.25;
const MARGIN = 0.03;

// Note: keep-out rect of one building in island cell units, or null; the front is clipped so the door cell and the S/C/W stand points stay free.
function rectOf(isl, b) {
  if (!b || b.gone || passable(b)) return null;
  const size = b.size; const half = size / 2;
  let x0 = -half; let z0 = -half; let x1 = half; let z1 = half;
  const tbl = KEEP[b.id];
  if (tbl && b.built) {
    const r = tbl[Math.max(0, Math.min(tbl.length - 1, b.flourish | 0))];
    x0 = Math.min(x0, r[0]); z0 = Math.min(z0, r[1]); x1 = Math.max(x1, r[2]); z1 = Math.max(z1, r[3]);
    z1 = Math.max(half, Math.min(z1, half + FRONT_CLIP));
  }
  let yaw = 0;
  try { yaw = buildingYaw(isl, b); } catch (e) { yaw = 0; }
  const s = Math.sin(yaw); const c = Math.cos(yaw);
  const cx = b.x + half; const cz = b.y + half;
  let X0 = 1e9; let Z0 = 1e9; let X1 = -1e9; let Z1 = -1e9;
  for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const wx = cx + lx * c + lz * s; const wz = cz - lx * s + lz * c;
    X0 = Math.min(X0, wx); X1 = Math.max(X1, wx); Z0 = Math.min(Z0, wz); Z1 = Math.max(Z1, wz);
  }
  return { x0: X0, z0: Z0, x1: X1, z1: Z1, b };
}

const cache = new WeakMap();
const EMPTY = [];
function sigOf(isl) {
  let h = isl.buildings.length;
  for (const b of isl.buildings) {
    if (!b || b.gone) continue;
    h = (Math.imul(h, 31) + b.x * 7 + b.y * 13 + (b.built ? 3 : 0) + (b.flourish | 0) * 5 + b.id.length * 17 + b.id.charCodeAt(0)) | 0;
  }
  return h;
}

// Note: rects plus a per-cell bucket; rebuilt when a building appears, finishes, grows a tier or goes.
export function keepRects(isl) {
  const sig = sigOf(isl);
  let c = cache.get(isl);
  if (c && c.sig === sig) return c;
  const rects = [];
  for (const b of isl.buildings) { const r = rectOf(isl, b); if (r) rects.push(r); }
  const grid = new Array(N * N).fill(null);
  for (const r of rects) {
    for (let j = Math.floor(r.z0 - 0.01); j <= Math.floor(r.z1 + 0.01); j++) for (let i = Math.floor(r.x0 - 0.01); i <= Math.floor(r.x1 + 0.01); i++) {
      if (!inB(i, j)) continue;
      const k = cidx(i, j);
      if (!grid[k]) grid[k] = [];
      grid[k].push(r);
    }
  }
  c = { sig, rects, grid };
  cache.set(isl, c);
  return c;
}

export function rectsNear(isl, x, z) {
  const i = Math.floor(x); const j = Math.floor(z);
  if (!inB(i, j)) return EMPTY;
  return keepRects(isl).grid[cidx(i, j)] || EMPTY;
}

// Note: the rect holding a point; own is a home building whose rect does not count (pen and coop interiors).
export function hitRect(isl, x, z, own) {
  const l = rectsNear(isl, x, z);
  for (let k = 0; k < l.length; k++) {
    const r = l[k];
    if (r.b === own) continue;
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r;
  }
  return null;
}

// Note: a cell a mover may be in: walkable, or inside its own home footprint.
function cellOk(isl, o, i, j) {
  if (isl.walkable(i, j)) return true;
  const h = o.home;
  return !!(h && typeof h === 'object' && !h.gone && i >= h.x && i < h.x + h.size && j >= h.y && j < h.y + h.size);
}

// Note: move a point out of the keep-out rects; null when it is already clear or no clear spot is near.
export function fixPoint(isl, x, z, own) {
  let px = x; let pz = z; let moved = false;
  for (let it = 0; it < 4; it++) {
    const r = hitRect(isl, px, pz, own);
    if (!r) return moved ? [px, pz] : null;
    const cand = [[r.x0 - MARGIN, pz, px - r.x0], [r.x1 + MARGIN, pz, r.x1 - px], [px, r.z0 - MARGIN, pz - r.z0], [px, r.z1 + MARGIN, r.z1 - pz]].sort((a, b) => a[2] - b[2]);
    let done = false;
    for (const [nx, nz] of cand) {
      const ci = Math.floor(px); const cj = Math.floor(pz); const ni = Math.floor(nx); const nj = Math.floor(nz);
      if (!inB(ni, nj) || hitRect(isl, nx, nz, own)) continue;
      if (ni !== ci || nj !== cj) {
        if (!isl.walkable(ni, nj)) continue;
        if (!isl.stepOk(ci, cj, ni, nj)) continue;
      }
      px = nx; pz = nz; moved = true; done = true;
      break;
    }
    if (!done) return null;
  }
  return hitRect(isl, px, pz, own) ? null : [px, pz];
}

// Note: nearest cell centre a mover can stand on, for nudging folk out of new fires and buildings.
export function nearestFree(isl, x, z, max = 5) {
  const fi = Math.floor(x); const fj = Math.floor(z);
  for (let r = 0; r <= max; r++) {
    let best = null; let bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = fi + di; const j = fj + dj;
      if (!inB(i, j) || !isl.walkable(i, j) || isl.fire[cidx(i, j)] > 0) continue;
      if (isl.reach && !isl.reach[cidx(i, j)]) continue;
      if (hitRect(isl, i + 0.5, j + 0.5, null)) continue;
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z);
      if (d < bd) { bd = d; best = [i + 0.5, j + 0.5]; }
    }
    if (best) return best;
  }
  return null;
}

// Note: whole social groups may stand closer: same social or festival task, courting pairs, strolling pairs, a herder with its herd.
export function sameGroup(a, b) {
  const ka = a.kind; const kb = b.kind;
  if (ka && kb) return !!(a.leader && a.leader === b.leader);
  if (ka || kb) {
    const an = ka ? a : b; const fo = ka ? b : a;
    return !!(an.leader && an.leader === fo.id);
  }
  const ta = a.task; const tb = b.task;
  if (!ta || !tb) return false;
  if (ta.type === tb.type && (ta.type === 'social' || ta.type === 'festival')) return true;
  if (ta.type === 'court' && ta.mate === b.id) return true;
  if (tb.type === 'court' && tb.mate === a.id) return true;
  if (ta.type === 'stroll' && ta.mate === b.id) return true;
  if (tb.type === 'stroll' && tb.mate === a.id) return true;
  if (ta.type === 'follow' && ta.partner && ta.par === b.id) return true;
  if (tb.type === 'follow' && tb.partner && tb.par === a.id) return true;
  return false;
}

// Note: pair distance below which the dev check counts an overlap; groups may stand closer.
export const overlapDist = (a, b) => (radOf(a) + radOf(b)) * (sameGroup(a, b) ? 0.6 : 0.85);

const fixedSeat = (f) => !f.kind && !!(f.task && f.task.seat && (f.anim === 'sit' || f.anim === 'sitEat'));
const asleep = (o) => !o.kind && o.anim === 'sleep';
const STILL = new Set(['idle', 'gaze', 'work', 'plant', 'fish', 'dance', 'shrug', 'slump', 'sit', 'eat', 'sitEat', 'cradle', 'sleep', 'peck', 'graze']);
const standing = (o) => STILL.has(o.anim);
const pinned = (o) => o.ghost || fixedSeat(o) || asleep(o);

const ck = (x, z) => (Math.floor(x) + 2) * 64 + Math.floor(z) + 2;

function cellsOf(list) {
  const cells = new Map();
  for (let k = 0; k < list.length; k++) {
    const o = list[k];
    const key = ck(o.x, o.z);
    const l = cells.get(key);
    if (l) l.push(k); else cells.set(key, [k]);
  }
  return cells;
}

// Note: once per tick, before anybody moves: who is on the ground of each island.
export function prepBodies(world) {
  const by = new Map();
  const add = (o) => {
    let B = by.get(o.isle);
    if (!B) by.set(o.isle, B = { list: [], cells: null });
    B.list.push(o);
  };
  for (const f of world.folk) {
    if (f.link || f.aboard) continue;
    if (f.anim === 'sleep' && f.task && f.task.inHome) continue;
    add(f);
  }
  for (const a of world.animals) {
    if (!RAD[a.kind] || a.hidden || a.link || a.gone) continue;
    add(a);
  }
  // Note: a rider near either end of a walkable link counts as a fixed body on that island, so grounded folk keep clear of the gangway.
  const ghost = (o) => {
    const L = o.link; const l = L.l;
    if (!walkableLink(l)) return;
    const len = Math.max(2, l.len || 2);
    const along = L.t * len;
    for (const [end, near] of [[L.rev ? l.b : l.a, along < 0.8], [L.rev ? l.a : l.b, along > len - 0.8]]) {
      if (!near) continue;
      const isl = world.islands.get(end);
      if (!isl) continue;
      const p = linkPos(l, L.t, L.rev);
      const g = Object.create(o);
      g.x = p.x - isl.wx + N / 2; g.z = p.z - isl.wz + N / 2; g.isle = end; g.ghost = true; g.link = null;
      add(g);
    }
  };
  for (const f of world.folk) if (f.link) ghost(f);
  for (const a of world.animals) if (a.link && RAD[a.kind] && !a.gone) ghost(a);
  for (const B of by.values()) B.cells = cellsOf(B.list);
  world._bod = by;
}

const scratch = [];
function near(B, x, z, out) {
  out.length = 0;
  const ci = Math.floor(x); const cj = Math.floor(z);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const l = B.cells.get((ci + di + 2) * 64 + cj + dj + 2);
    if (l) for (let k = 0; k < l.length; k++) out.push(B.list[l[k]]);
  }
  return out;
}

const waits = new WeakMap();
const OUT = { ux: 0, uz: 0, k: 1, same: true };

// Note: bend the heading (ux, uz) of a walker so the step keeps clear of other bodies and keep-out rects; k = 0 means wait.
export function steer(world, isl, m, ux, uz, step, dt) {
  OUT.ux = ux; OUT.uz = uz; OUT.k = 1; OUT.same = true;
  const B = world._bod && world._bod.get(m.isle);
  if (!B) return OUT;
  let st = waits.get(m);
  if (st && st.ign > 0) { st.ign -= dt; if (st.push > 0) { st.push -= dt; st.ux = ux; st.uz = uz; } return OUT; }
  const nb = near(B, m.x, m.z, scratch);
  if (nb.length < 2) return OUT;
  const rm = radOf(m);
  const own = m.home && typeof m.home === 'object' ? m.home : null;
  const ci = Math.floor(m.x); const cj = Math.floor(m.z);
  let first = null;
  const blocked = (px, pz) => {
    let hit = null;
    for (let k = 0; k < nb.length; k++) {
      const o = nb[k];
      if (o === m || sameGroup(m, o)) continue;
      const need = (rm + radOf(o)) * 1.1 + 0.02;
      const dn = Math.hypot(px - o.x, pz - o.z);
      if (dn < need && dn < Math.hypot(m.x - o.x, m.z - o.z) - 1e-4) { hit = o; break; }
    }
    return hit;
  };
  const cellBad = (px, pz) => {
    const ni = Math.floor(px); const nj = Math.floor(pz);
    // Note: cells of the own pen or coop are not walkable, so only height-check steps onto walkable cells.
    if ((ni !== ci || nj !== cj) && (!cellOk(isl, m, ni, nj) || (isl.walkable(ni, nj) && !isl.stepOk(ci, cj, ni, nj)))) return true;
    return !!(hitRect(isl, px, pz, own) && !hitRect(isl, m.x, m.z, own));
  };
  first = blocked(m.x + ux * step, m.z + uz * step);
  if (!first) { if (st && st.w > 0) st.w = Math.max(0, st.w - dt * 2); return OUT; }
  if (!st) waits.set(m, st = { w: 0, ign: 0, push: 0, ux: 0, uz: 0 });
  // Note: a blocked walker turns pusher after a short while: it shoves the obstacle aside or squeezes past it, so nobody livelocks.
  const goPush = () => { st.w = 0; st.ign = 1.2; st.push = 1.2; st.ux = ux; st.uz = uz; AV.pass++; return OUT; };
  const wx = first.x - m.x; const wz = first.z - m.z;
  const sg = ux * wz - uz * wx >= 0 ? 1 : -1;
  for (const [ang, kk] of [[0.7, 1], [-0.7, 1], [1.4, 0.9], [-1.4, 0.9]]) {
    const a = ang * sg;
    const c = Math.cos(a); const s = Math.sin(a);
    const vx = ux * c + uz * s; const vz = -ux * s + uz * c;
    const px = m.x + vx * step * kk; const pz = m.z + vz * step * kk;
    if (blocked(px, pz) || cellBad(px, pz)) continue;
    OUT.ux = vx; OUT.uz = vz; OUT.k = kk; OUT.same = false;
    AV.side++;
    // Note: sidesteps that keep failing to get anywhere count as a slow wait.
    st.w += dt * 0.35;
    if (st.w > 0.6) return goPush();
    return OUT;
  }
  st.w += dt;
  AV.wait++;
  if (st.w > 0.5) return goPush();
  OUT.k = 0; OUT.same = false;
  return OUT;
}

// Note: the walker is pushing while its wait state says so and it is not standing still.
function pusherOf(o) {
  const st = waits.get(o);
  return st && st.push > 0 && !standing(o) ? st : null;
}

// Note: shove the obstacle sideways out of the pusher's heading; false when it cannot move, then the pusher squeezes past.
function shove(isl, p, v, st, d, hard) {
  if (pinned(v)) return false;
  const h = Math.hypot(st.ux, st.uz) || 1;
  const hx = st.ux / h; const hz = st.uz / h;
  let px = -hz; let pz = hx;
  if ((v.x - p.x) * px + (v.z - p.z) * pz < 0) { px = -px; pz = -pz; }
  const amt = Math.max(hard - d, 0) * 1.5 + 0.1;
  for (const f of [1, -1]) {
    const mx = (px * f + hx * 0.3) * amt; const mz = (pz * f + hz * 0.3) * amt;
    if (tryMove(isl, v, v.x + mx, v.z + mz)) { AV.shove++; return true; }
  }
  return false;
}

function tryMove(isl, o, nx, nz) {
  if (tryMove1(isl, o, nx, nz)) return true;
  // Note: slide along the blocking edge when the straight push is refused.
  return tryMove1(isl, o, nx, o.z) || tryMove1(isl, o, o.x, nz);
}

function tryMove1(isl, o, nx, nz) {
  const ci = Math.floor(o.x); const cj = Math.floor(o.z); const ni = Math.floor(nx); const nj = Math.floor(nz);
  const own = o.home && typeof o.home === 'object' ? o.home : null;
  if (ni !== ci || nj !== cj) {
    if (!cellOk(isl, o, ni, nj) || !isl.stepOk(ci, cj, ni, nj)) return false;
  }
  if (hitRect(isl, nx, nz, own) && !hitRect(isl, o.x, o.z, own)) return false;
  o.x = nx; o.z = nz;
  return true;
}

// Note: end of tick: free movers from cells that became fire or building, ease standers apart, hard-separate every pair, then clear the keep-out rects.
export function resolveBodies(world, dt) {
  // Note: rebuilt here because riders boarded or landed during this tick.
  prepBodies(world);
  for (const [id, B] of world._bod) {
    const isl = world.islands.get(id);
    if (!isl) continue;
    const list = B.list;
    const idx = new Map();
    for (let n = 0; n < list.length; n++) idx.set(list[n], n);
    for (let n = 0; n < list.length; n++) {
      const o = list[n];
      const ci = Math.floor(o.x); const cj = Math.floor(o.z);
      if (!inB(ci, cj)) continue;
      const bad = !cellOk(isl, o, ci, cj) || isl.fire[cidx(ci, cj)] > 0;
      if (!bad) continue;
      const t = nearestFree(isl, o.x, o.z, 5);
      if (!t) continue;
      const dx = t[0] - o.x; const dz = t[1] - o.z; const d = Math.hypot(dx, dz) || 1;
      const sp = Math.min(d, 8 * dt);
      o.x += dx / d * sp; o.z += dz / d * sp;
      AV.nudge++;
    }
    if (list.length > 1) {
      for (let pass = 0; pass < 2; pass++) {
        B.cells = cellsOf(list);
        for (let n = 0; n < list.length; n++) {
          const a = list[n];
          const nb = near(B, a.x, a.z, scratch);
          for (let q = 0; q < nb.length; q++) {
            const b = nb[q];
            if (b === a || idx.get(b) < n) continue;
            const dx0 = a.x - b.x; const dz0 = a.z - b.z;
            const d = Math.hypot(dx0, dz0);
            const g = sameGroup(a, b);
            const hard = (radOf(a) + radOf(b)) * (g ? 0.75 : 1.0);
            let soft = 0;
            if (!pass && standing(a) && standing(b)) {
              const dog = a.kind === 'dog' || b.kind === 'dog';
              if (!a.kind && !b.kind) soft = g ? 0.36 : 0.5;
              else if (dog) soft = g ? 0.45 : 0.6;
            }
            if (d >= Math.max(hard, soft)) continue;
            let ux; let uz;
            if (d < 0.02) { const h = ((a.id * 31 + b.id * 17) % 628) / 100; ux = Math.cos(h); uz = Math.sin(h); } else { ux = dx0 / d; uz = dz0 / d; }
            const push = Math.max(hard - d, 0) + Math.max(soft - Math.max(d, hard), 0) * Math.min(1, dt * 2.5) * 0.5;
            if (push <= 0) continue;
            const pa = pinned(a); const pb = pinned(b);
            if (pa && pb) continue;
            const ua = pusherOf(a); const ub = pusherOf(b);
            if (ua || ub) {
              // Note: of two pushers the lower id shoves; a victim that cannot move is passed through.
              const aPush = ua && (!ub || (a.id | 0) <= (b.id | 0));
              if (!shove(isl, aPush ? a : b, aPush ? b : a, aPush ? ua : ub, d, hard)) AV.thru++;
              continue;
            }
            const wa = pa ? 0 : 1; const wb = pb ? 0 : 1;
            const ma = push * wa / (wa + wb); const mb = push - ma;
            let okA = true; let okB = true;
            if (wa) okA = tryMove(isl, a, a.x + ux * ma, a.z + uz * ma);
            if (wb) okB = tryMove(isl, b, b.x - ux * mb, b.z - uz * mb);
            if (wa && !okA && wb) tryMove(isl, b, b.x - ux * ma, b.z - uz * ma);
            else if (wb && !okB && wa) tryMove(isl, a, a.x + ux * mb, a.z + uz * mb);
          }
        }
      }
    }
    for (let n = 0; n < list.length; n++) {
      const o = list[n];
      if (fixedSeat(o)) continue;
      const own = o.home && typeof o.home === 'object' ? o.home : null;
      const p = fixPoint(isl, o.x, o.z, own);
      if (p) { o.x = p[0]; o.z = p[1]; AV.rect++; }
    }
  }
}
