// Note: deterministic offline builder for the Prototype 3 settlement inventory; `node scripts/western-build-world.mjs` rewrites the generated module.
// Note: `--check` compares the generated files with a rebuild and exits 1 when they differ; `--list-unresolved` prints the post-office rows without a coordinate.
// Note: inputs are the three files under public/western/data; no network, no clock, no random numbers.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
export const INPUTS = {
  po: 'public/western/data/1881-post-office-candidates.csv',
  census: 'public/western/data/1880-city-candidates.csv',
  geo: 'public/western/data/1881-jurisdictions.geojson',
};
export const OUTPUTS = { module: 'public/western/js/camp/world-data.js' };

// Note: every tunable rule lives here so the audit can print it.
export const RULES = {
  snapshot: '1881-09-12',
  year: 1881,
  kmPerDegLon: 111.32,
  kmPerDegLat: 111.2,
  earthKm: 6371.0088,
  censusRadiusKm: 35,
  duplicateRadiusKm: 8,
  censusDuplicateKm: 5,
  conflictKm: 25,
  winding: 1.25,
  neighbours: 3,
  neighbourCapKm: 120,
  maxEdgeKm: 320,
  candidateNeighbours: 12,
  minRingKm2: 100,
  outlineMaxPoints: 5000,
  moduleCapBytes: 3500000,
  roadEdgeCapKm: 250,
  villageRoadKm: 60,
};

// Note: hand-made size classes for well-known 1881 towns the sources leave low; a hint only raises a class and never states a population.
export const SIZE_HINTS = [
  ['Phoenix', 'az_terr', 2, 'Maricopa County seat and irrigated farm centre'],
  ['Prescott', 'az_terr', 2, 'territorial capital and Yavapai County seat'],
  ['Yuma', 'az_terr', 2, 'Yuma County seat at the Colorado River crossing'],
  ['Florence', 'az_terr', 1, 'Pinal County seat on the Gila River'],
  ['Wilcox', 'az_terr', 1, 'Southern Pacific station and cattle shipping point'],
  ['Albuquerque', 'nm_terr', 2, 'railroad town since 1880 beside the old plaza'],
  ['Las Vegas', 'nm_terr', 2, 'Santa Fe railroad town and San Miguel County seat'],
  ['Silver City', 'nm_terr', 2, 'Grant County seat and mining supply town'],
  ['Socorro', 'nm_terr', 2, 'Socorro County seat on the Rio Grande'],
  ['Las Cruces', 'nm_terr', 2, 'Dona Ana County seat in the Mesilla valley'],
  ['Deming', 'nm_terr', 1, 'new railroad junction of 1881'],
  ['Lordsburg', 'nm_terr', 1, 'Southern Pacific station of 1880'],
  ['Raton', 'nm_terr', 1, 'railroad town founded in 1880 below Raton Pass'],
  ['White Oaks', 'nm_terr', 1, 'gold camp of 1880'],
  ['Lincoln', 'nm_terr', 1, 'Lincoln County seat'],
  ['Tascosa', 'tx_state', 1, 'Oldham County seat and Panhandle cattle town'],
  ['Abilene', 'tx_state', 1, 'new Texas and Pacific town of 1881'],
  ['Tyler', 'tx_state', 2, 'Smith County seat and railroad town'],
  ['Dodge City', 'ks_state', 2, 'railhead for the buffalo and cattle trade'],
  ['Abilene', 'ks_state', 2, 'Dickinson County seat on the Kansas Pacific'],
  ['Bismarck', 'dk_terr', 2, 'Burleigh County seat at the Northern Pacific crossing of the Missouri'],
  ['Sioux Falls', 'dk_terr', 2, 'Minnehaha County seat'],
  ['Grand Forks', 'dk_terr', 2, 'Red River steamboat and railroad town'],
  ['Jamestown', 'dk_terr', 1, 'Northern Pacific town and county seat'],
  ['Mandan', 'dk_terr', 1, 'Northern Pacific town across the Missouri from Bismarck'],
  ['Aberdeen', 'dk_terr', 1, 'Milwaukee Road town founded in 1881'],
  ['Virginia City', 'mt_terr', 2, 'Madison County seat and former territorial capital'],
  ['Bozeman', 'mt_terr', 2, 'Gallatin County seat in the valley'],
  ['Missoula', 'mt_terr', 1, 'Missoula County seat awaiting the railroad'],
  ['Miles City', 'mt_terr', 1, 'cattle town beside Fort Keogh'],
  ['Dillon', 'mt_terr', 1, 'Utah and Northern railroad town of 1880'],
  ['Boise City', 'id_terr', 2, 'territorial capital'],
  ['Lewiston', 'id_terr', 2, 'Nez Perce County seat at the Snake River landing'],
  ['Hailey', 'id_terr', 1, 'new Wood River mining town of 1881'],
  ['Ketchum', 'id_terr', 1, 'Wood River silver camp'],
  ['Rawlins', 'wy_terr', 2, 'Carbon County seat on the Union Pacific'],
  ['Rock Springs', 'wy_terr', 2, 'Union Pacific coal town'],
  ['Trinidad', 'co_state', 2, 'Las Animas County seat on the Santa Fe Trail'],
  ['Central City', 'co_state', 2, 'Gilpin County seat and gold mining town'],
  ['Golden', 'co_state', 2, 'Jefferson County seat and former territorial capital'],
  ['Greeley', 'co_state', 2, 'Weld County seat and colony town'],
  ['Georgetown', 'co_state', 2, 'Clear Creek silver mining town'],
  ['Durango', 'co_state', 1, 'Denver and Rio Grande town founded in 1880'],
  ['Gunnison', 'co_state', 1, 'Gunnison County seat and mining supply town'],
  ['Aspen', 'co_state', 1, 'Roaring Fork silver camp'],
  ['Brigham City', 'ut_terr', 2, 'Box Elder County seat'],
  ['Reno', 'nv_state', 2, 'Washoe County seat on the Central Pacific'],
  ['Austin', 'nv_state', 2, 'Lander County seat and silver camp'],
  ['Gold Hill', 'nv_state', 2, 'Comstock mining town beside Virginia City'],
  ['Elko', 'nv_state', 1, 'Elko County seat on the Central Pacific'],
  ['Tacoma', 'wa_terr', 2, 'Northern Pacific terminus on Puget Sound'],
  ['Olympia', 'wa_terr', 2, 'territorial capital'],
  ['Spokane Falls', 'wa_terr', 1, 'new milling settlement at the falls'],
  ['Vancouver', 'wa_terr', 2, 'Clarke County seat on the Columbia'],
  ['Port Townsend', 'wa_terr', 2, 'Puget Sound customs port'],
  ['Kearney', 'ne_state', 2, 'Buffalo County seat on the Union Pacific'],
  ['North Platte', 'ne_state', 2, 'Union Pacific division point'],
  ['Beatrice', 'ne_state', 2, 'Gage County seat on the Blue River'],
  ['Sidney', 'ne_state', 1, 'Union Pacific town and Black Hills outfitter'],
  ['Tahlequah', 'it_indianterr', 1, 'Cherokee Nation capital'],
  ['Vinita', 'it_indianterr', 1, 'Cherokee Nation railroad town'],
].map(([name, jur, size, why]) => ({ name, jur, size, why }));

// Note: size classes by 1880 population; unknown population is class 0 and is never guessed.
export const SIZE_CLASSES = [
  { size: 0, label: 'unknown or under 100', min: 0 },
  { size: 1, label: '100 to 499', min: 100 },
  { size: 2, label: '500 to 2,499', min: 500 },
  { size: 3, label: '2,500 to 9,999', min: 2500 },
  { size: 4, label: '10,000 and over', min: 10000 },
];

// Note: bit order is part of the module format; unc in a settlement tuple is a mask over this list.
export const REASONS = [
  { id: 'est-unknown', text: 'The opening year of the office is unknown.' },
  { id: 'est-1881', text: 'The office opened in 1881; the month is unknown, so it may have opened after 12 September.' },
  { id: 'disc-1881', text: 'The office closed in 1881; the month is unknown, so it may have closed before 12 September.' },
  { id: 'gap', text: 'The office is marked as not continuously operating, so it may have been closed in 1881.' },
  { id: 'gnis-fuzzy', text: 'The GNIS match is not an exact name match, so the coordinate may belong to another feature.' },
  { id: 'jurisdiction-differs', text: 'The coordinate falls in a different 1881 jurisdiction than the record\'s modern state suggests.' },
  { id: 'census-only', text: 'Only the 1880 census compilation lists it; no 1881 office record corroborates it and its coordinate is a modern geocode.' },
  { id: 'coord-conflict', text: 'Sources for this place disagree on its position by more than 25 km.' },
  { id: 'post-office-only', text: 'Only a GNIS post-office feature backs it: an office, which may be a shop, a ranch or a stage stop rather than a settlement.' },
  { id: 'size-hint', text: 'The size class was raised by a hand-made hint from general knowledge of the town; it is inference, not a census figure, and no population is recorded.' },
  { id: 'fort-or-camp', text: 'The name starts with Fort, Ft or Camp: it may have been an army post rather than a civil town, or a town that kept the name of a fort.' },
];
const BIT = Object.fromEntries(REASONS.map((r, i) => [r.id, 1 << i]));
const popcount = (n) => { let c = 0; for (let m = n; m; m >>>= 1) c += m & 1; return c; };

export const SOURCE_TABLE = [
  {
    id: 'po', label: 'Helbock post-office records geocoded by Blevins (US Post Offices dataset), extract 1881-post-office-candidates.csv',
    url: 'https://doi.org/10.7910/DVN/NUKCNA', license: 'CC0 1.0', rows: 14605,
    use: 'Office name, county, opening and closing years, GNIS match class and coordinate; the row id is the dataset ID column.',
  },
  {
    id: 'cs', label: 'Steiner and Heppler historical US city populations, extract 1880-city-candidates.csv',
    url: 'https://github.com/cestastanford/historical-us-city-populations', license: 'see source repository', rows: 611,
    use: '1880 census population and an approximate modern geocode; the row id is the compilation ID column.',
  },
  {
    id: 'bnd', label: 'Newberry Atlas of Historical County Boundaries, generalized 1881 state and territory polygons',
    url: 'https://publications.newberry.org/ahcb/pages/United_States.html', license: 'see source', rows: 22,
    use: 'Boundary for point-in-polygon tests and the map outlines; carries no settlement data.',
  },
  {
    id: 'gen', label: 'General knowledge of the period (author recollection)',
    url: null, license: 'none', rows: 0,
    use: 'Regions, service inference, road flags and size hints; plausible guesses, not evidence.',
  },
];
const SRC = { po: 0, cs: 1 };

