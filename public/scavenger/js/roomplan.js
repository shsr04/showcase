// Note: room content planner: placement with keep-outs, lights, signs, logs and sound emitters, as pure data.

import { FACE_DIR, FACE_SIGN, STYLE, DISTRICTS, L } from './config.js';
import { PROPS, Frame, itemHalf, itemSolid } from './props.js';
import { makeLog } from './logtext.js';
import { holeRects } from './roombuild.js';

const MAX_LIGHTS = 30;
const UP = [0, 1, 0];

// Note: wall faces of a room box; n points into the room, yaw turns an item so its front faces n.
export const WALLS = [
  { f: 0, axis: 0, sign: 1, n: [-1, 0, 0], yaw: 3, t: 2 },
  { f: 1, axis: 0, sign: -1, n: [1, 0, 0], yaw: 1, t: 2 },
  { f: 4, axis: 2, sign: 1, n: [0, 0, -1], yaw: 2, t: 0 },
  { f: 5, axis: 2, sign: -1, n: [0, 0, 1], yaw: 0, t: 0 },
];
const WALL_BY_FACE = new Map(WALLS.map((w) => [w.f, w]));
export const SIDE_FACES = [0, 1, 4, 5];

// Note: quarter turn that makes an item front (+z) look along the given horizontal direction.
export function yawToward(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 0 : 2;
}

export class RoomPlanner {
  constructor(plan, rr, world) {
    this.plan = plan;
    this.rr = rr;
    this.world = world;
    this.D = plan.D;
    this.theme = plan.room.theme;
    const { c, h } = plan.room;
    this.c = c;
    this.h = h;
    this.x0 = c[0] - h[0];
    this.x1 = c[0] + h[0];
    this.z0 = c[2] - h[2];
    this.z1 = c[2] + h[2];
    this.y0 = c[1] - h[1];
    this.y1 = c[1] + h[1];
    this.items = [];
    this.solids = [];
    this.lights = [];
    this.pois = [];
    this.emitters = [];
    this.foot = [];
    this.keeps = [];
    this.holes = [];
    this.nPoi = 0;
    this.setupHoles();
  }

  get cx() { return this.c[0]; }

  get cz() { return this.c[2]; }

  get hx() { return this.h[0]; }

  get hy() { return this.h[1]; }

  get hz() { return this.h[2]; }

  get height() { return this.y1 - this.y0; }

  next() { return this.rr.next(); }

  range(a, b) { return this.rr.range(a, b); }

  chance(p) { return this.rr.chance(p); }

  pick(arr) { return this.rr.pick(arr); }

  // Note: holes and keep-outs.

  setupHoles() {
    for (const hr of holeRects(this.plan)) {
      if (!hr) continue;
      const hole = { f: hr.f, axis: hr.axis, sign: FACE_SIGN[hr.f], c: hr.c, half: hr.half, edge: this.plan.edges[hr.f] };
      this.holes.push(hole);
      this.addKeep(hole);
    }
  }

  addKeep(hole) {
    const { axis, sign, c, half } = hole;
    if (axis === 1) {
      this.keeps.push({
        x0: c[0] - half[0] - 1.4, x1: c[0] + half[0] + 1.4, z0: c[2] - half[2] - 1.4, z1: c[2] + half[2] + 1.4,
        yLo: sign < 0 ? -1e9 : this.y1 - 3.2, yHi: 1e9, shaft: sign < 0 ? 'floor' : 'ceil',
      });
      return;
    }
    const tan = axis === 0 ? 2 : 0;
    const depth = 5.5;
    const k = { yLo: c[1] - half[1] - 0.6, yHi: c[1] + half[1] + 0.6 };
    const a0 = sign > 0 ? c[axis] - depth : c[axis] - 0.3;
    const a1 = sign > 0 ? c[axis] + 0.3 : c[axis] + depth;
    const t0 = c[tan] - half[tan] - 1.3;
    const t1 = c[tan] + half[tan] + 1.3;
    if (axis === 0) Object.assign(k, { x0: a0, x1: a1, z0: t0, z1: t1 });
    else Object.assign(k, { x0: t0, x1: t1, z0: a0, z1: a1 });
    this.keeps.push(k);
  }

  // Note: keeps a flight lane open from every wall hole to a point (default the room centre).
  lanes(toX = this.cx, toZ = this.cz, r = 1.7) {
    for (const hole of this.holes) {
      if (hole.axis === 1) continue;
      this.keeps.push({
        seg: [hole.c[0], hole.c[2], toX, toZ], r,
        yLo: hole.c[1] - hole.half[1] - 0.6, yHi: hole.c[1] + hole.half[1] + 0.6,
      });
    }
  }

