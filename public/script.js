const canvas = document.getElementById("bgCanvas");
const warpCanvas = document.getElementById("warpCanvas");
const warpCtx = warpCanvas.getContext("2d");
const root = document.documentElement;
const reader = document.getElementById("reader");
const readerTitle = document.getElementById("readerTitle");
const readerMessage = document.getElementById("readerMessage");
const readerStatus = document.getElementById("readerStatus");
const entropyValue = document.getElementById("entropyValue");
const audioStatus = document.getElementById("audioStatus");
const colorStatus = document.getElementById("colorStatus");
const dragGhost = document.getElementById("dragGhost");
const cursorAura = document.querySelector(".cursor-aura");
const disks = Array.from(document.querySelectorAll(".diskette"));

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dragState = {
    active: false,
    disk: null,
    pointerId: null,
};
const cursor = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.45,
    px: window.innerWidth * 0.5,
    py: window.innerHeight * 0.45,
    speed: 0,
};

let width = 0;
let height = 0;
let dpr = 1;
let audioCtx = null;
let masterGain = null;
let bootLoop = null;
let audioUnlocked = false;
let lastToneAt = 0;
let lastStatusAt = 0;
let pendingToneDisk = null;
let pendingAudioActions = [];
let activeHue = 0.52;
let hoverTarget = 0;
let hoverValue = 0;
let insertPulse = 0;
let illuminationBlast = 0;
let phoenixBlast = 0;
let matrixWarp = 0;
let blastPosition = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.45 };
let readerPosition = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.68 };
let warpActive = false;
let warpStartedAt = 0;

function setText(element, text) {
    if (element) {
        element.textContent = text;
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0);
}

function diskHue(disk) {
    return ((hashText(`${disk.dataset.title}${disk.dataset.code}`) % 210) + 165) % 360;
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
    }

    return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    }

    return program;
}

