// Note: weapons, the bullet pool and enemy vehicles with per-faction fire patterns.

import { VEHICLE } from './vehicles.js';
import { makeCar, stepCar } from './car.js';
import { SLOTS, installedParts, hitCar, crashCar, carStats } from './parts.js';
import { C, hexNum } from './palette.js';
import { clamp, angleDiff } from './rand.js';

export const WEAPONS = {
  glock: { name: 'Glock 22', short: 'GLOCK', mag: 15, dmg: 16, rate: 0.2, spread: 0.035, pellets: 1, speed: 520, reload: 1.6, sound: 'pistol' },
  shotgun: { name: 'Remington 870', short: '870', mag: 6, dmg: 9, rate: 0.8, spread: 0.13, pellets: 6, speed: 460, reload: 2.4, sound: 'shotgun' },
  rifle: { name: 'Ruger Mini-14', short: 'MINI-14', mag: 20, dmg: 24, rate: 0.34, spread: 0.012, pellets: 1, speed: 720, reload: 2.1, sound: 'rifle' },
};

// Note: the courier fires out of a side window; the nose and the trunk are blind.
export const ARC = [0.55, 2.6];

export function inArc(carA, aimA) {
  const d = Math.abs(angleDiff(carA, aimA));
  return d >= ARC[0] && d <= ARC[1];
}

export class Bullets {
  constructor(scene, depth) {
    this.list = [];
    this.g = scene.add.graphics().setDepth(depth);
  }

  add(b) {
    this.list.push({ life: 1.2, r: 2, dmg: 8, ...b });
  }

  // Note: hit(b) returns true when something absorbed the bullet; solid(x, y) stops it at walls and trees.
  step(dt, hit, solid) {
    const keep = [];
    for (const b of this.list) {
      b.life -= dt;
      let dead = b.life <= 0;
      const n = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 5));
      for (let i = 0; i < n && !dead; i++) {
        b.x += (b.vx * dt) / n;
        b.y += (b.vy * dt) / n;
        if (solid(b.x, b.y)) dead = true;
        else if (hit(b)) dead = true;
      }
      if (!dead) keep.push(b);
    }
    this.list = keep;
  }

  draw() {
    const g = this.g;
    g.clear();
    for (const b of this.list) {
      if (b.from === 'player') {
        g.fillStyle(hexNum(C.SHADOW), 1);
        g.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
        g.fillStyle(hexNum(C.YELLOW), 1);
        g.fillRect(b.x - 0.5, b.y - 0.5, 2, 2);
      } else {
        g.fillStyle(hexNum(C.VOID), 1);
        g.fillCircle(b.x, b.y, b.r + 1);
        g.fillStyle(hexNum(b.col ?? C.RED), 1);
        g.fillCircle(b.x, b.y, b.r);
        g.fillStyle(hexNum(C.WHITE), 1);
        g.fillRect(b.x - 0.5, b.y - 0.5, 1, 1);
      }
    }
  }

  clear() {
    this.list = [];
    this.g.clear();
  }

  destroy() {
    this.g.destroy();
  }
}

