// Note: Release acceptance (items 461–477): skills and their effects, skill gains, traits, reputation, case preparation and contacts, access rewards and building complexity, on reproducible seeded campaigns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lawmenReport as report, holdCrew } from './western-test-helpers.mjs';
import { P2_START } from '../public/western/js/camp/state.js';
import { normSeed, seedFromString } from '../public/western/js/rand.js';

const camp = (name) => import(new URL(`../public/western/js/camp/${name}.js`, import.meta.url));
const { Campaign } = await camp('campaign');
const { advance } = await camp('state');
const B = await camp('base');
const Crew = await camp('crew');
const Cases = await camp('cases');
const P = await camp('progress');
const T = await camp('traits');
const I = await camp('intel');
const R = await camp('rewards');
const { tireAfterFight } = await camp('combat');
const { BrawlSim } = await camp('brawl-sim');
const { warpStrength } = await camp('duel-sim');
const { avoidChance } = await camp('travel');
const { buildSim, barricade } = await camp('scene');
const { generateHouse, validateHouse, BUILDINGS } = await import('../public/western/js/house.js');
const { skillMods, applyMember, simSkill } = await import('../public/western/js/party.js');
const { DS, WS } = await import('../public/western/js/tiles.js');
const { stateAt } = await import('../public/western/js/map.js');

// Note: building a campaign dominates the cost, so each test loads one saved start and takes its own seed and dice stream.
const START = Campaign.create('RELEASE-START', P2_START).save();
function fresh(seed = 'RELEASE-1') {
  const c = Campaign.load(START);
  c.state.seed = normSeed(seed);
  c.state.rng = seedFromString(`camp:${c.state.seed}`);
  return c;
}
// Note: the barred state of each kind of entry, the row a front or back door stands on, and the terms each kind of candidate takes.
const SHUT = { door: DS.LOCKED, window: WS.BOLTED };
const WAY_Y = { front: Math.max, back: Math.min };
const TERMS_KIND = { appointed: 'appointed', independent: 'ongoing' };
// Note: pinned outcomes of the seeded scenarios below.
const AVOIDED = 2;
const ASKED = ['location', 'defense', 'men', 'defense', null];
const sheriffOf = (c) => c.state.crew.find((m) => m.role === 'sheriff');
const deputyOf = (c) => c.state.crew.find((m) => m.role === 'deputy');
function addMate(c, o = {}) {
  const m = Crew.makeChar(c.state, { role: 'deputy', loyalty: 60, where: 'party', terms: { kind: 'appointed', wageCentsPerWeek: 1400 }, wageDueMin: c.state.min + 7 * 1440, ...o });
  c.state.crew.push(m);
  holdCrew(c.state);
  return m;
}
function acceptedHere(c, o = {}) {
  const k = Cases.offerCase(c.state, 'bodie-ca', 'notice');
  k.location = 'bodie-ca';
  k.site = o.site || { kind: 'house', terrain: null, label: 'a house at the edge of town', building: 'house' };
  k.seen = true;
  k.tier = o.tier || 1;
  k.extra = 0;
  assert.ok(c.accept(k.id).ok);
  return k;
}
const settleCase = (c, k, ids, o = {}, over = {}) => {
  const spec = c.encounterSpec(k.id, ids);
  assert.ok(spec.ok, spec.reason);
  return { spec, res: c.applyEncounter(report(spec, o, over), spec) };
};

test('464, 474: the three skills, shown as plain words and glyphs, never numbers', () => {
  const c = fresh();
  assert.deepEqual(Object.keys(sheriffOf(c).skill).sort(), ['awareness', 'precision', 'toughness']);
  for (const m of c.view().crew) {
    assert.deepEqual(m.skills.map((s) => s.label), ['Precision', 'Toughness', 'Awareness']);
    for (const s of m.skills) assert.ok(typeof s.word === 'string' && s.glyph && s.means);
  }
  assert.deepEqual(['green', 'fair', 'good', 'seasoned', 'exceptional'].map((w, i) => P.levelWord([0.3, 0.45, 0.6, 0.7, 0.9][i])), ['green', 'fair', 'good', 'seasoned', 'exceptional']);
});

