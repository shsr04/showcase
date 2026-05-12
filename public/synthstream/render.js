function renderStaticUi() {
    els.decks.innerHTML = decks.map(deck => `
        <article class="deck" data-deck="${deck.id}" style="--deck-color: ${deck.color}">
            <header class="deck-header">
                <div class="deck-title">
                    <strong>${deck.label}</strong>
                    <span class="deck-kicker">${deck.title}</span>
                </div>
                <span class="library-switcher" aria-label="${deck.label} library selector">
                    <button class="library-button" type="button" data-control="button" data-library-prev="${deck.id}" aria-label="Previous ${deck.label} library">&lt;</button>
                    <button class="library-button" type="button" data-control="button" data-library-next="${deck.id}" aria-label="Next ${deck.label} library">&gt;</button>
                </span>
                <span class="deck-status-light" aria-hidden="true"></span>
            </header>
            <div class="lane-grid">
                ${deck.lanes.map(lane => renderLane(deck, lane)).join("")}
            </div>
            <div class="deck-strip">
                <div class="strip-block insert-strip">
                    <span class="control-label">FX Insert</span>
                    <div class="insert-fx-bank" aria-label="${deck.label} insert FX controls">
                        ${INSERT_FX.map(effect => `
                            <span class="insert-fx">
                                <span class="insert-fx-label">${effect.label}</span>
                                ${knobMarkup({
                                    id: `insert-${deck.id}-${effect.id}`,
                                    value: deck.insertFx[effect.id],
                                    label: `${deck.label} insert ${effect.label}`,
                                    inputAttrs: `data-insert-fx="${deck.id}:${effect.id}"`,
                                    className: "is-insert-knob",
                                    showValue: false
                                })}
                            </span>
                        `).join("")}
                    </div>
                </div>
                <div class="strip-block channel-strip-block">
                    <div class="channel-mixer-strip">
                        <div class="eq-filter-bank" aria-label="${deck.label} EQ and filter controls">
                            ${["low", "mid", "high"].map(band => `
                            <span class="channel-cell">
                                <span class="channel-label">EQ ${band[0].toUpperCase()}</span>
                                ${knobMarkup({
                                    id: `eq-${deck.id}-${band}`,
                                    value: deck.eq[band],
                                    min: -26,
                                    max: 6,
                                    kind: "bipolar",
                                    label: `${deck.label} EQ ${band}`,
                                    inputAttrs: `data-eq-band="${deck.id}:${band}"`,
                                    className: "is-eq-knob",
                                    showValue: false
                                })}
                            </span>
                            `).join("")}
                            <span class="channel-cell">
                                <span class="channel-label">Filter</span>
                                ${knobMarkup({ id: `filter-${deck.id}`, value: deck.controls.filter, min: -100, max: 100, kind: "bipolar", label: `${deck.label} filter`, inputAttrs: `data-filter="${deck.id}"`, showValue: false })}
                            </span>
                        </div>
                        <div class="channel-output-bank">
                            <span class="channel-cell deck-level">
                                <span class="channel-label">Level</span>
                                ${knobMarkup({ id: `deck-level-${deck.id}`, value: deck.controls.level, label: `${deck.label} channel level`, inputAttrs: `data-deck-level="${deck.id}"`, showValue: false })}
                            </span>
                            <span class="meter channel-meter">
                                <span class="meter-label">Meter</span>
                                <span class="meter-track"><span class="meter-fill" data-deck-meter="${deck.id}"></span></span>
                                <span class="meter-hint">Pre-Xfade</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `).join("");

    els.stepGrid.innerHTML = Array.from({ length: STEPS }, (_, index) => `<span class="${index % 4 === 0 ? "is-beat" : ""}" data-step-cell="${index}" aria-label="Step ${index + 1}"></span>`).join("");
    els.divisionGroup.innerHTML = DIVISIONS.map(division => `
        <button class="division-button ${division.label === selectedDivision ? "is-active" : ""}" type="button" data-control="button" data-division="${division.label}">${division.label}</button>
    `).join("");
    bindDynamicEvents();
    renderState();
}

function renderLane(deck, lane) {
    const pattern = Array.from(lane.pattern).map((symbol, index) => {
        const classes = [
            symbol !== "-" ? "is-hit" : "",
            symbol !== "-" && symbol === symbol.toLowerCase() ? "is-soft" : "",
            symbol === "~" ? "is-sustain" : "",
        ].filter(Boolean).join(" ");
        return `<span class="${classes}" data-pattern-cell="${deck.id}:${lane.id}:${index}">${symbol}</span>`;
    }).join("");

    return `
        <div class="lane ${isLaneActive(lane) ? "is-enabled" : ""}" data-lane="${deck.id}:${lane.id}">
            <div class="lane-cell lane-name">
                <span>${lane.label}</span>
            </div>
            <div class="lane-cell level">
                ${knobMarkup({ id: `lane-level-${deck.id}-${lane.id}`, value: lane.level, label: `${deck.label} ${lane.label} level`, dataset: `data-lane-knob="${deck.id}:${lane.id}"`, inputAttrs: `data-lane-level="${deck.id}:${lane.id}"`, className: "is-lane-knob", showValue: false })}
            </div>
            <div class="lane-cell">
                <div class="pattern" aria-label="${lane.label} pattern">${pattern}</div>
            </div>
            <div class="lane-cell lane-meter"><span aria-hidden="true"></span></div>
        </div>
    `;
}

function renderState() {
    const now = performance.now();
    decks.forEach(deck => {
        const deckElement = document.querySelector(`[data-deck="${deck.id}"]`);
        const hasEnabledLane = deck.lanes.some(lane => isLaneActive(lane));
        const hasRecentPulse = deck.lanes.some(lane => now - lane.lastPulse < 130);
        if (deckElement) {
            deckElement.classList.toggle("has-enabled", hasEnabledLane);
            deckElement.classList.toggle("is-active", hasRecentPulse);
        }
        deck.lanes.forEach(lane => {
            const row = document.querySelector(`[data-lane="${deck.id}:${lane.id}"]`);
            if (!row) return;
            row.classList.toggle("is-enabled", isLaneActive(lane));
            row.classList.toggle("is-pulsing", now - lane.lastPulse < 130);
        });
    });
    renderStep();
}

function renderStep() {
    els.stepReadout.textContent = `Step ${String(visibleStep + 1).padStart(2, "0")} / 16`;
    document.querySelectorAll("[data-step-cell]").forEach(cell => {
        cell.classList.toggle("is-current", Number(cell.dataset.stepCell) === visibleStep);
    });
    document.querySelectorAll("[data-pattern-cell]").forEach(cell => {
        const [, , index] = cell.dataset.patternCell.split(":");
        cell.classList.toggle("is-current", Number(index) === visibleStep);
    });
}

function renderMeters() {
    decks.forEach(deck => {
        const meter = document.querySelector(`[data-deck-meter="${deck.id}"]`);
        const nodes = deckNodes[deck.id];
        const value = nodes && isPlaying ? meterValue(nodes.analyser, nodes.data) : deck.lanes.reduce((max, lane) => {
            return Math.max(max, performance.now() - lane.lastPulse < 130 ? lane.level / 100 : 0);
        }, 0) * 0.45;
        if (meter) meter.style.width = `${Math.round(value * 100)}%`;
    });

    const masterValue = masterAnalyser && isPlaying ? meterValue(masterAnalyser, masterMeterData) : 0;
    els.masterMeter.style.width = `${Math.round(masterValue * 100)}%`;
}