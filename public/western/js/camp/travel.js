// Note: the journey between places: departure, the clock on the road, night camps, springs, encounters, withdrawal and changes of course. Pure, no DOM or Phaser.

import {
  PLACES, ROUTES, TRANSPORT, sceneRegion, TERRAINS, DAY_START, DAY_END, shortestPath, routeTree, legsOf, locate, terrainAt, mapPoint, speedKmh, weatherAt, dateOf, minutesUntilHour, estimateHours, estimateLegHours,
} from './world.js';
import {
  clamp, clone, dice, partyOf, charById, sheriffOf, logLine, learn, round2, own, finite, whole, knownSet, isKnown, regionOfState, pointOf,
} from './base.js';
import { advance, enforceCap } from './state.js';
import { lapse } from './spectate.js';
import {
  capacity, capacityOf, departing, mountsWeak,
} from './economy.js';
import { refuses } from './crew.js';
import { graceAt, tryLearnPlace, fillOnArrival } from './cases.js';
import { located } from './pursuit.js';
import { presentIn, crewSummary, hereOf } from './town.js';
import { SET_PIECES } from '../setpieces.js';
import { rng, seedFromString, unit } from '../rand.js';
import { terrainLabel, regionalLook } from '../regional-look.js';
import { hooksOf } from './rates.js';
import { feat } from './rewards.js';
import { wearOf } from './progress.js';
import { rollLead, STORY } from './story.js';
import { AMMO_TYPES, BASE_AMMO } from '../weapons.js';

const ERR_ENDED = { ok: false, reason: 'The campaign is over.' };
const round1 = (v) => Math.round(v * 10) / 10;

// Note: where the party is on the map: the route, the terrain, and the map point in kilometres from Tombstone.
export function position(state) {
  const j = state.journey;
  if (!j) return null;
  const loc = locate(j.legs, j.doneKm);
  const route = ROUTES[loc.leg.route];
  const pt = mapPoint(loc.leg, loc.into);
  return {
    x: round1(pt.x), y: round1(pt.y), route: route.id, leg: loc.index, into: round1(loc.into), at: loc.at, terrain: terrainAt(route, loc.at), danger: route.danger,
  };
}

// Note: springs and river crossings in journey kilometres; a partial leg only counts the ones still ahead.
function springsOf(legs) {
  const out = [];
  let offset = 0;
  for (const L of legs) {
    const r = ROUTES[L.route];
    for (const w of r.water) {
      const x = w * r.km;
      const ahead = (x - L.from) * L.dir;
      if (ahead >= 0 && ahead <= L.km) out.push({ at: offset + ahead, done: false });
    }
    offset += L.km;
  }
  return out.sort((a, b) => a.at - b.at);
}

// Note: whole days a trip of this many hours takes, counting the daylight hours of a travelling day.
export const daysOf = (hours) => Math.max(1, Math.ceil(hours / (DAY_END - DAY_START)));
export const dangerWord = (d) => (d < 0.25 ? 'quiet' : d < 0.4 ? 'uneasy' : d < 0.55 ? 'risky' : 'dangerous');

const modeOf = (kind) => (kind === 'foot' ? 'foot' : kind === 'wagon' ? 'wagon' : 'ride');

// Note: R1-4: a place id from outside is a string and an own key of the table, or the call is refused.
const placeKnown = (state, id) => typeof id === 'string' && own(PLACES, id) && isKnown(state, id);

// Note: R3-6: only places the party has learned are named on any route text; the rest of a road stays unnamed.
const namedPlaces = (state, places) => {
  const known = knownSet(state);
  return places.filter((p) => known.has(p));
};

// Note: the facts of one destination for the party at `here`: the road and its cost; the tree is the cached search from `here`, so this takes a path walk, not a search.
function destinationBase(state, here, id, wagon, tree) {
  const places = tree.path(id);
  if (!places) return { id, name: PLACES[id].name, reachable: false, reason: wagon ? 'no wagon road' : 'no road' };
  const kind = state.transport.kind;
  const legs = legsOf(places);
  const hours = estimateLegHours(legs, kind);
  const danger = Math.max(...legs.map((L) => ROUTES[L.route].danger));
  return {
    id, name: PLACES[id].name, reachable: true, km: tree.km(id), hours: round1(hours), days: daysOf(hours), danger: dangerWord(danger), dangerLevel: danger,
    via: namedPlaces(state, places.slice(1, -1)).map((p) => PLACES[p].name), springs: springsOf(legs).length,
  };
}

const needsOf = (state, base, n) => {
  const per = TRANSPORT[state.transport.kind];
  return base.reachable ? { ...base, needs: { food: n * base.days, water: n * 3 * base.days, feed: per.feed ? n * per.feed * base.days : 0 } } : base;
};

// Note: the destination records are cached per known list, place, transport and wagon; the route search itself is cached in the world, so a screen may call prepare often.
const DESTINATIONS = new WeakMap();
function destinationBases(state, here, wagon) {
  const sig = `${here}|${wagon ? 1 : 0}|${state.transport.kind}|${state.known.length}|${state.known[state.known.length - 1]}`;
  const hit = DESTINATIONS.get(state.known);
  if (hit && hit.sig === sig) return hit.list;
  const tree = routeTree(here, wagon);
  const list = state.known.filter((id) => id !== here && PLACES[id]).map((id) => destinationBase(state, here, id, wagon, tree));
  DESTINATIONS.set(state.known, { sig, list });
  return list;
}

