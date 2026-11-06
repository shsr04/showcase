// Note: airship geometries for the four kinds; SHIP_MODELS[kind] = (B, C) => { body, glow, flag, prop, lamps, slots, height }.
// Note: bow is +z, y 0 is the gondola floor; flag = { geo, pos } pennant extending toward +x, prop = { geo, pos } spins about z, lamps and slots are [x, y, z] lists.
import { SHIP_MODELS, BRASS, BRASS_D } from './registry.js';

const PI = Math.PI;
const TAU = PI * 2;
const EY = 1.6; // envelope centre height

// Note: striped envelope, an ellipsoid with its long axis on z; stripes are meridian wedges.
function envelope(b, rad, half, cols, crown) {
  const cf = (cx, cy, cz) => {
    if (crown && cz > half * 0.86) return crown;
    return cols[((Math.floor(((Math.atan2(cx, cy - EY) + PI) / TAU) * 8) % cols.length) + cols.length) % cols.length];
  };
  b.sph(1, [0, EY, 0], 0xffffff, { ws: 8, hs: 5, s: [rad, half, rad], r: [PI / 2, 0, 0], cf, sh: [0.9, 1.08], v: 0.02 });
}

// Note: four tail fins, attached to the envelope rear.
function fins(b, rad, half, col) {
  const z = -half * 0.78;
  b.box([0.04, rad * 1.5, 0.5], [0, EY - rad * 0.75, z - 0.12], col, { sh: [0.9, 1.05] });
  b.box([rad * 1.5, 0.04, 0.5], [-rad * 0.75, EY - 0.02, z - 0.12], col, { sh: [0.9, 1.05] });
}

// Note: rigging from four gondola posts up to the envelope belly.
function rigging(b, hw, hl, y0, col) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * hw, y0, sz * hl], [sx * hw * 0.65, EY - 0.45, sz * hl * 0.8], 0.012, col, { seg: 3 });
}

// Note: engine strut from the rear of the gondola to the propeller hub.
function mount(b, y, z, zFrom, col) {
  b.rod([0, 0.18, zFrom], [0, y, z + 0.02], 0.03, col, { seg: 4 });
}

function pennant(B, col, len = 0.38) {
  const f = new B();
  f.prism(0.16, len, 0.014, [0, 0, 0], col, { r: [0, 0, -PI / 2], v: 0.02 });
  return f.build();
}

function propeller(B, col, r = 0.3) {
  const p = new B();
  p.box([0.05, 0.05, 0.05], [0, -0.025, 0], BRASS_D);
  p.box([r * 2, 0.06, 0.015], [0, -0.03, 0.0], col);
  return p.build();
}

// Note: cargo, a straw envelope over an open barge deck that carries eight crates in four rows.
SHIP_MODELS.cargo = (B, C) => {
  const b = new B(), g = new B();
  envelope(b, 0.62, 1.15, [0xe3c27a, 0xf7ecd2, 0xc99a62, 0xf7ecd2]);
  fins(b, 0.62, 1.15, 0xc99a62);
  b.box([0.9, 0.12, 1.3], [0, 0, 0], 0xc99a62, { sh: [0.88, 1.08] });
  b.box([0.94, 0.04, 1.34], [0, 0.12, 0], C.woodD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.04, 0.3, 0.04], [sx * 0.45, 0.14, sz * 0.65], C.woodDD);
  for (const sx of [-1, 1]) b.rod([sx * 0.45, 0.4, -0.65], [sx * 0.45, 0.4, 0.65], 0.016, C.rope, { seg: 3 });
  rigging(b, 0.45, 0.65, 0.44, C.rope);
  b.rod([0, EY + 0.55, 0], [0, EY + 0.85, 0], 0.014, C.woodDD, { seg: 3 });
  b.box([0.3, 0.1, 0.08], [0, 0.14, -0.6], C.woodL);
  mount(b, 0.3, -0.72, -0.6, C.woodDD);
  for (const sx of [-1, 1]) {
    b.box([0.03, 0.14, 0.03], [sx * 0.45, 0.2, 0.7], C.woodDD);
    g.box([0.07, 0.07, 0.07], [sx * 0.45, 0.34, 0.7], C.lampWarm, { v: 0 });
  }
  return {
    body: b.build(), glow: g.build(),
    flag: { geo: pennant(B, 0xe0614f), pos: [0, EY + 0.85, 0] },
    prop: { geo: propeller(B, C.metalD), pos: [0, 0.3, -0.72] },
    lamps: [[0.45, 0.4, 0.7], [-0.45, 0.4, 0.7]],
    slots: [-0.4, -0.1, 0.2, 0.5].flatMap((z) => [[-0.2, 0.16, z], [0.2, 0.16, z]]),
    height: EY + 0.85,
  };
};

