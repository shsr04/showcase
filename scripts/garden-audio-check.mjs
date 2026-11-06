// Note: sanity check for public/garden/js/audio.js using a minimal fake AudioContext; no sockets, no audio output.

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const audioUrl = pathToFileURL(path.join(here, '..', 'public', 'garden', 'js', 'audio.js')).href;

const stats = { created: {}, paramCalls: 0, bad: [], contexts: [], peakLive: 0 };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function bad(msg) {
  stats.bad.push(msg);
  throw new Error(msg);
}

class FakeParam {
  constructor(name, value) {
    this.name = name;
    this._v = value;
  }
  get value() {
    return this._v;
  }
  set value(v) {
    if (!fin(v)) bad(`${this.name}.value = ${v}`);
    this._v = v;
  }
  _chk(fn, ...args) {
    stats.paramCalls++;
    for (const a of args) if (!fin(a)) bad(`${this.name}.${fn}(${args.join(',')}) non-finite`);
    if (args[args.length - 1] < 0 && fn !== 'setTargetAtTime') bad(`${this.name}.${fn} negative time`);
  }
  setValueAtTime(v, t) {
    this._chk('setValueAtTime', v, t);
    if (t < 0) bad(`${this.name}.setValueAtTime negative time`);
    return this;
  }
  linearRampToValueAtTime(v, t) {
    this._chk('linearRampToValueAtTime', v, t);
    return this;
  }
  exponentialRampToValueAtTime(v, t) {
    this._chk('exponentialRampToValueAtTime', v, t);
    if (!(v > 0)) bad(`${this.name}.exponentialRampToValueAtTime target ${v} must be > 0`);
    return this;
  }
  setTargetAtTime(v, t, tc) {
    this._chk('setTargetAtTime', v, t, tc);
    if (t < 0) bad(`${this.name}.setTargetAtTime negative time`);
    if (tc < 0) bad(`${this.name}.setTargetAtTime negative constant`);
    return this;
  }
  cancelScheduledValues(t) {
    this._chk('cancelScheduledValues', t);
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.out = new Set();
    this.disconnected = false;
    stats.created[kind] = (stats.created[kind] || 0) + 1;
    ctx.nodes.push(this);
  }
  connect(dest) {
    assert.ok(dest instanceof FakeNode || dest instanceof FakeParam, `${this.kind}.connect to invalid target`);
    this.out.add(dest);
    return dest;
  }
  disconnect() {
    this.out.clear();
    this.disconnected = true;
  }
}

class FakeSource extends FakeNode {
  constructor(ctx, kind) {
    super(ctx, kind);
    this.startAt = null;
    this.stopAt = Infinity;
    this.ended = false;
    this.onended = null;
  }
  stop(t) {
    if (!fin(t)) bad(`${this.kind}.stop(${t})`);
    if (this.startAt === null) bad(`${this.kind}.stop before start`);
    if (t < this.startAt) bad(`${this.kind}.stop before startAt`);
    this.stopAt = t;
  }
}

