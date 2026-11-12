// Note: a rare saloon dispute that two others take outdoors; the sheriff may watch it or ignore it, and the outcome is the same either way.
import { clamp, clone, logLine, sheriffOf } from './base.js';
import { DISPUTES } from './duel.js';
import { advance, settle } from './state.js';
import { addInjuries, randomPerson } from './crew.js';
import { ensureSeriousWound } from './combat.js';
import { RESERVE_CAP } from './economy.js';
import { DuelSim } from './duel-sim.js';
import { able, byId, create, inUse, PERSONALITIES, present, rearmLater, remember } from './gunslingers.js';
import { venueFor } from './venue.js';
import { WEAPONS } from '../weapons.js';
import { rng, seedFromString, unit } from '../rand.js';
import { makeLook, faceCode, woundMarks } from './looks.js';

// Note: the fixed step of a watched duel; a view that feeds the sim in these steps shows exactly the outcome the campaign will commit.
export const TICK = 0.05;
const WHY = { gambling: 'a crooked hand of cards', insult: 'an insult', notoriety: 'who is the faster gun' };

const snapshot = (g) => ({ kind: 'gunslinger', id: g.id, name: g.name, personality: g.personality, reputation: g.reputation, hand: g.hand || 'right', injuries: clone(g.injuries || []), weapon: clone(g.weapon), ammunition: g.ammunition });

function patron(tag, random) {
  const kind = Math.floor(unit(`${tag}:patron-temper`) * PERSONALITIES.length);
  return {
    kind: 'patron', id: null, name: randomPerson(random, { use: 'any', femaleChance: 0.25 }).name, personality: PERSONALITIES[kind],
    reputation: 3 + Math.floor(unit(`${tag}:patron-rep`) * 15), hand: unit(`${tag}:patron-hand`) < 0.12 ? 'left' : 'right',
    injuries: [], weapon: { id: 'colt73', ammoType: '45colt' }, ammunition: 12,
  };
}

// Note: offered by the saloon hook, never by the dice; the sides, the quarrel and the ground all come from hashes of the seed, the town and the minute.
export function offer(state) {
  if (state.spectacle || state.duel || state.brawl || state.ended) return null;
  const tag = `${state.seed}:spectacle:${state.at}:${state.min}`;
  const random = rng(seedFromString(tag));
  const busy = inUse(state);
  const here = present(state).filter((g) => able(g) && !busy.has(g.id));
  const first = here.length ? here[Math.floor(unit(`${tag}:first`) * here.length)] : create(state, random);
  const rest = here.filter((g) => g !== first);
  const two = unit(`${tag}:two`) < 0.35;
  const second = two ? (rest.length ? rest[Math.floor(unit(`${tag}:second`) * rest.length)] : create(state, random)) : null;
  const sides = [snapshot(first), second ? snapshot(second) : patron(tag, random)];
  if (unit(`${tag}:swap`) < 0.5) sides.reverse();
  state.spectacle = {
    phase: 'offer', town: state.at, min: state.min, seed: Math.floor(unit(`${tag}:seed`) * 0x7fffffff),
    dispute: DISPUTES[Math.floor(unit(`${tag}:dispute`) * DISPUTES.length)], a: sides[0], b: sides[1],
    site: venueFor(state.seed, state.at, `spectacle:${state.min}`),
  };
  return view(state);
}

const skillOf = (side, seed, who) => {
  const base = clamp(0.28 + 0.32 * (side.reputation / 100), 0.2, 0.8);
  const part = (k) => clamp(base + (unit(`${seed}:skill:${who}:${k}`) - 0.5) * 0.1, 0.2, 0.9);
  return { aim: part('aim'), nerve: part('nerve'), handling: part('handling') };
};

