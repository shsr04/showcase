// Note: the campaign state and the single clock; pure, JSON-serialisable, no DOM or Phaser.

import { seedFromString } from '../rand.js';
import {
  START_CENTS, TRANSPORT, PLACES, START_PLACE, START_KNOWN, dateOf, weatherAt,
} from './world.js';
import {
  dice, clamp, clone, logLine, charById, sheriffOf, townOf, pointOf, regionOfState, own, finite, whole,
} from './base.js';
import {
  makeChar, heal, makeCandidate, succeed, labelOf, teamLimits, officeCount,
} from './crew.js';
import { startNames, ROLE_WORDS, streamOf, makeName } from './names.js';
import {
  consume, lodging, hasLodging, payroll, applyDeaths, RESERVE_CAP, leave,
} from './economy.js';
import { tick, refresh, REFRESH_RADIUS_KM } from './cases.js';
import { WEAPONS } from '../weapons.js';
import {
  LIVE_CAP, MEMORY_CAP, PERSONALITIES, byId, inUse, leavesFirst,
} from './gunslingers.js';
import { STANCE } from './duel-mind.js';
import { makeStory, startTown, storyTick, STORY } from './story.js';
import {
  KINDS, MIN_DISTANCE, MAX_DISTANCE, venueFor,
} from './venue.js';
import { soberUp } from './drink.js';
import { migrateSkill, wearOf, SKILLS } from './progress.js';
import { freshKnowledge } from './intel.js';
import { checkRewards, NO_FEATS } from './rewards.js';
import { loadKg, KIT_KG, orderLoadout } from './arsenal.js';
import { relationsDay } from './relations.js';

// Note: version 2 keeps town records and candidate pools only where something happens, and the Prototype 3 records are checked on load; version 3 adds the story.
// Note: version 4 names only places of the generated data (user direction: no hand-made places), so every older save is refused.
export const STATE_VERSION = 4;

// Note: item 301: a lone sheriff's purse at the start of the revenge.
export const LONE_START_CENTS = 12000;
// Note: a test fixture, never offered on a screen (item 318): the Prototype 2 start in Tombstone with a sheriff and a deputy, so older tests keep their dice.
export const P2_START = Object.freeze({ place: START_PLACE, deputy: true });

// Note: start is null for a real campaign (a random rough town, a lone sheriff and a horse, item 301) or P2_START in tests.
export function newState(seed, start = null) {
  const at = start ? start.place : startTown(String(seed));
  const state = {
    v: STATE_VERSION,
    seed: String(seed),
    rng: seedFromString(`camp:${seed}`),
    min: 0,
    at,
    journey: null,
    known: start ? START_KNOWN.slice() : [at],
    cents: start ? START_CENTS : LONE_START_CENTS,
    // Note: a lone sheriff starts with what one rider can carry.
    stock: start ? { food: 10, water: 12, feed: 4 } : { food: 8, water: 8, feed: 4 },
    ammo: { '44-40': 54, '45colt': 42 },
    transport: { kind: 'horse', name: 'the horses' },
    crew: [],
    fallen: [],
    rep: { sheriff: 0, team: 0 },
    cases: [],
    nextCase: 1,
    done: 0,
    towns: {},
    // Note: item 476: the people in towns who report on cases, by town, with how well the office stands with each.
    contacts: {},
    // Note: item 471: access rewards the office has come upon.
    rewards: { found: [] },
    feats: clone(NO_FEATS),
    log: [],
    ended: null,
    // Note: item 498: true until the campaign is retried after a loss; retries counts those returns, so a retried fight gets a fresh scene seed.
    ironman: true,
    retries: 0,
    // Note: item 499: bundles of dynamite the office holds, none at the start; unlocks.dynamite says whether stores sell it to this player.
    dynamite: 0,
    unlocks: {},
    nextChar: 1,
    nextCand: 1,
    nextEnc: 1,
    dry: { food: 0, water: 0, feed: 0 },
    stage: { food: 0, water: 0, feed: 0 },
    returns: [],
    active: null,
    boardOwed: 0,
    boardWarnMin: null,
    lastDay: 0,
    stash: {},
    // Note: item 494: one shared record per pair of crew members, and events not yet known to both sides.
    relations: {},
    relPending: [],
  };
  // Note: item 326: the deputy who takes up the star is made from the seed alone, with the standard rifle and revolver and a horse.
  const who = startNames(seed);
  state.crew.push(makeChar(state, { role: 'sheriff', name: who.sheriff.name, skill: { precision: 0.5, toughness: 0.5, awareness: 0.5 }, hand: 'right', loyalty: 100, terms: { kind: 'sheriff', wageCentsPerWeek: 0 } }));
  if (start && start.deputy) {
    state.crew.push(makeChar(state, {
      role: 'deputy', name: who.deputy.name, skill: { precision: 0.5, toughness: 0.5, awareness: 0.5 }, hand: 'right', loyalty: 60, terms: { kind: 'appointed', wageCentsPerWeek: 1400 }, wageDueMin: 7 * 1440,
    }));
  }
  state.story = makeStory(state.seed, at);
  if (start && start.deputy) logLine(state, `${dateOf(0).label}. ${labelOf(state.crew[0])} and ${labelOf(state.crew[1])} are in ${PLACES[at].name}.`);
  else logLine(state, `${state.story.murder.sheriff}, sheriff of ${PLACES[at].name}, is shot dead at his desk. ${labelOf(state.crew[0])} takes up the star.`);
  refreshCandidates(state, true);
  refresh(state, { fill: true });
  return state;
}

