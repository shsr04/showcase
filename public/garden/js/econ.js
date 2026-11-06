// Note: stock, resources, building projects and the per-island settlement planner.

import { N, STEP_MAX, STAIR_MAX, BUILDINGS, KNOWLEDGE, GOODS, PLANT_KINDS, PLANTS, BED_PER_ISLAND_MAX, SURF, FLOURISH_IDS, LINK_TIER_TYPES, TRAIT_LANDMARK, RARE_GOODS } from './config.js';
import { cidx, inB, DEP, PK } from './island.js';
import { isDormant, knowRelic, activate, relicKey, takeRare, siteProblem } from './rareisles.js';
import { gwNeeds } from './greatwork.js';
import { deedCells } from './legacy.js';
import { reachMap, nearestWalkable } from './path.js';
import { clamp } from './rand.js';
import { pierDir, pierDirs, pierDirFor } from './pier.js';
import { HOME_ID } from './capital.js';

const R = Math.random;
const BASE_UNLOCKED = new Set(['storehouse', 'hut', 'lookout', 'campfire', 'bonfire', 'pad', 'hall', 'council', 'stairs']);
export const STOCK_CAP = 40;
// Note: rare-island helpers are re-exported so callers import one module.
export { isDormant, knowRelic };

export const stockGet = (isl, g) => isl.stock[g] || 0;
export function stockAdd(isl, g, n) { isl.stock[g] = Math.min(STOCK_CAP, (isl.stock[g] || 0) + n); }
export function stockTake(isl, g, n) {
  if ((isl.stock[g] || 0) < n) return false;
  isl.stock[g] -= n;
  return true;
}
// Note: flourish steps: lantern, pennant, stone trim, planters. A step takes a good in stock, else one whose station stands; null means the island must wait.
const FLOUR_CHAIN = [[['lamp', 'lampworks'], ['plank', 'sawmill']], [['cloth', 'loom'], ['fiber', 'ropewalk']], [['stone']], [['plank', 'sawmill']]];
export function flourishCost(isl, step) {
  const chain = FLOUR_CHAIN[Math.min(3, step)];
  for (const [g] of chain) if (stockGet(isl, g) >= 1) return { [g]: 1 };
  for (const [g, st] of chain) if (!st || builtOf(isl, st).length) return { [g]: 1 };
  return null;
}
export const flourishTarget = (isl) => Math.max(0, Math.min(4, (isl.rung | 0) - 1));
// Note: a link takes tiers up to the lower flourish target of its two islands; the vine and unfinished links take none.
export function linkCap(world, l) {
  if (!l.isLink || !LINK_TIER_TYPES.has(l.type) || l.state !== 'done' || !l.built) return 0;
  const A = world.islands.get(l.a); const B = world.islands.get(l.b);
  return A && B ? Math.min(flourishTarget(A), flourishTarget(B)) : 0;
}
// Note: the bench end is the one whose island has the higher rung (ties: end 0); it freezes once the link reaches tier 3.
export function linkBenchEnd(world, l) {
  if ((l.tier | 0) >= 3) return l.benchEnd ? 1 : 0;
  const A = world.islands.get(l.a); const B = world.islands.get(l.b);
  return A && B && (B.rung | 0) > (A.rung | 0) ? 1 : 0;
}
// Note: goals the island works toward: each has a pressure and a cost, and reserves its goods from every lower spender.
export const GOAL_P = { pad: 6, prep: 5.9, linkToward: 5.8, link: 3.5, build: 3.4, spend: 1.4 };
export const reservedAbove = (isl, g, p) => { let s = 0; for (const o of isl.goals || []) if (o.pressure > p + 1e-6) s += o.cost[g] || 0; return s; };
// Note: with a pressure p the stock held for higher goals does not count.
export function canAfford(isl, cost, p) {
  if (p === undefined) return Object.keys(cost).every((g) => stockGet(isl, g) >= cost[g]);
  return Object.keys(cost).every((g) => stockGet(isl, g) - reservedAbove(isl, g, p) >= cost[g]);
}
export function spend(isl, cost) { for (const g in cost) isl.stock[g] -= cost[g]; }
export function missing(isl, cost) {
  const m = {};
  for (const g in cost) if (stockGet(isl, g) < cost[g]) m[g] = cost[g] - stockGet(isl, g);
  return m;
}

export function isUnlocked(world, id) {
  if (BASE_UNLOCKED.has(id)) return true;
  // Note: landmarks need no knowledge; the island's trait and prerequisites gate them in the planner. The airdock needs navigation.
  const role = BUILDINGS[id] && BUILDINGS[id].role;
  if (role === 'landmark') return true;
  return world.unlocked.has(id);
}

export const live = (isl, id) => isl.buildings.filter((b) => b && !b.gone && (!id || b.id === id));
export const builtOf = (isl, id) => live(isl, id).filter((b) => b.built);
export const bldCenter = (b) => ({ i: b.x + b.size / 2, j: b.y + b.size / 2 });
export const storehouse = (isl) => builtOf(isl, 'storehouse')[0] || null;

export function beds(isl) {
  let n = 0;
  for (const b of builtOf(isl, 'hut')) n += BUILDINGS.hut.beds + (b.level || 0);
  return Math.min(n, BED_PER_ISLAND_MAX);
}

// Note: resource at a cell as { good, n } or null; this is what gatherers target.
export function resourceAt(isl, i, j) {
  const c = cidx(i, j);
  if (!isl.mask[c] || isl.bld[c] >= 0 || isl.fire[c] > 0) return null;
  // Note: live rare deposits gather like a dep cell; dormant islands hold none.
  if (isl.rare && isl.rare.deposits && !isDormant(isl) && isl.water[c] < 0.3) {
    for (const d of isl.rare.deposits) if (d.n > 0 && d.i === i && d.j === j) return { good: d.good, n: 1, kind: 'dep', rare: d };
  }
  if (isl.depExposed(i, j)) {
    const g = isl.dep[c] === DEP.ORE ? 'ore' : isl.dep[c] === DEP.CRYSTAL ? 'crystal' : 'clay';
    if (isl.water[c] < 0.3) return { good: g, n: 1, kind: 'dep' };
  }
  if (isl.stone[c] > 0 && isl.water[c] < 0.3) return { good: 'stone', n: 1, kind: 'stone' };
  const pk = isl.plant[c];
  if (pk) {
    const k = PLANT_KINDS[pk];
    const g = isl.grow[c];
    if ((k === 'tree' || k === 'pine') && g >= 0.85) return { good: 'wood', n: 3, kind: 'tree' };
    if ((k === 'fruittree' || k === 'bush') && g >= 1) return { good: 'fruit', n: 2, kind: 'fruit' };
    if (k === 'wheat' && g >= 1) return { good: 'wheat', n: 2, kind: 'wheat' };
    if (k === 'reed' && g >= 0.9) return { good: 'fiber', n: 2, kind: 'reed' };
    if (k === 'vine' && g >= 1 && isl.vineSpare) return { good: 'fiber', n: 1, kind: 'vine' };
  }
  return null;
}

