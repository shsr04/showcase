// Note: prop kit for hub rooms; each item type has a size for planning and an emitter for meshing.

import { L, SP, STYLE } from './config.js';
import { Rand } from './rand.js';

const CS = [1, 0, -1, 0];
const SN = [0, 1, 0, -1];
const UP = [0, 1, 0];

const mulT = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ad = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export const PAL = {
  crate: [[1, 1, 1], [0.82, 0.92, 0.78], [0.95, 0.82, 0.62], [0.72, 0.82, 0.96], [0.92, 0.72, 0.66]],
  cloth: [[0.85, 0.35, 0.3], [0.3, 0.45, 0.7], [0.85, 0.7, 0.3], [0.35, 0.6, 0.42], [0.6, 0.4, 0.62], [0.75, 0.5, 0.35]],
  steel: [[0.7, 0.72, 0.76], [0.9, 0.55, 0.32], [0.55, 0.65, 0.75], [0.7, 0.28, 0.22], [0.8, 0.8, 0.5]],
  green: [[0.5, 0.85, 0.45], [0.35, 0.7, 0.35], [0.6, 0.9, 0.5], [0.45, 0.75, 0.5]],
  book: [[0.62, 0.46, 0.34], [0.42, 0.46, 0.52], [0.6, 0.54, 0.38], [0.38, 0.48, 0.42], [0.5, 0.4, 0.48], [0.55, 0.38, 0.34]],
  toy: [[1, 0.35, 0.3], [0.3, 0.6, 1], [1, 0.85, 0.25], [0.4, 0.85, 0.45], [0.8, 0.45, 0.9]],
};

// Note: translates local face names (px, nz ...) into world names after the quarter-turn rotation.
function mapSkip(skip, F) {
  if (!skip) return '';
  let out = '';
  for (const m of skip.matchAll(/([pn])([xyz])/g)) {
    const s = m[1] === 'p' ? 1 : -1;
    let v;
    if (m[2] === 'x') v = F.vec(s, 0, 0);
    else if (m[2] === 'z') v = F.vec(0, 0, s);
    else v = [0, s, 0];
    const a = Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2;
    out += (v[a] > 0 ? 'p' : 'n') + 'xyz'[a];
  }
  return out;
}

const FULL = [0, 0, 1, 1];

// Note: local frame of an item: x right, y up from the floor, z front; yaw counts quarter turns.
export class Frame {
  constructor(it) {
    const q = (((it.yaw || 0) % 4) + 4) % 4;
    this.q = q;
    this.cs = CS[q];
    this.sn = SN[q];
    this.p = it.p;
  }

  pt(x, y, z) {
    return [this.p[0] + x * this.cs + z * this.sn, this.p[1] + y, this.p[2] - x * this.sn + z * this.cs];
  }

  vec(x, y, z) {
    return [x * this.cs + z * this.sn, y, -x * this.sn + z * this.cs];
  }

  box(b, x, y, z, hx, hy, hz, skip = '') {
    const c = this.pt(x, y, z);
    const odd = this.q & 1;
    b.box(c[0], c[1], c[2], odd ? hz : hx, hy, odd ? hx : hz, mapSkip(skip, this));
  }

  cyl(b, x, y0, y1, z, r0, r1 = r0, n = 10, caps = false) {
    b.cyl(this.pt(x, y0, z), this.pt(x, y1, z), r0, r1, n, caps);
  }

  // Note: horizontal cylinder along local z.
  cylZ(b, x, y, z0, z1, r0, r1 = r0, n = 10, caps = false) {
    b.cyl(this.pt(x, y, z0), this.pt(x, y, z1), r0, r1, n, caps);
  }

  cylX(b, x0, x1, y, z, r0, r1 = r0, n = 10, caps = false) {
    b.cyl(this.pt(x0, y, z), this.pt(x1, y, z), r0, r1, n, caps);
  }

  quad(b, p0, p1, p2, p3, nl, uvs = null) {
    b.quad(this.pt(...p0), this.pt(...p1), this.pt(...p2), this.pt(...p3), this.vec(...nl), uvs);
  }

  // Note: upright image on a plane that faces local +z (sign 1) or -z (sign -1); crop is [u0, v0, u1, v1].
  img(b, x, y, z, w, h, sign = 1, crop = FULL) {
    const [u0, v0, u1, v1] = crop;
    const s = sign;
    this.quad(
      b, [x - s * w / 2, y - h / 2, z], [x + s * w / 2, y - h / 2, z], [x + s * w / 2, y + h / 2, z], [x - s * w / 2, y + h / 2, z],
      [0, 0, s], [u0, v1, u1, v1, u1, v0, u0, v0],
    );
  }

  // Note: same for planes that face local +x (sign 1) or -x (sign -1); d is the extent along z.
  imgX(b, x, y, z, d, h, sign = 1, crop = FULL) {
    const [u0, v0, u1, v1] = crop;
    const s = sign;
    this.quad(
      b, [x, y - h / 2, z + s * d / 2], [x, y - h / 2, z - s * d / 2], [x, y + h / 2, z - s * d / 2], [x, y + h / 2, z + s * d / 2],
      [s, 0, 0], [u0, v1, u1, v1, u1, v0, u0, v0],
    );
  }
}

// Note: image quad on any plane; right and up are unit vectors and n = right x up faces the viewer.
function imgQuad(b, c, right, up, w, h, n, crop = FULL, rep = [1, 1]) {
  const [u0, v0, u1, v1] = crop;
  const p0 = ad(ad(c, right, -w / 2), up, -h / 2);
  const p1 = ad(ad(c, right, w / 2), up, -h / 2);
  const p2 = ad(ad(c, right, w / 2), up, h / 2);
  const p3 = ad(ad(c, right, -w / 2), up, h / 2);
  b.quad(p0, p1, p2, p3, n, [u0 * rep[0], v1 * rep[1], u1 * rep[0], v1 * rep[1], u1 * rep[0], v0 * rep[1], u0 * rep[0], v0 * rep[1]]);
}

function label(b, X, str, o, right, up, size, col, emis = 1.3, style = 0, align = 'center') {
  b.mat(L.PLATE_DARK, col, emis, style);
  b.text(str, o, right, up, size, X.atlas, { align });
}

function leafCard(b, c, a, w, h, tint, lean = 0) {
  b.mat(L.FOLIAGE, tint);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const p0 = [c[0] - ca * w / 2, c[1], c[2] - sa * w / 2];
  const p1 = [c[0] + ca * w / 2, c[1], c[2] + sa * w / 2];
  const p2 = [p1[0] - sa * lean, c[1] + h, p1[2] + ca * lean];
  const p3 = [p0[0] - sa * lean, c[1] + h, p0[2] + ca * lean];
  b.quad2(p0, p1, p2, p3, [-sa, 0, ca], [0, 1, 1, 1, 1, 0, 0, 0]);
}

function bulb(b, c, col, r = 0.07, emis = 2, style = 0) {
  b.mat(L.LAMP_WARM, col, emis, style);
  b.disc(c, [0, -1, 0], [1, 0, 0], [0, 0, 1], r, 8);
}

export const PROPS = {};
const def = (name, size, emit, opts = {}) => {
  PROPS[name] = { size, emit, ...opts };
};

export function itemHalf(it) {
  const s = it.s || PROPS[it.t].size;
  const odd = (it.yaw || 0) & 1;
  return [(odd ? s[2] : s[0]) / 2, s[1] / 2, (odd ? s[0] : s[2]) / 2];
}

// Note: collision AABB of a floor-standing item, or null for decor that does not block.
export function itemSolid(it) {
  const d = PROPS[it.t];
  if (!d || d.solid === false || it.solid === false) return null;
  const hh = itemHalf(it);
  const k = d.core || [1, 1, 1];
  return { kind: 'solid', c: [it.p[0], it.p[1] + hh[1], it.p[2]], h: [hh[0] * k[0], hh[1] * k[1], hh[2] * k[2]] };
}

// Note: storage and industry.

def('crate', [1.2, 1.2, 1.2], (b, it, F) => {
  const [w, h, d] = it.s || PROPS.crate.size;
  b.mat(L.CRATE, it.tint || [1, 1, 1]);
  F.box(b, 0, h / 2, 0, w / 2, h / 2, d / 2);
});

def('stack', [3, 2.4, 3], (b, it, F, X) => {
  const [w, h, d] = it.s;
  const rr = X.rr;
  const nx = Math.max(1, Math.round(w / 1.25));
  const nz = Math.max(1, Math.round(d / 1.25));
  const cw = w / nx;
  const cd = d / nz;
  const maxL = Math.max(1, Math.round(h / 1.2));
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const layers = 1 + Math.floor(rr.next() * maxL);
      let y = 0;
      for (let l = 0; l < layers; l++) {
        const ch = rr.range(1.0, 1.2);
        b.mat(L.CRATE, PAL.crate[rr.int(0, 4)]);
        F.box(b, -w / 2 + cw * (i + 0.5) + rr.range(-0.05, 0.05), y + ch / 2, -d / 2 + cd * (k + 0.5) + rr.range(-0.05, 0.05), cw / 2 - 0.03, ch / 2, cd / 2 - 0.03);
        y += ch;
      }
    }
  }
});

