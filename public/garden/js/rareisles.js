// Note: pure rare-island module: fixed slots, vertical set-piece terrain, dormancy; imports no view, models or three.

import { N, MAX_H, MIN_H, SOIL_MAX } from './config.js';
import { cidx, vidx, VN, inB, DEP, PK, generateIsland, anchorsBetween } from './island.js';
import { reachMap, nearestWalkable } from './path.js';
import { hash2, hashStr, rng, fbm, clamp, lerp } from './rand.js';
import { PIER, PIER_DIRS, pierDirs } from './pier.js';

export const RARE_TRAITS = ['volcanic', 'springs', 'frozen', 'arid', 'misty', 'crystal'];
export const RARE_GOOD = { misty: 'moonpearl', crystal: 'prism', volcanic: 'obsidian', springs: 'sulphur', frozen: 'everbloom', arid: 'sunstone' };
export const RARE_NAME = { springs: 'Terraced Hot Pools', volcanic: 'Obsidian Cone', frozen: 'Hanging Garden', arid: 'Forgotten Temple', misty: 'Mist Sea', crystal: 'Crystal Spires', spire: 'Spire' };
// Note: rare islands sit on these rings, two each on 4, 5 and 6; the Spire sits on ring 3 inside the fog.
export const RARE_RINGS = [4, 4, 5, 5, 6, 6];
// Note: rare islands beyond this ring are reached by airship only; links never target them.
export const LINK_MAX_RING = 4;
export const SPIRE_RING = 3;
export const SEA = 2.7;

// Note: paint codes per cell, read by terrain.js for ground and water colour; 0 means none.
export const PAINT = {
  NONE: 0, STONE: 1, RUIN: 2, PIER: 3, PEARL: 4, BED: 5, OBSIDIAN: 6, LAVA: 7, SULPHUR: 8, SUNSTONE: 9,
  PRISM: 10, RIM: 11, PLINTH: 12, ICE: 13, HOT: 14, SAND: 15, MOSS: 16,
};

// Note: ring cell k (0..8r-1) walks the square ring clockwise from its north-west corner.
export function ringCell(r, k) {
  const t = k % (2 * r);
  const side = Math.floor(k / (2 * r)) % 4;
  if (side === 0) return [-r + t, -r];
  if (side === 1) return [r, -r + t];
  if (side === 2) return [r - t, r];
  return [-r, r - t];
}

const slotCache = new Map();

// Note: pure; returns { trait: [{ring, k, gx, gz}] } for the six rare traits and 'spire', identical for equal seeds.
export function rareSlots(seed) {
  const sd = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  if (slotCache.has(sd)) return slotCache.get(sd);
  const r = rng(hash2(sd | 0, 0x5a17, 6));
  const order = RARE_TRAITS.slice();
  for (let m = order.length - 1; m > 0; m--) { const q = Math.floor(r() * (m + 1)); [order[m], order[q]] = [order[q], order[m]]; }
  const taken = [];
  const pick = (ring) => {
    const n = 8 * ring;
    for (let tries = 0; tries < 200; tries++) {
      const k = Math.floor(r() * n);
      const [gx, gz] = ringCell(ring, k);
      // Note: slots keep at least 3 cells of ring distance from each other, none on a corner.
      if (taken.some((o) => Math.max(Math.abs(o.gx - gx), Math.abs(o.gz - gz)) < 3)) continue;
      if (Math.abs(gx) === ring && Math.abs(gz) === ring && tries < 150) continue;
      const e = { ring, k, gx, gz };
      taken.push(e);
      return e;
    }
    const [gx, gz] = ringCell(ring, 0);
    const e = { ring, k: 0, gx, gz };
    taken.push(e);
    return e;
  };
  const out = {};
  order.forEach((t, n) => { out[t] = [pick(RARE_RINGS[n])]; });
  out.spire = [pick(SPIRE_RING)];
  slotCache.set(sd, out);
  return out;
}

// Note: grid distance (Chebyshev) from a cell to the nearest rare island or the Spire; the endgame pulls links and expeditions that way.
export function goalDist(seed, gx, gz) {
  const s = rareSlots(seed);
  let best = 99;
  for (const t in s) for (const e of s[t]) best = Math.min(best, Math.max(Math.abs(e.gx - gx), Math.abs(e.gz - gz)));
  return best;
}

// Note: like goalDist but only the Spire and the rare slots on rings up to LINK_MAX_RING count; links pull that way.
export function goalDistLink(seed, gx, gz) {
  const s = rareSlots(seed);
  let best = 99;
  for (const t in s) for (const e of s[t]) if (e.ring <= LINK_MAX_RING) best = Math.min(best, Math.max(Math.abs(e.gx - gx), Math.abs(e.gz - gz)));
  return best;
}

// Note: the rare trait, 'spire' or null for a grid cell.
export function slotAt(seed, gx, gz) {
  const s = rareSlots(seed);
  for (const t in s) if (s[t].some((e) => e.gx === gx && e.gz === gz)) return t;
  return null;
}

const planCache = new Map();
const ringOf = (gx, gz) => Math.max(Math.abs(gx), Math.abs(gz));
const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const ringCells = (r) => { const out = []; for (let k = 0; k < 8 * r; k++) out.push(ringCell(r, k)); return out; };
// Note: which of the four sides of ring r a cell lies on, matching ringCell order.
const sideOf = (r, gx, gz) => (gz === -r && gx < r ? 0 : gx === r && gz < r ? 1 : gz === r && gx > -r ? 2 : 3);

