import { SCALE, TILE } from './config.js';
import { C } from './palette.js';
import { pen, hash, tint, tone, clipTo } from './draw.js';
import { T, TILE_ART_BASE } from './tiles.js';
import { tileAt } from './map.js';
import { paintGround } from './ground.js';
import { paintPiece } from './furniture.js';
import { paintFloorDecor, paintWallDecor, paintShafts } from './saloon-art.js';

const P = pen(SCALE);
const px = P.px;

export const BUILDING_ART = {
  house: { floor: 'boards', wood: C.WOOD_L, wall: C.PLASTER, trim: C.RED_D, fabric: C.RED, motif: 'hearth' },
  boardinghouse: { floor: 'boards', wood: C.PLANK, wall: C.ADOBE_L, trim: C.BLUE_D, fabric: C.BLUE, motif: 'quilt' },
  saloon: { floor: 'boards', wood: C.WOOD, wall: C.RED_D, trim: C.GOLD, fabric: C.GREEN_D, motif: 'cards' },
  hotel: { floor: 'carpet', wood: C.WOOD_L, wall: C.PLASTER_L, trim: C.BLUE_D, fabric: C.BLUE, motif: 'key' },
  store: { floor: 'boards', wood: C.PLANK_L, wall: C.PLASTER, trim: C.GREEN_D, fabric: C.GREEN, motif: 'goods' },
  bank: { floor: 'checker', wood: C.WOOD_D, wall: C.STONE_L, trim: C.GOLD, fabric: C.GREEN_D, motif: 'coin' },
  warehouse: { floor: 'boards', wood: C.PLANK, wall: C.WOOD_L, trim: C.IRON, fabric: C.SAND_D, motif: 'freight' },
  office: { floor: 'boards', wood: C.WOOD_L, wall: C.ADOBE_L, trim: C.WOOD_D, fabric: C.BLUE_D, motif: 'ledger' },
  church: { floor: 'chapel', wood: C.WOOD_D, wall: C.PLASTER_L, trim: C.BLUE, fabric: C.RED_D, motif: 'chapel' },
  blacksmith: { floor: 'stone', wood: C.WOOD_D, wall: C.STONE, trim: C.IRON, fabric: C.RED_D, motif: 'forge' },
  workshop: { floor: 'boards', wood: C.WOOD, wall: C.PLANK_L, trim: C.WOOD_D, fabric: C.SAND_D, motif: 'wheel' },
  ranch: { floor: 'earth', wood: C.PLANK, wall: C.WOOD, trim: C.RED_D, fabric: C.SAND, motif: 'horseshoe' },
  mine: { floor: 'earth', wood: C.WOOD_D, wall: C.PLANK, trim: C.IRON, fabric: C.STONE, motif: 'pick' },
};

export const LANDMARK_ART = {
  'wagon-circle': { ground: C.SAND, accent: C.PLASTER_L, shade: C.WOOD, mark: 'ruts', object: 'canvas' },
  'freight-spill': { ground: C.SAND_D, accent: C.RED_D, shade: C.PLANK, mark: 'splinters', object: 'broken' },
  'outlaw-camp': { ground: C.SAND_D, accent: C.RED, shade: C.DARK, mark: 'ash', object: 'camp' },
  corral: { ground: C.SAND, accent: C.PLANK_L, shade: C.WOOD, mark: 'hoof', object: 'stock' },
  'stone-barricade': { ground: C.STONE, accent: C.PLASTER, shade: C.IRON, mark: 'stone', object: 'fort' },
  'supply-cache': { ground: C.SAND_D, accent: C.BLUE_D, shade: C.WOOD_D, mark: 'rope', object: 'cache' },
  'prospectors-claim': { ground: C.ADOBE_D, accent: C.GOLD, shade: C.STONE, mark: 'ore', object: 'claim' },
  'hay-yard': { ground: C.SAND_L, accent: C.GOLD, shade: C.PLANK, mark: 'straw', object: 'hay' },
  roadblock: { ground: C.SAND_D, accent: C.RED_D, shade: C.DARK, mark: 'ruts', object: 'wreck' },
  'watering-stop': { ground: C.SAND, accent: C.GLASS, shade: C.BLUE_D, mark: 'wet', object: 'water' },
  'abandoned-worksite': { ground: C.STONE, accent: C.IRON_L, shade: C.WOOD_D, mark: 'tools', object: 'work' },
  hideout: { ground: C.ADOBE_D, accent: C.RED_D, shade: C.DARK, mark: 'ash', object: 'hideout' },
  'traders-camp': { ground: C.SAND, accent: C.BLUE, shade: C.RED_D, mark: 'cloth', object: 'trader' },
  'fence-line': { ground: C.SAND_L, accent: C.PLASTER, shade: C.WOOD, mark: 'splinters', object: 'fence' },
  diggings: { ground: C.STONE, accent: C.IRON, shade: C.DARK, mark: 'ore', object: 'old-mine' },
  'ranch-supplies': { ground: C.SAND, accent: C.GOLD, shade: C.WOOD, mark: 'straw', object: 'feed' },
  graveyard: { ground: C.SAND_D, accent: C.STONE_L, shade: C.WOOD_D, mark: 'grave', object: 'grave' },
  'freight-yard': { ground: C.SAND_D, accent: C.RED_D, shade: C.IRON, mark: 'ruts', object: 'freight' },
  'adobe-ruins': { ground: C.ADOBE_L, accent: C.PLASTER, shade: C.ADOBE_D, mark: 'stone', object: 'ruins' },
  'telegraph-line': { ground: C.SAND, accent: C.IRON_L, shade: C.WOOD_D, mark: 'wire', object: 'telegraph' },
};

const cell = (ctx, x, y) => {
  const ox = x * 16;
  const oy = y * 16;
  // Note: every pen call lands inside its own tile, so a repaint of a 3 x 3 area never leaves a spill on a cell it does not redraw.
  const c = clipTo(ctx, x * TILE, y * TILE, TILE);
  return {
    rect: (col, left, top, width, height) => P.rect(c, col, ox + left, oy + top, width, height),
    ell: (col, cx, cy, rx, ry) => P.ell(c, col, ox + cx, oy + cy, rx, ry),
    line: (col, x0, y0, x1, y1, width = px) => P.line(c, col, ox + x0, oy + y0, ox + x1, oy + y1, width),
    poly: (col, points) => P.poly(c, col, points.map(([left, top]) => [ox + left, oy + top])),
  };
};

export function themeAt(map, floor, x, y) {
  const art = map.art;
  if (!art || x < art.x || x >= art.x + art.width || y < art.y || y >= art.y + art.height + (art.porch || 0)) return null;
  if (art.kind === 'landmark') return floor === 0 && LANDMARK_ART[art.theme] ? { ...LANDMARK_ART[art.theme], id: art.theme, kind: art.kind, localX: x - art.x, localY: y - art.y } : null;
  return art.kind === 'building' && BUILDING_ART[art.theme] ? {
    ...BUILDING_ART[art.theme], id: art.theme, kind: art.kind,
    exterior: x === art.x || x === art.x + art.width - 1 || y === art.y || y === art.y + art.height - 1,
    frontSign: floor === 0 && x === art.x + 2 && y === art.y + art.height - 1 && tileAt(map, floor, x, y) !== T.WINDOW,
    // Note: opt-in per-cell variants (art.cells['x,y']); only the playable saloon room sets them, so every other map paints from its theme alone.
    ...(art.cells && art.cells[`${x},${y}`]),
  } : null;
}

