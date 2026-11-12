// Note: an omniscient debug view of the deputies' tactical thinking, drawn above the darkness and off by default.

import { TILE, SCALE } from './config.js';
import { zoneAt, zonesOf, safe } from './tactical-zones.js';
import { cellOfKey } from './mind.js';
import { sheriffEstimate, CHECK_TIME } from './tactical-memory.js';
import { sweepProgress } from './ai.js';

const PLANE_EVERY = 15;
const KIND = { hold: 0x4aa3ff, cover: 0x3ddc97, push: 0xffb02e, fallback: 0xb184ff };
const WHO = [0x36d1dc, 0xff5fa2, 0xb6e35a, 0xffc247];
const C = { friendly: 0x3b82f6, hostile: 0xef4444, cleared: 0x2dd4bf, clear: 0x34d399, front: 0xffd84a, threat: 0xff3b30, fire: 0xfff04d, noise: 0xffffff, sheriff: 0xf5f5f5, tac: 0xe879f9 };
const px = (m) => m * TILE;
const FONT = { fontFamily: 'monospace', fontSize: `${Math.round(3.6 * SCALE)}px`, color: '#fff', stroke: '#000', strokeThickness: Math.round(SCALE) };

// Note: ?ai=1 in the address turns it on and ?ai=0 arms it off; only then does the T key flip it, so a player cannot see through the darkness by accident.
const asked = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('ai') : null;
const AI_OVERLAY_START = asked === '1';
const AI_OVERLAY_ARMED = asked !== null;

function dashed(g, x0, y0, x1, y1, on = 5 * SCALE, off = 4 * SCALE) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let d = 0; d < len; d += on + off) {
    const e = Math.min(len, d + on);
    g.lineBetween(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
  }
}

// Note: believed positions within r metres of a group's centre are drawn as one marker at their confidence-weighted centre; the picture only, each deputy's memory keeps every position (items 427 and 443).
export function clusterSpots(spots, r = 2.5) {
  const groups = [];
  for (const p of [...spots].sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))) {
    const w = Math.max(0.05, p.conf ?? 0.5);
    const g = groups.find((q) => q.f === p.f && Math.hypot(q.x - p.x, q.y - p.y) <= r);
    if (!g) {
      groups.push({ x: p.x, y: p.y, f: p.f, w, conf: p.conf ?? 0.5, coarse: p.coarse || 0, checked: p.checked || 0, members: [p] });
      continue;
    }
    g.x = (g.x * g.w + p.x * w) / (g.w + w);
    g.y = (g.y * g.w + p.y * w) / (g.w + w);
    g.w += w;
    g.conf = Math.max(g.conf, p.conf ?? 0.5);
    g.coarse = Math.max(g.coarse, p.coarse || 0);
    g.checked = Math.max(g.checked, p.checked || 0);
    g.members.push(p);
  }
  return groups;
}

function diamond(g, x, y, r) {
  g.fillPoints([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], true);
  g.strokePoints([{ x, y: y - r }, { x: x + r, y }, { x, y: y + r }, { x: x - r, y }], true);
}

export class AiOverlay {
  constructor(scene, depth) {
    this.scene = scene;
    this.on = AI_OVERLAY_START;
    this.planes = scene.add.graphics().setDepth(depth);
    this.dyn = scene.add.graphics().setDepth(depth + 1);
    this.legend = scene.add.graphics().setDepth(depth + 2).setScrollFactor(0);
    this.labels = new Map();
    this.legendText = [];
    this.planeAt = -Infinity;
    this.planeFloor = -1;
    this.buildLegend();
    this.apply();
  }

  toggle() {
    if (!AI_OVERLAY_ARMED) return;
    this.on = !this.on;
    this.apply();
  }

  apply() {
    this.planes.setVisible(this.on);
    this.dyn.setVisible(this.on);
    this.legend.setVisible(this.on);
    for (const t of this.legendText) t.setVisible(this.on);
    if (!this.on) for (const t of this.labels.values()) t.setVisible(false);
    this.planeAt = -Infinity;
  }

