// Note: procedural menu sounds for the campaign screens; no files, no network, and nothing is built before the first gesture.

import { blipsFor, voiceFor, lineSeconds } from '../blips.js';

export const JITTER = 0.06;
export const MAX_VOICES = 8;
export const MUTE_KEY = 'ws.menusfx.muted';
// Note: item 448: while the draw-last warp runs the cues sound slowed: lower and longer, behind a closing low-pass; warp is the opponent's speed, 1 when there is none.
export const warpRate = (warp) => 0.5 + 0.5 * Math.min(1, Math.max(0, warp));
export const warpCut = (warp) => Math.max(1200, 20000 * Math.min(1, Math.max(0, warp)) ** 1.5);
const MASTER = 0.5;

// Note: one factor in [1 - JITTER, 1 + JITTER] from a rand() in [0, 1).
export const jitterOf = (rand) => 1 + (rand() * 2 - 1) * JITTER;

// Note: dur is the length of the whole cue in seconds, gap the shortest time between two plays of it; s is the synth bound to one play.

const BELL_PARTIALS = [[1, 0.42, 1], [2, 0.26, 0.72], [2.4, 0.16, 0.55], [3, 0.1, 0.42], [4.2, 0.06, 0.3]];

function bell(s, f, len, gain) {
  for (const [r, g, d] of BELL_PARTIALS) s.tone({ f0: f * r, dur: len * d, gain: gain * g });
  s.noise({ type: 'bandpass', f0: 2000, q: 2, dur: 0.02, gain: gain * 0.35 });
}

