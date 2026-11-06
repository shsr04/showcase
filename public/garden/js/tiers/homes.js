// Note: tier kits for the HOMES group (hut, storehouse, hall, coop, pen); see /tmp/claude-plan-garden-tier-revision.md and the catalog.
import { TIER_KITS } from './registry.js';

// Note: roof tile colours per variant, picked to contrast with the base roof colours.
const TILE = [0xc45a40, 0x6f8f9b, 0xb8503a, 0xc9694a];
const FLOWER = [0xf0c64a, 0xe8688a];
// Note: darker tile colours for roofs that are already warm or light.
const SLATE = [0x8f4a3a, 0xa8742f, 0x4f6f94, 0x4e8068];

// Note: builds one mesh from a builder callback; lit meshes use the self-lit glow material.
function part(K, name, fn, lit = false) {
  const build = () => { const b = new K.B(); fn(b); return b.build(); };
  return lit ? K.lit(name, build) : K.mesh(name, build);
}

// Note: lantern post with a self-lit lamp; raw timber at T1, planed from T2, brass cap at T4.
function lantern(K, name, x, z, h = 0.56) {
  const { C, GOLD } = K;
  const wood = K.t >= 2 ? C.woodL : C.woodDD;
  part(K, name, (b) => {
    b.box([0.05, h, 0.05], [x, -0.02, z], wood, { sh: [0.85, 1.05] });
    b.box([0.15, 0.04, 0.15], [x, h + 0.08, z], K.t >= 4 ? GOLD : C.woodD);
  });
  part(K, `${name}Lamp`, (b) => b.box([0.1, 0.1, 0.1], [x, h - 0.04, z], C.lampWarm), true);
  K.lamp(x, h + 0.02, z);
}

// Note: washing line from a wall point to a pole; cloths hang from the line and sway about its axis.
function washing(K, name, pole, wall, y, cloths) {
  const { C } = K;
  const [px, pz] = pole;
  const [wx, wz] = wall;
  const h = y + 0.08;
  part(K, `${name}Pole`, (b) => {
    b.rod([px, -0.02, pz], [px, h, pz], 0.026, C.woodD);
    b.rod([px, y, pz], [wx, y, wz], 0.012, C.rope, { seg: 4 });
  });
  const dx = px - wx, dz = pz - wz;
  const len = Math.hypot(dx, dz);
  const m = part(K, `${name}Cloth`, (b) => {
    cloths.forEach(([w, ht, off, col]) => b.box([w, ht, 0.015], [off * len, -ht, 0], col));
  });
  m.position.set((px + wx) / 2, y, (pz + wz) / 2);
  m.rotation.order = 'YXZ';
  m.rotation.y = Math.atan2(-dz, dx);
  const ph = px * 3 + pz;
  K.sway((time, wind) => { m.rotation.x = Math.sin(time * 2.2 + ph) * (0.05 + wind * 0.25); });
}

// Note: string of lights along a polyline; dark rope plus warm bulbs (at [segment, t] pairs) in one lit mesh.
function strings(K, name, pts, bulbs) {
  part(K, name, (b) => {
    for (let i = 0; i + 1 < pts.length; i++) b.rod(pts[i], pts[i + 1], 0.009, K.C.woodDD, { seg: 4 });
    bulbs.forEach(([i, t]) => {
      const a = pts[i], c = pts[i + 1];
      b.oct(0.05, [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 0.04, a[2] + (c[2] - a[2]) * t], K.C.lampWarm);
    });
  }, true);
}

// Note: tile slabs laid over the upper part of a gable roof; params match the base gable() call.
function gableCap(b, { hw, h, y, d, z = 0, x0 = 0, col, f0 = 0.05, f1 = 0.6 }) {
  const t = 0.07, tc = 0.035;
  const a = Math.atan2(h, hw);
  const ls = Math.hypot(hw, h);
  const fc = (f0 + f1) / 2;
  for (const s of [-1, 1]) {
    const qx = x0 + s * hw * fc, qy = y + h - h * fc - t / 2;
    const off = t / 2 + tc / 2 - 0.005;
    b.box([(f1 - f0) * ls, tc, d + 0.04], [qx + ((s * h) / ls) * off, qy + (hw / ls) * off, z], col, { c: true, r: [0, 0, -s * a], sh: [0.9, 1.1], v: 0.05 });
  }
}

