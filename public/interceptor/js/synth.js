// Note: pure sample synthesis for engine loops and gunshots; no WebAudio here, so node tests can render it.

const TAU = Math.PI * 2;

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
}

function peakOf(chs) {
  let m = 0;
  for (const d of chs) for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  return m;
}

export function rmsOf(chs) {
  let e = 0;
  let n = 0;
  for (const d of chs) {
    for (let i = 0; i < d.length; i++) e += d[i] * d[i];
    n += d.length;
  }
  return Math.sqrt(e / Math.max(1, n));
}

function scale(chs, k) {
  for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= k;
}

// Note: crank angle and exhaust bank of each firing over two turns; the Ford modular V8 fires 1-3-7-2-6-5-4-8 with cylinders 1-4 on one bank.
export function layout(cyl) {
  if (cyl === 8) return [1, 3, 7, 2, 6, 5, 4, 8].map((c, i) => ({ deg: i * 90, bank: c <= 4 ? 0 : 1 }));
  return Array.from({ length: cyl }, (_, i) => ({ deg: (i * 720) / cyl, bank: -1 }));
}

// Note: exhaust pulse per load state; decay follows crank degrees within a fixed time window, rise is in seconds.
const PULSE = {
  on: { amp: 1, rise: 0.00025, decay: 30, under: 0.3, noise: 0.45, dead: false, skip: 0, slop: 0.6 },
  off: { amp: 0.6, rise: 0.0005, decay: 40, under: 0.25, noise: 0.6, dead: false, skip: 0, slop: 1 },
  miss: { amp: 0.9, rise: 0.0003, decay: 32, under: 0.3, noise: 0.5, dead: true, skip: 0.08, slop: 2.5 },
};

export const LOADS = Object.keys(PULSE);

// Note: loops are rendered at three points of the rev range and played no faster than recorded, so they never alias.
export const ANCHORS = [
  { at: 0.32, cycles: 24, secs: 1.6, rough: 0.1 },
  { at: 0.6, cycles: 32, secs: 1.4, rough: 0.07 },
  { at: 1, cycles: 48, secs: 1.2, rough: 0.045 },
];

// Note: one stereo loop of whole engine cycles at `rev`; ref is the exact rpm the loop plays at rate 1.
export function engineLoop(sr, o) {
  const P = PULSE[o.kind];
  const C = Math.round((sr * 120) / o.rev);
  const cycles = Math.max(o.cycles, Math.ceil((o.secs * sr) / C));
  const n = C * cycles;
  const ch = [new Float32Array(n), new Float32Array(n)];
  const fires = layout(o.cyl);
  // Note: per-cylinder trim comes from the seed alone, so every loop of one engine shares the same uneven cylinders.
  const trim = seeded(o.seed);
  const cylAmp = fires.map(() => 0.86 + 0.14 * trim());
  const cylDeg = fires.map(() => (fires.length > 4 ? 2.4 : 1.2) * (trim() - 0.5));
  const dead = Math.floor(trim() * fires.length);
  const rand = seeded(o.seed * 7919 + Math.round(o.rev) + o.kind.length * 131);
  const tauD = Math.min(0.0012, Math.max(0.0004, P.decay / (6 * o.rev)));
  const len = Math.min(n, Math.ceil(sr * tauD * 9));
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < fires.length; k++) {
      let a = P.amp * cylAmp[k] * Math.max(0.2, 1 + o.rough * gauss(rand));
      if (P.dead && k === dead && fires.length > 1) a *= 0.06;
      else if (rand() < P.skip) a *= 0.15;
      const deg = fires[k].deg + cylDeg[k] + P.slop * gauss(rand);
      pulse(ch, fires[k].bank, c * C + (deg / 720) * C, a, P, sr, tauD, len, rand);
    }
  }
  for (const d of ch) {
    let m = 0;
    for (let i = 0; i < n; i++) m += d[i];
    m /= n;
    for (let i = 0; i < n; i++) d[i] -= m;
  }
  return { ref: (sr * 120) / C, ch };
}

