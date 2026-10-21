// Note: procedural sound engine; every sound is synthesized with Web Audio, no audio assets.

import { CELL_ARR, FACE_DIR, DISTRICTS } from './config.js';
import { mulberry32, clamp, smoothstep } from './rand.js';

const TAU = Math.PI * 2;
const FLOOR = 0.0001;
const LOOK = 0.25;
const MAX_VOICES = 40;
const MAX_EMITTERS = 6;
const MAX_BUZZ = 3;
const REFRESH = 0.12;
const BED_STEP = 0.05;
const BUZZ_R = 14;
const DEFAULT_R = 14;
const DRONE_LEVEL = 0.06;
const CLICK_GAIN = 4;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const byScore = (a, b) => b.score - a.score;
const finite3 = (p) => !!p && Number.isFinite(p[0] + p[1] + p[2]);
const wrap = (i, n) => ((i % n) + n) % n;

function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Note: ramps a param from where it is now to a target; a zero target snaps to exact silence so idle nodes can sleep.
function fadeTo(param, value, now, tc) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, tc);
  if (value === 0) param.setValueAtTime(0, now + tc * 9);
}

function setPos(p, x, y, z) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else if (p.setPosition) p.setPosition(x, y, z);
}

// Note: output limiter shape; linear below 0.7, then a soft knee that never exceeds 1.
const SOFT_CURVE = (() => {
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    c[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3));
  }
  return c;
})();

// Note: gentle tape-style saturation for the jukebox; unity slope at the origin.
const TAPE_CURVE = (() => {
  const n = 1025;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(2.2 * x) / 2.2;
  }
  return c;
})();

// Note: noise loops are crossfaded at the seam so a looping bed never clicks.
function makeNoise(ctx, seconds, kind, seed) {
  const fade = 2048;
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = mulberry32(seed);
  const x = new Float32Array(n + fade);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let br = 0;
  for (let i = 0; i < x.length; i++) {
    const w = r() * 2 - 1;
    if (kind === 'white') x[i] = w * 0.7;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      x[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      br = (br + 0.02 * w) / 1.02;
      x[i] = br * 3.2;
    }
  }
  for (let i = 0; i < n; i++) d[i] = x[i];
  for (let i = 0; i < fade; i++) {
    const t = (i / fade) * (Math.PI / 2);
    d[i] = x[i] * Math.sin(t) + x[n + i] * Math.cos(t);
  }
  return buf;
}

function harmonicWave(ctx, harm) {
  const real = new Float32Array(harm.length + 1);
  const imag = new Float32Array(harm.length + 1);
  for (let k = 0; k < harm.length; k++) imag[k + 1] = harm[k];
  return ctx.createPeriodicWave(real, imag);
}

// Note: impulse response recipes; the tube is short and ringing, the hall long and dark.
const IR_SPEC = {
  tube: {
    len: 1.1, decay: 0.75, pre: 0.002, hi: 9000, lo: 2500, damp: 0.5, flutter: 0.0125, ring: [610, 1280, 2470],
  },
  room: {
    len: 1.7, decay: 1.2, pre: 0.012, hi: 6500, lo: 1400, damp: 0.7, taps: 8, spread: 0.07,
  },
  hall: {
    len: 2.5, decay: 2.3, pre: 0.026, hi: 5500, lo: 900, damp: 1.1, taps: 12, spread: 0.13,
  },
};

function makeIR(ctx, spec, seed) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * spec.len);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const r = mulberry32(seed + ch * 977);
    const pre = Math.floor(sr * spec.pre);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / spec.decay);
      const fc = spec.lo + (spec.hi - spec.lo) * Math.exp(-t / spec.damp);
      const a = 1 - Math.exp((-TAU * fc) / sr);
      lp += a * (r() * 2 - 1 - lp);
      d[i] = (lp * env * 0.5) / Math.sqrt(a);
    }
    if (spec.flutter) {
      for (let k = 1; k <= 24; k++) {
        const i = pre + Math.floor(sr * (spec.flutter * k + (r() - 0.5) * 0.0006 + ch * 0.0004));
        if (i < n) d[i] += (k % 2 ? 1 : -1) * 0.9 * Math.exp(-k * 0.2);
      }
      for (const f of spec.ring) {
        const ph = r() * TAU;
        const m = Math.min(n, Math.floor(sr * 0.8));
        for (let i = 0; i < m; i++) d[i] += 0.05 * Math.sin((TAU * f * i) / sr + ph) * Math.exp(-i / sr / 0.22);
      }
    } else {
      for (let k = 0; k < spec.taps; k++) {
        const i = pre + Math.floor(sr * (0.004 + r() * spec.spread + ch * 0.0007));
        if (i < n) d[i] += (r() < 0.5 ? -1 : 1) * 0.9 * Math.exp(-(i - pre) / sr / 0.09);
      }
    }
  }
  return buf;
}

// Note: per-district drone character; harm lists the partial amplitudes of the mains-style hum.
const FLAVOR = [
  { harm: [0.7, 0.85, 0.6, 0.35, 0.2, 0.1], lp: 650, beat: 0.35, third: 0, sub: 0.2, noise: 190, nq: 0.8, na: 0.5, lfo: 0.06 },
  { harm: [0.7, 0.6, 0.3, 0.12, 0.06], lp: 520, beat: 0.2, third: 0, sub: 0.15, noise: 320, nq: 0.7, na: 0.3, lfo: 0.05 },
  { harm: [0.8, 0.35, 0.55, 0.12, 0.22], lp: 1000, beat: 0.12, third: 0.05, sub: 0.1, noise: 1500, nq: 1.0, na: 0.22, lfo: 0.08 },
  { harm: [0.75, 0.95, 0.45, 0.2, 0.1], lp: 480, beat: 0.28, third: 0, sub: 0.3, noise: 130, nq: 0.7, na: 0.5, lfo: 0.045 },
  { harm: [1, 0.35, 0.2, 0.15, 0.1, 0.25], lp: 1150, beat: 0.08, third: 0.06, sub: 0.1, noise: 900, nq: 1.1, na: 0.2, lfo: 0.09 },
  { harm: [0.7, 0.8, 0.4, 0.22, 0.1], lp: 400, beat: 1.7, third: 0.28, sub: 0.25, noise: 90, nq: 0.6, na: 0.55, lfo: 0.035 },
];

// Note: scale tables as semitone offsets; the jukebox picks one per tune and the sparse melody uses two.
const MODES = [
  [0, 2, 3, 5, 7, 9, 10],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11],
];
const PROGS = [
  [[0, 5, 3, 4], [3, 4, 0, 5]],
  [[0, 3, 4, 0], [5, 3, 4, 4]],
  [[5, 3, 0, 4], [3, 0, 4, 5]],
  [[0, 6, 5, 4], [3, 5, 4, 0]],
];
const RHY = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 2]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2, 2]],
  [[0, 2], [2, 1], [3, 1]],
  [[0, 1], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
  [[1, 1], [2, 1], [3, 1]],
];
const STEPS = [-2, -1, -1, 0, 1, 1, 2];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2];
const PENTA = [0, 2, 4, 7, 9];
const BELL = [[1, 1, 1], [2.76, 0.3, 0.55], [5.4, 0.12, 0.3]];
const KNOCK = [[1, 0.9, 0.24], [2.32, 0.45, 0.15], [4.1, 0.22, 0.09]];
const ROOTS = [45, 48, 50, 43, 52, 41];
// Note: loudness tables found by measuring peaks offline; cues are scaled at the source, events at 8 m.
const CUE = { bump: 0.52, click: 0.39, stick: 0.16, ping: 0.66, log: 0.6 };
const EVENT_GAIN = { creak: 0.27, knock: 0.18, clatter: 0.28, thud: 0.24, groan: 0.074, rattle: 0.27 };

