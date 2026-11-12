// Note: acceptance of SPEC item 223 clause by clause; every scenario is forced through state.rates or built by hand, never by hunting for a seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Campaign } from '../public/western/js/camp/campaign.js';
import { DuelSim } from '../public/western/js/camp/duel-sim.js';
import { challenge as makeChallenge, judge } from '../public/western/js/camp/duel.js';
import { RATES } from '../public/western/js/camp/rates.js';
import { accountOf, offer as offerDispute, simulate, TICK } from '../public/western/js/camp/spectate.js';
import { KINDS, MAX_DISTANCE, MIN_DISTANCE } from '../public/western/js/camp/venue.js';
import { buildArena, feed, poseOf } from '../public/western/js/camp/duel-view.js';
import { settle } from '../public/western/js/camp/state.js';
import { applyDeaths, RESERVE_CAP } from '../public/western/js/camp/economy.js';
import { LIVE_CAP, MEMORY_CAP, present } from '../public/western/js/camp/gunslingers.js';
import { PLACES, neighbours, placesWithin } from '../public/western/js/camp/world.js';
import { WEAPONS } from '../public/western/js/weapons.js';
import { P2_START } from '../public/western/js/camp/state.js';
import { normSeed, seedFromString } from '../public/western/js/rand.js';

// Note: section "fixtures".

// Note: building a campaign dominates the cost, so every sample loads one saved start: the crew and story of acc-start, with only the seed and dice stream its own.
const START = Campaign.create('acc-start', P2_START).save();
function create(seed) {
  const game = Campaign.load(START);
  game.state.seed = normSeed(seed);
  game.state.rng = seedFromString(`camp:${game.state.seed}`);
  return game;
}

// Note: a little over the fan gap, in seconds.
const FAN_PAUSE = 0.2;

const QUIET = { challenge: 0, fight: 0, spectate: 0, teammateFight: 0, teammateChallenge: 0, teammateVisit: 0, gunslingerMove: 0 };
const sheriffOf = (game) => game.state.crew.find((c) => c.role === 'sheriff');
const deputyOf = (game) => game.state.crew.find((c) => c.role === 'deputy');
const handguns = (c) => c.loadout.filter((w) => WEAPONS[w.id].kind === 'handgun');
// Note: a sampled list is asserted to hold something before a loop reads it, so no loop is vacuous.
const some = (list, what) => {
  assert.ok(list.length > 0, `some ${what}`);
  return list;
};

// Note: a campaign with the saloon entered and every random trouble switched off unless a test turns it on.
function saloon(seed, rates = {}) {
  const game = create(seed);
  game.state.rates = { ...QUIET, persuade: false, ...rates };
  assert.equal(game.enterSaloon().ok, true);
  return game;
}

// Note: the sheriff is challenged in the saloon and the persuasion has failed, so the exchange is ready to begin.
function ready(seed = 'acc-ready', who = 0, rates = {}) {
  const game = saloon(seed, rates);
  assert.equal(game.duelChallenge(game.state.crew[who].id, 'insult').ok, true);
  assert.equal(game.duelPersuade('explain').persuaded, false);
  return game;
}

// Note: every fit teammate visits the saloon each hour and challenges; the first persuasion fails.
const REST = { ...QUIET, teammateVisit: 1, teammateChallenge: 1, persuade: false };
function restDuel(seed = 'acc-rest', rates = {}) {
  const game = create(seed);
  game.state.rates = { ...REST, ...rates };
  const result = game.rest(8);
  assert.equal(result.interrupted, true, 'the rest was stopped by a challenge');
  return { game, result };
}
const calm = (game) => { game.state.rates = { ...QUIET, persuade: false }; };

// Note: a scripted player; draws at drawAt, aims at the chest, cocks and fires while the cylinder holds a round, reloads while it is empty and picks a dropped revolver up.
function play(spec, { drawAt = 0, aim = [0, 1.25], limit = 180, onTick = () => {} } = {}) {
  const sim = new DuelSim(spec);
  let t = 0;
  const running = () => !sim.done && t < limit;
  // Note: the sim refuses what the man cannot do yet, so every tick may try the same input without a check.
  const tick = (act) => {
    sim.aimed(aim[0], aim[1]);
    act();
    sim.pickupWeapon('player');
    sim.step(0.05);
    // Note: a sheriff whose opponent is down walks away at once, so the shot at a fallen man (items 356, 359) is tested on its own.
    sim.standDown();
    t += 0.05;
    onTick(sim, t);
  };
  while (running() && t < drawAt) tick(() => {});
  sim.draw('player');
  while (running()) {
    while (running() && sim.view().loaded > 0) tick(() => { sim.cock(); sim.fire('player'); });
    while (running() && sim.view().loaded === 0) tick(() => sim.reloadWeapon('player'));
  }
  return sim;
}

const unarm = (c) => { c.loadout = c.loadout.filter((w) => WEAPONS[w.id].kind !== 'handgun'); };

// Note: section "223-rare-challenge".

test('223-rare-challenge: a saloon activity challenges the sheriff about once in seventy, never per minute of play', () => {
  assert.ok(RATES.challenge > 0 && RATES.challenge <= 0.02, `the saloon rate is ${RATES.challenge}`);
  assert.ok(RATES.teammateChallenge > 0 && RATES.teammateChallenge <= 0.02);
  const results = [];
  for (let n = 0; n < 6; n++) {
    const game = create(`acc-rare-${n}`);
    game.enterSaloon();
    for (let i = 0; i < 100 && !game.state.ended; i++) {
      game.state.cents = 20000;
      const result = game.saloonActivity(['drink', 'talk', 'meal'][i % 3]);
      assert.equal(result.ok, true, `activity ${i} of game ${n}`);
      results.push(result);
      game.state.duel = null;
      game.state.brawl = null;
      game.state.spectacle = null;
    }
  }
  const acts = results.length;
  const challenges = results.filter((result) => result.challenge).length;
  const fights = results.filter((result) => result.brawl).length;
  const spectacles = results.filter((result) => result.spectacle).length;
  assert.ok(acts >= 540, `enough activities (${acts})`);
  assert.ok(challenges > 0 && fights > 0, 'both kinds occur');
  assert.ok(challenges / acts < 0.03, `${challenges} challenges in ${acts} activities is not rare`);
  const per = acts / (challenges + fights);
  assert.ok(per >= 12 && per <= 28, `one fight or challenge in ${per.toFixed(1)} activities`);
  assert.ok(spectacles < challenges + fights, 'a dispute taken outdoors is rarer than a fight or a challenge');
  assert.ok(spectacles / acts < 1 / 40, `one dispute in ${(acts / Math.max(1, spectacles)).toFixed(0)} activities`);
});

// Note: section "223-origin-saloon-only".

// Note: section "223-spectate".

test('223-spectate: two other people take a dispute outside, the sheriff may watch it, and the watched result is the committed one', () => {
  const game = saloon('acc-spectate', { spectate: 1 });
  const crew = game.state.crew.map((c) => c.name);
  const ammo = JSON.stringify(game.state.ammo);
  const offer = game.saloonActivity('drink');
  assert.ok(offer.spectacle, 'a dispute is offered');
  // Note: the glass the sheriff drank wears off while he watches; the test is about the duel, so he is sober again (item 346 is tested with Prototype 4).
  for (const c of game.state.crew) Object.assign(c, { drink: 0, drinkPeak: 0 });
  const sober = JSON.stringify(game.state.crew);
  assert.equal(offer.challenge, null);
  assert.equal(offer.spectacle.phase, 'offer');
  for (const side of [offer.spectacle.a, offer.spectacle.b]) assert.ok(!crew.includes(side.name), 'the two are not of the crew');
  assert.ok(offer.spectacle.site.distance >= MIN_DISTANCE && offer.spectacle.site.distance <= MAX_DISTANCE);
  const minute = game.state.min;
  const watch = game.spectateWatch();
  assert.equal(watch.ok, true);
  assert.equal(watch.spec.watch, true, 'both sides are driven by the sim, the sheriff only watches');
  const expected = simulate(JSON.parse(JSON.stringify(watch.spec)));
  // Note: the view feeds the sim in fixed steps; any frame rate shows the same duel.
  const sim = new DuelSim(watch.spec);
  while (!sim.done) sim.step(TICK);
  assert.deepEqual(sim.report(), expected);
  const result = game.spectateFinish();
  assert.equal(result.ok, true);
  assert.equal(result.watched, true);
  assert.equal(result.seconds, expected.seconds);
  assert.equal(game.state.min, minute + Math.max(1, Math.ceil(expected.seconds / 60)), 'watching takes the time of the duel');
  assert.equal(JSON.stringify(game.state.crew), sober, 'the crew is untouched');
  assert.equal(JSON.stringify(game.state.ammo), ammo);
  assert.equal(game.state.spectacle, null);
  assert.ok(game.state.log.some((l) => l.text.includes(result.account)));
  // Note: ignoring the same dispute ends it the same way, only without the time.
  const other = saloon('acc-spectate', { spectate: 1 });
  other.saloonActivity('drink');
  const spec = other.spectateWatch().spec;
  const mark = other.state.min;
  const ignored = other.spectateIgnore();
  assert.equal(ignored.watched, false);
  assert.equal(other.state.min, mark);
  assert.equal(ignored.outcome.winner, result.outcome.winner);
  assert.equal(ignored.outcome.a, result.outcome.a);
  assert.deepEqual(simulate(spec), expected);
});

test('223-spectate: a dispute is offered only from saloon activity and never with trouble under way', () => {
  const road = create('acc-spectate-road');
  road.state.rates = { ...QUIET, spectate: 1, challenge: 1 };
  road.state.known.push('contention-az');
  road.depart('contention-az');
  for (let i = 0; i < 40 && road.state.journey; i++) road.advance(120);
  assert.ok(!road.state.spectacle && !road.state.duel);
  const game = saloon('acc-spectate-busy', { spectate: 1 });
  game.state.duel = { phase: 'challenge' };
  assert.equal(game.saloonActivity('drink').ok, false);
  // Note: the offer itself also refuses while a duel, a brawl or another dispute is open.
  for (const busy of [{ duel: { phase: 'challenge' } }, { brawl: { phase: 'x' } }, { spectacle: { phase: 'offer' } }]) {
    const open = saloon('acc-spectate-direct', { spectate: 1 });
    Object.assign(open.state, busy);
    assert.equal(offerDispute(open.state), null, JSON.stringify(busy));
  }
  const free = saloon('acc-spectate-direct', { spectate: 1 });
  assert.ok(offerDispute(free.state), 'the same state with nothing open does offer one');
});

// Note: section "223-no-challenge-without-revolver".

test('223-no-challenge-without-revolver: nobody can lend a loaded revolver, so the challenge is not offered', () => {
  const trouble = { challenge: 1 };
  const cases = {
    'every handgun gone': (g) => g.state.crew.forEach(unarm),
    'every revolver empty': (g) => g.state.crew.forEach((c) => handguns(c).forEach((w) => { w.loaded = 0; })),
    'the revolvers take cartridges the party lacks': (g) => { g.state.ammo['45colt'] = 0; },
  };
  for (const [name, setup] of Object.entries(cases)) {
    const game = saloon('acc-none', trouble);
    setup(game);
    assert.equal(game.duelChallenge(sheriffOf(game).id, 'insult').ok, false, name);
    const before = game.save();
    const result = game.saloonActivity('drink');
    assert.equal(result.ok, true, name);
    assert.equal(result.challenge, null, name);
    assert.ok(!game.state.duel, name);
    assert.ok(!game.state.gunslingers?.length, `${name}: no stranger is made for a challenge that cannot happen`);
    assert.notEqual(game.save(), before, 'the activity itself went on');
  }
  // Note: a teammate who cannot lend (away or down) is no lender.
  for (const [name, setup] of Object.entries({
    'away': (d) => { d.where = 'benson-az'; },
    'down': (d) => { d.injuries = ['chest', 'abdomen'].map((region) => ({ region, side: 1, severity: 1, healed: 0, lasting: null, treated: false, ageMin: 0 })); },
  })) {
    const game = saloon('acc-none', trouble);
    unarm(sheriffOf(game));
    setup(deputyOf(game));
    assert.equal(game.duelChallenge(sheriffOf(game).id, 'insult').ok, false, `a deputy who is ${name} cannot lend`);
    assert.equal(game.saloonActivity('drink').challenge, null);
  }
  // Note: while resting, a teammate with no revolver and no lender is never challenged.
  const rest = create('acc-none-rest');
  rest.state.rates = { ...REST };
  rest.state.crew.forEach(unarm);
  const done = rest.rest(24);
  assert.equal(done.interrupted, false);
  assert.ok(!rest.state.duel);
  assert.ok(!rest.state.gunslingers?.length);
});

test('223-no-challenge-without-revolver: the same cases with a teammate who can lend do produce a challenge, with the loan recorded', () => {
  const unarmed = saloon('acc-loan', { challenge: 1 });
  unarm(sheriffOf(unarmed));
  const result = unarmed.saloonActivity('drink');
  assert.ok(result.challenge, 'the deputy can lend, so the challenge stands');
  assert.equal(result.challenge.weapon.owner, deputyOf(unarmed).id);
  assert.equal(result.challenge.charId, sheriffOf(unarmed).id);
  const empty = saloon('acc-loan', { challenge: 1 });
  handguns(sheriffOf(empty)).forEach((w) => { w.loaded = 0; });
  const again = empty.saloonActivity('drink');
  assert.equal(again.challenge.weapon.owner, deputyOf(empty).id, 'an unloaded revolver is borrowed against, not used');
  const own = saloon('acc-loan', { challenge: 1 });
  assert.equal(own.saloonActivity('drink').challenge.weapon.owner, sheriffOf(own).id, 'an armed sheriff uses his own');
});

// Note: section "223-sheriff-persuasion".

// Note: the sheriff is challenged and still has to answer; the same challenge is cloned through the save for each variation.
function challenged(seed, dispute = 'gambling', who = 0) {
  const game = saloon(seed);
  assert.equal(game.duelChallenge(game.state.crew[who].id, dispute).ok, true);
  assert.equal(game.state.duel.phase, 'challenge');
  return game;
}
const chanceOf = (game, approach, mutate = () => {}) => {
  const copy = Campaign.load(game.save());
  copy.state.rates = { ...QUIET, persuade: false };
  mutate(copy.state);
  const result = copy.duelPersuade(approach);
  assert.equal(result.ok, true);
  return result.chance;
};
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 0.0015, `${label}: ${a} vs ${b}`);

test('223-sheriff-persuasion: the sheriff must choose intimidation or explanation, and nothing besides answers the challenge', () => {
  const game = challenged('acc-sp-choice');
  const saved = game.save();
  for (const bad of [undefined, 'plead', '', null, 'Intimidate']) {
    assert.equal(game.duelPersuade(bad).ok, false, String(bad));
    assert.equal(game.save(), saved, 'a refused answer changes nothing');
  }
  // Note: there is no way to walk away: the exchange, the result and the saloon exit are all refused while the challenge stands.
  assert.equal(game.duelBegin().ok, false);
  assert.equal(game.duelFinish({ seconds: 1, roundsFired: 0, playerStatus: 'stopped', opponentStatus: 'stopped', firstDraw: 'player', firstShot: 'player', wounds: [] }).ok, false);
  assert.equal(game.leaveSaloon().ok, false);
  assert.equal(game.rest(1).ok, false);
  assert.equal(game.save(), saved);
  for (const approach of ['intimidate', 'explain']) {
    const copy = Campaign.load(saved);
    copy.state.rates = { ...QUIET, persuade: false };
    const r = copy.duelPersuade(approach);
    assert.equal(r.ok, true);
    assert.equal(r.approach, approach, 'the sheriff is not given a different approach');
  }
});

