// Note: saloon challenges and their durable pre-exchange state; the running exchange is kept outside the campaign and committed once.
import { PLACES } from './world.js';
import { charById, clamp, clone, dice, logLine, sheriffOf, whole } from './base.js';
import { presentIn } from './town.js';
import { addInjuries, isFit } from './crew.js';
import { applyDeaths, RESERVE_CAP, settleDepartures, settleLoadout } from './economy.js';
import { advance, settle } from './state.js';
import { ensureSeriousWound, tireAfterFight } from './combat.js';
import { WEAPONS } from '../weapons.js';
import { hooksOf } from './rates.js';
import { byId, canHandle, kindOf, pick as pickGunslinger, reading, rearmLater, remember } from './gunslingers.js';
import { venueFor } from './venue.js';
import { nemesisHere, nemesisLabel, nemesisLook } from './story.js';
import { makeLook, portraitOf, woundMarks, faceCode } from './looks.js';
import { drinkEffects, levelOf, hangoverOf, drinkUp } from './drink.js';
import { unit } from '../rand.js';
import { persuasionApproach, hasTrait, note } from './traits.js';
import { feat } from './rewards.js';

// Note: item 311: the portrait of the other duelist, a gunslinger by his own look or the nemesis by his; the face code dresses his sprite the same way.
function opponentPortrait(state, duel, g) {
  const look = duel.opponentId === 'nemesis' ? nemesisLook(state) : makeLook(state.seed, g.name, 'gunslinger');
  return { look, marks: woundMarks(g.injuries || []), face: faceCode(look) };
}

// Note: the other duelist: a gunslinger, or the nemesis in the final duel.
const opponentOf = (state, id) => (id === 'nemesis' ? state.story?.nemesis || null : byId(state, id));

// Note: items 288, 299, 302, 303: the sheriff chooses to face the nemesis at his revealed final location, and the duel follows the Prototype 3 rules with no persuasion.
export function faceNemesis(state) {
  const sheriff = sheriffOf(state);
  if (state.ended || !nemesisHere(state) || state.duel || state.brawl || state.active || !sheriff) return { ok: false, reason: 'He is not here.' };
  const weapon = duelWeapon(state, sheriff.id);
  if (!weapon) return { ok: false, reason: 'The sheriff has no loaded revolver to face him with.' };
  // Note: he comes to every meeting with his own revolver and full belts, whatever the last one cost him.
  const n = state.story.nemesis;
  n.weapon = { ...n.gun };
  n.ammunition = Math.max(n.ammunition, 36);
  const site = venueFor(state.seed, state.at, `${state.min}:nemesis`);
  state.duel = {
    phase: 'ready', final: true, town: state.at, charId: sheriff.id, opponentId: 'nemesis', dispute: 'revenge', source: 'sheriff-visit',
    weapon, threatened: true, witnesses: true, venue: site.label, distance: site.distance, site, approach: 'revenge',
  };
  logLine(state, `${sheriff.name} calls out ${nemesisLabel(state.story.nemesis)} in ${PLACES[state.at].name}.`);
  return { ok: true, challenge: view(state) };
}

export const DISPUTES = ['gambling', 'insult', 'notoriety'];

function usable(state, person) {
  // Note: a duel is fought with a revolver, never a pocket pistol.
  return person.loadout.find((w) => WEAPONS[w.id]?.category === 'handgun'
    && (w.loaded === undefined || w.loaded > 0)
    && (state.ammo[w.ammoType] || 0) > 0) || null;
}

export function duelWeapon(state, charId) {
  const person = charById(state, charId);
  if (!person || !presentIn(state, state.at).includes(person) || !isFit(person) || !canHandle(person)) return null;
  const own = usable(state, person);
  if (own) return { owner: person.id, weapon: { ...own } };
  for (const lender of presentIn(state, state.at)) {
    if (lender === person || !isFit(lender)) continue;
    const weapon = usable(state, lender);
    if (weapon) return { owner: lender.id, weapon: { ...weapon } };
  }
  return null;
}