TIER_KITS.hut = (c, K) => {
  const { C, GOLD, t, v } = K;
  const lvl = c.lvl;
  // Note: hut centre; the base shifts left and back at level 2, the annex then sits on +x.
  const cx = K.left + 0.78;
  const cz = lvl >= 2 ? -0.05 : 0;
  const wallR = (y) => 0.56 - 0.04 * ((y - 0.05) / 0.6);
  const wallAt = (a, y, off = 0) => [cx + Math.sin(a) * (wallR(y) + off), cz + Math.cos(a) * (wallR(y) + off)];
  const S = K.spot('S');
  const LX = 0.66, LZ = 0.64;

  // T1: lantern post.
  if (t >= 1) lantern(K, 'lantern', LX, LZ);

  if (t >= 2) {
    // Note: lit window panes over the base windows, planed shutters beside them.
    part(K, 'pane', (b) => {
      for (const s of [-1, 1]) {
        const a = s * 0.95;
        b.box([0.15, 0.15, 0.06], [cx + Math.sin(a) * 0.525, 0.295, cz + Math.cos(a) * 0.525], C.lampWarm, { r: [0, a, 0] });
      }
    }, true);
    part(K, 'shutters', (b) => {
      for (const s of [-1, 1]) {
        const a = s * 0.95;
        const tx = Math.cos(a), tz = -Math.sin(a);
        // Note: one open shutter per window, on the outer side.
        b.box([0.05, 0.19, 0.03], [cx + Math.sin(a) * 0.55 + tx * s * 0.105, 0.28, cz + Math.cos(a) * 0.55 + tz * s * 0.105], C.woodL, { r: [0, a, 0], sh: [0.9, 1.05] });
      }
    });
    // Note: cloth awning over the door; at level 1+ the porch roof carries a cloth valance instead.
    part(K, 'awning', (b) => {
      const col = K.FLAG_COLS[v];
      if (lvl >= 1) b.box([0.72, 0.1, 0.025], [cx, 0.43, cz + 0.945], col, { v: 0.05 });
      else b.box([0.58, 0.03, 0.34], [cx, 0.52, cz + 0.67], col, { c: true, r: [0.4, 0, 0], v: 0.05 });
    });
    // Note: washing line on the S slot, tied to the wall beside the left window.
    const w0 = wallAt(-0.9, 0.58);
    washing(K, 'wash', [S.x, 1.0], w0, 0.58, [[0.22, 0.28, -0.22, K.FLAG_COLS[(v + 2) % 4]], [0.16, 0.22, 0.18, K.FLAG_COLS[(v + 1) % 4]]]);
  }

  if (t >= 3) {
    // Note: stone terrace in front of the door carries the bench and the planters.
    part(K, 'terrace', (b) => b.box([1.9, 0.1, 0.64], [0, -0.04, 0.8], C.stoneL, { v: 0.05, sh: [0.9, 1.05] }));
    if (lvl < 2) {
      part(K, 'chimney', (b) => {
        b.box([0.17, 0.6, 0.17], [cx + 0.26, 0.64, cz - 0.34], C.stone, { sh: [0.9, 1.05] });
      });
      K.plume(cx + 0.26, 1.3, cz - 0.34);
    }
    // Note: porch lamp, wall mounted at level 0 and hung from the porch roof otherwise.
    part(K, 'porchLamp', (b) => {
      if (lvl >= 1) {
        b.box([0.08, 0.1, 0.08], [cx + 0.2, 0.5, cz + 0.62], C.lampWarm);
      } else b.box([0.08, 0.11, 0.08], [cx + 0.215, 0.3, cz + 0.53], C.lampWarm);
    }, true);
    K.lamp(cx + 0.2, 0.42, cz + 0.6);
    const bs = K.spot('C').x;
    part(K, 'bench', (b) => {
      b.box([0.58, 0.05, 0.2], [bs, 0.21, 1.0], C.woodL, { sh: [0.9, 1.05] });
      b.box([0.42, 0.15, 0.16], [bs, 0.06, 1.0], C.woodD);
    });
  }

  if (t >= 4) {
    // Note: tile cap on the upper roof, a few units outside the roof surface; brass vane on the finial.
    part(K, 'tiles', (b) => b.cone(0.592, 0.51, 9, [cx, 0.8, cz], TILE[v], { sh: [0.9, 1.1], v: 0.05 }));
    const vane = part(K, 'vane', (b) => {
      b.rod([0, 0, 0], [0, 0.32, 0], 0.012, GOLD);
      b.box([0.02, 0.08, 0.26], [0, 0.26, 0], GOLD);
    });
    vane.position.set(cx, 1.3, cz);
    K.sway((time, wind) => { vane.rotation.y = Math.sin(time * 0.6 + v) * 0.5 + wind * 0.9; });
    // Note: lean-to woodshed on the left wall; shorter at level 2, where the hut sits closer to the edge.
    const len = lvl >= 2 ? 0.38 : 0.5;
    part(K, 'leanto', (b) => {
      const x0 = cx - 0.45;
      b.box([len, 0.04, 0.54], [x0 - len / 2, 0.47, cz - 0.15], C.woodL, { c: true, r: [0, 0, 0.2], sh: [0.9, 1.05] });
      for (const dz of [-0.4, 0.1]) b.rod([x0 - len + 0.02, -0.02, cz + dz], [x0 - len + 0.02, 0.42, cz + dz], 0.026, C.woodD);
    });
    // Note: planters flank the door on the terrace.
    part(K, 'planters', (b) => {
      for (const s of [-1, 1]) {
        b.box([0.2, 0.1, 0.2], [cx + s * 0.26, 0.06, cz + 0.66], C.woodD);
        b.oct(0.07, [cx + s * 0.26, 0.2, cz + 0.66], FLOWER[s > 0 ? 1 : 0]);
      }
    });
    // Note: glowing sign, a lit board on the porch valance, or hung from the awning edge at level 0.
    part(K, 'signGlow', (b) => {
      if (lvl >= 1) b.box([0.34, 0.08, 0.03], [cx, 0.44, cz + 0.96], C.lampWarm);
      else b.box([0.3, 0.1, 0.03], [cx, 0.36, cz + 0.83], C.lampWarm);
    }, true);
    strings(K, 'stringA', [[cx, 1.28, cz], [LX, 0.66, LZ]], [[0, 0.55]]);
    strings(K, 'stringB', [[cx, 1.28, cz], [S.x, 0.64, 1.0]], [[0, 0.55]]);
    K.lamp(cx + 0.3, 0.9, cz + 0.4);
  }
};

