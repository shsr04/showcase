// Note: item 499: dynamite, the Ironman reward; the throwing sequence, flight, the fuse, the blast and the demolition it does, with no DOM or Phaser.
// Note: a throw is a bundle of five half-pound sticks of 40 % straight dynamite taped together, about 1 kg TNT equivalent; its blast follows Sadovsky's overpressure formula.

import { FLOOR_H, HEIGHT, RADIUS } from './config.js';
import { clamp, lerp, angleDiff, unit } from './rand.js';
import { T, DS, WS, TILE_PROPS, cellObstacle, SILL, LINTEL } from './tiles.js';
import { tileAt, stateAt, setState, replaceTile, inMap } from './map.js';
import { castRay } from './los.js';
import { makeBullet, disruptAim, WEAPONS } from './weapons.js';
import { applyHit, capability, hitReaction } from './wounds.js';
import { groundAt } from './terrain-height.js';
import { SOUND_LEVELS } from './sound.js';

export const DYNAMITE = Object.freeze({
  // Note: bundles the sheriff carries into each scene once the reward is earned.
  sticks: 3,
  perBundle: 5,
  kg: 1,
  // Note: one press of G runs the whole sequence, in seconds per stage; the gun goes back in at the end in its own draw time.
  stages: [['stow', 0.45], ['draw', 0.4], ['strike', 0.45], ['light', 0.45], ['windup', 0.35], ['release', 0.18], ['redraw', 0]],
  // Note: a fuse cut to about two inches burns in four to five and a half seconds, never exactly alike.
  fuse: [4, 5.5],
  // Note: always a full-strength overhand throw: a 1.2 kg bundle leaves the hand at about 13 m/s, at 40 degrees in the open.
  speed: 13,
  lob: (40 * Math.PI) / 180,
  hand: 1.6,
  g: 9.81,
  // Note: paper-wrapped sticks barely bounce: they keep this share of their speed off a wall and slide to rest on the floor.
  wallKeep: 0.3,
  floorKeep: 0.2,
  slide: 11,
  ceiling: FLOOR_H - 0.2,
  hiss: 0.5,
  // Note: blast effects are worked out out to this many metres.
  reach: 30,
  // Note: debris thrown by the blast (stones, splinters, the wrapper), as low-energy rounds that lose their force within several metres.
  fragments: 28,
  fragEnergy: [60, 260],
  fragSpeed: 180,
  fragDrag: 0.13,
});

// Note: the effects of peak overpressure (kPa) on a person, from the Bowen curves for short pulses and eardrum data, lightest first.
export const BLAST_HARM = Object.freeze({ flinch: 3, stagger: 10, eardrum: 35, knockdown: 70, lung: 180, lethal: 550 });
// Note: the peak pressure (kPa) at which a structure fails, from blast-damage tables: glass at a few kPa, a door off its hinges at a few tens,
// Note: light furniture, fences and brush round 40–60, an interior plank partition round 100, an outer frame wall round 160; adobe and rock are not demolished.
export const DEMOLISH = Object.freeze({
  glass: 3, door: 20, doorway: 60, window: 50, partition: 100, frame: 160,
  light: 45, heavy: 80, iron: 300, fence: 35, plant: 60, wagon: 120,
});
// Note: a wall between the blast and a point lets only the diffracted share through.
const SHIELD = 0.2;
// Note: inside a room the walls throw the pulse back, which roughly doubles a near blast; the factor is kept modest.
const REFLECT = 1.4;
const INDOOR = new Set([T.FLOOR, T.RUG, T.STAIRS, T.RUN, T.CHAIR]);
// Note: seconds before a man recognises a fizzing bundle for what it is.
const RECOGNISE = { green: 0.9, seasoned: 0.6, veteran: 0.35 };
const DODGE_R = 9;

// Note: peak overpressure in kPa at r metres from kg of TNT (Sadovsky); the scaled distance is clamped near the charge.
export function overpressure(r, kg = DYNAMITE.kg) {
  const z = Math.max(0.6, r / Math.cbrt(kg));
  return 85 / z + 300 / (z * z) + 800 / (z * z * z);
}

