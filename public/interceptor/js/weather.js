// Note: rain by the clock; each 4-hour block rolls once per seed and act, and the road gets drier the farther west.

import { HOUR_SECONDS } from './config.js';
import { hash3, u01, seedFromString } from './rand.js';

const BLOCK_H = 4;
const RAMP_H = 0.5;
export const RAIN_CHANCE = { 1: 0.3, 2: 0.3, 3: 0.18, 4: 0.08, 5: 0.06 };

// Note: 0 is dry, 1 is a downpour; showers build and fade over half an hour unless the next block is wet too.
export function rainAt(seedStr, act, time) {
  const seed = seedFromString(`${seedStr}:rain`);
  const h = Math.max(0, time) / HOUR_SECONDS;
  const b = Math.floor(h / BLOCK_H);
  const wet = (k) => k >= 0 && u01(hash3(seed, act, k)) < (RAIN_CHANCE[act] ?? 0.1);
  if (!wet(b)) return 0;
  const into = h - b * BLOCK_H;
  const up = wet(b - 1) ? 1 : Math.min(1, into / RAMP_H);
  const down = wet(b + 1) ? 1 : Math.min(1, (BLOCK_H - into) / RAMP_H);
  const strength = 0.55 + 0.45 * u01(hash3(seed + 1, act, b));
  return Math.min(up, down) * strength;
}