def('barrel', [0.85, 1.1, 0.85], (b, it, F) => {
  b.mat(L.PIPE, it.tint || PAL.steel[3]);
  F.cyl(b, 0, 0, 1.05, 0, 0.4, 0.4, 10, true);
  b.mat(L.PLATE_DARK, [0.7, 0.7, 0.72]);
  F.cyl(b, 0, 0.22, 0.3, 0, 0.415, 0.415, 10);
  F.cyl(b, 0, 0.76, 0.84, 0, 0.415, 0.415, 10);
});

def('tank', [3, 5, 3], (b, it, F) => {
  const [w, h] = it.s || PROPS.tank.size;
  const r = w / 2;
  b.mat(L.PIPE, it.tint || [0.82, 0.84, 0.88]);
  F.cyl(b, 0, 0.55, h - r * 0.45, 0, r, r, 14);
  F.cyl(b, 0, h - r * 0.45, h, 0, r, r * 0.45, 14, true);
  b.mat(L.PLATE_DARK, [0.6, 0.6, 0.62]);
  F.cyl(b, 0, 0.55, 0.62, 0, r * 1.02, r * 1.02, 14);
  F.cyl(b, 0, h * 0.5, h * 0.5 + 0.1, 0, r * 1.02, r * 1.02, 14);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) F.box(b, sx * r * 0.7, 0.3, sz * r * 0.7, 0.08, 0.3, 0.08);
  F.box(b, 0, 1.9, r + 0.02, 0.5, 0.5, 0.03);
  b.mat(L.METER, [1, 1, 1], 0.5);
  F.img(b, 0, 1.9, r + 0.06, 0.9, 0.9, 1);
  b.mat(L.PIPE, PAL.steel[1]);
  F.cyl(b, 0, h, h + 0.9, 0, 0.14, 0.14, 8);
});

def('column', [1, 8, 1], (b, it, F) => {
  const [w, h] = it.s || PROPS.column.size;
  const r = w / 2;
  b.mat(it.layer ?? L.CONCRETE, it.tint || [0.85, 0.85, 0.85]);
  F.cyl(b, 0, 0.3, h - 0.3, 0, r * 0.88, r * 0.88, 12);
  b.mat(L.PLATE_DARK, [0.6, 0.6, 0.62]);
  F.box(b, 0, 0.15, 0, r, 0.15, r);
  F.box(b, 0, h - 0.15, 0, r, 0.15, r);
  if (it.band) {
    b.mat(L.HAZARD, [1, 1, 1]);
    F.cyl(b, 0, 0.9, 1.5, 0, r * 0.9, r * 0.9, 12);
  }
});

def('shelf', [3, 2.3, 0.7], (b, it, F, X) => {
  const [w, h, d] = it.s || PROPS.shelf.size;
  const rr = X.rr;
  b.mat(L.PLATE_DARK, [0.55, 0.57, 0.6]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * (w / 2 - 0.04), h / 2, sz * (d / 2 - 0.04), 0.04, h / 2, 0.04);
  }
  const rows = Math.max(2, Math.round(h / 0.55));
  const kind = it.kind || 'boxes';
  for (let k = 0; k < rows; k++) {
    const y = 0.12 + (k * (h - 0.2)) / (rows - 1);
    b.mat(L.PLATE_DARK, [0.7, 0.72, 0.75]);
    F.box(b, 0, y, 0, w / 2 - 0.02, 0.025, d / 2 - 0.02);
    if (k === rows - 1) continue;
    const room = (h - 0.2) / (rows - 1) - 0.08;
    let x = -w / 2 + 0.12;
    while (x < w / 2 - 0.2) {
      if (rr.next() < 0.18) {
        x += rr.range(0.15, 0.4);
        continue;
      }
      if (kind === 'books' || kind === 'files') {
        const run = Math.min(rr.range(0.25, 0.8), w / 2 - 0.1 - x);
        const bh = Math.min(room, rr.range(0.26, 0.4));
        b.mat(L.CABLES, kind === 'files' ? [0.62, 0.6, 0.52] : PAL.book[rr.int(0, 5)]);
        F.box(b, x + run / 2, y + 0.025 + bh / 2, 0, run / 2, bh / 2, d * 0.36);
        x += run + 0.03;
      } else {
        const bw = Math.min(rr.range(0.3, 0.7), w / 2 - 0.1 - x);
        const bh = Math.min(room, rr.range(0.2, 0.46));
        b.mat(L.CRATE, PAL.crate[rr.int(0, 4)]);
        F.box(b, x + bw / 2, y + 0.025 + bh / 2, 0, bw / 2, bh / 2, d * 0.38);
        x += bw + 0.05;
      }
    }
  }
});

def('rack', [0.85, 2.1, 0.9], (b, it, F) => {
  const [w, h, d] = it.s || PROPS.rack.size;
  b.mat(L.PLATE_DARK, [0.5, 0.52, 0.56]);
  F.box(b, 0, h / 2, 0, w / 2, h / 2, d / 2, 'pz');
  b.mat(L.LED_RACK, it.tint || [1, 1, 1], 1.1, it.style || 0);
  F.img(b, 0, h / 2, d / 2 + 0.004, w - 0.08, h - 0.1, 1);
});

def('manifold', [2.6, 7, 2.6], (b, it, F, X) => {
  const [w, h] = it.s || PROPS.manifold.size;
  const rr = X.rr;
  const offs = [[-0.7, -0.5, 0.42], [0.6, -0.4, 0.3], [0.05, 0.6, 0.5]];
  for (let k = 0; k < offs.length; k++) {
    const [x, z, r] = offs[k];
    b.mat(L.PIPE, PAL.steel[(it.pal || 0) + k > 4 ? 0 : (it.pal || 0) + k]);
    F.cyl(b, x, 0, h, z, r, r, 12);
    b.mat(L.PLATE_DARK, [0.55, 0.55, 0.58]);
    for (let y = 1.2; y < h; y += 2.6 + rr.next()) F.cyl(b, x, y, y + 0.12, z, r + 0.06, r + 0.06, 12);
    const wy = 1.3 + k * 0.5;
    b.mat(L.PLATE_DARK, [0.8, 0.25, 0.2]);
    F.cyl(b, x, wy, wy + 0.05, z + r + 0.2, 0.34, 0.34, 10, true);
    F.box(b, x, wy + 0.025, z + r + 0.2, 0.34, 0.03, 0.03);
    F.box(b, x, wy + 0.025, z + r + 0.2, 0.03, 0.03, 0.34);
    F.box(b, x, wy - 0.15, z + r + 0.1, 0.03, 0.17, 0.03);
  }
  b.mat(L.PLATE_DARK, [0.45, 0.45, 0.48]);
  F.box(b, 0, 0.12, 0, w / 2 - 0.2, 0.12, w / 2 - 0.2);
});

def('forklift', [1.6, 2.2, 3.2], (b, it, F) => {
  b.mat(L.PLATE_DARK, [1.2, 0.95, 0.3]);
  F.box(b, 0, 0.7, -0.3, 0.75, 0.35, 1.2);
  F.box(b, 0, 1.3, -0.9, 0.7, 0.35, 0.4);
  b.mat(L.PLATE_DARK, [0.35, 0.35, 0.38]);
  for (const sx of [-1, 1]) {
    F.box(b, sx * 0.72, 1.8, -0.55, 0.04, 0.45, 0.04);
    F.box(b, sx * 0.72, 1.8, -1.25, 0.04, 0.45, 0.04);
  }
  F.box(b, 0, 2.2, -0.9, 0.78, 0.03, 0.4);
  b.mat(L.BLACK, [1, 1, 1]);
  for (const sx of [-1, 1]) {
    F.cylX(b, sx * 0.62, sx * 0.88, 0.32, 0.55, 0.32, 0.32, 10, true);
    F.cylX(b, sx * 0.62, sx * 0.88, 0.28, -1.15, 0.28, 0.28, 10, true);
  }
  b.mat(L.PLATE_DARK, [0.5, 0.5, 0.55]);
  F.box(b, 0, 1.2, 1.35, 0.08, 1.1, 0.08);
  F.box(b, 0.28, 0.2, 1.9, 0.07, 0.04, 0.9);
  F.box(b, -0.28, 0.2, 1.9, 0.07, 0.04, 0.9);
});

def('cart', [1.0, 1.0, 0.6], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.8, 0.25, 0.2]);
  F.box(b, 0, 0.6, 0, 0.5, 0.04, 0.3);
  F.box(b, 0, 0.9, -0.28, 0.5, 0.35, 0.02);
  b.mat(L.PLATE_DARK, [0.5, 0.5, 0.52]);
  F.box(b, 0, 0.25, 0, 0.5, 0.025, 0.3);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * 0.46, 0.3, sz * 0.26, 0.025, 0.3, 0.025);
  }
  b.mat(L.METAL_BRIGHT, [1, 1, 1]);
  F.box(b, -0.15, 0.65, 0.05, 0.12, 0.03, 0.05);
  F.box(b, 0.2, 0.64, -0.05, 0.05, 0.02, 0.15);
  b.mat(L.CRATE, PAL.crate[1]);
  F.box(b, 0.1, 0.35, 0, 0.2, 0.1, 0.18);
});

