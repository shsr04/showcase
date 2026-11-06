// Note: tier kits for workshops A (sawmill, brickkiln, smelter, smithy); see /tmp/claude-plan-garden-tier-revision.md and the catalog.
import { Vector3 } from 'three';
import { TIER_KITS } from './registry.js';

const PI2 = Math.PI / 2;
const AX = new Vector3(1, 0, 0);
const AY = new Vector3(0, 1, 0);
const _p = new Vector3();
const _ax = new Vector3();

// Note: rotate a mesh about an axis through pivot P; at angle 0 it stays where it was built (geometry is in building space).
function turn(mesh, P, axis, ang) {
  mesh.quaternion.setFromAxisAngle(axis, ang);
  mesh.position.copy(P).sub(_p.copy(P).applyQuaternion(mesh.quaternion));
}

// Note: T1 lantern post with a self-lit lamp at the front-right corner, on the plinth edge.
function lantern(c, K, pf) {
  const x = 0.93 * K.half;
  c.mesh('ln', () => new K.B().rod([x, 0, pf], [x, 0.52, pf], 0.035, K.C.woodDD).build());
  K.lit('lm', () => new K.B().box([0.1, 0.1, 0.1], [x, 0.5, pf], K.C.lampWarm).build());
  K.lamp(x, 0.55, pf);
  return new Vector3(x, 0.6, pf);
}

// Note: T2 cloth shelter over the S slot; the back edge rests on the building or on rear posts, the front on two posts.
function canopy(c, K, o) {
  const { C, B } = K;
  const { x, by, bz, fy, fz, rear = false, w = 0.46 } = o;
  const dz = fz - bz;
  const dy = by - fy;
  const L = Math.hypot(dz, dy);
  const th = Math.atan2(dy, dz);
  c.mesh('awn', () => {
    const b = new B();
    for (const s of [-1, 1]) {
      b.rod([x + (s * w) / 2, 0, fz], [x + (s * w) / 2, fy + 0.01, fz], 0.025, C.woodL);
      if (rear) b.rod([x + (s * w) / 2, 0, bz], [x + (s * w) / 2, by, bz], 0.025, C.woodL);
    }
    return b.build();
  });
  const cloth = c.mesh('cloth', () => new B().box([w + 0.06, 0.03, L + 0.04], [x, (by + fy) / 2, (bz + fz) / 2], K.FLAG_COLS[K.v], { r: [th, 0, 0], c: true }).build());
  const P = new Vector3(x, by, bz);
  K.sway((t, wind) => turn(cloth, P, AX, Math.sin(t * 2.2 + K.v) * (0.02 + wind * 0.06)));
  // Note: lamp hangs under the cloth near the front edge.
  const f = 0.7;
  const yu = by - dy * f - 0.02;
  const zl = bz + dz * f;
  K.lit('lit2', () => new B().box([0.08, 0.09, 0.08], [x, yu - 0.08, zl], C.lampWarm).build());
  K.lamp(x, yu - 0.04, zl);
}

// Note: T3 stone block bench with a plank seat at the C slot.
function bench(c, K, pf) {
  const x = 0.6 * K.half;
  c.mesh('bench', () => {
    const b = new K.B();
    b.box([0.3, 0.2, 0.14], [x, 0, pf + 0.02], K.C.stoneD);
    b.box([0.46, 0.05, 0.2], [x, 0.2, pf + 0.07], K.C.woodL);
    return b.build();
  });
}

// Note: T4 planters flank the door line at x = +-0.3 half.
function planters(c, K, pf) {
  const flower = [0xe8688a, 0xf0c64a, 0xf4f1e8, 0xb89be0][K.v];
  c.mesh('plant', () => {
    const b = new K.B();
    for (const s of [-1, 1]) {
      const x = 0.3 * K.half * s;
      b.box([0.18, 0.1, 0.12], [x, 0, pf + 0.05], K.C.woodD);
      b.oct(0.08, [x, 0.14, pf + 0.05], s > 0 ? flower : K.C.leafL);
    }
    return b.build();
  });
}

// Note: T4 string lights from the lantern lamp to B; cord and bulbs sway together about the anchor axis.
function strings(c, K, A, Bp, sag) {
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const u = i / 3;
    pts.push(new Vector3().lerpVectors(A, Bp, u).add(new Vector3(0, -sag * 4 * u * (1 - u), 0)));
  }
  const cord = c.mesh('strcord', () => {
    const b = new K.B();
    for (let i = 0; i < 3; i++) b.rod(pts[i].toArray(), pts[i + 1].toArray(), 0.011, K.C.woodDD, { seg: 3 });
    return b.build();
  });
  const bulbs = K.lit('strbulbs', () => {
    const b = new K.B();
    for (let i = 1; i < 3; i++) b.oct(0.032, [pts[i].x, pts[i].y - 0.03, pts[i].z], i % 2 ? K.C.lampWarm : 0xffe9b0);
    return b.build();
  });
  const axis = _ax.copy(Bp).sub(A).normalize().clone();
  K.sway((t) => {
    const a = Math.sin(t * 1.6 + K.v) * 0.25;
    turn(cord, A, axis, a);
    turn(bulbs, A, axis, a);
  });
}

