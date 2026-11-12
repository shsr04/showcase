// Note: site and party setup for the Sim, filling every optional field so the Sim never meets a missing one.

import { clamp } from './rand.js';
import { solidAt, ringCells } from './map.js';
import { oldWound } from './wounds.js';
import { BASE_AMMO } from './weapons.js';
import { lawmanKit } from './actors.js';
import { drinkEffects } from './camp/drink.js';

// Note: a site gives slots for the sheriff and SLOT_DEPUTIES deputies, and up to MAX_DEPUTIES (item 322) stand near them.
export const SLOT_DEPUTIES = 4;
export const MAX_DEPUTIES = 12;
export const BASE_SKILL = 0.5;
export const BASE_LOYALTY = 55;

// Note: an outdoor site has only its ground floor.
export const siteFloors = (site) => (site && (site.kind === 'outdoor' || site.stories === 1) ? 1 : Math.max(2, site?.stories || 2));

// Note: items 464–467: a skill record as the Sim reads it, aim, handling, nerve and awareness, each at the baseline when missing; a campaign record (precision, toughness, awareness) is translated, one in the Sim's terms passes through.
const SIM_BASE = Object.freeze({ aim: BASE_SKILL, nerve: BASE_SKILL, handling: BASE_SKILL, awareness: BASE_SKILL });
export function simSkill(skill) {
  const s = skill || {};
  if (!Number.isFinite(s.precision) && !Number.isFinite(s.toughness)) return { ...SIM_BASE, ...s };
  const precision = s.precision ?? BASE_SKILL;
  return { aim: precision, handling: precision, nerve: s.toughness ?? BASE_SKILL, awareness: s.awareness ?? BASE_SKILL };
}

// Note: multipliers from skill (0.5 is the baseline) and fatigue for aim error, settling, handling, walking speed, AI reaction time and AI noticing (item 467).
export function skillMods(skill = {}, fatigue = 0) {
  const sk = simSkill(skill);
  const aim = clamp(sk.aim, 0, 1);
  const handling = clamp(sk.handling, 0, 1);
  const awareness = clamp(sk.awareness, 0, 1);
  const f = clamp(fatigue ?? 0, 0, 1);
  return {
    aim: (1 - (aim - BASE_SKILL) * 0.5) * (1 + f * 0.4),
    settle: (1 + (aim - BASE_SKILL) * 0.4) * (1 - f * 0.3),
    handling: 1 + (handling - BASE_SKILL) * 0.5,
    speed: 1 - f * 0.2,
    think: 1 + f * 0.6,
    notice: 1 - (awareness - BASE_SKILL) * 0.6,
  };
}

const DEFAULT_NAME = { sheriff: 'Sheriff', deputy: 'Deputy' };

function member(m = {}, role, i, count) {
  const kit = lawmanKit(role);
  const name = m.name || (role === 'deputy' && count > 1 ? `Deputy ${i + 1}` : DEFAULT_NAME[role]);
  return {
    charId: m.charId ?? null,
    name,
    hand: m.hand,
    skill: simSkill(m.skill),
    fatigue: m.fatigue ?? 0,
    loyalty: m.loyalty ?? BASE_LOYALTY,
    injuries: (m.injuries || []).map((x) => ({ ...x })),
    loadout: (m.loadout || kit.loadout).map((l) => ({ ...l })),
    reserve: { ...Object.fromEntries(BASE_AMMO.map((t) => [t, 0])), ...(m.reserve || (m.loadout ? {} : kit.reserve)) },
    passive: !!m.passive,
    intoxication: m.intoxication || 0,
    hangover: m.hangover || 0,
  };
}

// Note: a missing deputies list means one baseline deputy, and an empty list means none.
export function normalizeParty(party) {
  const p = party || {};
  const list = (p.deputies || [{}]).slice(0, MAX_DEPUTIES);
  return {
    sheriff: member(p.sheriff, 'sheriff', 0, 1),
    deputies: list.map((m, i) => member(m, 'deputy', i, list.length)),
  };
}

