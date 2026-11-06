// Note: the capital is the council hall on the home island; its tier gates exploration and logistics orders, and its planner posts them.
// Warning: imports links.js and econ.js while econ.js imports this file; everything is read at call time only, never at module load.

import { LINKS, BED_PER_ISLAND_MAX, PLANT_KINDS } from './config.js';
import { generateIsland } from './island.js';
import { rareSlots, relicPlan, slotAt, rareTerrain, knowRelic, relicFor, goalDistLink, LINK_MAX_RING } from './rareisles.js';
import { reachMap } from './path.js';
import { computeAnchors, makeLink, startLink, vineSupport, craftFor, maxSpan } from './links.js';
import { storehouse, stockGet, canAfford, spend, missing, GOAL_P } from './econ.js';

export const HOME_ID = '0,0';
export const COUNCIL_MAX = 5;
// Note: island score the home island needs for tier k + 1 (same numbers as RUNG_SCORE in art.js).
export const COUNCIL_SCORE = [0, 14, 26, 36, 48];
// Note: lowest council tier that allows each order.
export const ORDER_TIER = { link: 1, scout: 1, settle: 2, colony: 3, cargo: 4, rare: 4 };

const clampTier = (n) => Math.max(0, Math.min(COUNCIL_MAX, n | 0));

export const homeIsland = (world) => world.islands.get(HOME_ID) || null;

// Note: the live council of the home island, built or not; a built one wins.
export function councilBuilding(world) {
  const isl = homeIsland(world);
  if (!isl) return null;
  let found = null;
  for (const b of isl.buildings) {
    if (!b || b.gone || b.id !== 'council') continue;
    if (b.built) return b;
    if (!found) found = b;
  }
  return found;
}

// Note: 0 without a built council, else min(flourish + 1, home rung) as a ratchet kept on the building; a rebuilt council inherits it from the ruins. world.tierForce is a minimum for test fixtures.
export function councilTier(world) {
  const forced = clampTier(world.tierForce);
  const isl = homeIsland(world);
  const b = councilBuilding(world);
  if (!isl || !b || !b.built) return forced;
  const cap = Math.max(1, Math.min(COUNCIL_MAX, isl.rung | 0));
  const now = Math.min(clampTier((b.flourish | 0) + 1), cap);
  let best = now;
  // Note: ruins count too; the flourish survives a collapse, the stored ratchet may never have been written.
  for (const o of isl.buildings) if (o && o.id === 'council') best = Math.max(best, o.tierMax | 0, Math.min(clampTier((o.flourish | 0) + 1), cap));
  b.tierMax = best;
  return Math.max(best, forced);
}

// Note: the tier the council should be raised to for the home rung (rung 1 -> T1 ... rung 5 -> T5), 0 without a home island.
export function councilTarget(world) {
  const isl = homeIsland(world);
  return isl ? Math.max(1, Math.min(COUNCIL_MAX, isl.rung | 0)) : 0;
}

// Note: the flourish a builder raises the council to; flourish = tier - 1.
export const councilFlourishTarget = (world) => Math.max(0, councilTarget(world) - 1);

// Note: order is 'link' | 'scout' (T1), 'settle' (T2), 'colony' (T3), 'cargo' and 'rare' (T4); no tier means no order.
export function tierAllows(world, order) {
  const need = ORDER_TIER[order];
  return need !== undefined && councilTier(world) >= need;
}

// Note: expedition rules: one in `cap` away at most, `keep` adults stay, larder per head, `settleShare` of the beds makes a source, seats per scout and party.
export const EXPEDITION = { cap: 4, keep: 2, larder: 1.2, settleShare: 0.4, scout: 1, party: 2 };
const SETTLE_CLAIM = 240;
const MAX_BUILDING = 2;
const BUDGET = 40;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ringOf = (gx, gz) => Math.max(Math.abs(gx), Math.abs(gz));
const idOf = (gx, gz) => `${gx},${gz}`;
const coords = (id) => id.split(',').map(Number);

const crossOf = (o) => (o.task && o.task.type === 'cross' ? o.task : null) || (o.queue && o.queue.type === 'cross' ? o.queue : null);

