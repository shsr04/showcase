// Note: items 484-487: a campaign outdoor site; the camp ground of outdoor.js sits inside four bands of approach, shaped by the place's locale and its relief.
// Note: the layout comes only from the seed, the terrain, the region, the set piece and the locale; people come from opts.people, so a return visit keeps the ground (item 488).

import { rng, seedFromString } from './rand.js';
import { T } from './tiles.js';
import { makeMap, newFloor, setTile, tileAt, inMap } from './map.js';
import { reachableMask, cellKey } from './nav.js';
import { hostileRange, rollCivilian } from './house.js';
import { CIVILIAN_CHANCE, SAFE_DIST } from './config.js';
import {
  buildOutdoor, OUT_W, APPROACH, GROUND, standable, isCover, placeHostiles, campLife, needFor, tileCounts, validateOutdoor, MIN_START_GAP, MIN_COVER, entryProblems,
} from './outdoor.js';
import { MAX_STEP } from './terrain-height.js';

export const SIDES = ['n', 'e', 's', 'w'];
export const SIDE_NAMES = { n: 'north', e: 'east', s: 'south', w: 'west' };
export const LANDFORMS = ['flat', 'rolling', 'bajada', 'gully', 'ridge', 'foothills', 'canyon', 'mesa', 'terraces'];
// Note: the camp ground is rows 0 to 24 of the core build, OUT_W columns wide.
const CORE_ROWS = 25;
const ATTEMPTS = 80;
const PEOPLE_TRIES = 6;
// Note: the landform a terrain suggests when the place says nothing more particular.
const TERRAIN_LANDFORM = {
  'desert-scrub': 'bajada', wash: 'gully', 'rocky-hills': 'ridge', grassland: 'rolling', 'mining-camp': 'foothills', ranch: 'rolling', riverbank: 'terraces', 'stage-road': 'rolling',
};
// Note: amplitude in metres of the soft base swell per landform.
const SWELL = { flat: 0.25, rolling: 1.3, bajada: 0.8, gully: 0.7, ridge: 0.9, foothills: 1.8, canyon: 0.9, mesa: 0.6, terraces: 0.5 };
// Note: item 497: amplitude in metres of the short hummocks (one node every HUMMOCK_STEP cells), so open country has knolls and hollows that hide a man.
const HUMMOCK = { flat: 0.1, rolling: 1.1, bajada: 0.6, gully: 0.5, ridge: 0.6, foothills: 1.1, canyon: 0.4, mesa: 0.4, terraces: 0.2 };
const HUMMOCK_STEP = 5;
// Note: item 497: terraces: cells per level away from the water, metres per riser, and the highest level.
const TERRACE_RUN = 5;
const TERRACE_RISE = 1.3;
const TERRACE_TOP = 3;
// Note: item 497: the ridge's level top reaches this many cells either side of the crest, where the rimrock stands; a gully is crossed every GULLY_CROSS cells.
const RIDGE_TOP = 3;
const GULLY_CROSS = 12;
const BUILT = new Set([T.ADOBE, T.FRAME, T.FLOOR, T.DOOR, T.WINDOW, T.PORCH, T.TABLE, T.CHAIR, T.BED, T.SHELF, T.STOVE, T.WARDROBE, T.COUNTER, T.RUG]);
const LINEAR = new Set([T.WASH, T.WATER, T.ROAD, T.BANK]);

// Note: a locale with every field filled; a missing locale is read from the terrain alone.
export function normalLocale(locale, terrain) {
  const l = locale && typeof locale === 'object' ? locale : {};
  return {
    id: l.id || null,
    landform: LANDFORMS.includes(l.landform) ? l.landform : TERRAIN_LANDFORM[terrain] || 'rolling',
    water: ['creek', 'river', 'spring'].includes(l.water) ? l.water : null,
    road: !!l.road || terrain === 'stage-road',
    works: Array.isArray(l.works) ? l.works.filter((w) => ['mine', 'ranch', 'camp', 'mill'].includes(w)) : [],
    scale: Number.isFinite(l.scale) ? Math.max(0, Math.min(1, l.scale)) : 0.5,
  };
}

export function generateRing(seed, terrain, opts = {}) {
  const locale = normalLocale(opts.locale, terrain);
  const base = seedFromString(`${seed}:${terrain}:ring`);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const s = (base + Math.imul(attempt, 0x9e3779b9)) >>> 0;
    const lay = layRing(seed, terrain, s, opts, locale);
    if (!lay) continue;
    const site = peopleOn(lay, opts);
    if (site) return site;
  }
  throw new Error(`No valid ${terrain} ring site for seed ${seed}`);
}

