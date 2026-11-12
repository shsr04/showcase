// Note: item 492: an ordinary wanted target's surrender: whether he offers it, the player's acceptance and securing, and the deputies' fallback; no DOM or Phaser.

import { clamp, dist } from './rand.js';

// Note: how far the sheriff can be from a surrendering man and still accept him by aiming at him and pressing the use key.
export const ACCEPT_RANGE = 10;
// Note: how close the sheriff must stand to tie a man's hands, and how far he may drift before it stops.
export const SECURE_REACH = 1.2;
export const SECURE_BREAK = 1.6;
// Note: seconds it takes to tie a surrendered man's hands.
export const SECURE_TIME = 2.2;
// Note: seconds between a waiting man's calls that he gives up.
const PLEA_EVERY = 6;
// Note: seconds the deputies wait before they secure a man who gave up when the sheriff cannot.
const FALLBACK_DELAY = 3;
// Note: how long an accepted man waits for a sheriff who does not come before a deputy ties him.
export const SHERIFF_FALLBACK = 20;
const PLEAS = ["I give up! Don't shoot!", 'I quit! Hands up, see?', "Don't shoot! I'm done!"];
const EXP_ODDS = { green: 0.12, seasoned: 0, veteran: -0.15 };

// Note: a man still in the fight: up, not withdrawn and not given up.
const fighting = (h) => h.status === 'ok' && !h.surrendered;

// Note: an armed man has a loaded gun or the rounds to load one.
const armed = (v) => v.weapons.some((w) => w.loaded > 0) || Object.values(v.ammo || {}).some((n) => n > 0);

// Note: the chance he gives up now, from danger, wounds, temperament and circumstances; 0 when no lawman sees him, never above 0.85.
export function surrenderOdds(sim, v) {
  if (!v.wanted || v.status !== 'ok' || v.surrendered) return 0;
  const watchers = sim.lawmen.filter((l) => l.status === 'ok' && !l.withdrawn && sim.sees(l, v));
  if (!watchers.length) return 0;
  const near = watchers.filter((l) => dist(l, v) < 5).length;
  const hurt = Math.min(1.5, (v.wounds || []).reduce((s, w) => s + (w.fatal ? 1 : w.severity || 0), 0));
  const friends = sim.hostiles.filter((h) => h !== v && fighting(h)).length;
  const t = v.traits || {};
  let p = 0.04 + 0.35 * hurt + 0.08 * watchers.length + 0.06 * near;
  p += friends ? -0.06 * friends : 0.22;
  if (!armed(v)) p += 0.3;
  if ((v.ai?.brokenAt ?? -1) >= 0 && sim.time - v.ai.brokenAt < 1) p += 0.15;
  p += EXP_ODDS[t.experience] ?? 0;
  p -= 0.45 * (t.nerve ?? 0.5);
  return clamp(p, 0, 0.85);
}

// Note: one assessment: he rolls against his odds and, if they win, gives himself up for good; returns whether he did.
export function considerSurrender(sim, v, why) {
  const p = surrenderOdds(sim, v);
  if (p <= 0) return false;
  v.ai.assessed = (v.ai.assessed || 0) + 1;
  if (sim.rand() >= p) return false;
  sim.surrender(v, why);
  return true;
}

// Note: assessments when circumstances change: a friend falls in his sight of the law, or he is first seen alone.
export function watchWanted(sim) {
  for (const v of sim.hostiles) {
    if (!v.wanted || !fighting(v)) continue;
    const friends = sim.hostiles.filter((h) => h !== v && fighting(h)).length;
    const seen = sim.lawmen.some((l) => l.status === 'ok' && !l.withdrawn && sim.sees(l, v));
    const ai = v.ai;
    if (ai.friendsSeen === undefined) ai.friendsSeen = friends;
    if (friends < ai.friendsSeen && seen) {
      ai.friendsSeen = friends;
      considerSurrender(sim, v, 'outnumbered');
    } else if (friends > ai.friendsSeen) ai.friendsSeen = friends;
    if (!friends && seen && !ai.aloneAssessed) {
      ai.aloneAssessed = true;
      if (fighting(v)) considerSurrender(sim, v, 'alone');
    }
  }
}

// Note: a man who gave up and waits calls out now and then, so the player can find him by ear.
export function stepPleas(sim) {
  for (const v of sim.hostiles) {
    if (!v.wanted || !v.surrendered || v.accepted || v.status !== 'ok') continue;
    if (sim.time - (v.pleaAt ?? -99) < PLEA_EVERY) continue;
    v.pleaAt = sim.time;
    sim.say(v, PLEAS[(v.pleas = (v.pleas || 0) + 1) % PLEAS.length]);
  }
}

// Note: the use key on a surrendering wanted man: within reach he is accepted and then secured; further off only by aiming at him in sight.
export function custodyUse(sim, a, aimed) {
  const waiting = (h) => h.wanted && h.surrendered && !h.secured && h.status === 'ok' && h.floor === a.floor;
  const near = sim.hostiles.filter((h) => waiting(h) && dist(a, h) < SECURE_REACH).sort((p, q) => dist(a, p) - dist(a, q))[0];
  if (near) return { type: 'custody', id: near.id };
  if (aimed && waiting(aimed) && !aimed.accepted && dist(a, aimed) <= ACCEPT_RANGE && sim.sees(a, aimed)) return { type: 'custody', id: aimed.id };
  return null;
}

// Note: the sheriff takes the surrender: the man answers and stays where he is.
export function acceptSurrender(sim, by, v) {
  if (!v || v.accepted || !v.surrendered || v.status !== 'ok') return false;
  v.accepted = true;
  v.acceptedBy = by.id;
  v.acceptedAt = sim.time;
  sim.say(by, 'Keep them up! Stay right there!');
  sim.voice(v, 'All right, all right.');
  sim.events.push({ type: 'accepted', actorId: v.id, by: by.id });
  return true;
}

// Note: his hands are tied; he no longer counts as an active hostile (item 492).
export function secureTarget(sim, by, v) {
  if (!v || v.secured || !v.surrendered || v.status !== 'ok') return false;
  v.accepted = true;
  v.secured = true;
  v.securedBy = by.id;
  sim.voice(by, 'He is secured.');
  sim.events.push({ type: 'secured', actorId: v.id, by: by.id });
  return true;
}

// Note: with the sheriff down and only surrendered men left, a deputy still in the fight secures them after a short aftermath.
// Note: a sheriff on his feet secures them himself; a man he accepted and has not reached after SHERIFF_FALLBACK seconds is tied by a deputy, so the fight can always end.
export function deputiesSecure(sim) {
  const up = sim.sheriff.status === 'ok';
  const waiting = sim.hostiles.filter((h) => h.status === 'ok' && h.surrendered && !h.secured && (!up || (h.accepted && sim.time - (h.acceptedAt ?? sim.time) >= SHERIFF_FALLBACK)));
  if (!waiting.length || sim.hostiles.some((h) => fighting(h))) return;
  const deputy = sim.deputies.find((d) => d.status === 'ok' && !d.withdrawn && !d.passive);
  if (!deputy) return;
  if (!up) {
    sim.securingSince ??= sim.time;
    if (sim.time - sim.securingSince < FALLBACK_DELAY) return;
  }
  for (const v of waiting) secureTarget(sim, deputy, v);
}
