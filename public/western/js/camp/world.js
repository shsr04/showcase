// Note: the playable region is the American West of 12 September 1881, the jurisdictions of world-data.js; the generated data is the only source of places and routes.

import { buildWorld } from './world-build.js';
import { WEATHER, REGION_CLIMATE, climateProfile, weatherFor } from './climate.js';
import {
  JURISDICTIONS, REGIONS, OUTLINES, SETTLEMENTS, UNCERTAINTY_REASONS, SIZE_CLASSES, AUDIT_COUNTS, ROUTE_RULES, unproject,
} from './world-data.js';
import { AMMO_GOODS, WEAPON_GOODS } from './arsenal.js';

// Note: item 176; the in-period start, the playable boundary and the sources are documented here.
export const START = { year: 1881, month: 9, day: 12, hour: 6, label: 'Monday 12 September 1881, 06:00' };

// Note: the fixed start of the test fixture P2_START (state.js), a generated rough town; a real campaign starts in a random rough town (item 301).
export const START_PLACE = 'bodie-ca';
export const START_KNOWN = Object.freeze([START_PLACE]);

// Note: item 234; the playable boundary is the set of 1881 jurisdictions of world-data.js, not a box around Cochise County.
const outlineBox = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const rings of Object.values(OUTLINES)) {
    for (const ring of rings) {
      // Note: an indexed loop, since this runs at import over every outline point.
      for (let i = 0; i < ring.length; i++) {
        const x = ring[i][0];
        const y = ring[i][1];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1 };
})();
const cornerA = unproject(outlineBox.x0, outlineBox.y1);
const cornerB = unproject(outlineBox.x1, outlineBox.y0);
export const BOUNDARY = {
  name: `The American West of September 1881: ${JURISDICTIONS.length} states, territories and unorganized lands`,
  note: 'Every place has a post-office record or an 1880 census entry, and the routes between places are estimated. The outlines are simplified and the coordinates are modern geocodes with no stated accuracy, so places near a border or with a flagged uncertainty may be misplaced.',
  approx: { west: Math.min(cornerA.lon, cornerB.lon), east: Math.max(cornerA.lon, cornerB.lon), south: Math.min(cornerA.lat, cornerB.lat), north: Math.max(cornerA.lat, cornerB.lat) },
  km: { west: outlineBox.x0, east: outlineBox.x1, north: outlineBox.y0, south: outlineBox.y1 },
  jurisdictions: JURISDICTIONS.map((j) => ({ id: j.id, name: j.name, abbr: j.abbr, type: j.type })),
};

// Note: the 22 jurisdictions of the start date for the map UI; outlines are rings of [x, y] km from Tombstone, a jurisdiction may have several.
export const JURISDICTION_LIST = BOUNDARY.jurisdictions;
export const jurisdictionOutlines = () => OUTLINES;
export const REGION_LIST = REGIONS.map((r) => ({ id: r.id, name: r.name, climate: r.climate, note: r.note }));

// Note: the eight outdoor terrains the encounter generator knows; routes and sites use only these.
export const TERRAINS = {
  'stage-road': { label: 'stage road', speed: 1.0, cover: 0.2, ambush: 1.1 },
  grassland: { label: 'grassland', speed: 0.95, cover: 0.1, ambush: 0.7 },
  'desert-scrub': { label: 'desert scrub', speed: 0.8, cover: 0.45, ambush: 1.0 },
  wash: { label: 'dry wash', speed: 0.7, cover: 0.6, ambush: 1.3 },
  'rocky-hills': { label: 'rocky hills', speed: 0.6, cover: 0.7, ambush: 1.4 },
  riverbank: { label: 'riverbank', speed: 0.85, cover: 0.5, ambush: 0.9 },
  'mining-camp': { label: 'mining camp', speed: 0.9, cover: 0.4, ambush: 0.8 },
  ranch: { label: 'ranch land', speed: 1.0, cover: 0.3, ambush: 0.7 },
};
export const TERRAIN_IDS = Object.keys(TERRAINS);

