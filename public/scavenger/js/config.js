// Note: shared constants for generation, rendering and gameplay; no DOM or three.js.

export const CELL = { x: 80, y: 64, z: 80 };
export const CELL_ARR = [CELL.x, CELL.y, CELL.z];

// Note: faces are 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z; opposite face is f ^ 1.
export const FACE_DIR = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
export const FACE_AXIS = [0, 0, 1, 1, 2, 2];
export const FACE_SIGN = [1, -1, 1, -1, 1, -1];

// Note: canonical profile frame per tunnel axis; r = profile x axis, u = profile y axis.
export const AXIS_FRAME = [
  { r: [0, 0, 1], u: [0, 1, 0] },
  { r: [1, 0, 0], u: [0, 0, 1] },
  { r: [1, 0, 0], u: [0, 1, 0] },
];

export const SHIP_R = 0.55;

const LAYER_NAMES = [
  'PLATE_DARK', 'PLATE_LIGHT', 'PLATE_RUST', 'GRATING', 'HAZARD', 'CORRUGATED',
  'CONCRETE', 'TILE', 'CARPET', 'WOOD', 'PIPE', 'GLASS',
  'LIGHT_PANEL', 'LAMP_WARM', 'SCREEN_GREEN', 'SCREEN_AMBER', 'LED_RACK', 'VENT',
  'DOOR', 'STRIPE_RED', 'STRIPE_BLUE', 'CABLES', 'NEON_PINK', 'NEON_CYAN',
  'FOLIAGE', 'SOIL', 'FOAM', 'CRATE', 'POSTER_SPACE', 'POSTER_KIDS',
  'POSTER_NOTICE', 'ARCADE', 'METER', 'CONSOLE', 'WARN_SIGNS', 'BEAM',
  'SEAM_BAND', 'WATER', 'LINO', 'FABRIC', 'PLASTIC', 'METAL_BRIGHT', 'BLACK',
  'LAMP_COOL', 'LAMP_RED', 'GLOW_WHITE',
];
export const L = Object.fromEntries(LAYER_NAMES.map((n, i) => [n, i]));
export const LAYER_COUNT = LAYER_NAMES.length;
export const LAYER_NAME_LIST = LAYER_NAMES;

// Note: world meters covered by one texture tile, per layer (default 2).
export const LAYER_M = {
  [L.GRATING]: 1.5, [L.CONCRETE]: 4, [L.CARPET]: 2, [L.CORRUGATED]: 2, [L.CABLES]: 1,
  [L.PIPE]: 2, [L.TILE]: 2, [L.WOOD]: 2.5, [L.HAZARD]: 2, [L.SEAM_BAND]: 2,
  [L.FOLIAGE]: 1.5, [L.SOIL]: 3, [L.FOAM]: 2, [L.CRATE]: 2, [L.LINO]: 2,
};

// Note: layer ids at or above 100 take special shader paths.
export const SP = { SKY: 100, SCREEN: 101, STATIC: 102, FONT: 121 };

export const STYLE = {
  STATIC: 0, FLICKER: 1, FAIL: 2, BREATH: 3, BEACON: 4, HEART: 5, STROBE: 6, SPARK: 7,
  SLOW: 8, FLICKER2: 9, PULSE_FAST: 10, COUNT: 16,
};

// Note: tunnel cross-sections; w/h clear size in meters, r corner radius, rib = rib spacing, light = lamp spacing.
// fogK scales the fog density inside the tunnel (big spaces show further); neck = type used by the two end edges of a run.
export const TUNNEL = {
  duct: {
    id: 'duct', w: 4.8, h: 4.8, r: 2.4, rib: 3.2, ribD: 0.3, light: 9, pipes: 2, speed: 1, fogK: 0.9,
  },
  pipeway: {
    id: 'pipeway', w: 5.8, h: 5.6, r: 1.5, rib: 4.0, ribD: 0.25, light: 10, pipes: 5, speed: 1, fogK: 0.85,
  },
  corridor: {
    id: 'corridor', w: 7.4, h: 5.4, r: 0.4, rib: 6.0, ribD: 0.3, light: 8, pipes: 3, speed: 1, fogK: 0.8,
  },
  service: {
    id: 'service', w: 9, h: 6.2, r: 0.6, rib: 6.0, ribD: 0.3, light: 11, pipes: 4, speed: 1, fogK: 0.75,
  },
  trunk: {
    id: 'trunk', w: 16, h: 12, r: 3.0, rib: 8.0, ribD: 0.5, light: 12, pipes: 6, speed: 1, fogK: 0.6,
  },
  gallery: {
    id: 'gallery', w: 34, h: 17, r: 5.0, rib: 12.0, ribD: 0.9, light: 16, pipes: 6, speed: 1, neck: 'trunk', fogK: 0.42,
  },
  crawl: {
    id: 'crawl', w: 3.2, h: 2.8, r: 0.35, rib: 3.0, ribD: 0.15, light: 12, pipes: 2, speed: 1, fogK: 1,
  },
  shaft: {
    id: 'shaft', w: 6.4, h: 6.4, r: 3.2, rib: 4.0, ribD: 0.3, light: 10, pipes: 2, speed: 1, fogK: 0.8,
  },
  bigshaft: {
    id: 'bigshaft', w: 11, h: 11, r: 5.5, rib: 6.0, ribD: 0.4, light: 12, pipes: 3, speed: 1, fogK: 0.6,
  },
  well: {
    id: 'well', w: 44, h: 44, r: 22, rib: 16.0, ribD: 1.2, light: 20, pipes: 6, speed: 1, neck: 'bigshaft', fogK: 0.34, hoop: true,
  },
  nave: {
    id: 'nave', w: 66, h: 44, r: 10, rib: 24.0, ribD: 1.6, light: 24, pipes: 8, speed: 1, neck: 'gallery', fogK: 0.26, vast: true,
  },
  silo: {
    id: 'silo', w: 64, h: 64, r: 32, rib: 20.0, ribD: 1.5, light: 24, pipes: 8, speed: 1, neck: 'bigshaft', fogK: 0.28, vast: true, hoop: true,
  },
};

