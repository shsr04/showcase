// Note: airships: cargo hauls between airdocks, plus trader, explorer and military visitors; pure sim, no rendering.
// Note: state lives in world.ships (JSON only); stepShips returns plain event objects and never calls world.emit.

import { N, MAX_H } from './config.js';
import { TRAIT_RARE_GOOD } from './content/defs.js';
import { tierAllows, councilTier } from './capital.js';
import { hash2 } from './rand.js';
import { sightByTale, sightAll, rareIslands } from './sighting.js';
import { pierSlot } from './pier.js';
import { FLIGHT, buildField, blockedAt, padPoint, padCells, flightBase, flightTotal, airOf } from './flight.js';

export const SHIP_KINDS = ['cargo', 'trader', 'explorer', 'military'];
export const SHIP_STATES = ['idle', 'load', 'depart', 'flight', 'land', 'unload', 'hold', 'ground'];
export const STOCK_CAP = 40; // Note: the same cap as econ.js STOCK_CAP; ships only add up to it while a hull waits.

// Note: crates are single units; speed is world units per second; times are seconds.
export const SHIP = {
  cap: 8, moor: 1.6, maxCargo: 3,
  speed: { cargo: 4, trader: 3.4, explorer: 3.8, military: 2.6 },
  tUp: 7, tDown: 8, load: 5, perCrate: 1.5, unload: 5, poll: 3, retry: 8, giveUp: 6, holdMax: 120, dumpAfter: 30,
  margin: 0.7, relaxMargin: 0.2, sep: 4, still: 2.6, step: 0.5, levels: [12, 20, 30, 42, 56], off: 140,
};

// Note: cargo hull cap; a fleet lease {until, extra} on the world raises it while it runs.
// Note: the Ambassador's lease: three more hulls for one year (4320 s).
export const LEASE = { extra: 3, term: 4320 };
export function maxCargo(world) {
  const l = world && world.fleetLease;
  return SHIP.maxCargo + (l && num(l.until) && l.until > world.time ? Math.max(0, l.extra | 0) : 0);
}

// Note: lowest cruise height that clears any island, revealed or not; party flights cross fog the clearance field cannot see.
export const cruiseFloor = () => Math.ceil(MAX_H + 2.6 + FLIGHT.rad + FLIGHT.swayMax + SHIP.margin + 2);

// Note: who visits where; the pad takes balloons, the airdock takes airships (merchant in a trader, frigate in a military hull).
export const VISITORS = {
  wanderer: { site: 'pad' },
  pilgrim: { site: 'pad' },
  merchant: { site: 'airdock', ship: 'trader' },
  frigate: { site: 'airdock', ship: 'military', rung: 4 },
};
export const VISITOR_KINDS = Object.keys(VISITORS);
// Note: contract table comes from content/defs.js.
export const RARE_BY_TRAIT = TRAIT_RARE_GOOD;
export const RARE_GOODS = Object.values(RARE_BY_TRAIT);

const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => u * u * (3 - 2 * u);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const stockOf = (isl, g) => (isl.stock && isl.stock[g]) || 0;
const unit = (seed, a, b) => hash2(seed | 0, a | 0, b | 0) / 4294967296;
const sumCargo = (c) => Object.values(c || {}).reduce((n, v) => n + v, 0);
const liveIslands = (world) => [...world.islands.values()].filter((i) => i.revealed).sort(byId);
const islOf = (world, v) => (v && typeof v === 'object' ? v : world.islands.get(v) || null);

// Note: built airdocks of an island as {b, k} with k the building index.
export function docksOf(isl) {
  const out = [];
  isl.buildings.forEach((b, k) => { if (b && !b.gone && b.built && b.id === 'airdock') out.push({ b, k }); });
  return out;
}
// Note: every mooring of an island: two per airdock, one on each side of its pier.
export function slotsOf(isl) {
  const out = [];
  for (const d of docksOf(isl)) for (let slot = 0; slot < 2; slot++) out.push({ b: d.b, k: d.k, slot });
  return out;
}
export const dockIslands = (world) => liveIslands(world).filter((i) => docksOf(i).length > 0);
export const isSpire = (isl) => isl.special === 'spire' || isl.spire === true;

// Note: world point of a mooring: beside the pier end, one mooring height above the dock deck.
export function mooring(isl, b, slot = 0) {
  const p = padPoint(isl, b);
  const o = pierSlot(b, slot);
  return { x: p.x + o.di, z: p.z + o.dj, y: p.rest - 0.18 + SHIP.moor };
}

// Note: where a colony hull rests on the bare site: the middle of the 3x3 block, just above the ground.
export function colonyPoint(isl, site) {
  const p = padPoint(isl, { x: site.x, y: site.y, size: 3 });
  return { x: p.x, z: p.z, y: p.rest - 0.18 + 0.55, pad: { x: site.x, y: site.y, size: 3 } };
}

