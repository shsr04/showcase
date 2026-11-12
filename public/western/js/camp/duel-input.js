// Note: the pointer, the clicks and the keys of a duel, and nothing else; the sim is the only thing they touch.
import { actionOfButton, actionOfKey } from './duel-keys.js';

// Note: the mouse of a duel is a hidden pointer in tiles of the arena; its place across the picture is the aim, which the inner ring shows.
export const AIM_SPAN = { lateral: 6, height: 3 };
export const aimOf = (p, room) => ({ lateral: (p.x / room.w - 0.5) * AIM_SPAN.lateral, height: AIM_SPAN.height * (1 - p.y / room.h) });
export const homeOf = (aim, room) => ({ x: (aim.lateral / AIM_SPAN.lateral + 0.5) * room.w, y: (1 - aim.height / AIM_SPAN.height) * room.h });

// Note: the one place an action of the sheriff reaches the sim; the sim refuses what he cannot do yet.
export function actOn(sim, action) {
  // Note: the right button draws a holstered revolver and cocks a drawn one.
  if (action === 'draw') return sim.draws.player === null ? sim.draw('player') : sim.cock();
  if (action === 'fire') return sim.fire('player');
  if (action === 'fan') return sim.fire('player', { fan: true });
  if (action === 'cock') return sim.cock();
  if (action === 'reload') return sim.reloadWeapon('player');
  if (action === 'pickup') return sim.pickupWeapon();
  if (action === 'stop') return sim.standDown() || sim.stopFighting(false);
  if (action === 'finish') return sim.finishOff();
  if (action === 'surrender') return sim.stopFighting(true);
  return null;
}

// Note: the hidden pointer and the clicks of a duel the sheriff fights; held() tells while the play is paused, and then the mouse does nothing; dispose() takes the canvas listeners off, and the pointer's destroy() takes the rest.
export function bindDuelInput({ sim, canvas, pointer, room, act, focus, held = () => false }) {
  const follow = (e) => {
    if (held()) return;
    // Note: item 344: the mouse aims only once the gun is out; until then the hidden pointer stays on the aim, the centre, so the inner ring starts there after the draw.
    if (sim.draws.player === null) {
      pointer.home(homeOf(sim.aim, room));
      return;
    }
    const p = pointer.move(e);
    const a = aimOf(p, room);
    sim.aimed(a.lateral, a.height);
  };
  const press = (e) => {
    if (held()) return;
    follow(e);
    focus();
    pointer.capture(e);
    pointer.hold(e);
    const action = actionOfButton(e.button);
    if (action) act(action);
  };
  const noMenu = (e) => e.preventDefault();
  const mouse = [['pointermove', follow], ['pointerdown', press], ['contextmenu', noMenu]];
  for (const [type, fn] of mouse) pointer.listen(type, fn);
  return {
    dispose() {
      for (const [type, fn] of mouse) canvas.removeEventListener(type, fn);
    },
  };
}

// Note: the keys of a duel, heard by the window before anything else on the page, so no other screen sees a key the duel took; run(action) acts, menu() answers Escape, idle() tells whether something else holds the duel so that no key is taken, live() tells whether the other keys count (not while a menu or a sheet is up), and a key held down acts once.
export function bindDuelKeys({ target, watch, run, menu, live = () => true, idle = () => false, pass = () => false }) {
  const key = (event) => {
    // Note: a key with Ctrl, Alt or Meta is a shortcut of the browser or the system, so the duel leaves it alone.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Note: while something else on the page holds the duel (a card or a dialog over it), every key, Escape too, belongs to that.
    if (idle()) return;
    const action = actionOfKey(event.key, watch);
    // Note: pass leaves a key to the page, such as Enter or Space on a focused button.
    if (!action || (action !== 'menu' && !live()) || pass(action)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (action === 'menu') menu();
    else run(action);
  };
  target.addEventListener('keydown', key, true);
  return {
    dispose() {
      target.removeEventListener('keydown', key, true);
    },
  };
}
