// Note: procedural low-poly models for Garden; pure geometry code, runs in node without DOM.
import {
  BufferGeometry, BufferAttribute, Color, Group, Mesh, Vector3, Matrix4, Quaternion, Euler, Box3,
  MeshStandardMaterial, MeshBasicMaterial, DoubleSide, BoxGeometry, CylinderGeometry, SphereGeometry,
  IcosahedronGeometry, OctahedronGeometry, TorusGeometry, CircleGeometry, SRGBColorSpace,
} from 'three';
import { GOODS, BUILDINGS, FLOURISH_IDS, TIER_SPOTS } from './config.js';
import { hashStr, rng } from './rand.js';
import { TIER_KITS } from './tiers/index.js';
// Note: content/ never imports models.js or config.js, so this import cannot cycle.
import { LANDMARK_KITS, GOOD_MODELS, SHIP_MODELS, SPIRE, ENV, DEED_INDEX } from './content/index.js';

const TAU = Math.PI * 2;
const PI = Math.PI;
const UP = new Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Note: materials.

export const MATS = {
  vertex: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  vertexDouble: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0, side: DoubleSide }),
  glow: new MeshBasicMaterial({ vertexColors: true }),
  glowWarm: new MeshBasicMaterial({ color: 0xffd38a }),
  glass: new MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false,
  }),
};

// Note: palette.

const C = {
  woodL: 0xd6aa72, wood: 0xb98a55, woodD: 0x946a45, woodDD: 0x6f4f38,
  thatch: 0xe6c67e, thatchD: 0xd3aa5f,
  plaster: 0xf5e9d3, cream: 0xf8f0de,
  stone: 0xc4c7c4, stoneD: 0xa4a8a9, stoneL: 0xdcdeda,
  moss: 0x95c67b, mossD: 0x72ab63,
  brick: 0xd4694c, brickD: 0xb6513c,
  clay: 0xe3aa7d,
  metal: 0xaab2ba, metalD: 0x747d86,
  dark: 0x3d302c, ember: 0xff8a3c, lampWarm: 0xffd88a,
  leaf: 0x7fbf68, leafL: 0x9ad37c, rope: 0xdcc58f,
  skin: 0xf3c9a5, hair: 0x7b5336, tunic: 0xf2e4c6, belt: 0xc79d66, boot: 0x7d5d44, trouser: 0xdac6a2,
};
const ROOF = [0xdb8a6c, 0x84b39c, 0x8aa8cb, 0xc48ca8];
const DARKROOF = [0x7f8fa3, 0x8b7a7e, 0x6f8f86, 0xa0705f];

// Note: geometry building blocks.

function hash3(x, y, z, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + s * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

const PROTO = new Map();
function protoOf(key, make) {
  let g = PROTO.get(key);
  if (!g) {
    const src = make();
    g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.computeBoundingBox();
    PROTO.set(key, g);
  }
  return g;
}
const pBox = () => protoOf('box', () => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
const pIco = () => protoOf('ico', () => new IcosahedronGeometry(1, 0));
const pOct = () => protoOf('oct', () => new OctahedronGeometry(1, 0));
const pCyl = (seg, ratio, open) =>
  protoOf(`cyl|${seg}|${ratio}|${open ? 1 : 0}`, () => new CylinderGeometry(ratio, 1, 1, seg, 1, !!open).translate(0, 0.5, 0));
const pDome = (seg, rings) => protoOf(`dome|${seg}|${rings}`, () => new SphereGeometry(1, seg, rings, 0, TAU, 0, PI / 2));
const pSphere = (ws, hs, th = PI) => protoOf(`sph|${ws}|${hs}|${th}`, () => new SphereGeometry(1, ws, hs, 0, TAU, 0, th));
const pTorus = (R, t, rs, ts) => protoOf(`tor|${R}|${t}|${rs}|${ts}`, () => new TorusGeometry(R, t, rs, ts));
const pDisc = (seg) => protoOf(`disc|${seg}`, () => new CircleGeometry(1, seg));
const pPrism = () => protoOf('prism', () => {
  // Note: triangular prism, base 1x1 on y=0, ridge along z at x=0, height 1.
  const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], Cc = [0, 1, 0.5];
  const A2 = [-0.5, 0, -0.5], B2 = [0.5, 0, -0.5], C2 = [0, 1, -0.5];
  const tris = [
    A, B, Cc,
    B2, A2, C2,
    B, B2, C2, B, C2, Cc,
    A2, A, Cc, A2, Cc, C2,
    A, A2, B2, A, B2, B,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(tris.flat()), 3));
  return g;
});

const _c = new Color(), _v = new Vector3(), _s = new Vector3(), _q = new Quaternion(), _e = new Euler();
const _tm = new Matrix4(), _m2 = new Matrix4();

function mat4(o, center) {
  if (o.s === undefined) _s.set(1, 1, 1);
  else if (typeof o.s === 'number') _s.set(o.s, o.s, o.s);
  else _s.set(o.s[0], o.s[1], o.s[2]);
  if (o.q) _q.copy(o.q);
  else if (o.r) _q.setFromEuler(_e.set(o.r[0], o.r[1], o.r[2], 'YXZ'));
  else _q.identity();
  const p = o.p;
  if (!p) _v.set(0, 0, 0);
  else if (Array.isArray(p)) _v.set(p[0], p[1], p[2]);
  else _v.copy(p);
  const m = new Matrix4().compose(_v, _q, _s);
  if (center && o.c) m.multiply(_tm.makeTranslation(0, -0.5, 0));
  return m;
}