// Note: true when another ship rests at, or flies to, this mooring (dock k, side slot).
export function dockBusy(world, islId, k, slot, selfId, alsoId) {
  for (const s of world.ships) {
    if (s.id === selfId || s.id === alsoId) continue;
    if (s.state === 'idle' || s.state === 'load' || s.state === 'unload') { if (s.from === islId && s.dock === k && (s.slot | 0) === slot) return true; continue; }
    if (s.plan && s.to === islId && s.plan.dockB === k && (s.plan.slotB | 0) === slot) return true;
  }
  return false;
}

// Note: first free mooring of an island as {k, slot}, or null.
export function freeMooring(world, isl, selfId) {
  const d = slotsOf(isl).find((e) => !dockBusy(world, isl.id, e.k, e.slot, selfId));
  return d ? { k: d.k, slot: d.slot } : null;
}

// Note: moorings left after hulls that rest there, fly there or hold an order for it; a hull never counts against itself.
export function slotsFree(world, islId, selfId) {
  const isl = world.islands.get(islId);
  if (!isl) return 0;
  let n = slotsOf(isl).length;
  for (const s of world.ships) {
    if (s.id === selfId) continue;
    const here = s.from === islId && s.dock >= 0 && (s.state === 'idle' || s.state === 'load' || s.state === 'unload');
    const bound = s.kind === 'cargo' && ((s.to === islId && s.from !== islId && (s.state === 'load' || s.state === 'depart' || s.state === 'flight' || s.state === 'land')) || (s.order && s.order.to === islId));
    if (here || bound) n--;
  }
  return Math.max(0, n);
}

// Note: rough seconds for a hull to fly between two islands, climb and descent included; the plan itself decides the real time.
export function legTime(a, b) {
  return SHIP.tUp + SHIP.tDown + Math.max(4, Math.hypot(a.wx - b.wx, a.wz - b.wz) / SHIP.speed.cargo);
}

// Note: a failed pair waits before the ledger or a party tries it again.
export function tripCool(world, from, to, sec = 120) {
  (world.tripCool || (world.tripCool = {}))[`${from}>${to}`] = world.time + sec;
}

// Note: a free mooring of the island, or the wanted one (the hull's own) when given.
function pickDock(world, isl, wantK, wantSlot, selfId) {
  const slots = slotsOf(isl);
  if (Number.isInteger(wantK)) { const d = slots.find((e) => e.k === wantK && e.slot === (wantSlot | 0)); if (d) return d; }
  return slots.find((e) => !dockBusy(world, isl.id, e.k, e.slot, selfId)) || null;
}

// Note: the ship pose along a plan at plan time t: vertical climb, eased cruise, vertical descent.
export function posAt(plan, t) {
  const tt = Math.max(0, Math.min(plan.dur, t));
  const tc = plan.dur - plan.tDown;
  if (plan.tUp > 0 && tt < plan.tUp) return { x: plan.x0, z: plan.z0, y: plan.y0 + (plan.cruise - plan.y0) * smooth(tt / plan.tUp) };
  if (plan.tDown > 0 && tt > tc) return { x: plan.x1, z: plan.z1, y: plan.cruise + (plan.y1 - plan.cruise) * smooth((tt - tc) / plan.tDown) };
  const span = Math.max(1e-6, tc - plan.tUp);
  const u = smooth(clamp01((tt - plan.tUp) / span));
  return { x: plan.x0 + (plan.x1 - plan.x0) * u, z: plan.z0 + (plan.z1 - plan.z0) * u, y: plan.cruise };
}

// Note: clears the endpoint cells and their ring in a field copy, so the hull may rise and sink over its own dock.
function openCells(F, isl, b) {
  const e = F.isls.find((q) => q.isl === isl);
  if (!e) return;
  for (const c of padCells(b)) e.top[c] = -1e9;
  for (let j = b.y - 1; j <= b.y + b.size; j++) for (let i = b.x - 1; i <= b.x + b.size; i++) {
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    e.top[j * N + i] = -1e9;
  }
}

function hitsTraffic(world, self, plan, tau, p, air) {
  for (const o of world.arrivals || []) {
    if (o.x0 === undefined) continue;
    const to = o.t + tau;
    if (to > flightTotal(o) + 2) continue;
    const b = flightBase(o, to, o.x0, o.z0, o.rest);
    if (Math.hypot(p.x - b.x, p.y - b.y, p.z - b.z) < FLIGHT.sep + 2 + FLIGHT.swayMax * (air + b.air)) return 'balloon';
  }
  for (const s of world.ships) {
    if (s === self || s.state === 'hold' || !s.pos) continue;
    let q = s.pos; let need = SHIP.still;
    if (s.plan && (s.state === 'depart' || s.state === 'flight' || s.state === 'land')) { q = posAt(s.plan, s.t + tau); need = SHIP.sep; }
    if (!num(q.x) || !num(q.y) || !num(q.z)) continue;
    if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < need) return 'ship';
  }
  return null;
}

