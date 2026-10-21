// Note: world graph and per-cell planning (portals, stubs, hub rooms, lights, collision prims); pure data.

import {
  CELL_ARR, FACE_DIR, FACE_AXIS, FACE_SIGN, AXIS_FRAME, TUNNEL, DISTRICTS, THEME, DEFAULT_SEED,
} from './config.js';
import { hash3, hash4, hash5, Rand, seedFromString, clamp } from './rand.js';
import * as V from './path.js';
import { planRoom, THEME_DEF } from './rooms.js';
import { Lattice } from './lattice.js';
import { planTubes } from './tubelife.js';

const SUPER = [10, 6, 10];
const PATH_STEP = 1.75;

const DEAD_END = {
  engineering: [['valves', 2], ['substation', 3], ['pumphouse', 2], ['reactor', 1], ['cargo', 1], ['junction', 1], ['control', 1]],
  habitat: [['lounge', 3], ['nursery', 2], ['dorm', 3], ['chapel', 1], ['arcade', 2], ['pumphouse', 1]],
  research: [['archive', 3], ['greenhouse', 3], ['observatory', 2], ['control', 1], ['chapel', 1], ['relay', 2]],
  cargo: [['cargo', 4], ['valves', 1], ['junction', 1], ['arcade', 1], ['lock', 2], ['substation', 1]],
  command: [['control', 3], ['observatory', 3], ['archive', 2], ['relay', 3]],
  decay: [['greenhouse', 2], ['lounge', 2], ['dorm', 2], ['archive', 1], ['nursery', 1], ['junction', 1], ['substation', 2], ['pumphouse', 1], ['lock', 1]],
};

// Note: crossings of three or more runs; the big halls of the station.
const JUNCTION = {
  engineering: [['junction', 2], ['valves', 2], ['atrium', 2], ['reactor', 1], ['substation', 3], ['pumphouse', 2]],
  habitat: [['junction', 2], ['promenade', 2], ['atrium', 3], ['lounge', 1], ['relay', 1], ['pumphouse', 1]],
  research: [['junction', 2], ['atrium', 3], ['greenhouse', 2], ['archive', 1], ['relay', 2]],
  cargo: [['junction', 2], ['cargo', 3], ['valves', 1], ['atrium', 1], ['substation', 1], ['lock', 2]],
  command: [['junction', 2], ['control', 2], ['atrium', 2], ['relay', 2], ['substation', 1]],
  decay: [['junction', 2], ['atrium', 2], ['cargo', 1], ['substation', 2], ['pumphouse', 1], ['lock', 1]],
};

// Note: rooms strung along a run, and straight crossings of two runs.
const STATION = {
  engineering: [['valves', 3], ['substation', 3], ['pumphouse', 2], ['lock', 1], ['junction', 1]],
  habitat: [['promenade', 3], ['lock', 1], ['junction', 1], ['lounge', 1], ['pumphouse', 1]],
  research: [['junction', 1], ['archive', 1], ['observatory', 1], ['relay', 2], ['lock', 1]],
  cargo: [['cargo', 3], ['valves', 1], ['lock', 2], ['substation', 1], ['junction', 1]],
  command: [['control', 2], ['relay', 2], ['junction', 1], ['lock', 1]],
  decay: [['junction', 2], ['valves', 1], ['cargo', 1], ['substation', 1], ['lock', 1], ['pumphouse', 1]],
};

const ELBOW = [['junction', 3], ['valves', 2], ['pumphouse', 1], ['substation', 1]];

// Note: rooms whose size earns thinner fog.
const BIG_ROOMS = new Set(['atrium', 'hangar', 'reactor', 'cargo', 'greenhouse', 'substation', 'pumphouse']);

export const cellCenter = (i, j, k) => [(i + 0.5) * CELL_ARR[0], (j + 0.5) * CELL_ARR[1], (k + 0.5) * CELL_ARR[2]];
export const cellKey = (i, j, k) => `${i},${j},${k}`;
export const cellOf = (x, y, z) => [
  Math.floor(x / CELL_ARR[0]), Math.floor(y / CELL_ARR[1]), Math.floor(z / CELL_ARR[2]),
];

