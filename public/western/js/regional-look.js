// Note: region id to outdoor look; a visual approximation of the 1881 landscape from ecoregion and climate names, not a survey.
// Note: the look is picture and mix only; tile physics, the Sim and every tactical rule stay as they are.
// Note: no region, an unknown region and sky-islands all give the Cochise base look, which carries no regional change.

import { C } from './palette.js';
import { T } from './tiles.js';
import { hash as hh } from './draw.js';

export const TERRAIN_IDS = ['desert-scrub', 'wash', 'rocky-hills', 'grassland', 'mining-camp', 'ranch', 'riverbank', 'stage-road'];

export const TREE_KINDS = ['mesquite', 'cottonwood', 'oak', 'liveoak', 'pinyon', 'juniper', 'aspen', 'willow', 'cypress', 'hardwood', 'brush', 'ponderosa', 'fir', 'spruce', 'pine'];
export const SPINY_KINDS = ['pricklypear', 'agave', 'yucca', 'cholla', 'ocotillo', 'saguaro', 'joshua', 'barrel', 'sage', 'bramble', 'deadfall', 'palmetto'];
export const SCRUB_KINDS = ['creosote', 'grama', 'sticks', 'sagebrush', 'bunch', 'tall', 'fern', 'litter', 'sedge', 'flower', 'shrub'];
export const ROCK_KINDS = ['granite', 'redrock', 'basalt', 'limestone', 'sandstone'];

// Note: the plant families the tests and the camp can count; cactus is the Cochise look, conifer the mountain and north look.
export const KIND_GROUP = {
  pricklypear: 'cactus', agave: 'cactus', yucca: 'cactus', cholla: 'cactus', ocotillo: 'cactus', saguaro: 'cactus', joshua: 'cactus', barrel: 'cactus', palmetto: 'cactus',
  pinyon: 'conifer', juniper: 'conifer', ponderosa: 'conifer', fir: 'conifer', spruce: 'conifer', pine: 'conifer',
  mesquite: 'broadleaf', cottonwood: 'broadleaf', oak: 'broadleaf', liveoak: 'broadleaf', aspen: 'broadleaf', willow: 'broadleaf', cypress: 'broadleaf', hardwood: 'broadleaf',
  brush: 'shrub', sage: 'shrub', bramble: 'shrub', deadfall: 'litter',
  creosote: 'shrub', sagebrush: 'shrub', shrub: 'shrub', grama: 'grass', bunch: 'grass', tall: 'grass', sedge: 'grass', flower: 'grass', sticks: 'litter', fern: 'litter', litter: 'litter',
};

const ONE = { tree: 1, spiny: 1, scrub: 1, grass: 1, rock: 1, cluster: 1 };

// Note: grass colour sets for ground.js: the green wash, blades in lush ground and blades in dry ground.
const GRASS = {
  lush: { wash: [C.GREEN, 0.42], lush: [C.GREEN_D, C.GREEN, C.GREEN], dry: [C.GREEN, C.GREEN_D, C.GOLD] },
  gold: { wash: [C.GOLD, 0.26], lush: [C.GOLD, C.SAND_L, C.GREEN], dry: [C.SAND_L, C.GOLD, C.SAND_D] },
  blue: { wash: [C.GREEN, 0.2], lush: [C.GREEN_D, C.STONE_L, C.GLASS], dry: [C.SAND_L, C.STONE_L, C.SAND_D] },
  dry: { wash: [C.GREEN, 0.14], lush: [C.GREEN_D, C.SAND_L, C.GREEN], dry: [C.SAND_L, C.GOLD, C.SAND_D] },
};

// Note: ground families; tint is laid over the terrain's own colour, dark and light replace the blob colours, pebble the stones.
const SOIL = {
  red: { tint: [C.RED_L, 0.17], dark: C.RED_D, light: C.ADOBE_L, pebble: [C.RED, C.ADOBE_D, C.ADOBE_L, C.STONE_L], road: C.ADOBE_L },
  grey: { tint: [C.IRON_L, 0.34], dark: C.STONE, light: C.SAND_L, pebble: [C.STONE, C.IRON_L, C.STONE_L], road: C.SAND_L },
  pale: { tint: [C.PLASTER, 0.26], dark: C.SAND_D, light: C.PLASTER_L, pebble: [C.STONE_L, C.PLASTER, C.SAND_L], road: C.PLASTER_L },
  loam: { tint: [C.WOOD, 0.36], dark: C.WOOD_D, light: C.ADOBE_D, pebble: [C.WOOD_D, C.STONE, C.ADOBE_D], road: C.ADOBE, ripples: false },
  forest: { tint: [C.GREEN_D, 0.42], dark: C.DARK, light: C.GREEN, pebble: [C.STONE, C.WOOD, C.GREEN_D], road: C.ADOBE_D, ripples: false },
  clay: { tint: [C.ADOBE, 0.3], dark: C.ADOBE_D, light: C.ADOBE_L, pebble: [C.ADOBE_D, C.STONE_L, C.RED], road: C.ADOBE_L },
  sand: { tint: [C.SAND_L, 0.26], dark: C.SAND, light: C.PLASTER_L, pebble: [C.SAND_D, C.PLASTER, C.STONE_L], road: C.PLASTER_L },
  steppe: { tint: [C.GOLD, 0.16], dark: C.SAND_D, light: C.PLASTER, pebble: [C.STONE_L, C.SAND_L, C.ADOBE_L], road: C.SAND_L },
};