function createWebGLBackground() {
    const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
    });

    if (!gl) {
        document.body.classList.add("no-webgl");
        return null;
    }

    const vertexSource = `
        attribute vec2 a_position;

        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const fragmentSource = `
        precision highp float;

        uniform vec2 u_resolution;
        uniform vec2 u_cursor;
        uniform float u_time;
        uniform float u_cursorSpeed;
        uniform float u_hover;
        uniform float u_activeHue;
        uniform float u_insertPulse;
        uniform vec2 u_blastPosition;
        uniform vec2 u_readerPosition;
        uniform float u_illuminationBlast;
        uniform float u_phoenixBlast;
        uniform float u_matrixWarp;
        uniform float u_reducedMotion;

        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);

            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));

            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        vec3 hsv2rgb(vec3 c) {
            vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
            return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
        }

        float diskGlow(vec2 uv, vec2 center, float radius, float power) {
            float d = length(uv - center);
            return pow(max(0.0, 1.0 - d / radius), power);
        }

        void main() {
            vec2 frag = gl_FragCoord.xy;
            vec2 uv = frag / u_resolution;
            vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
            vec2 p = (uv - 0.5) * aspect;
            vec2 cursorUv = u_cursor / u_resolution;
            vec2 cursorP = (cursorUv - 0.5) * aspect;
            vec2 blastP = (u_blastPosition / u_resolution - 0.5) * aspect;
            vec2 readerP = (u_readerPosition / u_resolution - 0.5) * aspect;

            float motion = 1.0 - u_reducedMotion;
            float t = u_time * mix(0.08, 1.0, motion);
            float speed = clamp(u_cursorSpeed / 90.0, 0.0, 1.0);
            float hue = fract(0.50 + 0.06 * sin(t * 0.15) + u_activeHue * 0.38 + speed * 0.07);

            float plasmaA = noise(p * 3.0 + vec2(t * 0.06, -t * 0.04));
            float plasmaB = noise(p * 7.0 - vec2(t * 0.04, t * 0.05));
            float plasma = smoothstep(0.24, 1.0, plasmaA * 0.66 + plasmaB * 0.42);

            float cursorGlow = diskGlow(p, cursorP, 0.56 + speed * 0.16, 2.2);
            float hoverGlow = diskGlow(p, cursorP + vec2(0.0, 0.02), 0.34, 3.0) * u_hover;
            float insertGlow = diskGlow(p, readerP, 0.8, 1.9) * u_insertPulse;
            float blastDist = length(p - blastP);
            float illuminationRing = 1.0 - smoothstep(0.0, 0.18, abs(blastDist - 0.08 - u_illuminationBlast * 0.22));
            float illuminationCore = diskGlow(p, blastP, 0.18 + u_illuminationBlast * 0.2, 3.2);
            vec2 phoenixVector = readerP - blastP;
            float phoenixT = clamp(dot(p - blastP, phoenixVector) / max(dot(phoenixVector, phoenixVector), 0.0001), 0.0, 1.0);
            float phoenixLine = 1.0 - smoothstep(0.0, 0.07, length(p - (blastP + phoenixVector * phoenixT)));
            float phoenixWake = diskGlow(p, mix(blastP, readerP, 0.42), 0.74, 2.3);
            float phoenixFlame = (0.45 + 0.55 * sin((p.x + p.y) * 34.0 + t * 8.0)) * phoenixWake * u_phoenixBlast;

            vec3 base = vec3(0.012, 0.016, 0.042);
            vec3 cyan = hsv2rgb(vec3(hue, 0.92, 1.0));
            vec3 magenta = hsv2rgb(vec3(fract(hue + 0.24), 0.88, 1.0));
            vec3 acid = hsv2rgb(vec3(fract(u_activeHue + 0.18), 0.76, 1.0));
            vec3 color = base;

            color += cyan * plasma * 0.22;
            color += magenta * cursorGlow * (0.24 + speed * 0.18);
            color += acid * hoverGlow * 0.46;
            color += vec3(1.0, 0.84, 0.24) * insertGlow * 0.58;
            color += acid * (illuminationRing * 0.8 + illuminationCore * 0.44) * u_illuminationBlast;
            color += vec3(1.0, 0.36, 0.08) * phoenixFlame * 0.92;
            color += vec3(1.0, 0.82, 0.28) * phoenixLine * phoenixWake * u_phoenixBlast * 0.22;

            vec2 grid = abs(fract((uv + vec2(t * 0.004, 0.0)) * vec2(44.0, 28.0)) - 0.5);
            float gridLine = 1.0 - smoothstep(0.0, 0.028, min(grid.x, grid.y));
            color += cyan * gridLine * 0.025;

            vec2 starCell = floor((uv + vec2(t * 0.012, -t * 0.006)) * vec2(120.0, 72.0));
            vec2 starLocal = fract((uv + vec2(t * 0.012, -t * 0.006)) * vec2(120.0, 72.0)) - 0.5;
            float starSeed = hash(starCell);
            float star = smoothstep(0.985, 1.0, starSeed) * (1.0 - smoothstep(0.0, 0.08, length(starLocal)));
            color += hsv2rgb(vec3(fract(starSeed + hue), 0.8, 1.0)) * star * (0.7 + speed * 0.4);

            vec2 matrixUv = uv - (u_readerPosition / u_resolution);
            float columnSeed = hash(vec2(floor(uv.x * 92.0), 17.0));
            float stream = fract(uv.y * 22.0 + t * (4.0 + columnSeed * 5.0));
            float glyph = smoothstep(0.97, 1.0, hash(floor(uv * vec2(92.0, 48.0)) + floor(t * 18.0)));
            float columnMask = smoothstep(0.96, 1.0, columnSeed);
            float readerMask = 1.0 - smoothstep(0.06, 0.66, length(matrixUv * vec2(1.2, 0.72)));
            float matrixEffect = (0.24 + smoothstep(0.88, 1.0, stream) + glyph) * columnMask * readerMask * u_matrixWarp;
            color += vec3(0.28, 1.0, 0.48) * matrixEffect;
            color += cyan * readerMask * u_matrixWarp * 0.18;

            float scanline = 0.9 + 0.1 * sin(frag.y * 3.14159);
            float vignette = 1.0 - smoothstep(0.22, 1.18, length(p));
            float noiseGrain = hash(frag + floor(t * 30.0)) * 0.035;
            color = color * scanline * vignette + noiseGrain;

            float mask = smoothstep(0.0, 0.08, vignette);
            gl_FragColor = vec4(color, mask);
        }
    `;

    let program;
    try {
        program = createProgram(gl, vertexSource, fragmentSource);
    } catch (error) {
        console.warn(error);
        document.body.classList.add("no-webgl");
        return null;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const locations = {
        position: gl.getAttribLocation(program, "a_position"),
        resolution: gl.getUniformLocation(program, "u_resolution"),
        cursor: gl.getUniformLocation(program, "u_cursor"),
        time: gl.getUniformLocation(program, "u_time"),
        cursorSpeed: gl.getUniformLocation(program, "u_cursorSpeed"),
        hover: gl.getUniformLocation(program, "u_hover"),
        activeHue: gl.getUniformLocation(program, "u_activeHue"),
        insertPulse: gl.getUniformLocation(program, "u_insertPulse"),
        blastPosition: gl.getUniformLocation(program, "u_blastPosition"),
        readerPosition: gl.getUniformLocation(program, "u_readerPosition"),
        illuminationBlast: gl.getUniformLocation(program, "u_illuminationBlast"),
        phoenixBlast: gl.getUniformLocation(program, "u_phoenixBlast"),
        matrixWarp: gl.getUniformLocation(program, "u_matrixWarp"),
        reducedMotion: gl.getUniformLocation(program, "u_reducedMotion"),
    };

    gl.useProgram(program);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

    return { gl, program, locations };
}

const webgl = createWebGLBackground();

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, width < 760 ? 1 : 1.25);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    warpCanvas.width = Math.floor(width * dpr);
    warpCanvas.height = Math.floor(height * dpr);
    warpCanvas.style.width = `${width}px`;
    warpCanvas.style.height = `${height}px`;
    warpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (webgl) {
        webgl.gl.viewport(0, 0, canvas.width, canvas.height);
    }

    updateReaderPosition();
}

function elementCenter(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5,
    };
}

function updateReaderPosition() {
    readerPosition = elementCenter(reader);
}

function setBlastPositionFromElement(element) {
    blastPosition = elementCenter(element);
}

function renderBackground(now) {
    if (!webgl) return;

    hoverValue += (hoverTarget - hoverValue) * 0.08;
    insertPulse *= 0.92;
    illuminationBlast *= 0.82;
    phoenixBlast *= 0.92;
    matrixWarp *= 0.975;

    const gl = webgl.gl;
    gl.useProgram(webgl.program);
    gl.uniform2f(webgl.locations.resolution, canvas.width, canvas.height);
    gl.uniform2f(webgl.locations.cursor, cursor.x * dpr, (height - cursor.y) * dpr);
    gl.uniform1f(webgl.locations.time, now * 0.001);
    gl.uniform1f(webgl.locations.cursorSpeed, cursor.speed);
    gl.uniform1f(webgl.locations.hover, hoverValue);
    gl.uniform1f(webgl.locations.activeHue, activeHue);
    gl.uniform1f(webgl.locations.insertPulse, insertPulse);
    gl.uniform2f(webgl.locations.blastPosition, blastPosition.x * dpr, (height - blastPosition.y) * dpr);
    gl.uniform2f(webgl.locations.readerPosition, readerPosition.x * dpr, (height - readerPosition.y) * dpr);
    gl.uniform1f(webgl.locations.illuminationBlast, illuminationBlast);
    gl.uniform1f(webgl.locations.phoenixBlast, phoenixBlast);
    gl.uniform1f(webgl.locations.matrixWarp, matrixWarp);
    gl.uniform1f(webgl.locations.reducedMotion, reducedMotion ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reducedMotion) {
        requestAnimationFrame(renderBackground);
    }
}

function updateCursor(x, y) {
    cursor.px = cursor.x;
    cursor.py = cursor.y;
    cursor.x = x;
    cursor.y = y;
    cursor.speed = Math.hypot(cursor.x - cursor.px, cursor.y - cursor.py);

    if (cursorAura) {
        cursorAura.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        cursorAura.style.opacity = String(0.22 + clamp(cursor.speed / 140, 0, 0.28) + hoverValue * 0.16);
    }

    const now = performance.now();
    if (now - lastStatusAt > 110) {
        setText(entropyValue, `${Math.round(clamp(cursor.speed * 2.2, 0, 99)).toString().padStart(2, "0")}%`);
        setText(colorStatus, activeHue < 0.58 ? "CYAN" : activeHue < 0.76 ? "VIOLET" : "MAGENTA");
        lastStatusAt = now;
    }
}

function triggerIlluminationBlast(disk) {
    setBlastPositionFromElement(disk);
    illuminationBlast = reducedMotion ? 0.25 : 1;
}

function triggerPhoenixBlast(disk) {
    updateReaderPosition();
    setBlastPositionFromElement(disk);
    phoenixBlast = reducedMotion ? 0.25 : 1;
    insertPulse = Math.max(insertPulse, 0.45);
}

function triggerMatrixWarp(disk) {
    updateReaderPosition();
    setBlastPositionFromElement(disk);
    matrixWarp = reducedMotion ? 0.35 : 1;
    insertPulse = 1;
}

function startForegroundWarp(disk) {
    warpActive = true;
    warpStartedAt = performance.now();
    document.body.classList.add("warp-active");
    setBlastPositionFromElement(disk);
    updateReaderPosition();
    requestAnimationFrame(drawForegroundWarp);
}

function drawForegroundWarp(now) {
    if (!warpActive) return;

    const elapsed = now - warpStartedAt;
    const progress = clamp(elapsed / 1800, 0, 1);
    const ease = progress * progress * (3 - 2 * progress);
    const hash = hashText(`${blastPosition.x}${blastPosition.y}${readerPosition.x}`);

    warpCtx.clearRect(0, 0, width, height);
    warpCtx.save();
    warpCtx.globalCompositeOperation = "lighter";

    const centerX = readerPosition.x;
    const centerY = readerPosition.y;
    const radius = Math.max(width, height) * (0.14 + ease * 0.86);
    const gradient = warpCtx.createRadialGradient(centerX, centerY, 4, centerX, centerY, radius);
    gradient.addColorStop(0, `rgba(235, 255, 248, ${0.28 + ease * 0.32})`);
    gradient.addColorStop(0.18, `rgba(0, 255, 170, ${0.24 + ease * 0.22})`);
    gradient.addColorStop(0.5, `rgba(0, 170, 255, ${0.08 + ease * 0.16})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    warpCtx.fillStyle = gradient;
    warpCtx.fillRect(0, 0, width, height);

    const columnCount = Math.ceil(width / 18);
    for (let i = 0; i < columnCount; i++) {
        const x = i * 18 + ((hash + i * 13) % 9);
        const seed = ((hash + i * 101) % 1000) / 1000;
        const speed = 380 + seed * 760;
        const yBase = (elapsed * speed * 0.001 + seed * height * 2) % (height + 260) - 260;
        const alpha = (0.08 + seed * 0.24) * (1 - progress * 0.2);
        warpCtx.fillStyle = `rgba(90, 255, 150, ${alpha})`;
        warpCtx.font = `${12 + (i % 3) * 2}px monospace`;

        for (let j = 0; j < 14; j++) {
            const y = yBase + j * 18;
            const code = 33 + ((hash + i * 17 + j * 31 + Math.floor(elapsed / 45)) % 58);
            warpCtx.fillText(String.fromCharCode(code), x, y);
        }
    }

    for (let i = 0; i < 34; i++) {
        const seed = ((hash + i * 211) % 1000) / 1000;
        const tearY = (seed * height + elapsed * (0.14 + seed * 0.34)) % height;
        const tearH = 1 + (i % 5);
        const tearX = Math.sin(seed * 8 + elapsed * 0.018) * 60 * (0.2 + ease);
        warpCtx.fillStyle = `rgba(0, 245, 255, ${0.04 + ease * 0.12})`;
        warpCtx.fillRect(tearX, tearY, width, tearH);
        warpCtx.fillStyle = `rgba(255, 47, 199, ${0.025 + ease * 0.08})`;
        warpCtx.fillRect(-tearX * 0.6, tearY + tearH + 2, width, 1);
    }

    const blockSize = 18;
    const blockRows = Math.ceil(height / blockSize);
    const blockCols = Math.ceil(width / blockSize);
    for (let y = 0; y < blockRows; y++) {
        for (let x = 0; x < blockCols; x++) {
            const n = ((x * 37 + y * 91 + hash + Math.floor(elapsed / 36)) % 1000) / 1000;
            if (n > 1 - ease * 0.34) {
                warpCtx.fillStyle = n > 0.93 ? `rgba(235, 255, 255, ${0.18 * ease})` : `rgba(0, 255, 160, ${0.12 * ease})`;
                warpCtx.fillRect(x * blockSize, y * blockSize, blockSize - 2, blockSize - 2);
            }
        }
    }

    warpCtx.strokeStyle = `rgba(255, 255, 255, ${0.28 + ease * 0.42})`;
    warpCtx.lineWidth = 2 + ease * 5;
    for (let i = 0; i < 5; i++) {
        warpCtx.beginPath();
        warpCtx.arc(centerX, centerY, radius * (0.12 + i * 0.12), 0, Math.PI * 2);
        warpCtx.stroke();
    }

    if (progress > 0.72) {
        warpCtx.globalCompositeOperation = "source-over";
        warpCtx.fillStyle = `rgba(235, 255, 255, ${(progress - 0.72) / 0.28})`;
        warpCtx.fillRect(0, 0, width, height);
    }

    warpCtx.restore();

    if (progress < 1) {
        requestAnimationFrame(drawForegroundWarp);
    }
}

