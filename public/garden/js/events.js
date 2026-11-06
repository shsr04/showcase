// Note: rare event deck: about one event per season, omen first, then the event, then an aftermath; pure sim, no rendering.
// Note: state lives in world.deck (JSON only); stepDeck returns plain event objects and never calls world.emit.

import * as C from './config.js';
import { TIER_JOBS, BUILDINGS } from './config.js';

const DAY = C.DAY_LENGTH;
const SEASONS = C.SEASON_IDS || ['spring', 'summer', 'autumn', 'winter'];
const seasonLen = () => C.SEASON_LEN || 3 * DAY;
export const OMEN_LEAD = 60;
export const REST_MIN = 120; // Note: least quiet time after an event ends.

// Note: weights per season; aurora stays 0 here because it comes only through occasion().
// Note: answer lists the existing tools or buildings that make a difference; they never gate the event.
export const EVENT_DEF = {
  comet: { dur: [70, 100], weights: { spring: 1, summer: 1, autumn: 1.5, winter: 1.2 }, answer: ['lookout'], gaze: true },
  eclipse: { dur: [40, 60], weights: { spring: 0.6, summer: 0.8, autumn: 0.6, winter: 0.6 }, answer: ['lookout', 'fire'], gaze: true },
  aurora: { dur: [90, 150], weights: { spring: 0, summer: 0, autumn: 0, winter: 0 }, occasion: true, answer: ['lookout'], gaze: true },
  storm: { dur: [60, 90], repair: [100, 160], weights: { spring: 1.5, summer: 2.5, autumn: 2, winter: 0.8 }, answer: ['sun', 'wind', 'hut', 'storehouse'], damage: true },
  whalecloud: { dur: [100, 140], weights: { spring: 2, summer: 2, autumn: 1, winter: 0.5 }, answer: ['lookout'], gaze: true },
  wedding: { dur: [80, 110], weights: { spring: 2, summer: 2.5, autumn: 1.5, winter: 0.7 }, answer: ['campfire', 'bonfire', 'hall'] },
  lostchild: { dur: [140, 200], weights: { spring: 1, summer: 1, autumn: 1.5, winter: 1.2 }, answer: ['bonfire', 'lookout'] },
  rareship: { dur: [100, 100], weights: { spring: 1, summer: 1, autumn: 1, winter: 1 }, answer: ['airdock'] },
};
export const EVENT_KINDS = Object.keys(EVENT_DEF);

// Note: storm damage knobs; roofs and tier props only, never beds, huts as homes or folk.
export const STORM = { hitIslands: 2, hitRoof: 0.3, hitProp: 0.4, perIsland: 4, shelterCut: 0.08, shelterCap: 0.4, reliefMax: 1 };
const UNROOFED = new Set(['path', 'art', 'signal', 'pad', 'airdock', 'monument', 'memorial', 'capital']);

