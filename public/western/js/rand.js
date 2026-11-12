// Note: deterministic hashing, PRNG and seed words; no DOM or Phaser so it runs in Node too.

function mix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
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

// Note: seeds are short uppercase words so the outcome screen can show them and players can type them back.
const SEED_WORDS = [
  'TOMBSTONE', 'ALLEN', 'FREMONT', 'TOUGHNUT', 'SAN-PEDRO', 'HAFFORD', 'CRAWLEY', 'CONTENTION',
  'DRAGOON', 'GLEESON', 'CHARLESTON', 'BISBEE', 'BENSON', 'HEREFORD', 'SULPHUR', 'WHETSTONE',
];

export function randomSeed(random = Math.random) {
  const n = Math.floor(random() * SEED_WORDS.length);
  const num = 100 + Math.floor(random() * 900);
  return `${SEED_WORDS[n]}-${num}`;
}

export function normSeed(v, random = Math.random) {
  const s = String(v || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  return s || randomSeed(random);
}

// Note: small fast PRNG; generation and combat each own an instance so they never share a stream.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const self = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // Note: weights is a list of [value, weight] pairs.
    weighted(weights) {
      const total = weights.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of weights) {
        r -= w;
        if (r <= 0) return v;
      }
      return weights[weights.length - 1][0];
    },
    gauss: () => {
      const u = Math.max(next(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
  };
  return self;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Note: a stable number in 0..1 from a text tag; hit and drop rolls hash the seed, so they never move the sim's combat stream.
export const unit = (tag) => seedFromString(tag) / 4294967296;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
