// Note: town rest runs in hours so local teammates visit independently, and a duel suspends the record until the exchange ends.
import { PLACES } from './world.js';
import { clamp, dice, logLine, sheriffOf, whole } from './base.js';
import { isFit } from './crew.js';
import { advance } from './state.js';
import { hereOf, presentIn } from './town.js';
import { challenge, DISPUTES, duelWeapon, persuade } from './duel.js';
import { incident } from './brawl.js';
import { unit } from '../rand.js';
import { ratesOf, TUNED_MATES } from './rates.js';
import { drinkUp, glassesOnVisit, levelOf } from './drink.js';
import { hasTrait, note } from './traits.js';
import { shop as shopList } from './economy.js';
import { WEAPON_GOODS } from './arsenal.js';
import { WEAPONS } from '../weapons.js';

// Note: item 350: a teammate drinks by habit and temper and pays from his own wages; with wages owed he drinks on credit and sours on the office.
const GLASS_CENTS = 15;
function drinkOnVisit(state, person, events) {
  // Note: item 468: a known drinker takes a glass or two more.
  const want = glassesOnVisit(state.seed, person, state.min) + (hasTrait(person, 'drinking') ? 1 + (unit(`${state.seed}:drinker:${state.min}:${person.id}`) < 0.5 ? 1 : 0) : 0);
  const owed = person.unpaid > 0;
  // Note: without wages owed he drinks only what his own earnings pay for.
  const glasses = owed ? want : Math.min(want, Math.floor((person.earned || 0) / GLASS_CENTS));
  if (!glasses) return;
  drinkUp(person, glasses);
  // Note: item 475: the glasses add up to a drinking habit.
  note(state, person, 'drinking', events, { n: glasses });
  if (owed) {
    person.loyalty = clamp(person.loyalty - (hasTrait(person, 'resentment') ? 3 : 2), 0, 100);
    logLine(state, `${person.name} drinks on credit while his wages are owed, and grumbles about it.`);
    events.push({ type: 'credit', charId: person.id, name: person.name });
    note(state, person, 'self-interest', events);
  } else person.earned -= glasses * GLASS_CENTS;
}

// Note: items 468 and 475: what else a teammate does with his evening by habit: a gambler plays his own money, an open-handed man stands the others a glass, a gun fancier buys his favourite when the store has one; all from hashes, so the campaign dice stay where they were.
function habitsOnVisit(state, person, here, events) {
  const tag = `${state.seed}:habit:${state.min}:${person.id}`;
  const purse = person.earned || 0;
  if (purse >= 100 && unit(`${tag}:cards`) < (hasTrait(person, 'gambling') ? 0.6 : 0.12)) {
    const stake = Math.min(purse, 100 * (1 + Math.floor(unit(`${tag}:stake`) * 3)));
    const net = unit(`${tag}:luck`) < 0.45 ? stake : -stake;
    person.earned = purse + net;
    note(state, person, 'gambling', events);
  }
  const others = here.filter((c) => c !== person && c.role !== 'sheriff');
  if (hasTrait(person, 'generosity') && others.length && (person.earned || 0) >= GLASS_CENTS * others.length) {
    person.earned -= GLASS_CENTS * others.length;
    for (const c of others) drinkUp(c, 1);
    logLine(state, `${person.name} stands the others a round.`);
  }
  const fav = person.favorite;
  const good = fav && hasTrait(person, 'favorite-guns') && PLACES[state.at]?.services.store ? shopList(state, state.at).find((g) => g.kind === 'weapon' && WEAPON_GOODS[g.id]?.weapon.id === fav) : null;
  if (good && (person.earned || 0) >= good.cents && !person.loadout.some((w) => w.id === fav) && !(person.stowed || []).some((w) => w.id === fav)) {
    person.earned -= good.cents;
    (person.stowed ||= []).push({ ...WEAPON_GOODS[good.id].weapon });
    logLine(state, `${person.name} buys himself another ${WEAPONS[fav].name} with his own money.`);
  }
}

export function begin(state, hours) {
  if (state.ended) return { ok: false, reason: 'The campaign is over.' };
  if (!hereOf(state)) return { ok: false, reason: 'The party is not in a town.' };
  if (state.duel || state.brawl || state.rest) return { ok: false, reason: 'Finish the interrupted rest first.' };
  if (!whole(hours) || hours < 1 || hours > 72) return { ok: false, reason: 'Rest from one to seventy-two whole hours.' };
  state.rest = { town: state.at, requested: hours * 60, remaining: hours * 60, visits: [] };
  return resume(state);
}

export function resume(state) {
  const rest = state.rest;
  if (!rest || state.duel || state.brawl) return { ok: false, reason: 'There is no interrupted rest to resume.' };
  const events = [];
  let minutes = 0;
  while (!state.ended && (rest.remaining > 0 || rest.visits.length)) {
    if (!rest.visits.length) {
      const dt = Math.min(60, rest.remaining);
      events.push(...advance(state, dt, 'rest'));
      rest.remaining -= dt;
      minutes += dt;
      if (state.ended) break;
      if (PLACES[rest.town]?.services.saloon) {
        const sheriff = sheriffOf(state);
        const d = dice(state);
        const visit = ratesOf(state).teammateVisit;
        rest.visits = presentIn(state, rest.town).filter((person) => person !== sheriff && isFit(person) && d.chance(visit)).map((person) => person.id);
      }
      if (!rest.visits.length) continue;
    }
    const id = rest.visits.shift();
    const here = presentIn(state, rest.town);
    const person = here.find((c) => c.id === id && c !== sheriffOf(state) && isFit(c));
    // Note: a bigger crew does not get more trouble in total; each teammate's share shrinks past the tuned size; drink makes trouble likelier (item 350).
    if (person) drinkOnVisit(state, person, events);
    if (person) habitsOnVisit(state, person, here, events);
    // Note: item 468: a trouble-seeker finds trouble more often.
    const share = Math.min(1, TUNED_MATES / Math.max(1, here.length - 1)) * (1 + 2 * levelOf(person || {})) * (hasTrait(person, 'trouble') ? 1.6 : 1);
    if (person && unit(`${state.seed}:rest-fight:${state.min}:${id}`) < ratesOf(state).teammateFight * share) {
      const brawl = incident(state, 'teammate-rest', id, 'drinking');
      if (brawl) return { ok: true, interrupted: true, hours: minutes / 60, minutes, remaining: rest.remaining, brawl, events };
    }
    if (!person || !duelWeapon(state, id) || !dice(state).chance(ratesOf(state).teammateChallenge * share)) continue;
    const created = challenge(state, id, dice(state).pick(DISPUTES), 'teammate-rest');
    if (!created.ok) continue;
    const response = persuade(state);
    if (!response.ok || response.persuaded) continue;
    return { ok: true, interrupted: true, hours: minutes / 60, minutes, remaining: rest.remaining, challenge: response.challenge, events };
  }
  const requested = rest.requested;
  state.rest = null;
  return { ok: true, interrupted: false, hours: minutes / 60, minutes, requestedHours: requested / 60, events };
}
