import { CONFIG } from './config.js';

export class Renderer {
    constructor(canvasId, city) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.city = city;

        this.cellSize = 0;
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        // Calculate cell size to fit grid
        const cellW = this.canvas.width / this.city.width;
        const cellH = this.canvas.height / this.city.height;
        this.cellSize = Math.min(cellW, cellH);
    }

    render(citizens) {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawCity();
        this.drawCitizens(citizens);
    }

    drawCity() {
        for (let y = 0; y < this.city.height; y++) {
            for (let x = 0; x < this.city.width; x++) {
                const zone = this.city.getZone(x, y);
                const color = CONFIG.COLORS[zone] || '#333';

                this.ctx.fillStyle = color;
                this.ctx.fillRect(
                    x * this.cellSize,
                    y * this.cellSize,
                    this.cellSize,
                    this.cellSize
                );
            }
        }
    }

    drawCitizens(citizens) {
        // Draw citizens as small dots
        const dotSize = Math.max(1, this.cellSize / 2);

        for (const citizen of citizens) {
            this.ctx.fillStyle = citizen.homeless ? CONFIG.COLORS.homeless : CONFIG.COLORS.citizen;

            this.ctx.beginPath();
            this.ctx.arc(
                citizen.x * this.cellSize + this.cellSize / 2,
                citizen.y * this.cellSize + this.cellSize / 2,
                dotSize,
                0,
                Math.PI * 2
            );
            this.ctx.fill();
        }
    }
}