// Note: link spans in anchor gap; a hop keeps this much below its span so buildings on the source island never break it.
const SPAN_ROPE = 34;
const SPAN_BALLOON = 42;
const SPAN_MARGIN = 1;
const PLAN_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Note: cheapest route cost to every plain island (rings 0 to 4, no rare or Spire slot) from home over hops of at most span - margin by the real anchor gap.
// Note: a source island offers the cells its crew can walk from the entry cell of the hop that brought them; home offers every walkable cell.
// Note: hop cost mirrors the capital route search (1 + gap / 50), plus a little for a hop only a balloon spans.
function routeCosts(isl, span, ringMax) {
  const lim = span - SPAN_MARGIN;
  const dist = new Map([['0,0|', { key: '0,0|', id: '0,0', gx: 0, gz: 0, e: null, cost: 0, done: false }]]);
  const best = new Map([['0,0', { cost: 0, gap: 0 }]]);
  for (;;) {
    let cur = null;
    for (const st of dist.values()) if (!st.done && (!cur || st.cost < cur.cost || (st.cost === cur.cost && st.key < cur.key))) cur = st;
    if (!cur) break;
    cur.done = true;
    const X = isl(cur.gx, cur.gz);
    const reach = cur.e ? reachMap(X, cur.e.i, cur.e.j) : null;
    for (const [dx, dz] of PLAN_DIRS) {
      const gx = cur.gx + dx; const gz = cur.gz + dz;
      if (ringOf(gx, gz) > ringMax) continue;
      const Y = isl(gx, gz);
      if (!Y) continue;
      const an = anchorsBetween(X, Y, reach);
      if (!an || an.gap > lim) continue;
      const cost = cur.cost + 1 + an.gap / 50 + (an.gap > SPAN_ROPE - SPAN_MARGIN ? 0.6 : 0);
      const id = `${gx},${gz}`;
      const key = `${id}|${an.bi.i},${an.bi.j}`;
      const old = dist.get(key);
      if (!old || cost < old.cost) dist.set(key, { key, id, gx, gz, e: an.bi, cost, done: false });
      const b = best.get(id);
      if (!b || cost < b.cost) best.set(id, { cost, gap: an.gap });
    }
  }
  return best;
}

// Note: pure per seed, memoised; returns { 'gx,gz': knowledge } of the fixed relics for rings 2 to 4, never on rare or Spire slots.
// Note: ring 1 keeps its own dice in island.js; ring 2 holds ballooning x2, weaving, smithing, smoking, husbandry; ring 3 lampcraft and glasswork; ring 4 navigation x2 and pulleys x2.
// Note: islands rank by route cost over the real anchor gaps from home: a rope route (gap <= 34) leads to a ballooning and a weaving island on ring 2, a balloon route (gap <= 42) to a navigation island on ring 4.
export function relicPlan(seed) {
  const sd = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  if (planCache.has(sd)) return planCache.get(sd);
  const slotCells = [];
  const s = rareSlots(sd);
  for (const t in s) for (const e of s[t]) slotCells.push([e.gx, e.gz]);
  const isSlot = (c) => slotCells.some((o) => o[0] === c[0] && o[1] === c[1]);
  // Note: terrain does not depend on the relic, so a plain generated island has the geometry the world will see; none for slot cells.
  const made = new Map();
  const isl = (gx, gz) => {
    if (isSlot([gx, gz])) return null;
    const id = `${gx},${gz}`;
    if (!made.has(id)) made.set(id, generateIsland(sd, gx, gz, null));
    return made.get(id);
  };
  const rope = routeCosts(isl, SPAN_ROPE, 4);
  const balloon = routeCosts(isl, SPAN_BALLOON, 4);
  made.clear();
  const idOf = (c) => `${c[0]},${c[1]}`;
  const byHash = (cells, salt) => cells.slice().sort((a, b) => hash2(a[0], a[1], sd + salt) - hash2(b[0], b[1], sd + salt) || a[0] - b[0] || a[1] - b[1]);
  // Note: cells by route cost, rope routes first, then balloon routes, then the unreachable by hash.
  const ranked = (cells, salt) => {
    const key = (c) => (rope.has(idOf(c)) ? rope.get(idOf(c)).cost : balloon.has(idOf(c)) ? 100 + balloon.get(idOf(c)).cost : 1000);
    return byHash(cells, salt).sort((a, b) => key(a) - key(b));
  };
  const out = {};
  const put = (c, know) => { out[idOf(c)] = know; };

  // Note: ring 2, the weaving and the first ballooning island sit at rope span; the second ballooning island sits on another side so one blocked route never costs the tech.
  const c2 = ranked(ringCells(2).filter((c) => !isSlot(c)), 0x2e11);
  const b1 = c2[0];
  const weave = c2.find((c) => c !== b1 && rope.has(idOf(c))) || c2[1];
  const b2 = c2.find((c) => c !== b1 && c !== weave && sideOf(2, c[0], c[1]) !== sideOf(2, b1[0], b1[1])) || c2.find((c) => c !== b1 && c !== weave);
  put(b1, 'ballooning'); put(b2, 'ballooning'); put(weave, 'weaving');
  const others = byHash(c2.filter((c) => !out[idOf(c)]), 0x2e11c);
  ['smithing', 'smoking', 'husbandry'].forEach((k, n) => { if (others[n]) put(others[n], k); });

  // Note: ring 3 crafts sit on the cheapest balloon routes.
  const c3 = ranked(ringCells(3).filter((c) => !isSlot(c)), 0x3a77);
  put(c3[0], 'lampcraft'); put(c3[1], 'glasswork');

  // Note: ring 4 tech goes to the cheapest routes that keep 3 cells from each other and from ring-4 rare slots; reachable islands beat spacing, and the distance relaxes only if the ring cannot fit it.
  const c4 = ranked(ringCells(4).filter((c) => !isSlot(c)), 0x4b05);
  const reachable = c4.filter((c) => balloon.has(idOf(c)) || rope.has(idOf(c)));
  const used = slotCells.filter((c) => ringOf(c[0], c[1]) === 4);
  ['navigation', 'navigation', 'pulleys', 'pulleys'].forEach((know, n) => {
    let pick = null;
    // Note: the first navigation island always sits on a route; the rest keep their distance first.
    const tries = n === 0 ? [[reachable, 3], [reachable, 2], [reachable, 1]] : [3, 2, 1].flatMap((d) => [[reachable, d], [c4, d]]);
    for (const [list, d] of tries) { if (!pick) pick = list.find((c) => !out[idOf(c)] && used.every((o) => cheb(o, c) >= d)) || null; }
    if (!pick) return;
    used.push(pick); put(pick, know);
  });
  planCache.set(sd, out);
  return out;
}

// Note: rare islands sleep until a relic key string sits in isl.relic; the Spire is never dormant.
export function isDormant(isl) { return !!isl.rareSlot && typeof isl.relic !== 'string'; }
// Note: the knowledge relic object { know, i, j, taken } or null; a string relic (rare key) never counts.
export function knowRelic(isl) { return isl.relic && typeof isl.relic === 'object' ? isl.relic : null; }
// Note: the relic of isl when it still teaches `know`, else null.
export function relicFor(isl, know) { const r = knowRelic(isl); return r && !r.taken && r.know === know ? r : null; }
export function relicKey(trait) { return `${trait}-key`; }
export function activate(isl, key) {
  if (!isl.rareSlot || !key || typeof key !== 'string') return false;
  isl.relic = key;
  isl.dormant = false;
  if (isl.touch) isl.touch('terrain');
  return true;
}

