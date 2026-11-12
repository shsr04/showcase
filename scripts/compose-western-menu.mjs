// Note: Original instrumental menu theme for Western Showdown; every sound is synthesised in this file, no samples.
// Note: Render a 16-bit stereo WAV: node scripts/compose-western-menu.mjs /tmp/frontier-menu.wav
// Note: Add start and end seconds to render only that slice, with the same samples as the full render: node scripts/compose-western-menu.mjs /tmp/slice.wav 60 90
// Note: Make the shipped MP3 from the WAV: ffmpeg -y -i /tmp/frontier-menu.wav -c:a libmp3lame -b:a 128k -ar 44100 -ac 2 public/western/audio/frontier-menu.mp3
// Note: node scripts/compose-western-menu.mjs --plan prints the pitch plan and exits with 1 if a melody note clashes with its chord.
import { writeFileSync } from 'node:fs';

const rate = 44100, bpm = 100, beat = 60 / bpm, bar = 4 * beat, step = beat / 4, TAU = 2 * Math.PI;
// Note: eleven chapters, 180 bars of 4/4 at 100 BPM make exactly 432 s.
const chapters = [['intro', 12], ['gallop', 16], ['stabs', 16], ['twang', 16], ['break', 12], ['trumpets', 16],
  ['standoff', 20], ['lift', 16], ['chase', 16], ['reprise', 20], ['closing', 20]];
const start = {};
let bars = 0;
for (const [name, count] of chapters) { start[name] = bars; bars += count; }
const duration = bars * bar;

const args = process.argv.slice(2);
const planOnly = args[0] === '--plan';
if (!planOnly && !args[0]) throw new Error('Pass an output WAV path');
const from = Number(args[1] ?? 0), to = Number(args[2] ?? duration);
if (!planOnly && !(from >= 0 && to <= duration + 1e-6 && to > from)) throw new Error(`Slice must lie within 0..${duration} s`);

let seed = 84729;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
// Note: every voice gets its own seeded stream, so a slice sounds the same as the full render.
const voiceRandom = (id) => {
  let s = (Math.imul(id + 1, 2654435761) ^ 84729) >>> 0;
  for (let i = 0; i < 4; i++) s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const noteName = (m) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1);

// Note: these are the chords with their voicings and pitch classes.
const CH = {};
const chord = (name, v, extra = []) => { CH[name] = { v, pcs: [...new Set([...v, ...extra].map((m) => m % 12))] }; };
chord('Am', [45, 52, 57, 60, 64]); chord('G', [43, 50, 55, 59, 62]); chord('F', [41, 48, 53, 57, 60]);
chord('E', [40, 47, 52, 56, 59]); chord('E7', [40, 47, 52, 56, 62], [0]); chord('Eb9', [40, 47, 52, 56, 59], [41]);
chord('A', [45, 52, 57, 61, 64]); chord('D', [38, 45, 50, 54, 57]); chord('Dm', [38, 45, 50, 53, 57]);
chord('F#m', [42, 49, 54, 57, 61]); chord('Bb', [46, 53, 58, 62, 65]);
// Note: the standoff keeps E in the bass under every chord.
chord('Am/E', [57, 60, 64], [40]); chord('Bb/E', [58, 62, 65], [40]); chord('F/E', [53, 57, 60], [40]);
const PA = ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E', 'F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'Am'];
const segs = [];
function prog(bar0, names, beats = 4) {
  let t = bar0 * bar;
  for (const name of names) { segs.push({ t0: t, t1: t + beats * beat, name }); t += beats * beat; }
}
const chordAt = (t) => segs.find((s) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6)?.name;
// Note: the next chord tone below a note, counted n tones down, makes parallel thirds and fourths.
function below(m, name, n) {
  let found = 0;
  for (let x = m - 1; x > 30; x--) if (CH[name].pcs.includes(x % 12) && ++found === n) return x;
  return m - 3 * n;
}

// Note: these are the melodies of the old theme as beat, MIDI note and length in beats.
const melody = [
  [[0,69,1.4],[1.75,72,0.65],[2.5,76,1.2]], [[0,74,1.25],[1.5,71,0.75],[2.5,69,1.2]],
  [[0,69,1],[1.25,72,0.65],[2,69,0.8],[3,65,0.8]], [[0,68,1.5],[2,71,0.75],[3,68,0.75]],
  [[0,69,1.4],[1.75,72,0.65],[2.5,76,1.2]], [[0,79,1.2],[1.5,76,0.7],[2.5,74,1.2]],
  [[0,72,1.2],[1.5,69,0.8],[2.5,65,1.1]], [[0,68,1],[1.25,71,0.8],[2.25,68,0.7],[3,64,0.8]],
  [[0,65,1.2],[1.5,69,0.8],[2.5,72,1.1]], [[0,71,1],[1.25,74,0.8],[2.5,79,1.1]],
  [[0,76,1.2],[1.5,72,0.8],[2.5,69,1.2]], [[0,72,0.7],[1,76,0.8],[2,81,1.65]],
  [[0,77,1.2],[1.5,72,0.8],[2.5,69,1.1]], [[0,74,1.2],[1.5,71,0.8],[2.5,67,1.1]],
  [[0,68,1.3],[1.5,71,0.7],[2.5,68,1.1]], [[0,69,2.8]],
];
const melodyAnswers = [
  [[0,76,0.8],[1,72,0.7],[2,69,1.5]], [[0.5,71,0.7],[1.5,74,1.1],[3,71,0.7]],
  [[0,72,0.8],[1,69,0.7],[2,65,1.4]], [[0,68,0.8],[1,71,0.7],[2,76,1.4]],
  [[0,69,0.8],[1,72,0.7],[2,76,0.7],[3,81,0.7]], [[0,79,1.4],[1.75,74,0.8],[2.75,71,0.9]],
  [[0,69,0.8],[1,72,0.7],[2,77,1.3]], [[0,76,0.8],[1,71,0.7],[2,68,1.4]],
  [[0,65,0.8],[1,72,0.7],[2,69,1.4]], [[0,67,0.8],[1,71,0.7],[2,74,1.4]],
  [[0,76,0.8],[1,81,1.2],[2.5,76,1]], [[0,72,0.8],[1,69,0.7],[2,76,1.4]],
  [[0,77,0.8],[1,72,0.7],[2,69,1.4]], [[0,71,0.8],[1,74,0.7],[2,79,1.4]],
  [[0,76,0.8],[1,71,0.7],[2,68,1.4]], [[0,69,2.8]],
];
const melodyReprise = [
  [[0,69,1],[1.25,72,0.55],[2,76,0.8],[3,72,0.7]], [[0,74,0.8],[1,79,0.8],[2,74,0.7],[3,71,0.7]],
  [[0,69,1.4],[1.75,65,0.7],[2.75,69,0.9]], [[0,68,1],[1.25,71,0.65],[2,76,1.4]],
  [[0,81,1],[1.25,76,0.65],[2,72,0.8],[3,69,0.7]], [[0,71,0.8],[1,74,0.8],[2,79,1.4]],
  [[0,77,1],[1.25,72,0.7],[2.25,69,1.1]], [[0,68,1.5],[2,71,0.7],[3,68,0.7]],
  [[0,72,1],[1.25,69,0.7],[2.25,65,1.1]], [[0,74,1],[1.25,71,0.7],[2.25,67,1.1]],
  [[0,69,0.8],[1,72,0.7],[2,76,1.4]], [[0,81,1.5],[2,76,0.7],[3,72,0.7]],
  [[0,69,0.8],[1,72,0.7],[2,77,1.4]], [[0,79,0.8],[1,74,0.7],[2,71,1.4]],
  [[0,68,1],[1.25,71,0.7],[2.25,76,1.1]], [[0,69,2.8]],
];
// Note: the heroic lift is the opening tune in A major, the motif turned from A C E into A C# E.
const heroic = [
  [[0,69,1],[1.25,73,0.65],[2,76,1.8]], [[0,76,1],[1.25,71,0.7],[2,68,1.7]],
  [[0,74,1],[1.25,78,0.7],[2,81,1.7]], [[0,76,1.5],[2,73,0.8],[3,69,0.9]],
  [[0,73,1],[1.25,78,0.7],[2,81,1.7]], [[0,80,1.25],[1.5,76,0.8],[2.5,71,1.4]],
  [[0,81,1.5],[2,78,0.75],[3,74,0.9]], [[0,80,1],[1.25,76,0.8],[2.25,71,1.6]],
  [[0,69,0.75],[1,73,0.75],[2,76,0.75],[3,81,1.2]], [[0,80,1],[1.25,76,0.75],[2.25,71,1.5]],
  [[0,78,1],[1.25,74,0.75],[2.25,69,1.5]], [[0,73,1],[1.25,76,0.75],[2.25,81,1.6]],
  [[0,81,1.5],[2,78,0.75],[3,74,0.9]], [[0,77,1.5],[2,74,0.75],[3,69,0.9]],
  [[0,76,1],[1.25,71,0.75],[2.25,68,1.5]], [[0,71,0.75],[1,76,0.75],[2,80,1.8]],
];
const heroicChords = ['A', 'E', 'D', 'A', 'F#m', 'E', 'D', 'E', 'A', 'E', 'D', 'A', 'D', 'Dm', 'E', 'E'];
// Note: the final tag of the reprise, one bar per entry.
const tag = [
  [[0,77,1],[1.25,72,0.7],[2,69,1.8]], [[0,74,1],[1.25,79,0.7],[2,74,1.8]],
  [[0,76,0.75],[1,71,0.75],[2,68,1.8]], [[0,71,0.5],[0.75,76,0.5],[1.5,80,0.5],[2.25,83,1.5]],
];