// Note: the set piece's rectangle and the colour of its trodden ground, for ground.js; null for a map with no landmark.
export function landmarkPatch(map) {
  const art = map.art;
  if (!art || art.kind !== 'landmark' || !LANDMARK_ART[art.theme]) return null;
  return { x: art.x, y: art.y, w: art.width, h: art.height, col: LANDMARK_ART[art.theme].ground };
}

const WALLS = new Set([T.ADOBE, T.FRAME, T.PARTITION, T.VOID]);
const SOLID = new Set([T.ADOBE, T.FRAME, T.PARTITION, T.VOID, T.DOOR, T.WINDOW]);
const wallAt = (map, floor, x, y) => WALLS.has(tileAt(map, floor, x, y));
const solidAt = (map, floor, x, y) => SOLID.has(tileAt(map, floor, x, y));

// Note: planks run east-west with wide tone steps, paired nails, stains and knots.
function boards(L, theme, x, y, porch = false) {
  const wood = porch ? C.PLANK : theme.wood;
  for (let row = 0; row < 4; row++) {
    const top = row * 4;
    const v = hash(x, y * 4 + row, 21);
    L.rect(tone(wood, (v - 0.5) * 0.3), 0, top, 16, 4);
    L.rect(tint(C.DARK, 0.62), 0, top + 3.6, 16, 0.4);
    L.rect(tint(C.BONE, 0.2), 0, top, 16, px);
    const joint = (Math.floor(hash(x, y, row + 8) * 9) + row * 5) % 16;
    L.rect(tint(C.DARK, 0.5), joint, top, px, 3.6);
    L.rect(C.IRON, joint - 1.2, top + 0.7, px * 1.5, px * 1.5);
    L.rect(C.IRON, joint + 1.0, top + 0.7, px * 1.5, px * 1.5);
    for (let grain = 0; grain < 3; grain++) {
      const gx = hash(x + grain, y, row + 30) * 11;
      L.rect(tint(C.WOOD_D, 0.35), gx, top + 0.8 + grain * 0.8, 2 + hash(x, y + grain, row + 40) * 4, px);
    }
    if (hash(x, y, row + 150) < 0.09) {
      const kx = 2 + hash(y, x, row + 160) * 11;
      L.ell(tint(C.DARK, 0.4), kx, top + 2, 1, 0.7);
    }
  }
  if (hash(x, y, 170) < 0.14) {
    const sx = 3 + hash(x, y, 171) * 10;
    const sy = 3 + hash(x, y, 172) * 10;
    L.ell(tint(C.VOID, 0.13), sx, sy, 2 + hash(x, y, 173) * 2.4, 1.4 + hash(x, y, 174) * 1.6);
  }
}

// Note: a wall darkens the floor along its foot in soft steps; the same fall-off the base floors use.
function wallShade(L, map, floor, x, y) {
  const steps = [0.3, 0.18, 0.09, 0.04];
  const wn = wallAt(map, floor, x, y - 1);
  const ws = wallAt(map, floor, x, y + 1);
  const ww = wallAt(map, floor, x - 1, y);
  const we = wallAt(map, floor, x + 1, y);
  for (let i = 0; i < steps.length; i++) {
    const a = steps[i];
    const d = i * 0.8;
    if (wn) L.rect(tint(C.VOID, a), 0, d, 16, 0.8);
    if (ws) L.rect(tint(C.VOID, a * 0.7), 0, 16 - d - 0.8, 16, 0.8);
    if (ww) L.rect(tint(C.VOID, a * 0.8), d, 0, 0.8, 16);
    if (we) L.rect(tint(C.VOID, a * 0.8), 16 - d - 0.8, 0, 0.8, 16);
  }
}

// Note: window light on the floor one or two tiles inside; fixed art, it ignores the window's state.
function windowLight(L, map, floor, x, y) {
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    for (let d = 1; d <= 2; d++) {
      if (tileAt(map, floor, x + dx * d, y + dy * d) !== T.WINDOW) continue;
      if (d === 2 && SOLID.has(tileAt(map, floor, x + dx, y + dy))) continue;
      const a = d === 1 ? 0.13 : 0.08;
      const slant = d === 1 ? 1.2 : 3.4;
      const near = dy < 0 || dx < 0 ? 0 : 16;
      const far = 16 - near;
      const lo = 3.2 + slant;
      const hi = 12.8 + slant;
      const pts = dx === 0 ? [[lo, near], [hi, near], [hi + 2, far], [lo + 2, far]] : [[near, lo], [near, hi], [far, hi + 2], [far, lo + 2]];
      L.poly(tint(C.GOLD_L, a), pts.map(([u, v]) => [Math.max(0, Math.min(16, u)), Math.max(0, Math.min(16, v))]));
      const bar = tint(C.VOID, a * 0.9);
      const span = Math.min(9.6, 15.8 - (lo + 0.5));
      if (dx === 0) L.rect(bar, lo + 0.5, near ? 6 : 8, span, 0.8);
      else L.rect(bar, near ? 6 : 8, lo + 0.5, 0.8, span);
    }
  }
}

