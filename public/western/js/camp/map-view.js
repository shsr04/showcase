// Note: the continental map of the campaign; pure helpers first (projection, level of detail, labels, hits, scale), then the canvas component.
// Note: item 172: only known places ever enter this module; the index is built from Campaign.mapView, never from the world data.

import {
  jurisdictionOutlines, JURISDICTION_LIST, BOUNDARY, PLACES, mapPoint,
} from './world.js';
import { reducedMotion } from './cfx.js';

export const PPK_MIN = 0.08;
export const PPK_MAX = 16;
// Note: the budget of one frame; markers and road segments are each cut to 600, labels to 160.
export const CAP = { places: 600, routes: 600, labels: 160 };

export const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);
const pow2ceil = (v) => 2 ** Math.ceil(Math.log2(Math.max(1e-6, v)));

// Note: a plain 32-bit FNV-1a hash; it gives equal places a fixed order, so thinning never flickers while the map pans.
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Note: a viewport is { cx, cy, ppk }: the km at the centre of the canvas and the pixels per km; size is { w, h } in pixels.
export const makeView = (cx, cy, ppk) => ({ cx, cy, ppk: clamp(ppk, PPK_MIN, PPK_MAX) });
export const toScreen = (vp, size, x, y) => [(x - vp.cx) * vp.ppk + size.w / 2, (y - vp.cy) * vp.ppk + size.h / 2];
export const toWorld = (vp, size, sx, sy) => [vp.cx + (sx - size.w / 2) / vp.ppk, vp.cy + (sy - size.h / 2) / vp.ppk];

export function worldBox(vp, size, padPx = 0) {
  const [x0, y0] = toWorld(vp, size, -padPx, -padPx);
  const [x1, y1] = toWorld(vp, size, size.w + padPx, size.h + padPx);
  return { x0, y0, x1, y1 };
}

// Note: the viewport that shows a box of km with a margin in pixels; minSpanKm keeps a single place from filling the canvas with nothing.
export function fitBox(box, size, o = {}) {
  const pad = o.pad ?? 36;
  const minSpan = o.minSpanKm ?? 200;
  const spanX = Math.max(box.x1 - box.x0, minSpan);
  const spanY = Math.max(box.y1 - box.y0, minSpan * (size.h / size.w));
  const ppk = Math.min((size.w - 2 * pad) / spanX, (size.h - 2 * pad) / spanY, o.maxPpk ?? PPK_MAX);
  return makeView((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, ppk);
}

// Note: the whole playable world; the outlines are the only geography the map ever shows.
export const worldFrame = () => ({ x0: BOUNDARY.km.west, x1: BOUNDARY.km.east, y0: BOUNDARY.km.north, y1: BOUNDARY.km.south });

// Note: keeps the centre inside the world box plus a slack, and the zoom inside its limits.
export function clampView(vp, size, slack = 0.12) {
  const b = worldFrame();
  const sx = (b.x1 - b.x0) * slack;
  const sy = (b.y1 - b.y0) * slack;
  return makeView(clamp(vp.cx, b.x0 - sx, b.x1 + sx), clamp(vp.cy, b.y0 - sy, b.y1 + sy), vp.ppk);
}

// Note: zooms by a factor with the world point under (sx, sy) staying under it.
export function zoomAbout(vp, size, factor, sx, sy) {
  const ppk = clamp(vp.ppk * factor, PPK_MIN, PPK_MAX);
  const [wx, wy] = toWorld(vp, size, sx, sy);
  return makeView(wx - (sx - size.w / 2) / ppk, wy - (sy - size.h / 2) / ppk, ppk);
}

export const panPx = (vp, dx, dy) => makeView(vp.cx - dx / vp.ppk, vp.cy - dy / vp.ppk, vp.ppk);

// Note: a round scale bar length in km for about targetPx pixels: 1, 2 or 5 times a power of ten.
export function niceScale(ppk, targetPx = 110) {
  const want = targetPx / ppk;
  const mag = 10 ** Math.floor(Math.log10(want));
  let km = mag;
  for (const m of [1, 2, 5, 10]) if (m * mag <= want) km = m * mag;
  return { km, px: km * ppk, label: `${km >= 1 ? km : km.toFixed(1)} km` };
}

const KIND_WORD = { village: 'village', town: 'town', city: 'city', post: 'army post', station: 'stage station' };
const SIZE_WORD = ['population unknown or under 100', 'about 100 to 499 people', 'about 500 to 2,499 people', 'about 2,500 to 9,999 people', '10,000 people or more'];
const JUR_NAME = new Map(JURISDICTION_LIST.map((j) => [j.id, j]));

// Note: the data's reasons in plain words for a player; a reason this table does not know falls back to the data's own text.
export const REASON_WORDS = {
  'post-office-only': 'Recorded only as a post office in 1881; it may have been a shop, ranch or stage stop rather than a settlement.',
  'census-only': 'Listed in the 1880 census but in no 1881 post-office record.',
  'est-unknown': 'The year its post office opened is unknown.',
  'est-1881': 'Its post office opened in 1881, perhaps after 12 September.',
  'disc-1881': 'Its post office closed in 1881, perhaps before 12 September.',
  gap: 'Its post office was not always open, so it may have been closed in 1881.',
  'gnis-fuzzy': 'Its position may belong to a place with a similar name.',
  'jurisdiction-differs': 'It may lie across a border from where the map puts it.',
  'coord-conflict': 'The sources disagree on its position by more than 25 km.',
  'size-hint': 'How big the town was is a guess from general knowledge, not a census figure.',
  'fort-or-camp': 'The name starts with Fort or Camp: it may have been an army post rather than a civil town.',
};

// Note: honest words for a place whose record is doubtful, null for one the game trusts; the position of a generated place is always approximate.
export function uncertaintyNote(p) {
  if (!p || !p.uncertain) return null;
  const reasons = p.reasons || [];
  const lead = reasons.includes('post-office-only') ? 'Recorded as a post office in 1881; exact location approximate.'
    : reasons.includes('census-only') ? 'Recorded in the 1880 census; exact location approximate.'
      : 'Recorded in 1881 with some doubt; exact location approximate.';
  const more = reasons.filter((r) => r !== 'post-office-only' && r !== 'census-only').map((r) => REASON_WORDS[r]).filter(Boolean);
  return { lead, more, text: [lead, ...more].join(' ') };
}

export const jurisdictionName = (p) => (JUR_NAME.get(p.jur) || { name: '' }).name;
export const jurisdictionAbbr = (p) => (JUR_NAME.get(p.jur) || { abbr: '' }).abbr;
export const kindWord = (p) => KIND_WORD[p.kind] || p.kind;
export const sizeWord = (p) => SIZE_WORD[p.size] || SIZE_WORD[0];

// Note: the two lines of a tooltip or a list row.
export function placeLine(p) {
  return `${kindWord(p)} · ${jurisdictionAbbr(p)}${p.uncertain ? ' · doubtful record' : ''}`;
}

// Note: items are the known places with a fixed priority; routes hold the roads between two known places; grid is a coarse cell map for window queries.
export function buildIndex(places, routes = [], cellKm = 60) {
  const items = [];
  const byId = new Map();
  const grid = new Map();
  for (const p of places) {
    const it = {
      id: p.id,
      name: p.name,
      kind: p.kind,
      x: p.x,
      y: p.y,
      size: p.size,
      uncertain: !!p.uncertain,
      jur: p.jur,
      region: p.region,
      reasons: p.reasons || [],
      pri: p.size * 10000 + (p.uncertain ? 0 : 2000) + (hash32(p.id) % 1000),
    };
    items.push(it);
    byId.set(it.id, it);
    const key = Math.floor(it.x / cellKm) * 65536 + Math.floor(it.y / cellKm);
    const cell = grid.get(key);
    if (cell) cell.push(it);
    else grid.set(key, [it]);
  }
  const links = [];
  for (const r of routes) {
    const a = byId.get(r.a);
    const b = byId.get(r.b);
    if (a && b) links.push({ a, b, road: !!r.road, danger: r.danger, km: r.km });
  }
  const bySize = items.slice().sort((p, q) => q.pri - p.pri);
  return { items, byId, grid, cellKm, routes: links, bySize };
}

// Note: the known places inside a box of km, by cells when the box is small and by a plain pass when it is large.
export function inBox(index, box) {
  const { cellKm, grid, items } = index;
  const gx0 = Math.floor(box.x0 / cellKm);
  const gx1 = Math.floor(box.x1 / cellKm);
  const gy0 = Math.floor(box.y0 / cellKm);
  const gy1 = Math.floor(box.y1 / cellKm);
  const out = [];
  const take = (it) => {
    if (it.x >= box.x0 && it.x <= box.x1 && it.y >= box.y0 && it.y <= box.y1) out.push(it);
  };
  if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > items.length) {
    for (const it of items) take(it);
    return out;
  }
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      const cell = grid.get(gx * 65536 + gy);
      if (cell) for (const it of cell) take(it);
    }
  }
  return out;
}

