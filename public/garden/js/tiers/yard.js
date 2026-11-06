// Note: tier kits for the YARD group (dock, pad, charcoal, ropewalk); see /tmp/claude-plan-garden-tier-catalog.md.
import { TIER_KITS } from './registry.js';

const PI = Math.PI;

// Note: rotate mesh m by angle a about axis ax through pivot p; geometry stays in building space, so a = 0 leaves it untouched.
function swing(m, p, ax, a) {
  const c = Math.cos(a); const s = Math.sin(a);
  const [x, y, z] = p;
  m.rotation.set(0, 0, 0);
  m.rotation[ax] = a;
  let rx = x; let ry = y; let rz = z;
  if (ax === 'x') { ry = y * c - z * s; rz = y * s + z * c; }
  else if (ax === 'y') { rx = x * c + z * s; rz = -x * s + z * c; }
  else { rx = x * c - y * s; ry = x * s + y * c; }
  m.position.set(x - rx, y - ry, z - rz);
}

// Note: box lamp with a cap; the glass box is built apart (K.lit), this is the roof and the arm.
function lampCap(b, K, x, y, z) {
  b.box([0.12, 0.03, 0.12], [x, y, z], K.C.woodDD);
}

// Note: bench with a back on the building side; 'z' = back at low z, 'x' = back at high x. u runs along the seat.
function bench(b, K, cx, cz, len, dep, sy, dir) {
  const C = K.C;
  const put = (w, h, d, u, y, v, col) => {
    if (dir === 'x') b.box([d, h, w], [cx - v, y, cz + u], col);
    else b.box([w, h, d], [cx + u, y, cz + v], col);
  };
  put(len, 0.04, dep, 0, sy, 0, C.woodL);
  put(len, 0.14, 0.04, 0, sy + 0.04, -dep / 2 + 0.02, C.wood);
  for (const s of [-1, 1]) put(0.04, sy + 0.02, dep * 0.8, s * (len / 2 - 0.04), 0, 0, C.woodD);
}

// Note: planter box with a bush and a flower (28 tris).
function planter(b, K, x, y, z, w, d, flower) {
  b.box([w, 0.08, d], [x, y, z], K.C.woodD);
  b.oct(0.065, [x - w * 0.15, y + 0.1, z], K.C.mossD);
  b.oct(0.032, [x + w * 0.2, y + 0.14, z], flower);
}

const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];

