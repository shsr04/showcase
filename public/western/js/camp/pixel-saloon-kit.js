// Note: the saloon as one place in metres for all eight saloon panels (items 383, 384, 387, 388): a plank floor, a bar with a brass rail and a back bar with a real mirror, hanging lamps, tables and chairs, a piano, stairs to a gallery, and batwing doors to the street; each panel films it from its own camera.

import { C } from '../palette.js';
import { Px, step, dith, NONE } from './pixel-art.js';
import { box, trace, lightAt, noise } from './pixel-3d.js';
import { place } from './pixel-kit.js';
import { pixelSide, pixelFigure } from './pixel-figure.js';
import { SKINS, HAIRS, HAIR_STYLES, BEARDS, MOUSTACHES } from './looks.js';

// Note: the room: x runs along the street, z runs back from the front wall (z = 0, the street at z > 0), the bar stands on the right.
export const ROOM = { w: 10, d: 9, h: 4.7, gal: 2.5, galZ: -7.6, bar: 7.6 };
export const DOOR = [3.9, 5.9, 0, 2.3];
const WINDOWS = [[0.9, 2.9, 0.8, 2.7], [6.9, 8.9, 0.8, 2.7]];
// Note: the window panes with their muntins between, so a sun patch on the floor is crossed by the bars.
const PANES = WINDOWS.flatMap(([x0, x1, y0, y1]) => {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return [[x0, mx - 0.03, y0, my - 0.03], [mx + 0.03, x1, y0, my - 0.03], [x0, mx - 0.03, my + 0.03, y1], [mx + 0.03, x1, my + 0.03, y1]];
});
const OPENINGS = [DOOR, ...PANES];
const PORCH = { d: 3.4, y: 3.4 };

// Note: is the point (x, y) inside the rectangle [x0, x1, y0, y1].
const inR = (x, y, R) => x > R[0] && x < R[1] && y > R[2] && y < R[3];
// Note: a material of one flat colour.
const solid = (c) => () => ({ c });
// Note: the difference of two vectors.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
// Note: a vector scaled to unit length.
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Note: the light of each mood: ambient bounce, the sun or moon outside the front wall, how bright the lamps burn, and the sky.
const MOODS = {
  day: { warm: true, amb: 0.15, sun: { pos: [-9, 15, 22], power: 3.0, reach: 40 }, lamps: 0.3, spill: 0, sky: 'day', skylight: 1.0 },
  overcast: { amb: 0.32, sun: { pos: [0, 30, 20], power: 0.5, reach: 40 }, lamps: 0.85, spill: 0.3, sky: 'overcast', skylight: 0.75 },
  dusk: { amb: 0.1, sun: { pos: [-16, 3.4, 20], power: 5.0, reach: 40 }, lamps: 0.8, spill: 0.8, sky: 'dusk', skylight: 0.45 },
  dawn: { amb: 0.17, sun: { pos: [16, 6.5, 20], power: 4.6, reach: 40 }, lamps: 0.5, spill: 0.6, sky: 'dawn', skylight: 0.7, warm: true },
  night: { amb: 0.08, sun: { pos: [8, 14, 20], power: 0.6, reach: 40 }, lamps: 1.0, spill: 1.0, sky: 'night', skylight: 0.12 },
};

// Note: a light level to a colour along the ramp: like the ray caster's shading but with dither only in the middle of each step, so large surfaces read as clean bands.
function shadeClean(base, level, x, y, cool = false) {
  const stops = [0.07, 0.16, 0.3, 0.52, 0.85, 1.35, 2.1];
  let k = -3;
  let frac = 0;
  for (let i = 0; i < stops.length; i++) {
    if (level < stops[i]) {
      const lo = i ? stops[i - 1] : 0;
      frac = (level - lo) / (stops[i] - lo);
      break;
    }
    k = i - 2;
    frac = 1;
  }
  if (level >= stops[stops.length - 1]) { k = 4; frac = 0; }
  const f2 = Math.max(0, Math.min(1, (frac - 0.35) / 0.3));
  const kk = f2 >= 1 ? k + 1 : f2 > 0 && dith(x, y, f2) ? k + 1 : k;
  if (cool && level < 0.1) return C.BLUE_D;
  return step(base, kk - 1);
}

// Note: planks with seams, grain, knots and the odd darker board, as a function of the position along and across the boards.
export function boards(c, along, across, width = 0.2) {
  const u = along / width;
  const i2 = Math.floor(u);
  const f2 = u - i2;
  if (f2 < 0.07) return { c: step(c, -2) };
  const base = noise(i2, 7) < 0.3 ? step(c, -1) : c;
  const grain = noise(i2 * 3 + Math.floor(f2 * 4), Math.floor(across * 14));
  if (grain > 0.9) return { c: step(base, -1) };
  if (noise(i2, Math.floor(across * 2)) > 0.97 && Math.abs(f2 - 0.5) < 0.2) return { c: step(base, -2) };
  return { c: base };
}

// Note: the plank floor: boards along z, butt joints staggered, worn patches, spilled sawdust and scuffs.
const floorMat = (p) => {
  const i = Math.floor(p[0] / 0.2);
  const m = boards(C.WOOD, p[0], p[2], 0.2);
  const jz = (((p[2] + noise(i, 3) * 2.2) % 2.2) + 2.2) % 2.2;
  if (jz < 0.03) m.c = step(C.WOOD, -2);
  if (noise(Math.floor(p[0] * 1.2), Math.floor(p[2] * 1.2)) > 0.8) m.c = step(m.c, -1);
  return m;
};

// Note: the interior wall: dark wainscot with raised panels and a chair rail, striped paper above, a cornice at the top.
const wallMat = (p) => {
  const [x, y, z] = p;
  const a = Math.abs(x) > 5 && Math.abs(z) < 5 ? z : x + z;
  if (y < 1.1) {
    const u = (a / 0.7) - Math.floor(a / 0.7);
    if (y < 0.14) return { c: C.WOOD_D };
    if (u < 0.07 || y > 1.0 || (y > 0.2 && y < 0.24)) return { c: step(C.WOOD, -1) };
    return { c: y > 0.24 && y < 0.98 && u > 0.14 && u < 0.86 ? step(C.WOOD, 0) : step(C.WOOD, -1) };
  }
  if (y < 1.16) return { c: C.WOOD_L };
  if (y > ROOM.h - 0.28) return { c: Math.floor(a / 0.14) % 2 ? C.WOOD : C.WOOD_D };
  const s = Math.floor(a / 0.26);
  return { c: a / 0.26 - s < 0.05 ? C.ADOBE_D : C.ADOBE };
};

// Note: the bar front in raised panels with gilt rosettes, the kick board and the apron under the top.
const barFront = (p, n) => {
  if (n[0] > -0.5) return { c: C.WOOD_D };
  const z = -p[2];
  const u = z / 0.75 - Math.floor(z / 0.75);
  const y = p[1];
  if (y < 0.12) return { c: C.WOOD_D };
  if (y > 0.98) return { c: C.GOLD };
  if (u < 0.08 || u > 0.92 || y < 0.2 || y > 0.9) return { c: C.WOOD_D };
  if (Math.abs(u - 0.5) < 0.04 && Math.abs(y - 0.55) < 0.04) return { c: C.GOLD };
  return { c: Math.abs(u - 0.5) < 0.3 && Math.abs(y - 0.55) < 0.29 ? C.WOOD : C.WOOD_D };
};