// Note: offices and control.

def('console', [2.6, 1.9, 1.1], (b, it, F, X) => {
  const [w] = it.s || PROPS.console.size;
  const col = it.color || [0.4, 1, 0.6];
  b.mat(L.PLATE_DARK, [0.55, 0.58, 0.64]);
  F.box(b, 0, 0.45, -0.05, w / 2, 0.45, 0.5);
  b.mat(L.CONSOLE, it.tint || [1, 1, 1], 0.55);
  F.quad(b, [-w / 2, 0.92, 0.55], [w / 2, 0.92, 0.55], [w / 2, 1.14, -0.12], [-w / 2, 1.14, -0.12], [0, 0.95, 0.3], [0, 0, w / 1.1, 0, w / 1.1, 0.8, 0, 0.8]);
  const n = Math.max(1, Math.floor(w / 1.1));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w / n);
    b.mat(L.PLATE_DARK, [0.4, 0.42, 0.46]);
    F.box(b, x, 1.55, -0.38, w / n / 2 - 0.08, 0.34, 0.07);
    F.box(b, x, 1.2, -0.3, 0.1, 0.1, 0.1);
    b.mat(SP.SCREEN, col, 1.3 + (i % 2) * 0.4);
    F.img(b, x, 1.55, -0.3, w / n - 0.26, 0.58, 1);
  }
  void X;
});

def('desk', [1.8, 1.3, 0.85], (b, it, F) => {
  const [w, , d] = it.s || PROPS.desk.size;
  b.mat(L.WOOD, it.tint || [0.9, 0.85, 0.8]);
  F.box(b, 0, 0.74, 0, w / 2, 0.035, d / 2);
  b.mat(L.PLATE_DARK, [0.5, 0.52, 0.56]);
  for (const sx of [-1, 1]) F.box(b, sx * (w / 2 - 0.05), 0.36, 0, 0.04, 0.36, d / 2 - 0.05);
  F.box(b, 0, 0.5, -d / 2 + 0.05, w / 2 - 0.1, 0.22, 0.015);
  if (it.crt) {
    b.mat(L.PLASTIC, [0.88, 0.84, 0.74]);
    F.box(b, -w * 0.15, 0.78 + 0.22, -d * 0.15, 0.27, 0.22, 0.26);
    F.box(b, -w * 0.15, 0.78 + 0.2, -d * 0.15 - 0.3, 0.18, 0.16, 0.1);
    b.mat(it.amber ? L.SCREEN_AMBER : L.SCREEN_GREEN, [1, 1, 1], 1.3);
    F.img(b, -w * 0.15, 0.78 + 0.23, -d * 0.15 + 0.265, 0.4, 0.3, 1);
    b.mat(L.PLASTIC, [0.8, 0.77, 0.7]);
    F.box(b, -w * 0.15, 0.775, d * 0.2, 0.22, 0.015, 0.08);
  }
  if (it.papers) {
    b.mat(L.PLASTIC, [1, 1, 0.95]);
    F.box(b, w * 0.3, 0.78, 0.05, 0.14, 0.02, 0.1);
    F.box(b, w * 0.22, 0.775, 0.12, 0.1, 0.012, 0.14);
  }
  if (it.lamp) {
    const x = w * 0.38;
    b.mat(L.PLATE_DARK, [0.25, 0.3, 0.28]);
    F.cyl(b, x, 0.775, 0.79, -d * 0.2, 0.08, 0.08, 8, true);
    F.cyl(b, x, 0.79, 1.05, -d * 0.2, 0.012, 0.012, 6);
    F.cyl(b, x, 1.0, 1.12, -d * 0.2 + 0.05, 0.03, 0.13, 8);
    bulb(b, F.pt(x, 1.0, -d * 0.2 + 0.05), it.lamp, 0.08, 2.2);
  }
});

def('chair', [0.6, 1.0, 0.6], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.3, 0.3, 0.33]);
  F.cyl(b, 0, 0.05, 0.45, 0, 0.03, 0.03, 6);
  F.box(b, 0, 0.05, 0, 0.26, 0.025, 0.04);
  F.box(b, 0, 0.05, 0, 0.04, 0.025, 0.26);
  b.mat(L.FABRIC, it.tint || PAL.cloth[1]);
  F.box(b, 0, 0.5, 0, 0.24, 0.05, 0.24);
  F.box(b, 0, 0.82, -0.24, 0.22, 0.28, 0.04);
}, { core: [0.8, 1, 0.8] });

def('couch', [2.2, 0.9, 0.95], (b, it, F) => {
  const [w, , d] = it.s || PROPS.couch.size;
  const t = it.tint || PAL.cloth[0];
  b.mat(L.FABRIC, t);
  F.box(b, 0, 0.32, 0.05, w / 2 - 0.2, 0.17, d / 2 - 0.1);
  F.box(b, 0, 0.62, -d / 2 + 0.17, w / 2 - 0.2, 0.3, 0.17);
  for (const sx of [-1, 1]) F.box(b, sx * (w / 2 - 0.1), 0.38, 0, 0.1, 0.3, d / 2);
  b.mat(L.PLATE_DARK, [0.25, 0.22, 0.2]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * (w / 2 - 0.1), 0.06, sz * (d / 2 - 0.1), 0.04, 0.06, 0.04);
  }
});

def('armchair', [0.95, 0.9, 0.95], (b, it, F) => {
  const t = it.tint || PAL.cloth[2];
  b.mat(L.FABRIC, t);
  F.box(b, 0, 0.3, 0.05, 0.3, 0.16, 0.38);
  F.box(b, 0, 0.62, -0.34, 0.4, 0.32, 0.13);
  for (const sx of [-1, 1]) F.box(b, sx * 0.38, 0.38, 0, 0.09, 0.28, 0.45);
  b.mat(L.PLATE_DARK, [0.25, 0.22, 0.2]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * 0.36, 0.05, sz * 0.38, 0.035, 0.05, 0.035);
  }
});

def('table', [1.6, 0.78, 0.9], (b, it, F) => {
  const [w, , d] = it.s || PROPS.table.size;
  b.mat(it.layer ?? L.WOOD, it.tint || [0.85, 0.78, 0.7]);
  F.box(b, 0, 0.74, 0, w / 2, 0.035, d / 2);
  b.mat(L.PLATE_DARK, [0.4, 0.38, 0.38]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * (w / 2 - 0.08), 0.36, sz * (d / 2 - 0.08), 0.03, 0.36, 0.03);
  }
  if (it.lamp) {
    b.mat(L.PLATE_DARK, [0.3, 0.25, 0.2]);
    F.cyl(b, 0, 0.775, 0.95, 0, 0.05, 0.03, 8, true);
    F.cyl(b, 0, 0.95, 1.12, 0, 0.1, 0.16, 8);
    bulb(b, F.pt(0, 1.0, 0), it.lamp, 0.09, 2.2);
  }
  if (it.mugs) {
    b.mat(L.PLASTIC, [0.9, 0.9, 0.88]);
    F.cyl(b, w * 0.25, 0.775, 0.84, d * 0.18, 0.04, 0.04, 8, true);
    F.cyl(b, -w * 0.3, 0.775, 0.84, -d * 0.2, 0.04, 0.04, 8, true);
  }
});

def('rtable', [1.2, 0.78, 1.2], (b, it, F) => {
  const r = (it.s || PROPS.rtable.size)[0] / 2;
  b.mat(it.layer ?? L.WOOD, it.tint || [0.85, 0.78, 0.7]);
  F.cyl(b, 0, 0.72, 0.78, 0, r, r, 14, true);
  b.mat(L.PLATE_DARK, [0.4, 0.38, 0.38]);
  F.cyl(b, 0, 0, 0.72, 0, 0.05, 0.05, 6);
  F.cyl(b, 0, 0, 0.04, 0, r * 0.5, r * 0.5, 10, true);
  if (it.lamp) {
    b.mat(L.PLATE_DARK, [0.3, 0.25, 0.2]);
    F.cyl(b, 0, 0.78, 0.95, 0, 0.05, 0.03, 8, true);
    F.cyl(b, 0, 0.95, 1.12, 0, 0.1, 0.16, 8);
    bulb(b, F.pt(0, 1.0, 0), it.lamp, 0.09, 2.2);
  }
}, { core: [0.9, 1, 0.9] });

def('stool', [0.45, 0.72, 0.45], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.45, 0.45, 0.5]);
  F.cyl(b, 0, 0, 0.62, 0, 0.025, 0.025, 6);
  F.cyl(b, 0, 0, 0.03, 0, 0.2, 0.2, 8, true);
  b.mat(L.FABRIC, it.tint || PAL.cloth[0]);
  F.cyl(b, 0, 0.62, 0.7, 0, 0.2, 0.2, 10, true);
}, { solid: false });

