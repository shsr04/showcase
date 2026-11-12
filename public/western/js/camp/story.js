// Note: the revenge story (items 263–305): the nemesis, the associates, the leads and the final location; pure, no DOM, and it draws only from its own dice so the campaign's stream stays as it was.

import { seedFromString } from '../rand.js';
import { PLACES, placesWithin, dateOf, distancesFrom } from './world.js';
import { dice, logLine, learn } from './base.js';
import { makeName, startNames } from './names.js';
import { rng as makeRng } from '../rand.js';
import { makeLook, woundMarks } from './looks.js';
import { hooksOf } from './rates.js';
import { loadoutFor, slotOf } from './arsenal.js';

// Note: implementation parameters (items 281, 284): associates per campaign, associate leads that reveal the final location, how far and how often the nemesis rides on.
export const STORY = Object.freeze({
  associates: 5,
  revealAt: 3,
  moveDays: [4, 9],
  moveKm: [60, 320],
  // Note: per settled ordinary case, per saloon talk and per arrival on the road, the chance of a lead.
  caseLead: 0.35,
  saloonLead: 0.12,
  roadLead: 0.1,
  // Note: per notice board look, the chance that an associate's case is posted where the associate is.
  postChance: 0.6,
});

export const TEMPERS = ['proud', 'volatile', 'cautious'];
const MARKS = ['a scar along the cheek', 'a notched ear', 'a cast in one eye', 'a burn on the hand', 'a broken nose badly set'];
const HABITS = ['rides a grey', 'wears a silver concho belt', 'carries two revolvers', 'chews tobacco', 'speaks softly', 'never sits with his back to a door'];
const MOTIVES_UNSAID = 'Nobody knows why.';

// Note: item 301: a rough town is a settled place short of a city, with a saloon, a store, a notice board and people to hire.
export const isRough = (p) => !!(p && p.size <= 3 && p.services && p.services.saloon && p.services.store && p.services.recruit && p.services.notices && !p.uncertain);
export const ROUGH_TOWNS = Object.values(PLACES).filter(isRough).map((p) => p.id);

const streamOf = (tag) => makeRng(seedFromString(tag));

// Note: the starting town for a campaign seed, at random among the rough towns.
// Note: a town with no hideout far enough for the nemesis to ride to is passed over, so he is never in the start town (items 265, 272).
export function startTown(seed) {
  const r = streamOf(`story-start:${seed}`);
  const order = r.shuffle(ROUGH_TOWNS.slice());
  return order.find((id) => hideouts(id, FAR).length) || order[0];
}

// Note: how far the nemesis rides from the start town, in kilometres.
const FAR = [120, 420];

// Note: places a man can lie low in: known or not, but with a saloon or store, within reach of from.
// Note: reach is the road distance from from to every place it connects with; one search serves every call from the same place.
function hideouts(from, km, reach = distancesFrom(from)) {
  return placesWithin(from, km[1]).filter(({ id, km: d }) => d >= km[0] && reach.has(id) && PLACES[id].services && (PLACES[id].services.saloon || PLACES[id].services.store)
    && PLACES[id].sites.length && (PLACES[id].services.ask || PLACES[id].services.notices)).map(({ id }) => id);
}

