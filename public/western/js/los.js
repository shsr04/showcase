// Note: sight lines and vision polygons over opaque cells; nothing is remembered between calls.

import { LEAN_OFFSET, FLOOR_H, CHEST_Z, HEAD_Z, EYE_Z } from './config.js';
import { angleDiff } from './rand.js';
import { opaqueAt, solidAt, tileAt, stateAt } from './map.js';
import { TILE_PROPS, cellSolid } from './tiles.js';
import { reliefLine, reliefBlocks, reliefLow, groundAt } from './terrain-height.js';

const DEG = Math.PI / 180;

// Note: walks the cells under the segment; the start cell never blocks so an eye in a doorway still sees.
export function castRay(map, f, x0, y0, x1, y1, heights = null) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { clear: true, x: x1, y: y1 };
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tx = dx > 0 ? (cx + 1 - x0) / dx : dx < 0 ? (x0 - cx) / -dx : Infinity;
  let ty = dy > 0 ? (cy + 1 - y0) / dy : dy < 0 ? (y0 - cy) / -dy : Infinity;
  // Note: item 485: on outdoor relief the line runs between absolute heights, and rising ground blocks it like a wall.
  const rz = reliefLine(map, f, x0, y0, x1, y1, heights);
  for (let guard = 0; guard < 256; guard++) {
    if (cx === ex && cy === ey) return { clear: true, x: x1, y: y1 };
    let t;
    if (tx < ty) {
      t = tx;
      cx += sx;
      tx += tdx;
    } else {
      t = ty;
      cy += sy;
      ty += tdy;
    }
    if (t > 1) return { clear: true, x: x1, y: y1 };
    let blocked = opaqueAt(map, f, cx, cy);
    // Note: item 485: on outdoor relief a rock, a thicket or a spoil heap hides only what lies below its top, so a line from high ground passes over it.
    if (blocked && rz) {
      const top = TILE_PROPS[tileAt(map, f, cx, cy)]?.h ?? Infinity;
      if (Number.isFinite(top)) blocked = reliefLow(map, rz, cx, cy, t, Math.min(1, tx, ty)) < top;
    }
    if (!blocked && rz) blocked = reliefBlocks(map, rz, cx, cy, t, Math.min(1, tx, ty));
    if (!blocked && heights) {
      const tile = tileAt(map, f, cx, cy);
      const p = TILE_PROPS[tile];
      const end = Math.min(1, tx, ty);
      const low = rz ? reliefLow(map, rz, cx, cy, t, end) : Math.min(heights[0] + (heights[1] - heights[0]) * t, heights[0] + (heights[1] - heights[0]) * end);
      // Note: solid furnishings conceal low eyes, while an open door, windows, rails, fences and plants remain see-through.
      blocked = !!(p && cellSolid(tile, stateAt(map, f, cx, cy)) && p.mat && !['fence', 'plant', 'glass'].includes(p.mat) && low < p.h);
    }
    if (blocked) return { clear: false, x: x0 + dx * t, y: y0 + dy * t };
  }
  return { clear: true, x: x1, y: y1 };
}

export const lineClear = (map, f, a, b) => castRay(map, f, a.x, a.y, b.x, b.y).clear;

// Note: lean -1 is left of the facing, +1 right; the offset shrinks until it sits in open floor with a clear segment.
export function eyePosition(map, f, pos, facing, lean) {
  if (!lean) return { x: pos.x, y: pos.y };
  const px = -Math.sin(facing) * lean;
  const py = Math.cos(facing) * lean;
  for (const d of [LEAN_OFFSET, LEAN_OFFSET * 0.67, LEAN_OFFSET * 0.33]) {
    const x = pos.x + px * d;
    const y = pos.y + py * d;
    if (solidAt(map, f, Math.floor(x), Math.floor(y))) continue;
    if (!castRay(map, f, pos.x, pos.y, x, y).clear) continue;
    return { x, y };
  }
  return { x: pos.x, y: pos.y };
}

// Note: the horizon reach as a castRay-shaped hit, for the classic cone over relief.
function reliefHit(map, eye, a, range) {
  const d = Math.min(range, horizonReach(map, eye, a, range, EYE_Z.stand));
  return { clear: d >= range, x: eye.x + Math.cos(a) * d, y: eye.y + Math.sin(a) * d };
}