export function harvest(isl, i, j) {
  const c = cidx(i, j);
  const r = resourceAt(isl, i, j);
  if (!r) return null;
  if (r.rare) { takeRare(isl, r.rare); isl.touch('terrain'); isl.touch('plant'); }
  else if (r.kind === 'dep') { isl.depAmt[c]--; if (isl.depAmt[c] <= 0) isl.dep[c] = 0; isl.touch('terrain'); }
  else if (r.kind === 'stone') { isl.stone[c]--; isl.touch('plant'); }
  else if (r.kind === 'tree') { if (R() < 0.55) { isl.grow[c] = 0.04; } else isl.plant[c] = 0; isl.touch('plant'); }
  else if (r.kind === 'fruit') { isl.grow[c] = 0.55; isl.touch('plant'); }
  else if (r.kind === 'wheat') { isl.grow[c] = 0.12; isl.touch('plant'); }
  else if (r.kind === 'reed') { isl.grow[c] = 0.3; isl.touch('plant'); }
  else if (r.kind === 'vine') { isl.grow[c] = 0.4; isl.touch('plant'); }
  return r;
}

// Note: fish spots: water cells deep enough, next to a walkable cell.
export function fishSpot(isl, i, j) {
  const c = cidx(i, j);
  return isl.mask[c] && isl.water[c] >= 0.3 && isl.fishCd[c] <= 0;
}

// Note: hall seats: chairs around one long table; positions in island cell units, faces turn to the table.
const SEATS = new WeakMap();
export function hallSeats(b) {
  const cx = b.x + b.size / 2; const cz = b.y + b.size / 2;
  const P = Math.PI;
  return [
    { x: cx - 0.7, z: cz - 0.58, face: 0 }, { x: cx, z: cz - 0.58, face: 0 }, { x: cx + 0.7, z: cz - 0.58, face: 0 },
    { x: cx - 0.7, z: cz + 0.58, face: P }, { x: cx, z: cz + 0.58, face: P }, { x: cx + 0.7, z: cz + 0.58, face: P },
    { x: cx - 1.2, z: cz, face: P / 2 }, { x: cx + 1.2, z: cz, face: -P / 2 },
  ];
}

// Note: reserves the free seat nearest the folk in any built hall; null when none is free.
export function reserveSeat(isl, f, mate) {
  // Note: partners sit together; the anchor is the partner when close, else the folk.
  const an = mate && Math.hypot(mate.x - f.x, mate.z - f.z) < 8 ? mate : f;
  let best = null; let bd = 1e9;
  for (const b of builtOf(isl, 'hall')) {
    const taken = SEATS.get(b) || SEATS.set(b, new Map()).get(b);
    hallSeats(b).forEach((s, k) => {
      if (taken.has(k)) return;
      const d = Math.hypot(s.x - an.x, s.z - an.z);
      if (d < bd) { bd = d; best = { b, k, seat: s, taken }; }
    });
  }
  if (best) best.taken.set(best.k, f.id);
  return best;
}

export function freeSeat(b, k) { const m = SEATS.get(b); if (m) m.delete(k); }

function dist(a, b) { return Math.hypot(a.i - b.i, a.j - b.j); }

// Note: pick a footprint for a building; returns { x, y } or null.
// Note: cells of every fixed pad of a rare island; stairs and plants never take them.
const PAD_CELLS = new WeakMap();
export function padCells(isl) {
  // Note: the reserved airdock block of the home island counts as a pad, so stairs, art and plants keep off it.
  if (isl.dockSite && !isl.rare) {
    let ds = PAD_CELLS.get(isl.dockSite);
    if (!ds) {
      ds = new Set();
      for (let j = isl.dockSite.y; j < isl.dockSite.y + isl.dockSite.size; j++) for (let i = isl.dockSite.x; i < isl.dockSite.x + isl.dockSite.size; i++) if (inB(i, j)) ds.add(cidx(i, j));
      PAD_CELLS.set(isl.dockSite, ds);
    }
    return ds;
  }
  if (!isl.rare || !isl.rare.sites) return null;
  let set = PAD_CELLS.get(isl.rare);
  if (!set) {
    set = new Set();
    for (const p of Object.values(isl.rare.sites)) if (p) for (let j = p.y; j < p.y + p.size; j++) for (let i = p.x; i < p.x + p.size; i++) if (inB(i, j)) set.add(cidx(i, j));
    PAD_CELLS.set(isl.rare, set);
  }
  return set;
}

export function findSite(world, isl, id, reach, near) {
  const def = BUILDINGS[id];
  const s = def.size;
  const home = near || (storehouse(isl) ? bldCenter(storehouse(isl)) : { i: N / 2, j: N / 2 });
  const kr = knowRelic(isl);
  // Note: fixed pads of a rare island stay free for their own building.
  const own = BUILDINGS[id].role === 'landmark' ? 'landmark' : id;
  const pads = isl.rare && isl.rare.sites ? Object.entries(isl.rare.sites).filter(([k, p]) => p && k !== own).map(([, p]) => p) : [];
  // Note: the home island keeps its airdock block free from the first minute.
  if (isl.dockSite && id !== 'airdock') pads.push(isl.dockSite);
  // Note: deed memorial cells stay clear.
  const dc = world && world.deeds && world.deeds.length ? deedCells(world, isl.id) : null;
  let best = null; let bs = -1e9;
  for (let y = 0; y <= N - s; y++) for (let x = 0; x <= N - s; x++) {
    let ok = true;
    let lo = 99; let hi = -99; let wetAdj = false; let sumH = 0;
    for (let dj = -1; dj <= s && ok; dj++) for (let di = -1; di <= s; di++) {
      const i = x + di; const j = y + dj;
      const inside = di >= 0 && dj >= 0 && di < s && dj < s;
      if (!inB(i, j)) { if (inside) ok = false; continue; }
      const c = cidx(i, j);
      if (inside) {
        if (!isl.mask[c] || isl.bld[c] >= 0 || isl.water[c] > 0.02 || (isl.stone[c] && id !== 'airdock') || isl.fire[c] > 0 || isl.snow[c] > 0.9 && false) { ok = false; break; }
        if (isl.dep[c] && isl.depExposed(i, j)) { ok = false; break; }
        if (kr && kr.i === i && kr.j === j) { ok = false; break; }
        if (dc && dc.has(c)) { ok = false; break; }
        if (pads.some((p) => i >= p.x - 1 && j >= p.y - 1 && i < p.x + p.size + 1 && j < p.y + p.size + 1)) { ok = false; break; }
        // Note: the cells around a link anchor stay free so crews can leave the landing.
        if (isl.anchors && isl.anchors.some((a) => Math.abs(a.i - i) <= 1 && Math.abs(a.j - j) <= 1)) { ok = false; break; }
        const h = isl.cellH(i, j);
        lo = Math.min(lo, h); hi = Math.max(hi, h); sumH += h;
        const pk = isl.plant[c];
        if (pk && PLANT_KINDS[pk] === 'wheat' && id !== 'airdock') { ok = false; break; }
      } else {
        if (isl.bld[c] >= 0 && id !== 'dock') { ok = false; break; }
        if (isl.water[c] >= 0.3) wetAdj = true;
        // Note: no building next to standing water; it would flood.
        if (id !== 'dock' && isl.water[c] >= 0.1) { ok = false; break; }
      }
    }
    if (!ok) continue;
    if (id === 'dock' && !wetAdj) continue;
    // Note: the airdock levels its block like any building, so a rim with a slope still takes one.
    if (id !== 'dock' && hi - lo > (id === 'airdock' ? 1.6 : 0.9)) continue;
    // Note: an airdock stands on the rim and its pier needs void; pierDir is -1 when no side fits.
    let pdir = 0;
    if (id === 'airdock') { pdir = pierDir(isl, x, y, s); if (pdir < 0) continue; }
    if (reach) {
      // Note: the door cell (south, then others) must be reachable.
      let door = false;
      for (let k = 0; k < s && !door; k++) for (const [i, j] of [[x + k, y + s], [x + k, y - 1], [x - 1, y + k], [x + s, y + k]]) {
        if (inB(i, j) && reach[cidx(i, j)]) { door = true; break; }
      }
      if (!door) continue;
    }
    // Note: the council's front row must be solid ground, or its tier props leave dead stand points.
    if (id === 'council') {
      let front = true;
      for (let k = 0; k < s && front; k++) {
        const i = x + k; const j = y + s;
        front = inB(i, j) && isl.land(i, j) && isl.walkable(i, j) && isl.water[cidx(i, j)] < 0.3 && !isl.stone[cidx(i, j)] && (!reach || reach[cidx(i, j)] > 0)
          && Math.abs(isl.cellH(i, j) - sumH / (s * s)) <= 0.4;
      }
      if (!front) continue;
    }
    const c = { i: x + s / 2, j: y + s / 2 };
    let score = -dist(c, home) * 0.7 + R() * 1.2 - (hi - lo) * 3;
    if (id === 'lookout' || id === 'windmill') score += sumH / (s * s) * 1.6 - dist(c, home) * 0.2;
    if (id === 'hut') score -= Math.abs(dist(c, home) - 4) * 0.4;
    if (id === 'campfire') score -= dist(c, home) * 0.4;
    if (id === 'council') score -= Math.abs(dist(c, home) - 3.5) * 0.6;
    if (id === 'bonfire') score += (sumH / (s * s)) * 3 - dist(c, home) * 0.1;
    if (id === 'pad') score -= Math.abs(dist(c, home) - 6) * 0.5;
    if (id === 'dock') score += 1.5;
    if (score > bs) { bs = score; best = id === 'airdock' ? { x, y, dir: pdir } : { x, y }; }
  }
  if (best && id === 'airdock') best.door = chooseDoor(isl, { x: best.x, y: best.y, size: s });
  return best;
}