// Note: live rare-good deposits; empty while dormant.
export function rareDeposits(isl) {
  if (!isl.rare || isDormant(isl)) return [];
  return isl.rare.deposits.filter((d) => d.n > 0);
}
export function takeRare(isl, dep) {
  if (!rareDeposits(isl).includes(dep)) return null;
  dep.n--;
  return dep.good;
}
export function rareState(isl) { return isl.rare ? isl.rare.deposits.map((d) => d.n) : []; }
export function restoreRare(isl, arr) {
  if (!isl.rare || !Array.isArray(arr)) return;
  isl.rare.deposits.forEach((d, k) => { if (Number.isFinite(arr[k])) d.n = arr[k]; });
}
// Note: snow and rain never settle on bed cells of the Hanging Garden.
export function isBed(isl, i, j) { return !!isl.paint && isl.paint[cidx(i, j)] === PAINT.BED; }

const sm = (t) => t * t * (3 - 2 * t);
const X = (i) => i + 0.5 - N / 2;
const tread = (base, step, flat) => {
  const s = base / step; const k = Math.floor(s); const f = s - k;
  return (k + sm(clamp((f - flat) / (1 - flat), 0, 1))) * step;
};

function scratch() {
  const n = N * N;
  return {
    ch: new Float32Array(n).fill(3), mask: new Uint8Array(n), paint: new Uint8Array(n), lvl: new Float32Array(n).fill(NaN),
    soil: new Float32Array(n).fill(-1), snow: new Float32Array(n).fill(-1), ash: new Float32Array(n), moist: new Float32Array(n).fill(-1),
    keep: new Uint8Array(n), cap: 0.4, sites: {}, deposits: [], features: [], springs: [], geysers: [], plants: [], dips: [],
  };
}

function blobMask(S, s0, rad, ox, oz, wobAmp) {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = Math.hypot(X(i) - ox, X(j) - oz) / rad;
    const wob = (fbm(s0 + 7, i * 0.3, j * 0.3, 2) - 0.5) * wobAmp;
    S.mask[cidx(i, j)] = d + wob < 1 ? 1 : 0;
  }
}

// Note: flattens the (size+2) square around a size x size site, forces it dry and land, and blends the terrain outside.
function padRect(S, x0, y0, size, level, name, blend = 2.6, paint = PAINT.STONE) {
  const a = x0 - 1; const b = x0 + size; const c = y0 - 1; const d = y0 + size;
  const R = Math.ceil(blend) + 1;
  for (let j = c - R; j <= d + R; j++) for (let i = a - R; i <= b + R; i++) {
    if (!inB(i, j)) continue;
    const q = cidx(i, j);
    const dist = Math.hypot(Math.max(a - i, 0, i - b), Math.max(c - j, 0, j - d));
    if (dist === 0) {
      S.ch[q] = level; S.mask[q] = 1; S.keep[q] = 1; S.lvl[q] = NaN; S.paint[q] = paint; S.soil[q] = 0.9;
      S.snow[q] = 0; S.ash[q] = 0;
    } else if (dist < blend && S.mask[q]) {
      S.ch[q] = lerp(level, S.ch[q], sm(dist / blend));
    }
  }
  S.sites[name] = { x: x0, y: y0, size };
  S.features.push({ kind: 'pad', name, i: x0, j: y0, size });
}

// Note: an airdock site: a 3x3 block on the rim near (x0, y0) whose pier side is void; the block and its land ring are flattened, the pier band is left alone.
function padPier(S, x0, y0, blend = 2.6, paint = PAINT.STONE) {
  const size = PIER.size;
  const fake = { mask: S.mask };
  const special = new Set();
  for (const o of [...S.deposits, ...S.features.filter((f) => f.kind !== 'pad'), ...S.springs, ...S.geysers]) if (inB(o.i, o.j)) special.add(cidx(o.i, o.j));
  let best = null; let bs = 1e9;
  for (let y = 0; y <= N - size; y++) for (let x = 0; x <= N - size; x++) {
    let land = 0; let bad = false;
    for (let j = y - 1; j <= y + size && !bad; j++) for (let i = x - 1; i <= x + size; i++) {
      if (!inB(i, j)) continue;
      const q = cidx(i, j);
      const inside = i >= x && j >= y && i < x + size && j < y + size;
      if (S.keep[q] && !inside && S.mask[q]) { bad = true; break; }
      if (!inside) continue;
      if (S.keep[q] || special.has(q) || (S.cap < 1 && Number.isFinite(S.lvl[q]) && S.mask[q])) { bad = true; break; }
      if (S.mask[q]) land++;
    }
    if (bad || land < 6) continue;
    if (Object.values(S.sites).some((r) => x < r.x + r.size + 2 && x + size > r.x - 2 && y < r.y + r.size + 2 && y + size > r.y - 2)) continue;
    const dirs = pierDirs(fake, x, y, size);
    for (const d of dirs) {
      const [dx, dz] = PIER_DIRS[d];
      // Note: the back row, opposite the pier, needs two land cells so folk can walk around the block.
      let back = 0;
      for (let t = 0; t < size; t++) {
        const i = dx ? (dx > 0 ? x - 1 : x + size) : x + t;
        const j = dz ? (dz > 0 ? y - 1 : y + size) : y + t;
        if (inB(i, j) && S.mask[cidx(i, j)]) back++;
      }
      if (back < 2) continue;
      const sc = Math.hypot(x + 1 - x0 - 1, y + 1 - y0 - 1) + (9 - land) * 0.8;
      if (sc < bs) { bs = sc; best = { x, y, d }; }
    }
  }
  // Attention: no rim spot fits only when a design changes; the audit then reports the missing airdock side.
  if (!best) { S.sites.airdock = { x: x0, y: y0, size, dir: 0 }; return; }
  const { x, y, d } = best;
  const [dx, dz] = PIER_DIRS[d];
  const isBand = (i, j) => (dx ? (dx > 0 ? i >= x + size : i < x) : (dz > 0 ? j >= y + size : j < y));
  let sum = 0; let n = 0;
  for (let j = y - 1; j <= y + size; j++) for (let i = x - 1; i <= x + size; i++) {
    if (inB(i, j) && S.mask[cidx(i, j)] && !isBand(i, j)) { sum += S.ch[cidx(i, j)]; n++; }
  }
  const level = clamp(sum / Math.max(1, n), 2.6, 8.6);
  const a = x - 1; const b = x + size; const c = y - 1; const e = y + size;
  const R = Math.ceil(blend) + 1;
  for (let j = c - R; j <= e + R; j++) for (let i = a - R; i <= b + R; i++) {
    if (!inB(i, j) || isBand(i, j)) continue;
    const q = cidx(i, j);
    const inside = i >= x && j >= y && i < x + size && j < y + size;
    const dist = Math.hypot(Math.max(a - i, 0, i - b), Math.max(c - j, 0, j - e));
    if (inside || (dist === 0 && S.mask[q])) {
      if (inside) S.mask[q] = 1;
      S.ch[q] = level; S.keep[q] = 1; S.lvl[q] = NaN; S.paint[q] = paint; S.soil[q] = 0.9; S.snow[q] = 0; S.ash[q] = 0;
    } else if (dist > 0 && dist < blend && S.mask[q]) S.ch[q] = lerp(level, S.ch[q], sm(dist / blend));
  }
  S.sites.airdock = { x, y, size, dir: d };
  S.features.push({ kind: 'pad', name: 'airdock', i: x, j: y, size });
}

