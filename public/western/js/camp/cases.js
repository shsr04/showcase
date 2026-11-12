// Note: cases: procedural generation from authored material, lifecycle (available, accepted, completed, abandoned, expired, returned), intel and payment, where no case ever fails (item 155).

import {
  PLACES, shortestPath, placesWithin, placesNear, neighbours, dateOf, estimateHours, sceneRegion,
} from './world.js';
import {
  clamp, dice, caseById, charById, logLine, learn, dollars, townOf, isKnown, knownSet, pointOf,
} from './base.js';
import { randomName, ALIASES, bond } from './crew.js';
import { note } from './traits.js';
import { freshKnowledge, facetsView, trustAfterCase, askedDry } from './intel.js';
import { payFactor, skillGains } from './progress.js';
import { rewardBonus, featKind, checkRewards } from './rewards.js';
import { settleCaseHires } from './economy.js';
import { BUILDING_LABELS } from '../house.js';
import { SET_PIECES } from '../setpieces.js';
import { regionalLook } from '../regional-look.js';
import { rng, seedFromString, unit } from '../rand.js';
import { rollLead, STORY, connectedTo, associateLook } from './story.js';
import { makeLook } from './looks.js';
import {
  makePursuit, located, disclose, nearTarget, leadView, WIRE_KM,
} from './pursuit.js';

// Note: each town's board and talk hold up to this many open offers of its own, so the cases of one town never crowd out the next.
export const TOWN_TARGET = 4;
// Note: the daily top-up stops once the towns near the party hold this many open offers together (item 162); arrival fills ignore it.
export const REGION_TARGET = 8;
const GENERATE_PER_DAY = 2;
// Note: a town fills its board on the party's arrival at most once in this many minutes, so riding back and forth does not print offers.
const ARRIVAL_FILL_MIN = 3 * 1440;
const GRACE_MIN = 720;
// Note: straight-line km from the party within which known towns put up new cases; far wider than a day's ride.
export const REFRESH_RADIUS_KM = 220;

// Note: hostile strength by tier, handed to the site generators as diff; tier 3 is close to the Prototype 1 mix.
export const DIFF = {
  1: { count: [2, 3], experience: [0.6, 0.35, 0.05] },
  2: { count: [3, 4], experience: [0.4, 0.5, 0.1] },
  3: { count: [3, 5], experience: [0.3, 0.5, 0.2] },
  4: { count: [4, 6], experience: [0.15, 0.5, 0.35] },
  5: { count: [5, 6], experience: [0.05, 0.4, 0.55] },
};
const BASE_REWARD = [0, 6000, 12000, 25000, 50000, 90000];

