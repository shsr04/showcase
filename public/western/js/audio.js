// Note: procedural WebAudio for every cue the HUD would otherwise carry; nothing plays before a user gesture.

import { angleDiff, clamp } from './rand.js';
import { blipsFor, voiceFor } from './blips.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let beatAt = 0;
  let wind = null;
  let muffle = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    // Note: item 499: a low-pass on everything, closed by a blast close by and opening as hearing returns.
    muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 20000;
    master.connect(muffle).connect(comp).connect(ctx.destination);
    const n = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    startWind();
    return ctx;
  }

  function startWind() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(bp.frequency);
    src.connect(bp).connect(g).connect(master);
    src.start();
    lfo.start();
    wind = { g };
  }

  // Note: one chain per cue; the cutoff carries wall muffling, the pan carries direction.
  function chain(v) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = v.cut;
    const g = ctx.createGain();
    g.gain.value = v.gain;
    const out = lp;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = v.pan;
      lp.connect(g).connect(p).connect(master);
    } else {
      lp.connect(g).connect(master);
    }
    return out;
  }

  function tone(dest, { f0, f1 = f0, dur, type = 'sine', gain = 0.5, at = 0, attack = 0.004 }) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dest, { dur, type = 'lowpass', f0 = 1000, f1 = f0, q = 0.7, gain = 0.5, at = 0, attack = 0.002 }) {
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  const step = (d, f, w) => {
    noise(d, { dur: 0.09, f0: f, f1: f * 0.6, gain: 0.6 * w, q: 1.2 });
    tone(d, { f0: f * 0.45, f1: f * 0.25, dur: 0.08, gain: 0.3 * w });
  };
  const creak = (d, dur, f0, f1, w) => {
    tone(d, { f0, f1, dur, type: 'sawtooth', gain: 0.12 * w, attack: 0.08 });
    noise(d, { dur, type: 'bandpass', f0: f0 * 3, f1: f1 * 3, q: 4, gain: 0.18 * w, attack: 0.05 });
  };
  const click = (d, at, f = 2600, gain = 0.5) => noise(d, { dur: 0.03, type: 'bandpass', f0: f, f1: f * 0.8, q: 5, gain, at });
  const shatter = (d) => {
    for (let i = 0; i < 9; i++) noise(d, { dur: 0.08 + Math.random() * 0.1, type: 'highpass', f0: 2500 + Math.random() * 3000, q: 1, gain: 0.35, at: i * 0.025 + Math.random() * 0.02 });
  };
  const gun = (d, big) => {
    noise(d, { dur: 0.05, type: 'highpass', f0: 1800, q: 0.7, gain: 0.9 });
    noise(d, { dur: big ? 0.7 : 0.45, type: 'lowpass', f0: big ? 1800 : 1400, f1: 120, q: 0.6, gain: 1 });
    tone(d, { f0: big ? 90 : 120, f1: 35, dur: big ? 0.35 : 0.25, gain: 0.9 });
    // Note: a late soft echo off the walls.
    noise(d, { dur: 0.5, type: 'lowpass', f0: 600, f1: 150, gain: 0.25, at: 0.09 });
  };

  const RECIPES = {
    walk: (d) => step(d, 420, 0.6),
    crouch: (d) => step(d, 360, 0.4),
    slow: (d) => step(d, 300, 0.25),
    sprint: (d) => {
      step(d, 520, 1);
      step(d, 480, 0.9);
    },
    door_quiet: (d) => creak(d, 0.7, 180, 140, 0.5),
    door: (d) => {
      creak(d, 0.45, 260, 190, 1);
      tone(d, { f0: 110, f1: 70, dur: 0.12, gain: 0.5, at: 0.4 });
    },
    door_force: (d) => {
      noise(d, { dur: 0.25, f0: 900, f1: 100, gain: 1 });
      tone(d, { f0: 140, f1: 45, dur: 0.3, gain: 0.9 });
      noise(d, { dur: 0.15, type: 'bandpass', f0: 1500, q: 1, gain: 0.7, at: 0.03 });
    },
    window_open: (d) => noise(d, { dur: 0.5, type: 'bandpass', f0: 500, f1: 1400, q: 3, gain: 0.45, attack: 0.08 }),
    window_break: shatter,
    glass: shatter,
    gunshot_rifle: (d) => gun(d, true),
    gunshot_handgun: (d) => gun(d, false),
    reload: (d) => {
      click(d, 0, 2200);
      click(d, 0.14, 3000);
      click(d, 0.3, 2600, 0.35);
    },
    cycle: (d) => {
      click(d, 0, 1800, 0.6);
      click(d, 0.12, 2600, 0.6);
    },
    switch: (d) => {
      noise(d, { dur: 0.25, type: 'bandpass', f0: 700, f1: 1100, q: 2, gain: 0.3, attack: 0.05 });
      click(d, 0.22, 2400, 0.4);
    },
    body: (d) => {
      tone(d, { f0: 90, f1: 40, dur: 0.2, gain: 0.8 });
      noise(d, { dur: 0.15, f0: 400, f1: 120, gain: 0.5 });
    },
    impact: (d) => {
      noise(d, { dur: 0.1, type: 'bandpass', f0: 900, q: 1, gain: 0.7 });
      tone(d, { f0: 200, f1: 80, dur: 0.1, gain: 0.4 });
    },
    impact_wood: (d) => {
      noise(d, { dur: 0.09, type: 'bandpass', f0: 1600, f1: 700, q: 1.2, gain: 0.7 });
      tone(d, { f0: 260, f1: 100, dur: 0.09, gain: 0.4 });
    },
    impact_metal: (d) => {
      noise(d, { dur: 0.04, type: 'highpass', f0: 2200, gain: 0.5 });
      tone(d, { f0: 2200, f1: 1600, dur: 0.16, type: 'triangle', gain: 0.35 });
    },
    impact_ground: (d) => {
      noise(d, { dur: 0.12, type: 'lowpass', f0: 850, f1: 250, gain: 0.7 });
      tone(d, { f0: 140, f1: 55, dur: 0.1, gain: 0.3 });
    },
    swish: (d) => noise(d, { dur: 0.16, type: 'bandpass', f0: 3400, f1: 1300, q: 1.4, gain: 0.7, attack: 0.03 }),
    knife: (d) => {
      noise(d, { dur: 0.12, type: 'bandpass', f0: 900, f1: 350, q: 1, gain: 0.45 });
      tone(d, { f0: 140, f1: 70, dur: 0.12, gain: 0.3 });
    },
    scavenge: (d) => noise(d, { dur: 0.6, type: 'bandpass', f0: 1200, f1: 800, q: 1, gain: 0.25, attack: 0.1 }),
    drop: (d) => {
      tone(d, { f0: 150, f1: 70, dur: 0.12, gain: 0.6 });
      noise(d, { dur: 0.12, type: 'bandpass', f0: 1800, f1: 900, q: 2, gain: 0.5 });
      click(d, 0.14, 2200, 0.35);
      click(d, 0.26, 2600, 0.2);
    },
    // Note: item 499: a match struck and flaring, a fuse spitting, a stick knocking on wood, and the blast.
    match: (d) => {
      noise(d, { dur: 0.12, type: 'bandpass', f0: 3200, f1: 1800, q: 1.5, gain: 0.5 });
      noise(d, { dur: 0.5, type: 'bandpass', f0: 1400, f1: 900, q: 0.8, gain: 0.3, at: 0.08, attack: 0.04 });
    },
    fuse: (d) => {
      for (let i = 0; i < 6; i++) noise(d, { dur: 0.05 + Math.random() * 0.06, type: 'highpass', f0: 3500 + Math.random() * 3500, q: 0.7, gain: 0.22 + Math.random() * 0.2, at: i * 0.08 + Math.random() * 0.03 });
      noise(d, { dur: 0.5, type: 'bandpass', f0: 5200, q: 0.6, gain: 0.14, attack: 0.03 });
    },
    stick: (d) => {
      tone(d, { f0: 240, f1: 120, dur: 0.07, gain: 0.45 });
      noise(d, { dur: 0.07, type: 'bandpass', f0: 1300, f1: 700, q: 1.4, gain: 0.5 });
    },
    blast: (d) => {
      // Note: the crack of the front, the deep thump, a long rolling rumble, the room or the hills answering, and debris pattering down.
      noise(d, { dur: 0.06, type: 'highpass', f0: 1200, q: 0.6, gain: 1 });
      tone(d, { f0: 70, f1: 22, dur: 1.4, gain: 1, attack: 0.003 });
      tone(d, { f0: 46, f1: 18, dur: 2.2, gain: 0.8, attack: 0.01 });
      noise(d, { dur: 2.8, type: 'lowpass', f0: 2600, f1: 60, q: 0.5, gain: 1, attack: 0.004 });
      noise(d, { dur: 2.2, type: 'lowpass', f0: 500, f1: 50, q: 0.7, gain: 0.7, at: 0.15, attack: 0.08 });
      noise(d, { dur: 1.6, type: 'lowpass', f0: 380, f1: 70, q: 0.7, gain: 0.35, at: 0.55, attack: 0.1 });
      for (let i = 0; i < 16; i++) noise(d, { dur: 0.03 + Math.random() * 0.05, type: 'bandpass', f0: 900 + Math.random() * 2400, q: 2, gain: 0.08 + Math.random() * 0.12, at: 0.6 + Math.random() * 1.6 });
    },
    collapse: (d) => {
      // Note: timbers cracking and boards and plaster coming down for a second or two after the blast.
      for (let i = 0; i < 7; i++) noise(d, { dur: 0.12 + Math.random() * 0.2, type: 'bandpass', f0: 500 + Math.random() * 1400, f1: 200, q: 1.2, gain: 0.35 + Math.random() * 0.3, at: 0.15 + i * 0.12 + Math.random() * 0.1 });
      tone(d, { f0: 90, f1: 35, dur: 1.2, gain: 0.5, at: 0.2, attack: 0.05 });
      noise(d, { dur: 1.8, type: 'lowpass', f0: 900, f1: 120, gain: 0.45, at: 0.25, attack: 0.1 });
    },
    climb: (d) => {
      noise(d, { dur: 0.3, type: 'bandpass', f0: 800, f1: 500, q: 1.5, gain: 0.4, attack: 0.05 });
      tone(d, { f0: 100, f1: 70, dur: 0.12, gain: 0.4, at: 0.3 });
    },
  };

  const gainOf = (level) => clamp(Math.pow(Math.max(0, (level - 8) / 92), 1.5), 0, 1);

  function play(kind, v, material = null) {
    if (kind === 'impact' && material) {
      if (['plank', 'frame', 'door', 'wood', 'heavy', 'barrel', 'fence'].includes(material)) kind = 'impact_wood';
      else if (material === 'iron') kind = 'impact_metal';
      else if (['ground', 'earth', 'adobe', 'stone', 'hay', 'plant'].includes(material)) kind = 'impact_ground';
    }
    const recipe = RECIPES[kind];
    if (!recipe || !ctx) return;
    recipe(chain(v));
  }

  // Note: item 499: ringing ears after a blast: a high whine and the world dulled, both fading as hearing returns.
  function deafen(db) {
    if (!ctx || !muffle || db < 10) return;
    const t = ctx.currentTime;
    const secs = db * 0.5;
    const k = clamp(db / 45, 0, 1);
    muffle.frequency.cancelScheduledValues(t);
    muffle.frequency.setValueAtTime(Math.max(260, 2400 * (1 - k)), t + 0.05);
    muffle.frequency.exponentialRampToValueAtTime(20000, t + secs);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 3900 + Math.random() * 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06 * k + 0.01, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs * 0.8);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + secs);
  }

  // Note: one pseudo-voice blip; a vowel is a pitched wave with its body plus two formant bands, a hiss or tick is filtered noise.
  function blip(dest, b, wave) {
    const t = ctx.currentTime + b.at;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(b.gain, t + 0.008);
    env.gain.setValueAtTime(b.gain, t + b.dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + b.dur);
    env.connect(dest);
    const band = (src, f, q, w) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = w;
      src.connect(bp).connect(g).connect(env);
    };
    if (b.type === 'vowel' || b.type === 'hum') {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.setValueAtTime(b.f0, t);
      o.frequency.linearRampToValueAtTime(b.f1, t + b.dur);
      const body = ctx.createBiquadFilter();
      body.type = 'lowpass';
      body.frequency.value = 1500;
      const bg = ctx.createGain();
      bg.gain.value = 0.7;
      o.connect(body).connect(bg).connect(env);
      band(o, b.form[0], 3, 2.2);
      band(o, b.form[1], 5, 1.4);
      o.start(t);
      o.stop(t + b.dur + 0.02);
    } else {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      band(s, b.form[0], b.type === 'tick' ? 2 : 1.4, b.type === 'tick' ? 3 : 4);
      s.start(t, Math.random() * 1.5);
      s.stop(t + b.dur + 0.02);
    }
  }

  // Note: a spoken line goes through the same pan, gain and muffle chain as any other cue.
  function talk(c, facing) {
    const rel = c.own ? 0 : angleDiff(facing, c.dir);
    const behind = Math.cos(rel) < 0 ? 1 + Math.cos(rel) * 0.4 : 1;
    // Note: speech keeps a higher floor than other sounds so a shout through a wall is dull but still audible.
    const cut = (900 + 16000 * Math.pow(1 - clamp(c.muffle || 0, 0, 1), 3)) * behind;
    const gain = c.own ? 0.15 : Math.min(0.27, 0.07 + gainOf(c.level) * 0.45);
    const voice = voiceFor(c.role, c.actorId || 0, c.kind);
    const dest = chain({ gain, pan: c.own ? 0 : Math.sin(rel) * 0.9, cut });
    for (const b of blipsFor(c.text, voice, c.mode)) blip(dest, b, voice.wave);
  }

  return {
    // Note: call from a click or key handler; later calls only resume the context.
    start() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.8;
    },
    isMuted: () => muted,
    // Note: speech cues come from speechCues(); the bubble shows the words, this plays the pseudo-voice.
    talk(cue, follow) {
      if (!ctx || ctx.state !== 'running' || muted || !follow) return;
      talk(cue, follow.facing);
    },
    // Note: events come from sim.drain(); only the followed listener's heard events carry sound.
    handle(events, follow) {
      if (!ctx || ctx.state !== 'running' || muted) return;
      const facing = follow ? follow.facing : 0;
      const ownShot = events.some((e) => e.type === 'heard' && e.own && String(e.kind).startsWith('gunshot'));
      for (const e of events) {
        if (e.type === 'heard') {
          const own = !!e.own;
          const rel = own ? 0 : angleDiff(facing, e.dir);
          const behind = Math.cos(rel) < 0 ? 1 + Math.cos(rel) * 0.4 : 1;
          const cut = (400 + 17600 * Math.pow(1 - clamp(e.muffle || 0, 0, 1), 3)) * behind;
          play(e.kind, { gain: gainOf(e.level) * (own ? 0.7 : 1), pan: own ? 0 : Math.sin(rel) * 0.9, cut }, e.material);
        } else if (e.type === 'shot' && follow && e.actorId === follow.id && !ownShot) {
          play(e.weaponId === 'winchester73' ? 'gunshot_rifle' : 'gunshot_handgun', { gain: 1, pan: 0, cut: 18000 });
        } else if (e.type === 'click' && follow && e.actorId === follow.id) {
          play('cycle', { gain: 0.5, pan: 0, cut: 14000 });
        } else if (e.type === 'hit' && follow && e.actorId === follow.id) {
          play('body', { gain: 0.9, pan: 0, cut: 6000 });
        } else if (e.type === 'deafened' && follow && e.actorId === follow.id) deafen(e.db);
      }
    },
    deafen: (db) => deafen(db),
    // Note: heartbeat and breath come in as the followed character bleeds.
    update(bleed) {
      if (!ctx || ctx.state !== 'running' || muted) return;
      const now = ctx.currentTime;
      if (wind) wind.g.gain.value = 0.03;
      if (bleed < 0.12) return;
      if (now < beatAt) return;
      const rate = 0.95 - bleed * 0.5;
      beatAt = now + rate;
      const d = chain({ gain: 0.25 + bleed * 0.5, pan: 0, cut: 400 });
      tone(d, { f0: 62, f1: 40, dur: 0.14, gain: 0.9 });
      tone(d, { f0: 56, f1: 38, dur: 0.12, gain: 0.7, at: 0.17 });
      if (bleed > 0.35) noise(chain({ gain: 0.1 + bleed * 0.15, pan: 0, cut: 1800 }), { dur: 0.5, type: 'bandpass', f0: 600, f1: 400, q: 1, gain: 0.5, attack: 0.15, at: 0.3 });
    },
  };
}
