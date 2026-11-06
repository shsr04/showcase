// Note: the real vehicles of the wasteland, with part interchange keys per slot.

import { C } from './palette.js';

// Note: two vehicles share a part when their keys for that slot are equal; armor plates fit everything.
export const PART_NAMES = {
  'ford-4.6-2v': '4.6L Modular SOHC V8',
  'ford-4r70w-panther': '4R70W automatic (Panther)',
  'ford-4r70w-truck': '4R70W automatic (truck)',
  'ford-4r70w-mustang': '4R70W automatic (Mustang)',
  'ford-5r55w': '5R55W automatic',
  'gm-5.3-vortec': '5.3L Vortec V8 (LM7)',
  'gm-4l60e': '4L60-E automatic',
  'dodge-4.7': '4.7L PowerTech V8',
  'ram-1500-at': 'Ram 1500 automatic',
  'toyota-2az': '2.4L 2AZ-FE I4',
  'toyota-u241e': 'U241E automatic',
  'toyota-1zz': '1.8L 1ZZ-FE I4',
  'corolla-4at': 'Corolla 4-speed automatic',
  'honda-k24': '2.4L K24 I4',
  'accord-5at': 'Accord 5-speed automatic',
  'honda-d17': '1.7L D17 I4',
  'civic-4at': 'Civic 4-speed automatic',
  'nissan-qr25': '2.5L QR25DE I4',
  'altima-4at': 'Altima 4-speed automatic',
  'p225-60r16': 'P225/60R16 tires',
  'p225-60r17': 'P225/60R17 tires',
  'p235-70r16': 'P235/70R16 tires',
  'p245-45r17': 'P245/45R17 tires',
  'p255-70r16': 'P255/70R16 tires',
  'p235-75r15': 'P235/75R15 tires',
  'p245-75r16': 'P245/75R16 tires',
  'p265-70r16': 'P265/70R16 tires',
  'p265-70r17': 'P265/70R17 tires',
  'p205-65r15': 'P205/65R15 tires',
  'p185-70r14': 'P185/70R14 tires',
  'p195-65r15': 'P195/65R15 tires',
  'p215-60r16': 'P215/60R16 tires',
  'panther-03-coil': 'Panther coil suspension (2003+)',
  'panther-03-air': 'Panther rear air suspension (2003+)',
  'panther-03-rad': 'Panther radiator (2003+)',
  'panther-19': 'Panther 19 gal fuel tank',
  'bci-65': 'BCI Group 65 battery',
  'bci-58': 'BCI Group 58 battery',
  'bci-78': 'BCI Group 78 battery',
  'bci-34': 'BCI Group 34 battery',
  'bci-35': 'BCI Group 35 battery',
  'bci-51r': 'BCI Group 51R battery',
  'bci-96r': 'BCI Group 96R battery',
  'steel-plate': '16-gauge steel plate',
  'honda-xr650': '644cc XR650L single',
  'xr650-5mt': 'XR650L 5-speed',
  'xr650-tires': 'XR650L knobbies',
  'ytx7l': 'YTX7L battery',
};

// Note: model-specific keys (suspension, radiator, tank) get readable names from the vehicle label.
export function partName(key, vehicle) {
  if (PART_NAMES[key]) return PART_NAMES[key];
  const slot = key.split(':')[1];
  const names = { suspension: 'suspension', radiator: 'radiator', fueltank: 'fuel tank' };
  return `${vehicle ? vehicle.short : 'OEM'} ${names[slot] || slot}`;
}

const own = (id, slot) => `${id}:${slot}`;