// Note: authored material, where each template names the tiers it suits and the kinds of site it can use; {t} is the target, {g} the gang, {p} the place, {s} the site.
const TEMPLATES = [
  {
    kind: 'rustlers', tiers: [1, 2, 3], sites: ['outdoor'], terms: ['per-head', 'dead-or-alive'], gang: 'a gang of cattle thieves',
    title: 'Cattle thieves near {p}',
    text: ['A ranch hand reports {t} and his crew driving off stock near {p}. They have been seen camped at {s}.', '{t} has run off three herds this season. A cattleman wants the gang stopped at {s}, near {p}.'],
  },
  {
    kind: 'horse-thieves', tiers: [1, 2], sites: ['outdoor', 'house'], terms: ['per-head', 'flat'], gang: 'a pair of horse thieves',
    title: 'Horse thieves at {p}',
    text: ['{t} and his partners took horses off a freight line and are said to be holed up at {s} by {p}.', 'Stolen horses were traced to {s}, by {p}. {t} is known to keep company with hard men.'],
  },
  {
    kind: 'claim-jumpers', tiers: [1, 2, 3], sites: ['outdoor', 'house'], terms: ['dead-or-alive', 'flat'], gang: 'claim jumpers',
    title: 'Claim jumpers at {p}',
    text: ['{t} has taken a working claim by force and holds it with rifles. The owners have posted a reward for him at {s}, near {p}.', 'A mining partnership asks the law to clear {t} and his men from {s}, by {p}, before blood is spilled.'],
  },
  {
    kind: 'fugitive', tiers: [1, 2, 3, 4], sites: ['house', 'outdoor'], terms: ['dead-or-alive', 'flat'], gang: 'a wanted man and his friends',
    title: 'Wanted: {t}',
    text: ['{t}, wanted for murder in another county, has been seen at {s} by {p}. He has friends who will not give him up.', 'A warrant is out for {t}. He is said to be hiding with armed men at {s}, near {p}.'],
  },
  {
    kind: 'payroll-robbers', tiers: [2, 3, 4], sites: ['outdoor', 'house'], terms: ['dead-or-alive', 'per-head'], gang: 'payroll robbers',
    title: 'Payroll robbers: {t}',
    text: ['{t} and his gang held up a mine payroll and are thought to be dividing the take at {s}, near {p}.', 'A mill lost its wages to {t}. Word is that the men are lying low at {s}, by {p}.'],
  },
  {
    kind: 'stage-robbers', tiers: [2, 3, 4], sites: ['outdoor'], terms: ['dead-or-alive', 'per-head'], gang: 'stage robbers',
    title: 'Stage robbers on the road',
    text: ['The express company wants {t} and his riders stopped after two coaches were stopped near {p}. They are known to rest at {s}.', '{t} has been robbing coaches. A company agent wants him taken at {s}, near {p}.'],
  },
  {
    kind: 'smugglers', tiers: [2, 3, 4], sites: ['outdoor'], terms: ['per-head', 'flat'], gang: 'smugglers',
    title: 'Smugglers working from {p}',
    text: ['{t} runs contraband across the line and keeps armed guards at {s}, near {p}. A customs man wants them stopped.', 'Goods and arms move through {s} by {p} under {t}. The law is paid to look away; you are not.'],
  },
  {
    kind: 'bank-robbers', tiers: [3, 4, 5], sites: ['house', 'outdoor'], terms: ['dead-or-alive', 'flat'], gang: 'bank robbers',
    title: 'Bank robbers: {t}',
    text: ['{t} and his gang emptied a bank and are holed up at {s} near {p}. The bankers pay well and quickly.', 'A bank has posted a large reward for {t}. He is believed to be sheltering at {s}, by {p}, with his whole gang.'],
  },
  {
    kind: 'hired-gun', tiers: [3, 4, 5], sites: ['house', 'outdoor'], terms: ['dead-or-alive', 'flat'], gang: 'a hired killer and his men',
    title: 'A hired killer: {t}',
    text: ['{t} kills for pay and has shot two witnesses. He keeps armed men around him at {s}, near {p}.', 'Someone is paying {t} to murder a judge. He waits with his men at {s}, by {p}.'],
  },
];

const TERMS_TEXT = { 'dead-or-alive': 'dead or alive', 'per-head': 'a bounty for each man taken down', flat: 'a fixed sum on completion' };

// Note: the harder tiers open with completed cases and with reputation (items 163 and 166).
export const maxTier = (state) => clamp(1 + Math.floor((state.done + 1) / 2) + Math.floor(state.rep.sheriff / 25), 1, 5);

// Note: how far, in route km from the town that offers it, a case may send the party; it grows with progress.
export const caseRangeKm = (state) => clamp(200 + 40 * state.done + 2 * state.rep.sheriff, 200, 700);

// Note: a place, known or not, is open once a case is settled (near) or later still (far), and an uncertain one only when it is known.
export const revealOk = (state, placeId, km = 0) => {
  const p = PLACES[placeId];
  if (!p || p.uncertain) return false;
  return state.done >= 1 && (km <= 100 || state.done >= 3 || state.rep.sheriff >= 30);
};

const round50 = (v) => Math.round(v / 50) * 50;

const fill = (tpl, o) => tpl.replace(/\{(\w)\}/g, (_, k) => o[k] ?? '');

// Note: bigger places draw more trouble.
const SIZE_WEIGHT = [0.5, 0.75, 1, 1.5, 2];
const nearWeight = (km) => (km <= 20 ? 3 : km <= 50 ? 2 : 1);

// Note: the places a case offered at fromId can name, as [id, weight] in place order: within range of the town by road, open by revealOk or known, weighted toward the near and the large; weigh, if given, replaces the distance used for the weight.
export function caseChoices(state, fromId, skip = null, weigh = null) {
  const known = knownSet(state);
  const choices = [];
  for (const { id, km } of placesWithin(fromId, caseRangeKm(state))) {
    const p = PLACES[id];
    if (id === skip || !p.sites.length) continue;
    if (!known.has(id) && !revealOk(state, id, km)) continue;
    choices.push([id, nearWeight(weigh ? weigh(p, km) : km) * SIZE_WEIGHT[p.size]]);
  }
  return choices;
}

function pickLocation(state, d, fromId) {
  return d.weighted(caseChoices(state, fromId));
}

