// Note: the sheriff's people: characters, skills, loyalty, fatigue, persistent injuries, recruitment, refusal and succession, with no DOM or Phaser.

import { PLACES, WAGE } from './world.js';
import { rng as makeRng } from '../rand.js';
import { clamp, dice, charById, logLine, sheriffOf } from './base.js';
import { makeName, lastOf } from './names.js';

import { BASE_SKILL, rollSkill, skillAvg } from './progress.js';
import { hasTrait, note, regardOf } from './traits.js';

// Note: item 322: by team reputation from, the office cap and the encounter limit, the sheriff not counted; every other member counts (item 324).
export const TEAM_LIMITS = Object.freeze([[0, 3, 2], [20, 5, 3], [40, 7, 5], [60, 9, 6], [80, 12, 8]]);
export function teamLimits(rep) {
  const row = TEAM_LIMITS.filter(([from]) => rep >= from).pop() || TEAM_LIMITS[0];
  return { office: row[1], encounter: row[2] };
}
export const officeCount = (state) => state.crew.filter((c) => c.role !== 'sheriff').length;

export const KIT = [{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '45colt' }];
const kit = () => KIT.map((w) => ({ ...w }));

// Note: names are invented; the catalogue lives in names.js and its surnames avoid every real figure of the Tombstone years, which tests check against FORBIDDEN_NAMES.
export {
  FORBIDDEN_NAMES, FORBIDDEN_FIRST, FORBIDDEN_FULL, ALIASES, ROLE_WORDS, GROUPS, USE, FIRST_NAMES, LAST_NAMES, makeName, startNames,
} from './names.js';
import { heavyDrinker } from './drink.js';
import { hireLoadout, reserveFor, orderLoadout } from './arsenal.js';

export const ROLE_TITLE = { sheriff: 'Sheriff', deputy: 'Deputy', hire: 'Hired hand' };

// Note: the name as the player reads it, with the nickname between the quotes when the person has one.
export function displayName(c) {
  if (!c.alias) return c.name;
  const [first, ...rest] = c.name.split(' ');
  return `${first} "${c.alias}" ${rest.join(' ')}`.trim();
}
// Note: the sheriff and the deputy read with their title, a hired hand by name alone.
export const labelOf = (c) => (c.role === 'hire' ? displayName(c) : `${ROLE_TITLE[c.role] || ''} ${displayName(c)}`.trim());

// Note: the full names and the surnames already in use among the crew, the fallen and the people looking for work.
export function takenNames(state) {
  const names = new Set();
  const lasts = new Set();
  const add = (n) => {
    if (!n) return;
    names.add(n.toLowerCase());
    lasts.add(lastOf(n).toLowerCase());
  };
  for (const c of state.crew) add(c.name);
  for (const f of state.fallen) add(f.char.name);
  for (const t of Object.values(state.towns)) for (const k of t.candidates || []) add(k.name);
  return { taken: names, avoidLast: lasts };
}

// Note: takes exactly two draws from the campaign dice and grows the rest of the name from a stream seeded with them, so adding or changing names never moves the game's own dice.
export function randomPerson(d, opts = {}) {
  const a = Math.floor(d.next() * 4294967296);
  const b = Math.floor(d.next() * 4294967296);
  return makeName(makeRng((a ^ Math.imul(b, 0x9e3779b1)) >>> 0), opts);
}

// Note: a name for a case's target; the men an outlaw band is made of.
export const randomName = (d, opts = { use: 'target' }) => randomPerson(d, opts).name;

