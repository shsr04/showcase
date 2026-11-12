// Note: seeded Old West buildings with doors, windows, furniture, hostiles and an occasional civilian; a difficulty with a complexity is planned by building-plan.js on one or more storeys.

import { rng, seedFromString } from './rand.js';
import { MAP_W, MAP_H, SAFE_DIST, HOSTILE_MIN, HOSTILE_MAX, CIVILIAN_CHANCE } from './config.js';
import { T, DS, WS, cellSolid, isWall, isFurniture, isFlight, TILE_ART_BASE } from './tiles.js';
import { makeMap, newFloor, setTile, tileAt, stateAt, cloneMap } from './map.js';
import { reachableMask, cellKey } from './nav.js';
import { regionalLook } from './regional-look.js';
import { buildPlanned } from './building-plan.js';

const ATTEMPTS = 400;

// Note: furniture plan per room kind; wall pieces hug a wall, the rest go anywhere free.
const PLAN = {
  parlor: [T.SOFA, T.TABLE, T.CHAIR, T.CHAIR, T.SHELF],
  kitchen: [T.STOVE, T.COUNTER, T.COUNTER, T.TABLE, T.CHAIR, T.CHAIR, T.BARREL],
  study: [T.DESK, T.SHELF, T.SHELF, T.CHAIR],
  bedroom: [T.BED, T.WARDROBE, T.CHAIR, T.CRATE],
  storage: [T.BARREL, T.BARREL, T.CRATE, T.CRATE, T.SHELF],
  saloon: [T.COUNTER, T.COUNTER, T.TABLE, T.TABLE, T.CHAIR, T.CHAIR, T.BARREL],
  dining: [T.TABLE, T.TABLE, T.CHAIR, T.CHAIR, T.COUNTER],
  shop: [T.COUNTER, T.COUNTER, T.SHELF, T.SHELF, T.CRATE],
  office: [T.DESK, T.CHAIR, T.SHELF, T.CRATE],
  bank: [T.COUNTER, T.COUNTER, T.DESK, T.CHAIR, T.SHELF],
  bunkroom: [T.BED, T.BED, T.BED, T.CRATE, T.CHAIR],
  warehouse: [T.CRATE, T.CRATE, T.CRATE, T.BARREL, T.BARREL, T.SHELF],
  chapel: [T.COUNTER, T.SOFA, T.SOFA, T.CHAIR, T.SHELF],
  forge: [T.STOVE, T.COUNTER, T.CRATE, T.BARREL, T.SHELF],
  // Note: item 482: the rooms that make each building type recognizable by its contents.
  lobby: [T.COUNTER, T.DESK, T.SOFA, T.CHAIR, T.SHELF],
  guestroom: [T.BED, T.WARDROBE, T.CHAIR],
  cardroom: [T.TABLE, T.TABLE, T.CHAIR, T.CHAIR, T.CHAIR, T.SHELF],
  stockroom: [T.SHELF, T.SHELF, T.CRATE, T.CRATE, T.BARREL],
  vault: [T.WARDROBE, T.SHELF, T.CRATE, T.CRATE],
  records: [T.SHELF, T.SHELF, T.SHELF, T.DESK, T.CHAIR],
  vestry: [T.WARDROBE, T.DESK, T.CHAIR, T.SHELF],
  loft: [T.CHAIR, T.CHAIR, T.SOFA, T.CRATE],
  workroom: [T.COUNTER, T.COUNTER, T.SHELF, T.CRATE, T.WAGON, T.BARREL],
  loading: [T.WAGON, T.CRATE, T.CRATE, T.BARREL, T.BARREL],
  barn: [T.HAY, T.HAY, T.TROUGH, T.TROUGH, T.FENCE, T.FENCE, T.BARREL],
  tackroom: [T.SHELF, T.SHELF, T.CRATE, T.BARREL, T.CHAIR],
  feedroom: [T.HAY, T.HAY, T.BARREL, T.BARREL, T.CRATE],
  hayloft: [T.HAY, T.HAY, T.HAY, T.CRATE],
  millroom: [T.TAILINGS, T.TAILINGS, T.STOVE, T.COUNTER, T.BARREL, T.CRATE],
  hoist: [T.SHAFT, T.STOVE, T.BARREL, T.CRATE, T.WAGON],
  assay: [T.STOVE, T.COUNTER, T.SHELF, T.DESK, T.CHAIR],
  equipment: [T.CRATE, T.CRATE, T.BARREL, T.BARREL, T.WAGON, T.SHELF],
};
// Note: what a planned building adds to a large room for every further 16 cells of floor, so a big barroom, nave or barn is filled like one.
const EXTRA = {
  saloon: [T.TABLE, T.CHAIR, T.CHAIR], chapel: [T.SOFA, T.SOFA], warehouse: [T.CRATE, T.CRATE, T.BARREL], shop: [T.SHELF, T.CRATE],
  bank: [T.DESK, T.CHAIR], lobby: [T.SOFA, T.CHAIR], barn: [T.HAY, T.FENCE, T.TROUGH], millroom: [T.TAILINGS, T.CRATE], workroom: [T.COUNTER, T.CRATE],
  forge: [T.CRATE, T.BARREL], dining: [T.TABLE, T.CHAIR, T.CHAIR], bunkroom: [T.BED, T.BED], hayloft: [T.HAY, T.HAY], loading: [T.CRATE, T.CRATE],
  equipment: [T.CRATE, T.BARREL], office: [T.DESK, T.CHAIR], parlor: [T.CHAIR], hoist: [T.CRATE, T.BARREL], stockroom: [T.SHELF, T.CRATE], kitchen: [T.BARREL],
};
// Note: solid pieces a room may be furnished with: furniture and the stock, ore and feed of trades.
const PROP_BASES = new Set([T.HAY, T.TROUGH, T.WAGON, T.TAILINGS, T.SHAFT, T.FENCE]);
export const isProp = (t) => isFurniture(t) || PROP_BASES.has(TILE_ART_BASE[t] ?? t);