function makeCaseRecord(state, d, o) {
  const tier = o.tier;
  const selection = rng(seedFromString(`${state.seed}:case-site:${state.nextCase}`));
  let site = { ...o.site };
  if (site.kind === 'house') {
    const buildings = o.tpl.kind === 'claim-jumpers' ? ['mine', 'mine', 'house', 'warehouse', 'office'] : o.tpl.kind === 'horse-thieves' ? ['ranch', 'ranch', 'house', 'boardinghouse', 'warehouse'] : Object.keys(BUILDING_LABELS);
    const building = selection.pick(buildings);
    site = { ...site, building, label: BUILDING_LABELS[building] };
  } else if (site.kind === 'outdoor') {
    // Note: a region that bars a landmark (adobe ruins outside the Southwest) never gets it.
    const barred = regionalLook(sceneRegion(o.location)).noPieces;
    const landmark = selection.pick(SET_PIECES.filter((piece) => piece.terrains.includes(site.terrain) && !barred.includes(piece.id)));
    if (landmark) site = { ...site, setPiece: landmark.id, label: `${site.label}, near the ${landmark.name.toLowerCase()}` };
  }
  const tpl = o.tpl;
  const place = PLACES[o.location];
  const target = { name: o.targetName || randomName(d), alias: o.alias === undefined ? (d.chance(0.55) ? d.pick(ALIASES) : null) : o.alias };
  const terms = o.terms || d.pick(tpl.terms);
  const dist = shortestPath(o.offeredAt, o.location);
  const km = dist ? dist.km : 0;
  const range = DIFF[tier].count;
  const hide = d.chance(0.25);
  // Note: item 469: a known office is offered better pay.
  // Note: item 471: an opportunity the office has found raises the pay for its kind of case.
  const cents = round50(BASE_REWARD[tier] * d.range(0.8, 1.25) * (1 + 0.003 * km) * (o.bonus || 1) * payFactor(state.rep.team) * rewardBonus(state, o.tpl.kind));
  const days = d.int(4, 10) + Math.ceil(km / 35);
  const fillers = { t: target.alias ? `${target.name.split(' ')[0]} "${target.alias}" ${target.name.split(' ').slice(1).join(' ')}` : target.name, g: tpl.gang, p: place.name, s: site.label };
  const quality = d.weighted([['exact', 0.4], ['about', 0.4], ['unknown', 0.2]]);
  const c = {
    id: o.id || `q${state.nextCase++}`,
    status: 'available',
    tier,
    kind: tpl.kind,
    title: `${fill(tpl.title, fillers)} — ${site.building ? site.label : (SET_PIECES.find((piece) => piece.id === site.setPiece)?.name || site.label)}`,
    text: fill(d.pick(tpl.text), fillers),
    giver: o.giver,
    offeredAt: o.offeredAt,
    location: o.location,
    target,
    site: { kind: site.kind, terrain: site.terrain, label: site.label, building: site.building || null, setPiece: site.setPiece || null },
    hostileHint: hide ? null : [Math.max(1, range[0] - 1), range[1] + 1],
    extra: o.extra || 0,
    reward: { cents, terms, perHeadCents: terms === 'per-head' ? round50(cents / Math.max(2, Math.round((range[0] + range[1]) / 2))) : null },
    postedMin: state.min,
    expiresMin: state.min + days * 1440 + (d.int(0, 11) * 60),
    deadline: quality,
    attempts: o.attempts || 0,
    history: o.history || [],
    prev: o.prev || null,
    returned: o.returned || 0,
    seen: false,
    ageDays: 0,
  };
  c.history.push({ min: state.min, text: o.prev ? o.note : `Posted at ${PLACES[o.offeredAt].name}.` });
  // Note: item 490: the persistent identity a returned case keeps from the case it came from.
  c.ident = o.ident || c.id;
  // Note: item 491: what a source far from the target can say before the case is located: who and what, not where.
  c.vague = { title: `Wanted: ${fillers.t}`, text: `${fillers.t} and ${tpl.gang} are wanted. Where they hide is not known here.` };
  // Note: item 470: the case's location, defences and men, from its own hash; what the office knows starts with the posting or the talk.
  c.postedDone = state.done;
  c.known = freshKnowledge();
  return c;
}

function pickTemplate(d, tier, siteKind) {
  const ok = TEMPLATES.filter((t) => t.tiers.includes(tier) && t.sites.includes(siteKind));
  return d.pick(ok.length ? ok : TEMPLATES.filter((t) => t.sites.includes(siteKind)));
}

