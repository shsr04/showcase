// Note: Prototype 2 campaign core: state, the clock, crew, economy, cases, the facade and the handling of a Sim report (Contract S).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lawmenReport as report } from './western-test-helpers.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { P2_START } from '../public/western/js/camp/state.js';
import { holdCrew } from './western-test-helpers.mjs';

const camp = (name) => import(new URL(`../public/western/js/camp/${name}.js`, import.meta.url));

const { Campaign } = await camp('campaign');
const { advance, newState, deserialise } = await camp('state');
const B = await camp('base');
const Crew = await camp('crew');
const Eco = await camp('economy');
const Cases = await camp('cases');
const W = await camp('world');

const SEED = 'TOMBSTONE-101';
const fresh = (seed = SEED) => Campaign.create(seed, P2_START);

// Note: a deputy added straight to the state, in the party unless told otherwise.
function addMate(c, o = {}) {
  const m = Crew.makeChar(c.state, {
    role: 'deputy', loyalty: 60, where: 'party', terms: { kind: 'appointed', wageCentsPerWeek: 1400 }, wageDueMin: c.state.min + 7 * 1440, ...o,
  });
  c.state.crew.push(m);
  holdCrew(c.state);
  return m;
}

// Note: makes sure both kinds of candidate are on offer in Tombstone, whatever the seed drew.
function withCandidates(c) {
  const list = B.townOf(c.state, 'bodie-ca').candidates;
  for (let i = 0; i < 40 && !(list.some((k) => k.kind === 'appointed') && list.some((k) => k.kind === 'independent')); i++) list.push(Crew.makeCandidate(c.state, 'bodie-ca'));
}

// Note: a case at Tombstone that the party has accepted, for scenes in a house.
function acceptedHere(c, o = {}) {
  const k = Cases.offerCase(c.state, 'bodie-ca', 'notice');
  k.location = o.location || 'bodie-ca';
  k.site = o.site || { kind: 'house', terrain: null, label: 'a house at the edge of town' };
  k.seen = true;
  k.tier = o.tier || 1;
  k.extra = 0;
  Object.assign(k, o.over || {});
  const r = c.accept(k.id);
  assert.ok(r.ok, r.reason);
  return k;
}


const ammoTotal = (s) => s.ammo['44-40'] + s.ammo['45colt'];

// Note: the terms kind an offer takes for each kind of candidate, and an offer of the given weekly wage to one.
const TERMS_KIND = { appointed: 'appointed', independent: 'ongoing' };
const offerOf = (cand, cents) => ({ kind: TERMS_KIND[cand.kind], wageCentsPerWeek: cents });

test('item 147: the campaign starts in Tombstone with the original sheriff, deputy and horse', () => {
  const c = fresh();
  const s = c.state;
  assert.equal(s.at, 'bodie-ca');
  assert.equal(s.journey, null);
  assert.equal(s.min, 0);
  assert.deepEqual(s.known, ['bodie-ca']);
  assert.deepEqual(s.crew.map((x) => [x.id, x.role, x.where]), [['c1', 'sheriff', 'party'], ['c2', 'deputy', 'party']]);
  for (const x of s.crew) assert.match(x.name, /^\S+ \S+$/, 'each has a first name and a surname, not a role');
  assert.equal(s.transport.kind, 'horse');
  assert.equal(s.cents, W.START_CENTS);
  for (const m of s.crew) {
    assert.deepEqual(m.loadout, [{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '45colt' }]);
    assert.deepEqual(m.skill, { precision: 0.5, toughness: 0.5, awareness: 0.5 }, 'the Prototype 1 baseline');
    assert.equal(m.fatigue, 0);
    assert.deepEqual(m.injuries, []);
  }
  assert.equal(c.view().time.label, 'Monday 12 September 1881');
  assert.equal(c.view().time.time, '06:00');
  assert.equal(s.ended, null);
  assert.equal(Object.keys(s.rep).sort().join(), 'sheriff,team');
});

test('state: a seed word is normalised and the same seed starts the same campaign', () => {
  assert.equal(Campaign.create('tombstone 101!', P2_START).state.seed, 'TOMBSTONE101');
  assert.equal(Campaign.create(SEED, P2_START).save(), Campaign.create(SEED, P2_START).save());
  assert.notEqual(Campaign.create(SEED, P2_START).save(), Campaign.create('BISBEE-202', P2_START).save());
  assert.ok(Campaign.create('', P2_START).state.seed.length > 3);
});

test('state: save and load round-trip, and a loaded game continues exactly as the original', () => {
  const a = fresh();
  a.readNotices();
  a.askAround();
  advance(a.state, 3 * 1440, 'idle');
  const b = Campaign.load(a.save());
  assert.equal(b.save(), a.save());
  for (const x of [a, b]) {
    x.readNotices();
    advance(x.state, 4 * 1440, 'idle');
    x.askAround();
  }
  assert.equal(b.save(), a.save());
  assert.throws(() => Campaign.load('{"v":99}'));
  assert.throws(() => Campaign.load('not json'));
});

test('time: only the clock function moves state.min', () => {
  const dir = new URL('../public/western/js/camp/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.js'));
  const writes = Object.fromEntries(files.map((f) => [f, (readFileSync(new URL(f, dir), 'utf8').match(/\bstate\.min\s*(\+=|-=|=(?!=))/g) || []).length]));
  assert.equal(writes['state.js'], 1, 'state.js moves the clock in exactly one place');
  for (const f of files.filter((n) => n !== 'state.js')) assert.equal(writes[f], 0, `${f} moves the clock`);
});

test('time: the clock ages wages, healing, fatigue, case timers and refreshes the towns in one go', () => {
  const c = fresh();
  const s = c.state;
  s.crew[1].fatigue = 0.6;
  Crew.addInjuries(s.crew[1], [{ region: 'arm', side: 1, severity: 0.3 }]);
  const cases0 = s.cases.length;
  const cents0 = s.cents;
  // Note: the four first offers outlast nine days, so the clock runs on until some lapse and the town target refills the board.
  const ev = advance(s, 13 * 1440, 'idle');
  assert.equal(s.min, 13 * 1440);
  assert.ok(s.crew[1].fatigue < 0.1);
  assert.ok(s.cents < cents0, 'wages and lodging');
  assert.ok(ev.some((e) => e.type === 'wage'));
  assert.ok(s.cases.length > cases0, 'new offers arrive');
  assert.ok(s.cases.some((k) => k.status === 'expired'));
  assert.equal(s.crew[1].injuries.length, 1, 'the injury leaves a mark');
  assert.ok(s.crew[1].injuries[0].healed > 0.5, 'it mends');
  assert.deepEqual(advance(s, 0, 'idle'), []);
});