// Note: polished bar top, lighter at the lip, with the odd ring of a glass.
const barTopMat = (p) => {
  const ring = noise(Math.floor(p[2] * 7), 11) > 0.93 && Math.hypot((p[2] * 7) % 1 - 0.5, (p[0] * 7) % 1 - 0.5) < 0.33 && Math.hypot((p[2] * 7) % 1 - 0.5, (p[0] * 7) % 1 - 0.5) > 0.2;
  if (ring) return { c: step(C.WOOD, -1) };
  if (p[0] < 7.66 || p[0] > 8.3) return { c: C.WOOD_L };
  return { c: noise(Math.floor(p[2] * 30), 4) > 0.8 ? C.WOOD_L : C.WOOD };
};

// Note: a row of bottles standing on a shelf, as a thin box with holes between: bodies, necks, caps and labels in several colours.
const BOTTLE_COLOURS = [C.GREEN_D, C.RED_D, C.GOLD, C.GLASS, C.WOOD_L, C.STONE, C.GREEN];
const bottlesMat = (y0, broken = 0) => (p) => {
  const u = -p[2] / 0.12;
  const k = Math.floor(u);
  const fu = u - k;
  const yy = p[1] - y0;
  if (broken && noise(k, 31) < broken) return yy < 0.06 && fu > 0.2 && fu < 0.8 ? { c: C.GLASS_L } : null;
  const col = BOTTLE_COLOURS[Math.floor(noise(k, 5) * BOTTLE_COLOURS.length)];
  const tall = 0.3 + noise(k, 9) * 0.06;
  if (yy < 0.18 && fu > 0.1 && fu < 0.9) return { c: yy > 0.07 && yy < 0.1 && fu > 0.2 && fu < 0.8 ? C.PLASTER : col };
  if (yy >= 0.18 && yy < 0.24 && fu > 0.25 && fu < 0.75) return { c: col };
  if (yy >= 0.24 && yy < tall && fu > 0.38 && fu < 0.62) return { c: yy > tall - 0.03 ? C.WOOD_D : col };
  return null;
};

// Note: the mirror: a ray from the surface bounces off it into the room, so the lamps, the bar and the gallery show in it; the glass dims and tints what it shows, and a gloss streak crosses it; a crack stars out from a point when broken.
function mirrorMat(S, crack = null) {
  return (p) => {
    const [x, y, z] = p;
    if (crack) {
      const dy = y - crack[0];
      const dz = z - crack[1];
      const r = Math.hypot(dy, dz);
      const ang = Math.atan2(dy, dz);
      if (r < 0.1 && noise(Math.floor(y * 20), Math.floor(z * 20)) > 0.3) return null;
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + noise(k, 3) * 0.5;
        const da = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (Math.abs(da - Math.PI) < 0.035 / (0.2 + r) * 0.6 && r < 0.4 + noise(k, 8) * 1.1) return { emit: C.PLASTER_L };
      }
      if (Math.abs(r - 0.28) < 0.015 || Math.abs(r - 0.55) < 0.015) return { emit: C.BONE };
    }
    const d = norm(sub(p, S.camPos));
    const rd = [-d[0], d[1], d[2]];
    const h2 = trace(S.reflect || S.boxes, p, rd);
    let c = C.BLUE_D;
    if (h2) {
      const m = h2.m;
      if (m.emit != null) c = m.emit;
      else {
        const lv = lightAt(h2.p, h2.n, S.lights.filter((li) => !li.shadows), S.boxes, (m.ambient ?? 1) * S.ambient) * (m.k ?? 1);
        c = shadeClean(m.c, lv, Math.floor(y * 40), Math.floor(z * 40), false);
      }
    }
    const g = (((z * 2.2 + y * 3.4) % 3.0) + 3.0) % 3.0;
    if (g < 0.05) return { emit: C.GLASS_L };
    const dark = c <= C.DARK;
    return { emit: dark ? C.BLUE_D : step(c, -1) };
  };
}

// Note: a chair facing (dx, dz): seat, back and four legs.
function chair(x, z, dx, dz, col = C.WOOD) {
  const out = [box([x - 0.21, 0.44, z - 0.21], [x + 0.21, 0.48, z + 0.21], solid(C.WOOD_L))];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(box([x + a * 0.19 - 0.025, 0, z + b * 0.19 - 0.025], [x + a * 0.19 + 0.025, 0.44, z + b * 0.19 + 0.025], solid(col)));
  const bx = x - dx * 0.19;
  const bz = z - dz * 0.19;
  const ex = dx ? 0.02 : 0.21;
  const ez = dz ? 0.02 : 0.21;
  out.push(box([bx - ex, 0.48, bz - ez], [bx + ex, 0.95, bz + ez], (p) => ({ c: p[1] > 0.88 || p[1] < 0.54 ? col : Math.floor((dx ? p[2] : p[0]) / 0.07) % 2 ? col : step(col, -1) })));
  return out;
}

// Note: a chair tipped over backwards: the seat on edge, the back flat on the floor, the legs in the air.
function chairFallen(x, z, dx, dz) {
  const sx = dx ? 0.02 : 0.21;
  const sz = dz ? 0.02 : 0.21;
  const out = [
    box([x - sx, 0, z - sz], [x + sx, 0.42, z + sz], solid(C.WOOD_L)),
    box([x - dx * 0.5 - (dx ? 0 : 0.21), 0, z - dz * 0.5 - (dz ? 0 : 0.21)], [x + (dx > 0 ? 0 : dx ? 0 : 0.21), 0.05, z + (dz > 0 ? 0 : dz ? 0 : 0.21)], solid(C.WOOD)),
  ];
  for (const s of [-1, 1]) {
    const lx = dx ? 0 : s * 0.19;
    const lz = dz ? 0 : s * 0.19;
    out.push(box([x + lx - 0.025 + (dx > 0 ? 0 : dx ? -0.44 : 0), 0.36, z + lz - 0.025 + (dz > 0 ? 0 : dz ? -0.44 : 0)], [x + lx + 0.025 + (dx > 0 ? 0.44 : 0), 0.41, z + lz + 0.025 + (dz > 0 ? 0.44 : 0)], solid(C.WOOD)));
  }
  return out;
}

// Note: a square card table with a pedestal, its top planked.
function table(x, z, s = 0.95, mat = null) {
  return [
    box([x - s / 2, 0.73, z - s / 2], [x + s / 2, 0.77, z + s / 2], mat || ((p) => ({ c: p[0] < x - s / 2 + 0.03 || p[0] > x + s / 2 - 0.03 || p[2] < z - s / 2 + 0.03 || p[2] > z + s / 2 - 0.03 ? C.WOOD_D : noise(Math.floor((p[0] - x) / 0.12), 2) > 0.8 ? C.WOOD : C.WOOD_L }))),
    box([x - 0.07, 0.08, z - 0.07], [x + 0.07, 0.73, z + 0.07], solid(C.WOOD_D)),
    box([x - 0.32, 0, z - 0.05], [x + 0.32, 0.08, z + 0.05], solid(C.WOOD_D)),
    box([x - 0.05, 0, z - 0.32], [x + 0.05, 0.08, z + 0.32], solid(C.WOOD_D)),
  ];
}

