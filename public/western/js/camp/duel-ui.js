// Note: the live duel as one mounted piece: it takes the window over, owns the view, its frame loop, the keys, the pointer lock, the menu and the closing sheet, and gives all of it back on dispose().
import { createDuelView } from './duel-view.js';
import { deadOf, resultOf } from './duel-pose.js';
import { awayScreen, button, finishChoice, liveScreen, sheetOf } from './duel-screens.js';
import { bindDuelKeys } from './duel-input.js';
import { KEYMAP, keyName } from './duel-keys.js';
import { createMenu } from './duel-menu.js';
import { FALL_T } from '../anim.js';

// Note: how long the closing sheet stays before the result is committed on its own; reduced motion shortens nothing.
export const CLOSE_MS = 1800;
// Note: the beat of stillness after a death, once the body has gone down, before the closing sheet comes.
export const DEATH_BEAT_S = 1.5;
// Note: the mouse button that draws the revolver, as the controls table names it.
const DRAW_MOUSE = KEYMAP.find((row) => row.action === 'draw').mouse;
// Note: the stop key also ends a duel whose opponent is down.
const STOP_KEY = keyName(KEYMAP.find((row) => row.action === 'stop').keys[0]);
const FINISH_KEY = keyName(KEYMAP.find((row) => row.action === 'finish').keys[0]);
// Note: why Finish him cannot be done now, in the words the choice panel says.
const NO_FINISH = { surrendered: 'You have given up.', dropped: `Pick up your revolver first (${keyName(KEYMAP.find((row) => row.action === 'pickup').keys[0])}).`, hands: 'Your hands cannot hold the revolver.', empty: `Reload first (${keyName(KEYMAP.find((row) => row.action === 'reload').keys[0])}).`, dry: 'No rounds left.' };
// Note: the actions that can clear a blocked finish while the choice is open.
const CLEARS = new Set(['reload', 'pickup', 'menu']);

// Note: what the sheriff's own revolver is doing, in words; the draw and the hammer are all said here as well as shown.
export function sheriffLine(view) {
  if (view.pickingUp.player) return 'Picking up your revolver…';
  if (!view.weaponHeld.player) return 'Your revolver is on the ground.';
  if (view.player === 'holstered') return `Your revolver is holstered. ${DRAW_MOUSE} to draw.`;
  if (view.player === 'drawing') return 'Drawing…';
  if (view.hammer.cocking) return 'Cocking…';
  return view.hammer.cocked ? 'Revolver drawn and cocked.' : 'Revolver drawn, hammer down. Cock it to fire.';
}

// Note: the sheriff's words under the stage; the ammunition is said once, as text, never as a gauge.
export const statusLine = (view, quick = false) => `${view.finishing ? (view.final ? `He is down. Finish him (${FINISH_KEY}). ` : `He is down. Finish him (${FINISH_KEY}) or walk away (${STOP_KEY}). `) : ''}${sheriffLine(view)} ${view.loaded} loaded · ${view.reserve} spare${quick ? '' : `${view.reloading ? ' · reloading' : ''}${view.surrendered ? ' · surrendered' : ''}`}`;

// Note: the line under the status that says what the last shot did, in the two names.
export function shotLine(view, names) {
  const e = view.lastEvent;
  const recent = e && view.time - e.time < 2;
  const other = e && e.who === 'player' ? names.opponent : names.player;
  const fired = recent ? `${e.who === 'player' ? names.player : names.opponent} fires${e.hit ? ` and hits ${other} in the ${e.hit}` : ' and misses'}.` : '';
  return `${fired}${!view.weaponHeld.opponent ? ` ${names.opponent} has dropped the revolver.` : ''}`;
}

// Note: a death holds the picture for the fall and the beat after it; any other end closes at once.
function holdOf(sim, view) {
  const report = sim.report();
  return deadOf(view, 'player', report) || deadOf(view, 'opponent', report) ? FALL_T + DEATH_BEAT_S : 0;
}

// Note: a button of the closing runs once, and the timer that would run the same commit is gone first.
const closingButton = (o, hold) => button(o.label, () => {
  hold();
  o.run();
}, { key: o.key, cls: o.cls, autofocus: o.autofocus, aria: o.aria });

// Note: the closing sheet takes the place of the result, its buttons run once each, and the one asked for first takes the focus.
function showSheet(result, { view, names, report, watch, buttons, hold }) {
  const made = buttons.map((o) => closingButton(o, hold));
  result.replaceChildren(sheetOf(resultOf(view, names, report, watch), made));
  const preferred = buttons.findIndex((b) => b.autofocus);
  const focused = made[Math.max(0, preferred)];
  if (focused) focused.focus();
}

