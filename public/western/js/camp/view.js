// Note: everything the campaign screens show, as plain data, pure and with no DOM or Phaser; skills and standing are shown in words, and hidden numbers are never part of it.

import {
  PLACES, START, BOUNDARY, SOURCES, RECALLED, CHECKS, INFERENCES, FICTION, dateOf, weatherAt, routesOf, REGION_LIST,
} from './world.js';
import {
  dollars, caseById, knownSet, pointOf, regionOfState,
} from './base.js';
import { capacity, departing } from './economy.js';
import { crewSummary } from './town.js';
import { journalView } from './story.js';
import { portraitOf } from './looks.js';
import { teamLimits } from './crew.js';
import { ROLE_TITLE, displayName, labelOf } from './crew.js';
import { intel } from './cases.js';
import { journeyView, position } from './travel.js';

import { repWord, teamWord } from './progress.js';
import { standingEffects } from './standing.js';
import { rewardsView } from './rewards.js';

// Note: one rider has one animal; the stored name speaks of a party.
const ONE_ANIMAL = { horse: 'the horse', mule: 'the mule' };
const transportName = (state) => (departing(state).length === 1 && ONE_ANIMAL[state.transport.kind]) || state.transport.name;

const STAGE_WORD = {
  water: ['', 'thirsty', 'dehydrated', 'dying of thirst'],
  food: ['', 'hungry', 'starving', 'starving to death'],
};

// Note: a drawn place; reasons is present only for a place whose existence or position is in doubt (the uncertainty reason ids of world-data.js).
const placeEntry = (id) => {
  const p = PLACES[id];
  const e = {
    id, name: p.name, kind: p.kind, x: p.x, y: p.y, uncertain: p.uncertain, size: p.size, jur: p.jur, region: p.region,
  };
  if (p.reasons.length) e.reasons = p.reasons.slice();
  return e;
};

// Note: each road once, from its a end, when both ends are in the list; cost is the number of listed places, never the number of routes in the world.
function routesAmong(ids, set) {
  const out = [];
  for (const id of ids) {
    for (const r of routesOf(id)) if (r.a === id && set.has(r.b)) out.push({ id: r.id, a: r.a, b: r.b, km: r.km, road: r.road, danger: r.danger });
  }
  return out;
}

const partyPoint = (state) => {
  const pos = state.journey ? position(state) : null;
  if (pos) return { x: pos.x, y: pos.y };
  return state.at && PLACES[state.at] ? { x: PLACES[state.at].x, y: PLACES[state.at].y } : null;
};

const VIEW_MAP_CAP = 600;

// Note: items 142, 172: only known places are drawn, and only roads between two known places; cases never put a marker on the map.
export function mapOf(state) {
  const known = state.known.filter((id) => PLACES[id]);
  // Note: view() runs on every redraw, so a map of thousands of known places is cut to the largest VIEW_MAP_CAP; screens that need more call mapView.
  if (known.length > VIEW_MAP_CAP) {
    const cut = mapView(state, { limit: VIEW_MAP_CAP });
    return { places: cut.places, routes: cut.routes, party: cut.party, bounds: BOUNDARY.approx };
  }
  return {
    places: known.map(placeEntry), routes: routesAmong(known, knownSet(state)), party: partyPoint(state), bounds: BOUNDARY.approx,
  };
}

