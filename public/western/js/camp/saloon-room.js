// Note: the playable saloon room, a pure seeded floor plan on the game's own tiles; no DOM, no Phaser, no campaign state.
import { makeMap, newFloor, setTile } from '../map.js';
import { T, DS, WS } from '../tiles.js';
import { rng, seedFromString } from '../rand.js';
import { dress } from './saloon-decor.js';

export const ROOM_H = 9;
// Note: how far, in metres, a standing point may be from the edge of a target and still use it.
export const REACH = 0.9;
export const FACE = { n: -Math.PI / 2, s: Math.PI / 2, w: Math.PI, e: 0 };

const GAMES = ['poker', 'faro'];
const key = (x, y) => `${x},${y}`;

// Note: what a drink and a meal cost in cents.
export const PRICES = { drink: 15, meal: 50 };

// Note: a town may arrive as a PLACES entry, as the Campaign.saloon() view, or as a bare list of games; this reads all three.
export function offerOf(town) {
  const own = town?.services?.saloon && typeof town.services.saloon === 'object' ? town.services.saloon : town?.saloon && typeof town.saloon === 'object' ? town.saloon : town || {};
  return { meal: !!own.meal, games: GAMES.filter((g) => Array.isArray(own.games) && own.games.includes(g)) };
}

// Note: the distance from a point to a rectangle {x0, y0, x1, y1}; zero inside it.
export function rectDist(r, x, y) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
}

const FALLBACK = { w: 19, doorX: 6, bx0: 3, bx1: 15, piano: null, stove: 'r', seedKey: 'fallback' };

function pickParams(R) {
  const w = R.int(17, 19);
  const piano = R.weighted([['l', 0.35], ['r', 0.35], [null, 0.3]]);
  const bx0 = piano === 'l' ? 4 : R.pick([3, 4]);
  const bx1 = piano === 'r' ? w - 5 : R.pick([w - 4, w - 5]);
  const stove = piano ? (piano === 'l' ? 'r' : 'l') : R.pick(['l', 'r']);
  const doorX = R.chance(0.5) ? R.pick([4, 5, 6]) : R.pick([w - 7, w - 6, w - 5]);
  return { w, doorX, bx0, bx1, piano, stove };
}

