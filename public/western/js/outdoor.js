// Note: seeded open-air encounter sites for the Cochise County landscape, with hostiles, an occasional civilian and cover; same site shape as a house.

import { rng, seedFromString } from './rand.js';
import { MAP_W, MAP_H, SAFE_DIST, CIVILIAN_CHANCE } from './config.js';
import { T, DS, WS, TILE_PROPS, cellSolid } from './tiles.js';
import { makeMap, newFloor, setTile, tileAt, inMap } from './map.js';
import { reachableMask, cellKey } from './nav.js';
import { hostileRange, hostileCount, makeHostile, rollCivilian } from './house.js';
import { placeSetPiece, SET_PIECES } from './setpieces.js';
import { regionalLook, terrainWeights, regionalNeed } from './regional-look.js';
import { generateRing } from './outdoor-ring.js';

const ATTEMPTS = 400;
// Note: a hostile starts at least this many metres from every party slot, beyond the longest unaided sight (14 m, 15.4 m for a veteran), so the first sight of them is earned.
export const MIN_START_GAP = 16;
export const MIN_COVER = 6;

export const TERRAINS = ['desert-scrub', 'wash', 'rocky-hills', 'grassland', 'mining-camp', 'ranch', 'riverbank', 'stage-road'];

// Note: what each terrain must hold at minimum; the validator rejects a site that lacks it.
export const TERRAIN_NEED = {
  'desert-scrub': { [T.MESQUITE]: 5, [T.CACTUS]: 6, [T.SCRUB]: 80 },
  wash: { [T.WASH]: 60, [T.BANK]: 10 },
  'rocky-hills': { [T.ROCK]: 14 },
  grassland: { [T.GRASS]: 350 },
  'mining-camp': { [T.TAILINGS]: 6, [T.SHAFT]: 1, [T.WAGON]: 1, [T.DOOR]: 1 },
  ranch: { [T.FENCE]: 12, [T.TROUGH]: 1, [T.HAY]: 1, [T.DOOR]: 1, [T.ADOBE]: 12 },
  riverbank: { [T.WATER]: 20, [T.WASH]: 6, [T.MESQUITE]: 5 },
  'stage-road': { [T.ROAD]: 60, [T.WAGON]: 2 },
};

export const GROUND = new Set([T.SAND, T.SCRUB, T.GRASS, T.ROAD]);
const WINDOW_STATES = [[WS.CLOSED, 0.5], [WS.OPEN, 0.25], [WS.BROKEN, 0.25]];
const RANCH_WINDOWS = [[WS.CLOSED, 0.5], [WS.BOLTED, 0.2], [WS.OPEN, 0.2], [WS.BROKEN, 0.1]];
const DOOR_STATES = [[DS.CLOSED, 0.6], [DS.OPEN, 0.4]];
// Note: an outdoor site is the camp ground of the standard grid with this many rows of approach added to the south, so the party starts 40 m or more from the camp.
export const APPROACH_ROWS = 24;
// Note: six columns wider than the standard grid, so the zoomed-out outdoor view (about 45 m) is filled.
export const OUT_W = MAP_W + 6;
export const OUT_H = MAP_H + APPROACH_ROWS;
// Note: party slots sit on the south edge, three and two rows from it.
const SLOT_Y = OUT_H - 3;
// Note: the approach rows, between the camp ground and the party's start rows.
const APPROACH_Y0 = 24;
const APPROACH_Y1 = OUT_H - 7;
// Note: per terrain, the ground scatter of the approach, the cover a covered route is made of and what is strewn between; every cover tile here stops a round.
export const APPROACH = {
  'desert-scrub': { ground: [[T.SCRUB, 0.28]], cover: [T.MESQUITE, T.MESQUITE, T.ROCK], strew: [T.CACTUS, T.MESQUITE] },
  wash: { ground: [[T.SCRUB, 0.12], [T.WASH, 0.08]], cover: [T.BANK, T.MESQUITE, T.ROCK], strew: [T.MESQUITE, T.CACTUS] },
  'rocky-hills': { ground: [[T.SCRUB, 0.1]], cover: [T.ROCK], strew: [T.ROCK, T.CACTUS] },
  grassland: { ground: [[T.GRASS, 0.55]], cover: [T.MESQUITE, T.HAY], strew: [T.MESQUITE] },
  'mining-camp': { ground: [[T.SCRUB, 0.08]], cover: [T.TAILINGS, T.ROCK, T.CRATE], strew: [T.BARREL, T.ROCK] },
  ranch: { ground: [[T.GRASS, 0.4]], cover: [T.HAY, T.MESQUITE, T.TROUGH], strew: [T.FENCE, T.HAY] },
  riverbank: { ground: [[T.GRASS, 0.45]], cover: [T.MESQUITE, T.MESQUITE, T.ROCK], strew: [T.MESQUITE] },
  'stage-road': { ground: [[T.SCRUB, 0.2]], cover: [T.ROCK, T.MESQUITE], strew: [T.CACTUS, T.ROCK], track: true },
};

// Note: with no region, or the Cochise look, the draw is uniform; any other region weights the eight terrains by its look.
export function terrainFor(seed, region) {
  const weights = region == null ? null : terrainWeights(regionalLook(region));
  if (!weights) return TERRAINS[seedFromString(`${seed}:terrain`) % TERRAINS.length];
  const total = weights.reduce((a, b) => a + b, 0);
  let u = (seedFromString(`${seed}:terrain:${regionalLook(region).id}`) / 4294967296) * total;
  for (let i = 0; i < TERRAINS.length; i++) {
    u -= weights[i];
    if (u < 0) return TERRAINS[i];
  }
  return TERRAINS[TERRAINS.length - 1];
}

