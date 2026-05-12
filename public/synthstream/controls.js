function composeDeck(baseDeck) {
    const library = libraryById(baseDeck.defaultLibraryId);
    return {
        ...baseDeck,
        libraryId: library.id,
        title: library.title,
        eq: { low: 0, mid: 0, high: 0 },
        insertFx: Object.fromEntries(INSERT_FX.map(effect => [effect.id, 0])),
        controls: { ...baseDeck.defaults, send: 0 },
        lanes: cloneLibraryLanes(library),
    };
}

function cloneDecks() {
    return BASE_DECKS.map(composeDeck);
}

function normalizePattern(pattern) {
    return String(pattern).padEnd(STEPS, "-").slice(0, STEPS);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function seeded(index) {
    const x = Math.sin((seed + 1) * 91.17 + index * 47.31) * 10000;
    return x - Math.floor(x);
}

function setStatus(text) {
    els.status.textContent = text;
}

function deckById(deckId) {
    return decks.find(deck => deck.id === deckId);
}

function activeLibrary(deck) {
    return libraryById(deck.libraryId);
}

function laneById(deckId, laneId) {
    return deckById(deckId).lanes.find(lane => lane.id === laneId);
}

function nodeKey(deckId, laneId) {
    return `${deckId}:${laneId}`;
}

function isLaneActive(lane) {
    return lane.level > LANE_OFF_LEVEL;
}

function switchDeckLibrary(deckId, direction) {
    const deck = deckById(deckId);
    if (!deck) return;

    const currentIndex = LANE_LIBRARY_ORDER.indexOf(deck.libraryId);
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (startIndex + direction + LANE_LIBRARY_ORDER.length) % LANE_LIBRARY_ORDER.length;
    const library = libraryById(LANE_LIBRARY_ORDER[nextIndex]);
    deck.libraryId = library.id;
    deck.title = library.title;
    deck.lanes = cloneLibraryLanes(library, deck.lanes, true);

    renderStaticUi();
    syncLaneLevel();
    syncDeckControls();
    syncInsertFx();
    setStatus(`${deck.label} library: ${library.title}`);
}

function bindDynamicEvents() {
    document.querySelectorAll("[data-lane-level]").forEach(input => {
        input.addEventListener("input", syncLaneLevel);
    });

    document.querySelectorAll("[data-deck-level], [data-filter]").forEach(input => {
        input.addEventListener("input", syncDeckControls);
    });

    document.querySelectorAll("[data-insert-fx]").forEach(input => {
        input.addEventListener("input", syncInsertFx);
    });

    document.querySelectorAll("[data-eq-band]").forEach(input => {
        input.addEventListener("input", syncEq);
    });

    document.querySelectorAll("[data-division]").forEach(button => {
        button.addEventListener("click", () => {
            selectedDivision = button.dataset.division;
            syncFxControls();
            renderState();
            setStatus(`Delay division ${selectedDivision}`);
        });
    });

    document.querySelectorAll("[data-library-prev], [data-library-next]").forEach(button => {
        button.addEventListener("click", () => {
            const deckId = button.dataset.libraryPrev || button.dataset.libraryNext;
            switchDeckLibrary(deckId, button.dataset.libraryPrev ? -1 : 1);
        });
    });

    initKnobs(els.decks);
}

function createNoiseBuffer(duration) {
    const length = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;

    for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + white * 0.12) / 1.12;
        data[i] = last * 1.8;
    }

    return buffer;
}

async function initializeInsertWorklet() {
    if (!audioCtx.audioWorklet || insertWorkletReady) return insertWorkletReady;
    try {
        await audioCtx.audioWorklet.addModule("worklet_fx.js");
        insertWorkletReady = true;
    } catch (error) {
        insertWorkletReady = false;
    }
    return insertWorkletReady;
}