export const BUILDINGS = {
  house: { ground: ['parlor', 'study', 'kitchen', 'storage'], upper: ['bedroom', 'bedroom', 'study', 'storage'], split: [0.75, 0.75, 0.6, 0.6], arches: 0.1 },
  saloon: { ground: ['saloon', 'saloon', 'kitchen', 'storage'], upper: ['bedroom', 'bedroom', 'bunkroom', 'storage'], split: [0.15, 0.65, 0.8, 0.8], arches: 0.45 },
  hotel: { ground: ['parlor', 'office', 'dining', 'kitchen'], upper: ['bedroom', 'bedroom', 'bedroom', 'bedroom'], split: [0.65, 0.75, 0.95, 0.95], arches: 0.2 },
  store: { ground: ['shop', 'shop', 'warehouse', 'office'], upper: ['bedroom', 'study', 'storage', 'storage'], split: [0.15, 0.8, 0.6, 0.8], arches: 0.4 },
  bank: { ground: ['bank', 'bank', 'office', 'storage'], upper: ['office', 'study', 'storage', 'bedroom'], split: [0.2, 0.8, 0.75, 0.7], arches: 0.25 },
  boardinghouse: { ground: ['parlor', 'dining', 'kitchen', 'storage'], upper: ['bedroom', 'bunkroom', 'bedroom', 'bunkroom'], split: [0.8, 0.8, 0.95, 0.95], arches: 0.2 },
  warehouse: { ground: ['warehouse', 'warehouse', 'storage', 'office'], upper: ['storage', 'storage', 'office', 'bunkroom'], split: [0.1, 0.5, 0.35, 0.65], arches: 0.5 },
  office: { ground: ['office', 'study', 'office', 'storage'], upper: ['office', 'study', 'bedroom', 'storage'], split: [0.85, 0.85, 0.8, 0.8], arches: 0.15 },
  church: { ground: ['chapel', 'chapel', 'office', 'storage'], upper: ['chapel', 'study', 'bedroom', 'storage'], split: [0.1, 0.65, 0.3, 0.65], arches: 0.4 },
  blacksmith: { ground: ['forge', 'forge', 'warehouse', 'storage'], upper: ['storage', 'bunkroom', 'bedroom', 'storage'], split: [0.15, 0.7, 0.6, 0.7], arches: 0.35 },
  workshop: { ground: ['workroom', 'workroom', 'stockroom', 'office'], upper: ['storage', 'bedroom', 'workroom', 'storage'], split: [0.2, 0.7, 0.6, 0.7], arches: 0.35 },
  ranch: { ground: ['barn', 'tackroom', 'feedroom', 'kitchen'], upper: ['hayloft', 'bunkroom', 'bunkroom', 'storage'], split: [0.4, 0.7, 0.6, 0.7], arches: 0.3 },
  mine: { ground: ['hoist', 'equipment', 'millroom', 'assay'], upper: ['bunkroom', 'storage', 'equipment', 'bunkroom'], split: [0.4, 0.6, 0.6, 0.7], arches: 0.3 },
};

export const BUILDING_LABELS = {
  house: 'a house', saloon: 'a saloon', hotel: 'a hotel', store: 'a general store', bank: 'a bank',
  boardinghouse: 'a boarding house', warehouse: 'a warehouse', office: 'an office building',
  church: 'a church', blacksmith: 'a blacksmith’s shop',
  workshop: 'a workshop', ranch: 'a ranch', mine: 'a mine works',
};
export const BUILDING_TILES = {
  house: { room: 'parlor', base: T.SOFA, tile: T.HOUSE_SOFA },
  saloon: { room: 'saloon', base: T.COUNTER, tile: T.SALOON_BAR },
  hotel: { room: 'parlor', base: T.TABLE, tile: T.HOTEL_TABLE },
  store: { room: 'shop', base: T.COUNTER, tile: T.STORE_COUNTER },
  bank: { room: 'bank', base: T.COUNTER, tile: T.BANK_COUNTER },
  boardinghouse: { room: 'parlor', base: T.TABLE, tile: T.BOARDING_TABLE },
  warehouse: { room: 'warehouse', base: T.CRATE, tile: T.WAREHOUSE_CRATE },
  office: { room: 'office', base: T.DESK, tile: T.OFFICE_DESK },
  church: { room: 'chapel', base: T.COUNTER, tile: T.CHURCH_ALTAR },
  blacksmith: { room: 'forge', base: T.STOVE, tile: T.SMITH_FORGE },
  workshop: { room: 'workroom', base: T.WAGON, tile: T.FREIGHT_CART },
  ranch: { room: 'barn', base: T.HAY, tile: T.FEED_BALE },
  mine: { room: 'hoist', base: T.SHAFT, tile: T.WORK_SHAFT },
};
const HUGS = new Set([T.SOFA, T.STOVE, T.COUNTER, T.SHELF, T.WARDROBE, T.DESK, T.BARREL, T.CRATE, T.HAY, T.TROUGH, T.TAILINGS]);

const HALL_DOOR = [[DS.CLOSED, 0.66], [DS.OPEN, 0.16], [DS.LOCKED, 0.18]];
const LINK_DOOR = [[DS.CLOSED, 0.7], [DS.OPEN, 0.3]];
const FRONT_DOOR = [[DS.CLOSED, 0.5], [DS.LOCKED, 0.3], [DS.OPEN, 0.2]];
const BACK_DOOR = [[DS.LOCKED, 0.5], [DS.CLOSED, 0.35], [DS.OPEN, 0.15]];
const SIDE_DOOR = [[DS.LOCKED, 0.45], [DS.CLOSED, 0.5], [DS.OPEN, 0.05]];
const WINDOWS = [[WS.CLOSED, 0.42], [WS.BOLTED, 0.43], [WS.OPEN, 0.1], [WS.BROKEN, 0.05]];