test('223-sheriff-persuasion: the chance follows the dispute, the opponent, the sheriff\'s reputation and skills', () => {
  const equal = (state) => { for (const c of state.crew) c.skill = { precision: 0.5, toughness: 0.5, awareness: 0.5 }; state.rep.sheriff = 0; state.gunslingers[0].personality = 'proud'; };
  const gambling = challenged('acc-sp-chance', 'gambling');
  const insult = challenged('acc-sp-chance', 'insult');
  const notoriety = challenged('acc-sp-chance', 'notoriety');
  const base = chanceOf(insult, 'explain', equal);
  near(chanceOf(insult, 'intimidate', equal), base, 'with equal skills the two approaches are equal on an insult');
  near(chanceOf(gambling, 'explain', equal) - chanceOf(gambling, 'intimidate', equal), 0.13, 'a quarrel over cards is eased by explaining');
  near(chanceOf(notoriety, 'explain', equal), base - 0.1, 'a man who wants a name is harder to talk down');
  near(chanceOf(insult, 'explain', (s) => { equal(s); s.gunslingers[0].personality = 'volatile'; }), base - 0.12, 'a hothead');
  near(chanceOf(insult, 'intimidate', (s) => { equal(s); s.gunslingers[0].personality = 'cautious'; }) - base, 0.12, 'a cautious man is easier to frighten');
  near(chanceOf(insult, 'explain', (s) => { equal(s); s.gunslingers[0].personality = 'cautious'; }), base, 'but not easier to reason with');
  near(chanceOf(insult, 'explain', (s) => { equal(s); s.rep.sheriff = 80; }) - base, 0.16, 'reputation');
  near(chanceOf(insult, 'intimidate', (s) => { equal(s); sheriffOf({ state: s }).skill.toughness = 0.9; }) - base, 0.14, 'Toughness backs intimidation');
  near(chanceOf(insult, 'explain', (s) => { equal(s); sheriffOf({ state: s }).skill.toughness = 0.9; }), base, 'and not explanation');
  near(chanceOf(insult, 'explain', (s) => { equal(s); sheriffOf({ state: s }).skill.awareness = 0.9; }) - base, 0.14, 'Awareness backs explanation');
  // Note: an old humiliation hardens a man and an old kindness softens him.
  const hard = chanceOf(insult, 'explain', (s) => { equal(s); s.gunslingers[0].memories = [{ min: 0, charId: sheriffOf({ state: s }).id, dispute: 'insult', outcome: 'incapacitated', kind: 'humiliated' }]; });
  const soft = chanceOf(insult, 'explain', (s) => { equal(s); s.gunslingers[0].memories = [{ min: 0, charId: sheriffOf({ state: s }).id, dispute: 'insult', outcome: 'incapacitated', kind: 'spared' }]; });
  assert.ok(hard < base && base < soft, `${hard} < ${base} < ${soft}`);
  // Note: the chance stays inside its bounds whatever the situation.
  assert.equal(chanceOf(notoriety, 'explain', (s) => { equal(s); s.rep.sheriff = 0; for (const c of s.crew) c.skill = { precision: 0, toughness: 0, awareness: 0 }; s.gunslingers[0].personality = 'volatile'; }), 0.05);
  assert.equal(chanceOf(gambling, 'explain', (s) => { equal(s); s.rep.sheriff = 100; for (const c of s.crew) c.skill = { precision: 0.95, toughness: 0.95, awareness: 0.95 }; s.gunslingers[0].memories = [{ min: 0, charId: sheriffOf({ state: s }).id, dispute: 'gambling', outcome: 'incapacitated', kind: 'spared' }]; }), 0.85);
});

test('223-sheriff-persuasion: the dice decide the outcome at about the reported chance; success ends the duel, failure leaves it ready', () => {
  const N = 100;
  const rolls = Array.from({ length: N }, (_, i) => {
    const game = create(`acc-roll-${i}`);
    game.state.rates = { ...QUIET, persuade: null };
    game.enterSaloon();
    assert.equal(game.duelChallenge(sheriffOf(game).id, 'insult').ok, true);
    const before = game.state.log.length;
    const asked = ['explain', 'intimidate'][i % 2];
    const r = game.duelPersuade(asked);
    return {
      asked,
      r,
      open: !!game.state.duel,
      phase: game.state.duel?.phase,
      approach: game.state.duel?.approach,
      logged: game.state.log.slice(before).some((l) => /talks .* out of a duel/.test(l.text)),
      memory: game.state.gunslingers[0].memories[0]?.kind,
      begun: game.duelBegin().ok,
    };
  });
  const won = some(rolls.filter((roll) => roll.r.persuaded), 'persuaded opponent');
  const stood = some(rolls.filter((roll) => !roll.r.persuaded), 'opponent who stood his ground');
  won.forEach((roll) => {
    assert.equal(roll.open, false, 'a persuaded opponent walks away');
    assert.ok(roll.logged);
    assert.equal(roll.memory, 'persuaded');
    assert.equal(roll.begun, false, 'nothing is left to fight');
  });
  stood.forEach((roll) => {
    assert.equal(roll.phase, 'ready');
    assert.equal(roll.approach, roll.asked);
    assert.equal(roll.begun, true, 'a persistent opponent gets his duel');
  });
  const expected = rolls.reduce((sum, roll) => sum + roll.r.chance, 0);
  assert.ok(won.length > 0 && won.length < N, 'both outcomes occur');
  assert.ok(Math.abs(won.length - expected) / N < 0.08, `${won.length / N} persuaded against a mean chance of ${expected / N}`);
});

// Note: section "223-teammate-persuasion".

test('223-teammate-persuasion: a challenged teammate answers alone, and the player hears of it only after the attempt failed', () => {
  const quiet = create('acc-tp-1');
  quiet.state.rates = { ...REST, persuade: true };
  const talked = quiet.rest(8);
  assert.equal(talked.interrupted, false, 'a successful persuasion is not announced');
  assert.equal(talked.minutes, 480);
  assert.equal(talked.challenge, undefined);
  assert.ok(!quiet.state.duel);
  assert.equal(quiet.state.gunslingers[0].memories[0].kind, 'persuaded');
  assert.ok(!quiet.state.log.some((l) => /duel|challeng/i.test(l.text)), 'no log line tells the player');
  assert.ok(!talked.events.some((e) => /duel|challenge/.test(e.type)));

  const { game, result } = restDuel('acc-tp-1');
  assert.equal(result.challenge.phase, 'ready', 'the persuasion was over before the player was told');
  assert.equal(result.challenge.charId, deputyOf(game).id);
  assert.ok(['intimidate', 'explain'].includes(result.challenge.approach));
  assert.equal(game.state.duel.source, 'teammate-rest');
  assert.equal(game.duelPersuade('explain').ok, false, 'the player has no say in it');
  assert.ok(!game.state.gunslingers[0].memories.some((m) => m.kind === 'persuaded'));
});

test('223-teammate-persuasion: the teammate picks the approach from his own skills, whatever the caller passes', () => {
  const run = (skill, approach) => {
    const game = challenged('acc-tp-skill', 'gambling', 1);
    game.state.crew[1].skill = skill;
    game.state.rates = { ...QUIET, persuade: false };
    return game.duelPersuade(approach);
  };
  const bold = { precision: 0.5, toughness: 0.9, awareness: 0.2 };
  const smooth = { precision: 0.5, toughness: 0.2, awareness: 0.9 };
  for (const approach of ['intimidate', 'explain', undefined, 'anything']) {
    assert.equal(run(bold, approach).approach, 'intimidate', `a bold man intimidates (${approach})`);
    assert.equal(run(smooth, approach).approach, 'explain', `a smooth talker explains (${approach})`);
  }
  assert.equal(run(bold, 'intimidate').chance, run(bold, 'explain').chance);
  assert.equal(run(smooth, 'intimidate').chance, run(smooth, 'explain').chance);
  assert.ok(run(bold, 'explain').ok && !run(bold, 'explain').persuaded);
});

test('223-teammate-persuasion: the teammate\'s chance depends on his reputation and skills, the opponent and the dispute', () => {
  const game = challenged('acc-tp-ctx', 'insult', 1);
  const setup = (s) => { const d = s.crew[1]; d.skill = { precision: 0.5, toughness: 0.5, awareness: 0.5 }; d.reputation = 0; s.gunslingers[0].personality = 'proud'; };
  const base = chanceOf(game, undefined, setup);
  near(chanceOf(game, undefined, (s) => { setup(s); s.crew[1].reputation = 60; }) - base, 0.12, 'a teammate with a name');
  near(chanceOf(game, undefined, (s) => { setup(s); s.crew[1].skill = { precision: 0.5, toughness: 0.9, awareness: 0.5 }; }) - base, 0.14, 'Toughness, when it is his better skill');
  near(chanceOf(game, undefined, (s) => { setup(s); s.crew[1].skill = { precision: 0.5, toughness: 0.5, awareness: 0.9 }; }) - base, 0.14, 'Awareness, when it is his better skill');
  near(chanceOf(game, undefined, (s) => { setup(s); s.crew[1].skill = { precision: 0.99, toughness: 0.5, awareness: 0.5 }; }) - base, 0, 'his aim is not a talking skill');
  near(chanceOf(game, undefined, (s) => { setup(s); s.gunslingers[0].personality = 'volatile'; }) - base, -0.12, 'the opponent');
  const duel = challenged('acc-tp-ctx', 'notoriety', 1);
  near(chanceOf(duel, undefined, setup) - base, -0.1, 'the dispute');
});

// Note: section "223-teammate-spectated".

// Note: a deputy with his own skill and hand is challenged in a rest and the persuasion fails, so the exchange is ready to begin.
function teammateDuel(seed) {
  const game = create(seed);
  const deputy = deputyOf(game);
  deputy.skill = { precision: 0.9, toughness: 0.2, awareness: 0.7 };
  deputy.hand = 'left';
  game.state.rates = { ...REST };
  assert.equal(game.rest(8).interrupted, true);
  calm(game);
  return { game, deputy };
}

// Note: a frame loop of uneven frames, as a screen feeds a watched duel.
const FRAMES = [0.016, 0.033, 0.2, 0.05, 0.007, 0.12];
function watchFrames(sim) {
  const clock = { acc: 0 };
  let frame = 0;
  while (!sim.done && frame < 100000) feed(sim, clock, FRAMES[frame++ % FRAMES.length], true);
  return sim;
}

test('223-teammate-spectated: after a failed persuasion the challenged teammate fights on his own with his skill, hand and revolver, and nothing the player does moves him', () => {
  const { game, deputy } = teammateDuel('acc-tc');
  const sheriff = sheriffOf(game);
  const begun = game.duelBegin();
  assert.equal(begun.ok, true);
  const spec = begun.duel;
  assert.equal(spec.watch, true, 'the exchange is a watched one');
  assert.equal(spec.charId, deputy.id, 'the challenged teammate, not the sheriff');
  assert.equal(spec.name, deputy.name);
  assert.equal(spec.weapon.owner, deputy.id);
  assert.deepEqual(spec.initial.player.skill, deputy.skill);
  assert.equal(spec.initial.player.hand, 'left');
  assert.notDeepEqual(spec.initial.player.skill, sheriff.skill);
  assert.equal(spec.initial.player.intoxication, 0, 'no drinking model yet');
  const sim = new DuelSim(spec);
  assert.equal(sim.auto.player, true, 'the sim drives the teammate');
  assert.equal(sim.player.name, deputy.name);
  // Note: every input of the sheriff for that side is refused, and the sim is left as it was.
  const before = JSON.stringify(sim.view());
  const refused = [sim.draw('player'), sim.fire('player'), sim.fire('player', { fan: true }), sim.cock(), sim.reloadWeapon('player'), sim.pickupWeapon('player'), sim.stopFighting(true)];
  sim.aimed(2, 2.5);
  sim.aimed(0.12, 0.2);
  assert.deepEqual(refused, [false, { ok: false, reason: 'watched' }, { ok: false, reason: 'watched' }, false, false, false, false]);
  assert.equal(JSON.stringify(sim.view()), before, 'the player\'s pointer and keys do nothing in it');
  const alone = new DuelSim(spec);
  while (!alone.done) alone.step(TICK);
  assert.notEqual(alone.draws.player, null, 'the teammate draws by himself');
  const report = alone.report();
  assert.ok(report.roundsFired + report.opponentRoundsFired > 0, 'shots were traded');
  const mark = { sheriff: JSON.stringify(sheriff.injuries), rep: game.state.rep.sheriff };
  assert.equal(game.duelFinish(report).ok, true);
  assert.equal(JSON.stringify(sheriff.injuries), mark.sheriff, 'the sheriff took no part');
  assert.equal(game.state.rep.sheriff, mark.rep, 'and his standing did not move');
  assert.equal(game.state.gunslingers[0].memories.at(-1).charId, deputy.id, 'the opponent remembers the teammate he met');
  assert.equal(game.state.crew.find((c) => c.role === 'sheriff').id, sheriff.id);
});

test('223-teammate-spectated: watching it to the end and skipping to the end commit exactly the same state, and the consequences land on the teammate', () => {
  const runs = Array.from({ length: 6 }, (_, i) => {
    const watched = teammateDuel(`acc-tc-same-${i}`);
    const skipped = teammateDuel(`acc-tc-same-${i}`);
    const specA = watched.game.duelBegin().duel;
    const specB = skipped.game.duelBegin().duel;
    assert.deepEqual(specA, specB);
    const seen = watchFrames(new DuelSim(specA));
    assert.equal(seen.done, true);
    const skip = new DuelSim(specB);
    while (!skip.done) skip.step(TICK);
    assert.deepEqual(seen.report(), skip.report(), 'the same report either way');
    assert.equal(watched.game.duelFinish(seen.report()).ok, true);
    assert.equal(skipped.game.duelFinish(skip.report()).ok, true);
    assert.equal(watched.game.save(), skipped.game.save(), `byte-identical committed state (${i})`);
    return { report: skip.report(), game: skipped.game, deputy: skipped.deputy };
  });
  some(runs.filter(({ report }) => report.wounds.length > 0), 'teammate wounded').forEach(({ game, deputy }) => {
    const hurt = game.state.crew.filter((c) => c.id === deputy.id).flatMap((c) => c.injuries).length;
    const dead = game.state.fallen.filter((f) => f.char.id === deputy.id).length;
    assert.ok(hurt + dead >= 1, 'the wounds of the exchange are the teammate\'s: an injury, or his death');
    assert.equal(sheriffOf(game).injuries.length, 0, 'the sheriff has none');
  });
});

// Note: section "223-outside-positioning".

test('223-outside-positioning: a saloon challenge is settled outside, on ground and at a distance that vary and are saved with the challenge', () => {
  const OUTSIDE = new Set(['the street outside', 'a yard behind the saloon', 'the corral beside the livery', 'the open lot beside the saloon']);
  const kinds = new Set();
  const distances = new Set();
  const challengeAt = (i) => {
    const game = saloon(`acc-venue-${i}`);
    game.state.min += i * 7;
    assert.equal(game.duelChallenge(game.state.crew[i % 2].id, 'insult').ok, true);
    return game;
  };
  for (let i = 0; i < 30; i++) {
    const game = challengeAt(i);
    const duel = game.duel();
    assert.ok(OUTSIDE.has(duel.site.label), `outdoors: ${duel.site.label}`);
    assert.ok(KINDS.includes(duel.site.kind));
    assert.ok(Number.isInteger(duel.distance) && duel.distance >= MIN_DISTANCE && duel.distance <= MAX_DISTANCE, `${duel.distance} m`);
    assert.equal(duel.distance, duel.site.distance);
    assert.equal(duel.venue, duel.site.label);
    assert.deepEqual(Campaign.load(game.save()).duel().site, duel.site, 'the ground survives a save');
    kinds.add(duel.site.kind);
    distances.add(duel.distance);
  }
  // Note: the first twelve duels are also begun, and the two face each other across the venue distance.
  for (let i = 0; i < 12; i++) {
    const game = challengeAt(i);
    const duel = game.duel();
    game.duelPersuade('explain');
    const spec = game.duelBegin().duel;
    const sim = new DuelSim(spec);
    assert.equal(sim.opponent.x - sim.player.x, duel.distance, 'the two face each other across the venue distance');
    const arena = buildArena(spec.site);
    assert.equal(arena.x1 - arena.x0, duel.distance);
  }
  assert.equal(kinds.size, KINDS.length, 'every kind of ground comes up');
  assert.ok(distances.size >= 10, `the distance varies (${distances.size} values)`);
  // Note: a teammate's duel is held outside too.
  const { game } = restDuel('acc-venue-rest');
  assert.ok(OUTSIDE.has(game.duel().site.label));
});

// Note: section "223-stand-in-place".

