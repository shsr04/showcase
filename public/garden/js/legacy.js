// Note: pure legacy rules: deed memorials (icon only, no names) and elder teaching; no view, no RNG.
// Note: every function returns events or mutates the explicit world fields; nothing is emitted here.

import { N, AGE, GOODS, BUILDINGS } from './config.js';
import { cidx, inB, ringOf } from './island.js';

export const DEED_KINDS = ['bridge', 'master', 'parent', 'hero', 'ambassador'];
export const DEED_ICON = { bridge: 'bridge', master: 'hammer', parent: 'sprout', hero: 'compass', ambassador: 'compass' };
export const MAX_DEEDS = 24;
export const MASTER_MADE = 20;
export const MASTER_TALENT = 1.3;
export const PARENT_KIDS = 2;
// Note: explored island counts (home excluded) at which one more hero memorial is owed.
export const HERO_STEPS = [3, 6, 10, 15];
export const TALENTS = ['gather', 'craft', 'build', 'porter', 'wonder'];
export const TALENT_CAP = 1.6;
export const TEACH_GAIN = 0.05;
export const TEACH_MIN = 1.0;
export const TEACH_COOLDOWN = 120;
export const YOUNG_AGE = AGE.elder * 0.5;
const SPOT_RADIUS = 12;

export function deedIcon(kind) { return DEED_ICON[kind] || null; }

const islOf = (world, ref) => (ref && typeof ref === 'object' ? ref : world.islands.get(ref) || null);
const folkOn = (world, id) => (typeof world.folkOn === 'function' ? world.folkOn(id) : world.folk.filter((f) => f.isle === id && !f.link));
const deedList = (world) => world.deeds || (world.deeds = []);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function hasDeed(world, kind, islId) {
  return deedList(world).some((d) => d.kind === kind && (kind === 'bridge' || d.isl === islId));
}

// Note: deed cells as a set of cell indexes; econ and flight read it to keep memorials clear.
export function deedCells(world, islId) {
  const s = new Set();
  for (const d of deedList(world)) if (d.isl === islId && inB(d.x, d.z)) s.add(cidx(d.x, d.z));
  return s;
}

// Note: render data for one island; icon only, never a name.
export function deedMemorials(world, islId) {
  return deedList(world).filter((d) => d.isl === islId).map((d) => ({ kind: d.kind, icon: DEED_ICON[d.kind], x: d.x, z: d.z, t: d.t }));
}

function anchorPoint(isl) {
  const live = (id) => isl.buildings.filter((b) => b && !b.gone && b.built && b.id === id);
  const sv = live('storehouse')[0];
  if (sv && sv.door) return { i: sv.door.i, j: sv.door.j };
  const cf = live('campfire')[0];
  if (cf) return { i: cf.x, j: cf.y };
  return { i: N >> 1, j: N >> 1 };
}

// Note: nearest free cell around a point in Chebyshev rings, row-major inside a ring; null when none is free.
export function memorialSpot(world, isl, near) {
  const at = near && Number.isFinite(near.i) && Number.isFinite(near.j) ? { i: Math.floor(near.i), j: Math.floor(near.j) } : anchorPoint(isl);
  const used = [];
  for (const m of isl.memorials || []) used.push([m.i, m.j]);
  for (const d of deedList(world)) if (d.isl === isl.id) used.push([d.x, d.z]);
  for (const a of isl.anchors || []) used.push([a.i, a.j]);
  if (isl.relic) used.push([isl.relic.i, isl.relic.j]);
  const blocked = new Set();
  for (const b of isl.buildings) {
    if (!b || b.gone) continue;
    if (b.door) blocked.add(cidx(b.door.i, b.door.j));
    if (b.id === 'campfire') for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inB(b.x + di, b.y + dj)) blocked.add(cidx(b.x + di, b.y + dj));
  }
  const free = (i, j) => {
    if (!inB(i, j) || !isl.walkable(i, j) || isl.bld[cidx(i, j)] >= 0 || blocked.has(cidx(i, j))) return false;
    if (isl.reach && !isl.reach[cidx(i, j)]) return false;
    return !used.some(([ui, uj]) => Math.abs(ui - i) <= 1 && Math.abs(uj - j) <= 1);
  };
  for (const minR of [2, 0]) {
    for (let r = minR; r <= SPOT_RADIUS; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (free(at.i + di, at.j + dj)) return { x: at.i + di, z: at.j + dj };
        }
      }
    }
  }
  return null;
}

