// Note: arcade-plus car physics, fuel, engine heat and collisions; pure so it runs under node:test.

import { VEHICLE } from './vehicles.js';
import { carStats, crashCar } from './parts.js';
import { MILES_PER_PX, MPH_PX, PX_PER_M, CELL } from './config.js';
import { clamp } from './rand.js';

// Note: wasteland gas is stale and roads are bad, so cars burn more than their sticker mpg.
export const FUEL_FACTOR = 1.6;
const ASPHALT_DRAG = 0.04;
const REVERSE_MPH = 25;
const IDLE_GPS = 0.00035;

export function makeCar(id, model, x, y, a, parts, fuel) {
  return {
    id, model, x, y, a, vx: 0, vy: 0, av: 0,
    fuel, parts, storage: [], temp: 0, running: false, lights: false,
    steer: 0, rpm: 0, rev: 0, gear: 0, shiftT: 0, load: 0, skid: 0, impact: 0, stalled: false,
  };
}

export const carRadius = (car) => VEHICLE[car.model].wid / 2;

// Note: circles along the body, front first, no farther apart than a radius so the true-width body has no waist.
export function carCircles(car) {
  const v = VEHICLE[car.model];
  const r = v.wid / 2;
  const off = Math.max(0, v.len / 2 - r);
  const n = Math.max(2, Math.ceil((2 * off) / r) + 1);
  const c = Math.cos(car.a);
  const s = Math.sin(car.a);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = off - (2 * off * i) / (n - 1);
    out.push({ x: car.x + c * k, y: car.y + s * k, r });
  }
  return out;
}

export function speedOf(car) {
  return Math.hypot(car.vx, car.vy);
}

export function forwardSpeed(car) {
  return car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
}

// Note: ctl = {throttle -1..1, steer -1..1, handbrake, steerMul, topMul}; env = {surface(x,y) -> props, solid(cx,cy) -> bool per 4 px cell, wet 0..1}.
export function stepCar(car, ctl, env, dt) {
  const v = VEHICLE[car.model];
  const st = carStats(v, car.parts);
  const surf = env.surface(car.x, car.y);
  const c = Math.cos(car.a);
  const s = Math.sin(car.a);
  let vf = car.vx * c + car.vy * s;
  let vr = -car.vx * s + car.vy * c;
  const soft = surf.surf !== 'hard';
  const offMul = soft ? 0.45 + 0.55 * st.offroad : 1;
  const top = st.top * offMul * (ctl.topMul || 1) * (car.temp > 1 ? 0.55 : 1);
  const canDrive = car.running && !st.disabled && car.fuel > 0;
  let throttle = canDrive ? ctl.throttle : 0;
  car.load = 0;
  if (throttle > 0) {
    // Note: partial throttle settles lower; above top speed the same curve turns into drag.
    const r = Math.max(0, vf) / top;
    vf += st.accel * Math.max(-0.5, throttle - r * r) * dt;
    car.load = throttle;
  } else if (throttle < 0) {
    if (vf > 12) vf = Math.max(0, vf - 430 * -throttle * dt);
    else if (vf > -Math.min(top * 0.25, REVERSE_MPH * MPH_PX)) {
      vf -= st.accel * 0.55 * -throttle * dt;
      car.load = -throttle * 0.6;
    }
  }
  if (ctl.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 430 * dt);
  // Note: surfaces rougher than asphalt add rolling resistance, less with good suspension; lifting off adds engine braking and air drag.
  const roll = Math.max(0, surf.drag - ASPHALT_DRAG) * (soft ? 1.5 - 0.5 * st.offroad : 1);
  vf -= vf * roll * dt;
  if (throttle <= 0) vf -= vf * 0.05 * dt + Math.sign(vf) * vf * vf * 0.0002 * dt;
  if (st.flat) vf -= vf * 0.6 * dt;
  // Note: lateral grip bleeds sideways speed; the handbrake lets the rear slide.
  const wet = 1 - (env.wet || 0) * (soft ? 0.12 : 0.22);
  const grip = st.grip * surf.grip * wet * (ctl.handbrake ? 0.16 : 1);
  const keep = Math.exp(-11 * grip * dt);
  const vrOld = vr;
  vr *= keep;
  car.skid = clamp(Math.abs(vrOld) / 90, 0, 1) * (surf.surf === 'hard' ? 1 : 0.4);
  if (ctl.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 160 * dt);
  // Note: steering authority grows with speed, then softens near top speed.
  const sp = Math.abs(vf);
  const auth = clamp(sp / 60, 0, 1) * (1 - 0.35 * clamp(sp / 210, 0, 1));
  const steerMul = (ctl.steerMul ?? 1) * (ctl.handbrake ? 1.35 : 1);
  car.steer += (ctl.steer - car.steer) * Math.min(1, dt * 10);
  const targetAv = car.steer * st.turn * auth * Math.sign(vf || 1) * steerMul;
  car.av += (targetAv - car.av) * Math.min(1, dt * (ctl.handbrake ? 6 : 9));
  car.a += car.av * dt;
  const c2 = Math.cos(car.a);
  const s2 = Math.sin(car.a);
  car.vx = c2 * vf - s2 * vr;
  car.vy = s2 * vf + c2 * vr;
  const ox = car.x;
  const oy = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.impact = collideTiles(car, env);
  const moved = Math.hypot(car.x - ox, car.y - oy);
  // Note: fuel, engine heat and leaks.
  if (car.running) {
    const miles = moved * MILES_PER_PX;
    car.fuel -= (miles / v.mpg) * FUEL_FACTOR * (0.6 + 0.6 * car.load) + IDLE_GPS * dt;
  }
  car.fuel -= st.leak * dt * (car.fuel > 0 ? 1 : 0);
  if (car.fuel <= 0) {
    car.fuel = 0;
    if (car.running) car.stalled = true;
    car.running = false;
  }
  const heatIn = car.running ? st.heat * (0.25 + car.load) * 0.05 : 0;
  car.temp = clamp(car.temp + heatIn * dt - (car.running ? 0.012 : 0.03) * dt * (1 - st.heat), 0, 1.4);
  stepGearbox(car, v.drive, Math.abs(vf), throttle, dt);
  return st;
}