// Note: R2-11: a recruiting town always has a man who wants a deputy's badge and an independent hand, and a pool full of one kind gives up its newest.
export function ensureCandidates(state, id, want = 0) {
  const p = PLACES[id];
  if (!p || !p.services.recruit) return;
  const t = townOf(state, id);
  const KINDS = ['appointed', 'independent'];
  const missing = () => KINDS.filter((k) => !t.candidates.some((c) => c.kind === k));
  while (t.candidates.length < want) {
    const lack = missing();
    t.candidates.push(makeCandidate(state, id, lack.length >= want - t.candidates.length ? lack[0] : undefined));
  }
  for (const kind of missing()) {
    // Note: the last ordinary candidate makes room; a distinctive recruit (item 471) is never the one to go.
    const last = t.candidates.findLastIndex((c) => !c.distinctive);
    if (t.candidates.length >= Math.max(want, 2) && last >= 0) t.candidates.splice(last, 1);
    t.candidates.push(makeCandidate(state, id, kind));
  }
}

// Note: a pool of people looking for work is dropped after this many days out of range.
const POOL_DROP_DAYS = 30;
// Note: at most this many new pools are made in one day so that a huge known list cannot stall the clock.
const NEW_POOLS_PER_DAY = 25;

// Note: the people looking for work come and go; a few are always in each nearby town that has a recruiting trade.
export function refreshCandidates(state, fill = false) {
  const d = dice(state);
  const here = pointOf(state);
  let made = 0;
  for (const id of state.known) {
    const p = PLACES[id];
    if (!p || !p.services.recruit || Math.hypot(p.x - here.x, p.y - here.y) > REFRESH_RADIUS_KM) continue;
    const had = state.towns[id];
    if (!had || !had.candidates.length) {
      if (!fill && made >= NEW_POOLS_PER_DAY) continue;
      made++;
    }
    const t = townOf(state, id);
    // Note: item 471: a distinctive recruit waits for the office.
    t.candidates = t.candidates.filter((c) => c.distinctive || !(state.min - c.postedMin > 5 * 1440 && d.chance(0.5)));
    ensureCandidates(state, id, fill ? 3 : d.int(2, 4));
    t.lastRefresh = state.min;
  }
  for (const t of Object.values(state.towns)) if (t.candidates.length && state.min - t.lastRefresh > POOL_DROP_DAYS * 1440) t.candidates = t.candidates.filter((c) => c.distinctive);
}

// Note: the lines of travel fatigue and recovery, per hour, by what the party is doing; resting at a bed beats a camp on the ground.
const RECOVER = { rest: 0.1, town: 0.06, camp: 0.06, idle: 0.05 };
const HEAL_MULT = { rest: 2, town: 1.2, idle: 1.2, camp: 1, travel: 0.5, fight: 0.5 };
// Note: R2-3: per hour of a fight, charged by encounter.js to those who went in; the clock itself tires no one in a fight.
export const FIGHT_FATIGUE = 0.06;

const moving = (a) => a === 'travel' || a === 'ride' || a === 'walk' || a === 'wagon';

