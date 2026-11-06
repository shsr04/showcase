// Note: crate and pile models for the 16 new goods (7 specialty, 6 rare, 3 luxury); contract in registry.js GOOD_MODELS.
import { GOOD_MODELS, BRASS, BRASS_D } from './registry.js';

const PI = Math.PI;

// Note: heap slots [x, z, layer] for round items; 7 on the ground, 3 above, 2 on top (same layout as models.js).
const HEAP = (() => {
  const a = [[0, 0, 0]];
  for (let k = 0; k < 6; k++) a.push([Math.cos((k * PI) / 3) * 0.25, Math.sin((k * PI) / 3) * 0.25, 0]);
  for (const ang of [0.5, 2.6, 4.7]) a.push([Math.cos(ang) * 0.13, Math.sin(ang) * 0.13, 1]);
  a.push([0.04, 0.02, 2], [-0.05, -0.04, 2]);
  return a;
})();

const mix = (a, b, t) => {
  const f = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};

// Note: places n items on the heap slots; fn(x, y, z, i) gets the jittered slot and the layer height.
function heap(n, rnd, fn, h) {
  for (let i = 0; i < n; i++) {
    const [x, z, layer] = HEAP[i];
    fn(x + (rnd() - 0.5) * 0.03, layer * h, z + (rnd() - 0.5) * 0.03, i);
  }
}

// Note: a plain wooden crate with a label; the item sits on the lid at y 0.3.
function base(b, C, col) {
  b.box([0.28, 0.26, 0.28], [0, 0, 0], C.wood, { sh: [0.9, 1.05] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.045, 0.3, 0.045], [sx * 0.125, 0, sz * 0.125], C.woodD);
  b.box([0.2, 0.05, 0.2], [0, 0.25, 0], col, { sh: [0.95, 1.1] });
  b.box([0.14, 0.09, 0.012], [0, 0.08, 0.146], C.cream);
  b.box([0.07, 0.06, 0.016], [0, 0.095, 0.149], col);
}

const TOP = 0.3;

