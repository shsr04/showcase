// Note: what the party does in a town: notices, townspeople, shops, the doctor, hiring, resting and equipment. Pure, no DOM or Phaser.

import { WEAPONS } from '../weapons.js';
import { PLACES, GOODS, placeFacts } from './world.js';
import {
  caseById, charById, dice, townOf, logLine, clamp, own, whole, finite, sheriffOf,
} from './base.js';
import { advance, ensureCandidates, enforceCap } from './state.js';
import {
  shop as shopList, buy as buyGood, sell as sellGood, sellValue, capacity, doctorCare, treatQuote, treat as treatChar, refillPlan, ammoRefillPlan,
} from './economy.js';
import {
  recruit as recruitChar, conditionLabel, fatigueLabel, mood, activeInjuries, burden, teamLimits, officeCount, marketWage,
  ROLE_TITLE, displayName, labelOf, VERY_LOYAL, acceptRatio, WILL, willingness, WILLING_AT,
} from './crew.js';
import {
  intel, unseenIn, markSeen, accept as acceptCase, abandon as abandonCase, tryLearnPlace,
} from './cases.js';
import { portraitOf } from './looks.js';
import { skillView, repWord, talkBonus, skillAvg } from './progress.js';
import { traitView, note } from './traits.js';
import { bondsView, loyaltyWord } from './relations.js';
import { recoverInTown } from './story.js';
import { drinkWord, levelOf, heavyDrinker } from './drink.js';
import { canCarry, orderLoadout } from './arsenal.js';

const ERR_NOT_HERE = { ok: false, reason: 'The party is not in a town.' };
const ERR_ENDED = { ok: false, reason: 'The campaign is over.' };

// Note: the place the party is in, or null on the road or after the end.
export const hereOf = (state) => (state.ended || state.journey ? null : state.at);

export const presentIn = (state, placeId) => state.crew.filter((c) => c.where === placeId || (c.where === 'party' && state.at === placeId && !state.journey));

function gate(state) {
  if (state.ended) return ERR_ENDED;
  if (!hereOf(state)) return ERR_NOT_HERE;
  return null;
}

const listOf = (state, townId, key) => townOf(state, townId)[key].map((id) => caseById(state, id)).filter((c) => c && c.status === 'available' && c.seen).map((c) => intel(state, c));

export function townView(state) {
  const id = hereOf(state);
  if (!id) return null;
  const p = PLACES[id];
  return {
    id,
    name: p.name,
    kind: p.kind,
    blurb: p.blurb,
    uncertain: p.uncertain,
    facts: placeFacts(id),
    services: { doctor: p.services.doctor > 0, store: !!p.services.store, livery: !!p.services.livery, recruit: !!p.services.recruit, notices: !!p.services.notices, ask: !!p.services.ask, saloon: !!p.services.saloon },
    notices: listOf(state, id, 'notice'),
    offers: listOf(state, id, 'offers'),
    newNotices: unseenIn(state, id, 'notice').length > 0,
    newTalk: unseenIn(state, id, 'offers').length > 0,
    stash: state.stash[id] ? { ...state.stash[id] } : null,
  };
}

// Note: item 125: reading the board takes a little time; every posting there becomes known, and now and then it points at a place not yet known.
export function readNotices(state) {
  const bad = gate(state);
  if (bad) return bad;
  const id = state.at;
  if (!PLACES[id].services.notices) return { ok: false, reason: `${PLACES[id].name} has no notice board.` };
  const events = advance(state, 20, 'idle');
  if (state.ended) return { ok: true, minutes: 20, cases: [], learned: null, events };
  const fresh = unseenIn(state, id, 'notice');
  for (const c of fresh) markSeen(state, c, id);
  // Note: a town of 500 people or more has a newspaper and a telegraph, so its board also carries news of other large places.
  const learned = dice(state).chance(0.2) ? tryLearnPlace(state, 'a posted notice', PLACES[id].size >= 2 ? 'paper' : 'talk') : null;
  return { ok: true, minutes: 20, newCount: fresh.length, cases: listOf(state, id, 'notice'), learned, events };
}

// Note: talk takes longer than reading a board; each question turns up one or two offers, if the town has any, and now and then a place.
export function converse(state) {
  const id = state.at;
  const events = advance(state, 45, 'idle');
  if (state.ended) return { ok: true, minutes: 45, cases: [], learned: null, events };
  const d = dice(state);
  const pool = unseenIn(state, id, 'offers');
  const fresh = d.shuffle(pool.slice()).slice(0, d.int(1, 2) + talkBonus(state.rep.team));
  for (const c of fresh) markSeen(state, c, id);
  const learned = d.chance(0.3) ? tryLearnPlace(state, 'talk in town') : null;
  if (!fresh.length) logLine(state, `Nobody in ${PLACES[id].name} has trouble to report today.`);
  return { ok: true, minutes: 45, newCount: fresh.length, cases: fresh.map((c) => intel(state, c)), learned, events };
}