// Note: daily needs of one person, and how far a story of a place travels by talk in km; the About text quotes them.
export const WATER_LITRES_PER_DAY = 3;
export const FOOD_PER_DAY = 1;
export const TALK_KM = 150;

// Note: the most a route may run outside the outlines, in km, where it crosses a bay or a coast; the road test asserts it and the About text quotes it.
export const ROUTE_STRAY_KM = 10;

// Note: only sources that were opened and used are listed; each use says what was taken from it.
export const SOURCES = [
  {
    id: 'po-1881',
    label: 'Helbock post-office records geocoded by Blevins (US Post Offices dataset)',
    url: 'https://doi.org/10.7910/DVN/NUKCNA',
    read: true,
    use: `Source of most places: office name, county, opening and closing years and a coordinate, from ${AUDIT_COUNTS.input.postOfficeRows.toLocaleString('en-US')} rows that could include 1881.`,
  },
  {
    id: 'census-1880',
    label: 'Steiner and Heppler historical US city populations',
    url: 'https://github.com/cestastanford/historical-us-city-populations',
    read: true,
    use: `1880 population and an approximate modern geocode for ${AUDIT_COUNTS.input.censusRows} cities, used for the size class of a place.`,
  },
  {
    id: 'newberry-1881',
    label: 'Newberry Atlas of Historical County Boundaries, generalized 1881 state and territory polygons',
    url: 'https://publications.newberry.org/ahcb/pages/United_States.html',
    read: true,
    use: `The ${JURISDICTIONS.length} jurisdictions of the start date, for the outlines and the jurisdiction of a place; no settlement data.`,
  },
];

// Note: these sources were not opened; what they say is recalled from memory and unchecked; none is used now that every place comes from the data.
export const RECALLED = [];

const count = (v) => v.toLocaleString('en-US');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const WAGON = AUDIT_COUNTS.routes.wagon;
const WATCH = AUDIT_COUNTS.watch;
const WINDING = ROUTE_RULES.winding;

// Note: what was verified and how; the numbers come from the audit counts, and a check that says tested is mapped to its tests in western-camp-world.test.mjs.
export const CHECKS = [
  {
    what: 'The border',
    how: `The ${JURISDICTIONS.length} states, territories and unorganized lands of 12 September 1881 come from the Newberry polygons. The download is checked against its SHA-256 sum before it is read. A test confirms the set of jurisdictions, that the Public Land Strip is inside and that representative foreign places are outside.`,
  },
  {
    what: 'Every record accounted for',
    how: `Each of the ${count(AUDIT_COUNTS.input.postOfficeRows)} post-office rows and ${count(AUDIT_COUNTS.input.censusRows)} census rows was given exactly one outcome: kept as a place, merged into another, or left out for a stated reason. Both downloads are checked against their SHA-256 sums. A test adds the outcomes up and compares them with the input.`,
  },
  {
    what: 'Where a place lies',
    how: `Each place lies inside its own jurisdiction (tested). In all ${count(AUDIT_COUNTS.kept.total)} places, x and y follow the map projection from Tombstone's own post-office coordinate (tested).`,
  },
  {
    what: 'Dates',
    how: `Only offices whose recorded years include 1881 are kept. The data holds years only, so the ${count(AUDIT_COUNTS.uncertain.byReason['est-1881'])} offices that opened and the ${count(AUDIT_COUNTS.uncertain.byReason['disc-1881'])} that closed in 1881 are flagged as possibly absent on the day (tested).`,
  },
  {
    what: 'Well-known towns',
    how: `${WATCH.length} well-known towns, from ${WATCH[0][0]} and ${WATCH[1][0]} to ${WATCH.at(-2)[0]} and ${WATCH.at(-1)[0]}, were looked up by name in the result and are all present (tested). A name match is not proof that it is the same place.`,
  },
  {
    what: 'Routes',
    how: `Every place can be reached from Tombstone (tested). Each route is the great-circle distance times ${WINDING} (tested). Points along every route lie inside a jurisdiction or within ${ROUTE_STRAY_KM} km of its outline (tested). By wagon, ${count(WAGON.reachable)} of ${count(AUDIT_COUNTS.kept.total)} places can be reached, and ${WAGON.terminalsReached} of the ${WAGON.terminals} larger places.`,
  },
  {
    what: 'The whole inventory',
    how: 'A test rebuilds the inventory in memory from the data files and finds it identical, byte for byte, to the module the game loads.',
  },
];

