// Note: shared catalogs and constants; the design backbone for sim, render and models.

import { LANDMARKS, EXTRA_BUILDINGS, NEW_GOODS } from './content/defs.js';
export { LANDMARKS, LANDMARK_IDS, EXTRA_BUILDINGS, NEW_GOODS, SPECIALTY_GOODS, RARE_GOODS, LUXURY_GOODS, AIRSHIP_KINDS, AIRSHIP_INFO, GW_STAGES, GW_FOUNDATION, TRAIT_LANDMARK, TRAIT_RARE_GOOD } from './content/defs.js';

export const N = 24; // cells per island side; vertices are (N+1)^2
// Note: arrival and festival balloons are drawn at this scale; a bigger one no longer fits the 2x2 pad.
export const BALLOON_SCALE = 0.7;
export const SPACING = 50; // world units between loose-grid island centres
export const DAY_LENGTH = 360; // seconds
export const SIM_DT = 0.1;

// Note: seasons: a year is four seasons of three days; the clock lives in the world and is saved.
export const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_DAYS = 3;
export const SEASON_LEN = SEASON_DAYS * DAY_LENGTH;
export const YEAR_LEN = SEASON_LEN * 4;
// Note: growth multiplier per season (spring, summer, autumn, winter); crops swing more than wild plants.
export const SEASON_GROW = { crop: [1.4, 1, 1, 0.5], other: [1.2, 1, 1, 0.6] };
export const SEASON_WINTER_FOOD = 0.25; // food need floor at full winter
export const SEASON_WINTER_DECAY = 0.65; // food need decay multiplier at full winter
export const SEASON_AUTUMN_BONUS = 1; // extra goods per fruit or wheat harvest at full autumn
// Note: which season each archetype celebrates.
export const SEASON_FESTIVAL = { weavers: 0, sailors: 1, potters: 2, carvers: 3 };
export const SEASON_FEST_LEN = 160; // seconds a seasonal festival lasts
export const SEASON_GUESTS = 3; // guests sent over each link
export const SAVE_KEY = 'garden.save.v2';
export const DEFAULT_SEED = 'SKY-0001';

// Note: terrain constants; heights are world y at vertices.
export const SEA_Y = 0; // island base is above; underside tapers below
export const MAX_H = 12;
export const MIN_H = 1.2; // digging never goes below this
export const WALK_SLOPE = 0.85; // max height delta between adjacent cells for walking
export const SOIL_MAX = 1.2; // soil layer thickness

// Note: surface kinds written into island.surf (derived per cell).
export const SURF = { SOIL: 0, ROCK: 1, ORE: 2, SAND: 3, CLAY: 4, CRYSTAL: 5, ASH: 6, SNOW: 7 };

export const GOODS = {
  wood: { raw: true, color: 0x9a6a3c },
  stone: { raw: true, color: 0x9ea3a8 },
  clay: { raw: true, color: 0xc8845a },
  ore: { raw: true, color: 0x7a5f56 },
  wheat: { raw: true, color: 0xe6c458 },
  fruit: { raw: true, color: 0xe2564a },
  fish: { raw: true, color: 0x7fb4d6 },
  crystal: { raw: true, color: 0x8fe7ff },
  fiber: { raw: true, color: 0x9fbf6a },
  plank: { color: 0xc99a62 },
  charcoal: { color: 0x34302e },
  brick: { color: 0xc4573d },
  ingot: { color: 0xb8c0c8 },
  tool: { color: 0x8f98a2 },
  gear: { color: 0xd1a23c },
  flour: { color: 0xf2ead0 },
  bread: { color: 0xd89a4a },
  smoked: { color: 0xc9814a },
  rope: { color: 0xd8c08a },
  cloth: { color: 0xf0d6e0 },
  lamp: { color: 0xffe08a },
  egg: { color: 0xf4ecd8 },
  wool: { raw: true, color: 0xf2efe6 },
  // Note: specialty, rare and luxury goods of the endgame content.
  ...NEW_GOODS,
};
export const GOOD_IDS = Object.keys(GOODS);

