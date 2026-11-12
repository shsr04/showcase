// Note: right click is dead everywhere but in play: the browser menu never opens and no right press reaches a menu, a dialog or a map.
// Note: play is the pointer-locked page, the Quick Breach stage (#stage) and any element marked data-secondary-click, which a scene sets on its stage only, never on its menus.

const TYPES = ['contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick'];

export const isPlay = (doc, target) => !!doc.pointerLockElement || !!(target && target.closest && target.closest('#stage, [data-secondary-click]'));

const secondary = (e) => e.type === 'contextmenu' || e.button === 2;

// Note: capture on the document so nothing below it sees the press; returns the function that removes the guard.
export function guardSecondaryClick(doc = document) {
  const stop = (e) => {
    const dead = secondary(e) && !isPlay(doc, e.target);
    if (dead) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  TYPES.forEach((type) => doc.addEventListener(type, stop, true));
  return () => TYPES.forEach((type) => doc.removeEventListener(type, stop, true));
}