// Note: plans a flight of kind between two islands (objects or ids); a null end is off the map, opts.ang its bearing.
// Note: read-only on flight.js: the same terrain, plant, building and lane model as balloons, with the hull's own margin.
export function planShip(world, from, to, kind, opts = {}) {
  const A = from === null || from === undefined ? null : islOf(world, from);
  const B = to === null || to === undefined ? null : islOf(world, to);
  if ((!A && !B) || (from !== null && from !== undefined && !A) || (to !== null && to !== undefined && !B)) return null;
  const dA = A ? pickDock(world, A, opts.dockFrom, opts.slotFrom, opts.self) : null;
  const G = opts.ground || null;
  const dB = B && !G ? pickDock(world, B, opts.dockTo, opts.slotTo, opts.self) : null;
  if ((A && !dA) || (B && !G && !dB)) return null;
  const pa = A ? mooring(A, dA.b, dA.slot) : null;
  const pb = G ? { x: G.x, z: G.z, y: G.y } : B ? mooring(B, dB.b, dB.slot) : null;
  const ang = opts.ang || 0;
  const a = pa || { x: pb.x + Math.cos(ang) * SHIP.off, z: pb.z + Math.sin(ang) * SHIP.off, y: 0 };
  const b = pb || { x: pa.x + Math.cos(ang) * SHIP.off, z: pa.z + Math.sin(ang) * SHIP.off, y: 0 };
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const speed = SHIP.speed[kind] || SHIP.speed.cargo;
  const tUp = A ? SHIP.tUp : 0; const tDown = B ? SHIP.tDown : 0;
  const dur = tUp + tDown + Math.max(4, d / speed);
  const ground = Math.max(pa ? pa.y : -1e9, pb ? pb.y : -1e9);
  const plan = { x0: a.x, z0: a.z, y0: a.y, x1: b.x, z1: b.z, y1: b.y, cruise: 0, dur, tUp, tDown, yaw: Math.atan2(b.x - a.x, b.z - a.z), dockA: dA ? dA.k : -1, slotA: dA ? dA.slot : 0, dockB: dB ? dB.k : -1, slotB: dB ? dB.slot : 0, relaxed: false };
  for (const relaxed of [false, true]) {
    const F = buildField(world);
    if (A) openCells(F, A, dA.b);
    if (dB) openCells(F, B, dB.b);
    else if (G) openCells(F, B, G.pad);
    if (relaxed) F.lanes = [];
    const margin = relaxed ? SHIP.relaxMargin : SHIP.margin;
    let levels = SHIP.levels.map((l) => ground + l);
    levels.push(Math.ceil(F.maxTop + FLIGHT.rad + FLIGHT.swayMax + margin + 2));
    // Note: opts.floor keeps the whole cruise above fog islands; the field only knows revealed ones.
    if (opts.floor) { levels = levels.filter((l) => l >= opts.floor); levels.push(Math.max(opts.floor, Math.ceil(F.maxTop + FLIGHT.rad + FLIGHT.swayMax + margin + 2))); }
    levels.sort((p, q) => p - q);
    for (const cruise of levels) {
      plan.cruise = cruise;
      if (!A) plan.y0 = cruise;
      if (!B) plan.y1 = cruise;
      plan.relaxed = relaxed;
      let bad = null;
      for (let tau = 0; tau <= dur + 1e-6 && !bad; tau += SHIP.step) {
        const p = posAt(plan, tau);
        if (!num(p.x) || !num(p.y) || !num(p.z)) return null;
        const air = airOf(Math.max(0, p.y - ground));
        bad = blockedAt(F, p.x, p.y, p.z, air, null, margin) || hitsTraffic(world, opts.self ? world.ships.find((s) => s.id === opts.self) : null, plan, tau, p, air);
      }
      if (!bad) return { ...plan };
    }
  }
  return null;
}

// Note: a rare good a merchant or frigate can bring: its trait island must be revealed and awake, never unrevealed.
export function rareOffers(world) {
  const out = [];
  for (const isl of liveIslands(world)) {
    if (isl.dormant) continue;
    for (const [trait, good] of Object.entries(RARE_BY_TRAIT)) {
      const has = (isl.traits && isl.traits.includes(trait)) || isl.rareSlot === trait;
      if (!has) continue;
      if (world.gw && world.gw.paid && world.gw.paid[good]) continue;
      out.push({ good, from: isl.id });
    }
  }
  return out.sort((p, q) => (p.good < q.good ? -1 : p.good > q.good ? 1 : p.from < q.from ? -1 : p.from > q.from ? 1 : 0));
}