// Note: one known destination as prepare lists it, without making the whole list; null for a place that is not known.
export function prepareDestination(state, id) {
  const here = hereOf(state);
  if (!here || !placeKnown(state, id) || id === here) return null;
  const wagon = state.transport.kind === 'wagon';
  return needsOf(state, destinationBase(state, here, id, wagon, routeTree(here, wagon)), Math.max(1, departing(state).length));
}

// Note: what the player sees before leaving: who can come, what the party carries, and where it can go, the nearest opts.limit by road when a limit is given.
export function prepare(state, opts = {}) {
  if (state.ended) return ERR_ENDED;
  const here = hereOf(state);
  if (!here) return { ok: false, reason: 'The party is not in a town.' };
  const wagon = state.transport.kind === 'wagon';
  const n = Math.max(1, departing(state).length);
  let bases;
  if (opts && Number.isInteger(opts.limit) && opts.limit >= 0) {
    // Note: a limited list sorts the known places by road km first and builds only the records it keeps.
    const tree = routeTree(here, wagon);
    const near = [];
    for (const id of state.known) {
      const km = id === here || !PLACES[id] ? undefined : tree.km(id);
      if (km !== undefined) near.push([km, id]);
    }
    near.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    bases = near.slice(0, opts.limit).map(([, id]) => destinationBase(state, here, id, wagon, tree));
  } else bases = destinationBases(state, here, wagon);
  const destinations = bases.map((b) => needsOf(state, b, n));
  return {
    ok: true,
    here,
    crew: state.crew.map((c) => ({ ...crewSummary(state, c), here: presentIn(state, here).includes(c), willing: c.role === 'sheriff' || !refuses(state, c) })),
    stock: { ...state.stock },
    ammo: { ...state.ammo },
    capacity: capacity(state),
    capacityPerPerson: capacityOf(state.transport.kind, 1),
    transport: { ...state.transport },
    stash: state.stash[here] ? { ...state.stash[here] } : null,
    destinations,
    maxEncounterTeam: 4,
  };
}

const SUPPLIES = ['food', 'water', 'feed'];

// Note: R1-4, R2-2: the options of a departure are checked before anything moves; amounts are finite numbers, not negative, and fractions are fine because the stock is kept in fractions.
function departOpts(opts) {
  if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) return { ok: false, reason: 'The departure options are not valid.' };
  if (opts.party !== undefined && (!Array.isArray(opts.party) || opts.party.some((id) => typeof id !== 'string'))) return { ok: false, reason: 'The party must be a list of people.' };
  const bring = opts.bring === undefined ? {} : opts.bring;
  if (bring === null || typeof bring !== 'object' || Array.isArray(bring)) return { ok: false, reason: 'What to bring must be an object.' };
  const amounts = [...SUPPLIES.map((k) => bring[k])];
  const ammo = bring.ammo === undefined ? {} : bring.ammo;
  if (ammo === null || typeof ammo !== 'object' || Array.isArray(ammo)) return { ok: false, reason: 'The ammunition to bring must be an object.' };
  amounts.push(...AMMO_TYPES.map((t) => ammo[t]));
  if (amounts.some((v) => v !== undefined && v !== null && (!finite(v) || v < 0))) return { ok: false, reason: 'Amounts to bring are numbers, not negative.' };
  return null;
}

export function depart(state, destId, opts = {}) {
  if (state.ended) return ERR_ENDED;
  if (state.journey) return { ok: false, reason: 'The party is already on the road.' };
  const from = state.at;
  if (!from) return { ok: false, reason: 'The party is not in a town.' };
  if (!placeKnown(state, destId)) return { ok: false, reason: 'That place is not known to you.' };
  const bad = departOpts(opts);
  if (bad) return bad;
  if (destId === from) return { ok: false, reason: 'The party is already there.' };
  const wagon = state.transport.kind === 'wagon';
  const path = shortestPath(from, destId, wagon);
  if (!path) return { ok: false, reason: wagon ? 'No wagon road leads there.' : 'No road leads there.' };
  const here = presentIn(state, from);
  const sheriff = sheriffOf(state);
  const wanted = opts.party || here.map((c) => c.id);
  const chosen = [sheriff];
  const refused = [];
  for (const id of wanted) {
    const c = charById(state, id);
    if (!c || c === sheriff || !here.includes(c) || chosen.includes(c)) continue;
    if (refuses(state, c)) {
      refused.push({ charId: c.id, name: c.name });
      continue;
    }
    chosen.push(c);
  }
  for (const c of here) c.where = chosen.includes(c) ? 'party' : from;
  // Note: what the party does not bring stays in the town, in the office, and is picked up again on return.
  const cap = capacityOf(state.transport.kind, chosen.length);
  const bring = opts.bring || {};
  const stash = state.stash[from] || (state.stash[from] = { food: 0, water: 0, feed: 0, ...Object.fromEntries(BASE_AMMO.map((t) => [t, 0])) });
  // Note: supplies are carried in fractions like the stock; only the rounds of ammunition are whole.
  for (const k of SUPPLIES) {
    const have = state.stock[k];
    const carry = round2(clamp(bring[k] ?? have, 0, Math.min(have, cap[k])));
    stash[k] = round2(Math.max(0, stash[k] + have - carry));
    state.stock[k] = carry;
  }
  const bringAmmo = bring.ammo || {};
  for (const t of Object.keys(state.ammo)) {
    const carry = clamp(Math.floor(bringAmmo[t] ?? state.ammo[t]), 0, state.ammo[t]);
    stash[t] = (stash[t] || 0) + state.ammo[t] - carry;
    state.ammo[t] = carry;
  }
  if (!Object.values(stash).some((v) => v > 0)) delete state.stash[from];
  const legs = legsOf(path.places);
  state.journey = {
    from, to: destId, places: path.places, legs, km: path.km, doneKm: 0, mode: modeOf(state.transport.kind), party: chosen.map((c) => c.id), startedMin: state.min, resting: false, pending: null, rollAcc: 0, legIndex: 0, springs: springsOf(legs),
  };
  state.at = null;
  // Note: A5: the saloon visit ends with the stay in town; a key that was never made is not made now.
  if (state.saloonVisit) state.saloonVisit = null;
  // Note: an unanswered saloon spectacle counts as ignored once the party sets out.
  lapse(state);
  const warnings = [];
  if (state.stock.water < chosen.length * 3) warnings.push('The party sets out with less than a day of water.');
  if (state.stock.food < chosen.length) warnings.push('The party sets out with less than a day of rations.');
  if (state.transport.kind !== 'foot' && state.stock.feed < chosen.length) warnings.push('The animals have little feed.');
  logLine(state, `The party leaves ${PLACES[from].name} for ${PLACES[destId].name}.`);
  return {
    ok: true, from, to: destId, km: path.km, places: namedPlaces(state, path.places), party: chosen.map((c) => c.id), refused, warnings, hours: round1(estimateHours(path, state.transport.kind)),
  };
}

