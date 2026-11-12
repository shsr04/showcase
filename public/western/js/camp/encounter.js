// Note: the bridge between the campaign and the tactical scene: the spec handed to the Sim (Contract S) and the report taken back from it, with no DOM or Phaser.

import { DYNAMITE } from '../dynamite.js';
import { randomSeed, rng, seedFromString, unit } from '../rand.js';
import { buildingComplexity } from '../house.js';
import { applyFacets, approachAdvice } from './intel.js';
import { note } from './traits.js';
import { relEvent, sharedDanger } from './relations.js';
import { feat } from './rewards.js';
import { PLACES, sceneRegion } from './world.js';
import {
  caseById, charById, sheriffOf, dice, logLine, clamp, round2, dollars, finite, pointOf,
} from './base.js';
import { advance, settle } from './state.js';
import { ensureSeriousWound, tireAfterFight } from './combat.js';
import {
  allocateAmmo, returnAmmo, settleLoadout, applyDeaths,
} from './economy.js';
import {
  isFit, simInjuries, addInjuries, refuses, bond, teamLimits,
} from './crew.js';
import { DIFF, complete, intel } from './cases.js';
import { hereOf, presentIn } from './town.js';
import { settleAssociate, associateLook } from './story.js';
import { faceCode } from './looks.js';
import { levelOf, hangoverOf } from './drink.js';
import { roleOfCase } from './arsenal.js';
import { WEAPONS } from '../weapons.js';
import { SIDES, SIDE_NAMES } from '../outdoor-ring.js';
import { siteLocale } from './site-locale.js';
import { memoryAt, mergeMemory } from './site-memory.js';

const MAX_HOSTILES = 7;
// Note: gives back what an unfinished scene took from the ammunition pool; used when the player backs out of team selection.
// Note: a scene that was still running when the game was saved cannot be picked up again (state.active.resumed, set on load), so backing out of it counts the attempt, gives the next try a new seed, keeps the case open, and pays, teaches, records and times nothing (R3-7).
// Note: rebuilding is for encounterSpec, which replaces the scene in flight with one for the same attempt; that is no back-out, so nothing is counted (the interface settles a resumed scene by rebuilding it and reporting a pull-out, which counts once).
export function cancelEncounter(state, rebuilding = false) {
  const act = state.active;
  if (!act) return { ok: true, cancelled: false };
  returnAmmo(state, act.alloc, { lawmen: [] }, true, new Set());
  state.active = null;
  if (!act.resumed || rebuilding) return { ok: true, cancelled: true };
  if (act.source === 'case') {
    const c = caseById(state, act.caseId);
    if (c && c.status === 'accepted') {
      c.attempts += 1;
      c.history.push({ min: state.min, text: 'The attempt was broken off; the case is still open.' });
      logLine(state, `The attempt at "${c.title}" was broken off.`);
    }
  } else {
    const p = state.journey && state.journey.pending;
    if (p && p.id === act.encId) p.attempts += 1;
  }
  return { ok: true, cancelled: true, pulledOut: true };
}

function resolveSource(state, source) {
  if (source !== undefined && source !== null && typeof source !== 'string' && typeof source !== 'object') return { ok: false, reason: 'Say which fight it is.' };
  if (typeof source === 'string' && source !== 'journey') {
    const c = caseById(state, source);
    if (!c || c.status !== 'accepted') return { ok: false, reason: 'That case is not accepted.' };
    if (!hereOf(state) || state.at !== c.location) return { ok: false, reason: `The party is not at ${PLACES[c.location].name}.` };
    return { ok: true, kind: 'case', c };
  }
  const p = state.journey && state.journey.pending;
  if (!p || p.kind !== 'hostile') return { ok: false, reason: 'There is no one to fight.' };
  if (source && typeof source === 'object' && source.id !== p.id) return { ok: false, reason: 'That encounter is over.' };
  return { ok: true, kind: 'journey', enc: p };
}