class FakeCtx {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.state = 'suspended';
    this.nodes = [];
    this.live = new Set();
    this.destination = new FakeNode(this, 'destination');
    stats.contexts.push(this);
  }
  _gain() {
    const n = new FakeNode(this, 'gain');
    n.gain = new FakeParam('gain.gain', 1);
    return n;
  }
  createGain() {
    return this._gain();
  }
  createOscillator() {
    const n = new FakeSource(this, 'oscillator');
    n.type = 'sine';
    n.frequency = new FakeParam('osc.frequency', 440);
    n.detune = new FakeParam('osc.detune', 0);
    n.start = (t = 0) => {
      if (!fin(t)) bad(`osc.start(${t})`);
      n.startAt = t;
      this.live.add(n);
    };
    return n;
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'biquad');
    n.type = 'lowpass';
    n.frequency = new FakeParam('biquad.frequency', 350);
    n.Q = new FakeParam('biquad.Q', 1);
    n.gain = new FakeParam('biquad.gain', 0);
    return n;
  }
  createBufferSource() {
    const n = new FakeSource(this, 'bufferSource');
    n.buffer = null;
    n.loop = false;
    n.loopStart = 0;
    n.loopEnd = 0;
    n.playbackRate = new FakeParam('src.playbackRate', 1);
    n.start = (when = 0, offset = 0, duration) => {
      if (!fin(when) || !fin(offset)) bad(`bufferSource.start(${when},${offset})`);
      if (!n.buffer) bad('bufferSource.start without buffer');
      if (offset < 0 || offset > n.buffer.duration) bad(`bufferSource offset ${offset} out of range`);
      if (duration !== undefined) {
        if (!fin(duration) || duration < 0) bad(`bufferSource duration ${duration}`);
        if (!n.loop && offset + duration > n.buffer.duration + 1e-6) bad('bufferSource slice beyond buffer');
        n.stopAt = when + duration;
      }
      if (n.loop && !(n.loopStart >= 0 && n.loopEnd > n.loopStart && n.loopEnd <= n.buffer.duration + 1e-6)) bad('bad loop points');
      n.startAt = when;
      this.live.add(n);
    };
    return n;
  }
  createBuffer(ch, length, sampleRate) {
    if (!(ch >= 1 && length > 0 && sampleRate > 0)) bad('createBuffer bad args');
    const data = Array.from({ length: ch }, () => new Float32Array(length));
    return { numberOfChannels: ch, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i] };
  }
  createConvolver() {
    const n = new FakeNode(this, 'convolver');
    n.buffer = null;
    n.normalize = true;
    return n;
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam(`comp.${k}`, 0);
    return n;
  }
  createStereoPanner() {
    const n = new FakeNode(this, 'panner');
    n.pan = new FakeParam('panner.pan', 0);
    return n;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  advance(dt) {
    this.currentTime += dt;
    for (const n of this.live) {
      if (n.stopAt <= this.currentTime && !n.ended) {
        n.ended = true;
        this.live.delete(n);
        if (typeof n.onended === 'function') n.onended();
      }
    }
    stats.peakLive = Math.max(stats.peakLive, this.live.size);
  }
}

globalThis.AudioContext = FakeCtx;

const { createAudio } = await import(audioUrl);
const NAMES = [
  'dig', 'raise', 'water', 'fire', 'sow', 'clear', 'rain', 'wind', 'sun', 'snow', 'build', 'built', 'craft',
  'born', 'arrive', 'pass', 'discover', 'invent', 'link', 'undo', 'tool', 'step', 'arrival', 'splash', 'tier',
  'chime', 'horn', 'omen', 'thunder', 'calling', 'bells', 'spectacle', 'beacon', 'visitor', 'relic', 'deed', 'teach',
];

// Note: step 1) Before start every method is a no-op.
{
  const a = createAudio();
  const before = stats.contexts.length;
  a.update(0.016, { time: 0.5 });
  for (const n of NAMES) a.event(n, { pan: 0.3 });
  a.setMuted(true);
  assert.equal(a.isMuted(), true);
  a.setMuted(false);
  assert.equal(a.isMuted(), false);
  a.dispose();
  assert.equal(stats.contexts.length, before, 'no AudioContext before start()');
  console.log('1) pre-start no-ops ok');
}

const audio = createAudio();
audio.start();
audio.start();
assert.equal(stats.contexts.length, 1, 'start() twice creates one context');
const ctx = stats.contexts[0];
const continuous = ctx.nodes.filter((n) => !n.disconnected).length;
console.log(`2) nodes after start (infra + continuous layers): ${continuous}`);

