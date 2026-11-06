// Note: browser storage for worlds; one slot per seed, plus a pointer to the current seed.

import { SAVE_KEY, DEFAULT_SEED } from './config.js';
import { World } from './world.js';

const CUR_KEY = 'garden.current';
const slot = (seed) => `${SAVE_KEY}:${seed}`;

function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

export function randomSeed() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = 'SKY-';
  for (let k = 0; k < 4; k++) s += a[(Math.random() * a.length) | 0];
  return s + '-' + String(Math.floor(Math.random() * 90) + 10);
}

export function pickSeed() {
  let url = null;
  try { url = new URLSearchParams(location.search).get('seed'); } catch (e) { url = null; }
  const clean = (s) => (s || '').trim().slice(0, 32).replace(/[^\w\- ]/g, '');
  return clean(url) || clean(get(CUR_KEY)) || DEFAULT_SEED;
}

export function loadWorld(seed) {
  set(CUR_KEY, seed);
  const raw = get(slot(seed));
  if (raw) {
    try {
      const w = World.fromJSON(JSON.parse(raw));
      if (w.seedStr === seed) return { world: w, resumed: true };
    } catch (e) { /* Note: a broken save falls through to a fresh world. */ }
  }
  return { world: World.createNew(seed), resumed: false };
}

export function saveWorld(world) {
  try { return set(slot(world.seedStr), JSON.stringify(world.toJSON())); } catch (e) { return false; }
}

export function forget(seed) {
  try { localStorage.removeItem(slot(seed)); } catch (e) { /* Note: storage may be blocked. */ }
}

export function shareUrl(seed) {
  const u = new URL(location.href);
  u.search = `?seed=${encodeURIComponent(seed)}`;
  return u.toString();
}

export function hintSeen() { return get('garden.hint') === '1'; }
export function markHint() { set('garden.hint', '1'); }
