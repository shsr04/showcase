// Note: shared helpers for the campaign layer; seeded dice stored in the state, log lines, small lookups, with no DOM or Phaser.

import { unit } from '../rand.js';
import {
  PLACES, ROUTES, START_PLACE, locate, mapPoint,
} from './world.js';

// Note: a backstop only: NaN lands on lo so it never spreads through the state; the facade refuses such input before this.
export const clamp = (v, lo, hi) => (v !== v ? lo : v < lo ? lo : v > hi ? hi : v);
export const round2 = (v) => Math.round(v * 100) / 100;

// Note: a deep copy through JSON; state and facade results are plain data.
export const clone = (v) => JSON.parse(JSON.stringify(v));

// Note: facade input guards; a number from outside is finite, or a whole number, or the call is refused.
export const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const whole = (v) => Number.isInteger(v);
// Note: a key from outside is an own key of a table, so 'constructor' or '__proto__' never reaches a lookup.
export const own = (table, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);

// Note: one stream per campaign, kept in state.rng so a saved game continues the same sequence.
export function dice(state) {
  const next = () => {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const self = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // Note: weights is a list of [value, weight] pairs.
    weighted(weights) {
      // Warning: an empty list gives undefined and draws nothing; callers must handle it.
      if (!weights.length) return undefined;
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of weights) {
        r -= w;
        if (r <= 0) return v;
      }
      return weights[weights.length - 1][0];
    },
  };
  return self;
}

// Note: a stable 0..1 number from the campaign seed and a tag, for facts that must not depend on the order of play (weather).
export const stable = (state, tag) => unit(`${state.seed}:${tag}`);

export const LOG_CAP = 200;

export function logLine(state, text) {
  state.log.push({ min: state.min, text });
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}

export const charById = (state, id) => state.crew.find((c) => c.id === id) || null;
export const sheriffOf = (state) => state.crew.find((c) => c.role === 'sheriff') || null;
export const partyOf = (state) => state.crew.filter((c) => c.where === 'party');
export const caseById = (state, id) => state.cases.find((c) => c.id === id) || null;

export function dollars(cents) {
  const sign = cents < 0 ? '-' : '';
  const c = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

// Note: known stays a plain id array in the save; a lookup set per array is rebuilt only when the array was changed from outside.
const KNOWN_SETS = new WeakMap();
function knownEntry(state) {
  const arr = state.known;
  let e = KNOWN_SETS.get(arr);
  if (!e || e.n !== arr.length || e.last !== arr[arr.length - 1]) {
    e = { n: arr.length, last: arr[arr.length - 1], set: new Set(arr) };
    KNOWN_SETS.set(arr, e);
  }
  return e;
}
export const knownSet = (state) => knownEntry(state).set;
export const isKnown = (state, id) => knownEntry(state).set.has(id);

// Note: a place becomes known (selectable and drawn) only through this call (item 172); quiet skips the log line when the caller writes one summary.
export function learn(state, placeId, why, quiet = false) {
  if (!own(PLACES, placeId)) return false;
  const e = knownEntry(state);
  if (e.set.has(placeId)) return false;
  state.known.push(placeId);
  e.set.add(placeId);
  e.n = state.known.length;
  e.last = placeId;
  if (!quiet) logLine(state, why ? `${PLACES[placeId].name} is now known to you (${why}).` : `${PLACES[placeId].name} is now known to you.`);
  return true;
}

// Note: where the party is as a point in km from Tombstone and the place it is at or nearest to; the anchor of talk, weather and cases.
export function pointOf(state) {
  const p = state.at && PLACES[state.at];
  if (p) return { x: p.x, y: p.y, place: state.at };
  const j = state.journey;
  const loc = j && j.legs && j.legs.length ? locate(j.legs, j.doneKm) : null;
  if (loc) {
    const pt = mapPoint(loc.leg, loc.into);
    // Note: a partial leg after a change of course has no start place, so the nearer end of its route is used.
    const r = ROUTES[loc.leg.route];
    return { x: pt.x, y: pt.y, place: loc.at * 2 < r.km ? r.a : r.b };
  }
  const s = PLACES[START_PLACE];
  return { x: s.x, y: s.y, place: START_PLACE };
}
export const regionOfState = (state) => PLACES[pointOf(state).place]?.region;

// Note: the per-town record is created on first use; offers are townspeople's cases, notice the board's, candidates the people looking for work.
export function townOf(state, id) {
  return state.towns[id] || (state.towns[id] = { offers: [], notice: [], candidates: [], lastRefresh: state.min });
}