test('item 127: offers appear unseen; reading the board and asking around show them, in time', () => {
  const c = fresh();
  const t0 = c.town();
  assert.deepEqual(t0.notices, []);
  assert.deepEqual(t0.offers, []);
  const min = c.state.min;
  const n = c.readNotices();
  assert.ok(n.ok);
  assert.equal(c.state.min - min, 20);
  const a = c.askAround();
  assert.ok(a.ok);
  assert.ok(c.state.min - min >= 65);
  const t1 = c.town();
  for (const k of [...t1.notices, ...t1.offers]) {
    assert.ok(k.title && k.text && k.reward && k.location.name);
    assert.match(k.deadline, /\w/);
    assert.match(k.men, /\w/);
  }
  assert.ok(t1.notices.length + t1.offers.length >= 1);
  for (let i = 0; i < 5; i++) c.askAround();
  c.readNotices();
  const seen = c.town();
  for (const k of seen.notices) assert.equal(c.state.cases.find((x) => x.id === k.id).giver, 'notice');
  for (const k of seen.offers) assert.equal(c.state.cases.find((x) => x.id === k.id).giver, 'townsperson');
});

function learn(c, id) {
  B.learn(c.state, id);
}

test('item 106: an offer left alone develops', () => {
  const c = fresh();
  for (let i = 0; i < 80; i++) Cases.refresh(c.state);
  assert.ok(c.state.cases.some((k) => k.extra > 0 && k.history.some((h) => /grown/.test(h.text))));
});

test('item 162: the supply of offers does not depend on how many were solved', () => {
  const c = fresh();
  for (let d = 0; d < 20; d++) advance(c.state, 1440, 'idle');
  const open = Cases.openCases(c.state).length;
  assert.ok(open >= 4 && open <= 7, `open: ${open}`);
});

test('items 163, 166: harder cases open with completed cases and reputation, never past tier five', () => {
  const s = newState(SEED, P2_START);
  assert.equal(Cases.maxTier(s), 1);
  s.done = 1;
  assert.equal(Cases.maxTier(s), 2);
  s.done = 3;
  assert.equal(Cases.maxTier(s), 3);
  s.rep.sheriff = 50;
  assert.equal(Cases.maxTier(s), 5);
  s.done = 40;
  s.rep.sheriff = 100;
  assert.equal(Cases.maxTier(s), 5);
  const t = newState('TIER-1', P2_START);
  for (let d = 0; d < 30; d++) advance(t, 1440, 'idle');
  for (const k of t.cases.filter((x) => !x.prev)) assert.ok(k.tier <= 1, `tier ${k.tier}`);
});

test('item 116: intel is vague where the world is vague', () => {
  const c = fresh();
  for (let d = 0; d < 6; d++) advance(c.state, 1440, 'idle');
  const kinds = new Set();
  for (const k of c.state.cases.filter((x) => x.status === 'available')) {
    k.seen = true;
    const i = c.case(k.id);
    kinds.add(i.deadlineKind);
    assert.match(i.deadline, /\w/);
    assert.equal(typeof i.men, 'string');
    assert.ok(!('skill' in i));
    assert.ok(!('hostileHint' in i), 'the exact hint is not handed over');
  }
  assert.ok(kinds.size >= 1 && !kinds.has(undefined));
});

test('item 177: more than one case can be accepted at once and each keeps its own state', () => {
  const c = fresh();
  const a = acceptedHere(c);
  const b = acceptedHere(c);
  assert.notEqual(a.id, b.id);
  assert.equal(c.view().accepted.length, 2);
  assert.equal(c.cases().length, 2);
  assert.ok(c.cases().every((i) => i.status === 'accepted'));
  const spec = c.encounterSpec(b.id);
  assert.ok(spec.ok);
  assert.equal(spec.caseId, b.id);
  const res = c.applyEncounter(report(spec), spec);
  assert.ok(res.ok);
  assert.equal(a.status, 'accepted');
  assert.equal(b.status, 'completed');
  assert.equal(c.view().accepted.length, 1);
});

test('item 155: a failed attempt is never a failure of the case; it stays open until it lapses', () => {
  const c = fresh();
  const k = acceptedHere(c);
  const spec = c.encounterSpec(k.id);
  const res = c.applyEncounter(report(spec, { result: 'failure', hostilesDown: 1 }), spec);
  assert.equal(res.success, false);
  assert.equal(res.retry, true);
  assert.equal(k.status, 'accepted');
  assert.equal(k.attempts, 1);
  assert.equal(res.rewardCents, 0);
  const spec2 = c.encounterSpec(k.id);
  assert.notEqual(spec2.seed, spec.seed, 'the next attempt is a fresh run');
  c.cancelEncounter();
  k.expiresMin = c.state.min + 10;
  advance(c.state, 30, 'idle');
  assert.equal(k.status, 'expired');
  const allowed = new Set(['available', 'accepted', 'completed', 'abandoned', 'expired']);
  for (const x of c.state.cases) assert.ok(allowed.has(x.status));
  assert.ok(!c.state.cases.some((x) => x.status === 'failed'));
});

test('item 155: an accepted case can be abandoned at a price to reputation', () => {
  const c = fresh();
  c.state.rep.sheriff = 30;
  const k = acceptedHere(c);
  const r = c.abandon(k.id);
  assert.ok(r.ok);
  assert.equal(k.status, 'abandoned');
  assert.ok(c.state.rep.sheriff < 30);
  assert.equal(c.abandon(k.id).ok, false);
});

test('item 133: payment depends on the terms and on the outcome', () => {
  const mk = (terms) => ({ reward: { cents: 10000, terms, perHeadCents: 3000 } });
  assert.equal(Cases.payout(mk('flat'), { hostilesDown: 1 }), 10000);
  assert.equal(Cases.payout(mk('dead-or-alive'), { hostilesDown: 3 }), 10000);
  assert.equal(Cases.payout(mk('per-head'), { hostilesDown: 2 }), 6000);
  assert.equal(Cases.payout(mk('per-head'), { hostilesDown: 3 }), 9000);
  assert.equal(Cases.payout(mk('flat'), { hostilesDown: 3, civilianDied: true }), 7500);
  const c = fresh();
  const k = acceptedHere(c, { over: { reward: { cents: 8000, terms: 'per-head', perHeadCents: 2000 } } });
  const spec = c.encounterSpec(k.id);
  const cents = c.state.cents;
  const res = c.applyEncounter(report(spec, { hostilesDown: 3 }), spec);
  assert.equal(res.rewardCents, 6000);
  assert.equal(c.state.cents, cents + 6000);
  assert.equal(c.state.done, 1);
});