// Note: one new case offered at a known town; giver is 'townsperson' (told by someone) or 'notice' (posted on the board).
export function offerCase(state, townId, giver) {
  const d = dice(state);
  const max = maxTier(state);
  const tiers = [];
  for (let t = Math.max(1, max - 2); t <= max; t++) tiers.push([t, t === max ? 3 : t === max - 1 ? 2 : 1]);
  const tier = d.weighted(tiers);
  const location = pickLocation(state, d, townId) || townId;
  const site = d.weighted(PLACES[location].sites.map((s) => [s, s.w]));
  const tpl = pickTemplate(d, tier, site.kind);
  const c = makeCaseRecord(state, d, { tier, site, tpl, location, offeredAt: townId, giver });
  c.pursuit = makePursuit(state, c);
  state.cases.push(c);
  (giver === 'notice' ? townOf(state, townId).notice : townOf(state, townId).offers).push(c.id);
  return c;
}

// Note: the ordinary offers the supply keeps steady (item 170); an associate's case (item 279) comes on top and draws from the story's dice.
export const openCases = (state) => state.cases.filter((c) => c.status === 'available' && !c.associate);

// Note: the open ordinary offers a town holds on its board and in talk.
const townLoad = (state, id) => openCases(state).filter((c) => c.offeredAt === id).length;

// Note: item 490: whether a town's board or talk refers to a case of the shared pool.
export const offeredIn = (state, townId, id) => !!state.towns[townId] && (state.towns[townId].offers.includes(id) || state.towns[townId].notice.includes(id));

// Note: item 490: a town's local pool carries every open case whose target is in its vicinity, wherever it was first offered, and a large town's board may carry a distant one by wire; returns the number of new references.
export function adoptLocal(state, townId) {
  const p = PLACES[townId];
  if (!p || !(p.services.notices || p.services.ask)) return 0;
  let n = 0;
  for (const c of openCases(state)) {
    if (offeredIn(state, townId, c.id)) continue;
    const near = nearTarget(c, townId);
    const wired = !near && p.services.notices && p.size >= 3 && Math.hypot(p.x - PLACES[c.location].x, p.y - PLACES[c.location].y) <= WIRE_KM && unit(`${state.seed}:wire:${c.id}:${townId}`) < 0.25;
    if (!near && !wired) continue;
    const t = townOf(state, townId);
    (p.services.notices && (wired || !p.services.ask || c.giver === 'notice') ? t.notice : t.offers).push(c.id);
    n++;
  }
  return n;
}

// Note: a town with a board posts about half its offers there; one without has them told.
function postOffer(state, d, town) {
  const p = PLACES[town];
  offerCase(state, town, p.services.notices && (d.chance(0.5) || !p.services.ask) ? 'notice' : 'townsperson');
}

// Note: arriving at a town tops its offers up to the town target at once, rather than at the next midnight; returns the number made.
export function fillOnArrival(state, townId) {
  const p = PLACES[townId];
  if (!p || !(p.services.notices || p.services.ask)) return 0;
  adoptLocal(state, townId);
  const t = state.towns[townId];
  if (t && t.filledMin != null && state.min - t.filledMin < ARRIVAL_FILL_MIN) return 0;
  const d = dice(state);
  let made = 0;
  while (townLoad(state, townId) < TOWN_TARGET) {
    postOffer(state, d, townId);
    made++;
  }
  if (made) townOf(state, townId).filledMin = state.min;
  return made;
}

// Note: daily upkeep: each nearby town's offers are topped up toward the town target regardless of progress (item 162), the emptiest first, and ignored offers develop (item 106).
export function refresh(state, opts = {}) {
  const d = dice(state);
  // Note: only towns near the party issue offers, so a far-off town the party once passed does not fill a board no one will read.
  const here = pointOf(state);
  const towns = [];
  for (const id of state.known) {
    const p = PLACES[id];
    if (p && (p.services.notices || p.services.ask) && Math.hypot(p.x - here.x, p.y - here.y) <= REFRESH_RADIUS_KM) towns.push(id);
  }
  for (const c of opts.fill ? [] : openCases(state)) {
    c.ageDays += 1;
    if (c.ageDays >= 3 && d.chance(0.12)) {
      c.extra += 1;
      c.reward.cents = round50(c.reward.cents * 1.1);
      c.history.push({ min: state.min, text: 'Left alone, the trouble has grown and the reward has gone up.' });
    }
  }
  let made = 0;
  const regionLoad = () => towns.reduce((n, id) => n + townLoad(state, id), 0);
  while (made < (opts.fill ? TOWN_TARGET : GENERATE_PER_DAY) && regionLoad() < REGION_TARGET) {
    const open = towns.filter((id) => townLoad(state, id) < TOWN_TARGET);
    if (!open.length) break;
    const least = Math.min(...open.map((id) => townLoad(state, id)));
    postOffer(state, d, d.pick(open.filter((id) => townLoad(state, id) === least)));
    made++;
  }
  for (const id of towns) adoptLocal(state, id);
  postAssociateCases(state);
}