test('223-stand-in-place: neither duelist can move, seek cover or step aside, whatever happens in the exchange', () => {
  const forbidden = /^(move|walk|run|sprint|crouch|prone|seek|cover|dodge|strafe|lean|retreat|flee|duck|sidestep)/i;
  for (const name of Object.getOwnPropertyNames(DuelSim.prototype)) assert.ok(!forbidden.test(name), `DuelSim has a ${name}`);
  const spots = (sim) => JSON.stringify([sim.player.x, sim.player.y, sim.opponent.x, sim.opponent.y]);
  let controlled = 0;
  let watched = 0;
  for (let i = 0; i < 8; i++) {
    const { spec } = (() => { const g = ready(`acc-stand-${i}`); return { spec: g.duelBegin().duel }; })();
    const probe = new DuelSim(spec);
    const start = spots(probe);
    assert.deepEqual([probe.player.x, probe.player.y, probe.opponent.x, probe.opponent.y], [0, 0, spec.distance, 0]);
    // Note: some duels also get a pick-up or a surrender call in a short window of the exchange.
    const pokes = [
      { every: 9, from: 2, to: 2.1, act: (s) => s.pickupWeapon('player') },
      { every: 11, from: 3, to: 3.1, act: (s) => s.stopFighting(true) },
    ].filter((poke) => i % poke.every === 0);
    const sim = play(spec, {
      drawAt: i % 4, aim: [(i % 5) - 2, 0.4 + (i % 7) * 0.2],
      onTick: (s, t) => {
        assert.equal(spots(s), start, `moved at ${t.toFixed(2)} s`);
        pokes.filter((poke) => t > poke.from && t < poke.to).forEach((poke) => poke.act(s));
      },
    });
    controlled++;
    assert.equal(spots(sim), start);
    // Note: both sides driven, as in a watched duel.
    const auto = new DuelSim({ ...spec, watch: true, initial: { ...spec.initial, player: { ...spec.initial.player, personality: ['proud', 'volatile', 'cautious'][i % 3], stance: 'neutral' } } });
    for (let t = 0; t < 120 && !auto.done; t += 0.05) {
      auto.step(0.05);
      assert.equal(spots(auto), start);
    }
    watched++;
  }
  assert.ok(controlled === 8 && watched === 8);
  // Note: a dropped revolver is picked up where the man stands.
  const { spec } = (() => { const g = ready('acc-stand-drop'); return { spec: g.duelBegin().duel }; })();
  const sim = target(spec);
  sim.draw('player');
  sim.step(1);
  const start = spots(sim);
  sim.weaponHeld.player = false;
  assert.equal(sim.pickupWeapon('player'), true);
  for (let i = 0; i < 80; i++) sim.step(0.05);
  assert.equal(sim.weaponHeld.player, true, 'the revolver was picked up');
  assert.equal(spots(sim), start);
});

// Note: section "223-unsignaled-draw".

test('223-unsignaled-draw: there is no countdown or signal; the opponent draws when his own temper says so and the player whenever he likes', () => {
  const duel = ready('acc-draw').duelBegin().duel;
  const withTemper = (seed, personality) => ({ ...duel, initial: { ...duel.initial, seed, opponent: { ...duel.initial.opponent, personality, stance: 'neutral' } } });
  const keys = Object.keys(new DuelSim(duel).view());
  assert.ok(!keys.some((k) => /countdown|signal|start|go|ready|bell|fire/i.test(k)), keys.join(','));
  const means = {};
  for (const personality of ['proud', 'volatile', 'cautious']) {
    const times = [];
    for (let seed = 1; seed <= 25; seed++) {
      const sim = new DuelSim(withTemper(seed, personality));
      while (sim.draws.opponent === null && sim.time < 60) sim.step(0.05);
      assert.notEqual(sim.draws.opponent, null, 'the opponent draws although nobody gave a signal');
      assert.ok(sim.draws.opponent > 0, 'and not at the start');
      assert.equal(sim.firstDraw, 'opponent');
      times.push(sim.draws.opponent);
    }
    assert.ok(new Set(times.map((t) => t.toFixed(2))).size >= 9, `${personality}: draws are scattered over time`);
    assert.ok(Math.max(...times) - Math.min(...times) > 4, `${personality}: no fixed moment`);
    means[personality] = times.reduce((a, b) => a + b, 0) / times.length;
  }
  assert.ok(means.volatile < means.proud && means.proud < means.cautious, `temper decides: ${JSON.stringify(means)}`);
  // Note: the player draws at any moment, before or after the opponent.
  for (const at of [0, 0.35, 2.2, 7.7]) {
    const sim = new DuelSim(withTemper(5, 'proud'));
    for (let t = 0; t < at; t += 0.05) sim.step(0.05);
    assert.equal(sim.draw('player'), true, `drawing at ${at} s`);
    assert.equal(sim.draw('player'), false, 'once');
  }
  const first = new DuelSim(withTemper(5, 'proud'));
  first.draw('player');
  assert.equal(first.firstDraw, 'player');
  const late = new DuelSim(withTemper(5, 'proud'));
  while (late.draws.opponent === null) late.step(0.05);
  assert.equal(late.draw('player'), true);
  assert.equal(late.firstDraw, 'opponent');
});

test('223-unsignaled-draw: the draw itself is shown by the opponent\'s body, step by step, and the gun is not in the hand before it', () => {
  const duel = ready('acc-draw-anim').duelBegin().duel;
  let shown = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const sim = new DuelSim({ ...duel, initial: { ...duel.initial, seed } });
    const frames = [];
    while (sim.time <= 90 && (sim.draws.opponent === null || sim.view().opponent !== 'drawn')) {
      sim.step(0.05);
      const v = sim.view();
      frames.push({ state: v.opponent, progress: v.opponentDrawProgress, weapon: poseOf(v, 'opponent').weapon });
    }
    const sawHandBefore = frames.some((frame) => frame.state === 'holstered' && frame.weapon !== 'none');
    const progress = frames.filter((frame) => frame.state === 'drawing').map((frame) => [frame.progress, frame.weapon]);
    assert.equal(sawHandBefore, false, 'no gun in the hand before the draw');
    assert.ok(progress.length >= 2, 'the draw takes several frames');
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i][0] > progress[i - 1][0], 'progress rises');
    // Note: the revolver leaves the holster in the second third of the draw.
    assert.ok(progress.every(([p]) => p >= 0 && p < 1), JSON.stringify(progress));
    assert.ok(progress.filter(([p]) => p < 1 / 3).every(([, weapon]) => weapon === 'none'), JSON.stringify(progress));
    assert.ok(progress.filter(([p]) => p >= 1 / 3).every(([, weapon]) => weapon === 'handgun'), JSON.stringify(progress));
    assert.ok(progress.some(([, weapon]) => weapon === 'none') && progress.some(([, weapon]) => weapon === 'handgun'), 'the gun comes out during the draw');
    shown++;
  }
  assert.equal(shown, 12);
});

test('223-unsignaled-draw: the sheriff draws whenever he likes by a right-click, the revolver comes out cocked, and the opponent answers that draw like any other', () => {
  const duel = ready('acc-draw-click').duelBegin().duel;
  const keys = Object.keys(new DuelSim(duel).view());
  assert.ok(!keys.some((k) => /countdown|signal|bell/i.test(k)), 'and still no signal');
  const late = new DuelSim(duel);
  // Note: the opponent has no timer of his own here, so he answers only a drawn revolver.
  late.mind.opponent.drawAt = Infinity;
  for (let t = 0; t < 2.2; t += TICK) late.step(TICK);
  assert.equal(late.draws.player, null, 'nothing is drawn until the right-click');
  const at = late.time;
  assert.equal(late.draw('player'), true, 'the right-click starts the draw');
  assert.equal(late.draw('player'), false, 'once');
  assert.equal(late.draws.player, at, 'the draw begins at the click, whenever that is');
  assert.equal(late.view().player, 'drawing');
  assert.equal(late.cocked, true, 'the revolver is cocked as it comes out');
  const planned = late.mind.opponent.drawAt;
  assert.ok(planned > at && planned <= at + 1.8 + 1e-9, 'the opponent answers the draw that began, within his reflex');
  while (late.draws.opponent === null && late.time < at + 5) late.step(0.05);
  assert.notEqual(late.draws.opponent, null, 'and he does');
  assert.equal(late.firstDraw, 'player');
  // Note: the opponent is held back here, so the sights settle onto the mouse undisturbed.
  const held = new DuelSim(duel);
  held.auto.opponent = false;
  held.draw('player');
  const gap = () => Math.hypot(held.sights.lateral - held.aim.lateral, held.sights.height - held.aim.height);
  assert.ok(gap() > 0.5, 'the sights start low in the holster');
  for (let i = 0; i < 3; i++) held.step(1);
  assert.ok(gap() < 0.05, 'and settle onto the mouse after the draw');
});

// Note: section "223-aiming".

const fixtureSpec = (seed) => ready(seed).duelBegin().duel;
// Note: item 354 drops a man hit in the body; the tests of firing and stopping keep him standing with this fall table, as a saved spec may carry one.
const STANDING = { medium: 9, light: 0, arm: 0 };
const standing = (seed) => ({ ...fixtureSpec(seed), fall: STANDING });
// Note: a standing target; the opponent never draws or fires, so only the player's own handling is measured.
const target = (spec) => {
  const sim = new DuelSim(spec);
  sim.auto.opponent = false;
  return sim;
};
function shot(seed, lateral, height, settle = 3) {
  const sim = target(fixtureSpec(seed));
  sim.draw('player');
  for (let t = 0; t < settle; t += 0.05) { sim.aimed(lateral, height); sim.step(0.05); }
  return sim.fire('player');
}

test('223-aiming: the player aims the revolver; where it points decides what it can hit', () => {
  const tally = (lateral, height) => {
    const hits = Array.from({ length: 12 }, (_, i) => shot(`acc-aim-${i}`, lateral, height)).filter((r) => r.ok && r.hit);
    const regions = {};
    for (const r of hits) regions[r.hit] = (regions[r.hit] ?? 0) + 1;
    return { hits: hits.length, regions };
  };
  const chest = tally(0, 1.25);
  const wide = tally(3, 1.25);
  const legs = tally(0, 0.4);
  const head = tally(0, 1.65);
  assert.ok(chest.hits >= 2, `aimed at the body it hits (${chest.hits})`);
  assert.equal(wide.hits, 0, 'aimed three metres wide it never hits');
  assert.ok(legs.hits >= 2 && legs.regions.leg >= legs.hits * 0.9 && !legs.regions.head && !legs.regions.chest, `aimed low it wounds legs: ${JSON.stringify(legs.regions)}`);
  assert.ok((chest.regions.chest || 0) + (chest.regions.abdomen || 0) >= chest.hits * 0.6, `aimed at the trunk: ${JSON.stringify(chest.regions)}`);
  assert.ok(head.regions.head >= 1 && !head.regions.leg, `aimed high it can hit the head: ${JSON.stringify(head.regions)}`);
});

test('223-aiming: the sight is clamped, bad input is ignored, and turning the aim costs steadiness and accuracy', () => {
  const sim = new DuelSim(fixtureSpec('acc-aim-clamp'));
  // Note: the aim square is lateral -1..1 and height 0.25..2.25 around the neutral aim.
  sim.aimed(99, -5);
  assert.deepEqual(sim.aim, { lateral: 1, height: 0.25 });
  sim.aimed(-99, 99);
  assert.deepEqual(sim.aim, { lateral: -1, height: 2.25 });
  sim.aimed(NaN, 1);
  sim.aimed(0, Infinity);
  assert.deepEqual(sim.aim, { lateral: -1, height: 2.25 }, 'not-a-number input changes nothing');
  const steady = target(fixtureSpec('acc-aim-hold'));
  steady.draw('player');
  for (let i = 0; i < 60; i++) { steady.aimed(0, 1.25); steady.step(0.05); }
  assert.ok(steady.player.hold > 0.9, 'a still hand steadies');
  steady.aimed(0.05, 1.25);
  assert.ok(steady.player.hold > 0.9, 'a hair\'s breadth does not');
  steady.aimed(2, 0.8);
  assert.equal(steady.player.hold, 0, 'a real turn does');
  const specs = Array.from({ length: 30 }, (_, i) => fixtureSpec(`acc-aim-steady-${i}`));
  const hitsAfter = (jolt) => specs.map((spec) => {
    const s = target(spec);
    s.draw('player');
    for (let t = 0; t < 3; t += 0.05) { s.aimed(0, 1.25); s.step(0.05); }
    jolt(s);
    return s.fire('player');
  }).filter((r) => r.ok && r.hit).length;
  const held = hitsAfter(() => {});
  // Note: a turn leaves the mouse off the sights, and the sights lag behind it, so the rings are apart when the shot goes.
  const turned = hitsAfter((s) => { s.aimed(0.6, 1.25); s.step(0.05); });
  assert.ok(held > turned * 1.3, `a steady aim hits more often: ${held} against ${turned}`);
});

test('223-aiming: the aim follows the mouse with a sway that settles, and skill, wounds and fatigue change it while the hit model stays the same', () => {
  const sim = target(fixtureSpec('acc-aim-sway'));
  sim.draw('player');
  sim.aimed(1, 1.5);
  const offsets = [];
  for (let t = 0; t < 8; t += TICK) {
    sim.step(TICK);
    offsets.push({ t: sim.time, lateral: Math.abs(sim.point().lateral - 1) });
  }
  const worst = (from, to) => Math.max(...some(offsets.filter((o) => o.t > from && o.t <= to), 'sample').map((o) => o.lateral));
  assert.ok(worst(0, 1.4) > 3 * worst(6, 8), 'the sway settles');
  assert.deepEqual(sim.aim, { lateral: 1, height: 1.5 }, 'the mouse alone sets the aim');
  const floorOf = (patch) => new DuelSim({ ...fixtureSpec('acc-aim-sway'), initial: { ...fixtureSpec('acc-aim-sway').initial, player: { ...fixtureSpec('acc-aim-sway').initial.player, ...patch } } }).swayOf();
  const base = floorOf({});
  assert.ok(floorOf({ skill: { precision: 0.95, toughness: 0.5, awareness: 0.95 } }).floor < base.floor, 'skill');
  assert.ok(floorOf({ injuries: [{ region: 'arm', side: 1, severity: 0.7, healed: 0, lasting: null, treated: false, ageMin: 0 }] }).floor > base.floor, 'wounds');
  assert.ok(floorOf({ fatigue: 0.9 }).floor > base.floor, 'fatigue');
  assert.ok(floorOf({ intoxication: 1 }).floor > base.floor, 'drink, which is 0 until prototype 4');
  assert.equal(fixtureSpec('acc-aim-sway').initial.player.intoxication, 0);
});

// Note: section "223-firing".