function buildingFloor(L, theme, x, y, tile, map, floor) {
  if (tile === T.PORCH) {
    boards(L, theme, x, y, true);
    return;
  }
  if (theme.floor === 'stone') {
    L.rect(tint(C.DARK, 0.9), 0, 0, 16, 16);
    for (let row = 0; row < 3; row++) {
      const top = row * 5.4;
      const joint = (row % 2) * 4;
      for (let col = joint - 8; col < 16; col += 8) {
        const v = hash(x * 2 + (col - joint) / 8, y * 3 + row, 125);
        // Note: blocks that cross the cell border are clipped; the neighbour paints the rest with the same hash.
        const x0 = Math.max(col, 0) + (col < 0 ? 0 : px);
        const w = Math.min(col + 8, 16) - x0;
        L.rect(tone(C.STONE, (v - 0.5) * 0.3), x0, top + px, w, 5.4 - px * 2);
        L.rect(tint(C.BONE, 0.14), x0, top + px, w, px);
        if (v < 0.25 && col >= 0 && col + 5 <= 16) L.line(tint(C.DARK, 0.4), col + 2, top + 2.2, col + 5, top + 3.4, px);
      }
    }
    for (let spot = 0; spot < 5; spot++) L.ell(tint(C.DARK, 0.2), hash(x, y, spot + 120) * 16, hash(y, x, spot + 130) * 16, 1.3, 0.6);
  } else if (theme.floor === 'checker') {
    L.rect(tint(C.DARK, 0.7), 0, 0, 16, 16);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const light = (row + col + x + y) % 2;
      const v = hash(x * 4 + col, y * 4 + row, 135);
      L.rect(tone(light ? C.PLASTER : C.STONE, (v - 0.5) * 0.12 + (light ? -0.1 : 0.1)), col * 4 + 0.2, row * 4 + 0.2, 3.6, 3.6);
      L.rect(tint(C.BONE, light ? 0.4 : 0.22), col * 4 + 0.2, row * 4 + 0.2, 3.6, px);
      if (v < 0.2) L.line(tint(C.STONE, 0.5), col * 4 + 0.8, row * 4 + 3, col * 4 + 3, row * 4 + 1, px);
    }
  } else if (theme.floor === 'carpet') {
    L.rect(theme.fabric, 0, 0, 16, 16);
    L.rect(tint(C.DARK, 0.28), 0, 0, 16, 16);
    for (let row = 0; row < 8; row++) L.rect(tint(C.DARK, 0.1), 0, row * 2 + 1.4, 16, px);
    for (const [cx, cy] of [[4, 4], [12, 4], [4, 12], [12, 12]]) {
      L.poly(theme.trim, [[cx, cy - 2], [cx + 2, cy], [cx, cy + 2], [cx - 2, cy]]);
      L.poly(tint(C.DARK, 0.35), [[cx, cy - 1], [cx + 1, cy], [cx, cy + 1], [cx - 1, cy]]);
      L.rect(C.GOLD_L, cx - px, cy - px, px * 2, px * 2);
    }
    for (let fleck = 0; fleck < 6; fleck++) L.rect(tint(C.BONE, 0.12), hash(x, y, fleck + 140) * 15, hash(y, x, fleck + 146) * 15, px * 2, px);
    L.rect(tint(C.BONE, 0.14), 0, 0, 16, px);
  } else if (theme.floor === 'earth') {
    // Note: packed earth with straw and stones, for barns and mine buildings.
    L.rect(tone(C.SAND_D, -0.25), 0, 0, 16, 16);
    for (let i = 0; i < 6; i++) L.ell(tint(C.DARK, 0.15), hash(x, y, i + 150) * 12 + 2, hash(y, x, i + 156) * 12 + 2, 1.2, 0.6);
    for (let i = 0; i < 4; i++) {
      const sx = hash(x, y, i + 162) * 11 + 2;
      const sy = hash(y, x, i + 166) * 11 + 2;
      L.line(tint(C.GOLD, 0.35), sx, sy, sx + 2, sy - 0.8, px);
    }
  } else if (theme.floor === 'chapel') {
    boards(L, theme, x, y);
    L.rect(tint(C.BONE, 0.22), 0, 0, px, 16);
    if ((x + y) % 3 === 0) L.rect(tint(C.GOLD, 0.2), 2, 12, 11, px);
  } else boards(L, theme, x, y);
  if (theme.motif === 'freight' && tile === T.FLOOR && hash(x, y, 125) < 0.45) {
    L.line(tint(C.DARK, 0.45), 2, 8, 13, 8, 0.8);
    L.line(tint(C.DARK, 0.3), 4, 9.5, 10, 9.5, px);
  }
  if (tile === T.RUG) {
    L.rect(tint(C.VOID, 0.2), 0, 1.6, 16, 14);
    L.rect(theme.fabric, 0, 1, 16, 14);
    L.rect(tint(C.DARK, 0.14), 0, 1, 16, 14);
    L.rect(theme.trim, 0, 1, 16, 1);
    L.rect(theme.trim, 0, 14, 16, 1);
    L.rect(tint(C.BONE, 0.2), 0, 2.6, 16, px);
    L.rect(tint(C.BONE, 0.2), 0, 12.4, 16, px);
    for (let q = 2; q < 16; q += 4) {
      L.poly(C.GOLD, [[q, 6], [q + 1.5, 8], [q, 10], [q - 1.5, 8]]);
      L.rect(C.BONE, q - px, 8 - px, px * 2, px * 2);
    }
  }
  if (map) {
    wallShade(L, map, floor, x, y);
    if (tile !== T.PORCH) windowLight(L, map, floor, x, y);
  }
  // Note: only the playable saloon sets these patch fields, so no other building paints differently.
  if (theme.shafts) paintShafts(L, theme, x, y);
  if (theme.decor) paintFloorDecor(L, theme, x, y);
}

function buildingSign(L, theme) {
  L.rect(tint(C.VOID, 0.35), 2.5, 3, 11.5, 8);
  L.rect(C.WOOD_D, 2, 2.5, 11.5, 8);
  L.rect(theme.trim, 2.8, 3.3, 9.9, 6.4);
  L.rect(C.DARK, 3.5, 4, 8.5, 5);
  if (theme.motif === 'chapel') {
    L.rect(C.GOLD_L, 7.2, 4.5, 1.4, 4);
    L.rect(C.GOLD_L, 5.8, 5.5, 4.2, 1.1);
  } else if (theme.motif === 'forge') {
    L.ell(C.IRON_L, 7.8, 6.4, 2.4, 2.2);
    L.ell(C.DARK, 7.8, 6.2, 1.4, 1.3);
    L.rect(C.DARK, 6.3, 3.9, 3, 1.5);
  } else if (theme.motif === 'cards') {
    L.rect(C.PLASTER_L, 5.4, 4.4, 2.4, 3.8);
    L.rect(C.PLASTER_L, 8.5, 4.8, 2.4, 3.8);
    L.rect(C.RED, 6.1, 5.4, px * 2, px * 2);
    L.rect(C.RED, 9.2, 6, px * 2, px * 2);
  } else if (theme.motif === 'key') {
    L.ell(C.GOLD, 6.1, 6.5, 1.7, 1.6);
    L.ell(C.DARK, 6.1, 6.5, 0.8, 0.8);
    L.rect(C.GOLD, 7.5, 6, 3.7, 1);
    L.rect(C.GOLD, 10.1, 6, 0.8, 2);
  } else if (theme.motif === 'coin') {
    L.ell(C.GOLD, 7.8, 6.5, 2.5, 2.2);
    L.ell(C.GOLD_L, 7.5, 6.1, 1.3, 1.2);
    L.rect(C.WOOD_D, 7.4, 4.9, 0.8, 3.2);
  } else if (theme.motif === 'goods') {
    L.rect(C.PLASTER, 5, 4.5, 2.1, 3.5);
    L.rect(C.RED, 7.3, 5, 1.7, 3);
    L.rect(C.GREEN, 9.3, 4.3, 1.8, 3.7);
  } else if (theme.motif === 'freight') {
    L.rect(C.PLANK_L, 5, 4.5, 5.8, 4);
    L.line(C.WOOD_D, 5.3, 4.8, 10.4, 8.2, px * 2);
    L.line(C.WOOD_D, 10.4, 4.8, 5.3, 8.2, px * 2);
  } else if (theme.motif === 'ledger') {
    L.rect(C.PLASTER_L, 5.1, 4.2, 5.4, 4.4);
    for (let row = 0; row < 3; row++) L.rect(C.WOOD, 5.8, 5 + row, 3.8, px);
  } else if (theme.motif === 'wheel') {
    L.ell(C.WOOD_L, 7.8, 6.5, 2.4, 2.4);
    L.ell(C.DARK, 7.8, 6.5, 1.6, 1.6);
    L.line(C.WOOD_L, 6, 6.5, 9.6, 6.5, px * 2);
    L.line(C.WOOD_L, 7.8, 4.7, 7.8, 8.3, px * 2);
  } else if (theme.motif === 'horseshoe') {
    L.ell(C.IRON_L, 7.8, 6.2, 2.3, 2.2);
    L.ell(C.DARK, 7.8, 6.6, 1.3, 1.6);
    L.rect(C.DARK, 6.8, 7.4, 2, 1.4);
  } else if (theme.motif === 'pick') {
    L.line(C.IRON_L, 5.2, 5, 10.4, 5.6, px * 3);
    L.line(C.WOOD_L, 7.8, 5.2, 7.8, 8.6, px * 2);
  } else if (theme.motif === 'quilt') {
    L.rect(C.BONE, 5, 4.5, 5.5, 3.5);
    L.rect(C.PLASTER_L, 5.5, 5, 4.5, 2.5);
    L.rect(C.BONE, 10.5, 5.2, 1.2, 2);
    L.rect(C.DARK, 10.5, 5.7, 0.6, 1);
  } else {
    L.poly(C.PLASTER_L, [[5, 6], [7.8, 4], [10.6, 6], [10.6, 8.6], [5, 8.6]]);
    L.rect(theme.fabric, 7.2, 6.5, 1.3, 2.1);
  }
  L.rect(tint(C.BONE, 0.35), 2.8, 3.3, 9.9, px);
}

