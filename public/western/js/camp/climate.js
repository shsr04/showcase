// Note: per-region climate for the REGIONS of world-data.js: monthly highs, lows and wet-day chances in degrees Fahrenheit.
// Note: each table is recalled from memory as the typical figures of the stations or places named in the comment above it, not read from a source and not 1881 records, so it is a plausible shape and no more.

import { unit } from '../rand.js';

export const WEATHER = {
  clear: { label: 'clear', speed: 1, water: 1, fatigue: 1 },
  hot: { label: 'hot and still', speed: 0.9, water: 1.5, fatigue: 1.3 },
  windy: { label: 'windy and dusty', speed: 0.95, water: 1.1, fatigue: 1.1 },
  storm: { label: 'thunderstorms', speed: 0.75, water: 0.8, fatigue: 1.2 },
  cold: { label: 'cold', speed: 0.95, water: 0.8, fatigue: 1.1 },
  rain: { label: 'rain', speed: 0.85, water: 0.7, fatigue: 1.15 },
  snow: { label: 'snow', speed: 0.65, water: 0.8, fatigue: 1.4 },
};

// Note: legacy gives the sky islands their own weather rules; humid lowers the heat threshold; wind is the spring chance of a windy day.
export const REGION_CLIMATE = {
  // Note: the sky islands, hand-made for Tombstone at about 4,500 ft.
  'sky-islands': {
    legacy: true, humid: false, wind: 0.3,
    hi: [59, 62, 67, 75, 84, 93, 90, 88, 86, 78, 67, 60],
    lo: [33, 36, 40, 47, 55, 63, 65, 64, 59, 50, 40, 34],
    rain: [0.08, 0.08, 0.07, 0.04, 0.03, 0.04, 0.34, 0.38, 0.2, 0.07, 0.05, 0.08],
  },
  // Note: Sacramento and Fresno, hot dry summers and mild wet winters.
  'central-valley': {
    hi: [54, 61, 67, 74, 82, 90, 96, 95, 89, 79, 64, 54],
    lo: [38, 41, 44, 47, 53, 58, 61, 60, 57, 50, 42, 37],
    rain: [0.28, 0.25, 0.22, 0.13, 0.07, 0.02, 0, 0.01, 0.03, 0.09, 0.19, 0.27],
  },
  // Note: Sierra foothills and passes near 4,000 ft, deep winter snow.
  'sierra-cascades': {
    hi: [40, 43, 48, 55, 64, 73, 82, 81, 73, 62, 48, 40],
    lo: [18, 19, 23, 27, 33, 40, 45, 43, 37, 30, 23, 18],
    rain: [0.3, 0.28, 0.27, 0.2, 0.15, 0.08, 0.03, 0.03, 0.07, 0.14, 0.25, 0.3],
  },
  // Note: San Francisco and Monterey, cool and foggy, rain in winter only.
  'california-coast': {
    hi: [57, 60, 62, 64, 66, 69, 70, 71, 73, 70, 63, 57],
    lo: [46, 48, 48, 49, 51, 53, 54, 55, 55, 53, 50, 46],
    rain: [0.25, 0.23, 0.22, 0.13, 0.07, 0.03, 0.01, 0.01, 0.03, 0.09, 0.17, 0.24],
  },
  // Note: Tucson and Yuma, very hot summers and rain twice a year, in the July monsoon and in winter.
  'sonoran-desert': {
    wind: 0.3,
    hi: [64, 67, 72, 80, 88, 98, 99, 96, 94, 84, 72, 65],
    lo: [38, 40, 44, 50, 58, 67, 74, 72, 66, 55, 43, 38],
    rain: [0.09, 0.09, 0.08, 0.04, 0.02, 0.03, 0.3, 0.34, 0.16, 0.08, 0.07, 0.1],
  },
  // Note: Las Vegas and Needles, hot and almost rainless, cold winter nights.
  'mojave-desert': {
    wind: 0.35,
    hi: [58, 63, 70, 78, 88, 99, 105, 103, 95, 82, 67, 57],
    lo: [37, 41, 47, 54, 63, 72, 79, 77, 69, 57, 44, 36],
    rain: [0.05, 0.05, 0.05, 0.03, 0.02, 0.01, 0.07, 0.1, 0.05, 0.04, 0.04, 0.05],
  },
  // Note: Portland and Seattle, mild and rainy from October to May.
  'northwest-forest': {
    hi: [46, 50, 54, 58, 65, 70, 76, 76, 71, 61, 52, 46],
    lo: [36, 37, 39, 42, 47, 52, 55, 55, 51, 45, 40, 36],
    rain: [0.5, 0.42, 0.43, 0.35, 0.27, 0.22, 0.1, 0.12, 0.2, 0.35, 0.5, 0.52],
  },
  // Note: Helena and Missoula, cold winters and short mild summers.
  'northern-rockies': {
    hi: [30, 36, 45, 56, 65, 73, 84, 82, 70, 57, 40, 30],
    lo: [12, 17, 23, 31, 39, 45, 50, 48, 39, 30, 20, 12],
    rain: [0.22, 0.2, 0.2, 0.22, 0.27, 0.28, 0.15, 0.15, 0.18, 0.17, 0.22, 0.23],
  },
  // Note: Denver and Colorado Springs, dry and sunny, snow from October to May.
  'rocky-mountains': {
    wind: 0.35,
    hi: [44, 47, 54, 63, 72, 83, 90, 87, 79, 66, 52, 44],
    lo: [17, 20, 27, 35, 45, 54, 59, 57, 48, 36, 25, 17],
    rain: [0.1, 0.12, 0.15, 0.18, 0.22, 0.18, 0.2, 0.2, 0.13, 0.1, 0.12, 0.1],
  },
  // Note: Grand Junction and Moab, dry high desert with hot summers and cold winters.
  'colorado-plateau': {
    wind: 0.35,
    hi: [38, 45, 56, 65, 75, 87, 93, 90, 81, 67, 50, 38],
    lo: [17, 23, 31, 38, 47, 56, 63, 61, 52, 40, 28, 18],
    rain: [0.15, 0.15, 0.15, 0.13, 0.12, 0.06, 0.13, 0.15, 0.11, 0.12, 0.12, 0.15],
  },
  // Note: Salt Lake City, Reno and Elko, cold dry steppe with big daily swings.
  'great-basin': {
    wind: 0.35,
    hi: [37, 43, 52, 61, 72, 83, 93, 91, 80, 66, 50, 38],
    lo: [20, 25, 31, 38, 47, 56, 66, 64, 53, 41, 30, 21],
    rain: [0.17, 0.17, 0.18, 0.18, 0.16, 0.09, 0.08, 0.1, 0.1, 0.12, 0.14, 0.17],
  },
  // Note: Spokane and Walla Walla, dry steppe, cold winters, hot dry summers.
  'columbia-plateau': {
    wind: 0.35,
    hi: [36, 42, 51, 59, 68, 75, 85, 84, 74, 60, 44, 35],
    lo: [24, 28, 32, 37, 44, 50, 55, 54, 46, 37, 31, 23],
    rain: [0.27, 0.22, 0.22, 0.18, 0.18, 0.15, 0.07, 0.08, 0.1, 0.18, 0.27, 0.3],
  },
  // Note: El Paso, hot and dry with a summer rain season.
  'chihuahuan-desert': {
    wind: 0.4,
    hi: [57, 62, 69, 78, 86, 95, 95, 93, 88, 79, 66, 58],
    lo: [30, 34, 40, 48, 56, 65, 69, 67, 61, 50, 38, 31],
    rain: [0.06, 0.06, 0.04, 0.04, 0.05, 0.1, 0.25, 0.28, 0.2, 0.12, 0.06, 0.07],
  },
  // Note: New Orleans and Galveston, hot and humid, wet all year with mild winters.
  'gulf-coast': {
    humid: true,
    hi: [62, 66, 72, 79, 86, 91, 92, 92, 88, 81, 71, 64],
    lo: [43, 46, 52, 59, 66, 72, 74, 74, 70, 60, 51, 45],
    rain: [0.35, 0.3, 0.3, 0.22, 0.28, 0.4, 0.5, 0.48, 0.38, 0.2, 0.28, 0.33],
  },
  // Note: San Antonio and Brownsville, hot and semi-arid with thorn scrub.
  'south-texas-brush': {
    humid: true,
    hi: [63, 67, 74, 81, 87, 93, 96, 97, 91, 83, 72, 64],
    lo: [42, 45, 52, 60, 67, 73, 75, 75, 70, 61, 51, 43],
    rain: [0.17, 0.17, 0.16, 0.18, 0.22, 0.18, 0.12, 0.13, 0.2, 0.18, 0.15, 0.15],
  },
  // Note: Austin and San Angelo, warm with sudden flood rains.
  'texas-hill-country': {
    hi: [62, 66, 73, 80, 86, 93, 97, 98, 91, 82, 71, 63],
    lo: [40, 43, 51, 59, 67, 73, 75, 75, 70, 60, 50, 41],
    rain: [0.2, 0.2, 0.2, 0.2, 0.25, 0.2, 0.1, 0.1, 0.18, 0.18, 0.2, 0.2],
  },
  // Note: Memphis and Vicksburg, hot humid summers and wet springs.
  'mississippi-bottoms': {
    humid: true,
    hi: [49, 54, 63, 73, 81, 89, 92, 91, 85, 75, 62, 52],
    lo: [31, 35, 43, 52, 61, 69, 73, 71, 64, 52, 42, 34],
    rain: [0.33, 0.32, 0.33, 0.3, 0.3, 0.25, 0.25, 0.22, 0.2, 0.2, 0.27, 0.32],
  },
  // Note: Springfield, Missouri, four seasons with hot humid summers.
  ozarks: {
    humid: true,
    hi: [41, 47, 57, 67, 75, 84, 89, 88, 80, 69, 55, 43],
    lo: [22, 26, 35, 44, 54, 63, 67, 66, 58, 46, 35, 25],
    rain: [0.25, 0.23, 0.28, 0.3, 0.33, 0.28, 0.22, 0.22, 0.23, 0.23, 0.25, 0.26],
  },
  // Note: Duluth and northern Wisconsin, long cold winters and cool summers.
  'north-woods': {
    hi: [20, 25, 35, 50, 62, 71, 77, 75, 66, 53, 36, 24],
    lo: [2, 5, 17, 30, 40, 49, 55, 54, 45, 35, 21, 8],
    rain: [0.3, 0.25, 0.28, 0.3, 0.33, 0.35, 0.33, 0.32, 0.33, 0.3, 0.35, 0.33],
  },
  // Note: Des Moines and Omaha, hot summers and cold winters; most of the settlements lie here.
  prairie: {
    humid: true, wind: 0.35,
    hi: [29, 34, 46, 60, 71, 81, 86, 83, 75, 62, 46, 33],
    lo: [13, 18, 28, 40, 51, 61, 66, 64, 54, 42, 30, 18],
    rain: [0.2, 0.2, 0.25, 0.27, 0.3, 0.3, 0.25, 0.25, 0.23, 0.2, 0.2, 0.2],
  },
  // Note: Shreveport and Tyler, hot humid summers and mild winters under pine.
  'piney-woods': {
    humid: true,
    hi: [56, 61, 69, 77, 84, 91, 94, 94, 88, 79, 67, 58],
    lo: [36, 39, 47, 54, 63, 70, 73, 72, 66, 55, 46, 38],
    rain: [0.28, 0.27, 0.28, 0.25, 0.28, 0.25, 0.22, 0.2, 0.2, 0.18, 0.25, 0.27],
  },
  // Note: Dallas and Fort Worth, hot summers, cool winters and rain that varies from year to year.
  'cross-timbers': {
    wind: 0.35,
    hi: [57, 61, 69, 78, 85, 93, 98, 98, 90, 80, 68, 59],
    lo: [37, 40, 49, 58, 66, 74, 78, 77, 70, 59, 48, 39],
    rain: [0.18, 0.2, 0.22, 0.25, 0.28, 0.2, 0.12, 0.13, 0.2, 0.2, 0.18, 0.18],
  },
  // Note: Amarillo and Dodge City, windy, hot summers and cold winters.
  'high-plains': {
    wind: 0.5,
    hi: [50, 54, 62, 71, 79, 88, 92, 90, 83, 73, 60, 51],
    lo: [23, 27, 34, 43, 53, 62, 67, 65, 57, 45, 33, 24],
    rain: [0.1, 0.12, 0.14, 0.15, 0.22, 0.22, 0.22, 0.24, 0.17, 0.14, 0.1, 0.1],
  },
  // Note: Bismarck and Pierre, bitter dry winters, hot summers and a little rain.
  'northern-plains': {
    wind: 0.45,
    hi: [20, 26, 38, 56, 68, 77, 85, 83, 72, 58, 38, 25],
    lo: [-2, 3, 15, 30, 41, 51, 57, 55, 43, 31, 17, 4],
    rain: [0.15, 0.15, 0.2, 0.2, 0.25, 0.28, 0.22, 0.2, 0.18, 0.15, 0.15, 0.15],
  },
};