// Note: T4 glowing sign board mounted flush on a wall or fascia.
function sign(c, K, size, pos) {
  K.lit('sign', () => new K.B().box(size, pos, K.C.lampWarm).build());
}

// Note: vane mast stands in a roof and carries a pointer that turns with the wind.
function vane(c, K, mast, top, build) {
  const m = c.mesh('vane', () => {
    const b = new K.B();
    b.rod([mast[0], mast[1], mast[2]], [mast[0], top, mast[2]], 0.02, K.C.woodDD);
    build(b);
    return b.build();
  });
  const P = new Vector3(mast[0], 0, mast[2]);
  K.sway((t, wind) => turn(m, P, AY, Math.sin(t * 0.9 + K.v) * 0.4 + wind * 0.5));
}

// Note: sawmill has no chimney; T3 log crane and log pile at the left side, T4 saw blade vane and plank rack lean-to.
TIER_KITS.sawmill = (c, K) => {
  const { C, B, t } = K;
  const pf = 0.95;
  const lamp = lantern(c, K, pf);
  if (t >= 2) {
    // Note: planed fascia under the front roof edge, cloth shelter and plank stack at the S slot.
    c.mesh('trim', () => new B().box([1.9, 0.06, 0.04], [0, 0.8, 0.97], C.woodL).build());
    canopy(c, K, { x: -0.65, by: 0.86, bz: 0.97, fy: 0.6, fz: 1.35 });
    c.mesh('rack', () => new B().box([0.44, 0.12, 0.28], [-0.65, 0, 1.1], C.woodL, { sh: [0.9, 1.08] }).build());
  }
  if (t >= 3) {
    // Note: crane foot is stone and overlaps the plinth; the log hangs on a rope from the jib.
    c.mesh('crane', () => {
      const b = new B();
      b.box([0.34, 0.12, 0.34], [-1.1, 0, -0.05], C.stone);
      b.box([0.1, 1.18, 0.1], [-1.1, 0.12, -0.05], C.woodD);
      b.rod([-1.1, 1.25, -0.1], [-1.1, 1.25, 0.75], 0.03, C.woodDD);
      b.rod([-1.1, 0.7, 0.72], [-1.1, 1.25, 0.72], 0.012, C.rope, { seg: 3 });
      b.cyl(0.07, 0.07, 0.34, 4, [-1.1, 0.63, 0.72], C.wood, { c: true, r: [PI2, 0, 0] });
      return b.build();
    });
    c.mesh('pile', () => {
      const b = new B();
      b.cyl(0.07, 0.07, 0.5, 4, [-1.17, 0.07, 0.4], C.woodD, { c: true, r: [PI2, 0, 0] });
      b.cyl(0.07, 0.07, 0.5, 4, [-1.03, 0.07, 0.4], C.wood, { c: true, r: [PI2, 0, 0] });
      return b.build();
    });
    bench(c, K, pf);
    K.lit('porch', () => new B().box([0.09, 0.1, 0.09], [0.55, 0.7, 0.78], C.lampWarm).build());
    K.lamp(0.55, 0.75, 0.78);
  }
  if (t >= 4) {
    vane(c, K, [0.55, 1.0, -0.72], 1.62, (b) => {
      b.cyl(0.14, 0.14, 0.02, 6, [0.55, 1.56, -0.72], K.GOLD, { c: true, r: [PI2, 0, 0] });
    });
    sign(c, K, [0.34, 0.16, 0.03], [-0.15, 0.66, 0.985]);
    // Note: lean-to roof leans on the main roof edge and rests on a tall plank stack at its outer end.
    const th = Math.atan2(0.2, 0.44);
    c.mesh('lean', () => {
      const b = new B();
      b.box([Math.hypot(0.44, 0.2) + 0.06, 0.04, 0.8], [1.18, 0.86, -0.3], C.woodD, { r: [0, 0, -th], c: true });
      b.box([0.16, 0.74, 0.6], [1.32, 0, -0.3], C.woodL, { sh: [0.9, 1.08] });
      return b.build();
    });
    planters(c, K, pf);
    strings(c, K, lamp, new Vector3(0.3, 0.81, 0.97), 0.1);
  }
};

