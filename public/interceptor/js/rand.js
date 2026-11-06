// Note: deterministic hashing, PRNG and value noise; no DOM or Phaser so it runs in Node too.

function mix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hash2(a, b) {
  return mix((Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) + 0x9e3779b9);
}

export function hash3(a, b, c) {
  return mix(hash2(a, b) + Math.imul(c | 0, 0x85ebca77) + 0x7f4a7c15);
}

export function hash4(a, b, c, d) {
  return mix(hash3(a, b, c) + Math.imul(d | 0, 0xc2b2ae3d) + 0x1b873593);
}

export function u01(h) {
  return (h >>> 0) / 4294967296;
}

export function seedFromString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return mix(h);
}

// Note: seeds are short uppercase words so players can read them off the death screen and type them back.
const SEED_WORDS = [
  'SABINE', 'ATCHAFALAYA', 'CALCASIEU', 'PECOS', 'LLANO', 'NUECES', 'BRAZOS', 'TRINITY',
  'NECHES', 'MERMENTAU', 'VERMILION', 'CONCHO', 'GUADALUPE', 'FRIO', 'BLANCO', 'MEDINA',
];

export function randomSeed() {
  const n = Math.floor(Math.random() * SEED_WORDS.length);
  const num = 100 + Math.floor(Math.random() * 900);
  return `${SEED_WORDS[n]}-${num}`;
}

export function normSeed(v) {
  const s = String(v || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  return s || randomSeed();
}

// Note: small fast PRNG for band-level generation that runs once in a fixed order.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise1(seed, x) {
  const xi = Math.floor(x);
  const t = smooth(x - xi);
  const a = u01(hash2(seed, xi));
  const b = u01(hash2(seed, xi + 1));
  return a + (b - a) * t;
}

export function noise2(seed, x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = u01(hash3(seed, xi, yi));
  const b = u01(hash3(seed, xi + 1, yi));
  const c = u01(hash3(seed, xi, yi + 1));
  const d = u01(hash3(seed, xi + 1, yi + 1));
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

export function fbm2(seed, x, y, octaves = 3) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(seed + i * 101, x * f, y * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