// Note: what the game infers or simplifies; none of it is read from a source.
export const INFERENCES = [
  `That a place was a settlement on 12 September 1881 is inferred from a post-office record or an 1880 census row. ${count(AUDIT_COUNTS.uncertain.total)} of ${count(AUDIT_COUNTS.kept.total)} places carry at least one reason for doubt, and ${count(AUDIT_COUNTS.uncertain.byReason['post-office-only'])} rest on a post office alone, which may have been a shop, a ranch or a stage stop.`,
  `Coordinates are modern geocodes of those records, with no stated accuracy. The outlines are simplified to within ${AUDIT_COUNTS.outlines.tolerance} km, so a place near a border may be assigned to its neighbour.`,
  `The size of a place follows its 1880 population where the census compilation lists it; otherwise it is inferred from the kind of record, and ${AUDIT_COUNTS.hints.total} well-known towns were raised by hand from general knowledge of the period.`,
  'Doctors, stores, liveries, saloons, notice boards and games are inferred from the size of a place, with a fixed chance for each and a fixed draw for each place; no source says what any one place had. Kansas saloons are made rarer (state prohibition from May 1881) and Indian Territory has none (federal law), both from general knowledge.',
  `The ${REGIONS.length} regions behind terrain and climate are coarse polygons drawn by hand, and each place takes the first region that contains it.`,
  'Climate is a monthly table for each region, set from recalled typical figures of one or two stations in it, such as Tucson and Yuma for the Sonoran desert. No source was read for them, and they are applied to 1881. The sky islands keep a hand-made table for the 4,500 ft uplands (hot early summer, a monsoon from July to September, cool winters).',
  `Generated routes join each place to its nearest neighbours at ${WINDING} times the straight-line distance. They are not the roads, rails, ferries and trails of 1881. Whether a route is a wagon road, and its terrain, water and danger, are inferred from the size of its ends and from the region.`,
  `Prices, wages and rewards are set by judgement to the scale of the period, and so are travel speeds and daily needs (${plural(WATER_LITRES_PER_DAY, 'litre')} of water and ${plural(FOOD_PER_DAY, 'ration')} per person); no price list, payroll or measurement was used.`,
  `Who knows of which place is a game rule: a place is known when visited, passed through or told of, and a story carries ${TALK_KM} km, further for large places and newspapers.`,
  'The party is modelled with one transport entry (horses, mules or a wagon) standing for every rider; feed is bought per rider.',
];

// Note: the one line the about screen gives for everything made up.
export const FICTION = 'Cases, targets, gangs and townspeople are invented. No real person of the period, and no real event, is named or implied.';

// Note: the build makes every settlement and route of the data at import.
const WORLD = buildWorld();
export const {
  PLACES, PLACE_IDS, ROUTES, ROUTE_IDS, routeBetween, neighbours, routesOf, routeTree, distancesFrom, shortestPath, placesWithin, placesNear, nearestPlace, jurisdictionAt,
} = WORLD;

const JURISDICTION_BY_ID = new Map(JURISDICTIONS.map((j) => [j.id, j]));
const REASON_BY_ID = new Map(UNCERTAINTY_REASONS.map((r) => [r.id, r]));
const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));
export const PLACE_COUNT = SETTLEMENTS.length;