// Note: short bench, a seat plank on a base block; z is the seat centre.
function bench(K, name, x, z, w = 0.58, y0 = 0.04) {
  const { C } = K;
  part(K, name, (b) => {
    b.box([w, 0.05, 0.2], [x, 0.21, z], C.woodL, { sh: [0.9, 1.05] });
    b.box([w * 0.72, 0.23 - y0, 0.16], [x, y0, z], C.woodD);
  });
}

// Note: sloped cloth shade, high edge at (y0,z0), low edge at (y1,z1), held by two posts at the low edge.
function shade(K, name, x, w, y0, z0, y1, z1, col) {
  const dz = z1 - z0, dy = y0 - y1;
  const len = Math.hypot(dz, dy);
  const ang = Math.atan2(dy, dz);
  part(K, name, (b) => {
    b.box([w, 0.03, len], [x, (y0 + y1) / 2, (z0 + z1) / 2], col, { c: true, r: [ang, 0, 0], v: 0.05 });
    for (const s of [-1, 1]) b.rod([x + s * (w / 2 - 0.04), -0.02, z1], [x + s * (w / 2 - 0.04), y1 + 0.02, z1], 0.022, K.C.woodD, { seg: 4 });
  });
}

// Note: swinging brass vane on a ridge point; the arrow turns with the wind.
function vane(K, x, y, z, ph, tall = 0.32) {
  const m = part(K, 'vane', (b) => {
    b.rod([0, 0, 0], [0, tall, 0], 0.012, K.GOLD);
    b.box([0.02, 0.08, 0.26], [0, tall - 0.06, 0], K.GOLD);
  });
  m.position.set(x, y, z);
  K.sway((time, wind) => { m.rotation.y = Math.sin(time * 0.6 + ph) * 0.5 + wind * 0.9; });
}