function step(state, dt, activity, events) {
  state.min += dt;
  const when = dateOf(state.min);
  const weather = weatherAt(state.seed, state.min, regionOfState(state));
  const hours = dt / 60;
  const onRoad = !!state.journey;
  // Note: a place with no store, livery, saloon or doctor has no lodging, so the party camps there and lives off its own supplies.
  const camping = !onRoad && !!state.at && !hasLodging(state.at);
  // Note: fatigue and healing for everyone; teammates left behind rest in town whatever the party does.
  for (const c of state.crew) {
    const fighting = activity === 'fight' && ((state.duel?.phase === 'exchange' && state.duel.charId === c.id)
      || (state.brawl?.phase === 'fight' && state.brawl.fighters.some((f) => f.crew && f.id === c.id)));
    const away = c.where !== 'party' && !fighting;
    let delta;
    if (away) delta = -RECOVER.town;
    // Note: item 364: guns heavier than the standard rifle and revolver tire their bearer on the road.
    else if (moving(activity)) delta = TRANSPORT[state.transport.kind].fatigue * weather.fatigue * (1 + 0.04 * Math.max(0, loadKg(c.loadout) - KIT_KG));
    else if (activity === 'fight') delta = 0;
    else delta = -(RECOVER[activity] ?? RECOVER.idle);
    // Note: item 466: Toughness eases what the road wears off a person; rest is the same for all.
    c.fatigue = clamp(c.fatigue + delta * hours * (delta > 0 ? wearOf(c) : 1), 0, 1);
    heal(state, c, dt, away ? HEAL_MULT.town : HEAL_MULT[moving(activity) ? 'travel' : activity] ?? 1);
  }
  // Note: the nemesis mends between meetings like any man.
  if (state.story && state.story.nemesis.alive && state.duel?.opponentId !== 'nemesis') heal(state.story, state.story.nemesis, dt, HEAL_MULT.town);
  for (const g of state.gunslingers || []) {
    if (!g.alive || !g.injuries) continue;
    const fighting = activity === 'fight' && state.duel?.phase === 'exchange' && state.duel.opponentId === g.id;
    heal(state, g, dt, fighting ? HEAL_MULT.fight : HEAL_MULT.town);
  }
  // Note: item 346: drink wears off and hangovers fade for everyone, the crew, the gunslingers and the nemesis alike.
  for (const c of [...state.crew, ...(state.gunslingers || []), ...(state.story ? [state.story.nemesis] : [])]) soberUp(c, hours, state.min);
  const out = consume(state, dt, { road: onRoad || camping, activity: moving(activity) ? 'travel' : activity, weather });
  events.push(...out.events);
  if (out.deaths.length) {
    for (const x of out.deaths) events.push({ type: 'death', charId: x.char.id, name: x.char.name, label: labelOf(x.char), cause: x.cause });
    applyDeaths(state, out.deaths);
  }
  if (!onRoad && !camping && !lodging(state, dt)) {
    if (state.boardWarnMin == null || state.min - state.boardWarnMin >= 1440) {
      state.boardWarnMin = state.min;
      logLine(state, 'There is no money for board and lodging.');
      events.push({ type: 'board-unpaid' });
    }
  }
  payroll(state, events);
  enforceCap(state, events);
  tick(state, events);
  storyTick(state, events);
  if (when.dayIndex !== state.lastDay) {
    state.lastDay = when.dayIndex;
    refresh(state);
    refreshCandidates(state);
    checkRewards(state, events);
    relationsDay(state, events);
  }
  settle(state, events);
}

// Note: item 323: when the crew's standing falls below what its size needs, the least loyal above the cap leave at once; ties go by the later hire.
export function enforceCap(state, events) {
  const over = officeCount(state) - teamLimits(state.rep.team).office;
  if (over <= 0) return;
  const order = state.crew.filter((c) => c.role !== 'sheriff').sort((a, b) => a.loyalty - b.loyalty || b.id.localeCompare(a.id, 'en', { numeric: true }));
  for (const c of order.slice(0, over)) leave(state, c, 'leaves the office, which can no longer keep so many at its standing', events);
}

