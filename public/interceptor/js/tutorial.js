// Note: the tutorial yard: one short road north with a cue for every system; nothing here is saved.

import { TILE, FINE, CELL } from './config.js';
import { T } from './tiles.js';
import { LEGEND } from './sites.js';
import { makeLevel } from './worldgen.js';
import { hash3, u01 } from './rand.js';

const W = 46;
const H = 184;
const BASE = 23;
const BEND = [100, 136];
const UP = -Math.PI / 2;

// Note: tile rows of each cue, top to bottom; the player drives up.
export const TUT_Y = { exit: 5, toll: 22, targets: 50, yard: 62, wreck: 92, cue2: 98, cue1: 142, car: 166, start: 172 };

// Note: road center in tiles for a tile row; one S-bend in the middle.
export function tutorialRoad(y) {
  if (y < BEND[0] || y > BEND[1]) return BASE;
  const t = (BEND[1] - y) / (BEND[1] - BEND[0]);
  return BASE + 6 * Math.sin(t * Math.PI * 2);
}

const px = (t) => (t + 0.5) * TILE;

function rows() {
  const out = [];
  const Y = TUT_Y;
  for (let y = 0; y < H; y++) {
    let row = '';
    const cx = tutorialRoad(y + 0.5);
    for (let x = 0; x < W; x++) {
      const d = x + 0.5 - cx;
      const ad = Math.abs(d);
      let ch = u01(hash3(41, x, y)) < 0.3 ? ';' : ',';
      const yard = x >= 4 && x <= 19 && y >= Y.yard && y <= Y.yard + 18;
      const pullout = x >= 27 && x <= 34 && y >= Y.wreck - 5 && y <= Y.wreck + 5;
      const clear = yard || pullout || (y >= Y.targets - 6 && y <= Y.targets + 8 && x > cx) || y > Y.car - 4;
      if (x < 3 || x >= W - 3 || (!clear && ad > 7 && u01(hash3(42, x, y)) < 0.16)) ch = 'T';
      if (yard) ch = '=';
      if (pullout) ch = '.';
      if (ad < 4.6) ch = '.';
      if (ad < 3.6) ch = 'A';
      row += ch;
    }
    out.push(row.split(''));
  }
  for (let x = 6; x <= 18; x++) out[Y.yard + 18][x] = 'F';
  return out.map((r) => r.join(''));
}

// Note: a 7 by 6 m shed in the yard, in cells, with its door facing the road.
const SHED = { x: 5 * FINE, y: (TUT_Y.yard + 1) * FINE };
const SHED_ROWS = [
  '##########',
  '#________#',
  '#________#',
  '#________#',
  '#________+',
  '#________+',
  '#________#',
  '#________#',
  '##########',
];

export function makeTutorial() {
  const legend = { ...LEGEND, T: T.TREE, ';': T.DRYGRASS };
  const world = makeLevel('TUTORIAL', rows(), legend, {}, T.GRASS, [{ at: [SHED.x, SHED.y], rows: SHED_ROWS }]);
  const Y = TUT_Y;
  const road = (y) => tutorialRoad(y + 0.5) * TILE;
  world.roadCx = tutorialRoad;
  world.start = { x: road(Y.start) - 6 * TILE, y: px(Y.start) };
  world.carStart = { x: road(Y.car), y: px(Y.car) };
  world.wrecks.push({
    id: 'tut:wreck', kind: 'wreck', model: 'grandmarquis03', x: px(30.5), y: px(Y.wreck), a: UP + 0.35, tutorial: true,
    fuel: 4, water: 3, ammo: 10, cans: 0,
    parts: { engine: null, transmission: 28, tires: 92, suspension: null, radiator: null, fueltank: null, battery: 55, armor: null },
  });
  world.loot.push({
    id: 'tut:crate', kind: 'crate', site: 'yard', x: (SHED.x + 2.5) * CELL, y: (SHED.y + 2.5) * CELL, water: 1, ammo: 6, fuel: 0, cans: 1, canFuel: 2, parts: {}, partFrom: 'cvpi03',
  });
  const mech = { id: 'tut:mech', kind: 'mechanic', role: 'mechanic', faction: 'none', site: 'yard', x: px(15), y: px(Y.yard + 6), a: 0 };
  world.npcs.push(mech);
  world.sites.push({
    id: 'yard', type: 'garage', name: 'Yard', faction: 'none', x: 4, y: Y.yard, w: 16, h: 19, grid: new Uint8Array(0),
    park: { x: px(13), y: px(Y.yard + 12) }, garage: { mechanic: mech.id, x: mech.x, y: mech.y },
  });
  world.targets = [
    { id: 'tut:t0', x: road(Y.targets) + 7 * TILE, y: px(Y.targets), a: UP },
    { id: 'tut:t1', x: road(Y.targets) + 9 * TILE, y: px(Y.targets + 5), a: UP + 0.5 },
  ];
  world.encounters = [{ id: 'tutToll', type: 'toll', x: road(Y.toll), y: px(Y.toll) }];
  return world;
}

const passed = (G, row) => G.playerBody().y < row * TILE;

// Note: each step shows an objective and finishes on a check against the live scene.
export const TUTORIAL_STEPS = [
  {
    text: ['Walk.', 'WASD · mouse looks.'],
    done: (G) => Math.hypot(G.foot.x - G.world.start.x, G.foot.y - G.world.start.y) > 40 || G.S.mode === 'car',
  },
  {
    text: ['Drink.', 'Z, next to the car.'],
    done: (G) => G.S.wounds === 0,
  },
  {
    text: ['Get in.', 'E.'],
    done: (G) => G.S.mode === 'car',
  },
  {
    text: ['North.', 'W gas · S brake, reverse · A D steer.'],
    done: (G) => passed(G, TUT_Y.cue1),
  },
  {
    text: ['S-bend.', 'Space: handbrake.'],
    done: (G) => passed(G, TUT_Y.cue2),
  },
  {
    text: ['Wreck on the right.', 'E out, E search · a number takes one · Space all · E closes.'],
    done: (G) => !!G.S.flags.tutLoot,
  },
  {
    text: ['Storage.', 'Tab.'],
    done: (G) => !!G.S.flags.tutTab,
  },
  {
    text: ['Fit the tires.', 'Lot on the left · E at the mechanic.'],
    done: (G) => !!G.S.flags.tutGarage,
  },
  {
    text: ['Two bikes on the right.', 'Mouse aims · LMB fires, side windows only · R reloads.'],
    done: (G) => G.world.targets.every((t) => G.S.gone[t.id]),
  },
  {
    text: ['Toll.', '1 to 3 answers. Or floor it.'],
    done: (G) => !!G.S.flags.tutTalked || passed(G, TUT_Y.toll - 10),
  },
  {
    text: ['Keep north.'],
    done: (G) => passed(G, TUT_Y.exit),
  },
];
