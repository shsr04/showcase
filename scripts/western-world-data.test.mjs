import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { build, parseCsv, INPUTS, OUTPUTS, RULES, SIZE_HINTS, WELL_KNOWN_POSTS } from './western-build-world.mjs';
import * as W from '../public/western/js/camp/world-data.js';
import { ROUTE_STRAY_KM, distancesFrom } from '../public/western/js/camp/world.js';
import { inRing } from './western-test-helpers.mjs';

const file = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(file(p), 'utf8');
const geo = JSON.parse(read(INPUTS.geo));
const poRows = parseCsv(read(INPUTS.po));
const censusRows = parseCsv(read(INPUTS.census));
const poById = new Map(poRows.map((r) => [Number(r.ID), r]));
const csById = new Map(censusRows.map((r) => [Number(r.ID), r]));
const built = build();
const S = W.SETTLEMENTS;
const places = W.allSettlements();
const byId = new Map(places.map((p, i) => [p.id, i]));

const polygonsOf = ({ geometry: g }) => ({ Polygon: [g.coordinates], MultiPolygon: g.coordinates })[g.type];
// Note: the same ray casting with the edges of a ring bucketed by latitude band, so the answer is the full scan's.
const BANDS = 64;
function indexRing(ring) {
  const lats = ring.map(([, y]) => y);
  const lo = Math.min(...lats);
  const h = (Math.max(...lats) - lo) / BANDS;
  const band = (lat) => Math.floor((lat - lo) / h);
  const bands = Array.from({ length: BANDS + 1 }, () => []);
  ring.forEach(([xi, yi], i) => {
    const [xj, yj] = ring[(i + ring.length - 1) % ring.length];
    for (let b = band(Math.min(yi, yj)); b <= band(Math.max(yi, yj)); b++) bands[b].push([xi, yi, xj, yj]);
  });
  return { band, bands };
}
function inIndexed(lon, lat, { band, bands }) {
  let inside = false;
  for (const [xi, yi, xj, yj] of bands[Math.min(BANDS, Math.max(0, band(lat)))]) inside = inside !== ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
  return inside;
}
const indexed = new Map(geo.features.map((f) => [f, polygonsOf(f).map((rings) => rings.map(indexRing))]));
function insideFeature(feature, lon, lat) {
  return indexed.get(feature).some(([outer, ...holes]) => inIndexed(lon, lat, outer) && !holes.some((r) => inIndexed(lon, lat, r)));
}
// Note: a year column of the post-office rows; an empty cell is unknown.
const year = (v) => (v === '' ? null : Number(v));
const features = new Map(geo.features.map((f) => [f.properties.ID, f]));

// Note: great-circle distance with the same earth radius the builder documents.
function gcKm(lat1, lon1, lat2, lon2) {
  const t = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * t) / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(((lon2 - lon1) * t) / 2) ** 2;
  return 2 * RULES.earthKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Note: an adjacency list of [neighbour, km] pairs per place; the edge lengths are whole km, as the graph test checks.
function adjacency(edges) {
  const adj = Array.from({ length: S.length }, () => []);
  for (const [a, b, km] of edges) {
    adj[a].push([b, km]);
    adj[b].push([a, km]);
  }
  return adj;
}

// Note: shortest distances by Dial's buckets, one bucket per whole km up to a bound no route of the map reaches; independent of the builder and of world.js.
const BUCKET_BOUND_KM = 20000;
function distancesOver(adj, source) {
  const dist = new Float64Array(S.length).fill(Infinity);
  dist[source] = 0;
  const buckets = Array.from({ length: BUCKET_BOUND_KM }, () => []);
  buckets[0].push(source);
  for (let d = 0; d < BUCKET_BOUND_KM; d++) {
    // Note: each place settled at this distance is taken once, at its first entry in the bucket.
    for (const u of buckets[d].filter((n, k, all) => dist[n] === d && all.indexOf(n) === k)) {
      for (const [v, km] of adj[u]) {
        assert.ok(d + km < BUCKET_BOUND_KM, 'a distance beyond the bucket bound');
        dist[v] = Math.min(dist[v], d + km);
        buckets[d + km].push(v);
      }
    }
  }
  return dist;
}

