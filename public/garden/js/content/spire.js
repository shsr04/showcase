// Note: the Spire (Great Work) meshes: stage 0 foundation and shaft, stages 1..6 one rare good each, stage 7 the beacon crown.
import { LANDMARK_KITS, SPIRE, kitEnv, BRASS, BRASS_D } from './registry.js';

const PI = Math.PI;
const RAD = PI / 180;
export const SPIRE_STAGES = 8;
export const SPIRE_HEIGHT = 4.1;
const SHAFT_TOP = 3.75;
const FLOOR = 0.45;
const OBS = 0x2b2833;
const SULPHUR = 0xe6cf4e;

// Note: stage k (1..6) sits at 30 + 60 (k - 1) degrees from +z, radius 1.2 from the shaft axis.
const ang = (k) => (30 + 60 * (k - 1)) * RAD;
const at = (k, r) => [Math.sin(ang(k)) * r, Math.cos(ang(k)) * r];

// Note: every piece stands on the foundation and links to the shaft with an arm, so any build order stays connected.
function arm(b, k, y0, col) {
  const [px, pz] = at(k, 1.2);
  const [sx, sz] = at(k, 0.45);
  b.beam([px, y0, pz], [sx, y0 + 0.25, sz], 0.07, col);
}

function pedestal(b, k, C, h = 0.4) {
  const [px, pz] = at(k, 1.2);
  b.cyl(0.24, 0.28, h, 6, [px, FLOOR, pz], C.stoneL, { sh: [0.92, 1.04] });
  return [px, pz, FLOOR + h];
}