function collectStash(state, placeId) {
  const s = state.stash[placeId];
  if (!s) return;
  const cap = capacity(state);
  for (const k of SUPPLIES) {
    const take = Math.max(0, Math.min(s[k], cap[k] - state.stock[k]));
    state.stock[k] = round2(state.stock[k] + take);
    s[k] = round2(s[k] - take);
  }
  for (const t of AMMO_TYPES) {
    state.ammo[t] = (state.ammo[t] || 0) + (s[t] || 0);
    s[t] = 0;
  }
  for (const t of AMMO_TYPES) if (!state.ammo[t]) delete state.ammo[t];
  for (const t of BASE_AMMO) state.ammo[t] ||= 0;
  if (!Object.values(s).some((v) => v > 0)) delete state.stash[placeId];
}

const HOSTILE_TEXT = [
  'Riders break from the {t} ahead with guns out.',
  'A rifle cracks from the {t} and men step into the open.',
  'Armed men block the way across the {t}.',
  'Hard-looking men are camped in the {t} and they have seen the party.',
  'Hooves, then shouting: a gang has caught up with the party in the {t}.',
];
const AMBUSH_TEXT = [
  'Men lie in wait in the {t}; the first shot comes before the party sees them.',
  'The party rides into a trap in the {t}.',
];

// Note: hostiles on the road get their strength from the route and the time of the campaign, never from the player's skill.
export function travelTier(route) {
  return clamp(Math.round(route.danger * 3.5), 1, 4);
}

function makeHostile(state, d, route, terrain, night) {
  const ambush = night ? d.chance(0.8) : d.chance(0.3);
  const region = sceneRegion(pointOf(state).place);
  const label = region ? terrainLabel(terrain, region) : TERRAINS[terrain].label;
  const selection = rng(seedFromString(`${state.seed}:road-site:${state.nextEnc}`));
  const barred = regionalLook(region).noPieces;
  const landmark = selection.pick(SET_PIECES.filter((piece) => piece.terrains.includes(terrain) && !barred.includes(piece.id)));
  const text = `${d.pick(ambush ? AMBUSH_TEXT : HOSTILE_TEXT).replace('{t}', label)} The ground includes the ${landmark.name.toLowerCase()}.`;
  return {
    id: `e${state.nextEnc++}`, kind: 'hostile', route: route.id, terrain, setPiece: landmark.id, tier: travelTier(route), ambush, title: `${ambush ? 'Ambush' : 'Armed men'} — ${landmark.name}`, text, attempts: 0, retreated: false, forced: false, atKm: round1(state.journey.doneKm),
  };
}

