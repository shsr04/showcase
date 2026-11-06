// Note: colony flights: a hull carries one family and a dock kit to an empty island; the family builds the airdock, then the hull moors.
// Note: sim only; ships.js moves the hull, this module boards and lands the folk and starts the dock.

import { startBuilding, findSite, stockGet, stockAdd, live, awakenIsland, airdockFeasible } from './econ.js';
import { endTask } from './folk.js';
import { nearestWalkable } from './path.js';
import { rareSlots, RARE_TRAITS } from './rareisles.js';
import { tierAllows } from './capital.js';
import { isSighted } from './sighting.js';
import { docksOf, planShip, colonyPoint, freeMooring, cruiseFloor } from './ships.js';

// Note: the dock kit is spent on the airdock itself; the start kit lands in the new island's stock.
export const COLONY = {
  dockKit: { plank: 8, stone: 4 },
  startKit: { wood: 6, stone: 2, plank: 4 },
  minFolk: 6, keepAdults: 2, seats: 6, retry: 90,
  // Note: a landing party: no dock kit, the rare island gets its free airdock; the crew stays as the outpost.
  party: { seats: 3, minFolk: 4, keepAdults: 2, kit: { wood: 4, stone: 1, plank: 2, fruit: 6 }, coupleOptional: true },
};
export const colonyKit = () => {
  const k = {};
  for (const part of [COLONY.dockKit, COLONY.startKit]) for (const g of Object.keys(part)) k[g] = (k[g] || 0) + part[g];
  return k;
};

const freeFolk = (f) => !f.queue && !f.link && !f.guestOf && !f.aboard && !f.visitor && !f.carry && (!f.task || !['sleep', 'pass', 'flee', 'trade', 'cross', 'festival', 'court'].includes(f.task.type));

// Note: one couple with up to three children and one single adult; the island keeps two adults. Null when no such party exists.
export function pickParty(world, isl) {
  const folk = world.folkOn(isl.id).filter(freeFolk);
  const byId = new Map(folk.map((f) => [f.id, f]));
  const adults = world.folkOn(isl.id).filter((f) => f.stage === 'adult');
  let best = null;
  for (const f of folk) {
    if (f.stage !== 'adult' || f.partner === null || f.partner === undefined || f.id > f.partner) continue;
    const m = byId.get(f.partner);
    if (!m || m.stage !== 'adult' || m.partner !== f.id) continue;
    const kids = folk.filter((c) => c.stage === 'child' && c.pars && (c.pars.includes(f.id) || c.pars.includes(m.id))).sort((a, b) => a.id - b.id).slice(0, 3);
    const single = folk.find((s) => s.stage === 'adult' && (s.partner === null || s.partner === undefined) && s.id !== f.id && s.id !== m.id);
    const crew = [f, m, ...kids, ...(single ? [single] : [])].slice(0, COLONY.seats);
    if (adults.length - crew.filter((c) => c.stage === 'adult').length < COLONY.keepAdults) continue;
    if (!best || crew.length > best.length) best = crew;
  }
  return best;
}

// Note: an island fit for a colony: revealed, awake, common, empty, no dock, nobody on the way.
function empty(world, isl) {
  return isl.revealed && !isl.rare && !isl.special && !isl.dormant && !isl.hasSettlers && !isl.spire
    && !world.folkOn(isl.id).length && !world.inboundTo(isl.id) && !live(isl, 'storehouse').length && !docksOf(isl).length
    && !world.ships.some((s) => s.to === isl.id && s.colony);
}

// Note: runs from worldTick; at most one colony flight is in the air, one try per source and target pair every COLONY.retry seconds.
export function planColony(world) {
  if (world.shipAuto === false || !world.known.has('navigation') || !tierAllows(world, 'colony')) return null;
  if (world.ships.some((s) => s.colony && s.state !== 'ground')) return null;
  const cool = world.colonyCool || (world.colonyCool = {});
  const kit = colonyKit();
  for (const s of idleHulls(world)) {
    const A = world.islands.get(s.from);
    if (!A || world.folkOn(A.id).length < COLONY.minFolk) continue;
    if (Object.keys(kit).some((g) => stockGet(A, g) < kit[g])) continue;
    const targets = [...world.islands.values()].filter((i) => empty(world, i) && !(cool[`${A.id}>${i.id}`] > world.time))
      .sort((a, b) => Math.hypot(a.wx - A.wx, a.wz - A.wz) - Math.hypot(b.wx - A.wx, b.wz - A.wz));
    const B = targets[0];
    if (!B) continue;
    const crew = pickParty(world, A);
    if (!crew) continue;
    cool[`${A.id}>${B.id}`] = world.time + COLONY.retry;
    if (!B.reach) world.planNow(B);
    const site = findSite(world, B, 'airdock', null);
    if (!site) continue;
    const ground = colonyPoint(B, site);
    if (!planShip(world, A, B, 'cargo', { dockFrom: s.dock, slotFrom: s.slot, self: s.id, ground })) continue;
    for (const g of Object.keys(kit)) A.stock[g] -= kit[g];
    for (const f of crew) {
      if (f.task) endTask(world, f, A);
      f.task = null; f.path = null; f.queue = null; f.home = -1; f.aboard = s.id;
    }
    s.colony = { crew: crew.map((f) => f.id), kit, site: { x: site.x, y: site.y, dir: site.dir, door: site.door } };
    s.to = B.id; s.cargo = {}; s.state = 'load'; s.t = 0; s.fails = 0;
    delete s.order;
    B.hasSettlers = true;
    world.emit({ type: 'colonystart', isl: A, to: B, ship: s });
    return s;
  }
  return null;
}

