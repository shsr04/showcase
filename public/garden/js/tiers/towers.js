// Note: tier kits for the towers group (windmill, lookout, glassgarden); see /tmp/claude-plan-garden-tier-revision.md and the catalog.
import { TIER_KITS } from './registry.js';

const PI = Math.PI;

// Note: swings a mesh about the x axis through (y0, z0); geometry stays in building coordinates.
function pivotX(m, y0, z0, a) {
  const s = Math.sin(a), co = Math.cos(a);
  m.rotation.x = a;
  m.position.y = y0 - (y0 * co - z0 * s);
  m.position.z = z0 - (y0 * s + z0 * co);
}

// Note: windmill tower body only; the sails (c.ud.spin group) are never touched. K.front is the sail hub, not the wall.
TIER_KITS.windmill = (c, K) => {
  const { B, C, t, v, GOLD } = K;
  const cloth = K.FLAG_COLS[v];
  const tile = [0xb6513c, 0x6f8f86, 0x7f8fa3, 0xa0705f][v];
  const DECK = 0.08;

  // Note: lantern post on the plinth, right side; the sails sweep z >= 0.62 so it stays behind them.
  const LX = 0.66, LZ = 0.28;
  // Note: porch lamp post on the deck, left side.
  const PX = -0.78, PZ = 0.5;

  K.mesh('t', () => {
    const b = new B();
    // Note: raw timber lintel over the door.
    b.box([0.4, 0.05, 0.08], [0, 0.44, 0.5], C.woodDD);
    b.box([0.04, 0.6, 0.04], [LX, 0, LZ], C.woodDD);
    if (t >= 2) {
      b.box([1.7, DECK, 0.74], [0, 0, 0.75], C.woodL, { sh: [0.9, 1] });
      // Note: drying rack on the deck at the S slot.
      for (const x of [-0.8, -0.4]) b.box([0.04, 0.58, 0.04], [x, 0.06, 0.92], C.woodD);
      b.rod([-0.84, 0.6, 0.92], [-0.36, 0.6, 0.92], 0.016, C.woodL, { seg: 3 });
    }
    if (t >= 3) {
      // Note: stone gallery around the tower above the windows, behind the sail plane.
      b.cyl(0.45, 0.56, 0.12, 6, [0, 0.88, 0], C.stoneD, { open: true });
      b.cyl(0.56, 0.56, 0.05, 6, [0, 1.0, 0], C.stoneL);
      b.cyl(0.56, 0.56, 0.14, 6, [0, 1.05, 0], C.woodL, { open: true });
      // Note: stone bench at the C slot.
      for (const s of [-1, 1]) b.box([0.08, 0.16, 0.18], [0.6 + s * 0.2, 0.06, 0.92], C.stoneD);
      b.box([0.52, 0.04, 0.2], [0.6, 0.2, 0.92], C.woodL);
      b.box([0.04, 0.58, 0.04], [PX, 0.06, PZ], C.woodDD);
    }
    if (t >= 4) {
      b.cone(0.51, 0.52, 9, [0, 1.395, 0], tile, { open: true, sh: [0.9, 1.1] });
      b.oct(0.06, [0, 1.97, 0], GOLD);
      for (const s of [-1, 1]) {
        b.box([0.22, 0.1, 0.12], [s * 0.26, 0.06, 1.04], C.woodD);
        b.oct(0.05, [s * 0.26, 0.2, 1.04], s > 0 ? 0xe8688a : 0xf0c64a);
      }
    }
    return b.build();
  });

  // Note: lantern lamp (T1), self-lit.
  K.lit('lantern', () => new B().box([0.1, 0.1, 0.1], [LX, 0.54, LZ], C.lampWarm).build());
  K.lamp(LX, 0.58, LZ);

  if (t >= 2) {
    // Note: lit window panes sit on the two existing windows at +-0.9 rad.
    K.lit('panes', () => {
      const b = new B();
      for (const s of [-1, 1]) {
        const a = s * 0.9;
        b.box([0.08, 0.1, 0.04], [Math.sin(a) * 0.45, 0.72, Math.cos(a) * 0.45], C.lampWarm, { r: [0, a, 0], v: 0 });
      }
      return b.build();
    });
    const wash = K.mesh('wash', () => new B().box([0.34, 0.26, 0.02], [-0.6, 0.34, 0.92], cloth, { sh: [0.95, 1.05] }).build(), K.MATS.vertexDouble);
    K.sway((time, wind) => pivotX(wash, 0.6, 0.92, Math.sin(time * 2.1 + v) * (0.05 + wind * 0.25)));
  }

  if (t >= 3) {
    K.lit('plamp', () => new B().box([0.1, 0.1, 0.1], [PX, 0.6, PZ], C.lampWarm).build());
    K.lamp(PX, 0.65, PZ);
  }

  if (t >= 4) {
    // Note: cord ends sit inside the gallery wall and inside the two lamp boxes.
    K.mesh('strings', () => {
      const b = new B();
      b.rod([0.46, 1.08, 0.1], [LX, 0.56, LZ], 0.008, C.dark, { seg: 3 });
      b.rod([-0.46, 1.08, 0.1], [PX, 0.64, PZ], 0.008, C.dark, { seg: 3 });
      return b.build();
    });
    K.lit('bulbs', () => {
      const b = new B();
      b.oct(0.032, [0.56, 0.84, 0.19], C.lampWarm);
      b.oct(0.032, [-0.62, 0.86, 0.3], C.lampWarm);
      return b.build();
    });
    K.lit('sign', () => new B().box([0.34, 0.09, 0.03], [0, 0.48, 0.5], C.lampWarm, { v: 0 }).build());
    // Note: vane pivots about the tower axis; pole base sits in the brass ball.
    const vane = K.mesh('vane', () => {
      const b = new B();
      b.rod([0, 1.97, 0], [0, 2.3, 0], 0.012, GOLD, { seg: 3 });
      b.box([0.24, 0.05, 0.02], [0.04, 2.2, 0], GOLD);
      b.prism(0.1, 0.12, 0.02, [-0.1, 2.2, 0], GOLD);
      return b.build();
    });
    K.sway((time, wind) => { vane.rotation.y = 0.7 + Math.sin(time * 0.6 + v) * (0.4 + wind * 0.6); });
  }
};