// Note: merchant: two of a surplus common good for one rare good; frigate: the rare good as a gift. Null offers nothing.
export function merchantOffer(world, isl, salt = 0, gift = false) {
  const rare = rareOffers(world);
  if (!rare.length) return null;
  const get = rare[Math.floor(unit(world.seed, salt, 11) * rare.length) % rare.length];
  if (gift) return { give: null, get };
  const give = Object.keys(isl.stock || {}).filter((g) => !RARE_GOODS.includes(g) && stockOf(isl, g) >= 4).sort((p, q) => stockOf(isl, q) - stockOf(isl, p) || (p < q ? -1 : 1))[0];
  if (!give) return null;
  return { give: { good: give, n: 2 }, get };
}

// Note: which visitor comes to a site; salt keeps the pick stable for one arrival.
export function visitorFor(world, isl, site, salt = 0) {
  const roll = unit(world.seed, salt, site === 'pad' ? 3 : 5);
  if (site === 'pad') {
    const memorial = liveIslands(world).some((i) => (i.memorials || []).length > 0) || (world.deeds || []).length > 0;
    return memorial && roll < 0.5 ? 'pilgrim' : 'wanderer';
  }
  return (isl.rung | 0) >= VISITORS.frigate.rung && roll < 0.2 ? 'frigate' : 'merchant';
}

function newShip(world, kind, state, extra) {
  let id = 1;
  for (const s of world.ships) id = Math.max(id, s.id + 1);
  const s = { id, kind, state, pos: { x: 0, y: 0, z: 0 }, from: null, to: null, dock: -1, slot: 0, cargo: {}, t: 0, plan: null, fails: 0, visit: null, yaw: 0, ...extra };
  world.ships.push(s);
  return s;
}

function restAt(world, s) {
  const isl = world.islands.get(s.from);
  const d = isl && docksOf(isl).find((e) => e.k === s.dock);
  if (!d) return false;
  s.pos = mooring(isl, d.b, s.slot | 0);
  return true;
}

// Note: adds a cargo hull moored at a free dock; null when the island has none free.
export function addCargoShip(world, islId) {
  const isl = world.islands.get(islId);
  if (!isl) return null;
  const d = pickDock(world, isl, undefined, undefined, 0);
  if (!d) return null;
  const s = newShip(world, 'cargo', 'idle', { from: isl.id, to: isl.id, dock: d.k, slot: d.slot });
  restAt(world, s);
  return s;
}

function intransit(world, good, toId) {
  return world.ships.some((s) => s.to === toId && s.plan && (s.cargo[good] || 0) > 0);
}

// Note: the best haul from the island the ship rests at: rare goods to the Spire, then wanted goods of other docks.
function findHaul(world, ship, A = world.islands.get(ship.from), alsoId) {
  if (!A) return null;
  let best = null;
  for (const B of dockIslands(world)) {
    if (B === A || !slotsOf(B).some((e) => !dockBusy(world, B.id, e.k, e.slot, ship.id, alsoId))) continue;
    const goods = {}; let crates = 0;
    const put = (g, n) => { n = Math.min(n, SHIP.cap - crates); if (n > 0) { goods[g] = (goods[g] || 0) + n; crates += n; } };
    if (isSpire(B)) {
      for (const g of RARE_GOODS) {
        if (stockOf(A, g) < 1 || stockOf(B, g) > 0 || (world.gw && world.gw.paid && world.gw.paid[g]) || intransit(world, g, B.id)) continue;
        put(g, 1);
      }
    }
    for (const g of Object.keys(B.want || {}).sort()) {
      if (crates >= SHIP.cap || RARE_GOODS.includes(g)) continue;
      let inbound = 0;
      for (const s of world.ships) if (s.to === B.id && s.plan) inbound += s.cargo[g] || 0;
      const gap = (B.want[g] || 0) - stockOf(B, g) - inbound;
      const spare = stockOf(A, g) - (goods[g] || 0) - Math.max((A.want && A.want[g]) || 0, 2);
      put(g, Math.min(6, Math.floor(spare), Math.ceil(gap)));
    }
    if (crates > 0 && (!best || crates > best.crates)) best = { to: B.id, goods, crates };
  }
  return best;
}

function depositAll(isl, cargo, capped) {
  for (const g of Object.keys(cargo)) {
    const room = capped ? Math.max(0, STOCK_CAP - stockOf(isl, g)) : cargo[g];
    const n = Math.min(cargo[g], room);
    if (n > 0) { isl.stock[g] = stockOf(isl, g) + n; cargo[g] -= n; }
    if (cargo[g] <= 0) delete cargo[g];
  }
}