// Note: trader, a plum and gold envelope over a roofed cabin with lit windows and a two-crate rear deck.
SHIP_MODELS.trader = (B, C) => {
  const b = new B(), g = new B();
  envelope(b, 0.64, 1.1, [0x7a5bb5, 0xf2c14e, 0x7a5bb5, 0xf7ecd2], 0xf2c14e);
  fins(b, 0.64, 1.1, 0x7a5bb5);
  b.box([0.8, 0.12, 1.3], [0, 0, 0], C.woodD, { sh: [0.88, 1.08] });
  b.box([0.66, 0.34, 0.7], [0, 0.12, 0.28], C.plaster, { sh: [0.9, 1.05] });
  b.prism(0.78, 0.2, 0.84, [0, 0.46, 0.28], 0xc48ca8, { sh: [0.9, 1.05] });
  b.box([0.5, 0.06, 0.2], [0, 0.12, 0.7], 0xf2c14e);
  for (const sx of [-1, 1]) b.box([0.03, 0.26, 0.03], [sx * 0.38, 0.12, -0.62], C.woodDD);
  b.rod([-0.38, 0.38, -0.62], [0.38, 0.38, -0.62], 0.016, C.rope, { seg: 3 });
  mount(b, 0.2, -0.72, -0.6, C.woodDD);
  rigging(b, 0.34, 0.6, 0.46, C.rope);
  b.rod([0, EY + 0.58, 0], [0, EY + 0.9, 0], 0.014, C.woodDD, { seg: 3 });
  for (const sx of [-1, 1]) g.box([0.03, 0.14, 0.18], [sx * 0.34, 0.2, 0.28], 0xffe2a0, { v: 0 });
  g.box([0.18, 0.14, 0.03], [0, 0.2, 0.64], 0xffe2a0, { v: 0 });
  g.box([0.07, 0.07, 0.07], [0, 0.04, 0.74], C.lampWarm, { v: 0 });
  return {
    body: b.build(), glow: g.build(),
    flag: { geo: pennant(B, 0xf2c14e, 0.42), pos: [0, EY + 0.9, 0] },
    prop: { geo: propeller(B, 0xf2c14e), pos: [0, 0.2, -0.72] },
    lamps: [[0, 0.1, 0.76], [0, 0.34, -0.5]],
    slots: [[-0.15, 0.12, -0.4], [0.15, 0.12, -0.4]],
    height: EY + 0.9,
  };
};

