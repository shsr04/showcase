// Note: items 470 and 476: what a case is made of (where exactly, what the men have prepared, who stands with the target), what the office knows of it, and the townspeople and contacts it can learn more from; no DOM or Phaser.

import { PLACES, placesWithin } from './world.js';
import { clamp, caseById, dice, dollars, logLine } from './base.js';
import { rng, seedFromString, unit } from '../rand.js';
import { advance } from './state.js';
import { DIFF } from './cases.js';
import { found } from './rewards.js';
import { talkBonus } from './progress.js';
import { located } from './pursuit.js';
import { SIDES, SIDE_NAMES } from '../outdoor-ring.js';

// Note: item 470: defences a target's men can have; where marks the kinds of site each suits.
export const DEFENSES = Object.freeze({
  lookouts: { where: ['house', 'outdoor'], from: 1, text: 'keep a man on watch' },
  barred: { where: ['house'], from: 1, text: 'have barred the doors and bolted the shutters' },
  rifles: { where: ['house', 'outdoor'], from: 2, text: 'are well armed with rifles and shotguns' },
  hardened: { where: ['house', 'outdoor'], from: 3, text: 'are hardened gunmen who have killed before' },
});

// Note: item 470: the way into a barred building, the one door its men keep usable; the scene leaves exactly that door unbarred.
export const WAYS = Object.freeze({ front: 'the front door', back: 'the back door' });

// Note: item 470: a case's facets, drawn from a hash of the case so the campaign dice stay where they were; harder and later cases have more defences and more men.
export function makeFacets(seed, c, done = 0) {
  const r = rng(seedFromString(`${seed}:facets:${c.id}`));
  const range = DIFF[c.tier].count;
  const men = r.int(range[0], range[1]);
  const kind = c.site.kind === 'house' ? 'house' : 'outdoor';
  const pool = Object.keys(DEFENSES).filter((k) => DEFENSES[k].where.includes(kind) && c.tier >= DEFENSES[k].from);
  const want = clamp(Math.floor((c.tier - 1) / 2 + r.next() * 1.4 + Math.min(1, done / 8)), 0, pool.length);
  const defenses = r.shuffle(pool.slice()).slice(0, want);
  return {
    way: r.pick(Object.keys(WAYS)),
    // Note: user direction: the side an outdoor camp's sentries watch, from its own hash so the other facets keep their draws; the opposite side is its blind side.
    watch: kind === 'outdoor' ? SIDES[Math.floor(unit(`${seed}:watch:${c.id}`) * SIDES.length)] : null,
    defenses,
    // Note: the target himself and his accomplices; among three or more a veteran lieutenant may stand out, and the scene makes one man a veteran.
    men,
    lieutenant: men >= 3 && r.chance(0.6),
  };
}

// Note: a case's facets as they stand: a pure function of the case's id, tier and site, and the progress when it was posted.
export const facetsOf = (state, c) => (c.known ? makeFacets(state.seed, c, c.postedDone || 0) : null);

// Note: what the office knows of a fresh case: the posting or the talk names the place and the site, not the way in, the defences or the exact count.
export const freshKnowledge = () => ({ location: false, defenses: [], exactMen: null, asOf: null });

// Note: the number of men the case holds now, its growth included.
export const menNow = (f, c) => Math.min(7, f.men + (c.extra || 0));

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Note: the side opposite the one an outdoor camp watches: its blind side, the best way in.
export const blindSide = (watch) => (watch ? SIDES[(SIDES.indexOf(watch) + 2) % SIDES.length] : null);

// Note: the advice on the way in to an outdoor camp, once its place is known: the side its watch faces and the blind side; a man alone keeps no watch.
export function approachAdvice(state, c) {
  if (c.site.kind === 'house' || !c.known?.location) return null;
  const f = facetsOf(state, c);
  if (!f?.watch || menNow(f, c) < 2) return null;
  return { watch: f.watch, best: blindSide(f.watch), text: `Their watch faces the ${SIDE_NAMES[f.watch]}; come in from the ${SIDE_NAMES[blindSide(f.watch)]}.` };
}

// Note: the way in as the scene builds it: the one usable door of a barred building, an open building, or a camp in the open with the side it watches.
const wayIn = (c, f) => (c.site.kind !== 'house'
  ? (f.watch && menNow(f, c) >= 2 ? `they are camped in the open, their watch facing the ${SIDE_NAMES[f.watch]}; the ${SIDE_NAMES[blindSide(f.watch)]} is their blind side.` : 'they are camped in the open.')
  : f.defenses.includes('barred') ? `only ${WAYS[f.way]} is not barred.` : 'no door is barred.');

// Note: item 476: a contact's trust in the office runs from 0 to TRUST_MAX, and at TRUSTED he counts as trusting it.
export const TRUSTED = 20;
const TRUST_MAX = 40;

// Note: item 476: the office's dealings with one contact, made on first use.
function contactRecord(state, town, id) {
  state.contacts[town] ||= {};
  return (state.contacts[town][id] ||= { trust: 0 });
}