function motionState(s) {
  if (s.plan.tUp > 0 && s.t < s.plan.tUp) return 'depart';
  if (s.plan.tDown > 0 && s.t >= s.plan.dur - s.plan.tDown) return 'land';
  return 'flight';
}

function startVisitorLeave(world, s, out) {
  const isl = world.islands.get(s.from);
  const ang = unit(world.seed, s.id, 7) * Math.PI * 2;
  const plan = isl ? planShip(world, isl, null, s.kind, { dockFrom: s.dock, slotFrom: s.slot, ang, self: s.id }) : null;
  if (!plan) { s.fails++; s.t = Math.max(0, s.t - SHIP.retry); return false; }
  s.plan = plan; s.to = null; s.t = 0; s.fails = 0; s.state = 'depart';
  out.push({ type: 'shipdepart', ship: s });
  return true;
}

function startCargoFlight(world, s, out) {
  const B = world.islands.get(s.to);
  const plan = B ? planShip(world, s.from, B, s.kind, { dockFrom: s.dock, slotFrom: s.slot, self: s.id, ground: s.colony ? colonyPoint(B, s.colony.site) : null, floor: s.colony && s.colony.party ? cruiseFloor() : 0 }) : null;
  if (!plan) { s.fails++; s.t = Math.max(0, s.t - SHIP.retry); return false; }
  s.plan = plan; s.t = 0; s.fails = 0; s.state = 'depart';
  out.push({ type: 'shipdepart', ship: s });
  return true;
}

// Note: a visitor ship starts from off the map; it holds when no dock or no clear path exists yet.
function spawnVisitor(world, kind, islId, out, who0) {
  const isl = world.islands.get(islId);
  if (!isl || !isl.revealed || !SHIP_KINDS.includes(kind) || kind === 'cargo') return null;
  if (kind === 'military' && (isl.rung | 0) < VISITORS.frigate.rung) return null;
  if (!docksOf(isl).length) return null;
  const who = who0 || (kind === 'trader' ? 'merchant' : kind === 'military' ? 'frigate' : 'explorer');
  const s = newShip(world, kind, 'hold', { to: isl.id, visit: { who, offer: null, reveal: [], done: false } });
  s.pos = { x: 0, y: 0, z: 0 };
  tryArrive(world, s, out);
  return s;
}

function tryArrive(world, s, out) {
  const isl = world.islands.get(s.to);
  if (!isl) { s.dead = true; return; }
  const ang = unit(world.seed, s.id, 13) * Math.PI * 2;
  const plan = planShip(world, null, isl, s.kind, { ang, self: s.id });
  if (!plan) { s.t = 0; return; }
  s.plan = plan; s.dock = plan.dockB; s.slot = plan.slotB | 0; s.from = null; s.state = 'flight'; s.t = 0; s.fails = 0;
  s.pos = posAt(plan, 0); s.yaw = plan.yaw;
}

// Note: touchdown of a visitor: decide what it brings; the swap itself happens when the unload ends.
function visitorLands(world, s, out, land) {
  const isl = world.islands.get(s.from);
  const v = s.visit;
  if (!isl || !v) return;
  if (v.who !== 'ambassador') sightByTale(world, isl);
  if (v.who === 'ambassador') {
    // Note: once per world: every rare island is sighted, the unrevealed ones are named for the integrator, and the fleet lease starts.
    sightAll(world);
    world.fleetLease = { until: world.time + LEASE.term, extra: LEASE.extra };
    if (!world.ambassador) world.ambassador = { sent: true, done: true };
    world.ambassador.done = true;
    out.push({ type: 'visitor', kind: 'ambassador', isl, offer: null, reveal: rareIslands(world).filter((i) => !i.revealed).map((i) => i.id) });
  } else if (v.who === 'merchant') { v.offer = merchantOffer(world, isl, s.id * 31 + 1, false); out.push({ type: 'visitor', kind: 'merchant', isl, offer: v.offer }); }
  else if (v.who === 'frigate') { v.offer = merchantOffer(world, isl, s.id * 31 + 2, true); out.push({ type: 'visitor', kind: 'frigate', isl, offer: v.offer }); }
  else if (v.who === 'explorer') {
    // Note: the explorer names the nearest unrevealed neighbour on the shipland event; the integrator calls world.reveal.
    const near = [...world.islands.values()].filter((i) => !i.revealed && Math.max(Math.abs(i.gx - isl.gx), Math.abs(i.gz - isl.gz)) <= 1).sort(byId);
    v.reveal = near.length ? [near[0].id] : [];
    land.reveal = v.reveal.slice();
  }
}

