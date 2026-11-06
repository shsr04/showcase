// Note: shared pure geometry for buildings; sim and view must agree on the yaw and the tier prop stand points.

import { N, BUILDINGS, TIER_SPOTS, LINK_BENCH_SIDE } from './config.js';
import { cidx, inB } from './island.js';
import { pierYaw } from './pier.js';

// Note: yaw of the building group (rotation.y); +z of the model faces the door side.
export function buildingYaw(isl, b) {
  if (b.id === 'art') return b.yaw || 0;
  // Note: the airdock pier points along b.dir, not at the door.
  if (b.id === 'airdock') return pierYaw(b.dir);
  if (b.id === 'dock') {
    let best = 0; let by = 0;
    for (const [dx, dz, yaw] of [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]) {
      const i = b.x + dx; const j = b.y + dz;
      const w = inB(i, j) ? isl.water[cidx(i, j)] + (isl.land(i, j) ? 0 : 1) : 1;
      if (w > best) { best = w; by = yaw; }
    }
    return by;
  }
  if (b.id === 'hall') return 0;
  if (b.id === 'stairs') return Math.atan2(b.dx, b.dz);
  const dx = b.door.i + 0.5 - (b.x + b.size / 2); const dz = b.door.j + 0.5 - (b.y + b.size / 2);
  return Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
}

// Note: stand point of a prop slot (S, C, W) in island cell units; face = yaw of the door side (outward), toWall = yaw towards the wall.
export function tierSpot(isl, b, kind) {
  const half = (BUILDINGS[b.id] ? BUILDINGS[b.id].size : b.size) / 2;
  const [fx, dz] = TIER_SPOTS[kind];
  const lx = fx * half; const lz = half + dz;
  const yaw = buildingYaw(isl, b);
  const s = Math.sin(yaw); const c = Math.cos(yaw);
  return {
    x: b.x + b.size / 2 + lx * c + lz * s,
    z: b.y + b.size / 2 - lx * s + lz * c,
    face: yaw,
    toWall: yaw + Math.PI,
  };
}

// Note: bench stand point beside a link end (0 = island a, 1 = island b), in cell units of the island at that end; never on the deck lane.
// Attention: the visuals place the bench at wx/wz (world); side is +1 (left of the way out over the gap) unless that cell is blocked, then -1.
export function linkBenchSpot(isl, l, end) {
  const p = l.pts;
  const cell = end ? l.bi : l.ai;
  const n0 = end ? p[p.length - 1] : p[0];
  const n1 = end ? p[p.length - 2] : p[1];
  let dx = n1.x - n0.x; let dz = n1.z - n0.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  const cx = cell.i + 0.5; const cz = cell.j + 0.5;
  let out = null;
  for (const side of [1, -1]) {
    const x = cx - dz * side * LINK_BENCH_SIDE; const z = cz + dx * side * LINK_BENCH_SIDE;
    const i = Math.floor(x); const j = Math.floor(z);
    const free = inB(i, j) && isl.walkable(i, j) && isl.bld[cidx(i, j)] < 0 && (!isl.reach || isl.reach[cidx(i, j)]);
    const spot = { x, z, side, face: Math.atan2(dx, dz), toWall: Math.atan2(-dx, -dz), wx: isl.wx + x - N / 2, wz: isl.wz + z - N / 2 };
    if (free) return spot;
    if (!out) out = spot;
  }
  return out;
}