// Note: edible goods and how much food need they restore.
export const FOOD_VALUE = { fruit: 0.35, bread: 0.8, smoked: 0.6, fish: 0.3, wheat: 0.12, egg: 0.45 };

export const KNOWLEDGE = {
  woodwork: { start: true, unlocks: ['sawmill', 'ropewalk', 'dock', 'ropebridge'] },
  fire: { start: true, unlocks: ['charcoal', 'campfire'] },
  nets: { start: true, unlocks: [] },
  masonry: { unlocks: ['brickkiln'], ring: 1 },
  milling: { unlocks: ['windmill'], ring: 1 },
  baking: { unlocks: ['oven'], ring: 1 },
  smelting: { unlocks: ['smelter'], ring: 1 },
  smoking: { unlocks: ['smokehouse'], ring: 2 },
  weaving: { unlocks: ['loom'], ring: 2 },
  smithing: { unlocks: ['smithy'], ring: 2, needs: ['ingot'] },
  lampcraft: { unlocks: ['lampworks'], ring: 3, needs: ['ingot', 'crystal'] },
  // Note: fixed techs sit on two islands of their ring (rareisles.js relicPlan); wanderers never teach them.
  ballooning: { unlocks: ['balloon'], ring: 2, needs: ['cloth', 'rope'], fixed: true },
  pulleys: { unlocks: ['cablecar'], ring: 4, needs: ['gear'], fixed: true },
  navigation: { unlocks: ['airdock'], ring: 4, fixed: true },
  husbandry: { unlocks: ['coop', 'pen'], ring: 2 },
  glasswork: { unlocks: ['glassgarden'], ring: 3, needs: ['crystal'] },
};
export const KNOWLEDGE_IDS = Object.keys(KNOWLEDGE);

// Note: size = footprint in cells; cost = goods; work = build seconds; recipe = station production.
// Note: buildings that can carry civ-progress flourishes (see models.js addFlourish).
export const FLOURISH_IDS = new Set(['campfire', 'bonfire', 'storehouse', 'hut', 'sawmill', 'brickkiln', 'smelter', 'smithy', 'oven', 'smokehouse', 'loom', 'coop', 'lampworks', 'hall', 'windmill', 'lookout', 'dock', 'pen', 'pad', 'glassgarden', 'charcoal', 'ropewalk', 'airdock', 'council']);