// Note: items 277, 279: the associates are pursued in sequence: only while no associate's case is open is the next one still free posted, once within reach, on the nearest notice board the office knows, his own town's first; the story's own dice decide, and the case ids are its own.
function postAssociateCases(state) {
  const s = state.story;
  if (!s || s.finalAt || s.ended || s.associates.some((x) => x.status === 'case')) return;
  const a = s.associates.find((x) => x.status === 'free');
  if (!a) return;
  const d = dice(s);
  const here = pointOf(state);
  const p = PLACES[a.at];
  const km = Math.hypot(p.x - here.x, p.y - here.y);
  if (km > caseRangeKm(state) || (!isKnown(state, a.at) && !revealOk(state, a.at, km)) || !d.chance(STORY.postChance)) return;
  const boards = placesWithin(a.at, 200).filter(({ id }) => PLACES[id].services.notices && isKnown(state, id)).sort((x, y) => x.km - y.km);
  // Note: like ordinary cases, his is only posted where the office can read it.
  const board = p.services.notices && isKnown(state, a.at) ? a.at : boards[0]?.id;
  if (!board || !p.sites.length) return;
  const tier = maxTier(state);
  const site = d.weighted(p.sites.map((x) => [x, x.w]));
  const tpl = pickTemplate(d, tier, site.kind);
  s.nextCase = (s.nextCase || 1);
  const c = makeCaseRecord(state, d, { tier, site, tpl, location: a.at, offeredAt: board, giver: 'notice', targetName: a.name, alias: a.alias, id: `n${s.nextCase++}` });
  c.pursuit = { leads: [], step: 0, located: true };
  c.associate = a.id;
  a.status = 'case';
  a.caseId = c.id;
  state.cases.push(c);
  townOf(state, board).notice.push(c.id);
}

const protectedCase = (state, c) => c.status === 'accepted' && ((state.journey && located(c) && c.location === state.journey.to) || (state.active && state.active.caseId === c.id));

// Note: item 159 and 174: reports stay valid through arrival; an accepted case keeps a 12 hour grace on the day the party gets there.
export function graceAt(state, placeId) {
  for (const c of state.cases) if (c.status === 'accepted' && c.location === placeId && located(c)) c.expiresMin = Math.max(c.expiresMin ?? 0, state.min + GRACE_MIN);
}

function forget(state, c) {
  for (const t of Object.values(state.towns)) {
    t.offers = t.offers.filter((id) => id !== c.id);
    t.notice = t.notice.filter((id) => id !== c.id);
  }
}

export function tick(state, events) {
  const d = dice(state);
  for (const c of state.cases) {
    if ((c.status !== 'available' && c.status !== 'accepted') || c.expiresMin == null || state.min < c.expiresMin) continue;
    if (protectedCase(state, c)) continue;
    const wasAccepted = c.status === 'accepted';
    c.status = 'expired';
    c.history.push({ min: state.min, text: wasAccepted ? 'The case expired before it was settled.' : 'The offer lapsed unanswered.' });
    forget(state, c);
    settleCaseHires(state, c.id, false);
    if (c.seen || wasAccepted) logLine(state, `The case "${titleOf(c)}" has expired.`);
    events.push({ type: 'expired', caseId: c.id, accepted: wasAccepted });
    // Note: an associate's case does not come back as an ordinary one; the story posts him again where he is.
    if (!c.associate && d.chance(wasAccepted || c.attempts > 0 ? 0.7 : 0.35)) state.returns.push({ from: c.id, due: state.min + d.int(3, 9) * 1440 });
  }
  const due = state.returns.filter((r) => state.min >= r.due);
  if (due.length) {
    state.returns = state.returns.filter((r) => state.min < r.due);
    for (const r of due) {
      const c = returnCase(state, r.from);
      if (c) events.push({ type: 'returned', caseId: c.id, prev: r.from });
    }
  }
}

