// Note: each lawman's own map of friendly, cleared and hostile zones, and the posts the zone orders choose on it.

import { GRID_W, GRID_H, FLOOR_H, EYE_Z } from './config.js';
import { angleDiff, dist } from './rand.js';
import { flightOf, findPath } from './nav.js';
import { solidAt, tileAt, mapRev } from './map.js';
import { T, TILE_PROPS } from './tiles.js';
import { seenClear, stampClear } from './mind.js';
import { castRay, canSeePoint3 } from './los.js';
import { knownLawmen } from './tactical-memory.js';

export const ZONE_SIZE = 5;
// Note: an enclosed space of up to this many cells is one zone, and larger open ground is cut into ZONE_SIZE squares.
const ROOM_MAX = 150;
// Note: actors carry their floor as floor, points as f, and snapshots both.
export const floorOf = (p) => p.floor ?? p.f;
const cellIndex = (f, x, y) => (f * GRID_H + y) * GRID_W + x;
const opening = (t) => t === T.DOOR || t === T.WINDOW;
const layoutCache = new WeakMap();
const squareKey = (f, x, y) => `${f}:${Math.floor(x / ZONE_SIZE)}:${Math.floor(y / ZONE_SIZE)}`;

// Note: the zones of a map, each with its cells, bounds and centre, and the zones each one opens onto, found once per map.
function layoutOf(map) {
  const cached = layoutCache.get(map);
  if (cached?.rev === mapRev(map)) return cached;
  const zones = new Map();
  const keyAt = new Map();
  const add = (key, f, x, y) => {
    let z = zones.get(key);
    if (!z) zones.set(key, (z = { key, f, cells: [], x0: x, y0: y, x1: x, y1: y, open: key === squareKey(f, x, y) }));
    z.cells.push({ x, y });
    Object.assign(z, { x0: Math.min(z.x0, x), y0: Math.min(z.y0, y), x1: Math.max(z.x1, x), y1: Math.max(z.y1, y) });
    keyAt.set(cellIndex(f, x, y), key);
  };
  const inside = (x, y) => x >= 0 && y >= 0 && x < map.W && y < map.H;
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let f = 0; f < map.floors.length; f++) {
    const room = (x, y) => inside(x, y) && !TILE_PROPS[tileAt(map, f, x, y)].solid && !opening(tileAt(map, f, x, y));
    const done = new Set();
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      if (!room(x, y) || done.has(cellIndex(f, x, y))) continue;
      const part = [{ x, y }];
      done.add(cellIndex(f, x, y));
      for (let i = 0; i < part.length; i++) for (const [dx, dy] of steps) {
        const n = { x: part[i].x + dx, y: part[i].y + dy };
        if (room(n.x, n.y) && !done.has(cellIndex(f, n.x, n.y))) { done.add(cellIndex(f, n.x, n.y)); part.push(n); }
      }
      const enclosed = part.length <= ROOM_MAX;
      for (const c of part) add(enclosed ? `${f}:r${x}_${y}` : squareKey(f, c.x, c.y), f, c.x, c.y);
    }
    // Note: a door or window joins the zone on one side of it.
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      if (!opening(tileAt(map, f, x, y))) continue;
      const side = steps.map(([dx, dy]) => keyAt.get(cellIndex(f, x + dx, y + dy))).find(Boolean);
      if (side) add(side, f, x, y);
    }
  }
  const links = new Map([...zones.keys()].map((k) => [k, new Set()]));
  const link = (a, b) => { if (a && b && a !== b) { links.get(a).add(b); links.get(b).add(a); } };
  for (const z of zones.values()) for (const { x, y } of z.cells) for (const [dx, dy] of steps) link(z.key, keyAt.get(cellIndex(z.f, x + dx, y + dy)));
  for (let f = 0; f < map.floors.length; f++) for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    const fl = tileAt(map, f, x, y) === T.STAIRS && flightOf(map, f, x, y);
    if (fl && fl.lo === f) link(keyAt.get(cellIndex(f, fl.foot.x, fl.foot.y)) ?? keyAt.get(cellIndex(f, x, y)), keyAt.get(cellIndex(fl.hi, fl.head.x, fl.head.y)));
  }
  for (const z of zones.values()) Object.assign(z, { cx: (z.x0 + z.x1 + 1) / 2, cy: (z.y0 + z.y1 + 1) / 2 });
  const layout = { zones, keyAt, links, rev: mapRev(map) };
  layoutCache.set(map, layout);
  return layout;
}