// Note: ---- the island designs; each fills the scratch S in canonical orientation ----

function springsIsle(S, s0) {
  blobMask(S, s0, 11.2, 0, 0, 0.3);
  const step = 1.4; const flat = 0.65;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const w = x - z;
    const base = clamp(2.6 + (w + 15) / 30 * 4.2, 2.1, 7.0);
    const s = base / step; const f = s - Math.floor(s);
    const q = cidx(i, j);
    S.ch[q] = tread(base, step, flat) + (fbm(s0 + 3, x * 0.35, z * 0.35, 2) - 0.5) * 0.14;
    S.soil[q] = f > flat ? 0.15 : 0.7;
    if (f > flat + 0.1) S.paint[q] = PAINT.RIM;
  }
  const wk = (k) => (((k + 0.325) * step - 2.6) / 4.2) * 30 - 15;
  const pool = (k, v, sw, sv) => {
    // Note: ellipse axes run along w (slope) and v (across); rotate by 45 degrees into x, z.
    const w = wk(k); const L = k * step;
    const cells = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = cidx(i, j);
      if (!S.mask[q]) continue;
      const x = X(i); const z = X(j);
      const e = Math.hypot(((x - z) - w) / sw, ((x + z) - v) / sv);
      if (e < 1) { S.ch[q] = L - 0.38; S.lvl[q] = L; S.paint[q] = PAINT.HOT; S.soil[q] = 0; cells.push(q); }
      else if (e < 1.4) { S.ch[q] = Math.max(S.ch[q], L + 0.22); S.paint[q] = PAINT.RIM; S.soil[q] = 0.1; }
    }
    const cx = (v + w) / 2; const cz = (v - w) / 2;
    S.features.push({ kind: 'pool', i: Math.floor(cx + N / 2), j: Math.floor(cz + N / 2), level: L });
    return { cells, cx, cz, L };
  };
  const p1 = pool(2, 0, 3.0, 6.0);
  const p2 = pool(3, -8.5, 2.8, 3.8);
  const p3 = pool(3, 8.5, 2.8, 3.8);
  const p4 = pool(4, 5, 2.8, 4.5);
  for (const p of [p2, p4]) S.springs.push({ i: Math.floor(p.cx + N / 2), j: Math.floor(p.cz + N / 2), hot: true });
  // Note: sulphur crusts sit on the rims of the three upper pools.
  const crust = [[p2, 0], [p2, 2.4], [p3, 1.2], [p3, 4], [p4, 3.3], [p4, 5.2], [p1, 2.0]];
  for (const [p, a] of crust) {
    const ci = Math.round(p.cx + N / 2 - 0.5 + Math.cos(a) * 3.2); const cj = Math.round(p.cz + N / 2 - 0.5 + Math.sin(a) * 3.2);
    if (inB(ci, cj) && S.mask[cidx(ci, cj)] && !S.keep[cidx(ci, cj)] && !Number.isFinite(S.lvl[cidx(ci, cj)])) {
      S.paint[cidx(ci, cj)] = PAINT.SULPHUR;
      S.deposits.push({ i: ci, j: cj, n: 4 });
    }
  }
  padRect(S, 10, 11, 3, 4.2, 'landmark');
  padPier(S, 12, 3);
  S.moist.fill(0.55);
  S.plantKinds = { tree: 0.05, bush: 0.05, reed: 0.35 };
}

function volcanicIsle(S, s0) {
  blobMask(S, s0, 11.2, 0, 0, 0.3);
  const cx = 4; const cz = -3;
  const prof = [[0, 7.4], [1.2, 7.4], [2.0, 8.6], [2.7, 8.3], [9.5, 3.0], [30, 3.0]];
  const hp = (d) => {
    for (let k = 1; k < prof.length; k++) if (d <= prof[k][0]) return lerp(prof[k - 1][1], prof[k][1], (d - prof[k - 1][0]) / (prof[k][0] - prof[k - 1][0]));
    return 3;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    const d = Math.hypot(x - cx, z - cz);
    S.ch[q] = hp(d) + (fbm(s0 + 3, x * 0.4, z * 0.4, 2) - 0.5) * 0.25 * clamp(d / 4, 0, 1);
    S.soil[q] = d < 8 ? 0.15 : 0.55;
    if (d < 1.2) { S.paint[q] = PAINT.LAVA; S.soil[q] = 0; }
    else if (d < 2.7) { S.paint[q] = PAINT.OBSIDIAN; S.soil[q] = 0; }
    if (fbm(s0 + 31, x * 0.3, z * 0.3, 2) > 0.42 || (d > 2.5 && d < 7 && fbm(s0 + 33, x * 0.5, z * 0.5, 2) > 0.5)) { S.ash[q] = 0.9; S.soil[q] *= 0.5; }
  }
  S.features.push({ kind: 'cone', i: Math.floor(cx + N / 2), j: Math.floor(cz + N / 2) });
  S.features.push({ kind: 'crater', i: Math.floor(cx + N / 2), j: Math.floor(cz + N / 2) });
  // Note: an obsidian ridge arcs around the south and west flanks with one wide pass.
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    if (!S.mask[q]) continue;
    const d = Math.hypot(x - cx, z - cz);
    let a = Math.atan2(z - cz, x - cx) * 180 / Math.PI; if (a < 0) a += 360;
    if (Math.abs(d - 6.4) < 0.8 && a > 70 && a < 250 && !(a > 140 && a < 172)) {
      S.ch[q] += 2.5; S.paint[q] = PAINT.OBSIDIAN; S.soil[q] = 0;
      if (Math.abs(d - 6.4) < 0.45 && (i + j) % 3 === 0) S.deposits.push({ i, j, n: 4 });
    }
  }
  for (const [gi, gj] of [[8, 14], [18, 17]]) S.geysers.push({ i: gi, j: gj, t: 5 + (gi + gj) % 20 });
  padRect(S, 4, 14, 3, 3.0, 'landmark');
  padPier(S, 2, 3);
  S.moist.fill(0.3);
  S.plantKinds = { bush: 0.05, tree: 0.03 };
  S.depOre = 5;
}

