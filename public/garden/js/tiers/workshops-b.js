// Note: tier kits for workshops B (oven, smokehouse, loom, lampworks); see /tmp/claude-plan-garden-tier-catalog.md.
import { TIER_KITS } from './registry.js';

const CL = [0xf0a8b8, 0xa8d8b8, 0xf4d98a, 0xc8b0e0];
const TILE = 0xc2573d;
const BULB = [0xffd88a, 0xffb0c0, 0xa8e8ff, 0xc8f0a0];
const GLOBE = [0xffd36a, 0xff9ab8, 0x8fe0ff, 0xb9f08a];

// Note: footprint of the base plinth or floor, read from the first primitive of the base mesh.
function foot(c) {
  const p = c.g.children[0].geometry.userData.prims[0];
  return { x0: p[0], x1: p[3], z0: p[2], z1: p[5] };
}

const part = (K, name, fn) => K.mesh(name, () => { const b = new K.B(); fn(b); return b.build(); });
const lit = (K, name, fn) => K.lit(name, () => { const b = new K.B(); fn(b); return b.build(); });
const post = (b, x, y0, y1, z, col, r = 0.03) => b.rod([x, y0, z], [x, y1, z], r, col, { seg: 3 });

// Note: T1 lantern post with a self-lit lamp; the post starts inside the plinth.
function lantern(K, x, z) {
  part(K, 'ln', (b) => {
    post(b, x, -0.02, 0.5, z, K.C.woodDD);
    b.box([0.14, 0.03, 0.14], [x, 0.56, z], K.C.woodD);
  });
  lit(K, 'lnl', (b) => b.box([0.1, 0.1, 0.1], [x, 0.46, z], K.C.lampWarm));
  K.lamp(x, 0.51, z);
}

// Note: C prop, a bench with two end blocks; z0 = front edge of the plinth.
function bench(b, C, x, z0, col, one = false) {
  b.box([0.5, 0.04, 0.2], [x, 0.2, z0 + 0.08], col);
  if (one) b.box([0.36, 0.22, 0.12], [x, -0.02, z0 + 0.04], C.woodD);
  else for (const s of [-1, 1]) b.box([0.06, 0.22, 0.14], [x + s * 0.2, -0.02, z0 + 0.05], C.woodD);
}

// Note: S prop, a drying rack with a cloth; posts straddle the plinth front edge.
function rack(b, C, x, z0, hw, col) {
  for (const s of [-1, 1]) post(b, x + s * hw, -0.02, 0.62, z0, C.woodD);
  b.rod([x - hw, 0.58, z0], [x + hw, 0.58, z0], 0.015, C.woodDD, { seg: 3 });
  b.box([hw * 1.5, 0.24, 0.015], [x, 0.34, z0], col);
}

// Note: W prop, two planters flanking the centre line.
function planters(b, x, z0) {
  for (const s of [-1, 1]) {
    b.box([0.2, 0.1, 0.13], [s * x, -0.02, z0 + 0.045], 0x946a45);
    b.oct(0.075, [s * x, 0.14, z0 + 0.04], 0x6fae5a, { s: [1, 1.1, 1] });
  }
}

// Note: wire between two anchors with a sag, lit bulbs on the wire; bulbs bob in the wind.
function strings(K, A, E, n, sag) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([A[0] + (E[0] - A[0]) * u, A[1] + (E[1] - A[1]) * u - sag * 4 * u * (1 - u), A[2] + (E[2] - A[2]) * u]);
  }
  part(K, 'str', (b) => { for (let i = 0; i < n; i++) b.rod(pts[i], pts[i + 1], 0.008, K.C.dark, { seg: 3 }); });
  const bulbs = lit(K, 'strl', (b) => {
    for (let i = 1; i < n; i++) b.oct(0.03, [pts[i][0], pts[i][1] - 0.02, pts[i][2]], BULB[(i + K.v) & 3]);
  });
  K.sway((t, w) => { bulbs.position.y = Math.sin(t * 1.7 + K.v) * 0.012 * (0.5 + w); });
}

// Note: hanging bracket lamp, arm into the wall or post at (x, y, z0), lamp at the free end (+z).
function bracketLamp(K, name, x, y, z0, len) {
  part(K, name, (b) => b.box([0.03, 0.03, len], [x, y, z0 + len / 2 - 0.03], K.C.woodDD));
  lit(K, name + 'l', (b) => b.box([0.08, 0.1, 0.08], [x, y - 0.09, z0 + len - 0.04], K.C.lampWarm));
  K.lamp(x, y - 0.04, z0 + len - 0.04);
}

