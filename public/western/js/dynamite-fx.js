// Note: item 499: how dynamite looks: the stick in hand and in flight with its shadow, the spitting fuse, the fireball, the shock ring, debris, a smoke cloud that hangs, the camera jolt and a scorch mark.

import { VIEW_W, VIEW_H, TILE, SCALE } from './config.js';
import { clamp } from './rand.js';
import { inSight } from './lighting.js';
import { chargesOf, blastStage } from './dynamite.js';
import { BLAST_PH } from './anim.js';
import { bundleTip } from './people.js';

const GLOW_KEY = 'fx:glow';
const ADD = () => (typeof Phaser !== 'undefined' && Phaser.BlendModes ? Phaser.BlendModes.ADD : 1);
const MAX = 520;
// Note: the stick is drawn half again its true 20 cm so it reads at play scale.
const STICK = 0.28;
const PAPER = 0xb3271e;
const PAPER_D = 0x6e1611;
const FUSE = 0x2a2219;
const SMOKE = [0x5b544c, 0x6d655b, 0x47413b, 0x80776b];
const FIRE = [0xfff2c0, 0xffc04d, 0xff8a2a, 0xd9461c];
const DEBRIS = [0x8a6a44, 0x6b5338, 0xb08d62, 0x4a3b2a];
const MAT_COLS = { plank: [0x9b7a4e, 0xb89463, 0x6e5434], frame: [0x8a6a44, 0xa98457, 0x5b452c], door: [0x7a5a36, 0x9b7a4e, 0x4a3b2a], wood: [0x8a6a44, 0xb08d62, 0x6b5338], heavy: [0x6b5338, 0x4a3b2a, 0x8a6a44], iron: [0x4a4a4a, 0x6a6a6a, 0x2a2a2a], fence: [0xb8a27e, 0x8a6a44], plant: [0x5b6b3a, 0x7a8a4e, 0x3e4a28], barrel: [0x7a5a36, 0x4a4a4a], hay: [0xd9c27a, 0xb8a050] };

let seq = 0;
const rnd = () => {
  seq = (seq * 1664525 + 1013904223) >>> 0;
  return seq / 4294967296;
};

