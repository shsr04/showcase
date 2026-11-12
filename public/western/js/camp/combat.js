// Note: what every shooting or fighting scene does to a person afterwards: tiredness and a serious wound for a man put out.
import { clamp } from './base.js';
import { FIGHT_FATIGUE } from './state.js';
import { wearOf } from './progress.js';

// Note: the tiredness any fight costs at once, before the per-minute part.
export const FIGHT_TIRE = 0.03;
// Note: the worst wound of a man put out of the fight is at least this severe.
const SERIOUS = 0.6;

export function tireAfterFight(person, minutes) {
  person.fatigue = clamp(person.fatigue + (FIGHT_TIRE + FIGHT_FATIGUE * minutes / 60) * wearOf(person), 0, 1);
}

export function ensureSeriousWound(wounds) {
  if (!wounds.length) wounds.push({ region: 'chest', side: 0, severity: SERIOUS });
  const worst = wounds.reduce((a, b) => b.severity > a.severity ? b : a);
  worst.severity = Math.max(worst.severity, SERIOUS);
  return wounds;
}
