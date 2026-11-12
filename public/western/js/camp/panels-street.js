// Note: the street and road panels (items 378, 382–386, 391): built as places in metres and filmed through a camera.

import { C } from '../palette.js';
import { step } from './pixel-art.js';
import { camera3, box, render, noise } from './pixel-3d.js';
import { PW, PH } from './pixel-kit.js';
import { rig, sunOf, sunLight, boards, dirt, terrain, slab, building, porch, hills, Film, SIGNS } from './pixel-town.js';
import { pixelLying, pixelKneeling, hatDown } from './pixel-body.js';
import { person, horse, draw, puffJob, billow, cactus, bush, pole, rail, railX, wagon } from './pixel-scenery.js';

// Note: the shop names for narrow fronts.
const SMALL = ['SMITH', 'FEED', 'BOOTS', 'TAILOR', 'MAIL', 'LAND', 'STORE', 'COFFINS'];
// Note: a lawman's look when the panel is not given one.
const LAWMAN = { skin: C.ADOBE, hair: C.WOOD_D, coat: C.IRON, vest: C.DARK, shirt: C.PLASTER, hat: C.WOOD_L, band: C.DARK, hatStyle: 'round', hairStyle: 'short', beard: 'none', moustache: 'thin', badge: true, bandana: null };
// Note: a traveller's look for the road.
const TRAVELLER = { skin: C.ADOBE_L, hair: C.PLANK, coat: C.WOOD, vest: C.GREEN_D, shirt: C.PLASTER, hat: C.PLANK, band: C.WOOD_D, hatStyle: 'wide', hairStyle: 'long', beard: 'full', moustache: 'walrus', badge: false, bandana: C.RED };
// Note: the direction toward a screen point, for placing the sun where the picture shows it.
const sunAt = (cam, x, y) => cam.ray(x, y);

// Note: the render of a scene into a film, with the sun as its light and any further lights.
function shoot(cam, rg, boxes, extra = []) {
  const lights = [sunLight(rg, boxes), ...extra];
  const { px, info } = render(cam, boxes, lights, { ambient: rg.ambient, sky: rg.sky, cool: rg.cool });
  return new Film(cam, info, px, rg, boxes, lights, rg.ambient);
}

// Note: the far side of a street seen from across it: dirt ground, six fronts of different height, top and trade with their porch, a barrel and a crate on the boardwalk, and the hills; the fronts face +z at z = fz.
function farStreet(rg, cam, fz, shift = 0) {
  const walk = 0.42;
  const ppm = Math.round(cam.scaleAt([0, 0, fz]));
  const specs = [
    { a: -27, b: -17, h: 7.6, wall: C.PLANK, kind: 'plank', top: 'step', sign: SIGNS[5], door: 0.7, storeys: 1 },
    { a: -17, b: -8.2, h: 8.0, wall: C.WOOD, kind: 'plank', top: 'step', sign: SIGNS[0], door: 0.62, swing: true, storeys: 1 },
    { a: -8.2, b: 0, h: 6.9, wall: C.WOOD_L, kind: 'clap', top: 'flat', sign: SIGNS[1], door: 0.3, storeys: 1 },
    { a: 0, b: 7.2, h: 7.7, wall: C.ADOBE, kind: 'brick', top: 'arch', sign: SIGNS[2], door: 0.5, storeys: 1 },
    { a: 7.2, b: 16.2, h: 7.8, wall: C.PLANK, kind: 'plank', top: 'step', sign: SIGNS[4], door: 0.28, storeys: 1 },
    { a: 16.2, b: 28, h: 6.8, wall: C.WOOD, kind: 'clap', top: 'flat', sign: SIGNS[7], door: 0.4, storeys: 1 },
  ];
  const boxes = [];
  boxes.push(box([-300, -1, -300], [300, 0, 300], (p) => dirt(p, [2.6, 3.9, -2.4], C.SAND, cam.pos)));
  for (const b of specs) boxes.push(...building({ ...b, a: b.a + shift, b: b.b + shift, lit: (cx) => rg.name !== 'day' && rg.name !== 'grey' && noise(cx, 3) > 0.4 }, { face: '+z', at: fz, ppm, y0: walk }));
  boxes.push(box(...slab('+z', fz, -30, 30, 0, 5.45, -0.8, -0.7), () => ({ c: C.SHADOW, ambient: 0.5 })));
  boxes.push(...porch('+z', fz, -30, 30, { roof: 2.85, walk, wide: 2.6 }));
  // Note: a barrel and a crate on the far boardwalk.
  boxes.push(box([-4.4 + shift, walk, fz + 0.9], [-3.8 + shift, walk + 0.95, fz + 1.5], (p) => (Math.abs(((p[1] - walk) % 0.4) - 0.2) < 0.03 ? { c: C.IRON } : boards(C.WOOD_D, p[0] + p[2], p[1], 0.14)), { cast: true }));
  boxes.push(box([5.6 + shift, walk, fz + 0.4], [6.5 + shift, walk + 0.8, fz + 1.2], (p) => boards(C.PLANK, p[0] + p[2], p[1], 0.3), { cast: true }));
  boxes.push(hills(rg, { z: -300, h: 44, seed: 2, far: 1 }));
  boxes.push(hills(rg, { z: -200, h: 30, seed: 5, plateau: 0.6 }));
  return boxes;
}

