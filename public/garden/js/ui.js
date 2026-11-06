// Note: pictogram toolbar with hand, brush size, time dial, history, mute and settings.

import { shareUrl } from './save.js';

const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  raise: P('M3 19 L9 9 L13 15 L16 11 L21 19 Z') + P('M12 3 V8 M9.5 5.5 L12 3 L14.5 5.5'),
  dig: P('M2 13 H8 L12 20 L16 13 H22') + P('M12 3 V12 M9 9 L12 12 L15 9'),
  water: P('M12 3 C12 3 5.5 10 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 10 12 3 12 3 Z') + P('M9 15 A3 3 0 0 0 12 18'),
  fire: P('M12 3 C13 7 18 9 18 15 A6 6 0 0 1 6 15 C6 12 8 10.5 9 8.5 C9.5 10 10.5 10.5 11 10.5 C11.5 8 11 5.5 12 3 Z') + P('M12 20 A2.6 2.6 0 0 1 9.6 16.5 C10 15.5 11 15 11.5 14 C12.5 15 14.4 15.5 14.4 17.4 A2.6 2.6 0 0 1 12 20 Z'),
  clear: P('M10 11 L13 14 L7 21 L3 19 Z') + P('M12.5 12.5 L20 5'),
  rain: P('M7 15 A4 4 0 0 1 7.5 7 A5.5 5.5 0 0 1 18 8.5 A3.3 3.3 0 0 1 17.5 15 Z') + P('M8 18 L7 21 M12 18 L11 21 M16 18 L15 21'),
  wind: P('M3 9 H13.5 A2.5 2.5 0 1 0 11 6.5') + P('M3 13 H17.5 A3 3 0 1 1 14.5 16') + P('M3 17 H8'),
  sun: '<circle cx="12" cy="12" r="4"/>' + P('M12 3 V5.5 M12 18.5 V21 M3 12 H5.5 M18.5 12 H21 M5.6 5.6 L7.4 7.4 M16.6 16.6 L18.4 18.4 M18.4 5.6 L16.6 7.4 M5.6 18.4 L7.4 16.6'),
  snow: P('M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5') + P('M9.5 4.8 L12 7 L14.5 4.8 M9.5 19.2 L12 17 L14.5 19.2'),
  tree: '<circle cx="12" cy="9" r="5.5"/>' + P('M12 14.5 V21 M9 21 H15'),
  wheat: P('M12 21 V3.5') + P('M12 9 C9.5 8.5 8.5 6.5 8.5 5 C10.5 5.3 12 7 12 9 Z M12 9 C14.5 8.5 15.5 6.5 15.5 5 C13.5 5.3 12 7 12 9 Z') + P('M12 14 C9.5 13.5 8.5 11.5 8.5 10 C10.5 10.3 12 12 12 14 Z M12 14 C14.5 13.5 15.5 11.5 15.5 10 C13.5 10.3 12 12 12 14 Z'),
  flower: '<circle cx="12" cy="9" r="1.8"/><circle cx="12" cy="4.9" r="2.3"/><circle cx="12" cy="13.1" r="2.3"/><circle cx="7.9" cy="9" r="2.3"/><circle cx="16.1" cy="9" r="2.3"/>' + P('M12 15.5 V21') + P('M12 19 C9 19 8 17 8 15.5 C10.5 15.5 12 17 12 19 Z'),
  bush: P('M4 19 A4.5 4.5 0 0 1 7 11 A5 5 0 0 1 17 11 A4.5 4.5 0 0 1 20 19 Z') + '<circle cx="9" cy="15" r="0.8"/><circle cx="14" cy="13.5" r="0.8"/><circle cx="16" cy="17" r="0.8"/>',
  vine: P('M8 21 C8 17 15 17 15 13 C15 9 8 9 8 5') + P('M8 5 C9 3 11.5 3 12.5 4.5 C11 6 9 6 8 5 Z') + P('M15 13 C16.5 11.5 18.5 12 19 13.5 C17.5 14.5 16 14.5 15 13 Z'),
  reed: P('M8 21 C8 14 7 9 6.5 5 M12 21 V3 M16 21 C16 14 17 9 17.5 5') + '<ellipse cx="12" cy="6" rx="1.6" ry="3.2"/>' + P('M4 21 H20'),
  undo: P('M9 6 L4 11 L9 16') + P('M4 11 H15 A5 5 0 0 1 15 21 H10'),
  redo: P('M15 6 L20 11 L15 16') + P('M20 11 H9 A5 5 0 0 0 9 21 H14'),
  hand: P('M8 12 V5.5 A1.5 1.5 0 0 1 11 5.5 V11 M11 10 V4.5 A1.5 1.5 0 0 1 14 4.5 V11 M14 10 V6 A1.5 1.5 0 0 1 17 6 V14 C17 18.5 14.5 21 11.5 21 C9 21 7.5 19.5 6 17 L3.5 12.5 A1.5 1.5 0 0 1 6 11 L8 14'),
  soundOn: P('M4 9 H8 L13 5 V19 L8 15 H4 Z') + P('M16 9 A4 4 0 0 1 16 15 M18.5 6.5 A8 8 0 0 1 18.5 17.5'),
  soundOff: P('M4 9 H8 L13 5 V19 L8 15 H4 Z') + P('M16 9 L21 15 M21 9 L16 15'),
  gear: P('M12 2.5 L13.6 5 L16.3 4.2 L17 6.9 L19.8 7.4 L19 10.1 L21 12 L19 13.9 L19.8 16.6 L17 17.1 L16.3 19.8 L13.6 19 L12 21.5 L10.4 19 L7.7 19.8 L7 17.1 L4.2 16.6 L5 13.9 L3 12 L5 10.1 L4.2 7.4 L7 6.9 L7.7 4.2 L10.4 5 Z') + '<circle cx="12" cy="12" r="3"/>',
  home: P('M3 11 L12 3 L21 11') + P('M5.5 9.5 V20 H18.5 V9.5') + P('M10 20 V14 H14 V20'),
  b0: '<circle cx="12" cy="12" r="3"/>',
  b1: '<circle cx="12" cy="12" r="5.5"/>',
  b2: '<circle cx="12" cy="12" r="8.5"/>',
  copy: P('M9 9 H20 V20 H9 Z') + P('M15 9 V4 H4 V15 H9'),
};