// Note: ids are c1, c2, ... for the whole campaign; the starting sheriff is c1 and the deputy c2.
export function makeChar(state, o) {
  const d = dice(state);
  const base = o.skillBase ?? BASE_SKILL;
  const skill = o.skill || rollSkill(d, base, 0.05, 0.2, 0.9);
  // Note: a person made without a name gets one that no one else in the office or in town has; the draws sit where they always did.
  const who = o.name ? null : randomPerson(d, { use: o.role === 'sheriff' ? 'sheriff' : o.role === 'deputy' ? 'deputy' : 'hire', ...takenNames(state) });
  return {
    id: `c${state.nextChar++}`,
    name: o.name || who.name,
    alias: o.alias !== undefined ? o.alias : who ? who.alias : null,
    role: o.role,
    sex: o.sex || (who && who.sex) || 'm',
    heavy: heavyDrinker(state.seed, o.name || who.name),
    origin: o.origin || null,
    terms: o.terms || { kind: o.role === 'sheriff' ? 'sheriff' : 'appointed', wageCentsPerWeek: 0 },
    skill,
    // Note: item 469: a person's own name, apart from the office's; the sheriff's is state.rep.sheriff.
    reputation: o.reputation ?? 0,
    acquired: o.acquired ? o.acquired.slice() : [],
    marks: {},
    // Note: item 475: purchases by model, toward a favourite gun.
    gunBuys: {},
    loyalty: o.loyalty ?? 55,
    fatigue: 0,
    injuries: [],
    hand: o.hand || (d.chance(0.12) ? 'left' : 'right'),
    loadout: o.loadout || kit(),
    stowed: [],
    cases: 0,
    where: o.where || 'party',
    wageDueMin: o.wageDueMin ?? null,
    unpaid: 0,
    hiredMin: o.hiredMin ?? state.min,
  };
}

// Note: loyalty grows through solved cases and through bonding in action (item 141).
export function bond(state, ids, amount) {
  for (const id of ids) {
    const c = charById(state, id);
    if (c && c.role !== 'sheriff') c.loyalty = clamp(c.loyalty + amount, 0, 100);
  }
}

export const LASTING = { head: 'headaches and a short temper', chest: 'a scarred lung', abdomen: 'an old gut wound', arm: 'a stiff arm', leg: 'a limp' };

// Note: days an injury of this severity takes to mend on a normal day of travel.
const healDays = (sev) => 6 + 40 * sev;

export function addInjuries(c, list) {
  for (const w of list) {
    c.injuries.push({
      region: w.region, side: w.side || 0, severity: clamp(w.severity ?? 0.5, 0.1, 1), healed: 0, lasting: null, treated: false, ageMin: 0,
    });
  }
  // Note: a character keeps at most six records; the lightest ones are folded away first.
  while (c.injuries.length > 6) {
    const i = c.injuries.reduce((m, x, k, a) => (x.severity * (1 - x.healed) < a[m].severity * (1 - a[m].healed) ? k : m), 0);
    c.injuries.splice(i, 1);
  }
}

export const activeInjuries = (c) => c.injuries.filter((i) => !i.lasting);
// Note: how badly hurt a character is right now, the sum of what is left of each wound.
export const burden = (c) => c.injuries.reduce((s, i) => s + (i.lasting ? i.severity : i.severity * (1 - i.healed)), 0);
export const isFit = (c) => burden(c) < 1.5;

// Note: the old, non-bleeding wounds handed to the Sim as Member.injuries (contract S).
export function simInjuries(c) {
  const out = [];
  for (const i of c.injuries) {
    const sev = i.lasting ? i.severity : i.severity * (1 - 0.85 * i.healed);
    if (sev >= 0.05) out.push({ region: i.region, side: i.side, severity: Math.min(1, sev) });
  }
  return out;
}

// Note: heals one character over dt minutes; mult is the care factor (rest, a doctor); lasting impairments settle when a wound closes.
export function heal(state, c, dt, mult = 1) {
  const d = dice(state);
  for (let k = c.injuries.length - 1; k >= 0; k--) {
    const i = c.injuries[k];
    if (i.lasting) continue;
    i.ageMin += dt;
    const care = mult * (i.treated ? 1.8 : 1);
    i.healed = Math.min(1, i.healed + (dt * care) / (healDays(i.severity) * 1440));
    if (i.healed >= 1) {
      const p = clamp((i.severity - 0.4) * 0.9, 0, 0.6) * (i.treated ? 0.4 : 1);
      if (p > 0 && d.chance(p)) {
        i.lasting = LASTING[i.region] || 'an old wound';
        i.severity = i.severity * 0.3;
        i.healed = 1;
      } else c.injuries.splice(k, 1);
    }
  }
}

