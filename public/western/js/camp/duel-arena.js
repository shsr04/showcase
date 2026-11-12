// Note: the ground of a duel as plain data and its painters; a pure function of the venue, read by the stage and by the tests alike.
import { TILE } from '../config.js';
import { T, DS, WS } from '../tiles.js';
import { makeMap, newFloor, setTile } from '../map.js';
import { paintCell } from '../sprites.js';
import { PAL, C } from '../palette.js';
import { clamp, unit } from '../rand.js';

export const ARENA_H = 9;
export const PAD = 3;
// Note: the lane is the row the two stand in; rows 4 to 6 stay open between them so the picture never hides a shot.
export const LANE = 5;
export const OPEN_ROWS = [4, 5, 6];
// Note: the two in the lane are drawn a little larger than the onlookers so they read at the size of the panel.
export const LANE_ZOOM = 1.5;
const CROWD_KINDS = ['man', 'woman', 'cowhand', 'miner', 'townsman', 'rancher', 'gambler', 'drover', 'boy'];
const FACADES = ['saloon', 'store', 'hotel', 'office', 'bank'];
const TERRAIN = { street: 'stage-road', yard: 'desert-scrub', corral: 'ranch', lot: 'grassland' };
// Note: tiles a man may stand or shoot across; anything else keeps off the open rows.
export const FLAT = new Set([T.SAND, T.ROAD, T.GRASS, T.PORCH]);
export const FALLBACK = { kind: 'street', label: 'the street', ground: 'dirt', props: [], distance: 10, side: -1, crowd: 3, seed: 1 };

const hex = (i) => PAL[i];
const rollOf = (site, tag) => unit(`${site.seed}:arena:${tag}`);

// Note: the ground of a duel as plain data, a pure function of the venue; the painter and the tests read the same list.
export function buildArena(venue) {
  const site = { ...FALLBACK, ...(venue || {}) };
  const d = site.distance;
  const w = d + 2 * PAD;
  const grid = new Map();
  const put = (x, y, tile, state = 0) => {
    if (x >= 0 && x < w && y >= 0 && y < ARENA_H) grid.set(`${x}:${y}`, { x, y, tile, state });
  };
  const ground = site.kind === 'lot' ? T.GRASS : T.SAND;
  const open = (x) => x >= PAD - 1 && x <= PAD + d + 1;
  const taken = new Set();
  const take = (x, y) => taken.add(`${x}:${y}`);
  const free = (x, y) => !taken.has(`${x}:${y}`);
  let art = null;
  for (let y = 0; y < ARENA_H; y++) for (let x = 0; x < w; x++) put(x, y, ground);
  const pick = (tag, list) => list[Math.floor(rollOf(site, tag) * list.length) % list.length];
  // Note: scatter keeps a prop off the open rows and off any cell another prop holds.
  const scatter = (tag, rows, tiles, count) => {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rollOf(site, `${tag}:x:${i}`) * w);
      const y = rows[Math.floor(rollOf(site, `${tag}:y:${i}`) * rows.length)];
      if (OPEN_ROWS.includes(y) && open(x)) continue;
      if (!free(x, y)) continue;
      take(x, y);
      put(x, y, tiles[Math.floor(rollOf(site, `${tag}:t:${i}`) * tiles.length)]);
    }
  };
  let crowdRow;
  if (site.kind === 'street') {
    const theme = pick('facade', FACADES);
    art = { kind: 'building', theme, x: 0, y: 0, width: w, height: 3, porch: 1 };
    for (let x = 0; x < w; x++) {
      put(x, 0, T.FRAME);
      put(x, 1, T.FLOOR);
      put(x, 2, T.FRAME);
      put(x, 3, T.PORCH);
      for (const y of [4, 5, 6]) put(x, y, T.ROAD);
    }
    const door = 2 + Math.floor(rollOf(site, 'door') * (w - 4));
    for (let x = 1; x < w - 1; x++) if (x % 4 === 2 && Math.abs(x - door) > 1) put(x, 2, T.WINDOW, WS.CLOSED);
    put(door, 2, T.DOOR, DS.OPEN);
    for (let x = 3; x < w; x += 7) { put(x, 3, T.POST); take(x, 3); }
    put(0, 3, T.POST);
    put(w - 1, 3, T.POST);
    for (const x of [1, 2, w - 3, w - 2]) if (!open(x)) { put(x, 4, T.RAIL); take(x, 4); }
    scatter('street', [7, 8], [T.TROUGH, T.BARREL, T.WAGON, T.BARREL], 3 + Math.floor(rollOf(site, 'count') * 3));
    crowdRow = site.side < 0 ? 3.5 : ARENA_H - 1;
  } else if (site.kind === 'yard') {
    for (let x = 0; x < w; x++) { put(x, 0, T.ADOBE); put(x, 1, T.ADOBE); put(x, 2, T.FENCE); take(x, 2); }
    const gate = 2 + Math.floor(rollOf(site, 'gate') * (w - 4));
    put(gate, 2, ground);
    scatter('yard', [1, 3, 7, 8], [T.BARREL, T.CRATE, T.CRATE, T.BARREL], 5 + Math.floor(rollOf(site, 'count') * 4));
    crowdRow = site.side < 0 ? 3.5 : ARENA_H - 1;
  } else if (site.kind === 'corral') {
    for (let x = 0; x < w; x++) { put(x, 0, T.FENCE); put(x, ARENA_H - 1, T.FENCE); take(x, 0); take(x, ARENA_H - 1); }
    for (let y = 1; y < ARENA_H - 1; y++) { put(0, y, T.FENCE); put(w - 1, y, T.FENCE); take(0, y); take(w - 1, y); }
    scatter('corral', [1, 2, 7], [T.TROUGH, T.HAY, T.HAY, T.TROUGH], 3 + Math.floor(rollOf(site, 'count') * 3));
    crowdRow = site.side < 0 ? 1.5 : ARENA_H - 1.5;
  } else {
    scatter('lot', [0, 1, 2, 3, 7, 8], [T.SCRUB, T.ROCK, T.MESQUITE, T.SCRUB, T.WAGON], 8 + Math.floor(rollOf(site, 'count') * 5));
    crowdRow = site.side < 0 ? 2.5 : ARENA_H - 1.5;
  }
  // Note: onlookers keep to one edge, spaced out, facing the lane; a prop cell is never theirs.
  const crowd = [];
  const kinds = [];
  for (let i = 0; i < site.crowd; i++) {
    const slot = (i + 0.5) / site.crowd;
    const x = clamp(1 + slot * (w - 2) + (rollOf(site, `crowd:x:${i}`) - 0.5) * (w / (site.crowd * 2.4)), 1, w - 1);
    kinds.push(CROWD_KINDS[Math.floor(rollOf(site, `crowd:kind:${i}`) * CROWD_KINDS.length)]);
    crowd.push({ id: 100 + i, x, y: crowdRow, facing: site.side < 0 ? Math.PI / 2 : -Math.PI / 2, kind: kinds[i] });
  }
  const ticks = [];
  for (let m = 5; m < d; m += 5) ticks.push({ x: PAD + 0.5 + m, m });
  return { w, h: ARENA_H, y: LANE + 0.5, x0: PAD + 0.5, x1: PAD + 0.5 + d, distance: d, terrain: TERRAIN[site.kind] || 'desert-scrub', art, cells: [...grid.values()], crowd, ticks, kind: site.kind };
}

