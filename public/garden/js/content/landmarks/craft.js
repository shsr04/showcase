// Note: landmark kits for the craft traits: bellfoundry (cliffy, 3), saltpan (tidal, 3), glazekiln (clay, 2), deepmine (windy, 2); door side +z.
import { LANDMARK_KITS, kitEnv, DARKROOF, BRASS, BRASS_D } from '../registry.js';

const PI = Math.PI;
const GLOW_WIN = 0xffe2a0;
const MOLTEN = 0xff9a3c;

// Note: bell foundry, a stone casting hall with a tall chimney, a timber bell frame and a glowing casting pit.
LANDMARK_KITS.bellfoundry = (c, B, C) => {
  const X = kitEnv(c);
  const roofC = DARKROOF[c.v];
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.22, 2.8], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    // Note: hall at the back left, stone walls under a dark gable roof.
    b.box([1.5, 0.85, 1.1], [-0.6, 0.0, -0.78], C.stone, { sh: [0.9, 1.05] });
    b.box([0.5, 0.45, 0.06], [-0.6, 0.0, -0.2], C.woodDD);
    b.group({ p: [-0.6, 0, 0] }, () => X.gable(b, { hw: 0.9, h: 0.5, d: 1.25, y: 0.85, z: -0.78, col: roofC, fillCol: C.stone }));
    // Note: chimney stack with a cap.
    b.box([0.34, 1.8, 0.34], [-1.12, 0.0, -1.0], C.stoneD, { sh: [0.88, 1.05] });
    b.box([0.44, 0.1, 0.44], [-1.12, 1.78, -1.0], C.stoneL);
    // Note: timber bell frame at the front right, a yoke, and the bell.
    for (const x of [0.62, 1.22]) b.box([0.1, 1.55, 0.1], [x, 0.0, 0.5], C.woodD);
    b.box([0.74, 0.12, 0.12], [0.92, 1.5, 0.5], C.woodDD);
    for (const x of [0.62, 1.22]) b.beam([x, 0.1, 0.5], [x + (x < 0.9 ? -0.22 : 0.22), 0.02, 0.5], 0.06, C.wood);
    b.box([0.16, 0.12, 0.1], [0.92, 1.38, 0.5], C.woodDD);
    b.cyl(0.1, 0.18, 0.12, 8, [0.92, 1.26, 0.5], BRASS, { sh: [0.9, 1.1] });
    b.cyl(0.18, 0.3, 0.38, 8, [0.92, 0.88, 0.5], BRASS, { sh: [0.85, 1.12] });
    b.cyl(0.3, 0.32, 0.05, 8, [0.92, 0.84, 0.5], BRASS_D);
    b.ico(0.06, [0.92, 0.82, 0.5], C.metalD);
    // Note: stone ring of the casting pit at the front left and a finished bell on the ground.
    b.cyl(0.52, 0.56, 0.2, 8, [-0.7, 0.0, 0.65], C.stoneD, { sh: [0.88, 1.05] });
    b.box([0.1, 1.0, 0.1], [-1.3, 0.0, 0.7], C.woodD);
    b.beam([-1.3, 1.0, 0.7], [-0.7, 1.0, 0.65], 0.07, C.woodDD);
    b.rod([-0.7, 1.0, 0.65], [-0.7, 0.4, 0.65], 0.012, C.rope, { seg: 3 });
    b.cyl(0.08, 0.14, 0.2, 7, [0.4, 0.0, 1.0], BRASS, { sh: [0.85, 1.12] });
    b.ico(0.1, [0.15, 0.08, 1.2], C.dark, { s: [1, 0.7, 1], j: 0.01 });
    b.ico(0.08, [-0.1, 0.06, 1.3], 0x4a4543, { s: [1, 0.7, 1], j: 0.01 });
    return b.build();
  });
  X.lit('molten', () => {
    const b = new B();
    b.disc(0.38, [-0.7, 0.205, 0.65], MOLTEN, { r: [-PI / 2, 0, 0], seg: 8, v: 0.05 });
    b.box([0.36, 0.3, 0.05], [-0.6, 0.04, -0.2], MOLTEN, { v: 0.04 });
    return b.build();
  });
  X.plume(-1.12, 1.9, -1.0);
  X.lamp(-0.7, 0.9, 0.9);
  c.glow(-0.65, 0.4, 0.5, 0xff9a3c);
};