test('items 153, 171, 463: skill gains are only for those who took part, and are shown in words', () => {
  const c = fresh();
  const left = addMate(c, { where: 'contention-az', skill: { precision: 0.5, toughness: 0.5, awareness: 0.5 } });
  const k = acceptedHere(c);
  const sum = (m) => m.skill.precision + m.skill.toughness + m.skill.awareness;
  const before = Object.fromEntries(c.state.crew.map((m) => [m.id, sum(m)]));
  const logLen = c.state.log.length;
  const spec = c.encounterSpec(k.id);
  assert.deepEqual(spec.teamIds, ['c1', 'c2']);
  const res = c.applyEncounter(report(spec), spec);
  assert.ok(res.success);
  for (const id of ['c1', 'c2']) assert.ok(sum(c.state.crew.find((m) => m.id === id)) > before[id], `${id} improved`);
  assert.equal(sum(left), before[left.id], 'a teammate left behind does not improve');
  assert.deepEqual(res.gains.map((g) => g.charId), ['c1', 'c2'], 'the result names who improved');
  assert.ok(c.state.log.length > logLen);
  // Note: items 463, 474: skills are shown as words and glyphs, never as numbers.
  const keys = new Set();
  JSON.stringify([c.view(), c.town(), c.candidates(), c.prepare(), c.doctor()], (key, v) => {
    keys.add(key);
    return v;
  });
  assert.ok(!keys.has('skill') && !keys.has('precision') && !keys.has('toughness') && !keys.has('awareness'), 'no raw skill numbers');
  assert.ok(c.view().crew.every((m) => m.skills.length === 3 && m.skills.every((s) => typeof s.word === 'string' && s.glyph)));
});

test('item 166: reputation is global; it follows the party from town to town', () => {
  const c = fresh();
  const k = acceptedHere(c);
  const spec = c.encounterSpec(k.id);
  const r0 = { ...c.state.rep };
  c.applyEncounter(report(spec), spec);
  assert.ok(c.state.rep.sheriff > r0.sheriff);
  assert.ok(c.state.rep.team > r0.team);
  assert.deepEqual(Object.keys(c.state.rep).sort(), ['sheriff', 'team']);
  const cand = Crew.makeCandidate(c.state, 'contention-az');
  const offer = { kind: 'ongoing', wageCentsPerWeek: cand.askWeekly };
  const here = Crew.willingness(c.state, cand, offer);
  c.state.rep.sheriff = 0;
  assert.ok(Crew.willingness(c.state, cand, offer) < here, 'a better name is heard in the next town too');
  assert.match(c.view().reputation.sheriff, /\w/);
});

test('items 148 to 151: willingness depends on reputation and the pay offered', () => {
  const c = fresh();
  const cand = Crew.makeCandidate(c.state, 'bodie-ca');
  const ask = offerOf(cand, cand.askWeekly);
  const low = { ...ask, wageCentsPerWeek: Math.round(cand.askWeekly * 0.5) };
  const high = { ...ask, wageCentsPerWeek: Math.round(cand.askWeekly * 1.5) };
  assert.ok(Crew.willingness(c.state, cand, high) > Crew.willingness(c.state, cand, ask));
  assert.ok(Crew.willingness(c.state, cand, ask) > Crew.willingness(c.state, cand, low));
  c.state.rep.sheriff = 0;
  const w0 = Crew.willingness(c.state, cand, ask);
  c.state.rep.sheriff = 100;
  assert.ok(Crew.willingness(c.state, cand, ask) > w0);
});

test('items 148 to 151: hiring through the town: candidates, terms, refusal, room, case hands, dismissal', () => {
  const c = fresh();
  c.state.rep.sheriff = 80;
  withCandidates(c);
  const list = c.candidates();
  assert.ok(list.ok && list.list.length >= 2);
  for (const k of list.list) {
    assert.ok(k.name && k.blurb && ['appointed', 'independent'].includes(k.kind));
    assert.ok(!('skill' in k) && !('bias' in k));
  }
  const dep = list.list.find((k) => k.kind === 'appointed');
  const ind = list.list.find((k) => k.kind === 'independent');
  assert.ok(dep && ind, 'both kinds are on offer in this seed');
  {
    assert.equal(c.recruit(dep.id, { kind: 'ongoing', wageCentsPerWeek: 5000 }).ok, false, 'a deputy is appointed');
    const r = c.recruit(dep.id, { kind: 'appointed', wageCentsPerWeek: Math.round(dep.askWeeklyCents * 1.5) });
    assert.ok(r.ok, r.reason);
    assert.equal(r.role, 'deputy');
    assert.equal(c.state.crew.find((x) => x.id === r.charId).where, 'bodie-ca');
    assert.ok(!c.candidates().list.some((k) => k.id === dep.id), 'the candidate is gone from the list');
  }
  {
    assert.equal(c.recruit(ind.id, { kind: 'appointed', wageCentsPerWeek: 5000 }).ok, false);
    assert.equal(c.recruit(ind.id, { kind: 'case', caseId: 'q404', casePayCents: 5000 }).ok, false, 'no such case');
    const r = c.recruit(ind.id, { kind: 'ongoing', wageCentsPerWeek: Math.round(ind.askWeeklyCents * 1.5) });
    assert.ok(r.ok, r.reason);
    assert.equal(r.role, 'hire');
  }
  const poor = fresh();
  poor.state.rep.sheriff = 0;
  const k = poor.candidates().list[0];
  const terms = offerOf(k, 300);
  const refused = poor.recruit(k.id, terms);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /turns it down/);
  assert.equal(poor.recruit('k999', terms).ok, false);
  const full = fresh();
  full.state.rep.sheriff = 90;
  // Note: the office is filled to the cap of its team reputation (item 322).
  while (Crew.officeCount(full.state) < Crew.teamLimits(full.state.rep.team).office) addMate(full);
  const k2 = full.candidates().list[0];
  assert.equal(full.candidates().room, 0);
  assert.equal(full.recruit(k2.id, offerOf(k2, 5000)).ok, false);
  const m = full.state.crew[3];
  assert.ok(full.dismiss(m.id).ok);
  assert.ok(!full.state.crew.includes(m));
  assert.equal(full.dismiss('c1').ok, false, 'the sheriff cannot be dismissed');
});

