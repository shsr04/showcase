// Note: pointer, touch and keyboard input: one pointer paints, two pointers or right drag move the view.

import { clamp } from './rand.js';

const TOOL_KEYS = { 1: 'raise', 2: 'dig', 3: 'water', 4: 'fire', 5: 'clear', 6: 'rain', 7: 'wind', 8: 'sun', 9: 'snow' };

export function bindInput({ canvas, cam, tools, state, ui, audio }) {
  const ptrs = new Map();
  let mode = null; // Note: 'paint' | 'pan' | 'orbit' | 'pinch'
  let last = null;
  let pinch = null;
  const keys = new Set();

  const startAudio = () => audio.start();

  function pinchState() {
    const [a, b] = [...ptrs.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    startAudio();
    ui.closeMenus();
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (ptrs.size >= 2) {
      tools.cancel();
      mode = 'pinch';
      pinch = pinchState();
      return;
    }
    last = { x: e.clientX, y: e.clientY };
    tools.setPointer(e.clientX, e.clientY);
    if (e.button === 2) mode = e.shiftKey || e.ctrlKey ? 'pan' : 'orbit';
    else if (e.button === 1) mode = 'pan';
    else if (state.hand) mode = e.shiftKey ? 'orbit' : 'pan';
    else { mode = 'paint'; tools.down(); }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (e.pointerType === 'mouse' || mode === 'paint') tools.setPointer(e.clientX, e.clientY);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const h = canvas.clientHeight;
    if (mode === 'pinch' && ptrs.size >= 2) {
      const s = pinchState();
      cam.zoomBy(pinch.d / Math.max(10, s.d));
      let da = s.ang - pinch.ang; da = ((da + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      cam.rotate(-da, 0);
      cam.pan(s.cx - pinch.cx, s.cy - pinch.cy, h);
      pinch = s;
      return;
    }
    if (!last) return;
    const dx = e.clientX - last.x; const dy = e.clientY - last.y;
    last.x = e.clientX; last.y = e.clientY;
    if (mode === 'pan') cam.pan(dx, dy, h);
    else if (mode === 'orbit') cam.rotate(-dx * 0.006, dy * 0.005);
  });

  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (mode === 'paint') tools.up();
    if (ptrs.size === 0) { mode = null; last = null; pinch = null; if (e.pointerType !== 'mouse') tools.clearPointer(); }
    else if (ptrs.size === 1) {
      const [only] = [...ptrs.values()];
      mode = state.hand ? 'pan' : 'pan';
      last = { x: only.x, y: only.y };
      pinch = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && mode !== 'paint') tools.clearPointer(); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    startAudio();
    const f = Math.exp(clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0016));
    cam.zoomBy(f);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    startAudio();
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) tools.redo(); else tools.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); tools.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'q') cam.snap(1);
    else if (k === 'e') cam.snap(-1);
    else if (k === ' ') { e.preventDefault(); ui.setHand(!state.hand); }
    else if (k === 'm') ui.toggleMute();
    else if (k === '+' || k === '=') cam.zoomBy(0.85);
    else if (k === '-') cam.zoomBy(1.18);
    else if (k === '[') ui.setBrush(Math.max(0, state.brushIdx - 1));
    else if (k === ']') ui.setBrush(Math.min(2, state.brushIdx + 1));
    else if (TOOL_KEYS[k]) ui.setTool(TOOL_KEYS[k]);
    else keys.add(k);
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  return {
    poll(dt) {
      const rx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const fz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      if (rx || fz) cam.moveKeys(rx, fz, dt);
    },
  };
}