// Note: finds a cell pair split by a steep step, one side cut off from home but worth reaching; the stair goes on the lower cell.
export function findStairSite(isl) {
  const reach = isl.reach;
  if (!reach) return null;
  // Note: a stair never stands on a building's door cell, or it could cut the storehouse off.
  const doors = new Set(live(isl).filter((b) => b.door).map((b) => cidx(b.door.i, b.door.j)));
  const free = (i, j) => inB(i, j) && !doors.has(cidx(i, j)) && isl.walkable(i, j) && isl.bld[cidx(i, j)] < 0 && !(isl.deedSet && isl.deedSet.has(cidx(i, j))) && !(padCells(isl) && padCells(isl).has(cidx(i, j))) && !isl.stone[cidx(i, j)] && isl.water[cidx(i, j)] < 0.1;
  const label = new Int16Array(N * N).fill(-1);
  const comps = [];
  const regionOf = (i, j) => {
    const c0 = cidx(i, j);
    if (label[c0] >= 0) return comps[label[c0]];
    const m = reachMap(isl, i, j);
    const id = comps.length;
    let cells = 0; let value = 0;
    for (let c = 0; c < N * N; c++) {
      if (!m[c] || reach[c]) continue;
      label[c] = id; cells++;
      if (isl.plant[c]) value += 0.15;
      if (isl.dep[c] && isl.depAmt[c] > 0) value += 0.6;
      if (isl.stone[c]) value += 0.1;
    }
    const krs = knowRelic(isl);
    for (const s of [krs && !krs.taken ? krs : null, ...(isl.anchors || [])]) {
      if (s && label[cidx(s.i, s.j)] === id) value += 4;
    }
    const r = { cells, value: value + cells * 0.25 };
    comps.push(r);
    return r;
  };
  const home = isl.home || { i: N / 2, j: N / 2 };
  // Note: when most of the island is cut off, any cut-off patch is worth a stair.
  let walk = 0; let got = 0;
  for (let c = 0; c < N * N; c++) if (isl.mask[c] && isl.walkable(c % N, (c / N) | 0)) { walk++; if (reach[c]) got++; }
  const desperate = got < walk * 0.7;
  let best = null; let bs = desperate ? -5 : 2.5;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!reach[cidx(i, j)] || !free(i, j)) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj;
      if (!free(ni, nj) || reach[cidx(ni, nj)]) continue;
      const dh = Math.abs(isl.cellH(i, j) - isl.cellH(ni, nj));
      if (dh <= STEP_MAX + 0.01 || dh > STAIR_MAX) continue;
      const reg = regionOf(ni, nj);
      if (reg.cells < (desperate ? 1 : 3)) continue;
      const score = reg.value - Math.hypot(i - home.i, j - home.j) * 0.05 - dh * 0.3;
      if (score <= bs) continue;
      // Note: the stair stands on the lower cell and points up to the other.
      const lowIsReach = isl.cellH(i, j) < isl.cellH(ni, nj);
      const L = lowIsReach ? { i, j } : { i: ni, j: nj };
      const U = lowIsReach ? { i: ni, j: nj } : { i, j };
      const krl = knowRelic(isl);
      if (krl && krl.i === L.i && krl.j === L.j) continue;
      if (isl.anchors && isl.anchors.some((a) => a.i === L.i && a.j === L.j)) continue;
      let door = lowIsReach ? null : { i: U.i, j: U.j };
      if (lowIsReach) {
        for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const ci = L.i + a; const cj = L.j + b;
          if ((ci !== U.i || cj !== U.j) && inB(ci, cj) && reach[cidx(ci, cj)] && isl.walkable(ci, cj)) { door = { i: ci, j: cj }; break; }
        }
      }
      if (!door) continue;
      bs = score; best = { x: L.i, y: L.j, dx: U.i - L.i, dz: U.j - L.j, door };
    }
  }
  return best;
}

// Note: starts a building at x,y: levels the ground, clears plants, deducts cost (caller checked).
export function startBuilding(world, isl, id, x, y, opts = {}) {
  const def = BUILDINGS[id];
  const s = def.size;
  const b = { id, x, y, size: s, level: 0, built: !!opts.built, progress: opts.built ? 1 : 0, seed: (Math.random() * 1e9) | 0, work: def.work, claims: 0, cycle: null, burn: 0, wet: 0 };
  if (id !== 'dock' && id !== 'stairs' && id !== 'art') {
    let sum = 0; let n = 0;
    for (let j = y; j <= y + s; j++) for (let i = x; i <= x + s; i++) { sum += isl.h[j * (N + 1) + i]; n++; }
    const m = sum / n;
    for (let j = y; j <= y + s; j++) for (let i = x; i <= x + s; i++) isl.h[j * (N + 1) + i] = m;
  }
  const k = isl.buildings.length;
  isl.buildings.push(b);
  for (let j = y; j < y + s; j++) for (let i = x; i < x + s; i++) {
    const c = cidx(i, j);
    isl.bld[c] = k;
    isl.plant[c] = 0; isl.grow[c] = 0;
    // Note: the airdock crew clears boulders from its block.
    if (id === 'airdock') isl.stone[c] = 0;
  }
  b.door = opts.door || chooseDoor(isl, b);
  // Note: dir is the way the airdock pier points over the void; opts.dir is kept when valid, else the best side (0 if none).
  if (id === 'airdock') b.dir = pierDirFor(isl, x, y, opts.dir, s);
  if (id === 'stairs') { b.dx = opts.dx; b.dz = opts.dz; }
  isl.touch('terrain'); isl.touch('plant'); isl.touch('bld');
  return b;
}

