// Note: infrastructure kits: airdock (3, a sky pier, ships moor at c.ud.moors[slot]) and memorial (1, deed icon chosen by c.v).
import { LANDMARK_KITS, ENV, kitEnv, ROOF, BRASS, BRASS_D } from '../registry.js';

const PI = Math.PI;
const GLOW_WIN = 0xffe2a0;
const PENNANT = [0xdb5a4a, 0x4aa6b0, 0xf2c14a, 0x8b6fd0];

// Note: airdock, a sky pier: the 3x3 land block (shed, crates, sock pole) plus a timber pier along local +x over the void; the view yaws the group by pierYaw(b.dir).
// Note: tiers grow with c.tier (0..2 small, 3 middle, 4 grand); the two ring posts, one per hull slot at z = -PZ and +PZ, are kept in c.ud.moors.
LANDMARK_KITS.airdock = (c, B, C) => {
  const X = kitEnv(c);
  const T = c.tier >= 4 ? 3 : c.tier === 3 ? 2 : 1;
  const roof = ROOF[(c.v + 2) & 3];
  const PX = 3.9, PZ = 0.68, MY = 2.1;
  const sh = T === 1 ? { x0: -1.4, x1: -0.4, z0: -1.0, z1: 0.2, h: 0.8, rh: 0.45 }
    : T === 2 ? { x0: -1.45, x1: -0.35, z0: -1.45, z1: 0.45, h: 0.92, rh: 0.5 }
      : { x0: -1.45, x1: -0.25, z0: -1.45, z1: 0.55, h: 1.02, rh: 0.55 };
  const xc = (sh.x0 + sh.x1) / 2, zc = (sh.z0 + sh.z1) / 2, sw = sh.x1 - sh.x0, sd = sh.z1 - sh.z0;
  const ridge = 0.04 + sh.h + sh.rh;
  c.mesh('m', () => {
    const b = new B();
    // Note: timber floor over the land block.
    b.box([3.0, 0.17, 3.0], [0, -0.1, 0], C.woodL, { sh: [0.88, 1.05] });
    // Note: shed with its door facing the pier and a two slab roof.
    b.box([0.08, sh.h, sd], [sh.x0 + 0.04, 0.07, zc], C.plaster, { sh: [0.92, 1.04] });
    for (const z of [sh.z0 + 0.04, sh.z1 - 0.04]) b.box([sw, sh.h, 0.08], [xc, 0.07, z], C.plaster, { sh: [0.92, 1.04] });
    b.box([0.08, sh.h, sd], [sh.x1 - 0.04, 0.07, zc], C.plaster, { sh: [0.92, 1.04] });
    b.box([0.04, 0.62, 0.42], [sh.x1 + 0.01, 0.07, zc], 0x5b4a40);
    const hw = sw / 2 + 0.05, a = Math.atan2(sh.rh, hw), L = Math.hypot(hw, sh.rh) + 0.04;
    for (const s of [-1, 1]) b.box([L, 0.07, sd + 0.12], [xc + s * hw / 2, 0.07 + sh.h + sh.rh / 2 - 0.035, zc], roof, { r: [0, 0, -s * a], c: true, sh: [0.94, 1.06] });
    // Note: crates and a barrel at the pier root.
    b.box([0.32, 0.26, 0.32], [0.45, 0.07, 1.0], C.wood, { sh: [0.9, 1.05] });
    b.cyl(0.12, 0.11, 0.3, 5, [1.0, 0.07, 0.95], C.woodD);
    if (T >= 2) b.box([0.3, 0.26, 0.3], [-0.2, 0.07, 1.1], C.woodL, { sh: [0.9, 1.05] });
    // Note: the pier, a deck with two cross planks, braced back into the rock below.
    b.box([4.2, 0.1, 1.2], [3.4, -0.04, 0], C.wood, { sh: [0.9, 1.05] });
    for (let k = 0; k < 2; k++) b.box([0.08, 0.03, 1.22], [2.4 + k * 2.2, 0.06, 0], C.woodL);
    b.beam([1.45, -0.8, 0], [3.2, -0.12, 0], 0.1, C.woodD);
    if (T >= 2) b.beam([1.45, -0.8, 0], [4.8, -0.12, 0], 0.09, C.woodD);
    // Note: gate masts with a crossbar and a lantern, ring posts, and cable stays from the masts over the ring posts to the pier tip.
    for (const s of [-1, 1]) {
      b.box([0.12, 2.5, 0.12], [1.8, 0.06, s * 0.62], C.woodD, { sh: [0.9, 1.05] });
      b.box([0.17, 2.2, 0.17], [PX, 0.06, s * PZ], C.woodDD, { sh: [0.9, 1.05] });
      b.torus(0.17, 0.025, [PX, MY - 0.05, s * PZ], BRASS, { rs: 3, ts: 4, v: 0 });
      b.rod([1.8, 2.5, s * 0.62], [PX, 2.25, s * PZ], 0.014, C.rope, { seg: 3 });
      b.rod([PX, 2.3, s * PZ], [5.4, 0.1, s * 0.58], 0.014, C.rope, { seg: 3 });
    }
    b.box([0.1, 0.1, 1.24], [1.8, 2.3, 0], C.woodD);
    b.rod([1.8, 2.3, 0], [1.8, 2.1, 0], 0.012, C.rope, { seg: 3 });
    // Note: flag pole at the pier tip, wind sock pole on the land.
    b.box([0.09, 2.0, 0.09], [5.4, 0.06, 0], C.woodDD);
    b.box([0.09, 2.1, 0.09], [0.75, 0.07, -1.2], C.woodDD);
    if (T >= 2) b.box([0.06, 0.7, 0.06], [xc, ridge - 0.08, zc], C.woodDD);
    if (T >= 3) {
      // Note: beacon tower at the back corner, a tapered shaft under a small cone roof.
      b.cyl(0.34, 0.26, 1.7, 5, [-1.05, 0.07, 1.05], C.plaster, { sh: [0.9, 1.04] });
      for (const s of [-1, 1]) b.rod([-1.05 + s * 0.22, 1.74, 1.05], [-1.05 + s * 0.22, 2.17, 1.05], 0.03, C.woodDD, { seg: 3 });
      b.cone(0.38, 0.45, 4, [-1.05, 2.15, 1.05], roof);
    }
    return b.build();
  });
  // Note: lantern boxes hang from the gate and the stays.
  X.lit('lanterns', () => {
    const b = new B();
    b.box([0.16, 0.2, 0.16], [1.8, 1.9, 0], GLOW_WIN);
    if (T >= 2) {
      for (const s of [-1, 1]) {
        b.rod([2.85, 2.38, s * 0.65], [2.85, 2.1, s * 0.65], 0.012, C.rope, { seg: 3 });
        b.box([0.14, 0.18, 0.14], [2.85, 1.92, s * 0.65], GLOW_WIN);
      }
    }
    return b.build();
  });
  X.lit('win', () => {
    const b = new B();
    b.box([0.22, 0.24, 0.03], [xc, 0.4, sh.z1 - 0.01], GLOW_WIN);
    if (T >= 2) b.box([0.22, 0.24, 0.03], [xc, 0.4, sh.z0 + 0.01], GLOW_WIN);
    return b.build();
  });
  X.lit('beacon', () => {
    const b = new B();
    b.sph(0.09, [5.4, 2.08, 0], 0xff8a6a, { ws: 4, hs: 2, v: 0 });
    if (T >= 3) b.sph(0.16, [-1.05, 1.97, 1.05], 0xff8a6a, { ws: 4, hs: 2, v: 0 });
    return b.build();
  });
  // Note: flags and the sock swing from pivots.
  const pf = X.pivot(5.4, 1.78, 0);
  c.mesh('flag', () => new B().box([0.5, 0.28, 0.02], [0.27, 0, 0], PENNANT[c.v % 4], { v: 0.03 }).build(), undefined, pf);
  const ps = X.pivot(0.75, 2.0, -1.2);
  c.mesh('sock', () => {
    const b = new B();
    const r = [0.1, 0.085, 0.07, 0.055];
    for (let k = 0; k < 3; k++) b.cyl(r[k], r[k + 1], 0.14, 4, [k * 0.14, 0, 0], k === 1 ? 0xdb5a4a : C.plaster, { open: true, r: [0, 0, -PI / 2], v: 0 });
    return b.build();
  }, undefined, ps);
  let pg = null;
  if (T >= 2) {
    pg = X.pivot(xc, ridge + 0.55, zc);
    c.mesh('pennant', () => new B().box([0.36, 0.14, 0.02], [0.19, 0, 0], PENNANT[(c.v + 1) % 4], { v: 0.03 }).build(), undefined, pg);
  }
  X.sway((t, w) => {
    pf.rotation.y = Math.sin(t * 2.1) * (0.1 + w * 0.3);
    ps.rotation.y = Math.sin(t * 1.3 + 1) * (0.12 + w * 0.25);
    ps.rotation.z = -Math.max(0, 0.6 - w * 0.8);
    if (pg) pg.rotation.y = Math.sin(t * 2.6 + 2) * (0.1 + w * 0.3);
  });
  X.lamp(1.8, 2.0, 0);
  X.lamp(5.4, 2.08, 0);
  if (T >= 3) X.lamp(-1.05, 1.97, 1.05);
  else X.lamp(xc, 0.5, zc);
  c.ud.moors = [new ENV.Vector3(PX, MY, -PZ), new ENV.Vector3(PX, MY, PZ)];
  c.ud.moor = c.ud.moors[0];
};

