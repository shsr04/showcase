// Note: item 499: rewards kept by the player across campaigns, in the browser's storage; the first is dynamite, the Ironman reward.

import { DYNAMITE } from './dynamite.js';

const KEY = 'western-showdown:honours';

const store = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};
const here = () => (typeof location === 'undefined' ? '' : location.search);

function read(ls) {
  try {
    return JSON.parse(ls?.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export const hasHonour = (id, ls = store()) => !!read(ls)[id];

// Note: a won campaign that kept its Ironman status earns dynamite for good; returns true only the first time.
export function earnIronman(ended, ironman, ls = store()) {
  if (!ls || !ended || ended.outcome !== 'win' || !ironman) return false;
  const h = read(ls);
  if (h.dynamite) return false;
  h.dynamite = { at: Date.now() };
  try {
    ls.setItem(KEY, JSON.stringify(h));
  } catch {
    return false;
  }
  return true;
}

// Note: sticks the sheriff takes into a tactical scene; ?dynamite=1 in the address gives them for testing.
export function dynamiteSticks(ls = store(), search = here()) {
  if (/[?&]dynamite=1\b/.test(search || '')) return DYNAMITE.sticks;
  return hasHonour('dynamite', ls) ? DYNAMITE.sticks : 0;
}

// Note: what the page shows only once earned, such as the G row in the controls; elements carry data-honour with the reward's id.
export function showHonours(doc = typeof document === 'undefined' ? null : document, ls = store(), search = here()) {
  if (!doc || !doc.querySelectorAll) return;
  for (const el of doc.querySelectorAll('[data-honour]')) {
    const id = el.getAttribute('data-honour');
    const earned = id === 'dynamite' ? dynamiteSticks(ls, search) > 0 : hasHonour(id, ls);
    el.classList.toggle('is-hidden', !earned);
  }
}