def('bar', [4.4, 1.2, 1.0], (b, it, F) => {
  const [w, , d] = it.s || PROPS.bar.size;
  b.mat(L.WOOD, it.tint || [0.8, 0.62, 0.5]);
  F.box(b, 0, 0.52, d / 2 - 0.35, w / 2, 0.52, 0.35);
  b.mat(L.METAL_BRIGHT, [0.9, 0.9, 0.95]);
  F.box(b, 0, 1.07, d / 2 - 0.35, w / 2 + 0.05, 0.04, 0.45);
  F.box(b, 0, 0.2, d / 2 + 0.04, w / 2, 0.025, 0.03);
  b.mat(L.WOOD, [0.7, 0.55, 0.45]);
  F.box(b, 0, 0.9, -d / 2 + 0.1, w / 2, 0.9, 0.1);
  b.mat(L.PLATE_DARK, [0.35, 0.3, 0.28]);
  for (const y of [0.9, 1.35]) F.box(b, 0, y, -d / 2 + 0.28, w / 2 - 0.1, 0.03, 0.18);
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + 0.4 + (i * (w - 0.8)) / 8;
    const colr = PAL.toy[i % 5];
    b.mat(L.LAMP_WARM, colr, 0.9);
    F.cyl(b, x, 0.93, 1.2, -d / 2 + 0.28, 0.045, 0.045, 6, true);
  }
});

def('bunk', [1.1, 1.95, 2.2], (b, it, F) => {
  const [w, h, d] = it.s || PROPS.bunk.size;
  const t = it.tint || PAL.cloth[1];
  b.mat(L.PLATE_DARK, [0.5, 0.52, 0.56]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03), 0.03, h / 2, 0.03);
  }
  for (const y of [0.42, 1.28]) {
    b.mat(L.PLATE_DARK, [0.45, 0.47, 0.5]);
    F.box(b, 0, y - 0.06, 0, w / 2 - 0.03, 0.02, d / 2 - 0.03);
    b.mat(L.FABRIC, [0.85, 0.85, 0.82]);
    F.box(b, 0, y + 0.03, 0.05, w / 2 - 0.06, 0.07, d / 2 - 0.1);
    b.mat(L.FABRIC, t);
    F.box(b, 0, y + 0.1, 0.35, w / 2 - 0.05, 0.035, d / 2 - 0.5);
    b.mat(L.FABRIC, [0.9, 0.9, 0.88]);
    F.box(b, 0, y + 0.11, -d / 2 + 0.25, w / 2 - 0.15, 0.06, 0.18);
  }
  b.mat(L.PLATE_DARK, [0.5, 0.5, 0.54]);
  for (const sx of [-0.18, 0.18]) F.box(b, sx, 0.9, d / 2 + 0.02, 0.015, 0.92, 0.015);
  for (let y = 0.3; y < 1.6; y += 0.28) F.box(b, 0, y, d / 2 + 0.02, 0.18, 0.012, 0.012);
});

def('bed', [1.0, 0.7, 2.0], (b, it, F) => {
  const [w, , d] = it.s || PROPS.bed.size;
  b.mat(L.WOOD, [0.8, 0.7, 0.62]);
  F.box(b, 0, 0.22, 0, w / 2, 0.12, d / 2);
  F.box(b, 0, 0.5, -d / 2 + 0.03, w / 2, 0.3, 0.03);
  b.mat(L.FABRIC, [0.9, 0.9, 0.86]);
  F.box(b, 0, 0.42, 0.02, w / 2 - 0.04, 0.1, d / 2 - 0.05);
  b.mat(L.FABRIC, it.tint || PAL.cloth[3]);
  F.box(b, 0, 0.5, 0.4, w / 2 - 0.02, 0.04, d / 2 - 0.5);
  b.mat(L.FABRIC, [0.95, 0.95, 0.92]);
  F.box(b, 0, 0.53, -d / 2 + 0.28, w / 2 - 0.15, 0.06, 0.17);
});

def('locker', [2.0, 1.95, 0.5], (b, it, F, X) => {
  const [w, h, d] = it.s || PROPS.locker.size;
  const n = Math.max(1, Math.round(w / 0.5));
  const cw = w / n;
  const rr = X.rr;
  b.mat(L.PLATE_LIGHT, it.tint || [0.55, 0.65, 0.78]);
  F.box(b, 0, h / 2, 0, w / 2, h / 2, d / 2);
  b.mat(L.PLATE_DARK, [0.2, 0.2, 0.22]);
  for (let i = 0; i <= n; i++) F.box(b, -w / 2 + i * cw, h / 2, d / 2 + 0.003, 0.008, h / 2 - 0.02, 0.004);
  F.box(b, 0, 0.9, d / 2 + 0.003, w / 2, 0.006, 0.004);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + cw * (i + 0.5);
    b.mat(L.VENT, [0.7, 0.7, 0.72]);
    F.img(b, x, h - 0.2, d / 2 + 0.006, cw - 0.12, 0.14, 1);
    b.mat(L.METAL_BRIGHT, [1, 1, 1]);
    F.box(b, x + cw * 0.3, 1.2, d / 2 + 0.02, 0.012, 0.05, 0.015);
    if (rr.next() < 0.3) {
      b.mat(L.POSTER_NOTICE, [1, 1, 1]);
      F.img(b, x, 1.45, d / 2 + 0.008, 0.2, 0.2, 1, [0.1, 0.05, 0.5, 0.45]);
    }
  }
});

def('pew', [2.6, 0.95, 0.7], (b, it, F) => {
  const [w] = it.s || PROPS.pew.size;
  b.mat(L.WOOD, it.tint || [0.8, 0.62, 0.5]);
  F.box(b, 0, 0.46, 0.05, w / 2, 0.035, 0.27);
  F.box(b, 0, 0.9, -0.3, w / 2, 0.24, 0.03);
  for (const sx of [-1, 1]) F.box(b, sx * (w / 2 - 0.04), 0.48, 0, 0.04, 0.48, 0.34);
  b.mat(L.WOOD, [0.6, 0.48, 0.4]);
  F.box(b, 0, 0.12, 0.38, w / 2 - 0.1, 0.1, 0.05);
});

def('planter', [3, 1.0, 1.1], (b, it, F, X) => {
  const [w, , d] = it.s || PROPS.planter.size;
  const rr = X.rr;
  b.mat(L.PLATE_DARK, [0.55, 0.58, 0.6]);
  F.box(b, 0, 0.2, 0, w / 2, 0.2, d / 2);
  b.mat(L.SOIL, [1, 1, 1]);
  F.box(b, 0, 0.4, 0, w / 2 - 0.05, 0.015, d / 2 - 0.05, 'ny');
  const n = Math.round(w * d * 2.6);
  for (let i = 0; i < n; i++) {
    const c = F.pt(rr.range(-w / 2 + 0.2, w / 2 - 0.2), 0.4, rr.range(-d / 2 + 0.2, d / 2 - 0.2));
    leafCard(b, c, rr.range(0, Math.PI), rr.range(0.5, 0.95), rr.range(0.5, 1.0), it.green || PAL.green[rr.int(0, 3)], rr.range(-0.1, 0.1));
  }
}, { core: [1, 0.5, 1] });

def('tree', [1.6, 3.5, 1.6], (b, it, F, X) => {
  const [, h] = it.s || PROPS.tree.size;
  const rr = X.rr;
  b.mat(L.PLATE_DARK, [0.5, 0.5, 0.52]);
  F.cyl(b, 0, 0, 0.45, 0, 0.5, 0.5, 10, true);
  b.mat(L.SOIL, [1, 1, 1]);
  F.cyl(b, 0, 0.44, 0.47, 0, 0.46, 0.46, 10, true);
  b.mat(L.WOOD, [0.7, 0.6, 0.5]);
  F.cyl(b, 0, 0.45, h * 0.7, 0, 0.14, 0.07, 8);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = rr.range(0, Math.PI * 2);
    const rad = rr.range(0.1, 0.6);
    const c = F.pt(Math.cos(a) * rad, h * rr.range(0.42, 0.75), Math.sin(a) * rad);
    leafCard(b, c, rr.range(0, Math.PI), rr.range(1.2, 1.9), rr.range(1.0, 1.6), it.green || PAL.green[rr.int(0, 3)], rr.range(-0.2, 0.2));
  }
}, { core: [0.35, 1, 0.35] });

// Note: entertainment.

