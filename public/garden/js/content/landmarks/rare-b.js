// Note: landmark kits for the springs, frozen and arid traits: bathhouse (3), hanginggarden (3), forgottentemple (3); door side +z.
import { LANDMARK_KITS, kitEnv, ROOF, BRASS, BRASS_D } from '../registry.js';

const PI = Math.PI;
const GLOW_WIN = 0xffe2a0;
const SULPHUR = 0xe6cf4e;
const SNOW = 0xeef4fa;

// Note: bathhouse, a timber hall beside a steaming turquoise pool, a gate, sulphur rocks and a stone lantern.
LANDMARK_KITS.bathhouse = (c, B, C) => {
  const X = kitEnv(c);
  const WATER = 0x7fd6d0;
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.22, 2.8], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    // Note: hall at the back left.
    b.box([1.5, 0.82, 1.0], [-0.6, 0.0, -0.85], C.plaster, { sh: [0.92, 1.04] });
    for (const s of [-1, 1]) b.box([0.08, 0.82, 0.1], [-0.6 + s * 0.71, 0.0, -0.33], C.woodD);
    b.box([0.34, 0.54, 0.05], [-0.6, 0.0, -0.33], C.woodD);
    b.group({ p: [-0.6, 0, 0] }, () => X.gable(b, { hw: 0.9, h: 0.55, d: 1.1, y: 0.82, z: -0.85, col: ROOF[3], fillCol: C.plaster }));
    b.cyl(0.1, 0.12, 0.5, 5, [-1.05, 0.82, -1.1], C.stoneD);
    // Note: pool with a stone rim at the front right.
    const px = 0.55, pz = 0.8;
    b.box([1.6, 0.26, 0.14], [px, 0.0, pz - 0.58], C.stoneL, { sh: [0.9, 1.05] });
    b.box([1.6, 0.26, 0.14], [px, 0.0, pz + 0.58], C.stoneL, { sh: [0.9, 1.05] });
    b.box([0.14, 0.26, 1.02], [px - 0.73, 0.0, pz], C.stoneL, { sh: [0.9, 1.05] });
    b.box([0.14, 0.26, 1.02], [px + 0.73, 0.0, pz], C.stoneL, { sh: [0.9, 1.05] });
    b.box([1.34, 0.18, 1.04], [px, 0.0, pz], C.stoneD);
    b.box([1.34, 0.03, 1.04], [px, 0.18, pz], WATER, { v: 0.03 });
    // Note: timber gate at the left front.
    for (const s of [-1, 1]) b.box([0.1, 0.8, 0.1], [-0.95 + s * 0.4, 0.0, 0.8], C.woodDD);
    b.box([1.0, 0.1, 0.14], [-0.95, 0.8, 0.8], ROOF[3]);
    b.box([0.84, 0.06, 0.08], [-0.95, 0.66, 0.8], C.woodDD);
    // Note: sulphur rocks at the back right.
    [[1.1, -0.9, 0.3], [0.85, -0.55, 0.2], [1.2, -0.45, 0.14], [0.55, -1.15, 0.18]].forEach(([x, z, r], i) => {
      b.oct(r, [x, r * 0.8, z], SULPHUR, { s: [1, 0.8, 1], r: [0, i, 0], sh: [0.85, 1.1] });
    });
    // Note: stone lantern post and bucket stack.
    b.cyl(0.07, 0.09, 0.3, 5, [0.9, 0.0, 0.1], C.stoneL);
    b.box([0.2, 0.05, 0.2], [0.9, 0.44, 0.1], C.stoneD);
    b.cyl(0.1, 0.09, 0.1, 5, [-0.2, 0.0, 0.3], C.woodL);
    b.cyl(0.1, 0.09, 0.1, 5, [-0.2, 0.1, 0.3], C.wood);
    return b.build();
  });
  X.lit('win', () => new B().box([0.24, 0.26, 0.03], [-1.1, 0.3, -0.33], GLOW_WIN).box([0.24, 0.26, 0.03], [-0.1, 0.3, -0.33], GLOW_WIN).build());
  X.lit('lant', () => new B().box([0.12, 0.14, 0.12], [0.9, 0.3, 0.1], C.lampWarm, { v: 0 }).build());
  X.plume(0.55, 0.3, 0.8);
  X.plume(-1.05, 1.35, -1.1);
  X.lamp(0.9, 0.55, 0.1);
  X.lamp(-0.6, 0.55, -0.2);
  c.glow(0.55, 0.3, 0.8, WATER);
};