// Note: the town page asks around only where townspeople have something to say; a saloon talk goes through converse in any town.
export function askAround(state) {
  const bad = gate(state);
  if (bad) return bad;
  if (!PLACES[state.at].services.ask) return { ok: false, reason: `No one in ${PLACES[state.at].name} has anything to say.` };
  const result = converse(state);
  // Note: item 286: where a dead associate lived, his belongings or the people who knew him give up what he knew.
  if (result.ok !== false && !state.ended) recoverInTown(state, (result.events ||= []));
  return result;
}

export function accept(state, caseId) {
  const bad = gate(state);
  if (bad) return bad;
  return acceptCase(state, caseId, state.at);
}

// Note: item 323: a fall in the crew's standing sends those above the new cap away at once.
export function abandon(state, caseId) {
  if (state.ended) return ERR_ENDED;
  const r = abandonCase(state, caseId);
  if (!r.ok) return r;
  enforceCap(state, (r.events ||= []));
  // Note: item 475: dropping cases the office took is the sheriff looking out for himself.
  note(state, sheriffOf(state), 'self-interest', r.events);
  return r;
}

export function shopView(state) {
  const bad = gate(state);
  if (bad) return bad;
  const id = state.at;
  const goods = shopList(state, id).map((g) => ({ ...g, sellCents: sellValue(state, id, g.id) }));
  return {
    ok: true, place: id, goods, cents: state.cents, stock: { ...state.stock }, capacity: capacity(state), ammo: { ...state.ammo }, transport: { ...state.transport }, refill: refillPlan(state, id), ammoRefill: ammoRefillPlan(state, id),
  };
}

// Note: R1-4, R2-2: what a trade is asked for is checked before anything changes: a known good, a whole number of lots, and a person who is here.
function tradeArgs(state, item, qty, opts) {
  if (typeof item !== 'string' || !own(GOODS, item)) return { ok: false, reason: 'No such goods.' };
  if (!whole(qty) || qty < 1) return { ok: false, reason: 'Name a whole number of lots.' };
  if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) return { ok: false, reason: 'The options are not valid.' };
  if (opts.forId !== undefined && opts.forId !== null) {
    const who = typeof opts.forId === 'string' ? charById(state, opts.forId) : null;
    if (!who || !presentIn(state, state.at).includes(who)) return { ok: false, reason: 'That person is not here.' };
  }
  return null;
}

export function buy(state, item, qty = 1, opts = {}) {
  const bad = gate(state) || tradeArgs(state, item, qty, opts);
  if (bad) return bad;
  return buyGood(state, state.at, item, qty, opts);
}

// Note: R2-6: selling a weapon off a teammate needs that teammate present, as buying one for them does.
export function sell(state, item, qty = 1, opts = {}) {
  const bad = gate(state) || tradeArgs(state, item, qty, opts);
  if (bad) return bad;
  return sellGood(state, state.at, item, qty, opts);
}

const SEV_WORD = (s) => (s < 0.35 ? 'light' : s < 0.7 ? 'serious' : 'severe');
const SIDE_WORD = { '-1': 'right', 0: '', 1: 'left' };

export function describeInjuries(c) {
  return c.injuries.map((i) => ({
    region: i.region, side: SIDE_WORD[i.side] ?? '', severity: SEV_WORD(i.severity), healed: Math.round(i.healed * 100) / 100, lasting: i.lasting, treated: i.treated,
  }));
}

export function doctorView(state) {
  const bad = gate(state);
  if (bad) return bad;
  const id = state.at;
  const care = doctorCare(id);
  const patients = presentIn(state, id).filter((c) => c.injuries.length).map((c) => ({
    charId: c.id, name: c.name, display: displayName(c), title: ROLE_TITLE[c.role] || '', label: labelOf(c), condition: conditionLabel(c), injuries: describeInjuries(c), quote: treatQuote(state, id, c),
  }));
  return { ok: true, place: id, available: care > 0, care, patients };
}

export function treat(state, charId) {
  const bad = gate(state);
  if (bad) return bad;
  const c = typeof charId === 'string' ? charById(state, charId) : null;
  if (!c || !presentIn(state, state.at).includes(c)) return { ok: false, reason: 'That person is not here.' };
  const r = treatChar(state, state.at, c);
  if (!r.ok) return r;
  const events = advance(state, r.minutes, 'rest');
  // Note: item 475: paying the doctor for his people again and again marks a protective sheriff.
  if (c.role !== 'sheriff') note(state, sheriffOf(state), 'protective', events);
  return { ...r, events };
}