// Note: blowdown spike, scavenging undershoot and a turbulent hiss; writes wrap around the loop end.
function pulse(ch, bank, at, a, P, sr, tauD, len, rand) {
  const n = ch[0].length;
  const i0 = Math.floor(at);
  const frac = at - i0;
  const tu = 1.7 * tauD;
  const tn = 0.45 * tauD;
  const t0 = (1 - frac) / sr;
  // Note: the decays advance by one multiply per sample instead of an exp each.
  const step = (tau) => [Math.exp(-t0 / tau), Math.exp(-1 / (sr * tau))];
  let [eR, kR] = step(P.rise);
  let [eD, kD] = step(tauD);
  let [eN, kN] = step(tn);
  let [eU, kU] = step(tu);
  let lp = 0;
  let j = ((i0 % n) + n) % n;
  for (let i = 0; i < len; i++) {
    const front = 1 - eR;
    const g = ((t0 + i / sr) / tu) * Math.E * eU;
    lp += 0.8 * (rand() * 2 - 1 - lp);
    const s = a * (front * eD - P.under * g * g + P.noise * lp * front * eN);
    if (bank !== 1) ch[0][j] += s;
    if (bank !== 0) ch[1][j] += s;
    eR *= kR;
    eD *= kD;
    eN *= kN;
    eU *= kU;
    if (++j === n) j = 0;
  }
}

// Note: every loop of one engine shares one gain, so load and anchor crossfades keep their real level steps.
export function engineSet(sr, cyl, red, seed = 7) {
  const anchors = ANCHORS.map((A) => {
    const loops = {};
    for (const kind of Object.keys(PULSE)) loops[kind] = engineLoop(sr, { cyl, rev: red * A.at, kind, seed, cycles: A.cycles, secs: A.secs, rough: A.rough });
    return { ref: loops.on.ref, loops };
  });
  const all = anchors.flatMap((A) => Object.values(A.loops).flatMap((l) => l.ch));
  let k = 0.25 / rmsOf(anchors[anchors.length - 1].loops.on.ch);
  k = Math.min(k, 0.98 / peakOf(all));
  // Note: fewer, smaller cylinders move less gas, so a four is quieter than a V8.
  scale(all, k * Math.min(1, 0.3 + 0.0875 * cyl));
  return anchors;
}

// Note: one unburnt-fuel bang in the exhaust on overrun.
export function popSound(sr, rand) {
  const n = Math.round(sr * 0.035);
  const d = new Float32Array(n);
  const tau = 0.0015 + 0.004 * rand();
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += 0.45 * (rand() * 2 - 1 - lp);
    d[i] = (1 - Math.exp(-t / 0.00015)) * (Math.exp(-t / tau) + 0.9 * lp * Math.exp(-t / (tau * 1.6)));
  }
  return d;
}

// Note: per-weapon blast; T is the positive phase of the muzzle wave, gas the roar of the escaping charge, tail the open-air reverb.
const GUN = {
  pistol: { T: 0.00045, b: 1.4, gas: 0.022, gasF: 0.35, gasAmp: 0.5, thump: 160, thumpAmp: 0.1, thumpT: 0.05, crack: 0, clack: [0.016, 2600], tail: 0.28, tailAmp: 0.08, echoes: 4, len: 1, peak: 1 },
  smg: { T: 0.0004, b: 1.4, gas: 0.012, gasF: 0.4, gasAmp: 0.45, thump: 180, thumpAmp: 0.08, thumpT: 0.035, crack: 0, clack: [0.011, 3200], tail: 0.12, tailAmp: 0.06, echoes: 2, len: 0.45, peak: 0.9 },
  rifle: { T: 0.00035, b: 1.2, gas: 0.03, gasF: 0.5, gasAmp: 0.5, thump: 140, thumpAmp: 0.08, thumpT: 0.05, crack: 0.8, clack: [0.014, 2200], tail: 0.4, tailAmp: 0.1, echoes: 6, len: 1.6, peak: 0.95 },
  shotgun: { T: 0.0009, b: 1.6, gas: 0.05, gasF: 0.25, gasAmp: 0.65, thump: 110, thumpAmp: 0.16, thumpT: 0.07, crack: 0.15, clack: null, pump: [0.34, 0.44], tail: 0.38, tailAmp: 0.11, echoes: 5, len: 1.5, peak: 1 },
};
export const GUN_KINDS = Object.keys(GUN);

