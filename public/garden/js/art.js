// Note: prosperity rungs, archetypes and art pieces; pure sim, no rendering. Art pieces are 'art' buildings.

import { N } from './config.js';
import { cidx, inB } from './island.js';
import { builtOf, storehouse, stockGet, startBuilding, padCells } from './econ.js';

const R = Math.random;

// Note: score needed to reach each rung, indexed by the rung being left (rung 1 -> 2 needs RUNG_SCORE[1]).
export const RUNG_SCORE = [0, 14, 26, 36, 48];
export const ART_CAP = [0, 4, 8, 14, 20, 28];

export const ARCH = {
  weavers: { cost: { fiber: 2 }, prop: 'shuttle', skills: { fiber: 1, cloth: 2, rope: 0.5 }, traits: { meadow: 4, verdant: 3, orchard: 3 } },
  potters: { cost: { clay: 1 }, prop: 'paddle', skills: { clay: 1, brick: 2, bread: 0.3 }, traits: { clay: 6, arid: 3, fertile: 2 } },
  carvers: { cost: { stone: 2 }, prop: 'chisel', skills: { stone: 1, ore: 1, ingot: 2 }, traits: { cliffy: 4, crystal: 4, volcanic: 3 } },
  sailors: { cost: { wood: 1, fiber: 1 }, prop: 'hammer', skills: { fish: 1, plank: 1, rope: 1, wood: 0.3 }, traits: { tidal: 4, misty: 3, windy: 4 } },
};
export const ARCH_IDS = Object.keys(ARCH);

// Note: rung unlocks the kind; max is per island; mult scales the archetype material cost.
export const ART_KINDS = {
  doodle: { rung: 1, max: 4, mult: 0, prop: 'brush' },
  small: { rung: 2, max: 6, mult: 1 },
  statue: { rung: 3, max: 4, mult: 1.5 },
  mural: { rung: 3, max: 3, mult: 1.5 },
  arch: { rung: 4, max: 4, mult: 2 },
  fountain: { rung: 4, max: 2, mult: 2 },
  monument: { rung: 5, max: 2, mult: 3 },
  garden: { rung: 5, max: 6, mult: 2 },
};
const RIM_KINDS = new Set(['statue', 'mural', 'monument']);

export function artOf(isl) { return isl.buildings.filter((b) => b && !b.gone && b.id === 'art'); }

export function artCost(kind, arch) {
  const k = ART_KINDS[kind];
  const out = {};
  if (!k || !arch) return out;
  for (const g in ARCH[arch].cost) {
    const n = Math.round(ARCH[arch].cost[g] * k.mult);
    if (n > 0) out[g] = n;
  }
  return out;
}

// Note: hidden prosperity: folk, buildings, known skills and mood.
export function islandScore(world, isl) {
  let built = 0;
  for (const b of isl.buildings) if (b && !b.gone && b.built && b.id !== 'art' && b.id !== 'stairs' && b.id !== 'campfire' && b.id !== 'council') built++;
  const folk = world.folkOn(isl.id).length;
  return folk + built * 0.8 + world.known.size * 1.5 + (isl.mood || 0) * 6;
}