// Note: a plain automatic for the engine sound and the tach; shift points rise with throttle, the converter flares the revs at launch.
export function stepGearbox(car, d, speed, throttle, dt) {
  if (!d) return;
  const load = clamp(Math.abs(throttle), 0, 1);
  const wheel = (speed / PX_PER_M / d.tire) * 60 * d.final;
  const at = (g) => wheel * d.gears[g];
  let g = Math.min(car.gear || 0, d.gears.length - 1);
  car.shiftT = Math.max(0, (car.shiftT || 0) - dt);
  const up = d.red * (0.42 + 0.5 * load);
  if (car.shiftT <= 0) {
    if (g < d.gears.length - 1 && at(g) > up) g += 1;
    else if (g > 0 && at(g - 1) < up * 0.72) g -= 1;
    if (g !== car.gear) car.shiftT = 0.45;
  }
  car.gear = g;
  const stall = d.idle + (d.red * 0.42 - d.idle) * load;
  const target = car.running ? clamp(Math.max(d.idle, at(g), throttle > 0 ? stall : 0), 0, d.red * 1.02) : 0;
  const rev = car.rev || 0;
  car.rev = rev + (target - rev) * Math.min(1, dt * (target > rev ? 7 : 10));
  car.rpm = car.rev / d.red;
}

// Note: pushes both body circles out of solid cells; returns the hardest impact speed in px/s.
export function collideTiles(car, env) {
  let worst = 0;
  for (let iter = 0; iter < 2; iter++) {
    const circles = carCircles(car);
    for (const cc of circles) {
      const x0 = Math.floor((cc.x - cc.r) / CELL);
      const x1 = Math.floor((cc.x + cc.r) / CELL);
      const y0 = Math.floor((cc.y - cc.r) / CELL);
      const y1 = Math.floor((cc.y + cc.r) / CELL);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (!env.solid(tx, ty)) continue;
          const nx = clamp(cc.x, tx * CELL, tx * CELL + CELL);
          const ny = clamp(cc.y, ty * CELL, ty * CELL + CELL);
          let dx = cc.x - nx;
          let dy = cc.y - ny;
          let d = Math.hypot(dx, dy);
          if (d >= cc.r) continue;
          if (d < 0.001) {
            dx = cc.x - (tx * CELL + CELL / 2);
            dy = cc.y - (ty * CELL + CELL / 2);
            d = Math.hypot(dx, dy) || 1;
          }
          const ux = dx / d;
          const uy = dy / d;
          const push = cc.r - d + 0.01;
          car.x += ux * push;
          car.y += uy * push;
          // Note: the whole body moves, so the other circles must not push again for the same overlap.
          for (const o of circles) {
            o.x += ux * push;
            o.y += uy * push;
          }
          const vn = car.vx * ux + car.vy * uy;
          if (vn < 0) {
            worst = Math.max(worst, -vn);
            car.vx -= vn * ux * 1.25;
            car.vy -= vn * uy * 1.25;
            car.vx *= 0.92;
            car.vy *= 0.92;
            // Note: off-center hits spin the car a little.
            const lever = (cc.x - car.x) * uy - (cc.y - car.y) * ux;
            car.av += clamp(lever * vn * 0.0006, -2, 2);
          }
        }
      }
    }
  }
  return worst;
}