// Note: the graph of every route and the graph of the wagon roads only, built once, measured from Tombstone as the audit is.
const ANY_ROUTE = adjacency(W.ROUTE_EDGES);
const WAGON_ROAD = adjacency(W.ROUTE_EDGES.filter(([, , , road]) => road === 1));
const fromTombstone = { any: distancesOver(ANY_ROUTE, byId.get('tombstone-az')), wagon: distancesOver(WAGON_ROAD, byId.get('tombstone-az')) };
const wagonFromTombstone = fromTombstone.wagon;

test('x and y follow the documented projection', () => {
  for (const p of places) {
    const q = W.project(p.lon, p.lat);
    assert.ok(Math.abs(q.x - p.x) <= 0.1 && Math.abs(q.y - p.y) <= 0.1, `${p.id}: ${p.x},${p.y} against ${q.x},${q.y}`);
  }
  const t = places[byId.get('tombstone-az')];
  assert.deepEqual([t.x, t.y], [0, 0], 'the Tombstone office is the origin');
});

test('rebuilding in memory reproduces the committed module byte for byte', () => {
  assert.equal(built.moduleText, read(OUTPUTS.module), 'run node scripts/western-build-world.mjs to refresh world-data.js');
  assert.ok(built.auditText.length > 1000, 'the audit is still rendered for --audit');
  assert.match(built.moduleText.split('\n')[0], /^\/\/ Attention: generated by scripts\/western-build-world\.mjs/);
});

test('module stays under the size cap and exports the required names', () => {
  assert.ok(statSync(file(OUTPUTS.module)).size < RULES.moduleCapBytes);
  for (const name of ['JURISDICTIONS', 'REGIONS', 'SOURCE_TABLE', 'SETTLEMENTS', 'ROUTE_EDGES', 'OUTLINES', 'AUDIT_COUNTS']) assert.ok(name in W, name);
  assert.equal(W.SNAPSHOT, '1881-09-12');
});

test('the 22 jurisdictions are those of the boundary file', () => {
  assert.equal(W.JURISDICTIONS.length, 22);
  assert.deepEqual(W.JURISDICTIONS.map((j) => j.id).sort(), [...features.keys()].sort());
});

test('every place has a real coordinate inside its own jurisdiction', () => {
  for (const p of places) {
    assert.ok(Number.isFinite(p.lon) && Number.isFinite(p.lat) && Number.isFinite(p.x) && Number.isFinite(p.y), p.id);
    assert.ok(p.lon < -88 && p.lon > -125 && p.lat > 25 && p.lat < 50, `${p.id} lon/lat plausible`);
    assert.ok(insideFeature(features.get(p.jur), p.lon, p.lat), `${p.id} lies in ${p.jur}`);
  }
});

test('route graph is valid, short-edged and connected from Tombstone', () => {
  const seen = new Set();
  for (const [a, b, km, road] of W.ROUTE_EDGES) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < S.length && b < S.length && a !== b);
    assert.ok(Number.isInteger(km) && km >= 1);
    assert.ok(road === 0 || road === 1);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    assert.ok(!seen.has(key), `duplicate edge ${key}`);
    seen.add(key);
  }
  const longest = Math.max(...W.ROUTE_EDGES.map((e) => e[2]));
  assert.ok(longest <= RULES.maxEdgeKm, `longest edge ${longest}`);
  assert.equal(fromTombstone.any.filter(Number.isFinite).length, S.length, 'every place is reachable from Tombstone');
});