// Note: a wall tile shows its top, and its face too where the south is open.
function openSides(map, floor, x, y) {
  return {
    n: !solidAt(map, floor, x, y - 1),
    s: !solidAt(map, floor, x, y + 1),
    w: !solidAt(map, floor, x - 1, y),
    e: !solidAt(map, floor, x + 1, y),
  };
}

function edgeLights(L, open, base) {
  if (open.n) {
    L.rect(tone(base, 0.2), 0, 0, 16, px * 2);
    L.rect(tint(C.BONE, 0.32), 0, 0, 16, px);
  }
  if (open.w) L.rect(tint(C.BONE, 0.22), 0, 0, px * 2, 16);
  if (open.e) L.rect(tint(C.VOID, 0.22), 16 - px * 2, 0, px * 2, 16);
}

// Note: where the face meets the ground it falls into shadow.
function footShadow(L) {
  L.rect(tint(C.VOID, 0.14), 0, 12.6, 16, 3.4);
  L.rect(tint(C.VOID, 0.2), 0, 14.2, 16, 1.8);
  L.rect(tint(C.VOID, 0.45), 0, 15, 16, 1);
}

// Note: masonry in staggered blocks, each with its own tone; the courses run on across the tile edges.
function blockWall(L, theme, x, y, open) {
  const base = theme.wall;
  L.rect(tone(base, -0.38), 0, 0, 16, 16);
  for (let row = 0; row < 4; row++) {
    const top = row * 4;
    const stagger = (row % 2) * 4;
    for (let col = stagger - 8; col < 16; col += 8) {
      const v = hash(x * 2 + (col - stagger) / 8, y * 4 + row, 91);
      const left = Math.max(0, col);
      const right = Math.min(16, col + 8);
      L.rect(tone(base, (v - 0.5) * 0.2), left + px, top + px, right - left - px, 4 - px * 2);
      L.rect(tint(C.BONE, 0.18), left + px, top + px, right - left - px, px);
      if (v > 0.8) L.rect(tint(C.VOID, 0.12), left + px, top + 2.4, right - left - px, 1.4 - px);
    }
  }
  for (let fleck = 0; fleck < 7; fleck++) L.rect(tint(fleck % 2 ? C.VOID : C.BONE, 0.14), hash(x, y, fleck + 95) * 15, hash(y, x, fleck + 99) * 15, px * 2, px);
  edgeLights(L, open, base);
  if (open.s) footShadow(L);
}

// Note: the massive exterior wall of a building; a regional material of stone, sod or log changes the colour or the course, adobe and no material keep the plain wall.
const MASSIVE_WALL = { stone: C.STONE_L, sod: C.ADOBE_D };
function massiveWall(L, theme, x, y, open, material) {
  if (material === 'log') sidingWall(L, { ...theme, wood: C.WOOD_D }, x, y, open);
  else blockWall(L, MASSIVE_WALL[material] === undefined ? theme : { ...theme, wall: MASSIVE_WALL[material] }, x, y, open);
}

// Note: lapped siding of unequal tone; the trim colour shows only as fascia and skirting.
function sidingWall(L, theme, x, y, open) {
  const wood = theme.wood;
  for (let row = 0; row < 5; row++) {
    const top = row * 3.2;
    const v = hash(x, y * 5 + row, 70);
    L.rect(tone(wood, 0.12 + (v - 0.5) * 0.26), 0, top, 16, 3.2);
    L.rect(tint(C.BONE, 0.24), 0, top, 16, px);
    L.rect(tint(C.VOID, 0.5), 0, top + 2.5, 16, 0.7);
    L.rect(tint(C.DARK, 0.3), 0, top + 2.2, 16, px);
    const gx = hash(x, y * 5 + row, 71) * 9;
    L.rect(tint(C.WOOD_D, 0.4), gx, top + 1, 3 + hash(y, x, row + 72) * 4, px);
    if (hash(x, y * 5 + row, 73) < 0.5) {
      L.rect(C.IRON, 1 + hash(x, y * 5 + row, 74) * 3, top + 1.3, px * 1.5, px * 1.5);
      L.rect(C.IRON, 12 + hash(x, y * 5 + row, 75) * 3, top + 1.3, px * 1.5, px * 1.5);
    }
  }
  for (let streak = 0; streak < 2; streak++) L.rect(tint(C.VOID, 0.1), 1 + hash(x, y, streak + 76) * 14, 0, px, 16);
  if (open.n) {
    L.rect(tone(theme.trim, -0.1), 0, 0, 16, 2.2);
    L.rect(tint(C.BONE, 0.38), 0, 0, 16, px);
    L.rect(tint(C.VOID, 0.3), 0, 2.2, 16, px * 2);
  }
  if (open.w) {
    L.rect(tint(C.VOID, 0.5), 0, 0, px, 16);
    L.rect(tint(C.BONE, 0.24), px, 0, px * 2, 16);
  }
  if (open.e) {
    L.rect(tint(C.VOID, 0.5), 16 - px, 0, px, 16);
    L.rect(tint(C.VOID, 0.24), 16 - px * 3, 0, px * 2, 16);
  }
  if (open.s) {
    L.rect(tone(theme.trim, -0.35), 0, 12.8, 16, 1.6);
    L.rect(tint(C.BONE, 0.2), 0, 12.8, 16, px);
    footShadow(L);
  }
}

// Note: a room wall: pale coping where it runs south, else plaster over a wainscot and chair rail.
function plasterWall(L, theme, x, y, open) {
  const base = theme.wall;
  const cap = tone(base, 0.3);
  if (open.s) {
    L.rect(base, 0, 0, 16, 16);
    for (let blot = 0; blot < 5; blot++) {
      L.ell(tint(hash(x, y, blot + 80) < 0.5 ? C.VOID : C.BONE, 0.08), hash(x, y, blot + 82) * 16, 2.4 + hash(y, x, blot + 84) * 7, 2 + hash(x, y, blot + 86) * 3, 1.2 + hash(y, x, blot + 88) * 1.6);
    }
    if (theme.motif === 'cards' || theme.motif === 'key' || theme.motif === 'quilt') {
      for (let col = 2; col < 16; col += 4) L.rect(tint(theme.trim, 0.18), col, 2.4, px * 2, 7.2);
    }
    L.rect(tint(C.VOID, 0.1), 0, 2.4, 16, 7.2);
    L.rect(tone(theme.wood, -0.18), 0, 9.6, 16, 6.4);
    for (let col = 0; col < 16; col += 4) {
      const v = hash(x * 4 + col, y, 89);
      L.rect(tone(theme.wood, (v - 0.5) * 0.16 - 0.04), col + px, 11, 4 - px * 2, 4);
      L.rect(tint(C.BONE, 0.16), col + px, 11, px, 4);
      L.rect(tint(C.VOID, 0.35), col, 11, px, 4);
    }
    L.rect(theme.trim, 0, 9.6, 16, 1.4);
    L.rect(tint(C.BONE, 0.4), 0, 9.6, 16, px);
    L.rect(tint(C.VOID, 0.3), 0, 11, 16, px);
    L.rect(tone(theme.wood, -0.45), 0, 14.4, 16, 0.6);
    if (open.n) {
      L.rect(cap, 0, 0, 16, 2.4);
      L.rect(tint(C.BONE, 0.4), 0, 0, 16, px);
      L.rect(tint(C.VOID, 0.3), 0, 2.4, 16, px * 2);
    }
    footShadow(L);
  } else {
    const left = open.w ? 2 : 0;
    const right = open.e ? 14 : 16;
    L.rect(tone(base, 0.12), 0, 0, 16, 16);
    L.rect(cap, left, 0, right - left, 16);
    if (open.w) L.rect(tint(C.BONE, 0.3), left, 0, px, 16);
    if (open.e) L.rect(tint(C.VOID, 0.22), right - px, 0, px, 16);
    for (let fleck = 0; fleck < 8; fleck++) L.rect(tint(fleck % 2 ? C.VOID : C.BONE, 0.12), left + hash(x, y, fleck + 80) * (right - left - 2), hash(y, x, fleck + 90) * 15, px * 2, px);
    if (hash(x, y, 98) < 0.3) L.line(tint(C.VOID, 0.2), left + 2 + hash(x, y, 99) * 6, 0, left + 3 + hash(y, x, 99) * 6, 5 + hash(x, y, 97) * 6, px);
    if (open.n) L.rect(tint(C.BONE, 0.4), 0, 0, 16, px);
  }
  if (open.w) {
    L.rect(tint(C.VOID, 0.55), 0, 0, px, 16);
    L.rect(tint(C.BONE, 0.28), px, 0, px, open.s ? 9.6 : 16);
  }
  if (open.e) {
    L.rect(tint(C.VOID, 0.55), 16 - px, 0, px, 16);
    L.rect(tint(C.VOID, 0.2), 16 - px * 2, 0, px, open.s ? 9.6 : 16);
  }
}

