// Note: island data model and deterministic procedural generation (shape + traits); no rendering.

import { N, STEP_MAX, STAIR_MAX, TRAITS, TRAIT_IDS, SHAPES, SOIL_MAX, MIN_H, MAX_H, PLANT_KINDS, KNOWLEDGE, SURF, SPACING } from './config.js';
import { hash2, rng, fbm, clamp, b64encode, b64decode } from './rand.js';

export const VN = N + 1;
export const cidx = (i, j) => j * N + i;
export const vidx = (i, j) => j * VN + i;
export const inB = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
export const PK = Object.fromEntries(PLANT_KINDS.map((k, n) => [k, n]));
export const DEP = { NONE: 0, ORE: 1, CRYSTAL: 2, CLAY: 3 };

const CELL_ARRAYS = {
  mask: Uint8Array, soil: Float32Array, plant: Uint8Array, grow: Float32Array, moist: Float32Array, water: Float32Array,
  fire: Float32Array, ash: Float32Array, snow: Float32Array, stone: Uint8Array, dep: Uint8Array, depTop: Float32Array,
  depAmt: Uint8Array, bld: Int16Array, fishCd: Float32Array,
};

export class Island {
  constructor(id, gx, gz) {
    this.id = id;
    this.gx = gx;
    this.gz = gz;
    this.wx = 0;
    this.wz = 0;
    this.seed = 0;
    this.shape = 'round';
    this.traits = [];
    this.radius = 9;
    this.revealed = false;
    this.relic = null; // { know, i, j, taken } on ordinary islands, a key string on awakened rare islands
    // Note: rare-island and landmark fields; rareisles.js rareTerrain fills rareSlot, special, dormant, rare and paint.
    this.rareSlot = null; this.special = null; this.dormant = false; this.rare = null; this.paint = null;
    this.landmark = null; // id of the trait landmark this island has started
    this.geysers = []; // [{i,j,t}]
    this.springs = []; // [{i,j}]
    this.buildings = []; // see econ.js
    this.stock = {};
    this.rung = 1; this.arch = null; this.use = {}; this.score = 0; this.festival = null; this.artNext = 0;
    this.ver = { terrain: 1, plant: 1, water: 1, bld: 1 };
    this.h = new Float32Array(VN * VN);
    this.under = new Float32Array(VN * VN);
    for (const k in CELL_ARRAYS) this[k] = new CELL_ARRAYS[k](N * N);
    this.bld.fill(-1);
    this.landCount = 0;
    this.cx = N / 2;
    this.cz = N / 2;
  }

  has(t) { return this.traits.includes(t); }
  land(i, j) { return inB(i, j) && this.mask[cidx(i, j)] === 1; }

  cellH(i, j) {
    const a = j * VN + i;
    return (this.h[a] + this.h[a + 1] + this.h[a + VN] + this.h[a + VN + 1]) * 0.25;
  }

  // Note: surface height at a local cell coordinate (continuous), bilinear over vertices.
  heightAt(fx, fz) {
    const x = clamp(fx, 0, N - 0.001);
    const z = clamp(fz, 0, N - 0.001);
    const i = Math.floor(x);
    const j = Math.floor(z);
    const u = x - i;
    const v = z - j;
    const a = j * VN + i;
    return (this.h[a] * (1 - u) + this.h[a + 1] * u) * (1 - v) + (this.h[a + VN] * (1 - u) + this.h[a + VN + 1] * u) * v;
  }

  waterLevel(i, j) { return this.cellH(i, j) + this.water[cidx(i, j)]; }

  depExposed(i, j) {
    const c = cidx(i, j);
    return this.dep[c] !== 0 && this.depAmt[c] > 0 && this.cellH(i, j) <= this.depTop[c] + 0.05;
  }

  surf(i, j) {
    const c = cidx(i, j);
    if (this.snow[c] > 0.5) return SURF.SNOW;
    if (this.depExposed(i, j)) return this.dep[c] === DEP.ORE ? SURF.ORE : this.dep[c] === DEP.CRYSTAL ? SURF.CRYSTAL : SURF.CLAY;
    if (this.ash[c] > 0.5) return SURF.ASH;
    if (this.soil[c] < 0.12) return SURF.ROCK;
    return SURF.SOIL;
  }

  // Note: cell centre in island-local world units (island centre is origin).
  cx0(i) { return i + 0.5 - N / 2; }
  cz0(j) { return j + 0.5 - N / 2; }

