// Note: keyboard by physical key (e.code) and mouse in game pixels; edge presses are cleared each frame.

// Note: Shift and Ctrl are toggles, not holds, so a stray Ctrl+W never costs the pace; C toggles crouching too (item 23).
// Note: every key the game uses is blocked from browser defaults, with or without Ctrl.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyQ', 'KeyE', 'KeyC', 'KeyR', 'KeyF', 'KeyV', 'KeyZ', 'KeyX', 'KeyT', 'KeyG', 'Tab', 'Space',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export class Input {
  constructor(stage, viewW, viewH) {
    this.stage = stage;
    this.viewW = viewW;
    this.viewH = viewH;
    this.keys = new Set();
    this.hits = new Set();
    this.mouse = { x: viewW / 2, y: viewH / 2, left: false, right: false };
    this.enabled = false;
    this.locked = false;
    this.crouched = false;
    this.onUnlock = null;
    this.onKey = this.onKey.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onLockChange = this.onLockChange.bind(this);
    this.onBlur = () => this.clear();
    this.onContext = (e) => {
      if (this.enabled) e.preventDefault();
    };
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('contextmenu', this.onContext);
    if (typeof document !== 'undefined') document.addEventListener('pointerlockchange', this.onLockChange);
  }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onKey(e) {
    if (!this.enabled || this.typing(e)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.hits.add(e.code);
    this.keys.add(e.code);
  }

  onKeyUp(e) {
    if (this.enabled && GAME_KEYS.has(e.code) && !this.typing(e)) e.preventDefault();
    this.keys.delete(e.code);
  }

  onMove(e) {
    const r = this.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (this.locked) {
      this.mouse.x = Math.max(0, Math.min(this.viewW, this.mouse.x + (e.movementX || 0) * this.viewW / r.width));
      this.mouse.y = Math.max(0, Math.min(this.viewH, this.mouse.y + (e.movementY || 0) * this.viewH / r.height));
    } else {
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.viewW;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.viewH;
    }
  }

  capture() {
    if (!this.enabled || this.locked || !this.stage.requestPointerLock) return;
    try {
      const request = this.stage.requestPointerLock();
      if (request && request.catch) request.catch(() => {});
    } catch (_) { /* Note: browsers may deny capture without a user gesture. */ }
  }

  release() {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.stage) document.exitPointerLock();
  }

  onLockChange() {
    const wasLocked = this.locked;
    this.locked = document.pointerLockElement === this.stage;
    if (this.locked && !this.enabled) {
      this.release();
      return;
    }
    if (wasLocked && !this.locked) {
      this.clear();
      if (this.onUnlock) this.onUnlock();
    }
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.target.closest && e.target.closest('button, a, input, .overlay')) return;
    if (!this.locked && this.stage.requestPointerLock && this.stage.contains(e.target)) {
      this.capture();
      return;
    }
    if (!this.locked) this.onMove(e);
    if (e.button === 0) this.mouse.left = true;
    else if (e.button === 2) this.mouse.right = true;
  }

  onUp(e) {
    if (e.button === 0) this.mouse.left = false;
    else if (e.button === 2) this.mouse.right = false;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.hits.has(c));
  }

  // Note: number keys select cover, hold, push and fall back, on both rows.
  command() {
    for (let n = 1; n <= 4; n++) if (this.hits.has(`Digit${n}`) || this.hits.has(`Numpad${n}`)) return n;
    return 0;
  }

  // Note: builds the sim input; aim is converted to world metres by the scene.
  snapshot(aimWorld) {
    const k = (...c) => this.down(...c);
    const toggleProne = this.hit('KeyX');
    // Note: going prone leaves the crouch; the sim leaves prone when crouch is set.
    if (toggleProne) this.crouched = false;
    if (this.hit('KeyC')) this.crouched = !this.crouched;
    return {
      move: { x: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), y: (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0) },
      toggleSprint: this.hit('ShiftLeft', 'ShiftRight'),
      toggleSlow: this.hit('ControlLeft', 'ControlRight'),
      crouch: this.crouched,
      toggleProne,
      lean: (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0),
      aim: aimWorld,
      fire: this.mouse.left,
      steady: this.mouse.right,
      reload: this.hit('KeyR'),
      knife: this.hit('KeyK'),
      dynamite: this.hit('KeyG'),
      switch: this.hit('Tab'),
      interact: this.hit('KeyF'),
      interactHeld: k('KeyF'),
      command: this.command(),
      toggleSignal: this.hit('KeyV'),
      toggleFarAim: this.hit('KeyZ'),
      resist: k('Space'),
    };
  }

  // Note: a new scene starts standing.
  resetStance() {
    this.crouched = false;
  }

  endFrame() {
    this.hits.clear();
  }

  clear() {
    this.keys.clear();
    this.hits.clear();
    this.mouse.left = false;
    this.mouse.right = false;
  }

  destroy() {
    this.release();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContext);
    if (typeof document !== 'undefined') document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