// Note: step 2) Long run with varied contexts, including hostile values.
const FRAMES = 12000;
const dt = 1 / 60;
const hostile = [NaN, Infinity, -Infinity, undefined, null, 'x', -3, 7];
let maxLiveNodes = 0;
for (let i = 0; i < FRAMES; i++) {
  const s = i / FRAMES;
  const c = {
    time: (s * 3) % 1,
    wind: 0.5 + 0.5 * Math.sin(s * 40),
    rain: Math.max(0, Math.sin(s * 9)),
    snow: Math.max(0, Math.sin(s * 5 + 2)),
    mood: 0.5 + 0.5 * Math.sin(s * 13),
    activity: 0.5 + 0.5 * Math.sin(s * 23),
    zoom: 0.5 + 0.5 * Math.sin(s * 31),
    fire: Math.max(0, Math.sin(s * 17)),
    water: Math.max(0, Math.sin(s * 11 + 1)),
    folk: Math.floor(s * 60),
  };
  if (i % 997 === 0) for (const k of Object.keys(c)) c[k] = hostile[(i / 997 + k.length) % hostile.length | 0];
  if (i % 4001 === 0) audio.update(hostile[(i / 4001) % hostile.length | 0], c);
  if (i === 6000) audio.update(0.016, undefined);
  ctx.advance(dt);
  audio.update(i % 50 === 0 ? 0.2 : dt, c);
  if (i % 7 === 0) audio.event(NAMES[(i / 7) % NAMES.length | 0], { pan: Math.sin(i), gain: 0.5 + 0.5 * Math.cos(i), pitch: 0.8 + 0.4 * Math.sin(i / 9) });
  if (i % 3000 === 0) audio.setMuted(i % 6000 === 0);
  if (i % 500 === 0) maxLiveNodes = Math.max(maxLiveNodes, ctx.nodes.filter((n) => !n.disconnected).length);
}
console.log(`3) ${FRAMES} update() calls ok`);

// Note: step 3) Every event name, with odd options.
for (const n of NAMES) {
  ctx.advance(0.5);
  audio.event(n);
  ctx.advance(0.5);
  audio.event(n, { pan: -5, gain: 99, pitch: 100 });
  ctx.advance(0.5);
  audio.event(n, { pan: NaN, gain: NaN, pitch: NaN });
  ctx.advance(0.5);
  audio.event(n, null);
}
audio.event('nope');
console.log(`4) fired ${NAMES.length} event names ok`);

// Note: step 4) Rate limiting: spam at one instant creates one voice group at most.
{
  ctx.advance(2);
  const before = ctx.nodes.length;
  for (let i = 0; i < 200; i++) audio.event('tool');
  const tool1 = ctx.nodes.length - before;
  ctx.advance(2);
  const b2 = ctx.nodes.length;
  audio.event('tool');
  const tool2 = ctx.nodes.length - b2;
  assert.equal(tool1, tool2, 'tool spam equals a single event');
  console.log(`5) rate limit ok (200 spam calls = ${tool1} nodes, same as one call)`);
}

// Note: step 5) Stress: everything maxed, day and night.
for (const time of [0.5, 0.02]) {
  for (let i = 0; i < 3000; i++) {
    ctx.advance(dt);
    audio.update(dt, { time, wind: 1, rain: 1, snow: 1, mood: 1, activity: 1, zoom: 1, fire: 1, water: 1, folk: 500 });
    if (i % 5 === 0) audio.event(NAMES[(i / 5) % NAMES.length | 0]);
  }
}
for (let i = 0; i < 120; i++) {
  ctx.advance(0.1);
  audio.update(0.1, { time: 0.5 });
}
const liveSources = ctx.live.size;
const liveNodes = ctx.nodes.filter((n) => !n.disconnected).length;

audio.dispose();
assert.equal(ctx.state, 'closed');
audio.update(0.016, { time: 0.5 });
audio.event('dig');

// Note: step 6) Restart after dispose works.
audio.start();
assert.equal(stats.contexts.length, 2);
audio.dispose();

assert.equal(stats.bad.length, 0, `bad param calls: ${stats.bad.join('; ')}`);
const total = Object.values(stats.created).reduce((a, b) => a + b, 0);
console.log(`6) stress, dispose, restart ok`);
console.log(`nodes created in total: ${total}`, JSON.stringify(stats.created));
console.log(`live nodes after settling: ${liveNodes} (live sources ${liveSources}), peak live nodes sampled in run: ${maxLiveNodes}`);
console.log(`peak concurrent playing sources: ${stats.peakLive}`);
console.log(`AudioParam calls: ${stats.paramCalls}, bad: ${stats.bad.length}`);
console.log('OK');