// Note: one candidate plan; tables sit in row 6 between the door column and the side walls, so rows 4, 5 and 7 stay open.
function layout(p, offer, R, D) {
  const { w, doorX, bx0, bx1 } = p;
  const H = ROOM_H;
  const tile = Array.from({ length: H }, (_, y) => Array.from({ length: w }, (_, x) => ({ t: x === 0 || y === 0 || x === w - 1 || y === H - 1 ? T.FRAME : T.FLOOR, s: 0 })));
  const cells = {};
  const put = (x, y, t, s = 0, patch = null) => {
    tile[y][x] = { t, s };
    if (patch) cells[key(x, y)] = patch;
  };
  const windows = [];
  const win = (x, y, side) => {
    put(x, y, T.WINDOW, WS.CLOSED);
    windows.push({ x, y, side });
  };
  // Note: windows along the street wall every third cell, never beside the door, and one in each side wall.
  for (let x = 2; x <= w - 3; x += 3) if (Math.abs(x - doorX) >= 2) win(x, H - 1, 's');
  win(0, 4, 'w');
  win(w - 1, 4, 'e');
  put(doorX, H - 1, T.DOOR, DS.OPEN);

  const props = [];
  const seats = [];
  const tables = [];
  const stands = [];
  const targets = [];

  // Note: the back bar, the bartender's strip, the counter and a barrel at each end of the strip.
  for (let x = bx0; x <= bx1; x++) {
    const mirror = (x - bx0) % 4 === 2;
    put(x, 1, T.SHELF, 0, { backbar: mirror ? 'mirror' : true });
    put(x, 3, T.SALOON_BAR, 0, { bar: true, rail: true, joinW: x > bx0, joinE: x < bx1 });
  }
  put(bx0 - 1, 2, T.BARREL);
  put(bx1 + 1, 2, T.BARREL);
  const bar = { x0: bx0, x1: bx1, y: 3, strip: { x0: bx0, x1: bx1, y: 2 }, rect: { x0: bx0, y0: 3, x1: bx1 + 1, y1: 4 } };
  targets.push({ id: 'bar', kind: 'bar', label: 'the bar', rect: bar.rect });
  for (let x = bx0; x <= bx1; x++) stands.push({ id: `bar-${x}`, kind: 'bar', x: x + 0.5, y: 4.46, facing: FACE.n, cell: { x, y: 4 } });

  // Note: a piano with its stool in one back corner, a stove in the other (or in either, when there is no piano).
  let piano = null;
  if (p.piano) {
    const px = p.piano === 'l' ? 1 : w - 3;
    put(px, 1, T.DESK, 0, { variant: 'piano', half: 'l' });
    put(px + 1, 1, T.DESK, 0, { variant: 'piano', half: 'r' });
    const sx = p.piano === 'l' ? px + 1 : px;
    put(sx, 2, T.CHAIR);
    const other = sx === px ? px + 1 : px;
    seats.push({ id: 'stool', kind: 'stool', side: 'n', table: 'piano', x: sx + 0.5, y: 2.5, facing: FACE.n, cell: { x: sx, y: 2 } });
    piano = { x: px, cells: [{ x: px, y: 1 }, { x: px + 1, y: 1 }], stool: seats[0] };
    stands.push({ id: 'piano', kind: 'piano', x: other + 0.5, y: 2.46, facing: FACE.n, cell: { x: other, y: 2 } });
  }
  const stoveX = p.stove === 'l' ? 1 : w - 2;
  put(stoveX, 1, T.STOVE);
  props.push({ kind: 'stove', x: stoveX + 0.5, y: 1.5 });
  stands.push({ id: 'stove', kind: 'stove', x: stoveX + 0.5, y: 2.46, facing: FACE.n, cell: { x: stoveX, y: 2 } });
  // Note: lounging cells beside the bar ends and the side windows.
  for (let x = 1; x <= w - 2; x++) if (x < bx0 || x > bx1) stands.push({ id: `lounge-${x}`, kind: 'lounge', x: x + 0.5, y: 3.46, facing: x < w / 2 ? FACE.e : FACE.w, cell: { x, y: 3 } });
  stands.push({ id: 'window-w', kind: 'window', x: 1.5, y: 4.5, facing: FACE.w, cell: { x: 1, y: 4 } });
  stands.push({ id: 'window-e', kind: 'window', x: w - 1.5, y: 4.5, facing: FACE.e, cell: { x: w - 2, y: 4 } });

  // Note: tables in row 6; the games come first so they always get a place when the town offers them.
  const wants = [...offer.games.map((g) => ({ kind: g, width: g === 'faro' ? 4 : 3 }))];
  const plain = R.int(1, 3);
  for (let i = 0; i < plain; i++) wants.push({ kind: 'table', width: 3 });
  const segs = [{ at: 1, end: doorX - 1 }, { at: doorX + 1, end: w - 2 }];
  const roomIn = (s) => s.end - s.at + 1;
  let n = 0;
  for (const want of wants) {
    const open = segs.filter((s) => roomIn(s) >= want.width);
    if (!open.length) continue;
    const seg = R.pick(open);
    const x0 = seg.at;
    seg.at += want.width + 1;
    const tx = x0 + 1;
    const span = want.kind === 'faro' ? 2 : 1;
    const id = `${want.kind}-${n++}`;
    const tcells = [];
    for (let i = 0; i < span; i++) {
      const patch = want.kind === 'faro' ? { variant: 'faro', half: i ? 'r' : 'l' } : want.kind === 'table' ? { motif: offer.meal && R.chance(0.4) ? 'meal' : 'drinks' } : null;
      put(tx + i, 6, want.kind === 'faro' ? T.DESK : T.TABLE, 0, patch);
      tcells.push({ x: tx + i, y: 6 });
    }
    const rect = { x0: tx, y0: 6, x1: tx + span, y1: 7 };
    const table = { id, kind: want.kind, cells: tcells, rect, seats: [] };
    const addSeat = (cx, cy, side) => {
      put(cx, cy, T.CHAIR);
      const f = side === 'w' ? FACE.e : side === 'e' ? FACE.w : FACE.s;
      const seat = { id: `${id}-${side}${cx}`, kind: 'chair', side, table: id, x: cx + 0.5 + Math.cos(f) * 0.14, y: cy + 0.5 + Math.sin(f) * 0.14, facing: f, cell: { x: cx, y: cy } };
      seats.push(seat);
      table.seats.push(seat.id);
    };
    const full = want.kind !== 'table';
    const west = full || R.chance(0.85);
    const east = full || !west || R.chance(0.85);
    if (west) addSeat(x0, 6, 'w');
    if (east) addSeat(tx + span, 6, 'e');
    if (R.chance(full ? 0.85 : 0.5)) addSeat(tx + R.int(0, span - 1), 5, 'n');
    tables.push(table);
    if (full) targets.push({ id, kind: 'game', game: want.kind, label: want.kind === 'faro' ? 'the faro table' : 'the poker table', rect });
  }

  // Note: the sheriff starts a step inside the door, out of reach of it, so F does not leave by accident.
  const spawn = { x: doorX + 0.5, y: H - 2.5, facing: FACE.n };
  targets.push({ id: 'door', kind: 'door', label: 'the door to the street', rect: { x0: doorX, y0: H - 1, x1: doorX + 1, y1: H } });

  const room = { w, h: H, doorX, bar, piano, stoveX, windows, tables, seats, stands, targets, props, spawn, offer, params: p };
  room.blocked = new Uint8Array(w * H);
  const solid = () => {
    for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) room.blocked[y * w + x] = tile[y][x].t === T.FLOOR || tile[y][x].t === T.RUG ? 0 : 1;
  };
  solid();
  // Note: a rug runs from the bar toward the door; it only repaints open floor, so it blocks nothing.
  if (R.chance(0.7)) for (let y = 4; y <= 5; y++) for (let x = doorX - 1; x <= doorX + 1; x++) if (tile[y][x].t === T.FLOOR) put(x, y, T.RUG);
  // Note: any floor the street door cannot reach gets a crate, so no corner is a sealed pocket; the bartender's strip stays open.
  const seen = reachable(room);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const strip = y === bar.strip.y && x >= bar.strip.x0 && x <= bar.strip.x1;
      if (tile[y][x].t === T.FLOOR && !seen[y * w + x] && !strip) {
        put(x, y, T.CRATE);
        props.push({ kind: 'crate', x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  solid();
  // Note: dressing draws from its own stream D, so the plan above never changes with it.
  const extra = [];
  room.decor = dress({ w, H, tile, cells, D, doorX, bar, stoveX, windows, stands, props, tables, lights: extra, put, solid, reach: () => reachable(room), valid: () => valid(room) && snug(room) });
  for (const st of stands) st.free = !room.blocked[st.cell.y * w + st.cell.x];

  const map = makeMap([newFloor(T.VOID), newFloor(T.VOID)]);
  map.art = { kind: 'building', theme: 'saloon', x: 0, y: 0, width: w, height: H, porch: 0, cells };
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) setTile(map, 0, x, y, tile[y][x].t, tile[y][x].s);
  room.map = map;
  room.lights = [...lightsOf(room), ...extra];
  return room;
}

// Note: lamps over the tables and the bar, the stove's glow, one shaft per window, and the street light through the door.
function lightsOf(room) {
  const lights = [];
  const { bar } = room;
  const mid = (bar.x0 + bar.x1 + 1) / 2;
  for (const x of [bar.x0 + 1.5, mid, bar.x1 - 0.5]) lights.push({ kind: 'lamp', hang: true, x, y: 2.9, r: 3.4 });
  for (const t of room.tables) lights.push({ kind: 'lamp', hang: true, x: (t.rect.x0 + t.rect.x1) / 2, y: 5.4, r: 3.1 });
  lights.push({ kind: 'stove', x: room.stoveX + 0.5, y: 2, r: 2.6 });
  if (room.piano) lights.push({ kind: 'lamp', hang: true, x: room.piano.x + 1, y: 2.4, r: 2.4 });
  for (const w of room.windows) lights.push({ kind: 'window', x: w.x + 0.5, y: w.y + 0.5, side: w.side, r: 3.6 });
  lights.push({ kind: 'door', x: room.doorX + 0.5, y: room.h - 1.3, r: 3.2 });
  return lights;
}

// Note: 4-way flood fill from the street door over cells a person can stand in; extra is a list of cell indices to treat as blocked.
export function reachable(room, extra = []) {
  const { w, h, blocked, spawn } = room;
  const seen = new Uint8Array(w * h);
  const skip = new Set(extra);
  const start = Math.floor(spawn.y) * w + Math.floor(spawn.x);
  if (blocked[start]) return seen;
  const todo = [start];
  seen[start] = 1;
  while (todo.length) {
    const c = todo.pop();
    const x = c % w;
    const y = (c - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (seen[n] || blocked[n] || skip.has(n)) continue;
      seen[n] = 1;
      todo.push(n);
    }
  }
  return seen;
}

// Note: true when a reachable cell centre lies within REACH of the target.
export function usable(room, seen, target) {
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (seen[y * room.w + x] && rectDist(target.rect, x + 0.5, y + 0.5) <= REACH) return true;
  return false;
}

// Note: the guarantee behind every saloon: all targets are usable and every seat has an open neighbour.
export function valid(room) {
  const seen = reachable(room);
  if (!room.targets.every((t) => usable(room, seen, t))) return false;
  return room.seats.every((s) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen[(s.cell.y + dy) * room.w + s.cell.x + dx]));
}