// Note: each choice is a small authored event; eff is plain data so a saved game keeps it. time is in minutes, the others are deltas.
const CHOICES = [
  {
    id: 'drover', w: 3, when: (c) => !c.night && ['grassland', 'ranch', 'stage-road'].includes(c.terrain), title: 'Cattle on the road',
    text: 'A herd is being driven across the road and the drovers wave the party to a halt.',
    options: () => [
      { id: 'wait', label: 'Wait for the herd to pass', hint: 'about an hour and a half', eff: { time: 90, text: 'The herd takes its time and the drovers nod their thanks.' } },
      { id: 'help', label: 'Lend a hand with the herd', hint: 'a few hours, a little pay', eff: { time: 180, cents: 300, fatigue: 0.06, rep: 1, text: 'The foreman pays three dollars for the work.' } },
      { id: 'push', label: 'Push through the herd', hint: 'quick, but rude', eff: { time: 25, rep: -1, text: 'The drovers curse the party, but it gets through.' } },
    ],
  },
  {
    id: 'wagon', w: 2, when: (c) => ['stage-road', 'riverbank', 'desert-scrub'].includes(c.terrain), title: 'A broken wagon',
    text: 'A freight wagon sits on the road with a split axle and a teamster who has been waiting since morning.',
    options: () => [
      { id: 'help', label: 'Help mend the axle', hint: 'two hours or more', eff: { time: 150, rep: 2, repTeam: 1, chance: { p: 0.5, ok: { cents: 150, text: 'The teamster presses a few coins on the party.' }, fail: {} }, text: 'The wheel is back on and the teamster is grateful.' } },
      { id: 'pass', label: 'Ride on', eff: { rep: -1, text: 'The teamster watches the party ride by.' } },
    ],
  },
  {
    id: 'peddler', w: 2, when: (c) => !c.night && ['stage-road', 'mining-camp', 'ranch', 'riverbank'].includes(c.terrain), title: 'A peddler',
    text: 'A peddler with a loaded mule offers water and rations at road prices.',
    options: () => [
      { id: 'water', label: 'Buy water, ten litres', hint: '$1.50', needs: { cents: 150 }, eff: { cents: -150, water: 10, text: 'The water is warm but welcome.' } },
      { id: 'food', label: 'Buy rations, three days', hint: '$1.50', needs: { cents: 150 }, eff: { cents: -150, food: 3, text: 'Jerky, hardtack and a tin of peaches.' } },
      { id: 'pass', label: 'Decline', eff: { text: 'The peddler shrugs and plods on.' } },
    ],
  },
  {
    id: 'prospector', w: 2, when: (c) => !c.night && ['rocky-hills', 'wash', 'desert-scrub', 'mining-camp'].includes(c.terrain), title: 'An old prospector',
    text: 'An old prospector sits by a fire at the side of the trail and calls out for company.',
    options: () => [
      { id: 'listen', label: 'Sit and listen', hint: 'half an hour', eff: { time: 45, learn: true, text: 'He talks of every camp and spring he has ever seen.' } },
      { id: 'pass', label: 'Ride on', eff: { text: 'He goes back to his coffee.' } },
    ],
  },
  {
    id: 'heat', w: 2, when: (c) => !c.night && c.weather.kind === 'hot', title: 'Heat',
    text: 'The heat sits on the land and the animals are lathered. Shade is a hard mile off.',
    options: () => [
      { id: 'shade', label: 'Rest in the shade', hint: 'two hours', eff: { time: 120, fatigue: -0.08, water: -2, text: 'The party waits out the worst of the sun.' } },
      { id: 'push', label: 'Push on', eff: { fatigue: 0.05, text: 'The party presses on through the glare.' } },
    ],
  },
  {
    id: 'sick', w: 1.5, when: () => true, title: 'A sick traveller',
    text: 'A traveller lies by the road, weak with fever, his horse gone.',
    options: () => [
      { id: 'help', label: 'Tend him and carry word', hint: 'a couple of hours, water and rations', eff: { time: 150, food: -1, water: -2, rep: 2, repTeam: 1, text: 'The man will live; he will tell it in the next town.' } },
      { id: 'pass', label: 'Ride on', eff: { rep: -1, text: 'No one will ever know, except the party.' } },
    ],
  },
  {
    id: 'strays', w: 1.5, when: (c) => !c.night && ['grassland', 'ranch'].includes(c.terrain), title: 'Strays',
    text: 'A rancher on a blown horse asks for hands to turn a bunch of strays back before dark.',
    options: () => [
      { id: 'help', label: 'Help turn the strays', hint: 'three hours, a day\'s pay', eff: { time: 180, fatigue: 0.06, cents: 250, text: 'Dusty work, but the rancher pays on the spot.' } },
      { id: 'pass', label: 'Decline', eff: { text: 'The rancher rides off alone.' } },
    ],
  },
  {
    id: 'patrol', w: 1, when: (c) => !c.night && ['stage-road', 'grassland', 'desert-scrub'].includes(c.terrain), title: 'A cavalry patrol',
    text: 'A small cavalry patrol halts to look the party over, then relaxes at the sight of the star.',
    options: () => [
      { id: 'news', label: 'Trade news', hint: 'twenty minutes', eff: { time: 20, rep: 1, chance: { p: 0.35, ok: { learn: true, text: 'The sergeant mentions a place worth knowing.' }, fail: {} }, text: 'They know the road and say so.' } },
      { id: 'pass', label: 'Ride on', eff: { text: 'The patrol rides on.' } },
    ],
  },
  {
    id: 'washout', w: 3, when: (c) => c.weather.rainy && !c.weather.snowy, title: 'Washout',
    text: 'A cloudburst has turned the dry wash ahead into a brown torrent.',
    options: () => [
      { id: 'wait', label: 'Wait for it to drop', hint: 'three hours', eff: { time: 180, text: 'By midday the water is a trickle.' } },
      { id: 'ford', label: 'Ford it now', hint: 'quick, and risky', eff: { time: 30, chance: { p: 0.3, ok: {}, fail: { food: -2, time: 90, fatigue: 0.05, text: 'A pack is swept off and the party loses time.' } }, text: 'The party gets across.' } },
    ],
  },
  {
    id: 'toll', w: 1.5, when: (c) => !c.night && ['stage-road', 'rocky-hills', 'wash'].includes(c.terrain), title: 'A toll',
    text: 'Three armed men lounge across the track and say the road is theirs and the crossing costs two dollars.',
    options: (c) => [
      { id: 'pay', label: 'Pay the toll', hint: '$2.00', needs: { cents: 200 }, eff: { cents: -200, time: 10, rep: -1, text: 'They wave the party through, laughing.' } },
      { id: 'face', label: 'Face them down', hint: 'the star may carry it', eff: { chance: { p: clamp(0.3 + c.rep / 150, 0.2, 0.7), ok: { rep: 2, text: 'They back off muttering.' }, fail: { fight: true, text: 'They reach for their guns.' } } } },
      { id: 'refuse', label: 'Refuse and ride at them', eff: { fight: true, text: 'Guns come out.' } },
    ],
  },
  {
    id: 'camp', w: 1.5, when: (c) => ['desert-scrub', 'wash', 'riverbank', 'rocky-hills'].includes(c.terrain), title: 'An abandoned camp',
    text: 'The ashes are still warm in an abandoned camp. Something may have been left behind.',
    options: () => [
      { id: 'search', label: 'Search it', hint: 'forty minutes', eff: { time: 40, chance: { p: 0.5, ok: { cents: 120, food: 2, text: 'A few coins and a sack of beans.' }, fail: { text: 'Nothing but ashes and bones.' } } } },
      { id: 'pass', label: 'Ride on', eff: {} },
    ],
  },
];