function ensureAudio() {
    if (!audioCtx) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            setText(audioStatus, "UNAVAILABLE");
            return false;
        }

        audioCtx = new AudioContextCtor();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioCtx.destination);
    }

    if (audioCtx.state === "suspended") {
        audioCtx.resume()
            .then(markAudioReady)
            .catch(() => {
                audioUnlocked = false;
                setText(audioStatus, "LOCKED");
            });
    }

    markAudioReady();
    return audioUnlocked;
}

function markAudioReady() {
    if (!audioCtx) return;

    audioUnlocked = audioCtx.state === "running";
    setText(audioStatus, audioUnlocked ? "AWAKE" : "LOCKED");

    if (audioUnlocked && pendingToneDisk) {
        const disk = pendingToneDisk;
        pendingToneDisk = null;
        toneFromDisk(disk);
    }

    if (audioUnlocked && pendingAudioActions.length) {
        const actions = pendingAudioActions;
        pendingAudioActions = [];
        actions.forEach((action) => action());
    }
}

function playToneForDisk(disk) {
    if (ensureAudio()) {
        toneFromDisk(disk);
    } else {
        pendingToneDisk = disk;
    }
}

function toneFromDisk(disk) {
    if (!audioUnlocked || !audioCtx || !masterGain) return;

    const now = audioCtx.currentTime;
    if (performance.now() - lastToneAt < 115) return;
    lastToneAt = performance.now();

    const text = `${disk.dataset.title} ${disk.dataset.copy} ${disk.dataset.tone}`;
    const hash = hashText(text);
    const base = 150 + (hash % 280);
    const spread = 1.22 + ((hash >> 5) % 9) / 18;
    const chirp = 840 + ((hash >> 9) % 360);
    const duration = 0.42 + ((hash >> 12) % 12) / 100;
    const waveforms = ["sine", "triangle", "square"];

    const filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(base * 2.2, now);
    filter.frequency.exponentialRampToValueAtTime(chirp, now + duration * 0.74);
    filter.Q.value = 7 + (hash % 7);
    filter.connect(masterGain);

    [base, base * spread, base * 2.01].forEach((freq, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = waveforms[(hash + index) % waveforms.length];
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.exponentialRampToValueAtTime(freq * (1.02 + index * 0.035), now + duration);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(index === 0 ? 0.22 : 0.085, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(now);
        osc.stop(now + duration + 0.04);
    });

    const noiseLength = Math.max(1, Math.floor(audioCtx.sampleRate * 0.12));
    const noiseBuffer = audioCtx.createBuffer(1, noiseLength, audioCtx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / noiseLength);
    }
    const noise = audioCtx.createBufferSource();
    const noiseGain = audioCtx.createGain();
    noise.buffer = noiseBuffer;
    noiseGain.gain.setValueAtTime(0.045, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start(now);
    noise.stop(now + 0.14);
}

function playReaderClick(disk) {
    if (!ensureAudio()) {
        pendingAudioActions.push(() => playReaderClick(disk));
        return;
    }

    const now = audioCtx.currentTime;
    const hash = hashText(`${disk.dataset.code}${disk.dataset.title}`);
    const clickLength = Math.floor(audioCtx.sampleRate * 0.045);
    const buffer = audioCtx.createBuffer(1, clickLength, audioCtx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < clickLength; i++) {
        const decay = 1 - i / clickLength;
        samples[i] = (Math.random() * 2 - 1) * decay * decay;
    }

    const click = audioCtx.createBufferSource();
    const clickFilter = audioCtx.createBiquadFilter();
    const clickGain = audioCtx.createGain();
    click.buffer = buffer;
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 900 + (hash % 600);
    clickGain.gain.setValueAtTime(0.32, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(masterGain);
    click.start(now);
    click.stop(now + 0.06);

    const bump = audioCtx.createOscillator();
    const bumpGain = audioCtx.createGain();
    bump.type = "square";
    bump.frequency.setValueAtTime(72 + (hash % 32), now);
    bump.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    bumpGain.gain.setValueAtTime(0.12, now);
    bumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    bump.connect(bumpGain);
    bumpGain.connect(masterGain);
    bump.start(now);
    bump.stop(now + 0.2);
}

function playBootTick(hash) {
    if (!audioUnlocked || !audioCtx || !masterGain || !bootLoop) return;

    const now = audioCtx.currentTime;
    const clickLength = Math.floor(audioCtx.sampleRate * 0.028);
    const buffer = audioCtx.createBuffer(1, clickLength, audioCtx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < clickLength; i++) {
        const decay = 1 - i / clickLength;
        samples[i] = (Math.random() * 2 - 1) * decay * 0.75;
    }

    const source = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 620 + (hash % 480);
    filter.Q.value = 7;
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(now);
    source.stop(now + 0.055);
}

function startReaderBootLoop(disk) {
    if (!ensureAudio()) {
        pendingAudioActions.push(() => startReaderBootLoop(disk));
        return;
    }

    stopReaderBootLoop();

    const now = audioCtx.currentTime;
    const hash = hashText(`${disk.dataset.code}${disk.dataset.tone}${disk.dataset.title}`);
    const hum = audioCtx.createOscillator();
    const humFilter = audioCtx.createBiquadFilter();
    const humGain = audioCtx.createGain();
    const tremolo = audioCtx.createOscillator();
    const tremoloGain = audioCtx.createGain();

    hum.type = "sawtooth";
    hum.frequency.value = 46 + (hash % 18);
    humFilter.type = "lowpass";
    humFilter.frequency.value = 210 + (hash % 90);
    humFilter.Q.value = 2.4;
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.055, now + 0.18);

    tremolo.type = "sine";
    tremolo.frequency.value = 5.2 + (hash % 5) * 0.28;
    tremoloGain.gain.value = 0.018;

    tremolo.connect(tremoloGain);
    tremoloGain.connect(humGain.gain);
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(masterGain);
    hum.start(now);
    tremolo.start(now);

    bootLoop = {
        hum,
        tremolo,
        gain: humGain,
        tickTimer: window.setInterval(() => playBootTick(hash), 145 + (hash % 55)),
    };

    playBootTick(hash);
}

function stopReaderBootLoop() {
    if (!bootLoop) return;

    const now = audioCtx ? audioCtx.currentTime : 0;
    window.clearInterval(bootLoop.tickTimer);

    if (audioCtx) {
        bootLoop.gain.gain.cancelScheduledValues(now);
        bootLoop.gain.gain.setTargetAtTime(0.0001, now, 0.045);
        bootLoop.hum.stop(now + 0.18);
        bootLoop.tremolo.stop(now + 0.18);
    }

    bootLoop = null;
}

function playInsertWarp(disk) {
    if (!ensureAudio()) {
        pendingAudioActions.push(() => playInsertWarp(disk));
        return;
    }

    const now = audioCtx.currentTime;
    const hash = hashText(`${disk.dataset.tone}${disk.dataset.copy}`);
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(280 + (hash % 180), now);
    filter.frequency.exponentialRampToValueAtTime(2200 + (hash % 700), now + 0.72);
    filter.Q.value = 9;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.86);
    filter.connect(gain);
    gain.connect(masterGain);

    [0.5, 1, 1.997].forEach((ratio, index) => {
        const osc = audioCtx.createOscillator();
        osc.type = index === 1 ? "sawtooth" : "triangle";
        osc.frequency.setValueAtTime((190 + (hash % 90)) * ratio, now);
        osc.frequency.exponentialRampToValueAtTime((820 + (hash % 220)) * ratio, now + 0.8);
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + 0.9);
    });
}