export function chooseDoor(isl, b) {
  const s = b.size;
  const opts = [];
  for (let k = 0; k < s; k++) opts.push([b.x + k, b.y + s], [b.x - 1, b.y + k], [b.x + s, b.y + k], [b.x + k, b.y - 1]);
  for (const [i, j] of opts) if (inB(i, j) && isl.land(i, j) && isl.water[cidx(i, j)] < 0.4) return { i, j };
  return { i: b.x, j: b.y };
}

export function removeBuilding(isl, b) {
  b.gone = true;
  for (let j = b.y; j < b.y + b.size; j++) for (let i = b.x; i < b.x + b.size; i++) {
    const c = cidx(i, j);
    if (isl.bld[c] >= 0 && isl.buildings[isl.bld[c]] === b) isl.bld[c] = -1;
    isl.fire[c] = 0;
    isl.ash[c] = 0.8;
  }
  isl.touch('bld'); isl.touch('terrain');
}

// Note: drops an unfinished site and returns its goods; nothing burns.
export function cancelBuilding(isl, b) {
  b.gone = true;
  for (let j = b.y; j < b.y + b.size; j++) for (let i = b.x; i < b.x + b.size; i++) {
    const c = cidx(i, j);
    if (isl.bld[c] >= 0 && isl.buildings[isl.bld[c]] === b) isl.bld[c] = -1;
  }
  const cost = BUILDINGS[b.id].cost;
  for (const g in cost) stockAdd(isl, g, Math.ceil(cost[g] * (1 - 0.5 * b.progress)));
  isl.touch('bld'); isl.touch('terrain');
}

// Note: counts of what the island offers; used to decide what to build.
export function surveyIsland(isl, reach) {
  const s = { tree: 0, fruit: 0, wheat: 0, reed: 0, vine: 0, ore: 0, clay: 0, crystal: 0, stone: 0, fish: 0, wheatAny: 0, treeAny: 0, kinds: { tree: 0, fruit: 0, wheat: 0, reed: 0, vine: 0, flower: 0 } };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    const pk = isl.plant[c];
    const k = PLANT_KINDS[pk];
    if (k === 'tree' || k === 'pine') { s.treeAny++; s.kinds.tree++; }
    if (k === 'wheat') { s.wheatAny++; s.kinds.wheat++; }
    if (k === 'vine') { s.vine++; s.kinds.vine++; }
    if (k === 'bush' || k === 'fruittree') s.kinds.fruit++;
    if (k === 'reed') s.kinds.reed++;
    if (k === 'flower') s.kinds.flower++;
    const r = resourceAt(isl, i, j);
    const okReach = !reach || reach[c] || nearReach(reach, i, j);
    if (r && okReach) {
      if (r.kind === 'tree') s.tree++;
      else if (r.kind === 'fruit') s.fruit++;
      else if (r.kind === 'wheat') s.wheat++;
      else if (r.kind === 'reed') s.reed++;
      else if (r.kind === 'stone') s.stone++;
      else if (r.good === 'ore') s.ore++;
      else if (r.good === 'clay') s.clay++;
      else if (r.good === 'crystal') s.crystal++;
    }
    if (isl.water[c] >= 0.3 && (!reach || nearReach(reach, i, j))) s.fish++;
  }
  return s;
}

function nearReach(reach, i, j) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inB(i + di, j + dj) && reach[cidx(i + di, j + dj)]) return true;
  return false;
}

// Note: true while the Spire already holds this rare good; the first unit of each is kept for it.
function gwHolds(world, good) {
  const gw = world.gw;
  return !!(gw && gw.paid && gw.paid[good] > 0);
}

// Note: the one landmark an island may build; common-trait landmarks on ordinary islands, the trait's own landmark on an awake rare island.
export function landmarkFor(isl) {
  if (isl.special === 'spire' || isDormant(isl)) return null;
  if (isl.rare) return TRAIT_LANDMARK[isl.rare.trait] || null;
  for (const t of isl.traits || []) {
    const id = TRAIT_LANDMARK[t];
    if (id && !BUILDINGS[id].rare) return id;
  }
  return null;
}

// Note: fixed pad of a rare island for a building id, or null.
function padFor(isl, id) {
  const sites = isl.rare && isl.rare.sites;
  if (!sites) return null;
  return sites[BUILDINGS[id].role === 'landmark' ? 'landmark' : id] || null;
}

function padProblem(isl, r) {
  for (let j = r.y; j < r.y + r.size; j++) for (let i = r.x; i < r.x + r.size; i++) {
    if (inB(i, j) && isl.bld[cidx(i, j)] >= 0) return 'occupied';
  }
  return siteProblem(isl, r, null);
}

// Note: rare islands keep a fixed pad per building; use it when free, else search like any island.
function siteFor(world, isl, id, reach, near) {
  if (id === 'airdock' && isl.dockSite) {
    const d = isl.dockSite;
    const r = { x: d.x, y: d.y, size: d.size };
    const anchored = (isl.anchors || []).some((a) => a.i >= r.x && a.j >= r.y && a.i < r.x + r.size && a.j < r.y + r.size);
    let free = !anchored;
    for (let j = r.y; j < r.y + r.size && free; j++) for (let i = r.x; i < r.x + r.size; i++) if (!inB(i, j) || !isl.mask[cidx(i, j)] || isl.bld[cidx(i, j)] >= 0 || isl.water[cidx(i, j)] > 0.02) { free = false; break; }
    if (free && pierDirs(isl, r.x, r.y, r.size).length) return { x: r.x, y: r.y, dir: pierDirFor(isl, r.x, r.y, d.dir, r.size) };
    isl.dockSite = null;
  }
  const pad = padFor(isl, id);
  if (pad) {
    const r = { x: pad.x, y: pad.y, size: BUILDINGS[id].size };
    // Note: an airdock pad also needs a valid pier side; the pad's own dir wins when it still fits.
    const pd = id === 'airdock' ? pierDirFor(isl, r.x, r.y, pad.dir, r.size) : 0;
    const dirOk = id !== 'airdock' || pierDirs(isl, r.x, r.y, r.size).length > 0;
    if (dirOk && !padProblem(isl, r) && (!reach || !siteProblem(isl, r, reach))) return id === 'airdock' ? { x: r.x, y: r.y, dir: pd } : { x: r.x, y: r.y };
  }
  return findSite(world, isl, id, reach, near);
}

// Note: the Spire isle starts with its Great Work site and an airdock, an awake rare isle with an airdock; free, or no ship could ever haul to them.
// Note: true when an awakened rare island can get its airdock: the pad is clear with a pier side, or a free site exists.
export function airdockFeasible(world, isl) {
  const pad = isl.rare && isl.rare.sites && isl.rare.sites.airdock;
  if (!pad) return false;
  const r = { x: pad.x, y: pad.y, size: BUILDINGS.airdock.size };
  if (!padProblem(isl, r) && pierDirs(isl, r.x, r.y, r.size).length) return true;
  return !!findSite(world, isl, 'airdock', null);
}

