import { MAP_W, MAP_H } from './config.js';
import { T, TILE_ART_BASE } from './tiles.js';
import { setTile, tileAt } from './map.js';
import { rng, seedFromString } from './rand.js';

const pieces = [
  { id: 'wagon-circle', name: 'Wagon circle', terrains: ['grassland', 'ranch', 'stage-road', 'desert-scrub'], rows: ['W.C.W', '.B.B.', 'C...C', '.B.B.', 'W.C.W'] },
  { id: 'freight-spill', name: 'Spilled freight', terrains: ['stage-road', 'desert-scrub', 'riverbank'], rows: ['W.CC.', '.B.C.', '...B.', '.C..W'] },
  { id: 'outlaw-camp', name: 'Outlaw camp', terrains: ['desert-scrub', 'wash', 'rocky-hills', 'riverbank'], rows: ['B...C', '.T.S.', 'C...B', '..H..'] },
  { id: 'corral', name: 'Stock corral', terrains: ['grassland', 'ranch', 'stage-road'], rows: ['FFFFF', 'F...F', 'F.H.F', 'F.T.F', 'FF.FF'] },
  { id: 'stone-barricade', name: 'Stone barricade', terrains: ['rocky-hills', 'wash', 'desert-scrub'], rows: ['RR.RR', 'R...R', 'R.B.R', '..C..'] },
  { id: 'supply-cache', name: 'Supply cache', terrains: ['mining-camp', 'stage-road', 'ranch', 'rocky-hills'], rows: ['CC.CC', 'B...B', '.C.B.', 'W...C'] },
  { id: 'prospectors-claim', name: 'Prospector’s claim', terrains: ['mining-camp', 'rocky-hills', 'wash'], rows: ['RR.XR', '.B.C.', '.C...', 'W..RR'] },
  { id: 'hay-yard', name: 'Hay yard', terrains: ['ranch', 'grassland', 'stage-road'], rows: ['HH.HH', 'H...H', '..T..', 'B...C', 'FF.FF'] },
  { id: 'roadblock', name: 'Roadblock', terrains: ['stage-road', 'desert-scrub', 'wash'], rows: ['W.C.W', '.BBB.', '.....', 'C...C'] },
  { id: 'watering-stop', name: 'Watering stop', terrains: ['ranch', 'grassland', 'riverbank', 'stage-road'], rows: ['F...F', 'F.T.F', 'F...F', 'B.H.C', '..W..'] },
  { id: 'abandoned-worksite', name: 'Abandoned worksite', terrains: ['mining-camp', 'rocky-hills', 'desert-scrub'], rows: ['C.X.B', '.FFF.', 'C...C', '.W.B.'] },
  { id: 'hideout', name: 'Rocky hideout', terrains: ['rocky-hills', 'wash', 'riverbank'], rows: ['RR.RR', 'R.C.R', 'R...R', '.B.S.', 'C...C'] },
  { id: 'traders-camp', name: 'Trader’s camp', terrains: ['stage-road', 'riverbank', 'grassland', 'desert-scrub'], rows: ['W...W', '.C.B.', '..T..', 'B...C', '..H..'] },
  { id: 'fence-line', name: 'Broken fence line', terrains: ['ranch', 'grassland', 'stage-road', 'mining-camp'], rows: ['FF.FF', '.....', 'H...B', '.C.T.', 'F...F'] },
  { id: 'diggings', name: 'Old diggings', terrains: ['mining-camp', 'rocky-hills', 'wash'], rows: ['RX.RR', 'R...R', '.C.B.', 'W...C'] },
  { id: 'ranch-supplies', name: 'Ranch supplies', terrains: ['ranch', 'grassland', 'riverbank'], rows: ['HH.HH', '.B.C.', 'F...F', 'F.T.F', 'W...C'] },
  { id: 'graveyard', name: 'Frontier graveyard', terrains: ['desert-scrub', 'grassland', 'rocky-hills'], rows: ['P.P.P', '.....', '.P.P.', 'F...F', 'FF.FF'] },
  { id: 'freight-yard', name: 'Freight yard', terrains: ['stage-road', 'mining-camp', 'desert-scrub'], rows: ['W.C.W', '.CCC.', 'B...B', 'C.C.C', '.W.W.'] },
  { id: 'adobe-ruins', name: 'Adobe ruins', terrains: ['desert-scrub', 'wash', 'rocky-hills'], rows: ['AA.AA', 'A...A', '..C..', 'A.B.A', 'AA.AA'] },
  { id: 'telegraph-line', name: 'Telegraph line', terrains: ['stage-road', 'grassland', 'desert-scrub'], rows: ['P...P', '.C.B.', '.....', 'P.W.P', '..C..'] },
];

