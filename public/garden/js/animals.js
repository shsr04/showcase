// Note: ambient animals (birds, butterflies, dogs) and livestock (hens, sheep); pure sim, positions are island-local cell units like folk.

import { N } from './config.js';
import { cidx, PK } from './island.js';
import { amountAt } from './sim.js';
import { findPath, nearestWalkable } from './path.js';
import { storehouse, builtOf } from './econ.js';
import { linkPos } from './links.js';
import { steer, hitRect } from './avoid.js';
import { laneBusy } from './flight.js';
import { LINKS } from './config.js';

const R = Math.random;
const TAU = Math.PI * 2;

export const CAPS = { bird: 12, butterfly: 10, dog: 3, hen: 6, sheep: 5, fish: 10 };
const EGG_SECS = 240;
const FEED_SECS = 1440; // Note: one wheat feeds one hen for 24 min, so a full coop eats about 1 wheat per 4 min.
const WOOL_SECS = 360;

// Note: how many of each kind an island wants, from its rung and population.
export function wantOf(world, isl, pop) {
  const rung = isl.rung || 0;
  const n = pop ?? world.folkOn(isl.id).length;
  return {
    bird: rung >= 1 ? Math.min(CAPS.bird, 2 + 2 * rung) : 0,
    butterfly: rung >= 4 ? Math.min(CAPS.butterfly, 5 + 2 * (rung - 4)) + 4 * builtOf(isl, 'glassgarden').length : 0,
    dog: rung >= 2 && n >= 4 ? Math.min(CAPS.dog, Math.ceil(n / 8)) : 0,
  };
}

const freeLand = (isl, i, j) => {
  const c = cidx(i, j);
  return isl.land(i, j) && isl.bld[c] < 0 && isl.water[c] < 0.1 && isl.fire[c] <= 0 && !isl.stone[c] && !isl.plant[c];
};

// Note: null when the island has no free ground at all; after the random tries a scan from a random start finds any left.
function findLand(isl, tries = 14) {
  for (let k = 0; k < tries; k++) {
    const i = Math.floor(R() * N); const j = Math.floor(R() * N);
    if (freeLand(isl, i, j)) return [i, j];
  }
  const s = Math.floor(R() * N * N);
  for (let k = 0; k < N * N; k++) {
    const c = (s + k) % (N * N);
    const i = c % N; const j = Math.floor(c / N);
    if (freeLand(isl, i, j)) return [i, j];
  }
  return null;
}

function pickLand(isl, tries = 14) {
  return findLand(isl, tries) || [N >> 1, N >> 1];
}

// Note: birds favour grown trees; the perch height sits inside the canopy.
const TREE_PERCH = 1.6;
function pickPerch(isl) {
  const trees = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if ((isl.plant[c] === PK.tree || isl.plant[c] === PK.fruittree) && isl.grow[c] >= 0.9 && isl.fire[c] <= 0) trees.push([i, j]);
  }
  if (trees.length && R() < 0.92) { const [i, j] = trees[Math.floor(R() * trees.length)]; return { i, j, alt: TREE_PERCH, tree: true }; }
  const spot = findLand(isl);
  return spot ? { i: spot[0], j: spot[1], alt: 0, tree: false } : null;
}

function make(world, kind, isl, x, z, extra = {}) {
  const a = { id: world.nextAnimal++, kind, isle: isl.id, x, z, alt: 0, face: R() * TAU, state: 'perch', t: R() * 4, anim: 'idle', hidden: false, ...extra };
  world.animals.push(a);
  return a;
}

// Note: slow top-up, one animal per kind per island per call, so they trickle in.
export function topUpAnimals(world) {
  for (const isl of world.islands.values()) {
    if (!isl.revealed) continue;
    const have = { bird: 0, butterfly: 0, dog: 0, hen: 0, sheep: 0, fish: 0 };
    for (const a of world.animals) if (a.isle === isl.id) have[a.kind]++;
    const want = wantOf(world, isl);
    if (have.bird < want.bird && world.night < 0.5) {
      // Note: birds fly in from beyond the island rim.
      const ang = R() * TAU; const r = N * 0.9 + 6;
      const b = make(world, 'bird', isl, N / 2 + Math.cos(ang) * r, N / 2 + Math.sin(ang) * r, { state: 'fly', alt: 7 + R() * 3 });
      // Note: no tree and no free ground means no bird.
      if (!flyToPerch(world, isl, b, 3.4)) { world.animals.pop(); world.nextAnimal--; }
    }
    if (have.butterfly < want.butterfly && world.night < 0.5) {
      // Note: a glass garden keeps up to 4 butterflies inside its walls.
      const gg = builtOf(isl, 'glassgarden').find((g) => world.animals.reduce((n, a) => n + (a.home === g ? 1 : 0), 0) < 4);
      const [i, j] = gg ? [gg.x + 1, gg.y + 1] : pickLand(isl);
      make(world, 'butterfly', isl, i + 0.5, j + 0.5, { state: 'flit', h: R() * TAU, ph: R() * TAU, alt: 1, chk: 0, home: gg || undefined });
    }
    // Note: dogs, hens and sheep never spawn locally: they come by balloon to a pad, or on foot with a herder.
    topUpLivestock(world, isl);
    topUpFish(world, isl, have.fish);
  }
}

function homeAt(isl, x, y) {
  return isl.buildings.find((b) => b && !b.gone && b.built && b.x === x && b.y === y) || null;
}