function buildingWall(L, theme, x, y, tile, map, floor) {
  const open = map ? openSides(map, floor, x, y) : { n: true, s: true, w: true, e: true };
  if (theme.exterior && tile !== T.PARTITION) {
    if (tile === T.ADOBE) massiveWall(L, theme, x, y, open, map && map.material);
    else sidingWall(L, theme, x, y, open);
  } else plasterWall(L, theme, x, y, open);
  if (theme.exterior && theme.frontSign && tile !== T.PARTITION) buildingSign(L, theme);
  if (theme.deco) paintWallDecor(L, theme, x, y);
}

function landmarkGround(L, theme, x, y, ctx, map, floor) {
  paintGround(ctx, map, floor, x * 16, y * 16, x, y, { patch: landmarkPatch(map) });
  for (let i = 0; i < 14; i++) {
    const gx = hash(x + i, y, 16) * 15;
    const gy = hash(x, y + i, 17) * 15;
    L.rect(i % 3 ? tint(theme.shade, 0.28) : tint(C.BONE, 0.3), gx, gy, px * 2, px);
  }
  const offset = hash(x, y, 18) * 4;
  if (theme.mark === 'ruts') {
    L.line(tint(C.WOOD_D, 0.4), 0, 4 + offset, 16, 5 + offset, 0.8);
    L.line(tint(C.WOOD_D, 0.4), 0, 11 + offset, 16, 12 + offset, 0.8);
  } else if (theme.mark === 'straw' || theme.mark === 'splinters') {
    for (let i = 0; i < 5; i++) {
      const gx = hash(x, y, 50 + i) * 13;
      const gy = hash(y, x, 60 + i) * 13;
      L.line(tint(theme.accent, 0.65), gx, gy, gx + 2.4, gy + 1.1, px);
    }
  } else if (theme.mark === 'ash' || theme.mark === 'ore' || theme.mark === 'stone') {
    for (let i = 0; i < 4; i++) L.ell(tint(i % 2 ? theme.shade : theme.accent, 0.35), 2 + hash(x, y, 70 + i) * 12, 2 + hash(y, x, 75 + i) * 12, 1.1, 0.7);
  } else if (theme.mark === 'hoof') {
    L.ell(tint(C.WOOD_D, 0.3), 4 + offset, 5, 1, 1.4);
    L.ell(tint(C.WOOD_D, 0.3), 11, 11 - offset, 1, 1.4);
  } else if (theme.mark === 'wet') {
    L.ell(tint(C.GLASS, 0.28), 8, 8, 4.5, 1.6);
    L.line(tint(C.GLASS_L, 0.4), 5, 8, 10, 8, px);
  } else if (theme.mark === 'grave') {
    L.ell(tint(C.STONE, 0.28), 8, 8, 4, 6);
    L.line(tint(C.WOOD_D, 0.3), 5, 4, 11, 4, px);
  } else if (theme.mark === 'wire') {
    if (theme.localY === 0 || theme.localY === 3) L.line(C.IRON, 0, 3, 16, 3, px);
  } else {
    L.line(tint(theme.accent, 0.4), 3, 4 + offset, 8, 6 + offset, px);
    L.line(tint(theme.shade, 0.35), 9, 10, 13, 11, px);
  }
}

function groundShadow(L, width = 12, height = 10) {
  L.ell(tint(C.VOID, 0.32), 8.8, 9.4, width / 2, height / 2);
}

function furniture(L, theme, tile, x, y) {
  paintPiece(L, theme, TILE_ART_BASE[tile] ?? tile, x, y);
}