// Note: item 275: a different nemesis for each seed, with a name, a temper, a mark and a habit; the motive is left untold (item 276).
export function makeStory(seed, startId) {
  const story = { rng: seedFromString(`story:${seed}`), start: startId, nextLead: 1, leads: [], told: 0, finalAt: null, met: false, ended: null, journalSeen: 0 };
  const d = dice(story);
  const nameRng = streamOf(`story-names:${seed}`);
  const who = makeName(nameRng, { use: 'target', alias: 1 });
  const murdered = makeName(nameRng, { use: 'sheriff', alias: 0 });
  const reach = distancesFrom(startId);
  // Note: an old save's town may lack a hideout in the usual band; then he rides to any place within reach but the start.
  const usual = hideouts(startId, FAR, reach);
  const far = usual.length ? usual : hideouts(startId, [30, 900], reach).filter((id) => id !== startId);
  // Note: an associate lives where his case can be posted, a place with its own notice board (item 279).
  const near = hideouts(startId, [30, 520], reach).filter((id) => PLACES[id].services.notices);
  const at = far.length ? d.pick(far) : startId;
  story.murder = { sheriff: murdered.name, at: startId };
  // Note: item 365: his own revolver, of the best handguns of the day.
  const gun = loadoutFor('nemesis', PLACES[startId]?.region, `${seed}:nemesis`).find((w) => slotOf(w) === 'handgun');
  const temper = d.pick(TEMPERS);
  story.nemesis = {
    name: who.name,
    alias: who.alias,
    sex: 'm',
    temper,
    mark: d.pick(MARKS),
    habit: d.pick(HABITS),
    skill: { aim: d.range(0.66, 0.8), nerve: d.range(0.7, 0.85), handling: d.range(0.66, 0.8) },
    reputation: d.int(60, 85),
    at,
    nextMoveMin: d.int(STORY.moveDays[0], STORY.moveDays[1]) * 1440,
    // Note: what the duel needs of him, as of any gunslinger (item 302): his temper, his revolver, his rounds and his wounds.
    id: 'nemesis',
    personality: temper,
    gun,
    weapon: { ...gun },
    ammunition: 36,
    injuries: [],
    alive: true,
    memories: [],
  };
  const taken = new Set([who.name, murdered.name, startNames(seed).sheriff.name, startNames(seed).deputy.name]);
  story.associates = [];
  for (let i = 0; i < STORY.associates; i++) {
    let a = makeName(nameRng, { use: 'target', alias: 0.4 });
    while (taken.has(a.name)) a = makeName(nameRng, { use: 'target', alias: 0.4 });
    taken.add(a.name);
    story.associates.push({
      id: `a${i + 1}`, name: a.name, alias: a.alias || null, at: near.length ? d.pick(near) : startId, status: 'free', known: false, caseId: null, recovery: d.pick(['body', 'belongings', 'witness']),
    });
  }
  return story;
}

export const nemesisLabel = (n) => (n.alias ? `${n.name.split(' ')[0]} "${n.alias}" ${n.name.split(' ').slice(1).join(' ')}` : n.name);

// Note: item 272: what the deputy knows of the nemesis from the start: the face, the name and the traits; never where he is.
export function nemesisTraits(n) {
  return [`${n.temper[0].toUpperCase()}${n.temper.slice(1)} temper`, `marked by ${n.mark}`, `${n.habit}`];
}

const placeName = (id) => (PLACES[id] ? PLACES[id].name : 'somewhere');

// Note: a lead records what was true when it was found (items 287, 292); it is never updated afterwards.
function addLead(state, lead, events) {
  const s = state.story;
  const rec = { id: `l${s.nextLead++}`, min: state.min, date: dateOf(state.min).label, ...lead };
  s.leads.push(rec);
  // Note: the place a lead names goes on the map, so the party can ride there.
  if (rec.place) learn(state, rec.place, 'a lead', true);
  logLine(state, `A lead: ${rec.text}`);
  if (events) events.push({ type: 'lead', lead: { ...rec } });
  return rec;
}

// Note: where an associate's case is posted away from his town, that board goes on the map with the lead that names him.
function learnBoard(state, a) {
  const c = a.caseId && state.cases.find((x) => x.id === a.caseId);
  if (c) learn(state, c.offeredAt, 'a notice posted there', true);
}

// Note: item 279: the associate whose case comes next, the first still at large, free or with his case posted, in the order cases are posted (cases.js postAssociateCases).
export const nextAssociate = (s) => s.associates.find((a) => a.status === 'free' || a.status === 'case') || null;

// Note: a lead from ordinary play (item 268) is only ever about the next associate: first who he is and where, then the board where his case hangs; word of the nemesis himself comes from his associates alone (items 277, 279, 281, 299).
export function rollLead(state, source, chance, events) {
  const s = state.story;
  if (!s || s.ended || s.finalAt) return null;
  const a = nextAssociate(s);
  if (!a) return null;
  const c = a.status === 'case' ? state.cases.find((x) => x.id === a.caseId && ['available', 'accepted'].includes(x.status)) : null;
  const word = { case: 'Word from the case', saloon: 'Talk in the saloon', road: 'A traveller on the road' }[source];
  const toBoard = a.known && !!c;
  const text = !a.known ? `${word}: ${a.name} rides with ${nemesisLabel(s.nemesis)} and was seen at ${placeName(a.at)}.`
    : toBoard ? `${word}: ${a.name} is wanted; the notice hangs in ${placeName(c.offeredAt)}.` : null;
  // Note: nothing new to tell, or the same word again, is no lead.
  if (!text || s.leads.some((l) => l.text === text)) return null;
  const d = dice(s);
  if (!d.chance(hooksOf(state).lead ?? chance)) return null;
  a.known = true;
  learnBoard(state, a);
  return addLead(state, { source, kind: 'associate', associateId: a.id, place: toBoard ? c.offeredAt : a.at, text }, events);
}

