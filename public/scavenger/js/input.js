// Note: keyboard, mouse (pointer lock), touch and gamepad folded into one control record per frame.

const THRUST_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'ControlLeft',
]);

const ACTION_KEYS = {
  KeyF: 'lamp', KeyG: 'stick', KeyV: 'ping', KeyH: 'help', KeyT: 'drift', KeyM: 'mute', KeyR: 'level', KeyP: 'hud', KeyN: 'nostalgia',
};

const dead = (v, d = 0.14) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;
    this.keys = new Set();
    this.yawAcc = 0;
    this.pitchAcc = 0;
    this.enabled = false;
    this.locked = false;
    this.sens = 0.0022;
    this.handlers = {};
    this.onLockChange = null;
    this.touch = {
      active: false, moveId: -1, lookId: -1, origin: [0, 0], vec: [0, 0], up: false, down: false, boost: false,
    };
    this.padPrev = [];
    this.dragging = false;
    this.takeover = false;
    this.attach();
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  fire(name) {
    const h = this.handlers[name];
    if (h) h();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.yawAcc = 0;
      this.pitchAcc = 0;
      this.dragging = false;
    }
  }

  requestLock() {
    if (this.touch.active) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (e) {
      // Note: pointer lock may be unavailable (embedded frames); drag-look still works.
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  attach() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat || e.metaKey || e.altKey) return;
      if (e.code in ACTION_KEYS) {
        if (!e.ctrlKey) this.fire(ACTION_KEYS[e.code]);
        return;
      }
      if (THRUST_KEYS.has(e.code) || e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keys.add(e.code);
        if (THRUST_KEYS.has(e.code)) this.takeover = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.yawAcc += e.movementX * this.sens;
        this.pitchAcc -= e.movementY * this.sens;
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (!this.locked) this.dragging = true;
      if (!this.locked) this.requestLock();
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.attachTouch();
  }

  attachTouch() {
    const root = this.touchRoot;
    if (!root) return;
    const t = this.touch;
    const bind = (btn, key) => {
      const down = (e) => {
        e.preventDefault();
        t[key] = true;
        btn.classList.add('is-down');
      };
      const up = (e) => {
        e.preventDefault();
        t[key] = false;
        btn.classList.remove('is-down');
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    };
    const tap = (btn, name) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.enabled) this.fire(name);
      });
    };
    for (const btn of root.querySelectorAll('[data-hold]')) bind(btn, btn.dataset.hold);
    for (const btn of root.querySelectorAll('[data-tap]')) tap(btn, btn.dataset.tap);
    const surface = this.canvas;
    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.enabled) return;
      t.active = true;
      const left = e.clientX < window.innerWidth * 0.4;
      if (left && t.moveId < 0) {
        t.moveId = e.pointerId;
        t.origin = [e.clientX, e.clientY];
        t.vec = [0, 0];
      } else if (t.lookId < 0) {
        t.lookId = e.pointerId;
        t.lastLook = [e.clientX, e.clientY];
      }
      try {
        surface.setPointerCapture(e.pointerId);
      } catch (err) {
        // Note: capture is optional; moves still arrive while the finger stays on the canvas.
      }
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId === t.moveId) {
        t.vec = [(e.clientX - t.origin[0]) / 60, (e.clientY - t.origin[1]) / 60];
      } else if (e.pointerId === t.lookId) {
        this.yawAcc += (e.clientX - t.lastLook[0]) * 0.0042;
        this.pitchAcc -= (e.clientY - t.lastLook[1]) * 0.0042;
        t.lastLook = [e.clientX, e.clientY];
      }
    });
    const end = (e) => {
      if (e.pointerId === t.moveId) {
        t.moveId = -1;
        t.vec = [0, 0];
      }
      if (e.pointerId === t.lookId) t.lookId = -1;
    };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);
  }

  pollPad(ctl) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    if (!pad) return;
    const b = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
    const edge = (i, name) => {
      const now = b(i) > 0.5;
      if (now && !this.padPrev[i]) this.fire(name);
      this.padPrev[i] = now;
    };
    ctl.mx += dead(pad.axes[0] || 0);
    ctl.mz -= dead(pad.axes[1] || 0);
    ctl.yawD += dead(pad.axes[2] || 0) * 0.028;
    ctl.pitchD -= dead(pad.axes[3] || 0) * 0.028;
    ctl.my += b(0) - b(1);
    ctl.roll += b(5) - b(4);
    if (b(7) > 0.3) ctl.boost = true;
    if (b(6) > 0.3) ctl.brake = true;
    edge(2, 'lamp');
    edge(3, 'stick');
    edge(9, 'drift');
    edge(8, 'help');
    edge(10, 'ping');
    if (Math.abs(ctl.mx) + Math.abs(ctl.mz) + Math.abs(ctl.my) > 0.2) this.takeover = true;
  }

  // Note: one control record per frame; look deltas are consumed here.
  poll() {
    const k = this.keys;
    const ctl = {
      mx: 0, my: 0, mz: 0, boost: false, brake: false, slow: false, roll: 0, yawD: 0, pitchD: 0,
    };
    if (!this.enabled) return ctl;
    if (k.has('KeyW') || k.has('ArrowUp')) ctl.mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ctl.mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ctl.mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ctl.mx -= 1;
    if (k.has('Space')) ctl.my += 1;
    if (k.has('KeyC') || k.has('ControlLeft')) ctl.my -= 1;
    if (k.has('KeyE')) ctl.roll += 1;
    if (k.has('KeyQ')) ctl.roll -= 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight')) ctl.boost = true;
    if (k.has('KeyX')) ctl.brake = true;
    ctl.yawD = this.yawAcc;
    ctl.pitchD = this.pitchAcc;
    this.yawAcc = 0;
    this.pitchAcc = 0;
    const t = this.touch;
    if (t.active) {
      const m = Math.hypot(t.vec[0], t.vec[1]);
      const s = m > 1 ? 1 / m : 1;
      ctl.mx += t.vec[0] * s;
      ctl.mz -= t.vec[1] * s;
      if (t.up) ctl.my += 1;
      if (t.down) ctl.my -= 1;
      if (t.boost) ctl.boost = true;
      if (m > 0.3 || t.up || t.down) this.takeover = true;
    }
    this.pollPad(ctl);
    return ctl;
  }

  consumeTakeover() {
    const v = this.takeover;
    this.takeover = false;
    return v;
  }
}