// Note: a table kicked over: the top on edge, the pedestal on its side.
function tableFallen(x, z, along = 'z', leg = 1) {
  const a = along === 'z';
  // Note: the top on edge shows its bare underside: boards with seams held by two dark battens, so it never reads as a blank slab.
  const top = (p) => {
    const u = (a ? p[2] - z : p[0] - x) + 0.47;
    const v = p[1];
    if (u < 0.03 || u > 0.91 || v < 0.03 || v > 0.92) return { c: C.WOOD_D };
    if (Math.abs(v - 0.24) < 0.04 || Math.abs(v - 0.7) < 0.04) return { c: C.WOOD_D };
    const board = Math.floor(u / 0.157);
    if (u - board * 0.157 < 0.016) return { c: C.WOOD_D };
    return { c: noise(board, 2) > 0.65 ? C.WOOD_L : C.WOOD };
  };
  return [
    box(a ? [x - 0.02, 0, z - 0.47] : [x - 0.47, 0, z - 0.02], a ? [x + 0.02, 0.95, z + 0.47] : [x + 0.47, 0.95, z + 0.02], top),
    box(a ? [x + 0.02 * leg - (leg < 0 ? 0.72 : 0), 0.36, z - 0.07] : [x - 0.07, 0.36, z + 0.02 * leg - (leg < 0 ? 0.72 : 0)], a ? [x + (leg > 0 ? 0.74 : -0.02), 0.5, z + 0.07] : [x + 0.07, 0.5, z + (leg > 0 ? 0.74 : -0.02)], solid(C.WOOD_D)),
    box(a ? [x + 0.66 * leg - 0.03, 0.2, z - 0.32] : [x - 0.32, 0.2, z + 0.66 * leg - 0.03], a ? [x + 0.72 * leg + 0.03, 0.28, z + 0.32] : [x + 0.32, 0.28, z + 0.72 * leg + 0.03], solid(C.WOOD_D)),
  ];
}

// Note: a hanging oil lamp: chain, brass dish and glowing glass; returns its boxes and a light below it.
function lamp(x, y, z, power, o = {}) {
  const boxes = [
    box([x - 0.012, y + 0.14, z - 0.012], [x + 0.012, ROOM.h - 0.04, z + 0.012], solid(C.IRON)),
    box([x - 0.26, y + 0.06, z - 0.26], [x + 0.26, y + 0.1, z + 0.26], (p) => ({ c: Math.abs(p[0] - x) < 0.2 && Math.abs(p[2] - z) < 0.2 ? C.GOLD : C.WOOD_D })),
    box([x - 0.1, y + 0.1, z - 0.1], [x + 0.1, y + 0.16, z + 0.1], solid(C.GOLD)),
    box([x - 0.1, y - 0.2, z - 0.1], [x + 0.1, y + 0.06, z + 0.1], () => ({ emit: C.GOLD_L }), { noShadow: true }),
    box([x - 0.06, y - 0.24, z - 0.06], [x + 0.06, y - 0.2, z + 0.06], solid(C.GOLD)),
  ];
  const light = { pos: [x, y - 0.15, z], power, reach: o.reach ?? 3.4, visible: o.visible, lamp: true };
  return { boxes, light };
}