// Note: puts a member's skill, fatigue, injuries and identity on the actor.
export function applyMember(a, m) {
  a.charId = m.charId;
  // Note: item 325: a teammate unfit to fight is in the scene, cannot fight, and can be targeted.
  if (m.passive) a.passive = true;
  const sk = simSkill(m.skill);
  a.skill = sk;
  a.fatigue = m.fatigue;
  a.loyalty = m.loyalty;
  a.mods = skillMods(sk, m.fatigue);
  // Note: drink sways the aim and slows the head, and a hangover slows too (item 346).
  const e = drinkEffects({ drink: m.intoxication, hangover: m.hangover });
  if (m.intoxication || m.hangover) {
    a.mods.aim *= e.aim;
    a.mods.think *= e.slow;
    a.mods.handling /= e.slow;
    a.mods.speed *= 1 - 0.15 * e.unsteady - 0.1 * e.hangover;
    a.drink = e.sway;
  }
  a.traits.nerve = clamp(sk.nerve, 0, 1);
  // Note: items 465–467: a lawman's experience, which quickens his reactions, comes from Toughness and Awareness, never from Precision.
  a.traits.experience = (sk.nerve + sk.awareness) / 2 >= 0.75 ? 'veteran' : 'seasoned';
  for (const inj of m.injuries) a.wounds.push(oldWound(inj));
  m.loadout.forEach((l, i) => {
    if (l.loaded != null && a.weapons[i]) a.weapons[i].loaded = clamp(Math.round(l.loaded), 0, a.weapons[i].loaded);
  });
  return a;
}

const free = (map, f, x, y) => !solidAt(map, f, Math.floor(x), Math.floor(y));

// Note: the nearest free untaken cell centre to a point, else the point's own cell.
function nearestFree(map, f, x, y, taken = []) {
  for (const c of ringCells(Math.floor(x), Math.floor(y), 4)) {
    const p = { x: c.x + 0.5, y: c.y + 0.5, floor: f };
    if (free(map, f, p.x, p.y) && !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 0.9)) return p;
  }
  return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, floor: f };
}

// Note: deputy i stands on his slot, or past the site's slots on a free cell by an earlier deputy's slot.
export function partySlot(map, slots, i, taken) {
  if (slots[i]) return slots[i];
  const near = slots[1 + ((i - 1) % SLOT_DEPUTIES)] || slots[0];
  return nearestFree(map, near.floor ?? 0, near.x, near.y + 1, taken);
}

// Note: five party slots, the missing ones placed beside and behind the sheriff and first deputy.
export function deriveSlots(site) {
  const sp = site.spawn || {};
  const given = sp.slots || [];
  const s = given[0] || sp.sheriff;
  const d = given[1] || sp.deputy || { x: s.x + 2, y: s.y, floor: s.floor ?? 0 };
  const f = s.floor ?? 0;
  const len = Math.hypot(d.x - s.x, d.y - s.y);
  const [ux, uy] = len > 1e-6 ? [(d.x - s.x) / len, (d.y - s.y) / len] : [1, 0];
  const want = [
    s,
    d,
    { x: s.x - ux * 2, y: s.y - uy * 2 },
    { x: d.x + ux * 2, y: d.y + uy * 2 },
    { x: (s.x + d.x) / 2 - uy, y: (s.y + d.y) / 2 + Math.abs(ux) },
  ];
  const out = [];
  want.forEach((p, i) => {
    const g = given[i];
    if (g) out.push({ x: g.x, y: g.y, floor: g.floor ?? f });
    else if (i < 2) out.push({ x: p.x, y: p.y, floor: p.floor ?? f });
    else out.push(nearestFree(site.map, f, p.x, p.y, out));
  });
  return out;
}

// Note: with no safe test an open site counts ground as safe when it lies this far from every hostile start.
const SAFE_FROM_HOSTILES = 22;

// Note: fills every optional site field of a copy, so a site needs only a map and a sheriff spawn.
export function normalizeSite(site) {
  if (!site || !site.map) throw new Error('a site needs a map');
  const sp = site.spawn || {};
  if (!sp.sheriff && !(sp.slots && sp.slots[0])) throw new Error('a site needs a sheriff spawn');
  const hostiles = site.hostiles || [];
  const slots = deriveSlots({ ...site, spawn: sp });
  const spawn = { ...sp, sheriff: sp.sheriff || slots[0], deputy: sp.deputy || slots[1], slots };
  const safe = site.safe || ((x, y) => hostiles.every((h) => Math.hypot(h.x - x, h.y - y) > SAFE_FROM_HOSTILES));
  return {
    ...site,
    kind: site.kind || 'house',
    terrain: site.terrain ?? null,
    stairs: site.stairs || null,
    // Note: every flight between neighbouring storeys, lowest first; a site that names only its stairs has that one flight from the ground floor.
    flights: site.flights || (site.stairs ? [{ lo: 0, ...site.stairs }] : []),
    rooms: site.rooms || [],
    entries: site.entries || [],
    doors: site.doors || [],
    windows: site.windows || [],
    hostiles,
    civilian: site.civilian || null,
    rumor: !!site.rumor,
    spawn,
    safe,
  };
}