function landmarkAccent(L, tile) {
  if (!((tile >= T.CIRCLE_WAGON && tile <= T.FEED_BALE) || (tile >= T.GRAVE_MARKER && tile <= T.TELEGRAPH_POLE))) return false;
  const frame = (outer, inner) => {
    L.rect(C.WOOD_D, 1, 2, 14, 12);
    L.rect(outer, 1.7, 2.7, 12.6, 10.6);
    L.rect(inner, 2.5, 3.5, 11, 9);
    L.rect(tint(C.BONE, 0.35), 2.5, 3.5, 11, px);
  };
  const wheel = (x, y) => {
    L.ell(C.IRON, x, y, 2, 2);
    L.ell(C.WOOD_L, x, y, 1.3, 1.3);
    L.ell(C.DARK, x, y, 0.5, 0.5);
  };
  const timber = (x0, y0, x1, y1, width = 1.4) => {
    L.line(C.WOOD_D, x0, y0, x1, y1, width + 0.4);
    L.line(C.PLANK_L, x0, y0 - 0.3, x1, y1 - 0.3, width * 0.5);
  };
  groundShadow(L, 14, 12);
  switch (tile) {
    case T.CIRCLE_WAGON:
      L.rect(C.WOOD_D, 1, 3.2, 14, 9.8);
      L.ell(C.PLASTER, 8, 8, 6.3, 4.3);
      L.ell(C.PLASTER_L, 7.5, 7.2, 5.4, 3.2);
      for (const x of [4.2, 7.8, 11.4]) L.line(C.WOOD, x, 4.3, x, 11.7, 0.8);
      L.line(C.WOOD_D, 2, 8, 14, 8, 0.8);
      for (const [x, y] of [[2, 2], [14, 2], [2, 14], [14, 14]]) wheel(x, y);
      return true;
    case T.FREIGHT_CRATE:
      L.poly(C.WOOD_D, [[1, 2], [7, 1], [14, 4], [14, 13], [8, 15], [2, 12]]);
      L.poly(C.PLANK_L, [[2, 3], [7, 2], [12, 4], [12, 11], [7, 13], [3, 11]]);
      L.rect(C.DARK, 4, 5, 7, 5);
      timber(2, 3, 13, 12);
      timber(12, 2, 4, 8, 1);
      L.ell(C.PLASTER, 6, 7.4, 2.1, 1.6);
      L.ell(C.RED_D, 10.7, 9.4, 1.2, 1.1);
      return true;
    case T.CAMP_FIRE:
      for (let i = 0; i < 9; i++) {
        const angle = i * Math.PI * 2 / 9;
        const cx = 8 + Math.cos(angle) * 5;
        const cy = 8 + Math.sin(angle) * 4.5;
        L.ell(C.STONE, cx, cy, 1.7, 1.4);
        L.ell(C.STONE_L, cx - 0.3, cy - 0.3, 0.8, 0.6);
      }
      L.ell(C.DARK, 8, 8, 4.5, 3.7);
      timber(4, 5.5, 12, 10.5, 1.8);
      timber(4.5, 10.5, 11, 5, 1.8);
      L.poly(C.RED, [[5, 9], [6, 5], [7, 6.5], [9, 3], [11, 9], [9, 11]]);
      L.poly(C.GOLD, [[6.4, 9], [8.1, 5.8], [9.8, 9.1], [8, 10.6]]);
      return true;
    case T.CORRAL_TROUGH:
      L.rect(C.WOOD_D, 0.8, 4, 14.4, 8);
      L.rect(C.PLANK, 1.7, 4.8, 12.6, 6.4);
      L.rect(C.SAND_D, 2.5, 5.5, 11, 4.8);
      for (let i = 0; i < 7; i++) L.line(i % 2 ? C.GOLD : C.SAND_L, 3 + i * 1.4, 6, 4 + i * 1.3, 9.7, px);
      L.rect(C.IRON, 1.2, 4, 1, 8);
      L.rect(C.IRON, 13.8, 4, 1, 8);
      return true;
    case T.STONE_POSITION:
      L.poly(C.IRON, [[1, 10], [2, 4], [6, 1], [12, 2], [15, 8], [13, 13], [5, 15]]);
      L.poly(C.STONE, [[2, 9], [3, 4], [7, 2], [12, 3], [14, 8], [11, 12], [5, 13]]);
      L.poly(C.STONE_L, [[3, 5], [6, 3], [10, 3], [9, 6], [4, 7]]);
      for (const [cx, cy] of [[4, 10], [8, 9.5], [12, 10]]) {
        L.ell(C.PLASTER, cx, cy, 2.2, 1.5);
        L.line(C.WOOD, cx - 1, cy, cx + 1, cy, px);
      }
      return true;
    case T.SUPPLY_CHEST:
      frame(C.WOOD, C.WOOD_L);
      L.rect(C.IRON, 3.4, 3.5, 1.3, 9);
      L.rect(C.IRON, 11.3, 3.5, 1.3, 9);
      L.rect(C.IRON_L, 3.4, 3.5, px, 9);
      L.rect(C.IRON_L, 11.3, 3.5, px, 9);
      L.rect(C.GOLD, 6.8, 7, 2.4, 2);
      L.rect(C.DARK, 7.6, 7.8, 0.8, 1.4);
      return true;
    case T.CLAIM_SHAFT:
      frame(C.PLANK_L, C.DARK);
      L.rect(C.VOID, 4, 4.2, 8, 7.6);
      timber(1, 6.6, 15, 6.6, 1.5);
      timber(4, 3, 11.5, 11.6, 1.2);
      L.line(C.IRON_L, 3.2, 8, 8.4, 2.8, 1.4);
      L.poly(C.GOLD, [[10, 10], [11, 8.7], [13, 9.5], [12.8, 11.8], [10.5, 12.4]]);
      L.rect(C.GOLD_L, 11, 9.7, 1.2, px);
      return true;
    case T.HAY_STACK:
      L.rect(C.WOOD_D, 1, 2, 14, 12);
      L.rect(C.GOLD, 1.6, 2.8, 12.8, 10.4);
      for (let row = 0; row < 7; row++) L.line(row % 2 ? C.SAND_L : C.PLANK_L, 2, 3.4 + row * 1.3, 13.6, 4 + row * 1.3, px);
      L.line(C.WOOD_D, 5, 2.8, 5, 13.2, 1.2);
      L.line(C.WOOD_D, 10.5, 2.8, 10.5, 13.2, 1.2);
      L.ell(C.PLASTER, 8, 7.6, 3, 2.2);
      L.line(C.WOOD, 6.2, 7, 9.7, 8.2, px);
      return true;
    case T.ROADBLOCK_WAGON:
      L.rect(C.DARK, 1, 3, 14, 10);
      L.rect(C.WOOD, 2, 4, 12, 8);
      timber(2, 3, 13, 12, 2);
      timber(13, 4, 3, 11.5, 1.8);
      L.poly(C.RED_D, [[6, 4], [12, 5], [10, 9], [7, 8]]);
      wheel(2, 13.5);
      wheel(13.5, 2);
      L.line(C.IRON, 12, 12, 15, 15, 1);
      return true;
    case T.WATER_STOP:
      L.rect(C.WOOD_D, 1, 3.5, 14, 9);
      L.rect(C.PLANK_L, 1.8, 4.3, 12.4, 7.4);
      L.rect(C.BLUE_D, 2.7, 5.2, 10.6, 5.6);
      L.rect(C.GLASS, 3, 5.5, 10, 4.8);
      L.line(C.GLASS_L, 4, 7, 8, 7, px);
      L.line(C.GLASS_L, 8, 9, 12, 9, px);
      L.ell(C.IRON, 3, 4.5, 2.2, 2.1);
      L.ell(C.GLASS_L, 3, 4.5, 1.3, 1.2);
      return true;
    case T.WORK_SHAFT:
      frame(C.WOOD_L, C.DARK);
      L.rect(C.VOID, 4, 4, 8, 8);
      timber(1, 7, 15, 7, 2);
      timber(4, 3, 11.5, 12, 1.1);
      L.line(C.IRON_L, 3.1, 7, 7.5, 3, 1.4);
      L.rect(C.IRON, 9.7, 9.5, 3.5, 2.5);
      L.rect(C.RED_D, 10.3, 10, 2.3, 1.2);
      return true;
    case T.HIDEOUT_BARREL:
      L.ell(C.IRON, 8, 8, 6.8, 6.8);
      L.ell(C.WOOD_D, 8, 8, 5.9, 5.9);
      L.ell(C.PLANK, 8, 8, 5, 5);
      for (let x = 4; x < 13; x += 2) L.line(C.WOOD_D, x, 4.5, x, 11.5, px);
      L.rect(C.RED_D, 3.2, 6.2, 9.6, 4);
      L.line(C.BONE, 3.8, 7.3, 12.2, 7.3, px);
      L.line(C.BONE, 3.8, 9.1, 12.2, 9.1, px);
      return true;
    case T.TRADER_WAGON:
      L.rect(C.WOOD_D, 1, 3, 14, 10);
      L.rect(C.RED_D, 2, 4, 12, 8);
      L.rect(C.BLUE_D, 2.6, 4.6, 10.8, 6.8);
      for (let x = 3; x < 14; x += 2.4) L.rect(C.GOLD, x, 4.6, 0.8, 6.8);
      L.ell(C.PLASTER, 7.9, 8, 3, 2.4);
      L.line(C.WOOD_D, 6, 7, 9.8, 8.5, px);
      for (const [x, y] of [[2, 2], [14, 2], [2, 14], [14, 14]]) wheel(x, y);
      return true;
    case T.FENCE_TROUGH:
      L.poly(C.WOOD_D, [[1, 4], [14, 4], [15, 7], [13, 12], [2, 12]]);
      L.poly(C.PLANK, [[2, 5], [13, 5], [13, 10.8], [2.7, 11]]);
      L.line(C.DARK, 3, 6, 12, 10, 1.6);
      L.line(C.PLANK_L, 3, 5.6, 12, 9.6, px);
      L.rect(C.SAND_L, 5, 8, 3, px);
      return true;
    case T.OLD_SHAFT:
      frame(C.WOOD, C.VOID);
      timber(2.5, 3.5, 13.5, 12.5, 2.6);
      timber(13, 3.5, 3, 12.3, 2.3);
      L.line(C.DARK, 8, 4.5, 9, 11, px);
      return true;
    case T.FEED_BALE:
      L.rect(C.WOOD_D, 1, 2.2, 14, 11.6);
      L.rect(C.GOLD, 1.8, 3, 12.4, 10);
      for (let row = 0; row < 6; row++) L.line(C.SAND_L, 2.5, 3.8 + row * 1.4, 13.2, 4.2 + row * 1.4, px);
      for (const x of [5, 10.5]) L.line(C.WOOD_D, x, 3, x, 13, 1);
      L.ell(C.PLASTER, 8, 8, 3.1, 2.5);
      L.rect(C.RED_D, 6.3, 7, 3.4, 1.6);
      L.rect(C.BONE, 6.7, 7.5, 2.5, px);
      return true;
    case T.GRAVE_MARKER:
      L.rect(C.DARK, 3.2, 1.6, 9.6, 12.8);
      L.poly(C.STONE_L, [[4, 4], [5.4, 2.5], [10.6, 2.5], [12, 4], [12, 13], [4, 13]]);
      L.rect(C.PLASTER, 4.6, 4, 6.8, 8.3);
      L.rect(C.IRON, 7.3, 5, 1.4, 5.5);
      L.rect(C.IRON, 5.8, 6.4, 4.4, 1.2);
      L.rect(tint(C.STONE, 0.55), 4.6, 11.8, 6.8, 1);
      return true;
    case T.FREIGHT_CART:
      L.rect(C.WOOD_D, 1, 3, 14, 10);
      L.rect(C.PLANK, 2, 4, 12, 8);
      for (const [x, y] of [[2, 2], [14, 2], [2, 14], [14, 14]]) wheel(x, y);
      L.rect(C.WOOD_D, 3, 4.6, 4.2, 3.5);
      L.rect(C.PLANK_L, 3.5, 5, 3.2, 2.8);
      L.ell(C.PLASTER, 10.2, 8.5, 2.8, 2.2);
      L.line(C.WOOD, 8.5, 8, 11.7, 9, px);
      return true;
    case T.RUIN_CRATE:
      L.poly(C.WOOD_D, [[2, 3], [11, 2], [14, 5], [13, 13], [4, 14], [2, 10]]);
      L.poly(C.ADOBE, [[3, 4], [10, 3], [13, 5], [12, 11], [5, 13], [3, 10]]);
      L.poly(C.DARK, [[4, 5], [10, 4], [11, 9], [6, 11]]);
      timber(3, 4, 12, 11, 1.4);
      L.ell(C.ADOBE_L, 9, 7, 1.8, 1.2);
      return true;
    case T.TELEGRAPH_POLE:
      L.rect(C.WOOD_D, 5, 1.5, 6, 13);
      L.rect(C.WOOD_L, 6, 2, 4, 12);
      L.rect(C.WOOD_D, 0.5, 3.5, 15, 3);
      L.rect(C.WOOD, 1, 4, 14, 2);
      for (const cx of [2, 5, 9, 12]) L.ell(C.GLASS_L, cx, 4.2, 0.8, 0.8);
      L.line(C.IRON, 0, 3, 16, 3, px);
      return true;
  }
  return false;
}