// Note: hanging garden, a snowy stone pillar tower with a glass dome on top and planters hanging from the terrace rim.
LANDMARK_KITS.hanginggarden = (c, B, C) => {
  const X = kitEnv(c);
  const BLOOM = [0xbfe8ff, 0xf2b8d6, 0xfff0a8, 0xc8b8ff];
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.22, 2.8], [0, -0.2, 0], SNOW, { sh: [0.88, 1] });
    // Note: round base with an entry door, a ringed terrace above it.
    b.cyl(0.85, 0.95, 0.8, 8, [0, 0.0, -0.1], C.stoneL, { sh: [0.9, 1.05] });
    b.box([0.34, 0.5, 0.05], [0, 0.0, 0.85], C.woodD);
    b.cyl(1.22, 1.0, 0.2, 8, [0, 0.8, -0.1], SNOW, { sh: [0.92, 1.04] });
    // Note: steps to the terrace.
    b.box([0.5, 0.14, 0.3], [0.0, 0.0, 1.05], C.stoneD);
    b.box([0.46, 0.14, 0.26], [0.0, 0.14, 0.95], C.stoneD);
    // Note: inner pillar and upper terrace.
    b.cyl(0.4, 0.5, 0.6, 7, [0, 1.0, -0.1], C.stoneL, { sh: [0.9, 1.05] });
    b.cyl(0.82, 0.7, 0.16, 8, [0, 1.6, -0.1], C.stone, { sh: [0.9, 1.05] });
    // Note: hanging planters under the upper rim on ropes, with trailing vines.
    for (let k = 0; k < 6; k++) {
      const a = k * (PI / 3) + 0.3;
      const x = Math.sin(a) * 0.74, z = -0.1 + Math.cos(a) * 0.74;
      b.rod([x, 1.6, z], [x, 1.2, z], 0.012, C.rope, { seg: 3 });
      b.box([0.17, 0.1, 0.17], [x, 1.1, z], C.woodD);
      b.cone(0.1, 0.16, 4, [x, 1.2, z], BLOOM[(k + c.v) % 4], { sh: [0.9, 1.1] });
      b.cone(0.04, 0.3, 3, [x, 0.8, z], C.leaf, { r: [PI, 0, 0] });
    }
    // Note: ice crystals at the foot.
    [[-1.1, 0.8, 0.4], [1.12, 0.9, 0.3], [1.0, -1.05, 0.36]].forEach(([x, z, h], i) => {
      b.oct(h * 0.45, [x, h * 0.9, z], 0xbfe8ff, { s: [0.6, 1.8, 0.6], r: [0, i, 0.12 * (i - 1)], sh: [0.85, 1.15] });
    });
    // Note: planted tufts inside the dome.
    b.cone(0.16, 0.34, 5, [0.14, 1.76, -0.1], C.leaf, { sh: [0.9, 1.1] });
    b.cone(0.12, 0.28, 5, [-0.15, 1.76, 0.0], C.leafL, { sh: [0.9, 1.1] });
    b.cone(0.1, 0.22, 4, [0.0, 1.76, -0.3], BLOOM[c.v % 4]);
    return b.build();
  });
  X.glass('dome', () => new B().dome(0.62, 0.66, 8, [0, 1.76, -0.1], 0xd6f1f7, { rings: 2 }).build());
  X.lit('lit', () => new B().sph(0.1, [0, 1.95, -0.1], 0xfff0b8, { ws: 5, hs: 3, v: 0 }).build());
  X.lit('win', () => new B().box([0.2, 0.22, 0.03], [-0.5, 0.3, 0.7], GLOW_WIN).box([0.2, 0.22, 0.03], [0.5, 0.3, 0.7], GLOW_WIN).build());
  X.lamp(0, 1.95, -0.1);
  X.lamp(0, 0.55, 1.0);
  c.glow(0, 1.95, -0.1, 0xfff0b8);
};