// Note: hens multiply while fed (two needed); stock of a lost building is removed.
function topUpLivestock(world, isl) {
  for (let k = world.animals.length - 1; k >= 0; k--) {
    const a = world.animals[k];
    if (a.isle === isl.id && a.home && (a.home.gone || !a.home.built)) world.animals.splice(k, 1);
  }
  for (const b of builtOf(isl, 'coop')) {
    let n = 0;
    for (const a of world.animals) if (a.home === b) n++;
    if (n >= 2 && n < CAPS.hen && b.feed > 0.5 && (b.hatchT || 0) <= world.time) {
      b.hatchT = world.time + 120;
      make(world, 'hen', isl, b.door.i + 0.5 + (R() - 0.5), b.door.j + 0.5 + (R() - 0.5), { state: 'idle', wait: R() * 2, home: b, lay: R() * EGG_SECS * 0.5, variant: Math.floor(R() * 4) });
    }
  }
}

// Note: what an arriving balloon can carry for an island: a dog, two hens per bare coop, up to two sheep per pen.
export function cargoFor(world, isl) {
  const out = [];
  const count = (pred) => world.animals.reduce((n, a) => n + (a.isle === isl.id && pred(a) ? 1 : 0), 0);
  const want = wantOf(world, isl);
  if (want.dog > count((a) => a.kind === 'dog') && storehouse(isl)) out.push({ kind: 'dog' });
  for (const b of builtOf(isl, 'coop')) {
    const n = count((a) => a.home === b);
    for (let k = n; k < Math.min(2, CAPS.hen); k++) out.push({ kind: 'hen', home: b });
  }
  for (const b of builtOf(isl, 'pen')) {
    const n = count((a) => a.home === b);
    for (let k = 0; k < Math.min(2, CAPS.sheep - n); k++) out.push({ kind: 'sheep', home: b });
  }
  return out;
}

// Note: cargo steps out at the pad and walks to its coop or pen.
export function unloadCargo(world, ar) {
  const isl = ar.isl;
  const di = ar.pad.door.i; const dj = ar.pad.door.j;
  for (const c of ar.cargo || []) {
    if (c.kind === 'dog') {
      if (wantOf(world, isl).dog > world.animals.filter((a) => a.kind === 'dog' && a.isle === isl.id).length) {
        make(world, 'dog', isl, di + 0.5, dj + 0.5, { state: 'dog', owner: null, path: null, pi: 0, idle: 0, repick: 60 + R() * 90, stuck: 0, mode: null });
        world.emit({ type: 'cargo', isl, i: di, j: dj });
      }
      continue;
    }
    const b = c.home;
    if (!b || b.gone || !b.built) continue;
    const have = world.animals.filter((a) => a.home === b).length;
    if (have >= (c.kind === 'hen' ? CAPS.hen : CAPS.sheep)) continue;
    const gi = c.kind === 'hen' ? b.door.i : Math.floor(b.x + b.size / 2); const gj = c.kind === 'hen' ? b.door.j : Math.floor(b.y + b.size / 2);
    const extra = c.kind === 'hen'
      ? { home: b, lay: R() * EGG_SECS * 0.5, variant: Math.floor(R() * 4) }
      : { home: b, wool: R() * 0.6, variant: Math.floor(R() * 4) };
    const a = make(world, c.kind, isl, di + 0.5 + (R() - 0.5) * 0.6, dj + 0.5 + (R() - 0.5) * 0.6, { state: 'trek', wait: 0, ...extra });
    a.path = findPath(isl, di, dj, gi, gj, { adjacent: true }); a.pi = 0;
    world.emit({ type: 'cargo', isl, i: di, j: dj });
  }
}

// Note: livestock off the balloon follow their path at a slow walk; without a path they settle where they stand.
function stepTrek(world, isl, a, dt) {
  if (!a.path || a.pi >= a.path.length) { a.state = 'idle'; a.wait = 0.5; a.anim = 'idle'; a.path = null; return; }
  const [ci, cj] = a.path[a.pi];
  const tx = ci + 0.5; const tz = cj + 0.5;
  const dx = tx - a.x; const dz = tz - a.z; const d = Math.hypot(dx, dz);
  const sp = (a.kind === 'hen' ? 0.8 : 0.6) * dt;
  const sv = steer(world, isl, a, dx / (d || 1), dz / (d || 1), Math.min(d, sp), dt);
  if (sv.k === 0) { a.anim = 'idle'; return; }
  if (sv.same && d <= sp) { a.x = tx; a.z = tz; a.pi++; } else { const mv = Math.min(d, sp) * sv.k; a.x += sv.ux * mv; a.z += sv.uz * mv; a.face = Math.atan2(sv.ux, sv.uz); }
  a.anim = 'walk';
}


// Note: herds. A tender leads up to three animals over a finished walkable link to an island without a pad.
const HERD_MAX = 3;
const walkableLink = (l) => l.state === 'done' && l.pts && (l.type === 'vine' || l.type === 'ropebridge');
const inHerd = (a) => a.state === 'herd';

function spares(world, src) {
  const out = [];
  const on = (pred) => world.animals.filter((a) => a.isle === src.id && !inHerd(a) && a.state !== 'trek' && pred(a));
  for (const b of builtOf(src, 'coop')) out.push(...on((a) => a.home === b && a.kind === 'hen').slice(2));
  for (const b of builtOf(src, 'pen')) out.push(...on((a) => a.home === b && a.kind === 'sheep').slice(1));
  out.push(...on((a) => a.kind === 'dog').slice(1));
  return out;
}

