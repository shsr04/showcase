// Note: landmark kits for the misty, crystal and volcanic traits: bannerloom (3), lenslamp (2), forgeglass (3); door side +z.
import { LANDMARK_KITS, kitEnv, ROOF, BRASS, BRASS_D } from '../registry.js';

const PI = Math.PI;
const GLOW_WIN = 0xffe2a0;
const MOLTEN = 0xff9a3c;

// Note: banner loom, a pier deck with a loom hall, dye vats and a gantry that carries swaying banners under a pearl finial.
LANDMARK_KITS.bannerloom = (c, B, C) => {
  const X = kitEnv(c);
  const BAN = [0xdfe6f5, 0x5d6fb8, 0x4aa6b0, 0xa88bd6, 0xe8a0b8];
  const lens = [1.2, 0.95, 1.3, 0.9, 1.1];
  const GZ = 0.62; // gantry plane
  const BX = [-0.9, -0.45, 0, 0.45, 0.9];
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.2, 2.8], [0, -0.18, 0], C.woodL, { sh: [0.8, 1] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.14, 0.31, 0.14], [sx * 1.38, -0.2, sz * 1.3], C.woodDD);
    // Note: loom hall at the back under a pale teal gable roof.
    b.box([1.9, 0.82, 0.07], [0, 0.0, -1.18], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) b.box([0.07, 0.82, 0.8], [s * 0.93, 0.0, -0.8], C.wood, { sh: [0.9, 1.05] });
    b.box([1.9, 0.82, 0.07], [0, 0.0, -0.44], C.wood, { sh: [0.9, 1.05] });
    X.gable(b, { hw: 1.05, h: 0.5, d: 0.96, y: 0.82, z: -0.81, col: ROOF[1], fillCol: C.wood });
    // Note: gantry posts, top beam, and corner braces.
    for (const s of [-1, 1]) {
      b.box([0.12, 2.05, 0.12], [s * 1.15, 0.0, GZ], C.woodD, { sh: [0.9, 1.05] });
    }
    b.box([2.5, 0.14, 0.14], [0, 1.95, GZ], C.woodDD);
    // Note: pearl finial on a short post above the beam.
    b.box([0.08, 0.2, 0.08], [0, 2.09, GZ], BRASS);
    // Note: dye vats in front left with coloured liquid.
    [[-0.85, 1.18, 0x5d6fb8], [-0.35, 1.2, 0x4aa6b0]].forEach(([x, z, col]) => {
      b.cyl(0.17, 0.2, 0.3, 7, [x, 0.0, z], C.woodL, { sh: [0.9, 1.05] });
      b.disc(0.16, [x, 0.31, z], col, { r: [-PI / 2, 0, 0], seg: 7 });
    });
    // Note: spool crate at the right front.
    b.box([0.34, 0.24, 0.3], [0.8, 0.0, 1.15], C.woodL);
    b.cyl(0.1, 0.1, 0.14, 6, [0.8, 0.24, 1.15], 0xdfe6f5);
    return b.build();
  });
  X.lit('pearl', () => new B().sph(0.15, [0, 2.4, GZ], 0xeaf0ff, { ws: 7, hs: 4, v: 0 }).build());
  X.lit('win', () => new B().box([0.22, 0.24, 0.03], [-0.55, 0.32, -0.4 + 0.045], GLOW_WIN).box([0.22, 0.24, 0.03], [0.55, 0.32, -0.4 + 0.045], GLOW_WIN).build());
  // Note: banners hang from the beam; geometry is local to a pivot on the beam.
  const piv = X.pivot(0, 1.97, GZ + 0.0);
  c.mesh('banners', () => {
    const b = new B();
    BX.forEach((x, i) => {
      const h = lens[(i + c.v) % 5];
      b.box([0.34, h, 0.03], [x, -h, 0.09], BAN[(i + c.v) % 5], { sh: [0.92, 1.08], v: 0.03 });
      b.prism(0.34, 0.2, 0.03, [x, -h, 0.09], BAN[(i + c.v) % 5], { r: [PI, 0, 0] });
    });
    return b.build();
  }, undefined, piv);
  X.sway((t, w) => { piv.rotation.x = Math.sin(t * 1.1) * (0.04 + w * 0.12); });
  X.lamp(0, 2.45, GZ);
  X.lamp(0.0, 0.5, -0.2);
  c.glow(0, 0.5, 0.2, 0xdfe6f5);
};