// Note: plain accessors for a place; none of them scans the world.
export const jurisdictionOf = (id) => JURISDICTION_BY_ID.get(PLACES[id]?.jur) || null;
export const regionOf = (id) => REGION_BY_ID.get(PLACES[id]?.region) || null;
// Note: the region a scene at this place is drawn in.
export const sceneRegion = (id) => PLACES[id]?.region;
export const uncertaintyOf = (id) => (PLACES[id]?.reasons || []).map((r) => REASON_BY_ID.get(r).text);
// Note: the place facts a map or a town screen shows, with the data's own words for the uncertainty.
export function placeFacts(id) {
  const p = PLACES[id];
  if (!p) return null;
  const j = JURISDICTION_BY_ID.get(p.jur);
  return {
    id, name: p.name, kind: p.kind, x: p.x, y: p.y, lon: p.lon, lat: p.lat, jurisdiction: p.jur, jurisdictionName: j.name, region: p.region, size: p.size, sizeLabel: SIZE_CLASSES[p.size].label,
    population: p.pop, uncertain: p.uncertain, reasons: uncertaintyOf(id),
  };
}

// Note: a leg is an interval of one route, measured in km from the route's a end; dir is +1 walking a to b and -1 walking b to a.
export function legsOf(places) {
  const legs = [];
  for (let i = 0; i + 1 < places.length; i++) {
    const r = routeBetween(places[i], places[i + 1]);
    const forward = r.a === places[i];
    legs.push({ route: r.id, dir: forward ? 1 : -1, from: forward ? 0 : r.km, to: forward ? r.km : 0, km: r.km, start: places[i], end: places[i + 1] });
  }
  return legs;
}

// Note: the terrain of a route at a distance in km from its a end.
export function terrainAt(route, kmFromA) {
  const f = Math.min(0.9999, Math.max(0, kmFromA / route.km));
  let acc = 0;
  for (const s of route.segments) {
    acc += s.share;
    if (f < acc - 1e-9) return s.terrain;
  }
  return route.segments[route.segments.length - 1].terrain;
}

// Note: where along a leg list a journey is; returns the leg index, the km into that leg, the route point in km from a and the map point.
export function locate(legs, doneKm) {
  let left = Math.max(0, doneKm);
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (left <= L.km + 1e-9 || i === legs.length - 1) {
      const into = Math.min(left, L.km);
      const at = L.from + L.dir * into;
      return { index: i, into, at, leg: L };
    }
    left -= L.km;
  }
  return null;
}

// Note: map position in kilometres from Tombstone of a spot along a leg; works for a partial leg too because it goes by the route's own ends.
export function mapPoint(leg, into) {
  const r = ROUTES[leg.route];
  const a = PLACES[r.a];
  const b = PLACES[r.b];
  const f = r.km ? (leg.from + leg.dir * into) / r.km : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// Note: transport kinds; kmh is the average over a day of walking, trotting and rests, fatigue per hour of travel, feed per rider per day.
export const TRANSPORT = {
  foot: { label: 'on foot', kmh: 4, fatigue: 0.035, feed: 0, needsRoad: false },
  horse: { label: 'horseback', kmh: 6.5, fatigue: 0.02, feed: 1, needsRoad: false },
  mule: { label: 'by mule', kmh: 5.5, fatigue: 0.022, feed: 1, needsRoad: false },
  wagon: { label: 'by wagon', kmh: 4, fatigue: 0.016, feed: 2, needsRoad: true },
};

// Note: travel runs from 06:00 to 19:00; the rest of the day the party camps.
export const DAY_START = 6;
export const DAY_END = 19;

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const T0 = Date.UTC(START.year, START.month - 1, START.day, START.hour, 0, 0);

// Note: calendar facts for a campaign minute; uses UTC arithmetic only, so it does not depend on the machine's time zone.
export function dateOf(min) {
  const d = new Date(T0 + Math.floor(min) * 60000);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const month = d.getUTCMonth() + 1;
  return {
    year: d.getUTCFullYear(), month, day: d.getUTCDate(), hour, minute, weekday: d.getUTCDay(),
    dayIndex: Math.floor((T0 + Math.floor(min) * 60000 - Date.UTC(START.year, START.month - 1, START.day, 0, 0, 0)) / 86400000),
    label: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[month - 1]} ${d.getUTCFullYear()}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    daylight: hour >= DAY_START && hour < DAY_END,
    season: month >= 7 && month <= 9 ? 'monsoon' : month >= 5 && month <= 6 ? 'hot dry' : month >= 12 || month <= 2 ? 'winter' : 'mild',
  };
}

