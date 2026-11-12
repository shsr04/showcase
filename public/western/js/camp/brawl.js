// Note: durable saloon-fight state and its one-time campaign settlement.
import { PLACES } from './world.js';
import { charById, clamp, clone, dice, logLine, sheriffOf, whole } from './base.js';
import { isFit, refuses, randomPerson, addInjuries, conditionLabel, teamLimits } from './crew.js';
import { presentIn } from './town.js';
import { applyDeaths, RESERVE_CAP, settleDepartures } from './economy.js';
import { advance, settle } from './state.js';
import { tireAfterFight } from './combat.js';
import { hooksOf } from './rates.js';
import { buildRoom } from './saloon-room.js';
import { unit } from '../rand.js';
import { WEAPONS } from '../weapons.js';
import { BrawlSim, BRAWL, standing, startPlan } from './brawl-sim.js';
import { makeLook, portraitOf } from './looks.js';
import { hasTrait, note } from './traits.js';
import { relEvent, willingToHelp, helpRank } from './relations.js';

const DISPUTES = ['drinking', 'gambling', 'insult'];
const MAX_WOUNDS = 40;
const AMMO_NAME = { '44-40': '.44-40', '45colt': '.45 Colt' };

// Note: the sheriff can only step in while fit; a fight aimed at an unfit sheriff never starts, so there is no choice to make.
export function canIntervene(state) {
  const sheriff = sheriffOf(state);
  if (!sheriff) return { ok: false, reason: 'There is no sheriff.' };
  if (!isFit(sheriff)) return { ok: false, reason: `${sheriff.name} is too hurt to fight.` };
  return { ok: true, reason: null };
}

// Note: called only by an existing saloon activity or by a teammate's rest visit.
export function incident(state, source, targetId, dispute) {
  const present = source === 'teammate-rest' ? state.rest?.town === state.at : source === 'saloon' && state.saloonVisit?.town === state.at;
  if (!present || state.ended || state.journey || state.active || state.duel || state.brawl || !PLACES[state.at]?.services.saloon || !DISPUTES.includes(dispute)) return null;
  const target = targetId ? charById(state, targetId) : null;
  if (targetId && (!target || !presentIn(state, state.at).includes(target) || !isFit(target))) return null;
  if (source === 'teammate-rest' && (!target || target.id === sheriffOf(state)?.id)) return null;
  const d = dice(state);
  const forced = hooksOf(state).armed;
  // Note: the roll is always made, so a forced answer leaves the dice where they were.
  const aggressors = Array.from({ length: d.int(1, 2) }, (_, i) => {
    const name = randomPerson(d, { use: 'any' }).name;
    const roll = d.chance(0.65);
    return { id: `aggressor-${i}`, name, armed: forced == null ? roll : !!forced };
  });
  const bystander = target ? null : { id: 'patron-defender', name: randomPerson(d, { use: 'any' }).name };
  state.brawl = { phase: 'choice', town: state.at, source, targetId, targetName: target?.name || bystander.name, dispute, aggressors, bystander, seed: d.int(0, 0x7fffffff) };
  return view(state);
}

// Note: what the screen needs to offer the right choices: whether the sheriff can step in, and whether they may stay out.
export function view(state) {
  if (!state.brawl) return null;
  const out = clone(state.brawl);
  const sheriff = sheriffOf(state);
  out.canIntervene = canIntervene(state).ok;
  out.canStayOut = !(state.brawl.targetId && state.brawl.targetId === sheriff?.id);
  out.reasonIntervene = out.canIntervene ? null : canIntervene(state).reason;
  // Note: item 316: the opening card shows the fighters' portraits: the one picked on and the men who started it.
  const target = state.brawl.targetId ? charById(state, state.brawl.targetId) : null;
  out.portraits = {
    target: target ? portraitOf(state, target) : { look: makeLook(state.seed, out.targetName, 'hire'), marks: [] },
    aggressors: state.brawl.aggressors.map((a) => ({ look: makeLook(state.seed, a.name, 'gunslinger'), marks: [] })),
  };
  return out;
}

const hashed = (brawl, id, tag) => unit(`${brawl.seed}:${id}:${tag}`);
const fighterLook = (brawl, id) => Math.floor(hashed(brawl, id, 'look') * 1000);