// Note: the scorch a blast leaves on the floor, in decal units (16 per metre), with soot thrown out in streaks.
export const scorchReach = (d) => (d.r || 0.9) * 16 * 2.2 + 2;
export function paintScorch(ctx, d) {
  const cx = d.x * 16;
  const cy = d.y * 16;
  const r = (d.r || 0.9) * 16;
  const h = (k) => {
    const v = Math.sin(d.x * 127.1 + d.y * 311.7 + k * 74.7) * 43758.5453;
    return v - Math.floor(v);
  };
  ctx.save();
  if (ctx.createRadialGradient && ctx.arc) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.5);
    g.addColorStop(0, 'rgba(14,10,8,0.85)');
    g.addColorStop(0.45, 'rgba(26,20,16,0.6)');
    g.addColorStop(1, 'rgba(40,32,26,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,12,0.45)';
    for (let i = 0; i < 14; i++) {
      const a = h(i) * Math.PI * 2;
      const len = r * (1.2 + h(i + 20) * 0.9);
      ctx.lineWidth = 0.6 + h(i + 40) * 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
  } else if (ctx.fillRect) {
    ctx.fillStyle = 'rgba(20,15,12,0.7)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

// Note: the rubble of what a blast blew away: broken boards, splinters and plaster dust strewn on the floor, in decal units.
export const rubbleReach = (d) => (d.r || 0.6) * 16 * 1.8 + 2;
export function paintRubble(ctx, d) {
  const cx = d.x * 16;
  const cy = d.y * 16;
  const r = (d.r || 0.6) * 16;
  const h = (k) => {
    const v = Math.sin(d.x * 91.3 + d.y * 217.9 + k * 37.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const tint = d.mat === 'plant' ? ['rgba(70,80,40,0.8)', 'rgba(110,120,70,0.7)'] : d.mat === 'iron' ? ['rgba(60,60,60,0.85)', 'rgba(90,90,90,0.7)'] : ['rgba(96,70,40,0.85)', 'rgba(150,118,76,0.8)'];
  ctx.save();
  if (ctx.arc) {
    ctx.fillStyle = 'rgba(190,176,150,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = h(i) * Math.PI * 2;
      const at = h(i + 10) * r;
      const len = 3 + h(i + 20) * 7;
      const ang = h(i + 30) * Math.PI;
      const x = cx + Math.cos(a) * at;
      const y = cy + Math.sin(a) * at;
      ctx.strokeStyle = tint[i % 2];
      ctx.lineWidth = 1.2 + h(i + 40) * 1.6;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * len / 2, y - Math.sin(ang) * len / 2);
      ctx.lineTo(x + Math.cos(ang) * len / 2, y + Math.sin(ang) * len / 2);
      ctx.stroke();
    }
  } else if (ctx.fillRect) {
    ctx.fillStyle = tint[0];
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

export class DynamiteFx {
  constructor(scene, depths) {
    this.scene = scene;
    this.depths = depths;
    this.low = scene.add.graphics().setDepth(depths.FLASH - 1.5);
    this.g = scene.add.graphics().setDepth(depths.PERSON + 5);
    this.smoke = scene.add.graphics().setDepth(depths.FLASH + 1);
    this.white = scene.add.graphics().setScrollFactor(0).setDepth(depths.SIGHT + 2);
    this.glows = [];
    for (let i = 0; i < 6; i++) this.glows.push(scene.add.image(0, 0, GLOW_KEY).setDepth(depths.FLASH + 0.5).setBlendMode(ADD()).setVisible(false));
    this.over = scene.add.image(0, 0, GLOW_KEY).setDepth(depths.SIGHT + 1).setBlendMode(ADD()).setVisible(false);
    this.parts = [];
    this.blasts = [];
    this.whiteK = 0;
  }

  add(p) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push(p);
  }

  // Note: o in metres and seconds; kinds are smoke, fire, debris, spark and dust.
  burst(x, y, f, n, o) {
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + (rnd() - 0.5) * (o.spread ?? 1) : rnd() * Math.PI * 2;
      const v = o.min + rnd() * (o.max - o.min);
      const life = o.life[0] + rnd() * (o.life[1] - o.life[0]);
      const at = (o.jit || 0) * rnd();
      this.add({
        x: x + Math.cos(a) * at, y: y + Math.sin(a) * at, f, vx: Math.cos(a) * v, vy: Math.sin(a) * v, z: o.z || 0, vz: o.lift ? o.lift * (0.4 + rnd()) : 0,
        life, max: life, drag: o.drag ?? 2, kind: o.kind, c: o.cols[Math.floor(rnd() * o.cols.length)], s: o.size[0] + rnd() * (o.size[1] - o.size[0]), grow: o.grow || 0,
        rot: rnd() * 6.28, spin: (rnd() - 0.5) * (o.spin || 0), rise: o.rise || 0,
      });
    }
  }

  consume(events, sim, follow) {
    for (const e of events) {
      if (e.type === 'blast') this.blast(e, sim, follow);
      else if (e.type === 'demolish') this.demolish(e);
      else if (e.type === 'dynamite' && e.stage === 'lit') {
        const a = sim.byId(e.actorId);
        if (a) this.burst(a.x, a.y, a.floor, 6, { min: 0.5, max: 2, life: [0.2, 0.4], drag: 3, kind: 'spark', cols: [0xffe9a8, 0xffb347], size: [0.02, 0.04] });
      } else if (e.type === 'dynamite' && (e.stage === 'bounce' || e.stage === 'land')) {
        this.burst(e.x, e.y, e.floor, 3, { min: 0.2, max: 0.8, life: [0.4, 0.8], drag: 3, kind: 'dust', cols: [0xc9b48f, 0xa8946f], size: [0.08, 0.14], grow: 0.15 });
      }
    }
  }

  blast(e, sim, follow) {
    const { x, y, floor: f } = e;
    this.blasts.push({ x, y, f, t: 0 });
    // Note: the fireball is brief; dust and smoke rise from the crater and hang, debris flies out and falls.
    this.burst(x, y, f, 26, { min: 2, max: 9, life: [0.12, 0.32], drag: 7, kind: 'fire', cols: FIRE, size: [0.25, 0.5], grow: 0.6 });
    this.burst(x, y, f, 30, { min: 0.6, max: 4.5, life: [4, 9], drag: 1.6, kind: 'smoke', cols: SMOKE, size: [0.35, 0.7], grow: 2.4, jit: 0.4, rise: 0.25 });
    this.burst(x, y, f, 34, { min: 4, max: 15, life: [0.6, 1.4], drag: 1.2, kind: 'debris', cols: DEBRIS, size: [0.03, 0.08], lift: 6, spin: 25 });
    this.burst(x, y, f, 24, { min: 10, max: 30, life: [0.1, 0.3], drag: 3, kind: 'spark', cols: [0xfff6d0, 0xffd27a, 0xffa23a], size: [0.03, 0.06] });
    this.burst(x, y, f, 22, { min: 5, max: 10, life: [0.5, 1.1], drag: 4, kind: 'dust', cols: [0xc9b48f, 0xb7a079, 0x9c8665], size: [0.15, 0.3], grow: 0.9 });
    const d = follow ? Math.hypot(follow.x - x, follow.y - y) + (follow.floor !== f ? 6 : 0) : 30;
    const k = clamp(1 - d / 28, 0, 1);
    if (k > 0) {
      this.scene.cameras.main.shake(250 + 600 * k, 0.003 + 0.022 * k * k);
      this.whiteK = Math.max(this.whiteK, clamp(1 - d / 7, 0, 1) * 0.85);
    }
  }

  // Note: a bundle in hand is part of the person's picture; only the spitting fuse is drawn here, at the fuse end of the pose.
  heldTip(sim, c) {
    const a = sim.byId(c.holder);
    const st = a && blastStage(a.blasting);
    const tip = st ? bundleTip(st.stage === 'strike' ? 2 : BLAST_PH[st.stage]) : null;
    if (!tip) return { x: c.x * TILE, y: c.y * TILE };
    const f = a.facing || 0;
    const fx = tip[0] / 32;
    const fy = tip[1] / 32;
    return { x: (a.x + Math.cos(f) * fx - Math.sin(f) * fy) * TILE, y: (a.y + Math.sin(f) * fx + Math.cos(f) * fy) * TILE };
  }

  spark(g, c, tx, ty) {
    const fl2 = 0.6 + rnd() * 0.6;
    g.fillStyle(0xffb347, 0.9);
    g.fillCircle(tx, ty, SCALE * 1.4 * fl2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(tx, ty, SCALE * 0.7 * fl2);
    if (rnd() < 0.6) this.burst(tx / TILE, ty / TILE, c.floor, 1, { min: 0.6, max: 2.2, life: [0.08, 0.22], drag: 2, kind: 'spark', cols: [0xffe9a8, 0xffb347, 0xffffff], size: [0.015, 0.03] });
    if (rnd() < 0.15) this.burst(tx / TILE, ty / TILE, c.floor, 1, { min: 0.05, max: 0.2, life: [0.6, 1.2], drag: 1, kind: 'smoke', cols: [0x9a948c], size: [0.04, 0.08], grow: 0.25, rise: 0.15 });
    return { x: tx, y: ty, flick: fl2 };
  }

  // Note: a wall, a door frame or a piece of furniture blown apart: boards, splinters or stones flung away from the blast, and a cloud of dust and plaster.
  demolish(e) {
    const cols = MAT_COLS[e.material] || DEBRIS;
    this.burst(e.x, e.y, e.floor, 14, { dir: e.dir, spread: 1.6, min: 3, max: 12, life: [0.7, 1.6], drag: 1.4, kind: 'debris', cols, size: [0.05, 0.16], lift: 4, spin: 18, jit: 0.4 });
    this.burst(e.x, e.y, e.floor, 6, { dir: e.dir, spread: 2.4, min: 0.4, max: 2.5, life: [3, 7], drag: 1.2, kind: 'smoke', cols: e.material === 'plant' ? [0x8a8a6a, 0x6d6d55] : [0xb8ab95, 0x9c8f7c, 0xc9bca6], size: [0.35, 0.6], grow: 1.6, jit: 0.5, rise: 0.12 });
  }

  drawStick(g, c, follow) {
    const px = c.x * TILE;
    const py = c.y * TILE;
    const lift = Math.max(0, c.z - (c.state === 'held' ? 1.1 : 0));
    const zpx = (c.state === 'held' ? 0 : c.z) * TILE * 0.35;
    // Note: a shadow on the ground under a stick in the air; the stick rides above it by its height.
    if (c.state !== 'held') {
      g.fillStyle(0x000000, clamp(0.35 - c.z * 0.05, 0.1, 0.35));
      g.fillEllipse(px, py, STICK * TILE * 0.8, STICK * TILE * 0.3);
    }
    const sx = px;
    const sy = py - zpx;
    const scale = 1 + lift * 0.06 + (c.state === 'held' ? 0 : c.z * 0.05);
    const L = STICK * TILE * scale;
    const W = Math.max(2, 0.04 * TILE * scale);
    const ca = Math.cos(c.angle);
    const sa = Math.sin(c.angle);
    const x0 = sx - (ca * L) / 2;
    const y0 = sy - (sa * L) / 2;
    const x1 = sx + (ca * L) / 2;
    const y1 = sy + (sa * L) / 2;
    // Note: the bundle: three sticks showing side by side, outlined, with a twine band.
    g.lineStyle(W * 3.4, PAPER_D, 1);
    g.lineBetween(x0, y0, x1, y1);
    for (const k of [-1.05, 0, 1.05]) {
      const ox = -sa * W * k;
      const oy = ca * W * k;
      g.lineStyle(W * 0.95, PAPER, 1);
      g.lineBetween(x0 + ox, y0 + oy, x1 + ox, y1 + oy);
    }
    g.lineStyle(Math.max(1, W * 0.6), 0xc8b48a, 1);
    g.lineBetween(sx - sa * W * 1.8, sy + ca * W * 1.8, sx + sa * W * 1.8, sy - ca * W * 1.8);
    // Note: the fuse burns down from its full length as it is spent.
    const left = clamp(c.fuse / 5, 0.1, 1);
    const fl = 0.1 * TILE * scale * left;
    const tx = x1 + ca * fl - sa * fl * 0.3;
    const ty = y1 + sa * fl + ca * fl * 0.3;
    g.lineStyle(Math.max(1, SCALE * 0.6), FUSE, 1);
    g.lineBetween(x1, y1, tx, ty);
    return this.spark(g, c, tx, ty);
  }

  update(sim, follow, view, dt, paused) {
    const g = this.g;
    const low = this.low;
    const sm = this.smoke;
    g.clear();
    low.clear();
    sm.clear();
    let gi = 0;
    for (const c of chargesOf(sim)) {
      const held = c.state === 'held';
      if (!(held && c.holder === follow?.id) && !inSight(view, c.floor, c.x, c.y)) continue;
      const hp = held ? this.heldTip(sim, c) : null;
      const tip = held ? this.spark(g, c, hp.x, hp.y) : this.drawStick(g, c, follow);
      if (gi < this.glows.length) {
        const size = 1.6 * TILE * tip.flick;
        this.glows[gi++].setPosition(tip.x, tip.y).setDisplaySize(size, size).setTint(0xffa040).setAlpha(0.55).setVisible(true);
      }
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (!paused) b.t += dt;
      if (b.t > 0.6) {
        this.blasts.splice(i, 1);
        continue;
      }
      const seen = inSight(view, b.f, b.x, b.y);
      const bx = b.x * TILE;
      const by = b.y * TILE;
      // Note: the shock front outruns everything, a pale ring that is gone in a tenth of a second.
      if (seen && b.t < 0.14) {
        const r = (b.t / 0.14) * 7 * TILE;
        low.lineStyle(Math.max(2, SCALE * 2.5), 0xfff3d8, 0.5 * (1 - b.t / 0.14));
        low.strokeCircle(bx, by, r);
      }
      if (seen && b.t < 0.25) {
        const k = 1 - b.t / 0.25;
        g.fillStyle(0xff7a1e, 0.75 * k);
        g.fillCircle(bx, by, (0.6 + b.t * 6) * TILE);
        g.fillStyle(0xffd27a, 0.9 * k);
        g.fillCircle(bx, by, (0.4 + b.t * 3.5) * TILE);
        g.fillStyle(0xffffff, k);
        g.fillCircle(bx, by, (0.25 + b.t * 1.5) * TILE);
      }
      // Note: the flash lights the rooms round it for a moment, even where the sheriff cannot see.
      const near = follow && follow.floor === b.f && Math.hypot(follow.x - b.x, follow.y - b.y) < 18;
      if ((seen || near) && b.t < 0.35 && gi < this.glows.length) {
        const k = 1 - b.t / 0.35;
        this.glows[gi++].setPosition(bx, by).setDisplaySize(14 * TILE, 14 * TILE).setTint(0xffc070).setAlpha(k).setVisible(true);
        this.over.setPosition(bx, by).setDisplaySize(10 * TILE * (0.6 + 0.4 * k), 10 * TILE * (0.6 + 0.4 * k)).setTint(0xffb050).setAlpha(0.6 * k * k).setVisible(true);
      }
    }
    if (!this.blasts.length) this.over.setVisible(false);
    for (; gi < this.glows.length; gi++) this.glows[gi].setVisible(false);
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
        p.y += p.vy * dt - p.rise * dt;
        p.rot += p.spin * dt;
        if (p.kind === 'debris') {
          p.z += p.vz * dt;
          p.vz -= 9.81 * dt;
          if (p.z <= 0) {
            p.z = 0;
            p.vz = -p.vz * 0.25;
            p.vx *= 0.4;
            p.vy *= 0.4;
            if (Math.abs(p.vz) < 0.5) p.vz = 0;
          }
        }
      }
      if (p.f !== view.floor || !inSight(view, p.f, p.x, p.y)) continue;
      const a = Math.min(1, (p.life / p.max) * (p.kind === 'smoke' ? 2.5 : 1.6));
      const s = (p.s + p.grow * (1 - p.life / p.max)) * TILE;
      const x = p.x * TILE;
      const y = (p.y - p.z * 0.35) * TILE;
      if (p.kind === 'smoke') {
        sm.fillStyle(p.c, 0.32 * a);
        sm.fillCircle(x, y, s);
        sm.fillStyle(p.c, 0.22 * a);
        sm.fillCircle(x - s * 0.2, y - s * 0.25, s * 0.7);
      } else if (p.kind === 'fire') {
        g.fillStyle(p.c, 0.85 * a);
        g.fillCircle(x, y, s);
      } else if (p.kind === 'dust') {
        low.fillStyle(p.c, 0.35 * a);
        low.fillCircle(x, y, s);
      } else if (p.kind === 'debris') {
        const dx = Math.cos(p.rot) * s;
        const dy = Math.sin(p.rot) * s;
        g.lineStyle(Math.max(1, s * 0.7), p.c, Math.min(1, a * 2));
        g.lineBetween(x - dx, y - dy, x + dx, y + dy);
      } else {
        g.lineStyle(Math.max(1, SCALE * 0.6), p.c, a);
        g.lineBetween(x, y, x - p.vx * 0.02 * TILE, y - p.vy * 0.02 * TILE);
      }
    }
    // Note: a blast close by whites out the picture for a moment.
    const w = this.white;
    w.clear();
    if (this.whiteK > 0.01) {
      w.fillStyle(0xfff6e0, this.whiteK);
      w.fillRect(0, 0, VIEW_W, VIEW_H);
      if (!paused) this.whiteK *= Math.exp(-dt * 6);
    } else this.whiteK = 0;
  }

  destroy() {
    for (const o of [this.low, this.g, this.smoke, this.white, this.over, ...this.glows]) o.destroy();
    this.parts = [];
    this.blasts = [];
  }
}
