// Note: tier kits for campfire and bonfire (no walls, no door; folk use the +z side slots).
import { TIER_KITS } from './registry.js';

const RAD = Math.PI / 180;
// Note: polar point from the +z axis, theta toward +x; returns [x, z].
const pol = (r, deg) => [r * Math.sin(deg * RAD), r * Math.cos(deg * RAD)];
const BRASS = 0xd9a63f;

// Note: swinging string of bulbs; wire and bulbs share a pivot so both ends stay on the posts.
function stringLights(K, { x0, x1, y, sag, z, n, name }) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([x0 + (x1 - x0) * u, -sag * (1 - (2 * u - 1) ** 2), 0]);
  }
  const wire = K.mesh(`${name}wire`, () => {
    const b = new K.B();
    for (let i = 0; i < n; i++) b.rod(pts[i], pts[i + 1], 0.008, K.C.dark, { seg: 3 });
    return b.build();
  });
  const bulbs = K.lit(name, () => {
    const b = new K.B();
    for (let i = 1; i < n; i++) b.oct(0.034, [pts[i][0], pts[i][1] - 0.03, 0], i % 2 ? K.C.lampWarm : 0xffb870);
    return b.build();
  });
  wire.position.set(0, y, z);
  bulbs.position.set(0, y, z);
  K.sway((t, wind) => {
    const a = Math.sin(t * 1.4 + K.v) * (0.02 + wind * 0.06);
    wire.rotation.x = a;
    bulbs.rotation.x = a;
  });
}

// Note: lantern post with a self-lit lamp box; one light point.
function lanternPost(K, x, z, h) {
  K.mesh('lantern', () => {
    const b = new K.B();
    b.rod([x, 0, z], [x, h - 0.02, z], 0.025, K.C.woodDD, { seg: 3 });
    b.prism(0.17, 0.07, 0.17, [x, h + 0.03, z], K.C.woodD);
    return b.build();
  });
  K.lit('lm', () => new K.B().box([0.1, 0.1, 0.1], [x, h - 0.06, z], K.C.lampWarm).build());
  K.lamp(x, h, z);
}

// Note: flower tub, a box with one blossom blob.
function tub(b, K, x, z, col) {
  b.box([0.1, 0.08, 0.1], [x, 0, z], K.C.woodD);
  b.oct(0.065, [x, 0.12, z], col, { s: [1, 0.8, 1] });
}

TIER_KITS.campfire = (c, K) => {
  const t = K.t;
  const { C } = K;
  const FLOW = [0xe8688a, 0xf0c64a];

  // T1: outer stone ring and a lantern post behind the fire.
  if (t >= 1) {
    K.mesh('ring', () => {
      const b = new K.B();
      for (let k = 0; k < 5; k++) {
        const [x, z] = pol(0.52, 20 + k * 72);
        b.oct(0.075, [x, 0.04, z], k % 2 ? C.stone : C.stoneL, { s: [1, 0.8, 1] });
      }
      return b.build();
    });
    lanternPost(K, 0, -0.66, 0.8);
  }

  // T2: planed log seats in a half ring on the front side; the +-28 degree seats sit at the C slot.
  if (t >= 2) {
    K.mesh('seats', () => {
      const b = new K.B();
      [-68, -28, 28, 68].forEach((deg, i) => {
        const [x, z] = pol(0.64, deg);
        b.box([0.4, 0.15, 0.13], [x, 0, z], i % 2 ? C.woodL : C.wood, { r: [0, deg * RAD, 0], sh: [0.92, 1.05] });
      });
      return b.build();
    });
  }

  // T3: cooking pot on a tripod, stone benches behind, drying rack with cloth at the S slot.
  if (t >= 3) {
    const apex = [0, 1.0, 0];
    K.mesh('tripod', () => {
      const b = new K.B();
      for (const deg of [60, 180, 300]) {
        const [x, z] = pol(0.42, deg);
        b.rod([x, 0, z], apex, 0.02, C.woodD, { seg: 3 });
      }
      return b.build();
    });
    const top = t >= 4 ? 0.8 : 0.77;
    K.mesh('chain', () => new K.B().rod(apex, [0, top, 0], 0.008, C.dark, { seg: 3 }).build());
    // Note: pot bottom stays above the tallest flame (about 0.59).
    K.mesh('pot', () => {
      const b = new K.B();
      if (t >= 4) {
        b.cyl(0.095, 0.06, 0.12, 6, [0, 0.66, 0], BRASS, { sh: [0.9, 1.1] });
        b.rod([0.07, 0.7, 0], [0.16, 0.78, 0], 0.014, BRASS, { seg: 3 });
      } else {
        b.cyl(0.1, 0.115, 0.1, 6, [0, 0.66, 0], C.dark, { sh: [0.9, 1.1] });
      }
      return b.build();
    });
    K.mesh('benches', () => {
      const b = new K.B();
      for (const deg of [-115, 115]) {
        const [x, z] = pol(0.66, deg);
        b.group({ p: [x, 0, z], r: [0, deg * RAD, 0] }, () => {
          b.box([0.26, 0.12, 0.1], [0, 0, 0], C.stoneD);
          b.box([0.4, 0.05, 0.14], [0, 0.12, 0], C.stoneL);
        });
      }
      return b.build();
    });
    const rz = 0.84;
    K.mesh('rack', () => {
      const b = new K.B();
      for (const x of [-0.46, -0.14]) b.rod([x, 0, rz], [x, 0.58, rz], 0.02, C.woodD, { seg: 3 });
      b.rod([-0.5, 0.55, rz], [-0.1, 0.55, rz], 0.018, C.woodDD, { seg: 3 });
      return b.build();
    });
    const cloth = K.mesh('cloth', () => new K.B().box([0.28, 0.24, 0.012], [0, -0.23, 0], K.FLAG_COLS[K.v]).build(), K.MATS.vertexDouble);
    cloth.position.set(-0.3, 0.56, rz);
    K.sway((time, wind) => { cloth.rotation.x = Math.sin(time * 1.8 + K.v) * (0.05 + wind * 0.25); });
  }

  // T4: string lights over the fire, flower tubs in the seat gap (W slot); the pot above becomes a brass kettle.
  if (t >= 4) {
    const px = 0.88;
    K.mesh('stringposts', () => {
      const b = new K.B();
      for (const s of [-1, 1]) b.rod([s * px, 0, 0], [s * px, 1.3, 0], 0.025, C.woodDD, { seg: 3 });
      return b.build();
    });
    stringLights(K, { x0: -px, x1: px, y: 1.28, sag: 0.12, z: 0, n: 4, name: 'string' });
    K.lamp(0, 1.1, 0.2);
    K.mesh('tubs', () => {
      const b = new K.B();
      tub(b, K, -0.06, 0.74, FLOW[K.d]);
      tub(b, K, 0.06, 0.74, FLOW[1 - K.d]);
      return b.build();
    });
  }
};