// Note: the composition is an event list that is rendered later.
const events = [];
const ev = (t, voice, ...a) => { events.push({ t, voice, a, id: events.length }); };
const bt = (b, beats = 0) => b * bar + beats * beat;
const st = (b, steps = 0) => b * bar + steps * step;
const jit = (ms = 3) => (random() - 0.5) * 2 * ms / 1000;
const curve = (pts) => (t) => {
  const b = (((t % duration) + duration) % duration) / bar;
  if (b <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (b <= pts[i][0]) { const [b0, v0] = pts[i - 1], [b1, v1] = pts[i]; return v0 + (v1 - v0) * (b - b0) / (b1 - b0); }
  }
  return pts[pts.length - 1][1];
};
// Note: a pattern is 16 sixteenths, x is full strength, digits 1-9 are softer, a dot is rest.
function hits(b, pat, fn) {
  for (let i = 0; i < 16; i++) {
    if (pat[i] === '.') continue;
    let gap = 1;
    while (i + gap < 16 && pat[i + gap] === '.') gap++;
    fn(st(b, i) + jit(), pat[i] === 'x' ? 1 : Number(pat[i]) / 9, i, gap * step);
  }
}
function tunes(arr, b0, k = 1) {
  const out = [];
  arr.forEach((phrase, j) => phrase.forEach(([x, m, d]) => out.push({ t: (b0 + j * k) * bar + x * k * beat, m, d: d * k * beat, j })));
  return out;
}
function gallop(b, c, vel, pat = 'x.xxx.xxx.xxx.xx') {
  hits(b, pat, (t, v, i) => {
    const accent = i % 8 === 0, long = i % 4 === 0;
    ev(t, 'chug', accent ? [c[0], c[1], c[2]] : [c[0], c[1]], long ? 0.3 : 0.11, vel * v * (accent ? 1 : long ? 0.8 : 0.6), -0.28 + (i % 4 === 3 ? 0.08 : 0));
  });
}
function bassLine(b, c, pat, vol) {
  hits(b, pat, (t, v, i, gap) => {
    const m = i % 8 === 6 ? c[1] - 12 : i % 8 === 4 ? c[0] + 12 : c[0];
    ev(t, 'bass', m, Math.min(gap * 0.9, 1.1), vol * v);
  });
}
const SHAKE = '5283528352835283';
function kit(b, p, g = 1) {
  if (p.kick) hits(b, p.kick, (t, v) => ev(t, 'kick', 0.95 * v * g));
  if (p.snare) hits(b, p.snare, (t, v) => ev(t, 'snare', 0.6 * v * g, { pan: 0.06 }));
  if (p.rim) hits(b, p.rim, (t, v) => ev(t, 'rim', 0.5 * v * g));
  if (p.shaker) hits(b, p.shaker, (t, v, i) => ev(t, 'shaker', 0.2 * v * g, i % 2 ? 0.4 : -0.4));
  if (p.taiko) hits(b, p.taiko, (t, v) => ev(t, 'taiko', p.tom ?? 45, 0.85 * v * g));
  if (p.tick) hits(b, p.tick, (t, v, i) => ev(t, 'tick', 0.3 * v * g, i % 8 === 0));
}
function tomFill(b, from = 12, notes = [64, 59, 52, 45], vol = 0.85) {
  notes.forEach((m, j) => ev(st(b, from + j) + jit(), 'taiko', m, vol * (0.75 + 0.08 * j)));
}
function roll(t0, t1, kind, v0, v1, gap, pitch = 40) {
  const n = Math.round((t1 - t0) / gap);
  for (let j = 0; j < n; j++) {
    const v = v0 + (v1 - v0) * (j / n) ** 1.5, t = t0 + j * gap + jit(2);
    if (kind === 'snare') ev(t, 'snare', v, { pan: j % 2 ? 0.1 : -0.1, short: true });
    else ev(t, 'taiko', pitch, v, { soft: true });
  }
}
// Note: a downbeat accent: whip, kick and a deep drum together.
function accent(b, big = 1) {
  ev(bt(b) + 0.004, 'whip', 0.5 * big, b % 2 ? 0.5 : -0.5);
  ev(bt(b), 'kick', 1.1 * big);
  ev(bt(b), 'taiko', 40, 1.0 * big);
}
const trumpetsOn = (notes, name, volume, o = {}) => notes.forEach(({ t, m, d }) => {
  const long = d > 1.1 * beat;
  const opt = { fall: long && !o.noFall ? 2 : 0, scoop: o.scoop ?? 0.8, echo: o.echo ?? true };
  ev(t + 0.02, 'trumpet', m, d, volume, 0.22, opt);
  ev(t + 0.02, 'trumpet', below(m, name(t), 1), d, volume * 0.85, -0.22, { ...opt, cents: 5 });
  if (o.three) ev(t + 0.025, 'trumpet', below(m, name(t), 2), d, volume * 0.7, 0, { ...opt, cents: -5 });
});
const whistleOn = (notes, volume, o = {}) => notes.forEach(({ t, m, d }) => ev(t + 0.06, 'whistle', m + (o.shift ?? 0), d, volume, o));
const stringsChord = (b, name, dur, vol, o = {}) => ev(bt(b) - 0.05, 'strings', (o.notes ?? CH[name].v.slice(-3)).map((m) => m + (o.shift ?? 0)), dur, vol, o);
const choirChord = (b, name, dur, vol, vowel = 'o') => ev(bt(b) - 0.05, 'choir', CH[name].v.slice(-3), dur, vol, vowel);

// Note: intro: wind, drone, heartbeat and bell; the first bars of the old tune on tremolo guitar and harmonica
{
  const s0 = start.intro;
  prog(s0, ['Am', 'Am', 'Am', 'Am', 'Am', 'Am', 'G', 'G', 'F', 'F', 'E', 'E'], 4);
  for (let k = 0; k < 12; k++) {
    const b = s0 + k;
    for (const h of k >= 10 ? [0, 1, 2, 3] : [0, 2]) ev(bt(b, h), 'heart', 1 + 0.03 * k);
  }
  const trem = { echo: [[0.9, 0.5, -0.3], [1.8, 0.32, 0.3], [2.7, 0.2, -0.2], [3.6, 0.12, 0.2]] };
  // Note: bar, beat, MIDI note, length in beats, the opening phrases stretched over two bars each.
  for (const [k, x, m, d] of [[2, 0, 69, 1.8], [2, 2, 72, 1.8], [3, 0, 76, 3.6], [6, 0, 74, 2], [6, 2, 71, 1.8], [7, 0, 69, 3.6], [10, 0, 68, 1.8], [10, 2, 71, 1.8], [11, 0, 68, 3.6]]) {
    ev(bt(s0 + k, x), 'tremolo', m, d * beat, 0.45, 0.1, trem);
  }
  for (const [k, x, m, d] of [[4, 0, 76, 1.8], [4, 2, 72, 1.8], [5, 0, 69, 3.6], [8, 0, 69, 1.8], [8, 2, 72, 1.8], [9, 0, 69, 1.8], [9, 2, 65, 1.8]]) ev(bt(s0 + k, x), 'reed', m, d * beat, 0.2, 0.15);
  for (const [k, x, m] of [[0, 2, 57], [4, 2, 52], [8, 2, 57]]) ev(bt(s0 + k, x), 'bell', m, k ? 0.35 : 0.55);
  ev(bt(s0 + 5, 3), 'jaw', 33, 1.6, 0.3, -0.3);
  choirChord(s0 + 2, 'Am', 4 * bar, 0.07);
  choirChord(s0 + 6, 'G', 2 * bar, 0.09);
  choirChord(s0 + 8, 'F', 2 * bar, 0.09);
  choirChord(s0 + 10, 'E', 2 * bar, 0.1);
  for (let k = 6; k < 12; k++) ev(bt(s0 + k), 'bass', CH[['G', 'G', 'F', 'F', 'E', 'E'][k - 6]].v[0], 2.2, 0.5);
  roll(bt(s0 + 11), bt(s0 + 12), 'snare', 0.05, 0.5, 0.075);
  roll(bt(s0 + 11), bt(s0 + 12), 'taiko', 0.1, 0.5, 0.15, 40);
  ev(bt(s0 + 11, 2), 'rise', 2 * beat, 0.5);
}