  walkable(i, j) {
    if (!this.land(i, j)) return false;
    const c = cidx(i, j);
    if (this.water[c] > 0.45) return false;
    if (this.fire[c] > 0) return false;
    if (this.bld[c] >= 0) {
      const b = this.buildings[this.bld[c]];
      // Note: the campfire cell is blocked too; folk sit on the ring cells around it.
      if (b && b.id !== 'dock' && !((b.id === 'hall' || b.id === 'stairs') && b.built) && !(b.id === 'art' && b.kind === 'doodle')) return false;
    }
    return true;
  }

  stepOk(i, j, ni, nj) {
    if (!this.walkable(ni, nj)) return false;
    const d = Math.abs(this.cellH(i, j) - this.cellH(ni, nj));
    if (d <= STEP_MAX) return true;
    return d <= STAIR_MAX && this.stairBetween(i, j, ni, nj);
  }

  // Note: a built stair or ladder on one cell links it to its partner cell above or below.
  stairBetween(i, j, ni, nj) {
    if (i !== ni && j !== nj) return false;
    for (const [a, b, c, d] of [[i, j, ni, nj], [ni, nj, i, j]]) {
      const k = this.bld[cidx(a, b)];
      const s = k >= 0 ? this.buildings[k] : null;
      if (s && s.id === 'stairs' && s.built && !s.gone && s.x + s.dx === c && s.y + s.dz === d) return true;
    }
    return false;
  }

  touch(kind) { this.ver[kind]++; }

  toJSON() {
    const o = {
      id: this.id, gx: this.gx, gz: this.gz, revealed: this.revealed, relic: this.relic, geysers: this.geysers,
      springs: this.springs, buildings: this.buildings, stock: this.stock, rung: this.rung, arch: this.arch, use: this.use,
      landmark: this.landmark, rareN: this.rare ? this.rare.deposits.map((d) => d.n) : null,
      h: b64encode(new Uint8Array(this.h.buffer)),
    };
    for (const k in CELL_ARRAYS) if (k !== 'mask') o[k] = b64encode(new Uint8Array(this[k].buffer));
    return o;
  }

  // Note: restores mutable state onto a freshly generated island with the same coordinates.
  restore(o) {
    this.revealed = !!o.revealed;
    this.relic = o.relic;
    this.geysers = o.geysers || [];
    this.springs = o.springs || [];
    this.buildings = o.buildings || [];
    for (const b of this.buildings) if (b && b.id === 'art') { b.growth = 1; b.repairing = false; }
    for (const b of this.buildings) if (b) b.tender = null;
    this.stock = o.stock || {};
    this.rung = o.rung || 1; this.arch = o.arch || null; this.use = o.use || {};
    this.landmark = o.landmark || null;
    // Note: rareTerrain ran first; it mirrors rareisles.isDormant, which island.js cannot import.
    this.dormant = !!this.rareSlot && typeof this.relic !== 'string';
    if (this.rare && Array.isArray(o.rareN)) this.rare.deposits.forEach((d, k) => { if (Number.isFinite(o.rareN[k])) d.n = o.rareN[k]; });
    const put = (arr, s) => {
      const u8 = b64decode(s);
      new Uint8Array(arr.buffer).set(u8.subarray(0, arr.buffer.byteLength));
    };
    put(this.h, o.h);
    for (const k in CELL_ARRAYS) if (k !== 'mask' && o[k]) put(this[k], o[k]);
    this.touch('terrain'); this.touch('plant'); this.touch('water'); this.touch('bld');
  }
}

export function ringOf(gx, gz) { return Math.max(Math.abs(gx), Math.abs(gz)); }

// Note: ring 1 draws its relic from the four basic crafts; outer rings follow relicPlan in rareisles.js.
const RELIC_POOL_1 = ['masonry', 'milling', 'baking', 'smelting'];

// Note: these four traits live only on the fixed rare slots (rareisles.js), never on random islands.
const RARE_ONLY = new Set(['volcanic', 'springs', 'frozen', 'arid']);
const PICK_IDS = TRAIT_IDS.filter((t) => !RARE_ONLY.has(t));