// Note: the nearest known places to a point, straight line, widening the search until enough are found; opts: limit, maxKm, minSize, skip (id).
export function nearestKnown(index, x, y, o = {}) {
  const limit = o.limit ?? 8;
  const maxKm = o.maxKm ?? Infinity;
  const hardMax = Math.min(maxKm, 7000);
  let r = Math.min(120, hardMax);
  for (;;) {
    const found = [];
    for (const it of inBox(index, { x0: x - r, x1: x + r, y0: y - r, y1: y + r })) {
      if (it.id === o.skip || it.size < (o.minSize || 0)) continue;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d <= r) found.push({ it, d });
    }
    if (found.length >= limit || r >= hardMax) {
      found.sort((p, q) => p.d - q.d || q.it.pri - p.it.pri);
      return found.slice(0, limit);
    }
    r = Math.min(hardMax, r * 2);
  }
}

// Note: the places to draw in a viewport: pinned places always, then the best place of each world cell; the cell is a power of two so the choice holds while the map pans and changes only with the zoom.
export function selectLod(index, vp, size, o = {}) {
  const cap = o.cap ?? CAP.places;
  const cellPx = o.cellPx ?? 10;
  const box = worldBox(vp, size, o.pad ?? 12);
  const cand = inBox(index, box);
  const pins = o.pins ? new Set(o.pins) : null;
  const pinned = [];
  const rest = [];
  for (const it of cand) (pins && pins.has(it.id) ? pinned : rest).push(it);
  const room = Math.max(0, cap - pinned.length);
  let cell = pow2ceil(cellPx / vp.ppk);
  let winners;
  if (rest.length <= room && vp.ppk >= 4) winners = rest;
  else {
    for (;;) {
      const best = new Map();
      for (const it of rest) {
        const k = (Math.floor(it.x / cell) + 32768) * 65536 + Math.floor(it.y / cell) + 32768;
        const cur = best.get(k);
        if (!cur || it.pri > cur.pri) best.set(k, it);
      }
      if (best.size <= room || cell > 16384) {
        winners = [...best.values()];
        break;
      }
      cell *= 2;
    }
    if (winners.length > room) {
      winners.sort((p, q) => q.pri - p.pri);
      winners.length = room;
    }
  }
  const chosen = pinned.concat(winners).sort((p, q) => q.pri - p.pri);
  const here = o.here;
  const placed = chosen.map((it) => {
    const [sx, sy] = toScreen(vp, size, it.x, it.y);
    return { id: it.id, it, sx, sy, r: markerRadius(it, vp.ppk, pins && pins.has(it.id)), pin: !!(pins && pins.has(it.id)), here: it.id === here };
  });
  return { placed, cell, candidates: cand.length };
}

// Note: marker radius in pixels by size class.
export function markerRadius(it, ppk, pin) {
  const base = [2.3, 3.1, 3.9, 4.9, 6.2][it.size] || 2.3;
  const zoom = ppk > 3 ? 0.7 : ppk < 0.2 ? -0.3 : 0;
  return Math.max(2, base + zoom + (pin ? 0.6 : 0));
}

// Note: road segments between two drawn places, roads before trails, at most the cap; a: [sx, sy] pairs are already projected.
export function selectRoutes(index, placed, vp, size, cap = CAP.routes) {
  const at = new Map(placed.map((p) => [p.id, p]));
  const out = [];
  for (const r of index.routes) {
    const a = at.get(r.a.id);
    const b = at.get(r.b.id);
    if (!a || !b) continue;
    if (Math.hypot(a.sx - b.sx, a.sy - b.sy) < 4) continue;
    out.push({ a: [a.sx, a.sy], b: [b.sx, b.sy], road: r.road, danger: r.danger, km: r.km, from: r.a.id, to: r.b.id });
  }
  if (out.length > cap) {
    out.sort((p, q) => (q.road - p.road) || (p.km - q.km));
    out.length = cap;
  }
  return out;
}