// Note: salt pan, flat evaporation basins between clay bunds, a wind pump, a drying shed and white salt mounds.
LANDMARK_KITS.saltpan = (c, B, C) => {
  const X = kitEnv(c);
  const bund = 0xb9946a;
  c.mesh('m', () => {
    const b = new B();
    b.box([2.9, 0.22, 2.8], [0, -0.2, 0], 0xe6d9a2, { sh: [0.85, 1] });
    const xs = [-1.2, -0.45, 0.3, 1.05], zs = [0.0, 0.7, 1.4];
    for (const x of xs) b.box([0.08, 0.1, 1.48], [x, 0.0, 0.7], bund);
    for (const z of zs) b.box([2.34, 0.1, 0.08], [-0.075, 0.0, z], bund);
    const water = 0xcfe9f2, salt = 0xf4f6f4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const full = (i + j * 2 + c.v) % 3 === 0;
      b.box([0.66, 0.05, 0.6], [-0.825 + i * 0.75, 0.0, 0.35 + j * 0.7], full ? salt : water, { v: 0.02 });
    }
    // Note: salt mounds on two pans.
    b.cone(0.22, 0.2, 5, [-0.825, 0.05, 0.35 + ((c.v % 3 === 0) ? 0 : 0.7)], salt, { sh: [0.9, 1.1] });
    b.cone(0.16, 0.14, 5, [0.675, 0.05, 1.05], salt, { sh: [0.9, 1.1] });
    // Note: drying shed at the back right with a shed roof.
    b.box([0.95, 0.6, 0.06], [0.7, 0.0, -1.2], C.wood);
    for (const s of [-1, 1]) b.box([0.06, 0.6, 0.62], [0.7 + s * 0.45, 0.0, -0.92], C.wood);
    b.box([0.9, 0.04, 0.6], [0.7, 0.0, -0.92], C.woodL);
    b.prism(1.15, 0.26, 0.82, [0.7, 0.6, -0.92], 0xd9b868, { sh: [0.88, 1.08] });
    for (const s of [-1, 1]) b.box([0.07, 0.62, 0.07], [0.7 + s * 0.45, 0.0, -0.62], C.woodD);
    for (let k = 0; k < 2; k++) b.box([0.18, 0.12, 0.14], [0.55 + k * 0.3, 0.04, -1.0], k % 2 ? 0xf4f6f4 : 0xe8e8e0, { r: [0, k, 0] });
    // Note: wind pump tower: four tapered legs, a platform, a water trough along the ground.
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.beam([-0.88 + sx * 0.3, 0.0, -0.95 + sz * 0.3], [-0.88 + sx * 0.1, 1.4, -0.95 + sz * 0.1], 0.07, C.wood);
    b.box([0.34, 0.06, 0.34], [-0.88, 1.4, -0.95], C.woodL);
    b.box([0.1, 0.06, 1.0], [-0.88, 0.0, -0.3], C.woodD);
    b.box([0.14, 0.1, 0.16], [-0.88, 0.0, -0.9], C.woodDD);
    b.rod([-0.88, 1.4, -0.95], [-0.88, 1.58, -0.8], 0.04, C.metalD, { seg: 4 });
    return b.build();
  });
  const piv = X.pivot(-0.88, 1.65, -0.72);
  c.mesh('blades', () => {
    const b = new B();
    b.cyl(0.07, 0.07, 0.1, 6, [0, 0, -0.05], C.metalD, { r: [PI / 2, 0, 0] });
    for (let k = 0; k < 4; k++) {
      b.group({ r: [0, 0, (k * PI) / 2] }, () => {
        b.box([0.04, 0.5, 0.02], [0, 0.05, 0], C.woodD);
        b.box([0.14, 0.32, 0.015], [0.08, 0.18, 0], 0xf0e6cc, { sh: [0.92, 1.05] });
      });
    }
    return b.build();
  }, undefined, piv);
  X.spin(piv);
  X.lit('win', () => new B().box([0.22, 0.2, 0.04], [0.7, 0.28, -0.88 + 0.0 - 0.28], GLOW_WIN).build());
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [-0.15, 0.42, 1.43], C.lampWarm).build());
  c.mesh('lpost', () => new B().rod([-0.15, 0, 1.43], [-0.15, 0.4, 1.43], 0.025, C.woodDD, { seg: 3 }).prism(0.15, 0.06, 0.15, [-0.15, 0.52, 1.43], C.woodD).build());
  X.lamp(-0.15, 0.55, 1.43);
  c.glow(-0.15, 0.5, 1.4, 0xffd48a);
};