function pickTraits(r, home) {
  if (home) return ['meadow', 'cliffy', 'fertile'];
  const n = r.chance(0.35) ? 1 : r.chance(0.7) ? 2 : 3;
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 40) {
    const total = PICK_IDS.reduce((s, t) => s + TRAITS[t].weight, 0);
    let x = r() * total;
    let pick = PICK_IDS[0];
    for (const t of PICK_IDS) { x -= TRAITS[t].weight; if (x <= 0) { pick = t; break; } }
    if (out.includes(pick)) continue;
    out.push(pick);
  }
  return out;
}

function makeMask(isl, r) {
  const mask = isl.mask;
  const R = isl.radius;
  const sh = isl.shape;
  const ox = r.range(-1, 1);
  const oz = r.range(-1, 1);
  const ang = r.range(0, Math.PI);
  const s0 = isl.seed & 0xffff;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i + 0.5 - N / 2 - ox;
      const z = j + 0.5 - N / 2 - oz;
      let d;
      if (sh === 'round') d = Math.hypot(x, z) / R;
      else if (sh === 'long') {
        const a = x * Math.cos(ang) + z * Math.sin(ang);
        const b = -x * Math.sin(ang) + z * Math.cos(ang);
        d = Math.hypot(a / (R * 1.25), b / (R * 0.62));
      } else if (sh === 'crescent') {
        const d1 = Math.hypot(x, z) / R;
        const d2 = Math.hypot(x - Math.cos(ang) * R * 0.55, z - Math.sin(ang) * R * 0.55) / (R * 0.8);
        d = d2 < 1 ? 2 : d1;
      } else if (sh === 'twin') {
        const ax = Math.cos(ang) * R * 0.52;
        const az = Math.sin(ang) * R * 0.52;
        const d1 = Math.hypot(x - ax, z - az) / (R * 0.6);
        const d2 = Math.hypot(x + ax, z + az) / (R * 0.6);
        const t = Math.abs((x * -Math.sin(ang) + z * Math.cos(ang))) / (R * 0.28);
        const neck = Math.abs(x * Math.cos(ang) + z * Math.sin(ang)) < R * 0.7 ? t : 9;
        d = Math.min(d1, d2, neck);
      } else {
        d = Math.hypot(x, z) / R * (0.8 + 0.4 * fbm(s0, i * 0.35, j * 0.35, 2));
      }
      const wob = (fbm(s0 + 7, i * 0.3, j * 0.3, 2) - 0.5) * 0.35;
      mask[cidx(i, j)] = d + wob < 1 ? 1 : 0;
    }
  }
  // Note: keep only the largest connected component of land.
  const seen = new Uint8Array(N * N);
  let best = [];
  for (let c0 = 0; c0 < N * N; c0++) {
    if (!mask[c0] || seen[c0]) continue;
    const comp = [c0];
    seen[c0] = 1;
    for (let q = 0; q < comp.length; q++) {
      const c = comp[q];
      const i = c % N;
      const j = (c / N) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (!inB(ni, nj)) continue;
        const n = cidx(ni, nj);
        if (mask[n] && !seen[n]) { seen[n] = 1; comp.push(n); }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  mask.fill(0);
  for (const c of best) mask[c] = 1;
  isl.landCount = best.length;
}

function edgeDist(isl) {
  // Note: chamfer distance in cells to the nearest non-land cell.
  const d = new Float32Array(N * N).fill(99);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!isl.land(i, j)) d[cidx(i, j)] = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = cidx(i, j);
      for (const [di, dj, w] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.4], [1, -1, 1.4]]) {
        const ni = i + di; const nj = j + dj;
        if (inB(ni, nj)) d[c] = Math.min(d[c], d[cidx(ni, nj)] + w);
        else d[c] = Math.min(d[c], 1 + (w > 1 ? 0.4 : 0));
      }
    }
    for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
      const c = cidx(i, j);
      for (const [di, dj, w] of [[1, 0, 1], [0, 1, 1], [1, 1, 1.4], [-1, 1, 1.4]]) {
        const ni = i + di; const nj = j + dj;
        if (inB(ni, nj)) d[c] = Math.min(d[c], d[cidx(ni, nj)] + w);
        else d[c] = Math.min(d[c], 1 + (w > 1 ? 0.4 : 0));
      }
    }
  }
  return d;
}

function landCells(isl) {
  const out = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (isl.land(i, j)) out.push([i, j]);
  return out;
}