// Note: a folk of another island passing through or working here is no resident.
export function isVisitor(o, id) {
  if (o.crew && o.crew.home !== id) return true;
  const q = crossOf(o);
  return !!q && q.fromIsle !== undefined && q.fromIsle !== id;
}

// Note: the folk that live on the island; explorers and crews from elsewhere do not count.
export const residentsOf = (world, id) => world.folkOn(id).filter((o) => !isVisitor(o, id));

// Note: hops over done links from one island to another as [{ link, from, to }], breadth first with id-sorted neighbours; null when none.
export function routeOver(world, from, to) {
  if (from === to) return [];
  const adj = new Map();
  for (const l of world.links) {
    if (l.state !== 'done') continue;
    if (!adj.has(l.a)) adj.set(l.a, []);
    if (!adj.has(l.b)) adj.set(l.b, []);
    adj.get(l.a).push({ link: l, from: l.a, to: l.b });
    adj.get(l.b).push({ link: l, from: l.b, to: l.a });
  }
  for (const list of adj.values()) list.sort((p, q) => (p.to < q.to ? -1 : p.to > q.to ? 1 : 0));
  const prev = new Map([[from, null]]);
  const queue = [from];
  for (let h = 0; h < queue.length; h++) {
    const id = queue[h];
    if (id === to) break;
    for (const e of adj.get(id) || []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, e);
      queue.push(e.to);
    }
  }
  if (!prev.has(to)) return null;
  const out = [];
  for (let e = prev.get(to); e; e = prev.get(e.from)) out.push(e);
  return out.reverse();
}

// Note: islands reachable from home over done links, id -> hops.
function componentOf(world) {
  const comp = new Map([[HOME_ID, 0]]);
  const queue = [HOME_ID];
  for (let h = 0; h < queue.length; h++) {
    const id = queue[h];
    const next = [];
    for (const l of world.links) {
      if (l.state !== 'done') continue;
      if (l.a === id && !comp.has(l.b)) next.push(l.b);
      else if (l.b === id && !comp.has(l.a)) next.push(l.a);
    }
    next.sort();
    for (const n of next) if (!comp.has(n)) { comp.set(n, comp.get(id) + 1); queue.push(n); }
  }
  return comp;
}

const newCap = () => ({ gaps: new Map(), priv: new Map(), units: 0, wi: 0, warm: false, exp: [], settle: [], crew: [], diag: null, pot: null, need: null });

// Note: reads an island for planning; far ones are generated into a private cache so world.islands stays untouched.
function islandAt(world, cap, gx, gz) {
  const id = idOf(gx, gz);
  let isl = world.islands.get(id) || cap.priv.get(id);
  if (isl) return isl;
  if (cap.units + 4 > BUDGET) return null;
  cap.units += 4;
  const trait = slotAt(world.seed, gx, gz);
  isl = generateIsland(world.seed, gx, gz, trait ? null : relicPlan(world.seed)[id] || null);
  if (trait) rareTerrain(isl, trait);
  cap.priv.set(id, isl);
  return isl;
}

// Note: warming order of the link gaps: every directed 4-neighbour pair inside the link rings, nearest to home first.
// Note: anchors on a source island are picked from the cells walkable from where a crew lands there.
function makeLinkFrom(world, X, Y) {
  let en = null;
  for (const l of world.links) {
    if (l.state !== 'done') continue;
    if (l.b === X.id) { en = l.bi; break; }
    if (l.a === X.id) { en = l.ai; break; }
  }
  if (!en || X.id === HOME_ID) return makeLink(world, X, Y);
  const prev = X.reach;
  X.reach = reachMap(X, en.i, en.j);
  const link = makeLink(world, X, Y);
  X.reach = prev;
  return link;
}

let warmList = null;
function warmOrder() {
  if (warmList) return warmList;
  const out = [];
  const M = LINK_MAX_RING;
  for (let gz = -M; gz <= M; gz++) for (let gx = -M; gx <= M; gx++) {
    DIRS.forEach(([dx, dz], d) => {
      if (ringOf(gx + dx, gz + dz) > M) return;
      out.push({ k: Math.max(ringOf(gx, gz), ringOf(gx + dx, gz + dz)), gx, gz, d, ux: gx, uz: gz, vx: gx + dx, vz: gz + dz });
    });
  }
  out.sort((p, q) => p.k - q.k || p.gz - q.gz || p.gx - q.gx || p.d - q.d);
  warmList = out;
  return out;
}