// Note: the zone a point lies in, or the square round it where no zone has a cell there.
export function zoneAt(sim, p) {
  const f = floorOf(p);
  const layout = layoutOf(sim.map);
  const key = layout.keyAt.get(cellIndex(f, Math.floor(p.x), Math.floor(p.y))) ?? squareKey(f, p.x, p.y);
  return layout.zones.get(key) ?? { key, f, cells: [], x0: Math.floor(p.x), y0: Math.floor(p.y), x1: Math.floor(p.x), y1: Math.floor(p.y), cx: p.x, cy: p.y, open: true };
}
const zoneByKey = (sim, key) => layoutOf(sim.map).zones.get(key);
export const sameZone = (sim, p, q) => zoneAt(sim, p).key === zoneAt(sim, q).key;
export const zonesOf = (sim) => [...layoutOf(sim.map).zones.values()];
const friendly = (map, z) => map.get(z.key)?.side === 'friendly';
// Note: cleared means swept without a stationed friendly, until a hostile is seen in it.
const cleared = (map, z) => map.get(z.key)?.side === 'cleared';
export const safe = (map, z) => friendly(map, z) || cleared(map, z);
// Note: the share of a zone's free cells a deputy has seen clear before the zone counts as looked over.
const SURVEYED = 0.6;
// Note: extra metres a trip up or down a flight costs when ranking zones on the other floor.
const STAIR_COST = 4;
// Note: zones are ranked by how far they lie off the way the sheriff faces in steps of this many radians.
const FACING_STEP = 0.5;
// Note: another lawman seen stationed in a zone this long has swept it, and a lawman looks round every LOOK_EVERY seconds up to LOOK_RANGE metres.
const WATCHED_SWEEP = 3;
const LOOK_EVERY = 0.5;
const LOOK_RANGE = 9;
// Note: a stationed guard who stops covering the approaches keeps the zone friendly this long before it falls.
const COVER_GRACE = 3;
// Note: a post closer than a body's width to a lawman is refused.
const BODY_GAP = 1.2;
// Note: until the sheriff is known down a push stays within this many ZONE_SIZE steps of his last perceived spot on foot (item 478).
const PUSH_REACH = 3;
// Note: metres from a remembered teammate within which a push zone counts as supported.
export const TETHER = 10;
// Note: a fall back ranks posts by their distance from threats up to this many metres.
const GAP_CAP = 30;

export function initialZones(sim, lawmen) {
  const map = new Map();
  for (const a of lawmen) {
    const key = zoneAt(sim, a).key;
    const old = map.get(key);
    map.set(key, { side: 'friendly', t: 0, held: 0, guards: [...(old?.guards || []), { id: a.id, x: a.x, y: a.y, f: a.floor }] });
  }
  return map;
}

const adjacent = (sim, z) => [...(layoutOf(sim.map).links.get(z.key) ?? [])].map((key) => zoneByKey(sim, key));

// Note: a stationed guard controls a zone when he watches one of its approaches, or it has none.
function covers(sim, actor, zone, map, side) {
  const approaches = adjacent(sim, zone).filter((n) => (side === 'friendly' ? !safe(map, n) : friendly(map, n)));
  return !approaches.length || approaches.some((n) => !!visibleZonePoint(sim, n, { ...actor.eye, f: actor.floor, elev: actor.elev, stance: actor.stance },
    (p) => Math.abs(angleDiff(actor.facing, Math.atan2(p.y - actor.eye.y, p.x - actor.eye.x))) <= sim.fovOf(actor).half));
}