export function pickArch(isl) {
  const use = isl.use || {};
  let best = 'weavers'; let bs = -1;
  for (const id of ARCH_IDS) {
    const a = ARCH[id];
    let s = R() * 0.5;
    for (const g in a.skills) s += (use[g] || 0) * a.skills[g];
    for (const t in a.traits) if (isl.has(t)) s += a.traits[t];
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

export function festivalPlace(isl) {
  const hall = builtOf(isl, 'hall')[0];
  if (hall) return { i: hall.door.i, j: hall.door.j };
  const sv = storehouse(isl);
  if (sv) return { i: sv.door.i, j: sv.door.j };
  return { i: N >> 1, j: N >> 1 };
}

// Note: runs every world tick; raises the rung once and starts a festival.
export function updateRung(world, isl, dt) {
  if (isl.festival) { isl.festival.t -= dt; if (isl.festival.t <= 0) isl.festival = null; }
  if (!storehouse(isl)) return;
  isl.score = islandScore(world, isl);
  if (isl.rung < 5 && isl.score >= RUNG_SCORE[isl.rung] && world.folkOn(isl.id).length >= 2) {
    isl.rung++;
    if (isl.rung >= 2 && !isl.arch) isl.arch = pickArch(isl);
    isl.festival = { t: 30, at: festivalPlace(isl) };
    world.emit({ type: 'festival', isl, rung: isl.rung });
  }
}

export function wearTick(isl, dt) {
  for (const b of artOf(isl)) {
    const c = cidx(b.x, b.y);
    if (b.growth !== undefined && b.growth < 1) continue;
    b.wear = Math.min(1, (b.wear || 0) + dt * (0.0004 + (isl.moist[c] > 0.8 ? 0.0006 : 0)));
  }
}

// Note: what the island could make next, or null while capped, cooling down or short of goods.
export function nextArt(world, isl) {
  if (!isl.arch && isl.rung >= 2) return null;
  if (world.time < (isl.artNext || 0)) return null;
  const have = {};
  let n = 0;
  for (const b of artOf(isl)) { have[b.kind] = (have[b.kind] || 0) + 1; n++; }
  if (n >= ART_CAP[isl.rung]) return null;
  const opts = [];
  for (const kind in ART_KINDS) {
    const k = ART_KINDS[kind];
    if (k.rung > isl.rung || (have[kind] || 0) >= k.max) continue;
    const cost = artCost(kind, isl.arch);
    if (!Object.keys(cost).every((g) => stockGet(isl, g) >= cost[g] + 2)) continue;
    opts.push({ kind, w: 1 + (k.rung === isl.rung ? 2 : 0) });
  }
  if (!opts.length) return null;
  let total = 0;
  for (const o of opts) total += o.w;
  let x = R() * total;
  for (const o of opts) { x -= o.w; if (x <= 0) return { kind: o.kind, arch: isl.arch }; }
  return { kind: opts[0].kind, arch: isl.arch };
}

// Note: removing the cell must not split the walkable ring around it (simple-point test).
function ringOk(isl, i, j) {
  const ring = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const w = ring.map(([di, dj]) => isl.walkable(i + di, j + dj));
  let flips = 0;
  for (let k = 0; k < 8; k++) if (w[k] !== w[(k + 1) % 8]) flips++;
  return flips <= 2 && w.some(Boolean);
}

function nearRim(isl, i, j) {
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (!isl.land(i + di, j + dj)) return true;
  return false;
}

// Note: returns { i, j, stand: [i, j] } near gathering points, along the rim for view pieces.
export function findArtSpot(isl, kind) {
  const reach = isl.reach;
  if (!reach) return null;
  const hubs = [];
  const sv = storehouse(isl);
  if (sv) hubs.push({ i: sv.door.i, j: sv.door.j });
  for (const b of builtOf(isl, 'hall')) hubs.push({ i: b.door.i, j: b.door.j });
  for (const b of builtOf(isl, 'campfire')) hubs.push({ i: b.x, j: b.y });
  if (!hubs.length) return null;
  const others = artOf(isl);
  // Note: fixed pads of a rare island stay free.
  const pc = padCells(isl);
  let best = null; let bs = -1e9;
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c] || !reach[c] || isl.bld[c] >= 0 || isl.plant[c] || isl.stone[c] || isl.water[c] > 0.05 || isl.fire[c] > 0 || isl.snow[c] > 0.5) continue;
    if (isl.claims && isl.claims.has(c)) continue;
    if (isl.dep[c] && isl.depExposed(i, j)) continue;
    if (isl.relic && isl.relic.i === i && isl.relic.j === j) continue;
    if (pc && pc.has(c)) continue;
    if (isl.anchors && isl.anchors.some((a) => a.i === i && a.j === j)) continue;
    if (others.some((o) => Math.abs(o.x - i) < 2 && Math.abs(o.y - j) < 2)) continue;
    const h = isl.cellH(i, j);
    if (Math.abs(h - isl.cellH(i + 1, j)) > 0.5 || Math.abs(h - isl.cellH(i - 1, j)) > 0.5 || Math.abs(h - isl.cellH(i, j + 1)) > 0.5 || Math.abs(h - isl.cellH(i, j - 1)) > 0.5) continue;
    if (kind !== 'doodle' && !ringOk(isl, i, j)) continue;
    let d = 99;
    for (const hb of hubs) d = Math.min(d, Math.hypot(hb.i - i, hb.j - j));
    let score = -Math.abs(d - (kind === 'doodle' ? 3 : 4)) * 0.5 + R() * 1.2;
    if (RIM_KINDS.has(kind)) score += nearRim(isl, i, j) ? 2.2 : -1;
    if (kind === 'monument' || kind === 'fountain') score += d < 6 ? 1 : -1;
    if (score > bs) { bs = score; best = [i, j]; }
  }
  if (!best) return null;
  const [i, j] = best;
  let stand = null;
  for (const [di, dj] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) if (inB(i + di, j + dj) && reach[cidx(i + di, j + dj)] && isl.walkable(i + di, j + dj)) { stand = [i + di, j + dj]; break; }
  if (!stand) return null;
  return { i, j, stand };
}

export function placeArt(world, isl, kind, arch, i, j, stand) {
  const b = startBuilding(world, isl, 'art', i, j, { built: true, door: { i: stand[0], j: stand[1] } });
  b.kind = kind; b.arch = arch; b.wear = 0; b.growth = 0;
  b.yaw = Math.atan2(stand[0] - i, stand[1] - j);
  b.level = 1;
  isl.artNext = world.time + 40 + R() * 40;
  isl.touch('bld');
  return b;
}

// Note: the artist is done; the piece stands and the world hears of it.
export function finishArt(world, isl, b) {
  b.growth = 1;
  world.emit({ type: 'art', isl, b });
}

// Note: artists are folk with a strong wonder talent; a small island always has its best one.
export function isArtist(world, isl, f) {
  if (f.talent.wonder >= 1.2) return true;
  let best = null;
  for (const o of world.folkOn(isl.id)) if (o.stage === 'adult' && (!best || o.talent.wonder > best.talent.wonder)) best = o;
  return best === f;
}

// Note: seconds of work per kind.
export function artWork(kind) {
  return { doodle: 6, small: 9, statue: 16, mural: 14, arch: 18, fountain: 20, monument: 26, garden: 14 }[kind] || 10;
}

export function worn(isl) { return artOf(isl).find((b) => (b.wear || 0) > 0.55 && !b.repairing && (b.growth === undefined || b.growth >= 1)); }