// Note: gallop: the old tune on whistle over a galloping guitar, war drums and a syncopated bass
{
  const s0 = start.gallop;
  prog(s0, PA);
  whistleOn(tunes(melody, s0), 0.26);
  accent(s0, 1);
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, c = CH[PA[k]].v;
    gallop(b, c, k < 4 ? 0.6 : 0.85);
    bassLine(b, c, k < 8 ? 'x.....x.x.....x.' : 'x.....x.x..x..x.', 0.6);
    kit(b, { kick: k < 8 ? 'x.......x.......' : 'x.....x.x.......', rim: k < 8 ? '....x.......x...' : null, snare: k >= 8 ? '....x.......x...' : null, shaker: k >= 4 ? SHAKE : null, taiko: k >= 8 && k % 4 !== 3 ? 'x.xx............' : null, tom: c[0] });
    if (k % 4 === 3) tomFill(b, k === 15 ? 8 : 12, k === 15 ? [64, 64, 59, 59, 52, 52, 45, 45] : undefined);
    if (k >= 8) hits(b, '..x...x...x...x.', (t, v) => ev(t, 'strum', c.slice(1, 5), 0.5, 0.11 * v, true, 0.3));
    if (k === 8) ev(bt(b), 'whip', 0.4, -0.4);
    if (k >= 8 && k % 4 === 0) choirChord(b, PA[k], 4 * bar, 0.06, 'a');
    if (k === 15) ev(bt(b, 2), 'rise', 2 * beat, 0.45);
  }
}

// Note: stabs: the reprise tune, more percussion, trumpet stabs and whip cracks
{
  const s0 = start.stabs;
  prog(s0, PA);
  accent(s0, 1.1);
  whistleOn(tunes(melodyReprise, s0), 0.2);
  const stabs = [[0, 6], [3, 10], [0, 6, 12], [6, 8, 10, 14]];
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, c = CH[PA[k]].v;
    gallop(b, c, 0.8);
    bassLine(b, c, k % 4 === 3 ? 'x..x..x.x..x..x.' : 'x.....x.x..x..x.', 0.62);
    kit(b, { kick: k % 2 ? 'x.....x.x..x....' : 'x.....x.x.......', snare: '....x.......x...', shaker: SHAKE, taiko: k % 4 !== 3 ? 'x.xx....x.xx....' : null, tom: c[0] });
    if (k % 4 === 3) tomFill(b);
    for (const s of stabs[k % 4]) {
      const t = st(b, s);
      for (const [j, m] of c.slice(2, 5).entries()) ev(t + jit(), 'trumpet', m + 12, 0.2, 0.1, [-0.3, 0, 0.3][j], { scoop: 0.5, cents: (j - 1) * 5 });
    }
    if (k % 8 === 4) ev(st(b, 8), 'whip', 0.45, k % 16 === 4 ? 0.5 : -0.5);
    if (k >= 8) hits(b, '..x...x...x...x.', (t, v) => ev(t, 'strum', c.slice(1, 5), 0.45, 0.1 * v, true, 0.32));
    if (k % 4 === 0) choirChord(b, PA[k], 4 * bar, 0.05, 'a');
    if (k === 15) { ev(bt(b, 2), 'rise', 2 * beat, 0.5); roll(bt(b, 3), bt(b + 1), 'snare', 0.1, 0.5, 0.075); }
  }
  trumpetsOn(tunes(melodyReprise, s0).filter((n) => n.j >= 8 && n.d > 1.1 * beat), (t) => chordAt(t), 0.1, {});
}

// Note: twang: the answer tune on twangy lead guitar with a slap echo, a jaw harp and a lighter beat
{
  const s0 = start.twang;
  prog(s0, PA);
  accent(s0, 0.8);
  for (const n of tunes(melodyAnswers, s0)) {
    const long = n.d >= 1.1 * beat;
    ev(n.t + 0.03, long ? 'tremolo' : 'twang', n.m, long ? n.d + 0.25 : n.d + 0.3, long ? 0.2 : 0.3, 0.2, { echo: [[0.45, 0.38, -0.3], [0.9, 0.2, 0.3]] });
    if (n.j >= 8 && n.m <= 84) ev(n.t + 0.06, 'whistle', n.m + 12 > 88 ? n.m : n.m + 12, n.d, 0.07, { echo: [[0.6, 0.3, -0.3]] });
  }
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, c = CH[PA[k]].v;
    bassLine(b, c, 'x..x..x.x..x..x.', 0.6);
    kit(b, { kick: 'x.......x.x.....', rim: '....x.......x...', shaker: k >= 2 ? SHAKE : null, tick: k >= 4 ? '......9.......9.' : null, taiko: k % 4 === 3 ? null : '..........x.....', tom: c[0] });
    gallop(b, c, 0.45, 'x.....x.x.....x.');
    hits(b, 'x.x...x...x...x.', (t, v, i) => ev(t, 'strum', c.slice(1, 5), i === 0 ? 0.9 : 0.35, 0.12 * v, i % 4 !== 0, 0.25));
    if (k % 4 === 3) tomFill(b, 14, [52, 45], 0.7);
    if (k === 7 || k === 15) ev(bt(b, 2.5), 'jaw', c[0], 1.4, 0.34, -0.25);
    if (k % 4 === 0) stringsChord(b, PA[k], 4 * bar, 0.05, { att: 1.0, rel: 1.0, trem: 0 });
    if (k === 15) ev(bt(b, 2), 'rise', 2 * beat, 0.45);
  }
}

// Note: break: stripped to bass, tremolo guitar and a ticking clock; ends in a snare and timpani roll
{
  const s0 = start.break;
  prog(s0, ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E', 'F', 'G', 'E', 'E']);
  accent(s0, 0.6);
  const lines = [...tunes(melody.slice(0, 10), s0), { t: bt(s0 + 10), m: 68, d: 3.9 * beat }, { t: bt(s0 + 11), m: 71, d: 3.9 * beat }];
  for (const n of lines) ev(n.t + 0.04, 'tremolo', n.m, n.d, 0.2, 0.15, { echo: [[0.45, 0.4, -0.3], [0.9, 0.22, 0.3], [1.35, 0.12, -0.2]] });
  for (let k = 0; k < 12; k++) {
    const b = s0 + k, c = CH[['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E', 'F', 'G', 'E', 'E'][k]].v;
    bassLine(b, c, k % 2 ? 'x.......x.....x.' : 'x.......x.......', 0.62);
    hits(b, 'x.x.x.x.x.x.x.x.', (t, v, i) => ev(t, 'tick', (k < 8 ? 0.22 : 0.3) * (i % 4 === 0 ? 1 : 0.6), i % 4 === 0));
    if (k >= 6) hits(b, '3...3...3...3...', (t, v) => ev(t, 'kick', 0.45 * v));
    if (k === 4) ev(bt(b, 0), 'jaw', 33 + 12, 1.4, 0.3, 0.3);
    if (k % 4 === 0 && k >= 4) stringsChord(b, k === 4 ? 'Am' : k === 8 ? 'F' : 'Am', 4 * bar, 0.06, { att: 1.5, rel: 1.5, trem: 8.5 });
  }
  ev(bt(s0 + 11, 0), 'rise', 4 * beat, 1.0);
  roll(bt(s0 + 10), bt(s0 + 12), 'snare', 0.08, 0.9, 0.075);
  roll(bt(s0 + 10, 2), bt(s0 + 12), 'taiko', 0.12, 1.1, 0.12, 40);
}

// Note: trumpets: full band with harmonised mariachi trumpets on the answer tune
{
  const s0 = start.trumpets;
  prog(s0, PA);
  accent(s0, 1.3);
  const notes = tunes(melodyAnswers, s0);
  trumpetsOn(notes.filter((n) => n.j < 8), (t) => chordAt(t), 0.12, {});
  trumpetsOn(notes.filter((n) => n.j >= 8), (t) => chordAt(t), 0.13, { three: true });
  whistleOn(notes, 0.09);
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, c = CH[PA[k]].v;
    gallop(b, c, 0.9);
    bassLine(b, c, 'x..x..x.x..x..x.', 0.7);
    kit(b, { kick: 'x..x..x.x..x..x.', snare: k % 4 === 3 ? '....x...x.x.x.xx' : '....x.......x..3', shaker: SHAKE, taiko: 'x.xx....x.xx....', tom: c[0] }, 1.05);
    if (k % 4 === 3) tomFill(b, 12, [64, 59, 52, 45], 0.95);
    if (k % 8 === 0 && k > 0) accent(b, 0.9);
    if (k % 2 === 0) stringsChord(b, PA[k], 2 * bar, 0.05, { att: 0.4, rel: 0.5, trem: k >= 8 ? 9 : 0 });
    hits(b, 'x...x...x...x...', (t, v, i) => ev(t, 'strum', c.slice(1, 5), 0.4, 0.09 * v, true, -0.3));
    if (k === 7 || k === 15) roll(bt(b, 3), bt(b + 1), 'snare', 0.15, 0.6, 0.075);
  }
}

