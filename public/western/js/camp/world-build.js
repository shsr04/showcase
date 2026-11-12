// Note: builds the playable world once at import from the generated settlements and routes alone, with indexes so no call scans the whole world.

import {
  SETTLEMENTS, ROUTE_EDGES, JURISDICTIONS, REGIONS, UNCERTAINTY_REASONS, OUTLINES, decodeServices,
} from './world-data.js';
import { REGION_PROFILE, SITE_LABEL } from './world-regions.js';

// Note: a plain 32-bit FNV-1a hash; the same text always gives the same number, so generated routes never depend on the order of building.
function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const KIND_WORD = { village: 'village', town: 'town', city: 'city', post: 'army post', station: 'stage station' };
const CELL = 100;
const MAX_TREES = 24;
const cellKey = (cx, cy) => (cx + 64) * 256 + (cy + 64);
const cellOf = (v) => Math.floor(v / CELL);

// Note: the places, built in one pass with shared lists and strings.
function buildPlaces() {
  const N = SETTLEMENTS.length;
  const REGION_IDS = REGIONS.map((r) => r.id);
  const PLACES = {};
  const ids = new Array(N);
  const placeOf = new Array(N);
  const regionNoOf = new Uint8Array(N);
  const indexOf = new Map();

  const maskReasons = new Map();
  const reasonsOf = (mask) => {
    let r = maskReasons.get(mask);
    if (!r) {
      r = Object.freeze(UNCERTAINTY_REASONS.filter((_, i) => mask & (1 << i)).map((x) => x.id));
      maskReasons.set(mask, r);
    }
    return r;
  };

  // Note: one shared site list per region and size class.
  const siteSets = [];
  function sitesFor(regionNo, size) {
    const key = regionNo * 2 + (size >= 2 ? 1 : 0);
    let sites = siteSets[key];
    if (!sites) {
      const region = REGION_IDS[regionNo];
      const town = size >= 2 ? 'town' : 'the settlement';
      sites = [{ kind: 'house', terrain: null, label: `a house at the edge of ${town}`, w: size >= 2 ? 4 : 3 }];
      for (const [terrain, share] of REGION_PROFILE[region].mix.slice(0, 3)) sites.push({ kind: 'outdoor', terrain, label: SITE_LABEL[terrain](town), w: Math.max(1, Math.round(share * 6)) });
      if (size >= 2) sites.push({ kind: 'outdoor', terrain: 'stage-road', label: SITE_LABEL['stage-road'](town), w: 1 });
      sites = Object.freeze(sites.map((s) => Object.freeze(s)));
      siteSets[key] = sites;
    }
    return sites;
  }

  // Note: a blurb without a census count is built once per kind and jurisdiction.
  const blurbSets = [];
  function blurbFor(t, jur) {
    const word = KIND_WORD[t[9]] || 'settlement';
    if (t[7]) return `A ${word} in ${jur.name}, with about ${Number(t[7]).toLocaleString('en-US')} people at the 1880 census.`;
    const byKind = blurbSets[t[2]] || (blurbSets[t[2]] = new Map());
    let blurb = byKind.get(t[9]);
    if (blurb === undefined) {
      blurb = `A ${word} in ${jur.name}.`;
      byKind.set(t[9], blurb);
    }
    return blurb;
  }

  const xs = new Float64Array(N);
  const ys = new Float64Array(N);
  const grids = [0, 1, 2, 3, 4].map(() => new Map());
  for (let i = 0; i < N; i++) {
    const t = SETTLEMENTS[i];
    const id = t[0];
    const regionNo = t[10];
    const region = REGION_IDS[regionNo];
    const jur = JURISDICTIONS[t[2]];
    // Note: one literal per place keeps every place object the same shape.
    const place = {
      id,
      name: t[1],
      kind: t[9],
      x: t[5],
      y: t[6],
      since: 1881,
      uncertain: t[12] !== 0,
      blurb: blurbFor(t, jur),
      services: decodeServices(t[13]),
      sites: sitesFor(regionNo, t[8]),
      idx: i,
      jur: jur.id,
      region,
      size: t[8],
      pop: t[7] || null,
      lon: t[3],
      lat: t[4],
      reasons: reasonsOf(t[12]),
    };
    PLACES[id] = place;
    placeOf[i] = place;
    regionNoOf[i] = regionNo;
    ids[i] = id;
    indexOf.set(id, i);
    xs[i] = place.x;
    ys[i] = place.y;
    // Note: one grid per minimum size class, so large-place searches skip villages.
    const cell = cellKey(cellOf(xs[i]), cellOf(ys[i]));
    for (let minSize = 0, top = Math.min(t[8], 4); minSize <= top; minSize++) {
      const grid = grids[minSize];
      const list = grid.get(cell);
      if (list) list.push(i);
      else grid.set(cell, [i]);
    }
  }
  return { N, PLACES, ids, placeOf, regionNoOf, indexOf, xs, ys, grids };
}

