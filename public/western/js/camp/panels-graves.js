// Note: the grave, ending and backdrop panels (items 386, 389–392): built as places in metres and filmed through a camera.

import { C } from '../palette.js';
import { Px } from './pixel-art.js';
import { camera3 } from './pixel-3d.js';
import { PW, PH, place } from './pixel-kit.js';
import { yard, film, actor, dustWind, kneel, KNEEL_HAND, starBox, boards, MOODS, HERO, vnoise, rampAt, crow, tumbleweed, zOf } from './graves-world.js';
import { box, noise } from './pixel-3d.js';
import { posterTexture, posterBoxes, POSTER } from './graves-poster.js';

// Note: where the mourners stand, as feet in metres: round the mound at different depths, profile or from behind; dir is the way they face on screen.
const SLOTS = [
  { x: -1.1, z: -2.6, dir: 1 },
  { x: 1.6, z: -2.7, dir: -1 },
  { x: 1.55, z: -1.6, back: true },
  { x: -1.7, z: -3.6, dir: 1 },
  { x: 2.1, z: -3.8, dir: -1 },
  { x: -1.0, z: -1.7, back: true },
];

// Note: crew figures laid over a filmed yard, farthest first, each lit like the mood and given a contact shadow when the light is low.
function lay(px, cam, info, world, people) {
  const sp = world.mood.sprite;
  for (const q of people.sort((a, b) => a.z - b.z)) {
    const a = actor(cam, info, [q.x, 0, q.z], q.look, q.pose || 'stand', { dir: q.dir || 1, back: q.back, hat: q.hat, lx: sp.lx, ly: sp.ly, cool: true });
    const shadow = world.mood.sun ? { foot: a.sy, sx: -world.mood.sun[0] * 0.5, sy: 0.35, k: -1 } : null;
    place(px, a.L, { lx: sp.lx, ly: sp.ly, rim: world.mood.sun ? 1 : 0, shadow });
  }
}

// Note: where the crew walk on the way out, one behind another down the track.
const LEAVE = [[2.2, -4.5], [3.9, -5.8], [2.9, -7.4], [4.5, -9.0], [3.4, -10.6], [5.0, -12.2]];

// Note: the marker alone: a low camera three metres from the board in a gale; a wall of dust thick near the ground and thin above, streaks of grit, and a tumbleweed bounding past in front.
function alone(px, o, r) {
  const cam = camera3([0.9, 0.8, 0.2], Math.PI / 2 + 0.02, 0.03, 340, PW, PH);
  const world = yard({ mood: o.mood || 'grey', name: o.name, date: o.date, star: o.star, ppm: 90, shovel: false });
  const { px: scene } = film(cam, world);
  px.over(scene);
  // Note: the dust veils the town and the ground, a stronger veil the lower in the frame.
  px.wash(0, 90, PW, 90, C.SAND_L, (x, y) => 0.05 + ((y - 90) / 90) * 0.22 + (vnoise(x / 24 + 3, y / 5) - 0.5) * 0.2);
  px.wash(0, 0, PW, 90, C.STONE_L, (x, y) => Math.max(0, (y - 50) / 40) * 0.18 * vnoise(x / 30, y / 6));
  dustWind(px, r, { amount: 2.4, ymin: 40, c: C.SAND_L });
  dustWind(px, r, { amount: 1, ymin: 100, c: C.SAND });
  tumbleweed(px, r, 258, 146, 17, 1);
}

