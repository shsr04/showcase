function isStationLocked() {
    return document.pointerLockElement === els.station;
}

function stationBounds() {
    return els.station.getBoundingClientRect();
}

function clampVirtualCursor() {
    const bounds = stationBounds();
    virtualCursorX = clamp(virtualCursorX, bounds.left, bounds.right - 1);
    virtualCursorY = clamp(virtualCursorY, bounds.top, bounds.bottom - 1);
}

function renderVirtualCursor() {
    els.virtualCursor.style.transform = `translate3d(${virtualCursorX - 8}px, ${virtualCursorY - 8}px, 0)`;
}

function setVirtualCursorFromEvent(event) {
    virtualCursorX = event.clientX;
    virtualCursorY = event.clientY;
    clampVirtualCursor();
    renderVirtualCursor();
}

function moveVirtualCursor(event) {
    virtualCursorX += (event.movementX || 0) * VIRTUAL_CURSOR_SENSITIVITY;
    virtualCursorY += (event.movementY || 0) * VIRTUAL_CURSOR_SENSITIVITY;
    clampVirtualCursor();
    renderVirtualCursor();
}

function resolveVirtualControl() {
    const target = document.elementFromPoint(virtualCursorX, virtualCursorY);
    return target?.closest?.("[data-control]") || null;
}

function setVirtualHover(control) {
    if (virtualHoverControl === control) return;
    virtualHoverControl?.classList.remove("is-virtual-hover");
    virtualHoverControl = control;
    virtualHoverControl?.classList.add("is-virtual-hover");
}

function clearVirtualPressed() {
    virtualPressedControl?.classList.remove("is-virtual-pressed");
    virtualPressedControl = null;
}

function beginVirtualKnobDrag(control, event) {
    const input = knobInput(control);
    if (!input) return;

    if (event.shiftKey && control.dataset.laneKnob) {
        toggleLaneKnob(control);
        return;
    }

    if (event.shiftKey && isBipolarKnob(control)) {
        toggleBipolarKnob(control);
        return;
    }

    const { min, max } = knobBounds(input);
    const value = Number(input.value);
    activeVirtualDrag = {
        type: "knob",
        control,
        input,
        norm: (value - min) / (max - min),
        min,
        max,
    };
    els.station.classList.add("is-virtual-knob-dragging");
}

function beginVirtualSliderDrag(control) {
    activeVirtualDrag = { type: "slider", control };
    updateVirtualSlider(control);
}

function updateVirtualKnob(event) {
    const delta = (event.movementX || 0) / KNOB_DRAG_WIDTH * KNOB_SENSITIVITY;
    activeVirtualDrag.norm = clamp(activeVirtualDrag.norm + delta, 0, 1);
    const value = activeVirtualDrag.min + activeVirtualDrag.norm * (activeVirtualDrag.max - activeVirtualDrag.min);
    setInputValue(activeVirtualDrag.input, value);
}

function updateVirtualSlider(control) {
    const bounds = control.getBoundingClientRect();
    const min = Number(control.min || 0);
    const max = Number(control.max || 100);
    const norm = bounds.width > 0 ? clamp((virtualCursorX - bounds.left) / bounds.width, 0, 1) : 0;
    const value = Math.round(min + norm * (max - min));
    if (Number(control.value) === value) return;
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleVirtualPointerDown(event) {
    if (!isStationLocked()) return;
    if (event.button !== 0) return;
    const control = resolveVirtualControl();
    if (!control) return;

    setVirtualHover(control);
    virtualPressedControl = control;
    virtualPressedControl.classList.add("is-virtual-pressed");

    if (control.dataset.control === "knob") beginVirtualKnobDrag(control, event);
    if (control.dataset.control === "slider") beginVirtualSliderDrag(control);

    event.preventDefault();
}

function handleVirtualPointerMove(event) {
    if (!isStationLocked()) return;

    if (activeVirtualDrag?.type === "knob") {
        updateVirtualKnob(event);
    } else {
        moveVirtualCursor(event);
        if (activeVirtualDrag?.type === "slider") updateVirtualSlider(activeVirtualDrag.control);
        else setVirtualHover(resolveVirtualControl());
    }

    event.preventDefault();
}

function handleVirtualPointerUp(event) {
    if (!isStationLocked()) return;
    if (event.button !== 0) return;
    const releaseControl = resolveVirtualControl();
    if (virtualPressedControl?.dataset.control === "button" && releaseControl === virtualPressedControl) {
        virtualPressedControl.click();
    }
    activeVirtualDrag = null;
    els.station.classList.remove("is-virtual-knob-dragging");
    clearVirtualPressed();
    setVirtualHover(releaseControl);
    event.preventDefault();
}

function handleStationPointerDown(event) {
    if (!els.station.contains(event.target)) return;
    if (!isStationLocked() && typeof els.station.requestPointerLock === "function") {
        setVirtualCursorFromEvent(event);
        els.station.requestPointerLock();
    }
}

function handleStationPointerLockChange() {
    const locked = isStationLocked();
    els.station.classList.toggle("is-station-locked", locked);
    if (!locked) {
        activeVirtualDrag = null;
        els.station.classList.remove("is-virtual-knob-dragging");
        setVirtualHover(null);
        clearVirtualPressed();
    } else {
        clampVirtualCursor();
        renderVirtualCursor();
        setVirtualHover(resolveVirtualControl());
    }
}
