// Note: speech bubbles are a DOM layer over the canvas, so the text stays sharp at any zoom; it holds no state beyond the lines on screen.

import { TILE, VIEW_W, VIEW_H, SCALE } from './config.js';
import { bubbleSeconds } from './speech.js';

const MAX = 4;
// Note: game pixels above the speaker's centre where the tail tip sits.
const HEAD = 10 * SCALE;
// Note: a speaker we cannot see is drawn this many metres from the listener, toward where the sound came from.
const RING = 4.5;
const MARGIN = 6;
const FADE = 0.35;

// Note: pure; keeps a bubble's rectangle inside the stage (CSS pixels).
export function clampRect(x, y, w, h, W, H) {
  return { x: Math.max(MARGIN, Math.min(W - w - MARGIN, x)), y: Math.max(MARGIN, Math.min(H - h - MARGIN, y)) };
}

export function createBubbles(root) {
  let list = [];

  function drop(b) {
    b.el.remove();
    list = list.filter((o) => o !== b);
  }

  function clear() {
    for (const b of list) b.el.remove();
    list = [];
  }

  // Note: one bubble per speaker; a grunt never replaces a spoken line that is still up.
  function add(cue, now) {
    if (!cue.text) return;
    const old = cue.actorId == null ? null : list.find((b) => b.cue.actorId === cue.actorId);
    if (old) {
      if (cue.cry) return;
      drop(old);
    }
    while (list.length >= MAX) drop(list[0]);
    const el = document.createElement('div');
    el.className = `bubble ${cue.mode} ${cue.role || ''}`.trim();
    el.textContent = cue.text;
    const arrow = document.createElement('span');
    arrow.className = 'bubble-pointer';
    el.appendChild(arrow);
    root.appendChild(el);
    list.push({ el, arrow, cue, until: now + bubbleSeconds(cue.text), w: el.offsetWidth, h: el.offsetHeight, seen: null, opacity: '' });
  }

  // Note: sx and sy are the world pixel at the screen's top left, z the integer zoom of the stage and cz the camera's zoom of the world.
  function update(sim, follow, view, sx, sy, z, cz = 1) {
    const now = sim.time;
    const W = VIEW_W * z;
    const H = VIEW_H * z;
    for (const b of list.slice()) if (now >= b.until) drop(b);
    const placed = [];
    for (const b of list) {
      const actor = b.cue.actorId == null ? null : sim.byId(b.cue.actorId);
      const seen = !!actor && (actor === follow || sim.canSeeActor(follow, actor));
      let x;
      let y;
      if (seen) {
        x = (actor.x * TILE - sx) * cz;
        y = (actor.y * TILE - sy - HEAD) * cz;
      } else {
        x = (follow.x * TILE + Math.cos(b.cue.dir) * RING * TILE - sx) * cz;
        y = (follow.y * TILE + Math.sin(b.cue.dir) * RING * TILE - sy) * cz;
      }
      let r = clampRect(x * z - b.w / 2, seen ? y * z - b.h - 8 : y * z - b.h / 2, b.w, b.h, W, H);
      // Note: stack upward instead of overlapping another bubble.
      for (let k = 0; k < MAX; k++) {
        const hit = placed.find((p) => r.x < p.x + p.w + 4 && p.x < r.x + b.w + 4 && r.y < p.y + p.h + 4 && p.y < r.y + b.h + 4);
        if (!hit) break;
        r = clampRect(r.x, hit.y - b.h - 4, b.w, b.h, W, H);
      }
      placed.push({ x: r.x, y: r.y, w: b.w, h: b.h });
      b.el.style.transform = `translate(${Math.round(r.x)}px, ${Math.round(r.y)}px)`;
      if (seen !== b.seen) {
        b.seen = seen;
        b.el.classList.toggle('heard-only', !seen);
        b.arrow.style.display = '';
      }
      // Note: the pointer shows where a line came from when the speaker is out of sight, or points down at one we see.
      if (seen) b.arrow.style.transform = `translate(${Math.round(Math.max(10, Math.min(b.w - 10, x * z - r.x)))}px, ${b.h}px) rotate(90deg)`;
      else b.arrow.style.transform = `translate(${Math.round(b.w / 2 + Math.cos(b.cue.dir) * (b.w / 2 + 2))}px, ${Math.round(b.h / 2 + Math.sin(b.cue.dir) * (b.h / 2 + 2))}px) rotate(${b.cue.dir}rad)`;
      const base = seen ? 1 : 0.55 + 0.4 * (1 - Math.min(1, b.cue.muffle || 0));
      const fade = Math.min(1, (b.until - now) / FADE);
      const o = (base * fade).toFixed(2);
      if (o !== b.opacity) {
        b.opacity = o;
        b.el.style.opacity = o;
      }
    }
  }

  return { add, update, clear, count: () => list.length };
}
