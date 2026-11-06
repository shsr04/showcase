// Note: Garden sound engine; purely procedural WebAudio, no samples, no libraries.

const TAU = Math.PI * 2;
const MASTER = 0.32;
const FLOOR = 0.0001;
const MAX_VOICES = 48;
const AMBIENT_VOICES = 36;
const CTRL_DT = 0.1;
const NOISE_SEC = 8;
const XFADE_SEC = 0.5;
const LOOKAHEAD = 0.3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const sat = (v, d = 0) => clamp(num(v, d), 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const count = (rate, dt) => Math.min(4, Math.floor(Math.max(0, rate) * dt + Math.random()));

function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// Note: C major pentatonic; every pad chord and melody note stays inside it.
const SCALE = [0, 2, 4, 7, 9];
const scaleMidi = (i) => 60 + 12 * Math.floor(i / 5) + SCALE[((i % 5) + 5) % 5];
const NIGHT_NOTES = [81, 84, 86, 88, 91, 93];
const CHORDS = [
  [48, 55, 62, 64],
  [45, 52, 60, 67],
  [50, 57, 64, 67],
  [43, 52, 60, 62],
  [52, 57, 64, 67],
  [48, 55, 64, 69],
];

// Note: partial tables are [ratio, relative gain, relative duration, oscillator type].
const P_SINE = [[1, 1, 1, 'sine']];
const P_BELL = [[1, 1, 1, 'sine'], [2.76, 0.22, 0.4, 'sine'], [5.4, 0.08, 0.18, 'sine']];
const P_PLUCK = [[1, 1, 1, 'sine'], [2, 0.3, 0.45, 'sine'], [3, 0.1, 0.25, 'sine']];
const P_WOOD = [[1, 1, 1, 'sine'], [3.9, 0.35, 0.3, 'sine']];
const P_GLASS = [[1, 1, 1, 'sine'], [2, 0.12, 0.7, 'sine'], [3.01, 0.06, 0.5, 'sine']];

const LIMITS = { step: 0.14, tool: 0.05, sow: 0.12, craft: 0.08, arrive: 0.4, bark: 0.5, chirp: 1.1, cluck: 0.8, baa: 2.5, court: 4, mourn: 6, arrival: 8, splash: 0.7, tier: 0.25, chime: 0.5, horn: 1.5, omen: 8, thunder: 2, calling: 5, bells: 6, spectacle: 4, beacon: 10, visitor: 3, relic: 3, deed: 3, teach: 2 };
const DEFAULT_LIMIT = 0.06;

// Note: one long noise buffer, pink blended with white, with an equal-power loop crossfade.
function makeNoise(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * NOISE_SEC);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    const v = pink * 0.7 + w * 0.3;
    d[i] = v;
    sum += v * v;
  }
  const norm = 0.3 / Math.max(1e-6, Math.sqrt(sum / len));
  for (let i = 0; i < len; i++) d[i] *= norm;
  const x = Math.floor(sr * XFADE_SEC);
  for (let i = 0; i < x; i++) {
    const a = (i / x) * Math.PI * 0.5;
    const j = len - x + i;
    d[j] = d[j] * Math.cos(a) + d[i] * Math.sin(a);
  }
  return buf;
}

// Note: reverb impulse is decaying noise that grows darker over its 3 second tail.
function makeImpulse(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 3.2);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 2.3) * clamp((t - 0.012) / 0.02, 0, 1);
      const coef = lerp(0.55, 0.06, Math.min(1, t / 2.5));
      lp += ((Math.random() * 2 - 1) - lp) * coef;
      d[i] = lp * env * 1.6;
    }
  }
  return buf;
}