// Note: the minimum features of a terrain in a region; the Cochise look returns TERRAIN_NEED itself.
export const needFor = (terrain, region) => regionalNeed(terrain, regionalLook(region), TERRAIN_NEED[terrain] || {});

// Note: opts is { terrain, region, count, experience, civilianChance }; region is a REGIONS id of regional-look.js and is optional, and the last three are the shared difficulty of house.js.
export function generateOutdoor(seed, opts = {}) {
  const terrain = opts.terrain || terrainFor(seed, opts.region);
  if (!TERRAINS.includes(terrain)) throw new Error(`Unknown terrain ${terrain}`);
  // Note: items 484-488: a campaign site is laid out with four sides of approach round its ground (outdoor-ring.js).
  if (opts.layout === 'ring') return generateRing(seed, terrain, opts);
  const base = seedFromString(`${seed}:${terrain}`);
  const range = hostileRange(opts);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const site = buildOutdoor(seed, terrain, (base + Math.imul(attempt, 0x9e3779b9)) >>> 0, opts);
    if (site.setPiece && validateOutdoor(site, range).ok) return site;
  }
  throw new Error(`No valid ${terrain} site for seed ${seed}`);
}

export function buildOutdoor(seed, terrain, s, diff) {
  const r = rng(s);
  const civ = rng(seedFromString(`${seed}:civilian`));
  const map = makeMap([newFloor(T.SAND, OUT_W, OUT_H), newFloor(T.DROP, OUT_W, OUT_H)]);
  map.terrain = terrain;
  // Note: K scales the plant and rock counts of the recipes; the Cochise look is all ones, so it scales nothing.
  const look = regionalLook(diff && diff.region);
  const K = look.density;
  const scaled = (n, m) => (m === 1 ? n : Math.max(0, Math.round(n * m)));
  const doors = [];
  const windows = [];
  const zone = { x0: 6, y0: 3, x1: 33, y1: 13 };
  const sx = 20 + r.int(-2, 2);

  const at = (x, y) => tileAt(map, 0, x, y);
  const put = (x, y, tile, state = 0) => {
    if (x >= 1 && y >= 1 && x < OUT_W - 1 && y < OUT_H - 1) setTile(map, 0, x, y, tile, state);
  };
  const ground = (x, y) => GROUND.has(at(x, y));
  // Note: cells that later scatter must leave alone, such as the lane in front of a door.
  const reserved = new Set();
  const reserve = (x, y) => reserved.add(y * OUT_W + x);
  // Note: objects stay out of the party's start rows; rows 25 and below are cleared at the end anyway.
  const objectY = (y) => y >= 2 && y <= 23;
  const putOn = (x, y, tile) => {
    if (objectY(y) && x >= 1 && x < OUT_W - 1 && ground(x, y) && !reserved.has(y * OUT_W + x)) {
      put(x, y, tile);
      return true;
    }
    return false;
  };
  const randCell = (x0, x1, y0, y1) => [r.int(x0, x1), r.int(y0, y1)];

  const scrub = (p, tile = T.SCRUB) => {
    for (let y = 1; y < 25; y++) for (let x = 1; x < OUT_W - 1; x++) if (at(x, y) === T.SAND && r.chance(p * K.scrub)) put(x, y, tile);
  };
  const thickets = (count, x0 = 2, x1 = 37, y0 = 2, y1 = 23) => {
    const n = scaled(count, K.tree);
    for (let i = 0; i < n; i++) {
      const [cx, cy] = randCell(x0, x1, y0, y1);
      const size = r.int(1, 3);
      putOn(cx, cy, T.MESQUITE);
      if (size > 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) if (r.chance((size === 3 ? 0.55 : 0.3) * K.cluster)) putOn(cx + dx, cy + dy, T.MESQUITE);
    }
  };
  const cactus = (count) => {
    const n = scaled(count, K.spiny);
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const [cx, cy] = randCell(2, 37, 2, 23);
      if (putOn(cx, cy, T.CACTUS)) i++;
    }
  };
  // Note: a boulder cluster grows by a random walk from a seed cell.
  const rocks = (count, lo, hi, y0 = 3, y1 = 22) => {
    const n = scaled(count, K.rock);
    for (let i = 0; i < n; i++) {
      let [cx, cy] = randCell(2, 37, y0, y1);
      for (let k = r.int(lo, hi); k > 0; k--) {
        putOn(cx, cy, T.ROCK);
        const [dx, dy] = r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        cx += dx;
        cy += dy;
      }
    }
  };
  const blob = (tile, cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) putOn(x, y, tile);
    }
  };
  // Note: a loose scatter of barrels, crates and similar clutter.
  const clutter = (n, tiles, x0 = 3, x1 = 36, y0 = 3, y1 = 20) => {
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const [cx, cy] = randCell(x0, x1, y0, y1);
      if (putOn(cx, cy, r.pick(tiles))) i++;
    }
  };
  const fenceLine = (x0, y0, x1, y1, gapFrom, gapLen) => {
    const horizontal = y0 === y1;
    const n = horizontal ? x1 - x0 : y1 - y0;
    for (let i = 0; i <= n; i++) {
      if (i >= gapFrom && i < gapFrom + gapLen) continue;
      const x = horizontal ? x0 + i : x0;
      const y = horizontal ? y0 : y0 + i;
      if (objectY(y) && x >= 1 && x < OUT_W - 1 && at(x, y) !== T.DROP && !reserved.has(y * OUT_W + x)) put(x, y, T.FENCE);
    }
  };

  // Note: a one-room hut or shack; walls, boards inside, one door on the chosen side and a few windows, with the lane in front of the door kept free.
  const hut = (x0, y0, w, h, o) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1 ? o.ext : T.FLOOR);
    const side = o.side || 's';
    const dx = side === 'w' ? x0 : side === 'e' ? x0 + w - 1 : x0 + r.int(1, w - 2);
    const dy = side === 'n' ? y0 : side === 's' ? y0 + h - 1 : y0 + r.int(1, h - 2);
    const out = { x: dx + (side === 'e' ? 1 : side === 'w' ? -1 : 0), y: dy + (side === 's' ? 1 : side === 'n' ? -1 : 0) };
    const inn = { x: dx - (side === 'e' ? 1 : side === 'w' ? -1 : 0), y: dy - (side === 's' ? 1 : side === 'n' ? -1 : 0) };
    put(dx, dy, T.DOOR, r.weighted(DOOR_STATES));
    doors.push({ floor: 0, x: dx, y: dy, interior: false });
    put(out.x, out.y, T.SAND);
    reserve(out.x, out.y);
    reserve(out.x + (out.x - dx), out.y + (out.y - dy));
    for (let i = 0, n = r.int(1, 2); i < n; i++) {
      const cells = [];
      for (let x = x0 + 1; x < x0 + w - 1; x++) cells.push([x, y0], [x, y0 + h - 1]);
      for (let y = y0 + 1; y < y0 + h - 1; y++) cells.push([x0, y], [x0 + w - 1, y]);
      const free = cells.filter(([x, y]) => at(x, y) === o.ext && Math.abs(x - dx) + Math.abs(y - dy) > 1);
      if (!free.length) break;
      const [wx, wy] = r.pick(free);
      put(wx, wy, T.WINDOW, r.weighted(o.windowStates || WINDOW_STATES));
      windows.push({ floor: 0, x: wx, y: wy });
    }
    const lane = new Set([`${inn.x},${inn.y}`, `${inn.x + (inn.x - dx)},${inn.y + (inn.y - dy)}`]);
    for (const tile of o.furniture || []) {
      const cells = [];
      for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) if (at(x, y) === T.FLOOR && !lane.has(`${x},${y}`)) cells.push([x, y]);
      if (!cells.length) break;
      const [fx, fy] = r.pick(cells);
      put(fx, fy, tile);
    }
    return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1, door: { x: dx, y: dy }, inside: inn, outside: out };
  };

  // Note: trees crowd a creek or a river even where the country is open, so the riparian multiplier never drops below one.
  const riparian = Math.max(1, K.tree);
  // Note: a wavy east-west band; fn gets the column and its centre row.
  const band = (y0, amp, phase, fn) => {
    for (let x = 0; x < OUT_W; x++) fn(x, y0 + Math.round(Math.sin(x / 6 + phase) * amp));
  };

  // Note: a coarse random grid read with bilinear blending, so patches have soft edges; the nodes are drawn first, one per call of draw.
  const softField = (draw) => {
    const nodes = Array.from({ length: 9 * 7 }, draw);
    const node = (i, j) => nodes[Math.min(6, j) * 9 + Math.min(8, i)];
    return (x, y) => {
      const fx = x / 5;
      const fy = y / 5;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const u = fx - i;
      const v = fy - j;
      return node(i, j) * (1 - u) * (1 - v) + node(i + 1, j) * u * (1 - v) + node(i, j + 1) * (1 - u) * v + node(i + 1, j + 1) * u * v;
    };
  };

  const RECIPES = {
    // Note: open creosote flat with mesquite thickets, prickly pear and a few boulders.
    'desert-scrub'() {
      scrub(0.16);
      thickets(r.int(7, 11));
      cactus(r.int(8, 14));
      rocks(r.int(3, 6), 1, 2);
    },
    // Note: a dry arroyo with cut banks, crossed only at gaps, and mesquite on its terraces; hostiles hold the far side.
    wash() {
      const y0 = r.int(14, 17);
      const w = r.int(3, 4);
      const gaps = [r.int(3, 10), r.int(14, 23), r.int(27, 35)];
      const phase = r.range(0, 6.28);
      const amp = r.range(1, 2.2);
      band(y0, amp, phase, (x, c) => {
        for (let d = 0; d < w; d++) put(x, c - 1 + d, T.WASH);
        if (gaps.some((g) => x >= g && x < g + 3)) return;
        if (r.chance(0.88)) put(x, c - 2, T.BANK);
        if (r.chance(0.88)) put(x, c - 1 + w, T.BANK);
      });
      band(y0, amp, phase, (x, c) => {
        for (const dy of [-4, -3, w + 1, w + 2]) if (r.chance(0.13 * riparian)) putOn(x, c + dy, T.MESQUITE);
      });
      // Note: a creek country keeps pools in the bed; a cell of water now and then, never across a whole column.
      if (look.pools) band(y0, amp, phase, (x, c) => { if (!gaps.some((g) => x >= g - 1 && x <= g + 3) && r.chance(look.pools)) put(x, c, T.WATER); });
      scrub(0.11);
      cactus(r.int(5, 9));
      rocks(r.int(2, 4), 1, 3, 3, 12);
      zone.x0 = 5;
      zone.x1 = 34;
      zone.y1 = Math.min(16, y0 + 1);
    },
    // Note: broken foothill country, many outcrops and few clear lanes.
    'rocky-hills'() {
      scrub(0.12);
      // Note: ledges are broken lines of outcrop with gaps to pass through; clusters fill in between.
      for (let i = 0, n = r.int(2, 4); i < n; i++) {
        const ly = r.int(5, 21);
        const lx = r.int(2, 28);
        const len = r.int(7, 12);
        const gap = r.int(2, len - 3);
        for (let k = 0; k < len; k++) if (k !== gap && k !== gap + 1) putOn(lx + k, ly + Math.round(Math.sin(k / 2.5 + i) * 0.8), T.ROCK);
      }
      rocks(r.int(10, 15), 3, 6, 3, 22);
      thickets(r.int(3, 5));
      cactus(r.int(4, 8));
    },
    // Note: bunchgrass range, long sightlines and little cover; a fence line and a stock tank break it up.
    grassland() {
      const density = softField(() => r.range(0.1, 1.1) * K.grass);
      for (let y = 1; y < 25; y++) {
        for (let x = 1; x < OUT_W - 1; x++) if (r.chance(density(x, y))) put(x, y, T.GRASS);
      }
      const fx = r.int(10, 30);
      fenceLine(fx, 2, fx, r.int(14, 20), r.int(3, 9), r.int(2, 3));
      thickets(r.int(3, 5));
      rocks(r.int(2, 4), 1, 2);
      cactus(r.int(3, 6));
      clutter(1, [T.TROUGH], 4, 35, 4, 16);
      zone.y1 = 12;
    },
    // Note: a Tombstone or Bisbee style mine camp; dumps, a shaft collar, a plank shack, an ore wagon and timber.
    'mining-camp'() {
      const shack = hut(r.int(9, 24), r.int(3, 7), r.int(5, 6), r.int(4, 5), { ext: T.FRAME, side: 's', furniture: [T.TABLE, T.CRATE, T.BARREL, T.BED].slice(0, r.int(2, 4)) });
      for (let i = 0, n = r.int(3, 5); i < n; i++) blob(T.TAILINGS, r.int(4, 35), r.int(3, 20), r.range(1, 1.9), r.range(1, 1.5));
      for (let i = 0, n = r.int(1, 2); i < n; i++) {
        const [cx, cy] = randCell(4, 35, 4, 20);
        if (putOn(cx, cy, T.SHAFT)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) if (r.chance(0.5)) putOn(cx + dx, cy + dy, r.pick([T.CRATE, T.BARREL]));
      }
      clutter(r.int(1, 2), [T.WAGON], 4, 35, 4, 18);
      clutter(r.int(6, 10), [T.BARREL, T.CRATE], 4, 35, 3, 20);
      const fy = r.int(15, 19);
      const fx = r.int(4, 24);
      fenceLine(fx, fy, fx + r.int(5, 9), fy, r.int(1, 4), 2);
      scrub(0.05);
      rocks(r.int(3, 5), 1, 2);
      cactus(r.int(2, 4));
      zone.x0 = Math.max(4, shack.x0 - 8);
      zone.x1 = Math.min(35, shack.x1 + 8);
      zone.y1 = 15;
    },
    // Note: an adobe ranch house with a pole corral, water trough, hay and a freight wagon.
    ranch() {
      const left = r.chance(0.5);
      const hx = left ? r.int(20, 26) : r.int(6, 12);
      // Note: a regional ranch house is a massive wall (adobe, sod, stone or log) or a plank frame by the look's share, drawn from its own stream.
      const wall = look.base || rng(seedFromString(`${seed}:ranch-wall`)).chance(Math.min(1, look.building.share + 0.35)) ? T.ADOBE : T.FRAME;
      const house = hut(hx, r.int(3, 6), 6, 5, { ext: wall, side: 's', windowStates: RANCH_WINDOWS, furniture: [T.TABLE, T.CHAIR, T.BED, T.SHELF] });
      const cw = 9;
      const ch = 6;
      const cx0 = left ? house.x0 - 2 - cw : house.x1 + 3;
      const cy0 = r.int(4, 8);
      const gap = r.int(1, ch - 2);
      for (let i = 0; i < cw; i++) {
        put(cx0 + i, cy0, T.FENCE);
        put(cx0 + i, cy0 + ch - 1, T.FENCE);
      }
      for (let j = 0; j < ch; j++) {
        if (j !== gap) put(left ? cx0 : cx0 + cw - 1, cy0 + j, T.FENCE);
        put(left ? cx0 + cw - 1 : cx0, cy0 + j, T.FENCE);
      }
      // Note: the gate faces away from the house.
      put(left ? cx0 : cx0 + cw - 1, cy0 + gap, T.SAND);
      put(cx0 + 2 + r.int(0, 4), cy0 + 1, T.TROUGH);
      for (let i = 0, n = r.int(1, 3); i < n; i++) put(cx0 + 2 + r.int(0, 5), cy0 + ch - 2, T.HAY);
      clutter(1, [T.WAGON], 4, 35, 4, 14);
      clutter(r.int(2, 3), [T.BARREL], 4, 35, 4, 16);
      thickets(r.int(3, 5));
      cactus(r.int(2, 3));
      scrub(0.08);
      zone.x0 = 4;
      zone.x1 = 36;
      zone.y1 = 15;
    },
    // Note: a San Pedro style river with cottonwood and grass terraces; it is crossed only at its fords.
    riverbank() {
      const y0 = look.lake ? r.int(11, 14) : r.int(14, 17);
      const w = look.lake ? r.int(4, 5) : r.int(2, 3);
      const fords = [r.int(3, 10), r.int(15, 22), r.int(27, 35)];
      const phase = r.range(0, 6.28);
      const amp = r.range(0.8, 2) * (look.lake ? 1.2 : 1);
      band(y0, amp, phase, (x, c) => {
        for (let d = 0; d < w; d++) put(x, c + d, fords.some((g) => x >= g && x < g + 3) ? T.WASH : T.WATER);
      });
      band(y0, amp, phase, (x, c) => {
        for (let d = 1; d <= 6; d++) if (r.chance(0.5 - d * 0.05)) putOn(x, c - d, T.GRASS);
        for (let d = 1; d <= 3; d++) if (r.chance(0.4 - d * 0.08)) putOn(x, c + w - 1 + d, T.GRASS);
        if (!fords.some((g) => x >= g - 1 && x <= g + 3)) for (const dy of [-3, -2, w + 1, w + 2]) if (r.chance(0.22 * riparian)) putOn(x, c + dy, T.MESQUITE);
      });
      thickets(r.int(2, 4), 2, 37, 3, 11);
      rocks(r.int(1, 3), 1, 2, 3, 12);
      cactus(r.int(3, 5));
      zone.x0 = 5;
      zone.x1 = 34;
      zone.y1 = Math.min(15, y0 - 1);
    },
    // Note: a wagon road with a halted coach and its spilled freight, bluffs and thickets on the north side for the road agents.
    'stage-road'() {
      const y0 = r.int(11, 15);
      const phase = r.range(0, 6.28);
      band(y0, r.range(0.5, 1.4), phase, (x, c) => {
        for (let d = -1; d <= 1; d++) put(x, c + d, T.ROAD);
      });
      const xc = r.int(14, 24);
      const yc = y0 + Math.round(Math.sin(xc / 6 + phase) * 0.8);
      put(xc, yc, T.WAGON);
      put(xc + 1, yc, T.WAGON);
      for (const [dx, dy, t] of [[3, 1, T.CRATE], [-2, 0, T.BARREL], [4, -1, T.CRATE], [-1, 1, T.BARREL]]) if (r.chance(0.8)) put(xc + dx, yc + dy, t);
      rocks(r.int(4, 6), 2, 4, 3, y0 - 3);
      thickets(r.int(4, 7), 2, 37, 3, y0 - 2);
      thickets(r.int(1, 3), 2, 37, y0 + 3, 22);
      scrub(0.08);
      cactus(r.int(5, 8));
      zone.x1 = 34;
      zone.y1 = Math.min(16, y0 + 3);
    },
  };
  RECIPES[terrain]();

  if (!look.base) {
    // Note: a green country keeps grass patches on bare ground in every terrain, from the same soft field as the grassland recipe.
    const amount = Math.max(0, Math.min(0.5, 0.35 * K.grass - 0.1));
    if (amount > 0 && terrain !== 'grassland') {
      const patch = softField(() => r.range(0, 1));
      for (let y = 1; y < 25; y++) {
        for (let x = 1; x < OUT_W - 1; x++) {
          if (at(x, y) === T.SAND && !reserved.has(y * OUT_W + x) && r.chance(patch(x, y) * amount * 2)) put(x, y, T.GRASS);
        }
      }
    }
    // Note: open country with few trees and rocks still needs cover for the hostiles, so boulders or a thicket make up the least.
    const coverIn = () => {
      let n = 0;
      for (let y = zone.y0 - 1; y <= zone.y1 + 1; y++) for (let x = zone.x0 - 1; x <= zone.x1 + 1; x++) if (isCover(tileAt(map, 0, x, y))) n++;
      return n;
    };
    for (let guard = 0; guard < 30 && coverIn() < MIN_COVER + 4; guard++) {
      const cx = r.int(zone.x0, zone.x1);
      const cy = r.int(zone.y0 + 1, zone.y1);
      const tile = K.tree >= K.rock ? T.MESQUITE : T.ROCK;
      putOn(cx, cy, tile);
      for (const [dx, dy] of [[1, 0], [0, 1]]) if (r.chance(0.6)) putOn(cx + dx, cy + dy, tile);
    }
  }

  // Note: a look that bars a piece (adobe ruins outside the Southwest) requests another one of the terrain from its own stream.
  const allowed = look.noPieces.length ? SET_PIECES.filter((piece) => piece.terrains.includes(terrain) && !look.noPieces.includes(piece.id)) : [];
  const regionPiece = allowed.length ? rng(seedFromString(`${seed}:${s}:${terrain}:region-piece`)).pick(allowed).id : undefined;
  const setPiece = placeSetPiece(map, terrain, `${seed}:${s}`, reserved, (diff && diff.setPiece) || regionPiece);

  margin(map, terrain, rng(seedFromString(`${seed}:${s}:margin`)), K);
  // Note: the ring layout takes only the camp ground and lays its own approaches and people.
  if (diff && diff.core) return { map, terrain, zone, doors, windows, setPiece, look, K, reserved };
  approach(map, terrain, sx, rng(seedFromString(`${seed}:${s}:approach`)), K);
  // Note: the party's start rows are open ground whatever the terrain put there.
  for (let y = OUT_H - 5; y < OUT_H; y++) for (let x = sx - 6; x <= sx + 6; x++) setTile(map, 0, x, y, T.SAND);
  const slots = [[sx - 1, SLOT_Y], [sx + 1, SLOT_Y], [sx - 3, SLOT_Y], [sx + 3, SLOT_Y], [sx, SLOT_Y + 1]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5, floor: 0 }));
  const spawn = { sheriff: { ...slots[0] }, deputy: { ...slots[1] }, slots };

  const site = {
    kind: 'outdoor', terrain, seed, style: terrain, setPiece, map,
    footprint: zone, hall: null, rooms: [], stairs: null, entries: [], doors, windows,
    spawn, hostiles: [], civilian: null, rumor: false,
    safe: (x, y) => {
      const dx = Math.max(zone.x0 - x, 0, x - (zone.x1 + 1));
      const dy = Math.max(zone.y0 - y, 0, y - (zone.y1 + 1));
      return Math.hypot(dx, dy) > SAFE_DIST;
    },
  };
  // Note: only a regional site carries its region, so a Cochise site carries none.
  if (!look.base) {
    site.region = look.id;
    map.region = look.id;
    map.material = look.building.massive;
  }
  const spots = candidateCells(site);
  site.hostiles = placeHostiles(r, spots, diff);
  // Note: the gang keeps camp from its own stream, so the terrain, the set piece and the civilian draw stay as they were.
  campLife(site, spots, rng(seedFromString(`${seed}:${s}:camp`)));
  const { present, kind, rumor } = rollCivilian(civ, diff && diff.civilianChance != null ? diff.civilianChance : CIVILIAN_CHANCE);
  site.rumor = rumor;
  if (present) {
    const free = spots.filter((c) => site.hostiles.every((h) => Math.abs(Math.floor(h.x) - c.x) + Math.abs(Math.floor(h.y) - c.y) >= 3));
    const c = r.pick(free.length ? free : spots);
    site.civilian = { x: c.x + 0.5, y: c.y + 0.5, floor: 0, kind };
  }
  return site;
}

