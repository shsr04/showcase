// Note: world effects drawn over the floor: swinging doors and sashes, muzzle glow, dust, splinters, glass, blood, casings, the flight shade and the stairwell window.

import { VIEW_W, VIEW_H, TILE, SCALE } from './config.js';
import { C, hexNum } from './palette.js';
import { DS, WS } from './tiles.js';
import { stateAt } from './map.js';
import { makeTextureCanvas } from './draw.js';
import { inSight, throughsOf } from './lighting.js';
import { HIDE, cellKey, doorHorizontal, doorLeaf, windowPane } from './sprites.js';
import { leafRect, sashRect, hash01, breachFrame, flightFrame, stairsShade } from './anim.js';

const col = (i) => hexNum(i);
const MAX_PARTS = 260;
// Note: the stairwell window is drawn at this share of the view size and scaled up, like the dark overlay.
export const LOW = 0.5;
const GRAVITY = 70 * SCALE;
const BRASS_LIFE = 14;
const GLOW_KEY = 'fx:glow';
const ADD = () => (typeof Phaser !== 'undefined' && Phaser.BlendModes ? Phaser.BlendModes.ADD : 1);

// Note: a soft round glow, made once; the muzzle flashes wear it with additive blending.
function ensureGlow(scene) {
  if (scene.textures.exists(GLOW_KEY)) return;
  const n = 64;
  const cnv = makeTextureCanvas(n, n);
  const ctx = cnv.getContext('2d');
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  scene.textures.addCanvas(GLOW_KEY, cnv);
}

// Note: the moving door leaf wears the closed leaf painted once per direction and lock state, squashed to fake the swing.
function ensureLeaf(scene, hor, locked) {
  const key = `leaf:${hor ? 'h' : 'v'}:${locked ? 1 : 0}`;
  if (scene.textures.exists(key)) return key;
  const cnv = makeTextureCanvas(TILE, TILE);
  doorLeaf(cnv.getContext('2d'), 0, 0, hor, locked);
  scene.textures.addCanvas(key, cnv);
  return key;
}

// Note: the sash glass is painted at half-unit heights so the slide looks smooth without a texture per frame.
function ensurePane(scene, hor, bolted, h) {
  const q = Math.round(h * 2) / 2;
  const key = `pane:${hor ? 'h' : 'v'}:${bolted ? 1 : 0}:${q}`;
  if (scene.textures.exists(key)) return key;
  const cnv = makeTextureCanvas(TILE, TILE);
  windowPane(cnv.getContext('2d'), 0, 0, hor, bolted, q);
  scene.textures.addCanvas(key, cnv);
  return key;
}

const MUZZLE = { winchester73: 1.15 };

export class Effects {
  constructor(scene, depths) {
    this.scene = scene;
    this.depths = depths;
    this.bits = scene.add.graphics().setDepth(depths.FLASH - 1);
    this.flash = scene.add.graphics().setDepth(depths.FLASH);
    this.shade = scene.add.graphics().setScrollFactor(0).setDepth(depths.SIGHT + 1);
    ensureGlow(scene);
    this.glows = [];
    for (let i = 0; i < 4; i++) {
      this.glows.push(scene.add.image(0, 0, GLOW_KEY).setDepth(depths.FLASH - 0.5).setBlendMode(ADD()).setVisible(false));
    }
    this.flashes = [];
    this.cells = new Map();
    this.parts = [];
    this.delayed = [];
    this.n = 0;
    this.shadeNow = 0;
    this.lastT = -1;
    this.throughKey = 'fx:through';
    this.tw = Math.ceil(VIEW_W * LOW);
    this.th = Math.ceil(VIEW_H * LOW);
    if (scene.textures.exists(this.throughKey)) scene.textures.remove(this.throughKey);
    this.throughTex = scene.textures.createCanvas(this.throughKey, this.tw, this.th);
    this.throughCtx = this.throughTex.getContext();
    this.throughImg = scene.add.image(0, 0, this.throughKey).setOrigin(0, 0).setScrollFactor(0).setDepth(1.5).setDisplaySize(VIEW_W, VIEW_H).setVisible(false);
  }

  rnd() {
    this.n++;
    return hash01(this.n, 91);
  }

