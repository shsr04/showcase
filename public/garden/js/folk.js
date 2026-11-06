// Note: folk agents: needs, task choice, movement, life cycle. Intent shows only through behaviour.

import { N, NEEDS, NEED_DECAY, SEASON_WINTER_FOOD, SEASON_WINTER_DECAY, SEASON_AUTUMN_BONUS, FOOD_VALUE, AGE, FOLK_SPEED, BUILDINGS, LINKS, FLOURISH_IDS, TIER_JOBS } from './config.js';
import { cidx, inB } from './island.js';
import { findPath, nearestWalkable } from './path.js';
import { GOAL_P, cancelBuilding, canAfford, spend, flourishCost, flourishTarget, linkCap, linkBenchEnd, stockGet, stockAdd, stockTake, storehouse, builtOf, harvest, resourceAt, beds, live, findPlantSpot, plantKindFor, reserveSeat, freeSeat } from './econ.js';
import { PK } from './island.js';
import { clamp, hash2 } from './rand.js';
import { catchFish, herdPlanCached, reserveHerd, releaseHerd, boardHerd, herdMembers } from './animals.js';
import { tierSpot, linkBenchSpot } from './spots.js';
import { steer } from './avoid.js';
import { knowRelic } from './rareisles.js';
import { boardCandidates } from './board.js';
import { claimSettle, routeOver } from './capital.js';
import { deedMemorials } from './legacy.js';
import { KNOWLEDGE, KNOWLEDGE_IDS } from './config.js';
import { gwFarBonus, gwFarGood } from './greatwork.js';
import { ARCH, artCost, artWork, isArtist, nextArt, findArtSpot, placeArt, finishArt, worn } from './art.js';

const R = Math.random;
const EDIBLE = ['bread', 'smoked', 'egg', 'fruit', 'fish', 'wheat'];

export function createFolk(world, isl, i, j, ageSec) {
  const f = {
    id: world.nextFolk++, isle: isl.id, x: i + 0.5, z: j + 0.5, face: R() * 6.28, age: ageSec ?? 3600 + R() * 3000,
    needs: { food: 0.8, shelter: 0.6, rest: 0.8, company: 0.7, wonder: 0.7, explore: 0.3 + R() * 0.7, industry: 0.6, belonging: 0.7 }, mood: 0.7,
    task: null, path: null, pi: 0, carry: null, home: -1, anim: 'idle', animT: R() * 10, link: null, idleT: R() * 2,
    talent: { gather: 0.7 + R() * 0.8, craft: 0.7 + R() * 0.8, build: 0.7 + R() * 0.8, porter: 0.7 + R() * 0.8, wonder: 0.7 + R() * 0.8 },
    passAt: AGE.pass + (R() - 0.5) * AGE.passVar, stage: 'adult', queue: null, sex: R() < 0.5 ? 'm' : 'f', partner: null, kids: 0, pars: null, homelessT: 0, mourn: 0, speedMul: 0.9 + R() * 0.2,
  };
  stageOf(f);
  return f;
}

// Note: the fisher is the best gatherer of an island with fish; the artist keeps to art. The pick is kept until it is invalid.
export function isFisher(world, isl, f) {
  if (!isl.fishPos || !isl.fishPos.length) return isl.fisherId === f.id;
  const cur = isl.fisherId !== undefined ? world.folk.find((o) => o.id === isl.fisherId) : null;
  if (!cur || cur.isle !== isl.id || cur.stage !== 'adult' || cur.link) {
    let best = null;
    for (const o of world.folkOn(isl.id)) if (o.stage === 'adult' && !isArtist(world, isl, o) && (!best || o.talent.gather > best.talent.gather)) best = o;
    isl.fisherId = best ? best.id : undefined;
  }
  return isl.fisherId === f.id;
}

export function stageOf(f) {
  f.stage = f.age < AGE.child ? 'child' : f.age > AGE.elder ? 'elder' : 'adult';
  return f.stage;
}

const isNight = (world) => world.night > 0.65;
// Note: tasks that count as productive work for the industry desire.
const WORK_TYPES = new Set(['build', 'craft', 'gather', 'plant', 'tend', 'herd', 'dockwork', 'trade', 'relight', 'art']);

// Note: the partner on the same island, or null.
function mateOf(world, f) {
  if (f.partner === null || f.partner === undefined) return null;
  const m = world.folk.find((o) => o.id === f.partner);
  return m && m.isle === f.isle && !m.link ? m : null;
}

// Note: the first living parent on the same island, or null.
function parentOf(world, f) {
  if (!f.pars) return null;
  for (const id of f.pars) {
    const p = world.folk.find((o) => o.id === id);
    if (p && p.isle === f.isle && !p.link && p.stage !== 'child') return p;
  }
  return null;
}

function setPath(f, isl, ti, tj, adjacent) {
  const si = clamp(Math.floor(f.x), 0, N - 1);
  const sj = clamp(Math.floor(f.z), 0, N - 1);
  if (si === ti && sj === tj && !adjacent) { f.path = []; f.pi = 0; return true; }
  const p = findPath(isl, si, sj, ti, tj, { adjacent });
  if (!p) { f.path = null; return false; }
  f.path = p; f.pi = 0;
  return true;
}

// Note: one rider at a time against the flow, same-way riders keep a gap; the rest wait at the anchor.
function board(world, f, link, fromId) {
  if (!world.canBoard(link, fromId)) { f.anim = 'idle'; return false; }
  world.boardLink(f, link, fromId);
  return true;
}

// Note: returns true once the path is exhausted.
function walk(world, f, isl, dt, carrying) {
  if (!f.path) return true;
  if (f.pi >= f.path.length) { f.anim = carrying ? 'carry' : 'idle'; return true; }
  const [ci, cj] = f.path[f.pi];
  if (isl.fire[cidx(ci, cj)] > 0 || !isl.walkable(ci, cj)) {
    // Note: the way is burning or built over; wait, then find another way.
    f.anim = carrying ? 'carry' : 'idle';
    f.blocked = (f.blocked || 0) + dt;
    if (f.blocked > 0.5) {
      const last = f.path[f.path.length - 1];
      const old = f.path; const oi = f.pi;
      if (!isl.walkable(last[0], last[1]) || !setPath(f, isl, last[0], last[1])) { f.path = old; f.pi = oi; if (f.blocked > 8) f.abort = true; }
      else f.blocked = 0;
    }
    return false;
  }
  f.blocked = 0;
  // Note: a walker that gains under half a cell in 25 s is boxed in; the task aborts and the folk chooses anew.
  f.stallT = (f.stallT || 0) + dt;
  if (f.stallT > 25) {
    if (f.stallX !== undefined && Math.hypot(f.x - f.stallX, f.z - f.stallZ) < 0.5) f.abort = true;
    f.stallX = f.x; f.stallZ = f.z; f.stallT = 0;
  }
  const tx = ci + 0.5 + Math.sin(f.id * 7.3 + f.pi) * 0.12;
  const tz = cj + 0.5 + Math.cos(f.id * 5.1 + f.pi) * 0.12;
  const dx = tx - f.x; const dz = tz - f.z;
  const d = Math.hypot(dx, dz);
  const sp = FOLK_SPEED * f.speedMul * (f.stage === 'child' ? 0.85 : f.stage === 'elder' ? 0.7 : 1) * (f.needs.rest < 0.15 ? 0.8 : 1) * dt;
  // Note: D27 steer around other bodies; wait when boxed in, push through after a short while.
  const sv = steer(world, isl, f, dx / (d || 1), dz / (d || 1), Math.min(d, sp), dt);
  if (sv.k === 0) { f.anim = carrying ? 'carry' : 'idle'; return false; }
  f.face = Math.atan2(sv.ux, sv.uz);
  if (sv.same && d <= sp) { f.x = tx; f.z = tz; f.pi++; }
  else { const mv = Math.min(d, sp) * sv.k; f.x += sv.ux * mv; f.z += sv.uz * mv; }
  f.anim = carrying ? 'carry' : 'walk';
  return false;
}

function faceTo(f, fi, fj) { f.face = Math.atan2(fi - f.x, fj - f.z); }

// Note: spotBusy is non-enumerable so it never reaches a save; one folk per prop slot and building.
function spotBusyOf(b) {
  if (!b.spotBusy) Object.defineProperty(b, 'spotBusy', { value: {}, writable: true, enumerable: false, configurable: true });
  return b.spotBusy;
}

function releaseSpot(b, kind, f) {
  if (b.spotBusy && b.spotBusy[kind] === f.id) b.spotBusy[kind] = null;
}

// Note: a claim whose holder is gone or does something else is stale and dropped.
function spotTaken(world, b, kind) {
  const id = b.spotBusy && b.spotBusy[kind];
  if (id === null || id === undefined) return false;
  const h = world.folk.find((o) => o.id === id);
  if (h && h.task && h.task.b === b && h.task.jobKind === kind) return true;
  b.spotBusy[kind] = null;
  return false;
}

const spotCd = new WeakMap();
// Note: per link and island, when a failed adorn walk may be tried again.
export const adornCd = new WeakMap();
const tierOf = (b) => (b.isLink ? b.tier : b.flourish) | 0;
const linkEnd = (l, isl) => (l.a === isl.id ? 0 : 1);
const linkEndCell = (l, end) => (end ? l.bi : l.ai);
const jobSpot = (isl, b, kind) => (b.isLink ? linkBenchSpot(isl, b, b.benchEnd ? 1 : 0) : tierSpot(isl, b, kind));

export function endTask(world, f, isl) {
  const t = f.task;
  if (t) {
    if (t.claimB) t.claimB.claims = Math.max(0, (t.claimB.claims || 0) - 1);
    if (t.station) t.station.busy = false;
    if (t.claimCell !== undefined && isl.claims) isl.claims.delete(t.claimCell);
    if (t.type === 'herd' && t.reserved) releaseHerd(world, f, t.plan);
    if (t.jobKind && t.b) releaseSpot(t.b, t.jobKind, f);
    if (t.type === 'relight' && t.b) t.b.relighting = false;
    if (t.type === 'tend' && t.b && t.b.tender === f.id) t.b.tender = null;
    // Note: an interrupted porter drops the empty crate, or the carry gate would lock it out.
    if (t.type === 'dockwork') f.carry = null;
    if (t.type === 'art' && t.b) t.b.repairing = false;
    if (t.type === 'art' && t.piece && !t.piece.gone && t.piece.growth < 1) {
      // Note: an interrupted artist leaves nothing behind; the goods return.
      cancelBuilding(isl, t.piece);
      const cost = artCost(t.piece.kind, t.piece.arch);
      for (const g in cost) stockAdd(isl, g, cost[g]);
    }
    if (t.seatB) { freeSeat(t.seatB, t.seatK); t.seatB = null; }
    if (t.sleepCell !== undefined && isl.sleepers) isl.sleepers.delete(t.sleepCell);
    if (t.type === 'plant' && isl.planting && isl.planting[t.want] > 0) isl.planting[t.want]--;
  }
  f.task = null; f.path = null; f.anim = 'idle'; f.prop = null; f.idleT = 0.4 + R() * 1.2;
  // Note: a lead who never landed returns the kit to the island it came from and frees the claim unless a partner is still on the way.
  if (t && t.type === 'cross' && t.settle && t.kit) {
    const src = world.islands.get(t.fromIsle);
    if (src) for (const g in t.kit) stockAdd(src, g, t.kit[g]);
    t.kit = null;
    const to = world.islands.get(t.dest);
    if (to && to.settleUntil !== undefined && !world.folkOn(to.id).length && !world.folk.some((o) => o !== f && o.task && o.task.type === 'cross' && o.task.settle && o.task.dest === to.id)) { to.hasSettlers = false; to.settleUntil = undefined; }
  }
}