const LOADOUTS = [
  [[{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '45colt' }], 0.28],
  [[{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '44-40' }], 0.12],
  [[{ id: 'colt73', ammoType: '45colt' }], 0.22],
  [[{ id: 'colt73', ammoType: '44-40' }], 0.1],
  [[{ id: 'colt73', ammoType: '45colt' }, { id: 'colt73', ammoType: '45colt' }], 0.13],
  [[{ id: 'winchester73', ammoType: '44-40' }], 0.15],
];

// Note: a difficulty is { count: [min, max], experience: [green, seasoned, veteran] weights, civilianChance }; every field is optional and no difficulty gives the default numbers.
export const HOSTILE_CAP = 8;

// Note: the inclusive hostile range a difficulty asks for, clamped to 1..HOSTILE_CAP.
export function hostileRange(diff) {
  if (!diff || !diff.count) return [HOSTILE_MIN, HOSTILE_MAX];
  const lo = Math.max(1, Math.min(HOSTILE_CAP, Math.round(diff.count[0])));
  const hi = Math.max(lo, Math.min(HOSTILE_CAP, Math.round(diff.count[1])));
  return [lo, hi];
}

// Note: how complex a building type tends to be before case difficulty and settlement size add to it.
const TYPE_COMPLEXITY = { house: 0, office: 0.05, boardinghouse: 0.1, church: 0.1, ranch: 0.1, workshop: 0.12, blacksmith: 0.15, store: 0.2, mine: 0.25, saloon: 0.3, warehouse: 0.3, bank: 0.35, hotel: 0.4 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Note: item 477: the complexity a building type, case tier 1 to 5 and settlement size class 0 to 4 lean toward, in [0, 1]; the plan may still draw a modest site (building-plan.js).
export const buildingComplexity = ({ building, tier, size }) => clamp01(TYPE_COMPLEXITY[building] + 0.35 * (tier - 1) / 4 + 0.25 * size / 4);

// Note: the requested complexity, or null so a difficulty without one keeps the earlier layouts exactly.
const complexityOf = (diff) => (diff && Number.isFinite(diff.complexity) ? diff.complexity : null);

export function generateHouse(seed, diff) {
  const base = seedFromString(seed);
  const range = hostileRange(diff);
  if (diff && diff.building && !BUILDINGS[diff.building]) throw new Error(`Unknown building ${diff.building}`);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const house = buildHouse(seed, (base + Math.imul(attempt, 0x9e3779b9)) >>> 0, diff);
    if (validateHouse(house, range).ok) return house;
  }
  throw new Error(`No valid house for seed ${seed}`);
}

export const houseMap = (house) => cloneMap(house.map);