export function ensureSiteBuildings(world, isl) {
  if (!isl.rare || !isl.rare.sites || isDormant(isl)) return;
  const ids = isl.special === 'spire' ? ['greatwork', 'airdock'] : ['airdock'];
  for (const id of ids) {
    const pad = isl.rare.sites[id];
    if (!pad || live(isl, id).length) continue;
    let r = { x: pad.x, y: pad.y, size: BUILDINGS[id].size };
    // Note: a stair or art piece on the pad gives way; nothing else is torn down.
    const blockers = new Set();
    for (let j = r.y; j < r.y + r.size; j++) for (let i = r.x; i < r.x + r.size; i++) {
      const k = inB(i, j) ? isl.bld[cidx(i, j)] : -1;
      if (k >= 0 && isl.buildings[k]) blockers.add(isl.buildings[k]);
    }
    if (blockers.size && [...blockers].every((b) => b.id === 'stairs' || b.id === 'art')) for (const b of blockers) removeBuilding(isl, b);
    // Note: a still blocked airdock pad falls back to a free site, or no hull could ever haul here.
    // Note: an airdock pad without a valid pier side counts as blocked too.
    if (padProblem(isl, r) || (id === 'airdock' && !pierDirs(isl, r.x, r.y, r.size).length)) {
      const alt = id === 'airdock' ? findSite(world, isl, id, null) : null;
      if (!alt) continue;
      r = { x: alt.x, y: alt.y, size: r.size, dir: alt.dir };
    } else if (id === 'airdock') r.dir = pad.dir;
    const b = startBuilding(world, isl, id, r.x, r.y, { built: true, dir: r.dir });
    if (id === 'greatwork') b.gw = true;
    world.emit({ type: 'built', isl, b });
  }
}

// Note: a key arrives: the rare island wakes, its airdock stands and everyone is told; false when it was not dormant.
export function awakenIsland(world, isl, key) {
  if (!isl.rareSlot || !isDormant(isl)) return false;
  if (!activate(isl, key || relicKey(isl.rareSlot))) return false;
  ensureSiteBuildings(world, isl);
  world.emit({ type: 'relic', isl, key: isl.relic });
  return true;
}