// Note: item 470: the plain words for what is known of a case's location, defences and accomplices; nothing unknown is told.
export function facetsView(state, c) {
  const k = c.known;
  const f = facetsOf(state, c);
  const place = PLACES[c.location].name;
  return {
    location: `${cap(c.site.label)}, near ${place}; ${!k.location ? 'nobody has said how to get in.' : wayIn(c, f)}`,
    defenses: k.defenses.length ? `His men ${k.defenses.map((d) => DEFENSES[d].text).join(', and ')}.` : 'Nothing is known of how they are set.',
    accomplices: k.exactMen != null ? `${k.exactMen === 1 ? 'He is alone' : `${k.exactMen} men in all, counting him`}${k.lieutenant ? ', one of them his right hand' : ''} (as of ${k.asOf}).` : null,
    complete: k.location && k.exactMen != null && f.defenses.every((d) => k.defenses.includes(d)),
  };
}

// Note: one facet not yet known, in a fixed order of interest: where, then how many, then each defence.
function unknownFacets(state, c) {
  const out = [];
  if (!c.known.location) out.push({ kind: 'location' });
  if (c.known.exactMen == null) out.push({ kind: 'men' });
  for (const d of facetsOf(state, c).defenses) if (!c.known.defenses.includes(d)) out.push({ kind: 'defense', id: d });
  return out;
}

function reveal(state, c, f, label) {
  if (f.kind === 'location') c.known.location = true;
  else if (f.kind === 'defense') c.known.defenses.push(f.id);
  else {
    const facets = facetsOf(state, c);
    c.known.exactMen = menNow(facets, c);
    c.known.lieutenant = facets.lieutenant;
    c.known.asOf = label;
  }
}

const dateLabel = (min) => `day ${Math.floor(min / 1440) + 1}`;

// Note: preparing a case needs a campaign still running and the party in a town.
const gate = (state) => (state.ended ? { ok: false, reason: 'The campaign is over.' } : !state.at || state.journey ? { ok: false, reason: 'The party is not in a town.' } : null);

// Note: user direction: once asking about a case in a town turns up nothing, nobody there knows more of it for the rest of that day.
export const DRY_TODAY = 'Nobody here knows more about it today.';
const dayOf = (min) => Math.floor(min / 1440);
export const askedDry = (state, c) => !!(state.at && c.askedDry && c.askedDry[state.at] === dayOf(state.min));

// Note: item 470: asking townspeople about one case costs half an hour and turns up one thing not known, now and then nothing.
export function askAbout(state, caseId) {
  const c = typeof caseId === 'string' ? caseById(state, caseId) : null;
  const bad = gate(state);
  if (bad) return bad;
  if (!c || !c.seen || !['available', 'accepted'].includes(c.status)) return { ok: false, reason: 'No such case.' };
  // Note: item 491: before the trail is followed no one here can tell more than the lead.
  if (!located(c)) return { ok: false, reason: 'Nobody knows where he is yet; follow the lead.' };
  if (!PLACES[state.at].services.ask && !PLACES[state.at].services.saloon) return { ok: false, reason: `No one in ${PLACES[state.at].name} has anything to say.` };
  if (askedDry(state, c)) return { ok: false, reason: DRY_TODAY };
  const events = advance(state, 30, 'idle');
  const left = unknownFacets(state, c);
  const near = c.location === state.at || placesWithin(state.at, 80).some((p) => p.id === c.location);
  // Note: people near the place know more; a known office hears more (item 469).
  const p = (near ? 0.75 : 0.45) + 0.1 * talkBonus(state.rep.team);
  if (!left.length || !dice(state).chance(p)) {
    // Note: the town is dry for this case until the day turns; an old day's mark is replaced, so the record stays one entry a town.
    c.askedDry = { ...(c.askedDry || {}), [state.at]: dayOf(state.min) };
    return { ok: true, minutes: 30, learned: null, told: null, facets: facetsView(state, c), events };
  }
  const f = left[0].kind === 'location' || dice(state).chance(0.5) ? left[0] : dice(state).pick(left);
  reveal(state, c, f, dateLabel(state.min));
  logLine(state, `Asking about "${c.title}" turns something up.`);
  return { ok: true, minutes: 30, learned: f.kind, told: 'You learn something more about it.', facets: facetsView(state, c), events };
}

// Note: item 476: the contacts a town can have; each reports for a fee or for time, once he trusts the office enough.
const KINDS = [
  { id: 'telegraph', label: 'the telegraph operator', fee: 300, hours: 2, need: 15, reach: 400 },
  { id: 'stage', label: 'a stage line agent', fee: 500, hours: 1, need: 25, reach: 300 },
  { id: 'barkeep', label: 'the barkeep', fee: 200, hours: 3, need: 5, reach: 120 },
  { id: 'freighter', label: 'a freighter who knows the roads', fee: 0, hours: 6, need: 10, reach: 250 },
  { id: 'informer', label: 'a man who sells what he hears', fee: 1200, hours: 1, need: 0, reach: 200 },
  { id: 'rancher', label: 'a rancher the office once helped', fee: 0, hours: 4, need: 35, reach: 150 },
];