function surveyed(sim, mind, z) {
  let cells = 0;
  let seen = 0;
  for (const { x, y } of z.cells) {
    if (solidAt(sim.map, z.f, x, y)) continue;
    cells++;
    if (seenClear(mind, z.f, x, y)) seen++;
  }
  return cells > 0 && seen / cells >= SURVEYED;
}

export function observeZones(sim, observer) {
  const map = observer.ai.zones;
  const people = [observer, ...sim.actors.filter((a) => a !== observer && !a.withdrawn && sim.sees(observer, a))];
  const active = people.filter((a) => a.status === 'ok' && !a.passive && !a.surrendered &&
    (a.role === 'sheriff' || a.role === 'deputy' || a.role === 'hostile'));
  const zones = new Map(map);
  for (const actor of active) zones.set(zoneAt(sim, actor).key, map.get(zoneAt(sim, actor).key) || { side: 'hostile' });
  for (const [key, old] of zones) {
    const z = zoneByKey(sim, key);
    if (!z) continue;
    const occupants = active.filter((a) => zoneAt(sim, a).key === key);
    const stationed = occupants.filter((a) => a.mode === 'idle');
    const guards = stationed.filter((a) => a.role !== 'hostile' && covers(sim, a, z, map, 'friendly'));
    const enemies = stationed.filter((a) => a.role === 'hostile');
    const enemyControl = enemies.some((a) => covers(sim, a, z, map, 'hostile'));
    const friendlyControl = guards.length > 0;
    // Note: a guard has left only when he is seen elsewhere or his empty post is seen.
    const here = (g) => occupants.some((a) => a.id === g.id);
    const gone = old.guards?.some((g) => !here(g) && (people.some((a) => a.id === g.id) ||
      (g.f === observer.floor && sim.pointVisible(observer, g.x, g.y))));
    // Note: a guard standing in the zone without covering its approaches loses it only after the grace.
    const lapsed = !friendlyControl && old.guards?.some((g) => occupants.some((a) => a.id === g.id && a.mode === 'idle')) &&
      sim.time - (old.held ?? 0) >= COVER_GRACE;
    if (!occupants.length && !gone) continue;
    const hostileSeen = occupants.some((a) => a.role === 'hostile');
    const mixed = hostileSeen && occupants.some((a) => a.role !== 'hostile');
    // Note: a guard leaving a zone he swept leaves it cleared, unless a hostile has been seen in it since.
    const swept = old.cleared != null && !(old.hostileAt > old.cleared);
    const spoiled = swept && hostileSeen;
    const fallen = swept ? 'cleared' : 'hostile';
    const side = mixed ? (friendlyControl && !enemyControl ? 'friendly' : 'hostile') :
      friendlyControl ? 'friendly' : enemies.length || spoiled ? 'hostile' : gone || lapsed ? fallen : old.side;
    if (!map.has(key) && side === 'hostile') continue;
    const keep = side === 'friendly' && !friendlyControl;
    map.set(key, { side, t: sim.time, held: friendlyControl ? sim.time : old.held, cleared: side === 'hostile' ? undefined : old.cleared,
      hostileAt: hostileSeen ? sim.time : old.hostileAt,
      guards: keep ? old.guards || [] : guards.map((a) => ({ id: a.id, x: a.x, y: a.y, f: a.floor })) });
  }
  // Note: a friendly in a zone sweeps it once the zone is looked over or another lawman has been seen stationed there a while.
  const watched = (observer.ai.watched ||= new Map());
  const stationed = new Set();
  for (const a of active) {
    if (a.role === 'hostile') continue;
    const z = zoneAt(sim, a);
    const mark = `${z.key}#${a.id}`;
    if (a !== observer && a.mode === 'idle') {
      stationed.add(mark);
      if (!watched.has(mark)) watched.set(mark, sim.time);
    }
    const long = sim.time - (watched.get(mark) ?? Infinity) >= WATCHED_SWEEP;
    if (active.some((h) => h.role === 'hostile' && zoneAt(sim, h).key === z.key) || !(long || surveyed(sim, observer.ai.mind, z))) continue;
    clearZone(sim, observer, z);
  }
  for (const mark of watched.keys()) if (!stationed.has(mark)) watched.delete(mark);
}

