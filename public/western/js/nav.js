// Note: cell-grid pathfinding across every floor; doors, windows and the stair flight are edges with costs.

import { GRID_W, GRID_H, MAX_FLOORS } from './config.js';
import { T, DS, WS, TILE_PROPS, cellSolid, isWall, isFlight } from './tiles.js';
import { tileAt, stateAt, inMap } from './map.js';

const SIZE = GRID_W * GRID_H * MAX_FLOORS;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DOOR_COST = { [DS.CLOSED]: 1.5, [DS.LOCKED]: 4, [DS.OPEN]: 0, [DS.BROKEN]: 0 };
const WINDOW_COST = 6;
// Note: cost per metre of the flight, which is walked at about half speed.
const FLIGHT_COST = 1.8;

// Note: keys are laid out on the GRID stride, so one key names the same cell on a map of any size.
export const cellKey = (x, y, f) => (f * GRID_H + y) * GRID_W + x;

// Note: a closed door can be passed (it needs an action); a locked one only when forcing is allowed.
export function passable(map, f, x, y, opts = {}) {
  if (!inMap(map, x, y)) return false;
  const tile = tileAt(map, f, x, y);
  const state = stateAt(map, f, x, y);
  if (tile === T.DOOR) return state !== DS.LOCKED || !!opts.force;
  if (tile === T.WINDOW || isFlight(tile)) return false;
  return !cellSolid(tile, state);
}

// Note: true when floor f has the two cells of a flight with its STAIRS tile at (x, sy).
const flightAt = (map, f, x, sy) => f >= 0 && f < map.floors.length && tileAt(map, f, x, sy) === T.STAIRS && tileAt(map, f, x, sy - 1) === T.RUN;

// Note: the lower floor of the flight at (x, sy) seen from floor f; a flight lies on the two floors it joins, and the rail closing its head marks the lower one.
export function flightLower(map, f, x, sy) {
  const up = flightAt(map, f + 1, x, sy);
  const down = flightAt(map, f - 1, x, sy);
  if (up && !down) return f;
  if (down && !up) return f - 1;
  if (up && down) return tileAt(map, f, x, sy - 2) === T.RAIL ? f : f - 1;
  return f === 0 ? 0 : f - 1;
}

// Note: the flight seen from one of its cells or from a landing: row of the STAIRS tile, lower floor lo and upper floor hi, foot landing (on lo) and head landing (on hi); null elsewhere.
export function flightOf(map, f, x, y) {
  const t = tileAt(map, f, x, y);
  let sy = null;
  let landing = null;
  if (t === T.STAIRS) sy = y;
  else if (t === T.RUN) sy = y + 1;
  else if (tileAt(map, f, x, y - 1) === T.STAIRS) [sy, landing] = [y - 1, 'foot'];
  else if (tileAt(map, f, x, y + 1) === T.RUN && tileAt(map, f, x, y + 2) === T.STAIRS) [sy, landing] = [y + 2, 'head'];
  if (sy === null || !flightAt(map, f, x, sy)) return null;
  const lo = flightLower(map, f, x, sy);
  if ((landing === 'foot' && lo !== f) || (landing === 'head' && lo + 1 !== f)) return null;
  return { sy, lo, hi: lo + 1, foot: { x, y: sy + 1 }, head: { x, y: sy - 2 } };
}

const blocksCorner = (map, f, x, y) => cellSolid(tileAt(map, f, x, y), stateAt(map, f, x, y));

// Note: a window is crossed straight through its wall; returns the crossing axis or null.
function windowAxis(map, f, x, y) {
  if (isWall(tileAt(map, f, x - 1, y)) && isWall(tileAt(map, f, x + 1, y))) return 'v';
  if (isWall(tileAt(map, f, x, y - 1)) && isWall(tileAt(map, f, x, y + 1))) return 'h';
  return null;
}

// Note: marks an edge as the flight: its end waypoint is walked on the stairs, so it keeps its floor until the actor flips.
const FLIGHT_VIA = { flight: true };

