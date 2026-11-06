// Note: render-side sets for the four seasonal festivals; plain three.js primitives, headless safe, no sim state.

import * as THREE from 'three';
import { N, BALLOON_SCALE } from './config.js';
import { MATS, makeBalloon } from './models.js';
import { hash2 } from './rand.js';

const _q = new THREE.Quaternion(); const _e = new THREE.Euler(); const _s = new THREE.Vector3(); const _p = new THREE.Vector3();
const _c = new THREE.Color();

// Note: collects primitives and bakes them into one flat-coloured geometry.
class Bake {
  constructor() { this.items = []; }

  add(geo, color, pos, rot, scale) {
    const m = new THREE.Matrix4();
    _q.setFromEuler(_e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'));
    _s.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
    _p.set(pos[0], pos[1], pos[2]);
    m.compose(_p, _q, _s);
    this.items.push({ geo, color, m });
    return this;
  }

  box(sx, sy, sz, pos, color, rot) { return this.add(new THREE.BoxGeometry(sx, sy, sz), color, pos, rot); }
  cyl(rt, rb, h, seg, pos, color, rot) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, pos, rot); }
  sph(r, pos, color, scale) { return this.add(new THREE.SphereGeometry(r, 7, 5), color, pos, null, scale); }
  cone(r, h, seg, pos, color, rot) { return this.add(new THREE.ConeGeometry(r, h, seg), color, pos, rot); }

  // Note: a thin rod between two points.
  rod(a, b, r, color, seg = 4) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const m = new THREE.Matrix4();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    _p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.compose(_p, _q, _s.set(1, 1, 1));
    this.items.push({ geo: g, color, m });
    return this;
  }

  build() {
    const pos = []; const col = [];
    for (const it of this.items) {
      const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
      g.applyMatrix4(it.m);
      const p = g.attributes.position.array;
      _c.set(it.color);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); col.push(_c.r, _c.g, _c.b); }
      g.dispose(); it.geo.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeVertexNormals();
    return out;
  }
}

const hv = (a, b, c) => (hash2(a, b, c) % 1000) / 1000;
const ground = (isl, i, j) => isl.heightAt(i + 0.5, j + 0.5);

// Note: free ring cells around the place; each entry carries its local world position.
function ringCells(isl, at, r, n, a0, skip) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    const i = Math.round(at.i + Math.cos(a) * r); const j = Math.round(at.j + Math.sin(a) * r);
    const ok = i >= 0 && j >= 0 && i < N && j < N && isl.land(i, j) && isl.walkable(i, j) && isl.bld[j * N + i] < 0 && !isl.plant[j * N + i];
    out.push(ok ? { i, j, x: i + 0.5 - N / 2, y: ground(isl, i, j), z: j + 0.5 - N / 2, a } : (skip ? null : undefined));
  }
  return out;
}

// Note: a hanging cloth strip between two points; flutters by moving its sag and sideways phase.
class Cloth {
  constructor(a, b, w, sag, color, ph) {
    this.a = a; this.b = b; this.w = w; this.sag = sag; this.ph = ph;
    const n = 10; this.n = n;
    this.pos = new Float32Array((n + 1) * 2 * 3);
    const col = new Float32Array((n + 1) * 2 * 3);
    _c.set(color);
    for (let i = 0; i < (n + 1) * 2; i++) { const k = i % 2 ? 0.88 : 1; col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k; }
    const idx = [];
    for (let s = 0; s < n; s++) { const o = s * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, MATS.vertexDouble);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.update(0, 0.2);
  }