const gauss = (rand) => {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

export function armDynamite(sim, sticks) {
  sim.charges = [];
  sim.nextCharge = 1;
  sim.dynamiteGiven = Math.max(0, Math.floor(sticks || 0));
  sim.sheriff.dynamite = sim.dynamiteGiven;
  sim.sheriff.blasting = null;
}

// Note: one press of G starts the whole throw; until the gun is back in hand the sheriff neither shoots, reloads, stabs, uses anything nor sprints.
export function blastIntent(sim, a, input, intent) {
  if (input.dynamite && !a.blasting) startThrow(sim, a);
  if (!a.blasting) return intent;
  // Note: the throw goes the way the sheriff faces; the sim has already turned the pointer into this.
  a.blasting.angle = intent.face;
  intent.fire = false;
  intent.steady = false;
  intent.reload = false;
  intent.knife = false;
  intent.switchWeapon = false;
  intent.use = null;
  if (intent.mode === 'sprint') intent.mode = 'walk';
  return intent;
}

function startThrow(sim, a) {
  if (a.status !== 'ok' || a.carried || a.carrying || a.action || sim.outcome?.final) return;
  if (!a.dynamite) {
    if (sim.dynamiteGiven) sim.voice(a, 'No dynamite left.');
    return;
  }
  if (a.stance === 'prone') return sim.voice(a, 'Not from the ground.');
  if (!capability(a).handgunOk) return sim.voice(a, 'Not with this arm.');
  a.dynamite -= 1;
  const w = a.weapons?.[a.cur];
  a.blasting = { stage: 'stow', i: 0, t: 0, charge: null, angle: a.facing, redraw: w ? WEAPONS[w.id].drawTime : 0.3 };
  sim.events.push({ type: 'dynamite', stage: 'stow', actorId: a.id, left: a.dynamite });
  sim.emit(a, 'switch');
}

// Note: the stage of the sequence the sheriff is in, and how far through it he is (0..1).
export function blastStage(b) {
  if (!b) return null;
  const dur = b.stage === 'redraw' ? b.redraw : DYNAMITE.stages[b.i][1];
  return { stage: b.stage, p: dur > 0 ? clamp(b.t / dur, 0, 1) : 1 };
}

// Note: where the bundle is held in each stage, in metres ahead of and to the right of the body; the picture of the pose uses the same points.
export const HOLD = Object.freeze({ draw: [0.32, 0.1], strike: [0.42, 0.1], light: [0.45, 0.06], windup: [-0.25, 0.36], release: [0.6, 0.12] });
function handPos(a, stage = 'light') {
  const [fw, rt] = HOLD[stage] || HOLD.light;
  const c = Math.cos(a.facing);
  const s = Math.sin(a.facing);
  return { x: a.x + c * fw - s * rt, y: a.y + s * fw + c * rt };
}

const roofed = (sim, f, x, y) => sim.house.kind !== 'outdoor' && INDOOR.has(tileAt(sim.map, f, Math.floor(x), Math.floor(y)));

// Note: what a resting stick lies on: the ground, or the top of a low piece of furniture.
function support(sim, f, x, y) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const base = groundAt(sim.map, x, y, f);
  if (!inMap(sim.map, cx, cy)) return base;
  const t = tileAt(sim.map, f, cx, cy);
  const p = TILE_PROPS[t];
  return p && p.mat && Number.isFinite(p.h) && p.h <= 1.3 && t !== T.DOOR && t !== T.WINDOW ? base + p.h : base;
}

// Note: what stops a flying stick at height z in a cell; null when it passes.
function obstacle(sim, f, x, y, z) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (!inMap(sim.map, cx, cy)) return 'edge';
  const t = tileAt(sim.map, f, cx, cy);
  if (t === T.DROP || t === T.VOID) return 'edge';
  const rel = z - groundAt(sim.map, x, y, f);
  // Note: above a door, open or shut, is the wall over its lintel.
  if (t === T.DOOR && rel >= LINTEL) return 'frame';
  return cellObstacle(t, stateAt(sim.map, f, cx, cy), rel);
}

function newCharge(sim, a, fuse) {
  const p = handPos(a);
  const c = {
    id: sim.nextCharge++, owner: a.id, holder: a.id, state: 'held', floor: a.floor, x: p.x, y: p.y,
    z: groundAt(sim.map, p.x, p.y, a.floor) + 1.1, vx: 0, vy: 0, vz: 0, fuse, burnt: 0, spin: 0, angle: a.facing, hiss: 0, landed: false, seen: new Map(),
  };
  sim.charges.push(c);
  return c;
}

// Note: the launch elevation of a full-strength throw: the 40-degree lob in the open, flattened under a ceiling until its top clears it.
export function launchAngle(speed, hand, ceiling = Infinity, g = DYNAMITE.g) {
  const room = ceiling - hand;
  if (!Number.isFinite(room)) return DYNAMITE.lob;
  if (room <= 0) return 0;
  return Math.min(DYNAMITE.lob, Math.asin(clamp(Math.sqrt(2 * g * room) / speed, 0, 1)));
}

// Note: the range of a throw at speed and elevation from height hand to level ground.
export function throwRange(speed, th, hand = DYNAMITE.hand, g = DYNAMITE.g) {
  const vs = speed * Math.sin(th);
  return (speed * Math.cos(th) * (vs + Math.sqrt(vs * vs + 2 * g * hand))) / g;
}

// Note: the height above the hand of a throw at speed and elevation th after d metres.
const heightAt = (speed, th, d, g = DYNAMITE.g) => d * Math.tan(th) - (g * d * d) / (2 * (speed * Math.cos(th)) ** 2);