export function buildHouse(seed, s, diff) {
  // Note: items 482 and 483: a difficulty with a complexity gets a planned building of its type, otherwise the earlier hall plan is kept exactly.
  if (complexityOf(diff) != null) return buildPlanned(seed, s, diff);
  const r = rng(s);
  const civ = rng(seedFromString(`${seed}:civilian`));
  const legacy = !(diff && diff.building);
  const building = (diff && diff.building) || 'house';
  const blueprint = BUILDINGS[building];
  const singleStory = diff && diff.allowSingleStory && ['store', 'bank', 'warehouse', 'office', 'church', 'blacksmith', 'workshop', 'ranch', 'mine'].includes(building) && rng(seedFromString(`${seed}:stories`)).chance(0.55);
  const stories = diff && (diff.stories === 1 || diff.stories === 2) ? diff.stories : singleStory ? 1 : 2;
  // Note: a regional look moves the massive-wall share; the Cochise look draws at 0.4.
  const look = regionalLook(diff && diff.region);
  const style = r.chance(look.building.share) ? 'adobe' : 'frame';
  const ext = style === 'adobe' ? T.ADOBE : T.FRAME;
  const wide = !legacy && ['saloon', 'store', 'bank', 'warehouse', 'church', 'blacksmith', 'workshop', 'ranch', 'mine'].includes(building);
  const width = r.int(wide ? 20 : 17, 21);
  const depth = r.int(11, 13);
  const x0 = Math.floor((MAP_W - width) / 2) + r.int(-2, 2);
  const y0 = 6 + r.int(0, 1);
  const x1 = x0 + width - 1;
  const y1 = y0 + depth - 1;
  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;
  const avail = ix1 - ix0 + 1 - 5;
  const minWest = wide ? 7 : 4;
  const westW = r.int(minWest, avail - 4);
  const wwx = ix0 + westW;
  const hx0 = wwx + 1;
  const hx1 = hx0 + 2;
  const ewx = hx1 + 1;
  const gate = hx0 + 1;
  const fenceY = y1 + 4;
  const sy = iy0 + r.int(2, 4);
  // Note: a west hall door must not open onto the flight or onto the rail that closes its far end.
  const flightRow = (f, y) => y === sy || y === sy - 1 || y === (f === 0 ? sy - 2 : sy + 1);

  const map = makeMap([newFloor(T.SAND), newFloor(T.DROP)]);
  // Note: only a regional house carries its region and wall material, so a Cochise house carries neither.
  if (!look.base) {
    map.region = look.id;
    map.material = look.building.massive;
  }
  if (!legacy) map.art = { kind: 'building', theme: building, x: x0, y: y0, width, height: depth, porch: 2 };
  const put = (f, x, y, tile, state = 0) => setTile(map, f, x, y, tile, state);
  const keep = new Set();
  const keepFree = (f, x, y) => keep.add(cellKey(x, y, f));
  const rooms = [];
  const doors = [];
  const windows = [];
  const entries = [];

  // Note: ground-floor surroundings, then the shell and floorboards of both floors.
  for (let x = x0; x <= x1; x++) for (let y = y1 + 1; y <= y1 + 2; y++) put(0, x, y, T.PORCH);
  put(0, x0, y1 + 2, T.POST);
  put(0, x1, y1 + 2, T.POST);
  for (let x = x0 - 3; x <= x1 + 3; x++) if (x < gate - 1 || x > gate + 1) put(0, x, fenceY, T.FENCE);
  for (let f = 0; f < stories; f++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        put(f, x, y, edge ? ext : T.FLOOR);
      }
    }
    for (let y = iy0; y <= iy1; y++) {
      put(f, wwx, y, T.PARTITION);
      put(f, ewx, y, T.PARTITION);
    }
    if (stories === 2) {
      put(f, hx0, sy, T.STAIRS);
      put(f, hx0, sy - 1, T.RUN);
      put(f, hx0 + 1, sy, T.RAIL);
      put(f, hx0 + 1, sy - 1, T.RAIL);
      put(f, hx0, f === 0 ? sy - 2 : sy + 1, T.RAIL);
      keepFree(f, hx0, f === 0 ? sy + 1 : sy - 2);
    }
    rooms.push({ id: rooms.length, floor: f, kind: 'hall', x0: hx0, y0: iy0, x1: hx1, y1: iy1 });
  }
  for (let y = iy0; y <= iy1; y++) if (stories === 1 || (y !== sy && y !== sy - 1)) put(0, hx0 + 1, y, T.RUG);

  const addDoor = (f, x, y, state, interior) => {
    put(f, x, y, T.DOOR, state);
    doors.push({ floor: f, x, y, interior });
  };
  const addWindow = (f, x, y, state) => {
    put(f, x, y, T.WINDOW, state);
    windows.push({ floor: f, x, y });
  };
  const addEntry = (kind, x, y, inside, outside) => {
    entries.push({ kind, floor: 0, x, y, inside, outside, state: stateAt(map, 0, x, y) });
  };

  // Note: front and back doors on the ground floor, matching windows upstairs.
  addDoor(0, gate, y1, r.weighted(FRONT_DOOR), false);
  addDoor(0, gate, y0, r.weighted(BACK_DOOR), false);
  addEntry('door', gate, y1, { x: gate, y: y1 - 1 }, { x: gate, y: y1 + 1 });
  addEntry('door', gate, y0, { x: gate, y: y0 + 1 }, { x: gate, y: y0 - 1 });
  keepFree(0, gate, y1 - 1);
  keepFree(0, gate, y0 + 1);
  if (stories === 2) {
    addWindow(1, gate, y1, r.weighted(WINDOWS));
    addWindow(1, gate, y0, r.weighted(WINDOWS));
  }

  const spotTaken = (f, wx, wy) => {
    for (let d = -1; d <= 1; d++) {
      for (const [nx, ny] of [[wx + d, wy], [wx, wy + d]]) {
        const t = tileAt(map, f, nx, ny);
        if (t === T.WINDOW || t === T.DOOR) return true;
      }
    }
    return false;
  };
  const outsideOf = (wx, wy) => (wy === y1 ? { x: wx, y: wy + 1 } : wy === y0 ? { x: wx, y: wy - 1 } : { x: wx + (wx === x0 ? -1 : 1), y: wy });

  const blocks = [
    { side: 'w', bx0: ix0, bx1: wwx - 1, wallX: wwx, extX: x0 },
    { side: 'e', bx0: ewx + 1, bx1: ix1, wallX: ewx, extX: x1 },
  ];
  legacyRooms();

  function legacyRooms() {
    const sideDoorY = r.chance(0.35) ? r.int(iy0 + 1, iy1 - 1) : -1;

    for (let f = 0; f < stories; f++) {
      for (const b of blocks) {
        const split = r.chance(legacy ? (f === 0 ? 0.75 : 0.6) : blueprint.split[f * 2 + (b.side === 'e' ? 1 : 0)]);
        const triple = split && b.side === 'e' && depth === 13 && ['hotel', 'boardinghouse', 'office'].includes(building) && r.chance(0.7);
        const partitions = triple ? [iy0 + 3, iy1 - 3] : split ? [r.int(iy0 + 4, iy1 - 4)] : [];
        const spans = [];
        let start = iy0;
        for (const row of partitions) {
          spans.push([start, row - 1]);
          start = row + 1;
          for (let x = b.bx0; x <= b.bx1; x++) put(f, x, row, T.PARTITION);
        }
        spans.push([start, iy1]);
        const made = spans.map(([ya, yb], i) => {
          const front = yb === iy1;
          const back = ya === iy0;
          const kinds = f === 0 ? blueprint.ground : blueprint.upper;
          const kind = legacy ? roomKind(r, f, b.side, front, back, split) : kinds[(b.side === 'e' ? 2 : 0) + (back && split ? 1 : 0)];
          const room = { id: rooms.length, floor: f, kind, x0: b.bx0, y0: ya, x1: b.bx1, y1: yb, side: b.side, front, back };
          rooms.push(room);
          return room;
        });
        // Note: a link door across the partition lets a room stay reachable behind a locked hall door.
        let linked = false;
        if (partitions.length === 1 && r.chance(0.55)) {
          const yp = partitions[0];
          const lx = r.int(b.bx0, b.bx1);
          addDoor(f, lx, yp, r.weighted(LINK_DOOR), true);
          keepFree(f, lx, yp - 1);
          keepFree(f, lx, yp + 1);
          linked = true;
        }
        let lockedBefore = false;
        for (const room of made) {
          const ys = [];
          for (let y = room.y0; y <= room.y1; y++) if (stories === 1 || b.side === 'e' || !flightRow(f, y)) ys.push(y);
          const dy = r.pick(ys);
          let state = r.weighted(HALL_DOOR);
          if (state === DS.LOCKED && (!linked || lockedBefore)) state = DS.CLOSED;
          if (state === DS.LOCKED) lockedBefore = true;
          if (!legacy && doors.length >= 3 && state !== DS.LOCKED && r.chance(blueprint.arches)) {
            put(f, b.wallX, dy, T.FLOOR);
            keepFree(f, b.wallX, dy);
            if (dy < room.y1 && (stories === 1 || b.side === 'e' || !flightRow(f, dy + 1)) && r.chance(0.55)) {
              put(f, b.wallX, dy + 1, T.FLOOR);
              keepFree(f, b.wallX, dy + 1);
              keepFree(f, b.side === 'w' ? b.wallX - 1 : b.wallX + 1, dy + 1);
            }
          } else addDoor(f, b.wallX, dy, state, true);
          keepFree(f, b.side === 'w' ? b.wallX - 1 : b.wallX + 1, dy);
        }
        if (f === 0 && b.side === 'e' && sideDoorY >= 0) {
          addDoor(0, x1, sideDoorY, r.weighted(SIDE_DOOR), false);
          addEntry('door', x1, sideDoorY, { x: x1 - 1, y: sideDoorY }, { x: x1 + 1, y: sideDoorY });
          keepFree(0, x1 - 1, sideDoorY);
        }
        for (const room of made) placeWindows(f, room, b);
      }
    }
  }

  function placeWindows(f, room, b) {
    const spots = [];
    for (let y = room.y0 + 1; y <= room.y1 - 1; y++) spots.push([b.extX, y, b.side === 'w' ? b.extX + 1 : b.extX - 1, y]);
    for (let x = room.x0 + 1; x <= room.x1 - 1; x++) {
      if (room.back) spots.push([x, y0, x, y0 + 1]);
      if (room.front) spots.push([x, y1, x, y1 - 1]);
    }
    r.shuffle(spots);
    windowsAt(f, spots, r.int(1, 2));
  }
  // Note: puts up to wanted windows on the shuffled spots, skipping taken ones and the cell beside the front door.
  function windowsAt(f, spots, wanted) {
    for (const [wx, wy, ix, iy] of spots) {
      if (wanted === 0) break;
      if (tileAt(map, f, wx, wy) !== ext) continue;
      if (!legacy && f === 0 && wx === x0 + 2 && wy === y1) continue;
      if (spotTaken(f, wx, wy)) continue;
      addWindow(f, wx, wy, r.weighted(WINDOWS));
      keepFree(f, ix, iy);
      if (f === 0) addEntry('window', wx, wy, { x: ix, y: iy }, outsideOf(wx, wy));
      wanted--;
    }
  }
  // Note: at least one ground-floor opening can be used without forcing.
  if (!entries.some((e) => usableEntry(map, e))) {
    const w = entries.find((e) => e.kind === 'window');
    if (w) {
      put(0, w.x, w.y, T.WINDOW, WS.CLOSED);
      w.state = WS.CLOSED;
    }
  }

  for (const room of rooms) if (room.kind !== 'hall') furnish(map, room, keep, r, put, legacy ? null : building);

  // Note: yard clutter gives outside cover; the validator rejects layouts it blocks.
  const clutter = [T.BARREL, T.CRATE, T.CACTUS];
  for (let i = 0, n = r.int(3, 7); i < n; i++) {
    const x = r.int(x0 - 6, x1 + 6);
    const y = r.int(y0 - 4, fenceY - 1);
    const near = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 2;
    const lane = x >= gate - 2 && x <= gate + 2 && y > y1;
    if (!near && !lane && tileAt(map, 0, x, y) === T.SAND) put(0, x, y, r.pick(clutter));
  }

  const spawn = {
    sheriff: { x: gate - 1 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    deputy: { x: gate + 1 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
  };
  // Note: five party slots outside the fence; slot 0 is the sheriff, slots 1 to 4 the deputies in party order.
  spawn.slots = [
    { ...spawn.sheriff },
    { ...spawn.deputy },
    { x: gate - 3 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    { x: gate + 3 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    { x: gate + 0.5, y: fenceY + 3 + 0.5, floor: 0 },
  ];
  const house = {
    kind: 'house', terrain: null,
    seed, style, building, stories, map,
    footprint: { x0, y0, x1, y1 },
    hall: { x0: hx0, y0: iy0, x1: hx1, y1: iy1 },
    rooms: rooms.map(({ id, floor, kind, x0: ax0, y0: ay0, x1: ax1, y1: ay1 }) => ({ id, floor, kind, x0: ax0, y0: ay0, x1: ax1, y1: ay1 })),
    stairs: stories === 2 ? { x: hx0, y: sy, run: { x: hx0, y: sy - 1 }, foot: { x: hx0, y: sy + 1 }, head: { x: hx0, y: sy - 2 } } : null,
    entries, doors, windows, spawn,
    hostiles: [], civilian: null, rumor: false,
    safe: (x, y) => {
      const dx = Math.max(x0 - x, 0, x - (x1 + 1));
      const dy = Math.max(y0 - y, 0, y - (y1 + 1));
      return Math.hypot(dx, dy) > SAFE_DIST;
    },
  };
  const spots = candidateCells(house, keep);
  house.hostiles = placeHostiles(r, spots, diff);
  placeCivilian(house, r, civ, spots, diff);
  return house;
}

function roomKind(r, f, side, front, back, split) {
  if (f === 1) return r.weighted([['bedroom', 0.7], ['study', 0.15], ['storage', 0.15]]);
  if (side === 'w') return front || !split ? 'parlor' : 'study';
  if (!split) return 'kitchen';
  return back ? 'kitchen' : r.weighted([['parlor', 0.6], ['storage', 0.4]]);
}

// Note: scratch of roomConnected; each call clears its marks.
const roomFree = new Uint8Array(MAP_W * MAP_H);
const roomQueue = new Int32Array(MAP_W * MAP_H);

// Note: free floor cells of a room must stay one connected group after each solid piece.
function roomConnected(map, f, room) {
  const { tile, state } = map.floors[f];
  let free = 0;
  let first = -1;
  for (let y = room.y0; y <= room.y1; y++) {
    for (let x = room.x0; x <= room.x1; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const i = y * MAP_W + x;
      // Note: the flight is no way across a room, so its cells count as taken.
      if (cellSolid(tile[i], state[i]) || isFlight(tile[i])) continue;
      roomFree[i] = 1;
      free++;
      if (first < 0) first = i;
    }
  }
  let reached = 0;
  if (free) {
    roomFree[first] = 0;
    roomQueue[reached++] = first;
    for (let q = 0; q < reached; q++) {
      const k = roomQueue[q];
      const kx = k % MAP_W;
      for (let d = 0; d < 4; d++) {
        const n = d === 0 ? k + 1 : d === 1 ? k - 1 : d === 2 ? k + MAP_W : k - MAP_W;
        if (n >= 0 && n < roomFree.length && roomFree[n] === 1 && Math.abs((n % MAP_W) - kx) <= 1) {
          roomFree[n] = 0;
          roomQueue[reached++] = n;
        }
      }
    }
  }
  // Note: clear the marks of unreached cells.
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) roomFree[y * MAP_W + x] = 0;
  return free > 0 && reached === free;
}

// Note: planned adds the EXTRA pieces of a large room; the earlier plans never pass it.
export function furnish(map, room, keep, r, put, building, planned = false) {
  const f = room.floor;
  const nextToWall = (x, y) => isWall(tileAt(map, f, x + 1, y)) || isWall(tileAt(map, f, x - 1, y)) || isWall(tileAt(map, f, x, y + 1)) || isWall(tileAt(map, f, x, y - 1));
  const cells = () => {
    const out = [];
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) if (tileAt(map, f, x, y) === T.FLOOR && !keep.has(cellKey(x, y, f))) out.push([x, y]);
    }
    return r.shuffle(out);
  };
  const place = (tile, hug) => {
    for (const [x, y] of cells()) {
      if (hug && !nextToWall(x, y)) continue;
      put(f, x, y, tile);
      if (!cellSolid(tile, 0) || roomConnected(map, f, room)) return true;
      put(f, x, y, T.FLOOR);
    }
    return false;
  };
  const accent = BUILDING_TILES[building];
  let accented = false;
  // Note: item 482: a planned chapel is arranged as a nave, the altar at the end away from the door and pews in rows across it with an aisle down the middle.
  if (planned && room.kind === 'chapel' && arrangeChapel(map, room, keep, put, accent && accent.room === 'chapel' ? accent.tile : T.COUNTER)) return;
  const pieces = [...PLAN[room.kind]];
  if (planned && EXTRA[room.kind]) {
    const sets = Math.min(4, Math.floor(((room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1)) / 16) - 1);
    for (let i = 0; i < sets; i++) pieces.push(...EXTRA[room.kind]);
  }
  for (const base of pieces) {
    const tile = !accented && accent && accent.room === room.kind && accent.base === base ? accent.tile : base;
    if (place(tile, HUGS.has(base)) || place(tile, false)) accented ||= tile !== base;
  }
  let furnished = false;
  for (let y = room.y0; y <= room.y1 && !furnished; y++) for (let x = room.x0; x <= room.x1; x++) if (isProp(tileAt(map, f, x, y))) furnished = true;
  if (!furnished) place(T.CRATE, false);
}