test('464: a save from before the Release reads aim, nerve and handling as the three skills', () => {
  const c = fresh('RELEASE-MIGRATE');
  const old = JSON.parse(c.save());
  old.crew[0].skill = { aim: 0.8, nerve: 0.6, handling: 0.6 };
  delete old.crew[0].acquired;
  const back = Campaign.load(JSON.stringify(old));
  const s = back.state.crew[0].skill;
  assert.ok(Math.abs(s.precision - 0.7) < 1e-9 && s.toughness === 0.6 && Math.abs(s.awareness - 0.65) < 1e-9);
  assert.deepEqual(back.state.crew[0].acquired, []);
});

test('469: a teammate from before the Release keeps the name his settled cases gave him', () => {
  const c = fresh('RELEASE-MIGRATE-NAME');
  const old = JSON.parse(c.save());
  old.crew[1].cases = 10;
  delete old.crew[1].reputation;
  delete old.crew[0].reputation;
  const back = Campaign.load(JSON.stringify(old));
  assert.deepEqual(back.state.crew.map((m) => m.reputation), [0, 30]);
});

test('466: hard work on the road wears a tough man less', () => {
  const c = fresh('RELEASE-ROAD-WORK');
  const [a, b] = [sheriffOf(c), deputyOf(c)];
  a.skill.toughness = 0.9;
  b.skill.toughness = 0.1;
  c.state.journey = { to: 'bisbee-az', party: [a.id, b.id], legs: [], km: 1, doneKm: 0, rollAcc: 0, pending: { kind: 'choice', options: [{ id: 'help', eff: { fatigue: 0.1 } }] } };
  assert.ok(c.choose('help').ok);
  assert.ok(a.fatigue < 0.1 && b.fatigue > 0.1);
});

test('473, 475: the share reads the Sim\'s own tally of rounds fired, and carrying the sheriff out is a significant protective act', () => {
  const c = fresh('RELEASE-CARRY');
  const d = deputyOf(c);
  const k = acceptedHere(c, { tier: 2 });
  const spec = c.encounterSpec(k.id, [d.id]);
  // Note: the sheriff fired and the deputy did not, though the deputy dropped a loaded gun.
  const res = c.applyEncounter(report(spec, {}, { [sheriffOf(c).id]: { fired: { '45colt': 3 } }, [d.id]: { fired: {}, carrier: true } }), spec);
  assert.ok(res.success);
  assert.ok(T.hasTrait(d, 'protective'));
  assert.ok(res.events.some((e) => e.type === 'trait' && e.trait === 'protective' && e.charId === d.id));
});

test('471: a distinctive recruit stays in his town\'s pool through hires, refills and a long absence', () => {
  const c = fresh('RELEASE-KEEP-RECRUIT');
  c.state.rep.team = 50;
  c.state.done = 5;
  c.state.rates = { reward: true };
  R.checkRewards(c.state, []);
  const pool = B.townOf(c.state, 'bodie-ca');
  const ranger = pool.candidates.find((k) => k.distinctive);
  const ordinary = pool.candidates.filter((k) => !k.distinctive);
  assert.ok(c.recruit(ordinary[0].id, { kind: TERMS_KIND[ordinary[0].kind], wageCentsPerWeek: ordinary[0].askWeekly * 2 }).ok);
  assert.ok(pool.candidates.includes(ranger), 'a hire and the refill that follows keep him');
  pool.lastRefresh = c.state.min - 31 * 1440;
  c.state.at = 'bisbee-az';
  advance(c.state, 1440, 'idle');
  assert.ok(B.townOf(c.state, 'bodie-ca').candidates.includes(ranger), 'a pool out of range for a month keeps him');
});