// Note: standoff: an E pedal under Am, Bb, F and E chords, long harmonica lines, ticks and a heartbeat
{
  const s0 = start.standoff;
  const names = ['Am/E', 'Am/E', 'Am/E', 'Am/E', 'Bb/E', 'Bb/E', 'Bb/E', 'F/E', 'F/E', 'F/E', 'Eb9', 'Eb9', 'E7', 'E7', 'E7', 'E7', 'E', 'E', 'E', 'E'];
  prog(s0, names);
  for (let k = 0; k < 20; k++) {
    const b = s0 + k;
    if (k < 19) for (const h of k < 8 ? [0, 2] : k < 12 ? [0, 1, 2, 3] : [0, 1, 2, 3]) ev(bt(b, h), 'heart', 0.75 + 0.012 * k);
    if (k >= 4 && k < 18) hits(b, k < 8 ? 'x.......x.......' : k < 12 ? 'x...x...x...x...' : k < 16 ? 'x.x.x.x.x.x.x.x.' : 'xxxxxxxxxxxxxxxx', (t, v, i) => ev(t, 'tick', (k < 12 ? 0.22 : 0.26) * (i % 4 === 0 ? 1 : 0.65), i % 8 === 0));
    if (k % 4 === 0 && k < 18) stringsChord(b, names[k], k === 16 ? 2 * bar : 4 * bar, 0.07 + 0.003 * k, { att: 2.0, rel: 2.0, trem: 7 + k * 0.1, bright: k >= 4 });
    if (k % 4 === 0 && k < 16) choirChord(b, names[k] === 'E7' ? 'E' : names[k], 4 * bar, 0.05, 'o');
  }
  const wail = [
    [0, 0, 64, 3.5], [1, 0, 69, 1.6], [1, 2, 72, 1.6], [2, 0, 76, 3.6], [3, 0, 74, 1], [3, 1.5, 72, 2.4],
    [4, 0, 77, 3.6], [5, 0, 74, 2], [5, 2.5, 70, 1.4], [6, 0, 77, 1.5], [6, 2, 76, 1.9], [7, 0, 76, 3.8],
    [8, 0, 72, 2], [8, 2.5, 69, 1.4], [9, 0, 65, 3.7], [10, 0, 68, 1.5], [10, 2, 71, 1.6], [11, 0, 77, 1.5], [11, 2, 76, 1.8],
    [12, 0, 71, 3.8], [13, 0, 72, 1.5], [13, 2, 71, 1.8], [14, 0, 68, 3.8], [15, 0, 71, 1.8], [15, 2, 74, 1.8],
  ];
  for (const [k, x, m, d] of wail) ev(bt(s0 + k, x), 'reed', m, d * beat, 0.24, 0.1);
  for (const [k, m] of [[0, 52], [8, 52], [14, 40]]) ev(bt(s0 + k, 0), 'bell', m, 0.55);
  ev(bt(s0 + 5, 1), 'jaw', 28 + 12, 1.6, 0.34, 0.3);
  ev(bt(s0 + 13, 1), 'jaw', 28 + 12, 1.6, 0.34, -0.3);
  roll(bt(s0 + 16), bt(s0 + 19), 'taiko', 0.1, 1.7, 0.075, 40);
  roll(bt(s0 + 17), bt(s0 + 19), 'snare', 0.08, 0.9, 0.075);
  ev(bt(s0 + 17), 'rise', 8 * beat, 1.4);
  ev(bt(s0 + 18, 3.5), 'kick', 0.6);
  ev(bt(s0 + 19, 0.5), 'bell', 40, 0.7);
}

// Note: lift: the heroic major turn of the tune, trumpets in parallel thirds, a driving straight beat
{
  const s0 = start.lift;
  prog(s0, heroicChords);
  accent(s0, 1.6);
  const notes = tunes(heroic, s0);
  trumpetsOn(notes, (t) => chordAt(t), 0.13, { three: true });
  whistleOn(notes, 0.1, { shift: 12 });
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, name = heroicChords[k], c = CH[name].v;
    gallop(b, c, 0.75, 'x.x.x.x.x.x.x.x.');
    bassLine(b, c, 'x.x.x.x.x.x.x.x.', 0.7);
    kit(b, { kick: 'x...x...x...x...', snare: '....x.......x...', shaker: SHAKE, taiko: k % 2 ? null : 'x.xx............', tom: c[0] }, 1.05);
    hits(b, 'x.x.x.x.x.x.x.x.', (t, v, i) => ev(t, 'strum', c.slice(1, 5), 0.35, 0.1 * (i % 4 === 0 ? 1 : 0.7), i % 4 === 2, 0.3));
    if (k % 2 === 0) stringsChord(b, name, 2 * bar, 0.07, { att: 0.5, rel: 0.6, notes: [c[2], c[3], c[4], c[2] + 12] });
    if (k % 4 === 3) tomFill(b, 12, [64, 59, 52, 45], 0.9);
    if (k === 8) accent(b, 0.9);
  }
  roll(bt(s0 + 15, 2), bt(s0 + 16), 'snare', 0.15, 0.6, 0.075);
}

// Note: chase: double time, the tune at half length and the chords every two beats over a galloping beat
{
  const s0 = start.chase;
  const names2 = PA.concat(PA);
  prog(s0, names2, 2);
  accent(s0, 1.4);
  // Note: both passes of 16 phrases at half length fill eight bars each.
  const lead2 = [...tunes(melody, s0, 0.5), ...tunes(melodyReprise, s0 + 8, 0.5)];
  whistleOn(lead2, 0.17, { scoop: 0.3 });
  trumpetsOn(lead2.filter((n) => n.d > 0.55 * beat), (t) => chordAt(t), 0.1, { noFall: true, scoop: 0.4 });
  lead2.forEach((n) => ev(n.t + 0.03, 'twang', n.m - 12, Math.min(n.d, 0.6), 0.2, -0.2, { echo: [[0.3, 0.3, 0.3]] }));
  for (let k = 0; k < 16; k++) {
    const b = s0 + k, c1 = CH[names2[2 * k]].v, c2 = CH[names2[2 * k + 1]].v;
    hits(b, 'xxxxxxxxxxxxxxxx', (t, v, i) => {
      const c = i < 8 ? c1 : c2, g = i % 4 === 0, hi = i % 8 === 0;
      ev(t, 'chug', hi ? [c[0], c[1], c[2]] : [c[0], c[1]], g ? 0.2 : 0.09, 0.78 * (hi ? 1 : g ? 0.85 : [0.55, 0.62, 0.7, 0.6][i % 4]), -0.28);
    });
    hits(b, 'x.x.x.x.x.x.x.x.', (t, v, i) => {
      const c = i < 8 ? c1 : c2;
      ev(t, 'bass', i % 4 === 2 ? c[1] - 12 : c[0], 0.28, 0.72 * (i % 4 === 0 ? 1 : 0.8));
    });
    kit(b, { kick: '9...6...9...6...', snare: '3.339.443.339.44', shaker: '7385738573857385', taiko: k % 2 ? '..x...x...x...x.' : 'x.xx....x.xx....', tom: c1[0] }, 1.1);
    if (k % 4 === 3) tomFill(b, 12, [64, 59, 52, 45], 0.95);
    if (k % 8 === 4) ev(bt(b, 2), 'whip', 0.5, 0.5);
    if (k % 2 === 0) stringsChord(b, names2[2 * k], 2 * bar, 0.06, { att: 0.2, rel: 0.4, trem: 9 });
  }
  roll(bt(s0 + 15, 2), bt(s0 + 16), 'snare', 0.15, 0.6, 0.0375);
}

// Note: reprise: call and response of whistle and trumpets, then everyone together, then a tag in the key of the tune
{
  const s0 = start.reprise;
  prog(s0, [...PA, 'F', 'G', 'E', 'E']);
  accent(s0, 1.4);
  const callWhistle = tunes(melody, s0).filter((n) => Math.floor(n.j / 2) % 2 === 0 && n.j < 8);
  const answerTrumpets = tunes(melodyAnswers, s0).filter((n) => Math.floor(n.j / 2) % 2 === 1 && n.j < 8);
  whistleOn(callWhistle, 0.2);
  trumpetsOn(answerTrumpets, (t) => chordAt(t), 0.14, { three: true });
  const together = tunes(melodyReprise, s0).filter((n) => n.j >= 8);
  whistleOn(together, 0.18);
  trumpetsOn(together, (t) => chordAt(t), 0.13, { three: true });
  const tagNotes = tunes(tag, s0 + 16);
  whistleOn(tagNotes, 0.18);
  trumpetsOn(tagNotes, (t) => chordAt(t), 0.14, { three: true });
  for (let k = 0; k < 20; k++) {
    const b = s0 + k, name = chordAt(bt(b)), c = CH[name].v;
    gallop(b, c, k < 8 ? 0.8 : 0.95);
    bassLine(b, c, 'x..x..x.x..x..x.', 0.72);
    kit(b, { kick: 'x..x..x.x..x..x.', snare: '....x.......x...', shaker: SHAKE, taiko: 'x.xx....x.xx....', tom: c[0] }, k < 8 ? 1 : 1.12);
    if (k % 4 === 3) tomFill(b, 12, [64, 59, 52, 45], 1);
    if (k % 2 === 0) stringsChord(b, name, 2 * bar, 0.06, { att: 0.3, rel: 0.5, trem: k >= 8 ? 8.5 : 0 });
    if (k % 4 === 0) choirChord(b, name, 4 * bar, 0.05, 'a');
    hits(b, 'x...x...x...x...', (t, v) => ev(t, 'strum', c.slice(1, 5), 0.4, 0.09 * v, true, -0.3));
    if (k === 8) accent(b, 1);
    if (k === 12 || k === 14) ev(bt(b, 0), 'whip', 0.45, 0.4);
  }
  roll(bt(s0 + 19, 1), bt(s0 + 20), 'snare', 0.2, 0.7, 0.0375);
  roll(bt(s0 + 19, 0), bt(s0 + 20), 'taiko', 0.2, 0.8, 0.1, 40);
}