function giveCarryBack(f, isl) {
  if (f.carry) { stockAdd(isl, f.carry.good, f.carry.n); f.carry = null; }
}

function door(isl) {
  const sv = storehouse(isl);
  return sv ? sv.door : isl.home || { i: N >> 1, j: N >> 1 };
}

function foodAvailable(isl) {
  for (const g of EDIBLE) if (g !== 'wheat' && stockGet(isl, g) > 0) return g;
  return null;
}

export function nearestRes(isl, f, pred) {
  let best = null; let bd = 1e9;
  for (const r of isl.res || []) {
    if (!pred(r)) continue;
    if (isl.claims && isl.claims.has(r.c)) continue;
    const d = Math.hypot(r.i + 0.5 - f.x, r.j + 0.5 - f.z);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

function claimCell(isl, c) { (isl.claims || (isl.claims = new Set())).add(c); }

// Note: pick what to do next; needs first, then useful work, then idling with gaze.
export function chooseTask(world, f, isl) {
  const n = f.needs;
  if (f.queue) { const q = f.queue; f.queue = null; return q; }
  // flee from fire
  if (isl.burning) {
    let near = null; let bd = 3.5;
    for (let j = Math.max(0, Math.floor(f.z) - 4); j <= Math.min(N - 1, Math.floor(f.z) + 4); j++) for (let i = Math.max(0, Math.floor(f.x) - 4); i <= Math.min(N - 1, Math.floor(f.x) + 4); i++) {
      if (isl.fire[cidx(i, j)] > 0.05) { const d = Math.hypot(i + 0.5 - f.x, j + 0.5 - f.z); if (d < bd) { bd = d; near = [i, j]; } }
    }
    if (near) return { type: 'flee', from: near };
  }
  if (f.age > f.passAt) return { type: 'pass', phase: 'go', t: 0 };
  // Note: a festival guest whose task ended far from home walks back over its link.
  if (f.guestOf) {
    if (f.guestOf.home !== f.isle) return { type: 'festival', guest: true, phase: 'back', link: f.guestOf.link, home: f.guestOf.home, t: 0 };
    f.guestOf = null;
  }
  // Note: a crew or scout whose trip broke off far from home walks back over the done links.
  if (f.crew && f.crew.home !== f.isle) {
    const back = routeOver(world, f.isle, f.crew.home);
    if (back && back.length) return { type: 'cross', link: back[0].link, route: back, hop: 0, phase: 'go', t: 0, fromIsle: f.isle, dest: f.crew.home, home: true };
    f.crew = null;
  }
  const night = isNight(world);
  if (f.stage === 'child') {
    if (n.food < 0.4) return { type: 'eat', phase: 'go' };
    if (n.rest < 0.22 || (night && n.rest < 0.85) || (night && R() < 0.5)) return { type: 'sleep', phase: 'go' };
    if (isl.festival && n.food > 0.3) return { type: 'festival', phase: 'go', t: 0 };
    if (n.company < 0.25) return { type: 'social', phase: 'go', t: 0 };
    if (night) return R() < 0.6 ? { type: 'social', phase: 'go', t: 0 } : { type: 'gaze', phase: 'go', t: 0 };
    // Note: children shadow a parent, play near the hut or visit the fire; they do not work.
    const r = R();
    const par = parentOf(world, f);
    const hb = f.home >= 0 ? isl.buildings[f.home] : null;
    if (r < 0.4 && par) return { type: 'follow', phase: 'go', par: par.id, t: 8 + R() * 10, gap: 1.5 };
    if (r < 0.75) return { type: 'wander', phase: 'go', t: 0, around: hb && hb.door ? hb.door : par ? { i: Math.floor(par.x), j: Math.floor(par.z) } : null };
    if (r < 0.9) return { type: 'social', phase: 'go', t: 0 };
    return { type: 'gaze', phase: 'go', t: 0 };
  }
  // Note: hard calls: mourning and the island festival; everything else competes by one score.
  if (f.mourn > world.time && R() < 0.3) return { type: 'mourn', phase: 'go', t: 0 };
  if (isl.festival && n.food > 0.3) return { type: 'festival', phase: 'go', t: 0 };
  const cands = [];
  // Note: personal desires use a convex curve: a need barely counts while it is mostly met and outbids almost any order near empty.
  const K = 6; const sq = (x) => (1 - x) * (1 - x);
  const hb = f.home >= 0 ? isl.buildings[f.home] : null;
  cands.push({ s: 1.5 * K * sq(n.food), t: { type: 'eat', phase: 'go' } });
  // Note: night is a call to sleep for anyone still tired.
  cands.push({ s: night ? (n.rest < 0.95 ? 8 : 0) : 1.2 * K * sq(n.rest), t: { type: 'sleep', phase: 'go' } });
  cands.push({ s: 3 * sq(n.company) + (night ? 1.2 : 0), t: { type: 'social', phase: 'go', t: 0 } });
  cands.push({ s: 3 * sq(n.wonder) * f.talent.wonder, t: { type: 'wonder', phase: 'go', t: 0 } });
  if (n.belonging !== undefined) cands.push({ s: 2 * sq(n.belonging), t: { type: 'wander', phase: 'go', t: 0, around: hb && hb.door ? hb.door : null } });
  cands.push({ s: night ? 1.0 : 0.5, t: { type: 'gaze', phase: 'go', t: 0 } });
  cands.push({ s: 0.35, t: { type: 'wander', phase: 'go', t: 0 } });
  f.fisher = f.stage === 'adult' && isFisher(world, isl, f);
  f.artist = isArtist(world, isl, f);
  if (!night) {
    for (const c of boardCandidates(world, isl, f)) cands.push(c);
    // art: leisure work, pieces by prosperity rung; worn pieces get repaired
    if (f.artist && n.wonder > 0.2) {
      const wr = worn(isl);
      if (wr) cands.push({ s: 2.2 * f.talent.wonder, t: { type: 'art', phase: 'go', b: wr, t: 0 } });
      else if (artBusy(world, isl) < 2) {
        if (!isl.artPlan || world.time > isl.artPlan.until) {
          const spec = nextArt(world, isl);
          const spot = spec && findArtSpot(isl, spec.kind);
          isl.artPlan = { until: world.time + 6, spec: spot ? spec : null, spot };
        }
        const ap = isl.artPlan;
        if (ap.spec && canAfford(isl, artCost(ap.spec.kind, ap.spec.arch), GOAL_P.spend)) cands.push({ s: (0.9 + n.wonder * 0.9) * f.talent.wonder, t: { type: 'art', phase: 'go', kind: ap.spec.kind, arch: ap.spec.arch, spot: ap.spot, t: 0 } });
      }
    }
    // couples stroll together
    const mate = mateOf(world, f);
    if (mate && mate.stage !== 'child' && !mate.queue && n.company < 0.9 && (!mate.task || ['wander', 'gaze', 'social'].includes(mate.task.type))) cands.push({ s: 0.8, t: { type: 'stroll', phase: 'go', mate: mate.id, t: 0 } });
    tierJobs(world, f, isl, cands);
  }
  // Note: the highest score wins; ties go to a stable hash of the folk and the task, never to chance.
  let best = null; let bs = -1;
  for (const c of cands) {
    if (f.failed && f.failed[c.t.type + (c.t.order || '')] > world.time) continue;
    const sc = Math.max(0.01, c.s) + (hash2(f.id, c.t.type.length * 31 + (c.t.mode ? c.t.mode.length : 0), 17) % 100000) / 1e9;
    if (sc > bs) { bs = sc; best = c; }
  }
  return best ? best.t : { type: 'gaze', phase: 'go', t: 0 };
}

// Note: idle jobs at tier props (washing, bench, planters); scored like personal desires, so they win once the need is down and lose to work while it is mostly met.
function tierJobs(world, f, isl, cands) {
  const day = world.night < 0.1 && world.tod < 0.67;
  const dusk = world.tod > 0.5 && world.sunH < 0.7 && world.night < 0.64;
  if (!day && !dusk) return;
  for (const b of live(isl)) {
    if (!b.built || b.upgrading || !FLOURISH_IDS.has(b.id) || (b.burn || 0) > 0.5 || (b.claims || 0) > 0) continue;
    const fl = b.flourish | 0;
    if (fl < 2) continue;
    for (const kind in TIER_JOBS) {
      const J = TIER_JOBS[kind];
      if (fl < J.min || (J.when === 'day' ? !day : !dusk)) continue;
      const need = f.needs[J.need];
      if (need >= 0.9) continue;
      const cd = spotCd.get(b);
      if (cd && cd[kind] > world.time) continue;
      if (spotTaken(world, b, kind)) continue;
      const sp = tierSpot(isl, b, kind);
      const ci = Math.floor(sp.x); const cj = Math.floor(sp.z);
      if (!inB(ci, cj) || !isl.walkable(ci, cj) || (isl.reach && !isl.reach[cidx(ci, cj)])) continue;
      const d = Math.hypot(sp.x - f.x, sp.z - f.z);
      // Note: a job is not worth a walk that ends after the light fades.
      if (d > ((J.when === 'day' ? 0.7 : 0.79) - world.tod) * 360 - 3) continue;
      cands.push({ s: (0.3 + 6 * (1 - need) * (1 - need)) * clamp(8 / (4 + d), 0.25, 1.2) * (kind === 'C' ? 1.5 : 1), t: { type: J.type, jobKind: kind, phase: 'go', b, t: 0 } });
    }
  }
  // Note: a link bench (C) stands at the bench end station, on the island of that end; it is the island's only one, so it scores higher.
  const J = TIER_JOBS.C;
  if (!dusk || f.needs[J.need] >= 0.9) return;
  for (const l of world.links) {
    if (!l.isLink || l.state !== 'done' || !l.built || (l.tier | 0) < J.min || (l.claims || 0) > 0) continue;
    if ((l.benchEnd ? l.b : l.a) !== isl.id) continue;
    const cd = spotCd.get(l);
    if (cd && cd.C > world.time) continue;
    if (spotTaken(world, l, 'C')) continue;
    const sp = linkBenchSpot(isl, l, l.benchEnd ? 1 : 0);
    const ci = Math.floor(sp.x); const cj = Math.floor(sp.z);
    if (!inB(ci, cj) || !isl.walkable(ci, cj) || (isl.reach && !isl.reach[cidx(ci, cj)])) continue;
    const d = Math.hypot(sp.x - f.x, sp.z - f.z);
    if (d > (0.79 - world.tod) * 360 - 3) continue;
    cands.push({ s: (0.3 + 6 * (1 - f.needs[J.need]) * (1 - f.needs[J.need])) * clamp(8 / (4 + d), 0.25, 1.2) * 2.5, t: { type: J.type, jobKind: 'C', phase: 'go', b: l, t: 0 } });
  }
}

function artBusy(world, isl) {
  let n = 0;
  for (const f of world.folk) if (f.isle === isl.id && f.task && f.task.type === 'art' && !f.task.b) n++;
  return n;
}

function startTask(world, f, isl, t) {
  f.task = t;
  t.claimB = null;
  if (t.type === 'build') { t.claimB = t.b; t.b.claims = (t.b.claims || 0) + 1; }
  if (t.type === 'gather') { claimCell(isl, t.r.c); t.claimCell = t.r.c; }
  if (t.type === 'art' && t.spot) { const c = cidx(t.spot.i, t.spot.j); claimCell(isl, c); t.claimCell = c; isl.artPlan = null; }
  if (t.type === 'plant') { (isl.planting || (isl.planting = {}))[t.want] = (isl.planting[t.want] || 0) + 1; }
  if (t.type === 'craft') { t.b.busy = true; t.station = t.b; }
  if (t.type === 'trade') t.job.taken = true;
  if (t.type === 'tend') t.b.tender = f.id;
  if (t.jobKind) spotBusyOf(t.b)[t.jobKind] = f.id;
}

// Note: a traveller who will come back keeps its home island and leaves the bed index, which only fits home; settlers on a long route drop it too.
function awayStart(f, t) {
  if (f.crew || t.home) return;
  if (t.settle) { if (t.route) { f.home = -1; f.homelessT = 0; } return; }
  if (t.fromIsle === undefined) return;
  f.crew = { home: t.fromIsle, idx: f.home };
  f.home = -1;
}

// Note: one step of a build task; the council and link tiers are shared by the crew's work phase.
function runBuild(world, f, isl, dt, t) {
  const b = t.b;
  if (b.gone) return 'fail';
  if (b.isLink && t.adorn) return runLinkAdorn(world, f, isl, dt, t);
  const upg = b.upgrading && b.built;
  if (t.phase === 'go') {
    if (!setPath(f, isl, b.door.i, b.door.j)) { b.door = nearestWalkable(isl, b.x, b.y, isl.reach, 5) ? { i: nearestWalkable(isl, b.x, b.y, isl.reach, 5)[0], j: nearestWalkable(isl, b.x, b.y, isl.reach, 5)[1] } : b.door; return 'fail'; }
    t.phase = 'walk';
  } else if (t.phase === 'walk') {
    if (walk(world, f, isl, dt)) t.phase = 'work';
  } else {
    f.anim = 'work'; f.prop = 'hammer';
    faceTo(f, b.x + b.size / 2, b.y + b.size / 2);
    const rate = f.talent.build * (stockGet(isl, 'tool') > 0 ? 1.3 : 1);
    if (t.adorn && b.built) {
      // Note: the council hall costs no goods, only work time.
      if (!b.adPaid && b.id !== 'council') {
        const cost = flourishCost(isl, b.flourish | 0);
        if (!cost || !canAfford(isl, cost)) return 'fail';
        spend(isl, cost); b.adPaid = true;
      }
      b.adProgress = (b.adProgress || 0) + dt * rate / 9;
      if (R() < dt * 1.2) world.emit({ type: 'hammer', isl, b });
      if (b.adProgress >= 1) {
        b.flourish = (b.flourish | 0) + 1; b.adProgress = 0; b.adPaid = false;
        isl.touch('bld');
        f.talent.build = Math.min(1.6, f.talent.build + 0.005);
        world.emit({ type: 'built', isl, b });
        return 'done';
      }
      return;
    }
    if (upg) {
      b.upProgress = (b.upProgress || 0) + dt * rate / 9;
      if (b.upProgress >= 1) { b.level = Math.min(2, (b.level || 0) + 1); b.upgrading = false; isl.touch('bld'); world.emit({ type: 'built', isl, b }); return 'done'; }
    } else {
      b.progress = Math.min(1, b.progress + dt * rate / b.work);
      if (R() < dt * 1.2) world.emit({ type: 'hammer', isl, b });
      if (b.progress >= 1) {
        b.built = true;
        if (b.id === 'bonfire') { b.lit = false; b.dryT = 20; }
        isl.touch('bld');
        f.talent.build = Math.min(1.6, f.talent.build + 0.01);
        world.emit({ type: 'built', isl, b });
        return 'done';
      }
    }
    isl.touch('bld');
  }
  return;
}

// Note: runs the current task one step; ends the task when it returns 'done' or 'fail'.
function runTask(world, f, isl, dt) {
  const t = f.task;
  const sv = storehouse(isl);
  const dr = door(isl);
  switch (t.type) {
    case 'dockwork': {
      // Note: cosmetic hauling; the crate is {n: 0}, so giving it back never creates goods.
      const sh = world.ships.find((x) => x.id === t.ship);
      const db = sh && isl.buildings[sh.dock];
      t.age += dt;
      if (!sh || sh.from !== isl.id || (sh.state !== 'load' && sh.state !== 'unload') || t.age > 60) { f.carry = null; return 'done'; }
      if (!sv || !db || db.gone || !db.door) { f.carry = null; isl.dockCd = world.time + 20; return 'fail'; }
      const load = sh.state === 'load';
      const A = load ? sv.door : db.door; const B = load ? db.door : sv.door;
      if (t.phase === 'go') {
        if (!setPath(f, isl, A.i, A.j)) { isl.dockCd = world.time + 20; return 'fail'; }
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) {
          const g = Object.keys(sh.cargo || {}).find((k) => sh.cargo[k] > 0) || Object.keys(isl.stock || {}).find((k) => isl.stock[k] > 0) || 'wood';
          f.carry = { good: g, n: 0 };
          if (!setPath(f, isl, B.i, B.j)) { f.carry = null; isl.dockCd = world.time + 20; return 'fail'; }
          t.phase = 'haul';
        }
      } else if (t.phase === 'haul') {
        if (walk(world, f, isl, dt, true)) { f.carry = null; t.phase = 'drop'; t.t = 0.8; }
      } else {
        f.anim = 'idle';
        t.t -= dt;
        if (t.t <= 0) t.phase = 'go';
      }
      return;
    }
    case 'wander': {
      if (t.phase === 'go') {
        const cx = t.around ? t.around.i : f.x; const cz = t.around ? t.around.j : f.z;
        const spread = t.around ? 6 : 8;
        const spot = nearestWalkable(isl, Math.floor(cx + (R() - 0.5) * spread), Math.floor(cz + (R() - 0.5) * spread), isl.reach, 4);
        if (!spot || !setPath(f, isl, spot[0], spot[1])) return 'fail';
        t.phase = 'walk';
      } else if (walk(world, f, isl, dt)) return 'done';
      return;
    }
    case 'gaze': {
      if (t.phase === 'go') {
        const spots = t.spot ? [t.spot] : isl.gaze && isl.gaze.length ? isl.gaze : null;
        if (!spots) { t.phase = 'none'; return; }
        let tot = 0; for (const s of spots) tot += s.w;
        let x = R() * tot; let pick = spots[0];
        for (const s of spots) { x -= s.w; if (x <= 0) { pick = s; break; } }
        t.spot = pick;
        // Note: a low mood shows as a slump where the folk stands.
        if (f.mood < 0.4 && R() < 0.7) { t.phase = 'slump'; t.t = 6 + R() * 4; return; }
        if (!setPath(f, isl, pick.i, pick.j)) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'slump') {
        f.anim = 'slump';
        t.t -= dt;
        if (t.t <= 0) return 'done';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'look'; t.t = 4 + R() * 5; t.flip = 0; }
      } else if (t.phase === 'look') {
        const sp = t.spot;
        if (sp.why === 'goods') {
          // Note: looks back and forth between the pile and the site.
          t.flip = (t.flip || 0) + dt;
          const second = Math.floor(t.flip / 1.5) % 2 === 1;
          faceTo(f, second ? sp.fi2 : sp.fi, second ? sp.fj2 : sp.fj);
        } else faceTo(f, sp.fi, sp.fj);
        if (sp.why === 'skill') { f.anim = 'shrug'; f.prop = 'hammer'; } else f.anim = sp.why === 'dry' || sp.why === 'admire' ? 'idle' : 'gaze';
        f.needs.wonder = Math.min(1, f.needs.wonder + dt * 0.02);
        t.t -= dt;
        if (t.t <= 0) return 'done';
      } else if (t.phase === 'none') {
        f.anim = 'idle'; t.t += dt; if (t.t > 2.5) return 'done';
      }
      return;
    }
    case 'flee': {
      if (!t.path) {
        let best = null; let bd = -1;
        for (let k = 0; k < 14; k++) {
          const sp = nearestWalkable(isl, Math.floor(f.x + (R() - 0.5) * 14), Math.floor(f.z + (R() - 0.5) * 14), isl.reach, 3);
          if (!sp) continue;
          const d = Math.hypot(sp[0] - t.from[0], sp[1] - t.from[1]);
          if (d > bd) { bd = d; best = sp; }
        }
        if (!best || !setPath(f, isl, best[0], best[1])) return 'fail';
        t.path = true;
      } else if (walk(world, f, isl, dt * 1.35)) return 'done';
      return;
    }
    case 'gather': {
      const r = t.r;
      if (t.phase === 'go') {
        const water = r.kind === 'fish';
        if (!setPath(f, isl, r.i, r.j, water)) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) {
          t.phase = 'work';
          t.t = (r.kind === 'tree' ? 3.6 : r.kind === 'stone' || r.kind === 'dep' ? 3 : r.kind === 'fish' ? (f.fisher ? 7 : 10) : 2.2) / (f.talent.gather * (stockGet(isl, 'tool') > 0 ? 1.35 : 1));
          if (r.kind === 'fish') t.total = t.t;
          faceTo(f, r.i + 0.5, r.j + 0.5);
        }
      } else if (t.phase === 'work') {
        f.anim = r.kind === 'fish' ? 'fish' : 'work';
        f.prop = r.kind === 'tree' ? 'axe' : r.kind === 'stone' || r.kind === 'dep' ? 'pickaxe' : r.kind === 'fish' ? 'rod' : r.kind === 'fruit' ? null : 'sickle';
        faceTo(f, r.i + 0.5, r.j + 0.5);
        t.t -= dt;
        if (t.t <= 0) {
          let got = null;
          if (r.kind === 'fish') {
            isl.fishCd[r.c] = 30;
            if (isl.water[r.c] >= 0.3 && catchFish(world, isl, r.i, r.j)) got = { good: 'fish', n: f.fisher ? 2 : 1 };
          } else {
            const cur = resourceAt(isl, r.i, r.j);
            if (cur && cur.good === r.good) got = harvest(isl, r.i, r.j);
          }
          // Note: autumn feast: fruit and wheat harvests yield more.
          if (got && (r.kind === 'fruit' || r.kind === 'wheat') && world.seasonK && world.seasonK[2] > 0.5) got = { ...got, n: (got.n || 1) + SEASON_AUTUMN_BONUS };
          if (!got) return 'fail';
          // Note: after the beacon burns, far rings yield more and sometimes a rarer good.
          if (world.gw && world.gw.lit && !got.rare && r.kind !== 'fish') {
            const ring = Math.max(Math.abs(isl.gx), Math.abs(isl.gz));
            const fb = gwFarBonus(world.gw, ring);
            if (fb.yieldMul > 1) got = { ...got, good: gwFarGood(world.gw, ring, got.good, R()), n: (got.n || 1) + (R() < fb.yieldMul - 1 ? 1 : 0) };
          }
          (isl.use || (isl.use = {}))[got.good] = (isl.use[got.good] || 0) + (got.n || 1);
          world.emit({ type: 'gathered', isl, i: r.i, j: r.j, good: got.good });
          if (t.forEat) {
            f.needs.food = Math.min(1, f.needs.food + (FOOD_VALUE[got.good] || 0.2) * (got.n || 1) * 0.8);
            t.phase = 'eat'; t.t = 2.5;
          } else {
            f.carry = { good: got.good, n: got.n || 1 };
            t.phase = 'deliver';
            if (isl.claims) isl.claims.delete(r.c);
            t.claimCell = undefined;
            if (!setPath(f, isl, dr.i, dr.j)) { giveCarryBack(f, isl); return 'done'; }
          }
        }
      } else if (t.phase === 'eat') {
        f.anim = 'eat'; t.t -= dt; if (t.t <= 0) return 'done';
      } else if (t.phase === 'deliver') {
        if (walk(world, f, isl, dt, true)) { giveCarryBack(f, isl); f.talent.gather = Math.min(1.6, f.talent.gather + 0.002); return 'done'; }
      }
      return;
    }
    case 'eat': {
      if (t.phase === 'go') {
        const g = foodAvailable(isl);
        if (g && sv) { t.good = g; if (!setPath(f, isl, dr.i, dr.j)) return 'fail'; t.phase = 'fetch'; return; }
        const r = nearestRes(isl, f, (x) => x.good === 'fruit' || x.good === 'wheat' || x.good === 'fish');
        if (!r) { if (g) { t.good = g; t.phase = 'fetch'; setPath(f, isl, dr.i, dr.j); return; } return 'fail'; }
        f.task = { type: 'gather', phase: 'go', r, t: 0, forEat: true };
        claimCell(isl, r.c); f.task.claimCell = r.c;
        return;
      } else if (t.phase === 'fetch') {
        if (walk(world, f, isl, dt)) {
          if (stockTake(isl, t.good, 1)) {
            t.phase = 'eat'; t.t = 3; f.needs.food = Math.min(1, f.needs.food + (FOOD_VALUE[t.good] || 0.3)); world.emit({ type: 'ate', isl, good: t.good });
            // Note: with a hall, folk carry the meal to a chair at the table.
            const s = reserveSeat(isl, f, mateOf(world, f));
            if (s) {
              t.seatB = s.b; t.seatK = s.k; t.seat = s.seat;
              if (setPath(f, isl, Math.floor(s.seat.x), Math.floor(s.seat.z))) { t.phase = 'toSeat'; f.carry = null; }
              else { freeSeat(s.b, s.k); t.seatB = null; t.seat = null; }
            }
          } else return 'fail';
        }
      } else if (t.phase === 'toSeat') {
        f.anim = 'walk';
        if (walk(world, f, isl, dt)) { f.x = t.seat.x; f.z = t.seat.z; f.face = t.seat.face; t.phase = 'eat'; t.t = 5; }
      } else if (t.phase === 'eat') {
        f.anim = t.seat ? 'sitEat' : 'eat'; t.t -= dt;
        if (t.seat) { f.face = t.seat.face; f.needs.company = Math.min(1, f.needs.company + dt * 0.01); }
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'sleep': {
      if (t.phase === 'go') {
        const hb = f.home >= 0 ? isl.buildings[f.home] : null;
        let dst = hb && !hb.gone && hb.built ? hb.door : null;
        t.inHome = !!dst;
        if (!dst) {
          const sp = beside(world, isl, f) || findSleepSpot(isl, f);
          dst = sp ? { i: sp[0], j: sp[1] } : { i: Math.floor(f.x), j: Math.floor(f.z) };
          if (sp) { (isl.sleepers || (isl.sleepers = new Set())).add(cidx(sp[0], sp[1])); t.sleepCell = cidx(sp[0], sp[1]); }
        }
        if (!isl.walkable(dst.i, dst.j)) dst = nearestWalkable(isl, dst.i, dst.j, null, 3) ? { i: nearestWalkable(isl, dst.i, dst.j, null, 3)[0], j: nearestWalkable(isl, dst.i, dst.j, null, 3)[1] } : { i: Math.floor(f.x), j: Math.floor(f.z) };
        if (!setPath(f, isl, dst.i, dst.j)) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'sleep'; t.t = 0; }
      } else {
        f.anim = 'sleep';
        t.t += dt;
        f.needs.rest = Math.min(1, f.needs.rest + dt * (t.inHome ? 0.014 : 0.008));
        if (t.inHome) f.needs.shelter = Math.min(1, f.needs.shelter + dt * 0.02);
        const morning = !isNight(world) && f.needs.rest > 0.55;
        if (f.needs.rest >= 0.98 || (morning && t.t > 6)) return 'done';
        if (isl.burning && R() < 0.01) return 'done';
      }
      return;
    }
    case 'social': {
      if (t.phase === 'go') {
        const cf = builtOf(isl, 'campfire').find((b) => b.lit !== false);
        let ti; let tj;
        const hs = (isNight(world) || R() < 0.65) ? reserveSeat(isl, f, mateOf(world, f)) : null;
        if (hs) {
          t.seatB = hs.b; t.seatK = hs.k; t.seat = hs.seat;
          if (setPath(f, isl, Math.floor(hs.seat.x), Math.floor(hs.seat.z))) { t.phase = 'walk'; t.focus = { i: hs.b.x + hs.b.size / 2, j: hs.b.y + hs.b.size / 2 }; return; }
          freeSeat(hs.b, hs.k); t.seatB = null; t.seat = null;
        }
        if (cf) {
          // Note: D29 the ring seats are the cells around the campfire, the four sides first; a taken seat is skipped.
          const seat = ringSeat(world, isl, f, cf);
          if (seat) { ti = seat[0]; tj = seat[1]; t.ring = cidx(ti, tj); } else { const a = R() * 6.28; ti = Math.floor(cf.x + 0.5 + Math.cos(a) * 1.6); tj = Math.floor(cf.y + 0.5 + Math.sin(a) * 1.6); }
          t.focus = { i: cf.x + 0.5, j: cf.y + 0.5 }; t.fire = true;
        }
        else {
          const others = world.folkOn(isl.id).filter((o) => o !== f);
          if (!others.length) return 'fail';
          const o = others[Math.floor(R() * others.length)];
          ti = Math.floor(o.x + (R() - 0.5) * 2); tj = Math.floor(o.z + (R() - 0.5) * 2);
        }
        const sp = nearestWalkable(isl, ti, tj, isl.reach, 4);
        if (!sp || !setPath(f, isl, sp[0], sp[1])) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'sit'; t.t = 9 + R() * 8; if (t.seat) { f.x = t.seat.x; f.z = t.seat.z; } }
      } else {
        f.anim = 'sit';
        if (t.seat) f.face = t.seat.face;
        else if (t.focus) faceTo(f, t.focus.i, t.focus.j);
        let near = 0;
        for (const o of world.folkOn(isl.id)) if (o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 3.2) near++;
        f.needs.company = Math.min(1, f.needs.company + dt * (0.012 + near * 0.012 + (t.fire ? 0.012 : 0) + (t.seat ? 0.014 : 0)));
        t.t -= dt;
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'wonder': {
      if (t.phase === 'go') {
        const lk = builtOf(isl, 'lookout').filter((b) => !b.busy)[0];
        // Note: wonder: relic first, then the lookout, then the rim facing fog.
        const kr = knowRelic(isl);
        if (kr && !kr.taken && isl.reach && isl.reach[cidx(kr.i, kr.j)] && R() < 0.8) {
          t.relic = true; t.focus = { i: kr.i + 0.5, j: kr.j + 0.5 };
          if (!setPath(f, isl, kr.i, kr.j)) return 'fail';
        } else if (lk && R() < 0.7) {
          t.lookout = lk; t.focus = null;
          if (!setPath(f, isl, lk.door.i, lk.door.j)) return 'fail';
        } else {
          const far = (isl.gaze || []).filter((s) => s.why === 'far');
          if (far.length) { const s = far[Math.floor(R() * far.length)]; t.focus = { i: s.fi, j: s.fj }; if (!setPath(f, isl, s.i, s.j)) return 'fail'; }
          else {
            // Note: climb the highest nearby reachable ground.
            let best = null; let bh = -1;
            for (let k = 0; k < 20; k++) {
              const sp = nearestWalkable(isl, Math.floor(R() * N), Math.floor(R() * N), isl.reach, 2);
              if (sp && isl.cellH(sp[0], sp[1]) > bh) { bh = isl.cellH(sp[0], sp[1]); best = sp; }
            }
            if (!best || !setPath(f, isl, best[0], best[1])) return 'fail';
            t.focus = { i: N / 2 + (R() - 0.5) * 30, j: N / 2 + (R() - 0.5) * 30 };
          }
        }
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) {
          t.phase = 'look'; t.t = 7 + R() * 5;
          const kr2 = knowRelic(isl);
          if (t.relic && kr2 && !kr2.taken) { world.discover(isl); t.t = 6; }
        }
      } else {
        f.anim = 'gaze';
        if (t.focus) faceTo(f, t.focus.i, t.focus.j);
        f.needs.wonder = Math.min(1, f.needs.wonder + dt * (t.lookout ? 0.05 : 0.035));
        t.t -= dt;
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'art': {
      const b = t.b;
      if (b && b.gone) return 'done';
      if (t.phase === 'go') {
        const dst = b ? b.door : { i: t.spot.stand[0], j: t.spot.stand[1] };
        if (!setPath(f, isl, dst.i, dst.j)) return 'fail';
        if (b) b.repairing = true;
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) {
          if (!b) {
            const c = cidx(t.spot.i, t.spot.j);
            if (isl.bld[c] >= 0 || isl.plant[c]) return 'fail';
            const cost = artCost(t.kind, t.arch);
            for (const g in cost) if (stockGet(isl, g) < cost[g]) return 'fail';
            for (const g in cost) stockTake(isl, g, cost[g]);
            t.piece = placeArt(world, isl, t.kind, t.arch, t.spot.i, t.spot.j, t.spot.stand);
          }
          t.phase = 'work';
          t.total = t.t = b ? 4 : artWork(t.kind);
          t.tick = 0;
          const ti = b ? b.x : t.spot.i; const tj = b ? b.y : t.spot.j;
          faceTo(f, ti + 0.5, tj + 0.5);
        }
      } else {
        const kind = b ? b.kind : t.kind;
        f.anim = kind === 'doodle' ? 'plant' : 'work';
        f.prop = b || kind === 'doodle' ? 'brush' : ARCH[t.arch].prop;
        t.t -= dt;
        if (t.piece) t.piece.growth = Math.min(0.999, 1 - t.t / t.total);
        t.tick += dt;
        if (t.tick > 1.3 && kind !== 'doodle') { t.tick = 0; world.emit({ type: 'hammer', isl, b: b || t.piece }); }
        if (t.t <= 0) {
          if (b) { b.wear = 0; world.emit({ type: 'art', isl, b, repair: true }); return 'done'; }
          finishArt(world, isl, t.piece);
          t.piece = null;
          return 'done';
        }
      }
      return;
    }
    case 'festival': {
      // Note: neighbours come as guests over a link: toLink, cross, then the same party phases, then back home.
      const fe = isl.festival;
      if (t.guest && (t.phase === 'toLink' || t.phase === 'walkLink' || t.phase === 'cross' || t.phase === 'back' || t.phase === 'backWalk' || t.phase === 'home')) {
        const link = t.link;
        const mine = link.a === isl.id ? link.ai : link.bi;
        if (t.phase === 'toLink') {
          if (!setPath(f, isl, mine.i, mine.j)) return 'fail';
          t.phase = 'walkLink';
        } else if (t.phase === 'walkLink') {
          if (walk(world, f, isl, dt)) { if (board(world, f, link, isl.id)) t.phase = 'cross'; }
        } else if (t.phase === 'cross') {
          if (!f.link) { t.phase = isl.festival ? 'go' : 'back'; t.t = 0; }
        } else if (t.phase === 'back') {
          if (f.isle === t.home) { f.guestOf = null; return 'done'; }
          if (!setPath(f, isl, mine.i, mine.j)) f.path = null;
          t.phase = 'backWalk';
        } else if (t.phase === 'backWalk') {
          if (walk(world, f, isl, dt)) { if (board(world, f, link, isl.id)) t.phase = 'home'; }
        } else if (!f.link) {
          if (f.isle === t.home) f.guestOf = null;
          return 'done';
        }
        return;
      }
      if (!fe) { if (t.guest) { t.phase = 'back'; return; } return 'done'; }
      if (t.phase === 'go') {
        const a = R() * 6.28; const d = 1 + R() * 2.6;
        const w = nearestWalkable(isl, clamp(Math.round(fe.at.i + Math.cos(a) * d), 0, N - 1), clamp(Math.round(fe.at.j + Math.sin(a) * d), 0, N - 1), isl.reach, 3);
        if (!w || !setPath(f, isl, w[0], w[1])) { if (t.guest) { t.phase = 'back'; return; } return 'fail'; }
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'dance'; t.t = 0; }
      } else {
        f.anim = 'dance';
        faceTo(f, fe.at.i + 0.5, fe.at.j + 0.5);
        f.needs.company = Math.min(1, f.needs.company + dt * 0.03);
        f.needs.wonder = Math.min(1, f.needs.wonder + dt * 0.03);
        t.t += dt;
        // Note: guests dance on while the festival lasts, then go home; residents leave after one round.
        if (t.t > 35) { if (t.guest) { t.phase = fe.t > 20 ? 'go' : 'back'; t.t = 0; return; } return 'done'; }
      }
      return;
    }
    case 'relight': {
      const b = t.b;
      if (b.gone || b.lit !== false) return 'done';
      if (t.phase === 'go') {
        if (!setPath(f, isl, b.x, b.y, true)) return 'fail';
        b.relighting = true; t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'work'; t.t = 2.5; faceTo(f, b.x + 0.5, b.y + 0.5); }
      } else {
        f.anim = 'plant'; f.prop = 'torch';
        t.t -= dt;
        if (t.t <= 0) {
          if ((b.dryT || 0) < 6 || !stockTake(isl, 'wood', 1)) return 'fail';
          b.lit = true;
          world.emit({ type: 'lit', isl, b });
          return 'done';
        }
      }
      return;
    }
    case 'plant': {
      if (t.phase === 'go') {
        const kind = plantKindFor(isl, t.want);
        const spot = findPlantSpot(isl, kind, f, t.want === 'vine' ? isl.vineSpot : null);
        if (!spot || !setPath(f, isl, spot[0], spot[1], true)) {
          (isl.noPlant || (isl.noPlant = {}))[t.want] = world.time + 45;
          return 'fail';
        }
        t.kind = kind; t.spot = spot; claimCell(isl, cidx(spot[0], spot[1])); t.claimCell = cidx(spot[0], spot[1]);
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'work'; t.t = 2.2 / f.talent.gather; faceTo(f, t.spot[0] + 0.5, t.spot[1] + 0.5); }
      } else {
        f.anim = 'plant'; f.prop = 'hoe';
        faceTo(f, t.spot[0] + 0.5, t.spot[1] + 0.5);
        t.t -= dt;
        if (t.t <= 0) {
          const c = cidx(t.spot[0], t.spot[1]);
          if (isl.plant[c] || isl.bld[c] >= 0 || isl.water[c] > 0.45) return 'fail';
          isl.plant[c] = PK[t.kind]; isl.grow[c] = 0.02;
          isl.touch('plant');
          world.emit({ type: 'planted', isl, i: t.spot[0], j: t.spot[1], kind: t.kind });
          return 'done';
        }
      }
      return;
    }
    case 'build': return runBuild(world, f, isl, dt, t);
    case 'craft': {
      const b = t.b; const rec = t.rec;
      if (b.gone || !sv) return 'fail';
      if (t.phase === 'fetch') {
        if (!t.path) { if (!setPath(f, isl, dr.i, dr.j)) return 'fail'; t.path = true; }
        else if (walk(world, f, isl, dt)) {
          for (const g in rec.in) if (stockGet(isl, g) < rec.in[g]) return 'fail';
          for (const g in rec.in) stockTake(isl, g, rec.in[g]);
          t.phase = 'toStation'; t.path = false;
          f.carry = { good: Object.keys(rec.in)[0], n: 1 };
          if (!setPath(f, isl, b.door.i, b.door.j)) { for (const g in rec.in) stockAdd(isl, g, rec.in[g]); f.carry = null; return 'fail'; }
        }
      } else if (t.phase === 'toStation') {
        if (walk(world, f, isl, dt, true)) {
          f.carry = null; t.phase = 'work';
          t.t = rec.time / (f.talent.craft * (stockGet(isl, 'tool') > 0 ? 1.25 : 1));
          if (b.id === 'windmill') t.t /= clamp(world.weather.wind.s * 3, 0.5, 2);
        }
      } else if (t.phase === 'work') {
        f.anim = 'work'; f.prop = 'hammer';
        faceTo(f, b.x + b.size / 2, b.y + b.size / 2);
        b.working = true;
        t.t -= dt;
        if (t.t <= 0) {
          b.working = false;
          const out = Object.keys(rec.out)[0];
          f.carry = { good: out, n: rec.out[out] };
          world.made[out] = (world.made[out] || 0) + rec.out[out];
          (isl.use || (isl.use = {}))[out] = (isl.use[out] || 0) + 1;
          world.emit({ type: 'crafted', isl, b, good: out });
          t.phase = 'return';
          if (!setPath(f, isl, dr.i, dr.j)) { giveCarryBack(f, isl); return 'done'; }
        }
      } else if (t.phase === 'return') {
        if (walk(world, f, isl, dt, true)) { giveCarryBack(f, isl); f.talent.craft = Math.min(1.6, f.talent.craft + 0.004); return 'done'; }
      }
      if (t.phase !== 'work') b.working = false;
      return;
    }
    case 'tend': {
      const b = t.b;
      if (b.gone || !sv) return 'fail';
      if (t.phase === 'go') {
        if (t.mode === 'shrug') b.shrugT = world.time + 90;
        if (!setPath(f, isl, t.mode === 'feed' ? dr.i : b.door.i, t.mode === 'feed' ? dr.j : b.door.j)) return 'fail';
        t.phase = t.mode === 'feed' ? 'fetch' : 'walk';
      } else if (t.phase === 'fetch') {
        if (walk(world, f, isl, dt)) {
          const n = Math.min(6, Math.floor(stockGet(isl, 'wheat')));
          if (n < 1 || !stockTake(isl, 'wheat', n)) return 'fail';
          f.carry = { good: 'wheat', n };
          if (!setPath(f, isl, b.door.i, b.door.j)) { giveCarryBack(f, isl); return 'fail'; }
          t.phase = 'walk';
        }
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt, !!f.carry)) { t.phase = 'work'; t.t = t.mode === 'shear' ? 5 : t.mode === 'shrug' ? 3.5 : 3; }
      } else if (t.phase === 'work') {
        faceTo(f, b.x + b.size / 2, b.y + b.size / 2);
        f.anim = t.mode === 'shrug' ? 'shrug' : 'work';
        f.prop = t.mode === 'shrug' ? null : t.mode === 'shear' ? 'shears' : 'basket';
        t.t -= dt;
        if (t.t > 0) return;
        if (t.mode === 'shrug') return 'done';
        if (t.mode === 'feed') {
          b.feed = Math.min(6, (b.feed || 0) + (f.carry ? f.carry.n : 0)); f.carry = null;
          return 'done';
        }
        let n = 0;
        if (t.mode === 'eggs') { n = Math.floor(b.eggs || 0); b.eggs = 0; }
        else for (const a of world.animals) if (a.home === b && a.wool >= 1 && n < 6) { a.wool = 0; n += 2; }
        if (n < 1) return 'fail';
        f.carry = { good: t.mode === 'eggs' ? 'egg' : 'wool', n };
        world.emit({ type: 'gathered', isl, i: b.door.i, j: b.door.j, good: f.carry.good });
        t.phase = 'deliver';
        if (!setPath(f, isl, dr.i, dr.j)) { giveCarryBack(f, isl); return 'done'; }
      } else if (t.phase === 'deliver') {
        if (walk(world, f, isl, dt, true)) { giveCarryBack(f, isl); f.talent[t.mode === 'shear' ? 'craft' : 'gather'] += 0.003; return 'done'; }
      }
      return;
    }
    case 'trade': {
      const job = t.job;
      const link = job.link;
      const mine = link.a === isl.id ? link.ai : link.bi;
      if (t.phase === 'fetch') {
        if (!t.path) { if (!sv || !setPath(f, isl, dr.i, dr.j)) return 'fail'; t.path = true; }
        else if (walk(world, f, isl, dt)) {
          if (!stockTake(isl, job.good, job.n)) { job.taken = false; return 'fail'; }
          f.carry = { good: job.good, n: job.n };
          t.phase = 'toLink'; t.path = false;
          if (!setPath(f, isl, mine.i, mine.j)) { giveCarryBack(f, isl); job.taken = false; return 'fail'; }
        }
      } else if (t.phase === 'toLink') {
        if (walk(world, f, isl, dt, true)) { if (board(world, f, link, isl.id)) t.phase = 'cross'; }
      } else if (t.phase === 'cross') {
        if (!f.link) { t.phase = 'toStore'; t.path = false; }
      } else if (t.phase === 'toStore') {
        const ni = world.islands.get(f.isle);
        const d2 = door(ni);
        if (!t.path) {
          // Note: a landing cut off from the store must not strand the trader; the goods stay and the trader boards back.
          if (!setPath(f, ni, d2.i, d2.j)) { giveCarryBack(f, ni); job.done = true; f.path = null; t.phase = 'back'; return; }
          t.path = true;
        }
        else if (walk(world, f, ni, dt, true)) {
          if (f.carry) { stockAdd(ni, f.carry.good, f.carry.n); f.carry = null; world.emit({ type: 'traded', isl: ni }); }
          job.done = true;
          const back = link.a === ni.id ? link.ai : link.bi;
          const home = link.a === job.from ? link.ai : link.bi;
          t.phase = 'back'; t.path = false;
          if (!setPath(f, ni, back.i, back.j)) f.path = null;
          t.path = true;
        }
      } else if (t.phase === 'back') {
        const ni = world.islands.get(f.isle);
        if (walk(world, f, ni, dt)) { if (board(world, f, link, ni.id)) t.phase = 'home'; }
      } else if (t.phase === 'home') {
        if (!f.link) return 'done';
      }
      return;
    }
    case 'court': {
      const m = world.folk.find((o) => o.id === t.mate);
      if (!m || m.isle !== f.isle || m.link || m.partner !== f.id) return 'done';
      if (t.phase === 'wait') {
        f.anim = 'idle'; t.t += dt;
        if (t.t > 20) return 'done';
        if (m.task && m.task.type === 'court' && m.task.phase === 'dance') { t.phase = 'dance'; t.t = 3; }
      } else if (t.phase === 'go') {
        if (!setPath(f, isl, t.at.i, t.at.j, true)) return 'done';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) {
          t.phase = 'dance'; t.t = 3;
          if (m.task && m.task.type === 'court') { m.task.phase = 'dance'; m.task.t = 3; }
          world.emit({ type: 'court', isl, f });
        }
      } else {
        f.anim = 'dance'; faceTo(f, m.x, m.z);
        f.needs.company = Math.min(1, f.needs.company + dt * 0.1);
        t.t -= dt;
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'mourn': {
      if (t.phase === 'go') {
        const mems = isl.memorials || [];
        const mem = t.at || mems[mems.length - 1] || null;
        const hb = f.home >= 0 ? isl.buildings[f.home] : null;
        const dst = mem || (hb && hb.door) || null;
        if (!dst || !setPath(f, isl, dst.i, dst.j)) { t.phase = 'slump'; t.t = 6 + R() * 3; return; }
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'slump'; t.t = 7 + R() * 3; world.emit({ type: 'mourn', isl, f }); }
      } else {
        f.anim = 'slump'; t.t -= dt;
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'follow': {
      const p = world.folk.find((o) => o.id === t.par);
      if (!p || p.isle !== f.isle || p.link || (t.partner && !(p.task && p.task.type === 'stroll'))) return 'done';
      t.t -= dt;
      if (t.t <= 0) return 'done';
      if (t.partner) f.needs.company = Math.min(1, f.needs.company + dt * 0.015);
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d > (t.gap || 1.5)) {
        t.re = (t.re || 0) - dt;
        if (!f.path || f.pi >= f.path.length || t.re <= 0) {
          const sp = nearestWalkable(isl, Math.floor(p.x), Math.floor(p.z), null, 2);
          if (!sp || !setPath(f, isl, sp[0], sp[1])) { f.anim = 'idle'; t.re = 0.8; return; }
          t.re = 0.8;
        }
        walk(world, f, isl, dt);
      } else {
        f.path = null;
        f.anim = !t.partner && p.anim === 'work' ? 'gaze' : 'idle';
        faceTo(f, p.x, p.z);
      }
      return;
    }
    case 'stroll': {
      const m = world.folk.find((o) => o.id === t.mate);
      if (t.phase === 'go') {
        if (!m || m.isle !== f.isle || m.link || m.queue) return 'fail';
        if (m.task && !['wander', 'gaze', 'social'].includes(m.task.type)) return 'fail';
        const spot = nearestWalkable(isl, Math.floor(f.x + (R() - 0.5) * 12), Math.floor(f.z + (R() - 0.5) * 12), isl.reach, 4);
        if (!spot || !setPath(f, isl, spot[0], spot[1])) return 'fail';
        m.queue = { type: 'follow', phase: 'go', par: f.id, t: 40, gap: 1.1, partner: true };
        if (m.task) endTask(world, m, isl);
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        f.needs.company = Math.min(1, f.needs.company + dt * 0.015);
        if (walk(world, f, isl, dt)) { t.phase = 'rest'; t.t = 4 + R() * 3; }
      } else {
        f.anim = 'idle'; f.needs.company = Math.min(1, f.needs.company + dt * 0.015);
        t.t -= dt;
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'proud': {
      // Note: the parent carries the newborn out of the hut and shows it to the neighbours.
      if (t.phase === 'go') {
        const hb = f.home >= 0 ? isl.buildings[f.home] : null;
        if (!hb || !hb.door) return 'fail';
        const sp = nearestWalkable(isl, hb.door.i, hb.door.j + 2, null, 3);
        if (!sp || !setPath(f, isl, sp[0], sp[1])) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt, true)) { t.phase = 'show'; t.t = 5; }
      } else {
        f.anim = 'cradle'; t.t -= dt;
        f.needs.company = Math.min(1, f.needs.company + dt * 0.03);
        if (t.t <= 0) return 'done';
      }
      return;
    }
    case 'cross': {
      // Note: venture or migrate across a link: walk to anchor, board, arrive, then act.
      const link = t.link;
      const mine = link.a === isl.id ? link.ai : link.bi;
      if (t.phase === 'farewell') {
        // Note: the first settler of a party takes the kit from the island stock and claims the empty island; a short stock cancels the trip.
        if (t.t === 0 && t.settle && t.lead) {
          const to = world.islands.get(t.dest || (link.a === isl.id ? link.b : link.a));
          const kit = { wood: Math.min(5, stockGet(isl, 'wood')), stone: Math.min(2, stockGet(isl, 'stone')) };
          if (!to || kit.wood < 3 || to.hasSettlers || storehouse(to)) return 'fail';
          for (const g in kit) isl.stock[g] -= kit[g];
          claimSettle(world, to); t.kit = kit;
        }
        // Note: a volunteer looks toward the fog before leaving.
        f.anim = 'gaze'; { const theirs = link.a === isl.id ? link.bi : link.ai; faceTo(f, theirs.i + 0.5, theirs.j + 0.5); }
        t.t += dt;
        if (t.t > 3) { t.phase = 'go'; t.t = 0; }
      } else if (t.phase === 'go') {
        if (!setPath(f, isl, mine.i, mine.j)) return 'fail';
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt, !!f.carry)) { if (board(world, f, link, isl.id)) { t.phase = 'cross'; awayStart(f, t); } }
      } else if (t.phase === 'cross') {
        if (!f.link) {
          const ni = world.islands.get(f.isle);
          // Note: a route is walked one link at a time; the goal acts only on the last island.
          if (t.route && t.hop < t.route.length - 1) { t.hop++; t.link = t.route[t.hop].link; t.phase = 'go'; return; }
          if (t.home) return 'done';
          if (t.then) {
            // Note: the crew builds the link from this end; the claim is released when the trip ends.
            t.phase = 'work'; t.sub = { type: 'build', phase: 'go', b: t.then, t: 0 };
            t.then.claims = (t.then.claims || 0) + 1; t.claimB = t.then;
            return;
          }
          if (t.settle) {
            f.home = -1; f.homelessT = 0;
            // Note: explore is regained only by lifting the fog of an unexplored island.
            if (!ni.explored) { world.discover(ni, f); f.needs.explore = 1; }
            if (t.kit) { for (const g in t.kit) stockAdd(ni, g, t.kit[g]); t.kit = null; }
            world.emit({ type: 'settled', isl: ni, f });
            return 'done';
          }
          t.phase = 'explore'; t.t = 0; t.path = false;
        }
      } else if (t.phase === 'work') {
        const r = runBuild(world, f, isl, dt, t.sub);
        if (r) {
          f.prop = null;
          const far = r === 'done' && t.route && t.then ? world.islands.get(t.then.a === isl.id ? t.then.b : t.then.a) : null;
          // Note: a crew that finished a link toward an unexplored island looks at it before the walk home.
          if (far && !far.explored) { t.route = [...t.route, { link: t.then, from: isl.id, to: far.id }]; t.hop = t.route.length - 1; t.link = t.then; t.then = null; t.phase = 'go'; }
          else { t.phase = 'return'; t.path2 = false; }
        }
      } else if (t.phase === 'explore') {
        const ni = world.islands.get(f.isle);
        if (!ni.reach) { world.planNow(ni); }
        if (!t.path) {
          const sp = nearestWalkable(ni, Math.floor(N / 2 + (R() - 0.5) * 8), Math.floor(N / 2 + (R() - 0.5) * 8), null, 6);
          // Note: with no walk to the heart of the island the scout looks from the landing, or the island stays unexplored for good.
          if (!sp || !setPath(f, ni, sp[0], sp[1])) { t.phase = 'look'; t.t = 6 + R() * 3; const fresh = !ni.explored; world.discover(ni, f); if (fresh) f.needs.explore = 1; return; }
          t.path = true;
        } else if (walk(world, f, ni, dt)) { t.phase = 'look'; t.t = 6 + R() * 3; const fresh = !ni.explored; world.discover(ni, f); if (fresh) f.needs.explore = 1; }
      } else if (t.phase === 'look') {
        f.anim = 'gaze'; t.t -= dt;
        f.needs.wonder = Math.min(1, f.needs.wonder + dt * 0.08);
        if (t.t <= 0) t.phase = 'return';
      } else if (t.phase === 'return') {
        const ni = world.islands.get(f.isle);
        const back = link.a === ni.id ? link.ai : link.bi;
        if (!t.path2) { if (!setPath(f, ni, back.i, back.j)) f.path = null; t.path2 = true; }
        else if (walk(world, f, ni, dt)) { if (board(world, f, link, ni.id)) t.phase = 'home'; }
      } else if (t.phase === 'home') {
        if (!f.link) {
          // Note: a route back is walked in reverse, one link per hop.
          if (t.route && t.hop > 0) { t.hop--; t.link = t.route[t.hop].link; t.phase = 'return'; t.path2 = false; return; }
          return 'done';
        }
      }
      return;
    }
    case 'herd': {
      // Note: go to the animals, gather them, walk to the anchor, cross together, wait for the stragglers, walk back.
      const pl = t.plan; const link = pl.link;
      const mine = link.a === isl.id ? link.ai : link.bi;
      const trail = () => {
        if (!t.trail) t.trail = [];
        const l = t.trail[0];
        if (!l || Math.hypot(l[0] - f.x, l[1] - f.z) > 0.4) { t.trail.unshift([f.x, f.z]); if (t.trail.length > 16) t.trail.pop(); }
      };
      if (t.phase === 'go') {
        if (!t.reserved) { if (!reserveHerd(world, f, pl)) return 'fail'; t.reserved = true; }
        const m0 = herdMembers(pl, f)[0];
        if (!m0) return 'fail';
        const sp = nearestWalkable(isl, Math.floor(m0.a.x), Math.floor(m0.a.z), null, 3);
        if (!sp || !setPath(f, isl, sp[0], sp[1])) return 'fail';
        t.phase = 'walk1';
      } else if (t.phase === 'walk1') {
        if (walk(world, f, isl, dt)) { t.phase = 'gather'; t.t = 0; }
      } else if (t.phase === 'gather') {
        f.anim = 'idle'; t.t += dt;
        const mem = herdMembers(pl, f);
        for (const m of mem) m.a.go = 'gather';
        if (!mem.length) return 'fail';
        if (t.t > 15 || mem.every((m) => Math.hypot(m.a.x - f.x, m.a.z - f.z) < 1.9)) {
          for (const m of mem) m.a.go = 'follow';
          t.phase = 'go2';
        }
      } else if (t.phase === 'go2') {
        if (!setPath(f, isl, mine.i, mine.j)) return 'fail';
        t.phase = 'walk2';
      } else if (t.phase === 'walk2') {
        trail();
        if (walk(world, f, isl, dt)) { t.phase = 'board'; t.t = 0; }
      } else if (t.phase === 'board') {
        f.anim = 'idle'; t.t += dt;
        const mem = herdMembers(pl, f);
        if (!mem.length) return 'done';
        if (t.t > 10 || mem.every((m) => Math.hypot(m.a.x - f.x, m.a.z - f.z) < 2.2)) {
          if (!world.canBoard(link, isl.id)) return;
          boardHerd(world, f, pl, link, isl.id);
          world.boardLink(f, link, isl.id);
          t.phase = 'cross';
        }
      } else if (t.phase === 'cross') {
        if (!f.link) { t.phase = 'wait'; t.t = 0; }
      } else if (t.phase === 'wait') {
        f.anim = 'idle'; t.t += dt;
        if (t.t > 40 || !pl.members.some((m) => m.a.leader === f.id && !m.a.gone)) { t.phase = 'return'; t.path2 = false; }
      } else if (t.phase === 'return') {
        const ni = world.islands.get(f.isle);
        const back = link.a === ni.id ? link.ai : link.bi;
        if (!t.path2) { if (!setPath(f, ni, back.i, back.j)) f.path = null; t.path2 = true; }
        else if (walk(world, f, ni, dt)) { if (board(world, f, link, ni.id)) t.phase = 'home'; }
      } else if (t.phase === 'home') {
        if (!f.link) return 'done';
      }
      return;
    }
    case 'tidy': case 'sit': case 'water': {
      // Note: walk to the prop slot, settle on the exact point, do the job; the need refills while it lasts.
      const b = t.b; const J = TIER_JOBS[t.jobKind];
      if (b.gone || !b.built || b.upgrading || (b.burn || 0) > 0.5 || tierOf(b) < J.min) return 'fail';
      if (t.phase === 'go') {
        const sp = jobSpot(isl, b, t.jobKind);
        t.sp = sp;
        if (!setPath(f, isl, Math.floor(sp.x), Math.floor(sp.z))) {
          const cd = spotCd.get(b) || {}; cd[t.jobKind] = world.time + 90; spotCd.set(b, cd);
          return 'fail';
        }
        t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'settle'; t.t = 0; }
      } else if (t.phase === 'settle') {
        const dx = t.sp.x - f.x; const dz = t.sp.z - f.z;
        const d = Math.hypot(dx, dz);
        const sp = FOLK_SPEED * 0.6 * dt;
        t.t += dt;
        if (d <= sp || t.t > 4) {
          // Note: the light may have changed while walking; a session that would start out of hours is skipped.
          if (J.when === 'day' ? world.night > 0.3 : world.night > 0.85) return 'done';
          f.x = t.sp.x; f.z = t.sp.z; t.phase = 'do'; t.t = J.dur * (0.85 + R() * 0.3);
          if (t.jobKind === 'C') t.seat = { x: t.sp.x, z: t.sp.z, face: t.sp.face };
        } else { f.x += dx / d * sp; f.z += dz / d * sp; f.face = Math.atan2(dx, dz); f.anim = 'walk'; }
      } else {
        const cell = cidx(clamp(Math.floor(f.x), 0, N - 1), clamp(Math.floor(f.z), 0, N - 1));
        if (isl.fire[cell] > 0 || (J.when === 'day' ? world.night > 0.3 : world.night > 0.85)) return 'done';
        f.anim = t.jobKind === 'C' ? 'sit' : t.jobKind === 'W' ? 'plant' : 'work';
        f.prop = null;
        f.face = t.jobKind === 'C' ? t.sp.face : t.sp.toWall;
        f.needs[J.need] = Math.min(1, f.needs[J.need] + dt * J.gain / J.dur);
        if (J.rest) f.needs.rest = Math.min(1, f.needs.rest + dt * J.rest / J.dur);
        t.t -= dt;
        if (t.t <= 0) { world.emit({ type: 'tierjob', isl, b, f, kind: t.jobKind }); return 'done'; }
      }
      return;
    }
    case 'pass': {
      if (t.phase === 'go') {
        const cf = builtOf(isl, 'campfire')[0];
        const lk = builtOf(isl, 'lookout')[0];
        let dst = lk ? lk.door : cf ? { i: cf.x, j: cf.y + 1 } : { i: Math.floor(f.x), j: Math.floor(f.z) };
        const sp = nearestWalkable(isl, dst.i, dst.j, null, 4);
        if (!sp || !setPath(f, isl, sp[0], sp[1])) { t.phase = 'rest'; t.t = 0; return; }
        t.spot = sp; t.phase = 'walk';
      } else if (t.phase === 'walk') {
        if (walk(world, f, isl, dt)) { t.phase = 'rest'; t.t = 0; }
      } else {
        f.anim = 'sit'; t.t += dt;
        if (t.t > 28) { world.pass(f, isl); return 'dead'; }
      }
      return;
    }
    default: return 'fail';
  }
}