test('223-firing: the revolver cannot be fired before it is drawn, fires one round per shot, and empties, reloads and wounds', () => {
  const spec = fixtureSpec('acc-fire');
  const sim = target(spec);
  assert.deepEqual(sim.fire('player'), { ok: false, reason: 'holstered' });
  assert.equal(sim.draw('player'), true);
  assert.deepEqual(sim.fire('player'), { ok: false, reason: 'drawing' });
  for (let t = 0; t < 0.6; t += 0.05) sim.step(0.05);
  const loaded = spec.initial.loaded;
  assert.equal(sim.view().loaded, loaded);
  sim.aimed(3, 1.25);
  // Note: the sights settle on the mouse, three metres off the foe, so every shot misses and the exchange goes on.
  for (let t = 0; t < 3; t += 0.05) sim.step(0.05);
  const trail = [];
  for (let guard = 0; guard < 400 && sim.view().loaded > 0 && !sim.done; guard++) {
    sim.step(0.05);
    sim.cock();
    const r = sim.fire('player');
    trail.push({ r, left: sim.view().loaded, rounds: sim.roundsFired });
  }
  const shots = some(trail.filter((entry) => entry.r.ok), 'shot fired');
  shots.forEach((entry, k) => {
    assert.equal(entry.left, loaded - (k + 1), 'one round leaves the cylinder');
    assert.equal(entry.rounds, k + 1);
  });
  assert.equal(shots.length, loaded, 'every loaded round was fired, and no more');
  assert.ok(trail.some((entry) => !entry.r.ok), 'a shot is refused while the hammer is down');
  assert.equal(sim.fire('player').ok, false, 'an empty revolver does not fire');
  // Note: the target never shoots back, so the exchange is still on while the empty revolver is reloaded.
  assert.equal(sim.done, false);
  assert.equal(sim.reloadWeapon('player'), true);
  assert.equal(sim.view().reloading, true);
  for (let t = 0; t < 30 && sim.view().reloading && !sim.done; t += 0.05) sim.step(0.05);
  assert.equal(sim.done, false);
  assert.equal(sim.view().loaded, Math.min(WEAPONS.colt73.cap, spec.initial.reserve), 'the cylinder is filled from the reserve');
  assert.equal(sim.view().reserve, spec.initial.reserve - sim.view().loaded);
  // Note: a hit becomes a wound on the target, with its region, and a finished duel refuses further shots.
  const struck = Array.from({ length: 15 }, (_, i) => {
    const s = target(fixtureSpec(`acc-fire-hit-${i}`));
    s.draw('player');
    for (let t = 0; t < 2; t += 0.05) { s.aimed(0, 1.25); s.step(0.05); }
    return { s, r: s.fire('player') };
  }).filter(({ r }) => r.ok && r.hit);
  some(struck, 'shot that hit').forEach(({ s, r }) => {
    assert.ok(s.opponent.wounds.some((w) => w.region === r.hit && !w.old), 'the wound is on the man hit');
    assert.equal(s.view().lastEvent.hit, r.hit);
  });
  assert.ok(struck.length >= 2);
  const over = target(fixtureSpec('acc-fire-over'));
  over.draw('player');
  for (let t = 0; t < 2; t += 0.05) over.step(0.05);
  over.aimed(3, 1.25);
  over.done = true;
  assert.deepEqual(over.fire('player'), { ok: false, reason: 'holstered' }, 'a finished exchange refuses a shot, though the man could shoot');
  over.done = false;
  assert.equal(over.fire('player').ok, true, 'the same man shoots while it is on');
  // Note: the opponent fires back with his own rounds.
  const returned = Array.from({ length: 12 }, (_, i) => play(fixtureSpec(`acc-fire-back-${i}`), { drawAt: 0, aim: [3, 1.25], limit: 20 })).filter((s) => s.opponentRoundsFired > 0).length;
  assert.ok(returned >= 9, `the opponent shoots back (${returned} of 12)`);
});

test('223-firing: the revolver is cocked in the draw, each later shot needs its own cock that takes time and shakes the aim, and fanning is fast and wide', () => {
  const sim = target(standing('acc-fire-cock'));
  sim.draw('player');
  for (let t = 0; t < 1; t += TICK) sim.step(TICK);
  sim.aimed(3, 1.25);
  assert.equal(sim.fire('player').ok, true, 'cocked in the draw, so the first shot needs nothing');
  for (let t = 0; t < 1; t += TICK) sim.step(TICK);
  assert.deepEqual(sim.fire('player'), { ok: false, reason: 'uncocked' }, 'the next one needs a cock');
  assert.equal(sim.cock(), true);
  assert.equal(sim.fire('player').reason, 'cocking', 'which takes time');
  for (let t = 0; t < 0.5; t += TICK) sim.step(TICK);
  assert.equal(sim.fire('player').ok, true);
  assert.equal(sim.roundsFired, 2, 'one round per shot');
  const fan = target(standing('acc-fire-fan'));
  fan.draw('player');
  for (let t = 0; t < 1; t += TICK) fan.step(TICK);
  fan.aimed(0, 1.25);
  const fanned = [];
  for (let i = 0; i < 4; i++) {
    fanned.push(fan.fire('player', { fan: true }));
    for (let t = 0; t < FAN_PAUSE; t += TICK) fan.step(TICK);
  }
  assert.deepEqual(fanned.map((r) => r.ok), [true, true, true, true], 'four shots with no cock, a few tenths of a second apart');
  assert.ok(fan.time < 1 + 4 * 0.45, 'faster than the revolver cycles when aimed');
});

// Note: section "223-cues".

test('223-cues: the opponent\'s hand drifts to the holster before many draws, but a cue is neither a promise nor required', () => {
  const duel = ready('acc-cues').duelBegin().duel;
  const WINDOW = 1.2;
  const total = { hand: 0, handDraw: 0, handBluff: 0, shift: 0 };
  for (const personality of ['proud', 'volatile', 'cautious']) {
    const runs = Array.from({ length: 20 }, (_, i) => {
      const sim = new DuelSim({ ...duel, initial: { ...duel.initial, seed: i + 1, opponent: { ...duel.initial.opponent, personality, stance: 'neutral' } } });
      const frames = [{ time: 0, cue: false, kind: null, opponent: 'holstered' }];
      while (sim.draws.opponent === null && sim.time < 90) {
        sim.step(0.05);
        const v = sim.view();
        frames.push({ time: sim.time, cue: v.cue, kind: v.cueKind, opponent: v.opponent });
      }
      const raised = frames.filter((frame, k) => frame.cue && !frames[k - 1].cue);
      return { drew: sim.draws.opponent, cued: frames.filter((frame) => frame.cue), hands: frames.filter((frame) => frame.cue && frame.kind === 'hand').map((frame) => frame.time), raised };
    });
    some(runs.flatMap(({ cued }) => cued), 'frame with a cue').forEach((frame) => assert.equal(frame.opponent, 'holstered', 'a cue is shown only while the revolver is holstered'));
    const told = runs.filter(({ drew, hands }) => hands.some((time) => drew - time <= WINDOW && drew - time > 0)).length;
    const handGaps = runs.flatMap(({ drew, raised }) => raised.filter((frame) => frame.kind === 'hand').map((frame) => drew - frame.time));
    total.hand += handGaps.length;
    total.handDraw += handGaps.filter((gap) => gap <= WINDOW).length;
    total.handBluff += handGaps.filter((gap) => gap > WINDOW).length;
    total.shift += runs.flatMap(({ raised }) => raised.filter((frame) => frame.kind !== 'hand')).length;
    assert.ok(told >= runs.length * 0.45, `${personality}: a hand at the holster shows before ${told} of ${runs.length} draws, so the cue means something`);
    assert.ok(told <= runs.length * 0.93, `${personality}: but ${runs.length - told} of ${runs.length} draws came with no such warning`);
  }
  assert.ok(total.handDraw > 4, `a hand toward the holster often comes before the draw (${total.handDraw})`);
  assert.ok(total.handBluff > 4, `and is often a bluff (${total.handBluff})`);
  assert.ok(total.shift > 4, `some movements are innocent (${total.shift})`);
  assert.ok(total.handDraw / total.hand < 0.9, 'a cue never guarantees the draw');
  assert.ok(total.handDraw / total.hand > 0.1, 'but it does raise the chance');
});

// Note: section "223-exchange-continuation-end".

const withOpponent = (spec, over) => ({ ...spec, initial: { ...spec.initial, opponent: { ...spec.initial.opponent, ...over } } });

test('223-exchange-continuation-end: a miss or a light hit leaves the exchange open; only a man down ends it by itself', () => {
  // Note: even seeds aim three metres wide, odd seeds aim at the legs; every tick of every exchange is recorded and read afterwards.
  const exchanges = (aim, parity) => Array.from({ length: 15 }, (_, k) => {
    // Note: item 354 drops almost every man hit in the body or the legs; this test is about the hits that leave him standing, so the fall table keeps him up (STANDING).
    const spec = { ...fixtureSpec(`acc-end-${2 * k + parity}`), fall: STANDING };
    const trace = [];
    const sim = play(spec, {
      aim,
      limit: 15,
      onTick: (s) => trace.push({ done: s.done, bothUp: s.player.status === 'ok' && s.opponent.status === 'ok', rounds: s.roundsFired, hurt: s.opponent.wounds.some((w) => !w.old) }),
    });
    return { spec, trace, sim };
  });
  const wide = exchanges([3, 1.25], 0);
  const low = exchanges([0, 0.4], 1);
  const all = [...wide, ...low];
  some(all.flatMap(({ trace }) => trace.filter((tick) => !tick.bothUp)), 'tick with a man down').forEach((tick) => assert.equal(tick.done, true, 'a man down ends the exchange at once'));
  some(all.flatMap(({ spec, trace }) => trace.filter((tick) => tick.bothUp && tick.rounds >= 1 && tick.rounds < spec.initial.loaded)), 'tick after a shot with both men up').forEach((tick) => assert.equal(tick.done, false, 'a shot fired, nobody down: the exchange goes on'));
  const longMiss = wide.filter(({ sim }) => sim.roundsFired >= 3).length;
  const struck = low.map((run) => ({ ...run, first: run.trace.find((tick) => tick.bothUp && tick.hurt) })).filter((run) => run.first);
  some(struck, 'light hit').forEach((run) => assert.equal(run.first.done, false, 'a light hit does not end it'));
  const lightHits = struck.length;
  const lightContinued = struck.filter((run) => run.sim.roundsFired > run.first.rounds).length;
  const downed = some(all.filter(({ sim }) => sim.player.status !== 'ok' || sim.opponent.status !== 'ok'), 'exchange ended by a man down');
  downed.forEach(({ sim }) => {
    assert.equal(sim.done, true);
    const time = sim.time;
    sim.step(1);
    assert.equal(sim.time, time, 'a finished exchange does not run on');
    assert.equal(sim.fire('player').ok, false);
  });
  const down = downed.length;
  assert.ok(longMiss >= 8, `misses go on to further shots (${longMiss})`);
  assert.ok(lightHits >= 3 && lightContinued >= 2, `light hits (${lightHits}) are followed by more shooting (${lightContinued})`);
  assert.ok(down >= 7, `some exchanges end with a man down (${down})`);
});

test('223-exchange-continuation-end: surrender or a request to stop may end it, or may not, and a stopped exchange settles in the campaign', () => {
  const open = Array.from({ length: 60 }, (_, i) => {
    const spec = withOpponent(fixtureSpec(`acc-stop-${i}`), { personality: 'volatile', stance: 'grudge' });
    const sim = new DuelSim(spec);
    sim.draw('player');
    sim.aimed(3, 1.25);
    assert.equal(sim.stopFighting(true), false, 'nothing to stop before a shot is fired');
    for (let t = 0; t < 40 && sim.firstShot === null && !sim.done; t += 0.05) sim.step(0.05);
    return { i, sim };
  }).filter(({ sim }) => !sim.done && sim.player.status === 'ok');
  // Note: even seeds fire once more and then ask to stop too soon; odd seeds surrender at once.
  const early = open.filter(({ i }) => i % 2 === 0).map(({ sim }) => ({ sim, shot: sim.fire('player') })).filter(({ shot }) => shot.ok);
  assert.ok(early.length > 0, 'some exchanges let the player fire once more');
  early.forEach(({ sim }) => assert.equal(sim.stopFighting(false), false, 'a request to stop needs a second of quiet after the last shot'));
  const tooSoon = early.length;
  const answers = open.filter(({ i }) => i % 2 !== 0).map(({ sim }) => ({ sim, result: sim.stopFighting(true) }));
  const asked = answers.length;
  assert.ok(asked > 0, 'some exchanges are still open for a surrender');
  answers.forEach(({ sim }) => {
    assert.equal(sim.surrendered, true);
    assert.equal(sim.fire('player').ok, false, 'a man who has given up does not fire');
  });
  const accepted = answers.filter(({ result }) => result);
  assert.ok(accepted.length > 0, 'some surrenders are accepted');
  accepted.forEach(({ sim }) => assert.equal(sim.done, true));
  const ended = accepted.length;
  const declined = answers.filter(({ result }) => !result);
  assert.ok(declined.length > 0, 'some surrenders are refused');
  declined.forEach(({ sim }) => assert.equal(sim.done, false, 'the surrender was not accepted, the exchange is open'));
  const refused = declined.length;
  const kept = declined.filter(({ sim }) => {
    const before = sim.opponentRoundsFired;
    for (let t = 0; t < 4 && !sim.done; t += 0.05) sim.step(0.05);
    return sim.opponentRoundsFired > before;
  }).length;
  assert.ok(ended >= 7, `a surrender can end it (${ended} of ${asked})`);
  assert.ok(refused >= 3, `a surrender can be refused (${refused} of ${asked})`);
  assert.ok(kept >= 2, `and the opponent then goes on shooting (${kept})`);
  assert.ok(tooSoon >= 2);
  // Note: a man who has dropped his revolver cannot refuse a surrender; and a stop is settled by the campaign like any other result.
  const game = ready('acc-stop-settle');
  const spec = game.duelBegin().duel;
  const sim = target(spec);
  sim.draw('player');
  sim.aimed(3, 1.25);
  for (let t = 0; t < 3; t += 0.05) sim.step(0.05);
  assert.equal(sim.fire('player').ok, true);
  sim.opponent.status = 'ok';
  sim.weaponHeld.opponent = false;
  sim.step(1);
  sim.step(0.2);
  assert.equal(sim.stopFighting(false), true, 'nobody on the other side is armed');
  const report = sim.report();
  assert.equal(report.playerStatus, 'stopped');
  assert.equal(report.opponentStatus, 'stopped');
  const result = game.duelFinish({ ...report, firstDraw: 'player', firstShot: 'player', opponentRoundsFired: 0, opponentWeaponHeld: false, opponentLostLoaded: 2 });
  assert.equal(result.ok, true);
  assert.ok(!game.state.duel, 'the duel is closed');
});

test('223-exchange-continuation-end: a refused surrender or request to stop is not rolled again until the opponent has had time to answer', () => {
  const quiet = (seed) => {
    const sim = target(fixtureSpec(seed));
    sim.draw('player');
    sim.aimed(1, 2.25); // Note: the top of the aim square, above the foe's head, so the shot misses.
    for (let s = 0; s < 3; s++) sim.step(1); // Note: a step is at most a second, so three let the sights settle.
    assert.equal(sim.fire('player').ok, true);
    sim.step(1.2);
    return sim;
  };
  const sim = quiet('acc-stop-retry');
  const rolls = [];
  sim.random.chance = () => { rolls.push('refuse'); return false; };
  assert.equal(sim.stopFighting(true), false);
  sim.random.chance = () => { rolls.push('accept'); return true; };
  for (let press = 0; press < 20; press++) assert.equal(sim.stopFighting(press % 2 === 0), false, `press ${press} at the same instant`);
  assert.deepEqual(rolls, ['refuse'], 'the opponent is asked once, not on every press');
  sim.step(1);
  sim.step(0.4);
  assert.equal(sim.stopFighting(true), false, 'still inside the pause');
  assert.equal(sim.done, false);
  sim.step(0.2);
  assert.equal(sim.stopFighting(true), true, 'after the pause the opponent may answer again');
  assert.equal(sim.done, true);
  assert.deepEqual(rolls, ['refuse', 'accept']);
  // Note: with the real dice, a surrender that was refused stays open however often it is pressed at once.
  const sims = Array.from({ length: 20 }, (_, i) => {
    const spec = withOpponent(fixtureSpec(`acc-stop-retry-${i}`), { personality: 'volatile', stance: 'grudge' });
    const one = target(spec);
    one.draw('player');
    one.aimed(1, 2.25); // Note: above the foe's head, so the shot misses.
    for (let s = 0; s < 3; s++) one.step(1);
    one.fire('player');
    one.step(1.2);
    return { one, first: one.stopFighting(true) };
  });
  const refused = sims.filter(({ first }) => !first);
  assert.ok(refused.length >= 2, `some surrenders are refused (${refused.length} of ${sims.length})`);
  refused.forEach(({ one }) => {
    for (let press = 0; press < 20; press++) one.stopFighting(true);
    assert.equal(one.done, false, 'twenty more presses at the same instant do not wear the opponent down');
  });
});

// Note: a drawn, cocked and settled sheriff whose opponent has just gone down alive.
const downed = (spec) => {
  const sim = target(spec);
  sim.draw('player');
  sim.aimed(0, 0.3);
  for (let s = 0; s < 3; s++) sim.step(1);
  sim.firstShot = 'player';
  sim.opponent.status = 'incapacitated';
  sim.checkEnd();
  return sim;
};