function updateReaderForDisk(disk, verb = "SCANNING") {
    readerTitle.textContent = disk.dataset.title || "UNKNOWN DISK";
    readerMessage.textContent = disk.dataset.copy || "The machine cannot explain this cartridge.";
    readerStatus.textContent = `${verb} // ${disk.dataset.code || "NO-CODE"}`;
}

function armDisk(disk) {
    const hue = diskHue(disk);
    activeHue = hue / 360;
    hoverTarget = 1;
    root.style.setProperty("--primary", `hsl(${hue} 100% 58%)`);
    disks.forEach((item) => item.classList.toggle("is-armed", item === disk));
    updateReaderForDisk(disk);
    triggerIlluminationBlast(disk);
    playToneForDisk(disk);
}

function clearArm() {
    hoverTarget = 0;
    disks.forEach((item) => item.classList.remove("is-armed"));
    pendingToneDisk = null;
    pendingAudioActions = [];
    if (!reader.classList.contains("is-loading")) {
        readerTitle.textContent = "NO DISK";
        readerMessage.textContent = "Insert a program disk to launch.";
        readerStatus.textContent = "WAITING FOR PROGRAM DISK";
    }
}

function launchDisk(disk) {
    if (!disk || reader.classList.contains("is-loading")) return;

    stopReaderBootLoop();
    ensureAudio();
    updateReaderForDisk(disk, "INSERTED");
    playToneForDisk(disk);
    playInsertWarp(disk);
    triggerMatrixWarp(disk);
    startForegroundWarp(disk);
    hoverTarget = 1;
    reader.classList.add("is-loading");
    document.body.classList.add("launch-flash");
    readerStatus.textContent = `READING ${disk.dataset.code} // PLEASE REMAIN PHYSICAL`;

    window.setTimeout(() => {
        window.location.href = disk.href;
    }, 1850);
}

