// Note: the saloon panels (items 383, 384, 387, 388): built as places in metres and filmed through a camera.

import { C } from '../palette.js';
import { Px } from './pixel-art.js';
import { camera3 } from './pixel-3d.js';
import { PW, PH, puff } from './pixel-kit.js';
import { buildSaloon, film, actor, folk, crowd, props } from './pixel-saloon-kit.js';
import { box } from './pixel-3d.js';

// Note: yaw of a camera at (x, z) looking at a point (tx, tz): yaw turns from +x toward -z.
const aim = (x, z, tx, tz) => Math.atan2(-(tz - z), tx - x);
// Note: a ring of positions around a centre, facing in.
const ring = (cx, cz, rad, n, from, to) => Array.from({ length: n }, (_, i) => {
  const a = from + ((to - from) * i) / Math.max(1, n - 1);
  return [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad];
});

// Note: the barkeep behind the bar holding out the bill; a report object receives the sheet's rectangle so the costs can be lettered on it.
function barkeepBill(px, cam, S, info, r, foot, report = null) {
  const k = actor(px, cam, S, info, { foot, look: folk(r, { coats: [C.PLASTER], extra: { skin: C.ADOBE_L, vest: C.DARK, moustache: 'handlebar', hat: null, hairStyle: 'parted', coat: C.PLASTER } }), pose: 'hold', view: 'front', slack: 0.1 });
  const hx = k.sx + (k.h / 7.5) * 1.9 * k.dir;
  const hy = k.sy - (k.h / 7.5) * 4.6;
  const w = report ? 42 : 18;
  const h = report ? 30 : 26;
  const x0 = Math.round(hx - w / 2 + (report ? 8 : 0));
  const y0 = Math.round(hy + 4 - h);
  const paper = new Px(PW, PH);
  paper.rect(x0 - 1, y0 - 1, w + 2, h + 2, C.DARK);
  paper.rect(x0, y0, w, h, C.BONE);
  paper.rect(x0, y0, w, 1, C.PLASTER);
  if (report) report.bill = { x: x0, y: y0, w, h };
  else {
    for (let i = 0; i < 5; i++) paper.rect(x0 + 2, y0 + 4 + i * 4, 8 + ((i * 3) % 5), 1, C.WOOD_D);
    paper.rect(x0 + 2, y0 + 23, 14, 1, C.RED_D);
  }
  px.over(paper);
}

// Note: stacks of gold coins drawn on the bar top, a few pixels high each, with a lit edge.
function coinStacks(px, n, x0, y0) {
  for (let k = 0; k < n; k++) {
    const x = x0 + k * 8;
    const layers = 2 + (k % 3);
    for (let i = 0; i < layers; i++) {
      const y = y0 - i * 2;
      px.rect(x - 1, y - 1, 8, 4, C.DARK);
      px.rect(x, y, 6, 2, k % 4 === 3 ? C.STONE_L : C.GOLD);
      px.rect(x, y, 6, 1, C.BONE);
    }
  }
}

