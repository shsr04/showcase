// Note: grid pathfinding and reachability on an island.

import { N } from './config.js';
import { cidx, inB } from './island.js';

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.42], [-1, 1, 1.42], [1, -1, 1.42], [-1, -1, 1.42]];

// Note: folk keep a cell away from flames when they can.
function fireNear(isl, i, j) {
  for (const [di, dj] of DIRS) if (inB(i + di, j + dj) && isl.fire[cidx(i + di, j + dj)] > 0) return 3;
  return 0;
}

function stepCost(isl, i, j, ni, nj) {
  const c = cidx(ni, nj);
  return 1 + Math.abs(isl.cellH(i, j) - isl.cellH(ni, nj)) * 1.2 + (isl.water[c] > 0.12 ? 0.8 : 0) + (isl.fire[c] > 0 ? 9 : 0) + (isl.burning ? fireNear(isl, ni, nj) : 0);
}

// Note: a diagonal step needs all four sides of its square passable, so it is the same from both ends.
function diagOk(isl, i, j, di, dj) {
  return isl.stepOk(i, j, i + di, j) && isl.stepOk(i, j, i, j + dj) && isl.stepOk(i + di, j + dj, i + di, j) && isl.stepOk(i + di, j + dj, i, j + dj);
}

// Note: A* over walkable cells; goal may be unwalkable when opts.adjacent is set (path ends next to it).
export function findPath(isl, si, sj, gi, gj, opts = {}) {
  if (!inB(si, sj) || !inB(gi, gj)) return null;
  const adj = !!opts.adjacent;
  const goalOk = (i, j) => (adj ? Math.max(Math.abs(i - gi), Math.abs(j - gj)) <= 1 && !(i === gi && j === gj && !isl.walkable(i, j)) : i === gi && j === gj);
  if (!isl.walkable(gi, gj) && !adj) return null;
  const g = new Float32Array(N * N).fill(1e9);
  const from = new Int16Array(N * N).fill(-1);
  const open = [];
  const closed = new Uint8Array(N * N);
  const s = cidx(si, sj);
  g[s] = 0;
  open.push([Math.hypot(si - gi, sj - gj), s]);
  let found = -1;
  let guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % N;
    const cj = (cur / N) | 0;
    if (goalOk(ci, cj) && (isl.walkable(ci, cj) || (ci === si && cj === sj))) { found = cur; break; }
    for (const [di, dj, w] of DIRS) {
      const ni = ci + di; const nj = cj + dj;
      if (!inB(ni, nj)) continue;
      if (!isl.stepOk(ci, cj, ni, nj)) continue;
      if (di && dj && !diagOk(isl, ci, cj, di, dj)) continue;
      const n = cidx(ni, nj);
      const ng = g[cur] + stepCost(isl, ci, cj, ni, nj) * w;
      if (ng < g[n]) {
        g[n] = ng;
        from[n] = cur;
        open.push([ng + Math.hypot(ni - gi, nj - gj), n]);
      }
    }
  }
  if (found < 0) return null;
  const path = [];
  for (let c = found; c !== s && c >= 0; c = from[c]) path.push([c % N, (c / N) | 0]);
  path.reverse();
  return path;
}

// Note: BFS flood of cells reachable on foot from a start cell.
export function reachMap(isl, si, sj) {
  const m = new Uint8Array(N * N);
  if (!inB(si, sj)) return m;
  const q = [[si, sj]];
  m[cidx(si, sj)] = 1;
  for (let k = 0; k < q.length; k++) {
    const [i, j] = q[k];
    for (const [di, dj] of DIRS) {
      const ni = i + di; const nj = j + dj;
      if (!inB(ni, nj) || m[cidx(ni, nj)]) continue;
      if (!isl.stepOk(i, j, ni, nj)) continue;
      if (di && dj && !diagOk(isl, i, j, di, dj)) continue;
      m[cidx(ni, nj)] = 1;
      q.push([ni, nj]);
    }
  }
  return m;
}

// Note: nearest walkable cell to a point, optionally limited to a reach map.
export function nearestWalkable(isl, fi, fj, reach, maxR = 6) {
  for (let r = 0; r <= maxR; r++) {
    let best = null; let bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = fi + di; const j = fj + dj;
      if (!isl.walkable(i, j)) continue;
      if (reach && !reach[cidx(i, j)]) continue;
      const d = Math.hypot(di, dj);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    if (best) return best;
  }
  return null;
}