def('cabinet', [0.95, 1.95, 0.95], (b, it, F, X) => {
  const col = it.color || [1, 0.3, 0.7];
  b.mat(L.BLACK, mulT(col, 0.35));
  F.box(b, 0, 0.5, 0, 0.45, 0.5, 0.45, 'pz');
  F.box(b, 0, 1.45, -0.13, 0.45, 0.5, 0.32, 'pz');
  F.box(b, -0.44, 1.0, 0.03, 0.01, 1.0, 0.48);
  b.mat(L.ARCADE, col, 0.5);
  F.imgX(b, -0.453, 1.0, 0.02, 0.9, 1.9, -1, [0.1, 0.0, 0.9, 1]);
  F.imgX(b, 0.453, 1.0, 0.02, 0.9, 1.9, 1, [0.1, 0.0, 0.9, 1]);
  b.mat(L.PLATE_DARK, [0.3, 0.3, 0.34]);
  F.box(b, 0, 1.0, 0.22, 0.45, 0.05, 0.28);
  b.mat(L.CONSOLE, [1, 1, 1], 0.5);
  F.quad(b, [-0.4, 1.06, 0.48], [0.4, 1.06, 0.48], [0.4, 1.08, -0.02], [-0.4, 1.08, -0.02], [0, 1, 0], [0, 0, 1.6, 0, 1.6, 0.8, 0, 0.8]);
  b.mat(L.PLATE_DARK, [0.8, 0.1, 0.1]);
  F.cyl(b, -0.15, 1.08, 1.2, 0.22, 0.014, 0.014, 6);
  F.cyl(b, -0.15, 1.2, 1.26, 0.22, 0.04, 0.04, 8, true);
  b.mat(L.ARCADE, [1, 1, 1], 1.6, it.style || 0);
  F.img(b, 0, 1.46, 0.2, 0.74, 0.58, 1);
  b.mat(L.BLACK, [0.5, 0.5, 0.55]);
  F.box(b, 0, 1.46, 0.19, 0.4, 0.34, 0.01, 'pz');
  F.box(b, -0.39, 1.46, 0.2, 0.02, 0.32, 0.02);
  F.box(b, 0.39, 1.46, 0.2, 0.02, 0.32, 0.02);
  F.box(b, 0, 1.78, 0.2, 0.4, 0.02, 0.02);
  F.box(b, 0, 1.15, 0.2, 0.4, 0.02, 0.02);
  const name = (it.name || 'ARCADE').toUpperCase();
  b.mat(L.PLATE_DARK, mulT(col, 0.3));
  F.box(b, 0, 1.87, 0.1, 0.45, 0.075, 0.42);
  const o = F.pt(0, 1.82, 0.525);
  label(b, X, name, o, F.vec(1, 0, 0), UP, Math.min(0.14, 0.84 / (name.length * 0.5)), mixCol(col, 0.7), 1.6, it.style || 0);
  b.mat(L.PLATE_DARK, [0.2, 0.2, 0.22]);
  F.box(b, 0.25, 0.82, 0.455, 0.07, 0.07, 0.012);
  b.mat(L.LAMP_RED, [1, 1, 1], 1.0, it.style || 0);
  F.img(b, 0.25, 0.82, 0.468, 0.08, 0.04, 1);
}, { core: [0.95, 1, 0.95] });

function mixCol(c, t) {
  return [c[0] + (1 - c[0]) * t, c[1] + (1 - c[1]) * t, c[2] + (1 - c[2]) * t];
}

def('pinball', [0.75, 1.3, 1.6], (b, it, F) => {
  const col = it.color || [0.2, 0.8, 1];
  b.mat(L.WOOD, [0.5, 0.4, 0.4]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * 0.3, 0.38, sz * 0.7, 0.03, 0.38, 0.03);
  }
  b.mat(L.PLATE_DARK, mulT(col, 0.5));
  F.box(b, 0, 0.84, 0, 0.37, 0.07, 0.8);
  b.mat(L.ARCADE, col, 1.0);
  F.quad(b, [-0.34, 0.915, 0.78], [0.34, 0.915, 0.78], [0.34, 0.915, -0.5], [-0.34, 0.915, -0.5], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
  b.mat(L.PLATE_DARK, mulT(col, 0.4));
  F.box(b, 0, 1.15, -0.62, 0.37, 0.3, 0.14);
  b.mat(L.ARCADE, [1, 1, 1], 1.5, it.style || 0);
  F.img(b, 0, 1.15, -0.47, 0.66, 0.5, 1);
  for (const sx of [-1, 1]) {
    b.mat(L.LAMP_WARM, col, 1.6);
    F.cyl(b, sx * 0.3, 0.92, 0.98, 0.4, 0.05, 0.05, 6, true);
  }
}, { core: [1, 0.95, 1] });

def('claw', [1.2, 2.1, 1.2], (b, it, F) => {
  const col = it.color || [1, 0.8, 0.3];
  b.mat(L.PLATE_DARK, mulT(col, 0.6));
  F.box(b, 0, 0.45, 0, 0.6, 0.45, 0.6);
  F.box(b, 0, 2.02, 0, 0.62, 0.08, 0.62);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * 0.58, 1.25, sz * 0.58, 0.03, 0.8, 0.03);
  }
  b.mat(L.GLASS, [0.8, 0.95, 1]);
  F.box(b, 0, 1.25, 0, 0.58, 0.78, 0.58, 'ny');
  b.mat(L.FOAM, [1, 0.5, 0.7]);
  for (let i = 0; i < 8; i++) F.box(b, ((i % 3) - 1) * 0.3, 0.97, (Math.floor(i / 3) - 1) * 0.3, 0.1, 0.1, 0.1);
  b.mat(L.LAMP_WARM, col, 1.8, it.style || 0);
  F.img(b, 0, 1.95, 0.0, 1.0, 1.0, 1);
  b.mat(L.NEON_PINK, [1, 1, 1], 1.4);
  F.img(b, 0, 0.5, 0.612, 0.8, 0.5, 1);
}, { core: [0.95, 1, 0.95] });

def('jukebox', [1.2, 1.9, 0.8], (b, it, F) => {
  const col = it.color || [1, 0.7, 0.35];
  b.mat(L.PLATE_DARK, [0.55, 0.12, 0.18]);
  F.box(b, 0, 0.7, 0, 0.55, 0.7, 0.38, 'pz');
  F.box(b, 0, 1.3, -0.05, 0.5, 0.2, 0.3, 'pz');
  b.mat(L.METAL_BRIGHT, [1, 1, 1]);
  F.cylZ(b, 0, 1.45, -0.28, 0.28, 0.52, 0.52, 14, true);
  b.mat(L.PLATE_DARK, [0.55, 0.12, 0.18]);
  F.cylZ(b, 0, 1.45, -0.3, 0.26, 0.5, 0.5, 14, true);
  b.mat(L.LAMP_WARM, col, 2.0, STYLE.BREATH);
  F.img(b, 0, 1.45, 0.27, 0.78, 0.78, 1);
  b.mat(L.NEON_CYAN, [1, 1, 1], 1.8);
  F.img(b, 0, 1.85, 0.3, 0.3, 0.3, 1);
  b.mat(L.PLATE_DARK, [0.15, 0.15, 0.18]);
  F.box(b, 0, 0.85, 0.385, 0.38, 0.12, 0.012);
  b.mat(L.LAMP_RED, [1, 1, 1], 1.5, STYLE.BREATH);
  for (const sx of [-1, 1]) F.box(b, sx * 0.5, 0.6, 0.39, 0.03, 0.45, 0.01);
  b.mat(L.CONSOLE, [1, 1, 1], 0.6);
  F.img(b, 0, 0.82, 0.4, 0.7, 0.18, 1, [0, 0, 1, 0.25]);
}, { core: [1, 1, 1] });

def('fountain', [4.6, 1.6, 4.6], (b, it, F) => {
  const r = (it.s || PROPS.fountain.size)[0] / 2;
  b.mat(L.CONCRETE, [0.8, 0.8, 0.82]);
  F.cyl(b, 0, 0, 0.55, 0, r, r, 16);
  F.cyl(b, 0, 0.55, 0.62, 0, r + 0.12, r + 0.12, 16, true);
  b.mat(L.WATER, [0.8, 1, 1], 0.3, 8);
  F.cyl(b, 0, 0.5, 0.54, 0, r - 0.1, r - 0.1, 16, true);
  b.mat(L.CONCRETE, [0.7, 0.7, 0.74]);
  F.cyl(b, 0, 0.5, 1.2, 0, 0.5, 0.3, 12, true);
  F.cyl(b, 0, 1.2, 1.3, 0, 0.8, 0.8, 12, true);
  b.mat(L.WATER, [0.8, 1, 1], 0.5, 8);
  F.cyl(b, 0, 1.3, 1.45, 0, 0.7, 0.7, 12, true);
  b.mat(L.LAMP_COOL, [0.8, 1, 1], 1.4, 8);
  F.cyl(b, 0, 1.45, 1.9, 0, 0.05, 0.02, 6, true);
}, { core: [1, 1, 1] });

