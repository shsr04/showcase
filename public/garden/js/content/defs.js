// Note: pure data for the endgame content; this file imports nothing so config.js may import it.
// Note: LANDMARKS entries follow the BUILDINGS shape; good = specialty or luxury output, rare = rare good the site unlocks, recipe = station production.

export const LANDMARKS = {
  // Note: rare-trait sites (relic-gated isles); the luxury chains live in bathhouse, bannerloom and lenslamp.
  bathhouse: { size: 3, trait: 'springs', cost: { brick: 4, plank: 3 }, work: 18, role: 'landmark', rare: 'sulphur', good: 'bath', recipe: { in: { sulphur: 1, brick: 1 }, out: { bath: 1 }, time: 14 } },
  bannerloom: { size: 3, trait: 'misty', cost: { plank: 5, rope: 2, cloth: 2 }, work: 20, role: 'landmark', rare: 'moonpearl', good: 'banner', recipe: { in: { moonpearl: 1, cloth: 1 }, out: { banner: 1 }, time: 14 } },
  lenslamp: { size: 2, trait: 'crystal', cost: { brick: 4, ingot: 2, crystal: 2 }, work: 18, role: 'landmark', rare: 'prism', good: 'lens', recipe: { in: { prism: 1, ingot: 1 }, out: { lens: 1 }, time: 14 } },
  forgeglass: { size: 3, trait: 'volcanic', cost: { brick: 5, ingot: 2 }, work: 20, role: 'landmark', rare: 'obsidian' },
  hanginggarden: { size: 3, trait: 'frozen', cost: { plank: 4, crystal: 3 }, work: 20, role: 'landmark', rare: 'everbloom' },
  forgottentemple: { size: 3, trait: 'arid', cost: { stone: 8, plank: 3 }, work: 22, role: 'landmark', rare: 'sunstone' },
  // Note: common-trait sites; each makes one specialty good (deepmine only yields rich ore).
  ribbonhut: { size: 2, trait: 'meadow', cost: { plank: 3, cloth: 1 }, work: 10, role: 'landmark', good: 'ribbon', recipe: { in: { cloth: 1 }, out: { ribbon: 2 }, time: 9 } },
  granary: { size: 2, trait: 'fertile', cost: { plank: 4, rope: 1 }, work: 12, role: 'landmark', good: 'grainsack', recipe: { in: { wheat: 3 }, out: { grainsack: 1 }, time: 9 } },
  cidery: { size: 2, trait: 'orchard', cost: { plank: 3, brick: 2 }, work: 12, role: 'landmark', good: 'cider', recipe: { in: { fruit: 3 }, out: { cider: 1 }, time: 9 } },
  apiary: { size: 2, trait: 'verdant', cost: { plank: 3, rope: 1 }, work: 10, role: 'landmark', good: 'honey', recipe: { in: { fiber: 1 }, out: { honey: 1 }, time: 12 } },
  bellfoundry: { size: 3, trait: 'cliffy', cost: { brick: 5, ingot: 2 }, work: 18, role: 'landmark', good: 'bellmetal', recipe: { in: { ingot: 1, charcoal: 1 }, out: { bellmetal: 1 }, time: 12 } },
  saltpan: { size: 3, trait: 'tidal', cost: { plank: 3, stone: 3 }, work: 14, role: 'landmark', good: 'seasalt', recipe: { in: { wood: 1 }, out: { seasalt: 2 }, time: 10 } },
  glazekiln: { size: 2, trait: 'clay', cost: { brick: 4, stone: 2 }, work: 14, role: 'landmark', good: 'glaze', recipe: { in: { clay: 2, charcoal: 1 }, out: { glaze: 2 }, time: 10 } },
  deepmine: { size: 2, trait: 'windy', cost: { plank: 4, ingot: 1, rope: 2 }, work: 16, role: 'landmark', yields: 'ore', recipe: { in: { charcoal: 1 }, out: { ore: 3 }, time: 10 } },
};
export const LANDMARK_IDS = Object.keys(LANDMARKS);

// Note: the other non-tier buildings of the endgame.
export const EXTRA_BUILDINGS = {
  airdock: { size: 3, cost: { plank: 8, stone: 4 }, work: 20, role: 'airdock' },
  memorial: { size: 1, cost: {}, work: 0, role: 'memorial' },
  greatwork: { size: 4, cost: {}, work: 0, role: 'monument' },
};

export const SPECIALTY_GOODS = ['ribbon', 'grainsack', 'cider', 'honey', 'bellmetal', 'seasalt', 'glaze'];
export const RARE_GOODS = ['moonpearl', 'prism', 'obsidian', 'sulphur', 'everbloom', 'sunstone'];
export const LUXURY_GOODS = ['banner', 'lens', 'bath'];

// Note: GOODS-shaped entries; color feeds the crate label and pile tint.
export const NEW_GOODS = {
  ribbon: { color: 0xe58fb4, specialty: true },
  grainsack: { color: 0xe3c27a, specialty: true },
  cider: { color: 0xd9843a, specialty: true },
  honey: { color: 0xf2b83a, specialty: true },
  bellmetal: { color: 0xc98f4a, specialty: true },
  seasalt: { color: 0xeaf0f2, specialty: true },
  glaze: { color: 0x5fb0c0, specialty: true },
  moonpearl: { color: 0xe6ecff, rare: true },
  prism: { color: 0x9fe8ff, rare: true },
  obsidian: { color: 0x3a3542, rare: true },
  sulphur: { color: 0xe6cf4e, rare: true },
  everbloom: { color: 0xf2a8d0, rare: true },
  sunstone: { color: 0xffc23a, rare: true },
  banner: { color: 0x5d6fb8, luxury: true },
  lens: { color: 0xb8e8f0, luxury: true },
  bath: { color: 0x7fd6d0, luxury: true },
};

// Note: airship kinds; cap = crates carried, visitor = the dock visitor it brings, rung = least rung for that visit.
export const AIRSHIP_KINDS = ['cargo', 'trader', 'explorer', 'military'];
export const AIRSHIP_INFO = {
  cargo: { cap: 8 },
  trader: { cap: 2, visitor: 'merchant' },
  explorer: { cap: 0 },
  military: { cap: 0, visitor: 'frigate', rung: 4 },
};

// Note: Great Work stage 0 is the foundation from common goods; stages 1..6 take one rare good each in player order.
export const GW_FOUNDATION = { stone: 6, plank: 4, brick: 3 };
export const GW_STAGES = [
  { good: null, cost: GW_FOUNDATION },
  ...RARE_GOODS.map((g) => ({ good: g, cost: { [g]: 1 } })),
];

export const TRAIT_LANDMARK = Object.fromEntries(Object.entries(LANDMARKS).map(([id, d]) => [d.trait, id]));
export const TRAIT_RARE_GOOD = { misty: 'moonpearl', crystal: 'prism', volcanic: 'obsidian', springs: 'sulphur', frozen: 'everbloom', arid: 'sunstone' };
