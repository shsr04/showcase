// Note: MeshBuilder accumulates vertices into typed arrays; baked lighting is applied through a bake hook.

import { LAYER_M } from './config.js';

const enc = (v) => {
  const x = Math.sqrt(v <= 0 ? 0 : v >= 4 ? 1 : v / 4);
  return (x * 255 + 0.5) | 0;
};

class Grow {
  constructor(Type, stride, cap) {
    this.Type = Type;
    this.stride = stride;
    this.a = new Type(cap * stride);
    this.cap = cap;
  }

  ensure(n) {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    const b = new this.Type(cap * this.stride);
    b.set(this.a);
    this.a = b;
    this.cap = cap;
  }
}

const BAKE_OUT = { sr: 0, sg: 0, sb: 0, ao: 1, dr: 0, dg: 0, db: 0, style: 0 };

export class MeshBuilder {
  constructor(cap = 4096) {
    this.pos = new Grow(Float32Array, 3, cap);
    this.nrm = new Grow(Int8Array, 4, cap);
    this.uv = new Grow(Float32Array, 2, cap);
    this.meta = new Grow(Uint8Array, 4, cap);
    this.lit = new Grow(Uint8Array, 4, cap);
    this.dyn = new Grow(Uint8Array, 4, cap);
    this.tintA = new Grow(Uint8Array, 4, cap);
    this.idx = new Grow(Uint32Array, 1, cap * 2);
    this.nv = 0;
    this.ni = 0;
    this.bake = null;
    // Note: current material state is applied to every emitted vertex.
    this.layer = 0;
    this.tint = [1, 1, 1];
    this.emis = 0;
    this.style = 0;
    this.flag = 0;
    this.uvScale = 0;
  }

  mat(layer, tint = null, emis = 0, style = 0) {
    this.layer = layer;
    if (tint) this.tint = tint;
    this.emis = emis;
    this.style = style;
    this.flag = 0;
    return this;
  }

  tile() {
    return this.uvScale || LAYER_M[this.layer] || 2;
  }

  // Note: adds one vertex with uv in tile units and returns its index.
  v(x, y, z, nx, ny, nz, u, vv) {
    const i = this.nv++;
    const n1 = this.nv;
    this.pos.ensure(n1);
    this.nrm.ensure(n1);
    this.uv.ensure(n1);
    this.meta.ensure(n1);
    this.lit.ensure(n1);
    this.dyn.ensure(n1);
    this.tintA.ensure(n1);
    const p = this.pos.a;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    const n = this.nrm.a;
    n[i * 4] = Math.round(nx * 127);
    n[i * 4 + 1] = Math.round(ny * 127);
    n[i * 4 + 2] = Math.round(nz * 127);
    n[i * 4 + 3] = 0;
    this.uv.a[i * 2] = u;
    this.uv.a[i * 2 + 1] = vv;
    const o = BAKE_OUT;
    o.sr = o.sg = o.sb = 0;
    o.ao = 1;
    o.dr = o.dg = o.db = 0;
    o.style = 0;
    if (this.bake) this.bake(x, y, z, nx, ny, nz, o);
    // Note: emissive surfaces keep their own style and take no dynamic light term.
    const emissive = this.emis > 0;
    const style = emissive ? this.style : o.style || this.style;
    const m = this.meta.a;
    m[i * 4] = this.layer;
    m[i * 4 + 1] = style;
    m[i * 4 + 2] = this.flag;
    m[i * 4 + 3] = 0;
    const l = this.lit.a;
    l[i * 4] = enc(o.sr);
    l[i * 4 + 1] = enc(o.sg);
    l[i * 4 + 2] = enc(o.sb);
    l[i * 4 + 3] = Math.round(o.ao * 255);
    const d = this.dyn.a;
    d[i * 4] = emissive ? 0 : enc(o.dr);
    d[i * 4 + 1] = emissive ? 0 : enc(o.dg);
    d[i * 4 + 2] = emissive ? 0 : enc(o.db);
    d[i * 4 + 3] = 0;
    const t = this.tintA.a;
    t[i * 4] = Math.min(255, Math.round(this.tint[0] * 127.5));
    t[i * 4 + 1] = Math.min(255, Math.round(this.tint[1] * 127.5));
    t[i * 4 + 2] = Math.min(255, Math.round(this.tint[2] * 127.5));
    t[i * 4 + 3] = Math.min(255, Math.round(this.emis * 85));
    return i;
  }

  tri(a, b, c) {
    const k = this.ni;
    this.idx.ensure(k + 3);
    const ix = this.idx.a;
    ix[k] = a;
    ix[k + 1] = b;
    ix[k + 2] = c;
    this.ni += 3;
  }