// Note: tier work on a link; the builder walks to the end on its own island, pays from its own stock and hammers one step.
function runLinkAdorn(world, f, isl, dt, t) {
  const l = t.b;
  const end = linkEnd(l, isl);
  if ((l.a !== isl.id && l.b !== isl.id) || (l.tier | 0) >= linkCap(world, l)) return 'fail';
  if (t.phase === 'go') {
    const e = linkEndCell(l, end);
    if (!setPath(f, isl, e.i, e.j)) {
      const cd = adornCd.get(l) || {}; cd[isl.id] = world.time + 60; adornCd.set(l, cd);
      return 'fail';
    }
    t.phase = 'walk';
  } else if (t.phase === 'walk') {
    if (walk(world, f, isl, dt)) t.phase = 'work';
  } else {
    f.anim = 'work'; f.prop = 'hammer';
    const p = l.pts;
    const o = end ? p[p.length - 1] : p[0]; const q = end ? p[p.length - 2] : p[1];
    f.face = Math.atan2(q.x - o.x, q.z - o.z);
    const rate = f.talent.build * (stockGet(isl, 'tool') > 0 ? 1.3 : 1);
    if (!l.adPaid) {
      const cost = flourishCost(isl, l.tier | 0);
      if (!cost || !canAfford(isl, cost)) return 'fail';
      spend(isl, cost); l.adPaid = true;
    }
    l.adProgress = (l.adProgress || 0) + dt * rate / 9;
    if (R() < dt * 1.2) world.emit({ type: 'linkhammer', isl, link: l, end });
    if (l.adProgress >= 1) {
      // Note: the bench end is fixed from the rungs before the step that lifts the link to tier 3.
      l.benchEnd = linkBenchEnd(world, l);
      l.tier = (l.tier | 0) + 1; l.adProgress = 0; l.adPaid = false;
      f.talent.build = Math.min(1.6, f.talent.build + 0.005);
      world.emit({ type: 'linktier', isl, link: l, tier: l.tier, end });
      return 'done';
    }
  }
}