// Note: lays out a chapel: the long axis runs away from the room's door, the altar stands centred at the far end, pews fill every second row toward the door leaving the middle aisle and a gap at each wall; each piece stays only while the room stays connected; returns false when the room is too small.
function arrangeChapel(map, room, keep, put, altar) {
  const f = room.floor;
  const w = room.x1 - room.x0 + 1;
  const h = room.y1 - room.y0 + 1;
  if (Math.max(w, h) < 5 || Math.min(w, h) < 3) return false;
  const alongX = w >= h;
  // Note: the doors in the room's rim decide which end is the entrance.
  let dsum = 0;
  let dn = 0;
  for (let y = room.y0 - 1; y <= room.y1 + 1; y++) for (let x = room.x0 - 1; x <= room.x1 + 1; x++) {
    if (tileAt(map, f, x, y) !== T.DOOR) continue;
    dsum += alongX ? x - (room.x0 + room.x1) / 2 : y - (room.y0 + room.y1) / 2;
    dn++;
  }
  const altarAtLow = dn ? dsum > 0 : true;
  const len = alongX ? w : h;
  const span = alongX ? h : w;
  const cell = (u, v) => (alongX ? [altarAtLow ? room.x0 + u : room.x1 - u, room.y0 + v] : [room.x0 + v, altarAtLow ? room.y0 + u : room.y1 - u]);
  const free = (x, y) => tileAt(map, f, x, y) === T.FLOOR && !keep.has(cellKey(x, y, f));
  const tryPut = (x, y, tile) => {
    if (!free(x, y)) return false;
    put(f, x, y, tile);
    if (roomConnected(map, f, room)) return true;
    put(f, x, y, T.FLOOR);
    return false;
  };
  const mid = (span - 1) / 2;
  let placed = tryPut(...cell(0, Math.floor(mid)), altar);
  if (!placed && span % 2 === 0) placed = tryPut(...cell(0, Math.ceil(mid)), altar);
  let pews = 0;
  for (let u = 2; u < len - 1; u += 2) {
    // Note: a narrow nave puts its pews against the side walls; a wide one leaves a gap at each wall.
    for (let v = span >= 5 ? 1 : 0; v < (span >= 5 ? span - 1 : span); v++) {
      if (Math.abs(v - mid) < 1) continue;
      if (tryPut(...cell(u, v), T.SOFA)) pews++;
    }
  }
  return placed && pews > 0;
}

