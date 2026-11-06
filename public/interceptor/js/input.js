// Note: keyboard by physical key (e.code) and mouse in game pixels; edge presses are cleared each frame.

const BLOCK = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash']);

export class Input {
  constructor(stage, viewW, viewH) {
    this.stage = stage;
    this.viewW = viewW;
    this.viewH = viewH;
    this.keys = new Set();
    this.hits = new Set();
    this.mouse = { x: viewW / 2, y: viewH / 2, down: false, clicked: false, rclicked: false };
    this.enabled = true;
    this.onKey = this.onKey.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onBlur = () => this.keys.clear();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('blur', this.onBlur);
    this.onContext = (e) => {
      if (this.enabled) e.preventDefault();
    };
    window.addEventListener('contextmenu', this.onContext);
  }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onKey(e) {
    if (!this.enabled || this.typing(e)) return;
    if (BLOCK.has(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this.hits.add(e.code);
    this.keys.add(e.code);
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  onMove(e) {
    const r = this.stage.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width) * this.viewW;
    this.mouse.y = ((e.clientY - r.top) / r.height) * this.viewH;
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.target.closest && e.target.closest('button, a, input, .panel')) return;
    this.onMove(e);
    if (e.button === 0) {
      this.mouse.down = true;
      this.mouse.clicked = true;
    } else if (e.button === 2) {
      this.mouse.rclicked = true;
    }
  }

  onUp(e) {
    if (e.button === 0) this.mouse.down = false;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.hits.has(c));
  }

  // Note: digits from the top row or the numpad.
  digit() {
    for (let i = 1; i <= 9; i++) if (this.hits.has(`Digit${i}`) || this.hits.has(`Numpad${i}`)) return i;
    return 0;
  }

  endFrame() {
    this.hits.clear();
    this.mouse.clicked = false;
    this.mouse.rclicked = false;
  }

  clear() {
    this.keys.clear();
    this.hits.clear();
    this.mouse.down = false;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContext);
  }
}