export const CUES = {
  tick: {
    dur: 0.03, gap: 0.05, what: 'hover over a control',
    build: (s) => s.noise({ type: 'bandpass', f0: 4200, q: 8, dur: 0.012, gain: 0.07 }),
  },
  click: {
    dur: 0.1, gap: 0.03, what: 'press of a button: a wooden latch',
    build(s) {
      s.noise({ type: 'bandpass', f0: 1800, f1: 1100, q: 3, dur: 0.035, gain: 0.55 });
      s.tone({ f0: 140, f1: 70, dur: 0.07, gain: 0.5 });
      s.noise({ type: 'bandpass', f0: 2600, q: 5, dur: 0.02, gain: 0.25, at: 0.05 });
    },
  },
  tab: {
    dur: 0.2, gap: 0.06, what: 'a page or tab slides over',
    build(s) {
      s.noise({ type: 'bandpass', f0: 1400, f1: 3200, q: 0.8, dur: 0.14, gain: 0.28, attack: 0.04 });
      s.tone({ f0: 110, f1: 80, dur: 0.06, gain: 0.25, at: 0.11 });
    },
  },
  open: {
    dur: 0.3, gap: 0.12, what: 'a dialog opens: a cabinet door',
    build(s) {
      s.noise({ type: 'bandpass', f0: 2200, q: 3, dur: 0.02, gain: 0.3 });
      s.tone({ f0: 95, f1: 48, dur: 0.22, gain: 0.7 });
      s.noise({ type: 'lowpass', f0: 600, f1: 200, dur: 0.18, gain: 0.45 });
    },
  },
  close: {
    dur: 0.25, gap: 0.12, what: 'a dialog closes',
    build(s) {
      s.tone({ f0: 80, f1: 40, dur: 0.16, gain: 0.65 });
      s.noise({ type: 'lowpass', f0: 500, f1: 160, dur: 0.12, gain: 0.4 });
      s.noise({ type: 'bandpass', f0: 1900, q: 4, dur: 0.025, gain: 0.3, at: 0.09 });
    },
  },
  stamp: {
    dur: 0.4, gap: 0.15, what: 'a rubber stamp on paper: ACCEPTED',
    build(s) {
      s.noise({ type: 'bandpass', f0: 3000, q: 2, dur: 0.03, gain: 0.25 });
      s.tone({ f0: 70, f1: 38, dur: 0.3, gain: 0.8 });
      s.noise({ type: 'lowpass', f0: 900, f1: 150, dur: 0.22, gain: 0.55 });
      s.tone({ f0: 55, f1: 40, dur: 0.1, gain: 0.3, at: 0.12 });
    },
  },
  coin: {
    dur: 0.35, gap: 0.05, what: 'coins',
    build(s) {
      s.tone({ f0: 2350, dur: 0.22, gain: 0.22 });
      s.tone({ f0: 3520, dur: 0.18, gain: 0.12 });
      s.tone({ f0: 2790, dur: 0.25, gain: 0.2, at: 0.07 });
      s.tone({ f0: 4180, dur: 0.15, gain: 0.1, at: 0.07 });
      s.noise({ type: 'highpass', f0: 6000, q: 0.7, dur: 0.03, gain: 0.08 });
    },
  },
  purchase: {
    dur: 0.5, gap: 0.1, what: 'a cash drawer',
    build(s) {
      s.noise({ type: 'bandpass', f0: 900, q: 2, dur: 0.08, gain: 0.35 });
      s.tone({ f0: 120, f1: 70, dur: 0.1, gain: 0.4, at: 0.02 });
      s.tone({ f0: 2093, dur: 0.35, gain: 0.22, at: 0.09 });
      s.tone({ f0: 3136, dur: 0.3, gain: 0.14, at: 0.09 });
    },
  },
  seal: {
    dur: 0.3, gap: 0.12, what: 'wax pressed under a seal',
    build(s) {
      s.noise({ type: 'lowpass', f0: 500, f1: 250, q: 1.5, dur: 0.14, gain: 0.5, attack: 0.03 });
      s.tone({ f0: 160, f1: 90, dur: 0.16, gain: 0.35 });
      s.noise({ type: 'bandpass', f0: 2400, q: 5, dur: 0.02, gain: 0.3, at: 0.15 });
    },
  },
  key: {
    dur: 0.05, gap: 0.045, what: 'a telegraph key',
    build(s) {
      s.noise({ type: 'bandpass', f0: 3800, q: 6, dur: 0.012, gain: 0.25 });
      s.tone({ f0: 900, f1: 600, dur: 0.015, gain: 0.1 });
    },
  },
  horse: {
    dur: 0.75, gap: 0.5, what: 'hoofbeats',
    build(s) {
      for (const at of [0, 0.17, 0.4, 0.57]) {
        const v = s.vary();
        s.tone({ f0: 210 * v, f1: 120 * v, dur: 0.06, gain: 0.5, at });
        s.noise({ type: 'bandpass', f0: 700 * v, q: 2, dur: 0.05, gain: 0.45, at });
      }
    },
  },
  bell: {
    dur: 2.2, gap: 0.6, what: 'a station bell at dawn',
    build: (s) => bell(s, 392, 2.2, 0.8),
  },
  deny: {
    dur: 0.22, gap: 0.1, what: 'a dull knock: not possible',
    build(s) {
      s.tone({ f0: 130, f1: 90, dur: 0.09, gain: 0.55 });
      s.noise({ type: 'lowpass', f0: 700, dur: 0.06, gain: 0.35 });
      s.tone({ f0: 110, f1: 80, dur: 0.09, gain: 0.45, at: 0.1 });
    },
  },
  toll: {
    dur: 3, gap: 1, what: 'a single low bell for the dead',
    build(s) {
      bell(s, 196, 3, 0.8);
      s.tone({ f0: 98, dur: 3, gain: 0.3 });
      s.noise({ type: 'lowpass', f0: 900, dur: 0.05, gain: 0.35 });
    },
  },
  victory: {
    dur: 0.75, gap: 0.5, what: 'two soft tones',
    build(s) {
      s.tone({ f0: 523.25, dur: 0.22, gain: 0.3, type: 'triangle' });
      s.tone({ f0: 1046.5, dur: 0.18, gain: 0.07 });
      s.tone({ f0: 659.25, dur: 0.5, gain: 0.34, type: 'triangle', at: 0.18 });
      s.tone({ f0: 1318.5, dur: 0.4, gain: 0.08, at: 0.18 });
    },
  },
  hurt: {
    dur: 0.2, gap: 0.08, what: 'a dull thud',
    build(s) {
      s.tone({ f0: 90, f1: 45, dur: 0.16, gain: 0.7 });
      s.noise({ type: 'lowpass', f0: 400, dur: 0.1, gain: 0.5 });
    },
  },
  // Note: the cues of the staged scenes (items 329 and 338); the town cues grow with the size of the place (item 336).
  pin: {
    dur: 0.35, gap: 0.2, what: 'a badge pinned on: a pin through cloth and a metal click',
    build(s) {
      s.noise({ type: 'bandpass', f0: 1500, f1: 900, q: 1.2, dur: 0.08, gain: 0.3 });
      s.noise({ type: 'bandpass', f0: 5200, q: 9, dur: 0.015, gain: 0.45, at: 0.1 });
      s.tone({ f0: 3100, dur: 0.12, gain: 0.12, at: 0.1 });
      s.tone({ f0: 4650, dur: 0.08, gain: 0.06, at: 0.1 });
    },
  },
  swear: {
    dur: 2.2, gap: 0.8, what: 'a courthouse bell for a swearing in',
    build: (s) => bell(s, 523.25, 2.2, 0.6),
  },
  star: {
    dur: 1.4, gap: 0.8, what: 'the star passes: a bright struck chord',
    build(s) {
      for (const [f, at] of [[392, 0], [493.88, 0.08], [587.33, 0.16], [783.99, 0.24]]) s.tone({ f0: f, dur: 1.1, gain: 0.18, type: 'triangle', at });
      s.noise({ type: 'bandpass', f0: 5200, q: 9, dur: 0.02, gain: 0.3, at: 0.24 });
    },
  },
  shot: {
    dur: 0.6, gap: 0.08, reverb: true, what: 'a revolver shot in the street',
    build(s) {
      s.noise({ type: 'lowpass', f0: 3800, f1: 300, dur: 0.35, gain: 0.95 });
      s.tone({ f0: 110, f1: 40, dur: 0.25, gain: 0.8 });
    },
  },
  echo: {
    dur: 4, gap: 2, reverb: true, what: 'the nemesis falls: one echoing shot fading into wind',
    build(s) {
      s.noise({ type: 'lowpass', f0: 3600, f1: 250, dur: 0.4, gain: 0.95 });
      s.tone({ f0: 100, f1: 38, dur: 0.3, gain: 0.8 });
      for (const at of [0.45, 0.95]) s.noise({ type: 'lowpass', f0: 1400, f1: 200, dur: 0.4, gain: 0.25, at });
      s.noise({ type: 'bandpass', f0: 420, f1: 260, q: 0.6, dur: 3, gain: 0.3, at: 0.8, attack: 1 });
    },
  },
  wind: {
    dur: 4, gap: 3.2, what: 'wind down an empty street',
    build(s) {
      // Note: a soft low rumble that swells and fades, with a faint airy layer; no narrow band, so nothing whistles or hisses.
      s.noise({ type: 'lowpass', f0: 260, f1: 380, q: 0.4, dur: 4, gain: 0.4, attack: 1.8 });
      s.noise({ type: 'lowpass', f0: 520, f1: 420, q: 0.3, dur: 3.6, gain: 0.06, at: 0.6, attack: 1.6 });
    },
  },
  brass: {
    dur: 3, gap: 2, what: 'the win: a short warm brass and guitar phrase',
    build(s) {
      const notes = [[261.63, 0, 0.5], [329.63, 0.45, 0.5], [392, 0.9, 0.5], [523.25, 1.35, 1.5]];
      for (const [f, at, d] of notes) {
        s.tone({ f0: f, dur: d, gain: 0.22, type: 'sawtooth', at, attack: 0.06 });
        s.tone({ f0: f / 2, dur: d, gain: 0.16, type: 'triangle', at, attack: 0.04 });
      }
      for (const [f, at] of [[130.81, 0], [196, 0.06], [261.63, 0.12], [329.63, 0.18], [392, 0.24]]) s.tone({ f0: f, dur: 1.6, gain: 0.12, type: 'triangle', at: 1.35 + at });
    },
  },
  cuffs: {
    dur: 0.5, gap: 0.3, what: 'handcuffs clicking shut',
    build(s) {
      for (const at of [0, 0.06, 0.12, 0.18, 0.3]) s.noise({ type: 'bandpass', f0: 4200, q: 8, dur: 0.012, gain: at === 0.3 ? 0.55 : 0.3, at });
      s.tone({ f0: 2600, dur: 0.1, gain: 0.1, at: 0.3 });
    },
  },
  lead: {
    dur: 1.6, gap: 1, what: 'a newly found lead: a low plucked figure and a struck note',
    build(s) {
      for (const [f, at] of [[110, 0], [146.83, 0.22], [130.81, 0.44]]) s.tone({ f0: f, dur: 0.5, gain: 0.4, type: 'triangle', at });
      s.tone({ f0: 659.25, dur: 1.1, gain: 0.14, at: 0.5 });
      s.noise({ type: 'bandpass', f0: 3400, q: 6, dur: 0.02, gain: 0.25, at: 0.5 });
    },
  },
  doors: {
    dur: 0.9, gap: 0.6, what: 'saloon doors swing',
    build(s) {
      s.noise({ type: 'bandpass', f0: 700, f1: 1100, q: 6, dur: 0.3, gain: 0.3 });
      for (const at of [0.35, 0.55, 0.7]) s.tone({ f0: 120, f1: 90, dur: 0.06, gain: 0.35 * (1 - at / 1.2), at });
    },
  },
  crowd: {
    dur: 1.6, gap: 1, what: 'a crowd shouting',
    build(s) {
      for (let i = 0; i < 6; i++) s.noise({ type: 'bandpass', f0: 500 + 140 * i, q: 3, dur: 0.5, gain: 0.18, at: i * 0.18, attack: 0.08 });
    },
  },
  town0: { dur: 1.6, gap: 1, what: 'a hamlet: a few voices and a dog', build: (s) => town(s, 0) },
  town1: { dur: 1.8, gap: 1, what: 'a village: voices and a wagon', build: (s) => town(s, 1) },
  town2: { dur: 2, gap: 1, what: 'a town: a street of voices, wagons and a hammer', build: (s) => town(s, 2) },
  town3: { dur: 2.2, gap: 1, what: 'a city: a busy street', build: (s) => town(s, 3) },
};