// Note: cells where a hostile or civilian may start: open floor, away from entries and every flight.
export function candidateCells(house, keep) {
  const { map, rooms, entries } = house;
  const flights = house.flights || (house.stairs ? [house.stairs] : []);
  const out = [];
  for (const room of rooms) {
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) {
        const t = tileAt(map, room.floor, x, y);
        if (t !== T.FLOOR && t !== T.RUG) continue;
        if (keep.has(cellKey(x, y, room.floor))) continue;
        if (flights.some((fl) => Math.max(Math.abs(x - fl.x), Math.abs(y - fl.y)) <= 1)) continue;
        if (room.floor === 0 && entries.some((e) => e.kind === 'door' && Math.max(Math.abs(x - e.inside.x), Math.abs(y - e.inside.y)) < 3)) continue;
        out.push({ x, y, floor: room.floor, room: room.id });
      }
    }
  }
  return out;
}

// Note: how many hostiles a site holds; the default draw is fixed, a difficulty draws uniformly from its range.
export function hostileCount(r, diff) {
  if (!diff || !diff.count) return Math.min(HOSTILE_MAX, Math.max(HOSTILE_MIN, r.weighted([[3, 0.2], [4, 0.3], [5, 0.3], [6, 0.2]])));
  const [lo, hi] = hostileRange(diff);
  return lo === hi ? lo : r.int(lo, hi);
}

