const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const file = path.join(__dirname, '../public/ambience/index.html');
const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const source = html.match(/<script id="ambience-core">([\s\S]*?)<\/script>/)?.[1];
let api;
if (source) {
    const sandbox = { Float32Array, Math };
    vm.runInNewContext(source + '\nthis.api = { acousticFrame, summarizeRoom, compose, ListeningCycle, chooseEnsemble, seededRandom, Harmony, KINDS, fitRange, humCandidate, tuneRoot, RoomEvents, ARRANGEMENT, loudnessWeight, bedColours, speechIndex };', sandbox);
    api = sandbox.api;
}

test('silent input produces a finite, quiet composition', () => {
    assert.ok(api, 'Ambience core is available');
    const frame = api.acousticFrame(new Float32Array(2048), new Float32Array(1024).fill(-Infinity), 48000);
    const room = api.summarizeRoom(Array(60).fill(frame));
    assert.equal(room.energy, 0);
    assert.equal(room.activity, 0);
    for (const value of Object.values(api.compose(room))) assert.ok(Number.isFinite(value));
});

test('a low hum and a bright spectrum produce different spectral responses', () => {
    const wave = Float32Array.from({ length: 2048 }, (_, i) => 0.1 * Math.sin(i * 0.03));
    const low = new Float32Array(1024).fill(-100);
    const high = new Float32Array(1024).fill(-100);
    low[5] = -20;
    high[200] = -20;
    const lowRoom = api.summarizeRoom(Array(60).fill(api.acousticFrame(wave, low, 48000)));
    const highRoom = api.summarizeRoom(Array(60).fill(api.acousticFrame(wave, high, 48000)));
    assert.ok(api.compose(lowRoom).marimba > api.compose(highRoom).marimba, 'marimba fills a dull room');
    assert.ok(api.compose(lowRoom).pizz < api.compose(highRoom).pizz, 'pizz fills an empty low band');
    assert.ok(api.compose(highRoom).cutoff < api.compose(lowRoom).cutoff);
});

test('intermittent noise thins the notes and leans on the bed without changing master gain', () => {
    const quiet = { db: -65, low: 0.3, high: 0.2 };
    const burst = { db: -24, low: 0.3, high: 0.2 };
    const calm = api.compose(api.summarizeRoom(Array(60).fill(quiet)));
    const busy = api.compose(api.summarizeRoom(Array.from({ length: 60 }, (_, i) => i % 6 < 3 ? quiet : burst)));
    assert.ok(busy.noteInterval > calm.noteInterval);
    assert.ok(busy.motion < calm.motion);
    assert.ok(busy.breath > calm.breath);
    assert.ok(busy.marimba < calm.marimba);
    assert.ok(busy.budget < calm.budget);
    assert.equal(busy.master, calm.master);
});

test('room character changes the voice palette, not just the filter', () => {
    const hum = api.compose({ energy: 0.5, activity: 0, low: 0.9, high: 0.02, tonal: 0.9 });
    const hiss = api.compose({ energy: 0.5, activity: 0, low: 0.02, high: 0.9, tonal: 0.02 });
    assert.ok(hum.harp > hiss.harp * 2);
    assert.ok(hum.air > hiss.air * 2);
    assert.ok(hum.marimba > hiss.marimba * 2);
});

test('playing ends with a release before the gate closes for listening', () => {
    const cycle = new api.ListeningCycle(0, () => 0.25);
    const quiet = { db: -65, low: 0.3, high: 0.2 };
    const playback = { db: -10, low: 0.9, high: 0.05 };
    let event;
    for (let i = 1; i <= 60; i++) event = cycle.update(i / 10, quiet) || event;
    assert.equal(event.kind, 'play');
    const initialEnergy = event.room.energy;
    for (let i = 61; i < 1560; i++) assert.equal(cycle.update(i / 10, playback), null);
    assert.equal(cycle.update(156, playback).kind, 'release');
    assert.equal(cycle.phase, 'releasing');
    for (let i = 1561; i < 1680; i++) assert.equal(cycle.update(i / 10, playback), null);
    assert.equal(cycle.update(168, playback).kind, 'quiet');
    for (let i = 1681; i <= 1720; i++) assert.equal(cycle.update(i / 10, playback), null);
    event = null;
    for (let i = 1721; i <= 1760; i++) event = cycle.update(i / 10, quiet) || event;
    assert.equal(event.kind, 'play');
    assert.equal(event.room.energy, initialEnergy);
});