// Note: wall tint values are multipliers (1 = unchanged albedo).
export const DISTRICTS = [
  {
    id: 'engineering', name: 'ENGINEERING', code: 'E',
    tintA: [0.82, 0.8, 0.78], tintB: [1.0, 0.82, 0.62], tintC: [0.7, 0.72, 0.78],
    lamp: [1.0, 0.66, 0.32], fill: [0.4, 0.52, 0.95], alarm: [1.0, 0.12, 0.05],
    fog: [0.050, 0.034, 0.024], fogDensity: 0.0125, ambient: [0.020, 0.015, 0.012],
    wall: ['PLATE_DARK', 'PLATE_RUST', 'CORRUGATED'], floor: 'GRATING', accent: 'HAZARD',
    types: { duct: 2, pipeway: 4, corridor: 2, service: 3, crawl: 1, trunk: 2, gallery: 1, nave: 1.2 },
    vtypes: { shaft: 4, bigshaft: 3, well: 1.5, silo: 1, duct: 1 },
    fail: 0.16, hum: 49,
  },
  {
    id: 'habitat', name: 'HABITAT', code: 'H',
    tintA: [1.0, 0.9, 0.78], tintB: [0.86, 0.9, 0.95], tintC: [1.0, 0.78, 0.7],
    lamp: [1.0, 0.72, 0.42], fill: [1.0, 0.45, 0.6], alarm: [1.0, 0.25, 0.1],
    fog: [0.050, 0.038, 0.040], fogDensity: 0.0105, ambient: [0.026, 0.020, 0.018],
    wall: ['PLATE_LIGHT', 'WOOD', 'PLATE_LIGHT'], floor: 'CARPET', accent: 'STRIPE_BLUE',
    types: { duct: 1, pipeway: 1, corridor: 5, service: 2, crawl: 0.5, trunk: 1, gallery: 2, nave: 1.8 },
    vtypes: { shaft: 3, bigshaft: 3, well: 1.8, silo: 1.4, duct: 0.5 },
    fail: 0.1, hum: 58,
  },
  {
    id: 'research', name: 'RESEARCH', code: 'R',
    tintA: [0.85, 0.95, 1.0], tintB: [0.8, 0.98, 0.95], tintC: [0.92, 0.92, 1.0],
    lamp: [0.78, 0.9, 1.0], fill: [0.2, 0.9, 0.9], alarm: [1.0, 0.1, 0.2],
    fog: [0.022, 0.040, 0.054], fogDensity: 0.011, ambient: [0.014, 0.022, 0.030],
    wall: ['TILE', 'PLATE_LIGHT', 'TILE'], floor: 'TILE', accent: 'STRIPE_BLUE',
    types: { duct: 1.5, pipeway: 1.5, corridor: 4, service: 2, crawl: 1, trunk: 1, gallery: 1.5, nave: 1.4 },
    vtypes: { shaft: 3, bigshaft: 3, well: 2, silo: 1.4, duct: 0.5 },
    fail: 0.08, hum: 66,
  },
  {
    id: 'cargo', name: 'LOGISTICS', code: 'L',
    tintA: [0.95, 0.9, 0.7], tintB: [0.9, 0.7, 0.45], tintC: [0.75, 0.78, 0.7],
    lamp: [0.9, 0.95, 0.7], fill: [1.0, 0.7, 0.2], alarm: [1.0, 0.3, 0.05],
    fog: [0.040, 0.040, 0.030], fogDensity: 0.0115, ambient: [0.018, 0.018, 0.012],
    wall: ['CONCRETE', 'CORRUGATED', 'PLATE_DARK'], floor: 'GRATING', accent: 'HAZARD',
    types: { duct: 1, pipeway: 2, corridor: 3, service: 2, crawl: 0.5, trunk: 3, gallery: 2, nave: 2.6 },
    vtypes: { shaft: 3, bigshaft: 3, well: 1.5, silo: 1.8, duct: 1 },
    fail: 0.14, hum: 44,
  },
  {
    id: 'command', name: 'OPERATIONS', code: 'O',
    tintA: [0.7, 0.78, 0.95], tintB: [0.62, 0.7, 0.85], tintC: [0.8, 0.85, 1.0],
    lamp: [0.55, 0.75, 1.0], fill: [0.3, 1.0, 0.55], alarm: [1.0, 0.2, 0.2],
    fog: [0.018, 0.026, 0.050], fogDensity: 0.0125, ambient: [0.012, 0.016, 0.032],
    wall: ['PLATE_DARK', 'PLATE_LIGHT', 'PLATE_DARK'], floor: 'PLATE_DARK', accent: 'STRIPE_BLUE',
    types: { duct: 1, pipeway: 1, corridor: 4, service: 2, crawl: 0.5, trunk: 1.5, gallery: 1.5, nave: 1.4 },
    vtypes: { shaft: 2, bigshaft: 3, well: 2.5, silo: 1.4, duct: 0.5 },
    fail: 0.09, hum: 72,
  },
  {
    id: 'decay', name: 'DORMANT', code: 'D',
    tintA: [0.55, 0.62, 0.56], tintB: [0.5, 0.45, 0.4], tintC: [0.4, 0.5, 0.5],
    lamp: [0.72, 0.88, 0.7], fill: [0.9, 0.3, 0.2], alarm: [1.0, 0.1, 0.04],
    fog: [0.026, 0.036, 0.030], fogDensity: 0.016, ambient: [0.008, 0.011, 0.010],
    wall: ['PLATE_RUST', 'CONCRETE', 'PLATE_DARK'], floor: 'GRATING', accent: 'HAZARD',
    types: { duct: 3, pipeway: 3, corridor: 2, service: 2, crawl: 3, trunk: 1, gallery: 1, nave: 1.4 },
    vtypes: { shaft: 5, bigshaft: 2, well: 1.2, silo: 1.2, duct: 2 },
    fail: 0.55, hum: 38,
  },
];