// Note: after anything that can kill or remove people: drop them from the journey and let the office pick a successor if the sheriff is gone.
export function settle(state, events) {
  enforceCap(state, events);
  if (state.journey) state.journey.party = state.journey.party.filter((id) => charById(state, id));
  if (!state.ended && !sheriffOf(state)) {
    const r = succeed(state);
    events.push({ type: 'succession', ...r });
  }
  if (state.ended && state.story && !state.story.ended) state.story.ended = state.ended.outcome === 'win' ? 'won' : 'failed';
  if (state.ended && !events.some((e) => e.type === 'ended')) events.push({ type: 'ended', reason: state.ended.reason });
}

// Note: the only function that moves the clock; activity is travel, camp, rest, idle or fight, and the events of the span are returned.
export function advance(state, minutes, activity = 'idle') {
  const events = [];
  let left = Math.max(0, Math.round(minutes));
  if (activity === 'fight' && minutes > 0) left = Math.max(1, left);
  while (left > 0 && !state.ended) {
    const dt = Math.min(60, left);
    step(state, dt, activity, events);
    left -= dt;
  }
  return events;
}

// Note: state.rates holds test overrides only, so it is never written.
export const serialise = (state) => JSON.stringify({ ...state, rates: undefined });

export function deserialise(json) {
  const state = typeof json === 'string' ? JSON.parse(json) : clone(json);
  if (!state || state.v !== STATE_VERSION) throw new Error('Unsupported save version.');
  for (const k of ['crew', 'cases', 'known', 'stock', 'ammo', 'rep', 'towns', 'log']) if (state[k] == null) throw new Error(`The save is missing ${k}.`);
  // Note: a rebuilt world may drop a place; a party standing in it or riding to it cannot be placed, so the save is refused rather than half read.
  for (const id of [state.at, state.journey?.to]) if (id && !own(PLACES, id)) throw new Error(`The save names a place the world no longer has: ${id}.`);
  delete state.rates;
  // Note: a save from before the story gets a nemesis of its own seed, hunted from where the party is.
  if (!state.story) state.story = makeStory(state.seed, state.at || state.journey?.to || START_PLACE);
  // Note: item 498: a save from before Retry existed was never retried.
  if (state.ironman == null) state.ironman = true;
  if (state.retries == null) state.retries = 0;
  // Note: item 499: a save from before dynamite holds none.
  if (!Number.isFinite(state.dynamite)) state.dynamite = 0;
  state.unlocks ||= {};
  state.v = STATE_VERSION;
  state.stash ||= {};
  state.returns ||= [];
  migrateRelease(state);
  repairNames(state);
  // Note: a save from before the fixed gun order gets its loadouts sorted.
  for (const c of state.crew) if (Array.isArray(c.loadout)) orderLoadout(c.loadout);
  state.active = resumedScene(state.active);
  repairRecords(state);
  return state;
}

// Note: a save from before the Release gets the three skills (item 464), an empty trait record (item 468) and a personal name of nought (item 469) for everyone it keeps.
function migrateRelease(state) {
  const person = (c) => {
    if (!c || typeof c !== 'object') return;
    if (c.skill) c.skill = migrateSkill(c.skill);
    if (c.role) {
      c.acquired ||= [];
      c.marks ||= {};
      c.gunBuys ||= {};
      // Note: a teammate's name before the Release was read as three points a settled case.
      c.reputation ??= c.role === 'sheriff' ? 0 : clamp(c.cases * 3, 0, 100);
    }
  };
  for (const c of state.crew) person(c);
  for (const f of state.fallen || []) person(f.char);
  for (const t of Object.values(state.towns)) for (const k of t.candidates || []) person(k);
  if (state.duel?.initial?.player) person(state.duel.initial.player);
  for (const f of state.brawl?.fighters || []) person(f.person);
  state.contacts ||= {};
  state.rewards ||= { found: [] };
  state.feats ||= clone(NO_FEATS);
  // Note: item 494: a save from before crew relationships starts every pair on neutral terms.
  state.relations ||= {};
  state.relPending ||= [];
  // Note: item 299: a save in which merely reaching his town fixed the final location before three leads were told gets that undone; he rides on again in a few days.
  const story = state.story;
  if (story && !story.ended && story.finalAt && story.told < STORY.revealAt) {
    story.finalAt = null;
    story.leads = story.leads.filter((l) => l.kind !== 'final');
    story.nemesis.nextMoveMin = state.min + STORY.moveDays[0] * 1440;
  }
  // Note: an open case from before the Release gets its facets and starts knowing what its posting said.
  for (const c of state.cases) {
    if (c.known || !['available', 'accepted'].includes(c.status)) continue;
    c.postedDone = state.done;
    c.known = freshKnowledge();
  }
}

