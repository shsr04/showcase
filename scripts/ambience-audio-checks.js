// Serve public/ on port 4173 (or rely on the route below, which answers from disk), then:
// playwright-cli run-code --filename=scripts/ambience-audio-checks.js
// playwright-cli eval 'window.audioChecks'
// Uses OfflineAudioContext; no microphone or speaker playback is needed.
async page => {
    await page.route('http://127.0.0.1:4173/**', route => route.fulfill({ path: 'public/ambience/index.html', contentType: 'text/html' }));
    await page.goto('http://127.0.0.1:4173/ambience/');
    const results = await page.evaluate(async () => {
        const results = [];
        for (const sampleRate of [44100, 48000]) {
            const seconds = 200;
            const ctx = new OfflineAudioContext(2, sampleRate * seconds, sampleRate);
            const engine = new SoundEngine(ctx, 2026);
            const cycle = new ListeningCycle(0, () => 0.25);
            const captures = [];
            const onsets = [];
            let maxVoices = 0;
            let suspended = ctx.suspend(0.1);
            const rendered = ctx.startRendering();
            const originalPlay = engine.playVoice.bind(engine);
            engine.playVoice = (kind, midi, when) => { onsets.push({ kind, when }); return originalPlay(kind, midi, when); };
            for (let step = 1; step < seconds * 10; step++) {
                await suspended;
                const now = ctx.currentTime;
                const event = cycle.update(now, {db:step < 600 ? -62 : (step % 6 < 3 ? -55 : -24),low:0.4,high:0.1});
                if (event?.kind === 'play') {
                    engine.adapt(event.room);
                    engine.fade(1, event.fade);
                } else if (event?.kind === 'quiet') engine.fade(0, event.fade);
                if (cycle.phase === 'listening') captures.push(Math.floor(now * sampleRate));
                // A big room event at 100 s gets weather; a small one at 130 s gets one soft note. Never a flourish.
                if (step === 1000) engine.respond(0.9, now);
                if (step === 1300) engine.respond(0.3, now);
                engine.tick(now, cycle.phase === 'playing');
                maxVoices = Math.max(maxVoices, engine.notes.size);
                if (step < seconds * 10 - 1) suspended = ctx.suspend((step + 1) / 10);
                await ctx.resume();
            }
            const buffer = await rendered;
            let peak = 0, square = 0, stepPeak = 0, curvature = 0, bad = 0, silencePeak = 0;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < data.length; i++) {
                    if (!Number.isFinite(data[i])) bad++;
                    peak = Math.max(peak, Math.abs(data[i]));
                    square += data[i] * data[i];
                    if (i) stepPeak = Math.max(stepPeak, Math.abs(data[i] - data[i - 1]));
                    if (i > 1) curvature = Math.max(curvature, Math.abs(data[i] - 2 * data[i - 1] + data[i - 2]));
                }
                for (const frame of captures) silencePeak = Math.max(silencePeak, Math.abs(data[frame]));
            }
            // Bed swells have no onset; same-voice notes within 2.5 s are one phrase; other attacks keep clear of each other.
            let smallestGap = Infinity, previous = null;
            for (const onset of onsets) {
                const pair = previous?.kind === onset.kind && onset.when - previous.when < 2.5;
                if (previous && previous.kind !== 'breath' && onset.kind !== 'breath' && !pair) smallestGap = Math.min(smallestGap, onset.when - previous.when);
                previous = onset;
            }
            const kinds = [...new Set(onsets.map(onset => onset.kind))];
            const answer = engine.responses.find(response => response.kind === 'weather' && response.when > 102 && response.when < 105.5);
            const reply = engine.responses.find(response => response.kind === 'note' && response.when > 132 && response.when < 135.5);
            const flourish = onsets.find(onset => onset.kind === 'marimba' && onset.when > 100 && onset.when < 106);
            // Melodic budget: attacks (not bed or wind) between 10 s and 130 s in the calm half.
            const melodic = onsets.filter(onset => onset.kind !== 'breath' && onset.kind !== 'air' && onset.when > 10 && onset.when < 130).length;
            // A click steps by about the peak itself; even a 2.5 kHz partial steps under 0.36 of it. Curvature catches isolated clicks.
            if (stepPeak > peak * 0.4 || curvature > 0.012 || bad || peak >= 0.5 || peak < 0.01 || silencePeak > 0.000001 || maxVoices > 24 || smallestGap < 0.85 || onsets.length < 20 || kinds.length < 4 || !answer || !reply || flourish || melodic > 22) {
                throw new Error(JSON.stringify({sampleRate,bad,peak,stepPeak,curvature,silencePeak,maxVoices,smallestGap,onsets:onsets.length,kinds,answer,reply,flourish,melodic}));
            }
            engine.dispose();
            if (engine.nodes.length || engine.notes.size) throw new Error('Resources survive disposal');
            results.push({sampleRate,seconds,peak,rms:Math.sqrt(square/(buffer.length*2)),maximumSampleStep:stepPeak,maximumCurvature:curvature,silencePeak,maxVoices,smallestGap,onsets:onsets.length,kinds,answeredAt:answer.when,repliedAt:reply.when,melodicPer120s:melodic,badSamples:bad});
        }
        for (const kind of [...KINDS, 'breath']) {
            const ctx = new OfflineAudioContext(2, 48000 * 24, 48000);
            const engine = new SoundEngine(ctx, 42);
            engine.gate.gain.value = 1;
            const midi = { air: null, harp: engine.harmony.midi(4), pizz: engine.harmony.midi(-9) }[kind] ?? engine.harmony.midi(0);
            const length = engine.playVoice(kind, midi, 0.1);
            const rendered = await ctx.startRendering();
            let peak = 0, tail = 0, stepPeak = 0;
            for (let channel = 0; channel < 2; channel++) {
                const data = rendered.getChannelData(channel);
                for (let i = 0; i < data.length; i++) {
                    peak = Math.max(peak, Math.abs(data[i]));
                    if (i) stepPeak = Math.max(stepPeak, Math.abs(data[i] - data[i - 1]));
                    if (i > 23 * 48000) tail = Math.max(tail, Math.abs(data[i]));
                }
            }
            if (peak < 0.001 || peak > 0.5 || stepPeak > peak * 0.4 || tail > 0.0001 || engine.notes.size || length > 14.01) {
                throw new Error(JSON.stringify({kind,peak,stepPeak,tail,length,voices:engine.notes.size}));
            }
            engine.dispose();
            results.push({voice:kind,peak,maximumSampleStep:stepPeak,length,tail,cleanedUp:true});
        }
        const ctx = new OfflineAudioContext(1, 48000 * 2, 48000);
        const source = ctx.createConstantSource();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        Object.defineProperty(gain.gain, 'cancelAndHoldAtTime', {value:undefined});
        source.connect(gain).connect(ctx.destination);
        source.start();
        easeAudio(gain.gain, 1, 0, 1);
        const paused = ctx.suspend(0.5);
        const rendering = ctx.startRendering();
        await paused;
        easeAudio(gain.gain, 0, ctx.currentTime, 0.5);
        await ctx.resume();
        const data = (await rendering).getChannelData(0);
        let biggestStep = 0;
        for (let i = 1; i < data.length; i++) biggestStep = Math.max(biggestStep, Math.abs(data[i]-data[i-1]));
        if (biggestStep > 0.005 || Math.abs(data[72000]) > 0.000001) throw new Error('Fallback automation is not smooth');
        results.push({automationFallback:'pass',maximumSampleStep:biggestStep});
        return results;
    });
    await page.evaluate(results => { window.audioChecks = results; }, results);
}