const DEFAULT_REGION = 'sky-islands';
const climateOf = (region) => REGION_CLIMATE[region] || REGION_CLIMATE[DEFAULT_REGION];

// Note: the same campaign seed, day and region always give the same weather, whatever else was played.
export function weatherFor(seed, dayIndex, month, region = DEFAULT_REGION) {
  const c = climateOf(region);
  const hi = c.hi[month - 1];
  const lo = c.lo[month - 1];
  const rainy = unit(`${seed}:weather:${dayIndex}`) < c.rain[month - 1];
  const swing = (unit(`${seed}:temp:${dayIndex}`) - 0.5) * 10;
  const highF = Math.round(hi + swing);
  const lowF = Math.round(lo + swing / 2);
  const snowy = !c.legacy && rainy && lowF <= 30;
  let kind = 'clear';
  if (c.legacy) {
    if (rainy) kind = month >= 7 && month <= 9 ? 'storm' : 'windy';
    else if (hi >= 90 && unit(`${seed}:heat:${dayIndex}`) < 0.7) kind = 'hot';
    else if (hi <= 62 && unit(`${seed}:chill:${dayIndex}`) < 0.6) kind = 'cold';
    else if (month >= 3 && month <= 5 && unit(`${seed}:wind:${dayIndex}`) < 0.3) kind = 'windy';
  } else if (snowy) kind = 'snow';
  else if (rainy) kind = hi >= 78 ? 'storm' : 'rain';
  else if (hi >= (c.humid ? 86 : 90) && unit(`${seed}:heat:${dayIndex}`) < 0.7) kind = 'hot';
  else if ((hi <= 50 || lo <= 20) && unit(`${seed}:chill:${dayIndex}`) < 0.6) kind = 'cold';
  else if (month >= 3 && month <= 5 && unit(`${seed}:wind:${dayIndex}`) < (c.wind ?? 0.3)) kind = 'windy';
  return { kind, ...WEATHER[kind], rainy, ...(snowy ? { snowy: true } : {}), highF, lowF };
}

// Note: the monthly profile of a region for the map and the town screens; snow is the chance that a day brings snow, heat a 0..1 strain on people and animals.
export function climateProfile(region, month) {
  const c = climateOf(region);
  const hi = c.hi[month - 1];
  const lo = c.lo[month - 1];
  const rain = c.rain[month - 1];
  const snowShare = c.legacy ? 0 : Math.min(1, Math.max(0, (34 - lo) / 8));
  return { hi, lo, rain, snow: Math.round(rain * snowShare * 1000) / 1000, heat: Math.round(Math.min(1, Math.max(0, (hi + (c.humid ? 6 : 0) - 82) / 20)) * 100) / 100 };
}