function frozenIsle(S, s0) {
  blobMask(S, s0, 11.2, 0, 0, 0.3);
  const lv = [[4.6, 8.6], [7.0, 7.2], [9.6, 5.8], [99, 4.4]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    const d = Math.hypot(x, z);
    let k = 0; while (d > lv[k][0]) k++;
    S.ch[q] = lv[k][1];
    S.snow[q] = 0.85; S.soil[q] = 0.2; S.paint[q] = PAINT.ICE;
    // Note: snow-free everbloom beds fill the outer band of each terrace in three wedges.
    const outer = k < 3 ? lv[k][0] - d : 99;
    const ang = (Math.atan2(z, x) / (Math.PI * 2) + 1) % 1;
    const wedge = (Math.floor(ang * 6 + k * 0.5) % 2) === 0;
    if (k < 3 && outer < 1.5 && outer >= 0 && wedge && S.mask[q]) { S.snow[q] = 0; S.soil[q] = SOIL_MAX; S.paint[q] = PAINT.BED; }
    else if (k === 0) S.paint[q] = PAINT.PLINTH;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const q = cidx(i, j);
    if (S.paint[q] === PAINT.BED && S.mask[q] && (i * 3 + j * 5) % 7 === 0 && S.deposits.length < 8) { S.deposits.push({ i, j, n: 4 }); }
  }
  // Note: ice arches stand on four tread cells across the spiral lanes; the view bridges each pair.
  for (const [ax, az, bx, bz] of [[-1, -7, 1, -7], [7, -1, 7, 1], [-1, 6, 1, 6], [-6, -1, -6, 1]]) {
    const ai = Math.floor(ax + N / 2); const aj = Math.floor(az + N / 2); const bi = Math.floor(bx + N / 2); const bj = Math.floor(bz + N / 2);
    S.features.push({ kind: 'arch', i: ai, j: aj, i2: bi, j2: bj });
  }
  padRect(S, 10, 10, 3, 8.6, 'landmark', 2.6, PAINT.PLINTH);
  padPier(S, 4, 15, 2.6, PAINT.STONE);
  S.moist.fill(0.45);
  S.plantKinds = { pine: 0.06 };
}

function aridIsle(S, s0) {
  blobMask(S, s0, 11.0, 0, 0, 0.3);
  const px = 2.5; const pz = -2.5;
  const lv = [[2, 8.2], [4, 6.8], [6, 5.4]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    const dc = Math.max(Math.abs(x - px), Math.abs(z - pz));
    let h = 3.9 + (fbm(s0 + 3, x * 0.22, z * 0.22, 3) - 0.5) * 0.9;
    S.soil[q] = 0; S.paint[q] = PAINT.SAND;
    let k = 0; while (k < lv.length && dc > lv[k][0] + 0.01) k++;
    if (k < lv.length) {
      h = lv[k][1]; S.paint[q] = PAINT.RUIN; S.mask[q] = 1;
      // Note: a stair lane in the middle of each side ramps the risers.
      const lane = Math.min(Math.abs(x - px), Math.abs(z - pz)) < 1.01;
      if (lane && dc > 2.01) h = lv[k][1] - 0.35 * (k < 2 ? 1 : 1.4);
    }
    S.ch[q] = h;
  }
  // Note: a sunken court west of the pyramid; its floor holds the sunstone alcoves.
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    if (x > -10.2 && x < -5.8 && z > -8.2 && z < -2.8 && S.mask[q] && !S.keep[q]) { S.ch[q] = 2.6; S.paint[q] = PAINT.RUIN; }
  }
  for (const [i, j] of [[3, 5], [4, 7], [5, 9], [4, 10], [6, 6], [6, 10]]) {
    if (S.mask[cidx(i, j)]) { S.paint[cidx(i, j)] = PAINT.SUNSTONE; S.deposits.push({ i, j, n: 4 }); }
  }
  // Note: fallen columns lie on the sand and the lower steps; each can be restored.
  for (const [i, j, r] of [[8, 19, 0.3], [14, 20, 1.2], [20, 18, 2.1], [21, 12, 0.7], [20, 3, 1.9], [9, 2, 2.6], [15, 21, 0.1], [5, 14, 1.4]]) {
    if (S.mask[cidx(i, j)]) S.features.push({ kind: 'column', i, j, rot: r });
  }
  padRect(S, 11, 8, 3, 8.2, 'landmark', 2.6, PAINT.RUIN);
  padPier(S, 3, 16, 2.6, PAINT.SAND);
  S.moist.fill(0.12);
  S.plantKinds = { bush: 0.025 };
}

function mistIsle(S, s0) {
  blobMask(S, s0, 11.6, 0, 0, 0.22);
  S.cap = 1.4;
  const hills = [[-3.5, 0.5, 4.8, 4.6], [3, -6.5, 3.4, 2.2], [-6.5, 7, 3.3, 2.2], [6.5, 6.5, 3.2, 2.0]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    const n = fbm(s0 + 3, x * 0.3, z * 0.3, 3);
    let h = 2.55 + (n - 0.5) * 0.9;
    // Note: two lagoons stay deep so folk wade around them.
    for (const [lx, lz] of [[2, 2.5], [-3, -7]]) { const d = Math.hypot(x - lx, z - lz); if (d < 3.2) h = Math.min(h, 1.5 + d * 0.22); }
    for (const [hx, hz, top, r] of hills) { const d = Math.hypot(x - hx, z - hz); if (d < r + 1.6) h = Math.max(h, lerp(top, 2.5, sm(clamp((d - r * 0.35) / (r * 1.2 + 1.6), 0, 1)))); }
    S.ch[q] = h; S.lvl[q] = SEA; S.soil[q] = h > SEA + 0.4 ? 0.8 : 0;
    S.paint[q] = h > SEA + 0.3 ? PAINT.NONE : PAINT.SAND;
  }
  // Note: a plank pier runs east from the isle across the shallows to a head platform.
  const pj = 12;
  for (let i = 9; i <= 17; i++) { const q = cidx(i, pj); S.ch[q] = 3.7; S.mask[q] = 1; S.lvl[q] = NaN; S.paint[q] = PAINT.PIER; S.soil[q] = 0; S.keep[q] = 1; }
  for (let i = 10; i <= 17; i += 2) S.features.push({ kind: 'post', i, j: pj - 1 });
  S.features.push({ kind: 'pier', i: 9, j: pj, i2: 17, j2: pj });
  // Note: pearl beds lie in the clear shallows around the isle.
  for (const [i, j] of [[5, 5], [8, 17], [15, 16], [4, 15], [17, 6], [13, 20], [7, 8], [19, 12]]) {
    S.paint[cidx(i, j)] = PAINT.PEARL; S.deposits.push({ i, j, n: 4 }); S.ch[cidx(i, j)] = Math.max(S.ch[cidx(i, j)], 2.45);
  }
  padRect(S, 6, 11, 3, 4.4, 'landmark', 3.0, PAINT.STONE);
  padPier(S, 19, 11, 2.2, PAINT.PIER);
  S.moist.fill(0.85);
  S.plantKinds = { glowcap: 0.05, vine: 0.04 };
}