// Note: a cell a person can stand on that is not a door or window, in tile terms.
export const standable = (map, x, y) => {
  const t = tileAt(map, 0, x, y);
  return t !== T.DOOR && t !== T.WINDOW && !cellSolid(t, 0) && t !== T.STAIRS && t !== T.RUN;
};

// Note: true for a tile that stops a round and is tall enough to hide behind; fences, cactus and open holes do not count.
export function isCover(t) {
  const p = TILE_PROPS[t];
  return !!p && p.solid && !!p.mat && p.h >= 0.5 && t !== T.FENCE && t !== T.CACTUS && t !== T.RAIL;
}

// Note: free cells inside the hostile zone, flagged when a cover tile touches them.
export function candidateCells(site) {
  const { map, footprint: z, spawn } = site;
  const out = [];
  const gap2 = MIN_START_GAP * MIN_START_GAP;
  for (let y = z.y0; y <= z.y1; y++) {
    for (let x = z.x0; x <= z.x1; x++) {
      if (!standable(map, x, y) || tileAt(map, 0, x, y) === T.DROP) continue;
      if (spawn.slots.some((p) => (p.x - (x + 0.5)) ** 2 + (p.y - (y + 0.5)) ** 2 < gap2)) continue;
      let cover = false;
      for (let dy = -1; dy <= 1 && !cover; dy++) for (let dx = -1; dx <= 1; dx++) if (isCover(tileAt(map, 0, x + dx, y + dy))) cover = true;
      out.push({ x, y, floor: 0, cover });
    }
  }
  return out;
}

