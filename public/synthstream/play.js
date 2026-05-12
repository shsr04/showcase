async function play() {
    await ensureAudio();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const now = audioCtx.currentTime;
    isPlaying = true;
    nextStepTime = now + 0.04;
    currentStep = visibleStep;
    window.clearInterval(schedulerId);
    schedulerId = window.setInterval(scheduler, LOOKAHEAD_MS);
    els.play.textContent = "Pause";
    els.readout.textContent = `${BPM} BPM / 4/4 / 16 Steps / Playing`;
    setStatus("Playing");
    if (!insertWorkletReady) setStatus("Playing; insert FX bypassed");
}

function scheduler() {
    while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
        scheduleStep(currentStep, nextStepTime);
        nextStepTime += stepTime;
        currentStep = (currentStep + 1) % STEPS;
    }
}

function playKick(deck, lane, time, velocity) {
    const library = activeLibrary(deck);
    const kick = library.kick;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const click = audioCtx.createBufferSource();
    const clickGain = audioCtx.createGain();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;

    osc.type = "sine";
    osc.frequency.setValueAtTime(kick.start, time);
    osc.frequency.exponentialRampToValueAtTime(kick.end, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(kick.gain * velocity, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + kick.decay);
    click.buffer = noiseBuffer;
    clickGain.gain.setValueAtTime(kick.click * velocity, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);
    osc.connect(gain);
    click.connect(clickGain);
    gain.connect(out);
    clickGain.connect(out);
    osc.start(time);
    click.start(time);
    osc.stop(time + kick.decay + 0.04);
    click.stop(time + 0.03);
}

function playBass(deck, lane, time, step, velocity) {
    const library = activeLibrary(deck);
    const bass = library.bass;
    const noteIndex = lane.notes[(step + seed) % lane.notes.length] + bass.noteOffset;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;
    const freq = SCALE[noteIndex + 2] || 73.42;

    osc.type = bass.oscillator;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(bass.filterStart + seeded(step) * bass.filterSpread, time);
    filter.frequency.exponentialRampToValueAtTime(bass.filterPeak + seeded(step + 10) * 700, time + 0.05);
    filter.frequency.exponentialRampToValueAtTime(bass.filterEnd, time + Math.max(0.08, bass.decay - 0.02));
    filter.Q.value = bass.resonance;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(bass.gain * velocity, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + bass.decay);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    osc.start(time);
    osc.stop(time + bass.decay + 0.04);
}

function playHat(deck, lane, time, velocity) {
    const hat = activeLibrary(deck).hat;
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const pan = audioCtx.createStereoPanner();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;

    noise.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = hat.frequency + velocity * hat.spread;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(hat.gain * velocity, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + hat.decay);
    pan.pan.value = seeded(time * 10) * 0.8 - 0.4;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(out);
    noise.start(time);
    noise.stop(time + hat.decay + 0.04);
}

function playPerc(deck, lane, time, step, velocity) {
    const perc = activeLibrary(deck).perc;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const pan = audioCtx.createStereoPanner();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;
    osc.type = "triangle";
    osc.frequency.value = perc.frequency + seeded(step) * perc.spread;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(perc.gain * velocity, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + perc.decay);
    pan.pan.value = seeded(step + perc.panSeed) * 1.3 - 0.65;
    osc.connect(gain);
    gain.connect(pan);
    pan.connect(out);
    osc.start(time);
    osc.stop(time + perc.decay + 0.04);
}

function playLead(deck, lane, time, step, velocity) {
    const lead = activeLibrary(deck).lead;
    const noteIndex = lane.notes[(step + seed) % lane.notes.length];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const pan = audioCtx.createStereoPanner();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;
    osc.type = lead.oscillator;
    osc.frequency.value = (SCALE[noteIndex] || 146.83) * lead.octave;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lead.filterStart, time);
    filter.frequency.exponentialRampToValueAtTime(lead.filterPeak, time + 0.08);
    filter.Q.value = 2.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(lead.gain * velocity, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + lead.decay);
    pan.pan.value = Math.sin((step + seed) * 0.7) * 0.45;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(out);
    osc.start(time);
    osc.stop(time + lead.decay + 0.06);
}

function playDrone(deck, lane, time, step, symbol) {
    if (symbol === "~") return;

    const drone = activeLibrary(deck).drone;
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;
    const root = SCALE[lane.notes[0]] || 36.71;
    [root, SCALE[lane.notes[1]] || root * 2].forEach((freq, voice) => {
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        osc.type = voice === 0 ? "sawtooth" : "triangle";
        osc.frequency.value = freq * drone.octave;
        osc.detune.value = voice === 0 ? -5 : 7;
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(drone.filterBase + (seed % 6) * drone.filterStep + voice * 80, time);
        filter.Q.value = 4.5;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(drone.gain / (voice + 1), time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + stepTime * 4.05);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(out);
        osc.start(time);
        osc.stop(time + stepTime * 4.2);
    });
}