// Note: generic circle body (wreck, prop, person) used for car-vs-object pushes; only the deepest contact is resolved.
export function collideCircle(car, body, carMass = 1, bodyMass = Infinity) {
  let hit = null;
  for (const cc of carCircles(car)) {
    const dx = cc.x - body.x;
    const dy = cc.y - body.y;
    const d = Math.hypot(dx, dy);
    const min = cc.r + body.r;
    if (d >= min || d < 0.001) continue;
    if (!hit || min - d > hit.push) hit = { ux: dx / d, uy: dy / d, push: min - d };
  }
  if (!hit) return 0;
  const { ux, uy, push } = hit;
  const share = bodyMass === Infinity ? 1 : bodyMass / (carMass + bodyMass);
  car.x += ux * push * share;
  car.y += uy * push * share;
  if (bodyMass !== Infinity) {
    body.x -= ux * push * (1 - share);
    body.y -= uy * push * (1 - share);
  }
  const vn = car.vx * ux + car.vy * uy - (body.vx || 0) * ux - (body.vy || 0) * uy;
  if (vn >= 0) return 0;
  const j = (-1.3 * vn) / (1 / carMass + (bodyMass === Infinity ? 0 : 1 / bodyMass));
  car.vx += (j / carMass) * ux;
  car.vy += (j / carMass) * uy;
  if (bodyMass !== Infinity && body.vx != null) {
    body.vx -= (j / bodyMass) * ux;
    body.vy -= (j / bodyMass) * uy;
  }
  return -vn;
}

// Note: car-vs-car (or car-vs-wreck with heavier masses); returns the closing speed so both sides can take ram damage.
export function collideCars(a, b, ma = VEHICLE[a.model].stats.mass, mb = VEHICLE[b.model].stats.mass) {
  let hit = null;
  const cbs = carCircles(b);
  for (const ca of carCircles(a)) {
    for (const cb of cbs) {
      const dx = ca.x - cb.x;
      const dy = ca.y - cb.y;
      const d = Math.hypot(dx, dy);
      const min = ca.r + cb.r;
      if (d >= min || d < 0.001) continue;
      if (!hit || min - d > hit.push) hit = { ux: dx / d, uy: dy / d, push: min - d };
    }
  }
  if (!hit) return 0;
  const { ux, uy, push } = hit;
  const sa = mb / (ma + mb);
  a.x += ux * push * sa;
  a.y += uy * push * sa;
  b.x -= ux * push * (1 - sa);
  b.y -= uy * push * (1 - sa);
  const vn = (a.vx - b.vx) * ux + (a.vy - b.vy) * uy;
  if (vn >= 0) return 0;
  const j = (-1.2 * vn) / (1 / ma + 1 / mb);
  a.vx += (j / ma) * ux;
  a.vy += (j / ma) * uy;
  b.vx -= (j / mb) * ux;
  b.vy -= (j / mb) * uy;
  return -vn;
}

// Note: turns an impact speed into part damage and a possible wound; null when the hit was soft.
export function applyImpact(car, impact, rand) {
  if (impact < 70) return null;
  return crashCar(car.parts, impact, rand);
}

export function tryStart(car, rand) {
  const st = carStats(VEHICLE[car.model], car.parts);
  if (st.disabled || car.fuel <= 0) return { ok: false, why: st.disabled ? 'dead' : 'fuel' };
  if (rand() > st.start) return { ok: false, why: 'battery' };
  car.running = true;
  car.stalled = false;
  return { ok: true };
}

export function tankRoom(car) {
  return Math.max(0, VEHICLE[car.model].tank - car.fuel);
}