// Note: closing: a last Am hit, the old gentle texture, then wind, drone and heartbeat as in the intro
{
  const s0 = start.closing;
  prog(s0, ['Am', 'Am', ...PA.slice(0, 8), 'F', 'G', 'E', 'Am', 'Am', 'Am', 'Am', 'Am', 'Am', 'Am']);
  ev(bt(s0), 'kick', 1.2); ev(bt(s0), 'taiko', 40, 1.1); ev(bt(s0), 'whip', 0.5, 0);
  for (const [j, m] of [69, 72, 76].entries()) ev(bt(s0) + 0.02, 'trumpet', m, 2 * beat, 0.14, [-0.25, 0, 0.25][j], { fall: 3, scoop: 0.3 });
  ev(bt(s0) - 0.05, 'strings', [57, 60, 64, 69], 2 * bar, 0.08, { att: 0.05, rel: 2.5, trem: 8 });
  ev(bt(s0), 'strum', [45, 52, 57, 60, 64], 2.5, 0.2, false, 0);
  whistleOn(tunes(melody.slice(0, 8), s0 + 2), 0.1);
  whistleOn(tunes(melody.slice(12), s0 + 10), 0.09);
  for (let k = 2; k < 14; k++) {
    const b = s0 + k, c = CH[chordAt(bt(b))].v;
    for (let x = 0; x < 4; x++) {
      ev(bt(b, x), 'pick', c[x % 2], 1.25 * beat, 0.16 * (1 - (k - 2) * 0.03), -0.22);
      if (x % 2 === 1 || k < 10) for (let j = 2; j < 5; j++) ev(bt(b, x + 0.52) + (j - 2) * 0.025, 'pick', c[j], 0.8 * beat, 0.05, -0.35 + j * 0.07);
    }
    if (k % 4 === 2) choirChord(b, chordAt(bt(b)), 4 * bar, 0.05, 'o');
  }
  for (let k = 12; k < 20; k++) for (const h of [0, 2]) ev(bt(s0 + k, h), 'heart', k < 16 ? 0.9 : 1 + 0.03 * (k - 16));
  ev(bt(s0 + 14, 0), 'strum', [45, 52, 57, 60, 64], 3, 0.12, false, 0.1);
  ev(bt(s0 + 18, 2), 'bell', 57, 0.55);
}

// Note: continuous layers in four-bar chunks, with levels that follow the plan
const windLevel = curve([[0, 2], [4, 2], [12, 1.2], [26, 0.25], [60, 0.2], [66, 0.5], [72, 0.2], [88, 0.4], [107, 1.1], [109, 0.15], [124, 0.1], [160, 0.12], [172, 1.4], [176, 2], [180, 2]]);
const droneA = curve([[0, 1.8], [4, 1.8], [12, 1.3], [14, 0.4], [60, 0.4], [66, 0.9], [72, 0.2], [88, 0], [160, 0], [166, 0.6], [172, 1.8], [180, 1.8]]);
const droneE = curve([[88, 0], [91, 1], [105, 1.2], [107, 1.2], [108, 0], [180, 0]]);
for (let b = 0; b < bars; b += 4) {
  ev(bt(b) - 1.2, 'wind', 4 * bar + 2.4, windLevel);
  ev(bt(b) - 1.2, 'drone', 4 * bar + 2.4, [[110, 1], [165, 0.6], [220, 0.25]], droneA);
  if (b >= 88 && b < 108) ev(bt(b) - 1.2, 'drone', 4 * bar + 2.4, [[82.5, 1], [165, 0.7], [123.75, 0.4]], droneE);
}

// Note: the pitch plan lists every melody note against its chord.
const MELODIC = new Set(['whistle', 'trumpet', 'reed', 'twang', 'tremolo']);
if (planOnly) {
  const scaleFor = (t) => (t >= bt(start.lift) && t < bt(start.chase) ? [9, 11, 1, 2, 4, 6, 8, 5] : t >= bt(start.standoff) && t < bt(start.lift) ? [9, 11, 0, 2, 4, 5, 7, 8, 10] : [9, 11, 0, 2, 4, 5, 7, 8]);
  let clashes = 0;
  console.log('bar chord');
  for (const s of segs) if (Math.abs(s.t0 / bar - Math.round(s.t0 / bar)) < 1e-6) console.log(Math.round(s.t0 / bar), s.name);
  const counts = {};
  for (const e of events.filter((x) => MELODIC.has(x.voice)).sort((a, b) => a.t - b.t)) {
    const name = chordAt(e.t + 0.1), m = e.a[0], pc = m % 12;
    if (!name) { console.log('NO CHORD', e.t); clashes++; continue; }
    const tone = CH[name].pcs.includes(pc);
    const near = CH[name].pcs.some((p) => [1, 11].includes((pc - p + 12) % 12));
    const inScale = scaleFor(e.t).includes(pc);
    const status = tone ? 'tone' : !inScale ? 'OUT-OF-SCALE' : near ? 'CLASH' : 'passing';
    if (status === 'CLASH' || status === 'OUT-OF-SCALE') clashes++;
    counts[status] = (counts[status] ?? 0) + 1;
    console.log(`${(e.t / bar).toFixed(3)} ${e.voice} ${noteName(m)} over ${name} ${status}`);
  }
  console.log(JSON.stringify(counts), 'clashes', clashes, 'duration', duration);
  process.exit(clashes ? 1 : 0);
}

// Note: the synthesis engine renders the event list.
const PRE = 8;
const w0 = from - PRE, N = Math.round((to - w0) * rate);
const L = new Float32Array(N), R = new Float32Array(N), W = new Float32Array(N);
const SCR = new Float32Array(rate * 24);
let voiceGain = 1;
// Note: the mix table sets each instrument's level, the trim curve (dB by bar) shapes the loudness arc.
const mix = { kick: 0.8, heart: 0.8, taiko: 0.45, snare: 1.3, rim: 1.6, shaker: 1.2, whip: 0.8, tick: 1, bass: 2.4, chug: 2.8, strum: 3.5, pick: 1.5, twang: 2.2, tremolo: 2.4, whistle: 2.2, trumpet: 1.9, reed: 2, strings: 1.8, choir: 2, bell: 1, jaw: 1.2, rise: 1, wind: 1, drone: 0.5 };
const trim = curve([[0, 3.2], [4.5, 3.2], [11.9, 1], [12, 1], [12.01, -0.7], [28, -0.1], [28.01, 0.3], [44, 0.3], [44.01, 3.6], [60, 3.6], [60.01, 1.5], [70, 2.5], [72, 2.5], [72.01, 0.6], [88, 0.6], [88.01, -6.5], [100, -5], [104, -2], [108, -2], [108.01, -0.3], [124, -0.3], [124.01, 1.7], [140, 1.7], [140.01, -0.1], [160, -0.1], [160.01, 0], [162, 4], [172, 4.7], [176, 3.2], [180, 3.2]]);

