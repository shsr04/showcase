// Note: off-road terrain per act biome; band coordinates (x along the corridor, y across), tiles from tiles.js.

import { T } from './tiles.js';
import { hash3, u01, fbm2 } from './rand.js';

// Note: Gulf bayou: marsh, open water, reeds and live oaks.
function bayou(world, x, y, tx, ty) {
  const s = world.seed;
  const wet = fbm2(s + 41, x / 46, y / 46, 3);
  let t;
  if (wet > 0.74) t = T.DEEP;
  else if (wet > 0.7) t = T.WATER;
  else if (wet > 0.655) t = u01(hash3(s + 42, tx, ty)) < 0.35 ? T.REEDS : T.MARSH;
  else if (wet > 0.625) t = T.MUD;
  else t = fbm2(s + 43, x / 18, y / 18, 2) > 0.57 ? T.DRYGRASS : T.GRASS;
  if (t !== T.DEEP && t !== T.WATER) {
    const tc = fbm2(s + 44, (tx + 0.5) / 22, (ty + 0.5) / 22, 2);
    if (tc > 0.53 && u01(hash3(s + 45, tx, ty)) < (tc - 0.53) * 2.4) t = T.TREE;
  } else if (t === T.WATER && u01(hash3(s + 46, tx, ty)) < 0.05) {
    t = T.TREE;
  }
  return t;
}

// Note: Piney Woods: thick loblolly pine with clearings, hardwood bottoms and creeks.
function pines(world, x, y, tx, ty) {
  const s = world.seed;
  const wet = fbm2(s + 51, x / 38, y / 38, 3);
  if (wet > 0.75) return T.WATER;
  if (wet > 0.72) return T.MUD;
  let t = fbm2(s + 52, x / 16, y / 16, 2) > 0.6 ? T.DRYGRASS : T.GRASS;
  const tc = fbm2(s + 53, (tx + 0.5) / 18, (ty + 0.5) / 18, 2);
  const h = u01(hash3(s + 54, tx, ty));
  if (tc > 0.4 && h < (tc - 0.4) * 2.6) t = wet > 0.66 ? T.TREE : T.PINE;
  return t;
}

// Note: Hill Country: limestone ledges, cedar brakes, scattered live oaks over dry grass.
function hills(world, x, y, tx, ty) {
  const s = world.seed;
  const rock = fbm2(s + 61, x / 26, y / 26, 3);
  if (rock > 0.69) return T.ROCK;
  if (rock > 0.65) return T.CALICHE;
  if (fbm2(s + 62, x / 34, y / 34, 2) > 0.77) return T.WATER;
  let t = fbm2(s + 63, x / 20, y / 20, 2) > 0.48 ? T.DRYGRASS : T.GRASS;
  const tc = fbm2(s + 64, (tx + 0.5) / 15, (ty + 0.5) / 15, 2);
  const h = u01(hash3(s + 65, tx, ty));
  if (tc > 0.52 && h < (tc - 0.52) * 2.8) t = T.CEDAR;
  else if (h > 0.985) t = T.TREE;
  return t;
}

// Note: Permian Basin: caliche and sand flats, mesquite scrub, pumpjacks on oil-stained pads.
function permian(world, x, y, tx, ty) {
  const s = world.seed;
  const G = 22;
  const cx = Math.floor(tx / G);
  const cy = Math.floor(ty / G);
  const hj = hash3(s + 81, cx, cy);
  if (u01(hj) < 0.45) {
    const jx = cx * G + 4 + ((hj >>> 8) % 14);
    const jy = cy * G + 4 + ((hj >>> 16) % 14);
    if (tx === jx && ty === jy) return T.JACK;
    const d = Math.hypot(tx - jx, ty - jy);
    if (d < 1.8) return T.OIL;
    if (d < 3.4) return T.CALICHE;
  }
  const g = fbm2(s + 82, x / 30, y / 30, 3);
  let t = g > 0.55 ? T.SAND : g < 0.33 ? T.DRYGRASS : T.CALICHE;
  const sc = fbm2(s + 83, x / 14, y / 14, 2);
  if (sc > 0.52 && u01(hash3(s + 84, tx, ty)) < (sc - 0.52) * 1.4) t = T.SCRUB;
  return t;
}

// Note: New Mexico: red sand, dry washes, juniper and sheer mesa walls.
function mesa(world, x, y, tx, ty) {
  const s = world.seed;
  const m = fbm2(s + 71, x / 58, y / 58, 3);
  if (m > 0.66) return T.REDROCK;
  if (m > 0.635) return T.RUBBLE;
  const wash = Math.abs(fbm2(s + 72, x / 70, y / 24, 2) - 0.5);
  if (wash < 0.025) return T.SAND;
  let t = fbm2(s + 73, x / 22, y / 22, 2) > 0.62 ? T.DRYGRASS : T.REDSAND;
  const h = u01(hash3(s + 74, tx, ty));
  const tc = fbm2(s + 75, (tx + 0.5) / 20, (ty + 0.5) / 20, 2);
  if (tc > 0.56 && h < (tc - 0.56) * 1.8) t = T.CEDAR;
  else if (h > 0.992) t = T.SCRUB;
  return t;
}

// Note: clear is what obstacles near roads and sites turn into; edge fills the band border.
export const BIOMES = {
  bayou: { terrain: bayou, clear: T.GRASS, edge: T.TREE },
  pines: { terrain: pines, clear: T.GRASS, edge: T.PINE },
  hills: { terrain: hills, clear: T.DRYGRASS, edge: T.CEDAR },
  permian: { terrain: permian, clear: T.CALICHE, edge: T.ROCK },
  mesa: { terrain: mesa, clear: T.REDSAND, edge: T.REDROCK },
};