// Note: a rough text width for node, where there is no canvas; the browser passes ctx.measureText instead.
export const approxWidth = (text, px) => text.length * px * 0.58;

const labelPx = (it, pin) => (it.size >= 4 ? 13 : it.size === 3 ? 12 : pin ? 12 : it.size === 2 ? 11 : 10);

// Note: which sizes get a name at a zoom; pinned places always do, collisions decide the rest.
export const labelGate = (ppk) => (ppk < 0.22 ? 3 : ppk < 0.45 ? 2 : ppk < 1 ? 1 : 0);

// Note: greedy label placement in priority order: right, left, above, below the marker; a label may not touch another label, any marker, a reserved rectangle or the canvas edge.
export function placeLabels(placed, size, o = {}) {
  const measure = o.measure || approxWidth;
  const max = o.maxLabels ?? CAP.labels;
  const gate = labelGate(o.ppk ?? 1);
  const hash = new Map();
  const cell = 48;
  const rects = [];
  const put = (rect) => {
    rects.push(rect);
    for (let gx = Math.floor(rect.x / cell); gx <= Math.floor((rect.x + rect.w) / cell); gx++) {
      for (let gy = Math.floor(rect.y / cell); gy <= Math.floor((rect.y + rect.h) / cell); gy++) {
        const k = gx * 4096 + gy;
        const list = hash.get(k);
        if (list) list.push(rect);
        else hash.set(k, [rect]);
      }
    }
  };
  const hits = (rect, own) => {
    for (let gx = Math.floor(rect.x / cell); gx <= Math.floor((rect.x + rect.w) / cell); gx++) {
      for (let gy = Math.floor(rect.y / cell); gy <= Math.floor((rect.y + rect.h) / cell); gy++) {
        const list = hash.get(gx * 4096 + gy);
        if (!list) continue;
        for (const q of list) {
          if (q.own === own) continue;
          if (rect.x < q.x + q.w && rect.x + rect.w > q.x && rect.y < q.y + q.h && rect.y + rect.h > q.y) return true;
        }
      }
    }
    return false;
  };
  for (const r of o.reserved || []) put({ ...r, own: null });
  for (const p of placed) put({ x: p.sx - p.r - 1, y: p.sy - p.r - 1, w: 2 * p.r + 2, h: 2 * p.r + 2, own: p.id });
  const labels = [];
  for (const p of placed) {
    if (labels.length >= max) break;
    const important = p.pin || p.here;
    if (!important && p.it.size < gate) continue;
    const px = labelPx(p.it, p.pin);
    const w = measure(p.it.name, px, true) + 2;
    const h = px + 2;
    // Note: the party's star and halo (radius 14) sit on the place it is in; the name clears them.
    const r = p.here ? Math.max(p.r, 14) : p.r;
    const gap = r + 3;
    const spots = [
      ['start', p.sx + gap, p.sy - h / 2, p.sx + gap],
      ['end', p.sx - gap - w, p.sy - h / 2, p.sx - gap],
      ['middle', p.sx - w / 2, p.sy - r - 3 - h, p.sx],
      ['middle', p.sx - w / 2, p.sy + r + 3, p.sx],
    ];
    for (const [anchor, x, y, tx] of spots) {
      const rect = { x, y, w, h, own: p.id };
      if (x < 2 || y < 2 || x + w > size.w - 2 || y + h > size.h - 2) continue;
      if (hits(rect, p.id)) continue;
      put(rect);
      labels.push({
        id: p.id, text: p.it.name, x: tx, y: y + h / 2, w, h, anchor, px, bold: true, italic: p.it.uncertain, important: !!important,
      });
      break;
    }
  }
  return labels;
}

// Note: a grid of the drawn markers so a pointer move looks at a handful of them, not all.
export function buildHitGrid(placed, cell = 32) {
  const cells = new Map();
  for (const p of placed) {
    const k = Math.floor(p.sx / cell) * 4096 + Math.floor(p.sy / cell);
    const list = cells.get(k);
    if (list) list.push(p);
    else cells.set(k, [p]);
  }
  return { cell, cells };
}

// Note: the drawn place under a point, with some slack for fingers; the nearest wins, the bigger one on a tie.
export function hitTest(grid, sx, sy, slop = 8) {
  const { cell, cells } = grid;
  let best = null;
  let bestD = Infinity;
  const reach = Math.ceil((slop + 8) / cell);
  const cx = Math.floor(sx / cell);
  const cy = Math.floor(sy / cell);
  for (let gx = cx - reach; gx <= cx + reach; gx++) {
    for (let gy = cy - reach; gy <= cy + reach; gy++) {
      const list = cells.get(gx * 4096 + gy);
      if (!list) continue;
      for (const p of list) {
        const d = Math.hypot(p.sx - sx, p.sy - sy) - p.r;
        if (d > slop) continue;
        if (d < bestD - 0.01 || (Math.abs(d - bestD) <= 0.01 && best && p.it.pri > best.it.pri)) {
          best = p;
          bestD = d;
        }
      }
    }
  }
  return best;
}

// Note: where each 1881 jurisdiction is named: the roomiest spot in its biggest ring, scored by the width of the chord there and the height of the ring above and below it.
let ANCHORS = null;
export function jurisdictionLabels() {
  if (ANCHORS) return ANCHORS;
  const outlines = jurisdictionOutlines();
  ANCHORS = JURISDICTION_LIST.map((j) => {
    const rings = outlines[j.id] || [];
    let best = null;
    for (const ring of rings) {
      const a = Math.abs(ringArea(ring));
      if (!best || a > best.a) best = { ring, a };
    }
    if (!best) return { ...j, x: 0, y: 0, widthKm: 0, heightKm: 0 };
    return { ...j, ...bestSpot(best.ring) };
  });
  return ANCHORS;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return a / 2;
}

// Note: the crossings of the ring with a horizontal (axis 1) or vertical (axis 0) line, sorted.
function crossings(ring, axis, at) {
  const other = 1 - axis;
  const out = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if ((pi[axis] > at) !== (pj[axis] > at)) out.push(((pj[other] - pi[other]) * (at - pi[axis])) / (pj[axis] - pi[axis]) + pi[other]);
  }
  return out.sort((p, q) => p - q);
}

