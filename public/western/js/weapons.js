// Note: Winchester 1873 and Colt 1873 handling, ballistics with penetration, and reload steps; no DOM or Phaser.
// Note: fireWeapon(actor, weapon, aim, rand) returns { ok, reason, bullet, noise } with the reasons down, arms, empty and cooldown.
// Note: tickWeapon runs the lever or hammer cycle timer weapon.cool, and switchTime is the draw time.
// Note: reloading is per round and interruptible, and the sim keeps the state startReload returns, for example in actor.action.
// Note: stepReload moves rounds from actor.ammo into weapon.loaded, canFireWhileReloading is true once a round is chambered, and cancelReload keeps the rounds already loaded.
// Note: sigmaFor gives the angular error in radians (the accuracy corridor, SPEC item 183) and aimQuality its 0..1 form for the picture.
// Note: stepSettle grows or decays actor.settle and the held-direction dwell actor.hold, and disruptAim widens the corridor at once.
// Note: stepBullet(bullet, dt, world) takes world = { map, actors, rand, time, events, shaft }, and bullet.vz is metres of height per metre of travel.
// Note: a bullet changes floor only through the stairwell, the flight's treads stop it, and elsewhere it strikes the wooden floor slab.

import { MUZZLE_Z, CHEST_Z, MAP_W, FLOOR_H, STEP } from './config.js';
import { clamp, angleDiff, unit } from './rand.js';
import { MATERIALS, WS, T, cellObstacle } from './tiles.js';
import { tileAt, stateAt, setState, onRail } from './map.js';
import { hitTestActor, applyHit, capability, REACT_KIND } from './wounds.js';
import { flightCrossing } from './los.js';
import { groundAt } from './terrain-height.js';

