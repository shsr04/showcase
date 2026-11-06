// Note: a fresh run: the courier, the P71, the starting kit and empty world memory.

import { COURIER_CAR } from './vehicles.js';
import { installedParts } from './parts.js';
import { makeCar } from './car.js';
import { makeJug, makeCan } from './inventory.js';

export const START_PARTS = { engine: 72, transmission: 66, tires: 58, suspension: 61, radiator: 70, fueltank: 80, battery: 64, armor: 45 };

export function newState(seed, name, kind = 'band') {
  return {
    v: 1, seed, name, kind, act: 1,
    time: 0, day: 1,
    mode: 'foot',
    p: { x: 0, y: 0, a: -Math.PI / 2 },
    carId: 'courier',
    cars: {},
    hands: [],
    weapon: 'glock', weapons: ['glock'], mag: 15, ammo: 12,
    wounds: 0, thirst: false, thirstClock: 0, lastWound: null,
    heat: 8,
    // Note: the hunter's fate: hunting, bought, misled or dead.
    hunter: 'hunting',
    standing: { company: 0, brigade: 0, coop: 0, residents: 0, drifters: 0 },
    flags: {}, beat: 'motel',
    // Note: world deltas: mut = changed fields of generated entities, gone = removed ones, dyn = new wrecks.
    mut: {}, gone: {}, dyn: [],
    towTag: null,
    seen: {},
    radio: { on: true, station: 0, heard: {} },
    enc: {},
    stats: { miles: 0, kills: 0, shots: 0 },
    nextId: 1,
    ended: false, dead: false,
  };
}

export function newId(S, prefix = 'i') {
  S.nextId += 1;
  return `${prefix}${S.nextId}`;
}

// Note: the courier's car with a jug, an empty can and a worn spare tire in the trunk.
export function courierCar(S, x, y, a) {
  const car = makeCar('courier', COURIER_CAR, x, y, a, installedParts(COURIER_CAR, START_PARTS, 'courier'), 8);
  car.storage.push(makeJug(newId(S), 4), makeCan(newId(S), 0));
  S.cars.courier = car;
  return car;
}