function nearestTone(m, chord) {
  let best = m;
  let bd = 99;
  for (let x = m - 2; x <= m + 2; x++) {
    const k = (((x - chord) % 7) + 7) % 7;
    if (k === 0 || k === 2 || k === 4) {
      const d = Math.abs(x - m);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
  }
  return best;
}

// Note: deterministic 16-bar tune; events are {b: beat, d: beats, m: midi, v: velocity, w: 0 piano or 1 box}.
function makeTune(seed) {
  const r = mulberry32(seed >>> 0);
  const mode = MODES[(r() * MODES.length) | 0];
  const progs = PROGS[(r() * PROGS.length) | 0];
  const root = 46 + ((r() * 8) | 0);
  const bpm = 66 + ((r() * 26) | 0);
  const deg = (d) => root + mode[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const ev = [];
  const seedA = (r() * 1e9) | 0;
  const seedB = (r() * 1e9) | 0;
  const phrase = (b0, chords, ps, end) => {
    const pr = mulberry32(ps);
    let m = 2 + ((pr() * 3) | 0);
    for (let bar = 0; bar < 4; bar++) {
      const c = chords[bar];
      const tpl = RHY[(pr() * RHY.length) | 0];
      if (end && bar === 3) {
        ev.push({ b: b0 + 12, d: 4, m: deg(14), v: 0.8, w: 1 });
        break;
      }
      for (let k = 0; k < tpl.length; k++) {
        const off = tpl[k][0];
        const strong = off === 0 || off === 2;
        if (!strong && pr() < 0.22) continue;
        m = clamp(m + STEPS[(pr() * STEPS.length) | 0], 0, 9);
        if (strong) m = nearestTone(m, c);
        ev.push({ b: b0 + bar * 4 + off, d: tpl[k][1], m: deg(14 + m), v: strong ? 0.8 : 0.6, w: 1 });
      }
    }
  };
  const A = progs[0];
  const B = progs[1];
  phrase(0, A, seedA, false);
  phrase(16, A, seedA ^ 0x55, false);
  phrase(32, B, seedB, false);
  phrase(48, A, seedA ^ 0x99, true);
  for (let bar = 0; bar < 16; bar++) {
    const sec = bar >> 2;
    const c = bar === 15 ? 0 : (sec === 2 ? B : A)[bar & 3];
    const b0 = bar * 4;
    const tones = [deg(c), deg(c + 2), deg(c + 4)];
    ev.push({ b: b0, d: 2, m: deg(c) - 12, v: 0.45, w: 0 });
    if (r() < 0.18) {
      ev.push({ b: b0, d: 4, m: tones[0] + 12, v: 0.3, w: 0 });
      ev.push({ b: b0, d: 4, m: tones[2] + 12, v: 0.26, w: 0 });
      continue;
    }
    for (let k = 0; k < 8; k++) ev.push({ b: b0 + k * 0.5, d: 0.5, m: tones[ARP[k]] + 12, v: k === 0 ? 0.42 : 0.3, w: 0 });
  }
  ev.sort((x, y) => x.b - y.b);
  return { events: ev, bpm, loopBeats: 64 };
}

// Note: one-shot helpers; every node created here cleans itself up when its source ends.
function toneAt(a, dest, t, type, hz, amp, att, dec, hz2 = 0) {
  const ctx = a.ctx;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(hz, t);
  if (hz2) o.frequency.exponentialRampToValueAtTime(hz2, t + att + dec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(amp, t + att);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + att + dec);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + att + dec + 0.03);
  a.clean(o, [g]);
  return o;
}

function noiseAt(a, dest, t, o) {
  const ctx = a.ctx;
  const src = ctx.createBufferSource();
  src.buffer = o.buf;
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q;
  f.frequency.setValueAtTime(o.hz, t);
  const end = t + o.att + o.dec;
  if (o.hz2) f.frequency.exponentialRampToValueAtTime(o.hz2, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(o.amp, t + o.att);
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t, a.noiseOffset(o.buf, o.att + o.dec + 0.05));
  src.stop(end + 0.03);
  a.clean(src, [f, g]);
}

function clickAt(a, dest, t, hz, q, amp, dur = 0.012) {
  noiseAt(a, dest, t, {
    buf: a.buf.white, type: 'bandpass', hz, q, amp: amp * CLICK_GAIN, att: 0.0008, dec: dur,
  });
}

function bellAt(a, dest, t, f, dur, amp) {
  const ctx = a.ctx;
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.004);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  g.connect(dest);
  const srcs = [];
  const nodes = [g];
  for (let k = 0; k < BELL.length; k++) {
    const o = ctx.createOscillator();
    o.frequency.value = f * BELL[k][0];
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(BELL[k][1], t);
    pg.gain.exponentialRampToValueAtTime(FLOOR, t + dur * BELL[k][2]);
    o.connect(pg);
    pg.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
    srcs.push(o);
    nodes.push(pg);
  }
  a.clean(srcs, nodes);
}

// Note: soft FM bell with a decaying modulation index, used by the sparse melody.
function fmBellAt(a, dest, t, f, dur, amp) {
  const ctx = a.ctx;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * 2;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.6, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.04, t + dur * 0.4);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.012);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
  car.connect(g);
  g.connect(dest);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
  a.clean([car, mod], [mg, g]);
}

// Note: jukebox voices; the piano is a Rhodes-like FM pair and the box is a short additive tine.
function pianoAt(a, dest, t, f, dur, vel, cents) {
  const ctx = a.ctx;
  const car = ctx.createOscillator();
  car.frequency.value = f;
  car.detune.value = cents;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  mod.detune.value = cents;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.3 * vel, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.03, t + 0.6);
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ctx.createGain();
  const end = t + 0.5 + dur * 0.9;
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(vel * 0.45, t + 0.005);
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  car.connect(g);
  g.connect(dest);
  car.start(t);
  mod.start(t);
  car.stop(end + 0.03);
  mod.stop(end + 0.03);
  a.clean([car, mod], [mg, g]);
}

function boxAt(a, dest, t, f, dur, vel, cents) {
  const ctx = a.ctx;
  const g = ctx.createGain();
  const end = t + 0.9 + dur * 0.5;
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.002);
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  g.connect(dest);
  const srcs = [];
  const nodes = [g];
  const parts = [[1, 1, 1], [3.01, 0.35, 0.4], [5.42, 0.14, 0.2]];
  for (let k = 0; k < parts.length; k++) {
    const o = ctx.createOscillator();
    o.frequency.value = f * parts[k][0];
    o.detune.value = cents;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(parts[k][1], t);
    pg.gain.exponentialRampToValueAtTime(FLOOR, t + (end - t) * parts[k][2]);
    o.connect(pg);
    pg.connect(g);
    o.start(t);
    o.stop(end + 0.03);
    srcs.push(o);
    nodes.push(pg);
  }
  a.clean(srcs, nodes);
}