// Note: derive the effective light-style value (0..~1.4) for every style id at time t.
export function evalStyles(t, out) {
  const s = Math.sin;
  out[STYLE.STATIC] = 1;
  const fl = s(t * 37.1) * s(t * 13.7 + 1.3) * s(t * 5.3);
  out[STYLE.FLICKER] = fl > 0.55 ? 0.12 : fl > 0.35 ? 0.55 : 1;
  const f2 = s(t * 23.0 + 2) + s(t * 7.9) * 0.8 + s(t * 51.0) * 0.4;
  out[STYLE.FAIL] = f2 > 1.35 ? 0.0 : f2 > 0.9 ? 0.35 : f2 > 0.2 ? 1 : 0.65 + 0.25 * s(t * 3.1);
  out[STYLE.BREATH] = 0.65 + 0.35 * s(t * 0.9);
  const ph = (t * 0.55) % 1;
  out[STYLE.BEACON] = ph < 0.5 ? 0.15 + 0.85 * Math.sin(ph * Math.PI * 2 * 1.0 + 0.0) ** 2 : 0.1;
  const hb = (t * 0.72) % 1;
  out[STYLE.HEART] = 0.35 + 0.65 * (Math.exp(-((hb - 0.1) ** 2) / 0.003) + 0.55 * Math.exp(-((hb - 0.32) ** 2) / 0.006));
  out[STYLE.STROBE] = (t * 2.2) % 1 < 0.08 ? 1.4 : 0.05;
  out[STYLE.SPARK] = s(t * 91.0) * s(t * 7.3) > 0.82 ? 1.5 : 0.04;
  out[STYLE.SLOW] = 0.5 + 0.5 * s(t * 0.21 + 1.0);
  const f3 = s(t * 29.0 + 5) * s(t * 3.7 + 2);
  out[STYLE.FLICKER2] = f3 > 0.7 ? 0.2 : 1;
  out[STYLE.PULSE_FAST] = 0.5 + 0.5 * s(t * 6.0);
  for (let i = 11; i < STYLE.COUNT; i++) out[i] = 1;
  return out;
}

export const THEME = {
  JUNCTION: 'junction', HANGAR: 'hangar', LOUNGE: 'lounge', GREENHOUSE: 'greenhouse',
  NURSERY: 'nursery', ARCHIVE: 'archive', ARCADE: 'arcade', REACTOR: 'reactor',
  ATRIUM: 'atrium', CARGO: 'cargo', DORM: 'dorm', PROMENADE: 'promenade',
  CONTROL: 'control', VALVES: 'valves', OBSERVATORY: 'observatory', CHAPEL: 'chapel',
  SUBSTATION: 'substation', PUMPHOUSE: 'pumphouse', RELAY: 'relay', LOCK: 'lock',
};

export const DEFAULT_SEED = 'HELIOS-9';