function setVertexHeightsFromCells(isl, ch) {
  // Note: vertex height is the mean of the surrounding land cells' target heights.
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    let s = 0; let n = 0;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ci = i + di; const cj = j + dj;
      if (inB(ci, cj) && isl.mask[cidx(ci, cj)]) { s += ch[cidx(ci, cj)]; n++; }
    }
    isl.h[vidx(i, j)] = n ? s / n : 2.8;
  }
}

// Note: base island with position, traits, shape and radius; r continues into the mask draws.
function baseIsland(worldSeed, gx, gz) {
  const id = `${gx},${gz}`;
  const isl = new Island(id, gx, gz);
  const home = gx === 0 && gz === 0;
  isl.seed = hash2(gx, gz, worldSeed);
  const r = rng(isl.seed);
  // Note: ring 1 sits a little closer to home so early links stay possible; ring 2 is pulled in too so a rope route to its relics exists on every seed; outer rings scatter wider.
  const ring = Math.max(Math.abs(gx), Math.abs(gz));
  const jit = ring <= 1 ? 3 : 9;
  const pull = ring === 1 ? (hash2(gx, gz, worldSeed + 13) % 800) / 100 : ring === 2 ? (hash2(gx, gz, worldSeed + 13) % 600) / 100 : 0;
  isl.wx = gx * (SPACING - pull) + (home ? 0 : (hash2(gx, gz, worldSeed + 5) % 1000) / 1000 * 2 * jit - jit);
  isl.wz = gz * (SPACING - pull) + (home ? 0 : (hash2(gx, gz, worldSeed + 9) % 1000) / 1000 * 2 * jit - jit);
  isl.traits = pickTraits(r, home);
  isl.shape = home ? 'round' : r.pick(SHAPES);
  isl.radius = home ? 9.5 : r.range(7.2, 10.6);
  return { isl, r, home, ring };
}

// Note: cheap geometry (wx, wz, radius, traits, shape) of an island without terrain; equals what generateIsland yields.
export function islandGeom(worldSeed, gx, gz) { return baseIsland(worldSeed, gx, gz).isl; }