const MODELS = {
  // Note: ribbon, pink spools.
  ribbon: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.07, 0.07, 0.1, 6, [-0.04, TOP, 0], col, { sh: [0.9, 1.1] });
      b.cyl(0.085, 0.085, 0.02, 6, [-0.04, TOP, 0], 0xf6d8e4);
      b.cyl(0.085, 0.085, 0.02, 6, [-0.04, TOP + 0.1, 0], 0xf6d8e4);
      b.box([0.14, 0.01, 0.04], [0.1, TOP, 0.02], col, { r: [0, 0.4, 0] });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.cyl(0.085, 0.085, 0.1, 5, [x, y, z], i % 2 ? col : 0xf2a8c6, { r: [0, i, 0], sh: [0.9, 1.1], cf: (cx, cy) => (cy > y + 0.095 ? 0xf6d8e4 : i % 2 ? col : 0xf2a8c6) });
      }, 0.11);
    },
  },
  // Note: grainsack, tied sacks.
  grainsack: {
    crate(b, C, col) {
      base(b, C, col);
      b.ico(0.1, [0, TOP + 0.08, 0], 0xe8d6a8, { s: [1, 0.95, 0.85], j: 0.01 });
      b.cone(0.045, 0.07, 4, [0, TOP + 0.17, 0], mix(0xe8d6a8, 0x8a6a40, 0.3));
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        const sc = mix(0xe8d6a8, col, i % 2 ? 0.3 : 0.1);
        b.ico(0.11, [x, y + 0.09, z], sc, { s: [1, 0.95, 0.85], j: 0.01, r: [0, i, 0] });
        b.cone(0.045, 0.06, 4, [x, y + 0.18, z], mix(sc, 0x8a6a40, 0.3));
      }, 0.15);
    },
  },
  // Note: cider, small barrels with orange hoops.
  cider: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.08, 0.075, 0.15, 6, [0, TOP, 0], C.woodL, { sh: [0.9, 1.05] });
      b.cyl(0.085, 0.085, 0.025, 6, [0, TOP + 0.03, 0], col);
      b.cyl(0.085, 0.085, 0.025, 6, [0, TOP + 0.1, 0], col);
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        const wc = i % 2 ? C.woodL : C.wood;
        b.ico(0.1, [x, y + 0.08, z], wc, { s: [0.9, 1.05, 0.9], r: [0, i, 0], cf: (cx, cy) => (Math.abs(cy - y - 0.08) < 0.04 ? col : wc) });
      }, 0.15);
    },
  },
  // Note: honey, amber jars with brass lids.
  honey: {
    crate(b, C, col) {
      base(b, C, col);
      for (const dx of [-0.05, 0.06]) {
        b.cyl(0.05, 0.05, 0.1, 6, [dx, TOP, dx * 0.4], col, { sh: [0.85, 1.15] });
        b.cyl(0.055, 0.055, 0.03, 6, [dx, TOP + 0.1, dx * 0.4], BRASS);
      }
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        const jc = i % 3 ? col : 0xf6cf6a;
        b.cyl(0.065, 0.065, 0.12, 5, [x, y, z], jc, { sh: [0.85, 1.15], cf: (cx, cy) => (cy > y + 0.115 ? BRASS : jc) });
      }, 0.14);
    },
  },
  // Note: bellmetal, small bronze bells.
  bellmetal: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.05, 0.1, 0.14, 6, [0, TOP, 0], col, { sh: [0.85, 1.15] });
      b.dome(0.05, 0.05, 6, [0, TOP + 0.14, 0], col, { rings: 1 });
      b.box([0.02, 0.05, 0.02], [0, TOP + 0.19, 0], BRASS_D);
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.cyl(0.09, 0.04, 0.13, 5, [x, y, z], i % 2 ? col : 0xdba865, { sh: [0.85, 1.15], r: [0, i, 0] });
      }, 0.15);
    },
  },
  // Note: seasalt, white mounds with crystals.
  seasalt: {
    crate(b, C, col) {
      base(b, C, col);
      b.ico(0.12, [0, TOP + 0.04, 0], 0xf4f8fa, { s: [1, 0.6, 1], j: 0.01 });
      b.oct(0.04, [0.06, TOP + 0.1, 0.03], 0xdfeef4, { s: [0.7, 1.3, 0.7] });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.ico(0.1, [x, y + 0.06, z], i % 2 ? col : 0xdceaf0, { s: [1, 0.65, 1], j: 0.012, r: [0, i, 0] });
        if (i % 3 === 0) b.oct(0.035, [x + 0.03, y + 0.12, z], 0xf4f8fa, { s: [0.7, 1.4, 0.7] });
      }, 0.1);
    },
  },
  // Note: glaze, teal glazed pots.
  glaze: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.05, 0.09, 0.12, 6, [0, TOP, 0], col, { sh: [0.85, 1.15] });
      b.cyl(0.09, 0.05, 0.05, 6, [0, TOP + 0.12, 0], mix(col, 0xffffff, 0.2));
      b.cyl(0.04, 0.05, 0.04, 6, [0, TOP + 0.17, 0], mix(col, 0x20607a, 0.4), { open: true });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        const pc = i % 2 ? col : mix(col, 0xe8f4f0, 0.35);
        b.cyl(0.085, 0.06, 0.12, 5, [x, y, z], pc, { sh: [0.85, 1.15], cf: (cx, cy) => (cy > y + 0.115 ? mix(col, 0x20607a, 0.5) : pc) });
      }, 0.15);
    },
  },
  // Note: moonpearl, pearls on a cushion.
  moonpearl: {
    crate(b, C, col) {
      base(b, C, 0xb8c4f0);
      b.cyl(0.1, 0.11, 0.03, 6, [0, TOP, 0], 0x8f7fc8);
      b.sph(0.085, [0, TOP + 0.11, 0], 0xeef2ff, { ws: 7, hs: 4, v: 0.01 });
      b.sph(0.04, [0.09, TOP + 0.07, 0.04], col, { ws: 5, hs: 3, v: 0.01 });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.ico(0.07, [x, y + 0.07, z], i % 3 ? col : 0xcad6ff, { v: 0.01 });
      }, 0.1);
    },
  },
  // Note: prism, tinted triangular crystals.
  prism: {
    crate(b, C, col) {
      base(b, C, 0x7fcfe8);
      b.prism(0.12, 0.22, 0.1, [-0.03, TOP, 0], col, { r: [0, 0.3, 0], sh: [0.85, 1.2] });
      b.prism(0.08, 0.14, 0.07, [0.07, TOP, 0.03], 0xe0b8f0, { r: [0, -0.5, 0], sh: [0.85, 1.2] });
    },
    pile(b, n, C, col, rnd) {
      const tints = [col, 0xe0b8f0, 0xf6cfd6, 0xbff4ff];
      heap(n, rnd, (x, y, z, i) => {
        b.prism(0.1, 0.18, 0.085, [x, y, z], tints[i % 4], { r: [0, i * 1.3, 0.1 * ((i % 3) - 1)], sh: [0.85, 1.2] });
      }, 0.12);
    },
  },
  // Note: obsidian, black shards with a red-violet sheen.
  obsidian: {
    crate(b, C, col) {
      base(b, C, 0x4a4553);
      b.oct(0.07, [-0.03, TOP + 0.1, 0], col, { s: [0.7, 2.0, 0.7], r: [0, 0.4, 0.15], sh: [0.8, 1.3] });
      b.oct(0.05, [0.06, TOP + 0.07, 0.03], 0x4a3a56, { s: [0.7, 1.8, 0.7], r: [0.2, 1, -0.2], sh: [0.8, 1.3] });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.oct(0.065, [x, y + 0.115, z], i % 3 ? col : 0x4a3a56, { s: [0.75, 1.7, 0.75], r: [0.25 * ((i % 3) - 1), i, 0.2 * ((i % 2) - 0.5)], sh: [0.8, 1.3] });
      }, 0.02);
    },
  },
  // Note: sulphur, rough yellow lumps.
  sulphur: {
    crate(b, C, col) {
      base(b, C, 0xd9b84a);
      b.ico(0.08, [-0.03, TOP + 0.06, 0], col, { s: [1, 0.8, 1], j: 0.02, r: [0, 1, 0] });
      b.ico(0.06, [0.07, TOP + 0.05, 0.03], 0xf2e27a, { s: [1, 0.8, 1], j: 0.02 });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.ico(0.095, [x, y + 0.085, z], i % 2 ? col : 0xf2e27a, { s: [1, 0.78, 1], j: 0.022, r: [0, i, 0] });
      }, 0.1);
    },
  },
  // Note: everbloom, sprigs with pale blue blossoms.
  everbloom: {
    crate(b, C, col) {
      base(b, C, 0x9ad37c);
      b.cone(0.1, 0.12, 5, [0, TOP, 0], C.leaf, { sh: [0.9, 1.1] });
      for (const [dx, dz] of [[0.0, 0.0], [0.07, 0.03], [-0.06, 0.04]]) b.sph(0.045, [dx, TOP + 0.14, dz], col, { ws: 5, hs: 3, v: 0.02 });
      b.sph(0.035, [0.02, TOP + 0.2, -0.03], 0xcdeeff, { ws: 4, hs: 3, v: 0.02 });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.cone(0.07, 0.09, 4, [x, y, z], i % 2 ? C.leaf : C.leafL, { r: [0, i, 0] });
        b.sph(0.045, [x, y + 0.12, z], i % 3 ? col : 0xcdeeff, { ws: 5, hs: 3, v: 0.02 });
      }, 0.12);
    },
  },
  // Note: sunstone, golden gems in brass prongs.
  sunstone: {
    crate(b, C, col) {
      base(b, C, 0xf0c050);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.09;
        b.box([0.015, 0.1, 0.015], [Math.sin(a) * 0.07, TOP, Math.cos(a) * 0.07], BRASS_D);
      }
      b.oct(0.08, [0, TOP + 0.11, 0], col, { s: [1, 1.2, 1], sh: [0.85, 1.2], v: 0.02 });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.oct(0.075, [x, y + 0.08, z], i % 3 ? col : 0xffe48a, { s: [1, 1.15, 1], r: [0, i, 0], sh: [0.85, 1.2], v: 0.02 });
      }, 0.12);
    },
  },
  // Note: banner, rolled blue banners with brass ends.
  banner: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.05, 0.05, 0.3, 6, [0, TOP + 0.05, 0], col, { c: true, r: [0, 0.4, PI / 2], sh: [0.9, 1.1] });
      b.cyl(0.055, 0.055, 0.02, 6, [-0.12, TOP + 0.05, 0.05], BRASS, { c: true, r: [0, 0.4, PI / 2] });
      b.cyl(0.055, 0.055, 0.02, 6, [0.12, TOP + 0.05, -0.05], BRASS, { c: true, r: [0, 0.4, PI / 2] });
    },
    pile(b, n, C, col, rnd) {
      const rows = [4, 3, 2];
      let i = 0;
      for (let row = 0; row < 3 && i < n; row++) {
        for (let k = 0; k < rows[row] && i < n; k++, i++) {
          const z = (k - (rows[row] - 1) / 2) * 0.13;
          const y = 0.055 + row * 0.1;
          const x0 = (rnd() - 0.5) * 0.04;
          const rc = i % 2 ? col : 0x8da0e0;
          b.cyl(0.055, 0.055, 0.5, 5, [x0, y, z], rc, { c: true, r: [0, 0, PI / 2], sh: [0.9, 1.1], cf: (cx) => (Math.abs(cx - x0) > 0.24 ? BRASS : rc) });
        }
      }
    },
  },
  // Note: lens, brass-ringed glass discs.
  lens: {
    crate(b, C, col) {
      base(b, C, col);
      b.cyl(0.09, 0.09, 0.03, 8, [0, TOP, 0], BRASS);
      b.cyl(0.07, 0.07, 0.04, 8, [0, TOP + 0.01, 0], 0xd8f4fa);
      b.cyl(0.04, 0.05, 0.1, 5, [0.09, TOP, 0.04], BRASS_D, { r: [0.3, 0, 0.6] });
    },
    pile(b, n, C, col, rnd) {
      heap(n, rnd, (x, y, z, i) => {
        b.cyl(0.09, 0.09, 0.04, 6, [x, y, z], BRASS, { r: [0, i, 0], cf: (cx, cy) => (cy > y + 0.035 ? (i % 2 ? col : 0xe6fbff) : BRASS) });
      }, 0.04);
    },
  },
  // Note: bath, folded teal towels and a soap block.
  bath: {
    crate(b, C, col) {
      base(b, C, col);
      b.box([0.2, 0.05, 0.14], [0, TOP, 0], col, { sh: [0.9, 1.1] });
      b.box([0.2, 0.05, 0.14], [0, TOP + 0.05, 0], 0xf4f8fa, { r: [0, 0.1, 0] });
      b.box([0.08, 0.04, 0.05], [0.04, TOP + 0.1, 0.0], 0xf2a8c6);
    },
    pile(b, n, C, col, rnd) {
      for (let i = 0; i < n; i++) {
        const layer = Math.floor(i / 2);
        const j = i % 2;
        b.box([0.3, 0.05, 0.2], [(j - 0.5) * 0.04 + (rnd() - 0.5) * 0.02, layer * 0.052, (j - 0.5) * 0.12], i % 2 ? col : 0xf4f8fa, { r: [0, (rnd() - 0.5) * 0.2, 0] });
      }
    },
  },
};

for (const id of Object.keys(MODELS)) GOOD_MODELS[id] = MODELS[id];
