// Note: two-floor cell grid; tile ids and state bytes per floor, plus a change log for the view.

import { MAP_W, MAP_H } from './config.js';
import { T, cellSolid, cellOpaque, isFlight } from './tiles.js';

export { MAP_W, MAP_H };

// Note: idx and inBounds are for the standard 40 by 30 house grid; a map's own size is map.W by map.H, read by the map-aware helpers below.
export const idx = (x, y) => y * MAP_W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
export const inMap = (map, x, y) => x >= 0 && y >= 0 && x < map.W && y < map.H;
export const mapIdx = (map, x, y) => y * map.W + x;

// Note: a floor is W by H cells; an outdoor site may be larger than the standard grid.
export function newFloor(fill = T.SAND, W = MAP_W, H = MAP_H) {
  return { W, H, tile: new Uint8Array(W * H).fill(fill), state: new Uint8Array(W * H) };
}

export function makeMap(floors, W = floors[0]?.W ?? MAP_W, H = floors[0]?.H ?? MAP_H) {
  for (const f of floors) if (f.tile.length !== W * H) throw new Error(`A floor of ${f.tile.length} cells does not fit a ${W} by ${H} map.`);
  return { W, H, floors, rev: 0, changes: [] };
}

export function cloneMap(map) {
  const copy = makeMap(map.floors.map((f) => ({ W: map.W, H: map.H, tile: f.tile.slice(), state: f.state.slice() })), map.W, map.H);
  if (map.art) copy.art = JSON.parse(JSON.stringify(map.art));
  // Note: the terrain name is picture only (it picks the ground colours); no rule reads it.
  if (map.terrain) copy.terrain = map.terrain;
  // Note: region and material are picture only too; they exist only for a regional site.
  if (map.region) copy.region = map.region;
  if (map.material) copy.material = map.material;
  // Note: item 485: outdoor ground height is fixed for the scene, so the copy shares it.
  if (map.relief) copy.relief = map.relief;
  return copy;
}

// Note: x and y are integer cell coordinates; anything outside the map reads as VOID.
export function tileAt(map, f, x, y) {
  return x >= 0 && y >= 0 && x < map.W && y < map.H ? map.floors[f].tile[y * map.W + x] : T.VOID;
}

export function stateAt(map, f, x, y) {
  return x >= 0 && y >= 0 && x < map.W && y < map.H ? map.floors[f].state[y * map.W + x] : 0;
}

const revs = new WeakMap();
// Note: how many tile edits a map has had, so layouts derived from its tiles know when to be rebuilt.
export const mapRev = (map) => revs.get(map) ?? 0;

export function setTile(map, f, x, y, tile, state = 0) {
  if (!inMap(map, x, y)) return;
  const i = mapIdx(map, x, y);
  if (map.floors[f].tile[i] !== tile) revs.set(map, mapRev(map) + 1);
  map.floors[f].tile[i] = tile;
  map.floors[f].state[i] = state;
}

// Note: runtime changes go through here so the view can repaint the cell.
export function setState(map, f, x, y, state) {
  if (!inMap(map, x, y)) return;
  map.floors[f].state[mapIdx(map, x, y)] = state;
  map.rev++;
  map.changes.push({ f, x, y });
}

export function replaceTile(map, f, x, y, tile, state = 0) {
  setTile(map, f, x, y, tile, state);
  map.rev++;
  map.changes.push({ f, x, y });
}

export const solidAt = (map, f, x, y) => !inMap(map, x, y) || cellSolid(tileAt(map, f, x, y), stateAt(map, f, x, y));
export const opaqueAt = (map, f, x, y) => !inMap(map, x, y) || cellOpaque(tileAt(map, f, x, y), stateAt(map, f, x, y));

// Note: a rail is a thin strip along the edge of its tile that faces the flight; the rest of the tile is open floor.
export const RAIL_T = 0.15;

// Note: the strip in metres with the side of the tile it hugs; null when no flight is adjacent, then the rail fills its tile.
export function railStrip(map, f, x, y) {
  const flight = (dx, dy) => isFlight(tileAt(map, f, x + dx, y + dy));
  if (flight(-1, 0)) return { side: 'w', x0: x, y0: y, x1: x + RAIL_T, y1: y + 1 };
  if (flight(0, 1)) return { side: 's', x0: x, y0: y + 1 - RAIL_T, x1: x + 1, y1: y + 1 };
  if (flight(0, -1)) return { side: 'n', x0: x, y0: y, x1: x + 1, y1: y + RAIL_T };
  if (flight(1, 0)) return { side: 'e', x0: x + 1 - RAIL_T, y0: y, x1: x + 1, y1: y + 1 };
  return null;
}

// Note: true when a point in a rail cell lies on the rail itself.
export function onRail(map, f, px, py) {
  const s = railStrip(map, f, Math.floor(px), Math.floor(py));
  return !s || (px >= s.x0 && px <= s.x1 && py >= s.y0 && py <= s.y1);
}

// Note: world coordinates are metres; the cell is the floor of each.
export const cellOf = (v) => Math.floor(v);
export const solidPos = (map, f, px, py) => solidAt(map, f, Math.floor(px), Math.floor(py));
export const opaquePos = (map, f, px, py) => opaqueAt(map, f, Math.floor(px), Math.floor(py));

// Note: the cells in square rings round a cell, nearest ring first, out to rmax.
export function* ringCells(cx, cy, rmax) {
  for (let r = 0; r <= rmax; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) yield { x: cx + dx, y: cy + dy };
  }
}