// Note: items 161, 164, 169: the sheriff plus up to four teammates, chosen from those who travelled and are fit; chosen again for every attempt.
export function encounterSpec(state, source, teamIds) {
  if (state.ended) return { ok: false, reason: 'The campaign is over.' };
  // Note: R2-7: the team is checked before the scene in flight is given up, so a bad call does not cost the player the one that is running.
  if (teamIds !== undefined && teamIds !== null && (!Array.isArray(teamIds) || teamIds.some((id) => typeof id !== 'string'))) return { ok: false, reason: 'The team must be a list of people.' };
  const src = resolveSource(state, source);
  if (!src.ok) return src;
  const sheriff = sheriffOf(state);
  // Note: item 169: at a case the teammates present in the town may go in, so a hand hired on the spot can too; on the road only those riding with the party.
  const present = src.kind === 'case' ? presentIn(state, state.at) : state.crew.filter((c) => c.where === 'party');
  const pool = present.filter((c) => c !== sheriff && isFit(c));
  const limit = teamLimits(state.rep.team).encounter;
  let team;
  // Note: items 320 and 325: armed men on the road meet everyone riding with the sheriff, chosen or not, fit or not, whatever the limit.
  if (src.kind !== 'case') team = present.filter((c) => c !== sheriff);
  else if (teamIds) {
    team = [];
    for (const id of teamIds) {
      const c = charById(state, id);
      if (!c) return { ok: false, reason: 'No such teammate.' };
      if (c === sheriff || team.includes(c)) continue;
      if (!pool.includes(c)) return { ok: false, reason: `${c.name} cannot go in.` };
      if (refuses(state, c)) return { ok: false, reason: `${c.name} will not go in.` };
      team.push(c);
    }
    if (team.length > limit) return { ok: false, reason: `At most ${limit} teammates can go in with the sheriff at the crew's present standing.` };
  } else team = pool.filter((c) => !refuses(state, c)).slice(0, limit);
  cancelEncounter(state, true);
  // Note: an empty pool never leaves the sheriff unarmed for want of cartridges; the office issues a few.
  const types = sheriff.loadout.map((w) => w.ammoType);
  if (types.length && types.every((t) => state.ammo[t] <= 0)) {
    state.ammo[types[types.length - 1]] += 12;
    logLine(state, 'The office issues a handful of cartridges.');
  }
  const members = [sheriff, ...team];
  const alloc = allocateAmmo(state, members);
  const mk = (c, a) => ({
    charId: c.id, name: c.name, hand: c.hand, skill: { ...c.skill }, loyalty: c.loyalty, fatigue: round2(c.fatigue), injuries: simInjuries(c), loadout: a.loadout, reserve: a.reserve,
    ...(c !== sheriff && !isFit(c) ? { passive: true } : {}),
    // Note: item 350: drink and a hangover carry into the fight.
    intoxication: levelOf(c), hangover: hangoverOf(c),
  });
  const party = { sheriff: mk(sheriff, alloc.members[0]), deputies: team.map((c, i) => mk(c, alloc.members[i + 1])) };
  const isCase = src.kind === 'case';
  const tier = isCase ? src.c.tier : src.enc.tier;
  const base = DIFF[tier];
  const extra = isCase ? src.c.extra : 0;
  const siteKind = isCase ? src.c.site.kind : 'outdoor';
  const terrain = isCase ? src.c.site.terrain : src.enc.terrain;
  const diff = {
    count: [Math.min(MAX_HOSTILES, base.count[0] + extra), Math.min(MAX_HOSTILES, base.count[1] + extra)], experience: [...base.experience], civilianChance: siteKind === 'house' ? 0.25 : 0.1,
  };
  if (siteKind === 'house') diff.building = (isCase && src.c.site.building) || 'house';
  else if (isCase ? src.c.site.setPiece : src.enc.setPiece) diff.setPiece = isCase ? src.c.site.setPiece : src.enc.setPiece;
  // Note: a case is drawn in the region of its place, a road fight in the region of the nearer end place.
  const region = sceneRegion(isCase ? src.c.location : pointOf(state).place);
  if (region) diff.region = region;
  const attempt = isCase ? src.c.attempts : src.enc.attempts;
  // Note: item 498: after a Retry the same attempt is played on a fresh scene seed, never replayed.
  const tag = (isCase ? `case:${src.c.id}:${attempt}` : `enc:${src.enc.id}:${attempt}`) + (state.retries ? `:r${state.retries}` : '');
  // Note: item 477: a building's layout grows more complex with its type, the case's difficulty and the size of the place, with a little seeded variation.
  if (siteKind === 'house') diff.complexity = clamp(buildingComplexity({ building: diff.building, tier, size: PLACES[src.c.location].size ?? 1 }) + (unit(`${state.seed}:complexity:${tag}`) - 0.5) * 0.2, 0, 1);
  // Note: item 470: what the case's men have prepared and who stands with them shapes the scene.
  if (isCase) applyFacets(state, diff, src.c);
  const r = rng(seedFromString(`${state.seed}:${tag}`));
  const seed = randomSeed(r.next);
  const teamIdList = members.map((c) => c.id);
  const ambush = !isCase && !!src.enc.ambush;
  // Note: items 484-486: an outdoor scene is a four-sided site shaped by its place; a case keeps its own layout seed for every attempt (item 488), a road fight takes the scene's.
  const kept = isCase ? keptScene(src.c) : null;
  const site = { seed: isCase ? kept?.seed ?? randomSeed(rng(seedFromString(`${state.seed}:site:${src.c.id}`)).next) : seed, layout: kept?.layout || null, memory: isCase ? memoryAt(kept?.memory, state.min) : null };
  let approach = null;
  if (siteKind === 'outdoor') {
    diff.layout = 'ring';
    diff.locale = siteLocale(isCase ? src.c.location : pointOf(state).place, isCase ? src.c.site : { terrain });
    approach = approachOf(state, kept, ambush, isCase ? approachAdvice(state, src.c) : null);
  }
  state.active = {
    source: src.kind, caseId: isCase ? src.c.id : null, encId: isCase ? null : src.enc.id, teamIds: teamIdList, seed, alloc, startedMin: state.min, tier,
    // Note: item 473: who was in the scene but unfit to take part.
    passive: team.filter((c) => !isFit(c)).map((c) => c.id),
  };
  return {
    ok: true,
    seed,
    siteKind,
    terrain,
    diff,
    ambush,
    site,
    approach,
    side: approach ? approach.side : null,
    party,
    // Note: item 499: the sheriff takes up to three bundles of the office's dynamite into the fight.
    dynamite: Math.min(state.dynamite || 0, DYNAMITE.sticks),
    caseId: isCase ? src.c.id : null,
    source: src.kind,
    teamIds: teamIdList,
    warnings: alloc.warnings,
    associate: isCase ? associateOf(state, src.c) : null,
    // Note: item 492: an ordinary case's wanted man, who may offer surrender; associate cases and road fights have none.
    target: isCase && !src.c.associate && src.c.target ? { name: src.c.target.name } : null,
    // Note: item 365: the men carry guns of their role and region, from a hash of the scene, so the site's own draws stay as they were.
    arms: { role: isCase ? roleOfCase(src.c.kind) : 'outlaw', region: region || PLACES[isCase ? src.c.location : pointOf(state).place]?.region || 'sky-islands', tag },
    briefing: isCase ? { title: src.c.title, text: src.c.text, place: PLACES[src.c.location].name, men: intel(state, src.c).men } : { title: src.enc.title, text: src.enc.text, place: null, men: null },
  };
}