// Note: calls cb(nx, ny, nf, cost, mid) for every move from a cell; mid is an intermediate waypoint, the flight mark or null.
function forEachEdge(map, x, y, f, opts, cb) {
  const here = tileAt(map, f, x, y);
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    const diagonal = dx !== 0 && dy !== 0;
    if (diagonal && (blocksCorner(map, f, x + dx, y) || blocksCorner(map, f, x, y + dy))) continue;
    const tile = tileAt(map, f, nx, ny);
    if (tile === T.WINDOW) {
      if (diagonal || !opts.windows) continue;
      if (stateAt(map, f, nx, ny) === WS.BOLTED && !opts.force) continue;
      const axis = windowAxis(map, f, nx, ny);
      if (axis === null || (axis === 'v') !== (dy !== 0)) continue;
      const bx = nx + dx;
      const by = ny + dy;
      if (!passable(map, f, bx, by, opts)) continue;
      cb(bx, by, f, 2 + WINDOW_COST, { x: nx, y: ny, f, kind: 'window' });
      continue;
    }
    if (!passable(map, f, nx, ny, opts)) continue;
    let cost = diagonal ? Math.SQRT2 : 1;
    if (tile === T.DOOR) cost += DOOR_COST[stateAt(map, f, nx, ny)] ?? 0;
    cb(nx, ny, f, cost, null);
  }
  // Note: walking the flight is an edge between its two landings; from a cell on the flight either end is one step.
  const fl = flightOf(map, f, x, y);
  if (fl) {
    const at = y + 0.5;
    const toFoot = Math.abs(at - (fl.foot.y + 0.5));
    const toHead = Math.abs(at - (fl.head.y + 0.5));
    if (f === fl.lo && y === fl.foot.y) {
      if (passable(map, fl.hi, fl.head.x, fl.head.y, opts)) cb(fl.head.x, fl.head.y, fl.hi, toHead * FLIGHT_COST, FLIGHT_VIA);
    } else if (f === fl.hi && y === fl.head.y) {
      if (passable(map, fl.lo, fl.foot.x, fl.foot.y, opts)) cb(fl.foot.x, fl.foot.y, fl.lo, toFoot * FLIGHT_COST, FLIGHT_VIA);
    } else {
      if (passable(map, fl.lo, fl.foot.x, fl.foot.y, opts)) cb(fl.foot.x, fl.foot.y, fl.lo, toFoot * FLIGHT_COST, FLIGHT_VIA);
      if (passable(map, fl.hi, fl.head.x, fl.head.y, opts)) cb(fl.head.x, fl.head.y, fl.hi, toHead * FLIGHT_COST, FLIGHT_VIA);
    }
  }
}

class Heap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(k, v) {
    const a = this.keys;
    const b = this.vals;
    let i = a.length;
    a.push(k);
    b.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= k) break;
      a[i] = a[p];
      b[i] = b[p];
      i = p;
    }
    a[i] = k;
    b[i] = v;
  }
  pop() {
    const a = this.keys;
    const b = this.vals;
    const top = b[0];
    const lk = a.pop();
    const lv = b.pop();
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1] < a[c]) c++;
        if (a[c] >= lk) break;
        a[i] = a[c];
        b[i] = b[c];
        i = c;
      }
      a[i] = lk;
      b[i] = lv;
    }
    return top;
  }
}

const unkey = (k) => {
  const x = k % GRID_W;
  const r = (k - x) / GRID_W;
  const y = r % GRID_H;
  return [x, y, (r - y) / GRID_H];
};

const waypoint = (map, x, y, f) => ({ x: x + 0.5, y: y + 0.5, f, kind: tileAt(map, f, x, y) === T.DOOR ? 'door' : 'walk' });
// Note: one number per goal cell, shared by everything that asks whether a kept path still leads to a goal.
export const goalKey = (goal) => goal.f * 100000 + Math.floor(goal.y) * 100 + Math.floor(goal.x);

