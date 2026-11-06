// Note: landmark kits for the farm traits: ribbonhut (meadow), granary (fertile), cidery (orchard), apiary (verdant); all size 2, door on +z.
import { LANDMARK_KITS, kitEnv, ROOF } from '../registry.js';

const PI = Math.PI;
const CLOTH = [0xf0a8b8, 0xa8d8b8, 0xf4d98a, 0xc8b0e0, 0x9cc8e8, 0xf4a888];
const GLOW_WIN = 0xffe2a0;

// Note: ribbon hut, round plastered hut under a pink thatch cone, a maypole with streamers and a drying rack.
LANDMARK_KITS.ribbonhut = (c, B, C) => {
  const X = kitEnv(c);
  const roofC = [0xe9a3b4, 0xd98a6a, 0xe6c67e, 0xb4a0d6][c.v];
  const HX = -0.24, HZ = -0.2; // hut centre
  const PX = 0.5, PZ = 0.42; // maypole
  c.mesh('m', () => {
    const b = new B();
    b.cyl(0.66, 0.72, 0.2, 9, [HX, -0.15, HZ], C.stoneD);
    b.cyl(0.58, 0.54, 0.62, 9, [HX, 0.05, HZ], C.plaster, { sh: [0.92, 1.04] });
    b.box([0.28, 0.44, 0.05], [HX, 0.05, HZ + 0.55], C.woodD);
    b.cone(0.78, 0.7, 9, [HX, 0.64, HZ], roofC, { sh: [0.88, 1.08] });
    b.ico(0.07, [HX, 1.36, HZ], C.woodD);
    // Note: maypole on a small stone base.
    b.cyl(0.14, 0.12, 0.1, 6, [PX, 0, PZ], C.stoneD);
    b.rod([PX, 0.05, PZ], [PX, 1.45, PZ], 0.035, C.woodL, { seg: 5 });
    b.ico(0.07, [PX, 1.5, PZ], 0xe6c15a);
    // Note: drying rack with hanging ribbon strips in front of the hut.
    for (const x of [-0.95, -0.35]) b.box([0.05, 0.62, 0.05], [x, 0, 0.62], C.woodD);
    b.box([0.7, 0.04, 0.05], [-0.65, 0.58, 0.62], C.wood);
    CLOTH.forEach((col, i) => b.box([0.07, 0.34 - (i % 2) * 0.08, 0.015], [-0.9 + i * 0.1, 0.25 + (i % 2) * 0.08, 0.62], col, { v: 0.02 }));
    return b.build();
  });
  X.lit('win', () => {
    const b = new B();
    for (const s of [-1, 1]) {
      const a = s * 0.95 + PI * 0.0;
      b.box([0.14, 0.15, 0.05], [HX + Math.sin(a) * 0.56, 0.3, HZ + Math.cos(a) * 0.56], GLOW_WIN, { r: [0, a, 0] });
    }
    return b.build();
  });
  // Note: streamers swirl around the pole; geometry is local to the pivot at the pole.
  const piv = X.pivot(PX, 0, PZ);
  c.mesh('streamers', () => {
    const b = new B();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * PI * 2;
      b.beam([0, 1.42, 0], [Math.sin(a) * 0.42, 0.1, Math.cos(a) * 0.42], 0.03, CLOTH[k], { v: 0.02 });
      b.oct(0.04, [Math.sin(a) * 0.42, 0.08, Math.cos(a) * 0.42], CLOTH[k]);
    }
    return b.build();
  }, undefined, piv);
  X.sway((t, w) => { piv.rotation.y = Math.sin(t * 1.3) * (0.08 + w * 0.3); });
  X.lamp(HX + 0.36, 0.62, HZ + 0.62);
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [HX + 0.36, 0.5, HZ + 0.62], C.lampWarm).build());
  c.mesh('lpost', () => new B().rod([HX + 0.36, 0, HZ + 0.62], [HX + 0.36, 0.5, HZ + 0.62], 0.025, C.woodDD, { seg: 3 }).prism(0.15, 0.06, 0.15, [HX + 0.36, 0.6, HZ + 0.62], C.woodD).build());
  c.glow(HX + 0.3, 0.45, HZ + 0.6, 0xffc477);
};