// Note: oven. Base already has a clay chimney and smoke; the tier stack grows from it and the smoke point moves up.
TIER_KITS.oven = (c, K) => {
  const { C, t, half } = K;
  const f = foot(c);
  const z0 = f.z1;
  const cl = CL[K.v & 3];
  const cl2 = CL[(K.v + 1) & 3];
  const sx = 0.6 * half;
  const px = 0.27 * half;
  const lx = f.x0 + 0.055;
  const lz = z0 - 0.1;
  lantern(K, lx, lz);
  if (t >= 2) {
    part(K, 't2', (b) => {
      b.box([1.0, 0.05, 0.05], [-0.2, 0.4, 0.56], C.woodL);
      b.box([0.64, 0.03, 0.42], [0, 0.8, 0.3], cl, { c: true, r: [0.3, 0, 0] });
      for (const s of [-1, 1]) b.rod([s * 0.3, 0.745, 0.5], [s * 0.3, 0.43, 0.5], 0.015, C.woodDD, { seg: 3 });
      rack(b, C, -sx, z0, 0.2, cl2);
    });
    lit(K, 't2l', (b) => b.box([0.13, 0.1, 0.03], [-0.5, 0.29, 0.55], C.lampWarm));
  }
  if (t >= 3) {
    part(K, 't3', (b) => {
      b.cyl(0.095, 0.085, 0.32, 5, [0, 1.5, -0.55], C.brickD);
      b.box([0.2, 0.04, 0.2], [0, 1.8, -0.55], C.stoneD);
      post(b, -0.9, -0.02, 0.85, -0.25, C.woodD, 0.025);
      b.box([0.05, 0.05, 0.5], [-0.9, 0.8, -0.25], C.wood);
      for (const z of [-0.43, -0.07]) b.box([0.07, 0.62, 0.02], [-0.9, 0.2, z], C.woodL);
      bench(b, C, sx, z0, C.stoneL);
    });
    bracketLamp(K, 't3a', -0.3, 0.42, 0.52, 0.16);
    if (c.ud.smoke) c.ud.smoke.set(0, 1.9, -0.55);
  }
  if (t >= 4) {
    part(K, 't4', (b) => {
      b.cone(0.13, 0.12, 6, [0, 1.82, -0.55], K.GOLD);
      // Note: wood store on the plinth, roof starts on the wall top and falls outward.
      b.box([0.3, 0.035, 0.7], [0.855, 0.4, -0.2], TILE, { c: true, r: [0, 0, 0.26] });
      for (const z of [-0.5, 0.1]) post(b, 0.97, -0.02, 0.36, z, C.woodDD, 0.022);
      b.box([0.2, 0.16, 0.55], [0.85, 0.04, -0.2], C.wood);
      planters(b, px, z0);
    });
    if (c.ud.smoke) c.ud.smoke.set(0, 2.0, -0.55);
    strings(K, [lx, 0.57, lz], [0.3, 0.74, 0.5], 3, 0.1);
  }
};

