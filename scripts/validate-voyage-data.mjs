import assert from 'node:assert/strict';
import { VOYAGE_POINTS } from '../public/voyage/voyage-data.js';
import auditManifest from '../public/voyage/voyage-source-audit.json' with { type: 'json' };

const auditedSourceNames = new Set(['Boston', 'Gloucester', 'East Boston', 'Massachusetts Bay', 'Deer Island', 'Nahant', 'Marblehead', "Norman's Woe", 'Nova Scotia', 'Sable Island', 'Azores', 'Ponta Delgada', 'Yarmouth', 'Cape Sable', 'Ironbound Island', 'Liverpool, Nova Scotia', 'Chebucto Head', 'Halifax', "George's Island", 'Sambro', 'Rock of Lamentations', 'Gibraltar', 'Morocco shore', 'Pico', 'São Miguel', 'Fayal', 'Canary Islands', 'Cape Verde Islands', 'Pernambuco', 'Cape Roque', 'Suez Canal', 'Mediterranean Sea', 'Red Sea', 'Brazil', 'Rio de Janeiro', 'Maldonado', 'Montevideo', 'Buenos Aires', 'Uruguay', 'Mouth of the Plate', 'Cape Froward', 'Fortescue Bay', 'Three Island Cove', 'River Plate', 'Point Indio', 'English Bank', 'Bahia Blanca', 'Gulf of San Matias', 'Gulf of San Jorge', 'Cape Virgins', 'Sandy Point', 'Port Tamar', 'Strait of Magellan', 'Cape Pillar', 'Cockburn Channel', 'Tierra del Fuego', 'Cape Horn', 'Falkland Islands', 'Port Stanley', 'Snug Bay', 'Echo Mountain', 'Borgia Bay', 'Cape Quod', 'St. Nicholas Bay', 'Port Angosto', 'Alan Erric Island', 'Juan Fernandez', "Robinson Crusoe's anchorage", 'Pacific Ocean', 'Robinson Crusoe Island', 'Selkirk monument', "Robinson Crusoe's cave", 'Marquesas', 'Apia', 'Vailima', 'Papauta College', 'Samoa', 'Fiji', 'Newcastle', 'Sydney', 'Melbourne', 'Tasmania', 'Devonport', 'Torres Strait', 'Port Denison', 'Cooktown', 'Home Island', 'Sunday Island', 'Bird Island', 'Thursday Island', 'Booby Island', 'Christmas Island', 'Gloucester Island', 'Endeavour River', 'Great Barrier Reef', 'M Reef', 'Arafura Sea', 'Timor', 'Dana Island', 'Keeling Cocos Islands', 'Rodrigues', 'North Keeling', 'South Keeling', 'Mauritius', 'Durban', 'Port Louis', 'Tombo Bay', 'Reunion', 'Galets', 'Cape St. Mary', 'Madagascar', 'Port Natal', 'Natal', 'Cape Agulhas', 'Table Bay', 'Cape of Good Hope', 'Cape Town', 'Table Mountain', "Lion's Rump", 'Simons Bay', 'Simons Town', 'Transvaal', 'Pretoria', 'St. Helena', 'Longwood', 'Ascension Island', 'Jamestown', 'Plantation House', 'Antigua', 'West Indies', 'Cape St. Roque', 'Devil’s Island', 'Trinidad', 'Grenada', 'Amazon River', 'Guiana', 'Venezuela', 'Cayenne', 'Fire Island', 'Montauk Point', 'Point Judith', 'Newport', 'Fairhaven', 'Cape Hatteras', 'New York']);

assert.ok(Array.isArray(VOYAGE_POINTS), 'VOYAGE_POINTS must be an array');
auditedSourceNames.add('St. Kilda');
auditedSourceNames.add('Launceston');
auditedSourceNames.add("Hobson's Bay");
auditedSourceNames.add('Port Phillip Heads');
auditedSourceNames.add('Yarrow River');
auditedSourceNames.add('Cape Leeuwin');
auditedSourceNames.add('Melbourne Heads');
auditedSourceNames.add('Beavertail');
auditedSourceNames.add("Thieves' Bay");

assert.ok(VOYAGE_POINTS.length >= 40, 'voyage data should include detailed geographic coverage');

const required = ['id', 'name', 'lat', 'lon', 'category', 'dateLabel', 'datePrecision', 'chapter', 'sourceNote', 'routePoint'];
const ids = new Set();
let routeCount = 0;

for (const point of VOYAGE_POINTS) {
  for (const key of required) assert.ok(point[key] !== undefined && point[key] !== '', `${point.id ?? 'point'} missing ${key}`);
  assert.ok(!ids.has(point.id), `duplicate point id: ${point.id}`);
  ids.add(point.id);
  assert.ok(Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90, `${point.id} latitude invalid`);
  assert.ok(Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180, `${point.id} longitude invalid`);
  if (point.routePoint) routeCount += 1;
}

assert.ok(routeCount >= 15, 'route should include the actual voyage track');
assert.equal(VOYAGE_POINTS.length, 154, 'voyage points must cover exactly 154 audited places');
assert.deepEqual(new Set(VOYAGE_POINTS.map((point) => point.name)), auditedSourceNames, 'voyage points must exactly match the audited source-name fixture');
assert.equal(auditManifest.length, VOYAGE_POINTS.length, 'source audit manifest must cover every voyage point');
assert.deepEqual(auditManifest.map((entry) => entry.order), VOYAGE_POINTS.map((_, index) => index), 'source audit order must be total and contiguous');
assert.deepEqual(auditManifest.map((entry) => entry.name), VOYAGE_POINTS.map((point) => point.name), 'source audit order must match the rendered voyage order');
assert.deepEqual(auditManifest.map((entry) => entry.routePoint), VOYAGE_POINTS.map((point) => point.routePoint), 'source audit route flags must match every rendered point');
assert.deepEqual(VOYAGE_POINTS.map((point) => point.sourceOrder), VOYAGE_POINTS.map((_, index) => index), 'sourceOrder must be contiguous and chronological');
const orderPairs = [['Christmas Island', 'Keeling Cocos Islands'], ['Keeling Cocos Islands', 'Rodrigues'], ['Rodrigues', 'Mauritius'], ['Mauritius', 'Reunion'], ['Reunion', 'Durban'], ['Durban', 'Cape Agulhas'], ['Cape Agulhas', 'Simons Bay'], ['Simons Bay', 'Cape of Good Hope'], ['Cape of Good Hope', 'Table Bay'], ['Table Bay', 'Cape Town'], ['Cape Town', 'St. Helena'], ['St. Helena', 'Ascension Island'], ['Ascension Island', 'Cape St. Roque'], ['Cape St. Roque', 'Devil’s Island'], ['Devil’s Island', 'Trinidad'], ['Trinidad', 'Grenada'], ['Fire Island', 'Montauk Point'], ['Montauk Point', 'Point Judith'], ['Point Judith', 'Beavertail'], ['Beavertail', 'Newport'], ['Newport', 'Fairhaven']];
for (const [before, after] of orderPairs) assert.ok(VOYAGE_POINTS.find((point) => point.name === before).sourceOrder < VOYAGE_POINTS.find((point) => point.name === after).sourceOrder, `${before} must precede ${after}`);
console.log(`Validated ${VOYAGE_POINTS.length} voyage points (${routeCount} route points).`);