function landmarkObject(L, theme, tile, map, floor, x, y) {
  const base = TILE_ART_BASE[tile] ?? tile;
  const wood = theme.shade;
  if (base === T.FENCE) {
    const horizontal = [tileAt(map, floor, x - 1, y), tileAt(map, floor, x + 1, y)].includes(T.FENCE);
    for (let k = 0; k < 16; k += 4) {
      if (horizontal) {
        L.rect(C.WOOD_D, k + 1, 2.4, 2, 11.2);
        L.rect(theme.accent, k + 1.2, 2.5, 1.4, 10.5);
      } else {
        L.rect(C.WOOD_D, 2.4, k + 1, 11.2, 2);
        L.rect(theme.accent, 2.5, k + 1.2, 10.5, 1.4);
      }
    }
    if (horizontal) L.rect(C.WOOD_D, 0, 7.3, 16, 1.4);
    else L.rect(C.WOOD_D, 7.3, 0, 1.4, 16);
    return;
  }
  if (base === T.WAGON) {
    groundShadow(L, 14, 12);
    L.rect(C.WOOD_D, 1, 3, 14, 10);
    L.rect(C.PLANK, 2, 4, 12, 8);
    for (const [wx, wy] of [[0.5, 1.3], [11.4, 1.3], [0.5, 12.5], [11.4, 12.5]]) {
      L.rect(C.IRON, wx, wy, 4.2, 2);
      L.rect(C.IRON_L, wx + 0.4, wy, 3.4, px);
    }
    if (theme.object === 'canvas' || theme.object === 'trader') {
      L.ell(theme.object === 'trader' ? C.BLUE_D : C.PLASTER, 8, 7.8, 5.6, 4);
      for (const sx of [5, 8, 11]) L.line(theme.object === 'trader' ? C.GOLD : C.WOOD_L, sx, 4.2, sx, 11.3, 0.8);
    } else if (theme.object === 'wreck') {
      L.rect(C.DARK, 3, 4.4, 10, 7.1);
      L.line(C.PLANK_L, 3, 4.4, 12.5, 11.2, 1.8);
      L.line(C.WOOD, 12.4, 4.6, 3, 11, 1.8);
    } else {
      for (let row = 0; row < 3; row++) L.rect(tone(C.PLANK_L, row * 0.05), 2.2, 4.3 + row * 2.5, 11.6, 2.1);
      L.rect(theme.accent, 4, 6, 4, 2);
      L.rect(C.WOOD_D, 9, 7, 3, 3);
    }
    return;
  }
  if (base === T.CRATE) {
    groundShadow(L, 13, 12);
    L.rect(C.WOOD_D, 1.3, 2, 13.4, 12);
    L.rect(C.PLANK_L, 2.2, 2.8, 11.6, 10.4);
    for (let row = 0; row < 3; row++) L.rect(tint(C.WOOD_D, 0.45), 2.2, 3 + row * 3.1, 11.6, px);
    if (theme.object === 'cache') {
      L.rect(theme.shade, 3, 3.8, 10, 8);
      L.rect(C.IRON_L, 4.3, 4, 1, 7.6);
      L.rect(C.IRON_L, 10.8, 4, 1, 7.6);
      L.rect(C.GOLD, 7, 7, 2, 1.5);
    } else {
      L.line(C.WOOD, 2.5, 3.3, 13.5, 12.6, 1.1);
      L.line(C.WOOD, 13.5, 3.3, 2.5, 12.6, 1.1);
      L.rect(C.PLASTER_L, 5, 5.7, 6, 4);
      L.line(theme.accent, 6, 7, 10, 7, px * 2);
    }
    return;
  }
  if (base === T.BARREL) {
    groundShadow(L, 13, 13);
    L.ell(C.IRON, 8, 8, 6.7, 6.7);
    L.ell(C.WOOD_D, 8, 8, 5.9, 5.9);
    L.ell(C.PLANK, 8, 8, 5.1, 5.1);
    for (let col = 4; col <= 12; col += 2) L.line(tint(C.WOOD_D, 0.7), col, 4, col, 12, px);
    L.ell(theme.accent, 9.5, 6.4, 0.8, 0.8);
    if (theme.object === 'hideout' || theme.object === 'camp') {
      L.rect(C.PLASTER_L, 4.5, 6, 7, 4);
      L.line(C.RED_D, 5, 8.8, 10, 6.9, px);
    }
    return;
  }
  if (base === T.ROCK) {
    groundShadow(L, 14, 12);
    L.poly(C.IRON, [[1, 9], [3, 3], [7, 1], [13, 3], [15, 9], [11, 14], [4, 14]]);
    L.poly(C.STONE, [[2, 8], [4, 3], [8, 2], [13, 4], [14, 9], [10, 12], [4, 13]]);
    L.poly(C.STONE_L, [[4, 5], [7, 3], [11, 4], [9, 7], [5, 8]]);
    if (theme.object === 'fort') {
      L.ell(C.PLASTER, 5, 10, 3, 2);
      L.ell(C.PLASTER_L, 10.5, 10, 3, 2);
      L.line(C.WOOD_D, 2, 5, 14, 12, 0.8);
    }
    return;
  }
  if (base === T.ADOBE) {
    L.rect(C.ADOBE_D, 0, 1, 16, 14);
    L.rect(C.ADOBE, 1, 2, 14, 11.5);
    for (let row = 0; row < 3; row++) {
      L.rect(tint(C.WOOD_D, 0.5), 1, 2 + row * 3.5, 14, px);
      for (let col = (row % 2) * 3; col < 14; col += 6) L.rect(tint(C.WOOD_D, 0.35), 1 + col, 2 + row * 3.5, px, 3);
    }
    L.poly(C.SAND_L, [[0, 0], [5, 0], [3, 2], [0, 4]]);
    L.rect(tint(C.VOID, 0.3), 0, 14, 16, 2);
    return;
  }
  if (base === T.SHAFT) {
    groundShadow(L, 13, 12);
    L.rect(C.WOOD_D, 1, 1, 14, 14);
    L.rect(C.PLANK, 2, 2, 12, 12);
    L.rect(C.DARK, 3.5, 3.5, 9, 9);
    L.rect(C.VOID, 4.3, 4.3, 7.4, 7.4);
    if (theme.object === 'old-mine') {
      L.line(C.PLANK_L, 3, 4, 13, 12, 2);
      L.line(C.WOOD, 13, 4, 3, 12, 2);
    } else {
      L.rect(C.WOOD, 1, 7, 14, 1.5);
      L.line(C.IRON_L, 4, 3, 11, 10, 1.1);
      L.line(C.WOOD_L, 10.5, 3, 5, 9, 1.2);
      if (theme.object === 'claim') L.ell(C.GOLD, 11.5, 11.5, 1.3, 1.1);
    }
    return;
  }
  if (base === T.TROUGH) {
    groundShadow(L, 14, 8);
    L.rect(C.WOOD_D, 1, 4, 14, 8);
    L.rect(C.PLANK, 1.8, 4.8, 12.4, 6.4);
    L.rect(theme.object === 'water' ? C.GLASS : C.SAND_D, 2.6, 5.6, 10.8, 4.8);
    if (theme.object === 'water') {
      L.line(C.GLASS_L, 3, 7, 8, 7, px);
      L.ell(C.IRON_L, 11, 6, 1.3, 1.3);
    } else for (let row = 0; row < 4; row++) L.line(C.GOLD, 3 + row * 2.2, 6, 4.8 + row * 2, 9.5, px);
    return;
  }
  if (base === T.HAY) {
    groundShadow(L, 13, 11);
    L.rect(C.WOOD, 1, 2.2, 14, 11.6);
    L.rect(C.GOLD, 1.8, 3, 12.4, 10);
    for (let row = 0; row < 6; row++) L.line(row % 2 ? C.SAND_L : C.PLANK_L, 2.5, 3.8 + row * 1.4, 13.2, 4.2 + row * 1.4, px);
    for (const sx of [5, 10.5]) L.line(C.WOOD_D, sx, 3, sx, 13, 1);
    if (theme.object === 'feed') {
      L.ell(C.PLASTER, 8, 8, 3, 2.5);
      L.rect(C.RED_D, 6.5, 7, 3, 1.5);
    }
    return;
  }
  if (base === T.STOVE) {
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      L.ell(C.STONE, 8 + Math.cos(angle) * 5, 8 + Math.sin(angle) * 4.5, 1.7, 1.4);
    }
    L.ell(C.DARK, 8, 8, 4.5, 3.7);
    L.line(C.WOOD_L, 4, 5.5, 12, 10.5, 1.8);
    L.line(C.WOOD, 4.5, 10.5, 11, 5, 1.8);
    L.poly(C.RED, [[5, 9], [6, 5], [7, 6.5], [9, 3], [11, 9], [9, 11]]);
    L.poly(C.GOLD, [[6.4, 9], [8.1, 5.8], [9.8, 9.1], [8, 10.6]]);
    return;
  }
  if (base === T.POST) {
    groundShadow(L, 8, 10);
    L.rect(C.WOOD_D, 4.2, 2, 7.6, 12);
    if (theme.object === 'telegraph') {
      L.rect(C.WOOD_L, 6, 2, 4, 12);
      L.rect(C.WOOD, 1, 4, 14, 2.5);
      for (const cx of [2, 5, 9, 12]) L.ell(C.GLASS_L, cx, 4.2, 0.7, 0.7);
      L.line(C.IRON, 0, 3, 16, 3, px);
    } else {
      L.rect(C.STONE_L, 5, 2.8, 6, 9.8);
      L.rect(C.PLASTER, 5.4, 3.2, 5.2, 8.6);
      L.rect(C.IRON, 7.4, 4.2, 1.2, 5.8);
      L.rect(C.IRON, 6, 5.7, 4, 1.2);
    }
  }
}

