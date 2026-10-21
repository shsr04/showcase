// Note: zero-g glider with inertia; thrust follows the camera and collisions use the free-space field.

import { FreeField } from './collide.js';
import { cellOf } from './plan.js';
import { SHIP_R } from './config.js';

export const SPEED = { cruise: 11, boost: 30, slow: 3.4 };
const ACCEL = 24;
const PITCH_MAX = 1.54;

export const forwardOf = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
export const rightOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];

export function angleDiff(a, b) {
  const d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) return d - Math.PI * 2;
  return d < -Math.PI ? d + Math.PI * 2 : d;
}

export class Ship {
  constructor(world) {
    this.world = world;
    this.pos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.field = new FreeField();
    this.fieldKey = '';
    this.fieldAt = [1e9, 0, 0];
    this.clear = 5;
    this.bump = 0;
    this.speed = 0;
    this.safe = [0, 0, 0];
    this.lostFor = 0;
    this.rescues = 0;
    this.thrusting = false;
    this.tmp = [0, 0, 0];
    this.gradOut = [0, 0, 0];
  }

  place(pos, yaw = 0, pitch = 0) {
    this.pos = pos.slice();
    this.safe = pos.slice();
    this.vel = [0, 0, 0];
    this.yaw = yaw;
    this.pitch = pitch;
    this.roll = 0;
    this.fieldKey = '';
    this.lostFor = 0;
    this.ensureField();
  }

  // Note: keeps the gathered prims centred on the ship; refreshed on cell change or after 8 m of travel.
  ensureField() {
    const [x, y, z] = this.pos;
    const c = cellOf(x, y, z);
    const key = `${c[0]},${c[1]},${c[2]}`;
    const dx = x - this.fieldAt[0];
    const dy = y - this.fieldAt[1];
    const dz = z - this.fieldAt[2];
    if (key === this.fieldKey && dx * dx + dy * dy + dz * dz < 64) return;
    this.fieldKey = key;
    this.fieldAt = [x, y, z];
    this.field.gather(this.world, c[0], c[1], c[2], [x - 18, y - 18, z - 18, x + 18, y + 18, z + 18]);
  }

  forward() {
    return forwardOf(this.yaw, this.pitch);
  }

  right() {
    return rightOf(this.yaw);
  }

  // Note: ctl = { mx, my, mz, boost, brake, slow, yawD, pitchD, vmax } with thrust axes in -1..1.
  step(dt, ctl) {
    if (!(dt > 0)) return;
    this.yaw -= ctl.yawD || 0;
    this.pitch += ctl.pitchD || 0;
    if (this.pitch > PITCH_MAX) this.pitch = PITCH_MAX;
    if (this.pitch < -PITCH_MAX) this.pitch = -PITCH_MAX;
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    const f = forwardOf(this.yaw, this.pitch);
    const r = rightOf(this.yaw);
    const mx = ctl.mx || 0;
    const my = ctl.my || 0;
    const mz = ctl.mz || 0;
    let wx = f[0] * mz + r[0] * mx;
    let wy = f[1] * mz + r[1] * mx + my;
    let wz = f[2] * mz + r[2] * mx;
    if (ctl.wish) {
      // Note: autopilot supplies a world-space direction instead of camera-relative axes.
      const m = ctl.wishMag ?? 1;
      wx = ctl.wish[0] * m;
      wy = ctl.wish[1] * m;
      wz = ctl.wish[2] * m;
    }
    const wl = Math.hypot(wx, wy, wz);
    this.thrusting = wl > 0.02;
    const v = this.vel;
    const cap = ctl.vmax || (ctl.boost ? SPEED.boost : ctl.slow ? SPEED.slow : SPEED.cruise);
    const sp0 = Math.hypot(v[0], v[1], v[2]);
    if (this.thrusting) {
      // Note: thrust fades out as the speed along the wish direction nears the cap, so the cap holds softly.
      const along = (v[0] * wx + v[1] * wy + v[2] * wz) / wl;
      const room = Math.min(1, Math.max(0, (cap - along) / (cap * 0.2)));
      const k = (ctl.boost ? 2.4 : 1) * ACCEL * dt * room / Math.max(1, wl);
      v[0] += wx * k;
      v[1] += wy * k;
      v[2] += wz * k;
    }
    let drag = this.thrusting ? 0.3 : 0.34;
    if (ctl.brake) drag = 3.4;
    if (this.thrusting && sp0 > cap * 1.15) drag += (sp0 / cap - 1.15) * 1.6;
    const damp = Math.exp(-drag * dt);
    v[0] *= damp;
    v[1] *= damp;
    v[2] *= damp;

    this.bump = 0;
    const speed = Math.hypot(v[0], v[1], v[2]);
    const n = Math.min(14, Math.max(1, Math.ceil((speed * dt) / 0.22)));
    const h = dt / n;
    this.ensureField();
    for (let s = 0; s < n; s++) {
      this.pos[0] += v[0] * h;
      this.pos[1] += v[1] * h;
      this.pos[2] += v[2] * h;
      this.resolve();
    }
    this.speed = Math.hypot(v[0], v[1], v[2]);

    if (this.clear > SHIP_R + 0.45) {
      this.safe[0] = this.pos[0];
      this.safe[1] = this.pos[1];
      this.safe[2] = this.pos[2];
      this.lostFor = 0;
    } else if (this.clear < -1.2) {
      this.lostFor += dt;
      if (this.lostFor > 0.3) this.rescue();
    }
    // Warning: a runaway or non-finite state would stall world planning, so it falls back to the last safe spot.
    if (!(this.speed < 1e4 && Math.hypot(this.pos[0], this.pos[1], this.pos[2]) < 1e6)) this.rescue();
  }

  resolve() {
    const p = this.pos;
    const v = this.vel;
    const d = this.field.at(p[0], p[1], p[2]);
    this.clear = d;
    if (d >= SHIP_R) return;
    const g = this.field.grad(p[0], p[1], p[2], this.gradOut);
    const push = Math.min(0.6, SHIP_R - d);
    p[0] += g[0] * push;
    p[1] += g[1] * push;
    p[2] += g[2] * push;
    const vn = v[0] * g[0] + v[1] * g[1] + v[2] * g[2];
    if (vn < 0) {
      const rest = vn < -4 ? 0.3 : 0.08;
      v[0] -= g[0] * vn * (1 + rest);
      v[1] -= g[1] * vn * (1 + rest);
      v[2] -= g[2] * vn * (1 + rest);
      v[0] *= 0.985;
      v[1] *= 0.985;
      v[2] *= 0.985;
      if (-vn > this.bump) this.bump = -vn;
    }
  }

  // Note: last resort when the ship ends up inside rock; returns to the last open position.
  rescue() {
    this.pos = this.safe.slice();
    this.vel = [0, 0, 0];
    this.lostFor = 0;
    this.rescues++;
    this.fieldKey = '';
    this.ensureField();
  }
}