// Note: a lawman's look round every LOOK_EVERY seconds stamps what he sees clear and updates his zone map.
export function lookOver(sim, a) {
  if (sim.time < (a.ai.lookAt ?? 0)) return;
  a.ai.lookAt = sim.time + LOOK_EVERY;
  if (a.status === 'ok') stampClear(a.ai.mind, a.floor, sim.visibleCells(a, LOOK_RANGE), sim.time);
  observeZones(sim, a);
}

// Note: a swept zone without a known hostile is marked cleared, or stays friendly while guarded.
export function clearZone(sim, actor, z) {
  const map = actor.ai.zones;
  const key = z.key;
  if (actor.ai.mind.threats.some((p) => zoneAt(sim, p).key === key)) return;
  const old = map.get(key);
  map.set(key, { ...old, side: old?.side === 'friendly' ? 'friendly' : 'cleared', t: sim.time, cleared: sim.time, guards: old?.guards || [] });
}

// Note: a loud order reports the caller's map to the recipients who heard it.
export function shareZones(from, to) {
  for (const [key, value] of from.ai.zones) {
    const mine = to.ai.zones.get(key);
    if ((mine?.t ?? -Infinity) >= value.t) continue;
    // Note: a sweep on either map survives the merge until a hostile seen in the zone since spoils it.
    const swept = Math.max(value.cleared ?? -Infinity, mine?.cleared ?? -Infinity);
    const hostileAt = Math.max(value.hostileAt ?? -Infinity, mine?.hostileAt ?? -Infinity);
    const holds = swept > hostileAt;
    to.ai.zones.set(key, { ...value, side: value.side === 'hostile' && holds ? 'cleared' : value.side,
      cleared: holds ? swept : undefined, hostileAt: Number.isFinite(hostileAt) ? hostileAt : undefined });
  }
}

function zonePoint(sim, z, near) {
  let best = null, score = Infinity;
  for (const { x, y } of z.cells) {
    if (solidAt(sim.map, z.f, x, y)) continue;
    const d = Math.hypot(x + 0.5 - near.x, y + 0.5 - near.y);
    if (d < score) { score = d; best = { x: x + 0.5, y: y + 0.5, f: z.f }; }
  }
  return best;
}

function visibleZonePoint(sim, z, from, accept = () => true) {
  let best = null;
  for (const { x, y } of z.cells) {
    if (solidAt(sim.map, z.f, x, y)) continue;
    const p = { x: x + 0.5, y: y + 0.5, f: z.f };
    const clear = from.f === z.f ? castRay(sim.map, z.f, from.x, from.y, p.x, p.y).clear :
      canSeePoint3(sim.map, sim.shaft, from, from.f * FLOOR_H + (from.elev || 0) + EYE_Z[from.stance || 'stand'], 0,
        { range: 50, near: 0, half: Math.PI }, p.x, p.y, z.f * FLOOR_H + EYE_Z.stand);
    if (accept(p) && (!best || dist(from, p) < dist(from, best)) && clear) best = p;
  }
  return best;
}

const rectDistance = (z, p) => Math.hypot(Math.max(z.x0 - p.x, 0, p.x - (z.x1 + 1)), Math.max(z.y0 - p.y, 0, p.y - (z.y1 + 1)));

const flightCache = new WeakMap();
// Note: the flights of a map, found once per map.
export function flightsOf(map) {
  const cached = flightCache.get(map);
  if (cached?.rev === mapRev(map)) return cached.flights;
  const out = [];
  for (let f = 0; f < map.floors.length; f++) for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (tileAt(map, f, x, y) === T.STAIRS) out.push(flightOf(map, f, x, y));
  flightCache.set(map, { rev: mapRev(map), flights: out.filter((fl, i) => fl && out.findIndex((o) => o && o.lo === fl.lo && o.sy === fl.sy && o.foot.x === fl.foot.x) === i) });
  return flightCache.get(map).flights;
}