// Note: ambient one-shots heard from random spots around the listener; each returns its length in seconds.
const EVENTS = {
  creak(a, dest, t, r) {
    const ctx = a.ctx;
    const dur = 0.9 + r() * 1.5;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    let f = 70 + r() * 90;
    o.frequency.setValueAtTime(f, t);
    const steps = 5 + ((r() * 5) | 0);
    for (let k = 1; k <= steps; k++) {
      f = clamp(f * (0.8 + r() * 0.45), 45, 280);
      o.frequency.linearRampToValueAtTime(f, t + (dur * k) / steps);
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 9;
    bp.frequency.setValueAtTime(350 + r() * 450, t);
    bp.frequency.linearRampToValueAtTime(250 + r() * 700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(2.2, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(FLOOR, t + dur);
    const jit = ctx.createOscillator();
    jit.frequency.value = 14 + r() * 16;
    const jg = ctx.createGain();
    jg.gain.value = 0.6;
    jit.connect(jg);
    jg.connect(g.gain);
    o.connect(bp);
    bp.connect(g);
    g.connect(dest);
    o.start(t);
    jit.start(t);
    o.stop(t + dur + 0.05);
    jit.stop(t + dur + 0.05);
    a.clean([o, jit], [bp, g, jg]);
    return dur;
  },
  knock(a, dest, t, r) {
    const n = 1 + ((r() * 3) | 0);
    let tt = t;
    for (let k = 0; k < n; k++) {
      const f = 140 + r() * 260;
      for (let m = 0; m < KNOCK.length; m++) toneAt(a, dest, tt, 'sine', f * KNOCK[m][0], KNOCK[m][1], 0.001, KNOCK[m][2]);
      clickAt(a, dest, tt, 900, 1, 0.9, 0.012);
      tt += 0.22 + r() * 0.5;
    }
    return tt - t + 0.4;
  },
  clatter(a, dest, t, r) {
    const n = 5 + ((r() * 8) | 0);
    let tt = t;
    for (let k = 0; k < n; k++) {
      clickAt(a, dest, tt, 700 + r() * 1100, 1.6, 0.7 + r() * 0.5, 0.01);
      tt += 0.02 + r() * 0.09;
    }
    return tt - t + 0.3;
  },
  thud(a, dest, t, r) {
    const f = 70 + r() * 40;
    toneAt(a, dest, t, 'sine', f, 1.0, 0.004, 0.45, f * 0.45);
    noiseAt(a, dest, t, {
      buf: a.buf.brown, type: 'lowpass', hz: 220, q: 0.7, amp: 1.6, att: 0.003, dec: 0.35,
    });
    return 0.9;
  },
  groan(a, dest, t, r) {
    const ctx = a.ctx;
    const dur = 2.2 + r() * 2.4;
    const f = 62 + r() * 30;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.linearRampToValueAtTime(260, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(150, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(1.1, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(FLOOR, t + dur);
    const srcs = [];
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f + k * 1.6, t);
      o.frequency.linearRampToValueAtTime(f * 0.78 + k * 1.6, t + dur);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
      srcs.push(o);
    }
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.5 + r() * 2;
    const tg = ctx.createGain();
    tg.gain.value = 0.25;
    trem.connect(tg);
    tg.connect(g.gain);
    trem.start(t);
    trem.stop(t + dur + 0.05);
    srcs.push(trem);
    lp.connect(g);
    g.connect(dest);
    a.clean(srcs, [lp, g, tg]);
    return dur;
  },
  rattle(a, dest, t, r) {
    const n = 14 + ((r() * 10) | 0);
    let tt = t;
    for (let k = 0; k < n; k++) {
      clickAt(a, dest, tt, 500 + r() * 900, 1.2, 0.5 * (1 - k / n) + 0.1, 0.012);
      tt += 0.03 + r() * 0.05;
    }
    return tt - t + 0.3;
  },
};
const EVENT_NAMES = Object.keys(EVENTS);

// Note: emitter kinds; gain is the base loudness, wet the reverb send, make() builds the sustained graph.
const KINDS = {
  hum: {
    gain: 0.24,
    wet: 0.2,
    make(a, v) {
      const o = a.osc(v, 'sine', (v.rnd() < 0.5 ? 50 : 60) * (v.rnd() < 0.3 ? 2 : 1), a.humWave);
      const lp = a.filt(v, 'lowpass', 800, 0.7);
      const g = a.gain(v, 0.9);
      o.connect(lp);
      lp.connect(g);
      g.connect(v.in);
      const trem = a.osc(v, 'sine', 0.13 + v.rnd() * 0.1);
      const tg = a.gain(v, 0.1);
      trem.connect(tg);
      tg.connect(g.gain);
    },
  },
  fan: {
    gain: 1.1,
    wet: 0.25,
    make(a, v) {
      const n = a.noise(v, a.buf.pink, 0.9 + v.rnd() * 0.3);
      const bp = a.filt(v, 'bandpass', 320 + v.rnd() * 240, 0.9);
      const g = a.gain(v, 0.55);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const lfo = a.osc(v, 'sine', 5 + v.rnd() * 7);
      const lg = a.gain(v, 0.22);
      lfo.connect(lg);
      lg.connect(g.gain);
      const low = a.osc(v, 'sine', 34 + v.rnd() * 10);
      const lowG = a.gain(v, 0.1);
      low.connect(lowG);
      lowG.connect(v.in);
    },
  },
  steam: {
    gain: 0.3,
    wet: 0.3,
    make(a, v, now) {
      const n = a.noise(v, a.buf.white, 1);
      const hp = a.filt(v, 'highpass', 1800, 0.7);
      const bp = a.filt(v, 'bandpass', 4800 + v.rnd() * 1500, 0.6);
      const g = a.gain(v, 0.12);
      n.connect(hp);
      hp.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      v.next = now + v.rnd() * 4;
      v.tick = (t0) => {
        if (t0 < v.next - LOOK) return;
        const t = Math.max(t0, v.next);
        const hold = 0.8 + v.rnd() * 1.8;
        g.gain.setValueAtTime(0.12, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.12);
        g.gain.setValueAtTime(0.9, t + 0.12 + hold);
        g.gain.exponentialRampToValueAtTime(0.12, t + hold + 1.8);
        v.next = t + hold + 1.8 + 3 + v.rnd() * 8;
      };
    },
  },
  drip: {
    gain: 0.35,
    wet: 0.9,
    make(a, v, now) {
      v.next = now + v.rnd() * 1.5;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          const hz = 650 + v.rnd() * 1500;
          toneAt(a, v.in, t, 'sine', hz, 0.5 + v.rnd() * 0.5, 0.003, 0.22, hz * 0.55);
          v.next = t + 0.6 + v.rnd() * v.rnd() * 6;
        }
      };
    },
  },
  relay: {
    gain: 0.3,
    wet: 0.4,
    make(a, v, now) {
      v.next = now + v.rnd() * 3;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          let t = Math.max(v.next, t0);
          const burst = v.rnd() < 0.3 ? 4 + ((v.rnd() * 8) | 0) : 1 + ((v.rnd() * 2) | 0);
          for (let k = 0; k < burst; k++) {
            clickAt(a, v.in, t, 1500 + v.rnd() * 1800, 2.2, 0.8 + v.rnd() * 0.5);
            t += 0.02 + v.rnd() * 0.07;
          }
          v.next = t + 2 + v.rnd() * 7;
        }
      };
    },
  },
  buzz: {
    gain: 0.9,
    wet: 0.2,
    make(a, v, now) {
      const o = a.osc(v, 'sawtooth', v.rnd() < 0.5 ? 100 : 120);
      const bp = a.filt(v, 'bandpass', 900 + v.rnd() * 500, 1.6);
      const g = a.gain(v, 0.45);
      o.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const n = a.noise(v, a.buf.white, 1);
      const nb = a.filt(v, 'bandpass', 3200, 1);
      const ng = a.gain(v, 0);
      n.connect(nb);
      nb.connect(ng);
      ng.connect(v.in);
      v.next = now + v.rnd() * 3;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          let t = Math.max(v.next, t0);
          const flips = 3 + ((v.rnd() * 6) | 0);
          for (let k = 0; k < flips; k++) {
            const on = k % 2 === 0;
            g.gain.setValueAtTime(on ? 0.8 : 0.1, t);
            ng.gain.setValueAtTime(on ? 0.15 : 0, t);
            t += 0.03 + v.rnd() * 0.07;
          }
          g.gain.setValueAtTime(0.45, t);
          ng.gain.setValueAtTime(0, t);
          v.next = t + 1.2 + v.rnd() * 5;
        }
      };
    },
  },
  jukebox: {
    gain: 1.1,
    wet: 0.35,
    make(a, v, now) {
      const tune = makeTune(((v.e.seed || 1) >>> 0) ^ 0x7a11);
      const spb = 60 / tune.bpm;
      const lofi = a.filt(v, 'lowpass', 3000, 0.7);
      const sat = a.ctx.createWaveShaper();
      sat.curve = TAPE_CURVE;
      v.nodes.push(sat);
      const drive = a.gain(v, 2.2);
      const trim = a.gain(v, 0.55);
      lofi.connect(drive);
      drive.connect(sat);
      sat.connect(trim);
      trim.connect(v.in);
      const hiss = a.noise(v, a.buf.white, 1);
      const hl = a.filt(v, 'lowpass', 4500, 0.5);
      const hg = a.gain(v, 0.006);
      hiss.connect(hl);
      hl.connect(hg);
      hg.connect(v.in);
      const beat0 = now / spb;
      let off = Math.floor(beat0 / tune.loopBeats) * tune.loopBeats;
      const pos = beat0 - off;
      let idx = 0;
      while (idx < tune.events.length && tune.events[idx].b < pos) idx++;
      if (idx >= tune.events.length) {
        idx = 0;
        off += tune.loopBeats;
      }
      v.nextDust = now + 1 + v.rnd() * 2;
      v.tick = (t0) => {
        for (let guard = 0; guard < 48; guard++) {
          const e = tune.events[idx];
          const t = (off + e.b) * spb;
          if (t > t0 + LOOK) break;
          if (t >= t0 - 0.06) {
            // Note: wow and flutter are baked in as a per-note detune from two slow waves.
            const cents = 7 * Math.sin(TAU * 0.37 * t) + 3 * Math.sin(TAU * 5.1 * t + 1.3);
            const f = mtof(e.m);
            if (e.w) boxAt(a, lofi, Math.max(t, t0), f, e.d * spb, e.v, cents);
            else pianoAt(a, lofi, Math.max(t, t0), f, e.d * spb, e.v, cents);
          }
          idx++;
          if (idx >= tune.events.length) {
            idx = 0;
            off += tune.loopBeats;
          }
        }
        while (v.nextDust < t0 + LOOK) {
          clickAt(a, v.in, Math.max(v.nextDust, t0), 3500 + v.rnd() * 2500, 1.2, 0.03, 0.002);
          v.nextDust += 0.4 + v.rnd() * 1.6;
        }
      };
    },
  },
  reactor: {
    gain: 0.34,
    wet: 0.4,
    make(a, v) {
      const n = a.noise(v, a.buf.brown, 1);
      const lp = a.filt(v, 'lowpass', 110, 0.8);
      const g = a.gain(v, 1.1);
      n.connect(lp);
      lp.connect(g);
      g.connect(v.in);
      const o1 = a.osc(v, 'sine', 31);
      const o2 = a.osc(v, 'sine', 33.4);
      const og = a.gain(v, 0.3);
      o1.connect(og);
      o2.connect(og);
      og.connect(v.in);
      const whirr = a.osc(v, 'sawtooth', 96);
      const wl = a.filt(v, 'lowpass', 360, 0.8);
      const wg = a.gain(v, 0.25);
      whirr.connect(wl);
      wl.connect(wg);
      wg.connect(v.in);
      const sh = a.gain(v, 0.5);
      sh.connect(v.in);
      for (const f of [1180, 1763, 2431]) {
        const o = a.osc(v, 'sine', f * (1 + v.rnd() * 0.01));
        const sg = a.gain(v, 0.01);
        o.connect(sg);
        sg.connect(sh);
      }
      const lfo = a.osc(v, 'sine', 0.37);
      const lg = a.gain(v, 0.45);
      lfo.connect(lg);
      lg.connect(sh.gain);
    },
  },
  // Note: transformer hall hum: a mains fundamental with a few harmonics and rare crackles.
  transformer: {
    gain: 0.4,
    wet: 0.3,
    make(a, v, now) {
      const base = v.rnd() < 0.5 ? 100 : 120;
      const lp = a.filt(v, 'lowpass', 900, 0.7);
      const g = a.gain(v, 0.5);
      lp.connect(g);
      g.connect(v.in);
      for (const [m, amp] of [[1, 0.8], [2, 0.35], [3, 0.22], [5, 0.1]]) {
        const o = a.osc(v, 'sine', base * m * (1 + (v.rnd() - 0.5) * 0.004));
        const og = a.gain(v, amp);
        o.connect(og);
        og.connect(lp);
      }
      const trem = a.osc(v, 'sine', 0.2 + v.rnd() * 0.2);
      const tg = a.gain(v, 0.12);
      trem.connect(tg);
      tg.connect(g.gain);
      v.next = now + 2 + v.rnd() * 6;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          const n = 1 + ((v.rnd() * 4) | 0);
          for (let k = 0; k < n; k++) clickAt(a, v.in, t + k * (0.02 + v.rnd() * 0.05), 2500 + v.rnd() * 2500, 2, 0.5, 0.004);
          v.next = t + 5 + v.rnd() * 14;
        }
      };
    },
  },
  // Note: pump set: a low motor drone, brown noise and a slow stroke that swells both.
  pump: {
    gain: 0.5,
    wet: 0.4,
    make(a, v) {
      const o = a.osc(v, 'sawtooth', 48 + v.rnd() * 10);
      const lp = a.filt(v, 'lowpass', 220, 0.9);
      const g = a.gain(v, 0.55);
      o.connect(lp);
      lp.connect(g);
      g.connect(v.in);
      const n = a.noise(v, a.buf.brown, 1);
      const nl = a.filt(v, 'lowpass', 160, 0.6);
      const ng = a.gain(v, 0.8);
      n.connect(nl);
      nl.connect(ng);
      ng.connect(v.in);
      const stroke = a.osc(v, 'sine', 0.9 + v.rnd() * 0.5);
      const sg = a.gain(v, 0.3);
      stroke.connect(sg);
      sg.connect(g.gain);
      sg.connect(ng.gain);
      const whine = a.osc(v, 'sine', 1400 + v.rnd() * 500);
      const wg = a.gain(v, 0.006);
      whine.connect(wg);
      wg.connect(v.in);
    },
  },
  // Note: pressure lock cycle: a valve thump, a long fading hiss, then a heavy bolt.
  lock: {
    gain: 0.6,
    wet: 0.55,
    make(a, v, now) {
      const n = a.noise(v, a.buf.white, 1);
      const bp = a.filt(v, 'bandpass', 3200, 0.5);
      const g = a.gain(v, 0);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      v.next = now + 3 + v.rnd() * 10;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          const hold = 3 + v.rnd() * 4;
          toneAt(a, v.in, t, 'sine', 96 + v.rnd() * 30, 1.0, 0.004, 0.5, 40);
          g.gain.setValueAtTime(0, t + 0.15);
          g.gain.linearRampToValueAtTime(0.9, t + 0.35);
          g.gain.setValueAtTime(0.9, t + 0.35 + hold * 0.4);
          g.gain.linearRampToValueAtTime(0, t + 0.35 + hold);
          toneAt(a, v.in, t + hold + 1.2, 'sine', 70, 1.2, 0.004, 0.7, 30);
          clickAt(a, v.in, t + hold + 1.2, 700, 1.2, 0.8, 0.02);
          v.next = t + hold + 2 + 14 + v.rnd() * 30;
        }
      };
    },
  },
  static: {
    gain: 1.0,
    wet: 0.3,
    make(a, v, now) {
      const w = a.noise(v, a.buf.white, 1);
      const bp = a.filt(v, 'bandpass', 2600, 0.5);
      const g = a.gain(v, 0.2);
      w.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const p = a.noise(v, a.buf.pink, 1);
      const f1 = a.filt(v, 'bandpass', 500, 5);
      const f2 = a.filt(v, 'bandpass', 1500, 7);
      const g1 = a.gain(v, 0);
      const g2 = a.gain(v, 0);
      p.connect(f1);
      p.connect(f2);
      f1.connect(g1);
      f2.connect(g2);
      g1.connect(v.in);
      g2.connect(v.in);
      v.next = now;
      v.phraseEnd = 0;
      v.nextPhrase = now + v.rnd() * 4;
      v.tick = (t0) => {
        if (t0 < v.next) return;
        v.next = t0 + 0.16 + v.rnd() * 0.22;
        g.gain.setTargetAtTime(0.1 + v.rnd() * 0.25, t0, 0.1);
        if (t0 > v.nextPhrase) {
          v.phraseEnd = t0 + 1.2 + v.rnd() * 2.6;
          v.nextPhrase = v.phraseEnd + 2 + v.rnd() * 6;
        }
        const talk = t0 < v.phraseEnd;
        f1.frequency.setTargetAtTime(350 + v.rnd() * 550, t0, 0.05);
        f2.frequency.setTargetAtTime(1100 + v.rnd() * 1500, t0, 0.05);
        g1.gain.setTargetAtTime(talk ? 2.4 * v.rnd() : 0, t0, 0.04);
        g2.gain.setTargetAtTime(talk ? 1.6 * v.rnd() : 0, t0, 0.04);
      };
    },
  },
  alarm: {
    gain: 0.55,
    wet: 0.6,
    make(a, v, now) {
      const o = a.osc(v, 'triangle', 700);
      const g = a.gain(v, 0);
      o.connect(g);
      g.connect(v.in);
      const fa = 620 + ((v.rnd() * 5) | 0) * 40;
      const fb = fa * 1.26;
      v.next = now + v.rnd() * 1.2;
      v.k = 0;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          o.frequency.setValueAtTime(v.k++ % 2 ? fb : fa, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.03);
          g.gain.setValueAtTime(0.5, t + 0.3);
          g.gain.linearRampToValueAtTime(0, t + 0.36);
          v.next = t + 1.2;
        }
      };
    },
  },
  water: {
    gain: 1.7,
    wet: 0.45,
    make(a, v, now) {
      const n = a.noise(v, a.buf.pink, 1);
      const mix = a.gain(v, 0.9);
      mix.connect(v.in);
      for (let k = 0; k < 3; k++) {
        const bp = a.filt(v, 'bandpass', 500 + k * 700 + v.rnd() * 300, 5);
        const g = a.gain(v, 0.6);
        n.connect(bp);
        bp.connect(g);
        g.connect(mix);
        const lfo = a.osc(v, 'sine', 2.1 + k * 1.7 + v.rnd());
        const lg = a.gain(v, 250 + k * 150);
        lfo.connect(lg);
        lg.connect(bp.frequency);
        const lfo2 = a.osc(v, 'sine', 1.3 + v.rnd() * 2);
        const lg2 = a.gain(v, 0.35);
        lfo2.connect(lg2);
        lg2.connect(g.gain);
      }
      v.next = now + v.rnd();
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          const hz = 300 + v.rnd() * 500;
          toneAt(a, v.in, t, 'sine', hz, 0.1, 0.004, 0.08, hz * 2.2);
          v.next = t + 0.15 + v.rnd() * 0.7;
        }
      };
    },
  },
  wind: {
    gain: 1.35,
    wet: 0.5,
    make(a, v) {
      const n = a.noise(v, a.buf.white, 1);
      const bp = a.filt(v, 'bandpass', 700 + v.rnd() * 700, 22);
      const g = a.gain(v, 1.8);
      n.connect(bp);
      bp.connect(g);
      g.connect(v.in);
      const lfo = a.osc(v, 'sine', 0.06 + v.rnd() * 0.05);
      const lg = a.gain(v, 180);
      lfo.connect(lg);
      lg.connect(bp.frequency);
      const br = a.osc(v, 'sine', 0.11 + v.rnd() * 0.08);
      const bg = a.gain(v, 0.9);
      br.connect(bg);
      bg.connect(g.gain);
    },
  },
  chime: {
    gain: 0.8,
    wet: 0.9,
    make(a, v, now) {
      v.next = now + 1 + v.rnd() * 4;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          let t = Math.max(v.next, t0);
          const cnt = 1 + ((v.rnd() * 4) | 0);
          for (let k = 0; k < cnt; k++) {
            const deg = (v.rnd() * 10) | 0;
            bellAt(a, v.in, t, mtof(79 + PENTA[deg % 5] + 12 * ((deg / 5) | 0)), 2.2, 0.18 + v.rnd() * 0.15);
            t += 0.07 + v.rnd() * 0.35;
          }
          v.next = t + 3 + v.rnd() * 9;
        }
      };
    },
  },
  tick: {
    gain: 0.23,
    wet: 0.3,
    make(a, v, now) {
      v.next = Math.ceil(now) + v.rnd();
      v.k = 0;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          const t = Math.max(v.next, t0);
          const hi = (v.k++ & 1) === 0;
          clickAt(a, v.in, t, hi ? 2300 : 1800, 3, 0.9, 0.006);
          toneAt(a, v.in, t, 'sine', hi ? 1400 : 1000, 0.4, 0.001, 0.02);
          v.next += 1;
        }
      };
    },
  },
  arcade: {
    gain: 0.6,
    wet: 0.35,
    make(a, v, now) {
      const bp = a.filt(v, 'bandpass', 1800, 0.6);
      const g = a.gain(v, 2);
      bp.connect(g);
      g.connect(v.in);
      const sq = (t, hz, dur, amp) => toneAt(a, bp, t, 'square', hz, amp, 0.002, dur);
      v.next = now + v.rnd() * 3;
      v.tick = (t0) => {
        while (v.next < t0 + LOOK) {
          let t = Math.max(v.next, t0);
          const r = v.rnd();
          if (r < 0.45) {
            const root = 330 * Math.pow(2, ((v.rnd() * 5) | 0) / 12);
            const steps = 6 + ((v.rnd() * 6) | 0);
            const up = v.rnd() < 0.5;
            for (let k = 0; k < steps; k++) {
              const sc = PENTA[(up ? k : steps - k) % 5] + 12 * (((up ? k : steps - k) / 5) | 0);
              sq(t + k * 0.075, root * Math.pow(2, sc / 12), 0.06, 0.2);
            }
            t += steps * 0.075;
          } else if (r < 0.7) {
            sq(t, 988, 0.08, 0.2);
            sq(t + 0.09, 1319, 0.22, 0.2);
            t += 0.3;
          } else if (r < 0.88) {
            toneAt(a, bp, t, 'square', 1800, 0.2, 0.002, 0.25, 200);
            t += 0.3;
          } else {
            noiseAt(a, bp, t, {
              buf: a.buf.white, type: 'lowpass', hz: 1500, hz2: 120, q: 0.7, amp: 0.8, att: 0.005, dec: 0.5,
            });
            t += 0.5;
          }
          v.next = t + 2.5 + v.rnd() * 6;
        }
      };
    },
  },
};
export const EMITTER_KINDS = Object.keys(KINDS);