// Note: the arena laid on the game's tile map, so the painters need nothing special.
export function arenaMap(arena) {
  const map = makeMap([newFloor(T.SAND)]);
  map.terrain = arena.terrain;
  if (arena.art) map.art = arena.art;
  for (const c of arena.cells) setTile(map, 0, c.x, c.y, c.tile, c.state);
  return map;
}

export function paintArena(g, arena, map = arenaMap(arena)) {
  for (let y = 0; y < arena.h; y++) for (let x = 0; x < arena.w; x++) paintCell(g, map, 0, x, y);
  return map;
}

// Note: marks on the ground that say how far apart the two stand, paces and boot scuffs rather than a number.
export function paintLane(g, arena) {
  g.save();
  g.globalAlpha = 0.3;
  g.fillStyle = hex(C.SAND_D);
  for (const x of [arena.x0, arena.x1]) {
    g.beginPath();
    g.ellipse(x * TILE, arena.y * TILE, 0.55 * TILE, 0.4 * TILE, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.45;
  g.strokeStyle = hex(C.WOOD_D);
  g.lineWidth = Math.max(1, TILE / 24);
  g.setLineDash([TILE * 0.18, TILE * 0.5]);
  g.beginPath();
  g.moveTo((arena.x0 + 0.8) * TILE, (arena.y + 0.78) * TILE);
  g.lineTo((arena.x1 - 0.8) * TILE, (arena.y + 0.78) * TILE);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 0.6;
  for (const t of arena.ticks) {
    g.fillStyle = hex(C.WOOD_D);
    g.fillRect(t.x * TILE - 1.5, (arena.y + 0.7) * TILE, 3, 0.16 * TILE);
  }
  g.restore();
}

// Note: the light of the late sun as one veil laid over the whole picture: a warm wash from the top, dark corners, no hard edge.
export function paintVeil(g, w, h) {
  const wash = g.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(255, 214, 140, 0.16)');
  wash.addColorStop(0.55, 'rgba(255, 190, 110, 0.04)');
  wash.addColorStop(1, 'rgba(40, 18, 4, 0.2)');
  g.fillStyle = wash;
  g.fillRect(0, 0, w, h);
  const edge = g.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.62);
  edge.addColorStop(0, 'rgba(20, 8, 0, 0)');
  edge.addColorStop(1, 'rgba(20, 8, 0, 0.5)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
}

// Note: a soft shadow under a standing person, cast away from the sun; drawn before the person so it never covers a body.
export function paintShadow(g, x, y, zoom = 1) {
  g.save();
  g.globalAlpha = 0.28;
  g.fillStyle = hex(C.SHADOW);
  g.beginPath();
  g.ellipse((x + 0.12 * zoom) * TILE, (y + 0.32 * zoom) * TILE, 0.42 * zoom * TILE, 0.17 * zoom * TILE, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
