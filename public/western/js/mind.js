// Note: a lawman's own picture of the scene: cells seen clear, believed hostiles and alertness.

import { GRID_W as MAP_W, GRID_H as MAP_H } from './config.js';
// Note: keys use the GRID stride, so a mind works on a map of any size.

// Note: a report this close to a man he saw is about him, and positions this close are one spot.
const MERGE_R = 2.5;
const SAME_SPOT = 0.4;

export function makeMind() {
  return { clear: new Map(), threats: [], alert: 0.5, alertAt: 0 };
}

const key = (f, x, y) => (f * MAP_H + y) * MAP_W + x;
// Note: the floor and cell of a key in mind.clear.
export const cellOfKey = (k) => ({ f: Math.floor(k / (MAP_W * MAP_H)), x: k % MAP_W, y: Math.floor(k / MAP_W) % MAP_H });

// Note: marks cells as seen free of hostiles at time t, and a stamp does not fade.
export function stampClear(mind, f, cells, t) {
  for (const c of cells) mind.clear.set(key(f, c.x, c.y), t);
}

export const seenClear = (mind, f, x, y) => mind.clear.has(key(f, x, y));

// Note: when the cell was last stamped, or -Infinity.
export const clearStamp = (mind, f, x, y) => mind.clear.get(key(f, x, y)) ?? -Infinity;

// Note: a hostile seen or heard near a point takes back every stamp within r of it.
export function disprove(mind, f, x, y, r) {
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(MAP_W - 1, Math.floor(x + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(MAP_H - 1, Math.floor(y + r));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= r) mind.clear.delete(key(f, cx, cy));
    }
  }
}

// Note: a sighting moves its own threat, and a report or sound merges into a threat near it.
export function observeThreat(mind, th) {
  const near = (o, r) => o.f === th.f && Math.hypot(o.x - th.x, o.y - th.y) <= r;
  let mine = th.id != null ? mind.threats.find((o) => o.id === th.id) : null;
  // Note: an unnamed report near a man he saw is that man, and other positions merge only where they coincide, so no unchecked one moves (item 443).
  if (!mine) mine = mind.threats.find((o) => (th.id == null && o.id != null ? near(o, MERGE_R) : (th.id == null || o.id == null) && near(o, SAME_SPOT)));
  if (mine) {
    if (th.id != null) mine.id = th.id;
    mine.t = th.t;
    // Note: a shot heard from the spot marks it as a man who is firing.
    if (th.shotAt != null) mine.shotAt = Math.max(mine.shotAt ?? -Infinity, th.shotAt);
    if (th.src !== 'saw' && mine.src === 'saw') {
      // Note: a report only refreshes what he saw himself.
      mine.conf = Math.max(mine.conf, th.conf);
      return mine;
    }
    mine.x = th.x;
    mine.y = th.y;
    mine.f = th.f;
    mine.conf = Math.max(th.conf, th.src === 'saw' ? th.conf : mine.conf * 0.9);
    mine.src = th.src;
    mine.coarse = th.src === 'saw' ? 0 : th.coarse ?? mine.coarse ?? 0;
    return mine;
  }
  const add = { id: th.id ?? null, x: th.x, y: th.y, f: th.f, t: th.t, conf: th.conf, src: th.src, coarse: th.coarse ?? 0, shotAt: th.shotAt ?? null };
  mind.threats.push(add);
  return add;
}

// Note: a threat that is dead or gone is dropped when its hostile is known dead.
export function dropThreat(mind, id) {
  mind.threats = mind.threats.filter((th) => th.id !== id);
}

// Note: alertness from 0 to 1 decays to 0.5 over about 20 s.
export function setAlert(mind, level, now) {
  mind.alert = Math.max(0, Math.min(1, level));
  mind.alertAt = now;
}

export function alertNow(mind, now) {
  const k = Math.min(1, Math.max(0, (now - mind.alertAt) / 20));
  return mind.alert + (0.5 - mind.alert) * k;
}