// Note: the camp ground's recipes lay out the standard 40 columns; the columns beyond get the terrain's ground and a few of its cover and strewn things.
function margin(map, terrain, r, K) {
  const look = APPROACH[terrain];
  if (!look) return;
  const x0 = MAP_W - 2;
  const free = (x, y) => GROUND.has(tileAt(map, 0, x, y)) || tileAt(map, 0, x, y) === T.SAND;
  for (let y = 1; y < APPROACH_Y0; y++) {
    for (let x = x0; x < map.W - 1; x++) {
      if (tileAt(map, 0, x, y) !== T.SAND) continue;
      // Note: half the approach's density, nearer what the recipes strew, so the seam does not show.
      for (const [tile, p] of look.ground) if (r.chance(0.5 * p * (tile === T.GRASS ? K.grass : K.scrub))) { setTile(map, 0, x, y, tile); break; }
    }
  }
  for (let i = 0, n = r.int(3, 5); i < n; i++) {
    const x = r.int(x0, map.W - 3);
    const y = r.int(2, APPROACH_Y0 - 2);
    const tile = r.pick(r.chance(0.5) ? look.cover : look.strew);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]].slice(0, r.int(1, 3))) if (free(x + dx, y + dy)) setTile(map, 0, x + dx, y + dy, tile);
  }
}

