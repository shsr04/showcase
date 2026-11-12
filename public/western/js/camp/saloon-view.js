// Note: the saloon's canvas renderer and input; the room is painted once with the game's own painters, the people are drawn each frame with its person sprites.
import { TILE, SCALE } from '../config.js';
import { paintCell, ensurePerson, personDesc, PERSON_SIZE } from '../sprites.js';
import { stepPhaseAt, STRIDE } from '../anim.js';
import { reducedMotion } from './cfx.js';
import { DAY_START, DAY_END } from './world.js';
import { bakeDusk, drawDusk, drawGlows, drawFixtures } from './saloon-light.js';
import { promptSpot, pixelFit } from './saloon-fit.js';
import { rectDist } from './saloon-room.js';
import { createScenePointer } from './scene-pointer.js';

// Note: item 341: glasses at the bar, cards at the tables, the swinging doors and the murmur, in a fixed round at a constant level.
export const FLOOR = Object.freeze({ level: 0.32, every: 2.4, cues: ['murmur', 'glass_clink', 'cards', 'murmur', 'saloon_door', 'glass_clink', 'cards'] });
// Note: the floor cues that fall due between two times on the floor's clock.
export function floorCues(t0, t1) {
  const out = [];
  for (let k = Math.floor(t0 / FLOOR.every) + 1; k * FLOOR.every <= t1; k++) out.push(FLOOR.cues[k % FLOOR.cues.length]);
  return out;
}

const KEYS = { ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd', ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r' };
const USE_KEYS = new Set(['f', 'F', 'Enter', ' ']);
// Note: the one element builder of the duel, saloon and fight screens.
export const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  e.append(...kids.filter((k) => k != null));
  return e;
};

// Note: the light of the hour as a mood, on the campaign's own day: day while the clock says daylight, dusk in its last hour, night after; hour is a number or a 'HH:MM' text.
export function moodOf(hour) {
  const h = typeof hour === 'string' ? Number(hour.split(':')[0]) : hour;
  if (!Number.isFinite(h)) return 'dusk';
  if (h < DAY_START || h >= DAY_END) return 'night';
  return h >= DAY_END - 1 ? 'dusk' : 'day';
}

// Note: how large the room is drawn: a whole number of device pixels per art pixel when that loses little, else the largest scale that fits.
export function fitRoom(room, fit) {
  const stage = globalThis.document && document.querySelector('.c-stage');
  const cs = parseFloat(stage ? stage.style.getPropertyValue('--cs') : '') || 1;
  return pixelFit({ w: room.w, h: room.h, tile: TILE, fit, cs: cs * (globalThis.devicePixelRatio || 1) });
}

// Note: the room painted once to its own canvas at native tile size; every tile and piece comes from the tactical painters.
export function paintRoom(room) {
  const c = document.createElement('canvas');
  c.width = room.w * TILE;
  c.height = room.h * TILE;
  const g = c.getContext('2d');
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) paintCell(g, room.map, 0, x, y);
  batwings(g, room);
  return c;
}

// Note: swinging half-doors seen from above, two slatted leaves pushed a little inward, so the street door reads as a saloon door.
function batwings(g, room) {
  const x0 = room.doorX * TILE;
  const y0 = (room.h - 1) * TILE;
  const u = TILE / 16;
  const leaf = (hx, dir) => {
    // Note: the leaf is hinged at the jamb (hx) and its free end swings dir * 1 unit toward the middle and 2 units into the room.
    const ex = hx + dir * 6.6 * u;
    const ey = y0 + 6.6 * u;
    const hy = y0 + 8.4 * u;
    g.save();
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    g.lineWidth = 2.2 * u;
    g.beginPath();
    g.moveTo(hx, hy + 1.6 * u);
    g.lineTo(ex, ey + 1.6 * u);
    g.stroke();
    g.strokeStyle = '#4a2c14';
    g.lineWidth = 2.2 * u;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(ex, ey);
    g.stroke();
    g.strokeStyle = '#8a5a2e';
    g.lineWidth = 0.9 * u;
    g.beginPath();
    g.moveTo(hx, hy - 0.7 * u);
    g.lineTo(ex, ey - 0.7 * u);
    g.stroke();
    g.fillStyle = '#d6a845';
    g.fillRect(hx - 0.7 * u, hy - 1.1 * u, 1.4 * u, 2.2 * u);
    g.restore();
  };
  leaf(x0 + 1.4 * u, 1);
  leaf(x0 + 14.6 * u, -1);
}