  wallHole(f) {
    return this.holes.find((h) => h.f === f) || null;
  }

  wallPos(f) {
    return f === 0 ? this.x1 : f === 1 ? this.x0 : f === 4 ? this.z1 : this.z0;
  }

  // Note: tangent range of a side wall (z for x walls, x for z walls).
  wallSpan(f) {
    return f < 2 ? [this.z0, this.z1] : [this.x0, this.x1];
  }

  wallLen(f) {
    const s = this.wallSpan(f);
    return s[1] - s[0];
  }

  // Note: side walls without a hole, longest first.
  bareWalls() {
    return SIDE_FACES.filter((f) => !this.wallHole(f)).sort((a, b) => this.wallLen(b) - this.wallLen(a));
  }

  // Note: true when a wall rectangle (tangent t, centre height y above floor) hits the hole of that wall.
  wallBlocked(f, t, y, hw, hh, margin = 0.6) {
    const hole = this.wallHole(f);
    if (!hole) return false;
    const tan = hole.axis === 0 ? 2 : 0;
    const ht = hole.c[tan];
    const hy = hole.c[1] - this.y0;
    return Math.abs(t - ht) < hole.half[tan] + hw + margin && Math.abs(y - hy) < hole.half[1] + hh + margin;
  }

  // Note: true when a thin vertical span at (x, z) between heights yLo..yHi (above floor) hits nothing planned.
  clearAt(x, z, yLo, yHi, pad = 0.4) {
    const a = this.y0 + yLo;
    const b = this.y0 + yHi;
    for (const k of this.keeps) {
      if (b < k.yLo || a > k.yHi) continue;
      if (k.seg) {
        const [ax, az, bx, bz] = k.seg;
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < k.r + pad) return false;
      } else if (x + pad > k.x0 && x - pad < k.x1 && z + pad > k.z0 && z - pad < k.z1) {
        return false;
      }
    }
    for (const s of this.foot) {
      if (s.top > yLo && x + pad > s.x0 && x - pad < s.x1 && z + pad > s.z0 && z - pad < s.z1) return false;
    }
    return true;
  }

  // Note: true when an axis-aligned box (world centre c, half sizes h) stays clear of hole keep-outs and solids.
  boxClear(c, h, pad = 0.3) {
    for (const k of this.keeps) {
      if (c[1] + h[1] < k.yLo || c[1] - h[1] > k.yHi) continue;
      if (k.seg) {
        const [ax, az, bx, bz] = k.seg;
        const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
        for (let i = 0; i <= n; i++) {
          const px = ax + ((bx - ax) * i) / n;
          const pz = az + ((bz - az) * i) / n;
          if (Math.abs(px - c[0]) < h[0] + pad + k.r && Math.abs(pz - c[2]) < h[2] + pad + k.r) return false;
        }
      } else if (c[0] + h[0] + pad > k.x0 && c[0] - h[0] - pad < k.x1 && c[2] + h[2] + pad > k.z0 && c[2] - h[2] - pad < k.z1) {
        return false;
      }
    }
    for (const s of this.foot) {
      if (c[1] - h[1] < this.y0 + s.top && c[0] + h[0] + pad > s.x0 && c[0] - h[0] - pad < s.x1 && c[2] + h[2] + pad > s.z0 && c[2] - h[2] - pad < s.z1) return false;
    }
    return true;
  }

  // Note: placement.

  free(x, z, hx, hz, top, o = {}) {
    const gap = o.gap ?? 0.9;
    const margin = o.margin ?? 0.35;
    if (x - hx < this.x0 + margin || x + hx > this.x1 - margin || z - hz < this.z0 + margin || z + hz > this.z1 - margin) return false;
    const yb = o.y0 ?? this.y0;
    const yt = yb + top;
    const rad = Math.hypot(hx, hz);
    for (const k of this.keeps) {
      if (yt < k.yLo || yb > k.yHi) continue;
      if (k.seg) {
        const [ax, az, bx, bz] = k.seg;
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < k.r + rad) return false;
      } else if (x + hx > k.x0 && x - hx < k.x1 && z + hz > k.z0 && z - hz < k.z1) {
        return false;
      }
    }
    for (const s of this.foot) {
      if (x + hx + gap > s.x0 && x - hx - gap < s.x1 && z + hz + gap > s.z0 && z - hz - gap < s.z1) return false;
    }
    return true;
  }

  // Note: true when a footprint stays out of the open shafts above and below the floor and ceiling holes.
  shaftClear(x, z, hx, hz, top = 0, pad = 0, only = null) {
    for (const k of this.keeps) {
      if (!k.shaft || (only && k.shaft !== only) || this.y0 + top < k.yLo) continue;
      if (x + hx + pad > k.x0 && x - hx - pad < k.x1 && z + hz + pad > k.z0 && z - hz - pad < k.z1) return false;
    }
    return true;
  }

  // Note: the spot nearest to the room centre where a footprint clears every shaft; null when none is free.
  centre(hx, hz, top = 0, pad = 1.5, only = null) {
    for (let r = 0; r <= 18; r += 3) {
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const x = this.cx + Math.cos((a / 8) * Math.PI * 2) * r;
        const z = this.cz + Math.sin((a / 8) * Math.PI * 2) * r;
        if (x - hx > this.x0 + 1 && x + hx < this.x1 - 1 && z - hz > this.z0 + 1 && z + hz < this.z1 - 1 && this.shaftClear(x, z, hx, hz, top, pad, only)) return [x, z];
      }
    }
    return null;
  }

  // Note: ceiling skylight that shrinks and shifts until it stays clear of every ceiling shaft; null when none fits.
  skylightFree(hx, hz, o = {}) {
    for (const k of [1, 0.75, 0.55, 0.4]) {
      const spot = this.centre(hx * k, hz * k, this.height, 0.8, 'ceil');
      if (spot) {
        this.skylight(spot[0], spot[1], hx * k, hz * k, o);
        return spot;
      }
    }
    return null;
  }

  // Note: floor-standing item; returns null when the spot is taken or blocked.
  put(type, x, z, yaw = 0, o = {}) {
    const def = PROPS[type];
    if (!def) return null;
    const it = { t: type, p: [x, this.y0, z], yaw, ...o };
    it.seed = it.seed || this.rr.int(1, 1 << 30);
    const hh = itemHalf(it);
    if (!this.shaftClear(x, z, hh[0], hh[2], 0)) return null;
    if (!o.force && !this.free(x, z, hh[0], hh[2], hh[1] * 2, o)) return null;
    this.items.push(it);
    const sol = itemSolid(it);
    if (sol) {
      this.solids.push(sol);
      it.sol = sol;
      this.foot.push({
        x0: x - hh[0], x1: x + hh[0], z0: z - hh[2], z1: z + hh[2], top: (o.y || 0) + hh[1] * 2,
      });
    }
    return it;
  }

  // Note: item that sits at a height (on a table, hung) and never blocks.
  deco(type, x, y, z, yaw = 0, o = {}) {
    if (!PROPS[type]) return null;
    const it = { t: type, p: [x, this.y0 + y, z], yaw, solid: false, ...o };
    it.seed = it.seed || this.rr.int(1, 1 << 30);
    this.items.push(it);
    return it;
  }

  // Note: world point in the local frame of an item.
  at(it, x, y, z) {
    return new Frame(it).pt(x, y, z);
  }

  front(it) {
    return new Frame(it).vec(0, 0, 1);
  }

  // Note: item against wall f at tangent coordinate t, its front facing into the room.
  onWall(f, type, t, o = {}) {
    const w = WALL_BY_FACE.get(f);
    const size = o.s || PROPS[type].size;
    const off = size[2] / 2 + (o.inset ?? 0.05);
    const along = this.wallPos(f) - w.sign * off;
    const x = w.axis === 0 ? along : t;
    const z = w.axis === 0 ? t : along;
    return this.put(type, x, z, w.yaw, { margin: 0.02, ...o });
  }

  // Note: tries tangent positions from the wall middle outwards until the item fits.
  fitWall(f, type, o = {}) {
    const [t0, t1] = this.wallSpan(f);
    const mid = (t0 + t1) / 2 + (o.shift || 0);
    const half = (t1 - t0) / 2;
    for (let d = 0; d < half; d += 1) {
      for (const s of d === 0 ? [1] : [1, -1]) {
        const it = this.onWall(f, type, mid + s * d, o);
        if (it) return it;
      }
    }
    return null;
  }

  // Note: a run of items along wall f between tangent coordinates a and b.
  wallRun(f, type, a, b, step, o = {}) {
    const out = [];
    const n = Math.max(1, Math.floor(Math.abs(b - a) / step));
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const it = this.onWall(f, type, t, typeof o === 'function' ? o(i) : o);
      if (it) out.push(it);
    }
    return out;
  }

  // Note: floor run between two floor points; every item faces `yaw`.
  run(type, ax, az, bx, bz, n, yaw, o = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const it = this.put(type, ax + (bx - ax) * t, az + (bz - az) * t, yaw, typeof o === 'function' ? o(i) : o);
      if (it) out.push(it);
    }
    return out;
  }

  // Note: wall items and surfaces.

  wallItem(kind, f, t, y, o = {}) {
    const w = WALL_BY_FACE.get(f);
    const hw = (o.w || 1) / 2 + 0.1;
    const hh = (o.h || 1) / 2 + 0.1;
    if (this.wallBlocked(f, t, y, hw, hh, o.margin ?? 0.5)) return null;
    const pos = this.wallPos(f);
    const p = w.axis === 0 ? [pos, this.y0 + y, t] : [t, this.y0 + y, pos];
    const it = { t: kind, p, n: w.n, up: UP, seed: this.rr.int(1, 1 << 30), ...o };
    this.items.push(it);
    return it;
  }

  poster(f, t, y, layer, w, h, o = {}) {
    return this.wallItem('poster', f, t, y, { layer, w, h, ...o });
  }

  sign(f, t, y, text, o = {}) {
    const lines = Array.isArray(text) ? text : [text];
    const size = o.size || 0.4;
    const widest = Math.max(...lines.map((s) => s.length));
    return this.wallItem('sign', f, t, y, {
      text: lines, size, w: widest * size * 0.5 + size, h: lines.length * size * 1.3 + size * 0.5, ...o,
    });
  }

  window(f, t, y, w, h, o = {}) {
    return this.wallItem('window', f, t, y, { w, h, ...o });
  }

  skylight(x, z, hx, hz, o = {}) {
    this.items.push({
      t: 'skylight', c: [x, this.y1, z], hx, hz, bars: o.bars || 3, tint: o.tint, seed: 1,
    });
  }

  decal(x, z, hx, hz, layer, o = {}) {
    const it = { t: 'decal', p: [x, this.y0, z], hx, hz, layer, seed: 1, ...o };
    this.items.push(it);
    return it;
  }

  // Note: beam or girder between two world points (y above floor) with a collision solid; false when blocked.
  beam(a, b, hs, o = {}) {
    const hx = Math.abs(a[0] - b[0]) / 2 + hs[0];
    const hy = Math.abs(a[1] - b[1]) / 2 + hs[1];
    const hz = Math.abs(a[2] - b[2]) / 2 + hs[2];
    const c = [(a[0] + b[0]) / 2, this.y0 + (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    if (!this.boxClear(c, [hx, hy, hz])) return false;
    this.items.push({ t: 'box', c, h: [hx, hy, hz], layer: o.layer ?? L.BEAM, tint: o.tint || [0.75, 0.75, 0.78], seed: 1 });
    if (o.solid !== false) this.solids.push({ kind: 'solid', c, h: [hx, hy, hz] });
    return true;
  }

  // Note: box of any layer at world centre c (y above floor) with optional collision solid.
  slab(c, h, layer, tint, o = {}) {
    const w = [c[0], this.y0 + c[1], c[2]];
    if (!o.force && !this.boxClear(w, h, 0.1)) return false;
    this.items.push({
      t: 'box', c: w, h, layer, tint, emis: o.emis || 0, style: o.style || 0, skip: o.skip || '', seed: 1,
    });
    if (o.solid) this.solids.push({ kind: 'solid', c: w, h });
    return true;
  }

  pipe(a, b, r, o = {}) {
    this.items.push({ t: 'pipe', a, b, r, tint: o.tint, n: o.n || 8, every: o.every, seed: 1 });
  }

  // Note: lights.

  roll(mul = 1) {
    const f = this.D.fail * mul;
    const r = this.rr.next();
    return r < f * 0.5 ? 'dead' : r < f ? 'flicker' : 'on';
  }

  light(o) {
    if (this.lights.length >= MAX_LIGHTS) return null;
    const state = o.state || this.roll(o.failMul ?? 1);
    const l = {
      p: o.p, n: o.n || [0, -1, 0], c: o.c || this.D.lamp, i: state === 'dead' ? 0 : o.i, r: o.r,
      kind: 'lamp', state, sp: 'R', style: o.style || STYLE.STATIC, fix: o.fix || null, anchor: o.anchor || null,
    };
    if (state === 'flicker' && !o.style) l.style = this.rr.chance(0.5) ? STYLE.FAIL : STYLE.FLICKER2;
    for (const k of ['drop', 'fx', 'fz', 'len', 'axis', 'shade', 'halo', 'haloK']) if (o[k] !== undefined) l[k] = o[k];
    this.lights.push(l);
    return l;
  }

  panel(x, z, o = {}) {
    return this.light({
      p: [x, this.y1 - 0.5, z], anchor: [x, this.y1, z], fix: 'panel', i: 1.7, r: 20, ...o,
    });
  }

  // Note: hanging lamp whose shade sits at height y above the floor; lifts itself out of flight paths.
  hang(x, z, y, o = {}) {
    let yy = y;
    for (let k = 0; k < 3 && !this.clearAt(x, z, yy - 0.4, yy + 0.8); k++) yy += 1.6;
    if (yy + 1.0 > this.height || !this.clearAt(x, z, yy - 0.4, yy + 0.8)) return null;
    return this.light({
      p: [x, this.y0 + yy, z], anchor: [x, this.y1, z], fix: 'hang', drop: this.y1 - (this.y0 + yy) - 0.35, i: 2.2, r: 22, ...o,
    });
  }

  // Note: flood lamp hanging from a beam whose underside is at height yb above the floor.
  flood(x, z, yb, o = {}) {
    const drop = o.drop ?? 1.0;
    return this.light({
      p: [x, this.y0 + yb - drop - 0.6, z], anchor: [x, this.y0 + yb, z], fix: 'flood', drop, i: 2.6, r: 30, ...o,
    });
  }

  beacon(x, y, z, o = {}) {
    return this.light({
      p: [x, this.y0 + y + 0.4, z], anchor: [x, this.y0 + y, z], n: UP, fix: 'beacon', i: 1.4, r: 12, style: STYLE.BEACON,
      c: this.D.alarm, state: 'on', ...o,
    });
  }

  sconce(f, t, y, o = {}) {
    const w = WALL_BY_FACE.get(f);
    if (this.wallBlocked(f, t, y, 0.3, 0.3, 0.3)) return null;
    const pos = this.wallPos(f);
    const a = w.axis === 0 ? [pos, this.y0 + y, t] : [t, this.y0 + y, pos];
    return this.light({
      p: [a[0] + w.n[0] * 0.5, a[1] + 0.1, a[2] + w.n[2] * 0.5], anchor: a, n: w.n, fix: 'sconce', i: 1.5, r: 14, ...o,
    });
  }

  // Note: light without a fixture mesh, e.g. a glow from a screen or a window.
  glow(p, o = {}) {
    return this.light({
      p, n: o.n || UP, i: 1, r: 12, state: 'on', halo: 0, ...o,
    });
  }

  // Note: logs, sound.

  log(kind, extra = {}) {
    const ctx = {
      station: this.world.seedStr, theme: this.theme, district: this.D.id, sector: this.plan.sector, index: this.nPoi, ...extra,
    };
    return makeLog(kind, ctx, this.rr);
  }

  poi(kind, p, n, o = {}) {
    const id = `${this.plan.key}:${this.nPoi}`;
    const text = this.log(kind, o.ctx || {});
    this.nPoi++;
    this.pois.push({
      id, p, n, r: o.r ?? 6, kind, title: text.title, text: text.text,
    });
  }

  emitter(kind, p, o = {}) {
    this.emitters.push({
      p, kind, r: o.r ?? 14, i: o.i ?? 1, seed: this.rr.int(1, 1 << 30),
    });
  }

  // Note: finishing.

  // Note: a lit sign above every wall hole that names the sector beyond.
  holeSigns() {
    for (const h of this.holes) {
      if (h.axis === 1) continue;
      const d = FACE_DIR[h.f];
      const { i, j, k } = this.plan;
      const ni = i + d[0];
      const nj = j + d[1];
      const nk = k + d[2];
      const dest = this.world.sector(ni, nj, nk);
      const e = h.edge;
      const gate = e && e.dLo !== e.dHi;
      const near = DISTRICTS[this.world.districtIndex(ni, nj, nk)].name;
      const tan = h.axis === 0 ? 2 : 0;
      const lines = gate ? ['TO ' + near, dest] : ['TO ' + dest];
      const col = gate ? [1, 0.75, 0.3] : [0.65, 0.85, 1];
      const size = Math.min(0.8, Math.max(0.34, h.half[tan] * 0.2));
      const plate = lines.length * size * 1.3 + size * 0.5;
      const y = h.c[1] - this.y0 + h.half[1] + 0.35 + plate / 2;
      if (y + plate / 2 > this.height - 0.3) continue;
      this.sign(h.f, h.c[tan], y, lines, { size, color: col, emis: 1.2, margin: 0.1 });
    }
  }

  finish() {
    this.holeSigns();
    return {
      lights: this.lights, pois: this.pois, emitters: this.emitters, items: this.items, solids: this.solids,
    };
  }
}
