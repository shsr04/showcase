function knobRingMarkup() {
    return `
        <svg class="knob-ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <path class="knob-track"></path>
            <path class="knob-active"></path>
            <line class="knob-notch" x1="50" y1="13" x2="50" y2="24"></line>
        </svg>
    `;
}

function knobMarkup({ id, value, min = 0, max = 100, kind = "unipolar", label, dataset = "", inputAttrs = "", className = "", showValue = true }) {
    return `
        <button class="knob-button ${kind === "bipolar" ? "is-bipolar" : ""} ${className}" type="button" data-control="knob" data-knob data-input="${id}" data-kind="${kind}" data-show-value="${showValue}" aria-label="${label}" ${dataset}>
            ${knobRingMarkup()}
            ${showValue ? `<span class="knob-value">${formatKnobValue(value, min, max, kind)}</span>` : ""}
        </button>
        <input class="knob-input" id="${id}" type="range" min="${min}" max="${max}" value="${value}" tabindex="-1" ${inputAttrs}>
    `;
}

function formatKnobValue(value, min, max, kind) {
    const rounded = Math.round(value);
    if (kind === "unipolar") {
        if (rounded <= min) return "OFF";
        if (rounded >= max) return "MAX";
    }
    if (kind === "bipolar" && rounded === 0) return "0";
    return String(rounded);
}