// Note: a case's kept scene record, or null when it has none or it is not whole.
function keptScene(c) {
  const k = c.scene;
  return k && typeof k === 'object' && typeof k.seed === 'string' && k.seed ? k : null;
}

// Note: item 486: the four entry sides of an outdoor scene; a planned fight lets the player choose and is told only where the party went in before and what the office learned of the camp's watch (user direction), an ambush starts where the party was riding from.
function approachOf(state, kept, ambush, advice = null) {
  const before = (kept && Array.isArray(kept.sides) ? kept.sides : []).filter((x) => SIDES.includes(x));
  const known = [...(advice ? [advice.text] : []), ...[...new Set(before)].map((x) => `The party went in from the ${SIDE_NAMES[x]} before.`)];
  if (!ambush) return { choose: true, sides: SIDES.slice(), side: advice ? advice.best : before[before.length - 1] || 's', best: advice ? advice.best : null, known };
  return { choose: false, sides: SIDES.slice(), side: travelSide(state), known: [] };
}

// Note: the side of the map the party rides in from: the opposite of where it is heading.
export function travelSide(state) {
  const j = state.journey;
  const to = j && PLACES[j.to];
  const at = pointOf(state);
  if (!to || !at) return 's';
  const dx = to.x - at.x;
  const dy = to.y - at.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'w' : 'e';
  return dy >= 0 ? 'n' : 's';
}