  geoNormal(a, b, c) {
    const p = this.pos.a;
    const ax = p[b * 3] - p[a * 3];
    const ay = p[b * 3 + 1] - p[a * 3 + 1];
    const az = p[b * 3 + 2] - p[a * 3 + 2];
    const bx = p[c * 3] - p[a * 3];
    const by = p[c * 3 + 1] - p[a * 3 + 1];
    const bz = p[c * 3 + 2] - p[a * 3 + 2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  }

  // Note: winding is chosen so the front face looks along n.
  triN(a, b, c, n) {
    const g = this.geoNormal(a, b, c);
    if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  quadIdx(a, b, c, d, n) {
    const g = this.geoNormal(a, b, d);
    const g2 = this.geoNormal(b, c, d);
    const s = (g[0] + g2[0]) * n[0] + (g[1] + g2[1]) * n[1] + (g[2] + g2[2]) * n[2];
    if (s >= 0) {
      this.tri(a, b, c);
      this.tri(a, c, d);
    } else {
      this.tri(a, c, b);
      this.tri(a, d, c);
    }
  }

  // Note: flat quad with planar world-space uvs unless explicit uvs [u0,v0,...,u3,v3] are given.
  quad(p0, p1, p2, p3, n, uvs = null) {
    const t = this.tile();
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    const P = [p0, p1, p2, p3];
    const id = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const p = P[k];
      let u;
      let w;
      if (uvs) {
        u = uvs[k * 2];
        w = uvs[k * 2 + 1];
      } else if (ax >= ay && ax >= az) {
        // Note: v grows downwards in the texture array, so vertical faces use -y to stay upright.
        u = (n[0] > 0 ? -p[2] : p[2]) / t;
        w = -p[1] / t;
      } else if (ay >= az) {
        u = p[0] / t;
        w = p[2] / t;
      } else {
        u = (n[2] > 0 ? p[0] : -p[0]) / t;
        w = -p[1] / t;
      }
      id[k] = this.v(p[0], p[1], p[2], n[0], n[1], n[2], u, w);
    }
    this.quadIdx(id[0], id[1], id[2], id[3], n);
  }

  // Note: per-vertex normals variant; ns holds four normals.
  quadN(P, ns, uvs) {
    const id = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      id[k] = this.v(P[k][0], P[k][1], P[k][2], ns[k][0], ns[k][1], ns[k][2], uvs[k * 2], uvs[k * 2 + 1]);
    }
    const n = [
      ns[0][0] + ns[1][0] + ns[2][0] + ns[3][0],
      ns[0][1] + ns[1][1] + ns[2][1] + ns[3][1],
      ns[0][2] + ns[1][2] + ns[2][2] + ns[3][2],
    ];
    this.quadIdx(id[0], id[1], id[2], id[3], n);
  }

  // Note: two-sided quad for thin panels, signs and foliage cards.
  quad2(p0, p1, p2, p3, n, uvs = null) {
    this.quad(p0, p1, p2, p3, n, uvs);
    this.quad(p0, p1, p2, p3, [-n[0], -n[1], -n[2]], uvs);
  }