  // Note: point on the sagging top edge, u from 0 to 1.
  at(u, t, amp) {
    const a = this.a; const b = this.b;
    const fl = Math.sin(t * 2.1 + u * 5 + this.ph) * amp * Math.sin(u * Math.PI);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * this.sag + fl * 0.5, a[2] + (b[2] - a[2]) * u + fl];
  }

  update(t, wind) {
    const amp = 0.05 + wind * 0.25;
    for (let s = 0; s <= this.n; s++) {
      const u = s / this.n;
      const p = this.at(u, t, amp);
      const hang = this.w * (0.85 + 0.15 * Math.sin(u * 7 + this.ph)) * (0.6 + 0.4 * Math.sin(u * Math.PI));
      const o = s * 6;
      this.pos[o] = p[0]; this.pos[o + 1] = p[1]; this.pos[o + 2] = p[2];
      this.pos[o + 3] = p[0] + Math.sin(t * 1.7 + u * 6 + this.ph) * amp * 0.4; this.pos[o + 4] = p[1] - hang; this.pos[o + 5] = p[2] + Math.cos(t * 1.4 + u * 4 + this.ph) * amp * 0.5;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

const CLOTH_COLS = [0xe8809f, 0xf6d66a, 0x86c8c0, 0xa99be0, 0xf5e9d3, 0xf0a070];

// Note: weavers, spring: poles ringed with lantern-cloth swags and glowing paper lanterns.
function weaversSet(isl, at, seed) {
  const g = new THREE.Group();
  const cells = ringCells(isl, at, 3.1, 7, hv(seed, 1, 1) * 6.28, true);
  const poles = cells.filter(Boolean);
  const bk = new Bake();
  const lan = new Bake();
  const lights = [];
  const cloths = [];
  for (const p of poles) {
    bk.rod([p.x, p.y, p.z], [p.x, p.y + 1.9, p.z], 0.03, 0x946a45, 5);
    bk.sph(0.06, [p.x, p.y + 1.95, p.z], 0xf6d66a);
  }
  let n = 0;
  for (let k = 0; k < cells.length; k++) {
    const A = cells[k]; const B = cells[(k + 1) % cells.length];
    if (!A || !B || Math.hypot(A.x - B.x, A.z - B.z) > 3.6) continue;
    const a = [A.x, A.y + 1.85, A.z]; const b = [B.x, B.y + 1.85, B.z];
    const cl = new Cloth(a, b, 0.55, 0.28, CLOTH_COLS[(k + seed) % CLOTH_COLS.length], k * 1.7);
    cloths.push(cl); g.add(cl.mesh);
    for (let q = 1; q <= 3; q++) {
      const u = q / 4;
      const px = a[0] + (b[0] - a[0]) * u; const pz = a[2] + (b[2] - a[2]) * u;
      const py = a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * 0.28 - 0.62 - (q % 2) * 0.12;
      lan.rod([px, py + 0.2, pz], [px, py + 0.08, pz], 0.006, 0x6f4f38, 3);
      lan.sph(0.1, [px, py, pz], q % 2 ? 0xffc27a : 0xffa8a0, [1, 1.25, 1]);
      if (n++ % 4 === 1 && lights.length < 3) lights.push({ x: px, y: py, z: pz, color: 0xffb878, base: 0.7, day: 0 });
    }
  }
  const body = new THREE.Mesh(bk.build(), MATS.vertex);
  const bulbs = new THREE.Mesh(lan.build(), MATS.glow);
  g.add(body, bulbs);
  return {
    group: g, lights, ready: poles.length >= 2,
    update(t, k, c) {
      for (const cl of cloths) cl.update(t, c.wind);
      if (!c.near) return;
      const fx = c.fx;
      if (poles.length && Math.random() < c.dt * 1.4) {
        const p = poles[(Math.random() * poles.length) | 0];
        fx.glow.emit(c.wx + p.x, p.y + 1.5, c.wz + p.z, (Math.random() - 0.5) * 0.15, 0.55, (Math.random() - 0.5) * 0.15, 7, 0.24, 0.2, 1, 0.78, 0.5, 0.8, 0, 0.05);
      }
      if (poles.length && Math.random() < c.dt * 4) {
        const p = poles[(Math.random() * poles.length) | 0];
        fx.petal(c.wx + p.x + (Math.random() - 0.5), p.y + 2.2, c.wz + p.z + (Math.random() - 0.5), c.windx, c.windz);
      }
    },
  };
}

const POT_COLS = [0xd9856a, 0xe8c9a0, 0x6fa9a6, 0xc9a24a, 0x9a6a4c, 0xf0e2c6, 0x7f9fc7];

// Note: potters, autumn: a long table of glazed pots and a cooking pot over a fire.
function pottersSet(isl, at, seed) {
  const g = new THREE.Group();
  const cx = at.i + 0.5 - N / 2; const cz = at.j + 0.5 - N / 2; const cy = ground(isl, at.i, at.j);
  const yaw = hv(seed, 2, 2) * 3.14;
  const cs = Math.cos(yaw); const sn = Math.sin(yaw);
  const L = (x, z) => [cx + x * cs + z * sn, cz - x * sn + z * cs];
  const bk = new Bake();
  const T = (x, y, z) => { const [px, pz] = L(x, z); return [px, cy + y, pz]; };
  bk.box(1.7, 0.06, 0.62, T(0, 0.52, 0), 0xb98a55, [yaw, 0, 0]);
  bk.box(1.76, 0.02, 0.68, T(0, 0.555, 0), 0xf8f0de, [yaw, 0, 0]);
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.25, 0.25]) bk.box(0.07, 0.5, 0.07, T(sx, 0.25, sz), 0x946a45, [yaw, 0, 0]);
  for (let k = 0; k < 8; k++) {
    const x = -0.72 + k * 0.205; const z = ((k * 5) % 3 - 1) * 0.16;
    const h = 0.14 + hv(seed, k, 3) * 0.12; const r = 0.07 + hv(seed, k, 4) * 0.04;
    const col = POT_COLS[(k + seed) % POT_COLS.length];
    bk.cyl(r * 0.6, r, h, 7, T(x, 0.565 + h / 2, z), col);
    bk.cyl(r * 0.42, r * 0.6, h * 0.25, 7, T(x, 0.565 + h * 1.12, z), col);
    bk.cyl(r * 0.63, r * 0.63, 0.012, 7, T(x, 0.565 + h * 1.25, z), 0x3d302c);
  }
  for (let k = 0; k < 4; k++) {
    const a = 2.4 + k * 1.15; const rr = 1.5 + (k % 2) * 0.35;
    const [px, pz] = L(Math.cos(a) * rr, Math.sin(a) * rr);
    const r = 0.17 + hv(seed, k, 8) * 0.07;
    bk.cyl(r * 0.75, r, r * 2.2, 8, [px, cy + r * 1.1, pz], POT_COLS[(k * 2 + seed) % POT_COLS.length]);
    bk.cyl(r * 0.55, r * 0.75, r * 0.5, 8, [px, cy + r * 2.4, pz], POT_COLS[(k * 2 + seed) % POT_COLS.length]);
  }
  // Note: fire pit on the far side with a hanging iron pot.
  const [fx0, fz0] = L(0.1, 1.15);
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; bk.sph(0.09, [fx0 + Math.cos(a) * 0.3, cy + 0.07, fz0 + Math.sin(a) * 0.3], 0xa4a8a9, [1, 0.8, 1]); }
  bk.rod([fx0 - 0.3, cy, fz0], [fx0 - 0.3, cy + 0.75, fz0], 0.02, 0x6f4f38);
  bk.rod([fx0 + 0.3, cy, fz0], [fx0 + 0.3, cy + 0.75, fz0], 0.02, 0x6f4f38);
  bk.rod([fx0 - 0.3, cy + 0.75, fz0], [fx0 + 0.3, cy + 0.75, fz0], 0.02, 0x6f4f38);
  bk.sph(0.2, [fx0, cy + 0.5, fz0], 0x3d4048, [1, 0.8, 1]);
  const embers = new Bake();
  embers.sph(0.1, [fx0, cy + 0.12, fz0], 0xff8a3c, [1.4, 0.5, 1.4]);
  // Note: leaf garland on two poles over the table.
  const pa = T(-0.95, 1.7, 0); const pb = T(0.95, 1.7, 0);
  bk.rod([pa[0], cy, pa[2]], pa, 0.03, 0x946a45, 5);
  bk.rod([pb[0], cy, pb[2]], pb, 0.03, 0x946a45, 5);
  const leaf = [0xe08a3a, 0xc8502e, 0xe8b64a, 0xb86a32];
  for (let s = 0; s <= 10; s++) {
    const u = s / 10;
    const px = pa[0] + (pb[0] - pa[0]) * u; const pz = pa[2] + (pb[2] - pa[2]) * u; const py = pa[1] - Math.sin(u * Math.PI) * 0.3;
    if (s > 0) bk.rod([px, py, pz], [pa[0] + (pb[0] - pa[0]) * ((s - 1) / 10), pa[1] - Math.sin(((s - 1) / 10) * Math.PI) * 0.3, pa[2] + (pb[2] - pa[2]) * ((s - 1) / 10)], 0.008, 0xdcc58f, 3);
    bk.cone(0.07, 0.16, 3, [px, py - 0.08, pz], leaf[s % 4], [0, s, Math.PI]);
  }
  const lamp = T(0.6, 0.66, -0.2);
  const lanterns = new Bake();
  lanterns.sph(0.07, lamp, 0xffd48a, [1, 1.2, 1]);
  g.add(new THREE.Mesh(bk.build(), MATS.vertex), new THREE.Mesh(embers.build(), MATS.glow), new THREE.Mesh(lanterns.build(), MATS.glow));
  const lights = [
    { x: fx0, y: cy + 0.5, z: fz0, color: 0xffa050, base: 0.9, day: 0.2 },
    { x: lamp[0], y: lamp[1] + 0.1, z: lamp[2], color: 0xffd48a, base: 0.45, day: 0 },
  ];
  const steam = [T(-0.5, 0.9, 0.1), T(0.1, 0.95, -0.1), T(0.62, 0.85, 0.15), [fx0, cy + 0.85, fz0]];
  return {
    group: g, lights, ready: true,
    update(t, k, c) {
      if (!c.near) return;
      const fx = c.fx;
      for (const s of steam) if (Math.random() < c.dt * 1.6) fx.steam(c.wx + s[0], s[1], c.wz + s[2], false);
      if (Math.random() < c.dt * 9) fx.flame(c.wx + fx0, cy + 0.12, c.wz + fz0, 0.8);
      if (Math.random() < c.dt * 1.2) fx.ember(c.wx + fx0, cy + 0.3, c.wz + fz0);
      if (Math.random() < c.dt * 3) fx.fall(c.wx + cx + (Math.random() - 0.5) * 5, cy + 3.2, c.wz + cz + (Math.random() - 0.5) * 5, c.windx, c.windz, leaf2[(Math.random() * 4) | 0]);
    },
  };
}
const leaf2 = [[0.95, 0.58, 0.2], [0.85, 0.35, 0.18], [0.92, 0.72, 0.28], [0.75, 0.42, 0.2]];