// Note: lens lamp, a white stone tower with a glass lantern room, a huge glowing lens ring and a crown of prism crystals.
LANDMARK_KITS.lenslamp = (c, B, C) => {
  const X = kitEnv(c);
  const CR = [0x8fe7ff, 0xbff4ff, 0xa8c8ff, 0xc8b0ff];
  c.mesh('m', () => {
    const b = new B();
    b.box([1.9, 0.22, 1.9], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    b.cyl(0.62, 0.58, 0.45, 8, [0, 0.0, 0], C.stoneL, { sh: [0.9, 1.04] });
    b.cyl(0.5, 0.36, 1.2, 8, [0, 0.45, 0], C.cream, { sh: [0.92, 1.06] });
    b.box([0.28, 0.46, 0.05], [0, 0.0, 0.6], C.woodD);
    b.cyl(0.58, 0.5, 0.08, 8, [0, 1.62, 0], BRASS);
    // Note: lantern room frame, four brass posts and a brass roof.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.05, 0.5, 0.05], [sx * 0.26, 1.7, sz * 0.26], BRASS_D);
    b.cyl(0.4, 0.34, 0.06, 8, [0, 2.18, 0], BRASS);
    b.cone(0.38, 0.22, 8, [0, 2.24, 0], BRASS, { sh: [0.88, 1.1] });
    // Note: lens ring on the +z side of the room.
    b.torus(0.25, 0.03, [0, 1.95, 0.3], BRASS, { rs: 3, ts: 8, v: 0 });
    // Note: crown crystals on the roof.
    b.oct(0.15, [0, 2.6, 0], CR[0], { s: [0.55, 2.0, 0.55], sh: [0.85, 1.15] });
    for (let k = 0; k < 4; k++) {
      const a = k * (PI / 2) + 0.4;
      b.oct(0.08, [Math.sin(a) * 0.22, 2.3, Math.cos(a) * 0.22], CR[(k + c.v) % 4], { s: [0.6, 1.8, 0.6], r: [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35], sh: [0.85, 1.15] });
    }
    // Note: crystal clusters at the foot.
    [[-0.78, 0.7, 0.3], [0.8, 0.6, 0.24], [0.62, -0.7, 0.2], [-0.7, -0.62, 0.26]].forEach(([x, z, h], i) => {
      b.oct(h * 0.5, [x, h * 0.9, z], CR[(i + c.v) % 4], { s: [0.6, 1.8, 0.6], r: [0, i, 0.15 * (i - 1.5)], sh: [0.85, 1.15] });
      b.oct(h * 0.3, [x + 0.14, h * 0.5, z + 0.1], CR[(i + 1) % 4], { s: [0.6, 1.6, 0.6], r: [0.2, i * 2, 0] });
    });
    return b.build();
  });
  X.glass('room', () => new B().cyl(0.33, 0.33, 0.5, 8, [0, 1.7, 0], 0xcdeef5, { open: true }).build());
  X.lit('lens', () => new B().disc(0.22, [0, 1.95, 0.3], 0xfff4c8, { seg: 8, v: 0 }).build());
  X.lit('crown', () => new B().oct(0.08, [0, 2.95, 0], 0xe6fbff, { v: 0 }).build());
  X.lamp(0, 1.95, 0.5);
  c.glow(0, 1.95, 0.4, 0xdff6ff);
};

// Note: forge glass, a basalt furnace works with a tall glowing stack, a glass bench with bottles, obsidian shards and lava veins.
LANDMARK_KITS.forgeglass = (c, B, C) => {
  const X = kitEnv(c);
  const BAS = 0x5b5560, BASD = 0x403c47, OBS = 0x2b2833;
  const bottles = [0x4aa6b0, 0xf2a03f, 0xa88bd6, 0xe8a0b8];
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.22, 2.8], [0, -0.2, 0], BASD, { sh: [0.85, 1] });
    // Note: hall at the back right.
    b.box([1.3, 0.8, 1.0], [0.45, 0.0, -0.85], BAS, { sh: [0.9, 1.05] });
    b.box([0.4, 0.5, 0.05], [0.45, 0.0, -0.33], C.woodDD);
    b.group({ p: [0.45, 0, 0] }, () => X.gable(b, { hw: 0.78, h: 0.42, d: 1.1, y: 0.8, z: -0.85, col: BASD, fillCol: BAS }));
    // Note: tall stack at the back left and a furnace dome in front of it.
    b.cyl(0.26, 0.17, 2.0, 7, [-1.0, 0.0, -0.95], BAS, { sh: [0.88, 1.06] });
    b.cyl(0.2, 0.2, 0.08, 7, [-1.0, 2.0, -0.95], BASD);
    b.cyl(0.72, 0.74, 0.3, 8, [-0.85, 0.0, 0.0], BASD);
    b.dome(0.68, 0.56, 8, [-0.85, 0.3, 0.0], BAS, { rings: 2, sh: [0.88, 1.1] });
    b.box([0.4, 0.34, 0.12], [-0.85, 0.0, 0.7], BASD);
    b.box([0.5, 0.22, 0.4], [-0.95, 0.0, -0.6], BAS);
    // Note: glass bench front right with pipes and bottles.
    b.box([0.9, 0.3, 0.46], [0.7, 0.0, 0.95], BAS, { sh: [0.9, 1.05] });
    b.box([0.96, 0.05, 0.52], [0.7, 0.3, 0.95], C.woodD);
    b.rod([0.4, 0.4, 0.95], [1.1, 0.5, 0.82], 0.015, C.metalD, { seg: 3 });
    bottles.forEach((col, i) => {
      const x = 0.45 + i * 0.18;
      b.cyl(0.055, 0.06, 0.1, 5, [x, 0.35, 1.0 + (i % 2) * 0.08], col);
      b.cyl(0.025, 0.025, 0.08, 4, [x, 0.45, 1.0 + (i % 2) * 0.08], col);
    });
    // Note: obsidian shards at the right edge and front left.
    [[1.1, -0.2, 0.55], [1.25, 0.25, 0.8], [0.95, 0.35, 0.4], [-1.25, 0.8, 0.5]].forEach(([x, z, h], i) => {
      b.oct(0.12, [x, h * 0.5, z], OBS, { s: [0.7, h * 4.4, 0.7], r: [0.12 * (i - 1.5), i, 0.14 * (1.5 - i)], sh: [0.8, 1.25] });
    });
    return b.build();
  });
  X.lit('fire', () => {
    const b = new B();
    b.box([0.28, 0.24, 0.05], [-0.85, 0.05, 0.77], MOLTEN, { v: 0.04 });
    b.cyl(0.22, 0.17, 0.1, 7, [-1.0, 1.72, -0.95], MOLTEN, { v: 0.04, open: true });
    b.box([0.1, 0.08, 0.5], [0.4, 0.02, 0.35], MOLTEN, { r: [0, 0.2, 0], v: 0.04 });
    b.box([0.1, 0.08, 0.5], [-0.2, 0.02, 0.9], MOLTEN, { r: [0, -0.6, 0], v: 0.04 });
    b.box([0.28, 0.08, 0.1], [1.0, 0.02, 0.95], MOLTEN, { r: [0, 0.3, 0], v: 0.04 });
    return b.build();
  });
  X.plume(-1.0, 2.15, -0.95);
  X.lamp(-0.85, 0.5, 0.95);
  c.glow(-0.85, 0.3, 0.9, 0xff9a3c);
};
