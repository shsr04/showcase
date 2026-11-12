// Note: items 494 and 495: one shared relationship per pair of crew members, built from known events and their history, apart from loyalty to the office; no DOM or Phaser.

import { clamp, charById, logLine, sheriffOf } from './base.js';
import { hasTrait, note } from './traits.js';
import { unit } from '../rand.js';
import { wantsToLeave } from './crew.js';
import { leave } from './economy.js';

// Note: each kind of event and how far it moves a relationship the first time; major ones alone can change how a pair gets on.
export const REL_EVENTS = Object.freeze({
  danger: { delta: 3, major: false, text: 'faced danger together' },
  help: { delta: 16, major: true, text: 'came to help in a fight' },
  rescue: { delta: 22, major: true, text: 'carried the other out of a fight' },
  neglect: { delta: -20, major: true, text: 'was left to fight alone' },
  dispute: { delta: -8, major: false, text: 'had a serious falling-out' },
  reconcile: { delta: 5, major: false, text: 'talked a quarrel out' },
});

// Note: tuning values: when a relationship counts as strained or close, how loyalty drifts with the sheriff, and how often strained mates quarrel.
export const REL = Object.freeze({
  strained: -30, close: 40, bitter: -55, drift: 25, driftPerDay: 1, disputeChance: 0.3, disputeLoyalty: 3, pendingDays: 30, history: 12,
});

const order = (a, b) => a.localeCompare(b, 'en', { numeric: true });
// Note: the same key for both orders of the pair, so there is one record and never two.
export const pairKey = (a, b) => (order(a, b) <= 0 ? `${a}|${b}` : `${b}|${a}`);

const book = (state) => (state.relations ||= {});
const pending = (state) => (state.relPending ||= []);

// Note: a pair's record, or null when they have none yet.
export const relationOf = (state, a, b) => (a && b && a !== b ? book(state)[pairKey(a, b)] || null : null);
// Note: how two people get on, from -100 to 100; strangers to each other stand at nought.
export const relation = (state, a, b) => relationOf(state, a, b)?.score ?? 0;

// Note: earlier major events of the same sign make the next one count more, and of the opposite sign less, so history builds.
function historyFactor(rec, sign) {
  const majors = (rec?.history || []).filter((h) => REL_EVENTS[h.kind]?.major);
  const same = majors.filter((h) => Math.sign(REL_EVENTS[h.kind].delta) === sign).length;
  const other = majors.length - same;
  return (1 + 0.25 * Math.min(4, same)) / (1 + 0.25 * Math.min(4, other));
}

// Note: items 468 and 475: a grudge-holder takes a slight harder, the open-handed and protective warm faster, and a steadfast teammate forgives the sheriff more.
function traitFactor(state, x, y, sign) {
  const both = [x, y];
  let f = 1;
  if (sign < 0) {
    if (both.some((c) => hasTrait(c, 'resentment'))) f *= 1.5;
    const sheriff = sheriffOf(state);
    if (sheriff && both.includes(sheriff) && both.some((c) => c !== sheriff && hasTrait(c, 'loyalty'))) f *= 0.5;
  } else if (both.some((c) => hasTrait(c, 'generosity') || hasTrait(c, 'protective'))) f *= 1.2;
  return f;
}

function apply(state, kind, x, y, events) {
  const key = pairKey(x.id, y.id);
  const rec = (book(state)[key] ||= { score: 0, history: [] });
  const ev = REL_EVENTS[kind];
  const sign = Math.sign(ev.delta);
  const delta = ev.delta * historyFactor(rec, sign) * traitFactor(state, x, y, sign);
  const before = rec.score;
  rec.score = Math.round(clamp(before + delta, -100, 100) * 10) / 10;
  rec.history.push({ kind, min: state.min });
  if (rec.history.length > REL.history) rec.history.splice(0, rec.history.length - REL.history);
  return { kind, key, before, after: rec.score };
}

// Note: item 494: an event between two crew members; it counts only once both of them know of it, and until then it waits unheard.
export function relEvent(state, kind, aId, bId, o = {}) {
  const events = o.events || [];
  const x = charById(state, aId);
  const y = charById(state, bId);
  if (!x || !y || x === y || !REL_EVENTS[kind]) return null;
  const knows = [...new Set(o.knows || [aId, bId])];
  if (!knows.includes(aId) || !knows.includes(bId)) {
    pending(state).push({ kind, a: aId, b: bId, knows, min: state.min });
    return { kind, key: pairKey(aId, bId), applied: false };
  }
  return { ...apply(state, kind, x, y, events), applied: true };
}

// Note: shared danger for everyone who went through it together, pair by pair.
export function sharedDanger(state, ids, events = []) {
  const live = ids.filter((id) => charById(state, id));
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) relEvent(state, 'danger', live[i], live[j], { events });
}

// Note: those in the same place hear what happened; the party on the road is one place of its own.
const placeOf = (state, c) => (c.where === 'party' ? (state.journey ? '@road' : state.at) : c.where);

// Note: word passes between people who are together; an event both sides now know of takes effect, a stale one is forgotten.
export function spreadWord(state, events = []) {
  const list = pending(state);
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const gone = !charById(state, p.a) || !charById(state, p.b) || state.min - p.min > REL.pendingDays * 1440;
    if (gone) {
      list.splice(i, 1);
      continue;
    }
    const where = new Set(p.knows.map((id) => charById(state, id)).filter(Boolean).map((c) => placeOf(state, c)));
    for (const c of state.crew) if (!p.knows.includes(c.id) && where.has(placeOf(state, c))) p.knows.push(c.id);
    if (p.knows.includes(p.a) && p.knows.includes(p.b)) {
      list.splice(i, 1);
      apply(state, p.kind, charById(state, p.a), charById(state, p.b), events);
    }
  }
}

