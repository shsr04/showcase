// Note: builds flat-shaded low-poly meshes for island ground, underside and water from the heightfield.

import * as THREE from 'three';
import { N, SURF, TRAITS } from './config.js';
import { cidx, vidx, VN, inB } from './island.js';
import { hash2, fbm, clamp, lerp } from './rand.js';
import { PAINT } from './rareisles.js';

const C = (hex) => new THREE.Color(hex);
const tmp = new THREE.Color();

const COL = {
  grassDry: C(0xb9bb62), grassMid: C(0x93cf63), grassLush: C(0x5db865), soil: C(0x9a7452), rock: C(0xa59f98), rockDark: C(0x7d7872),
  ore: C(0x8a6e66), crystal: C(0xa7c6dc), clay: C(0xc98b66), sand: C(0xe8d9a4), ash: C(0x3d3a3a), snow: C(0xf0f6fa), fire: C(0xff7a30),
  under: C(0x8a7b6c), underDark: C(0x5f5750), lip: C(0x7a5c43), moss: C(0x6c9a5a),
};

// Note: rare-island ground paint colours, indexed by PAINT code; null leaves the normal surface colour.
const PAINT_COL = [];
PAINT_COL[PAINT.STONE] = C(0xb4aea4); PAINT_COL[PAINT.RUIN] = C(0xd2b88a); PAINT_COL[PAINT.PIER] = C(0x9c7448);
PAINT_COL[PAINT.PEARL] = C(0xe9e2ee); PAINT_COL[PAINT.BED] = C(0x6fd08a); PAINT_COL[PAINT.OBSIDIAN] = C(0x2c2a36);
PAINT_COL[PAINT.LAVA] = C(0xff6a2c); PAINT_COL[PAINT.SULPHUR] = C(0xe6d23c); PAINT_COL[PAINT.SUNSTONE] = C(0xf2b24a);
PAINT_COL[PAINT.PRISM] = C(0xb8a4ee); PAINT_COL[PAINT.RIM] = C(0xc7b9a4); PAINT_COL[PAINT.PLINTH] = C(0xe3dccd);
PAINT_COL[PAINT.ICE] = C(0xd4ecf6); PAINT_COL[PAINT.HOT] = C(0x9fd8d0); PAINT_COL[PAINT.SAND] = C(0xe3cf94);
PAINT_COL[PAINT.MOSS] = C(0x6c9a5a);
const PAINT_STR = [0, 0.7, 0.8, 0.9, 0.85, 0.85, 0.9, 0.9, 0.85, 0.85, 0.8, 0.5, 0.85, 0.5, 0.8, 0.45, 0.6];

const jit = (a, b, c, amt) => ((hash2(a, b, c) % 1000) / 1000 - 0.5) * amt;

