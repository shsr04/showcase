// Note: location-based wounds with the same rules for every role; no DOM or Phaser.

import { RADIUS, HEIGHT } from './config.js';
import { clamp, lerp, unit } from './rand.js';

// Note: a downed but living person lies low, so only low shots find them.
export const LYING_H = 0.45;
export const HEAD_R = 0.14;
// Note: lower bounds of each body band as a fraction of body height; below abdomen is the legs.
export const BANDS = { head: 0.87, chest: 0.66, abdomen: 0.5 };
// Note: lateral share of the body radius beyond which a torso hit finds the arm instead.
export const ARM_EDGE = { chest: 0.72, abdomen: 0.82 };

// Note: each region has an instant-death odds function, fatal odds, timer ranges in seconds and a bleed rate.
export const REGIONS = {
  head: { instant: (s) => clamp(0.5 + 0.4 * s, 0, 0.98), fatal: 0.6, death: [15, 60], incap: 0, bleed: 0.9, clot: [30, 60] },
  chest: { instant: (s) => 0.15 * s, fatal: 0.88, death: [20, 70], incap: [6, 18], bleed: 1, clot: [20, 40] },
  abdomen: { instant: () => 0, fatal: 0.8, death: [40, 150], incap: [12, 35], bleed: 0.8, clot: [20, 40] },
  arm: { instant: () => 0, fatal: 0.85, death: [90, 200], incap: null, bleed: 0.35, clot: [20, 40] },
  leg: { instant: () => 0, fatal: 0.9, death: [60, 180], incap: null, bleed: 0.5, clot: [25, 50] },
};

export const WOUND_TUNING = {
  refEnergy: 700,
  sevMin: 0.25,
  sevMax: 1.6,
  legCollapse: 0.35,
  legSevere: 0.6,
  mobility: { limp: 0.5, crawl: 0.15 },
  painDecay: 1.5,
};

// Note: the shock model: every torso or limb hit adds shock (load by region times the round's severity), and shock fades with time constant `tau` seconds, spoils aim, and sets the odds that the person stops fighting.
// Note: the person stops when shock outweighs resolve, which grows with nerve, and the odds follow a logistic curve of width `width`.
// Note: a stop either collapses them (physiological: they go down within `delay` seconds) or breaks their will (psychological: they cease fire for `breakTime` seconds, and only AI hostiles act on that).
export const SHOCK = {
  load: { head: 1.6, chest: 1, abdomen: 0.85, arm: 0.3, leg: 0.4 },
  resolve0: 0.4,
  resolve1: 0.6,
  width: 0.3,
  tau: 25,
  aim: 0.35,
  collapse: { chest: 0.5, abdomen: 0.65, arm: 0, leg: 0 },
  delay: [0.25, 0.6],
  breakTime: [12, 28],
  stun: 1.2,
};

const mulFor = { head: 1.4, chest: 1.25, abdomen: 1.2, arm: 1.8, leg: 1.15 };

// Note: an old injury from an earlier scene is a wound that no longer bleeds; from this severity up it takes the limb out as a fresh wound does.
export const OLD_IMPAIR = 0.3;

// Note: turns a campaign injury { region, side, severity } into a wound that capability() reads; it never bleeds, never kills and is not reported as new.
export function oldWound(inj) {
  const region = REGIONS[inj.region] ? inj.region : 'chest';
  return {
    region, side: inj.side === -1 ? -1 : inj.side === 1 ? 1 : 0, fatal: false, instant: false, bleed: 0,
    at: 0, deathAt: null, incapAt: null, clotAt: null, energy: 0, severity: clamp(inj.severity ?? 0.5, 0, 1.6), severe: false, collapsed: false, old: true,
  };
}

// Note: a revolver fired with the off hand spreads twice as wide, on top of the wound's own penalty.
export const WEAK_HAND_MUL = 2;
// Note: a reload with one arm out runs at this share of the normal speed, so it takes two and a half times as long.
export const ONE_ARM_RELOAD = 0.4;
// Note: the side of the arm that holds a one-handed weapon, as a wound side: +1 right, -1 left (the right-hand side of the facing, see hitTestActor).
export const handSide = (actor) => (actor.hand === 'left' ? -1 : 1);

const bodyHeight = (actor) => (actor.status === 'ok' ? HEIGHT[actor.stance] || HEIGHT.stand : LYING_H);