// Note: know is the fixed relic knowledge from rareisles.js relicPlan; rings >= 2 carry a relic only when it is given.
export function generateIsland(worldSeed, gx, gz, know) {
  const { isl, r, home, ring } = baseIsland(worldSeed, gx, gz);
  makeMask(isl, r);
  const s0 = isl.seed & 0xffff;
  const ed = edgeDist(isl);
  const cells = landCells(isl);
  const ch = new Float32Array(N * N);
  const rough = isl.has('cliffy') ? 1.7 : isl.has('windy') ? 1.4 : 1.0;
  for (const [i, j] of cells) {
    const c = cidx(i, j);
    const hills = fbm(s0 + 3, i * 0.16, j * 0.16, 3) - 0.5;
    ch[c] = 3.3 + hills * 2.6 * rough - Math.max(0, 1.6 - ed[c]) * 0.22;
  }
  // Note: cliffy: an enclosed rock-walled pocket holds buried ore; digging the wall opens it.
  let pocket = null;
  if (isl.has('cliffy')) {
    const cand = cells.filter(([i, j]) => ed[cidx(i, j)] > 5.5 && Math.hypot(i - N / 2, j - N / 2) > 2.5);
    const [pi, pj] = cand.length ? cand[Math.floor(r() * cand.length)] : cells[Math.floor(cells.length / 2)];
    pocket = { i: pi, j: pj };
    for (const [i, j] of cells) {
      const d = Math.hypot(i - pi, j - pj);
      const c = cidx(i, j);
      const ridge = 6.7 + (fbm(s0 + 11, i * 0.5, j * 0.5, 2) - 0.5) * 1.2;
      if (d < 2.3) ch[c] = 2.7;
      else if (d < 4.2) ch[c] = ridge;
      else if (d < 5.4) { const t = (d - 4.2) / 1.2; ch[c] = ridge + (ch[c] - ridge) * t * t * (3 - 2 * t); }
    }
  }
  if (isl.has('tidal')) {
    for (const [i, j] of cells) {
      const c = cidx(i, j);
      if (ed[c] < 3.2) ch[c] = Math.min(ch[c], 2.35 + ed[c] * 0.16);
    }
  }
  if (isl.has('volcanic')) {
    const [vi, vj] = cells[Math.floor(cells.length * 0.4)];
    for (const [i, j] of cells) {
      const d = Math.hypot(i - vi, j - vj);
      const c = cidx(i, j);
      if (d < 4.5) ch[c] += (4.5 - d) * 0.9;
      if (d < 1.2) ch[c] -= 1.4;
    }
  }
  if (isl.has('crystal')) {
    for (let k = 0; k < 5; k++) {
      const [ci, cj] = cells[Math.floor(r() * cells.length)];
      for (const [i, j] of cells) {
        const d = Math.hypot(i - ci, j - cj);
        if (d < 2.2) ch[cidx(i, j)] += (2.2 - d) * 0.8;
      }
    }
  }
  for (const [i, j] of cells) {
    const c = cidx(i, j);
    ch[c] = clamp(ch[c], MIN_H + 0.6, MAX_H);
  }
  setVertexHeightsFromCells(isl, ch);

  // Note: underside depth per vertex gives each island its tapered floating rock.
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    let d = 99;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ci = i + di; const cj = j + dj;
      if (inB(ci, cj) && isl.mask[cidx(ci, cj)]) d = Math.min(d, ed[cidx(ci, cj)]);
    }
    const depth = d === 99 ? 0 : 1.2 + d * 1.15 + fbm(s0 + 21, i * 0.35, j * 0.35, 2) * 2.2;
    isl.under[vidx(i, j)] = depth;
  }

  // Note: materials and fields.
  for (const [i, j] of cells) {
    const c = cidx(i, j);
    const h = isl.cellH(i, j);
    isl.soil[c] = clamp(SOIL_MAX * (isl.has('fertile') ? 1 : 0.8) - Math.max(0, h - 4.8) * 0.5 + (fbm(s0 + 5, i * 0.3, j * 0.3, 2) - 0.5) * 0.5, 0, SOIL_MAX);
    isl.moist[c] = isl.has('misty') ? 0.75 : isl.has('arid') ? 0.12 : 0.45;
    if (isl.has('frozen')) isl.snow[c] = 0.8;
    if (isl.has('volcanic') && fbm(s0 + 31, i * 0.3, j * 0.3, 2) > 0.45) { isl.ash[c] = 0.9; isl.soil[c] *= 0.5; }
  }

  // Note: water bodies: tidal rim, hot springs, home pond.
  const addWater = (i, j, d) => { if (isl.land(i, j)) isl.water[cidx(i, j)] = Math.max(isl.water[cidx(i, j)], d); };
  if (isl.has('tidal')) {
    for (const [i, j] of cells) if (ed[cidx(i, j)] < 3.2) addWater(i, j, Math.max(0, 2.95 - isl.cellH(i, j)));
    // Note: the tidal sea holds its depth: it neither drains over the rim nor dries up.
    isl.hold = new Float32Array(N * N);
    for (const [i, j] of cells) { const c = cidx(i, j); if (ed[c] < 3.2 && isl.water[c] >= 0.03) isl.hold[c] = isl.water[c]; }
  }
  const springCount = isl.has('springs') ? 2 : home ? 1 : isl.has('misty') ? 1 : 0;
  for (let k = 0; k < springCount; k++) {
    const cand = cells.filter(([i, j]) => ed[cidx(i, j)] > 3 && isl.cellH(i, j) < 3.6 && (!pocket || Math.hypot(i - pocket.i, j - pocket.j) > 5));
    if (!cand.length) break;
    const [si, sj] = cand[Math.floor(r() * cand.length)];
    isl.springs.push({ i: si, j: sj, hot: isl.has('springs') });
    for (const [i, j] of cells) {
      const d = Math.hypot(i - si, j - sj);
      if (d < 1.7) { isl.water[cidx(i, j)] = Math.max(isl.water[cidx(i, j)], 0.55 - d * 0.18); isl.moist[cidx(i, j)] = 1; }
    }
  }
  if (isl.has('volcanic')) {
    for (let k = 0; k < 2; k++) {
      const [gi, gj] = cells[Math.floor(r() * cells.length)];
      isl.geysers.push({ i: gi, j: gj, t: r.range(0, 30) });
    }
  }

  // Note: deposits: ore, crystal, clay.
  const oreCells = [];
  if (pocket) {
    for (const [i, j] of cells) {
      const d = Math.hypot(i - pocket.i, j - pocket.j);
      if (d < 4.4 && r() < 0.5) {
        const c = cidx(i, j);
        isl.dep[c] = DEP.ORE;
        isl.depAmt[c] = r.int(3, 6);
        isl.depTop[c] = isl.cellH(i, j) - (d < 2.4 ? -0.2 : 1.1);
        oreCells.push(c);
      }
    }
  }
  const scatterDeps = (kind, n, amt, buried) => {
    for (let k = 0; k < n; k++) {
      const [i, j] = cells[Math.floor(r() * cells.length)];
      const c = cidx(i, j);
      if (isl.dep[c] || isl.water[c] > 0.05) continue;
      isl.dep[c] = kind;
      isl.depAmt[c] = r.int(amt[0], amt[1]);
      isl.depTop[c] = isl.cellH(i, j) - (buried ? 0.9 : -0.3);
    }
  };
  if (isl.has('volcanic')) scatterDeps(DEP.ORE, 7, [3, 6], false);
  else if (!home && r.chance(0.5)) scatterDeps(DEP.ORE, 3, [2, 5], true);
  if (isl.has('crystal')) scatterDeps(DEP.CRYSTAL, 8, [2, 5], false);
  if (isl.has('clay') || home) {
    for (const [i, j] of cells) {
      const c = cidx(i, j);
      if (isl.water[c] > 0.01) continue;
      let nearWater = false;
      for (let di = -2; di <= 2 && !nearWater; di++) for (let dj = -2; dj <= 2; dj++) {
        if (inB(i + di, j + dj) && isl.water[cidx(i + di, j + dj)] > 0.05) { nearWater = true; break; }
      }
      if (nearWater && !isl.dep[c] && r() < (isl.has('clay') ? 0.45 : 0.3)) {
        isl.dep[c] = DEP.CLAY; isl.depAmt[c] = r.int(3, 6); isl.depTop[c] = isl.cellH(i, j) + 0.1;
      }
    }
  }

  // Note: stones, plants.
  const rockish = (c) => (isl.cellH(c % N, (c / N) | 0) > 5 ? 0.16 : 0.05) + (isl.has('cliffy') || isl.has('volcanic') ? 0.05 : 0);
  for (const [i, j] of cells) {
    const c = cidx(i, j);
    if (isl.water[c] > 0.05) continue;
    if (r() < rockish(c)) isl.stone[c] = r.int(1, 3);
  }
  const plant = (i, j, kind, g) => {
    const c = cidx(i, j);
    if (!isl.land(i, j) || isl.water[c] > 0.12 || isl.plant[c] || isl.stone[c] || isl.dep[c]) return;
    isl.plant[c] = PK[kind];
    isl.grow[c] = g === undefined ? r.range(0.5, 1) : g;
  };
  const dens = (isl.has('verdant') ? 0.28 : isl.has('arid') ? 0.04 : 0.1);
  for (const [i, j] of cells) {
    const c = cidx(i, j);
    if (isl.surf(i, j) !== SURF.SOIL && isl.surf(i, j) !== SURF.SNOW) continue;
    if (isl.cellH(i, j) > 5.2) continue;
    const n = fbm(s0 + 41, i * 0.3, j * 0.3, 2);
    if (r() < dens * (n > 0.5 ? 2 : 0.6)) {
      plant(i, j, isl.has('frozen') ? 'pine' : isl.has('orchard') && r() < 0.6 ? 'fruittree' : r() < 0.82 ? 'tree' : 'bush');
    } else if (r() < (isl.has('meadow') ? 0.22 : 0.07)) {
      plant(i, j, r() < 0.15 ? 'bush' : 'flower');
    }
    if (isl.has('tidal') && isl.water[c] === 0 && ed[c] < 4.2 && r() < 0.25) plant(i, j, 'reed');
    if (isl.has('misty') && r() < 0.14) plant(i, j, r() < 0.5 ? 'glowcap' : 'vine');
  }
  if (isl.has('fertile') || isl.has('meadow')) {
    const [wi, wj] = cells[Math.floor(r() * cells.length)];
    for (const [i, j] of cells) if (Math.hypot(i - wi, j - wj) < 2.4 && r() < 0.7 && isl.surf(i, j) === SURF.SOIL) {
      const c = cidx(i, j);
      if (!isl.plant[c] && !isl.stone[c]) { isl.plant[c] = PK.wheat; isl.grow[c] = r.range(0.4, 1); }
    }
  }
  // Note: vines at the rim where the island faces a neighbour make living bridges possible later.
  if (isl.has('misty')) {
    for (const [i, j] of cells) if (ed[cidx(i, j)] <= 1.5 && r() < 0.35) plant(i, j, 'vine');
  }

  if (home) {
    // Note: guarantee a start: trees near the centre, stones, reeds by the pond, wheat patch.
    const mid = (i, j) => Math.hypot(i - N / 2, j - N / 2);
    const cand = cells.filter(([i, j]) => mid(i, j) < 6 && isl.surf(i, j) === SURF.SOIL && !isl.water[cidx(i, j)]);
    for (let k = 0; k < 20; k++) { const [i, j] = cand[Math.floor(r() * cand.length)]; plant(i, j, k % 3 ? 'tree' : 'fruittree', 1); }
    for (let k = 0; k < 6; k++) { const [i, j] = cand[Math.floor(r() * cand.length)]; if (!isl.stone[cidx(i, j)]) isl.stone[cidx(i, j)] = 2; }
    for (const sp of isl.springs) {
      for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) {
        const i = sp.i + di; const j = sp.j + dj;
        if (inB(i, j) && Math.hypot(di, dj) > 1.8 && r() < 0.35) plant(i, j, 'reed', 1);
      }
    }
  }
  // Note: relic, the last step so no other draw shifts; ring 1 keeps its dice, outer rings follow the fixed plan.
  if (ring === 1) {
    r(); // Note: the old always-true chance draw stays so ring-1 relic cells do not move.
    // Note: ring 1 holds each of the four basic crafts exactly once, shuffled per world seed.
    const order = ['masonry', 'milling', 'baking', 'smelting'];
    const sh = rng(hash2(7, 7, worldSeed));
    for (let k = 3; k > 0; k--) { const m = Math.floor(sh() * (k + 1)); [order[k], order[m]] = [order[m], order[k]]; }
    const slot = { '1,0': 0, '0,1': 1, '-1,0': 2, '0,-1': 3 }[`${gx},${gz}`];
    const k1 = slot !== undefined ? order[slot] : RELIC_POOL_1[Math.floor(r() * RELIC_POOL_1.length)];
    const cand = cells.filter(([i, j]) => ed[cidx(i, j)] > 2.5 && !isl.water[cidx(i, j)] && !isl.dep[cidx(i, j)]);
    if (cand.length && KNOWLEDGE[k1]) {
      const [i, j] = cand[Math.floor(r() * cand.length)];
      isl.relic = { know: k1, i, j, taken: false };
      isl.plant[cidx(i, j)] = 0; isl.stone[cidx(i, j)] = 0;
    }
  } else if (ring >= 2 && know && KNOWLEDGE[know]) {
    // Note: a fixed relic must exist, so a fully wet island falls back to its driest cells.
    const free = cells.filter(([i, j]) => !isl.dep[cidx(i, j)]);
    const wet = Math.min(...free.map(([i, j]) => isl.water[cidx(i, j)]));
    const dry = free.filter(([i, j]) => isl.water[cidx(i, j)] <= wet + 0.02);
    const deep = dry.filter(([i, j]) => ed[cidx(i, j)] > 2.5);
    const cand = deep.length ? deep : dry;
    if (cand.length) {
      const [i, j] = cand[Math.floor(r() * cand.length)];
      isl.relic = { know, i, j, taken: false };
      isl.plant[cidx(i, j)] = 0; isl.stone[cidx(i, j)] = 0;
    }
  }
  return isl;
}

// Note: pure copy of links.js computeAnchors; reach is the walkable-cell map of A (A.reach when omitted, none when null).
export function anchorsBetween(A, B, reach) {
  const rm = reach === undefined ? A.reach : reach;
  let best = null; let bd = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!A.land(i, j)) continue;
    if (rm && !rm[cidx(i, j)]) continue;
    if (!A.walkable(i, j)) continue;
    const d = Math.hypot(B.wx - (A.wx + A.cx0(i)), B.wz - (A.wz + A.cz0(j)));
    if (d < bd) { bd = d; best = { i, j }; }
  }
  if (!best) return null;
  const ax = A.wx + A.cx0(best.i); const az = A.wz + A.cz0(best.j);
  let bb = null; let bd2 = 1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!B.land(i, j) || B.water[cidx(i, j)] > 0.3) continue;
    const d = Math.hypot(B.wx + B.cx0(i) - ax, B.wz + B.cz0(j) - az);
    if (d < bd2) { bd2 = d; bb = { i, j }; }
  }
  if (!bb) return null;
  return { ai: best, bi: bb, gap: bd2 };
}