// Note: items 280, 282, 286: what a captured associate says, or what the body, belongings or witnesses give up; each counts toward the final location.
export function associateLead(state, assocId, how, events) {
  const s = state.story;
  const a = s.associates.find((x) => x.id === assocId);
  if (!a || a.told) return null;
  a.known = true;
  a.told = true;
  s.told += 1;
  const from = {
    questioned: `${a.name}, questioned`,
    body: `On ${a.name}'s body`,
    belongings: `Among ${a.name}'s belongings`,
    witness: `Witnesses who knew ${a.name}`,
  }[how] || a.name;
  if (s.told >= STORY.revealAt) {
    fixFinal(state, s.nemesis.at);
    return addLead(state, { source: how, kind: 'final', associateId: a.id, place: s.finalAt, text: `${from}: ${nemesisLabel(s.nemesis)} has gone to ground at ${placeName(s.finalAt)} and means to stay.` }, events);
  }
  // Note: items 281, 299: before the third he gives up only the next man in the sequence, never where the nemesis is.
  const next = nextAssociate(s);
  if (next) {
    next.known = true;
    learnBoard(state, next);
  }
  const text = next ? `${from}: ${next.name} rides with ${nemesisLabel(s.nemesis)} and is at ${placeName(next.at)}.` : `${from}: nothing of where ${nemesisLabel(s.nemesis)} is.`;
  return addLead(state, { source: how, kind: 'associate', associateId: a.id, place: next ? next.at : null, text }, events);
}

// Note: items 280, 282, 283, 286, 289, 291: the end of an associate's case: the connection is learned, a man taken alive is questioned at once, a dead man's body may hold the lead and otherwise his belongings or witnesses in town.
export function settleAssociate(state, c, report, success, events) {
  const s = state.story;
  const a = s && c.associate ? s.associates.find((x) => x.id === c.associate) : null;
  if (!a) return null;
  a.known = true;
  const h = (Array.isArray(report.hostiles) ? report.hostiles : []).find((x) => x && x.associate);
  if (!h) return null;
  const dead = h.status === 'dead' || !!h.dying;
  // Note: a man taken alive is the office's only when it holds the field; a man killed is dead whether the attempt succeeded or not.
  if (!success && !dead) return null;
  if (!dead) {
    a.status = 'captured';
    events.push({ type: 'captured', name: a.name, how: h.surrendered ? 'surrender' : 'restraint' });
    logLine(state, `${a.name} is taken alive and questioned.`);
    return associateLead(state, a.id, 'questioned', events);
  }
  a.status = 'dead';
  // Note: the body is searched where the office held the field, and also later where nobody can be asked, as it is then the only source; otherwise belongings or witnesses in his town tell.
  const askable = !!(PLACES[a.at].services && PLACES[a.at].services.ask);
  const fromBody = !askable || (a.recovery === 'body' && success);
  if (!fromBody && a.recovery === 'body') a.recovery = 'witness';
  events.push({ type: 'associate-dead', name: a.name, recovery: fromBody ? 'body' : a.recovery, at: a.at });
  if (fromBody) return associateLead(state, a.id, 'body', events);
  logLine(state, `${a.name} is dead before he could be questioned; ${a.recovery === 'belongings' ? 'his belongings' : 'people who knew him'} in ${placeName(a.at)} may tell what he knew.`);
  return null;
}

// Note: item 286: asking around where a dead associate lived turns up his belongings or the witnesses who knew him.
export function recoverInTown(state, events) {
  const s = state.story;
  if (!s || !state.at) return null;
  const a = s.associates.find((x) => x.status === 'dead' && !x.told && x.at === state.at);
  return a ? associateLead(state, a.id, a.recovery, events) : null;
}

// Note: the nemesis's name for a case whose man is a known associate, else null.
export function connectedTo(state, c) {
  const a = c.associate && state.story ? state.story.associates.find((x) => x.id === c.associate) : null;
  return a && a.known ? nemesisLabel(state.story.nemesis) : null;
}

