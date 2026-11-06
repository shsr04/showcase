// Note: the council knows a rare island only once somebody has seen it; sim only, no rendering.
// Note: sources: a hull passing close, a visitor's tale, a lookout on a settled neighbour, the Ambassador, the first charts.

import { rareSlots, RARE_TRAITS } from './rareisles.js';

export const SIGHT = { hullRange: 50, lookoutRing: 1 };

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Note: the six fixed rare islands of this seed, by id; the Spire is no target.
export function rareIslands(world) {
  const slots = rareSlots(world.seed);
  const out = [];
  for (const t of RARE_TRAITS) {
    const e = slots[t] && slots[t][0];
    if (e) out.push(world.getIsland(e.gx, e.gz));
  }
  return out.sort(byId);
}

// Note: a revealed island counts as seen, so fixtures and old reveal paths keep working.
export function isSighted(world, isl) {
  return !!isl && (isl.revealed || (world.sighted && world.sighted.has(isl.id)));
}

export function sight(world, isl) {
  if (!world.sighted) world.sighted = new Set();
  if (!isl || isSighted(world, isl)) return false;
  world.sighted.add(isl.id);
  world.emit({ type: 'sighted', isl });
  return true;
}

// Note: a trader, explorer or frigate names the unsighted rare island nearest to where it landed.
export function sightByTale(world, from) {
  if (!from) return null;
  const left = rareIslands(world).filter((i) => !isSighted(world, i));
  left.sort((a, b) => Math.hypot(a.wx - from.wx, a.wz - from.wz) - Math.hypot(b.wx - from.wx, b.wz - from.wz) || byId(a, b));
  return left[0] && sight(world, left[0]) ? left[0] : null;
}

// Note: runs from worldTick; hulls in the air and settled neighbours sight the rare islands near them.
export function sightingTick(world) {
  const left = rareIslands(world).filter((i) => !isSighted(world, i));
  if (!left.length) return;
  // Note: with navigation known and nothing sighted yet, the navigators chart the rare island nearest home.
  if (left.length === rareIslands(world).length && world.known && world.known.has('navigation')) {
    const home = world.islands.get('0,0');
    if (home) { sightByTale(world, home); return; }
  }
  const settled = [...world.islands.values()].filter((i) => i.revealed && !i.rare && (i.explored || i.hasSettlers)).sort(byId);
  for (const B of left) {
    const look = settled.some((i) => Math.max(Math.abs(i.gx - B.gx), Math.abs(i.gz - B.gz)) <= SIGHT.lookoutRing);
    const pass = !look && (world.ships || []).some((s) => s.pos && s.state !== 'hold' && Math.hypot(s.pos.x - B.wx, s.pos.z - B.wz) <= SIGHT.hullRange);
    if (look || pass) sight(world, B);
  }
}

// Note: the Ambassador's gift: every rare island is named at once.
export function sightAll(world) {
  for (const B of rareIslands(world)) sight(world, B);
}