// Note: the map draws a route as a straight line between its two places, so the samples lie on that line; the outlines are the projected, simplified rings of the data.
const OUTLINE_RINGS = Object.values(W.OUTLINES).flat().map((pts) => ({
  pts, x0: Math.min(...pts.map(([x]) => x)), x1: Math.max(...pts.map(([x]) => x)), y0: Math.min(...pts.map(([, y]) => y)), y1: Math.max(...pts.map(([, y]) => y)), idx: indexRing(pts),
}));
const insideOutlines = (x, y) => OUTLINE_RINGS.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && inIndexed(x, y, r.idx));
function outlineDistance(x, y) {
  const dist = ([ax, ay], [bx, by]) => {
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
  };
  return Math.min(...OUTLINE_RINGS.map((r) => Math.min(...r.pts.slice(1).map((pt, i) => dist(r.pts[i], pt)))));
}

test('every route lies inside the outlines, or within the stated distance of them where it crosses a bay or a coast', () => {
  assert.ok(W.ROUTE_EDGES.length > 1000 && OUTLINE_RINGS.length === W.AUDIT_COUNTS.outlines.rings, 'edges and rings to test');
  const samples = W.ROUTE_EDGES.flatMap(([a, b]) => [0.25, 0.5, 0.75].map((f) => ({ edge: `${places[a].id}-${places[b].id}`, x: places[a].x + (places[b].x - places[a].x) * f, y: places[a].y + (places[b].y - places[a].y) * f })));
  const strays = samples.filter((smp) => !insideOutlines(smp.x, smp.y)).map((smp) => ({ edge: smp.edge, km: outlineDistance(smp.x, smp.y) }));
  assert.equal(samples.length, 3 * W.ROUTE_EDGES.length);
  assert.ok(strays.length > 0, 'some routes cross a bay or a coast');
  const worst = strays.reduce((w, s) => (s.km > w.km ? s : w));
  assert.ok(worst.km <= ROUTE_STRAY_KM, `${worst.edge} strays ${worst.km.toFixed(1)} km from the outlines`);
  assert.ok(worst.km > ROUTE_STRAY_KM / 2, `the stated ${ROUTE_STRAY_KM} km is not looser than twice the worst stray of ${worst.km.toFixed(1)} km`);
});

test('regions cover the whole area without relying on the fallback', () => {
  assert.equal(W.AUDIT_COUNTS.regions.fallbackAssignments, 0);
  for (const p of places) assert.equal(W.regionAt(p.lon, p.lat), p.region, p.id);
});

test('services have the world.js shape, some places have none, and games differ', () => {
  for (const p of places) {
    const s = p.services;
    assert.ok(typeof s.doctor === 'number' && s.doctor >= 0 && s.doctor <= 1, p.id);
    assert.ok(typeof s.store === 'number' && (s.store === 0 || (s.store >= 0.9 && s.store <= 1.7)), p.id);
    for (const k of ['livery', 'recruit', 'notices', 'ask']) assert.equal(typeof s[k], 'boolean', `${p.id} ${k}`);
  }
  const saloons = places.filter((p) => p.services.saloon);
  for (const p of saloons) {
    assert.equal(typeof p.services.saloon.meal, 'boolean');
    assert.ok(Array.isArray(p.services.saloon.games) && p.services.saloon.games.every((g) => g === 'poker' || g === 'faro'));
  }
  const none = places.filter((p) => !p.services.doctor && !p.services.store && !p.services.livery && !p.services.recruit && !p.services.notices && !p.services.ask && !p.services.saloon);
  assert.ok(none.length > 0, 'a place with no services exists');
  assert.ok(places.length - saloons.length > places.length / 4, 'many places have no saloon');
  const gameSets = new Set(saloons.map((p) => p.services.saloon.games.join('+')));
  assert.ok(gameSets.size >= 3, `games vary: ${[...gameSets].join(', ')}`);
  const territory = places.filter((q) => q.jur === 'it_indianterr');
  assert.ok(territory.length > 0, 'Indian Territory has places');
  for (const p of territory) assert.ok(!p.services.saloon, `${p.id} has no saloon in Indian Territory`);
});

