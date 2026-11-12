// Note: ordinary saloon activities share the campaign clock, money and information rules.
import { PLACES } from './world.js';
import { dice, logLine, whole, sheriffOf } from './base.js';
import { advance } from './state.js';
import { converse } from './town.js';
import { randomPerson } from './crew.js';
import { challenge, duelWeapon } from './duel.js';
import { incident } from './brawl.js';
import { unit } from '../rand.js';
import { hooksOf, ratesOf } from './rates.js';
import { lapse, offer } from './spectate.js';
import { PRICES } from './saloon-room.js';
import { rollLead, STORY } from './story.js';
import { drinkUp } from './drink.js';
import { hasTrait, note } from './traits.js';

function available(state) {
  if (state.ended || state.journey || !PLACES[state.at]?.services.saloon) return null;
  return PLACES[state.at].services.saloon;
}

export function view(state) {
  const service = available(state);
  return service ? { ok: true, meal: !!service.meal, games: service.games.slice(), prices: { ...PRICES }, cents: state.cents } : { ok: false, reason: 'There is no saloon here.' };
}

export function enter(state) {
  if (!available(state)) return { ok: false, reason: 'There is no saloon here.' };
  lapse(state);
  const patron = randomPerson(dice(state), { use: 'any', femaleChance: 0.25 }).name;
  // Note: the seed lets the scene rebuild the same ordinary patrons for this visit; patrons are never kept between visits (item 248).
  const seed = Math.floor(unit(`${state.seed}:saloon:${state.at}:${state.min}`) * 0x7fffffff);
  state.saloonVisit = { town: state.at, patron, seed };
  return { ok: true, patron, seed };
}

export function leave(state) {
  if (state.duel || state.brawl) return { ok: false, reason: 'Resolve the trouble first.' };
  lapse(state);
  state.saloonVisit = null;
  return { ok: true };
}

function maybeChallenge(state, dispute) {
  const sheriff = sheriffOf(state);
  // Note: item 468: a sheriff known to look for trouble draws more challenges.
  if (!sheriff || !duelWeapon(state, sheriff.id) || !dice(state).chance(ratesOf(state).challenge * (hasTrait(sheriff, 'trouble') ? 1.5 : 1))) return null;
  return challenge(state, sheriff.id, dispute).challenge || null;
}

function trouble(state, action, dispute) {
  const challengeResult = maybeChallenge(state, dispute === 'drinking' ? 'notoriety' : dispute);
  if (challengeResult) return { challenge: challengeResult, brawl: null };
  if (unit(`${state.seed}:saloon-fight:${state.min}:${action}`) >= ratesOf(state).fight) {
    // Note: two others may take a dispute outside; hashes decide, so the dice stay where they were.
    const spectacle = unit(`${state.seed}:saloon-spectacle:${state.min}:${action}`) < ratesOf(state).spectate ? offer(state) : null;
    return spectacle ? { challenge: null, brawl: null, spectacle } : { challenge: null, brawl: null };
  }
  const sheriff = sheriffOf(state);
  const aimed = hooksOf(state).fightTarget;
  const target = (aimed ? aimed === 'sheriff' : unit(`${state.seed}:saloon-target:${state.min}:${action}`) < 0.5) ? sheriff?.id : null;
  return { challenge: null, brawl: incident(state, 'saloon', target, dispute) };
}

export function activity(state, action, stake = 0) {
  const service = available(state);
  if (!service || state.saloonVisit?.town !== state.at) return { ok: false, reason: 'Enter the saloon first.' };
  if (action === 'talk') {
    lapse(state);
    const result = converse(state);
    // Note: item 268: talk in a saloon may carry word of the nemesis.
    if (result.ok !== false) rollLead(state, 'saloon', STORY.saloonLead, (result.events ||= []));
    if (!state.ended) Object.assign(result, trouble(state, action, 'insult'));
    return result;
  }
  if (action === 'drink' || action === 'meal') {
    if (action === 'meal' && !service.meal) return { ok: false, reason: 'Meals are not served here.' };
    const cost = PRICES[action];
    if (state.cents < cost) return { ok: false, reason: 'You cannot afford that.' };
    lapse(state);
    state.cents -= cost;
    const minutes = action === 'drink' ? 20 : 45;
    const events = [];
    if (action === 'drink') {
      drinkUp(sheriffOf(state), 1);
      note(state, sheriffOf(state), 'drinking', events);
    }
    events.push(...advance(state, minutes, 'idle'));
    logLine(state, `The sheriff has ${action === 'drink' ? 'a drink' : 'a meal'} at the saloon.`);
    return { ok: true, action, cost, minutes, events, ...(state.ended ? { challenge: null, brawl: null } : trouble(state, action, 'drinking')) };
  }
  if (!service.games.includes(action)) return { ok: false, reason: 'That game is not available here.' };
  if (!whole(stake) || stake <= 0 || stake > state.cents) return { ok: false, reason: 'The stake must be a positive whole number of cents no greater than your cash.' };
  lapse(state);
  const net = dice(state).chance(action === 'poker' ? 0.45 : 0.42) ? stake : -stake;
  state.cents += net;
  const minutes = 60;
  const events = advance(state, minutes, 'idle');
  logLine(state, `The sheriff ${net > 0 ? 'wins' : 'loses'} ${Math.abs(net)} cents at ${action}.`);
  // Note: item 475: card games played add up to a gambling habit.
  note(state, sheriffOf(state), 'gambling', events);
  return { ok: true, action, stake, net, minutes, events, ...(state.ended ? { challenge: null, brawl: null } : trouble(state, action, 'gambling')) };
}