// Note: the map of a window of a very large world; query is box { x0, y0, x1, y1 } in km (default all), minSize 0..4 (default 0) and limit (default 600), and the largest places win when more fit.
// Note: the cost is one pass over the known places and the roads of the places kept.
export function mapView(state, query = {}) {
  const q = query || {};
  const box = q.box && ['x0', 'y0', 'x1', 'y1'].every((k) => Number.isFinite(q.box[k])) ? q.box : null;
  const minSize = Number.isInteger(q.minSize) ? q.minSize : 0;
  const limit = Number.isInteger(q.limit) && q.limit >= 0 ? q.limit : 600;
  const inside = [];
  for (const id of state.known) {
    const p = PLACES[id];
    if (!p || p.size < minSize) continue;
    if (box && (p.x < box.x0 || p.x > box.x1 || p.y < box.y0 || p.y > box.y1)) continue;
    inside.push(id);
  }
  inside.sort((a, b) => PLACES[b].size - PLACES[a].size || PLACES[b].idx - PLACES[a].idx);
  const kept = inside.length > limit ? inside.slice(0, limit) : inside;
  kept.sort((a, b) => PLACES[a].idx - PLACES[b].idx);
  return {
    places: kept.map(placeEntry),
    routes: routesAmong(kept, new Set(kept)),
    party: partyPoint(state),
    here: pointOf(state).place,
    bounds: BOUNDARY.approx,
    boundsKm: BOUNDARY.km,
    counts: { known: state.known.length, inside: inside.length, shown: kept.length },
  };
}

export function viewOf(state) {
  const when = dateOf(state.min);
  const w = weatherAt(state.seed, state.min, regionOfState(state));
  const accepted = state.cases.filter((c) => c.status === 'accepted').map((c) => intel(state, c));
  const cap = capacity(state);
  const warnings = [];
  for (const k of ['water', 'food']) if (state.stage[k] > 0) warnings.push(`The party is ${STAGE_WORD[k][state.stage[k]]}.`);
  if (state.stage.feed > 0) warnings.push('The animals are weak for want of feed.');
  return {
    version: state.v,
    seed: state.seed,
    ended: state.ended ? { ...state.ended } : null,
    ironman: state.ironman !== false,
    time: { min: state.min, ...when, weather: { kind: w.kind, label: w.label, highF: w.highF, lowF: w.lowF, rainy: w.rainy, ...(w.snowy ? { snowy: true } : {}) } },
    start: START.label,
    region: { ...REGION_LIST.find((r) => r.id === regionOfState(state)) },
    at: state.at,
    atName: state.at ? PLACES[state.at].name : null,
    journey: journeyView(state),
    money: { cents: state.cents, text: dollars(state.cents) },
    supplies: { stock: { ...state.stock }, capacity: cap, warnings },
    ammo: { ...state.ammo },
    transport: { ...state.transport, name: transportName(state) },
    stash: Object.fromEntries(Object.entries(state.stash).map(([k, v]) => [k, { ...v }])),
    reputation: { sheriff: repWord(state.rep.sheriff), team: teamWord(state.rep.team), effects: standingEffects(state) },
    crew: state.crew.map((c) => crewSummary(state, c)),
    fallen: state.fallen.map((f) => ({ name: f.char.name, display: displayName(f.char), title: ROLE_TITLE[f.char.role] || '', label: labelOf(f.char), role: f.char.role, cause: f.cause, min: f.min, where: f.where, road: !!f.road, portrait: portraitOf(state, f.char) })),
    accepted,
    completed: state.done,
    map: mapOf(state),
    log: state.log.slice(-40).map((l) => ({ min: l.min, text: l.text })),
    encounterActive: !!state.active,
    story: journalView(state),
    limits: teamLimits(state.rep.team),
    // Note: item 471: only the access rewards already found; the rest and their conditions stay hidden.
    rewards: rewardsView(state),
  };
}

// Note: R1-7: a case the party has not seen on a board or heard in town does not exist for the player.
export function caseIntel(state, caseId) {
  const c = typeof caseId === 'string' ? caseById(state, caseId) : null;
  return c && c.seen ? intel(state, c) : null;
}

// Note: the research and honesty notes the title screen cites (item 176).
export const research = () => ({
  start: START.label, boundary: BOUNDARY, sources: SOURCES.map((s) => ({ ...s })), recalled: RECALLED.map((s) => ({ ...s })), checks: CHECKS.map((c) => ({ ...c })), inferences: INFERENCES.slice(), fiction: FICTION,
});
