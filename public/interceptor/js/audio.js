// Note: procedural WebAudio for Interceptor; no files, everything synthesized.

import { ANCHORS, GUN_KINDS, LOADS, crackSound, engineSet, gunshot, popSound } from './synth.js';

const TAU = Math.PI * 2;
const MAX_VOICES = 24;
// Note: shots ring for a second or more, so they draw on their own voices and never starve hits and clicks.
const MAX_SHOTS = 16;
const LOOK = 0.005;
const MAX_SPEECH = 30;
const ENGINE_LEVEL = 0.45;
const SHOT_LEVEL = 3;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const unit = (v, d = 0) => clamp(num(v, d), 0, 1);
const side = (v) => clamp(num(v, 0), -1, 1);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const chance = (p) => Math.random() < p;
const band = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);
const field = (o, k) => (o && typeof o === 'object' ? o[k] : undefined);
const alpha = (u) => (u <= 0 ? 0 : u * Math.exp(1 - u));
const hump = (x, d) => (x < d ? Math.sin((Math.PI * x) / d) ** 2 : 0);
const lookup = (table, key, fallback) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : fallback);

function beat(x) {
  return alpha(x / 0.032) + 0.6 * alpha((x - 0.3) / 0.04);
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

// Note: the tail is crossfaded into the head so looped noise never clicks at the seam.
function noiseBuffer(ctx, seconds, color) {
  const fade = 2048;
  const n = Math.max(fade * 2, Math.floor(ctx.sampleRate * seconds));
  const x = new Float32Array(n + fade);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let br = 0;
  for (let i = 0; i < x.length; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      x[i] = b0 + b1 + b2 + w * 0.1848;
    } else if (color === 'brown') {
      br = (br + 0.02 * w) / 1.02;
      x[i] = br;
    } else x[i] = w;
  }
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = x[i];
  for (let i = 0; i < fade; i++) {
    const a = (i / fade) * (Math.PI / 2);
    d[i] = x[i] * Math.sin(a) + x[n + i] * Math.cos(a);
  }
  normalize(d, 0.9);
  return buf;
}

function crackleBuffer(ctx, seconds) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let k = 0; k < seconds * 14; k++) {
    const at = Math.floor(Math.random() * n);
    const amp = 0.05 + 0.9 * Math.random() ** 3;
    const len = Math.floor(sr * rand(0.0005, 0.004));
    for (let i = 0; i < len && at + i < n; i++) d[at + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / (len / 4));
  }
  normalize(d, 0.9);
  return buf;
}

function addEcho(d, sr, at, amp) {
  const start = Math.floor(sr * at);
  const len = Math.floor(sr * 0.03);
  let lp = 0;
  for (let i = 0; i < len && start + i < d.length; i++) {
    lp += 0.25 * (Math.random() * 2 - 1 - lp);
    d[start + i] += lp * amp * Math.exp(-i / (len / 4));
  }
}

// Note: open-air impulse response; a dark diffuse decay plus a few slapbacks off the tree line.
function outdoorIR(ctx) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 1.4);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      lp += (0.06 + 0.4 * Math.exp(-t / 0.12)) * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.min(1, t / 0.02) * Math.exp(-t / 0.3);
    }
    for (let k = 0; k < 5; k++) {
      const at = rand(0.08, 0.5) + ch * 0.004;
      addEcho(d, sr, at, rand(0.4, 1) * Math.exp(-at / 0.4));
    }
  }
  return buf;
}

function tanhCurve(drive) {
  const n = 2048;
  const c = new Float32Array(n);
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(drive * ((i / (n - 1)) * 2 - 1)) / k;
  return c;
}

// Note: output safety curve; linear below 0.7, then a soft knee that never exceeds 1.
function clipCurve() {
  const n = 2049;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    c[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.3 * Math.tanh((ax - 0.7) / 0.3));
  }
  return c;
}

// Note: unnormalized periodic wave from one cycle of fn; the mean restores the DC the oscillator drops.
function cycleWave(ctx, fn, harmonics) {
  const n = 1024;
  const s = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    s[i] = fn(i / n);
    mean += s[i];
  }
  mean /= n;
  const cos = new Float32Array(n);
  const sin = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cos[i] = Math.cos((TAU * i) / n);
    sin[i] = Math.sin((TAU * i) / n);
  }
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const j = (k * i) % n;
      re += s[i] * cos[j];
      im += s[i] * sin[j];
    }
    real[k] = (2 * re) / n;
    imag[k] = (2 * im) / n;
  }
  return { wave: ctx.createPeriodicWave(real, imag, { disableNormalization: true }), mean };
}

function makeGain(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function makeFilter(ctx, type, f, q) {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function makeOsc(ctx, type, f) {
  const o = ctx.createOscillator();
  if (typeof type === 'string') o.type = type;
  else o.setPeriodicWave(type);
  o.frequency.value = f;
  return o;
}

function makeLoop(ctx, buf, rate) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}

function makePan(ctx, v) {
  if (!ctx.createStereoPanner) return makeGain(ctx, 1);
  const p = ctx.createStereoPanner();
  p.pan.value = v;
  return p;
}

function makeShaper(ctx, curve) {
  const w = ctx.createWaveShaper();
  w.curve = curve;
  return w;
}

function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

function setPan(p, v, t) {
  if (p.pan) p.pan.setValueAtTime(v, t);
}

// Note: starts a persistent source and keeps it for dispose; loops begin at a random offset to decorrelate.
function live(P, src) {
  if (src.buffer) src.start(0, Math.random() * src.buffer.duration * 0.9);
  else src.start();
  P.srcs.push(src);
  return src;
}

function gate(P, shape, hz) {
  const node = makeGain(P.ctx, shape.mean);
  const osc = live(P, makeOsc(P.ctx, shape.wave, hz));
  osc.connect(node.gain);
  return { node, osc };
}

// Note: ramps a persistent param toward v; unchanged targets are skipped so per-frame calls stay cheap.
function ramp(S, param, v, tc) {
  if (!Number.isFinite(v)) return;
  const prev = S.last.get(param);
  if (prev !== undefined && Math.abs(prev - v) <= 1e-4 * (1 + Math.abs(v))) return;
  S.last.set(param, v);
  if (S.ctx.state !== 'running') {
    // Note: a frozen clock would pile up automation events, so the value is set outright instead.
    param.cancelScheduledValues(0);
    param.value = v;
    return;
  }
  param.setTargetAtTime(v, S.ctx.currentTime, tc);
}

function hold(param, t) {
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

function env(param, t, peak, att, sustain, rel) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  param.setValueAtTime(peak, t + att + sustain);
  param.linearRampToValueAtTime(0, t + att + sustain + rel);
  return t + att + sustain + rel;
}

function points(param, t, pts, expo) {
  param.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    const [at, val] = pts[i];
    if (expo) param.exponentialRampToValueAtTime(Math.max(1, val), t + at);
    else param.linearRampToValueAtTime(val, t + at);
  }
}

function buildMaster(S) {
  const ctx = S.ctx;
  const input = makeGain(ctx, S.master);
  const mute = makeGain(ctx, S.muted ? 0 : 1);
  const comp = ctx.createDynamicsCompressor();
  // Note: gentle glue only; Chrome adds make-up gain, so the threshold stays fairly high.
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.3;
  chain(input, mute, comp, makeShaper(ctx, clipCurve()), ctx.destination);
  return { input, mute };
}