// Note: the first window the line of the throw meets within reach, and its distance; null when a wall or a closed door comes first.
export function windowOnLine(sim, f, x, y, angle, reach = 14) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let last = null;
  for (let d = 0.3; d <= reach; d += 0.1) {
    const cx = Math.floor(x + ux * d);
    const cy = Math.floor(y + uy * d);
    if (last && last[0] === cx && last[1] === cy) continue;
    last = [cx, cy];
    if (!inMap(sim.map, cx, cy)) return null;
    const t = tileAt(sim.map, f, cx, cy);
    if (t === T.WINDOW) {
      // Note: the middle of the cell along the line, where the bundle crosses the wall.
      let d0 = d;
      while (Math.floor(x + ux * (d0 + 0.05)) === cx && Math.floor(y + uy * (d0 + 0.05)) === cy && d0 < d + 1.5) d0 += 0.05;
      return { x: cx, y: cy, d: (d + d0) / 2 };
    }
    const p = TILE_PROPS[t];
    if (p && p.mat && !Number.isFinite(p.h)) return null;
    if (t === T.DOOR && (stateAt(sim.map, f, cx, cy) === DS.CLOSED || stateAt(sim.map, f, cx, cy) === DS.LOCKED)) return null;
  }
  return null;
}

// Note: the elevation that carries the bundle through a window d metres off at the middle of the opening; null if no throw at this speed reaches it.
export function windowAngle(speed, hand, d, ceiling = Infinity) {
  const want = (SILL + LINTEL) / 2 - hand;
  let lo = -0.6;
  let hi = DYNAMITE.lob;
  if (heightAt(speed, hi, d) < want || heightAt(speed, lo, d) > want) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(speed, mid, d) < want) lo = mid;
    else hi = mid;
  }
  const top = hand + (hi > 0 ? (speed * Math.sin(hi)) ** 2 / (2 * DYNAMITE.g) : 0);
  return top <= ceiling ? hi : null;
}

function release(sim, a, c, b) {
  const cap = capability(a);
  // Note: a throw is never exact: a few degrees off the line and a little off full strength, more on the move, in pain or with a hurt arm.
  const hurt = a.wounds?.some((w) => w.region === 'arm' && !w.old);
  const shaky = 1 + (a.mode && a.mode !== 'idle' ? 0.6 : 0) + (a.pain || 0) * 0.8 + (cap.handgunOk ? 0 : 1);
  const angle = b.angle + gauss(sim.rand) * 0.04 * shaky;
  const speed = DYNAMITE.speed * (hurt ? 0.7 : 1) * clamp(1 + gauss(sim.rand) * 0.05 * shaky, 0.8, 1.08);
  const start = handPos(a, 'release');
  const ceiling = roofed(sim, a.floor, a.x, a.y) ? DYNAMITE.ceiling : Infinity;
  // Note: aimed at a window, the throw goes flatter, through the opening between sill and lintel, instead of lobbing into the wall above it.
  const from = castRay(sim.map, a.floor, a.x, a.y, start.x, start.y).clear ? start : a;
  const win = windowOnLine(sim, a.floor, from.x, from.y, b.angle);
  const through = win ? windowAngle(speed, DYNAMITE.hand, win.d, ceiling) : null;
  const th = through != null ? through + gauss(sim.rand) * 0.01 * shaky : launchAngle(speed, DYNAMITE.hand, ceiling);
  c.state = 'flying';
  c.holder = null;
  // Note: the bundle leaves the hand where the arm is, but never through a wall the sheriff stands against.
  const clear = castRay(sim.map, a.floor, a.x, a.y, start.x, start.y).clear;
  c.x = clear ? start.x : a.x;
  c.y = clear ? start.y : a.y;
  c.z = groundAt(sim.map, c.x, c.y, c.floor) + DYNAMITE.hand;
  c.vx = Math.cos(angle) * speed * Math.cos(th);
  c.vy = Math.sin(angle) * speed * Math.cos(th);
  c.vz = speed * Math.sin(th);
  c.spin = 8 + sim.rand() * 5;
  c.thrownAt = sim.time;
  sim.events.push({ type: 'dynamite', stage: 'throw', actorId: a.id, chargeId: c.id, x: c.x, y: c.y, floor: c.floor });
  sim.emit(a, 'swish');
  // Note: the miner's warning; a sheriff working by hand signals throws in silence.
  if (!sim.signal) sim.say(a, 'Fire in the hole!');
}

// Note: a bundle dropped from the hand falls at the holder's feet with its fuse still burning.
function drop(sim, c) {
  c.state = 'flying';
  c.holder = null;
  c.vx = (sim.rand() - 0.5) * 0.6;
  c.vy = (sim.rand() - 0.5) * 0.6;
  c.vz = 0;
  sim.events.push({ type: 'dynamite', stage: 'drop', chargeId: c.id, x: c.x, y: c.y, floor: c.floor });
}

