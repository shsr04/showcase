// Note: the stage of a duel: the ground, the people, the shots and the light drawn with the game's own painters, plus the two overlays and the input of the sheriff's own duel; nothing here decides a rule.
import { duelSounds } from './scene-sound.js';
import { TILE, SCALE } from '../config.js';
import { ensurePerson, personDesc, PERSON_SIZE } from '../sprites.js';
import { reducedMotion } from './cfx.js';
import { TICK } from './spectate.js';
import { el } from './saloon-view.js';
import { createScenePointer } from './scene-pointer.js';
import {
  ARENA_H, FALLBACK, LANE_ZOOM, buildArena, arenaMap, paintArena, paintLane, paintShadow, paintVeil,
} from './duel-arena.js';
import { RECOIL, actorOf, poseOf, since } from './duel-pose.js';
import { aimOf, bindDuelInput, homeOf, actOn } from './duel-input.js';
import { bindFit } from './duel-fit.js';
import { insetPlace, paintAim, paintInset, sizeInset } from './duel-overlay.js';
import { addShots, paintRevolver, paintShots, spotOf } from './duel-paint.js';
import { injectDuelStyle } from './duel-style.js';

// Note: the pure parts of the screen keep their old home for the modules and tests that import them from here.
export {
  ARENA_H, PAD, LANE, OPEN_ROWS, FLAT, buildArena, arenaMap, paintArena,
} from './duel-arena.js';
export { poseOf, outcomeOf, resultOf, fateOf, actorOf } from './duel-pose.js';
export {
  AIM_SPAN, aimOf, homeOf, actOn,
} from './duel-input.js';

// Note: feeds the sim from real time; a watched duel is stepped at the fixed tick, so what is seen is what the campaign commits.
export function feed(sim, clock, dt, watch) {
  if (!watch) {
    sim.step(Math.min(0.1, Math.max(0, dt)));
    return 1;
  }
  clock.acc = (clock.acc || 0) + Math.min(0.25, Math.max(0, dt));
  let steps = 0;
  while (clock.acc >= TICK - 1e-9 && !sim.done && steps < 12) {
    sim.step(TICK);
    clock.acc -= TICK;
    steps++;
  }
  return steps;
}