// Note: called by a saloon event, never as a generic town or road encounter.
export function challenge(state, charId, dispute, source = 'sheriff-visit') {
  const visitorPresent = source === 'teammate-rest'
    ? state.rest?.town === state.at && charId !== sheriffOf(state)?.id
    : source === 'sheriff-visit' && state.saloonVisit?.town === state.at;
  if (state.ended || state.journey || !PLACES[state.at]?.services.saloon || !visitorPresent || state.duel || state.brawl || state.active) return { ok: false, reason: 'No challenge is available here.' };
  if (!DISPUTES.includes(dispute)) return { ok: false, reason: 'Unknown dispute.' };
  const person = charById(state, charId);
  const weapon = duelWeapon(state, charId);
  if (!person || !weapon) return { ok: false, reason: 'No loaded revolver is available for that person.' };
  const d = dice(state);
  const opponent = pickGunslinger(state);
  // Note: item 346: a man who picks a quarrel in a saloon has often been drinking; the amount is hashed, so the dice stay where they were.
  drinkUp(opponent, Math.floor(unit(`${state.seed}:${opponent.id}:${state.min}:drink`) * 4));
  // Note: the ground comes from hashes of seed, town and minute; it takes nothing from the dice.
  const site = venueFor(state.seed, state.at, `${state.min}:${opponent.id}`);
  state.duel = {
    phase: 'challenge', town: state.at, charId, opponentId: opponent.id, dispute, source,
    weapon, threatened: dispute !== 'gambling' || d.chance(0.5), witnesses: d.chance(0.8),
    venue: site.label, distance: site.distance, site,
  };
  return { ok: true, challenge: view(state) };
}

export function view(state) {
  const duel = state.duel;
  if (!duel) return null;
  const opponent = opponentOf(state, duel.opponentId);
  const person = charById(state, duel.charId);
  if (!opponent || !person) return null;
  const read = reading(opponent, person.id);
  // Note: a teammate's duel is watched: the sim drives both sides and the player may only skip it.
  const mine = portraitOf(state, person);
  return {
    ...clone(duel), watch: duel.source === 'teammate-rest', name: person.name, portrait: { ...mine, face: faceCode(mine.look) },
    opponent: { id: opponent.id, name: duel.final ? nemesisLabel(opponent) : opponent.name, reputation: opponent.reputation, stance: duel.initial?.opponent.stance || read.stance, line: read.line, met: read.met, history: read.history, portrait: opponentPortrait(state, duel, opponent) },
  };
}

export function persuade(state, approach) {
  const duel = state.duel;
  if (!duel || duel.phase !== 'challenge') return { ok: false, reason: 'There is no challenge to answer.' };
  const person = charById(state, duel.charId);
  const opponent = opponentOf(state, duel.opponentId);
  if (!person || !opponent) return { ok: false, reason: 'A participant is missing.' };
  const sheriff = person.id === sheriffOf(state)?.id;
  if (sheriff && !['intimidate', 'explain'].includes(approach)) return { ok: false, reason: 'Choose intimidation or explanation.' };
  // Note: item 210: Toughness backs a threat and Awareness, reading the man, backs an explanation; a teammate picks by his better one, and his acquired manner breaks a tie (item 468).
  if (!sheriff) approach = persuasionApproach(person);
  const skill = approach === 'intimidate' ? person.skill.toughness : person.skill.awareness;
  const context = (duel.dispute === 'gambling' && approach === 'explain' ? 0.13 : 0)
    + (opponent.personality === 'cautious' && approach === 'intimidate' ? 0.12 : 0)
    - (opponent.personality === 'volatile' ? 0.12 : 0)
    - (duel.dispute === 'notoriety' ? 0.1 : 0)
    // Note: an old humiliation hardens him and an old kindness softens him.
    + reading(opponent, person.id).bond * 0.2
    // Note: item 346: drink makes a threat bolder and an explanation worse.
    + (approach === 'intimidate' ? drinkEffects(person).intimidate : drinkEffects(person).explain)
    // Note: item 468: a man known as a hothead is believed when he threatens and doubted when he explains; a known listener the other way round.
    + (hasTrait(person, 'aggression') ? (approach === 'intimidate' ? 0.06 : -0.06) : 0) + (hasTrait(person, 'receptive') && approach === 'explain' ? 0.06 : 0);
  // Note: item 469: a teammate's own name, moved by his witnessed conduct.
  const reputation = sheriff ? state.rep.sheriff : person.reputation;
  const chance = clamp(0.15 + skill * 0.35 + reputation * 0.002 + context, 0.05, 0.85);
  const roll = dice(state).chance(chance);
  // Note: the roll is always drawn, so forcing the outcome in a test leaves the dice sequence where it was.
  if (hooksOf(state).persuade ?? roll) {
    remember(state, opponent, { charId: person.id, dispute: duel.dispute, outcome: 'persuaded', kind: 'persuaded' });
    if (duel.source !== 'teammate-rest') logLine(state, `${person.name} talks ${opponent.name} out of a duel.`);
    // Note: item 475: talking a man down by explanation is the behaviour of a good listener.
    const events = [];
    if (approach === 'explain') note(state, person, 'receptive', events);
    state.duel = null;
    return { ok: true, persuaded: true, approach, chance: Math.round(chance * 1000) / 1000, events };
  }
  duel.phase = 'ready';
  duel.approach = approach;
  return { ok: true, persuaded: false, approach, chance: Math.round(chance * 1000) / 1000, challenge: view(state) };
}