function bestSpot(ring) {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of ring) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  let best = { x: ring[0][0], y: ring[0][1], widthKm: 0, heightKm: 0, score: -1 };
  const rows = 48;
  for (let i = 1; i < rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows;
    const xs = crossings(ring, 1, y);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x = (xs[k] + xs[k + 1]) / 2;
      const w = xs[k + 1] - xs[k];
      const ys = crossings(ring, 0, x);
      let h = 0;
      for (let m = 0; m + 1 < ys.length; m += 2) if (y >= ys[m] && y <= ys[m + 1]) h = Math.min(y - ys[m], ys[m + 1] - y) * 2;
      const score = Math.min(w, 6 * h);
      if (score > best.score) best = { x, y, widthKm: w, heightKm: h, score };
    }
  }
  return best;
}

// Note: the jurisdiction names that fit at this zoom, as screen text: the full name when it fits its state, else the short one, else none.
export function placeNames(vp, size) {
  if (vp.ppk > 0.7) return [];
  const out = [];
  for (const j of jurisdictionLabels()) {
    const [sx, sy] = toScreen(vp, size, j.x, j.y);
    if (sx < -size.w || sy < 0 || sx > 2 * size.w || sy > size.h) continue;
    const room = j.widthKm * vp.ppk * 0.86;
    const high = j.heightKm * vp.ppk * 0.8;
    for (const text of [j.name.toUpperCase(), j.abbr.toUpperCase()]) {
      const px = clamp((room / text.length - 2) / 0.66, 0, 17);
      if (px < 8 || px > high) continue;
      const w = text.length * (0.66 * px + 2);
      // Note: a name cut by the edge slides inwards, but only as far as the state itself reaches; else it waits until it fits.
      const slack = Math.max(0, (j.widthKm * vp.ppk - w) / 2);
      const x = clamp(sx, 6 + w / 2, size.w - 6 - w / 2);
      if (Math.abs(x - sx) > slack || sy - px / 2 < 4 || sy + px / 2 > size.h - 4) continue;
      out.push({ id: j.id, text, x, y: sy, px, w });
      break;
    }
  }
  return out;
}

// Note: the points of a road path: stops in order; the geometry of the road is not secret, only the names of unknown stops are, so unknown stops give a bend and no marker.
export function pathPoints(ids) {
  const out = [];
  for (const id of ids || []) if (PLACES[id]) out.push({ x: PLACES[id].x, y: PLACES[id].y });
  return out;
}

// Note: the points of a journey's legs, start to end; a partial leg after a change of course starts where the party turned.
export function legPoints(legs) {
  const out = [];
  for (const L of legs || []) {
    if (!out.length) out.push(mapPoint(L, 0));
    out.push(mapPoint(L, Math.abs(L.to - L.from)));
  }
  return out;
}

export const boundsOf = (points) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return Number.isFinite(x0) ? { x0, x1, y0, y1 } : null;
};

// Note: everything a frame draws, computed from the index, the viewport and the small overlay data; nothing here touches a canvas.
// Note: o holds party {x,y}, here (id), selected (id), cases (ids of places with an accepted case), hunt (lead marks {at, kind, tip}), plan, route and trail (points), measure(text, px, bold) and reserved (rects).
export function layoutScene(index, vp, size, o = {}) {
  const pins = [];
  if (o.here && index.byId.has(o.here)) pins.push(o.here);
  if (o.selected && index.byId.has(o.selected)) pins.push(o.selected);
  // Note: a place with an accepted case is always drawn, whatever the zoom.
  const cases = new Set((o.cases || []).filter((id) => index.byId.has(id)));
  pins.push(...cases);
  // Note: a place a lead of the hunt names is always drawn too.
  const hunt = new Map((o.hunt || []).filter((m) => index.byId.has(m.at)).map((m) => [m.at, m]));
  pins.push(...hunt.keys());
  const lod = selectLod(index, vp, size, { pins, here: o.here, cap: o.cap });
  for (const p of lod.placed) {
    p.case = cases.has(p.id);
    p.hunt = hunt.get(p.id) || null;
  }
  const routes = selectRoutes(index, lod.placed, vp, size, o.routeCap);
  const labels = placeLabels(lod.placed, size, { ppk: vp.ppk, measure: o.measure, reserved: o.reserved, maxLabels: o.maxLabels });
  const names = placeNames(vp, size);
  const line = (pts) => (pts && pts.length > 1 ? pts.map((p) => toScreen(vp, size, p.x, p.y)) : null);
  const party = o.party ? toScreen(vp, size, o.party.x, o.party.y) : null;
  const scale = niceScale(vp.ppk);
  return {
    vp,
    size,
    places: lod.placed,
    routes,
    labels,
    names,
    plan: line(o.plan),
    route: line(o.route),
    trail: line(o.trail),
    party,
    scale,
    hits: buildHitGrid(lod.placed),
    stats: {
      known: index.items.length, candidates: lod.candidates, cell: lod.cell, places: lod.placed.length, routes: routes.length, labels: labels.length, names: names.length,
    },
  };
}

// Note: the sentence a screen reader gets for the map; counts and zoom, never a name that is not on the map.
export function summarize(scene, o = {}) {
  const { stats, vp, size } = scene;
  const across = Math.round(size.w / vp.ppk);
  const shown = stats.places;
  const more = stats.known > shown ? ` of ${stats.known} known` : '';
  return `${o.title || 'Map of the American West, 1881'}. ${shown} places${more} shown, about ${across} km across. `
    + `${o.pick ? 'Arrow keys pan, plus and minus zoom, Enter chooses the place under the cross, Home shows the whole map.' : 'Arrow keys pan, plus and minus zoom, Home shows the whole map.'}`;
}

const THEME = {
  sea: '#d3bd88',
  land: { state: '#f1e6c2', territory: '#ecdeb2', unorganized: '#e5d2a0' },
  border: 'rgba(98, 66, 30, 0.75)',
  ink: '#2a1c0f',
  paper: '#f3e6c2',
  halo: 'rgba(240, 228, 190, 0.92)',
  gold: '#d9a441',
  red: '#9a3a2a',
  green: '#2f3a26',
  road: '#5a3d20',
  danger: { quiet: '#5a3d20', uneasy: '#9a6a1c', risky: '#b3501f', dangerous: '#8e1f14' },
  name: 'rgba(98, 66, 30, 0.5)',
  muted: '#5a4430',
};
const DISPLAY = "'Rockwell Extra Bold', 'Rockwell', 'Clarendon', 'Bookman Old Style', 'Georgia', serif";
const TYPEFACE = "'Courier New', 'Liberation Mono', 'DejaVu Sans Mono', monospace";
const dangerWord = (d) => (d < 0.25 ? 'quiet' : d < 0.4 ? 'uneasy' : d < 0.55 ? 'risky' : 'dangerous');