// Note: the approach rows south of the camp: the terrain's ground, a covered route on one side made of cover clusters every few metres with a free path beside them, an open route on the other side, and a few things strewn between; the party's start columns stay clear.
function approach(map, terrain, sx, r, K) {
  const look = APPROACH[terrain];
  if (!look) return;
  const ground = (x, y) => GROUND.has(tileAt(map, 0, x, y));
  const put = (x, y, tile) => {
    if (x < 1 || x >= map.W - 1 || y < APPROACH_Y0 || y > APPROACH_Y1 || !ground(x, y)) return false;
    setTile(map, 0, x, y, tile);
    return true;
  };
  for (let y = APPROACH_Y0; y <= APPROACH_Y1; y++) {
    for (let x = 1; x < map.W - 1; x++) {
      if (tileAt(map, 0, x, y) !== T.SAND) continue;
      for (const [tile, p] of look.ground) if (r.chance(p * (tile === T.GRASS ? K.grass : K.scrub))) { setTile(map, 0, x, y, tile); break; }
    }
  }
  const west = r.chance(0.5);
  // Note: the covered route runs down one third of the map, the open route down the other, and neither through the party's own columns.
  const coverX = west ? r.int(6, 10) : r.int(map.W - 11, map.W - 7);
  const openX = west ? r.int(map.W - 10, map.W - 6) : r.int(5, 9);
  let x = coverX;
  let side = r.chance(0.5) ? 1 : -1;
  for (let y = APPROACH_Y1; y >= APPROACH_Y0; y -= r.int(3, 4)) {
    x = Math.max(4, Math.min(map.W - 5, x + r.int(-1, 1)));
    // Note: a cluster of two to four cells beside the route, on alternating sides, so the route itself stays walkable.
    const tile = r.pick(look.cover);
    const cx = x + side * 2;
    const cells = [[cx, y], [cx, y - 1], [cx + side, y], [cx, y + 1]].slice(0, r.int(2, 4));
    for (const [px, py] of cells) put(px, py, tile);
    side = -side;
  }
  // Note: a coach road runs on south along the open route, so the stage road's approach is a track in the open.
  if (look.track) for (let y = APPROACH_Y0; y < map.H - 1; y++) for (let dx = 0; dx < 2; dx++) if (ground(openX + dx, y)) setTile(map, 0, openX + dx, y, T.ROAD);
  // Note: the open route has at most a lone low thing; the middle a few clusters and the terrain's strewn things.
  const strewn = Math.round(r.int(6, 10) * Math.max(0.5, K.tree));
  for (let i = 0, tries = 0; i < strewn && tries < strewn * 8; tries++) {
    const px = r.int(2, map.W - 3);
    const py = r.int(APPROACH_Y0, APPROACH_Y1);
    if (Math.abs(px - openX) <= 3 || Math.abs(px - sx) <= 4 && py > APPROACH_Y1 - 4) continue;
    if (put(px, py, r.pick(look.strew))) i++;
  }
  for (let i = 0, n = r.int(2, 3); i < n; i++) {
    const cx = r.int(14, map.W - 15);
    const cy = r.int(APPROACH_Y0 + 2, APPROACH_Y1 - 4);
    const tile = r.pick(look.cover);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]].slice(0, r.int(1, 3))) put(cx + dx, cy + dy, tile);
  }
}