// Note: the cone fan starts at the eye; the disc is the full ring of radius near around it.
export function visionPolygon(map, f, eye, facing, half, range, near) {
  const cone = [[eye.x, eye.y]];
  const steps = Math.max(2, Math.ceil((2 * half) / (0.5 * DEG)));
  for (let i = 0; i <= steps; i++) {
    const a = facing - half + (2 * half * i) / steps;
    const hit = map.relief && f === 0 ? reliefHit(map, eye, a, range) : castRay(map, f, eye.x, eye.y, eye.x + Math.cos(a) * range, eye.y + Math.sin(a) * range);
    cone.push([hit.x, hit.y]);
  }
  const disc = [];
  const ring = 72;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    const hit = map.relief && f === 0 ? reliefHit(map, eye, a, near) : castRay(map, f, eye.x, eye.y, eye.x + Math.cos(a) * near, eye.y + Math.sin(a) * near);
    disc.push([hit.x, hit.y]);
  }
  return { cone, disc };
}

// Note: zones run from the core outward, each holding a half angle and a range; the innermost one holding the offset and distance wins, or -1.
export function zoneIndex(zones, off, d) {
  for (let i = 0; i < zones.length; i++) if (off <= zones[i].half && d <= zones[i].range) return i;
  return -1;
}

// Note: the furthest any zone reaches at an angle off the facing; 0 outside the whole field.
export function zoneReach(zones, off) {
  let r = 0;
  for (const z of zones) if (off <= z.half && z.range > r) r = z.range;
  return r;
}

export const FEATHER_STEPS = 6;

// Note: the wedges of one zone from widest to narrowest, each with the share q of the zone's own light it holds; the rest is the zone around it, so the light blends across the zone's angular edge.
export function featherWedges(z) {
  if (!(z.feather > 0)) return [{ half: z.half, q: 1 }];
  const out = [];
  for (let j = 0; j < FEATHER_STEPS; j++) out.push({ half: z.half - (z.feather * j) / FEATHER_STEPS, q: (j + 1) / FEATHER_STEPS });
  return out;
}

// Note: piecewise linear value of [t, v] stops at t.
export function stopAt(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return stops[i - 1][1] + ((stops[i][1] - stops[i - 1][1]) * (t - stops[i - 1][0])) / (stops[i][0] - stops[i - 1][0]);
  }
  return stops[stops.length - 1][1];
}

// Note: the light of the zone around zone i at distance d, which stops where that zone's range does.
const outerLight = (zones, i, d) => (zones[i + 1] && d <= zones[i + 1].range ? stopAt(zones[i + 1].light, d / zones[i + 1].range) : 0);

// Note: radial [t, light] stops of zone i over its range at blend q between the zone around it (0) and its own light (1).
export function zoneProfile(zones, i, q) {
  const z = zones[i];
  const nb = zones[i + 1];
  const ts = new Set(z.light.map(([t]) => t));
  if (nb) {
    for (const [t] of nb.light) ts.add(Math.min(1, (t * nb.range) / z.range));
    ts.add(Math.min(1, nb.range / z.range));
  }
  const at = (t) => {
    const out = outerLight(zones, i, t * z.range + 1e-9);
    return out + (stopAt(z.light, t) - out) * q;
  };
  const stops = [...ts].sort((a, b) => a - b).map((t) => [t, at(t)]);
  // Note: the zone around ends abruptly at its range, so the light drops to the zone's own right after it.
  if (nb && nb.range < z.range) {
    const t = Math.min(1, nb.range / z.range + 1e-3);
    stops.push([t, stopAt(z.light, t) * q]);
  }
  return stops;
}

// Note: the share of full light at an offset and distance, point by point as the lighting draws it: the innermost zone holding the point, blended toward its angular edge.
export function zoneLight(zones, off, d) {
  const i = zoneIndex(zones, off, d);
  if (i < 0) return 0;
  const z = zones[i];
  let q = 0;
  for (const w of featherWedges(z)) if (off <= w.half) q = w.q;
  const out = outerLight(zones, i, d);
  return out + (stopAt(z.light, d / z.range) - out) * q;
}

// Note: item 485: the height above the ground that must clear the horizon for a cell to show, about low scrub, so a small swell hides little.
export const SCRUB = 0.3;
// Note: the shortest hidden stretch kept, so the shading does not speckle.
const MIN_HIDDEN = 0.2;