function makeChoice(state, d, route, terrain, night) {
  const weather = weatherAt(state.seed, state.min, regionOfState(state));
  const ctx = { terrain, weather, night, rep: state.rep.sheriff, state };
  const pool = CHOICES.filter((c) => c.when(ctx));
  const tpl = d.weighted(pool.map((c) => [c, c.w]));
  return {
    id: `e${state.nextEnc++}`, kind: 'choice', route: route.id, terrain, title: tpl.title, text: tpl.text, tpl: tpl.id, options: tpl.options(ctx).map(clone), atKm: round1(state.journey.doneKm),
  };
}

// Note: one roll per hour on the road; danger is the route's, scaled by the ground and the hour; at night the camp is the exposed place.
function rollEncounter(state, night) {
  const j = state.journey;
  const d = dice(state);
  const loc = locate(j.legs, j.doneKm);
  const route = ROUTES[loc.leg.route];
  const terrain = terrainAt(route, loc.at);
  // Note: the test hook state.rates.road forces the roll, and null leaves it to the dice.
  const forced = hooksOf(state).road;
  if (forced === 0) return null;
  if (forced === 'choice') return makeChoice(state, d, route, terrain, night);
  if (forced === 'hostile') return makeHostile(state, d, route, terrain, night);
  const weather = weatherAt(state.seed, state.min, regionOfState(state));
  const p = 0.2 * route.danger * TERRAINS[terrain].ambush * (night ? 0.5 : 1) * (weather.kind === 'storm' ? 0.7 : 1);
  if (!d.chance(p)) return null;
  return d.chance(0.25 + 0.5 * route.danger) ? makeHostile(state, d, route, terrain, night) : makeChoice(state, d, route, terrain, night);
}

// Note: item 467: a watchful sheriff sometimes reads the signs of a trap and leads the party around it; the chance grows above an ordinary eye, from a hash so the campaign dice stay put.
export const avoidChance = (awareness) => clamp((awareness - 0.5) * 1.5, 0, 0.6);
function sidestep(state, enc, events) {
  if (enc.kind !== 'hostile' || !enc.ambush) return false;
  const sheriff = sheriffOf(state);
  if (!sheriff) return false;
  const forced = hooksOf(state).avoid;
  const roll = unit(`${state.seed}:avoid:${enc.id}`);
  if (!(forced ?? roll < avoidChance(sheriff.skill.awareness))) return false;
  // Note: the party loses time keeping clear, then rides on; the time passes with all its ordinary consequences (item 173).
  const minutes = 40 + Math.round(unit(`${state.seed}:avoid-time:${enc.id}`) * 80);
  events.push(...advance(state, minutes, 'travel'));
  const text = `${sheriff.name} reads the signs of men lying in wait ahead and leads the party around them; it costs ${minutes} minutes.`;
  logLine(state, text);
  events.push({ type: 'avoided', minutes, text, title: enc.title });
  feat(state, 'avoided');
  return true;
}

const pendingResult = (j) => ({ type: j.pending.kind === 'hostile' ? 'hostile' : 'choice', encounter: j.pending });

// Note: lets time pass on the road one hour at a time, rolling for an encounter each hour; stops at the first one.
function passTime(state, minutes, activity) {
  const events = [];
  let left = Math.round(minutes);
  let spent = 0;
  while (left > 0 && !state.ended && state.journey) {
    const j = state.journey;
    const dt = Math.min(60, left);
    events.push(...advance(state, dt, activity));
    spent += dt;
    left -= dt;
    if (!state.journey) break;
    j.rollAcc += dt;
    while (j.rollAcc >= 60) {
      j.rollAcc -= 60;
      if (!j.pending) j.pending = rollEncounter(state, activity === 'camp');
      if (j.pending && sidestep(state, j.pending, events)) j.pending = null;
    }
    if (j.pending) return { minutes: spent, events, encounter: j.pending };
  }
  return { minutes: spent, events, encounter: null };
}

