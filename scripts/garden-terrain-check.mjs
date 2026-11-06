// Note: node check that island top + underside meshes form one closed, outward-wound, fold-free surface.
// Run from repo root: NODE_NO_WARNINGS=1 node scripts/garden-terrain-check.mjs [seeds]
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = pathToFileURL(path.join(root, 'public/garden/vendor/three.module.js')).href;
const hook = `export async function resolve(s, c, next) {
  if (s === 'three') return { url: ${JSON.stringify(threeUrl)}, shortCircuit: true };
  return next(s, c);
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`, import.meta.url);

const J = (f) => import(pathToFileURL(path.join(root, 'public/garden/js', f)).href);
const { generateIsland, cidx } = await J('island.js');
const { buildTerrain, buildUnder, buildWater } = await J('terrain.js');
const { rareTerrain, auditRare, RARE_TRAITS } = await J('rareisles.js');

const seeds = Number(process.argv[2] || 12);
let failures = 0;
let meshes = 0;
const fail = (m) => { failures++; if (failures < 40) console.error('FAIL:', m); };

// Note: welds vertices by rounded position and tallies directed edges across all given geometries.
function analyse(geos, label) {
  meshes++;
  const ids = new Map();
  const id = (x, y, z) => {
    const k = `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`;
    let v = ids.get(k);
    if (v === undefined) { v = ids.size; ids.set(k, v); }
    return v;
  };
  const dir = new Map();
  let vol = 0; let tris = 0;
  for (const g of geos) {
    const a = g.attributes.position.array;
    for (let t = 0; t < a.length; t += 9) {
      const A = [a[t], a[t + 1], a[t + 2]]; const B = [a[t + 3], a[t + 4], a[t + 5]]; const C = [a[t + 6], a[t + 7], a[t + 8]];
      if (![...A, ...B, ...C].every(Number.isFinite)) { fail(`${label}: non-finite position`); return; }
      const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
      const vx = C[0] - A[0]; const vy = C[1] - A[1]; const vz = C[2] - A[2];
      const cx = uy * vz - uz * vy; const cy = uz * vx - ux * vz; const cz = ux * vy - uy * vx;
      if (Math.hypot(cx, cy, cz) < 1e-9) continue;
      tris++;
      vol += (A[0] * cx + A[1] * cy + A[2] * cz) / 6;
      const w = [A, B, C].map((q) => id(q[0], q[1], q[2]));
      for (let e = 0; e < 3; e++) {
        const k = `${w[e]}>${w[(e + 1) % 3]}`;
        dir.set(k, (dir.get(k) || 0) + 1);
      }
    }
  }
  // Note: pinch vertices (diagonal-only cells) legitimately double an edge, so twin counts must match instead of being 1.
  let open = 0; let unbalanced = 0;
  for (const [k, n] of dir) {
    const [s, e] = k.split('>');
    const m = dir.get(`${e}>${s}`) || 0;
    if (!m) open++;
    else if (m !== n) unbalanced++;
  }
  if (open) fail(`${label}: ${open} edges without an opposite twin (gap or flipped triangle)`);
  if (unbalanced) fail(`${label}: ${unbalanced} edges with mismatched twin count (overlap or inconsistent winding)`);
  if (!(vol > 0)) fail(`${label}: signed volume ${vol.toFixed(2)} not positive (inward winding)`);
  if (!tris) fail(`${label}: no triangles`);
}

// Note: hull must be a fold-free bowl: all triangles face down, and it stays below the top surface at sampled points.
function hullSane(top, under, isl, label) {
  const T = top.attributes.position.array; const U = under.attributes.position.array;
  const cells = new Map();
  for (let t = 0; t < T.length; t += 9) {
    const k = `${Math.floor(Math.min(T[t], T[t + 3], T[t + 6]) + 12)},${Math.floor(Math.min(T[t + 2], T[t + 5], T[t + 8]) + 12)}`;
    (cells.get(k) || cells.set(k, []).get(k)).push(t);
  }
  const heightIn = (A, ts, x, z) => {
    for (const t of ts) {
      const [x0, z0, x1, z1, x2, z2] = [A[t], A[t + 2], A[t + 3], A[t + 5], A[t + 6], A[t + 8]];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(det) < 1e-12) continue;
      const a = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det; const b = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det; const c = 1 - a - b;
      if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) return a * A[t + 1] + b * A[t + 4] + c * A[t + 7];
    }
    return NaN;
  };
  const byCell = new Map();
  for (let t = 0; t < U.length; t += 9) {
    const ux = U[t + 3] - U[t]; const uy = U[t + 4] - U[t + 1]; const uz = U[t + 5] - U[t + 2];
    const vx = U[t + 6] - U[t]; const vy = U[t + 7] - U[t + 1]; const vz = U[t + 8] - U[t + 2];
    const ny = uz * vx - ux * vz;
    if (ny > -1e-9) { fail(`${label}: hull triangle not facing down (fold)`); return; }
    const k = `${Math.floor(Math.min(U[t], U[t + 3], U[t + 6]) + 12)},${Math.floor(Math.min(U[t + 2], U[t + 5], U[t + 8]) + 12)}`;
    (byCell.get(k) || byCell.set(k, []).get(k)).push(t);
  }
  let bad = 0;
  for (const [k, us] of byCell) {
    const ts = cells.get(k); if (!ts) continue;
    const [ci, cj] = k.split(',').map(Number);
    for (const [fx, fz] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = ci - 12 + fx; const z = cj - 12 + fz;
      const yt = heightIn(T, ts, x, z); const yb = heightIn(U, us, x, z);
      if (Number.isNaN(yt) || Number.isNaN(yb)) { bad++; continue; }
      if (yb > yt - 0.05) { bad++; }
    }
  }
  if (bad) fail(`${label}: ${bad} sample points where hull is not below the top surface`);
}