const NETWORK = { id: 'network', label: 'the informers\' man', fee: 400, hours: 1, need: 0, reach: 700 };

// Note: a town's contacts follow from its size and a hash; a bigger place has more of them.
export function contactsOf(state, townId) {
  const p = PLACES[townId];
  if (!p) return [];
  const n = clamp(1 + Math.floor((p.size ?? 1) / 2) + (unit(`${state.seed}:contacts:${townId}`) < 0.4 ? 1 : 0), 1, 3);
  const order = KINDS.slice().sort((a, b) => unit(`${state.seed}:contact:${townId}:${a.id}`) - unit(`${state.seed}:contact:${townId}:${b.id}`));
  // Note: item 471: once found, the informer network has a man in every town.
  const list = found(state, 'network') ? [...order.slice(0, n), NETWORK] : order.slice(0, n);
  return list.map((k) => ({ ...k, town: townId, trust: state.contacts[townId]?.[k.id]?.trust || 0 }));
}

// Note: item 476: a contact reports only once the office's standing and his trust in it are enough.
export const willing = (state, k) => state.rep.team + k.trust >= k.need;
export const availableContacts = (state) => (state.at && !state.journey ? contactsOf(state, state.at).filter((k) => willing(state, k)) : []);

// Note: item 476: the contacts of this town as the screen shows them, without the threshold of the unwilling.
export function contactsView(state) {
  if (!state.at || state.journey) return [];
  return contactsOf(state, state.at).map((k) => ({ id: k.id, label: k.label, willing: willing(state, k), feeCents: k.fee, fee: k.fee ? dollars(k.fee) : null, hours: k.hours, trust: k.trust >= TRUSTED ? 'trusts the office' : k.trust >= 8 ? 'warming to the office' : 'keeps his distance' }));
}

// Note: item 476: a full report on one case within the contact's reach: everything about its location, defences and men, for his fee and his time; dealing with him builds trust.
export function contactReport(state, contactId, caseId) {
  const bad = gate(state);
  if (bad) return bad;
  const c = typeof caseId === 'string' ? caseById(state, caseId) : null;
  if (!c || !c.seen || !['available', 'accepted'].includes(c.status)) return { ok: false, reason: 'No such case.' };
  if (!located(c)) return { ok: false, reason: 'Nobody knows where he is yet; follow the lead.' };
  const k = contactsOf(state, state.at).find((x) => x.id === contactId);
  if (!k) return { ok: false, reason: 'No such contact here.' };
  if (!willing(state, k)) return { ok: false, reason: `${cap(k.label)} will not talk to the office yet.` };
  const km = c.location === state.at ? 0 : placesWithin(state.at, k.reach).find((p) => p.id === c.location)?.km;
  if (km == null) return { ok: false, reason: `${PLACES[c.location].name} is beyond what ${k.label} hears of.` };
  if (state.cents < k.fee) return { ok: false, reason: 'You cannot pay for it.' };
  state.cents -= k.fee;
  const events = advance(state, k.hours * 60, 'idle');
  const left = unknownFacets(state, c);
  // Note: the count is always brought up to date, known before or not.
  for (const f of left.filter((x) => x.kind !== 'men')) reveal(state, c, f, dateLabel(state.min));
  reveal(state, c, { kind: 'men' }, dateLabel(state.min));
  const rec = contactRecord(state, state.at, k.id);
  rec.trust = clamp(rec.trust + (k.fee ? 3 : 2), 0, TRUST_MAX);
  logLine(state, `${cap(k.label)} reports on "${c.title}"${k.fee ? ` for ${dollars(k.fee)}` : ''}.`);
  // Note: a report always brings the count up to date, so it always tells something.
  return { ok: true, minutes: k.hours * 60, cents: k.fee, learned: left.length ? left[0].kind : 'men', told: `${cap(k.label)} tells you all he knows.`, facets: facetsView(state, c), events };
}

// Note: item 476: a settled case wins the trust of the contacts in the town that offered it.
export function trustAfterCase(state, c) {
  for (const k of contactsOf(state, c.offeredAt)) {
    const rec = contactRecord(state, c.offeredAt, k.id);
    rec.trust = clamp(rec.trust + 2 + c.tier, 0, TRUST_MAX);
  }
}

// Note: item 470: the scene follows the case's facets: its true number of men, and each defence as the site and Sim read it.
export function applyFacets(state, diff, c) {
  const f = facetsOf(state, c);
  if (!f) return diff;
  const n = menNow(f, c);
  diff.count = [n, n];
  diff.defenses = f.defenses.slice();
  // Note: the sentries of an outdoor camp face the side the case says they watch.
  if (f.watch) diff.watch = f.watch;
  if (f.defenses.includes('hardened')) diff.experience = [Math.max(0, diff.experience[0] - 0.2), diff.experience[1], diff.experience[2] + 0.2];
  if (f.defenses.includes('lookouts')) diff.lookouts = 1 + (n >= 5 ? 1 : 0);
  if (f.defenses.includes('barred')) diff.way = f.way;
  if (f.lieutenant) diff.lieutenant = true;
  return diff;
}