export function deedEvent(world, d) {
  return { type: 'deed', kind: d.kind, isl: islOf(world, d.isl), x: d.x, z: d.z };
}

// Note: records one deed unless a duplicate, over the cap or without a free cell; dedupe uses kind and island only.
// Note: bridge is one per world, master/parent one per island, hero limited by the explored-count steps.
export function recordDeed(world, kind, ctx = {}) {
  if (!DEED_KINDS.includes(kind)) return null;
  const isl = islOf(world, ctx.isl);
  if (!isl) return null;
  const list = deedList(world);
  if (list.length >= MAX_DEEDS || hasDeed(world, kind, isl.id)) return null;
  if (kind === 'hero' && list.filter((d) => d.kind === 'hero').length >= heroOwed(world)) return null;
  const near = { i: ctx.i ?? ctx.x, j: ctx.j ?? ctx.z };
  const spot = memorialSpot(world, isl, near);
  if (!spot) return null;
  const d = { kind, isl: isl.id, x: spot.x, z: spot.z, t: Number.isFinite(ctx.t) ? ctx.t : world.time || 0 };
  list.push(d);
  return d;
}

const exploredIslands = (world) => [...world.islands.values()].filter((i) => i.revealed && i.explored && ringOf(i.gx, i.gz) > 0).sort(byId);
const heroOwed = (world) => { const n = exploredIslands(world).length; return HERO_STEPS.filter((s) => n >= s).length; };

const craftCount = (isl) => {
  let n = 0;
  for (const g in isl.use || {}) if (GOODS[g] && !GOODS[g].raw) n += isl.use[g];
  return n;
};

function stationPoint(isl) {
  const st = isl.buildings.find((b) => b && !b.gone && b.built && BUILDINGS[b.id] && BUILDINGS[b.id].role === 'station' && b.door);
  return st ? { i: st.door.i, j: st.door.j } : null;
}

function masterDeed(world, isl) {
  if (hasDeed(world, 'master', isl.id) || craftCount(isl) < MASTER_MADE) return null;
  const ok = folkOn(world, isl.id).some((f) => f.stage !== 'child' && Math.max(f.talent.craft, f.talent.build) >= MASTER_TALENT);
  return ok ? recordDeed(world, 'master', { isl, ...(stationPoint(isl) || {}) }) : null;
}

function parentDeed(world, isl, elders) {
  if (hasDeed(world, 'parent', isl.id)) return null;
  const e = elders.filter((f) => f.stage === 'elder' && (f.kids || 0) >= PARENT_KIDS).sort(byId)[0];
  if (!e) return null;
  const hut = e.home >= 0 ? isl.buildings[e.home] : null;
  return recordDeed(world, 'parent', { isl, ...(hut && hut.door ? { i: hut.door.i, j: hut.door.j } : {}) });
}

function heroDeed(world) {
  const out = [];
  const ex = exploredIslands(world);
  // Note: the farthest explored island without a hero memorial hosts the next one; ties by id.
  while (deedList(world).filter((d) => d.kind === 'hero').length < heroOwed(world)) {
    const pick = ex.filter((i) => !hasDeed(world, 'hero', i.id)).sort((a, b) => ringOf(b.gx, b.gz) - ringOf(a.gx, a.gz) || byId(a, b))[0];
    const d = pick ? recordDeed(world, 'hero', { isl: pick }) : null;
    if (!d) break;
    out.push(d);
  }
  return out;
}

function bridgeDeed(world, link) {
  if (hasDeed(world, 'bridge', null)) return null;
  const l = link || world.links.filter((q) => q.state === 'done').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  if (!l || !l.ai) return null;
  return recordDeed(world, 'bridge', { isl: l.a, i: l.ai.i, j: l.ai.j });
}

// Note: evaluates every rule from saved state; idempotent, so it doubles as the repair pass for old saves.
export function scanDeeds(world) {
  const made = [];
  const push = (d) => { if (d) made.push(d); };
  push(bridgeDeed(world, null));
  for (const isl of [...world.islands.values()].filter((i) => i.revealed).sort(byId)) {
    push(masterDeed(world, isl));
    push(parentDeed(world, isl, folkOn(world, isl.id).filter((f) => f.stage === 'elder')));
  }
  for (const d of heroDeed(world)) push(d);
  return made.map((d) => deedEvent(world, d));
}