const check = (isl, label) => {
  const top = buildTerrain(isl); const under = buildUnder(isl);
  analyse([top, under], label);
  hullSane(top, under, isl, label);
};

// Note: synthetic masks cover thin necks, L shapes, single cells, diagonal-only touches and holes.
function stamp(isl, cells) {
  isl.mask.fill(0);
  for (const [i, j] of cells) isl.mask[cidx(i, j)] = 1;
  for (let v = 0; v < isl.h.length; v++) { isl.h[v] = 3 + ((v * 7919) % 13) * 0.2; isl.under[v] = 1.2 + ((v * 104729) % 17) * 0.15; }
}
const rect = (x0, z0, x1, z1) => { const o = []; for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) o.push([i, j]); return o; };
const shapes = {
  single: [[11, 11]],
  domino: rect(10, 10, 11, 10),
  L: [...rect(6, 6, 14, 8), ...rect(6, 9, 8, 16)],
  neck: [...rect(3, 8, 8, 14), ...rect(9, 11, 14, 11), ...rect(15, 8, 20, 14)],
  diagonal: [[8, 8], [9, 9], [10, 8], [9, 7], ...rect(11, 8, 13, 10)],
  ring: rect(6, 6, 16, 16).filter(([i, j]) => i < 9 || i > 13 || j < 9 || j > 13),
  crescent: rect(4, 4, 18, 18).filter(([i, j]) => Math.hypot(i - 11, j - 11) < 8 && Math.hypot(i - 14, j - 11) > 5),
  edge: [...rect(0, 0, 3, 3), ...rect(20, 20, 23, 23), ...rect(0, 20, 1, 23)],
  plus: [...rect(10, 4, 12, 18), ...rect(4, 10, 18, 12)],
};
const base = generateIsland(1, 3, 3);
for (const [name, cells] of Object.entries(shapes)) {
  stamp(base, cells);
  check(base, `synthetic ${name}`);
}

// Note: generated islands across seeds and grid cells, plus a dug variant.
for (let s = 0; s < seeds; s++) {
  for (const [gx, gz] of [[0, 0], [1, 0], [0, 1], [-1, 1], [2, -1], [3, 2], [-2, -2]]) {
    const isl = generateIsland(1000 + s * 37, gx, gz);
    check(isl, `seed ${1000 + s * 37} ${gx},${gz} ${isl.shape}`);
    for (let v = 0; v < isl.h.length; v += 3) isl.h[v] = Math.max(1.2, isl.h[v] - 1.1);
    check(isl, `seed ${1000 + s * 37} ${gx},${gz} ${isl.shape} dug`);
  }
}

// Note: rare islands over 50 seeds: mesh closure, hull, water mesh, audit (reach, sites, heights) and determinism.
const hashIsl = (isl) => {
  let h = 2166136261;
  const mix = (a) => { for (let k = 0; k < a.length; k++) { h = Math.imul(h ^ (Math.round(a[k] * 1000) | 0), 16777619) >>> 0; } };
  mix(isl.h); mix(isl.under); mix(isl.mask); mix(isl.water); mix(isl.soil); mix(isl.snow); mix(isl.plant); mix(isl.dep); mix(isl.paint); mix(isl.stone);
  mix(isl.rare.deposits.flatMap((d) => [d.i, d.j, d.n])); mix(Object.values(isl.rare.sites).flatMap((r) => [r.x, r.y]));
  return h;
};
let rareCount = 0;
for (let s = 0; s < 50; s++) {
  for (const trait of [...RARE_TRAITS, 'spire']) {
    const seed = 2000 + s * 53;
    const a = generateIsland(seed, 5, 0); rareTerrain(a, trait);
    const b = generateIsland(seed, 5, 0); rareTerrain(b, trait);
    rareTerrain(b, trait);
    rareCount++;
    const label = `rare ${trait} seed ${seed}`;
    if (hashIsl(a) !== hashIsl(b)) fail(`${label}: not deterministic or not idempotent`);
    check(a, label);
    const w = buildWater(a);
    if (w.attributes.position.array.some((v) => !Number.isFinite(v))) fail(`${label}: water mesh not finite`);
    for (const m of auditRare(a)) fail(`${label}: ${m}`);
  }
}
console.log(`${rareCount} rare islands checked`);

console.log(`${meshes} islands checked, ${failures} failures`);
if (failures) process.exit(1);
console.log('terrain checks ok');