export function fatigueLabel(f) {
  return f < 0.15 ? 'rested' : f < 0.4 ? 'tired' : f < 0.7 ? 'weary' : 'exhausted';
}

export function conditionLabel(c) {
  const b = burden(c);
  return b < 0.05 ? 'sound' : b < 0.4 ? 'bruised and mending' : b < 0.9 ? 'hurt' : b < 1.5 ? 'badly hurt' : 'laid up';
}

// Note: what a character of this skill would ask by the week.
export function marketWage(c) {
  return Math.round((WAGE.appointedBase + WAGE.perSkill * skillAvg(c)) / 50) * 50;
}

// Note: 0..1 readiness to stay and to ride out; only loyalty, reputation and pay count, never danger, wounds or fatigue (item 135).
export function mood(state, c) {
  if (c.role === 'sheriff') return 1;
  const market = marketWage(c);
  const paid = c.terms.kind === 'case' ? (c.terms.casePayCents || 0) / Math.max(1, market * 2) : (c.terms.wageCentsPerWeek || 0) / market;
  const payRatio = Math.min(1.2, paid);
  // Note: item 468: a self-serving hand weighs pay over loyalty, a grudge-holder takes owed wages harder, and a steadfast one stays put.
  const selfish = hasTrait(c, 'self-interest') ? 0.12 : 0;
  const owed = (hasTrait(c, 'resentment') ? 0.22 : 0.15) * Math.min(3, c.unpaid);
  const score = (c.loyalty / 100) * (0.55 - selfish) + (state.rep.team / 100) * 0.2 + (payRatio / 1.2) * (0.25 + selfish) - owed + (hasTrait(c, 'loyalty') ? 0.08 : 0);
  return clamp(score, 0, 1);
}

export const REFUSE_BELOW = 0.3;
export const LEAVE_BELOW = 0.2;
export const refuses = (state, c) => mood(state, c) < REFUSE_BELOW;
export const wantsToLeave = (state, c) => mood(state, c) < LEAVE_BELOW;

// Note: candidate ids come from the state so a saved game never repeats one.
// Note: R2-11: force names the kind a pool is missing; the roll is taken all the same so a pool that is not short plays out the same.
export function makeCandidate(state, placeId, force) {
  const d = dice(state);
  const rolled = d.chance(0.45) ? 'appointed' : 'independent';
  const kind = force || rolled;
  const base = clamp(0.38 + state.rep.sheriff * 0.0015 + d.range(-0.06, 0.12), 0.3, 0.7);
  // Note: a deputy is appointed from the men of the town; an independent hand is now and then a woman.
  const who = randomPerson(d, { use: kind === 'appointed' ? 'deputy' : 'hire', femaleChance: kind === 'appointed' ? 0 : 0.07, alias: 0.12, ...takenNames(state) });
  const skill = rollSkill(d, base, 0.06, 0.2, 0.85);
  const bias = d.range(-0.12, 0.12);
  const hand = d.chance(0.12) ? 'left' : 'right';
  return candidateRecord(state, {
    who,
    kind,
    place: placeId,
    skill,
    bias,
    hand,
    ...hireKit(state, placeId, kind, who, skill, d),
  });
}

// Note: the background a blurb tells, so the guns match the life; the lists keep their order, so the draw that picks a blurb is unchanged.
const BLURBS_F = [['station', 'Ran a stage station alone for two years.'], ['rancher', 'A rancher\'s widow who can shoot straight.'], ['teamster', 'A teamster who can shoot straight.'], ['quiet', 'Quiet, steady, asks no questions.'], ['drover', 'Grew up on a drover\'s outfit and rides like it.']];
const BLURBS_M = [['drover', 'A drover between jobs.'], ['cavalry', 'Ex-cavalry, handy with a rifle.'], ['teamster', 'A teamster who can shoot straight.'], ['miner', 'A miner out of work and short of money.'], ['quiet', 'Quiet, steady, asks no questions.']];