function slotsFor(world, dst) {
  const out = [];
  const have = (pred) => world.animals.reduce((n, a) => n + (pred(a) ? 1 : 0), 0);
  const inbound = (pred) => have((a) => inHerd(a) && a.dest && a.dest.isle === dst.id && pred(a));
  for (const [id, kind] of [['coop', 'hen'], ['pen', 'sheep']]) {
    for (const b of builtOf(dst, id)) {
      const n = have((a) => a.home === b) + inbound((a) => a.dest.home === b);
      for (let k = n; k < 2; k++) out.push({ kind, home: b });
    }
  }
  const dogs = have((a) => a.kind === 'dog' && a.isle === dst.id) + inbound((a) => a.kind === 'dog');
  if (storehouse(dst) && wantOf(world, dst).dog > dogs) out.push({ kind: 'dog', home: null });
  return out;
}

export function herdPlan(world, src) {
  const sp = spares(world, src);
  if (!sp.length) return null;
  if (!world.herdSince) world.herdSince = new Map();
  for (const l of world.links) {
    if (!walkableLink(l) || (l.a !== src.id && l.b !== src.id)) continue;
    const dst = world.islands.get(l.a === src.id ? l.b : l.a);
    if (!dst || !dst.revealed || builtOf(dst, 'pad').length) continue;
    const members = []; const used = new Set();
    for (const s of slotsFor(world, dst)) {
      if (members.length >= HERD_MAX) break;
      const a = sp.find((x) => !used.has(x) && x.kind === s.kind);
      if (!a) continue;
      used.add(a); members.push({ a, dest: { isle: dst.id, home: s.home, kind: s.kind } });
    }
    const key = `${src.id}>${dst.id}`;
    if (!members.length) { world.herdSince.delete(key); continue; }
    if (!world.herdSince.has(key)) world.herdSince.set(key, world.time);
    if (members.length < 2 && world.time - world.herdSince.get(key) < 60) continue;
    return { link: l, dst, members, key };
  }
  return null;
}

// Note: plans are cached for a few seconds per island so idle tenders do not recompute them.
export function herdPlanCached(world, src) {
  if (!world.herdCache) world.herdCache = new Map();
  const c = world.herdCache.get(src.id);
  if (c && world.time - c.t < 5) return c.plan;
  const plan = herdPlan(world, src);
  world.herdCache.set(src.id, { t: world.time, plan });
  return plan;
}

// Note: returns false when no member is left to lead (another tender took them).
export function reserveHerd(world, f, plan) {
  plan.members = plan.members.filter((m) => !m.a.gone && !inHerd(m.a) && world.animals.includes(m.a));
  if (!plan.members.length) return false;
  if (world.herdSince) world.herdSince.delete(plan.key);
  if (world.herdCache) world.herdCache.delete(f.isle);
  plan.members.forEach((m, k) => {
    const a = m.a;
    a.src = a.home || null; a.home = null; a.dest = m.dest; a.state = 'herd'; a.leader = f.id; a.slot = k; a.go = false;
    a.path = null; a.mode = null; a.owner = null; a.link = null; a.anim = 'idle';
  });
  return true;
}

function dogFields(a) { Object.assign(a, { state: 'dog', owner: null, path: null, pi: 0, idle: 0, repick: 60 + R() * 90, stuck: 0, mode: null }); }

// Note: an animal that has not crossed yet goes back to its old home.
function releaseOne(a) {
  a.leader = null; a.dest = null; a.go = false; a.link = null;
  if (a.kind === 'dog') dogFields(a);
  else { a.state = 'idle'; a.wait = 1; a.path = null; a.home = a.src; }
  a.src = null;
}

export function releaseHerd(world, f, plan) {
  for (const m of plan.members) if (m.a.leader === f.id && !m.a.link && !m.a.gone) releaseOne(m.a);
}

export function herdMembers(plan, f) { return plan.members.filter((m) => m.a.leader === f.id && !m.a.gone && !m.a.link); }

// Note: members within reach board behind the leader, one body length apart.
export function boardHerd(world, f, plan, link, fromId) {
  const rev = link.b === fromId; const len = Math.max(2, link.len);
  let k = 0;
  for (const m of plan.members) {
    const a = m.a;
    if (a.leader !== f.id || a.gone || a.link) continue;
    if (Math.hypot(a.x - f.x, a.z - f.z) > 3.5) { releaseOne(a); continue; }
    k++;
    a.link = { l: link, t: -k * 0.9 / len, rev }; a.anim = 'walk';
  }
  return k;
}

function stepHerded(world, isl, a, dt, byId) {
  if (a.link) {
    const L = a.link;
    // Note: herded animals wait at the station with their leader while an arrival crosses the balloon lane.
    if (L.t <= 0 && L.l.type === 'balloon' && laneBusy(world, L.l)) { a.anim = 'idle'; return; }
    if (world.ahead(L, a)) { a.anim = 'idle'; return; }
    L.t += dt * (LINKS[L.l.type]?.speed || 1) * 1.7 * (a.kind === 'dog' ? 1 : 0.9) / Math.max(2, L.l.len);
    const t0 = Math.min(1, Math.max(0, L.t));
    const p0 = linkPos(L.l, t0, L.rev); const p1 = linkPos(L.l, Math.min(1, t0 + 0.03), L.rev);
    if (Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1e-4) a.face = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    a.anim = L.t < 0 ? 'idle' : 'walk';
    if (L.t >= 1) landHerded(world, a);
    return;
  }
  const f = byId.get(a.leader);
  if (!f) { releaseOne(a); return; }
  const tr = f.task && f.task.type === 'herd' ? f.task.trail : null;
  let tx = f.x; let tz = f.z; let sp = 0;
  if (a.go === 'gather') { sp = 1.1; }
  else if (a.go === 'follow') {
    sp = 1.6;
    if (tr && tr.length) { const p = tr[Math.min(tr.length - 1, 2 + 2 * a.slot)]; tx = p[0]; tz = p[1]; }
  }
  const dx = tx - a.x; const dz = tz - a.z; const d = Math.hypot(dx, dz);
  if (!sp || d < (a.go === 'gather' ? 0.9 + 0.3 * a.slot : 0.15)) { a.anim = 'idle'; return; }
  const step = Math.min(d, sp * dt);
  const sv = steer(world, isl, a, dx / d, dz / d, step, dt);
  if (sv.k === 0) { a.anim = 'idle'; return; }
  a.x += sv.ux * step * sv.k; a.z += sv.uz * step * sv.k; a.face = Math.atan2(sv.ux, sv.uz); a.anim = 'walk';
}