// Note: glaze kiln, a brick beehive kiln with a lit fire mouth, a tall chimney, glazed pots and a firewood stack.
LANDMARK_KITS.glazekiln = (c, B, C) => {
  const X = kitEnv(c);
  const KX = -0.2, KZ = -0.12;
  const pots = [0x4aa6b0, 0x3d7fb0, 0xf2e6d0, 0x4aa6b0, 0x6bb8a0, 0x3d7fb0];
  c.mesh('m', () => {
    const b = new B();
    b.box([1.95, 0.22, 1.9], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    b.cyl(0.66, 0.7, 0.34, 8, [KX, 0.0, KZ], C.brick, { sh: [0.9, 1.05] });
    b.dome(0.64, 0.56, 8, [KX, 0.34, KZ], C.brickD, { rings: 2, sh: [0.88, 1.1] });
    b.cyl(0.08, 0.06, 0.1, 6, [KX, 0.9, KZ], C.stoneD);
    // Note: arched fire mouth frame in front of the dome.
    b.box([0.14, 0.4, 0.14], [KX - 0.26, 0.0, KZ + 0.62], C.stoneL);
    b.box([0.14, 0.4, 0.14], [KX + 0.26, 0.0, KZ + 0.62], C.stoneL);
    b.box([0.66, 0.14, 0.16], [KX, 0.38, KZ + 0.62], C.stoneL);
    // Note: tall chimney behind the dome joined by a flue block.
    b.box([0.26, 1.7, 0.26], [KX, 0.0, KZ - 0.7], C.brickD, { sh: [0.88, 1.06] });
    b.box([0.36, 0.08, 0.36], [KX, 1.68, KZ - 0.7], C.stoneD);
    b.box([0.2, 0.34, 0.34], [KX, 0.3, KZ - 0.58], C.brick);
    // Note: glazed pots stacked to the right, a shelf with bowls, firewood to the left.
    for (let k = 0; k < 6; k++) {
      const x = 0.58 + (k % 3) * 0.18, y = Math.floor(k / 3) * 0.2;
      b.cyl(0.07, 0.1, 0.18, 5, [x, y, -0.1], pots[k], { sh: [0.9, 1.1] });
    }
    for (const x of [0.5, 0.98]) b.box([0.05, 0.5, 0.05], [x, 0.0, 0.5], C.woodD);
    b.box([0.64, 0.04, 0.26], [0.74, 0.26, 0.5], C.woodL);
    b.box([0.64, 0.04, 0.26], [0.74, 0.46, 0.5], C.woodL);
    for (let k = 0; k < 3; k++) b.cyl(0.07, 0.09, 0.07, 5, [0.58 + k * 0.16, 0.3, 0.5], pots[(k + 2) % 6]);
    b.cyl(0.06, 0.07, 0.12, 5, [0.74, 0.5, 0.5], pots[1]);
    for (let k = 0; k < 5; k++) b.cyl(0.06, 0.06, 0.4, 5, [-0.86 + (k % 3) * 0.13, (k > 2 ? 0.1 : 0), 0.55], C.wood, { c: true, r: [0, 0.2, PI / 2], sh: [0.9, 1.1], open: true });
    return b.build();
  });
  X.lit('mouth', () => new B().box([0.34, 0.28, 0.06], [KX, 0.02, KZ + 0.64], MOLTEN, { v: 0.04 }).build());
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [0.14, 0.36, 0.94], C.lampWarm).build());
  c.mesh('lpost', () => new B().rod([0.14, 0, 0.94], [0.14, 0.34, 0.94], 0.025, C.woodDD, { seg: 3 }).prism(0.15, 0.06, 0.15, [0.14, 0.46, 0.94], C.woodD).build());
  X.plume(KX, 1.8, KZ - 0.7);
  X.lamp(0.14, 0.5, 0.94);
  c.glow(KX, 0.25, KZ + 0.7, 0xff9a3c);
};