// Note: a zone on another floor is as far as the walk to a flight leaving this floor toward it, the stair cost per storey and the walk from the far landing; storeys in between are taken as a straight climb.
function viaStairs(flights, from, z) {
  let best = GRID_W * 2;
  const f = floorOf(from);
  const up = z.f > f;
  const storeys = Math.abs(z.f - f);
  for (const fl of flights) {
    if (fl.lo !== (up ? f : f - 1)) continue;
    const [start, end] = up ? [fl.foot, fl.head] : [fl.head, fl.foot];
    best = Math.min(best, Math.hypot(start.x + 0.5 - from.x, start.y + 0.5 - from.y) + STAIR_COST * storeys + rectDistance(z, { x: end.x + 0.5, y: end.y + 0.5 }));
  }
  return best;
}

const reach = (flights, from, z) => (z.f === floorOf(from) ? rectDistance(z, from) : viaStairs(flights, from, z));

// Note: the deputies ahead of this one in party order, which every teammate knows, whatever their state.
export const elders = (sim, a) => sim.deputies.slice(0, Math.max(0, sim.deputies.indexOf(a)));

// Note: the sheriff's estimated spot until he is known down, the deputy himself and the other fighting lawmen he knows of.
function friendsOf(actor, origin) {
  const at = (p) => ({ x: p.x, y: p.y, f: floorOf(p) });
  const others = knownLawmen(actor).filter((p) => p.id !== origin.id && !p.passive);
  return [...(actor.ai.autonomous ? [] : [at(origin)]), at(actor), ...others.map(at)];
}

// Note: how far a zone lies from the friendlies.
const frontOf = (flights, friends, z) => Math.min(...friends.map((p) => reach(flights, p, z)), Infinity);

// Note: a senior seen standing in, or walking into, a zone not yet safe on this deputy's map is taken to be pushing into it.
function claimedZones(sim, map, senior) {
  const out = new Set();
  for (const d of senior) {
    const m = d.moveDesired;
    const len = m ? Math.hypot(m.x, m.y) : 0;
    const spots = [d, ...(len > 0.1 ? [{ x: d.x + (m.x / len) * ZONE_SIZE / 2, y: d.y + (m.y / len) * ZONE_SIZE / 2, f: d.floor }] : [])];
    for (const z of spots.map((p) => zoneAt(sim, p))) if (z.cells.length && !safe(map, z)) out.add(z.key);
  }
  return out;
}