function buildVerb(ctx, dest) {
  const conv = ctx.createConvolver();
  conv.buffer = outdoorIR(ctx);
  chain(conv, makeGain(ctx, 0.5), dest);
  return conv;
}

// Note: phase-locked loops of rendered exhaust pulses feed two pipe resonators, a little saturation and a muffler.
function buildEngine(P, dest) {
  const { ctx } = P;
  const out = makeGain(ctx, 0);
  const stutter = makeGain(ctx, 1);
  const cut = makeGain(ctx, 1);
  const mix = makeGain(ctx, 0.5);
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  mix.connect(split);
  [pipe(ctx, 0.0041, -0.55, 1700), pipe(ctx, 0.0047, -0.5, 1500)].forEach((p, i) => {
    split.connect(p, i);
    p.connect(merge, 0, i);
    // Note: some of each bank reaches the other side, as both pipes end under the same bumper.
    chain(p, makeGain(ctx, 0.35)).connect(merge, 0, 1 - i);
  });
  const body = makeFilter(ctx, 'peaking', 160, 1.1);
  body.gain.value = 3;
  const pre = makeGain(ctx, 1);
  const lp = makeFilter(ctx, 'lowpass', 900, 0.6);
  chain(merge, makeFilter(ctx, 'highpass', 40, 0.7), body, pre, makeShaper(ctx, tanhCurve(1.4)), lp, makeFilter(ctx, 'lowpass', 6000, 0.5), cut, stutter, out, dest);
  const intake = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.white, rand(0.9, 1.1))), makeFilter(ctx, 'bandpass', 1100, 0.7), intake, cut);
  const jitter = makeGain(ctx, 4);
  chain(live(P, makeLoop(ctx, P.bufs.brown, 0.04)), jitter);
  const gains = ANCHORS.map(() => Object.fromEntries(LOADS.map((k) => {
    const g = makeGain(ctx, 0);
    g.connect(mix);
    return [k, g];
  })));
  const pops = [0, 1, 2, 3].map(() => toBuffer(ctx, [popSound(ctx.sampleRate, Math.random)]));
  return { out, stutter, cut, mix, pre, lp, intake, jitter, gains, pops, srcs: [], cache: new Map(), key: '', cyl: 8, red: 5000, load: 0, gear: 0, popT: 0 };
}

// Note: a feedback comb tuned like an exhaust pipe; its loop delay stays above one render quantum.
function pipe(ctx, delay, fb, damp) {
  const node = makeGain(ctx, 1);
  const d = ctx.createDelay(0.05);
  d.delayTime.value = delay;
  chain(node, d, makeFilter(ctx, 'lowpass', damp, 0.5), makeGain(ctx, fb), node);
  return node;
}

function toBuffer(ctx, chs) {
  const buf = ctx.createBuffer(chs.length, chs[0].length, ctx.sampleRate);
  chs.forEach((d, i) => buf.copyToChannel(d, i));
  return buf;
}

function buildSkid(P, dest) {
  const { ctx } = P;
  const src = live(P, makeLoop(ctx, P.bufs.white, 1));
  const lo = makeFilter(ctx, 'bandpass', 950, 9);
  const hi = makeFilter(ctx, 'bandpass', 1900, 12);
  const shudder = makeGain(ctx, 0.8);
  const out = makeGain(ctx, 0);
  chain(src, lo, shudder);
  chain(src, hi, makeGain(ctx, 0.5), shudder);
  chain(shudder, out, dest);
  const wob = makeGain(ctx, 45);
  chain(live(P, makeOsc(ctx, 'sine', 6.7)), wob);
  wob.connect(lo.frequency);
  wob.connect(hi.frequency);
  chain(live(P, makeOsc(ctx, 'triangle', 17)), makeGain(ctx, 0.2), shudder.gain);
  return { out, lo, hi };
}

function buildWind(P, dest) {
  const { ctx } = P;
  const src = live(P, makeLoop(ctx, P.bufs.pink, 1));
  const lp = makeFilter(ctx, 'lowpass', 500, 0.5);
  const body = makeGain(ctx, 0);
  chain(src, lp, body, dest);
  const whistleF = makeFilter(ctx, 'bandpass', 1100, 5);
  const whistle = makeGain(ctx, 0);
  chain(src, whistleF, whistle, dest);
  const mix = makeGain(ctx, 1);
  live(P, makeOsc(ctx, 'sine', 0.071)).connect(mix);
  chain(live(P, makeOsc(ctx, 'sine', 0.193)), makeGain(ctx, 0.5), mix);
  const gust = makeGain(ctx, 0);
  chain(mix, gust, body.gain);
  chain(mix, makeGain(ctx, 250), whistleF.frequency);
  return { body, lp, whistle, gust };
}

function buildRoad(P, dest) {
  const { ctx } = P;
  const rumble = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.brown, 1)), makeFilter(ctx, 'lowpass', 130, 0.9), rumble, dest);
  const roarF = makeFilter(ctx, 'bandpass', 420, 0.6);
  const roar = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.pink, 0.85)), roarF, roar, dest);
  return { rumble, roar, roarF };
}

function buildDrone(P, dest) {
  const { ctx } = P;
  const out = makeGain(ctx, 0);
  const lp = makeFilter(ctx, 'lowpass', 180, 0.7);
  chain(lp, out, dest);
  for (const [f, a] of [[55, 0.5], [55.4, 0.4], [82.3, 0.25]]) chain(live(P, makeOsc(ctx, 'sine', f)), makeGain(ctx, a), lp);
  chain(live(P, makeLoop(ctx, P.bufs.brown, 0.5)), makeFilter(ctx, 'lowpass', 90, 0.7), makeGain(ctx, 0.8), lp);
  const breath = makeGain(ctx, 0);
  chain(live(P, makeOsc(ctx, 'sine', 0.031)), breath, out.gain);
  return { out, breath };
}

function buildCrickets(P, dest) {
  const { ctx } = P;
  const pulse = cycleWave(ctx, (x) => hump(x, 0.55), 12);
  const chirp = cycleWave(ctx, (x) => hump(x, 0.2), 48);
  const lvl = makeGain(ctx, 0);
  lvl.connect(dest);
  const specs = [[4350, 29, 1.9, -0.6], [4720, 33, 2.3, 0.5], [4080, 26, 1.4, 0.15]];
  const voices = specs.map(([f, p, c, pan]) => {
    const a = gate(P, pulse, p);
    const b = gate(P, chirp, c);
    chain(live(P, makeOsc(ctx, 'sine', f)), a.node, b.node, makePan(ctx, pan), lvl);
    return { osc: b.osc, hz: c };
  });
  return { lvl, voices };
}

function buildCicada(P, dest) {
  const { ctx } = P;
  const g = gate(P, cycleWave(ctx, (x) => hump(x, 0.6), 16), 92);
  const swell = makeGain(ctx, 0);
  const lvl = makeGain(ctx, 0);
  const src = live(P, makeLoop(ctx, P.bufs.white, 0.97));
  chain(src, makeFilter(ctx, 'bandpass', 5200, 2.5), g.node, swell, makePan(ctx, 0.35), lvl, dest);
  return { swell, lvl };
}

