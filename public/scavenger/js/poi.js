// Note: station logs; finds unseen points of interest in view and keeps the collection per seed.

import { cellOf } from './plan.js';
import { dist } from './path.js';

const STORE = 'scavenger.logs.v1';
const KEEP = 240;
const DWELL = 0.22;
const CONE = 0.5;

function readAll() {
  try {
    const raw = localStorage.getItem(STORE);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch (e) {
    return {};
  }
}

function writeAll(all) {
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch (e) {
    // Note: storage can be blocked or full; the session keeps working without it.
  }
}

export class PoiTracker {
  constructor(world, seedStr) {
    this.world = world;
    this.seedStr = String(seedStr ?? world?.seedStr ?? '');
    // Note: a prefix keeps seeds like "constructor" or "__proto__" away from object built-ins.
    this.key = `seed:${this.seedStr}`;
    this.seen = new Set();
    this.entries = [];
    this.dwell = new Map();
    this.fwd = [0, 0, -1];
    this.hintAt = null;
    const stored = readAll()[this.key];
    for (const e of Array.isArray(stored) ? stored : []) {
      if (e && typeof e.id === 'string' && !this.seen.has(e.id)) {
        this.seen.add(e.id);
        this.entries.push({ id: e.id, title: String(e.title || ''), text: String(e.text || '') });
      }
    }
  }

  isSeen(id) {
    return this.seen.has(id);
  }

  save() {
    const all = readAll();
    all[this.key] = this.entries.slice(-KEEP);
    writeAll(all);
  }

  // Note: clear line of sight when the free-space field stays open along the way, ignoring the target's own item.
  visible(field, a, b) {
    if (!field) return true;
    const d = dist(a, b);
    if (d <= 1.2) return true;
    const steps = Math.max(2, Math.floor((d - 1.2) / 0.9));
    for (let s = 1; s <= steps; s++) {
      const t = (s / (steps + 1)) * ((d - 1.2) / d);
      const c = field.at(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      if (c < 0.05) return false;
    }
    return true;
  }

  // Note: returns {title,text} the moment an unseen log has stayed in view and in reach for a short while.
  update(ship, dt, forward) {
    const p = ship.pos;
    if (forward) this.fwd = forward;
    const f = this.fwd;
    const plan = this.world.cell(...cellOf(p[0], p[1], p[2]));
    for (const poi of plan.pois) {
      if (this.seen.has(poi.id)) continue;
      const dx = poi.p[0] - p[0];
      const dy = poi.p[1] - p[1];
      const dz = poi.p[2] - p[2];
      const d = Math.hypot(dx, dy, dz);
      const inReach = d < poi.r + 1.5;
      const inView = d < 1.2 || (dx * f[0] + dy * f[1] + dz * f[2]) / d > CONE;
      if (!inReach || !inView || !this.visible(ship.field, p, poi.p)) {
        this.dwell.delete(poi.id);
        continue;
      }
      const t = (this.dwell.get(poi.id) || 0) + dt;
      if (t < DWELL) {
        this.dwell.set(poi.id, t);
        continue;
      }
      this.dwell.delete(poi.id);
      this.seen.add(poi.id);
      this.entries.push({ id: poi.id, title: poi.title, text: poi.text });
      this.save();
      return { title: poi.title, text: poi.text };
    }
    return null;
  }

  // Note: a vague pointer to the nearest unseen log among the cells around the ship.
  hint(pos) {
    const [ci, cj, ck] = cellOf(pos[0], pos[1], pos[2]);
    let best = null;
    let bd = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let k = ck - 1; k <= ck + 1; k++) {
          for (const poi of this.world.cell(i, j, k).pois) {
            if (this.seen.has(poi.id)) continue;
            const d = dist(poi.p, pos);
            if (d < bd) {
              bd = d;
              best = poi;
            }
          }
        }
      }
    }
    if (!best) return 'NO SIGNAL';
    const f = this.fwd;
    const dx = best.p[0] - pos[0];
    const dy = best.p[1] - pos[1];
    const dz = best.p[2] - pos[2];
    // Note: bearing in the horizontal plane against the last view direction; the right vector is (-fz, fx).
    const fl = Math.hypot(f[0], f[2]) || 1;
    const fx = f[0] / fl;
    const fz = f[2] / fl;
    const ahead = dx * fx + dz * fz;
    const side = dx * -fz + dz * fx;
    const parts = [];
    const h = Math.hypot(dx, dz);
    if (h > 6) {
      if (Math.abs(ahead) > Math.abs(side) * 0.6) parts.push(ahead > 0 ? 'AHEAD' : 'BEHIND');
      if (Math.abs(side) > Math.abs(ahead) * 0.6) parts.push(side > 0 ? 'RIGHT' : 'LEFT');
    }
    if (Math.abs(dy) > 0.3 * bd && Math.abs(dy) > 5) parts.push(dy > 0 ? 'ABOVE' : 'BELOW');
    const where = parts.length ? parts.join(' / ') : 'CLOSE';
    return `SIGNAL ${Math.round(bd)} M // ${where}`;
  }
}