// Note: Push takes hostile zones on the front line of the ground linking the friendlies.
function pushPlan(c) {
  const friends = friendsOf(c.actor, c.origin);
  const seeds = new Set(friends.map((p) => zoneAt(c.sim, p).key));
  const region = new Set(seeds);
  const queue = [...seeds].map((key) => zoneByKey(c.sim, key)).filter(Boolean);
  for (const z of queue) for (const n of adjacent(c.sim, z)) if (!region.has(n.key) && safe(c.map, n)) { region.add(n.key); queue.push(n); }
  const claimed = claimedZones(c.sim, c.map, c.senior);
  const originFloor = floorOf(c.origin);
  const down = !!c.actor.ai.autonomous;
  // Note: a push searches outward from a lost target's spot (item 427), or on its own judgment from the nearest believed hostile (item 479).
  const nearestThreat = down ? [...c.actor.ai.mind.threats].sort((p, q) => dist(c.actor, p) - dist(c.actor, q))[0] : null;
  const lostAt = c.actor.ai.searchFrom ?? nearestThreat;
  const lost = lostAt && zoneAt(c.sim, lostAt);
  // Note: each zone of the trail, newest last, with the unsafe zones it opens onto through safe ground off the rest of the trail.
  const keys = c.actor.ai.order?.trail ?? [zoneAt(c.sim, c.actor).key];
  const branchOf = (key) => {
    const out = new Set();
    const seen = new Set([key]);
    const queue = [zoneByKey(c.sim, key)].filter(Boolean);
    for (const z of queue) for (const n of adjacent(c.sim, z)) {
      if (seen.has(n.key)) continue;
      seen.add(n.key);
      if (!safe(c.map, n)) out.add(n.key);
      else if (!keys.includes(n.key)) queue.push(n);
    }
    return out;
  };
  const trail = keys.map(branchOf);
  const depthFirst = (z) => {
    for (let i = trail.length - 1; i >= 0; i--) if (trail[i].has(z.key)) return trail.length - 1 - i;
    return trail.length;
  };
  const fromSheriff = walkDistances(c.sim, [c.origin]);
  const walk = (z) => Math.round((fromSheriff.get(z.key) ?? Infinity) / ZONE_SIZE);
  const near = (z) => down || walk(z) <= PUSH_REACH;
  // Note: the fighting teammates he last saw on their feet, as remembered; the sheriff is the push bound's, not the tether's.
  const mates = knownLawmen(c.actor).filter((p) => p.role === 'deputy' && p.id !== c.actor.id && !p.passive && !p.carried);
  const tethered = (z) => !mates.length || mates.some((p) => floorOf(p) === z.f && rectDistance(z, p) <= TETHER);
  return {
    zones: c.all.filter((z) => !safe(c.map, z) && !seeds.has(z.key) && near(z) && adjacent(c.sim, z).some((n) => region.has(n.key))),
    rank: (z) => ({
      // Note: split but tethered: a zone within support distance of a teammate comes before any other, so nobody pushes alone while a teammate is near.
      tether: tethered(z) ? 0 : 1,
      // Note: among equal branches one on the sheriff's floor comes first when he is on another.
      toward: originFloor !== c.actor.floor && z.f === originFloor ? 0 : 1,
      ring: !lost ? 0 : z.f === lost.f ? Math.round(Math.hypot(z.cx - lost.cx, z.cy - lost.cy) / ZONE_SIZE) : Infinity,
      claimed: claimed.has(z.key) ? 1 : 0,
      front: Math.round(frontOf(c.flights, friends, z) / ZONE_SIZE),
      next: depthFirst(z),
      // Note: a room is pushed before open ground, so the building is cleared before the yard round it.
      open: z.open ? 1 : 0,
      close: down ? 0 : walk(z),
      // Note: the way the sheriff faces is the way the party is heading.
      ahead: down || c.origin.facing == null ? 0 : Math.round(Math.abs(angleDiff(c.origin.facing, Math.atan2(z.cy - c.origin.y, z.cx - c.origin.x))) / FACING_STEP),
    }),
    // Note: depth first along the trail, then rooms first, then nearest the sheriff on foot and the way he faces.
    compare: (a, b) => a.tether - b.tether || a.ring - b.ring || a.claimed - b.claimed || a.next - b.next || a.toward - b.toward || a.open - b.open || a.close - b.close || a.ahead - b.ahead || a.front - b.front || a.zoneDistance - b.zoneDistance ||
      a.originDistance - b.originDistance || a.repeated - b.repeated || a.travel - b.travel,
    route: (p, post) => seeds.has(zoneAt(c.sim, p).key) || sameZone(c.sim, p, post),
  };
}

// Note: a window costs this many steps more than a door to walk through, since it has to be climbed.
const WINDOW_STEPS = 6;