// Note: per-tick agent update, called by the world with fixed dt.
// Note: a homeless partner lays the bedroll on a free cell next to the partner's.
function beside(world, isl, f) {
  const m = mateOf(world, f);
  if (!m || !m.task || m.task.type !== 'sleep' || m.task.inHome || m.task.sleepCell === undefined) return null;
  const mi = Math.floor(m.x); const mj = Math.floor(m.z);
  let best = null; let bd = 1e9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = mi + di; const j = mj + dj;
    if ((!di && !dj) || !inB(i, j) || !isl.walkable(i, j) || isl.fire[cidx(i, j)] > 0 || isl.water[cidx(i, j)] > 0.1 || isl.bld[cidx(i, j)] >= 0) continue;
    if (isl.sleepers && isl.sleepers.has(cidx(i, j))) continue;
    const d = Math.hypot(i + 0.5 - f.x, j + 0.5 - f.z);
    if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
}

// Note: homeless sleepers each get their own cell near the campfire, never next to another sleeper.
function findSleepSpot(isl, f) {
  const cf = builtOf(isl, 'campfire')[0];
  const sv = storehouse(isl);
  const ctr = cf ? { i: cf.x + 0.5, j: cf.y + 0.5 } : sv ? { i: sv.door.i + 0.5, j: sv.door.j + 0.5 } : { i: f.x, j: f.z };
  let best = null; let bs = 1e9;
  const ci = Math.floor(ctr.i); const cj = Math.floor(ctr.j);
  for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
    const i = ci + di; const j = cj + dj;
    if (!inB(i, j) || !isl.walkable(i, j) || isl.fire[cidx(i, j)] > 0 || isl.water[cidx(i, j)] > 0.1) continue;
    if (isl.reach && !isl.reach[cidx(i, j)]) continue;
    const c = cidx(i, j);
    if (isl.bld[c] >= 0) continue;
    let taken = false;
    if (isl.sleepers) for (let a = -1; a <= 1 && !taken; a++) for (let b = -1; b <= 1; b++) if (inB(i + a, j + b) && isl.sleepers.has(cidx(i + a, j + b))) { taken = true; break; }
    if (taken) continue;
    const d = Math.hypot(i + 0.5 - ctr.i, j + 0.5 - ctr.j);
    if (d < 1.6) continue;
    const s = d + R() * 1.2;
    if (s < bs) { bs = s; best = [i, j]; }
  }
  return best;
}