function buildFrogs(P, dest) {
  const { ctx } = P;
  const lvl = makeGain(ctx, 0);
  lvl.connect(dest);
  const grain = gate(P, cycleWave(ctx, (x) => hump(x, 0.5), 12), 24);
  const croakOsc = live(P, makeOsc(ctx, 'sawtooth', 120));
  const croakGate = makeGain(ctx, 0);
  const croakPan = makePan(ctx, -0.4);
  chain(croakOsc, makeFilter(ctx, 'bandpass', 360, 2), grain.node, croakGate, croakPan, lvl);
  const peepOsc = live(P, makeOsc(ctx, 'sine', 2900));
  const peepGate = makeGain(ctx, 0);
  const peepPan = makePan(ctx, 0.5);
  chain(peepOsc, peepGate, peepPan, makeGain(ctx, 0.35), lvl);
  return { lvl, croakOsc, croakGate, croakPan, peepOsc, peepGate, peepPan };
}

function buildBird(P, dest) {
  const { ctx } = P;
  const osc = live(P, makeOsc(ctx, 'sine', 3000));
  const g = makeGain(ctx, 0);
  const pan = makePan(ctx, 0);
  const lvl = makeGain(ctx, 0);
  chain(osc, g, pan, lvl, dest);
  return { osc, gate: g, pan, lvl };
}

// Note: rain is a high hiss and a crackle patter outside, plus a low drum on the roof when inside the car.
function buildRain(P, outdoor, dest) {
  const { ctx } = P;
  const hiss = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.white, 0.93)), makeFilter(ctx, 'highpass', 2400, 0.5), makeFilter(ctx, 'lowpass', 9000, 0.5), hiss, outdoor);
  const patter = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.crackle, 1.6)), makeFilter(ctx, 'highpass', 1400, 0.7), patter, outdoor);
  const roof = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.crackle, 0.7)), makeFilter(ctx, 'lowpass', 1100, 0.8), roof, dest);
  chain(live(P, makeLoop(ctx, P.bufs.pink, 0.6)), makeFilter(ctx, 'lowpass', 420, 0.7), makeGain(ctx, 0.5), roof);
  return { hiss, patter, roof };
}

function buildAmbience(P, dest) {
  const { ctx } = P;
  const outdoor = makeGain(ctx, 1);
  const muffle = makeFilter(ctx, 'lowpass', 16000, 0.5);
  const muffleG = makeGain(ctx, 1);
  chain(outdoor, muffle, muffleG, dest);
  return {
    muffle,
    muffleG,
    wind: buildWind(P, outdoor),
    road: buildRoad(P, dest),
    drone: buildDrone(P, dest),
    crickets: buildCrickets(P, outdoor),
    cicada: buildCicada(P, outdoor),
    frogs: buildFrogs(P, outdoor),
    bird: buildBird(P, outdoor),
    rain: buildRain(P, outdoor, dest),
    next: { bird: 0, croak: 0, peep: 0, cicada: 0, wander: 0 },
  };
}

// Note: a gated sawtooth through three formant filters reads as distant chatter without real words.
function buildVoice(P, dest) {
  const { ctx } = P;
  const glottis = live(P, makeOsc(ctx, 'sawtooth', 120));
  const breath = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.white, 1.1)), makeFilter(ctx, 'bandpass', 2400, 1.2), breath);
  const f1 = makeFilter(ctx, 'bandpass', 500, 4);
  const f2 = makeFilter(ctx, 'bandpass', 1500, 6);
  const f3 = makeFilter(ctx, 'bandpass', 2500, 8);
  const mix = makeGain(ctx, 1);
  chain(glottis, f1, mix);
  chain(glottis, f2, makeGain(ctx, 0.7), mix);
  chain(glottis, f3, makeGain(ctx, 0.35), mix);
  breath.connect(mix);
  const g = makeGain(ctx, 0);
  const lvl = makeGain(ctx, 1);
  const hp = makeFilter(ctx, 'highpass', 300, 0.7);
  const lp = makeFilter(ctx, 'lowpass', 3000, 0.7);
  chain(mix, g, hp, lp, makeShaper(ctx, tanhCurve(2)), lvl, makeGain(ctx, 0.4), dest);
  const fade = makeGain(ctx, 0);
  chain(live(P, makeOsc(ctx, 'sine', 0.23)), fade, lvl.gain);
  return { glottis, breath, f1, f2, gate: g, lvl, fade };
}

function buildRadio(P, dest) {
  const { ctx } = P;
  const on = makeGain(ctx, 0);
  on.connect(dest);
  const hiss = makeGain(ctx, 0);
  const hp = makeFilter(ctx, 'highpass', 400, 0.6);
  chain(live(P, makeLoop(ctx, P.bufs.white, 1)), hp, makeFilter(ctx, 'lowpass', 5500, 0.6), hiss, on);
  const crackle = makeGain(ctx, 0);
  chain(live(P, makeLoop(ctx, P.bufs.crackle, 1)), makeFilter(ctx, 'highpass', 700, 0.7), crackle, on);
  const tone = live(P, makeOsc(ctx, 'sine', 1200));
  const whine = makeGain(ctx, 0);
  chain(tone, whine, on);
  return { on, hiss, crackle, tone, whine, voice: buildVoice(P, on) };
}

// Note: a lub-dub envelope oscillator drives both loudness and a small pitch drop on two low sines.
function buildHeart(P, dest) {
  const { ctx } = P;
  const shape = cycleWave(ctx, beat, 64);
  const pace = live(P, makeOsc(ctx, shape.wave, 1));
  const am = makeGain(ctx, shape.mean);
  pace.connect(am.gain);
  const low = live(P, makeOsc(ctx, 'sine', 48));
  const high = live(P, makeOsc(ctx, 'sine', 96));
  const drop = makeGain(ctx, 14);
  pace.connect(drop);
  drop.connect(low.frequency);
  chain(drop, makeGain(ctx, 2), high.frequency);
  low.connect(am);
  chain(high, makeGain(ctx, 0.3), am);
  const out = makeGain(ctx, 0);
  chain(am, makeFilter(ctx, 'lowpass', 180, 0.7), out, dest);
  return { pace, out };
}

function build(S) {
  const ctx = S.ctx;
  const P = { ctx, srcs: [], bufs: null };
  S.srcs = P.srcs;
  P.bufs = {
    white: noiseBuffer(ctx, 2, 'white'),
    pink: noiseBuffer(ctx, 5, 'pink'),
    brown: noiseBuffer(ctx, 5, 'brown'),
    crackle: crackleBuffer(ctx, 3.7),
  };
  S.bufs = P.bufs;
  S.grit = tanhCurve(3.2);
  S.M = buildMaster(S);
  S.sfx = makeGain(ctx, 1);
  S.sfx.connect(S.M.input);
  S.verb = buildVerb(ctx, S.sfx);
  S.K = buildSkid(P, S.M.input);
  S.A = buildAmbience(P, S.M.input);
  S.R = buildRadio(P, S.M.input);
  S.H = buildHeart(P, S.M.input);
  S.E = buildEngine(P, S.M.input);
}

function stopAll(S) {
  for (const s of S.srcs || []) {
    try {
      s.stop();
    } catch (e) {
      // Note: already stopped sources throw here and are fine to ignore.
    }
  }
}

function resume(ctx) {
  if (ctx.state !== 'suspended' || !ctx.resume) return;
  const p = ctx.resume();
  if (p && p.catch) p.catch(() => {});
}