// Note: smokehouse. Base has a stone chimney and smoke; T3 raises that stack and the smoke point.
TIER_KITS.smokehouse = (c, K) => {
  const { C, t, half } = K;
  const f = foot(c);
  const z0 = f.z1;
  const cl = CL[K.v & 3];
  const cl2 = CL[(K.v + 2) & 3];
  const sx = 0.6 * half;
  const px = 0.27 * half;
  lantern(K, f.x0 + 0.06, z0 - 0.15);
  if (t >= 2) {
    part(K, 't2', (b) => {
      // Note: cloth shade rests on the tops of the hook-rack posts.
      b.box([0.34, 0.03, 0.78], [0.7, 0.81, 0.4], cl);
      for (const s of [-1, 1]) post(b, -0.25 + s * 0.18, 0.05, 0.62, 0.4, C.woodL, 0.025);
      b.box([0.4, 0.04, 0.04], [-0.25, 0.6, 0.4], C.woodL);
      rack(b, C, -sx, z0, 0.2, cl2);
    });
    lit(K, 't2l', (b) => b.box([0.14, 0.16, 0.03], [0.08, 0.45, 0.4], C.lampWarm));
  }
  if (t >= 3) {
    part(K, 't3', (b) => {
      b.box([0.15, 0.4, 0.15], [-0.05, 1.82, -0.35], C.stone);
      b.box([0.21, 0.05, 0.21], [-0.05, 2.2, -0.35], C.stoneD);
      // Note: hook rail on the left wall with three smoked hams.
      b.box([0.07, 0.06, 0.7], [-0.77, 0.72, -0.15], C.woodD);
      for (const z of [-0.4, -0.15, 0.1]) {
        b.rod([-0.8, 0.74, z], [-0.8, 0.58, z], 0.01, C.rope, { seg: 3 });
        b.oct(0.05, [-0.8, 0.5, z], 0xe8a07a, { s: [0.5, 1.7, 0.5] });
      }
      bench(b, C, sx, z0, C.stoneL);
    });
    bracketLamp(K, 't3a', -0.6, 0.64, 0.38, 0.14);
    if (c.ud.smoke) c.ud.smoke.set(-0.05, 2.32, -0.35);
  }
  if (t >= 4) {
    part(K, 't4', (b) => {
      b.box([0.2, 0.05, 1.34], [0, 1.4, -0.15], TILE);
      post(b, 0, 1.42, 1.72, 0.38, C.woodDD, 0.012);
      planters(b, px, z0);
    });
    // Note: brass fish vane, pivot at the mast top.
    const fish = part(K, 't4v', (b) => {
      b.oct(0.1, [0, 0, 0], K.GOLD, { s: [1.6, 0.6, 0.35] });
      b.oct(0.06, [-0.18, 0, 0], K.GOLD, { s: [0.5, 1.4, 0.3] });
    });
    fish.position.set(0, 1.72, 0.38);
    K.sway((time, wind) => { fish.rotation.y = Math.sin(time * 1.1 + K.v) * (0.3 + wind * 0.6); });
    strings(K, [-0.62, 0.86, 0.47], [0.62, 0.86, 0.47], 3, 0.14);
  }
};

// Note: loom. Open frame on a deck, no chimney; T3 adds a standing tapestry frame and dye vats, T4 a cloth-bolt lean-to.
TIER_KITS.loom = (c, K) => {
  const { C, t, half } = K;
  const f = foot(c);
  const z0 = f.z1;
  const cl = CL[K.v & 3];
  const cl2 = CL[(K.v + 1) & 3];
  const cl3 = CL[(K.v + 2) & 3];
  const sx = 0.6 * half;
  const px = 0.27 * half;
  lantern(K, f.x0 + 0.055, z0 - 0.08);
  if (t >= 2) {
    part(K, 't2', (b) => {
      b.box([1.8, 0.07, 0.06], [0, -0.02, z0 + 0.005], C.woodL);
      rack(b, C, -sx, z0, 0.2, cl2);
    });
    // Note: cloth valance hangs from the top beam and sways.
    const val = part(K, 't2v', (b) => {
      for (let k = -1; k <= 1; k++) b.box([0.38, 0.14, 0.04], [k * 0.42, -0.14, 0], CL[(K.v + k + 1) & 3]);
    });
    val.position.set(0, 1.16, -0.26);
    K.sway((time, wind) => { val.rotation.x = Math.sin(time * 1.6 + K.v) * 0.06 * (0.4 + wind); });
    bracketLamp(K, 't2a', 0.62, 0.93, -0.3, 0.2);
  }
  if (t >= 3) {
    part(K, 't3', (b) => {
      // Note: standing tapestry frame on the right strip, plane faces +x.
      for (const z of [-0.62, -0.12]) post(b, 0.77, -0.02, 0.95, z, C.woodD, 0.03);
      b.box([0.05, 0.05, 0.55], [0.77, 0.9, -0.37], C.wood);
      for (const z of [-0.5, -0.24]) b.rod([0.77, 0.3, z], [0.77, 0.9, z], 0.008, 0xf2ead6, { seg: 3 });
      b.box([0.03, 0.32, 0.4], [0.77, 0.4, -0.37], cl3);
      bench(b, C, sx, z0, C.stoneL);
      // Note: dye vats on the left strip, open tubs with a coloured surface.
      for (const [z, col] of [[-0.58, cl], [-0.2, 0x9cc8e8]]) {
        b.cyl(0.1, 0.09, 0.26, 5, [-0.77, 0.03, z], C.woodD, { open: true });
        b.disc(0.085, [-0.77, 0.25, z], col, { r: [-Math.PI / 2, 0, 0] });
      }
    });
    bracketLamp(K, 't3a', -0.62, 0.93, -0.3, 0.2);
  }
  if (t >= 4) {
    part(K, 't4', (b) => {
      // Note: lean-to roof starts on the left main post and falls outward; two posts stand on the deck edge.
      b.box([0.34, 0.03, 1.02], [-0.78, 0.95, -0.21], TILE, { c: true, r: [0, 0, 0.2] });
      for (const z of [-0.68, 0.26]) post(b, -0.86, -0.02, 0.9, z, C.woodDD, 0.022);
      b.box([0.14, 0.34, 0.14], [-0.78, 0.05, 0.12], cl2);
      post(b, 0.84, -0.02, 0.62, z0 - 0.09, C.woodD, 0.025);
      planters(b, px, z0);
    });
    // Note: brass shuttle vane on the thatch.
    const shuttle = part(K, 't4v', (b) => {
      b.oct(0.08, [0, 0, 0], K.GOLD, { s: [2.2, 0.5, 0.5] });
      b.oct(0.03, [0.2, 0, 0], K.C.dark, { s: [1, 1, 1] });
    });
    shuttle.position.set(0, 1.72, -0.15);
    part(K, 't4m', (b) => post(b, 0, 1.38, 1.72, -0.15, C.woodDD, 0.012));
    K.sway((time, wind) => { shuttle.rotation.y = Math.sin(time * 1.3 + K.v) * (0.3 + wind * 0.6); });
    strings(K, [f.x0 + 0.055, 0.56, z0 - 0.08], [0.84, 0.6, z0 - 0.09], 3, 0.14);
  }
};