// Note: world or cell coordinates both work for from/to; the path lists cell centres without the start.
export function findPath(map, from, to, opts = {}) {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  let tx = Math.floor(to.x);
  let ty = Math.floor(to.y);
  // Note: a goal on the flight itself is walked to from the landing on its side.
  const fg = flightOf(map, to.f, tx, ty);
  if (fg && isFlight(tileAt(map, to.f, tx, ty))) {
    tx = to.f === fg.lo ? fg.foot.x : fg.head.x;
    ty = to.f === fg.lo ? fg.foot.y : fg.head.y;
  }
  const start = cellKey(sx, sy, from.f);
  const goal = cellKey(tx, ty, to.f);
  if (!inMap(map, sx, sy) || !inMap(map, tx, ty)) return null;
  if (start === goal) return [];
  if (!passable(map, to.f, tx, ty, opts)) return null;
  const g = new Float32Array(SIZE).fill(Infinity);
  const prev = new Int32Array(SIZE).fill(-1);
  const mids = new Array(SIZE);
  const heap = new Heap();
  const h = (x, y, f) => {
    if (f !== to.f) return 0;
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  heap.push(h(sx, sy, from.f), start);
  const avoid = opts.avoid;
  while (heap.size) {
    const k = heap.pop();
    if (k === goal) break;
    const [x, y, f] = unkey(k);
    const gk = g[k];
    forEachEdge(map, x, y, f, opts, (nx, ny, nf, cost, mid) => {
      const nk = cellKey(nx, ny, nf);
      if (avoid && nk !== goal && avoid(nx, ny, nf)) return;
      const ng = gk + cost;
      if (ng >= g[nk]) return;
      g[nk] = ng;
      prev[nk] = k;
      mids[nk] = mid;
      heap.push(ng + h(nx, ny, nf), nk);
    });
  }
  if (prev[goal] < 0) return null;
  const out = [];
  for (let k = goal; k !== start; k = prev[k]) {
    const [x, y, f] = unkey(k);
    const wp = waypoint(map, x, y, f);
    out.push(wp);
    if (mids[k] === FLIGHT_VIA) wp.kind = 'stairs';
    else if (mids[k]) out.push({ x: mids[k].x + 0.5, y: mids[k].y + 0.5, f: mids[k].f, kind: mids[k].kind });
  }
  return out.reverse();
}

const PLANE = GRID_W * GRID_H;
// Note: the solid flag by tile id, so the flood reads no TILE_PROPS objects.
const SOLID_TILE = Uint8Array.from({ length: 256 }, (_, t) => (TILE_PROPS[t] && TILE_PROPS[t].solid ? 1 : 0));
const DX = Int8Array.from(DIRS, (d) => d[0]);
const DY = Int8Array.from(DIRS, (d) => d[1]);
// Note: scratch buffers of the flood, which never nests; they are indexed by cell key, the map's tiles by y * map.W + x.
const queue = new Int32Array(SIZE);
const solidGrid = new Uint8Array(SIZE);
const walkGrid = new Uint8Array(SIZE);

// Note: solid and walkable flags of a floor, by the rules of cellSolid and passable.
function fillGrids(map, f, force) {
  const { tile, state } = map.floors[f];
  const base = f * PLANE;
  for (let y = 0; y < map.H; y++) {
    for (let x = 0; x < map.W; x++) {
      const i = y * map.W + x;
      const k = base + y * GRID_W + x;
      const t = tile[i];
      if (t === T.DOOR) {
        const s = state[i];
        solidGrid[k] = s === DS.CLOSED || s === DS.LOCKED ? 1 : 0;
        walkGrid[k] = s !== DS.LOCKED || force ? 1 : 0;
      } else {
        const solid = SOLID_TILE[t];
        solidGrid[k] = solid;
        walkGrid[k] = solid === 0 && t !== T.WINDOW && t !== T.STAIRS && t !== T.RUN ? 1 : 0;
      }
    }
  }
}

// Note: typed-array flood with the edges of forEachEdge; marks seen by cell key and returns the queue length.
function flood(map, starts, opts, seen) {
  const force = !!opts.force;
  const windows = !!opts.windows;
  const W = map.W;
  const H = map.H;
  let built = 0;
  let tail = 0;
  const enqueue = (nk) => {
    if (!seen[nk]) {
      seen[nk] = 1;
      queue[tail++] = nk;
    }
  };
  for (const s of starts) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (inMap(map, x, y)) enqueue(cellKey(x, y, s.f));
  }
  for (let head = 0; head < tail; head++) {
    const k = queue[head];
    const f = (k / PLANE) | 0;
    if (!(built & (1 << f))) {
      fillGrids(map, f, force);
      built |= 1 << f;
    }
    const base = f * PLANE;
    const cell = k - base;
    const y = (cell / GRID_W) | 0;
    const x = cell - y * GRID_W;
    const { tile, state } = map.floors[f];
    for (let d = 0; d < 8; d++) {
      const dx = DX[d];
      const dy = DY[d];
      const nx = x + dx;
      const ny = y + dy;
      // Note: off the map is solid void.
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const diagonal = d >= 4;
      if (diagonal && (solidGrid[base + y * GRID_W + nx] === 1 || solidGrid[base + ny * GRID_W + x] === 1)) continue;
      const nk = base + ny * GRID_W + nx;
      const ti = ny * W + nx;
      if (tile[ti] !== T.WINDOW) {
        if (walkGrid[nk] === 1) enqueue(nk);
        continue;
      }
      if (diagonal || !windows) continue;
      if (state[ti] === WS.BOLTED && !force) continue;
      const axis = windowAxis(map, f, nx, ny);
      if (axis === null || (axis === 'v') !== (dy !== 0)) continue;
      const bx = nx + dx;
      const by = ny + dy;
      if (inMap(map, bx, by) && walkGrid[base + by * GRID_W + bx] === 1) enqueue(base + by * GRID_W + bx);
    }
    // Note: only the flight and its landings have the flight as an edge, and a landing leads to the far end.
    const ci = y * W + x;
    const t = tile[ci];
    if (t === T.STAIRS || t === T.RUN || (y > 0 && tile[ci - W] === T.STAIRS) || (y + 2 < H && tile[ci + W] === T.RUN && tile[ci + 2 * W] === T.STAIRS)) {
      const fl = flightOf(map, f, x, y);
      if (!fl) continue;
      if (!(f === fl.lo && y === fl.foot.y) && passable(map, fl.lo, fl.foot.x, fl.foot.y, opts)) enqueue(cellKey(fl.foot.x, fl.foot.y, fl.lo));
      if (!(f === fl.hi && y === fl.head.y) && passable(map, fl.hi, fl.head.x, fl.head.y, opts)) enqueue(cellKey(fl.head.x, fl.head.y, fl.hi));
    }
  }
  return tail;
}

// Note: every cell reachable from the starts, as a mask by cell key (1 when reachable); starts are included.
export function reachableMask(map, starts, opts = {}) {
  const seen = new Uint8Array(SIZE);
  flood(map, starts, opts, seen);
  return seen;
}

// Note: every cell reachable from the starts, as a set of cell keys in visit order; starts are included.
export function reachable(map, starts, opts = {}) {
  const n = flood(map, starts, opts, new Uint8Array(SIZE));
  return new Set(queue.subarray(0, n));
}
