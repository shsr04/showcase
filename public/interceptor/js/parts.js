// Note: car part slots, part creation, fit rules and how part condition drives the car.

import { VEHICLE, partName } from './vehicles.js';
import { clamp } from './rand.js';
import { MPH_PX } from './config.js';

export const SLOTS = ['engine', 'transmission', 'tires', 'suspension', 'radiator', 'fueltank', 'battery', 'armor'];
export const SLOT_LABEL = {
  engine: 'Engine', transmission: 'Transmission', tires: 'Tires', suspension: 'Suspension',
  radiator: 'Radiator', fueltank: 'Fuel tank', battery: 'Battery', armor: 'Armor',
};
export const BIG = new Set(['engine', 'transmission']);

export function tierOf(cond) {
  if (cond < 35) return 'worn';
  if (cond < 60) return 'used';
  if (cond < 85) return 'good';
  return 'new';
}

export function makePart(id, vehicleId, slot, cond) {
  const v = VEHICLE[vehicleId];
  return { id, kind: 'part', slot, key: v.slots[slot], from: vehicleId, cond: Math.round(clamp(cond, 0, 100)) };
}

export function partLabel(part) {
  return partName(part.key, VEHICLE[part.from]);
}

export function fits(part, vehicle) {
  return !!part && part.kind === 'part' && vehicle.slots[part.slot] === part.key;
}

export function installedParts(vehicleId, conds, idBase) {
  const parts = {};
  for (const slot of SLOTS) {
    const c = conds[slot];
    parts[slot] = c == null ? null : makePart(`${idBase}:${slot}`, vehicleId, slot, c);
  }
  return parts;
}

const cond01 = (parts, slot) => (parts[slot] ? parts[slot].cond / 100 : 0);

// Note: speeds are px/s and accelerations px/s²; the P71 tops out near 205 px/s on fresh parts.
// Note: the drive force fades as a0 * (1 - (v / top)^2); a0 is solved so 0-60 takes the real time.
function launch(st) {
  if (st.a0) return st.a0;
  const vt = st.mph * MPH_PX;
  const v60 = 60 * MPH_PX;
  st.a0 = (vt / (2 * st.z60)) * Math.log((vt + v60) / (vt - v60));
  return st.a0;
}

export function carStats(vehicle, parts) {
  const st = vehicle.stats;
  const engine = cond01(parts, 'engine');
  const trans = cond01(parts, 'transmission');
  const tires = cond01(parts, 'tires');
  const susp = cond01(parts, 'suspension');
  const rad = cond01(parts, 'radiator');
  const tank = cond01(parts, 'fueltank');
  const batt = cond01(parts, 'battery');
  return {
    disabled: engine <= 0 || trans <= 0,
    accel: launch(st) * (0.45 + 0.55 * engine) * (0.85 + 0.15 * trans),
    top: st.mph * MPH_PX * (0.7 + 0.3 * engine) * (0.8 + 0.2 * trans),
    grip: st.grip * (tires <= 0 ? 0.3 : 0.55 + 0.45 * tires),
    flat: tires <= 0,
    offroad: st.offroad * (0.55 + 0.45 * susp),
    heat: rad <= 0 ? 1 : clamp(1 - rad * 1.4, 0, 1),
    leak: parts.fueltank ? Math.max(0, 0.3 - tank) * 0.05 : 0.08,
    start: batt <= 0 ? 0 : 0.2 + 0.8 * batt,
    armor: cond01(parts, 'armor'),
    turn: 2.6 * (0.8 + 0.2 * susp),
  };
}

const HIT_WEIGHTS = [
  ['tires', 0.22], ['engine', 0.18], ['radiator', 0.16], ['fueltank', 0.14],
  ['suspension', 0.12], ['battery', 0.1], ['transmission', 0.08],
];

function weightedSlot(parts, r) {
  const live = HIT_WEIGHTS.filter(([s]) => parts[s] && parts[s].cond > 0);
  if (!live.length) return null;
  const total = live.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [s, w] of live) {
    x -= w;
    if (x <= 0) return s;
  }
  return live[live.length - 1][0];
}

// Note: bullets hit armor first, then parts, then the driver; returns what was hurt.
export function hitCar(parts, dmg, rand) {
  const out = { slot: null, wound: false, armor: false };
  const armor = parts.armor;
  if (armor && armor.cond > 0) {
    armor.cond = Math.max(0, armor.cond - dmg * 0.5);
    out.armor = true;
    const frac = armor.cond / 100;
    const through = 0.06 + 0.5 * (1 - frac) * (1 - frac);
    if (rand() > through) return out;
    dmg *= 0.6;
  }
  const slot = weightedSlot(parts, rand());
  if (slot) {
    parts[slot].cond = Math.max(0, parts[slot].cond - dmg);
    out.slot = slot;
  }
  out.wound = rand() < (out.armor ? 0.22 : 0.16);
  return out;
}

// Note: hard impacts crumple armor first, then the front end.
export function crashCar(parts, impact, rand) {
  if (impact < 70) return null;
  let dmg = (impact - 70) * 0.09;
  const armor = parts.armor;
  if (armor && armor.cond > 0) {
    const take = Math.min(armor.cond, dmg * 0.6);
    armor.cond -= take;
    dmg -= take;
  }
  const slot = rand() < 0.5 ? 'suspension' : rand() < 0.5 ? 'radiator' : 'tires';
  if (parts[slot]) parts[slot].cond = Math.max(0, parts[slot].cond - dmg);
  return { slot, wound: impact > 210 && rand() < 0.35 };
}

export function wearLabel(part) {
  if (!part) return 'missing';
  return `${tierOf(part.cond)} ${Math.round(part.cond)}%`;
}