// Note: items 361–370: the roster of firearms made or sold by September 1881; energy is muzzle energy in joules per cartridge, cycle the lever or hammer time between shots.
// Note: kind is how a gun is held (rifle: two hands, a long gun; handgun: one hand); category is what it is for the carry limits of item 367 and the stores of item 365.
// Note: weightKg slows the draw and the settle (drawTime, settleTime), rangeM sets how fast a round loses its force (dragOf), and spread is the sights' and barrel's accuracy, kept within the corridor picture's scale (AIM.scale).
export const WEAPONS = {
  winchester73: {
    id: 'winchester73', name: 'Winchester Model 1873', kind: 'rifle', ammoTypes: ['44-40'], cap: 15,
    cycle: 0.55, drawTime: 0.9, reloadFirst: 0, reloadPer: 0.9, spread: 0.011, settleTime: 1.3, speed: 400,
    energy: { '44-40': 1040 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'rifle', action: 'lever', loading: 'gate', year: 1873, weightKg: 4.1, rangeM: 150,
  },
  colt73: {
    id: 'colt73', name: 'Colt Single Action Army 1873', kind: 'handgun', ammoTypes: ['45colt', '44-40'], cap: 6,
    cycle: 0.45, drawTime: 0.6, reloadFirst: 1.6, reloadPer: 1.1, spread: 0.02, settleTime: 1.7, speed: 260,
    energy: { '45colt': 600, '44-40': 500 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'single', loading: 'gate', year: 1873, weightKg: 1.05, rangeM: 50,
  },
  schofield: {
    id: 'schofield', name: 'Smith & Wesson Schofield', kind: 'handgun', ammoTypes: ['45schofield'], cap: 6,
    cycle: 0.45, drawTime: 0.65, reloadFirst: 0.8, reloadPer: 0.6, spread: 0.021, settleTime: 1.7, speed: 225,
    energy: { '45schofield': 370 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'single', loading: 'break-top', year: 1875, weightKg: 1.13, rangeM: 45,
  },
  russian: {
    id: 'russian', name: 'Smith & Wesson No. 3 Russian', kind: 'handgun', ammoTypes: ['44russian'], cap: 6,
    cycle: 0.45, drawTime: 0.65, reloadFirst: 0.8, reloadPer: 0.6, spread: 0.019, settleTime: 1.7, speed: 235,
    energy: { '44russian': 440 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'single', loading: 'break-top', year: 1874, weightKg: 1.16, rangeM: 50,
  },
  remington75: {
    id: 'remington75', name: 'Remington Model 1875', kind: 'handgun', ammoTypes: ['44rem'], cap: 6,
    cycle: 0.5, drawTime: 0.7, reloadFirst: 1.6, reloadPer: 1.1, spread: 0.021, settleTime: 1.8, speed: 250,
    energy: { '44rem': 470 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'single', loading: 'gate', year: 1875, weightKg: 1.25, rangeM: 50,
  },
  colt78: {
    id: 'colt78', name: 'Colt Model 1878 Double Action', kind: 'handgun', ammoTypes: ['45colt', '44-40'], cap: 6,
    cycle: 0.3, drawTime: 0.6, reloadFirst: 1.6, reloadPer: 1.1, spread: 0.023, settleTime: 1.7, speed: 260,
    energy: { '45colt': 600, '44-40': 500 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'double', loading: 'gate', year: 1878, weightKg: 1.11, rangeM: 45,
  },
  lightning: {
    id: 'lightning', name: 'Colt Model 1877 Lightning', kind: 'handgun', ammoTypes: ['38colt'], cap: 6,
    cycle: 0.28, drawTime: 0.45, reloadFirst: 1.5, reloadPer: 1.0, spread: 0.025, settleTime: 1.5, speed: 235,
    energy: { '38colt': 270 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'handgun', action: 'double', loading: 'gate', year: 1877, weightKg: 0.65, rangeM: 30,
  },
  derringer: {
    id: 'derringer', name: 'Remington Double Derringer', kind: 'handgun', ammoTypes: ['41rimfire'], cap: 2,
    cycle: 0.5, drawTime: 0.45, reloadFirst: 1.0, reloadPer: 1.2, spread: 0.032, settleTime: 1.2, speed: 130,
    energy: { '41rimfire': 75 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'pocket', action: 'single', loading: 'tip-up', year: 1866, weightKg: 0.31, rangeM: 6,
  },
  newline: {
    id: 'newline', name: 'Colt New Line .32', kind: 'handgun', ammoTypes: ['32rimfire'], cap: 5,
    cycle: 0.45, drawTime: 0.45, reloadFirst: 2.5, reloadPer: 1.0, spread: 0.031, settleTime: 1.3, speed: 215,
    energy: { '32rimfire': 120 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'pocket', action: 'single', loading: 'cylinder out', year: 1873, weightKg: 0.37, rangeM: 8,
  },
  sw38: {
    id: 'sw38', name: 'Smith & Wesson .38 Single Action', kind: 'handgun', ammoTypes: ['38sw'], cap: 5,
    cycle: 0.45, drawTime: 0.5, reloadFirst: 0.8, reloadPer: 0.6, spread: 0.029, settleTime: 1.3, speed: 210,
    energy: { '38sw': 205 }, noise: 'gunshot_handgun', twoHanded: false,
    category: 'pocket', action: 'single', loading: 'break-top', year: 1877, weightKg: 0.51, rangeM: 12,
  },
  winchester73c: {
    id: 'winchester73c', name: 'Winchester Model 1873 Carbine', kind: 'rifle', ammoTypes: ['44-40'], cap: 12,
    cycle: 0.55, drawTime: 0.8, reloadFirst: 0, reloadPer: 0.9, spread: 0.013, settleTime: 1.1, speed: 380,
    energy: { '44-40': 950 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'carbine', action: 'lever', loading: 'gate', year: 1873, weightKg: 3.4, rangeM: 120,
  },
  winchester66: {
    id: 'winchester66', name: 'Winchester Model 1866 Carbine', kind: 'rifle', ammoTypes: ['44henry'], cap: 13,
    cycle: 0.55, drawTime: 0.8, reloadFirst: 0, reloadPer: 0.9, spread: 0.014, settleTime: 1.1, speed: 340,
    energy: { '44henry': 770 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'carbine', action: 'lever', loading: 'gate', year: 1866, weightKg: 3.5, rangeM: 100,
  },
  spencer: {
    id: 'spencer', name: 'Spencer Carbine', kind: 'rifle', ammoTypes: ['56-50'], cap: 7,
    cycle: 0.9, drawTime: 0.85, reloadFirst: 1.5, reloadPer: 0.8, spread: 0.014, settleTime: 1.2, speed: 365,
    energy: { '56-50': 1500 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'carbine', action: 'lever', loading: 'butt tube', year: 1865, weightKg: 3.8, rangeM: 100,
  },
  springfield73: {
    id: 'springfield73', name: 'Springfield Model 1873 Carbine', kind: 'rifle', ammoTypes: ['45-70'], cap: 1,
    cycle: 0, drawTime: 0.8, reloadFirst: 0, reloadPer: 2.2, spread: 0.01, settleTime: 1.2, speed: 350,
    energy: { '45-70': 1600 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'carbine', action: 'single shot', loading: 'trapdoor', year: 1873, weightKg: 3.2, rangeM: 200,
  },
  sharps74: {
    id: 'sharps74', name: 'Sharps Model 1874 Sporting Rifle', kind: 'rifle', ammoTypes: ['45-70', '50-70'], cap: 1,
    cycle: 0, drawTime: 1.2, reloadFirst: 0, reloadPer: 2.4, spread: 0.006, settleTime: 1.6, speed: 405,
    energy: { '45-70': 2150, '50-70': 2150 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'rifle', action: 'single shot', loading: 'falling block', year: 1874, weightKg: 5.4, rangeM: 300,
  },
  rollingblock: {
    id: 'rollingblock', name: 'Remington No. 1 Rolling Block', kind: 'rifle', ammoTypes: ['50-70', '45-70'], cap: 1,
    cycle: 0, drawTime: 1.0, reloadFirst: 0, reloadPer: 2.0, spread: 0.0075, settleTime: 1.5, speed: 395,
    energy: { '50-70': 2150, '45-70': 2150 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'rifle', action: 'single shot', loading: 'rolling block', year: 1868, weightKg: 4.3, rangeM: 250,
  },
  parker12: {
    id: 'parker12', name: 'Parker Brothers 12-gauge Hammer Double', kind: 'rifle', ammoTypes: ['12buck', '12bird'], cap: 2,
    cycle: 0.25, drawTime: 1.0, reloadFirst: 0.8, reloadPer: 0.9, spread: 0.03, settleTime: 0.9, speed: 365,
    energy: { '12buck': 235, '12bird': 12 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'shotgun', action: 'double barrel', loading: 'break-open', year: 1868, weightKg: 3.4, rangeM: 35,
  },
  colt78shotgun: {
    id: 'colt78shotgun', name: 'Colt Model 1878 10-gauge Hammer Shotgun, cut short', kind: 'rifle', ammoTypes: ['10buck'], cap: 2,
    cycle: 0.25, drawTime: 0.8, reloadFirst: 0.8, reloadPer: 0.9, spread: 0.032, settleTime: 0.8, speed: 350,
    energy: { '10buck': 215 }, noise: 'gunshot_rifle', twoHanded: true,
    category: 'shotgun', action: 'double barrel', loading: 'break-open', year: 1878, weightKg: 3.5, rangeM: 25,
  },
};

// Note: item 368: every cartridge is its own type; a cartridge shared by two models (.44-40, .45 Colt, .45-70) is one stock. misfire is the chance a round fails (item 369), higher for rimfire; pellets is the shot in a shell.
export const CARTRIDGES = {
  '45colt': { name: '.45 Colt', box: 50, priceCents: 125, misfire: 0.004 },
  '44-40': { name: '.44-40', box: 50, priceCents: 110, misfire: 0.004 },
  '45schofield': { name: '.45 Schofield', box: 50, priceCents: 120, misfire: 0.004 },
  '44russian': { name: '.44 Russian', box: 50, priceCents: 120, misfire: 0.004 },
  '44rem': { name: '.44 Remington', box: 50, priceCents: 115, misfire: 0.004 },
  '38colt': { name: '.38 Colt', box: 50, priceCents: 90, misfire: 0.004 },
  '38sw': { name: '.38 S&W', box: 50, priceCents: 85, misfire: 0.004 },
  '41rimfire': { name: '.41 rimfire', box: 50, priceCents: 50, misfire: 0.015 },
  '32rimfire': { name: '.32 rimfire', box: 50, priceCents: 40, misfire: 0.015 },
  '44henry': { name: '.44 Henry rimfire', box: 50, priceCents: 100, misfire: 0.015 },
  '56-50': { name: '.56-50 Spencer', box: 20, priceCents: 60, misfire: 0.015 },
  '45-70': { name: '.45-70', box: 20, priceCents: 70, misfire: 0.004 },
  '50-70': { name: '.50-70', box: 20, priceCents: 65, misfire: 0.004 },
  '12buck': { name: '12-gauge buckshot', box: 25, priceCents: 90, misfire: 0.006, pellets: 9 },
  '12bird': { name: '12-gauge birdshot', box: 25, priceCents: 70, misfire: 0.006, pellets: 20 },
  '10buck': { name: '10-gauge buckshot', box: 25, priceCents: 110, misfire: 0.006, pellets: 12 },
};
export const AMMO_TYPES = Object.keys(CARTRIDGES);
// Note: the two cartridges of the Prototype 2 kit, always listed and always sold; others only when held or stocked.
export const BASE_AMMO = Object.freeze(['44-40', '45colt']);

// Note: item 367: one long gun, up to two handguns and one pocket pistol on a person.
export const CARRY = Object.freeze({ long: 1, handgun: 2, pocket: 1 });
export const slotOf = (w) => (WEAPONS[w.id].kind === 'rifle' ? 'long' : WEAPONS[w.id].category === 'pocket' ? 'pocket' : 'handgun');
export const fitsSlot = (carried, w) => carried.filter((x) => slotOf(x) === slotOf(w)).length < CARRY[slotOf(w)];
// Note: item 369: seconds to clear a misfired round: thumb the hammer round again on a revolver, work the action of a long gun.
export const MISFIRE_CLEAR = { handgun: 0.6, rifle: 1.1 };

export const SUBSTEP = 0.1;
export const BULLET_MIN_ENERGY = 40;
export const BODY_ABSORB = 300;
export const MAX_RANGE = 120;
export const CEILING_Z = FLOOR_H;
export const RECOIL_KEEP = 0.55;
const DRAG = 0.004;
// Note: item 364: a round loses its force faster from a short-ranged gun; the Winchester's and the Colt's drag is the base the Prototype 1 scene was tuned on.
export const dragOf = (def) => DRAG * (def.kind === 'rifle' ? 150 : 50) / (def.rangeM || (def.kind === 'rifle' ? 150 : 50));

const MODE_MUL = { idle: 1, slow: 1.25, walk: 1.8, sprint: 3 };

// Note: the accuracy corridor (SPEC item 183), all rates and strengths in one place.
// Note: standing still, holding the aim direction and crouching each narrow it, and none is needed alone.
export const AIM = {
  // Note: an unsettled standing aim is wide (1 + wide times the weapon's spread); settled it is the spread itself.
  wide: 3.5,
  // Note: crouching settles half again as fast and leaves 30% less error at any settle and dwell; a clear help, never a requirement.
  crouchRate: 1.5,
  crouchSigma: 0.7,
  // Note: a settled, held prone aim gains further support; movement and recoil remove it.
  proneSigma: 0.28,
  // Note: the crouch share (actor.crouchK, 0..1) eases in over crouchIn seconds and out over crouchOut, so a stance flip is never a jump in the error or the picture.
  crouchIn: 0.4,
  crouchOut: 0.3,
  // Note: dwell on one direction builds over time seconds while the aim turns slower than omega rad/s and cuts the error by dirSigma at full dwell; a turn faster than sharp rad/s drops it at once, a drift in between loses it at decay per second.
  hold: { time: 1.2, omega: 0.35, sharp: 1.6, decay: 1.6, dirSigma: 0.3 },
  // Note: a turn costs settle per radian beyond the free drift (rad/s); a short flick is almost free, a swing across the room loses most of it.
  turn: { free: 0.5, loss: 0.35, smooth: 0.05 },
  // Note: a shot keeps this share of the dwell (and RECOIL_KEEP of the settle).
  fireHold: 0.4,
  // Note: the picture uses one absolute scale; its minimum is the average lawman's best supported prone rifle aim.
  scale: { min: 0.00151, max: 0.15 },
};

export function makeWeapon(id, ammoType) {
  const def = WEAPONS[id];
  if (!def) throw new Error(`unknown weapon ${id}`);
  const type = ammoType || def.ammoTypes[0];
  if (!def.ammoTypes.includes(type)) throw new Error(`${id} does not take ${type}`);
  return { id, ammoType: type, loaded: def.cap, spent: 0, cool: 0 };
}

export const weaponDef = (weapon) => WEAPONS[weapon.id];
export const muzzleEnergy = (weapon) => WEAPONS[weapon.id].energy[weapon.ammoType];
export const switchTime = (weapon) => WEAPONS[weapon.id].drawTime;
export const tickWeapon = (weapon, dt) => {
  weapon.cool = Math.max(0, (weapon.cool || 0) - dt);
};

export function proneAimFactor(actor) {
  if (actor.stance !== 'prone' || actor.mode !== 'idle' || !actor.steady) return 1;
  return 1 - (1 - AIM.proneSigma) * clamp(actor.crouchK || 0, 0, 1) * clamp(actor.settle || 0, 0, 1) * clamp(actor.hold || 0, 0, 1);
}

function gauss(rand) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Note: angular error in radians (the corridor's spread) from settle, held direction, motion, stance, lean and wounds.
export function sigmaFor(actor, weapon, opts = {}) {
  const def = WEAPONS[weapon.id];
  const mode = opts.moving === false ? 'idle' : opts.mode || actor.mode || 'idle';
  const moving = opts.moving === true && mode === 'idle' ? 'walk' : mode;
  const settle = clamp(actor.settle || 0, 0, 1);
  let sigma = def.spread * (1 + AIM.wide * (1 - settle)) * (MODE_MUL[moving] || 1);
  sigma *= 1 - (1 - AIM.crouchSigma) * clamp(actor.crouchK || 0, 0, 1);
  if (actor.lean) sigma *= 0.92;
  sigma *= 1 - AIM.hold.dirSigma * clamp(actor.hold || 0, 0, 1);
  sigma *= proneAimFactor(actor);
  // Note: actor.mods carries the lawman's skill and fatigue; a hostile has none, and a baseline lawman has factors of exactly 1.
  return sigma * capability(actor).aimMul * (actor.mods?.aim ?? 1);
}

// Note: eases the crouch share toward the stance (linear ramp, so a held stance reaches exactly 0 or 1); every actor goes through here.
export function stepCrouch(actor, dt) {
  const to = actor.stance === 'crouch' || actor.stance === 'prone' ? 1 : 0;
  const k = actor.crouchK || 0;
  const rate = dt / (to ? AIM.crouchIn : AIM.crouchOut);
  actor.crouchK = clamp(k + clamp(to - k, -rate, rate), 0, 1);
}

// Note: the corridor as 0..1 for the picture, log scaled on the absolute error: 1 at AIM.scale.min or better, 0 at max or worse, the same scale for every weapon, so a Colt always reads wider than the rifle in the same state and walking and sprinting read apart from standing unsettled.
export function aimQuality(actor, weapon) {
  const { min, max } = AIM.scale;
  const sigma = clamp(sigmaFor(actor, weapon), min, max);
  return clamp(Math.log(max / sigma) / Math.log(max / min), 0, 1);
}

// Note: a shot, a hit or a weapon change widens the corridor: the settle and the dwell both keep only this share.
export function disruptAim(actor, keep = 0, holdKeep = keep) {
  actor.settle = (actor.settle || 0) * keep;
  actor.hold = (actor.hold || 0) * holdKeep;
}

// Note: how fast the aim direction turns (smoothed over a few ticks) and the dwell on it; a sharp turn drops the dwell and costs settle in proportion to the angle, a slow drift costs nothing.
function stepDirection(actor, dt, careful, rate) {
  const f = actor.facing;
  if (typeof f !== 'number' || dt <= 0) return 0;
  const turned = Math.abs(angleDiff(actor.aimLast ?? f, f));
  actor.aimLast = f;
  const T = AIM.turn;
  const H = AIM.hold;
  const omega = (actor.omega || 0) + (turned / dt - (actor.omega || 0)) * Math.min(1, dt / T.smooth);
  actor.omega = omega;
  let hold = actor.hold || 0;
  if (careful && omega <= H.omega) hold += (dt / H.time) * rate;
  else if (omega > H.sharp) hold = 0;
  else hold -= H.decay * dt;
  actor.hold = clamp(hold, 0, 1);
  return Math.max(0, turned - T.free * dt) * T.loss;
}

// Note: steady aim settles over the weapon's settle time; walking, sprinting, pain and sharp turns undo it.
export function stepSettle(actor, weapon, dt, { steady = false, mode = actor.mode } = {}) {
  const def = WEAPONS[weapon.id];
  stepCrouch(actor, dt);
  let s = actor.settle || 0;
  const still = mode !== 'walk' && mode !== 'sprint';
  s -= stepDirection(actor, dt, steady && still, mode === 'slow' ? 0.5 : 1);
  if (mode === 'sprint') s -= 4 * dt;
  else if (mode === 'walk') s -= 1.5 * dt;
  else if (steady) {
    let rate = 1 / def.settleTime;
    if (mode === 'slow') rate *= 0.5;
    rate *= 1 + (AIM.crouchRate - 1) * clamp(actor.crouchK || 0, 0, 1);
    if ((actor.pain || 0) > 0.3) rate *= 0.4;
    rate *= actor.mods?.settle ?? 1;
    // Note: an aim that keeps turning does not settle: the rate fades out as the turn speed climbs from the free drift to a sharp turn.
    rate *= 1 - clamp(((actor.omega || 0) - AIM.turn.free) / (AIM.hold.sharp - AIM.turn.free), 0, 1);
    s += rate * dt;
  } else s -= 0.8 * dt;
  actor.settle = clamp(s, 0, 1);
}

export function canFireWeapon(actor, weapon) {
  const cap = capability(actor);
  if (!cap.canAct) return { ok: false, reason: 'down' };
  const def = WEAPONS[weapon.id];
  if (def.kind === 'rifle' ? !cap.rifleOk : !cap.handgunOk) return { ok: false, reason: 'arms' };
  if (weapon.fault) return { ok: false, reason: 'fault' };
  if (weapon.loaded <= 0) return { ok: false, reason: 'empty' };
  if ((weapon.cool || 0) > 0) return { ok: false, reason: 'cooldown' };
  return { ok: true, reason: null };
}

export function makeBullet(fields) {
  return {
    x: 0, y: 0, floor: 0, z: 1.25, vz: 0, angle: 0, speed: 300, energy: 600, owner: -1, weaponId: 'colt73',
    age: 0, dead: false, travel: 0, hits: [], _ob: null, ...fields, px: fields.x ?? 0, py: fields.y ?? 0,
  };
}

// Note: the shot leaves the eye position (so a lean peeks the muzzle out) and reaches aim.z at aim.dist.
export function spawnBullet(actor, weapon, aim, rand) {
  const def = WEAPONS[weapon.id];
  const origin = actor.eye || actor;
  const z0 = MUZZLE_Z[actor.stance] ?? MUZZLE_Z.stand;
  const dist = Math.max(aim.dist ?? 10, 1);
  const aimZ = aim.z ?? CHEST_Z.stand;
  // Note: an exact aim is the line the shooter chose, so it takes no spread; the random draw is still made so the seeded stream stays the same.
  const sigma = aim.exact ? 0 : sigmaFor(actor, weapon, { mode: actor.mode, moving: (actor.mode || 'idle') !== 'idle' });
  return makeBullet({
    x: origin.x, y: origin.y, floor: actor.floor, z: z0,
    vz: (aimZ - z0) / dist + gauss(rand) * sigma,
    angle: aim.angle + gauss(rand) * sigma,
    speed: def.speed, energy: muzzleEnergy(weapon), owner: actor.id, weaponId: weapon.id, drag: dragOf(def),
  });
}

// Note: item 369: whether the next round fails, from a hash of the scene (actor.salt), the shooter and the gun's own count of rounds, so no random stream moves.
export const misfires = (actor, weapon) => unit(`misfire:${actor.salt ?? ''}:${actor.id}:${weapon.id}:${weapon.fired || 0}`) < (CARTRIDGES[weapon.ammoType]?.misfire || 0);

// Note: consumes a round and starts the cycle timer; the sim plays the click when the reason is empty.
// Note: a misfire spends the round and costs the time to clear it (reason misfire); a shell of shot gives several pellets (bullets), each with the barrel's spread.
export function fireWeapon(actor, weapon, aim, rand) {
  const can = canFireWeapon(actor, weapon);
  if (!can.ok) return { ok: false, reason: can.reason, bullet: null, noise: null };
  const def = WEAPONS[weapon.id];
  const dud = misfires(actor, weapon);
  weapon.fired = (weapon.fired || 0) + 1;
  weapon.loaded--;
  if (def.kind === 'handgun') weapon.spent++;
  if (dud) {
    if (aim.manualMisfire) { weapon.fault = MISFIRE_CLEAR[def.kind]; weapon.cool = def.cycle; }
    else weapon.cool = Math.max(def.cycle, MISFIRE_CLEAR[def.kind]);
    return { ok: false, reason: 'misfire', bullet: null, noise: null };
  }
  const bullet = spawnBullet(actor, weapon, aim, rand);
  const pellets = CARTRIDGES[weapon.ammoType]?.pellets || 1;
  const bullets = [bullet];
  for (let i = 1; i < pellets; i++) {
    const b = spawnBullet(actor, weapon, aim, rand);
    b.angle += gauss(rand) * def.spread;
    bullets.push(b);
  }
  weapon.cool = def.cycle;
  disruptAim(actor, RECOIL_KEEP, AIM.fireHold);
  return { ok: true, reason: null, bullet, bullets, noise: def.noise };
}

export const canFireWhileReloading = (weapon) => weapon.loaded > 0;

export function startReload(actor, weapon) {
  const def = WEAPONS[weapon.id];
  const reserve = actor.ammo?.[weapon.ammoType] || 0;
  if (reserve <= 0 || weapon.loaded + weapon.spent >= def.cap && weapon.spent === 0) return null;
  const eject = weapon.spent > 0;
  return { phase: eject ? 'eject' : 'load', t: 0, dur: eject ? def.reloadFirst : def.reloadPer, cancelled: false };
}

export function cancelReload(state) {
  if (state) state.cancelled = true;
  return state;
}

export function stepReload(actor, weapon, state, dt) {
  const def = WEAPONS[weapon.id];
  const stages = [];
  let done = false;
  if (state.cancelled) return { done: true, stages };
  state.t += dt;
  while (!done && state.t >= state.dur) {
    state.t -= state.dur;
    if (state.phase === 'eject') {
      weapon.spent = 0;
      stages.push('eject');
      state.phase = 'load';
      state.dur = def.reloadPer;
      continue;
    }
    if ((actor.ammo[weapon.ammoType] || 0) > 0 && weapon.loaded + weapon.spent < def.cap) {
      weapon.loaded++;
      actor.ammo[weapon.ammoType]--;
      stages.push('round');
    }
    if ((actor.ammo[weapon.ammoType] || 0) <= 0 || weapon.loaded + weapon.spent >= def.cap) done = true;
  }
  return { done, stages };
}

function closeObstacle(b, world, stopped) {
  if (!b._ob) return;
  world.events.push({ type: 'impact', x: b.x, y: b.y, floor: b.floor, material: b._ob.mat, stopped });
  b._ob = null;
}

// Note: a round advances in n equal steps of h metres (at most SUBSTEP) per tick; the exposure probe takes the same steps, so it samples the points the bullet does.
export function bulletSteps(speed, dt = STEP) {
  const total = speed * dt;
  const n = Math.max(1, Math.ceil(total / SUBSTEP));
  return { n, h: total / n };
}

// Note: true when the slab under floor `slab` is solid where the path from `from` to (x, y, absoluteZ) crosses its plane; only a stairwell cut in that slab or open ground outside the storey lets it by.
function slabBlocks(map, shaft, from, x, y, absoluteZ, slab = 1) {
  const fraction = (slab * FLOOR_H - from.z) / (absoluteZ - from.z);
  const cx = Math.floor(from.x + (x - from.x) * fraction);
  const cy = Math.floor(from.y + (y - from.y) * fraction);
  return !shaft?.has(cx, cy, slab) && tileAt(map, slab, cx, cy) !== T.DROP;
}

// Note: a plank (the flight or the floor slab) costs the round its thickness in energy; true when that stops it.
function hitPlank(b, world, x, y) {
  b.energy -= MATERIALS.plank.cost * MATERIALS.plank.thick;
  const stopped = b.energy < BULLET_MIN_ENERGY;
  world.events.push({ type: 'impact', x, y, floor: b.floor, material: 'plank', stopped });
  if (stopped) b.dead = true;
  return stopped;
}

// Note: probes the swept projectile geometry of the shooter's current weapon without changing the map, consuming randomness or penetrating cover; a target is exposed only if the unperturbed shot reaches its body first.
export function clearShotToActor(map, shaft, shooter, target, point, angle = Math.atan2(point.y - (shooter.eye || shooter).y, point.x - (shooter.eye || shooter).x)) {
  const origin = shooter.eye || shooter;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const d = (point.x - origin.x) * dx + (point.y - origin.y) * dy;
  if (d < 1e-9) return false;
  // Note: items 485, 497: on outdoor relief the probe runs in absolute heights over the ground, so a crest between shooter and target stops it.
  const relief = !!map.relief;
  const gs = relief ? groundAt(map, shooter.x, shooter.y) : 0;
  const gt = relief ? groundAt(map, target.x, target.y) : 0;
  const z0 = (MUZZLE_Z[shooter.stance] ?? MUZZLE_Z.stand) + (shooter.elev || 0) + gs;
  const z1 = point.z + (target.floor - shooter.floor) * FLOOR_H + (target.elev || 0) + gt;
  const { h } = bulletSteps(WEAPONS[shooter.weapons[shooter.cur].id].speed);
  const n = Math.ceil((d + 0.3) / h);
  let previousFloor = shooter.floor;
  let previous = { x: origin.x, y: origin.y, z: shooter.floor * FLOOR_H + z0 };
  for (let i = 1; i <= n; i++) {
    const along = i * h;
    const x = origin.x + dx * along, y = origin.y + dy * along;
    let z = z0 + (z1 - z0) * along / d;
    if (relief) {
      const g = groundAt(map, x, y);
      if (z < g) return false;
      const cx = Math.floor(x), cy = Math.floor(y);
      if (cellObstacle(tileAt(map, 0, cx, cy), stateAt(map, 0, cx, cy), z - g)) return false;
      if (hitTestActor(target, x, y, z - gt - (target.elev || 0))) return true;
      continue;
    }
    const absoluteZ = shooter.floor * FLOOR_H + z;
    if (flightCrossing(shaft, previous.x, previous.y, previous.z, x, y, absoluteZ) !== null) return false;
    let floor = shooter.floor;
    if (z < 0 || z > CEILING_Z) {
      floor += z < 0 ? -1 : 1;
      z += z < 0 ? CEILING_Z : -CEILING_Z;
      if (floor < 0 || floor > map.floors.length - 1) return false;
    }
    if (floor !== previousFloor && slabBlocks(map, shaft, previous, x, y, absoluteZ, Math.max(floor, previousFloor))) return false;
    previous = { x, y, z: absoluteZ };
    previousFloor = floor;
    const cx = Math.floor(x), cy = Math.floor(y);
    const tile = tileAt(map, floor, cx, cy);
    const mat = tile === T.RAIL && !onRail(map, floor, x, y) ? null : cellObstacle(tile, stateAt(map, floor, cx, cy), z);
    if (mat) return false;
    if ((target.floor === floor || target.elev) && hitTestActor(target, x, y, z + (floor - target.floor) * FLOOR_H - (target.elev || 0))) return true;
  }
  return false;
}

// Note: swept in equal steps of at most SUBSTEP metres so a fast round cannot skip a wall or a person.
export function stepBullet(b, dt, world) {
  if (b.dead) return;
  b.px = b.x;
  b.py = b.y;
  const { n, h } = bulletSteps(b.speed, dt);
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  for (let i = 0; i < n && !b.dead; i++) {
    const previous = { x: b.x, y: b.y, z: b.floor * FLOOR_H + b.z };
    b.x += cos * h;
    b.y += sin * h;
    b.z += b.vz * h;
    b.travel += h;
    b.energy *= Math.exp(-(b.drag ?? DRAG) * h);
    // Note: item 485: on outdoor relief b.z is absolute, the round strikes the ground where it dips under it, and there is no upper floor to pass into.
    const ground = world.map.relief ? groundAt(world.map, b.x, b.y) : null;
    if (ground !== null && b.z < ground) {
      closeObstacle(b, world, true);
      world.events.push({ type: 'impact', x: b.x, y: b.y, floor: b.floor, material: 'ground', stopped: true });
      b.dead = true;
      break;
    }
    const flightHit = flightCrossing(world.shaft, previous.x, previous.y, previous.z, b.x, b.y, b.floor * FLOOR_H + b.z);
    if (flightHit !== null) {
      closeObstacle(b, world, false);
      if (hitPlank(b, world, previous.x + (b.x - previous.x) * flightHit, previous.y + (b.y - previous.y) * flightHit)) break;
    }
    const top = ground !== null ? b.floor : world.map.floors.length - 1;
    const slab = (b.z < 0 && b.floor > 0 && slabBlocks(world.map, world.shaft, previous, b.x, b.y, b.floor * FLOOR_H + b.z, b.floor)) ||
      (b.z > CEILING_Z && b.floor < top && slabBlocks(world.map, world.shaft, previous, b.x, b.y, b.floor * FLOOR_H + b.z, b.floor + 1));
    if (ground !== null) {
      // Note: the open sky above relief has no slab and no ceiling.
    } else if (b.z < 0) {
      if (b.floor > 0) {
        closeObstacle(b, world, false);
        if (slab && hitPlank(b, world, b.x, b.y)) break;
        b.floor -= 1;
        b.z += CEILING_Z;
      } else {
        closeObstacle(b, world, true);
        world.events.push({ type: 'impact', x: b.x, y: b.y, floor: b.floor, material: 'ground', stopped: true });
        b.dead = true;
        break;
      }
    } else if (b.z > CEILING_Z) {
      if (b.floor < top) {
        closeObstacle(b, world, false);
        if (slab && hitPlank(b, world, b.x, b.y)) break;
        b.floor += 1;
        b.z -= CEILING_Z;
      } else {
        closeObstacle(b, world, true);
        if (tileAt(world.map, b.floor, Math.floor(b.x), Math.floor(b.y)) !== T.DROP) world.events.push({ type: 'impact', x: b.x, y: b.y, floor: b.floor, material: 'plank', stopped: true });
        b.dead = true;
        break;
      }
    }
    const cx = Math.floor(b.x);
    const cy = Math.floor(b.y);
    const tile = tileAt(world.map, b.floor, cx, cy);
    const state = stateAt(world.map, b.floor, cx, cy);
    // Note: a rail stops a round only where its strip stands, not in the open floor beside it.
    const mat = tile === T.RAIL && !onRail(world.map, b.floor, b.x, b.y) ? null : cellObstacle(tile, state, b.z - (ground ?? 0));
    if (mat) {
      const key = cy * world.map.W + cx;
      if (!b._ob || b._ob.key !== key || b._ob.mat !== mat) {
        closeObstacle(b, world, false);
        b._ob = { key, mat, path: 0 };
        if (mat === 'glass' && tile === T.WINDOW) {
          setState(world.map, b.floor, cx, cy, WS.BROKEN);
          world.events.push({ type: 'glass', x: b.x, y: b.y, floor: b.floor });
        }
      }
      const m = MATERIALS[mat];
      b.energy -= m.cost * Math.min(h, Math.max(0, m.thick - b._ob.path));
      b._ob.path += h;
      if (b.energy < BULLET_MIN_ENERGY) {
        closeObstacle(b, world, true);
        b.dead = true;
        break;
      }
    } else if (b._ob) closeObstacle(b, world, false);
    for (const a of world.actors) {
      if ((a.id === b.owner && !b.frag) || a.status === 'dead' || a.withdrawn || b.hits.includes(a.id)) continue;
      // Note: only someone on the stairs (elev set) straddles two floors; the bullet height is shifted into that actor's frame.
      const elev = (a.elev || 0) + (ground === null ? 0 : groundAt(world.map, a.x, a.y));
      if (a.floor !== b.floor && !a.elev) continue;
      const hit = hitTestActor(a, b.x, b.y, b.z + (b.floor - a.floor) * CEILING_Z - elev);
      if (!hit) continue;
      b.hits.push(a.id);
      // Note: the range is how far this round has flown; it is recorded on the hit, and closeness gives no lethality bonus (SPEC item 92): a close shot is only likelier to land where it was aimed.
      const r = applyHit(a, hit, b.energy, world.rand, world.time, { range: b.travel, seed: world.seed });
      world.events.push({
        type: 'hit', actorId: a.id, ownerId: b.owner, region: hit.region, side: hit.side, died: r.died,
        incapacitated: r.incapacitated, fatal: !!(r.wound && r.wound.fatal), stop: r.stop, range: b.travel, x: b.x, y: b.y, floor: b.floor,
        dir: b.angle, energy: b.energy, severity: r.wound ? r.wound.severity : 0, severe: !!(r.wound && r.wound.severe), kind: REACT_KIND[hit.region],
      });
      b.energy -= BODY_ABSORB;
      if (b.energy < BULLET_MIN_ENERGY) {
        b.dead = true;
        break;
      }
    }
    // Record a passing round once per person after it has gone by their centre.
    b.near ??= [];
    for (const a of world.actors) {
      if ((a.id === b.owner && !b.frag) || a.status !== 'ok' || a.withdrawn || a.floor !== b.floor || b.hits.includes(a.id) || b.near.includes(a.id)) continue;
      const along = (a.x - b.x) * cos + (a.y - b.y) * sin;
      const across = Math.abs((a.x - b.x) * sin - (a.y - b.y) * cos);
      const z = b.z - (a.elev || 0) - (ground === null ? 0 : groundAt(world.map, a.x, a.y));
      if (along <= 0 && along >= -h && across < 1.1 && z >= 0 && z <= 2) {
        b.near.push(a.id);
        world.events.push({ type: 'nearMiss', actorId: a.id, ownerId: b.owner, angle: b.angle });
      }
    }
  }
  b.age += dt;
  if (b.travel > MAX_RANGE) b.dead = true;
}