const classOf = (p) => W.SIZE_CLASSES.filter((c) => (p.pop || 0) >= c.min).length - 1;
const KIND_OF_SIZE = ['village', 'village', 'town', 'town', 'city'];

test('size classes follow the 1880 population unless a hint raised them, and kinds follow the size', () => {
  const rest = places;
  const raised = rest.filter((p) => p.reasons.includes('size-hint'));
  assert.ok(raised.length > 0, 'some class was raised by a hint');
  for (const p of raised) assert.ok(p.size > classOf(p), `${p.id} hint raises`);
  for (const p of rest.filter((q) => !q.reasons.includes('size-hint'))) assert.equal(p.size, classOf(p), p.id);
  for (const p of rest) assert.equal(p.kind, KIND_OF_SIZE[p.size], p.id);
});

const hintKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

test('every size hint resolves to exactly one place, never lowers a class and never states a population', () => {
  assert.ok(SIZE_HINTS.length >= 40 && SIZE_HINTS.length <= 70, `hints ${SIZE_HINTS.length}`);
  assert.equal(new Set(SIZE_HINTS.map((h) => `${h.jur}|${hintKey(h.name)}`)).size, SIZE_HINTS.length, 'no duplicate hints');
  const listed = new Map(W.AUDIT_COUNTS.hints.list.map((row) => [`${row[2]}|${hintKey(row[1])}`, row]));
  for (const h of SIZE_HINTS) {
    assert.ok(h.size === 1 || h.size === 2 || h.size === 3, `${h.name} class`);
    assert.ok(h.why && h.why.length < 100, `${h.name} reason`);
    const hits = places.filter((p) => p.jur === h.jur && hintKey(p.name) === hintKey(h.name));
    assert.equal(hits.length, 1, `${h.name} (${h.jur}) matches one place`);
    const p = hits[0];
    const fromPop = classOf(p);
    assert.equal(p.size, Math.max(fromPop, h.size), `${h.name} final class is the higher of source and hint`);
    assert.ok(p.size >= fromPop, `${h.name} not lowered`);
    assert.equal(p.reasons.includes('size-hint'), h.size > fromPop, `${h.name} reason follows the raise`);
    const row = listed.get(`${h.jur}|${hintKey(h.name)}`);
    assert.ok(row && row[0] === p.id && row[3] === fromPop && row[4] === h.size, `${h.name} audit row`);
    assert.ok(p.pop === null || p.pop > 0, `${h.name} population is only ever a recorded one`);
  }
  const hinted = places.filter((p) => p.reasons.includes('size-hint'));
  assert.equal(hinted.length, W.AUDIT_COUNTS.hints.raised);
  assert.equal(W.AUDIT_COUNTS.uncertain.byReason['size-hint'], hinted.length);
  assert.ok(places.every((p) => p.pop === null || p.src.some(([code]) => code === 'cs')), 'a population always comes from a census row');
  assert.ok(built.auditText.includes('inference, not census figures'));
});

test('sources are real rows of the input files', () => {
  const table = { po: poById, cs: csById };
  for (const p of places) {
    assert.ok(p.src.length >= 1, p.id);
    for (const [code, row] of p.src) assert.ok(code === 'cur' || table[code]?.has(row), `${p.id} ${code} ${row}`);
  }
});