// Note: the ground of a ring site without people, or null when it fails the layout checks.
export function layRing(seed, terrain, s, opts, locale) {
  const core = buildOutdoor(seed, terrain, s, { region: opts.region, setPiece: opts.setPiece, core: true });
  const r = rng(seedFromString(`${seed}:${s}:ring`));
  const K = core.K;
  // Note: item 487: the map's size follows the place, a canyon narrow and long, open country wide.
  const W = locale.landform === 'canyon' ? 60 : r.int(61, 64);
  const dn = r.int(14, 16 + Math.round(locale.scale * 3));
  const ds = r.int(14, 16 + Math.round(locale.scale * 3));
  const H = Math.min(64, dn + CORE_ROWS + ds);
  const ox = Math.floor((W - OUT_W) / 2);
  const oy = dn;
  const map = makeMap([newFloor(T.SAND, W, H), newFloor(T.DROP, W, H)]);
  map.terrain = terrain;
  // Note: only a regional site carries its region and wall material, as in outdoor.js.
  if (!core.look.base) {
    map.region = core.look.id;
    map.material = core.look.building.massive;
  }
  for (let y = 0; y < CORE_ROWS; y++) {
    for (let x = 0; x < OUT_W; x++) setTile(map, 0, x + ox, y + oy, tileAt(core.map, 0, x, y), core.map.floors[0].state[y * OUT_W + x]);
  }
  if (core.map.art) map.art = { ...core.map.art, x: core.map.art.x + ox, y: core.map.art.y + oy };
  const at = (x, y) => tileAt(map, 0, x, y);
  // Note: a wash, a river, a road or a bank that leaves the camp ground runs on across the east and west bands.
  for (let y = oy; y < oy + CORE_ROWS; y++) {
    const west = at(ox + 1, y);
    const east = at(ox + OUT_W - 2, y);
    for (let x = 0; x <= ox; x++) if (LINEAR.has(west)) setTile(map, 0, x, y, west);
    for (let x = ox + OUT_W - 1; x < W; x++) if (LINEAR.has(east)) setTile(map, 0, x, y, east);
  }
  const zone = { x0: core.zone.x0 + ox, y0: core.zone.y0 + oy, x1: core.zone.x1 + ox, y1: core.zone.y1 + oy };
  const inCore = (x, y) => x >= ox && x < ox + OUT_W && y >= oy && y < oy + CORE_ROWS;
  const free = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && (GROUND.has(at(x, y)) || at(x, y) === T.SAND);
  const put = (x, y, tile) => {
    if (!free(x, y)) return false;
    setTile(map, 0, x, y, tile);
    return true;
  };
  const band = (x, y) => !inCore(x, y);
  const look = APPROACH[terrain];

  // Note: each band has the terrain's ground at half the approach density (as the margin of outdoor.js, so no seam shows), two lanes of cover clusters leading in and a few strewn things.
  // Note: the chances are worked out once; the draws keep their order, so the ground is unchanged.
  const groundOdds = look.ground.map(([tile, p]) => [tile, 0.5 * p * (tile === T.GRASS ? K.grass : K.scrub)]);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!band(x, y) || at(x, y) !== T.SAND) continue;
      for (let g = 0; g < groundOdds.length; g++) if (r.chance(groundOdds[g][1])) { setTile(map, 0, x, y, groundOdds[g][0]); break; }
    }
  }
  const lane = (side) => {
    const along = side === 'n' || side === 's';
    const len = along ? (side === 'n' ? dn : ds) : ox;
    const span = along ? W : H;
    let u = r.int(Math.round(span * 0.2), Math.round(span * 0.8));
    let flip = r.chance(0.5) ? 1 : -1;
    for (let v = 1; v < len; v += r.int(3, 4)) {
      u = Math.max(3, Math.min(span - 4, u + r.int(-1, 1)));
      const tile = r.pick(look.cover);
      const cu = u + flip * 2;
      for (const [du, dv] of [[0, 0], [0, 1], [flip, 0]].slice(0, r.int(1, 3))) {
        const uu = cu + du;
        const vv = v + dv;
        const x = along ? uu : side === 'w' ? vv : W - 1 - vv;
        const y = along ? (side === 'n' ? vv : H - 1 - vv) : uu;
        if (band(x, y)) put(x, y, tile);
      }
      flip = -flip;
    }
  };
  for (const side of SIDES) for (let i = 0; i < (side === 'n' || side === 's' ? 2 : 1); i++) lane(side);
  const strewn = Math.round(r.int(10, 16) * Math.max(0.5, K.tree));
  for (let i = 0, tries = 0; i < strewn && tries < strewn * 8; tries++) {
    const x = r.int(1, W - 2);
    const y = r.int(1, H - 2);
    if (band(x, y) && put(x, y, r.pick(look.strew))) i++;
  }

  // Note: item 484: the place's own features: running water with fords, a spring, a road in, and the works of its people.
  const features = [];
  const farBand = r.chance(0.5) ? 'n' : 's';
  const rowIn = (side) => (side === 'n' ? r.int(4, Math.max(5, dn - 5)) : r.int(H - ds + 4, H - 6));
  if ((locale.water === 'creek' || locale.water === 'river') && terrain !== 'riverbank' && terrain !== 'wash') {
    const y0 = rowIn(farBand);
    const w = locale.water === 'river' ? 2 : 1;
    const fords = [r.int(4, Math.floor(W / 2) - 6), r.int(Math.floor(W / 2) + 2, W - 8)];
    const phase = r.range(0, 6.28);
    for (let x = 0; x < W; x++) {
      const c = y0 + Math.round(Math.sin(x / 7 + phase) * 1.2);
      const ford = fords.some((g) => x >= g && x < g + 3);
      for (let d = 0; d < w; d++) if (band(x, c + d)) setTile(map, 0, x, c + d, ford ? T.WASH : T.WATER);
      if (!ford) for (const dy of [-1, w]) if (r.chance(0.25 * Math.max(1, K.tree))) put(x, c + dy, T.MESQUITE);
    }
    features.push(locale.water);
  }
  if (locale.water === 'spring') {
    const side = r.pick(SIDES);
    const [cx, cy] = side === 'n' ? [r.int(12, W - 12), dn - 4] : side === 's' ? [r.int(12, W - 12), H - ds + 3] : side === 'w' ? [ox - 4, r.int(oy + 4, oy + 20)] : [W - ox + 3, r.int(oy + 4, oy + 20)];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) put(cx + dx, cy + dy, T.WATER);
    put(cx + 2, cy + 1, T.TROUGH);
    for (const [dx, dy] of [[-1, -1], [2, -1], [-1, 2]]) if (r.chance(0.7)) put(cx + dx, cy + dy, T.MESQUITE);
    features.push('spring');
  }
  let roadSide = null;
  if (locale.road && terrain !== 'stage-road') {
    roadSide = r.pick(SIDES);
    const along = roadSide === 'n' || roadSide === 's';
    let u = along ? r.int(14, W - 15) : r.int(oy + 4, oy + 20);
    const len = along ? (roadSide === 'n' ? dn : ds) + 6 : ox + 8;
    for (let v = 0; v < len; v++) {
      if (v % 4 === 3) u += r.int(-1, 1);
      for (let d = 0; d < 2; d++) {
        const x = along ? u + d : roadSide === 'w' ? v : W - 1 - v;
        const y = along ? (roadSide === 'n' ? v : H - 1 - v) : u + d;
        if (inMap(map, x, y) && (GROUND.has(at(x, y)) || at(x, y) === T.SAND)) setTile(map, 0, x, y, T.ROAD);
      }
    }
    features.push('road');
  }
  if (terrain === 'stage-road') roadSide = r.chance(0.5) ? 'e' : 'w';
  const spot = (side) => {
    if (side === 'n' || side === 's') return [r.int(6, W - 10), side === 'n' ? r.int(3, dn - 4) : r.int(H - ds + 2, H - 7)];
    return [side === 'w' ? r.int(1, Math.max(1, ox - 4)) : r.int(W - ox, W - 4), r.int(oy + 2, oy + 20)];
  };
  for (const work of locale.works) {
    const side = r.pick(SIDES);
    const [cx, cy] = spot(side);
    if (work === 'mine' || work === 'mill') {
      for (let i = 0, n = work === 'mill' ? 3 : 2; i < n; i++) {
        const bx = cx + r.int(-3, 3);
        const by = cy + r.int(-1, 1);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) if (r.chance(0.8)) put(bx + dx, by + dy, T.TAILINGS);
      }
      if (work === 'mine') put(cx + 3, cy + 2, T.SHAFT);
      put(cx - 3, cy + 2, r.pick([T.CRATE, T.BARREL]));
    } else if (work === 'ranch') {
      const len = r.int(8, 13);
      const gap = r.int(2, len - 4);
      for (let i = 0; i < len; i++) {
        if (i === gap || i === gap + 1) continue;
        if (side === 'n' || side === 's') put(cx + i - 4, cy, T.FENCE);
        else put(cx, cy + i - 4, T.FENCE);
      }
      put(cx + 1, cy + 1, T.TROUGH);
    } else if (work === 'camp') {
      put(cx, cy, T.WAGON);
      put(cx + 1, cy, T.WAGON);
      put(cx + 2, cy + 1, T.CRATE);
      put(cx - 1, cy + 1, T.BARREL);
    }
    features.push(work);
  }

  // Note: item 485: the landform's outcrops and scarps are tiles, so they collide and give cover like any rock.
  const geo = { W, H, dn, ds, ox, oy, band, put, farBand };
  const shape = landformTiles(map, locale.landform, r, geo);
  if (shape) features.push(shape);
  map.relief = reliefOf(map, locale, r, geo);

  // Note: item 486: every side has an entry of open ground at the map edge with five party slots.
  const sides = {};
  const er = rng(seedFromString(`${seed}:${s}:entries`));
  for (const side of SIDES) {
    const along = side === 'n' || side === 's';
    const span = along ? W : H;
    const lo = along ? 8 : Math.max(8, oy - 2);
    const hi = along ? span - 9 : Math.min(span - 9, oy + CORE_ROWS + 2);
    const c = er.int(lo, Math.max(lo, hi));
    const cell = (u, v) => (along ? [u, side === 'n' ? v : H - 1 - v] : [side === 'w' ? v : W - 1 - v, u]);
    for (let v = 0; v < 5; v++) for (let u = c - 6; u <= c + 6; u++) {
      const [x, y] = cell(u, v);
      if (inMap(map, x, y)) setTile(map, 0, x, y, T.SAND);
    }
    const slots = [[c - 1, 2], [c + 1, 2], [c - 3, 2], [c + 3, 2], [c, 1]].map(([u, v]) => {
      const [x, y] = cell(u, v);
      return { x: x + 0.5, y: y + 0.5, floor: 0 };
    });
    sides[side] = { side, name: SIDE_NAMES[side], slots, entry: { x: cell(c, 0)[0] + 0.5, y: cell(c, 0)[1] + 0.5 } };
  }
  // Note: entries are open ground, so the relief there is eased to the land inside them.
  easeRelief(map);

  // Note: a gang in the open keeps a fire; it is laid with the ground, so it stays where it was on a return.
  const allSlots = SIDES.flatMap((k) => sides[k].slots);
  // Note: open-ground reachability is symmetric, so a side whose slots all lie in the first side's mask shares that mask; any other side gets its own flood.
  const maskOf = (k) => reachableMask(map, sides[k].slots.map((p) => ({ x: p.x, y: p.y, f: 0 })), { force: true, windows: false });
  const first = maskOf(SIDES[0]);
  const masks = SIDES.map((k, i) => (i === 0 || sides[k].slots.every((p) => first[cellKey(Math.floor(p.x), Math.floor(p.y), 0)] === 1) ? first : maskOf(k)));
  const gap2 = MIN_START_GAP * MIN_START_GAP;
  const spotsOf = () => {
    const out = [];
    for (let y = zone.y0; y <= zone.y1; y++) {
      for (let x = zone.x0; x <= zone.x1; x++) {
        if (!standable(map, x, y) || at(x, y) === T.DROP) continue;
        const k = cellKey(x, y, 0);
        if (masks.some((m) => m[k] !== 1)) continue;
        if (allSlots.some((p) => (p.x - (x + 0.5)) ** 2 + (p.y - (y + 0.5)) ** 2 < gap2)) continue;
        let cover = false;
        for (let dy = -1; dy <= 1 && !cover; dy++) for (let dx = -1; dx <= 1; dx++) if (isCover(at(x + dx, y + dy))) cover = true;
        out.push({ x, y, floor: 0, cover });
      }
    }
    return out;
  };
  let spots = spotsOf();
  if (spots.length < 24) return null;
  let fire = null;
  for (let y = 0; y < H && !fire; y++) for (let x = 0; x < W; x++) if (at(x, y) === T.CAMP_FIRE) { fire = { x, y }; break; }
  if (!fire) {
    // Note: standable is read once per cell of the zone and its rim, then counted from the grid.
    const gx0 = zone.x0 - 2;
    const gy0 = zone.y0 - 2;
    const gw = zone.x1 - zone.x0 + 5;
    const gh = zone.y1 - zone.y0 + 5;
    const free = new Uint8Array(gw * gh);
    for (let v = 0; v < gh; v++) for (let u = 0; u < gw; u++) free[v * gw + u] = standable(map, gx0 + u, gy0 + v) ? 1 : 0;
    const room = (c) => {
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) n += free[(c.y + dy - gy0) * gw + (c.x + dx - gx0)];
      return n;
    };
    const mid = { x: (zone.x0 + zone.x1) / 2, y: (zone.y0 + zone.y1) / 2 };
    const roomy = spots.filter((c) => room(c) >= 10).map((c) => ({ c, k: Math.hypot(c.x - mid.x, c.y - mid.y) })).sort((p, q) => p.k - q.k).map((e) => e.c);
    if (!roomy.length) return null;
    const c = r.pick(roomy.slice(0, Math.max(1, Math.ceil(roomy.length * 0.25))));
    setTile(map, 0, c.x, c.y, T.CAMP_FIRE);
    spots = spots.filter((p) => p.x !== c.x || p.y !== c.y);
  }

  // Note: the layout checks: every side reaches every other, the hostile ground has cover, the terrain has its features and the land is not a maze.
  for (const m of masks) for (const k of SIDES) if (m[cellKey(Math.floor(sides[k].slots[0].x), Math.floor(sides[k].slots[0].y), 0)] !== 1) return null;
  let cover = 0;
  for (let y = zone.y0 - 1; y <= zone.y1 + 1; y++) for (let x = zone.x0 - 1; x <= zone.x1 + 1; x++) if (isCover(at(x, y))) cover++;
  if (cover < MIN_COVER) return null;
  const counts = tileCounts(map);
  for (const [tile, min] of Object.entries(needFor(terrain, opts.region))) {
    if (tile === 'walls' ? (counts[T.ADOBE] || 0) + (counts[T.FRAME] || 0) < min : (counts[tile] || 0) < min) return null;
  }
  let open = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (standable(map, x, y)) open++;
  if (open < W * H * 0.55) return null;
  const doors = core.doors.map((d) => ({ ...d, x: d.x + ox, y: d.y + oy }));
  for (const d of doors) {
    const ok = (dx, dy) => standable(map, d.x + dx, d.y + dy);
    if (!((ok(0, 1) && ok(0, -1)) || (ok(1, 0) && ok(-1, 0)))) return null;
  }
  const setPiece = core.setPiece ? { ...core.setPiece, x: core.setPiece.x + ox, y: core.setPiece.y + oy } : core.setPiece;
  return {
    seed, terrain, map, zone, doors, windows: core.windows.map((w) => ({ ...w, x: w.x + ox, y: w.y + oy })), setPiece, look: core.look, sides, spots, roadSide,
    locale, features, size: { W, H }, core: { x: ox, y: oy, w: OUT_W, h: CORE_ROWS },
  };
}

