// Note: the roster in the campaign (items 365–368): the goods a store sells, what a store stocks by town size and region, the guns people carry by role and region, and the carry limits; pure, no DOM.

import { WEAPONS, CARTRIDGES, fitsSlot, slotOf, CARRY } from '../weapons.js';

export { slotOf, CARRY };
import { unit } from '../rand.js';

// Note: item 365: the price in cents of each model in 1881, approximate retail.
const PRICE = {
  colt73: 1700, schofield: 1500, russian: 1600, remington75: 1300, colt78: 2000, lightning: 1800, derringer: 500, newline: 700, sw38: 1100,
  winchester73: 2800, winchester73c: 2500, winchester66: 1800, spencer: 800, springfield73: 1200, sharps74: 4000, rollingblock: 3000, parker12: 2500, colt78shotgun: 2200,
};
// Note: the box of ammunition the store sells, ten rounds or shells; the two Prototype 2 boxes keep their prices.
export const BOX = 10;
const BOX_CENTS = { '45colt': 30, '44-40': 25 };
// Note: priceCents is the 1881 price of a maker's box of `box` rounds.
const boxCents = (type) => BOX_CENTS[type] ?? Math.round((CARTRIDGES[type].priceCents * BOX) / CARTRIDGES[type].box * 1.15);

// Note: the goods ids of the Prototype 2 store stay as they were.
const OLD_IDS = { 'winchester73:44-40': 'winchester73', 'colt73:45colt': 'colt73-45', 'colt73:44-40': 'colt73-44' };
const goodId = (id, type) => OLD_IDS[`${id}:${type}`] || (WEAPONS[id].ammoTypes.length > 1 ? `${id}-${type}` : id);

export const AMMO_GOODS = Object.fromEntries(Object.keys(CARTRIDGES).map((type) => [`ammo-${type}`, {
  id: `ammo-${type}`, label: `${CARTRIDGES[type].name} ${CARTRIDGES[type].pellets ? 'shells' : 'cartridges'}, a box of ${BOX}`, lot: BOX, cents: boxCents(type), kind: 'ammo', ammoType: type,
}]));

export const WEAPON_GOODS = Object.fromEntries(Object.values(WEAPONS).flatMap((w) => w.ammoTypes.map((type) => [goodId(w.id, type), {
  id: goodId(w.id, type), label: `${w.name} (${CARTRIDGES[type].name})`, lot: 1, cents: PRICE[w.id], kind: 'weapon', weapon: { id: w.id, ammoType: type },
}])));

// Note: the four kinds of country the stores and the carried guns follow, from the 24 regions of the world.
const COUNTRY = {
  southwest: ['sky-islands', 'sonoran-desert', 'chihuahuan-desert', 'colorado-plateau', 'mojave-desert'],
  plains: ['prairie', 'high-plains', 'northern-plains', 'cross-timbers', 'south-texas-brush', 'texas-hill-country'],
  mountains: ['rocky-mountains', 'northern-rockies', 'great-basin', 'sierra-cascades', 'columbia-plateau'],
  settled: ['california-coast', 'central-valley', 'northwest-forest', 'gulf-coast', 'mississippi-bottoms', 'ozarks', 'piney-woods', 'north-woods'],
};
export const countryOf = (region) => Object.keys(COUNTRY).find((k) => COUNTRY[k].includes(region)) || 'plains';

// Note: item 365: what a store stocks grows with the town; a bigger town adds more of its region's picks. The army's trapdoor is never sold in a store.
const BASE = [
  [],
  ['colt73', 'winchester66', 'parker12', 'derringer'],
  ['colt73', 'winchester73', 'winchester73c', 'winchester66', 'parker12', 'derringer', 'newline'],
  ['colt73', 'remington75', 'winchester73', 'winchester73c', 'parker12', 'colt78shotgun', 'derringer', 'newline', 'sw38'],
  ['colt73', 'colt78', 'lightning', 'russian', 'remington75', 'winchester73', 'winchester73c', 'rollingblock', 'sharps74', 'parker12', 'colt78shotgun', 'derringer', 'newline', 'sw38'],
];
const REGIONAL = {
  southwest: ['schofield', 'winchester66', 'spencer'],
  plains: ['sharps74', 'rollingblock', 'spencer', 'schofield'],
  mountains: ['sharps74', 'rollingblock', 'remington75', 'sw38'],
  settled: ['lightning', 'russian', 'sw38', 'colt78'],
};
const PICKS = [0, 0, 1, 2, 4];