function setup(state, intervene) {
  const brawl = state.brawl;
  const sheriff = sheriffOf(state);
  const target = brawl.targetId && charById(state, brawl.targetId);
  if (!sheriff || brawl.targetId && (!target || !isFit(target))) return { ok: false, reason: 'A participant cannot fight.' };
  if (intervene && !isFit(sheriff)) return { ok: false, reason: `${sheriff.name} is too hurt to fight.` };
  if (!intervene && target === sheriff) return { ok: false, reason: 'The sheriff is already in the fight.' };
  const crew = [];
  if (intervene) crew.push(sheriff);
  if (target && !crew.includes(target)) crew.push(target);
  const helpers = [];
  if (intervene) {
    // Note: teammates in town who can fight and are willing come in from the street after the sheriff (item 249); when more are willing than may come, a defender or a protective hand comes first (item 468).
    const keen = (person) => (hasTrait(person, 'defending') || hasTrait(person, 'protective') ? 0 : 1);
    // Note: item 494: a bitter enemy of the one picked on stays out, and among the rest the closer friend comes first.
    const willing = presentIn(state, state.at).filter((person) => person !== sheriff && person !== target && isFit(person) && !refuses(state, person) && willingToHelp(state, person, target));
    helpers.push(...willing.sort((a, b) => keen(a) - keen(b) || helpRank(state, b, target) - helpRank(state, a, target)).slice(0, Math.max(0, teamLimits(state.rep.team).encounter + 1 - crew.length)));
  }
  const room = {
    seed: state.seed,
    town: { id: state.at, services: { saloon: { meal: !!PLACES[state.at]?.services.saloon?.meal, games: [...(PLACES[state.at]?.services.saloon?.games || [])] } } },
  };
  const built = buildRoom(room.seed, room.town);
  const plan = startPlan(built, brawl.seed, 1 + brawl.aggressors.length);
  // Note: each armed crew member loads first, then the rounds left are shared evenly as reserve, up to the duel's cap.
  const ammunition = { ...state.ammo };
  const guns = new Map();
  for (const p of [...crew, ...helpers]) {
    const weapon = p.loadout.find((w) => WEAPONS[w.id]?.kind === 'handgun');
    if (!weapon) continue;
    const loaded = Math.min(WEAPONS[weapon.id].cap, weapon.loaded ?? Infinity, ammunition[weapon.ammoType] || 0);
    ammunition[weapon.ammoType] -= loaded;
    guns.set(p.id, { weapon: { ...weapon }, loaded, reserve: 0 });
  }
  for (const type of Object.keys(ammunition)) {
    const holders = [...guns.values()].filter((g) => g.weapon.ammoType === type);
    const share = holders.length ? Math.min(RESERVE_CAP, Math.floor(ammunition[type] / holders.length)) : 0;
    for (const g of holders) g.reserve = share;
  }
  const kit = (p) => guns.get(p.id) || { weapon: null, loaded: 0, reserve: 0 };
  const door = built.spawn;
  const person = (p, at, arrive) => ({
    id: p.id, name: p.name, side: 'defender', crew: true, person: clone(p), hand: p.hand, x: at.x, y: at.y, facing: at.facing,
    ...kit(p), look: fighterLook(brawl, p.id), arrive,
  });
  const fighters = [];
  // Note: the first slot is the person the dispute is about; a sheriff who is not that person walks in from the door.
  const first = plan[0];
  for (const p of crew) fighters.push(person(p, p === target ? first : door, 0));
  if (!target) fighters.push({ id: brawl.bystander.id, name: brawl.bystander.name, side: 'defender', x: first.x, y: first.y, facing: first.facing, weapon: null, loaded: 0, reserve: 0, grit: 0.25 + 0.6 * hashed(brawl, brawl.bystander.id, 'grit'), temper: hashed(brawl, brawl.bystander.id, 'temper'), look: fighterLook(brawl, brawl.bystander.id) });
  let arrive = 0;
  helpers.forEach((p, i) => {
    arrive = Math.max(arrive + 1.2, BRAWL.arrive[0] + (BRAWL.arrive[1] - BRAWL.arrive[0]) * hashed(brawl, p.id, 'arrive'));
    fighters.push(person(p, door, Math.round(arrive * 10) / 10));
  });
  for (const [i, opponent] of brawl.aggressors.entries()) {
    const at = plan[i + 1] || plan[plan.length - 1];
    fighters.push({
      id: opponent.id, name: opponent.name, side: 'aggressor', x: at.x, y: at.y, facing: at.facing,
      weapon: opponent.armed ? { id: 'colt73', ammoType: '45colt' } : null, loaded: opponent.armed ? 6 : 0, reserve: opponent.armed ? 6 : 0,
      grit: 0.25 + 0.6 * hashed(brawl, opponent.id, 'grit'), temper: hashed(brawl, opponent.id, 'temper'), look: fighterLook(brawl, opponent.id),
      // Note: item 346: a man who starts a saloon fight has had a few; the same drink model as everyone's.
      drink: Math.round(hashed(brawl, opponent.id, 'drink') * 60) / 100,
    });
  }
  // Note: item 475: stepping into a fight for someone else is how a defender is made; coming to the sheriff's side counts too.
  const events = [];
  if (intervene && target && target !== sheriff) note(state, sheriff, 'defending', events);
  for (const p of helpers) note(state, p, 'defending', events);
  // Note: item 494: everyone in the fight sees who came to whose side.
  if (intervene && target && target !== sheriff) relEvent(state, 'help', sheriff.id, target.id, { events });
  for (const p of helpers) for (const q of crew) relEvent(state, 'help', p.id, q.id, { events });
  brawl.phase = 'fight';
  brawl.intervene = intervene;
  brawl.fighters = fighters;
  brawl.playerId = intervene ? sheriff.id : null;
  brawl.room = room;
  const tune = hooksOf(state).brawl;
  if (tune) brawl.tune = clone(tune);
  brawl.deferredDepartures = [];
  return { ok: true, brawl: view(state), events };
}