test('item 149: a hand hired for one case is paid when it is settled and then leaves', () => {
  const c = fresh();
  c.state.rep.sheriff = 90;
  withCandidates(c);
  const k = acceptedHere(c);
  const cand = c.candidates().list.find((x) => x.kind === 'independent');
  assert.ok(cand, 'an independent hand is on offer in this seed');
  const r = c.recruit(cand.id, { kind: 'case', caseId: k.id, casePayCents: Math.max(cand.askCaseCents, 3000) * 2 });
  assert.ok(r.ok, r.reason);
  const spec = c.encounterSpec(k.id, [r.charId]);
  assert.ok(spec.ok);
  const cents = c.state.cents;
  const res = c.applyEncounter(report(spec), spec);
  assert.ok(res.success);
  assert.ok(!c.state.crew.some((x) => x.id === r.charId), 'he goes on his way');
  assert.ok(res.hires.length === 1 && res.hires[0].paid > 0);
  assert.ok(c.state.cents < cents + res.rewardCents, 'his pay comes out of the take');
});

test('items 136, 143: a doctor treats wounds for a price and in time, as well as the doctor can', () => {
  const c = fresh();
  const m = c.state.crew[1];
  Crew.addInjuries(m, [{ region: 'leg', side: 1, severity: 0.5 }]);
  const d = c.doctor();
  assert.ok(d.available);
  assert.equal(d.patients.length, 1);
  const q = d.patients[0].quote;
  assert.ok(q.cents > 0 && q.minutes > 0);
  assert.equal(c.treat('c1').ok, false, 'no wounds, no treatment');
  const cents = c.state.cents;
  const min = c.state.min;
  const r = c.treat('c2');
  assert.ok(r.ok);
  assert.ok(cents - c.state.cents >= q.cents && cents - c.state.cents < q.cents + 100, 'the fee, and a little board for the time');
  assert.ok(c.state.min - min >= q.minutes);
  assert.equal(m.injuries[0].treated, true);
  assert.ok(m.injuries[0].healed > 0);
  assert.equal(c.treat('c2').ok, false, 'already treated');
  const poor = fresh();
  Crew.addInjuries(poor.state.crew[1], [{ region: 'leg', side: 1, severity: 0.5 }]);
  poor.state.cents = 10;
  assert.equal(poor.treat('c2').ok, false);
  const away = fresh();
  learn(away, 'dragoon-az');
  away.state.at = 'dragoon-az';
  assert.equal(away.doctor().available, false);
  assert.equal(away.treat('c2').ok, false);
});

test('item 124: weapons go to a person, within limits, and compatible ammunition decides what can be fired', () => {
  const c = fresh();
  assert.ok(c.buy('colt73-45', 1).ok);
  assert.equal(c.state.crew[0].loadout.filter((w) => w.id === 'colt73').length, 2);
  assert.equal(c.buy('colt73-45', 1).ok, false, 'two revolvers at most (item 367)');
  assert.ok(c.buy('colt73-44', 1, { forId: 'c2' }).ok);
  assert.ok(c.state.crew[1].loadout.some((w) => w.id === 'colt73' && w.ammoType === '44-40'));
  assert.equal(c.buy('colt73-44', 1, { forId: 'c9' }).ok, false);
  const s = c.state;
  assert.equal(c.sell('colt73-45', 1).ok, false, 'weapons are not sold (item 365)');
  s.crew[0].loadout = [{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '45colt' }];
  s.ammo['45colt'] = 0;
  const spec = c.encounterSpec(acceptedHere(c).id);
  assert.ok(spec.ok);
  for (const m of [spec.party.sheriff, ...spec.party.deputies]) {
    assert.ok(m.loadout.length >= 1 && m.loadout.every((w) => w.loaded > 0), 'only what can be loaded goes in');
    assert.ok(m.loadout.every((w) => w.ammoType === '44-40'), 'no .45 cartridges, no .45 revolver');
  }
  assert.ok(spec.warnings.some((w) => /no ammunition/.test(w)));
});

test('item 124: transport can be traded and changes what the party can carry; a wagon needs roads', () => {
  const c = fresh();
  const cap0 = Eco.capacity(c.state);
  const r = c.buy('wagon', 1);
  assert.ok(r.ok);
  assert.equal(c.state.transport.kind, 'wagon');
  assert.ok(Eco.capacity(c.state).water > cap0.water);
  learn(c, 'galeyville-az');
  assert.equal(c.depart('galeyville-az').ok, false, 'no wagon road to Galeyville');
  assert.equal(c.buy('wagon', 1).ok, false, 'already have one');
  const sold = c.sell('wagon', 1);
  assert.ok(sold.ok);
  assert.equal(c.state.transport.kind, 'foot');
  assert.equal(Eco.capacity(c.state).feed, 0);
  assert.ok(c.buy('mule', 1).ok);
  assert.equal(c.state.transport.kind, 'mule');
});

test('loadout order: the long gun is always first and the handgun second, after stowing, taking back, buying and loading', () => {
  const c = fresh();
  const ids = (i) => c.state.crew[i].loadout.map((w) => w.id);
  assert.deepEqual(ids(1), ['winchester73', 'colt73']);
  assert.ok(c.carry('c2', 0, false).ok, 'the long gun is stowed');
  assert.ok(c.carry('c2', 0, true).ok, 'and taken back');
  assert.deepEqual(ids(1), ['winchester73', 'colt73'], 'it goes back to the front');
  c.state.crew[0].loadout = [{ id: 'colt73', ammoType: '45colt' }];
  c.state.cents = 1e7;
  assert.ok(c.buy('winchester73', 1).ok);
  assert.deepEqual(ids(0), ['winchester73', 'colt73'], 'a bought long gun goes first');
  const saved = JSON.parse(c.save());
  saved.crew[1].loadout.reverse();
  assert.deepEqual(deserialise(saved).crew[1].loadout.map((w) => w.id), ['winchester73', 'colt73'], 'an old save is put in order');
});