// Note: the routes, one per generated edge.
function buildRoutes({ N, ids, placeOf, regionNoOf }) {
  const PROFILES = REGIONS.map((r) => REGION_PROFILE[r.id]);

  const segmentSets = new Map();
  function segmentsFor(na, nb, road, variant) {
    const key = ((na * 32 + nb) * 2 + (road ? 1 : 0)) * 3 + variant;
    let segs = segmentSets.get(key);
    if (segs) return segs;
    const mix = new Map();
    for (const [region, w] of na === nb ? [[na, 1]] : [[na, 0.5], [nb, 0.5]]) for (const [t, s] of PROFILES[region].mix) mix.set(t, (mix.get(t) || 0) + s * w);
    const roadShare = road ? 0.6 : 0;
    let parts = [...mix].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).slice(0, 3);
    const total = parts.reduce((s, p) => s + p[1], 0);
    parts = parts.map(([t, s]) => [t, (s / total) * (1 - roadShare)]).filter(([, s]) => s >= 0.05);
    if (roadShare) parts.push(['stage-road', roadShare]);
    const sum = parts.reduce((s, p) => s + p[1], 0);
    let hundredths = parts.map(([, s]) => Math.max(1, Math.round((s / sum) * 100)));
    hundredths[hundredths.length - 1] = 100 - hundredths.slice(0, -1).reduce((s, v) => s + v, 0);
    if (hundredths[hundredths.length - 1] < 1) {
      hundredths = hundredths.slice(0, -1);
      parts = parts.slice(0, -1);
      hundredths[0] = 100 - hundredths.slice(1).reduce((s, v) => s + v, 0);
    }
    let list = parts.map(([t], i) => ({ terrain: t, share: hundredths[i] / 100 }));
    if (variant === 1) list = list.reverse();
    else if (variant === 2) list = [...list.slice(1), list[0]];
    segs = Object.freeze(list.map((s) => Object.freeze(s)));
    segmentSets.set(key, segs);
    return segs;
  }

  const EMPTY = Object.freeze([]);
  const waterSets = new Map();
  function waterFor(n, variant) {
    if (!n) return EMPTY;
    const key = n * 3 + variant;
    let w = waterSets.get(key);
    if (!w) {
      w = Object.freeze(Array.from({ length: n }, (_, i) => round2(clamp((i + 0.5) / n + (variant - 1) * 0.04, 0.05, 0.95))));
      waterSets.set(key, w);
    }
    return w;
  }

  // Note: danger follows the region, the road and the remoteness; water follows the region's wetness; both are guesses and carry a small stable jitter.
  function makeRoute(a, b, na, nb, km, road, id) {
    const h = hash32(id);
    const pa = PROFILES[na];
    const pb = PROFILES[nb];
    const danger = round2(clamp(0.1 + (pa.danger + pb.danger) / 2 + (road ? -0.04 : 0.08) + (km > 150 ? 0.12 : km > 80 ? 0.06 : 0) + (h % 9) / 100, 0.08, 0.7));
    const spacing = (pa.spring + pb.spring) / 2;
    const n = Math.min(6, Math.floor(km / spacing + ((h >>> 12) % 100) / 100));
    return {
      id, a: a.id, b: b.id, km, road, danger, water: waterFor(n, (h >>> 20) % 3), segments: segmentsFor(na, nb, road, (h >>> 4) % 3),
    };
  }

  const ROUTES = {};
  const maxEdges = ROUTE_EDGES.length;
  const edgeA = new Int32Array(maxEdges);
  const edgeB = new Int32Array(maxEdges);
  const edgeRoute = [];
  const adjStart = new Int32Array(N + 1);
  // Note: a generated id holds a tilde, so Object.keys keeps insertion order.
  const ROUTE_IDS = [];
  // Note: without a tilde or hash in any place id, only a repeated pair can clash.
  const plainIds = !ids.some((id) => id.includes('~') || id.includes('#'));
  const seenPairs = new Set();
  for (let e = 0; e < ROUTE_EDGES.length; e++) {
    const edge = ROUTE_EDGES[e];
    const ai = edge[0];
    const bi = edge[1];
    const pair = ai * N + bi;
    const a = placeOf[ai];
    const b = placeOf[bi];
    let id = `${a.id}~${b.id}`;
    if (!plainIds || seenPairs.has(pair)) for (let n = 2; ROUTES[id]; n++) id = `${a.id}~${b.id}#${n}`;
    seenPairs.add(pair);
    const r = makeRoute(a, b, regionNoOf[ai], regionNoOf[bi], edge[2], edge[3] === 1, id);
    ROUTES[id] = r;
    ROUTE_IDS.push(id);
    edgeA[edgeRoute.length] = ai;
    edgeB[edgeRoute.length] = bi;
    edgeRoute.push(r);
    adjStart[ai + 1]++;
    adjStart[bi + 1]++;
  }
  return { ROUTES, ROUTE_IDS, edgeA, edgeB, edgeRoute, adjStart };
}