// Note: forgotten temple, a sandstone stepped pyramid with a roofed cella, a broken colonnade and a glowing sun orb.
LANDMARK_KITS.forgottentemple = (c, B, C) => {
  const X = kitEnv(c);
  const SAND = 0xdcb87c, SANDL = 0xecd2a0, SANDD = 0xb9915e;
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.2, 2.8], [0, -0.2, 0], 0xe8cf9a, { sh: [0.85, 1] });
    // Note: three stepped tiers, then a front stair.
    b.box([2.5, 0.32, 2.3], [0, 0.0, -0.1], SAND, { sh: [0.9, 1.05] });
    b.box([1.95, 0.32, 1.75], [0, 0.32, -0.2], SANDL, { sh: [0.9, 1.05] });
    b.box([1.4, 0.3, 1.25], [0, 0.64, -0.3], SAND, { sh: [0.9, 1.05] });
    b.box([0.62, 0.16, 0.3], [0, 0.0, 1.05], SANDD);
    b.box([0.62, 0.16, 0.38], [0, 0.32, 0.675], SANDD);
    b.box([0.62, 0.16, 0.35], [0, 0.64, 0.325], SANDD);
    // Note: cella with a dark doorway and a slab roof.
    b.box([0.95, 0.5, 0.8], [0, 0.94, -0.35], SANDL, { sh: [0.92, 1.04] });
    b.box([0.3, 0.38, 0.05], [0, 0.94, 0.06], 0x4a3a2c);
    b.box([1.15, 0.1, 1.0], [0, 1.44, -0.35], SANDD);
    // Note: four columns on the middle tier, two of them broken.
    [[-0.85, 0.4, 0.62], [0.85, 0.4, 0.3], [-0.85, -0.7, 0.4], [0.85, -0.7, 0.58]].forEach(([x, z, h]) => {
      b.cyl(0.07, 0.08, h, 5, [x, 0.64, z], SANDL, { sh: [0.9, 1.05] });
    });
    // Note: fallen column drums on the sand.
    b.cyl(0.1, 0.1, 0.32, 5, [-1.1, 0.0, 1.0], SANDL, { r: [0, 0, PI / 2], sh: [0.9, 1.05] });
    b.cyl(0.1, 0.1, 0.26, 5, [-0.85, 0.0, 1.2], SANDL, { r: [0, 0.6, PI / 2], sh: [0.9, 1.05] });
    b.cyl(0.1, 0.1, 0.3, 5, [1.15, 0.0, 0.9], SANDL, { r: [0, -0.4, PI / 2], sh: [0.9, 1.05] });
    // Note: two braziers flank the stair.
    for (const s of [-1, 1]) {
      b.cyl(0.06, 0.08, 0.3, 5, [s * 0.62, 0.0, 1.3], SANDD);
      b.cyl(0.13, 0.07, 0.08, 6, [s * 0.62, 0.3, 1.3], C.metalD);
    }
    // Note: sun pedestal on the roof.
    b.box([0.2, 0.18, 0.2], [0, 1.54, -0.35], BRASS_D);
    return b.build();
  });
  X.lit('orb', () => new B().sph(0.2, [0, 1.92, -0.35], 0xffd24a, { ws: 7, hs: 4, v: 0 }).build());
  X.lit('fire', () => new B().cone(0.09, 0.12, 5, [-0.62, 0.38, 1.3], 0xff9a3c, { v: 0 }).cone(0.09, 0.12, 5, [0.62, 0.38, 1.3], 0xff9a3c, { v: 0 }).build());
  X.lamp(-0.62, 0.55, 1.3);
  X.lamp(0.62, 0.55, 1.3);
  c.glow(0, 1.92, -0.35, 0xffd24a);
};