def('shuttle', [15, 5.8, 13], (b, it, F, X) => {
  const hull = it.tint || [0.66, 0.68, 0.74];
  b.mat(L.PLATE_LIGHT, hull);
  F.cylZ(b, 0, 2.7, -5, 3.2, 1.75, 1.75, 14, true);
  F.cylZ(b, 0, 2.7, 3.2, 6.4, 1.75, 0.4, 14, true);
  b.mat(L.GLASS, [0.45, 0.7, 1]);
  F.box(b, 0, 3.55, 3.6, 0.7, 0.28, 0.9);
  b.mat(L.PLATE_LIGHT, mulT(hull, 0.85));
  F.box(b, -3.6, 2.05, -2.4, 2.6, 0.14, 2.3);
  F.box(b, 3.6, 2.05, -2.4, 2.6, 0.14, 2.3);
  F.box(b, -6.4, 2.05, -3.4, 1.0, 0.12, 1.4);
  F.box(b, 6.4, 2.05, -3.4, 1.0, 0.12, 1.4);
  b.mat(L.STRIPE_RED, [1.2, 0.8, 0.7]);
  F.box(b, -7.4, 2.9, -3.4, 0.08, 0.8, 1.2);
  F.box(b, 7.4, 2.9, -3.4, 0.08, 0.8, 1.2);
  b.mat(L.PLATE_LIGHT, hull);
  F.box(b, 0, 4.9, -4.4, 0.14, 1.4, 1.1);
  F.box(b, 0, 4.2, -4.8, 1.4, 0.1, 0.8);
  b.mat(L.STRIPE_BLUE, [1, 1, 1]);
  F.cylZ(b, 0, 2.7, 0.2, 1.1, 1.77, 1.77, 14);
  b.mat(L.PLATE_DARK, [0.4, 0.4, 0.44]);
  for (const [x, y] of [[-0.9, 2.1], [0.9, 2.1], [0, 3.5]]) F.cylZ(b, x, y, -5.8, -5, 0.62, 0.55, 10, true);
  for (const [x, y] of [[-0.9, 2.1], [0.9, 2.1], [0, 3.5]]) {
    b.mat(L.LAMP_COOL, [0.7, 0.9, 1], 2.4, STYLE.BREATH);
    F.quad(b, [x - 0.4, y - 0.4, -5.83], [x + 0.4, y - 0.4, -5.83], [x + 0.4, y + 0.4, -5.83], [x - 0.4, y + 0.4, -5.83], [0, 0, -1]);
  }
  b.mat(L.PLATE_DARK, [0.35, 0.35, 0.38]);
  F.box(b, 0, 0.7, 4.3, 0.1, 0.7, 0.1);
  for (const sx of [-1, 1]) {
    F.box(b, sx * 2.4, 0.75, -2.6, 0.12, 0.75, 0.12);
    F.box(b, sx * 2.4, 0.05, -2.6, 0.3, 0.05, 0.55);
  }
  F.box(b, 0, 0.05, 4.3, 0.2, 0.05, 0.4);
  const name = (it.name || 'HELIOS-9').toUpperCase();
  const size = 0.55;
  for (const s of [-1, 1]) {
    const o = F.pt(s * 1.78, 2.2, 1.5);
    const right = F.vec(0, 0, -s);
    label(b, X, name, o, right, UP, size, [0.16, 0.2, 0.3], 0, 0, 'center');
  }
}, { core: [1, 1, 1] });

def('core', [8, 20, 8], (b, it, F, X) => {
  const [w, h] = it.s || PROPS.core.size;
  const r = w / 2;
  b.mat(L.PLATE_DARK, [0.5, 0.55, 0.62]);
  F.cyl(b, 0, 0, 1.0, 0, r, r * 0.8, 16, true);
  b.mat(L.HAZARD, [1, 1, 1]);
  F.cyl(b, 0, 0.3, 0.7, 0, r + 0.02, r * 0.85, 16);
  b.mat(L.LED_RACK, [0.7, 0.9, 1], 0.9, STYLE.BREATH);
  F.cyl(b, 0, 1.0, h - 1.0, 0, r * 0.72, r * 0.72, 16);
  b.mat(L.PLATE_DARK, [0.5, 0.55, 0.62]);
  F.cyl(b, 0, h - 1.0, h, 0, r * 0.8, r, 16, true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * r * 0.74;
    const z = Math.sin(a) * r * 0.74;
    b.mat(L.GLOW_WHITE, [0.5, 0.85, 1], 2.4, STYLE.BREATH);
    F.cyl(b, x, 1.2, h - 1.2, z, 0.16, 0.16, 6);
  }
  for (let y = 3.5; y < h - 2; y += 4.5) {
    b.mat(L.PLATE_DARK, [0.55, 0.58, 0.64]);
    F.cyl(b, 0, y, y + 0.55, 0, r * 0.8, r * 0.8, 16, true);
    b.mat(L.HAZARD, [1, 1, 1]);
    F.cyl(b, 0, y + 0.15, y + 0.4, 0, r * 0.81, r * 0.81, 16);
  }
  void X;
}, { core: [1, 1, 1] });

def('telescope', [2.4, 3.2, 2.4], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.45, 0.48, 0.55]);
  F.cyl(b, 0, 0, 0.9, 0, 0.5, 0.35, 10, true);
  F.box(b, 0, 1.0, 0, 0.3, 0.12, 0.3);
  F.box(b, -0.45, 1.5, 0, 0.06, 0.45, 0.2);
  F.box(b, 0.45, 1.5, 0, 0.06, 0.45, 0.2);
  b.mat(L.METAL_BRIGHT, [0.9, 0.95, 1]);
  b.cyl(F.pt(0, 1.4, -0.9), F.pt(0, 2.3, 1.0), 0.32, 0.4, 12, true);
  b.mat(L.PLATE_DARK, [0.3, 0.3, 0.34]);
  b.cyl(F.pt(0.12, 1.65, 0.1), F.pt(0.12, 2.1, 0.7), 0.05, 0.05, 6, true);
}, { core: [0.8, 1, 0.8] });

def('altar', [2.6, 1.15, 0.9], (b, it, F) => {
  b.mat(L.CONCRETE, [0.8, 0.78, 0.74]);
  F.box(b, 0, 0.5, 0, 1.3, 0.5, 0.45);
  b.mat(L.WOOD, [0.7, 0.55, 0.45]);
  F.box(b, 0, 1.03, 0, 1.4, 0.04, 0.5);
  b.mat(L.PLASTIC, [0.95, 0.92, 0.85]);
  F.box(b, 0, 1.09, 0, 0.9, 0.012, 0.2);
});

def('candles', [0.4, 1.4, 0.4], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.45, 0.4, 0.3]);
  F.cyl(b, 0, 0, 1.05, 0, 0.025, 0.025, 6);
  F.cyl(b, 0, 0, 0.04, 0, 0.14, 0.14, 8, true);
  F.cyl(b, 0, 1.0, 1.04, 0, 0.12, 0.12, 8, true);
  b.mat(L.PLASTIC, [1, 0.97, 0.88]);
  F.cyl(b, 0, 1.04, 1.3, 0, 0.035, 0.035, 6);
  b.mat(L.LAMP_WARM, [1, 0.8, 0.45], 2.6, 1);
  const c = F.pt(0, 1.34, 0);
  b.disc(c, [0, 1, 0], [1, 0, 0], [0, 0, 1], 0.035, 6);
  b.disc(F.pt(0, 1.33, 0), [0, -1, 0], [1, 0, 0], [0, 0, 1], 0.035, 6);
}, { core: [0.5, 1, 0.5] });

def('crib', [1.3, 1.05, 0.8], (b, it, F) => {
  const [w, , d] = it.s || PROPS.crib.size;
  b.mat(L.WOOD, [0.95, 0.85, 0.7]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) F.box(b, sx * (w / 2 - 0.03), 0.5, sz * (d / 2 - 0.03), 0.03, 0.5, 0.03);
  }
  F.box(b, 0, 0.35, 0, w / 2, 0.02, d / 2);
  for (const sz of [-1, 1]) {
    F.box(b, 0, 0.95, sz * (d / 2 - 0.03), w / 2, 0.03, 0.02);
    for (let x = -w / 2 + 0.12; x < w / 2; x += 0.12) F.box(b, x, 0.65, sz * (d / 2 - 0.03), 0.01, 0.3, 0.01);
  }
  b.mat(L.FABRIC, it.tint || PAL.toy[2]);
  F.box(b, 0, 0.4, 0, w / 2 - 0.05, 0.05, d / 2 - 0.05);
});

def('blocks', [0.9, 0.5, 0.9], (b, it, F, X) => {
  const rr = X.rr;
  for (let i = 0; i < 5; i++) {
    const s = rr.range(0.14, 0.22);
    b.mat(L.FOAM, PAL.toy[rr.int(0, 4)]);
    F.box(b, rr.range(-0.35, 0.35), s, rr.range(-0.35, 0.35), s, s, s);
  }
}, { solid: false });

def('mat', [3, 0.03, 3], (b, it, F) => {
  const [w, , d] = it.s || PROPS.mat.size;
  b.mat(it.layer ?? L.FOAM, it.tint || [1, 0.8, 0.3]);
  F.box(b, 0, 0.015, 0, w / 2, 0.015, d / 2, 'ny');
}, { solid: false });