// Note: the frames live as long as the page; the screens redraw their DOM at will and just put the same figure back.
const FRAMES = new Map();
const INDEXES = new WeakMap();

// Note: the index of every known place, rebuilt only when the known list grew; it is keyed by the list itself, so another campaign never reads it.
export function knownIndex(camp) {
  const known = camp.state.known;
  const hit = INDEXES.get(known);
  if (hit && hit.n === known.length && hit.last === known[known.length - 1]) return hit.index;
  const m = camp.mapView({ limit: 1e9 });
  const index = buildIndex(m.places, m.routes);
  INDEXES.set(known, { n: known.length, last: known[known.length - 1], index });
  return index;
}

export const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

// Note: the first view: the known places around the party with a margin, never closer than a few hundred km across; Home and the whole-map button show the continent.
export function initialView(index, party, size, fit) {
  if (fit && fit.length > 1) {
    const b = boundsOf(fit);
    if (b) return fitBox(b, size, { pad: 50, minSpanKm: 120, maxPpk: 6 });
  }
  const pts = [];
  if (party) pts.push({ x: party.x, y: party.y });
  if (party) for (const f of nearestKnown(index, party.x, party.y, { limit: 60, maxKm: 450 })) pts.push({ x: f.it.x, y: f.it.y });
  if (!pts.length) for (const it of index.items.slice(0, 40)) pts.push({ x: it.x, y: it.y });
  const box = boundsOf(pts);
  if (!box) return fitBox(worldFrame(), size, { pad: 12, minSpanKm: 100 });
  return fitBox(box, size, { pad: 50, minSpanKm: 240, maxPpk: 3 });
}