function start(S) {
  if (S.ctx) {
    resume(S.ctx);
    return;
  }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!S.makeContext && typeof AC !== 'function') return;
  S.ctx = S.makeContext ? S.makeContext() : new AC({ latencyHint: 'interactive' });
  try {
    build(S);
  } catch (err) {
    dispose(S);
    throw err;
  }
  S.ready = true;
  resume(S.ctx);
  // Note: weapon takes render one kind per tick after start, so the first shot doesn't stall a frame.
  GUN_KINDS.forEach((k, i) => setTimeout(() => {
    try {
      if (S.ready) takes(S, k);
    } catch (err) {
      console.warn('audio: prewarm failed', err);
    }
  }, 300 + 120 * i));
}

function dispose(S) {
  const ctx = S.ctx;
  S.ready = false;
  S.ctx = null;
  S.guns = null;
  S.active = 0;
  S.shots = 0;
  S.shotSet.clear();
  S.last.clear();
  if (!ctx) return;
  stopAll(S);
  S.srcs = [];
  if (ctx.close) {
    const p = ctx.close();
    if (p && p.catch) p.catch(() => {});
  }
}

function setMuted(S, m) {
  S.muted = !!m;
  if (S.ready) ramp(S, S.M.mute.gain, S.muted ? 0 : 1, 0.02);
}

function setMaster(S, v) {
  S.master = unit(v, S.master);
  if (S.ready) ramp(S, S.M.input.gain, S.master, 0.05);
}

// Note: o = {on, rev, red, cyl, load 0..1, gear, damage 0..1}; rev and red are crank rpm.
function setEngine(S, o) {
  const E = S.E;
  const on = !!field(o, 'on');
  const cyl = num(field(o, 'cyl'), 0);
  const red = num(field(o, 'red'), 0);
  if (cyl > 0 && red > 0) engineSources(S, Math.round(cyl), red);
  const rev = on ? Math.max(0, num(field(o, 'rev'), 0)) : 0;
  const x = rev / E.red;
  const load = unit(field(o, 'load'));
  const dmg = unit(field(o, 'damage'));
  setRates(S, rev, on ? 0.03 : 0.35);
  // Note: each loop covers the revs just below its own; neighbours trade places with an equal-power fade.
  let keep = 1;
  const reach = ANCHORS.map((A, i) => {
    if (i === ANCHORS.length - 1) return keep;
    const f = band(x, A.at * 0.78, A.at) * (Math.PI / 2);
    const w = keep * Math.cos(f);
    keep *= Math.sin(f);
    return w;
  });
  // Note: overrun only once the wheels drive the engine above idle; at idle it keeps firing lightly.
  const coast = (1 - band(load, 0, 0.15)) * band(x, 0.16, 0.3);
  const miss = band(dmg, 0.3, 1);
  const mix = { on: (1 - coast) * (1 - miss), off: coast * (1 - miss), miss: miss * (1 - 0.7 * coast) };
  E.gains.forEach((g, i) => {
    for (const k of LOADS) ramp(S, g[k].gain, reach[i] * mix[k], 0.06);
  });
  const level = on ? (0.75 + 0.25 * load + 0.2 * x + 0.45 * coast) * band(x, 0.02, 0.08) : 0;
  ramp(S, E.out.gain, ENGINE_LEVEL * level, on ? 0.06 : 0.15);
  ramp(S, E.pre.gain, 1 + 0.6 * load, 0.06);
  ramp(S, E.lp.frequency, 800 + 1800 * load * (0.4 + 0.6 * x) + 1200 * x + 300 * dmg, 0.06);
  ramp(S, E.intake.gain, on ? 0.03 * load * (0.3 + x) : 0, 0.08);
  ramp(S, E.jitter.gain, 4 + 50 * dmg * dmg, 0.2);
  const gear = num(field(o, 'gear'), 0);
  if (on && gear !== E.gear && load > 0.3) shiftCut(S);
  E.gear = gear;
  if (on) pops(S, x, load, E.load > 0.5 && load < 0.1);
  E.load = on ? load : 0;
  stutter(S, on, dmg);
}

// Note: every loop takes the same rate step at once; skipping some but not others would let their cycles drift apart.
function setRates(S, rev, tc) {
  const E = S.E;
  if (Math.abs(rev - E.rev) < 0.01 && tc === E.rateTc) return;
  E.rev = rev;
  E.rateTc = tc;
  const run = S.ctx.state === 'running';
  for (const s of E.srcs) {
    const p = s.src.playbackRate;
    if (run) p.setTargetAtTime(rev / s.ref, S.ctx.currentTime, tc);
    else {
      p.cancelScheduledValues(0);
      p.value = rev / s.ref;
    }
  }
}

// Note: loops are rendered once per engine type and all start together at offset zero, so their cycles stay aligned.
function engineSources(S, cyl, red) {
  const E = S.E;
  const key = `${cyl}:${red}`;
  if (E.key === key) return;
  const ctx = S.ctx;
  for (const s of E.srcs) {
    try {
      s.src.stop();
    } catch (e) {
      // Note: a source that never started throws here and is fine to ignore.
    }
    s.src.disconnect();
  }
  const old = new Set(E.srcs.map((s) => s.src));
  S.srcs = S.srcs.filter((s) => !old.has(s));
  let set = E.cache.get(key);
  if (!set) {
    set = engineSet(ctx.sampleRate, cyl, red).map((A) => ({ ref: A.ref, bufs: Object.fromEntries(LOADS.map((k) => [k, toBuffer(ctx, A.loops[k].ch)])) }));
    E.cache.set(key, set);
  }
  const t = ctx.currentTime + LOOK;
  E.srcs = [];
  set.forEach((A, i) => {
    for (const k of LOADS) {
      const src = makeLoop(ctx, A.bufs[k], 0);
      E.jitter.connect(src.detune);
      src.connect(E.gains[i][k]);
      src.start(t);
      E.srcs.push({ src, ref: A.ref });
      S.srcs.push(src);
    }
  });
  Object.assign(E, { key, cyl, red, rev: NaN });
}

// Note: an upshift under power drops the torque for a moment.
function shiftCut(S) {
  if (S.ctx.state !== 'running') return;
  const g = S.E.cut.gain;
  const now = S.ctx.currentTime;
  hold(g, now);
  g.setTargetAtTime(0.5, now, 0.015);
  g.setTargetAtTime(1, now + 0.09, 0.05);
}

// Note: lifting off at high revs spits a few bangs out of the exhaust; a V8 keeps burbling longer than a small four.
function pops(S, x, load, lift) {
  const E = S.E;
  const now = S.ctx.currentTime;
  const dt = clamp(now - E.popT, 0, 0.1);
  E.popT = now;
  if (S.ctx.state !== 'running' || x < 0.4) return;
  const big = E.cyl >= 8 ? 1 : 0.5;
  if (lift) {
    const n = 1 + Math.floor(Math.random() * 3 * big + big);
    for (let i = 0; i < n; i++) pop(S, now + LOOK + rand(0.03, 0.5), rand(0.4, 1));
  } else if (load < 0.05 && chance(dt * 2.5 * big * band(x, 0.4, 0.9))) pop(S, now + LOOK, rand(0.2, 0.6));
}

function pop(S, t, amp) {
  const E = S.E;
  const src = S.ctx.createBufferSource();
  src.buffer = E.pops[Math.floor(Math.random() * E.pops.length)];
  const g = makeGain(S.ctx, amp);
  chain(src, g, E.mix);
  src.onended = () => g.disconnect();
  src.start(t);
}

