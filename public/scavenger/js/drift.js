// Note: Drift mode; a lazy walk over the cell graph that follows tube centrelines and tours rooms.

import { FreeField } from './collide.js';
import { cellOf, cellKey } from './plan.js';
import { FACE_DIR, SHIP_R } from './config.js';
import { Rand, clamp } from './rand.js';
import { angleDiff, forwardOf } from './ship.js';
import * as V from './path.js';

const UP = [0, 1, 0];
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class Drift {
  constructor(world, seed = 1) {
    this.world = world;
    this.rng = new Rand(seed >>> 0);
    this.route = [];
    this.tail = null;
    this.visits = new Map();
    this.field = new FreeField();
    this.fieldKey = '';
    this.glance = null;
    this.glanceIn = 6;
    this.time = 0;
    this.stuckT = 0;
    this.stuckRef = [0, 0, 0];
    this.focus = null;
    this.focusT = 0;
    this.speed = 0;
    this.isSeen = () => false;
    this.cellsPlanned = 0;
  }

  reset(ship) {
    this.route = [];
    this.tail = {
      cell: cellOf(ship.pos[0], ship.pos[1], ship.pos[2]), entry: -1, pos: ship.pos.slice(),
    };
    this.stuckT = 0;
    this.stuckRef = ship.pos.slice();
    this.glance = null;
    this.focus = null;
    this.extend(ship);
    this.extend(ship);
  }

  fieldFor(cell) {
    const key = cell.join(',');
    if (key !== this.fieldKey) {
      this.field.gather(this.world, cell[0], cell[1], cell[2]);
      this.fieldKey = key;
    }
    return this.field;
  }

  pickExit(plan, entry, prefDir) {
    const cands = [];
    for (let f = 0; f < 6; f++) {
      if (!plan.edges[f]) continue;
      if (f === entry && plan.deg > 1) continue;
      const d = FACE_DIR[f];
      const nk = cellKey(plan.i + d[0], plan.j + d[1], plan.k + d[2]);
      let w = 1 / (1 + (this.visits.get(nk) || 0) * 1.6);
      if (entry >= 0 && f === (entry ^ 1)) w *= 1.5;
      const nd = this.world.districtIndex(plan.i + d[0], plan.j + d[1], plan.k + d[2]);
      if (nd !== plan.di) w *= 1.35;
      if (plan.edges[f].typeId === 'crawl') w *= 0.5;
      // Note: grand runs and the way down are the sights, so they draw the glide a little more.
      if (plan.edges[f].run.grand) w *= 1.4;
      if (d[1] < 0) w *= 1.2;
      if (prefDir) w *= 0.3 + Math.max(0, V.dot(prefDir, d)) * 1.2;
      cands.push([f, w]);
    }
    if (!cands.length) return -1;
    return this.rng.weighted(cands, (c) => c[1])[0];
  }

  // Note: appends waypoints for the tail cell and moves the tail into the next cell.
  extend(ship) {
    const t = this.tail;
    const plan = this.world.cell(t.cell[0], t.cell[1], t.cell[2]);
    if (plan.deg === 0) {
      this.tail = { cell: cellOf(ship.pos[0], ship.pos[1], ship.pos[2]), entry: -1, pos: ship.pos.slice() };
      return;
    }
    const pref = t.entry < 0 ? forwardOf(ship.yaw, ship.pitch) : null;
    const exit = this.pickExit(plan, t.entry, pref);
    if (exit < 0) return;
    const pts = this.cellRoute(plan, t.entry, exit, t.pos);
    for (const p of pts) this.route.push(p);
    const d = FACE_DIR[exit];
    const nk = cellKey(plan.i + d[0], plan.j + d[1], plan.k + d[2]);
    this.visits.set(nk, (this.visits.get(nk) || 0) + 1);
    this.visits.set(plan.key, (this.visits.get(plan.key) || 0) + 1);
    this.tail = {
      cell: [plan.i + d[0], plan.j + d[1], plan.k + d[2]], entry: exit ^ 1, pos: pts.length ? pts[pts.length - 1].slice() : t.pos,
    };
    this.cellsPlanned++;
  }

  cellRoute(plan, entry, exit, start) {
    const pts = [];
    const pushPath = (path, forward, step, from = null) => {
      const n = path.n;
      let a = forward ? 0 : n - 1;
      if (from !== null) a = from;
      const end = forward ? n - 1 : 0;
      const dir = forward ? 1 : -1;
      for (let i = a; forward ? i < end : i > end; i += dir * step) pts.push([path.P[i * 3], path.P[i * 3 + 1], path.P[i * 3 + 2]]);
      pts.push([path.P[end * 3], path.P[end * 3 + 1], path.P[end * 3 + 2]]);
    };
    const nearestIndex = (path, p) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < path.n; i++) {
        const d = (path.P[i * 3] - p[0]) ** 2 + (path.P[i * 3 + 1] - p[1]) ** 2 + (path.P[i * 3 + 2] - p[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    };
    if (plan.through) {
      const th = plan.through;
      let forward = exit === th.fb;
      if (entry < 0) {
        const i0 = nearestIndex(th.path, start);
        pushPath(th.path, forward, 2, i0);
      } else {
        forward = entry === th.fa;
        pushPath(th.path, forward, 2);
      }
      return pts;
    }
    const room = plan.room;
    const outStub = plan.stubs.find((s) => s.f === exit);
    const inStub = entry >= 0 ? plan.stubs.find((s) => s.f === entry) : null;
    const inside = (p, pad) => (
      Math.abs(p[0] - room.c[0]) < room.h[0] - pad && Math.abs(p[1] - room.c[1]) < room.h[1] - pad && Math.abs(p[2] - room.c[2]) < room.h[2] - pad
    );
    let cursor = start.slice();
    if (inStub) {
      pushPath(inStub.path, false, 2);
      this.axisPoints(room, inStub, false, pts);
      cursor = pts[pts.length - 1];
    } else if (!inside(start, 1.5)) {
      // Note: started inside a stub; run into the room along the nearest stub.
      let bestStub = null;
      let bd = Infinity;
      for (const s of plan.stubs) {
        const i = nearestIndex(s.path, start);
        const d = V.dist([s.path.P[i * 3], s.path.P[i * 3 + 1], s.path.P[i * 3 + 2]], start);
        if (d < bd) {
          bd = d;
          bestStub = s;
        }
      }
      if (bestStub && bestStub.f !== exit) {
        pushPath(bestStub.path, false, 2, nearestIndex(bestStub.path, start));
        this.axisPoints(room, bestStub, false, pts);
        cursor = pts[pts.length - 1];
      }
    }
    if (outStub) {
      const field = this.fieldFor([plan.i, plan.j, plan.k]);
      const visit = this.roomVisit(plan, field, cursor);
      const lead = [];
      this.axisPoints(room, outStub, true, lead);
      let prev = cursor;
      const chain = visit ? [visit, ...lead] : lead;
      for (const target of chain) {
        for (const q of this.repair(field, prev, target, 0)) pts.push(q);
        prev = target;
      }
      pushPath(outStub.path, true, 2);
    }
    return pts;
  }

  // Note: points on the hole axis inside the room so the ship lines up before it crosses a wall opening.
  axisPoints(room, stub, toward, out) {
    const a = stub.A;
    const d = stub.dir;
    const depth = 2 * room.h[stub.axis];
    const far = Math.min(5.5, depth * 0.35);
    const near = Math.min(2.2, far * 0.45);
    const pa = [a[0] - d[0] * near, a[1] - d[1] * near, a[2] - d[2] * near];
    const pb = [a[0] - d[0] * far, a[1] - d[1] * far, a[2] - d[2] * far];
    if (toward) out.push(pb, pa);
    else out.push(pa, pb);
  }

  // Note: a point of interest inside the room, preferably an unseen log, else a random open spot.
  roomVisit(plan, field, from) {
    const room = plan.room;
    for (const poi of plan.pois) {
      if (this.isSeen(poi.id)) continue;
      const n = poi.n || [0, 0, 0];
      for (const k of [3.6, 2.6, 5]) {
        const q = [poi.p[0] + n[0] * k, poi.p[1] + n[1] * k, poi.p[2] + n[2] * k];
        if (field.at(q[0], q[1], q[2]) > 1.6) return q;
      }
    }
    let best = null;
    for (let i = 0; i < 10; i++) {
      const q = [
        room.c[0] + this.rng.range(-0.62, 0.62) * room.h[0],
        room.c[1] + this.rng.range(-0.35, 0.3) * room.h[1],
        room.c[2] + this.rng.range(-0.62, 0.62) * room.h[2],
      ];
      const c = field.at(q[0], q[1], q[2]);
      if (c > 2.4 && V.dist(q, from) > 6) {
        best = q;
        break;
      }
    }
    return best;
  }

  clearAlong(field, a, b, need) {
    const l = V.dist(a, b);
    const n = Math.max(2, Math.ceil(l / 1.2));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (field.at(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) < need) return false;
    }
    return true;
  }

  // Note: returns waypoints from a to b (b included); detours around solids when the straight line is blocked.
  repair(field, a, b, depth) {
    if (this.clearAlong(field, a, b, SHIP_R + 0.6) || depth > 2) return [b];
    const mid = V.mix3(a, b, 0.5);
    const dir = V.norm(V.sub(b, a));
    let side = V.cross(UP, dir);
    if (V.len(side) < 0.1) side = [1, 0, 0];
    side = V.norm(side);
    const offs = [];
    for (const r of [3, 5, 8, 12]) {
      offs.push(V.mul(UP, r), V.mul(UP, -r), V.mul(side, r), V.mul(side, -r));
      offs.push(V.mul(V.norm(V.add(UP, side)), r), V.mul(V.norm(V.sub(UP, side)), r));
    }
    for (const o of offs) {
      const q = V.add(mid, o);
      if (field.at(q[0], q[1], q[2]) < 1.8) continue;
      if (this.clearAlong(field, a, q, SHIP_R + 0.6) && this.clearAlong(field, q, b, SHIP_R + 0.6)) return [q, b];
    }
    const first = this.repair(field, a, mid, depth + 1);
    const last = first.length ? first[first.length - 1] : mid;
    return first.concat(this.repair(field, last, b, depth + 1));
  }

  // Note: advances along the route, returning the lookahead point and the remaining route length.
  follow(ship, lookDist) {
    const p = ship.pos;
    const R = this.route;
    while (R.length > 2) {
      const d0 = V.dist(p, R[0]);
      if (d0 < 2.4) {
        R.shift();
        continue;
      }
      // Note: a corner counts as passed once the ship is beyond it along the outgoing segment.
      const seg = V.sub(R[1], R[0]);
      const l = V.len(seg) || 1;
      if (V.dot(V.sub(p, R[0]), seg) / l > 0 && d0 < 7) {
        R.shift();
        continue;
      }
      break;
    }
    let remaining = lookDist;
    let from = p;
    let target = R[0] || p;
    for (let i = 0; i < R.length; i++) {
      const l = V.dist(from, R[i]);
      if (remaining <= l && l > 1e-4) {
        target = V.mix3(from, R[i], remaining / l);
        remaining = -1;
        break;
      }
      remaining -= l;
      from = R[i];
      target = R[i];
    }
    let total = V.dist(p, R[0]);
    for (let i = 1; i < R.length; i++) total += V.dist(R[i - 1], R[i]);
    return { target, total };
  }

  // Note: returns a control record for Ship.step plus camera aim; wish is a world direction.
  update(ship, dt) {
    if (!(dt > 0)) dt = 0;
    this.time += dt;
    const R = this.route;
    if (!this.tail || R.length < 2) this.reset(ship);
    let { target, total } = this.follow(ship, 3.5 + ship.speed * 0.55);
    while (total < 140 && this.cellsPlanned < 4000) {
      const before = this.route.length;
      this.extend(ship);
      if (this.route.length === before) break;
      ({ target, total } = this.follow(ship, 3.5 + ship.speed * 0.55));
    }
    const p = ship.pos;
    const wob = this.time;
    const f = forwardOf(ship.yaw, ship.pitch);
    const right = [Math.cos(ship.yaw), 0, -Math.sin(ship.yaw)];
    // Note: slow lateral weave so the line never feels railed; scaled down when the walls are close.
    const weave = clamp((ship.clear - 1.6) / 3, 0, 1);
    const tgt = [
      target[0] + right[0] * Math.sin(wob * 0.41) * 1.3 * weave,
      target[1] + Math.sin(wob * 0.53 + 1) * 0.8 * weave,
      target[2] + right[2] * Math.sin(wob * 0.41) * 1.3 * weave,
    ];
    let D = V.sub(tgt, p);
    const dl = V.len(D) || 1;
    D = V.mul(D, 1 / dl);
    // Note: wall repulsion from the field gradient at the ship and a short probe ahead.
    const field = ship.field;
    const probe = V.madd(p, D, 2.6);
    const cAhead = field.at(probe[0], probe[1], probe[2]);
    if (cAhead < 1.7) {
      const g = field.grad(probe[0], probe[1], probe[2], [0, 0, 0]);
      D = V.norm(V.madd(D, g, (1.7 - cAhead) * 0.55));
    }
    if (ship.clear < 1.3) {
      const g = field.grad(p[0], p[1], p[2], [0, 0, 0]);
      D = V.norm(V.madd(D, g, (1.3 - ship.clear) * 0.9));
    }
    // Note: probe along the actual velocity so momentum into a wall triggers braking and a sidestep.
    let brake = false;
    if (ship.speed > 2) {
      const vh = V.mul(ship.vel, 1 / ship.speed);
      const probeV = V.madd(p, vh, ship.speed * 0.75 + 1);
      const cV = field.at(probeV[0], probeV[1], probeV[2]);
      if (cV < 1.1) {
        const g = field.grad(probeV[0], probeV[1], probeV[2], [0, 0, 0]);
        D = V.norm(V.madd(D, g, (1.1 - cV) * 0.8));
        brake = ship.speed > 3.2;
      }
    }

    // Note: points of interest slow the glide and draw the gaze.
    let aim = D;
    this.focusT -= dt;
    if (this.focus && this.isSeen(this.focus.id)) this.focus = null;
    if (!this.focus || this.focusT <= 0) {
      this.focus = null;
      const plan = this.world.cell(...cellOf(p[0], p[1], p[2]));
      let best = null;
      let bd = 16;
      for (const poi of plan.pois) {
        if (this.isSeen(poi.id)) continue;
        const d = V.dist(poi.p, p);
        if (d < bd) {
          bd = d;
          best = poi;
        }
      }
      if (best) {
        this.focus = best;
        this.focusT = 6;
      }
    }
    let speed = 6.8;
    if (this.focus) {
      const fd = V.sub(this.focus.p, p);
      const dist = V.len(fd);
      aim = V.norm(V.add(V.mul(D, 0.25), V.mul(fd, 0.75 / (dist || 1))));
      speed = clamp(dist * 0.35, 1.6, 4.5);
    } else {
      this.glanceIn -= dt;
      if (this.glance) {
        this.glance.t += dt;
        const w = Math.sin(clamp(this.glance.t / this.glance.len, 0, 1) * Math.PI);
        aim = V.norm(V.mix3(D, this.glance.dir, smooth(w) * 0.8));
        if (this.glance.t >= this.glance.len) this.glance = null;
      } else if (this.glanceIn <= 0) {
        this.glanceIn = this.rng.range(6, 14);
        const g = V.norm([this.rng.range(-1, 1), this.rng.range(-0.55, 0.7), this.rng.range(-1, 1)]);
        this.glance = { dir: g, t: 0, len: this.rng.range(2.4, 4.2) };
      }
    }
    // Note: long straight stretches in wide tubes get a faster glide; far lookahead points keep the test blind to sideways offset.
    if (!this.focus && total > 130) {
      const far = V.norm(V.sub(this.follow(ship, 100).target, p));
      const near = V.norm(V.sub(this.follow(ship, 35).target, p));
      const straight = smooth(clamp((V.dot(far, near) - 0.99) / 0.008, 0, 1));
      const open = smooth(clamp((ship.clear - 2.6) / 4, 0, 1));
      const vast = smooth(clamp((ship.clear - 6) / 12, 0, 1));
      speed += 7 * straight * open + 7 * straight * vast;
    }
    const aimYaw = Math.atan2(-aim[0], -aim[2]);
    const aimPitch = Math.asin(clamp(aim[1], -1, 1));
    const k = 1 - Math.exp(-2.1 * dt);
    const yawD = -angleDiff(aimYaw, ship.yaw) * k;
    const pitchD = (aimPitch - ship.pitch) * k;
    const turn = Math.abs(angleDiff(aimYaw, ship.yaw)) + Math.abs(aimPitch - ship.pitch);
    speed *= clamp(1 - turn * 0.35, 0.4, 1);
    speed *= clamp(ship.clear / 2.4, 0.5, 1);
    if (total < 20) speed = Math.min(speed, 4);
    this.speed += (speed - this.speed) * (1 - Math.exp(-1.4 * dt));

    // Note: if the ship makes no progress for a while, re-plan from its current position.
    if (V.dist(ship.pos, this.stuckRef) > 3) {
      this.stuckRef = ship.pos.slice();
      this.stuckT = 0;
    } else {
      this.stuckT += dt;
      if (this.stuckT > 6) {
        this.stuckT = 0;
        if (ship.clear < SHIP_R + 0.05) ship.rescue();
        this.reset(ship);
      }
    }
    return { wish: D, yawD, pitchD, vmax: this.speed, brake, mx: 0, my: 0, mz: 0, wishMag: 1 };
  }
}