// Note: the parts of the difficulty a building's layout is generated from, kept so a return lays the same building (item 488).
const HOUSE_LAYOUT = ['count', 'experience', 'civilianChance', 'building', 'complexity', 'region'];

const WORN = { id: 'colt73', ammoType: '45colt' };

// Note: item 473: how each lawman took part, as the skill gain reads it: hurt, carried or walked out, and whether he fired a round, from the Sim's own tally.
function shares(act, lawmen) {
  const total = (o) => Object.values(o || {}).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  return act.alloc.members.filter((m) => !(act.passive || []).includes(m.charId)).map((m) => {
    const l = lawmen.find((x) => x.charId === m.charId) || {};
    return { charId: m.charId, hurt: (Array.isArray(l.wounds) && l.wounds.length > 0) || l.status === 'incapacitated', out: !!(l.withdrawn || l.carriedOut), fired: total(l.fired) > 0 };
  });
}

// Note: item 291: the associate a case is about, by name and by the face his sprite wears; null for an ordinary case.
function associateOf(state, c) {
  const a = c.associate && state.story ? state.story.associates.find((x) => x.id === c.associate && x.status !== 'dead' && x.status !== 'captured') : null;
  return a ? { id: a.id, name: a.name, face: faceCode(associateLook(state, a)) } : null;
}