// Note: flower planters, a box and a blossom each, resting on the surface at y.
function planters(K, xs, z, y = 0.04) {
  const { C } = K;
  part(K, 'planters', (b) => {
    xs.forEach((x, i) => {
      b.box([0.2, 0.12, 0.2], [x, y, z], C.woodD);
      b.oct(0.075, [x, y + 0.2, z], FLOWER[i % 2]);
    });
  });
}

TIER_KITS.storehouse = (c, K) => {
  const { C, GOLD, t, v } = K;
  const L = K.left, R = K.right, F = K.front;
  const S = K.spot('S'), Cs = K.spot('C'), W = K.spot('W');
  // Note: base geometry, wall faces at |x| 0.9, front posts at z 0.76, gable fill face at z 0.875.
  const wx = 0.9, pz = 0.76, ridgeY = 1.36;
  const lx = R - 0.03, lz = F + 0.06;

  if (t >= 1) lantern(K, 'lantern', lx, lz);

  if (t >= 2) {
    part(K, 'bands', (b) => {
      for (const s of [-1, 1]) b.box([0.04, 0.07, 1.64], [s * (wx + 0.01), 0.38, 0], C.woodL, { sh: [0.9, 1.05] });
    });
    // Note: lit hatch in the front gable, under the hoist beam.
    part(K, 'hatchPane', (b) => b.box([0.22, 0.16, 0.07], [0, 0.92, 0.865], C.lampWarm), true);
    part(K, 'hoist', (b) => b.box([0.07, 0.07, 0.6], [0, 1.13, 1.06], C.woodL, { sh: [0.9, 1.05] }));
    const load = part(K, 'hoistLoad', (b) => {
      b.rod([0, 0, 0], [0, -0.2, 0], 0.01, C.rope, { seg: 4 });
      b.box([0.18, 0.14, 0.18], [0, -0.34, 0], C.wood, { sh: [0.9, 1.05] });
    });
    load.position.set(0, 1.13, 1.3);
    K.sway((time, wind) => { load.rotation.x = Math.sin(time * 1.3) * (0.06 + wind * 0.25); });
    shade(K, 'shade', S.x, 0.7, 0.8, 0.94, 0.58, 1.3, K.FLAG_COLS[v]);
  }

  if (t >= 3) {
    part(K, 'terrace', (b) => b.box([1.9, 0.1, 0.46], [0, -0.04, 1.06], C.stoneL, { v: 0.05, sh: [0.9, 1.05] }));
    part(K, 'porchLamp', (b) => b.box([0.1, 0.12, 0.1], [0.72, 0.68, 0.76], C.lampWarm), true);
    K.lamp(0.72, 0.7, 0.85);
    bench(K, 'bench', Cs.x, 1.1, 0.62);
  }

  if (t >= 4) {
    part(K, 'tiles', (b) => gableCap(b, { hw: 0.95, h: 0.5, y: 0.86, d: 1.9, col: SLATE[v] }));
    vane(K, 0, ridgeY, -0.55, v);
    // Note: rack lean-to on the right wall, roof slopes outward, plank stack beneath.
    part(K, 'leanto', (b) => {
      b.box([0.405, 0.04, 0.9], [1.05, 0.6, -0.15], C.woodL, { c: true, r: [0, 0, -0.574], sh: [0.9, 1.05] });
      for (const z of [-0.55, 0.25]) b.rod([1.2, -0.02, z], [1.2, 0.5, z], 0.024, C.woodD, { seg: 4 });
      b.box([0.28, 0.1, 0.7], [1.04, 0, -0.15], C.woodL, { v: 0.06 });
    });
    planters(K, [W.x - 0.3, W.x + 0.3], 1.14, 0.04);
    part(K, 'signGlow', (b) => b.box([0.36, 0.2, 0.04], [0.35, 0.6, 0.79], C.lampWarm), true);
    strings(K, 'string', [[-0.92, 0.58, 1.3], [0, 0.52, 1.28], [lx, 0.66, lz]], [[0, 0.5]]);
    K.lamp(0, 0.6, 1.2);
  }
};