// Note: places the case's people on a laid ring; the chosen side only picks the party's slots.
function peopleOn(lay, opts) {
  const range = hostileRange(opts);
  const side = SIDES.includes(opts.side) ? opts.side : 's';
  const people = opts.people ?? lay.seed;
  for (let k = 0; k < PEOPLE_TRIES; k++) {
    const pr = rng(seedFromString(`${people}:${lay.terrain}:people:${k}`));
    const z = lay.zone;
    const site = {
      kind: 'outdoor', layout: 'ring', terrain: lay.terrain, seed: lay.seed, style: lay.terrain, setPiece: lay.setPiece, map: lay.map,
      footprint: z, hall: null, rooms: [], stairs: null, entries: [], doors: lay.doors, windows: lay.windows,
      side, sides: lay.sides, spawn: { sheriff: { ...lay.sides[side].slots[0] }, deputy: { ...lay.sides[side].slots[1] }, slots: lay.sides[side].slots.map((p) => ({ ...p })) },
      hostiles: [], civilian: null, rumor: false, locale: lay.locale, features: lay.features, size: lay.size, core: lay.core,
      // Note: item 487: a site with a building has its interior and the open ground round it in one scene.
      integration: lay.doors.length ? 'integrated' : 'outdoor',
      safe: (x, y) => Math.hypot(Math.max(z.x0 - x, 0, x - (z.x1 + 1)), Math.max(z.y0 - y, 0, y - (z.y1 + 1))) > SAFE_DIST,
    };
    if (!lay.look.base) site.region = lay.look.id;
    site.hostiles = placeHostiles(pr, lay.spots, opts);
    // Note: the sentries face the likeliest way in, the road if there is one, never the side the party actually chose; a case's known watch wins, with the draw still made so the rest of the camp stays as it was.
    const drawn = lay.roadSide || pr.pick(SIDES);
    const watch = SIDES.includes(opts.watch) ? opts.watch : drawn;
    campLife({ map: lay.map, hostiles: site.hostiles, spawn: { slots: lay.sides[watch].slots }, set camp(v) { site.camp = v; } }, lay.spots, pr);
    const civ = rng(seedFromString(`${people}:civilian`));
    const { present, kind, rumor } = rollCivilian(civ, opts.civilianChance != null ? opts.civilianChance : CIVILIAN_CHANCE);
    site.rumor = rumor;
    if (present) {
      const free = lay.spots.filter((c) => site.hostiles.every((h) => Math.abs(Math.floor(h.x) - c.x) + Math.abs(Math.floor(h.y) - c.y) >= 3));
      const c = pr.pick(free.length ? free : lay.spots);
      site.civilian = { x: c.x + 0.5, y: c.y + 0.5, floor: 0, kind };
    }
    if (site.hostiles.length < range[0] || site.hostiles.length > range[1]) continue;
    // Note: the whole site is checked once from its own side; the other sides need only their entry checks.
    const own = validateOutdoor(site, range);
    if (own.ok && SIDES.every((k2) => k2 === side || !entryProblems(site, lay.sides[k2].slots, own.seen).length)) return site;
  }
  return null;
}