const BUILDING_FURNITURE = new Set([T.TABLE, T.CHAIR, T.BED, T.WARDROBE, T.COUNTER, T.STOVE, T.SHELF, T.BARREL, T.CRATE, T.SOFA, T.DESK]);
const LANDMARK_OBJECTS = new Set([T.WAGON, T.CRATE, T.BARREL, T.ROCK, T.SHAFT, T.TROUGH, T.HAY, T.STOVE, T.FENCE, T.POST, T.ADOBE]);

export function paintThemeCell(ctx, map, floor, x, y, tile) {
  const theme = themeAt(map, floor, x, y);
  if (!theme) return false;
  const base = TILE_ART_BASE[tile] ?? tile;
  const L = cell(ctx, x, y);
  if (theme.kind === 'building') {
    if (tile === T.FLOOR || tile === T.RUG || tile === T.PORCH) buildingFloor(L, theme, x, y, tile, map, floor);
    else if (tile === T.ADOBE || tile === T.FRAME || tile === T.PARTITION) buildingWall(L, theme, x, y, tile, map, floor);
    else if (BUILDING_FURNITURE.has(base)) {
      buildingFloor(L, theme, x, y, T.FLOOR, map, floor);
      furniture(L, theme, tile, x, y);
    } else return false;
  } else {
    if ([T.SAND, T.SCRUB, T.GRASS].includes(tile)) landmarkGround(L, theme, x, y, ctx, map, floor);
    else if (LANDMARK_OBJECTS.has(base)) {
      landmarkGround(L, theme, x, y, ctx, map, floor);
      if (!landmarkAccent(L, tile)) landmarkObject(L, theme, tile, map, floor, x, y);
    } else return false;
  }
  return true;
}

export function paintThemeWindowWall(ctx, map, floor, x, y, wall) {
  const theme = themeAt(map, floor, x, y);
  if (!theme || theme.kind !== 'building') return false;
  buildingWall(cell(ctx, x, y), theme, x, y, wall, map, floor);
  return true;
}