// Note: Friedlander muzzle wave plus its ground bounce, gas roar, action noise, echoes off the terrain and a darkening tail, soft clipped.
export function gunshot(sr, kind, rand) {
  const G = GUN[kind] || GUN.pistol;
  const n = Math.round(sr * G.len);
  const d = new Float32Array(n);
  const dryN = Math.round(sr * 0.06);
  const dry = new Float32Array(dryN);
  const bounce = 0.0006 + 0.0008 * rand();
  const T = G.T * (0.92 + 0.16 * rand());
  let lp = 0;
  let lpB = 0;
  for (let i = 0; i < dryN; i++) {
    const t = i / sr;
    let s = friedlander(t, T, G.b) + 0.55 * friedlander(t - bounce, T * 1.3, G.b);
    lp += G.gasF * (rand() * 2 - 1 - lp);
    lpB += 0.04 * (lp - lpB);
    const gas = Math.min(1, t / 0.0004) * Math.exp(-t / G.gas);
    s += G.gasAmp * gas * (lp + 1.2 * lpB);
    s += G.thumpAmp * Math.sin(TAU * G.thump * t) * Math.min(1, t / 0.002) * Math.exp(-t / G.thumpT);
    if (G.crack) s += G.crack * nWave(t, 0.00025);
    dry[i] = s;
  }
  d.set(dry.subarray(0, Math.min(dryN, n)));
  if (G.clack) clack(d, sr, G.clack[0], G.clack[1], 0.14, rand);
  if (G.pump) for (const at of G.pump) clack(d, sr, at * (0.95 + 0.1 * rand()), 1500, 0.2, rand);
  for (let e = 0; e < G.echoes; e++) {
    const at = 0.06 + Math.min(0.45, G.len - 0.25) * rand();
    echo(d, dry, sr, at, (0.08 + 0.14 * rand()) * Math.exp(-at / 0.5), rand);
  }
  tail(d, sr, G, rand);
  for (let i = 0; i < n; i++) d[i] = Math.tanh(2.5 * d[i]);
  const fade = Math.round(sr * 0.05);
  for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;
  scale([d], G.peak / peakOf([d]));
  return d;
}

function friedlander(t, T, b) {
  if (t < 0) return 0;
  const r = t / T;
  return Math.min(1, t / 0.00002) * (1 - r) * Math.exp(-b * r);
}

// Note: the sonic boom of a supersonic bullet, an N wave a quarter millisecond long.
function nWave(t, dur) {
  return t < 0 || t > dur ? 0 : 1 - (2 * t) / dur;
}

function clack(d, sr, at, f, amp, rand) {
  const i0 = Math.round(sr * at);
  const len = Math.round(sr * 0.03);
  for (let i = 0; i < len && i0 + i < d.length; i++) {
    const t = i / sr;
    const ring = Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 1.71 * t) + 0.35 * Math.sin(TAU * f * 2.93 * t);
    d[i0 + i] += amp * Math.exp(-t / 0.004) * (0.6 * ring + 0.8 * (rand() * 2 - 1) * Math.exp(-t / 0.0008));
  }
}

// Note: a darker copy of the blast thrown back by a tree line or a building.
function echo(d, dry, sr, at, amp, rand) {
  const i0 = Math.round(sr * at);
  const k = 0.12 * Math.exp(-at / 0.3) + 0.03;
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < dry.length && i0 + i < d.length; i++) {
    lp += k * (dry[i] - lp);
    lp2 += k * (lp - lp2);
    d[i0 + i] += amp * 4 * lp2 * (0.9 + 0.2 * rand());
  }
}

// Note: diffuse open-air decay; high frequencies die first as the air soaks them up.
function tail(d, sr, G, rand) {
  let lp = 0;
  const i0 = Math.round(sr * 0.008);
  for (let i = i0; i < d.length; i++) {
    const t = (i - i0) / sr;
    const k = 0.35 * Math.exp(-t / 0.25) + 0.025;
    lp += k * (rand() * 2 - 1 - lp);
    d[i] += G.tailAmp * lp * Math.min(1, t / 0.025) * Math.exp(-t / G.tail) * (1.4 - k);
  }
}

// Note: the snap of a rifle round passing close, heard before the far shot that fired it.
export function crackSound(sr, rand) {
  const n = Math.round(sr * 0.12);
  const d = new Float32Array(n);
  const dur = 0.0002 + 0.0001 * rand();
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += 0.6 * (rand() * 2 - 1 - lp);
    d[i] = nWave(t, dur) + 0.5 * nWave(t - 0.0011, dur * 1.2) + 0.12 * lp * Math.exp(-t / 0.01) + 0.05 * lp * Math.exp(-t / 0.05);
  }
  scale([d], 0.8 / peakOf([d]));
  return d;
}