// Note: the whole room for a mood; o.wrecked, o.ring and o.door shape the furniture and the batwings; returns boxes, lights, sky, ambient and the sun's reach test for the shafts.
export function buildSaloon(mood = 'day', o = {}, camPos = [0, 1.5, 0]) {
  const M = MOODS[mood] || MOODS.day;
  const S = { boxes: [], lights: [], ambient: (o.amb ?? M.amb) * (o.dim ?? 1), camPos, M: o.sun ? { ...M, sun: { ...M.sun, ...o.sun } } : M, mood, sunVisible: null, lamps: [] };
  const add = (...bs) => { for (const b of bs.flat()) S.boxes.push(b); };
  const W = ROOM.w;
  const D = ROOM.d;
  const Hh = ROOM.h;

  // Note: could the point see the sun or moon through an opening of the front wall, under the porch roof.
  const sun = o.sun ? { ...M.sun, ...o.sun } : M.sun;
  const reachSun = (p) => {
    const v = sub(sun.pos, p);
    if (p[2] >= -0.01) {
      if (p[2] < PORCH.d && p[1] < PORCH.y) {
        const s = (PORCH.y - p[1]) / v[1];
        if (p[2] + v[2] * s < PORCH.d) return false;
      }
      return true;
    }
    const t = -p[2] / v[2];
    const q = [p[0] + v[0] * t, p[1] + v[1] * t];
    if (!OPENINGS.some((R) => inR(q[0], q[1], R))) return false;
    const s2 = (PORCH.d - p[2]) / v[2];
    return p[1] + v[1] * s2 < PORCH.y - 0.05;
  };
  S.sunVisible = (p) => p[2] < -0.01 && reachSun(p);
  S.lights.push({ pos: sun.pos, power: sun.power, reach: sun.reach, visible: (p) => p[2] < -0.01 && reachSun(p), shadows: !o.noShadow });
  S.lights.push({ pos: sun.pos, power: sun.power, reach: sun.reach, visible: (p) => p[2] >= -0.01 && reachSun(p) });
  // Note: open sky fills the street, so the far buildings facing the saloon are not left in the sun's shadow.
  S.lights.push({ pos: [5, 10, 4], power: 3.0 * M.skylight, reach: 14, visible: (p) => p[2] >= -0.01 });
  // Note: skylight spilling through each pane and the door, pooling near the front wall.
  for (const R of [DOOR, ...WINDOWS]) S.lights.push({ pos: [(R[0] + R[1]) / 2, (R[2] + R[3]) / 2 + 0.2, 0.6], power: M.skylight * 1.1, reach: 2.4, visible: (p) => p[2] < -0.01 });

  // Note: the shell: floor, ceiling with beams, the walls, the front wall with its openings and the exterior face.
  add(
    box([-0.3, -0.3, -D - 0.3], [W + 0.3, 0, 0], floorMat),
    box([-0.3, Hh, -D - 0.3], [W + 0.3, Hh + 0.2, 0], (p) => ({ c: Math.abs(((p[0] % 0.9) + 0.9) % 0.9 - 0.45) < 0.02 || Math.abs(((p[2] % 0.9) + 0.9) % 0.9 - 0.45) < 0.02 ? C.IRON : C.STONE })),
    box([-0.3, 0, -D - 0.3], [W + 0.3, Hh, -D], (p) => (p[1] > ROOM.gal && p[1] < ROOM.gal + 2.0 ? upstairsWall(p) : p[1] < 0.1 ? { c: C.WOOD_D } : wallMat(p))),
    box([-0.3, 0, -D], [0, Hh, 0], wallMat),
    box([W, 0, -D], [W + 0.3, Hh, 0], wallMat),
    ...[1.8, 4.5, 7.2].map((x) => box([x, Hh - 0.28, -D], [x + 0.18, Hh, 0], solid(C.WOOD_D))),
  );
  const sign = new Px(160, 26);
  sign.rect(0, 0, 160, 26, C.WOOD_D);
  sign.rect(2, 2, 156, 22, C.RED_D);
  sign.rect(3, 3, 154, 1, C.GOLD);
  sign.rect(3, 22, 154, 1, C.GOLD);
  for (let x = 6; x < 156; x += 6) { sign.set(x, 5, C.GOLD); sign.set(x, 20, C.GOLD); }
  const txt = 'SALOON';
  const tw = txt.length * 12 - 3;
  for (const [dx, dy, c] of [[-1, 0, C.SHADOW], [1, 0, C.SHADOW], [0, -1, C.SHADOW], [0, 1, C.SHADOW], [1, 2, C.SHADOW], [2, 2, C.SHADOW], [0, 0, C.GOLD_L]]) {
    for (let g = 0; g < txt.length; g++) glyph(sign, txt[g], 80 - tw / 2 + g * 12 + dx, 6 + dy, c);
  }
  const front = (p, n) => {
    const [x, y] = p;
    if (OPENINGS.some((R) => inR(x, y, R))) return null;
    if (n[2] < 0.5) return n[2] < -0.5 ? wallMat(p) : { c: C.WOOD_D };
    if (inR(x, y, [2.4, 7.4, 3.65, 4.55])) return { c: sign.get(Math.floor(((x - 2.4) / 5) * 160), Math.floor(((4.55 - y) / 0.9) * 26)) };
    if (y > 5.4) return { c: C.WOOD_D };
    const lap = Math.floor(y / 0.17);
    const f2 = y / 0.17 - lap;
    if (f2 < 0.12) return { c: C.WOOD_D };
    return { c: noise(lap, Math.floor(x * 1.3)) > 0.7 ? C.PLANK : C.PLANK_L };
  };
  add(box([-12, 0, -0.25], [30, 5.6, 0], front));
  // Note: frames of the windows and the door: reveals, sills, jambs, lintel and the header.
  for (const [x0, x1, y0, y1] of WINDOWS) {
    add(
      box([x0 - 0.1, y0 - 0.1, -0.25], [x1 + 0.1, y0, 0.12], solid(C.WOOD_L)),
      box([x0 - 0.1, y1, -0.25], [x1 + 0.1, y1 + 0.1, 0.1], solid(C.WOOD_D)),
      box([x0 - 0.1, y0, -0.25], [x0, y1, 0.1], solid(C.WOOD_D)),
      box([x1, y0, -0.25], [x1 + 0.1, y1, 0.1], solid(C.WOOD_D)),
      box([(x0 + x1) / 2 - 0.03, y0, -0.1], [(x0 + x1) / 2 + 0.03, y1, -0.04], solid(C.WOOD_D)),
      box([x0, (y0 + y1) / 2 - 0.03, -0.1], [x1, (y0 + y1) / 2 + 0.03, -0.04], solid(C.WOOD_D)),
    );
  }
  add(
    box([DOOR[0] - 0.12, 0, -0.25], [DOOR[0], DOOR[3] + 0.12, 0.12], solid(C.WOOD_D)),
    box([DOOR[1], 0, -0.25], [DOOR[1] + 0.12, DOOR[3] + 0.12, 0.12], solid(C.WOOD_D)),
    box([DOOR[0] - 0.12, DOOR[3], -0.25], [DOOR[1] + 0.12, DOOR[3] + 0.12, 0.12], solid(C.WOOD_D)),
    box([DOOR[0] - 0.05, -0.04, -0.25], [DOOR[1] + 0.05, 0.02, 0.1], solid(C.WOOD_D)),
  );

  // Note: the batwing doors: slats on a hinge at each jamb, swung by the angles in o.door (radians, positive outward); the slats are small boxes so any angle shows.
  const [aL, aR] = o.door || [0.02, 0.02];
  const n = 10;
  const lw = 0.95;
  const slat = (hx, hz, dir, ang, k) => {
    const s = ((k + 0.5) * lw) / n;
    const sx = hx + dir * s * Math.cos(ang);
    const sz = hz + s * Math.sin(ang);
    return box([sx - 0.028, 0.5, sz - 0.028], [sx + 0.028, 1.66, sz + 0.028], (p) => ({ c: p[1] > 1.6 || p[1] < 0.56 || Math.abs(p[1] - 1.1) < 0.025 ? C.GREEN_D : k % 2 ? C.GREEN : C.GREEN_D }));
  };
  for (let k = 0; k < n; k++) add(slat(DOOR[0] + 0.03, -0.1, 1, aL, k), slat(DOOR[1] - 0.03, -0.1, -1, aR, k));
  add(box([DOOR[0], 1.62, -0.12], [DOOR[0] + 0.1, 1.7, -0.02], solid(C.IRON)), box([DOOR[1] - 0.1, 1.62, -0.12], [DOOR[1], 1.7, -0.02], solid(C.IRON)));

  // Note: the street side: the boardwalk, porch roof and posts, hitching rail, trough, the street and the buildings opposite.
  add(
    box([-12, -0.12, 0], [30, 0, PORCH.d], (p) => { const m = boards(C.WOOD, p[2], p[0], 0.22); if (noise(Math.floor(p[0] * 2), Math.floor(p[2] / 0.22)) > 0.97) m.c = C.SHADOW; return m; }),
    box([-12, -0.42, PORCH.d], [30, -0.12, PORCH.d + 0.06], solid(C.WOOD_D)),
    box([-12, -0.6, PORCH.d + 0.06], [30, -0.4, 60], (p) => ({ c: noise(Math.floor(p[0] * 4), Math.floor(p[2] * 4)) > 0.8 ? C.SAND_L : Math.abs(((p[2] - 6) % 2.4)) < 0.1 ? C.SAND_D : C.SAND })),
    box([-12, PORCH.y, 0], [30, PORCH.y + 0.12, PORCH.d + 0.1], (p) => ({ c: (((p[0] % 0.6) + 0.6) % 0.6) < 0.1 ? C.SHADOW : C.WOOD_D })),
    ...[-1.2, 2.0, 8.0, 11.2].map((x0) => box([x0, 0, PORCH.d - 0.18], [x0 + 0.17, PORCH.y, PORCH.d - 0.01], solid(C.WOOD))),
    box([-12, -0.62, 15], [40, 6.4, 15.3], (p) => {
      const seg = Math.floor((p[0] + 12) / 7);
      if (p[1] > 4.8 + noise(seg, 1) * 1.6) return null;
      const wx = (p[0] + 12) % 7;
      if (p[1] > 1.4 && p[1] < 2.6 && Math.abs(wx - 2) < 0.5) return mood === 'night' || mood === 'dusk' ? (noise(seg, 2) > 0.5 ? { emit: C.GOLD } : { c: C.SHADOW }) : { c: C.WOOD_D };
      return boards([C.WOOD, C.ADOBE, C.WOOD_L][seg % 3], p[0], p[1], 0.25);
    }),
  );

  // Note: the bar: front, top, brass rail on posts and the spittoons on the floor.
  add(
    box([7.6, 0, -7.6], [8.28, 1.05, -1.4], barFront),
    box([7.54, 1.05, -7.66], [8.36, 1.12, -1.34], barTopMat),
    box([7.4, 0.24, -7.4], [7.46, 0.3, -1.6], (p) => ({ c: p[1] > 0.285 ? C.GOLD_L : C.GOLD })),
    ...[-1.6, -3.1, -4.6, -6.1, -7.4].map((z) => box([7.44, 0, z - 0.02], [7.5, 0.26, z + 0.02], solid(C.GOLD))),
  );
  for (const z of [-2.2, -5.4, -7.0]) {
    add(box([7.0, 0, z - 0.14], [7.3, 0.16, z + 0.14], solid(C.GOLD)), box([6.95, 0.16, z - 0.18], [7.35, 0.22, z + 0.18], (p) => ({ c: Math.abs(p[0] - 7.15) < 0.14 && Math.abs(p[2] - z) < 0.13 ? C.WOOD_D : C.GOLD_L })));
  }

  // Note: the back bar: cupboards, a counter, two shelves of bottles, the framed mirror with its carved crown.
  const crack = o.crack || null;
  add(
    box([9.3, 0, -7.5], [10, 1.0, -1.6], (p, nn) => (nn[0] < -0.5 ? barFront([0, p[1], p[2]], [-1, 0, 0]) : { c: C.WOOD_D })),
    box([9.26, 1.0, -7.54], [10, 1.06, -1.56], solid(C.WOOD_L)),
    box([9.7, 1.5, -6.9], [9.94, 1.55, -2.1], solid(C.WOOD)),
    box([9.7, 2.2, -6.9], [9.94, 2.25, -2.1], solid(C.WOOD)),
    box([9.74, 1.55, -6.88], [9.88, 1.89, -2.12], bottlesMat(1.55, o.wrecked ? 0.45 : 0), { noShadow: true }),
    box([9.74, 2.25, -6.88], [9.88, 2.59, -2.12], bottlesMat(2.25, o.wrecked ? 0.3 : 0), { noShadow: true }),
    box([9.93, 1.25, -7.1], [9.98, 3.3, -1.9], mirrorMat(S, crack), { noShadow: true }),
    box([9.9, 1.15, -7.25], [10, 1.25, -1.75], solid(C.GOLD)),
    box([9.9, 3.3, -7.25], [10, 3.45, -1.75], solid(C.GOLD)),
    box([9.9, 1.25, -7.25], [10, 3.3, -7.1], solid(C.GOLD)),
    box([9.9, 1.25, -1.9], [10, 3.3, -1.75], solid(C.GOLD)),
    box([9.78, 3.45, -7.5], [10, 3.95, -1.5], (p) => ({ c: p[1] > 3.85 || Math.floor(-p[2] / 0.25) % 2 ? C.WOOD_D : C.WOOD })),
  );

  // Note: the stairs on the left wall climbing back to the gallery, with the banister.
  for (let k = 0; k < 12; k++) {
    const z0 = -2.5 - k * 0.42;
    add(
      box([0, 0, z0 - 0.42], [1.2, (k + 1) * 0.208, z0], (p, nn) => (nn[1] > 0.5 ? { c: Math.abs(p[2] - (z0 - 0.42)) < 0.05 ? C.WOOD_D : C.WOOD_L } : { c: C.WOOD_D })),
      box([1.1, (k + 1) * 0.208 + 0.88, z0 - 0.42], [1.2, (k + 1) * 0.208 + 0.95, z0], () => ({ c: C.WOOD_L, k: 1.8 })),
    );
    if (k % 3 === 0) add(box([1.12, k * 0.208 + 0.2, z0 - 0.1], [1.18, (k + 1) * 0.208 + 0.88, z0 - 0.04], solid(C.WOOD_D)));
  }
  // Note: the gallery: floor, a baluster rail along the edge, the doors to the rooms along the back wall.
  add(
    box([0, ROOM.gal - 0.18, -D], [W, ROOM.gal, ROOM.galZ], (p, nn) => (nn[1] > 0.5 ? boards(C.WOOD, p[2], p[0], 0.2) : { c: Math.abs(p[2] - ROOM.galZ) < 0.1 && p[1] > ROOM.gal - 0.1 ? C.WOOD_L : C.WOOD_D })),
    box([0, ROOM.gal - 0.35, ROOM.galZ - 0.1], [W, ROOM.gal - 0.18, ROOM.galZ + 0.05], (p) => ({ c: Math.floor(p[0] / 0.3) % 2 ? C.WOOD_D : C.WOOD })),
  );

  if (!o.noRail) {
    add(
      box([0, ROOM.gal, ROOM.galZ - 0.05], [W, ROOM.gal + 1.05, ROOM.galZ + 0.0], (p) => {
        if (p[1] > ROOM.gal + 0.96) return { c: C.WOOD_L };
        if (p[1] < ROOM.gal + 0.1) return { c: C.WOOD_D };
        return Math.floor(p[0] / 0.13) % 2 ? { c: C.WOOD } : null;
      }),
      ...[0.05, 2.5, 5.0, 7.5, 9.9].map((x) => box([x - 0.05, ROOM.gal, ROOM.galZ - 0.06], [x + 0.05, ROOM.gal + 1.08, ROOM.galZ + 0.04], solid(C.WOOD_D))),
    );
  }

  // Note: the piano against the left wall: case, keys, music desk, and its stool.
  add(
    box([0, 0, -2.15], [0.66, 1.42, -0.55], (p, nn) => ({ c: nn[0] > 0.5 ? (p[1] > 1.1 && p[1] < 1.3 && p[2] < -0.65 && p[2] > -2.05 ? ((Math.floor(p[2] / 0.1) % 2) ? C.WOOD : C.WOOD_D) : p[1] < 0.2 ? C.SHADOW : (p[1] > 0.7 && p[1] < 1.1 && Math.floor(p[2] / 0.5) % 2) ? C.WOOD_D : C.WOOD_D) : p[1] > 1.38 ? C.WOOD : C.WOOD_D })),
    box([0.66, 0.74, -2.1], [0.9, 0.8, -0.6], (p) => ({ c: p[0] > 0.7 && Math.floor(p[2] / 0.024) % 7 !== 0 ? C.PLASTER_L : C.SHADOW })),
    box([0.66, 0.68, -2.14], [0.94, 0.74, -0.56], solid(C.WOOD_D)),
    box([0.64, 1.08, -2.0], [0.7, 1.32, -0.7], (p) => ({ c: noise(Math.floor(p[2] * 14), Math.floor(p[1] * 14)) > 0.5 ? C.PLASTER : C.BONE })),
    box([1.0, 0.0, -1.5], [1.4, 0.5, -1.1], (p, nn) => ({ c: nn[1] > 0.5 ? C.RED_D : C.WOOD_D })),
  );

  // Note: furniture: tables with chairs around them, kicked about when the room is wrecked or pushed back for a ring.
  const T = o.tables || [[2.7, -3.6, [1, 1, 1, 1]], [5.4, -3.1, [1, 1, 1, 1]], [4.3, -5.6, [1, 1, 1, 1]], [2.5, -6.2, [1, 1, 1, 1]]];
  const FALLEN = new Set(o.fallenChairs || []);
  T.forEach(([x, z, seats], ti) => {
    if (o.fallenTables && o.fallenTables.includes(ti)) add(tableFallen(x, z, o.tableAxis || (ti % 2 ? 'x' : 'z'), o.tableLeg ?? 1));
    else add(table(x, z));
    [[-0.62, 0, 1, 0], [0.62, 0, -1, 0], [0, -0.62, 0, 1], [0, 0.62, 0, -1]].forEach(([ox, oz, dx, dz], si) => {
      if (!seats[si]) return;
      if (FALLEN.has(`${ti}:${si}`)) add(chairFallen(x + ox * 1.1, z + oz * 1.1, -dx, -dz));
      else add(chair(x + ox, z + oz, dx, dz));
    });
  });
  for (const c of o.extraChairs || []) add(c.fallen ? chairFallen(c.x, c.z, c.dx, c.dz) : chair(c.x, c.z, c.dx, c.dz));

  // Note: the lamps over the tables and the bar, the sconces by the mirror; every lamp lights the room and, through the openings, the street.
  const through = (p) => {
    if (p[2] < -0.01) return true;
    return false;
  };
  const LAMP_SPOTS = o.lamps || [[2.7, 3.15, -3.6], [5.4, 3.15, -3.1], [4.3, 3.15, -5.6], [2.5, 3.15, -6.2], [7.95, 3.0, -3.0], [7.95, 3.0, -6.0]];
  for (const [x, y, z] of LAMP_SPOTS) {
    const L = lamp(x, y, z, 0.62 * M.lamps, { visible: through, reach: 2.0 });
    add(L.boxes);
    S.lights.push(L.light);
    S.lamps.push(L.light.pos);
  }
  for (const z of o.sconces === false ? [] : [-1.8, -7.2]) {
    add(box([9.84, 2.45, z - 0.08], [9.98, 2.52, z + 0.08], solid(C.GOLD)), box([9.8, 2.52, z - 0.06], [9.94, 2.85, z + 0.06], () => ({ emit: C.GOLD_L }), { noShadow: true }));
    S.lights.push({ pos: [9.7, 2.7, z], power: 0.45 * M.lamps, reach: 1.8, visible: through });
    S.lamps.push([9.8, 2.7, z]);
  }
  // Note: light that spills out of the doorway and the windows onto the boardwalk and the street.
  if (M.spill) {
    for (const R of [DOOR, ...WINDOWS]) {
      S.lights.push({
        pos: [(R[0] + R[1]) / 2, 2.2, -2.2], power: 1.7 * M.spill, reach: 3.0,
        visible: (p) => {
          if (p[2] < 0) return false;
          const lx = (R[0] + R[1]) / 2;
          const tt = 2.2 / (p[2] + 2.2);
          return inR(lx + (p[0] - lx) * tt, 2.2 + (p[1] - 2.2) * tt, R);
        },
      });
    }
  }
  S.add = add;
  S.sky = skyOf(M.sky);
  return S;
}