export function createAudio() {
  let ctx = null;
  let started = false;
  let muted = false;
  let voices = 0;
  let noise = null;
  let master, comp, mix, bed, send, verb, wet;
  let L = null;

  let clock = 0;
  let ctlAcc = 0;
  let windPh1 = rnd(0, TAU);
  let windPh2 = rnd(0, TAU);
  let burblePh = 0;
  let chordIdx = 0;
  let chordT = 30;
  let melodyIdx = 7;
  let musicAcc = 0;
  let musicGoal = 1;
  let cricketNext = 0;
  const lastEv = Object.create(null);

  // Note: derived targets the per-frame schedulers read; refreshed every control tick.
  const D = {
    zoom: 0.5, day: 1, night: 0, mood: 0.5, musicRate: 0, birdRate: 0, dropRate: 0,
    bubbleRate: 0, crackRate: 0, crackLvl: 0, bellRate: 0, cricketAmp: 0, rain: 0, water: 0, fire: 0,
    birdLvl: 1, rainLvl: 0.4,
  };
  const S = { time: 0.5, wind: 0, rain: 0, snow: 0, mood: 0.5, activity: 0, zoom: 0.5, fire: 0, water: 0, folk: 0 };

  const ready = () => started && ctx && ctx.state === 'running';

  function ease(param, v, tc) {
    param.setTargetAtTime(num(v, 0), ctx.currentTime, tc);
  }

  // Note: routes a voice to the dry bus and optionally a reverb send; adds a panner when needed.
  function route(node, nodes, o) {
    let tail = node;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      tail.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(o.bed ? bed : mix);
    if (o.wet > 0.001) {
      const w = ctx.createGain();
      w.gain.value = o.wet;
      tail.connect(w);
      w.connect(send);
      nodes.push(w);
    }
  }

  function cleanup(nodes) {
    voices = Math.max(0, voices - 1);
    for (const n of nodes) {
      try { n.disconnect(); } catch (e) { /* Note: already disconnected. */ }
    }
  }

  function note(t, f, dur, peak, o = {}) {
    if (!ctx || voices >= (o.bed ? AMBIENT_VOICES : MAX_VOICES)) return;
    f = clamp(num(f, 440), 30, 12000);
    dur = clamp(num(dur, 0.2), 0.03, 8);
    peak = clamp(num(peak, 0.05), FLOOR * 2, 1);
    t = Math.max(num(t, 0), ctx.currentTime);
    const parts = o.parts || P_SINE;
    const att = Math.min(num(o.attack, 0.01), dur * 0.4);
    const out = ctx.createGain();
    const nodes = [out];
    let last = null;
    let lastEnd = 0;
    for (const [ratio, gr, dr, type] of parts) {
      const pf = f * ratio;
      if (pf > 16000) continue;
      const d = dur * dr;
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(pf, t);
      if (o.glide > 0 && o.glide !== 1) osc.frequency.exponentialRampToValueAtTime(clamp(pf * o.glide, 20, 16000), t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(FLOOR, t);
      g.gain.exponentialRampToValueAtTime(Math.max(FLOOR * 2, peak * gr), t + Math.min(att, d * 0.5));
      g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
      osc.connect(g);
      g.connect(out);
      nodes.push(osc, g);
      osc.start(t);
      osc.stop(t + d + 0.05);
      if (t + d >= lastEnd) {
        lastEnd = t + d;
        last = osc;
      }
    }
    if (!last) return;
    route(out, nodes, o);
    voices++;
    last.onended = () => cleanup(nodes);
  }

  function burst(t, dur, peak, o = {}) {
    if (!ctx || voices >= (o.bed ? AMBIENT_VOICES : MAX_VOICES)) return;
    dur = clamp(num(dur, 0.1), 0.01, 3);
    peak = clamp(num(peak, 0.05), FLOOR * 2, 2);
    t = Math.max(num(t, 0), ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const flt = ctx.createBiquadFilter();
    flt.type = o.type || 'bandpass';
    flt.Q.value = num(o.q, 0.8);
    const f0 = clamp(num(o.f0, 1000), 20, 16000);
    const f1 = clamp(num(o.f1, f0), 20, 16000);
    flt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    const att = Math.min(num(o.attack, 0.01), dur * 0.6);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    src.connect(flt);
    flt.connect(g);
    const nodes = [src, flt, g];
    route(g, nodes, o);
    voices++;
    src.onended = () => cleanup(nodes);
    src.start(t, rnd(XFADE_SEC, NOISE_SEC - dur - 0.2), dur + 0.05);
  }

  // Note: tiny filtered click for the fire crackle; shares one persistent highpass.
  function click(t, peak) {
    if (!ctx || voices >= AMBIENT_VOICES) return;
    const d = rnd(0.004, 0.018);
    t = Math.max(num(t, 0), ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(clamp(peak, FLOOR, 1), t + 0.002);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
    src.connect(g);
    g.connect(L.fire.hp);
    const nodes = [src, g];
    voices++;
    src.onended = () => cleanup(nodes);
    src.start(t, rnd(XFADE_SEC, NOISE_SEC - 0.5), d + 0.02);
  }

  function chirp(t, level) {
    if (!ctx || voices >= AMBIENT_VOICES) return;
    const f0 = rnd(2300, 4200);
    const kind = Math.random();
    const syl = [];
    if (kind < 0.4) {
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) syl.push([f0 * rnd(0.95, 1.05), rnd(1.3, 1.6), rnd(0.09, 0.14), rnd(0.06, 0.1)]);
    } else if (kind < 0.75) {
      const n = 4 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) syl.push([f0 * (i % 2 ? 1.12 : 1), 0.9, 0.04, rnd(0.02, 0.03)]);
    } else {
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) syl.push([f0 * 1.3 * (1 - i * 0.06), 0.62, 0.12, rnd(0.05, 0.09)]);
    }
    t = Math.max(num(t, 0), ctx.currentTime);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const g = ctx.createGain();
    g.gain.setValueAtTime(FLOOR, t);
    const peak = clamp(rnd(0.03, 0.055) * level, FLOOR * 2, 0.2);
    let ts = t;
    for (const [f, glide, d, gap] of syl) {
      osc.frequency.setValueAtTime(f, ts);
      osc.frequency.exponentialRampToValueAtTime(clamp(f * glide, 500, 9000), ts + d);
      g.gain.setValueAtTime(FLOOR, ts);
      g.gain.exponentialRampToValueAtTime(peak, ts + 0.008);
      g.gain.exponentialRampToValueAtTime(FLOOR, ts + d);
      ts += d + gap;
    }
    osc.connect(g);
    const nodes = [osc, g];
    route(g, nodes, { pan: rnd(-0.8, 0.8), wet: 0.25, bed: true });
    voices++;
    osc.onended = () => cleanup(nodes);
    osc.start(t);
    osc.stop(ts + 0.05);
  }

  function playMelody(t) {
    const night = D.day < 0.25;
    const lvl = (0.6 + 0.4 * D.mood) * (night ? 0.7 : 1);
    let n = night ? 1 : 1 + ((Math.random() * 3) | 0);
    if (!night && Math.random() < 0.35) n = 1;
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.35, 0.75);
      let midi;
      if (night) {
        midi = pick(NIGHT_NOTES);
      } else {
        const r = Math.random();
        const step = r < 0.15 ? pick([-4, -3, 3, 4]) : pick([-2, -1, -1, 1, 1, 2]);
        melodyIdx = clamp(melodyIdx + step, 0, 14);
        midi = scaleMidi(melodyIdx);
      }
      const bellish = night || Math.random() < 0.3;
      note(at, mtof(midi), night ? rnd(3, 4.5) : rnd(1.6, 3), rnd(0.07, 0.11) * lvl, {
        parts: night ? P_GLASS : bellish ? P_BELL : P_PLUCK,
        attack: night ? 0.03 : 0.008,
        pan: rnd(-0.5, 0.5),
        wet: night ? 0.9 : 0.6,
        bed: true,
      });
    }
  }

  function snowBell(t) {
    note(t, mtof(pick(NIGHT_NOTES) + (Math.random() < 0.4 ? 12 : 0)), rnd(2.5, 4), rnd(0.03, 0.05), {
      parts: P_GLASS, attack: 0.02, pan: rnd(-0.7, 0.7), wet: 0.9, bed: true,
    });
  }

  function retuneChord() {
    let next = chordIdx;
    while (next === chordIdx) next = (Math.random() * CHORDS.length) | 0;
    chordIdx = next;
    const chord = CHORDS[chordIdx];
    L.pad.osc.forEach((o, i) => {
      ease(o.frequency, mtof(chord[i]), 3.5);
      ease(o.detune, rnd(-9, 9), 3.5);
    });
  }

  function buildLayers() {
    const nsrc = (loopStart = true) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.loopStart = XFADE_SEC;
      s.loopEnd = noise.duration;
      if (loopStart) s.start(0, rnd(XFADE_SEC, NOISE_SEC - 0.5));
      return s;
    };
    const filt = (type, f, q) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const gain = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const lay = {};

    // Note: wind uses 3 nodes.
    lay.wind = { src: nsrc(), bp: filt('lowpass', 400, 0.5), g: gain(0) };
    lay.wind.src.connect(lay.wind.bp);
    lay.wind.bp.connect(lay.wind.g);
    lay.wind.g.connect(bed);

    // Note: pad uses 6 nodes, four detuned voices into one lowpass.
    const pad = { osc: [], lp: filt('lowpass', 600, 0.3), g: gain(0) };
    const types = ['triangle', 'sine', 'sine', 'triangle'];
    const chord = CHORDS[chordIdx];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = mtof(chord[i]);
      o.detune.value = rnd(-8, 8);
      o.connect(pad.lp);
      o.start(0);
      pad.osc.push(o);
    }
    pad.lp.connect(pad.g);
    pad.g.connect(bed);
    pad.g.connect(send);
    lay.pad = pad;

    // Note: rain uses 4 nodes.
    lay.rain = { src: nsrc(), hp: filt('highpass', 650, 0.5), lp: filt('lowpass', 6000, 0.5), g: gain(0) };
    lay.rain.src.connect(lay.rain.hp);
    lay.rain.hp.connect(lay.rain.lp);
    lay.rain.lp.connect(lay.rain.g);
    lay.rain.g.connect(bed);

    // Note: fire uses 4 nodes; crackle clicks enter through hp.
    lay.fire = { src: nsrc(), lp: filt('lowpass', 150, 0.7), g: gain(0), hp: filt('highpass', 1500, 0.5) };
    lay.fire.src.connect(lay.fire.lp);
    lay.fire.lp.connect(lay.fire.g);
    lay.fire.g.connect(bed);
    lay.fire.hp.connect(bed);

    // Note: water uses 3 nodes.
    lay.water = { src: nsrc(), bp: filt('bandpass', 900, 0.7), g: gain(0) };
    lay.water.src.connect(lay.water.bp);
    lay.water.bp.connect(lay.water.g);
    lay.water.g.connect(bed);

    // Note: crickets use 3 nodes; the gate is pulsed from the scheduler.
    const ck = { a: ctx.createOscillator(), b: ctx.createOscillator(), gate: gain(0) };
    ck.a.type = 'sine';
    ck.b.type = 'sine';
    ck.a.frequency.value = 4250;
    ck.b.frequency.value = 4580;
    ck.a.connect(ck.gate);
    ck.b.connect(ck.gate);
    ck.gate.connect(bed);
    ck.a.start(0);
    ck.b.start(0);
    lay.cricket = ck;
    return lay;
  }

  function start() {
    if (ctx) {
      try {
        if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume();
      } catch (e) { /* Note: resume may reject outside a gesture. */ }
      return;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
    } catch (e) {
      ctx = null;
      return;
    }
    const now = ctx.currentTime;
    noise = makeNoise(ctx);
    master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.012;
    comp.release.value = 0.3;
    mix = ctx.createGain();
    bed = ctx.createGain();
    send = ctx.createGain();
    send.gain.value = 1;
    verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    wet = ctx.createGain();
    wet.gain.value = 0.7;
    bed.connect(mix);
    mix.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    send.connect(verb);
    verb.connect(wet);
    wet.connect(mix);
    L = buildLayers();
    master.gain.setTargetAtTime(muted ? 0 : MASTER, now, 0.6);
    started = true;
    cricketNext = now + 1;
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* Note: resume may reject outside a gesture. */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.08);
  }

  const isMuted = () => muted;

  function applyControls(dt) {
    const { wind, rain, snow, mood, activity, zoom, fire, water } = S;
    const sun = -Math.cos(TAU * S.time);
    const day = smooth(-0.18, 0.35, sun);
    const night = smooth(0.12, -0.4, sun);
    const folkF = Math.min(1, S.folk / 30);
    D.zoom = zoom;
    D.day = day;
    D.night = night;
    D.mood = mood;
    D.rain = rain;
    D.fire = fire;
    D.water = water;

    // Note: gusts are two slow incommensurate sines, evaluated on the control tick.
    windPh1 += dt * TAU * (0.07 + 0.05 * wind);
    windPh2 += dt * TAU * (0.19 + 0.08 * wind);
    const gust = 0.6 * Math.sin(windPh1) + 0.4 * Math.sin(windPh2);
    const wl = (0.3 * Math.pow(smooth(0.3, 0.95, wind), 1.3)) * (1.15 - 0.3 * zoom) * (1 + gust * 0.3 * (0.25 + wind));
    ease(L.wind.g.gain, wl, 0.6);
    ease(L.wind.bp.frequency, clamp(240 + 380 * wind + 120 * (1 - zoom) + gust * 90 * wind, 120, 2400), 0.8);

    const bright = 0.6 * day + 0.4 * mood;
    const breath = 1 + 0.12 * Math.sin(clock * 0.2);
    const pl = 0.02 * (0.55 + 0.45 * day) * (0.75 + 0.35 * mood) * (1 + 0.05 * folkF) * breath;
    ease(L.pad.g.gain, pl, 1.2);
    ease(L.pad.lp.frequency, lerp(240, 1500, bright), 1.5);
    chordT -= dt;
    if (chordT <= 0) {
      chordT = rnd(25, 45);
      retuneChord();
    }

    ease(L.rain.g.gain, 0.6 * Math.pow(rain, 1.2) * (0.7 + 0.3 * zoom), 0.8);
    ease(L.rain.lp.frequency, 3800 + 3200 * zoom, 1);

    const fl = clamp(fire * 1.5, 0, 1) * (0.5 + 0.5 * zoom);
    ease(L.fire.g.gain, 1.6 * Math.pow(fire, 0.9) * (0.5 + 0.5 * zoom), 0.5);
    ease(L.fire.lp.frequency, 130 + 90 * fire, 0.8);

    burblePh += dt * TAU * 0.7;
    const wlv = 0.2 * Math.pow(water, 1.4) * zoom * zoom;
    ease(L.water.g.gain, wlv * (1 + 0.25 * Math.sin(burblePh)), 0.25);
    ease(L.water.bp.frequency, 650 + 800 * water + 200 * Math.sin(burblePh * 1.7), 0.4);

    ease(bed.gain, 1 - 0.2 * snow, 1.5);

    const calm = 1 - 0.6 * rain;
    D.musicRate = (0.5 + day * (1 + 7 * mood) * (0.8 + 0.4 * activity)) * calm;
    D.birdRate = 10 * day * (0.5 + 0.5 * Math.exp(-Math.pow((S.time - 0.29) / 0.09, 2)) + 0.3 * Math.exp(-Math.pow((S.time - 0.7) / 0.06, 2))) *
      (1 - rain) * (1 - 0.8 * snow) * (1 - 0.5 * wind) * (0.5 + 0.5 * mood) * (1 - 0.3 * activity);
    D.dropRate = rain * 9;
    D.bubbleRate = water * 6 * (0.4 + 0.6 * zoom);
    D.crackRate = fire > 0.02 ? 3 + 22 * fire : 0;
    D.crackLvl = fl;
    D.bellRate = (snow * 5) / 60;
    D.cricketAmp = 0.022 * night * (1 - rain) * (1 - snow) * (1 - 0.5 * wind);
    D.birdLvl = 0.6 + 0.4 * zoom;
    D.rainLvl = 0.4 + 0.6 * rain;
  }

  function schedule(dt) {
    const now = ctx.currentTime;
    const at = () => now + rnd(0.005, 0.04);

    musicAcc += (dt * D.musicRate) / 60;
    if (musicAcc >= musicGoal) {
      musicAcc = 0;
      musicGoal = rnd(0.6, 1.4);
      playMelody(at());
    }
    for (let i = count(D.birdRate / 60, dt); i > 0; i--) chirp(at() + rnd(0, 0.2), D.birdLvl);
    for (let i = count(D.dropRate, dt); i > 0; i--) {
      const big = Math.random() < 0.15;
      note(at(), big ? rnd(1000, 1800) : rnd(2200, 5200), big ? 0.07 : 0.04, rnd(0.008, 0.02) * D.rainLvl, {
        attack: 0.003, glide: 0.7, pan: rnd(-0.7, 0.7), wet: 0.25, bed: true,
      });
    }
    for (let i = count(D.bubbleRate, dt); i > 0; i--) {
      note(at(), rnd(400, 1100), 0.09, rnd(0.01, 0.025) * (0.4 + 0.6 * D.water), {
        attack: 0.01, glide: 1.8, pan: rnd(-0.6, 0.6), wet: 0.25, bed: true,
      });
    }
    if (D.crackRate > 0) {
      for (let i = count(D.crackRate, dt); i > 0; i--) {
        const r = Math.random();
        click(at(), (0.03 + 0.12 * r * r) * D.crackLvl * 3);
      }
    }
    for (let i = count(D.bellRate, dt); i > 0; i--) snowBell(at());

    if (D.cricketAmp < 0.0008) {
      cricketNext = Math.max(cricketNext, now + 0.3);
    } else {
      if (cricketNext < now) cricketNext = now + 0.02;
      const g = L.cricket.gate.gain;
      for (let guard = 0; cricketNext < now + LOOKAHEAD && guard < 4; guard++) {
        const n = 3 + ((Math.random() * 2) | 0);
        const amp = D.cricketAmp * rnd(0.75, 1);
        let t = cricketNext;
        for (let i = 0; i < n; i++) {
          g.setValueAtTime(0, t);
          g.linearRampToValueAtTime(amp, t + 0.006);
          g.linearRampToValueAtTime(amp * 0.9, t + 0.022);
          g.linearRampToValueAtTime(0, t + 0.032);
          t += 0.05;
        }
        cricketNext = t + rnd(0.35, 0.7);
      }
    }
  }

  function update(dt, c) {
    if (!ready()) return;
    dt = clamp(num(dt, 0), 0, 0.25);
    c = c || {};
    const tm = num(c.time, S.time);
    S.time = ((tm % 1) + 1) % 1;
    S.wind = sat(c.wind, 0);
    S.rain = sat(c.rain, 0);
    S.snow = sat(c.snow, 0);
    S.mood = sat(c.mood, 0.5);
    S.activity = sat(c.activity, 0);
    S.zoom = sat(c.zoom, 0.5);
    S.fire = sat(c.fire, 0);
    S.water = sat(c.water, 0);
    S.folk = clamp(Math.floor(num(c.folk, 0)), 0, 100000);
    clock += dt;
    ctlAcc += dt;
    if (ctlAcc >= CTRL_DT || clock <= dt) {
      applyControls(ctlAcc);
      ctlAcc = 0;
    }
    schedule(dt);
  }

  // Note: each entry gets (start time, gain, pitch ratio, pan).
  const EV = {
    dig(t, g, p, pan) {
      burst(t, 0.22, 1.2 * g, { type: 'lowpass', f0: 260 * p, f1: 110 * p, q: 0.7, attack: 0.012, pan, wet: 0.12 });
      note(t, 95 * p, 0.26, 0.4 * g, { glide: 0.6, pan, wet: 0.1 });
      for (let i = 0; i < 5; i++) {
        burst(t + 0.05 + i * 0.035 + rnd(0, 0.02), 0.05, rnd(0.2, 0.4) * g, { f0: rnd(1400, 2600), q: 1.2, attack: 0.004, pan });
      }
    },
    raise(t, g, p, pan) {
      note(t, 62 * p, 1.3, 0.3 * g, { glide: 1.9, attack: 0.55, parts: [[1, 1, 1, 'sine'], [2, 0.35, 0.8, 'triangle']], pan, wet: 0.3 });
      burst(t, 1.2, 1.4 * g, { type: 'lowpass', f0: 140 * p, f1: 520 * p, q: 0.7, attack: 0.6, pan, wet: 0.25 });
    },
    water(t, g, p, pan) {
      burst(t, 0.55, 0.9 * g, { f0: 900 * p, f1: 1600 * p, q: 0.7, attack: 0.07, pan, wet: 0.25 });
      for (let i = 0; i < 4; i++) {
        note(t + 0.05 + i * rnd(0.05, 0.1), rnd(500, 1200) * p, 0.09, 0.05 * g, { glide: 1.8, pan, wet: 0.3 });
      }
    },
    fire(t, g, p, pan) {
      burst(t, 0.8, 1.2 * g, { f0: 400 * p, f1: 1400 * p, q: 0.6, attack: 0.28, pan, wet: 0.15 });
      for (let i = 0; i < 7; i++) {
        burst(t + 0.2 + i * rnd(0.05, 0.1), 0.02, rnd(0.2, 0.5) * g, { type: 'highpass', f0: rnd(2200, 3500), q: 0.5, attack: 0.003, pan });
      }
    },
    sow(t, g, p, pan) {
      for (let i = 0; i < 7; i++) {
        burst(t + i * rnd(0.03, 0.07), 0.025, rnd(0.2, 0.4) * g, { f0: rnd(3500, 5000) * p, q: 1.5, attack: 0.004, pan, wet: 0.1 });
      }
    },
    clear(t, g, p, pan) {
      burst(t, 0.38, 0.9 * g, { f0: 2200 * p, f1: 1400 * p, q: 0.8, attack: 0.06, pan, wet: 0.1 });
      burst(t + 0.12, 0.3, 0.6 * g, { f0: 1500 * p, f1: 2200 * p, q: 0.8, attack: 0.05, pan, wet: 0.1 });
    },
    rain(t, g, p, pan) {
      burst(t, 2.2, 0.8 * g, { f0: 3000 * p, q: 0.5, attack: 1, pan, wet: 0.3 });
      for (let i = 0; i < 8; i++) {
        note(t + rnd(0.2, 1.8), rnd(2200, 5000) * p, 0.05, rnd(0.015, 0.03) * g, { glide: 0.7, attack: 0.003, pan: rnd(-0.7, 0.7), wet: 0.3 });
      }
    },
    wind(t, g, p, pan) {
      burst(t, 2.4, 1.6 * g, { f0: 300 * p, f1: 800 * p, q: 0.6, attack: 1, pan, wet: 0.3 });
    },
    sun(t, g, p, pan) {
      [79, 84, 88, 91, 96].forEach((m, i) => {
        note(t + i * 0.08, mtof(m) * p, 1.8, 0.05 * g, { parts: P_BELL, attack: 0.02, pan, wet: 0.6 });
      });
    },
    snow(t, g, p, pan) {
      burst(t, 1.5, 0.5 * g, { f0: 5000 * p, f1: 3000 * p, q: 0.6, attack: 0.5, pan, wet: 0.4 });
      note(t + 0.3, mtof(96) * p, 2.6, 0.06 * g, { parts: P_GLASS, attack: 0.01, pan, wet: 0.8 });
    },
    build(t, g, p, pan) {
      for (let i = 0; i < 2; i++) {
        const k = i ? 0.6 : 1;
        note(t + i * 0.09, 330 * p, 0.09, 0.28 * g * k, { glide: 0.55, pan, wet: 0.08 });
        burst(t + i * 0.09, 0.025, 0.7 * g * k, { f0: 1200 * p, q: 1.2, attack: 0.002, pan });
      }
    },
    built(t, g, p, pan) {
      [64, 69].forEach((m, i) => {
        note(t + i * 0.14, mtof(m) * p, 0.7, 0.14 * g, { parts: P_WOOD, attack: 0.004, pan, wet: 0.35 });
      });
    },
    // Note: one soft bell, pitch ratio p rises with the tier; a quiet octave shimmer on top.
    tier(t, g, p, pan) {
      note(t, mtof(76) * p, 0.9, 0.09 * g, { parts: P_BELL, attack: 0.006, pan, wet: 0.5 });
      note(t + 0.07, mtof(88) * p, 0.6, 0.03 * g, { parts: P_GLASS, attack: 0.01, pan, wet: 0.6 });
    },
    craft(t, g, p, pan) {
      note(t, 2400 * p, 0.28, 0.07 * g, { parts: [[1, 1, 1, 'sine'], [2.76, 0.6, 0.6, 'sine']], attack: 0.002, pan, wet: 0.3 });
      burst(t, 0.012, 0.5 * g, { type: 'highpass', f0: 4000, q: 0.5, attack: 0.002, pan });
    },
    born(t, g, p, pan) {
      [72, 76, 79].forEach((m, i) => {
        note(t + i * 0.11, mtof(m) * p, 1.2, 0.11 * g, { parts: P_BELL, attack: 0.006, pan, wet: 0.45 });
      });
    },
    court(t, g, p, pan) {
      [76, 83].forEach((m, i) => note(t + i * 0.22, mtof(m) * p, 0.9, 0.07 * g, { parts: P_BELL, attack: 0.008, pan, wet: 0.45 }));
    },
    mourn(t, g, p, pan) {
      note(t, mtof(48) * p, 2.6, 0.12 * g, { parts: P_BELL, attack: 0.02, pan, wet: 0.6 });
      note(t + 0.9, mtof(43) * p, 3, 0.09 * g, { parts: P_BELL, attack: 0.02, pan, wet: 0.6 });
    },
    arrive(t, g, p, pan) {
      burst(t, 0.95, 1 * g, { f0: 600 * p, f1: 2400 * p, q: 0.6, attack: 0.3, pan, wet: 0.4 });
      note(t + 0.35, mtof(84) * p, 1.4, 0.08 * g, { parts: P_BELL, pan, wet: 0.5 });
      note(t + 0.5, mtof(91) * p, 1.4, 0.06 * g, { parts: P_BELL, pan, wet: 0.5 });
    },
    // Note: a short hopeful tune for a landing balloon: rising pentatonic bells over a held glass chord.
    arrival(t, g, p, pan) {
      const tune = [[72, 0], [76, 0.3], [79, 0.6], [83, 0.95], [81, 1.35], [84, 1.7], [88, 2.2]];
      tune.forEach(([m, dt], i) => note(t + dt, mtof(m) * p, i === tune.length - 1 ? 2.8 : 1.3, 0.085 * g, { parts: P_BELL, attack: 0.01, pan, wet: 0.55 }));
      [60, 67, 72].forEach((m) => note(t + 0.1, mtof(m) * p, 3.6, 0.04 * g, { parts: P_GLASS, attack: 0.5, pan, wet: 0.7 }));
    },
    splash(t, g, p, pan) {
      burst(t, 0.16, 0.45 * g, { type: 'bandpass', f0: 1800 * p, f1: 900 * p, q: 0.8, attack: 0.01, pan, wet: 0.3 });
      note(t + 0.02, rnd(700, 1000) * p, 0.1, 0.04 * g, { glide: 1.7, attack: 0.004, pan, wet: 0.35 });
    },
    bark(t, g, p, pan) {
      for (let i = 0; i < 2; i++) {
        const k = i ? 0.75 : 1;
        note(t + i * 0.2, 340 * p * (i ? 0.92 : 1), 0.13, 0.2 * g * k, { glide: 0.55, attack: 0.008, parts: [[1, 1, 1, 'triangle'], [2, 0.4, 0.6, 'sine']], pan, wet: 0.25 });
        burst(t + i * 0.2, 0.09, 0.5 * g * k, { type: 'bandpass', f0: 900 * p, f1: 500 * p, q: 1.1, attack: 0.006, pan, wet: 0.2 });
      }
    },
    chirp(t, g, p, pan) {
      const n = 2 + Math.floor(rnd(0, 3));
      for (let i = 0; i < n; i++) {
        note(t + i * rnd(0.08, 0.13), rnd(2600, 3800) * p, 0.07, 0.035 * g, { glide: rnd(0.8, 1.35), attack: 0.004, pan, wet: 0.3 });
      }
    },
    cluck(t, g, p, pan) {
      const n = 2 + Math.floor(rnd(0, 3));
      for (let i = 0; i < n; i++) {
        note(t + i * rnd(0.09, 0.14), rnd(520, 760) * p, 0.06, 0.05 * g, { glide: rnd(1.1, 1.5), attack: 0.004, parts: [[1, 1, 1, 'triangle'], [2, 0.3, 0.5, 'sine']], pan, wet: 0.2 });
      }
    },
    baa(t, g, p, pan) {
      note(t, 230 * p, 0.7, 0.07 * g, { glide: 0.88, attack: 0.05, parts: [[1, 1, 1, 'sawtooth'], [2, 0.4, 0.8, 'triangle'], [3, 0.3, 0.5, 'sine']], pan, wet: 0.3 });
    },
    pass(t, g, p, pan) {
      [79, 76, 72, 67].forEach((m, i) => {
        note(t + i * 0.55, mtof(m) * p, 2.4, 0.1 * g, { parts: P_GLASS, attack: 0.04, pan, wet: 0.7 });
      });
    },
    discover(t, g, p, pan) {
      [60, 62, 64, 67, 69, 72, 74, 76, 79].forEach((m, i) => {
        note(t + i * 0.1, mtof(m) * p, 1.8, (0.06 + i * 0.006) * g, { parts: P_BELL, attack: 0.012, pan, wet: 0.65 });
      });
      note(t + 0.95, mtof(84) * p, 2.6, 0.08 * g, { parts: P_GLASS, attack: 0.02, pan, wet: 0.8 });
    },
    invent(t, g, p, pan) {
      [72, 76, 79, 84, 88, 91].forEach((m, i) => {
        note(t + i * 0.07, mtof(m) * p, 1.2, 0.07 * g, { parts: P_BELL, attack: 0.004, pan, wet: 0.55 });
      });
    },
    festival(t, g, p, pan) {
      [67, 72, 76, 79, 84, 79, 76, 88].forEach((m, i) => {
        note(t + i * 0.16, mtof(m) * p, 1.6, 0.08 * g, { parts: P_BELL, attack: 0.008, pan, wet: 0.55 });
      });
      [48, 55].forEach((m) => note(t, mtof(m) * p, 2.2, 0.06 * g, { parts: P_GLASS, attack: 0.05, pan, wet: 0.6 }));
    },
    // Note: Great Work stage chime; pitch p climbs with the stage so six stages make a rising scale.
    chime(t, g, p, pan) {
      [0, 7, 12].forEach((m, i) => note(t + i * 0.12, mtof(67 + m) * p, 2.4, (0.1 - i * 0.02) * g, { parts: P_BELL, attack: 0.006, pan, wet: 0.7 }));
      note(t, mtof(55) * p, 3, 0.07 * g, { parts: P_GLASS, attack: 0.08, pan, wet: 0.7 });
    },
    // Note: low airship horn: two stacked saw-triangle notes with a slow glide and breath noise.
    horn(t, g, p, pan) {
      const parts = [[1, 1, 1, 'sawtooth'], [2, 0.3, 0.9, 'triangle'], [3, 0.15, 0.7, 'sine']];
      note(t, 110 * p, 1.5, 0.1 * g, { parts, attack: 0.12, glide: 0.94, pan, wet: 0.45 });
      note(t + 0.02, 165 * p, 1.4, 0.07 * g, { parts, attack: 0.14, glide: 0.95, pan, wet: 0.45 });
      burst(t, 1.1, 0.4 * g, { type: 'lowpass', f0: 500 * p, f1: 300 * p, q: 0.6, attack: 0.2, pan, wet: 0.3 });
    },
    // Note: omen cue: a low drone that swells and fades, with a faint glass fifth; bounded to a few seconds.
    omen(t, g, p, pan) {
      note(t, 55 * p, 6, 0.12 * g, { parts: [[1, 1, 1, 'sine'], [2, 0.4, 0.9, 'triangle']], attack: 2.4, glide: 1.03, pan, wet: 0.7 });
      note(t + 0.6, 82.5 * p, 5, 0.06 * g, { parts: P_GLASS, attack: 2, pan, wet: 0.8 });
      burst(t, 5, 0.5 * g, { type: 'lowpass', f0: 180 * p, f1: 320 * p, q: 0.5, attack: 2.4, pan, wet: 0.5 });
    },
    thunder(t, g, p, pan) {
      burst(t, 2.2, 2 * g, { type: 'lowpass', f0: 240 * p, f1: 70 * p, q: 0.7, attack: 0.08, pan, wet: 0.5 });
      note(t, 48 * p, 1.8, 0.2 * g, { glide: 0.6, attack: 0.05, pan, wet: 0.4 });
    },
    // Note: lost child call: a thin two-note falling voice, repeated once.
    calling(t, g, p, pan) {
      [0, 1.1].forEach((d) => {
        note(t + d, 740 * p, 0.5, 0.06 * g, { glide: 0.8, attack: 0.05, parts: [[1, 1, 1, 'triangle'], [2, 0.25, 0.7, 'sine']], pan, wet: 0.7 });
        note(t + d + 0.35, 620 * p, 0.7, 0.05 * g, { glide: 0.78, attack: 0.05, parts: [[1, 1, 1, 'triangle'], [2, 0.25, 0.7, 'sine']], pan, wet: 0.7 });
      });
    },
    bells(t, g, p, pan) {
      [72, 76, 79, 76, 84, 79, 88].forEach((m, i) => note(t + i * 0.2, mtof(m) * p, 1.8, 0.07 * g, { parts: P_BELL, attack: 0.006, pan, wet: 0.65 }));
    },
    // Note: sky spectacle cue: a long glass swell on a fifth; p shifts the mood.
    spectacle(t, g, p, pan) {
      [60, 67, 74, 79].forEach((m, i) => note(t + i * 0.35, mtof(m) * p, 4.5, 0.05 * g, { parts: P_GLASS, attack: 1.2, pan, wet: 0.85 }));
    },
    // Note: Great Work beacon: a broad rising chord of bells under a long swell.
    beacon(t, g, p, pan) {
      [48, 55, 60, 64, 67, 72, 76, 79, 84].forEach((m, i) => note(t + i * 0.18, mtof(m) * p, 3.4, (0.07 + i * 0.004) * g, { parts: P_BELL, attack: 0.01, pan, wet: 0.8 }));
      note(t + 0.4, mtof(36) * p, 5, 0.12 * g, { parts: [[1, 1, 1, 'sine'], [2, 0.3, 0.9, 'triangle']], attack: 1.8, pan, wet: 0.6 });
    },
    visitor(t, g, p, pan) {
      [67, 71, 74, 79].forEach((m, i) => note(t + i * 0.13, mtof(m) * p, 1.3, 0.06 * g, { parts: P_WOOD, attack: 0.006, pan, wet: 0.45 }));
    },
    relic(t, g, p, pan) {
      burst(t, 1.6, 1 * g, { f0: 300 * p, f1: 2200 * p, q: 0.7, attack: 0.9, pan, wet: 0.5 });
      [60, 67, 72, 76, 84].forEach((m, i) => note(t + 0.5 + i * 0.14, mtof(m) * p, 2.2, 0.07 * g, { parts: P_GLASS, attack: 0.02, pan, wet: 0.8 }));
    },
    deed(t, g, p, pan) {
      [55, 62, 67].forEach((m, i) => note(t + i * 0.3, mtof(m) * p, 2.8, 0.08 * g, { parts: P_BELL, attack: 0.02, pan, wet: 0.7 }));
    },
    teach(t, g, p, pan) {
      [76, 79].forEach((m, i) => note(t + i * 0.12, mtof(m) * p, 1, 0.05 * g, { parts: P_PLUCK, attack: 0.004, pan, wet: 0.4 }));
    },
    link(t, g, p, pan) {
      burst(t, 0.4, 1.2 * g, { f0: 330 * p, f1: 480 * p, q: 8, attack: 0.08, pan, wet: 0.1 });
      note(t + 0.3, mtof(79) * p, 1, 0.08 * g, { parts: P_BELL, pan, wet: 0.45 });
    },
    undo(t, g, p, pan) {
      note(t, 1200 * p, 0.05, 0.1 * g, { glide: 0.58, attack: 0.004, pan });
      burst(t, 0.07, 0.5 * g, { f0: 3000 * p, q: 1, attack: 0.06, pan });
    },
    tool(t, g, p, pan) {
      note(t, 900 * p, 0.03, 0.1 * g, { attack: 0.002, pan });
      note(t, 1350 * p, 0.03, 0.05 * g, { attack: 0.002, pan });
    },
    step(t, g, p, pan) {
      const j = rnd(0.9, 1.1);
      burst(t, 0.07, 0.8 * g, { type: 'lowpass', f0: 420 * p * j, q: 0.7, attack: 0.006, pan });
      note(t, 70 * p * j, 0.09, 0.05 * g, { attack: 0.005, pan });
    },
  };

  function event(name, opts) {
    if (!ready()) return;
    const fn = EV[name];
    if (typeof fn !== 'function') return;
    const now = ctx.currentTime;
    const gap = LIMITS[name] || DEFAULT_LIMIT;
    if (lastEv[name] !== undefined && now - lastEv[name] < gap) return;
    lastEv[name] = now;
    const o = opts || {};
    const g = clamp(num(o.gain, 1), 0, 1.5);
    if (g <= 0) return;
    const p = clamp(num(o.pitch, 1), 0.25, 4);
    const pan = clamp(num(o.pan, 0), -1, 1);
    fn(now + 0.005, g, p, pan);
  }

  function dispose() {
    const c = ctx;
    ctx = null;
    started = false;
    L = null;
    voices = 0;
    clock = 0;
    ctlAcc = 0;
    musicAcc = 0;
    for (const k of Object.keys(lastEv)) delete lastEv[k];
    if (c) {
      try {
        const p = c.close();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* Note: context may already be closed. */ }
    }
  }

  return { start, setMuted, isMuted, update, event, dispose };
}