function weightedPick(table, r) {
  let total = 0;
  for (const [, w] of table) total += w;
  let t = r * total;
  for (const [name, w] of table) {
    t -= w;
    if (t <= 0) return name;
  }
  return table[table.length - 1][0];
}

function axisOfVec(v) {
  return Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2;
}

// Note: world axis index used by a tunnel's profile width (r) and height (u) for a given tunnel axis.
function profileAxes(axis) {
  return { rw: axisOfVec(AXIS_FRAME[axis].r), uh: axisOfVec(AXIS_FRAME[axis].u) };
}

export class World {
  constructor(seedStr = DEFAULT_SEED) {
    this.seedStr = String(seedStr || DEFAULT_SEED);
    this.seed = seedFromString(this.seedStr);
    this.lat = new Lattice(this.seed);
    this.cells = new Map();
    this.edges = new Map();
    this.runs = new Map();
    this.forced = new Map();
    this.start = this.findStart();
  }

  superKey(i, j, k) {
    return `${Math.floor(i / SUPER[0])},${Math.floor(j / SUPER[1])},${Math.floor(k / SUPER[2])}`;
  }

  districtIndex(i, j, k) {
    const sk = this.superKey(i, j, k);
    if (this.forced.has(sk)) return this.forced.get(sk);
    const h = hash4(this.seed ^ 0xd157, Math.floor(i / SUPER[0]), Math.floor(j / SUPER[1]), Math.floor(k / SUPER[2]));
    return h % DISTRICTS.length;
  }

  // Note: the run (artery between two neighbouring nodes) that holds the cell step lo -> lo + 1 along axis, or null.
  runAt(axis, lo) {
    const lat = this.lat;
    if (!lat.onLine(axis, lo)) return null;
    const o1 = (axis + 1) % 3;
    const o2 = (axis + 2) % 3;
    const n0 = lat.prevNode(axis, lo[axis]);
    const key = `${axis}|${n0}|${lo[o1]}|${lo[o2]}`;
    let run = this.runs.get(key);
    if (run === undefined) {
      run = lat.runExists(axis, n0, lo[o1], lo[o2]) ? this.buildRun(key, axis, n0, lo[o1], lo[o2]) : null;
      this.runs.set(key, run);
    }
    return run;
  }

  // Note: one tunnel type, one offset pattern and a few stations for the whole run, so long runs stay consistent.
  buildRun(key, axis, n0, c1, c2) {
    const o1 = (axis + 1) % 3;
    const o2 = (axis + 2) % 3;
    const n1 = this.lat.nextNode(axis, n0);
    const base = [0, 0, 0];
    base[axis] = n0;
    base[o1] = c1;
    base[o2] = c2;
    const len = n1 - n0;
    const seed = hash5(this.seed ^ 0xa27e, axis, n0, c1, c2);
    const rr = new Rand(seed);
    const D = DISTRICTS[this.districtIndex(base[0], base[1], base[2])];
    let typeId = rr.weighted(Object.entries(axis === 1 ? D.vtypes : D.types), (x) => x[1])[0];
    if (TUNNEL[typeId].neck && len < 4) typeId = TUNNEL[typeId].neck;
    const type = TUNNEL[typeId];
    const grand = !!type.neck;
    const slim = !grand && type.w < 12;
    const off = [0, 0];
    if (slim && rr.chance(0.5)) {
      off[0] = rr.range(-9, 9);
      off[1] = rr.range(-6, 6);
    }
    const wander = slim && rr.chance(0.3);
    const wob = [rr.range(0, 6.28), rr.range(0, 6.28), rr.range(0.7, 1.4)];
    const stations = new Set();
    if (!grand && len >= 5 && rr.chance(0.55)) {
      const first = rr.int(2, len - 2);
      stations.add(first);
      if (len >= 9 && rr.chance(0.5)) {
        const far = [];
        for (let q = 2; q <= len - 2; q++) if (Math.abs(q - first) >= 3) far.push(q);
        if (far.length) stations.add(rr.pick(far));
      }
    }
    const gates = new Set();
    if (len >= 4 && rr.chance(0.5)) gates.add(rr.int(1, len - 1));
    return {
      key, axis, n0, n1, len, base, seed, typeId, type, grand, wander, off, wob, stations, gates,
    };
  }

