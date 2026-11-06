// Note: road hazards: spike strips, caltrops, molotovs in flight and the fires they leave; no Phaser except the draw target.

import { C, hexNum } from './palette.js';

export const FIRE_R = 22;
const FIRE_LIFE = 4.5;
const BURN_TICK = 0.45;

function segDist(px, py, h) {
  const ux = Math.cos(h.a + Math.PI / 2);
  const uy = Math.sin(h.a + Math.PI / 2);
  const s = Math.max(-h.len / 2, Math.min(h.len / 2, (px - h.x) * ux + (py - h.y) * uy));
  return Math.hypot(px - (h.x + ux * s), py - (h.y + uy * s));
}

export class Hazards {
  constructor(g = null) {
    this.list = [];
    this.g = g;
    this.t = 0;
  }

  // Note: a strip lies across heading a, len pixels long; each body is caught once.
  spikes(x, y, a, len = 44, extra = {}) {
    const h = { kind: 'spikes', x, y, a, len, hits: {}, ...extra };
    this.list.push(h);
    return h;
  }

  caltrops(x, y, n, rand, spread = 34, extra = {}) {
    for (let i = 0; i < n; i++) this.list.push({ kind: 'caltrop', x: x + (rand() - 0.5) * spread * 2, y: y + (rand() - 0.5) * spread, ...extra });
  }

  // Note: the landing spot is marked for the whole flight so it can be dodged.
  molotov(x0, y0, x1, y1, dur = 1, extra = {}) {
    const h = { kind: 'molotov', x0, y0, x1, y1, x: x0, y: y0, z: 0, t: 0, dur, ...extra };
    this.list.push(h);
    return h;
  }

  fire(x, y, r = FIRE_R, life = FIRE_LIFE, extra = {}) {
    const h = { kind: 'fire', x, y, r, life, t: 0, tick: 0, ...extra };
    this.list.push(h);
    return h;
  }

  remove(pred) {
    this.list = this.list.filter((h) => !pred(h));
  }

  clear() {
    this.list = [];
    this.g?.clear();
  }

  // Note: bodies = [{key, faction, x, y, r}]; on(h, body, what) gets 'spike', 'caltrop', 'burn', 'splash' and 'land' (body null).
  step(dt, bodies, on) {
    this.t += dt;
    const keep = [];
    const born = [];
    const hit = (h, b) => !h.faction || h.faction !== b.faction;
    for (const h of this.list) {
      let alive = true;
      if (h.kind === 'molotov') {
        h.t += dt;
        const k = Math.min(1, h.t / h.dur);
        h.x = h.x0 + (h.x1 - h.x0) * k;
        h.y = h.y0 + (h.y1 - h.y0) * k;
        h.z = Math.sin(k * Math.PI) * 26;
        if (k >= 1) {
          alive = false;
          const f = { kind: 'fire', x: h.x1, y: h.y1, r: FIRE_R, life: FIRE_LIFE, t: 0, tick: BURN_TICK, faction: h.faction };
          born.push(f);
          on(f, null, 'land');
          for (const b of bodies) if (hit(h, b) && Math.hypot(b.x - f.x, b.y - f.y) < f.r + b.r) on(f, b, 'splash');
        }
      } else if (h.kind === 'fire') {
        h.t += dt;
        h.tick -= dt;
        if (h.t >= h.life) alive = false;
        else if (h.tick <= 0) {
          h.tick = BURN_TICK;
          for (const b of bodies) if (hit(h, b) && Math.hypot(b.x - h.x, b.y - h.y) < h.r + b.r * 0.5) on(h, b, 'burn');
        }
      } else if (h.kind === 'spikes') {
        for (const b of bodies) {
          if (h.hits[b.key] || !hit(h, b)) continue;
          if (Math.abs(b.y - h.y) < h.len && Math.abs(b.x - h.x) < h.len && segDist(b.x, b.y, h) < b.r * 0.8 + 3) {
            h.hits[b.key] = true;
            on(h, b, 'spike');
          }
        }
      } else if (h.kind === 'caltrop') {
        for (const b of bodies) {
          if (!hit(h, b) || Math.hypot(b.x - h.x, b.y - h.y) >= b.r * 0.8 + 2) continue;
          on(h, b, 'caltrop');
          alive = false;
          break;
        }
      }
      if (alive) keep.push(h);
    }
    this.list = keep.concat(born);
  }

  draw() {
    const g = this.g;
    if (!g) return;
    g.clear();
    for (const h of this.list) {
      if (h.kind === 'spikes') {
        const ux = Math.cos(h.a + Math.PI / 2);
        const uy = Math.sin(h.a + Math.PI / 2);
        for (let s = -h.len / 2; s <= h.len / 2; s += 4) {
          const x = h.x + ux * s;
          const y = h.y + uy * s;
          g.fillStyle(hexNum(C.SHADOW), 1);
          g.fillRect(x - 1.5, y - 0.5, 3, 3);
          g.fillStyle(hexNum(C.BONE), 1);
          g.fillRect(x - 1, y - 1, 2, 2);
        }
      } else if (h.kind === 'caltrop') {
        g.fillStyle(hexNum(C.SHADOW), 1);
        g.fillRect(h.x - 1.5, h.y - 1.5, 3, 3);
        g.fillStyle(hexNum(C.DUST), 1);
        g.fillRect(h.x - 0.5, h.y - 1.5, 1, 3);
        g.fillRect(h.x - 1.5, h.y - 0.5, 3, 1);
      } else if (h.kind === 'molotov') {
        const pulse = 0.35 + 0.25 * Math.sin(this.t * 14);
        g.lineStyle(1, hexNum(C.RED), pulse);
        g.strokeCircle(h.x1, h.y1, FIRE_R * 0.85);
        g.fillStyle(hexNum(C.SHADOW), 0.5);
        g.fillCircle(h.x, h.y, 2);
        g.fillStyle(hexNum(C.AMBER), 1);
        g.fillRect(h.x - 1, h.y - h.z - 2, 2, 3);
        g.fillStyle(hexNum(C.YELLOW), 1);
        g.fillRect(h.x - 0.5, h.y - h.z - 3, 1, 1);
      } else if (h.kind === 'fire') {
        const fade = Math.min(1, (h.life - h.t) / 0.8);
        const cols = [C.RUST_D, C.RUST, C.RUST_L, C.AMBER, C.YELLOW];
        for (let i = 0; i < cols.length; i++) {
          const f = 1 - i * 0.19;
          const wob = Math.sin(this.t * (11 + i * 3) + h.x * 0.1 + i) * 1.6;
          g.fillStyle(hexNum(cols[i]), (i === 0 ? 0.55 : 0.85) * fade);
          g.fillCircle(h.x + wob * 0.6, h.y - i * 1.2, Math.max(1, h.r * f * 0.82 + wob));
        }
      }
    }
  }

  destroy() {
    this.g?.destroy();
  }
}