// Note: a cell with this many free cells within two metres can hold a fire with men round it.
const FIRE_ROOM = 10;

// Note: the gang's camp: a fire (the outlaw camp's own, else one laid at the far end of the hostile ground), men sitting or standing round it, one walking a round of the camp, and one or two posted in cover between the camp and the way the party comes, facing it; the camp men come first, so the first hostile, an associate's place (item 291), is at the fire.
export function campLife(site, spots, r) {
  const { map, hostiles } = site;
  const n = hostiles.length;
  if (n < 2) return;
  const slots = site.spawn.slots;
  const party = { x: slots.reduce((a, p) => a + p.x, 0) / slots.length, y: slots.reduce((a, p) => a + p.y, 0) / slots.length };
  const centre = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  // Note: free ground is read once per cell into a grid, since the fire's room test asks about every spot's neighbours.
  const freeGrid = new Uint8Array(map.W * map.H);
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) freeGrid[y * map.W + x] = standable(map, x, y) && tileAt(map, 0, x, y) !== T.DROP ? 1 : 0;
  const free = (x, y) => x >= 0 && y >= 0 && x < map.W && y < map.H && freeGrid[y * map.W + x] === 1;
  let fire = null;
  for (let y = 0; y < map.H && !fire; y++) for (let x = 0; x < map.W; x++) if (tileAt(map, 0, x, y) === T.CAMP_FIRE) { fire = { x, y }; break; }
  if (!fire) {
    const room = (c) => {
      let k = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && free(c.x + dx, c.y + dy)) k++;
      return k;
    };
    // Note: each distance is computed once, then sorted, since the comparator ran thousands of times per site.
    const far = spots.filter((c) => room(c) >= FIRE_ROOM).map((c) => ({ c, k: d(centre(c), party) })).sort((p, q) => q.k - p.k).map((e) => e.c);
    const c = far.length ? r.pick(far.slice(0, Math.max(1, Math.ceil(far.length * 0.3)))) : null;
    if (!c) return;
    setTile(map, 0, c.x, c.y, T.CAMP_FIRE);
    freeGrid[c.y * map.W + c.x] = standable(map, c.x, c.y) ? 1 : 0;
    fire = { x: c.x, y: c.y };
  }
  const fc = centre(fire);
  site.camp = { x: fc.x, y: fc.y };
  const open = spots.filter((c) => free(c.x, c.y));
  const taken = [];
  const takeFrom = (pool) => {
    const ok = pool.filter((c) => taken.every((t) => Math.abs(t.x - c.x) + Math.abs(t.y - c.y) >= 2));
    const c = ok.length ? r.pick(ok) : null;
    if (c) taken.push(c);
    return c;
  };
  const sentries = n >= 5 ? 2 : 1;
  const walkers = n >= 4 ? 1 : 0;
  const campers = n - sentries - walkers;
  const roles = [];
  // Note: men at the fire sit at one or two paces from it, facing it.
  const ring = open.filter((c) => { const k = d(centre(c), fc); return k >= 1.2 && k <= 2.6; });
  for (let i = 0; i < campers; i++) {
    const c = takeFrom(ring) || takeFrom(open);
    if (!c) return;
    const p = centre(c);
    roles.push({ x: p.x, y: p.y, role: 'camp', habit: r.chance(0.65) ? 'sit' : 'stand', facing: Math.atan2(fc.y - p.y, fc.x - p.x) });
  }
  // Note: the walker's round is three or four points six to nine metres out from the fire, in order round it.
  for (let i = 0; i < walkers; i++) {
    const band = open.filter((c) => { const k = d(centre(c), fc); return k >= 6 && k <= 9; });
    if (band.length < 3) break;
    const turn = r.range(0, Math.PI * 2);
    const route = [];
    // Note: six bearings are tried, so a camp near the map's edge still finds three points on the ground side.
    for (let k = 0; k < 6 && route.length < 4; k++) {
      const ang = turn + (k * Math.PI) / 3;
      const want = { x: fc.x + Math.cos(ang) * 7.5, y: fc.y + Math.sin(ang) * 7.5 };
      const best = band.map((c) => ({ c, k: d(centre(c), want) })).sort((p, q) => p.k - q.k)[0]?.c;
      if (best && d(centre(best), want) < 3 && !route.some((q) => q.x === best.x + 0.5 && q.y === best.y + 0.5)) route.push(centre(best));
    }
    if (route.length < 3) break;
    roles.push({ x: route[0].x, y: route[0].y, role: 'patrol', habit: 'patrol', facing: r.range(-Math.PI, Math.PI), route });
  }
  // Note: a sentry stands in cover between the fire and the party, four to twelve metres out from the fire, facing the way the party comes.
  const watch = open.filter((c) => {
    const p = centre(c);
    const k = d(p, fc);
    return c.cover && k >= 4 && k <= 12 && d(p, party) < d(fc, party);
  });
  for (let i = 0; i < sentries; i++) {
    const c = takeFrom(watch) || takeFrom(open.filter((x) => d(centre(x), party) < d(fc, party))) || takeFrom(open);
    if (!c) return;
    const p = centre(c);
    roles.push({ x: p.x, y: p.y, role: 'sentry', habit: 'stand', facing: Math.atan2(party.y - p.y, party.x - p.x) });
  }
  // Note: a walker with no round to walk sits at the fire with the others.
  while (roles.length < n) {
    const c = takeFrom(ring) || takeFrom(open);
    if (!c) return;
    const p = centre(c);
    roles.splice(campers, 0, { x: p.x, y: p.y, role: 'camp', habit: 'stand', facing: Math.atan2(fc.y - p.y, fc.x - p.x) });
  }
  // Note: the hostiles keep their arms and nerve and only take up their places.
  hostiles.forEach((h, i) => Object.assign(h, roles[i], { floor: 0 }));
}