// Note: merges non-indexed geometries that carry position + color; normals are recomputed flat.
export function mergeParts(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let at = 0;
  for (const p of parts) {
    const pa = p.attributes.position.array;
    pos.set(pa, at * 3);
    if (p.attributes.color) col.set(p.attributes.color.array, at * 3);
    else col.fill(1, at * 3, at * 3 + pa.length);
    at += pa.length / 3;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const asV = (a) => (Array.isArray(a) ? new Vector3(a[0], a[1], a[2]) : a);

class B {
  constructor() {
    this.parts = [];
    this.prims = [];
    this.tf = null;
  }

  group(o, fn) {
    const prev = this.tf;
    const m = mat4(o, false);
    this.tf = prev ? prev.clone().multiply(m) : m;
    fn();
    this.tf = prev;
  }

  // Note: o = { p, r, q, s, c (centered), j (jitter), js, sh [bottom, top] shade, v (per-face variation), cf (color fn) }.
  add(proto, col, o = {}) {
    const m = mat4(o, true);
    if (this.tf) m.premultiply(this.tf);
    const src = proto.attributes.position.array;
    const n = src.length / 3;
    const pos = new Float32Array(src.length);
    const colr = new Float32Array(src.length);
    const e = m.elements;
    const j = o.j || 0;
    const js = o.js !== undefined ? o.js : e[12] * 13.1 + e[13] * 7.3 + e[14] * 3.7;
    for (let i = 0; i < n; i++) {
      const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
      let px = e[0] * x + e[4] * y + e[8] * z + e[12];
      let py = e[1] * x + e[5] * y + e[9] * z + e[13];
      let pz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (j) {
        px += (hash3(x, y, z, js + 1) - 0.5) * 2 * j;
        py += (hash3(x, y, z, js + 2) - 0.5) * 2 * j;
        pz += (hash3(x, y, z, js + 3) - 0.5) * 2 * j;
      }
      pos[i * 3] = px;
      pos[i * 3 + 1] = py;
      pos[i * 3 + 2] = pz;
    }
    const bb = proto.boundingBox;
    const y0 = bb.min.y;
    const yr = bb.max.y - bb.min.y || 1;
    const sh = o.sh;
    const vv = o.v !== undefined ? o.v : 0.035;
    if (!o.cf) _c.set(col);
    let br = _c.r, bg = _c.g, bgb = _c.b;
    for (let t = 0; t < n; t += 3) {
      const cx = (pos[t * 3] + pos[t * 3 + 3] + pos[t * 3 + 6]) / 3;
      const cy = (pos[t * 3 + 1] + pos[t * 3 + 4] + pos[t * 3 + 7]) / 3;
      const cz = (pos[t * 3 + 2] + pos[t * 3 + 5] + pos[t * 3 + 8]) / 3;
      if (o.cf) {
        _c.set(o.cf(cx, cy, cz));
        br = _c.r; bg = _c.g; bgb = _c.b;
      }
      const f = 1 + (hash3(cx * 9.1, cy * 7.7, cz * 5.3, 2) - 0.5) * 2 * vv;
      for (let k = 0; k < 3; k++) {
        const i = t + k;
        let mul = f;
        if (sh) mul *= sh[0] + (sh[1] - sh[0]) * ((src[i * 3 + 1] - y0) / yr);
        colr[i * 3] = Math.min(1, br * mul);
        colr[i * 3 + 1] = Math.min(1, bg * mul);
        colr[i * 3 + 2] = Math.min(1, bgb * mul);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('color', new BufferAttribute(colr, 3));
    // Note: per-primitive bounds [minx, miny, minz, maxx, maxy, maxz]; the tier geometry check reads them.
    const pb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { pb[k] = Math.min(pb[k], pos[i + k]); pb[k + 3] = Math.max(pb[k + 3], pos[i + k]); }
    this.prims.push(pb);
    this.parts.push(g);
    return this;
  }

  box(s, p, col, o) { return this.add(pBox(), col, { ...o, s, p }); }

  cyl(rb, rt, h, seg, p, col, o = {}) {
    return this.add(pCyl(seg, +(rt / rb).toFixed(3), o.open), col, { ...o, s: [rb, h, rb], p });
  }

  cone(r, h, seg, p, col, o) { return this.cyl(r, 0, h, seg, p, col, o); }

  ico(r, p, col, o = {}) {
    const s = o.s ? o.s.map((v) => v * r) : r;
    return this.add(pIco(), col, { ...o, s, p });
  }

  oct(r, p, col, o = {}) {
    const s = o.s ? o.s.map((v) => v * r) : r;
    return this.add(pOct(), col, { ...o, s, p });
  }

  sph(r, p, col, o = {}) {
    const s = o.s ? o.s.map((v) => v * r) : r;
    return this.add(pSphere(o.ws || 8, o.hs || 5), col, { ...o, s, p });
  }

  dome(r, h, seg, p, col, o = {}) {
    return this.add(pDome(seg, o.rings || 3), col, { ...o, s: [r, h, r], p });
  }

  prism(w, h, d, p, col, o) { return this.add(pPrism(), col, { ...o, s: [w, h, d], p }); }

  torus(R, tube, p, col, o = {}) {
    return this.add(pTorus(R, tube, o.rs || 3, o.ts || 8), col, { ...o, p });
  }

  disc(r, p, col, o = {}) { return this.add(pDisc(o.seg || 6), col, { ...o, s: r, p }); }

  rod(a, b, r, col, o = {}) {
    const A = asV(a), Bv = asV(b);
    const d = new Vector3().subVectors(Bv, A);
    const len = d.length();
    if (len < 1e-6) return this;
    const q = new Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
    return this.add(pCyl(o.seg || 4, 1, true), col, {
      ...o, q, s: [r, len, r], c: true, p: new Vector3().addVectors(A, Bv).multiplyScalar(0.5),
    });
  }

  beam(a, b, t, col, o = {}) {
    const A = asV(a), Bv = asV(b);
    const d = new Vector3().subVectors(Bv, A);
    const len = d.length();
    if (len < 1e-6) return this;
    const q = new Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
    return this.add(pBox(), col, {
      ...o, q, s: [t, len, t], c: true, p: new Vector3().addVectors(A, Bv).multiplyScalar(0.5),
    });
  }

  build() {
    const g = mergeParts(this.parts);
    g.userData.prims = this.prims;
    this.parts = [];
    this.prims = [];
    return g;
  }
}

const GEO = new Map();
function cached(key, fn) {
  let g = GEO.get(key);
  if (!g) {
    g = fn();
    if (g.isBufferGeometry) g.userData.shared = true;
    GEO.set(key, g);
  }
  return g;
}

function mesh(geo, mat = MATS.vertex, shadow = true) {
  const m = new Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

// Note: gable roof from two slabs; ridge runs along z, slopes fall toward +-x. hw = eave half width.
function gable(b, { hw, h, d, y, col, t = 0.07, z = 0, fillCol = null, ridgeCol = null }) {
  const a = Math.atan2(h, hw);
  const L = Math.hypot(hw, h) + 0.04;
  for (const s of [-1, 1]) {
    b.add(pBox(), col, { p: [(s * hw) / 2, y + h / 2 - t * 0.5, z], r: [0, 0, -s * a], s: [L, t, d], c: true, sh: [0.94, 1.06] });
  }
  b.box([0.1, 0.07, d + 0.02], [0, y + h - 0.05, z], ridgeCol || col, { sh: [0.85, 0.9] });
  if (fillCol !== null) {
    for (const s of [-1, 1]) b.prism(2 * hw - 0.22, h - 0.08, 0.05, [0, y + 0.0, z + s * (d / 2 - 0.1)], fillCol);
  }
}

function plinth(b, w, d, col = C.stoneD) {
  b.box([w, 0.25, d], [0, -0.2, 0], col, { sh: [0.85, 1] });
}

// Note: folk.

const FOLK = {
  adult: { hip: 0.265, th: 0.26, rb: 0.125, rt: 0.088, hr: 0.105, arm: 0.2, ar: 0.032, lr: 0.042, sx: 0.125, tilt: 0, stick: false, lx: 0.052 },
  child: { hip: 0.16, th: 0.16, rb: 0.1, rt: 0.078, hr: 0.11, arm: 0.14, ar: 0.03, lr: 0.036, sx: 0.1, tilt: 0, stick: false, lx: 0.042 },
  elder: { hip: 0.26, th: 0.25, rb: 0.12, rt: 0.088, hr: 0.1, arm: 0.19, ar: 0.031, lr: 0.04, sx: 0.12, tilt: 0.22, stick: true, lx: 0.05 },
};

function folkGeos(stage, sex) {
  const fem = sex === 'f';
  return cached(`folk|${stage}|${sex}`, () => {
    const f = FOLK[stage];
    const torso = (() => {
      const b = new B();
      b.group({ r: [f.tilt, 0, 0] }, () => {
        b.cyl(f.rb, f.rt, f.th, 7, [0, 0, 0], C.tunic, { open: true, sh: [0.93, 1.04] });
        const hb = f.th * 0.3;
        const rr = f.rb + (f.rt - f.rb) * 0.3 + 0.008;
        b.cyl(rr, rr * 0.99, 0.04, 7, [0, hb, 0], C.belt, { open: true });
        // Note: women wear a longer tunic that flares to the knee.
        if (fem) b.cyl(f.rb * 1.55, f.rb * 1.04, f.th * 0.55, 6, [0, -f.th * 0.4, 0], C.tunic, { open: true, sh: [0.9, 1.02] });
      });
      return b.build();
    })();
    const head = (() => {
      const b = new B();
      const R = f.hr;
      const cy = R * 0.9 + 0.025;
      b.cyl(0.045, 0.04, 0.065, 5, [0, -0.025, 0], C.skin, { open: true });
      b.sph(R, [0, cy, 0], C.skin, { ws: 6, hs: 4 });
      b.add(pSphere(6, 3, PI * 0.56), C.hair, { p: [0, cy + 0.02 * R, -0.1 * R], r: [-0.5, 0, 0], s: R * 1.08, v: 0.05 });
      if (fem && stage === 'elder') b.oct(R * 0.42, [0, cy + R * 0.82, -R * 0.55], C.hair);
      else if (fem) b.box([R * 1.45, R * 1.5, R * 0.45], [0, cy - R * 0.55, -R * 0.8], C.hair);
      for (const sx of [-1, 1]) b.oct(R * 0.12, [sx * R * 0.36, cy - R * 0.05, R * 0.93 * 0.97], 0x3a2a28);
      return b.build();
    })();
    const arm = (stick) => {
      const b = new B();
      const { arm: L, ar } = f;
      b.cyl(ar * 1.1, ar * 1.25, L * 0.45, 5, [0, -L * 0.45, 0], C.tunic, { open: true });
      b.cyl(ar * 0.85, ar * 0.95, L * 0.45, 5, [0, -L * 0.9, 0], C.skin, { open: true });
      b.oct(ar * 1.05, [0, -L * 0.98, 0], C.skin);
      b.oct(ar * 1.35, [0, 0, 0], C.tunic);
      if (stick) {
        b.rod([0, -0.08, 0.035], [0, -0.465, 0.035], 0.013, C.woodD);
        }
      return b.build();
    };
    const leg = (() => {
      const b = new B();
      b.cyl(f.lr * 0.95, f.lr * 1.05, f.hip - 0.05, 5, [0, -(f.hip - 0.05), 0], C.trouser, { open: true });
      b.box([f.lr * 2.1, 0.05, f.lr * 3.2], [0, -f.hip, f.lr * 0.5], C.boot);
      return b.build();
    })();
    return { torso, head, arm: arm(false), armStick: f.stick ? arm(true) : null, leg };
  });
}

export function makeFolk(stage = 'adult', sex = 'm') {
  const f = FOLK[stage] || FOLK.adult;
  const G = folkGeos(FOLK[stage] ? stage : 'adult', sex);
  const group = new Group();
  const body = new Group();
  body.position.set(0, f.hip, 0);
  group.add(body);
  const torso = mesh(G.torso);
  body.add(torso);
  const head = new Group();
  head.position.set(0, f.th * Math.cos(f.tilt), f.th * Math.sin(f.tilt));
  head.add(mesh(G.head));
  body.add(head);
  const sy = (f.th - 0.035) * Math.cos(f.tilt);
  const sz = (f.th - 0.035) * Math.sin(f.tilt);
  const armL = new Group();
  const armR = new Group();
  // Note: facing +Z, the character's right side is world -X.
  armL.position.set(f.sx, sy, sz);
  armR.position.set(-f.sx, sy, sz);
  armL.add(mesh(G.arm));
  armR.add(mesh(G.armStick || G.arm));
  body.add(armL, armR);
  const legL = new Group();
  const legR = new Group();
  legL.position.set(f.lx, f.hip, 0);
  legR.position.set(-f.lx, f.hip, 0);
  legL.add(mesh(G.leg));
  legR.add(mesh(G.leg));
  group.add(legL, legR);
  group.userData.rig = { body, head, armL, armR, legL, legR, hand: -f.arm * 0.98 };
  group.userData.stage = stage;
  return group;
}

// Note: held tools; built along +Y from the grip, mounted so the head points away from the hand.
const PROP_BUILD = {
  axe(b) {
    b.rod([0, -0.08, 0], [0, 0.46, 0], 0.014, C.woodD);
    b.box([0.04, 0.15, 0.16], [0, 0.3, -0.02], C.metal, { sh: [0.85, 1.1] });
  },
  pickaxe(b) {
    b.rod([0, -0.08, 0], [0, 0.5, 0], 0.014, C.woodD);
    b.rod([0, 0.48, -0.19], [0, 0.48, 0.19], 0.016, C.metalD);
  },
  hoe(b) {
    b.rod([0, -0.08, 0], [0, 0.55, 0], 0.013, C.woodD);
    b.box([0.03, 0.12, 0.13], [0, 0.46, 0.0], C.metalD, { sh: [0.85, 1.1] });
  },
  sickle(b) {
    b.rod([0, -0.05, 0], [0, 0.2, 0], 0.014, C.woodD);
    b.rod([0, 0.2, 0], [0, 0.3, 0.1], 0.012, C.metal);
    b.rod([0, 0.3, 0.1], [0, 0.28, 0.2], 0.01, C.metal);
  },
  // Note: the rod is mounted unrotated, pointing forward and up from the fist when the arm is raised.
  rod(b) {
    b.rod([0, 0.06, -0.14], [0, -0.33, 1.05], 0.016, C.woodDD);
    b.rod([0, -0.02, 0.1], [0, -0.04, 0.2], 0.026, C.wood);
  },
  hammer(b) {
    b.rod([0, -0.08, 0], [0, 0.34, 0], 0.014, C.woodD);
    b.box([0.07, 0.07, 0.14], [0, 0.31, -0.07], C.metalD, { sh: [0.85, 1.1] });
  },
  chisel(b) {
    b.rod([0, -0.06, 0], [0, 0.22, 0], 0.016, C.woodD);
    b.cone(0.016, 0.1, 4, [0, 0.22, 0], C.metal);
  },
  brush(b) {
    b.rod([0, -0.06, 0], [0, 0.3, 0], 0.01, C.woodD);
    b.cone(0.03, 0.1, 5, [0, 0.28, 0], 0xd9577b);
  },
  shuttle(b) {
    b.rod([0, -0.04, 0], [0, 0.1, 0], 0.012, C.woodD);
    b.box([0.025, 0.28, 0.07], [0, 0.1, -0.035], C.woodL);
    b.box([0.03, 0.2, 0.025], [0, 0.14, 0.0], 0x6a96c7);
  },
  paddle(b) {
    b.rod([0, -0.06, 0], [0, 0.3, 0], 0.014, C.woodD);
    b.box([0.02, 0.2, 0.16], [0, 0.28, -0.08], C.woodL);
  },
  mallet(b) {
    b.rod([0, -0.06, 0], [0, 0.28, 0], 0.014, C.woodD);
    b.cyl(0.05, 0.05, 0.12, 6, [0, 0.28, 0], C.stoneD);
  },
  basket(b) {
    b.cyl(0.1, 0.075, 0.1, 7, [0, 0.0, 0], 0xc99a52, { open: true });
    b.cyl(0.1, 0.1, 0.015, 7, [0, 0.1, 0], 0xa97a3c);
    b.rod([-0.09, 0.1, 0], [0.09, 0.1, 0], 0.012, 0xa97a3c);
    for (let k = 0; k < 3; k++) b.ico(0.045, [(k - 1) * 0.05, 0.1, 0.0], 0xf4ecd8, { s: [0.8, 1, 0.8] });
  },
  shears(b) {
    b.rod([0, -0.04, 0], [0, 0.16, 0], 0.014, C.woodD);
    b.box([0.012, 0.16, 0.012], [0.02, 0.16, 0], C.metal, { r: [0, 0, -0.12] });
    b.box([0.012, 0.16, 0.012], [-0.02, 0.16, 0], C.metal, { r: [0, 0, 0.12] });
  },
  // Note: the can hangs below the grip; the spout points along +z and rises toward its tip.
  can(b) {
    b.cyl(0.07, 0.065, 0.13, 8, [0, -0.2, 0], 0x6f9a8a);
    b.rod([0, -0.1, -0.07], [0, -0.1, -0.02], 0.012, 0x6f9a8a);
    b.rod([0, -0.06, -0.075], [0, -0.2, -0.075], 0.012, 0x56796c);
    b.rod([0, -0.16, 0.05], [0, -0.07, 0.2], 0.014, 0x56796c);
    b.cone(0.03, 0.03, 6, [0, -0.07, 0.2], 0x56796c, { r: [Math.PI / 2, 0, 0] });
  },
  // Note: a folded rag for wiping walls and sills.
  cloth(b) {
    b.box([0.03, 0.1, 0.12], [0, -0.1, 0.0], 0xe8e0c8);
    b.box([0.032, 0.05, 0.12], [0, -0.1, 0.0], 0x8fb0c8);
  },
  torch(b) {
    b.rod([0, -0.08, 0], [0, 0.42, 0], 0.016, C.woodDD);
    b.cone(0.03, 0.06, 5, [0, 0.4, 0], C.dark);
  },
};
export const PROP_KINDS = Object.keys(PROP_BUILD);

// Note: artists wear a red beret; sits on the head group.
export function makeBeret() {
  const geo = cached('beret', () => {
    const b = new B();
    b.cyl(0.122, 0.118, 0.025, 8, [0.012, 0.185, -0.012], 0xb8405c);
    b.dome(0.13, 0.07, 8, [0.012, 0.205, -0.012], 0xc2506a, { rings: 2 });
    b.cyl(0.012, 0.01, 0.03, 4, [0.012, 0.272, -0.012], 0x7f2b40);
    return b.build();
  });
  return mesh(geo, MATS.vertex, false);
}

export function makeProp(kind) {
  const g = new Group();
  const geo = cached(`prop|${kind}`, () => {
    const b = new B();
    PROP_BUILD[kind](b);
    return b.build();
  });
  const m = mesh(geo, MATS.vertex, false);
  g.add(m);
  if (kind === 'torch') {
    const fl = cached('prop|flame', () => {
      const b = new B();
      b.cone(0.034, 0.12, 5, [0, 0.46, 0], 0xffb347);
      return b.build();
    });
    g.add(mesh(fl, MATS.glow, false));
  }
  if (kind === 'rod') {
    // Note: line and bobber hang from the tip and are animated by the view.
    const tackle = new Group();
    const line = cached('prop|rodline', () => { const b = new B(); b.rod([0, -0.33, 1.05], [0, -1.19, 0.44], 0.004, C.cream); return b.build(); });
    tackle.add(mesh(line, MATS.vertex, false));
    const bob = cached('prop|bobber', () => { const b = new B(); b.sph(0.035, [0, 0, 0], 0xd94b3a, { ws: 6, hs: 4 }); b.sph(0.03, [0, 0.025, 0], 0xf4efe2, { ws: 6, hs: 3 }); return b.build(); });
    const bobM = mesh(bob, MATS.vertex, false);
    bobM.position.set(0, -1.19, 0.44);
    tackle.add(bobM);
    g.add(tackle);
    const outer = new Group();
    outer.add(g);
    outer.userData.tackle = tackle; outer.userData.bob = bobM;
    return outer;
  }
  g.rotation.x = PI + 0.45;
  const outer = new Group();
  outer.add(g);
  return outer;
}

// Note: animals; origin on the ground, facing +z, each returns a Group with userData.rig.
const DOG_COATS = [[0xc9955c, 0xf3e3c3], [0x5a4636, 0xe9d9bc], [0xe9dcc3, 0xb98a55], [0x8a8f93, 0xeeeeea]];

export function makeDog(variant = 0) {
  const coat = DOG_COATS[Math.abs(variant) % DOG_COATS.length];
  const geo = (key, fn) => cached(`dog|${variant % DOG_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  const body = new Group();
  body.position.set(0, 0.22, 0);
  g.add(body);
  body.add(mesh(geo('torso', (b) => {
    b.box([0.17, 0.16, 0.36], [0, 0.07, 0], coat[0], { sh: [0.9, 1.05] });
    b.box([0.175, 0.08, 0.14], [0, 0.03, 0.07], coat[1], { sh: [0.95, 1] });
  })));
  const head = new Group();
  head.position.set(0, 0.17, 0.2);
  head.add(mesh(geo('head', (b) => {
    b.box([0.13, 0.12, 0.13], [0, 0.04, 0.03], coat[0]);
    b.box([0.07, 0.06, 0.09], [0, 0.0, 0.13], coat[1]);
    b.box([0.05, 0.035, 0.03], [0, 0.03, 0.18], 0x2c2423);
    for (const sx of [-1, 1]) {
      b.box([0.04, 0.08, 0.05], [sx * 0.07, 0.1, 0.0], coat[0] === 0xe9dcc3 ? 0xb98a55 : 0x6f4f38, { r: [0.2, 0, sx * 0.25] });
      b.oct(0.012, [sx * 0.035, 0.07, 0.093], 0x2c2423);
    }
  })));
  body.add(head);
  const tail = new Group();
  tail.position.set(0, 0.1, -0.18);
  tail.add(mesh(geo('tail', (b) => { b.rod([0, 0, 0], [0, 0.1, -0.1], 0.022, coat[1], { seg: 4 }); })));
  body.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, 0.13], [1, 0.13], [-1, -0.12], [1, -0.12]]) {
    const l = new Group();
    l.position.set(sx * 0.065, 0.0, sz);
    l.add(mesh(geo('leg', (b) => {
      b.cyl(0.026, 0.022, 0.2, 5, [0, -0.2, 0], coat[0], { open: true });
      b.box([0.055, 0.03, 0.075], [0, -0.215, 0.012], coat[1]);
    })));
    body.add(l);
    legs.push(l);
  }
  g.userData.rig = { body, head, tail, legs, base: 0.22 };
  return g;
}

const BIRD_COATS = [[0x8a6a4e, 0xe9a07a], [0x6f9fc9, 0xf3efe2], [0xf2c14e, 0xf8e7a6], [0x5a5a63, 0xdcdce0]];

export function makeBird(variant = 0) {
  const coat = BIRD_COATS[Math.abs(variant) % BIRD_COATS.length];
  const geo = (key, fn) => cached(`bird|${variant % BIRD_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  const body = new Group();
  body.position.set(0, 0.08, 0);
  g.add(body);
  body.add(mesh(geo('body', (b) => {
    b.sph(0.06, [0, 0, 0], coat[0], { s: [0.85, 0.8, 1.25], ws: 6, hs: 4 });
    b.sph(0.045, [0, -0.012, 0.025], coat[1], { s: [0.85, 0.8, 1.1], ws: 6, hs: 4 });
    b.box([0.04, 0.012, 0.09], [0, 0.0, -0.1], coat[0], { r: [0.2, 0, 0] });
    b.sph(0.038, [0, 0.045, 0.06], coat[0], { ws: 6, hs: 4 });
    b.cone(0.012, 0.04, 4, [0, 0.043, 0.115], 0xf0a840, { r: [PI / 2, 0, 0] });
    for (const sx of [-1, 1]) b.oct(0.006, [sx * 0.02, 0.055, 0.092], 0x20181a);
  }), MATS.vertex, false));
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new Group();
    w.position.set(sx * 0.04, 0.02, 0.01);
    w.add(mesh(geo('wing' + sx, (b) => {
      b.box([0.15, 0.008, 0.075], [sx * 0.075, 0, -0.01], coat[0], { sh: [0.95, 1.05] });
      b.box([0.06, 0.008, 0.06], [sx * 0.15, 0, -0.025], coat[0], { sh: [0.85, 0.9] });
    }), MATS.vertex, false));
    body.add(w);
    wings.push(w);
  }
  const legs = new Group();
  legs.add(mesh(geo('legs', (b) => { for (const sx of [-1, 1]) b.rod([sx * 0.02, -0.03, 0.01], [sx * 0.02, -0.08, 0.015], 0.005, 0xc9a07a, { seg: 3 }); }), MATS.vertex, false));
  body.add(legs);
  g.userData.rig = { body, wings, legs, base: 0.08 };
  return g;
}

const BUTTERFLY_COATS = [[0xf2a03f, 0x3d302c], [0x8fb7e8, 0xf5f0e0], [0xe98ab0, 0xf8e7ef], [0xf6e27a, 0x6f4f38]];

export function makeButterfly(variant = 0) {
  const coat = BUTTERFLY_COATS[Math.abs(variant) % BUTTERFLY_COATS.length];
  const geo = (key, fn) => cached(`bfly|${variant % BUTTERFLY_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  g.add(mesh(geo('body', (b) => { b.rod([0, 0, -0.03], [0, 0, 0.04], 0.008, 0x3d302c, { seg: 3 }); }), MATS.vertex, false));
  const wings = [];
  for (const sx of [-1, 1]) {
    const w = new Group();
    w.add(mesh(geo('wing' + sx, (b) => {
      b.box([0.06, 0.003, 0.05], [sx * 0.032, 0, 0.012], coat[0], { v: 0.05 });
      b.box([0.045, 0.003, 0.04], [sx * 0.026, 0, -0.03], coat[1], { v: 0.05 });
    }), MATS.vertexDouble, false));
    g.add(w);
    wings.push(w);
  }
  g.userData.rig = { wings };
  return g;
}

const HEN_COATS = [[0xf2e6d0, 0xd9555a], [0xb5693f, 0xd9555a], [0x4d4540, 0xd9555a], [0xe8c88a, 0xd9555a]];

export function makeHen(variant = 0) {
  const coat = HEN_COATS[Math.abs(variant) % HEN_COATS.length];
  const geo = (key, fn) => cached(`hen|${variant % HEN_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  const body = new Group();
  body.position.set(0, 0.1, 0);
  g.add(body);
  body.add(mesh(geo('body', (b) => {
    b.sph(0.085, [0, 0.03, 0], coat[0], { s: [0.85, 0.9, 1.15], ws: 6, hs: 4 });
    b.box([0.07, 0.03, 0.09], [0, 0.0, 0.0], mix(coat[0], 0xffffff, 0.25), { sh: [0.95, 1] });
    for (const sx of [-1, 1]) b.box([0.02, 0.07, 0.12], [sx * 0.07, 0.04, -0.01], mix(coat[0], 0x6f4f38, 0.18), { r: [0.15, 0, sx * 0.1] });
  }), MATS.vertex, false));
  const head = new Group();
  head.position.set(0, 0.1, 0.09);
  head.add(mesh(geo('head', (b) => {
    b.sph(0.04, [0, 0.03, 0.01], coat[0], { ws: 6, hs: 4 });
    b.cone(0.014, 0.04, 4, [0, 0.03, 0.06], 0xf0a840, { r: [PI / 2, 0, 0] });
    b.box([0.012, 0.035, 0.05], [0, 0.07, 0.0], coat[1]);
    b.box([0.014, 0.03, 0.014], [0, 0.0, 0.05], coat[1]);
    for (const sx of [-1, 1]) b.oct(0.006, [sx * 0.03, 0.04, 0.03], 0x20181a);
  }), MATS.vertex, false));
  body.add(head);
  const tail = new Group();
  tail.position.set(0, 0.07, -0.09);
  tail.add(mesh(geo('tail', (b) => { b.box([0.02, 0.1, 0.07], [0, 0.04, -0.02], mix(coat[0], 0x6f4f38, 0.25), { r: [-0.5, 0, 0] }); }), MATS.vertex, false));
  body.add(tail);
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = new Group();
    l.position.set(sx * 0.03, 0.0, 0.0);
    l.add(mesh(geo('leg', (b) => { b.rod([0, 0, 0], [0, -0.1, 0.01], 0.008, 0xe0a840, { seg: 3 }); b.box([0.035, 0.008, 0.045], [0, -0.1, 0.02], 0xe0a840); }), MATS.vertex, false));
    body.add(l);
    legs.push(l);
  }
  g.userData.rig = { body, head, tail, legs, base: 0.1 };
  return g;
}

const FISH_COATS = [[0x9db8c8, 0xd8e4ea], [0xe08a3c, 0xf4c27a], [0x6f9a78, 0xc6d8b0], [0x8a86b8, 0xd9d6ee]];

// Note: a small fish, nose toward +z; the tail is its own group so the view can wiggle it.
export function makeFish(variant = 0) {
  const coat = FISH_COATS[Math.abs(variant) % FISH_COATS.length];
  const geo = (key, fn) => cached(`fish|${variant % FISH_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  const body = new Group();
  g.add(body);
  body.add(mesh(geo('body', (b) => {
    b.sph(0.07, [0, 0, 0], coat[0], { s: [0.55, 0.8, 1.7], ws: 6, hs: 4 });
    b.sph(0.05, [0, -0.02, 0.01], coat[1], { s: [0.5, 0.6, 1.5], ws: 5, hs: 3 });
    b.box([0.012, 0.05, 0.09], [0, 0.07, -0.01], mix(coat[0], 0x203040, 0.3), { r: [-0.2, 0, 0] });
    for (const sx of [-1, 1]) b.oct(0.006, [sx * 0.032, 0.015, 0.09], 0x14181c);
  }), MATS.vertex, false));
  const tail = new Group();
  tail.position.set(0, 0, -0.11);
  tail.add(mesh(geo('tail', (b) => { b.box([0.012, 0.09, 0.07], [0, 0, -0.035], mix(coat[0], 0x203040, 0.2), { r: [0.0, 0, 0], sh: [1, 0.4] }); }), MATS.vertex, false));
  body.add(tail);
  g.userData.rig = { body, tail, base: 0 };
  return g;
}

// Note: fishers wear a yellow wide-brim hat while angling; sits on the head group like the straw hat.
export function makeFisherHat() {
  const geo = cached('fisherhat', () => {
    const b = new B();
    b.cyl(0.18, 0.18, 0.012, 9, [0, 0.168, -0.012], 0xf0c431);
    b.cyl(0.095, 0.11, 0.08, 8, [0, 0.176, -0.012], 0xe8b820);
    b.cyl(0.112, 0.112, 0.014, 8, [0, 0.188, -0.012], 0x3d5f8a);
    return b.build();
  });
  return mesh(geo, MATS.vertex, false);
}

const SHEEP_COATS = [[0xf4f0e6, 0x3d302c], [0xf4f0e6, 0xb89a7a], [0xe3d9c6, 0x3d302c], [0xcfc7b8, 0x6f4f38]];

export function makeSheep(variant = 0) {
  const coat = SHEEP_COATS[Math.abs(variant) % SHEEP_COATS.length];
  const geo = (key, fn) => cached(`sheep|${variant % SHEEP_COATS.length}|${key}`, () => { const b = new B(); fn(b); return b.build(); });
  const g = new Group();
  const body = new Group();
  body.position.set(0, 0.22, 0);
  g.add(body);
  body.add(mesh(geo('torso', (b) => { b.box([0.15, 0.13, 0.3], [0, 0.05, 0], 0xe9c7b0, { sh: [0.92, 1.05] }); })));
  const fleece = mesh(geo('fleece', (b) => {
    b.ico(0.15, [0, 0.12, 0], coat[0], { s: [1, 0.85, 1.35], j: 0.03 });
    b.ico(0.1, [0, 0.2, 0.0], coat[0], { s: [1.1, 0.8, 1.2], j: 0.03 });
    b.ico(0.09, [0.07, 0.09, 0.2], coat[0], { j: 0.02 });
    b.ico(0.09, [-0.07, 0.09, -0.2], coat[0], { j: 0.02 });
    b.ico(0.075, [0, 0.16, 0.2], coat[0], { j: 0.02 });
  }));
  body.add(fleece);
  const head = new Group();
  head.position.set(0, 0.14, 0.17);
  head.add(mesh(geo('head', (b) => {
    b.box([0.1, 0.11, 0.13], [0, 0.0, 0.05], coat[1], { sh: [0.92, 1.05] });
    b.box([0.07, 0.05, 0.05], [0, -0.03, 0.13], mix(coat[1], 0xf0d6c8, 0.4));
    for (const sx of [-1, 1]) {
      b.box([0.07, 0.025, 0.045], [sx * 0.085, 0.02, 0.03], coat[1], { r: [0, 0, sx * -0.25] });
      b.oct(0.011, [sx * 0.045, 0.03, 0.115], 0x20181a);
    }
    b.ico(0.055, [0, 0.07, 0.01], coat[0], { s: [1.1, 0.7, 1], j: 0.02 });
  })));
  body.add(head);
  const tail = new Group();
  tail.position.set(0, 0.1, -0.16);
  tail.add(mesh(geo('tail', (b) => { b.ico(0.04, [0, 0, -0.01], coat[0], {}); })));
  body.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, 0.11], [1, 0.11], [-1, -0.11], [1, -0.11]]) {
    const l = new Group();
    l.position.set(sx * 0.055, 0.0, sz);
    l.add(mesh(geo('leg', (b) => {
      b.cyl(0.02, 0.017, 0.2, 5, [0, -0.2, 0], coat[1], { open: true });
    })));
    body.add(l);
    legs.push(l);
  }
  g.userData.rig = { body, head, tail, legs, fleece, base: 0.22 };
  return g;
}

// Note: farmers wear a straw hat while tending; sits on the head group like the beret.
export function makeStrawHat() {
  const geo = cached('strawhat', () => {
    const b = new B();
    b.cyl(0.19, 0.19, 0.012, 9, [0, 0.172, -0.012], 0xe8cf82);
    b.cyl(0.1, 0.115, 0.075, 8, [0, 0.18, -0.012], 0xe0c470);
    b.cyl(0.117, 0.117, 0.016, 8, [0, 0.195, -0.012], 0xc4553f);
    return b.build();
  });
  return mesh(geo, MATS.vertex, false);
}

// Note: art pieces; local origin at the cell centre on the ground, front faces +z.
const ART_PAL = {
  weavers: { a: 0xd9708f, b: 0x7fb7b0, c: 0xf5e9d3, d: 0xe6c67e },
  potters: { a: 0xd4694c, b: 0xe3aa7d, c: 0xf5e9d3, d: 0x6a96c7 },
  carvers: { a: 0xc4c7c4, b: 0xa4a8a9, c: 0xdcdeda, d: 0x95c67b },
  sailors: { a: 0x6a96c7, b: 0xf5e9d3, c: 0xb98a55, d: 0xd4694c },
};
const ART_ARCH_FALLBACK = 'weavers';

function artDoodle(b, v, P) {
  const chalk = [0xf8f4ea, 0xf6e6a8, 0xf3c6d3, 0xbfe0f2][v];
  const flat = (x, z, w, d, col) => b.box([w, 0.012, d], [x, 0, z], col, { v: 0.01 });
  if (v === 0) { for (let k = 0; k < 6; k++) flat((k % 2) * 0.2 - 0.1, -0.38 + k * 0.15, 0.18, 0.12, chalk); }
  else if (v === 1) { b.disc(0.22, [0, 0.008, 0], chalk, { r: [-PI / 2, 0, 0], seg: 10 }); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.rod([Math.cos(a) * 0.3, 0.01, Math.sin(a) * 0.3], [Math.cos(a) * 0.42, 0.01, Math.sin(a) * 0.42], 0.012, chalk); } }
  else if (v === 2) { flat(0, 0, 0.5, 0.025, chalk); flat(0, 0.12, 0.35, 0.025, chalk); b.rod([-0.2, 0.01, -0.1], [0, 0.01, -0.3], 0.014, P.a); b.rod([0, 0.01, -0.3], [0.2, 0.01, -0.1], 0.014, P.a); }
  else { for (let k = 0; k < 3; k++) { b.disc(0.1 + k * 0.08, [0, 0.008 + k * 0.001, 0], k % 2 ? chalk : P.b, { r: [-PI / 2, 0, 0], seg: 10 }); } }
}

function artSmall(b, arch, P, v) {
  if (arch === 'weavers') {
    b.rod([-0.2, 0, 0], [-0.2, 0.62, 0], 0.025, C.woodD); b.rod([0.2, 0, 0], [0.2, 0.62, 0], 0.025, C.woodD);
    b.rod([-0.2, 0.6, 0], [0.2, 0.6, 0], 0.022, C.wood); b.rod([-0.2, 0.12, 0], [0.2, 0.12, 0], 0.022, C.wood);
    b.box([0.34, 0.4, 0.02], [0, 0.16, 0], [P.a, P.b, P.d][v % 3], { sh: [0.9, 1.05] });
  } else if (arch === 'potters') {
    b.cyl(0.2, 0.2, 0.08, 7, [0, 0, 0], C.stoneD);
    b.sph(0.17, [0, 0.28, 0], [P.a, P.b, P.d][v % 3], { s: [1, 1.15, 1] });
    b.cyl(0.08, 0.1, 0.08, 7, [0, 0.4, 0], [P.a, P.b, P.d][v % 3]);
  } else if (arch === 'carvers') {
    b.box([0.4, 0.14, 0.34], [0, 0, 0], C.stoneD, { j: 0.01 });
    b.box([0.26, 0.34, 0.22], [0, 0.14, 0], P.a, { j: 0.015, sh: [0.9, 1.1] });
    b.box([0.14, 0.18, 0.14], [0, 0.48, 0], P.c, { j: 0.015, r: [0, 0.4, 0] });
  } else {
    b.rod([0, 0, 0], [0, 0.7, 0], 0.03, C.woodD);
    b.rod([0, 0.6, 0], [0.26, 0.6, 0], 0.02, C.wood);
    b.sph(0.12, [0, 0.8, 0], P.d, { s: [1, 1.2, 1] });
    b.torus(0.1, 0.02, [0.26, 0.5, 0], C.rope, { r: [0, PI / 2, 0] });
  }
}

function artStatue(b, arch, P) {
  b.box([0.5, 0.2, 0.5], [0, 0, 0], C.stoneD, { j: 0.01, sh: [0.85, 1] });
  b.box([0.38, 0.1, 0.38], [0, 0.2, 0], C.stone, { j: 0.01 });
  const col = arch === 'carvers' ? P.c : arch === 'potters' ? P.a : arch === 'weavers' ? P.a : C.woodL;
  b.cone(0.17, 0.62, 7, [0, 0.3, 0], col, { sh: [0.85, 1.05] });
  b.sph(0.1, [0, 0.98, 0], arch === 'carvers' ? P.c : C.skin);
  if (arch === 'weavers') b.cone(0.13, 0.22, 6, [0, 1.04, 0], P.b);
  else if (arch === 'sailors') { b.rod([0.17, 0.5, 0.0], [0.32, 0.95, 0.0], 0.02, C.woodD); b.box([0.2, 0.14, 0.015], [0.3, 0.82, 0], P.a); }
  else if (arch === 'potters') b.cyl(0.12, 0.08, 0.1, 7, [0, 1.05, 0], P.b);
  else b.rod([-0.18, 0.5, 0], [-0.3, 0.88, 0], 0.03, P.c);
}

function artMural(b, arch, P, v) {
  for (const sx of [-1, 1]) b.cyl(0.05, 0.05, 1.0, 5, [sx * 0.52, 0, 0], C.woodD);
  b.box([1.08, 0.74, 0.05], [0, 0.18, -0.02], C.plaster, { sh: [0.95, 1.02] });
  const cols = [P.a, P.b, P.d, P.c];
  for (let k = 0; k < 5; k++) {
    const w = 0.12 + ((k * 7 + v * 3) % 4) * 0.045; const h = 0.14 + ((k * 5 + v) % 4) * 0.08;
    b.box([w, h, 0.02], [-0.4 + k * 0.2, 0.26, 0.03], cols[(k + v) % 4], { v: 0.06 });
  }
  b.sph(0.08, [0.3 - v * 0.1, 0.7, 0.035], 0xf6e08a, { s: [1, 1, 0.2] });
  b.box([1.16, 0.05, 0.1], [0, 0.94, -0.02], C.woodD);
}

function artArch(b, arch, P, v) {
  for (const sx of [-1, 1]) {
    b.cyl(0.07, 0.07, 1.05, 6, [sx * 0.42, 0, 0], arch === 'carvers' ? C.stoneL : C.woodL);
    b.sph(0.09, [sx * 0.42, 1.08, 0], P.d);
  }
  for (let k = 0; k <= 8; k++) {
    const a = (k / 8) * PI;
    b.sph(0.065, [Math.cos(a) * 0.42, 1.05 + Math.sin(a) * 0.3, 0], k % 2 ? P.a : P.b);
  }
  for (let k = 0; k < 4; k++) b.rod([-0.3 + k * 0.2, 1.3 - Math.abs(k - 1.5) * 0.06, 0], [-0.3 + k * 0.2, 0.95 + (k % 2) * 0.1, 0], 0.01, [P.a, P.d][k % 2]);
  void v;
}

function artFountain(b, arch, P) {
  b.cyl(0.58, 0.54, 0.24, 10, [0, 0, 0], C.stoneL, { sh: [0.85, 1.05] });
  b.cyl(0.46, 0.46, 0.02, 10, [0, 0.235, 0], C.stoneD);
  b.cyl(0.08, 0.06, 0.55, 6, [0, 0.2, 0], arch === 'potters' ? P.a : C.stone);
  b.cyl(0.2, 0.12, 0.08, 8, [0, 0.7, 0], arch === 'carvers' ? C.stoneL : P.b);
  b.sph(0.07, [0, 0.8, 0], P.d);
}

function artMonument(b, arch, P) {
  b.cyl(0.62, 0.55, 0.16, 8, [0, 0, 0], C.stoneD, { sh: [0.85, 1] });
  b.cyl(0.46, 0.4, 0.14, 8, [0, 0.16, 0], C.stone);
  b.cyl(0.2, 0.12, 1.5, 4, [0, 0.3, 0], arch === 'potters' ? P.a : C.stoneL, { r: [0, PI / 4, 0], sh: [0.88, 1.08] });
  b.cone(0.13, 0.28, 4, [0, 1.8, 0], P.d, { r: [0, PI / 4, 0] });
  for (let k = 0; k < 3; k++) b.box([0.34, 0.05, 0.015], [0, 0.55 + k * 0.28, 0.135], [P.a, P.b, P.c][k], { v: 0.02 });
  if (arch === 'sailors') { b.rod([0, 2.0, 0], [0, 2.4, 0], 0.014, C.woodD); b.box([0.3, 0.16, 0.01], [0.16, 2.2, 0], P.a); }
  if (arch === 'weavers') for (const sx of [-1, 1]) b.rod([sx * 0.06, 1.7, 0], [sx * 0.3, 1.0, 0.0], 0.012, P.a);
}

function artGarden(b, arch, P, v) {
  b.cyl(0.48, 0.48, 0.07, 9, [0, 0, 0], 0x7b5a3c);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU; const r = 0.34;
    b.sph(0.1, [Math.cos(a) * r, 0.1, Math.sin(a) * r], k % 2 ? C.leaf : C.leafL, { s: [1, 0.8, 1] });
  }
  const cols = [P.a, P.d, P.c, P.b];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4 + v; const r = 0.05 + (k % 3) * 0.1;
    b.rod([Math.cos(a) * r, 0.07, Math.sin(a) * r], [Math.cos(a) * r, 0.24 + (k % 2) * 0.08, Math.sin(a) * r], 0.012, C.mossD);
    b.sph(0.045, [Math.cos(a) * r, 0.27 + (k % 2) * 0.08, Math.sin(a) * r], cols[k % 4]);
  }
}

const ART_BUILD = { doodle: artDoodle, small: artSmall, statue: artStatue, mural: artMural, arch: artArch, fountain: artFountain, monument: artMonument, garden: artGarden };

export function makeArt(bd) {
  const arch = ART_PAL[bd.arch] ? bd.arch : ART_ARCH_FALLBACK;
  const v = ((bd.x * 7 + bd.y * 13) >>> 0) % 4;
  const P = ART_PAL[arch];
  const kind = ART_BUILD[bd.kind] ? bd.kind : 'small';
  const geo = cached(`art|${kind}|${arch}|${v}`, () => {
    const b = new B();
    ART_BUILD[kind](b, kind === 'doodle' ? v : arch, P, v);
    return b.build();
  });
  const g = new Group();
  g.add(mesh(geo, MATS.vertex, kind !== 'doodle'));
  if (kind === 'fountain') {
    const w = cached(`art|water|${arch}`, () => { const b = new B(); b.cyl(0.46, 0.46, 0.03, 10, [0, 0.21, 0], 0x8fd0ee); return b.build(); });
    g.add(mesh(w, MATS.glass, false));
  }
  g.userData = { height: 1 };
  g.name = 'art';
  return g;
}

// Note: festival garland with pole lanterns on rung 4+; poles stand on the ground at the given local points.
export function makeBunting(poles, rung) {
  const g = new Group();
  const geo = cached(`bunting|${rung}|${poles.map((p) => [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)].join(',')).join(';')}`, () => {
    const b = new B();
    const cols = [0xd9708f, 0xf6d66a, 0x7fb7b0, 0x6a96c7, 0xf5e9d3];
    const top = (p) => [p.x, p.y + 1.55, p.z];
    for (const p of poles) b.rod([p.x, p.y, p.z], top(p), 0.025, C.woodD, { seg: 5 });
    for (let k = 0; k + 1 < poles.length; k++) {
      const A = top(poles[k]); const Z = top(poles[k + 1]);
      const n = 9;
      let prev = A;
      for (let s = 1; s <= n; s++) {
        const u = s / n;
        const pt = [A[0] + (Z[0] - A[0]) * u, A[1] + (Z[1] - A[1]) * u - Math.sin(u * PI) * 0.22, A[2] + (Z[2] - A[2]) * u];
        b.rod(prev, pt, 0.006, C.rope, { seg: 3 });
        if (s < n) b.cone(0.05, 0.14, 3, pt, cols[(s + k) % 5], { r: [PI, 0, 0], v: 0.04 });
        prev = pt;
      }
    }
    return b.build();
  });
  g.add(mesh(geo, MATS.vertexDouble, false));
  if (rung >= 4) {
    const lg = cached(`bunting|lanterns|${poles.length}|${poles.map((p) => [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)].join(',')).join(';')}`, () => {
      const b = new B();
      for (const p of poles) b.sph(0.08, [p.x, p.y + 1.62, p.z], 0xffd88a, { s: [1, 1.25, 1] });
      return b.build();
    });
    g.add(mesh(lg, MATS.glow, false));
  }
  return g;
}

// Note: plants.

const gv =(variant) => (((variant | 0) % 4) + 4) % 4;

function flowerPlant(b, v) {
  const sets = [[0xf4a3b8, 0xffe08a], [0xfff1b8, 0xf4b04a], [0xc6a8ec, 0xffe08a], [0xf8f4ea, 0xf2b84a]][v];
  const [petal, center] = sets;
  const stem = 0x7fb86a;
  const head = (x, h, lean, r, n) => {
    b.rod([x, 0, 0.0], [x + lean, h, 0], 0.016, stem, { seg: 3 });
    b.oct(r * 0.55, [x + lean, h, 0], center);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + v;
      b.oct(r, [x + lean + Math.cos(a) * r * 1.1, h, Math.sin(a) * r * 1.1], petal, { s: [1.0, 0.35, 0.6], r: [0, -a, 0] });
    }
  };
  const h1 = [0.24, 0.27, 0.22, 0.26][v];
  head(-0.04, h1, 0.02, 0.05, 5);
  b.oct(0.06, [-0.04, h1 * 0.45, 0.03], 0x6fb062, { s: [1.5, 0.3, 0.8], r: [0, 0.6, 0] });
  head(0.12, h1 * 0.62, -0.02, 0.04, 4);
  b.oct(0.04, [0.12, 0.05, 0.02], 0x6fb062, { s: [1.5, 0.3, 0.8], r: [0, -0.5, 0] });
}

function bushPlant(b, v, ripe) {
  const greens = [0x77b85f, 0x8cc66a, 0x69ad74, 0x9acb6a];
  const berries = [0xe2564a, 0x6a7de0, 0xd96ab0, 0xf0a040];
  const g = greens[v];
  const blobs = [
    [0.27, [0, 0.24, 0], [1.15, 0.9, 1.1]],
    [0.2, [0.2, 0.19, 0.1], [1, 0.9, 1]],
    [0.18, [-0.18, 0.18, -0.08], [1, 0.95, 1]],
  ];
  const rot = v * 0.8;
  blobs.forEach(([r, p, s], i) => {
    const x = p[0] * Math.cos(rot) - p[2] * Math.sin(rot);
    const z = p[0] * Math.sin(rot) + p[2] * Math.cos(rot);
    b.ico(r, [x, p[1], z], i === 1 ? 0x84c66a : g, { s, j: 0.025, sh: [0.85, 1.1] });
  });
  if (ripe) {
    const dirs = [[0.7, 0.5, 0.5], [-0.5, 0.6, 0.6], [0.2, 0.9, -0.4], [0.9, 0.2, -0.3], [-0.8, 0.3, -0.4]];
    dirs.forEach((d, i) => {
      const len = Math.hypot(...d);
      const r = 0.26;
      b.oct(0.04, [(d[0] / len) * r, 0.23 + (d[1] / len) * r * 0.8, (d[2] / len) * r], berries[v], { r: [0, i, 0] });
    });
  }
}

function treePlant(b, v, fruit, ripe) {
  const h = fruit ? [1.75, 1.9, 1.7, 1.95][v] : [1.9, 2.1, 1.75, 2.25][v];
  const greens = fruit
    ? [[0x6fb468, 0x86c874], [0x78bb62, 0x92cc70], [0x68b078, 0x82c48a], [0x7cb862, 0x96cd72]]
    : [[0x7cc06a, 0x95d27a], [0x6fb86c, 0x88cc7c], [0x86bd62, 0xa2d276], [0x62ae78, 0x7cc68c]];
  const [g1, g2] = greens[v];
  const trunk = [0x8a6240, 0x9a7048, 0x7d5c40, 0x8f6a4a][v];
  b.cyl(0.11, 0.06, h * 0.5, 5, [0, 0, 0], trunk, { open: true, sh: [0.9, 1.05] });
  const slim = v === 3 ? 0.82 : 1;
  const blobs = fruit
    ? [[0.46, [0.0, h * 0.5, 0.0], [1, 0.85, 1]], [0.4, [0.12, h * 0.72, 0.06], [1, 0.9, 1]], [0.32, [-0.1, h * 0.9, -0.04], [1, 0.9, 1]]]
    : [[0.5 * slim, [0.04, h * 0.5, 0], [1, 0.85, 1]], [0.42 * slim, [-0.06, h * 0.7, 0.06], [1, 0.95, 1]], [0.33 * slim, [0.03, h * 0.88, -0.03], [1, 1, 1]]];
  blobs.forEach(([r, p, s], i) => b.ico(r, p, i === 1 ? g2 : g1, { s, j: 0.05, sh: [0.82, 1.1] }));
  if (fruit) {
    const dirs = [[0.8, 0.1, 0.6], [-0.7, 0.2, 0.7], [0.1, -0.1, 1], [-0.9, 0, -0.4], [0.6, 0.3, -0.8], [0.0, 0.5, -0.9]];
    const fc = [0xe2564a, 0xf29a3c, 0xf4d44a, 0xc45a9a][v];
    dirs.forEach((d, i) => {
      const len = Math.hypot(...d);
      const r = 0.46;
      const p = [(d[0] / len) * r, h * 0.5 + (d[1] / len) * r * 0.8, (d[2] / len) * r];
      if (ripe) b.oct(0.055, p, fc, { r: [0, i, 0] });
      else if (i < 3) b.oct(0.035, p, 0xfff2f4, { r: [0, i, 0] });
    });
  }
}

function pinePlant(b, v) {
  const cols = [0x4f8f6a, 0x5c9c78, 0x477f78, 0x6aa87c][v];
  b.cyl(0.1, 0.06, 0.5, 5, [0, 0, 0], 0x7d5c40, { open: true });
  for (let i = 0; i < 4; i++) {
    const r = 0.48 - i * 0.09;
    const h = 0.7;
    const y = 0.3 + i * 0.42;
    b.cone(r, h, 7, [0, y, 0], cols, { sh: [0.85, 1.1], r: [0, i * 0.4, 0] });
    if (v === 3) b.cone(r * 0.44, h * 0.44, 7, [0, y + h * 0.58, 0], 0xf4f8fa, { open: true, r: [0, i * 0.4, 0] });
  }
}

function wheatPlant(b, v, ripe) {
  const stalk = ripe ? 0xd9b858 : 0x8cc060;
  const ear = ripe ? 0xe9c85a : 0xa8cf6a;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + v * 0.7;
    const rr = i === 0 ? 0.0 : 0.11 + ((i + v) % 3) * 0.02;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = 0.32 + ((i * 3 + v) % 4) * 0.04;
    const lean = i === 0 ? 0 : 0.045;
    const tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean;
    b.rod([x, 0, z], [tx, h, tz], 0.012, stalk, { seg: 3 });
    b.oct(0.03, [tx, h + 0.02, tz], ear, { s: [1, 3.2, 1] });
  }
}

function reedPlant(b, v, ripe) {
  const cols = [0x8cbf6a, 0x9ccc7a, 0x7db46a, 0xa4cf84];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + v;
    const rr = 0.04 + (i % 3) * 0.045;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const h = 0.55 + ((i * 2 + v) % 4) * 0.08;
    b.rod([x, 0, z], [x + Math.cos(a) * 0.06, h, z + Math.sin(a) * 0.06], 0.014, cols[(i + v) % 4], { seg: 3 });
  }
  for (let k = 0; k < 2; k++) {
    const a = k * 2.4 + v;
    const x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
    const h = 0.62 + k * 0.1;
    b.rod([x, 0, z], [x, h, z], 0.013, 0x7fb06a, { seg: 3 });
    b.cyl(0.03, 0.025, 0.12, 4, [x, h - 0.02, z], ripe ? 0x8a5a38 : 0x9a8a4a);
  }
}

function vinePlant(b, v, ripe) {
  const vc = [0x5f9f58, 0x7ab05a][v & 1];
  const leaf = 0x8fcf70;
  const grape = [0x7a5ab8, 0x9a6ac8, 0x6a8a3a, 0xb04a6a][v];
  if (v === 0 || v === 2) {
    b.rod([0, 0, 0], [0, 0.7, 0], 0.02, C.woodL);
    const N = 9;
    let prev = null;
    for (let k = 0; k < N; k++) {
      const a = k * 1.1 + v;
      const y = 0.04 + (k / (N - 1)) * 0.6;
      const r = 0.1 - (k / N) * 0.04;
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (prev) b.rod(prev, p, 0.028, vc, { seg: 3 });
      prev = p;
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + v + 0.5;
      b.oct(0.045, [Math.cos(a) * 0.13, 0.18 + k * 0.17, Math.sin(a) * 0.13], leaf, { s: [1.5, 0.3, 1], r: [0, -a, 0] });
    }
    if (ripe) for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + v + 1.4;
      b.oct(0.035, [Math.cos(a) * 0.11, 0.14 + k * 0.18, Math.sin(a) * 0.11], grape);
    }
  } else {
    b.rod([-0.17, 0, 0], [-0.05, 0.7, 0], 0.02, C.woodL);
    b.rod([0.17, 0, 0], [0.05, 0.7, 0], 0.02, C.woodL);
    b.rod([-0.05, 0.7, 0], [0.05, 0.7, 0], 0.016, C.woodL);
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const y = 0.05 + k * 0.085;
      const half = 0.17 - (y / 0.7) * 0.12;
      pts.push([(k % 2 ? 1 : -1) * half * 0.9, y, 0.015 * (k % 3)]);
    }
    for (let k = 1; k < pts.length; k++) b.rod(pts[k - 1], pts[k], 0.026, vc, { seg: 3 });
    for (let k = 0; k < 3; k++) {
      const p = pts[1 + k * 2];
      b.oct(0.045, [p[0], p[1] + 0.02, 0.03], leaf, { s: [1.5, 0.3, 1], r: [0, k, 0] });
    }
    if (ripe) for (let k = 0; k < 3; k++) {
      const p = pts[2 + k * 2];
      b.oct(0.035, [p[0], p[1] - 0.04, 0.03], grape);
    }
  }
}

function glowcapPlant(b, v, ripe) {
  const caps = [0x7fe6e0, 0xb59cff, 0xff9ccf, 0xb6f08a];
  let cap = new Color(caps[v]);
  if (ripe) cap = cap.clone().lerp(new Color(0xffffff), 0.28);
  const sp = [[0, 0, 0.24, 0.12], [0.14, 0.06, 0.15, 0.085], [-0.1, -0.1, 0.12, 0.07]];
  sp.forEach(([x, z, h, r], i) => {
    b.cyl(0.03, 0.022, h, 5, [x, 0, z], 0xe8f4f0, { open: true });
    b.dome(r, r * 0.8, 6, [x, h - 0.01, z], cap, { rings: 2, sh: [0.9, 1.1], r: [0, i, 0] });
    if (ripe) b.oct(0.018, [x + r * 0.35, h + r * 0.55, z + r * 0.2], 0xffffff);
  });
}

const PLANT_BUILD = {
  flower: (b, v) => flowerPlant(b, v),
  bush: bushPlant,
  tree: (b, v, r) => treePlant(b, v, false, r),
  pine: (b, v) => pinePlant(b, v),
  fruittree: (b, v, r) => treePlant(b, v, true, r),
  wheat: wheatPlant,
  reed: reedPlant,
  vine: vinePlant,
  glowcap: glowcapPlant,
};

export function plantGeometry(kind, variant = 0, ripe = false) {
  const fn = PLANT_BUILD[kind];
  if (!fn) throw new Error(`plantGeometry: unknown kind ${kind}`);
  const v = gv(variant);
  return cached(`plant|${kind}|${v}|${ripe ? 1 : 0}`, () => {
    const b = new B();
    fn(b, v, !!ripe);
    return b.build();
  });
}

// Note: buildings.

class Ctx {
  constructor(id, lvl, v, d, tier = 0) {
    this.id = id; this.lvl = lvl; this.v = v; this.d = d; this.tier = tier;
    this.key = `bld|${id}|${lvl}|${v}|${d}|${tier}`;
    this.g = new Group();
    this.ud = { height: 0, smoke: null, glow: null, glowColor: null, spin: null, update: null };
  }

  mesh(name, build, mat = MATS.vertex, parent = this.g) {
    const geo = cached(`${this.key}|${name}`, build);
    const m = mesh(geo, mat, mat === MATS.vertex || mat === MATS.vertexDouble);
    m.name = name;
    parent.add(m);
    return m;
  }

  smoke(x, y, z) { this.ud.smoke = new Vector3(x, y, z); }

  glow(x, y, z, col) {
    this.ud.glow = new Vector3(x, y, z);
    this.ud.glowColor = col;
  }
}

function buildStorehouse(c) {
  const roofC = [0xc9705a, 0xe0c27a, 0x8aa8cb, 0x86b49b][c.v];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.85);
    b.box([1.7, 0.04, 1.6], [0, 0.05, 0], C.woodL);
    b.box([1.8, 0.78, 0.1], [0, 0.05, -0.75], C.wood, { sh: [0.9, 1.05] });
    b.box([0.1, 0.78, 1.6], [-0.85, 0.05, 0], C.wood, { sh: [0.9, 1.05] });
    b.box([0.1, 0.78, 1.6], [0.85, 0.05, 0], C.wood, { sh: [0.9, 1.05] });
    for (const s of [-1, 1]) b.box([0.12, 0.85, 0.12], [s * 0.82, 0.05, 0.76], C.woodD);
    b.box([1.76, 0.1, 0.12], [0, 0.8, 0.76], C.woodD);
    gable(b, { hw: 0.95, h: 0.5, d: 1.9, y: 0.86, col: roofC, fillCol: C.wood });
    // Note: interior goods visible through the open front.
    b.box([0.3, 0.28, 0.3], [-0.5, 0.09, -0.4], C.woodL);
    b.box([0.3, 0.28, 0.3], [-0.5, 0.37, -0.45], C.wood, { r: [0, 0.3, 0] });
    b.box([0.3, 0.28, 0.3], [-0.12, 0.09, -0.5], C.wood);
    b.ico(0.17, [0.5, 0.2, -0.45], C.cream, { s: [1, 1.05, 0.9], j: 0.01 });
    b.ico(0.16, [0.28, 0.19, -0.38], 0xe8d8b0, { s: [1, 1, 0.9], j: 0.01 });
    b.cyl(0.19, 0.19, 0.28, 8, [0.55, 0.05, 0.1], C.woodL);
    if (c.d) b.cyl(0.17, 0.17, 0.3, 7, [-0.55, 0.05, 0.35], 0xe6c458);
    else b.box([0.3, 0.26, 0.3], [-0.55, 0.05, 0.4], C.woodD, { r: [0, 0.2, 0] });
    return b.build();
  });
}

function buildHut(c) {
  const { lvl, v } = c;
  const roofC = [0xe3c27a, 0xd98a6a, 0xd9b868, 0x86a8c4][v];
  const ox = lvl >= 2 ? -0.16 : 0;
  const oz = lvl >= 2 ? -0.05 : 0;
  c.mesh('m', () => {
    const b = new B();
    b.group({ p: [ox, 0, oz] }, () => {
      b.cyl(0.62, 0.68, 0.2, 9, [0, -0.15, 0], C.stoneD);
      b.cyl(0.56, 0.52, 0.6, 9, [0, 0.05, 0], C.plaster, { sh: [0.92, 1.04] });
      b.box([0.26, 0.42, 0.04], [0, 0.05, 0.54], C.woodL);
      b.box([0.2, 0.38, 0.06], [0, 0.05, 0.56], C.woodD);
      for (const s of [-1, 1]) {
        const a = s * 0.95;
        b.box([0.14, 0.14, 0.05], [Math.sin(a) * 0.52, 0.3, Math.cos(a) * 0.52], 0xfff0c0, { r: [0, a, 0] });
        b.box([0.2, 0.03, 0.07], [Math.sin(a) * 0.52, 0.27, Math.cos(a) * 0.53], C.woodL, { r: [0, a, 0] });
      }
      b.cone(0.78, 0.66, 9, [0, 0.62, 0], roofC, { sh: [0.88, 1.08] });
      b.ico(0.06, [0, 1.3, 0], C.woodD);
      if (lvl >= 1) {
        b.box([0.7, 0.05, 0.36], [0, 0.0, 0.72], C.woodL);
        for (const s of [-1, 1]) b.box([0.07, 0.55, 0.07], [s * 0.3, 0.05, 0.84], C.woodD);
        b.add(pBox(), roofC, { p: [0, 0.58, 0.74], r: [0.29, 0, 0], s: [0.86, 0.05, 0.44], c: true, sh: [0.9, 1] });
      }
    });
    if (lvl >= 2) {
      b.cyl(0.36, 0.33, 0.46, 8, [0.5, -0.01, -0.38], C.plaster, { sh: [0.92, 1.04] });
      b.cone(0.46, 0.5, 8, [0.5, 0.45, -0.38], roofC, { sh: [0.88, 1.08] });
      b.box([0.12, 0.12, 0.04], [0.45, 0.2, -0.38 + 0.33], 0xfff0c0);
      b.box([0.16, 0.85, 0.16], [0.22, 0.45, -0.35], C.stone);
      b.box([0.22, 0.05, 0.22], [0.22, 1.28, -0.35], C.stoneD);
    }
    return b.build();
  });
  if (lvl >= 2) c.smoke(0.22, 1.36, -0.35);
  c.glow(ox + 0.3, 0.32, oz + 0.5, 0xffc477);
}

function buildBonfire(c) {
  c.mesh('m', () => {
    const b = new B();
    b.cyl(0.42, 0.42, 0.06, 8, [0, 0, 0], 0x5a504c);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      b.ico(0.11, [Math.cos(a) * 0.42, 0.07, Math.sin(a) * 0.42], k % 2 ? C.stone : C.stoneD, { s: [1, 0.8, 1], j: 0.012 });
    }
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.2;
      b.rod([Math.cos(a) * 0.34, 0.08, Math.sin(a) * 0.34], [Math.cos(a) * 0.03, 0.95, Math.sin(a) * 0.03], 0.055, k % 2 ? C.woodD : C.wood, { seg: 5 });
    }
    b.rod([-0.34, 0.5, 0], [0.34, 0.5, 0.05], 0.045, C.woodDD, { seg: 5 });
    return b.build();
  });
  const flame = c.mesh('flame', () => {
    const b = new B();
    b.cone(0.26, 0.9, 6, [0, 0, 0], 0xff9a3c, { v: 0.1 });
    b.cone(0.16, 0.65, 5, [0, 0, 0], 0xffd86a, { r: [0, 0.5, 0], v: 0.1 });
    b.cone(0.12, 0.5, 4, [0.16, 0, 0.05], 0xff8a3c, { v: 0.1 });
    b.cone(0.1, 0.4, 4, [-0.15, 0, -0.08], 0xff8a3c, { v: 0.1 });
    return b.build();
  }, MATS.glow);
  flame.position.set(0, 0.35, 0);
  c.ud.flame = flame;
  c.ud.update = (t) => {
    flame.scale.set(1 + 0.08 * Math.sin(t * 17), 1 + 0.2 * Math.sin(t * 11 + 1) + 0.07 * Math.sin(t * 23), 1 + 0.08 * Math.cos(t * 13));
    flame.rotation.y = t * 0.7;
  };
  c.smoke(0, 1.5, 0);
  c.glow(0, 0.8, 0, 0xff9a45);
}

// Note: landing pad; local origin at the footprint centre (2x2 cells).
function buildPad(c) {
  c.mesh('m', () => {
    const b = new B();
    b.box([1.9, 0.14, 1.9], [0, 0, 0], C.woodD, { sh: [0.85, 1] });
    for (let k = 0; k < 6; k++) b.box([1.84, 0.03, 0.27], [0, 0.14, -0.77 + k * 0.31], k % 2 ? C.woodL : C.wood, { v: 0.05 });
    b.disc(0.62, [0, 0.176, 0], C.cream, { r: [-PI / 2, 0, 0], seg: 12 });
    b.disc(0.4, [0, 0.178, 0], 0xe9806d, { r: [-PI / 2, 0, 0], seg: 12 });
    b.disc(0.2, [0, 0.18, 0], C.cream, { r: [-PI / 2, 0, 0], seg: 12 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(0.05, 0.045, 0.7, 5, [sx * 0.9, 0.14, sz * 0.9], C.woodDD);
      b.box([0.2, 0.12, 0.012], [sx * 0.9 + sx * 0.1, 0.62, sz * 0.9], [0xe9806d, 0xf2c14e, 0x7fb7b0, 0x6a96c7][(sx + 1) + (sz + 1) / 2], { v: 0.03 });
    }
    return b.build();
  });
}

function buildCampfire(c) {
  c.mesh('m', () => {
    const b = new B();
    b.cyl(0.26, 0.26, 0.03, 8, [0, 0, 0], 0x5a504c);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      b.ico(0.075, [Math.cos(a) * 0.27, 0.05, Math.sin(a) * 0.27], k % 2 ? C.stone : C.stoneD, { s: [1, 0.75, 1], j: 0.01 });
    }
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + 0.3;
      b.rod([Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2], [Math.cos(a) * 0.02, 0.27, Math.sin(a) * 0.02], 0.04, k % 2 ? C.woodD : C.wood, { seg: 5 });
    }
    for (const a of [3.5, 5.7]) b.cyl(0.09, 0.085, 0.17, 6, [Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], C.wood);
    return b.build();
  });
  const flame = c.mesh('flame', () => {
    const b = new B();
    b.cone(0.13, 0.42, 5, [0, 0, 0], 0xff9a3c, { v: 0.1 });
    b.cone(0.075, 0.3, 5, [0, 0.0, 0], 0xffd86a, { r: [0, 0.5, 0], v: 0.1 });
    b.cone(0.06, 0.22, 4, [0.1, 0, 0.03], 0xff8a3c, { v: 0.1 });
    return b.build();
  }, MATS.glow);
  flame.position.set(0, 0.07, 0);
  c.ud.flame = flame;
  c.ud.update = (t) => {
    flame.scale.set(1 + 0.08 * Math.sin(t * 17), 1 + 0.18 * Math.sin(t * 11 + 1) + 0.06 * Math.sin(t * 23), 1 + 0.08 * Math.cos(t * 13));
    flame.rotation.y = t * 0.8;
  };
  c.smoke(0, 0.6, 0);
  c.glow(0, 0.3, 0, 0xff9a45);
}

function buildLookout(c) {
  const H = 1.8;
  c.mesh('m', () => {
    const b = new B();
    const off = (y) => 0.36 - (0.14 * y) / H;
    b.box([0.8, 0.12, 0.8], [0, -0.07, 0], C.stoneD);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([sx, sz]) => b.beam([sx * 0.36, 0, sz * 0.36], [sx * 0.22, H + 0.05, sz * 0.22], 0.07, C.wood));
    for (const y of [0.9, H]) {
      const o = off(y);
      corners.forEach(([sx, sz], i) => {
        const [nx, nz] = corners[(i + 1) % 4];
        b.beam([sx * o, y, sz * o], [nx * o, y, nz * o], 0.05, C.woodD);
      });
    }
    [[0, 0.9], [0.9, H]].forEach(([y0, y1], bay) => {
      corners.forEach(([sx, sz], i) => {
        const [nx, nz] = corners[(i + 1) % 4];
        const a = off(y0), bb = off(y1);
        if ((i + bay) % 2) b.rod([sx * a, y0, sz * a], [nx * bb, y1, nz * bb], 0.022, C.woodL);
        else b.rod([nx * a, y0, nz * a], [sx * bb, y1, sz * bb], 0.022, C.woodL);
      });
    });
    b.box([0.64, 0.06, 0.64], [0, H, 0], C.woodL);
    corners.forEach(([sx, sz], i) => {
      b.beam([sx * 0.27, H + 0.06, sz * 0.27], [sx * 0.27, H + 0.4, sz * 0.27], 0.035, C.woodD);
      const [nx, nz] = corners[(i + 1) % 4];
      b.rod([sx * 0.27, H + 0.34, sz * 0.27], [nx * 0.27, H + 0.34, nz * 0.27], 0.02, C.wood);
    });
    b.cone(0.62, 0.32, 4, [0, H + 0.4, 0], 0xd9856a, { r: [0, PI / 4, 0], sh: [0.9, 1.08] });
    b.ico(0.04, [0, H + 0.74, 0], C.woodD);
    for (const s of [-1, 1]) b.rod([s * 0.1, 0.0, 0.43], [s * 0.1, H, 0.27], 0.02, C.woodD);
    for (let k = 1; k <= 5; k++) {
      const f = k / 6;
      b.rod([-0.1, f * H, 0.43 - f * 0.16], [0.1, f * H, 0.43 - f * 0.16], 0.016, C.woodL);
    }
    return b.build();
  });
  c.mesh('lamp', () => new B().box([0.1, 0.12, 0.1], [0, H + 0.12, 0], C.lampWarm).build(), MATS.glow);
  c.glow(0, H + 0.2, 0, 0xffd48a);
}

function buildSawmill(c) {
  const roofC = DARKROOF[c.v];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.9);
    b.box([1.8, 0.04, 1.7], [0, 0.05, 0], C.woodL);
    for (const sx of [-1, 1]) {
      b.box([0.12, 1.0, 0.12], [sx * 0.82, 0.05, -0.75], C.woodD);
      b.box([0.12, 0.84, 0.12], [sx * 0.82, 0.05, 0.78], C.woodD);
    }
    b.box([1.76, 0.08, 0.1], [0, 0.95, -0.75], C.wood);
    b.box([1.76, 0.08, 0.1], [0, 0.79, 0.78], C.wood);
    b.add(pBox(), roofC, { p: [0, 0.97, 0.0], r: [0.1, 0, 0], s: [1.98, 0.07, 1.98], c: true, sh: [0.95, 1.05] });
    b.box([1.76, 0.05, 0.05], [0, 0.55, -0.78], C.wood);
    // Note: saw table with vertical blade and a log being cut.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.06, 0.38, 0.06], [-0.1 + sx * 0.4, 0.05, 0.1 + sz * 0.17], C.woodD);
    b.box([0.95, 0.06, 0.45], [-0.1, 0.43, 0.1], C.wood);
    b.cyl(0.24, 0.24, 0.025, 10, [-0.1, 0.62, 0.1], C.metal, { c: true, r: [0, 0, PI / 2], sh: [0.9, 1.1] });
    b.cyl(0.05, 0.05, 0.07, 6, [-0.1, 0.62, 0.1], C.metalD, { c: true, r: [0, 0, PI / 2] });
    for (const sx of [-1, 1]) b.box([0.05, 0.3, 0.05], [-0.1 + sx * 0.06, 0.49, 0.1], C.woodDD);
    b.cyl(0.1, 0.1, 0.8, 6, [-0.1, 0.59, 0.1], C.wood, { c: true, r: [PI / 2, 0, 0] });
    // Note: log stack at the back right.
    for (let k = 0; k < 3; k++) b.cyl(0.09, 0.09, 0.6, 6, [0.45, 0.14, -0.62 + k * 0.19], C.wood, { c: true, r: [0, 0, PI / 2] });
    for (let k = 0; k < 2; k++) b.cyl(0.09, 0.09, 0.6, 6, [0.45, 0.3, -0.53 + k * 0.19], C.woodD, { c: true, r: [0, 0, PI / 2] });
    for (let k = 0; k < 5; k++) b.box([0.7, 0.04, 0.26], [0.45, 0.05 + k * 0.045, 0.45], k % 2 ? C.woodL : 0xdcb47c, { r: [0, (k % 2) * 0.05, 0] });
    for (let k = 0; k < 3; k++) b.box([0.1 + k * 0.03, 0.02, 0.07], [-0.5 + k * 0.1, 0.05, 0.62 - k * 0.05], 0xe8cfa0, { r: [0, k, 0] });
    return b.build();
  });
}

function buildCharcoal(c) {
  c.mesh('m', () => {
    const b = new B();
    b.cyl(0.44, 0.46, 0.12, 10, [0, -0.02, 0], C.stoneD);
    b.dome(0.42, 0.42, 10, [0, 0.08, 0], 0x6e5d52, { rings: 4, sh: [0.85, 1.2], j: 0.01 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      b.ico(0.07, [Math.cos(a) * 0.4, 0.07, Math.sin(a) * 0.4], k % 2 ? C.stone : C.stoneD, { s: [1, 0.8, 1], j: 0.008 });
    }
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + 1;
      b.ico(0.1, [Math.cos(a) * 0.22, 0.3 - k * 0.02, Math.sin(a) * 0.22], C.mossD, { s: [1, 0.35, 1] });
    }
    b.cyl(0.08, 0.06, 0.2, 6, [0, 0.46, 0], C.stoneD);
    b.cyl(0.045, 0.045, 0.02, 6, [0, 0.66, 0], C.dark);
    return b.build();
  });
  c.mesh('ember', () => new B().box([0.12, 0.08, 0.04], [0, 0.18, 0.43], C.ember).build(), MATS.glow);
  c.smoke(0, 0.72, 0);
  c.glow(0, 0.22, 0.45, 0xff7a3a);
}

function buildRopewalk(c) {
  c.mesh('m', () => {
    const b = new B();
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) b.box([0.06, 0.5, 0.06], [sx * 0.2, 0, sz * 0.4], C.woodD);
      b.box([0.5, 0.05, 0.06], [0, 0.46, sz * 0.4], C.wood);
    }
    b.box([0.07, 0.34, 0.07], [0, 0, 0.0], C.woodD);
    b.box([0.2, 0.04, 0.05], [0, 0.32, 0.0], C.wood);
    for (let k = -1; k <= 1; k++) {
      b.cyl(0.045, 0.045, 0.045, 6, [k * 0.12, 0.49, -0.4], C.rope, { r: [0, 0, 0] });
      const sag = 0.03 * k * k;
      b.rod([k * 0.12, 0.5, -0.4], [k * 0.05, 0.4 - sag, 0], 0.014, C.rope, { seg: 3 });
      b.rod([k * 0.05, 0.4 - sag, 0], [0, 0.4, 0.38], 0.014, C.rope, { seg: 3 });
    }
    b.cone(0.07, 0.12, 5, [0, 0.33, 0.38], C.woodD, { r: [PI / 2, 0, 0] });
    b.cyl(0.13, 0.13, 0.03, 8, [0, 0.3, 0.44], C.wood, { c: true, r: [PI / 2, 0, 0] });
    b.rod([0, 0.3, 0.45], [0.1, 0.4, 0.47], 0.015, C.woodDD);
    b.torus(0.09, 0.035, [0.3, 0.04, -0.1], C.rope, { r: [PI / 2, 0, 0], rs: 3, ts: 7 });
    b.torus(0.08, 0.03, [0.3, 0.09, -0.1], 0xcfb77f, { r: [PI / 2, 0, 0], rs: 3, ts: 7 });
    b.ico(0.1, [-0.32, 0.08, 0.12], 0xaed07a, { s: [1.3, 0.8, 0.9], j: 0.01 });
    return b.build();
  });
}

function buildDock(c) {
  c.mesh('m', () => {
    const b = new B();
    const y = 0.14;
    for (let i = 0; i < 10; i++) b.box([0.72, 0.05, 0.18], [0, y, -0.36 + i * 0.2], i % 2 ? C.woodL : C.wood, { sh: [0.95, 1.05] });
    for (const sx of [-1, 1]) b.box([0.07, 0.07, 2.0], [sx * 0.27, y - 0.07, 0.5], C.woodD);
    for (const z of [-0.35, 0.55, 1.45]) {
      for (const sx of [-1, 1]) {
        const top = z > 1 ? 0.5 : 0.39;
        b.box([0.09, top + 0.75, 0.09], [sx * 0.36, -0.75, z], C.woodD);
        if (z > 1) b.ico(0.055, [sx * 0.36, top + 0.02, z], C.woodDD);
      }
    }
    for (const sx of [-1, 1]) {
      b.rod([sx * 0.36, 0.34, -0.35], [sx * 0.36, 0.32, 0.55], 0.016, C.rope, { seg: 3 });
      b.rod([sx * 0.36, 0.32, 0.55], [sx * 0.36, 0.34, 1.45], 0.016, C.rope, { seg: 3 });
    }
    b.torus(0.09, 0.03, [-0.15, y + 0.08, 0.95], C.rope, { r: [PI / 2, 0, 0], rs: 3, ts: 7 });
    b.box([0.22, 0.2, 0.22], [0.15, y + 0.05, 0.25], C.woodL, { r: [0, 0.3, 0] });
    b.cyl(0.1, 0.09, 0.22, 7, [-0.16, y + 0.05, 0.05], C.woodD);
    return b.build();
  });
}

function buildBrickkiln(c) {
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.95);
    const cx = -0.2, cz = -0.1;
    b.cyl(0.76, 0.72, 0.3, 9, [cx, 0.05, cz], C.brickD, { sh: [0.9, 1.05] });
    b.dome(0.72, 0.5, 9, [cx, 0.35, cz], C.brick, { rings: 3, sh: [0.88, 1.12] });
    b.box([0.36, 0.3, 0.14], [cx, 0.05, cz + 0.68], C.dark);
    b.box([0.48, 0.06, 0.16], [cx, 0.35, cz + 0.68], C.stoneL);
    b.cyl(0.14, 0.1, 1.3, 6, [0.4, 0.05, -0.5], C.brick, { sh: [0.9, 1.05] });
    b.cyl(0.14, 0.14, 0.06, 6, [0.4, 1.3, -0.5], C.stoneD);
    for (let s = 0; s < 2; s++) {
      const x = 0.62 + s * 0.28;
      for (let k = 0; k < 6; k++) {
        const col = k % 2 ? C.brick : C.brickD;
        b.box([0.22, 0.07, 0.11], [x, 0.05 + Math.floor(k / 2) * 0.075, 0.55 + (k % 2) * 0.12], col, { r: [0, s * 0.1, 0] });
      }
    }
    return b.build();
  });
  c.mesh('fire', () => new B().box([0.24, 0.17, 0.02], [-0.2, 0.08, 0.78], C.ember).build(), MATS.glow);
  c.smoke(0.4, 1.4, -0.5);
  c.glow(-0.2, 0.2, 0.8, 0xff8a3c);
}

function buildSmelter(c) {
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.9);
    const cx = -0.1, cz = -0.05;
    b.box([1.1, 0.5, 0.9], [cx, 0.05, cz], C.stoneD, { sh: [0.9, 1.05] });
    b.cyl(0.48, 0.28, 0.75, 8, [cx, 0.55, cz], C.stone, { sh: [0.85, 1.12] });
    b.cyl(0.2, 0.15, 0.6, 8, [cx, 1.3, cz], C.stoneD, { sh: [0.9, 1.05] });
    b.cyl(0.19, 0.19, 0.05, 8, [cx, 1.86, cz], C.dark);
    b.box([0.4, 0.3, 0.1], [cx, 0.1, cz + 0.42], C.dark);
    b.box([0.5, 0.06, 0.12], [cx, 0.4, cz + 0.42], C.stoneL);
    b.prism(0.34, 0.26, 0.5, [0.7, 0.05, 0.2], C.woodD, { r: [0, -0.4, 0] });
    b.rod([0.62, 0.2, 0.15], [0.46, 0.2, 0.05], 0.025, C.metalD);
    for (let k = 0; k < 3; k++) {
      const row = k < 2 ? 0 : 1;
      b.box([0.2, 0.06, 0.09], [-0.7 + (k < 2 ? k * 0.22 : 0.11), 0.05 + row * 0.065, 0.62], C.metal, { sh: [0.95, 1.1] });
    }
    b.ico(0.12, [-0.7, 0.1, -0.5], C.stoneD, { s: [1, 0.8, 1], j: 0.01 });
    b.ico(0.09, [0.68, 0.08, -0.55], 0x7a5f56, { s: [1, 0.8, 1], j: 0.01 });
    return b.build();
  });
  c.mesh('fire', () => new B().box([0.28, 0.18, 0.02], [-0.1, 0.12, 0.48], C.ember).box([0.16, 0.1, 0.02], [-0.1, 0.16, 0.5], 0xffd86a).build(), MATS.glow);
  c.smoke(-0.1, 1.95, -0.05);
  c.glow(-0.1, 0.3, 0.55, 0xff8a3a);
}

function buildSmithy(c) {
  const roofC = DARKROOF[c.v];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.9);
    b.box([1.5, 0.3, 0.95], [0, 0.05, -0.38], C.stone, { sh: [0.9, 1.05] });
    b.box([1.46, 0.32, 0.91], [0, 0.35, -0.38], 0xe8dcc6);
    b.group({ p: [0, 0, -0.38], r: [0, PI / 2, 0] }, () => {
      gable(b, { hw: 0.56, h: 0.42, d: 1.72, y: 0.67, col: roofC, fillCol: 0xe8dcc6 });
    });
    b.box([0.2, 0.95, 0.2], [0.5, 0.5, -0.5], C.stone);
    b.box([0.28, 0.05, 0.28], [0.5, 1.45, -0.5], C.stoneD);
    b.box([0.28, 0.4, 0.05], [-0.35, 0.05, 0.1], C.woodD);
    b.box([0.14, 0.14, 0.05], [-0.62, 0.38, 0.1], 0xfff0c0);
    for (const sx of [-1, 1]) b.box([0.07, 0.78, 0.07], [sx * 0.72, 0.05, 0.8], C.woodD);
    b.add(pBox(), C.woodDD, { p: [0, 0.8, 0.46], r: [0.12, 0, 0], s: [1.6, 0.05, 0.92], c: true });
    b.box([0.55, 0.35, 0.34], [0.4, 0.05, 0.22], C.stoneD);
    b.cyl(0.14, 0.14, 0.26, 6, [-0.3, 0.05, 0.4], C.wood);
    b.box([0.1, 0.06, 0.09], [-0.3, 0.31, 0.4], C.metalD);
    b.box([0.28, 0.08, 0.11], [-0.3, 0.37, 0.4], C.metalD, { sh: [0.9, 1.1] });
    b.cone(0.05, 0.12, 5, [-0.47, 0.41, 0.4], C.metalD, { r: [0, 0, PI / 2 + 0.05] });
    b.rod([-0.62, 0.07, 0.62], [-0.45, 0.07, 0.58], 0.014, C.woodDD);
    b.box([0.08, 0.06, 0.06], [-0.66, 0.05, 0.62], C.metal);
    b.cyl(0.13, 0.12, 0.28, 7, [-0.62, 0.05, 0.16], C.woodD);
    b.cyl(0.135, 0.125, 0.03, 7, [-0.62, 0.15, 0.16], C.metalD);
    return b.build();
  });
  c.mesh('forge', () => new B().box([0.34, 0.04, 0.22], [0.4, 0.4, 0.22], C.ember).build(), MATS.glow);
  c.smoke(0.5, 1.5, -0.5);
  c.glow(0.4, 0.45, 0.22, 0xff9a45);
}

function buildWindmill(c) {
  c.mesh('m', () => {
    const b = new B();
    b.cyl(0.78, 0.8, 0.25, 10, [0, -0.2, 0], C.stoneD);
    b.cyl(0.52, 0.34, 1.4, 9, [0, 0.05, 0], 0xf6ecd6, { sh: [0.9, 1.06] });
    b.cyl(0.54, 0.52, 0.1, 9, [0, 0.05, 0], C.stone);
    b.cone(0.48, 0.5, 9, [0, 1.4, 0], ROOF[c.v], { sh: [0.88, 1.1] });
    b.ico(0.05, [0, 1.93, 0], C.woodD);
    b.box([0.22, 0.4, 0.07], [0, 0.05, 0.5], C.woodD);
    b.box([0.3, 0.05, 0.14], [0, 0.0, 0.58], C.stoneL);
    for (const s of [-1, 1]) {
      const a = s * 0.9;
      b.box([0.12, 0.14, 0.05], [Math.sin(a) * 0.43, 0.7, Math.cos(a) * 0.43], 0xfff0c0, { r: [0, a, 0] });
    }
    b.rod([0, 1.28, 0.2], [0, 1.28, 0.62], 0.055, C.woodD);
    return b.build();
  });
  const spin = new Group();
  spin.position.set(0, 1.28, 0.62);
  c.g.add(spin);
  const sailCol = [0xf4eed8, 0xf0c8c0, 0xcfe6d8, 0xf4eed8][c.v];
  c.mesh('sails', () => {
    const b = new B();
    b.cyl(0.07, 0.07, 0.12, 8, [0, 0, -0.04], C.woodD, { r: [PI / 2, 0, 0] });
    for (let k = 0; k < 4; k++) {
      b.group({ r: [0, 0, (k * PI) / 2] }, () => {
        b.box([0.05, 0.92, 0.03], [0, 0.06, 0.0], C.woodD);
        b.box([0.2, 0.6, 0.02], [0.12, 0.26, 0.01], sailCol, { sh: [0.92, 1.05] });
        b.box([0.25, 0.03, 0.03], [0.12, 0.45, 0], C.woodL);
        b.box([0.25, 0.03, 0.03], [0.12, 0.8, 0], C.woodL);
      });
    }
    return b.build();
  }, MATS.vertex, spin);
  c.ud.spin = spin;
  c.glow(0, 0.6, 0.5, 0xffd48a);
}

function buildOven(c) {
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.85);
    b.box([1.5, 0.4, 1.3], [0, 0.05, -0.1], 0xe8dcc6, { sh: [0.9, 1.05] });
    b.dome(0.62, 0.6, 9, [0, 0.45, -0.2], C.clay, { rings: 4, sh: [0.88, 1.12] });
    b.box([0.3, 0.26, 0.12], [0, 0.45, 0.35], C.dark);
    b.box([0.46, 0.07, 0.14], [0, 0.71, 0.36], C.stoneL);
    for (const s of [-1, 1]) b.box([0.08, 0.28, 0.14], [s * 0.19, 0.45, 0.36], C.stoneL);
    b.cyl(0.11, 0.08, 0.7, 6, [0, 0.85, -0.55], C.brickD);
    b.cyl(0.115, 0.115, 0.05, 6, [0, 1.52, -0.55], C.stoneD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.04, 0.35, 0.04], [0.62 + sx * 0.2, 0.05, 0.62 + sz * 0.14], C.woodD);
    b.box([0.5, 0.05, 0.35], [0.62, 0.4, 0.62], C.woodL);
    for (let k = 0; k < 3; k++) b.ico(1, [0.5 + k * 0.12, 0.49, 0.62], 0xd89a4a, { s: [0.06, 0.04, 0.045], sh: [0.9, 1.2] });
    for (let k = 0; k < 3; k++) b.cyl(0.06, 0.06, 0.4, 5, [-0.65, k < 2 ? 0.11 : 0.22, k < 2 ? 0.55 + k * 0.12 : 0.61], C.wood, { c: true, r: [0, 0, PI / 2] });
    b.rod([-0.45, 0.45, 0.5], [-0.62, 0.05, 0.9], 0.015, C.woodDD);
    b.box([0.16, 0.02, 0.14], [-0.62, 0.05, 0.9], C.woodL);
    return b.build();
  });
  c.mesh('fire', () => new B().box([0.2, 0.14, 0.02], [0, 0.49, 0.42], C.ember).build(), MATS.glow);
  c.smoke(0, 1.58, -0.55);
  c.glow(0, 0.56, 0.5, 0xff9b4a);
}

function buildSmokehouse(c) {
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.6, 1.5);
    b.box([1.0, 0.85, 1.1], [-0.25, 0.05, -0.15], 0x9b6f47, { sh: [0.9, 1.05] });
    for (let k = 0; k < 4; k++) b.box([0.025, 0.85, 0.02], [-0.6 + k * 0.23, 0.05, 0.405], C.woodD);
    gable(b, { hw: 0.64, h: 0.55, d: 1.3, y: 0.88, col: [0x6f5a4c, 0x7a6a5a, 0x5f5248, 0x8a6a50][c.v], z: -0.15, fillCol: 0x9b6f47 });
    b.box([0.17, 0.9, 0.17], [-0.05, 0.9, -0.35], C.stone);
    b.box([0.23, 0.05, 0.23], [-0.05, 1.8, -0.35], C.stoneD);
    b.box([0.3, 0.55, 0.05], [-0.25, 0.05, 0.41], C.dark);
    for (const z of [0.1, 0.7]) b.box([0.06, 0.78, 0.06], [0.7, 0.05, z], C.woodD);
    b.box([0.06, 0.05, 0.66], [0.7, 0.75, 0.4], C.wood);
    for (let k = 0; k < 3; k++) {
      const z = 0.25 + k * 0.17;
      b.rod([0.7, 0.75, z], [0.7, 0.58, z], 0.008, C.rope, { seg: 3 });
      b.oct(0.05, [0.7, 0.5, z], 0xe8a07a, { s: [0.5, 1.7, 0.5] });
    }
    return b.build();
  });
  c.mesh('ember', () => new B().box([0.14, 0.07, 0.02], [-0.25, 0.1, 0.45], C.ember).build(), MATS.glow);
  c.smoke(-0.05, 1.86, -0.35);
  c.glow(-0.25, 0.15, 0.5, 0xff7a3a);
}

const CLOTH = [0xf0a8b8, 0xa8d8b8, 0xf4d98a, 0xc8b0e0, 0x9cc8e8, 0xf4a888, 0xb8e0a0];

function buildLoom(c) {
  c.mesh('m', () => {
    const b = new B();
    b.box([1.75, 0.06, 1.5], [0, -0.01, 0], C.woodL);
    for (const sx of [-1, 1]) b.box([0.09, 1.3, 0.09], [sx * 0.62, 0.05, -0.3], C.woodD);
    b.box([1.4, 0.09, 0.09], [0, 1.15, -0.3], C.wood);
    b.box([1.3, 0.08, 0.08], [0, 0.35, -0.3], C.wood);
    for (let k = 0; k < 7; k++) {
      const x = -0.51 + k * 0.17;
      b.box([0.16, 0.2 + ((k * 3) % 4) * 0.04, 0.03], [x, 0.43, -0.3], CLOTH[(k + c.v) % 7]);
    }
    for (let k = 0; k < 5; k++) b.rod([-0.48 + k * 0.24, 0.65, -0.3], [-0.48 + k * 0.24, 1.15, -0.3], 0.01, 0xf2ead6, { seg: 3 });
    b.add(pBox(), C.thatch, { p: [0, 1.38, -0.15], r: [-0.12, 0, 0], s: [1.6, 0.07, 0.95], c: true, sh: [0.9, 1.05] });
    b.box([0.7, 0.06, 0.28], [0, 0.3, 0.45], C.wood);
    for (const sx of [-1, 1]) b.box([0.06, 0.3, 0.06], [sx * 0.3, 0, 0.45], C.woodD);
    b.box([0.14, 0.04, 0.05], [0.15, 0.36, 0.45], C.woodDD);
    b.cyl(0.16, 0.14, 0.16, 7, [0.65, 0.05, 0.55], C.woodD, { open: true });
    b.ico(0.14, [0.65, 0.2, 0.55], 0xaed07a, { s: [1, 0.7, 1], j: 0.012 });
    b.ico(0.1, [-0.65, 0.1, 0.55], CLOTH[c.v % 7], { s: [1.2, 0.7, 1] });
    return b.build();
  });
  const cloth = c.mesh('cloth', () => {
    const b = new B();
    for (let k = 0; k < 7; k++) {
      const len = 0.5 + ((k * 5 + c.v) % 4) * 0.07;
      b.box([0.17, len, 0.03], [-0.51 + k * 0.17, -len, 0], CLOTH[(k + c.v + 3) % 7], { sh: [0.95, 1.05] });
    }
    return b.build();
  }, MATS.vertex);
  cloth.position.set(0, 1.12, -0.2);
  c.ud.cloth = cloth;
  c.ud.update = (t, wind01 = 0.3) => {
    cloth.rotation.x = Math.sin(t * 1.3) * 0.05 * (0.3 + wind01);
    cloth.rotation.z = Math.sin(t * 0.9 + 1) * 0.02 * wind01;
  };
}

function buildLampworks(c) {
  const lampCols = [0xffd36a, 0xff9ab8, 0x8fe0ff, 0xb9f08a, 0xffb36a];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.95, 1.75);
    b.box([1.5, 0.62, 1.2], [0, 0.05, -0.15], C.plaster, { sh: [0.9, 1.05] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.09, 0.64, 0.09], [sx * 0.75, 0.05, -0.15 + sz * 0.6], C.woodD);
    b.box([0.3, 0.42, 0.05], [-0.35, 0.05, 0.46], C.woodD);
    const hw = 0.78, h = 0.5, y = 0.67;
    b.box([0.07, 0.07, 1.4], [0, y + h - 0.02, -0.15], C.woodD);
    for (const s of [-1, 1]) {
      b.box([0.07, 0.07, 1.4], [s * hw, y, -0.15], C.woodD);
      for (let k = 0; k < 3; k++) {
        const z = -0.7 + k * 0.55;
        b.beam([s * hw, y + 0.03, z], [0, y + h, z], 0.045, C.wood);
      }
    }
    for (const s of [-1, 1]) {
      b.box([0.08, 1.0, 0.08], [s * 0.82, 0.05, 0.72], C.woodD);
    }
    b.box([1.72, 0.05, 0.05], [0, 0.95, 0.72], C.wood);
    for (const sx of [-1, 1]) b.ico(0.07, [sx * 0.82, 1.08, 0.72], C.woodDD, { s: [1, 0.8, 1] });
    return b.build();
  });
  c.mesh('glass', () => {
    const b = new B();
    const hw = 0.78, h = 0.5, y = 0.67;
    const a = Math.atan2(h, hw);
    const L = Math.hypot(hw, h);
    for (const s of [-1, 1]) {
      b.add(pBox(), 0xcdeaf4, { p: [(s * hw) / 2, y + h / 2 + 0.01, -0.15], r: [0, 0, -s * a], s: [L, 0.03, 1.36], c: true, v: 0.02, sh: [0.9, 1.1] });
    }
    return b.build();
  }, MATS.glass);
  c.mesh('lamps', () => {
    const b = new B();
    for (let k = 0; k < 5; k++) {
      const x = -0.6 + k * 0.3;
      b.ico(0.075, [x, 0.8, 0.72], lampCols[(k + c.v) % 5], { v: 0.08 });
    }
    for (const sx of [-1, 1]) b.ico(0.08, [sx * 0.82, 1.14, 0.72], lampCols[(sx + 3 + c.v) % 5]);
    b.box([0.34, 0.2, 0.02], [0.3, 0.2, 0.46], 0xffe9a8);
    b.box([0.26, 0.18, 0.02], [0.35, 0.34, -0.76], 0xff9ab8);
    b.box([0.26, 0.18, 0.02], [-0.35, 0.34, -0.76], 0x8fe0ff);
    return b.build();
  }, MATS.glow);
  // Note: hanger strings for the front lamps.
  c.mesh('strings', () => {
    const b = new B();
    for (let k = 0; k < 5; k++) b.rod([-0.6 + k * 0.3, 0.95, 0.72], [-0.6 + k * 0.3, 0.86, 0.72], 0.008, C.dark, { seg: 3 });
    return b.build();
  });
  c.glow(0, 0.7, 0.8, 0xffe08a);
}

// Note: open pavilion with a long table and eight chairs; seat spots match econ.js hallSeats.
function buildHall(c) {
  const roofC = [0xdb8a6c, 0x84b39c, 0x8aa8cb, 0xc48ca8][c.v];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 2.9, 2.9);
    b.box([2.7, 0.04, 2.7], [0, 0.05, 0], C.woodL, { sh: [0.92, 1.04] });
    const F = 0.09;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.14, 1.0, 0.14], [sx * 1.3, F, sz * 1.3], C.woodD);
    for (const sz of [-1, 1]) b.box([2.74, 0.08, 0.1], [0, 1.0, sz * 1.3], C.woodDD);
    for (const sx of [-1, 1]) b.box([0.1, 0.08, 2.74], [sx * 1.3, 1.0, 0], C.woodDD);
    // Note: open pergola rafters and a narrow cloth strip at the back, so the furniture stays visible from above.
    for (let k = 0; k < 7; k++) b.box([0.07, 0.07, 3.0], [-1.3 + k * 0.4333, 1.08, 0], k % 2 ? C.woodD : C.wood);
    b.box([3.0, 0.03, 0.45], [0, 1.15, -1.15], roofC);
    // Note: table with runner, plates and cups.
    b.box([2.3, 0.06, 0.72], [0, F + 0.36, 0], C.woodL, { sh: [0.92, 1.04] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.07, 0.36, 0.07], [sx * 1.0, F, sz * 0.27], C.woodD);
    b.box([1.9, 0.012, 0.26], [0, F + 0.42, 0], C.cream);
    for (const x of [-0.7, 0, 0.7]) for (const z of [-0.26, 0.26]) b.cyl(0.075, 0.065, 0.015, 8, [x, F + 0.42, z], C.cream);
    for (const [x, z, col] of [[-0.35, 0.05, 0xc7766a], [0.35, -0.05, 0x6a96c7], [0.05, 0.08, 0xc7a85a]]) b.cyl(0.035, 0.03, 0.06, 6, [x, F + 0.42, z], col);
    b.ico(0.08, [0, F + 0.5, 0.0], 0xe9c46a, { s: [1.2, 0.8, 1], j: 0.01 });
    // Note: chairs, backs on the outer side.
    const chair = (x, z, ax, az) => {
      b.box([0.3, 0.04, 0.3], [x, F + 0.18, z], C.wood);
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box([0.04, 0.18, 0.04], [x + dx * 0.12, F, z + dz * 0.12], C.woodD);
      b.box(ax ? [0.035, 0.24, 0.3] : [0.3, 0.24, 0.035], [x + ax * 0.15, F + 0.2, z + az * 0.15], C.woodD);
    };
    for (const x of [-0.7, 0, 0.7]) { chair(x, -0.58, 0, -1); chair(x, 0.58, 0, 1); }
    chair(-1.2, 0, -1, 0); chair(1.2, 0, 1, 0);
    b.cyl(0.06, 0.05, 0.1, 6, [0, 0.7, 0], C.lampWarm);
    b.rod([0, 0.8, 0], [0, 1.2, 0], 0.012, C.dark);
    return b.build();
  });
  c.glow(0, 0.75, 0, 0xffd88a);
}

// Note: fence run from (x0,z0) to (x1,z1) with posts and two rails.
function fenceRun(b, x0, z0, x1, z1, h = 0.4, col = C.woodD, railCol = C.wood) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 0.45));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    b.box([0.06, h, 0.06], [x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t], col, { sh: [0.9, 1.05] });
  }
  for (const y of [h * 0.45, h * 0.85]) b.rod([x0, y, z0], [x1, y, z1], 0.016, railCol, { seg: 4 });
}

function buildCoop(c) {
  const roofC = [0xdb8a6c, 0x84b39c, 0xc8a05a, 0xc48ca8][c.v];
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.9, 1.85);
    b.box([1.8, 0.04, 1.75], [0, 0.05, 0], 0xcfb36f, { v: 0.04 });
    b.box([1.15, 0.55, 0.85], [-0.25, 0.1, -0.5], C.woodL, { sh: [0.9, 1.05] });
    for (let k = 0; k < 5; k++) b.box([0.025, 0.55, 0.02], [-0.7 + k * 0.22, 0.1, -0.07], C.woodD);
    gable(b, { hw: 0.68, h: 0.36, d: 0.98, y: 0.66, col: roofC, z: -0.5, fillCol: C.wood });
    b.box([0.22, 0.24, 0.05], [-0.25, 0.14, -0.07], C.dark);
    b.beam([-0.25, 0.1, 0.45], [-0.25, 0.18, -0.07], 0.05, C.woodD);
    for (let k = 0; k < 3; k++) b.box([0.14, 0.015, 0.05], [-0.25, 0.14 + k * 0.1, 0.12 + k * 0.12], C.woodDD);
    b.box([0.34, 0.22, 0.3], [0.58, 0.1, -0.5], C.wood);
    b.box([0.38, 0.04, 0.34], [0.58, 0.32, -0.5], C.woodDD, { r: [0.12, 0, 0] });
    b.box([0.2, 0.05, 0.14], [0.6, 0.1, -0.2], C.woodD);
    fenceRun(b, -0.9, 0.85, -0.35, 0.85);
    fenceRun(b, 0.25, 0.85, 0.9, 0.85);
    fenceRun(b, 0.9, 0.85, 0.9, -0.1);
    b.cyl(0.18, 0.15, 0.1, 7, [0.55, 0.05, 0.55], 0xe6c458, { open: true });
    b.ico(0.12, [-0.7, 0.1, 0.55], 0xe6d48a, { s: [1.2, 0.5, 1], j: 0.03 });
    return b.build();
  });
}

function buildPen(c) {
  c.mesh('m', () => {
    const b = new B();
    b.box([2.85, 0.1, 2.85], [0, -0.07, 0], 0x87bd6e, { v: 0.08, sh: [0.95, 1.02] });
    for (let k = 0; k < 7; k++) b.ico(0.17, [-1 + ((k * 37) % 20) / 10, 0.02, -1 + ((k * 53) % 20) / 10], 0x6fae5d, { s: [1.2, 0.3, 1], v: 0.06 });
    const e = 1.4;
    fenceRun(b, -e, -e, e, -e, 0.45);
    fenceRun(b, -e, -e, -e, e, 0.45);
    fenceRun(b, e, -e, e, e, 0.45);
    fenceRun(b, -e, e, -0.38, e, 0.45);
    fenceRun(b, 0.38, e, e, e, 0.45);
    b.box([0.07, 0.55, 0.07], [-0.4, 0, e], C.woodDD);
    b.box([0.07, 0.55, 0.07], [0.4, 0, e], C.woodDD);
    b.box([0.9, 0.05, 0.05], [0, 0.5, e], C.woodDD);
    b.box([0.6, 0.14, 0.2], [-0.7, 0, -0.7], C.woodD);
    b.box([0.5, 0.05, 0.14], [-0.7, 0.1, -0.7], 0x6f9fc9, { r: [0, 0, 0] });
    for (const sx of [-1, 1]) b.beam([1.35 * 0.0 + sx * 0.5, 0, -1.3], [sx * 0.5, 0.75, -1.3], 0.07, C.woodD);
    b.add(pBox(), C.thatch, { p: [0, 0.8, -1.15], r: [0.22, 0, 0], s: [1.35, 0.06, 0.62], c: true, sh: [0.9, 1.05] });
    b.box([0.4, 0.2, 0.3], [0.85, 0, -0.8], 0xe6c458, { r: [0, 0.3, 0] });
    b.box([0.4, 0.2, 0.3], [1.05, 0.2, -0.75], 0xdcb64a, { r: [0, -0.2, 0] });
    return b.build();
  });
}

function buildGlassGarden(c) {
  const flow = [0xe98ab0, 0xf6e27a, 0x8fb7e8, 0xf2a03f, 0xc8b0e0];
  c.mesh('m', () => {
    const b = new B();
    b.box([2.85, 0.28, 2.85], [0, -0.22, 0], C.stoneD, { sh: [0.85, 1] });
    b.box([2.6, 0.04, 2.6], [0, 0.06, 0], 0x7a6a50, { v: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.1, 1.1, 0.1], [sx * 1.25, 0.06, sz * 1.25], C.woodL);
    b.box([2.6, 0.08, 0.08], [0, 1.1, -1.25], C.woodL);
    b.box([2.6, 0.08, 0.08], [0, 1.1, 1.25], C.woodL);
    b.box([0.08, 0.08, 2.5], [-1.25, 1.1, 0], C.woodL);
    b.box([0.08, 0.08, 2.5], [1.25, 1.1, 0], C.woodL);
    b.box([0.09, 0.07, 2.6], [0, 1.66, 0], C.woodL);
    for (const sx of [-1, 1]) b.beam([sx * 1.25, 1.1, -1.25], [0, 1.66, -1.25], 0.05, C.woodL);
    for (const sx of [-1, 1]) b.beam([sx * 1.25, 1.1, 1.25], [0, 1.66, 1.25], 0.05, C.woodL);
    for (const sx of [-1, 1]) b.box([0.5, 0.14, 2.0], [sx * 0.8, 0.06, 0.1], 0x6b4f3a);
    for (let k = 0; k < 9; k++) {
      const sx = k % 2 ? 1 : -1; const z = -0.8 + ((k * 7) % 9) * 0.22;
      b.ico(0.08, [sx * (0.62 + ((k * 3) % 4) * 0.1), 0.26, z], flow[(k + c.v) % 5], { s: [1, 0.9, 1], j: 0.01 });
      b.rod([sx * (0.62 + ((k * 3) % 4) * 0.1), 0.2, z], [sx * (0.62 + ((k * 3) % 4) * 0.1), 0.06, z], 0.012, 0x5f9f4a, { seg: 3 });
    }
    b.ico(0.22, [0, 0.14, -0.9], 0x6fae5d, { s: [1.3, 0.8, 1], j: 0.03 });
    b.cyl(0.35, 0.3, 0.07, 8, [0, 0.07, 0.6], 0x8fd0e8);
    return b.build();
  });
  c.mesh('glass', () => {
    const b = new B();
    const gl = 0xcdeef5;
    b.box([2.5, 1.0, 0.03], [0, 0.1, -1.25], gl);
    b.box([2.5, 1.0, 0.03], [0, 0.1, 1.25], gl);
    b.box([0.03, 1.0, 2.5], [-1.25, 0.1, 0], gl);
    b.box([0.03, 1.0, 2.5], [1.25, 0.1, 0], gl);
    for (const sx of [-1, 1]) b.add(pBox(), gl, { p: [sx * 0.64, 1.4, 0], r: [0, 0, -sx * 0.4], s: [1.42, 0.03, 2.5], c: true });
    b.prism(2.5, 0.56, 0.03, [0, 1.1, -1.25], gl);
    b.prism(2.5, 0.56, 0.03, [0, 1.1, 1.25], gl);
    return b.build();
  }, MATS.glass);
}

// Note: council hall base (the capital at tier 1): a stone plaza with a flagpost on a cairn; the tier kit adds the map table and tower.
function buildCouncil(c) {
  const px = -0.62, pz = -0.62;
  c.mesh('m', () => {
    const b = new B();
    plinth(b, 1.9, 1.9);
    b.box([1.7, 0.04, 1.7], [0, 0.05, 0], C.stoneL, { sh: [0.92, 1.04] });
    b.cyl(0.3, 0.2, 0.3, 6, [px, 0.07, pz], C.stoneD, { sh: [0.85, 1.05] });
    b.rod([px, 0.3, pz], [px, 2.35, pz], 0.035, C.woodDD);
    b.oct(0.06, [px, 2.4, pz], GOLD);
    return b.build();
  });
  // Note: the flag hangs from the pole and swings about it; geometry is local to the pole.
  const flag = c.mesh('flag', () => new B().box([0.62, 0.34, 0.015], [0.31, 1.85, 0], FLAG_COLS[c.v], { sh: [0.95, 1.05] }).build(), MATS.vertexDouble);
  flag.position.set(px, 0, pz);
  c.ud.update = (time, wind) => { flag.rotation.y = Math.sin(time * 1.9 + c.v) * (0.12 + wind * 0.3); };
}

const BUILD = {
  storehouse: buildStorehouse, hut: buildHut, campfire: buildCampfire, lookout: buildLookout, sawmill: buildSawmill,
  charcoal: buildCharcoal, ropewalk: buildRopewalk, dock: buildDock, brickkiln: buildBrickkiln, smelter: buildSmelter,
  smithy: buildSmithy, windmill: buildWindmill, oven: buildOven, smokehouse: buildSmokehouse, loom: buildLoom,
  lampworks: buildLampworks, hall: buildHall, bonfire: buildBonfire, pad: buildPad,
  coop: buildCoop, pen: buildPen, glassgarden: buildGlassGarden, council: buildCouncil,
};

const HEIGHTS = new Map();

// Note: civ-progress tiers; every flourish building has a kit in tiers/.
const FLOURISH = FLOURISH_IDS;
const FLAG_COLS = [0xd9604a, 0x4f8fc9, 0xe0b440, 0x6fae82];
const GOLD = 0xe6c15a;
// Note: render helpers for the content kits; filled once at import, kits only run later.
Object.assign(ENV, { MATS, GOLD, FLAG_COLS, gable, plinth, Vector3, Group });
// Note: kit API. A kit is (c, K) => void and adds tier parts for K.t = 1..4 (cumulative). Parts are anchored to the base bounds in K.
function addTier(c, kit) {
  const bb = new Box3().setFromObject(c.g);
  const half = BUILDINGS[c.id].size / 2;
  c.ud.baseMeshes = c.g.children.length;
  const lit = (name, build, parent) => c.mesh(name, build, MATS.glow, parent);
  const K = {
    t: c.tier, v: c.v, d: c.d, bb, half, front: bb.max.z, back: bb.min.z, left: bb.min.x, right: bb.max.x, top: bb.max.y,
    B, C, MATS, GOLD, FLAG_COLS, gable, plinth,
    mesh: (name, build, mat, parent) => c.mesh(name, build, mat, parent),
    lit,
    // Note: self-lit mesh plus a point for the light pool (flickers via the view).
    lamp: (x, y, z) => { (c.ud.lamps ||= []).push(new Vector3(x, y, z)); },
    // Note: plume = chimney smoke point; the view emits smoke there while the building stands.
    plume: (x, y, z) => { (c.ud.plumes ||= []).push(new Vector3(x, y, z)); },
    // Note: chained per-frame update (time, wind).
    sway: (fn) => { const prev = c.ud.update; c.ud.update = (time, wind) => { if (prev) prev(time, wind); fn(time, wind); }; },
    // Note: folk stand point for a prop slot S/C/W, local to the building, +z = door side.
    spot: (kind) => { const [fx, dz] = TIER_SPOTS[kind]; return new Vector3(fx * half, 0, half + dz); },
    glowAt: (name, build) => lit(name, build),
  };
  c.ud.spots = { S: K.spot('S'), C: K.spot('C'), W: K.spot('W') };
  kit(c, K);
}

export function makeBuilding(id, level = 0, seed = 0, tier = 0) {
  const kit = LANDMARK_KITS[id];
  const fn = kit ? (cx) => kit(cx, B, C) : BUILD[id];
  if (!fn || !BUILDINGS[id]) throw new Error(`makeBuilding: unknown building ${id}`);
  const sd = Math.abs(seed | 0);
  const lvl = id === 'hut' ? clamp(level | 0, 0, 2) : 0;
  const tr = FLOURISH.has(id) ? clamp(tier | 0, 0, 4) : 0;
  const c = new Ctx(id, lvl, sd & 3, (sd >> 2) & 1, tr);
  fn(c);
  if (tr > 0 && TIER_KITS[id]) addTier(c, TIER_KITS[id]);
  let h = HEIGHTS.get(c.key);
  if (h === undefined) {
    h = +new Box3().setFromObject(c.g).max.y.toFixed(3);
    HEIGHTS.set(c.key, h);
  }
  c.ud.height = h;
  c.g.userData = c.ud;
  c.g.name = id;
  return c.g;
}

// Note: stair (or ladder when steep) from the lower cell centre up to the next cell centre; local +z points uphill.
export function makeStairs(rise) {
  const r = Math.round(rise * 10) / 10;
  const geo = cached(`stairs|${r}`, () => {
    const b = new B();
    const steep = r > 1.7;
    if (!steep) {
      const n = Math.max(2, Math.round(r / 0.22));
      const run = 0.9 / n;
      for (let k = 0; k < n; k++) {
        const top = ((k + 1) * r) / n;
        b.box([0.56, 0.06, run + 0.04], [0, top - 0.06, 0.05 + k * run + run / 2], C.woodL);
        b.box([0.56, r / n, 0.04], [0, top - r / n, 0.05 + k * run], C.woodD);
      }
      for (const s of [-1, 1]) {
        b.beam([s * 0.3, 0, 0.0], [s * 0.3, r, 0.98], 0.05, C.woodDD);
        b.box([0.05, 0.4, 0.05], [s * 0.3, 0, 0.0], C.woodD);
        b.box([0.05, 0.4, 0.05], [s * 0.3, r, 0.98], C.woodD);
        b.beam([s * 0.3, 0.4, 0.0], [s * 0.3, r + 0.4, 0.98], 0.04, C.wood);
      }
    } else {
      const top = r + 0.35;
      for (const s of [-1, 1]) b.beam([s * 0.2, 0, 0.12], [s * 0.2, top, 0.85], 0.05, C.woodDD);
      const n = Math.floor(top / 0.27);
      for (let k = 1; k <= n; k++) {
        const t = (k * 0.27) / top;
        b.rod([-0.2, t * top, 0.12 + t * 0.73], [0.2, t * top, 0.12 + t * 0.73], 0.022, C.wood);
      }
    }
    return b.build();
  });
  const g = new Group();
  g.add(mesh(geo, MATS.vertex, true));
  g.userData = { height: r + 0.4, smoke: null, glow: null, glowColor: null, spin: null, update: null };
  g.name = 'stairs';
  return g;
}

// Note: scaffold, crates, piles.

export function makeScaffold(size = 2) {
  const geo = cached(`scaffold|${size}`, () => {
    const b = new B();
    const H = 1.2;
    const h = size / 2 - 0.1;
    const pts = [[-h, -h], [h, -h], [h, h], [-h, h]];
    pts.forEach(([x, z]) => b.box([0.07, H, 0.07], [x, 0, z], C.woodD));
    if (size > 1) for (const [x, z] of [[0, -h], [h, 0], [0, h], [-h, 0]]) b.box([0.06, H * 0.8, 0.06], [x, 0, z], C.wood);
    for (const y of [0.5, 1.1]) {
      pts.forEach(([x, z], i) => {
        const [nx, nz] = pts[(i + 1) % 4];
        b.beam([x, y, z], [nx, y, nz], 0.05, i % 2 ? C.woodL : C.wood);
      });
    }
    pts.forEach(([x, z], i) => {
      const [nx, nz] = pts[(i + 1) % 4];
      b.rod([x, 0.08, z], [nx, 0.55, nz], 0.022, C.woodL);
    });
    b.box([h * 1.2, 0.04, 0.26], [0, 0.5, h - 0.12], C.woodL);
    return b.build();
  });
  const g = new Group();
  g.add(mesh(geo));
  g.userData.height = 1.2;
  return g;
}

export function makeCrate(goodId) {
  const col = GOODS[goodId] ? GOODS[goodId].color : 0xcccccc;
  const gm = GOOD_MODELS[goodId];
  const geo = cached(`crate|${goodId}`, () => {
    const b = new B();
    if (gm) { gm.crate(b, C, col); return b.build(); }
    b.box([0.28, 0.26, 0.28], [0, 0, 0], C.wood, { sh: [0.9, 1.05] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.045, 0.3, 0.045], [sx * 0.125, 0, sz * 0.125], C.woodD);
    b.box([0.2, 0.05, 0.2], [0, 0.25, 0], col, { sh: [0.95, 1.1] });
    b.box([0.14, 0.09, 0.012], [0, 0.08, 0.146], C.cream);
    b.box([0.07, 0.06, 0.016], [0, 0.095, 0.149], col);
    return b.build();
  });
  const g = new Group();
  g.add(mesh(geo));
  return g;
}

// Note: heap slots [x, z, layer] for round items; 7 on the ground, 3 above, 2 on top.
const HEAP = (() => {
  const a = [[0, 0, 0]];
  for (let k = 0; k < 6; k++) a.push([Math.cos((k * PI) / 3) * 0.25, Math.sin((k * PI) / 3) * 0.25, 0]);
  for (const ang of [0.5, 2.6, 4.7]) a.push([Math.cos(ang) * 0.13, Math.sin(ang) * 0.13, 1]);
  a.push([0.04, 0.02, 2], [-0.05, -0.04, 2]);
  return a;
})();

function mix(a, bcol, t) { return new Color(a).lerp(new Color(bcol), t); }

function pileBuild(goodId, count) {
  const col = GOODS[goodId] ? GOODS[goodId].color : 0xcccccc;
  const b = new B();
  const r = rng(hashStr(goodId) + 7);
  const n = clamp(count | 0, 1, 12);
  const heap = (fn, h) => {
    for (let i = 0; i < n; i++) {
      const [x, z, layer] = HEAP[i];
      fn(x + (r() - 0.5) * 0.03, layer * h, z + (r() - 0.5) * 0.03, i);
    }
  };
  const stack = (cap, fn, h) => {
    for (let i = 0; i < n; i++) fn(i % cap, Math.floor(i / cap), i, h);
  };
  if (GOOD_MODELS[goodId]) { GOOD_MODELS[goodId].pile(b, n, C, col, r); return b.build(); }
  switch (goodId) {
    case 'wood': {
      const rows = [5, 4, 3];
      let i = 0;
      for (let row = 0; row < 3 && i < n; row++) {
        for (let k = 0; k < rows[row] && i < n; k++, i++) {
          const z = (k - (rows[row] - 1) / 2) * 0.14;
          const y = 0.065 + row * 0.12;
          const x0 = (r() - 0.5) * 0.05;
          const cf = (cx) => (Math.abs(cx - x0) > 0.277 ? 0xe2bd88 : (i % 2 ? C.woodD : C.wood));
          b.cyl(0.065, 0.065, 0.56, 5, [x0, y, z], C.wood, { c: true, r: [0, 0, PI / 2], cf });
        }
      }
      break;
    }
    case 'plank':
      stack(3, (j, layer, i) => {
        const along = layer % 2 === 0;
        const off = (j - 1) * 0.17;
        const col2 = i % 2 ? C.woodL : 0xdcb47c;
        b.box(along ? [0.62, 0.04, 0.15] : [0.15, 0.04, 0.62], along ? [0, layer * 0.042, off] : [off, layer * 0.042, 0], col2, { r: [0, (r() - 0.5) * 0.08, 0] });
      });
      break;
    case 'brick':
      stack(4, (j, layer, i) => {
        const x = (j % 2 ? 1 : -1) * 0.12 + (layer % 2) * 0.03;
        const z = (j < 2 ? -1 : 1) * 0.065;
        b.box([0.22, 0.075, 0.11], [x, layer * 0.077, z], i % 2 ? C.brick : C.brickD, { r: [0, (r() - 0.5) * 0.1, 0] });
      });
      break;
    case 'ingot':
      stack(3, (j, layer, i) => {
        const along = layer % 2 === 0;
        const off = (j - 1) * 0.12;
        b.box(along ? [0.3, 0.06, 0.1] : [0.1, 0.06, 0.3], along ? [0, layer * 0.062, off] : [off, layer * 0.062, 0], i % 2 ? C.metal : 0xc6cdd4, { sh: [0.9, 1.12] });
      });
      break;
    case 'cloth':
      stack(1, (j, layer, i) => {
        b.box([0.44, 0.05, 0.32], [(r() - 0.5) * 0.04, layer * 0.052, 0], i % 2 ? col : mix(col, 0xc8b0e0, 0.5), { r: [0, (r() - 0.5) * 0.25, 0] });
      });
      break;
    case 'stone':
      heap((x, y, z, i) => b.ico(0.1 + r() * 0.04, [x, y + 0.07, z], i % 2 ? col : 0xb2b7ba, { s: [1, 0.72, 1], j: 0.015, r: [0, i, 0] }), 0.1);
      break;
    case 'clay':
      heap((x, y, z, i) => b.ico(0.1, [x, y + 0.07, z], i % 2 ? col : 0xd6946a, { s: [1.1, 0.7, 1], j: 0.012, r: [0, i, 0] }), 0.1);
      break;
    case 'ore':
      heap((x, y, z, i) => b.ico(0.1 + r() * 0.03, [x, y + 0.07, z], i % 3 ? col : 0xc9a05a, { s: [1, 0.75, 1], j: 0.02, r: [0, i, 0] }), 0.1);
      break;
    case 'charcoal':
      heap((x, y, z, i) => b.ico(0.075, [x, y + 0.05, z], i % 2 ? col : 0x4a4543, { s: [1, 0.8, 1], j: 0.012, r: [0, i, 0] }), 0.07);
      break;
    case 'crystal':
      heap((x, y, z, i) => b.oct(0.07, [x, y + 0.1, z], i % 2 ? col : 0xbff4ff, { s: [0.7, 1.6, 0.7], r: [0.2 * ((i % 3) - 1), i, 0.15 * ((i % 2) - 0.5)], sh: [0.85, 1.15] }), 0.1);
      break;
    case 'fruit':
      heap((x, y, z, i) => b.ico(0.075, [x, y + 0.07, z], i % 3 ? col : 0xf08a50, { j: 0.004, r: [0, i, 0] }), 0.1);
      break;
    case 'fish':
      heap((x, y, z, i) => {
        b.oct(0.13, [x, y + 0.04, z], i % 2 ? col : 0x9ccbe6, { s: [1, 0.3, 0.38], r: [0, i * 1.3, 0] });
        const a = i * 1.3;
        b.oct(0.05, [x - Math.cos(a) * 0.14, y + 0.04, z + Math.sin(a) * 0.14], col, { s: [0.7, 0.3, 1.2], r: [0, a, 0] });
      }, 0.07);
      break;
    case 'smoked':
      heap((x, y, z, i) => {
        b.oct(0.13, [x, y + 0.04, z], i % 2 ? col : 0xb86f3c, { s: [1, 0.3, 0.38], r: [0, i * 1.3, 0] });
      }, 0.07);
      break;
    case 'fiber':
      heap((x, y, z, i) => {
        b.cyl(0.05, 0.05, 0.3, 5, [x, y + 0.05, z], col, { c: true, r: [0, i * 1.1, PI / 2], sh: [0.9, 1.1] });
        b.cyl(0.056, 0.056, 0.04, 5, [x, y + 0.05, z], C.rope, { c: true, r: [0, i * 1.1, PI / 2] });
      }, 0.08);
      break;
    case 'wheat':
    case 'flour':
      heap((x, y, z, i) => {
        const sc = mix(0xe8dcc0, col, goodId === 'wheat' ? 0.4 : 0.15);
        b.ico(0.11, [x, y + 0.09, z], sc, { s: [1, 0.95, 0.85], j: 0.01, r: [0, i, 0] });
        b.cone(0.045, 0.06, 4, [x, y + 0.18, z], mix(sc, 0x8a6a40, 0.3));
      }, 0.15);
      break;
    case 'egg':
      heap((x, y, z, i) => b.ico(0.055, [x, y + 0.05, z], i % 3 ? col : 0xe8c88a, { s: [0.85, 1.1, 0.85], r: [0, i, 0.4 * (i % 3)], j: 0.004 }), 0.075);
      break;
    case 'wool':
      heap((x, y, z, i) => b.ico(0.12, [x, y + 0.09, z], i % 2 ? col : 0xe6e1d4, { s: [1, 0.8, 1], j: 0.025, r: [0, i, 0] }), 0.12);
      break;
    case 'bread':
      heap((x, y, z, i) => b.ico(1, [x, y + 0.06, z], i % 2 ? col : 0xe0a85a, { s: [0.13, 0.065, 0.08], r: [0, i * 1.7, 0], sh: [0.9, 1.2], j: 0.004 }), 0.09);
      break;
    case 'rope':
      heap((x, y, z, i) => b.cyl(0.1, 0.095, 0.07, 6, [x, y, z], i % 2 ? col : 0xcfb77f, { r: [0, i, 0] }), 0.07);
      break;
    case 'tool':
      heap((x, y, z, i) => {
        const a = i * 1.2;
        b.rod([x - Math.cos(a) * 0.15, y + 0.03, z + Math.sin(a) * 0.15], [x + Math.cos(a) * 0.15, y + 0.03, z - Math.sin(a) * 0.15], 0.018, C.woodD, { seg: 4 });
        b.box([0.1, 0.05, 0.05], [x + Math.cos(a) * 0.13, y + 0.01, z - Math.sin(a) * 0.13], col, { r: [0, a, 0] });
      }, 0.06);
      break;
    case 'gear':
      heap((x, y, z, i) => b.cyl(0.09, 0.09, 0.04, 8, [x, y, z], i % 2 ? col : 0xe6b64c, { r: [0, i, 0], sh: [0.9, 1.1] }), 0.045);
      break;
    case 'lamp':
      heap((x, y, z, i) => {
        b.ico(0.065, [x, y + 0.07, z], i % 2 ? col : 0xffc66a, { v: 0.06 });
        b.cone(0.045, 0.04, 4, [x, y + 0.12, z], C.metalD);
      }, 0.13);
      break;
    default:
      heap((x, y, z, i) => b.box([0.12, 0.1, 0.12], [x, y, z], col, { r: [0, i, 0] }), 0.1);
  }
  return b.build();
}

export function makePile(goodId, count = 1) {
  const n = clamp(count | 0, 1, 12);
  const geo = cached(`pile|${goodId}|${n}`, () => pileBuild(goodId, n));
  const g = new Group();
  g.add(mesh(geo));
  return g;
}

// Note: airships, spire pieces and memorials of the endgame content.

const AIRSHIP_CACHE = new Map();

function airshipParts(kind) {
  const kit = SHIP_MODELS[kind];
  if (!kit) throw new Error(`makeAirship: unknown kind ${kind}`);
  let p = AIRSHIP_CACHE.get(kind);
  if (!p) {
    p = kit(B, C);
    for (const k of ['body', 'glow']) p[k].userData.shared = true;
    p.flag.geo.userData.shared = true;
    p.prop.geo.userData.shared = true;
    AIRSHIP_CACHE.set(kind, p);
  }
  return p;
}

// Note: airship group, bow +z, y 0 gondola floor; userData has height, lamps, slots (Vector3 lists), prop, flag and update(time, wind).
export function makeAirship(kind) {
  const p = airshipParts(kind);
  const g = new Group();
  g.add(mesh(p.body));
  g.add(mesh(p.glow, MATS.glow, false));
  const flag = mesh(p.flag.geo, MATS.vertexDouble);
  flag.position.set(...p.flag.pos);
  g.add(flag);
  const prop = mesh(p.prop.geo, MATS.vertex, false);
  prop.position.set(...p.prop.pos);
  g.add(prop);
  const v3 = (a) => new Vector3(a[0], a[1], a[2]);
  g.userData = {
    height: p.height, kind, flag, prop, lamps: p.lamps.map(v3), slots: p.slots.map(v3),
    update: (time, wind) => {
      flag.rotation.y = Math.sin(time * 3 + 1.3) * (0.15 + wind * 0.5) - 0.1;
      prop.rotation.z = time * (14 + wind * 8);
    },
  };
  g.name = `airship-${kind}`;
  return g;
}

export const AIRSHIP_MODEL_KINDS = Object.keys(SHIP_MODELS);
export const SPIRE_STAGE_COUNT = SPIRE.stages;
export const SPIRE_HEIGHT = SPIRE.height;
export { DEED_INDEX };

// Note: one spire piece in greatwork building-local coordinates; 0 foundation and shaft, 1..6 rare goods, 7 crown.
export function makeSpireStage(stage) {
  const k = clamp(stage | 0, 0, SPIRE.stages - 1);
  const parts = cached(`spire|${k}`, () => {
    const r = SPIRE.buildStage(k, B, C);
    r.body.userData.shared = true;
    r.glow.userData.shared = true;
    return { geo: r.body, glow: r.glow };
  });
  const g = new Group();
  g.add(mesh(parts.geo));
  g.add(mesh(parts.glow, MATS.glow, false));
  g.name = `spire${k}`;
  return g;
}

// Note: pieces 1..6 by gw.stage[k] (never by count) plus the crown 7 when lit; add it as a child of the greatwork building group.
export function makeSpirePieces(stage, lit) {
  const g = new Group();
  for (let k = 1; k <= 6; k++) if (stage && stage[k]) g.add(makeSpireStage(k));
  if (lit) g.add(makeSpireStage(7));
  g.name = 'spirepieces';
  return g;
}

// Note: deed memorial building; kind is bridge, master, parent or hero.
export function makeMemorial(kind) {
  const i = DEED_INDEX[kind];
  if (i === undefined) throw new Error(`makeMemorial: unknown deed ${kind}`);
  return makeBuilding('memorial', 0, i);
}

// Note: relics and memorials.

export function makeRelic(knowledgeId) {
  const id = String(knowledgeId);
  const h = hashStr(id);
  const accent = new Color().setHSL((h % 360) / 360, 0.6, 0.72, SRGBColorSpace);
  const main = cached(`relic|${id}`, () => {
    const b = new B();
    const r = rng(h);
    b.dome(0.68, 0.14, 9, [0, -0.04, 0], C.mossD, { rings: 2, sh: [0.9, 1.05] });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r() * 0.5;
      const hh = 0.5 + r() * 0.35;
      const x = Math.cos(a) * 0.43, z = Math.sin(a) * 0.43;
      b.box([0.2 + r() * 0.05, hh, 0.13], [x, 0.0, z], k % 2 ? C.stone : 0xb9bcb6, { r: [(r() - 0.5) * 0.15, -a + PI / 2, (r() - 0.5) * 0.15], j: 0.012, sh: [0.85, 1.08] });
      b.ico(0.11, [x, hh + 0.01, z], C.moss, { s: [1.0, 0.35, 0.8], j: 0.01 });
    }
    b.box([0.34, 1.05, 0.17], [0, 0.0, 0.0], 0xa8aca6, { r: [0, 0, 0.03], sh: [0.85, 1.08], j: 0.008 });
    b.ico(0.17, [0.0, 1.06, 0.0], C.moss, { s: [1.1, 0.4, 0.8], j: 0.012 });
    b.ico(0.1, [-0.08, 0.1, 0.1], C.moss, { s: [1.3, 0.5, 1], j: 0.01 });
    b.box([0.15, 0.45, 0.15], [-0.5, 0, 0.2], C.stone, { j: 0.01 });
    b.box([0.15, 0.45, 0.15], [-0.25, 0, 0.5], C.stoneD, { j: 0.01 });
    b.box([0.5, 0.1, 0.14], [-0.375, 0.45, 0.35], 0xb9bcb6, { r: [0, 1.0, 0.04], j: 0.008 });
    b.ico(0.07, [-0.37, 0.57, 0.34], C.moss, { s: [1.5, 0.4, 0.9] });
    b.ico(0.11, [0.45, 0.05, 0.25], C.mossD, { s: [1, 0.5, 1] });
    return b.build();
  });
  const glyph = cached(`relicglow|${id}`, () => {
    const b = new B();
    const gz = 0.09;
    b.torus(0.085, 0.014, [0, 0.72, gz], accent, { rs: 3, ts: 8, v: 0 });
    b.box([0.024, 0.34, 0.016], [0, 0.55, gz], accent, { v: 0 });
    b.box([0.2, 0.024, 0.016], [0, 0.4, gz], accent, { v: 0 });
    const kind = h % 3;
    if (kind === 0) b.box([0.024, 0.16, 0.016], [0.08, 0.72, gz], accent, { r: [0, 0, 0.8], v: 0 });
    else if (kind === 1) b.oct(0.03, [0, 0.72, gz], accent, { v: 0 });
    else b.box([0.15, 0.024, 0.016], [0, 0.72, gz], accent, { v: 0 });
    b.oct(0.025, [0, 0.28, gz], accent, { v: 0 });
    return b.build();
  });
  const g = new Group();
  g.add(mesh(main));
  g.add(mesh(glyph, MATS.glow, false));
  g.userData = { height: 1.2, accent: accent.getHex(), glow: new Vector3(0, 0.7, 0.2), glowColor: accent.getHex() };
  return g;
}

export function makeMemorialLantern() {
  const main = cached('memlantern', () => {
    const b = new B();
    b.box([0.3, 0.07, 0.3], [0, 0, 0], C.stoneD);
    b.cyl(0.075, 0.055, 0.2, 6, [0, 0.07, 0], C.stone, { sh: [0.9, 1.05] });
    b.box([0.2, 0.035, 0.2], [0, 0.27, 0], C.stoneL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.025, 0.14, 0.025], [sx * 0.07, 0.305, sz * 0.07], C.stoneD);
    b.cone(0.17, 0.11, 4, [0, 0.44, 0], C.stone, { r: [0, PI / 4, 0] });
    b.ico(0.03, [0, 0.56, 0], C.stoneL);
    return b.build();
  });
  const glow = cached('memlanternglow', () => new B().box([0.11, 0.12, 0.11], [0, 0.31, 0], C.lampWarm, { v: 0 }).build());
  const g = new Group();
  g.add(mesh(main));
  g.add(mesh(glow, MATS.glow, false));
  g.userData = { height: 0.58, glow: new Vector3(0, 0.37, 0), glowColor: 0xffd48a };
  return g;
}

export function makeMemorialTree() {
  const geo = cached('memtree', () => {
    const b = new B();
    b.cyl(0.06, 0.035, 0.5, 5, [0, 0, 0], 0x8a6a52, { open: true });
    b.rod([0, 0.35, 0], [0.18, 0.62, 0.05], 0.02, 0x8a6a52, { seg: 3 });
    b.rod([0, 0.4, 0], [-0.15, 0.58, -0.08], 0.02, 0x8a6a52, { seg: 3 });
    b.ico(0.25, [0, 0.78, 0], 0xf6b8cc, { s: [1.1, 0.85, 1.1], j: 0.025, sh: [0.9, 1.08] });
    b.ico(0.18, [0.2, 0.64, 0.08], 0xf9cfda, { j: 0.02 });
    b.ico(0.17, [-0.18, 0.62, -0.1], 0xf3a9c0, { j: 0.02 });
    b.ico(0.14, [0.02, 0.93, 0.02], 0xfbd8e2, { j: 0.015 });
    const dots = [[0.2, 0.86, 0.1], [-0.18, 0.8, 0.14], [0.05, 1.0, -0.16], [0.28, 0.66, -0.05], [-0.3, 0.64, 0.0]];
    dots.forEach((p, i) => b.oct(0.032, p, 0xffffff, { r: [0, i, 0] }));
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.4;
      b.oct(0.03, [Math.cos(a) * 0.22, 0.01, Math.sin(a) * 0.22], 0xf6b8cc, { s: [1.3, 0.2, 1], r: [0, a, 0] });
    }
    return b.build();
  });
  const g = new Group();
  g.add(mesh(geo));
  g.userData = { height: 1.05 };
  return g;
}

// Note: links.

function pathOf(pts) {
  const P = pts.map((p) => new Vector3(p.x, p.y, p.z));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  return { P, cum, len: cum[cum.length - 1] };
}

class Sampler {
  constructor(path) {
    this.path = path;
    this.p = new Vector3(); this.t = new Vector3(); this.r = new Vector3(); this.u = new Vector3();
    this.q = new Quaternion();
    this._m = new Matrix4();
  }

  at(s) {
    const { P, cum, len } = this.path;
    s = clamp(s, 0, len);
    let i = 1;
    while (i < P.length - 1 && cum[i] < s) i++;
    const a = P[i - 1], b = P[i];
    const seg = cum[i] - cum[i - 1];
    this.p.lerpVectors(a, b, seg > 1e-9 ? (s - cum[i - 1]) / seg : 0);
    this.t.subVectors(b, a);
    if (this.t.lengthSq() < 1e-12) this.t.set(0, 0, 1);
    this.t.normalize();
    this.r.crossVectors(UP, this.t);
    if (this.r.lengthSq() < 1e-8) this.r.set(1, 0, 0);
    this.r.normalize();
    this.u.crossVectors(this.t, this.r).normalize();
    this._m.makeBasis(this.r, this.u, this.t);
    this.q.setFromRotationMatrix(this._m);
    return this;
  }
}

function ropeBridgeGeo(pts, progress, tier = 0) {
  const path = pathOf(pts);
  const end = path.len * progress;
  const S = new Sampler(path);
  const b = new B();
  let i = 0;
  // Note: tier 2+ swaps the raw deck boards for planed ones (paler, even), same size and height.
  const planed = tier >= 2;
  for (let s = 0.12; s <= end + 1e-6; s += 0.3, i++) {
    S.at(s);
    b.add(pBox(), planed ? (i % 2 ? 0xf3dfb6 : 0xe8cc98) : (i % 2 ? C.woodL : C.wood), {
      p: S.p.clone().addScaledVector(S.u, -0.03), q: S.q.clone(), s: [0.66, 0.05, 0.22], c: true, sh: [0.95, 1.05], v: planed ? 0.02 : 0.05,
    });
  }
  const lines = [[-0.33, -0.05, C.woodDD, 0.026], [0.33, -0.05, C.woodDD, 0.026], [-0.4, 0.55, C.rope, 0.02], [0.4, 0.55, C.rope, 0.02]];
  const store = lines.map(() => []);
  const samples = [];
  for (let s = 0; s < end; s += 0.5) samples.push(s);
  samples.push(end);
  samples.forEach((s, k) => {
    S.at(s);
    lines.forEach(([off, up], li) => {
      store[li].push(S.p.clone().addScaledVector(S.r, off).addScaledVector(S.u, up));
    });
    if (k % 3 === 0) {
      for (const [a, c2] of [[0, 2], [1, 3]]) b.rod(store[a][k], store[c2][k], 0.014, C.rope, { seg: 3 });
    }
  });
  store.forEach((pl, li) => {
    for (let k = 1; k < pl.length; k++) b.rod(pl[k - 1], pl[k], lines[li][3], lines[li][2], { seg: 4 });
  });
  const post = (s) => {
    S.at(s);
    for (const sx of [-1, 1]) {
      const base = S.p.clone().addScaledVector(S.r, sx * 0.4);
      b.box([0.09, 0.85, 0.09], [base.x, base.y - 0.08, base.z], C.woodD);
      b.ico(0.055, [base.x, base.y + 0.8, base.z], C.woodDD);
    }
  };
  post(0);
  if (progress >= 0.999) post(path.len);
  return b.build();
}

function vineGeo(pts, progress) {
  const path = pathOf(pts);
  const end = path.len * progress;
  const S = new Sampler(path);
  const b = new B();
  const r = rng(777);
  const greens = [0x5fa55a, 0x72b560, 0x4f9552, 0x86c26a];
  let i = 0;
  for (let s = 0.1; s <= end + 1e-6; s += 0.28, i++) {
    S.at(s);
    const roll = (i % 2 ? 1 : -1) * 0.18;
    const q = S.q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll));
    b.add(pBox(), greens[i % 3], { p: S.p.clone().addScaledVector(S.u, -0.05), q, s: [0.55, 0.035, 0.2], c: true, sh: [0.9, 1.05], v: 0.06 });
  }
  const strand = (off, radius, phase, omega, thick, col, lift) => {
    let prev = null;
    const list = [];
    for (let s = 0; s < end; s += 0.22) list.push(s);
    list.push(end);
    for (const s of list) {
      S.at(s);
      const a = s * omega + phase;
      const p = S.p.clone().addScaledVector(S.r, off + Math.cos(a) * radius).addScaledVector(S.u, lift + Math.sin(a) * radius);
      if (prev) b.rod(prev, p, thick, col, { seg: 4 });
      prev = p;
    }
  };
  if (end > 0.01) {
    strand(0, 0.13, 0, 4.2, 0.07, greens[0], -0.02);
    strand(0, 0.13, PI, 4.2, 0.07, greens[1], -0.02);
    strand(0.42, 0.05, 0, 3, 0.055, greens[2], 0.55);
    strand(-0.42, 0.05, 2, 3, 0.055, greens[3], 0.55);
  }
  for (let s = 0.4; s < end; s += 0.9) {
    S.at(s);
    for (const sx of [-1, 1]) {
      const a = S.p.clone().addScaledVector(S.r, sx * 0.3).addScaledVector(S.u, 0.0);
      const c2 = S.p.clone().addScaledVector(S.r, sx * 0.42).addScaledVector(S.u, 0.55);
      b.rod(a, c2, 0.022, 0x5a9a50, { seg: 3 });
    }
  }
  const flowers = [0xf6b8cc, 0xffffff, 0xffe08a];
  for (let s = 0.2; s < end; s += 0.33) {
    S.at(s);
    const sx = r() < 0.5 ? -1 : 1;
    const base = S.p.clone().addScaledVector(S.r, sx * (0.38 + r() * 0.1)).addScaledVector(S.u, 0.52 + r() * 0.1);
    b.oct(0.06, base, [0x7fc468, 0x95d47a, 0x6fb860][Math.floor(r() * 3)], { s: [1.5, 0.35, 1], r: [0, r() * TAU, 0.3], v: 0.06 });
    if (r() < 0.35) b.oct(0.035, base.clone().addScaledVector(S.u, 0.06), flowers[Math.floor(r() * 3)], { r: [0, r() * 3, 0] });
  }
  if (end > 0.05) {
    S.at(0);
    b.ico(0.14, S.p.clone().addScaledVector(S.u, 0.05), greens[0], { s: [1.1, 0.8, 1.1], j: 0.02 });
    if (progress >= 0.999) {
      S.at(path.len);
      b.ico(0.14, S.p.clone().addScaledVector(S.u, 0.05), greens[1], { s: [1.1, 0.8, 1.1], j: 0.02 });
    }
  }
  return b.build();
}

// Note: link tiers (T1..T4, cumulative). Tier parts are separate meshes: wood (lit by the sun), cloth (double sided), glow (self-lit).
const BRASS = 0xd1a248;
const BRASS_D = 0xa8803a;
const STONE_COL = [0xc4c7c4, 0xa4a8a9];
const BULB_COLS = [0xffd88a, 0xffb4a0, 0xc4ecaa, 0xa8d8ff];
const CABLE_RISE = 2.02; // Attention: mirrors linkPoints (cablecar lifts the end points 1.9 + 0.12 above ground).

const vertsGeo = (list) => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(list.flat()), 3));
  return g;
};
// Note: tetra bulb (4 tris, radius 1), flag triangle (plane x = 0, rope along z, hangs to -y), pennant (plane z = 0, points to +x).
const pTet = () => protoOf('tet', () => {
  const v = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((a) => a.map((x) => x / Math.sqrt(3)));
  return vertsGeo([2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1].map((k) => v[k]));
});
const pFlagZ = () => protoOf('flagz', () => vertsGeo([[0, 0, -0.5], [0, 0, 0.5], [0, -1, 0]]));
const pPennant = () => protoOf('pennant', () => vertsGeo([[0, 0.5, 0], [0, -0.5, 0], [1, 0, 0]]));

const Q45 = new Quaternion().setFromAxisAngle(UP, PI / 4);

// Note: per-call tier parts of a rope bridge; returns meshes data plus light points and the bench spot.
function ropeTierParts(pts, tier, benchEnd) {
  const path = pathOf(pts);
  const S = new Sampler(path);
  const len = path.len;
  const wood = new B(), cloth = new B(), glow = new B();
  const F = (s) => {
    S.at(s);
    return { p: S.p.clone(), r: S.r.clone(), u: S.u.clone(), t: S.t.clone(), q: S.q.clone() };
  };
  const ends = [F(0), F(len)];
  ends.forEach((e, k) => {
    e.inn = new Vector3(k ? e.t.x : -e.t.x, 0, k ? e.t.z : -e.t.z);
    if (e.inn.lengthSq() < 1e-8) e.inn.set(0, 0, k ? 1 : -1);
    e.inn.normalize();
    e.yaw = Math.atan2(e.t.x, e.t.z);
    e.sx = k ? -1 : 1;
    // Note: ground point beside the end, lateral lat (+ along r), inw metres inland.
    e.at = (lat, inw) => e.p.clone().addScaledVector(e.r, lat).addScaledVector(e.inn, inw);
  });
  const lamps = [];
  let bench = null;
  // Note: T1: lantern post beside each end, tied to the rail post. Posts sink 0.45 so slopes never leave them floating.
  if (tier >= 1) {
    ends.forEach((e) => {
      const o = e.at(e.sx * 0.56, 0.3);
      const y0 = e.p.y;
      wood.box([0.07, 1.25, 0.07], [o.x, y0 - 0.45, o.z], C.woodD);
      wood.box([0.15, 0.03, 0.15], [o.x, y0 + 0.78, o.z], C.woodDD);
      glow.box([0.1, 0.12, 0.1], [o.x, y0 + 0.8, o.z], C.lampWarm, { v: 0 });
      wood.cone(0.1, 0.08, 4, [o.x, y0 + 0.91, o.z], C.woodDD, { open: true, r: [0, PI / 4, 0] });
      const rp = e.at(e.sx * 0.4, 0);
      wood.rod([rp.x, y0 + 0.45, rp.z], [o.x, y0 + 0.45, o.z], 0.022, C.woodDD, { seg: 3 });
      lamps.push(new Vector3(o.x, y0 + 0.86, o.z));
    });
  }
  // Note: T2: bunting hangs from both hand ropes (the +-0.4 line, 0.55 up).
  if (tier >= 2) {
    for (const sx of [-1, 1]) {
      let j = 0;
      for (let s = 0.9; s < len - 0.9; s += 0.8, j++) {
        const f = F(s);
        const p = f.p.addScaledVector(f.r, sx * 0.4).addScaledVector(f.u, 0.55);
        cloth.add(pFlagZ(), FLAG_COLS[(j + (sx > 0 ? 1 : 0)) % 4], { p, q: f.q, s: [1, 0.2, 0.3], v: 0.03 });
      }
    }
  }
  // Note: T3: stone pillars on both sides of each end (outside the rail posts) and a bench at one end.
  if (tier >= 3) {
    ends.forEach((e) => {
      const y0 = e.p.y;
      for (const sx of [-1, 1]) {
        const o = e.at(sx * 0.62, 0.05);
        wood.box([0.28, 1.12, 0.28], [o.x, y0 - 0.5, o.z], STONE_COL[0], { r: [0, e.yaw, 0], sh: [0.88, 1] });
        wood.box([0.34, 0.07, 0.34], [o.x, y0 + 0.6, o.z], STONE_COL[1], { r: [0, e.yaw, 0] });
        const a = e.at(sx * 0.4, 0);
        const c2 = e.at(sx * 0.56, 0.05);
        wood.rod([a.x, y0 + 0.5, a.z], [c2.x, y0 + 0.5, c2.z], 0.02, C.rope, { seg: 3 });
      }
    });
    const e = ends[benchEnd ? 1 : 0];
    const sd = -e.sx;
    const o = e.at(sd * 1.0, 0.9);
    const y0 = e.p.y;
    wood.group({ p: [o.x, y0, o.z], r: [0, e.yaw, 0] }, () => {
      for (const z of [-0.3, 0.3]) wood.box([0.22, 0.61, 0.05], [0, -0.45, z], C.woodD);
      wood.box([0.26, 0.04, 0.72], [0, 0.14, 0], C.woodL);
      wood.box([0.04, 0.24, 0.72], [sd * 0.11, 0.17, 0], C.wood);
    });
    const fx = -sd * e.r.x, fz = -sd * e.r.z;
    bench = { x: o.x, y: y0 + 0.18, z: o.z, yaw: Math.atan2(fx, fz), end: benchEnd ? 1 : 0 };
  }
  // Note: T4: brass lamps and flower boxes on the rails, string lights on both hand ropes.
  if (tier >= 4) {
    const N = clamp(Math.round((len - 2.5) / 1.6), 0, 12);
    const fix = [];
    let nl = 0, nf = 0;
    for (let i = 0; i < N; i++) {
      const s = (len * (i + 0.5)) / N;
      if (i % 2 === 0) fix.push({ s, sx: nl++ % 2 ? -1 : 1, lamp: true });
      else fix.push({ s, sx: nf++ % 2 ? 1 : -1, lamp: false });
    }
    const flowers = [0xe8688a, 0xf0c64a, 0xffffff];
    fix.forEach((fx, k) => {
      const f = F(fx.s);
      const at = (lat, up) => f.p.clone().addScaledVector(f.r, fx.sx * lat).addScaledVector(f.u, up);
      if (fx.lamp) {
        wood.rod(at(0.37, -0.05), at(0.43, 0.66), 0.018, BRASS_D, { seg: 4 });
        glow.add(pBox(), C.lampWarm, { p: at(0.43, 0.64), q: f.q, s: [0.08, 0.1, 0.08], v: 0 });
        wood.cone(0.075, 0.07, 4, at(0.43, 0.73), BRASS, { open: true, q: f.q.clone().multiply(Q45) });
      } else {
        wood.add(pBox(), C.woodD, { p: at(0.45, 0.14), q: f.q, s: [0.14, 0.12, 0.55], sh: [0.92, 1.05] });
        wood.oct(0.1, at(0.45, 0.28), C.leaf, { q: f.q, s: [0.9, 0.55, 2.4] });
        wood.oct(0.045, at(0.45, 0.35), flowers[k % 3], { q: f.q });
        for (const d of [-0.18, 0.18]) {
          const h = F(fx.s + d);
          const top = h.p.clone().addScaledVector(h.r, fx.sx * 0.4).addScaledVector(h.u, 0.55);
          const low = h.p.clone().addScaledVector(h.r, fx.sx * 0.43).addScaledVector(h.u, 0.25);
          wood.rod(top, low, 0.012, C.rope, { seg: 3 });
        }
      }
    });
    for (const sx of [-1, 1]) {
      let j = 0;
      for (let s = 1.3; s < len - 1.2; s += 1.7, j++) {
        if (fix.some((q) => q.sx === sx && Math.abs(q.s - s) < 0.6)) continue;
        const f = F(s);
        const p = f.p.addScaledVector(f.r, sx * 0.4).addScaledVector(f.u, 0.525);
        glow.add(pTet(), BULB_COLS[(j + (sx > 0 ? 2 : 0)) % 4], { p, q: f.q, s: 0.05, v: 0 });
      }
    }
  }
  return { wood: wood.build(), cloth: cloth.build(), glow: glow.build(), lamps, bench };
}

function addRopeTier(g, pts, tier, benchEnd) {
  const t = ropeTierParts(pts, tier, benchEnd);
  g.add(mesh(t.wood));
  if (t.cloth.attributes.position.count) g.add(mesh(t.cloth, MATS.vertexDouble));
  g.add(mesh(t.glow, MATS.glow, false));
  g.userData.lamps = t.lamps;
  if (t.bench) g.userData.bench = t.bench;
}

function linkDockGeo() {
  return cached('linkdock', () => {
    const b = new B();
    for (let k = 0; k < 4; k++) b.box([0.28, 0.1, 1.2], [-0.42 + k * 0.28, 0, 0], k % 2 ? C.woodL : C.wood, { sh: [0.95, 1.05] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.08, 0.8, 0.08], [sx * 0.52, -0.6, sz * 0.52], C.woodD);
    for (const sx of [-1, 1]) {
      b.box([0.08, 0.5, 0.08], [sx * 0.55, 0.0, -0.55], C.woodD);
      b.rod([sx * 0.55, 0.4, -0.55], [sx * 0.55, 0.4, 0.45], 0.02, C.rope, { seg: 3 });
    }
    b.rod([-0.55, 0.4, -0.55], [0.55, 0.4, -0.55], 0.02, C.rope, { seg: 3 });
    b.cyl(0.07, 0.06, 0.34, 6, [0.0, 0.1, -0.3], C.woodDD);
    b.torus(0.08, 0.03, [0.3, 0.13, 0.1], C.rope, { r: [PI / 2, 0, 0], rs: 3, ts: 7 });
    b.box([0.2, 0.18, 0.2], [-0.3, 0.1, 0.05], C.woodL, { r: [0, 0.4, 0] });
    return b.build();
  });
}

// Note: balloon core; tier 2+ only recolours the envelope (bolder stripes, gold crown), so tiers 0 and 1 keep the original geometry.
function balloonCore(b, tier) {
  const stripes = tier >= 2 ? [0xe0614f, 0xf7ecd2, 0x4f8fc9, 0xf7ecd2] : [0xe9806d, 0xf7ecd2, 0xf2c14e, 0xf7ecd2];
  const cf = (cx, cy, cz) => {
    if (tier >= 2 && cy > 2.1) return GOLD;
    return stripes[((Math.floor(((Math.atan2(cx, cz) + PI) / TAU) * 8) % 4) + 4) % 4];
  };
  b.sph(0.72, [0, 1.58, 0], 0xffffff, { ws: 8, hs: 5, cf, sh: [0.9, 1.08], v: 0.02 });
  b.add(pCyl(8, 3.0, true), 0xffffff, { p: [0, 0.62, 0], s: [0.24, 0.42, 0.24], cf, v: 0.02, r: [0, 0, 0] });
  b.box([0.36, 0.24, 0.36], [0, 0, 0], 0xc99a62, { sh: [0.88, 1.08] });
  b.box([0.4, 0.04, 0.4], [0, 0.22, 0], C.woodD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * 0.17, 0.24, sz * 0.17], [sx * 0.2, 0.64, sz * 0.2], 0.01, C.rope, { seg: 3 });
  b.cyl(0.04, 0.03, 0.12, 5, [0, 0.3, 0], C.metalD);
  b.cone(0.05, 0.12, 5, [0, 0.4, 0], 0xff9a3c);
}

function balloonGeo() {
  return cached('balloon', () => {
    const b = new B();
    balloonCore(b, 0);
    return b.build();
  });
}

// Note: tiered balloon parts {body, glow, pennant}; cached per tier, shared geometry.
// Note: T1 rim lantern, T2 striped envelope + mast pennant, T3 wicker + brass burner + gold trim, T4 emblems + tassels + rim bulbs.
function balloonTierParts(tier) {
  return cached(`balloon|t${tier}`, () => {
    const b = new B();
    balloonCore(b, tier);
    const gl = new B();
    b.box([0.03, 0.2, 0.03], [0.15, 0.24, 0], C.woodDD);
    gl.box([0.07, 0.08, 0.07], [0.15, 0.42, 0], C.lampWarm, { v: 0 });
    b.cone(0.06, 0.05, 4, [0.15, 0.49, 0], C.woodDD, { open: true, r: [0, PI / 4, 0] });
    if (tier >= 2) {
      b.rod([0, 2.26, 0], [0, 2.6, 0], 0.012, C.woodDD, { seg: 3 });
      b.oct(0.03, [0, 2.62, 0], GOLD);
    }
    if (tier >= 3) {
      for (const y of [0.04, 0.15]) b.box([0.375, 0.03, 0.375], [0, y, 0], 0xa87a4a, { v: 0.02 });
      b.cyl(0.06, 0.06, 0.07, 6, [0, 0.255, 0], BRASS, { open: true });
      b.cyl(0.07, 0.055, 0.04, 6, [0, 0.4, 0], BRASS, { open: true });
      for (const [a, c2] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
        b.rod([a[0] * 0.19, 0.266, a[1] * 0.19], [c2[0] * 0.19, 0.266, c2[1] * 0.19], 0.012, GOLD, { seg: 3 });
      }
      b.torus(0.245, 0.014, [0, 0.625, 0], GOLD, { rs: 3, ts: 8, r: [PI / 2, 0, 0], v: 0 });
    }
    if (tier >= 4) {
      for (const a of [67.5, 247.5]) {
        const ph = (a * PI) / 180;
        const nx = -Math.cos(ph), nz = Math.sin(ph);
        b.oct(0.1, [nx * 0.645, 1.58, nz * 0.645], GOLD, { s: [1, 1.5, 0.35], r: [0, Math.atan2(nx, nz), 0], v: 0.02 });
      }
      for (let k = 0; k < 4; k++) {
        const a = (k * PI) / 2;
        b.cyl(0.012, 0.035, 0.11, 3, [Math.sin(a) * 0.24, 0.53, Math.cos(a) * 0.24], GOLD, { open: true });
      }
      const cols = [0xffd88a, 0xffb4a0, 0xc4ecaa, 0xa8d8ff];
      let n = 0;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const d of [-0.09, 0.09]) {
          const x = ax ? ax * 0.19 : d, z = az ? az * 0.19 : d;
          gl.add(pTet(), cols[n++ % 4], { p: [x, 0.285, z], s: 0.032, v: 0 });
        }
      }
    }
    const body = b.build();
    const glow = gl.build();
    body.userData.shared = true;
    glow.userData.shared = true;
    let pen = null;
    if (tier >= 2) {
      const pb = new B();
      pb.add(pPennant(), tier >= 3 ? GOLD : 0xe0614f, { s: [0.34, 0.15, 1], v: 0.02 });
      pen = pb.build();
      pen.userData.shared = true;
    }
    return { body, glow, pen };
  });
}

export function makeBalloon(tier = 0) {
  const g = new Group();
  const t = clamp(tier | 0, 0, 4);
  if (t <= 0) { g.add(mesh(balloonGeo())); return g; }
  const p = balloonTierParts(t);
  g.add(mesh(p.body));
  g.add(mesh(p.glow, MATS.glow, false));
  if (p.pen) {
    const flag = mesh(p.pen, MATS.vertexDouble);
    flag.position.set(0, 2.54, 0);
    g.add(flag);
    // Note: the pennant streams with the wind.
    g.userData.update = (time, wind) => { flag.rotation.y = Math.sin(time * 3 + 1.3) * (0.15 + wind * 0.5) - 0.1; };
  }
  return g;
}

function pylonGeo() {
  return cached('pylon', () => {
    const b = new B();
    const H = 2.3;
    b.box([0.95, 0.12, 0.95], [0, -0.07, 0], C.stoneD);
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    cs.forEach(([sx, sz]) => b.beam([sx * 0.38, 0, sz * 0.38], [sx * 0.17, H, sz * 0.17], 0.08, C.wood));
    const off = (y) => 0.38 - (0.21 * y) / H;
    for (const y of [0.8, 1.55]) {
      cs.forEach(([sx, sz], i) => {
        const [nx, nz] = cs[(i + 1) % 4];
        b.beam([sx * off(y), y, sz * off(y)], [nx * off(y), y, nz * off(y)], 0.05, C.woodD);
      });
    }
    [[0, 0.8], [0.8, 1.55], [1.55, H]].forEach(([y0, y1], bay) => {
      cs.forEach(([sx, sz], i) => {
        const [nx, nz] = cs[(i + 1) % 4];
        if ((i + bay) % 2) b.rod([sx * off(y0), y0, sz * off(y0)], [nx * off(y1), y1, nz * off(y1)], 0.022, C.woodL);
        else b.rod([nx * off(y0), y0, nz * off(y0)], [sx * off(y1), y1, sz * off(y1)], 0.022, C.woodL);
      });
    });
    b.box([0.5, 0.07, 0.5], [0, H, 0], C.woodL);
    for (const sz of [-1, 1]) b.box([0.4, 0.3, 0.04], [0, H + 0.07, sz * 0.1], C.woodD);
    b.cyl(0.17, 0.17, 0.05, 8, [0, H + 0.25, 0], C.metal, { c: true, r: [0, 0, PI / 2] });
    b.cyl(0.04, 0.04, 0.2, 5, [0, H + 0.25, 0], C.metalD, { c: true, r: [0, 0, PI / 2] });
    return b.build();
  });
}
const PYLON_TOP = 2.3 + 0.25 + 0.17;

function gondolaCore(b, roof = true) {
  b.box([0.14, 0.09, 0.3], [0, -0.05, 0], C.metalD);
  for (const sz of [-1, 1]) b.rod([0, -0.04, sz * 0.12], [0, -0.3, sz * 0.12], 0.012, C.metalD, { seg: 4 });
  b.box([0.46, 0.04, 0.4], [0, -0.74, 0], C.woodD);
  b.box([0.44, 0.3, 0.34], [0, -0.7 + 0.04, 0], C.cream, { sh: [0.93, 1.05] });
  b.box([0.46, 0.05, 0.36], [0, -0.43, 0], 0xd9856a);
  if (roof) b.prism(0.56, 0.12, 0.44, [0, -0.38, 0], 0xd9856a, { sh: [0.9, 1.08] });
  for (const sx of [-1, 1]) b.box([0.02, 0.14, 0.2], [sx * 0.225, -0.6, 0], 0xcdeaf4);
  b.box([0.2, 0.2, 0.02], [0, -0.66, 0.18], C.woodD);
}

function gondolaGeo() {
  return cached('gondola', () => {
    const b = new B();
    gondolaCore(b);
    return b.build();
  });
}

// Note: tiered cabin {body, glow}; T2 planed trim + striped cloth roof, T4 brass trim + lit windows. T1 keeps the base cabin.
function gondolaTierParts(tier) {
  return cached(`gondola|t${tier}`, () => {
    const b = new B();
    gondolaCore(b, tier < 2);
    const gl = new B();
    if (tier >= 2) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod([sx * 0.225, -0.7, sz * 0.175], [sx * 0.225, -0.4, sz * 0.175], 0.02, 0xf0d9a8, { seg: 3 });
      b.box([0.46, 0.03, 0.36], [0, -0.7, 0], 0xf0d9a8);
      [-0.165, -0.055, 0.055, 0.165].forEach((z, i) => b.prism(0.62, 0.15, 0.11, [0, -0.385, z], i % 2 ? 0xf7ecd2 : 0xe0614f, { sh: [0.95, 1.05] }));
    }
    if (tier >= 4) {
      b.box([0.48, 0.02, 0.42], [0, -0.75, 0], BRASS);
      b.box([0.03, 0.03, 0.48], [0, -0.26, 0], BRASS);
      for (const sz of [-1, 1]) b.oct(0.03, [0, -0.235, sz * 0.25], BRASS);
      for (const sx of [-1, 1]) gl.box([0.02, 0.12, 0.17], [sx * 0.238, -0.59, 0], C.lampWarm, { v: 0 });
      gl.box([0.14, 0.1, 0.02], [0, -0.62, -0.176], C.lampWarm, { v: 0 });
    }
    const body = b.build();
    const glow = gl.build();
    body.userData.shared = true;
    glow.userData.shared = true;
    return { body, glow };
  });
}

function makeGondola(tier) {
  const g = new Group();
  if (tier < 2) { g.add(mesh(gondolaGeo())); return g; }
  const p = gondolaTierParts(tier);
  g.add(mesh(p.body));
  if (p.glow.attributes.position.count) g.add(mesh(p.glow, MATS.glow, false));
  return g;
}

// Note: station parts in pylon-local space (+z toward the other end), cached per tier and bench flag.
// Note: T1 lantern on the slab, T3 four stone piers under the slab corners (the centre stays open) and a bench platform at +x.
const BENCH_ST = { x: 1.2, z: -0.5, seat: 0.34 };
function stationParts(tier, bench) {
  return cached(`station|t${tier}|${bench ? 1 : 0}`, () => {
    const b = new B();
    const gl = new B();
    const g0 = -CABLE_RISE;
    if (tier >= 1) {
      b.box([0.05, 0.76, 0.05], [0.43, 0.03, 0], C.woodD);
      gl.box([0.08, 0.1, 0.08], [0.43, 0.77, 0], C.lampWarm, { v: 0 });
      b.cone(0.08, 0.07, 4, [0.43, 0.86, 0], C.woodDD, { open: true, r: [0, PI / 4, 0] });
    }
    if (tier >= 3) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([0.16, -0.04 - (g0 - 0.7), 0.16], [sx * 0.44, g0 - 0.7, sz * 0.44], STONE_COL[0], { sh: [0.85, 1] });
      if (bench) {
        const { x, z } = BENCH_ST;
        b.box([1.3, 1.06, 1.0], [x, g0 - 1.0, z], STONE_COL[1], { sh: [0.9, 1] });
        for (const dz of [-0.3, 0.3]) b.box([0.22, 0.26, 0.05], [x, g0 + 0.04, z + dz], C.woodD);
        b.box([0.26, 0.04, 0.8], [x, g0 + 0.28, z], C.woodL);
        b.box([0.04, 0.22, 0.8], [x + 0.11, g0 + 0.3, z], C.wood);
      }
    }
    const body = b.build();
    const glow = gl.build();
    body.userData.shared = true;
    glow.userData.shared = true;
    return { body, glow };
  });
}

// Note: tier parts of one station, placed like the pylon (scaled while it grows). Lamp point and bench spot go to userData once grown.
function addStation(g, at, yaw, sc, tier, bench, lamps, end) {
  const p = stationParts(tier, bench);
  const grp = new Group();
  grp.position.copy(at);
  grp.rotation.y = yaw;
  grp.scale.set(1, sc, 1);
  grp.add(mesh(p.body));
  if (p.glow.attributes.position.count) grp.add(mesh(p.glow, MATS.glow, false));
  g.add(grp);
  if (sc < 0.999) return;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const wp = (x, y, z) => new Vector3(at.x + x * c + z * s, at.y + y, at.z - x * s + z * c);
  lamps.push(wp(0.43, 0.82, 0));
  if (bench && tier >= 3) {
    const q = wp(BENCH_ST.x, -CABLE_RISE + BENCH_ST.seat, BENCH_ST.z);
    // Note: yaw of the seat facing -x in station space.
    g.userData.bench = { x: q.x, y: q.y, z: q.z, yaw: yaw - PI / 2, end };
  }
}

// Note: T4 string lights hang beside the cable (self-lit tetra bulbs on a thin wire).
function addCableLights(g, tA, tB, yaw) {
  const len = tA.distanceTo(tB);
  const n = clamp(Math.round(len / 2.8), 2, 10);
  const side = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.12);
  const wb = new B();
  const gl = new B();
  const a = tA.clone().add(side), z = tB.clone().add(side);
  wb.rod(a, z, 0.012, C.woodDD, { seg: 3 });
  const d = new Vector3().subVectors(tB, tA);
  for (let j = 0; j < n; j++) {
    const k = (j + 0.5) / n;
    const p = new Vector3().copy(a).addScaledVector(d, k);
    p.y -= 0.06;
    gl.add(pTet(), BULB_COLS[j % 4], { p: [p.x, p.y, p.z], s: 0.05, v: 0 });
  }
  g.add(mesh(wb.build()));
  g.add(mesh(gl.build(), MATS.glow, false));
}

function stage(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }

// Note: per-call geometry (bridges, cables) is freed by group.userData.dispose(); cached geometry is never disposed.
// Note: tier 0..4 (vine ignores it); benchEnd 0|1 picks the end that gets the T3 bench. g.userData.lamps = world end-lantern points, g.userData.bench = bench spot.
export function buildLinkMesh(type, pts, progress = 1, tier = 0, benchEnd = 0) {
  const g = buildLinkInner(type, pts, progress, clamp(tier | 0, 0, 4), benchEnd ? 1 : 0);
  g.userData.dispose = () => {
    g.traverse((o) => { if (o.isMesh && !o.geometry.userData.shared) o.geometry.dispose(); });
  };
  return g;
}

function buildLinkInner(type, pts, progress, tier, benchEnd) {
  const g = new Group();
  g.userData = { type, progress };
  const prog = clamp(progress, 0, 1);
  if (!pts || pts.length < 2) return g;
  const A = new Vector3(pts[0].x, pts[0].y, pts[0].z);
  const Z = new Vector3(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].z);
  if (type === 'ropebridge' || type === 'vine') {
    if (prog <= 0.001) return g;
    const t = type === 'ropebridge' ? tier : 0;
    const geo = type === 'ropebridge' ? ropeBridgeGeo(pts, prog, t) : vineGeo(pts, prog);
    g.add(mesh(geo));
    // Note: tier props only appear on the finished bridge.
    if (t > 0 && prog >= 0.999) addRopeTier(g, pts, t, benchEnd);
    return g;
  }
  const yaw = Math.atan2(Z.x - A.x, Z.z - A.z);
  g.userData.dock = [A.clone(), Z.clone()];
  if (type === 'balloon') {
    const dg = linkDockGeo();
    const sA = stage(prog, 0, 0.35), sB = stage(prog, 0.35, 0.7);
    if (sA > 0.001) {
      const m = mesh(dg);
      m.position.copy(A);
      m.rotation.y = yaw;
      m.scale.set(1, sA, 1);
      g.add(m);
    }
    if (sB > 0.001) {
      const m = mesh(dg);
      m.position.copy(Z);
      m.rotation.y = yaw + PI;
      m.scale.set(1, sB, 1);
      g.add(m);
    }
    const sBal = stage(prog, 0.7, 1);
    g.userData.balloon = null;
    if (sBal > 0.001) {
      const bal = makeBalloon(tier);
      bal.position.copy(A).add(new Vector3(0, 0.95, 0));
      bal.rotation.y = yaw;
      bal.scale.setScalar(0.3 + 0.7 * sBal);
      g.add(bal);
      g.userData.balloon = bal;
    }
    return g;
  }
  if (type === 'cablecar') {
    const pg = pylonGeo();
    const lamps = [];
    const sA = stage(prog, 0, 0.25), sB = stage(prog, 0.25, 0.5);
    const topB = Z.clone().add(new Vector3(0, PYLON_TOP, 0));
    g.userData.cable = [A.clone().add(new Vector3(0, PYLON_TOP, 0)), topB];
    if (sA > 0.001) {
      const m = mesh(pg);
      m.position.copy(A);
      m.rotation.y = yaw;
      m.scale.set(1, sA, 1);
      g.add(m);
      if (tier > 0) addStation(g, A, yaw, sA, tier, benchEnd === 0, lamps, 0);
    }
    if (sB > 0.001) {
      const m = mesh(pg);
      m.position.copy(Z);
      m.rotation.y = yaw + PI;
      m.scale.set(1, sB, 1);
      g.add(m);
      if (tier > 0) addStation(g, Z, yaw + PI, sB, tier, benchEnd === 1, lamps, 1);
    }
    const cf = stage(prog, 0.5, 0.85);
    const tA = g.userData.cable[0];
    if (cf > 0.001) {
      const end = new Vector3().lerpVectors(tA, topB, cf);
      const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.12);
      const b = new B();
      b.rod(tA, end, 0.03, 0x4a4f55, { seg: 4 });
      b.rod(tA.clone().add(side), end.clone().add(side), 0.018, C.woodDD, { seg: 3 });
      g.add(mesh(b.build()));
      if (tier >= 4 && cf >= 0.999) addCableLights(g, tA, topB, yaw);
    }
    if (lamps.length) g.userData.lamps = lamps;
    g.userData.gondola = null;
    const sG = stage(prog, 0.85, 1);
    if (sG > 0.001) {
      const gon = makeGondola(tier);
      gon.position.copy(tA);
      gon.rotation.y = yaw;
      gon.scale.setScalar(0.3 + 0.7 * sG);
      g.add(gon);
      g.userData.gondola = gon;
    }
    return g;
  }
  throw new Error(`buildLinkMesh: unknown type ${type}`);
}