// Note: each zone's walking distance in steps from the nearest of the starts, doors open and windows climbed, over both floors.
function walkDistances(sim, starts) {
  const cell = cellIndex;
  const cost = (f, x, y) => {
    if (x < 0 || y < 0 || x >= sim.map.W || y >= sim.map.H) return Infinity;
    const t = tileAt(sim.map, f, x, y);
    return t === T.WINDOW ? 1 + WINDOW_STEPS : t === T.DOOR || !TILE_PROPS[t].solid ? 1 : Infinity;
  };
  const links = new Map();
  for (const fl of flightsOf(sim.map)) {
    links.set(cell(0, fl.foot.x, fl.foot.y), { f: 1, x: fl.head.x, y: fl.head.y });
    links.set(cell(1, fl.head.x, fl.head.y), { f: 0, x: fl.foot.x, y: fl.foot.y });
  }
  const best = new Map();
  // Note: steps are small whole numbers, so a queue per distance gives the shortest walks in order.
  const buckets = [starts.map((p) => ({ f: floorOf(p) ?? 0, x: Math.floor(p.x), y: Math.floor(p.y) }))];
  for (let d = 0; d < buckets.length; d++) for (const q of buckets[d] ?? []) {
    if (best.has(cell(q.f, q.x, q.y))) continue;
    best.set(cell(q.f, q.x, q.y), { ...q, d });
    const next = [[q.x + 1, q.y], [q.x - 1, q.y], [q.x, q.y + 1], [q.x, q.y - 1]].map(([x, y]) => ({ f: q.f, x, y }));
    if (links.has(cell(q.f, q.x, q.y))) next.push(links.get(cell(q.f, q.x, q.y)));
    for (const n of next) {
      const step = cost(n.f, n.x, n.y);
      if (step === Infinity || best.has(cell(n.f, n.x, n.y))) continue;
      (buckets[d + step] ||= []).push(n);
    }
  }
  const zones = new Map();
  for (const q of best.values()) {
    const key = zoneAt(sim, q).key;
    zones.set(key, Math.min(zones.get(key) ?? Infinity, q.d));
  }
  return zones;
}

// Note: whether a point lies within the push bound round the sheriff's last perceived spot (item 478).
export function inPushReach(sim, origin, p) {
  return Math.round((walkDistances(sim, [origin]).get(zoneAt(sim, p).key) ?? Infinity) / ZONE_SIZE) <= PUSH_REACH;
}

const entryCache = new WeakMap();
// Note: each zone's walking distance from the party's entry, so the zones form a graph leading back to where the party came in.
function entryDistances(sim) {
  const starts = sim.house.spawn.slots;
  const cached = entryCache.get(sim.map);
  if (cached?.starts === starts && cached.rev === mapRev(sim.map)) return cached.zones;
  const zones = walkDistances(sim, starts);
  entryCache.set(sim.map, { starts, zones, rev: mapRev(sim.map) });
  return zones;
}

// Note: Fall back retreats to safe zones nearer the entry or farther from known threats than his own.
function fallbackPlan(c) {
  const back = entryDistances(c.sim);
  const toEntry = (z) => back.get(z.key) ?? Infinity;
  const threats = c.actor.ai.mind.threats;
  const threatGap = (p) => Math.min(GAP_CAP, ...threats.filter((t) => t.f === floorOf(p)).map((t) => dist(t, p)));
  const centre = (z) => ({ x: z.cx, y: z.cy, f: z.f });
  const here = zoneAt(c.sim, c.actor);
  const deeper = (z) => toEntry(z) < toEntry(here) || threatGap(centre(z)) > threatGap(centre(here));
  return {
    zones: c.all.filter((z) => safe(c.map, z) && z.key !== here.key && deeper(z)),
    rank: (z) => ({ back: toEntry(z) }),
    post: (p, hostile) => {
      const fromThreats = Math.round(threatGap(p));
      return { fromThreats, gap: Math.min(fromThreats, Math.round(Math.min(GAP_CAP, ...hostile.map((n) => rectDistance(n, p))))) };
    },
    // Note: the post farthest from both known threats and hostile zones wins, then the one farthest from threats, then the one nearest the entry.
    compare: (a, b) => b.gap - a.gap || b.fromThreats - a.fromThreats || a.back - b.back || b.coverage - a.coverage || a.repeated - b.repeated || a.travel - b.travel,
  };
}