// Note: a scene in flight at save time is kept and flagged, unsaved, as resumed, so backing out of it counts as broken off; a record that is not whole is dropped.
function resumedScene(a) {
  if (!a || typeof a !== 'object') return null;
  const whole = Array.isArray(a.teamIds) && a.alloc && Array.isArray(a.alloc.members) && (a.source === 'journey' || (a.source === 'case' && typeof a.caseId === 'string'));
  if (!whole) return null;
  // Note: not enumerable, so a save of a load is the same text as the save it came from.
  return Object.defineProperty({ ...a }, 'resumed', { value: true, enumerable: false, writable: true });
}

// Note: a record that is not whole, or does not fit the campaign, is set to null as the game itself clears it, a whole one and a key that is absent are left alone.
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => typeof v === 'string' && v.length > 0;
const count = (v) => whole(v) && v >= 0;
const HANDS = ['left', 'right'];
// Attention: the phases are listed here because duel.js, brawl.js and spectate.js do not export them; add a new phase here too.
const DUEL_PHASES = ['challenge', 'ready', 'exchange'];
const BRAWL_PHASES = ['choice', 'fight'];
const SPECTACLE_PHASES = ['offer', 'watching'];
const SIDES = ['defender', 'aggressor'];
const REST_SOURCE = 'teammate-rest';

const validWeapon = (w) => isRecord(w) && own(WEAPONS, w.id) && WEAPONS[w.id].kind === 'handgun' && WEAPONS[w.id].ammoTypes.includes(w.ammoType);
const validInjury = (i) => isRecord(i) && text(i.region) && finite(i.severity);
const validInjuries = (list) => Array.isArray(list) && list.every(validInjury);
const validSkill = (s) => isRecord(s) && SKILLS.every((k) => finite(s[k]));
const validSite = (s) => isRecord(s) && KINDS.includes(s.kind) && text(s.label) && text(s.ground) && Array.isArray(s.props)
  && finite(s.distance) && s.distance >= MIN_DISTANCE && s.distance <= MAX_DISTANCE && (s.side === 1 || s.side === -1) && count(s.crowd) && finite(s.seed);
const inTown = (state, town) => text(town) && town === state.at && !state.journey;

// Note: the roster is made whole man by man: a man without the required fields goes, a wrong optional field is taken away so that its default applies, and the caps of gunslingers.js hold.
function repairMen(state) {
  if (state.gunslingers == null) return;
  const seen = new Set();
  const men = [];
  for (const g of Array.isArray(state.gunslingers) ? state.gunslingers : []) {
    if (!isRecord(g) || !text(g.id) || seen.has(g.id) || !text(g.name) || !PERSONALITIES.includes(g.personality) || !finite(g.reputation) || typeof g.alive !== 'boolean') continue;
    seen.add(g.id);
    if (g.weapon !== undefined && g.weapon !== null && !validWeapon(g.weapon)) delete g.weapon;
    if (g.ammunition !== undefined && !count(g.ammunition)) delete g.ammunition;
    if (g.injuries !== undefined && !Array.isArray(g.injuries)) delete g.injuries;
    else if (g.injuries && !validInjuries(g.injuries)) g.injuries = g.injuries.filter(validInjury);
    if (g.memories !== undefined && !Array.isArray(g.memories)) delete g.memories;
    else if (g.memories) {
      if (!g.memories.every((m) => isRecord(m) && text(m.kind))) g.memories = g.memories.filter((m) => isRecord(m) && text(m.kind));
      if (g.memories.length > MEMORY_CAP) g.memories = g.memories.slice(-MEMORY_CAP);
    }
    if (g.at !== undefined && !own(PLACES, g.at)) delete g.at;
    for (const key of ['seen', 'moved']) if (g[key] !== undefined && !finite(g[key])) delete g[key];
    if (g.rearmAt != null && !finite(g.rearmAt)) delete g.rearmAt;
    if (g.hand !== undefined && !HANDS.includes(g.hand)) delete g.hand;
    men.push(g);
  }
  // Note: the busy set is read from the raw records, so a man who is in a duel or a dispute is never the one to make room.
  const busy = inUse(state);
  for (const live of [true, false]) {
    const group = men.filter((g) => g.alive === live);
    while (group.length > LIVE_CAP) {
      const idle = group.filter((g) => !busy.has(g.id)).sort(leavesFirst);
      if (!idle.length) break;
      group.splice(group.indexOf(idle[0]), 1);
      men.splice(men.indexOf(idle[0]), 1);
    }
  }
  state.gunslingers = men;
  // Note: the next id is above every id in use, so a new man never takes the name of one on the roster.
  const top = Math.max(0, ...men.map((g) => Number(/^g(\d+)$/.exec(g.id)?.[1]) || 0));
  const next = state.nextGunslinger;
  if ((top > 0 || next !== undefined) && !(whole(next) && next > top)) state.nextGunslinger = top + 1;
}