test('465: Precision steadies and settles the aim and quickens the hands, and nothing else', () => {
  const hi = skillMods({ precision: 0.9, toughness: 0.5, awareness: 0.5 });
  const lo = skillMods({ precision: 0.1, toughness: 0.5, awareness: 0.5 });
  assert.ok(hi.aim < 1 && lo.aim > 1 && hi.settle > 1 && lo.settle < 1 && hi.handling > 1 && lo.handling < 1);
  assert.equal(hi.speed, lo.speed);
  assert.equal(hi.notice, lo.notice);
});

test('465: Precision quickens the draw, the hammer and the reload in a saloon gunfight too', () => {
  const fight = (precision) => {
    const c = fresh('RELEASE-BRAWL-GUN');
    c.state.rates = { challenge: 0, fight: 1, spectate: 0, fightTarget: 'sheriff', armed: true };
    sheriffOf(c).skill.precision = precision;
    assert.ok(c.enterSaloon().ok);
    assert.ok(c.saloonActivity('drink').brawl);
    const sim = new BrawlSim(c.brawlChoose(true).brawl);
    sim.draw();
    return sim.player;
  };
  const quick = fight(0.9);
  const slow = fight(0.1);
  assert.ok(quick.drawT < slow.drawT, `draw ${quick.drawT} against ${slow.drawT}`);
  assert.ok(quick.actor.mods.handling > 1 && slow.actor.mods.handling < 1, 'the reload step and the hammer scale by the same factor');
});

test('466: Toughness eases fatigue and steadies the nerve, and adds no health', () => {
  const tough = { skill: { precision: 0.5, toughness: 0.9, awareness: 0.5 }, fatigue: 0 };
  const soft = { skill: { precision: 0.5, toughness: 0.1, awareness: 0.5 }, fatigue: 0 };
  tireAfterFight(tough, 60);
  tireAfterFight(soft, 60);
  assert.ok(tough.fatigue < soft.fatigue);
  const actor = (sk) => applyMember({ traits: {}, wounds: [], weapons: [] }, { skill: sk, fatigue: 0, injuries: [], loadout: [] });
  assert.ok(actor(tough.skill).traits.nerve > actor(soft.skill).traits.nerve);
  assert.ok(!('health' in actor(tough.skill)));
  // Note: the road too: two riders, the tougher wears less.
  const c = fresh('RELEASE-TOUGH');
  const [a, b] = [sheriffOf(c), deputyOf(c)];
  a.skill.toughness = 0.9;
  b.skill.toughness = 0.1;
  c.state.journey = { to: 'bisbee-az', party: [a.id, b.id], legs: [], km: 1, doneKm: 0, rollAcc: 0 };
  advance(c.state, 120, 'travel');
  assert.ok(a.fatigue < b.fatigue);
});

test('467: Awareness quickens a teammate\'s noticing, strengthens the draw-last bonus most, and avoids some road ambushes', () => {
  assert.ok(skillMods({ awareness: 0.9, precision: 0.5, toughness: 0.5 }).notice < 1);
  assert.ok(skillMods({ awareness: 0.1, precision: 0.5, toughness: 0.5 }).notice > 1);
  const base = { precision: 0.5, toughness: 0.5, awareness: 0.5 };
  const up = (k) => warpStrength({ skill: { ...base, [k]: 0.9 } }) - warpStrength({ skill: base });
  assert.ok(up('awareness') > up('toughness') && up('awareness') > up('precision'));
  assert.equal(avoidChance(0.5), 0, 'an ordinary eye avoids nothing by itself');
  assert.ok(avoidChance(0.8) > 0.3 && avoidChance(1) <= 0.6, 'some ambushes, not all');
});

test('463, 473: a settled case names who grew in what; a failed attempt says no one did', () => {
  const c = fresh('RELEASE-GAINS');
  const left = addMate(c, { where: 'contention-az' });
  const k = acceptedHere(c, { tier: 3 });
  const { res } = settleCase(c, k, [deputyOf(c).id]);
  assert.deepEqual(res.gains.map((g) => g.charId).sort(), [sheriffOf(c).id, deputyOf(c).id].sort());
  assert.ok(res.gains.every((g) => g.grew && P.SKILLS.includes(g.skill)));
  assert.ok(!res.gains.some((g) => g.charId === left.id), 'only participants');
  const k2 = acceptedHere(c, { tier: 3 });
  const { res: lost } = settleCase(c, k2, [deputyOf(c).id], { result: 'failure', reason: 'party down' });
  assert.deepEqual(lost.gains, []);
});