  // Note: swatch plus name per row, fixed to the screen corner.
  buildLegend() {
    const rows = [
      [C.friendly, 'friendly zone (guard stationed)'], [C.cleared, 'cleared zone (swept, no guard)'], [C.hostile, 'hostile zone'], [C.front, 'front line'], [C.clear, 'cleared cell'],
      [C.threat, 'believed threats, nearby ones merged (size = count, ring = being checked)'], [KIND.hold, 'hold post + field of fire'], [KIND.cover, 'cover post'],
      [KIND.push, 'push post / sweep points'], [KIND.fallback, 'fall back / retreat'], [C.fire, 'target (bright = firing)'], [C.noise, 'heard noise'],
      [C.tac, 'firing position / doorway pie stations'],
    ];
    const x = 6 * SCALE;
    const step = 5.2 * SCALE;
    const g = this.legend;
    const title = this.scene.add.text(x, x, 'DEPUTY AI  [T]', { ...FONT, color: '#ffd84a' }).setDepth(g.depth).setScrollFactor(0);
    this.legendText.push(title);
    rows.forEach(([c, name], i) => {
      const y = x + step * (i + 1.2);
      g.fillStyle(c, 0.9).fillRect(x, y, 3 * SCALE, 3 * SCALE);
      this.legendText.push(this.scene.add.text(x + 5 * SCALE, y - 0.4 * SCALE, name, FONT).setDepth(g.depth).setScrollFactor(0));
    });
  }

  label(key) {
    let t = this.labels.get(key);
    if (!t) {
      t = this.scene.add.text(0, 0, '', FONT).setOrigin(0.5, 1).setDepth(this.dyn.depth + 1);
      this.labels.set(key, t);
    }
    return t;
  }

  // Note: newest knowledge per zone across everyone's maps, and every cell any deputy has stamped clear.
  drawPlanes(sim, floor) {
    const g = this.planes;
    g.clear();
    const zones = new Map();
    const clear = new Map();
    for (const a of sim.lawmen) {
      for (const [key, z] of a.ai.zones) if (!zones.has(key) || zones.get(key).t < z.t) zones.set(key, z);
      for (const [k, t] of a.ai.mind.clear) if (!clear.has(k) || clear.get(k) < t) clear.set(k, t);
    }
    for (const [k, t] of clear) {
      const { f, x, y } = cellOfKey(k);
      if (f !== floor) continue;
      g.fillStyle(C.clear, t > sim.time - 5 ? 0.16 : 0.08).fillRect(px(x), px(y), TILE, TILE);
    }
    const safeAt = (x, y) => safe(zones, zoneAt(sim, { x: x + 0.5, y: y + 0.5, f: floor }));
    for (const z of zonesOf(sim)) {
      if (z.f !== floor) continue;
      const side = zones.get(z.key)?.side;
      if (!side) continue;
      g.fillStyle(C[side], side === 'hostile' ? 0.2 : 0.13);
      for (const c of z.cells) g.fillRect(px(c.x), px(c.y), TILE, TILE);
      for (const gd of zones.get(z.key).guards || []) if (gd.f === floor) g.fillStyle(C.friendly, 0.9).fillRect(px(gd.x) - 1.5 * SCALE, px(gd.y) - 1.5 * SCALE, 3 * SCALE, 3 * SCALE);
    }
    // Note: the front line drawn is every cell edge between safe and unsafe zones on this floor.
    g.lineStyle(2 * SCALE, C.front, 0.85);
    for (const z of zonesOf(sim)) {
      if (z.f !== floor || !safe(zones, z)) continue;
      for (const { x, y } of z.cells) {
        if (!safeAt(x - 1, y)) g.lineBetween(px(x), px(y), px(x), px(y + 1));
        if (!safeAt(x + 1, y)) g.lineBetween(px(x + 1), px(y), px(x + 1), px(y + 1));
        if (!safeAt(x, y - 1)) g.lineBetween(px(x), px(y), px(x + 1), px(y));
        if (!safeAt(x, y + 1)) g.lineBetween(px(x), px(y + 1), px(x + 1), px(y + 1));
      }
    }
  }

  update(sim, view) {
    if (!this.on) return;
    if (this.planeFloor !== view.floor || sim.tickN - this.planeAt >= PLANE_EVERY) {
      this.planeFloor = view.floor;
      this.planeAt = sim.tickN;
      this.drawPlanes(sim, view.floor);
    }
    const g = this.dyn;
    g.clear();
    const shown = new Set();
    sim.deputies.forEach((a, i) => {
      if (a.withdrawn || a.status !== 'ok' || a.floor !== view.floor) return;
      shown.add(a.id);
      this.drawDeputy(sim, g, a, WHO[i % WHO.length]);
    });
    for (const [id, t] of this.labels) if (!shown.has(id)) t.setVisible(false);
  }