test('operating dates: kept offices could run on 12 September 1881 and carry the matching reasons', () => {
  const bit = (id) => 1 << W.UNCERTAINTY_REASONS.findIndex((r) => r.id === id);
  const dateBits = bit('est-unknown') | bit('est-1881') | bit('disc-1881') | bit('gap');
  const pop = (n) => n.toString(2).replace(/0/g, '').length;
  const offices = (p) => p.src.filter(([code]) => code === 'po');
  const rest = places.map((p, i) => ({ p, i }));
  const withOffices = rest.filter(({ p }) => offices(p).length > 0);
  const census = rest.filter(({ p }) => offices(p).length === 0);
  assert.ok(withOffices.length > 0 && census.length > 0, 'places with and without offices');
  for (const { p } of census) assert.ok(p.reasons.includes('census-only'), `${p.id} census-only`);
  // Note: a place takes the date reasons of its best office row, the one with the fewest reasons.
  const best = withOffices.map(({ p, i }) => {
    const masks = offices(p).map(([, row]) => {
      const r = poById.get(row);
      const est = year(r.Established);
      const disc = year(r.Discontinued);
      assert.ok(est === null || est <= 1881, `${p.id} opened ${est}`);
      assert.ok(disc === null || disc >= 1881, `${p.id} closed ${disc}`);
      return (Number(est === null) * bit('est-unknown')) | (Number(est === 1881) * bit('est-1881')) | (Number(disc === 1881) * bit('disc-1881')) | (Number(r.Continuous !== 'TRUE') * bit('gap'));
    });
    return { p, i, best: masks.sort((a, b) => pop(a) - pop(b) || a - b)[0] };
  });
  // Note: a census row settles the opening year, so its place keeps only the closing and gap reasons.
  const withCensus = best.filter(({ p }) => p.src.some(([code]) => code === 'cs'));
  const officesOnly = best.filter(({ p }) => p.src.every(([code]) => code !== 'cs'));
  assert.ok(withCensus.length > 0 && officesOnly.length > 0, 'places with and without a census row');
  for (const { p, i, best: mask } of withCensus) assert.equal(S[i][12] & dateBits, mask & (bit('disc-1881') | bit('gap')), `${p.id} date reasons`);
  for (const { p, i, best: mask } of officesOnly) assert.equal(S[i][12] & dateBits, mask, `${p.id} date reasons`);
});

test('post-office-only places carry their reason and no other place does', () => {
  const ok = new Set(['Populated Place', 'Census']);
  const flagged = places.filter((p) => {
    const censusBacked = p.src.some(([code]) => code === 'cs');
    const populatedRow = p.src.some(([code, row]) => code === 'po' && ok.has(poById.get(row)['GNIS.Feature.Class']));
    const poRowsOfPlace = p.src.filter(([code]) => code === 'po');
    const want = !censusBacked && poRowsOfPlace.length > 0 && !populatedRow;
    assert.equal(p.reasons.includes('post-office-only'), want, p.id);
    return want;
  });
  assert.ok(flagged.length > 1000, `post-office-only places ${flagged.length}`);
  assert.equal(W.AUDIT_COUNTS.uncertain.byReason['post-office-only'], flagged.length);
});

test('input rows are fully accounted for and counts reconcile', () => {
  const c = W.AUDIT_COUNTS;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(c.input.postOfficeRows, poRows.length);
  assert.equal(c.input.censusRows, censusRows.length);
  assert.equal(sum(c.postOfficeDispositions), poRows.length);
  assert.equal(sum(c.censusDispositions), censusRows.length);
  assert.equal(c.kept.total, S.length);
  assert.equal(S.length, c.censusDispositions.kept + c.postOfficeDispositions.kept);
  assert.equal(c.unresolved.total, c.postOfficeDispositions.unresolved);
  assert.equal(sum(c.unresolved.byJurisdiction), c.unresolved.total);
  for (const [reason, byJur] of Object.entries(c.exclusionsByJurisdiction)) assert.equal(sum(byJur), c.postOfficeDispositions[reason], reason);
});