test('356: when the opponent falls the sheriff left standing chooses to finish him or walk away, never by firing; a fallen sheriff or a watched duel ends at once', () => {
  const sim = downed(fixtureSpec('acc-finish'));
  assert.equal(sim.done, false, 'the fall ends the fight, but the winner may still finish him');
  assert.equal(sim.view().finishing, true);
  assert.equal(sim.fire('player').ok, false, 'firing does not decide it');
  assert.equal(sim.finishOff(), true, 'finishing him is a choice');
  assert.equal(sim.done, true, 'the finished man is dead and the duel over');
  assert.equal(sim.standDown(), false, 'there is nothing left to walk away from');
  assert.deepEqual(sim.report().finish, { shots: 1, hits: 1, killed: true });
  assert.equal(sim.opponent.status, 'dead');
  const spared = downed(fixtureSpec('acc-finish-bled'));
  assert.equal(spared.opponent.wounds.some((w) => w.fatal), false, 'on this seed the fallen man is not plainly dying');
  assert.equal(spared.standDown(), true, 'walking away ends the duel');
  assert.deepEqual({ done: spared.done, finish: spared.report().finish }, { done: true, finish: { shots: 0, hits: 0, killed: false } });
  const watched = new DuelSim({ ...fixtureSpec('acc-finish-watch'), watch: true });
  watched.opponent.status = 'incapacitated';
  watched.checkEnd();
  assert.equal(watched.done, true, 'nobody finishes a man in a watched duel');
  const fallen = target(fixtureSpec('acc-finish-sheriff'));
  fallen.player.status = 'incapacitated';
  fallen.checkEnd();
  assert.equal(fallen.done, true, 'a fallen sheriff ends the duel at once');
  // Note: no choice yet, then the fallen man dies of the wound that dropped him: the death ends the duel and is no finishing shot.
  const bled = downed(fixtureSpec('acc-finish-bled'));
  assert.equal(bled.stopFighting(true), false, 'there is nobody standing to surrender to');
  bled.opponent.status = 'dead';
  bled.checkEnd();
  assert.deepEqual({ done: bled.done, finish: bled.report().finish }, { done: true, finish: { shots: 0, hits: 0, killed: false } });
  // Note: a finish he cannot fire is refused and leaves the choice open.
  const dry = downed(fixtureSpec('acc-finish-dry'));
  dry.player.weapons[0].loaded = 0;
  dry.player.ammo[dry.player.weapons[0].ammoType] = 0;
  assert.deepEqual({ finished: dry.finishOff(), done: dry.done, finishing: dry.finishing }, { finished: false, done: false, finishing: true });
});

test('359: witnesses judge a shot at a fallen duelist like an unprovoked wounding shot, and more when it kills; without witnesses nothing follows', () => {
  const duel = { witnesses: true, threatened: true };
  const base = { firstDraw: 'opponent', firstShot: 'opponent', playerStatus: 'stopped', opponentStatus: 'incapacitated' };
  const names = { name: 'Garrity', opponentName: 'Lyle', died: false, cents: 2000 };
  const fair = judge(duel, { ...base, finish: { shots: 0, hits: 0, killed: false } }, names);
  assert.equal(fair.verdict, 'self-defence');
  assert.equal(fair.reputation, 1);
  // Note: the finishing shot is judged on top of the exchange, so the praise for self-defence is kept and the penalty added.
  const wounded = judge(duel, { ...base, finish: { shots: 2, hits: 1, killed: false } }, names);
  assert.deepEqual({ fine: wounded.fine, reputation: wounded.reputation, verdict: wounded.verdict, exchange: wounded.exchange }, { fine: 500, reputation: -2, verdict: 'finishing-shot', exchange: 'self-defence' });
  assert.match(wounded.account, /fired on Lyle as he lay\./);
  const killed = judge(duel, { ...base, opponentStatus: 'dead', finish: { shots: 1, hits: 1, killed: true } }, { ...names, opponentDied: true });
  assert.deepEqual({ fine: killed.fine, reputation: killed.reputation, verdict: killed.verdict }, { fine: 1000, reputation: -4, verdict: 'finished' });
  const both = judge({ ...duel, threatened: false }, { ...base, firstDraw: 'player', firstShot: 'player', finish: { shots: 1, hits: 1, killed: false } }, names);
  assert.deepEqual({ fine: both.fine, reputation: both.reputation, exchange: both.exchange }, { fine: 1000, reputation: -6, exchange: 'unprovoked' }, 'an unprovoked duel and a finishing shot both count');
  assert.match(killed.account, /as he lay and killed him\./);
  assert.equal(judge(duel, { ...base, finish: { shots: 1, hits: 1, killed: false } }, { ...names, cents: 120 }).fine, 120, 'the fine never exceeds the cash');
  assert.deepEqual(judge({ ...duel, witnesses: false }, { ...base, finish: { shots: 1, hits: 1, killed: true } }, names), { fine: 0, reputation: 0, verdict: 'unwitnessed', account: 'Nobody saw the duel.' });
});

test('359: the campaign settles a finishing shot once, and refuses a report whose finishing shots it could not have fired', () => {
  const game = ready('acc-finish-settle');
  const spec = game.duelBegin().duel;
  game.state.duel.witnesses = true;
  const sim = downed(spec);
  assert.equal(sim.finishOff(), true);
  const report = { ...sim.report(), firstDraw: 'player' };
  const living = { opponentStatus: 'incapacitated', opponentWounds: [{ region: 'leg', side: 0, severity: 0.5, fatal: false }] };
  assert.equal(game.duelFinish({ ...report, finish: { shots: 9, hits: 0, killed: false } }).ok, false, 'more finishing shots than rounds fired');
  assert.equal(game.duelFinish({ ...report, opponentStatus: 'stopped', opponentWounds: [] }).ok, false, 'a finishing shot at a man who never fell');
  assert.equal(game.duelFinish({ ...report, finish: { shots: 1, hits: 0, killed: true } }).ok, false, 'a kill by a finishing shot that hit nobody');
  assert.equal(game.duelFinish({ ...report, ...living }).ok, false, 'a kill while the fallen man lives with no fatal wound');
  game.state.rep.sheriff = 50;
  const result = game.duelFinish(report);
  assert.deepEqual({ ok: result.ok, verdict: result.verdict, opponentDied: result.opponentDied }, { ok: true, verdict: 'finished', opponentDied: true });
  assert.equal(game.state.rep.sheriff, 50 + result.reputation, 'the verdict is applied once');
  assert.ok(result.reputation <= -4, 'the witnessed killing of a fallen man costs reputation');
  assert.equal(game.duelFinish(report).ok, false, 'and is not settled twice');
});

test('223-exchange-continuation-end: when both revolvers are empty the exchange ends on its own', () => {
  const ended = Array.from({ length: 15 }, (_, i) => {
    const base = fixtureSpec(`acc-spent-${i}`);
    const spec = withOpponent({ ...base, initial: { ...base.initial, loaded: 1, reserve: 0 } }, { loaded: 1, reserve: 0 });
    return play(spec, { aim: [3, 1.25], limit: 120 });
  }).filter((sim) => sim.player.status === 'ok' && sim.opponent.status === 'ok');
  some(ended, 'exchange ended by empty guns').forEach((sim) => {
    assert.equal(sim.done, true, 'two empty guns end it');
    assert.equal(sim.roundsFired, 1);
    assert.equal(sim.opponentRoundsFired, 1);
    assert.ok(sim.time < 60);
  });
  const spent = ended.length;
  assert.ok(spent >= 2, `exchanges ended by empty guns (${spent})`);
});

// Note: section "shared helpers for the consequences".

const REPORT = { seconds: 20, roundsFired: 1, opponentRoundsFired: 1, playerStatus: 'stopped', opponentStatus: 'stopped', firstDraw: 'opponent', firstShot: 'opponent', wounds: [] };
const fatal = (region = 'chest') => [{ region, severity: 1, fatal: true }];
const COLT = { id: 'colt73', ammoType: '45colt' };

// Note: a played exchange the way the screen runs it, reported to the campaign.
function exchange(game, opts, fall = undefined) {
  const spec = { ...game.duelBegin().duel, fall };
  const sim = play(spec, opts);
  assert.equal(sim.done, true, 'the exchange finished');
  return { spec, sim, report: sim.report() };
}

// Note: section "223-shared-ammo".

test('223-shared-ammo: the cylinder and the carried reserve come from the one shared pool and leave it by exactly the rounds fired', () => {
  const allocation = (pool, loadedIn) => {
    const game = saloon(`acc-ammo-${pool}-${loadedIn}`);
    const colt = sheriffOf(game).loadout.find((w) => w.id === 'colt73');
    colt.loaded = loadedIn ?? colt.loaded;
    game.state.ammo['45colt'] = pool;
    assert.equal(game.duelChallenge(sheriffOf(game).id, 'insult').ok, true);
    game.duelPersuade('explain');
    return game.duelBegin().duel.initial;
  };
  assert.deepEqual([allocation(4).loaded, allocation(4).reserve], [4, 0], 'four rounds in the pool are all there is');
  assert.deepEqual([allocation(100).loaded, allocation(100).reserve], [WEAPONS.colt73.cap, RESERVE_CAP], 'a full cylinder and the reserve cap');
  assert.deepEqual([allocation(100, 2).loaded, allocation(100, 2).reserve], [2, RESERVE_CAP], 'a half-loaded cylinder starts half loaded');
  assert.deepEqual([allocation(9).loaded, allocation(9).reserve], [6, 3]);
  // Note: the rule under test, stated independently of the code: a dead man's rounds come back only after a win (item 215, the scene rule), and the winner is the man left standing at the first fall (item 356, report.winner); so a man who dies without winning takes everything he carried, and any other man loses what he fired.
  const dead = (status, wounds) => status === 'dead' || wounds.some((w) => w.fatal);
  const runs = Array.from({ length: 20 }, (_, i) => {
    const game = ready(`acc-ammo-run-${i}`);
    const pool = game.state.ammo['45colt'];
    const gunslinger = game.state.gunslingers[0];
    const stock = gunslinger.ammunition;
    const { spec, sim, report } = exchange(game, { aim: [0, [1.25, 0.4][i % 2]] });
    const playerLost = dead(report.playerStatus, report.wounds) && report.winner !== 'player';
    const strangerLost = dead(report.opponentStatus, report.opponentWounds) && report.winner !== 'opponent';
    return { game, pool, gunslinger, stock, spec, sim, report, playerLost, strangerLost };
  }).filter(({ report }) => report.weaponHeld && report.opponentWeaponHeld);
  some(runs, 'exchange with both revolvers held').forEach(({ game, report }) => assert.equal(game.duelFinish(report).ok, true));
  const carried = (side) => side.loaded + side.reserve;
  some(runs.filter((run) => run.playerLost), 'sheriff who died with his rounds').forEach((run) => assert.equal(run.game.state.ammo['45colt'], run.pool - carried(run.spec.initial), 'the pool lost what the sheriff carried'));
  some(runs.filter((run) => !run.playerLost), 'sheriff who lived').forEach((run) => assert.equal(run.game.state.ammo['45colt'], run.pool - run.sim.roundsFired, 'the pool lost what the sheriff fired'));
  some(runs.filter((run) => run.strangerLost), 'stranger who died with his rounds').forEach((run) => assert.equal(run.gunslinger.ammunition, run.stock - carried(run.spec.initial.opponent), 'and the stranger lost all he carried'));
  some(runs.filter((run) => !run.strangerLost), 'stranger who lived').forEach((run) => assert.equal(run.gunslinger.ammunition, run.stock - run.sim.opponentRoundsFired, 'and the stranger lost what he fired'));
  const carriedOff = runs.filter((run) => run.playerLost || run.strangerLost).length;
  const kept = runs.length - carriedOff;
  // Note: a gunslinger who picks a quarrel has often been drinking (item 346), so fewer exchanges end with nobody hurt than in Prototype 3.
  assert.ok(kept >= 3 && carriedOff >= 2, `${kept} plain exchanges, ${carriedOff} where a man died with his rounds`);
});

test('223-shared-ammo: a report cannot spend more than was allocated, ammunition that changed is refused, and a result settles once', () => {
  const early = ready('acc-ammo-early');
  assert.equal(early.duelFinish({ ...REPORT }).ok, false, 'no result before the exchange has begun');
  assert.ok(early.state.duel);
  const game = ready('acc-ammo-limits');
  game.state.gunslingers[0].ammunition = 100;
  const initial = game.duelBegin().duel.initial;
  const total = initial.loaded + initial.reserve;
  const pool = game.state.ammo['45colt'];
  const saved = game.save();
  assert.equal(game.duelFinish({ ...REPORT, roundsFired: total + 1 }).ok, false, 'more rounds than he carried');
  assert.equal(game.duelFinish({ ...REPORT, roundsFired: total - 1, lostLoaded: 2, weaponHeld: false }).ok, false, 'rounds fired and rounds lost together exceed what he carried');
  assert.equal(initial.opponent.loaded + initial.opponent.reserve, 6 + RESERVE_CAP, 'a rich stranger carries a cylinder and the reserve cap');
  assert.equal(game.duelFinish({ ...REPORT, opponentRoundsFired: initial.opponent.loaded + initial.opponent.reserve + 1 }).ok, false, 'the stranger cannot fire more than he carried either');
  assert.equal(game.save(), saved, 'a refused report leaves no trace');
  game.state.ammo['45colt'] = 0;
  assert.equal(game.duelFinish({ ...REPORT, roundsFired: 2 }).ok, false, 'the pool changed under the duel');
  game.state.ammo['45colt'] = pool;
  const first = game.duelFinish({ ...REPORT, roundsFired: 2 });
  assert.equal(first.ok, true);
  assert.equal(game.state.ammo['45colt'], pool - 2);
  assert.equal(game.duelFinish({ ...REPORT, roundsFired: 2 }).ok, false, 'a second result is refused');
  assert.equal(game.state.ammo['45colt'], pool - 2, 'and costs nothing');
});

test('223-shared-ammo: a man who dies takes what he carried with him, and a lost revolver takes its rounds and leaves the lender', () => {
  const dies = ready('acc-ammo-death', 1);
  const initial = dies.duelBegin().duel.initial;
  const pool = dies.state.ammo['45colt'];
  assert.equal(dies.duelFinish({ ...REPORT, playerStatus: 'dead', roundsFired: 1, wounds: fatal() }).ok, true);
  assert.equal(dies.state.ammo['45colt'], pool - initial.loaded - initial.reserve, 'everything he carried is gone');
  const game = ready('acc-ammo-borrowed');
  const [sheriff, deputy] = game.state.crew;
  game.state.duel = null;
  sheriff.loadout = sheriff.loadout.filter((w) => WEAPONS[w.id].kind !== 'handgun');
  deputy.loadout = [{ ...COLT, tag: 'lent' }, { id: 'winchester73', ammoType: '44-40' }].filter((w) => WEAPONS[w.id]);
  assert.equal(game.duelChallenge(sheriff.id, 'insult').ok, true);
  game.duelPersuade('explain');
  const spec = game.duelBegin().duel;
  assert.equal(spec.weapon.owner, deputy.id, 'the deputy lends his revolver');
  const before = game.state.ammo['45colt'];
  const result = game.duelFinish({ ...REPORT, roundsFired: 1, lostLoaded: 2, weaponHeld: false });
  assert.equal(result.ok, true);
  assert.equal(game.state.ammo['45colt'], before - 3, 'the round fired and the two in the dropped revolver');
  assert.ok(!deputy.loadout.some((w) => w.tag === 'lent'), 'the lender no longer has it');
  assert.ok(!sheriff.loadout.some((w) => w.tag === 'lent'));
});

// Note: section "223-wound".