function createDeckNodes(deck) {
    const input = audioCtx.createGain();
    let insert = null;
    const low = audioCtx.createBiquadFilter();
    const mid = audioCtx.createBiquadFilter();
    const high = audioCtx.createBiquadFilter();
    const filter = audioCtx.createBiquadFilter();
    const level = audioCtx.createGain();
    const deckLimiter = audioCtx.createDynamicsCompressor();
    const analyser = audioCtx.createAnalyser();
    const crossfade = audioCtx.createGain();
    const send = audioCtx.createGain();

    low.type = "lowshelf";
    low.frequency.value = 220;
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1.1;
    high.type = "highshelf";
    high.frequency.value = 4200;
    deckLimiter.threshold.value = -6;
    deckLimiter.knee.value = 6;
    deckLimiter.ratio.value = 10;
    deckLimiter.attack.value = 0.003;
    deckLimiter.release.value = 0.08;
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.78;

    if (insertWorkletReady) {
        try {
            insert = new AudioWorkletNode(audioCtx, "synthstream-insert-fx", {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            });
            insert.port.postMessage({ type: "tempo", bpm: BPM });
            input.connect(insert);
            insert.connect(low);
        } catch (error) {
            insert = null;
            input.connect(low);
            insertWorkletReady = false;
            setStatus("Insert FX bypassed: processor unavailable");
        }
    } else {
        input.connect(low);
    }
    low.connect(mid);
    mid.connect(high);
    high.connect(filter);
    filter.connect(level);
    level.connect(deckLimiter);
    deckLimiter.connect(analyser);
    analyser.connect(crossfade);
    crossfade.connect(mixBus);
    crossfade.connect(send);
    send.connect(delay);

    deckNodes[deck.id] = { input, insert, low, mid, high, filter, level, deckLimiter, analyser, data: new Uint8Array(analyser.frequencyBinCount), crossfade, send };

    deck.lanes.forEach(lane => {
        const levelGain = audioCtx.createGain();
        levelGain.gain.value = lane.level / 100;

        if (PUMP_LANE_VOICES.has(lane.voice)) {
            const pumpGain = audioCtx.createGain();
            pumpGain.gain.value = 1;
            pumpGain.connect(levelGain);
            levelGain.connect(input);
            laneNodes[nodeKey(deck.id, lane.id)] = { gain: pumpGain, levelGain, pumpGain, voice: lane.voice };
            if (!lanePumpState[deck.id]) lanePumpState[deck.id] = [];
            lanePumpState[deck.id].push({ gain: pumpGain, activeUntil: 0 });
            return;
        }

        levelGain.connect(input);
        laneNodes[nodeKey(deck.id, lane.id)] = { gain: levelGain, levelGain, voice: lane.voice };
    });
}

function configureDeckFilter(filter, value) {
    if (!filter) return;

    const amount = clamp(value / 100, -1, 1);
    const setFrequency = (frequency) => {
        if (audioCtx) filter.frequency.setTargetAtTime(frequency, audioCtx.currentTime, 0.035);
        else filter.frequency.value = frequency;
    };
    const setQ = (q) => {
        if (audioCtx) filter.Q.setTargetAtTime(q, audioCtx.currentTime, 0.035);
        else filter.Q.value = q;
    };

    if (Math.abs(amount) < 0.04) {
        filter.type = "allpass";
        setFrequency(1000);
        setQ(0.0001);
        return;
    }

    if (amount < 0) {
        const depth = Math.abs(amount);
        filter.type = "lowpass";
        setFrequency(18000 * Math.pow(260 / 18000, depth));
        setQ(0.7 + depth * 4.8);
        return;
    }

    filter.type = "highpass";
    setFrequency(24 * Math.pow(1500 / 24, amount));
    setQ(0.7 + amount * 3.6);
}

function rampParam(param, value, time, duration) {
    param.cancelScheduledValues(time);
    param.setTargetAtTime(value, time, Math.max(0.01, duration));
}

function syncAllControls() {
    syncLaneLevel();
    syncDeckControls();
    syncInsertFx();
    syncEq();
    syncCrossfader();
    syncFxControls();
    syncMaster();
}

function syncLaneLevel(event) {
    const inputs = event ? [event.currentTarget] : Array.from(document.querySelectorAll("[data-lane-level]"));
    inputs.forEach(input => {
        const [deckId, laneId] = input.dataset.laneLevel.split(":");
        const lane = laneById(deckId, laneId);
        let value = Number(input.value);
        if (value <= LANE_OFF_LEVEL) {
            value = 0;
            input.value = "0";
        }
        lane.level = value;
        lane.enabled = isLaneActive(lane);
        if (isLaneActive(lane)) lane.lastNonZeroLevel = value;
        refreshKnob(document.querySelector(`[data-knob][data-lane-knob="${deckId}:${laneId}"]`));
        const node = laneNodes[nodeKey(deckId, laneId)];
        if (node && audioCtx) rampParam((node.levelGain || node.gain).gain, value / 100, audioCtx.currentTime, 0.035);
    });
    renderState();
}