function visitorLeaves(world, s) {
  const isl = world.islands.get(s.from);
  const v = s.visit;
  if (!isl || !v || v.done) return;
  v.done = true;
  const o = v.offer;
  if (!o) return;
  if (o.give) { if (stockOf(isl, o.give.good) < o.give.n) { v.offer = null; return; } isl.stock[o.give.good] -= o.give.n; }
  isl.stock[o.get.good] = Math.min(STOCK_CAP, stockOf(isl, o.get.good) + 1);
}

// Note: an idle hull follows its ledger order: sail empty to the pick-up dock, load the reserved crates there, sail on; no order means wait.
function runOrder(world, s) {
  const o = s.order;
  if (!o) return;
  const A = world.islands.get(s.from);
  const B = world.islands.get(o.to);
  const P = world.islands.get(o.from);
  if (!A || !B || !P || !docksOf(B).length || !docksOf(P).length) { delete s.order; return; }
  if (s.from !== o.from) { s.cargo = {}; s.to = o.from; s.state = 'load'; s.fails = 0; return; }
  const cargo = {};
  for (const g of Object.keys(o.goods).sort()) {
    const n = Math.min(o.goods[g], stockOf(A, g));
    if (n > 0) { A.stock[g] -= n; cargo[g] = n; }
  }
  delete s.order;
  // Note: a haul whose crates were eaten meanwhile is dropped; a reposition order has no crates and still sails.
  if (!sumCargo(cargo) && Object.keys(o.goods).length) return;
  s.cargo = cargo; s.to = o.to; s.state = 'load'; s.fails = 0;
}

function stepOne(world, s, dt, out) {
  if (!num(dt)) return;
  s.t += dt;
  switch (s.state) {
    case 'hold':
      if (s.t >= SHIP.retry) {
        tryArrive(world, s, out);
        if (s.state === 'hold' && (s.holdT = (s.holdT || 0) + SHIP.retry) >= SHIP.holdMax) {
          s.dead = true;
          // Note: an Ambassador who never found a berth is sent again.
          if (s.visit && s.visit.who === 'ambassador' && world.ambassador) world.ambassador.sent = false;
        }
        if (s.state === 'hold') s.t = 0;
      }
      return;
    case 'idle': {
      if (!restAt(world, s)) { s.dead = true; return; }
      if (s.t < SHIP.poll) return;
      s.t = 0;
      if (s.kind !== 'cargo') return;
      // Note: from council tier 4 on, a ticking ledger gives the orders; before that the hull takes the best haul where it rests.
      if (tierAllows(world, 'cargo') && world.ledger) { runOrder(world, s); return; }
      if (s.order) delete s.order;
      const A = world.islands.get(s.from);
      const job = findHaul(world, s);
      if (!job) {
        // Note: nothing to carry here: sail empty to a dock where goods wait and no other hull stands.
        const X = dockIslands(world).find((i) => i !== A && slotsOf(i).some((e) => !dockBusy(world, i.id, e.k, e.slot, s.id)) && !world.ships.some((q) => q !== s && q.kind === 'cargo' && (q.to === i.id || (q.from === i.id && q.state === 'idle'))) && findHaul(world, s, i));
        if (X) { s.cargo = {}; s.to = X.id; s.state = 'load'; s.fails = 0; return; }
        // Note: yield the dock when another idle hull has a haul to this very island and no dock to land on.
        const asks = world.ships.some((q) => q !== s && q.kind === 'cargo' && q.state === 'idle' && q.from !== s.from && (findHaul(world, q, undefined, s.id) || {}).to === s.from);
        const T = asks && dockIslands(world).find((i) => i !== A && slotsOf(i).some((e) => !dockBusy(world, i.id, e.k, e.slot, s.id)) && !world.ships.some((q) => q !== s && q.to === i.id && q.plan));
        if (T) { s.cargo = {}; s.to = T.id; s.state = 'load'; s.fails = 0; }
        return;
      }
      for (const g of Object.keys(job.goods)) { A.stock[g] = stockOf(A, g) - job.goods[g]; }
      s.cargo = job.goods; s.to = job.to; s.state = 'load'; s.fails = 0;
      return;
    }
    case 'load': {
      if (!restAt(world, s)) { const A = world.islands.get(s.from); if (A) depositAll(A, s.cargo, false); s.dead = true; return; }
      if (s.t < SHIP.load + SHIP.perCrate * sumCargo(s.cargo)) return;
      if (s.fails >= SHIP.giveUp) {
        // Note: no clear path or free dock after several tries: the crates go back to the shelf.
        depositAll(world.islands.get(s.from), s.cargo, false);
        if (s.order) { tripCool(world, s.from, s.order.from); delete s.order; } else if (s.to !== s.from) tripCool(world, s.from, s.to);
        s.cargo = {}; s.to = s.from; s.state = 'idle'; s.t = 0; s.fails = 0;
        if (s.colony) out.push({ type: 'colonyabort', ship: s });
        return;
      }
      startCargoFlight(world, s, out);
      return;
    }
    case 'depart': case 'flight': case 'land': {
      const prev = s.state;
      if (s.t >= s.plan.dur) {
        s.t = 0; s.pos = posAt(s.plan, s.plan.dur); s.yaw = s.plan.yaw;
        if (s.to === null) { s.dead = true; return; }
        const bare = s.colony && s.plan.dockB < 0;
        s.from = s.to; s.dock = s.plan.dockB; s.slot = s.plan.slotB | 0; s.plan = null; s.state = bare ? 'ground' : 'unload';
        const land = { type: 'shipland', ship: s };
        out.push(land);
        visitorLands(world, s, out, land);
        return;
      }
      const ns = motionState(s);
      s.state = ns;
      s.pos = posAt(s.plan, s.t); s.yaw = s.plan.yaw;
      if (ns === 'land' && prev !== 'land') out.push({ type: 'shiparrive', ship: s });
      return;
    }
    case 'ground': {
      // Note: the hull waits on the bare site until the family has built the airdock, then it moors.
      const isl = world.islands.get(s.from);
      if (!isl || !s.colony) { s.dead = true; return; }
      s.pos = colonyPoint(isl, s.colony.site);
      if (s.dock >= 0 && docksOf(isl).some((e) => e.k === s.dock)) { s.state = 'idle'; s.t = 0; s.to = s.from; delete s.colony; restAt(world, s); }
      return;
    }
    case 'unload': {
      const isl = world.islands.get(s.from);
      if (!isl) { s.dead = true; return; }
      const docked = restAt(world, s);
      if (s.t < SHIP.unload) return;
      if (sumCargo(s.cargo) > 0) {
        depositAll(isl, s.cargo, true);
        // Note: a shelf that stays full is a hard cap like stockAdd; crates left after the wait are lost.
        if (sumCargo(s.cargo) > 0 && s.t >= SHIP.unload + SHIP.dumpAfter) s.cargo = {};
        if (sumCargo(s.cargo) > 0) return;
      }
      if (s.kind === 'cargo') { s.state = 'idle'; s.t = 0; s.to = s.from; s.plan = null; return; }
      if (!docked) { s.dead = true; return; }
      visitorLeaves(world, s);
      if (s.t >= SHIP.unload + 6) startVisitorLeave(world, s, out);
      if (s.fails >= SHIP.giveUp) s.dead = true;
    }
  }
}