test('473: difficulty sets the pool, shared by participation weighted by survival and outcome', () => {
  const sumGain = (tier, size, over = {}, o = {}) => {
    const c = fresh(`RELEASE-POOL-${tier}-${size}`);
    for (let i = 1; i < size - 1; i++) addMate(c, { loyalty: 60 });
    const before = Object.fromEntries(c.state.crew.map((m) => [m.id, P.SKILLS.reduce((s, k) => s + m.skill[k], 0)]));
    const k = acceptedHere(c, { tier });
    c.state.rep.team = 80;
    const { res } = settleCase(c, k, c.state.crew.filter((m) => m.role !== 'sheriff').map((m) => m.id), o, over(c));
    const gain = (id) => P.SKILLS.reduce((s, x) => s + B.charById(c.state, id).skill[x], 0) - before[id];
    return { c, res, gain };
  };
  const easy = sumGain(1, 1, () => ({}));
  const hard = sumGain(5, 1, () => ({}));
  assert.ok(hard.gain('c1') > easy.gain('c1') * 2, 'a harder case teaches more');
  const solo = sumGain(3, 1, () => ({}));
  const team = sumGain(3, 4, () => ({}));
  assert.ok(solo.gain('c1') > team.gain('c1'), 'a larger team splits the pool');
  assert.equal(team.res.gains.length, 4, 'each participant receives a gain');
  const hurt = sumGain(3, 2, (c) => ({ [deputyOf(c).id]: { wounds: [{ region: 'arm', side: 1, severity: 0.3, fatal: false }] } }));
  assert.ok(hurt.gain(deputyOf(hurt.c).id) < hurt.gain('c1'), 'a wounded man\'s share is smaller');
  const civ = sumGain(3, 1, () => ({}), { civilianDied: true });
  assert.ok(civ.gain('c1') < solo.gain('c1'), 'a civilian\'s death lowers the gain');
});

test('463: candidates show their skills and traits in words, with no numbers', () => {
  const c = fresh('RELEASE-HIRE');
  const list = c.candidates();
  assert.ok(list.ok && list.list.length);
  for (const k of list.list) {
    assert.equal(k.skills.length, 3);
    assert.ok(k.skills.every((s) => typeof s.word === 'string'));
    assert.deepEqual(k.traits, [], 'an ordinary candidate has earned no trait yet');
    assert.ok(!('skill' in k));
  }
});

test('468, 475: a habit is earned only by repetition, other traits also by one significant event, and they are permanent', () => {
  const c = fresh('RELEASE-TRAITS');
  const s = sheriffOf(c);
  const events = [];
  T.note(c.state, s, 'drinking', events, { event: true });
  assert.deepEqual(events, [], 'one night does not make a drinker');
  for (let i = 0; i < 8; i++) T.note(c.state, s, 'drinking', events);
  assert.ok(!T.hasTrait(s, 'drinking'));
  T.note(c.state, s, 'drinking', events, { n: 2 });
  const d = deputyOf(c);
  T.note(c.state, d, 'resentment', events, { event: true });
  // Note: item 474: each trait earned is announced once, with its glyph and its meaning.
  assert.deepEqual(events.map((e) => [e.trait, e.glyph, /^.+ has become known as an? .+: .+\.$/.test(e.text)]), [['drinking', 'bottle', true], ['resentment', 'thorn', true]]);
  const back = Campaign.load(c.save());
  assert.ok(T.hasTrait(back.state.crew[0], 'drinking') && T.hasTrait(back.state.crew[1], 'resentment'));
  T.note(c.state, s, 'drinking', events);
  assert.equal(events.length, 2, 'an earned trait is not earned again');
  assert.deepEqual(Object.keys(T.TRAITS).sort(), ['aggression', 'defending', 'drinking', 'favorite-guns', 'gambling', 'generosity', 'loyalty', 'protective', 'receptive', 'resentment', 'self-interest', 'trouble']);
});

