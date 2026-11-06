// Note: the capital's fleet ledger: every 10 s of world time it reads the dock islands' wants and surplus and hands trips to idle hulls.
// Note: planFleet is the one entry point for worldTick: landing party, colony flight, then the ledger tick; sim only, nothing here is saved.
// Note: orders live on the hulls (s.order); the ledger itself is rebuilt from stock, wants and ships at each tick.

import { tierAllows } from './capital.js';
import { gwRareNeeds, gwNeeds } from './greatwork.js';
import { hash2, hashStr } from './rand.js';
import { SHIP, maxCargo, RARE_GOODS, dockIslands, slotsFree, legTime, isSpire } from './ships.js';
import { planColony, planParty } from './colony.js';
import { isDormant } from './rareisles.js';

// Note: prio ranks the cargo: a rare good for the Great Work, then its foundation goods, then island projects, then plain wants.
export const LEDGER = { period: 10, goodCap: 6, floorStock: 2, prio: { support: 8, hunger: 6, rare: 4, gw: 3, project: 2, plain: 1 }, staleAfter: 300 };

// Note: an island with no fruit or fish of its own, and no mill for its wheat, lives on shipments.
export const selfFed = (isl) => (isl.res || []).some((r) => r.good === 'fruit' || r.good === 'fish' || (r.good === 'wheat' && (isl.buildings || []).some((b) => b.id === 'windmill' && b.built)));
const stockOf = (isl, g) => (isl.stock && isl.stock[g]) || 0;
const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };

// Note: goods an island needs for its own projects: link goods and the missing goods of its waiting goals.
function projectGoods(isl) {
  const out = new Set();
  for (const g of Object.keys(isl.linkWant || {})) if (isl.linkWant[g] > 0) out.add(g);
  for (const goal of isl.goals || []) for (const g of Object.keys(goal.cost || {})) if (stockOf(isl, g) < goal.cost[g]) out.add(g);
  return out;
}

// Note: goods promised away or on their way, from the hulls alone: orders not yet loaded and crates in the air or in the hold.
function commitments(world) {
  const reserved = {};
  const inbound = {};
  for (const s of world.ships) {
    if (s.kind !== 'cargo') continue;
    if (s.order) {
      const r = reserved[s.order.from] || (reserved[s.order.from] = {});
      const i = inbound[s.order.to] || (inbound[s.order.to] = {});
      for (const g of Object.keys(s.order.goods)) { add(r, g, s.order.goods[g]); add(i, g, s.order.goods[g]); }
    }
    // Note: crates still in the hold while the hull unloads count for the dock it rests at, until the shelf has them.
    const dest = s.state === 'unload' ? s.from : s.to !== null && s.to !== s.from && (s.state === 'load' || s.state === 'depart' || s.state === 'flight' || s.state === 'land') ? s.to : null;
    if (dest !== null && dest !== undefined) {
      const i = inbound[dest] || (inbound[dest] = {});
      for (const g of Object.keys(s.cargo || {})) add(i, g, s.cargo[g]);
    }
  }
  return { reserved, inbound };
}

// Note: the demand of one dock island as {good: {n, prio}}: what the shelf lacks, ranked by why it is wanted.
function demandOf(world, B, inbound) {
  const out = {};
  const gn = isSpire(B) && world.gw ? gwNeeds(world.gw) : {};
  const proj = projectGoods(B);
  // Note: an island whose folk have no eatable food on the shelf asks for it before anything else; raw wheat is not eaten.
  const FOOD = ['bread', 'smoked', 'egg', 'fruit', 'fish'];
  const hungry = FOOD.every((g) => stockOf(B, g) < 1) && world.folkOn(B.id).some((f) => !f.visitor && f.needs.food < 0.5);
  // Note: a landing party or outpost on an awake, explored rare island gets food for four per head, topped up each tick, before any other cargo.
  const pop = world.folkOn(B.id).filter((f) => !f.visitor).length;
  if (B.rareSlot && !isDormant(B) && B.explored && pop > 0) {
    const have = FOOD.reduce((t, g) => t + stockOf(B, g) + ((inbound[B.id] || {})[g] || 0), 0);
    const n = Math.ceil(pop * 4 - have);
    // Note: an island with its own food only gets support when its shelf runs low.
    if (n > 0 && (!selfFed(B) || have < pop)) for (const g of ['bread', 'fruit']) out[g] = { rescue: true, n, prio: LEDGER.prio.support, cap: SHIP.cap };
  }
  for (const g of Object.keys(B.want || {}).sort()) {
    if (RARE_GOODS.includes(g) || (out[g] && out[g].prio === LEDGER.prio.support)) continue;
    const n = Math.ceil((B.want[g] || 0) - stockOf(B, g) - ((inbound[B.id] || {})[g] || 0));
    if (n <= 0) continue;
    out[g] = { rescue: hungry && FOOD.includes(g), n, prio: hungry && FOOD.includes(g) ? LEDGER.prio.hunger : gn[g] > 0 ? LEDGER.prio.gw : proj.has(g) ? LEDGER.prio.project : LEDGER.prio.plain };
  }
  return out;
}

