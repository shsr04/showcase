import { CONFIG } from './config.js';

export class City {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = new Array(width * height).fill(CONFIG.ZONE_TYPES.EMPTY);

        this.initializeCity();
    }

    initializeCity() {
        // Simple concentric city generation
        const cx = Math.floor(this.width / 2);
        const cy = Math.floor(this.height / 2);

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                const idx = y * this.width + x;

                if (dist < 5) {
                    this.grid[idx] = CONFIG.ZONE_TYPES.COMMERCIAL;
                } else if (dist < 15) {
                    this.grid[idx] = CONFIG.ZONE_TYPES.RESIDENTIAL_HIGH;
                } else if (dist < 30) {
                    this.grid[idx] = CONFIG.ZONE_TYPES.RESIDENTIAL_MED;
                } else if (dist < 45) {
                    this.grid[idx] = CONFIG.ZONE_TYPES.RESIDENTIAL_LOW;
                } else {
                    this.grid[idx] = Math.random() > 0.9 ? CONFIG.ZONE_TYPES.INDUSTRIAL : CONFIG.ZONE_TYPES.EMPTY;
                }
            }
        }
    }

    getZone(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.grid[Math.floor(y) * this.width + Math.floor(x)];
    }

    getRandomPointInZone(zoneType) {
        // Inefficient but simple for now
        let attempts = 0;
        while (attempts < 1000) {
            const x = Math.floor(Math.random() * this.width);
            const y = Math.floor(Math.random() * this.height);
            if (this.getZone(x, y) === zoneType) {
                return { x, y };
            }
            attempts++;
        }
        return { x: this.width / 2, y: this.height / 2 }; // Fallback
    }
}
