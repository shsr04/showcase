// Note: Release progression (items 462–467, 469, 473, 474): the three skills, their plain words and glyphs, case-earned gains, and what reputation does, with no DOM or Phaser.

import { clamp, charById, dice } from './base.js';

export const SKILLS = ['precision', 'toughness', 'awareness'];
export const SKILL_CAP = 0.95;
export const BASE_SKILL = 0.5;

// Note: item 474: what each skill stands for, in plain words, with the glyph the screens draw beside it.
export const SKILL_INFO = Object.freeze({
  precision: { label: 'Precision', glyph: 'sight', means: 'a steady aim that settles fast, and quick hands to switch, cock and reload' },
  toughness: { label: 'Toughness', glyph: 'anvil', means: 'holds up to hard riding and fighting, and keeps steady under fire' },
  awareness: { label: 'Awareness', glyph: 'eye', means: 'notices danger early: reads a draw, spots an ambush, sees a threat before it acts' },
});

// Note: item 474: a plain word for a level, never a number.
const LEVELS = [[0.4, 'green'], [0.52, 'fair'], [0.64, 'good'], [0.78, 'seasoned'], [Infinity, 'exceptional']];
export const levelWord = (v) => LEVELS.find(([top]) => v < top)[1];

// Note: a skill record from before the Release (aim, nerve, handling) becomes the three skills; aim and handling are Precision, nerve is Toughness, and Awareness starts from the average.
export function migrateSkill(s) {
  if (!s || typeof s !== 'object' || SKILLS.every((k) => Number.isFinite(s[k]))) return s;
  const n = (v) => (Number.isFinite(v) ? v : BASE_SKILL);
  const precision = (n(s.aim) + n(s.handling)) / 2;
  const toughness = n(s.nerve);
  return { precision, toughness, awareness: (precision + toughness) / 2 };
}

// Note: a fresh skill record around a base, each skill drawn within spread; the draw order is fixed so the campaign dice stay in step.
export function rollSkill(d, base, spread, lo, hi) {
  return Object.fromEntries(SKILLS.map((k) => [k, clamp(base + d.range(-spread, spread), lo, hi)]));
}

// Note: item 466: how hard tiring work wears a person; Toughness above the ordinary makes it less, below makes it more.
export const wearOf = (c) => 1 - ((c?.skill?.toughness ?? BASE_SKILL) - BASE_SKILL) * 0.6;

export const skillAvg = (c) => SKILLS.reduce((s, k) => s + c.skill[k], 0) / SKILLS.length;

// Note: item 463, 474: the skills of a person as the screens show them: label, glyph, word and meaning.
export function skillView(skill) {
  return SKILLS.map((k) => ({ id: k, label: SKILL_INFO[k].label, glyph: SKILL_INFO[k].glyph, word: levelWord(skill[k]), means: SKILL_INFO[k].means }));
}

// Note: item 473: the skill gain a case of this difficulty makes available to the whole team.
export const GAIN_POOL = [0, 0.04, 0.06, 0.085, 0.115, 0.15];
// Note: item 473: a participant's share weight: wounded or carried out counts less, and a case settled at a civilian's cost counts less for everyone.
export const SHARE = { whole: 1, hurt: 0.7, out: 0.45, civilian: 0.6 };
// Note: item 473: the least gain a participant receives, however large the team, scaled by his weight and the outcome.
const SHARE_FLOOR = 0.012;

// Note: item 473: case difficulty sets the pool, split among participants by participation weighted by survival and outcome; each gets a gain in one skill chosen by its use and a variation, and the list says who grew in what (item 463).
export function skillGains(state, people, tier, outcome = {}) {
  const d = dice(state);
  const list = people.map((p) => ({ ...p, c: charById(state, p.charId) })).filter((p) => p.c);
  const out = outcome.civilianDied ? SHARE.civilian : 1;
  const weights = list.map((p) => (p.out ? SHARE.out : p.hurt ? SHARE.hurt : SHARE.whole));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const pool = GAIN_POOL[clamp(tier, 1, 5)] * out;
  const gains = [];
  list.forEach((p, i) => {
    const amount = Math.max(SHARE_FLOOR * weights[i] * out, (pool * weights[i]) / total) * d.range(0.8, 1.2);
    // Note: the skill the fight leaned on is likelier, the others still possible: shooting sharpens Precision, wounds and being carried out harden Toughness, and a man who held his fire keeps his eyes open.
    const lean = { precision: 1 + (p.fired ? 0.8 : 0), toughness: 1 + (p.hurt ? 0.8 : 0) + (p.out ? 0.4 : 0), awareness: 1 + (p.fired ? 0 : 0.8) };
    const skill = d.weighted(SKILLS.map((k) => [k, lean[k]]));
    const before = p.c.skill[skill];
    const after = clamp(before + amount, 0, SKILL_CAP);
    p.c.skill[skill] = after;
    gains.push({ charId: p.c.id, name: p.c.name, skill, label: SKILL_INFO[skill].label, glyph: SKILL_INFO[skill].glyph, before: levelWord(before), after: levelWord(after), grew: after > before });
  });
  return gains;
}

// Note: item 469: the words for a person's and for the office's standing, 0..100.
export const repWord = (v) => (v < 10 ? 'unknown' : v < 25 ? 'known locally' : v < 50 ? 'respected' : v < 75 ? 'well known' : 'a legend of the territory');
export const teamWord = (v) => (v < 10 ? 'a scratch crew' : v < 25 ? 'a fair crew' : v < 50 ? 'a good crew' : v < 75 ? 'a proud crew' : 'a famous crew');

// Note: item 469: what the team's standing does to case pay; 1 for an unknown office, more for a good name.
export const payFactor = (teamRep) => 1 + 0.3 * clamp(teamRep, 0, 100) / 100;
// Note: item 469: townspeople say more to a known office: one more offer when asking around, and likelier word when asking about a case.
export const TALK_REP = 40;
export const talkBonus = (teamRep) => (teamRep >= TALK_REP ? 1 : 0);