// Note: crates A can spare per good: stock above what A wants (never below two) minus what is already promised away.
function surplusOf(A, reserved) {
  const out = {};
  for (const g of Object.keys(A.stock || {}).sort()) {
    if (RARE_GOODS.includes(g)) continue;
    const n = Math.floor(stockOf(A, g) - Math.max((A.want && A.want[g]) || 0, LEDGER.floorStock) - ((reserved[A.id] || {})[g] || 0));
    if (n > 0) out[g] = n;
  }
  return out;
}

const inTransit = (world, g, toId) => world.ships.some((s) => ((s.to === toId && (s.from !== toId || s.state === 'unload') && (s.cargo[g] || 0) > 0 && s.state !== 'idle') || (s.order && s.order.to === toId && (s.order.goods[g] || 0) > 0)));

// Note: the haul from A to B: rare goods for the Spire first, then wanted goods A can spare; crates are capped per good and per hull.
function tripOf(world, A, B, ctx) {
  const goods = {};
  let crates = 0; let value = 0; let rescue = false; let fetch = false;
  const put = (g, n, prio) => { n = Math.min(n, SHIP.cap - crates); if (n > 0) { add(goods, g, n); crates += n; value += n * prio; } };
  if (isSpire(B) && world.gw) {
    const rare = gwRareNeeds(world.gw);
    for (const g of Object.keys(rare)) {
      const have = stockOf(A, g) - ((ctx.reserved[A.id] || {})[g] || 0);
      if (have < 1 || stockOf(B, g) > 0 || inTransit(world, g, B.id)) continue;
      put(g, 1, LEDGER.prio.rare); fetch = true;
    }
  }
  const want = ctx.demand[B.id];
  const spare = ctx.surplus[A.id];
  for (const g of Object.keys(want).sort()) {
    // Note: a rescue haul may empty the shelf of the sender down to the floor.
    const can = want[g].rescue ? Math.floor(stockOf(A, g) - LEDGER.floorStock - ((ctx.reserved[A.id] || {})[g] || 0)) : spare[g];
    if (crates >= SHIP.cap || !(can > 0)) continue;
    put(g, Math.min(want[g].cap || LEDGER.goodCap, want[g].n, can), want[g].prio);
  }
  return crates > 0 ? { A, B, goods, crates, value, fetch } : null;
}

// Note: seconds the hull needs from now to hand the crates over: fly to A, load, fly to B, unload.
function tripTime(h, H, trip) {
  const dead = h.from === trip.A.id ? 0 : legTime(H, trip.A) + SHIP.load + SHIP.unload;
  return dead + SHIP.load + SHIP.perCrate * trip.crates + legTime(trip.A, trip.B) + SHIP.unload;
}

const tieOf = (world, h, t) => hash2(world.seed | 0, h.id, hashStr(`${t.A.id}>${t.B.id}`));

// Note: gives the ship an order and books its goods in the context, so the next pick sees them taken.
function assign(h, trip, ctx, world) {
  h.order = { from: trip.A.id, to: trip.B.id, goods: { ...trip.goods }, t: world.time };
  for (const g of Object.keys(trip.goods)) {
    add(ctx.reserved[trip.A.id] || (ctx.reserved[trip.A.id] = {}), g, trip.goods[g]);
    add(ctx.inbound[trip.B.id] || (ctx.inbound[trip.B.id] = {}), g, trip.goods[g]);
  }
  ctx.demand[trip.B.id] = demandOf(world, trip.B, ctx.inbound);
  ctx.surplus[trip.A.id] = surplusOf(trip.A, ctx.reserved);
}