function crystalIsle(S, s0) {
  blobMask(S, s0, 11.2, 0, 0, 0.3);
  const spires = [];
  const R = rng(s0 ^ 0x77);
  for (const a of [0, 55, 110, 215, 265, 315]) {
    const r = 7 + R() * 1.2; const rad = a * Math.PI / 180;
    spires.push({ x: Math.cos(rad) * r, z: Math.sin(rad) * r, h: 8.5 + R() * 2.5, w: 2.1 + R() * 0.5 });
  }
  spires.push({ x: 3.6, z: -3.8, h: 7.8, w: 2.2 });
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    let h = 3.7 + (fbm(s0 + 3, x * 0.25, z * 0.25, 3) - 0.5) * 1.1;
    S.soil[q] = 0.3;
    for (const sp of spires) {
      const d = Math.hypot(x - sp.x, z - sp.z);
      if (d < sp.w) { h = Math.max(h, 3.7 + sp.h * (1 - d / sp.w)); S.paint[q] = PAINT.PRISM; S.soil[q] = 0; }
    }
    S.ch[q] = h;
  }
  for (const sp of spires) S.features.push({ kind: 'spire', i: Math.floor(sp.x + N / 2), j: Math.floor(sp.z + N / 2), h: sp.h });
  for (const sp of spires) {
    for (let a = 0; a < 6.3; a += 2.1) {
      const ci = Math.floor(sp.x + N / 2 + Math.cos(a + sp.h) * (sp.w + 0.8)); const cj = Math.floor(sp.z + N / 2 + Math.sin(a + sp.h) * (sp.w + 0.8));
      if (inB(ci, cj) && S.mask[cidx(ci, cj)] && S.ch[cidx(ci, cj)] < 5.2 && S.deposits.length < 9 && !S.deposits.some((d) => d.i === ci && d.j === cj)) {
        S.deposits.push({ i: ci, j: cj, n: 4 }); S.paint[cidx(ci, cj)] = PAINT.PRISM;
      }
    }
  }
  padRect(S, 10, 10, 3, 4.6, 'landmark', 2.6, PAINT.PLINTH);
  padPier(S, 4, 15, 2.6, PAINT.STONE);
  S.moist.fill(0.4);
  S.plantKinds = { bush: 0.03, flower: 0.05 };
  S.depCrystal = 5;
}

function spireIsle(S, s0) {
  blobMask(S, s0, 10.8, 0, 0, 0.28);
  const lv = [[4.7, 8.0], [6.9, 6.6], [8.7, 5.2], [99, 3.9]];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X(i); const z = X(j); const q = cidx(i, j);
    const d = Math.hypot(x, z);
    let k = 0; while (d > lv[k][0]) k++;
    S.ch[q] = lv[k][1] + (k === 3 ? (fbm(s0 + 3, x * 0.3, z * 0.3, 2) - 0.5) * 0.3 : 0);
    S.soil[q] = k === 0 ? 0.1 : 0.85; S.paint[q] = k === 0 ? PAINT.PLINTH : k === 1 ? PAINT.STONE : PAINT.NONE;
  }
  S.features.push({ kind: 'plinth', i: 10, j: 10, size: 4 });
  padRect(S, 10, 10, 4, 8.0, 'greatwork', 2.6, PAINT.PLINTH);
  padPier(S, 17, 16, 2.6, PAINT.STONE);
  S.moist.fill(0.8);
  S.plantKinds = { tree: 0.04, bush: 0.04, glowcap: 0.03 };
}

const DESIGN = { springs: springsIsle, volcanic: volcanicIsle, frozen: frozenIsle, arid: aridIsle, misty: mistIsle, crystal: crystalIsle, spire: spireIsle };

function edgeDist(mask) {
  const d = new Float32Array(N * N).fill(99);
  const land = (i, j) => inB(i, j) && mask[cidx(i, j)] === 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!land(i, j)) d[cidx(i, j)] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = cidx(i, j);
      for (const [di, dj, w] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4], [1, -1, 1.4]]) {
        const ni = i + di; const nj = j + dj;
        if (inB(ni, nj)) d[c] = Math.min(d[c], d[cidx(ni, nj)] + w); else d[c] = Math.min(d[c], 1 + (w > 1 ? 0.4 : 0));
      }
    }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
      const c = cidx(i, j);
      for (const [di, dj, w] of [[1, 0, 1], [0, 1, 1], [1, 1, 1.4], [-1, 1, 1.4]]) {
        const ni = i + di; const nj = j + dj;
        if (inB(ni, nj)) d[c] = Math.min(d[c], d[cidx(ni, nj)] + w); else d[c] = Math.min(d[c], 1 + (w > 1 ? 0.4 : 0));
      }
    }
  }
  return d;
}