// Note: brickkiln T3 tall stack extends the base stack (its smoke moves to the new top); T4 brass band, tile lean-to.
TIER_KITS.brickkiln = (c, K) => {
  const { C, B, t } = K;
  const pf = 0.975;
  const lamp = lantern(c, K, pf);
  if (t >= 2) {
    canopy(c, K, { x: -0.65, by: 0.72, bz: pf + 0.02, fy: 0.6, fz: pf + 0.385, rear: true });
    c.mesh('rack', () => {
      const b = new B();
      b.box([0.4, 0.06, 0.26], [-0.65, 0, pf + 0.14], C.woodD);
      b.box([0.32, 0.12, 0.2], [-0.65, 0.06, pf + 0.14], C.brick, { r: [0, 0.08, 0], sh: [0.9, 1.08] });
      return b.build();
    });
  }
  if (t >= 3) {
    c.ud.smoke = null;
    c.mesh('stack', () => new B().cyl(0.12, 0.085, 0.62, 6, [0.4, 1.34, -0.5], C.brick, { sh: [0.9, 1.08] }).build());
    K.plume(0.4, 1.99, -0.5);
    c.mesh('hearth', () => new B().box([0.8, 0.04, 0.22], [-0.2, 0.05, 0.84], C.stoneL).build());
    bench(c, K, pf);
    K.lit('porch', () => new B().box([0.08, 0.1, 0.08], [0.12, 0.2, 0.55], C.lampWarm).build());
    K.lamp(0.12, 0.25, 0.55);
  }
  if (t >= 4) {
    c.mesh('band', () => new B().cyl(0.115, 0.115, 0.05, 6, [0.4, 1.72, -0.5], K.GOLD).build());
    // Note: lean-to roof rests on the dome side and on a brick stack at its outer end.
    const th = Math.atan2(0.14, 0.5);
    c.mesh('lean', () => {
      const b = new B();
      b.box([Math.hypot(0.5, 0.14) + 0.06, 0.04, 0.8], [-1.1, 0.45, -0.1], C.brickD, { r: [0, 0, th], c: true });
      b.box([0.2, 0.36, 0.5], [-1.28, 0, -0.1], C.brick, { sh: [0.9, 1.08] });
      b.box([0.26, 0.14, 0.44], [-1.08, 0, -0.1], C.brickD, { sh: [0.9, 1.08] });
      return b.build();
    });
    sign(c, K, [0.2, 0.12, 0.03], [0.4, 0.9, -0.385]);
    planters(c, K, pf);
    strings(c, K, lamp, new Vector3(-0.42, 0.7, pf + 0.02), 0.1);
  }
};

// Note: smelter T3 wide hood on the base stack with an ember ring (smoke moves to the hood); T4 brass rim, sparks, mold lean-to.
TIER_KITS.smelter = (c, K) => {
  const { C, B, t } = K;
  const pf = 0.95;
  const lamp = lantern(c, K, pf);
  if (t >= 2) {
    canopy(c, K, { x: -0.65, by: 0.72, bz: pf + 0.02, fy: 0.6, fz: pf + 0.385, rear: true });
    c.mesh('rack', () => {
      const b = new B();
      b.box([0.44, 0.06, 0.26], [-0.65, 0, pf + 0.14], C.stoneD);
      b.box([0.36, 0.06, 0.1], [-0.65, 0.06, pf + 0.14], C.metal, { sh: [0.95, 1.1] });
      return b.build();
    });
  }
  if (t >= 3) {
    c.ud.smoke = null;
    c.mesh('hood', () => new B().cyl(0.2, 0.32, 0.16, 6, [-0.1, 1.78, -0.05], C.stoneL, { sh: [0.9, 1.05] }).build());
    K.lit('ember', () => new B().cyl(0.18, 0.18, 0.05, 6, [-0.1, 1.64, -0.05], C.ember).build());
    K.lamp(-0.1, 1.67, -0.05);
    K.plume(-0.1, 1.98, -0.05);
    bench(c, K, pf);
    K.lit('porch', () => new B().box([0.08, 0.1, 0.08], [0.3, 0.25, 0.4], C.lampWarm).build());
    K.lamp(0.3, 0.3, 0.4);
  }
  if (t >= 4) {
    c.mesh('rim', () => new B().cyl(0.33, 0.33, 0.04, 6, [-0.1, 1.92, -0.05], K.GOLD).build());
    // Note: two sparks shrink and rise from the hood mouth in turn; at rest they sit inside the rim.
    const sp = [[-0.16, 1.96, -0.08, 0], [-0.03, 1.96, -0.02, 0.5]].map(([x, y, z, off], i) => {
      const m = c.mesh(`spark${i + 1}`, () => new B().oct(0.028, [x, y, z], 0xffd86a).build(), K.MATS.glow);
      return { m, P: new Vector3(x, y, z), off };
    });
    K.sway((time) => {
      for (const s of sp) {
        const ph = (time * 0.7 + s.off) % 1;
        const k = 1 - ph;
        s.m.scale.setScalar(k);
        s.m.position.set(s.P.x * (1 - k), s.P.y * (1 - k) + ph * 0.38, s.P.z * (1 - k));
      }
    });
    // Note: lean-to roof leans on the furnace box side and rests on an outer wall board.
    const th = Math.atan2(0.14, 0.5);
    c.mesh('lean', () => {
      const b = new B();
      b.box([Math.hypot(0.5, 0.14) + 0.06, 0.04, 0.5], [0.69, 0.43, -0.3], C.woodD, { r: [0, 0, -th], c: true });
      b.box([0.06, 0.36, 0.5], [0.93, 0, -0.3], C.woodL);
      b.box([0.3, 0.12, 0.4], [0.65, 0, -0.3], C.stoneD);
      return b.build();
    });
    sign(c, K, [0.3, 0.08, 0.03], [-0.1, 0.47, 0.405]);
    planters(c, K, pf);
    strings(c, K, lamp, new Vector3(-0.42, 0.7, pf + 0.02), 0.1);
  }
};