export const BUILDINGS = {
  storehouse: { size: 2, cost: { wood: 3 }, work: 8, role: 'store' },
  hut: { size: 2, cost: { wood: 3 }, upgrade: { plank: 2 }, work: 10, role: 'home', beds: 2 },
  campfire: { size: 1, cost: { wood: 1 }, work: 3, role: 'social' },
  bonfire: { size: 1, cost: { wood: 4, stone: 1 }, work: 8, role: 'signal' },
  pad: { size: 2, cost: { plank: 3 }, work: 8, role: 'pad' },
  lookout: { size: 1, cost: { plank: 3, stone: 2 }, work: 14, role: 'wonder' },
  sawmill: { size: 2, cost: { wood: 3, stone: 1 }, work: 10, role: 'station', recipe: { in: { wood: 2 }, out: { plank: 2 }, time: 6 } },
  charcoal: { size: 1, cost: { stone: 3 }, work: 8, role: 'station', recipe: { in: { wood: 2 }, out: { charcoal: 1 }, time: 8 } },
  ropewalk: { size: 1, cost: { wood: 2 }, work: 6, role: 'station', recipe: { in: { fiber: 2 }, out: { rope: 1 }, time: 5 } },
  dock: { size: 1, cost: { plank: 2 }, work: 8, role: 'dock' },
  brickkiln: { size: 2, cost: { stone: 4, clay: 2 }, work: 12, role: 'station', recipe: { in: { clay: 2, charcoal: 1 }, out: { brick: 2 }, time: 9 } },
  smelter: { size: 2, cost: { brick: 4 }, work: 14, role: 'station', recipe: { in: { ore: 2, charcoal: 1 }, out: { ingot: 1 }, time: 10 } },
  smithy: { size: 2, cost: { brick: 3, plank: 2 }, work: 14, role: 'station', recipe: { in: { ingot: 1, plank: 1 }, out: { tool: 1 }, time: 9 }, recipe2: { in: { ingot: 2, tool: 1 }, out: { gear: 1 }, time: 12 } },
  windmill: { size: 2, cost: { plank: 4, stone: 2, rope: 1 }, work: 16, role: 'station', recipe: { in: { wheat: 2 }, out: { flour: 1 }, time: 8 }, wind: true },
  oven: { size: 2, cost: { brick: 3 }, work: 10, role: 'station', recipe: { in: { flour: 1, wood: 1 }, out: { bread: 2 }, time: 8 } },
  smokehouse: { size: 2, cost: { plank: 2, stone: 2 }, work: 9, role: 'station', recipe: { in: { fish: 2, wood: 1 }, out: { smoked: 2 }, time: 8 } },
  loom: { size: 2, cost: { plank: 3, rope: 1 }, work: 10, role: 'station', recipe: { in: { fiber: 3 }, out: { cloth: 1 }, time: 9 }, recipe2: { in: { wool: 2 }, out: { cloth: 1 }, time: 7 } },
  coop: { size: 2, cost: { wood: 2, fiber: 1 }, work: 7, role: 'coop' },
  pen: { size: 3, cost: { plank: 2, rope: 1 }, work: 9, role: 'pen' },
  glassgarden: { size: 3, cost: { plank: 4, crystal: 3 }, work: 16, role: 'wonder' },
  stairs: { size: 1, cost: { wood: 2 }, work: 6, role: 'path' },
  art: { size: 1, cost: {}, work: 0, role: 'art' },
  hall: { size: 3, cost: { plank: 4, wood: 2 }, work: 14, role: 'social' },
  // Note: the capital hall of the home island; the flagpost costs nothing and its tiers cost work only.
  council: { size: 2, cost: {}, work: 6, role: 'capital' },
  lampworks: { size: 2, cost: { brick: 2, plank: 2 }, work: 12, role: 'station', recipe: { in: { crystal: 1, ingot: 1 }, out: { lamp: 1 }, time: 10 } },
  // Note: landmarks, airdock, memorial and greatwork are not tiered and never player-placed; the settlers or the world build them.
  ...LANDMARKS,
  ...EXTRA_BUILDINGS,
};
// Note: folk stand points at tier props, local to the building: [x as a fraction of the half-size, z beyond the front wall]; +z is the door side. S shelter prop, C bench, W planters.
export const TIER_SPOTS = { S: [-0.6, 0.5], C: [0.6, 0.5], W: [0, 0.5] };
// Note: idle jobs at tier props; min = flourish needed, when = day (night < 0.1, before tod 0.67) or dusk (evening, sun low, night < 0.64; sessions run until night 0.85), gain = need refill over dur seconds. Task types: tidy, sit, water.
export const TIER_JOBS = {
  S: { type: 'tidy', min: 2, when: 'day', need: 'shelter', gain: 0.25, dur: 9 },
  C: { type: 'sit', min: 3, when: 'dusk', need: 'company', gain: 0.25, dur: 14, rest: 0.1 },
  W: { type: 'water', min: 4, when: 'day', need: 'wonder', gain: 0.25, dur: 9 },
};
export const STEP_MAX = 0.8;
export const STAIR_MAX = 3.2;
export const BUILDING_IDS = Object.keys(BUILDINGS);

