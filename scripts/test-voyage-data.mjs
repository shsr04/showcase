import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VOYAGE_POINTS, VOYAGE_ROUTE } from '../public/voyage/voyage-data.js';
import { choosePreciseIntersection } from '../public/voyage/picking.js';
import auditManifest from '../public/voyage/voyage-source-audit.json' with { type: 'json' };
import { isGlobeFacing } from '../public/voyage/label-visibility.js';

assert.equal(VOYAGE_POINTS.length, 154, 'the voyage index must cover the complete audited place set');
assert.equal(auditManifest.length, VOYAGE_POINTS.length, 'the source audit must cover every voyage point');
assert.deepEqual(auditManifest.map((entry) => entry.name), VOYAGE_POINTS.map((point) => point.name), 'the source audit must define the complete UI order');
assert.deepEqual(auditManifest.map((entry) => entry.routePoint), VOYAGE_POINTS.map((point) => point.routePoint), 'the source audit must record every route flag');
assert.deepEqual(auditManifest.map((entry) => entry.order), VOYAGE_POINTS.map((_, index) => index), 'the source audit order must be explicit and contiguous');
assert.equal(new Set(VOYAGE_POINTS.map((point) => point.name)).size, VOYAGE_POINTS.length, 'canonical names must be unique');
assert.deepEqual(VOYAGE_POINTS.map((point) => point.sourceOrder), VOYAGE_POINTS.map((_, index) => index), 'sourceOrder must be contiguous');
assert.ok(VOYAGE_POINTS.every((point) => Array.isArray(point.aliases)), 'every place must expose aliases');
assert.deepEqual(VOYAGE_ROUTE, VOYAGE_POINTS.filter((point) => point.routePoint), 'route must remain derived from routePoint');
assert.equal(VOYAGE_POINTS.find((point) => point.name === 'Sandy Point')?.aliases.includes('Punta Arenas'), true, 'Sandy Point alias is required');
assert.equal(VOYAGE_POINTS.find((point) => point.name === 'Christmas Island')?.dateIso, '1897-07-11', 'Christmas Island chronology must be corrected');
assert.equal(isGlobeFacing({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }), true, 'front-facing labels must remain visible');
assert.equal(isGlobeFacing({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: -1 }), false, 'back-facing labels must be hidden');
const lateDates = {
  'Keeling Cocos Islands': ['1897-07-17', '17 July 1897'],
  Rodrigues: ['1897-09-08', '8 September 1897'],
  Mauritius: ['1897-09-19', '19 September 1897'],
  'Port Louis': ['1897-09-19', '19 September 1897'],
  Reunion: ['1897-10-27', '27 October 1897'],
  'Port Natal': ['1897-11-17', '17 November 1897'],
  Durban: ['1897-11-17', '17 November 1897'],
  'Cape Agulhas': ['1897-12-27', '27 December 1897'],
  'St. Helena': ['1898-04-11', '11 April 1898'],
  Longwood: ['1898-04', 'April 1898'],
  'Ascension Island': ['1898-04-27', '27 April 1898'],
};
for (const [name, [dateIso, dateLabel]] of Object.entries(lateDates)) {
  const point = VOYAGE_POINTS.find((candidate) => candidate.name === name);
  assert.deepEqual([point?.dateIso, point?.dateLabel], [dateIso, dateLabel], `${name} date must match the source log`);
}
const omittedPlaces = {
  'Strait of Magellan': ['1896-02-11', 'VIII', false],
  'St. Nicholas Bay': ['1896-02-19', 'IX', false],
  'Cape Agulhas': ['1897-12-27', 'XVIII', false],
  'Table Bay': ['1897-12-28', 'XVIII', false],
  'Simons Bay': ['1897-12-27', 'XVIII', false],
  'Montauk Point': ['1898-06-27', 'XXI', false],
  'Point Judith': ['1898-06-27', 'XXI', false],
  'St. Kilda': ['1896-12', 'XIII', false],
  'Launceston': ['1896-12', 'XIII', false],
  "Hobson's Bay": ['1896-12', 'XIII', false],
  'Port Phillip Heads': ['1896-12', 'XIII', false],
  'Yarrow River': ['1896-12', 'XIII', false],
  'Cape Leeuwin': ['1897-07', 'XV', false],
  'Melbourne Heads': ['1896-12', 'XIII', false],
  'Beavertail': ['1898-06-27', 'XXI', false],
  "Thieves' Bay": ['1896-01', 'VII', false],
};
for (const [name, [dateIso, chapter, routePoint]] of Object.entries(omittedPlaces)) {
  const point = VOYAGE_POINTS.find((candidate) => candidate.name === name);
  assert.ok(point, `${name} must be included in the voyage index`);
  assert.deepEqual([point.dateIso, point.chapter, point.routePoint], [dateIso, chapter, routePoint], `${name} metadata must match the source chronology`);
}
const orderPairs = [['Cape Froward', "Thieves' Bay"], ['Melbourne', 'Melbourne Heads'], ['Melbourne Heads', 'St. Kilda'], ['St. Kilda', 'Launceston'], ['Cape Leeuwin', 'Timor'], ['Christmas Island', 'Keeling Cocos Islands'], ['Keeling Cocos Islands', 'Rodrigues'], ['Rodrigues', 'Mauritius'], ['Mauritius', 'Reunion'], ['Reunion', 'Durban'], ['Durban', 'Cape Agulhas'], ['Cape Agulhas', 'Simons Bay'], ['Simons Bay', 'Cape of Good Hope'], ['Cape of Good Hope', 'Table Bay'], ['Table Bay', 'Cape Town'], ['Cape Town', 'St. Helena'], ['St. Helena', 'Ascension Island'], ['Ascension Island', 'Cape St. Roque'], ['Cape St. Roque', 'Devil’s Island'], ['Devil’s Island', 'Trinidad'], ['Trinidad', 'Grenada'], ['Fire Island', 'Montauk Point'], ['Montauk Point', 'Point Judith'], ['Point Judith', 'Beavertail'], ['Beavertail', 'Newport'], ['Newport', 'Fairhaven']];
for (const [before, after] of orderPairs) assert.ok(VOYAGE_POINTS.find((point) => point.name === before).sourceOrder < VOYAGE_POINTS.find((point) => point.name === after).sourceOrder, `${before} must precede ${after}`);
const broad = { userData: { point: { name: 'broad' }, pickRadius: .045 } };
const precise = { userData: { point: { name: 'precise' }, pickRadius: .035 } };
assert.equal(choosePreciseIntersection([{ object: broad, distance: 1 }, { object: precise, distance: 2 }]).object, precise, 'overlapping targets must prefer the smaller hit radius');
const visual = { userData: {} };
const preciseWithVisual = { userData: { point: { name: 'precise' }, pickRadius: .035, visual } };
visual.parent = preciseWithVisual;
assert.equal(choosePreciseIntersection([{ object: preciseWithVisual, distance: 1 }, { object: visual, distance: 2 }]).object, visual, 'the visible marker must win when its hit is available');