const ground = (soil, o = {}) => ({ ripples: true, pebbles: 1, cover: 0, grass: null, road: null, ...soil, ...o });

// Note: terrain table in TERRAIN_IDS order, one [label, weight] pair each; weights drive how often a place of that region draws the terrain.
const terrains = (rows) => Object.fromEntries(TERRAIN_IDS.map((id, i) => [id, { label: rows[i][0], w: rows[i][1] }]));

const BASE_ROWS = [['desert scrub', 1], ['dry wash', 1], ['rocky hills', 1], ['grassland', 1], ['mining camp', 1], ['ranch land', 1], ['riverbank', 1], ['stage road', 1]];

export const BASE_LOOK = Object.freeze({
  id: 'default', base: true, name: 'Southeastern Arizona',
  basis: 'Prototype 2 Cochise look; EPA Level III Madrean Archipelago, Koppen semi-arid.',
  ground: null, trees: [['mesquite', 1]], riverTrees: [['cottonwood', 1]], spiny: [['pricklypear', 0.3], ['agave', 0.2], ['yucca', 0.18], ['cholla', 0.14], ['ocotillo', 0.1], ['saguaro', 0.08]],
  scrub: [['creosote', 0.4], ['grama', 0.35], ['sticks', 0.25]], rock: null, bank: null, water: null, density: Object.freeze({ ...ONE }), lake: false, pools: 0, creek: false,
  terrains: Object.freeze(terrains(BASE_ROWS)), building: Object.freeze({ massive: 'adobe', share: 0.4 }), noPieces: Object.freeze([]),
});

const look = (id, name, basis, o) => {
  const l = {
    id, base: false, name, basis, ground: null, riverTrees: null, spiny: [], rock: null, bank: null, water: null, lake: false, pools: 0, creek: false, noPieces: [],
    ...o, density: { ...ONE, ...o.density },
  };
  l.riverTrees = l.riverTrees || l.trees;
  l.terrains = terrains(o.terrains);
  return l;
};

const ADOBE_RUINS = ['adobe-ruins'];