// Note: outcrop lines, rims and cut banks of a landform; returns its name, or null for one without tiles.
function landformTiles(map, landform, r, g) {
  const { W, H, dn, ds, ox, put, band, farBand } = g;
  g.line = new Set();
  // Note: item 497: a cliff edge of tiles along v = c[u]; each step of the line is filled, so it is 4-connected and no walkable cell on one side touches one on the other, even diagonally, and the ground keeps its drop across it. The fill goes in the column on the side away (-1 towards low v, +1 towards high v), so a line beside a bed never covers it. Where gap(u) holds, or a cell is not open ground, the line is open and the easing makes a ramp.
  const cliffLine = (c, cell, tile, gap = () => false, away = -1) => {
    const lay = (u, v) => {
      const [x, y] = cell(u, v);
      // Note: a road keeps its way through, as a cutting.
      if (band(x, y) && tileAt(map, 0, x, y) !== T.ROAD && put(x, y, tile)) g.line.add(y * W + x);
    };
    for (let u = 0; u < c.length; u++) {
      if (gap(u)) continue;
      lay(u, c[u]);
      if (u + 1 >= c.length || gap(u + 1) || c[u + 1] === c[u]) continue;
      const lo = Math.min(c[u], c[u + 1]);
      const hi = Math.max(c[u], c[u + 1]);
      // Note: away -1 fills the column whose own cell is the higher v, so the fill lies on the low-v side of the bed.
      const at = (away < 0) === (c[u + 1] > c[u]) ? u + 1 : u;
      for (let v = lo; v <= hi; v++) lay(at, v);
    }
  };
  const across = (u, v) => [u, v];
  if (landform === 'ridge' || landform === 'mesa') {
    // Note: a ridge crest or a mesa rim crosses one of the long bands, broken by two passes.
    const y0 = farBand === 'n' ? Math.max(4, Math.floor(dn / 2)) : H - Math.max(4, Math.floor(ds / 2)) - 1;
    const passes = [r.int(5, Math.floor(W / 2) - 5), r.int(Math.floor(W / 2) + 2, W - 8)];
    const phase = r.range(0, 6.28);
    g.crest = [];
    for (let x = 1; x < W - 1; x++) g.crest.push([x, y0 + Math.round(Math.sin(x / 8 + phase) * 1.5)]);
    const inPass = (x) => passes.some((p) => x >= p && x < p + 3);
    const rows = Array.from({ length: W }, (_, x) => g.crest[Math.max(0, Math.min(g.crest.length - 1, x - 1))][1]);
    if (landform === 'mesa') {
      // Note: the mesa rim is an unbroken caprock cliff but for the passes.
      cliffLine(rows, across, T.ROCK, inPass);
    } else {
      for (let x = 1; x < W - 1; x++) if (!inPass(x) && r.chance(0.75)) put(x, rows[x], T.ROCK);
      // Note: item 497: rimrock: cut banks along the shoulders of the crest, for stretches on each side, so the flank drops away below the top.
      for (const side of [-1, 1]) {
        const ph = r.range(0, 6.28);
        cliffLine(rows.map((y) => y + side * RIDGE_TOP), across, T.BANK, (x) => inPass(x) || Math.sin(x / 5 + ph) < -0.2, side);
      }
    }
    return landform;
  }
  if (landform === 'gully' || landform === 'bajada') {
    // Note: an arroyo winds across a band; cut banks stand along parts of it and the rest can be crossed.
    const y0 = farBand === 'n' ? Math.max(4, Math.floor(dn / 2)) : H - Math.max(4, Math.floor(ds / 2)) - 1;
    const phase = r.range(0, 6.28);
    g.crest = [];
    for (let x = 0; x < W; x++) {
      const y = y0 + Math.round(Math.sin(x / 6 + phase) * 1.6);
      g.crest.push([x, y]);
      if (band(x, y) && (GROUND.has(tileAt(map, 0, x, y)) || tileAt(map, 0, x, y) === T.SAND)) setTile(map, 0, x, y, T.WASH);
    }
    if (landform === 'gully') {
      // Note: item 497: cut banks wall the gully on both sides, broken by crossings, so its bed lies out of sight of the plain.
      const rows = g.crest.map(([, y]) => y);
      const crossing = (x) => (x + 4) % GULLY_CROSS < 3;
      for (const side of [-1, 1]) cliffLine(rows.map((y) => y + side), across, T.BANK, crossing, side);
    }
    return landform === 'gully' ? 'gully' : 'arroyo';
  }
  if (landform === 'canyon') {
    // Note: item 497: the canyon walls: a rock cliff on each side of the floor, in the two columns between the side entries (five cells deep) and the camp ground, each with two ramps up.
    g.walls = [];
    for (const [x0, side] of [[ox - 2, -1], [ox + OUT_W, 1]]) {
      const ph = r.range(0, 6.28);
      const cols = Array.from({ length: H }, (_, y) => x0 + (Math.sin(y / 7 + ph) > 0 ? 1 : 0));
      const ramps = [r.int(4, Math.floor(H / 2) - 4), r.int(Math.floor(H / 2) + 1, H - 8)];
      cliffLine(cols, (u, v) => [v, u], T.ROCK, (y) => ramps.some((p) => y >= p && y < p + 3));
      g.walls.push({ cols, side });
    }
  }
  if (landform === 'terraces') {
    // Note: item 497: river terraces: the ground steps up one level every TERRACE_RUN cells away from the water, each riser a cut bank broken by gaps.
    const dist = new Int16Array(W * H).fill(-1);
    const queue = [];
    for (let i = 0; i < W * H; i++) if (map.floors[0].tile[i] === T.WATER) { dist[i] = 0; queue.push(i); }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[ny * W + nx] >= 0) continue;
        dist[ny * W + nx] = dist[i] + 1;
        queue.push(ny * W + nx);
      }
    }
    if (queue.length) {
      g.terrace = dist;
      // Note: a riser cell is one at a whole number of runs from the water; whole 4-cell blocks are left open, so a riser has gaps of four cells or more.
      const gap = (x, y) => (((x >> 2) * 7 + (y >> 2) * 13) % 5) === 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = dist[y * W + x];
        if (d > 0 && d % TERRACE_RUN === 0 && d / TERRACE_RUN <= TERRACE_TOP && !gap(x, y) && band(x, y) && put(x, y, T.BANK)) g.line.add(y * W + x);
      }
    }
    return null;
  }
  if (landform === 'canyon' || landform === 'foothills') {
    // Note: boulders lie scattered on the rising flanks of the east and west bands.
    for (let i = 0, n = r.int(6, 10); i < n; i++) {
      const west = r.chance(0.5);
      const x = west ? r.int(1, Math.max(1, ox - 2)) : r.int(W - ox + 1, W - 2);
      const y = r.int(3, H - 4);
      put(x, y, T.ROCK);
      if (r.chance(0.5)) put(x, y + 1, T.ROCK);
    }
    return landform;
  }
  return null;
}

