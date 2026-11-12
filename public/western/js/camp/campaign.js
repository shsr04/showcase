// Note: the campaign facade (Contract C): one object, synchronous methods, every call returns plain data and may append to the log, with no DOM or Phaser.

import { normSeed } from '../rand.js';
import { newState, serialise, deserialise } from './state.js';
import * as town from './town.js';
import * as travel from './travel.js';
import * as enc from './encounter.js';
import * as saloon from './saloon.js';
import * as duel from './duel.js';
import * as brawling from './brawl.js';
import * as spectating from './spectate.js';
import * as resting from './rest.js';
import {
  viewOf, mapView, caseIntel, research,
} from './view.js';
import { caseById, clone } from './base.js';
import { intel as caseView } from './cases.js';
import * as intel from './intel.js';
import { seekLead } from './pursuit.js';

// Note: results never hold references into the state, so a screen cannot change the game by editing what it was given.
const plain = (v) => (v === undefined ? v : clone(v));

export class Campaign {
  constructor(state) {
    this.state = state;
  }

  // Note: start is for tests only (state.js P2_START); a played campaign always starts the revenge in a rough town.
  static create(seed, start = null) {
    return new Campaign(newState(normSeed(seed), start));
  }

  static load(json) {
    return new Campaign(deserialise(json));
  }

  save() {
    return serialise(this.state);
  }

  // Note: item 498: a campaign brought back from before a loss loses the Ironman reward for good.
  retried() {
    this.state.ironman = false;
    this.state.retries = (this.state.retries || 0) + 1;
    return { ok: true };
  }

  view() {
    return plain(viewOf(this.state));
  }

  research() {
    return research();
  }

  // Note: the known places and roads inside a window of the map; see mapView in view.js.
  mapView(query) {
    return plain(mapView(this.state, query));
  }

  case(caseId) {
    return plain(caseIntel(this.state, caseId));
  }

  cases() {
    return plain(this.state.cases.filter((c) => c.status === 'accepted').map((c) => caseView(this.state, c)));
  }

  // Note: R1-7: the history of a case never seen is not given out.
  caseHistory(caseId) {
    const c = typeof caseId === 'string' ? caseById(this.state, caseId) : null;
    return c && c.seen ? plain(c.history) : null;
  }

  town() {
    return plain(town.townView(this.state));
  }

  readNotices() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.readNotices(this.state));
  }

  askAround() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.askAround(this.state));
  }

  accept(caseId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.accept(this.state, caseId));
  }

  abandon(caseId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.abandon(this.state, caseId));
  }

  // Note: item 470: ask townspeople about one case on offer or accepted.
  askAbout(caseId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(intel.askAbout(this.state, caseId));
  }

  // Note: item 491: seek the source a case's current lead names, or ask near the target, for the next report.
  seekLead(caseId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(seekLead(this.state, caseId));
  }

  // Note: item 476: the contacts in this town and a report from one of them on a case.
  contacts() {
    return plain(intel.contactsView(this.state));
  }

  contactReport(contactId, caseId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(intel.contactReport(this.state, contactId, caseId));
  }

  shop() {
    return plain(town.shopView(this.state));
  }

  buy(item, qty = 1, opts = {}) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.buy(this.state, item, qty, opts));
  }

  sell(item, qty = 1, opts = {}) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.sell(this.state, item, qty, opts));
  }

  doctor() {
    return plain(town.doctorView(this.state));
  }

  treat(charId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.treat(this.state, charId));
  }

  candidates() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.candidatesView(this.state));
  }

  recruit(candId, terms) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.recruit(this.state, candId, terms));
  }

  dismiss(charId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.dismiss(this.state, charId));
  }

  rest(hours) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(resting.begin(this.state, hours));
  }

  saloon() {
    return plain(saloon.view(this.state));
  }

  enterSaloon() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(saloon.enter(this.state));
  }

  leaveSaloon() {
    return plain(saloon.leave(this.state));
  }

  saloonActivity(action, stake = 0) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(saloon.activity(this.state, action, stake));
  }

  duel() {
    return plain(duel.view(this.state));
  }

  duelChallenge(charId, dispute) {
    if (this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(duel.challenge(this.state, charId, dispute));
  }

  // Note: items 288 and 299: the player chooses when to face the nemesis in the town where he is.
  faceNemesis() {
    if (this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(duel.faceNemesis(this.state));
  }

  duelPersuade(approach) {
    return plain(duel.persuade(this.state, approach));
  }

  duelBegin() {
    return plain(duel.begin(this.state));
  }

  duelFinish(report) {
    const fromRest = this.state.duel?.source === 'teammate-rest';
    const result = duel.finish(this.state, report);
    if (result.ok && fromRest && this.state.rest) {
      if (this.state.ended) this.state.rest = null;
      else {
        result.rest = resting.resume(this.state);
        result.events.push(...(result.rest.events || []));
      }
    }
    return plain(result);
  }

  // Note: a dispute two others have taken outside; the sheriff watches it or lets it pass.
  spectacle() {
    return plain(spectating.view(this.state));
  }

  spectateWatch() {
    return plain(spectating.watch(this.state));
  }

  spectateIgnore() {
    return plain(spectating.ignore(this.state));
  }

  spectateFinish() {
    return plain(spectating.finish(this.state));
  }

  brawl() {
    return plain(brawling.view(this.state));
  }

  brawlChoose(intervene) {
    if (!intervene) return this.brawlStayOut();
    return plain(brawling.choose(this.state, intervene));
  }

  brawlStayOut() {
    const result = brawling.stayOut(this.state);
    return this.finishBrawlRest(result);
  }

  brawlFinish(report) {
    return this.finishBrawlRest(brawling.finish(this.state, report));
  }

  finishBrawlRest(result) {
    if (result.ok && result.source === 'teammate-rest' && this.state.rest) {
      if (this.state.ended) this.state.rest = null;
      else {
        result.rest = resting.resume(this.state);
        result.events.push(...(result.rest.events || []));
      }
    }
    return plain(result);
  }

  carry(charId, weaponIndex, carry) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(town.setCarry(this.state, charId, weaponIndex, carry));
  }

  // Note: opts.limit keeps the nearest reachable destinations only; prepareDestination gives one known place without the list.
  prepareDestination(id) {
    return plain(travel.prepareDestination(this.state, id));
  }

  prepare(opts) {
    return plain(travel.prepare(this.state, opts));
  }

  depart(destId, opts = {}) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.depart(this.state, destId, opts));
  }

  advance(maxMinutes = 60) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.advanceJourney(this.state, maxMinutes));
  }

  restOnRoad(hours) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.restOnRoad(this.state, hours));
  }

  turnBack() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.turnBack(this.state));
  }

  redirect(destId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.redirect(this.state, destId));
  }

  choose(optionId) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.choose(this.state, optionId));
  }

  withdraw() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.withdraw(this.state));
  }

  engage() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(travel.engage(this.state));
  }

  encounterSpec(source, teamIds) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(enc.encounterSpec(this.state, source, teamIds));
  }

  applyEncounter(report, spec) {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(enc.applyEncounter(this.state, report, spec));
  }

  cancelEncounter() {
    if (this.state.duel || this.state.brawl) return { ok: false, reason: 'Resolve the saloon trouble first.' };
    return plain(enc.cancelEncounter(this.state));
  }
}

export default Campaign;