// Note: memorial, a stone pedestal under a brass icon; icon by deed: 0 bridge arch, 1 master anvil, 2 parent pair, 3 hero sword.
LANDMARK_KITS.memorial = (c, B, C) => {
  const X = kitEnv(c);
  const deed = c.v & 3;
  c.mesh('m', () => {
    const b = new B();
    b.box([0.92, 0.12, 0.92], [0, -0.2, 0], C.stoneD, { sh: [0.88, 1] });
    b.box([0.64, 0.1, 0.64], [0, -0.08, 0], C.stoneL, { sh: [0.92, 1.04] });
    b.box([0.46, 0.4, 0.46], [0, 0.02, 0], C.stone, { sh: [0.92, 1.05] });
    b.box([0.54, 0.06, 0.54], [0, 0.42, 0], C.stoneL);
    const y = 0.48;
    if (deed === 0) {
      // Note: bridge, two piers and an arched deck.
      b.box([0.1, 0.26, 0.12], [-0.17, y, 0], BRASS);
      b.box([0.1, 0.26, 0.12], [0.17, y, 0], BRASS);
      b.box([0.5, 0.08, 0.14], [0, y + 0.26, 0], BRASS);
      b.torus(0.12, 0.025, [0, y + 0.12, 0], BRASS_D, { rs: 3, ts: 6, v: 0 });
    } else if (deed === 1) {
      // Note: master, an anvil with a hammer.
      b.box([0.3, 0.1, 0.18], [0, y, 0], BRASS_D);
      b.box([0.14, 0.08, 0.12], [0, y + 0.1, 0], BRASS);
      b.box([0.36, 0.08, 0.14], [0, y + 0.18, 0], BRASS);
      b.cone(0.07, 0.12, 4, [0.17, y + 0.18, 0], BRASS, { r: [0, 0, -PI / 2] });
      b.rod([-0.02, y + 0.25, 0.0], [-0.15, y + 0.52, 0.0], 0.02, C.woodDD, { seg: 4 });
      b.box([0.16, 0.08, 0.08], [-0.15, y + 0.48, 0], BRASS_D);
    } else if (deed === 2) {
      // Note: parent, a tall and a small figure side by side.
      b.cyl(0.07, 0.09, 0.3, 5, [-0.08, y, 0], BRASS);
      b.sph(0.07, [-0.08, y + 0.38, 0], BRASS, { ws: 5, hs: 3, v: 0 });
      b.cyl(0.05, 0.06, 0.18, 5, [0.1, y, 0], BRASS_D);
      b.sph(0.05, [0.1, y + 0.25, 0], BRASS_D, { ws: 5, hs: 3, v: 0 });
      b.box([0.1, 0.03, 0.03], [0.0, y + 0.16, 0], BRASS);
    } else {
      // Note: hero, an upright sword with a crossguard.
      b.box([0.05, 0.46, 0.02], [0, y + 0.1, 0], 0xe6e9ee);
      b.cone(0.03, 0.1, 4, [0, y + 0.56, 0], 0xe6e9ee, { s: [1, 1, 0.5] });
      b.box([0.26, 0.04, 0.05], [0, y + 0.12, 0], BRASS);
      b.box([0.06, 0.1, 0.06], [0, y, 0], BRASS_D);
    }
    return b.build();
  });
  X.lit('flame', () => new B().box([0.08, 0.1, 0.03], [0, 0.1, 0.25], 0xffd88a, { v: 0 }).build());
  X.lamp(0, 0.2, 0.3);
};
