// Note: items 485, 497 and 157: playable ground height of an outdoor map (map.relief, metres per cell on floor 0); walking, sight, shots and the drawn field all read the cell steps here.

import { EYE_Z } from './config.js';

// Note: the steepest step between two walkable neighbours; a steeper edge is a scarp tile, never a walkable step.
export const MAX_STEP = 0.5;
// Note: a line must clear the ground by this much, so a grazing ray over a flat crest is not stopped by rounding.
const GRAZE = 0.02;

// Note: the ground height of the cell holding (x, y); a map without relief, an upper floor or a point off the map is level at 0.
export function groundAt(map, x, y, f = 0) {
  const h = map && map.relief;
  if (!h || f !== 0) return 0;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return 0;
  return h[cy * map.W + cx];
}

// Note: a value of a per-cell array at a point in cell units, blended between the four nearest cell centres.
export function blend(a, W, H, u, v) {
  const fx = u - 0.5;
  const fy = v - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = Math.min(W - 1, Math.max(0, x0));
  const xb = Math.min(W - 1, Math.max(0, x0 + 1));
  const ya = Math.min(H - 1, Math.max(0, y0)) * W;
  const yb = Math.min(H - 1, Math.max(0, y0 + 1)) * W;
  return (a[ya + xa] * (1 - tx) + a[ya + xb] * tx) * (1 - ty) + (a[yb + xa] * (1 - tx) + a[yb + xb] * tx) * ty;
}

export const groundOf = (map, a) => groundAt(map, a.x, a.y, a.floor);
export const hasRelief = (map) => !!(map && map.relief);

// Note: absolute heights of a line whose end heights are given above their own ground; null when the map has no relief on this floor.
export function reliefLine(map, f, x0, y0, x1, y1, heights) {
  if (!map || !map.relief || f !== 0) return null;
  const h0 = heights ? heights[0] : EYE_Z.stand;
  const h1 = heights ? heights[1] : EYE_Z.stand;
  const z0 = groundAt(map, x0, y0) + h0;
  return { z0, dz: groundAt(map, x1, y1) + h1 - z0 };
}

// Note: the lowest point of the line inside the cell crossed between t0 and t1, above that cell's ground.
export function reliefLow(map, line, cx, cy, t0, t1) {
  const low = line.z0 + line.dz * (line.dz > 0 ? t0 : t1);
  return low - map.relief[cy * map.W + cx];
}

// Note: true when the ground of a crossed cell rises above the line, so a ridge, a bank or a swell hides what lies beyond.
export function reliefBlocks(map, line, cx, cy, t0, t1) {
  if (cx < 0 || cy < 0 || cx >= map.W || cy >= map.H) return false;
  return reliefLow(map, line, cx, cy, t0, t1) < -GRAZE;
}

// Note: the ground's gradient (rise per metre east and south) from the neighbouring cells, so pace changes smoothly across stepped cells.
export function slopeAt(map, x, y) {
  if (!map || !map.relief) return { gx: 0, gy: 0 };
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const g = (dx, dy) => {
    const nx = Math.min(map.W - 1, Math.max(0, cx + dx));
    const ny = Math.min(map.H - 1, Math.max(0, cy + dy));
    return map.relief[ny * map.W + nx];
  };
  return { gx: (g(1, 0) - g(-1, 0)) / 2, gy: (g(0, 1) - g(0, -1)) / 2 };
}

// Note: Tobler's hiking function relative to level ground: about 0.7 of the pace up a one-in-ten grade, a little faster gently downhill, slower down a steep one.
export function slopeSpeed(map, x, y, mx, my) {
  if (!map || !map.relief) return 1;
  const len = Math.hypot(mx, my);
  if (len < 1e-9) return 1;
  const { gx, gy } = slopeAt(map, x, y);
  const grade = (gx * mx + gy * my) / len;
  const k = Math.exp(-3.5 * Math.abs(grade + 0.05)) / Math.exp(-3.5 * 0.05);
  return Math.max(0.35, Math.min(1.1, k));
}

// Note: the lowest and highest ground of a map, for the view and the tests.
export function reliefRange(map) {
  if (!map || !map.relief) return { lo: 0, hi: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of map.relief) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}