// Note: stricter than valid(): a standing point within REACH minus a margin of every target stays open, so no piece squeezes a table or the bar.
function snug(room) {
  const seen = reachable(room);
  return room.targets.every((t) => {
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (seen[y * room.w + x] && rectDist(t.rect, x + 0.5, y + 0.5) <= REACH - 0.2) return true;
    return false;
  });
}

// Note: the cell index of a point in metres.
export const cellIndex = (room, x, y) => Math.floor(y) * room.w + Math.floor(x);

// Note: stands that no one may hold still on because a person standing there would cut off a target.
function markStands(room) {
  const seen = reachable(room);
  for (const st of room.stands) {
    const idx = st.cell.y * room.w + st.cell.x;
    const without = reachable(room, [idx]);
    st.safe = !!st.free && !!seen[idx] && room.targets.every((t) => usable(room, without, t));
  }
}

// Note: deterministic from (seed, town); the same seed and offer always give the same room.
export function buildRoom(seed, town = {}) {
  const offer = offerOf(town);
  const stem = `saloon-room:${seed}:${town?.id ?? ''}`;
  const R = rng(seedFromString(stem));
  for (let i = 0; i < 8; i++) {
    const room = layout(pickParams(R), offer, R, rng(seedFromString(`${stem}:decor:${i}`)));
    if (valid(room)) {
      markStands(room);
      return room;
    }
  }
  const room = layout(FALLBACK, offer, rng(seedFromString(`${stem}:fallback`)), rng(seedFromString(`${stem}:fallback:decor`)));
  if (!valid(room)) throw new Error('The saloon has no valid floor plan.');
  markStands(room);
  return room;
}