// Note: opts: watch, names, site, witnesses, sides, sound, mood (the light of the hour, day by default), paused() and alive() as for the view; ending(report) gives { buttons, hold, escape } for the closing (escape() is what Escape does on the sheet); leave() adds Leave to the menu; focusOk(); quick (no shot line); win is the window to take over, the page's own by default.
export function mountDuel(sim, opts) {
  const watch = !!opts.watch;
  const win = opts.win || globalThis.window;
  let disposed = false;
  let closed = false;
  let menuOpen = false;
  let timer = 0;
  let raf = 0;
  let escape = null;
  // Note: true while the choice over a fallen opponent is open: the clock runs on, the mouse is held so the pointer stays free, and its own release is no reason for the menu.
  let choosing = false;
  const held = () => menuOpen || !!(opts.paused && opts.paused());
  const dv = createDuelView(sim, {
    sound: opts.sound, warp: opts.warp, mood: opts.mood, watch, watcher: watch, site: opts.site, names: opts.names, witnesses: opts.witnesses, sides: opts.sides, paused: held, mouseOff: () => choosing, win, onUnlock: () => (choosing ? null : openMenu()),
  });
  const screen = liveScreen({ view: dv.el, watch });
  const mark = (cls, on) => screen.el.classList.toggle(cls, on);
  // Note: items 356, 357, 359: over a fallen opponent the pointer is freed and the sheriff picks Finish him or Walk away; a finish he cannot fire says why.
  const answer = (action) => (action === 'finish' ? sim.finishOff() : sim.standDown());
  const choice = finishChoice({ final: !!sim.final, finishKey: FINISH_KEY, stopKey: STOP_KEY, act: answer });
  // Note: a watched duel has no choice to make; nobody finishes a man in it.
  if (!watch) screen.el.append(choice.el);
  const showChoice = (view) => {
    const open = !watch && !view.done && !!view.finishing;
    // Note: while open, the panel says what keeps the sheriff from finishing him, until it is cleared.
    if (open) choice.say.textContent = NO_FINISH[sim.finishBlock()] || '';
    if (open === choosing) return;
    choosing = open;
    choice.el.hidden = !open;
    if (open) {
      dv.release();
      choice.el.querySelector('button').focus();
    }
  };

  // Note: the menu stops the clock, brings the pointer back and takes the keys; Resume asks for the lock again, and a refusal leaves the free pointer.
  const openMenu = () => {
    if (disposed || closed || menuOpen || sim.done) return;
    menuOpen = true;
    mark('is-menu', true);
    dv.release();
    menu.open();
  };
  const closeMenu = () => {
    if (!menuOpen) return;
    menuOpen = false;
    mark('is-menu', false);
    menu.close();
    // Note: back to an open choice, the pointer stays free and the focus goes to its first button.
    if (choosing) {
      choice.el.querySelector('button').focus();
      return;
    }
    dv.lock();
    dv.focus();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    if (raf && globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame(raf);
    keys.dispose();
    dv.destroy();
    screen.el.remove();
  };
  const menu = createMenu({
    watch,
    final: !!sim.final,
    resume: closeMenu,
    leave: opts.leave ? () => {
      opts.leave();
      dispose();
    } : null,
  });
  screen.el.append(menu.el);
  menu.el.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') menu.trap(event);
  });
  const keys = bindDuelKeys({
    target: win,
    watch,
    live: () => !menuOpen && !closed,
    idle: () => !menuOpen && !!(opts.paused && opts.paused()),
    menu: () => {
      if (menuOpen) closeMenu();
      else if (closed && escape) escape();
      else openMenu();
    },
    // Note: while the choice is open, its two keys answer it, reloading and picking the revolver up still work so a blocked finish can be cleared, and Enter and Space go to the focused button.
    run: (action) => (choosing && (action === 'finish' || action === 'stop') ? answer(action) : choosing && !CLEARS.has(action) ? null : action === 'skip' ? dv.skip() : dv.act(action)),
    pass: (action) => choosing && action === 'fire',
  });

  const hold = () => clearTimeout(timer);
  const sheetButtons = () => screen.result.querySelector('.duel-buttons');
  const close = (view) => {
    closed = true;
    const report = sim.report();
    mark('is-over', true);
    dv.release();
    const end = opts.ending(report);
    escape = end.escape || null;
    showSheet(screen.result, { view, names: dv.names, report, watch, buttons: end.buttons, hold });
    if (end.hold) timer = setTimeout(end.hold, CLOSE_MS);
  };
  const frame = (now) => {
    if (disposed) return;
    if (!screen.el.isConnected || (opts.alive && !opts.alive())) {
      dispose();
      return;
    }
    const view = dv.tick(now);
    screen.shot.textContent = opts.quick ? '' : shotLine(view, dv.names);
    screen.status.textContent = watch ? '' : view.done ? 'The exchange is over.' : statusLine(view, !!opts.quick);
    showChoice(view);
    if (view.done && !closed && dv.after() >= holdOf(sim, view)) close(view);
    raf = requestAnimationFrame(frame);
  };
  document.body.append(screen.el);
  raf = requestAnimationFrame(frame);
  // Note: the lock is asked for while the click that began the duel still counts; a refusal is not an error.
  if (!watch) dv.lock();
  Promise.resolve().then(() => {
    if (!disposed && !menuOpen && (!opts.focusOk || opts.focusOk())) dv.focus();
  });

  return {
    el: awayScreen(),
    root: screen.el,
    sim,
    dv,
    menu,
    get disposed() {
      return disposed;
    },
    get menuOpen() {
      return menuOpen;
    },
    focus: () => dv.focus(),
    skip: () => dv.skip(),
    openMenu,
    closeMenu,
    dispose,
    // Note: a result the campaign did not accept; the reason is said, and the player picks the retry or the restart, nothing repeats on its own.
    refused(reason, again) {
      hold();
      screen.result.querySelector('.duel-verdict').textContent = `The result was not accepted: ${reason}`;
      sheetButtons().replaceChildren(...again.map((o) => closingButton(o, hold)));
    },
  };
}