function arrive(state, events) {
  const to = state.journey.to;
  state.at = to;
  // Note: A5: arriving anywhere starts without a saloon visit left over from another place.
  if (state.saloonVisit) state.saloonVisit = null;
  state.journey = null;
  state.dry = { food: 0, water: 0, feed: 0 };
  state.stage = { food: 0, water: 0, feed: 0 };
  collectStash(state, to);
  graceAt(state, to);
  fillOnArrival(state, to);
  logLine(state, `The party reaches ${PLACES[to].name}.`);
  // Note: item 268: a traveller met on the road may have seen the nemesis.
  rollLead(state, 'road', STORY.roadLead, events);
  // Note: item 491: only a case whose place the trail has confirmed waits here.
  const cases = state.cases.filter((c) => c.status === 'accepted' && c.location === to && located(c));
  // Note: item 119: arriving where an accepted case waits opens the encounter directly.
  if (cases.length) return { type: 'case', at: to, caseId: cases[0].id, caseIds: cases.map((c) => c.id), events };
  return { type: 'arrived', at: to, events };
}

function endedResult(state, events) {
  return { type: 'ended', reason: state.ended.reason, events };
}

// Note: one call moves the party for up to maxMinutes of daylight, or through the night camp; it stops at an encounter, a spring, a place or the end.
export function advanceJourney(state, maxMinutes = 60) {
  if (state.ended) return { type: 'ended', reason: state.ended.reason, events: [] };
  if (!finite(maxMinutes) || maxMinutes < 1) return { ok: false, type: 'idle', reason: 'Give a number of minutes, one or more.', events: [] };
  const j = state.journey;
  if (!j) return { type: 'idle', reason: 'The party is not on the road.', events: [] };
  if (j.pending) return pendingResult(j);
  const when = dateOf(state.min);
  if (!when.daylight) {
    const r = passTime(state, minutesUntilHour(state.min, DAY_START), 'camp');
    if (state.ended) return endedResult(state, r.events);
    if (r.encounter) return { ...pendingResult(state.journey), events: r.events, minutes: r.minutes, camp: true };
    return { type: 'progress', camp: true, minutes: r.minutes, events: r.events, position: position(state), doneKm: round1(state.journey ? state.journey.doneKm : 0), totalKm: j.km };
  }
  const toDusk = DAY_END * 60 - (when.hour * 60 + when.minute);
  let chunk = Math.max(1, Math.min(maxMinutes, toDusk, 60));
  const loc = locate(j.legs, j.doneKm);
  const terrain = terrainAt(ROUTES[loc.leg.route], loc.at);
  const party = partyOf(state);
  const fat = party.length ? party.reduce((s, c) => s + c.fatigue, 0) / party.length : 0;
  let kmh = speedKmh(state.transport.kind, terrain, weatherAt(state.seed, state.min, regionOfState(state)), fat);
  if (state.transport.kind !== 'foot' && mountsWeak(state)) kmh *= 0.7;
  const remaining = j.km - j.doneKm;
  let distance = (kmh * chunk) / 60;
  if (distance >= remaining) {
    distance = remaining;
    chunk = Math.max(1, Math.ceil((remaining / kmh) * 60));
  }
  const events = advance(state, chunk, 'travel');
  if (state.ended) return endedResult(state, events);
  if (!state.journey) return { type: 'progress', minutes: chunk, events, rehomed: true };
  j.doneKm = Math.min(j.km, j.doneKm + distance);
  const here = locate(j.legs, j.doneKm);
  const passed = [];
  for (let i = j.legIndex; i < here.index; i++) {
    const end = j.legs[i].end;
    if (end && end !== j.to && learn(state, end, 'on the road', true)) {
      events.push({ type: 'discovered', placeId: end });
      passed.push(PLACES[end].name);
    }
  }
  // Note: a long ride passes many places; one log line names them all.
  if (passed.length) logLine(state, `The party passes through ${passed.length === 1 ? passed[0] : `${passed.slice(0, -1).join(', ')} and ${passed[passed.length - 1]}`} and now knows ${passed.length === 1 ? 'it' : 'them'}.`);
  j.legIndex = Math.max(j.legIndex, here.index);
  for (const s of j.springs) {
    if (s.done || s.at > j.doneKm + 1e-9) continue;
    s.done = true;
    const cap = capacity(state);
    if (state.stock.water < cap.water) {
      state.stock.water = cap.water;
      state.dry.water = 0;
      logLine(state, 'The party refills its water at a spring.');
      events.push({ type: 'spring' });
    }
  }
  if (j.doneKm >= j.km - 1e-6) return arrive(state, events);
  j.rollAcc += chunk;
  while (j.rollAcc >= 60) {
    j.rollAcc -= 60;
    if (!j.pending) j.pending = rollEncounter(state, false);
    if (j.pending && sidestep(state, j.pending, events)) j.pending = null;
  }
  if (j.pending) return { ...pendingResult(j), events, minutes: chunk };
  return { type: 'progress', minutes: chunk, km: round1(distance), events, position: position(state), doneKm: round1(j.doneKm), totalKm: j.km };
}