export function choose(state, intervene) {
  if (!state.brawl || state.brawl.phase !== 'choice' || typeof intervene !== 'boolean') return { ok: false, reason: 'There is no fight to answer.' };
  return setup(state, intervene);
}

// Note: how a fighter ended, in the words the result screen uses; the same wording for the sheriff's side and the others.
export function fateOf(result) {
  if (!result) return 'standing';
  // Note: a fatal wound is a death whatever the status says; the campaign settles it as one.
  if (result.status === 'dead' || (result.wounds || []).some((w) => w.fatal)) return 'killed';
  if (result.status === 'incapacitated') return 'knocked out';
  if (result.exit === 'fled') return 'fled';
  if (result.exit === 'surrendered') return 'surrendered';
  if (result.arrived === false) return 'late';
  return 'standing';
}

const FATE_TEXT = { killed: 'was killed', 'knocked out': 'was knocked out', fled: 'ran for the door', surrendered: 'gave up', late: 'came too late to help', standing: 'is still on their feet' };

// Note: the plain account of a settled fight: one line per person, from the report, for the sheriff's side and the other; nothing here changes the campaign.
export function summarize(brawl, report, extra = {}) {
  const byId = new Map(report.fighters.map((r) => [r.id, r]));
  const sides = brawl.fighters.map((f) => ({ id: f.id, name: f.name, side: f.side, crew: !!f.crew, fate: fateOf(byId.get(f.id)), rounds: byId.get(f.id).roundsFired }));
  const subject = brawl.intervene ? 'The sheriff' : brawl.targetName;
  const won = report.result === 'won';
  const headline = brawl.intervene ? (won ? 'The fight is won.' : 'The fight is lost.') : won ? `${subject} won the fight.` : `${subject} lost the fight.`;
  const lines = [];
  for (const s of sides) {
    if (s.fate === 'late' && !s.crew) continue;
    lines.push(`${s.name} ${FATE_TEXT[s.fate]}.`);
  }
  const shots = sides.reduce((n, s) => n + s.rounds, 0);
  if (report.escalated || shots > 0) lines.push(shots > 0 ? `Guns were drawn; ${shots} round${shots === 1 ? '' : 's'} fired.` : 'Guns were drawn, but no shot was fired.');
  const seconds = Math.round(report.seconds);
  return { headline, result: report.result, intervene: !!brawl.intervene, source: brawl.source, subject, fighters: sides, lines, seconds, shots, hurt: extra.hurt || [], loyalty: extra.loyalty || null, ammo: extra.ammo || {}, dead: extra.dead || [] };
}