// Note: granary, a plank store raised on staddle stones under a steep thatch roof, with ladder, hoist and sacks.
LANDMARK_KITS.granary = (c, B, C) => {
  const X = kitEnv(c);
  const thatch = [C.thatch, 0xe0b868, 0xd9c27a, 0xc9a45e][c.v];
  const Y0 = 0.42; // floor height
  c.mesh('m', () => {
    const b = new B();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.1, 0.13, 0.3, 5, [sx * 0.55, 0, sz * 0.42], C.stoneD);
      b.cyl(0.19, 0.1, 0.08, 5, [sx * 0.55, 0.3, sz * 0.42], C.stoneL);
    }
    b.box([1.46, 0.06, 1.12], [0, Y0 - 0.06, 0], C.woodD, { sh: [0.9, 1.05] });
    b.box([1.34, 0.72, 0.06], [0, Y0, -0.5], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) b.box([0.06, 0.72, 1.0], [s * 0.64, Y0, 0], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) b.box([0.5, 0.72, 0.06], [s * 0.42, Y0, 0.5], C.wood);
    b.box([0.3, 0.12, 0.06], [0, Y0 + 0.6, 0.5], C.wood);
    for (const k of [-1, 0, 1]) b.box([0.04, 0.72, 0.01], [k * 0.3, Y0, -0.535], C.woodD);
    X.gable(b, { hw: 0.95, h: 0.62, d: 1.35, y: Y0 + 0.72, col: thatch, fillCol: C.wood });
    // Note: ladder up to the door.
    for (const s of [-1, 1]) b.beam([s * 0.12, 0, 1.02], [s * 0.12, Y0 + 0.02, 0.6], 0.035, C.woodD);
    for (let k = 1; k <= 3; k++) b.box([0.26, 0.025, 0.04], [0, k * 0.1, 1.02 - (k * 0.42) / 4], C.woodL);
    // Note: hoist beam at the gable with a rope and hook.
    b.box([0.07, 0.07, 0.36], [0, Y0 + 1.1, 0.74], C.woodDD);
    b.rod([0, Y0 + 1.1, 0.88], [0, Y0 + 0.78, 0.88], 0.012, C.rope, { seg: 3 });
    // Note: filled sacks by the ladder.
    b.ico(0.12, [0.62, 0.12, 0.78], C.cream, { s: [1, 1.15, 0.9], j: 0.012 });
    b.ico(0.11, [0.8, 0.1, 0.6], 0xe8d8b0, { s: [1, 1.1, 0.9], j: 0.012 });
    b.ico(0.1, [0.68, 0.28, 0.72], C.cream, { s: [1, 1, 0.9], j: 0.012 });
    return b.build();
  });
  X.lit('hatch', () => new B().box([0.2, 0.2, 0.05], [0, Y0 + 0.86, 0.69], GLOW_WIN).build());
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [-0.78, 0.72, 0.62], C.lampWarm).build());
  c.mesh('lpost', () => new B().rod([-0.78, 0, 0.62], [-0.78, 0.7, 0.62], 0.025, C.woodDD, { seg: 3 }).prism(0.15, 0.06, 0.15, [-0.78, 0.8, 0.62], C.woodD).build());
  X.lamp(-0.78, 0.8, 0.62);
  c.glow(0, 1.1, 0.7, 0xffc477);
};

// Note: cidery, a small barn with a screw press under an open frame, barrels and an apple basket.
LANDMARK_KITS.cidery = (c, B, C) => {
  const X = kitEnv(c);
  const roofC = [0xc9705a, 0xa8553f, 0x86a8c4, 0xb87a4a][c.v];
  c.mesh('m', () => {
    const b = new B();
    b.box([1.95, 0.22, 1.9], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    // Note: barn at the back, plank walls and a gable roof.
    b.box([1.7, 0.7, 0.06], [0, 0.0, -0.9], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) b.box([0.06, 0.7, 0.8], [s * 0.82, 0.0, -0.5], C.wood, { sh: [0.9, 1.05] });
    b.box([1.7, 0.04, 0.8], [0, 0.0, -0.5], C.woodL);
    for (const s of [-1, 1]) b.box([0.08, 0.76, 0.08], [s * 0.82, 0.0, -0.08], C.woodD);
    b.box([1.76, 0.08, 0.1], [0, 0.72, -0.08], C.woodD);
    X.gable(b, { hw: 0.95, h: 0.5, d: 1.1, y: 0.78, col: roofC, z: -0.45, fillCol: C.wood });
    // Note: press frame in front of the barn: two posts, a cross beam, the screw and a wheel.
    for (const s of [-1, 1]) b.box([0.08, 0.95, 0.08], [0.18 + s * 0.28, 0, 0.5], C.woodD);
    b.box([0.7, 0.1, 0.1], [0.18, 0.9, 0.5], C.woodDD);
    b.cyl(0.04, 0.04, 0.5, 5, [0.18, 0.5, 0.5], C.metalD);
    b.rod([-0.06, 0.78, 0.5], [0.42, 0.78, 0.5], 0.02, C.woodL, { seg: 4 });
    b.cyl(0.22, 0.2, 0.18, 8, [0.18, 0.0, 0.5], C.woodL, { sh: [0.9, 1.05] });
    b.cyl(0.2, 0.2, 0.05, 8, [0.18, 0.42, 0.5], C.woodD);
    // Note: barrel pyramid on the left, apple basket on the right.
    for (const x of [-0.82, -0.52]) b.cyl(0.14, 0.14, 0.3, 7, [x, 0, 0.55], C.woodL, { sh: [0.9, 1.05] });
    b.cyl(0.14, 0.14, 0.3, 7, [-0.67, 0.28, 0.55], C.wood, { sh: [0.9, 1.05] });
    b.cyl(0.13, 0.1, 0.12, 7, [0.78, 0, 0.7], C.woodD, { open: true });
    for (let k = 0; k < 4; k++) b.ico(0.06, [0.78 + Math.cos(k * 1.6) * 0.05, 0.14 + (k > 2 ? 0.06 : 0), 0.7 + Math.sin(k * 1.6) * 0.05], k % 2 ? 0xe2564a : 0xf08a50);
    // Note: loft door.
    b.box([0.34, 0.3, 0.02], [0, 0.0, -0.86], C.woodD);
    return b.build();
  });
  X.lit('loft', () => new B().box([0.2, 0.18, 0.02], [0, 0.78, -0.6 + 0.57], GLOW_WIN).build());
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [-0.2, 0.74, 0.0], C.lampWarm).build());
  X.lamp(-0.2, 0.76, 0.0);
  c.glow(0.18, 0.6, 0.7, 0xffc477);
};