def('vending', [1.1, 1.9, 0.9], (b, it, F) => {
  const col = it.color || [0.4, 0.8, 1];
  b.mat(L.PLATE_DARK, [0.6, 0.62, 0.66]);
  F.box(b, 0, 0.95, 0, 0.55, 0.95, 0.45, 'pz');
  b.mat(L.LAMP_COOL, col, 1.5, it.style || 0);
  F.img(b, -0.1, 1.2, 0.451, 0.72, 1.2, 1);
  b.mat(L.PLATE_DARK, [0.2, 0.2, 0.24]);
  F.box(b, -0.1, 1.2, 0.455, 0.37, 0.61, 0.004);
  b.mat(L.LAMP_COOL, col, 1.5, it.style || 0);
  F.img(b, -0.1, 1.2, 0.462, 0.66, 1.1, 1);
  b.mat(L.CONSOLE, [1, 1, 1], 0.5);
  F.img(b, 0.4, 1.3, 0.452, 0.2, 0.5, 1, [0, 0, 0.3, 0.7]);
  b.mat(L.PLATE_DARK, [0.1, 0.1, 0.12]);
  F.box(b, 0, 0.42, 0.455, 0.35, 0.08, 0.005);
});

def('notice', [2.0, 1.4, 0.1], (b, it, F) => {
  b.mat(L.PLATE_DARK, [0.45, 0.4, 0.35]);
  for (const sx of [-1, 1]) F.box(b, sx * 0.95, 0.7, 0, 0.03, 0.7, 0.03);
  F.box(b, 0, 1.4, 0, 1.0, 0.03, 0.03);
  b.mat(L.POSTER_NOTICE, [1, 1, 1]);
  F.img(b, 0, 0.95, 0.04, 1.8, 1.2, 1);
  F.img(b, 0, 0.95, -0.04, 1.8, 1.2, -1);
});

// Note: surfaces and wall mounted decor.