// Note: the sheet of one side of an exchange, as DuelSim reads it; rounds are checked against what the campaign holds.
function validSheet(sheet, weapon, held) {
  return isRecord(sheet) && validWeapon(weapon) && count(sheet.loaded) && sheet.loaded <= WEAPONS[weapon.id].cap && count(sheet.reserve) && sheet.reserve <= RESERVE_CAP
    && (!finite(held) || sheet.loaded + sheet.reserve <= held);
}

function validStart(state, d, opponent) {
  const i = d.initial;
  if (!isRecord(i) || !count(i.seed) || !isRecord(i.player) || !isRecord(i.opponent)) return false;
  const player = i.player;
  const foe = i.opponent;
  return validSheet(i, d.weapon.weapon, state.ammo[d.weapon.weapon.ammoType]) && finite(state.ammo[d.weapon.weapon.ammoType])
    && HANDS.includes(player.hand) && validSkill(player.skill) && finite(player.fatigue) && validInjuries(player.injuries)
    && validSheet(foe, foe.weapon, opponent.ammunition) && validInjuries(foe.injuries) && text(foe.personality) && own(STANCE, foe.stance) && finite(foe.reputation);
}

function dueled(state, d) {
  if (!isRecord(d) || !DUEL_PHASES.includes(d.phase) || !inTown(state, d.town) || !text(d.source) || !text(d.dispute) || !text(d.venue)) return false;
  // Note: the final duel's opponent is the nemesis of the story, not a gunslinger.
  const opponent = d.opponentId === 'nemesis' ? (d.final && state.story && state.story.nemesis.alive ? state.story.nemesis : null) : byId(state, d.opponentId);
  if (!opponent || !charById(state, d.charId) || !isRecord(d.weapon) || !charById(state, d.weapon.owner) || !validWeapon(d.weapon.weapon)) return false;
  if (!finite(d.distance) || d.distance < MIN_DISTANCE || d.distance > MAX_DISTANCE) return false;
  if (d.phase === 'exchange' && !validStart(state, d, opponent)) return false;
  // Note: the ground is only drawn from; the arena has a fallback, so a bad record of it is taken away.
  if (d.site !== undefined && !validSite(d.site)) delete d.site;
  const late = (x) => isRecord(x) && text(x.charId);
  if (d.deferredDepartures !== undefined && !(Array.isArray(d.deferredDepartures) && d.deferredDepartures.every(late))) delete d.deferredDepartures;
  return true;
}

function validFighter(state, f) {
  if (!isRecord(f) || !text(f.id) || !text(f.name) || !SIDES.includes(f.side) || !finite(f.x) || !finite(f.y) || !count(f.loaded) || !count(f.reserve)) return false;
  if (f.weapon !== null && (!validWeapon(f.weapon) || f.loaded > WEAPONS[f.weapon.id].cap)) return false;
  if (f.weapon === null && f.loaded + f.reserve > 0) return false;
  if (!f.crew) return true;
  return !!charById(state, f.id) && isRecord(f.person) && validSkill(f.person.skill) && finite(f.person.fatigue) && validInjuries(f.person.injuries);
}