export function placeHostiles(r, spots, diff) {
  const n = hostileCount(r, diff);
  const roomIds = r.shuffle([...new Set(spots.map((c) => c.room))]);
  const picked = [];
  const perRoom = new Map();
  // Note: above the first storey a hostile is spread over all upper storeys.
  const top = spots.reduce((m, c) => Math.max(m, c.floor), 0);
  for (let i = 0; i < n; i++) {
    const wantFloor = r.chance(0.55) ? 0 : top > 1 ? r.int(1, top) : 1;
    const pool = spots.filter((c) => c.floor === wantFloor);
    const ordered = roomIds.slice(i % roomIds.length).concat(roomIds.slice(0, i % roomIds.length));
    let cell = null;
    for (const strict of [true, false]) {
      for (const id of ordered) {
        if ((perRoom.get(id) || 0) >= 2) continue;
        const cands = (strict ? pool : spots).filter((c) => c.room === id && picked.every((p) => p.floor !== c.floor || Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= 3));
        if (cands.length) {
          cell = r.pick(cands);
          break;
        }
      }
      if (cell) break;
    }
    if (!cell) cell = r.pick(spots);
    perRoom.set(cell.room, (perRoom.get(cell.room) || 0) + 1);
    picked.push(cell);
  }
  return picked.map((c) => makeHostile(r, c, diff));
}

// Note: c is { x, y, floor } in cell coordinates, the hostile stands at the cell centre, and house and outdoor sites share this.
export function makeHostile(r, c, diff) {
  const w = diff && diff.experience ? diff.experience : [0.3, 0.5, 0.2];
  const experience = r.weighted([['green', w[0]], ['seasoned', w[1]], ['veteran', w[2]]]);
  const nerve = experience === 'green' ? r.range(0.2, 0.5) : experience === 'seasoned' ? r.range(0.4, 0.8) : r.range(0.7, 1);
  const loadout = r.weighted(LOADOUTS).map((w) => ({ ...w }));
  const reserve = { '44-40': 0, '45colt': 0 };
  for (const w of loadout) reserve[w.ammoType] += w.id === 'winchester73' ? r.int(6, 20) : r.int(6, 18);
  return {
    x: c.x + 0.5, y: c.y + 0.5, floor: c.floor,
    facing: r.range(-Math.PI, Math.PI),
    habit: r.weighted([['stand', 0.45], ['sit', 0.3], ['pace', 0.25]]),
    experience, nerve, loadout, reserve,
  };
}

// Note: the civilian draw in a fixed order (present, kind, rumour), from the site's own civilian stream.
export function rollCivilian(civ, chance = CIVILIAN_CHANCE) {
  const present = civ.chance(chance);
  const kind = civ.weighted([['woman', 0.45], ['man', 0.35], ['boy', 0.2]]);
  const rumor = present ? civ.chance(0.8) : civ.chance(0.06);
  return { present, kind, rumor };
}

export function placeCivilian(house, r, civ, spots, diff) {
  const { present, kind, rumor } = rollCivilian(civ, diff && diff.civilianChance != null ? diff.civilianChance : CIVILIAN_CHANCE);
  house.rumor = rumor;
  if (!present) return;
  const free = spots.filter((c) => house.hostiles.every((h) => h.floor !== c.floor || Math.abs(Math.floor(h.x) - c.x) + Math.abs(Math.floor(h.y) - c.y) >= 3));
  const c = r.pick(free.length ? free : spots);
  house.civilian = { x: c.x + 0.5, y: c.y + 0.5, floor: c.floor, kind };
}