// Note: the upstairs wall: plank doors with panels and brass knobs, separated by wall.
function upstairsWall(p) {
  const x = p[0];
  const dx = (x - 1.2) % 2.0;
  const k = Math.floor((x - 1.2) / 2.0);
  if (x > 1.2 && x < 9.2 && dx > 0.0 && dx < 0.95 && p[1] < ROOM.gal + 1.95) {
    if (Math.abs(dx - 0.8) < 0.04 && Math.abs(p[1] - ROOM.gal - 0.95) < 0.04) return { c: C.GOLD_L };
    if (dx < 0.06 || dx > 0.89 || p[1] > ROOM.gal + 1.89) return { c: C.WOOD_D };
    return { c: (p[1] - ROOM.gal) % 0.7 < 0.06 ? C.WOOD_D : noise(k, 5) > 0.5 ? C.WOOD : step(C.WOOD, 0) };
  }
  return wallMat(p);
}

// Note: a glyph of the three by five font drawn at scale 2 into a picture, for the sign.
function glyph(px, ch, x, y, c) {
  const F = {
    S: [3, 4, 2, 1, 6], A: [2, 5, 7, 5, 5], L: [4, 4, 4, 4, 7], O: [2, 5, 5, 5, 2], N: [6, 5, 5, 5, 5],
  };
  const g = F[ch];
  for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (g[r] & (4 >> b)) px.rect(x + b * 3, y + r * 3, 3, 3, c);
}