// Note: minutes from the campaign start to the next time the clock reads the given hour.
export function minutesUntilHour(min, hour) {
  const d = dateOf(min);
  const now = d.hour * 60 + d.minute;
  let wait = hour * 60 - now;
  if (wait <= 0) wait += 1440;
  return wait;
}

export { WEATHER, REGION_CLIMATE, climateProfile };

// Note: the weather of a day in a region; no region means the sky islands.
export function weatherOn(seed, dayIndex, month, region) {
  return weatherFor(seed, dayIndex, month, region);
}

export function weatherAt(seed, min, region) {
  const d = dateOf(min);
  return weatherFor(seed, d.dayIndex, d.month, region);
}

// Note: kilometres per hour on a terrain for a transport in some weather and tiredness.
export function speedKmh(mode, terrain, weather, fatigue = 0) {
  const t = TRANSPORT[mode] || TRANSPORT.foot;
  const tt = TERRAINS[terrain] || TERRAINS['desert-scrub'];
  return t.kmh * tt.speed * (weather ? weather.speed : 1) * (1 - 0.25 * Math.min(1, Math.max(0, fatigue)));
}

// Note: a plain estimate in hours for legs at average terrain and weather; a partial leg only counts the stretch between its from and to.
export function estimateLegHours(legs, mode) {
  let h = 0;
  for (const L of legs) {
    const r = ROUTES[L.route];
    const lo = Math.min(L.from, L.to);
    const hi = Math.max(L.from, L.to);
    let at = 0;
    for (const s of r.segments) {
      const len = r.km * s.share;
      const inside = Math.max(0, Math.min(hi, at + len) - Math.max(lo, at));
      if (inside > 0) h += inside / speedKmh(mode, s.terrain, null, 0);
      at += len;
    }
  }
  return h;
}

// Note: a plain estimate in hours for a path at average terrain and weather, for route choices on the map.
export function estimateHours(path, mode) {
  if (!path) return null;
  return estimateLegHours(legsOf(path.places), mode);
}

// Note: base prices in cents per lot, as approximations; lot is how much one unit buys and each place scales the prices by its store factor.
export const GOODS = {
  food: { id: 'food', label: 'Rations, one person-day', lot: 1, cents: 50, kind: 'supply', stock: 'food' },
  water: { id: 'water', label: 'Water, ten litres', lot: 10, cents: 5, kind: 'supply', stock: 'water' },
  feed: { id: 'feed', label: 'Feed, one rider-day', lot: 1, cents: 40, kind: 'supply', stock: 'feed' },
  ...AMMO_GOODS,
  ...WEAPON_GOODS,
  // Note: item 499: dynamite, sold once the Ironman reward is earned: five half-pound sticks of 40 % with fuse and caps, at about 15 cents a pound wholesale in 1880, near 75 cents retail.
  dynamite: { id: 'dynamite', label: 'Dynamite, a bundle of five sticks with fuse', lot: 1, cents: 75, kind: 'explosive' },
  horse: { id: 'horse', label: 'Saddle horses for the party', lot: 1, cents: 8500, kind: 'transport', transport: 'horse' },
  mule: { id: 'mule', label: 'Mules for the party', lot: 1, cents: 7000, kind: 'transport', transport: 'mule' },
  wagon: { id: 'wagon', label: 'Wagon and team', lot: 1, cents: 9500, kind: 'transport', transport: 'wagon' },
};
export const SELL_FACTOR = { supply: 0.5, ammo: 0.5, weapon: 0.55, transport: 0.6, explosive: 0.5 };

export const LODGING_CENTS_PER_DAY = 50;
// Note: a weekly wage for a teammate follows this scale; item 152.
export const WAGE = { appointedBase: 1000, perSkill: 1200, hireExtra: 1.25 };
// Note: starting capital in cents; item 124.
export const START_CENTS = 25000;