function isInsideReader(x, y) {
    const rect = reader.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function startCustomDrag(event, disk) {
    if (event.button !== undefined && event.button !== 0) return;

    ensureAudio();
    event.preventDefault();
    disk.setPointerCapture?.(event.pointerId);
    dragState.active = true;
    dragState.disk = disk;
    dragState.pointerId = event.pointerId;
    disk.classList.add("is-dragging");
    dragGhost.dataset.title = disk.dataset.title;
    dragGhost.classList.add("is-visible");
    armDisk(disk);
    triggerPhoenixBlast(disk);
    playReaderClick(disk);
    startReaderBootLoop(disk);
    moveCustomDrag(event.clientX, event.clientY);
}

function moveCustomDrag(x, y) {
    if (!dragState.active) return;

    updateCursor(x, y);
    const overReader = isInsideReader(x, y);
    dragGhost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${overReader ? 2 : -5}deg)`;
    reader.classList.toggle("is-hot", overReader);
}

function endCustomDrag(event) {
    if (!dragState.active) return;

    const disk = dragState.disk;
    const shouldLaunch = isInsideReader(event.clientX, event.clientY);
    disk.classList.remove("is-dragging");
    dragGhost.classList.remove("is-visible");
    reader.classList.remove("is-hot");
    dragState.active = false;
    dragState.disk = null;
    dragState.pointerId = null;

    if (shouldLaunch) {
        launchDisk(disk);
    } else {
        stopReaderBootLoop();
        clearArm();
    }
}

function installDiskInteractions() {
    disks.forEach((disk) => {
        disk.addEventListener("click", (event) => {
            event.preventDefault();
            ensureAudio();
            armDisk(disk);
            readerStatus.textContent = "DRAG REQUIRED // DROP DISK INTO READER";
        });

        disk.addEventListener("pointerdown", (event) => startCustomDrag(event, disk));
        disk.addEventListener("pointermove", (event) => {
            if (dragState.active && dragState.pointerId === event.pointerId) {
                moveCustomDrag(event.clientX, event.clientY);
            }
        });
        disk.addEventListener("pointerup", endCustomDrag);
        disk.addEventListener("pointercancel", endCustomDrag);

        disk.addEventListener("mouseenter", () => {
            ensureAudio();
            armDisk(disk);
        });
        disk.addEventListener("focus", () => {
            ensureAudio();
            armDisk(disk);
        });
        disk.addEventListener("mouseleave", () => {
            if (!dragState.active) clearArm();
        });
        disk.addEventListener("blur", () => {
            if (!dragState.active) clearArm();
        });
        disk.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                ensureAudio();
                launchDisk(disk);
            }
        });

        disk.addEventListener("dragstart", (event) => {
            ensureAudio();
            event.dataTransfer.setData("text/plain", disk.href);
            event.dataTransfer.effectAllowed = "move";
            disk.classList.add("is-dragging");
            armDisk(disk);
            triggerPhoenixBlast(disk);
            playReaderClick(disk);
            startReaderBootLoop(disk);
        });
        disk.addEventListener("dragend", () => {
            disk.classList.remove("is-dragging");
            reader.classList.remove("is-hot");
            if (!reader.classList.contains("is-loading")) {
                stopReaderBootLoop();
            }
        });
    });

    reader.addEventListener("dragover", (event) => {
        event.preventDefault();
        reader.classList.add("is-hot");
        event.dataTransfer.dropEffect = "move";
    });
    reader.addEventListener("dragleave", () => {
        if (!dragState.active) reader.classList.remove("is-hot");
    });
    reader.addEventListener("drop", (event) => {
        event.preventDefault();
        reader.classList.remove("is-hot");
        const href = event.dataTransfer.getData("text/plain");
        const disk = disks.find((item) => item.href === href || item.getAttribute("href") === href);
        if (disk) launchDisk(disk);
    });
}

function installGlobalInteractions() {
    window.addEventListener("resize", resize);
    document.addEventListener("pointerdown", (event) => {
        if (!dragState.active && !event.target.closest(".diskette, .reader")) {
            clearArm();
        }
    }, { passive: true });
    window.addEventListener("pointermove", (event) => {
        updateCursor(event.clientX, event.clientY);
        if (dragState.active && dragState.pointerId === event.pointerId) {
            moveCustomDrag(event.clientX, event.clientY);
        }
    }, { passive: true });
    window.addEventListener("pointerup", (event) => {
        if (dragState.active && dragState.pointerId === event.pointerId) {
            endCustomDrag(event);
        }
    });
    window.addEventListener("keydown", ensureAudio, { once: true });
    window.addEventListener("pointerdown", ensureAudio, { once: true });
    window.addEventListener("touchstart", ensureAudio, { once: true, passive: true });
}

resize();
installDiskInteractions();
installGlobalInteractions();
updateCursor(cursor.x, cursor.y);

if (webgl) {
    if (reducedMotion) {
        renderBackground(performance.now());
    } else {
        requestAnimationFrame(renderBackground);
    }
}