// Note: explorer, a slim teal envelope, a small gondola with a brass telescope and a tall mast.
SHIP_MODELS.explorer = (B, C) => {
  const b = new B(), g = new B();
  envelope(b, 0.5, 1.3, [0x4aa6b0, 0xf7ecd2, 0x4aa6b0, 0xf7ecd2]);
  fins(b, 0.5, 1.3, 0xf7ecd2);
  b.box([0.5, 0.16, 0.9], [0, 0, 0], C.woodL, { sh: [0.88, 1.08] });
  b.box([0.54, 0.04, 0.94], [0, 0.16, 0], C.woodD);
  b.box([0.3, 0.22, 0.34], [0, 0.2, -0.2], C.wood);
  b.rod([0, 0.38, 0.28], [0, 0.46, 0.8], 0.03, BRASS, { seg: 4 });
  b.cyl(0.06, 0.05, 0.07, 6, [0, 0.38, 0.28], BRASS_D, { c: true, r: [PI / 2, 0, 0] });
  b.rod([0, 0.42, 0.2], [0, 0.38, 0.3], 0.02, C.woodDD, { seg: 3 });
  b.box([0.06, 0.2, 0.06], [0, 0.2, 0.22], C.woodDD);
  mount(b, 0.14, -0.5, -0.44, C.woodDD);
  rigging(b, 0.25, 0.42, 0.2, C.rope);
  b.rod([0, EY + 0.45, 0], [0, EY + 0.95, 0], 0.014, C.woodDD, { seg: 3 });
  g.box([0.07, 0.07, 0.07], [0, 0.22, 0.46], C.lampWarm, { v: 0 });
  g.box([0.04, 0.1, 0.06], [0.16, 0.3, -0.2], 0xffe2a0, { v: 0 });
  g.box([0.04, 0.1, 0.06], [-0.16, 0.3, -0.2], 0xffe2a0, { v: 0 });
  return {
    body: b.build(), glow: g.build(),
    flag: { geo: pennant(B, 0xe0614f, 0.44), pos: [0, EY + 0.95, 0] },
    prop: { geo: propeller(B, C.metalD, 0.26), pos: [0, 0.14, -0.5] },
    lamps: [[0, 0.3, 0.46]],
    slots: [],
    height: EY + 0.95,
  };
};

// Note: military, a steel-blue and red long envelope over an armoured gondola with side cannons and a red ensign.
SHIP_MODELS.military = (B, C) => {
  const b = new B(), g = new B();
  const STEEL = 0x5a6a86, REDM = 0x9a3f3a, ARM = 0x6f7a86;
  envelope(b, 0.62, 1.4, [STEEL, REDM, STEEL, 0xc8d0da], 0xc8d0da);
  fins(b, 0.62, 1.4, REDM);
  b.box([0.7, 0.28, 1.3], [0, 0, 0], ARM, { sh: [0.85, 1.1] });
  b.box([0.74, 0.06, 1.34], [0, 0.28, 0], C.metalD);
  b.box([0.3, 0.2, 0.34], [0, 0.34, 0.25], STEEL);
  for (const sx of [-1, 1]) {
    b.rod([sx * 0.35, 0.14, 0.15], [sx * 0.62, 0.16, 0.5], 0.04, C.metalD, { seg: 4 });
    b.box([0.04, 0.22, 0.5], [sx * 0.35, 0.28, -0.35], C.metalD);
  }
  rigging(b, 0.34, 0.6, 0.34, C.metalD);
  mount(b, 0.2, -0.72, -0.64, C.metalD);
  b.rod([0, EY + 0.55, 0], [0, EY + 0.95, 0], 0.014, C.woodDD, { seg: 3 });
  g.box([0.2, 0.06, 0.03], [0, 0.4, 0.43], 0xffc66a, { v: 0 });
  for (const sx of [-1, 1]) g.box([0.03, 0.07, 0.07], [sx * 0.36, 0.12, 0.0], 0xff6a4a, { v: 0 });
  return {
    body: b.build(), glow: g.build(),
    flag: { geo: pennant(B, 0xb02a2a, 0.5), pos: [0, EY + 0.95, 0] },
    prop: { geo: propeller(B, C.metalD, 0.34), pos: [0, 0.2, -0.72] },
    lamps: [[0.36, 0.14, 0.0], [-0.36, 0.14, 0.0]],
    slots: [],
    height: EY + 0.95,
  };
};
