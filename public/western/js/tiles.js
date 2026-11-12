// Note: tile ids, materials and physical properties; door and window state bytes live in the map.

export const T = {
  VOID: 0, SAND: 1, PORCH: 2, FLOOR: 3, RUG: 4, ADOBE: 5, FRAME: 6, PARTITION: 7, DOOR: 8, WINDOW: 9,
  STAIRS: 10, RUN: 11, TABLE: 12, CHAIR: 13, BED: 14, WARDROBE: 15, COUNTER: 16, STOVE: 17, SHELF: 18,
  BARREL: 19, CRATE: 20, FENCE: 21, POST: 22, SOFA: 23, DESK: 24, CACTUS: 25, DROP: 26, RAIL: 27,
  // Note: outdoor terrain; ids are appended, never renumbered.
  ROCK: 28, MESQUITE: 29, SCRUB: 30, GRASS: 31, WASH: 32, BANK: 33, WATER: 34, WAGON: 35, TAILINGS: 36, SHAFT: 37, TROUGH: 38, HAY: 39, ROAD: 40,
  CIRCLE_WAGON: 41, FREIGHT_CRATE: 42, CAMP_FIRE: 43, CORRAL_TROUGH: 44, STONE_POSITION: 45, SUPPLY_CHEST: 46, CLAIM_SHAFT: 47, HAY_STACK: 48,
  ROADBLOCK_WAGON: 49, WATER_STOP: 50, WORK_SHAFT: 51, HIDEOUT_BARREL: 52, TRADER_WAGON: 53, FENCE_TROUGH: 54, OLD_SHAFT: 55, FEED_BALE: 56,
  HOUSE_SOFA: 57, SALOON_BAR: 58, HOTEL_TABLE: 59, STORE_COUNTER: 60, BANK_COUNTER: 61, BOARDING_TABLE: 62, WAREHOUSE_CRATE: 63, OFFICE_DESK: 64,
  GRAVE_MARKER: 65, FREIGHT_CART: 66,
  RUIN_CRATE: 67, TELEGRAPH_POLE: 68, CHURCH_ALTAR: 69, SMITH_FORGE: 70,
};
export const TILE_NAMES = Object.keys(T);

export const TILE_ART_BASE = {
  [T.CIRCLE_WAGON]: T.WAGON, [T.FREIGHT_CRATE]: T.CRATE, [T.CAMP_FIRE]: T.STOVE, [T.CORRAL_TROUGH]: T.TROUGH,
  [T.STONE_POSITION]: T.ROCK, [T.SUPPLY_CHEST]: T.CRATE, [T.CLAIM_SHAFT]: T.SHAFT, [T.HAY_STACK]: T.HAY,
  [T.ROADBLOCK_WAGON]: T.WAGON, [T.WATER_STOP]: T.TROUGH, [T.WORK_SHAFT]: T.SHAFT, [T.HIDEOUT_BARREL]: T.BARREL,
  [T.TRADER_WAGON]: T.WAGON, [T.FENCE_TROUGH]: T.TROUGH, [T.OLD_SHAFT]: T.SHAFT, [T.FEED_BALE]: T.HAY,
  [T.HOUSE_SOFA]: T.SOFA, [T.SALOON_BAR]: T.COUNTER, [T.HOTEL_TABLE]: T.TABLE, [T.STORE_COUNTER]: T.COUNTER,
  [T.BANK_COUNTER]: T.COUNTER, [T.BOARDING_TABLE]: T.TABLE, [T.WAREHOUSE_CRATE]: T.CRATE, [T.OFFICE_DESK]: T.DESK,
  [T.GRAVE_MARKER]: T.POST, [T.FREIGHT_CART]: T.WAGON,
  [T.RUIN_CRATE]: T.CRATE, [T.TELEGRAPH_POLE]: T.POST, [T.CHURCH_ALTAR]: T.COUNTER, [T.SMITH_FORGE]: T.STOVE,
};