// Note: item 485: what a ray over outdoor relief shows: wall is where a wall or the map edge stops it (Infinity if none within range); hidden lists the [from, to] stretches of ground the terrain or cover hides. A point shows when SCRUB above its cell's ground rises over the steepest ground or cover top before it, the same test castRay makes, so level ground all shows, lower ground shows only within the angle the eye looks down, and of higher ground only the face turned to the eye shows.
export function horizonSpans(map, eye, a, range, eyeHeight) {
  const { W, H } = map;
  const tile = map.floors[0].tile;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const ze = groundAt(map, eye.x, eye.y) + eyeHeight;
  let cx = Math.floor(eye.x);
  let cy = Math.floor(eye.y);
  const sx = ca > 0 ? 1 : -1;
  const sy = sa > 0 ? 1 : -1;
  const tdx = Math.abs(ca) > 1e-9 ? Math.abs(1 / ca) : Infinity;
  const tdy = Math.abs(sa) > 1e-9 ? Math.abs(1 / sa) : Infinity;
  let tx = ca > 0 ? (cx + 1 - eye.x) / ca : ca < 0 ? (eye.x - cx) / -ca : Infinity;
  let ty = sa > 0 ? (cy + 1 - eye.y) / sa : sa < 0 ? (eye.y - cy) / -sa : Infinity;
  let horizon = -Infinity;
  const hidden = [];
  let open = null;
  const close = (d) => {
    if (open !== null && d - open >= MIN_HIDDEN) hidden.push([open, d]);
    open = null;
  };
  let wall = Infinity;
  let d0 = 0;
  for (let guard = 0; guard < 512; guard++) {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
      wall = d0;
      break;
    }
    const i = cy * W + cx;
    const p = TILE_PROPS[tile[i]];
    // Note: a wall or a closed door stops the ray outright, as on flat ground; the eye's own cell never does.
    if (guard > 0 && opaqueAt(map, 0, cx, cy) && !Number.isFinite(p?.h)) {
      wall = d0;
      break;
    }
    const far = Math.min(tx, ty, range);
    const g = map.relief[i];
    // Note: over a flat cell the point SCRUB up shows from an exact distance on: from dt on when it lies below the eye, up to dt when above.
    const c = g + SCRUB - ze;
    const h = horizon - 1e-3;
    let v0 = d0;
    let v1 = far;
    if (h > -Infinity) {
      if (c >= 0) v1 = h <= 0 ? far : Math.min(far, c / h);
      else if (h >= 0) v1 = d0;
      else v0 = Math.max(d0, c / h);
    }
    if (v1 > v0) {
      if (v0 > d0) open ??= d0;
      close(v0);
      if (v1 < far) open ??= v1;
    } else open ??= d0;
    // Note: a cell's flat top hides what lies beyond by its steepest edge: the near edge when it rises over the eye, the far edge when it lies below; the eye's own cell hides nothing, as in castRay.
    const conceals = p && p.h > 0 && (p.opaque || (cellSolid(tile[i], stateAt(map, 0, cx, cy)) && p.mat && !['fence', 'plant', 'glass'].includes(p.mat)));
    const z = g + (conceals ? p.h : 0) - ze;
    if (guard > 0) {
      const rise = z / Math.max(0.3, z > 0 ? d0 : far);
      if (rise > horizon) horizon = rise;
    }
    if (far >= range) break;
    d0 = far;
    if (tx < ty) {
      cx += sx;
      tx += tdx;
    } else {
      cy += sy;
      ty += tdy;
    }
  }
  close(Math.min(wall, range));
  return { wall, hidden };
}

// Note: how far a ray over relief shows open ground without a break: the start of its first hidden stretch, or the wall; Infinity when nothing hides it within range.
export function horizonReach(map, eye, a, range, eyeHeight) {
  const { wall, hidden } = horizonSpans(map, eye, a, range, eyeHeight);
  return hidden.length ? hidden[0][0] : wall;
}