  drawDeputy(sim, g, a, col) {
    const ai = a.ai;
    const o = ai.order?.accepted ? ai.order : null;
    const ax = px(a.x);
    const ay = px(a.y);
    const notes = [];
    // Note: ring and the core view wedge show who is who and where the eyes point.
    const core = sim.fovOf(a).zones[0];
    g.fillStyle(col, 0.1).slice(px(a.eye.x), px(a.eye.y), px(Math.min(core.range, 8)), a.facing - core.half, a.facing + core.half, false).fillPath();
    g.lineStyle(2 * SCALE, col, 0.9).strokeCircle(ax, ay, 0.55 * TILE);

    // Note: the path he is walking, and where it ends.
    const path = a.nav?.path || [];
    if (path.length) {
      g.lineStyle(1.5 * SCALE, col, 0.7);
      let px0 = ax;
      let py0 = ay;
      for (const p of path) {
        g.lineBetween(px0, py0, px(p.x), px(p.y));
        px0 = px(p.x);
        py0 = px(p.y);
      }
      g.fillStyle(col, 0.9).fillCircle(px0, py0, 1.8 * SCALE);
    }
    const goal = a.intent?.goal;
    if (goal && goal.f === a.floor) g.lineStyle(SCALE, col, 0.6).strokeCircle(px(goal.x), px(goal.y), Math.max(0.2, goal.r ?? 0.4) * TILE);
    if (a.intent?.face != null) g.lineStyle(SCALE, col, 0.5).lineBetween(ax, ay, ax + Math.cos(a.intent.face) * 2.2 * TILE, ay + Math.sin(a.intent.face) * 2.2 * TILE);

    // Note: the order he holds, its post, and the arc the post watches.
    const post = o?.kind === 'hold' ? ai.holdSpot : o?.spot || (o ? null : ai.holdSpot);
    const kc = o ? KIND[o.kind] : col;
    notes.push(o ? o.kind.toUpperCase() : 'COVER');
    if (post && post.f === a.floor) {
      const sx = px(post.x);
      const sy = px(post.y);
      g.lineStyle(SCALE, kc, 0.55);
      dashed(g, ax, ay, sx, sy);
      if (post.arc != null) {
        const half = sim.fovOf(a).zones[0].half;
        g.fillStyle(kc, 0.14).slice(sx, sy, 3.5 * TILE, post.arc - half, post.arc + half, false).fillPath();
        g.lineStyle(SCALE, kc, 0.7).lineBetween(sx, sy, sx + Math.cos(post.arc) * 3.5 * TILE, sy + Math.sin(post.arc) * 3.5 * TILE);
      }
      g.fillStyle(kc, 0.9).fillRect(sx - 2.5 * SCALE, sy - 2.5 * SCALE, 5 * SCALE, 5 * SCALE);
      g.lineStyle(SCALE, 0x000000, 0.8).strokeRect(sx - 2.5 * SCALE, sy - 2.5 * SCALE, 5 * SCALE, 5 * SCALE);
    }
    if (o?.threat && o.threat.f === a.floor) {
      g.lineStyle(SCALE, kc, 0.5);
      dashed(g, ax, ay, px(o.threat.x), px(o.threat.y));
    }
    // Note: his firing position, the doorway pie he is slicing, and the state of his tactics.
    const tac = ai.tac;
    if (tac?.spot && tac.spot.f === a.floor) {
      const sx = px(tac.spot.x);
      const sy = px(tac.spot.y);
      g.lineStyle(1.5 * SCALE, C.tac, 0.9).strokeCircle(sx, sy, 0.3 * TILE);
      if (!tac.spot.here && !tac.spot.reached) dashed(g, ax, ay, sx, sy, 2 * SCALE, 2 * SCALE);
      notes.push(tac.spot.lean ? `LEAN${tac.spot.lean > 0 ? 'R' : 'L'}` : tac.spot.stance === 'stand' ? 'LOW' : 'POS');
    }
    if (tac?.pie) {
      for (const st of tac.pie.stations) g.fillStyle(C.tac, 0.8).fillRect(px(st.x) - 1.5 * SCALE, px(st.y) - 1.5 * SCALE, 3 * SCALE, 3 * SCALE);
      notes.push(`PIE ${tac.pie.k}/${tac.pie.stations.length}`);
    }
    if (tac && sim.time < (tac.duckUntil ?? 0)) notes.push('DUCK');
    if (tac?.wait) notes.push('WAIT');
    if (tac && sim.time < (tac.shotUntil ?? 0)) notes.push('FIRED ON');
    if (ai.doing) notes.push(ai.doing);
    if (tac) notes.push(`tac ${tac.sense.toFixed(2)}`);
    if (ai.fleeing) notes.push(`FLEE:${ai.fleeing}`);
    if (ai.fleeing === 'carry') g.lineStyle(2 * SCALE, KIND.fallback, 0.8).lineBetween(ax, ay, px(sim.sheriff.x), px(sim.sheriff.y));

    // Note: the sweep's unseen cells, its doorways and its current focus.
    const sw = o?.sweep;
    if (o?.holdUntil > sim.time) notes.push('no zone left');
    if (sw) {
      const { open, doors } = sweepProgress(a, sw);
      for (const c of open) g.fillStyle(KIND.push, 0.45).fillRect(px(c.cx) - SCALE, px(c.cy) - SCALE, 2 * SCALE, 2 * SCALE);
      for (const d of sw.doors) {
        g.lineStyle(SCALE, doors.includes(d) ? KIND.push : C.clear, 0.9).strokeRect(px(d.cx) - 3 * SCALE, px(d.cy) - 3 * SCALE, 6 * SCALE, 6 * SCALE);
      }
      if (sw.focus) g.lineStyle(SCALE, KIND.push, 0.9).lineBetween(ax, ay, ax + Math.cos(sw.focus.face) * 3 * TILE, ay + Math.sin(sw.focus.face) * 3 * TILE);
      notes.push(`sweep ${sw.cells.length ? Math.round(100 * (1 - open.length / sw.cells.length)) : 100}%`);
    }

    // Note: believed hostile positions, nearby ones merged into one marker that grows with the number it stands for, with a ring that fills while he checks one.
    const threats = ai.mind.threats;
    for (const t of clusterSpots(threats.filter((q) => q.f === a.floor))) {
      const tx = px(t.x);
      const ty = px(t.y);
      g.lineStyle(SCALE, C.threat, 0.18).lineBetween(ax, ay, tx, ty);
      if (t.coarse) g.lineStyle(SCALE, C.threat, 0.22).strokeCircle(tx, ty, t.coarse * TILE);
      g.fillStyle(C.threat, 0.25 + 0.5 * t.conf).lineStyle(1.5 * SCALE, col, 0.9);
      diamond(g, tx, ty, 3.5 * SCALE * Math.min(2, 1 + 0.25 * (t.members.length - 1)));
      if (t.checked > 0) g.lineStyle(2 * SCALE, C.clear, 0.9).beginPath().arc(tx, ty, 6 * SCALE, -Math.PI / 2, -Math.PI / 2 + (t.checked / CHECK_TIME) * Math.PI * 2).strokePath();
    }
    if (threats.length) notes.push(`T${threats.length}`);
    if (ai.noise && sim.time - ai.noise.t < 6 && ai.noise.f === a.floor) {
      const age = (sim.time - ai.noise.t) / 6;
      g.lineStyle(SCALE, C.noise, 0.7 * (1 - age)).strokeCircle(px(ai.noise.x), px(ai.noise.y), (0.5 + age * 2.5) * TILE);
    }

    // Note: his target, bright and thick while he fires.
    const target = a.intent?.targetId != null ? sim.byId(a.intent.targetId) : null;
    if (target && target.floor === a.floor && target.status === 'ok') {
      const firing = !!a.intent.fire;
      g.lineStyle((firing ? 2.5 : 1.2) * SCALE, firing ? C.fire : C.threat, firing ? 0.95 : 0.6).lineBetween(ax, ay, px(target.x), px(target.y));
      g.lineStyle(SCALE * 1.5, firing ? C.fire : C.threat, 0.9).strokeCircle(px(target.x), px(target.y), 0.7 * TILE);
      notes.push(`${firing ? 'FIRE' : 'aim'}>${target.name || target.id}`);
    }
    if (ai.weaponsFree) notes.push('free');

    // Note: where he thinks the sheriff is, when he cannot see him.
    if (!sim.sees(a, sim.sheriff)) {
      const e = sheriffEstimate(sim, a);
      if (e.status !== 'unknown' && e.f === a.floor) {
        g.lineStyle(SCALE, C.sheriff, 0.5).strokeCircle(px(e.x), px(e.y), 0.5 * TILE);
        dashed(g, ax, ay, px(e.x), px(e.y), 2 * SCALE, 4 * SCALE);
        notes.push('S?');
      }
    }

    const t = this.label(a.id);
    t.setText(`${a.name || a.id}\n${notes.join(' ')}`).setColor(`#${col.toString(16).padStart(6, '0')}`).setPosition(ax, ay - 0.75 * TILE).setVisible(true);
  }

  destroy() {
    this.planes.destroy();
    this.dyn.destroy();
    this.legend.destroy();
    for (const t of [...this.labels.values(), ...this.legendText]) t.destroy();
    this.labels.clear();
    this.legendText = [];
  }
}