test('468: the sheriff\'s drinking and gambling in the saloon are recorded, and the player keeps every choice', () => {
  const c = fresh('RELEASE-SALOON');
  c.state.rates = { challenge: 0, fight: 0, spectate: 0 };
  c.state.cents = 50000;
  assert.ok(c.enterSaloon().ok);
  for (let i = 0; i < 10; i++) assert.ok(c.saloonActivity('drink').ok);
  assert.ok(T.hasTrait(sheriffOf(c), 'drinking'));
  assert.ok(c.saloonActivity('drink').ok, 'a drinker may still choose to drink, or not');
  assert.ok(c.saloonActivity('talk').ok);
});

test('468: traits break ties and colour others\' answers: persuasion manner, a stranger\'s willingness, a hand\'s mood', () => {
  const p = { skill: { precision: 0.5, toughness: 0.5, awareness: 0.52 }, acquired: [] };
  assert.equal(T.persuasionApproach(p), 'explain');
  assert.equal(T.persuasionApproach({ ...p, acquired: ['aggression'] }), 'intimidate');
  const c = fresh('RELEASE-REGARD');
  const cand = Crew.makeCandidate(c.state, 'bodie-ca');
  const offer = { kind: 'appointed', wageCentsPerWeek: cand.askWeekly };
  const plain = Crew.willingness(c.state, cand, offer);
  sheriffOf(c).acquired.push('generosity');
  assert.ok(Crew.willingness(c.state, cand, offer) > plain);
  sheriffOf(c).acquired = ['self-interest'];
  assert.ok(Crew.willingness(c.state, cand, offer) < plain);
  const d = deputyOf(c);
  const m0 = Crew.mood(c.state, d);
  d.acquired.push('loyalty');
  assert.ok(Crew.mood(c.state, d) > m0);
});

test('475: a teammate left to fight alone holds a grudge at once', () => {
  const c = fresh('RELEASE-GRUDGE');
  const d = deputyOf(c);
  c.state.rates = { teammateVisit: 1, teammateFight: 1, teammateChallenge: 0, armed: false };
  const r = c.rest(4);
  assert.ok(r.interrupted && r.brawl);
  const out = c.brawlStayOut();
  assert.ok(out.ok, out.reason);
  assert.ok(T.hasTrait(d, 'resentment'));
  assert.ok(out.events.some((e) => e.type === 'trait' && e.trait === 'resentment' && e.charId === d.id), 'and it is announced');
});

test('475: lending one\'s revolver for a comrade\'s duel counts toward an open hand, and the next open-handed act earns it', () => {
  const lend = (c) => {
    const d = deputyOf(c);
    d.loadout = d.loadout.filter((w) => w.id !== 'colt73');
    assert.ok(c.duelChallenge(d.id, 'insult').ok);
    assert.equal(c.duelPersuade().persuaded, false);
    return c.duelBegin();
  };
  const c = fresh('RELEASE-LEND');
  c.state.rates = { challenge: 0, fight: 0, spectate: 0, persuade: false };
  assert.ok(c.enterSaloon().ok);
  const first = lend(c);
  assert.equal(first.duel.weapon.owner, sheriffOf(c).id, 'the sheriff lends his revolver');
  assert.equal(sheriffOf(c).marks.generosity, 1);
  assert.deepEqual(first.events, []);
  T.note(c.state, sheriffOf(c), 'generosity', first.events);
  assert.ok(T.hasTrait(sheriffOf(c), 'generosity'));
  assert.equal(first.events[0].trait, 'generosity');
});

