// Note: shared constants for generation, simulation and rendering; no DOM or Phaser.

export const VIEW_W = 480;
export const VIEW_H = 270;
export const TILE = 16;
export const CHUNK = 32;
export const CHUNK_PX = CHUNK * TILE;
// Note: buildings, fences, pumps and counters sit on a finer grid of 4 cells per tile (0.71 m each).
export const FINE = 4;
export const CELL = TILE / FINE;
// Note: building and people textures carry 2 texels per world px, so they stay crisp at the on-foot zoom.
export const DENSE = 2;

// Note: Act 1 band in tiles; the courier enters at the east edge and drives west.
export const BAND_W = 3200;
export const BAND_H = 320;

// Note: one in-game day lasts 15 real minutes.
export const DAY_SECONDS = 900;
export const HOUR_SECONDS = DAY_SECONDS / 24;
export const START_HOUR = 7;

// Note: one tile stands for about 0.0375 miles, so the Act 1 band is roughly 120 miles.
export const MILES_PER_PX = 0.0375 / TILE;

// Note: motion uses the sprite scale instead, where the 30 px Crown Vic is its real 5.39 m long.
export const PX_PER_M = 30 / 5.39;
export const MPH_PX = PX_PER_M * 0.44704;

export const SAVE_KEY = 'interceptor.save.v1';
export const NAME_KEY = 'interceptor.name';

export const WOUND_MAX = 5;
export const JUG_UNITS = 4;
export const CAN_GALLONS = 5;
export const HANDS = 2;

export const FACTIONS = ['company', 'brigade', 'coop', 'residents'];
export const FACTION_NAMES = {
  company: 'Permian W&L',
  brigade: 'St. Jude Brigade',
  coop: 'Llano Co-op',
  residents: 'the Residents',
  drifters: 'drifters',
  none: 'nobody',
};