test('a delayed timer must collect a fresh window instead of using stale measurements', () => {
    const cycle = new api.ListeningCycle(0, () => 0.25);
    const frame = { db: -50, low: 0.3, high: 0.2 };
    cycle.update(0.1, frame);
    assert.equal(cycle.update(20, frame), null);
    assert.equal(cycle.phase, 'listening');
    let event;
    for (let i = 201; i <= 260; i++) event = cycle.update(i / 10, frame) || event;
    assert.equal(event.kind, 'play');
});

test('background timer throttling still completes initial and periodic listening windows', () => {
    const cycle = new api.ListeningCycle(0, () => 0.25);
    const events = [];
    for (let second = 1; second <= 200; second++) {
        const event = cycle.update(second, { db: -50, low: 0.3, high: 0.2 });
        if (event?.kind === 'play') events.push(second);
    }
    assert.deepEqual(events, [6, 176]);
});

test('successive ensembles change membership and expose every voice', () => {
    const settings = api.compose({ energy: 0.2, activity: 0.1, low: 0.3, high: 0.2, tonal: 0.4 });
    const random = api.seededRandom(42);
    let previous = [];
    const heard = new Set();
    for (let i = 0; i < 20; i++) {
        const voices = api.chooseEnsemble(settings, random, previous);
        assert.equal(voices.length, 3);
        assert.equal(new Set(voices).size, 3);
        assert.ok(voices.some(voice => !previous.includes(voice)));
        voices.forEach(voice => heard.add(voice));
        previous = voices;
    }
    assert.deepEqual([...heard].sort(), [...api.KINDS].sort());
    assert.ok(!api.KINDS.includes('breath'), 'the bed is not an ensemble voice');
});

test('harmony stays inside the current mode and moves mostly by step', () => {
    const harmony = new api.Harmony(api.seededRandom(7));
    const voice = { step: 0, low: -6, high: 8 };
    let previous = null, small = 0, count = 0;
    for (let i = 0; i < 300; i++) {
        const midi = harmony.next(voice);
        assert.ok(harmony.degrees.includes(((midi - harmony.root) % 12 + 12) % 12));
        if (previous !== null) {
            assert.ok(Math.abs(midi - previous) <= 12);
            if (Math.abs(midi - previous) <= 4) small++;
            count++;
        }
        previous = midi;
    }
    assert.ok(small / count > 0.5);
});

test('harmony refuses semitone clashes against ringing notes', () => {
    const harmony = new api.Harmony(api.seededRandom(3));
    const voice = { step: 0, low: -6, high: 8 };
    for (let i = 0; i < 200; i++) {
        const ringing = [harmony.root + 4, harmony.root + 11];
        const midi = harmony.next(voice, ringing);
        if (midi === null) continue;
        for (const other of ringing) assert.ok(![1, 13].includes(Math.abs(midi - other)), `${midi} clashes with ${other}`);
    }
});

test('mode drift changes one degree at a time', () => {
    const harmony = new api.Harmony(api.seededRandom(11));
    for (let i = 0; i < 40; i++) {
        const before = harmony.degrees;
        const after = harmony.drift();
        assert.equal(after.length, 6);
        const changed = after.filter(degree => !before.includes(degree)).length;
        assert.ok(changed <= 1, `changed ${changed} degrees`);
    }
});

test('motif pitches are moved by octaves into a voice range', () => {
    assert.equal(api.fitRange(40, 55, 76), 64);
    assert.equal(api.fitRange(90, 55, 76), 66);
    assert.equal(api.fitRange(60, 55, 76), 60);
    assert.equal(api.fitRange(50, 60, 64), 62);
});

test('a persistent narrow peak in the listening spectrum is reported as a hum', () => {
    const rate = 48000, size = 16384;
    const flat = new Float32Array(size).fill(-95);
    assert.equal(api.humCandidate(flat, rate), null);
    const spectrum = new Float32Array(size).fill(-95);
    const bin = Math.round(100 / (rate / (size * 2)));
    spectrum[bin - 1] = -70; spectrum[bin] = -60; spectrum[bin + 1] = -72;
    const hum = api.humCandidate(spectrum, rate);
    assert.ok(Math.abs(hum.hz - 100) < 1.5, `hum at ${hum.hz}`);
    assert.ok(hum.prominence > 20);
    const broad = new Float32Array(size).fill(-95);
    for (let i = bin - 40; i <= bin + 40; i++) broad[i] = -60;
    assert.equal(api.humCandidate(broad, rate), null);
});