const MASK_COLS = [0xf0e2c6, 0xe3aa7d, 0xaab2ba, 0x95c67b, 0xd9708f];
const MASK_CREST = [0xc8502e, 0x6a96c7, 0xf6d66a, 0x946a45, 0x6fa9a6];

// Note: carvers, winter: a bonfire ringed by carved masks on poles.
function carversSet(isl, at, seed) {
  const g = new THREE.Group();
  const cx = at.i + 0.5 - N / 2; const cz = at.j + 0.5 - N / 2; const cy = ground(isl, at.i, at.j);
  const bk = new Bake();
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * 6.28 + 0.3;
    bk.cyl(0.07, 0.08, 0.9, 5, [cx + Math.cos(a) * 0.28, cy + 0.38, cz + Math.sin(a) * 0.28], 0x6f4f38, [0.6 * Math.sin(a), 0, -0.6 * Math.cos(a)]);
  }
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; bk.sph(0.11, [cx + Math.cos(a) * 0.72, cy + 0.08, cz + Math.sin(a) * 0.72], 0xa4a8a9, [1, 0.8, 1]); }
  const cells = ringCells(isl, at, 2.2, 6, hv(seed, 3, 3) * 6.28, false);
  const masks = [];
  cells.forEach((p, k) => {
    // Note: a blocked cell moves the mask to the open ring point; masks always face the fire.
    const a = k / 6 * 6.28 + hv(seed, 3, 3) * 6.28;
    const q = p || { x: cx + Math.cos(a) * 1.6, z: cz + Math.sin(a) * 1.6, y: cy };
    const face = Math.atan2(cx - q.x, cz - q.z);
    const col = MASK_COLS[k % 5]; const crest = MASK_CREST[(k + seed) % 5];
    bk.rod([q.x, q.y, q.z], [q.x, q.y + 1.5, q.z], 0.035, 0x6f4f38, 5);
    const f = (dx, dy, dz) => [q.x + dx * Math.cos(face) + dz * Math.sin(face), q.y + 1.55 + dy, q.z - dx * Math.sin(face) + dz * Math.cos(face)];
    bk.box(0.34, 0.44, 0.08, f(0, 0, 0.04), col, [face, 0, 0]);
    bk.box(0.07, 0.06, 0.03, f(-0.08, 0.06, 0.09), 0x3d302c, [face, 0, 0]);
    bk.box(0.07, 0.06, 0.03, f(0.08, 0.06, 0.09), 0x3d302c, [face, 0, 0]);
    bk.box(0.14, 0.04, 0.03, f(0, -0.12, 0.09), 0x3d302c, [face, 0, 0]);
    bk.cone(0.07, 0.26, 4, f(-0.12, 0.33, 0.04), crest, [face, 0, 0.35]);
    bk.cone(0.07, 0.26, 4, f(0.12, 0.33, 0.04), crest, [face, 0, -0.35]);
    bk.box(0.06, 0.12, 0.05, f(0, -0.26, 0.04), crest, [face, 0, 0]);
    masks.push(q);
  });
  const fire = new Bake();
  fire.cone(0.3, 0.7, 6, [cx, cy + 0.45, cz], 0xff8a3c);
  fire.cone(0.16, 0.5, 5, [cx, cy + 0.6, cz], 0xffd86a);
  const flame = new THREE.Mesh(fire.build(), MATS.glow);
  g.add(new THREE.Mesh(bk.build(), MATS.vertex), flame);
  const lights = [{ x: cx, y: cy + 0.7, z: cz, color: 0xff9040, base: 1.5, day: 0.4 }];
  return {
    group: g, lights, ready: true,
    update(t, k, c) {
      flame.scale.set(1 + Math.sin(t * 9) * 0.06, 1 + Math.sin(t * 7.3 + 1) * 0.1, 1 + Math.sin(t * 8.1) * 0.06);
      if (!c.near) return;
      const fx = c.fx;
      if (Math.random() < c.dt * 22) fx.flame(c.wx + cx, cy + 0.45, c.wz + cz, 1.5);
      if (Math.random() < c.dt * 5) fx.spark(c.wx + cx, cy + 0.9, c.wz + cz, 1, 0.7, 0.3, 0.8);
      if (Math.random() < c.dt * 2.2) fx.ember(c.wx + cx, cy + 0.8, c.wz + cz);
      if (Math.random() < c.dt * 2) fx.smoke(c.wx + cx, cy + 1.2, c.wz + cz, 1.2, 0.5);
      if (Math.random() < c.dt * 6) fx.snow(c.wx + cx + (Math.random() - 0.5) * 7, cy + 4, c.wz + cz + (Math.random() - 0.5) * 7);
    },
  };
}