// Note: the same spec a controlled duel uses, with both sides driven by the sim.
export function specOf(state) {
  const sp = state.spectacle;
  if (!sp) return null;
  const sheet = (side, who) => {
    const cap = WEAPONS[side.weapon.id].cap;
    return { personality: side.personality, stance: 'neutral', reputation: side.reputation, hand: side.hand, skill: skillOf(side, sp.seed, who), fatigue: 0, injuries: clone(side.injuries), weapon: clone(side.weapon), loaded: Math.min(cap, side.ammunition), reserve: Math.min(RESERVE_CAP, Math.max(0, side.ammunition - cap)) };
  };
  const a = sheet(sp.a, 'a');
  const b = sheet(sp.b, 'b');
  return {
    phase: 'exchange', watch: true, name: sp.a.name, opponent: { name: sp.b.name }, distance: sp.site.distance, site: clone(sp.site),
    weapon: { owner: sp.a.id, weapon: clone(sp.a.weapon) }, charId: sp.a.id,
    initial: { seed: sp.seed, loaded: a.loaded, reserve: a.reserve, player: a, opponent: b },
    // Note: a test-only fall table override (see DuelSim).
    ...(sp.fall ? { fall: clone(sp.fall) } : {}),
  };
}

export function view(state) {
  const sp = state.spectacle;
  if (!sp) return null;
  // Note: item 311: both quarrelling men have their portraits, and their sprites wear the same faces.
  const side = (s) => {
    const look = makeLook(state.seed, s.name, 'gunslinger');
    return { name: s.name, kind: s.kind, reputation: s.reputation, portrait: { look, marks: woundMarks(byId(state, s.id)?.injuries || []), face: faceCode(look) } };
  };
  return {
    phase: sp.phase, town: sp.town, dispute: sp.dispute, site: clone(sp.site), a: side(sp.a), b: side(sp.b),
    text: `${sp.a.name} and ${sp.b.name} have words over ${WHY[sp.dispute]} and take it outside, to ${sp.site.label}.`,
    ...(sp.phase === 'watching' ? { spec: specOf(state) } : {}),
  };
}

// Note: a complete run at the fixed step; the result of a watched duel is this and nothing else.
export function simulate(spec) {
  const sim = new DuelSim(spec);
  while (!sim.done) sim.step(TICK);
  return sim.report();
}

export function watch(state) {
  const sp = state.spectacle;
  if (!sp || !['offer', 'watching'].includes(sp.phase)) return { ok: false, reason: 'There is nothing to watch.' };
  sp.phase = 'watching';
  return { ok: true, spectacle: view(state), spec: specOf(state) };
}

const verdictOf = (report) => {
  const dead = { a: report.playerStatus === 'dead' || report.wounds.some((w) => w.fatal), b: report.opponentStatus === 'dead' || report.opponentWounds.some((w) => w.fatal) };
  const down = { a: report.playerStatus === 'incapacitated', b: report.opponentStatus === 'incapacitated' };
  const gave = { a: !!report.surrendered, b: !!report.opponentYielded };
  const state = (s) => (dead[s] ? 'dead' : down[s] ? 'down' : gave[s] ? 'yielded' : 'standing');
  const lost = (s) => state(s) !== 'standing';
  const side = (who) => (who === 'player' ? 'a' : who === 'opponent' ? 'b' : null);
  // Note: item 356: the man standing at the first fall wins, even if he falls after; two at once is no winner (item 358).
  const winner = report.fellTogether ? null : side(report.winner) || (lost('a') && !lost('b') ? 'b' : lost('b') && !lost('a') ? 'a' : null);
  return { a: state('a'), b: state('b'), winner, firstDraw: side(report.firstDraw), firstShot: side(report.firstShot), shots: report.roundsFired + report.opponentRoundsFired };
};

const ENDING = { dead: 'killed', down: 'shot down', yielded: 'made to give way' };