function nextStage(sim, a, b) {
  b.i += 1;
  b.t = 0;
  b.stage = DYNAMITE.stages[b.i][0];
  sim.events.push({ type: 'dynamite', stage: b.stage, actorId: a.id, chargeId: b.charge?.id ?? null });
  if (b.stage === 'strike') sim.emit(a, 'match');
  else if (b.stage === 'release') release(sim, a, b.charge, b);
  else if (b.stage === 'redraw') sim.emit(a, 'switch');
}

function stepSheriff(sim, dt) {
  const a = sim.sheriff;
  const b = a.blasting;
  if (!b) return;
  const down = a.status !== 'ok' || a.carried || !capability(a).handgunOk || a.stance === 'prone';
  if (down) {
    if (b.charge && b.charge.state === 'held') drop(sim, b.charge);
    else if (!b.charge) sim.events.push({ type: 'dynamite', stage: 'fumble', actorId: a.id });
    a.blasting = null;
    return;
  }
  b.t += dt;
  const dur = b.stage === 'redraw' ? b.redraw : DYNAMITE.stages[b.i][1];
  if (b.t < dur) return;
  if (b.stage === 'light') {
    const fuse = lerp(DYNAMITE.fuse[0], DYNAMITE.fuse[1], sim.rand());
    b.charge = newCharge(sim, a, fuse);
    sim.events.push({ type: 'dynamite', stage: 'lit', actorId: a.id, chargeId: b.charge.id });
    sim.emit(a, 'fuse');
  }
  if (b.stage === 'redraw') {
    a.blasting = null;
    sim.events.push({ type: 'dynamite', stage: 'ready', actorId: a.id });
    return;
  }
  nextStage(sim, a, b);
}

// Note: a held bundle rides in the hand of its stage.
function holdAt(a) {
  return a.blasting ? a.blasting.stage : 'light';
}

function bounceWall(sim, c, nx, ny) {
  const sx = obstacle(sim, c.floor, nx, c.y, c.z);
  const sy = obstacle(sim, c.floor, c.x, ny, c.z);
  const k = DYNAMITE.wallKeep;
  const hard = sx || sy || obstacle(sim, c.floor, nx, ny, c.z);
  // Note: a stick thrown hard enough breaks a closed pane and flies on through it.
  if (hard === 'glass' && Math.hypot(c.vx, c.vy) > 3) {
    const cell = [[nx, c.y], [c.x, ny], [nx, ny]].find(([x, y]) => obstacle(sim, c.floor, x, y, c.z) === 'glass');
    shatter(sim, c.floor, Math.floor(cell[0]), Math.floor(cell[1]));
    c.vx *= 0.6;
    c.vy *= 0.6;
    return false;
  }
  if (sx) c.vx = -c.vx * k;
  if (sy) c.vy = -c.vy * k;
  if (!sx && !sy) {
    c.vx = -c.vx * k;
    c.vy = -c.vy * k;
  }
  c.vy *= sx && !sy ? 0.8 : 1;
  c.vx *= sy && !sx ? 0.8 : 1;
  thud(sim, c, Math.hypot(c.vx, c.vy) / k);
  return true;
}

function thud(sim, c, speed) {
  if (speed < 1.2) return;
  sim.emit({ x: c.x, y: c.y, floor: c.floor, id: -1 }, 'stick', SOUND_LEVELS.stick + clamp((speed - 4) * 2, -8, 10));
  sim.events.push({ type: 'dynamite', stage: 'bounce', chargeId: c.id, x: c.x, y: c.y, floor: c.floor, speed });
}

function shatter(sim, f, x, y) {
  if (tileAt(sim.map, f, x, y) !== T.WINDOW) return;
  const st = stateAt(sim.map, f, x, y);
  if (st !== WS.CLOSED && st !== WS.BOLTED) return;
  setState(sim.map, f, x, y, WS.BROKEN);
  sim.events.push({ type: 'tile', f, x, y });
  sim.events.push({ type: 'glass', x: x + 0.5, y: y + 0.5, floor: f });
  sim.emit({ x: x + 0.5, y: y + 0.5, floor: f, id: -1 }, 'glass');
}

// Note: the stick glances off a person it meets in the air below head height.
function hitsPerson(sim, c) {
  if (c.thrownAt != null && sim.time - c.thrownAt < 0.2) return null;
  for (const p of sim.actors) {
    if (p.status !== 'ok' || p.floor !== c.floor || p.carried) continue;
    const top = groundAt(sim.map, p.x, p.y, p.floor) + (HEIGHT[p.stance] || HEIGHT.stand);
    if (c.z < top && Math.hypot(p.x - c.x, p.y - c.y) < RADIUS + 0.05) return p;
  }
  return null;
}