test('the room summary keeps a hum only when most frames agree on it', () => {
    const steady = Array.from({ length: 40 }, () => ({ db: -60, low: 0.3, high: 0.1, tonal: 0.5, hum: { hz: 99.5, prominence: 25 } }));
    assert.ok(Math.abs(api.summarizeRoom(steady).hum - 99.5) < 0.01);
    const fleeting = steady.map((frame, i) => i % 3 ? { ...frame, hum: null } : frame);
    assert.equal(api.summarizeRoom(fleeting).hum, null);
});

test('tuning places the hum on the root or fifth and keeps the root in the middle register', () => {
    const onRoot = api.tuneRoot(110);
    assert.ok([57, 69].includes(onRoot.root) || onRoot.root % 12 === 9);
    assert.ok(onRoot.root >= 57 && onRoot.root <= 68);
    assert.ok(Math.abs(onRoot.cents) < 1);
    const offPitch = api.tuneRoot(113);
    assert.ok(Math.abs(offPitch.cents) > 10 && Math.abs(offPitch.cents) < 50);
    const fifth = api.tuneRoot(110, 'fifth');
    assert.equal(((fifth.root + 7) % 12 + 12) % 12, 9);
});

test('room events fire on a sudden rise the output cannot explain, and stay quiet otherwise', () => {
    const events = new api.RoomEvents();
    let fired = [];
    for (let i = 0; i < 60; i++) fired.push(events.update(i / 10, -58 + (i % 2), -70, false));
    assert.ok(fired.every(event => event === null), 'a steady room is silent');
    assert.ok(events.update(6.0, -40, -70, false) > 0.3, 'a door bang is an event');
    assert.equal(events.update(6.1, -40, -70, false), null, 'an event is reported once');
    for (let i = 62; i < 120; i++) events.update(i / 10, -58, -70, false);
    assert.equal(events.update(12.0, -40, -45, false), null, 'our own loud output is not an event');
    for (let i = 121; i < 180; i++) events.update(i / 10, -58, -70, false);
    assert.equal(events.update(18.0, -40, -70, true), null, 'our own pluck is masked');
    for (let i = 181; i < 240; i++) events.update(i / 10, -58, -70, false);
    assert.ok(events.update(24.0, -30, -70, false) > 0.6, 'a louder event is stronger');
    assert.equal(events.times.length, 2);
    assert.ok(Math.abs(events.pace() - 18) < 0.01);
});

test('modulation moves by a fifth, stays in the middle register, and respects a room hum', () => {
    const harmony = new api.Harmony(api.seededRandom(5));
    for (let i = 0; i < 30; i++) {
        const before = harmony.root;
        const after = harmony.modulate();
        assert.ok([5, 7].includes(((after - before) % 12 + 12) % 12), `${before} -> ${after}`);
        assert.ok(after >= 57 && after <= 68);
    }
    harmony.root = 57;
    harmony.anchor = 9;
    for (let i = 0; i < 30; i++) {
        harmony.modulate();
        assert.ok([0, 7].includes(((9 - harmony.root) % 12 + 12) % 12));
    }
});

test('every voice has a complete seat in the arrangement', () => {
    for (const kind of [...api.KINDS, 'breath']) {
        const part = api.ARRANGEMENT[kind];
        assert.ok(part, kind);
        assert.ok(part.register[0] <= part.register[1]);
        assert.ok(Math.abs(part.pan[0]) + part.pan[1] <= 1);
        assert.ok(['near', 'mid', 'far'].includes(part.depth));
        assert.ok(part.trim > 0 && part.density > 0 && part.cutoff > 0);
    }
});

test('loudness weighting follows the ISO 226 40-phon shape relative to 300 Hz, capped at +6 dB', () => {
    const relative = hz => 20 * Math.log10(api.loudnessWeight(hz) / api.loudnessWeight(300));
    assert.ok(Math.abs(relative(130) - 6) < 1.5, `130 Hz: ${relative(130)}`);
    assert.ok(Math.abs(relative(1000) + 8) < 1.5, `1 kHz: ${relative(1000)}`);
    assert.ok(Math.abs(relative(3000) + 12) < 1.5, `3 kHz: ${relative(3000)}`);
    assert.ok(relative(65) >= relative(130));
    assert.ok(api.loudnessWeight(65) <= api.loudnessWeight(80), 'the bass boost is capped');
});

