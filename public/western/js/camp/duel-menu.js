// Note: the menu of an exchange: Resume, the controls, and Leave; it holds the clock while it is up and gives the pointer back, and nothing else of the duel is on the screen with it.
import { button, controlsTable, node } from './duel-screens.js';

const FOCUSABLE = 'button';

// Note: opts: watch (the watched duel's controls), resume(), leave() or null for no Leave button; the menu is built hidden and open() and close() show and hide it.
export function createMenu({ watch = false, final = false, resume, leave = null }) {
  const controls = controlsTable(watch, final);
  controls.hidden = true;
  const toggle = button('Controls', () => {
    controls.hidden = !controls.hidden;
    toggle.setAttribute('aria-expanded', String(!controls.hidden));
  }, { cls: 'ghost', key: 'duel-controls', aria: 'Show the controls' });
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'duel-controls');
  controls.setAttribute('id', 'duel-controls');
  const first = button('Resume', resume, { cls: 'primary', key: 'duel-resume', aria: 'Resume the duel', autofocus: true });
  const buttons = [first, toggle, leave ? button('Leave', leave, { cls: 'ghost', key: 'duel-leave', aria: 'Leave the duel' }) : null].filter((b) => b !== null);
  const el = node('div', { class: 'duel-menu', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Duel menu', hidden: true },
    node('h2', { class: 'duel-menu-h' }, 'Paused'),
    node('div', { class: 'duel-menu-buttons' }, buttons),
    controls);
  return {
    el,
    get isOpen() {
      return !el.hidden;
    },
    open() {
      el.hidden = false;
      first.focus();
    },
    close() {
      el.hidden = true;
      controls.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
    // Note: Tab goes round the buttons of the menu and never out of it.
    trap(event) {
      const list = [...el.querySelectorAll(FOCUSABLE)];
      const at = list.indexOf(document.activeElement);
      const to = event.shiftKey ? (at <= 0 ? list.length - 1 : at - 1) : (at === list.length - 1 ? 0 : at + 1);
      event.preventDefault();
      list[to].focus();
    },
  };
}