// Note: on landing the animal trots to its new coop or pen; a lost home means any free home of its kind, else it is gone.
function landHerded(world, a) {
  const L = a.link; const to = world.islands.get(L.rev ? L.l.a : L.l.b);
  const an = L.rev ? L.l.ai : L.l.bi;
  a.isle = to.id; a.x = an.i + 0.5 + (R() - 0.5) * 0.5; a.z = an.j + 0.5 + (R() - 0.5) * 0.5; a.link = null; a.leader = null;
  const d = a.dest; a.dest = null; a.src = null;
  world.emit({ type: 'cargo', isl: to, i: an.i, j: an.j });
  if (a.kind === 'dog') { dogFields(a); return; }
  let b = d && d.home && !d.home.gone && d.home.built ? d.home : null;
  if (!b) b = builtOf(to, a.kind === 'hen' ? 'coop' : 'pen').find((c) => world.animals.reduce((n, o) => n + (o.home === c ? 1 : 0), 0) < 2) || null;
  if (!b) { a.gone = true; return; }
  const gi = a.kind === 'hen' ? b.door.i : Math.floor(b.x + b.size / 2); const gj = a.kind === 'hen' ? b.door.j : Math.floor(b.y + b.size / 2);
  a.home = b; a.state = 'trek'; a.wait = 0;
  a.path = findPath(to, an.i, an.j, gi, gj, { adjacent: true }); a.pi = 0;
}

// Note: lake cells hold fish: one per five cells up to the cap, a small shoal at first, then one more every 25 s.
function lakeCells(isl) {
  const out = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = cidx(i, j); if (isl.mask[c] && isl.water[c] >= 0.3) out.push([i, j]); }
  return out;
}

function topUpFish(world, isl, have) {
  if ((isl.fishT || 0) > world.time) return;
  const cells = lakeCells(isl);
  const want = cells.length < 6 ? 0 : Math.min(CAPS.fish, Math.floor(cells.length / 5));
  if (have >= want) return;
  const n = have === 0 ? Math.min(3, want) : 1;
  for (let k = 0; k < n; k++) {
    const [i, j] = cells[Math.floor(R() * cells.length)];
    make(world, 'fish', isl, i + 0.3 + R() * 0.4, j + 0.3 + R() * 0.4, { state: 'swim', anim: 'swim', alt: Math.max(0.05, isl.water[cidx(i, j)] - 0.14), variant: Math.floor(R() * 4), wait: 0, jumpT: 6 + R() * 30 });
  }
  isl.fishT = world.time + 25;
}