// Note: smithy T3 forge chimney extends the base chimney (smoke moves to the new top), quench trough, bench; T4 hammer vane, coal shed.
TIER_KITS.smithy = (c, K) => {
  const { C, B, t } = K;
  const pf = 0.95;
  const lamp = lantern(c, K, pf);
  if (t >= 2) {
    c.mesh('trim', () => new B().box([1.62, 0.05, 0.04], [0, 0.7, 0.94], C.woodL).build());
    canopy(c, K, { x: -0.65, by: 0.74, bz: 0.93, fy: 0.55, fz: 1.33 });
    c.mesh('rack', () => {
      const b = new B();
      b.box([0.4, 0.3, 0.04], [-0.65, 0, 1.03], C.woodD);
      b.rod([-0.84, 0.24, 1.06], [-0.46, 0.24, 1.06], 0.014, C.metalD, { seg: 3 });
      return b.build();
    });
    K.lit('win', () => new B().box([0.04, 0.2, 0.2], [0.73, 0.3, -0.38], C.lampWarm).build());
  }
  if (t >= 3) {
    c.ud.smoke = null;
    c.mesh('flue', () => {
      const b = new B();
      b.box([0.16, 0.52, 0.16], [0.5, 1.47, -0.5], C.stone);
      b.box([0.24, 0.05, 0.24], [0.5, 1.99, -0.5], C.stoneD);
      return b.build();
    });
    K.plume(0.5, 2.06, -0.5);
    c.mesh('trough', () => {
      const b = new B();
      b.box([0.46, 0.14, 0.2], [0.4, 0.05, 0.62], C.stoneD);
      b.box([0.38, 0.02, 0.12], [0.4, 0.18, 0.62], 0x7fb7d6);
      return b.build();
    });
    bench(c, K, pf);
    K.lit('porch', () => new B().box([0.08, 0.1, 0.08], [-0.72, 0.6, 0.86], C.lampWarm).build());
    K.lamp(-0.72, 0.65, 0.86);
  }
  if (t >= 4) {
    c.mesh('band', () => new B().box([0.21, 0.04, 0.21], [0.5, 1.75, -0.5], K.GOLD).build());
    vane(c, K, [-0.5, 1.05, -0.38], 1.55, (b) => {
      b.rod([-0.5, 1.5, -0.62], [-0.5, 1.5, -0.14], 0.012, K.GOLD, { seg: 3 });
      b.box([0.07, 0.1, 0.06], [-0.5, 1.45, -0.17], K.GOLD);
    });
    // Note: coal shed leans on the right wall and rests on an outer board.
    const th = Math.atan2(0.18, 0.44);
    c.mesh('lean', () => {
      const b = new B();
      b.box([Math.hypot(0.44, 0.18) + 0.06, 0.04, 0.7], [0.93, 0.51, -0.38], C.woodDD, { r: [0, 0, -th], c: true });
      b.box([0.08, 0.4, 0.6], [1.12, 0, -0.38], C.woodD);
      b.oct(0.13, [0.92, 0.12, -0.38], C.dark);
      return b.build();
    });
    sign(c, K, [0.3, 0.14, 0.03], [-0.1, 0.56, 0.94]);
    planters(c, K, pf);
    strings(c, K, lamp, new Vector3(0.4, 0.72, 0.94), 0.08);
  }
};