export const WALLITEMS = {
  poster(b, it) {
    const right = cr(it.up, it.n);
    b.mat(L.PLATE_DARK, it.frame || [0.35, 0.35, 0.38]);
    b.obox(ad(it.p, it.n, 0.02), right, it.up, it.n, it.w / 2 + 0.05, it.h / 2 + 0.05, 0.02, 'nz');
    b.mat(it.layer, it.tint || [1, 1, 1], it.emis || 0, it.style || 0);
    imgQuad(b, ad(it.p, it.n, 0.042), right, it.up, it.w, it.h, it.n, it.crop || FULL, it.rep || [1, 1]);
  },
  sign(b, it, X) {
    const right = cr(it.up, it.n);
    const lines = Array.isArray(it.text) ? it.text : [it.text];
    const size = it.size || 0.4;
    const lh = size * 1.3;
    const widest = Math.max(...lines.map((s) => s.length));
    const w = widest * size * 0.5 + size * 0.7;
    const h = lines.length * lh + size * 0.35;
    if (it.plate !== false) {
      b.mat(L.PLATE_DARK, it.plate || [0.09, 0.09, 0.11]);
      b.obox(ad(it.p, it.n, 0.02), right, it.up, it.n, w / 2, h / 2, 0.02, 'nz');
      b.mat(L.PLATE_DARK, it.edge || [0.3, 0.3, 0.34]);
      b.obox(ad(it.p, it.n, 0.015), right, it.up, it.n, w / 2 + 0.04, h / 2 + 0.04, 0.015, 'nz');
    }
    for (let k = 0; k < lines.length; k++) {
      const y = (lines.length - 1) / 2 * lh - k * lh - size * 0.5;
      label(b, X, lines[k], ad(ad(it.p, it.n, 0.05), it.up, y), right, it.up, size, it.color || [1, 0.7, 0.3], it.emis ?? 1.3, it.style || 0);
    }
  },
  window(b, it) {
    const right = cr(it.up, it.n);
    b.mat(SP.SKY, it.tint || [1, 1, 1]);
    imgQuad(b, ad(it.p, it.n, 0.012), right, it.up, it.w, it.h, it.n);
    const f = it.frame || 0.28;
    b.mat(L.PLATE_DARK, [0.38, 0.4, 0.46]);
    const c = ad(it.p, it.n, 0.09);
    b.obox(ad(c, it.up, it.h / 2 + f / 2), right, it.up, it.n, it.w / 2 + f, f / 2, 0.09);
    b.obox(ad(c, it.up, -it.h / 2 - f / 2), right, it.up, it.n, it.w / 2 + f, f / 2, 0.09);
    b.obox(ad(c, right, it.w / 2 + f / 2), right, it.up, it.n, f / 2, it.h / 2, 0.09);
    b.obox(ad(c, right, -it.w / 2 - f / 2), right, it.up, it.n, f / 2, it.h / 2, 0.09);
    const bars = it.bars || 0;
    for (let k = 1; k <= bars; k++) {
      b.obox(ad(c, right, -it.w / 2 + (it.w * k) / (bars + 1)), right, it.up, it.n, 0.07, it.h / 2, 0.07);
    }
    if (it.sill) b.obox(ad(ad(it.p, it.n, 0.2), it.up, -it.h / 2 - 0.05), right, it.up, it.n, it.w / 2 + f, 0.04, 0.2);
  },
  skylight(b, it) {
    const [cx, cy, cz] = it.c;
    const y = cy - 0.03;
    b.mat(SP.SKY, it.tint || [1, 1, 1]);
    b.quad([cx - it.hx, y, cz - it.hz], [cx + it.hx, y, cz - it.hz], [cx + it.hx, y, cz + it.hz], [cx - it.hx, y, cz + it.hz], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
    b.mat(L.PLATE_DARK, [0.38, 0.4, 0.46]);
    const bars = it.bars || 3;
    for (let k = 0; k <= bars; k++) b.box(cx - it.hx + (2 * it.hx * k) / bars, y - 0.1, cz, 0.09, 0.1, it.hz + 0.09, 'py');
    for (const s of [-1, 1]) b.box(cx, y - 0.1, cz + s * it.hz, it.hx + 0.09, 0.1, 0.09, 'py');
  },
  decal(b, it) {
    const hx = it.hx;
    const hz = it.hz;
    const y = it.p[1] + 0.012;
    b.mat(it.layer, it.tint || [1, 1, 1], it.emis || 0, it.style || 0);
    b.quad([it.p[0] - hx, y, it.p[2] - hz], [it.p[0] + hx, y, it.p[2] - hz], [it.p[0] + hx, y, it.p[2] + hz], [it.p[0] - hx, y, it.p[2] + hz], [0, 1, 0], it.uvs || null);
  },
  beam(b, it) {
    const mid = [(it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2, (it.a[2] + it.b[2]) / 2];
    b.mat(it.layer ?? L.BEAM, it.tint || [0.8, 0.8, 0.8]);
    b.box(mid[0], mid[1], mid[2], Math.abs(it.a[0] - it.b[0]) / 2 + it.hx, it.hy, Math.abs(it.a[2] - it.b[2]) / 2 + it.hz);
  },
  box(b, it) {
    b.mat(it.layer ?? L.PLATE_DARK, it.tint || [0.5, 0.5, 0.55], it.emis || 0, it.style || 0);
    b.box(it.c[0], it.c[1], it.c[2], it.h[0], it.h[1], it.h[2], it.skip || '');
  },
  pipe(b, it) {
    b.mat(L.PIPE, it.tint || PAL.steel[0]);
    b.cyl(it.a, it.b, it.r, it.r, it.n || 8, true);
    const l = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1], it.b[2] - it.a[2]);
    const dir = [(it.b[0] - it.a[0]) / l, (it.b[1] - it.a[1]) / l, (it.b[2] - it.a[2]) / l];
    b.mat(L.PLATE_DARK, [0.5, 0.5, 0.54]);
    for (let s = 1.5; s < l - 0.3; s += it.every || 3) {
      const p0 = ad(it.a, dir, s);
      const p1 = ad(it.a, dir, s + 0.1);
      b.cyl(p0, p1, it.r + 0.05, it.r + 0.05, it.n || 8);
    }
  },
  stars(b, it) {
    const rr = new Rand(it.seed || 3);
    b.mat(L.LAMP_WARM, it.tint || [1, 0.92, 0.6], 1.2, 3);
    for (let i = 0; i < it.count; i++) {
      const x = rr.range(it.x0, it.x1);
      const z = rr.range(it.z0, it.z1);
      const s = rr.range(0.07, 0.16);
      b.quad([x - s, it.y, z - s], [x + s, it.y, z - s], [x + s, it.y, z + s], [x - s, it.y, z + s], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  },
  shop(b, it, X) {
    const right = cr(it.up, it.n);
    const w = it.w;
    const h = it.h;
    const col = it.color || [1, 0.4, 0.7];
    const o = it.p;
    b.mat(L.PLATE_DARK, [0.2, 0.2, 0.24]);
    b.obox(ad(o, it.n, 0.14), right, it.up, it.n, w / 2, h / 2, 0.14, 'nz');
    b.mat(it.layer ?? L.PLATE_DARK, it.tint || [0.35, 0.35, 0.4]);
    b.obox(ad(ad(o, it.up, h / 2 - 0.45), it.n, 0.3), right, it.up, it.n, w / 2 + 0.1, 0.45, 0.14, 'nz');
    b.mat(L.BLACK, [0.7, 0.8, 0.9]);
    imgQuad(b, ad(ad(o, it.up, -0.25), it.n, 0.3), right, it.up, w - 0.8, h - 1.5, it.n);
    b.mat(it.glow ?? L.LAMP_WARM, col, 1.0, it.style || 0);
    imgQuad(b, ad(ad(o, it.up, -0.25), it.n, 0.31), right, it.up, w - 1.2, h - 2.0, it.n);
    // Note: dark shelves and goods in silhouette against the glow give the window some depth.
    const rr = X.rr;
    const gw = (w - 1.2) / 2;
    const gh = h - 2.0;
    const shelves = gh > 2.2 ? 2 : 1;
    b.mat(L.BLACK, [0.55, 0.55, 0.6]);
    for (let k = 1; k <= shelves; k++) {
      const sy = -0.25 - gh / 2 + (k * gh) / (shelves + 1);
      b.obox(ad(ad(o, it.up, sy), it.n, 0.42), right, it.up, it.n, gw, 0.03, 0.12);
      for (let x = -gw + 0.3; x < gw - 0.3; x += rr.range(0.35, 0.9)) {
        const gh2 = rr.range(0.15, 0.55);
        const gw2 = rr.range(0.1, 0.28);
        b.obox(ad(ad(ad(o, right, x), it.up, sy + 0.03 + gh2), it.n, 0.42), right, it.up, it.n, gw2, gh2, 0.09);
      }
    }
    if (it.shutter) {
      b.mat(L.CORRUGATED, [0.8, 0.8, 0.8]);
      b.obox(ad(ad(o, it.up, h / 2 - 0.45 - it.shutter / 2 - 0.45), it.n, 0.33), right, it.up, it.n, w / 2 - 0.3, it.shutter / 2, 0.03, 'nz');
    }
    label(b, X, it.text, ad(ad(o, it.up, h / 2 - 0.65), it.n, 0.46), right, it.up, it.size || 0.55, col, 1.8, it.style || 0);
  },
};

// Note: visible fixture for a planned room light; l.fix picks the shape and l.anchor is the mount point.
export function emitFixture(b, l) {
  const on = l.state !== 'dead';
  const col = on ? l.c : [0.07, 0.07, 0.08];
  const emis = on ? 1.7 : 0;
  const a = l.anchor || l.p;
  const n = l.n;
  const style = l.style || 0;
  switch (l.fix) {
    case 'panel': {
      const hx = l.fx ?? 0.7;
      const hz = l.fz ?? 0.35;
      b.mat(L.PLATE_DARK, [0.45, 0.45, 0.48]);
      b.box(a[0], a[1] - 0.05, a[2], hx + 0.06, 0.05, hz + 0.06, 'py');
      b.mat(on ? L.LIGHT_PANEL : L.PLASTIC, col, emis, style);
      b.quad([a[0] - hx, a[1] - 0.105, a[2] - hz], [a[0] + hx, a[1] - 0.105, a[2] - hz], [a[0] + hx, a[1] - 0.105, a[2] + hz], [a[0] - hx, a[1] - 0.105, a[2] + hz], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
      break;
    }
    case 'hang': {
      const drop = l.drop ?? 1.6;
      b.mat(L.PLATE_DARK, [0.25, 0.25, 0.28]);
      b.cyl([a[0], a[1] - drop, a[2]], [a[0], a[1], a[2]], 0.012, 0.012, 5);
      b.mat(L.PLATE_DARK, l.shade || [0.3, 0.26, 0.22]);
      b.cyl([a[0], a[1] - drop - 0.2, a[2]], [a[0], a[1] - drop, a[2]], 0.34, 0.07, 10, false);
      b.mat(on ? L.LAMP_WARM : L.PLASTIC, col, on ? 2.0 : 0, style);
      b.disc([a[0], a[1] - drop - 0.19, a[2]], [0, -1, 0], [1, 0, 0], [0, 0, 1], 0.17, 8);
      break;
    }
    case 'flood': {
      const drop = l.drop ?? 1.2;
      b.mat(L.PLATE_DARK, [0.3, 0.3, 0.33]);
      b.box(a[0], a[1] - drop / 2, a[2], 0.03, drop / 2, 0.03);
      b.box(a[0], a[1] - drop - 0.16, a[2], 0.45, 0.16, 0.3, 'ny');
      b.mat(on ? L.LAMP_COOL : L.PLASTIC, col, emis * 1.3, style);
      b.quad([a[0] - 0.4, a[1] - drop - 0.322, a[2] - 0.25], [a[0] + 0.4, a[1] - drop - 0.322, a[2] - 0.25], [a[0] + 0.4, a[1] - drop - 0.322, a[2] + 0.25], [a[0] - 0.4, a[1] - drop - 0.322, a[2] + 0.25], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
      break;
    }
    case 'tube': {
      const hl = l.len ?? 1.2;
      const alongX = l.axis === 'x';
      b.mat(L.PLATE_DARK, [0.4, 0.4, 0.44]);
      b.box(a[0], a[1] - 0.04, a[2], alongX ? hl + 0.04 : 0.1, 0.04, alongX ? 0.1 : hl + 0.04, 'py');
      if (l.drop > 0) {
        for (const sg of [-1, 1]) {
          const ex = a[0] + (alongX ? sg * hl * 0.8 : 0);
          const ez = a[2] + (alongX ? 0 : sg * hl * 0.8);
          b.cyl([ex, a[1], ez], [ex, a[1] + l.drop, ez], 0.012, 0.012, 5);
        }
      }
      b.mat(on ? L.LIGHT_PANEL : L.PLASTIC, col, emis, style);
      const hx = alongX ? hl : 0.07;
      const hz = alongX ? 0.07 : hl;
      b.quad([a[0] - hx, a[1] - 0.082, a[2] - hz], [a[0] + hx, a[1] - 0.082, a[2] - hz], [a[0] + hx, a[1] - 0.082, a[2] + hz], [a[0] - hx, a[1] - 0.082, a[2] + hz], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1]);
      break;
    }
    case 'beacon': {
      b.mat(L.PLATE_DARK, [0.3, 0.3, 0.33]);
      b.cyl([a[0], a[1], a[2]], [a[0], a[1] + 0.12, a[2]], 0.15, 0.12, 8, true);
      b.mat(on ? L.GLOW_WHITE : L.PLASTIC, col, on ? 2.4 : 0, style);
      b.cyl([a[0], a[1] + 0.12, a[2]], [a[0], a[1] + 0.3, a[2]], 0.1, 0.07, 8, true);
      break;
    }
    case 'sconce': {
      const r = cr(UP, n);
      b.mat(L.PLATE_DARK, [0.3, 0.26, 0.22]);
      b.obox(ad(a, n, 0.06), r, UP, n, 0.09, 0.14, 0.06, 'nz');
      b.mat(on ? L.LAMP_WARM : L.PLASTIC, col, on ? 2.0 : 0, style);
      b.obox(ad(ad(a, n, 0.1), UP, 0.1), r, UP, n, 0.06, 0.09, 0.05);
      break;
    }
    case 'strip': {
      const hl = l.len ?? 2;
      const alongX = l.axis === 'x';
      b.mat(on ? L.LIGHT_PANEL : L.PLASTIC, col, emis, style);
      b.box(l.p[0], l.p[1], l.p[2], alongX ? hl : 0.04, 0.03, alongX ? 0.04 : hl);
      break;
    }
    default:
      break;
  }
}

const WEIGHT = {
  stack: 5, shelf: 4, planter: 4, tree: 3, shuttle: 8, core: 3, cabinet: 2, locker: 2, bar: 2, bunk: 2, shop: 2, console: 2,
  manifold: 3, forklift: 2, pinball: 2, claw: 2, jukebox: 2, tank: 2, fountain: 2, skylight: 2, crib: 2, pew: 1.5,
};

// Note: splits a room's items and fixtures into chunks so meshing can be time sliced.
export function roomChunks(plan, budget = 14) {
  const chunks = [];
  let cur = [];
  let w = 0;
  const add = (e, wt) => {
    cur.push(e);
    w += wt;
    if (w >= budget) {
      chunks.push(cur);
      cur = [];
      w = 0;
    }
  };
  for (const it of plan.items) add({ it }, WEIGHT[it.t] || 1);
  for (const l of plan.lights) if (l.sp === 'R' && l.fix) add({ l }, 0.5);
  if (cur.length) chunks.push(cur);
  return chunks;
}

// Note: meshes one chunk; the field skips an item's own solid so baked occlusion ignores its collision box.
export function emitChunk(b, chunk, atlas, field) {
  for (const e of chunk) {
    if (e.l) {
      emitFixture(b, e.l);
      continue;
    }
    const it = e.it;
    if (field) field.skip = it.sol || null;
    const X = { atlas, rr: new Rand(it.seed || 1) };
    const wall = WALLITEMS[it.t];
    if (wall) wall(b, it, X);
    else if (PROPS[it.t]) PROPS[it.t].emit(b, it, new Frame(it), X);
  }
  if (field) field.skip = null;
}