// Note: computes the anchor gap of one directed pair into the cache while the tick budget lasts; false when it ran out.
function warmEdge(world, cap, e) {
  const key = `${e.ux},${e.uz}>${e.vx},${e.vz}`;
  if (cap.gaps.has(key)) return true;
  const A = islandAt(world, cap, e.ux, e.uz);
  const B = A && islandAt(world, cap, e.vx, e.vz);
  if (!B || cap.units + 1 > BUDGET) return false;
  cap.units += 1;
  const an = computeAnchors(A, B);
  cap.gaps.set(key, an ? an.gap : 1e9);
  return true;
}

function warm(world, cap) {
  if (cap.warm) return;
  const list = warmOrder();
  while (cap.wi < list.length) {
    if (!warmEdge(world, cap, list[cap.wi])) return;
    cap.wi++;
  }
  cap.warm = true;
}

// Note: cost of the link U -> V for the route search: 0 when done, a little when building, else by gap; null when no known craft spans it or the gap is not computed yet.
function edgeCost(world, cap, ux, uz, vx, vz, span) {
  const l = world.linkBetween(idOf(ux, uz), idOf(vx, vz));
  if (l && l.state === 'done') return 0;
  if (l && l.state === 'building') return 0.5;
  const g = cap.gaps.get(`${ux},${uz}>${vx},${vz}`);
  return g !== undefined && g <= span ? 1 + g / 50 : null;
}

// Note: cheapest remaining link cost from every cell to the goal cells, over links no longer than span; ties by id.
function potentialOf(world, cap, goals, span) {
  const dist = new Map(goals.map((id) => [id, 0]));
  const done = new Set();
  for (;;) {
    let bu = null; let bd = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && (d < bd || (d === bd && id < bu))) { bd = d; bu = id; }
    if (bu === null) break;
    done.add(bu);
    const [vx, vz] = coords(bu);
    for (const [dx, dz] of DIRS) {
      const ux = vx + dx; const uz = vz + dz;
      if (ringOf(ux, uz) > LINK_MAX_RING) continue;
      const uid = idOf(ux, uz);
      if (done.has(uid)) continue;
      const c = edgeCost(world, cap, ux, uz, vx, vz, span);
      if (c === null) continue;
      if (bd + c < (dist.has(uid) ? dist.get(uid) : Infinity)) dist.set(uid, bd + c);
    }
  }
  return dist;
}

// Note: the techs the chain still lacks, most urgent first; a known tech whose craft is still locked names the craft's missing tool tech.
function missingNeeds(world) {
  const k = world.known; const u = world.unlocked;
  const out = [];
  if (!k.has('ballooning')) out.push('ballooning');
  // Note: navigation comes before the loom tech; weaving only helps when the rope span cannot reach the navigation relic.
  if (!k.has('navigation')) out.push('navigation');
  if (k.has('ballooning') && !u.has('balloon') && !k.has('weaving')) out.push('weaving');
  if (!k.has('pulleys')) out.push('pulleys');
  else if (!u.has('cablecar')) for (const p of ['masonry', 'smelting', 'smithing']) if (!k.has(p)) out.push(p);
  return out;
}

// Note: a craft the chain knows but cannot build yet waits for one good nobody has made; home works toward it ahead of the next link.
function prepGoods(world) {
  const k = world.known; const u = world.unlocked;
  if (k.has('ballooning') && k.has('weaving') && !u.has('balloon')) return { cloth: 3 };
  if (k.has('pulleys') && k.has('smithing') && !u.has('cablecar')) return { gear: 3 };
  return null;
}

// Note: ids of the islands in link range that still hold the relic of a tech, from the world and the planner cache.
function relicIslands(world, cap, know) {
  const out = [];
  for (const m of [world.islands, cap.priv]) for (const [id, isl] of m) {
    const [gx, gz] = coords(id);
    if (ringOf(gx, gz) > LINK_MAX_RING || out.includes(id)) continue;
    const r = knowRelic(isl);
    if (r && r.know === know && !r.taken) out.push(id);
  }
  return out.sort();
}