function stepCharge(sim, c, dt) {
  c.fuse -= dt;
  c.burnt += dt;
  c.hiss -= dt;
  if (c.hiss <= 0) {
    c.hiss = DYNAMITE.hiss;
    sim.emit({ x: c.x, y: c.y, floor: c.floor, id: -1 }, 'fuse');
  }
  if (c.state === 'held') {
    const a = sim.byId(c.holder);
    const p = handPos(a, holdAt(a));
    c.x = p.x;
    c.y = p.y;
    c.z = groundAt(sim.map, p.x, p.y, a.floor) + 1.1;
    c.floor = a.floor;
    c.angle = a.facing;
  } else if (c.state === 'flying') fly(sim, c, dt);
  if (c.fuse <= 0) explode(sim, c);
}

function fly(sim, c, dt) {
  const n = Math.max(1, Math.ceil((Math.hypot(c.vx, c.vy, c.vz) * dt) / 0.08));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const nx = c.x + c.vx * h;
    const ny = c.y + c.vy * h;
    if (obstacle(sim, c.floor, nx, ny, c.z) || obstacle(sim, c.floor, nx, c.y, c.z) || obstacle(sim, c.floor, c.x, ny, c.z)) {
      if (bounceWall(sim, c, nx, ny)) continue;
    }
    const p = hitsPerson(sim, c);
    if (p && !c.glanced?.has(p.id)) {
      (c.glanced ||= new Set()).add(p.id);
      const d = Math.hypot(c.x - p.x, c.y - p.y) || 1;
      const sp = Math.hypot(c.vx, c.vy) * 0.3;
      c.vx = ((c.x - p.x) / d) * sp;
      c.vy = ((c.y - p.y) / d) * sp;
      thud(sim, c, sp / 0.3);
      continue;
    }
    c.x += c.vx * h;
    c.y += c.vy * h;
    const ground = support(sim, c.floor, c.x, c.y);
    if (c.z > ground + 1e-3 || c.vz > 0) {
      c.vz -= DYNAMITE.g * h;
      c.z += c.vz * h;
      if (roofed(sim, c.floor, c.x, c.y) && c.z > groundAt(sim.map, c.x, c.y, c.floor) + DYNAMITE.ceiling) {
        c.z = groundAt(sim.map, c.x, c.y, c.floor) + DYNAMITE.ceiling;
        c.vz = -Math.abs(c.vz) * 0.3;
        thud(sim, c, 3);
      }
      c.angle += c.spin * h;
    }
    if (c.z <= ground && c.vz <= 0) {
      const fall = -c.vz;
      c.z = ground;
      if (fall > 2.5) {
        c.vz = fall * DYNAMITE.floorKeep;
        c.vx *= 0.4;
        c.vy *= 0.4;
        c.spin *= 0.5;
        thud(sim, c, fall);
      } else c.vz = 0;
      if (!c.landed) {
        c.landed = true;
        sim.events.push({ type: 'dynamite', stage: 'land', chargeId: c.id, x: c.x, y: c.y, floor: c.floor });
      }
    }
    if (c.z <= ground + 1e-3 && c.vz === 0) {
      const sp = Math.hypot(c.vx, c.vy);
      const left = Math.max(0, sp - DYNAMITE.slide * h);
      c.vx = sp ? (c.vx / sp) * left : 0;
      c.vy = sp ? (c.vy / sp) * left : 0;
      c.spin *= 0.9;
      if (left < 0.05) {
        c.state = 'rest';
        c.vx = 0;
        c.vy = 0;
        c.spin = 0;
        break;
      }
    }
  }
}

// Note: the overpressure a point feels, with walls in the way shielding it and a room's walls reflecting the pulse.
function pressureAt(sim, c, x, y, floor, endCell = null) {
  const r = Math.hypot(x - c.x, y - c.y, 0);
  let p = overpressure(r) * (roofed(sim, c.floor, c.x, c.y) ? REFLECT : 1);
  if (floor !== c.floor) return p * 0.05;
  const ray = castRay(sim.map, c.floor, c.x, c.y, x, y);
  const blockedEnd = !ray.clear && endCell && Math.floor(ray.x + Math.sign(x - c.x) * 1e-6) === endCell.x && Math.floor(ray.y + Math.sign(y - c.y) * 1e-6) === endCell.y;
  if (!ray.clear && !blockedEnd) p *= SHIELD;
  return p;
}

