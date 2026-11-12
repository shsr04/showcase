// Note: how each REGIONS entry of world-data.js shapes generated routes and sites; terrain ids are the eight of world.js and every number is a plausible guess, not a measurement.
// Note: mix is the share of off-road ground by terrain; danger is a base for route danger (0..1); spring is the typical km between springs or river crossings; the regional terrain pass can retune this table alone.

export const REGION_PROFILE = {
  'sky-islands': { mix: [['desert-scrub', 0.3], ['grassland', 0.3], ['rocky-hills', 0.25], ['wash', 0.15]], danger: 0.2, spring: 45 },
  'central-valley': { mix: [['grassland', 0.35], ['ranch', 0.3], ['riverbank', 0.2], ['desert-scrub', 0.15]], danger: 0.08, spring: 20 },
  'sierra-cascades': { mix: [['rocky-hills', 0.5], ['mining-camp', 0.2], ['riverbank', 0.2], ['grassland', 0.1]], danger: 0.12, spring: 15 },
  'california-coast': { mix: [['grassland', 0.35], ['ranch', 0.25], ['rocky-hills', 0.25], ['riverbank', 0.15]], danger: 0.06, spring: 18 },
  'sonoran-desert': { mix: [['desert-scrub', 0.55], ['wash', 0.25], ['rocky-hills', 0.1], ['riverbank', 0.1]], danger: 0.18, spring: 70 },
  'mojave-desert': { mix: [['desert-scrub', 0.55], ['wash', 0.2], ['rocky-hills', 0.25]], danger: 0.18, spring: 80 },
  'northwest-forest': { mix: [['riverbank', 0.3], ['rocky-hills', 0.25], ['ranch', 0.2], ['grassland', 0.25]], danger: 0.07, spring: 12 },
  'northern-rockies': { mix: [['rocky-hills', 0.45], ['grassland', 0.25], ['riverbank', 0.2], ['mining-camp', 0.1]], danger: 0.16, spring: 20 },
  'rocky-mountains': { mix: [['rocky-hills', 0.45], ['mining-camp', 0.2], ['grassland', 0.2], ['riverbank', 0.15]], danger: 0.15, spring: 20 },
  'colorado-plateau': { mix: [['desert-scrub', 0.4], ['rocky-hills', 0.3], ['wash', 0.2], ['grassland', 0.1]], danger: 0.15, spring: 60 },
  'great-basin': { mix: [['desert-scrub', 0.45], ['grassland', 0.2], ['rocky-hills', 0.2], ['wash', 0.15]], danger: 0.15, spring: 65 },
  'columbia-plateau': { mix: [['grassland', 0.45], ['desert-scrub', 0.2], ['rocky-hills', 0.15], ['riverbank', 0.1], ['ranch', 0.1]], danger: 0.1, spring: 35 },
  'chihuahuan-desert': { mix: [['desert-scrub', 0.5], ['grassland', 0.2], ['wash', 0.2], ['rocky-hills', 0.1]], danger: 0.22, spring: 70 },
  'gulf-coast': { mix: [['riverbank', 0.4], ['grassland', 0.3], ['ranch', 0.3]], danger: 0.06, spring: 8 },
  'south-texas-brush': { mix: [['desert-scrub', 0.5], ['ranch', 0.25], ['grassland', 0.15], ['wash', 0.1]], danger: 0.14, spring: 50 },
  'texas-hill-country': { mix: [['rocky-hills', 0.3], ['grassland', 0.3], ['ranch', 0.25], ['riverbank', 0.15]], danger: 0.09, spring: 20 },
  'mississippi-bottoms': { mix: [['riverbank', 0.5], ['grassland', 0.2], ['ranch', 0.3]], danger: 0.05, spring: 6 },
  ozarks: { mix: [['rocky-hills', 0.35], ['riverbank', 0.25], ['ranch', 0.25], ['grassland', 0.15]], danger: 0.07, spring: 10 },
  'north-woods': { mix: [['riverbank', 0.35], ['rocky-hills', 0.2], ['grassland', 0.25], ['ranch', 0.2]], danger: 0.06, spring: 8 },
  prairie: { mix: [['grassland', 0.55], ['ranch', 0.25], ['riverbank', 0.2]], danger: 0.05, spring: 15 },
  'piney-woods': { mix: [['riverbank', 0.3], ['ranch', 0.3], ['grassland', 0.25], ['rocky-hills', 0.15]], danger: 0.06, spring: 10 },
  'cross-timbers': { mix: [['grassland', 0.4], ['ranch', 0.3], ['riverbank', 0.15], ['rocky-hills', 0.15]], danger: 0.08, spring: 20 },
  'high-plains': { mix: [['grassland', 0.6], ['ranch', 0.2], ['wash', 0.1], ['riverbank', 0.1]], danger: 0.12, spring: 35 },
  'northern-plains': { mix: [['grassland', 0.55], ['rocky-hills', 0.15], ['riverbank', 0.15], ['ranch', 0.15]], danger: 0.14, spring: 30 },
};

// Note: the label of an outdoor site by terrain; town is the word used for the settlement.
export const SITE_LABEL = {
  'stage-road': (town) => `the road out of ${town}`,
  grassland: (town) => `the grass flats outside ${town}`,
  'desert-scrub': (town) => `the scrub beyond ${town}`,
  wash: (town) => `a dry wash near ${town}`,
  'rocky-hills': (town) => `the rocks above ${town}`,
  riverbank: (town) => `the river bottom below ${town}`,
  'mining-camp': (town) => `a diggings above ${town}`,
  ranch: (town) => `a ranch near ${town}`,
};