// Note: the wall-stopped length of every ray over the whole field, one per half degree; the zone wedges and the outline all read it.
export function viewField(map, f, eye, facing, half, range, eyeHeight = null) {
  const steps = Math.max(2, Math.ceil((2 * half) / (0.5 * DEG)));
  const rel = new Array(steps + 1);
  const hit = new Array(steps + 1);
  // Note: item 497: on relief each ray also keeps the stretches the ground hides, which the lighting blacks out; null elsewhere.
  const hidden = map.relief && f === 0 ? new Array(steps + 1) : null;
  for (let i = 0; i <= steps; i++) {
    rel[i] = -half + (2 * half * i) / steps;
    const a = facing + rel[i];
    if (hidden) {
      const s = horizonSpans(map, eye, a, range, eyeHeight ?? EYE_Z.stand);
      hit[i] = s.wall;
      hidden[i] = s.hidden;
      continue;
    }
    const h = castRay(map, f, eye.x, eye.y, eye.x + Math.cos(a) * range, eye.y + Math.sin(a) * range, eyeHeight == null ? null : [eyeHeight, eyeHeight]);
    hit[i] = h.clear ? Infinity : Math.hypot(h.x - eye.x, h.y - eye.y);
  }
  return { eye, facing, half, range, rel, hit, hidden };
}

// Note: one wedge as a fan from the eye: the rays within half of the facing, each cut at the wall or at reach; push drives a wall stop that far into the wall so the wall top shows.
export function fieldFan(field, half, reach, push = 0) {
  const { eye, facing, rel, hit } = field;
  const pts = [[eye.x, eye.y]];
  for (let i = 0; i < rel.length; i++) {
    if (Math.abs(rel[i]) > half + 1e-9) continue;
    const a = facing + rel[i];
    const d = push && hit[i] < reach * 0.97 ? hit[i] + push : Math.min(hit[i], reach);
    pts.push([eye.x + Math.cos(a) * d, eye.y + Math.sin(a) * d]);
  }
  return pts;
}

// Note: the outline of everything the zones can show: every ray cut at the wall or at the furthest zone reach at its angle.
export function fieldOutline(field, zones) {
  const { eye, facing, rel, hit } = field;
  const pts = [[eye.x, eye.y]];
  for (let i = 0; i < rel.length; i++) {
    const reach = zoneReach(zones, Math.abs(rel[i]) - 1e-9);
    if (reach <= 0) continue;
    const a = facing + rel[i];
    const d = Math.min(hit[i], reach);
    pts.push([eye.x + Math.cos(a) * d, eye.y + Math.sin(a) * d]);
  }
  return pts;
}

// Note: fov carries either zones (the whole field is their union) or one half angle, a range and an all-round near ring.
export function canSeePoint(map, f, eye, facing, fov, tx, ty) {
  const dx = tx - eye.x;
  const dy = ty - eye.y;
  const d = Math.hypot(dx, dy);
  if (d > fov.range) return false;
  const off = Math.abs(angleDiff(facing, Math.atan2(dy, dx)));
  if (d > fov.near && (fov.zones ? zoneIndex(fov.zones, off, d) < 0 : off > fov.half)) return false;
  return castRay(map, f, eye.x, eye.y, tx, ty, fov.lowEye == null ? null : [fov.lowEye, fov.lowEye]).clear;
}

// Note: a stairwell is the hole a flight cuts in the slab above its lower floor lo: the stairs tile and the run tile above it, as one rectangle.
// Note: stairs is one flight or a list of flights; rect is the first stairwell, kept for callers that know one flight only.
export function makeShaft(stairs) {
  const list = !stairs ? [] : Array.isArray(stairs) ? stairs : [stairs];
  // Note: a site without stairs has no shaft, so nothing passes between floors and rect is null.
  if (!list.length) return { rect: null, flights: [], has: () => false };
  const flights = list.map((s) => {
    const cells = [s, s.run];
    const rect = {
      x0: Math.min(...cells.map((c) => c.x)), y0: Math.min(...cells.map((c) => c.y)),
      x1: Math.max(...cells.map((c) => c.x)) + 1, y1: Math.max(...cells.map((c) => c.y)) + 1,
    };
    return { lo: s.lo ?? 0, rect };
  });
  const inRect = (r, cx, cy) => cx >= r.x0 && cx < r.x1 && cy >= r.y0 && cy < r.y1;
  // Note: slab names the floor above a slab; without it any stairwell counts.
  const has = (cx, cy, slab) => flights.some((fl) => (slab == null || fl.lo + 1 === slab) && inRect(fl.rect, cx, cy));
  return { rect: flights[0].rect, flights, has };
}