// Note: crew is how many hits on people it takes; expose is the chance a hit reaches them.
export const ENEMY = {
  drifters: {
    model: 'gsxr600', crew: 1, expose: 0.45, cond: 70, pattern: 'spray', bspeed: 210, dmg: 7, col: C.AMBER, r: 2,
    paint: { body: C.RUST, trim: C.DUST }, loot: { ammo: [4, 10], water: [0, 1], fuel: [0.5, 2] }, sound: 'smg',
  },
  company: {
    model: 'tahoeppv03', crew: 2, expose: 0.2, cond: 80, pattern: 'line', bspeed: 290, dmg: 10, col: C.BONE_L, r: 2, tire: true, spikes: true,
    paint: { body: C.WHITE, trim: C.STEEL, stripe: C.YELLOW }, loot: { ammo: [6, 14], water: [1, 3], fuel: [3, 8] }, sound: 'rifle',
  },
  brigade: {
    model: 'silverado02', crew: 2, expose: 0.25, cond: 70, pattern: 'fan', bspeed: 200, dmg: 8, col: C.RED, r: 2.5, ram: true, molotov: 5,
    paint: { body: C.RUST_D, trim: C.SHADOW, ram: true }, loot: { ammo: [8, 16], water: [1, 2], fuel: [2, 6] }, sound: 'shotgun',
  },
  hunter: {
    model: 'tahoeppv03', crew: 3, expose: 0.12, cond: 95, pattern: 'line', bspeed: 320, dmg: 12, col: C.RED, r: 2, molotov: 3.5, catchUp: 1.15,
    paint: { body: C.SHADOW, trim: C.VOID }, loot: { ammo: [10, 20], water: [2, 4], fuel: [4, 10] }, sound: 'rifle',
  },
  // Note: desperate farmers in an old pickup; slow aimed shots and caltrops thrown ahead.
  coop: {
    model: 'f150-01', crew: 2, expose: 0.3, cond: 50, pattern: 'rifle', bspeed: 170, dmg: 13, col: C.STRAW, r: 2.5, caltrops: true,
    paint: { body: C.GRASS_D, trim: C.DUST }, loot: { ammo: [2, 6], water: [0, 1], fuel: [1, 3] }, sound: 'rifle',
  },
};

export const isBike = (model) => VEHICLE[model].body === 'bike';

export function makeEnemy(id, faction, x, y, a, extra = {}) {
  const def = ENEMY[faction];
  const conds = {};
  for (const slot of SLOTS) conds[slot] = slot === 'armor' ? null : def.cond;
  const car = makeCar(id, def.model, x, y, a, installedParts(def.model, conds, id), VEHICLE[def.model].tank * 0.5);
  car.running = true;
  return {
    id, faction, def, car, crew: def.crew,
    mode: 'chase', hostile: false, dead: false, gone: false,
    fireT: 1 + Math.random(), burst: 0, side: Math.random() < 0.5 ? -1 : 1,
    ramT: 0, ramCd: 2, lead: 10, offset: def.ram ? 46 : 58, life: 0, leaveA: -Math.PI / 2, spr: null,
    ...extra,
  };
}

// Note: ctx = {target {x, y, vx, vy, a, still}, env, solidAt(x, y), fire(b), rand, sound(kind, x, y)}.
export function stepEnemy(en, ctx, dt) {
  const car = en.car;
  const t = ctx.target;
  en.life += dt;
  if (en.dead) {
    // Note: with nobody at the wheel the car rolls on, drifts to its side and slows to a stop.
    const rolling = Math.hypot(car.vx, car.vy) > 14;
    stepCar(car, rolling ? { throttle: -0.08, steer: 0.15 * en.side } : { throttle: 0, steer: 0, brake: true }, ctx.env, dt);
    return;
  }
  if (en.mode === 'park') {
    stepCar(car, { throttle: 0, steer: 0, brake: true }, ctx.env, dt);
    return;
  }
  const dx = t.x - car.x;
  const dy = t.y - car.y;
  const dist = Math.hypot(dx, dy);
  const ts = Math.hypot(t.vx, t.vy);
  const fx = Math.cos(t.a);
  const fy = Math.sin(t.a);
  en.ramCd -= dt;
  en.ramT -= dt;
  if (en.def.ram && en.hostile && dist < 110 && en.ramCd <= 0) {
    en.ramT = 1.3;
    en.ramCd = en.crew < 2 ? 2.5 : 4.5;
  }
  let gx;
  let gy;
  if (en.mode === 'leave') {
    gx = car.x + Math.cos(en.leaveA) * 300;
    gy = car.y + Math.sin(en.leaveA) * 300;
  } else if (en.ramT > 0) {
    gx = t.x + t.vx * 0.25;
    gy = t.y + t.vy * 0.25;
  } else if (en.overtake > 0) {
    // Note: spike and caltrop droppers race ahead of the target before they drop.
    gx = t.x + fx * 170;
    gy = t.y + fy * 170;
  } else if (ts < 25) {
    // Note: a stopped target gets circled at a distance.
    const ang = Math.atan2(car.y - t.y, car.x - t.x) + 0.5 * en.side;
    gx = t.x + Math.cos(ang) * 95;
    gy = t.y + Math.sin(ang) * 95;
  } else {
    gx = t.x + fx * en.lead - fy * en.offset * en.side;
    gy = t.y + fy * en.lead + fx * en.offset * en.side;
  }
  const want = Math.atan2(gy - car.y, gx - car.x);
  const gd = Math.hypot(gx - car.x, gy - car.y);
  const turn = angleDiff(car.a, want);
  let steer = clamp(turn * 1.8, -1, 1);
  const fwd = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
  const desired = en.mode === 'leave' || en.ramT > 0 || gd > 70 ? 999 : ts + (gd - 8) * 1.6;
  let throttle = fwd < desired ? 1 : -0.35;
  if (Math.abs(turn) > 2 && gd < 140 && en.mode !== 'leave') {
    throttle = -0.6;
    steer = -steer;
  }
  // Note: feel ahead for walls and trees and swerve to the open side.
  const look = 24 + Math.max(0, fwd) * 0.3;
  if (ctx.solidAt(car.x + Math.cos(car.a) * look, car.y + Math.sin(car.a) * look)) {
    const left = ctx.solidAt(car.x + Math.cos(car.a - 0.7) * look, car.y + Math.sin(car.a - 0.7) * look);
    steer = left ? 1 : -1;
  }
  // Note: the hunter's tuned Tahoe and his escorts close any gap the courier opens.
  const catchUp = en.catchUp ?? en.def.catchUp;
  const topMul = catchUp && en.hostile && dist > 150 && en.mode !== 'leave' ? catchUp : 1;
  stepCar(car, { throttle, steer, brake: false, topMul }, ctx.env, dt);
  if (en.hostile && en.mode !== 'leave' && dist < 300 && !t.hidden) firePattern(en, ctx, dt, dist);
  if (en.hostile && en.mode !== 'leave' && !t.hidden) hazardPattern(en, ctx, dt, dist);
}