// Note: an associate whose case ran out or was given up is at large again and may be posted anew.
export function freeAssociates(state) {
  for (const a of state.story ? state.story.associates : []) {
    if (a.status !== 'case') continue;
    const c = state.cases.find((x) => x.id === a.caseId);
    if (!c || !['available', 'accepted'].includes(c.status)) {
      a.status = 'free';
      a.caseId = null;
    }
  }
}

// Note: items 290 and 303: once fixed, the nemesis stays at the final location for good.
export function fixFinal(state, placeId) {
  const s = state.story;
  s.finalAt = placeId;
  s.nemesis.at = placeId;
  s.nemesis.nextMoveMin = null;
}

// Note: item 284: until the final location is fixed, the nemesis rides on now and then to another place within reach.
export function storyTick(state, events = null) {
  const s = state.story;
  if (!s || s.ended) return;
  freeAssociates(state);
  if (s.finalAt || !s.nemesis.alive) return;
  while (s.nemesis.nextMoveMin != null && state.min >= s.nemesis.nextMoveMin) {
    const d = dice(s);
    const options = hideouts(s.nemesis.at, STORY.moveKm).filter((id) => id !== state.at);
    if (options.length) s.nemesis.at = d.pick(options);
    s.nemesis.nextMoveMin += d.int(STORY.moveDays[0], STORY.moveDays[1]) * 1440;
  }
}

// Note: items 281, 290, 299: the office can meet the nemesis only at his final location, which is revealed once all three associates are taken down and their leads found; before that the party may pass through his town and never meet him. The player chooses when to face him (item 288).
export const nemesisHere = (state) => !!(state.story && !state.story.ended && state.story.nemesis.alive && state.story.finalAt && !state.journey && state.at === state.story.finalAt);

// Note: item 300: the nemesis is always drawn from his own look, which also dresses his sprite; the murdered sheriff only appears in the opening.
export const nemesisLook = (state) => makeLook(state.seed, state.story.nemesis.name, 'nemesis');
export const associateLook = (state, a) => makeLook(state.seed, a.name, 'associate');

// Note: the places the leads found name, for the map: where the nemesis went to ground, and where word put his men; a lead about a man since taken down or killed leaves the map.
export function trailMarks(state) {
  const s = state.story;
  if (!s) return [];
  const marks = new Map();
  for (const l of s.leads) {
    if (!l.place) continue;
    let m;
    if (l.kind === 'final') {
      if (!s.nemesis.alive) continue;
      m = { at: l.place, kind: 'nemesis', tip: `${nemesisLabel(s.nemesis)} has gone to ground here` };
    } else {
      // Note: a lead's text names its man right after the source, as in "Talk in the saloon: Name rides with ...".
      const a = s.associates.find((x) => l.text.includes(`: ${x.name} `));
      if (!a || !(a.status === 'free' || a.status === 'case')) continue;
      m = { at: l.place, kind: 'associate', tip: `A lead on ${a.name}` };
    }
    const had = marks.get(l.place);
    if (!had || m.kind === 'nemesis' || had.kind !== 'nemesis') marks.set(l.place, m);
  }
  return [...marks.values()];
}

// Note: the journal (item 273): the murder, the man, and only the leads found, newest first; nothing else of the story leaks.
export function journalView(state) {
  const s = state.story;
  if (!s) return null;
  return {
    murder: { sheriff: s.murder.sheriff, at: placeName(s.murder.at), atId: s.murder.at, portrait: { look: makeLook(state.seed, s.murder.sheriff, 'sheriff'), marks: ['chest'] } },
    nemesis: { name: s.nemesis.name, alias: s.nemesis.alias, label: nemesisLabel(s.nemesis), traits: nemesisTraits(s.nemesis), motive: MOTIVES_UNSAID, dead: !s.nemesis.alive, portrait: { look: nemesisLook(state), marks: woundMarks(s.nemesis.injuries || []) } },
    // Note: a case on a board the office has not read shows him still at large (item 273).
    associates: s.associates.filter((a) => a.known).map((a) => ({ id: a.id, name: a.name, status: a.status === 'case' && !state.cases.find((c) => c.id === a.caseId)?.seen ? 'free' : a.status, told: !!a.told, portrait: { look: associateLook(state, a), marks: [] } })),
    leads: s.leads.slice().reverse().map((l) => ({ id: l.id, date: l.date, text: l.text, kind: l.kind, source: l.source, place: l.place ? placeName(l.place) : null })),
    finalAt: s.finalAt ? placeName(s.finalAt) : null,
    trail: trailMarks(state),
    here: nemesisHere(state),
  };
}
