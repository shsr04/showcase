const BPM = 128;
const STEPS = 16;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;
const VIRTUAL_CURSOR_SENSITIVITY = 1.5;
const KNOB_SENSITIVITY = 0.75;
const KNOB_DRAG_WIDTH = 220;
const LANE_OFF_LEVEL = 1;
const SCALE = [36.71, 41.2, 43.65, 49, 55, 61.74, 65.41, 73.42, 82.41, 87.31, 98, 110, 123.47, 146.83, 164.81, 174.61, 196, 220, 246.94, 293.66];
const DIVISIONS = [
    { label: "1/2", steps: 8 },
    { label: "1/4", steps: 4 },
    { label: "1/8", steps: 2 },
    { label: "3/16", steps: 3 },
];
const INSERT_FX = [
    { id: "dirt", label: "Dirt" },
    { id: "crush", label: "Crush" },
    { id: "ring", label: "Ring" },
    { id: "rumble", label: "Rumble" },
    { id: "noise", label: "Noise" },
    { id: "reso", label: "Reso" },
    { id: "shift", label: "Shift" },
    { id: "sweep", label: "Sweep" },
    { id: "reverse", label: "Reverse" },
    { id: "slicer", label: "Slicer" },
    { id: "stutter", label: "Stutter" },
    { id: "brake", label: "Brake" },
    { id: "freeze", label: "Freeze" },
    { id: "spiral", label: "Spiral" },
    { id: "mobius", label: "Mobius" },
    { id: "gate", label: "Gate" },
    { id: "space", label: "Space" },
    { id: "pump", label: "Pump" },
    { id: "width", label: "Width" },
];
const PUMP_LANE_VOICES = new Set(["bass", "lead", "drone", "texture"]);

const BASE_DECKS = [
    {
        id: "a",
        label: "Deck A",
        defaultLibraryId: "hypnotic-techno",
        color: "var(--green)",
        defaults: { level: 82, filter: 0 },
    },
    {
        id: "b",
        label: "Deck B",
        defaultLibraryId: "acid-techno",
        color: "var(--pink)",
        defaults: { level: 78, filter: 0 },
    },
];

const els = {
    station: document.getElementById("station"),
    virtualCursor: document.getElementById("virtualCursor"),
    decks: document.getElementById("decks"),
    play: document.getElementById("playButton"),
    stop: document.getElementById("stopButton"),
    mutate: document.getElementById("mutateButton"),
    reset: document.getElementById("resetButton"),
    status: document.getElementById("status"),
    readout: document.getElementById("readout"),
    tempoLight: document.getElementById("tempoLight"),
    stepReadout: document.getElementById("stepReadout"),
    stepGrid: document.getElementById("stepGrid"),
    divisionGroup: document.getElementById("divisionGroup"),
    divisionValue: document.getElementById("divisionValue"),
    feedback: document.getElementById("feedbackControl"),
    feedbackValue: document.getElementById("feedbackValue"),
    fxReturn: document.getElementById("fxReturnControl"),
    fxReturnValue: document.getElementById("fxReturnValue"),
    master: document.getElementById("masterControl"),
    masterValue: document.getElementById("masterValue"),
    crossfader: document.getElementById("crossfaderControl"),
    masterMeter: document.querySelector("[data-master-meter]"),
    canvas: document.getElementById("scopeCanvas"),
};

const canvasCtx = els.canvas.getContext("2d");
const stepTime = 60 / BPM / 4;
let decks = cloneDecks();
let audioCtx;
let mixBus;
let compressor;
let masterLimiter;
let masterGain;
let masterAnalyser;
let delay;
let delayFeedback;
let delayHighpass;
let delayLowpass;
let delayReturn;
let noiseBuffer;
let insertWorkletReady = false;
let insertWorkletStatusShown = false;
let deckNodes = {};
let laneNodes = {};
let lanePumpState = {};
let schedulerId = 0;
let nextStepTime = 0;
let currentStep = 0;
let visibleStep = 0;
let isPlaying = false;
let seed = 3;
let selectedDivision = "1/4";
let dpr = 1;
let width = 0;
let height = 0;
let frequencyData;
let timeData;
let masterMeterData;
let uiTimers = [];
let activeKnobDrag = null;
let activeVirtualDrag = null;
let virtualPressedControl = null;
let virtualHoverControl = null;
let virtualCursorX = 0;
let virtualCursorY = 0;