export const REGION_LOOKS = {
  // Note: Mediterranean climate, EPA Level III Great Valley; golden annual grass with scattered valley oak and willow sloughs.
  'central-valley': look('central-valley', 'California Central Valley', 'EPA Level III Great Valley; Koppen Csa.', {
    ground: ground(SOIL.steppe, { cover: 0.25, grass: GRASS.gold, pebbles: 0.5 }),
    trees: [['oak', 1]], riverTrees: [['willow', 0.5], ['cottonwood', 0.3], ['oak', 0.2]],
    spiny: [['bramble', 0.7], ['yucca', 0.15], ['pricklypear', 0.15]], scrub: [['bunch', 0.45], ['flower', 0.25], ['shrub', 0.3]],
    rock: 'granite', bank: 'dark', creek: true, pools: 0.1, density: { tree: 0.55, spiny: 0.5, scrub: 0.9, grass: 1.4, rock: 0.4 }, building: { massive: 'adobe', share: 0.2 },
    terrains: [['oak savanna', 2], ['slough channel', 1], ['foothill outcrops', 1], ['golden grassland', 3], ['foothill diggings', 0.6], ['wheat ranch', 2.5], ['river bottom', 2.5], ['valley road', 2.5]],
  }),
  // Note: EPA Level III Sierra Nevada and Cascades; ponderosa, fir and incense cedar on granite, clear creeks, Koppen Csb and Dsb.
  'sierra-cascades': look('sierra-cascades', 'Sierra Nevada and Cascades', 'EPA Level III Sierra Nevada and Cascades; Koppen Csb and Dsb.', {
    ground: ground(SOIL.grey, { cover: 0.3, grass: GRASS.dry, pebbles: 1.4, ripples: false }),
    trees: [['ponderosa', 0.45], ['fir', 0.3], ['oak', 0.15], ['pine', 0.1]], riverTrees: [['fir', 0.3], ['aspen', 0.25], ['willow', 0.25], ['cottonwood', 0.2]],
    spiny: [['deadfall', 0.45], ['bramble', 0.55]], scrub: [['litter', 0.4], ['shrub', 0.3], ['fern', 0.15], ['bunch', 0.15]],
    rock: 'granite', bank: 'grey', creek: true, pools: 0.14, density: { tree: 6, spiny: 1.1, scrub: 0.9, grass: 0.7, rock: 1.4, cluster: 1.5 }, building: { massive: 'log', share: 0.5 },
    noPieces: ADOBE_RUINS,
    terrains: [['open pine forest', 3], ['dry creek', 1.5], ['granite ridge', 2.5], ['mountain meadow', 1], ['mining camp', 3], ['mountain ranch', 0.8], ['mountain stream', 2], ['mountain road', 2]],
  }),
  // Note: EPA Level III Coast Range and Central California Foothills and Coastal Mountains; chaparral, live oak and redwood, Koppen Csb.
  'california-coast': look('california-coast', 'California coast and coast ranges', 'EPA Level III Coast Range and Central California Foothills and Coastal Mountains; Koppen Csb.', {
    ground: ground(SOIL.clay, { cover: 0.2, grass: GRASS.gold, pebbles: 0.6 }),
    trees: [['liveoak', 0.45], ['oak', 0.35], ['fir', 0.2]], riverTrees: [['willow', 0.4], ['cottonwood', 0.3], ['liveoak', 0.3]],
    spiny: [['bramble', 0.55], ['yucca', 0.25], ['pricklypear', 0.2]], scrub: [['shrub', 0.4], ['sagebrush', 0.2], ['bunch', 0.2], ['flower', 0.2]],
    rock: 'sandstone', bank: 'red', creek: true, pools: 0.1, density: { tree: 1.5, spiny: 0.8, scrub: 1.1, grass: 1.1, rock: 1 }, building: { massive: 'adobe', share: 0.45 },
    terrains: [['chaparral', 2.5], ['dry creek', 1.5], ['coastal hills', 2], ['coastal grassland', 2.5], ['mining camp', 0.5], ['rancho', 2.5], ['creek bank', 1.5], ['coast road', 2]],
  }),
  // Note: EPA Level III Sonoran Basin and Range; saguaro, ocotillo, palo verde and mesquite, Koppen BWh; Tucson sits here.
  'sonoran-desert': look('sonoran-desert', 'Sonoran Desert', 'EPA Level III Sonoran Basin and Range; Koppen BWh.', {
    ground: ground(SOIL.sand, { grass: GRASS.dry, pebbles: 1 }),
    trees: [['mesquite', 1]], riverTrees: [['cottonwood', 0.6], ['mesquite', 0.4]],
    spiny: [['saguaro', 0.3], ['cholla', 0.22], ['pricklypear', 0.18], ['ocotillo', 0.15], ['barrel', 0.1], ['agave', 0.05]], scrub: [['creosote', 0.6], ['grama', 0.15], ['sticks', 0.25]],
    rock: 'redrock', density: { tree: 0.8, spiny: 1.5, scrub: 1.1, grass: 0.4, rock: 1 }, building: { massive: 'adobe', share: 0.75 },
    terrains: [['desert scrub', 3], ['dry wash', 2.5], ['rocky hills', 2], ['desert grassland', 0.8], ['mining camp', 1.5], ['ranch', 1], ['riverbank', 0.8], ['stage road', 2]],
  }),
  // Note: EPA Level III Mojave Basin and Range; creosote, Joshua tree, yucca and cholla on pale ground over dark volcanic rock, Koppen BWh and BWk.
  'mojave-desert': look('mojave-desert', 'Mojave Desert', 'EPA Level III Mojave Basin and Range; Koppen BWh and BWk.', {
    ground: ground(SOIL.pale, { grass: GRASS.dry, pebbles: 1.3 }),
    trees: [['juniper', 0.5], ['mesquite', 0.5]], riverTrees: [['cottonwood', 0.5], ['willow', 0.3], ['mesquite', 0.2]],
    spiny: [['joshua', 0.3], ['yucca', 0.2], ['cholla', 0.2], ['barrel', 0.12], ['pricklypear', 0.1], ['agave', 0.08]], scrub: [['creosote', 0.6], ['sagebrush', 0.15], ['sticks', 0.25]],
    rock: 'basalt', density: { tree: 0.4, spiny: 1.5, scrub: 1.1, grass: 0.25, rock: 1.2 }, pools: 0, building: { massive: 'adobe', share: 0.3 },
    terrains: [['creosote flat', 3], ['dry wash', 2.5], ['volcanic hills', 2.5], ['sparse grass', 0.3], ['mining camp', 2.5], ['desert ranch', 0.3], ['spring and creek', 0.3], ['freight road', 1.5]],
  }),
  // Note: EPA Level III Coast Range, Puget Lowland and Cascades; Douglas fir, hemlock and cedar over ferns, Koppen Cfb and Csb.
  'northwest-forest': look('northwest-forest', 'Pacific Northwest forest', 'EPA Level III Coast Range, Puget Lowland and Cascades; Koppen Cfb and Csb.', {
    ground: ground(SOIL.forest, { cover: 0.34, grass: GRASS.lush, pebbles: 0.8, ripples: false }),
    trees: [['fir', 0.6], ['spruce', 0.2], ['cypress', 0.1], ['hardwood', 0.1]], riverTrees: [['willow', 0.35], ['cottonwood', 0.35], ['fir', 0.3]],
    spiny: [['deadfall', 0.65], ['bramble', 0.35]], scrub: [['fern', 0.5], ['litter', 0.2], ['shrub', 0.3]],
    rock: 'basalt', bank: 'dark', water: 'green', creek: true, pools: 0.2, density: { tree: 11, spiny: 1.2, scrub: 1, grass: 0.5, rock: 0.8, cluster: 1.8 }, building: { massive: 'log', share: 0.35 },
    noPieces: ADOBE_RUINS,
    terrains: [['forest', 4], ['creek ravine', 1.5], ['rocky ridge', 1.5], ['forest meadow', 0.6], ['mining camp', 0.7], ['homestead clearing', 1], ['river bank', 3], ['logging road', 2]],
  }),
  // Note: EPA Level III Northern Rockies; lodgepole, Douglas fir and spruce with aspen groves and sage parks, Koppen Dfb and Dfc.
  'northern-rockies': look('northern-rockies', 'Northern Rockies', 'EPA Level III Northern Rockies; Koppen Dfb and Dfc.', {
    ground: ground(SOIL.grey, { cover: 0.24, grass: GRASS.blue, pebbles: 1.3, ripples: false }),
    trees: [['pine', 0.28], ['fir', 0.27], ['spruce', 0.25], ['aspen', 0.2]], riverTrees: [['cottonwood', 0.4], ['aspen', 0.3], ['spruce', 0.3]],
    spiny: [['deadfall', 0.4], ['bramble', 0.3], ['sage', 0.3]], scrub: [['sagebrush', 0.3], ['bunch', 0.3], ['litter', 0.2], ['flower', 0.2]],
    rock: 'granite', bank: 'grey', creek: true, pools: 0.12, density: { tree: 5, spiny: 1.1, scrub: 0.9, grass: 0.9, rock: 1.3, cluster: 1.5 }, building: { massive: 'log', share: 0.55 },
    noPieces: ADOBE_RUINS,
    terrains: [['conifer parkland', 3], ['dry gulch', 1.5], ['granite slopes', 2.5], ['mountain park', 1.5], ['mining camp', 2.5], ['mountain ranch', 1], ['mountain river', 2], ['mountain road', 1.5]],
  }),
  // Note: EPA Level III Southern Rockies; ponderosa, pinyon and juniper foothills, aspen and spruce-fir higher up, Koppen Dfb and Dfc.
  'rocky-mountains': look('rocky-mountains', 'Central and southern Rockies', 'EPA Level III Southern Rockies; Koppen Dfb and Dfc.', {
    ground: ground(SOIL.grey, { cover: 0.16, grass: GRASS.dry, pebbles: 1.4, ripples: false }),
    trees: [['ponderosa', 0.3], ['pinyon', 0.2], ['juniper', 0.15], ['aspen', 0.15], ['spruce', 0.2]], riverTrees: [['cottonwood', 0.4], ['aspen', 0.3], ['spruce', 0.3]],
    spiny: [['yucca', 0.25], ['deadfall', 0.25], ['sage', 0.25], ['bramble', 0.25]], scrub: [['bunch', 0.3], ['sagebrush', 0.25], ['litter', 0.2], ['flower', 0.15], ['shrub', 0.1]],
    rock: 'granite', bank: 'grey', creek: true, pools: 0.1, density: { tree: 2.2, spiny: 1, scrub: 1, grass: 0.8, rock: 1.4, cluster: 1.2 }, building: { massive: 'log', share: 0.45 },
    noPieces: ADOBE_RUINS,
    terrains: [['foothill woodland', 3], ['dry gulch', 2], ['rocky hills', 3], ['mountain park', 1.5], ['mining camp', 3], ['mountain ranch', 1.2], ['mountain stream', 1.5], ['mountain road', 1.5]],
  }),
  // Note: EPA Level III Colorado Plateaus; pinyon-juniper and sage over red sandstone, Koppen BSk.
  'colorado-plateau': look('colorado-plateau', 'Colorado Plateau', 'EPA Level III Colorado Plateaus; Koppen BSk.', {
    ground: ground(SOIL.red, { grass: GRASS.dry, pebbles: 1.3 }),
    trees: [['pinyon', 0.45], ['juniper', 0.45], ['brush', 0.1]], riverTrees: [['cottonwood', 0.7], ['willow', 0.3]],
    spiny: [['yucca', 0.4], ['pricklypear', 0.3], ['sage', 0.2], ['cholla', 0.1]], scrub: [['sagebrush', 0.4], ['bunch', 0.3], ['sticks', 0.3]],
    rock: 'redrock', bank: 'red', creek: false, density: { tree: 1.3, spiny: 1, scrub: 1.1, grass: 0.5, rock: 1.8 }, building: { massive: 'adobe', share: 0.35 },
    terrains: [['pinyon-juniper flat', 3], ['dry wash', 3], ['sandstone mesas', 3], ['sage grassland', 1], ['mining camp', 1], ['ranch', 0.8], ['river bottom', 1], ['stage road', 1.5]],
  }),
  // Note: EPA Level III Central Basin and Range; big sagebrush, greasewood and Utah juniper on grey alkali soil, Koppen BSk.
  'great-basin': look('great-basin', 'Great Basin', 'EPA Level III Central Basin and Range; Koppen BSk.', {
    ground: ground(SOIL.grey, { grass: GRASS.blue, pebbles: 1, cover: 0.06 }),
    trees: [['juniper', 0.45], ['brush', 0.35], ['pinyon', 0.2]], riverTrees: [['cottonwood', 0.5], ['willow', 0.5]],
    spiny: [['sage', 0.6], ['yucca', 0.1], ['pricklypear', 0.1], ['cholla', 0.1], ['bramble', 0.1]], scrub: [['sagebrush', 0.5], ['bunch', 0.35], ['sticks', 0.15]],
    rock: 'granite', density: { tree: 0.8, spiny: 1.2, scrub: 1.3, grass: 0.6, rock: 1 }, building: { massive: 'adobe', share: 0.3 },
    terrains: [['sagebrush flat', 3.5], ['dry wash', 2], ['range foothills', 2], ['bunchgrass flat', 1.5], ['mining camp', 3], ['ranch', 1], ['creek bottom', 0.8], ['stage road', 2]],
  }),
  // Note: EPA Level III Columbia Plateau; bluebunch wheatgrass steppe, sage and basalt scabland, Koppen BSk.
  'columbia-plateau': look('columbia-plateau', 'Columbia and Snake plateau', 'EPA Level III Columbia Plateau; Koppen BSk.', {
    ground: ground(SOIL.steppe, { grass: GRASS.blue, pebbles: 1.2, cover: 0.14 }),
    trees: [['juniper', 0.4], ['ponderosa', 0.3], ['brush', 0.3]], riverTrees: [['cottonwood', 0.6], ['willow', 0.4]],
    spiny: [['sage', 0.6], ['pricklypear', 0.3], ['bramble', 0.1]], scrub: [['bunch', 0.5], ['sagebrush', 0.35], ['sticks', 0.15]],
    rock: 'basalt', bank: 'grey', creek: true, pools: 0.06, density: { tree: 0.7, spiny: 1, scrub: 1.1, grass: 1.3, rock: 1.3 }, building: { massive: 'log', share: 0.2 },
    noPieces: ADOBE_RUINS,
    terrains: [['sagebrush steppe', 2], ['coulee', 1.5], ['basalt scabland', 2], ['bunchgrass prairie', 3], ['mining camp', 0.5], ['ranch', 3], ['river canyon', 1.5], ['wagon road', 2]],
  }),
  // Note: EPA Level III Chihuahuan Deserts; creosote, tarbush, lechuguilla, yucca and desert grassland, Koppen BWh and BSk.
  'chihuahuan-desert': look('chihuahuan-desert', 'Chihuahuan Desert', 'EPA Level III Chihuahuan Deserts; Koppen BWh and BSk.', {
    ground: ground(SOIL.pale, { grass: GRASS.dry, pebbles: 1.1 }),
    trees: [['mesquite', 0.85], ['juniper', 0.15]], riverTrees: [['cottonwood', 0.6], ['mesquite', 0.4]],
    spiny: [['yucca', 0.25], ['agave', 0.25], ['ocotillo', 0.15], ['cholla', 0.15], ['pricklypear', 0.2]], scrub: [['creosote', 0.5], ['grama', 0.25], ['sticks', 0.25]],
    rock: 'limestone', density: { tree: 0.7, spiny: 1.4, scrub: 1.1, grass: 0.7, rock: 1.1 }, building: { massive: 'adobe', share: 0.8 },
    terrains: [['creosote flat', 2.5], ['arroyo', 2.5], ['limestone hills', 2.5], ['desert grassland', 2], ['mining camp', 1.5], ['ranch', 1.5], ['river bottom', 0.7], ['stage road', 2]],
  }),
  // Note: EPA Level III Western Gulf Coastal Plain and Southern Coastal Plain; live oak with moss, pine, palmetto and marsh, Koppen Cfa.
  'gulf-coast': look('gulf-coast', 'Gulf coast', 'EPA Level III Western Gulf Coastal Plain and Southern Coastal Plain; Koppen Cfa.', {
    ground: ground(SOIL.sand, { cover: 0.3, grass: GRASS.lush, pebbles: 0.4, ripples: false }),
    trees: [['liveoak', 0.4], ['pine', 0.35], ['cypress', 0.15], ['hardwood', 0.1]], riverTrees: [['cypress', 0.55], ['liveoak', 0.3], ['willow', 0.15]],
    spiny: [['palmetto', 0.5], ['bramble', 0.3], ['pricklypear', 0.2]], scrub: [['sedge', 0.3], ['tall', 0.3], ['shrub', 0.2], ['fern', 0.2]],
    rock: 'limestone', bank: 'pale', water: 'green', creek: true, pools: 0.2, density: { tree: 2.2, spiny: 1.2, scrub: 1, grass: 1.3, rock: 0.2, cluster: 1.2 }, building: { massive: 'log', share: 0.1 },
    noPieces: ADOBE_RUINS,
    terrains: [['coastal woods', 3], ['bayou creek', 2], ['shell ridge', 0.2], ['coastal prairie', 2.5], ['turpentine camp', 0.2], ['farm', 2], ['bayou bank', 4], ['shell road', 2]],
  }),
  // Note: EPA Level III Southern Texas Plains; mesquite, huisache, prickly pear and blackbrush thorn scrub, Koppen BSh.
  'south-texas-brush': look('south-texas-brush', 'South Texas brush country', 'EPA Level III Southern Texas Plains; Koppen BSh.', {
    ground: ground(SOIL.clay, { grass: GRASS.dry, pebbles: 0.8 }),
    trees: [['mesquite', 0.8], ['liveoak', 0.2]], riverTrees: [['cottonwood', 0.4], ['cypress', 0.3], ['mesquite', 0.3]],
    spiny: [['pricklypear', 0.45], ['cholla', 0.2], ['yucca', 0.15], ['agave', 0.1], ['bramble', 0.1]], scrub: [['creosote', 0.3], ['grama', 0.3], ['shrub', 0.4]],
    rock: 'limestone', density: { tree: 1.9, spiny: 1.6, scrub: 1.1, grass: 0.7, rock: 0.4, cluster: 1.2 }, building: { massive: 'adobe', share: 0.55 },
    terrains: [['thorn scrub', 4], ['arroyo', 2], ['caliche hills', 1], ['brush grassland', 2], ['quarry camp', 0.2], ['ranch', 3], ['river bottom', 1], ['stage road', 2]],
  }),
  // Note: EPA Level III Edwards Plateau; live oak and Ashe juniper over limestone, spring creeks with cypress, Koppen Cfa.
  'texas-hill-country': look('texas-hill-country', 'Texas hill country', 'EPA Level III Edwards Plateau; Koppen Cfa and BSh.', {
    ground: ground(SOIL.pale, { cover: 0.12, grass: GRASS.gold, pebbles: 1.5 }),
    trees: [['liveoak', 0.35], ['juniper', 0.35], ['mesquite', 0.15], ['oak', 0.15]], riverTrees: [['cypress', 0.45], ['hardwood', 0.3], ['cottonwood', 0.25]],
    spiny: [['pricklypear', 0.35], ['yucca', 0.2], ['bramble', 0.2], ['cholla', 0.15], ['agave', 0.1]], scrub: [['grama', 0.3], ['bunch', 0.2], ['shrub', 0.3], ['flower', 0.2]],
    rock: 'limestone', bank: 'pale', creek: true, pools: 0.12, density: { tree: 1.6, spiny: 0.9, scrub: 1, grass: 1, rock: 1.5, cluster: 1.1 }, building: { massive: 'stone', share: 0.5 },
    noPieces: ADOBE_RUINS,
    terrains: [['live oak savanna', 2.5], ['dry creek', 2], ['limestone hills', 3], ['grassland', 2.5], ['quarry camp', 0.3], ['ranch', 2.5], ['spring creek', 3], ['stage road', 2]],
  }),
  // Note: EPA Level III Mississippi Alluvial Plain; bottomland hardwood, cypress and cane on dark flooded soil, Koppen Cfa.
  'mississippi-bottoms': look('mississippi-bottoms', 'Mississippi bottomlands', 'EPA Level III Mississippi Alluvial Plain; Koppen Cfa.', {
    ground: ground(SOIL.loam, { cover: 0.36, grass: GRASS.lush, pebbles: 0.2 }),
    trees: [['hardwood', 0.4], ['cottonwood', 0.25], ['cypress', 0.2], ['willow', 0.15]], riverTrees: [['cypress', 0.4], ['willow', 0.3], ['cottonwood', 0.3]],
    spiny: [['bramble', 0.6], ['palmetto', 0.2], ['deadfall', 0.2]], scrub: [['sedge', 0.3], ['tall', 0.3], ['fern', 0.2], ['shrub', 0.2]],
    rock: 'limestone', bank: 'dark', water: 'brown', creek: true, pools: 0.28, density: { tree: 6, spiny: 1.3, scrub: 1, grass: 1.3, rock: 0.1, cluster: 1.5 }, building: { massive: 'log', share: 0.15 },
    noPieces: ADOBE_RUINS,
    terrains: [['bottomland woods', 3], ['bayou', 1.2], ['river bluff', 0.2], ['cleared field', 1.5], ['logging camp', 0.4], ['farm', 2], ['river bank', 5], ['levee road', 2.5]],
  }),
  // Note: EPA Level III Ozark Highlands and Boston Mountains; oak-hickory and shortleaf pine over limestone and chert, Koppen Cfa and Dfa.
  ozarks: look('ozarks', 'Ozarks and Ouachitas', 'EPA Level III Ozark Highlands and Boston Mountains; Koppen Cfa.', {
    ground: ground(SOIL.clay, { cover: 0.26, grass: GRASS.lush, pebbles: 1.4, ripples: false }),
    trees: [['hardwood', 0.45], ['oak', 0.25], ['pine', 0.2], ['juniper', 0.1]], riverTrees: [['hardwood', 0.4], ['willow', 0.3], ['cottonwood', 0.3]],
    spiny: [['bramble', 0.5], ['deadfall', 0.3], ['pricklypear', 0.2]], scrub: [['shrub', 0.3], ['tall', 0.2], ['fern', 0.2], ['litter', 0.2], ['flower', 0.1]],
    rock: 'limestone', bank: 'pale', creek: true, pools: 0.14, density: { tree: 5, spiny: 1.1, scrub: 1, grass: 1, rock: 1.1, cluster: 1.4 }, building: { massive: 'log', share: 0.4 },
    noPieces: ADOBE_RUINS,
    terrains: [['oak-hickory woods', 3], ['dry hollow', 1.5], ['limestone bluffs', 3], ['glade', 1], ['lead mining camp', 1.5], ['hill farm', 2], ['creek bank', 3], ['hill road', 1.5]],
  }),
  // Note: EPA Level III Northern Lakes and Forests; spruce, pine, aspen and birch around lakes and bogs, Koppen Dfb.
  'north-woods': look('north-woods', 'Northern Minnesota woods', 'EPA Level III Northern Lakes and Forests; Koppen Dfb.', {
    ground: ground(SOIL.forest, { cover: 0.3, grass: GRASS.lush, pebbles: 0.9, ripples: false }),
    trees: [['spruce', 0.3], ['pine', 0.25], ['aspen', 0.25], ['fir', 0.1], ['hardwood', 0.1]], riverTrees: [['spruce', 0.35], ['aspen', 0.35], ['willow', 0.3]],
    spiny: [['deadfall', 0.65], ['bramble', 0.35]], scrub: [['fern', 0.3], ['litter', 0.3], ['sedge', 0.2], ['shrub', 0.2]],
    rock: 'granite', bank: 'dark', water: 'green', lake: true, creek: true, pools: 0.2, density: { tree: 8, spiny: 1, scrub: 1, grass: 0.6, rock: 0.8, cluster: 1.6 }, building: { massive: 'log', share: 0.6 },
    noPieces: ADOBE_RUINS,
    terrains: [['conifer woods', 4], ['creek ravine', 0.8], ['rocky ridge', 1.5], ['forest clearing', 1], ['logging camp', 1.5], ['farm clearing', 1.5], ['lake shore', 4], ['tote road', 2]],
  }),
  // Note: EPA Level III Western Corn Belt Plains and Central Irregular Plains; tallgrass prairie with bur oak groves and cottonwood creeks, Koppen Dfa.
  prairie: look('prairie', 'Tallgrass prairie and river hills', 'EPA Level III Western Corn Belt Plains and Central Irregular Plains; Koppen Dfa.', {
    ground: ground(SOIL.loam, { cover: 0.4, grass: GRASS.lush, pebbles: 0.3, ripples: false }),
    trees: [['oak', 0.5], ['cottonwood', 0.3], ['hardwood', 0.2]], riverTrees: [['cottonwood', 0.5], ['willow', 0.3], ['oak', 0.2]],
    spiny: [['bramble', 0.7], ['deadfall', 0.3]], scrub: [['tall', 0.5], ['flower', 0.2], ['bunch', 0.1], ['shrub', 0.2]],
    rock: 'granite', bank: 'dark', water: 'brown', creek: true, pools: 0.12, density: { tree: 0.6, spiny: 0.8, scrub: 1.1, grass: 1.7, rock: 0.25 }, building: { massive: 'sod', share: 0.25 },
    noPieces: ADOBE_RUINS,
    terrains: [['prairie grove', 1], ['dry draw', 0.6], ['river bluffs', 0.5], ['tallgrass prairie', 3.5], ['coal camp', 0.4], ['farm', 4], ['creek bank', 3], ['section road', 3]],
  }),
  // Note: EPA Level III South Central Plains; loblolly, shortleaf and longleaf pine on sandy clay with hardwood bottoms, Koppen Cfa.
  'piney-woods': look('piney-woods', 'Piney woods', 'EPA Level III South Central Plains; Koppen Cfa.', {
    ground: ground(SOIL.clay, { cover: 0.28, grass: GRASS.lush, pebbles: 0.5, ripples: false }),
    trees: [['pine', 0.65], ['hardwood', 0.2], ['oak', 0.15]], riverTrees: [['cypress', 0.3], ['hardwood', 0.3], ['pine', 0.2], ['willow', 0.2]],
    spiny: [['palmetto', 0.35], ['bramble', 0.35], ['deadfall', 0.3]], scrub: [['litter', 0.45], ['shrub', 0.25], ['tall', 0.15], ['fern', 0.15]],
    rock: 'sandstone', bank: 'red', water: 'brown', creek: true, pools: 0.16, density: { tree: 7, spiny: 1.2, scrub: 1, grass: 0.8, rock: 0.15, cluster: 1.5 }, building: { massive: 'log', share: 0.4 },
    noPieces: ADOBE_RUINS,
    terrains: [['pine woods', 4], ['creek branch', 1.5], ['sandstone ridge', 0.4], ['forest clearing', 1.5], ['sawmill camp', 1.5], ['farm', 2], ['creek bank', 3], ['logging road', 2]],
  }),
  // Note: EPA Level III Cross Timbers; post oak and blackjack oak woods in tallgrass prairie, mesquite to the west, Koppen Cfa.
  'cross-timbers': look('cross-timbers', 'Cross Timbers and rolling plains', 'EPA Level III Cross Timbers; Koppen Cfa.', {
    ground: ground(SOIL.clay, { cover: 0.14, grass: GRASS.gold, pebbles: 0.8 }),
    trees: [['oak', 0.55], ['mesquite', 0.25], ['juniper', 0.1], ['hardwood', 0.1]], riverTrees: [['cottonwood', 0.5], ['oak', 0.3], ['willow', 0.2]],
    spiny: [['pricklypear', 0.4], ['bramble', 0.3], ['yucca', 0.15], ['cholla', 0.15]], scrub: [['tall', 0.3], ['grama', 0.2], ['bunch', 0.2], ['shrub', 0.3]],
    rock: 'sandstone', bank: 'red', creek: true, pools: 0.06, density: { tree: 1.5, spiny: 0.9, scrub: 1, grass: 1.1, rock: 0.5 }, building: { massive: 'stone', share: 0.2 },
    noPieces: ADOBE_RUINS,
    terrains: [['post oak timber', 3], ['dry draw', 1.5], ['sandstone hills', 1.5], ['prairie', 3], ['coal camp', 0.4], ['ranch', 3], ['creek bottom', 2], ['stage road', 2.5]],
  }),
  // Note: EPA Level III High Plains; shortgrass steppe with yucca and prickly pear, cottonwood only on creeks, Koppen BSk.
  'high-plains': look('high-plains', 'High Plains', 'EPA Level III High Plains; Koppen BSk.', {
    ground: ground(SOIL.steppe, { cover: 0.12, grass: GRASS.gold, pebbles: 0.7 }),
    trees: [['cottonwood', 0.6], ['juniper', 0.25], ['brush', 0.15]], riverTrees: [['cottonwood', 0.7], ['willow', 0.3]],
    spiny: [['yucca', 0.35], ['pricklypear', 0.35], ['sage', 0.2], ['cholla', 0.1]], scrub: [['grama', 0.5], ['bunch', 0.3], ['sagebrush', 0.1], ['sticks', 0.1]],
    rock: 'sandstone', creek: true, pools: 0.05, density: { tree: 0.35, spiny: 0.9, scrub: 1, grass: 1.1, rock: 0.35 }, building: { massive: 'sod', share: 0.4 },
    noPieces: ADOBE_RUINS,
    terrains: [['shortgrass flat', 1.5], ['draw', 2], ['caprock breaks', 1.5], ['shortgrass prairie', 4], ['mining camp', 0.2], ['ranch', 3], ['creek bottom', 1], ['trail road', 3]],
  }),
  // Note: EPA Level III Northwestern Great Plains and Northwestern Glaciated Plains; mixed-grass prairie, sage, badlands and pine buttes, Koppen BSk and Dfb.
  'northern-plains': look('northern-plains', 'Northern Plains', 'EPA Level III Northwestern Great Plains and Northwestern Glaciated Plains; Koppen BSk and Dfb.', {
    ground: ground(SOIL.pale, { cover: 0.16, grass: GRASS.gold, pebbles: 1 }),
    trees: [['pine', 0.3], ['juniper', 0.3], ['cottonwood', 0.4]], riverTrees: [['cottonwood', 0.6], ['willow', 0.25], ['oak', 0.15]],
    spiny: [['sage', 0.4], ['yucca', 0.3], ['pricklypear', 0.2], ['bramble', 0.1]], scrub: [['bunch', 0.4], ['sagebrush', 0.3], ['grama', 0.2], ['sticks', 0.1]],
    rock: 'sandstone', bank: 'pale', water: 'brown', creek: true, pools: 0.06, density: { tree: 0.4, spiny: 0.9, scrub: 1, grass: 1.2, rock: 1.2 }, building: { massive: 'sod', share: 0.4 },
    noPieces: ADOBE_RUINS,
    terrains: [['sage flat', 1.5], ['dry coulee', 2], ['badlands', 3], ['mixed-grass prairie', 3], ['mining camp', 1.5], ['ranch', 2.5], ['river bottom', 1.5], ['stage road', 2.5]],
  }),
};

