// Note: items 477, 482 and 483: planned tactical buildings of every type, each a program of recognizable spaces laid out by one of several schemes on one to four storeys joined by switchback flights.

import { rng, seedFromString } from './rand.js';
import { MAP_W, SAFE_DIST } from './config.js';
import { T, DS, WS } from './tiles.js';
import { makeMap, newFloor, setTile, tileAt, stateAt } from './map.js';
import { cellKey } from './nav.js';
import { regionalLook } from './regional-look.js';
import { furnish, candidateCells, placeHostiles, placeCivilian, usableEntry } from './house.js';

// Note: the share of sites drawn modest whatever the case difficulty, so a hard case does not always mean a big, complex or fortified building (item 477).
export const MODEST_SHARE = 0.2;
const MODEST_SCALE = 0.35;

const FRONT_DOOR = [[DS.CLOSED, 0.5], [DS.LOCKED, 0.3], [DS.OPEN, 0.2]];
const BACK_DOOR = [[DS.LOCKED, 0.5], [DS.CLOSED, 0.35], [DS.OPEN, 0.15]];
const SIDE_DOOR = [[DS.LOCKED, 0.45], [DS.CLOSED, 0.5], [DS.OPEN, 0.05]];
const WINDOWS = [[WS.CLOSED, 0.42], [WS.BOLTED, 0.43], [WS.OPEN, 0.1], [WS.BROKEN, 0.05]];

// Note: rooms that go to the smallest free space of a floor, such as a vault or a tack room.
const SMALL = new Set(['vault', 'records', 'tackroom', 'assay', 'vestry']);
// Note: rooms without windows.
const BLIND = new Set(['vault']);

// Note: signature rooms that must be the ground floor's big room in a hall plan.
const BIG_PUBLIC = new Set(['saloon', 'bank']);

// Note: one program variant; schemes are weighted layout plans, public is the signature room, need0, needSingle and needUp list the rooms (or alternatives) every instance holds on the ground floor, a single storey and every upper storey.
const program = (o) => ({ w: 1, wide: false, porch: true, ell: 0.2, loft: false, split: 0.6, arches: 0.25, double: false, yard: [T.BARREL, T.CRATE, T.CACTUS], needUp: [], ...o });