// Note: gap = max rim-to-rim distance in world units; vine needs grown vines instead of goods.
export const LINKS = {
  vine: { gap: 24, cost: {}, work: 0, knowledge: null, speed: 1.0 },
  ropebridge: { gap: 34, cost: { plank: 3, rope: 2 }, work: 22, knowledge: 'woodwork', speed: 1.0 },
  balloon: { gap: 42, cost: { cloth: 3, rope: 2, plank: 3 }, work: 26, knowledge: 'ballooning', speed: 1.5 },
  cablecar: { gap: 70, cost: { gear: 3, rope: 4, ingot: 2, plank: 2 }, work: 34, knowledge: 'pulleys', speed: 2.2 },
};
export const LINK_IDS = Object.keys(LINKS);
// Note: links that can be adorned; the vine stays wild. The bench stands this many cells beside the end cell centre, off the deck lane.
export const LINK_TIER_TYPES = new Set(['ropebridge', 'balloon', 'cablecar']);
export const LINK_BENCH_SIDE = 0.6;

export const PLANTS = {
  none: { id: 0 },
  flower: { id: 1, grow: 40, flammable: 0.4, water: 0.2 },
  bush: { id: 2, grow: 90, flammable: 0.7, water: 0.25, yields: 'fruit' },
  tree: { id: 3, grow: 150, flammable: 0.8, water: 0.35, yields: 'wood' },
  pine: { id: 4, grow: 180, flammable: 0.8, water: 0.2, yields: 'wood', cold: true },
  fruittree: { id: 5, grow: 170, flammable: 0.8, water: 0.4, yields: 'fruit' },
  wheat: { id: 6, grow: 110, flammable: 0.9, water: 0.4, yields: 'wheat', crop: true },
  reed: { id: 7, grow: 50, flammable: 0.5, water: 0.7, yields: 'fiber' },
  vine: { id: 8, grow: 120, flammable: 0.6, water: 0.5, yields: 'fiber' },
  glowcap: { id: 9, grow: 70, flammable: 0.1, water: 0.6 },
};
export const PLANT_KINDS = ['none', 'flower', 'bush', 'tree', 'pine', 'fruittree', 'wheat', 'reed', 'vine', 'glowcap'];

// Note: traits shape generation and gameplay; weight drives how often a trait is drawn.
export const TRAITS = {
  meadow: { weight: 3, tint: 0x9fd46a },
  fertile: { weight: 3, tint: 0x8ccf5a },
  orchard: { weight: 2, tint: 0xa8d86c },
  verdant: { weight: 3, tint: 0x6cbf62 },
  cliffy: { weight: 3, tint: 0xa9b0a6 },
  tidal: { weight: 2, tint: 0xe6d9a2 },
  misty: { weight: 2, tint: 0x9ccbc2 },
  crystal: { weight: 2, tint: 0xa6d8f0 },
  volcanic: { weight: 1, tint: 0x8a7a70 },
  windy: { weight: 2, tint: 0xb7c98a },
  springs: { weight: 1, tint: 0xc9e0c2 },
  clay: { weight: 2, tint: 0xd7a07a },
  frozen: { weight: 1, tint: 0xe8f2f6 },
  arid: { weight: 1, tint: 0xd8c27a },
};
export const TRAIT_IDS = Object.keys(TRAITS);

export const SHAPES = ['round', 'long', 'crescent', 'twin', 'blob'];

// Note: needs decay per second; mood is their mean.
export const NEEDS = ['food', 'shelter', 'rest', 'company', 'wonder', 'explore', 'industry', 'belonging'];
export const NEED_DECAY = { food: 1 / 420, shelter: 1 / 900, rest: 1 / 520, company: 1 / 700, wonder: 1 / 600, explore: 1 / (6 * DAY_LENGTH), industry: 1 / 600, belonging: 1 / 900 };

// Note: life stages in seconds of play time.
export const AGE = { child: 1800, elder: 10800, pass: 14400, passVar: 3000 };
export const FOLK_SPEED = 1.6; // cells per second
export const START_FOLK = 6;
export const BED_PER_ISLAND_MAX = 8;
