// Note: handheld gear: headlamp state, floating glowsticks and the sonar ping; no DOM or three.js.

import { FreeField } from './collide.js';
import { cellOf } from './plan.js';
import { Rand } from './rand.js';

export const STICK_COLORS = [[0.25, 1.0, 0.35], [1.0, 0.22, 0.12], [0.25, 0.65, 1.0], [1.0, 0.7, 0.2]];
export const MAX_STICKS = 6;
const STICK_R = 0.13;
const PING_SPEED = 62;
const PING_LIFE = 3.4;

export class Gear {
  constructor(world, seed = 5) {
    this.world = world;
    this.lamp = true;
    this.sticks = [];
    this.colorIdx = 0;
    this.rng = new Rand(seed);
    this.ping = { t: 99, origin: [0, 0, 0] };
    this.thrown = 0;
  }

  // Note: sticks start in front of the camera and inherit part of the ship velocity.
  throwStick(pos, dir, shipVel) {
    const color = STICK_COLORS[this.colorIdx++ % STICK_COLORS.length];
    const stick = {
      p: [pos[0] + dir[0] * 0.8, pos[1] + dir[1] * 0.8, pos[2] + dir[2] * 0.8],
      v: [dir[0] * 7.5 + shipVel[0] * 0.8, dir[1] * 7.5 + shipVel[1] * 0.8, dir[2] * 7.5 + shipVel[2] * 0.8],
      color,
      age: 0,
      rest: false,
      axis: [this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)],
      spin: this.rng.range(2.5, 6),
      angle: 0,
      dir: dir.slice(),
      field: new FreeField(),
      key: '',
    };
    this.sticks.push(stick);
    if (this.sticks.length > MAX_STICKS) this.sticks.shift();
    this.thrown++;
    return stick;
  }

  clearSticks() {
    this.sticks.length = 0;
  }

  update(dt) {
    for (const s of this.sticks) {
      s.age += dt;
      if (s.rest) continue;
      const c = cellOf(s.p[0], s.p[1], s.p[2]);
      const key = `${c[0]},${c[1]},${c[2]}`;
      if (key !== s.key) {
        s.key = key;
        s.field.gather(this.world, c[0], c[1], c[2]);
      }
      const damp = Math.exp(-0.5 * dt);
      s.v[0] *= damp;
      s.v[1] *= damp;
      s.v[2] *= damp;
      const sp = Math.hypot(s.v[0], s.v[1], s.v[2]);
      const n = Math.min(8, Math.max(1, Math.ceil((sp * dt) / 0.2)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        s.p[0] += s.v[0] * h;
        s.p[1] += s.v[1] * h;
        s.p[2] += s.v[2] * h;
        const d = s.field.at(s.p[0], s.p[1], s.p[2]);
        if (d < STICK_R) {
          const g = s.field.grad(s.p[0], s.p[1], s.p[2], [0, 0, 0]);
          const push = Math.min(0.5, STICK_R - d);
          s.p[0] += g[0] * push;
          s.p[1] += g[1] * push;
          s.p[2] += g[2] * push;
          const vn = s.v[0] * g[0] + s.v[1] * g[1] + s.v[2] * g[2];
          if (vn < 0) {
            const k = 1.38;
            s.v[0] = (s.v[0] - g[0] * vn * k) * 0.8;
            s.v[1] = (s.v[1] - g[1] * vn * k) * 0.8;
            s.v[2] = (s.v[2] - g[2] * vn * k) * 0.8;
            s.spin *= 0.7;
            if (Math.hypot(s.v[0], s.v[1], s.v[2]) < 0.35) s.rest = true;
          }
        }
      }
      s.angle += s.spin * dt;
    }
    this.ping.t += dt;
  }

  startPing(origin) {
    this.ping = { t: 0, origin: origin.slice() };
  }

  pingState() {
    const t = this.ping.t;
    if (t > PING_LIFE) return { radius: 0, alpha: 0, origin: this.ping.origin };
    return { radius: t * PING_SPEED, alpha: Math.pow(1 - t / PING_LIFE, 1.5), origin: this.ping.origin };
  }
}