function cellColor(isl, i, j, out, tri, steep) {
  const c = cidx(i, j);
  const s = isl.surf(i, j);
  const m = isl.moist[c];
  const tint = isl.traitTint;
  if (s === SURF.SOIL) {
    out.copy(COL.grassDry).lerp(COL.grassMid, clamp(m * 2.2, 0, 1)).lerp(COL.grassLush, clamp((m - 0.5) * 2, 0, 1) * 0.8);
    if (tint) out.lerp(tint, 0.25);
    if (isl.soil[c] < 0.5) out.lerp(COL.soil, clamp(1 - isl.soil[c] / 0.5, 0, 1) * 0.65);
  } else if (s === SURF.ROCK) out.copy(COL.rock);
  else if (s === SURF.ORE) out.copy(COL.ore);
  else if (s === SURF.CRYSTAL) out.copy(COL.crystal);
  else if (s === SURF.CLAY) out.copy(COL.clay);
  else if (s === SURF.ASH) out.copy(COL.ash);
  else if (s === SURF.SNOW) out.copy(COL.snow);
  else out.copy(COL.sand);
  // Note: shore sand next to water.
  let wet = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (inB(i + di, j + dj) && isl.water[cidx(i + di, j + dj)] > 0.08) wet = 1;
  if (wet && s === SURF.SOIL && isl.water[c] < 0.08) out.lerp(COL.sand, 0.55);
  if (isl.snow[c] > 0.05 && s !== SURF.SNOW) out.lerp(COL.snow, isl.snow[c] * 0.9);
  if (isl.ash[c] > 0.05 && s !== SURF.ASH) out.lerp(COL.ash, isl.ash[c] * 0.7);
  if (isl.fire[c] > 0.05) out.lerp(COL.fire, clamp(isl.fire[c], 0, 1) * 0.65);
  if (isl.bld[c] >= 0) out.lerp(COL.soil, 0.55);
  // Note: painted rare ground; sleeping islands show it washed toward grey rock.
  const pc = isl.paint ? isl.paint[c] : 0;
  if (pc && PAINT_COL[pc] && !(pc === PAINT.BED && isl.snow[c] > 0.3)) {
    out.lerp(PAINT_COL[pc], PAINT_STR[pc]);
  }
  if (isl.rareSlot && typeof isl.relic !== 'string') out.lerp(COL.rock, 0.4);
  if (steep > 0 && s !== SURF.SNOW) out.lerp(isl.soil[c] > 0.5 ? COL.rock : COL.rockDark, clamp(steep, 0, 1));
  const lum = 1 + jit(i, j, tri, 0.12);
  out.r = clamp(out.r * lum, 0, 1); out.g = clamp(out.g * lum, 0, 1); out.b = clamp(out.b * lum, 0, 1);
}