// Note: damage triggers random brief dropouts, like a fouled plug skipping a beat.
function stutter(S, on, dmg) {
  const now = S.ctx.currentTime;
  const dt = clamp(now - S.engineT, 0, 0.1);
  S.engineT = now;
  if (!on || dmg < 0.2 || !chance(dt * dmg * 2.5)) return;
  const g = S.E.stutter.gain;
  g.setTargetAtTime(rand(0.15, 0.5), now, 0.012);
  g.setTargetAtTime(1, now + rand(0.05, 0.14), 0.04);
}

function setSkid(S, amount) {
  const a = unit(amount);
  ramp(S, S.K.out.gain, a < 0.01 ? 0 : 2.2 * a ** 1.5, 0.05);
  ramp(S, S.K.lo.frequency, 850 + 300 * a, 0.1);
  ramp(S, S.K.hi.frequency, 1750 + 500 * a, 0.1);
}

function setWind(S, W, wind, speed) {
  const lvl = 0.05 * wind + 0.04 * speed;
  ramp(S, W.body.gain, lvl, 0.3);
  ramp(S, W.gust.gain, lvl * 0.45, 0.3);
  ramp(S, W.lp.frequency, 350 + 800 * wind + 900 * speed, 0.3);
  ramp(S, W.whistle.gain, 0.03 * wind * wind, 0.4);
}

function setAmbience(S, o) {
  const A = S.A;
  const night = unit(field(o, 'night'));
  const speed = unit(field(o, 'speed'));
  const indoor = !!field(o, 'indoor');
  ramp(S, A.muffle.frequency, indoor ? 450 : 16000, 0.15);
  ramp(S, A.muffleG.gain, indoor ? 0.5 : 1, 0.15);
  setWind(S, A.wind, unit(field(o, 'wind')), speed);
  ramp(S, A.road.rumble.gain, 0.3 * speed, 0.1);
  ramp(S, A.road.roar.gain, 0.12 * speed ** 1.3, 0.1);
  ramp(S, A.road.roarF.frequency, 300 + 500 * speed, 0.2);
  const drone = 0.01 + 0.014 * night;
  ramp(S, A.drone.out.gain, drone, 1);
  ramp(S, A.drone.breath.gain, drone * 0.4, 1);
  const rain = unit(field(o, 'rain'));
  const inCar = !!field(o, 'inCar');
  ramp(S, A.rain.hiss.gain, 0.08 * rain * (inCar ? 0.35 : 1), 0.8);
  ramp(S, A.rain.patter.gain, 0.14 * rain * (inCar ? 0.2 : 1), 0.8);
  ramp(S, A.rain.roof.gain, inCar ? 0.18 * rain : 0, 0.4);
  const insects = band(night, 0.35, 0.85) * (1 - 0.8 * rain);
  ramp(S, A.crickets.lvl.gain, 0.02 * insects, 0.6);
  ramp(S, A.cicada.lvl.gain, 0.012 * insects, 0.6);
  ramp(S, A.frogs.lvl.gain, 0.05 * band(night, 0.4, 0.9), 0.6);
  ramp(S, A.bird.lvl.gain, 0.02 * (1 - night) ** 2 * (1 - rain), 0.6);
  wildlife(S, A, night, insects);
}

// Note: schedules the next call of each animal on its persistent voice once the previous one has finished.
function wildlife(S, A, night, insects) {
  if (S.ctx.state !== 'running') return;
  const now = S.ctx.currentTime;
  const N = A.next;
  const day = (1 - night) ** 2;
  const t = now + 0.05;
  if (now >= N.bird) N.bird = day > 0.05 ? birdCall(A.bird, t) + rand(3, 10) + 6 * (1 - day) : now + 2;
  if (now >= N.croak) N.croak = night > 0.4 ? croaks(A.frogs, t) + rand(2, 7) : now + 2;
  if (now >= N.peep) N.peep = insects > 0.1 ? peeps(A.frogs, t) + rand(1, 5) : now + 2;
  if (now >= N.cicada) N.cicada = insects > 0.1 ? cicadaSwell(A.cicada, t) + rand(3, 9) : now + 2;
  if (now >= N.wander) {
    N.wander = now + rand(3, 7);
    for (const v of A.crickets.voices) v.osc.frequency.setTargetAtTime(v.hz * rand(0.9, 1.1), now, 1.5);
  }
}

function birdCall(B, t) {
  setPan(B.pan, rand(-0.8, 0.8), t);
  return chance(0.3) ? coo(B, t) : chirps(B, t);
}

function chirps(B, t) {
  const n = 2 + Math.floor(Math.random() * 5);
  const top = rand(2800, 4600);
  let at = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.05, 0.11);
    B.osc.frequency.setValueAtTime(top * rand(0.95, 1.08), at);
    B.osc.frequency.exponentialRampToValueAtTime(top * rand(0.55, 0.8), at + d);
    env(B.gate.gain, at, rand(0.5, 1), 0.008, d * 0.5, d * 0.5 - 0.008);
    at += d + rand(0.06, 0.18);
  }
  return at;
}

// Note: a distant mourning dove, the one soft daytime voice.
function coo(B, t) {
  const f = rand(470, 560);
  const notes = [[0.28, 1, 1.12], [0.5, 1.12, 0.95], [0.32, 1, 0.97], [0.32, 1, 0.97], [0.32, 1, 0.96]];
  let at = t;
  for (const [d, a, b] of notes) {
    B.osc.frequency.setValueAtTime(f * a, at);
    B.osc.frequency.exponentialRampToValueAtTime(f * b, at + d);
    env(B.gate.gain, at, 0.6, 0.06, d - 0.16, 0.1);
    at += d + rand(0.08, 0.18);
  }
  return at;
}

function croaks(F, t) {
  setPan(F.croakPan, rand(-0.9, 0.9), t);
  const base = rand(90, 135);
  const n = 2 + Math.floor(Math.random() * 3);
  let at = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.22, 0.38);
    F.croakOsc.frequency.setValueAtTime(base * 1.12, at);
    F.croakOsc.frequency.exponentialRampToValueAtTime(base * 0.94, at + d);
    env(F.croakGate.gain, at, rand(0.6, 1), 0.03, d - 0.1, 0.07);
    at += d + rand(0.2, 0.45);
  }
  return at;
}

function peeps(F, t) {
  setPan(F.peepPan, rand(-0.9, 0.9), t);
  const f = rand(2600, 3100);
  const n = 3 + Math.floor(Math.random() * 5);
  let at = t;
  for (let i = 0; i < n; i++) {
    F.peepOsc.frequency.setValueAtTime(f * 0.9, at);
    F.peepOsc.frequency.linearRampToValueAtTime(f, at + 0.09);
    env(F.peepGate.gain, at, rand(0.5, 1), 0.015, 0.05, 0.03);
    at += rand(0.35, 0.65);
  }
  return at;
}

function cicadaSwell(C, t) {
  return env(C.swell.gain, t, rand(0.6, 1), rand(1.5, 3), rand(1, 4), rand(2, 4));
}

function setRadio(S, o) {
  const R = S.R;
  const on = !!field(o, 'on');
  const sig = unit(field(o, 'signal'), 1);
  const lost = 1 - sig;
  ramp(S, R.on.gain, on ? 1 : 0, 0.03);
  ramp(S, R.hiss.gain, 0.004 + 0.12 * lost ** 1.5, 0.05);
  ramp(S, R.crackle.gain, 0.01 + 0.08 * lost, 0.05);
  ramp(S, R.whine.gain, 0.006 * Math.sin(Math.PI * sig) ** 2, 0.05);
  ramp(S, R.tone.frequency, 300 + 2400 * lost, 0.05);
  ramp(S, R.voice.lvl.gain, 0.15 + 0.85 * sig, 0.05);
  ramp(S, R.voice.fade.gain, 0.4 * lost, 0.2);
}

