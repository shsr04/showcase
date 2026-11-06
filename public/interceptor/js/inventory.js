// Note: storage slots by vehicle, hands on foot, water jugs and fuel cans.

import { VEHICLE, storageOf } from './vehicles.js';
import { JUG_UNITS, CAN_GALLONS, HANDS } from './config.js';
import { BIG, partLabel, tierOf } from './parts.js';

export const capacityOf = (car) => storageOf(VEHICLE[car.model]);
export const handsCap = () => HANDS;

export function itemLabel(it) {
  if (it.kind === 'part') return `${partLabel(it)} (${tierOf(it.cond)})`;
  if (it.kind === 'jug') return `Water jug ${it.units}/${JUG_UNITS}`;
  if (it.kind === 'can') return `Fuel can ${it.gal.toFixed(1)} gal`;
  return it.name || it.kind;
}

export function carryable(it) {
  return !(it.kind === 'part' && BIG.has(it.slot));
}

export function addItem(list, cap, item) {
  if (list.length >= cap) return false;
  list.push(item);
  return true;
}

export function removeItem(list, id) {
  const i = list.findIndex((it) => it.id === id);
  if (i < 0) return null;
  return list.splice(i, 1)[0];
}

export function waterUnits(...lists) {
  let n = 0;
  for (const list of lists) for (const it of list) if (it.kind === 'jug') n += it.units;
  return n;
}

// Note: draws from the emptiest jugs first and drops empties so slots free up.
export function takeWater(units, ...lists) {
  if (waterUnits(...lists) < units) return false;
  let need = units;
  for (const list of lists) {
    const jugs = list.filter((it) => it.kind === 'jug').sort((a, b) => a.units - b.units);
    for (const jug of jugs) {
      const take = Math.min(need, jug.units);
      jug.units -= take;
      need -= take;
      if (jug.units <= 0) removeItem(list, jug.id);
      if (need <= 0) return true;
    }
  }
  return need <= 0;
}

// Note: tops up partial jugs before a new jug is started.
export function addWater(units, list, cap, newId) {
  let left = units;
  for (const it of list) {
    if (it.kind !== 'jug' || left <= 0) continue;
    const room = JUG_UNITS - it.units;
    const put = Math.min(room, left);
    it.units += put;
    left -= put;
  }
  while (left > 0 && list.length < cap) {
    const put = Math.min(JUG_UNITS, left);
    list.push({ id: newId(), kind: 'jug', units: put });
    left -= put;
  }
  return units - left;
}

export function makeJug(id, units) {
  return { id, kind: 'jug', units: Math.max(1, Math.min(JUG_UNITS, units)) };
}

export function makeCan(id, gal) {
  return { id, kind: 'can', gal: Math.max(0, Math.min(CAN_GALLONS, gal)) };
}

// Note: pours cans into the tank until it is full; empty cans stay as items.
export function pourCans(list, tankRoom) {
  let poured = 0;
  for (const it of list) {
    if (it.kind !== 'can' || tankRoom - poured <= 0) continue;
    const put = Math.min(it.gal, tankRoom - poured);
    it.gal -= put;
    poured += put;
  }
  return poured;
}