function syncDeckControls(event) {
    const deckIds = event ? [event.currentTarget.dataset.deckLevel || event.currentTarget.dataset.filter || event.currentTarget.dataset.send] : decks.map(deck => deck.id);
    deckIds.forEach(deckId => {
        const deck = deckById(deckId);
        const levelInput = document.querySelector(`[data-deck-level="${deckId}"]`);
        const filterInput = document.querySelector(`[data-filter="${deckId}"]`);
        const sendInput = document.querySelector(`[data-send="${deckId}"]`);
        if (levelInput) deck.controls.level = Number(levelInput.value);
        if (filterInput) deck.controls.filter = Number(filterInput.value);
        if (sendInput) deck.controls.send = Number(sendInput.value);

        const levelValue = document.querySelector(`[data-deck-level-value="${deckId}"]`);
        const filterValue = document.querySelector(`[data-filter-value="${deckId}"]`);
        const sendValue = document.querySelector(`[data-send-value="${deckId}"]`);
        if (levelValue) levelValue.textContent = String(deck.controls.level);
        if (filterValue) filterValue.textContent = String(deck.controls.filter);
        if (sendValue) sendValue.textContent = String(deck.controls.send);
        refreshKnob(document.querySelector(`[data-knob][data-input="deck-level-${deckId}"]`));
        refreshKnob(document.querySelector(`[data-knob][data-input="filter-${deckId}"]`));
        refreshKnob(document.querySelector(`[data-knob][data-input="send-${deckId}"]`) || document.querySelector(`[data-knob][data-input="send-${deckId.toLowerCase()}"]`));

        const nodes = deckNodes[deckId];
        if (nodes && audioCtx) {
            rampParam(nodes.level.gain, deck.controls.level / 100, audioCtx.currentTime, 0.04);
            rampParam(nodes.send.gain, deck.controls.send / 100 * 1.15, audioCtx.currentTime, 0.04);
            configureDeckFilter(nodes.filter, deck.controls.filter);
        }
    });
}

function syncInsertFx(event) {
    const deckIds = event ? [event.currentTarget.dataset.insertFx.split(":")[0]] : decks.map(deck => deck.id);
    deckIds.forEach(deckId => {
        const deck = deckById(deckId);
        if (!deck) return;
        INSERT_FX.forEach(effect => {
            const input = document.querySelector(`[data-insert-fx="${deck.id}:${effect.id}"]`);
            if (input) deck.insertFx[effect.id] = Number(input.value);
            refreshKnob(document.querySelector(`[data-knob][data-input="insert-${deck.id}-${effect.id}"]`));
        });
        const insert = deckNodes[deck.id]?.insert;
        if (insert?.port) {
            insert.port.postMessage({
                type: "params",
                values: { ...deck.insertFx },
            });
        }
        if ((deck.insertFx.pump || 0) <= 0) resetLanePump(deck.id);
    });
}

function syncEq(event) {
    const deckIds = event ? [event.currentTarget.dataset.eqBand.split(":")[0]] : decks.map(deck => deck.id);
    deckIds.forEach(deckId => {
        const deck = deckById(deckId);
        const nodes = deckNodes[deck.id];
        ["high", "mid", "low"].forEach(band => {
            const input = document.querySelector(`[data-eq-band="${deck.id}:${band}"]`);
            if (input) deck.eq[band] = Number(input.value);
            const value = document.querySelector(`[data-eq-value="${deck.id}:${band}"]`);
            if (value) value.textContent = formatEqGain(deck.eq[band]);
            refreshKnob(document.querySelector(`[data-knob][data-input="eq-${deck.id}-${band}"]`));
        });
        if (nodes && audioCtx) {
            const now = audioCtx.currentTime;
            rampParam(nodes.low.gain, deck.eq.low, now, 0.04);
            rampParam(nodes.mid.gain, deck.eq.mid, now, 0.04);
            rampParam(nodes.high.gain, deck.eq.high, now, 0.04);
        }
    });
}

function syncCrossfader() {
    if (!audioCtx || !deckNodes.a || !deckNodes.b) return;

    const x = Number(els.crossfader.value) / 100;
    const gainA = Math.cos(x * Math.PI / 2);
    const gainB = Math.sin(x * Math.PI / 2);
    const now = audioCtx.currentTime;
    rampParam(deckNodes.a.crossfade.gain, gainA, now, 0.035);
    rampParam(deckNodes.b.crossfade.gain, gainB, now, 0.035);
}