// Note: the body circle sits at the actor, the head circle at the eye, so a lean exposes only the head.
export function hitTestActor(actor, x, y, z) {
  if (actor.status === 'dead') return null;
  const H = bodyHeight(actor);
  if (z < 0 || z > H) return null;
  const f = z / H;
  if (f >= BANDS.head) {
    const eye = actor.status === 'ok' && actor.eye ? actor.eye : actor;
    return Math.hypot(x - eye.x, y - eye.y) <= HEAD_R ? { region: 'head', side: 0 } : null;
  }
  const dx = x - actor.x;
  const dy = y - actor.y;
  if (Math.hypot(dx, dy) > RADIUS) return null;
  const facing = actor.facing || 0;
  // Note: the right-hand side of the facing direction in y-down coordinates is (-sin, cos).
  const lat = dx * -Math.sin(facing) + dy * Math.cos(facing);
  const side = lat < 0 ? -1 : 1;
  if (f < BANDS.abdomen) return { region: 'leg', side };
  const chest = f >= BANDS.chest;
  if (Math.abs(lat) > RADIUS * ARM_EDGE[chest ? 'chest' : 'abdomen']) return { region: 'arm', side };
  return { region: chest ? 'chest' : 'abdomen', side: 0 };
}

const between = (rand, [lo, hi]) => lo + (hi - lo) * rand();

function causeOf(w) {
  return `${w.region} wound`;
}

function goDown(actor, status, w) {
  actor.status = status;
  actor.cause = causeOf(w);
  actor.mode = 'idle';
}

// Note: a fatal wound settled at once: the person dies of it now, with the cause the bleed-out would have given.
export function dieOfWound(actor) {
  const w = (actor.wounds || []).find((x) => x.deathAt === actor.deathAt) || { region: 'body' };
  goDown(actor, 'dead', w);
  return w;
}

// Note: the odds that this hit makes the person stop, and how; null when they fight on.
// Note: rolls are hashes of the seed, the person, the wound count and the time, so the combat stream is untouched.
function shockStop(actor, w, sev, shot, time) {
  const load = SHOCK.load[w.region] * sev;
  actor.shock = (actor.shock || 0) + load;
  w.shock = actor.shock;
  if (actor.status !== 'ok' || w.region === 'head' || (actor.broken ?? 0) > time || actor.collapseAt != null) return null;
  const nerve = actor.traits?.nerve ?? 0.5;
  const resolve = SHOCK.resolve0 + SHOCK.resolve1 * nerve;
  const p = 1 / (1 + Math.exp(-(actor.shock - resolve) / SHOCK.width));
  const tag = `${shot.seed}:shock:${actor.id}:${actor.wounds.length}:${Math.round(time * 1000)}`;
  if (unit(`${tag}:stop`) >= p) return null;
  const share = SHOCK.collapse[w.region] || 0;
  if (unit(`${tag}:kind`) < share) {
    const delay = lerp(SHOCK.delay[0], SHOCK.delay[1], unit(`${tag}:delay`));
    w.incapAt = time + delay;
    actor.incapAt = actor.incapAt == null ? w.incapAt : Math.min(actor.incapAt, w.incapAt);
    actor.collapseAt = w.incapAt;
    return { kind: 'collapse', delay, odds: p };
  }
  const until = time + lerp(SHOCK.breakTime[0], SHOCK.breakTime[1], unit(`${tag}:until`)) * (0.8 + 0.4 * Math.min(1, sev));
  actor.broken = until;
  return { kind: 'break', until, odds: p };
}