function put(s0, len, pan, gain, send) {
  const i0 = Math.max(0, -s0), i1 = Math.min(len, N - s0);
  const gl = Math.sqrt((1 - pan) / 2) * gain, gr = Math.sqrt((1 + pan) / 2) * gain, gs = send * gain;
  for (let i = i0; i < i1; i++) {
    const x = SCR[i], j = s0 + i;
    L[j] += x * gl; R[j] += x * gr; W[j] += x * gs;
  }
}
// Note: mixes SCR into the dry stereo bus and the reverb send, plus optional echo taps [delay, gain, pan].
function place(t, len, pan = 0, send = 0, echo = null) {
  if (len > SCR.length) throw new Error('voice too long');
  const s0 = Math.round((t - w0) * rate);
  put(s0, len, pan, voiceGain, send);
  if (echo) for (const [d, g, p] of echo) put(s0 + Math.round(d * rate), len, p, voiceGain * g, send * 0.6);
}
// Note: an RBJ biquad run in place over the scratch buffer.
function biquad(len, kind, f, q = 0.707, db = 0) {
  const w = TAU * Math.min(f, rate * 0.45) / rate, c = Math.cos(w), s = Math.sin(w), A = 10 ** (db / 40), al = s / (2 * q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (kind === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (kind === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else if (kind === 'bp') { b0 = al; b1 = 0; b2 = -al; }
  else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < len; i++) {
    const x = SCR[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; SCR[i] = y;
  }
}
const frac = (x) => x - Math.floor(x);
const TS = 4096, tables = new Map();
// Note: a band-limited one-cycle table, harmonics 1..nh at 1/k^roll, even harmonics scaled by (1-odd).
function table(nh, roll, odd = 0) {
  const key = `${nh}:${roll}:${odd}`;
  let t = tables.get(key);
  if (!t) {
    t = new Float32Array(TS + 1);
    for (let k = 1; k <= nh; k++) {
      const a = (1 / k ** roll) * (k % 2 === 0 ? 1 - odd : 1);
      for (let i = 0; i < TS; i++) t[i] += a * Math.sin(TAU * k * i / TS);
    }
    let peak = 0;
    for (let i = 0; i < TS; i++) peak = Math.max(peak, Math.abs(t[i]));
    for (let i = 0; i <= TS; i++) t[i] = i < TS ? t[i] / peak : t[0] / peak;
    tables.set(key, t);
  }
  return t;
}
const look = (t, ph) => { const x = ph * TS, i = x | 0; return t[i] + (t[i + 1] - t[i]) * (x - i); };
// Note: a Karplus-Strong string with a tuned loop; s is loop brightness (0.5 darkest), ring the decay in seconds.
function string(at, midi, len, vol, o, r) {
  const f = hz(midi), s = o.s ?? 0.5;
  const D = rate / f, M = Math.floor(D + s - 0.5), d = D + s - M, a = (1 - d) / (1 + d);
  const ring = new Float32Array(M);
  const exc = o.exc ?? 0;
  let prev = 0, mean = 0;
  for (let i = 0; i < M; i++) { prev += ((r() * 2 - 1) - prev) * (1 - exc); ring[i] = prev; mean += prev; }
  mean /= M;
  const tmp = ring.slice(), pk = Math.max(1, Math.round((o.pick ?? 0.15) * M));
  let power = 0;
  for (let i = 0; i < M; i++) { ring[i] = tmp[i] - mean - (tmp[(i + pk) % M] - mean) * (o.comb ?? 0.8); power += ring[i] * ring[i]; }
  const norm = 0.5 / Math.sqrt(power / M + 1e-9);
  for (let i = 0; i < M; i++) ring[i] *= norm;
  const g = 10 ** (-3 / ((o.ring ?? 1) * f)), tone = o.tone ?? 0.3, fade = len - Math.round(0.02 * rate);
  let p = 0, z = 0, sm = 0;
  for (let i = 0; i < len; i++) {
    const x0 = ring[p], p1 = p + 1 === M ? 0 : p + 1;
    const filt = ((1 - s) * x0 + s * ring[p1]) * g;
    const y = a * filt + z;
    z = filt - a * y;
    ring[p] = y; p = p1;
    sm += (x0 - sm) * tone;
    SCR[at + i] += sm * (i < 48 ? i / 48 : 1) * (i > fade ? (len - i) / (len - fade) : 1) * vol;
  }
}
const vowels = { o: [[500, 80, 1], [870, 110, 0.5], [2500, 170, 0.12]], a: [[800, 100, 1], [1250, 120, 0.6], [2800, 180, 0.2]] };
function vowelTable(f0, vowel) {
  const key = `v${Math.round(f0)}${vowel}`;
  let t = tables.get(key);
  if (!t) {
    t = new Float32Array(TS + 1);
    for (let k = 1; k * f0 < 4200; k++) {
      let a = 0;
      for (const [fc, bw, amp] of vowels[vowel]) a += amp / (1 + ((k * f0 - fc) / bw) ** 2);
      a /= k ** 0.5;
      for (let i = 0; i < TS; i++) t[i] += a * Math.sin(TAU * k * i / TS);
    }
    let peak = 0;
    for (let i = 0; i < TS; i++) peak = Math.max(peak, Math.abs(t[i]));
    for (let i = 0; i <= TS; i++) t[i] = i < TS ? t[i] / peak : t[0] / peak;
    tables.set(key, t);
  }
  return t;
}

const voices = {
  // Note: palm-muted plucked chug, a few strings struck almost together.
  chug(r, t, notes, dur, vol, pan = -0.25) {
    const len = Math.round((dur + 0.04) * rate); SCR.fill(0, 0, len);
    notes.forEach((m, j) => string(Math.round(j * 0.005 * rate), m, len - Math.round(j * 0.005 * rate), vol * 0.5, { ring: dur * 1.1, exc: 0.5, pick: 0.2, tone: 0.2 }, r));
    biquad(len, 'lp', 5000, 0.7);
    place(t, len, pan, 0.08);
  },
  // Note: an open strummed chord, the strings spread over about 40 ms.
  strum(r, t, notes, dur, vol, down, pan = 0) {
    const len = Math.round((dur + 0.1) * rate), sp = Math.round(0.011 * rate); SCR.fill(0, 0, len);
    const order = down ? notes : [...notes].reverse();
    order.forEach((m, j) => string(j * sp, m, len - j * sp, vol * (0.9 + 0.2 * r()), { ring: dur * 0.7, exc: 0.3, pick: 0.17, tone: 0.3 }, r));
    biquad(len, 'lp', 6000, 0.7);
    place(t, len, pan, 0.16);
  },
  pick(r, t, m, dur, vol, pan = -0.2) {
    const len = Math.round((dur + 0.05) * rate); SCR.fill(0, 0, len);
    string(0, m, len, vol, { ring: dur * 0.9, exc: 0.45, pick: 0.2, tone: 0.32 }, r);
    biquad(len, 'lp', 6000, 0.7);
    place(t, len, pan, 0.18);
  },
  // Note: bright twang guitar with a short spring-like smear, a plucked note.
  twang(r, t, m, dur, vol, pan = 0.2, o = {}) {
    const len = Math.round((dur + 0.3) * rate); SCR.fill(0, 0, len);
    string(0, m, len, vol, { ring: Math.max(0.6, dur), s: 0.36, exc: 0.1, pick: 0.11, tone: 0.55 }, r);
    biquad(len, 'peak', 2300, 1, 4); biquad(len, 'lp', 8000, 0.7);
    place(t, len, pan, 0.3, o.echo);
  },
  // Note: tremolo picking, the same note struck every 32nd so the tone seems held.
  tremolo(r, t, m, dur, vol, pan = 0.1, o = {}) {
    const gap = 0.075, hitsN = Math.max(1, Math.floor(dur / gap)), hl = Math.round(0.26 * rate), len = Math.round(dur * rate) + hl;
    SCR.fill(0, 0, len);
    for (let h = 0; h < hitsN; h++) {
      const u = h / hitsN, v = vol * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.1)));
      string(Math.max(0, Math.round((h * gap + (r() - 0.5) * 0.006) * rate)), m, hl, v, { ring: 0.22, s: 0.4, exc: 0.2, pick: 0.12, tone: 0.5 }, r);
    }
    biquad(len, 'peak', 2000, 1, 3); biquad(len, 'lp', 8000, 0.7);
    place(t, len, pan, 0.4, o.echo);
  },
  bass(r, t, m, dur, vol) {
    const len = Math.round((dur + 0.05) * rate), f = hz(m); SCR.fill(0, 0, len);
    string(0, m, len, vol * 0.9, { ring: Math.max(0.3, dur * 0.8), s: 0.5, exc: 0.7, pick: 0.25, tone: 0.1 }, r);
    for (let i = 0, ph = 0; i < len; i++) { ph += TAU * f / rate; SCR[i] += Math.sin(ph) * vol * 0.12 * Math.exp(-i / (rate * dur * 0.8)) * Math.min(1, i / 100); }
    biquad(len, 'lp', 700, 0.7);
    place(t, len, 0, 0.03);
  },
  kick(r, t, vol) {
    const len = Math.round(0.4 * rate); SCR.fill(0, 0, len);
    let ph = 0, e = 1; const k = Math.exp(-1 / (0.09 * rate));
    for (let i = 0; i < len; i++) {
      const x = i / rate;
      ph += TAU * (60 + 90 * Math.exp(-x / 0.025)) / rate;
      SCR[i] = (Math.tanh(1.9 * Math.sin(ph)) * e * 0.6 + (r() * 2 - 1) * Math.exp(-x / 0.004) * 0.3) * vol; e *= k;
    }
    biquad(len, 'lp', 4500, 0.7);
    place(t, len, 0, 0.04);
  },
  heart(r, t, vol) {
    const len = Math.round(0.5 * rate); SCR.fill(0, 0, len);
    for (const [at, f0, amp] of [[0, 84, 1], [0.27, 76, 0.7]]) {
      let ph = 0, e = 1; const k = Math.exp(-1 / (0.08 * rate)), s0 = Math.round(at * rate);
      for (let i = 0; s0 + i < len; i++) { ph += TAU * (62 + (f0 - 62) * Math.exp(-i / (rate * 0.03))) / rate; SCR[s0 + i] += Math.tanh(1.6 * Math.sin(ph)) * e * amp * Math.min(1, i / 60) * vol * 0.6; e *= k; }
    }
    place(t, len, 0, 0.1);
  },
  taiko(r, t, midi, vol, o = {}) {
    const f = hz(midi), len = Math.round((o.soft ? 0.5 : 1.1) * rate); SCR.fill(0, 0, len);
    for (const [ratio, amp, dec] of [[1, 1, 0.5], [1.5, 0.4, 0.25], [2.0, 0.28, 0.16], [2.56, 0.18, 0.1]]) {
      let ph = 0, e = amp; const k = Math.exp(-1 / (dec * 0.75 * (o.soft ? 0.5 : 1) * rate));
      for (let i = 0; i < len; i++) { ph += TAU * f * ratio * (1 + 0.25 * Math.exp(-i / (rate * 0.05))) / rate; SCR[i] += Math.sin(ph) * e; e *= k; }
    }
    for (let i = 0, n = Math.round(0.012 * rate); i < n; i++) SCR[i] += (r() * 2 - 1) * (1 - i / n) * (o.soft ? 0.15 : 0.45);
    biquad(len, 'lp', 3200, 0.7);
    for (let i = 0; i < len; i++) SCR[i] *= vol * 0.6;
    place(t, len, o.pan ?? 0, 0.16);
  },
  snare(r, t, vol, o = {}) {
    const len = Math.round((o.short ? 0.2 : 0.4) * rate); SCR.fill(0, 0, len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const x = i / rate;
      ph += TAU * (190 + 40 * Math.exp(-x / 0.02)) / rate;
      SCR[i] = ((r() * 2 - 1) * Math.exp(-x / 0.09) * 0.8 + Math.sin(ph) * Math.exp(-x / 0.05) * 0.55) * vol;
    }
    biquad(len, 'hp', 500, 0.7); biquad(len, 'peak', 4200, 0.8, 4); biquad(len, 'lp', 9000, 0.7);
    place(t, len, o.pan ?? 0, o.short ? 0.08 : 0.16);
  },
  rim(r, t, vol) {
    const len = Math.round(0.12 * rate); SCR.fill(0, 0, len);
    for (let i = 0; i < len; i++) {
      const x = i / rate;
      SCR[i] = (Math.sin(TAU * 1700 * x) * Math.exp(-x / 0.008) * 0.6 + Math.sin(TAU * 480 * x) * Math.exp(-x / 0.02) * 0.5 + (r() * 2 - 1) * Math.exp(-x / 0.004) * 0.4) * vol;
    }
    biquad(len, 'lp', 8000, 0.7);
    place(t, len, 0.1, 0.1);
  },
  shaker(r, t, vol, pan) {
    const len = Math.round(0.1 * rate); SCR.fill(0, 0, len);
    for (let i = 0; i < len; i++) { const x = i / rate; SCR[i] = (r() * 2 - 1) * Math.min(1, x / 0.005) * Math.exp(-x / 0.03) * vol; }
    biquad(len, 'bp', 6500, 0.8); biquad(len, 'lp', 10000, 0.7);
    place(t, len, pan, 0.06);
  },
  whip(r, t, vol, pan) {
    const len = Math.round(0.25 * rate); SCR.fill(0, 0, len);
    for (let i = 0; i < len; i++) {
      const x = i / rate;
      SCR[i] = (r() * 2 - 1) * (Math.exp(-x / 0.007) + 0.5 * Math.exp(-Math.abs(x - 0.022) / 0.004)) * vol;
    }
    biquad(len, 'hp', 1500, 0.7); biquad(len, 'peak', 3800, 0.7, 5); biquad(len, 'lp', 8500, 0.7);
    place(t, len, pan, 0.3);
  },
  tick(r, t, vol, hi) {
    const len = Math.round(0.08 * rate), f = hi ? 1500 : 1050; SCR.fill(0, 0, len);
    for (let i = 0; i < len; i++) { const x = i / rate; SCR[i] = (Math.sin(TAU * f * x) * Math.exp(-x / 0.012) + (r() * 2 - 1) * Math.exp(-x / 0.001) * 0.5) * vol; }
    biquad(len, 'lp', 7000, 0.7);
    place(t, len, hi ? -0.15 : 0.15, 0.12);
  },
  rise(r, t, dur, vol) {
    const len = Math.round((dur + 0.1) * rate); SCR.fill(0, 0, len);
    let low = 0, band = 0;
    for (let i = 0; i < len; i++) {
      const x = i / rate, u = Math.min(1, x / dur), fc = 400 * 12 ** u, ff = 2 * Math.sin(Math.PI * fc / rate), high = (r() * 2 - 1) - low - 0.5 * band;
      band += ff * high; low += ff * band;
      SCR[i] = band * u * u * vol * (x > dur ? Math.max(0, 1 - (x - dur) / 0.1) : 1) * 0.5;
    }
    place(t, len, 0, 0.3);
  },
  whistle(r, t, m, dur, vol, o = {}) {
    const len = Math.round(dur * rate), f = hz(m); SCR.fill(0, 0, len);
    let ph = 0, breath = 0;
    for (let i = 0; i < len; i++) {
      const x = i / rate, vib = 1 + 0.0035 * Math.min(1, x / 0.3) * Math.sin(TAU * 5.1 * x), bend = 2 ** (-(o.scoop ?? 0.35) * Math.exp(-x / 0.06) / 12);
      ph += TAU * f * vib * bend / rate;
      breath += ((r() * 2 - 1) - breath) * 0.055;
      const env = Math.max(0, Math.min(1, x / 0.13, (dur - x) / 0.18));
      SCR[i] = (Math.sin(ph) + 0.12 * Math.sin(ph * 2) + 0.04 * Math.sin(ph * 3) + breath * 0.12) * env * vol;
    }
    place(t, len, 0.2, 0.3, o.echo);
  },
  trumpet(r, t, m, dur, vol, pan = 0, o = {}) {
    const f0 = hz(m) * 2 ** ((o.cents ?? 0) / 1200), rel = 0.1, len = Math.round((dur + rel + 0.05) * rate);
    const nh = Math.max(3, Math.min(30, Math.floor(7500 / f0))), soft = table(nh, 1.9), bright = table(nh, 0.9);
    const fall = o.fall ?? 0, scoop = o.scoop ?? 0.7;
    let ph = r();
    for (let i = 0; i < len; i++) {
      const x = i / rate, rx = x - dur;
      const env = Math.min(1, x / 0.03) * (1 - 0.1 * Math.min(1, x / dur)) * (rx > 0 ? Math.max(0, 1 - rx / rel) : 1);
      const vib = 1 + 0.005 * Math.min(1, Math.max(0, (x - 0.25) / 0.3)) * Math.sin(TAU * 5.4 * x);
      const drop = fall ? fall * Math.min(1, Math.max(0, (x - (dur - 0.25)) / 0.3)) ** 2 : 0;
      ph = frac(ph + f0 * vib * 2 ** (-(scoop * Math.exp(-x / 0.04) + drop) / 12) / rate);
      const b = Math.min(1, 0.3 + 0.55 * env + 0.3 * Math.exp(-x / 0.06));
      SCR[i] = (look(soft, ph) * (1 - b) + look(bright, ph) * b + (r() * 2 - 1) * 0.05 * Math.exp(-x / 0.02)) * env * vol;
    }
    biquad(len, 'peak', 1250, 0.9, 6); biquad(len, 'lp', 4800, 0.7); biquad(len, 'hp', 160, 0.7);
    place(t, len, pan, 0.28, o.echo === true ? [[0.3, 0.14, -pan]] : o.echo);
  },
  reed(r, t, m, dur, vol, pan = 0.1) {
    const f0 = hz(m), len = Math.round((dur + 0.25) * rate), nh = Math.max(3, Math.min(26, Math.floor(6000 / f0))), tab = table(nh, 1.1, 0.5);
    let ph = r(), air = 0;
    for (let i = 0; i < len; i++) {
      const x = i / rate, rx = x - dur;
      const env = Math.min(1, x / 0.1) * (0.85 + 0.15 * Math.min(1, x / 0.8)) * (rx > 0 ? Math.max(0, 1 - rx / 0.2) : 1);
      const vib = 1 + 0.0045 * Math.min(1, Math.max(0, (x - 0.4) / 0.5)) * Math.sin(TAU * 4.9 * x);
      ph = frac(ph + f0 * vib * 2 ** (-0.6 * Math.exp(-x / 0.09) / 12) / rate);
      air += ((r() * 2 - 1) - air) * 0.3;
      const wah = 1 - 0.14 + 0.14 * Math.sin(TAU * 5 * x);
      SCR[i] = (look(tab, ph) * wah + air * 0.1) * env * vol;
    }
    biquad(len, 'hp', 230, 0.7); biquad(len, 'peak', 1700, 0.9, 5); biquad(len, 'lp', 4500, 0.7);
    place(t, len, pan, 0.4, [[0.6, 0.2, -pan]]);
  },
  strings(r, t, notes, dur, vol, o = {}) {
    const att = o.att ?? 0.8, rel = o.rel ?? 1, len = Math.round((dur + rel) * rate);
    notes.forEach((m, n) => [-7, 0, 7].forEach((cents, v) => {
      const f0 = hz(m) * 2 ** (cents / 1200), nh = Math.max(3, Math.min(24, Math.floor((o.bright ? 6000 : 4200) / f0))), tab = table(nh, 1.25);
      let ph = r();
      const tph = r() * TAU, tr = o.trem ?? 0, vr = 4.8 + 0.4 * v;
      for (let i = 0; i < len; i++) {
        const x = i / rate, env = Math.min(1, x / att) * Math.max(0, Math.min(1, (dur + rel - x) / rel));
        ph = frac(ph + f0 * (1 + 0.003 * Math.sin(TAU * vr * x)) / rate);
        const tm = tr ? 1 - 0.55 * (0.5 + 0.5 * Math.sin(TAU * tr * x + tph)) : 1;
        SCR[i] = look(tab, ph) * env * tm * vol * 0.45;
      }
      biquad(len, 'lp', o.bright ? 4200 : 2600, 0.7);
      place(t, len, (v - 1) * 0.5 + (n % 2 ? 0.1 : -0.1), 0.35);
    }));
  },
  choir(r, t, notes, dur, vol, vowel = 'o') {
    const att = 1.2, rel = 1.4, len = Math.round((dur + rel) * rate);
    notes.forEach((m, n) => [-6, 6].forEach((cents, v) => {
      const f0 = hz(m) * 2 ** (cents / 1200), tab = vowelTable(f0, vowel);
      let ph = r();
      for (let i = 0; i < len; i++) {
        const x = i / rate, env = Math.min(1, x / att) * Math.max(0, Math.min(1, (dur + rel - x) / rel));
        ph = frac(ph + f0 * (1 + 0.004 * Math.min(1, x / 1.5) * Math.sin(TAU * 5.2 * x + v)) / rate);
        SCR[i] = look(tab, ph) * env * vol * 0.5;
      }
      place(t, len, v ? 0.45 : -0.45, 0.45);
    }));
  },
  bell(r, t, m, vol) {
    const f = hz(m), len = Math.round(9 * rate); SCR.fill(0, 0, len);
    for (const [ratio, amp, dec] of [[0.5, 0.5, 8], [1, 1, 7], [1.2, 0.7, 5], [1.5, 0.4, 4], [2, 0.45, 3.2], [2.5, 0.2, 2.4], [2.67, 0.18, 2], [3, 0.12, 1.6], [4.1, 0.08, 1.1]]) {
      for (const det of [0, 0.7 + ratio * 0.25]) {
        const w = TAU * (f * ratio + det) / rate, c = Math.cos(w), s = Math.sin(w), k = 10 ** (-3 / (dec * rate));
        let x = 1, y = 0, e = amp * (det ? 0.6 : 1);
        for (let i = 0; i < len; i++) { SCR[i] += y * e * Math.min(1, i / 150); const nx = x * c - y * s; y = x * s + y * c; x = nx; e *= k; }
      }
    }
    biquad(len, 'lp', 2800, 0.7);
    for (let i = 0; i < len; i++) SCR[i] *= vol * 0.5;
    place(t, len, 0.2, 0.7);
  },
  jaw(r, t, m, dur, vol, pan) {
    const f0 = hz(m), len = Math.round(dur * rate), tab = table(Math.min(40, Math.floor(6000 / f0)), 0.4);
    SCR.fill(0, 0, len);
    let ph = 0, low = 0, band = 0;
    for (let i = 0; i < len; i++) {
      const x = i / rate;
      ph = frac(ph + f0 / rate);
      const fc = 350 * 2 ** (2.6 * (0.5 - 0.5 * Math.cos(TAU * 2.4 * x))), ff = 2 * Math.sin(Math.PI * fc / rate), high = look(tab, ph) - low - 0.2 * band;
      band += ff * high; low += ff * band;
      SCR[i] = band * 0.25 * Math.exp(-x / (dur * 0.35)) * Math.min(1, x / 0.004) * vol;
    }
    place(t, len, pan, 0.3, [[0.45, 0.25, -pan]]);
  },
  // Note: chunked noise wind, a rumble and a slowly moving howl, with levels from a curve of absolute time.
  wind(r, t, dur, level) {
    const len = Math.round(dur * rate), fl = Math.round(1.2 * rate); SCR.fill(0, 0, len);
    let rumble = 0, low = 0, band = 0;
    for (let i = 0; i < len; i++) {
      const ta = t + i / rate, x = r() * 2 - 1;
      rumble += (x - rumble) * 0.02;
      const fc = 650 + 300 * Math.sin(TAU * ta * 5 / duration) + 150 * Math.sin(TAU * ta * 13 / duration + 1), ff = 2 * Math.sin(Math.PI * fc / rate), high = x - low - 0.12 * band;
      band += ff * high; low += ff * band;
      const swell = 0.6 + 0.4 * Math.sin(TAU * ta * 16 / duration + 0.5);
      const fade = Math.sin(Math.PI / 2 * Math.min(1, i / fl, (len - i) / fl));
      SCR[i] = (rumble * 0.55 + band * 0.12 * swell) * level(ta) * fade;
    }
    place(t, len, 0, 0.25);
  },
  drone(r, t, dur, freqs, level) {
    const len = Math.round(dur * rate), fl = Math.round(1.2 * rate), tab = table(7, 1.1); SCR.fill(0, 0, len);
    for (let i = 0; i < len; i++) {
      const ta = t + i / rate, fade = Math.min(1, i / fl, (len - i) / fl);
      let s = 0;
      for (const [f, w] of freqs) s += look(tab, frac(f * ta)) * w;
      SCR[i] = s * level(ta) * fade * 0.16;
    }
    biquad(len, 'lp', 500, 0.7);
    place(t, len, 0, 0.1);
  },
};