const html = await readFile(new URL('../public/voyage/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /id="place-index"/, 'voyage must not add an unrequested place index');
assert.doesNotMatch(html, /id="place-search"/, 'voyage must not add an unrequested place search');
assert.match(html, /Newsreader/, 'voyage heading font must be declared');
assert.match(html, /DM Sans/, 'voyage interface font must be declared');
assert.match(html, /media="print"/, 'remote font stylesheet must be non-blocking');

const script = await readFile(new URL('../public/voyage/voyage.js', import.meta.url), 'utf8');
assert.match(script, /zoomSpeed\s*=\s*\.68/, 'wheel zoom must use the middle sensitivity');
assert.match(script, /texture\.onError|onError/, 'texture failure must be handled');
assert.match(script, /document\.fonts|FontFace/, 'remote fonts must load opportunistically');
assert.match(script, /choosePreciseIntersection/, 'pointer selection must resolve overlapping hit targets deterministically');
assert.match(script, /intersectObjects\(markerNodes, true\)/, 'pointer selection must include recursive visible-marker intersections');
assert.match(script, /choosePreciseIntersection\(ray\.intersectObjects\(markerNodes, true\)\)/, 'runtime picking must use the tested candidate structure');
assert.match(script, /classList\.remove\(['"]selected['"]\)/, 'reset must clear selected labels');
assert.match(script, /document\.querySelector\('#reset'\)\.addEventListener/, 'reset must be installed for fallback mode too');

console.log(`Voyage data/UI contract checks passed for ${VOYAGE_POINTS.length} points.`);