test('223-wound: the wounds of an exchange become the same injury records as in any fight, on the right man, and last', () => {
  const keys = ['ageMin', 'healed', 'lasting', 'region', 'severity', 'side', 'treated'];
  const clamp = (w) => Math.min(1, Math.max(0.1, w.severity));
  const mortal = (wounds) => wounds.some((w) => w.fatal);
  // Note: most exchanges end in a death, so a fixed run of 40 is played and the survivable ones are kept.
  const survivors = Array.from({ length: 40 }, (_, i) => {
    const game = ready(`acc-wound-${i}`);
    const sheriff = sheriffOf(game);
    const gunslinger = game.state.gunslingers[0];
    const { report } = exchange(game, { aim: [0, [0.4, 0.8, 1.0, 1.25][i % 4]] });
    return { game, sheriff, gunslinger, report };
  }).filter(({ report }) => report.playerStatus !== 'dead' && !mortal(report.wounds) && report.opponentStatus !== 'dead' && !mortal(report.opponentWounds));
  assert.ok(survivors.length > 0, 'some exchanges are survivable');
  survivors.forEach(({ game, report }) => assert.equal(game.duelFinish(report).ok, true));
  const records = survivors.flatMap(({ sheriff, gunslinger }) => [...sheriff.injuries.map((w) => ({ w, who: 'an encounter wound' })), ...gunslinger.injuries.map((w) => ({ w, who: 'the stranger' }))]);
  assert.ok(records.length > 0, 'some exchange leaves a record');
  assert.ok(records.every(({ w }) => Object.keys(w).sort().join() === keys.join()), 'the same record as an encounter wound, for both men');
  survivors.forEach(({ game, sheriff, gunslinger }) => {
    const loaded = Campaign.load(game.save());
    assert.deepEqual(loaded.state.crew.find((c) => c.role === 'sheriff').injuries, sheriff.injuries, 'the wounds are saved');
    assert.deepEqual(loaded.state.gunslingers.find((g) => g.id === gunslinger.id).injuries, gunslinger.injuries);
  });
  // Note: a shot-down man with no reported wound is built here, as the played exchanges rarely end that way.
  const bare = ready('acc-wound-bare');
  bare.duelBegin();
  assert.equal(bare.duelFinish({ ...REPORT, playerStatus: 'incapacitated', wounds: [] }).ok, true);
  // Note: an aligned shot of the stranger goes where his sights rest, at the chest, so a sheriff who lives through it with a wound is built here too.
  const grazed = ready('acc-wound-grazed');
  grazed.duelBegin();
  const graze = [{ region: 'arm', side: 1, severity: 0.3, fatal: false }];
  assert.equal(grazed.duelFinish({ ...REPORT, wounds: graze }).ok, true);
  const sides = [...survivors.flatMap(({ sheriff, gunslinger, report }) => [
    { status: report.playerStatus, wounds: report.wounds, injuries: sheriff.injuries, label: 'exactly the wounds he took' },
    { status: report.opponentStatus, wounds: report.opponentWounds, injuries: gunslinger.injuries, label: 'and the stranger his' },
  ]), { status: 'incapacitated', wounds: [], injuries: sheriffOf(bare).injuries, label: 'a shot-down man with no reported wound' },
  { status: 'stopped', wounds: graze, injuries: sheriffOf(grazed).injuries, label: 'a sheriff grazed and still standing' }];
  const recorded = (side) => side.injuries.map((w) => [w.region, w.severity]).sort();
  const reported = (side) => side.wounds.map((w) => [w.region, clamp(w)]);
  some(sides.filter((side) => side.status === 'stopped'), 'man left standing').forEach((side) => assert.deepEqual(recorded(side), reported(side).sort(), side.label));
  // Note: a man put out of the fight carries a serious wound; the worst reported wound is raised to 0.6, or a chest wound of 0.6 is added when none was reported.
  some(sides.filter((side) => side.status !== 'stopped' && side.wounds.length === 0), 'man put out with no reported wound').forEach((side) => assert.deepEqual(recorded(side), [['chest', 0.6]], side.label));
  some(sides.filter((side) => side.status !== 'stopped' && side.wounds.length > 0), 'man put out with a reported wound').forEach((side) => {
    const list = reported(side);
    const worst = list.findIndex((x) => x[1] === Math.max(...list.map((y) => y[1])));
    list[worst] = [list[worst][0], Math.max(list[worst][1], 0.6)];
    assert.deepEqual(recorded(side), list.sort(), side.label);
  });
  const strangersHurt = survivors.filter(({ report }) => report.opponentWounds.length > 0).length;
  assert.ok(strangersHurt >= 1, `wounded strangers ${strangersHurt} in ${survivors.length} survivable exchanges`);
});

test('223-wound: a man put out of the fight carries at least a serious wound, takes the time and tires, and one who is merely wounded is not out', () => {
  const side = (who, over) => {
    const game = ready(`acc-wound-down-${who}`);
    const sheriff = sheriffOf(game);
    const gunslinger = game.state.gunslingers[0];
    game.duelBegin();
    const fatigue = sheriff.fatigue;
    const min = game.state.min;
    assert.equal(game.duelFinish({ ...REPORT, seconds: 121, ...over }).ok, true);
    assert.equal(game.state.min - min, 3, 'a hundred and twenty-one seconds are three minutes');
    assert.ok(sheriff.fatigue > fatigue, 'the fight tired him');
    return { sheriff, gunslinger };
  };
  const player = side('player', { playerStatus: 'incapacitated', wounds: [] });
  assert.ok(player.sheriff.injuries.some((w) => w.severity >= 0.6), 'shot down: a serious wound');
  assert.equal(player.gunslinger.injuries.length, 0);
  const opponent = side('opponent', { opponentStatus: 'incapacitated', opponentWounds: [] });
  assert.ok(opponent.gunslinger.injuries.some((w) => w.severity >= 0.6), 'the stranger shot down: a serious wound');
  assert.equal(opponent.sheriff.injuries.length, 0);
  // Note: a light wound with the man still up is only that.
  const game = ready('acc-wound-light');
  game.duelBegin();
  game.duelFinish({ ...REPORT, wounds: [{ region: 'arm', side: 'right', severity: 0.2 }, { region: 'leg', severity: 0 }] });
  assert.deepEqual(sheriffOf(game).injuries.map((w) => [w.region, w.severity]), [['arm', 0.2], ['leg', 0.1]], 'a graze is recorded as the smallest wound');
  assert.ok(isFitAfter(game));
});
function isFitAfter(game) {
  return sheriffOf(game).injuries.every((w) => w.severity < 0.6) && game.state.crew.includes(sheriffOf(game));
}

// Note: section "223-death".

test('223-death: death needs a fatal wound, removes the man for good, and the opponent who dies never returns', () => {
  const saved = (g) => g.save();
  const quiet = ready('acc-death-guard');
  quiet.duelBegin();
  const before = saved(quiet);
  for (const extra of [{ playerStatus: 'dead' }, { opponentStatus: 'dead' }, { playerDying: true }, { opponentDying: true }, { firstShot: null }, { firstDraw: null }]) {
    assert.equal(quiet.duelFinish({ ...REPORT, ...extra }).ok, false, JSON.stringify(extra));
    assert.equal(saved(quiet), before, 'a refused report changes nothing');
  }
  // Note: a deputy's death takes only the deputy.
  const game = ready('acc-death-deputy', 1);
  game.duelBegin();
  const deputy = deputyOf(game);
  const result = game.duelFinish({ ...REPORT, playerStatus: 'dead', wounds: fatal('head') });
  assert.equal(result.ok, true);
  assert.ok(!game.state.crew.includes(deputy), 'gone from the crew');
  assert.equal(game.state.fallen.length, 1);
  assert.equal(game.state.fallen[0].char.id, deputy.id);
  assert.equal(game.state.fallen[0].cause, 'shot in a duel');
  assert.ok(result.events.some((e) => e.type === 'death' && e.charId === deputy.id && e.cause === 'shot in a duel'));
  assert.ok(!result.events.some((e) => e.type === 'succession'), 'the star is not touched');
  assert.equal(sheriffOf(game).role, 'sheriff');
  assert.equal(Campaign.load(game.save()).state.fallen[0].char.id, deputy.id, 'the death is saved');
  // Note: a stranger who dies is struck from the live roster and remembered as dead.
  const slain = ready('acc-death-stranger');
  const stranger = slain.state.gunslingers[0];
  slain.duelBegin();
  assert.equal(slain.duelFinish({ ...REPORT, firstDraw: 'player', firstShot: 'player', opponentStatus: 'dead', opponentWounds: fatal() }).ok, true);
  assert.equal(stranger.alive, false);
  assert.equal(stranger.memories.at(-1).kind, 'dead');
  assert.deepEqual(present(slain.state), [], 'nobody of that name drinks in the saloon');
  const later = Campaign.load(slain.save());
  later.state.rates = { ...QUIET, persuade: false };
  later.state.min += 90 * 1440;
  later.state.saloonVisit = { town: later.state.at, patron: 'X', seed: 1 };
  later.state.duel = null;
  for (let i = 0; i < 30; i++) {
    later.state.duel = null;
    later.state.min += 61;
    later.duelChallenge(sheriffOf(later).id, 'insult');
    assert.notEqual(later.state.duel?.opponentId, stranger.id, 'the dead do not come back');
  }
  // Note: death after the exchange also counts: a mortal wound carries a man off.
  const dying = ready('acc-death-dying');
  dying.duelBegin();
  assert.equal(dying.duelFinish({ ...REPORT, playerStatus: 'incapacitated', playerDying: true, wounds: [{ region: 'abdomen', severity: 0.9 }] }).ok, true);
  assert.equal(dying.state.fallen.length, 1, 'dying of the wound is dying');
});

test('223-death: whatever the sim can produce, the campaign accepts, and every kind of end is reached', () => {
  const runs = Array.from({ length: 40 }, (_, i) => {
    const game = ready(`acc-all-${i}`);
    // Note: every second run also asks the opponent to stop, which the sim refuses until a round has been fired.
    const asks = [{ every: 2, act: (sim) => sim.stopFighting() }].filter((ask) => i % ask.every === 0);
    // Note: every second run keeps a hit man standing (STANDING), so the ends without a fall are reached too.
    const { report } = exchange(game, { aim: [0, [1.25, 1.65, 0.4, 1.0][i % 4]], limit: 30, onTick: (sim) => asks.forEach((ask) => ask.act(sim)) }, [STANDING, undefined][i % 2]);
    const result = game.duelFinish(report);
    assert.equal(result.ok, true, `${result.reason} (${i})`);
    assert.ok(!game.state.duel);
    return { report, fallen: game.state.fallen.length, strangerDown: game.state.gunslingers.some((g) => !g.alive) };
  });
  const ends = new Set(runs.map(({ report }) => `${report.playerStatus}/${report.opponentStatus}`));
  some(runs.filter(({ report }) => report.playerStatus === 'dead'), 'sheriff killed').forEach(({ report, fallen }) => assert.ok(fallen >= 1 || report.wounds.length > 0));
  some(runs.filter(({ report }) => report.opponentStatus === 'dead'), 'stranger killed').forEach(({ strangerDown }) => assert.ok(strangerDown));
  for (const end of ['stopped/stopped', 'stopped/incapacitated', 'incapacitated/stopped']) assert.ok(ends.has(end), `${end} is reached (${[...ends]})`);
});

// Note: section "223-succession".

test('223-succession: a sheriff killed in a duel is replaced under the same rules as on any other occasion', () => {
  const dead = { ...REPORT, playerStatus: 'dead', wounds: fatal() };
  const strong = (game) => {
    const deputy = deputyOf(game);
    deputy.loyalty = 100;
    deputy.skill = { precision: 0.9, toughness: 0.9, awareness: 0.9 };
    return deputy;
  };
  // Note: a loyal, able deputy takes the star, and the sheriff's name passes on at three fifths.
  const a = ready('acc-succ-a');
  const old = sheriffOf(a);
  const deputy = strong(a);
  a.state.rep.sheriff = 50;
  a.duelBegin();
  const result = a.duelFinish(dead);
  assert.equal(result.ok, true);
  const event = result.events.find((e) => e.type === 'succession');
  assert.equal(event.kind, 'deputy-promoted');
  assert.equal(event.sheriffId, deputy.id);
  assert.equal(deputy.role, 'sheriff');
  assert.deepEqual(a.state.crew.filter((c) => c.role === 'sheriff').map((c) => c.id), [deputy.id], 'exactly one sheriff');
  assert.equal(a.state.crew[0], deputy, 'and he leads');
  assert.equal(a.state.rep.sheriff, 30, 'fifty at three fifths');
  assert.equal(a.state.fallen[0].char.id, old.id);
  assert.equal(a.state.fallen[0].cause, 'shot in a duel');
  // Note: the same outcome as the same death on any other occasion.
  const b = create('acc-succ-a');
  b.enterSaloon();
  strong(b);
  b.state.rep.sheriff = 50;
  applyDeaths(b.state, [{ char: sheriffOf(b), cause: 'shot in a duel' }]);
  const events = [];
  settle(b.state, events);
  assert.equal(events.find((e) => e.type === 'succession').kind, 'deputy-promoted');
  assert.deepEqual([b.state.rep.sheriff, b.state.crew[0].role, b.state.fallen[0].cause], [a.state.rep.sheriff, a.state.crew[0].role, a.state.fallen[0].cause]);
  // Note: a deputy short of very loyal does not carry the revenge on, and the campaign fails (items 274, 305).
  const c = ready('acc-succ-c');
  const weak = deputyOf(c);
  weak.loyalty = 0;
  c.duelBegin();
  const failed = c.duelFinish(dead).events.find((e) => e.type === 'succession');
  assert.equal(failed.kind, 'ended');
  assert.equal(c.state.ended.outcome, 'failure');
  // Note: nobody left means the campaign ends.
  const d = ready('acc-succ-d');
  d.state.crew = [sheriffOf(d)];
  d.duelBegin();
  const ended = d.duelFinish(dead);
  assert.equal(ended.ok, true);
  assert.ok(d.state.ended, 'the campaign is over');
  assert.ok(ended.events.some((e) => e.type === 'ended'));
  // Note: a duel won by the sheriff changes the office in no way.
  const e = ready('acc-succ-e');
  const keep = sheriffOf(e);
  e.duelBegin();
  const won = e.duelFinish({ ...REPORT, opponentStatus: 'incapacitated' });
  assert.ok(!won.events.some((x) => x.type === 'succession'));
  assert.equal(sheriffOf(e), keep);
});

// Note: section "223-persistent-gunslingers".

// Note: one saloon duel from challenge to a hand-written result; returns the stranger.
function settleWith(game, over, who = 0) {
  assert.equal(game.duelChallenge(game.state.crew[who].id, 'insult').ok, true);
  assert.equal(game.duelPersuade('explain').persuaded, false);
  const stranger = game.state.gunslingers.find((g) => g.id === game.state.duel.opponentId);
  game.duelBegin();
  assert.equal(game.duelFinish({ ...REPORT, ...over }).ok, true);
  return stranger;
}

test('223-persistent-gunslingers: a survivor keeps his name and standing, remembers what happened, and comes back with that memory', () => {
  const cases = {
    standoff: { over: {}, stance: 'wary', rep: 1 },
    humiliated: { over: { opponentStatus: 'incapacitated' }, stance: 'grudge', rep: -8 },
    spared: { over: { opponentWounds: [{ region: 'arm', severity: 0.3 }] }, stance: 'friendly', rep: -3 },
    bested: { over: { playerStatus: 'incapacitated', wounds: [{ region: 'arm', severity: 0.4 }] }, stance: 'confident', rep: 8 },
  };
  const lines = new Set();
  for (const [kind, { over, stance, rep }] of Object.entries(cases)) {
    const game = saloon(`acc-persist-${kind}`, { gunslingerReturn: 1 });
    const sheriff = sheriffOf(game);
    const first = game.duelChallenge(sheriff.id, 'insult');
    assert.equal(first.ok, true);
    const stranger = game.state.gunslingers.find((g) => g.id === game.state.duel.opponentId);
    assert.ok(stranger.name && stranger.id && Number.isFinite(stranger.reputation) && ['proud', 'volatile', 'cautious'].includes(stranger.personality), 'a named person with a standing and a temper');
    assert.equal(first.challenge.opponent.met, false, 'a stranger at first');
    const { name, id, personality, reputation } = stranger;
    game.duelPersuade('explain');
    game.duelBegin();
    assert.equal(game.duelFinish({ ...REPORT, ...over }).ok, true);
    assert.equal(stranger.alive, true);
    assert.deepEqual([stranger.name, stranger.id, stranger.personality], [name, id, personality], 'the same man');
    assert.equal(stranger.reputation, Math.min(100, Math.max(0, reputation + rep)), `a ${kind} moves his standing by ${rep}`);
    const memory = stranger.memories.at(-1);
    assert.equal(memory.kind, kind);
    assert.equal(memory.charId, sheriff.id);
    assert.equal(memory.dispute, 'insult');
    const loaded = Campaign.load(game.save());
    assert.deepEqual(loaded.state.gunslingers.find((g) => g.id === id), stranger, 'he is saved');
    // Note: a month later, healed and rearmed, he is in the same saloon and the next challenge can be his.
    game.state.min += 30 * 1440;
    stranger.injuries = [];
    sheriff.injuries = [];
    sheriff.fatigue = 0;
    game.state.duel = null;
    const again = game.duelChallenge(sheriff.id, 'gambling');
    assert.equal(again.ok, true);
    assert.equal(game.state.duel.opponentId, id, 'the survivor is the one who challenges again');
    assert.equal(again.challenge.opponent.name, name);
    assert.equal(again.challenge.opponent.met, true);
    assert.deepEqual(again.challenge.opponent.history, [kind]);
    assert.equal(game.duelPersuade('explain').persuaded, false);
    assert.equal(game.duelBegin().duel.initial.opponent.stance, stance, `after a ${kind} he stands ${stance}`);
    lines.add(again.challenge.opponent.line);
  }
  assert.equal(lines.size, 4, 'and what he says depends on what he remembers');
});

