// Note: arm wounds and weapon handling: handedness, drop odds, the weak hand and loose weapons on the floor; pure, no DOM or Phaser.

import { clamp, unit } from './rand.js';
import { WEAPONS, fitsSlot } from './weapons.js';
import { capability, handSide } from './wounds.js';

// Note: share of civilians and hostiles who are left-handed; the two lawmen are right-handed.
export const LEFT_HANDED = 0.1;
// Note: seconds added to drawing a weapon with one arm out of action.
export const ONE_HAND_DRAW = 0.4;
// Note: seconds to pick a weapon up from the floor, and how near the actor must be in metres.
export const ITEM_TIME = 1;
export const ITEM_REACH = 1.1;

// Note: drops and hands never draw from the sim's combat stream; unit lives in rand.js and is re-exported here.
export { unit };

export function handOf(seed, id, role) {
  if (role === 'sheriff' || role === 'deputy') return 'right';
  return unit(`${seed}:hand:${id}`) < LEFT_HANDED ? 'left' : 'right';
}

// Note: odds that a hit arm lets go; a carbine needs both arms and is heavy, a revolver is lost only from the arm that holds it.
export function dropOdds(def, severity) {
  return def.twoHanded ? clamp(0.3 + 0.35 * severity, 0.35, 0.85) : clamp(0.15 + 0.3 * severity, 0.2, 0.7);
}

// Note: what an arm hit does to the weapon in hand; the wound is already on the actor; roll is a number in 0..1.
export function armHitEffect(actor, weapon, hit, roll) {
  const cap = capability(actor);
  if (!cap.rifleOk && !cap.handgunOk) return { drop: true, reason: 'arms' };
  const def = WEAPONS[weapon.id];
  if (!def.twoHanded && hit.side !== handSide(actor)) return { drop: false, reason: null };
  return roll < dropOdds(def, hit.severity) ? { drop: true, reason: 'hit' } : { drop: false, reason: null };
}

export const usable = (cap, weapon) => (WEAPONS[weapon.id].kind === 'rifle' ? cap.rifleOk : cap.handgunOk);

// Note: the weapon slot to switch to, preferring a loaded usable one; -1 when nothing can be fired.
export function bestUsable(actor) {
  const cap = capability(actor);
  let best = -1;
  let score = -1;
  actor.weapons.forEach((w, i) => {
    if (!usable(cap, w)) return;
    const sc = (w.loaded > 0 ? 2 : 0) + ((actor.ammo[w.ammoType] || 0) > 0 ? 1 : 0);
    if (sc > score) {
      score = sc;
      best = i;
    }
  });
  return best;
}

// Note: a gun is picked up only when it adds a slot, as in looting a body.
export const canCarry = (actor, weapon) => fitsSlot(actor.weapons, weapon);

// Note: a floor weapon is worth the trip for its slot or its rounds, so an emptied gun left behind is not a target again.
export const itemUseful = (actor, item) => item.weapon.loaded > 0 || canCarry(actor, item.weapon);

// Note: the AI also asks whether it could fire the gun with the arms it has left.
export const itemWanted = (actor, item) => itemUseful(actor, item) && (!canCarry(actor, item.weapon) || usable(capability(actor), item.weapon));

// Note: where a dropped weapon lands, a short toss ahead and to the side of the hand.
export function dropSpot(seed, actor, n) {
  const a = unit(`${seed}:drop:${actor.id}:${n}:a`) * Math.PI * 2;
  const r = 0.12 + unit(`${seed}:drop:${actor.id}:${n}:r`) * 0.15;
  return { x: actor.x + Math.cos(actor.facing) * 0.2 + Math.cos(a) * r, y: actor.y + Math.sin(actor.facing) * 0.2 + Math.sin(a) * r };
}
