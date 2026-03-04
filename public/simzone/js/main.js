import { CONFIG } from './config.js';
import { City } from './city.js';
import { Economy } from './economy.js';
import { Citizen } from './citizen.js';
import { Renderer } from './renderer.js';

class SimZone {
    constructor() {
        this.day = 0;
        this.citizens = [];
        this.running = false;
        this.speed = 1;

        this.city = new City(CONFIG.GRID_SIZE, CONFIG.GRID_SIZE);
        this.economy = new Economy();
        this.renderer = new Renderer('sim-canvas', this.city);

        this.setupUI();
        this.initPopulation();

        this.lastFrameTime = 0;
        this.accumulatedTime = 0;

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
    }

    initPopulation() {
        for (let i = 0; i < CONFIG.STARTING_POPULATION; i++) {
            // Distribute based on wealth logic later, for now random valid spots
            const startPos = this.city.getRandomPointInZone(CONFIG.ZONE_TYPES.RESIDENTIAL_MED);
            this.citizens.push(new Citizen(i, startPos.x, startPos.y));
        }
        this.updateStats();
    }

    setupUI() {
        // Stats
        this.els = {
            day: document.getElementById('day-display'),
            pop: document.getElementById('pop-display'),
            wealth: document.getElementById('wealth-display'),
            homeless: document.getElementById('homeless-display'),
            speed: document.getElementById('speed-slider'),
            pause: document.getElementById('pause-btn'),
            step: document.getElementById('step-btn'),
            tax: document.getElementById('tax-rate-input'),
            ubi: document.getElementById('ubi-input')
        };

        // Controls
        this.els.speed.addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
            if (this.speed > 0 && !this.running) this.running = true;
            if (this.speed === 0) this.running = false;
        });

        this.els.pause.addEventListener('click', () => {
            this.running = !this.running;
            this.els.pause.textContent = this.running ? 'Pause' : 'Resume';
        });

        this.els.step.addEventListener('click', () => {
            this.advanceDay();
            this.renderer.render(this.citizens);
        });

        this.els.tax.addEventListener('change', (e) => {
            this.economy.setTaxRate(parseFloat(e.target.value) / 100);
        });

        this.els.ubi.addEventListener('change', (e) => {
            this.economy.setUBI(parseFloat(e.target.value));
        });

        this.running = true;
    }

    loop(timestamp) {
        const dt = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        if (this.running && this.speed > 0) {
            this.accumulatedTime += dt * this.speed; // Speed multiplier

            if (this.accumulatedTime >= CONFIG.MS_PER_DAY) {
                this.advanceDay();
                this.accumulatedTime = 0;
            }
        }

        // Always render (for smooth animations if we add them later)
        // For now, render on loop is fine
        this.renderer.render(this.citizens);

        requestAnimationFrame((t) => this.loop(t));
    }

    advanceDay() {
        this.day++;
        this.economy.newDay();
        this.economy.distributeUBI(this.citizens.length);

        // Update each citizen
        for (const citizen of this.citizens) {
            citizen.updateDaily(this.economy);

            // Simple movement logic: wander a bit
            // In future: Home -> Work -> Home
            if (!citizen.homeless) {
                const moveX = Math.floor(Math.random() * 3) - 1;
                const moveY = Math.floor(Math.random() * 3) - 1;

                // Keep within bounds
                const newX = Math.max(0, Math.min(this.city.width - 1, citizen.x + moveX));
                const newY = Math.max(0, Math.min(this.city.height - 1, citizen.y + moveY));

                citizen.x = newX;
                citizen.y = newY;
            }
        }

        this.updateStats();
    }

    updateStats() {
        this.els.day.textContent = this.day;
        this.els.pop.textContent = this.citizens.length;

        const totalWealth = this.citizens.reduce((sum, c) => sum + c.netWorth, 0);
        const avgWealth = Math.floor(totalWealth / this.citizens.length);
        this.els.wealth.textContent = avgWealth.toLocaleString();

        const homelessCount = this.citizens.filter(c => c.homeless).length;
        const homelessRate = ((homelessCount / this.citizens.length) * 100).toFixed(1);
        this.els.homeless.textContent = `${homelessRate}%`;
    }
}

// Start
window.addEventListener('DOMContentLoaded', () => {
    new SimZone();
});