// Note: sky-islands is the Cochise look itself; it needs no table.
const ALIASES = { 'sky-islands': BASE_LOOK };

// Note: null, undefined and an unknown id return the base Cochise look.
export function regionalLook(id) {
  return (id != null && (REGION_LOOKS[id] || ALIASES[id])) || BASE_LOOK;
}

// Note: the non-base look of a map, or null when the map carries no region or the base look, so the base painters run.
export function lookOfMap(map) {
  const l = map && map.region ? regionalLook(map.region) : null;
  return l && !l.base ? l : null;
}

const pickWeighted = (list, u) => {
  let total = 0;
  for (const [, w] of list) total += w;
  let acc = 0;
  for (const [kind, w] of list) {
    acc += w / total;
    if (u < acc) return kind;
  }
  return list[list.length - 1][0];
};

// Note: the plant kind of one cell by role (tree, spiny or scrub); the painters and the tests both read it, so counts match the picture.
export function floraKind(look, role, x, y, terrain) {
  const l = look || BASE_LOOK;
  if (role === 'tree') {
    const wet = terrain === 'riverbank' || (terrain === 'wash' && l.creek);
    return pickWeighted(wet ? l.riverTrees : l.trees, hh(x, y, 971));
  }
  if (role === 'spiny') return pickWeighted(l.spiny, l.base ? hh(x, y, 77) : hh(x, y, 977));
  return pickWeighted(l.scrub, l.base ? hh(x, y, 335) : hh(x, y, 983));
}

