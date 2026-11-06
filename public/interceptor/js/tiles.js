// Note: terrain tile ids, their physical properties and paint recipes.

import { C } from './palette.js';

const NAMES = [
  'DEEP', 'WATER', 'MARSH', 'MUD', 'GRASS', 'DRYGRASS', 'SAND', 'DIRT', 'GRAVEL',
  'ASPHALT', 'CRACKED', 'LANE', 'EDGE', 'BRIDGE', 'RAIL', 'CONCRETE', 'FLOOR', 'WALL',
  'DOOR', 'TREE', 'FENCE', 'TANK', 'PUMP', 'BAY', 'REEDS', 'RUBBLE', 'CARPET', 'COUNTER', 'LOT',
  // Note: biome tiles for Acts 2-5 come last so Act 1 tile ids never change.
  'PINE', 'CEDAR', 'ROCK', 'CALICHE', 'SCRUB', 'OIL', 'JACK', 'REDROCK', 'REDSAND',
];
export const T = Object.fromEntries(NAMES.map((n, i) => [n, i]));
export const TILE_NAMES = NAMES;

const base = { solidCar: false, solidFoot: false, opaque: false, grip: 0.7, drag: 0.2, foot: 1, surf: 'soft', indoor: false };
const def = (o) => ({ ...base, ...o });