// Note: the relief: crests rise several metres, so high ground commands the low; a soft swell, the landform's shape, water and washes cut into the ground, building pads levelled, then every walkable step eased to MAX_STEP.
function reliefOf(map, locale, r, g) {
  const { W, H, ox } = g;
  const h = new Float32Array(W * H);
  const amp = SWELL[locale.landform] ?? 1;
  const NX = Math.ceil(W / 8) + 2;
  const NY = Math.ceil(H / 8) + 2;
  const nodes = Array.from({ length: NX * NY }, () => r.range(-0.5, 0.5) * amp);
  const swell = (x, y) => {
    const fx = x / 8;
    const fy = y / 8;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const n = (a, b) => nodes[Math.min(NY - 1, b) * NX + Math.min(NX - 1, a)];
    return n(i, j) * (1 - u) * (1 - v) + n(i + 1, j) * u * (1 - v) + n(i, j + 1) * (1 - u) * v + n(i + 1, j + 1) * u * v;
  };
  // Note: item 497: the hummocks: a second, shorter swell whose nodes are pushed towards their extremes, so knolls and hollows have firm shoulders.
  const hAmp = HUMMOCK[locale.landform] ?? 0.5;
  const HX = Math.ceil(W / HUMMOCK_STEP) + 2;
  const HY = Math.ceil(H / HUMMOCK_STEP) + 2;
  const knobs = Array.from({ length: HX * HY }, () => {
    const v = r.range(-1, 1);
    return Math.sign(v) * Math.abs(v) ** 0.6 * hAmp;
  });
  const hummock = (x, y) => {
    const fx = x / HUMMOCK_STEP;
    const fy = y / HUMMOCK_STEP;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const n = (a, b) => knobs[Math.min(HY - 1, b) * HX + Math.min(HX - 1, a)];
    return n(i, j) * (1 - u) * (1 - v) + n(i + 1, j) * u * (1 - v) + n(i, j + 1) * (1 - u) * v + n(i + 1, j + 1) * u * v;
  };
  const tilt = locale.landform === 'bajada' ? r.range(1, 1.8) * (r.chance(0.5) ? 1 : -1) : 0;
  const crestDist = (x, y) => {
    if (!g.crest) return Infinity;
    const c = g.crest[Math.max(0, Math.min(g.crest.length - 1, x - g.crest[0][0]))];
    return y - c[1];
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let z = swell(x, y) + hummock(x, y) + tilt * (y / H - 0.5);
      const d = crestDist(x, y);
      // Note: item 497: the ridge has a level top RIDGE_TOP - 1 cells either side of the crest, a 1.3 m drop at the rimrock and steep flanks below.
      if (locale.landform === 'ridge') z += Math.abs(d) < RIDGE_TOP ? 4.5 : Math.max(0, 3.2 - 0.55 * (Math.abs(d) - RIDGE_TOP));
      if (locale.landform === 'mesa') z += (g.farBand === 'n' ? d < 0 : d > 0) ? 4 : 0;
      if (locale.landform === 'canyon') {
        // Note: item 497: the canyon floor lies 3 m below the rims, which rise 2 m more to the map edge.
        const [wl, wr] = g.walls;
        const xl = wl.cols[y];
        const xr = wr.cols[y];
        if (x < xl) z += 3 + (2 * (xl - x)) / Math.max(1, xl);
        else if (x > xr) z += 3 + (2 * (x - xr)) / Math.max(1, W - 1 - xr);
      }
      if (locale.landform === 'foothills') z += 2.4 * Math.max(0, Math.abs(x - W / 2) - 18) / 14;
      h[y * W + x] = z;
    }
  }
  // Note: a river, a creek or a wash lies below the land round it, deepest in the bed and eased over two cells.
  const depth = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tileAt(map, 0, x, y);
      const D = t === T.WATER ? -1.3 : t === T.WASH ? (locale.landform === 'gully' ? -2 : -0.9) : 0;
      if (!D) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = Math.max(Math.abs(dx), Math.abs(dy));
        const v = D * (k === 0 ? 1 : k === 1 ? 0.55 : 0.2);
        if (v < depth[ny * W + nx]) depth[ny * W + nx] = v;
      }
    }
  }
  for (let i = 0; i < h.length; i++) h[i] += depth[i];
  // Note: river terraces step up away from the water, one riser every TERRACE_RUN cells.
  if (g.terrace) {
    for (let i = 0; i < h.length; i++) if (g.terrace[i] > 0) h[i] += 0.35 + TERRACE_RISE * Math.min(TERRACE_TOP, Math.floor((g.terrace[i] - 1) / TERRACE_RUN));
  }
  // Note: item 497: a cliff cell stands at the foot of its drop, the lowest of the open ground round it, so the drop shows across it and its own top hides only what lies below.
  if (g.line && g.line.size) {
    const low = new Map();
    for (const i of g.line) {
      const x = i % W;
      const y = (i - x) / W;
      let m = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || g.line.has(ny * W + nx)) continue;
        m = Math.min(m, h[ny * W + nx]);
      }
      if (Number.isFinite(m)) low.set(i, m);
    }
    for (const [i, m] of low) h[i] = m;
  }
  // Note: a building stands on a level pad.
  const seen = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (seen[y * W + x] || !BUILT.has(tileAt(map, 0, x, y))) continue;
      const stack = [[x, y]];
      seen[y * W + x] = 1;
      let x0 = x, x1 = x, y0 = y, y1 = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || !BUILT.has(tileAt(map, 0, nx, ny))) continue;
          seen[ny * W + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { sum += h[yy * W + xx]; n++; }
      const pad = sum / n;
      for (let yy = Math.max(0, y0 - 2); yy <= Math.min(H - 1, y1 + 2); yy++) for (let xx = Math.max(0, x0 - 2); xx <= Math.min(W - 1, x1 + 2); xx++) h[yy * W + xx] = pad;
    }
  }
  map.relief = h;
  easeRelief(map);
  return h;
}

