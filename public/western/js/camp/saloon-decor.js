// Note: dresses a laid-out saloon with period pieces; it owns its own random stream and keeps a blocking piece only while the room stays valid.
import { T } from '../tiles.js';

const key = (x, y) => `${x},${y}`;
const count = (a) => a.reduce((n, v) => n + v, 0);
const WALL_KINDS = ['horns', 'clock', 'picture', 'wanted', 'bill', 'notice', 'ad', 'picture'];

// Note: one beam of dusk light from a window, in room art units (16 per cell); it leans toward the north east like a low sun.
function beam(win, w, H) {
  const len = 52;
  const q = (pts) => pts.map(([u, v]) => [Math.round(u * 10) / 10, Math.round(v * 10) / 10]);
  let base;
  let dir;
  if (win.side === 's') {
    base = { a: [win.x * 16 + 3.2, (H - 1) * 16], b: [win.x * 16 + 12.8, (H - 1) * 16] };
    dir = [15, -len];
  } else if (win.side === 'w') {
    base = { a: [16, win.y * 16 + 3.2], b: [16, win.y * 16 + 12.8] };
    dir = [len, -10];
  } else {
    base = { a: [(w - 1) * 16, win.y * 16 + 3.2], b: [(w - 1) * 16, win.y * 16 + 12.8] };
    dir = [-len, 8];
  }
  const at = (t, k) => [base.a[0] + (base.b[0] - base.a[0]) * k + dir[0] * t, base.a[1] + (base.b[1] - base.a[1]) * k + dir[1] * t];
  const spread = (t) => 1 + t * 0.18;
  const band = (t0, t1, k0, k1) => q([at(t0, 0.5 + (k0 - 0.5) * spread(t0)), at(t0, 0.5 + (k1 - 0.5) * spread(t0)), at(t1, 0.5 + (k1 - 0.5) * spread(t1)), at(t1, 0.5 + (k0 - 0.5) * spread(t1))]);
  const pts = band(0, 1, 0, 1);
  const core = band(0.04, 0.86, 0.22, 0.78);
  // Note: the mullion shadows: one along the beam and one across it a little past the middle.
  const bars = [band(0, 0.96, 0.47, 0.53), band(0.4, 0.44, 0, 1)];
  const motes = [[0.22, 0.3], [0.38, 0.66], [0.55, 0.42], [0.7, 0.58], [0.82, 0.36]].map(([t, k]) => q([at(t, k)])[0]);
  return { pts, core, bars, motes, a: 0.2 };
}