// Note: a candidate's background, blurb, own guns and own cartridges; the guns come from a hash of the candidate, by background, skill and the region of the town.
function hireKit(state, placeId, kind, who, skill, d) {
  // Note: the earlier kit draw of an independent is kept, so the campaign's random stream stays as it was.
  if (kind !== 'appointed') d.chance(0.55);
  const [background, blurb] = kind === 'appointed' ? ['deputy', 'Wants a deputy\'s badge and a steady wage.'] : d.pick(who.sex === 'f' ? BLURBS_F : BLURBS_M);
  const tag = `${state.seed}:hire:${state.nextCand}:${who.name}`;
  const loadout = orderLoadout(hireLoadout(background, skill, PLACES[placeId]?.region, tag));
  return { background, blurb, loadout, rounds: reserveFor(loadout, tag) };
}

// Note: a candidate's record from a drawn person and his particulars, with a fresh id and his asking pay; premium raises the asking of a distinctive recruit (item 471).
export function candidateRecord(state, { who, ...o }, premium = 1) {
  const c = { id: `k${state.nextCand++}`, name: who.name, alias: who.alias, sex: who.sex, ...o, postedMin: state.min };
  c.askWeekly = Math.round((marketWage(c) * (c.kind === 'independent' ? WAGE.hireExtra : 1) * premium) / 50) * 50;
  c.askCase = Math.round((c.askWeekly * 1.6) / 100) * 100;
  return c;
}

// Note: the weights of willingness: a base, the sheriff's name, and the pay against the asking, counted up to most times it.
export const WILL = Object.freeze({ base: 0.4, name: 0.3, pay: 0.5, most: 1.5 });

// Note: willingness depends on the sheriff's reputation and the pay offered, plus a fixed personal bias (items 148 to 151).
export function willingness(state, cand, offer) {
  const asking = offer.kind === 'case' ? cand.askCase : cand.askWeekly;
  const offered = offer.kind === 'case' ? offer.casePayCents : offer.wageCentsPerWeek;
  const ratio = asking > 0 ? offered / asking : 1;
  return WILL.base + WILL.name * (state.rep.sheriff / 100) + WILL.pay * (Math.min(WILL.most, ratio) - 1) + cand.bias + regardOf(sheriffOf(state));
}
export const WILLING_AT = 0.45;
// Note: item 469: the share of the asking pay a candidate with this personal leaning settles for, from the sheriff's name and conduct; above most, no pay will do.
export const acceptRatio = (state, bias = 0) => 1 + (WILLING_AT - WILL.base - WILL.name * (state.rep.sheriff / 100) - regardOf(sheriffOf(state)) - bias) / WILL.pay;

export function recruit(state, cand, terms, here) {
  if (officeCount(state) >= teamLimits(state.rep.team).office) return { ok: false, reason: 'The office cannot take on more people at its present standing.' };
  if (cand.kind === 'appointed' && terms.kind !== 'appointed') return { ok: false, reason: 'A deputy is appointed to the office at a weekly wage.' };
  if (cand.kind === 'independent' && terms.kind === 'appointed') return { ok: false, reason: 'An independent works for a case or by the week.' };
  const offered = terms.kind === 'case' ? terms.casePayCents : terms.wageCentsPerWeek;
  if (!(offered > 0)) return { ok: false, reason: 'Name a wage.' };
  if (willingness(state, cand, terms) < WILLING_AT) return { ok: false, reason: `${cand.name} turns it down.` };
  const t = terms.kind === 'case'
    ? { kind: 'case', caseId: terms.caseId, casePayCents: terms.casePayCents, wageCentsPerWeek: 0 }
    : { kind: terms.kind, wageCentsPerWeek: terms.wageCentsPerWeek };
  const ratio = Math.min(1.5, offered / (terms.kind === 'case' ? cand.askCase : cand.askWeekly));
  const c = makeChar(state, {
    role: cand.kind === 'appointed' ? 'deputy' : 'hire', name: cand.name, sex: cand.sex, alias: cand.alias || null, skill: { ...cand.skill }, hand: cand.hand, loadout: cand.loadout.map((w) => ({ ...w })), acquired: cand.acquired || [],
    terms: t, loyalty: Math.round(clamp(38 + state.rep.sheriff * 0.2 + (ratio - 1) * 20, 25, 70)), where: here,
    wageDueMin: terms.kind === 'case' ? null : state.min + 7 * 1440,
  });
  state.crew.push(c);
  // Note: a hand brings the cartridges for their own guns into the office's stock.
  for (const [type, n] of Object.entries(cand.rounds || {})) state.ammo[type] = (state.ammo[type] || 0) + n;
  // Note: item 475: paying well above the asking is the sheriff's open hand.
  const events = [];
  if (ratio >= 1.2) note(state, sheriffOf(state), 'generosity', events);
  logLine(state, `${c.name} joins as ${c.role === 'deputy' ? 'a deputy' : terms.kind === 'case' ? 'a hand for the case' : 'a hired hand'}.`);
  return { ok: true, char: c, events };
}