export function restOnRoad(state, hours) {
  if (state.ended) return ERR_ENDED;
  const j = state.journey;
  if (!j) return { ok: false, reason: 'The party is not on the road.' };
  if (j.pending) return { ok: false, reason: 'Deal with the encounter first.' };
  const h = hours;
  if (!whole(h) || h < 1 || h > 12) return { ok: false, reason: 'Rest from one to twelve whole hours.' };
  const r = passTime(state, h * 60, 'camp');
  if (state.ended) return { ok: true, ...endedResult(state, r.events), minutes: r.minutes };
  if (r.encounter) return { ok: true, ...pendingResult(state.journey), events: r.events, minutes: r.minutes, hours: round1(r.minutes / 60) };
  return { ok: true, type: 'rested', hours: h, minutes: r.minutes, events: r.events };
}

// Note: applies one effect record to the state and returns the changes in words; fatigue and supplies are kept inside their limits.
function applyEffect(state, eff, out) {
  const d = dice(state);
  if (eff.chance) {
    const hit = d.chance(eff.chance.p);
    const sub = hit ? eff.chance.ok : eff.chance.fail;
    applyEffect(state, sub, out);
  }
  if (eff.text) out.texts.push(eff.text);
  if (eff.cents) {
    state.cents = Math.max(0, state.cents + eff.cents);
    out.changes.push(eff.cents > 0 ? 'gained money' : 'spent money');
  }
  const cap = capacity(state);
  for (const k of SUPPLIES) {
    if (!eff[k]) continue;
    state.stock[k] = round2(clamp(state.stock[k] + eff[k], 0, cap[k]));
    out.changes.push(`${eff[k] > 0 ? 'gained' : 'used'} ${k === 'feed' ? 'feed' : k === 'food' ? 'rations' : 'water'}`);
  }
  if (eff.rep) state.rep.sheriff = clamp(state.rep.sheriff + eff.rep, 0, 100);
  if (eff.repTeam) state.rep.team = clamp(state.rep.team + eff.repTeam, 0, 100);
  // Note: item 323: the cap follows the standing at once.
  if (eff.repTeam < 0) enforceCap(state, (out.events ||= []));
  // Note: item 466: hard work on the road wears a tough man less.
  if (eff.fatigue) for (const c of partyOf(state)) c.fatigue = clamp(c.fatigue + eff.fatigue * (eff.fatigue > 0 ? wearOf(c) : 1), 0, 1);
  if (eff.learn) {
    const placeId = tryLearnPlace(state, 'word on the road');
    if (placeId) out.learned = placeId;
  }
  if (eff.fight) out.fight = true;
  if (eff.time) out.time += eff.time;
}

export function choose(state, optionId) {
  if (state.ended) return ERR_ENDED;
  const j = state.journey;
  const p = j && j.pending;
  if (!p || p.kind !== 'choice') return { ok: false, reason: 'There is nothing to decide.' };
  const opt = typeof optionId === 'string' ? p.options.find((o) => o.id === optionId) : null;
  if (!opt) return { ok: false, reason: 'That is not one of the options.' };
  if (opt.needs && opt.needs.cents > state.cents) return { ok: false, reason: 'You cannot afford that.' };
  // Note: R1-3: a purchase on the road is charged only for what the party can carry; with no room at all nothing is bought and nothing is paid.
  let eff = opt.eff;
  if (eff.cents < 0) {
    const cap = capacity(state);
    const k = SUPPLIES.find((x) => eff[x] > 0);
    if (k) {
      const room = Math.floor((cap[k] - state.stock[k]) * 100) / 100;
      if (room <= 0) eff = { text: 'The party cannot carry any more, so the peddler keeps his goods and the money stays in the purse.' };
      else if (room < eff[k]) eff = { ...eff, [k]: room, cents: -Math.ceil((-eff.cents * room) / eff[k]) };
    }
  }
  j.pending = null;
  const out = { texts: [], changes: [], time: 0, fight: false, learned: null };
  applyEffect(state, eff, out);
  let events = out.events || [];
  if (out.time > 0) events = [...events, ...advance(state, out.time, 'camp')];
  let fight = null;
  if (out.fight && state.journey && !state.ended) {
    const route = ROUTES[p.route];
    fight = {
      id: `e${state.nextEnc++}`, kind: 'hostile', route: p.route, terrain: p.terrain, tier: travelTier(route), ambush: false, title: 'Armed men', text: 'The men will not be talked round.', attempts: 0, retreated: false, forced: true, atKm: p.atKm,
    };
    state.journey.pending = fight;
  }
  if (state.ended) return { ok: true, text: out.texts.join(' '), changes: out.changes, learned: out.learned, events, ...endedResult(state, events) };
  return {
    ok: true, text: out.texts.join(' '), changes: out.changes, minutes: out.time, learned: out.learned, fight, events,
  };
}

export function engage(state) {
  if (state.ended) return ERR_ENDED;
  const p = state.journey && state.journey.pending;
  if (!p || p.kind !== 'hostile') return { ok: false, reason: 'There is no one to fight.' };
  return { ok: true, encounter: p };
}