// Note: smaller side of the tube section nearest to p within a cell plan; 0 when the cell has no tube.
function tubeSizeAt(plan, p) {
  let best = Infinity;
  let size = 0;
  const scan = (path, W, H) => {
    if (!path || !W || !H) return;
    for (let i = 0; i < path.n; i++) {
      const dx = p[0] - path.P[i * 3];
      const dy = p[1] - path.P[i * 3 + 1];
      const dz = p[2] - path.P[i * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        size = Math.min(W[i], H[i]);
      }
    }
  };
  if (plan.through) scan(plan.through.path, plan.through.W, plan.through.H);
  if (plan.stubs) for (const st of plan.stubs) scan(st.path, st.W, st.H);
  return size;
}

function inBox(room, p, m) {
  return Math.abs(p[0] - room.c[0]) < room.h[0] + m && Math.abs(p[1] - room.c[1]) < room.h[1] + m && Math.abs(p[2] - room.c[2]) < room.h[2] + m;
}

class Engine {
  constructor(opts) {
    this.opts = opts || {};
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.paused = false;
    this.offline = false;
    this.dead = false;
    this.errors = 0;
    this.burst = 0;
    this.lastErr = 0;
    this.world = null;
    this.rnd = mulberry32(0x51f15e);
    this.voices = [];
    this.byKey = new Map();
    this.nVoices = 0;
    this.live = 0;
    this.liveMax = 0;
    this.stamp = 0;
    this.cache = new WeakMap();
    this.pool = [];
    this.poolN = 0;
    this.emC = [];
    this.lgC = [];
    this.space = { kind: '', size: 0 };
    this.here = null;
    this.dist = 0;
    this.drone = null;
    this.air = null;
    this.tRefresh = 9;
    this.tBed = 9;
    this.tSpace = 9;
    this.tAmb = 7;
    this.mel = {
      t: 16, active: false, queue: [], qi: 0, end: 0, pad: null,
    };
    this.lastBump = -99;
    this.jukeLevel = 0;
    this.unlock = null;
  }

