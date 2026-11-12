// Note: screen-space darkness overlay; the unseen is dark, with no memory of rooms seen before. It is drawn small and scaled up, which is what makes the edges soft.

import { VIEW_W, VIEW_H, TILE, FOV_PRESET } from './config.js';
import { makeCanvas } from './draw.js';
import { featherWedges, zoneProfile, fieldFan, inPoly } from './los.js';

const WALL_REVEAL = 0.9;
// Note: light pixels per tile; the overlay is about 480 x 270 at any SCALE and is smoothed up to the view; the classic preset uses 12.
export const LIGHT_PX = FOV_PRESET === 'classic' ? 12 : 16;
// Note: the cool veil laid over the flank zone, as rgb and its alpha at full light; it reads as colour draining out of the corner of the eye.
const FLANK_RGB = '120,140,180';
const FLANK_VEIL = 0.4;
const K = LIGHT_PX / TILE;
// Note: item 497: share of the light taken from ground the terrain hides inside the field; all of it, so dead ground and the top of higher ground are black like the unseen.
export const HIDDEN_DIM = 1;
// Note: how dark the unseen is, 0..1; 1 is pure black, so no plan of unseen rooms shows (SPEC item 18).
export const DARK = 1;
const DARK_RGB = '7,5,4';
// Note: one art unit (a sixteenth of a tile) in light pixels, for the vignette radii.
const U = LIGHT_PX / 16;

export class Lighting {
  // Note: zoom is the camera's; below one the overlay covers the larger stretch of world in view, at the same light pixels per tile.
  constructor(scene, depth, zoom = 1) {
    this.scene = scene;
    this.key = 'fx:sight';
    this.lw = Math.ceil((VIEW_W / zoom / TILE) * LIGHT_PX);
    this.lh = Math.ceil((VIEW_H / zoom / TILE) * LIGHT_PX);
    if (scene.textures.exists(this.key)) scene.textures.remove(this.key);
    this.tex = scene.textures.createCanvas(this.key, this.lw, this.lh);
    this.ctx = this.tex.getContext();
    this.maskCnv = makeCanvas(this.lw, this.lh);
    this.mask = this.maskCnv.getContext('2d');
    this.blur = typeof this.ctx.filter === 'string';
    // Note: a fixed image is still zoomed about the screen centre, so it sits up and left of the origin to fill the screen.
    const back = 1 - 1 / zoom;
    this.img = scene.add.image((VIEW_W / 2) * back, (VIEW_H / 2) * back, this.key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth).setDisplaySize(VIEW_W / zoom, VIEW_H / zoom);
  }