// Note: the table label of a terrain in a region, such as sagebrush flat for desert-scrub in the Great Basin.
export function terrainLabel(terrain, region) {
  const l = regionalLook(region);
  return (l.terrains[terrain] || BASE_LOOK.terrains[terrain] || { label: terrain }).label;
}

// Note: the terrain draw weights of a region in TERRAIN_IDS order; null for the base look, which draws uniformly.
export function terrainWeights(look) {
  return look.base ? null : TERRAIN_IDS.map((id) => look.terrains[id].w);
}

const NEED_ROLE = (d) => ({ [T.MESQUITE]: d.tree, [T.CACTUS]: d.spiny, [T.SCRUB]: d.scrub, [T.GRASS]: d.grass, [T.ROCK]: d.rock });

// Note: the base look returns the need table entry itself, other looks scale plant and rock minimums by density.
export function regionalNeed(terrain, look, baseNeed) {
  if (look.base || !baseNeed) return baseNeed;
  const mult = NEED_ROLE(look.density);
  const out = {};
  for (const [tile, min] of Object.entries(baseNeed)) {
    const m = mult[tile];
    const scaled = m === undefined || m >= 1 ? min : Math.floor(min * m * 0.7);
    if (scaled > 0) out[tile] = scaled;
  }
  // Note: a region with no spiny plants or scrub kind in the mix drops that need; trees stay needed so a woodland holds trees.
  if (!look.spiny.length) delete out[T.CACTUS];
  if (terrain === 'ranch') {
    delete out[T.ADOBE];
    out.walls = 12;
  }
  return out;
}