// Note: opts: win (the window to fit, the page's own by default), site (the venue), names, sides (looks), witnesses (false empties the edge), watch (both sides run by the sim), watcher (the sheriff stands at the edge), paused() holds the clock, onUnlock() hears the pointer lock end.
export function createDuelView(sim, opts = {}) {
  injectDuelStyle();
  const site = { ...FALLBACK, ...(opts.site || {}), distance: sim.spec.distance };
  const watch = !!opts.watch;
  const names = { player: opts.names?.player || sim.spec.name || 'You', opponent: opts.names?.opponent || sim.spec.opponent?.name || 'Opponent' };
  const arena = buildArena({ ...site, crowd: opts.witnesses === false ? 0 : site.crowd });
  const store = new Map();
  const shim = { textures: { exists: (key) => store.has(key), addCanvas: (key, c) => store.set(key, c), remove: (key) => store.delete(key) } };
  const size = Math.round((PERSON_SIZE * SCALE) / 2);
  const calm = reducedMotion();
  const W = arena.w * TILE;
  const H = arena.h * TILE;
  const map = arenaMap(arena);
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const floor = layer();
  paintArena(floor.getContext('2d'), arena, map);
  paintLane(floor.getContext('2d'), arena);
  const veil = layer();
  paintVeil(veil.getContext('2d'), W, H);
  const canvas = el('canvas', { class: 'duel-canvas', width: W, height: H, 'aria-hidden': 'true' });
  const g = canvas.getContext('2d');
  // Note: the two rings and the sight inset exist only in a duel the sheriff fights; a watched duel has no input and no overlay.
  const aimCanvas = watch ? null : el('canvas', { class: 'duel-aim', 'aria-hidden': 'true', hidden: true });
  const ag = aimCanvas ? aimCanvas.getContext('2d') : null;
  const insetCanvas = watch ? null : el('canvas', { class: 'duel-inset', 'aria-hidden': 'true', hidden: true });
  const sg = insetCanvas ? insetCanvas.getContext('2d') : null;
  // Note: both overlays belong to the window, not the stage: the sight ring stands at its middle, half its shorter side across, with the rings laid on it; each canvas is sized in CSS pixels and its backing store is that times the device pixel ratio, set when the window changes and never in a frame.
  const ring = { side: 1, dpr: 1, distance: sim.spec.distance };
  const aimBox = { side: 1, px: 1, distance: sim.spec.distance };
  const place = (canvas, left, top, side) => {
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${side}px`, height: `${side}px` });
  };
  const sizeOverlays = (box, dpr, vp) => {
    const at = insetPlace(vp.width, vp.height);
    // Note: the rings lie exactly on the sight picture, so both share its box and its scale.
    place(aimCanvas, at.left, at.top, at.side);
    aimBox.px = dpr;
    aimBox.side = Math.max(1, Math.round(at.side * dpr));
    aimCanvas.width = aimBox.side;
    aimCanvas.height = aimBox.side;
    ring.side = at.side;
    ring.dpr = dpr;
    sizeInset(insetCanvas, at.side, dpr);
    place(insetCanvas, at.left, at.top, at.side);
  };
  const label = watch ? `${names.player} and ${names.opponent} face each other ${site.label}. You watch from the edge.` : `Duel against ${names.opponent} ${site.label}. The controls are in the menu.`;
  // Note: the right button works on the stage alone (secondary-click.js), never on a menu or a sheet, which are not inside the field.
  const field = el('div', { class: 'duel-field', 'data-secondary-click': '' }, canvas);
  const wrap = el('div', { class: `duel-view${watch ? ' is-watch' : ''}`, tabindex: '-1', role: 'img', 'aria-label': label }, field, insetCanvas, aimCanvas);
  const win = opts.win || globalThis.window;
  const fit = bindFit(win, field, W / H, aimCanvas ? sizeOverlays : null);
  const actors = {
    player: actorOf({ role: opts.sides?.player?.role || (watch ? 'hostile' : 'sheriff'), name: names.player, reputation: opts.sides?.player?.reputation, face: opts.sides?.player?.face }),
    opponent: actorOf({ role: 'hostile', name: names.opponent, reputation: opts.sides?.opponent?.reputation ?? 30, face: opts.sides?.opponent?.face }),
  };
  const crowd = arena.crowd.map((c) => ({ ...c, actor: { role: 'civilian', id: c.id, kind: c.kind, wounds: [], weapons: [], cur: 0, status: 'ok' } }));
  const watcher = opts.watcher ? { x: arena.w / 2, y: arena.crowd[0]?.y ?? (site.side < 0 ? 3.5 : ARENA_H - 0.5), facing: site.side < 0 ? Math.PI / 2 : -Math.PI / 2, actor: { role: 'sheriff', id: 1, wounds: [], weapons: [], cur: 0, status: 'ok' } } : null;
  const sounds = duelSounds(sim, opts.sound || (() => {}));
  const clock = { acc: 0 };
  const fx = [];
  const seen = new Set();
  const look = { experience: actors.opponent.traits.experience, grass: site.ground === 'grass', kind: site.kind, seed: site.seed, calm, mood: opts.mood || 'day' };
  let last = 0;
  let after = 0;
  let heard = 1;
  // Note: a running warp is sent every frame (its heartbeat keeps time); quiet is for the ends a menu or the duel's close make, which carry no sound of their own.
  const setWarp = (speed, quiet = false) => {
    if (speed === heard && speed === 1) return;
    heard = speed;
    if (opts.warp) opts.warp(speed, quiet);
  };

  const tex = (actor, frame) => store.get(ensurePerson(shim, personDesc(actor, frame)));
  // Note: the two in the lane are drawn a little larger than the onlookers so they read at the size of the panel.
  const drawPerson = (a, x, y, facing, frame, kick = 0, zoom = 1.2) => {
    const t = tex(a, frame);
    if (!t) return;
    const px = size * zoom;
    g.save();
    g.translate(x * TILE + (frame.ox || 0) * SCALE, y * TILE + (frame.oy || 0) * SCALE);
    g.rotate(facing + (frame.rot || 0));
    g.scale(frame.scale || 1, frame.scale || 1);
    g.drawImage(t, -px / 2 - kick * TILE, -px / 2, px, px);
    g.restore();
  };
  const spot = (who) => spotOf(arena, who);

  const render = () => {
    const view = sim.view();
    addShots(fx, seen, arena, sim, view);
    g.drawImage(floor, 0, 0);
    const t = view.time + after;
    for (const who of ['player', 'opponent']) {
      if (view.weaponHeld[who]) continue;
      const p = spot(who);
      paintRevolver(g, p.x + (who === 'player' ? 0.9 : -0.9), p.y + 0.55, who === 'player' ? 0.5 : Math.PI - 0.4);
    }
    const front = view.shots.length > 0 || view.done;
    const mood = (c, i) => (front ? { act: 'cower', ph: (Math.floor(t * 2) + i) % 2 } : (i + Math.floor(t * 0.5)) % 4 === 0 ? { act: 'signal', ph: 5 } : {});
    crowd.forEach((c) => paintShadow(g, c.x, c.y));
    crowd.forEach((c, i) => drawPerson(c.actor, c.x, c.y, c.facing, mood(c, i)));
    if (watcher) {
      g.save();
      g.strokeStyle = 'rgba(255, 224, 130, 0.7)';
      g.lineWidth = Math.max(1.5, TILE / 24);
      g.beginPath();
      g.arc(watcher.x * TILE, watcher.y * TILE, 0.46 * TILE, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      paintShadow(g, watcher.x, watcher.y);
      drawPerson(watcher.actor, watcher.x, watcher.y, watcher.facing, { stow: 'handgun' });
    }
    const order = ['player', 'opponent'].sort((a, b) => (view[`${a}Status`] !== 'ok' ? 0 : 1) - (view[`${b}Status`] !== 'ok' ? 0 : 1));
    for (const who of order) {
      const frame = poseOf(view, who, t);
      const a = actors[who];
      a.wounds = frame.bloody ? [{ old: false }] : [];
      const p = spot(who);
      const facing = sim[who].facing;
      const kick = frame.act === 'recoil' ? 0.08 * (1 - since(view, who, false) / RECOIL) : 0;
      if (view[`${who}Status`] === 'ok') paintShadow(g, p.x, p.y, LANE_ZOOM);
      drawPerson(a, p.x, p.y, facing, frame, who === 'player' ? kick : -kick, LANE_ZOOM);
    }
    paintShots(g, fx, view, calm);
    g.drawImage(veil, 0, 0);
    if (!watch) {
      const sighted = view.player === 'drawn' && view.weaponHeld.player && !view.done;
      insetCanvas.hidden = !sighted;
      if (sighted) paintInset(sg, view, look, ring);
      aimCanvas.hidden = !sighted;
      if (sighted) paintAim(ag, view, aimBox);
    }
    return view;
  };

  // Note: the pointer is hidden and locked as on every scene (S7); it lives in tiles of the arena and feeds the inner ring.
  const room = { w: arena.w, h: arena.h };
  // Note: the play is held while the screen is paused, and then the mouse and the keys do nothing.
  const held = () => !!(opts.paused && opts.paused());
  // Note: the mouse alone may be held, while the clock runs, such as over the choice above a fallen opponent.
  const mouseHeld = () => held() || !!(opts.mouseOff && opts.mouseOff());
  const ptr = watch ? null : createScenePointer(canvas, room, {
    home: () => homeOf(sim.aim, room),
    paused: () => sim.done || held(),
    onUnlock: opts.onUnlock,
  });
  const act = (action) => (held() ? null : actOn(sim, action));
  const input = watch ? null : bindDuelInput({
    sim, canvas, pointer: ptr, room, act, focus: () => wrap.focus({ preventScroll: true }), held: mouseHeld,
  });

  return {
    el: wrap,
    names,
    pointer: ptr,
    // Note: the keys of the screen use these actions, the same as the mouse; a watched duel has none.
    act: (action) => (watch ? null : act(action)),
    // Note: asks for the pointer lock as a mouse press does; a refusal is not an error and the duel is played with the free pointer.
    lock() {
      if (ptr) ptr.capture({ pointerType: 'mouse' });
    },
    release() {
      if (ptr) ptr.release();
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    },
    // Note: the seconds the picture has run on since the exchange ended; the closing waits on it.
    after: () => after,
    // Note: one frame; the clock moves only when nothing holds it, then the picture is painted from the sim.
    tick(now) {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (!sim.done && !held()) feed(sim, clock, dt, watch);
      else if (sim.done && !held()) after += Math.min(0.25, Math.max(0, dt));
      // Note: the player's shot is fired by an input handler and can end the exchange before this tick, so the sounds are heard after the end too.
      if (!held()) sounds.update();
      // Note: item 448: the warp is heard on the music and the cues, and never into a menu or the next duel.
      setWarp(held() || sim.done ? 1 : sim.speed(), held() || sim.done);
      if (sim.done && ptr) ptr.release();
      return render();
    },
    render,
    // Note: a watched duel run out at the fixed tick ends exactly as the campaign will commit it.
    skip() {
      while (!sim.done) sim.step(TICK);
      sounds.update(true);
      return render();
    },
    focus: () => wrap.focus({ preventScroll: true }),
    // Note: every listener the view added is taken off, the lock is let go, and the pictures are dropped.
    destroy() {
      setWarp(1, true);
      if (input) input.dispose();
      fit.dispose();
      if (ptr) ptr.destroy();
      fx.length = 0;
      store.clear();
    },
  };
}