// Note: render the events in the window
const all = events.concat(events.filter((e) => e.t >= duration - 14).map((e) => ({ ...e, t: e.t - duration })));
for (const e of all.sort((a, b) => a.t - b.t)) {
  if (e.t < w0 - 12 || e.t > to) continue;
  voiceGain = (mix[e.voice] ?? 1) * 10 ** (trim(e.t) / 20);
  voices[e.voice](voiceRandom(e.id), e.t, ...e.a);
}

// Note: an eight-line feedback delay network gives the wide reverb on the send bus.
{
  const lens = [1423, 1637, 1873, 2089, 2333, 2557, 2791, 3023], rt60 = 3.4, damp = 0.5;
  const lines = lens.map((m) => new Float32Array(m)), pos = lens.map(() => 0);
  const g = lens.map((m) => 10 ** (-3 * m / (rate * rt60)));
  const lp = new Float64Array(8), v = new Float64Array(8), u = new Float64Array(8);
  const pdL = Math.round(0.028 * rate), pdR = Math.round(0.041 * rate);
  let hpL = 0, hpR = 0;
  for (let i = 0; i < N; i++) {
    const inL = i >= pdL ? W[i - pdL] : 0, inR = i >= pdR ? W[i - pdR] : 0;
    hpL += (inL - hpL) * 0.03; hpR += (inR - hpR) * 0.03;
    const xl = inL - hpL, xr = inR - hpR;
    for (let j = 0; j < 8; j++) { v[j] = lines[j][pos[j]]; lp[j] += (v[j] - lp[j]) * damp; u[j] = lp[j] * g[j]; }
    for (let h = 1; h < 8; h *= 2) for (let a = 0; a < 8; a += 2 * h) for (let b = a; b < a + h; b++) { const p = u[b], q = u[b + h]; u[b] = p + q; u[b + h] = p - q; }
    for (let j = 0; j < 8; j++) { lines[j][pos[j]] = u[j] * 0.35355339 + (j % 2 ? xr : xl) * 0.5; if (++pos[j] === lens[j]) pos[j] = 0; }
    const wl = (v[0] - v[1] + v[2] - v[3] + v[4] - v[5] + v[6] - v[7]) * 0.35, wr = (v[0] + v[1] - v[2] - v[3] + v[4] + v[5] - v[6] - v[7]) * 0.35;
    L[i] += wl * 0.9; R[i] += wr * 0.9;
  }
}