// Note: coarse regions from general knowledge; polygons are lon/lat, first match wins, a nearest-centre fallback covers any gap.
export const REGION_DEFS = [
  { id: 'sky-islands', name: 'Southeastern Arizona sky islands', climate: 'semi-arid uplands, summer monsoon', note: 'Borderland mountain ranges and grass-and-scrub valleys of southeast Arizona and the New Mexico bootheel; the setting of the Cochise places.',
    poly: [[-110.8, 31.0], [-110.8, 33.0], [-111.1, 33.2], [-111.1, 34.0], [-109.0, 34.0], [-108.0, 34.0], [-108.0, 33.3], [-108.6, 32.7], [-108.6, 31.0]] },
  { id: 'central-valley', name: 'California Central Valley', climate: 'hot dry summers, mild wet winters', note: 'Flat irrigated-to-be plain of the Sacramento and San Joaquin rivers, wheat country in 1881.',
    poly: [[-122.5, 40.8], [-121.8, 40.8], [-121.4, 39.7], [-121.0, 38.9], [-120.5, 37.8], [-119.6, 36.8], [-118.8, 35.7], [-118.8, 35.1], [-119.6, 34.9], [-120.4, 35.9], [-121.1, 36.8], [-121.7, 37.6], [-122.3, 38.4], [-122.4, 39.4]] },
  { id: 'sierra-cascades', name: 'Sierra Nevada and Cascades', climate: 'cold snowy winters, forested slopes', note: 'The Sierra Nevada and the Cascade Range from California to the Canadian border, forest and rock with deep snow.',
    poly: [[-118.7, 35.2], [-119.3, 36.0], [-120.0, 37.0], [-120.6, 37.9], [-121.2, 38.8], [-121.4, 39.8], [-122.0, 40.6], [-122.7, 41.5], [-122.9, 42.5], [-122.5, 43.5], [-122.2, 44.5], [-122.2, 45.5], [-122.0, 47.0], [-121.9, 49.2], [-120.7, 49.2], [-120.6, 47.5], [-121.0, 46.0], [-121.5, 45.0], [-121.8, 44.0], [-121.9, 42.5], [-121.0, 41.0], [-120.0, 39.5], [-119.2, 37.8], [-118.2, 35.6]] },
  { id: 'california-coast', name: 'California coast and coast ranges', climate: 'mild Mediterranean, dry summers', note: 'Coastal valleys, hills and the southern basins from Mendocino to San Diego.',
    poly: [[-124.6, 39.5], [-122.3, 39.5], [-121.9, 38.6], [-121.0, 37.5], [-120.0, 36.4], [-119.2, 35.4], [-118.8, 35.0], [-117.6, 34.6], [-116.5, 34.0], [-116.0, 32.8], [-116.0, 32.0], [-124.6, 32.0]] },
  { id: 'sonoran-desert', name: 'Sonoran Desert', climate: 'very hot summers, mild winters, bimodal rain', note: 'Low desert of southern Arizona and the lower Colorado River with saguaro and creosote.',
    poly: [[-117.3, 31.0], [-110.8, 31.0], [-110.8, 34.3], [-116.3, 34.3], [-117.3, 33.8]] },
  { id: 'mojave-desert', name: 'Mojave Desert', climate: 'hot dry desert, cold winter nights', note: 'High desert of southeast California, southern Nevada and northwest Arizona.',
    poly: [[-118.8, 34.3], [-113.3, 34.3], [-113.3, 37.1], [-115.5, 37.1], [-117.6, 37.0], [-118.4, 36.4], [-118.8, 35.5]] },
  { id: 'northwest-forest', name: 'Pacific Northwest forest', climate: 'mild, rainy, heavy forest', note: 'Wet conifer forest and river valleys west of the Cascades, from the Redwood coast to Puget Sound.',
    poly: [[-125.0, 39.5], [-122.5, 39.5], [-122.2, 40.5], [-122.5, 41.5], [-122.6, 43.0], [-122.2, 45.0], [-122.0, 47.0], [-121.9, 49.3], [-125.0, 49.3]] },
  { id: 'northern-rockies', name: 'Northern Rockies', climate: 'cold winters, short mild summers', note: 'Idaho and western Montana ranges and the Yellowstone country, timber and mining valleys.',
    poly: [[-117.1, 49.2], [-113.0, 49.2], [-112.7, 48.2], [-112.0, 47.3], [-111.4, 46.6], [-110.4, 45.6], [-109.6, 44.6], [-109.2, 43.5], [-110.0, 42.6], [-111.5, 42.0], [-111.8, 43.4], [-113.0, 44.0], [-114.5, 43.9], [-115.5, 43.8], [-116.2, 44.4], [-116.6, 45.6], [-117.1, 46.4]] },
  { id: 'rocky-mountains', name: 'Central and southern Rockies', climate: 'cool, dry, heavy winter snow at height', note: 'The Colorado and southern Wyoming ranges and the northern New Mexico mountains.',
    poly: [[-111.2, 42.3], [-108.2, 43.5], [-106.8, 43.2], [-105.9, 42.2], [-105.3, 41.0], [-105.2, 39.9], [-104.95, 38.9], [-104.95, 37.6], [-105.0, 36.8], [-105.2, 35.5], [-105.6, 34.6], [-106.6, 34.4], [-107.3, 35.6], [-107.6, 37.0], [-108.3, 37.6], [-108.4, 38.7], [-108.2, 40.0], [-108.9, 41.0], [-111.2, 40.9]] },
  { id: 'colorado-plateau', name: 'Colorado Plateau', climate: 'dry high desert, hot summers, cold winters', note: 'Canyon and mesa country of southern Utah, northern Arizona, western Colorado and northwest New Mexico.',
    poly: [[-114.3, 36.0], [-113.6, 34.3], [-111.5, 34.0], [-108.0, 34.0], [-107.0, 36.0], [-108.0, 38.0], [-108.2, 40.2], [-109.5, 41.0], [-111.3, 40.2], [-111.6, 38.6], [-112.8, 37.6], [-114.1, 37.3]] },
  { id: 'great-basin', name: 'Great Basin', climate: 'cold dry steppe and desert, big daily swings', note: 'Basin-and-range sagebrush and salt flats of Nevada, western Utah, southeast Oregon and the Modoc plateau.',
    poly: [[-122.0, 41.9], [-121.5, 43.3], [-119.0, 44.0], [-117.5, 43.7], [-115.0, 43.0], [-113.5, 42.4], [-111.3, 42.2], [-111.2, 38.5], [-113.5, 37.1], [-117.5, 37.1], [-118.5, 36.6], [-119.5, 37.8], [-120.2, 39.0], [-120.5, 40.0], [-121.3, 41.0]] },
  { id: 'columbia-plateau', name: 'Columbia and Snake plateau', climate: 'dry steppe, cold winters, hot summers', note: 'Sagebrush and wheat plateau of eastern Washington and Oregon and the Snake River plain of Idaho.',
    poly: [[-121.8, 49.2], [-117.0, 49.2], [-116.0, 46.2], [-115.0, 44.2], [-111.4, 43.6], [-111.3, 42.2], [-113.5, 42.4], [-115.0, 43.0], [-117.5, 43.7], [-119.0, 44.0], [-121.5, 43.3], [-122.0, 45.0]] },
  { id: 'chihuahuan-desert', name: 'Chihuahuan Desert', climate: 'hot dry desert, summer rain, cool winters', note: 'Desert grassland and scrub of southern New Mexico and the Texas Trans-Pecos.',
    poly: [[-109.5, 28.0], [-101.6, 28.0], [-101.6, 30.2], [-102.2, 31.3], [-102.9, 32.4], [-104.0, 32.8], [-104.8, 33.4], [-105.2, 34.3], [-107.4, 35.0], [-108.0, 33.5], [-108.6, 32.8], [-109.5, 32.8]] },
  { id: 'gulf-coast', name: 'Gulf coast', climate: 'hot humid, mild winters, hurricane risk', note: 'Texas coastal prairie and the Louisiana marsh, bayou and sugar country.',
    poly: [[-98.5, 25.5], [-96.5, 25.5], [-88.5, 28.5], [-88.5, 30.7], [-91.8, 30.7], [-94.5, 30.4], [-95.7, 30.4], [-96.7, 30.4], [-97.5, 29.6], [-98.5, 28.8]] },
  { id: 'south-texas-brush', name: 'South Texas brush country', climate: 'hot semi-arid, thorn scrub', note: 'Mesquite and thorn brush between the Nueces and the Rio Grande.',
    poly: [[-101.8, 25.5], [-97.0, 25.5], [-97.5, 28.5], [-98.4, 29.2], [-99.2, 29.8], [-100.5, 30.0], [-101.6, 29.8]] },
  { id: 'texas-hill-country', name: 'Texas hill country', climate: 'warm, subhumid, flashy streams', note: 'The Edwards Plateau and Balcones escarpment of central Texas, limestone hills and live oak.',
    poly: [[-101.8, 29.6], [-99.5, 29.6], [-98.9, 29.1], [-97.9, 28.9], [-97.3, 29.4], [-97.2, 31.0], [-98.0, 31.9], [-99.5, 31.9], [-101.0, 31.9], [-102.0, 31.0]] },
  { id: 'mississippi-bottoms', name: 'Mississippi bottomlands', climate: 'hot humid summers, flooding in spring', note: 'The alluvial plain of the lower Mississippi and Atchafalaya, cypress swamp and cotton land.',
    poly: [[-90.6, 37.0], [-89.1, 37.4], [-89.0, 34.5], [-90.8, 31.5], [-91.0, 30.7], [-91.9, 30.7], [-92.1, 31.6], [-91.9, 32.5], [-92.0, 33.4], [-92.3, 34.2], [-91.8, 35.2], [-91.0, 36.0]] },
  { id: 'ozarks', name: 'Ozarks and Ouachitas', climate: 'humid continental, hot summers, hardwood hills', note: 'Oak-hickory hills of southern Missouri, northern Arkansas and eastern Indian Territory.',
    poly: [[-95.0, 38.2], [-91.0, 38.5], [-90.0, 37.2], [-90.6, 36.4], [-91.4, 35.6], [-91.8, 35.0], [-91.8, 34.4], [-93.0, 33.9], [-94.8, 33.9], [-95.2, 35.0], [-95.3, 36.5]] },
  { id: 'north-woods', name: 'Northern Minnesota woods', climate: 'cold winters, cool summers, lakes and conifer', note: 'Pine and lake country of northern and eastern Minnesota.',
    poly: [[-96.2, 49.5], [-88.5, 49.5], [-88.5, 46.0], [-93.5, 45.9], [-95.0, 46.2], [-95.8, 47.8]] },
  { id: 'prairie', name: 'Tallgrass prairie and river hills', climate: 'humid continental, hot summers, cold winters', note: 'Farm and prairie country of Iowa, eastern Kansas and Nebraska, northern Missouri, southern Minnesota and eastern Dakota.',
    poly: [[-98.3, 49.5], [-88.5, 49.5], [-88.5, 36.4], [-94.5, 36.4], [-96.8, 36.9], [-99.0, 37.0], [-99.3, 39.0], [-99.9, 41.0], [-98.8, 43.0], [-98.3, 45.0]] },
  { id: 'piney-woods', name: 'Piney woods', climate: 'hot humid summers, mild winters, pine forest', note: 'Pine and hardwood forest of east Texas, southern Arkansas and north Louisiana.',
    poly: [[-96.9, 34.0], [-91.2, 34.3], [-88.9, 31.0], [-88.9, 30.4], [-95.7, 30.4], [-96.6, 31.5]] },
  { id: 'cross-timbers', name: 'Cross Timbers and rolling plains', climate: 'hot summers, cool winters, variable rain', note: 'Oak savanna and grass of north-central Texas and central Indian Territory.',
    poly: [[-100.3, 31.9], [-100.5, 34.5], [-99.3, 37.0], [-96.8, 37.3], [-94.6, 37.0], [-94.7, 34.0], [-96.8, 33.9], [-96.6, 31.5], [-95.7, 30.4], [-95.7, 29.4], [-97.9, 29.4], [-98.5, 31.9]] },
  { id: 'high-plains', name: 'High Plains', climate: 'semi-arid, windy, hot summers, cold winters', note: 'Shortgrass plains east of the Rockies from Wyoming to the Texas Panhandle.',
    poly: [[-110.0, 43.6], [-97.0, 43.6], [-97.0, 35.0], [-100.0, 31.0], [-104.5, 31.0], [-106.5, 36.0], [-110.0, 40.0]] },
  { id: 'northern-plains', name: 'Northern Plains', climate: 'cold dry winters, hot summers, badlands and mixed grass', note: 'Mixed-grass plains and badlands of eastern Montana and western Dakota, including the Black Hills.',
    poly: [[-113.0, 49.5], [-97.0, 49.5], [-97.0, 43.6], [-112.0, 43.6]] },
];
// Note: regions where a wagon road needs a sizeable town at both ends; used only by the road-flag guess.
const ROUGH_REGIONS = new Set(['sky-islands', 'sierra-cascades', 'mojave-desert', 'northern-rockies', 'rocky-mountains', 'colorado-plateau', 'great-basin']);

// Note: service chances by size class; 'inference' only, not evidence.
export const SERVICE_RULES = [
  { size: 0, doctor: 0.06, store: 0.35, livery: 0.06, recruit: 0.04, notices: 0.12, ask: 0.55, saloon: 0.14, meal: 0.3, poker: 0.4, faro: 0 },
  { size: 1, doctor: 0.3, store: 0.8, livery: 0.3, recruit: 0.22, notices: 0.45, ask: 0.85, saloon: 0.45, meal: 0.45, poker: 0.7, faro: 0.15 },
  { size: 2, doctor: 0.8, store: 1, livery: 0.75, recruit: 0.65, notices: 0.92, ask: 1, saloon: 0.82, meal: 0.75, poker: 0.9, faro: 0.45 },
  { size: 3, doctor: 1, store: 1, livery: 1, recruit: 0.95, notices: 1, ask: 1, saloon: 0.97, meal: 0.95, poker: 1, faro: 0.8 },
  { size: 4, doctor: 1, store: 1, livery: 1, recruit: 1, notices: 1, ask: 1, saloon: 1, meal: 1, poker: 1, faro: 1 },
];
const DOCTOR_LEVELS = [[0.3], [0.3, 0.4], [0.4, 0.6], [0.6, 1], [1]];
const STORE_BASE = [1.55, 1.3, 1.1, 1, 0.95];
// Note: legal circumstances of 1881 as remembered; Kansas prohibition took effect in May 1881 and liquor was barred in Indian Territory.
const SALOON_FACTOR = { it_indianterr: 0, ks_state: 0.25 };

// Note: modern state to the 1881 jurisdiction it mostly lies in; Oklahoma is split by county below.
const EXPECTED = {
  AR: 'ar_state', AZ: 'az_terr', CA: 'ca_state', CO: 'co_state', IA: 'ia_state', ID: 'id_terr', KS: 'ks_state', LA: 'la_state', MN: 'mn_state', MO: 'mo_state',
  MT: 'mt_terr', ND: 'dk_terr', NE: 'ne_state', NM: 'nm_terr', NV: 'nv_state', OR: 'or_state', SD: 'dk_terr', TX: 'tx_state', UT: 'ut_terr', WA: 'wa_terr', WY: 'wy_terr',
};
const STRIP_COUNTIES = new Set(['BEAVER', 'CIMARRON', 'TEXAS']);
const expectedJurisdiction = (st, county) => (st === 'OK' ? (STRIP_COUNTIES.has(String(county).toUpperCase()) ? 'uf_terr' : 'it_indianterr') : EXPECTED[st] || 'none');
const matchesState = (jurId, st, county) => (st === 'OK' ? jurId === 'it_indianterr' || jurId === 'uf_terr' : jurId === expectedJurisdiction(st, county));

const ELIGIBLE_CLASSES = new Set(['Populated Place', 'Census']);
// Note: Post Office class rows are candidates and become uncertain places; Locale, Civil and other classes stay excluded.
const CANDIDATE_CLASSES = new Set([...ELIGIBLE_CLASSES, 'Post Office']);
const PO_EXCLUSIONS = ['not-operating', 'unresolved', 'outside-boundary', 'post-or-camp', 'property', 'class-locale', 'class-civil', 'class-other'];
const PO_DISPOSITIONS = ['kept', 'merged-duplicate', 'merged-census', ...PO_EXCLUSIONS];
const CENSUS_DISPOSITIONS = ['kept', 'merged-census-duplicate', 'merged-office-twin', 'outside-boundary', 'institution', 'unplaced'];
// Note: census rows that name an institution rather than a settlement.
const INSTITUTION = /\b(asylum|penitentiary|prison|hospital|almshouse|poor ?farm)\b/i;
// Note: this many census rows on one geocode mark a geocoder fallback such as a state centre, not a town; rows of two counties on one geocode make it doubtful.
const STACKED_ROWS = 3;