// Note: the models a store of this size class (0 to 4) in this region stocks.
export function stockedModels(size, region) {
  const s = Math.max(0, Math.min(4, size | 0));
  return [...new Set([...BASE[s], ...REGIONAL[countryOf(region)].slice(0, PICKS[s])])];
}

// Note: item 365: the guns people carry by role and region.
const ROLE = {
  outlaw: { handgun: ['colt73', 'remington75', 'schofield'], long: ['winchester73c', 'winchester66', 'parker12', 'colt78shotgun'], pocket: ['derringer'] },
  rustler: { handgun: ['colt73', 'remington75'], long: ['winchester66', 'spencer', 'winchester73c'], pocket: [] },
  gunslinger: { handgun: ['colt73', 'lightning', 'russian', 'colt78'], long: ['winchester73'], pocket: ['sw38', 'derringer'] },
  associate: { handgun: ['colt73', 'schofield', 'remington75'], long: ['winchester73', 'parker12'], pocket: ['newline'] },
  nemesis: { handgun: ['colt73', 'russian', 'lightning'], long: ['winchester73', 'sharps74'], pocket: ['derringer', 'sw38'] },
};
const PREFER = { southwest: ['schofield', 'springfield73', 'winchester66'], plains: ['spencer', 'sharps74', 'rollingblock'], mountains: ['sharps74', 'remington75'], settled: ['lightning', 'russian', 'colt78'] };

// Note: a case's men by the kind of case.
export const roleOfCase = (kind) => (kind === 'rustlers' || kind === 'horse-thieves' ? 'rustler' : 'outlaw');

const pickBy = (list, tag) => list[Math.floor(unit(tag) * list.length)];
const armed = (id, tag) => {
  const w = WEAPONS[id];
  return { id, ammoType: pickBy(w.ammoTypes, `${tag}:cartridge`) };
};

// Note: one person's guns by role and region from a hash of tag, so no random stream moves: a handgun, often a long gun (a region's own model by preference), now and then a pocket gun.
export function loadoutFor(role, region, tag) {
  const r = ROLE[role];
  const prefer = PREFER[countryOf(region)];
  const longs = [...r.long, ...prefer.filter((id) => WEAPONS[id].kind === 'rifle')];
  const hands = [...r.handgun, ...prefer.filter((id) => WEAPONS[id].category === 'handgun')];
  const out = [armed(pickBy(hands, `${tag}:hand`), `${tag}:hand`)];
  if (unit(`${tag}:long?`) < 0.6) out.unshift(armed(pickBy(longs, `${tag}:long`), `${tag}:long`));
  if (r.pocket.length && unit(`${tag}:pocket?`) < 0.15) out.push(armed(pickBy(r.pocket, `${tag}:pocket`), `${tag}:pocket`));
  return out;
}