// Note: revealed rare islands that still sleep, by id.
export function dormantIslands(world) {
  return [...world.islands.values()].filter((i) => i.revealed && isDormant(i)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Note: planner order; each entry says when the island wants that building.
function candidates(world, isl, ctx) {
  const { pop, bedsN, sv, has, st } = ctx;
  const want = [];
  if (!sv.total) want.push('storehouse');
  if (sv.total) {
    if (pop >= 2 && !has.campfire) want.push('campfire');
    // Note: the trait landmark once the settlement stands, early so a 3x3 site is still free; one per island.
    const lm = landmarkFor(isl);
    if (lm && !isl.landmark && !has[lm] && pop >= (isl.rare ? 2 : 3) && (isl.rare || isl.rung >= 2)) want.push(lm);
    if (bedsN < pop + (ctx.mood > 0.55 ? 1 : 0) + (ctx.couples > 0 ? 1 : 0) && live(isl, 'hut').length < 4) want.push('hut');
    // Note: the capital hall (T1 flagpost) stands on the home island only, after the hut want.
    if (isl.id === HOME_ID && pop >= 2 && !has.council) want.push('council');
    if (!has.sawmill && sv.treeAny >= 3) want.push('sawmill');
    if (!has.ropewalk && (sv.reed + sv.vine >= 3 || stockGet(isl, 'fiber') >= 2)) want.push('ropewalk');
    if (isl.rung >= 2 && pop >= 3 && !has.bonfire) want.push('bonfire');
    if (has.bonfire && !has.pad) want.push('pad');
    if (!has.lookout && pop >= 3) want.push('lookout');
    if (!has.hall && pop >= 4 && has.sawmill) want.push('hall');
    if (!has.dock && sv.fish >= 2) want.push('dock');
    if (!has.charcoal && (stockGet(isl, 'wood') >= 3) && (isUnlocked(world, 'brickkiln') || isUnlocked(world, 'smelter') || isUnlocked(world, 'oven') || ctx.needs.charcoal)) want.push('charcoal');
    if (!has.brickkiln && (sv.clay > 0 || stockGet(isl, 'clay') >= 2)) want.push('brickkiln');
    if (!has.smelter && (sv.ore > 0 || stockGet(isl, 'ore') >= 2)) want.push('smelter');
    if (!has.smithy && (stockGet(isl, 'ingot') >= 1 || has.smelter)) want.push('smithy');
    if (!has.windmill && sv.wheatAny >= 3) want.push('windmill');
    if (!has.oven && (stockGet(isl, 'flour') >= 1 || has.windmill)) want.push('oven');
    if (!has.smokehouse && (has.dock || stockGet(isl, 'fish') >= 2)) want.push('smokehouse');
    if (!has.loom && (stockGet(isl, 'fiber') >= 3 || sv.reed >= 3)) want.push('loom');
    if (!has.lampworks && (stockGet(isl, 'crystal') >= 1 || sv.crystal > 0)) want.push('lampworks');
    if (isl.rung >= 2 && pop >= 3 && (has.coop || 0) < (isl.rung >= 5 ? 2 : 1) && sv.wheatAny >= 2) want.push('coop');
    if (isl.rung >= 3 && pop >= 4 && (has.pen || 0) < (isl.rung >= 5 ? 2 : 1) && world.unlocked.has('loom') && has.coop) want.push('pen');
    if (isl.rung >= 4 && !has.glassgarden && pop >= 4 && (stockGet(isl, 'crystal') >= 3 || sv.crystal > 0)) want.push('glassgarden');
    if (live(isl, 'hut').some((b) => b.built && (b.level || 0) < 2) && pop > bedsN) want.push('hutUpgrade');
    // Note: ships need a dock; ordinary islands raise one once a pad stands, rare islands get theirs free.
    if (!isl.rare && !has.airdock && isl.rung >= 3 && pop >= 4 && has.pad) want.push('airdock');
  }
  return want.filter((id) => id === 'hutUpgrade' || isUnlocked(world, id));
}

function addWant(want, g, n) { want[g] = Math.max(want[g] || 0, n); }

// Note: turns a missing-goods map into wants; crafted goods push wants into their station's inputs.
function wantGoods(world, isl, m, want, depth = 0) {
  for (const g in m) {
    addWant(want, g, stockGet(isl, g) + m[g]);
    if (depth < 4 && !GOODS[g].raw) {
      const st = Object.values(BUILDINGS).find((d) => d.recipe && d.recipe.out[g]);
      const sid = Object.keys(BUILDINGS).find((k) => BUILDINGS[k] === st);
      const r2 = Object.keys(BUILDINGS).map((k) => BUILDINGS[k]).find((d) => d.recipe2 && d.recipe2.out[g]);
      const rec = (st && st.recipe) || (r2 && r2.recipe2);
      if (rec) {
        const need = {};
        const times = Math.ceil(m[g] / (rec.out[g] || 1));
        for (const ig in rec.in) need[ig] = Math.max(0, rec.in[ig] * times - stockGet(isl, ig));
        wantGoods(world, isl, need, want, depth + 1);
      }
    }
  }
}

// Note: the settlement mind; runs every few seconds per revealed island.
export function planIsland(world, isl) {
  const folk = world.folkOn(isl.id);
  const pop = folk.length;
  const sv0 = storehouse(isl);
  const homeCell = sv0 ? sv0.door : (() => { const f = folk[0]; return f ? { i: Math.floor(f.x), j: Math.floor(f.z) } : { i: N >> 1, j: N >> 1 }; })();
  const start = nearestWalkable(isl, homeCell.i, homeCell.j, null, 5);
  isl.reach = start ? reachMap(isl, start[0], start[1]) : new Uint8Array(N * N);
  isl.home = start ? { i: start[0], j: start[1] } : { i: N >> 1, j: N >> 1 };
  isl.deedSet = world.deeds && world.deeds.length ? deedCells(world, isl.id) : null;
  ensureSiteBuildings(world, isl);
  // Note: the airdock block of the home island is reserved at the first plan, before huts and sheds take the rim.
  if (isl.id === HOME_ID && pop && isl.dockSite === undefined && !live(isl, 'airdock').length) {
    const site = findSite(world, isl, 'airdock', null);
    isl.dockSite = site ? { x: site.x, y: site.y, size: BUILDINGS.airdock.size, dir: site.dir } : null;
  }
  const sv = surveyIsland(isl, isl.reach);
  sv.total = builtOf(isl, 'storehouse').length + live(isl, 'storehouse').filter((b) => !b.built).length;
  const vines = [];
  isl.vineSpare = sv.vine > 10;
  const has = {};
  for (const b of live(isl)) has[b.id] = (has[b.id] || 0) + 1;
  const bedsN = beds(isl);
  let mood = 0.6;
  if (pop) mood = folk.reduce((s, f) => s + f.mood, 0) / pop;
  isl.mood = mood;
  isl.pop = pop;
  const want = {};
  const needs = {};
  const couples = folk.filter((f) => f.stage === 'adult' && f.partner !== null && f.partner !== undefined).length / 2;
  const ctx = { pop, bedsN, sv, has, mood, needs, couples };
  const projects = live(isl).filter((b) => !b.built);
  // Note: base wants keep the island busy even without projects.
  if (pop) {
    if (stockGet(isl, 'wood') < 6) addWant(want, 'wood', 6);
    const foodStock = stockGet(isl, 'bread') + stockGet(isl, 'smoked') + stockGet(isl, 'fruit') + stockGet(isl, 'fish') + stockGet(isl, 'egg');
    if (foodStock < pop * 1.5) { addWant(want, 'fruit', pop * 2); addWant(want, 'fish', pop * 2); addWant(want, 'wheat', Math.ceil(pop)); }
    if (stockGet(isl, 'stone') < 3) addWant(want, 'stone', 3);
    if (has.oven) addWant(want, 'bread', Math.ceil(pop * 1.5));
    if (has.smokehouse) addWant(want, 'smoked', Math.ceil(pop * 1.5));
    if (has.windmill && has.oven) addWant(want, 'flour', 2);
    if (has.sawmill) addWant(want, 'plank', 4);
    if (has.ropewalk) addWant(want, 'rope', 2);
    if (has.smithy) { addWant(want, 'tool', 2); if (world.unlocked.has('cablecar')) addWant(want, 'gear', 3); }
    if (has.lampworks) addWant(want, 'lamp', 2);
    if (has.smelter && (has.smithy || has.lampworks)) addWant(want, 'ingot', 3);
    if (has.charcoal && (has.smelter || has.brickkiln || has.oven)) addWant(want, 'charcoal', 3);
    if (has.brickkiln && (!has.smelter && isUnlocked(world, 'smelter') || !has.oven && isUnlocked(world, 'oven'))) addWant(want, 'brick', 4);
    if (has.loom) addWant(want, 'cloth', 2);
    if (has.coop) addWant(want, 'wheat', 4 + (has.coop || 0) * 2);
    // Note: landmark goods; luxury chains start once the Spire holds that rare good.
    for (const b of builtOf(isl)) {
      const def = BUILDINGS[b.id];
      if (def.role !== 'landmark' || !def.recipe) continue;
      if (def.rare && !gwHolds(world, def.rare)) continue;
      const og = Object.keys(def.recipe.out)[0];
      addWant(want, og, GOODS[og].luxury ? 2 : og === 'ore' ? 6 : 3);
      for (const ig in def.recipe.in) addWant(want, ig, def.recipe.in[ig] * 2);
    }
    // Note: an awake rare island gathers one unit of its rare good for the Spire.
    if (isl.rare && isl.rare.good && !isDormant(isl) && !gwHolds(world, isl.rare.good)) addWant(want, isl.rare.good, 1);
    // Note: the Spire isle asks for the foundation goods; rare goods come by their own haul.
    if (isl.special === 'spire' && world.gw) {
      const gn = gwNeeds(world.gw);
      for (const g in gn) if (!RARE_GOODS.includes(g)) addWant(want, g, stockGet(isl, g) + gn[g]);
    }
  }
  // Note: folk gather and craft the goods for the pending flourish steps, or no island with an empty stock ever adorns.
  if (pop && flourishTarget(isl) > 0) {
    // Note: the wish list asks for at most 2 of each flourish good, however many buildings wait; stock counts.
    const need = {};
    for (const b of live(isl)) {
      if (!b.built || b.upgrading || !FLOURISH_IDS.has(b.id) || b.id === 'council' || (b.flourish | 0) >= flourishTarget(isl) || b.adPaid) continue;
      const cost = flourishCost(isl, b.flourish | 0);
      if (cost) for (const g in cost) need[g] = Math.min(2, (need[g] || 0) + cost[g]);
    }
    // Note: links touching this island wait for goods too; either island may pay, so both ask.
    for (const l of world.links) {
      if ((l.a !== isl.id && l.b !== isl.id) || (l.tier | 0) >= linkCap(world, l) || l.adPaid) continue;
      const cost = flourishCost(isl, l.tier | 0);
      if (cost) for (const g in cost) need[g] = Math.min(2, (need[g] || 0) + cost[g]);
    }
    wantGoods(world, isl, missing(isl, need), want);
  }
  if (isl.linkWant) for (const g in isl.linkWant) addWant(want, g, isl.linkWant[g]);
  // Note: curiosity: folk stockpile whatever they can newly reach, even before they know a use.
  if (pop) {
    if (sv.ore > 0 && stockGet(isl, 'ore') < 4) addWant(want, 'ore', 4);
    if (sv.clay > 0 && stockGet(isl, 'clay') < 3) addWant(want, 'clay', 3);
    if (sv.crystal > 0 && stockGet(isl, 'crystal') < 2) addWant(want, 'crystal', 2);
    if (sv.reed > 0 && has.ropewalk && stockGet(isl, 'fiber') < 4) addWant(want, 'fiber', 4);
  }
  for (const g of Object.keys(want)) {
    if (!GOODS[g].raw && want[g] > stockGet(isl, g)) wantGoods(world, isl, { [g]: want[g] - stockGet(isl, g) }, want);
  }

  let started = projects.length;
  const order = candidates(world, isl, ctx);
  // Note: a station a goal's tree needs is planned even when the usual rules would not ask for it yet.
  for (const sid of Object.keys(isl.stationP || {})) if (!has[sid] && !order.includes(sid) && BUILDINGS[sid] && isUnlocked(world, sid)) order.unshift(sid);
  let blocked = 0;
  // Note: goals: whatever waits for goods, with the pressure the planner gives it; the first pad outranks the link, the link outranks other building.
  const goals = [];
  if (isl.linkGoal) goals.push({ key: 'link', pressure: isl.linkGoal.pressure, cost: isl.linkGoal.cost });
  for (const id of order) {
    if (started >= 2) break;
    if (id === 'hutUpgrade') {
      const hb = builtOf(isl, 'hut').find((b) => (b.level || 0) < 2 && !b.upgrading);
      if (!hb) continue;
      const cost = BUILDINGS.hut.upgrade;
      if (canAfford(isl, cost, GOAL_P.build)) { spend(isl, cost); hb.upgrading = true; hb.upProgress = 0; started++; }
      else { goals.push({ key: id, pressure: GOAL_P.build, cost }); if (blocked++ < 2) wantGoods(world, isl, missing(isl, cost), want); }
      continue;
    }
    const def = BUILDINGS[id];
    if (!sv.total && id !== 'storehouse') continue;
    // Note: the home airdock outranks the links, or no hull ever flies once navigation is known.
    const gp = id === 'pad' || (id === 'airdock' && isl.id === HOME_ID) ? GOAL_P.pad : Math.max(GOAL_P.build, (isl.stationP || {})[id] || 0);
    if (canAfford(isl, def.cost, gp)) {
      const site = siteFor(world, isl, id, sv.total ? isl.reach : null, sv0 ? undefined : isl.home);
      if (site) {
        spend(isl, def.cost);
        startBuilding(world, isl, id, site.x, site.y);
        if (def.role === 'landmark') isl.landmark = id;
        world.emit({ type: 'planned', isl, id });
        started++;
        has[id] = (has[id] || 0) + 1;
      } else { isl.placeGap = world.time; if (id === 'pad') isl.padNoSite = world.time; }
    } else {
      // Note: a pad that found no site two minutes ago is no goal yet; every other unaffordable building is.
      if (!(id === 'pad' && isl.padNoSite && world.time < isl.padNoSite + 120)) goals.push({ key: id, pressure: gp, cost: def.cost });
      // Note: the airdock always states its needs, or the goods are never gathered behind the other waiting buildings.
      if (blocked++ < 3 || id === 'airdock') {
        const m = missing(isl, def.cost);
        wantGoods(world, isl, m, want);
        for (const g in m) needs[g] = true;
      }
    }
  }
  // Note: folk build a stair or ladder where a steep step cuts off something worth reaching.
  if (pop >= 2 && sv.total && !live(isl, 'stairs').some((b) => !b.built) && live(isl, 'stairs').length < 10) {
    const site = findStairSite(isl);
    if (site) {
      const cost = BUILDINGS.stairs.cost;
      if (canAfford(isl, cost)) {
        spend(isl, cost);
        startBuilding(world, isl, 'stairs', site.x, site.y, { dx: site.dx, dz: site.dz, door: site.door });
        world.emit({ type: 'planned', isl, id: 'stairs' });
      } else wantGoods(world, isl, missing(isl, cost), want);
    }
  }
  // Note: goal trees: a goal posts at once a node for everything missing down its chain: gather for a raw good, craft for a made one,
  // a station where none stands and a plant node where no source of a raw good is left; each inherits the pressure, 10% less per step.
  goals.sort((a, b) => b.pressure - a.pressure);
  const nodes = new Map();
  const put = (key, n) => {
    const o = nodes.get(key);
    if (!o) nodes.set(key, n); else { o.pressure = Math.max(o.pressure, n.pressure); if ((n.target || 0) > (o.target || 0)) o.target = n.target; }
  };
  const grow = (g, amount, p, depth) => {
    if (GOODS[g].raw) {
      put(`g:${g}`, { kind: 'gather', good: g, target: stockGet(isl, g) + amount, pressure: p });
      if (!(isl.res || []).some((r) => r.good === g)) { const pk = Object.keys(PLANTS).find((k) => PLANTS[k].yields === g); if (pk) put(`p:${pk}`, { kind: 'plant', plantKind: pk, pressure: p }); }
      return;
    }
    if (depth >= 4) return;
    const sid = Object.keys(BUILDINGS).find((k) => (BUILDINGS[k].recipe && BUILDINGS[k].recipe.out[g]) || (BUILDINGS[k].recipe2 && BUILDINGS[k].recipe2.out[g]));
    if (!sid) return;
    const rec = BUILDINGS[sid].recipe && BUILDINGS[sid].recipe.out[g] ? BUILDINGS[sid].recipe : BUILDINGS[sid].recipe2;
    put(`c:${g}`, { kind: 'craft', good: g, sid, target: stockGet(isl, g) + amount, pressure: p });
    if (!builtOf(isl, sid).length) put(`s:${sid}`, { kind: 'station', sid, pressure: p * 0.95 });
    const times = Math.ceil(amount / (rec.out[g] || 1));
    for (const ig in rec.in) { const need = rec.in[ig] * times - stockGet(isl, ig); if (need > 0) grow(ig, need, p * 0.9, depth + 1); }
  };
  for (const o of goals) { const m = missing(isl, o.cost); for (const g in m) grow(g, m[g], o.pressure * 0.9, 0); }
  const goodP = {}; const stationP = {}; const treeTarget = {}; const plantP = {};
  for (const n of nodes.values()) {
    if (n.kind === 'gather' || n.kind === 'craft') { goodP[n.good] = Math.max(goodP[n.good] || 0, n.pressure); treeTarget[n.good] = Math.max(treeTarget[n.good] || 0, n.target); }
    else if (n.kind === 'station') stationP[n.sid] = Math.max(stationP[n.sid] || 0, n.pressure);
    else plantP[n.plantKind] = Math.max(plantP[n.plantKind] || 0, n.pressure);
  }
  isl.goals = goals; isl.tree = [...nodes.values()]; isl.goodP = goodP; isl.stationP = stationP; isl.treeTarget = treeTarget; isl.plantP = plantP;
  isl.plantWant = plantWants(world, isl, sv, has, pop);
  isl.want = want;
  return want;
}

// Note: how many more of each plant the folk would like; they plant it themselves where the soil allows.
function plantWants(world, isl, sv, has, pop) {
  const pw = {};
  if (!pop || !sv.total) return pw;
  const k = sv.kinds;
  const P = Math.max(pop, 2);
  const need = (kind, goal) => { if (k[kind] < goal) pw[kind] = goal - k[kind]; };
  need('tree', 7 + P * 2);
  need('fruit', 3 + P);
  need('wheat', world.unlocked.has('windmill') || has.windmill ? 10 : P >= 4 ? 4 : 0);
  need('reed', has.ropewalk || has.loom || world.unlocked.has('ropewalk') ? 4 : 0);
  need('flower', 6);
  if (isl.vineSpot) {
    let n = 0;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const i = isl.vineSpot.i + di; const j = isl.vineSpot.j + dj;
      if (inB(i, j) && Math.hypot(di, dj) <= 3.2 && isl.plant[cidx(i, j)] === PK.vine) n++;
    }
    if (n < 6) pw.vine = 6 - n;
  }
  // Note: a goal whose raw source is gone asks the folk to plant more of it.
  for (const k of Object.keys(isl.plantP || {})) pw[k] = Math.max(pw[k] || 0, 3);
  return pw;
}

export function plantKindFor(isl, want) {
  if (want === 'tree') return isl.has('frozen') ? 'pine' : 'tree';
  if (want === 'fruit') return isl.has('orchard') || R() < 0.35 ? 'fruittree' : 'bush';
  return want;
}

// Note: a free cell where the soil and moisture suit the plant; [i, j] or null.
export function findPlantSpot(isl, kind, f, anchor) {
  const def = PLANTS[kind];
  const reach = isl.reach;
  if (!def || !reach) return null;
  const home = anchor || isl.home || { i: N >> 1, j: N >> 1 };
  const kr = knowRelic(isl);
  const pc = padCells(isl);
  let best = null; let bs = -1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c] || isl.plant[c] || isl.stone[c] || isl.bld[c] >= 0 || isl.fire[c] > 0 || isl.snow[c] > 0.4) continue;
    if (isl.claims && isl.claims.has(c)) continue;
    if (isl.dep[c] && isl.depExposed(i, j)) continue;
    if (kr && kr.i === i && kr.j === j) continue;
    if (isl.deedSet && isl.deedSet.has(c)) continue;
    if (pc && pc.has(c)) continue;
    if (isl.anchors && isl.anchors.some((a) => Math.abs(a.i - i) <= 1 && Math.abs(a.j - j) <= 1)) continue;
    const d0 = Math.hypot(i - home.i, j - home.j);
    if (d0 > (anchor ? 3.2 : 12)) continue;
    const w = isl.water[c];
    if (kind === 'reed') {
      if (w > 0.4 || (w < 0.03 && isl.moist[c] < 0.7)) continue;
    } else {
      const s = isl.surf(i, j);
      if (s !== SURF.SOIL && s !== SURF.ASH) continue;
      if (w > 0.08 || isl.soil[c] < 0.3 || isl.moist[c] < def.water * 0.9) continue;
    }
    if (!nearReach(reach, i, j)) continue;
    let score = -d0 * 0.25 + R() * 1.5 + isl.moist[c];
    if (f) score -= Math.hypot(i + 0.5 - f.x, j + 0.5 - f.z) * 0.3;
    if (score > bs) { bs = score; best = [i, j]; }
  }
  return best;
}