function radioVoice(S, seconds) {
  const V = S.R.voice;
  const now = S.ctx.currentTime;
  for (const p of [V.glottis.frequency, V.f1.frequency, V.f2.frequency, V.gate.gain, V.breath.gain]) hold(p, now);
  const len = clamp(num(seconds, 0), 0, MAX_SPEECH);
  const end = now + len;
  const pitch = rand(95, 150);
  let t = now + 0.04;
  let words = 0;
  while (t < end - 0.15) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n && t < end - 0.1; i++) t = syllable(V, t, pitch * (1.08 - 0.16 * ((t - now) / (len || 1))));
    words += 1;
    t += words % 6 === 0 ? rand(0.3, 0.6) : rand(0.04, 0.12);
  }
  V.gate.gain.setTargetAtTime(0, Math.max(now, Math.min(t, end)), 0.03);
  V.breath.gain.setTargetAtTime(0, Math.max(now, Math.min(t, end)), 0.02);
}

function syllable(V, t, pitch) {
  const d = rand(0.08, 0.22);
  V.f1.frequency.setTargetAtTime(rand(300, 800), t, 0.02);
  V.f2.frequency.setTargetAtTime(rand(900, 2300), t, 0.025);
  V.glottis.frequency.setTargetAtTime(pitch * rand(0.92, 1.1), t, 0.03);
  if (chance(0.35)) {
    V.breath.gain.setTargetAtTime(rand(0.3, 0.7), t, 0.005);
    V.breath.gain.setTargetAtTime(0, t + 0.04, 0.01);
  }
  V.gate.gain.setTargetAtTime(rand(0.7, 1), t, 0.015);
  V.gate.gain.setTargetAtTime(0.08, t + d * 0.7, 0.025);
  return t + d;
}

function heartbeat(S, level) {
  const l = unit(level);
  ramp(S, S.H.out.gain, l < 0.01 ? 0 : 0.2 * l ** 1.2, 0.3);
  ramp(S, S.H.pace.frequency, (58 + 82 * l) / 60, 0.5);
}

// Note: a one-shot voice is input, distance lowpass, panner, dry gain and an optional reverb send.
function voice(S, pan, dist, wet, level, pool = 'active') {
  const ctx = S.ctx;
  if (S.muted || S[pool] >= (pool === 'shots' ? MAX_SHOTS + 4 : MAX_VOICES) || ctx.state !== 'running') return null;
  const d = unit(dist);
  const v = { S, ctx, pool, t: ctx.currentTime + LOOK + d * 0.08, nodes: [], last: null, end: 0, done: false };
  const input = makeGain(ctx, level);
  const lp = makeFilter(ctx, 'lowpass', 18000 * 0.07 ** d, 0.5);
  const pn = makePan(ctx, side(pan));
  const dry = makeGain(ctx, 0.15 + 0.85 * (1 - d) ** 2);
  chain(input, lp, pn, dry, S.sfx);
  v.nodes.push(input, lp, pn, dry);
  if (wet > 0) {
    const send = makeGain(ctx, wet * (0.15 + 0.4 * d));
    chain(pn, send, S.verb);
    v.nodes.push(send);
  }
  v.in = input;
  S[pool] += 1;
  if (pool === 'shots') S.shotSet.add(v);
  return v;
}

function oneShot(S, pan, dist, wet, fn, level = 1, pool = 'active') {
  const v = voice(S, pan, dist, wet, level, pool);
  if (!v) return;
  try {
    fn(v);
  } finally {
    finish(v);
  }
}

function play(v, src, t, stop) {
  if (src.buffer) src.start(t, Math.random() * Math.max(0, src.buffer.duration - 0.05));
  else src.start(t);
  src.stop(stop);
  v.nodes.push(src);
  if (stop >= v.end) {
    v.end = stop;
    v.last = src;
  }
}

function finish(v) {
  if (!v.last) {
    release(v);
    return;
  }
  v.last.onended = () => release(v);
}

function release(v) {
  if (v.done) return;
  v.done = true;
  v.S[v.pool] = Math.max(0, v.S[v.pool] - 1);
  v.S.shotSet.delete(v);
  for (const n of v.nodes) {
    try {
      n.disconnect();
    } catch (e) {
      // Note: a node that was never connected throws on disconnect; nothing to clean.
    }
  }
}

function decay(param, t, att, amp, dur) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(amp, t + att);
  param.setTargetAtTime(0, t + att, dur / 5);
}

function noiseHit(v, o) {
  const t = v.t + (o.at || 0);
  const att = o.att || 0.002;
  const src = makeLoop(v.ctx, o.buf || v.S.bufs.white, o.rate || 1);
  const filt = makeFilter(v.ctx, o.type || 'lowpass', o.f, o.q || 0.7);
  if (o.f2) {
    filt.frequency.setValueAtTime(o.f, t);
    filt.frequency.exponentialRampToValueAtTime(o.f2, t + (o.sweep || o.dur));
  }
  const g = makeGain(v.ctx, 0);
  decay(g.gain, t, att, o.amp, o.dur);
  chain(src, filt, g, o.to || v.in);
  v.nodes.push(filt, g);
  play(v, src, t, t + att + o.dur * 1.2);
}

function toneHit(v, o) {
  const t = v.t + (o.at || 0);
  const att = o.att || 0.002;
  const osc = makeOsc(v.ctx, o.type || 'sine', o.f);
  if (o.f2) {
    osc.frequency.setValueAtTime(o.f, t);
    osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
  }
  const g = makeGain(v.ctx, 0);
  decay(g.gain, t, att, o.amp, o.dur);
  chain(osc, g, o.to || v.in);
  v.nodes.push(g);
  play(v, osc, t, t + att + o.dur * 1.2);
}

// Note: noise with explicit filter and gain breakpoints, for swells and swishes.
function noiseCurve(v, o) {
  const t = v.t + (o.at || 0);
  const src = makeLoop(v.ctx, o.buf || v.S.bufs.white, o.rate || 1);
  const filt = makeFilter(v.ctx, o.type, o.freqs[0][1], o.q || 0.7);
  points(filt.frequency, t, o.freqs, true);
  const g = makeGain(v.ctx, 0);
  points(g.gain, t, o.gains, false);
  chain(src, filt, g, o.to || v.in);
  v.nodes.push(filt, g);
  play(v, src, t, t + o.gains[o.gains.length - 1][0] + 0.02);
}

function click(v, at, f, amp, q = 4, dur = 0.008) {
  noiseHit(v, { at, type: 'bandpass', f, q, att: 0.0005, dur, amp });
}

function grit(v) {
  const w = makeShaper(v.ctx, v.S.grit);
  w.connect(v.in);
  v.nodes.push(w);
  return w;
}

// Note: a few rendered takes per weapon, made on first use; picking one at random keeps rapid fire from sounding stamped.
function takes(S, kind) {
  S.guns = S.guns || {};
  if (!S.guns[kind]) {
    const sr = S.ctx.sampleRate;
    const make = kind === 'crack' ? () => crackSound(sr, Math.random) : () => gunshot(sr, kind, Math.random);
    S.guns[kind] = [0, 1, 2].map(() => toBuffer(S.ctx, [make()]));
  }
  const list = S.guns[kind];
  return list[Math.floor(Math.random() * list.length)];
}