// Note: the stairwells of a shaft, also for a bare { rect } made elsewhere.
const wellsOf = (shaft) => shaft?.flights ?? (shaft?.rect ? [{ lo: 0, rect: shaft.rect }] : []);

// Note: the heights at which a person is sampled for sight across floors and lit in the through patch, from a prone body to the top of a standing head; neighbouring heights overlap in the patch.
export const BODY_Z = [0.3, 0.55, 0.8, 1.05, CHEST_Z.stand, 1.45, HEAD_Z.stand];

// Note: z is the height above floor 0 (floor f starts at f * FLOOR_H); the slab under floor f lies at f * FLOOR_H.
export const absZ = (floor, elev, h) => floor * FLOOR_H + elev + h;
export const volumeOf = (z) => (z >= FLOOR_H ? Math.floor(z / FLOOR_H) : 0);

// Note: each flight's walkable surface rises from its foot to its head over one storey; this returns the first crossing fraction for a segment that intersects any of them.
export function flightCrossing(shaft, x0, y0, z0, x1, y1, z1) {
  let best = null;
  for (const { lo, rect: r } of wellsOf(shaft)) {
    const base = lo * FLOOR_H;
    const height = (y) => base + FLOOR_H * (r.y1 - y) / (r.y1 - r.y0);
    const a = z0 - height(y0), b = z1 - height(y1);
    if (a === 0 || a * b > 0) continue;
    const t = a / (a - b);
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && (best === null || t < best)) best = t;
  }
  return best;
}

// Note: a straight 3D line; it may only pass from one floor to the next where it crosses that slab inside a stairwell cut in it, so it can pass several storeys only through one stairwell per slab.
export function lineClear3(map, shaft, eye, zo, tx, ty, zt) {
  if (flightCrossing(shaft, eye.x, eye.y, zo, tx, ty, zt) !== null) return false;
  const vo = volumeOf(zo);
  const vt = volumeOf(zt);
  if (vo === vt) return castRay(map, vo, eye.x, eye.y, tx, ty, [zo - vo * FLOOR_H, zt - vt * FLOOR_H]).clear;
  if (vt >= map.floors.length || vo >= map.floors.length) return false;
  const dir = vt > vo ? 1 : -1;
  let px = eye.x, py = eye.y, pz = zo;
  for (let f = vo; f !== vt; f += dir) {
    const slab = dir > 0 ? f + 1 : f;
    const s = (slab * FLOOR_H - zo) / (zt - zo);
    const qx = eye.x + (tx - eye.x) * s;
    const qy = eye.y + (ty - eye.y) * s;
    if (!shaft?.has(Math.floor(qx), Math.floor(qy), slab)) return false;
    if (!castRay(map, f, px, py, qx, qy, [pz - f * FLOOR_H, slab * FLOOR_H - f * FLOOR_H]).clear) return false;
    [px, py, pz] = [qx, qy, slab * FLOOR_H];
  }
  return castRay(map, vt, px, py, tx, ty, [pz - vt * FLOOR_H, zt - vt * FLOOR_H]).clear;
}

export function canSeePoint3(map, shaft, eye, zo, facing, fov, tx, ty, zt) {
  const dx = tx - eye.x;
  const dy = ty - eye.y;
  const d = Math.hypot(dx, dy);
  if (d > fov.range) return false;
  const off = Math.abs(angleDiff(facing, Math.atan2(dy, dx)));
  if (d > fov.near && (fov.zones ? zoneIndex(fov.zones, off, d) < 0 : off > fov.half)) return false;
  return lineClear3(map, shaft, eye, zo, tx, ty, zt);
}