// Note: DOCK. Local +z is the water side; the deck runs from z = -0.45 (land) to 1.53 (tip), deck top y = 0.19, posts at x = +-0.36.
TIER_KITS.dock = (c, K) => {
  const { C, GOLD, t } = K;
  const cloth = K.FLAG_COLS[c.v];
  // T1: lantern on the +x tip post.
  if (t >= 1) {
    c.mesh('ln', () => {
      const b = new K.B();
      b.rod([0.36, 0.46, 1.45], [0.36, 0.84, 1.45], 0.024, C.woodDD);
      b.rod([0.36, 0.82, 1.45], [0.25, 0.82, 1.45], 0.016, C.woodD);
      lampCap(b, K, 0.25, 0.83, 1.45);
      return b.build();
    });
    K.lit('lm', () => new K.B().box([0.08, 0.11, 0.08], [0.25, 0.72, 1.45], C.lampWarm).build());
    K.lamp(0.25, 0.77, 1.45);
  }
  // T2: cloth sail on two poles over the S slot (x = -0.3).
  if (t >= 2) {
    c.mesh('shade', () => {
      const b = new K.B();
      b.rod([-0.36, 0.36, 0.55], [-0.36, 1.15, 0.55], 0.024, C.woodD);
      b.rod([-0.36, 0.47, 1.45], [-0.36, 1.0, 1.45], 0.024, C.woodD);
      b.box([0.5, 0.025, 1.04], [-0.15, 1.075, 1.0], cloth, { c: true, r: [0.17, 0, 0] });
      return b.build();
    }, K.MATS.vertexDouble);
  }
  // T3: stone landing, two bollards, bench on the +x rail (C slot), lamp on the land post.
  if (t >= 3) {
    c.mesh('stone', () => {
      const b = new K.B();
      b.box([0.9, 0.2, 0.24], [0, -0.03, -0.39], C.stoneD, { sh: [0.85, 1] });
      for (const s of [-1, 1]) b.cyl(0.05, 0.045, 0.14, 5, [s * 0.2, 0.17, 1.38], C.stoneL);
      return b.build();
    });
    c.mesh('bench', () => {
      const b = new K.B();
      bench(b, K, 0.255, 1.0, 0.42, 0.17, 0.31, 'x');
      return b.build();
    });
    c.mesh('ln3', () => {
      const b = new K.B();
      lampCap(b, K, -0.36, 0.46, -0.35);
      return b.build();
    });
    K.lit('lm3', () => new K.B().box([0.09, 0.1, 0.09], [-0.36, 0.36, -0.35], C.lampWarm).build());
    K.lamp(-0.36, 0.41, -0.35);
  }
  // T4: brass bell, string lights, sign, planters.
  if (t >= 4) {
    c.mesh('bell', () => {
      const b = new K.B();
      b.rod([0.36, 0.79, 1.45], [0.45, 0.79, 1.45], 0.016, C.woodD);
      b.cyl(0.045, 0.026, 0.075, 5, [0.45, 0.72, 1.45], GOLD);
      return b.build();
    });
    const P0 = [0.25, 0.86, 1.45]; const P1 = [-0.05, 0.8, 1.45]; const P2 = [-0.36, 1.0, 1.45];
    c.mesh('strand', () => {
      const b = new K.B();
      b.rod(P0, P1, 0.008, C.dark, { seg: 3 });
      b.rod(P1, P2, 0.008, C.dark, { seg: 3 });
      return b.build();
    });
    const bulbs = K.lit('bulbs', () => {
      const b = new K.B();
      const pts = [lerp3(P0, P1, 0.4), P1, lerp3(P1, P2, 0.6)];
      pts.forEach((p, i) => b.oct(0.03, [p[0], p[1] - 0.02, p[2]], i % 2 ? C.lampWarm : 0xffc27a));
      return b.build();
    });
    K.sway((time, wind) => swing(bulbs, P0, 'z', Math.sin(time * 2.1 + c.v) * (0.01 + wind * 0.03)));
    c.mesh('signarm', () => new K.B().rod([-0.36, 1.0, 0.55], [-0.12, 1.0, 0.55], 0.016, C.woodD).build());
    K.lit('sign', () => new K.B().box([0.2, 0.11, 0.02], [-0.2, 0.9, 0.55], 0xffe3a0).build());
    c.mesh('plant', () => {
      const b = new K.B();
      planter(b, K, -0.15, 0.18, 0.66, 0.14, 0.1, 0xe8688a);
      planter(b, K, 0.15, 0.18, 0.66, 0.14, 0.1, 0xf0c64a);
      return b.build();
    });
  }
};