// Note: idle cargo hulls, those without a ledger order first, then by id; a flight takes over a pending order.
function idleHulls(world) {
  return world.ships.filter((s) => s.kind === 'cargo' && !s.colony && s.state === 'idle').sort((a, b) => (a.order ? 1 : 0) - (b.order ? 1 : 0) || a.id - b.id);
}

// Note: the crew of a landing party: the best volunteer (open explore need times wonder talent), the mate if free, then the next best; two adults always stay home.
export function pickCrew(world, isl) {
  const P = COLONY.party;
  const folk = world.folkOn(isl.id);
  const adults = folk.filter((f) => f.stage === 'adult');
  const free = adults.filter(freeFolk);
  const room = Math.min(P.seats, adults.length - P.keepAdults);
  if (folk.length < P.minFolk || room < 2 || free.length < 2) return null;
  const score = (f) => (1.1 - (f.needs ? f.needs.explore : 0.5)) * (f.talent ? f.talent.wonder : 1);
  const ranked = [...free].sort((a, b) => score(b) - score(a) || a.id - b.id);
  const crew = [ranked[0]];
  const mate = P.coupleOptional ? ranked.find((f) => f.id === ranked[0].partner) : null;
  if (mate) crew.push(mate);
  for (const f of ranked) if (crew.length < room && !crew.includes(f)) crew.push(f);
  return crew.slice(0, room);
}

// Note: rare islands nobody explored and nobody claimed, by their fixed slot; the Spire is no target.
function partyTargets(world) {
  const slots = rareSlots(world.seed);
  const out = [];
  for (const t of RARE_TRAITS) {
    const e = slots[t] && slots[t][0];
    if (!e) continue;
    const B = world.getIsland(e.gx, e.gz);
    if (!B.rareSlot || B.explored || B.hasSettlers || !B.rare || !B.rare.sites || !B.rare.sites.airdock || !isSighted(world, B)) continue;
    if (!B.reach) world.planNow(B);
    if (!airdockFeasible(world, B)) continue;
    if (world.folkOn(B.id).length || world.inboundTo(B.id) || world.ships.some((s) => s.to === B.id && s.colony)) continue;
    out.push(B);
  }
  return out;
}

// Note: test hook: the ids partyTargets would offer now.
export const partyTargetIds = (world) => partyTargets(world).map((i) => i.id);

// Note: runs from planFleet; the nearest unexplored rare island gets a hull with 2 to 3 adults and a small kit. One try per call, then the pair cools off.
export function planParty(world) {
  if (world.shipAuto === false || !world.known.has('navigation') || !tierAllows(world, 'colony')) return null;
  if (world.ships.some((s) => s.colony && s.state !== 'ground')) return null;
  const P = COLONY.party;
  const targets = partyTargets(world);
  if (!targets.length) return null;
  const cool = world.colonyCool || (world.colonyCool = {});
  const pairs = [];
  const seen = new Set();
  for (const s of idleHulls(world)) {
    const A = world.islands.get(s.from);
    if (!A || seen.has(A.id) || Object.keys(P.kit).some((g) => stockGet(A, g) < P.kit[g])) continue;
    seen.add(A.id);
    const crew = pickCrew(world, A);
    if (!crew) continue;
    for (const B of targets) if (!(cool[`${A.id}>${B.id}`] > world.time)) pairs.push({ s, A, B, crew, d: Math.hypot(B.gx - A.gx, B.gz - A.gz) });
  }
  pairs.sort((p, q) => p.d - q.d || (p.A.id < q.A.id ? -1 : p.A.id > q.A.id ? 1 : 0) || (p.B.id < q.B.id ? -1 : p.B.id > q.B.id ? 1 : 0));
  const pick = pairs[0];
  if (!pick) return null;
  const { s, A, B, crew } = pick;
  cool[`${A.id}>${B.id}`] = world.time + COLONY.retry;
  const pad = B.rare.sites.airdock;
  const ground = colonyPoint(B, pad);
  // Note: the target joins the clearance field for the test plan only; the real reveal follows once a path exists.
  B.revealed = true;
  const plan = planShip(world, A, B, 'cargo', { dockFrom: s.dock, slotFrom: s.slot, self: s.id, ground, floor: cruiseFloor() });
  B.revealed = false;
  if (!plan) return null;
  world.reveal(B);
  for (const g of Object.keys(P.kit)) A.stock[g] -= P.kit[g];
  for (const f of crew) {
    if (f.task) endTask(world, f, A);
    f.task = null; f.path = null; f.queue = null; f.home = -1; f.aboard = s.id;
  }
  s.colony = { crew: crew.map((f) => f.id), kit: { ...P.kit }, site: { x: pad.x, y: pad.y, dir: pad.dir | 0, door: { i: pad.x + 1, j: pad.y + 1 } }, party: true };
  s.to = B.id; s.cargo = {}; s.state = 'load'; s.t = 0; s.fails = 0;
  delete s.order;
  B.hasSettlers = true;
  world.emit({ type: 'colonystart', isl: A, to: B, ship: s, party: true });
  return s;
}