// Note: door states; a locked door is closed and must be forced.
export const DS = { CLOSED: 0, LOCKED: 1, OPEN: 2, BROKEN: 3 };
// Note: window states; a bolted window must be forced or broken, an open or broken one can be climbed.
export const WS = { CLOSED: 0, BOLTED: 1, OPEN: 2, BROKEN: 3 };

// Note: thick in metres, cost in joules per metre of thickness, loss in dB for sound.
export const MATERIALS = {
  adobe: { thick: 0.35, cost: 5200, loss: 28 },
  frame: { thick: 0.12, cost: 1500, loss: 20 },
  plank: { thick: 0.05, cost: 1500, loss: 14 },
  door: { thick: 0.04, cost: 2000, loss: 10 },
  glass: { thick: 0.004, cost: 2500, loss: 6 },
  wood: { thick: 0.03, cost: 2000, loss: 2 },
  heavy: { thick: 0.12, cost: 3000, loss: 5 },
  barrel: { thick: 0.5, cost: 1000, loss: 3 },
  iron: { thick: 0.02, cost: 9000, loss: 4 },
  fence: { thick: 0.02, cost: 2000, loss: 1 },
  plant: { thick: 0.1, cost: 300, loss: 0 },
  stone: { thick: 0.9, cost: 6000, loss: 30 },
  earth: { thick: 1.2, cost: 3500, loss: 24 },
  hay: { thick: 0.6, cost: 900, loss: 3 },
};

// Note: h is the height below which a bullet is stopped or slowed; Infinity means a full-height barrier.
const def = (name, o = {}) => ({ name, solid: false, opaque: false, h: 0, mat: null, loss: 0, ...o });
export const TILE_PROPS = [];
const set = (id, p) => { TILE_PROPS[id] = p; };
set(T.VOID, def('void', { solid: true, opaque: true, h: Infinity, mat: 'adobe', loss: 40 }));
set(T.SAND, def('sand'));
set(T.PORCH, def('porch'));
set(T.FLOOR, def('floor'));
set(T.RUG, def('rug'));
set(T.ADOBE, def('adobe', { solid: true, opaque: true, h: Infinity, mat: 'adobe', loss: 28 }));
set(T.FRAME, def('frame', { solid: true, opaque: true, h: Infinity, mat: 'frame', loss: 20 }));
set(T.PARTITION, def('partition', { solid: true, opaque: true, h: Infinity, mat: 'plank', loss: 14 }));
set(T.DOOR, def('door', { solid: true, opaque: true, h: 2, mat: 'door', loss: 10 }));
set(T.WINDOW, def('window', { solid: true, opaque: false, h: 2, mat: 'glass', loss: 6 }));
set(T.STAIRS, def('stairs'));
// Note: STAIRS and RUN are the two cells of the flight; both are walkable, and the rail tiles close its sides and ends.
set(T.RUN, def('run'));
set(T.TABLE, def('table', { solid: true, h: 0.8, mat: 'wood', loss: 2 }));
set(T.CHAIR, def('chair'));
set(T.BED, def('bed', { solid: true, h: 0.55, mat: 'wood', loss: 2 }));
set(T.WARDROBE, def('wardrobe', { solid: true, opaque: true, h: 2, mat: 'heavy', loss: 5 }));
set(T.COUNTER, def('counter', { solid: true, h: 1, mat: 'wood', loss: 2 }));
set(T.STOVE, def('stove', { solid: true, h: 1, mat: 'iron', loss: 4 }));
set(T.SHELF, def('shelf', { solid: true, opaque: true, h: 2, mat: 'heavy', loss: 5 }));
set(T.BARREL, def('barrel', { solid: true, h: 0.9, mat: 'barrel', loss: 3 }));
set(T.CRATE, def('crate', { solid: true, h: 0.7, mat: 'heavy', loss: 3 }));
set(T.FENCE, def('fence', { solid: true, h: 1.1, mat: 'fence', loss: 1 }));
set(T.POST, def('post', { solid: true, h: 1.2, mat: 'heavy', loss: 2 }));
set(T.SOFA, def('sofa', { solid: true, h: 0.8, mat: 'wood', loss: 2 }));
set(T.DESK, def('desk', { solid: true, h: 0.8, mat: 'heavy', loss: 2 }));
set(T.CACTUS, def('cactus', { solid: true, h: 1.5, mat: 'plant', loss: 0 }));
// Note: DROP is the ground seen from the upper floor outside the footprint; nobody can walk there.
set(T.DROP, def('drop', { solid: true }));
set(T.RAIL, def('rail', { solid: true, h: 1, mat: 'fence', loss: 1 }));
// Note: a boulder or outcrop blocks sight and stops rounds; a mesquite thicket hides a person but barely slows a round.
set(T.ROCK, def('rock', { solid: true, opaque: true, h: 2.2, mat: 'stone', loss: 30 }));
set(T.MESQUITE, def('mesquite', { solid: true, opaque: true, h: 1.8, mat: 'plant', loss: 2 }));
// Note: scrub, grass, wash bed and road are ground; they can be walked and change nothing but the picture.
set(T.SCRUB, def('scrub'));
set(T.GRASS, def('grass'));
set(T.WASH, def('wash'));
set(T.ROAD, def('road'));
// Note: a cut bank is a low earth wall; deep water cannot be walked but rounds and sight cross it.
set(T.BANK, def('bank', { solid: true, h: 1.1, mat: 'earth', loss: 10 }));
set(T.WATER, def('water', { solid: true }));
set(T.WAGON, def('wagon', { solid: true, h: 1.3, mat: 'heavy', loss: 3 }));
set(T.TAILINGS, def('tailings', { solid: true, opaque: true, h: 1.6, mat: 'earth', loss: 24 }));
set(T.SHAFT, def('shaft', { solid: true }));
set(T.TROUGH, def('trough', { solid: true, h: 0.6, mat: 'wood', loss: 2 }));
set(T.HAY, def('hay', { solid: true, h: 0.9, mat: 'hay', loss: 3 }));
for (const [tile, base] of Object.entries(TILE_ART_BASE)) set(Number(tile), { ...TILE_PROPS[base], name: TILE_NAMES[Number(tile)].toLowerCase() });