// Note: molotovs are lobbed at where the target will be; drops happen once the car is ahead and in lane.
function hazardPattern(en, ctx, dt, dist) {
  const d = en.def;
  const t = ctx.target;
  const crewed = !(d.ram && en.crew < 2);
  if (d.molotov && ctx.lob && crewed) {
    en.molT = (en.molT ?? 2 + ctx.rand() * 2) - dt;
    if (en.molT <= 0 && dist > 60 && dist < 240) {
      en.molT = d.molotov + ctx.rand() * 2;
      ctx.lob(en, t.x + t.vx, t.y + t.vy, 1);
    }
  }
  if ((d.spikes || d.caltrops) && ctx.drop) {
    en.dropT = (en.dropT ?? 5 + ctx.rand() * 4) - dt;
    if (en.dropT <= 0 && !(en.overtake > 0)) en.overtake = 6;
    if (en.overtake > 0) {
      en.overtake -= dt;
      const fx = Math.cos(t.a);
      const fy = Math.sin(t.a);
      const dx = en.car.x - t.x;
      const dy = en.car.y - t.y;
      const ahead = dx * fx + dy * fy;
      const lat = Math.abs(-dx * fy + dy * fx);
      if (ahead > 70 && lat < 40) {
        ctx.drop(d.spikes ? 'spikes' : 'caltrops', en);
        en.overtake = 0;
        en.dropT = 10 + ctx.rand() * 5;
      } else if (en.overtake <= 0) {
        en.overtake = 0;
        en.dropT = 5 + ctx.rand() * 4;
      }
    }
  }
}