export function placeHostiles(r, spots, diff) {
  const n = hostileCount(r, diff);
  if (!spots.length) return [];
  const picked = [];
  for (let i = 0; i < n; i++) {
    let cell = null;
    for (const spacing of [3, 2, 1]) {
      const fits = spots.filter((c) => picked.every((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= spacing));
      const covered = fits.filter((c) => c.cover);
      const pool = covered.length && r.chance(0.7) ? covered : fits;
      if (pool.length) {
        cell = r.pick(pool);
        break;
      }
    }
    if (!cell) cell = r.pick(spots);
    picked.push(cell);
  }
  return picked.map((c) => makeHostile(r, c, diff));
}

// Note: counts of every tile id on the ground floor, by tile name; the tests and the validator read terrain features from it.
export function tileCounts(map) {
  const counts = {};
  const tiles = map.floors[0].tile;
  for (let i = 0; i < tiles.length; i++) counts[tiles[i]] = (counts[tiles[i]] || 0) + 1;
  return counts;
}

// Note: the checks that depend on the party's entry: its slots stand free on safe ground, and every hostile and the civilian can be reached from them with windows shut.
// Note: shared is the mask of another entry; on open ground reachability is symmetric, so slots that all lie in it reach what it reaches, and only otherwise is a new flood run.
export function entryProblems(site, slots, shared = null) {
  const problems = [];
  const { map } = site;
  for (const p of slots) {
    if (!inMap(map, Math.floor(p.x), Math.floor(p.y)) || !standable(map, Math.floor(p.x), Math.floor(p.y))) problems.push('spawn blocked');
    if (!site.safe(p.x, p.y)) problems.push('spawn not on safe ground');
  }
  const inShared = shared && !site.rooms.length && map.floors.length === 2 && slots.every((p) => shared[cellKey(Math.floor(p.x), Math.floor(p.y), 0)] === 1);
  const seen = inShared ? shared : reachableMask(map, slots.map((p) => ({ x: p.x, y: p.y, f: 0 })), { force: false, windows: false });
  problems.seen = seen;
  const need = (x, y, what) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (seen[cellKey(cx, cy, 0)] !== 1) problems.push(`${what} unreachable at ${cx},${cy}`);
  };
  for (const h of site.hostiles) {
    need(h.x, h.y, 'hostile');
    if (!standable(map, Math.floor(h.x), Math.floor(h.y))) problems.push('hostile on a solid cell');
    if (slots.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < MIN_START_GAP)) problems.push('hostile starts too close to the party');
  }
  if (site.civilian) need(site.civilian.x, site.civilian.y, 'civilian');
  return problems;
}

