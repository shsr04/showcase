// Note: draws the focus blur of careful aim (SPEC item 184) as a small canvas laid over the game canvas, under the speech bubbles. After every frame it takes a soft copy of the finished picture, cuts the sharp window out of it and clips what is left to the visible field, so it can only ever blur what is already shown. The maths is in focus.js; with no careful aim the canvas is hidden and nothing is copied.

import { VIEW_W, TILE } from './config.js';
import { windowWedges, ease } from './focus.js';

// Note: the effect is drawn on a grid 480 wide at any SCALE, and the browser smooths it up to the stage; that smoothing is part of the blur.
const OUT_W = 480;
const K = OUT_W / VIEW_W;
const SAMPLE = 0.5;

export class FocusFx {
  // Note: game is the Phaser game (its canvas and post-render event); stage is the element the canvas goes into, in front of before; make builds a canvas (tests pass a stub).
  constructor(game, stage, { before = null, make = null } = {}) {
    this.game = game;
    this.w = OUT_W;
    this.h = Math.round((OUT_W * 9) / 16);
    const build = make || ((w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }));
    this.cnv = build(this.w, this.h);
    this.ctx = this.cnv.getContext('2d');
    this.lo = build(Math.round(this.w * SAMPLE), Math.round(this.h * SAMPLE));
    this.loCtx = this.lo.getContext('2d');
    this.maskCnv = build(this.w, this.h);
    this.mask = this.maskCnv.getContext('2d');
    this.canFilter = typeof this.ctx.filter === 'string';
    this.shown = false;
    this.opacity = -1;
    this.pending = null;
    this.frames = 0;
    if (this.cnv.style) {
      Object.assign(this.cnv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
      this.cnv.setAttribute?.('aria-hidden', 'true');
      this.cnv.className = 'focus-blur';
    }
    if (stage) stage.insertBefore(this.cnv, before || null);
    this.onPost = () => this.paint();
    if (game && game.events) game.events.on('postrender', this.onPost);
  }

  // Note: called while the scene is built each frame, before Phaser draws it; the blur is painted from this in the post-render step. win is view.focus, sx and sy are the camera scroll.
  update(view, sx, sy, zoom = 1) {
    this.zoom = zoom;
    const win = view.focus;
    this.pending = win && win.strength > 0.004 ? { view, win, sx, sy } : null;
    if (!this.pending) this.hide();
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.opacity = -1;
    if (this.cnv.style) this.cnv.style.display = 'none';
  }

  // Note: world metres to a point on this grid.
  at(x, y, sx, sy) {
    return [(x * TILE - sx) * K * (this.zoom ?? 1), (y * TILE - sy) * K * (this.zoom ?? 1)];
  }

  poly(ctx, pts, sx, sy) {
    if (!pts || pts.length < 3) return;
    const [x0, y0] = this.at(pts[0][0], pts[0][1], sx, sy);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = this.at(pts[i][0], pts[i][1], sx, sy);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Note: one frame: soft copy of the picture, a slight dimming, the sharp window cut out (nested wedges plus the ring round the eye), then everything outside the visible field removed last.
  paint() {
    const p = this.pending;
    if (!p) return;
    const { view, win, sx, sy } = p;
    const src = this.game && this.game.canvas;
    if (!src) return;
    const { ctx, loCtx, w, h } = this;
    loCtx.imageSmoothingEnabled = true;
    loCtx.imageSmoothingQuality = 'high';
    loCtx.globalCompositeOperation = 'copy';
    loCtx.drawImage(src, 0, 0, this.lo.width, this.lo.height);
    ctx.globalCompositeOperation = 'copy';
    if (this.canFilter) ctx.filter = 'blur(1.2px)';
    ctx.drawImage(this.lo, 0, 0, w, h);
    if (this.canFilter) ctx.filter = 'none';
    // Note: the blurred part is drawn a little darker, so the eye settles on the sharp middle.
    if (win.dim > 0.002) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(8,6,4,${win.dim.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    const [ex, ey] = this.at(view.eye.x, view.eye.y, sx, sy);
    const reach = (view.range + 2) * TILE * K;
    ctx.globalCompositeOperation = 'destination-out';
    for (const wd of windowWedges(win)) {
      ctx.fillStyle = `rgba(0,0,0,${wd.alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      const steps = Math.max(2, Math.ceil((2 * wd.half) / 0.1));
      for (let i = 0; i <= steps; i++) {
        const a = win.facing - wd.half + (2 * wd.half * i) / steps;
        ctx.lineTo(ex + Math.cos(a) * reach, ey + Math.sin(a) * reach);
      }
      ctx.closePath();
      ctx.fill();
    }
    const r0 = win.near * TILE * K;
    const r1 = (win.near + win.nearFeather) * TILE * K;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r1);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      g.addColorStop(t, `rgba(0,0,0,${(1 - ease((t * r1 - r0) / (r1 - r0))).toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(ex - r1, ey - r1, 2 * r1, 2 * r1);
    // Note: last of all, so nothing that was never in sight can show: the whole field, and the patch of the other floor seen through the stairwell, merged on a mask first so two overlapping outlines never cancel.
    const m = this.mask;
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, w, h);
    m.fillStyle = '#fff';
    for (const pts of [view.cone, ...(view.throughs || [view.through]).map((th) => th && th.cone)]) {
      m.beginPath();
      this.poly(m, pts, sx, sy);
      m.fill();
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.maskCnv, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const op = Math.round(win.strength * 50) / 50;
    if (op !== this.opacity && this.cnv.style) {
      this.opacity = op;
      this.cnv.style.opacity = String(op);
    }
    if (!this.shown && this.cnv.style) {
      this.shown = true;
      this.cnv.style.display = 'block';
    }
    this.frames++;
  }

  destroy() {
    if (this.game && this.game.events) this.game.events.off('postrender', this.onPost);
    if (this.cnv.parentNode) this.cnv.parentNode.removeChild(this.cnv);
    this.pending = null;
  }
}