// Note: item 131: slipping away is decided on the map before the scene; success costs time and supplies, failure forces the fight as an ambush.
export function withdraw(state) {
  if (state.ended) return ERR_ENDED;
  const j = state.journey;
  const p = j && j.pending;
  if (!p || p.kind !== 'hostile') return { ok: false, reason: 'There is no one to slip away from.' };
  if (p.forced && p.ambush) return { ok: false, reason: 'There is no slipping away from this.' };
  const d = dice(state);
  const party = partyOf(state);
  const fat = party.length ? party.reduce((s, c) => s + c.fatigue, 0) / party.length : 0;
  const chance = clamp(0.7 - (p.ambush ? 0.35 : 0) - fat * 0.25 - (mountsWeak(state) ? 0.2 : 0) - (state.transport.kind === 'foot' ? 0.1 : 0) - (state.transport.kind === 'wagon' ? 0.15 : 0)
    + TERRAINS[p.terrain].cover * 0.15 - (p.retreated ? 0.15 : 0), 0.1, 0.9);
  if (d.chance(chance)) {
    const minutes = d.int(60, 150);
    const events = advance(state, minutes, 'travel');
    if (state.ended) return { ok: true, escaped: true, minutes, ...endedResult(state, events) };
    if (state.journey) {
      state.journey.doneKm = Math.max(0, state.journey.doneKm - Math.min(state.journey.doneKm, 1 + d.int(0, 4) * 0.5));
      state.journey.pending = null;
    }
    logLine(state, 'The party slips away from armed men.');
    return { ok: true, escaped: true, minutes, events, text: 'The party backs off unseen and goes around.' };
  }
  const minutes = d.int(15, 45);
  const events = advance(state, minutes, 'travel');
  if (state.ended) return { ok: true, escaped: false, minutes, ...endedResult(state, events) };
  if (state.journey && state.journey.pending === p) {
    p.ambush = true;
    p.forced = true;
  }
  logLine(state, 'The party is seen while slipping away; the fight comes anyway.');
  return { ok: true, escaped: false, forced: true, minutes, encounter: p, events, text: 'The party is seen. The fight starts on the other side\'s terms.' };
}

// Note: the time of a route in hours from its legs, never nought for a road that has length: it falls back on the length at the pace of the ground in general.
const hoursOf = (legs, km, kind) => {
  const h = estimateLegHours(legs, kind);
  return round1(h > 0 || !(km > 0) ? h : km / speedKmh(kind, 'grassland', null, 0));
};

// Note: the party may turn for any known place, by whichever end of the leg is shorter overall, and the hour counter for the next encounter roll carries over.
export function redirect(state, destId) {
  if (state.ended) return ERR_ENDED;
  const j = state.journey;
  if (!j) return { ok: false, reason: 'The party is not on the road.' };
  if (j.pending) return { ok: false, reason: 'Deal with the encounter first.' };
  if (!placeKnown(state, destId)) return { ok: false, reason: 'That place is not known to you.' };
  if (destId === j.to) return { ok: false, reason: 'The party is already heading there.' };
  const wagon = state.transport.kind === 'wagon';
  const loc = locate(j.legs, j.doneKm);
  const leg = loc.leg;
  const route = ROUTES[leg.route];
  // Note: the geometry is the route's own, so a leg already partial from a change of course works the same way.
  const behind = leg.dir === 1 ? route.a : route.b;
  const ahead = leg.dir === 1 ? route.b : route.a;
  const back = leg.dir === 1 ? loc.at : route.km - loc.at;
  const fwd = leg.dir === 1 ? route.km - loc.at : loc.at;
  const via = (placeId) => (placeId === destId ? { km: 0, places: [placeId] } : shortestPath(placeId, destId, wagon));
  const a = via(behind);
  const b = via(ahead);
  const totalA = a ? back + a.km : Infinity;
  const totalB = b ? fwd + b.km : Infinity;
  if (totalA === Infinity && totalB === Infinity) return { ok: false, reason: wagon ? 'No wagon road leads there.' : 'No road leads there.' };
  const useStart = totalA <= totalB;
  const path = useStart ? a : b;
  const partial = useStart
    ? { route: leg.route, dir: -leg.dir, from: loc.at, to: leg.dir === 1 ? 0 : route.km, km: back, start: null, end: behind, partial: true }
    : { route: leg.route, dir: leg.dir, from: loc.at, to: leg.dir === 1 ? route.km : 0, km: fwd, start: null, end: ahead, partial: true };
  const legs = [];
  if (partial.km > 0.05) legs.push(partial);
  legs.push(...legsOf(path.places));
  const km = legs.reduce((s, L) => s + L.km, 0);
  const places = [useStart ? behind : ahead, ...path.places.slice(1)];
  const from = j.to;
  j.places = places;
  j.legs = legs;
  j.km = km;
  j.doneKm = 0;
  j.to = destId;
  j.legIndex = 0;
  j.springs = springsOf(legs);
  logLine(state, `The party changes course for ${PLACES[destId].name}.`);
  if (!legs.length) return { ok: true, ...arrive(state, []), redirected: true, from };
  return {
    ok: true, to: destId, km: round1(km), via: isKnown(state, places[0]) ? PLACES[places[0]].name : null, hours: hoursOf(legs, km, state.transport.kind), route: route.id,
  };
}

export function turnBack(state) {
  if (state.ended) return ERR_ENDED;
  const j = state.journey;
  if (!j) return { ok: false, reason: 'The party is not on the road.' };
  return redirect(state, j.from);
}

export const journeyView = (state) => {
  const j = state.journey;
  if (!j) return null;
  return {
    from: j.from, to: j.to, km: round1(j.km), doneKm: round1(j.doneKm), mode: j.mode, party: j.party.slice(), startedMin: j.startedMin, pending: j.pending, position: position(state),
    fromName: PLACES[j.from].name, toName: PLACES[j.to].name, places: namedPlaces(state, j.places),
  };
};