function once(v, buf, t, rate = 1) {
  const src = v.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(v.in);
  src.start(t);
  v.nodes.push(src);
  v.end = t + buf.duration / rate;
  v.last = src;
}

// Note: a full shot pool cuts its oldest tail short rather than drop the newest bang.
function steal(S) {
  if (S.shots < MAX_SHOTS || S.ctx.state !== 'running') return;
  let old = null;
  for (const v of S.shotSet) if (!v.cut && v.last && (!old || v.end < old.end)) old = v;
  if (!old) return;
  old.cut = true;
  const now = S.ctx.currentTime;
  old.in.gain.setTargetAtTime(0, now, 0.01);
  old.last.stop(now + 0.05);
}

// Note: the blast has its outdoor tail baked in, so it skips the shared reverb.
function shot(S, kind, pan, dist) {
  const k = GUN_KINDS.includes(kind) ? kind : 'pistol';
  const d = unit(dist);
  steal(S);
  // Note: a rifle round outruns its own report, so a far shooter's snap lands first.
  if (k === 'rifle' && d > 0.12) oneShot(S, side(pan) * 0.5, 0, 0, (v) => once(v, takes(S, 'crack'), v.t), 0.5 * SHOT_LEVEL, 'shots');
  oneShot(S, pan, d, 0, (v) => once(v, takes(S, k), v.t, rand(0.96, 1.04)), SHOT_LEVEL, 'shots');
}

function glassBits(v, amp) {
  noiseHit(v, { type: 'highpass', f: 3500, q: 0.7, att: 0.001, dur: 0.09, amp: 0.45 * amp });
  for (let i = 0; i < 8; i++) {
    toneHit(v, { at: rand(0, 0.25), f: rand(3000, 7500), att: 0.001, dur: rand(0.03, 0.08), amp: rand(0.03, 0.08) * amp });
  }
}

const IMPACTS = {
  metal(v) {
    click(v, 0, 3000, 0.5, 1.5, 0.02);
    const base = rand(700, 1400);
    [1, 2.76, 5.4].forEach((r, i) => toneHit(v, { f: base * r, att: 0.001, dur: rand(0.15, 0.35), amp: 0.12 / (i + 1) }));
  },
  glass(v) {
    glassBits(v, 1);
  },
  flesh(v) {
    noiseHit(v, { type: 'lowpass', f: 500, f2: 200, q: 0.8, att: 0.002, dur: 0.07, amp: 0.4 });
    toneHit(v, { f: 95, f2: 55, att: 0.002, dur: 0.08, amp: 0.3 });
    noiseHit(v, { at: 0.01, type: 'bandpass', f: 900, q: 2, att: 0.004, dur: 0.05, amp: 0.11 });
  },
  ground(v) {
    noiseHit(v, { type: 'lowpass', f: 1800, f2: 400, q: 0.7, att: 0.001, dur: 0.09, amp: 0.75 });
    click(v, 0, 4000, 0.25, 3, 0.01);
    if (chance(0.25)) {
      const f = rand(2600, 3400);
      toneHit(v, { at: 0.01, f, f2: f * 0.55, glide: 0.3, att: 0.005, dur: 0.3, amp: 0.05 });
    }
  },
  water(v) {
    noiseHit(v, { type: 'bandpass', f: 1200, f2: 600, q: 0.8, att: 0.003, dur: 0.18, amp: 0.55 });
    toneHit(v, { f: 350, f2: 900, glide: 0.04, att: 0.002, dur: 0.05, amp: 0.15 });
    noiseHit(v, { at: 0.03, type: 'highpass', f: 3000, q: 0.7, att: 0.01, dur: 0.25, amp: 0.1 });
  },
};

function impact(S, kind, pan, dist) {
  const fn = lookup(IMPACTS, kind, IMPACTS.ground);
  oneShot(S, pan, dist, 0.4, fn, 2.5);
}

function explode(S, pan, dist) {
  oneShot(S, pan, dist, 0.9, (v) => {
    glassBits(v, 0.6);
    const to = grit(v);
    toneHit(v, { f: 75, f2: 30, glide: 0.25, att: 0.004, dur: 0.35, amp: 0.7, to });
    noiseCurve(v, {
      type: 'lowpass',
      q: 1.2,
      buf: S.bufs.pink,
      freqs: [[0, 180], [0.22, 2400], [0.7, 900], [1.6, 300]],
      gains: [[0, 0], [0.16, 0.6], [0.5, 0.35], [1.6, 0]],
      to,
    });
    for (let i = 0; i < 12; i++) click(v, rand(0.15, 1.6), rand(1500, 4500), rand(0.05, 0.18), 2, rand(0.005, 0.02));
  });
}

function crash(S, intensity) {
  const k = unit(intensity, 0.5);
  const s = 0.3 + 0.7 * k;
  oneShot(S, 0, 0, 0.5, (v) => {
    const to = grit(v);
    toneHit(v, { f: 75, f2: 32, glide: 0.15, att: 0.002, dur: 0.3, amp: 0.8 * s, to });
    noiseHit(v, { type: 'lowpass', f: 900, f2: 150, q: 0.8, att: 0.002, dur: 0.35, amp: 0.6 * s, to });
    const n = 4 + Math.round(6 * k);
    for (let i = 0; i < n; i++) {
      noiseHit(v, { at: rand(0, 0.05 + 0.25 * k), type: 'bandpass', f: rand(250, 2400), q: rand(3, 9), att: 0.001, dur: rand(0.06, 0.2), amp: rand(0.25, 0.6) * s, to });
    }
    const ring = rand(300, 600);
    toneHit(v, { f: ring, att: 0.002, dur: 0.5, amp: 0.06 * s });
    toneHit(v, { f: ring * 2.3, att: 0.002, dur: 0.35, amp: 0.04 * s });
    if (k > 0.5) glassBits(v, k);
    for (let i = 0; i < 2 + 3 * k; i++) click(v, rand(0.2, 0.6), rand(1200, 3500), rand(0.04, 0.1) * s, 3, 0.012);
  }, 1.1);
}

function footstep(S, surface) {
  const a = rand(0.8, 1.1);
  oneShot(S, rand(-0.05, 0.05), 0, 0.1, (v) => {
    if (surface === 'water') {
      noiseHit(v, { type: 'bandpass', f: 900, f2: 500, q: 0.9, att: 0.004, dur: 0.14, amp: 0.15 * a });
      noiseHit(v, { at: 0.02, type: 'highpass', f: 2500, q: 0.7, att: 0.006, dur: 0.12, amp: 0.045 * a });
      toneHit(v, { f: 400, f2: 700, glide: 0.03, att: 0.002, dur: 0.04, amp: 0.03 * a });
    } else if (surface === 'soft') {
      noiseHit(v, { type: 'lowpass', f: 700, q: 0.7, att: 0.006, dur: 0.07, amp: 0.3 * a });
      noiseHit(v, { at: 0.01, type: 'bandpass', f: 2500, q: 0.8, att: 0.003, dur: 0.04, amp: 0.075 * a });
    } else {
      noiseHit(v, { type: 'bandpass', f: rand(1500, 2100), q: 1.2, att: 0.001, dur: 0.03, amp: 0.12 * a });
      toneHit(v, { f: 140, f2: 90, att: 0.001, dur: 0.04, amp: 0.08 * a });
      noiseHit(v, { at: 0.012, type: 'highpass', f: 3000, q: 0.7, att: 0.004, dur: 0.03, amp: 0.025 * a });
    }
  }, 4);
}