function playTexture(deck, lane, time, velocity) {
    const texture = activeLibrary(deck).texture;
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    const pan = audioCtx.createStereoPanner();
    const out = laneNodes[nodeKey(deck.id, lane.id)].gain;
    noise.buffer = noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = texture.frequency + seeded(time) * texture.spread;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(texture.gain * velocity, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + texture.decay);
    pan.pan.value = seeded(time * 5) * 1.2 - 0.6;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(out);
    noise.start(time);
    noise.stop(time + texture.decay + 0.08);
}

function shouldPlaySymbol(deck, lane, step, symbol) {
    if (symbol === symbol.toUpperCase() || symbol === "~") return true;

    const library = activeLibrary(deck);
    const densityVoices = ["hat", "perc", "texture"];
    const density = densityVoices.includes(lane.voice) ? library.percussionDensity : 1;
    const chance = clamp(library.probabilityAmount * density, 0.05, 0.98);
    const laneSeed = lane.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return seeded(step * 19 + laneSeed + seed * 7) <= chance;
}

function grooveOffset(deck, step) {
    const library = activeLibrary(deck);
    const swingOffset = step % 2 === 1 ? library.swing * stepTime : 0;
    const groove = library.groove || [];
    return Math.max(0, swingOffset + (groove[step % groove.length] || 0) * stepTime);
}

function playLane(deck, lane, step, time) {
    if (!isLaneActive(lane)) return;

    const symbol = lane.pattern[step];
    if (!symbol || symbol === "-") return;
    if (!shouldPlaySymbol(deck, lane, step, symbol)) return;

    const velocity = symbol === symbol.toUpperCase() && symbol !== "~" ? 1 : 0.55;
    lane.lastPulse = performance.now();
    scheduleUiPulse(deck.id, lane.id, time);

    if (lane.voice === "kick") {
        triggerPump(deck.id, time);
        playKick(deck, lane, time, velocity);
    }
    if (lane.voice === "bass") playBass(deck, lane, time, step, velocity);
    if (lane.voice === "hat") playHat(deck, lane, time, velocity);
    if (lane.voice === "perc") playPerc(deck, lane, time, step, velocity);
    if (lane.voice === "lead") playLead(deck, lane, time, step, velocity);
    if (lane.voice === "drone") playDrone(deck, lane, time, step, symbol);
    if (lane.voice === "texture") playTexture(deck, lane, time, velocity);
}

function triggerPump(deckId, time) {
    const insert = deckNodes[deckId]?.insert;
    if (insert?.port) insert.port.postMessage({ type: "kick", time });

    const deck = deckById(deckId);
    const amount = Math.max(0, Math.min(1, Number(deck?.insertFx?.pump || 0) / 100));
    const states = lanePumpState[deckId] || [];
    if (!audioCtx || !states.length) return;

    if (amount < 0.002) {
        resetLanePump(deckId);
        return;
    }

    const start = Math.max(audioCtx.currentTime, time);
    const attack = 0.006 + (1 - amount) * 0.008;
    const hold = 0.012 + amount * 0.026;
    const release = 0.12 + (1 - amount) * 0.22;
    const depth = Math.min(0.88, Math.pow(amount, 1.08) * 0.88);
    const duckGain = Math.max(0.08, 1 - depth);
    const releaseStart = start + attack + hold;

    states.forEach(state => {
        const param = state.gain?.gain;
        if (!param) return;
        if (typeof param.cancelAndHoldAtTime === "function") {
            param.cancelAndHoldAtTime(start);
        } else {
            param.cancelScheduledValues(start);
            param.setValueAtTime(Math.min(1, Math.max(duckGain, param.value || 1)), start);
        }
        param.linearRampToValueAtTime(duckGain, start + attack);
        param.setTargetAtTime(1, releaseStart, release);
        state.activeUntil = releaseStart + release * 5;
    });
}

function resetLanePump(deckId) {
    if (!audioCtx) return;
    (lanePumpState[deckId] || []).forEach(state => {
        const param = state.gain?.gain;
        if (!param) return;
        const now = audioCtx.currentTime;
        if (state.activeUntil > now) {
            param.cancelScheduledValues(now);
            param.setTargetAtTime(1, now, 0.018);
        } else {
            param.setValueAtTime(1, now);
        }
        state.activeUntil = 0;
    });
}

function scheduleUiPulse(deckId, laneId, time) {
    const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    uiTimers.push(window.setTimeout(() => {
        laneById(deckId, laneId).lastPulse = performance.now();
        renderState();
    }, delayMs));
}

function scheduleStep(step, time) {
    const delayMs = Math.max(0, (time - audioCtx.currentTime) * 1000);
    uiTimers.push(window.setTimeout(() => {
        visibleStep = step;
        renderStep();
        if (step % 4 === 0) {
            els.tempoLight.classList.add("is-hot");
            window.setTimeout(() => els.tempoLight.classList.remove("is-hot"), 90);
        }
    }, delayMs));

    decks.forEach(deck => {
        const deckTime = time + grooveOffset(deck, step);
        deck.lanes.forEach(lane => playLane(deck, lane, step, deckTime));
    });
}