function explode(sim, c) {
  if (c.gone) return;
  c.gone = true;
  const at = { x: c.x, y: c.y, floor: c.floor, id: -1 };
  const holder = c.holder != null ? sim.byId(c.holder) : null;
  if (holder && holder.blasting?.charge === c) holder.blasting = null;
  const owner = sim.byId(c.owner);
  sim.events.push({ type: 'blast', chargeId: c.id, x: c.x, y: c.y, z: c.z, floor: c.floor, kg: DYNAMITE.kg, indoor: roofed(sim, c.floor, c.x, c.y), ownerId: c.owner });
  sim.decals.push({ kind: 'scorch', x: c.x, y: c.y, floor: c.floor, r: 0.9, age: sim.time });
  if (sim.decals.length > 300) sim.decals.shift();
  sim.emit(at, 'blast');
  for (const v of sim.actors) {
    if (v.status === 'dead' || v.withdrawn) continue;
    const r = Math.hypot(v.x - c.x, v.y - c.y);
    if (r > DYNAMITE.reach) continue;
    const p = pressureAt(sim, c, v.x, v.y, v.floor);
    harm(sim, v, p, Math.atan2(v.y - c.y, v.x - c.x), owner, c);
  }
  structures(sim, c);
  fragments(sim, c);
  for (const o of sim.charges) {
    if (o === c || o.gone || o.floor !== c.floor) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    // Note: a stick lying against the one that goes off goes off with it; farther ones are flung, fuses still burning.
    if (d < 0.5) o.fuse = Math.min(o.fuse, 0.001);
    else if (d < 3 && o.state !== 'held') {
      const k = (3 - d) * 2.5;
      o.state = 'flying';
      o.vx += ((o.x - c.x) / d) * k;
      o.vy += ((o.y - c.y) / d) * k;
      o.vz += k * 0.4;
    }
  }
}

function harm(sim, v, p, dir, owner, c) {
  if (p < BLAST_HARM.flinch) return;
  const tag = `${sim.seed}:blast:${c.id}:${v.id}`;
  const roll = (k) => unit(`${tag}:${k}`);
  const wasOk = v.status === 'ok';
  let wound = null;
  const shot = { range: Math.hypot(v.x - c.x, v.y - c.y), seed: sim.seed };
  if (p >= BLAST_HARM.lethal) wound = applyHit(v, { region: 'chest', side: 0 }, 1600, () => 0, sim.time, shot);
  else if (p >= BLAST_HARM.lung) wound = applyHit(v, { region: 'chest', side: 0 }, lerp(450, 1100, (p - BLAST_HARM.lung) / (BLAST_HARM.lethal - BLAST_HARM.lung)), () => roll('lung'), sim.time, shot);
  else if (p >= BLAST_HARM.knockdown) wound = applyHit(v, { region: 'abdomen', side: 0 }, lerp(200, 450, (p - BLAST_HARM.knockdown) / (BLAST_HARM.lung - BLAST_HARM.knockdown)), () => roll('gut'), sim.time, shot);
  if (wound?.wound) {
    v.cause = 'dynamite blast';
    v.lastHitBy = owner?.role || null;
    v.lastShotDirection = dir + Math.PI;
    sim.decals.push({ x: v.x, y: v.y, floor: v.floor, r: 0.25, age: sim.time });
    if (!wound.died) sim.emit(v, 'cry');
    sim.events.push({ type: 'hit', actorId: v.id, ownerId: owner?.id ?? -1, region: wound.wound.region, side: 0, died: wound.died, incapacitated: wound.incapacitated, fatal: !!wound.wound.fatal, stop: wound.stop, x: v.x, y: v.y, floor: v.floor, dir, severity: wound.wound.severity, kind: 'stagger', blast: true });
  }
  // Note: ringing ears: ruptured eardrums take most hearing for a long while, a lesser blast dulls it for seconds.
  const deaf = p >= BLAST_HARM.eardrum ? 45 : p >= BLAST_HARM.stagger ? 28 : 12;
  v.deafDb = Math.max(v.deafDb || 0, deaf);
  sim.events.push({ type: 'deafened', actorId: v.id, db: deaf, kpa: p });
  if (v.status !== 'ok') {
    if (wasOk) sim.onStatus(v);
    return;
  }
  // Note: the pulse throws a man back and off his feet; how far and for how long grows with the pressure.
  const push = clamp((p - BLAST_HARM.stagger) / 120, 0, 1.2);
  for (let i = 0; i < 12 && push > 0; i++) sim.moveBy(v, Math.cos(dir) * push / 12, Math.sin(dir) * push / 12);
  const hold = p >= BLAST_HARM.knockdown ? 3 + roll('down') : p >= BLAST_HARM.eardrum ? 1.8 + roll('down') * 0.8 : p >= BLAST_HARM.stagger ? 0.8 : 0.25;
  const r = hitReaction(p >= BLAST_HARM.eardrum ? 'chest' : 'arm', clamp(p / 60, 0.25, 1.6));
  v.react = { kind: p >= BLAST_HARM.eardrum ? 'stagger' : 'flinch', t0: sim.time, dur: Math.max(r.dur, hold + 0.4), dir, side: 0, region: 'chest', severity: clamp(p / 60, 0.25, 1.6), freeze: hold, push: Math.min(0.03, push * 0.02 + 0.004), speed: 0.2, turn: 0.4, noFire: hold, keep: 0 };
  disruptAim(v, 0, 0);
  v.steady = false;
  if (v.action && p >= BLAST_HARM.stagger) v.action = null;
  if (v.carrying && p >= BLAST_HARM.eardrum) sim.releaseCarry(v, 'hit');
  if (v !== sim.sheriff) {
    v.thinkT = hold;
    v.intent = null;
    v.nav = null;
  }
  if (v.role === 'hostile') v.alert = true;
}