// Note: adds the pieces, the rugs, the wall dressing, the window beams and the floor litter; g carries the plan's closures.
export function dress(g) {
  const { w, H, tile, cells, D, doorX, bar, stoveX, windows } = g;
  const stand = new Set(g.stands.map((s) => key(s.cell.x, s.cell.y)));
  const lit = (x, y) => tile[y][x].t === T.FLOOR || tile[y][x].t === T.RUG;
  const open = (x, y) => x > 0 && y > 0 && x < w - 1 && y < H - 1 && tile[y][x].t === T.FLOOR && !cells[key(x, y)] && !stand.has(key(x, y)) && !(Math.abs(x - doorX) <= 1 && y >= 5);
  const calm = (x, y) => x <= 0 || x >= w - 1 || y <= 0 || y >= H - 1 || lit(x, y);
  const place = (list, build) => {
    if (!list.every(([x, y]) => open(x, y))) return false;
    const was = list.map(([x, y]) => [tile[y][x], cells[key(x, y)]]);
    const before = g.reach();
    build();
    g.solid();
    // Note: a piece may not seal off any floor; the cells it covers are the only ones lost.
    const after = g.reach();
    const lost = list.filter(([x, y]) => before[y * w + x]).length;
    if (count(after) === count(before) - lost && g.valid()) return true;
    list.forEach(([x, y], i) => {
      tile[y][x] = was[i][0];
      if (was[i][1]) cells[key(x, y)] = was[i][1];
      else delete cells[key(x, y)];
    });
    g.solid();
    return false;
  };
  const out = { billiard: null, stairs: null, pieces: 0, wall: [], litter: 0, beams: 0 };

  // Note: a flight of stairs against one side wall, climbing into a dark gallery.
  if (D.chance(0.8)) {
    for (const side of D.shuffle(['w', 'e'])) {
      const sx = side === 'w' ? 1 : w - 2;
      const list = [[sx, 5], [sx, 6], [sx, 7]];
      if (place(list, () => list.forEach(([x, y], j) => g.put(x, y, T.DESK, 0, { variant: 'stairs', part: { j }, side })))) {
        out.stairs = { side, x: sx };
        out.pieces++;
        g.lights.push({ kind: 'lantern', x: sx + 0.5, y: 7.5, r: 2.2 });
        break;
      }
    }
  }

  // Note: a billiard table in the open stretch of the table row; the cells around it keep an aisle and take lounging patrons.
  if (D.chance(0.9)) {
    const spots = [];
    for (let x0 = 1; x0 + 2 <= w - 2; x0++) {
      const room = (c) => calm(c, 5) && calm(c, 6);
      if (room(x0 - 1) || room(x0 + 3)) spots.push(x0);
    }
    for (const x0 of D.shuffle(spots)) {
      const list = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) list.push([x0 + dx, 5 + dy]);
      if (!place(list, () => list.forEach(([x, y]) => g.put(x, y, T.DESK, 0, { variant: 'billiard', part: { i: x - x0, j: y - 5 } })))) continue;
      out.billiard = { x0, y0: 5, w: 3, h: 2 };
      out.pieces++;
      g.props.push({ kind: 'billiard', x: x0 + 1.5, y: 6 });
      g.lights.push({ kind: 'lamp', hang: true, x: x0 + 1.5, y: 6, r: 3.4 });
      for (let dx = 0; dx < 3; dx++) if (lit(x0 + dx, 7) && !stand.has(key(x0 + dx, 7)) && !(Math.abs(x0 + dx - doorX) <= 1)) g.stands.push({ id: `pool-s${x0 + dx}`, kind: 'lounge', x: x0 + dx + 0.5, y: 7.46, facing: -Math.PI / 2, cell: { x: x0 + dx, y: 7 } });
      for (const [sx, face] of [[x0 - 1, 0], [x0 + 3, Math.PI]]) if (sx > 0 && sx < w - 1 && lit(sx, 6) && !stand.has(key(sx, 6))) g.stands.push({ id: `pool-e${sx}`, kind: 'lounge', x: sx + 0.5, y: 6.46, facing: face, cell: { x: sx, y: 6 } });
      break;
    }
  }

  // Note: barrel tables in the aisle for standing drinkers; one when a billiard table took the middle, up to three when not.
  let tubs = out.billiard ? 1 : D.int(2, 4);
  for (const x of D.shuffle(Array.from({ length: w - 2 }, (_, i) => i + 1))) {
    if (tubs <= 0) break;
    if (!place([[x, 5]], () => g.put(x, 5, T.BARREL, 0, { variant: 'stand' }))) continue;
    tubs--;
    out.pieces++;
    g.lights.push({ kind: 'lantern', x: x + 0.5, y: 5.5, r: 1.8 });
    for (const [sx, face] of [[x - 1, 0], [x + 1, Math.PI]]) if (sx > 0 && sx < w - 1 && lit(sx, 5) && !stand.has(key(sx, 5)) && !(Math.abs(sx - doorX) <= 1)) g.stands.push({ id: `tub-${x}${face ? 'w' : 'e'}`, kind: 'lounge', x: sx + 0.5, y: 5.46, facing: face, cell: { x: sx, y: 5 } });
  }

  // Note: the back corners: a wood box and a bench by the stove, kegs and crates where the back bar ends.
  for (let x = 1; x < w - 1; x++) {
    if (x >= bar.x0 && x <= bar.x1) continue;
    if (!D.chance(0.85)) continue;
    const near = Math.abs(x - stoveX) === 1;
    const kind = near ? 'wood' : D.pick(['keg', 'keg', 'crate']);
    if (!place([[x, 1]], () => (kind === 'wood' ? g.put(x, 1, T.CRATE, 0, { variant: 'woodbox' }) : kind === 'keg' ? g.put(x, 1, T.BARREL, 0, { variant: 'keg' }) : g.put(x, 1, T.CRATE)))) continue;
    out.pieces++;
  }
  for (const bx of [stoveX - 1, stoveX + 1]) {
    if (bx > 0 && bx < w - 1 && D.chance(0.6) && place([[bx, 2]], () => g.put(bx, 2, T.CHAIR, 0, { variant: 'bench' }))) out.pieces++;
  }
  // Note: benches and kegs along the street wall under the windows, away from the door.
  let lane = 0;
  for (const win of D.shuffle(windows.filter((v) => v.side === 's'))) {
    if (lane >= 3 || !D.chance(0.55) || !lit(win.x, 6)) continue;
    const bench = D.chance(0.7);
    if (place([[win.x, 7]], () => (bench ? g.put(win.x, 7, T.CHAIR, 0, { variant: 'bench' }) : g.put(win.x, 7, T.BARREL, 0, { variant: 'keg' })))) {
      lane++;
      out.pieces++;
    }
  }

  // Note: a plain table becomes a second card table now and then.
  for (const t of g.tables) {
    if (t.kind !== 'table' || !D.chance(0.5)) continue;
    for (const c of t.cells) if (cells[key(c.x, c.y)] && cells[key(c.x, c.y)].motif !== 'meal') cells[key(c.x, c.y)] = { ...cells[key(c.x, c.y)], motif: 'cards' };
  }

  // Note: a hearth rug in front of the stove; a rug never blocks anything.
  if (D.chance(0.75)) {
    for (const rx of [stoveX, stoveX + (stoveX < w / 2 ? 1 : -1)]) if (rx > 0 && rx < w - 1 && tile[2][rx].t === T.FLOOR) g.put(rx, 2, T.RUG);
  }

  // Note: a carpet runner in front of the bar, only on open floor, so it covers no piece.
  if (D.chance(0.7)) {
    const len = D.int(4, 7);
    const from = D.int(bar.x0 + 1, Math.max(bar.x0 + 1, bar.x1 - len));
    for (let x = from; x < from + len && x <= bar.x1; x++) if (tile[5][x].t === T.FLOOR && !cells[key(x, 5)]) g.put(x, 5, T.RUG);
  }

  // Note: the back wall: three sconces spread out and the rest of the odd columns hung with a trophy, a clock, pictures and bills.
  const slots = [];
  for (let x = 1; x <= w - 2; x += 2) slots.push(x);
  const lamps = new Set([slots[1], slots[slots.length >> 1], slots[slots.length - 2]]);
  const rest = D.shuffle([...WALL_KINDS]);
  for (const x of slots) {
    const deco = lamps.has(x) ? 'sconce' : rest.shift();
    if (!deco) continue;
    cells[key(x, 0)] = { deco };
    out.wall.push({ x, deco });
    if (deco === 'sconce') g.lights.push({ kind: 'sconce', x: x + 0.5, y: 1, r: 2.8 });
  }

  // Note: one beam per window; each lands on the floor cells it crosses.
  for (const win of windows) {
    const b = beam(win, w, H);
    const xs = b.pts.map((p) => p[0]);
    const ys = b.pts.map((p) => p[1]);
    for (let cy = Math.max(1, Math.floor(Math.min(...ys) / 16)); cy <= Math.min(H - 2, Math.floor(Math.max(...ys) / 16)); cy++) {
      for (let cx = Math.max(1, Math.floor(Math.min(...xs) / 16)); cx <= Math.min(w - 2, Math.floor(Math.max(...xs) / 16)); cx++) {
        if (!lit(cx, cy)) continue;
        const own = (cells[key(cx, cy)] ||= {});
        (own.shafts ||= []).push(b);
      }
    }
    out.beams++;
  }

  // Note: floor litter; a foot rail and spittoons under the bar, sawdust, stains, dropped cards and cigar ends, and mud near the door.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!lit(x, y) || y < 4) continue;
      const items = [];
      let dust = 0;
      if (y === 4 && x >= bar.x0 && x <= bar.x1) {
        items.push({ k: 'footrail' });
        if ((x - bar.x0) % 4 === 1) items.push({ k: 'spit', x: 12.8, y: 10.6 });
        dust = D.chance(0.7) ? 9 : 0;
      } else if (y >= 4) {
        if (D.chance(0.4)) dust = D.int(5, 11);
        if (D.chance(0.07)) items.push({ k: 'stain', x: D.range(4, 12), y: D.range(4, 12) });
        if (D.chance(0.04)) items.push({ k: 'card', x: D.range(4, 12), y: D.range(4, 12) });
        if (D.chance(0.05)) items.push({ k: 'stub', x: D.range(3, 12), y: D.range(4, 12) });
        if (D.chance(0.015)) items.push({ k: 'shards', x: D.range(4, 12), y: D.range(5, 12) });
        if (y >= 6 && Math.abs(x - doorX) <= 1) {
          items.push({ k: 'mud', x: 8, y: 13, flip: x % 2 ? 1 : -1 });
          dust = Math.max(dust, 8);
        }
      }
      if (!items.length && !dust) continue;
      const own = (cells[key(x, y)] ||= {});
      own.decor = { dust, items };
      out.litter += items.length;
    }
  }
  // Note: a later piece may have taken a lounging place or two stands may share a cell; those places are dropped.
  const used = new Set();
  g.stands.splice(0, g.stands.length, ...g.stands.filter((st) => {
    const at = key(st.cell.x, st.cell.y);
    if (!/^(pool|tub)-/.test(st.id)) {
      used.add(at);
      return true;
    }
    if (!lit(st.cell.x, st.cell.y) || used.has(at)) return false;
    used.add(at);
    return true;
  }));
  return out;
}