test('below 200 Hz the harmony refuses intervals closer than a fifth, and rough sevenths high up', () => {
    const harmony = new api.Harmony(api.seededRandom(9));
    harmony.root = 60;
    const bass = { step: -10, low: -12, high: -7 };
    for (let i = 0; i < 150; i++) {
        const midi = harmony.next(bass, [36]);
        if (midi === null) continue;
        assert.ok(midi === 36 || Math.abs(midi - 36) >= 7, `${midi} crowds the bass`);
    }
    const treble = { step: 8, low: 6, high: 14 };
    for (let i = 0; i < 150; i++) {
        const midi = harmony.next(treble, [72]);
        if (midi === null) continue;
        assert.ok(![1, 11, 13, 14].includes(Math.abs(midi - 72)), `${midi} is rough against 72`);
    }
});

test('the bed keeps only fifth, octave, and tenth over a low bass note', () => {
    const degrees = [0, 2, 4, 7, 9, 11];
    assert.deepEqual(Array.from(api.bedColours(48, degrees, 1)), [7, 12, 16]);
    assert.deepEqual(Array.from(api.bedColours(48, degrees, 0.7)), [7, 12]);
    assert.ok(api.bedColours(60, degrees, 0.7).every(interval => [7, 12, 16].includes(interval)));
});

test('the mode chain holds only the comfortable modes', () => {
    const harmony = new api.Harmony(api.seededRandom(3));
    const seen = new Set();
    for (let i = 0; i < 60; i++) { harmony.drift(); seen.add(harmony.degrees.join(',')); }
    assert.deepEqual([...seen].sort(), ['0,2,3,7,9,10', '0,2,4,7,9,10', '0,2,4,7,9,11']);
});

test('speech is read from fast modulation of the speech band, not from our own slow notes', () => {
    const talking = Array.from({ length: 30 }, (_, i) => -50 + (i % 2 ? 4 : -4) + (i % 5 === 0 ? 3 : 0));
    const steady = Array.from({ length: 30 }, () => -50);
    const plucks = Array.from({ length: 30 }, (_, i) => i < 10 ? -60 + (i === 0 ? 12 : 0) - i : -70 + (i === 15 ? 14 : 0) - (i - 15) * 0.5);
    const silent = Array.from({ length: 30 }, () => -85);
    assert.ok(api.speechIndex(talking) > 0.7, `talking ${api.speechIndex(talking)}`);
    assert.equal(api.speechIndex(steady), 0);
    assert.ok(api.speechIndex(plucks) < 0.2, `plucks ${api.speechIndex(plucks)}`);
    assert.equal(api.speechIndex(silent), 0);
});

test('speech in the room thins the melodic voices and the wind', () => {
    const quiet = api.compose({ energy: 0.3, activity: 0.2, low: 0.3, high: 0.3, tonal: 0.2, speech: 0 });
    const talk = api.compose({ energy: 0.3, activity: 0.2, low: 0.3, high: 0.3, tonal: 0.2, speech: 1 });
    for (const kind of ['guitar', 'felt', 'harp', 'marimba']) assert.ok(talk[kind] < quiet[kind] * 0.4, kind);
    assert.ok(talk.air < quiet.air * 0.6);
    assert.equal(talk.breath, quiet.breath);
});

test('a hum is reported at its fundamental when the strongest peak is a harmonic', () => {
    const rate = 48000, size = 16384, binWidth = rate / (size * 2);
    const spectrum = new Float32Array(size).fill(-95);
    const set = (hz, db) => { const bin = Math.round(hz / binWidth); spectrum[bin - 1] = db - 10; spectrum[bin] = db; spectrum[bin + 1] = db - 12; };
    set(100, -72);
    set(200, -60);
    set(300, -66);
    const hum = api.humCandidate(spectrum, rate);
    assert.ok(Math.abs(hum.hz - 100) < 1.5, `hum at ${hum.hz}`);
});

test('the play length varies so the listening gap has no fixed period', () => {
    const short = new api.ListeningCycle(0, () => 0);
    const long = new api.ListeningCycle(0, () => 1);
    const frame = { db: -50, low: 0.3, high: 0.2 };
    const playUntil = cycle => {
        let seconds = 1;
        while (cycle.update(seconds, frame)?.kind !== 'play') seconds++;
        while (cycle.update(++seconds, frame)?.kind !== 'release');
        return seconds;
    };
    const a = playUntil(short), b = playUntil(long);
    assert.ok(b - a >= 100, `${a} vs ${b}`);
});