async function ensureAudio() {
    if (audioCtx) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    insertWorkletReady = false;
    insertWorkletStatusShown = false;
    await initializeInsertWorklet();
    mixBus = audioCtx.createGain();
    compressor = audioCtx.createDynamicsCompressor();
    masterLimiter = audioCtx.createDynamicsCompressor();
    masterGain = audioCtx.createGain();
    masterAnalyser = audioCtx.createAnalyser();
    delay = audioCtx.createDelay(1);
    delayFeedback = audioCtx.createGain();
    delayHighpass = audioCtx.createBiquadFilter();
    delayLowpass = audioCtx.createBiquadFilter();
    delayReturn = audioCtx.createGain();
    noiseBuffer = createNoiseBuffer(2);

    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.8;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;
    masterLimiter.threshold.value = -1;
    masterLimiter.knee.value = 0;
    masterLimiter.ratio.value = 20;
    masterLimiter.attack.value = 0.0015;
    masterLimiter.release.value = 0.06;
    masterAnalyser.fftSize = 2048;
    masterAnalyser.smoothingTimeConstant = 0.78;
    delayHighpass.type = "highpass";
    delayHighpass.frequency.value = 420;
    delayLowpass.type = "lowpass";
    delayLowpass.frequency.value = 5200;

    decks.forEach(deck => createDeckNodes(deck));

    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayHighpass);
    delayHighpass.connect(delayLowpass);
    delayLowpass.connect(delayReturn);
    delayReturn.connect(mixBus);
    mixBus.connect(compressor);
    compressor.connect(masterLimiter);
    masterLimiter.connect(masterAnalyser);
    masterAnalyser.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    frequencyData = new Uint8Array(masterAnalyser.frequencyBinCount);
    timeData = new Uint8Array(masterAnalyser.fftSize);
    masterMeterData = new Uint8Array(masterAnalyser.frequencyBinCount);
    syncAllControls();
    if (!insertWorkletReady && !insertWorkletStatusShown) {
        insertWorkletStatusShown = true;
        setStatus("Insert FX bypassed: AudioWorklet unavailable");
    }
}

function clearUiTimers() {
    uiTimers.forEach(timer => window.clearTimeout(timer));
    uiTimers = [];
}

function meterValue(analyser, data) {
    analyser.getByteFrequencyData(data);
    let total = 0;
    for (let i = 0; i < data.length; i += 1) total += data[i] / 255;
    return clamp(total / data.length * 2.6, 0, 1);
}

function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = els.canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    els.canvas.width = Math.floor(width * dpr);
    els.canvas.height = Math.floor(height * dpr);
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStandby(time) {
    const bars = 28;
    for (let i = 0; i < bars; i += 1) {
        const x = i / bars * width;
        const h = 10 + Math.sin(time * 0.0015 + i * 0.45) * 6 + (i % 5) * 1.8;
        canvasCtx.fillStyle = `hsla(${164 + i * 1.8}, 86%, 66%, 0.18)`;
        canvasCtx.fillRect(x, height - h - 10, Math.max(2, width / bars - 4), h);
    }
}

function drawLive() {
    masterAnalyser.getByteFrequencyData(frequencyData);
    masterAnalyser.getByteTimeDomainData(timeData);
    let total = 0;
    for (let i = 0; i < frequencyData.length; i += 1) total += frequencyData[i] / 255;
    const energy = clamp(total / frequencyData.length * 2.2, 0, 1);
    const centerY = height * 0.48;

    canvasCtx.strokeStyle = `rgba(117, 255, 214, ${0.35 + energy * 0.5})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    for (let i = 0; i < timeData.length; i += 8) {
        const t = i / (timeData.length - 1);
        const x = t * width;
        const sample = (timeData[i] - 128) / 128;
        const y = centerY + sample * height * 0.32;
        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();

    const bars = 36;
    const bandSize = Math.floor(frequencyData.length / bars);
    for (let i = 0; i < bars; i += 1) {
        let value = 0;
        for (let j = 0; j < bandSize; j += 1) value += frequencyData[i * bandSize + j] / 255;
        value /= bandSize;
        const barWidth = width / bars;
        const barHeight = Math.max(2, value * height * 0.36);
        canvasCtx.fillStyle = `hsla(${158 + i * 1.6 + energy * 24}, 92%, ${58 + value * 22}%, 0.82)`;
        canvasCtx.fillRect(i * barWidth, height - barHeight - 8, Math.max(2, barWidth - 3), barHeight);
    }
}

function draw(time) {
    requestAnimationFrame(draw);
    renderState();
    renderMeters();
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.fillStyle = "rgba(2, 5, 5, 0.62)";
    canvasCtx.fillRect(0, 0, width, height);
    if (masterAnalyser && isPlaying) drawLive();
    else drawStandby(time);
}

// Launch app:
els.play.addEventListener("click", () => {
    if (isPlaying) pause();
    else play().catch(() => setStatus("Audio blocked by browser"));
});
els.stop.addEventListener("click", stop);
els.reset.addEventListener("click", resetAll);
els.mutate.addEventListener("click", mutate);
document.querySelectorAll("[data-send]").forEach(input => {
    input.addEventListener("input", syncDeckControls);
});
els.feedback.addEventListener("input", syncFxControls);
els.fxReturn.addEventListener("input", syncFxControls);
els.master.addEventListener("input", syncMaster);
els.crossfader.addEventListener("input", syncCrossfader);
els.station.addEventListener("pointerdown", handleStationPointerDown);
window.addEventListener("mousemove", handleVirtualPointerMove);
window.addEventListener("mousedown", handleVirtualPointerDown);
window.addEventListener("mouseup", handleVirtualPointerUp);
document.addEventListener("pointerlockchange", handleStationPointerLockChange);
window.addEventListener("resize", resize);

renderStaticUi();
initKnobs();
syncFxControls();
syncMaster();
resize();
requestAnimationFrame(draw);
