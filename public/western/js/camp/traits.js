// Note: items 468 and 475: acquired behavioural traits: earned by repeated behaviour or a significant event, permanent once earned, and used for situational choices, tie-breaks and how others respond; no DOM or Phaser.

import { logLine } from './base.js';

// Note: category decides how a trait can be earned (item 475): a habit only by repetition, the others by repetition or one significant event.
export const TRAITS = Object.freeze({
  drinking: { label: 'Drinker', glyph: 'bottle', category: 'habit', after: 10, means: 'drinks more than most on a night in town' },
  gambling: { label: 'Gambler', glyph: 'cards', category: 'habit', after: 3, means: 'cannot pass a card table' },
  trouble: { label: 'Trouble-seeker', glyph: 'fist', category: 'danger', after: 3, means: 'looks for a fight and finds one' },
  // Note: economy.js marks only a repeat purchase of the same model, so one mark is the second gun of a kind.
  'favorite-guns': { label: 'Gun fancier', glyph: 'pistol', category: 'habit', after: 1, means: 'keeps buying the same favourite gun' },
  defending: { label: 'Defender', glyph: 'shield', category: 'social', after: 2, means: 'steps in when others are set upon' },
  aggression: { label: 'Hothead', glyph: 'flame', category: 'danger', after: 2, means: 'goes for the gun first and talks with threats' },
  receptive: { label: 'Good listener', glyph: 'ear', category: 'social', after: 2, means: 'hears a man out and talks things down' },
  loyalty: { label: 'Steadfast', glyph: 'star', category: 'loyalty', after: 4, means: 'stands by the office through thin times' },
  generosity: { label: 'Open-handed', glyph: 'coin', category: 'social', after: 2, means: 'shares what he has with others' },
  protective: { label: 'Protective', glyph: 'hand', category: 'danger', after: 3, means: 'puts himself between his own and harm' },
  resentment: { label: 'Grudge-holder', glyph: 'thorn', category: 'loyalty', after: 2, means: 'does not forget being let down' },
  'self-interest': { label: 'Self-serving', glyph: 'purse', category: 'loyalty', after: 3, means: 'looks out for himself first' },
});

export const hasTrait = (c, id) => !!(c && Array.isArray(c.acquired) && c.acquired.includes(id));

// Note: one more instance of a behaviour, or a significant event (event: true) where the category allows it; the first time it is earned, a trait event goes into events.
export function note(state, c, id, events, o = {}) {
  const t = TRAITS[id];
  if (!c || !t || hasTrait(c, id)) return;
  c.marks[id] = (c.marks[id] || 0) + (o.n ?? 1);
  const earned = (o.event && t.category !== 'habit') || c.marks[id] >= t.after;
  if (!earned) return;
  c.acquired.push(id);
  if (o.favorite) c.favorite = o.favorite;
  const known = `${c.name} has become known as ${/^[AEIOU]/.test(t.label) ? 'an' : 'a'} ${t.label.toLowerCase()}`;
  logLine(state, `${known}.`);
  events.push({ type: 'trait', charId: c.id, name: c.name, trait: id, label: t.label, glyph: t.glyph, means: t.means, text: `${known}: ${t.means}.` });
}

// Note: item 474: a person's earned traits as the screens show them.
export const traitView = (c) => (c.acquired || []).map((id) => ({ id, label: TRAITS[id].label, glyph: TRAITS[id].glyph, means: TRAITS[id].means }));

// Note: item 468: how the sheriff's recorded conduct colours a stranger's answer to the office, as a small shift in willingness; the player's choices are never limited by it.
const REGARD = { defending: 0.04, receptive: 0.03, loyalty: 0.03, generosity: 0.05, protective: 0.04, drinking: -0.03, gambling: -0.02, trouble: -0.04, aggression: -0.03, resentment: -0.02, 'self-interest': -0.05 };
export const regardOf = (sheriff) => (sheriff?.acquired || []).reduce((s, id) => s + (REGARD[id] || 0), 0);

// Note: item 468: the persuasion manner a teammate falls back on; the better skill decides, an acquired manner breaks a near tie.
export function persuasionApproach(person) {
  const lean = (hasTrait(person, 'aggression') ? 0.08 : 0) - (hasTrait(person, 'receptive') ? 0.08 : 0);
  return person.skill.toughness + lean >= person.skill.awareness ? 'intimidate' : 'explain';
}
