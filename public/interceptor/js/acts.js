// Note: the five act bands east to west: biome, real rivers, site plans, old roads, wreck mix and exits.

import { ACT1_PLAN, ACT1_RIVERS, BAND_EXIT_X } from './sites.js';
import { WRECK_WEIGHTS } from './vehicles.js';

export const LAST_ACT = 5;

const TRUCKS = {
  cvpi03: 0.8, grandmarquis03: 1, towncar03: 0.6, 'f150-01': 5, mustanggt02: 0.6, expedition00: 2.5, 'e150-02': 1.5,
  explorer03: 2, silverado02: 5, tahoe03: 3.5, ram04: 4.5, camry04: 1, accord05: 0.8, civic03: 0.6, corolla05: 0.8, altima04: 0.8,
};

// Note: x is a band tile column (east is high), side is relative to the highway; ids get an act prefix after Act 1.
export const ACTS = {
  1: {
    n: 1, name: 'The Gulf', road: '90', biome: 'bayou', goal: 'the Sabine',
    rivers: ACT1_RIVERS,
    plan: ACT1_PLAN,
    oldRoads: [[2900, 2330], [1950, 1420], [1180, 700]],
    exitX: BAND_EXIT_X,
    wrecks: WRECK_WEIGHTS,
  },
  2: {
    n: 2, name: 'The Piney Woods', road: '190', biome: 'pines', goal: 'the Brazos',
    rivers: [
      { name: 'Neches', x: 2880, w: 14 },
      { name: 'Trinity', x: 1640, w: 20 },
      { name: 'Brazos', x: 90, w: 22, exit: true },
    ],
    plan: [
      { id: 'gas-a', type: 'gas', x: 3040, side: 'n' },
      { id: 'jasper', type: 'garage', x: 2700, side: 's', name: 'Jasper', faction: 'coop' },
      { id: 'deercamp', type: 'deercamp', x: 2450, side: 'n', off: true, faction: 'drifters', weapon: 'rifle' },
      { id: 'woodville', type: 'watertown', x: 2180, side: 's', name: 'Woodville', faction: 'coop', story: 'woodville' },
      { id: 'church', type: 'church', x: 1920, side: 'n', off: true, faction: 'coop' },
      { id: 'camp', type: 'camp', x: 1400, side: 's', off: true, faction: 'drifters' },
      { id: 'livingston', type: 'garage', x: 1220, side: 'n', name: 'Livingston', faction: 'brigade' },
      { id: 'farm-a', type: 'farm', x: 1000, side: 's', off: true },
      { id: 'gas-b', type: 'gas', x: 800, side: 'n' },
      { id: 'huntsville', type: 'garage', x: 560, side: 's', name: 'Huntsville', faction: 'company' },
      { id: 'farm-b', type: 'farm', x: 400, side: 'n', off: true },
    ],
    oldRoads: [[2950, 2420], [1850, 1300], [1120, 620]],
    exitX: BAND_EXIT_X,
    wrecks: {
      cvpi03: 2, grandmarquis03: 2.5, towncar03: 1.5, 'f150-01': 4, mustanggt02: 1, expedition00: 2, 'e150-02': 1.5,
      explorer03: 2, silverado02: 3.5, tahoe03: 2, ram04: 3, camry04: 2.5, accord05: 2.5, civic03: 2, corolla05: 2, altima04: 2,
    },
  },
  3: {
    n: 3, name: 'The Hill Country', road: '290', biome: 'hills', goal: 'the Pecos',
    rivers: [
      { name: 'Colorado', x: 2900, w: 18 },
      { name: 'Pedernales', x: 1960, w: 12 },
      { name: 'Llano', x: 880, w: 14 },
      { name: 'Pecos', x: 90, w: 20, exit: true },
    ],
    plan: [
      { id: 'gas-a', type: 'gas', x: 3040, side: 's' },
      { id: 'bastrop', type: 'garage', x: 2720, side: 'n', name: 'Bastrop', faction: 'coop' },
      { id: 'diner', type: 'diner', x: 2420, side: 's' },
      { id: 'ranch', type: 'ranch', x: 2200, side: 's', off: true, name: 'Jacob\'s Well', faction: 'residents', story: 'residents', calm: true },
      { id: 'farm-a', type: 'farm', x: 1700, side: 'n', off: true },
      { id: 'fredericksburg', type: 'garage', x: 1480, side: 'n', name: 'Fredericksburg', faction: 'company' },
      { id: 'camp', type: 'camp', x: 1250, side: 's', off: true, faction: 'drifters' },
      { id: 'church', type: 'church', x: 1080, side: 'n', off: true, faction: 'coop' },
      { id: 'gas-b', type: 'gas', x: 700, side: 's' },
      { id: 'junction', type: 'garage', x: 480, side: 'n', name: 'Junction', faction: 'brigade' },
      { id: 'farm-b', type: 'farm', x: 320, side: 's', off: true },
    ],
    oldRoads: [[3000, 2450], [1880, 1300], [820, 380]],
    exitX: BAND_EXIT_X,
    wrecks: {
      cvpi03: 1.5, grandmarquis03: 2, towncar03: 1.5, 'f150-01': 4, mustanggt02: 1.5, expedition00: 2, 'e150-02': 1,
      explorer03: 2, silverado02: 4, tahoe03: 2.5, ram04: 3.5, camry04: 2, accord05: 2, civic03: 1.5, corolla05: 1.5, altima04: 1.5,
    },
  },
  4: {
    n: 4, name: 'The Permian', road: '385', biome: 'permian', goal: 'the state line',
    rivers: [],
    plan: [
      { id: 'gas-a', type: 'gas', x: 3040, side: 'n' },
      { id: 'iraan', type: 'garage', x: 2780, side: 's', name: 'Iraan', faction: 'coop' },
      { id: 'oil-a', type: 'oilfield', x: 2560, side: 'n', off: true, faction: 'company' },
      { id: 'mancamp', type: 'camp', x: 2300, side: 's', off: true, faction: 'drifters', name: 'man camp' },
      { id: 'gas-b', type: 'gas', x: 2080, side: 'n' },
      { id: 'odessa', type: 'garage', x: 1820, side: 's', name: 'Odessa', faction: 'company' },
      { id: 'yard', type: 'refinery', x: 1600, side: 'n', off: true, faction: 'company' },
      { id: 'compound', type: 'compound', x: 1300, side: 's', off: true, name: 'St. Jude of Andrews', faction: 'brigade' },
      { id: 'andrews', type: 'garage', x: 1080, side: 'n', name: 'Andrews', faction: 'brigade' },
      { id: 'seminole', type: 'watertown', x: 760, side: 's', name: 'Seminole', faction: 'coop', story: 'seminole' },
      { id: 'oil-b', type: 'oilfield', x: 500, side: 'n', off: true, faction: 'company' },
      { id: 'gas-c', type: 'gas', x: 300, side: 's' },
    ],
    oldRoads: [[2950, 2350], [1750, 1150], [700, 250]],
    exitX: BAND_EXIT_X,
    wrecks: TRUCKS,
  },
  5: {
    n: 5, name: 'The Mesas', road: '62', biome: 'mesa', goal: 'the Exchange',
    rivers: [],
    plan: [
      { id: 'gas-a', type: 'gas', x: 3040, side: 's' },
      { id: 'hobbs', type: 'garage', x: 2760, side: 'n', name: 'Hobbs', faction: 'company' },
      { id: 'mall', type: 'mall', x: 2440, side: 's', name: 'Eunice mall', story: 'doc' },
      { id: 'farm-a', type: 'farm', x: 2150, side: 'n', off: true },
      { id: 'camp', type: 'camp', x: 1900, side: 's', off: true, faction: 'drifters' },
      { id: 'lovington', type: 'garage', x: 1620, side: 's', name: 'Lovington', faction: 'coop' },
      { id: 'tower', type: 'tower', x: 1250, side: 'n', off: true, name: 'KBON tower', story: 'tower' },
      { id: 'gas-b', type: 'gas', x: 900, side: 's' },
      { id: 'exchange', type: 'exchange', x: 420, side: 'n', name: 'the Exchange', story: 'exchange', calm: true },
    ],
    oldRoads: [[2950, 2300], [1800, 1000]],
    // Note: the last band has no exit; the road ends in rock west of the Exchange.
    exitX: null, deadEnd: 40,
    wrecks: TRUCKS,
  },
};

export const actOf = (n) => ACTS[n] || ACTS[1];