// Note: items 158 and 160: the case comes back changed (the target has moved), with its history and its consequences carried forward.
export function returnCase(state, fromId) {
  const old = caseById(state, fromId);
  const towns = state.known.filter((id) => PLACES[id] && PLACES[id].services.notices);
  if (!old || !towns.length) return null;
  const d = dice(state);
  const offeredAt = towns.includes(old.offeredAt) ? old.offeredAt : d.pick(towns);
  // Note: the target moves on to a place the town can name, and the nearer to where he was the likelier.
  const was = PLACES[old.location];
  const location = d.weighted(caseChoices(state, offeredAt, old.location, (p) => Math.hypot(p.x - was.x, p.y - was.y)));
  if (!location) return null;
  const tpl = TEMPLATES.find((t) => t.kind === old.kind) || TEMPLATES[0];
  // Note: the same kind of gang keeps to the kinds of site it uses; any site of the place will do when none fits.
  const fits = PLACES[location].sites.filter((s) => tpl.sites.includes(s.kind));
  const site = d.weighted((fits.length ? fits : PLACES[location].sites).map((s) => [s, s.w]));
  const wary = old.attempts > 0;
  const tier = clamp(old.tier + (wary ? 1 : 0), 1, 5);
  // Note: R3-3: a target who was never faced has only moved on; one who was faced has been warned.
  const note = wary ? `${old.target.name} was warned and has gone to ${PLACES[location].name}.` : `${old.target.name} has moved on to ${PLACES[location].name}.`;
  const c = makeCaseRecord(state, d, {
    tier, site, tpl, location, offeredAt, giver: old.giver, targetName: old.target.name, alias: old.target.alias, terms: old.reward.terms,
    bonus: wary ? 1.2 : 1.05, extra: old.extra + (wary ? 1 : 0), attempts: old.attempts, history: old.history.map((h) => ({ ...h })), prev: old.id, returned: old.returned + 1, note, ident: old.ident || old.id,
  });
  // Note: items 158 and 490: the old case's sources traced where he went, so a returned case is located at once.
  c.pursuit = { leads: [], step: 0, located: true };
  // Note: R3-2: the title is made again from the template, so it names the new place and not the old one.
  c.title = `${c.title} (again)`;
  c.seen = old.seen;
  state.cases.push(c);
  (c.giver === 'notice' ? townOf(state, offeredAt).notice : townOf(state, offeredAt).offers).push(c.id);
  return c;
}

// Note: item 491: the title the player may know: a case not yet located does not name its place.
export const titleOf = (c) => (located(c) || !c.vague ? c.title : c.vague.title);

const ordinal = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][n] || String(n);

// Note: what the player can know; an uncertain deadline or head count is shown as uncertain, not as fact, and neither the true tier nor the true days left is in it (R1-7, R2-1).
// Note: the ride to a case's current lead town, for ordering cases whose place is not yet known.
function sortLeadKm(state, c) {
  const lead = leadView(state, c);
  if (!lead || !lead.known) return null;
  const path = shortestPath(state.at || c.offeredAt, lead.town);
  return path ? path.km : null;
}

export function intel(state, c) {
  const place = PLACES[c.location];
  let deadlineText;
  // Note: R3-4: an accepted case is held while the party rides there or fights there, and for half a day after it arrives; the printed deadline says so and never promises less.
  const held = c.status === 'accepted' ? ' Once the party is on its way there it is held until it arrives, and half a day more.' : '';
  if (c.deadline === 'exact') deadlineText = `Must be settled by ${dateOf(c.expiresMin).label}.${held}`;
  else if (c.deadline === 'about') deadlineText = `Word is it will not keep much past ${dateOf(c.expiresMin - 2 * 1440).label}, give or take a few days.${held}`;
  else deadlineText = 'No one can say how long the offer stands.';
  let men = 'No word on how many men.';
  if (c.hostileHint) men = c.hostileHint[0] === c.hostileHint[1] ? `About ${ordinal(c.hostileHint[0])} men.` : `Somewhere between ${ordinal(c.hostileHint[0])} and ${ordinal(c.hostileHint[1] + c.extra)} men.`;
  // Note: item 470: a counted report replaces the rumour.
  const found = located(c);
  const facets = c.known && found ? facetsView(state, c) : null;
  if (facets && facets.accomplices) men = facets.accomplices;
  const danger = ['', 'a small affair', 'a rough affair', 'a hard case', 'a dangerous case', 'a very dangerous case'][c.tier];
  const reward = c.reward.terms === 'per-head' && c.reward.perHeadCents ? `${dollars(c.reward.perHeadCents)} a head` : dollars(c.reward.cents);
  const path = found ? shortestPath(state.at || c.offeredAt, c.location) : null;
  return {
    id: c.id, ident: c.ident || c.id, status: c.status, title: titleOf(c), text: found || !c.vague ? c.text : c.vague.text, danger,
    // Note: items 490 and 491: until the trail is followed the place is not given out, only the current lead.
    location: found ? { id: c.location, name: place.name, known: isKnown(state, c.location), uncertain: place.uncertain, uncertainty: place.reasons.slice() } : { id: null, name: null, known: false, uncertain: false, uncertainty: [] },
    located: found,
    lead: leadView(state, c),
    site: found ? c.site.label : null, offeredAt: c.offeredAt, giver: c.giver,
    // Note: item 470: the target's location, defences and accomplices as far as the office knows them.
    facets,
    // Note: asking about it here already turned up nothing today (user direction).
    askedDry: askedDry(state, c),
    reward, terms: TERMS_TEXT[c.reward.terms], termsId: c.reward.terms,
    deadline: deadlineText, deadlineKind: c.deadline, men,
    distanceKm: path ? path.km : null, rideHours: path ? Math.round(estimateHours(path, 'horse') * 10) / 10 : null,
    // Note: lists are ordered by this: the ride to the case, or to its current lead's town while the place is unknown; null when neither is known.
    sortKm: path ? path.km : sortLeadKm(state, c),
    attempts: c.attempts, history: c.history.map((h) => ({ ...h })), returned: c.returned,
    retryable: c.status === 'accepted' && (c.expiresMin == null || state.min < c.expiresMin),
    // Note: item 289: the board names the nemesis only when the office already knows the man works for him.
    connected: connectedTo(state, c),
    associatePortrait: connectedTo(state, c) ? { look: associateLook(state, state.story.associates.find((a) => a.id === c.associate)), marks: [] } : null,
    // Note: item 311: the named man a case is after has his portrait too.
    targetPortrait: { look: makeLook(state.seed, c.target.name, 'associate'), marks: [] },
  };
}