export const isDoor = (t) => t === T.DOOR;
export const isWindow = (t) => t === T.WINDOW;
export const isStairs = (t) => t === T.STAIRS;
export const isFlight = (t) => t === T.STAIRS || t === T.RUN;
export const isWall = (t) => t === T.ADOBE || t === T.FRAME || t === T.PARTITION || t === T.VOID;
export const isFurniture = (t) => {
  const base = TILE_ART_BASE[t] ?? t;
  return base >= T.TABLE && base <= T.BARREL ? true : base === T.CRATE || base === T.SOFA || base === T.DESK || base === T.CHAIR;
};

export function cellSolid(tile, state) {
  if (tile === T.DOOR) return state === DS.CLOSED || state === DS.LOCKED;
  return TILE_PROPS[tile].solid;
}

export function cellOpaque(tile, state) {
  if (tile === T.DOOR) return state === DS.CLOSED || state === DS.LOCKED;
  return TILE_PROPS[tile].opaque;
}

// Note: window sills stop shots below this height; glass fills the opening above it.
export const SILL = 0.9;
export const LINTEL = 2;

// Note: the material a bullet at height z meets in this cell, or null when it passes freely.
export function cellObstacle(tile, state, z) {
  if (tile === T.DOOR) return (state === DS.CLOSED || state === DS.LOCKED) && z < LINTEL ? 'door' : null;
  if (tile === T.WINDOW) {
    if (z < SILL || z >= LINTEL) return 'frame';
    return state === WS.CLOSED || state === WS.BOLTED ? 'glass' : null;
  }
  const p = TILE_PROPS[tile];
  return p.mat && z < p.h ? p.mat : null;
}

// Note: dB a sound loses crossing this cell.
export function cellSoundLoss(tile, state) {
  if (tile === T.DOOR) return state === DS.LOCKED ? 12 : state === DS.CLOSED ? 10 : 0;
  if (tile === T.WINDOW) return state === WS.CLOSED || state === WS.BOLTED ? 6 : 0;
  return TILE_PROPS[tile].loss;
}