  // Note: o is a recipe in art units (one unit is SCALE pixels): speeds in units per second, sizes in units, life in seconds.
  burst(x, y, f, count, o) {
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = o.dir !== undefined ? o.dir + (this.rnd() - 0.5) * (o.spread ?? 1) : this.rnd() * Math.PI * 2;
      const v = (o.min + this.rnd() * (o.max - o.min)) * SCALE;
      const life = o.life[0] + this.rnd() * (o.life[1] - o.life[0]);
      const lift = o.lift ? o.lift * (0.6 + this.rnd() * 0.8) * SCALE : 0;
      this.parts.push({
        x: x + (o.jit ? (this.rnd() - 0.5) * o.jit * SCALE : 0), y: y + (o.jit ? (this.rnd() - 0.5) * o.jit * SCALE : 0), f, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, drag: o.drag ?? 3,
        c: o.cols[Math.floor(this.rnd() * o.cols.length)], s: (o.size[0] + this.rnd() * (o.size[1] - o.size[0])) * SCALE, grow: (o.grow || 0) * SCALE,
        kind: o.kind || 'dust', rot: this.rnd() * Math.PI * 2, spin: (this.rnd() - 0.5) * (o.spin ?? 0), z: o.z ? o.z * SCALE : 0, vz: lift, g: lift ? GRAVITY : 0, bounce: o.bounce ?? 0, hold: o.hold || 0,
      });
    }
  }

  // Note: a spent shell flung out sideways of the shooter, which bounces once and then lies on the floor for a while.
  casing(a, f, delay = 0) {
    const side = a.facing + Math.PI / 2;
    const at = { x: a.x * TILE + Math.cos(a.facing) * 8 * SCALE, y: a.y * TILE + Math.sin(a.facing) * 8 * SCALE };
    const spawn = () => this.burst(at.x, at.y, f, 1, { dir: side, spread: 0.7, min: 26, max: 44, life: [BRASS_LIFE, BRASS_LIFE], drag: 3.2, cols: [C.GOLD, C.GOLD_L, C.GOLD], size: [1.4, 1.8], kind: 'brass', lift: 34, z: 7, bounce: 1, spin: 22, hold: 1.5 });
    if (delay > 0) this.delayed.push({ t: delay, fn: spawn });
    else spawn();
  }

  // Note: shots leave smoke and a muzzle flash, hits a puff of blood, bullets that stop make dust, splinters, sparks or glass by what they hit.
  consume(events, sim) {
    for (const e of events) {
      const a = e.actorId != null ? sim.byId(e.actorId) : null;
      if (e.type === 'shot' && a) {
        const rifle = e.weaponId === 'winchester73';
        const reach = MUZZLE[e.weaponId] || 0.85;
        const mx = (e.x + Math.cos(a.facing) * reach) * TILE;
        const my = (e.y + Math.sin(a.facing) * reach) * TILE;
        this.flashes.push({ x: mx, y: my, f: e.floor, t: 0.09, max: 0.09, dir: a.facing, rifle, seed: this.n++ });
        this.burst(mx, my, e.floor, rifle ? 6 : 4, { dir: a.facing, spread: 0.9, min: 5, max: 22, life: [0.5, 1.0], drag: 2.2, cols: [C.STONE_L, C.BONE, C.STONE], size: [2, 3.4], grow: 3.2, kind: 'dust' });
        this.burst(mx, my, e.floor, 3, { dir: a.facing, spread: 0.5, min: 60, max: 130, life: [0.08, 0.16], drag: 6, cols: [C.GOLD_L, C.BONE], size: [0.6, 1], kind: 'spark' });
        if (rifle) this.casing(a, e.floor, 0.16);
      } else if (e.type === 'reload' && e.stage === 'eject' && a && a.weapons[a.cur] && a.weapons[a.cur].id !== 'winchester73') {
        const n = 3 + Math.floor(this.rnd() * 3);
        for (let i = 0; i < n; i++) this.casing(a, a.floor, i * 0.11);
      } else if (e.type === 'hit' && a) {
        const o = e.ownerId != null ? sim.byId(e.ownerId) : null;
        const dir = o ? Math.atan2(a.y - o.y, a.x - o.x) : undefined;
        const n = e.died ? 9 : 5;
        this.burst(a.x * TILE, a.y * TILE, a.floor, n, { dir, spread: 1.5, min: 14, max: 52, life: [0.22, 0.5], drag: 4, cols: [C.RED, C.RED_D, C.RED_L], size: [0.7, 1.6], kind: 'blood' });
        this.burst(a.x * TILE, a.y * TILE, a.floor, 2, { dir, spread: 1.8, min: 4, max: 14, life: [0.35, 0.6], drag: 3, cols: [C.RED_D], size: [2.4, 3.4], grow: 2.6, kind: 'dust' });
      } else if (e.type === 'impact') this.impact(e);
      else if (e.type === 'glass') this.burst(e.x * TILE, e.y * TILE, e.floor, 14, { min: 20, max: 76, life: [0.6, 1.1], drag: 2.2, cols: [C.GLASS_L, C.GLASS, C.BONE], size: [1.2, 2.4], kind: 'glass', spin: 16, lift: 14, bounce: 1 });
    }
  }

  // Note: what a bullet kicks up depends on the material it struck.
  impact(e) {
    const x = e.x * TILE;
    const y = e.y * TILE;
    const m = e.material;
    const big = e.stopped ? 1 : 0.6;
    if (m === 'iron') {
      this.burst(x, y, e.floor, 5, { min: 40, max: 110, life: [0.1, 0.22], drag: 5, cols: [C.GOLD_L, C.BONE, C.GOLD], size: [0.6, 1], kind: 'spark' });
      this.burst(x, y, e.floor, 2, { min: 3, max: 10, life: [0.3, 0.5], drag: 3, cols: [C.STONE], size: [1.6, 2.6], grow: 2, kind: 'dust' });
    } else if (m === 'wood' || m === 'plank' || m === 'door' || m === 'frame' || m === 'fence' || m === 'barrel' || m === 'heavy') {
      this.burst(x, y, e.floor, Math.round(5 * big) + 1, { min: 14, max: 50, life: [0.3, 0.6], drag: 4, cols: [C.WOOD_L, C.PLANK, C.WOOD], size: [1.4, 2.8], kind: 'chip', spin: 20 });
      this.burst(x, y, e.floor, 3, { min: 4, max: 16, life: [0.4, 0.8], drag: 3, cols: [C.SAND_L, C.STONE_L], size: [1.8, 3], grow: 3, kind: 'dust' });
    } else if (m === 'adobe') {
      this.burst(x, y, e.floor, Math.round(4 * big) + 1, { min: 8, max: 34, life: [0.3, 0.6], drag: 4, cols: [C.ADOBE_L, C.ADOBE, C.SAND_L], size: [1, 2], kind: 'chip', spin: 12 });
      this.burst(x, y, e.floor, 4, { min: 4, max: 18, life: [0.5, 1], drag: 2.6, cols: [C.SAND_L, C.ADOBE_L, C.PLASTER], size: [2, 3.6], grow: 3.4, kind: 'dust' });
    } else if (m === 'glass') {
      this.burst(x, y, e.floor, 5, { min: 14, max: 44, life: [0.4, 0.8], drag: 3, cols: [C.GLASS_L, C.BONE], size: [0.8, 1.6], kind: 'glass', spin: 14 });
    } else {
      this.burst(x, y, e.floor, 5, { min: 6, max: 26, life: [0.45, 0.9], drag: 2.6, cols: [C.SAND_L, C.SAND, C.SAND_D], size: [1.8, 3.4], grow: 3, kind: 'dust' });
    }
  }

  repaint(f, x, y) {
    this.scene.repaintCell(f, x, y);
  }

  // Note: finds every door or window being worked on, hides its painted leaf and draws the moving one here.
  tracking(sim, view) {
    const live = new Map();
    for (const a of sim.actors) {
      const act = a.action;
      if (!act || (act.type !== 'door' && act.type !== 'window') || act.op === 'climb' || a.status !== 'ok') continue;
      live.set(cellKey(a.floor, act.x, act.y), { f: a.floor, x: act.x, y: act.y, act, type: act.type });
    }
    for (const [k, c] of live) {
      if (!this.cells.has(k)) {
        HIDE.add(k);
        this.repaint(c.f, c.x, c.y);
        const img = this.scene.add.image(0, 0, GLOW_KEY).setOrigin(0, 0).setDepth(this.depths.BODY + 0.5);
        this.cells.set(k, { ...c, thud: c.act.thud ?? 0, img });
      } else Object.assign(this.cells.get(k), { act: c.act });
    }
    for (const [k, c] of this.cells) {
      if (live.has(k)) continue;
      HIDE.delete(k);
      this.repaint(c.f, c.x, c.y);
      c.img.destroy();
      this.cells.delete(k);
      this.finish(sim, c);
    }
  }

  // Note: a forced door or window that is now broken bursts into splinters or glass.
  finish(sim, c) {
    const st = stateAt(sim.map, c.f, c.x, c.y);
    const cx = (c.x + 0.5) * TILE;
    const cy = (c.y + 0.5) * TILE;
    if (c.act.op !== 'force') return;
    if (c.type === 'door' && st === DS.BROKEN) {
      this.burst(cx, cy, c.f, 16, { min: 30, max: 95, life: [0.5, 0.9], drag: 2.5, cols: [C.WOOD, C.WOOD_D, C.PLANK, C.WOOD_L], size: [1.6, 3.6], kind: 'chip', spin: 18, jit: 10 });
      this.burst(cx, cy, c.f, 6, { min: 6, max: 24, life: [0.6, 1.1], drag: 2.4, cols: [C.SAND_L, C.STONE_L, C.PLASTER], size: [3, 5], grow: 4, kind: 'dust', jit: 12 });
    } else if (c.type === 'window' && st === WS.BROKEN) {
      this.burst(cx, cy, c.f, 20, { min: 25, max: 80, life: [0.7, 1.2], drag: 2.2, cols: [C.GLASS_L, C.GLASS, C.BONE], size: [1.2, 2.8], kind: 'glass', spin: 16, lift: 16, bounce: 1, jit: 10 });
    }
  }

  drawLeaf(sim, view) {
    for (const c of this.cells.values()) {
      const img = c.img;
      if (c.f !== view.floor) {
        img.setVisible(false);
        continue;
      }
      const act = c.act;
      const ox = c.x * TILE;
      const oy = c.y * TILE;
      const hor = doorHorizontal(sim.map, c.f, c.x, c.y);
      const force = act.op === 'force';
      const b = force ? breachFrame(act.thud ?? 0.9) : null;
      const shake = b ? Math.sin(sim.time * 90) * 1.6 * b.shake : 0;
      if (c.type === 'door') {
        const p = act.op === 'open' ? act.t / act.dur : act.op === 'close' ? 1 - act.t / act.dur : 0;
        const r = leafRect(p, shake);
        const locked = force || stateAt(sim.map, c.f, c.x, c.y) === DS.LOCKED;
        img.setTexture(ensureLeaf(this.scene, hor, locked));
        const along = r.a1 * SCALE;
        const across = (r.b1 - r.b0) * SCALE;
        img.setPosition(ox + (hor ? 0 : r.b0 * SCALE), oy + (hor ? r.b0 * SCALE : 0)).setDisplaySize(hor ? along : across, hor ? across : along);
      } else {
        const p = act.op === 'open' ? act.t / act.dur : 0;
        const r = sashRect(p, 0);
        img.setTexture(ensurePane(this.scene, hor, force, r.glassH));
        img.setPosition(ox + (hor ? 0 : shake * SCALE), oy + (hor ? shake * SCALE : 0)).setDisplaySize(TILE, TILE);
      }
      img.setVisible(true);
      // Note: every thud throws a little dust and wood off the door.
      if (force) {
        const prev = c.thud;
        c.thud = act.thud ?? 0.9;
        if (c.thud > prev + 0.3) this.burst((c.x + 0.5) * TILE, (c.y + 0.5) * TILE, c.f, 6, { min: 12, max: 38, life: [0.3, 0.6], drag: 4, cols: [C.SAND_L, C.WOOD_L, C.PLANK, C.STONE], size: [1.2, 2.6], kind: 'chip', spin: 14, jit: 10 });
      }
    }
  }

  // Note: a muzzle flash is a bright star of tongues and a glow, gone in a few frames.
  drawFlashes(dt, view, paused) {
    const g = this.flash;
    g.clear();
    let gi = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      if (!paused) fl.t -= dt;
      if (fl.t <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      if (!inSight(view, fl.f, fl.x / TILE, fl.y / TILE)) continue;
      const k = fl.t / fl.max;
      const len = (fl.rifle ? 9 : 6.5) * SCALE * (0.6 + 0.4 * k);
      const w = (fl.rifle ? 2.2 : 1.8) * SCALE;
      // Note: three tongues along the barrel and two short ones to the sides.
      const tongues = [[0, 1, 1], [0.32, 0.55, 0.9], [-0.32, 0.55, 0.9], [1.4, 0.28, 0.7], [-1.4, 0.28, 0.7]];
      for (const [da, s, al] of tongues) {
        const ang = fl.dir + da + (hash01(fl.seed, 3) - 0.5) * 0.2;
        const tipx = fl.x + Math.cos(ang) * len * s;
        const tipy = fl.y + Math.sin(ang) * len * s;
        const nx = -Math.sin(ang) * w * s * 0.5;
        const ny = Math.cos(ang) * w * s * 0.5;
        g.fillStyle(0xffa23a, 0.85 * al * k);
        g.fillTriangle(fl.x + nx, fl.y + ny, fl.x - nx, fl.y - ny, tipx, tipy);
        g.fillStyle(0xfff3c4, al * k);
        g.fillTriangle(fl.x + nx * 0.45, fl.y + ny * 0.45, fl.x - nx * 0.45, fl.y - ny * 0.45, fl.x + (tipx - fl.x) * 0.7, fl.y + (tipy - fl.y) * 0.7);
      }
      g.fillStyle(0xffffff, 0.9 * k);
      g.fillCircle(fl.x, fl.y, 1.3 * SCALE);
      if (gi < this.glows.length) {
        const gl = this.glows[gi++];
        const size = (fl.rifle ? 30 : 22) * SCALE * (0.7 + 0.3 * k);
        gl.setPosition(fl.x, fl.y).setDisplaySize(size, size).setTint(0xffb347).setAlpha(0.8 * k).setVisible(true);
      }
    }
    for (; gi < this.glows.length; gi++) this.glows[gi].setVisible(false);
  }

  drawBits(dt, view, paused) {
    const g = this.bits;
    g.clear();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (!paused) {
        p.life -= dt;
        if (p.life <= 0) {
          this.parts.splice(i, 1);
          continue;
        }
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.g) {
          p.z += p.vz * dt;
          p.vz -= p.g * dt;
          if (p.z <= 0) {
            p.z = 0;
            if (p.bounce > 0) {
              p.bounce--;
              p.vz = -p.vz * 0.38;
              p.vx *= 0.5;
              p.vy *= 0.5;
              p.spin *= 0.5;
            } else {
              p.vz = 0;
              p.g = 0;
              p.vx = 0;
              p.vy = 0;
              p.spin = 0;
            }
          }
        }
      }
      if (p.f !== view.floor) continue;
      this.drawBit(g, p);
    }
  }

  drawBit(g, p) {
    const c = col(p.c);
    const x = p.x;
    const y = p.y - p.z;
    const a = p.kind === 'brass' ? Math.min(1, p.life / 1.5) : Math.min(1, (p.life / p.max) * 1.6);
    const s = p.s + p.grow * (1 - p.life / p.max);
    if (p.kind === 'dust') {
      g.fillStyle(c, a * 0.3);
      g.fillCircle(x, y, s * 0.55);
      g.fillStyle(c, a * 0.5);
      g.fillCircle(x - s * 0.08, y - s * 0.08, s * 0.34);
    } else if (p.kind === 'chip') {
      const dx = (Math.cos(p.rot) * s) / 2;
      const dy = (Math.sin(p.rot) * s) / 2;
      g.lineStyle(Math.max(1, s * 0.36), c, a);
      g.lineBetween(x - dx, y - dy, x + dx, y + dy);
    } else if (p.kind === 'glass') {
      const r = s * 0.7;
      g.fillStyle(c, a * 0.85);
      g.fillTriangle(x + Math.cos(p.rot) * r, y + Math.sin(p.rot) * r, x + Math.cos(p.rot + 2.3) * r * 0.7, y + Math.sin(p.rot + 2.3) * r * 0.7, x + Math.cos(p.rot + 4.0) * r * 0.9, y + Math.sin(p.rot + 4.0) * r * 0.9);
      if (Math.sin(p.rot * 3) > 0.6) {
        g.fillStyle(0xffffff, a * 0.9);
        g.fillRect(Math.round(x), Math.round(y), Math.max(1, SCALE * 0.6), Math.max(1, SCALE * 0.6));
      }
    } else if (p.kind === 'blood') {
      g.lineStyle(Math.max(1, s * 0.7), c, a * 0.5);
      g.lineBetween(x, y, x - p.vx * 0.03, y - p.vy * 0.03);
      g.fillStyle(c, a);
      g.fillCircle(x, y, Math.max(1, s * 0.5));
    } else if (p.kind === 'spark') {
      g.lineStyle(Math.max(1, s * 0.8), c, a);
      g.lineBetween(x, y, x - p.vx * 0.035, y - p.vy * 0.035);
    } else if (p.kind === 'brass') {
      const dx = (Math.cos(p.rot) * s) / 2;
      const dy = (Math.sin(p.rot) * s) / 2;
      g.lineStyle(Math.max(1, s * 0.62), 0x2a1a0c, a * 0.5);
      g.lineBetween(x - dx + SCALE * 0.4, y - dy + SCALE * 0.6, x + dx + SCALE * 0.4, y + dy + SCALE * 0.6);
      g.lineStyle(Math.max(1, s * 0.5), c, a);
      g.lineBetween(x - dx, y - dy, x + dx, y + dy);
      g.lineStyle(Math.max(1, s * 0.16), 0xffefa0, a);
      g.lineBetween(x - dx, y - dy - s * 0.12, x + dx, y + dy - s * 0.12);
    }
  }

  // Note: the picture dips toward black for a moment while the followed character is on the flight, so the floor change does not pop.
  drawShade(follow, dt) {
    const target = follow && follow.elev ? stairsShade(flightFrame(follow).p) : 0;
    this.shadeNow += (target - this.shadeNow) * Math.min(1, dt * 14);
    const g = this.shade;
    g.clear();
    if (this.shadeNow > 0.01) {
      g.fillStyle(0x000000, this.shadeNow);
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  // Note: view.throughs from the sim ([{ floor, cone }], one per stairwell seen through); absent most of the time. They are drawn small and scaled up.
  drawThrough(view, sx, sy) {
    const sc = this.scene;
    const list = throughsOf(view).filter((th) => th.cone && th.cone.length >= 3 && sc.floorLayers[th.floor]);
    if (!list.length) {
      this.throughImg.setVisible(false);
      return;
    }
    const ctx = this.throughCtx;
    ctx.clearRect(0, 0, this.tw, this.th);
    for (const th of list) {
      ctx.save();
      ctx.beginPath();
      th.cone.forEach(([x, y], i) => (i ? ctx.lineTo((x * TILE - sx) * LOW, (y * TILE - sy) * LOW) : ctx.moveTo((x * TILE - sx) * LOW, (y * TILE - sy) * LOW)));
      ctx.closePath();
      ctx.clip();
      sc.floorLayers[th.floor].blit(ctx, sx, sy, VIEW_W, VIEW_H, LOW);
      ctx.fillStyle = 'rgba(10,8,6,0.4)';
      ctx.fillRect(0, 0, this.tw, this.th);
      ctx.restore();
    }
    this.throughTex.refresh();
    this.throughImg.setVisible(true);
  }

  // Note: called once per frame after the camera is placed; dt is real seconds and does not run while paused.
  update(sim, follow, view, dt, sx, sy, paused) {
    if (!paused && this.delayed.length) {
      for (let i = this.delayed.length - 1; i >= 0; i--) {
        const d = this.delayed[i];
        d.t -= dt;
        if (d.t <= 0) {
          this.delayed.splice(i, 1);
          d.fn();
        }
      }
    }
    this.tracking(sim, view);
    this.drawLeaf(sim, view);
    this.drawFlashes(dt, view, paused);
    this.drawBits(dt, view, paused);
    this.drawShade(follow, dt);
    this.drawThrough(view, sx, sy);
  }

  destroy() {
    for (const [k, c] of this.cells) {
      HIDE.delete(k);
      c.img.destroy();
    }
    this.cells.clear();
    this.bits.destroy();
    this.flash.destroy();
    this.shade.destroy();
    for (const g of this.glows) g.destroy();
    this.throughImg.destroy();
    if (this.scene.textures.exists(this.throughKey)) this.scene.textures.remove(this.throughKey);
  }
}