// Note: the star lifted: the successor kneels at the right of the board, bareheaded, one arm raised, the star pinched by a point and drawn up off its nail against the sky.
function lifted(px, o, r) {
  const raise = Math.min(0.4, Math.abs(+o.lift || 26) * 0.008);
  const cam = camera3([-0.2, 1.05, 0.5], Math.PI / 2 - 0.1, -0.02, 330, PW, PH);
  const R = 0.085;
  const nail = [HERO.x, 0.42 + 0.7 - 0.1, HERO.z + 0.15];
  const tip = [nail[0] + 0.02, nail[1] + raise + 0.15, nail[2] + 0.05];
  const star = starBox(tip[0], tip[1] - R * 0.8, tip[2], R);
  const foot = [tip[0] + KNEEL_HAND.up[0] * 0.24, 0, tip[2] + 0.35];
  const world = yard({ mood: o.mood || 'grey', name: o.name, date: o.date, star: true, raise: -9, ppm: 89, shovel: false, extra: [star] });
  const { px: scene, info } = film(cam, world);
  px.over(scene);
  const sp = world.mood.sprite;
  const [fx, fy, depth] = cam.project(foot);
  const man = kneel(PW, PH, fx, fy, cam.scaleAt(foot) * 1.8, null, { dir: -1, up: true, lx: sp.lx, ly: sp.ly, cool: true });
  const L = new Px(PW, PH);
  for (let i = 0; i < man.L.a.length; i++) if (man.L.a[i] !== 255 && !(info[i] && zOf(cam, info[i].p) < depth - 0.35)) L.a[i] = man.L.a[i];
  place(px, L, { lx: sp.lx, ly: sp.ly });
}