// Note: grip scales lateral tire bite, drag is rolling resistance per second, foot scales walking speed.
export const TILE_PROPS = [
  def({ solidCar: true, solidFoot: true, grip: 0.1, drag: 3, surf: 'water', paint: { base: C.WATER_D, acc: [C.WATER, C.VOID], kind: 'water' } }),
  def({ grip: 0.25, drag: 1.6, foot: 0.45, surf: 'water', paint: { base: C.WATER, acc: [C.WATER_L, C.WATER_D], kind: 'water' } }),
  def({ grip: 0.38, drag: 0.9, foot: 0.7, surf: 'water', paint: { base: C.MARSH_D, acc: [C.WATER, C.GRASS_D], kind: 'speckle' } }),
  def({ grip: 0.45, drag: 0.7, foot: 0.8, paint: { base: C.MUD, acc: [C.DIRT, C.SHADOW], kind: 'speckle' } }),
  def({ grip: 0.62, drag: 0.32, paint: { base: C.GRASS_D, acc: [C.GRASS, C.MARSH_D], kind: 'grass' } }),
  def({ grip: 0.66, drag: 0.28, paint: { base: C.GRASS, acc: [C.GRASS_DRY, C.STRAW], kind: 'grass' } }),
  def({ grip: 0.5, drag: 0.55, foot: 0.85, paint: { base: C.SAND, acc: [C.DIRT_L, C.BONE], kind: 'speckle' } }),
  def({ grip: 0.78, drag: 0.14, paint: { base: C.DIRT, acc: [C.DIRT_L, C.MUD], kind: 'speckle' } }),
  def({ grip: 0.74, drag: 0.16, surf: 'hard', paint: { base: C.CONC, acc: [C.DUST, C.ASPH_L], kind: 'gravel' } }),
  def({ grip: 1, drag: 0.04, surf: 'hard', paint: { base: C.ASPH, acc: [C.ASPH_D, C.ASPH_L], kind: 'asphalt' } }),
  def({ grip: 0.94, drag: 0.07, surf: 'hard', paint: { base: C.ASPH, acc: [C.ASPH_D, C.SHADOW], kind: 'cracked' } }),
  def({ grip: 1, drag: 0.04, surf: 'hard', paint: { base: C.ASPH, acc: [C.ASPH_D, C.YELLOW], kind: 'lane' } }),
  def({ grip: 1, drag: 0.04, surf: 'hard', paint: { base: C.ASPH, acc: [C.ASPH_D, C.BONE], kind: 'edge' } }),
  def({ grip: 1, drag: 0.04, surf: 'hard', paint: { base: C.CONC, acc: [C.ASPH_L, C.DUST], kind: 'planksH' } }),
  def({ solidCar: true, solidFoot: true, surf: 'hard', paint: { base: C.DUST, acc: [C.CONC, C.SHADOW], kind: 'rail' } }),
  def({ grip: 0.95, drag: 0.05, surf: 'hard', paint: { base: C.CONC, acc: [C.DUST, C.ASPH_L], kind: 'concrete' } }),
  def({ grip: 0.9, drag: 0.1, surf: 'hard', indoor: true, paint: { base: C.DIRT, acc: [C.MUD, C.DIRT_L], kind: 'planks' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, surf: 'hard', paint: { base: C.BONE, acc: [C.DUST, C.SHADOW], kind: 'wall' } }),
  def({ solidCar: true, surf: 'hard', indoor: true, paint: { base: C.RUST_D, acc: [C.MUD, C.SHADOW], kind: 'door' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, paint: { base: C.GRASS_D, acc: [C.MUD, C.SHADOW], kind: 'trunk' } }),
  def({ solidCar: true, solidFoot: true, paint: { base: C.GRASS, acc: [C.DUST, C.SHADOW], kind: 'fence' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, surf: 'hard', paint: { base: C.DUST, acc: [C.RUST, C.SHADOW], kind: 'tank' } }),
  def({ solidCar: true, solidFoot: true, surf: 'hard', paint: { base: C.CONC, acc: [C.RED, C.SHADOW], kind: 'pump' } }),
  def({ grip: 0.95, drag: 0.05, surf: 'hard', paint: { base: C.CONC, acc: [C.YELLOW, C.ASPH_L], kind: 'bay' } }),
  def({ grip: 0.5, drag: 0.6, foot: 0.85, paint: { base: C.MARSH_D, acc: [C.GRASS_DRY, C.STRAW], kind: 'reeds' } }),
  def({ grip: 0.6, drag: 0.5, foot: 0.8, surf: 'hard', paint: { base: C.CONC, acc: [C.DUST, C.SHADOW], kind: 'rubble' } }),
  def({ grip: 0.9, drag: 0.1, surf: 'soft', indoor: true, paint: { base: C.MAROON, acc: [C.RUST_D, C.SHADOW], kind: 'speckle' } }),
  def({ solidCar: true, solidFoot: true, surf: 'hard', indoor: true, paint: { base: C.DIRT_L, acc: [C.DIRT, C.SHADOW], kind: 'counter' } }),
  def({ grip: 1, drag: 0.04, surf: 'hard', paint: { base: C.ASPH, acc: [C.ASPH_D, C.BONE], kind: 'lot' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, paint: { base: C.MUD, acc: [C.DIRT, C.SHADOW], kind: 'trunk' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, paint: { base: C.GRASS_D, acc: [C.MUD, C.SHADOW], kind: 'trunk' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, surf: 'hard', paint: { base: C.DUST, acc: [C.BONE, C.CONC], kind: 'rock' } }),
  def({ grip: 0.72, drag: 0.16, paint: { base: C.BONE, acc: [C.BONE_L, C.DUST], kind: 'speckle' } }),
  def({ grip: 0.5, drag: 1.1, foot: 0.7, paint: { base: C.SAND, acc: [C.GRASS_D, C.MARSH_D], kind: 'scrub' } }),
  def({ grip: 0.4, drag: 0.12, paint: { base: C.SHADOW, acc: [C.ASPH_D, C.VOID], kind: 'speckle' } }),
  def({ solidCar: true, solidFoot: true, surf: 'hard', paint: { base: C.BONE, acc: [C.ASPH_D, C.RUST], kind: 'jack' } }),
  def({ solidCar: true, solidFoot: true, opaque: true, surf: 'hard', paint: { base: C.RUST, acc: [C.RUST_L, C.RUST_D], kind: 'rock' } }),
  def({ grip: 0.6, drag: 0.36, foot: 0.9, paint: { base: C.DIRT_L, acc: [C.RUST_L, C.SAND], kind: 'speckle' } }),
];

// Note: things that grow or stand off the road; worldgen clears them near roads and sites.
export const OBSTACLE = new Set([T.TREE, T.PINE, T.CEDAR, T.ROCK, T.REDROCK, T.JACK, T.SCRUB]);
// Note: tiles that carry a painted canopy over them.
export const CANOPY = { [T.TREE]: 'oak', [T.PINE]: 'pine', [T.CEDAR]: 'cedar' };

export const isRoad = (t) => t === T.ASPHALT || t === T.CRACKED || t === T.LANE || t === T.EDGE || t === T.BRIDGE || t === T.LOT;
export const isBackRoad = (t) => t === T.DIRT || t === T.GRAVEL;