// Note: the sky by mood: pale blue by day, grey when overcast, gold and red at dusk, green and rose at dawn, dark blue with stars at night.
function skyOf(kind) {
  return (d, x, y) => {
    const h = d[1];
    if (kind === 'night') return noise(x, y) > 0.985 ? C.GLASS_L : h > 0.3 ? C.BLUE_D : dith(x, y, 0.4) ? C.BLUE : C.BLUE_D;
    if (kind === 'dusk') return h > 0.45 ? C.BLUE : h > 0.3 ? (dith(x, y, 0.5) ? C.BLUE : C.RED) : h > 0.17 ? (dith(x, y, 0.5) ? C.RED : C.RED_L) : dith(x, y, 0.5) ? C.GOLD : C.RED_L;
    if (kind === 'dawn') return h > 0.45 ? C.GLASS : h > 0.3 ? (dith(x, y, 0.5) ? C.GLASS : C.RED_L) : h > 0.15 ? (dith(x, y, 0.5) ? C.RED_L : C.GOLD) : C.GOLD_L;
    if (kind === 'overcast') return dith(x, y, 0.5 + h) ? C.STONE_L : C.STONE;
    return h > 0.5 ? C.GLASS : dith(x, y, 0.5 + (0.5 - h)) ? C.GLASS_L : C.GLASS;
  };
}

// Note: the nearest hit of a ray among a short list of boxes: the same slab test as the ray caster's, run on the boxes a screen tile can see.
function hitList(list, o, d, tMin) {
  let best = null;
  for (const b of list) {
    let t0 = tMin;
    let t1 = 1e9;
    let nIn = null;
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < b.min[a] || o[a] > b.max[a]) { ok = false; break; }
        continue;
      }
      let ta = (b.min[a] - o[a]) / d[a];
      let tb = (b.max[a] - o[a]) / d[a];
      let na = -1;
      if (ta > tb) { [ta, tb] = [tb, ta]; na = 1; }
      if (ta > t0) { t0 = ta; nIn = [0, 0, 0]; nIn[a] = na; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) { ok = false; break; }
    }
    if (!ok || !nIn) continue;
    if (best && t0 >= best.t) continue;
    best = { t: t0, p: [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0], n: nIn, b };
  }
  return best;
}

// Note: the ray caster of pixel-3d run per 8 by 8 screen tile on only the boxes whose screen bounds touch the tile, so a room of two hundred boxes stays fast.
function renderTiles(cam, boxes, lights, { ambient, sky, warm = false }) {
  const T = 8;
  const tx = Math.ceil(cam.w / T);
  const ty = Math.ceil(cam.h / T);
  const lists = Array.from({ length: tx * ty }, () => []);
  for (const b of boxes) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let near = false;
    for (let k = 0; k < 8; k++) {
      const c = [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]];
      const [sx, sy, z] = cam.project(c);
      if (z < 0.1) { near = true; break; }
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const a0 = near ? 0 : Math.max(0, Math.floor((x0 - 1) / T));
    const a1 = near ? tx - 1 : Math.min(tx - 1, Math.floor((x1 + 1) / T));
    const b0 = near ? 0 : Math.max(0, Math.floor((y0 - 1) / T));
    const b1 = near ? ty - 1 : Math.min(ty - 1, Math.floor((y1 + 1) / T));
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) lists[j * tx + i].push(b);
  }
  // Note: only the large boxes cast the sun's shadows, so a shadow ray tests a few dozen boxes and not the whole room.
  const blockers = boxes.filter((b) => !b.noShadow && Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) > 0.3);
  const px = new Px(cam.w, cam.h);
  const info = new Array(cam.w * cam.h);
  for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
    const list = lists[Math.floor(y / T) * tx + Math.floor(x / T)];
    const d = cam.ray(x, y);
    let h2 = null;
    let t = 1e-4;
    for (let k = 0; k < 8; k++) {
      const hh = hitList(list, cam.pos, d, t);
      if (!hh) break;
      const m = hh.b.mat(hh.p, hh.n);
      if (m != null) { h2 = { ...hh, m }; break; }
      t = hh.t + 1e-3;
    }
    const i = y * cam.w + x;
    if (!h2) { px.a[i] = sky(d, x, y); continue; }
    info[i] = h2;
    if (h2.m.emit != null) { px.a[i] = h2.m.emit; continue; }
    const lv = lightAt(h2.p, h2.n, lights, blockers, (h2.m.ambient ?? 1) * ambient) * (h2.m.k ?? 1);
    px.a[i] = shadeClean(h2.m.c, lv, x, y, !warm);
  }
  return { px, info };
}