function syncFxControls() {
    els.feedbackValue.textContent = els.feedback.value;
    els.fxReturnValue.textContent = els.fxReturn.value;
    refreshKnob(document.querySelector('[data-knob][data-input="feedbackControl"]'));
    refreshKnob(document.querySelector('[data-knob][data-input="fxReturnControl"]'));
    els.divisionValue.textContent = selectedDivision;
    document.querySelectorAll("[data-division]").forEach(button => {
        button.classList.toggle("is-active", button.dataset.division === selectedDivision);
    });

    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const division = DIVISIONS.find(item => item.label === selectedDivision) || DIVISIONS[1];
    delay.delayTime.setTargetAtTime(stepTime * division.steps, now, 0.04);
    delayFeedback.gain.setTargetAtTime(Number(els.feedback.value) / 100, now, 0.04);
    delayReturn.gain.setTargetAtTime(Number(els.fxReturn.value) / 100, now, 0.04);
}

function syncMaster() {
    refreshKnob(document.querySelector('[data-knob][data-input="masterControl"]'));
    if (masterGain && audioCtx) rampParam(masterGain.gain, Number(els.master.value) / 100, audioCtx.currentTime, 0.03);
}

function pause() {
    if (!audioCtx) return;
    window.clearInterval(schedulerId);
    schedulerId = 0;
    isPlaying = false;
    audioCtx.suspend();
    els.play.textContent = "Play";
    els.readout.textContent = `${BPM} BPM / 4/4 / 16 Steps / Paused`;
    setStatus("Playback paused");
}

function stop() {
    if (audioCtx && audioCtx.state !== "closed") audioCtx.suspend();
    window.clearInterval(schedulerId);
    schedulerId = 0;
    isPlaying = false;
    currentStep = 0;
    visibleStep = 0;
    clearUiTimers();
    els.play.textContent = "Play";
    els.readout.textContent = `${BPM} BPM / 4/4 / 16 Steps / Stopped`;
    setStatus("Playback stopped");
    renderStep();
}

function resetAll() {
    stop();
    decks = cloneDecks();
    seed = 3;
    selectedDivision = "1/4";
    deckNodes = {};
    laneNodes = {};
    lanePumpState = {};
    insertWorkletReady = false;
    insertWorkletStatusShown = false;
    if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close();
    }
    audioCtx = null;
    renderStaticUi();
    decks.forEach(deck => {
        const sendInput = document.querySelector(`[data-send="${deck.id}"]`);
        if (sendInput) sendInput.value = deck.controls.send;
    });
    els.feedback.value = 0;
    els.fxReturn.value = 0;
    els.master.value = 58;
    els.crossfader.value = 50;
    syncDeckControls();
    syncFxControls();
    syncMaster();
    setStatus("Station reset");
}

function mutate() {
    seed = (seed + 1 + Math.floor(Math.random() * 7)) % 97;
    decks.forEach(deck => {
        const library = activeLibrary(deck);
        const edits = Math.max(1, Math.round(1 + library.mutationSpeed * 4));
        for (let edit = 0; edit < edits; edit += 1) {
            const laneIndex = Math.floor(seeded(seed + edit * 17 + deck.id.charCodeAt(0)) * deck.lanes.length) % deck.lanes.length;
            const lane = deck.lanes[laneIndex];
            const droneProtection = lane.voice === "drone" ? library.droneImportance : 0;
            const chance = clamp(library.mutationSpeed * (1 - droneProtection * 0.82), 0.04, 0.92);
            if (seeded(laneIndex + seed + edit * 11) <= chance) {
                const chars = Array.from(lane.pattern);
                const pos = Math.floor(seeded(laneIndex * 13 + seed) * STEPS) % STEPS;
                if (chars[pos] === "-") {
                    chars[pos] = lane.label[0].toLowerCase();
                } else if (chars[pos] !== "~" && seeded(pos + seed + edit) > 0.55) {
                    chars[pos] = "-";
                }
                lane.pattern = chars.join("");
            }
        }
    });
    if (audioCtx) {
        const now = audioCtx.currentTime;
        delayFeedback.gain.setTargetAtTime(Number(els.feedback.value) / 100 + (seed % 5) * 0.018, now, 0.05);
    }
    renderStaticUi();
    setStatus(`Mutation seed ${String(seed).padStart(2, "0")}`);
    els.readout.textContent = `${BPM} BPM / 4/4 / 16 Steps / Seed ${String(seed).padStart(2, "0")}`;
}