// Note: what a cell is made of for the blast, and the pressure that wrecks it; null for what a blast does not demolish (adobe, rock, earth, stairs, ground).
function failure(t) {
  switch (t) {
    case T.PARTITION: return { kpa: DEMOLISH.partition, mat: 'plank' };
    case T.FRAME: return { kpa: DEMOLISH.frame, mat: 'frame' };
    case T.DOOR: return { kpa: DEMOLISH.doorway, mat: 'door' };
    case T.WINDOW: return { kpa: DEMOLISH.window, mat: 'frame' };
    case T.STOVE: case T.SMITH_FORGE: return { kpa: DEMOLISH.iron, mat: 'iron' };
    case T.FENCE: case T.RAIL: case T.POST: case T.FENCE_TROUGH: return { kpa: DEMOLISH.fence, mat: 'fence' };
    case T.CACTUS: case T.MESQUITE: return { kpa: DEMOLISH.plant, mat: 'plant' };
    case T.WAGON: case T.CIRCLE_WAGON: case T.ROADBLOCK_WAGON: case T.TRADER_WAGON: case T.FREIGHT_CART: return { kpa: DEMOLISH.wagon, mat: 'heavy' };
    default: break;
  }
  const p = TILE_PROPS[t];
  if (!p || !p.mat || !Number.isFinite(p.h) || ['adobe', 'stone', 'earth'].includes(p.mat)) return null;
  if (t === T.STAIRS || t === T.RUN || t === T.DROP || t === T.VOID || t === T.WATER || t === T.SHAFT) return null;
  // Note: tall cupboards, desks and counters stand longer than chairs, tables and crates.
  return { kpa: p.mat === 'heavy' || p.h >= 1.5 ? DEMOLISH.heavy : DEMOLISH.light, mat: p.mat === 'plank' ? 'wood' : p.mat };
}

// Note: what is left where something was blown away: floorboards inside the house, bare ground outside.
function wreckTile(sim, f, x, y) {
  if (sim.house.kind === 'outdoor') return T.SAND;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ([T.FLOOR, T.RUG].includes(tileAt(sim.map, f, x + dx, y + dy))) return T.FLOOR;
  return T.SAND;
}

// Note: the pulse works outward from the charge, nearest cells first: what fails opens the way for the pressure to the cells behind it, as in a real breach.
// Note: glass goes far out, doors are blown in and torn out with their frames, wooden walls, furniture and outdoor cover are blown away into rubble.
function structures(sim, c) {
  const R = DYNAMITE.reach;
  const f = c.floor;
  const cells = [];
  for (let y = Math.max(0, Math.floor(c.y - R)); y <= Math.min(sim.map.H - 1, Math.floor(c.y + R)); y++) {
    for (let x = Math.max(0, Math.floor(c.x - R)); x <= Math.min(sim.map.W - 1, Math.floor(c.x + R)); x++) {
      const t = tileAt(sim.map, f, x, y);
      if (t === T.WINDOW || failure(t)) cells.push({ x, y, d: Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) });
    }
  }
  cells.sort((p, q) => p.d - q.d);
  let wrecked = 0;
  for (const { x, y } of cells) {
    const t = tileAt(sim.map, f, x, y);
    const p = pressureAt(sim, c, x + 0.5, y + 0.5, f, { x, y });
    const fail = failure(t);
    if (fail && p >= fail.kpa) {
      if (t === T.WINDOW) shatter(sim, f, x, y);
      replaceTile(sim.map, f, x, y, wreckTile(sim, f, x, y));
      sim.events.push({ type: 'tile', f, x, y });
      sim.events.push({ type: 'demolish', x: x + 0.5, y: y + 0.5, floor: f, material: fail.mat, from: t, dir: Math.atan2(y + 0.5 - c.y, x + 0.5 - c.x), kpa: p });
      sim.decals.push({ kind: 'rubble', x: x + 0.5, y: y + 0.5, floor: f, r: 0.6, mat: fail.mat, age: sim.time });
      wrecked += 1;
      continue;
    }
    const st = stateAt(sim.map, f, x, y);
    if (t === T.WINDOW && p >= DEMOLISH.glass) shatter(sim, f, x, y);
    else if (t === T.DOOR && p >= DEMOLISH.door && (st === DS.CLOSED || st === DS.LOCKED)) {
      setState(sim.map, f, x, y, DS.BROKEN);
      sim.events.push({ type: 'tile', f, x, y });
      sim.events.push({ type: 'impact', x: x + 0.5, y: y + 0.5, floor: f, material: 'door', stopped: true, blast: true });
    }
  }
  if (sim.decals.length > 300) sim.decals.splice(0, sim.decals.length - 300);
  // Note: timbers and boards coming down after the blast.
  if (wrecked) sim.emit({ x: c.x, y: c.y, floor: f, id: -1 }, 'collapse', SOUND_LEVELS.collapse + Math.min(12, wrecked));
  return wrecked;
}