export const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const LAND = [['hand', 'Move the view (space)'], ['raise', 'Raise land'], ['dig', 'Dig'], ['water', 'Water'], ['fire', 'Fire'], ['clear', 'Clear']];
const SKY = [['rain', 'Rain'], ['wind', 'Wind'], ['sun', 'Sun'], ['snow', 'Snow']];
export const BRUSHES = [1.3, 2.3, 3.7];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function createUI(root, { state, tools, audio, cam, getWorld, newSky, goSeed, showHint = true }) {
  root.innerHTML = '';
  const ui = el('div', 'ui');
  root.appendChild(ui);

  const btn = (name, label, cls = '') => {
    const b = el('button', `ib ${cls}`, svg(name));
    b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
    return b;
  };

  // Note: top-left home link, top-right cluster.
  const home = el('a', 'ib home', svg('home'));
  home.href = '../'; home.title = 'Back to the shelf'; home.setAttribute('aria-label', 'Back to the shelf');
  ui.appendChild(home);

  const cluster = el('div', 'cluster');
  const undoB = btn('undo', 'Undo');
  const redoB = btn('redo', 'Redo');
  const muteB = btn('soundOn', 'Sound');
  const gearB = btn('gear', 'Settings');
  cluster.append(undoB, redoB, muteB, gearB);
  ui.appendChild(cluster);

  const bar = el('div', 'bar');
  const land = el('div', 'group'); const sky = el('div', 'group');
  const toolBtns = {};
  for (const [id, label] of LAND) { const b = btn(id, label, 'tool'); b.dataset.tool = id; land.appendChild(b); toolBtns[id] = b; }
  for (const [id, label] of SKY) { const b = btn(id, label, 'tool sky'); b.dataset.tool = id; sky.appendChild(b); toolBtns[id] = b; }
  const brushB = btn('b1', 'Brush size', 'brush');
  const dial = el('div', 'dial');
  dial.setAttribute('role', 'slider'); dial.setAttribute('aria-label', 'Time of day'); dial.title = 'Time of day';
  const thumb = el('div', 'thumb');
  dial.appendChild(thumb);
  bar.append(land, el('i', 'sep'), sky, el('i', 'sep'), brushB, dial);
  ui.appendChild(bar);

  const set = el('div', 'pop settings');
  const seedRow = el('div', 'row');
  const seedIn = el('input'); seedIn.type = 'text'; seedIn.maxLength = 32; seedIn.spellcheck = false; seedIn.setAttribute('aria-label', 'Sky seed');
  const goB = el('button', 'tx', 'Go'); goB.type = 'button';
  const cpB = btn('copy', 'Copy link', 'sm');
  seedRow.append(seedIn, goB, cpB);
  const newB = el('button', 'tx wide', 'New Sky'); newB.type = 'button';
  const note = el('p', 'note', 'Same seed, same sky. Progress is saved in this browser.');
  set.append(seedRow, newB, note);
  ui.appendChild(set);

  const hint = el('div', 'hint', 'Paint with one finger or the left button. Two fingers or right drag move the view.');
  ui.appendChild(hint);

  // Note: behaviours.
  // Note: the hand is a tool; state.tool keeps the last paint tool so space can toggle back.
  function paintTool() { for (const k in toolBtns) toolBtns[k].classList.toggle('on', state.hand ? k === 'hand' : k === state.tool); }
  function setTool(id) {
    if (id === 'hand') state.hand = true;
    else { state.tool = id; state.hand = false; }
    document.body.classList.toggle('hand', state.hand);
    paintTool();
    audio.event('tool', { gain: 0.5 });
  }
  function setBrush(i) {
    state.brushIdx = i; state.brush = BRUSHES[i];
    brushB.innerHTML = svg(`b${i}`);
  }
  function setHand(v) { state.hand = !!v; document.body.classList.toggle('hand', state.hand); paintTool(); }
  function toggleMute() { audio.setMuted(!audio.isMuted()); muteB.innerHTML = svg(audio.isMuted() ? 'soundOff' : 'soundOn'); muteB.classList.toggle('on', audio.isMuted()); }
  function closeMenus() { set.classList.remove('open'); }

  for (const b of Object.values(toolBtns)) b.addEventListener('click', () => { setTool(b.dataset.tool); set.classList.remove('open'); });
  brushB.addEventListener('click', () => setBrush((state.brushIdx + 1) % 3));
  undoB.addEventListener('click', () => tools.undo());
  redoB.addEventListener('click', () => tools.redo());
  muteB.addEventListener('click', toggleMute);
  gearB.addEventListener('click', () => { seedIn.value = getWorld().seedStr; set.classList.toggle('open'); });
  goB.addEventListener('click', () => { const s = seedIn.value.trim(); if (s && s !== getWorld().seedStr) goSeed(s); });
  seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') goB.click(); });
  cpB.addEventListener('click', async () => {
    const u = shareUrl(getWorld().seedStr);
    try { await navigator.clipboard.writeText(u); cpB.classList.add('done'); setTimeout(() => cpB.classList.remove('done'), 1200); } catch (e) { seedIn.value = u; seedIn.select(); }
  });
  let armed = 0;
  newB.addEventListener('click', () => {
    if (!armed) { armed = setTimeout(() => { armed = 0; newB.textContent = 'New Sky'; newB.classList.remove('arm'); }, 3000); newB.textContent = 'Really? Tap again'; newB.classList.add('arm'); return; }
    clearTimeout(armed); armed = 0; newB.textContent = 'New Sky'; newB.classList.remove('arm');
    set.classList.remove('open');
    newSky();
  });

  // Note: dial: angle from top, clockwise; top = noon, bottom = midnight.
  let dragging = false;
  const dialAt = (e) => {
    const r = dial.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    let tod = 0.5 + a / (Math.PI * 2);
    tod = ((tod % 1) + 1) % 1;
    getWorld().setTod(tod);
  };
  dial.addEventListener('pointerdown', (e) => { dragging = true; dial.setPointerCapture(e.pointerId); audio.start(); dialAt(e); });
  dial.addEventListener('pointermove', (e) => { if (dragging) dialAt(e); });
  dial.addEventListener('pointerup', () => { dragging = false; });
  dial.addEventListener('pointercancel', () => { dragging = false; });

  setTool(state.hand ? 'hand' : state.tool);
  setBrush(state.brushIdx);

  if (showHint) {
    setTimeout(() => hint.classList.add('show'), 600);
    setTimeout(() => hint.classList.remove('show'), 11000);
  }

  return {
    setTool, setBrush, setHand, toggleMute, closeMenus,
    update(world) {
      const a = (world.tod - 0.5) * Math.PI * 2;
      const R = 0.36;
      thumb.style.left = `${50 + Math.sin(a) * R * 100}%`;
      thumb.style.top = `${50 - Math.cos(a) * R * 100}%`;
      thumb.classList.toggle('moon', world.night > 0.5);
      dial.setAttribute('aria-valuenow', world.tod.toFixed(2));
      undoB.disabled = !tools.undoStack.length;
      redoB.disabled = !tools.redoStack.length;
    },
    hideHint() { hint.classList.remove('show'); },
  };
}