// Note: the nearest fish within r cells of a cell is caught and leaves the lake.
export function catchFish(world, isl, i, j, r = 3.5) {
  let best = -1; let bd = r;
  for (let k = 0; k < world.animals.length; k++) {
    const a = world.animals[k];
    if (a.kind !== 'fish' || a.isle !== isl.id) continue;
    const d = Math.hypot(a.x - i - 0.5, a.z - j - 0.5);
    if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return false;
  const a = world.animals[best];
  world.animals.splice(best, 1);
  if (isl.fishPos) isl.fishPos = isl.fishPos.filter((p) => p !== a);
  world.emit({ type: 'splash', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
  return true;
}

// Note: fish swim in short straight legs inside the water, rest now and then, and leap out of the lake once in a while.
function stepFish(world, isl, a, dt) {
  if (isl.fishStamp !== world.time) { isl.fishStamp = world.time; isl.fishPos = []; }
  isl.fishPos.push(a);
  a.t += dt;
  const c = cidx(Math.floor(a.x), Math.floor(a.z));
  const w = isl.water[c];
  if (!isl.mask[c] || w < 0.15) { a.gone = true; return; }
  const base = Math.max(0.05, w - 0.14);
  if (a.state === 'jump') {
    a.k += dt / 0.8;
    if (a.k >= 1) { a.state = 'swim'; a.wait = 0; a.jumpT = 25 + R() * 50; a.alt = base; world.emit({ type: 'splash', isl, i: Math.floor(a.x), j: Math.floor(a.z) }); return; }
    a.alt = base + Math.sin(a.k * Math.PI) * 0.5;
    a.x += Math.sin(a.face) * 0.6 * dt; a.z += Math.cos(a.face) * 0.6 * dt;
    if (!isl.mask[cidx(Math.floor(a.x), Math.floor(a.z))] || isl.water[cidx(Math.floor(a.x), Math.floor(a.z))] < 0.2) { a.x -= Math.sin(a.face) * 0.6 * dt; a.z -= Math.cos(a.face) * 0.6 * dt; }
    return;
  }
  a.alt += (base - a.alt) * Math.min(1, dt * 3);
  a.jumpT -= dt;
  if (a.jumpT <= 0 && w >= 0.5 && a.state === 'swim') {
    a.state = 'jump'; a.k = 0; a.anim = 'jump'; a.face = R() * TAU;
    world.emit({ type: 'splash', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
    return;
  }
  if (a.state === 'rest') {
    a.anim = 'idle'; a.wait -= dt;
    if (a.wait <= 0) a.state = 'swim';
    return;
  }
  if (a.tx === undefined || a.wait > 0) {
    a.wait = 0;
    for (let k = 0; k < 8; k++) {
      const ang = R() * TAU; const d = 1 + R() * 3;
      const tx = a.x + Math.cos(ang) * d; const tz = a.z + Math.sin(ang) * d;
      const tc = cidx(Math.floor(tx), Math.floor(tz));
      if (tx > 0 && tz > 0 && tx < N && tz < N && isl.mask[tc] && isl.water[tc] >= 0.25) { a.tx = tx; a.tz = tz; break; }
    }
    if (a.tx === undefined) { a.state = 'rest'; a.wait = 2; return; }
  }
  const dx = a.tx - a.x; const dz = a.tz - a.z; const d = Math.hypot(dx, dz);
  if (d < 0.1) { a.tx = undefined; if (R() < 0.5) { a.state = 'rest'; a.wait = 0.8 + R() * 2.5; } return; }
  const sp = Math.min(d, 0.5 * dt);
  const nx = a.x + dx / d * sp; const nz = a.z + dz / d * sp;
  const nc = cidx(Math.floor(nx), Math.floor(nz));
  if (!isl.mask[nc] || isl.water[nc] < 0.22) { a.tx = undefined; return; }
  a.x = nx; a.z = nz; a.face = Math.atan2(dx, dz); a.anim = 'swim';
}

function flyTo(a, i, j, speed, talt = 0) {
  a.sx = a.x; a.sz = a.z; a.salt = a.alt;
  a.tx = i + 0.5 + (R() - 0.5) * 0.5; a.tz = j + 0.5 + (R() - 0.5) * 0.5; a.talt = talt;
  a.dist = Math.max(0.5, Math.hypot(a.tx - a.x, a.tz - a.z));
  a.k = 0; a.speed = speed; a.state = 'fly'; a.anim = 'fly';
  a.face = Math.atan2(a.tx - a.x, a.tz - a.z);
}

// Note: false when the island offers no tree and no free ground; the caller then sends the bird away.
function flyToPerch(world, isl, a, speed) {
  const p = pickPerch(isl);
  if (!p) return false;
  flyTo(a, p.i, p.j, speed, p.alt);
  a.perch = p.tree ? [p.i, p.j] : null;
  return true;
}

function flyAway(a) {
  a.perch = null;
  const ang = R() * TAU; const r = N * 1.3 + 25;
  a.sx = a.x; a.sz = a.z; a.salt = a.alt;
  a.tx = N / 2 + Math.cos(ang) * r; a.tz = N / 2 + Math.sin(ang) * r; a.talt = 14;
  a.dist = Math.hypot(a.tx - a.x, a.tz - a.z);
  a.k = 0; a.speed = 3.6; a.state = 'away'; a.anim = 'fly';
  a.face = Math.atan2(a.tx - a.x, a.tz - a.z);
}

function stepBird(world, isl, a, dt, movers) {
  a.t += dt;
  if (a.state === 'gone') {
    if (world.night < 0.35 && (a.wait -= dt) <= 0) {
      const ang = R() * TAU; const r = N * 1.3 + 25;
      a.x = N / 2 + Math.cos(ang) * r; a.z = N / 2 + Math.sin(ang) * r; a.alt = 12;
      // Note: an island with nowhere to sit keeps the bird away; it tries again later.
      if (flyToPerch(world, isl, a, 3.4)) a.hidden = false; else a.wait = 20 + R() * 25;
    }
    return;
  }
  if (a.state === 'perch') {
    a.anim = 'idle';
    if (world.night > 0.6 && a.t > 1) { flyAway(a); return; }
    // Note: a lost tree or flames nearby also scare a perched bird off.
    if (a.perch) {
      const c = cidx(a.perch[0], a.perch[1]);
      if ((isl.plant[c] !== PK.tree && isl.plant[c] !== PK.fruittree) || isl.fire[c] > 0) { if (!flyToPerch(world, isl, a, 5.2)) flyAway(a); return; }
    }
    // Note: only walkers right under the perch (or very near on the ground) scare it.
    const scare = a.perch ? 0.9 : 1.3;
    for (const m of movers) {
      if (Math.hypot(m.x - a.x, m.z - a.z) < scare) { if (!flyToPerch(world, isl, a, 5.2)) flyAway(a); return; }
    }
    if (a.t > a.stay) { if (!flyToPerch(world, isl, a, 2.6)) flyAway(a); return; }
    if (world.night < 0.5 && R() < dt * 0.03) world.emit({ type: 'chirp', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
    return;
  }
  // Note: fly / away: straight line with a rise and fall.
  a.k = Math.min(1, a.k + a.speed * dt / a.dist);
  const k = a.k;
  a.x = a.sx + (a.tx - a.sx) * k; a.z = a.sz + (a.tz - a.sz) * k;
  const arc = Math.sin(Math.PI * k) * (1.2 + a.dist * 0.1);
  a.alt = a.salt + (a.talt - a.salt) * k * k * (3 - 2 * k) + arc;
  if (k >= 1) {
    if (a.state === 'away') { a.state = 'gone'; a.hidden = true; a.wait = 2 + R() * 25; }
    else { a.state = 'perch'; a.alt = a.talt; a.t = 0; a.stay = a.perch ? 40 + R() * 80 : 12 + R() * 20; a.anim = 'idle'; }
  }
}

function stepButterfly(world, isl, a, dt) {
  a.t += dt;
  a.chk -= dt;
  if (a.chk <= 0) {
    a.chk = 1;
    a.hidden = world.night > 0.5 || (!a.home && world.weather.events.length > 0 && amountAt(world.weather, isl, 'rain', a.x, a.z) > 0.05);
  }
  if (a.hidden) return;
  a.h += (R() - 0.5) * dt * 6;
  const sp = 0.5 + 0.3 * Math.sin(a.t * 2.3 + a.ph);
  const nx = a.x + Math.sin(a.h) * sp * dt; const nz = a.z + Math.cos(a.h) * sp * dt;
  const g = a.home;
  const inside = g ? nx > g.x + 0.3 && nx < g.x + g.size - 0.3 && nz > g.y + 0.3 && nz < g.y + g.size - 0.3 : isl.land(Math.floor(nx), Math.floor(nz));
  if (inside) { a.x = nx; a.z = nz; } else a.h += Math.PI * (0.6 + R() * 0.8);
  a.face = a.h;
  a.alt = 0.9 + Math.sin(a.t * 1.3 + a.ph) * 0.4;
}

// Note: livestock wander straight (no paths) inside a small area; hens stay close to the coop door when unfed.
function wander(world, isl, a, dt, box, speed) {
  if (a.state === 'idle') {
    a.anim = a.kind === 'hen' ? (a.t % 2 < 1 ? 'peck' : 'idle') : (a.graze ? 'graze' : 'idle');
    a.wait -= dt;
    if (a.wait > 0) return;
    for (let k = 0; k < 6; k++) {
      const tx = box.x0 + R() * (box.x1 - box.x0); const tz = box.z0 + R() * (box.z1 - box.z0);
      if (!isl.walkable(Math.floor(tx), Math.floor(tz)) && !box.free) continue;
      // Note: skip targets inside another building's keep-out rect; the walker could never reach them.
      if (box.free && hitRect(isl, tx, tz, a.home)) continue;
      a.tx = tx; a.tz = tz; a.state = 'walk'; break;
    }
    a.wait = 1 + R() * 3;
    return;
  }
  const dx = a.tx - a.x; const dz = a.tz - a.z; const d = Math.hypot(dx, dz);
  if (d < 0.08) { a.state = 'idle'; a.graze = a.kind === 'sheep' && R() < 0.7; a.wait = 1.5 + R() * 4; return; }
  const step = Math.min(d, speed * dt);
  const sv = steer(world, isl, a, dx / d, dz / d, step, dt);
  if (sv.k === 0) { a.anim = 'idle'; return; }
  const nx = a.x + sv.ux * step * sv.k; const nz = a.z + sv.uz * step * sv.k;
  if (!box.free && !isl.walkable(Math.floor(nx), Math.floor(nz))) { a.state = 'idle'; a.wait = 0.5; return; }
  a.x = nx; a.z = nz; a.face = Math.atan2(sv.ux, sv.uz); a.anim = 'walk';
}

function stepHen(world, isl, a, dt) {
  a.t += dt;
  const b = a.home;
  const fed = b.feed > 0.02;
  const cx = b.door.i + 0.5; const cz = b.door.j + 0.5;
  if (a.rest === undefined) a.rest = R() * 20;
  // Note: hens live in the coop; fed ones scratch near the door in short day trips, the rest stay in at night or when hungry.
  if (a.inside) {
    a.hidden = true; a.anim = 'idle'; a.x = cx; a.z = cz;
    a.rest -= dt;
    if (a.rest <= 0 && fed && world.night < 0.4) { a.inside = false; a.hidden = false; a.going = false; a.rest = 25 + R() * 35; a.state = 'idle'; a.wait = 0.5 + R(); }
  } else {
    a.rest -= dt;
    if (a.rest <= 0 || !fed || world.night > 0.5) a.going = true;
    if (a.going) {
      const dx = cx - a.x; const dz = cz - a.z; const d = Math.hypot(dx, dz);
      if (d < 0.25) { a.inside = true; a.hidden = true; a.going = false; a.rest = 20 + R() * 40; a.state = 'idle'; }
      else {
        const step = Math.min(d, 0.8 * dt);
        const sv = steer(world, isl, a, dx / d, dz / d, step, dt);
        if (sv.k !== 0) { a.x += sv.ux * step * sv.k; a.z += sv.uz * step * sv.k; a.face = Math.atan2(sv.ux, sv.uz); a.anim = 'walk'; } else a.anim = 'idle';
      }
    } else wander(world, isl, a, dt, { x0: cx - 1.4, x1: cx + 1.4, z0: cz - 0.6, z1: cz + 1.6 }, 0.55);
  }
  if (fed) {
    b.feed = Math.max(0, b.feed - dt / FEED_SECS);
    a.lay += dt;
    if (a.lay >= EGG_SECS) {
      a.lay = 0;
      b.eggs = Math.min(8, (b.eggs || 0) + 1);
      world.emit({ type: 'cluck', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
    }
  } else if (R() < dt * 0.01) world.emit({ type: 'cluck', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
}

function stepSheep(world, isl, a, dt) {
  a.t += dt;
  const b = a.home;
  a.wool = Math.min(1, a.wool + dt / WOOL_SECS);
  wander(world, isl, a, dt, { x0: b.x + 0.4, x1: b.x + b.size - 0.4, z0: b.y + 0.4, z1: b.y + b.size - 0.4, free: true }, 0.35);
  if (R() < dt * 0.012) world.emit({ type: 'baa', isl, i: Math.floor(a.x), j: Math.floor(a.z) });
}

function dogGoal(a, i, j, adjacent = true) {
  const si = Math.floor(a.x); const sj = Math.floor(a.z);
  if (a.goal && a.goal[0] === i && a.goal[1] === j && a.path) return;
  if (a.goalT > 0 && a.goal && a.goal[0] === i && a.goal[1] === j) return;
  a.goal = [i, j]; a.goalT = 1.2;
  a.path = findPath(a.isl, si, sj, i, j, { adjacent }); a.pi = 0;
}

function stepDog(world, isl, a, dt, byId) {
  a.t += dt;
  a.isl = isl;
  if (a.goalT > 0) a.goalT -= dt;
  const ci = Math.floor(a.x); const cj = Math.floor(a.z);
  // Note: flames: step to the nearest safe cell.
  if (isl.fire[cidx(ci, cj)] > 0) {
    const n = nearestWalkable(isl, ci, cj, null, 4);
    if (n) { a.x = n[0] + 0.5; a.z = n[1] + 0.5; a.path = null; a.goal = null; }
  }
  // Note: a landing balloon: run to the pad and bark.
  if (a.mode && a.mode.type === 'greet') {
    const m = a.mode;
    if (world.time > m.until) a.mode = null;
    else {
      if (Math.floor(a.x) === m.i && Math.floor(a.z) === m.j) {
        a.anim = 'idle'; a.face = Math.atan2(m.fx - a.x, m.fz - a.z);
        if (world.time >= m.nextBark) { m.nextBark = world.time + 1.6; m.n = (m.n || 0) + 1; if (m.n >= 3) m.until = world.time + 1.5; world.emit({ type: 'bark', isl, i: m.i, j: m.j }); a.barkT = 0.4; }
        return;
      }
      dogGoal(a, m.i, m.j, !isl.walkable(m.i, m.j));
      walkDog(world, a, isl, dt, 2.6);
      return;
    }
  }
  // Note: at a rung-5 festival the dogs parade around the festival place.
  if (isl.festival && isl.rung >= 5 && !a.mode) {
    const at = isl.festival.at;
    a.paradeT = (a.paradeT || 0) - dt;
    if (a.paradeT <= 0 || !a.path || a.pi >= a.path.length) {
      const ang = R() * TAU; const r = 1.5 + R() * 1.5;
      const gi = Math.max(0, Math.min(N - 1, Math.floor(at.i + Math.cos(ang) * r))); const gj = Math.max(0, Math.min(N - 1, Math.floor(at.j + Math.sin(ang) * r)));
      if (isl.walkable(gi, gj)) { a.goal = null; dogGoal(a, gi, gj, false); a.paradeT = 2 + R() * 2; if (R() < 0.15) { world.emit({ type: 'bark', isl, i: gi, j: gj }); a.barkT = 0.4; } }
    }
    walkDog(world, a, isl, dt, 2.6);
    return;
  }
  let owner = a.owner !== null ? byId.get(a.owner) : null;
  a.repick -= dt;
  if (owner && (owner.isle !== a.isle || owner.link || owner.anim === 'sleep')) owner = null;
  if (!owner || a.repick <= 0) {
    const list = world.folk.filter((f) => f.isle === a.isle && !f.link && !f.aboard && f.anim !== 'sleep');
    if (!owner || a.repick <= 0) { owner = list.length ? list[Math.floor(R() * list.length)] : null; a.owner = owner ? owner.id : null; a.repick = 60 + R() * 120; }
  }
  if (!owner) {
    const sv = storehouse(isl);
    if (sv) { dogGoal(a, sv.door.i, sv.door.j); walkDog(world, a, isl, dt, 1.4); } else a.anim = 'idle';
    return;
  }
  const d = Math.hypot(owner.x - a.x, owner.z - a.z);
  if (d <= 1.5) {
    a.idle += dt;
    a.path = null; a.goal = null;
    a.face = Math.atan2(owner.x - a.x, owner.z - a.z);
    a.anim = world.night > 0.6 && a.idle > 3 ? 'lie' : a.idle > 4 ? 'sit' : 'idle';
    return;
  }
  a.idle = 0;
  dogGoal(a, Math.floor(owner.x), Math.floor(owner.z));
  walkDog(world, a, isl, dt, d > 5 ? 2.6 : 1.7);
  // Note: cut off from the owner for a while: hop to a cell beside them.
  if (a.stuck > 4) {
    const n = nearestWalkable(isl, Math.floor(owner.x), Math.floor(owner.z), null, 3);
    if (n) { a.x = n[0] + 0.5; a.z = n[1] + 0.5; }
    a.stuck = 0; a.path = null; a.goal = null;
  }
}

function walkDog(world, a, isl, dt, speed) {
  if (!a.path || a.pi >= a.path.length) {
    a.anim = 'idle';
    a.stuck += a.path === null ? dt : 0;
    return;
  }
  const [ci, cj] = a.path[a.pi];
  if (!isl.walkable(ci, cj)) { a.path = null; a.goal = null; a.stuck += dt; a.anim = 'idle'; return; }
  a.stuck = 0;
  const tx = ci + 0.5; const tz = cj + 0.5;
  const dx = tx - a.x; const dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  const sp = speed * dt;
  const sv = steer(world, isl, a, dx / (d || 1), dz / (d || 1), Math.min(d, sp), dt);
  if (sv.k === 0) { a.anim = 'idle'; return; }
  a.face = Math.atan2(sv.ux, sv.uz);
  if (sv.same && d <= sp) { a.x = tx; a.z = tz; a.pi++; } else { const mv = Math.min(d, sp) * sv.k; a.x += sv.ux * mv; a.z += sv.uz * mv; }
  a.anim = speed > 2 ? 'run' : 'walk';
}

export function stepAnimals(world, dt) {
  if (!world.animals.length) return;
  const byId = new Map();
  for (const f of world.folk) byId.set(f.id, f);
  const movers = new Map();
  for (const f of world.folk) { if (f.link || f.aboard) continue; let l = movers.get(f.isle); if (!l) movers.set(f.isle, l = []); l.push(f); }
  for (const a of world.animals) if (a.kind === 'dog') { let l = movers.get(a.isle); if (!l) movers.set(a.isle, l = []); l.push(a); }
  // Note: a balloon that has landed calls the nearest dog over.
  for (const ar of world.arrivals) {
    if (!ar.landed || ar.barked || ar.pad.gone) continue;
    ar.barked = true;
    let best = null; let bd = 1e9;
    for (const a of world.animals) {
      if (a.kind !== 'dog' || a.isle !== ar.isl.id) continue;
      const d = Math.hypot(a.x - ar.pad.door.i, a.z - ar.pad.door.j);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) best.mode = { type: 'greet', i: ar.pad.door.i, j: ar.pad.door.j, fx: ar.pad.x + ar.pad.size / 2, fz: ar.pad.y + ar.pad.size / 2, until: world.time + ar.stay + 6, nextBark: world.time + 0.5 };
  }
  for (const a of world.animals) {
    const isl = world.islands.get(a.isle);
    if (!isl) continue;
    if (a.barkT > 0) a.barkT -= dt;
    if (a.state === 'herd') { stepHerded(world, isl, a, dt, byId); continue; }
    if (a.kind === 'bird') stepBird(world, isl, a, dt, movers.get(a.isle) || []);
    else if (a.kind === 'butterfly') stepButterfly(world, isl, a, dt);
    else if (a.kind === 'fish') stepFish(world, isl, a, dt);
    else if (a.state === 'trek') stepTrek(world, isl, a, dt);
    else if (a.kind === 'hen') stepHen(world, isl, a, dt);
    else if (a.kind === 'sheep') stepSheep(world, isl, a, dt);
    else stepDog(world, isl, a, dt, byId);
  }
  if (world.animals.some((a) => a.gone)) world.animals = world.animals.filter((a) => !a.gone);
}

export function animalsToJSON(world) {
  return world.animals.map((a) => ({ id: a.id, kind: a.kind, isle: a.isle, x: a.x, z: a.z, face: a.face, owner: a.kind === 'dog' ? a.owner : undefined, hx: (a.home || a.src) ? (a.home || a.src).x : undefined, hy: (a.home || a.src) ? (a.home || a.src).y : undefined, wool: a.kind === 'sheep' ? +a.wool.toFixed(2) : undefined, lay: a.kind === 'hen' ? Math.round(a.lay) : undefined, variant: a.variant }));
}

// Note: transient state (flight, paths, modes) is rebuilt; birds and butterflies resume where they were.
export function animalsFromJSON(world, list) {
  world.animals = [];
  for (const o of list || []) {
    const isl = world.islands.get(o.isle);
    if (!isl || !Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
    let a;
    if (o.kind === 'bird') {
      // Note: a saved bird over water or void would hang in the air, so it moves to free ground or waits out of sight.
      let bx = o.x; let bz = o.z;
      const spot = isl.land(Math.floor(bx), Math.floor(bz)) ? null : findLand(isl);
      if (spot) { bx = spot[0] + 0.5; bz = spot[1] + 0.5; }
      if (!spot && !isl.land(Math.floor(bx), Math.floor(bz))) a = make(world, 'bird', isl, bx, bz, { state: 'gone', hidden: true, wait: 5 + R() * 25 });
      else a = make(world, 'bird', isl, bx, bz, { state: 'perch', stay: 6 + R() * 40, t: 0 });
    }
    else if (o.kind === 'butterfly') a = make(world, 'butterfly', isl, o.x, o.z, { state: 'flit', h: R() * TAU, ph: R() * TAU, alt: 1, chk: 0, home: o.hx === undefined ? undefined : homeAt(isl, o.hx, o.hy) || undefined });
    else if (o.kind === 'dog') a = make(world, 'dog', isl, o.x, o.z, { state: 'dog', owner: o.owner ?? null, path: null, pi: 0, idle: 0, repick: 30 + R() * 60, stuck: 0, mode: null });
    else if (o.kind === 'fish') a = make(world, 'fish', isl, o.x, o.z, { state: 'swim', anim: 'swim', alt: 0.1, variant: o.variant | 0, wait: 0, jumpT: 10 + R() * 40 });
    else if (o.kind === 'hen' || o.kind === 'sheep') {
      const home = homeAt(isl, o.hx, o.hy);
      if (!home) continue;
      a = make(world, o.kind, isl, o.x, o.z, { state: 'idle', home, wait: 1, variant: o.variant | 0, wool: o.wool ?? 0.5, lay: o.lay ?? 0 });
    }
    if (a) { a.id = o.id; a.face = o.face || 0; world.nextAnimal = Math.max(world.nextAnimal, o.id + 1); }
  }
}
