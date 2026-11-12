// Note: the storyboard panels as pixel art (items 312, 374, 378–392): every setting is a place built in metres and filmed through a camera at 320 by 180 art pixels; the settings live in one module per kind of place.

import { rng, seedFromString } from '../rand.js';
import { Px, rotated, dith } from './pixel-art.js';
import { C } from '../palette.js';
import { mapTex } from './pixel-office-kit.js';
import { PW, PH } from './pixel-kit.js';
import { OFFICE } from './panels-office.js';
import { STREET } from './panels-street.js';
import { SALOON } from './panels-saloon.js';
import { GRAVES } from './panels-graves.js';
import { MAP_AT } from './lead-map.js';

export { PW, PH };

const SETTINGS = { ...OFFICE, ...STREET, ...SALOON, ...GRAVES };


// Note: item 395, the lead: the map fragment with its ringed place, placed in the source scene's own space.
SETTINGS.leadmap = (px, o, r) => {
  const [x0, y0, w, h, tilt] = MAP_AT[o.source] || MAP_AT.plain;
  (SETTINGS[o.source] || SETTINGS.plain)(px, o, r);
  const tex = mapTex(w, h, o.place || '', { px: 0.55, py: 0.45, ring: !!o.place, seed: 9 });
  const L = new Px(PW, PH);
  for (let y = 0; y < h + 6; y++) for (let x = 0; x < w + 6; x++) if (dith(x, y, 0.7)) L.set(x0 + x - 3, y0 + y - 3, C.VOID);
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) L.set(x0 + x, y0 + y, y < 0 || x < 0 || y === h || x === w ? C.DARK : tex.get(x, y));
  px.over(rotated(L, x0 + w / 2, y0 + h / 2, tilt));
};

export const PIXEL_SETTINGS = Object.keys(SETTINGS);

// Note: paints one panel at one canvas pixel per art pixel; the frame scales it up with crisp pixels. An unknown setting paints the plain backdrop, or black until there is one.
export function paintPixelPanel(ctx, setting, o = {}) {
  const px = new Px(PW, PH);
  const r = rng(seedFromString(`panel:${setting}:${o.seed || ''}`));
  const paint = SETTINGS[setting] || SETTINGS.plain;
  if (paint) paint(px, o, r);
  // Note: the dime-novel edge: corners darkened by dither.
  px.shift(0, 0, PW, PH, -1, (x, y) => Math.max(0, Math.hypot((x - PW / 2) / (PW / 2), (y - PH / 2) / (PH / 2)) - 0.95) * 2.2);
  px.paint(ctx);
  return px;
}