function firePattern(en, ctx, dt, dist) {
  en.fireT -= dt;
  if (en.fireT > 0) return;
  const d = en.def;
  // Note: a pickup's gunner rides in the bed; once he is down it only rams.
  if (d.ram && en.crew < 2) {
    en.fireT = 1;
    return;
  }
  const car = en.car;
  const t = ctx.target;
  const lead = dist / d.bspeed;
  const aim = Math.atan2(t.y + (t.vy - car.vy) * lead - car.y, t.x + (t.vx - car.vx) * lead - car.x);
  const shoot = (a) => ctx.fire({
    x: car.x, y: car.y, vx: Math.cos(a) * d.bspeed + car.vx, vy: Math.sin(a) * d.bspeed + car.vy,
    from: 'enemy', faction: en.faction, dmg: d.dmg, col: d.col, r: d.r, tire: !!d.tire, life: 1.6, owner: en.id,
  });
  if (d.pattern === 'spray') {
    shoot(aim + (ctx.rand() - 0.5) * 0.6);
    en.burst += 1;
    en.fireT = en.burst % 5 === 0 ? 1.3 + ctx.rand() * 0.7 : 0.11;
  } else if (d.pattern === 'line') {
    shoot(aim);
    en.burst += 1;
    en.fireT = en.burst % 3 === 0 ? 2.4 + ctx.rand() * 0.9 : 0.09;
  } else if (d.pattern === 'rifle') {
    shoot(aim);
    en.fireT = 2.2 + ctx.rand();
  } else {
    for (let i = -2; i <= 2; i++) shoot(aim + i * 0.21);
    en.fireT = 1.5 + ctx.rand() * 0.5;
  }
  ctx.sound(d.sound, car.x, car.y);
}

// Note: damage one occupant must take before going down; a rifle round does it, a pistol takes two.
export const PERSON_HP = 24;

// Note: a player hit damages a part and may pass through to an occupant; returns true when the enemy is out.
export function hurtEnemy(en, dmg, rand) {
  const out = hitCar(en.car.parts, dmg, rand);
  const stopped = out.armor && !out.slot;
  if (!stopped && rand() < en.def.expose + 0.1) hurtCrew(en, dmg);
  return checkDown(en);
}

function hurtCrew(en, dmg) {
  en.hurt = (en.hurt || 0) + dmg;
  if (en.hurt < PERSON_HP) return;
  en.hurt = 0;
  en.crew -= 1;
}

export function ramEnemy(en, impact, rand) {
  if (impact < 50) return false;
  if (isBike(en.def.model)) en.crew = 0;
  else {
    crashCar(en.car.parts, impact * 1.3, rand);
    if (impact > 150) hurtCrew(en, PERSON_HP);
  }
  return checkDown(en);
}

function checkDown(en) {
  if (en.dead) return false;
  if (en.crew <= 0 || carStats(VEHICLE[en.def.model], en.car.parts).disabled) {
    en.dead = true;
    en.hostile = false;
    en.car.running = false;
    return true;
  }
  return false;
}

// Note: a stopped enemy car that still runs is left with the keys in; its parts and tank stay as they were.
export function enemyRunner(en, id, rand) {
  const L = en.def.loot;
  const roll = ([lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
  const parts = {};
  for (const slot of SLOTS) {
    const p = en.car.parts[slot];
    parts[slot] = p ? Math.round(p.cond) : null;
  }
  return {
    id, kind: 'runner', model: en.def.model, x: en.car.x, y: en.car.y, a: en.car.a,
    fuel: Math.round(en.car.fuel * 10) / 10, water: roll(L.water), ammo: roll(L.ammo), parts, paint: en.def.paint,
  };
}

export function drivable(en) {
  return !VEHICLE[en.def.model].enemyOnly && !carStats(VEHICLE[en.def.model], en.car.parts).disabled;
}

// Note: a downed enemy that will not run becomes a persistent wreck; bikes give fuel and ammo only.
export function enemyWreck(en, id, rand) {
  const L = en.def.loot;
  const roll = ([lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
  const parts = {};
  const bike = isBike(en.def.model);
  for (const slot of SLOTS) {
    const p = en.car.parts[slot];
    parts[slot] = !bike && p && p.cond > 0 ? Math.round(p.cond * (0.4 + 0.5 * rand())) : null;
  }
  return {
    id, kind: 'wreck', model: en.def.model, x: en.car.x, y: en.car.y, a: en.car.a,
    fuel: Math.round((L.fuel[0] + rand() * (L.fuel[1] - L.fuel[0])) * 10) / 10,
    water: roll(L.water), ammo: roll(L.ammo), cans: 0, parts, paint: en.def.paint, fresh: true,
  };
}
