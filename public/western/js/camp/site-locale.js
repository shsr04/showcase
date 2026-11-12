// Note: item 484: what a case's place says about the ground of its outdoor site; the place's own name, blurb, size and site label first, its region after.
// Note: these are plausible readings of names and of period sources, not surveys; nothing here is presented as fact about a real site.

import { PLACES } from './world.js';
import { unit } from '../rand.js';

// Note: words in a place name, blurb or site label and what they say about the land; earlier rules win for the landform.
const LANDFORM_WORDS = [
  [/\bcanyon|\bcanon\b|\bgorge/, 'canyon'],
  [/\bmesa\b|\bbutte|\bbluffs?\b|\bplateau/, 'mesa'],
  [/\bgulch|\bgully|\barroyo|\bcoulee|\bdraw\b|\bwash\b/, 'gully'],
  [/\bridge|\brocks? above|\bboulders|\bhills?\b|\bknob/, 'ridge'],
  [/\bmountains?\b|\bfoothills|\bpeak|\bsummit|\bpass\b|\bdiggings above|\bclaim above/, 'foothills'],
  [/\briver bottom|\bbottoms?\b|\bvalley\b|\bfalls\b|\bbend\b|\bferry|\bcottonwoods along/, 'terraces'],
  [/\bprairie|\bflats?\b|\bplains?\b|\bmeadow/, 'flat'],
];
const WATER_WORDS = [
  [/\bsprings?\b|\bwells?\b/, 'spring'],
  [/\briver\b|\bferry|\bford\b|\bsan pedro|\bgila\b|\brio\b/, 'river'],
  [/\bcreek|\bbrook|\brun\b|\bfork\b|\bcrossing/, 'creek'],
];
const ROAD_WORDS = /\broad\b|\bstage|\bstation|\bjunction|\bdepot|\brailroad|\bcrossing|\bfreight|\bcrossroads/;
const WORKS = [
  [/\bmines?\b|\bmining|\bsilver|\bcopper|\bgold\b|\bdiggings|\bclaim|\bsmelt|\bore\b|\blode/, 'mine'],
  [/\bmills?\b|\btailings|\bstamp/, 'mill'],
  [/\branch|\bcattle|\bbeef|\bcow\b|\bcorral|\bstock\b/, 'ranch'],
  [/\bcamp\b|\bteamsters|\bfreight|\bwagon|\barmy\b|\bpost\b/, 'camp'],
];
// Note: the landform a region suggests when the place's words say nothing; mountains broken, plains rolling, deserts cut by washes.
const REGION_LANDFORM = {
  'sky-islands': 'bajada', 'sonoran-desert': 'bajada', 'mojave-desert': 'bajada', 'chihuahuan-desert': 'gully', 'great-basin': 'bajada',
  'colorado-plateau': 'mesa', 'sierra-cascades': 'foothills', 'rocky-mountains': 'foothills', 'northern-rockies': 'foothills',
  'northwest-forest': 'rolling', 'california-coast': 'rolling', 'central-valley': 'flat', 'columbia-plateau': 'gully',
  'high-plains': 'rolling', 'northern-plains': 'gully', prairie: 'flat', 'cross-timbers': 'rolling', 'texas-hill-country': 'ridge',
  'south-texas-brush': 'flat', 'gulf-coast': 'flat', 'piney-woods': 'rolling', 'mississippi-bottoms': 'terraces', ozarks: 'ridge', 'north-woods': 'rolling',
};
// Note: regions with water close at hand most places (a spring every few kilometres in REGION_PROFILE).
const WET = new Set(['northwest-forest', 'gulf-coast', 'mississippi-bottoms', 'ozarks', 'north-woods', 'piney-woods', 'prairie']);
// Note: the landform a terrain already carries, used when it is stronger than the region's guess.
const TERRAIN_LANDFORM = { wash: 'gully', 'rocky-hills': 'ridge', riverbank: 'terraces', 'mining-camp': 'foothills' };

const first = (rules, text) => (rules.find(([re]) => re.test(text)) || [])[1] || null;

// Note: the locale of an outdoor site at a place: landform, water, a road in, the works of its people and a scale; deterministic per place and site.
export function siteLocale(placeId, site = {}) {
  const p = PLACES[placeId];
  const terrain = site.terrain || null;
  const label = (site.label || '').toLowerCase();
  if (!p) return { id: placeId || null, landform: TERRAIN_LANDFORM[terrain] || 'rolling', water: null, road: terrain === 'stage-road', works: [], scale: 0.5, basis: ['no place'] };
  const words = `${p.name} ${p.blurb || ''}`.toLowerCase();
  const basis = [];
  // Note: the site's own label is the nearest description, then the place, then the terrain, then the region.
  let landform = first(LANDFORM_WORDS, label);
  if (landform) basis.push('site label');
  if (!landform) { landform = first(LANDFORM_WORDS, words); if (landform) basis.push('place name'); }
  if (!landform && TERRAIN_LANDFORM[terrain]) { landform = TERRAIN_LANDFORM[terrain]; basis.push('terrain'); }
  if (!landform) { landform = REGION_LANDFORM[p.region] || 'rolling'; basis.push('region'); }
  let water = first(WATER_WORDS, label) || first(WATER_WORDS, words);
  if (!water && WET.has(p.region) && unit(`locale:water:${p.id}:${label}`) < 0.5) water = 'creek';
  const road = ROAD_WORDS.test(label) || terrain === 'stage-road' || ROAD_WORDS.test(words) || (p.size ?? 0) >= 1 || p.kind === 'city';
  const works = new Set(WORKS.filter(([re]) => re.test(words)).map(([, w]) => w));
  for (const [re, w] of WORKS) if (re.test(label)) works.add(w);
  if (terrain === 'ranch') works.delete('ranch');
  if (terrain === 'mining-camp') works.delete('mine');
  // Note: a bigger place spreads its works and roads over more ground round it.
  const scale = Math.max(0, Math.min(1, 0.3 + 0.15 * (p.size ?? 0) + (landform === 'flat' || landform === 'rolling' ? 0.2 : 0)));
  return { id: p.id, landform, water, road: !!road, works: [...works].slice(0, 2), scale, basis };
}