// Note: the campaign is unchanged during the exchange, so a reload rebuilds the same participants, ammunition and seed from this record.
export function begin(state) {
  const duel = state.duel;
  if (!duel || !['ready', 'exchange'].includes(duel.phase)) return { ok: false, reason: 'No duel is ready.' };
  const events = [];
  if (duel.phase === 'ready') {
    const available = duelWeapon(state, duel.charId);
    if (!available || available.owner !== duel.weapon.owner || available.weapon.id !== duel.weapon.weapon.id || available.weapon.ammoType !== duel.weapon.weapon.ammoType) return { ok: false, reason: 'The revolver is no longer available.' };
    const weapon = duel.weapon.weapon;
    const rounds = state.ammo[weapon.ammoType];
    const loaded = Math.min(WEAPONS[weapon.id].cap, rounds, weapon.loaded ?? Infinity);
    const person = charById(state, duel.charId);
    const opponent = opponentOf(state, duel.opponentId);
    // Note: item 475: lending one's own revolver for a comrade's duel is an open-handed act.
    if (duel.weapon.owner !== duel.charId) note(state, charById(state, duel.weapon.owner), 'generosity', events);
    duel.initial = {
      loaded, reserve: Math.min(RESERVE_CAP, rounds - loaded), seed: dice(state).int(0, 0x7fffffff),
      // Note: drink and the hangover carry into the duel (items 346, 350); personality and stance matter only when a teammate fights for himself.
      player: { hand: person.hand, skill: { ...person.skill }, fatigue: person.fatigue, injuries: clone(person.injuries), intoxication: levelOf(person), hangover: hangoverOf(person), personality: hasTrait(person, 'aggression') || persuasionApproach(person) === 'intimidate' ? 'proud' : 'cautious', stance: 'neutral' },
      opponent: { ...(opponent.skill ? { skill: { ...opponent.skill } } : {}), intoxication: levelOf(opponent), hangover: hangoverOf(opponent), personality: opponent.personality, stance: reading(opponent, person.id).stance, reputation: opponent.reputation, injuries: clone(opponent.injuries || []), weapon: clone(opponent.weapon), loaded: Math.min(WEAPONS[opponent.weapon.id].cap, opponent.ammunition), reserve: Math.min(RESERVE_CAP, Math.max(0, opponent.ammunition - WEAPONS[opponent.weapon.id].cap)) },
    };
    duel.phase = 'exchange';
  }
  return { ok: true, duel: view(state), events };
}