export const GRAVES = {
  // Note: items 389 panel 2 and 390 panels 2 and 3, in four shots of one yard: hats off (the camera low at the left foot of the mound, looking across it to the marker with the town far below the crest), the crew leaving (the camera low in front of the marker, the crew walking away from it down the track), the star lifted (a close shot of the board and a hand), the marker alone in blowing dust.
  grave(px, o, r) {
    const crew = o.crew || [];
    const mood = o.mood || 'grey';
    if (o.lift != null && o.lift !== false) lifted(px, o, r);
    else if (o.leave) {
      const cam = camera3([1.8, 1.1, 1.0], 1.66, 0.04, 360, PW, PH);
      const world = yard({ mood, name: o.name, date: o.date, star: o.star, ppm: 80 });
      const { px: scene, info } = film(cam, world);
      px.over(scene);
      lay(px, cam, info, world, crew.slice(0, 6).map((look, i) => ({ look, x: LEAVE[i][0], z: LEAVE[i][1], pose: 'walk', back: true })));
    } else if (!crew.length) alone(px, o, r);
    else {
      const cam = camera3([0.25, 1.25, 1.6], Math.PI / 2, 0.05, 390, PW, PH);
      const world = yard({ mood, name: o.name, date: o.date, star: o.star, ppm: 81 });
      const { px: scene, info } = film(cam, world);
      px.over(scene);
      // Note: the top of the marker, so a memorial likeness can hang above it.
      if (o.report) [o.report.marker] = [{ x: cam.project([HERO.x, 1.1, HERO.z])[0], y: cam.project([HERO.x, 1.1, HERO.z])[1] }];
      lay(px, cam, info, world, crew.slice(0, SLOTS.length).map((look, i) => ({ look, ...SLOTS[i], hat: true })));
    }
  },

  // Note: item 391 panel 2: dawn at the murdered sheriff's old grave; the sun rises behind the town on the right, the sheriff stands at the foot of the grave in profile with his hat in his hand, rimmed by the light, the old board leaning a little.
  oldgrave(px, o, r) {
    const cam = camera3([-1.0, 1.3, 0.5], 1.05, 0.02, 300, PW, PH);
    const world = yard({ mood: 'dawn', name: o.name, date: o.date, old: true, ppm: 75, shovel: false });
    const { px: scene, info } = film(cam, world);
    px.over(scene);
    lay(px, cam, info, world, [{ look: o.sheriff || null, x: 0.95, z: -3.1, dir: -1, hat: true }]);
  },

  // Note: item 391 panel 3: the star laid down; a low camera close to the foot of the old grave, the old board behind the mound and the sheriff's sleeve coming in from the right with the star pinched between two fingers just above the earth.
  laydown(px, o, r) {
    const cam = camera3([-1.3, 1.1, 0.9], 1.2, 0.06, 330, PW, PH);
    const R = 0.085;
    // Note: he kneels on the right of the mound facing left; his reaching hand lands 0.59 m ahead of his foot and 0.4 m up, where the star hangs.
    const foot = [0.95, 0, -3.0];
    const tip = [foot[0] - KNEEL_HAND.down[0] * 0.24, KNEEL_HAND.down[1] * 0.24, foot[2]];
    const star = starBox(tip[0], tip[1] - R * 0.8, tip[2], R);
    const world = yard({ mood: 'dawn', name: o.name, date: o.date, old: true, ppm: 90, shovel: false, extra: [star] });
    const { px: scene, info } = film(cam, world);
    px.over(scene);
    const sp = world.mood.sprite;
    const [fx, fy, depth] = cam.project(foot);
    const man = kneel(PW, PH, fx, fy, cam.scaleAt(foot) * 1.8, o.sheriff, { dir: -1, lx: sp.lx, ly: sp.ly, cool: true });
    const L = new Px(PW, PH);
    for (let i = 0; i < man.L.a.length; i++) if (man.L.a[i] !== 255 && !(info[i] && zOf(cam, info[i].p) < depth - 0.35)) L.a[i] = man.L.a[i];
    place(px, L, { lx: sp.lx, ly: sp.ly, rim: 1, shadow: { foot: fy, sx: -world.mood.sun[0] * 0.5, sy: 0.35, k: -1 } });
  },

  // Note: item 392 panel 1: the last sheriff's grave alone; the camera lies low in the grass and looks up past the board at an empty grey sky, the town small and far below the crest, the shovel still in the earth and a crow on the board.
  lonegrave(px, o, r) {
    const cam = camera3([-1.5, 0.4, 0.2], 1.1, -0.1, 270, PW, PH);
    const world = yard({ mood: 'grey', name: o.name, date: o.date, star: true, ppm: 70 });
    const { px: scene } = film(cam, world);
    px.over(scene);
    // Note: the crow on the board's top edge, looking at the town.
    const [cx, cy] = cam.project([HERO.x + 0.2, 0.42 + 0.7 - 0.012, HERO.z + 0.1]);
    crow(px, cx, cy, cam.scaleAt([HERO.x, 1.1, HERO.z]) * 0.27, -1);
  },

  // Note: item 392 panel 2: the nemesis's wanted poster peeling off a plank wall in the evening wind; the camera is a metre and a half from the wall at the left, looking along it at an angle, so the sheet's free edge curls toward us and its torn corner lifts out of the wall's raking shadow.
  poster(px, o, r) {
    const mood = MOODS.dusk;
    const tex = posterTexture(o.name, o.nemesis);
    const wall = (p) => {
      const m = boards(C.WOOD_L, p[0], p[1], 0.21);
      // Note: nail heads in rows, and cracks that run down the boards.
      const nx = (((p[0] % 0.21) + 0.21) % 0.21);
      if (nx > 0.08 && nx < 0.1 && [0.5, 1.3, 2.1, 2.9].some((ny) => Math.abs(p[1] - ny) < 0.012)) return { c: C.IRON };
      if (noise(Math.floor(p[0] / 0.21), Math.floor(p[1] * 3.2)) > 0.93 && nx > 0.1 && nx < 0.12) return { c: C.SHADOW };
      return m;
    };
    const boxes = [
      box([-4, 0, -0.3], [2.5, 3.5, 0], wall),
      box([2.5, 0, -0.3], [2.66, 3.5, 0.17], (p) => ({ c: noise(Math.floor(p[1] * 10), Math.floor(p[2] * 8)) > 0.8 ? C.WOOD : C.WOOD_L })),
      box([-4, 0.9, 0], [2.5, 0.99, 0.045], () => ({ c: C.WOOD })),
      box([-4, 2.2, 0], [2.5, 2.3, 0.045], () => ({ c: C.WOOD })),
      box([-4, 3.0, 0], [2.7, 3.12, 1.3], (p) => ({ c: (((p[0] % 0.5) + 0.5) % 0.5) < 0.1 ? C.SHADOW : C.WOOD_D })),
      box([-4, -0.15, 0], [8, 0, 2.6], (p) => ({ ...boards(C.WOOD, p[2], p[0], 0.22), k: 0.9 })),
      box([-4, -0.55, 2.6], [40, -0.15, 40], (p) => ({ c: noise(Math.floor(p[0] * 7), Math.floor(p[2] * 7)) > 0.85 ? C.SAND_L : noise(Math.floor(p[0] * 2), Math.floor(p[2] * 2)) > 0.6 ? C.SAND : C.SAND_D }), { noShadow: true }),
      box([-20, -0.5, 18], [60, 6.5, 18.4], (p) => (p[1] > 4.2 + noise(Math.floor(p[0] / 6), 1) * 1.5 ? null : { c: [C.ADOBE, C.WOOD, C.PLANK][Math.floor(Math.floor(p[0] / 6) % 3 + 3) % 3], ambient: 1.5 }), { noShadow: true }),
      ...posterBoxes(tex, 4),
    ];
    // Note: scraps torn off in the wind, flying past the lifted edge.
    for (const [dx, dy, dz, s] of [[0.78, 1.6, 0.5, 0.05], [0.95, 1.95, 0.8, 0.04], [0.7, 1.35, 0.9, 0.035]]) boxes.push(box([POSTER.x + dx, dy, dz], [POSTER.x + dx + s, dy + s * 0.7, dz + 0.006], () => ({ c: C.PLASTER, k: 1.2 }), { noShadow: true }));
    const cam = camera3([-0.6, 1.5, 1.5], 0.84, 0.0, 380, PW, PH);
    const world = { boxes, lights: mood.lights, ambient: mood.ambient, sky: mood.sky, mood };
    const { px: scene } = film(cam, world);
    px.over(scene);
    dustWind(px, r, { amount: 0.8, ymin: 60, dir: 1, c: C.SAND_L });
  },

  // Note: the quiet ground behind a portrait that stands alone (items 383, 386, 389, 390), with no place in it: a cloth of crepe folds and fine weave, a soft pool of light where the portrait sits in the lower middle, gunsmoke drifting thin at the edges and a few motes of dust; dark for a death (darker still for the sheriff's), sepia and gunsmoke for a victor or a questioned man.
  plain(px, o, r) {
    const dark = !!o.dark;
    const darker = dark && !!o.darker;
    const ramp = dark ? [C.VOID, C.SHADOW, C.DARK, C.WOOD_D, C.WOOD, C.WOOD_L] : [C.WOOD_D, C.WOOD, C.WOOD_L, C.PLANK, C.SAND_D, C.SAND, C.SAND_L];
    const base = darker ? 0.3 : dark ? 0.8 : 1.3;
    const lift = darker ? 2.0 : dark ? 2.7 : 3.2;
    const cx = PW / 2;
    const cy = PH * 0.68;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      // Note: the pool of light: smooth and wide, brightest where the portrait stands.
      const d = Math.hypot((x - cx) / 118, (y - cy) / 62);
      const pool = Math.exp(-d * d * 1.1);
      // Note: crepe folds hang down the cloth in soft vertical drapes that bend with the noise, flatter near the pool.
      const fold = Math.sin(x * 0.21 + vnoise(x / 40, y / 55) * 5) * 0.5 + 0.5;
      // Note: a plain weave: threads cross every other pixel, and a grain in the paper.
      const weave = ((x + y) & 3) < 2 ? 0.05 : -0.05;
      // Note: gunsmoke thins to nothing near the middle so the centre stays calm.
      const smoke = Math.max(0, vnoise(x / 46 + 7, y / 14) * vnoise(x / 21, y / 8 + 3) * 2.2 - 0.55) * (1 - pool);
      const t = base + lift * pool + (fold - 0.5) * 0.4 * (1 - pool * 0.6) + weave + smoke * 1.1;
      px.set(x, y, rampAt(ramp, t, x, y));
    }
    // Note: motes of dust hanging in the air, a few pale specks, sparser in the pool.
    for (let i = 0; i < 46; i++) {
      const x = r.next() * PW;
      const y = r.next() * PH;
      if (Math.hypot((x - cx) / 100, (y - cy) / 50) < 0.8 && r.chance(0.7)) continue;
      px.set(x, y, dark ? C.WOOD : C.PLASTER);
      if (r.chance(0.3)) px.set(x + 1, y, dark ? C.WOOD_D : C.SAND_L);
    }
  },
};