// Note: films the room: the ray caster, then volumetric light (dust glowing where the sun crosses the air), lamp halos and floating motes.
export function film(cam, S, { shafts = 1, motes = 40, halo = true } = {}, r = null) {
  S.reflect = S.boxes.filter((b) => Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) > 0.22);
  const { px, info } = renderTiles(cam, S.boxes, S.lights, { ambient: S.ambient, sky: S.sky, warm: !!S.M.warm });
  if (shafts && S.M.sun.power > 1) {
    const N = 8;
    const lit = new Uint8Array(cam.w * cam.h);
    for (let y = 0; y < cam.h; y++) for (let x = 0; x < cam.w; x++) {
      const i = y * cam.w + x;
      const h2 = info[i];
      const t = h2 ? h2.t : 14;
      const d = cam.ray(x, y);
      let n = 0;
      for (let k = 0; k < N; k++) {
        const s = (t * (k + ((x * 7 + y * 13) % 5) / 5 + 0.1)) / N;
        const p = [cam.pos[0] + d[0] * s, cam.pos[1] + d[1] * s, cam.pos[2] + d[2] * s];
        if (p[0] > 0 && p[0] < ROOM.w && p[2] < -0.05 && p[2] > -ROOM.d && p[1] > 0 && p[1] < ROOM.h && S.sunVisible(p)) n++;
      }
      lit[i] = n;
    }
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i] || px.a[i] === NONE) continue;
      const x = i % cam.w;
      const y = (i / cam.w) | 0;
      const dens = (lit[i] / N) * shafts;
      if (dens > 0.7) px.a[i] = step(px.a[i], 2);
      else if (dens > 0.3 || dith(x, y, dens * 2)) px.a[i] = step(px.a[i], 1);
    }
  }
  if (halo) {
    for (const lp of S.lamps) {
      const [sx, sy, z] = cam.project(lp);
      if (z < 0.3 || sx < -10 || sx > cam.w + 10 || sy < -10 || sy > cam.h + 10) continue;
      const h2 = info[Math.max(0, Math.min(cam.h - 1, Math.round(sy))) * cam.w + Math.max(0, Math.min(cam.w - 1, Math.round(sx)))];
      if (h2 && h2.t < Math.hypot(lp[0] - cam.pos[0], lp[1] - cam.pos[1], lp[2] - cam.pos[2]) - 0.3) continue;
      px.glow(sx, sy, Math.max(6, cam.scaleAt(lp) * 0.7), 0.7, true);
    }
  }
  if (motes && r && S.M.sun.power > 1) {
    for (let k = 0, got = 0; k < 4000 && got < motes; k++) {
      const p = [r.next() * ROOM.w, r.next() * 3.4, -r.next() * 8];
      if (!S.sunVisible(p)) continue;
      const [sx, sy, z] = cam.project(p);
      if (z < 0.4 || sx < 0 || sx >= cam.w || sy < 0 || sy >= cam.h) continue;
      const h2 = info[Math.round(sy) * cam.w + Math.round(sx)];
      if (h2 && h2.t < Math.hypot(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]) - 0.05) continue;
      px.set(sx, sy, r.chance(0.35) ? C.BONE : C.GOLD_L);
      got++;
    }
  }
  return { px, info };
}

// Note: an anonymous townsperson's look from the dice: skin, hair, hat, coat, vest and the odd beard.
export function folk(r, o = {}) {
  const coats = o.coats || [C.WOOD_D, C.IRON, C.STONE, C.ADOBE_D, C.GREEN_D, C.RED_D, C.DARK, C.WOOD];
  return {
    skin: r.pick([C.ADOBE_L, C.ADOBE_L, C.ADOBE, C.ADOBE, C.ADOBE_D, C.WOOD_L]), hair: r.pick(HAIRS.slice(0, 5).filter((c) => c !== C.RED_L)), hairStyle: r.pick(HAIR_STYLES), beard: r.pick(BEARDS), moustache: r.pick(MOUSTACHES),
    hat: o.hatless ? null : r.pick([C.DARK, C.WOOD_D, C.PLANK, C.STONE, C.SHADOW, C.WOOD, C.IRON]), band: r.pick([C.DARK, C.GOLD, C.RED_D, C.WOOD]),
    hatStyle: r.pick(['wide', 'round', 'pinched', 'flat', 'bowler']), coat: r.pick(coats), vest: r.pick([C.RED_D, C.DARK, C.WOOD, C.IRON, C.GREEN_D, C.PLASTER]),
    shirt: r.pick([C.PLASTER, C.BONE, C.STONE]), bandana: r.chance(0.2) ? C.RED : null, badge: false, eyes: C.WOOD_D, ...o.extra,
  };
}

// Note: the strongest light on a point of the room that can reach it, as a direction on the screen and its level; used to set a figure's light side.
export function keyLight(cam, S, p) {
  let best = null;
  let bv = 0;
  for (const li of S.lights) {
    if (li.visible && !li.visible(p)) continue;
    const v = sub(li.pos, p);
    const d = Math.hypot(v[0], v[1], v[2]);
    const lv = li.power / (1 + (d / li.reach) ** 2);
    if (lv > bv) { bv = lv; best = v; }
  }
  if (!best) return { lx: -0.5, ly: -0.5, level: S.ambient };
  const dx = best[0] * cam.right[0] + best[1] * cam.right[1] + best[2] * cam.right[2];
  const dy = -(best[0] * cam.up[0] + best[1] * cam.up[1] + best[2] * cam.up[2]);
  return { lx: dx, ly: dy, level: bv + S.ambient };
}