// Note: the witnesses judge the recorded events in context; the account says only what the report holds, so it can be trusted.
export function judge(duel, report, { name, opponentName, died, opponentDied, opponentReputation = 0, cents = 0 }) {
  const drew = report.firstDraw;
  const shot = report.firstShot;
  const down = opponentDied || report.opponentStatus !== 'stopped';
  const who = (side) => (side === 'player' ? name : opponentName);
  // Note: each side's own ending is told, so a man shot down is never reported as a stopped fight.
  const endings = [
    died ? `${name} was killed` : report.playerStatus !== 'stopped' ? `${name} was shot down` : report.surrendered ? `${name} gave up` : null,
    opponentDied ? `${opponentName} was killed` : report.opponentStatus !== 'stopped' ? `${opponentName} was shot down` : report.opponentYielded ? `${opponentName} gave up` : null,
  ].filter(Boolean);
  const facts = [
    duel.threatened ? `${opponentName} had threatened ${name}` : `${opponentName} had made no threat`,
    `${who(drew)} drew first`,
    shot === drew ? `and fired first` : `but ${who(shot)} fired first`,
    endings.length ? endings.join(' and ') : 'the fight was stopped',
  ];
  if (!duel.witnesses) return { fine: 0, reputation: 0, verdict: 'unwitnessed', account: 'Nobody saw the duel.' };
  const finish = report.finish || { shots: 0, killed: false };
  const finished = finish.shots > 0 ? ` Then ${name} fired on ${opponentName} as he lay${finish.killed ? ' and killed him' : ''}.` : '';
  const account = `Witnesses say ${facts[0]}; ${facts[1]} ${facts[2]}; ${facts[3]}.${finished}`;
  if (died) return { fine: 0, reputation: 0, verdict: 'lost', account };
  const exchange = (() => {
    const unprovoked = !duel.threatened && drew === 'player';
    if (unprovoked && shot === 'player') return down ? { fine: 500, reputation: -3, verdict: 'unprovoked' } : { fine: 0, reputation: -1, verdict: 'reckless' };
    if (unprovoked) return { fine: 0, reputation: -1, verdict: 'reckless' };
    if (drew === 'opponent' && shot === 'opponent') return { fine: 0, reputation: down && opponentReputation >= 50 ? 2 : 1, verdict: 'self-defence' };
    return { fine: 0, reputation: 0, verdict: duel.threatened ? 'provoked' : 'fair' };
  })();
  // Note: a shot at a fallen duelist is a further act, judged like an unprovoked shot that wounds and more when it kills, on top of the exchange (item 359).
  const after = finish.shots === 0 ? null : finish.killed ? { fine: 1000, reputation: -5, verdict: 'finished' } : { fine: 500, reputation: -3, verdict: 'finishing-shot' };
  return { fine: Math.min(cents, exchange.fine + (after?.fine || 0)), reputation: exchange.reputation + (after?.reputation || 0), verdict: after?.verdict || exchange.verdict, exchange: exchange.verdict, account };
}