const impression = (cand) => {
  const v = skillAvg(cand) + cand.bias * 0.3;
  return v < 0.43 ? 'untried' : v < 0.52 ? 'steady' : 'sharp';
};

// Note: item 469: the lowest weekly wage a candidate signs for with this office, from 50 cents up in 50-cent steps, checked against willingness itself so no rounding can make the shown wage a refusal; null when no wage would do.
function lowestWage(state, k) {
  if (acceptRatio(state, k.bias) > WILL.most) return null;
  const terms = (cents) => ({ kind: k.kind === 'appointed' ? 'appointed' : 'ongoing', wageCentsPerWeek: cents });
  let cents = Math.max(50, Math.floor((k.askWeekly * acceptRatio(state, k.bias)) / 50) * 50);
  while (willingness(state, k, terms(cents)) < WILLING_AT) cents += 50;
  return cents;
}

export function candidatesView(state) {
  const bad = gate(state);
  if (bad) return bad;
  const id = state.at;
  const room = teamLimits(state.rep.team).office - officeCount(state);
  if (!PLACES[id].services.recruit) return { ok: true, place: id, list: [], room };
  // Note: R2-11: a town that became known after the last daily round fills its pool when first looked at.
  const pool = townOf(state, id);
  ensureCandidates(state, id, pool.candidates.length ? 0 : 3);
  const list = pool.candidates.map((k) => ({
    id: k.id, name: k.name, alias: k.alias || null, display: displayName(k), kind: k.kind, blurb: k.blurb, impression: impression(k), armed: k.loadout.length, weapons: k.loadout.map((w) => WEAPONS[w.id]?.name || w.id), askWeeklyCents: k.askWeekly, askCaseCents: k.askCase,
    // Note: item 463: what the candidate can do, in the same words and glyphs as the crew's; items 468 and 471: a distinctive recruit comes with what he is known for.
    skills: skillView(k.skill), traits: traitView(k), distinctive: k.distinctive || null,
    // Note: item 469: the lowest weekly wage he signs for with this office, rounded up to the next 50 cents; null when no wage would do.
    lowestWeeklyCents: lowestWage(state, k),
    // Note: item 311: the same portrait the person keeps once hired.
    portrait: portraitOf(state, { name: k.name, sex: k.sex, role: k.kind === 'appointed' ? 'deputy' : 'hire', injuries: [] }),
    heavy: heavyDrinker(state.seed, k.name),
  }));
  return { ok: true, place: id, list, room };
}

// Note: terms are { kind: 'appointed' | 'ongoing', wageCentsPerWeek } or { kind: 'case', caseId, casePayCents }; the answer is yes or no with a reason, never the person's skill.
export function recruit(state, candId, terms) {
  const bad = gate(state);
  if (bad) return bad;
  const t = townOf(state, state.at);
  const cand = t.candidates.find((k) => k.id === candId);
  if (!cand) return { ok: false, reason: 'No one by that name is looking for work here.' };
  if (!terms || typeof terms !== 'object' || !['appointed', 'ongoing', 'case'].includes(terms.kind)) return { ok: false, reason: 'Name the terms.' };
  // Note: R1-4: the pay is a finite number of cents, rounded to whole cents; nought or less is refused by the hiring rule itself.
  const pay = terms.kind === 'case' ? terms.casePayCents : terms.wageCentsPerWeek;
  if (!finite(pay)) return { ok: false, reason: 'Name a wage in cents.' };
  terms = terms.kind === 'case' ? { ...terms, casePayCents: Math.round(pay) } : { ...terms, wageCentsPerWeek: Math.round(pay) };
  if (terms.kind === 'case') {
    const c = typeof terms.caseId === 'string' ? caseById(state, terms.caseId) : null;
    if (!c || c.status !== 'accepted') return { ok: false, reason: 'A hand for a case needs an accepted case.' };
  }
  const r = recruitChar(state, cand, terms, state.at);
  if (!r.ok) return r;
  t.candidates = t.candidates.filter((k) => k.id !== candId);
  ensureCandidates(state, state.at, 0);
  return { ok: true, charId: r.char.id, name: r.char.name, display: displayName(r.char), label: labelOf(r.char), role: r.char.role, events: r.events };
}