test('469: standing and its effects are shown; better standing pays better and eases hiring', () => {
  const c = fresh('RELEASE-REP');
  const low = c.view().reputation;
  assert.deepEqual(low.effects.map((e) => e.id), ['office', 'work', 'pay', 'hire', 'talk', 'contacts']);
  assert.ok(low.effects.every((e) => e.text && e.glyph));
  const accept0 = Crew.acceptRatio(c.state);
  c.state.rep = { sheriff: 80, team: 80 };
  assert.ok(Crew.acceptRatio(c.state) < accept0, 'a known sheriff can pay less than asked');
  assert.ok(P.payFactor(80) > P.payFactor(0));
  const high = c.view().reputation;
  assert.notDeepEqual(high.effects, low.effects);
  c.state.rep = { sheriff: 0, team: 80 };
  const k = Cases.offerCase(c.state, 'bodie-ca', 'notice');
  const c2 = fresh('RELEASE-REP');
  const k2 = Cases.offerCase(c2.state, 'bodie-ca', 'notice');
  assert.equal(k.tier, k2.tier);
  assert.ok(k.reward.cents > k2.reward.cents, 'the same offer pays more to a known office');
});

test('469: the talk shown is the talk heard: from the shared standing, asking around turns up one more offer', () => {
  const heard = (team) => {
    const c = fresh('RELEASE-TALK');
    c.state.rep.team = team;
    for (let i = 0; i < 5; i++) Cases.offerCase(c.state, 'bodie-ca', 'townsperson');
    const talk = c.view().reputation.effects.find((e) => e.id === 'talk').text;
    return { talk, count: c.askAround().newCount };
  };
  const below = heard(P.TALK_REP - 1);
  const at = heard(P.TALK_REP);
  assert.equal(at.count, below.count + 1);
  assert.match(below.talk, /only so much/);
  assert.match(at.talk, /tell you more/);
});

test('469: the lowest wage a hire card shows is one the candidate accepts', () => {
  // Note: the last sheriff is famous and known for every kindly trait, so some candidates would sign for next to nothing.
  const kind = ['defending', 'receptive', 'loyalty', 'generosity', 'protective'];
  const shown = [[0, []], [30, []], [60, []], [90, []], [100, kind]].flatMap(([rep, traits]) => {
    const c = fresh(`RELEASE-WAGE-${rep}`);
    c.state.rep.sheriff = rep;
    sheriffOf(c).acquired = traits;
    return c.candidates().list.map((k) => ({ c, k, cand: B.townOf(c.state, 'bodie-ca').candidates.find((x) => x.id === k.id) }));
  });
  const offered = shown.filter(({ k }) => k.lowestWeeklyCents != null);
  assert.ok(offered.length >= 8);
  assert.ok(offered.every(({ k }) => k.lowestWeeklyCents >= 50), 'never nothing');
  const terms = (cand, cents) => ({ kind: TERMS_KIND[cand.kind], wageCentsPerWeek: cents });
  for (const { c, k, cand } of offered) assert.ok(Crew.willingness(c.state, cand, terms(cand, k.lowestWeeklyCents)) >= Crew.WILLING_AT, `${k.name} at ${k.lowestWeeklyCents}`);
  // Note: above the 50-cent floor the shown wage is the least he takes; at the floor he would take even less, and the floor case occurs here.
  for (const { c, k, cand } of offered.filter((x) => x.k.lowestWeeklyCents > 50)) assert.ok(Crew.willingness(c.state, cand, terms(cand, k.lowestWeeklyCents - 50)) < Crew.WILLING_AT, `${k.name} below ${k.lowestWeeklyCents}`);
  assert.ok(offered.some((x) => x.k.lowestWeeklyCents === 50), 'the floor is reached');
});

test('469: a case\'s difficulty weighs the change in the office\'s name', () => {
  const gain = (tier) => {
    const c = fresh(`RELEASE-REPW-${tier}`);
    const k = acceptedHere(c, { tier });
    settleCase(c, k, []);
    return c.state.rep.team;
  };
  assert.ok(gain(5) > gain(1));
});

