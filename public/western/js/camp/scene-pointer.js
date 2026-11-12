// Note: the saloon floor and the fistfight hide the mouse and lock it, as the tactical stage does; the pointer is a point in room metres that the mouse moves unseen.
import { angleDiff } from '../rand.js';

// Note: a pointer closer than this to the player gives no direction, so the way the player faces stands in.
export const MIN_AIM = 0.3;
// Note: half the width of a person seen along the aim line, in metres; a foe is on the line when it lies within this of it.
export const BODY = 0.55;
// Note: the cone is never narrower than this, in radians, however far the foe stands.
export const MIN_CONE = 0.14;

const keep = (v, max) => Math.max(0, Math.min(max, v));

// Note: the point held inside the room.
export function clampTo(room, p) {
  return { x: keep(p.x, room.w), y: keep(p.y, room.h) };
}

// Note: screen pixels of mouse movement as room metres; rect is the canvas on the page.
export function scaleMove(mx, my, rect, room) {
  return { x: (mx || 0) * (room.w / rect.width), y: (my || 0) * (room.h / rect.height) };
}

// Note: the pointer after the mouse moved by mx, my screen pixels; never leaves the room.
export function moveBy(pos, mx, my, rect, room) {
  if (!rect.width || !rect.height) return pos;
  const d = scaleMove(mx, my, rect, room);
  return clampTo(room, { x: pos.x + d.x, y: pos.y + d.y });
}

// Note: a screen point on the canvas as room metres.
export function roomPoint(clientX, clientY, rect, room) {
  return { x: ((clientX - rect.left) / rect.width) * room.w, y: ((clientY - rect.top) / rect.height) * room.h };
}

// Note: the aim as an angle, from the player to the pointer; null when the pointer is on the player and no facing is known.
export function aimAngle(from, to, facing = null) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) >= MIN_AIM) return Math.atan2(dy, dx);
  return Number.isFinite(facing) ? facing : null;
}

// Note: the nearest of the people on the aim line: within range, inside the cone, and seen when a sees(from, person) is given; each has x and y, and the person itself is returned.
export function pickAlong(from, angle, people, { range = Infinity, sees = null } = {}) {
  if (!Number.isFinite(angle)) return null;
  let best = null;
  for (const p of people) {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d > range) continue;
    const off = d < 1e-6 ? 0 : Math.abs(angleDiff(angle, Math.atan2(p.y - from.y, p.x - from.x)));
    if (off > Math.max(MIN_CONE, Math.atan2(BODY, d))) continue;
    if (sees && !sees(from, p)) continue;
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && off < best.off)) best = { p, d, off };
  }
  return best ? best.p : null;
}

// Note: opts: home() is where the pointer starts, paused() tells that nothing is being played, onUnlock() hears the lock end.
// Note: the lock is held by a small element of its own beside the page, not by the canvas: the screens are drawn again after every action, and the browser ends a lock whose element is moved.
// Note: a view listens through listen(), so it hears the canvas while the mouse is free and the lock element while it is locked.
export function createScenePointer(canvas, room, opts = {}) {
  const doc = globalThis.document || null;
  let pos = clampTo(room, opts.home ? opts.home() : { x: room.w / 2, y: room.h / 2 });
  let locked = false;
  let holder = null;
  const heard = [];
  const rect = () => canvas.getBoundingClientRect();
  const onChange = () => {
    const was = locked;
    locked = !!holder && !!doc && doc.pointerLockElement === holder;
    if (was && !locked && opts.onUnlock) opts.onUnlock();
  };
  if (doc) doc.addEventListener('pointerlockchange', onChange);
  const lockElement = () => {
    if (holder || !doc || !doc.createElement || !doc.body) return holder;
    holder = doc.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    for (const [type, fn] of heard) holder.addEventListener(type, fn);
    doc.body.append(holder);
    return holder;
  };

  const api = {
    get locked() {
      return locked;
    },
    get pos() {
      return pos;
    },
    listen(type, fn) {
      canvas.addEventListener(type, fn);
      heard.push([type, fn]);
      if (holder) holder.addEventListener(type, fn);
    },
    // Note: the room point of an event: the unseen pointer while locked, else where the event landed, and the pointer follows it.
    read(e) {
      if (locked) return pos;
      const r = rect();
      if (r.width && r.height) pos = clampTo(room, roomPoint(e.clientX, e.clientY, r, room));
      return pos;
    },
    // Note: relative motion while locked; the unlocked pointer is read from the event.
    move(e) {
      if (locked && e.pointerType === 'mouse') pos = moveBy(pos, e.movementX, e.movementY, rect(), room);
      return api.read(e);
    },
    // Note: a mouse press asks for the lock; touch and pen never do, and nothing is asked while play is paused.
    capture(e) {
      if (locked || e.pointerType !== 'mouse' || (opts.paused && opts.paused())) return;
      const el = lockElement();
      if (!el || !el.requestPointerLock) return;
      try {
        const request = el.requestPointerLock();
        if (request && request.catch) request.catch(() => {});
      } catch (_) { /* Note: browsers may deny the lock without a user gesture. */ }
    },
    // Note: a free pointer is captured by the canvas for the press; a locked one already reports to its holder, and the browser refuses the capture then.
    hold(e) {
      if (locked || !canvas.setPointerCapture) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) { /* Note: a pointer that is no longer active cannot be captured, and the press still works. */ }
    },
    // Note: the pointer comes back to a point, for a start or a new place.
    home(p) {
      pos = clampTo(room, p);
    },
    release() {
      if (holder && doc && doc.pointerLockElement === holder) doc.exitPointerLock();
    },
    destroy() {
      api.release();
      if (doc) doc.removeEventListener('pointerlockchange', onChange);
      if (holder) holder.remove();
      holder = null;
    },
  };
  return api;
}
