// Note: people on foot: the courier's walk, line of sight, vision cones, guard suspicion and their fights.

import { CELL } from './config.js';
import { TILE_PROPS } from './tiles.js';
import { cellAt } from './worldgen.js';
import { clamp, angleDiff } from './rand.js';

// Note: on-foot sizes and ranges are people-scale at half of the old values, matching the 2x on-foot zoom.
export const FOOT_R = 2;
// Note: on-foot speeds sit at the car's true scale, so a running courier stays slower than a car at 20 mph.
export const WALK = 25;
export const RUN = 45;
// Note: a moving courier builds suspicion per pixel crossed as at the old walk (27 px/s at today's people scale).
const SUS_PACE = WALK / 27;
export const CONE_HALF = 0.75;

const props = (world, x, y) => TILE_PROPS[cellAt(world, Math.floor(x / CELL), Math.floor(y / CELL))];

// Note: pushes a small circle out of cells that block walking.
export function pushOut(world, b, r) {
  const x0 = Math.floor((b.x - r) / CELL);
  const x1 = Math.floor((b.x + r) / CELL);
  const y0 = Math.floor((b.y - r) / CELL);
  const y1 = Math.floor((b.y + r) / CELL);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!TILE_PROPS[cellAt(world, tx, ty)].solidFoot) continue;
      const nx = clamp(b.x, tx * CELL, tx * CELL + CELL);
      const ny = clamp(b.y, ty * CELL, ty * CELL + CELL);
      const dx = b.x - nx;
      const dy = b.y - ny;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 0.001) {
        b.y += r;
        continue;
      }
      b.x += (dx / d) * (r - d);
      b.y += (dy / d) * (r - d);
    }
  }
}

// Note: ctl = {mx, my, run}; returns the surface kind under the feet for footsteps.
export function stepFoot(p, ctl, world, dt) {
  const len = Math.hypot(ctl.mx, ctl.my);
  const tile = props(world, p.x, p.y);
  const speed = (ctl.run ? RUN : WALK) * tile.foot;
  const tvx = len ? (ctl.mx / len) * speed : 0;
  const tvy = len ? (ctl.my / len) * speed : 0;
  const k = Math.min(1, dt * 14);
  p.vx += (tvx - p.vx) * k;
  p.vy += (tvy - p.vy) * k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  pushOut(world, p, FOOT_R);
  p.moving = len > 0;
  p.walk = (p.walk || 0) + Math.hypot(p.vx, p.vy) * dt;
  return tile.surf;
}

// Note: samples every 2 px, half a cell; opaque cells (walls, trees, tanks) block sight and shots.
export function los(world, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 2);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (props(world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t).opaque) return false;
  }
  return true;
}

// Note: 0 when unseen, else closeness 0..1 inside the cone and range.
export function sees(world, v, tx, ty, range, half = CONE_HALF) {
  const dx = tx - v.x;
  const dy = ty - v.y;
  const d = Math.hypot(dx, dy);
  if (d > range) return 0;
  if (d > 8 && Math.abs(angleDiff(v.a, Math.atan2(dy, dx))) > half) return 0;
  if (!los(world, v.x, v.y, tx, ty)) return 0;
  return clamp(1 - d / range, 0.05, 1);
}

export function turnToward(g, want, rate, dt) {
  const d = angleDiff(g.a, want);
  g.a += clamp(d, -rate * dt, rate * dt);
}

function walkTo(world, g, x, y, speed, dt) {
  const dx = x - g.x;
  const dy = y - g.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return true;
  turnToward(g, Math.atan2(dy, dx), 5, dt);
  g.x += (dx / d) * speed * dt;
  g.y += (dy / d) * speed * dt;
  pushOut(world, g, FOOT_R);
  g.walk = (g.walk || 0) + speed * dt;
  return false;
}