test('470: a case carries location, defences and accomplices, known only as far as learned; asking turns things up', () => {
  const c = fresh('RELEASE-INTEL');
  c.state.rates = {};
  const k = Cases.offerCase(c.state, 'bodie-ca', 'townsperson');
  k.seen = true;
  k.tier = 4;
  const v0 = c.case(k.id).facets;
  assert.match(v0.location, /nobody has said how to get in/);
  assert.match(v0.defenses, /Nothing is known/);
  assert.equal(v0.accomplices, null);
  const asks = Array.from({ length: ASKED.length }, () => c.askAbout(k.id));
  assert.ok(asks.every((r) => r.ok && r.minutes === 30));
  assert.deepEqual(asks.map((r) => r.learned), ASKED, 'what the questions turn up on this seed, the way in first, until nobody knows more');
  assert.doesNotMatch(c.case(k.id).facets.location, /nobody has said/);
  // Note: user direction: once nobody knows more, it stays that way in this town for the day, and asking again costs no time.
  const min = c.state.min;
  for (let i = 0; i < 5; i++) assert.deepEqual(c.askAbout(k.id), { ok: false, reason: I.DRY_TODAY });
  assert.equal(c.state.min, min, 'a refused question takes no time');
  assert.equal(c.case(k.id).askedDry, true, 'the case card knows the town is dry today');
  advance(c.state, 1440 - (c.state.min % 1440) + 60, 'idle');
  assert.equal(c.case(k.id).askedDry, false, 'a new day, new talk');
  assert.equal(c.askAbout(k.id).ok, true);
});

test('470: the scene follows the case: the counted men, barred entries and a watch', () => {
  const c = fresh('RELEASE-SCENE');
  const k = acceptedHere(c, { tier: 4 });
  const f = I.facetsOf(c.state, k);
  const spec = c.encounterSpec(k.id, []);
  assert.deepEqual(spec.diff.count, [I.menNow(f, k), I.menNow(f, k)]);
  assert.deepEqual(spec.diff.defenses, f.defenses);
  const sim = buildSim({ ...spec, diff: { ...spec.diff, lookouts: 2 } });
  assert.equal(sim.hostiles.filter((h) => h.ai.wary).length, Math.min(2, sim.hostiles.length));
  const quiet = buildSim({ ...spec, diff: { ...spec.diff, lookouts: 0 } });
  assert.equal(quiet.hostiles.filter((h) => h.ai.wary).length, 0);
});

test('470: a barred building has exactly the reported way in, every other entry barred or boarded, across types, complexities and seeds', () => {
  const unforced = (site) => site.entries.filter((e) => stateAt(site.map, 0, e.x, e.y) !== SHUT[e.kind]);
  for (const building of Object.keys(BUILDINGS)) for (const complexity of [0, 0.6, 1]) for (const way of ['front', 'back']) {
    const site = barricade(generateHouse(`BAR-${building}-${complexity}`, { building, complexity, allowSingleStory: true }), way);
    const doors = site.entries.filter((e) => e.kind === 'door').map((e) => e.y);
    const open = unforced(site);
    assert.equal(open.length, 1, `${building} ${complexity} ${way}: one way in (item 70)`);
    assert.equal(open[0].y, WAY_Y[way](...doors), `${building} ${complexity} ${way}: the reported door`);
    assert.ok(validateHouse(site, [1, 8]).ok, `${building} ${complexity} ${way}: still valid`);
  }
});

test('470: what a report tells is what the scene holds: the way in of a barred building and a veteran lieutenant', () => {
  const c = fresh('RELEASE-LIEUTENANT');
  // Note: on this seed the first case's men are hardened and keep no door barred; the second's have barred a building, keep the front door, and have a lieutenant.
  const open = acceptedHere(c, { tier: 4 });
  const barred = acceptedHere(c, { tier: 4 });
  open.known.location = true;
  barred.known.location = true;
  assert.match(c.case(open.id).facets.location, /no door is barred/);
  assert.match(c.case(barred.id).facets.location, /only the front door is not barred/);
  const spec = c.encounterSpec(barred.id, []);
  assert.deepEqual([spec.diff.way, spec.diff.lieutenant, spec.diff.defenses.includes('barred')], ['front', true, true]);
  const sim = buildSim(spec);
  assert.equal(sim.hostiles[1].traits.experience, 'veteran', 'the lieutenant');
  const doors = sim.house.entries.filter((e) => e.kind === 'door');
  const usable = sim.house.entries.filter((e) => stateAt(sim.map, 0, e.x, e.y) !== SHUT[e.kind]);
  assert.deepEqual(usable.map((e) => e.y), [Math.max(...doors.map((e) => e.y))], 'the front door is the one way in');
});