// Note: apiary, a thatched bee shelter with skeps on tiered shelves, painted hive boxes and flower beds.
LANDMARK_KITS.apiary = (c, B, C) => {
  const X = kitEnv(c);
  const roofC = [C.thatch, 0xe0b868, 0xd9c27a, 0xe6c67e][c.v];
  const flow = [0xe98ab0, 0xf6e27a, 0x8fb7e8, 0xf2a03f, 0xc8b0e0];
  c.mesh('m', () => {
    const b = new B();
    b.box([1.9, 0.2, 1.8], [0, -0.18, 0], C.mossD, { sh: [0.85, 1] });
    // Note: shelter with a back wall and a sloped thatch roof.
    b.box([1.3, 0.8, 0.06], [-0.1, 0.0, -0.78], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) {
      b.box([0.06, 0.8, 0.5], [-0.1 + s * 0.62, 0.0, -0.55], C.wood);
      b.box([0.07, 0.86, 0.07], [-0.1 + s * 0.62, 0.0, -0.3], C.woodD);
    }
    b.prism(1.5, 0.28, 0.62, [-0.1, 0.82, -0.55], roofC, { sh: [0.88, 1.08] });
    // Note: two shelves with straw skeps.
    for (const y of [0.18, 0.5]) {
      b.box([1.18, 0.04, 0.34], [-0.1, y, -0.6], C.woodL);
      for (let k = 0; k < 3; k++) {
        const x = -0.4 + k * 0.3;
        b.dome(0.11, 0.15, 6, [x, y + 0.04, -0.6], k % 2 ? 0xe8c470 : 0xd9b05c, { rings: 2, sh: [0.9, 1.1] });
        b.box([0.05, 0.04, 0.02], [x, y + 0.06, -0.48], C.dark);
      }
    }
    // Note: painted hive stack to the right.
    b.box([0.36, 0.3, 0.36], [0.72, 0.0, 0.1], C.cream, { sh: [0.92, 1.05] });
    b.box([0.34, 0.2, 0.34], [0.72, 0.3, 0.1], 0xf0d98a, { sh: [0.92, 1.05] });
    b.box([0.34, 0.2, 0.34], [0.72, 0.5, 0.1], 0xa8d8b8, { sh: [0.92, 1.05] });
    b.prism(0.44, 0.14, 0.42, [0.72, 0.7, 0.1], 0xd9856a);
    b.box([0.12, 0.02, 0.02], [0.72, 0.26, 0.29], C.dark);
    // Note: flower beds in front.
    for (let k = 0; k < 6; k++) {
      const x = -0.85 + k * 0.28 + (k % 2) * 0.05, z = 0.55 + (k % 3) * 0.14;
      b.rod([x, 0.02, z], [x, 0.17, z], 0.012, 0x5f9f4a, { seg: 3 });
      b.oct(0.06, [x, 0.2, z], flow[(k + c.v) % 5], { s: [1, 0.8, 1] });
    }
    b.ico(0.18, [-0.2, 0.08, 0.28], 0x6fae5d, { s: [1.5, 0.7, 1], j: 0.03 });
    return b.build();
  });
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [0.28, 0.8, 0.22], C.lampWarm).build());
  c.mesh('lpost', () => new B().rod([0.28, 0, 0.22], [0.28, 0.78, 0.22], 0.025, C.woodDD, { seg: 3 }).prism(0.15, 0.06, 0.15, [0.28, 0.89, 0.22], C.woodD).build());
  X.lamp(0.28, 0.9, 0.22);
  c.glow(0.28, 0.8, 0.3, 0xffd48a);
};