// Note: the pose words the scene uses, mapped onto the acts the person painter already has.
export const FRAMES = {
  stand: () => ({}),
  walk: (a) => ({ act: 'walk', ph: stepPhaseAt(a.dist, STRIDE) }),
  sit: () => ({ act: 'doze' }),
  cards: () => ({ act: 'search', ph: 0 }),
  lean: () => ({ act: 'search', ph: 1 }),
  drink: () => ({ act: 'signal', ph: 7 }),
  talk: () => ({ act: 'signal', ph: 5 }),
  play: (a, t) => ({ act: 'search', ph: Math.floor(t * 2.4) % 2 }),
  wipe: (a, t) => ({ act: 'reach', ph: Math.floor(t * 1.2) % 2 }),
};

// Note: opts: act(actionId) runs a context action, label(action, target) words it, paused() stops the world, handsOff() tells that the page needs the mouse (paused() when absent), onContext(target) hears every change, fit is the room in design pixels, mood is the light ('day', 'dusk', 'night') or a function that gives it.
export function createSaloonView(scene, opts = {}) {
  const { room } = scene;
  const fit = opts.fit || { w: 976, h: 432 };
  const fitted = fitRoom(room, fit);
  const cell = TILE * fitted.scale;
  const W = room.w * TILE;
  const H = room.h * TILE;
  const store = new Map();
  const shim = { textures: { exists: (key) => store.has(key), addCanvas: (key, c) => store.set(key, c), remove: (key) => store.delete(key) } };
  const size = Math.round((PERSON_SIZE * SCALE) / 2);
  const floor = paintRoom(room);
  const moodNow = () => (typeof opts.mood === 'function' ? opts.mood() : opts.mood) || 'dusk';
  let mood = moodNow();
  let dusk = bakeDusk(room, TILE, mood);
  let moodAt = 0;

  const canvas = el('canvas', { class: 'saloon-canvas', width: W, height: H, 'aria-hidden': 'true' });
  canvas.style.width = `${room.w * cell}px`;
  canvas.style.height = `${room.h * cell}px`;
  if (fitted.integer) canvas.classList.add('crisp');
  const g = canvas.getContext('2d');
  const prompt = el('button', { type: 'button', class: 'saloon-prompt', tabindex: '-1', hidden: true });
  const cap = el('kbd', {}, 'F');
  const words = el('span', {});
  // Note: the space keeps the button's spoken name apart ("F Have a drink"); the flex row hides it.
  prompt.append(cap, ' ', words);
  const live = el('p', { class: 'saloon-live', role: 'status', 'aria-live': 'polite' });
  const wrap = el('div', {
    class: 'saloon-view',
    'data-key': 'saloon-floor',
    tabindex: '0',
    role: 'application',
    'aria-label': 'Saloon floor. Walk with W A S D or the arrow keys. Press F to use what is in front of you.',
  }, canvas, prompt, live);
  wrap.style.width = `${room.w * cell}px`;
  wrap.style.height = `${room.h * cell}px`;

  const keys = new Set();
  let goal = null;
  let raf = 0;
  let last = 0;
  let shown = '';
  let stepAt = scene.sheriff.dist;
  let calm = reducedMotion();
  scene.calm = calm;
  const media = globalThis.matchMedia ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMedia = () => {
    calm = reducedMotion();
    scene.calm = calm;
  };
  if (media && media.addEventListener) media.addEventListener('change', onMedia);

  const primary = () => (scene.context && scene.context.actions[0]) || null;
  const wordsOf = (action, target) => (opts.label ? opts.label(action, target) : action.label);
  const use = (id) => {
    const action = id ? scene.context?.actions.find((a) => a.id === id) : primary();
    if (!action) return;
    if (opts.act) opts.act(action.id);
  };

  const onKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYS[e.key]) {
      keys.add(KEYS[e.key]);
      goal = null;
      // Note: the unseen pointer comes back to the player, so the next hold does not walk to an old spot.
      ptr.home(scene.sheriff);
      e.preventDefault();
      e.stopPropagation();
    } else if (USE_KEYS.has(e.key) && e.target === wrap) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) use();
    }
  };
  const onKeyUp = (e) => {
    if (KEYS[e.key]) {
      keys.delete(KEYS[e.key]);
      e.preventDefault();
    }
  };
  wrap.addEventListener('keydown', onKeyDown);
  wrap.addEventListener('keyup', onKeyUp);
  wrap.addEventListener('blur', () => {
    keys.clear();
    goal = null;
  });

  // Note: pressing and holding on the floor walks toward the pointer; a quick press uses the highlighted thing.
  // Note: a mouse is hidden and locked (item 85), so its pointer is unseen and the sheriff's walk is the only sign of it; touch and pen keep the absolute point.
  const idleNow = () => !!((globalThis.document && document.hidden) || (opts.paused && opts.paused()));
  // Note: the mouse is given back only when the page needs it (a dialog, another screen); a passing effect stops the world but not the lock.
  const handsOff = () => !!((globalThis.document && document.hidden) || (opts.handsOff ? opts.handsOff() : opts.paused && opts.paused()));
  let press = null;
  const ptr = createScenePointer(canvas, room, {
    home: () => scene.sheriff,
    paused: handsOff,
    onUnlock: () => {
      press = null;
      goal = null;
    },
  });
  ptr.listen('pointerdown', (e) => {
    if (e.button) return;
    wrap.focus({ preventScroll: true });
    const abs = !ptr.locked;
    goal = ptr.read(e);
    ptr.capture(e);
    press = { at: goal, t: e.timeStamp, abs };
    ptr.hold(e);
  });
  ptr.listen('pointermove', (e) => {
    const at = ptr.move(e);
    if (press) goal = at;
  });
  const release = (e) => {
    const quick = press && e.timeStamp - press.t < 350;
    const p = press;
    press = null;
    goal = null;
    const ctx = scene.context;
    if (!quick || !p || !ctx) return;
    const near = ctx.rect ? rectDist(ctx.rect, p.at.x, p.at.y) : Math.hypot(ctx.at.x - p.at.x, ctx.at.y - p.at.y);
    // Note: a locked press cannot aim at the thing, so it uses what is highlighted, as F does.
    if (!p.abs || near < 0.7) use();
  };
  ptr.listen('pointerup', release);
  ptr.listen('pointercancel', () => {
    press = null;
    goal = null;
  });
  prompt.addEventListener('click', () => use());

  const input = () => {
    if (goal) {
      const dx = goal.x - scene.sheriff.x;
      const dy = goal.y - scene.sheriff.y;
      const d = Math.hypot(dx, dy);
      return d > 0.2 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
    }
    return { x: (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0), y: (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0) };
  };

  const spriteOf = (a, t) => {
    const pose = a === scene.sheriff ? a.pose : scene.poseOf(a);
    const f = (FRAMES[pose] || FRAMES.stand)(a, t);
    if (a === scene.sheriff) f.stow = 'handgun';
    return store.get(ensurePerson(shim, personDesc(a, f)));
  };

  const drawActor = (a, t) => {
    const tex = spriteOf(a, t);
    if (!tex) return;
    if (a === scene.sheriff) {
      // Note: a thin gold ring under the sheriff, so the player's own figure is never lost among the patrons.
      g.save();
      g.strokeStyle = 'rgba(255, 224, 130, 0.7)';
      g.lineWidth = Math.max(1.5, TILE / 24);
      g.beginPath();
      g.arc(a.x * TILE, a.y * TILE, 0.46 * TILE, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    g.save();
    g.translate(a.x * TILE, a.y * TILE);
    g.rotate(a.facing);
    g.drawImage(tex, -size / 2, -size / 2, size, size);
    g.restore();
  };

  const mark = (t, now) => {
    const pulse = calm ? 0.9 : 0.72 + Math.sin(now * 5) * 0.2;
    g.save();
    g.strokeStyle = `rgba(255, 226, 138, ${pulse})`;
    g.lineWidth = Math.max(2, TILE / 16);
    if (t.rect) {
      const m = 0.06 * TILE;
      g.strokeRect(t.rect.x0 * TILE - m, t.rect.y0 * TILE - m, (t.rect.x1 - t.rect.x0) * TILE + 2 * m, (t.rect.y1 - t.rect.y0) * TILE + 2 * m);
    } else if (t.actor) {
      g.beginPath();
      g.arc(t.actor.x * TILE, t.actor.y * TILE, 0.52 * TILE, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  };

  const place = (t) => {
    const action = primary();
    if (!t || !action) {
      if (!prompt.hidden) prompt.hidden = true;
      return;
    }
    const text = wordsOf(action, t);
    // Note: only the F action is named on the floor; the side panel lists the rest.
    const cap2 = text;
    if (words.textContent !== cap2) words.textContent = cap2;
    if (prompt.hidden) prompt.hidden = false;
    const w = prompt.offsetWidth || 140;
    const hgt = prompt.offsetHeight || 28;
    const at = promptSpot({ room, cell, box: { w, h: hgt }, target: t.rect ? { rect: t.rect } : { at: t.at }, sheriff: scene.sheriff });
    prompt.style.left = `${at.left}px`;
    prompt.style.top = `${at.top}px`;
    prompt.style.transform = 'none';
  };

  const sync = () => {
    const t = scene.context;
    const id = t ? `${t.id}|${t.actions.map((a) => a.id).join(',')}` : '';
    if (id === shown) return;
    shown = id;
    if (t) {
      const a = primary();
      const name = t.actor ? scene.describe(t.actor) : t.label;
      live.textContent = a ? `${name}. Press F to ${wordsOf(a, t).toLowerCase()}.` : name;
    } else live.textContent = '';
    if (opts.onContext) opts.onContext(t);
  };

  const render = (now) => {
    g.drawImage(floor, 0, 0);
    const all = [...scene.actors, scene.sheriff].sort((a, b) => a.y - b.y);
    for (const a of all) drawActor(a, now);
    // Note: the hour is looked at about once a second; the baked shade is made again only when the mood changes.
    if (now - moodAt > 1 || moodAt > now) {
      moodAt = now;
      const next = moodNow();
      if (next !== mood) {
        mood = next;
        dusk = bakeDusk(room, TILE, mood);
      }
    }
    drawDusk(g, dusk);
    drawGlows(g, room, TILE, now, calm, mood);
    drawFixtures(g, room, TILE, now, calm);
    if (scene.context) mark(scene.context, now);
    sync();
    place(scene.context);
  };

  let floorT = 0;
  const frame = (now) => {
    raf = 0;
    if (!canvas.isConnected) {
      // Note: the lock does not end with the canvas, so a floor that left the page gives the mouse back.
      ptr.release();
      return;
    }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    const idle = idleNow();
    if (handsOff()) ptr.release();
    if (idle) {
      keys.clear();
      goal = null;
    } else {
      scene.step(dt, input());
      // Note: item 341: the floor's own sounds under the piano, at one level wherever the sheriff stands.
      for (const name of floorCues(floorT, floorT + dt)) if (opts.sound) opts.sound(name, { level: FLOOR.level });
      floorT += dt;
      if (scene.sheriff.dist - stepAt >= 0.7) {
        stepAt = scene.sheriff.dist;
        if (opts.sound) opts.sound('footstep');
      }
    }
    render(now / 1000);
  };

  return {
    el: wrap,
    canvas,
    live,
    pointer: ptr,
    // Note: safe to call after every redraw; it only starts a loop that is not running.
    start() {
      if (raf || !canvas.isConnected) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    focus() {
      wrap.focus({ preventScroll: true });
    },
    render(now = 0) {
      render(now);
    },
    use,
    destroy() {
      this.stop();
      ptr.destroy();
      if (media && media.removeEventListener) media.removeEventListener('change', onMedia);
    },
  };
}