// Note: one step for every ship; deckEvents is the array stepDeck returned (rareship starts spawn a visitor hull).
export function stepShips(world, dt, deckEvents) {
  if (!Array.isArray(world.ships)) world.ships = [];
  const out = [];
  for (const e of deckEvents || []) shipOnEvent(world, e, out);
  // Note: the Ambassador comes once, when the council first reaches tier 5; he needs a home dock and no craft.
  const bucket = Math.floor(world.time / 5) !== Math.floor((world.time - dt) / 5);
  if (bucket) {
    const amb = world.ambassador || (world.ambassador = { sent: false, done: false });
    if (!amb.sent && councilTier(world) >= 5 && spawnVisitor(world, 'trader', '0,0', out, 'ambassador')) amb.sent = true;
    // Note: when the lease ends, idle surplus hulls without crates, order or party fly away; the others stay until idle.
    const spare = world.ships.filter((s) => s.kind === 'cargo').length - maxCargo(world);
    if (spare > 0) {
      const drop = new Set(world.ships.filter((s) => s.kind === 'cargo' && s.state === 'idle' && !s.colony && !sumCargo(s.cargo)).sort((a, b) => b.id - a.id).slice(0, spare));
      if (drop.size) world.ships = world.ships.filter((s) => !drop.has(s));
    }
  }
  // Note: the spawn check runs when the 5 s bucket changes; it needs no stored state.
  // Note: cargo hulls need the navigation craft; the visitors and the free docks of rare isles stay without it.
  if (world.shipAuto !== false && world.known.has('navigation') && Math.floor(world.time / 5) !== Math.floor((world.time - dt) / 5)) {
    const docks = dockIslands(world);
    // Note: every dock island keeps one mooring free for a party hull.
    const want = Math.min(maxCargo(world), docks.reduce((n, i) => n + slotsOf(i).length, 0) - docks.length);
    const have = world.ships.filter((s) => s.kind === 'cargo').length;
    if (have < want) {
      const open = docks.filter((i) => slotsFree(world, i.id, 0) >= 2);
      const home = open.map((i) => ({ i, n: world.ships.filter((s) => s.kind === 'cargo' && s.from === i.id).length })).sort((p, q) => p.n - q.n || byId(p.i, q.i))[0];
      if (home) addCargoShip(world, home.i.id);
    }
  }
  for (const s of [...world.ships]) stepOne(world, s, dt, out);
  world.ships = world.ships.filter((s) => !s.dead);
  return out;
}