const symbols = { W: T.WAGON, C: T.CRATE, B: T.BARREL, T: T.TROUGH, S: T.STOVE, H: T.HAY, F: T.FENCE, R: T.ROCK, X: T.SHAFT, P: T.POST, A: T.ADOBE };
export const SET_PIECE_TILES = {
  'wagon-circle': T.CIRCLE_WAGON, 'freight-spill': T.FREIGHT_CRATE, 'outlaw-camp': T.CAMP_FIRE, corral: T.CORRAL_TROUGH,
  'stone-barricade': T.STONE_POSITION, 'supply-cache': T.SUPPLY_CHEST, 'prospectors-claim': T.CLAIM_SHAFT, 'hay-yard': T.HAY_STACK,
  roadblock: T.ROADBLOCK_WAGON, 'watering-stop': T.WATER_STOP, 'abandoned-worksite': T.WORK_SHAFT, hideout: T.HIDEOUT_BARREL,
  'traders-camp': T.TRADER_WAGON, 'fence-line': T.FENCE_TROUGH, diggings: T.OLD_SHAFT, 'ranch-supplies': T.FEED_BALE,
  graveyard: T.GRAVE_MARKER, 'freight-yard': T.FREIGHT_CART,
  'adobe-ruins': T.RUIN_CRATE, 'telegraph-line': T.TELEGRAPH_POLE,
};
const ground = new Set([T.SAND, T.SCRUB, T.GRASS]);

export const SET_PIECES = pieces.map(({ id, name, terrains }) => ({ id, name, terrains: [...terrains] }));

export function placeSetPiece(map, terrain, seed, reserved, requested) {
  const random = rng(seedFromString(`${seed}:${terrain}:set-piece`));
  const choices = pieces.filter((piece) => piece.terrains.includes(terrain));
  const piece = requested ? pieces.find((entry) => entry.id === requested) : random.pick(choices);
  if (!piece) throw new Error(`Unknown set piece ${requested}`);
  const cells = [];
  for (let y = 0; y < piece.rows.length; y++) {
    for (let x = 0; x < piece.rows[y].length; x++) {
      const tile = symbols[piece.rows[y][x]];
      if (tile !== undefined) cells.push({ x, y, tile });
    }
  }
  const accent = SET_PIECE_TILES[piece.id];
  const accentCell = cells.find((cell) => cell.tile === TILE_ART_BASE[accent]);
  if (accentCell) accentCell.tile = accent;
  const candidates = [];
  for (let y = 3; y <= 19; y++) for (let x = 2; x <= MAP_W - 8; x++) candidates.push({ x, y });
  random.shuffle(candidates);
  const mirrored = random.chance(0.5);
  for (const origin of candidates) {
    const clear = piece.rows.every((row, y) => [...row].every((_, x) => {
      const cellX = origin.x + x;
      const cellY = origin.y + y;
      return cellY < MAP_H - 6 && ground.has(tileAt(map, 0, cellX, cellY)) && !reserved.has(cellY * MAP_W + cellX);
    }));
    if (!clear) continue;
    const placed = cells.map((cell) => ({ x: origin.x + (mirrored ? 4 - cell.x : cell.x), y: origin.y + cell.y, tile: cell.tile }));
    for (const cell of placed) setTile(map, 0, cell.x, cell.y, cell.tile);
    map.art = { kind: 'landmark', theme: piece.id, x: origin.x, y: origin.y, width: piece.rows[0].length, height: piece.rows.length, mirrored };
    return { id: piece.id, name: piece.name, x: origin.x, y: origin.y, mirrored };
  }
  return null;
}