export function dismiss(state, charId) {
  const bad = gate(state);
  if (bad) return bad;
  const c = typeof charId === 'string' ? charById(state, charId) : null;
  if (!c || !presentIn(state, state.at).includes(c)) return { ok: false, reason: 'That person is not here.' };
  if (c.role === 'sheriff') return { ok: false, reason: 'The sheriff cannot be dismissed.' };
  state.crew.splice(state.crew.indexOf(c), 1);
  if (c.role === 'deputy') state.rep.team = clamp(state.rep.team - 1, 0, 100);
  logLine(state, `${c.name} is let go.`);
  const events = [];
  enforceCap(state, events);
  return { ok: true, charId, name: c.name, events };
}

export function rest(state, hours) {
  const bad = gate(state);
  if (bad) return bad;
  const h = hours;
  if (!whole(h) || h < 1 || h > 72) return { ok: false, reason: 'Rest from one to seventy-two whole hours.' };
  const events = advance(state, h * 60, 'rest');
  return { ok: true, hours: h, events };
}

// Note: item 129 (equipment): a weapon can stay in the office instead of going on the road; every teammate keeps at least one.
export function setCarry(state, charId, weaponIndex, carry) {
  const bad = gate(state);
  if (bad) return bad;
  const c = typeof charId === 'string' ? charById(state, charId) : null;
  if (!c || !presentIn(state, state.at).includes(c)) return { ok: false, reason: 'That person is not here.' };
  if (!whole(weaponIndex) || weaponIndex < 0) return { ok: false, reason: 'No such weapon.' };
  if (carry) {
    const w = c.stowed[weaponIndex];
    if (!w) return { ok: false, reason: 'No such weapon in the office.' };
    // Note: item 367: one long gun, two handguns, one pocket pistol.
    if (!canCarry(c.loadout, w)) return { ok: false, reason: `${c.name} already carries all of that kind he can.` };
    c.stowed.splice(weaponIndex, 1);
    c.loadout.push(w);
    orderLoadout(c.loadout);
  } else {
    const w = c.loadout[weaponIndex];
    if (!w) return { ok: false, reason: 'No such weapon.' };
    if (c.loadout.length <= 1) return { ok: false, reason: `${c.name} needs a weapon.` };
    c.loadout.splice(weaponIndex, 1);
    c.stowed.push(w);
  }
  return { ok: true, loadout: c.loadout.map((w) => ({ ...w })), stowed: c.stowed.map((w) => ({ ...w })) };
}

const MOOD_WORD = (m) => (m >= 0.7 ? 'devoted' : m >= 0.5 ? 'steady' : m >= 0.3 ? 'restless' : 'sullen');

// Note: what the player is told of a person; skills, earned traits and a personal name are shown in words and glyphs, never numbers (items 463, 468, 469, 474).
export function crewSummary(state, c) {
  const p = c.where === 'party' ? 'party' : c.where;
  return {
    id: c.id, name: c.name, alias: c.alias || null, display: displayName(c), role: c.role, title: ROLE_TITLE[c.role] || '', label: labelOf(c), where: p, whereName: p === 'party' ? 'with the party' : PLACES[p] ? PLACES[p].name : p,
    condition: conditionLabel(c), fit: burden(c) < 1.5, fatigue: fatigueLabel(c.fatigue), injuries: describeInjuries(c), active: activeInjuries(c).length,
    mood: c.role === 'sheriff' ? null : MOOD_WORD(mood(state, c)), loyalty: c.role === 'sheriff' ? null : (c.loyalty >= 75 ? 'high' : c.loyalty >= 45 ? 'fair' : 'low'),
    hand: c.hand, loadout: c.loadout.map((w) => ({ ...w })), stowed: c.stowed.map((w) => ({ ...w })),
    terms: { kind: c.terms.kind, wageCentsPerWeek: c.terms.wageCentsPerWeek || 0, casePayCents: c.terms.casePayCents || 0, caseId: c.terms.caseId || null },
    marketWageCents: c.role === 'sheriff' ? 0 : marketWage(c),
    unpaid: c.unpaid, cases: c.cases, wageDueMin: c.wageDueMin,
    portrait: portraitOf(state, c),
    skills: skillView(c.skill), traits: traitView(c),
    standing: repWord(c.role === 'sheriff' ? state.rep.sheriff : c.reputation),
    // Note: item 349: the drink condition beside wounds and fatigue; item 351: a heavy drinker is known to be one.
    drink: drinkWord(c), drinkLevel: levelOf(c), heavy: !!c.heavy,
    // Note: item 270: a deputy loyal enough to carry the revenge on if the sheriff falls.
    heir: c.role === 'deputy' && c.loyalty >= VERY_LOYAL,
    // Note: items 494, 495: loyalty to the office and how this person gets on with each of the others, in words.
    office: c.role === 'sheriff' ? null : loyaltyWord(c.loyalty), bonds: bondsView(state, c),
  };
}