function reload(S) {
  oneShot(S, 0, 0, 0.05, (v) => {
    click(v, 0, 2600, 0.25, 5, 0.01);
    for (const at of [0.13, 0.21]) {
      toneHit(v, { at, f: rand(3500, 4500), att: 0.001, dur: 0.05, amp: 0.04 });
      click(v, at, 5000, 0.08, 3, 0.006);
    }
    for (let i = 0; i < 4; i++) click(v, 0.38 + i * 0.026, 3800, 0.07, 6, 0.004);
    click(v, 0.56, 1800, 0.3, 4, 0.012);
    toneHit(v, { at: 0.56, f: 160, f2: 100, att: 0.001, dur: 0.04, amp: 0.1 });
  }, 2);
}

function melee(S, hit) {
  oneShot(S, 0, 0, 0.1, (v) => {
    noiseCurve(v, {
      type: 'bandpass',
      q: 1.2,
      freqs: [[0, 350], [0.11, 1700], [0.24, 500]],
      gains: [[0, 0], [0.1, 0.4], [0.24, 0]],
    });
    if (!hit) return;
    noiseHit(v, { at: 0.11, type: 'lowpass', f: 600, f2: 180, q: 0.8, att: 0.002, dur: 0.09, amp: 0.5 });
    toneHit(v, { at: 0.11, f: 110, f2: 55, att: 0.002, dur: 0.1, amp: 0.4 });
  });
}

const UI = {
  click(v) {
    toneHit(v, { type: 'triangle', f: 1800, att: 0.001, dur: 0.02, amp: 0.1 });
    click(v, 0, 3000, 0.08, 3, 0.006);
  },
  confirm(v) {
    toneHit(v, { f: 520, att: 0.004, dur: 0.07, amp: 0.07 });
    toneHit(v, { at: 0.07, f: 780, att: 0.004, dur: 0.1, amp: 0.07 });
  },
  deny(v) {
    toneHit(v, { type: 'triangle', f: 150, att: 0.003, dur: 0.06, amp: 0.12 });
    toneHit(v, { at: 0.09, type: 'triangle', f: 140, att: 0.003, dur: 0.07, amp: 0.12 });
  },
  loot(v) {
    noiseHit(v, { type: 'bandpass', f: 2500, q: 0.7, att: 0.01, dur: 0.08, amp: 0.12 });
    toneHit(v, { at: 0.05, f: 2400, att: 0.001, dur: 0.1, amp: 0.06 });
  },
  swap(v) {
    click(v, 0, 1500, 0.12, 4, 0.01);
    click(v, 0.06, 900, 0.15, 4, 0.012);
    toneHit(v, { at: 0.06, f: 160, f2: 90, att: 0.001, dur: 0.05, amp: 0.08 });
  },
  page(v) {
    noiseCurve(v, {
      type: 'highpass',
      q: 0.7,
      freqs: [[0, 1800], [0.16, 2600]],
      gains: [[0, 0], [0.03, 0.05], [0.06, 0.02], [0.09, 0.045], [0.16, 0]],
    });
  },
};

function ui(S, kind) {
  oneShot(S, 0, 0, 0, lookup(UI, kind, UI.click), 2);
}

function bark(S) {
  oneShot(S, 0, 0, 0, (v) => {
    toneHit(v, { f: 1250, att: 0.002, dur: 0.025, amp: 0.12 });
    click(v, 0, 2500, 0.1, 6, 0.006);
  });
}

// Note: starter motor whine under a compression rhythm; it either catches with ragged firing or sputters out.
function crank(S, ok) {
  oneShot(S, 0, 0, 0.15, (v) => {
    const { ctx, t } = v;
    const T = 0.8;
    const am = makeGain(ctx, 0.3);
    am.connect(v.in);
    const lfo = makeOsc(ctx, 'sine', 7);
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.linearRampToValueAtTime(ok ? 10 : 5, t + T);
    const depth = makeGain(ctx, 0.27);
    chain(lfo, depth, am.gain);
    const motor = makeOsc(ctx, 'sawtooth', 120);
    motor.frequency.setValueAtTime(120, t);
    motor.frequency.linearRampToValueAtTime(ok ? 175 : 105, t + T);
    const mf = makeFilter(ctx, 'bandpass', 800, 1.1);
    const mg = makeGain(ctx, 0);
    points(mg.gain, t, [[0, 0], [0.04, 0.22], [T - 0.05, 0.2], [T, 0]], false);
    chain(motor, mf, mg, am);
    v.nodes.push(am, depth, mf, mg);
    play(v, lfo, t, t + T + 0.05);
    play(v, motor, t, t + T + 0.02);
    noiseCurve(v, {
      type: 'lowpass',
      q: 0.8,
      buf: S.bufs.brown,
      freqs: [[0, 500], [T, ok ? 800 : 350]],
      gains: [[0, 0], [0.05, 0.35], [T - 0.05, 0.3], [T, 0]],
      to: am,
    });
    if (ok) caught(v, T - 0.1);
    else sputter(v, T - 0.08);
  });
}

function caught(v, at) {
  [0, 0.045, 0.08, 0.13, 0.16].forEach((d, i) => {
    toneHit(v, { at: at + d, f: 85, f2: 45, glide: 0.05, att: 0.002, dur: 0.07, amp: 0.2 + 0.05 * i });
    noiseHit(v, { at: at + d, type: 'lowpass', f: 900, att: 0.002, dur: 0.05, amp: 0.15 });
  });
}

function sputter(v, at) {
  noiseHit(v, { at, type: 'lowpass', f: 600, att: 0.003, dur: 0.06, amp: 0.3 });
  noiseHit(v, { at: at + 0.17, type: 'lowpass', f: 450, att: 0.003, dur: 0.05, amp: 0.18 });
  toneHit(v, { at, f: 70, f2: 40, dur: 0.06, amp: 0.25 });
}

// Note: makeContext is for offline previews; the game lets the browser's AudioContext be made here.
export function createAudio(makeContext = null) {
  const S = { ctx: null, ready: false, muted: false, master: 0.5, active: 0, shots: 0, shotSet: new Set(), last: new Map(), engineT: 0, srcs: [], warned: false, makeContext };
  const fail = (err) => {
    if (S.warned) return;
    S.warned = true;
    console.warn('audio: call failed', err);
  };
  const always = (fn) => (...args) => {
    try {
      fn(S, ...args);
    } catch (err) {
      fail(err);
    }
  };
  const ready = (fn) => (...args) => {
    if (!S.ready || !S.ctx) return;
    try {
      fn(S, ...args);
    } catch (err) {
      fail(err);
    }
  };
  return {
    start: always(start),
    setMuted: always(setMuted),
    setMaster: always(setMaster),
    setEngine: ready(setEngine),
    setSkid: ready(setSkid),
    setAmbience: ready(setAmbience),
    setRadio: ready(setRadio),
    radioVoice: ready(radioVoice),
    shot: ready(shot),
    impact: ready(impact),
    explode: ready(explode),
    crash: ready(crash),
    footstep: ready(footstep),
    reload: ready(reload),
    melee: ready(melee),
    ui: ready(ui),
    heartbeat: ready(heartbeat),
    bark: ready(bark),
    crank: ready(crank),
    dispose: always(dispose),
  };
}