export function kill(state, c, cause) {
  const i = state.crew.indexOf(c);
  if (i < 0) return;
  state.crew.splice(i, 1);
  // Note: a party member who falls between towns is recorded on the road to the journey's end.
  const road = c.where === 'party' && !state.at && !!state.journey;
  state.fallen.push({ char: c, min: state.min, where: c.where === 'party' ? (state.at || (state.journey && state.journey.to) || null) : c.where, ...(road ? { road: true } : {}), cause });
  logLine(state, `${labelOf(c)} is dead (${cause}).`);
}

export const successionScore = (c) => 0.5 * (c.loyalty / 100) + 0.5 * skillAvg(c);
// Note: item 270: only a very loyal deputy carries the revenge on; the threshold is a playtesting parameter.
export const VERY_LOYAL = 80;

// Note: called when no sheriff is left in the crew; returns what happened and may end the campaign (items 107, 109, 122, 171, 270, 274, 305).
// Note: the office looks among everyone alive, at home or on the road; where they stand only decides who rides to the party (item 109).
// Note: item 171: skills, wounds, equipment and the team's name pass on whole; the sheriff's own name passes at 0.6 of what it was, as it belonged to the man who died.
export function succeed(state) {
  const alive = state.crew.slice();
  if (!alive.length) {
    state.ended = { min: state.min, reason: 'The sheriff is dead and no one is left to carry on.', outcome: 'failure' };
    return { kind: 'ended', reason: state.ended.reason };
  }
  const here = alive.filter((c) => c.where === 'party');
  const deputies = alive.filter((c) => c.role === 'deputy').sort((a, b) => successionScore(b) - successionScore(a) || a.id.localeCompare(b.id));
  const put = (c) => {
    c.where = 'party';
    if (state.journey && !state.journey.party.includes(c.id)) state.journey.party.push(c.id);
    state.crew.sort((a, b) => (a.role === 'sheriff' ? -1 : b.role === 'sheriff' ? 1 : 0));
  };
  // Note: with no one left riding the campaign follows the successor to his town; otherwise word reaches him and he joins the party.
  const lead = (c) => {
    if (!here.length && c.where !== 'party' && PLACES[c.where]) {
      state.at = c.where;
      state.journey = null;
    }
    put(c);
  };
  const heirs = deputies.filter((c) => c.loyalty >= VERY_LOYAL);
  if (heirs.length) {
    const c = heirs[0];
    const joined = c.where !== 'party';
    c.role = 'sheriff';
    c.terms = { kind: 'sheriff', wageCentsPerWeek: 0 };
    c.wageDueMin = null;
    c.unpaid = 0;
    lead(c);
    state.rep.sheriff = Math.max(Math.round(c.reputation), Math.round(state.rep.sheriff * 0.6));
    logLine(state, `${c.name} takes up the star${joined && here.length ? ' and joins the party' : ''}.`);
    return { kind: 'deputy-promoted', sheriffId: c.id, name: c.name };
  }
  // Note: items 274 and 305: without a very loyal deputy nobody carries the revenge on; an outside sheriff never would, so the campaign fails.
  state.ended = { min: state.min, reason: 'The sheriff is dead and no deputy is loyal enough to carry the revenge on.', outcome: 'failure' };
  logLine(state, state.ended.reason);
  return { kind: 'ended', reason: state.ended.reason };
}