// Note: a town's sound by its size class 0 to 3: more voices, wheels and work the bigger it is.
function town(s, size) {
  const voices = [2, 4, 7, 11][size];
  for (let i = 0; i < voices; i++) s.noise({ type: 'bandpass', f0: 380 + 70 * ((i * 5) % 9), q: 4, dur: 0.35, gain: 0.08 + 0.02 * size, at: (i * 0.37) % 1.4, attack: 0.06 });
  if (size === 0) for (const at of [0.5, 0.75]) s.tone({ f0: 520, f1: 380, dur: 0.12, gain: 0.12, at });
  if (size >= 1) s.noise({ type: 'lowpass', f0: 260, q: 1, dur: 1.4, gain: 0.12 + 0.05 * size, attack: 0.3 });
  if (size >= 2) for (const at of [0.2, 0.6, 1]) s.noise({ type: 'bandpass', f0: 2600, q: 6, dur: 0.02, gain: 0.2, at });
  if (size >= 3) for (const at of [0.1, 0.5, 0.9, 1.3]) s.tone({ f0: 180, f1: 120, dur: 0.05, gain: 0.2, at });
}

// Note: scene cues share the campaign player and mute setting, but are separate from menu feedback.
export const SCENE_CUES = {
  footstep: { dur: 0.12, gap: 0.12, what: 'boot on a wooden floor', build(s) {
    s.tone({ f0: 170, f1: 85, dur: 0.09, gain: 0.35 });
    s.noise({ type: 'bandpass', f0: 650, f1: 320, dur: 0.1, gain: 0.25 });
  } },
  revolver: { dur: 0.5, gap: 0.06, what: 'a revolver fires', build(s) {
    s.noise({ type: 'highpass', f0: 1800, dur: 0.045, gain: 0.8 });
    s.noise({ type: 'lowpass', f0: 1500, f1: 130, dur: 0.4, gain: 0.85 });
    s.tone({ f0: 110, f1: 38, dur: 0.24, gain: 0.75 });
  } },
  // Note: the stinger of a killing hit: three dark tom hits, each with a low stick knock, and a last deep boom; in a long room, with no melody and no cymbal.
  sting: { dur: 3, gap: 0.5, reverb: true, what: 'a dark drum beat on a killing hit', build(s) {
    for (const at of [0, 0.42, 0.84]) {
      s.tone({ type: 'sine', f0: 95, f1: 42, dur: 0.6, gain: 0.5, at });
      s.noise({ type: 'lowpass', f0: 500, f1: 120, dur: 0.12, gain: 0.35, at });
    }
    s.tone({ type: 'sine', f0: 60, f1: 30, dur: 1.4, gain: 0.45, at: 0.84 });
  } },
  gun_handling: { dur: 0.3, gap: 0.06, what: 'handling a revolver', build(s) {
    s.noise({ type: 'bandpass', f0: 900, f1: 1300, dur: 0.2, gain: 0.3 });
    s.noise({ type: 'bandpass', f0: 2600, dur: 0.025, gain: 0.4, at: 0.15 });
  } },
  punch: { dur: 0.2, gap: 0.05, what: 'a blow lands', build(s) {
    s.tone({ f0: 130, f1: 55, dur: 0.16, gain: 0.7 });
    s.noise({ type: 'lowpass', f0: 850, f1: 240, dur: 0.12, gain: 0.55 });
  } },
  whiff: { dur: 0.18, gap: 0.08, what: 'a swing misses', build(s) {
    s.noise({ type: 'bandpass', f0: 900, f1: 1900, dur: 0.15, gain: 0.2, attack: 0.04 });
  } },
  grapple: { dur: 0.25, gap: 0.1, what: 'clothes rustle in a grapple', build(s) {
    s.noise({ type: 'bandpass', f0: 700, f1: 1200, dur: 0.22, gain: 0.3, attack: 0.03 });
  } },
  saloon_door: { dur: 0.45, gap: 0.2, what: 'saloon doors swing', build(s) {
    s.tone({ type: 'sawtooth', f0: 180, f1: 130, dur: 0.3, gain: 0.12, attack: 0.06 });
    s.tone({ f0: 110, f1: 65, dur: 0.1, gain: 0.35, at: 0.3 });
  } },
  glass_clink: { dur: 0.3, gap: 0.1, what: 'a glass set on the bar', build(s) {
    s.tone({ type: 'triangle', f0: 1900, f1: 1750, dur: 0.24, gain: 0.25 });
    s.tone({ f0: 2850, dur: 0.13, gain: 0.12 });
  } },
  cards: { dur: 0.3, gap: 0.1, what: 'cards handled on a table', build(s) {
    s.noise({ type: 'bandpass', f0: 1800, f1: 2800, dur: 0.22, gain: 0.22, attack: 0.02 });
  } },
  murmur: { dur: 0.35, gap: 0.2, what: 'a short conversational murmur', build(s) {
    s.tone({ type: 'triangle', f0: 150, f1: 120, dur: 0.3, gain: 0.18, attack: 0.04 });
    s.noise({ type: 'bandpass', f0: 550, f1: 750, dur: 0.25, gain: 0.1, attack: 0.04 });
  } },
  // Note: item 448: the draw-last warp sounds as a pounding heart (two soft low thuds) under a rushing in, and a breath of air as time returns.
  heartbeat: { dur: 0.6, gap: 0.5, what: 'a heart pounding in slowed time', build(s) {
    s.tone({ f0: 64, f1: 38, dur: 0.22, gain: 0.9, attack: 0.01 });
    s.noise({ type: 'lowpass', f0: 320, f1: 110, dur: 0.1, gain: 0.35, attack: 0.004 });
    s.tone({ f0: 54, f1: 34, dur: 0.2, gain: 0.55, at: 0.26, attack: 0.01 });
    s.noise({ type: 'lowpass', f0: 260, f1: 100, dur: 0.08, gain: 0.2, at: 0.26, attack: 0.004 });
  } },
  warp_in: { dur: 0.9, gap: 0.3, what: 'time slows: a rushing fall into a low hum', build(s) {
    s.noise({ type: 'bandpass', f0: 2600, f1: 160, q: 1.2, dur: 0.7, gain: 0.35, attack: 0.05 });
    s.tone({ f0: 190, f1: 42, dur: 0.8, gain: 0.5, attack: 0.04 });
  } },
  warp_out: { dur: 0.5, gap: 0.3, what: 'time returns: a breath of air', build(s) {
    s.noise({ type: 'bandpass', f0: 220, f1: 3200, q: 1, dur: 0.35, gain: 0.3, attack: 0.15 });
    s.tone({ f0: 50, f1: 150, dur: 0.3, gain: 0.3, attack: 0.1 });
  } },
};