// Note: item 490: a case is new in a town when the player has not heard of it, or when the town is near its target and so knows where he is.
export const unseenIn = (state, townId, list) => (state.towns[townId] ? state.towns[townId][list] : []).map((id) => caseById(state, id)).filter((c) => c && c.status === 'available' && (!c.seen || (!located(c) && nearTarget(c, townId))));

// Note: hearing of a case from a source in townId discloses what that source knows (item 490).
export function markSeen(state, c, townId = null) {
  c.seen = true;
  disclose(state, c, townId);
}

// Note: weights of a place being told about: size, nearness to the party, and a post office alone is a weak sign of a settlement.
const TOLD_SIZE = [0.5, 1, 2, 4, 6];
const TALK_KM = 150;
const BIG_KM = 400;

// Note: items 104, 172, 238 to 243: one place told about by talk, a notice, a newspaper or a telegraph; mode is 'talk' (a place within two road hops or 150 km of the party, and any very large place within 400 km) or 'paper' (a place of 500 people or more within 400 km), and an unknown place is shown only this way.
export function tryLearnPlace(state, why, mode = 'talk') {
  const d = dice(state);
  const here = pointOf(state);
  const known = knownSet(state);
  const told = new Map();
  const consider = (id, km) => {
    if (known.has(id) || told.has(id)) return;
    const p = PLACES[id];
    told.set(id, TOLD_SIZE[p.size] * (km <= 50 ? 2 : km <= 100 ? 1.5 : 1) * (p.reasons.includes('post-office-only') ? 0.5 : 1));
  };
  if (mode === 'paper') {
    for (const c of placesNear(here.x, here.y, BIG_KM, { minSize: 2 })) consider(c.id, c.d);
  } else {
    for (const c of placesNear(here.x, here.y, TALK_KM)) consider(c.id, c.d);
    for (const n of neighbours(here.place)) {
      consider(n, 0);
      for (const m of neighbours(n)) consider(m, 100);
    }
    for (const c of placesNear(here.x, here.y, BIG_KM, { minSize: 4 })) consider(c.id, c.d);
  }
  const pick = d.weighted([...told]);
  if (pick === undefined) return null;
  learn(state, pick, why);
  return pick;
}

export function accept(state, caseId, here) {
  const c = caseById(state, caseId);
  if (!c) return { ok: false, reason: 'No such case.' };
  if (c.status !== 'available' || !c.seen) return { ok: false, reason: 'That case is not on offer.' };
  // Note: item 490: any town whose board or talk refers to the case can take the acceptance.
  if (c.offeredAt !== here && !offeredIn(state, here, c.id)) return { ok: false, reason: 'That case is not on offer here.' };
  c.status = 'accepted';
  c.acceptedMin = state.min;
  forget(state, c);
  c.history.push({ min: state.min, text: 'Accepted.' });
  // Note: item 172: accepting a distant case reveals its destination only when its place is known; otherwise the lead's town.
  const goal = located(c) ? c.location : leadView(state, c).town;
  const revealed = learn(state, goal, located(c) ? 'a case sends you there' : 'a lead points there');
  logLine(state, `Accepted "${titleOf(c)}".`);
  return { ok: true, caseId, revealed: revealed ? goal : null };
}