  // Note: axis-aligned box with outward faces; skip lists face names such as 'ny' to omit.
  box(cx, cy, cz, hx, hy, hz, skip = '') {
    const x0 = cx - hx;
    const x1 = cx + hx;
    const y0 = cy - hy;
    const y1 = cy + hy;
    const z0 = cz - hz;
    const z1 = cz + hz;
    if (!skip.includes('px')) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    if (!skip.includes('nx')) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]);
    if (!skip.includes('py')) this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
    if (!skip.includes('ny')) this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
    if (!skip.includes('pz')) this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1]);
    if (!skip.includes('nz')) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
  }

  // Note: oriented box; ax/ay/az are unit axes, hx/hy/hz half sizes; uvs follow the box faces.
  obox(c, ax, ay, az, hx, hy, hz, skip = '') {
    const t = this.tile();
    const pt = (sx, sy, sz) => [
      c[0] + ax[0] * hx * sx + ay[0] * hy * sy + az[0] * hz * sz,
      c[1] + ax[1] * hx * sx + ay[1] * hy * sy + az[1] * hz * sz,
      c[2] + ax[2] * hx * sx + ay[2] * hy * sy + az[2] * hz * sz,
    ];
    const faces = [
      ['px', [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], ax, 1, ay, az],
      ['nx', [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1], ax, -1, ay, az],
      ['py', [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1], ay, 1, ax, az],
      ['ny', [-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], ay, -1, ax, az],
      ['pz', [1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1], az, 1, ax, ay],
      ['nz', [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1], az, -1, ax, ay],
    ];
    for (const [name, a, b, cc, d, axis, sgn, e1, e2] of faces) {
      if (skip.includes(name)) continue;
      const P = [pt(...a), pt(...b), pt(...cc), pt(...d)];
      const uvs = [];
      for (const p of P) {
        const rx = p[0] - c[0];
        const ry = p[1] - c[1];
        const rz = p[2] - c[2];
        uvs.push((rx * e1[0] + ry * e1[1] + rz * e1[2]) / t + 50, (rx * e2[0] + ry * e2[1] + rz * e2[2]) / t + 50);
      }
      this.quad(P[0], P[1], P[2], P[3], [axis[0] * sgn, axis[1] * sgn, axis[2] * sgn], uvs);
    }
  }

  // Note: cylinder or cone from a to b with outward side normals; caps optional.
  cyl(a, b, r0, r1, n = 8, caps = false, rotate = 0) {
    const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    const t = [ax[0] / len, ax[1] / len, ax[2] / len];
    const ref = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1;
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const tile = this.tile();
    const slope = (r0 - r1) / len;
    const ia = [];
    const ib = [];
    for (let k = 0; k <= n; k++) {
      const ang = rotate + (k / n) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const d = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
      let nn = [d[0] + t[0] * slope, d[1] + t[1] * slope, d[2] + t[2] * slope];
      const nl = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      nn = [nn[0] / nl, nn[1] / nl, nn[2] / nl];
      const uu = ((k / n) * Math.PI * 2 * Math.max(r0, r1)) / tile;
      ia.push(this.v(a[0] + d[0] * r0, a[1] + d[1] * r0, a[2] + d[2] * r0, nn[0], nn[1], nn[2], uu, 0));
      ib.push(this.v(b[0] + d[0] * r1, b[1] + d[1] * r1, b[2] + d[2] * r1, nn[0], nn[1], nn[2], uu, len / tile));
    }
    for (let k = 0; k < n; k++) {
      this.quadIdx(ia[k], ia[k + 1], ib[k + 1], ib[k], this.nrmOf(ia[k]));
    }
    if (caps) {
      if (r0 > 0.001) this.disc(a, [-t[0], -t[1], -t[2]], u, w, r0, n);
      if (r1 > 0.001) this.disc(b, t, u, w, r1, n);
    }
  }

  nrmOf(i) {
    const n = this.nrm.a;
    return [n[i * 4] / 127, n[i * 4 + 1] / 127, n[i * 4 + 2] / 127];
  }

  disc(c, n, u, w, r, segs) {
    const tile = this.tile();
    const ci = this.v(c[0], c[1], c[2], n[0], n[1], n[2], 0.5, 0.5);
    const ring = [];
    for (let k = 0; k < segs; k++) {
      const ang = (k / segs) * Math.PI * 2;
      const co = Math.cos(ang);
      const si = Math.sin(ang);
      const p = [c[0] + (u[0] * co + w[0] * si) * r, c[1] + (u[1] * co + w[1] * si) * r, c[2] + (u[2] * co + w[2] * si) * r];
      ring.push(this.v(p[0], p[1], p[2], n[0], n[1], n[2], (co * r) / tile + 0.5, (si * r) / tile + 0.5));
    }
    for (let k = 0; k < segs; k++) this.triN(ci, ring[k], ring[(k + 1) % segs], n);
  }

  // Note: glyph run on a plane; right and up are unit vectors, size is the glyph height in meters.
  text(str, origin, right, up, size, atlas, opts = {}) {
    const adv = size * (atlas.aspect || 0.5);
    const align = opts.align || 'left';
    const total = adv * str.length;
    let x0 = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    const n = [
      right[1] * up[2] - right[2] * up[1],
      right[2] * up[0] - right[0] * up[2],
      right[0] * up[1] - right[1] * up[0],
    ];
    const saveLayer = this.layer;
    this.layer = atlas.layer;
    for (let k = 0; k < str.length; k++) {
      const code = str.charCodeAt(k);
      if (code > 32 && code < 127) {
        const [u0, v0, u1, v1] = atlas.uv(code);
        const a = [origin[0] + right[0] * x0, origin[1] + right[1] * x0, origin[2] + right[2] * x0];
        const bb = [a[0] + right[0] * adv, a[1] + right[1] * adv, a[2] + right[2] * adv];
        const cc = [bb[0] + up[0] * size, bb[1] + up[1] * size, bb[2] + up[2] * size];
        const dd = [a[0] + up[0] * size, a[1] + up[1] * size, a[2] + up[2] * size];
        const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
        this.quad(a, bb, cc, dd, n, uvs);
        if (opts.twoSided) this.quad(a, bb, cc, dd, [-n[0], -n[1], -n[2]], uvs);
      }
      x0 += adv;
    }
    this.layer = saveLayer;
  }

  stats() {
    return { verts: this.nv, tris: this.ni / 3 };
  }

  bounds() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const p = this.pos.a;
    for (let i = 0; i < this.nv; i++) {
      for (let a = 0; a < 3; a++) {
        const v = p[i * 3 + a];
        if (v < b[a]) b[a] = v;
        if (v > b[a + 3]) b[a + 3] = v;
      }
    }
    return b;
  }

  // Note: trimmed copies ready for BufferGeometry.
  arrays() {
    const n = this.nv;
    return {
      count: n,
      index: this.idx.a.slice(0, this.ni),
      pos: this.pos.a.slice(0, n * 3),
      nrm: this.nrm.a.slice(0, n * 4),
      uv: this.uv.a.slice(0, n * 2),
      meta: this.meta.a.slice(0, n * 4),
      lit: this.lit.a.slice(0, n * 4),
      dyn: this.dyn.a.slice(0, n * 4),
      tint: this.tintA.a.slice(0, n * 4),
      bounds: this.bounds(),
    };
  }
}