// Note: z60 and mph are the real 0-60 time and top speed; grip, offroad and mass are relative to the P71; storage is [main, mainName, extra, extraName].
// Note: len and wid are the real length and width in px at the car scale (PX_PER_M), rounded.
// Note: drive is the real drivetrain (cylinders, idle and redline rpm, gear and final ratios, tire circumference in m) for the gearbox and engine sound.
const RAW = [
  {
    id: 'cvpi03', year: 2003, make: 'Ford', model: 'Crown Victoria Police Interceptor', short: "'03 Crown Vic P71",
    body: 'sedan', len: 30, wid: 11, police: true,
    stats: { z60: 8.5, mph: 129, grip: 1, offroad: 0.55, mass: 1 },
    drive: { cyl: 8, idle: 650, red: 5000, gears: [2.84, 1.55, 1, 0.7], final: 3.27, tire: 2.12 },
    storage: [8, 'trunk', 4, 'back seat'], tank: 19, mpg: 17,
    slots: {
      engine: 'ford-4.6-2v', transmission: 'ford-4r70w-panther', tires: 'p225-60r16', suspension: 'panther-03-coil',
      radiator: 'panther-03-rad', fueltank: 'panther-19', battery: 'bci-65',
    },
    colors: [C.SHADOW, C.WHITE, C.CONC],
  },
  {
    id: 'grandmarquis03', year: 2003, make: 'Mercury', model: 'Grand Marquis', short: "'03 Grand Marquis",
    body: 'sedan', len: 30, wid: 11,
    stats: { z60: 9.0, mph: 110, grip: 0.9, offroad: 0.5, mass: 1 },
    drive: { cyl: 8, idle: 600, red: 5000, gears: [2.84, 1.55, 1, 0.7], final: 2.73, tire: 2.12 },
    storage: [8, 'trunk', 4, 'back seat'], tank: 19, mpg: 18,
    slots: {
      engine: 'ford-4.6-2v', transmission: 'ford-4r70w-panther', tires: 'p225-60r16', suspension: 'panther-03-coil',
      radiator: 'panther-03-rad', fueltank: 'panther-19', battery: 'bci-65',
    },
    colors: [C.BONE, C.MAROON, C.STEEL, C.DUST],
  },
  {
    id: 'towncar03', year: 2003, make: 'Lincoln', model: 'Town Car', short: "'03 Town Car",
    body: 'sedan', len: 30, wid: 11,
    stats: { z60: 9.2, mph: 108, grip: 0.85, offroad: 0.45, mass: 1.05 },
    drive: { cyl: 8, idle: 600, red: 5000, gears: [2.84, 1.55, 1, 0.7], final: 3.08, tire: 2.2 },
    storage: [9, 'trunk', 4, 'back seat'], tank: 19, mpg: 17,
    slots: {
      engine: 'ford-4.6-2v', transmission: 'ford-4r70w-panther', tires: 'p225-60r17', suspension: 'panther-03-air',
      radiator: 'panther-03-rad', fueltank: 'panther-19', battery: 'bci-65',
    },
    colors: [C.SHADOW, C.BONE_L, C.NAVY],
  },
  {
    id: 'f150-01', year: 2001, make: 'Ford', model: 'F-150 XLT 4.6', short: "'01 F-150",
    body: 'pickup', len: 32, wid: 11,
    stats: { z60: 9.8, mph: 99, grip: 0.8, offroad: 0.85, mass: 1.1 },
    drive: { cyl: 8, idle: 700, red: 4800, gears: [2.84, 1.55, 1, 0.7], final: 3.55, tire: 2.4 },
    storage: [16, 'bed', 2, 'cab'], tank: 25, mpg: 15,
    slots: { engine: 'ford-4.6-2v', transmission: 'ford-4r70w-truck', tires: 'p235-70r16', battery: 'bci-65' },
    colors: [C.MAROON, C.WHITE, C.STEEL, C.GRASS_D],
  },
  {
    id: 'mustanggt02', year: 2002, make: 'Ford', model: 'Mustang GT', short: "'02 Mustang GT",
    body: 'coupe', len: 26, wid: 10,
    stats: { z60: 6.2, mph: 137, grip: 1.05, offroad: 0.4, mass: 0.9 },
    drive: { cyl: 8, idle: 700, red: 5800, gears: [2.84, 1.55, 1, 0.7], final: 3.27, tire: 2.05 },
    storage: [5, 'trunk', 2, 'back seat'], tank: 16, mpg: 18,
    slots: { engine: 'ford-4.6-2v', transmission: 'ford-4r70w-mustang', tires: 'p245-45r17', battery: 'bci-58' },
    colors: [C.RED, C.SHADOW, C.AMBER],
  },
  {
    id: 'expedition00', year: 2000, make: 'Ford', model: 'Expedition 4.6', short: "'00 Expedition",
    body: 'suv', len: 29, wid: 11,
    stats: { z60: 10.8, mph: 98, grip: 0.78, offroad: 0.8, mass: 1.2 },
    drive: { cyl: 8, idle: 700, red: 4800, gears: [2.84, 1.55, 1, 0.7], final: 3.55, tire: 2.4 },
    storage: [14, 'cargo area', 2, 'cab'], tank: 26, mpg: 14,
    // Attention: unverified tire size for this trim.
    slots: { engine: 'ford-4.6-2v', transmission: 'ford-4r70w-truck', tires: 'p255-70r16', battery: 'bci-65' },
    colors: [C.GRASS_D, C.BONE, C.SHADOW],
  },
  {
    id: 'e150-02', year: 2002, make: 'Ford', model: 'E-150 Econoline 4.6', short: "'02 E-150 van",
    body: 'van', len: 30, wid: 11,
    stats: { z60: 12.5, mph: 90, grip: 0.7, offroad: 0.6, mass: 1.3 },
    drive: { cyl: 8, idle: 700, red: 4600, gears: [2.84, 1.55, 1, 0.7], final: 3.73, tire: 2.3 },
    storage: [20, 'cargo bay', 2, 'cab'], tank: 35, mpg: 13,
    // Attention: unverified tire size for this trim.
    slots: { engine: 'ford-4.6-2v', transmission: 'ford-4r70w-truck', tires: 'p235-75r15', battery: 'bci-65' },
    colors: [C.WHITE, C.BONE, C.DUST],
  },
  {
    id: 'explorer03', year: 2003, make: 'Ford', model: 'Explorer Eddie Bauer V8', short: "'03 Explorer V8",
    body: 'suv', len: 27, wid: 10,
    stats: { z60: 8.6, mph: 102, grip: 0.8, offroad: 0.8, mass: 1.1 },
    drive: { cyl: 8, idle: 650, red: 5000, gears: [3.22, 2.29, 1.55, 1, 0.71], final: 3.73, tire: 2.35 },
    storage: [10, 'cargo area', 2, 'back seat'], tank: 22, mpg: 15,
    // Attention: unverified battery group; chosen so it fits nothing else.
    slots: { engine: 'ford-4.6-2v', transmission: 'ford-5r55w', tires: 'p235-70r16', battery: 'bci-96r' },
    colors: [C.DIRT_L, C.SHADOW, C.GRASS_D],
  },
  {
    id: 'silverado02', year: 2002, make: 'Chevrolet', model: 'Silverado 1500 5.3', short: "'02 Silverado",
    body: 'pickup', len: 32, wid: 11,
    stats: { z60: 8.4, mph: 100, grip: 0.8, offroad: 0.85, mass: 1.15 },
    drive: { cyl: 8, idle: 600, red: 5600, gears: [3.06, 1.63, 1, 0.7], final: 3.42, tire: 2.43 },
    storage: [16, 'bed', 2, 'cab'], tank: 26, mpg: 15,
    slots: { engine: 'gm-5.3-vortec', transmission: 'gm-4l60e', tires: 'p245-75r16', battery: 'bci-78' },
    colors: [C.STEEL, C.RED, C.WHITE, C.SHADOW],
  },
  {
    id: 'tahoe03', year: 2003, make: 'Chevrolet', model: 'Tahoe 5.3', short: "'03 Tahoe",
    body: 'suv', len: 28, wid: 11,
    stats: { z60: 9.0, mph: 98, grip: 0.78, offroad: 0.85, mass: 1.25 },
    drive: { cyl: 8, idle: 600, red: 5600, gears: [3.06, 1.63, 1, 0.7], final: 3.42, tire: 2.43 },
    storage: [14, 'cargo area', 3, 'back seat'], tank: 26, mpg: 14,
    slots: { engine: 'gm-5.3-vortec', transmission: 'gm-4l60e', tires: 'p265-70r16', battery: 'bci-78' },
    colors: [C.SHADOW, C.WHITE, C.STEEL],
  },
  {
    // Attention: no published figures for the '03 police-package Tahoe; estimated below a later PPV's 7.75 s and 134 mph.
    id: 'tahoeppv03', year: 2003, make: 'Chevrolet', model: 'Tahoe 5.3 police package', short: "'03 Tahoe PPV",
    body: 'suv', len: 28, wid: 11,
    stats: { z60: 8.4, mph: 120, grip: 0.82, offroad: 0.8, mass: 1.25 },
    drive: { cyl: 8, idle: 600, red: 5800, gears: [3.06, 1.63, 1, 0.7], final: 3.73, tire: 2.43 },
    storage: [14, 'cargo area', 3, 'back seat'], tank: 26, mpg: 13,
    slots: {
      engine: 'gm-5.3-vortec', transmission: 'gm-4l60e', tires: 'p265-70r16', battery: 'bci-78',
      suspension: own('tahoe03', 'suspension'), radiator: own('tahoe03', 'radiator'), fueltank: own('tahoe03', 'fueltank'),
    },
    colors: [C.SHADOW, C.WHITE, C.STEEL],
  },
  {
    id: 'ram04', year: 2004, make: 'Dodge', model: 'Ram 1500 4.7', short: "'04 Ram 1500",
    body: 'pickup', len: 32, wid: 11,
    stats: { z60: 9.4, mph: 104, grip: 0.8, offroad: 0.85, mass: 1.15 },
    drive: { cyl: 8, idle: 650, red: 5300, gears: [3, 1.67, 1.5, 1, 0.75], final: 3.55, tire: 2.5 },
    storage: [16, 'bed', 2, 'cab'], tank: 26, mpg: 14,
    // Attention: unverified tire size and battery group; chosen so they fit nothing else.
    slots: { engine: 'dodge-4.7', transmission: 'ram-1500-at', tires: 'p265-70r17', battery: 'bci-34' },
    colors: [C.RUST, C.SHADOW, C.BONE],
  },
  {
    id: 'camry04', year: 2004, make: 'Toyota', model: 'Camry LE', short: "'04 Camry",
    body: 'sedan', len: 27, wid: 10,
    stats: { z60: 9.4, mph: 118, grip: 0.9, offroad: 0.4, mass: 0.85 },
    drive: { cyl: 4, idle: 700, red: 6200, gears: [3.94, 2.2, 1.41, 1.02], final: 2.69, tire: 2.09 },
    storage: [6, 'trunk', 3, 'back seat'], tank: 18, mpg: 26,
    slots: { engine: 'toyota-2az', transmission: 'toyota-u241e', tires: 'p205-65r15', battery: 'bci-35' },
    colors: [C.BONE, C.STEEL, C.DUST],
  },
  {
    id: 'accord05', year: 2005, make: 'Honda', model: 'Accord LX', short: "'05 Accord",
    body: 'sedan', len: 27, wid: 10,
    stats: { z60: 8.8, mph: 120, grip: 0.92, offroad: 0.4, mass: 0.85 },
    drive: { cyl: 4, idle: 750, red: 6800, gears: [2.65, 1.52, 1.04, 0.74, 0.57], final: 4.44, tire: 2.04 },
    storage: [6, 'trunk', 3, 'back seat'], tank: 17, mpg: 26,
    slots: { engine: 'honda-k24', transmission: 'accord-5at', tires: 'p205-65r15', battery: 'bci-51r' },
    colors: [C.DUST, C.NAVY, C.BONE_L],
  },
  {
    id: 'civic03', year: 2003, make: 'Honda', model: 'Civic LX', short: "'03 Civic",
    body: 'compact', len: 24, wid: 10,
    stats: { z60: 10.6, mph: 110, grip: 0.9, offroad: 0.35, mass: 0.7 },
    drive: { cyl: 4, idle: 750, red: 6500, gears: [2.72, 1.52, 0.98, 0.67], final: 4.36, tire: 1.93 },
    storage: [5, 'trunk', 3, 'back seat'], tank: 13, mpg: 32,
    slots: { engine: 'honda-d17', transmission: 'civic-4at', tires: 'p185-70r14', battery: 'bci-51r' },
    colors: [C.RED, C.BONE, C.SHADOW],
  },
  {
    id: 'corolla05', year: 2005, make: 'Toyota', model: 'Corolla CE', short: "'05 Corolla",
    body: 'compact', len: 25, wid: 9,
    stats: { z60: 10.4, mph: 110, grip: 0.88, offroad: 0.35, mass: 0.72 },
    drive: { cyl: 4, idle: 700, red: 6400, gears: [2.85, 1.55, 1, 0.7], final: 4.24, tire: 1.99 },
    storage: [5, 'trunk', 3, 'back seat'], tank: 13, mpg: 32,
    slots: { engine: 'toyota-1zz', transmission: 'corolla-4at', tires: 'p195-65r15', battery: 'bci-35' },
    colors: [C.BONE_L, C.MAROON, C.DUST],
  },
  {
    id: 'altima04', year: 2004, make: 'Nissan', model: 'Altima 2.5 S', short: "'04 Altima",
    body: 'sedan', len: 27, wid: 10,
    stats: { z60: 8.8, mph: 120, grip: 0.9, offroad: 0.4, mass: 0.85 },
    drive: { cyl: 4, idle: 700, red: 6300, gears: [2.79, 1.55, 1, 0.69], final: 3.86, tire: 2.09 },
    storage: [6, 'trunk', 3, 'back seat'], tank: 20, mpg: 25,
    // Attention: unverified tire size for this trim.
    slots: { engine: 'nissan-qr25', transmission: 'altima-4at', tires: 'p215-60r16', battery: 'bci-35' },
    colors: [C.STEEL, C.SHADOW, C.BONE],
  },
  {
    id: 'xr650', year: 2003, make: 'Honda', model: 'XR650L', short: "'03 XR650L",
    body: 'bike', len: 12, wid: 5, enemyOnly: true,
    stats: { z60: 5.5, mph: 95, grip: 0.8, offroad: 0.95, mass: 0.3 },
    drive: { cyl: 1, idle: 1300, red: 7000, gears: [2.43, 1.71, 1.32, 1.06, 0.86], final: 5.25, tire: 2.1 },
    storage: [0, 'none', 0, 'none'], tank: 3, mpg: 45,
    slots: { engine: 'honda-xr650', transmission: 'xr650-5mt', tires: 'xr650-tires', battery: 'ytx7l' },
    colors: [C.RUST, C.SHADOW, C.DUST],
  },
  {
    // Note: Cycle World ran the '01 GSX-R600 through the quarter mile in 10.76 s at 128 mph; top speed is about 158 mph.
    id: 'gsxr600', year: 2001, make: 'Suzuki', model: 'GSX-R600', short: "'01 GSX-R600",
    body: 'bike', len: 11, wid: 4, enemyOnly: true,
    stats: { z60: 3.4, mph: 158, grip: 0.85, offroad: 0.5, mass: 0.28 },
    drive: { cyl: 4, idle: 1300, red: 13500, gears: [2.79, 2.05, 1.71, 1.48, 1.33, 1.21], final: 5.54, tire: 1.95 },
    storage: [0, 'none', 0, 'none'], tank: 4.8, mpg: 40,
    slots: { engine: 'suzuki-gsxr600', transmission: 'gsxr600-6mt', tires: 'gsxr600-tires', battery: 'yt12a' },
    colors: [C.RUST, C.SHADOW, C.DUST],
  },
];

// Note: slots not listed above are model-specific; armor plates are universal.
for (const v of RAW) {
  for (const slot of ['suspension', 'radiator', 'fueltank']) {
    if (!v.slots[slot]) v.slots[slot] = own(v.id, slot);
  }
  v.slots.armor = 'steel-plate';
}

export const VEHICLES = RAW;
export const VEHICLE = Object.fromEntries(RAW.map((v) => [v.id, v]));
export const COURIER_CAR = 'cvpi03';

// Note: wreck spawn weights for the Gulf band; Panthers are common because fleets died where they were parked.
export const WRECK_WEIGHTS = {
  cvpi03: 4, grandmarquis03: 3, towncar03: 2, 'f150-01': 3.5, mustanggt02: 1.5, expedition00: 1.5, 'e150-02': 1.5,
  explorer03: 2, silverado02: 3, tahoe03: 2, ram04: 2.5, camry04: 3, accord05: 3, civic03: 2.5, corolla05: 2.5, altima04: 2.5,
};

export function storageOf(v) {
  return v.storage[0] + v.storage[2];
}