// Note: PAD. Deck is 1.9 square (half 0.95, top y 0.17), banner posts at +-0.9 up to y 0.84, door side +z.
TIER_KITS.pad = (c, K) => {
  const { C, GOLD, t } = K;
  const cloth = K.FLAG_COLS[c.v];
  const arm = (b, x, z, dx, dz) => {
    b.rod([x, 0.78, z], [x + dx, 0.78, z + dz], 0.016, C.woodD);
    lampCap(b, K, x + dx, 0.79, z + dz);
  };
  // T1: lantern arm off the front-right post.
  if (t >= 1) {
    c.mesh('ln', () => { const b = new K.B(); arm(b, 0.9, 0.9, 0, 0.16); return b.build(); });
    K.lit('lm', () => new K.B().box([0.09, 0.1, 0.09], [0.9, 0.69, 1.06], C.lampWarm).build());
    K.lamp(0.9, 0.74, 1.06);
  }
  // T2: wind sock on the back-left post, drying rack with sail cloth at the S slot (front-left).
  if (t >= 2) {
    c.mesh('sockpole', () => new K.B().rod([-0.9, 0.8, -0.9], [-0.9, 1.25, -0.9], 0.02, C.woodDD).build());
    const sock = c.mesh('sock', () => {
      const b = new K.B();
      b.cyl(0.075, 0.03, 0.3, 6, [-0.88, 1.2, -0.9], 0xf2efe6, {
        r: [0, 0, -PI / 2], open: true, v: 0, cf: (x) => (Math.floor((x + 0.9) / 0.075) % 2 ? 0xf2efe6 : 0xe8743c),
      });
      return b.build();
    }, K.MATS.vertexDouble);
    c.mesh('rack', () => {
      const b = new K.B();
      b.rod([-0.35, 0.15, 0.9], [-0.35, 0.56, 0.9], 0.022, C.woodD);
      b.rod([-0.9, 0.5, 0.9], [-0.35, 0.5, 0.9], 0.018, C.woodD);
      return b.build();
    });
    const wash = c.mesh('wash', () => {
      const b = new K.B();
      b.box([0.2, 0.2, 0.012], [-0.78, 0.3, 0.9], cloth, { v: 0.05 });
      b.box([0.2, 0.18, 0.012], [-0.52, 0.32, 0.9], 0xf2efe6, { v: 0.05 });
      return b.build();
    }, K.MATS.vertexDouble);
    K.sway((time, wind) => {
      swing(sock, [-0.9, 1.2, -0.9], 'y', Math.sin(time * 3 + c.v) * (0.15 + wind * 0.5) - 0.1);
      swing(wash, [0, 0.5, 0.9], 'x', Math.sin(time * 2.2 + c.v) * (0.06 + wind * 0.2));
    });
  }
  // T3: stone curb ring, bench at the C slot, lamp on the front-left post.
  if (t >= 3) {
    c.mesh('curb', () => {
      const b = new K.B();
      b.box([2.1, 0.12, 0.12], [0, 0, 0.985], C.stoneL);
      b.box([2.1, 0.12, 0.12], [0, 0, -0.985], C.stoneD);
      b.box([0.12, 0.12, 1.86], [-0.985, 0, 0], C.stoneD);
      b.box([0.12, 0.12, 1.86], [0.985, 0, 0], C.stoneL);
      return b.build();
    });
    c.mesh('bench', () => {
      const b = new K.B();
      bench(b, K, 0.6, 1.15, 0.5, 0.22, 0.19, 'z');
      return b.build();
    });
    c.mesh('ln3', () => { const b = new K.B(); arm(b, -0.9, 0.9, 0, 0.16); return b.build(); });
    K.lit('lm3', () => new K.B().box([0.09, 0.1, 0.09], [-0.9, 0.69, 1.06], C.lampWarm).build());
    K.lamp(-0.9, 0.74, 1.06);
  }
  // T4: brass ring that glows at night, planters at the W slot.
  if (t >= 4) {
    K.lit('ringbulb', () => new K.B().torus(0.78, 0.028, [0, 0.2, 0], GOLD, { r: [PI / 2, 0, 0], rs: 3, ts: 12, v: 0 }).build());
    c.mesh('plant', () => {
      const b = new K.B();
      planter(b, K, -0.3, 0, 1.1, 0.26, 0.18, 0xe8688a);
      planter(b, K, 0.3, 0, 1.1, 0.26, 0.18, 0xf0c64a);
      return b.build();
    });
  }
};

