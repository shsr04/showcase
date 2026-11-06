// Note: loot, payment, garage work and tows as pure rules over plain state, so they run under node:test.

import { VEHICLE, partName } from './vehicles.js';
import { BIG, makePart, tierOf, fits } from './parts.js';
import { addItem, addWater, makeCan, takeWater, waterUnits } from './inventory.js';
import { tankRoom } from './car.js';
import { CAN_GALLONS } from './config.js';

// Note: what a wreck or crate still holds, as pickable rows.
export function lootList(e) {
  const out = [];
  if (e.water > 0) out.push({ k: 'water', label: `${e.water} water` });
  if (e.ammo > 0) out.push({ k: 'ammo', label: `${e.ammo} rounds` });
  if (e.fuel > 0.05) out.push({ k: 'fuel', label: `Siphon ${e.fuel.toFixed(1)} gal` });
  if (e.cans > 0) out.push({ k: 'can', label: `Fuel can, ${(e.canFuel || 0).toFixed(1)} gal` });
  if (e.weapon) out.push({ k: 'weapon', label: e.weaponName || e.weapon });
  const model = e.kind === 'crate' ? e.partFrom : e.model;
  const v = VEHICLE[model];
  for (const [slot, cond] of Object.entries(e.parts || {})) {
    if (!cond || cond <= 0 || !v || !v.slots[slot]) continue;
    out.push({ k: 'part', slot, cond, model, big: BIG.has(slot), label: `${partName(v.slots[slot], v)} (${tierOf(cond)})` });
  }
  return out;
}

// Note: dest = {list, cap, car (tank in reach or null), newId}; mutates e and returns a line for the toast.
export function takeLoot(S, e, item, dest) {
  switch (item.k) {
    case 'water': {
      const put = addWater(e.water, dest.list, dest.cap, dest.newId);
      e.water -= put;
      return put ? `+${put} water` : 'No room.';
    }
    case 'ammo': {
      const n = e.ammo;
      S.ammo += n;
      e.ammo = 0;
      return `+${n} rounds`;
    }
    case 'fuel': {
      let put = 0;
      if (dest.car) {
        put = Math.min(tankRoom(dest.car), e.fuel);
        dest.car.fuel += put;
      } else {
        for (const it of dest.list) {
          if (it.kind !== 'can') continue;
          const r = Math.min(CAN_GALLONS - it.gal, e.fuel - put);
          it.gal += r;
          put += r;
        }
      }
      e.fuel = Math.round((e.fuel - put) * 10) / 10;
      if (put > 0) return `+${put.toFixed(1)} gal`;
      return dest.car ? 'Tank full.' : 'No can.';
    }
    case 'can': {
      if (!addItem(dest.list, dest.cap, makeCan(dest.newId(), e.canFuel || 0))) return 'No room.';
      e.cans -= 1;
      e.canFuel = 0;
      return 'Fuel can.';
    }
    case 'weapon': {
      if (!S.weapons.includes(e.weapon)) S.weapons.push(e.weapon);
      const name = e.weaponName || e.weapon;
      e.weapon = null;
      return `${name}.`;
    }
    case 'part': {
      if (item.big) return 'Tow only.';
      if (!addItem(dest.list, dest.cap, makePart(dest.newId(), item.model, item.slot, item.cond))) return 'No room.';
      e.parts[item.slot] = null;
      return `${item.label}.`;
    }
    default:
      return '';
  }
}

export const ammoTotal = (S) => S.ammo + S.mag;

export function spendAmmo(S, n) {
  if (ammoTotal(S) < n) return false;
  const fromReserve = Math.min(S.ammo, n);
  S.ammo -= fromReserve;
  S.mag -= n - fromReserve;
  return true;
}

// Note: cost = {water, ammo}; method picks one of them; lists are where water may be drawn from.
export function canPay(S, cost, lists) {
  return { water: waterUnits(...lists) >= cost.water, ammo: ammoTotal(S) >= cost.ammo };
}

export function pay(S, cost, method, lists) {
  if (method === 'water') return takeWater(cost.water, ...lists);
  return spendAmmo(S, cost.ammo);
}

export const COSTS = {
  install: { water: 1, ammo: 5, hours: 1 },
  swap: { water: 2, ammo: 10, hours: 2 },
  tow: { water: 2, ammo: 10, hours: 2 },
};

// Note: puts a stored part into the car; the old one goes back into storage when it is still worth anything.
export function installPart(car, list, part) {
  const v = VEHICLE[car.model];
  if (!fits(part, v)) return { ok: false, why: 'Doesn\'t fit.' };
  const i = list.indexOf(part);
  if (i < 0) return { ok: false, why: 'Gone.' };
  list.splice(i, 1);
  const old = car.parts[part.slot];
  car.parts[part.slot] = part;
  if (old && old.cond > 0) list.push(old);
  return { ok: true, old };
}

// Note: engine or transmission from a donor wreck; the wreck keeps the old one.
export function swapBig(car, wreck, slot, newId) {
  const v = VEHICLE[car.model];
  const donor = VEHICLE[wreck.model];
  const cond = wreck.parts[slot];
  if (!cond || cond <= 0) return { ok: false, why: 'Nothing left to pull.' };
  if (donor.slots[slot] !== v.slots[slot]) return { ok: false, why: 'Doesn\'t fit.' };
  const old = car.parts[slot];
  car.parts[slot] = makePart(newId(), wreck.model, slot, cond);
  wreck.parts[slot] = old ? old.cond : null;
  return { ok: true };
}

// Note: donor wrecks parked at a garage that carry an engine or transmission for this car.
export function donorOffers(car, wrecks) {
  const v = VEHICLE[car.model];
  const out = [];
  for (const w of wrecks) {
    const donor = VEHICLE[w.model];
    for (const slot of BIG) {
      const cond = w.parts?.[slot];
      if (cond > 0 && donor.slots[slot] === v.slots[slot]) out.push({ wreck: w, slot, cond, label: `${partName(donor.slots[slot], donor)} from the ${donor.short}` });
    }
  }
  return out;
}

export function towHours(dist) {
  return COSTS.tow.hours + Math.min(4, dist / 16000);
}