function nearestSafe(isl, f) {
  const fi = clamp(Math.floor(f.x), 0, N - 1); const fj = clamp(Math.floor(f.z), 0, N - 1);
  for (let r = 1; r <= 5; r++) {
    let best = null; let bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = fi + di; const j = fj + dj;
      if (!inB(i, j) || !isl.walkable(i, j) || isl.fire[cidx(i, j)] > 0) continue;
      const d = Math.hypot(di, dj);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best) return best;
  }
  return null;
}

// Note: free ring cell around a campfire; sides before diagonals, none taken by another social folk, each reachable.
const RING = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function ringSeat(world, isl, f, cf) {
  const taken = new Set();
  for (const o of world.folkOn(isl.id)) if (o !== f && o.task && o.task.type === 'social' && o.task.ring !== undefined) taken.add(o.task.ring);
  for (const tier of [RING.slice(0, 4), RING.slice(4)]) {
    const free = [];
    for (const [di, dj] of tier) {
      const i = cf.x + di; const j = cf.y + dj;
      if (!inB(i, j) || !isl.walkable(i, j) || isl.fire[cidx(i, j)] > 0 || taken.has(cidx(i, j)) || (isl.reach && !isl.reach[cidx(i, j)])) continue;
      free.push([i, j]);
    }
    if (free.length) return free[Math.floor(R() * free.length)];
  }
  return null;
}