// Note: items 133, 153, 155, 165: turns the report into consequences: wounds, deaths, ammunition, equipment, time, the case and the pay.
export function applyEncounter(state, report, spec) {
  const act = state.active;
  // Note: R1-5: the spec must be the one in flight: the same seed, the same case or fight and the same team, not only the same seed.
  const same = act && spec && typeof spec === 'object' && act.seed === spec.seed && act.source === spec.source && (act.caseId ?? null) === (spec.caseId ?? null)
    && Array.isArray(spec.teamIds) && spec.teamIds.length === act.teamIds.length && spec.teamIds.every((id, i) => id === act.teamIds[i]);
  if (!same) return { ok: false, reason: 'No encounter is waiting for that report.' };
  // Note: a scene without a final outcome is not a defeat; the encounter stays open so it can be finished or cancelled.
  if (!report || typeof report !== 'object' || report.result == null) return { ok: false, reason: 'The scene is not finished.' };
  const d = dice(state);
  const success = report.result === 'success';
  // Note: R1-4: numbers and lists in a report are taken at face value only when they are numbers and lists.
  const lawmen = (Array.isArray(report.lawmen) ? report.lawmen : []).filter((l) => l && typeof l === 'object');
  const down = finite(report.hostilesDown) ? clamp(Math.floor(report.hostilesDown), 0, 20) : 0;
  const teamChars = act.teamIds.map((id) => charById(state, id)).filter(Boolean);
  const events = [];
  // Note: the scene took time; it passes before the new wounds are recorded so they do not heal during it.
  const minutes = Math.max(1, Math.ceil((finite(report.time) ? clamp(report.time, 0, 4 * 3600) : 0) / 60));
  events.push(...advance(state, minutes, 'fight'));
  // Note: R2-3, R2-4: the clock tires no one during a fight; those who went in tire by a share for the fight and a little for its length.
  for (const c of teamChars) tireAfterFight(c, minutes);
  const deaths = [];
  const injuries = [];
  const lost = [];
  const handed = [];
  // Note: item 366: what the team brought in, so a gun one teammate picks up from another is not counted as the law's.
  const issued = act.alloc.members.flatMap((m) => m.loadout.map((w) => `${w.id}:${w.ammoType}`));
  const deadIds = new Set();
  for (const l of lawmen) {
    const c = charById(state, l.charId);
    if (!c || !act.teamIds.includes(c.id)) continue;
    // Note: the dying rule: a fatal wound still running at the end of the scene kills, in a win and in a loss.
    if (l.status === 'dead' || l.dying || l.diedAfterVictory) {
      deaths.push({ char: c, cause: l.cause || 'died of wounds' });
      deadIds.add(c.id);
      continue;
    }
    // Note: item 475: carrying the sheriff out is a significant protective act.
    if (l.carrier === true) note(state, c, 'protective', events, { event: true });
    // Note: item 494: carrying the sheriff out is help both of them know of.
    if (l.carrier === true && sheriffOf(state)) relEvent(state, 'rescue', c.id, sheriffOf(state).id, { events });
    const wounds = (Array.isArray(l.wounds) ? l.wounds : []).filter((w) => w && !w.fatal && finite(w.severity)).map((w) => ({ region: w.region, side: w.side, severity: clamp(w.severity, 0, 1) }));
    let serious = false;
    if (l.status === 'incapacitated') {
      // Note: a man put down but not dying comes back with at least one serious wound.
      ensureSeriousWound(wounds);
      serious = true;
    }
    if (wounds.length) {
      addInjuries(c, wounds);
      injuries.push({ charId: c.id, name: c.name, count: wounds.length, serious: serious || wounds.some((w) => w.severity >= 0.6) });
    }
    const taken = (act.alloc.members.find((m) => m.charId === c.id) || { loadout: c.loadout }).loadout;
    // Note: item 366: guns picked up from the fallen served in the fight and are handed over to the law; the team's own come back, and the rounds picked up stay.
    for (const w of l.loadout || []) {
      const i = issued.indexOf(`${w.id}:${w.ammoType}`);
      if (i >= 0) issued.splice(i, 1);
      else handed.push(WEAPONS[w.id] ? WEAPONS[w.id].name : w.id);
    }
    const gone = settleLoadout(c, (l.loadout || []).map((w) => ({ id: w.id, ammoType: w.ammoType })), success, taken);
    if (gone.length) {
      lost.push({ charId: c.id, name: c.name, weapons: gone.map((w) => w.id) });
      if (!c.loadout.length) {
        c.loadout.push({ ...WORN });
        logLine(state, `${c.name} is handed a worn revolver from the office rack.`);
      }
    }
  }
  if (handed.length) logLine(state, `Weapons picked up in the fight are handed over to the law: ${handed.join(', ')}.`);
  returnAmmo(state, act.alloc, { ...report, lawmen }, success, deadIds);
  // Note: item 499: thrown bundles are spent; those still carried come back, unless the sheriff died in a lost fight.
  const blast = report.dynamite && typeof report.dynamite === 'object' ? report.dynamite : null;
  if (blast && finite(blast.carried) && finite(blast.left)) {
    const carried = clamp(Math.floor(blast.carried), 0, state.dynamite || 0);
    const sheriffDied = (report.people || []).some((p) => p && p.role === 'sheriff' && p.status === 'dead');
    const spent = !success && sheriffDied ? carried : clamp(carried - Math.floor(blast.left), 0, carried);
    state.dynamite = (state.dynamite || 0) - spent;
  }
  for (const c of teamChars) if (!deadIds.has(c.id)) c.where = 'party';
  // Note: item 494: those who went through the fight together share its danger; an unfit teammate who stayed out did not.
  sharedDanger(state, act.teamIds.filter((id) => !deadIds.has(id) && !(act.passive || []).includes(id)), events);
  for (const x of deaths) events.push({ type: 'death', charId: x.char.id, name: x.char.name, cause: x.cause });
  applyDeaths(state, deaths);
  const summary = {
    ok: true, result: success ? 'success' : 'failure', success, reason: report.reason || null, minutes, deaths: deaths.map((x) => ({ charId: x.char.id, name: x.char.name, cause: x.cause })), injuries, lostWeapons: lost, handedOver: handed, rewardCents: 0, retry: false, caseId: act.caseId,
    // Note: item 463: the result always says who improved, and an empty list when nobody did.
    gains: [],
  };
  if (act.source === 'case') {
    const c = caseById(state, act.caseId);
    c.attempts += 1;
    // Note: item 488: an open case keeps its site, the side the party used and the lasting changes; a settled case needs none.
    if (!success && spec.site && typeof spec.site.seed === 'string') {
      const old = keptScene(c);
      const layout = old?.layout || (spec.siteKind === 'house' && spec.diff ? Object.fromEntries(HOUSE_LAYOUT.filter((k) => spec.diff[k] !== undefined).map((k) => [k, spec.diff[k]])) : null);
      const sides = [...(old?.sides || []), ...(spec.side ? [spec.side] : [])].slice(-4);
      c.scene = { seed: spec.site.seed, layout, sides, memory: report.site ? mergeMemory(old?.memory, report.site, state.min) : old?.memory || null };
    } else if (success) delete c.scene;
    if (success) {
      // Note: item 473: an unfit teammate who took no part has no share of the gain.
      const r = complete(state, c.id, { hostilesDown: down, civilianDied: !!report.civilianDied, participants: act.teamIds, people: shares(act, lawmen) });
      summary.rewardCents = r.cents || 0;
      summary.gains = r.gains || [];
      summary.hires = r.hires;
      summary.learned = r.learned;
      events.push(...(r.events || []));
    } else {
      c.history.push({ min: state.min, text: 'The attempt failed; the case is still open.' });
      summary.retry = c.status === 'accepted' && (c.expiresMin == null || state.min < c.expiresMin);
      logLine(state, `The attempt at "${c.title}" fails.`);
    }
  } else {
    const p = state.journey && state.journey.pending;
    if (success) {
      if (state.journey) state.journey.pending = null;
      const cents = down * d.int(20, 60);
      state.cents += cents;
      summary.rewardCents = cents;
      state.rep.sheriff = clamp(state.rep.sheriff + 1, 0, 100);
      bond(state, act.teamIds, 2);
      feat(state, 'roadWins');
      logLine(state, `The party deals with the armed men${cents ? ` and takes ${dollars(cents)} off them` : ''}.`);
    } else if (p) {
      p.retreated = true;
      p.attempts += 1;
      p.ambush = false;
      summary.retry = true;
      logLine(state, 'The party is driven off by armed men.');
    }
  }
  state.active = null;
  settle(state, events);
  // Note: the associate is settled once the office's own fate is, so a campaign that has just ended learns nothing more.
  if (act.source === 'case' && !state.ended) settleAssociate(state, caseById(state, act.caseId), report, success, events);
  // Note: a retry is offered only if the same fight can be opened now; no office, or a successor who rides in from another town, leaves nothing to try again.
  if (summary.retry && !state.ended) summary.retry = resolveSource(state, act.source === 'case' ? act.caseId : { id: act.encId }).ok;
  else summary.retry = false;
  const succ = events.find((e) => e.type === 'succession');
  if (succ) summary.succession = succ;
  summary.ended = state.ended ? { ...state.ended } : null;
  summary.events = events;
  return summary;
}