export function validateOutdoor(site, range = hostileRange(null)) {
  const problems = [];
  const { map, spawn } = site;
  if (map.floors.length !== 2) problems.push('needs two floors');
  else if (!map.floors[1].tile.every((t) => t === T.DROP)) problems.push('upper floor must be all drop');
  if (site.stairs !== null || site.rooms.length || site.entries.length) problems.push('outdoor site has no stairs, rooms or entries');
  if (!spawn.slots || spawn.slots.length !== 5) problems.push('needs five spawn slots');
  const entry = entryProblems(site, spawn.slots || []);
  problems.push(...entry);
  if (site.hostiles.length < range[0] || site.hostiles.length > range[1]) problems.push('hostile count out of range');
  // Note: a door needs a free cell on each side, or the room behind it can only be entered through a window.
  for (const d of site.doors) {
    const free = (dx, dy) => standable(map, d.x + dx, d.y + dy);
    if (!((free(0, 1) && free(0, -1)) || (free(1, 0) && free(-1, 0)))) problems.push(`door blocked at ${d.x},${d.y}`);
  }
  const z = site.footprint;
  let cover = 0;
  for (let y = z.y0 - 1; y <= z.y1 + 1; y++) for (let x = z.x0 - 1; x <= z.x1 + 1; x++) if (isCover(tileAt(map, 0, x, y))) cover++;
  if (cover < MIN_COVER) problems.push('too little cover');
  const counts = tileCounts(map);
  const minimum = needFor(site.terrain, site.region);
  for (const [tile, min] of Object.entries(minimum)) {
    if (tile === 'walls') {
      if ((counts[T.ADOBE] || 0) + (counts[T.FRAME] || 0) < min) problems.push(`${site.terrain} needs ${min} wall tiles`);
    } else if ((counts[tile] || 0) < min) problems.push(`${site.terrain} needs ${min} of tile ${tile}`);
  }
  // Note: more than half the party's ground must be open, or the site is a maze.
  let open = 0;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (standable(map, x, y)) open++;
  if (open < map.W * map.H * 0.55) problems.push('too little open ground');
  return { ok: problems.length === 0, problems, seen: entry.seen };
}