// Note: the report is a completed exchange that cannot spend more rounds than the pre-duel allocation and is settled once.
export function finish(state, report) {
  const duel = state.duel;
  if (!duel || duel.phase !== 'exchange' || !report || typeof report !== 'object') return { ok: false, reason: 'No exchange is waiting for a result.' };
  const person = charById(state, duel.charId);
  const opponent = opponentOf(state, duel.opponentId);
  const initial = duel.initial;
  const opponentWounds = report.opponentWounds ?? [];
  const lostLoaded = report.lostLoaded ?? 0;
  const opponentRoundsFired = report.opponentRoundsFired ?? 0;
  const opponentLostLoaded = report.opponentLostLoaded ?? 0;
  const validWounds = (wounds) => Array.isArray(wounds) && wounds.every((w) => w && ['head', 'chest', 'abdomen', 'arm', 'leg'].includes(w.region) && Number.isFinite(w.severity) && w.severity >= 0 && w.severity <= 1);
  const flag = (value) => value === undefined || typeof value === 'boolean';
  if (!person || !opponent || !whole(report.roundsFired) || report.roundsFired < 0 || report.roundsFired > initial.loaded + initial.reserve
    || !['stopped', 'incapacitated', 'dead'].includes(report.playerStatus)
    || !['stopped', 'incapacitated', 'dead'].includes(report.opponentStatus)
    || !['player', 'opponent', null].includes(report.firstDraw)
    || !['player', 'opponent', null].includes(report.firstShot)
    || !Number.isFinite(report.seconds) || report.seconds < 0 || report.seconds > 4 * 3600
    || (report.weaponHeld !== undefined && typeof report.weaponHeld !== 'boolean')
    || !flag(report.surrendered) || !flag(report.opponentYielded) || ![undefined, null, 'player', 'opponent'].includes(report.winner)
    || (report.finish !== undefined && !(report.finish && whole(report.finish.shots) && whole(report.finish.hits) && report.finish.hits <= report.finish.shots && report.finish.shots <= report.roundsFired && typeof report.finish.killed === 'boolean' && (report.finish.shots === 0 || report.opponentStatus !== 'stopped')
      && (!report.finish.killed || (report.finish.hits > 0 && (report.opponentStatus === 'dead' || report.opponentDying === true || opponentWounds.some((w) => w.fatal))))))
    || !whole(lostLoaded) || lostLoaded < 0 || report.roundsFired + lostLoaded > initial.loaded + initial.reserve || (report.weaponHeld !== false && lostLoaded !== 0)
    || !whole(opponentRoundsFired) || opponentRoundsFired < 0 || !whole(opponentLostLoaded) || opponentLostLoaded < 0 || opponentRoundsFired + opponentLostLoaded > initial.opponent.loaded + initial.opponent.reserve || (report.opponentWeaponHeld !== false && opponentLostLoaded !== 0)
    || !validWounds(report.wounds) || !validWounds(opponentWounds)
    || report.firstShot === null || report.firstDraw === null
    || (report.firstShot === 'player' && report.roundsFired === 0)
    || (report.firstShot === 'opponent' && opponentRoundsFired === 0)
    || (report.wounds.length > 0 && opponentRoundsFired === 0)
    || ((report.opponentStatus !== 'stopped' || opponentWounds.length > 0) && report.roundsFired === 0)
    || ((report.playerStatus === 'dead' || report.playerDying === true) && report.wounds.length === 0)
    || ((report.opponentStatus === 'dead' || report.opponentDying === true) && opponentWounds.length === 0)) return { ok: false, reason: 'The duel report is incomplete.' };
  const ammoType = duel.weapon.weapon.ammoType;
  const died = report.playerStatus === 'dead' || report.playerDying === true || report.wounds.some((w) => w.fatal);
  const opponentDied = report.opponentStatus === 'dead' || report.opponentDying === true || opponentWounds.some((w) => w.fatal);
  // Note: items 298, 357: the final duel ends only with a death.
  if (duel.final && !died && !opponentDied) return { ok: false, reason: 'The final duel ends only with a death.' };
  // Note: item 356: the man left standing at the first fall has won, even if he falls after.
  const won = report.winner ? report.winner === 'player' : report.opponentStatus === 'incapacitated' || opponentDied;
  const spent = died && !won ? initial.loaded + initial.reserve : report.roundsFired + (!won ? lostLoaded : 0);
  const opponentWon = report.winner ? report.winner === 'opponent' : report.playerStatus === 'incapacitated' || died;
  const opponentSpent = opponentDied && !opponentWon ? initial.opponent.loaded + initial.opponent.reserve : opponentRoundsFired + (!opponentWon ? opponentLostLoaded : 0);
  if (state.ammo[ammoType] < spent) return { ok: false, reason: 'The duel ammunition has changed.' };
  if (opponent.ammunition < opponentSpent) return { ok: false, reason: 'The opponent ammunition has changed.' };
  state.ammo[ammoType] -= spent;
  opponent.ammunition -= opponentSpent;
  const minutes = Math.max(1, Math.ceil(report.seconds / 60));
  const events = advance(state, minutes, 'fight');
  tireAfterFight(person, minutes);
  if (!won && report.weaponHeld === false) {
    const owner = charById(state, duel.weapon.owner);
    if (owner) {
      settleLoadout(owner, [], false, [duel.weapon.weapon]);
      if (!owner.loadout.length) owner.loadout.push({ id: 'colt73', ammoType: '45colt' });
    }
  }
  if (died) {
    events.push({ type: 'death', charId: person.id, name: person.name, cause: 'shot in a duel' });
    applyDeaths(state, [{ char: person, cause: 'shot in a duel' }]);
  } else {
    const wounds = report.wounds.map((w) => ({ ...w }));
    if (report.playerStatus === 'incapacitated') ensureSeriousWound(wounds);
    addInjuries(person, wounds);
  }
  opponent.alive = !opponentDied;
  if (!opponentWon && report.opponentWeaponHeld === false) opponent.weapon = null;
  if (opponent.alive) rearmLater(state, opponent);
  if (opponent.alive) {
    opponent.injuries ||= [];
    const wounds = opponentWounds.map((w) => ({ ...w }));
    if (report.opponentStatus === 'incapacitated') ensureSeriousWound(wounds);
    addInjuries(opponent, wounds);
  }
  const kind = kindOf(duel, report, { died, opponentDied });
  // Note: the stance he held at the start is read before this duel is written into his memory; the final duel carries no witness or legal judgment (item 357).
  const verdict = duel.final
    ? { fine: 0, reputation: 0, verdict: opponentDied ? 'revenge' : 'lost', account: opponentDied ? `${opponent.name} is dead.` : `${person.name} is dead.` }
    : judge(duel, report, { name: person.name, opponentName: opponent.name, died, opponentDied, opponentReputation: opponent.reputation, cents: state.cents });
  if (!duel.final) remember(state, opponent, { charId: person.id, dispute: duel.dispute, outcome: opponentDied ? 'dead' : report.opponentStatus, kind, witnessed: !!duel.witnesses });
  state.cents -= verdict.fine;
  if (person.role === 'sheriff') state.rep.sheriff = clamp(state.rep.sheriff + verdict.reputation, 0, 100);
  else person.reputation = clamp(person.reputation + verdict.reputation, 0, 100);
  logLine(state, `The duel between ${person.name} and ${opponent.name} ends. ${verdict.account}`);
  // Note: item 475: a duel fought is a step toward looking for trouble; drawing first unthreatened is aggression, and shooting a fallen man is a significant act of it.
  if (!died && !duel.final) {
    if (person.role === 'sheriff' && opponentDied) feat(state, 'duelsWon');
    note(state, person, 'trouble', events);
    if (report.firstDraw === 'player' && !duel.threatened) note(state, person, 'aggression', events);
    if ((report.finish?.shots || 0) > 0) note(state, person, 'aggression', events, { event: true });
  }
  settleDepartures(state, duel, events);
  state.duel = null;
  // Note: items 269 and 298: only the nemesis's death in the duel is revenge, and it ends the campaign with a win, settled before any succession, so a sheriff who dies with him still wins.
  if (duel.final && opponentDied && !state.ended) {
    state.ended = { min: state.min, reason: `${person.name} has killed ${nemesisLabel(opponent)}${died ? ' and dies with him' : ''}. The sheriff is avenged.`, outcome: 'win', by: person.id };
    logLine(state, state.ended.reason);
    events.push({ type: 'revenge', charId: person.id, name: person.name });
  }
  settle(state, events);
  // Note: item 358: both men down at once is a draw; each lives or dies by his wound and the witnesses judge as usual.
  const draw = report.fellTogether === true;
  // Note: item 311: the outcome vignette paints both men as the duel left them, its wounds included.
  const mine = portraitOf(state, person);
  const theirs = opponentPortrait(state, duel, opponent);
  const portraits = {
    player: { ...mine, marks: woundMarks([...person.injuries, ...(died ? report.wounds : [])]) },
    opponent: { ...theirs, marks: woundMarks([...(opponent.injuries || []), ...(opponentDied ? opponentWounds : [])]) },
  };
  return { ok: true, final: !!duel.final, draw, portraits, fine: verdict.fine, reputation: verdict.reputation, verdict: verdict.verdict, account: verdict.account, kind, died, opponentDied, events, opponent: opponent.name };
}