const PLANS = {
  push: pushPlan,
  fallback: fallbackPlan,
  // Note: Hold defends the friendly zone nearest the deputy on his own map.
  hold: (c) => ({
    zones: c.all.filter((z) => friendly(c.map, z)),
    // Note: an arc a senior in sight already faces comes after a fresh one, so teammates holding together watch different approaches (item 421).
    compare: (a, b) => a.zoneDistance - b.zoneDistance || a.repeated - b.repeated || b.coverage - a.coverage || a.travel - b.travel,
  }),
  // Note: Cover takes a friendly zone on the boundary, as near the sheriff as it can.
  cover: (c) => ({
    zones: c.all.filter((z) => friendly(c.map, z) && c.boundary(z)),
    compare: (a, b) => a.originDistance - b.originDistance || b.coverage - a.coverage || a.repeated - b.repeated || a.travel - b.travel,
  }),
};

export function chooseZonePost(sim, actor, kind, origin) {
  const map = actor.ai.zones;
  const senior = elders(sim, actor).filter((d) => d.status === 'ok' && !d.passive && d.floor === actor.floor && sim.sees(actor, d));
  const c = { sim, actor, map, origin, senior, all: zonesOf(sim), flights: flightsOf(sim.map), boundary: (z) => adjacent(sim, z).some((n) => !safe(map, n)) };
  const plan = PLANS[kind](c);
  // Note: no post within a body's width of the sheriff or another lawman, seen now or remembered.
  const bodies = [...(origin !== actor ? [origin] : []), ...sim.lawmen.filter((o) => o !== actor && o.status === 'ok' && !o.withdrawn && sim.sees(actor, o)),
    ...knownLawmen(actor)];
  const half = sim.fovOf(actor).half;
  const posts = [];
  for (const z of plan.zones) {
    const hostile = adjacent(sim, z).filter((n) => !safe(map, n));
    const zoneRank = { zoneDistance: reach(c.flights, actor, z), ...plan.rank?.(z) };
    for (const { x, y } of z.cells) {
      if (solidAt(sim.map, z.f, x, y)) continue;
      const p = { x: x + 0.5, y: y + 0.5, f: z.f };
      if (bodies.some((o) => floorOf(o) === p.f && dist(o, p) < BODY_GAP)) continue;
      const targets = hostile.map((n) => zonePoint(sim, n, p)).filter(Boolean);
      const bearings = hostile.map((n) => visibleZonePoint(sim, n, p)).filter(Boolean).map((t) => Math.atan2(t.y - p.y, t.x - p.x));
      const arcs = [...bearings];
      for (let i = 0; i < bearings.length; i++) for (let j = i + 1; j < bearings.length; j++) arcs.push(bearings[i] + angleDiff(bearings[i], bearings[j]) / 2);
      if (!arcs.length) arcs.push(targets.length ? Math.atan2(targets[0].y - p.y, targets[0].x - p.x) : actor.facing);
      const postRank = plan.post?.(p, hostile);
      for (const arc of arcs) {
        posts.push({ ...p, arc, ...zoneRank, ...postRank, coverage: bearings.filter((b) => Math.abs(angleDiff(arc, b)) <= half).length,
          travel: dist(actor, p), originDistance: dist(p, origin), repeated: senior.some((d) => Math.abs(angleDiff(d.facing, arc)) < 0.6) ? 1 : 0 });
      }
    }
  }
  posts.sort(plan.compare);
  const start = { x: actor.x, y: actor.y, f: actor.floor };
  const abandoned = actor.ai.abandonedGoal;
  let fallback = null;
  for (const post of posts) {
    if (abandoned && sim.time < abandoned.until && dist(abandoned, post) < 1) continue;
    const path = findPath(sim.map, start, post, { windows: true });
    if (!path) continue;
    if (path.every((p) => safe(map, zoneAt(sim, p)) || sameZone(sim, p, start) || !!plan.route?.(p, post))) return post;
    // Note: a push goes on into unknown ground even when the only way runs through another unknown zone.
    if (kind === 'push') fallback ??= post;
  }
  return fallback;
}
