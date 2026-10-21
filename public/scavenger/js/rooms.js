// Note: hub room themes: size table, surface styles and the planning entry point.

import { L } from './config.js';
import { RoomPlanner } from './roomplan.js';
import { LAYOUTS } from './layouts.js';

// Note: size = [min,max] half extents for x,y,z in meters; long = may swap x/z.
export const THEME_DEF = {
  junction: { size: [[7, 12], [5, 8], [7, 12]], long: false },
  valves: { size: [[8, 12], [6, 9], [8, 12]], long: false },
  hangar: { size: [[20, 28], [10, 14], [20, 28]], long: false },
  lounge: { size: [[13, 19], [6, 9], [13, 19]], long: false },
  greenhouse: { size: [[16, 26], [8, 12], [16, 26]], long: false },
  nursery: { size: [[10, 15], [5, 6.5], [10, 15]], long: false },
  archive: { size: [[12, 18], [6, 9], [14, 22]], long: true },
  arcade: { size: [[12, 18], [5, 7], [16, 24]], long: true },
  reactor: { size: [[22, 30], [18, 26], [22, 30]], long: false },
  atrium: { size: [[20, 30], [18, 26], [20, 30]], long: false },
  cargo: { size: [[20, 30], [10, 15], [22, 30]], long: true },
  dorm: { size: [[8, 11], [4, 5.5], [16, 28]], long: true },
  promenade: { size: [[10, 14], [7, 10], [26, 33]], long: true },
  control: { size: [[13, 19], [6, 9], [13, 19]], long: false },
  observatory: { size: [[12, 18], [8, 12], [12, 18]], long: false },
  chapel: { size: [[9, 13], [10, 14], [9, 13]], long: false },
  substation: { size: [[14, 22], [8, 11], [18, 30]], long: true },
  pumphouse: { size: [[14, 22], [8, 12], [14, 22]], long: false },
  relay: { size: [[10, 15], [8, 13], [10, 15]], long: false },
  lock: { size: [[8, 12], [6, 9], [14, 22]], long: true },
};

// Note: plans lights, props, logs and sound emitters of a hub room with its theme layout.
export function planRoom(plan, rr, world) {
  const R = new RoomPlanner(plan, rr, world);
  (LAYOUTS[plan.room.theme] || LAYOUTS.junction)(R);
  return R.finish();
}

const mulT = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Note: texture tile size in meters for the four side walls (faces 0,1,4,5); floor and ceiling keep defaults.
const wallTile = (m) => [m, m, 0, 0, m, m];

// Note: surface layers and tints of a hub room, by theme with district fallbacks.
export function roomStyle(plan) {
  const D = plan.D;
  const t = plan.room.theme;
  const st = {
    floor: L[D.floor], wall: L[D.wall[0]], ceil: L[D.wall[1]],
    tintF: mulT(D.tintC, 0.9), tintW: D.tintA, tintC: mulT(D.tintB, 0.66),
  };
  switch (t) {
    case 'valves':
      st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK; st.floor = L.GRATING;
      break;
    case 'hangar':
      st.floor = L.CONCRETE; st.wall = L.CORRUGATED; st.ceil = L.PLATE_DARK;
      st.tintF = [0.9, 0.9, 0.88];
      st.uvScale = wallTile(4);
      break;
    case 'lounge':
      st.floor = L.CARPET; st.wall = L.WOOD; st.ceil = L.PLATE_LIGHT;
      st.tintF = [0.9, 0.42, 0.34]; st.tintW = [0.95, 0.8, 0.62]; st.tintC = [0.7, 0.62, 0.54];
      break;
    case 'greenhouse':
      st.floor = L.SOIL; st.wall = L.PLATE_LIGHT; st.ceil = L.GLASS;
      st.tintF = [0.85, 0.9, 0.8]; st.tintW = [0.7, 0.82, 0.7]; st.tintC = [0.5, 0.6, 0.7];
      break;
    case 'nursery':
      st.floor = L.LINO; st.wall = L.PLATE_LIGHT; st.ceil = L.PLATE_LIGHT;
      st.tintF = [0.78, 0.66, 0.42]; st.tintW = [0.8, 0.74, 0.6]; st.tintC = [0.7, 0.68, 0.62];
      break;
    case 'archive':
      st.floor = L.LINO; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.46, 0.48, 0.42]; st.tintW = [0.8, 0.8, 0.85];
      break;
    case 'arcade':
      st.floor = L.CARPET; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.4, 0.35, 0.7]; st.tintW = [0.55, 0.5, 0.7]; st.tintC = [0.4, 0.4, 0.55];
      break;
    case 'reactor':
      st.floor = L.GRATING; st.wall = L.PLATE_DARK; st.ceil = L.CORRUGATED;
      break;
    case 'atrium':
      st.floor = L.TILE; st.wall = L.PLATE_LIGHT; st.ceil = L.PLATE_DARK;
      st.tintF = mulT(D.tintB, 0.8);
      break;
    case 'cargo':
      st.floor = L.CONCRETE; st.wall = L.CORRUGATED; st.ceil = L.PLATE_DARK;
      st.uvScale = wallTile(4);
      break;
    case 'dorm':
      st.floor = L.LINO; st.wall = L.PLATE_LIGHT; st.ceil = L.PLATE_LIGHT;
      st.tintF = [0.7, 0.75, 0.7]; st.tintW = [0.85, 0.85, 0.8];
      break;
    case 'promenade':
      st.floor = L.TILE; st.wall = L.PLATE_LIGHT; st.ceil = L.PLATE_DARK;
      st.tintF = [0.8, 0.78, 0.85]; st.tintW = [0.8, 0.78, 0.9];
      break;
    case 'control':
      st.floor = L.PLATE_DARK; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.55, 0.6, 0.7]; st.tintW = [0.6, 0.66, 0.8]; st.tintC = [0.5, 0.56, 0.7];
      break;
    case 'observatory':
      st.floor = L.PLATE_DARK; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.45, 0.5, 0.62];
      break;
    case 'chapel':
      st.floor = L.WOOD; st.wall = L.CONCRETE; st.ceil = L.CONCRETE;
      st.tintF = [0.7, 0.55, 0.42]; st.tintW = [0.8, 0.78, 0.74];
      break;
    case 'substation':
      st.floor = L.CONCRETE; st.wall = L.PLATE_DARK; st.ceil = L.CORRUGATED;
      st.tintF = [0.62, 0.64, 0.66]; st.tintW = [0.7, 0.74, 0.78]; st.tintC = [0.5, 0.52, 0.56];
      break;
    case 'pumphouse':
      st.floor = L.GRATING; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.6, 0.68, 0.66]; st.tintW = [0.6, 0.72, 0.7]; st.tintC = [0.45, 0.52, 0.52];
      break;
    case 'relay':
      st.floor = L.PLATE_DARK; st.wall = L.PLATE_DARK; st.ceil = L.PLATE_DARK;
      st.tintF = [0.4, 0.46, 0.55]; st.tintW = [0.5, 0.58, 0.7]; st.tintC = [0.4, 0.46, 0.56];
      break;
    case 'lock':
      st.floor = L.PLATE_DARK; st.wall = L.PLATE_LIGHT; st.ceil = L.PLATE_DARK;
      st.tintF = [0.5, 0.5, 0.52]; st.tintW = [0.85, 0.82, 0.62]; st.tintC = [0.5, 0.5, 0.52];
      break;
    default:
      break;
  }
  return st;
}