test('contract S: the same case and attempt give the same scene; seeds follow the attempt', () => {
  const a = fresh();
  const b = fresh();
  const ka = acceptedHere(a);
  const kb = acceptedHere(b);
  assert.equal(a.encounterSpec(ka.id).seed, b.encounterSpec(kb.id).seed);
  const s1 = a.encounterSpec(ka.id);
  a.applyEncounter(report(s1, { result: 'failure' }), s1);
  assert.notEqual(a.encounterSpec(ka.id).seed, s1.seed);
});

test('items 161, 164, 169, 319, 322: teammates up to the limit of the team reputation go in with the sheriff, chosen from those who travelled and are fit', () => {
  const c = fresh();
  c.state.rep.team = 40;
  for (let i = 0; i < 5; i++) addMate(c);
  const k = acceptedHere(c);
  const ids = c.state.crew.filter((m) => m.role !== 'sheriff').map((m) => m.id);
  assert.equal(ids.length, 6);
  assert.equal(c.encounterSpec(k.id, ids.slice(0, 6)).ok, false, 'six teammates are too many at 40 to 59');
  const five = c.encounterSpec(k.id, ids.slice(0, 5));
  assert.ok(five.ok);
  assert.equal(five.party.deputies.length, 5);
  assert.equal(five.teamIds.length, 6);
  const dflt = c.encounterSpec(k.id);
  assert.equal(dflt.party.deputies.length, 5, 'by default the first five go');
  const hurt = c.state.crew.find((m) => m.id === ids[0]);
  Crew.addInjuries(hurt, [{ region: 'chest', side: 0, severity: 1 }, { region: 'leg', side: 0, severity: 0.7 }]);
  assert.equal(Crew.isFit(hurt), false);
  assert.equal(c.encounterSpec(k.id, [hurt.id]).ok, false, 'a man laid up cannot go in');
  assert.ok(!c.encounterSpec(k.id).teamIds.includes(hurt.id));
  const away = addMate(c, { where: 'contention-az' });
  assert.equal(c.encounterSpec(k.id, [away.id]).ok, false, 'one who stayed in another town cannot');
  assert.equal(c.encounterSpec(k.id, ['c1', 'c1', ids[1]]).party.deputies.length, 1, 'the sheriff is not counted twice');
});

test('item 169: a teammate hired in the town of the case is present and can go in, and then rides with the party', () => {
  const c = fresh();
  const hand = addMate(c, { where: 'bodie-ca' });
  const gone = addMate(c, { where: 'benson-az' });
  const k = acceptedHere(c);
  assert.deepEqual(c.encounterSpec(k.id).teamIds, ['c1', 'c2', hand.id], 'by default those present go');
  assert.equal(c.encounterSpec(k.id, [gone.id]).ok, false);
  const spec = c.encounterSpec(k.id, [hand.id]);
  c.applyEncounter(report(spec), spec);
  assert.equal(hand.where, 'party');
  assert.equal(gone.where, 'benson-az');
});

test('items 164, 169: the team is chosen again for every attempt', () => {
  const c = fresh();
  const a = addMate(c);
  const b = addMate(c);
  const k = acceptedHere(c);
  const s1 = c.encounterSpec(k.id, [a.id]);
  assert.deepEqual(s1.teamIds, ['c1', a.id]);
  c.applyEncounter(report(s1, { result: 'failure' }), s1);
  const s2 = c.encounterSpec(k.id, [b.id]);
  assert.deepEqual(s2.teamIds, ['c1', b.id]);
  assert.equal(c.state.active.teamIds.length, 2);
});

test('ammunition pool: a scene takes cartridges from the pool and gives back what survivors hold', () => {
  const c = fresh();
  const k = acceptedHere(c);
  const before = { ...c.state.ammo };
  const spec = c.encounterSpec(k.id);
  const charged = c.state.active.alloc.charged;
  assert.equal(c.state.ammo['44-40'], before['44-40'] - charged['44-40']);
  assert.ok(charged['44-40'] > 0);
  const again = c.encounterSpec(k.id);
  assert.equal(c.state.ammo['44-40'], before['44-40'] - charged['44-40'], 'asking again does not charge twice');
  assert.deepEqual(again.party, spec.party);
  assert.ok(c.cancelEncounter().cancelled);
  assert.deepEqual(c.state.ammo, before, 'backing out gives everything back');
  assert.equal(c.cancelEncounter().cancelled, false);
  const s2 = c.encounterSpec(k.id);
  const fired = report(s2, {}, { c1: { loadout: s2.party.sheriff.loadout.map((w) => ({ ...w, loaded: w.loaded - 4 })) } });
  const lawman = fired.lawmen[0];
  lawman.rounds = { '44-40': lawman.reserve['44-40'] + 11, '45colt': lawman.reserve['45colt'] + 6 };
  const total = ammoTotal(c.state);
  c.applyEncounter(fired, s2);
  assert.ok(ammoTotal(c.state) > total, 'survivors bring their cartridges home');
  assert.ok(c.state.ammo['44-40'] <= before['44-40'] + 20);
  assert.equal(c.applyEncounter(fired, s2).ok, false, 'a report is applied once');
});

test('ammunition pool: a dead man\'s cartridges come home only after a win; an empty pool still arms the sheriff', () => {
  const lost = (result) => {
    const c = fresh();
    const k = acceptedHere(c);
    const before = ammoTotal(c.state);
    const spec = c.encounterSpec(k.id);
    const dead = spec.party.deputies[0];
    const mine = dead.reserve['44-40'] + dead.reserve['45colt'] + dead.loadout.reduce((s, w) => s + w.loaded, 0);
    const r = report(spec, { result }, { c2: { status: 'dead', cause: 'chest wound' } });
    r.lawmen[1].rounds = { '44-40': mine, '45colt': 0 };
    c.applyEncounter(r, spec);
    return { before, after: ammoTotal(c.state), mine };
  };
  const won = lost('success');
  const fail = lost('failure');
  assert.ok(won.after > fail.after, 'a win recovers a dead man\'s rounds');
  const c = fresh();
  c.state.ammo = { '44-40': 0, '45colt': 0 };
  const k = acceptedHere(c);
  const spec = c.encounterSpec(k.id);
  assert.ok(spec.party.sheriff.loadout.length >= 1, 'the office issues a few rounds');
  assert.ok(c.state.log.some((l) => /office issues/.test(l.text)));
});