// Note: the same function resolves a hit on the sheriff, the deputy, a hostile or a civilian; shot = { range, seed } turns on the shock model; the range is only recorded, how close the shooter stood never changes the odds of a kill (SPEC item 92).
export function applyHit(actor, hit, energy, rand, time, shot = null) {
  if (actor.status === 'dead') return { wound: null, died: false, incapacitated: false, stop: null };
  actor.wounds ||= [];
  const R = REGIONS[hit.region];
  const sev = clamp(energy / WOUND_TUNING.refEnergy, WOUND_TUNING.sevMin, WOUND_TUNING.sevMax);
  const w = {
    region: hit.region, side: hit.side || 0, fatal: false, instant: false, bleed: R.bleed * sev,
    at: time, deathAt: null, incapAt: null, clotAt: null, energy, severity: sev, severe: false, collapsed: false,
  };
  const wasDown = actor.status !== 'ok';
  const pace = clamp(sev, 0.7, 1.4);

  if (rand() < R.instant(sev)) {
    w.instant = true;
    w.fatal = true;
    w.bleed = R.bleed;
    w.deathAt = time;
    actor.wounds.push(w);
    goDown(actor, 'dead', w);
    actor.deathAt = time;
    actor.pain = 1;
    actor.lastHitAt = time;
    actor.bleeding = true;
    return { wound: w, died: true, incapacitated: false, stop: null };
  }

  w.fatal = rand() < R.fatal;
  if (w.fatal) {
    w.deathAt = time + between(rand, R.death) / pace;
    if (R.incap === 0) w.incapAt = time;
    else if (R.incap) {
      w.incapAt = time + between(rand, R.incap) / pace;
      w.incapAt = Math.min(w.incapAt, w.deathAt - 0.5);
    }
  } else {
    w.clotAt = time + between(rand, R.clot);
    // Note: a head hit that does not kill still leaves the person out of the fight.
    if (R.incap === 0) w.incapAt = time;
  }
  if (hit.region === 'leg') {
    w.severe = sev > 0.9 && rand() < WOUND_TUNING.legSevere;
    if (rand() < WOUND_TUNING.legCollapse * sev) {
      w.collapsed = true;
      w.incapAt = time;
    }
  }

  actor.wounds.push(w);
  if (w.deathAt != null) actor.deathAt = actor.deathAt == null ? w.deathAt : Math.min(actor.deathAt, w.deathAt);
  if (w.incapAt != null && !wasDown) actor.incapAt = actor.incapAt == null ? w.incapAt : Math.min(actor.incapAt, w.incapAt);
  actor.pain = 1;
  actor.lastHitAt = time;
  actor.bleeding = true;

  let incapacitated = false;
  if (actor.status === 'ok' && actor.incapAt != null && actor.incapAt <= time) {
    goDown(actor, 'incapacitated', w);
    incapacitated = true;
  }
  const stop = shot && actor.status === 'ok' ? shockStop(actor, w, sev, shot, time) : null;
  return { wound: w, died: false, incapacitated, stop };
}

// Note: what the view animates for each body region.
export const REACT_KIND = { head: 'snap', chest: 'stagger', abdomen: 'stagger', arm: 'flinch', leg: 'buckle' };

// Note: dur is the whole body response, push is a tiny impulse in metres, and only the wound rules decide who falls.
// Note: freeze is the time an AI stands stunned, noFire the time the weapon is useless, and keep the share of steady aim that survives.
export function hitReaction(region, severity, { severe = false } = {}) {
  const sev = clamp(severity, WOUND_TUNING.sevMin, WOUND_TUNING.sevMax);
  const kind = REACT_KIND[region] || 'stagger';
  switch (region) {
    case 'head':
      return { kind, dur: 1.1 + 0.4 * sev, push: 0.003 + 0.008 * sev, freeze: 0.5, speed: 0.2, turn: 0.4, noFire: 0.55, keep: 0 };
    case 'chest': {
      const handling = clamp(0.35 + 0.35 * sev, 0.4, 0.9);
      return { kind, dur: 1.2 + 0.65 * sev, push: 0.004 + 0.012 * sev, freeze: 0.5 * handling, speed: 0.35, turn: 0.5, noFire: 0.3 * handling, keep: 0.4 };
    }
    case 'abdomen': {
      const handling = clamp(0.45 + 0.4 * sev, 0.5, 0.9);
      return { kind, dur: 1.4 + 0.7 * sev, push: 0.003 + 0.01 * sev, freeze: 0.55 * handling, speed: 0.2, turn: 0.4, noFire: 0.5 * handling, keep: 0.3 };
    }
    case 'arm': {
      const handling = clamp(0.25 + 0.35 * sev, 0.3, 0.8);
      return { kind, dur: 1 + 0.6 * sev, push: 0.002 + 0.006 * sev, freeze: 0.25 * handling, speed: 0.7, turn: 0.6, noFire: Math.min(1.2, sev > 1.1 ? 1.5 * handling : handling), keep: 0 };
    }
    case 'leg': {
      const handling = clamp(0.4 + 0.35 * sev + (severe ? 0.3 : 0), 0.45, 0.95);
      return { kind, dur: 1.2 + 0.6 * sev + (severe ? 0.3 : 0), push: 0.003 + 0.008 * sev, freeze: (severe ? 0.6 : 0.45) * handling, speed: 0.3, turn: 0.7, noFire: 0.3 * handling, keep: 0.6 };
    }
    default:
      return { kind, dur: 1.5, push: 0.01, freeze: 0.3, speed: 0.4, turn: 0.6, noFire: 0.3, keep: 0.5 };
  }
}