// Note: the rare islands and the Spire inside the link rings.
function endgameIslands(world) {
  const out = [];
  const s = rareSlots(world.seed);
  for (const t in s) for (const e of s[t]) if (e.ring <= LINK_MAX_RING) out.push(idOf(e.gx, e.gz));
  return out.sort();
}

const adultsIn = (list) => list.filter((o) => o.stage === 'adult').length;

// Note: the settle claim of an empty island lapses after SETTLE_CLAIM seconds, or at once when someone lives there; colony claims carry no deadline and stay.
function releaseClaims(world) {
  for (const isl of world.islands.values()) {
    if (isl.settleUntil === undefined) continue;
    if (world.folkOn(isl.id).length) { isl.hasSettlers = false; isl.settleUntil = undefined; continue; }
    if (world.time < isl.settleUntil || world.inboundTo(isl.id)) continue;
    if (world.folk.some((o) => { const q = crossOf(o); return q && q.settle && q.dest === isl.id; })) continue;
    isl.hasSettlers = false; isl.settleUntil = undefined;
  }
}
export const claimSettle = (world, isl) => { isl.hasSettlers = true; isl.settleUntil = world.time + SETTLE_CLAIM; };

const doubled = (cost) => { const o = {}; for (const g in cost) o[g] = cost[g] * 2; return o; };