// Note: lookout is 1x1; legs lean in from +-0.36 at the ground to +-0.22 at y 1.85, platform y 1.8..1.86, ladder at z 0.27..0.43.
TIER_KITS.lookout = (c, K) => {
  const { B, C, t, v, GOLD } = K;
  const cloth = K.FLAG_COLS[v];
  const tile = [0xb6513c, 0x6f8f86, 0x7f8fa3, 0xa0705f][v];
  const LX = 0.46, LZ = 0.2;
  const RX = -0.43, RZ = 0.6;

  K.mesh('t', () => {
    const b = new B();
    // Note: raw log step at the ladder foot.
    b.box([0.3, 0.06, 0.14], [0, 0, 0.48], C.woodDD);
    b.box([0.04, 0.6, 0.04], [LX, 0, LZ], C.woodDD);
    if (t >= 2) {
      b.box([0.74, 0.07, 0.74], [0, 1.73, 0], C.woodL, { sh: [0.9, 1] });
      for (const x of [-0.43, -0.17]) b.box([0.03, 0.5, 0.03], [x, 0, RZ], C.woodD);
      b.rod([-0.46, 0.5, RZ], [-0.14, 0.5, RZ], 0.014, C.woodL, { seg: 3 });
    }
    if (t >= 3) {
      b.box([0.92, 0.12, 0.92], [0, -0.06, 0], C.stoneL, { sh: [0.88, 1] });
      // Note: low rail ring around the platform edge; square tube rotated 45 degrees.
      b.cyl(0.44, 0.44, 0.14, 4, [0, 1.84, 0], C.woodL, { open: true, r: [0, PI / 4, 0] });
      for (const s of [-1, 1]) b.box([0.06, 0.16, 0.12], [0.3 + s * 0.11, 0, 0.6], C.stoneD);
      b.box([0.32, 0.04, 0.14], [0.3, 0.16, 0.6], C.woodL);
      b.box([0.12, 0.08, 0.12], [-0.4, 0.04, 0.1], C.stoneD);
    }
    if (t >= 4) {
      b.cone(0.66, 0.33, 4, [0, 2.19, 0], tile, { open: true, r: [0, PI / 4, 0], sh: [0.9, 1.1] });
      b.oct(0.05, [0, 2.55, 0], GOLD);
      // Note: brass spyglass on a stand, tube pointing out over the rail.
      b.box([0.03, 0.15, 0.03], [-0.15, 1.86, 0.25], GOLD);
      b.rod([-0.15, 2.0, 0.25], [-0.02, 2.1, 0.46], 0.025, GOLD, { seg: 5 });
      for (const s of [-1, 1]) {
        b.box([0.14, 0.09, 0.1], [s * 0.1, 0, 0.74], C.woodD);
        b.oct(0.05, [s * 0.1, 0.13, 0.74], s > 0 ? 0xe8688a : 0xf0c64a);
      }
    }
    return b.build();
  });

  K.lit('lantern', () => new B().box([0.08, 0.08, 0.08], [LX, 0.55, LZ], C.lampWarm).build());
  K.lamp(LX, 0.59, LZ);

  if (t >= 2) {
    // Note: lit pane closes the back of the cabin, between the corner posts.
    K.lit('panes', () => {
      const b = new B();
      b.box([0.5, 0.23, 0.02], [0, 1.87, -0.27], C.lampWarm, { v: 0 });
      return b.build();
    });
    const banner = K.mesh('banner', () => new B().box([0.2, 0.28, 0.02], [-0.28, 1.45, 0.37], cloth, { sh: [0.95, 1.05] }).build(), K.MATS.vertexDouble);
    const wash = K.mesh('wash', () => new B().box([0.22, 0.18, 0.02], [-0.3, 0.32, RZ], 0xf4eed8, { sh: [0.95, 1.05] }).build(), K.MATS.vertexDouble);
    K.sway((time, wind) => {
      pivotX(banner, 1.73, 0.37, Math.sin(time * 2.4 + v) * (0.08 + wind * 0.3));
      pivotX(wash, 0.5, RZ, Math.sin(time * 2.0 + v + 1) * (0.05 + wind * 0.25));
    });
  }

  if (t >= 3) {
    K.lit('plamp', () => new B().box([0.1, 0.12, 0.1], [-0.4, 0.12, 0.1], C.lampWarm).build());
    K.lamp(-0.4, 0.18, 0.1);
  }

  if (t >= 4) {
    K.mesh('strings', () => {
      const b = new B();
      b.rod([0.3, 1.84, 0.3], [LX, 0.58, LZ], 0.008, C.dark, { seg: 3 });
      b.rod([-0.3, 1.84, 0.3], [RX, 0.48, RZ], 0.008, C.dark, { seg: 3 });
      return b.build();
    });
    K.lit('bulbs', () => {
      const b = new B();
      for (const f of [0.35, 0.7]) {
        b.oct(0.03, [0.3 + (LX - 0.3) * f, 1.84 + (0.58 - 1.84) * f, 0.3 + (LZ - 0.3) * f], C.lampWarm);
        b.oct(0.03, [-0.3 + (RX + 0.3) * f, 1.84 + (0.48 - 1.84) * f, 0.3 + (RZ - 0.3) * f], C.lampWarm);
      }
      return b.build();
    });
    // Note: vane pivots about the tower axis; pole base sits in the brass ball.
    const vane = K.mesh('vane', () => {
      const b = new B();
      b.rod([0, 2.55, 0], [0, 2.85, 0], 0.012, GOLD, { seg: 3 });
      b.box([0.22, 0.045, 0.02], [0.04, 2.76, 0], GOLD);
      b.prism(0.09, 0.11, 0.02, [-0.09, 2.76, 0], GOLD);
      return b.build();
    });
    K.sway((time, wind) => { vane.rotation.y = 0.7 + Math.sin(time * 0.6 + v) * (0.4 + wind * 0.6); });
  }
};