// Note: returns { body, glow } geometries for one stage in building-local coordinates.
export function buildSpireStage(stage, B, C) {
  const b = new B();
  const g = new B();
  if (stage === 0) {
    b.cyl(1.9, 2.0, 0.2, 8, [0, 0.0, 0], C.stoneD, { sh: [0.88, 1.02] });
    b.cyl(1.45, 1.55, 0.25, 8, [0, 0.2, 0], C.stone, { sh: [0.9, 1.04] });
    b.box([0.8, 0.12, 0.3], [0, 0.2, 1.62], C.stoneD);
    // Note: three shaft sections with brass collars and a cup on top.
    b.cyl(0.5, 0.62, 1.2, 8, [0, FLOOR, 0], C.stoneL, { sh: [0.92, 1.05] });
    b.cyl(0.54, 0.54, 0.07, 8, [0, 1.62, 0], BRASS);
    b.cyl(0.4, 0.5, 1.1, 8, [0, 1.65, 0], C.cream, { sh: [0.92, 1.05] });
    b.cyl(0.44, 0.44, 0.07, 8, [0, 2.72, 0], BRASS);
    b.cyl(0.3, 0.4, 0.9, 8, [0, 2.75, 0], C.stoneL, { sh: [0.92, 1.05] });
    b.cyl(0.4, 0.3, 0.2, 8, [0, 3.55, 0], BRASS_D);
    b.cyl(0.36, 0.4, 0.04, 8, [0, 3.71, 0], BRASS);
    b.box([0.3, 0.46, 0.05], [0, FLOOR, 0.57], C.woodDD);
    // Note: lit slits on four sides of the shaft.
    g.box([0.07, 0.3, 0.03], [0, 1.0, 0.54], 0xffe2a0);
    g.box([0.07, 0.3, 0.03], [0, 2.0, 0.46], 0xffe2a0);
    g.box([0.03, 0.3, 0.07], [0.46, 2.0, 0], 0xffe2a0);
    g.box([0.03, 0.3, 0.07], [-0.46, 2.0, 0], 0xffe2a0);
  } else if (stage === 1) {
    // Note: moonpearl, a pearl in a brass cradle.
    const [px, pz, y] = pedestal(b, 1, C);
    arm(b, 1, y - 0.1, C.stoneD);
    for (let i = 0; i < 4; i++) {
      const a = i * (PI / 2) + 0.7;
      b.beam([px + Math.sin(a) * 0.2, y, pz + Math.cos(a) * 0.2], [px + Math.sin(a) * 0.1, y + 0.55, pz + Math.cos(a) * 0.1], 0.035, BRASS);
    }
    g.sph(0.27, [px, y + 0.36, pz], 0xeaf0ff, { ws: 8, hs: 5, v: 0 });
  } else if (stage === 2) {
    // Note: prism, a cluster of tall crystals.
    const [px, pz, y] = pedestal(b, 2, C);
    arm(b, 2, y - 0.1, C.stoneD);
    b.oct(0.2, [px, y + 0.5, pz], 0x8fe7ff, { s: [0.6, 2.4, 0.6], sh: [0.85, 1.15] });
    b.oct(0.14, [px + 0.14, y + 0.3, pz + 0.06], 0xbff4ff, { s: [0.6, 2.0, 0.6], r: [0.1, 0.5, -0.3], sh: [0.85, 1.15] });
    b.oct(0.12, [px - 0.14, y + 0.25, pz - 0.05], 0xa8c8ff, { s: [0.6, 1.9, 0.6], r: [-0.1, 1, 0.3], sh: [0.85, 1.15] });
    g.oct(0.07, [px, y + 1.02, pz], 0xe6fbff, { v: 0 });
  } else if (stage === 3) {
    // Note: obsidian, black spikes with glowing cracks.
    const [px, pz, y] = pedestal(b, 3, C);
    arm(b, 3, y - 0.1, C.stoneD);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      const h = 0.34 + (i % 3) * 0.14;
      b.oct(0.1, [px + Math.sin(a) * 0.12, y + h * 0.9, pz + Math.cos(a) * 0.12], OBS, { s: [0.7, h * 5.2, 0.7], r: [Math.cos(a) * 0.35, a, -Math.sin(a) * 0.35], sh: [0.8, 1.2] });
    }
    g.box([0.04, 0.12, 0.03], [px - 0.1, y + 0.02, pz + 0.22], 0xff9a3c, { v: 0.04 });
    g.box([0.04, 0.1, 0.03], [px + 0.1, y + 0.02, pz + 0.23], 0xff9a3c, { v: 0.04 });
  } else if (stage === 4) {
    // Note: sulphur, a vent basin with yellow rocks.
    const [px, pz, y] = pedestal(b, 4, C, 0.28);
    arm(b, 4, y - 0.1, C.stoneD);
    b.cyl(0.38, 0.3, 0.12, 6, [px, y, pz], C.stoneD);
    [[0.0, 0.0, 0.22], [0.2, 0.08, 0.14], [-0.18, -0.06, 0.15], [0.05, -0.2, 0.12]].forEach(([dx, dz, r], i) => {
      b.oct(r, [px + dx, y + 0.12 + r * 0.7, pz + dz], SULPHUR, { s: [1, 0.9, 1], r: [0, i, 0], sh: [0.85, 1.1] });
    });
    b.cone(0.1, 0.26, 5, [px + 0.02, y + 0.46, pz + 0.0], SULPHUR);
    g.disc(0.05, [px + 0.02, y + 0.73, pz], 0xfff090, { r: [-PI / 2, 0, 0], seg: 5, v: 0 });
  } else if (stage === 5) {
    // Note: everbloom, a small tree in bloom with glowing petals.
    const [px, pz, y] = pedestal(b, 5, C, 0.3);
    arm(b, 5, y - 0.1, C.stoneD);
    b.cyl(0.06, 0.09, 0.5, 5, [px, y, pz], C.woodD);
    b.sph(0.32, [px, y + 0.7, pz], C.leaf, { ws: 6, hs: 4, sh: [0.85, 1.1] });
    b.sph(0.2, [px + 0.2, y + 0.55, pz + 0.08], C.leafL, { ws: 5, hs: 3, sh: [0.85, 1.1] });
    b.sph(0.18, [px - 0.2, y + 0.5, pz - 0.06], C.leaf, { ws: 5, hs: 3, sh: [0.85, 1.1] });
    [[0.2, 0.95, 0.12], [-0.12, 0.98, -0.16], [0.0, 0.85, 0.3], [-0.26, 0.74, 0.1]].forEach(([dx, dy, dz]) => {
      g.sph(0.06, [px + dx, y + dy - 0.02, pz + dz], 0xcdeeff, { ws: 4, hs: 3, v: 0 });
    });
  } else if (stage === 6) {
    // Note: sunstone, a tall brass mast with a golden orb and ring.
    const [px, pz, y] = pedestal(b, 6, C);
    arm(b, 6, y - 0.1, C.stoneD);
    b.cyl(0.05, 0.08, 1.35, 5, [px, y, pz], BRASS);
    b.box([0.3, 0.04, 0.04], [px, y + 0.5, pz], BRASS_D);
    g.sph(0.2, [px, y + 1.5, pz], 0xffd24a, { ws: 7, hs: 4, v: 0 });
    g.torus(0.3, 0.025, [px, y + 1.5, pz], 0xffe48a, { rs: 3, ts: 8, v: 0 });
  } else {
    // Note: crown, four brass prongs over the shaft cup holding the beacon.
    for (let i = 0; i < 4; i++) {
      const a = i * (PI / 2) + PI / 4;
      b.beam([Math.sin(a) * 0.34, SHAFT_TOP, Math.cos(a) * 0.34], [Math.sin(a) * 0.12, SHAFT_TOP + 0.5, Math.cos(a) * 0.12], 0.05, BRASS);
    }
    b.cone(0.1, 0.18, 5, [0, SHAFT_TOP + 0.42, 0], BRASS_D);
    g.sph(0.26, [0, SHAFT_TOP + 0.32, 0], 0xfff0b0, { ws: 7, hs: 4, v: 0 });
    g.box([0.04, 0.5, 0.04], [0, SHAFT_TOP + 0.6, 0], 0xfff6d0, { v: 0 });
  }
  return { body: b.build(), glow: g.build() };
}

SPIRE.buildStage = buildSpireStage;
SPIRE.stages = SPIRE_STAGES;
SPIRE.height = SPIRE_HEIGHT;

// Note: the greatwork building shows stage 0 only; completed stages are added by the integrator through SPIRE.buildStage.
LANDMARK_KITS.greatwork = (c, B, C) => {
  const X = kitEnv(c);
  c.mesh('m', () => buildSpireStage(0, B, C).body);
  X.lit('g0', () => buildSpireStage(0, B, C).glow);
  X.lamp(0, 3.4, 0);
  c.ud.height = SPIRE_HEIGHT;
};