// Note: compressed adjacency; a node's slots keep route insertion order, so ties between equal distances break the same way every time.
function buildAdjacency(N, { edgeA, edgeB, edgeRoute, adjStart }) {
  const E = edgeRoute.length;
  for (let i = 0; i < N; i++) adjStart[i + 1] += adjStart[i];
  const slots = E * 2;
  const adjTo = new Int32Array(slots);
  const adjKm = new Float64Array(slots);
  const adjRoad = new Uint8Array(slots);
  const adjRoute = new Array(slots);
  const fillAt = adjStart.slice(0, N);
  for (let e = 0; e < E; e++) {
    const a = edgeA[e];
    const b = edgeB[e];
    const r = edgeRoute[e];
    const km = r.km;
    const road = r.road ? 1 : 0;
    let k = fillAt[a]++;
    adjTo[k] = b;
    adjKm[k] = km;
    adjRoad[k] = road;
    adjRoute[k] = r;
    k = fillAt[b]++;
    adjTo[k] = a;
    adjKm[k] = km;
    adjRoad[k] = road;
    adjRoute[k] = r;
  }
  return { adjStart, adjTo, adjKm, adjRoad, adjRoute };
}

export function buildWorld() {
  const places = buildPlaces();
  const { N, PLACES, ids, xs, ys, grids } = places;
  const PLACE_IDS = ids.slice();
  const routes = buildRoutes(places);
  const { ROUTES, ROUTE_IDS } = routes;
  const { adjStart, adjTo, adjKm, adjRoad, adjRoute } = buildAdjacency(N, routes);
  const indexOf = places.indexOf;

  const idxOf = (id) => (typeof id === 'string' ? indexOf.get(id) : undefined);

  const routeBetween = (a, b) => {
    const ai = idxOf(a);
    const bi = idxOf(b);
    if (ai === undefined || bi === undefined) return null;
    for (let k = adjStart[ai]; k < adjStart[ai + 1]; k++) if (adjTo[k] === bi) return adjRoute[k];
    return null;
  };

  const neighbours = (id) => {
    const i = idxOf(id);
    if (i === undefined) return [];
    const out = [];
    for (let k = adjStart[i]; k < adjStart[i + 1]; k++) out.push(ids[adjTo[k]]);
    return out;
  };

  const routesOf = (id) => {
    const i = idxOf(id);
    if (i === undefined) return [];
    const out = [];
    for (let k = adjStart[i]; k < adjStart[i + 1]; k++) out.push(adjRoute[k]);
    return out;
  };

  // Note: a stable min-heap retains insertion order for equal-distance routes.
  function search(from, wagonOnly, target = -1, limit = Infinity) {
    const best = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = [];
    let order = 0;
    const earlier = (p, q) => p.d < q.d || (p.d === q.d && p.o < q.o);
    const push = (n, d) => {
      const node = { n, d, o: order++ };
      let i = heap.length;
      heap.push(node);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (!earlier(node, heap[parent])) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = node;
    };
    const pop = () => {
      const first = heap[0];
      const last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && earlier(heap[child + 1], heap[child])) child++;
          if (!earlier(heap[child], last)) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    best[from] = 0;
    push(from, 0);
    while (heap.length) {
      const { n: cur, d: distance } = pop();
      if (distance !== best[cur]) continue;
      if (cur === target || distance > limit) break;
      for (let k = adjStart[cur]; k < adjStart[cur + 1]; k++) {
        if (wagonOnly && !adjRoad[k]) continue;
        const nd = distance + adjKm[k];
        const to = adjTo[k];
        if (nd < best[to]) {
          best[to] = nd;
          prev[to] = cur;
          push(to, nd);
        }
      }
    }
    return { best, prev };
  }

  function pathIdx(prev, from, to) {
    const out = [to];
    while (out[0] !== from) out.unshift(prev[out[0]]);
    return out;
  }

  // Note: a full search result, cached because the world data never changes; best and prev feed shortestPath and placesWithin, km and path take place ids.
  const trees = new Map();
  function routeTree(from, wagonOnly = false) {
    const fi = idxOf(from);
    if (fi === undefined) return null;
    const key = `${wagonOnly ? 1 : 0}|${from}`;
    let tree = trees.get(key);
    if (tree) {
      trees.delete(key);
      trees.set(key, tree);
      return tree;
    }
    const { best, prev } = search(fi, !!wagonOnly);
    tree = {
      best,
      prev,
      km(id) {
        const i = idxOf(id);
        return i === undefined || best[i] === Infinity ? undefined : best[i];
      },
      path(id) {
        const i = idxOf(id);
        if (i === undefined || best[i] === Infinity) return null;
        return pathIdx(prev, fi, i).map((x) => ids[x]);
      },
    };
    trees.set(key, tree);
    if (trees.size > MAX_TREES) trees.delete(trees.keys().next().value);
    return tree;
  }

  // Note: one search supplies all distances, including to places not yet discovered.
  function distancesFrom(from, wagonOnly = false) {
    const tree = routeTree(from, wagonOnly);
    const out = new Map();
    if (!tree) return out;
    for (let i = 0; i < N; i++) if (tree.best[i] !== Infinity) out.set(ids[i], tree.best[i]);
    return out;
  }

  // Note: shortest path by distance, over wagon routes only when wagonOnly is set; a cached full search answers at once, otherwise the search stops at the target.
  function shortestPath(from, to, wagonOnly = false) {
    const fi = idxOf(from);
    const ti = idxOf(to);
    if (fi === undefined || ti === undefined) return null;
    const cached = trees.get(`${wagonOnly ? 1 : 0}|${from}`);
    const { best, prev } = cached || search(fi, !!wagonOnly, ti);
    if (best[ti] === Infinity) return null;
    return { km: best[ti], places: pathIdx(prev, fi, ti).map((x) => ids[x]) };
  }

  // Note: every place within maxKm of route distance, in place order; a bounded search is much cheaper than a full tree and the result is exact.
  function placesWithin(from, maxKm, wagonOnly = false) {
    const fi = idxOf(from);
    if (fi === undefined) return [];
    const { best } = trees.get(`${wagonOnly ? 1 : 0}|${from}`) || search(fi, !!wagonOnly, -1, maxKm);
    const out = [];
    for (let i = 0; i < N; i++) if (best[i] <= maxKm) out.push({ id: ids[i], idx: i, km: best[i] });
    return out;
  }

  // Note: places within radius km (straight line) of a point, nearest first; opts: minSize, limit, filter(place).
  function placesNear(x, y, radius, opts = {}) {
    const grid = grids[clamp(opts.minSize | 0, 0, 4)];
    const r2 = radius * radius;
    const out = [];
    for (let cx = cellOf(x - radius); cx <= cellOf(x + radius); cx++) {
      for (let cy = cellOf(y - radius); cy <= cellOf(y + radius); cy++) {
        const list = grid.get(cellKey(cx, cy));
        if (!list) continue;
        for (const i of list) {
          const dx = xs[i] - x;
          const dy = ys[i] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2 || (opts.filter && !opts.filter(PLACES[ids[i]]))) continue;
          out.push({ id: ids[i], idx: i, d: Math.sqrt(d2) });
        }
      }
    }
    out.sort((p, q) => p.d - q.d || p.idx - q.idx);
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  // Note: the closest place to a point, widening the search ring by ring; null only for an empty world.
  function nearestPlace(x, y, opts = {}) {
    for (let r = CELL; r <= 6400; r *= 2) {
      const found = placesNear(x, y, r, { ...opts, limit: 1 });
      if (found.length) return found[0];
    }
    return null;
  }

  const rings = [];
  for (const [jid, list] of Object.entries(OUTLINES)) {
    for (const pts of list) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const px = pts[i][0];
        const py = pts[i][1];
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
      rings.push({ jid, pts, x0, x1, y0, y1 });
    }
  }
  function inRing(ring, x, y) {
    if (x < ring.x0 || x > ring.x1 || y < ring.y0 || y > ring.y1) return false;
    let inside = false;
    const pts = ring.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Note: the simplified outlines are good to about a kilometre and lack tiny islands; a point in none of them takes the jurisdiction of the nearest place.
  function jurisdictionAt(x, y) {
    for (const ring of rings) if (inRing(ring, x, y)) return ring.jid;
    const near = nearestPlace(x, y);
    return near ? PLACES[near.id].jur : null;
  }

  return {
    PLACES, PLACE_IDS, ROUTES, ROUTE_IDS, routeBetween, neighbours, routesOf, routeTree, distancesFrom, shortestPath, placesWithin, placesNear, nearestPlace, jurisdictionAt,
  };
}
