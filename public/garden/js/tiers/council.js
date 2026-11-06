// Note: tier kit for the council hall (the capital); council tier N = kit t N-1, so the base is the T1 flagpost and kit t 1..4 add T2..T5.
import { TIER_KITS } from './registry.js';

const PI = Math.PI;
const TILE = [0xc45a40, 0x6f8f9b, 0xb8503a, 0xc9694a];
const FLOWER = [0xf0c64a, 0xe8688a, 0xf6e27a, 0xc8b0e0];

// Note: swings a mesh about the x axis through (y0, z0); geometry stays in building coordinates.
function pivotX(m, y0, z0, a) {
  const s = Math.sin(a), co = Math.cos(a);
  m.rotation.x = a;
  m.position.y = y0 - (y0 * co - z0 * s);
  m.position.z = z0 - (y0 * s + z0 * co);
}

// Note: base geometry, plaza top y 0.09 within +-0.85, flagpost at (-0.62, -0.62); props stand in front of the plinth (z 0.95) up to z 1.25.
TIER_KITS.council = (c, K) => {
  const { B, C, t, v, GOLD } = K;
  const cloth = K.FLAG_COLS[v];
  const S = K.spot('S'), Cs = K.spot('C'), W = K.spot('W');
  // Note: map table centre; the table grows at T4 and the canopy follows it.
  const cx = 0.1, cz = 0.3;
  const big = t >= 3;
  const TW = big ? 1.3 : 1.1, TD = big ? 0.85 : 0.7;
  const LX = -0.86, LZ = 0.3;
  const PX = 0.92, PZ = 0.3;
  const TY = 0.5;
  // Note: tower centre at the back right; the banner bar sits on its front face (z -0.37).
  const tx = 0.58, tz = -0.65;

  K.mesh('t', () => {
    const b = new B();
    // Note: map table: slab on a central pedestal, a sea sheet with island blots and a red pin.
    b.box([0.3, TY - 0.05, TD - 0.2], [cx, 0.07, cz], C.woodD);
    b.box([TW, 0.06, TD], [cx, TY, cz], C.woodL, { sh: [0.92, 1.04] });
    b.box([TW - 0.12, 0.015, TD - 0.12], [cx, TY + 0.06, cz], 0x8fc4d8, { v: 0.02 });
    const blots = [[-0.25, -0.12, C.leaf], [0.05, 0.15, C.leafL], [0.28, -0.1, C.clay]];
    if (big) blots.push([-0.38, 0.2, C.leafL]);
    for (const [fx, fz, col] of blots) b.oct(0.09, [cx + fx * TW, TY + 0.075, cz + fz * TD], col, { s: [1.4, 0.3, 1.1] });
    b.oct(0.03, [cx + 0.05 * TW, TY + 0.14, cz + 0.15 * TD], 0xd9604a);
    // Note: raw timber lantern post.
    b.box([0.05, 0.6, 0.05], [LX, -0.02, LZ], C.woodDD);

    if (t >= 2) {
      // Note: map-scroll rack at the S slot, two posts, a bar and a rolled scroll.
      for (const x of [S.x - 0.3, S.x + 0.3]) b.box([0.05, 0.6, 0.05], [x, -0.02, 1.1], C.woodL);
      b.rod([S.x - 0.32, 0.56, 1.1], [S.x + 0.32, 0.56, 1.1], 0.015, C.woodL, { seg: 3 });
      b.box([0.08, 0.3, 0.05], [S.x, 0.26, 1.1], 0xf4eed8);
      // Note: canopy posts at the table corners; they turn to stone pillars at T4.
      if (!big) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.06, 1.16, 0.06], [cx + sx * 0.62, 0.07, cz + sz * 0.42], C.woodL, { sh: [0.9, 1] });
      b.box([0.05, 0.6, 0.05], [PX, -0.02, PZ], C.woodDD);
    }

    if (t >= 3) {
      // Note: stone pillars under the canopy corners.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.16, 1.18, 0.16], [cx + sx * 0.75, 0.07, cz + sz * 0.52], C.stoneL, { sh: [0.9, 1.05] });
      // Note: stone bench at the C slot.
      for (const s of [-1, 1]) b.box([0.08, 0.16, 0.18], [Cs.x + s * 0.22, -0.02, 1.15], C.stoneD);
      b.box([0.6, 0.04, 0.2], [Cs.x, 0.14, 1.15], C.woodL);
      // Note: hanger rod from the ridge down to the lamp.
      b.rod([cx, 1.15, cz], [cx, 1.5, cz], 0.012, C.dark, { seg: 3 });
    }

    if (t >= 4) {
      // Note: watchtower: stone shaft, plank gallery, cabin, tiled cap, brass finial.
      b.box([0.56, 1.3, 0.56], [tx, 0.07, tz], C.stoneL, { sh: [0.88, 1.05] });
      b.box([0.68, 0.08, 0.68], [tx, 1.37, tz], C.woodL);
      b.box([0.46, 0.5, 0.46], [tx, 1.45, tz], C.plaster, { sh: [0.92, 1.05] });
      b.cone(0.5, 0.42, 4, [tx, 1.95, tz], TILE[v], { open: true, r: [0, PI / 4, 0], sh: [0.9, 1.1] });
      b.oct(0.05, [tx, 2.4, tz], GOLD);
      b.rod([tx - 0.24, 1.2, tz + 0.28], [tx + 0.24, 1.2, tz + 0.28], 0.014, C.woodDD, { seg: 3 });
      // Note: planter box at the W slot with three blooms.
      b.box([0.8, 0.14, 0.16], [W.x, -0.02, 1.15], C.woodD, { sh: [0.9, 1.05] });
      for (let k = 0; k < 3; k++) b.oct(0.05, [W.x - 0.25 + k * 0.25, 0.16, 1.15], FLOWER[(k + v) % 4]);
    }
    return b.build();
  });

  K.lit('lantern', () => new B().box([0.1, 0.1, 0.1], [LX, 0.54, LZ], C.lampWarm).build());
  K.lamp(LX, 0.58, LZ);

  if (t >= 2) {
    // Note: cloth gable canopy over the table, ridge along z; the eave sits on the post tops (y 1.23 at T3, 1.25 at T4).
    K.mesh('canopy', () => {
      const b = new B();
      b.group({ p: [cx, 0, cz] }, () => K.gable(b, { hw: big ? 0.98 : 0.74, h: 0.28, d: big ? 1.3 : 1.02, y: big ? 1.25 : 1.23, col: cloth }));
      return b.build();
    });
    K.lit('plamp', () => new B().box([0.1, 0.1, 0.1], [PX, 0.54, PZ], C.lampWarm).build());
    K.lamp(PX, 0.58, PZ);
  }

  if (t >= 3) {
    K.lit('hangLamp', () => new B().box([0.12, 0.14, 0.12], [cx, 1.02, cz], C.lampWarm).build());
    K.lamp(cx, 1.1, cz);
  }

  if (t >= 4) {
    // Note: lit pane on the cabin front, no beacon on top.
    K.lit('panes', () => new B().box([0.2, 0.2, 0.02], [tx, 1.58, tz + 0.24], C.lampWarm, { v: 0 }).build());
    K.lamp(tx, 1.6, tz + 0.36);
    const banner = K.mesh('banner', () => new B().box([0.34, 0.7, 0.015], [tx, 0.5, tz + 0.3], K.FLAG_COLS[(v + 1) % 4], { sh: [0.95, 1.05] }).build(), K.MATS.vertexDouble);
    K.sway((time, wind) => pivotX(banner, 1.2, tz + 0.3, Math.sin(time * 1.9 + v) * (0.05 + wind * 0.25)));
  }
};