  // Note: canonical shared edge between a cell and its neighbour on face f; null when no tunnel.
  edge(i, j, k, f) {
    const axis = FACE_AXIS[f];
    const lo = [i, j, k];
    if (FACE_SIGN[f] < 0) lo[axis] -= 1;
    const key = `${lo[0]},${lo[1]},${lo[2]}|${axis}`;
    if (this.edges.has(key)) return this.edges.get(key);
    const run = this.runAt(axis, lo);
    let edge = null;
    if (run) {
      const hi = lo.slice();
      hi[axis] += 1;
      const idx = lo[axis] - run.n0;
      const typeId = run.type.neck && (idx === 0 || idx === run.len - 1) ? run.type.neck : run.typeId;
      const dLo = this.districtIndex(lo[0], lo[1], lo[2]);
      const dHi = this.districtIndex(hi[0], hi[1], hi[2]);
      const off = [run.off[0], run.off[1]];
      if (run.wander) {
        off[0] += 5.5 * Math.sin(idx * run.wob[2] + run.wob[0]);
        off[1] += 3.5 * Math.sin(idx * run.wob[2] * 0.8 + run.wob[1]);
      }
      const c = cellCenter(lo[0], lo[1], lo[2]);
      const F = c.slice();
      F[axis] += CELL_ARR[axis] / 2;
      F[(axis + 1) % 3] += off[0];
      F[(axis + 2) % 3] += off[1];
      edge = {
        key, axis, lo, hi, run, idx, trunk: run.grand, typeId, type: TUNNEL[typeId], F, off,
        seed: hash5(this.seed ^ 0xed9e, lo[0], lo[1], lo[2], axis), dLo, dHi,
        gate: dLo !== dHi || run.gates.has(idx),
      };
    }
    this.edges.set(key, edge);
    return edge;
  }

  neighborsOf(i, j, k) {
    const out = [];
    for (let f = 0; f < 6; f++) {
      if (this.edge(i, j, k, f)) {
        const d = FACE_DIR[f];
        out.push({ f, i: i + d[0], j: j + d[1], k: k + d[2] });
      }
    }
    return out;
  }

  degree(i, j, k) {
    let d = 0;
    for (let f = 0; f < 6; f++) if (this.edge(i, j, k, f)) d++;
    return d;
  }

  // Note: nearest node cell to the origin with three or more runs and a rich neighbourhood; the lattice is district free.
  findStart() {
    const lat = this.lat;
    const cands = [];
    for (let i = -16; i <= 16; i++) {
      if (!lat.isNode(0, i)) continue;
      for (let k = -16; k <= 16; k++) {
        if (!lat.isNode(2, k)) continue;
        for (let j = -7; j <= 7; j++) {
          if (lat.isNode(1, j)) cands.push([i, j, k]);
        }
      }
    }
    const score = (c) => Math.max(Math.abs(c[0]), Math.abs(c[2])) + Math.abs(c[1]) * 1.5;
    cands.sort((a, b) => score(a) - score(b));
    const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1) + ((m >> 5) & 1);
    let pick = cands.find((c) => bits(lat.openMask(c[0], c[1], c[2])) >= 3 && lat.reachNodes(c, 3) >= 14);
    if (!pick) pick = cands.find((c) => bits(lat.openMask(c[0], c[1], c[2])) >= 2) || cands[0];
    this.forced.set(this.superKey(pick[0], pick[1], pick[2]), 0);
    return pick;
  }

  // Note: number of cells within the given number of steps; used by checks.
  reachable(start, depth) {
    const seen = new Set([cellKey(...start)]);
    let frontier = [start];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const c of frontier) {
        for (const n of this.neighborsOf(c[0], c[1], c[2])) {
          const key = cellKey(n.i, n.j, n.k);
          if (!seen.has(key)) {
            seen.add(key);
            next.push([n.i, n.j, n.k]);
          }
        }
      }
      frontier = next;
    }
    return seen.size;
  }

  // Note: plans are deterministic, so evicting old ones is safe.
  cell(i, j, k) {
    const key = cellKey(i, j, k);
    let plan = this.cells.get(key);
    if (plan) {
      this.cells.delete(key);
      this.cells.set(key, plan);
      return plan;
    }
    plan = planCell(this, i, j, k);
    this.cells.set(key, plan);
    if (this.cells.size > 900) {
      const first = this.cells.keys().next().value;
      this.cells.delete(first);
    }
    return plan;
  }

  sector(i, j, k) {
    const D = DISTRICTS[this.districtIndex(i, j, k)];
    return `${D.code}-${10 + (hash3(this.seed ^ 0x5ec7, Math.floor(i / 4), Math.floor(k / 4), Math.floor(j / 2)) % 89)}`;
  }
}