// Note: the hull touched down on bare ground: the family steps out, the kit becomes a dock site and a start stock.
export function colonyLanded(world, s) {
  const c = s.colony;
  const isl = world.islands.get(s.from);
  if (!c || !isl) return;
  if (c.party) { partyLanded(world, s, isl); return; }
  if (!isl.reach) world.planNow(isl);
  const sp = c.site;
  const b = startBuilding(world, isl, 'airdock', sp.x, sp.y, { dir: sp.dir, door: sp.door });
  s.dock = isl.buildings.indexOf(b);
  for (const g of Object.keys(COLONY.startKit)) stockAdd(isl, g, COLONY.startKit[g]);
  const byId = new Map(world.folk.map((f) => [f.id, f]));
  let first = null;
  for (const id of c.crew) {
    const f = byId.get(id);
    if (!f) continue;
    delete f.aboard;
    f.isle = isl.id; f.x = sp.door.i + 0.5 + ((f.id % 5) - 2) * 0.12; f.z = sp.door.j + 0.5 + ((f.id % 3) - 1) * 0.15;
    f.task = null; f.path = null; f.queue = null; f.home = -1; f.homelessT = 0; f.anim = 'idle';
    first = first || f;
    world.emit({ type: 'settled', isl, f });
  }
  if (first) world.discover(isl, first);
  world.emit({ type: 'colonyland', isl, ship: s });
  delete s.colony.kit;
}

// Note: the party steps out on the airdock pad: the island is discovered and wakes with its free airdock, the crew stays, the hull moors.
function partyLanded(world, s, isl) {
  const c = s.colony;
  awakenIsland(world, isl);
  world.planNow(isl);
  const dock = docksOf(isl)[0];
  const door = dock && dock.b.door ? dock.b.door : c.site.door;
  const spot = nearestWalkable(isl, door.i, door.j, null, 6) || [door.i, door.j];
  for (const g of Object.keys(c.kit || {})) stockAdd(isl, g, c.kit[g]);
  const byId = new Map(world.folk.map((f) => [f.id, f]));
  let first = null;
  for (const id of c.crew) {
    const f = byId.get(id);
    if (!f) continue;
    delete f.aboard;
    f.isle = isl.id; f.x = spot[0] + 0.5 + ((f.id % 5) - 2) * 0.12; f.z = spot[1] + 0.5 + ((f.id % 3) - 1) * 0.15;
    f.task = null; f.path = null; f.queue = null; f.home = -1; f.homelessT = 0; f.anim = 'idle';
    first = first || f;
    world.emit({ type: 'settled', isl, f });
  }
  if (first) { world.discover(isl, first); first.needs.explore = 1; }
  // Note: the hull moors at once when the island has a dock; else it waits on the pad.
  const m = freeMooring(world, isl, s.id);
  if (m) { s.dock = m.k; s.slot = m.slot; }
  world.emit({ type: 'colonyland', isl, ship: s });
  delete s.colony.kit;
}

// Note: a colony flight that found no clear path: the family steps back out at home and the kit returns to the shelf.
export function colonyAborted(world, s) {
  const c = s.colony;
  const A = world.islands.get(s.from);
  if (!c || !A) return;
  const byId = new Map(world.folk.map((f) => [f.id, f]));
  for (const id of c.crew) { const f = byId.get(id); if (f) delete f.aboard; }
  for (const g of Object.keys(c.kit || {})) stockAdd(A, g, c.kit[g]);
  const t = world.islands.get(s.to);
  if (t && !world.folkOn(t.id).length) t.hasSettlers = false;
  delete s.colony;
}