test('470: harder and later cases have more defences', () => {
  const count = (tier, done) => Array.from({ length: 40 }, (_, i) => I.makeFacets('V', { id: `q${i}`, tier, site: { kind: 'house' } }, done).defenses.length).reduce((s, n) => s + n, 0);
  assert.ok(count(5, 10) > count(1, 0));
});

test('471: access rewards stay hidden until found, then open distinctive recruits, equipment and better pay', () => {
  const c = fresh('RELEASE-REWARD');
  assert.deepEqual(c.view().rewards, []);
  assert.ok(!JSON.stringify(c.view()).includes('Ranger'), 'nothing tells what is still to be found');
  c.state.rep.team = 50;
  c.state.done = 5;
  c.state.rates = { reward: true };
  const events = [];
  R.checkRewards(c.state, events);
  const ranger = events.find((e) => e.id === 'ranger');
  assert.ok(ranger && ranger.kind === 'recruit');
  const cand = B.townOf(c.state, ranger.place).candidates.find((k) => k.distinctive);
  assert.ok(cand && cand.acquired.includes('defending'));
  assert.ok(c.view().rewards.some((x) => x.id === 'ranger'));
  R.featKind(c.state, 'stage-robbers');
  R.checkRewards(c.state, events);
  assert.ok(R.found(c.state, 'express'));
  assert.ok(R.rewardBonus(c.state, 'stage-robbers') > 1 && R.rewardBonus(c.state, 'claim-jumpers') === 1);
  c.state.done = 6;
  R.checkRewards(c.state, events);
  assert.ok(R.found(c.state, 'gunsmith'));
  assert.equal(events.filter((e) => e.id === 'ranger').length, 1, 'a reward is found once');
});

test('477: a case building\'s complexity follows its type, the difficulty and the place', () => {
  const c = fresh('RELEASE-COMPLEX');
  const k1 = acceptedHere(c, { tier: 1 });
  const k5 = acceptedHere(c, { tier: 5 });
  const a = c.encounterSpec(k1.id, []).diff.complexity;
  const b = c.encounterSpec(k5.id, []).diff.complexity;
  assert.ok(a >= 0 && b <= 1 && b > a);
});

test('simSkill: the Sim reads the campaign skills and passes its own through', () => {
  assert.deepEqual(simSkill({ precision: 0.7, toughness: 0.6, awareness: 0.4 }), { aim: 0.7, handling: 0.7, nerve: 0.6, awareness: 0.4 });
  assert.deepEqual(simSkill({ aim: 0.2, nerve: 0.9 }), { aim: 0.2, nerve: 0.9, handling: 0.5, awareness: 0.5 });
});

test('465, 467: Precision does not make a lawman a veteran; experience, and with it reaction, comes from Toughness and Awareness', () => {
  const actor = (sk) => applyMember({ traits: {}, wounds: [], weapons: [] }, { skill: sk, fatigue: 0, injuries: [], loadout: [] });
  assert.equal(actor({ precision: 0.95, toughness: 0.5, awareness: 0.3 }).traits.experience, 'seasoned');
  assert.equal(actor({ precision: 0.3, toughness: 0.8, awareness: 0.8 }).traits.experience, 'veteran');
});

test('473: an unfit teammate in the scene takes no share; 469: a settled case adds to each teammate\'s own name', () => {
  const c = fresh('RELEASE-PASSIVE');
  const d = deputyOf(c);
  const k = acceptedHere(c, { tier: 2 });
  const spec = c.encounterSpec(k.id, [d.id]);
  c.state.active.passive = [d.id];
  const name = d.reputation;
  const res = c.applyEncounter(report(spec), spec);
  assert.deepEqual(res.gains.map((g) => g.charId), [sheriffOf(c).id]);
  assert.equal(d.reputation, name + 3);
});