function tunnelSymmetry(a, b) {
  const isRound = (t) => t && Math.abs(t.r - Math.min(t.w, t.h) / 2) < 0.01 && Math.abs(t.w - t.h) < 0.01;
  if (isRound(a) && isRound(b)) return 'round';
  if (Math.abs(a.w - a.h) < 0.01 && (!b || Math.abs(b.w - b.h) < 0.01)) return 'square';
  return 'none';
}

function smooth01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function profileArrays(n, S, len, tA, tB, flareStart, flareEnd) {
  const W = new Float32Array(n);
  const H = new Float32Array(n);
  const Rr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = tA === tB ? 0 : smooth01(S[i] / (len || 1));
    let w = tA.w + (tB.w - tA.w) * m;
    let h = tA.h + (tB.h - tA.h) * m;
    let r = tA.r + (tB.r - tA.r) * m;
    // Note: rooms cut a rectangular hole, so the profile corner radius grows from zero at a hub wall.
    if (flareStart) r *= smooth01(S[i] / 2.5);
    if (flareEnd) r *= smooth01((len - S[i]) / 2.5);
    W[i] = w;
    H[i] = h;
    Rr[i] = Math.min(r, Math.min(w, h) / 2);
  }
  return { W, H, Rr };
}

function pathBounds(path, pad) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < path.n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = path.P[i * 3 + a];
      if (v < b[a]) b[a] = v;
      if (v > b[a + 3]) b[a + 3] = v;
    }
  }
  for (let a = 0; a < 3; a++) {
    b[a] -= pad;
    b[a + 3] += pad;
  }
  return b;
}