// Note: one ledger pass; true when it ran. Below council tier 4 the hulls keep their own best-haul rule.
export function ledgerTick(world) {
  if (!tierAllows(world, 'cargo')) return false;
  const bucket = Math.floor(world.time / LEDGER.period);
  if (world.ledger && world.ledger.at === bucket) return false;
  world.ledger = { at: bucket };
  const docks = dockIslands(world);
  const cool = world.tripCool || {};
  // Note: an order a hull never started (parked, no clear path) is dropped after a while.
  for (const s of world.ships) if (s.order && s.state === 'idle' && world.time - s.order.t > LEDGER.staleAfter) delete s.order;
  const idle = world.ships.filter((s) => s.kind === 'cargo' && s.state === 'idle' && !s.colony && !s.order).sort((a, b) => a.id - b.id);
  if (!idle.length || docks.length < 2) return true;
  const { reserved, inbound } = commitments(world);
  const ctx = { reserved, inbound, demand: {}, surplus: {} };
  for (const i of docks) { ctx.demand[i.id] = demandOf(world, i, inbound); ctx.surplus[i.id] = surplusOf(i, reserved); }
  const blocked = new Set();
  const pool = idle.slice();
  const rareOn = !!world.gw && Object.keys(gwRareNeeds(world.gw)).length > 0;
  while (pool.length) {
    // Note: the trips do not depend on the hull, so they are built once per pick.
    const trips = [];
    for (const A of docks) {
      if (!rareOn && !Object.keys(ctx.surplus[A.id]).length) continue;
      for (const B of docks) {
        if (B === A || cool[`${A.id}>${B.id}`] > world.time) continue;
        const trip = tripOf(world, A, B, ctx);
        if (trip) trips.push(trip);
      }
    }
    // Note: while a dock has folk and no food, only the hauls that feed it are sailed.
    const fed = trips.filter((t) => t.rescue);
    if (fed.length) trips.splice(0, trips.length, ...fed);
    // Note: under the Ambassador's lease a rare fetch outranks every haul but the feeding ones.
    else if (maxCargo(world) > SHIP.maxCargo && trips.some((t) => t.fetch)) trips.splice(0, trips.length, ...trips.filter((t) => t.fetch));
    let best = null;
    for (const h of pool) {
      const H = world.islands.get(h.from);
      if (!H) continue;
      for (const trip of trips) {
        const { A, B } = trip;
        if (h.from !== A.id && cool[`${h.from}>${A.id}`] > world.time) continue;
        const full = slotsFree(world, B.id, h.id) < 1 ? B.id : h.from !== A.id && slotsFree(world, A.id, h.id) < 1 ? A.id : null;
        if (full) { blocked.add(full); continue; }
        const score = trip.value / tripTime(h, H, trip);
        const tie = tieOf(world, h, trip);
        if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && tie < best.tie)) best = { h, trip, score, tie };
      }
    }
    if (!best) break;
    assign(best.h, best.trip, ctx, world);
    pool.splice(pool.indexOf(best.h), 1);
  }
  // Note: a trip held up only by parked hulls with no job: the lowest parked hull sails empty to the dock island with most room.
  for (const id of [...blocked].sort()) {
    const h = pool.find((s) => s.from === id && !s.order);
    if (!h) continue;
    const to = docks.filter((i) => i.id !== id && slotsFree(world, i.id, h.id) >= 1).sort((a, b) => slotsFree(world, b.id, h.id) - slotsFree(world, a.id, h.id) || (a.id < b.id ? -1 : 1))[0];
    if (to) h.order = { from: id, to: to.id, goods: {}, t: world.time };
  }
  return true;
}

// Note: the fleet entry point for worldTick, in place of planColony: party and colony first (they take a hull), then the ledger tick; safe to call twice per tick.
export function planFleet(world) {
  const flight = planParty(world) || planColony(world);
  ledgerTick(world);
  return flight;
}