// Note: debris goes out low and in every direction, most of it along the ground.
function fragments(sim, c) {
  const base = support(sim, c.floor, c.x, c.y);
  for (let i = 0; i < DYNAMITE.fragments; i++) {
    const angle = (i / DYNAMITE.fragments) * Math.PI * 2 + (sim.rand() - 0.5) * 0.4;
    sim.bullets.push(makeBullet({
      x: c.x + Math.cos(angle) * 0.1, y: c.y + Math.sin(angle) * 0.1, floor: c.floor, z: base + 0.15, vz: sim.rand() * 0.5,
      angle, speed: DYNAMITE.fragSpeed, energy: lerp(DYNAMITE.fragEnergy[0], DYNAMITE.fragEnergy[1], sim.rand()), owner: c.owner, weaponId: 'dynamite', drag: DYNAMITE.fragDrag, frag: true,
    }));
  }
}

// Note: everything about dynamite that runs once per tick: the sheriff's stick, every charge, and hearing coming back.
export function stepBlasting(sim, input, dt) {
  if (!sim.charges) return;
  stepSheriff(sim, dt);
  for (const c of sim.charges.slice()) if (!c.gone) stepCharge(sim, c, dt);
  sim.charges = sim.charges.filter((c) => !c.gone);
  for (const a of sim.actors) if (a.deafDb) a.deafDb = a.deafDb < 0.5 ? 0 : a.deafDb - dt * (0.6 + a.deafDb * 0.03);
}

// Note: a reflex, not a plan: anyone who has seen a lit stick near him and taken in what it is runs from it, upsetting whatever he was doing.
export function dodgeBlast(sim, a, intent) {
  if (!sim.charges?.length || a.status !== 'ok' || a.carried || a.surrendered || a === sim.sheriff) return intent;
  let near = null;
  let nd = Infinity;
  for (const c of sim.charges) {
    if (c.gone || c.floor !== a.floor || c.state === 'held') continue;
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d > DODGE_R) continue;
    if (!c.seen.has(a.id)) {
      const heard = d < 2.5 && c.landed;
      if (!heard && !sim.pointVisible(a, c.x, c.y)) continue;
      const lag = (RECOGNISE[a.traits?.experience] ?? RECOGNISE.seasoned) * (0.7 + 0.6 * unit(`${sim.seed}:dodge:${c.id}:${a.id}`));
      c.seen.set(a.id, sim.time + lag);
    }
    if (sim.time < c.seen.get(a.id)) continue;
    if (d < nd) {
      nd = d;
      near = c;
    }
  }
  if (!near) return intent;
  if (!a.dodging) {
    a.dodging = near.id;
    sim.say(a, a.role === 'hostile' ? 'Dynamite!' : 'Get down!');
  }
  // Note: the best of sixteen directions: farthest from the stick after a short dash, and best of all behind a wall from it.
  let best = null;
  let score = -Infinity;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const px = a.x + Math.cos(ang) * 2.5;
    const py = a.y + Math.sin(ang) * 2.5;
    const path = castRay(sim.map, a.floor, a.x, a.y, px, py);
    if (sim.blocked(a, a.x + Math.cos(ang) * 0.35, a.y + Math.sin(ang) * 0.35)) continue;
    const ex = path.clear ? px : path.x - Math.cos(ang) * 0.4;
    const ey = path.clear ? py : path.y - Math.sin(ang) * 0.4;
    const away = Math.hypot(ex - near.x, ey - near.y);
    const cover = !castRay(sim.map, a.floor, near.x, near.y, ex, ey).clear ? 3 : 0;
    const s = away + cover - Math.abs(angleDiff(ang, a.facing)) * 0.1;
    if (s > score) {
      score = s;
      best = ang;
    }
  }
  if (best == null) return { ...intent, fire: false, crouch: false, prone: true, move: null, goal: null };
  // Note: with no time to get clear a man throws himself flat, which keeps him under the worst of it.
  const prone = near.fuse < 0.6 && nd < 4;
  return { ...intent, goal: null, move: prone ? null : { x: Math.cos(best), y: Math.sin(best) }, mode: 'sprint', fire: false, steady: false, crouch: false, prone, face: best, use: null };
}

export const chargesOf = (sim) => sim.charges || [];
export const stickCount = (a) => a?.dynamite || 0;
