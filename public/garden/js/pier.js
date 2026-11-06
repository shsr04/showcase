// Note: airdock sky pier geometry shared by sim, view and the kit; the solid footprint stays a square 3x3 on the rim.
// Note: b.dir (0 +x, 1 +z, 2 -x, 3 -z) is the way the pier points over the void; the kit draws it along local +x and the view yaws the group by pierYaw.

import { N } from './config.js';

export const PIER = { size: 3, over: 4, axial: 3.9, lat: 1.9, side: 1 };
export const PIER_DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const pierYaw = (dir) => -(dir | 0) * Math.PI / 2;

// Note: offset in cells from the building centre to a mooring slot (0 left of the pier, 1 right of it, seen from the land).
export function pierSlot(b, slot) {
  const d = PIER_DIRS[((b.dir | 0) % 4 + 4) % 4];
  const s = slot ? 1 : -1;
  // Note: the lateral axis is the pier direction turned a quarter: local +z maps to (-d[1], d[0]) after the yaw.
  return { di: d[0] * PIER.axial - d[1] * PIER.lat * s, dj: d[1] * PIER.axial + d[0] * PIER.lat * s };
}

// Note: side = extra void cells each side of the block; a crosswise hull (3.3 from the axis) may overhang the rim by 0.8, which is fine at gondola height.
// Note: the pier directions a footprint at (x, y, size) may use: its edge cells touch the rim and the overhang cells are void.
export function pierDirs(isl, x, y, size = PIER.size) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const [dx, dz] = PIER_DIRS[d];
    let ok = true;
    for (let k = 0; k < PIER.over && ok; k++) {
      for (let t = -PIER.side; t < size + PIER.side; t++) {
        const i = dx ? (dx > 0 ? x + size + k : x - 1 - k) : x + t;
        const j = dz ? (dz > 0 ? y + size + k : y - 1 - k) : y + t;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (isl.mask[j * N + i]) { ok = false; break; }
      }
    }
    if (ok) out.push(d);
  }
  return out;
}

// Note: the pier direction with the most void beyond the overhang, or -1 when the footprint has none; ties take the lowest direction.
export function pierDir(isl, x, y, size = PIER.size) {
  let best = -1; let bv = -1;
  for (const d of pierDirs(isl, x, y, size)) {
    const [dx, dz] = PIER_DIRS[d];
    let v = 0;
    for (let k = PIER.over; k < PIER.over + 8; k++) {
      for (let t = -PIER.side; t < size + PIER.side; t++) {
        const i = dx ? (dx > 0 ? x + size + k : x - 1 - k) : x + t;
        const j = dz ? (dz > 0 ? y + size + k : y - 1 - k) : y + t;
        if (i < 0 || j < 0 || i >= N || j >= N || !isl.mask[j * N + i]) v++;
      }
    }
    if (v > bv) { bv = v; best = d; }
  }
  return best;
}

// Note: dir to build with: the wanted one when valid, else the best one; 0 when the site has none (old saves never crash).
export function pierDirFor(isl, x, y, want, size = PIER.size) {
  const ok = pierDirs(isl, x, y, size);
  if (Number.isInteger(want) && ok.includes(want)) return want;
  const d = pierDir(isl, x, y, size);
  return d < 0 ? 0 : d;
}