TIER_KITS.hall = (c, K) => {
  const { C, GOLD, t, v } = K;
  const S = K.spot('S'), Cs = K.spot('C'), W = K.spot('W');
  // Note: base geometry, posts at |x|,|z| 1.3 (0.14 wide), beams at y 1.0..1.08, rafters to y 1.15, plinth edge at 1.45.
  const P = 1.3, bz = 1.37;

  // T1: two lantern posts beside the front steps, a lit lamp each.
  if (t >= 1) {
    const wood = t >= 2 ? C.woodL : C.woodDD;
    for (const s of [-1, 1]) {
      const x = s * 1.42, z = 1.46;
      part(K, s < 0 ? 'lanternL' : 'lanternR', (b) => b.box([0.05, 0.6, 0.05], [x, -0.02, z], wood, { sh: [0.85, 1.05] }));
      part(K, s < 0 ? 'lanternLampL' : 'lanternLampR', (b) => b.box([0.1, 0.1, 0.1], [x, 0.58, z], C.lampWarm), true);
    }
    K.lamp(-1.42, 0.62, 1.46);
    K.lamp(1.42, 0.62, 1.46);
  }

  if (t >= 2) {
    // Note: cloth banner on the front beam, lit lanterns hung under the front beam.
    part(K, 'banner', (b) => b.box([0.46, 0.5, 0.03], [0, 0.52, bz - 0.04], K.FLAG_COLS[v], { v: 0.05 }));
    part(K, 'hangPane', (b) => {
      for (const s of [-1, 1]) b.box([0.1, 0.14, 0.1], [s * 0.78, 0.88, 1.3], C.lampWarm);
    }, true);
    // Note: drying line from the front-left post to a pole; cloths sway.
    washing(K, 'wash', [-0.6, 1.6], [-P, bz - 0.02], 0.75, [[0.3, 0.28, -0.1, K.FLAG_COLS[(v + 1) % 4]]]);
  }

  if (t >= 3) {
    part(K, 'steps', (b) => b.box([1.7, 0.1, 0.5], [0, -0.02, 1.62], C.stoneL, { v: 0.05, sh: [0.9, 1.05] }));
    part(K, 'porchLamp', (b) => {
      for (const s of [-1, 1]) b.box([0.08, 0.1, 0.08], [s * 1.1, 0.9, 1.3], C.lampWarm);
    }, true);
    K.lamp(-1.1, 0.92, 1.35);
    K.lamp(1.1, 0.92, 1.35);
    bench(K, 'bench', 1.0, 1.7, 0.9);
    // Note: stone chimney at the back right, through the cloth strip; the hearth smoke rises from it.
    part(K, 'chimney', (b) => b.box([0.24, 1.4, 0.24], [1.1, 0.05, -1.15], C.stone, { sh: [0.9, 1.05] }));
    K.plume(1.1, 1.5, -1.15);
  }

  if (t >= 4) {
    // Note: tile strips over the front and side rafters, the middle stays open for the table.
    part(K, 'tiles', (b) => {
      b.box([3.1, 0.05, 0.42], [0, 1.15, 1.29], TILE[v], { sh: [0.92, 1.06], v: 0.05 });
      for (const s of [-1, 1]) b.box([0.42, 0.05, 2.0], [s * 1.29, 1.15, 0.0], TILE[v], { sh: [0.92, 1.06], v: 0.05 });
    });
    // Note: brass bell cupola on the back cloth strip; the bell swings.
    part(K, 'cupola', (b) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * 0.15, 1.16, -1.15 + sz * 0.15], [sx * 0.15, 1.5, -1.15 + sz * 0.15], 0.018, C.woodL, { seg: 4 });
      b.cone(0.3, 0.22, 5, [0, 1.5, -1.15], TILE[v]);
    });
    const bell = part(K, 'bell', (b) => b.cone(0.09, 0.16, 5, [0, -0.16, 0], GOLD));
    bell.position.set(0, 1.52, -1.15);
    K.sway((time, wind) => { bell.rotation.z = Math.sin(time * 1.7) * (0.1 + wind * 0.3); });
    planters(K, [W.x - 0.4, W.x + 0.4], 1.76, 0.08);
    part(K, 'signGlow', (b) => b.box([0.6, 0.18, 0.04], [0, 1.17, 1.48], C.lampWarm), true);
    strings(K, 'string', [[-P, 0.98, 1.36], [0, 0.8, 1.45], [P, 0.98, 1.36]], [[0, 0.5]]);
    K.lamp(0, 0.85, 1.55);
  }
};

