// Note: actor factory and derived values shared by the sim, the AI and the view; no DOM or Phaser.

import { HEIGHT } from './config.js';
import { makeWeapon } from './weapons.js';
import { makeMind } from './mind.js';
import { newFocus } from './focus.js';

export function makeActor(id, role, x, y, floor, o = {}) {
  return {
    id, role, name: o.name || role,
    x, y, floor, facing: o.facing ?? -Math.PI / 2,
    elev: 0, stance: 'stand', lean: 0, mode: 'idle', steady: false, focus: 0, eye: { x, y },
    status: 'ok', cause: null, wounds: [], deathAt: null, incapAt: null,
    weapons: (o.loadout || []).map((l) => makeWeapon(l.id, l.ammoType)),
    cur: 0,
    ammo: { '44-40': 0, '45colt': 0, ...(o.reserve || {}) },
    settle: 0, hold: 0, omega: 0, crouchK: 0, aimView: newFocus(), disturb: 0, cool: 0, stepD: 0,
    traits: { experience: o.experience || 'seasoned', nerve: o.nerve ?? 0.5 },
    action: null, react: null, climb: null, carried: false, carriedBy: null, carrying: null, bleeding: false,
    heard: [], known: {}, nav: null, intent: null, thinkT: 0, ai: { state: 'idle', mind: makeMind(), people: new Map() },
    habit: o.habit || 'stand', home: { x, y, floor }, kind: o.kind || null, hand: o.hand || 'right',
    diedAt: null, afterVictory: false, afterWin: false, carriedOut: false, tally: { fired: {}, looted: {} },
  };
}

export const heightOf = (a) => HEIGHT[a.stance];
export const isLawman = (a) => a.role === 'sheriff' || a.role === 'deputy';
// Note: lawmen and hostiles are each other's enemies and their own side's friends, and anyone else is neither.
export const isEnemy = (a, b) => (a.role === 'hostile' ? isLawman(b) : isLawman(a) && b.role === 'hostile');
export const isFriend = (a, b) => (a.role === 'hostile' ? b.role === 'hostile' : isLawman(a) && isLawman(b));
export const weaponOf = (a) => a.weapons[a.cur] || null;

// Note: both lawmen carry the Winchester 1873 in .44-40 and a Colt Single Action Army in .45 Colt.
export function lawmanKit(role) {
  return {
    loadout: [{ id: 'winchester73', ammoType: '44-40' }, { id: 'colt73', ammoType: '45colt' }],
    reserve: role === 'sheriff' ? { '44-40': 30, '45colt': 24 } : { '44-40': 24, '45colt': 18 },
  };
}