// Note: keeps the largest land component so the mask stays one island after forced pads.
function largest(S) {
  const seen = new Uint8Array(N * N); let best = [];
  for (let c0 = 0; c0 < N * N; c0++) {
    if (!S.mask[c0] || seen[c0]) continue;
    const comp = [c0]; seen[c0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q]; const i = c % N; const j = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di; const nj = j + dj;
        if (!inB(ni, nj)) continue;
        const n = cidx(ni, nj);
        if (S.mask[n] && !seen[n]) { seen[n] = 1; comp.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  S.mask.fill(0);
  for (const c of best) S.mask[c] = 1;
  return best.length;
}

// Note: fills isl completely for a rare trait (or 'spire'); deterministic in (isl.seed, trait), idempotent.
export function rareTerrain(isl, trait) {
  const design = DESIGN[trait];
  if (!design) return isl;
  const S = scratch();
  const s0 = isl.seed & 0xffff;
  design(S, s0);
  for (let c = 0; c < N * N; c++) if (!S.mask[c]) { S.lvl[c] = NaN; }
  // Note: one of eight orientations per island; every list and array is mapped through the same transform.
  const sym = hash2(isl.seed | 0, 0x3317, 8) & 7;
  const tx = (i, j) => {
    let a = i; let b = j;
    if (sym & 1) a = N - 1 - a;
    if (sym & 2) b = N - 1 - b;
    if (sym & 4) { const t = a; a = b; b = t; }
    return [a, b];
  };
  const mapArr = (arr, Type) => { const out = new Type(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const [a, b] = tx(i, j); out[cidx(a, b)] = arr[cidx(i, j)]; } return out; };
  const mapRect = (r) => { const [a, b] = tx(r.x, r.y); const [c, d] = tx(r.x + r.size - 1, r.y + r.size - 1); return { x: Math.min(a, c), y: Math.min(b, d), size: r.size }; };
  // Note: a pier direction goes through the same flips and swap as the cells.
  const mapDir = (dir) => {
    let [dx, dz] = PIER_DIRS[dir];
    if (sym & 1) dx = -dx;
    if (sym & 2) dz = -dz;
    if (sym & 4) { const t = dx; dx = dz; dz = t; }
    return PIER_DIRS.findIndex((v) => v[0] === dx && v[1] === dz);
  };
  const P = {
    ch: mapArr(S.ch, Float32Array), mask: mapArr(S.mask, Uint8Array), paint: mapArr(S.paint, Uint8Array), lvl: mapArr(S.lvl, Float32Array),
    soil: mapArr(S.soil, Float32Array), snow: mapArr(S.snow, Float32Array), ash: mapArr(S.ash, Float32Array), moist: mapArr(S.moist, Float32Array),
    keep: mapArr(S.keep, Uint8Array),
  };
  const mp = (o) => { const [a, b] = tx(o.i, o.j); const r = { ...o, i: a, j: b }; if (o.i2 !== undefined) { const [c, d] = tx(o.i2, o.j2); r.i2 = c; r.j2 = d; } return r; };
  const sites = {};
  for (const k in S.sites) { sites[k] = mapRect(S.sites[k]); if (S.sites[k].dir !== undefined) sites[k].dir = mapDir(S.sites[k].dir); }
  const deposits = S.deposits.map(mp);
  const features = S.features.map((f) => {
    if (f.kind !== 'pad') return mp(f);
    const r = mapRect({ x: f.i, y: f.j, size: f.size });
    return { ...f, i: r.x, j: r.y };
  });

  // Note: reset every generated field, then write the design.
  isl.mask.set(P.mask);
  for (const k of ['soil', 'plant', 'grow', 'moist', 'water', 'fire', 'ash', 'snow', 'stone', 'dep', 'depTop', 'depAmt', 'fishCd']) isl[k].fill(0);
  isl.bld.fill(-1);
  isl.buildings = []; isl.springs = []; isl.geysers = []; isl.stock = {};
  isl.relic = null;
  isl.traits = trait === 'spire' ? [] : [trait];
  isl.traitTint = undefined;
  isl.shape = 'rare';
  isl.radius = 11;
  isl.landCount = largest({ mask: isl.mask });
  const cells = [];
  for (let c = 0; c < N * N; c++) if (isl.mask[c]) { cells.push(c); P.ch[c] = clamp(P.ch[c], MIN_H + 0.6, MAX_H - 0.5); }
  // Note: vertex height is the mean of the surrounding land cells' target heights.
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    let s = 0; let n = 0;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ci = i + di; const cj = j + dj;
      if (inB(ci, cj) && isl.mask[cidx(ci, cj)]) { s += P.ch[cidx(ci, cj)]; n++; }
    }
    isl.h[vidx(i, j)] = n ? s / n : 2.8;
  }
  const ed = edgeDist(isl.mask);
  const s1 = isl.seed & 0xffff;
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    let d = 99;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ci = i + di; const cj = j + dj;
      if (inB(ci, cj) && isl.mask[cidx(ci, cj)]) d = Math.min(d, ed[cidx(ci, cj)]);
    }
    isl.under[vidx(i, j)] = d === 99 ? 0 : 1.2 + d * 1.15 + fbm(s1 + 21, i * 0.35, j * 0.35, 2) * 2.2;
  }
  const R = rng(hash2(isl.seed | 0, 0x91, 5));
  isl.hold = new Float32Array(N * N);
  for (const c of cells) {
    const i = c % N; const j = (c / N) | 0;
    const h = isl.cellH(i, j);
    isl.soil[c] = P.soil[c] >= 0 ? P.soil[c] : clamp(SOIL_MAX * 0.85 - Math.max(0, h - 5) * 0.4, 0, SOIL_MAX);
    isl.moist[c] = P.moist[c] >= 0 ? P.moist[c] : 0.45;
    isl.snow[c] = Math.max(0, P.snow[c]);
    isl.ash[c] = P.ash[c];
    if (Number.isFinite(P.lvl[c])) {
      isl.water[c] = clamp(P.lvl[c] - h, 0, S.cap) < 0.03 ? 0 : clamp(P.lvl[c] - h, 0, S.cap);
      // Note: standing water of a set piece holds its depth: it never drains over the rim or dries up.
      isl.hold[c] = isl.water[c];
    }
  }
  // Note: ordinary ore or crystal in the rock, on cells that are dry and not on a site.
  const free = (c) => isl.mask[c] && !P.keep[c] && isl.water[c] < 0.05 && !P.paint[c] && !isl.dep[c];
  const scatter = (kind, n, amt) => {
    let guard = 0;
    for (let k = 0; k < n && guard++ < 400;) {
      const c = cells[Math.floor(R() * cells.length)];
      if (!free(c)) continue;
      isl.dep[c] = kind; isl.depAmt[c] = R.int(amt[0], amt[1]); isl.depTop[c] = isl.cellH(c % N, (c / N) | 0) + 0.3; k++;
    }
  };
  if (S.depOre) scatter(DEP.ORE, S.depOre, [3, 6]);
  if (S.depCrystal) scatter(DEP.CRYSTAL, S.depCrystal, [2, 5]);
  // Note: stones and plants avoid sites, paint and water; plants follow the design's kind weights.
  const clearOf = (c) => isl.mask[c] && !P.keep[c] && isl.water[c] < 0.12 && !isl.dep[c];
  for (const c of cells) if (clearOf(c) && !P.paint[c] && isl.cellH(c % N, (c / N) | 0) < 7 && R() < 0.03) isl.stone[c] = 1 + (R() < 0.3 ? 1 : 0);
  for (const c of cells) {
    if (!clearOf(c) || isl.stone[c] || !isl.soil[c] || isl.soil[c] < 0.2) continue;
    if (P.paint[c] && P.paint[c] !== PAINT.BED && P.paint[c] !== PAINT.NONE) continue;
    const isBedc = P.paint[c] === PAINT.BED;
    let acc = R(); let pick = null;
    if (isBedc) { if (R() < 0.6) pick = 'flower'; } else for (const k in S.plantKinds || {}) { acc -= S.plantKinds[k]; if (acc < 0) { pick = k; break; } }
    if (!pick || PK[pick] === undefined) continue;
    if (pick === 'reed' && isl.water[c] > 0.12) continue;
    isl.plant[c] = PK[pick]; isl.grow[c] = R.range(0.5, 1);
  }
  isl.springs = S.springs.map(mp);
  isl.geysers = S.geysers.map((g) => ({ ...mp(g) }));
  isl.paint = P.paint;
  // Note: nothing may stand on a site; clear anything the scatter dropped there.
  for (const k in sites) {
    const r = sites[k];
    for (let j = r.y - 1; j <= r.y + r.size; j++) for (let i = r.x - 1; i <= r.x + r.size; i++) {
      if (!inB(i, j)) continue;
      const c = cidx(i, j);
      isl.plant[c] = 0; isl.stone[c] = 0; isl.dep[c] = 0; isl.depAmt[c] = 0; isl.water[c] = 0;
    }
  }
  isl.special = trait === 'spire' ? 'spire' : null;
  isl.rareSlot = trait === 'spire' ? null : trait;
  isl.dormant = trait !== 'spire';
  let live = deposits.filter((d) => isl.mask[cidx(d.i, d.j)]);
  // Note: deposits walled off in a pocket of the set piece are dropped, unless fewer than 4 would remain.
  {
    const first = sites[Object.keys(sites)[0]];
    const start = first && (nearestWalkable(isl, first.x + 1, first.y + first.size, null, 8) || nearestWalkable(isl, first.x, first.y, null, 8));
    const reach = start ? reachMap(isl, start[0], start[1]) : null;
    const near = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inB(i + di, j + dj) && reach[cidx(i + di, j + dj)]) return true; return false; };
    const open = reach ? live.filter((d) => near(d.i, d.j)) : live;
    if (open.length >= 4) live = open;
  }
  isl.rare = {
    trait, name: RARE_NAME[trait], good: RARE_GOOD[trait] || null, sites, features, sym,
    deposits: live.map((d) => ({ i: d.i, j: d.j, good: RARE_GOOD[trait], n: d.n })),
  };
  for (const k of ['terrain', 'plant', 'water', 'bld']) if (isl.touch) isl.touch(k);
  return isl;
}