export const usableEntry = (map, e) => {
  const state = stateAt(map, 0, e.x, e.y);
  return e.kind === 'door' ? state !== DS.LOCKED : state !== WS.BOLTED;
};

// Note: the flights of a house, lowest first; a house that names only its stairs has that one flight from the ground floor.
export const flightsOfHouse = (house) => house.flights || (house.stairs ? [{ lo: 0, ...house.stairs }] : []);

export function validateHouse(house, range = [HOSTILE_MIN, HOSTILE_MAX]) {
  const problems = [];
  const { map, rooms } = house;
  const flights = flightsOfHouse(house);
  const stories = house.stories || 2;
  // Note: a single storey keeps an empty upper floor for the drop; n storeys have n floors.
  if (map.floors.length !== Math.max(2, stories)) problems.push(stories <= 2 ? 'needs two floors' : `needs ${stories} floors`);
  if (flights.length) for (const fl of flights) validateFlight(map, fl, problems);
  if (stories === 1 && (flights.length || !map.floors[1].tile.every((tile) => tile === T.DROP))) problems.push('a single-storey building needs an empty upper floor');
  if (stories > 1 && !flights.length) problems.push('a single-storey building needs an empty upper floor');
  // Note: item 483: every upper storey has a flight down to the storey below it, so a route reaches the ground.
  for (let f = 1; f < stories && flights.length; f++) if (!flights.some((fl) => fl.lo + 1 === f)) problems.push(`no flight up to floor ${f}`);
  for (const what of house.unplaced || []) problems.push(`missing ${what}`);
  if (!house.doors.length) problems.push('no doors');
  if (!house.windows.length) problems.push('no windows');
  if (house.hostiles.length < range[0] || house.hostiles.length > range[1]) problems.push('hostile count out of range');
  for (const room of rooms) {
    if (room.kind === 'hall') continue;
    let furnished = false;
    for (let y = room.y0; y <= room.y1 && !furnished; y++) for (let x = room.x0; x <= room.x1; x++) if (isProp(tileAt(map, room.floor, x, y))) furnished = true;
    if (!furnished) problems.push(`room ${room.id} is bare`);
  }
  if (!house.entries.some((e) => usableEntry(map, e))) problems.push('no unforced ground entry');
  const starts = [house.spawn.sheriff, house.spawn.deputy, ...(house.spawn.slots || [])].map((p) => ({ x: p.x, y: p.y, f: 0 }));
  for (const p of starts) if (cellSolid(tileAt(map, 0, Math.floor(p.x), Math.floor(p.y)), 0)) problems.push('spawn blocked');
  if (house.spawn.slots && house.spawn.slots.length !== 5) problems.push('needs five spawn slots');
  const seen = reachableMask(map, starts, { force: false, windows: true });
  const need = (x, y, f, what) => {
    if (seen[cellKey(Math.floor(x), Math.floor(y), f)] !== 1) problems.push(`${what} unreachable at ${Math.floor(x)},${Math.floor(y)},${f}`);
  };
  for (const room of rooms) {
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) {
        const t = tileAt(map, room.floor, x, y);
        if (!isFlight(t) && !cellSolid(t, stateAt(map, room.floor, x, y))) need(x, y, room.floor, `room ${room.id}`);
      }
    }
  }
  for (const fl of flights) {
    need(fl.foot.x, fl.foot.y, fl.lo, 'foot landing');
    need(fl.head.x, fl.head.y, fl.lo + 1, 'head landing');
  }
  for (const h of house.hostiles) need(h.x, h.y, h.floor, 'hostile');
  if (house.civilian) need(house.civilian.x, house.civilian.y, house.civilian.floor, 'civilian');
  return { ok: problems.length === 0, problems };
}

// Note: a flight is closed on its long sides (its wall side solid, its open side railed) and at its far ends, and both landings are open floor; walking is the only way up.
function validateFlight(map, fl, problems) {
  const lo = fl.lo ?? 0;
  const hi = lo + 1;
  if (hi >= map.floors.length) {
    problems.push(`no floor above the flight from floor ${lo}`);
    return;
  }
  const solid = (f, x, y) => cellSolid(tileAt(map, f, x, y), stateAt(map, f, x, y));
  const open = (f, x, y) => {
    const t = tileAt(map, f, x, y);
    return (t === T.FLOOR || t === T.RUG) && !solid(f, x, y);
  };
  const [wallDx, wallName, railName] = fl.wall === 'e' ? [1, 'east', 'west'] : [-1, 'west', 'east'];
  for (const f of [lo, hi]) {
    if (tileAt(map, f, fl.x, fl.y) !== T.STAIRS) problems.push(`no stairs on floor ${f}`);
    if (tileAt(map, f, fl.run.x, fl.run.y) !== T.RUN) problems.push(`no stair run on floor ${f}`);
    for (const y of [fl.y, fl.run.y]) {
      if (!solid(f, fl.x + wallDx, y)) problems.push(`flight ${wallName} side open on floor ${f}`);
      if (tileAt(map, f, fl.x - wallDx, y) !== T.RAIL) problems.push(`flight ${railName} side open on floor ${f}`);
    }
  }
  if (!open(lo, fl.foot.x, fl.foot.y)) problems.push(`foot landing blocked on floor ${lo}`);
  if (!open(hi, fl.head.x, fl.head.y)) problems.push(`head landing blocked on floor ${hi}`);
  if (tileAt(map, lo, fl.head.x, fl.head.y) !== T.RAIL) problems.push(`flight not closed at its head on floor ${lo}`);
  if (tileAt(map, hi, fl.foot.x, fl.foot.y) !== T.RAIL) problems.push(`flight not closed at its foot on floor ${hi}`);
}