function createFrame(key) {
  const W = 562;
  const H = 378;
  const size = { w: W, h: H };
  const canvas = el('canvas', { class: 'mv-canvas', tabindex: '0', role: 'application', 'data-key': 'map', width: W, height: H });
  const tip = el('div', { class: 'mv-tip', 'aria-hidden': 'true' });
  const live = el('div', { class: 'mv-live', role: 'status', 'aria-live': 'polite' });
  const tools = el('div', { class: 'mv-tools', role: 'group', 'aria-label': 'Map controls' });
  const btn = (label, text, run, id) => {
    const b = el('button', { type: 'button', class: 'mv-btn', 'aria-label': label, title: label, 'data-key': `map-${id}` }, text);
    b.addEventListener('click', run);
    tools.append(b);
    return b;
  };
  const legend = el('figcaption', { class: 'mv-legend' });
  const stage = el('div', { class: 'mv-stage' }, canvas, tools, tip, live);
  const root = el('figure', { class: 'mv', 'data-map': key }, stage, legend);
  const ctx = canvas.getContext('2d');
  const fonts = { display: DISPLAY, type: TYPEFACE };
  const widths = new Map();
  const st = {
    vp: null, goal: null, opts: {}, index: null, scene: null, raf: 0, k: 1, hover: null, cursor: null, pointers: new Map(), drag: null, anim: 0, fromMap: null, picked: null, summary: '', timer: 0, focused: false,
  };

  const measure = (text, px) => {
    const k = `${px}|${text}`;
    let w = widths.get(k);
    if (w === undefined) {
      ctx.font = `800 ${px}px ${fonts.display}`;
      w = ctx.measureText(text).width;
      if (widths.size > 4000) widths.clear();
      widths.set(k, w);
    }
    return w;
  };

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.offsetWidth ? rect.width / canvas.offsetWidth : 1;
    const k = clamp((scale || 1) * Math.min(globalThis.devicePixelRatio || 1, 2), 0.5, 3);
    if (Math.abs(k - st.k) > 0.01 || canvas.width !== Math.round(W * k)) {
      st.k = k;
      canvas.width = Math.round(W * k);
      canvas.height = Math.round(H * k);
    }
  }

  const reserved = [{ x: W - 40, y: 4, w: 36, h: 132 }, { x: 4, y: H - 44, w: 170, h: 40 }, { x: 4, y: 4, w: 250, h: 18 }];

  function compute() {
    if (!st.index || !st.vp) return null;
    const o = st.opts;
    st.scene = layoutScene(st.index, st.vp, size, {
      party: o.party, here: o.here, selected: o.selected, cases: o.cases, hunt: o.hunt, plan: o.plan, route: o.route, trail: o.trail, measure, reserved,
    });
    return st.scene;
  }

  function draw() {
    st.raf = 0;
    const scene = compute();
    fit();
    ctx.setTransform(st.k, 0, 0, st.k, 0, 0);
    if (scene && st.focused) findCursor();
    if (!scene) {
      ctx.fillStyle = THEME.sea;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    paintMap(ctx, scene, { fonts, hover: st.hover, cursor: st.focused ? st.cursor : null, focused: st.focused, selected: st.opts.selected, here: st.opts.here, measure });
    canvas.dataset.frames = String((Number(canvas.dataset.frames) || 0) + 1);
    clearTimeout(st.timer);
    st.timer = setTimeout(announce, 300);
  }

  const redraw = () => {
    if (!st.raf) st.raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(draw) : setTimeout(draw, 0);
  };

  // Note: the label and the live line change once the map has settled, not on every frame of a drag.
  function announce() {
    if (!st.scene) return;
    const text = summarize(st.scene, { pick: !!st.opts.pick });
    if (text !== st.summary) {
      st.summary = text;
      canvas.setAttribute('aria-label', text);
    }
  }

  function setView(vp, animate) {
    const next = clampView(vp, size);
    cancelAnimationFrame(st.anim);
    if (!animate || reducedMotion() || !st.vp || typeof requestAnimationFrame !== 'function') {
      st.vp = next;
      st.goal = null;
      redraw();
      return;
    }
    const from = st.vp;
    const t0 = performance.now();
    st.goal = next;
    const step = (now) => {
      const t = clamp((now - t0) / 170, 0, 1);
      const e = 1 - (1 - t) ** 3;
      const ppk = Math.exp(Math.log(from.ppk) + (Math.log(next.ppk) - Math.log(from.ppk)) * e);
      st.vp = makeView(from.cx + (next.cx - from.cx) * e, from.cy + (next.cy - from.cy) * e, ppk);
      draw();
      if (t < 1) st.anim = requestAnimationFrame(step);
      else st.goal = null;
    };
    st.anim = requestAnimationFrame(step);
  }

  // Note: a move that starts while an animation runs builds on where that animation is going, so quick keys add up.
  const aim = () => st.goal || st.vp;
  const zoomBy = (f, animate = true, sx = W / 2, sy = H / 2) => setView(zoomAbout(aim(), size, f, sx, sy), animate);
  const showAll = () => setView(fitBox(worldFrame(), size, { pad: 10, minSpanKm: 100 }), true);
  const toParty = () => {
    const p = st.opts.party;
    if (p) setView(makeView(p.x, p.y, Math.max(aim().ppk, 1.2)), true);
  };
  const toHere = () => (st.opts.party ? toParty() : showAll());

  btn('Zoom in', '+', () => zoomBy(1.6), 'in');
  btn('Zoom out', '−', () => zoomBy(1 / 1.6), 'out');
  btn('Show the whole map', '▣', showAll, 'all');
  btn('Centre on the party', '★', toHere, 'party');

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    const f = canvas.offsetWidth ? r.width / canvas.offsetWidth : 1;
    return [(e.clientX - r.left) / (f || 1), (e.clientY - r.top) / (f || 1)];
  };

  function showTip(p, sx, sy) {
    if (!p) {
      tip.classList.remove('is-on');
      return;
    }
    const note = uncertaintyNote(p.it);
    tip.replaceChildren(
      el('b', {}, p.it.name),
      el('span', {}, `${kindWord(p.it)}, ${jurisdictionName(p.it)}`),
      el('span', {}, sizeWord(p.it)),
      ...(note ? [el('span', { class: 'mv-doubt' }, note.lead)] : []),
      ...(p.hunt ? [el('span', { class: `mv-hunt is-${p.hunt.kind}` }, p.hunt.tip)] : []),
      ...(st.opts.hint ? [el('span', { class: 'mv-hint' }, st.opts.hint(p.id) || '')] : []),
    );
    tip.classList.add('is-on');
    const w = tip.offsetWidth || 200;
    const h = tip.offsetHeight || 60;
    tip.style.left = `${clamp(sx + 14, 4, W - w - 4)}px`;
    tip.style.top = `${clamp(sy + 14, 4, H - h - 4)}px`;
  }

  function hover(sx, sy) {
    const hit = st.scene ? hitTest(st.scene.hits, sx, sy, 8) : null;
    const id = hit ? hit.id : null;
    if (id !== st.hover) {
      st.hover = id;
      canvas.style.cursor = id ? (st.opts.pick ? 'pointer' : 'help') : '';
      redraw();
    }
    showTip(hit, sx, sy);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    canvas.setPointerCapture(e.pointerId);
    cancelAnimationFrame(st.anim);
    st.goal = null;
    const [sx, sy] = local(e);
    st.pointers.set(e.pointerId, { sx, sy });
    st.drag = { x: sx, y: sy, vp: st.vp, moved: false, pinch: st.pointers.size > 1 ? pinchState() : null };
    showTip(null);
  });

  const pinchState = () => {
    const [a, b] = [...st.pointers.values()];
    return { d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2, vp: st.vp };
  };

  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    if (!st.pointers.has(e.pointerId)) {
      hover(sx, sy);
      return;
    }
    st.pointers.set(e.pointerId, { sx, sy });
    if (!st.drag) return;
    if (st.pointers.size > 1) {
      const base = st.drag.pinch || (st.drag.pinch = pinchState());
      const [a, b] = [...st.pointers.values()];
      const f = (Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1) / base.d;
      st.drag.moved = true;
      setView(zoomAbout(base.vp, size, f, base.mx, base.my), false);
      return;
    }
    const dx = sx - st.drag.x;
    const dy = sy - st.drag.y;
    if (!st.drag.moved && Math.hypot(dx, dy) < 4) return;
    st.drag.moved = true;
    canvas.style.cursor = 'grabbing';
    setView(panPx(st.drag.vp, dx, dy), false);
  });

  const release = (e) => {
    const drag = st.drag;
    const had = st.pointers.delete(e.pointerId);
    if (!had || !drag) return;
    if (st.pointers.size === 0) {
      st.drag = null;
      canvas.style.cursor = '';
      if (!drag.moved && e.type === 'pointerup') {
        const [sx, sy] = local(e);
        const hit = st.scene ? hitTest(st.scene.hits, sx, sy, 10) : null;
        if (hit && st.opts.pick) pick(hit.id, true);
        else if (hit) hover(sx, sy);
      }
    } else st.drag = { x: 0, y: 0, vp: st.vp, moved: true, pinch: null };
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    if (!st.drag) {
      st.hover = null;
      showTip(null);
      redraw();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomBy(clamp(Math.exp(-dy * 0.0016), 0.8, 1.25), false, sx, sy);
    showTip(null);
  }, { passive: false });

  function pick(id, fromMap) {
    if (!st.opts.pick) return;
    if (fromMap) st.fromMap = id;
    st.opts.pick(id);
  }

  // Note: the keyboard cursor is the drawn place nearest the centre cross, within 40 px.
  function findCursor() {
    let best = null;
    let bestD = 40;
    if (st.scene) {
      for (const p of st.scene.places) {
        const d = Math.hypot(p.sx - W / 2, p.sy - H / 2);
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
    }
    const id = best ? best.id : null;
    if (id !== st.cursor) {
      st.cursor = id;
      live.textContent = best ? `${best.it.name}, ${kindWord(best.it)}, ${jurisdictionName(best.it)}${best.it.uncertain ? ', record doubtful' : ''}${st.opts.pick ? '. Press Enter to choose.' : ''}` : '';
    }
  }

  canvas.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = (e.shiftKey ? 0.6 : 0.2) * Math.min(W, H);
    const k = e.key;
    let used = true;
    if (k === 'ArrowLeft') setView(panPx(aim(), step, 0), false);
    else if (k === 'ArrowRight') setView(panPx(aim(), -step, 0), false);
    else if (k === 'ArrowUp') setView(panPx(aim(), 0, step), false);
    else if (k === 'ArrowDown') setView(panPx(aim(), 0, -step), false);
    else if (k === '+' || k === '=' || k === 'Add') zoomBy(1.5);
    else if (k === '-' || k === '_' || k === 'Subtract') zoomBy(1 / 1.5);
    else if (k === 'Home') showAll();
    else if (k === '0' || k === 'c' || k === 'C') toHere();
    else if (k === 'Enter' || k === ' ') {
      compute();
      findCursor();
      if (st.cursor && st.opts.pick) pick(st.cursor, false);
    } else used = false;
    if (!used) return;
    e.preventDefault();
    e.stopPropagation();
  });
  canvas.addEventListener('focus', () => {
    st.focused = true;
    compute();
    findCursor();
    redraw();
  });
  canvas.addEventListener('blur', () => {
    st.focused = false;
    redraw();
  });

  const tune = () => {
    const css = globalThis.getComputedStyle ? getComputedStyle(document.documentElement) : null;
    if (!css) return;
    const d = css.getPropertyValue('--display').trim();
    const t = css.getPropertyValue('--type').trim();
    if (d) fonts.display = d;
    if (t) fonts.type = t;
  };

  // Note: the legend is the same on every screen; how to move the map is said by its summary for screen readers.
  const item = (cls, text) => el('span', { class: `lg ${cls}` }, text);
  legend.replaceChildren(
    item('mv-lg-town', 'town'), item('mv-lg-vil', 'village'), item('mv-lg-vague', 'doubtful'), item('mv-lg-party', 'party'),
    item('mv-lg-road', 'road'), item('mv-lg-trail', 'trail'), item('mv-lg-case', 'case'), item('mv-lg-lead', 'lead'),
  );

  // Note: the screens call this on every draw with the current facts; the viewport changes only for a reset or a place chosen outside the map.
  function update(opts) {
    st.opts = opts;
    tools.dataset.mode = opts.pick ? 'pick' : 'view';
    const index = opts.index;
    const fresh = index !== st.index;
    st.index = index;
    if (!st.vp || opts.anchor !== st.anchor) {
      cancelAnimationFrame(st.anim);
      st.goal = null;
      st.vp = initialView(index, opts.party, size, opts.fit);
      st.anchor = opts.anchor;
      st.revealKey = null;
    }
    const rk = opts.reveal ? opts.reveal.key : null;
    if (rk !== st.revealKey) {
      st.revealKey = rk;
      const box = rk && st.fromMap !== rk ? boundsOf(opts.reveal.points) : null;
      if (box) setView(fitBox(box, size, { pad: 60, minSpanKm: 120, maxPpk: 6 }), true);
    }
    st.fromMap = null;
    if (opts.follow && opts.party && st.vp) {
      const [sx, sy] = toScreen(st.vp, size, opts.party.x, opts.party.y);
      if (sx < 40 || sy < 40 || sx > W - 40 || sy > H - 40) st.vp = makeView(opts.party.x, opts.party.y, st.vp.ppk);
    }
    if (fresh) st.cursor = null;
    redraw();
    return root;
  }

  root.dataset.ready = '1';
  tune();
  return {
    root, update, canvas, state: st, size, redraw, draw, setView, zoomBy, showAll, toParty, compute,
  };
}

