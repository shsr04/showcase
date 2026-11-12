// Note: the one table of the duel's controls; the keys that act, the pre-duel sheet, the menu and the tests all read it, and nothing else names a key.
// Note: keys holds the key as typed and then its mirror on the other side of the keyboard, so a hand on the mouse always has the other hand free.
export const KEYMAP = [
  { action: 'aim', label: 'Aim', mouse: 'Move', keys: [] },
  { action: 'fire', label: 'Fire', mouse: 'Left click', button: 0, keys: [' ', 'Enter'] },
  { action: 'draw', label: 'Draw, then cock the revolver', mouse: 'Right click', button: 2, keys: [] },
  { action: 'cock', label: 'Cock the hammer', keys: ['c', ','] },
  { action: 'fan', label: 'Fan the hammer', keys: ['f', 'j'] },
  { action: 'reload', label: 'Reload', keys: ['r', 'u'] },
  { action: 'pickup', label: 'Pick up the gun', keys: ['e', 'i'] },
  { action: 'stop', label: 'Ask him to stop, or walk away when he is down', keys: ['v', 'n'], final: false },
  { action: 'finish', label: 'Finish him when he is down', keys: ['g', 'h'] },
  { action: 'surrender', label: 'Surrender', keys: ['x', '.'], final: false },
  { action: 'skip', label: 'Skip to the end', keys: ['s', 'l'], watch: true },
  { action: 'menu', label: 'Menu', keys: ['Escape'] },
];

// Note: the name a key is shown by; one letter is shown as a capital.
const NAMES = { ' ': 'Space', Enter: 'Enter', Escape: 'Esc', ',': 'Comma', '.': 'Period' };
export const keyName = (key) => NAMES[key] || key.toUpperCase();

// Note: the rows a person is shown: a watched duel has only the skip and the menu, a fought one everything but the skip, and the final duel neither stop nor surrender (item 298).
export function controlRows(watch = false, final = false) {
  return KEYMAP.filter((row) => (watch ? row.watch || row.action === 'menu' : !row.watch) && !(final && row.final === false)).map((row) => ({
    action: row.action,
    label: row.label,
    mouse: row.mouse || '',
    key: row.keys.length ? keyName(row.keys[0]) : '',
    mirror: row.keys.length > 1 ? keyName(row.keys[1]) : '',
  }));
}

// Note: the action a key stands for in a fought or a watched duel, or null; a single key only, and never a function key.
export function actionOfKey(key, watch = false) {
  if (typeof key !== 'string' || key.length === 0) return null;
  const name = key.length === 1 ? key.toLowerCase() : key;
  const row = KEYMAP.find((r) => r.keys.includes(name) && (r.action === 'menu' || !!r.watch === watch));
  return row ? row.action : null;
}

// Note: the action of a mouse button in a fought duel, or null.
export const actionOfButton = (button) => KEYMAP.find((row) => row.button === button)?.action || null;