  // Note: node factories; a voice owner collects what it creates so it can tear it all down later.
  gain(v, x = 1) {
    const n = this.ctx.createGain();
    n.gain.value = x;
    if (v) v.nodes.push(n);
    return n;
  }

  filt(v, type, hz, q = 0.7) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = hz;
    n.Q.value = q;
    if (v) v.nodes.push(n);
    return n;
  }

  osc(v, type, hz, wave = null) {
    const n = this.ctx.createOscillator();
    if (wave) n.setPeriodicWave(wave);
    else n.type = type;
    n.frequency.value = hz;
    n.start(this.ctx.currentTime);
    if (v) v.srcs.push(n);
    return n;
  }

  noise(v, buf, rate = 1) {
    const n = this.ctx.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    n.playbackRate.value = rate;
    n.start(this.ctx.currentTime, this.noiseOffset(buf, 0));
    if (v) v.srcs.push(n);
    return n;
  }

  noiseOffset(buf, len) {
    return this.rnd() * Math.max(0, buf.duration - len - 0.05);
  }

  panner(x, y, z) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    setPos(p, x, y, z);
    return p;
  }

  // Note: counts a one-shot until its last source ends, then disconnects everything it made.
  clean(srcs, nodes) {
    const list = Array.isArray(srcs) ? srcs : [srcs];
    this.live++;
    if (this.live > this.liveMax) this.liveMax = this.live;
    list[list.length - 1].onended = () => {
      this.live--;
      for (let i = 0; i < list.length; i++) list[i].disconnect();
      for (let i = 0; i < nodes.length; i++) nodes[i].disconnect();
    };
  }

  // Note: fires fn once the audio clock passes t; a silent oscillator keeps the timer on the audio thread.
  after(t, fn) {
    const o = this.ctx.createOscillator();
    o.frequency.value = 1;
    o.connect(this.sink);
    o.onended = () => {
      o.disconnect();
      fn();
    };
    const now = this.ctx.currentTime;
    o.start(now);
    o.stop(Math.max(t, now + 0.02));
  }

  makeContext() {
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return null;
    return new AC({ latencyHint: 'interactive' });
  }

  start() {
    if (this.dead) return;
    try {
      if (!this.ctx) {
        const ctx = this.opts.context || this.makeContext();
        if (!ctx) return;
        this.ctx = ctx;
        this.offline = typeof ctx.startRendering === 'function';
        this.buildGraph();
        this.ready = true;
        this.resetWorldState();
      }
      this.paused = false;
      this.resume();
    } catch (e) {
      this.fail(e);
    }
  }

  // Note: a burst of errors within two seconds switches the engine off; stray ones are only counted.
  fail(e) {
    this.errors++;
    const t = Date.now();
    this.burst = t - this.lastErr < 2000 ? this.burst + 1 : 1;
    this.lastErr = t;
    if (this.errors === 1 && typeof console !== 'undefined') console.warn('Scavenger audio:', e);
    if (this.burst > 8) this.dead = true;
  }

  buildGraph() {
    const ctx = this.ctx;
    this.buf = {
      white: makeNoise(ctx, 2, 'white', 11),
      pink: makeNoise(ctx, 6, 'pink', 22),
      brown: makeNoise(ctx, 6, 'brown', 33),
    };
    this.waves = FLAVOR.map((fl) => harmonicWave(ctx, fl.harm));
    this.humWave = harmonicWave(ctx, [0.45, 1, 0.45, 0.35, 0.2, 0.1]);
    // Note: the mix trim lifts the calibrated levels; the master stays at 0.7 before the limiter.
    this.mix = this.gain(null, 1.33);
    this.master = this.gain(null, 0.7);
    const comp = ctx.createDynamicsCompressor();
    // Note: the compressor only catches pile-ups; Chrome adds make-up gain, so the threshold stays high.
    comp.threshold.value = -4;
    comp.knee.value = 3;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const soft = ctx.createWaveShaper();
    soft.curve = SOFT_CURVE;
    this.muteG = this.gain(null, this.muted ? 0 : 1);
    this.mix.connect(this.master);
    this.master.connect(comp);
    comp.connect(soft);
    soft.connect(this.muteG);
    this.muteG.connect(ctx.destination);
    this.sink = this.gain(null, 0);
    this.sink.connect(this.mix);
    this.bus = { dry: this.gain(null, 1), send: this.gain(null, 1), ping: this.gain(null, 1) };
    this.bus.dry.connect(this.mix);
    this.gTube = this.gain(null, 1);
    this.gRoom = this.gain(null, 0);
    this.gHall = this.gain(null, 0);
    this.verbOut = this.gain(null, 0.55);
    const conv = (spec, seed, input) => {
      const c = ctx.createConvolver();
      c.buffer = makeIR(ctx, spec, seed);
      input.connect(c);
      c.connect(this.verbOut);
      return c;
    };
    this.bus.send.connect(this.gTube);
    this.bus.send.connect(this.gRoom);
    this.bus.send.connect(this.gHall);
    conv(IR_SPEC.tube, 101, this.gTube);
    conv(IR_SPEC.room, 202, this.gRoom);
    const hall = conv(IR_SPEC.hall, 303, this.gHall);
    this.bus.ping.connect(hall);
    this.verbOut.connect(this.mix);
    // Note: ui buses differ only in their dry and wet balance.
    const uiBus = (dry, wet) => {
      const g = this.gain(null, 1);
      const d = this.gain(null, dry);
      const w = this.gain(null, wet);
      g.connect(d);
      d.connect(this.bus.dry);
      g.connect(w);
      w.connect(this.bus.send);
      return g;
    };
    this.uiA = uiBus(1, 0.3);
    this.uiB = uiBus(0.7, 1);
    this.uiP = this.gain(null, 1);
    const pd = this.gain(null, 0.6);
    this.uiP.connect(pd);
    pd.connect(this.bus.dry);
    this.uiP.connect(this.bus.ping);
    this.padBus = this.gain(null, 0.05);
    const ps = this.gain(null, 0.7);
    this.padBus.connect(this.bus.dry);
    this.padBus.connect(ps);
    ps.connect(this.bus.send);
    this.melBus = this.gain(null, 0.16);
    const ms = this.gain(null, 0.9);
    this.melBus.connect(this.bus.dry);
    this.melBus.connect(ms);
    ms.connect(this.bus.send);
    this.droneBus = this.gain(null, DRONE_LEVEL);
    const ds = this.gain(null, 0.06);
    this.droneBus.connect(this.bus.dry);
    this.droneBus.connect(ds);
    ds.connect(this.bus.send);
    this.makeAir();
    this.mixSpace('tube', 0, ctx.currentTime, 0.01);
  }

  makeAir() {
    const A = {};
    A.src = this.noise(null, this.buf.pink, 1);
    A.hp = this.filt(null, 'highpass', 70, 0.7);
    A.lp = this.filt(null, 'lowpass', 400, 0.7);
    A.g = this.gain(null, 0.02);
    A.src.connect(A.hp);
    A.hp.connect(A.lp);
    A.lp.connect(A.g);
    A.g.connect(this.bus.dry);
    const as = this.gain(null, 0.15);
    A.g.connect(as);
    as.connect(this.bus.send);
    A.lfo = this.osc(null, 'sine', 3);
    A.lg = this.gain(null, 0);
    A.lfo.connect(A.lg);
    A.lg.connect(A.g.gain);
    const ws = this.noise(null, this.buf.white, 1);
    A.wb = this.filt(null, 'bandpass', 600, 14);
    A.wg = this.gain(null, 0);
    ws.connect(A.wb);
    A.wb.connect(A.wg);
    A.wg.connect(this.bus.dry);
    const ss = this.noise(null, this.buf.white, 1);
    A.sb = this.filt(null, 'bandpass', 2200, 0.8);
    A.sg = this.gain(null, 0);
    ss.connect(A.sb);
    A.sb.connect(A.sg);
    A.sg.connect(this.bus.dry);
    this.air = A;
  }

  // Note: wet gains pick the convolver by space; small rooms lean on the room IR, big ones on the hall.
  mixSpace(kind, size, now, tc = 0.35) {
    let wt = 0;
    let wr = 0;
    let wh = 0;
    let lvl;
    if (kind === 'tube') {
      // Note: wide tubes such as galleries and wells ring like halls.
      wh = smoothstep(8, 20, size);
      wt = 1 - wh;
      lvl = 0.6 + 0.2 * wh;
    } else {
      wh = smoothstep(9, 20, size);
      wr = 1 - wh;
      lvl = 0.5 + 0.2 * wh;
    }
    fadeTo(this.gTube.gain, wt, now, tc);
    fadeTo(this.gRoom.gain, wr, now, tc);
    fadeTo(this.gHall.gain, wh, now, tc);
    fadeTo(this.verbOut.gain, lvl, now, tc);
    this.space.kind = kind;
    this.space.size = size;
  }

  resetWorldState() {
    const w = this.world;
    const seed = w && typeof w.seed === 'number' ? w.seed : hashStr(String((w && w.seedStr) || 'tunnel'));
    this.rnd = mulberry32((seed ^ 0xa0d10) >>> 0);
    this.cache = new WeakMap();
    for (let i = this.voices.length - 1; i >= 0; i--) this.retire(this.voices[i], this.ctx.currentTime);
    this.tAmb = 6 + this.rnd() * 4;
    this.mel.t = 14 + this.rnd() * 12;
    this.here = null;
  }

  setWorld(world) {
    this.world = world || null;
    if (!this.ctx) return;
    try {
      this.resetWorldState();
    } catch (e) {
      this.fail(e);
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (!this.ctx || !this.muteG) return;
    try {
      fadeTo(this.muteG.gain, this.muted ? 0 : 1, this.ctx.currentTime, 0.04);
    } catch (e) {
      this.fail(e);
    }
  }

  suspend() {
    this.paused = true;
    const ctx = this.ctx;
    if (!ctx || this.offline) return;
    try {
      if (ctx.state === 'running') {
        // Note: a resume() that raced the suspend still has to win.
        ctx.suspend().then(() => {
          if (!this.paused) this.resume();
        }, () => {});
      }
    } catch (e) {
      this.fail(e);
    }
  }

  resume() {
    const ctx = this.ctx;
    if (!ctx || this.offline) return;
    this.paused = false;
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
        this.armUnlock();
      }
    } catch (e) {
      this.fail(e);
    }
  }

  // Note: if autoplay rules keep the context suspended, the first key or tap resumes it.
  armUnlock() {
    if (this.unlock || typeof window === 'undefined') return;
    const names = ['pointerdown', 'keydown', 'touchstart'];
    const fn = () => {
      const ctx = this.ctx;
      if (ctx && ctx.state === 'suspended' && !this.paused) ctx.resume().catch(() => {});
      else if (ctx && ctx.state === 'running') {
        for (const n of names) window.removeEventListener(n, fn);
        this.unlock = null;
      }
    };
    this.unlock = fn;
    for (const n of names) window.addEventListener(n, fn, { passive: true });
  }

  // Note: the per-frame entry; real work is throttled inside step().
  update(dt, s) {
    if (!this.ready || this.dead || !s || s.playing === false) return;
    if (!this.offline && this.ctx.state !== 'running') return;
    try {
      this.step(clamp(dt, 0, 0.25), s);
    } catch (e) {
      this.fail(e);
    }
  }

  step(dt, s) {
    const now = this.ctx.currentTime;
    this.dist = wrap(s.district | 0, DISTRICTS.length);
    const here = finite3(s.pos);
    this.listen(s);
    this.tSpace += dt;
    if (here && this.tSpace >= REFRESH) {
      this.tSpace = 0;
      this.locate(s, now);
    }
    this.tBed += dt;
    if (this.tBed >= BED_STEP) {
      this.tBed = 0;
      this.beds(s, now);
    }
    this.tRefresh += dt;
    if (here && this.tRefresh >= REFRESH) {
      this.tRefresh = 0;
      this.refresh(s, now);
    }
    const list = this.voices;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.tick) v.tick(now);
    }
    this.ambient(s, now, dt);
    this.melody(s, now, dt);
  }

  listen(s) {
    const l = this.ctx.listener;
    const p = s.pos;
    if (!p || !Number.isFinite(p[0] + p[1] + p[2])) return;
    if (l.positionX) {
      l.positionX.value = p[0];
      l.positionY.value = p[1];
      l.positionZ.value = p[2];
    } else if (l.setPosition) l.setPosition(p[0], p[1], p[2]);
    const f = s.forward;
    const u = s.up;
    if (!f || !u || !Number.isFinite(f[0] + f[1] + f[2] + u[0] + u[1] + u[2])) return;
    if (Math.abs(f[0]) + Math.abs(f[1]) + Math.abs(f[2]) < 1e-4 || Math.abs(u[0]) + Math.abs(u[1]) + Math.abs(u[2]) < 1e-4) return;
    if (l.forwardX) {
      l.forwardX.value = f[0];
      l.forwardY.value = f[1];
      l.forwardZ.value = f[2];
      l.upX.value = u[0];
      l.upY.value = u[1];
      l.upZ.value = u[2];
    } else if (l.setOrientation) l.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
  }

  planAt(i, j, k) {
    try {
      return this.world.cell(i, j, k) || null;
    } catch (e) {
      return null;
    }
  }

  // Note: rooms get a wet reverb sized by their volume; everything else is the metallic tube.
  locate(s, now) {
    const p = s.pos;
    if (!this.world || typeof this.world.cell !== 'function' || !p) return;
    const plan = this.planAt(Math.floor(p[0] / CELL_ARR[0]), Math.floor(p[1] / CELL_ARR[1]), Math.floor(p[2] / CELL_ARR[2]));
    this.here = plan;
    const room = plan && plan.room;
    let kind = 'tube';
    let size = 0;
    if (room && room.c && room.h && inBox(room, p, 0.4)) {
      kind = 'room';
      size = Math.cbrt(room.h[0] * room.h[1] * room.h[2]);
    } else if (plan) size = tubeSizeAt(plan, p);
    if (kind !== this.space.kind || Math.abs(size - this.space.size) > 0.8) this.mixSpace(kind, size, now);
  }

  makeDrone(d, now) {
    const ctx = this.ctx;
    const D = DISTRICTS[d] || DISTRICTS[0];
    const fl = FLAVOR[d] || FLAVOR[0];
    const hz = D.hum || 50;
    const slot = {
      d, since: now, out: ctx.createGain(), nodes: [], srcs: [],
    };
    slot.out.gain.value = 0;
    const lp = this.filt(slot, 'lowpass', fl.lp, 0.7);
    const breath = this.gain(slot, 1);
    lp.connect(breath);
    breath.connect(slot.out);
    slot.out.connect(this.droneBus);
    const add = (o, amp) => {
      const g = this.gain(slot, amp);
      o.connect(g);
      g.connect(lp);
    };
    add(this.osc(slot, 'sine', hz, this.waves[d] || this.waves[0]), 0.5);
    add(this.osc(slot, 'sine', hz + fl.beat, this.waves[d] || this.waves[0]), 0.4);
    if (fl.third > 0) add(this.osc(slot, 'sine', hz * 1.1892), fl.third);
    add(this.osc(slot, 'sine', hz / 2), fl.sub * 0.5);
    const n = this.noise(slot, this.buf.brown, 1);
    const nb = this.filt(slot, 'bandpass', fl.noise, fl.nq);
    const ng = this.gain(slot, fl.na);
    n.connect(nb);
    nb.connect(ng);
    ng.connect(lp);
    const lfo = this.osc(slot, 'sine', fl.lfo);
    const lg = this.gain(slot, 0.18);
    lfo.connect(lg);
    lg.connect(breath.gain);
    const lfo2 = this.osc(slot, 'sine', fl.lfo * 1.7);
    const lg2 = this.gain(slot, fl.lp * 0.22);
    lfo2.connect(lg2);
    lg2.connect(lp.frequency);
    fadeTo(slot.out.gain, 1, now, 1.2);
    return slot;
  }

  killSlot(slot, now, tc) {
    fadeTo(slot.out.gain, 0, now, tc);
    const t = now + tc * 6 + 0.1;
    for (let i = 0; i < slot.srcs.length; i++) slot.srcs[i].stop(t);
    slot.srcs[0].onended = () => {
      for (let i = 0; i < slot.srcs.length; i++) slot.srcs[i].disconnect();
      for (let i = 0; i < slot.nodes.length; i++) slot.nodes[i].disconnect();
      slot.out.disconnect();
    };
  }

  // Note: drone follows the district; air and rib-passing flutter follow the speed.
  beds(s, now) {
    const d = this.dist;
    if (!this.drone || (this.drone.d !== d && now - this.drone.since > 1.5)) {
      if (this.drone) this.killSlot(this.drone, now, 0.9);
      this.drone = this.makeDrone(d, now);
    }
    const A = this.air;
    const sp = clamp(s.speed || 0, 0, 60);
    const k = clamp(sp / 30, 0, 1);
    const tgt = 0.016 + 0.31 * Math.pow(k, 1.25);
    const tube = this.space.kind === 'tube' ? 1 : 0.25;
    A.g.gain.setTargetAtTime(tgt, now, 0.18);
    A.lp.frequency.setTargetAtTime(380 + 2900 * k, now, 0.2);
    A.src.playbackRate.setTargetAtTime(0.86 + 0.34 * k, now, 0.3);
    A.lfo.frequency.setTargetAtTime(clamp(sp / 4.2, 0.2, 18), now, 0.2);
    A.lg.gain.setTargetAtTime(tgt * 0.22 * tube * smoothstep(2, 8, sp), now, 0.2);
    A.wb.frequency.setTargetAtTime(520 + 38 * sp, now, 0.2);
    A.wg.gain.setTargetAtTime(0.05 * smoothstep(12, 30, sp), now, 0.25);
    const clear = s.clear;
    const near = clear > 0 ? smoothstep(1.8, 0.35, clear) : clear <= 0 ? 1 : 0;
    A.sg.gain.setTargetAtTime(0.1 * near * smoothstep(2, 9, sp), now, 0.1);
  }

  planInfo(plan) {
    let c = this.cache.get(plan);
    if (c) return c;
    c = { em: [], fl: [] };
    const em = plan.emitters;
    if (em) {
      for (let n = 0; n < em.length; n++) {
        if (em[n] && finite3(em[n].p)) c.em.push({ e: em[n], key: `${plan.key}#${n}` });
      }
    }
    const lights = plan.lights;
    if (lights) {
      for (let n = 0; n < lights.length; n++) {
        const l = lights[n];
        if (l && l.state === 'flicker' && finite3(l.p)) {
          c.fl.push({
            e: {
              p: l.p, kind: 'buzz', r: BUZZ_R, i: 0.4, seed: hashStr(`${plan.key}!${n}`),
            },
            key: `${plan.key}!${n}`,
          });
        }
      }
    }
    this.cache.set(plan, c);
    return c;
  }

  // Note: scores every emitter near the listener, keeps the loudest few and recycles voices.
  refresh(s, now) {
    const p = s.pos;
    const world = this.world;
    if (!world || typeof world.cell !== 'function' || !p) return;
    const ci = Math.floor(p[0] / CELL_ARR[0]);
    const cj = Math.floor(p[1] / CELL_ARR[1]);
    const ck = Math.floor(p[2] / CELL_ARR[2]);
    const here = this.planAt(ci, cj, ck);
    this.here = here;
    this.emC.length = 0;
    this.lgC.length = 0;
    this.poolN = 0;
    this.gather(here, here, p);
    if (here) {
      for (let f = 0; f < 6; f++) {
        if (here.edges && !here.edges[f]) continue;
        const d = FACE_DIR[f];
        this.gather(this.planAt(ci + d[0], cj + d[1], ck + d[2]), here, p);
      }
    }
    this.emC.sort(byScore);
    this.lgC.sort(byScore);
    this.stamp++;
    this.jukeLevel = 0;
    const lRoom = this.space.kind === 'room';
    const pick = (list, max) => {
      const n = Math.min(max, list.length);
      for (let i = 0; i < n; i++) {
        const c = list[i];
        if (c.gain < 0.002) break;
        let v = this.byKey.get(c.ent.key);
        if (!v) {
          if (this.nVoices >= MAX_VOICES + 8) continue;
          v = this.spawn(c.ent, now);
          if (!v) continue;
        }
        v.stamp = this.stamp;
        this.tune(v, c, lRoom, now);
      }
    };
    pick(this.emC, MAX_EMITTERS);
    pick(this.lgC, MAX_BUZZ);
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i].stamp !== this.stamp) this.retire(this.voices[i], now);
    }
  }

  gather(plan, here, p) {
    if (!plan) return;
    const info = this.planInfo(plan);
    const same = plan === here;
    for (let i = 0; i < info.em.length; i++) this.rate(info.em[i], plan, same, p, this.emC, DEFAULT_R);
    for (let i = 0; i < info.fl.length; i++) this.rate(info.fl[i], plan, same, p, this.lgC, BUZZ_R);
  }

  rate(ent, plan, same, p, list, defR) {
    if (ent.bad) return;
    const e = ent.e;
    const ep = e.p;
    const dx = ep[0] - p[0];
    const dy = ep[1] - p[1];
    const dz = ep[2] - p[2];
    const r = e.r > 0 ? e.r : defR;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    const k = 1 - d / r;
    const kind = KINDS[e.kind] || KINDS.hum;
    const gain = (kind.gain * (e.i > 0 ? e.i : 0.6) * k * k) / (1 + 0.1 * d);
    const c = this.pool[this.poolN] || (this.pool[this.poolN] = {});
    this.poolN++;
    c.ent = ent;
    c.plan = plan;
    c.same = same;
    c.d = d;
    c.gain = gain;
    c.score = gain * (this.byKey.has(ent.key) ? 1.25 : 1);
    list.push(c);
  }

  spawn(ent, now) {
    const e = ent.e;
    const name = KINDS[e.kind] ? e.kind : 'hum';
    const kind = KINDS[name];
    const ctx = this.ctx;
    const v = {
      key: ent.key,
      kind,
      name,
      e,
      rnd: mulberry32(((e.seed || 0) ^ hashStr(ent.key)) >>> 0),
      nodes: [],
      srcs: [],
      tick: null,
      stamp: 0,
      dying: false,
      idx: this.voices.length,
      in: ctx.createGain(),
      lp: ctx.createBiquadFilter(),
      pan: this.panner(e.p[0], e.p[1], e.p[2]),
      out: ctx.createGain(),
      send: ctx.createGain(),
    };
    v.lp.type = 'lowpass';
    v.lp.frequency.value = 12000;
    v.lp.Q.value = 0.5;
    v.out.gain.value = 0;
    v.send.gain.value = kind.wet;
    v.in.connect(v.lp);
    v.lp.connect(v.pan);
    v.pan.connect(v.out);
    v.out.connect(this.bus.dry);
    v.out.connect(v.send);
    v.send.connect(this.bus.send);
    this.voices.push(v);
    this.byKey.set(v.key, v);
    this.nVoices++;
    try {
      kind.make(this, v, now);
    } catch (err) {
      // Note: a voice that fails to build is torn down and never retried.
      ent.bad = true;
      this.retire(v, now);
      this.fail(err);
      return null;
    }
    return v;
  }

  // Note: occlusion is a cheap guess; other cells and room-versus-tunnel pairs sound muffled.
  tune(v, c, lRoom, now) {
    let occl = 0.85;
    if (c.same) {
      const room = c.plan.room;
      const eRoom = !!(room && room.c && room.h && inBox(room, v.e.p, 0.5));
      occl = eRoom === lRoom ? 0 : 0.5;
    }
    const lp = clamp((16000 / (1 + 0.07 * c.d)) * (1 - 0.82 * occl), 450, 16000);
    const gain = c.gain * (1 - 0.35 * occl);
    v.out.gain.setTargetAtTime(gain, now, 0.15);
    v.lp.frequency.setTargetAtTime(lp, now, 0.2);
    v.send.gain.setTargetAtTime(Math.min(1.4, v.kind.wet * (1 + 0.04 * c.d)), now, 0.3);
    if (v.name === 'jukebox' && gain > this.jukeLevel) this.jukeLevel = gain;
  }

  retire(v, now) {
    if (v.dying) return;
    v.dying = true;
    const i = v.idx;
    const last = this.voices.pop();
    if (last !== v) {
      this.voices[i] = last;
      last.idx = i;
    }
    this.byKey.delete(v.key);
    fadeTo(v.out.gain, 0, now, 0.07);
    const t = now + 0.5;
    for (let k = 0; k < v.srcs.length; k++) v.srcs[k].stop(t);
    this.after(t + 0.05, () => this.freeVoice(v));
  }

  freeVoice(v) {
    for (let k = 0; k < v.srcs.length; k++) v.srcs[k].disconnect();
    for (let k = 0; k < v.nodes.length; k++) v.nodes[k].disconnect();
    v.in.disconnect();
    v.lp.disconnect();
    v.pan.disconnect();
    v.out.disconnect();
    v.send.disconnect();
    this.nVoices--;
  }

  // Note: a spatial one-shot is an input node feeding a lowpass, a panner and a distance gain.
  spatial(x, y, z, gain, wet, lp) {
    const inp = this.gain(null, 1);
    const f = this.filt(null, 'lowpass', clamp(lp, 500, 16000), 0.6);
    const pan = this.panner(x, y, z);
    const out = this.gain(null, gain);
    const send = this.gain(null, wet);
    inp.connect(f);
    f.connect(pan);
    pan.connect(out);
    out.connect(this.bus.dry);
    out.connect(send);
    send.connect(this.bus.send);
    this.nVoices++;
    const sp = { in: inp, dead: false };
    sp.dispose = () => {
      if (sp.dead) return;
      sp.dead = true;
      this.nVoices--;
      inp.disconnect();
      f.disconnect();
      pan.disconnect();
      out.disconnect();
      send.disconnect();
    };
    return sp;
  }

  spatialEvent(name, pos, now, dist) {
    const r = this.rnd;
    const ang = r() * TAU;
    const x = pos[0] + Math.cos(ang) * dist;
    const y = pos[1] + (r() - 0.5) * 6;
    const z = pos[2] + Math.sin(ang) * dist;
    const sp = this.spatial(x, y, z, (0.9 * EVENT_GAIN[name]) / (1 + dist * 0.1), 0.5 + dist / 60, 4200 - dist * 70);
    const t = now + 0.05;
    const dur = EVENTS[name](this, sp.in, t, r);
    this.after(t + dur + 0.4, sp.dispose);
  }

  // Note: darker districts get more creaks, groans and rattles, and the gaps between them shrink.
  ambient(s, now, dt) {
    this.tAmb -= dt;
    if (this.tAmb > 0) return;
    const decay = clamp(DISTRICTS[this.dist].fail / 0.55, 0, 1);
    const r = this.rnd;
    this.tAmb = (16 - 11 * decay) * (0.5 + r());
    if (this.nVoices >= MAX_VOICES || !finite3(s.pos)) return;
    const w = [3, 2, 1.4, 1.5, 1.2 + 2 * decay, 0.2 + 2.2 * decay];
    let tot = 0;
    for (let i = 0; i < w.length; i++) tot += w[i];
    let x = r() * tot;
    let pick = 0;
    for (let i = 0; i < w.length; i++) {
      x -= w[i];
      if (x <= 0) {
        pick = i;
        break;
      }
    }
    this.spatialEvent(EVENT_NAMES[pick], s.pos, now, 6 + r() * 26);
  }

  // Note: a sparse phrase of soft bells over a slow pad, only while the ship is calm.
  melody(s, now, dt) {
    const M = this.mel;
    const calm = (s.speed || 0) < 14 && now - this.lastBump > 8;
    if (!M.active) {
      M.t -= dt;
      if (M.t <= 0 && calm && this.jukeLevel < 0.05) this.startPhrase(s, now);
      return;
    }
    if (!calm || this.jukeLevel > 0.12) {
      this.abortPhrase(now);
      return;
    }
    while (M.qi < M.queue.length && M.queue[M.qi].t < now + 0.5) {
      const q = M.queue[M.qi++];
      fmBellAt(this, this.melBus, Math.max(q.t, now), mtof(q.midi), 3.6, 0.5 * q.v);
    }
    if (now > M.end) {
      M.active = false;
      M.pad = null;
      M.t = 25 + this.rnd() * 35;
    }
  }

  startPhrase(s, now) {
    const M = this.mel;
    const r = this.rnd;
    const root = ROOTS[this.dist % ROOTS.length];
    const mode = r() < 0.5 ? MODES[0] : MODES[3];
    const count = 5 + ((r() * 4) | 0);
    let deg = (r() * 3) | 0;
    let t = now + 0.5;
    M.queue.length = 0;
    M.qi = 0;
    for (let k = 0; k < count; k++) {
      deg = clamp(deg + STEPS[(r() * STEPS.length) | 0], 0, 9);
      if (k === count - 1) deg = deg > 4 ? 7 : 0;
      M.queue.push({ t, midi: root + 24 + mode[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7), v: 0.7 + r() * 0.3 });
      t += 1.1 + r() * 1.7;
    }
    const dur = t - now + 2;
    M.pad = this.padAt(now + 0.2, dur, [root, root + 7, root + 12 + mode[1]]);
    M.active = true;
    M.end = now + dur + 1;
  }

  abortPhrase(now) {
    const M = this.mel;
    if (M.pad) {
      fadeTo(M.pad.env.gain, 0, now, 0.6);
      for (let i = 0; i < M.pad.srcs.length; i++) M.pad.srcs[i].stop(now + 3.5);
    }
    M.queue.length = 0;
    M.qi = 0;
    M.pad = null;
    M.active = false;
    M.t = 20 + this.rnd() * 20;
  }

  padAt(t, dur, midis) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(300, t + dur + 5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(FLOOR, t);
    env.gain.linearRampToValueAtTime(1, t + 4);
    env.gain.setValueAtTime(1, t + dur);
    env.gain.exponentialRampToValueAtTime(FLOOR, t + dur + 5);
    lp.connect(env);
    env.connect(this.padBus);
    const srcs = [];
    const nodes = [lp, env];
    for (let i = 0; i < midis.length; i++) {
      for (let k = 0; k < 2; k++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(midis[i]);
        o.detune.value = k ? 6 : -7;
        const g = ctx.createGain();
        g.gain.value = 0.12;
        o.connect(g);
        g.connect(lp);
        o.start(t);
        o.stop(t + dur + 5.2);
        srcs.push(o);
        nodes.push(g);
      }
    }
    this.clean(srcs, nodes);
    return { env, srcs };
  }

  // Note: one-shot cues share a guard; they drop out when the context is not running.
  cue() {
    return this.ready && !this.dead && (this.offline || this.ctx.state === 'running') ? this.ctx.currentTime + 0.005 : -1;
  }

  bump(impact) {
    try {
      const t = this.cue();
      if (t < 0 || t - this.lastBump < 0.08) return;
      this.lastBump = t;
      const k = clamp((impact || 4) / 9, 0.12, 1) * CUE.bump;
      toneAt(this, this.uiA, t, 'sine', 95, 0.9 * k, 0.003, 0.28, 38);
      noiseAt(this, this.uiA, t, {
        buf: this.buf.white, type: 'lowpass', hz: 700, q: 0.7, amp: 0.7 * k, att: 0.002, dec: 0.12,
      });
      if (impact > 4) {
        for (let m = 0; m < KNOCK.length; m++) toneAt(this, this.uiB, t, 'sine', 180 * KNOCK[m][0], 0.25 * k * KNOCK[m][1], 0.001, KNOCK[m][2] * 2);
      }
    } catch (e) {
      this.fail(e);
    }
  }

  click() {
    try {
      const t = this.cue();
      if (t < 0) return;
      const k = CUE.click;
      clickAt(this, this.uiA, t, 2600, 3, 0.9 * k, 0.008);
      clickAt(this, this.uiA, t + 0.045, 1500, 2, 0.6 * k, 0.012);
      toneAt(this, this.uiA, t, 'sine', 3000, 0.08 * k, 0.001, 0.02);
    } catch (e) {
      this.fail(e);
    }
  }

  stick() {
    try {
      const t = this.cue();
      if (t < 0) return;
      const k = CUE.stick;
      clickAt(this, this.uiA, t, 3800, 0.8, 1.2 * k, 0.03);
      toneAt(this, this.uiA, t, 'sine', 1400, 0.4 * k, 0.001, 0.08, 350);
      noiseAt(this, this.uiA, t + 0.03, {
        buf: this.buf.white, type: 'bandpass', hz: 6000, q: 1, amp: 0.3 * k, att: 0.02, dec: 0.45,
      });
    } catch (e) {
      this.fail(e);
    }
  }

  ping() {
    try {
      const t = this.cue();
      if (t < 0) return;
      const k = CUE.ping;
      toneAt(this, this.uiP, t, 'sine', 1480, 0.28 * k, 0.004, 0.9, 1180);
      toneAt(this, this.uiP, t, 'sine', 2220, 0.07 * k, 0.004, 0.5, 1770);
    } catch (e) {
      this.fail(e);
    }
  }

  log() {
    try {
      const t = this.cue();
      if (t < 0) return;
      const k = CUE.log;
      bellAt(this, this.uiB, t, 880, 1.4, 0.16 * k);
      bellAt(this, this.uiB, t + 0.14, 1318.5, 1.8, 0.14 * k);
    } catch (e) {
      this.fail(e);
    }
  }

  // Note: test hook; plays one named ambient event at the given distance in a random direction.
  debugEvent(name, pos, dist = 8) {
    try {
      if (EVENTS[name]) this.spatialEvent(name, pos, this.ctx.currentTime, dist);
    } catch (e) {
      this.fail(e);
    }
  }

  stats() {
    const c = this.ctx;
    return {
      state: c ? c.state : 'none',
      time: c ? c.currentTime : 0,
      ready: this.ready,
      muted: this.muted,
      voices: this.nVoices,
      emitters: this.voices.length,
      live: this.live,
      liveMax: this.liveMax,
      space: this.space.kind,
      drone: this.drone ? this.drone.d : -1,
      melody: this.mel.active,
      errors: this.errors,
      dead: this.dead,
    };
  }
}

export function createAudio(opts = {}) {
  return new Engine(opts);
}

export { EVENT_NAMES };