test('items 128, 171: weapons dropped in a lost fight are lost; after a win they are picked up again', () => {
  // Note: per result, the weapons kept and the weapons lost.
  for (const [result, kept, lost] of [['success', 2, 0], ['failure', 1, 1]]) {
    const c = fresh();
    const k = acceptedHere(c);
    const spec = c.encounterSpec(k.id);
    const d = spec.party.deputies[0];
    const r = report(spec, { result }, { c2: { loadout: d.loadout.filter((w) => w.id === 'winchester73'), floor: [{ id: 'colt73', ammoType: '45colt' }] } });
    const res = c.applyEncounter(r, spec);
    assert.equal(c.state.crew.find((m) => m.id === 'c2').loadout.length, kept, result);
    assert.equal(res.lostWeapons.length, lost);
  }
});

test('hole a: a fatal wound still running at the end kills in both outcomes; other wounds persist', () => {
  for (const result of ['success', 'failure']) {
    const c = fresh();
    c.state.rep.team = 20;
    addMate(c);
    addMate(c);
    const k = acceptedHere(c);
    const spec = c.encounterSpec(k.id, ['c2', 'c3', 'c4']);
    const r = report(spec, { result }, {
      c2: { wounds: [{ region: 'arm', side: 1, severity: 0.3, fatal: false }] },
      c3: { status: 'incapacitated', wounds: [{ region: 'leg', side: -1, severity: 0.4, fatal: false }] },
      c4: { dying: true, wounds: [{ region: 'chest', side: 0, severity: 0.9, fatal: true }] },
    });
    const res = c.applyEncounter(r, spec);
    assert.deepEqual(res.deaths.map((d) => d.charId), ['c4'], result);
    assert.ok(!c.state.crew.some((m) => m.id === 'c4'));
    assert.equal(c.state.fallen.length, 1);
    assert.equal(c.state.fallen[0].char.id, 'c4');
    assert.match(c.state.fallen[0].cause, /wound|died/);
    const c2 = c.state.crew.find((m) => m.id === 'c2');
    assert.equal(c2.injuries.length, 1);
    assert.equal(c2.injuries[0].region, 'arm');
    const c3 = c.state.crew.find((m) => m.id === 'c3');
    assert.ok(c3, 'put down but not dying: alive');
    assert.ok(c3.injuries.some((i) => i.severity >= 0.6), 'with a serious injury');
    assert.ok(res.injuries.find((i) => i.charId === 'c3').serious);
  }
});

test('items 107, 132: wounds persist between scenes and heal with time and care, or leave a mark', () => {
  const c = fresh();
  const m = c.state.crew[1];
  Crew.addInjuries(m, [{ region: 'leg', side: 1, severity: 0.8 }, { region: 'arm', side: 1, severity: 0.2 }]);
  const sim = Crew.simInjuries(m);
  assert.equal(sim.length, 2);
  assert.ok(sim.every((i) => i.severity > 0 && i.severity <= 1));
  assert.equal(typeof Crew.isFit(m), 'boolean');
  advance(c.state, 3 * 1440, 'rest');
  const mid = Crew.burden(m);
  assert.ok(mid < 1.0 && mid > 0);
  advance(c.state, 80 * 1440, 'rest');
  assert.equal(m.injuries.filter((i) => !i.lasting).length, 0, 'closed wounds');
  const marked = c.state.crew[0];
  Crew.addInjuries(marked, Array.from({ length: 6 }, () => ({ region: 'leg', side: 1, severity: 1 })));
  advance(c.state, 80 * 1440, 'rest');
  assert.ok(marked.injuries.length > 0, 'a hard wound can leave a mark');
  for (const i of marked.injuries) {
    assert.ok(i.lasting);
    assert.ok(i.severity < 0.5, 'a lasting impairment is milder than the wound was');
  }
  const impaired = Crew.simInjuries(marked);
  assert.equal(impaired.length, marked.injuries.length, 'each mark reaches the scene');
  for (const i of impaired) assert.ok(i.severity > 0);
  assert.ok(Crew.conditionLabel({ injuries: [] }) === 'sound');
});

test('items 109, 122, 270, 274, 305: when the sheriff dies a very loyal deputy takes the star, otherwise the revenge fails', () => {
  const dies = (c, spec, extra = {}) => c.applyEncounter(report(spec, { result: 'failure' }, { c1: { status: 'dead', cause: 'chest wound' }, ...extra }), spec);
  // Note: a very loyal deputy is promoted and the reputation drops.
  const a = fresh();
  a.state.rep.sheriff = 50;
  a.state.crew[1].loyalty = Crew.VERY_LOYAL;
  const ka = acceptedHere(a);
  const ra = dies(a, a.encounterSpec(ka.id));
  assert.equal(ra.succession.kind, 'deputy-promoted');
  assert.equal(a.state.crew[0].id, 'c2');
  assert.equal(a.state.crew[0].role, 'sheriff');
  assert.equal(a.state.rep.sheriff, 30);
  assert.equal(a.state.ended, null);
  assert.equal(a.state.fallen[0].char.id, 'c1');
  assert.ok(a.state.crew[0].skill.precision === 0.5, 'skills carry forward through succession');
  // Note: a deputy short of very loyal does not carry the revenge on, and the campaign fails.
  const b = fresh();
  b.state.crew[1].loyalty = Crew.VERY_LOYAL - 1;
  const kb = acceptedHere(b);
  const rb = dies(b, b.encounterSpec(kb.id));
  assert.equal(rb.succession.kind, 'ended');
  assert.equal(b.state.ended.outcome, 'failure');
  // Note: no deputy at all, only loyal hands: no outside sheriff takes the revenge on (item 305).
  const c = fresh();
  c.state.crew.splice(1, 1);
  c.state.crew.push(Crew.makeChar(c.state, { role: 'hire', loyalty: 95, terms: { kind: 'ongoing', wageCentsPerWeek: 1600 } }));
  const kc = acceptedHere(c);
  const rc = dies(c, c.encounterSpec(kc.id));
  assert.equal(rc.succession.kind, 'ended');
  assert.equal(c.state.ended.outcome, 'failure');
});