export function abandon(state, caseId) {
  const c = caseById(state, caseId);
  if (!c || c.status !== 'accepted') return { ok: false, reason: 'That case is not accepted.' };
  // Note: R2-5: a case cannot be dropped in the middle of its own fight.
  if (state.active && state.active.caseId === c.id) return { ok: false, reason: 'The party is in the middle of that fight.' };
  c.status = 'abandoned';
  c.history.push({ min: state.min, text: 'Abandoned.' });
  const dRep = 2 + c.tier;
  state.rep.sheriff = clamp(state.rep.sheriff - dRep, 0, 100);
  state.rep.team = clamp(state.rep.team - Math.ceil(dRep / 2), 0, 100);
  settleCaseHires(state, c.id, false);
  logLine(state, `Abandoned "${titleOf(c)}".`);
  return { ok: true, repLost: dRep };
}

// Note: item 170, R3-5: the terms colour the name a settled case earns: a dead-or-alive manhunt is the sheriff's own, a fixed-sum job is the team's, a bounty per head is both in equal measure.
const REP_TERMS = { 'dead-or-alive': { sheriff: 1.25, team: 1 }, 'per-head': { sheriff: 1, team: 1 }, flat: { sheriff: 1, team: 1.25 } };

// Note: payment depends on the case's terms and on the outcome (item 133); dead-or-alive and a fixed sum pay the same cash on purpose and differ in the name they earn (REP_TERMS, R2-12).
// Note: item 493: the wanted target is one head whether secured, killed or incapacitated, so neither pay nor name asks for him alive.
export function payout(c, o) {
  const heads = Math.max(0, o.hostilesDown || 0);
  let cents = c.reward.cents;
  if (c.reward.terms === 'per-head') cents = (c.reward.perHeadCents || round50(c.reward.cents / 3)) * heads;
  if (o.civilianDied) cents = Math.round(cents * 0.75);
  return round50(cents);
}

export function complete(state, caseId, outcome) {
  const c = caseById(state, caseId);
  if (!c || c.status !== 'accepted') return { ok: false, reason: 'That case is not accepted.' };
  const cents = payout(c, outcome);
  c.status = 'completed';
  c.history.push({ min: state.min, text: `Settled; paid ${dollars(cents)}.` });
  state.cents += cents;
  state.done += 1;
  const half = outcome.civilianDied ? 0.5 : 1;
  const by = REP_TERMS[c.reward.terms] || REP_TERMS.flat;
  state.rep.sheriff = clamp(state.rep.sheriff + Math.round((2 + 2 * c.tier) * half * by.sheriff), 0, 100);
  state.rep.team = clamp(state.rep.team + Math.round((1 + c.tier) * half * by.team), 0, 100);
  const ids = (outcome.participants || []).filter((id) => charById(state, id));
  // Note: items 153, 463 and 473: only participants gain, by the case's difficulty and their share, and the result says who grew in what.
  const people = (outcome.people || ids.map((id) => ({ charId: id }))).filter((p) => ids.includes(p.charId));
  const gains = skillGains(state, people, c.tier, { civilianDied: !!outcome.civilianDied });
  bond(state, ids, 3);
  const events = [];
  // Note: item 475: serving through a settled case while devoted is the way to steadfastness.
  for (const id of ids) {
    const m = charById(state, id);
    if (m.role !== 'sheriff' && m.loyalty >= 75) note(state, m, 'loyalty', events);
  }
  for (const id of ids) charById(state, id).cases += 1;
  // Note: item 469: a settled case is publicly known, so it adds to each teammate's own name as it always did; the sheriff's moves with the office's above.
  for (const id of ids.filter((x) => charById(state, x).role !== 'sheriff')) charById(state, id).reputation = clamp(charById(state, id).reputation + 3, 0, 100);
  const hires = settleCaseHires(state, c.id, true);
  trustAfterCase(state, c);
  featKind(state, c.kind);
  logLine(state, `Settled "${c.title}" and was paid ${dollars(cents)}.`);
  const learned = d_learn(state);
  // Note: item 268: a settled case may turn up word of the nemesis or one of his associates.
  if (!c.associate) rollLead(state, 'case', STORY.caseLead, events);
  checkRewards(state, events);
  return { ok: true, cents, hires, learned, events, gains };
}

// Note: finishing a case can bring word of another place that is next to the known ones and whose conditions are met.
function d_learn(state) {
  const d = dice(state);
  return d.chance(0.6) ? tryLearnPlace(state, 'word from the case') : null;
}
