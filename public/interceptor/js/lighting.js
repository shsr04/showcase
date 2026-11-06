// Note: screen-space darkness overlay; lights are erased from a 480x270 canvas each frame.

import { VIEW_W, VIEW_H } from './config.js';

export class Lighting {
  constructor(scene, depth) {
    this.scene = scene;
    this.key = 'fx:light';
    if (scene.textures.exists(this.key)) scene.textures.remove(this.key);
    this.tex = scene.textures.createCanvas(this.key, VIEW_W, VIEW_H);
    this.ctx = this.tex.getContext();
    this.img = scene.add.image(0, 0, this.key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.dark = -1;
  }

  // Note: lights = [{x, y (screen px), r, kind:'radial'|'cone', a, spread, power}].
  draw(dark, lights) {
    const ctx = this.ctx;
    if (dark <= 0.01) {
      if (this.dark !== 0) {
        ctx.clearRect(0, 0, VIEW_W, VIEW_H);
        this.tex.refresh();
        this.dark = 0;
      }
      this.img.setVisible(false);
      return;
    }
    this.dark = dark;
    this.img.setVisible(true);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = `rgba(6, 8, 18, ${dark})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      if (l.x < -l.r || l.y < -l.r || l.x > VIEW_W + l.r || l.y > VIEW_H + l.r) continue;
      const p = l.power ?? 1;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(0,0,0,${0.95 * p})`);
      g.addColorStop(0.55, `rgba(0,0,0,${0.6 * p})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      if (l.kind === 'cone') {
        ctx.moveTo(l.x, l.y);
        ctx.arc(l.x, l.y, l.r, l.a - l.spread, l.a + l.spread);
        ctx.closePath();
      } else {
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Note: a faint blue cast keeps night readable instead of pure black.
    ctx.fillStyle = `rgba(20, 30, 60, ${dark * 0.12})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.tex.refresh();
  }

  destroy() {
    this.img.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