// Note: item 494: a teammate's standing with the sheriff slowly pulls his loyalty to the office along with it, once it is clearly warm or cold.
export function driftLoyalty(state) {
  const sheriff = sheriffOf(state);
  if (!sheriff) return;
  for (const c of state.crew) {
    if (c === sheriff) continue;
    const s = relation(state, sheriff.id, c.id);
    if (Math.abs(s) < REL.drift) continue;
    c.loyalty = clamp(c.loyalty + REL.driftPerDay * clamp(s / 50, -1, 1), 0, 100);
  }
}

// Note: item 495: teammates who are together and on bad terms may quarrel and settle it among themselves; the sheriff need not step in and no one comes to blows.
export function disputes(state, events = []) {
  if (state.duel || state.brawl || state.active || state.ended) return;
  const sheriff = sheriffOf(state);
  const mates = state.crew.filter((c) => c !== sheriff);
  const day = Math.floor(state.min / 1440);
  for (let i = 0; i < mates.length; i++) {
    for (let j = i + 1; j < mates.length; j++) {
      const x = mates[i];
      const y = mates[j];
      if (!state.crew.includes(x) || !state.crew.includes(y) || placeOf(state, x) !== placeOf(state, y)) continue;
      const s = relation(state, x.id, y.id);
      if (s > REL.strained) continue;
      const tag = `${state.seed}:dispute:${day}:${pairKey(x.id, y.id)}`;
      // Note: item 468: a hothead starts quarrels and a good listener heads them off; the dice are hashes, so the campaign's own stay put.
      const lean = [x, y].reduce((p, c) => p + (hasTrait(c, 'aggression') ? 0.15 : 0) - (hasTrait(c, 'receptive') ? 0.1 : 0), 0);
      if (unit(tag) >= clamp(REL.disputeChance + lean, 0.05, 0.9)) continue;
      const listener = [x, y].find((c) => hasTrait(c, 'receptive'));
      const talked = unit(`${tag}:talk`) < (listener ? 0.7 : 0.35);
      if (talked) {
        apply(state, 'reconcile', x, y, events);
        for (const c of [x, y]) note(state, c, 'receptive', events);
        logLine(state, `${x.name} and ${y.name} have hard words and talk it out between them.`);
        events.push({ type: 'dispute', ids: [x.id, y.id], settled: true });
        continue;
      }
      apply(state, 'dispute', x, y, events);
      for (const c of [x, y]) {
        c.loyalty = clamp(c.loyalty - REL.disputeLoyalty * (hasTrait(c, 'loyalty') ? 0.5 : 1), 0, 100);
        if (hasTrait(c, 'aggression') || s <= REL.bitter) note(state, c, 'aggression', events);
      }
      logLine(state, `${x.name} and ${y.name} fall out and keep apart.`);
      events.push({ type: 'dispute', ids: [x.id, y.id], settled: false });
      // Note: item 135: a quarrel only weighs on loyalty; whether anyone goes is the usual departure test.
      for (const c of [x, y]) if (state.crew.includes(c) && wantsToLeave(state, c)) leave(state, c, `leaves the office after falling out with ${(c === x ? y : x).name}`, events);
    }
  }
}

// Note: once a day: word spreads, loyalty drifts with the sheriff, strained mates may quarrel, and records of people no longer in the crew are dropped.
export function relationsDay(state, events = []) {
  spreadWord(state, events);
  driftLoyalty(state);
  disputes(state, events);
  const ids = new Set(state.crew.map((c) => c.id));
  for (const key of Object.keys(book(state))) {
    const [a, b] = key.split('|');
    if (!ids.has(a) || !ids.has(b)) delete book(state)[key];
  }
}

// Note: item 494: whether a teammate comes to another's side; bitter enemies stay out, and the closer the bond the sooner he comes.
export const willingToHelp = (state, helper, target) => !target || relation(state, helper.id, target.id) > REL.bitter;
export const helpRank = (state, helper, target) => (target ? relation(state, helper.id, target.id) : 0);

// Note: items 474 and 495: how a pair gets on and how loyal a teammate is to the office, in words with a glyph, never numbers.
export function bondWord(score) {
  if (score >= 60) return { word: 'close as brothers', glyph: 'hand', tone: 'good' };
  if (score >= REL.close) return { word: 'good friends', glyph: 'hand', tone: 'good' };
  if (score >= 15) return { word: 'on good terms', glyph: 'hand', tone: 'good' };
  if (score > -15) return { word: 'get along', glyph: 'ear', tone: 'plain' };
  if (score > REL.bitter) return { word: 'at odds', glyph: 'thorn', tone: 'down' };
  return { word: 'bitter enemies', glyph: 'thorn', tone: 'down' };
}
export function loyaltyWord(loyalty) {
  if (loyalty >= 80) return { word: 'devoted to the office', glyph: 'star', tone: 'good' };
  if (loyalty >= 60) return { word: 'loyal to the office', glyph: 'star', tone: 'good' };
  if (loyalty >= 40) return { word: 'serves without complaint', glyph: 'star', tone: 'plain' };
  if (loyalty >= 25) return { word: 'wavering', glyph: 'thorn', tone: 'down' };
  return { word: 'thinking of quitting', glyph: 'thorn', tone: 'down' };
}

// Note: how one person gets on with everyone else in the crew, for the crew panel.
export const bondsView = (state, c) => state.crew.filter((o) => o !== c).map((o) => ({ id: o.id, name: o.name, ...bondWord(relation(state, c.id, o.id)) }));