// Note: master and WAV
const MASTER = 0.1425;
const skip = Math.round(PRE * rate), length = N - skip;
const data = Buffer.alloc(44 + length * 4);
data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
data.write('data', 36); data.writeUInt32LE(length * 4, 40);
// Note: the soft clip only touches stray peaks above 0.8.
const clip = (x) => { const a = Math.abs(x); return a < 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); };
// Note: a 40 Hz high-pass (two poles) cuts subsonic weight, a 2-pole low-pass at 11 kHz keeps hash out of the top octave.
const lw = TAU * 11000 / rate, lc = Math.cos(lw), la = Math.sin(lw) / (2 * 0.707), l0 = ((1 - lc) / 2) / (1 + la), l1 = (1 - lc) / (1 + la), l2 = l0, m1 = (-2 * lc) / (1 + la), m2 = (1 - la) / (1 + la);
let xl = 0, yl = 0, xr = 0, yr = 0, xl2 = 0, yl2 = 0, xr2 = 0, yr2 = 0, aL1 = 0, aL2 = 0, bL1 = 0, bL2 = 0, aR1 = 0, aR2 = 0, bR1 = 0, bR2 = 0;
for (let i = 0; i < N; i++) {
  yl = L[i] - xl + 0.9943 * yl; xl = L[i];
  yr = R[i] - xr + 0.9943 * yr; xr = R[i];
  yl2 = yl - xl2 + 0.9943 * yl2; xl2 = yl; yr2 = yr - xr2 + 0.9943 * yr2; xr2 = yr;
  const fl = l0 * yl2 + l1 * aL1 + l2 * aL2 - m1 * bL1 - m2 * bL2; aL2 = aL1; aL1 = yl2; bL2 = bL1; bL1 = fl;
  const fr = l0 * yr2 + l1 * aR1 + l2 * aR2 - m1 * bR1 - m2 * bR2; aR2 = aR1; aR1 = yr2; bR2 = bR1; bR1 = fr;
  if (i < skip) continue;
  const ta = from + (i - skip) / rate;
  const fade = Math.min(1, ta / 0.12, (duration - ta) / 0.2);
  const o = 44 + (i - skip) * 4;
  data.writeInt16LE(Math.round(clip(fl * MASTER * fade) * 32767), o);
  data.writeInt16LE(Math.round(clip(fr * MASTER * fade) * 32767), o + 2);
}
writeFileSync(args[0], data);