TIER_KITS.bonfire = (c, K) => {
  const t = K.t;
  const { C } = K;
  const FP = 0.68; // frame half width
  const FH = 0.95; // frame post height
  const stones = [45, 90, 135, 180, 225, 270, 315];

  // T1: lantern post beside the stack.
  if (t >= 1) lanternPost(K, -0.98, -0.15, 0.95);

  // T2: planed log frame (open at the front) and a banner on a pole at the S slot.
  if (t >= 2) {
    K.mesh('frame', () => {
      const b = new K.B();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * FP, 0, sz * FP], [sx * FP, FH, sz * FP], 0.04, C.woodL, { seg: 3 });
      const y = FH - 0.05;
      b.rod([-FP, y, -FP], [FP, y, -FP], 0.03, C.wood, { seg: 3 });
      for (const sx of [-1, 1]) b.rod([sx * FP, y, -FP], [sx * FP, y, FP], 0.03, C.wood, { seg: 3 });
      return b.build();
    });
    const bx = -0.3; const bz = 0.88; const top = 1.35;
    K.mesh('bannerpole', () => new K.B().rod([bx, 0, bz], [bx, top, bz], 0.022, C.woodDD, { seg: 3 }).build());
    const banner = K.mesh('banner', () => new K.B().box([0.22, 0.4, 0.012], [0.1, -0.4, 0], K.FLAG_COLS[K.v]).build(), K.MATS.vertexDouble);
    banner.position.set(bx, top - 0.02, bz);
    K.sway((time, wind) => { banner.rotation.y = Math.sin(time * 2.2 + K.v) * (0.15 + wind * 0.4); });
  }

  // T3: stone brazier ring open at the front, two steps, log bench at the C slot.
  if (t >= 3) {
    K.mesh('brazier', () => {
      const b = new K.B();
      stones.forEach((deg, i) => {
        const [x, z] = pol(0.64, deg);
        b.oct(0.13, [x, 0.1, z], i % 2 ? C.stone : C.stoneL, { s: [1, 1.2, 1] });
      });
      return b.build();
    });
    K.mesh('steps', () => {
      const b = new K.B();
      b.box([0.2, 0.07, 0.16], [0, 0, 0.86], C.stoneL);
      b.box([0.2, 0.14, 0.16], [0, 0, 0.71], C.stoneD);
      return b.build();
    });
    K.mesh('bench', () => {
      const b = new K.B();
      b.box([0.18, 0.12, 0.09], [0.4, 0, 0.9], C.woodDD);
      b.box([0.26, 0.05, 0.12], [0.4, 0.12, 0.9], C.woodL);
      return b.build();
    });
  }

  // T4: brass rim on the brazier, tall pennant pole, string lights on the frame, flower tubs at the steps (W slot).
  if (t >= 4) {
    K.mesh('rim', () => {
      const b = new K.B();
      for (let i = 0; i < stones.length - 1; i++) {
        const [x0, z0] = pol(0.64, stones[i]);
        const [x1, z1] = pol(0.64, stones[i + 1]);
        b.rod([x0, 0.24, z0], [x1, 0.24, z1], 0.03, BRASS, { seg: 3 });
      }
      return b.build();
    });
    const tx = 0.98; const tz = -0.1;
    K.mesh('tallpole', () => {
      const b = new K.B();
      b.rod([tx, 0, tz], [tx, 2.3, tz], 0.025, C.woodDD, { seg: 3 });
      return b.build();
    });
    const pen = K.mesh('pennants', () => {
      const b = new K.B();
      [[1.7, 0.42], [1.95, 0.36], [2.2, 0.3]].forEach(([y, len], i) => {
        b.prism(0.12, len, 0.012, [0, y, 0], K.FLAG_COLS[(K.v + i) % 4], { r: [0, 0, 90 * RAD] });
      });
      return b.build();
    }, K.MATS.vertexDouble);
    pen.position.set(tx, 0, tz);
    K.sway((time, wind) => { pen.rotation.y = Math.sin(time * 2.6 + K.v) * (0.2 + wind * 0.5); });
    stringLights(K, { x0: -FP, x1: FP, y: FH - 0.03, sag: 0.14, z: FP, n: 4, name: 'string' });
    K.lamp(0, 0.8, 0.8);
    K.mesh('tubs', () => {
      const b = new K.B();
      tub(b, K, -0.18, 0.8, 0xe8688a);
      tub(b, K, 0.18, 0.8, 0xf0c64a);
      return b.build();
    });
  }
};