// Note: only what a witness could see: who won, how the other ended, and who drew and fired first.
export function accountOf(sp, verdict) {
  const name = (s) => sp[s].name;
  // Note: the account names the ground the two actually stood on, and says so when shots were traded and nobody fell.
  const where = sp.site?.label || 'the street outside';
  if (!verdict.winner) {
    const lost = ['a', 'b'].filter((s) => verdict[s] !== 'standing');
    if (!lost.length) return verdict.shots > 0 ? `${name('a')} and ${name('b')} trade shots and part with no winner.` : `${name('a')} and ${name('b')} part with hard words and no winner.`;
    if (lost.every((s) => verdict[s] !== 'yielded')) return `${name('a')} and ${name('b')} both go down in ${where}.`;
    return `${name('a')} is ${ENDING[verdict.a]} and ${name('b')} is ${ENDING[verdict.b]} in ${where}.`;
  }
  const loser = verdict.winner === 'a' ? 'b' : 'a';
  const first = verdict.firstDraw && verdict.firstShot ? `; ${name(verdict.firstDraw)} drew first and ${name(verdict.firstShot)} fired first` : '';
  return `${name(verdict.winner)} beats ${name(loser)} outside, who is ${ENDING[verdict[loser]]}${first}.`;
}

// Note: the one place the outcome is written; it is applied once, to the roster only, never to the crew.
function commit(state, sp, watched) {
  const report = simulate(specOf(state));
  const verdict = verdictOf(report);
  const sheriff = sheriffOf(state);
  const account = accountOf(sp, verdict);
  const rounds = { a: report.roundsFired, b: report.opponentRoundsFired };
  const wounds = { a: report.wounds, b: report.opponentWounds };
  const held = { a: report.weaponHeld, b: report.opponentWeaponHeld };
  const lostLoaded = { a: report.lostLoaded, b: report.opponentLostLoaded };
  for (const s of ['a', 'b']) {
    const g = sp[s].id ? byId(state, sp[s].id) : null;
    if (!g) continue;
    const died = verdict[s] === 'dead';
    g.alive = !died;
    g.seen = state.min;
    g.ammunition = Math.max(0, g.ammunition - rounds[s] - (died || verdict.winner === (s === 'a' ? 'b' : 'a') ? 0 : lostLoaded[s]));
    if (died) continue;
    const list = wounds[s].map((w) => ({ ...w }));
    if (verdict[s] === 'down') ensureSeriousWound(list);
    addInjuries(g, list);
    if (!held[s]) g.weapon = null;
    rearmLater(state, g);
    if (verdict.winner) g.reputation = clamp((g.reputation ?? 20) + (verdict.winner === s ? 6 : -6), 0, 100);
    if (watched && sheriff) remember(state, g, { charId: sheriff.id, dispute: sp.dispute, outcome: 'watched', kind: 'watched' });
  }
  const anyDead = verdict.a === 'dead' || verdict.b === 'dead';
  // Note: a killing nobody stopped and the sheriff did not even watch costs him a little standing in town.
  const reputation = anyDead && !watched ? -1 : 0;
  if (reputation && sheriff) state.rep.sheriff = clamp(state.rep.sheriff + reputation, 0, 100);
  const events = [];
  let minutes = 0;
  if (watched) {
    minutes = Math.max(1, Math.ceil(report.seconds / 60));
    events.push(...advance(state, minutes, 'idle'));
  }
  logLine(state, watched ? `The sheriff watches. ${account}` : `Shots are heard outside the saloon. ${account}`);
  state.spectacle = null;
  if (watched) settle(state, events);
  // Note: item 311: both men as the quarrel left them.
  const portraits = Object.fromEntries(['a', 'b'].map((s) => [s, { look: makeLook(state.seed, sp[s].name, 'gunslinger'), marks: woundMarks([...((sp[s].id && byId(state, sp[s].id)?.injuries) || []), ...wounds[s]]) }]));
  return { ok: true, watched, account, outcome: { a: verdict.a, b: verdict.b, winner: verdict.winner }, portraits, reputation, minutes, events, seconds: report.seconds };
}

export function finish(state) {
  const sp = state.spectacle;
  if (!sp || sp.phase !== 'watching') return { ok: false, reason: 'No watched duel is waiting for its end.' };
  return commit(state, sp, true);
}

export function ignore(state) {
  const sp = state.spectacle;
  if (!sp || !['offer', 'watching'].includes(sp.phase)) return { ok: false, reason: 'There is nothing to ignore.' };
  return commit(state, sp, false);
}

// Note: whatever the sheriff does next, an offer he has not answered counts as ignored.
export function lapse(state) {
  return state.spectacle ? ignore(state) : null;
}