// Note: CHARCOAL. Round mound r 0.46, stack up to y 0.68, 1x1 cell. Props sit on the ground in front.
TIER_KITS.charcoal = (c, K) => {
  const { C, GOLD, t } = K;
  const cloth = K.FLAG_COLS[c.v];
  // T1: lantern post at the front-right.
  if (t >= 1) {
    c.mesh('ln', () => {
      const b = new K.B();
      b.rod([0.4, 0, 0.28], [0.4, 0.62, 0.28], 0.022, C.woodDD);
      lampCap(b, K, 0.4, 0.74, 0.28);
      return b.build();
    });
    K.lit('lm', () => new K.B().box([0.09, 0.1, 0.09], [0.4, 0.64, 0.28], C.lampWarm).build());
    K.lamp(0.4, 0.69, 0.28);
  }
  // T2: cloth cover sloping from the mound over a wood pile at the S slot.
  if (t >= 2) {
    c.mesh('cover', () => {
      const b = new K.B();
      b.box([0.34, 0.2, 0.26], [-0.3, 0, 0.58], C.woodD, { sh: [0.9, 1.05] });
      for (const s of [-1, 1]) b.rod([-0.3 + s * 0.17, 0, 0.8], [-0.3 + s * 0.17, 0.33, 0.8], 0.02, C.woodDD);
      b.box([0.44, 0.02, 0.44], [-0.3, 0.36, 0.62], cloth, { c: true, r: [0.245, 0, 0] });
      return b.build();
    });
  }
  // T3: stone ring, bench at the C slot, lamp on a stone pillar.
  if (t >= 3) {
    c.mesh('ring', () => new K.B().torus(0.48, 0.05, [0, 0.05, 0], C.stoneL, { r: [PI / 2, 0, 0], rs: 3, ts: 10 }).build());
    c.mesh('bench', () => {
      const b = new K.B();
      bench(b, K, 0.3, 0.62, 0.4, 0.2, 0.17, 'z');
      return b.build();
    });
    c.mesh('pillar', () => {
      const b = new K.B();
      b.box([0.08, 0.34, 0.08], [-0.4, 0, -0.28], C.stoneD);
      lampCap(b, K, -0.4, 0.44, -0.28);
      return b.build();
    });
    K.lit('lm3', () => new K.B().box([0.09, 0.1, 0.09], [-0.4, 0.33, -0.28], C.lampWarm).build());
    K.lamp(-0.4, 0.38, -0.28);
  }
  // T4: brass chimney cap and band, string lights to the lantern, planters at the W slot.
  if (t >= 4) {
    c.mesh('brass', () => {
      const b = new K.B();
      b.cyl(0.12, 0.05, 0.07, 6, [0, 0.62, 0], GOLD);
      b.cyl(0.095, 0.09, 0.06, 6, [0, 0.5, 0], GOLD, { open: true });
      return b.build();
    });
    const P0 = [0.4, 0.76, 0.28]; const P1 = [0.07, 0.56, 0.0];
    c.mesh('strand', () => new K.B().rod(P0, P1, 0.008, C.dark, { seg: 3 }).build());
    K.lit('bulbs', () => {
      const b = new K.B();
      for (const s of [0.25, 0.5, 0.75]) {
        const p = lerp3(P0, P1, s);
        b.oct(0.028, [p[0], p[1] - 0.04 * Math.sin(s * PI), p[2]], s === 0.5 ? C.lampWarm : 0xffc27a);
      }
      return b.build();
    });
    c.mesh('plant', () => {
      const b = new K.B();
      planter(b, K, -0.1, 0, 0.58, 0.14, 0.1, 0xe8688a);
      planter(b, K, 0.1, 0, 0.58, 0.14, 0.1, 0xf0c64a);
      return b.build();
    });
  }
};