function formatEqGain(value) {
    const rounded = Math.round(value);
    return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function initKnobs(root = document) {
    root.querySelectorAll("[data-knob]").forEach(button => {
        refreshKnob(button);
        if (button.dataset.knobReady === "true") return;
        button.dataset.knobReady = "true";
        button.addEventListener("pointerdown", startKnobDrag);
        button.addEventListener("keydown", handleKnobKeydown);
    });
}

function knobInput(button) {
    return document.getElementById(button.dataset.input);
}

function knobBounds(input) {
    return {
        min: Number(input.min || 0),
        max: Number(input.max || 100),
    };
}

function isBipolarKnob(button) {
    return button?.dataset.kind === "bipolar";
}

function rememberBipolarValue(button, input, value) {
    if (!isBipolarKnob(button) || value === 0) return;
    input.dataset.lastNonZeroValue = String(value);
}

function lastBipolarValue(input) {
    const value = Number(input.dataset.lastNonZeroValue);
    if (!Number.isFinite(value) || value === 0) return null;
    const { min, max } = knobBounds(input);
    return clamp(value, min, max);
}

function setInputValue(input, value) {
    const { min, max } = knobBounds(input);
    const rounded = Math.round(clamp(value, min, max));
    const button = document.querySelector(`[data-knob][data-input="${input.id}"]`);
    rememberBipolarValue(button, input, rounded);
    if (Number(input.value) === rounded) return;
    input.value = String(rounded);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    refreshKnob(button);
}

function ensureKnobRing(button) {
    if (!button.querySelector(".knob-ring")) button.insertAdjacentHTML("afterbegin", knobRingMarkup());
}

function knobPoint(cx, cy, radius, angle) {
    const radians = angle * Math.PI / 180;
    return {
        x: cx + radius * Math.sin(radians),
        y: cy - radius * Math.cos(radians),
    };
}

function describeKnobArc(startAngle, endAngle) {
    const start = knobPoint(50, 50, 42, startAngle);
    const end = knobPoint(50, 50, 42, endAngle);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    const sweep = endAngle >= startAngle ? 1 : 0;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A 42 42 0 ${largeArc} ${sweep} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function setKnobRendering(button, trackStart, trackEnd, activeStart, activeEnd, color) {
    ensureKnobRing(button);
    const track = button.querySelector(".knob-track");
    const active = button.querySelector(".knob-active");
    const notch = button.querySelector(".knob-notch");
    const hasActiveArc = Math.abs(activeEnd - activeStart) > 0.001;

    if (track) track.setAttribute("d", describeKnobArc(trackStart, trackEnd));
    if (active) {
        active.setAttribute("d", hasActiveArc ? describeKnobArc(activeStart, activeEnd) : "");
        active.style.display = hasActiveArc ? "" : "none";
    }
    if (notch) notch.setAttribute("transform", `rotate(${activeEnd} 50 50)`);
    button.style.setProperty("--knob-color", color);
}

function refreshKnob(button) {
    if (!button) return;
    const input = knobInput(button);
    if (!input) return;
    const { min, max } = knobBounds(input);
    const value = Number(input.value);
    const kind = button.dataset.kind || "unipolar";
    const norm = clamp((value - min) / (max - min), 0, 1);
    const display = button.querySelector(".knob-value");
    const color = kind === "bipolar" && value < 0 ? "var(--blue)" : value >= max ? "var(--amber)" : "var(--green)";

    if (display && button.dataset.showValue !== "false") display.textContent = formatKnobValue(value, min, max, kind);
    button.classList.toggle("is-off", kind === "unipolar" && value <= min);
    button.classList.toggle("is-negative", kind === "bipolar" && value < 0);

    if (kind === "bipolar") {
        const maxAbs = Math.max(Math.abs(min), Math.abs(max));
        const angle = maxAbs > 0 ? clamp(value / maxAbs, -1, 1) * 150 : 0;
        setKnobRendering(button, -150, 150, 0, angle, color);
        return;
    }

    const angle = -150 + norm * 300;
    setKnobRendering(button, -150, 150, -150, angle, color);
}

function startKnobDrag(event) {
    const button = event.currentTarget;
    const input = knobInput(button);
    if (!input) return;

    if (event.shiftKey && button.dataset.laneKnob) {
        event.preventDefault();
        toggleLaneKnob(button);
        return;
    }

    if (event.shiftKey && isBipolarKnob(button)) {
        event.preventDefault();
        toggleBipolarKnob(button);
        return;
    }

    const { min, max } = knobBounds(input);
    const startValue = Number(input.value);

    activeKnobDrag = {
        button,
        input,
        pointerId: event.pointerId,
        startX: event.clientX,
        startNorm: (startValue - min) / (max - min),
        norm: (startValue - min) / (max - min),
        min,
        max,
    };

    button.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", moveKnobDrag);
    window.addEventListener("pointerup", finishKnobDrag);
    window.addEventListener("pointercancel", finishKnobDrag);
    window.addEventListener("keydown", cancelKnobOnEscape);
    event.preventDefault();
}

function moveKnobDrag(event) {
    if (!activeKnobDrag || event.pointerId !== activeKnobDrag.pointerId) return;
    const hasPointerLock = document.pointerLockElement === activeKnobDrag.button;
    const delta = hasPointerLock
        ? event.movementX / KNOB_DRAG_WIDTH * KNOB_SENSITIVITY
        : (event.clientX - activeKnobDrag.startX) / KNOB_DRAG_WIDTH * KNOB_SENSITIVITY;
    const norm = clamp(hasPointerLock ? activeKnobDrag.norm + delta : activeKnobDrag.startNorm + delta, 0, 1);
    activeKnobDrag.norm = norm;
    const value = activeKnobDrag.min + norm * (activeKnobDrag.max - activeKnobDrag.min);
    setInputValue(activeKnobDrag.input, value);
    event.preventDefault();
}

function finishKnobDrag(event) {
    if (!activeKnobDrag || event.pointerId !== activeKnobDrag.pointerId) return;
    closeKnobDrag();
}

function cancelKnobOnEscape(event) {
    if (event.key === "Escape") closeKnobDrag();
}

function closeKnobDrag() {
    if (!activeKnobDrag) return;
    if (activeKnobDrag.button.hasPointerCapture?.(activeKnobDrag.pointerId)) {
        activeKnobDrag.button.releasePointerCapture(activeKnobDrag.pointerId);
    }
    activeKnobDrag = null;
    window.removeEventListener("pointermove", moveKnobDrag);
    window.removeEventListener("pointerup", finishKnobDrag);
    window.removeEventListener("pointercancel", finishKnobDrag);
    window.removeEventListener("keydown", cancelKnobOnEscape);
}

function toggleLaneKnob(button) {
    const input = knobInput(button);
    const [deckId, laneId] = button.dataset.laneKnob.split(":");
    const lane = laneById(deckId, laneId);
    if (!input || !lane) return;
    if (isLaneActive(lane)) {
        if (lane.level > LANE_OFF_LEVEL) lane.lastNonZeroLevel = lane.level;
        setInputValue(input, 0);
        setStatus(`${lane.label} muted on ${deckById(deckId).label}`);
        return;
    }
    setInputValue(input, lane.lastNonZeroLevel || lane.defaultLevel || 64);
    setStatus(`${lane.label} restored on ${deckById(deckId).label}`);
}

function toggleBipolarKnob(button) {
    const input = knobInput(button);
    if (!input) return;

    const value = Number(input.value);
    if (value !== 0) {
        rememberBipolarValue(button, input, value);
        setInputValue(input, 0);
        return;
    }

    const previous = lastBipolarValue(input);
    if (previous !== null) setInputValue(input, previous);
}

function handleKnobKeydown(event) {
    const input = knobInput(event.currentTarget);
    if (!input) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        setInputValue(input, Number(input.value) + step);
        event.preventDefault();
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        setInputValue(input, Number(input.value) - step);
        event.preventDefault();
    }
}