// Note: ctx = {world, player {x, y, onFoot, vis (range factor)}, watch (should this guard care), rand, say(g, text), fire(g, angle), melee(g), alertNear(g)}.
export function stepGuard(g, ctx, dt) {
  if (g.state === 'down') return;
  const P = ctx.player;
  const range = g.range * P.vis;
  const vis = ctx.watch ? sees(ctx.world, g, P.x, P.y, range) : 0;
  const dist = Math.hypot(P.x - g.x, P.y - g.y);
  g.t = (g.t || 0) + dt;
  g.fireT = (g.fireT ?? 1) - dt;
  g.meleeT = (g.meleeT ?? 0) - dt;
  g.moving = false;
  if (g.state === 'alert') {
    if (vis > 0 || (dist < 20 && ctx.watch)) {
      g.lastX = P.x;
      g.lastY = P.y;
      g.alertT = 10;
      turnToward(g, Math.atan2(P.y - g.y, P.x - g.x), 6, dt);
      if (dist < 7 && P.onFoot) {
        if (g.meleeT <= 0) {
          g.meleeT = 1.2;
          ctx.melee(g);
        }
      } else if (dist < (g.reach ?? 85) && g.fireT <= 0 && g.armed) {
        g.fireT = (g.fireRate ?? 1.1) + ctx.rand() * 0.5;
        ctx.fire(g, Math.atan2(P.y - g.y, P.x - g.x) + (ctx.rand() - 0.5) * 0.12);
      } else if (dist > 35 || !g.armed) {
        g.moving = !walkTo(ctx.world, g, P.x, P.y, 24, dt);
      }
    } else {
      g.alertT -= dt;
      g.moving = !walkTo(ctx.world, g, g.lastX, g.lastY, 21, dt);
      if (g.alertT <= 0) {
        g.state = 'search';
        g.sus = 0.6;
      }
    }
    return;
  }
  if (vis > 0) {
    // Note: a drawn gun gets noticed faster.
    g.sus = Math.min(1, g.sus + (0.45 + 2.4 * vis) * (P.armed ? 1.6 : 1) * (P.moving ? SUS_PACE : 1) * dt);
    if (g.sus > 0.3) turnToward(g, Math.atan2(P.y - g.y, P.x - g.x), 3, dt);
    if (g.sus > 0.35 && !g.spotted) {
      g.spotted = true;
      ctx.say(g, 'spot');
    }
    if (g.sus >= 1) {
      alertGuard(g, P.x, P.y);
      ctx.say(g, 'alert');
      ctx.alertNear(g);
    }
    return;
  }
  g.sus = Math.max(0, g.sus - 0.22 * dt);
  if (g.sus < 0.2) g.spotted = false;
  if (g.state === 'search') {
    if (walkTo(ctx.world, g, g.home.x, g.home.y, 14, dt) && g.sus <= 0) g.state = 'idle';
    else g.moving = true;
    return;
  }
  // Note: idle guards sweep their gaze around a base heading.
  g.a = g.baseA + Math.sin(g.t * 0.45 + g.phase) * 1.1;
}

export function alertGuard(g, x, y) {
  if (g.state === 'down') return;
  g.state = 'alert';
  g.sus = 1;
  g.lastX = x;
  g.lastY = y;
  g.alertT = 10;
}

// Note: a noise (x, y, radius) turns heads and builds suspicion.
export function hearNoise(g, x, y, radius) {
  if (g.state === 'down' || g.state === 'alert') return;
  const d = Math.hypot(x - g.x, y - g.y);
  if (d > radius) return;
  g.sus = Math.min(0.95, g.sus + 0.5 * (1 - d / radius) + 0.2);
  g.baseA = Math.atan2(y - g.y, x - g.x);
  g.a = g.baseA;
}

export function makeGuard(e, opts = {}) {
  return {
    id: e.id, kind: 'guard', site: e.site, faction: e.faction, look: opts.look || e.faction,
    x: e.x, y: e.y, a: e.a ?? 0, baseA: e.a ?? 0, phase: (e.x * 0.013 + e.y * 0.007) % 6,
    home: { x: e.x, y: e.y }, state: 'idle', sus: 0, hp: 3, range: 60, armed: true, spr: null, ...opts,
  };
}