// Note: all gatherable resource cells reachable by folk; refreshed by the planner.
// Note: a fish spot needs a fish swimming within 3.5 cells.
export function fishNear(isl, i, j) {
  for (const a of isl.fishPos || []) if (Math.hypot(a.x - i - 0.5, a.z - j - 0.5) < 3.5) return true;
  return false;
}

export function scanResources(isl) {
  const list = [];
  const reach = isl.reach;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    const r = resourceAt(isl, i, j);
    if (r && (!reach || reach[c])) list.push({ i, j, c, good: r.good, n: r.n, kind: r.kind });
    else if (isl.water[c] >= 0.3 && isl.fishCd[c] <= 0 && reach && fishNear(isl, i, j)) {
      let adj = false;
      for (let dj = -1; dj <= 1 && !adj; dj++) for (let di = -1; di <= 1; di++) if (inB(i + di, j + dj) && reach[cidx(i + di, j + dj)] && isl.walkable(i + di, j + dj)) { adj = true; break; }
      if (adj) list.push({ i, j, c, good: 'fish', n: 1, kind: 'fish' });
    }
  }
  isl.res = list;
  return list;
}

// Note: spots where folk stand and look, giving the player silent hints.
export function scanGaze(world, isl) {
  const spots = [];
  const reach = isl.reach;
  if (!reach) return spots;
  const near = (ti, tj, maxR) => {
    let best = null; let bd = 1e9;
    for (let j = Math.max(0, tj - maxR); j <= Math.min(N - 1, tj + maxR); j++) for (let i = Math.max(0, ti - maxR); i <= Math.min(N - 1, ti + maxR); i++) {
      if (!reach[cidx(i, j)] || !isl.walkable(i, j)) continue;
      const d = Math.hypot(i - ti, j - tj);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    return best ? { i: best[0], j: best[1], d: bd } : null;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c]) continue;
    if (isl.dep[c] && isl.depAmt[c] > 0 && !reach[c]) {
      const s = near(i, j, 6);
      if (s && s.d >= 1.5 && R() < 0.3) spots.push({ i: s.i, j: s.j, fi: i + 0.5, fj: j + 0.5, why: 'dep', w: 2 });
    } else if (isl.plant[c] && (PLANT_KINDS[isl.plant[c]] === 'wheat' || PLANT_KINDS[isl.plant[c]] === 'bush') && isl.moist[c] < PLANTS[PLANT_KINDS[isl.plant[c]]].water * 0.6 && isl.grow[c] < 1 && R() < 0.25) {
      const s = near(i, j, 3);
      if (s) spots.push({ i: s.i, j: s.j, fi: i + 0.5, fj: j + 0.5, why: 'dry', w: 1.4 });
    }
    if (isl.bld[c] >= 0 && R() < 0.02) {
      const b = isl.buildings[isl.bld[c]];
      if (b && b.built && b.id !== 'campfire' && b.id !== 'stairs') spots.push({ i: b.door.i, j: b.door.j, fi: b.x + b.size / 2, fj: b.y + b.size / 2, why: 'admire', w: b.id === 'glassgarden' ? 1.4 : 0.4 });
    }
  }
  if (isl.vineSpot && isl.plantWant && isl.plantWant.vine && !findPlantSpot(isl, 'vine', null, isl.vineSpot)) {
    const s = near(isl.vineSpot.i, isl.vineSpot.j, 4);
    if (s) spots.push({ i: s.i, j: s.j, fi: isl.vineSpot.i + 0.5, fj: isl.vineSpot.j + 0.5, why: 'dry', w: 1.6 });
  }
  const krg = knowRelic(isl);
  if (krg && !krg.taken && reach[cidx(krg.i, krg.j)] === 0) {
    const s = near(krg.i, krg.j, 6);
    if (s) spots.push({ i: s.i, j: s.j, fi: krg.i + 0.5, fj: krg.j + 0.5, why: 'relic', w: 2 });
  }
  // Note: gap reactions: a pile waiting for goods, or a tool that cannot do the job yet.
  if (isl.gap) {
    const g = isl.gap;
    const sv0 = storehouse(isl);
    if (g.why === 'goods' && sv0) spots.push({ i: sv0.door.i, j: sv0.door.j, fi: sv0.x + sv0.size / 2, fj: sv0.y + sv0.size / 2, fi2: g.at.i + 0.5, fj2: g.at.j + 0.5, why: 'goods', w: 1.2 });
    else if (g.why === 'skill') spots.push({ i: g.at.i, j: g.at.j, fi: g.at.i + 0.5, fj: g.at.j + 0.5, why: 'skill', w: 2.5 });
  }
  // Note: place gap: goods are ready but no flat site exists; folk point at the roughest ground near home.
  if (isl.placeGap && world.time - isl.placeGap < 30) {
    const sv1 = storehouse(isl);
    if (sv1) {
      let best = null; let bs = 0;
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const c = cidx(i, j);
        if (!isl.mask[c] || isl.bld[c] >= 0 || isl.water[c] > 0.05) continue;
        const d = Math.hypot(i - sv1.door.i, j - sv1.door.j);
        if (d > 9 || d < 2) continue;
        const h = isl.cellH(i, j);
        const rough = Math.abs(h - isl.cellH(i + 1, j)) + Math.abs(h - isl.cellH(i - 1, j)) + Math.abs(h - isl.cellH(i, j + 1)) + Math.abs(h - isl.cellH(i, j - 1));
        if (rough > bs) { bs = rough; best = [i, j]; }
      }
      if (best) spots.push({ i: sv1.door.i, j: sv1.door.j, fi: best[0] + 0.5, fj: best[1] + 0.5, why: 'place', w: 2.2 });
    }
  }
  for (const l of world.links) {
    if (l.a !== isl.id && l.b !== isl.id) continue;
    if (l.state === 'done') continue;
    const myEnd = l.a === isl.id ? l.ai : l.bi;
    const otherId = l.a === isl.id ? l.b : l.a;
    const o = world.islands.get(otherId);
    if (!o) continue;
    spots.push({ i: myEnd.i, j: myEnd.j, fi: o.cx + (o.wx - isl.wx), fj: o.cz + (o.wz - isl.wz), why: 'far', w: 1.2 });
  }
  isl.gaze = spots;
  return spots;
}