// Note: glassgarden is 3x3; stone plinth ends at z 1.425, glass front at z 1.25, front eave beam y 1.1..1.18, ridge along z at x = 0 (top 1.73).
TIER_KITS.glassgarden = (c, K) => {
  const { B, C, t, v, GOLD } = K;
  const cloth = K.FLAG_COLS[v];
  const LX = 1.38, LZ = 1.38;
  const PX = -1.38, PZ = 1.38;

  K.mesh('t', () => {
    const b = new B();
    // Note: raw timber doorstep at the front centre.
    b.box([0.5, 0.07, 0.25], [0, 0, 1.545], C.woodDD);
    b.box([0.05, 0.64, 0.05], [LX, 0.04, LZ], C.woodDD);
    if (t >= 2) {
      // Note: shade sail posts at the S slot; the cloth hangs from the front eave beam.
      for (const x of [-1.2, -0.6]) b.box([0.05, 0.86, 0.05], [x, 0, 1.7], C.woodL);
    }
    if (t >= 3) {
      b.box([0.5, 0.04, 0.2], [0, 0.07, 1.545], C.stoneL);
      for (const s of [-1, 1]) b.box([0.08, 0.2, 0.16], [0.9 + s * 0.24, 0, 1.57], C.stoneD);
      b.box([0.62, 0.05, 0.2], [0.9, 0.2, 1.56], C.woodL);
      b.box([0.05, 0.64, 0.05], [PX, 0.04, PZ], C.woodDD);
    }
    if (t >= 4) {
      b.box([0.1, 0.03, 2.7], [0, 1.7, 0], GOLD);
      for (const x of [-0.45, 0.45]) b.box([0.03, 1.0, 0.03], [x, 0.1, 1.27], GOLD);
      for (const s of [-1, 1]) {
        b.box([0.26, 0.14, 0.16], [s * 0.45, 0, 1.52], C.woodD);
        b.oct(0.06, [s * 0.45 - 0.05, 0.18, 1.52], s > 0 ? 0xe8688a : 0xf0c64a);
        b.oct(0.06, [s * 0.45 + 0.05, 0.19, 1.52], s > 0 ? 0xf6e27a : 0xc8b0e0);
      }
    }
    return b.build();
  });

  K.lit('lantern', () => new B().box([0.1, 0.1, 0.1], [LX, 0.6, LZ], C.lampWarm).build());
  K.lamp(LX, 0.64, LZ);

  if (t >= 2) {
    // Note: lit panes glow behind the back glass wall, seen through the front.
    K.lit('panes', () => {
      const b = new B();
      for (const s of [-1, 1]) b.box([0.6, 0.5, 0.02], [s * 0.55, 0.2, -1.23], C.lampWarm, { v: 0 });
      return b.build();
    });
    // Note: shade cloth slopes from the front eave beam (y 1.1) down to the posts (y 0.85); local z follows the slope.
    const shade = K.mesh('shade', () => {
      const b = new B();
      b.group({ p: [-0.9, 0.965, 1.505], r: [0.5236, 0, 0] }, () => b.box([0.7, 0.02, 0.5], [0, 0, 0], cloth, { sh: [0.95, 1.05] }));
      return b.build();
    }, K.MATS.vertexDouble);
    K.sway((time, wind) => pivotX(shade, 1.1, 1.29, Math.sin(time * 1.8 + v) * (0.02 + wind * 0.08)));
  }

  if (t >= 3) {
    K.lit('plamp', () => new B().box([0.1, 0.1, 0.1], [PX, 0.6, PZ], C.lampWarm).build());
    K.lamp(PX, 0.64, PZ);
  }

  if (t >= 4) {
    K.lit('sign', () => new B().box([0.6, 0.14, 0.03], [0, 1.2, 1.27], C.lampWarm, { v: 0 }).build());
    // Note: string swag along the front; ends sit inside the front corner posts (x +-1.25, z 1.2..1.3).
    const P = [[-1.25, 1.12, 1.29], [-0.62, 1.0, 1.34], [0, 0.96, 1.36], [0.62, 1.0, 1.34], [1.25, 1.12, 1.29]];
    K.mesh('strings', () => {
      const b = new B();
      for (let k = 0; k < 4; k++) b.rod(P[k], P[k + 1], 0.008, C.dark, { seg: 3 });
      return b.build();
    });
    K.lit('bulbs', () => {
      const b = new B();
      for (let k = 1; k <= 3; k++) b.oct(0.035, [P[k][0], P[k][1] - 0.03, P[k][2]], C.lampWarm);
      return b.build();
    });
    // Note: vane pivots about the ridge centre; pole base sits on the ridge beam.
    const vane = K.mesh('vane', () => {
      const b = new B();
      b.rod([0, 1.72, 0], [0, 2.0, 0], 0.012, GOLD, { seg: 3 });
      b.box([0.24, 0.05, 0.02], [0.04, 1.92, 0], GOLD);
      b.prism(0.1, 0.12, 0.02, [-0.1, 1.9, 0], GOLD);
      return b.build();
    });
    K.sway((time, wind) => { vane.rotation.y = 0.7 + Math.sin(time * 0.6 + v) * (0.4 + wind * 0.6); });
  }
};