const SAIL_COLS = [0xe8809f, 0xf6d66a, 0x86c8c0, 0x6a96c7, 0xf0a070];

// Note: sailors, summer: balloons racing a lap around the island; a few sail rafts below the rim when ballooning is not known.
function sailorsSet(isl, at, seed, balloons) {
  const g = new THREE.Group();
  const cx = at.i + 0.5 - N / 2; const cz = at.j + 0.5 - N / 2; const cy = ground(isl, at.i, at.j);
  const bk = new Bake();
  const cells = ringCells(isl, at, 2.4, 2, hv(seed, 4, 4) * 6.28, false);
  const posts = cells.map((p, k) => p || { x: cx + (k ? 2 : -2), z: cz, y: cy });
  for (const p of posts) {
    bk.rod([p.x, p.y, p.z], [p.x, p.y + 2.2, p.z], 0.035, 0x946a45, 5);
    for (let s = 0; s < 4; s++) bk.box(0.26, 0.15, 0.015, [p.x + 0.15, p.y + 2.1 - s * 0.2, p.z], SAIL_COLS[(s + seed) % SAIL_COLS.length]);
  }
  const lan = new Bake();
  for (const p of posts) lan.sph(0.09, [p.x, p.y + 2.3, p.z], 0xffd88a, [1, 1.2, 1]);
  g.add(new THREE.Mesh(bk.build(), MATS.vertex), new THREE.Mesh(lan.build(), MATS.glow));
  const racers = [];
  const dispose = [];
  const nR = balloons ? 3 : 4;
  for (let k = 0; k < nR; k++) {
    let o;
    if (balloons) {
      o = makeBalloon(0);
      o.scale.setScalar(BALLOON_SCALE);
      const tint = SAIL_COLS[(k * 2 + seed) % SAIL_COLS.length];
      o.traverse((m) => {
        if (m.isMesh && m.material && !m.material.isMeshBasicMaterial) { m.material = m.material.clone(); m.material.color.set(tint).lerp(_c.set(0xffffff), 0.35); dispose.push(m.material); }
        if (m.isMesh) m.castShadow = false;
      });
    } else {
      const rb = new Bake();
      rb.box(0.9, 0.12, 0.5, [0, 0.06, 0], 0xb98a55);
      for (let q = 0; q < 4; q++) rb.cyl(0.05, 0.05, 0.52, 5, [-0.3 + q * 0.2, 0.1, 0], 0x946a45, [Math.PI / 2, 0, 0]);
      rb.rod([0, 0.1, 0], [0, 1.15, 0], 0.025, 0x6f4f38, 5);
      rb.add(new THREE.ConeGeometry(0.34, 0.9, 3), SAIL_COLS[(k * 2 + seed) % SAIL_COLS.length], [0.06, 0.65, 0], [0, 0, 0], [0.22, 1, 1.2]);
      rb.box(0.2, 0.1, 0.012, [0.1, 1.2, 0], 0xf5e9d3);
      o = new THREE.Mesh(rb.build(), MATS.vertexDouble);
    }
    g.add(o);
    racers.push({ o, a: (k / nR) * 6.28 + hv(seed, k, 9), sp: (balloons ? 0.1 : 0.13) + k * 0.012, r: N / 2 + (balloons ? 1.5 : 3.2) + (k % 2) * 1.6, h: balloons ? 5.5 + k * 1.1 : -1.6 });
  }
  const lights = [{ x: posts[0].x, y: posts[0].y + 2.3, z: posts[0].z, color: 0xffd48a, base: 0.5, day: 0 }];
  return {
    group: g, lights, ready: true,
    update(t, k, c) {
      for (const r of racers) {
        r.a += c.dt * r.sp;
        const x = Math.cos(r.a) * r.r; const z = Math.sin(r.a) * r.r;
        const bob = Math.sin(t * (balloons ? 0.9 : 1.6) + r.a * 3) * (balloons ? 0.3 : 0.1);
        r.o.position.set(x, r.h + bob + (1 - k) * -4, z);
        r.o.rotation.y = -r.a + (balloons ? 0 : Math.PI / 2);
        if (balloons) r.o.rotation.z = Math.sin(t * 0.8 + r.a) * 0.05;
        else r.o.rotation.z = Math.sin(t * 1.3 + r.a * 2) * 0.06;
        if (c.near) {
          if (balloons && Math.random() < c.dt * 1.6) c.fx.sparkle(c.wx + x, r.h - 0.2 + bob, c.wz + z, 0.7);
          if (!balloons && Math.random() < c.dt * 3) c.fx.puff(c.wx + x, r.h - 0.1, c.wz + z, 0.4);
        }
      }
    },
    dispose() { for (const m of dispose) m.dispose(); },
  };
}

// Note: builds the set for an archetype's seasonal festival, or null when the archetype has none.
export function makeFestivalSet(isl, fe, ballooning) {
  const seed = (hash2(isl.gx | 0, isl.gz | 0, 77) % 997) + 1;
  const at = fe.at;
  let s = null;
  if (fe.arch === 'weavers') s = weaversSet(isl, at, seed);
  else if (fe.arch === 'potters') s = pottersSet(isl, at, seed);
  else if (fe.arch === 'carvers') s = carversSet(isl, at, seed);
  else if (fe.arch === 'sailors') s = sailorsSet(isl, at, seed, !!ballooning);
  if (s) {
    s.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    s.group.userData.festival = true;
  }
  return s;
}