// Note: hook for deck events; a rareship start brings its hull. Returns the ship or null.
export function shipOnEvent(world, ev, out = []) {
  if (!ev || ev.type !== 'event' || ev.kind !== 'rareship' || ev.phase !== 'start' || !ev.data) return null;
  if (!Array.isArray(world.ships)) world.ships = [];
  return spawnVisitor(world, ev.data.ship, ev.data.isl, out);
}

// Note: JSON-safe copy for saving; pos is derived and recomputed on load.
export function shipsToJSON(world) {
  return JSON.parse(JSON.stringify(world.ships || []));
}

// Note: validates a saved list; ships with unknown islands, kinds, states or broken plans are dropped.
export function shipsFromJSON(world, list) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !Number.isInteger(r.id) || !SHIP_KINDS.includes(r.kind) || !SHIP_STATES.includes(r.state) || !num(r.t)) continue;
    if (out.some((s) => s.id === r.id)) continue;
    const moving = r.state === 'depart' || r.state === 'flight' || r.state === 'land';
    const p = r.plan;
    if (moving && !(p && ['x0', 'z0', 'y0', 'x1', 'z1', 'y1', 'cruise', 'dur', 'tUp', 'tDown'].every((k) => num(p[k])))) continue;
    if (r.from !== null && r.from !== undefined && !world.islands.has(r.from)) continue;
    if (r.to !== null && r.to !== undefined && !world.islands.has(r.to)) continue;
    const cargo = {};
    for (const g of Object.keys(r.cargo || {})) if (Number.isInteger(r.cargo[g]) && r.cargo[g] > 0) cargo[g] = r.cargo[g];
    const s = { id: r.id, kind: r.kind, state: r.state, pos: num(r.pos && r.pos.x) && num(r.pos.y) && num(r.pos.z) ? { x: r.pos.x, y: r.pos.y, z: r.pos.z } : { x: 0, y: 0, z: 0 }, from: r.from ?? null, to: r.to ?? null, dock: Number.isInteger(r.dock) ? r.dock : -1, slot: r.slot === 1 ? 1 : 0, cargo, t: r.t, plan: moving ? { ...p } : null, fails: r.fails | 0, visit: r.visit ? JSON.parse(JSON.stringify(r.visit)) : null, yaw: num(r.yaw) ? r.yaw : 0 };
    if (r.holdT) s.holdT = r.holdT;
    const ro = r.order;
    if (ro && world.islands.has(ro.from) && world.islands.has(ro.to) && ro.goods && typeof ro.goods === 'object') {
      const goods = {};
      for (const g of Object.keys(ro.goods)) if (Number.isInteger(ro.goods[g]) && ro.goods[g] > 0) goods[g] = ro.goods[g];
      s.order = { from: ro.from, to: ro.to, goods, t: num(ro.t) ? ro.t : 0 };
    }
    const rc = r.colony;
    if (rc && Array.isArray(rc.crew) && rc.site && Number.isInteger(rc.site.x) && Number.isInteger(rc.site.y)) {
      const door = rc.site.door && Number.isInteger(rc.site.door.i) && Number.isInteger(rc.site.door.j) ? { i: rc.site.door.i, j: rc.site.door.j } : { i: rc.site.x, j: rc.site.y };
      s.colony = { crew: rc.crew.filter(Number.isInteger), site: { x: rc.site.x, y: rc.site.y, dir: rc.site.dir | 0, door } };
      if (rc.party === true) s.colony.party = true;
      if (rc.kit) { s.colony.kit = {}; for (const g of Object.keys(rc.kit)) if (Number.isInteger(rc.kit[g]) && rc.kit[g] > 0) s.colony.kit[g] = rc.kit[g]; }
    }
    if (s.state === 'ground' && (!s.colony || !world.islands.has(s.from))) continue;
    if (moving) { s.pos = posAt(s.plan, s.t); s.yaw = s.plan.yaw; } else if (s.state === 'ground') s.pos = colonyPoint(world.islands.get(s.from), s.colony.site); else if (s.state !== 'hold') restAt(world, s);
    out.push(s);
  }
  world.ships = out;
  return out;
}

export function initShips(world) {
  return shipsFromJSON(world, world.ships);
}