  // Note: view = sim.view(); sx and sy are the camera scroll in game pixels; hurt in 0..1 closes the tunnel.
  draw(view, sx, sy, hurt = 0) {
    const ctx = this.ctx;
    const m = this.mask;
    const lw = this.lw;
    const lh = this.lh;
    const ex = (view.eye.x * TILE - sx) * K;
    const ey = (view.eye.y * TILE - sy) * K;
    const reach = view.range * LIGHT_PX;
    // Note: the light is gathered on a mask first, so one soft blur rounds every edge at once.
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, lw, lh);
    // Note: zones are drawn from the widest in, and each wedge replaces the light under it, so the innermost zone holding a point sets its light.
    for (let i = view.zones.length - 1; i >= 0; i--) this.zone(m, view, i, ex, ey, sx, sy, hurt);
    this.shadeHidden(m, view, sx, sy);
    // Note: each window onto another floor through a stairwell is lit like the cone, a little dimmer.
    for (const th of throughsOf(view)) {
      if (!th.cone || th.cone.length < 3) continue;
      m.fillStyle = 'rgba(255,255,255,0.85)';
      this.poly(m, th.cone, sx, sy);
      m.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${DARK_RGB},${DARK})`;
    ctx.fillRect(0, 0, lw, lh);
    ctx.globalCompositeOperation = 'destination-out';
    if (this.blur) ctx.filter = 'blur(1.1px)';
    ctx.drawImage(this.maskCnv, 0, 0);
    if (this.blur) ctx.filter = 'none';
    // Note: a faint warm tint behind the dark layer, so only the lit part picks it up; stronger near the body, like a lantern.
    ctx.globalCompositeOperation = 'destination-over';
    this.veil(ctx, view, sx, sy);
    const w = ctx.createRadialGradient(ex, ey, 0, ex, ey, reach * 1.05);
    w.addColorStop(0, 'rgba(255,190,110,0.13)');
    w.addColorStop(0.5, 'rgba(255,176,96,0.07)');
    w.addColorStop(1, 'rgba(255,160,80,0.02)');
    ctx.fillStyle = w;
    ctx.fillRect(0, 0, lw, lh);
    ctx.globalCompositeOperation = 'source-over';
    if (hurt > 0.02) {
      const v = ctx.createRadialGradient(ex, ey, (20 + (1 - hurt) * 120) * U, ex, ey, (150 + (1 - hurt) * 120) * U);
      v.addColorStop(0, 'rgba(60,8,6,0)');
      v.addColorStop(1, `rgba(60,8,6,${Math.min(0.9, hurt * 0.9)})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, lw, lh);
    }
    this.tex.refresh();
  }

  // Note: one zone's light on the mask, drawn through wedges from wide to narrow; each wedge replaces what lies under it with a radial fade blended further from the zone around it, so the angular edge feathers. Wall stops are pushed into the wall so the wall top and the door stay visible.
  zone(m, view, i, ex, ey, sx, sy, hurt) {
    const z = view.zones[i];
    for (const w of featherWedges(z)) {
      const g = m.createRadialGradient(ex, ey, 0, ex, ey, z.range * LIGHT_PX);
      // Note: hurt dims the far end of the zone, which closes the tunnel.
      for (const [t, a] of zoneProfile(view.zones, i, w.q)) g.addColorStop(t, `rgba(255,255,255,${Math.max(0, a * (1 - hurt * 0.6 * t)).toFixed(3)})`);
      const pts = fieldFan(view.field, w.half, z.range, WALL_REVEAL);
      m.globalCompositeOperation = 'destination-out';
      m.fillStyle = '#000';
      this.poly(m, pts, sx, sy);
      m.fill();
      m.globalCompositeOperation = 'source-over';
      m.fillStyle = g;
      this.poly(m, pts, sx, sy);
      m.fill();
    }
  }

  // Note: item 497: blacks out every stretch the ground hides, one wedge slice per ray, in one path so overlapping slices dim once.
  shadeHidden(m, view, sx, sy) {
    const { eye, facing, rel, hidden } = view.field || {};
    if (!hidden || rel.length < 2) return;
    const w = ((rel[1] - rel[0]) / 2) * 1.1;
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = `rgba(0,0,0,${HIDDEN_DIM})`;
    m.beginPath();
    for (let i = 0; i < rel.length; i++) {
      const a = facing + rel[i];
      const c0 = Math.cos(a - w);
      const s0 = Math.sin(a - w);
      const c1 = Math.cos(a + w);
      const s1 = Math.sin(a + w);
      for (const [d0, d1] of hidden[i] || []) {
        this.addPoly(m, [[eye.x + c0 * d0, eye.y + s0 * d0], [eye.x + c0 * d1, eye.y + s0 * d1], [eye.x + c1 * d1, eye.y + s1 * d1], [eye.x + c1 * d0, eye.y + s1 * d0]], sx, sy);
      }
    }
    m.fill('nonzero');
    m.globalCompositeOperation = 'source-over';
  }

  // Note: a cool veil behind the dark layer over the flank ring only, softened by a blur, so colour drains from the corner of the eye while the middle stays warm.
  veil(ctx, view, sx, sy) {
    const zs = view.zones;
    if (zs.length < 2) return;
    const flank = zs[zs.length - 1];
    const mid = zs[zs.length - 2];
    ctx.beginPath();
    this.addPoly(ctx, fieldFan(view.field, flank.half, flank.range, WALL_REVEAL), sx, sy);
    this.addPoly(ctx, fieldFan(view.field, mid.half, flank.range, WALL_REVEAL), sx, sy);
    ctx.fillStyle = `rgba(${FLANK_RGB},${FLANK_VEIL})`;
    if (this.blur) ctx.filter = 'blur(2px)';
    ctx.fill('evenodd');
    if (this.blur) ctx.filter = 'none';
  }

  poly(ctx, points, sx, sy) {
    ctx.beginPath();
    this.addPoly(ctx, points, sx, sy);
  }

  addPoly(ctx, points, sx, sy) {
    if (!points || points.length < 3) return;
    ctx.moveTo((points[0][0] * TILE - sx) * K, (points[0][1] * TILE - sy) * K);
    for (let i = 1; i < points.length; i++) ctx.lineTo((points[i][0] * TILE - sx) * K, (points[i][1] * TILE - sy) * K);
    ctx.closePath();
  }

  destroy() {
    this.img.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}

export const inView = (view, x, y) => inPoly(view.cone, x, y) || inPoly(view.disc, x, y);

// Note: the stairwell windows of a view onto other floors; a view made before there were several keeps its one through patch.
export const throughsOf = (view) => view.throughs || (view.through ? [view.through] : []);

// Note: a point on floor f is in sight on the followed floor, or inside a stairwell window onto floor f.
export const inSight = (view, f, x, y) => (f === view.floor ? inView(view, x, y) : throughsOf(view).some((th) => f === th.floor && inPoly(th.cone, x, y)));