// Note: slow tick hook; the rules are cheap, so the world tick may call it every pass.
export function legacyTick(world) { return scanDeeds(world); }

// Note: pure teach step; the elder passes one talent the learner lacks, capped by the elder's own level.
export function elderTeach(world, elder, learner) {
  if (!elder || !learner || elder === learner || elder.stage !== 'elder' || learner.stage === 'elder' || elder.isle !== learner.isle) return null;
  const now = world.time || 0;
  if ((elder.teachAt || 0) > now) return null;
  let best = null; let gap = 0;
  for (const k of TALENTS) {
    const e = elder.talent[k];
    if (!(e >= TEACH_MIN)) continue;
    const g = Math.min(TALENT_CAP, e) - learner.talent[k];
    if (g > gap + 1e-9) { gap = g; best = k; }
  }
  if (!best || gap < 0.001) return null;
  const gain = Math.min(TEACH_GAIN, gap);
  learner.talent[best] += gain;
  elder.teachAt = now + TEACH_COOLDOWN;
  return { type: 'teach', isl: islOf(world, elder.isle), elder, learner, key: best, gain };
}

const young = (f) => f.stage === 'child' || (f.stage === 'adult' && f.age <= YOUNG_AGE);

// Note: the elder sits at a bench; the young folk of the island with the largest gap come first, own kids before others.
export function elderTeachAt(world, isl, elder) {
  if (!elder || elder.stage !== 'elder' || (elder.teachAt || 0) > (world.time || 0)) return null;
  let pick = null; let score = -1;
  for (const f of folkOn(world, isl.id).sort((a, b) => a.id - b.id)) {
    if (f === elder || f.link || !young(f)) continue;
    let g = 0;
    for (const k of TALENTS) if (elder.talent[k] >= TEACH_MIN) g = Math.max(g, Math.min(TALENT_CAP, elder.talent[k]) - f.talent[k]);
    if (g < 0.001) continue;
    const s = g + (f.pars && f.pars.includes(elder.id) ? 10 : 0);
    if (s > score + 1e-9) { score = s; pick = f; }
  }
  return pick ? elderTeach(world, elder, pick) : null;
}

// Note: event hook; call for every drained world event. Returns new events (deed, teach) to forward.
export function legacyEvent(world, ev) {
  const out = [];
  switch (ev.type) {
    case 'linkdone': { const d = bridgeDeed(world, ev.link); if (d) out.push(deedEvent(world, d)); break; }
    case 'aged': {
      const isl = ev.f && ev.f.stage === 'elder' ? islOf(world, ev.f.isle) : null;
      const d = isl ? parentDeed(world, isl, [ev.f]) : null;
      if (d) out.push(deedEvent(world, d));
      break;
    }
    case 'crafted': { const d = ev.isl ? masterDeed(world, ev.isl) : null; if (d) out.push(deedEvent(world, d)); break; }
    case 'land': case 'reveal': case 'discover': for (const d of heroDeed(world)) out.push(deedEvent(world, d)); break;
    case 'tierjob': {
      if (ev.kind === 'C' && ev.f && ev.isl) { const t = elderTeachAt(world, ev.isl, ev.f); if (t) out.push(t); }
      break;
    }
    default: break;
  }
  return out;
}

export function deedsToJSON(world) {
  return deedList(world).map((d) => ({ kind: d.kind, isl: d.isl, x: d.x, z: d.z, t: d.t }));
}

// Note: loads contract fields only; unknown kinds, bad cells and duplicates are dropped, the cap is enforced.
export function deedsFromJSON(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (const d of arr) {
    if (!d || !DEED_KINDS.includes(d.kind) || typeof d.isl !== 'string' || !inB(d.x, d.z)) continue;
    if (out.some((o) => o.kind === d.kind && (d.kind === 'bridge' || o.isl === d.isl))) continue;
    if (out.length >= MAX_DEEDS) break;
    out.push({ kind: d.kind, isl: d.isl, x: d.x | 0, z: d.z | 0, t: Number(d.t) || 0 });
  }
  return out;
}
