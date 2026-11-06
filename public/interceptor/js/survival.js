// Note: clock, daylight, water upkeep, wounds, trail heat and faction standing; pure state rules.

import { START_HOUR, HOUR_SECONDS, WOUND_MAX } from './config.js';
import { clamp } from './rand.js';

export const hourOf = (time) => (START_HOUR + time / HOUR_SECONDS) % 24;
export const dayOf = (time) => 1 + Math.floor((START_HOUR + time / HOUR_SECONDS) / 24);

export function clockText(time) {
  const h = hourOf(time);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Note: 0 by day, up to 0.88 deep at night, with dusk 18:30-21:00 and dawn 04:30-07:00.
export function darkness(time) {
  const h = hourOf(time);
  const MAX = 0.88;
  if (h >= 7 && h < 18.5) return 0;
  if (h >= 18.5 && h < 21) return ((h - 18.5) / 2.5) * MAX;
  if (h >= 4.5 && h < 7) return (1 - (h - 4.5) / 2.5) * MAX;
  return MAX;
}

export const isNight = (time) => darkness(time) > 0.45;

const UPKEEP_HOUR = 6;
const THIRST_WOUND_SECONDS = 6 * HOUR_SECONDS;

// Note: env.takeWater(n) -> bool; returns events for the game to voice.
export function stepSurvival(S, dt, env) {
  const events = [];
  const before = S.time;
  S.time += dt;
  const crossed = Math.floor((START_HOUR - UPKEEP_HOUR + S.time / HOUR_SECONDS) / 24) > Math.floor((START_HOUR - UPKEEP_HOUR + before / HOUR_SECONDS) / 24);
  S.day = dayOf(S.time);
  if (crossed) {
    if (env.takeWater(1)) {
      events.push({ kind: 'ration' });
    } else if (!S.thirst) {
      S.thirst = true;
      S.thirstClock = 0;
      events.push({ kind: 'thirst' });
    }
  }
  if (S.thirst) {
    S.thirstClock += dt;
    if (S.thirstClock >= THIRST_WOUND_SECONDS) {
      S.thirstClock = 0;
      if (addWound(S, 1, 'thirst')) events.push({ kind: 'death', cause: 'thirst' });
      else events.push({ kind: 'thirst-wound' });
    }
  }
  return events;
}

// Note: one unit clears thirst first, else closes one wound.
export function drink(S, takeWater) {
  if (!S.thirst && S.wounds <= 0) return 'full';
  if (!takeWater(1)) return 'empty';
  if (S.thirst) {
    S.thirst = false;
    S.thirstClock = 0;
    return 'thirst';
  }
  S.wounds = Math.max(0, S.wounds - 1);
  return 'heal';
}

export function addWound(S, n, cause) {
  S.wounds = clamp(S.wounds + n, 0, WOUND_MAX);
  S.lastWound = cause;
  return S.wounds >= WOUND_MAX;
}

export const isDead = (S) => S.wounds >= WOUND_MAX;

// Note: ctx = {copCar, moving, backRoad, night, lights, seenBy, idle}; heat is the hunter's trail.
export function stepHeat(S, dt, ctx) {
  let d = -0.006;
  if (ctx.copCar && ctx.seenBy > 0) d += 0.35 * Math.min(1, ctx.seenBy);
  if (!ctx.copCar && ctx.inCar) d -= 0.03;
  if (ctx.backRoad && ctx.moving) d -= 0.05;
  if (ctx.night && ctx.moving && !ctx.lights) d -= 0.06;
  if (ctx.night && ctx.lights) d += 0.015;
  if (ctx.idle > 60) d += 0.04;
  // Note: nobody watches the road in a downpour.
  if (ctx.rain > 0.3 && ctx.moving) d -= 0.03 * ctx.rain;
  S.heat = clamp(S.heat + d * dt, 0, 100);
}

export function bumpHeat(S, n) {
  S.heat = clamp(S.heat + n, 0, 100);
}

export const HUNTER_STAGES = [
  [75, 'standoff'],
  [55, 'sighting'],
  [30, 'rumor'],
  [0, 'none'],
];

export function hunterStage(heat) {
  for (const [min, name] of HUNTER_STAGES) if (heat >= min) return name;
  return 'none';
}

export function standingOf(S, faction) {
  return S.standing[faction] ?? 0;
}

export function adjustStanding(S, faction, delta) {
  if (!(faction in S.standing)) return;
  S.standing[faction] = clamp(S.standing[faction] + delta, -100, 100);
}

// Note: garages refuse couriers their owners hate.
export const refuses = (S, faction) => standingOf(S, faction) < -30 || (faction === 'brigade' && S.flags.brigadeWar);