test('223-persistent-gunslingers: a man elsewhere is a stranger here, the memory is short, and the roster is limited', () => {
  const away = saloon('acc-persist-away', { gunslingerReturn: 1 });
  const stranger = settleWith(away, {});
  stranger.at = 'bisbee-az';
  away.state.duel = null;
  assert.equal(away.duelChallenge(sheriffOf(away).id, 'insult').ok, true);
  assert.notEqual(away.state.duel.opponentId, stranger.id, 'he is elsewhere');
  assert.ok(away.state.gunslingers.some((g) => g.id === stranger.id && g.alive), 'but he is still alive');
  const never = saloon('acc-persist-new', { gunslingerReturn: 0 });
  const first = settleWith(never, {});
  never.state.min += 1440;
  never.duelChallenge(sheriffOf(never).id, 'insult');
  assert.notEqual(never.state.duel.opponentId, first.id, 'a roll against his return brings a stranger');
  const same = saloon('acc-persist-memory', { gunslingerReturn: 1 });
  const meetings = [];
  for (let i = 0; i < 7; i++) {
    meetings.push(settleWith(same, { roundsFired: 1 + (i % 2) }));
    same.state.min += 1440;
  }
  const man = meetings[0];
  meetings.forEach((got) => assert.equal(got.id, man.id, 'the same man every time'));
  assert.equal(man.memories.length, MEMORY_CAP, 'only the last few meetings are remembered');
  assert.deepEqual(man.memories.map((m) => m.min), [...man.memories.map((m) => m.min)].sort((a, b) => a - b));
  const crowd = saloon('acc-persist-cap', { gunslingerReturn: 0 });
  const ids = [];
  for (let i = 0; i < 20; i++) {
    ids.push(settleWith(crowd, {}).id);
    crowd.state.min += 90;
    assert.ok(crowd.state.gunslingers.filter((g) => g.alive).length <= LIVE_CAP, `at most ${LIVE_CAP} live men`);
  }
  const roster = new Set(crowd.state.gunslingers.map((g) => g.id));
  assert.ok(roster.has(ids.at(-1)), 'the latest man is on the roster');
  assert.ok(!roster.has(ids[0]), 'the one seen longest ago has gone');
});

test('223-persistent-gunslingers: a man who lost his revolver or rounds is unarmed for a week and is armed again only in a town with a store', () => {
  const game = saloon('acc-persist-rearm', { gunslingerReturn: 1 });
  const sheriff = sheriffOf(game);
  const stranger = settleWith(game, { opponentWeaponHeld: false, opponentLostLoaded: 2, opponentRoundsFired: 1 });
  assert.equal(stranger.weapon, null);
  assert.equal(stranger.rearmAt, game.state.min + 7 * 1440);
  assert.ok(PLACES[game.state.at].services.store, 'the town has a store');
  game.state.duel = null;
  game.state.min += 3 * 1440;
  assert.equal(game.duelChallenge(sheriff.id, 'insult').ok, true);
  assert.notEqual(game.state.duel.opponentId, stranger.id, 'unarmed, he does not come');
  // Note: the stranger who came instead leaves the town, so only the rearmed man can answer.
  game.state.duel = null;
  game.state.gunslingers = game.state.gunslingers.filter((g) => g.id === stranger.id);
  game.state.min = stranger.rearmAt;
  stranger.injuries = [];
  stranger.ammunition = 1;
  assert.equal(game.duelChallenge(sheriff.id, 'insult').ok, true);
  assert.equal(game.state.duel.opponentId, stranger.id, 'a week later he is armed and back');
  assert.ok(stranger.weapon, 'he has a revolver again');
  assert.ok(stranger.ammunition >= 6, 'and a few rounds to go with it');
  assert.equal(stranger.rearmAt, null);
  // Note: in a saloon town with no store there is nothing to buy, so he stays unarmed however long he waits.
  const bare = Object.keys(PLACES).find((id) => PLACES[id].services.saloon && !PLACES[id].services.store);
  assert.ok(bare, 'some saloon town has no store');
  const poor = saloon('acc-persist-bare', { gunslingerReturn: 1 });
  poor.state.at = bare;
  poor.state.saloonVisit = { town: bare, patron: 'X', seed: 1 };
  const man = settleWith(poor, { opponentWeaponHeld: false, opponentLostLoaded: 2, opponentRoundsFired: 1 });
  assert.equal(man.at, bare);
  poor.state.duel = null;
  poor.state.gunslingers = poor.state.gunslingers.filter((g) => g.id === man.id);
  poor.state.min = man.rearmAt + 3 * 1440;
  man.injuries = [];
  poor.duelChallenge(sheriffOf(poor).id, 'insult');
  assert.equal(man.weapon, null, 'no store, no revolver');
  assert.notEqual(poor.state.duel?.opponentId, man.id);
});

// Note: section "223-reputation-fines-witnesses".

test('223-reputation-fines-witnesses: the account holds exactly what the report holds, whatever the combination', () => {
  const NAME = 'Sheriff Ames';
  const FOE = 'Jack Rook';
  const cases = [];
  for (const threatened of [true, false]) for (const drew of ['player', 'opponent']) for (const shot of ['player', 'opponent']) {
    for (const ps of ['stopped', 'incapacitated', 'dead']) for (const os of ['stopped', 'incapacitated', 'dead']) {
      for (const surrendered of [false, true]) for (const yielded of [false, true]) cases.push({ threatened, drew, shot, ps, os, surrendered, yielded });
    }
  }
  const NAMES = { player: NAME, opponent: FOE };
  const judged = cases.map((c) => {
    const report = { ...REPORT, firstDraw: c.drew, firstShot: c.shot, playerStatus: c.ps, opponentStatus: c.os, surrendered: c.surrendered, opponentYielded: c.yielded };
    const out = judge({ witnesses: true, threatened: c.threatened }, report, { name: NAME, opponentName: FOE, died: c.ps === 'dead', opponentDied: c.os === 'dead', opponentReputation: 60, cents: 300 });
    const unseen = judge({ witnesses: false, threatened: c.threatened }, report, { name: NAME, opponentName: FOE, died: c.ps === 'dead', opponentDied: c.os === 'dead', cents: 300 });
    return { c, out, unseen, text: JSON.stringify(c) };
  });
  const given = (holds, check) => {
    const hit = judged.filter(({ c, out }) => holds(c, out));
    assert.ok(hit.length > 0, `some combination meets ${holds}`);
    hit.forEach(check);
  };
  // Note: the account of how the exchange began.
  given((c) => c.threatened, ({ out, text }) => assert.ok(out.account.includes(`${FOE} had threatened ${NAME}`), text));
  given((c) => !c.threatened, ({ out, text }) => assert.ok(out.account.includes(`${FOE} had made no threat`), text));
  given(() => true, ({ c, out, text }) => assert.ok(out.account.includes(`${NAMES[c.drew]} drew first`), text));
  given((c) => c.shot === c.drew, ({ out, text }) => assert.ok(out.account.includes('and fired first'), text));
  given((c) => c.shot !== c.drew, ({ c, out, text }) => assert.ok(out.account.includes(`but ${NAMES[c.shot]} fired first`), text));
  // Note: the account of how it ended, one phrase for each man killed, shot down or given up.
  const endings = (name, status, gave) => [['was killed', status === 'dead'], ['was shot down', status === 'incapacitated'], ['gave up', status === 'stopped' && gave]]
    .filter(([, holds]) => holds).map(([phrase]) => `${name} ${phrase}`);
  given(() => true, ({ c, out, text }) => {
    const expected = [...endings(NAME, c.ps, c.surrendered), ...endings(FOE, c.os, c.yielded)];
    for (const phrase of ['was killed', 'was shot down', 'gave up']) {
      assert.equal(out.account.split(phrase).length - 1, expected.filter((e) => e.endsWith(phrase)).length, `${phrase}: ${out.account} ${text}`);
    }
    assert.ok(expected.every((e) => out.account.includes(e)), `${expected}: ${out.account}`);
    assert.equal(out.account.includes('the fight was stopped'), expected.length === 0, `${out.account} ${text}`);
  });
  // Note: the verdict, the fine and the standing.
  given(() => true, ({ out }) => assert.ok(out.fine >= 0 && out.fine <= 300, 'a fine never exceeds the cash'));
  given((c, out) => out.fine > 0, ({ out }) => assert.equal(out.verdict, 'unprovoked'));
  given((c) => c.ps === 'dead', ({ out }) => assert.deepEqual([out.fine, out.reputation, out.verdict], [0, 0, 'lost']));
  given((c) => c.threatened, ({ out }) => assert.ok(out.fine === 0 && out.reputation >= 0, 'a threatened man is not punished for drawing or firing first'));
  const reckless = (c) => !c.threatened && c.drew === 'player' && c.shot === 'player' && c.ps !== 'dead';
  given((c) => reckless(c) && c.os !== 'stopped', ({ out, text }) => assert.deepEqual([out.fine, out.reputation, out.verdict], [300, -3, 'unprovoked'], text));
  given((c) => reckless(c) && c.os === 'stopped', ({ out, text }) => assert.deepEqual([out.fine, out.reputation, out.verdict], [0, -1, 'reckless'], text));
  // Note: a man who drew first without a threat is judged reckless even when the other man fired first, if he lives.
  given((c) => !c.threatened && c.drew === 'player' && c.shot === 'opponent' && c.ps !== 'dead', ({ out, text }) => assert.deepEqual([out.fine, out.reputation, out.verdict], [0, -1, 'reckless'], text));
  given((c) => c.drew === 'opponent' && c.shot === 'opponent' && c.ps !== 'dead', ({ out }) => assert.equal(out.verdict, 'self-defence'));
  judged.forEach(({ unseen }) => assert.deepEqual([unseen.fine, unseen.reputation, unseen.verdict, unseen.account], [0, 0, 'unwitnessed', 'Nobody saw the duel.']));
  assert.equal(judged.length, 2 * 2 * 2 * 3 * 3 * 2 * 2);
});

test('223-reputation-fines-witnesses: the campaign applies the verdict once, to the right person, and tells the same account', () => {
  const duelOf = (seed, who, record, over) => {
    const game = ready(seed, who);
    game.duelBegin();
    Object.assign(game.state.duel, record);
    return { game, result: game.duelFinish({ ...REPORT, ...over }) };
  };
  const unprovoked = { firstDraw: 'player', firstShot: 'player', opponentStatus: 'incapacitated' };
  const seen = duelOf('acc-judge-a', 0, { witnesses: true, threatened: false }, unprovoked);
  assert.equal(seen.result.verdict, 'unprovoked');
  assert.equal(seen.result.fine, 500);
  assert.equal(seen.result.reputation, -3);
  const sheriffRep = create('acc-judge-a').state.rep.sheriff;
  assert.equal(seen.game.state.rep.sheriff, Math.max(0, sheriffRep - 3));
  assert.ok(seen.game.state.log.some((l) => l.text.includes(seen.result.account) && l.text.includes('Witnesses say')));
  const poor = ready('acc-judge-poor');
  poor.duelBegin();
  Object.assign(poor.state.duel, { witnesses: true, threatened: false });
  poor.state.cents = 120;
  assert.equal(poor.duelFinish({ ...REPORT, ...unprovoked }).fine, 120, 'he cannot pay more than he has');
  assert.equal(poor.state.cents, 0);
  const nobody = duelOf('acc-judge-b', 0, { witnesses: false, threatened: false }, unprovoked);
  assert.deepEqual([nobody.result.fine, nobody.result.reputation, nobody.result.account], [0, 0, 'Nobody saw the duel.']);
  assert.equal(nobody.game.state.rep.sheriff, sheriffRep);
  assert.equal(nobody.game.state.cents, create('acc-judge-b').state.cents);
  const deputy = duelOf('acc-judge-c', 1, { witnesses: true, threatened: false }, { firstDraw: 'opponent', firstShot: 'opponent', opponentStatus: 'incapacitated' });
  assert.equal(deputy.result.verdict, 'self-defence');
  assert.ok(deputyOf(deputy.game).reputation > 0, 'the deputy earns the standing');
  assert.equal(deputy.game.state.rep.sheriff, sheriffRep, 'the sheriff\'s name is not the deputy\'s to earn');
  assert.equal(deputy.game.duelFinish({ ...REPORT }).ok, false, 'applied once');
  // Note: a threat or a provocation is context; the same draw and shot earns no fine when the other man threatened first.
  const provoked = duelOf('acc-judge-d', 0, { witnesses: true, threatened: true }, unprovoked);
  assert.deepEqual([provoked.result.fine, provoked.result.reputation, provoked.result.verdict], [0, 0, 'provoked']);
});

test('223-reputation-fines-witnesses: a watched dispute is told as it was, on the ground where it was fought', () => {
  const sp = { a: { name: 'Ann Reed' }, b: { name: 'Bo Hall' } };
  for (const label of ['the corral beside the livery', 'a yard behind the saloon', 'the open lot beside the saloon']) {
    const site = { label };
    assert.equal(accountOf({ ...sp, site }, { a: 'dead', b: 'down', winner: null, shots: 4 }), `Ann Reed and Bo Hall both go down in ${label}.`);
    assert.equal(accountOf({ ...sp, site }, { a: 'standing', b: 'standing', winner: null, shots: 5 }), 'Ann Reed and Bo Hall trade shots and part with no winner.');
    assert.equal(accountOf({ ...sp, site }, { a: 'standing', b: 'standing', winner: null, shots: 0 }), 'Ann Reed and Bo Hall part with hard words and no winner.');
    assert.equal(accountOf({ ...sp, site }, { a: 'yielded', b: 'down', winner: null, shots: 3 }), `Ann Reed is made to give way and Bo Hall is shot down in ${label}.`);
  }
  const told = Array.from({ length: 8 }, (_, i) => {
    const game = saloon(`acc-told-${i}`, { spectate: 1 });
    game.saloonActivity('drink');
    const label = game.spectacle().site.label;
    const sides = game.spectacle();
    const spec = game.spectateWatch().spec;
    const report = simulate(JSON.parse(JSON.stringify(spec)));
    const result = game.spectateFinish();
    return { label, sides, report, result };
  });
  const word = { dead: 'killed', down: 'shot down', yielded: 'made to give way' };
  const other = { a: 'b', b: 'a' };
  const named = { player: 'a', opponent: 'b' };
  const decided = some(told.filter(({ result }) => result.outcome.winner), 'decided dispute');
  decided.forEach(({ sides, result }) => {
    const loser = other[result.outcome.winner];
    assert.ok(result.account.startsWith(`${sides[result.outcome.winner].name} beats ${sides[loser].name}`), result.account);
    assert.ok(result.account.includes(`who is ${word[result.outcome[loser]]}`), result.account);
  });
  some(decided.filter(({ report }) => report.firstDraw && report.firstShot), 'decided dispute with a first draw and shot').forEach(({ sides, report, result }) => {
    const name = (who) => sides[named[who]].name;
    assert.ok(result.account.includes(`${name(report.firstDraw)} drew first and ${name(report.firstShot)} fired first`), result.account);
  });
  const undecided = told.filter(({ result }) => !result.outcome.winner);
  // Note: since item 356 names the man standing at the first fall the winner, an undecided dispute with a man hurt is rare (two falling at once); any that occurs is told so.
  const hurt = undecided.filter(({ result }) => result.outcome.a !== 'standing' || result.outcome.b !== 'standing');
  hurt.forEach(({ label, result }) => assert.ok(result.account.includes(label), `${result.account} (${label})`));
  assert.equal(told.length, 8);
  // Note: with one round each and nobody hit, the account says they traded shots.
  // Note: such an exchange comes about once in forty disputes, so the first 48 seeds are played and one is asked for.
  const traded = Array.from({ length: 48 }, (_, i) => {
    const game = saloon(`acc-traded-${i}`, { spectate: 1 });
    game.saloonActivity('drink');
    game.state.spectacle.a.ammunition = 1;
    game.state.spectacle.b.ammunition = 1;
    const spec = game.spectateWatch().spec;
    const report = simulate(JSON.parse(JSON.stringify(spec)));
    return { report, result: game.spectateFinish() };
  }).filter(({ result }) => !result.outcome.winner && result.outcome.a === 'standing' && result.outcome.b === 'standing');
  assert.ok(traded.length >= 1, `exchanges that ended with shots and nobody down (${traded.length})`);
  traded.forEach(({ report, result }) => {
    assert.ok(report.roundsFired + report.opponentRoundsFired > 0);
    assert.match(result.account, /trade shots and part with no winner/);
  });
});