// Note: lampworks. Glass and lamps, no chimney; its lit parts are self-lit and the glass roof stays untouched.
TIER_KITS.lampworks = (c, K) => {
  const { C, t, half } = K;
  const f = foot(c);
  const z0 = f.z1;
  const cl = CL[K.v & 3];
  const cl2 = CL[(K.v + 1) & 3];
  const sx = 0.6 * half;
  const px = 0.27 * half;
  lantern(K, f.x1 - 0.05, z0 - 0.08);
  if (t >= 2) {
    part(K, 't2', (b) => {
      b.box([0.5, 0.03, 0.26], [-0.35, 0.58, 0.55], cl, { c: true, r: [0.35, 0, 0] });
      rack(b, C, -sx, z0, 0.2, cl2);
    });
    lit(K, 't2l', (b) => {
      b.box([0.14, 0.2, 0.03], [-0.65, 0.28, 0.45], C.lampWarm);
      b.box([0.14, 0.2, 0.03], [0.6, 0.28, 0.45], C.lampWarm);
    });
  }
  if (t >= 3) {
    part(K, 't3', (b) => {
      for (const x of [f.x0 + 0.055, f.x1 - 0.055]) post(b, x, -0.02, 0.72, 0.45, C.woodDD, 0.03);
      bench(b, C, sx, z0, C.stoneL, true);
    });
    // Note: glass globes on the two side posts.
    lit(K, 't3g', (b) => {
      b.ico(0.1, [f.x0 + 0.055, 0.82, 0.45], GLOBE[K.v & 3]);
      b.ico(0.1, [f.x1 - 0.055, 0.82, 0.45], GLOBE[(K.v + 2) & 3]);
    });
    K.lamp(f.x0 + 0.055, 0.82, 0.45);
    bracketLamp(K, 't3a', 0, 0.5, 0.4, 0.2);
  }
  if (t >= 4) {
    part(K, 't4', (b) => {
      // Note: brass collar on the ridge front, sign frame on the porch bar.
      b.box([0.74, 0.26, 0.04], [0, 0.98, 0.72], C.woodD);
      // Note: lamp tree on the plinth edge, trunk and two branches.
      const tx = f.x1 - 0.06;
      post(b, tx, -0.02, 1.0, -0.3, C.woodDD, 0.03);
      b.rod([tx, 0.8, -0.3], [tx, 0.92, -0.1], 0.012, C.woodDD, { seg: 3 });
      planters(b, px, z0);
    });
    lit(K, 't4l', (b) => {
      b.ico(0.09, [0, 1.28, 0.5], K.GOLD);
      b.box([0.62, 0.17, 0.05], [0, 1.02, 0.73], C.lampWarm);
      const tx = f.x1 - 0.06;
      b.ico(0.065, [tx, 1.03, -0.3], GLOBE[(K.v + 1) & 3]);
      b.oct(0.065, [tx, 0.98, -0.1], GLOBE[(K.v + 3) & 3]);
    });
    K.lamp(0, 1.28, 0.5);
    K.lamp(f.x1 - 0.06, 1.0, -0.3);
  }
};
