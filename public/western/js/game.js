// Note: GameScene draws one sim attempt: floor canvases, decals, people, tracers, the sight overlay and speech bubbles. No HUD text.

import { DynamiteFx, paintScorch, scorchReach, paintRubble, rubbleReach } from './dynamite-fx.js';
import { SCALE, VIEW_W, VIEW_H, TILE, MAP_W, MAP_H, HEIGHT } from './config.js';
import { clamp } from './rand.js';
import { Lighting, inSight } from './lighting.js';
import { FocusFx } from './focusfx.js';
import { speechCues } from './speech.js';
import { createBubbles } from './bubbles.js';
import { Animator } from './anim.js';
import { Effects } from './fx.js';
import { ChunkLayer } from './layers.js';
import { Items } from './items.js';
import { paintCell, paintDecal, decalReach, ensurePerson, personDesc, DENSE } from './sprites.js';
import { siteFloors } from './party.js';
import { AiOverlay } from './ai-overlay.js';
import { rimCrop } from './people.js';

const D = { FLOOR: 0, DECAL: 1, BODY: 5, PERSON: 10, TRACER: 20, FLASH: 22, SIGHT: 60, AI: 70 };
// Note: the camera leans toward the cursor by this share of the cursor's offset from the centre, at most LEAD_MAX pixels.
const LEAD = 0.22;
const LEAD_MAX = 48 * SCALE;
// Note: far aim shifts the view toward the pointer, keeping the sheriff in frame.
const FAR_LEAD = 1.1;
const FAR_LEAD_MAX = 10 * TILE;
// Note: outdoors the camera draws the world at two thirds, two screen pixels per art pixel at the default scale, so about 45 by 25 metres are in view.
export const OUTDOOR_ZOOM = 2 / 3;
// Note: a tracer's tail is at most this long, in metres.
const TRAIL = 2.6;