function planCell(world, i, j, k) {
  const di = world.districtIndex(i, j, k);
  const D = DISTRICTS[di];
  const c = cellCenter(i, j, k);
  const plan = {
    key: cellKey(i, j, k), i, j, k, c, D, di,
    origin: [i * CELL_ARR[0], j * CELL_ARR[1], k * CELL_ARR[2]],
    size: CELL_ARR,
    edges: [], deg: 0, mask: 0, room: null, stubs: [], through: null, kind: 'void', run: null, idx: 0, cost: 1, fogK: 1,
    lights: [], prims: [], emitters: [], pois: [], life: [], portals: [], items: [],
    seed: hash4(world.seed ^ 0xce11, i, j, k),
    sector: world.sector(i, j, k),
    isStart: i === world.start[0] && j === world.start[1] && k === world.start[2],
  };
  for (let f = 0; f < 6; f++) {
    const e = world.edge(i, j, k, f);
    plan.edges.push(e);
    if (e) {
      plan.deg++;
      plan.mask |= 1 << f;
    }
  }
  if (plan.deg === 0) return plan;

  const rr = new Rand(plan.seed);
  let theme = null;
  if (plan.isStart) theme = THEME.HANGAR;
  else if (plan.deg === 1) theme = weightedPick(DEAD_END[D.id], rr.next());
  else if (plan.deg >= 3) theme = weightedPick(JUNCTION[D.id], rr.next());
  else {
    const faces = [];
    for (let f = 0; f < 6; f++) if (plan.edges[f]) faces.push(f);
    const straight = (faces[0] ^ 1) === faces[1];
    const run = plan.edges[faces[0]].run;
    if (straight && plan.edges[faces[1]].run === run) {
      plan.run = run;
      plan.idx = [i, j, k][run.axis] - run.n0;
      if (run.stations.has(plan.idx)) theme = weightedPick(STATION[D.id], rr.next());
    } else if (straight) {
      if (rr.chance(0.85)) theme = weightedPick(STATION[D.id], rr.next());
    } else if (rr.chance(0.3)) theme = weightedPick(ELBOW, rr.next());
  }
  plan.kind = !theme ? 'pass' : plan.run ? 'station' : 'node';

  if (theme) planHub(plan, rr, theme);
  else planThrough(plan, rr);
  if (plan.through) {
    plan.cost = 0.4;
    plan.fogK = (plan.through.ea.type.fogK + plan.through.eb.type.fogK) / 2;
  } else if (BIG_ROOMS.has(theme)) plan.fogK = 0.8;

  planTubes(plan);
  planPortals(plan);
  if (plan.room) {
    const content = planRoom(plan, new Rand(plan.seed ^ 0x600d), world);
    plan.lights.push(...content.lights);
    plan.pois.push(...content.pois);
    plan.emitters.push(...content.emitters);
    plan.items.push(...content.items);
    plan.prims.push(...content.solids);
  }
  return plan;
}

// Note: portal rects connect spaces for light visibility; hole = room wall opening, face = cell boundary.
function planPortals(plan) {
  const rect = (kind, a, b, c, axis, hw, hh) => {
    const { rw, uh } = profileAxes(axis);
    return { kind, a, b, c, axis, rw, uh, hw, hh };
  };
  for (const stub of plan.stubs) {
    const { path, W, H } = stub;
    plan.portals.push(rect('hole', 'R', 'S' + stub.f, stub.A, stub.axis, W[0] / 2, H[0] / 2));
    plan.portals.push({ ...rect('face', 'S' + stub.f, null, stub.F, stub.axis, W[path.n - 1] / 2, H[path.n - 1] / 2), f: stub.f });
  }
  if (plan.through) {
    const { path, W, H, fa, fb, ea, eb } = plan.through;
    plan.portals.push({ ...rect('face', 'T', null, ea.F, ea.axis, W[0] / 2, H[0] / 2), f: fa });
    plan.portals.push({ ...rect('face', 'T', null, eb.F, eb.axis, W[path.n - 1] / 2, H[path.n - 1] / 2), f: fb });
  }
}