export const CUE_NAMES = Object.keys(CUES);

function readMuted(storage) {
  try {
    return !!storage && storage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(storage, muted) {
  try {
    if (storage) storage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Note: blocked storage only means the choice is not remembered.
  }
}

const browserContext = () => {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  return AC ? new AC() : null;
};

// Note: factory builds the AudioContext and is called once, from unlock(); tests pass a fake.
export function createMenuSfx(factory = browserContext, opts = {}) {
  const rand = opts.rand || Math.random;
  const storage = opts.storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : opts.storage;
  let ctx = null;
  let master = null;
  let bus = null;
  let tone = null;
  let warp = 1;
  let nextBeat = 0;
  let noiseBuf = null;
  let verbIn = null;
  let unlocked = false;
  let held = false;
  let muted = readMuted(storage);
  let live = [];
  let lastPlay = null;
  const lastAt = {};
  const listeners = new Set();
  const changed = () => listeners.forEach((fn) => fn(muted));

  function build() {
    if (ctx) return ctx;
    let c = null;
    try {
      c = factory();
    } catch {
      c = null;
    }
    if (!c) return null;
    ctx = c;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 10;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    master.connect(comp);
    comp.connect(ctx.destination);
    // Note: the cues go through one low-pass, wide open until a warp closes it.
    if (ctx.createBiquadFilter) {
      tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = warpCut(warp);
      tone.connect(master);
    }
    bus = ctx.createGain();
    bus.connect(tone || master);
    const n = Math.floor(ctx.sampleRate * 1);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
    // Note: one shared room for the cues that ask for reverb; a context without a convolver plays them dry.
    if (ctx.createConvolver) {
      const len = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(1, len, ctx.sampleRate);
      const id = ir.getChannelData(0);
      for (let i = 0; i < len; i++) id[i] = (rand() * 2 - 1) * (1 - i / len) ** 3;
      verbIn = ctx.createConvolver();
      verbIn.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.6;
      verbIn.connect(wet);
      wet.connect(master);
    }
    return ctx;
  }

  // Note: one synth per play; pitch and level carry the jitter of that play, and room is the reverb send when the cue asks for it.
  // Note: item 339: each play also stretches its timing a little, so repeats never sound identical.
  function synth(pitch, level, room = null, stretch = 1) {
    const now = ctx.currentTime;
    const env = (g, t, peak, dur, attack) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    return {
      vary: () => jitterOf(rand),
      tone({ f0, f1 = f0, dur, type = 'sine', gain = 0.4, at = 0, attack = 0.003 }) {
        const t = now + at * stretch;
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0 * pitch, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
        const g = ctx.createGain();
        env(g, t, gain * level, dur, attack);
        o.connect(g);
        g.connect(bus);
        if (room) g.connect(room);
        o.start(t);
        o.stop(t + dur + 0.02);
      },
      noise({ type = 'bandpass', f0, f1 = f0, q = 1, dur, gain = 0.4, at = 0, attack = 0.001 }) {
        const t = now + at * stretch;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.Q.value = q;
        f.frequency.setValueAtTime(f0 * pitch, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * pitch), t + dur);
        const g = ctx.createGain();
        env(g, t, gain * level, dur, attack);
        src.connect(f);
        f.connect(g);
        g.connect(bus);
        if (room) g.connect(room);
        // Note: the buffer is one second; a longer cue loops it, or the noise would stop dead while the envelope still swells.
        if (dur + 0.5 > noiseBuf.duration) src.loop = true;
        src.start(t, rand() * 0.5);
        src.stop(t + dur + 0.02);
      },
    };
  }

  return {
    cues: CUE_NAMES,
    // Note: call from a pointer or key handler; the first call builds the context, later calls only resume it.
    unlock() {
      unlocked = true;
      if (!build()) return false;
      if (ctx.state === 'suspended' && !held && ctx.resume) ctx.resume();
      return true;
    },
    play(name, o = {}) {
      const cue = CUES[name] || SCENE_CUES[name];
      if (!cue || muted || held || !unlocked || !ctx) return false;
      const now = ctx.currentTime;
      if (name in lastAt && now - lastAt[name] < cue.gap) return false;
      live = live.filter((end) => end > now);
      if (live.length >= MAX_VOICES) return false;
      const slow = warpRate(warp);
      const pitch = jitterOf(rand) * (o.pitch || 1) * slow;
      const level = jitterOf(rand) * (o.level === undefined ? 1 : o.level);
      const stretch = jitterOf(rand) / slow;
      cue.build(synth(pitch, level, cue.reverb ? verbIn : null, stretch));
      lastAt[name] = now;
      live.push(now + cue.dur);
      lastPlay = { cue: name, pitch, level, stretch, at: now };
      return true;
    },
    // Note: item 335: a staged line in the pseudo-voice of item 40, never speech; one line holds one voice for its length.
    say(text, role = 'sheriff', id = 0) {
      if (muted || held || !unlocked || !ctx) return false;
      const now = ctx.currentTime;
      live = live.filter((end) => end > now);
      if (live.length >= MAX_VOICES) return false;
      const voice = voiceFor(role, id);
      const blips = blipsFor(text, voice);
      const sy = synth(jitterOf(rand), 1);
      for (const b of blips) {
        if (b.type === 'hiss' || b.type === 'tick') sy.noise({ type: 'bandpass', f0: b.form[0], q: 3, dur: b.dur, gain: b.gain * 0.12, at: b.at });
        else sy.tone({ f0: b.f0, f1: b.f1, dur: b.dur, gain: b.gain * 0.09, type: voice.wave, at: b.at, attack: 0.01 });
      }
      live.push(now + lineSeconds(blips));
      lastPlay = { cue: 'say', text, at: now };
      return true;
    },
    // Note: item 394: a skipped panel stops every cue and voiced line still sounding; later plays go through a fresh bus.
    hush() {
      if (!ctx || !bus) return false;
      const old = bus;
      old.gain.setValueAtTime(0, ctx.currentTime);
      if (old.disconnect) old.disconnect();
      bus = ctx.createGain();
      bus.connect(tone || master);
      live = [];
      return true;
    },
    setMuted(m) {
      muted = !!m;
      writeMuted(storage, muted);
      if (master) master.gain.value = muted ? 0 : MASTER;
      changed();
    },
    isMuted: () => muted,
    // Note: the opponent's speed in the draw-last warp (1 outside it); cues played from now on are slowed and muffled by it.
    // Note: the warp's own sounds: a rush as it starts, a heartbeat on its own slowed time while it runs, and a breath as it ends; quiet restores the sound without them (a menu, the end of the duel).
    setWarp(speed, o = {}) {
      const before = warp;
      warp = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed)) : 1;
      if (tone) tone.frequency.value = warpCut(warp);
      if (!ctx || o.quiet) {
        nextBeat = 0;
        return;
      }
      const depth = 1 - warp;
      if (warp < 1 && before === 1) {
        this.play('warp_in', { level: 0.7 + 0.3 * depth });
        nextBeat = ctx.currentTime + 0.45;
      } else if (warp === 1 && before < 1) {
        this.play('warp_out');
        nextBeat = 0;
      } else if (warp < 1 && ctx.currentTime >= nextBeat) {
        this.play('heartbeat', { level: 0.6 + 0.6 * depth });
        nextBeat = ctx.currentTime + 0.8 / warpRate(warp);
      }
    },
    get warp() {
      return warp;
    },
    toggle() {
      this.setMuted(!muted);
      return muted;
    },
    // Note: held while a tactical scene runs, so only the scene's own audio is heard.
    suspend() {
      held = true;
      if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend();
    },
    resume() {
      held = false;
      if (ctx && ctx.state === 'suspended' && unlocked && ctx.resume) ctx.resume();
    },
    voices() {
      if (!ctx) return 0;
      live = live.filter((end) => end > ctx.currentTime);
      return live.length;
    },
    last: () => lastPlay,
    get ready() {
      return !!ctx;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