// Note: picks the link to grow next and pays it from the home stock; sets the cues the planner of wants and the gaze read.
function planLinkGoal(world, cap, comp, home) {
  const span = maxSpan(world);
  const needs = missingNeeds(world);
  world.skillNeed = needs[0] || null;
  // Note: the first lacking tech whose relic island is still outside the chain and reachable with the crafts at hand sets the goal.
  let pot = null; let need = null;
  const tries = needs.map((n) => [n, relicIslands(world, cap, n)]);
  tries.push([null, endgameIslands(world)]);
  for (const [n, ids] of tries) {
    const goals = ids.filter((id) => !comp.has(id));
    if (!goals.length) continue;
    const p = potentialOf(world, cap, goals, span);
    let ok = false;
    for (const id of comp.keys()) if (p.has(id)) { ok = true; break; }
    if (ok) { pot = p; need = n; break; }
  }
  cap.pot = pot; cap.need = need;
  const prep = prepGoods(world);
  if (prep) {
    home.linkGoal = { cost: prep, pressure: GOAL_P.prep };
    home.linkWant = {};
    const m = missing(home, prep);
    for (const g in m) home.linkWant[g] = stockGet(home, g) + m[g];
    // Note: while the navigation relic lies beyond the rope span, home makes the cloth first and starts no other link.
    if (prep.cloth && !world.known.has('navigation') && need !== 'navigation') { cap.diag = { goal: null, why: 'prep', need }; return; }
  }
  const cands = [];
  let building = 0;
  for (const l of world.links) if (l.state === 'building' && l.type !== 'vine') building++;
  const sources = [...comp.keys()].map((id) => world.islands.get(id)).filter((i) => i && (i.revealed ? i.reach : i.id !== HOME_ID)).sort((p, q) => comp.get(p.id) - comp.get(q.id) || (p.id < q.id ? -1 : 1));
  for (const X of sources) {
    for (const [dx, dz] of DIRS) {
      const gx = X.gx + dx; const gz = X.gz + dz;
      if (ringOf(gx, gz) > LINK_MAX_RING) continue;
      const Y = world.getIsland(gx, gz);
      if (comp.has(Y.id)) continue;
      let link = world.linkBetween(X.id, Y.id);
      if (link && link.state !== 'none') continue;
      if (!link || link.a !== X.id) link = makeLinkFrom(world, X, Y);
      if (!link) continue;
      const toward = goalDistLink(world.seed, Y.gx, Y.gz) < goalDistLink(world.seed, X.gx, X.gz);
      const py = pot ? pot.get(Y.id) : undefined;
      const key = py !== undefined ? 1 + link.gap / 50 + py : 1000 + goalDistLink(world.seed, Y.gx, Y.gz) * 3 + link.gap * 0.2 - (world.skillNeed && relicFor(Y, world.skillNeed) ? 9 : 0);
      // Note: a link is on the way when it starts an optimal route from its source; the rest are side branches.
      const px = pot ? pot.get(X.id) : undefined;
      cands.push({ X, Y, link, key, on: py !== undefined, way: py !== undefined && px !== undefined && key <= px + 0.15, toward, hops: comp.get(X.id) });
    }
  }
  cands.sort((p, q) => p.key - q.key || p.hops - q.hops || p.link.gap - q.link.gap || (p.X.id < q.X.id ? -1 : p.X.id > q.X.id ? 1 : 0) || (p.Y.id < q.Y.id ? -1 : 1));
  cap.diag = { goal: null, why: cands.length ? 'skill' : 'nosrc', need };
  for (const c of cands) {
    const { X, Y, link } = c;
    // Note: folk plant vines near this anchor; the player's cue is dry soil there.
    if (link.gap <= LINKS.vine.gap && !X.vineSpot && X.revealed) X.vineSpot = { i: link.ai.i, j: link.ai.j };
    // Note: living vine bridge: player prepares vines near the anchor, nobody carries goods.
    if (link.gap <= LINKS.vine.gap && vineSupport(X, link) >= 3) {
      startLink(world, X, Y, link, 'vine');
      cap.diag = { goal: link.id, why: 'vine', need };
      return;
    }
    const type = craftFor(world, link.gap);
    if (!type) {
      if (!X.gap) X.gap = { why: 'skill', at: { i: link.ai.i, j: link.ai.j } };
      continue;
    }
    if (building >= MAX_BUILDING) { cap.diag = { goal: link.id, why: 'cap', need }; return; }
    const cost = LINKS[type].cost;
    // Note: the link toward a goal outranks other building; the first pad outranks the link.
    const gp = c.on || c.toward ? GOAL_P.linkToward : GOAL_P.link;
    // Note: a side branch waits until the stock would pay twice, so the goods are there when the way ahead opens.
    if (pot && !c.way && !canAfford(home, doubled(cost), gp)) continue;
    if (canAfford(home, cost, gp)) {
      spend(home, cost);
      startLink(world, X, Y, link, type);
      cap.diag = { goal: link.id, why: 'start', need };
      return;
    }
    let at = { i: link.ai.i, j: link.ai.j };
    if (X.id !== home.id) {
      const r = routeOver(world, home.id, X.id);
      if (r && r.length) at = r[0].link.a === home.id ? r[0].link.ai : r[0].link.bi;
    }
    home.gap = { why: 'goods', at: { i: at.i, j: at.j } };
    if (!prep) {
      home.linkGoal = { cost, pressure: gp };
      home.linkWant = {};
      const m = missing(home, cost);
      for (const g in m) home.linkWant[g] = stockGet(home, g) + m[g];
    }
    cap.diag = { goal: link.id, why: 'goods', need };
    return;
  }
  // Note: the way ahead lies behind a fogged island or a craft not known yet; home still gathers for the next link.
  if (pot && !prep && !home.linkGoal) {
    const type = craftFor(world, span);
    const cost = type ? LINKS[type].cost : null;
    if (cost && !canAfford(home, cost, GOAL_P.linkToward)) {
      home.linkGoal = { cost, pressure: GOAL_P.linkToward };
      home.linkWant = {};
      const m = missing(home, cost);
      for (const g in m) home.linkWant[g] = stockGet(home, g) + m[g];
    }
  }
}

// Note: an island without a hand to build gets a crew from home for each of its building links.
function planCrews(world, cap, comp, home) {
  for (const l of world.links) {
    if (l.state !== 'building' || l.type === 'vine' || l.a === home.id || !comp.has(l.a)) continue;
    const X = world.islands.get(l.a);
    if (!X || residentsOf(world, X.id).some((o) => o.stage !== 'child')) continue;
    cap.crew.push({ key: `crew:${l.id}`, link: l.id, src: home.id, to: X.id });
  }
}