// Note: small utilities; string comparison is by code unit so results never depend on a locale.
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const round = (n, d) => { const f = 10 ** d; const r = Math.round(n * f) / f; return Object.is(r, -0) ? 0 : r; };
const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
}

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const unit = (id, salt) => hash32(`${id}|${salt}`) / 4294967296;

// Note: great-circle distance in kilometres.
function gc(lat1, lon1, lat2, lon2) {
  const t = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * t) / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(((lon2 - lon1) * t) / 2) ** 2;
  return 2 * RULES.earthKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Note: ray casting over one ring; the polygon test below handles holes and multipolygons.
function ringContains(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Note: ringContains with the edges of a ring bucketed by latitude band; an edge can only be crossed in the bands its latitudes span, so the answer is the full scan's.
function bandedRing(ring, bands = 64) {
  let lo = Infinity; let hi = -Infinity;
  for (const [, y] of ring) { if (y < lo) lo = y; if (y > hi) hi = y; }
  const h = (hi - lo) / bands || 1;
  const band = (lat) => Math.min(bands, Math.max(0, Math.floor((lat - lo) / h)));
  const buckets = Array.from({ length: bands + 1 }, () => []);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][1]; const yj = ring[j][1];
    for (let k = band(Math.min(yi, yj)); k <= band(Math.max(yi, yj)); k++) buckets[k].push(ring[i][0], yi, ring[j][0], yj);
  }
  return (lon, lat) => {
    const e = buckets[band(lat)];
    let inside = false;
    for (let k = 0; k < e.length; k += 4) {
      const xi = e[k]; const yi = e[k + 1]; const xj = e[k + 2]; const yj = e[k + 3];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}
function bboxOf(ring) {
  let w = 180; let e = -180; let s = 90; let n = -90;
  for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}
function buildJurisdictions(geo) {
  const list = geo.features.map((f) => {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const parts = polys.map((rings) => ({ bbox: bboxOf(rings[0]), rings, inside: rings.map((r) => bandedRing(r)) }));
    const type = f.properties.TERR_TYPE === 'State' ? 'state' : f.properties.TERR_TYPE === 'Territory' ? 'territory' : 'unorganized';
    return { id: f.properties.ID, name: f.properties.ID === 'uf_terr' ? 'Public Land Strip' : f.properties.NAME, abbr: f.properties.ABBR_NAME, type, parts };
  });
  list.sort((a, b) => cmp(a.id, b.id));
  return list;
}
function jurisdictionAt(list, lon, lat) {
  for (let i = 0; i < list.length; i++) {
    for (const part of list[i].parts) {
      const b = part.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (part.inside[0](lon, lat) && !part.inside.slice(1).some((h) => h(lon, lat))) return i;
    }
  }
  return -1;
}
// Note: shortest distance in km from a point to any boundary segment, for the near-miss statistic only.
function distanceToBoundary(list, lon, lat) {
  const kx = RULES.kmPerDegLon * Math.cos((lat * Math.PI) / 180);
  const ky = RULES.kmPerDegLat;
  let best = Infinity;
  for (const j of list) for (const part of j.parts) {
    const b = part.bbox;
    if (lon < b[0] - 1 || lon > b[2] + 1 || lat < b[1] - 1 || lat > b[3] + 1) continue;
    const ring = part.rings[0];
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * kx; const ay = (ring[i - 1][1] - lat) * ky;
      const bx = (ring[i][0] - lon) * kx; const by = (ring[i][1] - lat) * ky;
      const dx = bx - ax; const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

// Note: names are normalised for matching only; displayed names keep their own spelling.
function cleanName(s) { return String(s).replace(/`/g, '\'').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim(); }
function normName(s) {
  return cleanName(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/['".]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt').replace(/\bfort\b/g, 'ft').replace(/\s+/g, ' ').trim();
}
function titleCase(s) {
  return cleanName(s).toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\bO'([a-z])/g, (m, c) => `O'${c.toUpperCase()}`).replace(/\bMc([a-z])/g, (m, c) => `Mc${c.toUpperCase()}`);
}
function slug(s) {
  const t = String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return t || 'place';
}

// Note: Fort, Ft and Camp offices with no census row stay only when named here; the list is general knowledge of well-known posts and towns, not a source.
export const WELL_KNOWN_POSTS = [['Fort Apache', 'AZ'], ['Camp Verde', 'AZ'], ['Fort Bayard', 'NM'], ['Fort Stanton', 'NM'], ['Fort Sumner', 'NM'], ['Fort Union', 'NM'], ['Fort Wingate', 'NM'],
  ['Fort Collins', 'CO'], ['Fort Garland', 'CO'], ['Fort Lyon', 'CO'], ['Fort Laramie', 'WY'], ['Fort Bridger', 'WY'], ['Fort Benton', 'MT'], ['Fort Keogh', 'MT'], ['Fort Custer', 'MT'],
  ['Fort Meade', 'SD'], ['Fort Pierre', 'SD'], ['Fort Robinson', 'NE'], ['Fort Leavenworth', 'KS'], ['Fort Sill', 'OK'], ['Fort Gibson', 'OK'], ['Fort Davis', 'TX'], ['Fort Stockton', 'TX'],
  ['Fort Griffin', 'TX'], ['Fort Bragg', 'CA'], ['Fort Ross', 'CA'], ['Fort Hall', 'ID']].map(([name, st]) => ({ name, st }));

// Note: places whose wagon distance from Tombstone the audit reports.
const WAGON_TARGETS = ['denver-co', 'bismarck-nd', 'salt-lake-city-ut', 'dodge-city-ks', 'phoenix-az', 'albuquerque-nm', 'el-paso-tx', 'tucson-az'];

// Note: well-known 1881 towns checked by name and modern state to show what the filters did to them.
const WATCH = [['Tombstone', 'AZ'], ['Tucson', 'AZ'], ['Prescott', 'AZ'], ['Phoenix', 'AZ'], ['Yuma', 'AZ'], ['Albuquerque', 'NM'], ['Santa Fe', 'NM'], ['Las Vegas', 'NM'], ['Silver City', 'NM'], ['Lordsburg', 'NM'],
  ['Deming', 'NM'], ['El Paso', 'TX'], ['Fort Worth', 'TX'], ['Dodge City', 'KS'], ['Wichita', 'KS'], ['Denver', 'CO'], ['Leadville', 'CO'], ['Cheyenne', 'WY'], ['Deadwood', 'SD'], ['Bismarck', 'ND'],
  ['Helena', 'MT'], ['Boise City', 'ID'], ['Salt Lake City', 'UT'], ['Virginia City', 'NV'], ['Sacramento', 'CA'], ['Portland', 'OR'], ['Seattle', 'WA'], ['Omaha', 'NE']];
const WATCH_KEYS = new Set(WATCH.map(([n, st]) => `${st}|${normName(n)}`));

// Note: detection of posts, camps and individual properties is by GNIS class and by name only; it is a heuristic.
// Note: RANCH ends a property name except in Branch; Ranche is the Spanish form.
const POST_PREFIX = /^CANTONMENT\b/;
const FORT_PREFIX = /^(FORT|FT|CAMP) \S/;
const POST_ANYWHERE = /\b(BARRACKS|ARSENAL)\b/;
const POST_SUFFIX = /\S AGENCY$/;
const PROPERTY_SUFFIX = /(?:\b(?:FARM|HOMESTEAD|PLANTATION|DAIRY|STORE|MILL|MINE|CABIN)|(?<!B)RANCHE?)$/;
const WELL_KNOWN_KEYS = new Set(WELL_KNOWN_POSTS.map(({ name, st }) => `${st}|${normName(name)}`));
const isPost = (r) => r.cls === 'Military' || POST_PREFIX.test(r.upper) || POST_ANYWHERE.test(r.upper) || POST_SUFFIX.test(r.upper);
const isFortName = (r) => FORT_PREFIX.test(r.upper);
const isListedPost = (r) => [...r.keys].some((k) => WELL_KNOWN_KEYS.has(`${r.st}|${k}`));
const isProperty = (r) => PROPERTY_SUFFIX.test(r.upper);

function prepareOffice(raw, n) {
  const name = cleanName(raw.Name);
  const keys = new Set([normName(raw.Name)]);
  if (raw.AltName) keys.add(normName(raw.AltName));
  keys.delete('');
  const est = raw.Established === '' ? null : Number(raw.Established);
  const disc = raw.Discontinued === '' ? null : Number(raw.Discontinued);
  const has = raw.Latitude !== '' && raw.Longitude !== '';
  const exact = raw['GNIS.Match'] === 'TRUE' && (raw['GNIS.MatchScore'] === '1' || (raw['GNIS.MatchScore'] === '' && normName(raw['GNIS.Name']) === normName(raw.Name)));
  return {
    n, id: Number(raw.ID), name, upper: name.toUpperCase(), keys, st: raw.State, county: raw.County1, est, disc, cont: raw.Continuous === 'TRUE',
    cls: raw['GNIS.Feature.Class'], gnis: raw['GNIS.FEATURE_ID'], has, lon: has ? Number(raw.Longitude) : NaN, lat: has ? Number(raw.Latitude) : NaN, exact, j: -1,
  };
}
const notOperating = (r) => (r.est !== null && r.est > RULES.year) || (r.disc !== null && r.disc < RULES.year);
function officeMask(r) {
  let m = 0;
  if (r.est === null) m |= BIT['est-unknown']; else if (r.est === RULES.year) m |= BIT['est-1881'];
  if (r.disc === RULES.year) m |= BIT['disc-1881'];
  if (!r.cont) m |= BIT.gap;
  return m;
}

function prepareCensus(raw) {
  const keys = new Set([normName(raw.City)]);
  if (raw.City.includes('-')) for (const part of raw.City.split('-')) keys.add(normName(part));
  keys.delete('');
  return { id: Number(raw.ID), name: cleanName(raw.City), keys, st: raw.ST, county: raw.County_Name, pop: Number(raw['1880']), bing: [Number(raw.LON_BING), Number(raw.LAT_BING)], own: raw.LAT !== '' && raw.LON !== '' ? [Number(raw.LON), Number(raw.LAT)] : null };
}

// Note: Bing first; the compilation's own point only when Bing falls outside the expected state or on a stacked fallback, as the two can be hundreds of kilometres apart.
function chooseCensusPoint(c, list, stacked, shared) {
  const inState = (pt) => { const j = jurisdictionAt(list, pt[0], pt[1]); return j >= 0 && matchesState(list[j].id, c.st, c.county); };
  const usable = (pt) => inState(pt) && !stacked.has(pt.join(','));
  let pick = c.bing;
  if (!usable(c.bing) && c.own && usable(c.own)) pick = c.own;
  const other = pick === c.bing ? c.own : c.bing;
  const conflict = !!other && gc(pick[1], pick[0], other[1], other[0]) > RULES.conflictKm;
  return { lon: pick[0], lat: pick[1], conflict: conflict || shared.has(pick.join(',')), trusted: usable(pick) };
}

// Note: projection with Tombstone at 0,0; x uses the cosine of the point's own latitude so east-west kilometres stay true at every latitude.
function makeProjection(lon0, lat0) {
  return {
    lon0, lat0,
    project: (lon, lat) => ({ x: (lon - lon0) * RULES.kmPerDegLon * Math.cos((lat * Math.PI) / 180), y: -(lat - lat0) * RULES.kmPerDegLat }),
    unproject: (x, y) => { const lat = lat0 - y / RULES.kmPerDegLat; return { lon: lon0 + x / (RULES.kmPerDegLon * Math.cos((lat * Math.PI) / 180)), lat }; },
  };
}

// Note: union-find with path halving; the smaller index always becomes the root so results do not depend on call order.
function makeUnionFind(n) {
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra === rb) return false; if (ra < rb) parent[rb] = ra; else parent[ra] = rb; return true; };
  return { find, union };
}

const sameCounty = (a, b) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();

function inventory(poRaw, censusRaw, J, proj) {
  const places = [];
  const buckets = new Map();
  const index = (p) => { for (const k of p.keys) { const b = `${p.st}|${k}`; if (!buckets.has(b)) buckets.set(b, []); buckets.get(b).push(p); } };
  const addKeys = (p, keys) => { for (const k of keys) if (!p.keys.has(k)) { p.keys.add(k); const b = `${p.st}|${k}`; if (!buckets.has(b)) buckets.set(b, []); buckets.get(b).push(p); } };
  const findNear = (st, keys, lon, lat, maxKm, pred) => {
    let best = null;
    for (const k of keys) {
      for (const p of buckets.get(`${st}|${k}`) || []) {
        if (!pred(p)) continue;
        const d = gc(lat, lon, p.lat, p.lon);
        if (d <= maxKm && (!best || d < best.d || (d === best.d && p.order < best.p.order))) best = { p, d };
      }
    }
    return best && best.p;
  };
  const blank = (o) => ({ census: [], po: [], primary: null, conflict: false, coordFrom: 'cur', pop: 0, size: 0, ...o });
  const stat = {
    po: Object.fromEntries(PO_DISPOSITIONS.map((d) => [d, 0])),
    census: Object.fromEntries(CENSUS_DISPOSITIONS.map((d) => [d, 0])),
    exclusions: Object.fromEntries(PO_EXCLUSIONS.map((r) => [r, {}])),
    mergedByJurisdiction: {},
    unresolved: [], outsideNear: { within5: 0, within25: 0, beyond: 0 }, posts: [], forts: [], properties: [], fates: [],
  };
  const exclude = (r, reason, bucket) => {
    stat.po[reason]++; bump(stat.exclusions[reason], bucket);
    const wk = `${r.st}|${normName(r.name)}`;
    if (WATCH_KEYS.has(wk)) stat.fates.push({ key: wk, reason });
  };

  // Note: 1880 census rows first; a row inside the boundary becomes a place unless it matches a nearer census row.
  const censusRows = censusRaw.map(prepareCensus).sort((a, b) => a.id - b.id);
  const perPoint = new Map();
  for (const c of censusRows) perPoint.set(c.bing.join(','), [...(perPoint.get(c.bing.join(',')) || []), String(c.county).trim().toUpperCase()]);
  const stacked = new Set([...perPoint].filter(([, counties]) => counties.length >= STACKED_ROWS).map(([k]) => k));
  const shared = new Set([...perPoint].filter(([, counties]) => new Set(counties).size > 1).map(([k]) => k));
  // Note: rows whose geocode cannot be trusted wait for an office of the same name and county to place them.
  const unplaced = [];
  for (const c of censusRows) {
    const pt = chooseCensusPoint(c, J, stacked, shared);
    const j = jurisdictionAt(J, pt.lon, pt.lat);
    if (j < 0) { stat.census['outside-boundary']++; continue; }
    if (INSTITUTION.test(c.name)) { stat.census.institution++; continue; }
    if (!pt.trusted) { unplaced.push(c); continue; }
    const dup = findNear(c.st, c.keys, pt.lon, pt.lat, RULES.censusDuplicateKm, (p) => p.origin === 'census' && sameCounty(p.county, c.county));
    if (dup) { dup.census.push(c); dup.pop = Math.max(dup.pop, c.pop); addKeys(dup, c.keys); stat.census['merged-census-duplicate']++; continue; }
    const p = blank({ order: places.length, origin: 'census', id: '', name: c.name, st: c.st, county: c.county, lon: pt.lon, lat: pt.lat, j, keys: new Set(c.keys), conflict: pt.conflict, coordFrom: 'census', pop: c.pop, census: [c] });
    places.push(p); index(p); stat.census.kept++;
  }

  const offices = poRaw.map(prepareOffice).sort((a, b) => a.id - b.id);
  const alive = [];
  for (const r of offices) {
    const bucketOf = () => (r.j >= 0 ? J[r.j].id : expectedJurisdiction(r.st, r.county));
    if (notOperating(r)) { exclude(r, 'not-operating', bucketOf()); continue; }
    if (!r.has) { exclude(r, 'unresolved', bucketOf()); stat.unresolved.push(r); continue; }
    r.j = jurisdictionAt(J, r.lon, r.lat);
    if (r.j < 0) {
      exclude(r, 'outside-boundary', bucketOf());
      const d = distanceToBoundary(J, r.lon, r.lat);
      stat.outsideNear[d <= 5 ? 'within5' : d <= 25 ? 'within25' : 'beyond']++;
      continue;
    }
    const cen = findNear(r.st, r.keys, r.lon, r.lat, RULES.censusRadiusKm, (p) => p.origin === 'census');
    if (cen) { cen.po.push(r); stat.po['merged-census']++; continue; }
    alive.push(r);
  }

  const candidates = [];
  const pending = [];
  for (const r of alive) {
    if (isPost(r)) { exclude(r, 'post-or-camp', J[r.j].id); stat.posts.push(r); } else if (isProperty(r)) { exclude(r, 'property', J[r.j].id); stat.properties.push(r); } else if (CANDIDATE_CLASSES.has(r.cls) && isFortName(r) && !isListedPost(r)) { exclude(r, 'post-or-camp', J[r.j].id); stat.forts.push(r); } else if (CANDIDATE_CLASSES.has(r.cls)) candidates.push(r); else pending.push(r);
  }
  const listedSeen = new Set();
  for (const r of offices) for (const k of r.keys) if (WELL_KNOWN_KEYS.has(`${r.st}|${k}`)) listedSeen.add(`${r.st}|${k}`);
  for (const k of WELL_KNOWN_KEYS) if (!listedSeen.has(k)) throw new Error(`well-known post matches no post-office row: ${k}`);

  // Note: candidate offices of one GNIS feature, or of one name within the duplicate radius, are one place.
  const uf = makeUnionFind(candidates.length);
  const groupBucket = new Map();
  const gnisBucket = new Map();
  candidates.forEach((r, i) => {
    if (r.gnis) { if (gnisBucket.has(r.gnis)) uf.union(gnisBucket.get(r.gnis), i); else gnisBucket.set(r.gnis, i); }
    for (const k of r.keys) {
      const b = `${r.st}|${k}`;
      if (!groupBucket.has(b)) groupBucket.set(b, []);
      for (const j of groupBucket.get(b)) if (gc(r.lat, r.lon, candidates[j].lat, candidates[j].lon) <= RULES.duplicateRadiusKm) uf.union(j, i);
      groupBucket.get(b).push(i);
    }
  });
  const groups = new Map();
  candidates.forEach((r, i) => { const root = uf.find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(r); });
  const rank = (r) => [popcount(officeMask(r) | (r.exact ? 0 : BIT['gnis-fuzzy'])), r.cls === 'Populated Place' ? 0 : 1, r.id];
  const better = (a, b) => { const x = rank(a); const y = rank(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  const poPlaces = [];
  for (const root of [...groups.keys()].sort((a, b) => a - b)) {
    const rows = groups.get(root).sort(better);
    const primary = rows[0];
    const keys = new Set();
    for (const r of rows) for (const k of r.keys) keys.add(k);
    const p = blank({ order: 0, origin: 'po', id: '', name: titleCase(primary.name), st: primary.st, county: primary.county, lon: primary.lon, lat: primary.lat, j: primary.j, keys, coordFrom: 'gnis', po: rows, primary, fort: rows.some(isFortName) });
    poPlaces.push(p);
    stat.po.kept++; stat.po['merged-duplicate'] += rows.length - 1;
  }
  poPlaces.sort((a, b) => a.st < b.st ? -1 : a.st > b.st ? 1 : cmp(a.lat, b.lat) || cmp(a.lon, b.lon) || a.po[0].id - b.po[0].id);
  // Note: an office of the same name and county takes a census row that has no usable point, or whose point lies beyond the census radius of the office.
  const named = (p, keys) => [...keys].some((k) => p.keys.has(k) || p.keys.has(`${k}s`) || p.keys.has(k.replace(/s$/, '')));
  // Note: offices grouped by state in their sorted order, so a search of one state finds the same first match as a search of all.
  const poByState = new Map();
  for (const p of poPlaces) { if (!poByState.has(p.st)) poByState.set(p.st, []); poByState.get(p.st).push(p); }
  const ofState = (st) => poByState.get(st) || [];
  const twinOf = (st, keys, county) => ofState(st).find((p) => sameCounty(p.county, county) && named(p, keys));
  for (const c of unplaced) {
    const host = twinOf(c.st, c.keys, c.county);
    if (host) { host.census.push(c); host.pop = Math.max(host.pop, c.pop); stat.census['merged-office-twin']++; } else stat.census.unplaced++;
  }
  for (const p of places.filter((q) => q.origin === 'census' && !q.po.length)) {
    const host = twinOf(p.st, p.keys, p.county);
    if (!host) continue;
    host.census.push(...p.census); host.pop = Math.max(host.pop, p.pop); host.conflict = true;
    places.splice(places.indexOf(p), 1);
    stat.census.kept--; stat.census['merged-office-twin']++;
  }
  // Note: a row of a two-county geocode that lands on another county's office of its name is the misplaced one of the pair.
  for (const p of places.filter((q) => q.origin === 'census' && shared.has(`${q.lon},${q.lat}`))) {
    const owner = ofState(p.st).find((o) => !sameCounty(o.county, p.county) && named(o, p.keys) && gc(p.lat, p.lon, o.lat, o.lon) <= RULES.censusDuplicateKm);
    if (!owner) continue;
    places.splice(places.indexOf(p), 1);
    stat.census.kept -= p.census.length; stat.census.unplaced += p.census.length;
  }
  places.forEach((p, i) => { p.order = i; });
  for (const p of poPlaces) { p.order = places.length; places.push(p); }
  const poBucket = new Map();
  for (const p of poPlaces) for (const k of p.keys) { const b = `${p.st}|${k}`; if (!poBucket.has(b)) poBucket.set(b, []); poBucket.get(b).push(p); }
  const poByGnis = new Map();
  for (const p of poPlaces) for (const r of p.po) if (r.gnis) poByGnis.set(r.gnis, p);

  for (const r of pending) {
    let host = r.gnis && poByGnis.get(r.gnis);
    if (!host) {
      let best = null;
      for (const k of r.keys) for (const p of poBucket.get(`${r.st}|${k}`) || []) {
        const d = gc(r.lat, r.lon, p.lat, p.lon);
        if (d <= RULES.duplicateRadiusKm && (!best || d < best.d || (d === best.d && p.order < best.p.order))) best = { p, d };
      }
      host = best && best.p;
    }
    if (host) { host.po.push(r); stat.po['merged-duplicate']++; continue; }
    const reason = r.cls === 'Locale' ? 'class-locale' : r.cls === 'Civil' ? 'class-civil' : 'class-other';
    exclude(r, reason, J[r.j].id);
  }
  stat.offices = offices.length;
  return { places, stat, censusRows };
}

// Note: ids are name-st slugs; a clash adds the county, and a remaining clash adds a counter in place order.
function assignIds(places) {
  const taken = new Set();
  const groups = new Map();
  for (const p of places) {
    const base = `${slug(p.name)}-${p.st.toLowerCase()}`;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(p);
  }
  for (const base of [...groups.keys()].sort(cmp)) {
    const list = groups.get(base);
    list.sort((a, b) => cmp(a.lat, b.lat) || cmp(a.lon, b.lon) || a.order - b.order);
    if (list.length === 1) { list[0].id = base; taken.add(base); continue; }
    const seen = new Map();
    for (const p of list) {
      const withCounty = p.county ? `${base}-${slug(p.county)}` : base;
      const n = (seen.get(withCounty) || 0) + 1;
      seen.set(withCounty, n);
      p.id = n === 1 ? withCounty : `${withCounty}-${n}`;
    }
    for (const p of list) taken.add(p.id);
  }
  const ids = new Set();
  for (const p of places) { if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}`); ids.add(p.id); }
}

function finishPlaces(places, J, proj) {
  // Note: a hint matches by normalised name and jurisdiction, must match exactly one place, and only raises the class.
  const hints = SIZE_HINTS.map((h) => ({ ...h, key: `${h.jur}|${normName(h.name)}`, hits: 0, from: null, id: null }));
  const hintOf = new Map(hints.map((h) => [h.key, h]));
  for (const p of places) {
    p.pop = p.pop || 0;
    const pop = p.pop;
    p.size = pop ? SIZE_CLASSES.reduce((s, c) => (pop >= c.min && c.min > 0 ? c.size : s), 0) : 0;
    const hint = hintOf.get(`${J[p.j].id}|${normName(p.name)}`);
    if (hint) {
      hint.hits++; hint.id = p.id; hint.from = p.size;
      if (hint.size > p.size) { p.size = hint.size; p.hinted = true; }
    }
    p.kind = p.size === 4 ? 'city' : p.size >= 2 ? 'town' : 'village';
    const xy = proj.project(p.lon, p.lat);
    p.x = round(xy.x, 1);
    p.y = round(xy.y, 1);
    // Note: the reason mask combines the best office row, the census row and place-level checks.
    let mask = 0;
    {
      if (p.po.length) {
        let best = null;
        for (const r of p.po) { const m = officeMask(r); if (best === null || popcount(m) < popcount(best) || (popcount(m) === popcount(best) && m < best)) best = m; }
        mask = best;
        if (p.census.length) mask &= BIT['disc-1881'] | BIT.gap;
        else {
          if (p.primary && !p.primary.exact) mask |= BIT['gnis-fuzzy'];
          if (!p.po.some((r) => ELIGIBLE_CLASSES.has(r.cls))) mask |= BIT['post-office-only'];
          if (p.fort) mask |= BIT['fort-or-camp'];
        }
      } else mask = BIT['census-only'];
      if (p.conflict) mask |= BIT['coord-conflict'];
      if (!matchesState(J[p.j].id, p.st, p.county)) mask |= BIT['jurisdiction-differs'];
      if (p.hinted) mask |= BIT['size-hint'];
    }
    p.mask = mask;
  }
  for (const h of hints) if (h.hits !== 1) throw new Error(`size hint ${h.name} (${h.jur}) matches ${h.hits} places`);
  return hints;
}

// Note: coordinate conflicts between a census point and an exact GNIS populated-place point are flagged after the merge.
function flagConflicts(places) {
  for (const p of places) {
    if (!p.census.length) continue;
    for (const r of p.po) if (r.exact && r.cls === 'Populated Place' && gc(r.lat, r.lon, p.lat, p.lon) > RULES.conflictKm) p.conflict = true;
  }
}

function regionOf(lon, lat) {
  for (let i = 0; i < REGION_DEFS.length; i++) if (ringContains(REGION_DEFS[i].poly, lon, lat)) return { index: i, fallback: false };
  let best = 0;
  let bestD = Infinity;
  REGION_DEFS.forEach((r, i) => {
    const cx = r.poly.reduce((s, q) => s + q[0], 0) / r.poly.length;
    const cy = r.poly.reduce((s, q) => s + q[1], 0) / r.poly.length;
    const d = gc(lat, lon, cy, cx);
    if (d < bestD) { bestD = d; best = i; }
  });
  return { index: best, fallback: true };
}

// Note: the route graph; nearest neighbours under a cap, then minimum-spanning-tree bridges between components; home is the place wagon reach is measured from.
function buildGraph(places, home) {
  const n = places.length;
  const lat = Float64Array.from(places, (p) => p.lat);
  const lon = Float64Array.from(places, (p) => p.lon);
  const cosLat = Float64Array.from(places, (p) => Math.cos((p.lat * Math.PI) / 180));
  const capGc = RULES.neighbourCapKm / RULES.winding;
  const km = (a, b) => Math.max(1, Math.round(gc(lat[a], lon[a], lat[b], lon[b]) * RULES.winding));
  const pairKey = (a, b) => (a < b ? a * n + b : b * n + a);

  // Note: candidate neighbour lists hold every place within the latitude band and the cap, found through a grid so the work stays near n times the band size.
  const cand = Array.from({ length: n }, () => []);
  const nn = new Float64Array(n).fill(Infinity);
  const band = capGc / RULES.kmPerDegLat;
  // Note: a pair further apart in longitude than lonBand is beyond the cap at any latitude of the data (haversine with the smallest cosine), so it is skipped before the exact distance; the 1 % margin keeps the bound safe.
  const cosMin = cosLat.reduce((m, c) => Math.min(m, c), 1);
  const lonBand = Math.min(360, (1.01 * 2 * Math.asin(Math.min(1, Math.sin(capGc / (2 * RULES.earthKm)) / cosMin)) * 180) / Math.PI);
  // Note: a grid of band by lonBand cells; the 3 by 3 cells around a place hold every other place within both bands, which is the set the latitude scan visits.
  const cellOf = (la, lo) => `${Math.floor(la / band)}|${Math.floor(lo / lonBand)}`;
  const grid = new Map();
  for (let i = 0; i < n; i++) { const k = cellOf(lat[i], lon[i]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); }
  for (let i = 0; i < n; i++) {
    // Note: only the first candidateNeighbours in (distance, index) order are kept, by insertion, which equals sorting the whole list and cutting it.
    const top = [];
    const k = RULES.candidateNeighbours;
    const ci = Math.floor(lat[i] / band); const cj = Math.floor(lon[i] / lonBand);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const j of grid.get(`${ci + di}|${cj + dj}`) || []) {
        if (j === i || Math.abs(lat[j] - lat[i]) > band || Math.abs(lon[j] - lon[i]) > lonBand) continue;
        const d = gc(lat[i], lon[i], lat[j], lon[j]);
        if (d > capGc) continue;
        if (top.length === k && (d > top[k - 1][0] || (d === top[k - 1][0] && j > top[k - 1][1]))) continue;
        let at = top.length;
        while (at > 0 && (top[at - 1][0] > d || (top[at - 1][0] === d && top[at - 1][1] > j))) at--;
        top.splice(at, 0, [d, j]);
        if (top.length > k) top.pop();
      }
    }
    cand[i] = top;
    if (top.length) nn[i] = top[0][0];
  }
  for (let i = 0; i < n; i++) {
    if (nn[i] !== Infinity) continue;
    for (let j = 0; j < n; j++) if (j !== i) { const d = gc(lat[i], lon[i], lat[j], lon[j]); if (d < nn[i]) nn[i] = d; }
  }

  // Note: Prim over the complete graph with a flat-earth distance estimate; only the choice of tree edges uses it.
  const mstEdges = (banned) => {
    const touched = new Uint8Array(n);
    for (const k of banned) { touched[Math.floor(k / n)] = 1; touched[k % n] = 1; }
    // Note: the vertices not yet in the tree are kept in packed arrays (vertex, key, parent, coordinates) and removed by swapping in the last, so the quadratic loops read memory in order.
    const rv = Int32Array.from({ length: n }, (_, i) => i);
    const rk = new Float64Array(n).fill(Infinity);
    const rp = new Int32Array(n).fill(-1);
    const rlon = Float64Array.from(lon);
    const rlat = Float64Array.from(lat);
    const rcos = Float64Array.from(cosLat);
    const rt = Uint8Array.from(touched);
    let left = n;
    rk[0] = 0;
    const edges = [];
    // Note: the next vertex is chosen during the key update, in one pass; the order (smaller key, then smaller index) does not depend on the scan order.
    let at = 0;
    while (left > 0) {
      const u = rv[at];
      const best = rk[at];
      if (best === Infinity) break;
      if (rp[at] >= 0) edges.push([rp[at], u, best]);
      const lu = rlon[at]; const au = rlat[at]; const cu = rcos[at];
      const last = --left;
      rv[at] = rv[last]; rk[at] = rk[last]; rp[at] = rp[last]; rlon[at] = rlon[last]; rlat[at] = rlat[last]; rcos[at] = rcos[last]; rt[at] = rt[last];
      const uTouched = touched[u] === 1;
      at = 0;
      let atKey = Infinity;
      let atV = n;
      for (let i = 0; i < left; i++) {
        const v = rv[i];
        let kv = rk[i];
        if (!(uTouched && rt[i] && banned.has(pairKey(u, v)))) {
          const dx = (lu - rlon[i]) * 0.5 * (cu + rcos[i]);
          const dy = au - rlat[i];
          const d = dx * dx + dy * dy;
          if (d < kv) { rk[i] = d; rp[i] = u; kv = d; }
        }
        if (kv < atKey || (kv === atKey && v < atV)) { at = i; atKey = kv; atV = v; }
      }
    }
    return edges;
  };

  let treeMemo = null;
  const assemble = (banned) => {
    const edges = [];
    const have = new Set();
    const uf = makeUnionFind(n);
    for (let i = 0; i < n; i++) {
      let taken = 0;
      for (const [d, j] of cand[i]) {
        if (taken >= RULES.neighbours) break;
        const k = pairKey(i, j);
        if (banned.has(k)) continue;
        taken++;
        if (have.has(k)) continue;
        const e = { a: Math.min(i, j), b: Math.max(i, j), km: km(i, j), road: false, bridge: false };
        if (e.km > RULES.neighbourCapKm) continue;
        have.add(k); edges.push(e); uf.union(i, j);
      }
    }
    // Note: the tree is reused when no banned pair is one of its edges, because Prim then picks the same edges.
    if (!treeMemo || treeMemo.edges.some(([x, y]) => banned.has(pairKey(x, y)))) {
      treeMemo = { edges: mstEdges(banned).sort((x, y) => x[2] - y[2] || x[0] - y[0] || x[1] - y[1]) };
    }
    const tree = treeMemo.edges;
    let bridges = 0;
    for (const [a, b] of tree) {
      if (uf.find(a) === uf.find(b)) continue;
      const k = pairKey(a, b);
      uf.union(a, b); have.add(k); bridges++;
      edges.push({ a: Math.min(a, b), b: Math.max(a, b), km: km(a, b), road: false, bridge: true });
    }
    return { edges: edges.sort((x, y) => x.a - y.a || x.b - y.b), bridges };
  };

  // Note: shortest distances from one place; wagon follows road edges only.
  const adjacency = (edges, wagon) => {
    const adj = Array.from({ length: n }, () => []);
    for (const e of edges) { if (wagon && !e.road) continue; adj[e.a].push([e.b, e.km]); adj[e.b].push([e.a, e.km]); }
    return adj;
  };
  // Note: callers that search from several sources over unchanged edges pass the adjacency once.
  const dijkstra = (edges, source, wagon, adj = adjacency(edges, wagon)) => {
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const heap = [[0, source]];
    dist[source] = 0;
    const push = (item) => { let i = heap.length; heap.push(item); while (i > 0) { const par = (i - 1) >> 1; if (heap[par][0] < item[0] || (heap[par][0] === item[0] && heap[par][1] <= item[1])) break; heap[i] = heap[par]; i = par; } heap[i] = item; };
    const pop = () => {
      const top = heap[0]; const last = heap.pop();
      if (heap.length) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= heap.length) break;
          if (c + 1 < heap.length && (heap[c + 1][0] < heap[c][0] || (heap[c + 1][0] === heap[c][0] && heap[c + 1][1] < heap[c][1]))) c++;
          if (heap[c][0] > last[0] || (heap[c][0] === last[0] && heap[c][1] >= last[1])) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = last;
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      for (const [v, w] of adj[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([d + w, v]); }
    }
    return { dist, prev };
  };
  const edges = assemble(new Set()).edges;

  // Note: road flags are a documented guess.
  const sizes = places.map((p) => p.size);
  const rough = places.map((p) => ROUGH_REGIONS.has(REGION_DEFS[p.region].id));
  for (const e of edges) {
    const lo = Math.min(sizes[e.a], sizes[e.b]);
    e.road = lo >= 2 || (lo >= 1 && e.km <= 150) || (e.km <= 60 && !rough[e.a] && !rough[e.b]);
  }
  const baseRoads = edges.filter((e) => e.road).length;

  // Note: connectivity pass; shortest routes between places of size class 1 or more become roads, so a wagon can cross the whole map.
  const terminal = places.map((p, i) => sizes[i] >= 1);
  const plan = Array.from({ length: n }, () => []);
  edges.forEach((e, k) => { if (e.km <= RULES.roadEdgeCapKm) { plan[e.a].push([e.b, e.km, k]); plan[e.b].push([e.a, e.km, k]); } });
  const near = new Float64Array(n).fill(Infinity);
  const owner = new Int32Array(n).fill(-1);
  const upEdge = new Int32Array(n).fill(-1);
  const upNode = new Int32Array(n).fill(-1);
  const queue = [];
  const qpush = (item) => {
    let i = queue.length; queue.push(item);
    while (i > 0) { const q = (i - 1) >> 1; if (queue[q][0] < item[0] || (queue[q][0] === item[0] && queue[q][1] <= item[1])) break; queue[i] = queue[q]; i = q; }
    queue[i] = item;
  };
  const qpop = () => {
    const top = queue[0]; const last = queue.pop();
    if (queue.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= queue.length) break;
        if (c + 1 < queue.length && (queue[c + 1][0] < queue[c][0] || (queue[c + 1][0] === queue[c][0] && queue[c + 1][1] < queue[c][1]))) c++;
        if (queue[c][0] > last[0] || (queue[c][0] === last[0] && queue[c][1] >= last[1])) break;
        queue[i] = queue[c]; i = c;
      }
      queue[i] = last;
    }
    return top;
  };
  for (let i = 0; i < n; i++) if (terminal[i]) { near[i] = 0; owner[i] = i; qpush([0, i]); }
  while (queue.length) {
    const [d, u] = qpop();
    if (d > near[u]) continue;
    for (const [v, w, k] of plan[u]) if (d + w < near[v]) { near[v] = d + w; owner[v] = owner[u]; upEdge[v] = k; upNode[v] = u; qpush([d + w, v]); }
  }
  let forestEdges = 0;
  const mark = (v) => { while (upEdge[v] >= 0) { if (!edges[upEdge[v]].road) { edges[upEdge[v]].road = true; forestEdges++; } v = upNode[v]; } };
  const links = [];
  edges.forEach((e, k) => { if (e.km <= RULES.roadEdgeCapKm && owner[e.a] >= 0 && owner[e.b] >= 0 && owner[e.a] !== owner[e.b]) links.push([near[e.a] + e.km + near[e.b], k]); });
  links.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const forest = makeUnionFind(n);
  for (const [, k] of links) {
    const e = edges[k];
    if (forest.find(owner[e.a]) === forest.find(owner[e.b])) continue;
    forest.union(owner[e.a], owner[e.b]);
    mark(e.a); mark(e.b);
    if (!e.road) { e.road = true; forestEdges++; }
  }
  let villageEdges = 0;
  for (let i = 0; i < n; i++) {
    if (terminal[i] || owner[i] < 0 || gc(lat[i], lon[i], lat[owner[i]], lon[owner[i]]) > RULES.villageRoadKm) continue;
    const before = forestEdges; mark(i); villageEdges += forestEdges - before;
  }
  forestEdges -= villageEdges;
  const bridgeEdges = edges.filter((e) => e.bridge).length;
  return { edges, nn, bridgeEdges, baseRoads, forestEdges, villageEdges, wagonFromTombstone: dijkstra(edges, home, true).dist };
}

// Note: Douglas-Peucker over a ring; the ring is split at the point farthest from its start so the closing segment cannot collapse.
function simplifyRing(points, tol) {
  const n = points.length;
  if (n <= 4) return points;
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const keep = new Uint8Array(n);
  let far = 1;
  let farD = -1;
  for (let i = 1; i < n - 1; i++) { const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]); if (d > farD) { farD = d; far = i; } }
  keep[0] = keep[far] = keep[n - 1] = 1;
  const stack = [[0, far], [far, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = -1; let idx = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(points[i], points[a], points[b]); if (d > max) { max = d; idx = i; } }
    if (max > tol && idx >= 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = points.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : points;
}
// Note: the length simplifyRing would return for any tolerance; the splits do not depend on the tolerance, only whether each is taken, so the full split tree is built once and walked per tolerance.
function simplifiedLength(points) {
  const n = points.length;
  if (n <= 4) return () => n;
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  let far = 1;
  let farD = -1;
  for (let i = 1; i < n - 1; i++) { const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]); if (d > farD) { farD = d; far = i; } }
  const nodes = [];
  const split = (a, b) => {
    let max = -1; let idx = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(points[i], points[a], points[b]); if (d > max) { max = d; idx = i; } }
    const node = { max, idx, kids: [] };
    nodes.push([node, a, b]);
    return node;
  };
  const roots = [split(0, far), split(far, n - 1)];
  for (let k = 0; k < nodes.length; k++) {
    const [node, a, b] = nodes[k];
    if (node.idx >= 0) node.kids = [split(a, node.idx), split(node.idx, b)];
  }
  const kept = new Set([0, far, n - 1]).size;
  return (tol) => {
    let count = kept;
    const stack = [...roots];
    while (stack.length) {
      const node = stack.pop();
      if (node.max > tol && node.idx >= 0) { count++; stack.push(...node.kids); }
    }
    return count >= 4 ? count : n;
  };
}
function buildOutlines(geo, J, proj) {
  const rings = [];
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const parts = polys.map((r) => r[0].map(([lo, la]) => { const q = proj.project(lo, la); return [q.x, q.y]; }));
    const area = (pts) => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0)) / 2;
    const sized = parts.map((pts) => ({ pts, area: area(pts) })).sort((a, b) => b.area - a.area);
    sized.forEach((s, i) => { if (i === 0 || s.area >= RULES.minRingKm2) rings.push({ id: f.properties.ID, pts: s.pts, area: s.area }); });
  }
  const lengths = rings.map((r) => simplifiedLength(r.pts));
  const total = (tol) => lengths.reduce((s, len) => s + len(tol), 0);
  let lo = 0.05;
  let hi = 40;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (total(mid) > RULES.outlineMaxPoints) lo = mid; else hi = mid; }
  const tol = Math.ceil(hi * 1000) / 1000;
  const outlines = {};
  let points = 0;
  let count = 0;
  for (const r of rings) {
    const s = simplifyRing(r.pts, tol).map(([x, y]) => [round(x, 1), round(y, 1)]);
    s[s.length - 1] = [s[0][0], s[0][1]];
    (outlines[r.id] || (outlines[r.id] = [])).push(s);
    points += s.length; count++;
  }
  const all = geo.features.reduce((s, f) => s + (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat(1)).reduce((t, ring) => t + ring.length, 0), 0);
  const ordered = {};
  for (const j of J) if (outlines[j.id]) ordered[j.id] = outlines[j.id];
  return { outlines: ordered, stats: { tolerance: tol, points, rings: count, sourcePoints: all, droppedRings: geo.features.reduce((s, f) => s + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0) - count } };
}

// Note: services are inferred from size class, a few legal circumstances and a per-place hash; never evidence.
function inferServices(p, nnKm) {
  const r = SERVICE_RULES[p.size];
  const u = (s) => unit(p.id, s);
  const jur = p.jurId;
  const saloonP = r.saloon * (jur in SALOON_FACTOR ? SALOON_FACTOR[jur] : 1);
  const levels = DOCTOR_LEVELS[p.size];
  const doctor = u('doctor') < r.doctor ? levels[Math.min(levels.length - 1, Math.floor(u('doctor-level') * levels.length))] : 0;
  let store = 0;
  if (u('store') < r.store) store = Math.min(1.7, Math.max(0.9, Math.round((STORE_BASE[p.size] + (nnKm > 40 ? 0.1 : 0) + (u('price') - 0.5) * 0.2) * 20) / 20));
  const s = { doctor, store, livery: u('livery') < r.livery, recruit: u('recruit') < r.recruit, notices: u('notices') < r.notices, ask: u('ask') < r.ask };
  if (u('saloon') < saloonP) {
    const games = [];
    if (u('poker') < r.poker) games.push('poker');
    if (u('faro') < r.faro) games.push('faro');
    s.saloon = { meal: u('meal') < r.meal, games };
  }
  return s;
}
const FLAGS = { livery: 1, recruit: 2, notices: 4, ask: 8, saloon: 16, meal: 32, poker: 64, faro: 128 };
function encodeServices(s) {
  let f = 0;
  for (const k of ['livery', 'recruit', 'notices', 'ask']) if (s[k]) f |= FLAGS[k];
  if (s.saloon) { f |= FLAGS.saloon; if (s.saloon.meal) f |= FLAGS.meal; if (s.saloon.games.includes('poker')) f |= FLAGS.poker; if (s.saloon.games.includes('faro')) f |= FLAGS.faro; }
  return [s.doctor, s.store, f];
}

// Note: a value-to-source printer with single quotes and bare keys, so the generated module reads like the rest of the code.
function lit(v) {
  if (v === null) return 'null';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('non-finite number'); return Object.is(v, -0) ? '0' : String(v); }
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/\n/g, '\\n')}'`;
  if (Array.isArray(v)) return `[${v.map(lit).join(',')}]`;
  return `{ ${Object.keys(v).map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}: ${lit(v[k])}`).join(', ')} }`;
}
const litLines = (arr) => `[\n${arr.map((x) => `  ${lit(x)},`).join('\n')}\n]`;

// Note: bulk tables go out as one JSON.parse of a single-quoted string with one row per line; the engine scans a string far faster than it compiles an array literal.
function jsonText(v) {
  return JSON.stringify(v, (k, x) => {
    if (typeof x === 'number' && !Number.isFinite(x)) throw new Error('non-finite number');
    return x;
  });
}
const quoted = (text) => text.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
const jsonRows = (arr) => `JSON.parse('[\\\n${arr.map((x) => quoted(jsonText(x))).join(',\\\n')}\\\n]')`;
const jsonTable = (obj) => `JSON.parse('{\\\n${Object.keys(obj).map((k) => `${JSON.stringify(k)}:${quoted(jsonText(obj[k]))}`).join(',\\\n')}\\\n}')`;

const DECODER = `
// Note: project and unproject use the same equirectangular scheme as world.js, with the cosine of the point's own latitude.
export function project(lon, lat) {
  return { x: (lon - PROJECTION.lon0) * PROJECTION.kmPerDegLon * Math.cos((lat * Math.PI) / 180), y: -(lat - PROJECTION.lat0) * PROJECTION.kmPerDegLat };
}
export function unproject(x, y) {
  const lat = PROJECTION.lat0 - y / PROJECTION.kmPerDegLat;
  return { lon: PROJECTION.lon0 + x / (PROJECTION.kmPerDegLon * Math.cos((lat * Math.PI) / 180)), lat };
}

// Note: services tuple [doctor, store, flags] becomes the object shape of world.js; a missing saloon flag means no saloon key.
export function decodeServices(svc) {
  const f = svc[2];
  const s = { doctor: svc[0], store: svc[1], livery: !!(f & 1), recruit: !!(f & 2), notices: !!(f & 4), ask: !!(f & 8) };
  if (f & 16) s.saloon = { meal: !!(f & 32), games: [...(f & 64 ? ['poker'] : []), ...(f & 128 ? ['faro'] : [])] };
  return s;
}

// Note: one tuple becomes one plain object; reasons lists the uncertainty reason ids and src lists [source id, row id] pairs.
export function decodeSettlement(t) {
  return {
    id: t[0], name: t[1], jur: JURISDICTIONS[t[2]].id, lon: t[3], lat: t[4], x: t[5], y: t[6], pop: t[7] || null, size: t[8], kind: t[9],
    region: REGIONS[t[10]].id, src: t[11].map(([s, row]) => [SOURCE_TABLE[s].id, row]), uncertain: t[12] !== 0,
    reasons: UNCERTAINTY_REASONS.filter((r, i) => t[12] & (1 << i)).map((r) => r.id), services: decodeServices(t[13]),
  };
}
let decoded = null;
export function allSettlements() {
  if (!decoded) decoded = SETTLEMENTS.map(decodeSettlement);
  return decoded;
}

// Note: edges with ids; a route is [a, b, km, road] with a and b indexes into SETTLEMENTS and road 1 or 0.
export function routeEdges() {
  return ROUTE_EDGES.map(([a, b, km, road]) => ({ a: SETTLEMENTS[a][0], b: SETTLEMENTS[b][0], km, road: road === 1 }));
}

// Note: first region polygon that contains the point; null means no polygon matched.
export function regionAt(lon, lat) {
  for (const r of REGIONS) {
    let inside = false;
    for (let i = 0, j = r.poly.length - 1; i < r.poly.length; j = i++) {
      const [xi, yi] = r.poly[i];
      const [xj, yj] = r.poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return r.id;
  }
  return null;
}
`;

export function build() {
  const poRaw = parseCsv(readFileSync(ROOT(INPUTS.po), 'utf8'));
  const censusRaw = parseCsv(readFileSync(ROOT(INPUTS.census), 'utf8'));
  const geo = JSON.parse(readFileSync(ROOT(INPUTS.geo), 'utf8'));
  const J = buildJurisdictions(geo);

  // Note: the projection origin is the Tombstone post-office row of the data, not a remembered value.
  const origin = poRaw.find((r) => r.Name === 'TOMBSTONE' && r.State === 'AZ');
  const proj = makeProjection(Number(origin.Longitude), Number(origin.Latitude));

  const inv = inventory(poRaw, censusRaw, J, proj);
  const places = inv.places;
  assignIds(places);
  flagConflicts(places);
  const hints = finishPlaces(places, J, proj);

  // Note: order is ascending id, so indexes in ROUTE_EDGES are stable.
  const ordered = places.slice().sort((a, b) => cmp(a.id, b.id));
  ordered.forEach((p, i) => { p.index = i; p.jurId = J[p.j].id; });

  let fallbackRegions = 0;
  for (const p of ordered) { const r = regionOf(p.lon, p.lat); p.region = r.index; if (r.fallback) fallbackRegions++; }

  const tombstone = ordered.findIndex((p) => p.id === 'tombstone-az');
  if (tombstone < 0) throw new Error('no Tombstone in the data');
  const graph = buildGraph(ordered, tombstone);
  ordered.forEach((p, i) => { p.services = inferServices(p, graph.nn[i]); });
  const out = buildOutlines(geo, J, proj);

  const census = inv.censusRows;
  const stat = inv.stat;

  // Note: the watch list reports kept places first, then the recorded exclusion reasons, else absence from both extracts.
  const watch = WATCH.map(([name, st]) => {
    const k = normName(name);
    const hit = ordered.find((p) => p.st === st && p.keys.has(k));
    const why = [...new Set(stat.fates.filter((f) => f.key === `${st}|${k}`).map((f) => f.reason))].sort(cmp);
    return [name, st, hit ? `kept as ${hit.id}` : why.length ? `excluded: ${why.join(', ')}` : 'in neither extract'];
  });

  // Note: wagon reach from Tombstone over road edges only, for the audit and the tests.
  const wd = graph.wagonFromTombstone;
  const terminals = ordered.filter((p) => p.size >= 1);
  const wagon = {
    reachable: ordered.filter((p, i) => wd[i] < Infinity).length,
    terminals: terminals.length,
    terminalsReached: terminals.filter((p) => wd[p.index] < Infinity).length,
    targets: WAGON_TARGETS.map((id) => { const q = ordered.find((p) => p.id === id); return [id, q && wd[q.index] < Infinity ? Math.round(wd[q.index]) : null]; }),
  };

  // Note: settlement tuple order is documented in SETTLEMENT_FIELDS.
  const tuples = ordered.map((p) => {
    const src = [];
    for (const r of [...p.po].sort((a, b) => a.id - b.id)) src.push([SRC.po, r.id]);
    for (const c of [...p.census].sort((a, b) => a.id - b.id)) src.push([SRC.cs, c.id]);
    return [p.id, p.name, p.j, p.lon, p.lat, p.x, p.y, p.pop, p.size, p.kind, p.region, src, p.mask, encodeServices(p.services)];
  });
  const edges = graph.edges.map((e) => [e.a, e.b, e.km, e.road ? 1 : 0]);
  for (const e of edges) if (e[2] > RULES.maxEdgeKm) throw new Error(`edge ${e[0]}-${e[1]} is ${e[2]} km, over the cap of ${RULES.maxEdgeKm}`);

  // Note: counts for the audit; every number the report states comes from this object.
  const kept = { total: ordered.length, byJurisdiction: {}, bySize: [0, 0, 0, 0, 0], byKind: {}, withPopulation: 0, fromPostOffices: 0, fromCensusOnly: 0, withBoth: 0, fortOrCamp: { total: 0, byJurisdiction: Object.fromEntries(J.map((j) => [j.id, 0])) } };
  for (const j of J) kept.byJurisdiction[j.id] = { total: 0, sizes: [0, 0, 0, 0, 0] };
  const uncertain = { total: 0, byReason: Object.fromEntries(REASONS.map((r) => [r.id, 0])) };
  const regionCounts = Object.fromEntries(REGION_DEFS.map((r) => [r.id, 0]));
  const svc = { noServices: 0, noSaloon: 0, saloon: 0, store: 0, doctor: 0, livery: 0, recruit: 0, notices: 0, ask: 0, gamesSets: {} };
  for (const p of ordered) {
    kept.byJurisdiction[p.jurId].total++; kept.byJurisdiction[p.jurId].sizes[p.size]++; kept.bySize[p.size]++; bump(kept.byKind, p.kind);
    if (p.pop) kept.withPopulation++;
    if (p.mask & BIT['fort-or-camp']) { kept.fortOrCamp.total++; kept.fortOrCamp.byJurisdiction[p.jurId]++; }
    if (p.po.length && p.census.length) kept.withBoth++; else if (p.po.length) kept.fromPostOffices++; else kept.fromCensusOnly++;
    if (p.mask) { uncertain.total++; REASONS.forEach((r, i) => { if (p.mask & (1 << i)) uncertain.byReason[r.id]++; }); }
    regionCounts[REGION_DEFS[p.region].id]++;
    const s = p.services;
    if (!s.doctor && !s.store && !s.livery && !s.recruit && !s.notices && !s.ask && !s.saloon) svc.noServices++;
    if (s.saloon) { svc.saloon++; bump(svc.gamesSets, s.saloon.games.length ? s.saloon.games.join('+') : 'none'); } else svc.noSaloon++;
    if (s.store) svc.store++; if (s.doctor) svc.doctor++; if (s.livery) svc.livery++; if (s.recruit) svc.recruit++; if (s.notices) svc.notices++; if (s.ask) svc.ask++;
  }
  const exclusionMatrix = {};
  for (const reason of PO_EXCLUSIONS) { exclusionMatrix[reason] = {}; for (const j of J) exclusionMatrix[reason][j.id] = stat.exclusions[reason][j.id] || 0; const none = stat.exclusions[reason].none || 0; if (none) exclusionMatrix[reason].none = none; }
  const unresolvedBy = {};
  for (const r of stat.unresolved) bump(unresolvedBy, expectedJurisdiction(r.st, r.county));
  const edgeKms = edges.map((e) => e[2]);
  const counts = {
    snapshot: RULES.snapshot,
    input: { postOfficeRows: stat.offices, censusRows: census.length },
    postOfficeDispositions: stat.po,
    censusDispositions: stat.census,
    exclusionsByJurisdiction: exclusionMatrix,
    unresolved: { total: stat.unresolved.length, byJurisdiction: Object.fromEntries(Object.keys(unresolvedBy).sort(cmp).map((k) => [k, unresolvedBy[k]])) },
    outsideBoundaryNearMiss: stat.outsideNear,
    kept,
    uncertain,
    services: svc,
    regions: { byRegion: regionCounts, fallbackAssignments: fallbackRegions },
    hints: { total: hints.length, raised: hints.filter((h) => h.size > h.from).length, list: hints.map((h) => [h.id, h.name, h.jur, h.from, h.size, h.size > h.from ? 1 : 0, h.why]) },
    watch,
    routes: {
      edges: edges.length, roadEdges: edges.filter((e) => e[3] === 1).length, bridgeEdges: graph.bridgeEdges,
      maxEdgeKm: Math.max(...edgeKms), neighbourCapKm: RULES.neighbourCapKm, maxEdgeCapKm: RULES.maxEdgeKm,
      roadBaseEdges: graph.baseRoads, roadForestEdges: graph.forestEdges, roadVillageEdges: graph.villageEdges, roadShare: round(edges.filter((e) => e[3] === 1).length / edges.length, 3),
      wagon,
    },
    outlines: out.stats,
    projection: { lon0: proj.lon0, lat0: proj.lat0 },
  };

  const jurisdictions = J.map((j) => ({ id: j.id, name: j.name, abbr: j.abbr, type: j.type }));
  const regions = REGION_DEFS.map((r) => ({ id: r.id, name: r.name, climate: r.climate, note: r.note, approx: true, poly: r.poly }));
  const header = [
    '// Attention: generated by scripts/western-build-world.mjs from public/western/data; do not edit by hand.',
    '// Note: snapshot date is 12 September 1881; every number is a candidate from period-derived datasets, not a proof of existence or completeness.',
    '// Note: `node scripts/western-build-world.mjs --audit` prints the rules, approximations, gaps and counts.',
  ].join('\n');
  const moduleText = [
    header,
    '',
    `export const SNAPSHOT = ${lit(RULES.snapshot)};`,
    `export const PROJECTION = ${lit({ lon0: proj.lon0, lat0: proj.lat0, kmPerDegLon: RULES.kmPerDegLon, kmPerDegLat: RULES.kmPerDegLat, note: 'x east and y south in km from Tombstone; x = (lon - lon0) * 111.32 * cos(lat), y = -(lat - lat0) * 111.2' })};`,
    `export const JURISDICTIONS = ${litLines(jurisdictions)};`,
    `export const REGIONS = ${litLines(regions)};`,
    `export const SOURCE_TABLE = ${litLines(SOURCE_TABLE)};`,
    `export const UNCERTAINTY_REASONS = ${litLines(REASONS)};`,
    `export const SIZE_CLASSES = ${litLines(SIZE_CLASSES)};`,
    `export const ROUTE_RULES = ${lit({ winding: RULES.winding, neighbours: RULES.neighbours, neighbourCapKm: RULES.neighbourCapKm, maxEdgeKm: RULES.maxEdgeKm })};`,
    `export const SETTLEMENT_FIELDS = ${lit(['id', 'name', 'jur', 'lon', 'lat', 'x', 'y', 'pop', 'size', 'kind', 'region', 'src', 'unc', 'svc'])};`,
    '// Note: jur indexes JURISDICTIONS, region indexes REGIONS, src holds [index in SOURCE_TABLE, row id] pairs, unc is a mask over UNCERTAINTY_REASONS, pop 0 means unknown.',
    '// Note: the three big tables are JSON text parsed once, one row per line, so the module loads far faster than as array literals.',
    `export const SETTLEMENTS = ${jsonRows(tuples)};`,
    `export const ROUTE_EDGES = ${jsonRows(edges)};`,
    '// Note: outlines are ring lists of projected [x, y] km per jurisdiction id, simplified with Douglas-Peucker.',
    `export const OUTLINES = ${jsonTable(out.outlines)};`,
    `export const AUDIT_COUNTS = ${lit(counts)};`,
    DECODER.trimEnd(),
    '',
  ].join('\n');

  return { moduleText, auditText: renderAudit({ counts, J, ordered, stat, out, graph, census, regions: REGION_DEFS }), counts, places: ordered, edges };
}

// Note: the audit is rendered from the same counts object that the module exports.
function renderAudit({ counts, J, ordered, stat, out, graph, census, regions }) {
  const jn = (id) => (J.find((j) => j.id === id) || { name: id }).name;
  // Note: a column is right-aligned only when every cell is a plain number.
  const table = (head, rows) => {
    const numeric = head.map((h, i) => rows.every((r) => /^-?[\d,.]+$/.test(String(r[i]))));
    return [`| ${head.join(' | ')} |`, `|${numeric.map((n) => (n ? ' ---: ' : ' --- ')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
  };
  const c = counts;
  const L = [];
  const p = (s = '') => L.push(s);
  p('# Prototype 3 world inventory audit');
  p();
  p('Generated by `scripts/western-build-world.mjs`; do not edit by hand. Every number below comes from the `AUDIT_COUNTS` object of `public/western/js/camp/world-data.js`, which the last section reproduces.');
  p();
  p('## 1. Scope and honest summary');
  p();
  p(`1. Snapshot date: ${c.snapshot} (item 242). Settlements never appear or disappear with campaign time.`);
  p('2. Boundary: the 22 jurisdictions of `data/1881-jurisdictions.geojson` (item 234). A place outside every polygon is excluded.');
  p(`3. Result: ${commas(c.kept.total)} candidate settlements; the game adds no hand-made places. This is a candidate inventory derived from two datasets. It is not a complete list of 1881 settlements and cannot be shown to be one.`);
  p(`4. ${commas(c.kept.fromCensusOnly)} places rest on the 1880 census compilation alone and ${commas(c.uncertain.total)} places carry at least one uncertainty reason.`);
  p(`5. ${commas(c.unresolved.total)} post-office rows have no coordinate and are not placed.`);
  p(`6. ${commas(c.uncertain.byReason['post-office-only'])} places rest on GNIS post-office features alone and carry the reason \`post-office-only\`; they are offices that may have been a shop, a ranch or a stage stop, not necessarily a settlement.`);
  p('7. Nothing here proves that a place had shops, saloons, doctors or any other service. Services are inferred (section 7).');
  p();
  p('## 2. Sources');
  p();
  p(table(['Code', 'Source', 'Rows', 'Use'], SOURCE_TABLE.map((s, i) => [s.id, s.label, String(s.rows), s.use])));
  p();
  p('The builder reads the extracts unchanged. Both datasets use modern place names and modern state assignment as a research filter; a present-day name or a GNIS designation alone does not prove a settlement existed in 1881 (item 238).');
  p();
  p('## 3. Reconciliation: every input row has exactly one outcome');
  p();
  p(`Post-office rows in: ${commas(c.input.postOfficeRows)}. Census rows in: ${c.input.censusRows}.`);
  p();
  p(table(['Post-office row outcome', 'Rows'], PO_DISPOSITIONS.map((d) => [d, commas(c.postOfficeDispositions[d])])));
  p();
  p(`Sum: ${commas(PO_DISPOSITIONS.reduce((s, d) => s + c.postOfficeDispositions[d], 0))} (must equal the input).`);
  p();
  p(table(['Census row outcome', 'Rows'], CENSUS_DISPOSITIONS.map((d) => [d, String(c.censusDispositions[d])])));
  p();
  p(`Census rows named for an institution (an asylum, prison or hospital) are \`institution\`. A row whose geocode lies outside its own state, or on a point shared by ${STACKED_ROWS} or more rows (a geocoder fallback such as a state centre), joins an office of the same name and county as \`merged-office-twin\`, a trailing plural s aside (Haywards for Hayward); without such an office it is \`unplaced\`. A census place whose own office twin lies beyond the census radius joins it too, and the place carries \`coord-conflict\`. Rows of two counties on one geocode, such as Cherokee in Butte and Nevada counties, stay where the geocode puts them and carry \`coord-conflict\`, as one of them at least is misplaced; a row that lands on another county's office of its name is left \`unplaced\`, such as Grizzly Flat of Placer County.`);
  p();
  p(`Sum: ${CENSUS_DISPOSITIONS.reduce((s, d) => s + c.censusDispositions[d], 0)} (must equal the input).`);
  p();
  p(`Places = ${c.censusDispositions.kept} from census rows + ${c.postOfficeDispositions.kept} from post-office rows = ${commas(c.kept.total)}.`);
  p();
  p('Merges: a census row within 5 km of another with the same name joins that one. Post-office rows join a census place (35 km, same state and name), then each other by GNIS feature id or the same name within 8 km. A row whose GNIS match is only a post-office, locale or other non-settlement feature joins an existing place by name within 8 km, otherwise it is excluded.');
  p();
  p('## 4. Rules, in the order applied to a post-office row');
  p();
  p('1. `not-operating`: Established after 1881 or Discontinued before 1881. Years only, because months are unknown. (The extract already holds only rows that could include 1881, so this is zero.)');
  p('2. `unresolved`: no Latitude/Longitude. Nothing is invented; rows are only counted and sampled below.');
  p('3. `outside-boundary`: the point lies in none of the 22 polygons (own ray casting, holes and multipolygons handled).');
  p('4. Merge into a census place (above). These are not exclusions.');
  p(`5. \`post-or-camp\` (item 239): excluded are GNIS class Military, a name starting Cantonment, containing Barracks or Arsenal, or ending Agency. A row of Populated Place, Census or Post Office class whose name starts Fort, Ft or Camp, with no census row, is excluded as well unless it is on the list of ${WELL_KNOWN_POSTS.length} well-known posts and towns in section 5; a listed row is kept with the reason \`fort-or-camp\`. Fort and Camp rows of Locale, Cemetery, School or other non-office classes follow the class filter (rule 7).`);
  p('6. `property` (item 243): a name ending in Ranch, Ranche, Farm, Homestead, Plantation, Dairy, Store, Mill, Mine or Cabin; Branch does not count as Ranch. This is a heuristic and also removes some genuine hamlets. Visible false positives in section 5, by general knowledge: Big Cabin (OK), Cedar Mill (OR), Burnt Ranch, Forest Ranch, Sheepranch and Willow Ranch (CA), Prairie Farm (SD), Dairy (OR), Lead Mine (MO), Homestead (IA, KS) and the many named mill villages (for example in Texas and Missouri), which were small communities; none is a certain property either way.');
  p('7. Class filter: GNIS classes Populated Place, Census and Post Office are candidates. A place whose rows are all Post Office class and that has no census row gets the reason `post-office-only`, because most 1881 towns appear only as an office. `class-locale`, `class-civil` and `class-other` (cemetery, school, church, mine, cape) rows are excluded and counted unless they duplicate a kept place.');
  p('8. Survivors are grouped into places (same GNIS feature id, or same normalised name and state within 8 km). The best row by fewest uncertainty reasons, then Populated Place over Census or Post Office, then lowest dataset ID names the place and gives its coordinate.');
  p();
  p('Dates: Established unknown keeps the row with reason `est-unknown`; 1881 as Established or Discontinued keeps it with `est-1881` or `disc-1881`; `Continuous` false adds `gap`. A census row clears only the two Established reasons for its place (the place existed in 1880).');
  p();
  p('Coordinates: census places use the Bing coordinate unless it lies outside the expected state and the compilation\'s own coordinate lies inside; all other places use the GNIS coordinate of the best row. Rows are never given a coordinate they do not have.');
  p();
  p('Ids: `name-st` slugs from the modern state code; a clash adds the county slug, then a counter.');
  p();
  p('Size classes by 1880 population (unknown is class 0, never guessed): ' + SIZE_CLASSES.map((s) => `${s.size} = ${s.label}`).join('; ') + '. Kind: class 4 city, classes 2 and 3 town, classes 0 and 1 village. A small table of size hints (see section 6) may raise the class of a well-known town; that is inference, not a census figure.');
  p();
  p();
  p('## 5. Exclusions per reason and jurisdiction (post-office rows)');
  p();
  p('Rows with a coordinate are bucketed by the polygon that contains them. Unresolved and outside-boundary rows have no polygon and are bucketed by the jurisdiction implied by the modern state (North and South Dakota to Dakota; Oklahoma split by county into Indian Territory and Public Land Strip: Beaver, Cimarron and Texas counties).');
  p();
  const jids = J.map((j) => j.id);
  p(table(['Reason', ...jids.map(jn), 'Total'], PO_EXCLUSIONS.map((r) => [r, ...jids.map((id) => String(c.exclusionsByJurisdiction[r][id] || 0)), String(c.postOfficeDispositions[r])])));
  p();
  p(`Outside-boundary rows near a polygon edge: ${c.outsideBoundaryNearMiss.within5} within 5 km, ${c.outsideBoundaryNearMiss.within25} within 25 km, ${c.outsideBoundaryNearMiss.beyond} farther. The generalized polygons (0.001 degree) can drop coastal places that really lie inside.`);
  p();
  p(`Census rows outside every polygon: ${c.censusDispositions['outside-boundary']}.`);
  p();
  p('Name-detected posts and agencies (all excluded):');
  p();
  p(stat.posts.map((r) => `${titleCase(r.name)} (${r.st})`).join('; ') || 'none');
  p();
  p('Name-detected individual properties (all excluded):');
  p();
  p(stat.properties.map((r) => `${titleCase(r.name)} (${r.st})`).join('; ') || 'none');
  p();
  const forts = ordered.filter((q) => q.mask & BIT['fort-or-camp']);
  p(`Fort, Ft and Camp named places kept with the reason \`fort-or-camp\`: ${forts.length}. They are the well-known posts and towns below (${WELL_KNOWN_POSTS.length}, the author's choice from general knowledge, not a source; the build stops if one matches no post-office row): ${WELL_KNOWN_POSTS.map(({ name, st }) => `${name} (${st})`).join('; ')}.`);
  p();
  const leftOut = [...new Set(stat.forts.map((r) => `${titleCase(r.name)} (${r.st})`))].sort(cmp);
  p(`Fort, Ft and Camp rows left out because they are not on that list (${leftOut.length} places, all of Populated Place, Census or Post Office class and with no census row); a real town among them is lost: ${leftOut.join('; ') || 'none'}.`);
  p();
  p('## 6. Kept settlements per jurisdiction and size class');
  p();
  p(table(['Jurisdiction', 'Total', ...SIZE_CLASSES.map((s) => `Class ${s.size}`)], [...jids.map((id) => [jn(id), String(c.kept.byJurisdiction[id].total), ...c.kept.byJurisdiction[id].sizes.map(String)]), ['All', String(c.kept.total), ...c.kept.bySize.map(String)]]));
  p();
  p(`Kinds: ${Object.keys(c.kept.byKind).sort(cmp).map((k) => `${k} ${c.kept.byKind[k]}`).join(', ')}. Places with a known 1880 population: ${c.kept.withPopulation}. Backed by post offices only: ${c.kept.fromPostOffices}; census only: ${c.kept.fromCensusOnly}; both: ${c.kept.withBoth}.`);
  p();
  p('Fort and camp named places kept, per jurisdiction:');
  p();
  p(table(['Jurisdiction', 'Fort or camp named'], [...jids.map((id) => [jn(id), String(c.kept.fortOrCamp.byJurisdiction[id])]), ['All', String(c.kept.fortOrCamp.total)]]));
  p();
  p('### Size hints (inference, not census figures)');
  p();
  p(`${c.hints.total} well-known towns that the sources leave at a low class carry a hand-made size class from general knowledge. A hint only raises a class, never lowers it, and never states a population: the place keeps its recorded 1880 population or none. ${c.hints.raised} hints raised a class; the others changed nothing. A raised place gets the reason \`size-hint\`, its kind follows the new class, and its services, roads and route weights are derived from it. Entries are matched by normalised name and jurisdiction and each must match exactly one place, or the build fails.`);
  p();
  p(table(['Place', 'Jurisdiction', 'Source class', 'Hint class', 'Raised', 'Reason'], c.hints.list.map(([id, name, jur, from, size, raised, why]) => [name, jn(jur), from, size, raised ? 'yes' : 'no', why].map(String))));
  p();
  p('### Uncertainty');
  p();
  p(`Places with at least one reason: ${c.uncertain.total} of ${c.kept.total}.`);
  p();
  p(table(['Reason', 'Places', 'Meaning'], REASONS.map((r) => [r.id, String(c.uncertain.byReason[r.id]), r.text])));
  p();
  p('### Unresolved post-office rows');
  p();
  p(`${commas(c.unresolved.total)} rows have no coordinate (no GNIS match). By implied jurisdiction: ${Object.keys(c.unresolved.byJurisdiction).map((k) => `${jn(k)} ${c.unresolved.byJurisdiction[k]}`).join(', ')}. Some are real settlements; none is placed. List them all with \`node scripts/western-build-world.mjs --list-unresolved\`. Sample (first 25 by dataset ID):`);
  p();
  p(stat.unresolved.slice(0, 25).map((r) => `${titleCase(r.name)} (${r.st}, ${titleCase(r.county)}, id ${r.id})`).join('; '));
  p();
  p('## 7. Services are inferred, not evidenced');
  p();
  p('Services come from the size class and a per-place hash (FNV-1a over the place id and a salt, so the same place always gets the same result). Each service is present with the chance below.');
  p();
  p(table(['Class', 'Doctor', 'Store', 'Livery', 'Recruit', 'Notices', 'Ask', 'Saloon', 'Meal', 'Poker', 'Faro'], SERVICE_RULES.map((r) => [String(r.size), r.doctor, r.store, r.livery, r.recruit, r.notices, r.ask, r.saloon, r.meal, r.poker, r.faro].map(String))));
  p();
  p('Chances for meal, poker and faro apply only when a saloon exists. Doctor care when present: ' + DOCTOR_LEVELS.map((l, i) => `class ${i} ${l.join(' or ')}`).join('; ') + '. Store price factor: ' + STORE_BASE.map((b, i) => `class ${i} ${b}`).join(', ') + ', plus 0.1 when the nearest other place is over 40 km away, plus a hash variation of at most 0.1, rounded to 0.05 and kept within 0.9 and 1.7. A place with no store has store 0.');
  p();
  p('Circumstances (from memory, general knowledge): Indian Territory has no saloon, because federal law barred liquor there; Kansas saloon chance is multiplied by 0.25, because state prohibition took effect in May 1881. A place can have no service at all, no saloon, or a saloon without games.');
  p();
  p(`Result: ${c.services.noServices} places have no service at all, ${c.services.noSaloon} have no saloon, ${c.services.saloon} have one. Saloon game sets: ${Object.keys(c.services.gamesSets).sort(cmp).map((k) => `${k} ${c.services.gamesSets[k]}`).join(', ')}. Places with a store ${c.services.store}, doctor ${c.services.doctor}, livery ${c.services.livery}, hire ${c.services.recruit}, notice board ${c.services.notices}, someone to ask ${c.services.ask}.`);
  p();
  p('## 8. Regions are general-knowledge approximations');
  p();
  p('Each place gets the first region whose lon/lat polygon contains it; the polygons are coarse hand sketches good to about 100 km, not survey data. A nearest-centre fallback covers any gap. Regions are meant to drive terrain, flora and climate later. All carry `approx: true`.');
  p();
  p(table(['Region', 'Places', 'Climate (approximate)'], regions.map((r) => [r.id, String(c.regions.byRegion[r.id]), r.climate])));
  p();
  p(`Places assigned by the nearest-centre fallback: ${c.regions.fallbackAssignments}.`);
  p();
  p('## 9. Route graph');
  p();
  p(`Edges are [a, b, km, road]. km is the great-circle distance times ${RULES.winding} (winding factor), rounded, at least 1. Each place links to its ${RULES.neighbours} nearest neighbours when the km is at most ${RULES.neighbourCapKm}; components are then joined with minimum-spanning-tree edges up to the hard cap of ${RULES.maxEdgeKm} km, so every place is reachable from Tombstone.`);
  p();
  p(`Result: ${commas(c.routes.edges)} edges, ${c.routes.bridgeEdges} bridges, longest ${c.routes.maxEdgeKm} km, ${commas(c.routes.roadEdges)} marked road.`);
  p();
  p(`Road flag (a guess, not evidence), in three steps. 1. Base rule: road when both ends are size class 2 or more; or both are class 1 or more and the edge is at most 150 km; or the edge is at most 60 km and neither end lies in a rough region (${[...ROUGH_REGIONS].join(', ')}). 2. Forest: among all places of size class 1 or more, shortest routes over the existing edges (each at most ${RULES.roadEdgeCapKm} km) are chosen as a minimum spanning forest (Mehlhorn's nearest-terminal construction), and every edge on those routes becomes a road, so every such place is wagon-reachable from every other in its component. 3. Villages: each size-0 place whose nearest size-class-1-or-more place (by route length) is within ${RULES.villageRoadKm} km in a straight line is road-connected to it along its shortest route. Step 1 made ${commas(c.routes.roadBaseEdges)} edges roads, step 2 added ${commas(c.routes.roadForestEdges)}, step 3 added ${commas(c.routes.roadVillageEdges)}.`);
  p();
  p(`Roads are ${Math.round(c.routes.roadShare * 1000) / 10} percent of all edges. By wagon from Tombstone ${commas(c.routes.wagon.reachable)} of ${commas(c.kept.total)} places are reachable, and ${c.routes.wagon.terminalsReached} of ${c.routes.wagon.terminals} places of size class 1 or more. Wagon distance from Tombstone (km, null means no wagon route): ${c.routes.wagon.targets.map(([id, km]) => `${id} ${km === null ? 'null' : km}`).join(', ')}. Size-0 places beyond ${RULES.villageRoadKm} km of any size-class-1 place and outside every road component have no wagon route; the census file lacks population for towns such as Phoenix and Bismarck, so they are class 0 and fall in that group.`);
  p();
  p();
  p('Limits: the graph links neighbouring places, not real roads, rail or stage lines; long journeys will pass many small places.');
  p();
  p('## 10. Map outlines');
  p();
  p(`Jurisdiction polygons are projected with the module's equirectangular scheme and simplified with Douglas-Peucker at ${c.outlines.tolerance} km tolerance: ${commas(c.outlines.points)} points in ${c.outlines.rings} rings from ${commas(c.outlines.sourcePoints)} source points. ${c.outlines.droppedRings} rings under ${RULES.minRingKm2} km2 (mostly Louisiana and Washington islands) are dropped from the outlines only; the point-in-polygon test uses the full polygons. Neighbouring outlines are simplified independently, so shared borders can differ by up to the tolerance.`);
  p();
  p('## 11. Projection');
  p();
  p(`Origin: the Tombstone post-office row, lon ${c.projection.lon0}, lat ${c.projection.lat0}. x = (lon - lon0) * 111.32 * cos(lat), y = -(lat - lat0) * 111.2, using the cosine of the point's own latitude.`);
  p();
  p('## 12. Known gaps and limits');
  p();
  p('1. Completeness cannot be proved and is not claimed. The inventory is the union of two candidate datasets after the filters above.');
  p('2. Towns without a post office are missing unless the 1880 census compilation lists them; the compilation is census-based and generally starts at 2,500 people with uneven additions below that (California alone gives 397 of its 611 rows).');
  p(`3. ${commas(c.uncertain.byReason['post-office-only'])} kept places rest on a post-office-class GNIS feature alone and may not be settlements at all. ${commas(c.postOfficeDispositions['class-locale'])} locale rows and ${commas(c.postOfficeDispositions['class-civil'])} civil-division rows are excluded as well.`);
  p(`4. ${commas(c.unresolved.total)} post-office rows lack a coordinate; places that existed only there are missing.`);
  p('5. Places that were known by another name in 1881, or whose office is filed under a different name, may appear twice or not at all; names and coordinates are modern geocodes.');
  p('6. Year-only dates leave offices opened or closed in 1881 uncertain; the month and day are not in the data.');
  p('7. Population exists only where the 1880 compilation has it; nothing is estimated.');
  p('8. Camps, posts and properties are excluded by name and class heuristics; some towns ending in Mill, Store, Mine or Ranch are lost, and some properties with ordinary names remain. A name starting Fort, Ft or Camp stays only if the census lists it or it is on the short list in section 5, so other real towns with such names are lost.');
  p('9. Military posts other than Camp Huachuca and the listed ones, trading posts, stage stations and mining camps are largely absent; item 239 makes them optional.');
  p('10. Services, regions, road flags, size hints and the Kansas and Indian Territory saloon rules are general-knowledge inference, not evidence.');
  p('11. The 0.001-degree boundary generalizes coasts and borders; border and coast places can be lost or assigned to a neighbouring jurisdiction (reason `jurisdiction-differs`).');
  p('12. The census compilation uses 2010-era names and approximate coordinates and may carry duplicate or merged records.');
  const thin = jids.filter((id) => c.kept.byJurisdiction[id].total < 100);
  p(`13. Coverage is uneven: ${thin.length} jurisdictions have fewer than 100 kept places. The table after this list gives their post-office row counts per outcome; this audit does not assert a cause.`);
  p('14. Post-office-class rows are kept, so places that were only a shop, a ranch or a stage stop with a post office are included as villages; the reason `post-office-only` marks them.');
  p();
  p('### Thin jurisdictions');
  p();
  const outcome = (r, id) => c.exclusionsByJurisdiction[r][id] || 0;
  const poOnly = (id) => ordered.filter((q) => q.jurId === id && q.mask & BIT['post-office-only']).length;
  p(table(['Jurisdiction', 'Kept', 'Of which post-office-only', 'Locale and other classes', 'Unresolved', 'Posts, camps, properties'],
    thin.map((id) => [jn(id), c.kept.byJurisdiction[id].total, poOnly(id), outcome('class-locale', id) + outcome('class-civil', id) + outcome('class-other', id), outcome('unresolved', id), outcome('post-or-camp', id) + outcome('property', id)].map(String))));
  p();
  p('### Spot check of well-known towns');
  p();
  p('Name and modern state only; a match by name is not a proof that the place is the same one.');
  p();
  p(table(['Town', 'State', 'Outcome'], c.watch));
  p();
  p('## 13. Machine-readable counts');
  p();
  p('This block equals the exported `AUDIT_COUNTS`; the test suite compares them.');
  p();
  p('```json');
  p(JSON.stringify(counts, null, 2));
  p('```');
  p();
  return L.join('\n');
}

// Note: command line use writes both generated files; --check only compares; --list-unresolved prints rows without coordinates.
function cli(args) {
  if (args.includes('--list-unresolved')) {
    const rows = parseCsv(readFileSync(ROOT(INPUTS.po), 'utf8')).filter((r) => r.Latitude === '' || r.Longitude === '');
    for (const r of rows) console.log(`${r.ID}\t${r.Name}\t${r.State}\t${r.County1}\t${r.Established}\t${r.Discontinued}`);
    return;
  }
  const { moduleText, auditText, counts } = build();
  // Note: the audit is no longer kept as a file; it is printed on request.
  if (args.includes('--audit')) {
    console.log(auditText);
    return;
  }
  if (args.includes('--check')) {
    const same = readFileSync(ROOT(OUTPUTS.module), 'utf8') === moduleText;
    console.log(same ? 'the generated file is current' : 'the generated file differs; rerun without --check');
    process.exitCode = same ? 0 : 1;
    return;
  }
  writeFileSync(ROOT(OUTPUTS.module), moduleText);
  console.log(`wrote ${OUTPUTS.module} (${moduleText.length} bytes); ${counts.kept.total} settlements, ${counts.routes.edges} edges`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv.slice(2));