export function buildTerrain(isl) {
  if (isl.traitTint === undefined) {
    isl.traitTint = null;
    for (const t of isl.traits) if (TRAITS[t]) { isl.traitTint = isl.traitTint ? isl.traitTint.lerp(C(TRAITS[t].tint), 0.5) : C(TRAITS[t].tint); }
  }
  const pos = []; const col = [];
  const col3 = new THREE.Color();
  const push = (a, b, c, i, j, tri) => {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    const steep = clamp((0.78 - Math.abs(ny / l)) * 4, 0, 1);
    cellColor(isl, i, j, col3, tri, steep);
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) col.push(col3.r, col3.g, col3.b);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!isl.mask[cidx(i, j)]) continue;
    const x0 = i - N / 2; const z0 = j - N / 2;
    const h00 = isl.h[vidx(i, j)]; const h10 = isl.h[vidx(i + 1, j)]; const h01 = isl.h[vidx(i, j + 1)]; const h11 = isl.h[vidx(i + 1, j + 1)];
    const v00 = [x0, h00, z0]; const v10 = [x0 + 1, h10, z0]; const v01 = [x0, h01, z0 + 1]; const v11 = [x0 + 1, h11, z0 + 1];
    if (Math.abs(h00 - h11) < Math.abs(h10 - h01)) { push(v00, v01, v11, i, j, 0); push(v00, v11, v10, i, j, 1); }
    else { push(v00, v01, v10, i, j, 0); push(v10, v01, v11, i, j, 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Note: hull is a bowl over the top mesh's cells; depth follows distance to the coast, so concave shapes cannot fold.
const HULL_Q = [[0, 0], [0.28, 0.1], [0.58, 0.24], [0.9, 0.55], [1, 0.9]];
const hullQ = (t) => {
  for (let k = 1; k < HULL_Q.length; k++) {
    if (t <= HULL_Q[k][0]) { const [t0, q0] = HULL_Q[k - 1]; const [t1, q1] = HULL_Q[k]; return q0 + (q1 - q0) * (t - t0) / (t1 - t0); }
  }
  return 0.9;
};

export function buildUnder(isl) {
  const pos = []; const col = [];
  let hm = 0; let n = 0;
  for (let c = 0; c < N * N; c++) if (isl.mask[c]) { hm += isl.cellH(c % N, (c / N) | 0); n++; }
  hm = n ? hm / n : 3;
  const s0 = isl.seed & 0xffff;
  // Note: coast segments run in vertex units; a vertex on any of them is a rim vertex (distance 0).
  const live = new Uint8Array(VN * VN); const segs = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!isl.mask[cidx(i, j)]) continue;
    live[vidx(i, j)] = live[vidx(i + 1, j)] = live[vidx(i, j + 1)] = live[vidx(i + 1, j + 1)] = 1;
    if (!isl.land(i, j - 1)) segs.push([i, j, i + 1, j]);
    if (!isl.land(i, j + 1)) segs.push([i, j + 1, i + 1, j + 1]);
    if (!isl.land(i - 1, j)) segs.push([i, j, i, j + 1]);
    if (!isl.land(i + 1, j)) segs.push([i + 1, j, i + 1, j + 1]);
  }
  const dist = new Float32Array(VN * VN); let dMax = 0;
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    const v = vidx(i, j);
    if (!live[v]) continue;
    let d = 1e9;
    for (const [x0, z0, x1, z1] of segs) {
      const ex = x1 - x0; const ez = z1 - z0;
      const u = clamp(((i - x0) * ex + (j - z0) * ez) / (ex * ex + ez * ez), 0, 1);
      d = Math.min(d, Math.hypot(i - x0 - ex * u, j - z0 - ez * u));
    }
    dist[v] = d; dMax = Math.max(dMax, d);
  }
  // Note: thin islands get a shallower hull so slopes stay rock-like instead of knife-edged.
  const depthMax = Math.min(5.5 + isl.radius * 0.55, dMax + 1.6);
  const vy = new Float32Array(VN * VN);
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    const v = vidx(i, j);
    if (!live[v]) continue;
    const h = isl.h[v]; const d = dist[v];
    if (d < 1e-6) { vy[v] = h; continue; }
    const t = d / dMax;
    const base = Math.min(h, lerp(h, hm, clamp(d / 2.5, 0, 1)));
    let drop = depthMax * hullQ(t);
    drop += (fbm(s0 + 77, i * 0.4, j * 0.4, 2) - 0.5) * 1.1 * clamp(d / 2, 0, 1);
    // Note: occasional stalactite spikes on the lower flanks.
    if (t > 0.25 && hash2(s0, i, j) % 1000 > 880) drop += 0.8 + (hash2(s0 + 5, i, j) % 100) * 0.012;
    vy[v] = Math.min(base - drop, h - 0.4);
  }
  const thr1 = Math.min(2.2, dMax * 0.4); const thr2 = Math.min(4.6, dMax * 0.75);
  // Note: points are [x, z, y, coast distance] in vertex units.
  const P = (i, j) => { const v = vidx(i, j); return [i, j, vy[v], dist[v]]; };
  const tri = (a, b, c) => {
    const d = (a[3] + b[3] + c[3]) / 3;
    const k = d < thr1 ? 0 : d < thr2 ? 1 : 2;
    tmp.copy(k === 0 ? COL.lip : k === 1 ? COL.under : COL.underDark);
    const l = 1 + jit(Math.round(a[0] * 14), Math.round(a[1] * 14), k + 3 * Math.round(b[0] + c[1]), 0.18);
    for (const q of [a, b, c]) { pos.push(q[0] - N / 2, q[2], q[1] - N / 2); col.push(tmp.r * l, tmp.g * l, tmp.b * l); }
  };
  // Note: each cell is the top mesh's cell mirrored, so rim edges twin the top surface exactly.
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!isl.mask[cidx(i, j)]) continue;
    const p00 = P(i, j); const p10 = P(i + 1, j); const p01 = P(i, j + 1); const p11 = P(i + 1, j + 1);
    // Note: same diagonal as the top mesh, so the hull stays below it inside every cell.
    const diag = Math.abs(isl.h[vidx(i, j)] - isl.h[vidx(i + 1, j + 1)]) < Math.abs(isl.h[vidx(i + 1, j)] - isl.h[vidx(i, j + 1)]);
    const dd = diag ? p00[3] + p11[3] : p10[3] + p01[3];
    if ((p00[3] < 1e-6) + (p10[3] < 1e-6) + (p01[3] < 1e-6) + (p11[3] < 1e-6) >= 3 || dd < 1e-6) {
      // Note: cells with 3+ coast corners or a coast-to-coast diagonal get a centre point, else the hull would touch the top.
      const m = [i + 0.5, j + 0.5, Math.min(isl.h[vidx(i, j)], isl.h[vidx(i + 1, j)], isl.h[vidx(i, j + 1)], isl.h[vidx(i + 1, j + 1)], (p00[2] + p10[2] + p01[2] + p11[2]) / 4) - 0.9 - (hash2(s0, i, j) % 100) * 0.006, 0];
      tri(p00, m, p01); tri(p00, p10, m); tri(p10, p11, m); tri(p01, m, p11);
    } else if (diag) { tri(p00, p11, p01); tri(p00, p10, p11); }
    else { tri(p00, p10, p01); tri(p10, p11, p01); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function buildWater(isl) {
  const pos = []; const col = [];
  const lvl = new Float32Array(VN * VN).fill(NaN);
  const cnt = new Float32Array(VN * VN);
  const sum = new Float32Array(VN * VN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c] || isl.water[c] < 0.02) continue;
    const L = isl.cellH(i, j) + isl.water[c];
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const v = vidx(i + di, j + dj); sum[v] += L; cnt[v]++; }
  }
  for (let v = 0; v < VN * VN; v++) if (cnt[v]) lvl[v] = sum[v] / cnt[v];
  const deepC = C(0x3f8fc9); const shallowC = C(0x8fd2e6); const hotC = C(0x7fe0c8);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = cidx(i, j);
    if (!isl.mask[c] || isl.water[c] < 0.02) continue;
    const x0 = i - N / 2; const z0 = j - N / 2;
    const y = (ii, jj) => lvl[vidx(ii, jj)] + 0.01;
    const a = [x0, y(i, j), z0]; const b = [x0 + 1, y(i + 1, j), z0]; const cc = [x0, y(i, j + 1), z0 + 1]; const d = [x0 + 1, y(i + 1, j + 1), z0 + 1];
    tmp.copy(shallowC).lerp(deepC, clamp(isl.water[c] * 1.2, 0, 1));
    // Note: hot pools get a warm teal tint.
    if (isl.paint && isl.paint[c] === PAINT.HOT) tmp.lerp(hotC, 0.6);
    for (const p of [a, cc, b, b, cc, d]) { pos.push(...p); col.push(tmp.r, tmp.g, tmp.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Note: shared small geometries for instanced rocks, ore and crystal.
function jitterGeo(g, seed, amt) {
  const p = g.attributes.position;
  const m = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!m.has(key)) m.set(key, [(Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt, (Math.random() - 0.5) * amt]);
    const o = m.get(key);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}

export function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.3, 0);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.12, 0);
  return jitterGeo(g, 1, 0.1);
}

export function crystalGeometry() {
  const parts = [];
  const mk = (r, h, x, z, tilt) => {
    const g = new THREE.ConeGeometry(r, h, 5, 1).toNonIndexed();
    g.translate(0, h / 2, 0);
    g.rotateZ(tilt[0]); g.rotateX(tilt[1]);
    g.translate(x, 0, z);
    parts.push(g);
  };
  mk(0.1, 0.55, 0, 0, [0, 0]); mk(0.08, 0.38, 0.14, 0.06, [-0.35, 0.2]); mk(0.07, 0.3, -0.12, 0.08, [0.4, -0.1]);
  return mergeGeos(parts);
}

export function mergeGeos(list) {
  const pos = []; const nor = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    pos.push(...ng.attributes.position.array);
    nor.push(...ng.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