// Note: the one figure of a screen; the same element comes back on every call, so the viewport and the focus target survive the screens' redraws.
export function mapFrame(key, opts) {
  let f = FRAMES.get(key);
  if (!f) {
    f = createFrame(key);
    FRAMES.set(key, f);
  }
  return f.update(opts);
}

export const frameOf = (key) => FRAMES.get(key) || null;

function tracePath(ctx, scene, ring) {
  const { vp, size } = scene;
  const k = vp.ppk;
  const ox = size.w / 2 - vp.cx * k;
  const oy = size.h / 2 - vp.cy * k;
  let lx = 0;
  let ly = 0;
  let started = false;
  for (let i = 0; i < ring.length; i++) {
    const x = ring[i][0] * k + ox;
    const y = ring[i][1] * k + oy;
    if (started && Math.abs(x - lx) < 0.6 && Math.abs(y - ly) < 0.6 && i < ring.length - 1) continue;
    if (!started) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    started = true;
    lx = x;
    ly = y;
  }
  ctx.closePath();
}

function paintOutlines(ctx, scene) {
  const outlines = jurisdictionOutlines();
  for (const j of JURISDICTION_LIST) {
    const rings = outlines[j.id] || [];
    ctx.beginPath();
    for (const ring of rings) tracePath(ctx, scene, ring);
    ctx.fillStyle = THEME.land[j.type] || THEME.land.state;
    ctx.fill();
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.border;
  for (const j of JURISDICTION_LIST) {
    const rings = outlines[j.id] || [];
    ctx.beginPath();
    for (const ring of rings) tracePath(ctx, scene, ring);
    ctx.lineWidth = j.type === 'state' ? 1.25 : 1.1;
    ctx.setLineDash(j.type === 'state' ? [] : j.type === 'territory' ? [6, 3] : [1.5, 3]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function strokeLine(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function star(ctx, x, y, R) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 ? R * 0.45 : R;
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function marker(ctx, p, mode) {
  const it = p.it;
  const { sx: x, sy: y, r } = p;
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = THEME.ink;
  ctx.beginPath();
  if (it.kind === 'post') ctx.rect(x - r, y - r, 2 * r, 2 * r);
  else if (it.kind === 'station') {
    ctx.moveTo(x, y - r * 1.25);
    ctx.lineTo(x + r * 1.2, y + r);
    ctx.lineTo(x - r * 1.2, y + r);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = p.here ? THEME.gold : it.uncertain ? THEME.paper : THEME.ink;
  if (mode === 'hover') ctx.fillStyle = THEME.gold;
  ctx.fill();
  ctx.stroke();
  if (it.size >= 4 && !it.uncertain && !p.here) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = THEME.paper;
    ctx.fill();
  }
  if (p.hunt) huntMark(ctx, x, y, r, p.hunt);
  if (p.case) caseMark(ctx, x + r + 4, y - r - 4);
}

// Note: a lead of the hunt: a crosshair centred on the place and around its marker, red on an ink halo for the nemesis, ink on a paper halo for one of his men.
function huntMark(ctx, x, y, r, m) {
  const big = m.kind === 'nemesis';
  // Note: the ring stays inside the selection ring at r + 6; the ticks start just outside the marker, so the place stays readable.
  const R = r + 4.5;
  const path = () => {
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * (r + 1.5), y + dy * (r + 1.5));
      ctx.lineTo(x + dx * (R + 4), y + dy * (R + 4));
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = big ? THEME.ink : THEME.paper;
  ctx.lineWidth = 4;
  ctx.stroke();
  path();
  ctx.strokeStyle = big ? THEME.red : THEME.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// Note: an accepted case waiting at a place: a small red diamond with a dark rim, up and to the right of the marker.
function caseMark(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x + 5.5, y);
  ctx.lineTo(x, y + 7);
  ctx.lineTo(x - 5.5, y);
  ctx.closePath();
  ctx.fillStyle = THEME.red;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = THEME.ink;
  ctx.stroke();
}

// Note: the whole frame; drawing order is land, names, roads, route overlays, markers, labels, party, then the fixed furniture.
export function paintMap(ctx, scene, o) {
  const { size, vp } = scene;
  const { fonts } = o;
  const font = (px, weight = 800, face = fonts.display, italic = false) => `${italic ? 'italic ' : ''}${weight} ${px}px ${face}`;
  ctx.fillStyle = THEME.sea;
  ctx.fillRect(0, 0, size.w, size.h);
  paintOutlines(ctx, scene);
  const grad = ctx.createRadialGradient(size.w / 2, size.h / 2, size.h * 0.35, size.w / 2, size.h / 2, size.w * 0.7);
  grad.addColorStop(0, 'rgba(98, 56, 18, 0)');
  grad.addColorStop(1, 'rgba(98, 56, 18, 0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  ctx.textAlign = 'center';
  ctx.fillStyle = THEME.name;
  for (const n of scene.names) {
    ctx.font = font(n.px, 700);
    ctx.fillText(n.text, n.x, n.y);
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.lineCap = 'round';
  for (const r of scene.routes) {
    ctx.strokeStyle = THEME.danger[dangerWord(r.danger)];
    ctx.lineWidth = r.road ? (vp.ppk > 1 ? 2 : 1.4) : 1;
    ctx.globalAlpha = r.road ? 0.85 : 0.7;
    ctx.setLineDash(r.road ? [] : [4, 3]);
    ctx.beginPath();
    ctx.moveTo(r.a[0], r.a[1]);
    ctx.lineTo(r.b[0], r.b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  if (scene.route) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = THEME.halo;
    ctx.lineWidth = 6;
    strokeLine(ctx, scene.route);
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 3;
    strokeLine(ctx, scene.route);
  }
  if (scene.plan) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = THEME.halo;
    ctx.lineWidth = 6;
    strokeLine(ctx, scene.plan);
    ctx.strokeStyle = THEME.red;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 4]);
    strokeLine(ctx, scene.plan);
    ctx.setLineDash([]);
  }
  if (scene.trail) {
    ctx.strokeStyle = THEME.green;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    strokeLine(ctx, scene.trail);
    ctx.setLineDash([]);
  }
  for (let i = scene.places.length - 1; i >= 0; i--) {
    const p = scene.places[i];
    if (p.id === o.selected) {
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, p.r + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 164, 65, 0.3)';
      ctx.fill();
      ctx.strokeStyle = THEME.red;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
    marker(ctx, p, p.id === o.hover ? 'hover' : '');
  }
  const cur = o.cursor && scene.places.find((p) => p.id === o.cursor);
  if (cur) {
    ctx.beginPath();
    ctx.arc(cur.sx, cur.sy, cur.r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  for (const l of scene.labels) {
    ctx.font = font(l.px, l.bold ? 800 : 600, fonts.display, l.italic);
    ctx.textAlign = l.anchor === 'start' ? 'left' : l.anchor === 'end' ? 'right' : 'center';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = THEME.halo;
    ctx.strokeText(l.text, l.x, l.y);
    ctx.fillStyle = l.id === o.selected ? THEME.red : THEME.ink;
    ctx.fillText(l.text, l.x, l.y);
  }
  if (scene.party) {
    const [px, py] = scene.party;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217, 164, 65, 0.38)';
    ctx.fill();
    star(ctx, px, py, 9.5);
    ctx.fillStyle = THEME.gold;
    ctx.fill();
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  if (o.focused) {
    ctx.strokeStyle = 'rgba(26, 20, 16, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size.w / 2 - 9, size.h / 2);
    ctx.lineTo(size.w / 2 + 9, size.h / 2);
    ctx.moveTo(size.w / 2, size.h / 2 - 9);
    ctx.lineTo(size.w / 2, size.h / 2 + 9);
    ctx.stroke();
  }
  // Note: counts, scale bar and the north arrow each sit on a paper pill, so the names below do not run into them.
  ctx.textAlign = 'left';
  ctx.font = font(10.5, 700, fonts.type);
  const { known, candidates, places } = scene.stats;
  const count = candidates === 0 ? `No known place in view (${known.toLocaleString('en-US')} known)` : candidates > places ? `${places} of ${candidates.toLocaleString('en-US')} known places in view` : `${candidates} known ${candidates === 1 ? 'place' : 'places'} in view`;
  const pill = (x, y, w, h) => {
    ctx.fillStyle = 'rgba(243, 230, 194, 0.86)';
    ctx.fillRect(x, y, w, h);
  };
  pill(3, 3, ctx.measureText(count).width + 10, 16);
  ctx.fillStyle = THEME.muted;
  ctx.fillText(count, 8, 15);
  const bx = 10;
  const by = size.h - 14;
  const sc = scene.scale;
  pill(3, by - 28, sc.px + 54, 38);
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by - 4);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + sc.px, by);
  ctx.lineTo(bx + sc.px, by - 4);
  ctx.stroke();
  ctx.fillStyle = THEME.ink;
  ctx.fillText(sc.label, bx, by - 11);
  ctx.beginPath();
  ctx.moveTo(bx + sc.px + 20, by + 2);
  ctx.lineTo(bx + sc.px + 24, by - 12);
  ctx.lineTo(bx + sc.px + 28, by + 2);
  ctx.lineTo(bx + sc.px + 24, by - 2);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillText('N', bx + sc.px + 24, by - 18);
}