// Note: a candidate for hire comes with the guns of the life they led: drovers and riders a carbine and a revolver, an old trooper a cavalry revolver and a surplus carbine, teamsters and station keepers a coach gun, a hard-up miner a cheap pocket revolver, a deputy what a town office issues.
export const HIRE_KITS = {
  deputy: { hand: ['colt73', 'colt73', 'remington75'], long: ['winchester73', 'winchester73', 'parker12'], longChance: 0.8 },
  drover: { hand: ['colt73', 'colt73', 'remington75'], long: ['winchester73c', 'winchester66', 'winchester73c'], longChance: 0.75 },
  cavalry: { hand: ['schofield', 'colt73', 'schofield'], long: ['spencer', 'winchester73c', 'sharps74'], longChance: 0.9 },
  teamster: { hand: ['colt73', 'remington75', 'newline'], long: ['parker12', 'colt78shotgun', 'parker12'], longChance: 0.7 },
  miner: { hand: ['newline', 'sw38', 'remington75'], long: ['parker12'], longChance: 0.3 },
  station: { hand: ['sw38', 'colt73'], long: ['parker12', 'colt78shotgun'], longChance: 0.95 },
  rancher: { hand: ['colt73', 'sw38'], long: ['winchester73', 'winchester73', 'parker12'], longChance: 0.9 },
  quiet: { hand: ['colt73', 'remington75', 'schofield', 'russian'], long: ['winchester73', 'winchester73c', 'parker12'], longChance: 0.5 },
};
// Note: what a fine shot reaches for: a full rifle or a heavy single-shot in open country.
const MARKSMAN = { plains: ['winchester73', 'sharps74'], mountains: ['winchester73', 'sharps74'], southwest: ['winchester73'], settled: ['winchester73'] };

// Note: one candidate's guns from background, skill and region by a hash of tag, so no random stream moves; a fine shot is likelier to carry a long gun and to favour a rifle over a shotgun, a poor one leans on a shotgun, and a few good hands keep a pocket gun.
export function hireLoadout(background, skill, region, tag) {
  const k = HIRE_KITS[background] || HIRE_KITS.quiet;
  const aim = skill && Number.isFinite(skill.precision) ? skill.precision : 0.5;
  const country = countryOf(region);
  const prefer = PREFER[country].filter((id) => WEAPONS[id].category === 'handgun' && id !== 'springfield73');
  const hands = [...k.hand, ...prefer];
  const out = [armed(pickBy(hands, `${tag}:hand`), `${tag}:hand`)];
  if (unit(`${tag}:long?`) < Math.min(0.97, k.longChance + (aim - 0.5) * 0.5)) {
    let id = pickBy(k.long, `${tag}:long`);
    const shotgun = WEAPONS[id].ammoTypes.some((a) => /buck|bird/.test(a));
    if (aim >= 0.62 && shotgun && unit(`${tag}:rifle?`) < 0.6) id = pickBy(MARKSMAN[country], `${tag}:mark`);
    else if (aim < 0.42 && !shotgun && unit(`${tag}:shot?`) < 0.5) id = 'parker12';
    const long = armed(id, `${tag}:long`);
    // Note: a revolver made for the long gun's cartridge is loaded for it, as men carried one round for both.
    if (WEAPONS[out[0].id].ammoTypes.includes(long.ammoType)) out[0].ammoType = long.ammoType;
    out.unshift(long);
  }
  // Note: a hand gun small enough for the pocket already fills it (CARRY.pocket).
  if (aim >= 0.6 && slotOf(out.at(-1)) !== 'pocket' && unit(`${tag}:pocket?`) < 0.2) out.push(armed(pickBy(['derringer', 'sw38'], `${tag}:pocket`), `${tag}:pocket`));
  return out;
}

// Note: rounds carried for a loadout: a gun's capacity and up to eleven more of its cartridge.
export function reserveFor(loadout, tag) {
  const reserve = {};
  for (const w of loadout) reserve[w.ammoType] = (reserve[w.ammoType] || 0) + WEAPONS[w.id].cap + Math.floor(unit(`${tag}:${w.id}:rounds`) * 12);
  return reserve;
}

// Note: item 367 for a campaign loadout; further long guns are stowed in the office.
export const canCarry = (loadout, w) => fitsSlot(loadout, w);

// Note: a loadout keeps the long gun first, the handguns second and the pocket gun last; the sort is stable and in place.
const SLOT_RANK = { long: 0, handgun: 1, pocket: 2 };
export const orderLoadout = (loadout) => loadout.sort((a, b) => SLOT_RANK[slotOf(a)] - SLOT_RANK[slotOf(b)]);

// Note: item 364: what the guns weigh, which tires the one who carries them on the road.
export const KIT_KG = 5.2;
export const loadKg = (loadout) => loadout.reduce((s, w) => s + (WEAPONS[w.id]?.weightKg || 0), 0);
