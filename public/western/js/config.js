// Note: shared constants for generation, simulation and rendering; no DOM or Phaser.

// Note: the one resolution knob; the art is authored on a 16 px tile and every drawn size is that art times SCALE.
// Note: ?scale=2 (or 1) in the address picks a lighter picture for slow machines; the default is 3.
const asked = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('scale')) : 0;
export const SCALE = asked === 1 || asked === 2 || asked === 3 ? asked : 3;
export const VIEW_W = 480 * SCALE;
export const VIEW_H = 270 * SCALE;
// Note: one tile is one metre and 16 art pixels, so TILE pixels at any SCALE.
export const TILE = 16 * SCALE;
// Note: the standard grid of a house; an outdoor site may be larger, up to GRID_W by GRID_H.
export const MAP_W = 40;
export const MAP_H = 30;
// Note: the largest map any site makes; cell keys and scratch grids are laid out on this stride whatever the map's own size.
export const GRID_W = 64;
export const GRID_H = 64;
// Note: the most storeys any site has; per-floor scratch grids are sized for this many.
export const MAX_FLOORS = 5;
export const STEP = 1 / 60;

export const RADIUS = 0.3;
export const HEIGHT = { stand: 1.75, crouch: 1.15, prone: 0.45 };
export const MUZZLE_Z = { stand: 1.4, crouch: 0.95, prone: 0.32 };
export const CHEST_Z = { stand: 1.25, crouch: 0.8, prone: 0.32 };
// Note: the middle of the head band (0.87 to 1.0 of the body height) for a deliberate head shot.
export const HEAD_Z = { stand: 1.635, crouch: 1.075, prone: 0.42 };
// Note: metres between floor levels, eye height, and the share of walking speed on the flight (2 m of run in about 2.4 s).
export const FLOOR_H = 3;
export const EYE_Z = { stand: 1.55, crouch: 1.1, prone: 0.42 };
export const STAIR_SPEED = 0.55;

// Note: metres per second.
export const SPEED = { walk: 1.5, sprint: 3.8, slow: 0.55 };
export const CROUCH_MUL = 0.6;
export const PRONE_MUL = 0.25;
export const LEAN_MUL = 0.5;
export const LEAN_OFFSET = 0.45;

const DEG = Math.PI / 180;
// Note: half-angles in radians; the steady aim narrows the view and reaches further.
export const FOV = { half: 55 * DEG, steady: 32 * DEG, range: 14, steadyRange: 19, near: 0 };

// Note: peripheral vision (SPEC items 33, 72, 182): three zones nested by angle off the facing, core, mid and flank.
// Note: light is [t, share] stops over the zone's range; feather is the soft angular edge inside the zone, where its light blends into the zone around it.
// Note: delay multiplies an NPC's recognition time for a target seen in that zone; the sheriff's player has none.
// Note: focus is the core while taking careful aim, reached over time seconds; classic is the single 55 degree cone, with a snap.
export const FOV_PRESETS = {
  natural: {
    zones: [
      { name: 'core', half: 35 * DEG, range: 14, light: [[0, 1], [0.75, 1], [1, 0.4]], feather: 8 * DEG, delay: 1 },
      { name: 'mid', half: 70 * DEG, range: 10, light: [[0, 0.85], [0.8, 0.5], [1, 0.25]], feather: 10 * DEG, delay: 1.2 },
      { name: 'flank', half: 100 * DEG, range: 5, light: [[0, 0.4], [1, 0]], feather: 12 * DEG, delay: 1.4 },
    ],
    focus: { half: 22 * DEG, range: 19, time: 0.25 },
  },
  classic: {
    zones: [{ name: 'core', half: FOV.half, range: FOV.range, light: [[0, 1], [0.54, 0.95], [1, 0.15]], feather: 0, delay: 1 }],
    focus: { half: FOV.steady, range: FOV.steadyRange, time: 0 },
  },
};
// Note: ?fov=classic in the address restores the single cone for comparison; the default is the zoned view.
const askedFov = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('fov') : null;
export const FOV_PRESET = askedFov === 'classic' ? 'classic' : 'natural';

// Note: the deputy or sheriff reaching this distance from the house footprint counts as reaching safety.
export const SAFE_DIST = 6;
export const HOSTILE_MIN = 3;
export const HOSTILE_MAX = 6;
export const CIVILIAN_CHANCE = 0.1;

export const SOUND_FLOOR = 10;
export const SLAB_LOSS = 22;
