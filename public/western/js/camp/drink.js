// Note: drink and its hangover (items 346, 349–351), the same for every character; pure, no DOM, and nothing is drawn from the campaign's dice.

import { clamp, unit } from '../rand.js';

// Note: implementation parameters: a glass's share of being blind drunk, how fast it wears off per hour, the peak that leaves a hangover and how long one lasts.
export const DRINK = Object.freeze({
  glass: 0.16,
  perHour: 0.07,
  hangoverFrom: 0.3,
  hangoverHours: 4,
  heavyShare: 0.2,
});

export const levelOf = (c) => clamp((c && c.drink) || 0, 0, 1);
export const hangoverOf = (c) => clamp((c && c.hangover) || 0, 0, 1);

// Note: item 351: some people are heavy drinkers by temperament, fixed by the campaign and their name.
export const heavyDrinker = (seed, name) => unit(`heavy:${seed}:${name}`) < DRINK.heavyShare;

// Note: glasses drunk raise the level, and the peak is kept for the hangover it will leave.
export function drinkUp(c, glasses = 1) {
  c.drink = clamp(levelOf(c) + DRINK.glass * glasses, 0, 1);
  c.drinkPeak = Math.max(c.drinkPeak || 0, c.drink);
}

// Note: hours pass: drink wears off; once sober, a night's heavy drinking leaves a hangover that fades in its turn.
// Note: min is the campaign minute at the end of the span; a hangover holds at full strength until the next morning's MORNING_HOUR, then fades over hangoverHours.
export function soberUp(c, hours, min = 0) {
  if (levelOf(c) > 0) {
    c.drink = Math.max(0, levelOf(c) - DRINK.perHour * hours);
    if (c.drink === 0 && (c.drinkPeak || 0) >= DRINK.hangoverFrom) {
      c.hangover = clamp(c.drinkPeak * 1.6, 0.25, 1);
      c.hangoverUntil = nextMorning(min);
    }
    if (c.drink === 0) c.drinkPeak = 0;
    return;
  }
  if (hangoverOf(c) > 0 && min >= (c.hangoverUntil || 0)) c.hangover = Math.max(0, hangoverOf(c) - hours / DRINK.hangoverHours);
}

// Note: the hour of the morning a hangover is felt until (item 346: the next morning).
export const MORNING_HOUR = 10;
// Note: campaign minute 0 is 06:00, so the clock runs START_MIN ahead of the campaign's minutes.
const START_MIN = 6 * 60;
const nextMorning = (min) => {
  const clock = min + START_MIN;
  const today = Math.floor(clock / 1440) * 1440 + MORNING_HOUR * 60;
  return (clock < today ? today : today + 1440) - START_MIN;
};

// Note: item 349: the word a campaign screen shows beside wounds and fatigue, or null when sober and clear-headed.
export function drinkWord(c) {
  const d = levelOf(c);
  if (d >= 0.5) return 'drunk';
  if (d >= 0.15) return 'tipsy';
  if (hangoverOf(c) >= 0.1) return 'hungover';
  return null;
}

// Note: item 346: what drink does, growing with the amount: more sway, slower reactions and draw, unsteady feet, less pain but a weaker guard, a bolder threat and a worse explanation; a hangover slows.
export function drinkEffects(c) {
  const d = levelOf(c);
  const h = hangoverOf(c);
  return {
    sway: d,
    hangover: h,
    slow: 1 + 0.6 * d + 0.35 * h,
    unsteady: d,
    pain: 1 - 0.4 * d,
    // Note: guard is how much more often a drinker is hit for his weaker guard.
    guard: 0.18 * d,
    intimidate: 0.15 * d,
    explain: -0.2 * d,
    // Note: how much wider a drinker's aim wanders in a gunfight.
    aim: 1 + 0.8 * d,
  };
}

// Note: item 346: the swing, in radians, a drinker's walk takes off its line at a moment; rate makes each scene's rhythm its own.
export const lurch = (unsteady, time, rate) => Math.sin(time * rate) * 0.65 * unsteady;

// Note: item 350: glasses a teammate drinks on a saloon visit, by habit and temperament; a hash, so the campaign's dice are untouched.
export function glassesOnVisit(seed, c, min) {
  const r = unit(`visit-drink:${seed}:${c.id}:${min}`);
  const base = c.heavy ? 2 : 0;
  const bold = c.skill && c.skill.toughness > 0.55 ? 1 : 0;
  return base + bold + Math.floor(r * 3);
}