// Note: lowers the higher of any two walkable neighbours until no step between them exceeds MAX_STEP, so relief alone never walls a route.
export function easeRelief(map) {
  const h = map.relief;
  if (!h) return;
  const { W, H } = map;
  const walk = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) walk[y * W + x] = standable(map, x, y) ? 1 : 0;
  // Note: the eased ground is the fixed point of "no walkable cell above a walkable neighbour plus MAX_STEP"; a worklist of the cells that lower a neighbour reaches it, touching only the steep places.
  const queue = new Int32Array(W * H);
  const queued = new Uint8Array(W * H);
  let head = 0;
  let tail = 0;
  // Note: lowers the walkable neighbours of i that stand too high; returns whether any was too high when only testing.
  const relax = (i, lower) => {
    const x = i % W;
    const y = (i - x) / W;
    let steep = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!walk[j]) continue;
      // Note: the slack absorbs float32 rounding, or a stored step could test as too steep forever.
      if (h[j] > h[i] + MAX_STEP + 1e-4) {
        steep = true;
        if (!lower) continue;
        h[j] = h[i] + MAX_STEP;
        if (!queued[j]) {
          queued[j] = 1;
          queue[tail++ % queue.length] = j;
        }
      }
    }
    return steep;
  };
  for (let i = 0; i < W * H; i++) if (walk[i] && relax(i, false)) {
    queued[i] = 1;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++ % queue.length];
    queued[i] = 0;
    relax(i, true);
  }
}
