// Note: items 490 and 491: how the shared case pool is pursued: the vicinity of a target, the chain of leads to his location, and what each source discloses; no DOM or Phaser.

import { PLACES, shortestPath } from './world.js';
import {
  caseById, dice, isKnown, learn, logLine,
} from './base.js';
import { rng, seedFromString } from '../rand.js';
import { randomName } from './crew.js';
import { contactsOf, facetsOf, menNow } from './intel.js';
import { advance } from './state.js';

// Note: straight-line km from a target within which a town's people know where he is and its local pool may carry his case.
export const VICINITY_KM = 60;
// Note: the share of distant ordinary cases whose location must be traced through leads.
export const LEAD_CHANCE = 0.55;
// Note: a large town's board may carry a case from this far away by telegraph or newspaper.
export const WIRE_KM = 300;
// Note: minutes it takes to find and hear out each kind of source.
export const SEEK_MIN = { person: 45, notice: 20, contact: 60 };

const kmBetween = (a, b) => Math.hypot(PLACES[a].x - PLACES[b].x, PLACES[a].y - PLACES[b].y);

// Note: whether a town lies in the vicinity of a case's target.
export const nearTarget = (c, townId) => !!PLACES[townId] && !!PLACES[c.location] && kmBetween(c.location, townId) <= VICINITY_KM;

// Note: a case whose location the office knows; an old save without a pursuit, and a case in the very town that offers it, are located.
export const located = (c) => !c.pursuit || !!c.pursuit.located || c.location === c.offeredAt;

// Note: the lead the player follows now, or null once the case is located.
export const currentLead = (c) => (located(c) ? null : c.pursuit.leads[c.pursuit.step] || null);

const PEOPLE = ['who keeps the livery', 'who runs the store', 'who tends bar', 'a freighter', 'the blacksmith', 'who keeps the hotel'];
const NOTICES = ['a sheriff\'s notice on the board', 'a posted letter from the county', 'a notice from the express company'];

// Note: one specific person, notice or contact to seek in a lead's town, from the case's own hash.
function sourceAt(state, r, town) {
  const p = PLACES[town];
  const kinds = ['contact'];
  if (p.services.ask || p.services.saloon) kinds.push('person', 'person');
  if (p.services.notices) kinds.push('notice');
  const kind = r.pick(kinds);
  if (kind === 'person') {
    const role = r.pick(PEOPLE);
    return { kind, label: `${randomName(r)}, ${role.startsWith('a ') || role.startsWith('the ') ? role : `the man ${role}`}` };
  }
  if (kind === 'notice') return { kind, label: r.pick(NOTICES) };
  const k = r.pick(contactsOf(state, town));
  return { kind, contact: k.id, label: k.label };
}

// Note: item 491: a pursuit made at posting: a case near its offering town, or by chance, is located at once; otherwise one or two leads in towns on the road to the target.
export function makePursuit(state, c) {
  const r = rng(seedFromString(`${state.seed}:pursuit:${c.id}`));
  const none = { leads: [], step: 0, located: true };
  if (!PLACES[c.offeredAt] || nearTarget(c, c.offeredAt) || !r.chance(LEAD_CHANCE)) return none;
  const path = shortestPath(c.offeredAt, c.location);
  const stops = path ? path.places.slice(1, -1) : [];
  if (!stops.length) return none;
  const n = Math.min(stops.length, path.km > 180 && r.chance(0.5) ? 2 : 1);
  const leads = [];
  for (let i = 1; i <= n; i++) {
    const town = stops[Math.floor((i * stops.length) / (n + 1))];
    leads.push({ town, source: sourceAt(state, r, town) });
  }
  return { leads, step: 0, located: false };
}

// Note: the target's place is fixed while the case is active (item 159), so a confirmed location holds through arrival.
function locate(state, c, why) {
  c.pursuit.located = true;
  c.pursuit.step = c.pursuit.leads.length;
  learn(state, c.location, 'the trail leads there');
  c.history.push({ min: state.min, text: `${why} ${c.target.name} is at ${PLACES[c.location].name}.` });
}

// Note: item 490: hearing of a case from a source in townId: people near the target know where he is, any other source only names the current lead, whose town becomes known (item 172).
export function disclose(state, c, townId) {
  if (located(c)) return;
  if (townId && nearTarget(c, townId)) {
    locate(state, c, `Word in ${PLACES[townId].name}:`);
    return;
  }
  const lead = currentLead(c);
  if (lead) learn(state, lead.town, 'a lead points there');
}

// Note: item 491: seeking the named source in the lead's town, or asking near the target, gives the next report; reports are true when told and may leave things out (item 116).
export function seekLead(state, caseId) {
  if (state.ended) return { ok: false, reason: 'The campaign is over.' };
  if (!state.at || state.journey) return { ok: false, reason: 'The party is not in a town.' };
  const c = typeof caseId === 'string' ? caseById(state, caseId) : null;
  if (!c || !c.seen || !['available', 'accepted'].includes(c.status)) return { ok: false, reason: 'No such case.' };
  if (located(c)) return { ok: false, reason: `${c.target.name} is known to be at ${PLACES[c.location].name}.` };
  const lead = currentLead(c);
  const local = state.at !== lead.town && nearTarget(c, state.at);
  if (!local && state.at !== lead.town) return { ok: false, reason: `The lead is ${lead.source.label} in ${PLACES[lead.town].name}.` };
  const minutes = local ? SEEK_MIN.person : SEEK_MIN[lead.source.kind];
  const events = advance(state, minutes, 'idle');
  // Note: world time and deadlines run on through the pursuit; a case that lapsed meanwhile has nothing more to tell.
  if (state.ended || !['available', 'accepted'].includes(c.status)) return { ok: true, minutes, expired: true, lead: null, located: false, events };
  if (local) {
    locate(state, c, `Asking around ${PLACES[state.at].name}:`);
  } else {
    c.pursuit.step += 1;
    const next = currentLead(c);
    if (next) {
      learn(state, next.town, 'a lead points there');
      c.history.push({ min: state.min, text: `${lead.source.label} in ${PLACES[lead.town].name} sends you on to ${next.source.label} in ${PLACES[next.town].name}.` });
    } else {
      locate(state, c, `${lead.source.label} in ${PLACES[lead.town].name} reports:`);
    }
  }
  // Note: item 116: a final report sometimes also counts his men; it never says more than is true.
  if (located(c) && c.known && c.known.exactMen == null && dice(state).chance(0.4)) {
    const f = facetsOf(state, c);
    c.known.exactMen = menNow(f, c);
    c.known.lieutenant = f.lieutenant;
    c.known.asOf = `day ${Math.floor(state.min / 1440) + 1}`;
  }
  logLine(state, located(c) ? `The trail of ${c.target.name} ends at ${PLACES[c.location].name}.` : `A lead on ${c.target.name} points to ${PLACES[currentLead(c).town].name}.`);
  return { ok: true, minutes, located: located(c), lead: leadView(state, c), events };
}

// Note: the lead as the player knows it; later leads and the target's place stay hidden until reached.
export function leadView(state, c) {
  const lead = currentLead(c);
  if (!lead) return null;
  return {
    step: c.pursuit.step + 1, town: lead.town, townName: PLACES[lead.town].name, known: isKnown(state, lead.town),
    kind: lead.source.kind, source: lead.source.label, here: state.at === lead.town && !state.journey,
  };
}