// Note: 0..1 sense of blood loss for the followed character; drives vignette, desaturation and sway.
export function hurtOf(a, time) {
  if (!a) return 0;
  let h = a.status === 'incapacitated' ? 0.8 : 0;
  if (a.deathAt != null) h = Math.max(h, 1 - clamp((a.deathAt - time) / 80, 0, 1));
  let bl = 0;
  for (const w of a.wounds || []) bl += w.old ? 0 : w.bleed > 0 ? 0.2 : 0.06;
  return clamp(Math.max(h, Math.min(0.7, bl)), 0, 1);
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'game' });
  }

  create(data) {
    // Note: Phaser auto-starts the first scene with no data; the real start comes from the briefing.
    this.idle = !data || !data.sim;
    if (this.idle) return;
    this.app = data.app;
    this.sim = data.sim;
    const map = this.sim.map;
    this.cam = this.cameras.main;
    this.camZoom = this.sim.house.kind === 'outdoor' ? OUTDOOR_ZOOM : 1;
    this.cam.setZoom(this.camZoom);
    this.floorLayers = [];
    this.decalLayers = [];
    // Note: an outdoor site has one floor to draw; the upper one is only drop, so it gets no layer and no stair view.
    this.floors = siteFloors(this.sim.house);
    for (let f = 0; f < this.floors; f++) {
      const floor = new ChunkLayer(this, `floor${f}`, D.FLOOR, false, map.W, map.H);
      floor.paintTiles(0, 0, map.W, map.H, (ctx, x0, y0, x1, y1) => {
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) paintCell(ctx, map, f, x, y);
      });
      floor.flush();
      this.floorLayers.push(floor);
      this.decalLayers.push(new ChunkLayer(this, `decal${f}`, D.DECAL, true, map.W, map.H));
    }
    this.people = new Map();
    this.trace = this.add.graphics().setDepth(D.TRACER);
    this.light = new Lighting(this, D.SIGHT, this.camZoom);
    // Note: the focus blur of careful aim (item 184) is a canvas of its own in front of the game canvas, under the bubbles.
    this.focusFx = new FocusFx(this.game, this.app.stage, { before: document.getElementById('bubbles') });
    this.bubbles = createBubbles(document.getElementById('bubbles'));
    this.anim = new Animator();
    this.fx = new Effects(this, D);
    this.dyn = new DynamiteFx(this, D);
    this.items = new Items(this, D.BODY - 0.5);
    this.aiView = new AiOverlay(this, D.AI);
    this.rev = map.rev;
    this.decalIdx = 0;
    this.hurt = 0;
    this.satShown = 1;
    this.finished = false;
    this.camReady = false;
    this.cx = 0;
    this.cy = 0;
    this.events.once('shutdown', () => this.cleanup());
  }

  cleanup() {
    for (const l of [...(this.floorLayers || []), ...(this.decalLayers || [])]) l.destroy();
    this.floorLayers = [];
    this.decalLayers = [];
    if (this.light) this.light.destroy();
    this.light = null;
    if (this.focusFx) this.focusFx.destroy();
    this.focusFx = null;
    if (this.bubbles) this.bubbles.clear();
    this.bubbles = null;
    if (this.fx) this.fx.destroy();
    this.fx = null;
    if (this.dyn) this.dyn.destroy();
    this.dyn = null;
    if (this.items) this.items.destroy();
    this.items = null;
    if (this.aiView) this.aiView.destroy();
    this.aiView = null;
    if (this.app && this.app.stage) this.app.stage.style.filter = '';
  }

  // Note: the cursor in world metres, using the scroll that was drawn last frame.
  aimWorld() {
    const m = this.app.input.mouse;
    const v = this.viewOrigin();
    const z = this.camZoom ?? 1;
    return { x: (m.x / z + v.x) / TILE, y: (m.y / z + v.y) / TILE };
  }

  // Note: the world pixel at the top left of the screen; the camera zooms about its centre, so with a zoom it lies off the scroll.
  viewOrigin() {
    const z = this.camZoom ?? 1;
    return { x: this.cam.scrollX + (VIEW_W / 2) * (1 - 1 / z), y: this.cam.scrollY + (VIEW_H / 2) * (1 - 1 / z) };
  }

  update(time, delta) {
    if (this.idle || !this.sim) return;
    const app = this.app;
    const sim = this.sim;
    const real = Math.min(delta / 1000, 0.1);
    if (!app.paused && !this.finished) {
      sim.step(real, app.input.snapshot(this.aimWorld()));
      const events = sim.drain();
      this.consume(events);
      const follow = sim.follow();
      for (const c of speechCues(events, follow, (id) => sim.byId(id)).slice(0, 3)) {
        this.bubbles.add(c, sim.time);
        if (app.audio) app.audio.talk(c, follow);
      }
      if (app.audio) app.audio.handle(events, sim.follow());
    }
    if (app.input.hit('KeyT')) this.aiView.toggle();
    app.input.endFrame();
    this.render(real);
    if (!this.finished && sim.outcome && sim.outcome.final) {
      this.finished = true;
      app.finish(sim);
    }
  }

  consume(events) {
    this.anim.consume(events, this.sim);
    this.fx.consume(events, this.sim);
    this.dyn.consume(events, this.sim, this.sim.follow());
  }

  render(dt) {
    const sim = this.sim;
    const map = sim.map;
    const follow = sim.follow();
    const view = sim.view();
    this.repaint(map);
    this.paintDecals();
    for (let f = 0; f < this.floors; f++) {
      this.floorLayers[f].show(f === view.floor);
      this.decalLayers[f].show(f === view.floor);
    }
    const hurtTarget = hurtOf(follow, sim.time);
    this.hurt += (hurtTarget - this.hurt) * Math.min(1, dt * 2);
    this.placeCamera(follow, dt);
    const { x: sx, y: sy } = this.viewOrigin();
    this.anim.track(sim);
    this.drawPeople(sim, follow, view);
    this.items.update(sim, view);
    this.drawTracers(sim, view);
    this.fx.update(sim, follow, view, dt, sx, sy, this.app.paused);
    this.dyn.update(sim, follow, view, dt, this.app.paused);
    this.aiView.update(sim, view);
    for (let f = 0; f < this.floors; f++) {
      this.floorLayers[f].flush();
      this.decalLayers[f].flush();
    }
    this.light.draw(view, sx, sy, this.hurt);
    this.focusFx.update(view, sx, sy, this.camZoom);
    this.bubbles.update(sim, follow, view, sx, sy, this.app.zoom, this.camZoom);
    if (this.app.audio) this.app.audio.update(this.hurt);
    const sat = Math.round((1 - this.hurt * 0.75) * 20) / 20;
    if (sat !== this.satShown && this.app.stage) {
      this.satShown = sat;
      this.app.stage.style.filter = sat >= 1 ? '' : `saturate(${sat}) contrast(${1 + this.hurt * 0.1})`;
    }
  }

  // Note: paints the tiles in [x0, x1) x [y0, y1) of one floor, whichever chunks they fall in.
  repaintTiles(f, x0, y0, x1, y1) {
    const map = this.sim.map;
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(map.W, x1);
    y1 = Math.min(map.H, y1);
    this.floorLayers[f].paintTiles(x0, y0, x1, y1, (ctx, cx0, cy0, cx1, cy1) => {
      for (let y = Math.max(y0, cy0); y < Math.min(y1, cy1); y++) for (let x = Math.max(x0, cx0); x < Math.min(x1, cx1); x++) paintCell(ctx, map, f, x, y);
    });
  }

  repaintCell(f, x, y) {
    this.repaintTiles(f, x, y, x + 1, y + 1);
  }

  // Note: only cells named in map.changes (and their neighbours) are repainted when a door or window changes.
  repaint(map) {
    if (map.rev === this.rev) return;
    this.rev = map.rev;
    const ch = map.changes ? map.changes.splice(0) : [];
    if (!ch.length) {
      for (let f = 0; f < this.floors; f++) this.repaintTiles(f, 0, 0, map.W, map.H);
      return;
    }
    for (const { f, x, y } of ch) if (f < this.floors) this.repaintTiles(f, x - 1, y - 1, x + 2, y + 2);
  }

  // Note: a blood spot is painted into every chunk its spatter can reach, once.
  paintDecals() {
    const list = this.sim.decals || [];
    if (list.length < this.decalIdx) {
      for (const l of this.decalLayers) l.clear();
      this.decalIdx = 0;
    }
    if (list.length === this.decalIdx) return;
    for (let i = this.decalIdx; i < list.length; i++) {
      const d = list[i];
      const reach = (d.kind === 'scorch' ? scorchReach(d) : d.kind === 'rubble' ? rubbleReach(d) : decalReach(d)) * SCALE;
      const cx = d.x * TILE;
      const cy = d.y * TILE;
      if (this.decalLayers[d.floor]) this.decalLayers[d.floor].paint(cx - reach, cy - reach, cx + reach, cy + reach, (ctx) => (d.kind === 'scorch' ? paintScorch(ctx, d) : d.kind === 'rubble' ? paintRubble(ctx, d) : paintDecal(ctx, d)));
    }
    this.decalIdx = list.length;
  }

  placeCamera(follow, dt) {
    const m = this.app.input.mouse;
    const far = this.sim.farAimActive() && follow === this.sim.sheriff;
    const lead = far ? FAR_LEAD : LEAD;
    const max = far ? FAR_LEAD_MAX : LEAD_MAX;
    // Note: the target is the world pixel at the screen's top left, from the view's size in the world; the scroll is set from it below.
    const z = this.camZoom ?? 1;
    const vw = VIEW_W / z;
    const vh = VIEW_H / z;
    const lx = clamp(((m.x - VIEW_W / 2) * lead) / z, -max / z, max / z);
    const ly = clamp(((m.y - VIEW_H / 2) * lead) / z, -max / z, max / z);
    const fit = (want, size, view) => (size <= view ? (size - view) / 2 : clamp(want, 0, size - view));
    const tx = fit(follow.x * TILE - vw / 2 + lx, this.sim.map.W * TILE, vw);
    const ty = fit(follow.y * TILE - vh / 2 + ly, this.sim.map.H * TILE, vh);
    if (!this.camReady) {
      this.cx = tx;
      this.cy = ty;
      this.camReady = true;
    } else {
      const k = Math.min(1, dt * 10);
      this.cx += (tx - this.cx) * k;
      this.cy += (ty - this.cy) * k;
    }
    // Note: blood loss makes the picture sway a little.
    const t = this.sim.time;
    const sway = this.hurt * 2.2 * SCALE;
    const back = { x: (VIEW_W / 2) * (1 - 1 / z), y: (VIEW_H / 2) * (1 - 1 / z) };
    this.cam.setScroll(Math.round(this.cx + Math.sin(t * 1.7) * sway - back.x), Math.round(this.cy + Math.cos(t * 2.3) * sway - back.y));
  }

  // Note: whoever carries or is lifting this body, if anyone.
  hostOf(sim, a) {
    if (a.carried) return sim.byId(a.carriedBy);
    return sim.actors.find((d) => d.action && d.action.type === 'pickup' && d.action.id === a.id) || null;
  }

  drawPeople(sim, follow, view) {
    const inUse = (key) => {
      for (const im of this.people.values()) if (im.texture && im.texture.key === key) return true;
      return false;
    };
    for (const a of sim.actors) {
      let img = this.people.get(a.id);
      // Note: sight decides, not the floor; across the stairwell the sim can answer true for the other floor. A body on a visible carrier is always shown.
      const host = a.carried || a.status !== 'ok' ? this.hostOf(sim, a) : null;
      const show = a === follow || sim.canSeeActor(follow, a) || (host && (host === follow || sim.canSeeActor(follow, host)));
      if (!show) {
        if (img) img.setVisible(false);
        continue;
      }
      const fr = this.anim.frame(a, sim, view.floor);
      // Note: a body slung over a carrier is drawn into the carrier's own picture.
      if (fr.hidden) {
        if (img) img.setVisible(false);
        continue;
      }
      const key = ensurePerson(this, personDesc(a, fr), inUse);
      if (!img) {
        img = this.add.image(0, 0, key).setScale(1 / DENSE);
        this.people.set(a.id, img);
      }
      if (img.texture.key !== key) img.setTexture(key);
      const lying = a.status !== 'ok' && !fr.state;
      // Note: the prone sheriff and a person on another floor draw above darkness, because the sight mask would hide them, without lighting the terrain round them.
      const crossFloor = a !== follow && (a.floor !== follow.floor || a.elev || follow.elev);
      // Note: item 497: a man seen over a rim while his ground is dark draws above the darkness, cut to what shows of him.
      const cut = !crossFloor && !lying && a !== follow && a.status === 'ok' ? sim.shownFrom(follow, a) : 0;
      const depth = crossFloor || cut > 0 || (a === follow && a.stance === 'prone' && a.status === 'ok') ? D.SIGHT + 1 : (lying ? D.BODY : D.PERSON) + a.y * 0.001;
      const crop = rimCrop(cut, HEIGHT[a.stance] || HEIGHT.stand, a.lean || 0);
      if (crop) img.setCrop(...crop);
      else if (img.isCropped) img.setCrop();
      img.setVisible(true).setPosition((fr.x ?? a.x) * TILE + fr.ox * SCALE, (fr.y ?? a.y) * TILE + fr.oy * SCALE).setRotation((a.facing || 0) + fr.rot).setScale(fr.scale / DENSE).setDepth(depth);
      img.setAlpha(a.climb ? 0.55 : fr.alpha);
    }
  }

  // Note: a bullet is a bright head with a tail that fades toward the shooter.
  drawTracers(sim, view) {
    const g = this.trace;
    g.clear();
    for (const b of sim.bullets || []) {
      // Note: item 499: blast debris flies unseen; its hits and impacts show.
      if (b.frag || !inSight(view, b.floor, b.x, b.y)) continue;
      const hx = b.x * TILE;
      const hy = b.y * TILE;
      let tx = (b.px ?? b.x) * TILE;
      let ty = (b.py ?? b.y) * TILE;
      const len = Math.hypot(hx - tx, hy - ty);
      const max = TRAIL * TILE;
      if (len > max) {
        tx = hx + ((tx - hx) * max) / len;
        ty = hy + ((ty - hy) * max) / len;
      }
      const N = 5;
      for (let i = 0; i < N; i++) {
        const u0 = i / N;
        const u1 = (i + 1) / N;
        g.lineStyle(Math.max(1, SCALE * (0.4 + 0.9 * u1)), 0xffe9a8, 0.05 + 0.5 * u1 * u1);
        g.lineBetween(tx + (hx - tx) * u0, ty + (hy - ty) * u0, tx + (hx - tx) * u1, ty + (hy - ty) * u1);
      }
      g.fillStyle(0xffb347, 0.3);
      g.fillCircle(hx, hy, 2.2 * SCALE);
      g.fillStyle(0xfff6d0, 1);
      g.fillCircle(hx, hy, 0.9 * SCALE);
    }
  }
}