// Note: visitors are figures outside the settlement: no needs, no age, no home, never saved.
const VISIT = {
  merchant: { stay: 3, max: 50 }, frigate: { stay: 3, max: 50 },
  wanderer: { stay: 8, max: 90 }, pilgrim: { stay: 8, max: 90 },
};
const near = (isl, p, r = 4) => nearestWalkable(isl, p.i, p.j, null, r) || [p.i, p.j];

// Note: opts.from is the arrival cell, opts.ship the hull id for dock visitors; returns the figure or null.
export function spawnVisitor(world, isl, kind, opts = {}) {
  const def = VISIT[kind];
  if (!def || !opts.from || world.folk.filter((o) => o.visitor).length >= 4) return null;
  const sp = near(isl, opts.from);
  const f = createFolk(world, isl, sp[0], sp[1], 4000);
  f.passAt = 1e12; f.stage = 'adult'; f.partner = null;
  const sv = storehouse(isl);
  let goal = null;
  if (kind === 'pilgrim') {
    const spots = [...(isl.memorials || []).map((m) => ({ i: m.i, j: m.j })), ...deedMemorials(world, isl.id).map((d) => ({ i: d.x, j: d.z }))];
    const kr = knowRelic(isl);
    if (kr && !kr.taken) spots.push({ i: kr.i, j: kr.j });
    if (spots.length) goal = spots[hash2(world.seed, f.id, 17) % spots.length];
  }
  if (!goal && sv && (kind !== 'merchant' && kind !== 'frigate' || Math.hypot(sv.door.i - opts.from.i, sv.door.j - opts.from.j) <= 14)) goal = sv.door;
  const g = near(isl, goal || opts.from, 3);
  f.visitor = { kind, phase: 'go', pathed: false, goal: { i: g[0], j: g[1] }, exit: { i: sp[0], j: sp[1] }, stay: def.stay, t: 0, age: 0, max: def.max, ship: opts.ship ?? null, did: false };
  world.folk.push(f);
  world.emit({ type: 'vfolk', phase: 'arrive', kind, isl, f });
  return f;
}

