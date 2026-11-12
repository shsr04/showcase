// Note: the aim of a quick-draw duel as pure functions of the duel's seed, the shooter's condition and the time; the sim owns every piece of state.
import { clamp, unit } from '../rand.js';

// Note: the two-ring aim lives in metres at the foe: a square of half-size half around the neutral aim; the inner ring is the mouse, the outer ring is the sight picture, and both stay inside the square.
export const RING = { centre: { lateral: 0, height: 1.25 }, half: 1, inner: 0.12, outer: 0.3 };
// Note: the sights follow the mouse with this lag in seconds for a baseline hand; after the draw they start low in the holster, and settle onto the aim.
export const FOLLOW = { lag: 0.45, holster: { lateral: 0.6, height: 0.3 } };
// Note: a standing hit throws the sights this far off, in metres at the foe, in a seeded direction; they settle again under FOLLOW.
export const THROW = 0.5;

// Note: sway is an angle in radians; kick is the unsettled share after a disturbance, floor what stays, settle the seconds of the decay, drink the growth per full intoxication.
export const SWAY = { kick: 0.04, floor: 0.003, settle: 1.2, hz: [0.83, 1.31], drink: 2, height: 0.7 };
export const COCK = { time: 0.35, disturb: 0.5 };
// Note: fanning leaves this long between shots and scatters each shot over these angles in radians.
export const FAN = { gap: 0.14, lateral: 0.1, height: 0.07 };

const TAU = Math.PI * 2;

// Note: the aim held inside the square, so that neither ring can leave the display.
export const inSquare = (p) => ({
  lateral: clamp(p.lateral, RING.centre.lateral - RING.half, RING.centre.lateral + RING.half),
  height: clamp(p.height, RING.centre.height - RING.half, RING.centre.height + RING.half),
});

// Note: the distance in metres between the centres of the two rings.
export const separation = (inner, outer) => Math.hypot(inner.lateral - outer.lateral, inner.height - outer.height);

// Note: how far a shot strays in metres: the share of the separation beyond what keeps the inner ring inside the outer one; zero when the rings are aligned.
export const missOf = (inner, outer) => Math.max(0, separation(inner, outer) + RING.inner - RING.outer);

// Note: a seeded offset of the given length in metres, in a direction of its own; the seed alone decides it.
export function scatterOf(seed, metres) {
  const a = unit(seed) * TAU;
  return { lateral: metres * Math.cos(a), height: metres * Math.sin(a) };
}

// Note: the sights move toward the aim by the share of the gap that a step covers, a first-order lag of lag seconds.
export function follow(sights, aim, dt, lag) {
  const k = 1 - Math.exp(-dt / Math.max(lag, 1e-3));
  return { lateral: sights.lateral + (aim.lateral - sights.lateral) * k, height: sights.height + (aim.height - sights.height) * k };
}

// Note: the lag of the sights for a shooter's settle rate (1 for a baseline hand); a faster hand settles sooner.
export const lagOf = (rate) => FOLLOW.lag / clamp(rate, 0.3, 3);

// Note: gain is the shooter's own aim factor (skill, fatigue and wounds, 1 for a baseline hand), rate the speed of settling (1 for a baseline hand), intoxication 0..1.
export function swayParams({ gain = 1, rate = 1, intoxication = 0 } = {}) {
  const g = clamp(gain, 0.3, 6) * (1 + SWAY.drink * clamp(intoxication, 0, 1));
  return { floor: SWAY.floor * g, kick: SWAY.kick * g, tau: SWAY.settle / clamp(rate, 0.3, 3) };
}

// Note: the sway angle at a time: the floor plus the last disturbance decaying; state is { at, kick }.
export function swayAmp(params, state, time) {
  return params.floor + state.kick * Math.exp(-Math.max(0, time - state.at) / params.tau);
}

// Note: a cock, a shot or a fresh draw adds strength (0..1) of the full kick to what is left, up to twice the kick; at is when it takes effect.
export function disturbed(params, state, strength, at) {
  const left = swayAmp(params, state, at) - params.floor;
  return { at, kick: Math.min(2 * params.kick, left + strength * params.kick) };
}

// Note: the sway as metres on the target: two slow waves of unequal pace, so the sights drift and never trace a line.
export function swayOffset(seed, time, amp, distance) {
  const [fx, fy] = SWAY.hz;
  return {
    lateral: amp * distance * Math.sin(TAU * fx * time + unit(`${seed}:x`) * TAU),
    height: amp * distance * SWAY.height * Math.sin(TAU * fy * time + unit(`${seed}:y`) * TAU),
  };
}

// Note: where a fanned shot strays to, in metres on the target; each shot has its own.
export function fanScatter(seed, shot, distance) {
  return {
    lateral: (unit(`${seed}:fan:${shot}:x`) * 2 - 1) * FAN.lateral * distance,
    height: (unit(`${seed}:fan:${shot}:y`) * 2 - 1) * FAN.height * distance,
  };
}