// Note: distances along a ray where it enters and leaves a rectangle, or null.
function rayRect(ox, oy, dx, dy, r) {
  let lo = 0;
  let hi = Infinity;
  for (const [o, d, a, b] of [[ox, dx, r.x0, r.x1], [oy, dy, r.y0, r.y1]]) {
    if (Math.abs(d) < 1e-9) {
      if (o < a || o > b) return null;
      continue;
    }
    const t1 = (a - o) / d;
    const t2 = (b - o) / d;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  return lo < hi ? [lo, hi] : null;
}

// Note: the patch of the next floor an eye sees through a stairwell for a target at heights zt (a homothety of the stairwell about the eye); null when none.
// Note: zt lie on the floor seen, which must be next to the eye's; well is one of shaft.flights and defaults to the stairwell between those two floors.
export function throughView(map, shaft, eye, zo, facing, half, range, zt, zones = null, well = null) {
  const vo = volumeOf(zo);
  const vt = zt.length ? volumeOf(zt[0]) : vo;
  if (Math.abs(vt - vo) !== 1 || vt >= map.floors.length) return null;
  const lo = Math.min(vo, vt);
  const rect = (well || wellsOf(shaft).find((w) => w.lo === lo))?.rect;
  if (!rect) return null;
  const slabZ = (lo + 1) * FLOOR_H;
  const scales = zt.map((z) => (slabZ - zo) / (z - zo)).filter((s) => s > 0 && s < 1);
  if (!scales.length) return null;
  const near = [];
  const far = [];
  const steps = Math.max(2, Math.ceil((2 * half) / DEG));
  for (let i = 0; i <= steps; i++) {
    const a = facing - half + (2 * half * i) / steps;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const span = rayRect(eye.x, eye.y, dx, dy, rect);
    if (!span) continue;
    const r1 = span[0];
    const px = eye.x + dx * r1;
    const py = eye.y + dy * r1;
    if (r1 > 0 && !castRay(map, vo, eye.x, eye.y, px, py).clear) continue;
    const spans = [];
    for (const s of scales) {
      const n = r1 / s;
      const f = Math.min(span[1] / s, range, zones ? zoneReach(zones, Math.abs(a - facing) - 1e-9) : Infinity);
      if (n < f) spans.push({ n, f, z: zo + (slabZ - zo) / s });
    }
    if (!spans.length) continue;
    let rn = Math.min(...spans.map((p) => p.n)), rf = Math.max(...spans.map((p) => p.f));
    if (rn >= rf) continue;
    const hit = castRay(map, vt, px, py, eye.x + dx * rf, eye.y + dy * rf);
    if (!hit.clear) rf = Math.hypot(hit.x - eye.x, hit.y - eye.y);
    if (rn >= rf) continue;
    // Note: a flight can conceal part of this patch, so each ray is sampled conservatively and the visible interval stays one piece.
    const step = 0.1;
    let start = null, best = null;
    for (let d = rn; d <= rf + step; d += step) {
      const end = Math.min(d, rf);
      const visible = spans.some((p) => end >= p.n && end <= p.f &&
        flightCrossing(shaft, eye.x, eye.y, zo, eye.x + dx * end, eye.y + dy * end, p.z) === null);
      if (visible && start === null) start = end;
      if ((!visible || end === rf) && start !== null) {
        const last = visible ? end : end - step;
        if (last > start && (!best || last - start > best[1] - best[0])) best = [start, last];
        start = null;
      }
    }
    if (!best) continue;
    [rn, rf] = best;
    near.push([eye.x + dx * rn, eye.y + dy * rn]);
    far.push([eye.x + dx * rf, eye.y + dy * rf]);
  }
  if (!near.length) return null;
  return { floor: vt, cone: near.concat(far.reverse()) };
}

// Note: every patch of a next floor the eye sees through the stairwells cut above and below its own floor; body lists heights above a floor, and the widest patch comes first.
export function throughViews(map, shaft, eye, zo, facing, half, range, body, zones = null) {
  const vo = volumeOf(zo);
  const out = [];
  for (const well of wellsOf(shaft)) {
    const vt = well.lo === vo ? vo + 1 : well.lo + 1 === vo ? vo - 1 : -1;
    if (vt < 0 || vt >= map.floors.length) continue;
    const patch = throughView(map, shaft, eye, zo, facing, half, range, body.map((z) => vt * FLOOR_H + z), zones, well);
    if (patch) out.push(patch);
  }
  const area = (p) => Math.abs(p.cone.reduce((sum, [x, y], i) => {
    const [nx, ny] = p.cone[(i + 1) % p.cone.length];
    return sum + x * ny - nx * y;
  }, 0));
  return out.sort((a, b) => area(b) - area(a));
}

// Note: ray-cast point test against a polygon, such as a view cone.
export function inPoly(points, x, y) {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