// Note: unexplored islands behind done links get one scout seat from the nearest island with a party to spare.
function planScouts(world, cap, comp) {
  const ids = [...comp.keys()].sort();
  for (const id of ids) {
    const Y = world.islands.get(id);
    if (!Y || id === HOME_ID || (Y.revealed && Y.explored)) continue;
    const src = nearestSource(world, comp, id, 4, 3);
    // Note: a fogged island on the way to the goal blocks every link beyond it, so its scout counts most.
    const urgent = Y.revealed ? 0 : cap.pot && cap.pot.has(id) ? 2 : 1;
    if (src) cap.exp.push({ key: `exp:${id}`, src, to: id, urgent });
  }
}

// Note: the closest island of the chain, by hops, with enough residents and adults; ties by id.
function nearestSource(world, comp, from, minPop, minAdults) {
  const seen = new Map([[from, 0]]);
  const queue = [from];
  let best = null;
  for (let h = 0; h < queue.length; h++) {
    const id = queue[h];
    if (id !== from) {
      const res = residentsOf(world, id);
      if (res.length >= minPop && adultsIn(res) >= minAdults && (!best || seen.get(id) < best.d || (seen.get(id) === best.d && id < best.id))) best = { id, d: seen.get(id) };
    }
    if (best && seen.get(id) >= best.d) continue;
    const next = [];
    for (const l of world.links) {
      if (l.state !== 'done') continue;
      if (l.a === id && !seen.has(l.b)) next.push(l.b);
      else if (l.b === id && !seen.has(l.a)) next.push(l.a);
    }
    next.sort();
    for (const n of next) if (!seen.has(n)) { seen.set(n, seen.get(id) + 1); queue.push(n); }
  }
  return best ? best.id : null;
}

// Note: fruit trees, bushes and wheat on the island, ripe or not.
const SETTLE_FOOD = 6;
function foodPlants(isl) {
  let n = 0;
  for (let c = 0; c < isl.plant.length; c++) { const k = PLANT_KINDS[isl.plant[c]]; if (k === 'fruittree' || k === 'bush' || k === 'wheat') n++; }
  return n;
}

// Note: empty common islands behind done links, best toward the goal first, get a party from the nearest island with enough folk.
function planSettlers(world, cap, comp) {
  const need = Math.ceil(EXPEDITION.settleShare * BED_PER_ISLAND_MAX);
  const list = [];
  for (const id of [...comp.keys()].sort()) {
    const Y = world.islands.get(id);
    if (!Y || id === HOME_ID || Y.rare || Y.rareSlot || Y.special || Y.dormant || Y.hasSettlers || storehouse(Y)) continue;
    if (world.folkOn(id).length || world.inboundTo(id)) continue;
    // Note: settlers go only where enough grows to eat; a bare island would starve them.
    if (foodPlants(Y) < SETTLE_FOOD) continue;
    const py = cap.pot ? cap.pot.get(id) : undefined;
    list.push({ id, key: py !== undefined ? py : 100 + goalDistLink(world.seed, Y.gx, Y.gz) - (world.skillNeed && relicFor(Y, world.skillNeed) ? 9 : 0) });
  }
  list.sort((p, q) => p.key - q.key || (p.id < q.id ? -1 : 1));
  for (const t of list.slice(0, 2)) {
    const src = nearestSource(world, comp, t.id, need, 0);
    if (src) cap.settle.push({ key: `set:${t.id}`, src, to: t.id });
  }
}

// Note: the capital's planner; runs every world tick after the islands, posts links, scouts, settlers and crews as plain data that the boards turn into orders.
export function planCapital(world) {
  const cap = world.cap || (world.cap = newCap());
  cap.units = 0;
  for (const isl of world.islands.values()) { isl.linkWant = null; isl.linkGoal = null; isl.vineSpot = null; isl.gap = null; }
  cap.exp = []; cap.settle = []; cap.crew = []; cap.diag = null;
  releaseClaims(world);
  const home = homeIsland(world);
  if (!home || !home.revealed || !tierAllows(world, 'link')) return;
  warm(world, cap);
  const comp = componentOf(world);
  planLinkGoal(world, cap, comp, home);
  planCrews(world, cap, comp, home);
  if (tierAllows(world, 'scout')) planScouts(world, cap, comp);
  if (tierAllows(world, 'settle')) planSettlers(world, cap, comp);
}