function planHub(plan, rr, theme) {
  const def = THEME_DEF[theme];
  const half = [0, 0, 0];
  for (let a = 0; a < 3; a++) half[a] = rr.range(def.size[a][0], def.size[a][1]);
  if (def.long && rr.chance(0.5)) {
    const t = half[0];
    half[0] = half[2];
    half[2] = t;
  }
  // Note: every attached tunnel must fit in its wall, so grow the room to cover its profile.
  for (let f = 0; f < 6; f++) {
    const e = plan.edges[f];
    if (!e) continue;
    const { rw, uh } = profileAxes(e.axis);
    half[rw] = Math.max(half[rw], e.type.w / 2 + 2.2);
    half[uh] = Math.max(half[uh], e.type.h / 2 + 1.8);
    // Note: the room needs depth along the tunnel axis as well, so doors and frames fit.
    half[e.axis] = Math.max(half[e.axis], 3.5);
  }
  const maxHalf = [CELL_ARR[0] / 2 - 6, CELL_ARR[1] / 2 - 5, CELL_ARR[2] / 2 - 6];
  for (let a = 0; a < 3; a++) half[a] = Math.min(half[a], maxHalf[a]);

  const centre = plan.c.slice();
  for (let a = 0; a < 3; a++) {
    let sum = 0;
    let cnt = 0;
    for (let f = 0; f < 6; f++) {
      const e = plan.edges[f];
      if (e && FACE_AXIS[f] !== a) {
        sum += e.F[a];
        cnt++;
      }
    }
    if (cnt) centre[a] = plan.c[a] + (sum / cnt - plan.c[a]) * 0.7;
    centre[a] += rr.range(-1, 1) * 3.5;
    const lim = CELL_ARR[a] / 2 - 5 - half[a];
    centre[a] = clamp(centre[a], plan.c[a] - Math.max(0, lim), plan.c[a] + Math.max(0, lim));
  }
  plan.room = { theme, c: centre, h: half, shape: 'box', def, seed: hash4(plan.seed, 3, 1, 4) };
  plan.prims.push({ kind: 'box', c: centre, h: half });

  for (let f = 0; f < 6; f++) {
    const e = plan.edges[f];
    if (!e) continue;
    const axis = e.axis;
    const dir = FACE_DIR[f];
    const { rw, uh } = profileAxes(axis);
    const A = centre.slice();
    A[axis] += dir[axis] * half[axis];
    const lim = (a, tunnelHalf) => Math.max(0, half[a] - tunnelHalf - 1.0);
    const bend = rr.chance(0.55) ? 0 : rr.range(0.3, 1);
    const lateral = [[rw, e.type.w / 2], [uh, e.type.h / 2]];
    for (const [a, th] of lateral) {
      const want = e.F[a] + (centre[a] - e.F[a]) * bend;
      A[a] = clamp(want, centre[a] - lim(a, th), centre[a] + lim(a, th));
    }
    const F = e.F;
    const L = Math.abs(F[axis] - A[axis]);
    const k = Math.max(1.5, L * 0.45);
    const P1 = V.madd(A, dir, k);
    const P2 = V.madd(F, dir, -k);
    const path = V.samplePath(A, P1, P2, F, PATH_STEP);
    const frame = AXIS_FRAME[axis];
    const sym = tunnelSymmetry(e.type, e.type);
    V.buildFrames(path, frame, frame, sym);
    const prof = profileArrays(path.n, path.S, path.len, e.type, e.type, true, false);
    const stub = {
      f, edge: e, axis, dir, path, ...prof, sym, A, F, fromRoom: true, owner: FACE_SIGN[f] > 0,
    };
    plan.stubs.push(stub);
    plan.prims.push({
      kind: 'tube', path, W: prof.W, H: prof.H, Rr: prof.Rr, sLo: -2.5, sHi: path.len + 4.5,
      bb: pathBounds(path, Math.max(e.type.w, e.type.h) * 0.75 + 5),
    });
  }
}

function planThrough(plan, rr) {
  const faces = [];
  for (let f = 0; f < 6; f++) if (plan.edges[f]) faces.push(f);
  const [fa, fb] = faces;
  const ea = plan.edges[fa];
  const eb = plan.edges[fb];
  const Fa = ea.F;
  const Fb = eb.F;
  const da = FACE_DIR[fa];
  const db = FACE_DIR[fb];
  const chord = V.dist(Fa, Fb);
  const bendA = rr.range(0.38, 0.5);
  const La = chord * bendA;
  const P1 = V.madd(Fa, da, -La);
  const P2 = V.madd(Fb, db, -La);
  const path = V.samplePath(Fa, P1, P2, Fb, PATH_STEP);
  // Note: path runs from face a into the cell, so its start tangent is the inward direction.
  V.buildFrames(path, AXIS_FRAME[ea.axis], AXIS_FRAME[eb.axis], tunnelSymmetry(ea.type, eb.type));
  const prof = profileArrays(path.n, path.S, path.len, ea.type, eb.type, false, false);
  plan.through = { fa, fb, ea, eb, path, ...prof };
  plan.prims.push({
    kind: 'tube', path, W: prof.W, H: prof.H, Rr: prof.Rr, sLo: -4.5, sHi: path.len + 4.5,
    bb: pathBounds(path, Math.max(ea.type.w, ea.type.h, eb.type.w, eb.type.h) * 0.75 + 5),
  });
}