export const SALOON = {
  // Note: item 384 panels 1 and 2: the camera sits at the next table and looks across the room to the bar and its mirror; the challenger has just shoved back from his table, side on and facing his man, cards and a glass still in the air and his chair going over; every onlooker turns on him in profile or from behind, one backs off, one ducks behind the bar, and nobody looks at the lens.
  saloon(px, o, r) {
    const cam = camera3([1.9, 1.1, -3.0], 0.383, 0.04, 200, PW, PH);
    const n = 2 + (o.size ?? 1) * 2;
    const S = buildSaloon(o.mood || 'night', { fallenChairs: ['1:0'], tables: [[5.9, -2.4, [1, 0, 1, 1]], [4.4, -5.6, [1, 1, 0, 1]], [2.6, -6.5, [1, 1, 1, 1]]] }, cam.pos);
    // Note: cards thrown up and a glass and bottle tumbling over the table, flat or on edge.
    for (let k = 0; k < 9; k++) {
      const x = 3.6 + r.next() * 1.4;
      const y = 0.3 + r.next() * 1.0;
      const z = -5.9 + r.next() * 0.9;
      S.add(k % 3 === 0 ? box([x - 0.004, y, z - 0.05], [x + 0.004, y + 0.1, z + 0.035], () => ({ c: C.BONE })) : props.card(x, y, z));
    }
    S.add(props.glass(4.7, 1.05, -5.3), props.bottle(4.1, 0.85, -5.9, C.GREEN_D), props.card(4.9, 0.004, -5.0), props.card(3.3, 0.004, -4.7), props.card(4.2, 0.004, -5.0, 0.1, 0.07));
    const { px: scene, info } = film(cam, S, { shafts: 1 }, r);
    px.over(scene);
    const hero = [3.5, 0, -5.3];
    const list = [{ foot: hero, look: o.b || folk(r), pose: 'draw', view: 'side', dir: 1, rim: 2, light: { lx: 0.2, ly: -0.6, level: 0.8 } }];
    // Note: item 395: the challenged duelist faces the challenger across the floor, so both confront each other amid the onlookers.
    if (o.a) list.push({ foot: [6.0, 0, -5.0], look: o.a, pose: 'stand', view: 'side', dir: -1, rim: 1, light: { lx: 0.2, ly: -0.6, level: 0.8 } });
    const at = [
      { foot: [7.0, 0, -2.3], pose: 'stand', view: 'side', face: hero },
      { foot: [8.95, -0.38, -3.2], pose: 'stand', view: 'side', face: hero },
      { foot: [6.4, 0, -3.3], pose: 'stand', view: 'back', dir: -1 },
      { foot: [6.2, 0, -4.5], pose: 'walk', view: 'side', dir: 1 },
      { foot: [7.0, 0, -4.2], pose: 'stand', view: 'side', face: hero },
      { foot: [7.05, 0, -5.9], pose: 'stand', view: 'side', face: hero },
    ];
    for (let k = 0; k < Math.min(n, at.length); k++) list.push({ look: folk(r), ...at[k] });
    crowd(px, cam, S, info, list);
  },

  // Note: item 383 (a saloon table): a close shot across a card table at table height; a lamp low over it pools the light on the cards; three men lean in, one talking low.
  table(px, o, r) {
    const cam = camera3([3.8, 1.45, -2.4], Math.PI / 2, 0.2, 200, PW, PH);
    const S = buildSaloon('night', {
      tables: [[3.8, -4.6, [0, 0, 0, 0]], [6.2, -3.0, [1, 1, 1, 1]], [1.9, -6.2, [1, 0, 1, 1]]],
      lamps: [[3.8, 2.3, -4.6], [6.2, 3.15, -3.0], [2.5, 3.15, -6.2], [7.95, 3.0, -3], [7.95, 3, -6]],
      extraChairs: [{ x: 3.0, z: -4.6, dx: 1, dz: 0 }, { x: 4.6, z: -4.6, dx: -1, dz: 0 }, { x: 3.8, z: -5.4, dx: 0, dz: 1 }, { x: 3.4, z: -3.8, dx: 0, dz: -1 }],
    }, cam.pos);
    // Note: a low fill from the table lamp's spill keeps the near chair from going to a blue blotch.
    S.lights.push({ pos: [3.8, 1.5, -3.4], power: 0.7, reach: 2.2 });
    const y = 0.77;
    for (let k = 0; k < 7; k++) S.add(props.card(3.55 + r.next() * 0.5, y, -4.7 + r.next() * 0.4));
    S.add(props.glass(3.35, y, -4.35), props.glass(4.2, y, -4.85), props.glass(4.05, y, -4.3, C.GOLD), props.bottle(3.95, y, -4.95), props.coins(3.75, y, -4.45, 4), props.coins(3.9, y, -4.38, 2, C.STONE_L));
    const { px: scene, info } = film(cam, S, { shafts: 0, halo: true }, r);
    px.over(scene);
    const seat = (x, z, view, extra) => ({ foot: [x, 0, z], look: folk(r), pose: 'stand', view, sit: true, slack: 0.12, ...extra });
    crowd(px, cam, S, info, [
      seat(3.8, -5.3, 'front', { lean: -0.03 }),
      seat(4.5, -4.6, 'side', { dir: -1, lean: 0.06, face: [3.8, 1, -4.6] }),
      seat(3.4, -3.9, 'back', { lean: 0.03 }),
    ]);
    const [lx, ly] = cam.project([3.8, 2.2, -4.6]);
    puff(px, lx, ly + 18, 70, 22, C.STONE_L, 0.12);
  },

  // Note: item 383 (witnesses): over the lawman's shoulder at the bar; two townsmen who knew the dead man tell it to him in profile, one with his hat in his hand, one pointing back toward the door, the barkeep leaning in to listen; window light from behind the camera.
  witness(px, o, r) {
    const cam = camera3([4.6, 1.5, -1.5], aim(4.6, -1.5, 8.4, -4.4), 0.05, 220, PW, PH);
    const S = buildSaloon(o.mood || 'day', { noShadow: true }, cam.pos);
    const { px: scene, info } = film(cam, S, { shafts: 1 }, r);
    px.over(scene);
    const law = folk(r, { extra: { badge: true, hatStyle: 'wide', coat: C.WOOD_D, hat: C.WOOD_D } });
    const w1 = folk(r);
    const w2 = folk(r);
    const lawFoot = [7.0, 0, -3.0];
    const F1 = [7.0, 0, -4.7];
    const F2 = [6.4, 0, -5.9];
    crowd(px, cam, S, info, [
      { foot: lawFoot, look: law, pose: 'stand', view: 'back', dir: 1 },
      { foot: F1, look: w1, pose: 'hat', view: 'side', face: lawFoot, hatless: true },
      { foot: F2, look: w2, pose: 'point', view: 'side', face: lawFoot },
      { foot: [8.9, 0, -4.4], look: folk(r, { coats: [C.PLASTER], extra: { hat: null, coat: C.PLASTER, vest: C.DARK, moustache: 'handlebar' } }), pose: 'stand', view: 'side', face: lawFoot },
    ]);
  },

  // Note: item 384 panel 3: from inside at table height, the duelists seen from behind shoulder the batwings open; the doorway is the bright frame, daylight blasts in around them in dust shafts and their long shadows run back across the floor toward the camera; the room empties after them.
  doors(px, o, r) {
    const cam = camera3([4.8, 1.2, -4.7], -Math.PI / 2 - 0.02, 0.02, 190, PW, PH);
    const S = buildSaloon(o.mood || 'day', { door: [0.95, 0.8], sun: { pos: [4.9, 8, 18], power: 4.2 }, noShadow: true, fallenChairs: ['0:1', '1:2'], tables: [[2.9, -3.6, [1, 1, 1, 1]], [6.4, -3.4, [1, 0, 1, 1]], [2.1, -5.2, [0, 1, 0, 1]], [6.3, -5.8, [1, 1, 1, 1]]], extraChairs: [{ x: 4.0, z: -2.2, dx: 1, dz: 0, fallen: true }] }, cam.pos);
    const { px: scene, info } = film(cam, S, { shafts: 2.2, motes: 30 }, r);
    px.over(scene);
    // Note: the white daylight blooms past the doorway's edges into the dim room.
    const [gx, gy] = cam.project([4.9, 1.2, 0]);
    px.glow(gx, gy, 70, 1.3, true);
    const looks = [o.b ? { ...o.b } : folk(r), o.a ? { ...o.a } : folk(r)];
    const back = { sx: 0.05, sy: 0.85, k: -2 };
    const lit = { lx: 0, ly: -0.7, level: 0.9 };
    const go = (x, z, look, pose, extra = {}) => ({ foot: [x, 0, z], look, pose, light: lit, shadow: back, rim: 2, ...extra });
    crowd(px, cam, S, info, [
      go(4.4, -0.35, looks[0], 'walk', { view: looks[0] && looks[0].kind === 'nemesis' ? 'side' : 'back', dir: 1 }),
      go(5.45, -0.7, looks[1], 'walk', { view: 'back', dir: 1 }),
      go(2.9, -1.0, folk(r), 'walk', { view: 'back', dir: 1 }),
      go(3.0, -2.4, folk(r), 'walk', { view: 'back', dir: -1 }),
    ]);
  },

  // Note: item 387 panel 1: floor level, the lens almost on the planks; a glass has burst a metre ahead, glass and whisky hanging in the air all round the lens, the thrower's arm following through in profile, every head snapped round toward it, the batwings still swinging at the far end.
  glass(px, o, r) {
    const cam = camera3([6.4, 0.5, -6.6], aim(6.4, -6.6, 4.9, 0), -0.1, 165, PW, PH);
    const S = buildSaloon('dusk', { door: [0.95, 0.55], fallenChairs: ['1:3'] }, cam.pos);
    const { px: scene, info } = film(cam, S, { shafts: 1 }, r);
    px.over(scene);
    const hit = [6.0, 0.35, -5.2];
    const thrower = folk(r);
    crowd(px, cam, S, info, [
      { foot: [7.1, 0, -4.2], look: thrower, pose: 'throw', view: 'side', dir: 1, light: { lx: -0.5, ly: -0.5, level: 0.9 } },
      { foot: [4.1, 0, -4.4], look: folk(r), pose: 'stand', view: 'side', face: hit },
      { foot: [3.8, 0, -2.6], look: folk(r), pose: 'stand', view: 'back', dir: 1 },
      { foot: [6.8, 0, -2.6], look: folk(r), pose: 'stand', view: 'side', face: hit },
      { foot: [5.3, 0, -1.8], look: folk(r), pose: 'walk', view: 'side', face: hit },
      { foot: [4.9, 0, -5.7], look: folk(r), pose: 'draw', view: 'side', face: hit },
    ]);
    // Note: the burst: a flash and a crown of whisky at the impact, then shards and droplets on arcs thrown up and out, bigger toward the lens.
    const [cx, cy] = cam.project(hit);
    const sc = cam.scaleAt(hit) * 1.5;
    px.ellipse(cx, cy + 2, sc * 0.22, sc * 0.035, C.GOLD);
    px.ellipse(cx, cy + 1, sc * 0.12, sc * 0.02, C.GOLD_L);
    for (let k = 0; k < 90; k++) {
      const ang = -0.1 - r.next() * (Math.PI - 0.2);
      const v = r.next();
      const rad = sc * (0.1 + v * 0.95);
      const x = cx + Math.cos(ang) * rad * 1.15;
      const y = cy + Math.sin(ang) * rad * 0.9 + (v * v) * sc * 0.15;
      if (k % 3 === 0) {
        px.rect(x, y, 1 + (k % 2), 1 + (k % 2), k % 2 ? C.GOLD_L : C.GOLD);
      } else {
        const sz = 1 + Math.floor((1 - v) * 3 + r.next());
        const c = k % 5 === 0 ? C.BONE : k % 2 ? C.GLASS_L : C.GLASS;
        px.poly([[x, y - sz], [x + sz + 1, y + 0.5], [x + 0.5, y + sz], [x - sz, y]], c);
        px.set(x, y, C.BONE);
      }
    }
    px.line(cx - sc * 0.3, cy - sc * 0.25, cx + sc * 0.45, cy - sc * 0.6, C.GOLD);
    px.line(cx - sc * 0.1, cy - sc * 0.4, cx - sc * 0.5, cy - sc * 0.55, C.GOLD_L);
  },

  // Note: item 387 panel 2: from the gallery rail the camera looks down into the room, the tables pushed back and the crowd standing in a ring around the lamp-lit floor.
  fighters(px, o, r) {
    const cam = camera3([5.0, 4.2, -8.4], -Math.PI / 2, 0.62, 170, PW, PH);
    const C0 = [5.0, -3.8];
    const pos = ring(C0[0], C0[1], 2.2, 15, 0.2, Math.PI * 2 - 0.2).filter((_, i) => i !== 11);
    const S = buildSaloon('night', {
      noRail: true,
      tables: [[1.9, -2.8, [1, 0, 0, 1]], [1.8, -4.9, [0, 1, 1, 0]], [7.1, -7.3, [1, 0, 1, 0]], [3.2, -7.6, [0, 0, 1, 1]]],
      extraChairs: [{ x: 0.6, z: -1.2, dx: 1, dz: 0 }, { x: 6.8, z: -1.2, dx: -1, dz: 0 }, { x: 6.9, z: -6.2, dx: 0, dz: -1, fallen: true }, { x: 2.8, z: -1.6, dx: 1, dz: 0 }],
      lamps: [[5.0, 3.15, -3.8], [3.0, 3.15, -2.0], [7.2, 3.0, -5.0], [2.5, 3.15, -6.2]],
    }, cam.pos);
    S.add({ min: [C0[0] - 2.1, 0, C0[1] - 2.1], max: [C0[0] + 2.1, 0.003, C0[1] + 2.1], mat: (p) => { const d = Math.hypot(p[0] - C0[0], p[2] - C0[1]); return d > 1.95 ? null : { c: d > 1.8 ? C.SAND_L : (Math.floor(p[0] * 30) + Math.floor(p[2] * 30)) % 7 ? C.SAND : C.SAND_L, ambient: 1 }; } });
    const { px: scene, info } = film(cam, S, { shafts: 0 }, r);
    px.over(scene);
    const list = pos.map(([x, z]) => {
      const dx = C0[0] - x;
      const view = Math.abs(dx) < 0.6 ? (z > C0[1] ? 'front' : 'back') : 'side';
      return { foot: [x, 0, z], look: folk(r), pose: r.chance(0.3) ? 'raise' : 'stand', view, face: [C0[0], 1.4, C0[1]] };
    });
    const shirt = (ex) => folk(r, { coats: [C.PLASTER, C.STONE, C.BONE], hatless: true, extra: { vest: null, ...ex } });
    list.push({ foot: [4.3, 0, -3.8], look: shirt(), pose: 'walk', view: 'side', dir: 1 }, { foot: [5.7, 0, -3.8], look: shirt(), pose: 'walk', view: 'side', dir: -1 });
    crowd(px, cam, S, info, list);
  },

  // Note: item 388 panel 1: the morning after, one subject: a table on its side and a smashed chair in the foreground, the cracked mirror behind, a man sitting against the bar in profile nursing his jaw, and hard dawn beams through the window crossing the dust.
  wreck(px, o, r) {
    const coins = Math.max(0, Math.min(9, o.coins ?? 0));
    const cam = camera3([3.4, coins ? 1.55 : 1.15, -6.2], aim(3.4, -6.2, 8.0, -3.0), coins ? 0.12 : 0.05, 190, PW, PH);
    const S = buildSaloon('dawn', {
      wrecked: true, crack: [2.4, -4.2], amb: 0.1, lamps: [], sconces: false, fallenTables: [0], tableAxis: 'z', tableLeg: -1, fallenChairs: ['1:0', '1:2', '2:1'],
      tables: [[5.5, -5.0, [0, 0, 0, 0]], [6.2, -6.9, [1, 1, 1, 1]], [2.2, -3.4, [1, 1, 1, 1]]],
      extraChairs: [{ x: 3.6, z: -3.6, dx: 1, dz: 0, fallen: true }],
    }, cam.pos);
    // Note: a smashed chair: legs and a back splintered on the floor, the seat cracked in two.
    S.add(
      box([3.3, 0, -3.1], [3.9, 0.04, -3.05], () => ({ c: C.WOOD })), box([3.5, 0, -3.3], [3.54, 0.04, -2.8], () => ({ c: C.WOOD_L })),
      box([3.7, 0, -3.5], [3.95, 0.05, -3.25], () => ({ c: C.WOOD_L })), box([4.1, 0, -3.1], [4.15, 0.45, -3.05], () => ({ c: C.WOOD })),
    );
    for (let k = 0; k < 40; k++) S.add(props.shard(3 + r.next() * 4.5, 0.002, -1.8 - r.next() * 5, 0.02 + r.next() * 0.05));
    S.add(props.stain(6.3, -3.4, 1.0, 0.7), props.bottle(5.2, 0, -3.0, C.GREEN_D), props.glass(4.6, 0, -2.4));
    // Note: soft light from the street windows fills the near side of the wreck, so the tipped table reads.
    S.lights.push({ pos: [3.0, 1.8, -5.0], power: 0.9, reach: 3.2 });
    // Note: item 395: with costs, coins lie on the bar and the barkeep holds out the bill in this same room.
    const { px: scene, info } = film(cam, S, { shafts: 2.2, motes: 110 }, r);
    px.over(scene);
    const man = folk(r, { hatless: true });
    actor(px, cam, S, info, { foot: [7.0, 0, -2.5], look: man, pose: 'jaw', view: 'side', dir: -1, sit: 'floor', hatless: true, light: { lx: -0.4, ly: -0.6, level: 0.9 } });
    if (coins) {
      barkeepBill(px, cam, S, info, r, [9.0, 0, -3.9], o.report || {});
      coinStacks(px, coins, 100, 97);
    }
  },

  // Note: item 388 panel 2: across the bar from the customer's side, coins in the foreground on the polished top, the barkeep behind it holding out the bill, the cracked mirror and the bottles behind him.
  bill(px, o, r) {
    const cam = camera3([6.5, 1.45, -4.7], 0.0, 0.1, 235, PW, PH);
    const n = Math.max(1, Math.min(12, o.coins ?? 5));
    const S = buildSaloon(o.mood || 'day', { noShadow: true, wrecked: true, crack: [2.4, -4.4], lamps: [[4.3, 3.15, -5.6], [7.95, 3.0, -3.4], [7.95, 3.0, -6.0]] }, cam.pos);
    const y = 1.12;
    for (let k = 0; k < n; k++) S.add(props.coins(7.62 + (k % 3) * 0.1, y, -4.1 - Math.floor(k / 3) * 0.2 - (k % 2) * 0.05, 1 + ((k * 7) % 3), k % 4 === 3 ? C.STONE_L : C.GOLD));
    const { px: scene, info } = film(cam, S, { shafts: 0.8 }, r);
    px.over(scene);
    barkeepBill(px, cam, S, info, r, [9.0, 0, -4.7]);
  },
};