// Note: section "223-interrupted-restart".

test('223-interrupted-restart: closing the game in a duel restarts the same duel from its beginning, with nothing from the lost exchange', () => {
  const game = ready('acc-restart');
  const challenge = game.save();
  const asked = Campaign.load(challenge);
  assert.equal(asked.duel().phase, 'ready', 'the challenge and its failed persuasion survive');
  assert.equal(asked.duel().approach, 'explain');
  const preBegin = JSON.parse(game.save());
  const spec = game.duelBegin().duel;
  const beforeExchange = game.save();
  const postBegin = JSON.parse(beforeExchange);
  for (const record of [preBegin, postBegin]) { delete record.duel; delete record.rng; }
  assert.deepEqual(postBegin, preBegin, 'beginning the exchange writes the duel record and one draw of the dice, nothing more');
  // Note: a lot happens on screen; none of it is in the saved campaign.
  const lost = play(spec, { aim: [0, 1.25], limit: 8 });
  assert.ok(lost.roundsFired + lost.opponentRoundsFired > 0, 'the exchange was under way');
  assert.equal(game.save(), beforeExchange, 'an exchange in progress changes nothing in the campaign');
  const again = Campaign.load(beforeExchange);
  assert.equal(again.duel().phase, 'exchange');
  assert.deepEqual(again.duel().initial, spec.initial, 'same participants, equipment, ammunition and seed');
  assert.deepEqual([again.state.ammo, again.state.min, again.state.cents], [game.state.ammo, game.state.min, game.state.cents]);
  assert.equal(again.state.crew[0].injuries.length, 0);
  const rng = again.state.rng;
  assert.deepEqual(again.duelBegin().duel.initial, spec.initial, 'Continue begins it again');
  assert.deepEqual(again.state.rng, rng, 'and takes nothing more from the dice');
  const replay = (campaign, limit) => {
    const trace = [];
    const sim = play(campaign.duel(), { limit, onTick: (s) => trace.push([s.time, s.roundsFired, s.opponentRoundsFired, s.player.status, s.opponent.status]) });
    return { sim, trace };
  };
  const first = replay(game, 180);
  const second = replay(again, 180);
  assert.deepEqual(second.trace, first.trace, 'the restarted duel runs exactly as the first one did');
  assert.deepEqual(second.sim.report(), first.sim.report());
  assert.equal(again.duelFinish(second.sim.report()).ok, true);
  assert.equal(game.duelFinish(first.sim.report()).ok, true);
  assert.equal(again.save(), game.save(), 'the lost run and the restarted run leave the campaign in the same state');
  const effects = (g) => JSON.stringify([g.state.ammo, g.state.crew.map((c) => c.injuries), g.state.gunslingers.map((s) => [s.memories, s.ammunition, s.injuries]), g.state.min]);
  const once = effects(again);
  assert.equal(again.duelFinish(second.sim.report()).ok, false);
  assert.equal(effects(again), once, 'the result is applied once');
});

test('223-interrupted-restart: a teammate duel interrupted in the rest restarts with the rest still waiting', () => {
  const { game } = restDuel('acc-restart-rest');
  const rest = JSON.stringify(game.state.rest);
  const spec = game.duelBegin().duel;
  const saved = game.save();
  const lost = new DuelSim(spec);
  for (let t = 0; t < 6; t += TICK) lost.step(TICK);
  assert.equal(game.save(), saved);
  const again = Campaign.load(saved);
  assert.equal(again.duel().source, 'teammate-rest');
  assert.equal(JSON.stringify(again.state.rest), rest, 'the interrupted rest is kept');
  const restarted = again.duelBegin().duel;
  assert.deepEqual(restarted.initial, spec.initial);
  assert.equal(restarted.watch, true, 'it is still a watched duel');
  const replay = new DuelSim(restarted);
  for (let t = 0; t < 6; t += TICK) replay.step(TICK);
  assert.equal(JSON.stringify(replay.view()), JSON.stringify(lost.view()), 'the restarted duel is the same duel, step for step');
});

// Note: section "223-return-to-sheriff-and-rest".

test('223-return-to-sheriff-and-rest: after a teammate\'s duel the sheriff is in charge and the interrupted rest goes on to its end', () => {
  const cases = [['stopped', {}, true], ['teammate hurt', { playerStatus: 'incapacitated', wounds: [{ region: 'leg', severity: 0.5 }] }, true], ['teammate dead', { playerStatus: 'dead', wounds: fatal() }, false]];
  for (const [name, over, stays] of cases) {
    const { game, result } = restDuel(`acc-return-${name}`);
    const mate = game.state.crew.find((c) => c.id === game.state.duel.charId);
    assert.notEqual(mate.role, 'sheriff', 'a teammate is the one challenged');
    assert.equal(result.interrupted, true);
    const rest = game.state.rest;
    const start = game.state.min - result.minutes;
    const left = rest.remaining;
    assert.ok(left > 0, 'part of the rest is still to come');
    assert.equal(game.rest(1).ok, false, 'the sheriff cannot do other things meanwhile');
    calm(game);
    game.duelBegin();
    const done = game.duelFinish({ ...REPORT, ...over, seconds: 90 });
    assert.equal(done.ok, true);
    assert.ok(done.rest && done.rest.ok, 'the rest resumed at once');
    assert.equal(done.rest.interrupted, false);
    assert.equal(done.rest.minutes, left, 'the rest that was left is rested');
    assert.equal(game.state.rest, null, 'and then it is over');
    assert.equal(game.state.min - start, rest.requested + 2, 'eight hours of rest and two minutes of duel');
    assert.ok(!game.state.duel);
    assert.equal(sheriffOf(game).role, 'sheriff', 'the sheriff is in charge');
    assert.ok(game.state.crew[0].role === 'sheriff');
    assert.equal(game.state.crew.includes(mate), stays, 'only a dead teammate leaves the crew');
    assert.equal(game.enterSaloon().ok, true, 'ordinary actions are open again');
  }
  // Note: a duel of the sheriff himself has no rest to return to.
  const own = ready('acc-return-own');
  own.duelBegin();
  const result = own.duelFinish({ ...REPORT });
  assert.equal(result.rest, undefined);
  assert.equal(own.state.rest ?? null, null);
});

test('223-return-to-sheriff-and-rest: a rest that is broken again by another teammate asks the sheriff again, and the clock is never counted twice', () => {
  const { game, result } = restDuel('acc-return-twice');
  const requested = game.state.rest.requested;
  const start = game.state.min - result.minutes;
  game.state.rates = { ...REST };
  game.duelBegin();
  let done = game.duelFinish({ ...REPORT, seconds: 60 });
  let minutes = 1;
  let guard = 0;
  while (game.state.duel && guard++ < 20) {
    assert.equal(game.state.duel.source, 'teammate-rest');
    assert.ok(game.state.rest, 'the rest waits');
    game.duelBegin();
    done = game.duelFinish({ ...REPORT, seconds: 60 });
    minutes++;
  }
  assert.ok(!game.state.duel);
  assert.equal(game.state.rest, null);
  assert.equal(game.state.min - start, requested + minutes, 'the rest and each duel are counted once');
});

// Note: section "223-reproducible".

test('223-reproducible: the same seed and the same pointer samples, cocks and clicks give the same sheriff duel byte for byte, and another seed another one', () => {
  const play = (seed) => {
    const game = ready(seed);
    const sim = new DuelSim(game.duelBegin().duel);
    for (let t = 0; t < 0.7; t += TICK) sim.step(TICK);
    sim.draw('player');
    for (let i = 0; i < 160 && !sim.done; i++) {
      // Note: the mouse sweeps a fixed path over the chest, so every run gets the same samples.
      sim.aimed(0.25 * Math.sin(i / 9), 1.25 + 0.2 * Math.cos(i / 13));
      sim.cock();
      sim.fire('player');
      sim.step(TICK);
    }
    return JSON.stringify([sim.view(), sim.report()]);
  };
  assert.equal(play('acc-repro-aim'), play('acc-repro-aim'));
  const lines = new Set(['acc-repro-aim-1', 'acc-repro-aim-2', 'acc-repro-aim-3'].map(play));
  assert.equal(lines.size, 3, 'another seed, another duel');
});

test('223-reproducible: the same seed and the same inputs give the same duel, byte for byte, and another seed another one', () => {
  const run = (seed) => {
    const game = ready(seed);
    const { sim, report } = exchange(game, { aim: [0, 1.25] });
    const view = sim.view();
    game.duelFinish(report);
    return { save: game.save(), report, view };
  };
  const stake = (seed) => {
    const game = saloon(seed);
    game.duelChallenge(sheriffOf(game).id, 'gambling');
    return JSON.stringify(game.state.duel);
  };
  for (let i = 0; i < 12; i++) assert.equal(stake(`acc-repro-g${i}`), stake(`acc-repro-g${i}`), 'a gambling challenge with its threat and witnesses repeats exactly');
  assert.ok(new Set(Array.from({ length: 12 }, (_, i) => JSON.parse(stake(`acc-repro-g${i}`)).threatened)).size === 2, 'and the threat varies with the seed');
  const a = run('acc-repro');
  const b = run('acc-repro');
  assert.equal(a.save, b.save);
  assert.deepEqual(a.report, b.report);
  assert.deepEqual(a.view, b.view);
  const reports = new Set();
  for (const seed of ['acc-repro-1', 'acc-repro-2', 'acc-repro-3', 'acc-repro-4']) {
    const r = run(seed);
    reports.add(JSON.stringify(r.report));
  }
  assert.ok(reports.size >= 3, 'other seeds play out differently');
  const rested = restDuel('acc-repro-rest');
  const rested2 = restDuel('acc-repro-rest');
  assert.equal(rested.game.save(), rested2.game.save(), 'a teammate\'s duel is reproduced by rates and seed alone');
  assert.deepEqual(rested.result.challenge, rested2.result.challenge);
  // Note: the forced rates are a test hook; a game nobody forced never carries them.
  const plain = create('acc-repro-save');
  plain.enterSaloon();
  for (let i = 0; i < 5; i++) plain.saloonActivity('drink');
  assert.ok(!('rates' in JSON.parse(plain.save())));
});

test('223-origin-saloon-only: a challenge needs the sheriff inside a saloon, or a teammate resting in a town with one', () => {
  const game = Campaign.create('acc-origin', P2_START);
  game.state.rates = { ...QUIET, persuade: false };
  const id = sheriffOf(game).id;
  // Note: in a town with a saloon but not inside it.
  assert.equal(game.duelChallenge(id, 'insult').ok, false);
  assert.ok(!game.state.duel);
  assert.ok(!game.state.gunslingers?.length, 'a refused challenge conjures no stranger');
  // Note: the source of a challenge cannot be forged.
  assert.equal(makeChallenge(game.state, id, 'insult', 'road').ok, false);
  assert.equal(makeChallenge(game.state, id, 'insult', 'teammate-rest').ok, false, 'the sheriff is not a visiting teammate');
  game.enterSaloon();
  // Note: a town without a saloon.
  const bisbee = Campaign.create('acc-origin', P2_START);
  assert.ok(!PLACES['bisbee-az'].services.saloon, 'Bisbee has no saloon');
  bisbee.state.rates = { ...QUIET };
  bisbee.state.at = 'bisbee-az';
  bisbee.state.known.push('bisbee-az');
  bisbee.state.saloonVisit = { town: 'bisbee-az', patron: 'X', seed: 1 };
  assert.equal(bisbee.duelChallenge(sheriffOf(bisbee).id, 'insult').ok, false);
  // Note: on the road.
  const road = Campaign.create('acc-origin', P2_START);
  road.state.rates = { ...QUIET };
  road.enterSaloon();
  const next = neighbours('bodie-ca')[0];
  road.state.known.push(next);
  assert.equal(road.depart(next).ok, true);
  assert.equal(road.duelChallenge(sheriffOf(road).id, 'insult').ok, false);
  assert.equal(game.duelChallenge(id, 'insult').ok, true, 'the same call works inside the saloon');
});

test('223-origin-saloon-only: with every trouble rate at one, only the saloon and a rest in a saloon town ever open a duel', () => {
  const FULL = { challenge: 1, fight: 0, spectate: 1, teammateVisit: 1, teammateChallenge: 1, teammateFight: 0, persuade: false };
  const game = Campaign.create('acc-leak', P2_START);
  game.state.rates = { ...FULL };
  // Note: three places 60 to 160 km from the start, each ridden to and back.
  const ways = placesWithin('bodie-ca', 160).filter((p) => p.km >= 60).slice(0, 3).map((p) => p.id);
  game.state.known.push(...ways);
  const none = (what) => {
    assert.ok(!game.state.duel, `${what} left a duel`);
    assert.ok(!game.state.spectacle, `${what} left a dispute`);
    assert.ok(!game.state.gunslingers?.length, `${what} made a gunslinger`);
  };
  game.readNotices();
  none('notices');
  game.askAround();
  none('asking around');
  game.buy('food', 1);
  none('shopping');
  game.doctor();
  none('the doctor');
  // Note: the road, with its encounters withdrawn from or broken off, never opens a duel.
  let steps = 0;
  const meetings = [];
  for (const dest of ways.flatMap((id) => [id, 'bodie-ca'])) {
    assert.equal(game.depart(dest).ok, true);
    for (let i = 0; i < 90 && game.state.journey; i++) {
      // Note: an encounter the party could not slip away from is left behind at the next step.
      game.state.journey.pending = null;
      const r = game.advance(180);
      steps++;
      assert.notEqual(r.ok, false, `the road to ${dest} is open`);
      none(`the road to ${dest}`);
      const meeting = game.state.journey?.pending;
      meetings.push(meeting);
      // Note: the game refuses an answer that does not fit the encounter, so both answers are tried at every step.
      const options = meeting?.options ?? [];
      game.choose((options.find((o) => !o.needs) ?? options[0])?.id);
      game.withdraw();
      none('an encounter');
    }
    assert.equal(game.state.journey, null, `the party reached ${dest}`);
  }
  const met = meetings.filter((meeting) => meeting).length;
  assert.ok(steps >= 20 && met >= 1, `the road was walked (${steps} steps, ${met} meetings)`);
  game.state.at = 'bisbee';
  game.state.rest = null;
  game.state.min += 1440;
  const bisbee = game.rest(24);
  assert.equal(bisbee.interrupted, false, 'a rest in a town with no saloon is not interrupted');
  none('a rest in Bisbee');
  const here = Campaign.create('acc-leak', P2_START);
  here.state.rates = { ...FULL };
  const sa = here.rest(8);
  assert.equal(sa.interrupted, true);
  assert.equal(here.state.duel.source, 'teammate-rest');
  assert.equal(here.state.rest.town, 'bodie-ca');
  assert.ok(here.state.duel.town === 'bodie-ca');
  const visit = Campaign.create('acc-leak', P2_START);
  visit.state.rates = { ...FULL };
  visit.enterSaloon();
  assert.equal(visit.saloonActivity('drink').challenge.source, 'sheriff-visit');
});