TIER_KITS.coop = (c, K) => {
  const { C, t, v } = K;
  const S = K.spot('S'), Cs = K.spot('C'), W = K.spot('W');
  // Note: base geometry, coop box x -0.825..0.325, front face z -0.075, wall top y 0.65, ridge y 1.02 at z -0.5.
  const lx = K.right + 0.03, lz = 0.98;

  if (t >= 1) lantern(K, 'lantern', lx, lz);

  if (t >= 2) {
    part(K, 'trim', (b) => b.box([1.19, 0.06, 0.04], [-0.25, 0.58, -0.07], C.woodL, { sh: [0.9, 1.05] }));
    part(K, 'pane', (b) => b.box([0.12, 0.12, 0.05], [0.24, 0.3, -0.07], C.lampWarm), true);
    // Note: cloth awning from the right wall over the nest box.
    part(K, 'awning', (b) => b.box([0.56, 0.03, 0.46], [0.575, 0.45, -0.5], K.FLAG_COLS[v], { c: true, r: [0, 0, -0.18], v: 0.05 }));
    // Note: hay shelter leaning on the front-left fence.
    shade(K, 'shade', S.x, 0.6, 0.46, 0.82, 0.36, 1.2, K.FLAG_COLS[(v + 1) % 4]);
    part(K, 'hay', (b) => b.box([0.36, 0.18, 0.2], [S.x - 0.08, 0, 1.0], 0xe6c458, { sh: [0.92, 1.05] }));
  }

  if (t >= 3) {
    part(K, 'footing', (b) => {
      b.box([1.23, 0.14, 0.05], [-0.25, 0.05, -0.06], C.stoneL, { v: 0.05 });
      b.box([0.05, 0.14, 0.85], [-0.83, 0.05, -0.5], C.stoneL, { v: 0.05 });
    });
    part(K, 'doorstep', (b) => b.box([0.7, 0.1, 0.35], [-0.05, -0.02, 0.95], C.stoneL, { v: 0.05 }));
    part(K, 'porchLamp', (b) => b.box([0.08, 0.1, 0.08], [0.27, 0.5, -0.03], C.lampWarm), true);
    K.lamp(0.27, 0.52, 0.05);
    bench(K, 'bench', Cs.x + 0.05, 1.25, 0.56, 0);
  }

  if (t >= 4) {
    part(K, 'tiles', (b) => gableCap(b, { hw: 0.68, h: 0.36, y: 0.66, d: 0.98, z: -0.5, col: SLATE[v] }));
    vane(K, 0, 1.0, -0.5, v, 0.22);
    // Note: covered run over the ramp, roof slopes down to two front posts.
    shade(K, 'run', -0.25, 0.78, 0.56, -0.05, 0.4, 0.45, C.wood);
    planters(K, [W.x - 0.3, W.x + 0.3], 0.98, 0.0);
    part(K, 'signGlow', (b) => b.box([0.4, 0.12, 0.04], [-0.25, 0.28, 0.46], C.lampWarm), true);
    strings(K, 'string', [[0.1, 0.42, 0.45], [lx, 0.66, lz]], [[0, 0.35], [0, 0.7]]);
    K.lamp(-0.25, 0.3, 0.6);
  }
};