test('items 107, 122, 180, 181: with no one willing to stand for the office, the campaign ends', () => {
  const lone = fresh();
  lone.state.crew.splice(1, 1);
  const k = acceptedHere(lone);
  const spec = lone.encounterSpec(k.id);
  const res = lone.applyEncounter(report(spec, { result: 'failure' }, { c1: { status: 'dead', cause: 'chest wound' } }), spec);
  assert.ok(res.ended);
  assert.match(res.ended.reason, /sheriff is dead/);
  assert.equal(lone.state.ended.reason, res.ended.reason);
  assert.equal(lone.view().ended.reason, res.ended.reason);
  assert.equal(lone.town(), null, 'no more play');
  assert.equal(lone.readNotices().ok, false);
  assert.equal(lone.rest(1).ok, false);
  const surly = fresh();
  surly.state.crew[1].role = 'hire';
  surly.state.crew[1].loyalty = 20;
  Crew.kill(surly.state, surly.state.crew[0], 'shot');
  const r = Crew.succeed(surly.state);
  assert.equal(r.kind, 'ended');
  assert.ok(surly.state.ended);
});

test('items 135, 141: loyalty grows with solved cases, and bonding follows fighting side by side', () => {
  const c = fresh();
  const k = acceptedHere(c);
  const spec = c.encounterSpec(k.id);
  const l0 = c.state.crew[1].loyalty;
  c.applyEncounter(report(spec), spec);
  assert.ok(c.state.crew[1].loyalty > l0);
  assert.equal(c.state.crew[0].loyalty, 100, 'the sheriff has no loyalty to earn');
});

test('hole d: the scene\'s time feeds the world clock and tires the party', () => {
  const c = fresh();
  const k = acceptedHere(c);
  const spec = c.encounterSpec(k.id);
  const min = c.state.min;
  c.applyEncounter(report(spec, { time: 600 }), spec);
  assert.equal(c.state.min - min, 10);
  assert.ok(c.state.crew[0].fatigue >= 0 && c.state.crew[0].fatigue < 0.1);
});

test('item 155: a case that expires while a scene is in progress is not pulled from under the party', () => {
  const c = fresh();
  const k = acceptedHere(c);
  k.expiresMin = c.state.min + 5;
  const spec = c.encounterSpec(k.id);
  const res = c.applyEncounter(report(spec, { time: 1200 }), spec);
  assert.ok(res.success);
  assert.equal(k.status, 'completed');
});

test('facade: results are copies, so a screen cannot change the game by editing them', () => {
  const c = fresh();
  const v = c.view();
  v.crew[0].name = 'Changed';
  v.money.cents = 1;
  assert.notEqual(c.state.crew[0].name, 'Changed');
  assert.equal(c.state.cents, W.START_CENTS);
  const p = c.prepare();
  p.destinations.push({ id: 'x' });
  assert.ok(!c.prepare().destinations.some((d) => d.id === 'x'));
  c.readNotices();
  const t = c.town();
  t.notices.push({});
  assert.notEqual(c.town().notices.length, t.notices.length);
});

test('facade: the same actions on the same seed give the same game, whatever more was asked in between', () => {
  // Note: the questions that only read the game, asked or not.
  const questions = [(c) => c.view(), (c) => c.town(), (c) => c.prepare(), (c) => c.shop(), (c) => c.candidates()];
  const run = (ask) => {
    const c = fresh('DET-5');
    ask(c);
    c.readNotices();
    c.askAround();
    advance(c.state, 2 * 1440, 'idle');
    learn(c, 'contention-az');
    c.depart('contention-az');
    // Note: the same two calls every step, so both runs do exactly the same; the facade turns down the one that does not fit.
    for (let i = 0; i < 400 && c.state.journey; i++) {
      c.advance();
      c.withdraw();
    }
    return c.save();
  };
  assert.equal(run(() => {}), run((c) => questions.map((q) => q(c))));
});

const ROLE_WORD = new RegExp(`^(${Crew.ROLE_WORDS.join('|')})$`, 'i');
const everyName = (state) => [
  ...state.crew.map((c) => c.name),
  ...state.fallen.map((f) => f.char.name),
  ...Object.values(state.towns).flatMap((t) => t.candidates.map((k) => k.name)),
];

test('names: the starting sheriff and deputy have real names drawn from the seed alone', () => {
  const a = fresh('NAMES-1');
  const b = fresh('NAMES-1');
  assert.deepEqual(a.state.crew.map((c) => c.name), b.state.crew.map((c) => c.name), 'same seed, same names');
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const c = fresh(`NAMES-${i}`);
    const [s, d] = c.state.crew;
    assert.doesNotMatch(s.name, ROLE_WORD);
    assert.doesNotMatch(d.name, ROLE_WORD);
    assert.notEqual(s.name, d.name);
    assert.notEqual(s.name.split(' ')[1], d.name.split(' ')[1], 'the two never share a surname');
    assert.equal(s.alias, null);
    assert.equal(d.alias, null);
    seen.add(s.name);
  }
  assert.ok(seen.size >= 6, `the seeds give ${seen.size} different sheriffs out of 8`);
  // Note: the names do not depend on how the game was played before the call
  const played = fresh('NAMES-1');
  advance(played.state, 3 * 1440, 'idle');
  assert.deepEqual(Crew.startNames('NAMES-1').sheriff.name, played.state.crew[0].name);
});

test('names: an old save with the role words as names loads and gets the names of its seed', () => {
  const c = fresh('NAMES-OLD');
  const want = c.state.crew.map((x) => x.name);
  const old = JSON.parse(c.save());
  old.crew[0].name = 'Sheriff';
  old.crew[1].name = 'Deputy';
  for (const x of old.crew) delete x.alias;
  const back = Campaign.load(JSON.stringify(old));
  assert.deepEqual(back.state.crew.map((x) => x.name), want, 'the seed gives the same names as the new game');
  assert.deepEqual(back.state.crew.map((x) => x.alias), [null, null]);
  assert.equal(back.view().crew[0].label, `Sheriff ${want[0]}`);
  // Note: a bare role word on a hired hand and on the fallen is repaired as well, and stays unique
  const odd = JSON.parse(c.save());
  odd.crew.push({ ...odd.crew[1], id: 'c9', role: 'hire', name: 'Hand' });
  odd.fallen.push({ char: { ...odd.crew[1], id: 'c8', role: 'deputy', name: 'Deputy' }, min: 5, where: 'bodie-ca', cause: 'shot' });
  const again = Campaign.load(JSON.stringify(odd));
  const names = everyName(again.state);
  for (const n of names) assert.doesNotMatch(n, ROLE_WORD);
  assert.equal(new Set(names.filter((n, i) => i < 4)).size, 4, 'the repaired names differ from the others');
  assert.deepEqual(Campaign.load(JSON.stringify(odd)).state.crew.map((x) => x.name), again.state.crew.map((x) => x.name), 'repair is deterministic');
  // Note: a save that already has names is left alone
  const named = JSON.parse(c.save());
  named.crew[0].name = 'Ned Orr';
  assert.equal(Campaign.load(JSON.stringify(named)).state.crew[0].name, 'Ned Orr');
});