function removeVisitor(world, f, isl) {
  const k = world.folk.indexOf(f);
  if (k >= 0) world.folk.splice(k, 1);
  world.emit({ type: 'vfolk', phase: 'leave', kind: f.visitor.kind, isl, f });
}

function updateVisitor(world, f, dt) {
  const v = f.visitor;
  const isl = world.islands.get(f.isle);
  if (!isl) { const k = world.folk.indexOf(f); if (k >= 0) world.folk.splice(k, 1); return; }
  f.animT += dt; v.age += dt;
  // Note: a dock visitor goes with its hull; the hard limit frees a stuck figure.
  const hull = v.ship === null || world.ships.some((s) => s.id === v.ship && s.state === 'unload' && s.from === isl.id);
  if (v.age > v.max || (!hull && v.age > 1)) { removeVisitor(world, f, isl); return; }
  if (v.phase === 'go' || v.phase === 'back') {
    const to = v.phase === 'go' ? v.goal : v.exit;
    if (!v.pathed) {
      v.pathed = true;
      if (!setPath(f, isl, to.i, to.j)) { if (v.phase === 'go') { v.phase = 'back'; v.pathed = false; } else removeVisitor(world, f, isl); return; }
    }
    if (f.abort) { f.abort = false; removeVisitor(world, f, isl); return; }
    if (walk(world, f, isl, dt)) {
      v.pathed = false;
      if (v.phase === 'go') { v.phase = 'stay'; v.t = v.stay; } else removeVisitor(world, f, isl);
    }
  } else {
    f.anim = v.kind === 'pilgrim' ? 'gaze' : 'idle';
    if (!v.did) {
      v.did = true;
      if (v.kind === 'wanderer') {
        const left = KNOWLEDGE_IDS.filter((k) => !world.known.has(k) && !KNOWLEDGE[k].start && !KNOWLEDGE[k].fixed);
        if (left.length) world.learn(isl, left[hash2(world.seed, f.id, 41) % left.length], 'wanderer');
      } else if (v.kind === 'pilgrim') world.emit({ type: 'song', isl, f, i: v.goal.i, j: v.goal.j });
    }
    v.t -= dt;
    if (v.t <= 0) { v.phase = 'back'; v.pathed = false; }
  }
}