TIER_KITS.pen = (c, K) => {
  const { C, GOLD, t, v } = K;
  const S = K.spot('S'), Cs = K.spot('C'), W = K.spot('W');
  // Note: base geometry, fence line at |x|,|z| 1.4, gate posts at x +-0.4 (0.07 wide, 0.55 high), lintel y 0.5..0.55.
  const gz = 1.4, lx = 0.6, lz = 1.5;

  if (t >= 1) lantern(K, 'lantern', lx, lz, 0.62);

  if (t >= 2) {
    // Note: planed rails on the gate, a lit lamp on the feed shade edge.
    part(K, 'rails', (b) => {
      b.box([0.9, 0.07, 0.04], [0, 0.48, gz + 0.03], C.woodL, { sh: [0.9, 1.05] });
      b.box([0.8, 0.05, 0.03], [0, 0.28, gz], C.woodL, { sh: [0.9, 1.05] });
    });
    shade(K, 'shade', S.x, 0.7, 0.5, 1.38, 0.38, 1.85, K.FLAG_COLS[v]);
    part(K, 'feed', (b) => b.box([0.4, 0.18, 0.2], [S.x, 0, 1.62], 0xe6c458, { sh: [0.92, 1.05] }));
    part(K, 'lampPane', (b) => b.box([0.08, 0.1, 0.08], [S.x, 0.29, 1.86], C.lampWarm), true);
  }

  if (t >= 3) {
    // Note: stone columns cover the wooden gate posts, a lit lamp on each cap.
    part(K, 'gateStone', (b) => {
      for (const s of [-1, 1]) {
        b.box([0.15, 0.55, 0.15], [s * 0.4, -0.02, gz], C.stoneL, { v: 0.05, sh: [0.9, 1.05] });
        b.box([0.2, 0.05, 0.2], [s * 0.4, 0.53, gz], C.stone);
      }
    });
    part(K, 'porchLamp', (b) => {
      for (const s of [-1, 1]) b.box([0.08, 0.1, 0.08], [s * 0.4, 0.58, gz], C.lampWarm);
    }, true);
    K.lamp(-0.4, 0.62, gz);
    K.lamp(0.4, 0.62, gz);
    // Note: stone trough inside, against the right fence, a water strip on top.
    part(K, 'trough', (b) => {
      b.box([0.22, 0.16, 0.7], [1.25, 0, 0.2], C.stoneL, { v: 0.05 });
      b.box([0.14, 0.03, 0.58], [1.25, 0.15, 0.2], 0x6f9fc9);
    });
    bench(K, 'bench', Cs.x + 0.05, 1.54, 0.62, 0);
  }

  if (t >= 4) {
    // Note: arch over the gate stands on the stone caps; the brass sign hangs from its beam.
    part(K, 'arch', (b) => {
      for (const s of [-1, 1]) b.rod([s * 0.47, 0.56, gz], [s * 0.47, 0.94, gz], 0.022, GOLD, { seg: 4 });
      b.box([1.04, 0.06, 0.07], [0, 0.92, gz], C.woodDD);
    });
    const sign = part(K, 'signGlow', (b) => b.box([0.5, 0.17, 0.04], [0, -0.17, 0], C.lampWarm), true);
    sign.position.set(0, 0.92, gz);
    K.sway((time, wind) => { sign.rotation.z = Math.sin(time * 1.4 + v) * (0.04 + wind * 0.2); });
    planters(K, [W.x - 0.45, W.x + 0.45], 1.64, 0.0);
    strings(K, 'stringL', [[-0.5, 0.92, gz + 0.02], [-1.4, 0.46, gz + 0.02]], [[0, 0.5]]);
    strings(K, 'stringR', [[0.5, 0.92, gz + 0.02], [1.4, 0.46, gz + 0.02]], [[0, 0.5]]);
    K.lamp(0, 0.8, 1.6);
  }
};