test('names: nobody in the office or in town shares a full name, over a long campaign', () => {
  const c = fresh('NAMES-SOAK');
  const lasts = new Set();
  let maxSeen = 0;
  const soakDay = (day) => {
    advance(c.state, 1440, 'idle');
    for (const t of Object.values(c.state.towns)) {
      const own = t.candidates.map((k) => k.name.toLowerCase());
      assert.equal(new Set(own).size, own.length, `day ${day}: duplicate candidates ${own}`);
    }
    const all = [...c.state.crew.map((x) => x.name), ...Object.values(c.state.towns).flatMap((t) => t.candidates.map((k) => k.name))].map((n) => n.toLowerCase());
    assert.equal(new Set(all).size, all.length, `day ${day}: a name is in use twice among ${all}`);
    maxSeen = Math.max(maxSeen, all.length);
    for (const n of all) lasts.add(n.split(' ').slice(1).join(' '));
  };
  // Note: the first candidate in Tombstone is hired on the first day of each of the first seven nine-day spans, so the crew grows and the pool is replaced.
  const hire = () => {
    const k = B.townOf(c.state, 'bodie-ca').candidates[0];
    c.state.cents += 100000;
    c.recruit(k.id, offerOf(k, { appointed: k.askWeeklyCents || k.askWeekly || 3000, independent: (k.askWeekly || 4000) * 1.5 }[k.kind]));
  };
  for (let span = 0; span < 7; span++) {
    soakDay(span * 9);
    hire();
    for (let day = span * 9 + 1; day < span * 9 + 9; day++) soakDay(day);
  }
  // Note: the soak runs 70 days.
  for (let day = 63; day < 70; day++) soakDay(day);
  assert.ok(maxSeen >= 6);
  assert.ok(c.state.crew.length >= 4, `the soak hired people: ${c.state.crew.length}`);
  assert.ok(lasts.size >= 10, 'many different surnames come through');
  for (const n of everyName(c.state)) assert.doesNotMatch(n, ROLE_WORD);
});

test('names: candidates keep their nickname and sex, the deputies are men and a hand is sometimes a woman', () => {
  const all = [];
  const shown = [];
  // Note: 10 campaigns give 150 candidates.
  for (let i = 0; i < 10; i++) {
    const c = fresh(`NAMES-CAND-${i}`);
    for (let k = 0; k < 12; k++) B.townOf(c.state, 'bodie-ca').candidates.push(Crew.makeCandidate(c.state, 'bodie-ca'));
    all.push(...B.townOf(c.state, 'bodie-ca').candidates);
    shown.push(...c.candidates().list);
  }
  const appointed = all.filter((x) => x.kind === 'appointed');
  const women = all.filter((k) => k.sex === 'f');
  const nicknamed = all.filter((k) => k.alias);
  assert.ok(appointed.length > 0 && women.length > 0 && nicknamed.length > 0, 'every kind of candidate is drawn');
  for (const k of all) assert.ok(['m', 'f'].includes(k.sex));
  for (const k of appointed) assert.equal(k.sex, 'm', 'a deputy is appointed from the men of the town');
  for (const k of women) assert.doesNotMatch(k.blurb, /Ex-cavalry/);
  const shownNick = shown.filter((x) => x.alias);
  const shownPlain = shown.filter((x) => !x.alias);
  assert.ok(shownNick.length > 0 && shownPlain.length > 0, 'the facade list holds both');
  for (const k of shownNick) assert.equal(k.display, `${k.name.split(' ')[0]} "${k.alias}" ${k.name.split(' ').slice(1).join(' ')}`);
  for (const k of shownPlain) assert.equal(k.display, k.name);
  assert.ok(women.length > 0 && women.length < all.length * 0.1, `${women.length} women of ${all.length}`);
  assert.ok(nicknamed.length > all.length * 0.04 && nicknamed.length < all.length * 0.2, `${nicknamed.length} nicknames of ${all.length}`);
});

test('names: a recruit keeps the name and the nickname the candidate had', () => {
  const c = fresh('NAMES-REC');
  const cand = Crew.makeCandidate(c.state, 'bodie-ca');
  cand.kind = 'independent';
  cand.alias = 'Tex';
  B.townOf(c.state, 'bodie-ca').candidates.push(cand);
  c.state.cents += 100000;
  const r = c.recruit(cand.id, { kind: 'ongoing', wageCentsPerWeek: cand.askWeekly * 2 });
  assert.ok(r.ok, r.reason);
  const m = c.state.crew.find((x) => x.id === r.charId);
  assert.equal(m.name, cand.name);
  assert.equal(m.alias, 'Tex');
  assert.equal(r.label, m.name.split(' ')[0] + ' "Tex" ' + m.name.split(' ').slice(1).join(' '));
});

test('names: no screen data prints a role word where a name belongs', () => {
  const c = fresh('NAMES-VIEW');
  const spec = (() => { const k = acceptedHere(c); return c.encounterSpec(k.id); })();
  assert.equal(spec.party.sheriff.name, c.state.crew[0].name);
  assert.equal(spec.party.deputies[0].name, c.state.crew[1].name);
  const res = c.applyEncounter(report(spec, { result: 'failure' }, { c2: { status: 'dead', cause: 'chest wound' } }), spec);
  assert.deepEqual(res.deaths.map((x) => x.name), [c.state.fallen[0].char.name]);
  for (const x of res.deaths) assert.doesNotMatch(x.name, ROLE_WORD);
  for (const x of c.view().crew) assert.doesNotMatch(x.name, ROLE_WORD);
  for (const l of c.view().log) assert.doesNotMatch(l.text, /\b(Sheriff|Deputy) (is|was|has)\b/, l.text);
  assert.match(c.view().log.map((l) => l.text).join('\n'), new RegExp(c.state.fallen[0].char.name));
});