// Note: item 482: every required type and its variants; storeys(cx) gives the storey weights at complexity cx.
export const PROGRAMS = {
  house: [program({ id: 'home', schemes: [['hall', 0.45], ['side', 0.35], ['open', 0.2]], public: 'parlor',
    ground: ['parlor', 'kitchen', 'dining', 'study', 'storage'], need0: ['parlor', 'kitchen'],
    single: ['parlor', 'kitchen', 'bedroom', 'bedroom', 'storage'], needSingle: ['parlor', 'kitchen', 'bedroom'],
    upper: ['bedroom', 'bedroom', 'study', 'storage'], needUp: ['bedroom'],
    storeys: (cx) => [[1, 0.35 - 0.25 * cx], [2, 0.6], [3, 0.03 + 0.25 * cx]], ell: 0.4, split: 0.75, arches: 0.1 })],
  saloon: [program({ id: 'saloon', schemes: [['front', 0.55], ['open', 0.25], ['hall', 0.2]], public: 'saloon',
    ground: ['kitchen', 'storage', 'cardroom', 'office'], need0: ['saloon', ['storage', 'kitchen', 'cardroom']],
    upper: ['bedroom', 'bedroom', 'bunkroom', 'storage', 'cardroom'], needUp: ['bedroom'],
    storeys: (cx) => [[1, 0.3 - 0.2 * cx], [2, 0.6], [3, 0.05 + 0.3 * cx]], wide: true, arches: 0.45, yard: [T.POST, T.BARREL, T.BARREL, T.CRATE] })],
  hotel: [program({ id: 'hotel', schemes: [['hall', 0.45], ['front', 0.4], ['side', 0.15]], public: 'lobby',
    ground: ['dining', 'kitchen', 'parlor', 'office', 'storage'], need0: ['lobby', ['dining', 'kitchen', 'parlor']],
    single: ['dining', 'kitchen', 'guestroom', 'guestroom'], needSingle: ['lobby', 'guestroom'],
    upper: ['guestroom'], needUp: ['guestroom', 'guestroom'],
    storeys: (cx) => [[2, 0.7 - 0.3 * cx], [3, 0.25 + 0.4 * cx], [4, 0.1 * cx]], ell: 0.3, split: 0.9, arches: 0.2, yard: [T.POST, T.BARREL, T.CRATE] })],
  store: [program({ id: 'store', schemes: [['front', 0.55], ['open', 0.3], ['side', 0.15]], public: 'shop',
    ground: ['stockroom', 'office', 'storage'], need0: ['shop', 'stockroom'],
    upper: ['bedroom', 'study', 'storage', 'stockroom'],
    storeys: (cx) => [[1, 0.5 - 0.35 * cx], [2, 0.45], [3, 0.05 + 0.1 * cx]], wide: true, arches: 0.4, yard: [T.BARREL, T.CRATE, T.CRATE, T.POST] })],
  bank: [program({ id: 'bank', schemes: [['front', 0.5], ['side', 0.3], ['hall', 0.2]], public: 'bank',
    ground: ['office', 'records', 'storage'], need0: ['bank', 'vault'],
    upper: ['office', 'records', 'study', 'bedroom'], needUp: ['office'],
    storeys: (cx) => [[1, 0.4 - 0.3 * cx], [2, 0.5], [3, 0.1 + 0.2 * cx]], wide: true, ell: 0.15, yard: [T.POST, T.BARREL] })],
  boardinghouse: [program({ id: 'boardinghouse', schemes: [['hall', 0.6], ['side', 0.4]], public: 'parlor',
    ground: ['parlor', 'dining', 'kitchen', 'storage'], need0: ['dining', 'kitchen'],
    single: ['dining', 'kitchen', 'bunkroom', 'bedroom'], needSingle: ['dining', 'kitchen', 'bedroom'],
    upper: ['bedroom', 'bunkroom'], needUp: ['bedroom'],
    storeys: (cx) => [[1, 0.1], [2, 0.65], [3, 0.15 + 0.3 * cx]], ell: 0.35, split: 0.85, arches: 0.2 })],
  warehouse: [program({ id: 'warehouse', schemes: [['open', 0.6], ['front', 0.4]], public: 'warehouse',
    ground: ['loading', 'office', 'storage', 'stockroom'], need0: ['warehouse', 'loading'],
    upper: ['storage', 'stockroom', 'office', 'bunkroom'], needUp: ['storage'],
    storeys: (cx) => [[1, 0.55 - 0.35 * cx], [2, 0.4], [3, 0.05 + 0.2 * cx]], wide: true, loft: true, double: true, arches: 0.5, yard: [T.WAGON, T.FREIGHT_CRATE, T.CRATE, T.BARREL] })],
  office: [program({ id: 'office', schemes: [['side', 0.45], ['hall', 0.35], ['front', 0.2]], public: 'office',
    ground: ['office', 'records', 'study', 'storage'], need0: ['office', 'records'],
    upper: ['office', 'records', 'study', 'bedroom'], needUp: ['office'],
    storeys: (cx) => [[1, 0.45 - 0.3 * cx], [2, 0.45], [3, 0.1 + 0.15 * cx]], ell: 0.3, split: 0.85, arches: 0.15, yard: [T.POST, T.BARREL, T.TELEGRAPH_POLE] })],
  church: [program({ id: 'church', schemes: [['open', 0.5], ['front', 0.5]], public: 'chapel',
    ground: ['vestry', 'storage', 'study'], need0: ['chapel', 'vestry'],
    upper: ['loft', 'storage'], needUp: ['loft'],
    storeys: (cx) => [[1, 0.65], [2, 0.3], [3, 0.05 + 0.1 * cx]], wide: true, loft: true, arches: 0.4, yard: [T.GRAVE_MARKER, T.GRAVE_MARKER, T.GRAVE_MARKER, T.CACTUS] })],
  blacksmith: [program({ id: 'smithy', schemes: [['open', 0.6], ['front', 0.4]], public: 'forge',
    ground: ['stockroom', 'storage', 'office'], need0: ['forge', ['stockroom', 'storage']],
    upper: ['storage', 'bunkroom', 'bedroom'],
    storeys: () => [[1, 0.6], [2, 0.4]], wide: true, loft: true, double: true, arches: 0.35, yard: [T.WAGON, T.BARREL, T.CRATE] })],
  workshop: [program({ id: 'workshop', schemes: [['open', 0.5], ['front', 0.35], ['side', 0.15]], public: 'workroom',
    ground: ['stockroom', 'office', 'storage'], need0: ['workroom', ['stockroom', 'storage']],
    upper: ['storage', 'bedroom', 'workroom'],
    storeys: (cx) => [[1, 0.5], [2, 0.45], [3, 0.05 + 0.1 * cx]], wide: true, loft: true, double: true, arches: 0.35, yard: [T.WAGON, T.CRATE, T.BARREL] })],
  ranch: [
    program({ id: 'barn', schemes: [['open', 0.7], ['front', 0.3]], public: 'barn',
      ground: ['tackroom', 'feedroom', 'storage'], need0: ['barn', ['tackroom', 'feedroom']],
      upper: ['hayloft', 'storage'], needUp: ['hayloft'],
      storeys: () => [[1, 0.35], [2, 0.6], [3, 0.05]], wide: true, loft: true, porch: false, double: true, arches: 0.5, yard: [T.FENCE, T.FENCE, T.FENCE, T.TROUGH, T.HAY_STACK] }),
    program({ id: 'bunkhouse', schemes: [['hall', 0.4], ['side', 0.4], ['open', 0.2]], public: 'bunkroom',
      ground: ['bunkroom', 'kitchen', 'dining', 'storage'], need0: ['bunkroom', 'kitchen'],
      single: ['bunkroom', 'kitchen', 'dining', 'storage'], needSingle: ['bunkroom', 'kitchen'],
      upper: ['bunkroom', 'bedroom', 'storage'], needUp: ['bunkroom'],
      storeys: () => [[1, 0.55], [2, 0.45]], ell: 0.3, yard: [T.FENCE, T.TROUGH, T.BARREL, T.HAY_STACK] }),
  ],
  mine: [
    program({ id: 'mill', schemes: [['open', 0.6], ['front', 0.4]], public: 'millroom',
      ground: ['equipment', 'assay', 'office', 'storage'], need0: ['millroom', ['equipment', 'assay']],
      upper: ['millroom', 'equipment', 'storage', 'bunkroom'], needUp: ['millroom'],
      storeys: (cx) => [[1, 0.3], [2, 0.45], [3, 0.25 + 0.2 * cx]], wide: true, porch: false, double: true, arches: 0.4, yard: [T.TAILINGS, T.TAILINGS, T.WAGON, T.BARREL] }),
    program({ id: 'hoist', schemes: [['open', 0.7], ['side', 0.3]], public: 'hoist',
      ground: ['equipment', 'office', 'storage'], need0: ['hoist', 'equipment'],
      upper: ['equipment', 'storage', 'bunkroom'],
      storeys: () => [[1, 0.5], [2, 0.5]], porch: false, double: true, arches: 0.4, yard: [T.TAILINGS, T.WAGON, T.CRATE] }),
    program({ id: 'minebunks', schemes: [['hall', 0.5], ['side', 0.5]], public: 'bunkroom',
      ground: ['bunkroom', 'kitchen', 'storage'], need0: ['bunkroom', 'kitchen'],
      single: ['bunkroom', 'kitchen', 'storage'], needSingle: ['bunkroom', 'kitchen'],
      upper: ['bunkroom', 'storage'], needUp: ['bunkroom'],
      storeys: () => [[1, 0.4], [2, 0.5], [3, 0.1]], ell: 0.3, yard: [T.TAILINGS, T.BARREL, T.CRATE] }),
  ],
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Note: diff carries building, complexity and optionally stories (1 to 4), scheme, variant and modest to pin a draw; s is the attempt seed.
export function buildPlanned(seed, s, diff) {
  const r = rng(s);
  const civ = rng(seedFromString(`${seed}:civilian`));
  const building = diff.building || 'house';
  const variants = PROGRAMS[building];
  const prog = variants.find((v) => v.id === diff.variant) || r.weighted(variants.map((v) => [v, v.w]));
  const modest = typeof diff.modest === 'boolean' ? diff.modest : rng(seedFromString(`${seed}:modest`)).chance(MODEST_SHARE);
  const cx = clamp01(diff.complexity) * (modest ? MODEST_SCALE : 1);
  let stories = [1, 2, 3, 4].includes(diff.stories) ? diff.stories : r.weighted(prog.storeys(cx).map(([n, w]) => [n, Math.max(0, w)]));
  if (stories === 1 && !diff.allowSingleStory && diff.stories !== 1) stories = 2;
  const scheme = ['hall', 'side', 'open', 'front'].includes(diff.scheme) ? diff.scheme : r.weighted(prog.schemes);

  const look = regionalLook(diff.region);
  const style = r.chance(look.building.share) ? 'adobe' : 'frame';
  const ext = style === 'adobe' ? T.ADOBE : T.FRAME;
  const width = r.int(Math.min(30, (prog.wide ? 18 : 15) + Math.round(9 * cx)), Math.min(30, (prog.wide ? 21 : 18) + Math.round(12 * cx)));
  let depth = r.int(9 + Math.round(4 * cx), 11 + Math.round(5 * cx));
  if (stories >= 3) depth = Math.max(depth, 12);
  if (scheme === 'front') depth = Math.max(depth, 10);
  const x0 = Math.floor((MAP_W - width) / 2) + r.int(-2, 2);
  const y0 = Math.min(6 + r.int(0, 1), 22 - depth);
  const x1 = x0 + width - 1;
  const y1 = y0 + depth - 1;
  const ix0 = x0 + 1;
  const ix1 = x1 - 1;
  const iy0 = y0 + 1;
  const iy1 = y1 - 1;
  const rows = iy1 - iy0 + 1;
  const inner = ix1 - ix0 + 1;
  const fenceY = y1 + 4;

  const map = makeMap(Array.from({ length: Math.max(2, stories) }, (_, f) => newFloor(f === 0 ? T.SAND : T.DROP)));
  if (!look.base) {
    map.region = look.id;
    map.material = look.building.massive;
  }
  map.art = { kind: 'building', theme: building, x: x0, y: y0, width, height: depth, porch: prog.porch ? 2 : 0 };
  const put = (f, x, y, tile, state = 0) => setTile(map, f, x, y, tile, state);
  const keep = new Set();
  const keepFree = (f, x, y) => keep.add(cellKey(x, y, f));
  const rooms = [];
  const edges = [];
  const doors = [];
  const windows = [];
  const entries = [];
  const unplaced = [];
  const lockP = 0.06 + 0.3 * cx;
  const hallStates = [[DS.CLOSED, 0.66], [DS.OPEN, 0.16], [DS.LOCKED, lockP]];
  const linkStates = [[DS.CLOSED, 0.7], [DS.OPEN, 0.3], [DS.LOCKED, lockP]];
  const addRoom = (f, kind, rx0, ry0, rx1, ry1) => {
    const room = { id: rooms.length, floor: f, kind, x0: rx0, y0: ry0, x1: rx1, y1: ry1 };
    rooms.push(room);
    return room;
  };

  // Note: the stair column holds every flight; in the hall scheme it is the central hall, otherwise three cells along one end wall.
  let hx0;
  let blocksOf;
  const colSide = r.chance(0.5) ? 'w' : 'e';
  if (scheme === 'hall') {
    const avail = inner - 5;
    const minWest = prog.wide ? 7 : 4;
    const westW = r.int(Math.max(minWest, Math.round(avail * 0.3)), Math.max(minWest, Math.min(avail - 4, Math.round(avail * 0.7))));
    hx0 = ix0 + westW + 1;
  } else hx0 = colSide === 'w' ? ix0 : ix1 - 2;
  const fx = scheme === 'hall' || colSide === 'w' ? hx0 : ix1;
  const railX = scheme === 'hall' || colSide === 'w' ? fx + 1 : fx - 1;

  // Note: the front plan has its public room across the whole front, the flight of the ground floor inside it.
  const stripRows = scheme === 'front' ? r.int(3, Math.max(3, Math.min(6, rows - 5))) : 0;
  const ps = iy0 + stripRows + 1;
  // Note: flights alternate between two disjoint row bands of the column, so storeys stack as a switchback.
  let syA;
  let syB = null;
  if (scheme === 'front') {
    syA = r.int(ps + 2, iy1 - 1);
    if (stories >= 3) syB = r.int(iy0 + 2, syA - 4);
  } else if (stories >= 3) {
    const north = scheme === 'hall' ? iy0 + r.int(2, Math.min(4, rows - 6)) : r.int(iy0 + 2, iy1 - 5);
    const south = r.int(north + 4, iy1 - 1);
    [syA, syB] = scheme === 'hall' || r.chance(0.5) ? [north, south] : [south, north];
  } else syA = scheme === 'hall' ? iy0 + r.int(2, 4) : r.int(iy0 + 2, iy1 - 1);
  const flights = [];
  for (let lo = 0; lo + 1 < stories; lo++) {
    const sy = lo % 2 === 0 ? syA : syB;
    flights.push({ lo, x: fx, y: sy, run: { x: fx, y: sy - 1 }, foot: { x: fx, y: sy + 1 }, head: { x: fx, y: sy - 2 }, wall: railX > fx ? 'w' : 'e' });
  }

  // Note: an ell footprint cuts a rear corner off one block, on every storey.
  const notchable = scheme === 'hall' || scheme === 'side';
  let notch = null;
  if (notchable && rows >= 8 && r.chance(prog.ell * (0.5 + cx))) {
    const nd = r.int(3, Math.max(3, Math.min(rows - 5, Math.floor(rows * 0.45))));
    const west = scheme === 'hall' ? r.chance(0.5) : colSide === 'e';
    const wallX = scheme === 'hall' ? (west ? hx0 - 1 : hx0 + 3) : west ? hx0 - 1 : hx0 + 3;
    notch = west ? { x0, x1: wallX - 1, y0, y1: y0 + nd - 1, wallX, side: 'w' } : { x0: wallX + 1, x1, y0, y1: y0 + nd - 1, wallX, side: 'e' };
  }
  const inNotch = (x, y) => !!notch && x >= notch.x0 && x <= notch.x1 && y >= notch.y0 && y <= notch.y1;
  const inFoot = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && !inNotch(x, y);

  // Note: the shell of every storey, the notch cut out and walled.
  for (let f = 0; f < stories; f++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inNotch(x, y)) continue;
        put(f, x, y, x === x0 || x === x1 || y === y0 || y === y1 ? ext : T.FLOOR);
      }
    }
    if (notch) {
      for (let x = Math.min(notch.x0, notch.wallX); x <= Math.max(notch.x1, notch.wallX); x++) put(f, x, notch.y1 + 1, ext);
      for (let y = y0; y <= notch.y1 + 1; y++) put(f, notch.wallX, y, ext);
    }
  }
  if (prog.porch) {
    for (let x = x0; x <= x1; x++) for (let y = y1 + 1; y <= y1 + 2; y++) put(0, x, y, T.PORCH);
    put(0, x0, y1 + 2, T.POST);
    put(0, x1, y1 + 2, T.POST);
  }

  for (const fl of flights) {
    for (const f of [fl.lo, fl.lo + 1]) {
      put(f, fl.x, fl.y, T.STAIRS);
      put(f, fl.x, fl.y - 1, T.RUN);
      put(f, railX, fl.y, T.RAIL);
      put(f, railX, fl.y - 1, T.RAIL);
      put(f, fl.x, f === fl.lo ? fl.y - 2 : fl.y + 1, T.RAIL);
    }
    keepFree(fl.lo, fl.x, fl.y + 1);
    keepFree(fl.lo + 1, fl.x, fl.y - 2);
  }
  const open = (f, x, y) => {
    const t = tileAt(map, f, x, y);
    return t === T.FLOOR || t === T.RUG;
  };

  // Note: n cells split into k runs of at least three cells with one wall cell between runs.
  const cuts = (n, k) => {
    const sizes = new Array(k).fill(3);
    for (let i = n - (k - 1) - 3 * k; i > 0; i--) sizes[r.int(0, k - 1)]++;
    return sizes;
  };

  // Note: a block of rooms beside a spine room, behind the partition at wallX; rooms are stacked rows or sit either side of a side hall.
  function block(f, spine, b, maxRooms = Infinity, corridors = true, minRooms = 1) {
    const bw = b.bx1 - b.bx0 + 1;
    const brows = b.by1 - b.by0 + 1;
    const toSpine = b.side === 'w' ? 1 : -1;
    for (let y = b.by0; y <= b.by1; y++) put(f, b.wallX, y, T.PARTITION);
    const doorRow = (y) => open(f, b.wallX + toSpine, y);
    const anyDoorRow = (ya, yb) => {
      for (let y = ya; y <= yb; y++) if (doorRow(y)) return true;
      return false;
    };
    const inside = (y) => ({ x: b.wallX - toSpine, y });
    const made = [];
    const spineDoor = (to, ya, yb) => {
      const ys = [];
      for (let y = ya; y <= yb; y++) if (doorRow(y)) ys.push(y);
      if (!ys.length) return;
      const y = r.pick(ys);
      edges.push({ f, x: b.wallX, y, a: spine.id, b: to.id, state: r.chance(prog.arches) ? 'arch' : r.weighted(hallStates), free: [inside(y), { x: b.wallX + toSpine, y }] });
    };
    let corridor = -1;
    if (corridors && bw >= 7 && brows >= 10 && r.chance(Math.min(0.85, Math.max(0, 1.6 * cx - 0.6)))) {
      const a = r.int(b.by0 + 4, b.by1 - 5);
      if (anyDoorRow(a, a + 1)) corridor = a;
    }
    if (corridor < 0) {
      let k = Math.min(maxRooms, Math.floor((brows + 1) / 4), Math.max(minRooms, Math.round(0.6 + 0.8 * prog.split + 2.2 * cx + r.range(-0.5, 0.5))));
      let spans = [];
      for (; k >= 1; k--) {
        spans = [];
        let y = b.by0;
        for (const n of cuts(brows, k)) {
          spans.push([y, y + n - 1]);
          y += n + 1;
        }
        if (spans.every(([ya, yb]) => anyDoorRow(ya, yb))) break;
      }
      spans.forEach(([ya, yb], i) => {
        if (i > 0) for (let x = b.bx0; x <= b.bx1; x++) put(f, x, ya - 1, T.PARTITION);
        made.push(addRoom(f, null, b.bx0, ya, b.bx1, yb));
      });
      made.forEach((room, i) => {
        spineDoor(room, room.y0, room.y1);
        if (i > 0 && r.chance(0.35 + 0.4 * cx)) {
          const x = r.int(b.bx0, b.bx1);
          const yp = room.y0 - 1;
          edges.push({ f, x, y: yp, a: made[i - 1].id, b: room.id, state: r.weighted(linkStates), free: [{ x, y: yp - 1 }, { x, y: yp + 1 }] });
        }
      });
    } else {
      const a = corridor;
      const side = addRoom(f, 'hall', b.bx0, a, b.bx1, a + 1);
      for (let x = b.bx0; x <= b.bx1; x++) {
        put(f, x, a - 1, T.PARTITION);
        put(f, x, a + 2, T.PARTITION);
      }
      spineDoor(side, a, a + 1);
      for (const [sy0, sy1, wallY] of [[b.by0, a - 2, a - 1], [a + 3, b.by1, a + 2]]) {
        const m = Math.min(Math.floor((bw + 1) / 4), Math.max(1, Math.round(1 + (2 * cx * bw) / 12 + r.range(-0.5, 0.5))));
        const section = [];
        let x = b.bx0;
        cuts(bw, m).forEach((n, i) => {
          if (i > 0) for (let y = sy0; y <= sy1; y++) put(f, x - 1, y, T.PARTITION);
          section.push(addRoom(f, null, x, sy0, x + n - 1, sy1));
          x += n + 1;
        });
        section.forEach((room, i) => {
          const dx = r.int(room.x0, room.x1);
          edges.push({ f, x: dx, y: wallY, a: side.id, b: room.id, state: r.weighted(linkStates), free: [{ x: dx, y: wallY - 1 }, { x: dx, y: wallY + 1 }] });
          const byHall = b.side === 'w' ? room.x1 === b.bx1 : room.x0 === b.bx0;
          if (byHall && anyDoorRow(sy0, sy1) && r.chance(0.4)) spineDoor(room, sy0, sy1);
          if (i > 0 && r.chance(0.2 + 0.3 * cx)) {
            const ly = r.int(sy0, sy1);
            edges.push({ f, x: room.x0 - 1, y: ly, a: section[i - 1].id, b: room.id, state: r.weighted(linkStates), free: [{ x: room.x0 - 2, y: ly }, { x: room.x0, y: ly }] });
          }
        });
        made.push(...section);
      }
    }
    return made;
  }

  // Note: the rows of a block beside the stair column, trimmed where the notch takes its rear.
  const blockRows = (bx0, bx1) => (notch && bx0 <= notch.x1 && bx1 >= notch.x0 ? notch.y1 + 2 : iy0);
  const sideLayout = (f, maxRooms, corridors, minRooms) => {
    const spine = addRoom(f, 'hall', hx0, iy0, hx0 + 2, iy1);
    const b = colSide === 'w'
      ? { side: 'e', bx0: hx0 + 4, bx1: ix1, wallX: hx0 + 3 }
      : { side: 'w', bx0: ix0, bx1: hx0 - 2, wallX: hx0 - 1 };
    b.by0 = blockRows(b.bx0, b.bx1);
    b.by1 = iy1;
    return { spine, made: block(f, spine, b, maxRooms, corridors, minRooms) };
  };

  // Note: per storey the layout, then the kinds of its rooms.
  let groundSpine = null;
  // Note: how many rooms the program asks for on storey f besides a public room the layout gives it.
  const needOn = (f) => (f === 0 ? (stories === 1 ? prog.needSingle || prog.need0 : prog.need0) : prog.needUp);
  const roomsWanted = (f, publicGiven) => Math.max(1, needOn(f).length - (publicGiven && needOn(f).includes(prog.public) ? 1 : 0));
  for (let f = 0; f < stories; f++) {
    let made;
    let publicRoom = null;
    if (scheme === 'hall') {
      const spine = addRoom(f, 'hall', hx0, iy0, hx0 + 2, iy1);
      made = [];
      const sidesOf = [{ side: 'w', bx0: ix0, bx1: hx0 - 2, wallX: hx0 - 1 }, { side: 'e', bx0: hx0 + 4, bx1: ix1, wallX: hx0 + 3 }];
      // Note: item 482: a barroom or a banking hall is the ground floor's big room, so the wider side of the hall is left as one room for it.
      const wide = f === 0 && BIG_PUBLIC.has(prog.public) ? (sidesOf[0].bx1 - sidesOf[0].bx0 >= sidesOf[1].bx1 - sidesOf[1].bx0 ? 0 : 1) : -1;
      sidesOf.forEach((b, k) => {
        b.by0 = blockRows(b.bx0, b.bx1);
        b.by1 = iy1;
        const got = block(f, spine, b, k === wide ? 1 : Infinity, k !== wide, k === wide ? 1 : Math.ceil(roomsWanted(f, false) / 2));
        if (k === wide && got.length) publicRoom = Object.assign(got[0], { kind: prog.public });
        made.push(...got);
      });
      if (f === 0) {
        groundSpine = spine;
        for (let y = iy0; y <= iy1; y++) if (open(0, hx0 + 1, y)) put(0, hx0 + 1, y, T.RUG);
      }
    } else if (f === 0 && scheme === 'open') {
      const pw = r.int(Math.max(5, Math.round(inner * 0.5)), Math.max(5, Math.min(inner - 4, Math.round(inner * 0.7))));
      const px0 = colSide === 'w' ? ix0 : ix1 - pw + 1;
      publicRoom = addRoom(0, prog.public, px0, iy0, px0 + pw - 1, iy1);
      const b = colSide === 'w' ? { side: 'e', bx0: px0 + pw + 1, bx1: ix1, wallX: px0 + pw } : { side: 'w', bx0: ix0, bx1: px0 - 2, wallX: px0 - 1 };
      b.by0 = iy0;
      b.by1 = iy1;
      made = block(0, publicRoom, b, Infinity, false, roomsWanted(0, true));
      groundSpine = publicRoom;
    } else if (f === 0 && scheme === 'front') {
      publicRoom = addRoom(0, prog.public, ix0, ps, ix1, iy1);
      for (let x = ix0; x <= ix1; x++) put(0, x, ps - 1, T.PARTITION);
      const m = Math.min(Math.floor((inner + 1) / 4), Math.max(1, Math.round(1 + (2 * cx * inner) / 12 + r.range(-0.5, 0.5))));
      made = [];
      let x = ix0;
      cuts(inner, m).forEach((n, i) => {
        if (i > 0) for (let y = iy0; y <= ps - 2; y++) put(0, x - 1, y, T.PARTITION);
        made.push(addRoom(0, null, x, iy0, x + n - 1, ps - 2));
        x += n + 1;
      });
      made.forEach((room, i) => {
        const xs = [];
        for (let dx = room.x0; dx <= room.x1; dx++) if (open(0, dx, ps)) xs.push(dx);
        if (xs.length) {
          const dx = r.pick(xs);
          edges.push({ f: 0, x: dx, y: ps - 1, a: publicRoom.id, b: room.id, state: r.chance(prog.arches) ? 'arch' : r.weighted(hallStates), free: [{ x: dx, y: ps - 2 }, { x: dx, y: ps }] });
        }
        if (i > 0 && r.chance(0.3 + 0.3 * cx)) {
          const ly = r.int(iy0, ps - 2);
          edges.push({ f: 0, x: room.x0 - 1, y: ly, a: made[i - 1].id, b: room.id, state: r.weighted(linkStates), free: [{ x: room.x0 - 2, y: ly }, { x: room.x0, y: ly }] });
        }
      });
      groundSpine = publicRoom;
    } else {
      const loft = prog.loft && scheme !== 'side';
      const plan = sideLayout(f, loft ? 2 : Infinity, !loft, roomsWanted(f, false));
      made = plan.made;
      if (f === 0) groundSpine = plan.spine;
    }
    // Note: kinds: the signature room takes the largest space, small rooms the smallest, the rest are drawn from the floor's list.
    const single = stories === 1;
    const need = needOn(f).map((k) => (Array.isArray(k) ? r.pick(k) : k));
    const pool = f === 0 ? (single ? prog.single || prog.ground : prog.ground) : prog.upper;
    if (publicRoom) need.splice(need.indexOf(prog.public), need.includes(prog.public) ? 1 : 0);
    const free = made.filter((room) => room.kind === null).sort((a, b) => area(b) - area(a) || a.id - b.id);
    for (const kind of need) {
      if (!free.length) {
        unplaced.push(`${kind} on floor ${f}`);
        continue;
      }
      const i = kind === prog.public ? 0 : SMALL.has(kind) ? free.length - 1 : r.int(0, free.length - 1);
      free.splice(i, 1)[0].kind = kind;
    }
    for (const room of free) room.kind = r.pick(pool);
  }

  // Note: openings in an outer wall: the wall cell, the free cell inside it in the room, and the cell outside the footprint.
  const spotTaken = (f, wx, wy) => {
    for (let d = -1; d <= 1; d++) {
      for (const [nx, ny] of [[wx + d, wy], [wx, wy + d]]) {
        const t = tileAt(map, f, nx, ny);
        if (t === T.WINDOW || t === T.DOOR) return true;
      }
    }
    return false;
  };
  const shell = (t) => t === ext || t === T.WINDOW || t === T.DOOR;
  function openingSpots(f, room) {
    const out = [];
    const test = (wx, wy, ix, iy) => {
      const ox = 2 * wx - ix;
      const oy = 2 * wy - iy;
      if (tileAt(map, f, wx, wy) !== ext || inFoot(ox, oy) || !open(f, ix, iy) || keep.has(cellKey(ix, iy, f))) return;
      const along = wx === ix ? [[wx - 1, wy], [wx + 1, wy]] : [[wx, wy - 1], [wx, wy + 1]];
      if (!along.every(([ax, ay]) => shell(tileAt(map, f, ax, ay)))) return;
      if (spotTaken(f, wx, wy)) return;
      out.push({ wx, wy, ix, iy, ox, oy });
    };
    for (let y = room.y0; y <= room.y1; y++) {
      test(room.x0 - 1, y, room.x0, y);
      test(room.x1 + 1, y, room.x1, y);
    }
    for (let x = room.x0; x <= room.x1; x++) {
      test(x, room.y0 - 1, x, room.y0);
      test(x, room.y1 + 1, x, room.y1);
    }
    return out;
  }
  const addDoor = (f, x, y, state, interior) => {
    put(f, x, y, T.DOOR, state);
    doors.push({ floor: f, x, y, interior });
  };
  const addWindow = (f, x, y, state) => {
    put(f, x, y, T.WINDOW, state);
    windows.push({ floor: f, x, y });
  };
  const addEntry = (kind, s) => entries.push({ kind, floor: 0, x: s.wx, y: s.wy, inside: { x: s.ix, y: s.iy }, outside: { x: s.ox, y: s.oy }, state: stateAt(map, 0, s.wx, s.wy) });
  const exteriorDoor = (s, state) => {
    addDoor(0, s.wx, s.wy, state, false);
    addEntry('door', s);
    keepFree(0, s.ix, s.iy);
  };

  // Note: interior doors first, so outer openings never sit beside one.
  const ground = rooms.filter((room) => room.floor === 0);
  const roomAt = (f, x, y) => rooms.find((room) => room.floor === f && room.kind !== 'hall' && x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1) ||
    rooms.find((room) => room.floor === f && x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1);
  const frontRoom = groundSpine;
  const front = openingSpots(0, frontRoom).filter((s) => s.wy === y1);
  const mid = (x0 + x1) / 2;
  front.sort((a, b) => Math.abs(a.wx - mid) - Math.abs(b.wx - mid));
  const hallGate = front.find((s) => s.wx === hx0 + 1);
  const gateSpot = scheme === 'hall' && hallGate ? hallGate : front[r.int(0, Math.min(front.length - 1, 2))];
  if (!gateSpot) unplaced.push('front door');
  const gate = gateSpot ? gateSpot.wx : Math.round(mid);
  if (gateSpot) exteriorDoor(gateSpot, r.weighted(FRONT_DOOR));
  // Note: the back door opens from the rear wall, into the hall where it reaches it.
  const rear = ground.flatMap((room) => openingSpots(0, room).filter((s) => s.wy === y0 && s.oy < s.wy));
  const backSpot = rear.find((s) => s.wx === hx0 + 1 && scheme === 'hall') || (rear.length ? r.pick(rear) : null);
  if (backSpot) exteriorDoor(backSpot, r.weighted(BACK_DOOR));
  // Note: side doors, a wide loading door on a side wall for barns, warehouses, shops of a trade and mills.
  for (const wallX of [x0, x1]) {
    if (!r.chance(0.15 + 0.5 * cx + (prog.double ? 0.35 : 0))) continue;
    const spots = ground.flatMap((room) => openingSpots(0, room).filter((s) => s.wx === wallX));
    if (!spots.length) continue;
    const s = r.pick(spots);
    exteriorDoor(s, r.weighted(SIDE_DOOR));
    // Note: the second leaf of a wide door sits just south of the first, in the same straight wall and over the same room.
    const py = s.wy + 1;
    if (prog.double && tileAt(map, 0, wallX, py) === ext && shell(tileAt(map, 0, wallX, py + 1)) && open(0, s.ix, py) && !keep.has(cellKey(s.ix, py, 0)) && roomAt(0, s.ix, py) === roomAt(0, s.ix, s.iy)) {
      exteriorDoor({ wx: wallX, wy: py, ix: s.ix, iy: py, ox: s.ox, oy: py }, stateAt(map, 0, s.wx, s.wy));
    }
  }
  // Note: upper storeys show windows over the front and back doors.
  for (let f = 1; f < stories; f++) {
    for (const d of [gateSpot, backSpot]) if (d && tileAt(map, f, d.wx, d.wy) === ext && !spotTaken(f, d.wx, d.wy)) addWindow(f, d.wx, d.wy, r.weighted(WINDOWS));
  }

  // Note: item 70: unlock interior doors until every room is reachable from the front door without forcing, flights included; any single usable entry then reaches them all.
  const links = flights.map((fl) => [roomAt(fl.lo, fl.foot.x, fl.foot.y), roomAt(fl.lo + 1, fl.head.x, fl.head.y)]);
  const startRoom = gateSpot ? roomAt(0, gateSpot.ix, gateSpot.iy) : frontRoom;
  const seen = new Set([startRoom?.id]);
  for (;;) {
    for (let grew = true; grew;) {
      grew = false;
      for (const e of edges) {
        if (e.state === DS.LOCKED || seen.has(e.a) === seen.has(e.b)) continue;
        seen.add(e.a);
        seen.add(e.b);
        grew = true;
      }
      for (const [a, b] of links) {
        if (!a || !b || seen.has(a.id) === seen.has(b.id)) continue;
        seen.add(a.id);
        seen.add(b.id);
        grew = true;
      }
    }
    const stuck = edges.find((e) => e.state === DS.LOCKED && seen.has(e.a) !== seen.has(e.b));
    if (!stuck) break;
    stuck.state = DS.CLOSED;
  }
  for (const e of edges) {
    if (e.state === 'arch') {
      put(e.f, e.x, e.y, T.FLOOR);
      keepFree(e.f, e.x, e.y);
    } else addDoor(e.f, e.x, e.y, e.state, true);
    for (const c of e.free) keepFree(e.f, c.x, c.y);
  }

  // Note: windows on the outer walls of every room but halls and vaults; ground windows are entries.
  for (const room of rooms) {
    if (room.kind === 'hall' || BLIND.has(room.kind)) continue;
    const spots = r.shuffle(openingSpots(room.floor, room).filter((s) => room.floor > 0 || s.wx !== x0 + 2 || s.wy !== y1));
    let wanted = r.int(1, 1 + Math.round(2 * cx)) + (area(room) > 40 ? 1 : 0);
    for (const s of spots) {
      if (wanted === 0) break;
      if (spotTaken(room.floor, s.wx, s.wy) || tileAt(map, room.floor, s.wx, s.wy) !== ext) continue;
      addWindow(room.floor, s.wx, s.wy, r.weighted(WINDOWS));
      keepFree(room.floor, s.ix, s.iy);
      if (room.floor === 0) addEntry('window', s);
      wanted--;
    }
  }
  if (!entries.some((e) => usableEntry(map, e))) {
    const w = entries.find((e) => e.kind === 'window');
    if (w) {
      put(0, w.x, w.y, T.WINDOW, WS.CLOSED);
      w.state = WS.CLOSED;
    }
  }

  for (const room of rooms) if (room.kind !== 'hall') furnish(map, room, keep, r, put, building, true);

  // Note: the fence and the yard props that tell the trade from outside: corrals, tailings, graves, freight or hitching posts.
  for (let x = x0 - 3; x <= x1 + 3; x++) if (x < gate - 1 || x > gate + 1) put(0, x, fenceY, T.FENCE);
  for (let i = 0, n = r.int(3, 7); i < n; i++) {
    const x = r.int(x0 - 6, x1 + 6);
    const y = r.int(y0 - 4, fenceY - 1);
    const near = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 2;
    const lane = x >= gate - 2 && x <= gate + 2 && y > y1;
    if (!near && !lane && tileAt(map, 0, x, y) === T.SAND) put(0, x, y, r.pick(prog.yard));
  }

  const spawn = {
    sheriff: { x: gate - 1 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    deputy: { x: gate + 1 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
  };
  spawn.slots = [
    { ...spawn.sheriff },
    { ...spawn.deputy },
    { x: gate - 3 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    { x: gate + 3 + 0.5, y: fenceY + 2 + 0.5, floor: 0 },
    { x: gate + 0.5, y: fenceY + 3 + 0.5, floor: 0 },
  ];
  const stairs = flights.length ? { x: flights[0].x, y: flights[0].y, run: flights[0].run, foot: flights[0].foot, head: flights[0].head } : null;
  const house = {
    kind: 'house', terrain: null,
    seed, style, building, variant: prog.id, scheme, modest, stories, map,
    footprint: { x0, y0, x1, y1 },
    notch: notch && { x0: notch.x0, y0: notch.y0, x1: notch.x1, y1: notch.y1 },
    hall: { x0: hx0, y0: iy0, x1: hx0 + 2, y1: iy1 },
    rooms: rooms.map(({ id, floor, kind, x0: ax0, y0: ay0, x1: ax1, y1: ay1 }) => ({ id, floor, kind, x0: ax0, y0: ay0, x1: ax1, y1: ay1 })),
    stairs, flights,
    entries, doors, windows, spawn,
    hostiles: [], civilian: null, rumor: false,
    unplaced,
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

const area = (room) => (room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1);