// Note: a person standing at a world point, drawn to scale at the point's depth, lit from the room's key light, hidden where scene geometry is nearer than the person; spec: foot, look, pose, view (side, front, back), face (a world point to look at, or dir), height, lean, sit, hatless, clip.
export function actor(px, cam, S, info, spec) {
  const seated = spec.sit ? (spec.sit === 'floor' ? 0.1 : 0.47) : null;
  const seatFoot = spec.foot;
  const foot = seated == null ? spec.foot : [spec.foot[0], seated - (0.91 * (spec.height ?? 1.8)) / 1.8, spec.foot[2]];
  const view = spec.view || 'side';
  const h = (spec.height ?? 1.8) * cam.scaleAt(foot);
  const [sx, sy, depth] = cam.project(foot);
  const mid = [seatFoot[0], seatFoot[1] + 1.1, seatFoot[2]];
  const kl = spec.light || keyLight(cam, S, mid);
  const dir = spec.dir ?? (spec.face ? (Math.sign(cam.project(spec.face)[0] - sx) || 1) : 1);
  const warm = S.mood === 'night' || S.mood === 'dusk';
  const o2 = { dir, lx: kl.lx, ly: kl.ly, cool: warm && kl.level < 0.9, hatless: spec.hatless, back: view === 'back', wounds: spec.wounds, brim: spec.brim ?? 0.25, legs: spec.legs, coat: spec.coat, hat: spec.hat };
  const look = spec.look || null;
  const fig = view === 'side' ? pixelSide(cam.w, cam.h, sx, sy, h, look, spec.pose || 'stand', o2) : pixelFigure(cam.w, cam.h, sx, sy, h, look, spec.pose || 'stand', o2);
  // Note: a profile face gets its features at any size it can hold them: brow, eye, nose shadow, mouth and a cheek.
  if (view === 'side' && look && h / 7.5 >= 7 && !spec.noLift) {
    const H = h / 7.5;
    const X = (u) => sx + u * H * dir * 1.3;
    const Y = (v) => sy - v * H;
    const sk = look.skin;
    fig.rect(Math.min(X(0.14), X(0.42)), Y(7.08), Math.max(2, Math.abs(X(0.42) - X(0.14))), 1, step(look.hair ?? C.WOOD_D, -1));
    fig.set(X(0.22), Y(6.95), C.BONE);
    fig.set(X(0.27), Y(6.95), C.VOID);
    fig.rect(Math.min(X(0.34), X(0.48)), Y(6.55), Math.max(2, H * 0.2), 1, step(sk, -2));
    fig.set(X(0.3), Y(6.8), step(sk, -1));
    fig.set(X(0.1), Y(6.65), step(sk, 1));
  }
  // Note: a seated person: everything below the hips is cut, and thighs and shins are drawn bent over the chair, or stretched along the floor.
  if (seated != null) {
    const hipRow = cam.project([seatFoot[0], seated, seatFoot[2]])[1];
    for (let i = 0; i < fig.a.length; i++) if (((i / fig.w) | 0) > hipRow) fig.a[i] = NONE;
    const sc = cam.scaleAt(seatFoot);
    const m = (u, v) => [sx + (view === 'side' ? dir : 1) * u * sc, hipRow - v * sc];
    const legC = spec.legs ?? C.IRON;
    const lt = { lx: kl.lx, ly: kl.ly, depth: 0.4 };
    if (view === 'side' && spec.sit === 'floor') {
      fig.lit([m(-0.12, 0.16), m(0.5, 0.58), m(0.62, 0.42), m(0.0, -0.02)], legC, lt);
      fig.lit([m(0.46, 0.62), m(0.98, 0.1), m(0.86, -0.02), m(0.5, 0.36)], legC, lt);
      fig.lit([m(0.82, 0.16), m(1.2, 0.1), m(1.2, -0.04), m(0.82, -0.04)], C.WOOD_D, lt);
    } else if (view === 'side') {
      fig.lit([m(-0.12, 0.18), m(0.5, 0.14), m(0.5, -0.05), m(-0.12, -0.04)], legC, lt);
      fig.lit([m(0.36, 0.0), m(0.52, 0.0), m(0.54, -0.42), m(0.38, -0.42)], legC, lt);
      fig.lit([m(0.36, -0.4), m(0.7, -0.4), m(0.7, -0.5), m(0.36, -0.5)], C.WOOD_D, lt);
    }
  }
  // Note: an unlit figure dims by a step, a dark corner by two, but never the head, so a face always reads.
  const k = kl.level < 0.2 ? -2 : kl.level < 0.4 ? -1 : 0;
  const headY = sy - h * 0.8;
  if (k) for (let i = 0; i < fig.a.length; i++) {
    if (fig.a[i] === NONE) continue;
    const y = (i / fig.w) | 0;
    const x = i % fig.w;
    if (y > headY) fig.a[i] = step(fig.a[i], k);
  }
  // Note: a face is always lit: the shaded steps of the skin under a hat brim or in dim light are lifted a step, so the features read.
  if (look && look.skin != null && !spec.noLift) {
    const sk = look.skin;
    for (let i = 0; i < fig.a.length; i++) {
      const y = (i / fig.w) | 0;
      if (y < sy - h - 3 || y > sy - h * 0.76) continue;
      if (fig.a[i] === step(sk, -1) && sk !== step(sk, -1)) fig.a[i] = sk;
      else if (fig.a[i] === step(sk, -2) && sk !== step(sk, -2)) fig.a[i] = step(sk, -1);
    }
  }
  if (spec.shadow !== false) {
    const sh = spec.shadow || { sx: -kl.lx * 0.16, sy: 0.12 + Math.max(0, kl.ly) * 0.05, k: -1 };
    fig.castOnto(px, cam.project([seatFoot[0], 0, seatFoot[2]])[1], sh.sx, sh.sy, sh.k ?? -1);
  }
  const lay = new Px(cam.w, cam.h);
  place(lay, fig, { lx: kl.lx, ly: kl.ly, lean: spec.lean || 0, foot: seated != null ? cam.project([seatFoot[0], seated, seatFoot[2]])[1] : sy, rim: spec.rim ?? (kl.level > 0.5 ? 1 : 0) });
  const dist = Math.hypot(seatFoot[0] - cam.pos[0], seatFoot[1] - cam.pos[1], seatFoot[2] - cam.pos[2]);
  const slack = spec.slack ?? 0.4;
  for (let i = 0; i < lay.a.length; i++) {
    const p = lay.a[i];
    if (p === NONE) continue;
    const x = i % lay.w;
    const y = (i / lay.w) | 0;
    if (spec.clip && (x < spec.clip[0] || y < spec.clip[1] || x >= spec.clip[2] || y >= spec.clip[3])) continue;
    const h2 = info[i];
    if (h2 && h2.t < dist - slack) continue;
    px.a[i] = p;
  }
  return { sx, sy, h, depth, dir };
}

// Note: draws a list of people far to near, so nearer ones overlap farther ones.
export function crowd(px, cam, S, info, specs) {
  const order = specs.map((sp) => ({ sp, d: Math.hypot(sp.foot[0] - cam.pos[0], sp.foot[2] - cam.pos[2]) })).sort((a, b) => b.d - a.d);
  return order.map(({ sp }) => actor(px, cam, S, info, sp));
}

// Note: small things on tables and floors, as boxes: glasses, bottles, cards, coin stacks, glass shards and a spilled stain.
export const props = {
  glass: (x, y, z, c = C.GLASS_L) => [box([x - 0.035, y, z - 0.035], [x + 0.035, y + 0.1, z + 0.035], () => ({ c, k: 1.3 })), box([x - 0.03, y, z - 0.03], [x + 0.03, y + 0.045, z + 0.03], () => ({ c: C.GOLD }))],
  bottle: (x, y, z, c = C.GREEN_D) => [box([x - 0.045, y, z - 0.045], [x + 0.045, y + 0.21, z + 0.045], () => ({ c, k: 1.2 })), box([x - 0.018, y + 0.21, z - 0.018], [x + 0.018, y + 0.34, z + 0.018], () => ({ c }))],
  card: (x, y, z, w = 0.07, d = 0.1) => box([x - w / 2, y, z - d / 2], [x + w / 2, y + 0.004, z + d / 2], (p, n) => ({ c: n[1] > 0 && ((p[0] * 90) % 3 < 1.2) && p[2] * 90 % 4 < 2 ? C.RED : C.BONE })),
  coins: (x, y, z, n, c = C.GOLD) => [box([x - 0.035, y, z - 0.035], [x + 0.035, y + n * 0.014, z + 0.035], (p, nn) => ({ c: nn[1] > 0 ? C.GOLD_L : Math.floor((p[1] - y) / 0.014) % 2 ? c : step(c, 1), k: 1.1 }))],
  shard: (x, y, z, s = 0.05) => box([x - s, y, z - s * 0.6], [x + s, y + 0.006, z + s * 0.6], () => ({ c: C.GLASS_L, k: 1.6 })),
  stain: (x, z, w, d) => box([x - w / 2, 0.001, z - d / 2], [x + w / 2, 0.004, z + d / 2], (p) => ({ c: noise(Math.floor(p[0] * 20), Math.floor(p[2] * 20)) > 0.3 ? C.SHADOW : C.WOOD_D, ambient: 0.8 })),
};

// Note: an arm drawn over a figure that the actor returned: points are [along, up] in the figure's own units (body heights of 1/7.5) from the foot, in the coat colour with a hand at the end; used for pointing, throwing and holding a jaw.
export function limb(px, a, look, pts, o = {}) {
  const H = a.h / 7.5;
  const girth = o.view === 'front' ? 1 : 1.3;
  const P = pts.map(([u, v]) => [a.sx + u * H * a.dir * girth, a.sy - v * H]);
  const L = new Px(px.w, px.h);
  const w = Math.max(1.3, H * 0.24);
  const hull = [];
  const back = [];
  for (let i = 0; i < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[Math.min(P.length - 1, i + 1)];
    const n = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const nx = -(p1[1] - p0[1]) / n;
    const ny = (p1[0] - p0[0]) / n;
    const ww = w * (1 - 0.18 * i);
    hull.push([P[i][0] + nx * ww, P[i][1] + ny * ww]);
    back.push([P[i][0] - nx * ww, P[i][1] - ny * ww]);
  }
  L.lit([...hull, ...back.reverse()], o.color ?? (look ? look.coat : C.WOOD_D), { lx: o.lx ?? -0.6, ly: o.ly ?? -0.6, depth: 0.45 });
  const [hx, hy] = P[P.length - 1];
  L.ellipse(hx, hy, Math.max(1, H * 0.17), Math.max(1, H * 0.17), look ? look.skin : C.ADOBE);
  if (o.hat) {
    L.ellipse(hx, hy - H * 0.1, H * 0.55, Math.max(1, H * 0.12), o.hat);
    L.ellipse(hx, hy - H * 0.3, H * 0.28, H * 0.2, o.hat);
  }
  L.outline(o.lx ?? -0.6, o.ly ?? -0.6);
  px.over(L);
}