// Note: ROPEWALK. Two frames at z = +-0.4 (posts x = +-0.2, top y 0.5), wheel at the front frame, 1x1 cell.
TIER_KITS.ropewalk = (c, K) => {
  const { C, GOLD, t } = K;
  const cloth = K.FLAG_COLS[c.v];
  // T1: lantern on the front-right frame post.
  if (t >= 1) {
    c.mesh('ln', () => {
      const b = new K.B();
      b.rod([0.2, 0.46, 0.4], [0.2, 0.72, 0.4], 0.02, C.woodDD);
      lampCap(b, K, 0.2, 0.74, 0.4);
      return b.build();
    });
    K.lit('lm', () => new K.B().box([0.09, 0.1, 0.09], [0.2, 0.64, 0.4], C.lampWarm).build());
    K.lamp(0.2, 0.69, 0.4);
  }
  // T2: rope hanks on a rack leaning off the front-left post (S slot), pennant on the back-left post.
  if (t >= 2) {
    c.mesh('rack', () => {
      const b = new K.B();
      b.rod([-0.4, 0, 0.62], [-0.4, 0.55, 0.62], 0.02, C.woodD);
      b.beam([-0.4, 0.52, 0.62], [-0.2, 0.48, 0.42], 0.03, C.woodD);
      b.box([0.05, 0.185, 0.04], [-0.33, 0.32, 0.54], C.rope);
      b.box([0.05, 0.185, 0.04], [-0.26, 0.31, 0.48], 0xcfb77f);
      return b.build();
    });
    c.mesh('pole', () => new K.B().rod([-0.2, 0.46, -0.4], [-0.2, 0.95, -0.4], 0.018, C.woodDD).build());
    const flag = c.mesh('pennant', () => new K.B().box([0.22, 0.09, 0.012], [-0.09, 0.8, -0.4], cloth).build(), K.MATS.vertexDouble);
    K.sway((time, wind) => swing(flag, [-0.2, 0.85, -0.4], 'y', Math.sin(time * 3 + c.v) * (0.15 + wind * 0.5) - 0.1));
  }
  // T3: stone footings under both frames, bench at the C slot, lamp on the back-right post.
  if (t >= 3) {
    c.mesh('stone', () => {
      const b = new K.B();
      for (const s of [-1, 1]) b.box([0.56, 0.07, 0.16], [0, -0.01, s * 0.4], s > 0 ? C.stoneL : C.stoneD);
      return b.build();
    });
    c.mesh('bench', () => {
      const b = new K.B();
      bench(b, K, 0.36, 0.6, 0.3, 0.26, 0.17, 'z');
      return b.build();
    });
    c.mesh('ln3', () => new K.B().box([0.13, 0.03, 0.13], [0.2, 0.56, -0.4], C.woodDD).build());
    K.lit('lm3', () => new K.B().box([0.09, 0.1, 0.09], [0.2, 0.46, -0.4], C.lampWarm).build());
    K.lamp(0.2, 0.51, -0.4);
  }
  // T4: brass pulley vane on the pennant pole, string lights, planters at the W slot.
  if (t >= 4) {
    c.mesh('brasspole', () => new K.B().rod([-0.2, 0.9, -0.4], [-0.2, 1.0, -0.4], 0.018, GOLD).build());
    const vane = c.mesh('vane', () => {
      const b = new K.B();
      b.cyl(0.06, 0.06, 0.02, 6, [-0.2, 1.0, -0.4], GOLD, { c: true, r: [PI / 2, 0, 0] });
      b.box([0.12, 0.08, 0.012], [-0.26, 0.96, -0.4], GOLD);
      return b.build();
    });
    K.sway((time, wind) => swing(vane, [-0.2, 1.0, -0.4], 'y', Math.sin(time * 1.3 + c.v) * (0.3 + wind * 0.6)));
    const P0 = [0.2, 0.76, 0.4]; const P1 = [0.0, 0.7, 0.0]; const P2 = [-0.2, 0.88, -0.4];
    c.mesh('strand', () => {
      const b = new K.B();
      b.rod(P0, P1, 0.008, C.dark, { seg: 3 });
      b.rod(P1, P2, 0.008, C.dark, { seg: 3 });
      return b.build();
    });
    K.lit('bulbs', () => {
      const b = new K.B();
      for (const p of [lerp3(P0, P1, 0.5), P1, lerp3(P1, P2, 0.5)]) b.oct(0.027, [p[0], p[1] - 0.03, p[2]], p === P1 ? C.lampWarm : 0xffc27a);
      return b.build();
    });
    c.mesh('plant', () => {
      const b = new K.B();
      planter(b, K, -0.08, 0, 0.57, 0.14, 0.1, 0xe8688a);
      planter(b, K, 0.1, 0, 0.57, 0.12, 0.1, 0xf0c64a);
      return b.build();
    });
  }
};