// Note: bleeding, shock and death timers; returns incapacitated and died events.
export function updateWounds(actor, dt, time, rand) {
  const events = [];
  if (actor.status === 'dead') return events;
  actor.pain = Math.max(0, (actor.pain || 0) - dt / WOUND_TUNING.painDecay);
  if (actor.shock) actor.shock = actor.shock < 0.02 ? 0 : actor.shock * Math.exp(-dt / SHOCK.tau);
  let bleeding = false;
  for (const w of actor.wounds || []) {
    if (w.bleed > 0 && w.clotAt != null && time >= w.clotAt) w.bleed = 0;
    if (w.bleed > 0) bleeding = true;
  }
  actor.bleeding = bleeding;
  if (actor.status === 'ok' && actor.incapAt != null && time >= actor.incapAt) {
    const w = (actor.wounds || []).find((x) => x.incapAt === actor.incapAt) || { region: 'body' };
    goDown(actor, 'incapacitated', w);
    events.push({ type: 'incapacitated', actorId: actor.id, cause: actor.cause, region: w.region });
  }
  if (actor.deathAt != null && time >= actor.deathAt) {
    const w = (actor.wounds || []).find((x) => x.deathAt === actor.deathAt) || { region: 'body' };
    goDown(actor, 'dead', w);
    events.push({ type: 'died', actorId: actor.id, cause: actor.cause, region: w.region });
  }
  return events;
}

export function bleedRate(actor) {
  return (actor.wounds || []).reduce((s, w) => s + (w.bleed || 0), 0);
}

export const woundRegions = (actor) => (actor.wounds || []).map((w) => w.region);

// Note: derived abilities; arms decide weapon handling, legs decide mobility, pain and wounds disturb aim.
export function capability(actor) {
  const wounds = actor.wounds || [];
  const alive = actor.status !== 'dead';
  const canAct = actor.status === 'ok';
  const arm = { '-1': true, '1': true };
  const leg = { '-1': false, '1': false };
  let severeLeg = false;
  let aimMul = 1 + 1.5 * (actor.pain || 0);
  for (const w of wounds) {
    const side = w.side === -1 ? -1 : 1;
    // Note: an old injury below OLD_IMPAIR is a stiffness; it spoils the aim a little and never takes an arm or a leg out.
    const lasting = !w.old || w.severity >= OLD_IMPAIR;
    if (lasting && w.region === 'arm') arm[side] = false;
    if (lasting && w.region === 'leg') {
      leg[side] = true;
      if (w.severe) severeLeg = true;
    }
    const mul = mulFor[w.region] || 1;
    aimMul *= w.old ? 1 + (mul - 1) * clamp(w.severity ?? 1, 0, 1) : mul;
  }
  aimMul *= 1 + SHOCK.aim * (actor.shock || 0);
  const legs = (leg['-1'] ? 1 : 0) + (leg['1'] ? 1 : 0);
  const { limp, crawl } = WOUND_TUNING.mobility;
  const mobility = legs === 0 ? 1 : legs === 2 || severeLeg ? crawl : limp;
  // Note: with the shooting arm out and the other able, a revolver goes to the weak hand.
  const weakHand = canAct && !arm[handSide(actor)] && arm[-handSide(actor)];
  if (weakHand) aimMul *= WEAK_HAND_MUL;
  return {
    weakHand,
    oneArm: canAct && !(arm['-1'] && arm['1']),
    alive,
    canAct,
    canMove: canAct && mobility > 0,
    mobility,
    rifleOk: canAct && arm['-1'] && arm['1'],
    handgunOk: canAct && (arm['-1'] || arm['1']),
    aimMul: Math.min(aimMul, 5),
  };
}
