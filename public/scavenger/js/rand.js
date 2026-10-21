// Note: deterministic hashing, PRNG and noise; no DOM or three.js so it runs in Node too.

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

export function hash5(a, b, c, d, e) {
  return mix(hash4(a, b, c, d) + Math.imul(e | 0, 0x2c1b3c6d) + 0x297a2d39);
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

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rand {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  range(a, b) {
    return a + (b - a) * this.next();
  }

  int(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  // Note: weighted pick over an array of {w} or a plain weights array.
  weighted(items, getW = (x) => x.w) {
    let total = 0;
    for (const it of items) total += getW(it);
    let r = this.next() * total;
    for (const it of items) {
      r -= getW(it);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

export function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lat3(seed, x, y, z) {
  return u01(hash4(seed, x, y, z));
}

// Note: smooth value noise in [0,1].
export function noise3(seed, x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const c000 = lat3(seed, xi, yi, zi);
  const c100 = lat3(seed, xi + 1, yi, zi);
  const c010 = lat3(seed, xi, yi + 1, zi);
  const c110 = lat3(seed, xi + 1, yi + 1, zi);
  const c001 = lat3(seed, xi, yi, zi + 1);
  const c101 = lat3(seed, xi + 1, yi, zi + 1);
  const c011 = lat3(seed, xi, yi + 1, zi + 1);
  const c111 = lat3(seed, xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * xf;
  const x10 = c010 + (c110 - c010) * xf;
  const x01 = c001 + (c101 - c001) * xf;
  const x11 = c011 + (c111 - c011) * xf;
  const y0 = x00 + (x10 - x00) * yf;
  const y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}

export function fbm3(seed, x, y, z, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(seed + o * 101, x * f, y * f, z * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.02;
  }
  return sum / norm;
}

// Note: periodic 2D value noise, tiles every `period` lattice cells (for seamless textures).
export function pnoise2(seed, x, y, period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = u01(hash3(seed, x0, y0));
  const b = u01(hash3(seed, x1, y0));
  const c = u01(hash3(seed, x0, y1));
  const d = u01(hash3(seed, x1, y1));
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function pfbm2(seed, x, y, period, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise2(seed + o * 57, x * f, y * f, period * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
