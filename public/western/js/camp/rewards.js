// Note: item 471: access rewards: distinctive recruits, equipment and opportunities the office comes upon through its standing, its deeds, its discoveries and its people; their conditions are never shown before they are met. No DOM or Phaser.

import { PLACES, placesWithin } from './world.js';
import { clamp, logLine, townOf, sheriffOf, learn } from './base.js';
import { rng, seedFromString, unit } from '../rand.js';
import { randomPerson, takenNames, candidateRecord, KIT } from './crew.js';
import { SKILLS } from './progress.js';
import { hooksOf } from './rates.js';
import { TRUSTED } from './intel.js';

// Note: what the office has done that rewards can follow, kept apart from reputation; state.feats is made by newState and the Release migration.
export const NO_FEATS = Object.freeze({ duelsWon: 0, roadWins: 0, avoided: 0, kinds: {} });
export const feat = (state, key) => { state.feats[key] += 1; };
// Note: a settled case of this kind.
export const featKind = (state, kind) => { state.feats.kinds[kind] = (state.feats.kinds[kind] || 0) + 1; };

const loyalVeteran = (state) => state.crew.find((c) => c.role !== 'sheriff' && c.loyalty >= 85 && c.cases >= 3);
const where = (state) => state.at || state.journey.to;
// Note: the nearest place within km of the party, its own first, that passes ok.
const nearest = (state, km, ok) => [where(state), ...placesWithin(where(state), km).map((p) => p.id)].find((id) => ok(PLACES[id])) || null;
const hires = (state) => nearest(state, 300, (p) => p.services.recruit);

// Note: the catalogue; when is the hidden condition, kind the sort of access, and place, where one is needed, the town it is found in.
export const REWARDS = Object.freeze([
  {
    id: 'ranger', kind: 'recruit', place: hires, title: 'An old Ranger', when: (s) => s.rep.team >= 40 && s.done >= 4,
    text: 'A former Ranger has heard of the office and is asking for the sheriff in town.',
    who: { kind: 'appointed', base: 0.72, lean: 'toughness', acquired: ['defending'], blurb: 'Rode with the Rangers for ten years. Wants a badge again.' },
  },
  {
    id: 'scout', kind: 'recruit', place: hires, title: 'A tracker', when: (s) => s.feats.roadWins >= 3 || s.feats.avoided >= 2,
    text: 'Word of the office\'s fights on the road has reached a tracker who reads ground like print.',
    who: { kind: 'independent', base: 0.6, lean: 'awareness', acquired: ['protective'], blurb: 'A tracker and scout who misses nothing on the trail.' },
  },
  {
    id: 'shootist', kind: 'recruit', place: hires, title: 'A famous shot', when: (s) => s.feats.duelsWon >= 2,
    text: 'A shootist who admires the sheriff\'s duels wants to ride with the office.',
    who: { kind: 'independent', base: 0.62, lean: 'precision', acquired: ['aggression'], blurb: 'Known from Abilene to Denver for his shooting.' },
  },
  {
    id: 'kin', kind: 'recruit', place: hires, title: 'A friend vouched for', when: (s) => !!loyalVeteran(s),
    text: 'One of your most loyal people has sent for a friend who wants to join the office.',
    who: { kind: 'appointed', base: 0.58, lean: 'toughness', acquired: ['loyalty'], blurb: 'Vouched for by one of your own.' },
  },
  {
    id: 'gunsmith', kind: 'equipment', place: (s) => nearest(s, 400, (p) => p.services.store && (p.size ?? 0) >= 2), title: 'A gunsmith\'s back room', when: (s) => s.done >= 6 || (sheriffOf(s)?.acquired || []).includes('favorite-guns'),
    text: 'A gunsmith in a large town will now sell the office the fine pieces he keeps in the back.',
  },
  {
    id: 'express', kind: 'opportunity', title: 'The express company', when: (s) => (s.feats.kinds['stage-robbers'] || 0) + (s.feats.kinds['payroll-robbers'] || 0) >= 1 && s.rep.team >= 25,
    text: 'The express company will now pay the office a premium on robbers it hunts down.',
  },
  {
    id: 'cattlemen', kind: 'opportunity', title: 'The cattlemen\'s association', when: (s) => (s.feats.kinds.rustlers || 0) + (s.feats.kinds['horse-thieves'] || 0) >= 2,
    text: 'The cattlemen\'s association raises its bounties for thieves the office brings in.',
  },
  {
    id: 'network', kind: 'opportunity', title: 'A network of informers', when: (s) => Object.values(s.contacts).some((t) => Object.values(t).some((k) => k.trust >= TRUSTED)),
    text: 'A trusted contact has put the office in touch with informers in every town.',
  },
]);

export const found = (state, id) => state.rewards.found.includes(id);

// Note: a distinctive recruit made from the reward's own hash, so the campaign dice stay where they were; he waits in the town given.
function distinctive(state, r, town) {
  const g = rng(seedFromString(`${state.seed}:reward:${r.id}`));
  const who = randomPerson(g, { use: r.who.kind === 'appointed' ? 'deputy' : 'hire', ...takenNames(state) });
  const skill = Object.fromEntries(SKILLS.map((k) => [k, clamp(r.who.base + (k === r.who.lean ? 0.14 : 0) + g.range(-0.04, 0.04), 0.3, 0.92)]));
  const cand = candidateRecord(state, {
    who, kind: r.who.kind, place: town, skill, bias: 0.05, hand: g.chance(0.12) ? 'left' : 'right', loadout: KIT.map((w) => ({ ...w })), blurb: r.who.blurb, acquired: r.who.acquired.slice(), distinctive: r.title,
  }, 1.15);
  townOf(state, town).candidates.push(cand);
}

// Note: item 471: checks every reward not yet found; one whose hidden condition now holds, and whose town if it needs one is near, is found, granted and announced.
export function checkRewards(state, events) {
  if (state.ended || !state.crew.length) return;
  for (const r of REWARDS) {
    if (found(state, r.id) || !r.when(state)) continue;
    // Note: a reward turns up on most days its condition holds, from a hash, so the moment is not predictable.
    const turn = hooksOf(state).reward ?? unit(`${state.seed}:reward-day:${r.id}:${Math.floor(state.min / 1440)}`) < 0.6;
    const town = r.place ? r.place(state) : null;
    if (!turn || (r.place && !town)) continue;
    if (r.kind === 'recruit') distinctive(state, r, town);
    if (r.kind === 'equipment') state.rewards.gunsmith = town;
    state.rewards.found.push(r.id);
    // Note: the town it is found in goes on the map, so the party can ride there.
    if (town) learn(state, town, 'word of what the office has come upon', true);
    const text = town ? `${r.text} (${PLACES[town].name})` : r.text;
    logLine(state, text);
    events.push({ type: 'reward', id: r.id, kind: r.kind, title: r.title, text, place: town });
  }
}

// Note: item 471: what a found opportunity adds to a case's pay.
export function rewardBonus(state, kind) {
  if (found(state, 'express') && (kind === 'stage-robbers' || kind === 'payroll-robbers' || kind === 'bank-robbers')) return 1.3;
  if (found(state, 'cattlemen') && (kind === 'rustlers' || kind === 'horse-thieves')) return 1.35;
  return 1;
}

// Note: the rewards found so far, for the journal; the unfound stay unknown.
export const rewardsView = (state) => state.rewards.found.map((id) => {
  const r = REWARDS.find((x) => x.id === id);
  return { id, kind: r.kind, title: r.title, text: r.text, place: r.kind === 'equipment' ? PLACES[state.rewards.gunsmith].name : null };
});