// Note: deep mine, a timber A-frame headframe over a stone-collared shaft with a spinning winding wheel, rails, an ore cart and a miner shed.
LANDMARK_KITS.deepmine = (c, B, C) => {
  const X = kitEnv(c);
  const roofC = DARKROOF[c.v];
  const H = 1.9;
  c.mesh('m', () => {
    const b = new B();
    b.box([1.95, 0.22, 1.9], [0, -0.2, 0], C.stoneD, { sh: [0.85, 1] });
    for (const z of [-0.3, 0.3]) {
      b.beam([-0.7, 0.0, z], [-0.06, H, z], 0.09, C.wood);
      b.beam([0.7, 0.0, z], [0.06, H, z], 0.09, C.wood);
      b.box([1.0, 0.07, 0.07], [0, 0.6, z], C.woodD);
    }
    for (const y of [0.6, H - 0.02]) b.box([0.08, 0.07, 0.7], [0, y, 0], C.woodDD);
    b.rod([0, 0.0, 0.0], [0, H - 0.08, 0.0], 0.012, C.rope, { seg: 3 });
    // Note: shaft collar, stone ring with a dark opening.
    b.cyl(0.4, 0.44, 0.16, 8, [0, 0.0, 0], C.stone, { sh: [0.88, 1.05] });
    b.cyl(0.28, 0.28, 0.02, 8, [0, 0.16, 0], 0x2a2420);
    // Note: rails, sleepers and the ore cart with rich ore.
    for (const s of [-1, 1]) b.rod([s * 0.14, 0.04, 0.45], [s * 0.14, 0.04, 1.02], 0.018, C.metalD, { seg: 4 });
    for (let k = 0; k < 4; k++) b.box([0.4, 0.03, 0.06], [0, 0.0, 0.5 + k * 0.17], C.woodD);
    b.box([0.3, 0.16, 0.34], [0, 0.08, 0.8], C.woodL, { sh: [0.88, 1.05] });
    b.oct(0.17, [0, 0.26, 0.8], 0xc9a05a, { s: [1, 0.7, 1.1], j: 0.02 });
    b.ico(0.08, [0.05, 0.36, 0.78], 0xe6c15a);
    // Note: ore heap and miner shed.
    b.ico(0.16, [-0.72, 0.1, 0.62], 0x7a5f56, { s: [1, 0.75, 1], j: 0.02 });
    b.ico(0.12, [-0.55, 0.08, 0.84], 0xc9a05a, { s: [1, 0.75, 1], j: 0.02 });
    b.ico(0.11, [-0.82, 0.08, 0.35], 0x7a5f56, { s: [1, 0.75, 1], j: 0.02 });
    b.box([0.55, 0.55, 0.06], [0.72, 0.0, -0.8], C.wood);
    for (const s of [-1, 1]) b.box([0.06, 0.55, 0.5], [0.72 + s * 0.26, 0.0, -0.58], C.wood);
    b.box([0.2, 0.36, 0.05], [0.72, 0.0, -0.33], C.woodD);
    b.prism(0.75, 0.24, 0.62, [0.72, 0.55, -0.58], roofC, { sh: [0.88, 1.08] });
    return b.build();
  });
  X.lit('win', () => new B().box([0.14, 0.14, 0.04], [0.72, 0.32, -0.28], GLOW_WIN).build());
  X.lit('lantern', () => new B().box([0.09, 0.1, 0.09], [0.0, 1.36, 0.42], C.lampWarm).build());
  c.mesh('hang', () => new B().rod([0, 1.88, 0.3], [0, 1.44, 0.42], 0.012, C.dark, { seg: 3 }).cone(0.07, 0.05, 4, [0, 1.46, 0.42], C.woodDD, { open: true, r: [0, PI / 4, 0] }).build());
  const piv = X.pivot(0, H - 0.1, 0);
  c.mesh('wheel', () => {
    const b = new B();
    b.torus(0.36, 0.03, [0, 0, 0], C.woodD, { rs: 3, ts: 8, v: 0 });
    for (let k = 0; k < 3; k++) b.rod([Math.cos((k * PI) / 3) * -0.36, Math.sin((k * PI) / 3) * -0.36, 0], [Math.cos((k * PI) / 3) * 0.36, Math.sin((k * PI) / 3) * 0.36, 0], 0.02, C.wood, { seg: 4 });
    b.rod([0, 0, -0.34], [0, 0, 0.34], 0.04, C.metalD, { seg: 5 });
    return b.build();
  }, undefined, piv);
  X.spin(piv);
  X.lamp(0.0, 1.4, 0.42);
  c.glow(0.0, 1.3, 0.5, 0xffd48a);
};