// Note: seeded draws; the state is the integer deck.rng, advanced in place so a save resumes the same stream.
function draw(d) {
  d.rng = (d.rng + 0x6d2b79f5) >>> 0;
  let t = d.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const range = (d, lo, hi) => lo + (hi - lo) * draw(d);
const pickOf = (d, arr) => arr[Math.min(arr.length - 1, Math.floor(draw(d) * arr.length))];
const round1 = (v) => Math.round(v * 10) / 10;

// Note: the season index at world time t; follows world.season when lane A keeps one.
export function seasonIndexAt(world, t) {
  const len = seasonLen();
  const year = len * 4;
  const off = world.season && Number.isFinite(world.season.t) ? world.season.t - world.time : 0;
  const s = (((t + off) % year) + year) % year;
  return Math.min(3, Math.floor(s / len));
}
export const seasonAt = (world, t) => SEASONS[seasonIndexAt(world, t)];

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const liveIslands = (world) => [...world.islands.values()].filter((i) => i.revealed).sort(byId);
const builtList = (isl, id) => isl.buildings.map((b, k) => ({ b, k })).filter((e) => e.b && !e.b.gone && e.b.built && (!id || e.b.id === id));
const hasBuilt = (isl, id) => isl.buildings.some((b) => b && !b.gone && b.built && b.id === id);
const folkSorted = (world) => [...world.folk].sort((a, b) => a.id - b.id);

// Note: adult couples that live on the same island and are not travelling.
function couples(world) {
  const byFolk = new Map(world.folk.map((f) => [f.id, f]));
  const out = [];
  for (const f of folkSorted(world)) {
    const p = f.partner !== null && f.partner !== undefined ? byFolk.get(f.partner) : null;
    if (!p || f.id > p.id || f.stage !== 'adult' || p.stage !== 'adult' || f.link || p.link || f.isle !== p.isle) continue;
    out.push({ isl: f.isle, a: f.id, b: p.id });
  }
  return out;
}
const children = (world) => folkSorted(world).filter((f) => f.stage === 'child' && !f.link && world.islands.has(f.isle));
const dockIslands = (world) => liveIslands(world).filter((i) => hasBuilt(i, 'airdock'));

// Note: per kind eligibility (can, no draws) and data (make, draws from the deck rng).
const RULES = {
  comet: { can: () => true, make: (w, d) => ({ ang: round1(range(d, 0, 6.28)), tilt: round1(range(d, 0.2, 0.7)), hue: round1(range(d, 0, 1)) }) },
  eclipse: { can: () => true, make: (w, d) => ({ dir: draw(d) < 0.5 ? 1 : -1 }) },
  aurora: { can: () => true, make: (w, d) => ({ hue: round1(range(d, 0, 1)), ang: round1(range(d, 0, 6.28)) }) },
  storm: {
    can: (w) => liveIslands(w).some((i) => builtList(i).some((e) => !UNROOFED.has(BUILDINGS[e.b.id]?.role))),
    make: (w, d) => {
      const pool = liveIslands(w).filter((i) => builtList(i).some((e) => !UNROOFED.has(BUILDINGS[e.b.id]?.role)));
      if (!pool.length) return null;
      const n = Math.min(pool.length, 1 + (draw(d) < 0.4 ? 1 : 0), STORM.hitIslands);
      const picks = [];
      for (let k = 0; k < n; k++) picks.push(pool.splice(Math.min(pool.length - 1, Math.floor(draw(d) * pool.length)), 1)[0].id);
      picks.sort();
      // Note: cells follow the sim.js weather schema (addWeather rain), island-local cell coords.
      const cells = picks.map((id) => ({ kind: 'rain', isl: id, x: round1(C.N * (0.25 + draw(d) * 0.5)), z: round1(C.N * (0.25 + draw(d) * 0.5)), r: 6, life: 60, max: 0.9 }));
      return { isls: picks, cells, relief: {}, phase: 'run' };
    },
  },
  whalecloud: {
    can: (w) => liveIslands(w).length > 0,
    make: (w, d) => {
      const all = liveIslands(w);
      if (!all.length) return null;
      const look = all.filter((i) => hasBuilt(i, 'lookout'));
      const pool = look.length ? look : all;
      return { isl: pickOf(d, pool).id, ang: round1(range(d, 0, 6.28)) };
    },
  },
  wedding: {
    can: (w) => couples(w).length > 0,
    make: (w, d) => { const c = couples(w); return c.length ? pickOf(d, c) : null; },
  },
  lostchild: {
    can: (w) => children(w).length > 0,
    make: (w, d) => { const c = children(w); if (!c.length) return null; const k = pickOf(d, c); return { isl: k.isle, child: k.id, answered: false, outcome: null }; },
  },
  rareship: {
    can: (w) => dockIslands(w).length > 0,
    make: (w, d) => {
      const docks = dockIslands(w);
      if (!docks.length) return null;
      const high = docks.filter((i) => (i.rung | 0) >= 4);
      const kinds = ['trader', 'trader', 'explorer'];
      if (high.length) kinds.push('military');
      let ship = pickOf(d, kinds);
      const last = d.last[d.last.length - 1];
      if (last === 'rareship' && kinds.length > 1 && draw(d) < 0.5) ship = pickOf(d, kinds);
      const pool = ship === 'military' ? high : docks;
      return { ship, isl: pickOf(d, pool).id };
    },
  },
};

function weightOf(world, d, kind, at) {
  const def = EVENT_DEF[kind];
  let w = def.weights[seasonAt(world, at)] || 0;
  if (kind === 'whalecloud' && world.gw && world.gw.lit) w *= 3;
  const li = d.last.lastIndexOf(kind);
  if (li >= 0) w *= li === d.last.length - 1 ? 0.1 : 0.5;
  return w;
}

// Note: fills only missing or broken fields so old saves and raw loads are safe; idempotent.
export function normalizeDeck(world, raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const t = Number.isFinite(world.time) ? world.time : 0;
  d.rng = Number.isFinite(d.rng) ? d.rng >>> 0 : (Math.imul(world.seed | 0, 2654435761) ^ 0xe7e7e7e7) >>> 0;
  if (!Number.isFinite(d.next)) d.next = t + seasonLen() * (0.5 + 0.5 * draw(d));
  d.omen = d.omen && EVENT_DEF[d.omen.kind] && Number.isFinite(d.omen.at) ? { kind: d.omen.kind, at: d.omen.at, ...(d.omen.occasion ? { occasion: true } : {}) } : null;
  const a = d.active;
  d.active = a && EVENT_DEF[a.kind] && Number.isFinite(a.until) ? { kind: a.kind, until: a.until, data: a.data && typeof a.data === 'object' ? a.data : {} } : null;
  d.last = Array.isArray(d.last) ? d.last.filter((k) => EVENT_DEF[k]).slice(-4) : [];
  return d;
}

export function initDeck(world) {
  world.deck = normalizeDeck(world, world.deck);
  return world.deck;
}

// Note: true while a storm threatens or repairs; folk.js should not add to homelessT then.
export function homelessPaused(world) {
  const a = world.deck && world.deck.active;
  return !!(a && EVENT_DEF[a.kind].damage);
}

// Note: a tool answer during a storm: call with the tool strength on an island the storm hits (sun, wind).
export function relieve(world, islId, amount) {
  const a = world.deck && world.deck.active;
  if (!a || a.kind !== 'storm' || !a.data || a.data.phase !== 'run' || !(amount > 0) || !a.data.isls.includes(islId)) return 0;
  const r = a.data.relief;
  r[islId] = Math.min(STORM.reliefMax, (r[islId] || 0) + amount);
  return r[islId];
}

// Note: asks for a special occasion event (aurora after the Great Work, or a festival); returns the omen event to emit, or null when the deck is busy.
export function occasion(world, kind = 'aurora') {
  const d = initDeck(world);
  const def = EVENT_DEF[kind];
  if (!def || !def.occasion || d.omen || d.active) return null;
  if (d.last.slice(-3).includes(kind)) return null;
  d.omen = { kind, at: world.time + OMEN_LEAD, occasion: true };
  return { type: 'omen', kind, at: d.omen.at, occasion: true };
}

function stormDamage(world, d, data) {
  const out = [];
  for (const id of data.isls) {
    const isl = world.islands.get(id);
    if (!isl) continue;
    const relief = data.relief[id] || 0;
    let shelters = 0;
    for (const e of builtList(isl)) if ((e.b.flourish | 0) >= TIER_JOBS.S.min) shelters++;
    const cut = (1 - Math.min(1, relief)) * (1 - Math.min(STORM.shelterCap, shelters * STORM.shelterCut));
    let n = 0;
    for (const e of builtList(isl)) {
      const role = BUILDINGS[e.b.id]?.role;
      if (UNROOFED.has(role)) continue;
      if (n < STORM.perIsland && draw(d) < STORM.hitRoof * cut) { out.push({ isl: id, b: e.k, bid: e.b.id, part: 'roof' }); n++; }
      for (const p of ['S', 'C', 'W']) {
        if ((e.b.flourish | 0) < TIER_JOBS[p].min) continue;
        if (n < STORM.perIsland && draw(d) < STORM.hitProp * cut) { out.push({ isl: id, b: e.k, bid: e.b.id, part: 'prop', prop: p }); n++; }
      }
    }
  }
  return out;
}

function startEvent(world, d, out) {
  const t = world.time;
  const kind = d.omen.kind;
  const viaOccasion = !!d.omen.occasion;
  const def = EVENT_DEF[kind];
  const data = RULES[kind].make(world, d);
  d.omen = null;
  if (!data) {
    // Note: the omen came to nothing; tell the view to drop its glow and try again later.
    out.push({ type: 'omen', kind, at: null, cancelled: true });
    d.next = Math.max(d.next, t + 30 + 60 * draw(d));
    return;
  }
  const dur = round1(range(d, def.dur[0], def.dur[1]));
  d.active = { kind, until: t + dur, data };
  d.last.push(kind);
  if (d.last.length > 4) d.last.shift();
  const rep = def.repair ? def.repair[1] : 0;
  const quiet = Math.max(t + dur + rep + REST_MIN, viaOccasion ? 0 : t + seasonLen() * (0.8 + 0.4 * draw(d)));
  d.next = Math.max(d.next, quiet);
  out.push({ type: 'event', kind, phase: 'start', data, until: d.active.until });
}

function stepActive(world, d, out) {
  const a = d.active;
  const t = world.time;
  const def = EVENT_DEF[a.kind];
  if (a.kind === 'lostchild' && !a.data.answered) {
    const isl = world.islands.get(a.data.isl);
    if (isl && builtList(isl).some((e) => e.b.id === 'lookout' || (e.b.id === 'bonfire' && e.b.lit !== false))) {
      a.data.answered = true; a.data.outcome = 'found';
      a.until = Math.min(a.until, t + 12);
    }
  }
  if (t < a.until) return;
  if (a.data.phase === 'after') {
    d.active = null;
    out.push({ type: 'aftermath', kind: a.kind, phase: 'done', damage: [], repair: 0 });
    return;
  }
  if (a.kind === 'lostchild' && !a.data.outcome) a.data.outcome = 'late';
  out.push({ type: 'event', kind: a.kind, phase: 'end', data: a.data });
  if (def.damage) {
    const damage = stormDamage(world, d, a.data);
    const repair = round1(range(d, def.repair[0], def.repair[1]));
    a.data.phase = 'after';
    a.until = t + repair;
    out.push({ type: 'aftermath', kind: a.kind, phase: 'begin', damage, repair });
  } else d.active = null;
}

// Note: one deck step; call after world.time advanced. Returns events; out.pauseHomeless is the repair flag.
export function stepDeck(world, dt) {
  const d = world.deck || initDeck(world);
  const out = [];
  if (!(dt >= 0) || !Number.isFinite(world.time)) { out.pauseHomeless = homelessPaused(world); return out; }
  const t = world.time;
  if (d.active) stepActive(world, d, out);
  else if (d.omen) { if (t >= d.omen.at) startEvent(world, d, out); }
  else if (t >= d.next - OMEN_LEAD) {
    const at = Math.max(d.next, t + OMEN_LEAD);
    const picks = [];
    let sum = 0;
    for (const kind of EVENT_KINDS) {
      const w = weightOf(world, d, kind, at);
      if (w > 0 && RULES[kind].can(world)) { picks.push([kind, w]); sum += w; }
    }
    if (!picks.length) d.next = t + 90;
    else {
      let r = draw(d) * sum;
      let kind = picks[picks.length - 1][0];
      for (const [k, w] of picks) { if (r < w) { kind = k; break; } r -= w; }
      d.omen = { kind, at };
      out.push({ type: 'omen', kind, at });
    }
  }
  out.pauseHomeless = homelessPaused(world);
  return out;
}