export const STREET = {
  // Note: item 384 panel 4, rebuilt as a place in metres: a wide shot from 1.4 m above a street that runs across the frame; the duelists eight metres apart in profile, the false fronts, the porch and the crowd fourteen metres behind them, the low sun raking from the left and throwing their shadows long to the right; a trough and a post stand close to the lens.
  faceoff(px, o, r) {
    const cam = camera3([0.3, 0.8, 6.6], Math.PI / 2, -0.03, 205, PW, PH);
    const mood = o.mood ?? 'day';
    const rg = rig(mood, cam, mood === 'day' ? { sun: [-0.86, 0.27, 0.42] } : {});
    const FZ = -11;
    const walk = 0.42;
    const boxes = farStreet(rg, cam, FZ, 2);
    // Note: the foreground: the corner of a water trough at the lower left and a hitching post with its rail at the lower right, both close to the lens and below the duelists' feet.
    boxes.push(box([-4.5, 0, 2.3], [-2.9, 0.62, 3.0], (p, n) => {
      if (n[1] > 0.5) return p[0] > -4.4 && p[0] < -3.0 && p[2] > 2.4 && p[2] < 2.9 ? { emit: rg.name === 'dusk' ? C.GOLD : C.GLASS_L } : { c: C.WOOD_L };
      return Math.abs((p[1] % 0.3) - 0.15) < 0.02 ? { c: C.IRON } : boards(C.WOOD_D, p[0] + p[2], p[1], 0.17);
    }, { cast: true }));
    boxes.push(box([3.4, 0, 2.0], [3.6, 1.5, 2.2], (p, n) => (p[1] > 1.4 ? { c: n[1] > 0.5 ? C.WOOD_L : C.WOOD_D } : p[1] > 1.15 && p[1] < 1.2 ? { c: C.SHADOW } : boards(C.WOOD, p[0] + p[2], p[1], 0.07)), { cast: true }));
    boxes.push(box([3.6, 1.05, 2.05], [7, 1.2, 2.15], () => ({ c: C.WOOD_D }), { cast: true }));
    boxes.push(railX(FZ + 2.4, -2.0, 2.2));
    const film = shoot(cam, rg, boxes);
    // Note: the crowd on the far boardwalk, in knots, some in profile turned to the street, the crew among them; two horses tied at the rail; the two duelists, side on, facing each other across 7.4 metres, tall in the frame.
    const zz = FZ + 1.3;
    const spots = [[-10.8, zz], [-9.6, zz + 0.4], [-5.1, zz], [-4.0, zz - 0.3], [-2.4, zz + 0.3], [5.6, zz], [8.2, zz + 0.2], [10.8, zz], [12.2, zz + 0.4], [-8.0, zz + 0.6]];
    const crowd = Math.min(o.crowd ?? 9, spots.length);
    const crew = o.crew || [];
    const jobs = [];
    for (let k = 0; k < crowd; k++) {
      const [x, z] = spots[k];
      jobs.push(person([x, walk, z], k, { look: crew[k] || null, dir: x < 0.3 ? 1 : -1, view: k % 3 !== 1 ? 'front' : 'side', fill: crew[k] ? 0.65 : 0 }));
    }
    jobs.push(horse([-1.0, walk, FZ + 2.25], { dir: 1, coat: 1, blanket: C.BLUE, drop: 0.4 }), horse([0.8, walk, FZ + 2.25], { dir: -1, coat: 3, blanket: C.RED, drop: 0.3 }));
    jobs.push(person([-3.5, 0, 0], 2, { look: o.a, dir: 1, pose: 'draw', fill: 0.65 }));
    jobs.push(person([3.9, 0, 0], 4, { look: o.b, dir: -1, pose: 'draw', fill: 0.65 }));
    for (let k = 0; k < 4; k++) jobs.push(puffJob([-2.5 + k * 2.6, 0.05, -0.3 - (k % 2) * 1.2], 1.0, C.PLASTER, 0.3, 0.12));
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 382 panel 2 and the outdoor challenge: the town's main street seen down its length from the saddle, a metre and a half over a man's head; false fronts on both sides, the crowd and the traffic growing with the size of the town (0 a hamlet with empty lots, 3 a city of two-storey fronts, wagons and riders); the sun comes in low from the right and the right side's long shadow lies across the street.
  street(px, o, r) {
    const size = Math.max(0, Math.min(3, Math.round(o.size ?? 1)));
    const mood = o.mood ?? 'day';
    const cam = camera3([-1.6, 2.0, 9], Math.PI / 2 - 0.1, 0.03, 190, PW, PH);
    const m0 = sunOf(mood);
    const rg = rig(mood, cam, { sun: [-m0[0], m0[1], 0.3] });
    const walk = 0.42;
    const boxes = [];
    boxes.push(box([-400, -1, -400], [400, 0, 400], (p) => dirt(p, [-1.9, 1.9], C.SAND, cam.pos, 0)));
    const KINDS = [['plank', [C.WOOD, C.WOOD_L, C.PLANK, C.WOOD_D]], ['clap', [C.PLASTER, C.WOOD_L, C.PLANK, C.SAND_L]], ['adobe', [C.ADOBE, C.ADOBE_L, C.SAND_L]], ['brick', [C.RED_D, C.ADOBE_D, C.ADOBE]]];
    const TOPS = ['flat', 'step', 'arch', 'gable', 'step'];
    let nSign = 0;
    // Note: a row of fronts down each side of the street, from the camera's end to the far end; the smaller the town, the more empty lots.
    for (const side of [-1, 1]) {
      const face = side < 0 ? '+x' : '-x';
      const at = side * 7;
      let z = 5;
      let n = 0;
      while (z > -78) {
        const [lotChance, lots] = [[0.85, [12, 18, 26]], [0.5, [6, 10, 16]], [0.28, [5, 9]], [0, [0]]][size];
        if (n > 0 && r.chance(lotChance)) z -= r.pick(lots);
        const w = r.pick(size === 0 ? [6, 7, 8] : [7, 8, 9, 10]);
        const [kind, walls] = r.pick(KINDS);
        const two = size === 3 || (size === 2 && r.chance(0.35));
        const mid = (z - w / 2);
        const depth = cam.project([at, 3, mid])[2];
        const ppm = Math.max(4, Math.min(13, Math.round((190 / Math.max(depth, 1)) * 0.9)));
        const big = r.chance(0.6) || n < 2;
        const sp = big ? SIGNS[nSign++ % SIGNS.length] : { big: r.pick(SMALL), small: 'GOODS', style: 'paint', col: C.PLASTER_L, sh: C.DARK, out: C.DARK };
        const b = { a: z - w, b: z, h: two ? r.pick([8.6, 9.2]) : r.pick([6.4, 6.9, 7.4]), wall: r.pick(walls), kind, top: r.pick(TOPS), sign: sp, door: r.pick([0.25, 0.5, 0.75]), storeys: two ? 2 : 1, swing: sp.big === 'SALOON', lit: (cx) => mood !== 'day' && noise(cx, n) > 0.4 };
        boxes.push(...building(b, { face, at, ppm, y0: walk }));
        boxes.push(box(...slab(face, at, b.a, b.b, 0, 5.45, -0.8, -0.7), () => ({ c: C.SHADOW, ambient: 0.5 })));
        if (size < 2) boxes.push(...porch(face, at, b.a, b.b, { roof: 3.0, walk, wide: 2.4 }));
        z -= w + (size === 3 ? 0 : r.pick([0, 0, 1.5, 3]));
        n++;
      }
      if (size >= 2) boxes.push(...porch(face, at, -90, 6, { roof: 3.0, walk, wide: 2.4 }));
    }
    // Note: the church at the end of the street, with its steeple, and the telegraph poles down the left edge.
    if (size >= 1) {
      const white = (p) => boards(C.PLASTER_L, p[0] + p[2], p[1], 0.35);
      boxes.push(box([-4.5, 0, -100], [4.5, 6.2, -88], white), box([-1.7, 0, -92], [1.7, 11, -88], white), box([-1.2, 11, -91.5], [1.2, 13.4, -88.5], white), box([-0.7, 13.4, -91], [0.7, 15.6, -89], white), box([-0.25, 15.6, -90.5], [0.25, 17.6, -89.5], white));
    }
    if (size >= 1) for (const zz of [-8, -34, -60]) boxes.push(...pole(-4.8, zz));
    // Note: a hitching rail on the left walk's edge, a wagon at the right kerb.
    boxes.push(rail(-4.5, -26, -4));
    if (size >= 2) boxes.push(...wagon(3.3, -17));
    boxes.push(hills(rg, { z: -300, h: 46, seed: 3, far: 1 }), hills(rg, { z: -230, h: 28, seed: 8, plateau: 0.6 }));
    const film = shoot(cam, rg, boxes);
    film.haze(rg.stops[0][1], 40, 110, 0.55);
    // Note: people on both boardwalks, some in profile looking across, some front on, some walking away; riders and a wagon team in the street.
    const jobs = [];
    const nPeople = [3, 8, 14, 22][size];
    for (let k = 0; k < nPeople; k++) {
      const side = k % 2 ? 1 : -1;
      const z = -3 - r.next() ** 1.4 * (16 + size * 14);
      const view = r.pick(['side', 'front', 'back', 'side']);
      jobs.push(person([side * (4.9 + r.next() * 1.4), walk, z], k, { dir: -side, view, pose: view === 'back' ? 'walk' : 'stand' }));
    }
    for (const [x, z] of [[-3.7, -9], [-3.9, -14], [-3.6, -21]].slice(0, size + 1)) jobs.push(horse([x, 0, z], { dir: -1, coat: Math.floor(r.next() * 6), blanket: r.pick([C.RED, C.BLUE, C.GOLD]), drop: 0.35 }));
    if (size >= 1) {
      jobs.push(horse([0.6, 0, -19], { pose: 'walk', dir: -1, coat: 2, rider: { coat: C.WOOD_D, hat: C.WOOD_L }, blanket: C.BLUE }));
      jobs.push(puffJob([1.6, 0.05, -19], 0.8, C.SAND_L, 0.3));
    }
    if (size >= 3) jobs.push(horse([-0.6, 0, -35], { pose: 'walk2', dir: 1, coat: 1, rider: { coat: C.RED_D, hat: C.DARK }, blanket: C.RED }));
    // Note: item 395: the two duelists face each other in the street at the place of the challenge.
    if (o.a && o.b) {
      jobs.push(person([-1.9, 0, 1], 40, { look: o.b, dir: 1, pose: 'stand', fill: 0.65 }));
      jobs.push(person([0.9, 0, 0.6], 41, { look: o.a, dir: -1, pose: 'stand', fill: 0.65 }));
    }
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 378 panel 2: the nemesis bursting out of the sheriff's office and away down the street at dusk; a low shot from the street, the office front with its door flung open and its lamp spilling gold, the horse at a gallop across the left of the frame so that his face, lit by the setting sun that rakes in from the left, reads in profile, with the road ahead of him empty and dust boiling up behind.
  glimpse(px, o, r) {
    const mood = o.mood ?? 'dusk';
    const cam = camera3([0.0, 0.8, 5.5], Math.PI / 2, -0.05, 235, PW, PH);
    const rg = rig(mood, cam);
    const FZ = -13;
    const walk = 0.42;
    const ppm = Math.round(cam.scaleAt([0, 0, FZ]));
    const boxes = [];
    boxes.push(box([-300, -1, -300], [300, 0, 300], (p) => dirt(p, [-1.2, 1.4, -6.5], C.SAND, cam.pos)));
    const specs = [
      { a: -32, b: -13, h: 7.2, wall: C.ADOBE, kind: 'adobe', top: 'arch', sign: SIGNS[5], door: 0.7, storeys: 1 },
      { a: -13, b: -0.6, h: 7.6, wall: C.WOOD_L, kind: 'clap', top: 'flat', sign: SIGNS[0], door: 0.4, swing: true, storeys: 1 },
      { a: -0.6, b: 9.6, h: 6.8, wall: C.WOOD, kind: 'plank', top: 'step', sign: SIGNS[6], door: 0.5, storeys: 1, lamp: true },
      { a: 9.6, b: 28, h: 7.0, wall: C.PLANK, kind: 'plank', top: 'step', sign: SIGNS[4], door: 0.7, storeys: 1 },
    ];
    for (const b of specs) boxes.push(...building({ ...b, lit: (cx) => noise(cx, 5) > 0.35 }, { face: '+z', at: FZ, ppm, y0: walk }));
    boxes.push(box(...slab('+z', FZ, -30, 30, 0, 5.45, -0.8, -0.7), () => ({ c: C.WOOD_D, ambient: 0.6 })));
    boxes.push(...porch('+z', FZ, -30, 30, { roof: 2.85, walk, wide: 2.6 }));
    // Note: the office door flung open on its hinge, edge on to the lens, and the rail the horse was tied to.
    boxes.push(box([3.85, walk, FZ + 0.05], [3.9, walk + 2.2, FZ + 1.15], (p) => boards(C.WOOD_D, p[2], p[1], 0.14), { cast: true }));
    boxes.push(rail(5.4, FZ + 1.8, FZ + 3.0));
    // Note: a hitching post and its rail close to the lens at the right, framing the street.
    boxes.push(box([2.1, 0, 4.4], [2.32, 1.55, 4.62], (p, n) => (p[1] > 1.45 ? { c: n[1] > 0.5 ? C.WOOD_L : C.WOOD_D } : boards(C.WOOD, p[0] + p[2], p[1], 0.07)), { cast: true }));
    boxes.push(box([2.32, 1.1, 4.45], [6.5, 1.25, 4.56], () => ({ c: C.WOOD_D }), { cast: true }));
    boxes.push(hills(rg, { z: -300, h: 44, seed: 4, far: 1 }));
    // Note: the lamp's light from the open door, a pool of gold on the boardwalk before it.
    const lamp = { pos: [4.4, 1.6, FZ + 1.4], power: 1.1, reach: 2.4, visible: (p) => p[2] > FZ };
    const film = shoot(cam, rg, boxes, [lamp]);
    film.haze(rg.stops[1][1], 28, 80, 0.4);
    const jobs = [];
    const horseAt = [0.2, 0, 0.4];
    // Note: the dust: a long boiling trail behind the galloping horse, toward the door, and a kick at its hooves.
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      jobs.push(billow([horseAt[0] + 1.6 + t * 7.5, 0.3 + t * 1.0, horseAt[2] - 0.5 - (k % 2) * 1.0], 0.5 + t * 1.5, { density: 0.62 - t * 0.2, body: k % 2 ? C.SAND_L : C.PLASTER, dark: C.SAND, lit: C.GOLD_L }));
    }
    jobs.push(horse(horseAt, { pose: 'gallop', dir: -1, coat: 0, blanket: C.RED, rider: { look: o.nemesis || null, lean: 0.4, head: 1.25, bright: true }, level: 1.1, rim: 1 }));
    for (let k = 0; k < 4; k++) jobs.push(billow([horseAt[0] + 1.2 + k * 0.7, 0.35, horseAt[2] + 0.9], 0.45 + k * 0.12, { density: 0.6 - k * 0.1, body: C.SAND_L, dark: C.SAND, lit: C.GOLD_L }));
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 382 panel 1: the party riding in, the town on the horizon; a low wide landscape from beside the trail: riders in a file crossing the middle distance at a walk, their dust and long shadows trailing, the trail bending away to a small town under the big sky (steeple, water tower, a few lit windows), a saguaro and sage close to the lens, poles marching to the town.
  approach(px, o, r) {
    const mood = o.mood ?? 'day';
    const party = (o.party && o.party.length ? o.party : [null]).slice(0, 4);
    const cam = camera3([0, 1.2, 0], Math.PI / 2 - 0.14, 0.012, 250, PW, PH);
    const rg = rig(mood, cam);
    const ROAD = [[-30, 6], [-4.5, -8], [16, -25], [34, -55], [42, -90], [44, -118]];
    const roadDist = (x, z) => {
      let best = 1e9;
      for (let i = 0; i < ROAD.length - 1; i++) {
        const [ax, az] = ROAD[i];
        const [bx, bz] = ROAD[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      return best;
    };
    const boxes = [];
    // Note: the ground: scrub desert, and the pale trail with its two ruts, hazing toward the horizon.
    boxes.push(box([-600, -1, -600], [600, 0, 600], (p) => {
      const d = roadDist(p[0], p[2]);
      const dist = Math.hypot(p[0], p[2]);
      let m;
      if (d < 1.9 + noise(Math.floor(p[0] * 3), Math.floor(p[2] * 3)) * 0.5) {
        m = dirt(p, [], C.PLASTER, cam.pos);
        if (Math.abs(d - 0.95) < 0.14 + dist * 0.002) m = { c: step(C.PLASTER, -3) };
        else if (d < 0.45 && noise(Math.floor(p[0] * 5), Math.floor(p[2] * 5)) > 0.8) m = { c: C.GREEN_D };
        if (dist > 70) m = { c: step(m.c, dist > 170 ? 2 : 1) };
      } else m = terrain(p, { eye: cam.pos, light: C.SAND, scrub: 0.16, haze: 70 });
      return m;
    }));
    // Note: the town: a cluster of fronts on the horizon placed along the view, with a steeple, a water tower and trees.
    const right = cam.right;
    const fwd = [cam.fwd[0], cam.fwd[2]];
    const fl = Math.hypot(...fwd);
    const at = (t, d) => [cam.pos[0] + (fwd[0] / fl) * d + right[0] * t, cam.pos[2] + (fwd[1] / fl) * d + right[2] * t];
    const wallCols = [C.WOOD, C.WOOD_L, C.ADOBE, C.PLANK, C.PLASTER, C.ADOBE_L];
    for (let i = 0; i < 13; i++) {
      const t = 30 + i * 3.1 + r.next() * 2;
      const [x, z] = at(t, 96 + r.next() * 14);
      const w = 5 + r.next() * 5;
      const h = 4.5 + r.next() * 3;
      const wall = r.pick(wallCols);
      boxes.push(box([x - w / 2, 0, z - 6], [x + w / 2, h, z], (p, n) => {
        if (n[1] > 0.5) return { c: C.WOOD_D };
        if (p[1] > 1.2 && p[1] < 2.3 && ((p[0] / 2.2) % 1 + 1) % 1 < 0.28) return mood === 'day' ? { c: C.SHADOW } : noise(Math.floor(p[0] / 2.2), i) > 0.5 ? { emit: C.GOLD } : { c: C.SHADOW };
        return { c: p[1] > h - 0.6 ? step(wall, -1) : wall };
      }, { noShadow: true }));
    }
    const [sx0, sz0] = at(50, 102);
    boxes.push(box([sx0 - 2, 0, sz0 - 4], [sx0 + 2, 9, sz0], () => ({ c: C.PLASTER_L }), { noShadow: true }), box([sx0 - 1.3, 9, sz0 - 3.4], [sx0 + 1.3, 13, sz0 - 0.6], () => ({ c: C.PLASTER }), { noShadow: true }), box([sx0 - 0.4, 13, sz0 - 2.4], [sx0 + 0.4, 17, sz0 - 1.6], () => ({ c: C.PLASTER_L }), { noShadow: true }));
    const [tx0, tz0] = at(33, 94);
    boxes.push(box([tx0 - 2, 9, tz0 - 2], [tx0 + 2, 12.5, tz0 + 2], () => ({ c: C.WOOD_D }), { noShadow: true }), box([tx0 - 2, 0, tz0 - 2], [tx0 + 2, 9, tz0 + 2], (p) => (Math.abs(((p[0] - tx0 + 2) % 3.4) - 0.2) < 0.4 || Math.abs(((p[2] - tz0 + 2) % 3.4) - 0.2) < 0.4 ? { c: C.WOOD_D } : null), { noShadow: true }));
    for (let i = 0; i < 6; i++) {
      const [x, z] = at(26 + i * 9, 90 + r.next() * 10);
      boxes.push(box([x - 2, 0, z - 2], [x + 2, 5 + r.next() * 2, z + 2], (p) => (noise(Math.floor(p[0] * 3), Math.floor(p[1] * 3)) > 0.3 ? { c: C.GREEN_D } : null), { noShadow: true }));
    }
    // Note: telegraph poles along the trail toward the town, and the near scenery at the lens.
    const ROADPOLES = [[13, -21], [27, -40], [37, -68], [43, -100]];
    for (const [x, z] of ROADPOLES) boxes.push(...pole(x, z + 3.4, 6.6));
    boxes.push(bush(8.5, -10.5, 0.8, 0.5), bush(-6.5, -13, 1.0, 0.6), bush(12.5, -8, 0.9, 0.5), bush(2, -5, 0.7, 0.4));
    boxes.push(hills(rg, { z: -320, h: 56, seed: 1, far: 1, plateau: 0.8 }), hills(rg, { z: -230, h: 34, seed: 6, plateau: 0.62 }));
    const film = shoot(cam, rg, boxes);
    film.haze(rg.stops[0][1], 60, 150, 0.5);
    // Note: the party in a file along the bend of the trail, walking: horse and rider each in a look, dust behind each hoof.
    const jobs = [];
    const [ax, az] = ROAD[1];
    const dx = ROAD[2][0] - ax;
    const dz = ROAD[2][1] - az;
    const dl = Math.hypot(dx, dz);
    party.forEach((look, i) => {
      const s = 2 + (party.length - 1 - i) * 3.6;
      const x = ax + (dx / dl) * s + (i % 2) * 0.3;
      const z = az + (dz / dl) * s + (i % 2) * 0.5;
      jobs.push(horse([x, 0, z], { pose: i % 2 ? 'walk2' : 'walk', dir: 1, coat: i + 1, blanket: [C.RED, C.BLUE, C.GOLD, C.GREEN][i % 4], rider: { look, lean: 0.03 }, bedroll: i === 0 ? C.PLASTER : null, level: 0.9 }));
      jobs.push(puffJob([x - 1.3, 0.1, z + 0.1], 0.7, C.SAND_L, 0.32, 0.5));
    });
    // Note: the townsfolk at the entrance of the town, more of them in a larger town (item 336).
    const townsfolk = 3 + Math.round((o.size ?? 0) * 3);
    for (let k = 0; k < townsfolk; k++) {
      const t = k / Math.max(1, townsfolk - 1);
      jobs.push(person([ROAD[3][0] - 4 + t * 10 + r.next() * 2, 0, ROAD[3][1] - 6 - r.next() * 14], k, { dir: k % 2 ? 1 : -1, view: k % 3 ? 'front' : 'side', h: 1.78 }));
    }
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 383 panel 1, the road: a traveller met on the trail, his packed horse behind him, talking to the sheriff, who stands close to the lens with his back to us; an over-the-shoulder shot at eye height, the low sun coming in from the right to light the traveller's face, the trail running away behind them to the hills.
  road(px, o, r) {
    const mood = o.mood ?? 'day';
    const cam = camera3([0.2, 1.5, 7.0], Math.PI / 2, 0.02, 215, PW, PH);
    const m0 = sunOf(mood);
    const rg = rig(mood, cam, mood === 'night' || mood === 'grey' ? {} : { sun: [Math.abs(m0[0]), Math.max(m0[1], 0.26), 0.3] });
    const boxes = [];
    boxes.push(box([-600, -1, -600], [600, 0, 600], (p) => {
      // Note: the trail's centre line drifts across the plain; inside its width the dirt is pale and rutted.
      const w = Math.abs(p[2] - (-1.5 + p[0] * 0.05));
      if (w < 2.6 + noise(Math.floor(p[0] * 2), Math.floor(p[2] * 2)) * 0.4) {
        const m = dirt(p, [-2.2, -0.9], C.PLASTER, cam.pos);
        return m;
      }
      return terrain(p, { eye: cam.pos, light: C.SAND, scrub: 0.14, haze: 60 });
    }));
    boxes.push(...cactus(7.2, -10, 3.2), ...cactus(-9, -15, 2.4), bush(-5.2, -7, 1.0, 0.6), bush(5.5, -6.5, 0.9, 0.5), bush(-3.2, -12, 1.1, 0.6), bush(9, -4, 1.0, 0.6));
    boxes.push(...pole(-4, -14, 6.4), ...pole(-6, -34, 6.4));
    boxes.push(hills(rg, { z: -310, h: 60, seed: 11, far: 1, plateau: 0.8 }), hills(rg, { z: -200, h: 36, seed: 7, plateau: 0.62 }));
    const film = shoot(cam, rg, boxes);
    film.haze(rg.stops[0][1], 45, 130, 0.5);
    const jobs = [];
    // Note: the traveller in profile facing the sheriff, hand out as he talks, his packed horse standing behind and a little to the left with head low; the sheriff close to the lens, his back to us, turned to the traveller.
    jobs.push(horse([-2.8, 0, -0.6], { dir: 1, coat: 1, blanket: C.BLUE, bedroll: C.PLASTER, drop: 0.45, level: 0.9 }));
    jobs.push(person([-0.2, 0, 0.8], 3, { look: TRAVELLER, dir: 1, pose: 'stand', level: 1.0 }));
    jobs.push(person([2.6, 0, 3.2], 0, { look: o.sheriff || LAWMAN, view: 'back', dir: -1, h: 1.8, level: 0.8, rim: 1 }));
    jobs.push(puffJob([-3.6, 0.1, -1.0], 0.6, C.SAND_L, 0.22, 0.4));
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 383 panel 1, the body: the dead associate lying in the dust and a lawman kneeling over him, searching his coat; a low shot at 75 cm from the front of the trail, the body and the kneeling man in the left of the frame, the lawman's horse standing off with its head low, a hat, a dropped revolver and spilled papers in the dirt, the sun low from the left.
  body(px, o, r) {
    const mood = o.mood ?? 'day';
    const cam = camera3([1.3, 0.75, 5.2], Math.PI / 2, 0.0, 225, PW, PH);
    const rg = rig(mood, cam);
    const boxes = [];
    boxes.push(box([-600, -1, -600], [600, 0, 600], (p) => {
      const sx = (p[0] + 0.6) / 0.55;
      const sz = (p[2] - 0.0) / 0.3;
      if (sx * sx + sz * sz < 1) return { c: noise(Math.floor(p[0] * 30), Math.floor(p[2] * 30)) > 0.7 ? C.DARK : C.RED_D };
      const w = Math.abs(p[2] + 6 - p[0] * 0.08);
      if (w < 2.4) return dirt(p, [-1.6], C.PLASTER, cam.pos);
      return terrain(p, { eye: cam.pos, light: C.SAND, scrub: 0.14, haze: 60 });
    }));
    boxes.push(...cactus(5.5, -9, 3.0), ...cactus(-6, -12, 2.3), bush(-3.6, -4.2, 0.9, 0.5), bush(3.4, -3.4, 0.8, 0.45), bush(-1, -7, 1.0, 0.6), bush(8, -6, 1.1, 0.6));
    // Note: a spilled saddlebag and a few papers on the ground by the body.
    boxes.push(box([0.8, 0, -0.5], [1.4, 0.22, 0.0], (p, n) => ({ c: n[1] > 0.5 ? C.WOOD : C.WOOD_D }), { cast: true }));
    for (let k = 0; k < 4; k++) boxes.push(box([-0.2 + k * 0.5, 0, 0.7 + (k % 2) * 0.5], [0.15 + k * 0.5, 0.01, 1.0 + (k % 2) * 0.5], () => ({ c: C.PLASTER_L }), { noShadow: true }));
    boxes.push(hills(rg, { z: -310, h: 60, seed: 12, far: 1, plateau: 0.8 }), hills(rg, { z: -200, h: 36, seed: 9, plateau: 0.62 }));
    const film = shoot(cam, rg, boxes);
    film.haze(rg.stops[0][1], 40, 120, 0.5);
    const jobs = [];
    // Note: the lawman's horse standing off to the right, head low, waiting; the lawman kneeling on the near side facing the body's head, one hand on the dead man's coat.
    jobs.push(horse([6.2, 0, -4.4], { dir: -1, coat: 3, blanket: C.GREEN, drop: 0.5, level: 0.9 }));
    jobs.push({
      foot: [-0.2, 0, 0],
      opts: { half: [0.95, 0.2], len: 0.32, level: 0.95 },
      make: (x, y, S) => pixelLying(PW, PH, x, y - 0.17 * S, 1.8 * S, o.associate || null, { head: -1, face: 'up', lx: rg.lx, ly: rg.ly, cool: rg.cool, coat: C.WOOD_D }),
    });
    jobs.push({
      foot: [-1.5, 0, 0.1],
      go: (f) => { const [hx, hy] = f.cam.project([-1.5, 0, 0.1]); hatDown(f.px, hx, hy, f.cam.scaleAt([-1.5, 0, 0.1]), o.associate?.hat ?? C.DARK, { lx: rg.lx, ly: rg.ly }); },
    });
    jobs.push({
      foot: [0.95, 0, 0.9],
      opts: { half: [0.4, 0.25], len: 1.1, level: 0.9 },
      make: (x, y, S) => pixelKneeling(PW, PH, x, y, 1.6 * S, LAWMAN, { dir: -1, lx: rg.lx, ly: rg.ly, cool: rg.cool, hand: [1.1, 0.28] }),
    });
    jobs.push({
      foot: [0.6, 0, 0.1],
      go: (f) => { const [gx, gy] = f.cam.project([0.55, 0.03, 0.15]); const s = f.cam.scaleAt([0.55, 0, 0.15]); f.px.rect(gx, gy - s * 0.04, s * 0.2, Math.max(1, s * 0.04), C.IRON); f.px.rect(gx + s * 0.16, gy - s * 0.04, Math.max(1, s * 0.05), Math.max(1, s * 0.08), C.WOOD_D); },
    });
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 386 panel 1, the smoke: the fallen lying in the dust of the street, and the victor still standing at the right with his revolver, a low shot from 90 cm; gunsmoke drifts from the muzzle across the ground in banks, lit by the low sun, the fronts of the street hazed behind it.
  smoke(px, o, r) {
    const mood = o.mood ?? 'day';
    const cam = camera3([0.3, 0.8, 5.0], Math.PI / 2, 0.0, 215, PW, PH);
    const rg = rig(mood, cam);
    const FZ = -14;
    const boxes = farStreet(rg, cam, FZ);
    const fallen = (o.fallen && o.fallen.length ? o.fallen : [null]).slice(0, 2);
    // Note: the victor stands on the side he held in the face-off, the fallen lie on the other.
    const sd = o.side === 'left' ? -1 : 1;
    const spots = [[-1.5 * sd, -sd], [0.9 * sd, sd]];
    // Note: a pool of blood under the first fallen man's chest when the panel says so.
    if (o.blood) {
      const ground = boxes[0];
      const base = ground.mat;
      ground.mat = (p, n) => {
        const dx = (p[0] - (spots[0][0] + 0.2 * sd)) / 0.7;
        const dz = (p[2] - 0.15) / 0.32;
        if (dx * dx + dz * dz < 1) return { c: noise(Math.floor(p[0] * 26), Math.floor(p[2] * 26)) > 0.75 ? C.DARK : C.RED_D };
        return base(p, n);
      };
    }
    const film = shoot(cam, rg, boxes);
    film.haze(rg.stops[0][1], 14, 50, 0.22);
    const jobs = [];
    fallen.forEach((look, i) => {
      const [x, head] = spots[i];
      jobs.push({
        foot: [x, 0, 0.4 - i * 0.6],
        opts: { half: [0.95, 0.2], len: 0.34, level: 0.95 },
        make: (sx, sy, S) => pixelLying(PW, PH, sx, sy - 0.17 * S, 1.8 * S, look, { head, face: i ? 'down' : 'up', lx: rg.lx, ly: rg.ly, cool: rg.cool, coat: [C.WOOD_D, C.RED_D][i], pose: 'stand' }),
      });
    });
    const vx = (fallen.length > 1 ? 3.2 : 2.6) * sd;
    if (o.standing !== null) jobs.push(person([vx, 0, 0.0], 5, { look: o.standing || null, dir: -sd, pose: 'gun', level: 1.0 }));
    // Note: the gunsmoke: a plume from the muzzle drifting left and rising, thick at first, then banks lying along the ground and one drifting in front of the lens; each a billow with a dark underside and a lit crown.
    const muzzle = [vx - 0.78 * sd, 1.38, 0.0];
    const lit = rg.name === 'grey' ? C.PLASTER_L : C.BONE;
    for (let k = 0; k < 10; k++) {
      const t = k / 9;
      jobs.push(billow([muzzle[0] - t * 4.4 * sd, muzzle[1] + t * 0.7, muzzle[2] - 0.2 - t * 0.5], 0.3 + t * 1.2, { body: C.STONE_L, dark: C.STONE, lit, density: 0.88 - t * 0.4, squash: 0.8 }));
    }
    for (let k = 0; k < 3; k++) {
      const x = -2.6 + k * 2.2;
      jobs.push(billow([x, 0.4 + (k % 2) * 0.15, -0.6 + (k % 2) * 1.6], 1.2 + (k % 2) * 0.4, { body: C.STONE_L, dark: C.STONE, lit, density: 0.26, squash: 0.3 }));
    }
    jobs.push(billow([-0.4, 0.5, 2.2], 1.0, { body: C.STONE_L, dark: C.STONE, lit, density: 0.3, squash: 0.4 }));
    draw(film, jobs);
    px.over(film.px);
  },

  // Note: item 391 panel 1, the reckoning: the nemesis dead in the dust at sunrise; a very low camera on open ground with the sun just clearing the horizon at the right, painted where the player's sun-burst will open; he lies face up with his hat and gun beside him, lit warm from the right so that his face reads, the rest of the plain going to gold behind him, a riderless horse standing in the glare.
  reckoning(px, o, r) {
    const cam = camera3([0, 0.5, 0], Math.PI / 2, -0.064, 250, PW, PH);
    const sun = sunAt(cam, 253, 100);
    const rg = rig('dawn', cam, { sun, power: 2.2, ambient: 0.46 });
    const boxes = [];
    boxes.push(box([-600, -1, -600], [600, 0, 600], (p) => {
      const sx = (p[0] - -1.0) / 0.55;
      const sz = (p[2] - -3.4) / 0.3;
      if (sx * sx + sz * sz < 1) return { c: noise(Math.floor(p[0] * 30), Math.floor(p[2] * 30)) > 0.7 ? C.DARK : C.RED_D };
      return terrain(p, { eye: cam.pos, light: C.SAND, scrub: 0.12, haze: 50 });
    }));
    boxes.push(...cactus(5, -24, 3.2), ...cactus(11, -34, 2.6), ...cactus(-9, -30, 3.0), bush(3.2, -12, 0.9, 0.5), bush(-4.4, -9, 0.8, 0.45), bush(8, -18, 1.0, 0.6), bush(-2, -16, 1.0, 0.55));
    boxes.push(hills(rg, { z: -320, h: 58, seed: 21, far: 1, plateau: 0.8, gap: (sun[0] / sun[2]) * -320 }), hills(rg, { z: -210, h: 34, seed: 17, plateau: 0.62, gap: (sun[0] / sun[2]) * -210 }));
    // Note: a second, high light from the sun's side stands for the sky's glow on the ground, which a sun this low cannot give.
    const glow = { pos: [sun[0] * 120, 60, sun[2] * 120], power: 1.4, reach: 220, visible: null };
    const film = shoot(cam, rg, boxes, [glow]);
    film.haze(C.GOLD_L, 30, 120, 0.45);
    const jobs = [];
    const body = [-1.1, 0, -3.4];
    jobs.push({
      foot: body,
      opts: { half: [0.95, 0.2], len: 0.34, level: 1.0, rim: 1 },
      // Note: the low sun already lights his face; the nemesis key light or a lightened head on top of it burns a pale face and grey hair to white.
      make: (x, y, S) => pixelLying(PW, PH, x, y - 0.17 * S, 1.8 * S, o.nemesis ? { ...o.nemesis, keyLight: true } : null, { head: 1, face: 'up', lx: Math.max(0.6, rg.lx), ly: -0.3, cool: false, coat: C.WOOD_D, pose: 'stand' }),
    });
    jobs.push({
      foot: [0.6, 0, -3.2],
      go: (f) => { const [hx, hy] = f.cam.project([0.6, 0, -3.2]); hatDown(f.px, hx, hy, f.cam.scaleAt([0.6, 0, -3.2]), o.nemesis?.hat ?? C.DARK, { lx: 1, ly: -0.3 }); },
    });
    jobs.push({
      foot: [-2.5, 0, -3.0],
      go: (f) => { const [gx, gy] = f.cam.project([-2.5, 0.03, -3.0]); const s = f.cam.scaleAt([-2.5, 0, -3.0]); f.px.rect(gx, gy - s * 0.05, s * 0.22, Math.max(1, s * 0.045), C.IRON_L); f.px.rect(gx - s * 0.06, gy - s * 0.05, Math.max(1, s * 0.07), Math.max(1, s * 0.1), C.WOOD_D); },
    });
    jobs.push(horse([1.6, 0, -19], { dir: -1, coat: 1, blanket: C.RED, drop: 0.4, level: 0.85, rim: 1 }));
    draw(film, jobs);
    // Note: three buzzards circling high in the new light.
    for (const [vx, vy, sp] of [[196, 38, 7], [226, 52, 5], [74, 30, 6]]) {
      film.px.line(vx - sp, vy - 2, vx, vy, C.DARK); film.px.line(vx, vy, vx + sp, vy - 2, C.DARK);
      film.px.line(vx - sp - 2, vy - 1, vx - sp, vy - 2, C.DARK); film.px.line(vx + sp, vy - 2, vx + sp + 2, vy - 1, C.DARK);
    }
    px.over(film.px);
  },

  // Note: item 391 panel 4, the last ride: the sheriff leaving town into the open land at sunrise; a wide low shot from the roadside, the last fronts of the town and a steeple in cool shadow at the left, the empty road running right to a low sun in a gap of the hills, the rider small and lit warm in the middle of it all at a walk, a long shadow reaching back across the road toward the town, a grave cross and a rail fence by the road in the foreground.
  ride(px, o, r) {
    const cam = camera3([0, 1.0, 0], Math.PI / 2, -0.03, 250, PW, PH);
    const sun = sunAt(cam, 262, 88);
    const rg = rig('dawn', cam, { sun, power: 2.2, ambient: 0.4 });
    const walk = 0.42;
    const boxes = [];
    boxes.push(box([-600, -1, -600], [600, 0, 600], (p) => {
      const w = Math.abs(p[2] + 13);
      if (w < 2.1 + noise(Math.floor(p[0] * 2), Math.floor(p[2] * 2)) * 0.5 + (p[0] < -6 ? 1.5 : 0)) {
        const m = dirt(p, [-14.2, -11.8], C.PLASTER, cam.pos, 2);
        return Math.hypot(p[0], p[2]) > 80 ? { c: step(m.c, 1) } : m;
      }
      return terrain(p, { eye: cam.pos, light: C.SAND, scrub: 0.14, haze: 60 });
    }));
    // Note: the last fronts of the town along the far side of the road, ending in open country, with the church tower behind them.
    const specs = [
      { a: -78, b: -58, h: 8.0, wall: C.ADOBE, kind: 'adobe', top: 'arch', sign: SIGNS[5], door: 0.3, storeys: 1 },
      { a: -58, b: -42, h: 8.6, wall: C.WOOD, kind: 'plank', top: 'step', sign: SIGNS[0], door: 0.62, swing: true, storeys: 1 },
      { a: -42, b: -29, h: 7.2, wall: C.WOOD_L, kind: 'clap', top: 'flat', sign: SIGNS[1], door: 0.3, storeys: 1 },
      { a: -29, b: -16, h: 8.2, wall: C.PLANK, kind: 'plank', top: 'step', sign: SIGNS[4], door: 0.6, storeys: 1 },
      { a: -16, b: -3, h: 6.6, wall: C.WOOD, kind: 'plank', top: 'flat', sign: SIGNS[7], door: 0.5, storeys: 1 },
    ];
    const FZ = -32;
    const ppm = Math.round(cam.scaleAt([-20, 0, FZ]));
    for (const b of specs) boxes.push(...building({ ...b, lit: (cx) => noise(cx, 9) > 0.5 }, { face: '+z', at: FZ, ppm, y0: walk }));
    boxes.push(box(...slab('+z', FZ, -100, -3, 0, 5.45, -0.8, -0.7), () => ({ c: C.SHADOW, ambient: 0.5 })));
    boxes.push(...porch('+z', FZ, -100, -3, { roof: 2.85, walk, wide: 2.6 }));
    const white = (p) => boards(C.PLASTER_L, p[0] + p[2], p[1], 0.35);
    boxes.push(box([-24, 0, -62], [-15, 6.4, -50], white), box([-21.6, 0, -58], [-17.4, 12, -52], white), box([-21, 12, -57.4], [-18, 14.6, -52.6], white), box([-20.2, 14.6, -56.6], [-18.8, 17.2, -53.4], white));
    // Note: a rail fence along the near side of the road, a grave cross close to the lens, and poles marching off.
    for (let x = 6; x < 90; x += 2.4) boxes.push(box([x, 0, -8.2], [x + 0.12, 1.2, -8.08], () => ({ c: C.WOOD }), { cast: true }));
    boxes.push(box([6, 0.9, -8.2], [92, 1.0, -8.08], () => ({ c: C.WOOD_D }), { cast: true }), box([6, 0.45, -8.2], [92, 0.55, -8.08], () => ({ c: C.WOOD_D }), { cast: true }));
    boxes.push(box([-2.4, 0, -4.4], [-2.3, 1.0, -4.3], (p, n) => ({ c: n[0] > 0.5 ? C.WOOD_L : C.WOOD }), { cast: true }), box([-2.65, 0.65, -4.4], [-2.05, 0.75, -4.3], (p, n) => ({ c: n[0] > 0.5 ? C.WOOD_L : C.WOOD }), { cast: true }));
    for (const x of [30, 52, 80]) boxes.push(...pole(x, -16, 6.2));
    boxes.push(...cactus(26, -24, 2.8), ...cactus(50, -32, 3.2), bush(16, -18, 1.0, 0.55), bush(38, -17, 1.0, 0.6), bush(-6, -6, 0.8, 0.45));
    boxes.push(hills(rg, { z: -330, h: 56, seed: 31, far: 1, plateau: 0.8, gap: (sun[0] / sun[2]) * -330 }), hills(rg, { z: -220, h: 34, seed: 27, plateau: 0.6, gap: (sun[0] / sun[2]) * -220 }));
    const glow = { pos: [sun[0] * 120, 60, sun[2] * 120], power: 1.3, reach: 220, visible: null };
    const film = shoot(cam, rg, boxes, [glow]);
    film.haze(C.GOLD_L, 30, 130, 0.4);
    const jobs = [];
    jobs.push(horse([4.2, 0, -13], { pose: 'walk', dir: 1, coat: 0, blanket: C.RED, rider: { look: o.sheriff || LAWMAN, lean: 0.04 }, bedroll: C.PLASTER, level: 1.0, rim: 1 }));
    jobs.push(puffJob([2.9, 0.1, -12.9], 0.5, C.GOLD_L, 0.3, 0.5), puffJob([2.1, 0.2, -12.8], 0.7, C.SAND_L, 0.25, 0.5));
    draw(film, jobs);
    px.over(film.px);
  },
};