// Note: mirrors econ.findSite for one fixed footprint; returns null when buildable, else the reason.
export function siteProblem(isl, r, reach) {
  const s = r.size; let lo = 99; let hi = -99;
  for (let dj = -1; dj <= s; dj++) for (let di = -1; di <= s; di++) {
    const i = r.x + di; const j = r.y + dj;
    const inside = di >= 0 && dj >= 0 && di < s && dj < s;
    if (!inB(i, j)) { if (inside) return 'outside'; continue; }
    const c = cidx(i, j);
    if (inside) {
      if (!isl.mask[c]) return 'not land';
      if (isl.water[c] > 0.02) return 'wet';
      if (isl.stone[c]) return 'stone';
      if (isl.dep[c] && isl.depExposed(i, j)) return 'deposit';
      const h = isl.cellH(i, j); lo = Math.min(lo, h); hi = Math.max(hi, h);
      if (isl.plant[c] === PK.wheat) return 'wheat';
    } else if (isl.water[c] >= 0.1) return 'wet ring';
  }
  if (hi - lo > 0.5) return `uneven ${(hi - lo).toFixed(2)}`;
  if (reach) {
    let door = false;
    for (let k = 0; k < s && !door; k++) for (const [i, j] of [[r.x + k, r.y + s], [r.x + k, r.y - 1], [r.x - 1, r.y + k], [r.x + s, r.y + k]]) if (inB(i, j) && reach[cidx(i, j)]) { door = true; break; }
    if (!door) return 'no door';
  }
  return null;
}

// Note: full audit of a generated rare island; returns an array of problem strings, empty when sound.
export function auditRare(isl) {
  const out = [];
  const R = isl.rare;
  if (!R) return ['no isl.rare'];
  for (let v = 0; v < isl.h.length; v++) if (!(isl.h[v] <= MAX_H + 1e-6) || !(isl.h[v] >= MIN_H - 1e-6)) { out.push(`vertex ${v} height ${isl.h[v]} out of range`); break; }
  const names = Object.keys(R.sites);
  if (!names.includes(R.trait === 'spire' ? 'greatwork' : 'landmark') || !names.includes('airdock')) out.push('missing sites');
  // Note: the airdock block stands on the rim and its recorded pier side is void.
  const ad = R.sites.airdock;
  if (ad && !(pierDirs(isl, ad.x, ad.y, ad.size).includes(ad.dir))) out.push(`airdock pier dir ${ad.dir} invalid (valid ${pierDirs(isl, ad.x, ad.y, ad.size).join()})`);
  const first = R.sites[names[0]];
  const start = nearestWalkable(isl, first.x + 1, first.y + first.size, null, 8) || nearestWalkable(isl, first.x, first.y, null, 8);
  if (!start) return [...out, 'no walkable start'];
  const reach = reachMap(isl, start[0], start[1]);
  for (const k of names) { const p = siteProblem(isl, R.sites[k], reach); if (p) out.push(`site ${k}: ${p}`); }
  let walk = 0; let got = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (isl.walkable(i, j) && !(isl.paint && isl.paint[cidx(i, j)] === PAINT.PRISM)) { walk++; if (reach[cidx(i, j)]) got++; }
  if (got < walk * 0.9) out.push(`only ${got}/${walk} walkable cells reachable`);
  const near = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inB(i + di, j + dj) && reach[cidx(i + di, j + dj)]) return true; return false; };
  for (const d of R.deposits) if (!near(d.i, d.j)) out.push(`deposit ${d.i},${d.j} unreachable`);
  for (const f of R.features) if ((f.kind === 'column' || f.kind === 'pool') && !near(f.i, f.j)) out.push(`${f.kind} ${f.i},${f.j} unreachable`);
  if (R.trait !== 'spire' && R.deposits.length < 4) out.push(`only ${R.deposits.length} rare deposits`);
  return out;
}