test('counts recomputed from the settlements equal AUDIT_COUNTS', () => {
  const c = W.AUDIT_COUNTS;
  const perJur = Object.fromEntries(W.JURISDICTIONS.map((j) => [j.id, 0]));
  const sizes = [0, 0, 0, 0, 0];
  const reasons = Object.fromEntries(W.UNCERTAINTY_REASONS.map((r) => [r.id, 0]));
  for (const p of places) {
    perJur[p.jur]++;
    sizes[p.size]++;
    for (const r of p.reasons) reasons[r]++;
  }
  for (const j of W.JURISDICTIONS) assert.equal(c.kept.byJurisdiction[j.id].total, perJur[j.id], j.id);
  assert.deepEqual(c.kept.bySize, sizes);
  assert.equal(c.uncertain.total, places.filter((p) => p.uncertain).length);
  assert.deepEqual(c.uncertain.byReason, reasons);
  assert.equal(c.routes.edges, W.ROUTE_EDGES.length);
  assert.equal(c.routes.maxEdgeKm, Math.max(...W.ROUTE_EDGES.map((e) => e[2])));
  const regionCounts = Object.fromEntries(W.REGIONS.map((r) => [r.id, 0]));
  for (const p of places) regionCounts[p.region]++;
  for (const r of W.REGIONS) assert.equal(c.regions.byRegion[r.id], regionCounts[r.id], r.id);
});

test('the audit states exactly the numbers of AUDIT_COUNTS and keeps its honesty statements', () => {
  const audit = built.auditText;
  const block = audit.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(block, 'json block present');
  assert.deepEqual(JSON.parse(block[1]), JSON.parse(JSON.stringify(W.AUDIT_COUNTS)));
  assert.match(audit, /cannot be shown to be one/);
  assert.match(audit, /Completeness cannot be proved/);
  assert.match(audit, /inferred, not evidenced/);
  assert.ok(audit.includes(`${String(W.AUDIT_COUNTS.kept.total).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} candidate settlements`));
  for (const j of W.JURISDICTIONS) assert.ok(audit.includes(j.name), j.name);
});

test('well-known 1881 towns are present', () => {
  const want = [['phoenix', 'AZ'], ['prescott', 'AZ'], ['yuma', 'AZ'], ['silver-city', 'NM'], ['lordsburg', 'NM'], ['deming', 'NM'], ['albuquerque', 'NM'], ['las-vegas', 'NM'],
    ['dodge-city', 'KS'], ['bismarck', 'ND'], ['denver', 'CO'], ['leadville', 'CO'], ['deadwood', 'SD'], ['virginia-city', 'NV'], ['salt-lake-city', 'UT'], ['tucson', 'AZ'], ['tombstone', 'AZ']];
  const abbr = { AZ: 'az_terr', NM: 'nm_terr', KS: 'ks_state', ND: 'dk_terr', SD: 'dk_terr', CO: 'co_state', NV: 'nv_state', UT: 'ut_terr' };
  for (const [slug, st] of want) {
    const id = `${slug}-${st.toLowerCase()}`;
    assert.ok(byId.has(id), `${slug} ${st} present`);
    assert.equal(places[byId.get(id)].jur, abbr[st], slug);
  }
  const watch = W.AUDIT_COUNTS.watch;
  assert.ok(watch.length >= 28, `the audit watches ${watch.length} towns`);
  assert.deepEqual(watch.filter(([, , fate]) => !fate.startsWith('kept as ')), [], 'every watched town is kept');
  for (const [name, st, fate] of watch) {
    const id = fate.slice('kept as '.length);
    assert.ok(byId.has(id), `${name} ${st}: ${id} is a place`);
    assert.equal(places[byId.get(id)].name, name, `${id} is named ${name}`);
  }
});

test('generated edge lengths are the great-circle distance times the winding factor', () => {
  for (const [a, b, km] of W.ROUTE_EDGES) {
    const want = Math.max(1, Math.round(gcKm(S[a][4], S[a][3], S[b][4], S[b][3]) * RULES.winding));
    assert.ok(Math.abs(km - want) <= 1, `${S[a][0]}-${S[b][0]} ${km} vs ${want}`);
  }
});