function fought(state, b) {
  if (!isRecord(b) || own(b, 'report') || !BRAWL_PHASES.includes(b.phase) || !inTown(state, b.town) || !text(b.source) || !text(b.dispute) || !text(b.targetName) || !count(b.seed)) return false;
  if (!Array.isArray(b.aggressors) || !b.aggressors.length || !b.aggressors.every((a) => isRecord(a) && text(a.id) && text(a.name))) return false;
  if (b.targetId === null ? !(isRecord(b.bystander) && text(b.bystander.id) && text(b.bystander.name)) : !(text(b.targetId) && charById(state, b.targetId))) return false;
  if (b.phase === 'choice') return true;
  if (typeof b.intervene !== 'boolean' || !Array.isArray(b.fighters) || b.fighters.length < 2 || !b.fighters.every((f) => validFighter(state, f))) return false;
  if (new Set(b.fighters.map((f) => f.id)).size !== b.fighters.length || SIDES.some((side) => !b.fighters.some((f) => f.side === side))) return false;
  if (b.intervene ? !b.fighters.some((f) => f.crew && f.id === b.playerId) : b.playerId !== null) return false;
  const used = {};
  for (const f of b.fighters) if (f.crew && f.weapon) used[f.weapon.ammoType] = (used[f.weapon.ammoType] || 0) + f.loaded;
  if (Object.entries(used).some(([type, n]) => !(n <= state.ammo[type]))) return false;
  if (!Array.isArray(b.deferredDepartures)) b.deferredDepartures = [];
  return true;
}

const validSide = (s) => isRecord(s) && (s.kind === 'gunslinger' ? text(s.id) : s.kind === 'patron' && s.id === null) && text(s.name) && text(s.personality) && finite(s.reputation)
  && HANDS.includes(s.hand) && validWeapon(s.weapon) && count(s.ammunition) && validInjuries(s.injuries);

function watched(state, s) {
  if (!isRecord(s) || !SPECTACLE_PHASES.includes(s.phase) || !inTown(state, s.town) || !finite(s.min) || !count(s.seed) || !text(s.dispute) || !validSide(s.a) || !validSide(s.b)) return false;
  // Note: the ground of a dispute is a hash of the seed, the town and the minute, so a lost one is drawn again exactly as it was.
  if (!validSite(s.site)) s.site = venueFor(state.seed, s.town, `spectacle:${s.min}`);
  return true;
}

// Note: a rest waits only for the duel or the brawl that stopped it; with none standing it would block every later rest.
function resting(state, r) {
  return isRecord(r) && inTown(state, r.town) && whole(r.requested) && r.requested > 0 && whole(r.remaining) && r.remaining >= 0 && r.remaining <= r.requested
    && Array.isArray(r.visits) && r.visits.every(text) && (state.duel?.source === REST_SOURCE || state.brawl?.source === REST_SOURCE);
}

function visiting(state, v) {
  return isRecord(v) && inTown(state, v.town) && Array.isArray(state.known) && state.known.includes(v.town) && own(PLACES, v.town) && !!PLACES[v.town].services.saloon && text(v.patron) && count(v.seed);
}

// Note: the order matters: the roster first, a fight before a duel (the screen shows the fight), and the rest and the visit last, as they hang on what is left.
function repairRecords(state) {
  const check = (key, ok) => {
    if (state[key] != null && !ok(state, state[key])) state[key] = null;
  };
  repairMen(state);
  check('brawl', fought);
  if (state.brawl && state.duel != null) state.duel = null;
  check('duel', dueled);
  check('spectacle', watched);
  check('rest', resting);
  check('saloonVisit', visiting);
}

// Note: a person named by a bare role word gets the name the seed gives that person, or one from the seed and the id.
export function repairNames(state) {
  const roleWord = (n) => !n || ROLE_WORDS.some((r) => r.toLowerCase() === String(n).trim().toLowerCase());
  const start = startNames(state.seed);
  const fix = (c) => {
    if (!roleWord(c.name)) return;
    if (c.id === 'c1' && c.role === 'sheriff') c.name = start.sheriff.name;
    else if (c.id === 'c2' && c.role === 'deputy') c.name = start.deputy.name;
    else {
      const taken = new Set([...state.crew, ...state.fallen.map((f) => f.char)].filter((x) => !roleWord(x.name)).map((x) => x.name.toLowerCase()));
      c.name = makeName(streamOf(`${state.seed}:name:${c.id}`), { use: c.role === 'sheriff' ? 'sheriff' : c.role === 'deputy' ? 'deputy' : 'hire', taken }).name;
    }
    c.alias ??= null;
  };
  for (const c of state.crew) fix(c);
  for (const f of state.fallen) if (f.char) fix(f.char);
  for (const c of state.crew) c.alias ??= null;
}