export function updateFolk(world, f, dt) {
  if (f.visitor) { updateVisitor(world, f, dt); return; }
  // Note: folk aboard a colony hull are frozen: no age, no needs, no task.
  if (f.aboard) return;
  f.age += dt;
  f.animT += dt;
  const ns = f.stage;
  stageOf(f);
  if (ns !== f.stage) {
    world.emit({ type: 'aged', f });
    // Note: a grown child leaves the parents' hut when an adult still lives there; an orphan keeps it.
    if (ns === 'child' && f.home >= 0 && world.folk.some((o) => o !== f && o.stage !== 'child' && o.isle === f.isle && o.home === f.home)) { f.moveOut = f.home; f.home = -1; }
  }
  const sleeping = f.anim === 'sleep';
  const winter = world.seasonK ? world.seasonK[3] : 0;
  for (const k of NEEDS) {
    let d = NEED_DECAY[k] * dt;
    if (sleeping && k !== 'rest') d *= 0.3;
    // Note: winter hunger comes slower and never drops below a floor.
    if (k === 'food') d *= 1 - (1 - SEASON_WINTER_DECAY) * winter;
    f.needs[k] = clamp(f.needs[k] - d, 0, 1);
  }
  if (winter > 0.02) f.needs.food = Math.max(f.needs.food, SEASON_WINTER_FOOD * winter);
  // Note: shelter erodes only when homeless; a bed keeps it high.
  const isl = world.islands.get(f.isle);
  // Note: productive work eases industry; home, family and the fire ease belonging; wandering away lets it fall.
  if (f.task && WORK_TYPES.has(f.task.type)) f.needs.industry = Math.min(1, f.needs.industry + dt * 0.05);
  {
    const hb2 = f.home >= 0 && isl ? isl.buildings[f.home] : null;
    let gain = 0;
    if (hb2 && hb2.door && Math.hypot(hb2.door.i + 0.5 - f.x, hb2.door.j + 0.5 - f.z) < 4) gain += 0.03;
    const mt = mateOf(world, f);
    if (mt && Math.hypot(mt.x - f.x, mt.z - f.z) < 3) gain += 0.02;
    if (f.task && f.task.type === 'social') gain += 0.02;
    if (gain) f.needs.belonging = Math.min(1, f.needs.belonging + dt * gain);
  }
  if (f.link) {
    f.anim = f.carry ? 'carry' : 'walk';
    world.moveOnLink(f, dt);
    return;
  }
  // Note: back home, a traveller takes its bed again when the hut still stands.
  if (f.crew && f.crew.home === f.isle) {
    const hb = f.crew.idx >= 0 ? isl.buildings[f.crew.idx] : null;
    f.home = hb && !hb.gone && hb.built && hb.id === 'hut' ? f.crew.idx : -1;
    f.crew = null;
  }
  // Note: a festival guest or a traveller of another island keeps its own bed index and shelter while it is away.
  const guestAway = !!(f.guestOf && f.guestOf.home !== f.isle) || !!(f.crew && f.crew.home !== f.isle);
  if (f.home >= 0 && !guestAway) {
    const hb = isl.buildings[f.home];
    if (!hb || hb.gone || !hb.built) f.home = -1;
  }
  if (f.home < 0 && f.stage !== 'child' && !guestAway) {
    // Note: partners prefer to share a hut.
    const pf = f.partner !== null && f.partner !== undefined ? world.folk.find((o) => o.id === f.partner) : null;
    if (pf && pf.isle === f.isle && pf.home >= 0) {
      const hb = isl.buildings[pf.home];
      if (hb && !hb.gone && hb.built && world.folkOn(isl.id).filter((o) => o.home === pf.home).length < BUILDINGS.hut.beds + (hb.level || 0)) f.home = pf.home;
    }
  }
  if (f.home < 0 && f.stage !== 'child' && !guestAway) {
    for (let k = 0; k < isl.buildings.length; k++) {
      const hb = isl.buildings[k];
      if (!hb || hb.gone || hb.id !== 'hut' || !hb.built) continue;
      if (k === f.moveOut && f.age < AGE.child + 180) continue;
      const cap = BUILDINGS.hut.beds + (hb.level || 0);
      const occ = world.folkOn(isl.id).filter((o) => o.home === k).length;
      if (occ < cap) { f.home = k; break; }
    }
  }
  if (!guestAway) {
    f.homelessT = f.home < 0 && f.stage === 'adult' ? (f.homelessT || 0) + (world.pauseHomeless ? 0 : dt) : 0;
    if (f.home >= 0) f.needs.shelter = Math.min(1, f.needs.shelter + dt * 0.004);
    else f.needs.shelter = Math.max(0, f.needs.shelter - dt * 0.0005);
  }
  // Note: a folk walking past a T4 building at night enjoys its string lights.
  if (f.anim === 'walk' && world.night > 0.5) {
    for (const b of isl.buildings) {
      if (b && b.built && !b.gone && (b.flourish | 0) >= 4 && FLOURISH_IDS.has(b.id) && Math.hypot(b.x + b.size / 2 - f.x, b.y + b.size / 2 - f.z) < b.size / 2 + 2.2) { f.needs.wonder = Math.min(1, f.needs.wonder + dt * 0.01); break; }
    }
  }
  f.mood = (f.needs.food + f.needs.shelter + f.needs.rest + f.needs.company + f.needs.wonder + f.needs.explore + f.needs.industry + f.needs.belonging) / 8;
  if (isl.fire[cidx(clamp(Math.floor(f.x), 0, N - 1), clamp(Math.floor(f.z), 0, N - 1))] > 0 && f.anim !== 'sleep') {
    // Note: standing in flames; step to the nearest safe cell, task waits.
    const sp = nearestSafe(isl, f);
    if (sp) {
      const dx = sp[0] + 0.5 - f.x; const dz = sp[1] + 0.5 - f.z; const d = Math.hypot(dx, dz) || 1;
      const s = Math.min(d, FOLK_SPEED * 1.5 * dt);
      f.x += dx / d * s; f.z += dz / d * s; f.face = Math.atan2(dx, dz); f.anim = 'walk';
      return;
    }
  }
  if (f.task) {
    const r = runTask(world, f, isl, dt);
    if (f.abort) { f.abort = false; if (f.carry) giveCarryBack(f, isl); endTask(world, f, isl); return; }
    if (r === 'dead') return;
    if (r === 'done' || r === 'fail') {
      if (r === 'fail' && f.carry) giveCarryBack(f, isl);
      // Note: a failed action sits out for 20 s, or the highest score would pick it again at once.
      if (r === 'fail') (f.failed || (f.failed = {}))[f.task.type + (f.task.order || '')] = world.time + 20;
      endTask(world, f, isl);
    }
  } else {
    f.idleT -= dt;
    f.anim = 'idle';
    if (f.idleT <= 0 && isl.reach && !isl.reach[cidx(clamp(Math.floor(f.x), 0, N - 1), clamp(Math.floor(f.z), 0, N - 1))] && isl.reach.some((v) => v)) {
      // Note: boxed in (e.g. by digging); hop to the nearest cell connected to home.
      const sp = nearestWalkable(isl, Math.floor(f.x), Math.floor(f.z), isl.reach, 8);
      if (sp) { f.x = sp[0] + 0.5; f.z = sp[1] + 0.5; }
    }
    if (f.idleT <= 0) {
      const t = chooseTask(world, f, isl);
      startTask(world, f, isl, t);
    }
  }
}