export function finish(state, report) {
  const brawl = state.brawl;
  if (!brawl || brawl.phase !== 'fight' || !report || !Number.isFinite(report.seconds) || report.seconds <= 0 || report.seconds > 4 * 3600 || !['won', 'lost'].includes(report.result) || !Array.isArray(report.fighters) || report.fighters.length !== brawl.fighters.length) return { ok: false, reason: 'There is no complete fight to settle.' };
  const byId = new Map(report.fighters.map((f) => [f && f.id, f]));
  if (byId.size !== brawl.fighters.length) return { ok: false, reason: 'The fight report is incomplete.' };
  const ammoUsed = { '44-40': 0, '45colt': 0 };
  const validWound = (w) => w && ['head', 'chest', 'abdomen', 'arm', 'leg'].includes(w.region) && Number.isFinite(w.severity) && w.severity >= 0 && w.severity <= 1 && typeof w.fatal === 'boolean';
  for (const f of brawl.fighters) {
    const r = byId.get(f.id);
    if (!r || !['ok', 'incapacitated', 'dead'].includes(r.status) || ![null, 'fled', 'surrendered'].includes(r.exit) || !whole(r.roundsFired) || r.roundsFired < 0 || r.roundsFired > f.loaded + f.reserve || !Array.isArray(r.wounds) || r.wounds.length > MAX_WOUNDS || !r.wounds.every(validWound) || (r.status === 'dead' && !r.wounds.some((w) => w.fatal))) return { ok: false, reason: 'The fight report is incomplete.' };
    if (r.arrived === false && (r.status !== 'ok' || r.exit || r.roundsFired || r.wounds.length)) return { ok: false, reason: 'The fight report is incomplete.' };
    if (f.crew && f.weapon) ammoUsed[f.weapon.ammoType] += r.roundsFired;
  }
  // Note: the same test of "still in the fight" as the sim's; a helper who has not come in yet still counts for the sheriff's side.
  const active = (side) => brawl.fighters.some((f) => f.side === side && standing(byId.get(f.id).status, byId.get(f.id).exit));
  if ((report.result === 'won' && active('aggressor')) || (report.result === 'lost' && (!active('aggressor') || active('defender'))) || Object.keys(ammoUsed).some((type) => ammoUsed[type] > state.ammo[type])) return { ok: false, reason: 'The fight report does not match its outcome.' };
  for (const type of Object.keys(ammoUsed)) state.ammo[type] -= ammoUsed[type];
  const minutes = Math.max(1, Math.ceil(report.seconds / 60));
  const events = advance(state, minutes, 'fight');
  const deaths = [];
  const hurt = [];
  for (const f of brawl.fighters.filter((f) => f.crew)) {
    const person = charById(state, f.id);
    const result = byId.get(f.id);
    if (!person || result.arrived === false) continue;
    tireAfterFight(person, minutes);
    if (result.status === 'dead' || result.wounds.some((w) => w.fatal)) {
      deaths.push({ char: person, cause: 'injuries in a saloon fight' });
      events.push({ type: 'death', charId: person.id, name: person.name, cause: 'injuries in a saloon fight' });
    } else if (result.wounds.length) {
      addInjuries(person, result.wounds);
      hurt.push({ id: person.id, name: person.name, wounds: result.wounds.length, condition: conditionLabel(person) });
    }
  }
  applyDeaths(state, deaths);
  let loyalty = null;
  if (!brawl.intervene && brawl.source === 'teammate-rest') {
    const teammate = charById(state, brawl.targetId);
    if (teammate) {
      const before = teammate.loyalty;
      teammate.loyalty = clamp(teammate.loyalty - (hasTrait(teammate, 'resentment') ? 14 : 10), 0, 100);
      loyalty = { id: teammate.id, name: teammate.name, delta: teammate.loyalty - before };
      // Note: item 475: being left to fight alone is a significant event toward a grudge.
      note(state, teammate, 'resentment', events, { event: true });
      // Note: item 494: both know the sheriff stayed out of it.
      if (sheriffOf(state)) relEvent(state, 'neglect', teammate.id, sheriffOf(state).id, { events });
    }
  }
  settleDepartures(state, brawl, events);
  const ammo = Object.fromEntries(Object.entries(ammoUsed).filter(([, n]) => n > 0).map(([type, n]) => [AMMO_NAME[type] || type, n]));
  const summary = summarize(brawl, report, { hurt, loyalty, ammo, dead: deaths.map((d) => d.char.name) });
  logLine(state, `The saloon fight ${report.result === 'won' ? 'ends' : 'is lost'}.`);
  const source = brawl.source;
  state.brawl = null;
  settle(state, events);
  return { ok: true, result: report.result, source, events, minutes, report: clone(report), summary };
}

// Note: the sheriff keeps out of it: the same sim runs headless on the saved start, and its report is settled like any other.
export function stayOut(state) {
  // Note: a stay-out fight left in its fight phase (a save that was made after the choice) is settled again from its saved start.
  const left = state.brawl?.phase === 'fight' && state.brawl.intervene === false && state.brawl.targetId !== sheriffOf(state)?.id;
  const chosen = left ? { ok: true, brawl: view(state) } : choose(state, false);
  if (!chosen.ok) return chosen;
  const sim = new BrawlSim(chosen.brawl);
  const cap = Math.min(sim.tune.limit || BRAWL.limit, 3600) + 120;
  while (!sim.done && sim.time < cap) sim.step(0.5);
  if (!sim.done) return { ok: false, reason: 'The fight has not ended.' };
  return finish(state, sim.report());
}
