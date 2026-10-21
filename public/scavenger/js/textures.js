// Note: procedural texture bank; every layer is drawn on a 256px canvas, alpha holds the emission mask.

import { L, LAYER_COUNT, LAYER_NAME_LIST } from './config.js';
import { mulberry32, pfbm2, hash2, u01 } from './rand.js';

export const TEX = 256;
const S = TEX;
const TAU = Math.PI * 2;

function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  return c;
}

function makeNoise(seed, freq, oct) {
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      out[y * S + x] = pfbm2(seed, (x / S) * freq, (y / S) * freq, freq, oct);
    }
  }
  return out;
}

class Ctx {
  constructor(bank, seed) {
    this.c = makeCanvas();
    this.g = this.c.getContext('2d', { willReadFrequently: true });
    this.ec = null;
    this.eg = null;
    this.rnd = mulberry32(seed);
    this.bank = bank;
    this.cutout = false;
  }

  // Note: lazily created emission-mask canvas; white pixels glow.
  em() {
    if (!this.ec) {
      this.ec = makeCanvas();
      this.eg = this.ec.getContext('2d', { willReadFrequently: true });
      this.eg.fillStyle = '#000';
      this.eg.fillRect(0, 0, S, S);
    }
    return this.eg;
  }

  r() {
    return this.rnd();
  }

  rr(a, b) {
    return a + (b - a) * this.rnd();
  }

  // Note: samples a periodic noise bank at integer pixel coordinates with wrap.
  n(k, x, y) {
    return this.bank[k][((y & (S - 1)) * S) + (x & (S - 1))];
  }

  // Note: per-pixel pass; fn(x, y, out) writes out[0..2] in 0..255.
  pixels(fn) {
    const img = this.g.getImageData(0, 0, S, S);
    const d = img.data;
    const o = [0, 0, 0];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        o[0] = d[i];
        o[1] = d[i + 1];
        o[2] = d[i + 2];
        fn(x, y, o, i);
        d[i] = o[0] < 0 ? 0 : o[0] > 255 ? 255 : o[0];
        d[i + 1] = o[1] < 0 ? 0 : o[1] > 255 ? 255 : o[1];
        d[i + 2] = o[2] < 0 ? 0 : o[2] > 255 ? 255 : o[2];
        d[i + 3] = 255;
      }
    }
    this.g.putImageData(img, 0, 0);
  }

  fill(color) {
    this.g.fillStyle = color;
    this.g.fillRect(0, 0, S, S);
  }

  // Note: runs a draw callback at wrap offsets so shapes crossing an edge tile seamlessly.
  wrap(x, y, w, h, fn, g = this.g) {
    const xs = [0];
    const ys = [0];
    if (x < 0 || x + w > S) xs.push(x < 0 ? S : -S);
    if (y < 0 || y + h > S) ys.push(y < 0 ? S : -S);
    for (const ox of xs) {
      for (const oy of ys) {
        g.save();
        g.translate(ox, oy);
        fn(g);
        g.restore();
      }
    }
  }

  speckle(count, colorFn, size = 1.2) {
    const g = this.g;
    for (let i = 0; i < count; i++) {
      const x = this.r() * S;
      const y = this.r() * S;
      g.fillStyle = colorFn(this.r());
      this.wrap(x, y, size, size, () => g.fillRect(x, y, size * (0.6 + this.r()), size * (0.6 + this.r())));
    }
  }

  scratches(count, len, color) {
    const g = this.g;
    g.lineWidth = 0.8;
    for (let i = 0; i < count; i++) {
      const x = this.r() * S;
      const y = this.r() * S;
      const a = this.r() * TAU;
      const l = len * (0.3 + this.r());
      g.strokeStyle = color(this.r());
      this.wrap(x - l, y - l, 2 * l, 2 * l, () => {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      });
    }
  }

  bolt(x, y, r = 2.6, base = '#14161a') {
    const g = this.g;
    this.wrap(x - r, y - r, 2 * r, 2 * r, () => {
      g.fillStyle = base;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU);
      g.fill();
    });
  }

  text(str, x, y, size, color, opts = {}) {
    const g = opts.em ? this.em() : this.g;
    g.save();
    g.font = `${opts.weight || 'bold'} ${size}px ${opts.font || '"VT323","Courier New",monospace'}`;
    g.textAlign = opts.align || 'left';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(str, x, y);
    g.restore();
  }
}

const rgbS = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const gray = (v, a = 1) => rgbS(v, v, v, a);

// Note: draws a panel grid with seams, bevels and bolts; used by several plate layers.
function panels(c, size, base, vary, seam, bolts = true) {
  const g = c.g;
  const n = S / size;
  for (let py = 0; py < n; py++) {
    for (let px = 0; px < n; px++) {
      const h = u01(hash2(px * 31 + 7, py * 17 + 3));
      const v = 1 + (h - 0.5) * vary;
      g.fillStyle = rgbS(base[0] * v, base[1] * v, base[2] * v);
      g.fillRect(px * size, py * size, size, size);
    }
  }
  g.fillStyle = seam;
  for (let i = 0; i < n; i++) {
    g.fillRect(i * size, 0, 2, S);
    g.fillRect(0, i * size, S, 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < n; i++) {
    g.fillRect(i * size + 2, 0, 1, S);
    g.fillRect(0, i * size + 2, S, 1);
  }
  if (bolts) {
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const o = 7;
        c.bolt(px * size + o, py * size + o, 2.3);
        c.bolt(px * size + size - o + 2, py * size + o, 2.3);
        c.bolt(px * size + o, py * size + size - o + 2, 2.3);
        c.bolt(px * size + size - o + 2, py * size + size - o + 2, 2.3);
      }
    }
  }
}

function dirt(c, strength, tintBias = [0, 0, 0]) {
  c.pixels((x, y, o) => {
    const a = c.n(0, x, y);
    const b = c.n(1, x + 71, y + 33);
    const f = c.n(2, x, y);
    const streak = c.n(1, x * 0.25 + 13, y * 2 + 5);
    const k = 1 - strength * (0.55 * a + 0.45 * b * streak);
    const grain = 0.94 + 0.12 * f;
    o[0] = o[0] * k * grain + tintBias[0] * (1 - k);
    o[1] = o[1] * k * grain + tintBias[1] * (1 - k);
    o[2] = o[2] * k * grain + tintBias[2] * (1 - k);
  });
}

const GEN = {};

GEN.PLATE_DARK = (c) => {
  c.fill('#2b2e33');
  panels(c, 128, [44, 47, 52], 0.3, 'rgba(0,0,0,0.75)');
  c.scratches(26, 40, (r) => (r < 0.5 ? 'rgba(210,215,220,0.14)' : 'rgba(0,0,0,0.25)'));
  dirt(c, 0.55, [8, 8, 7]);
};

GEN.PLATE_LIGHT = (c) => {
  c.fill('#a9a597');
  panels(c, 128, [168, 163, 150], 0.18, 'rgba(40,36,30,0.7)');
  c.speckle(120, (r) => (r < 0.5 ? 'rgba(60,50,30,0.35)' : 'rgba(255,255,255,0.15)'), 1.6);
  dirt(c, 0.5, [40, 30, 14]);
};

GEN.PLATE_RUST = (c) => {
  c.fill('#34302d');
  panels(c, 128, [52, 48, 46], 0.3, 'rgba(0,0,0,0.75)');
  c.pixels((x, y, o) => {
    const a = c.n(0, x + 11, y + 40);
    const b = c.n(1, x * 1.1, y * 1.1);
    const m = Math.max(0, Math.min(1, (a * 0.65 + b * 0.5 - 0.42) * 3.2));
    const rust = [118 + 60 * c.n(2, x, y), 56 + 34 * b, 22 + 10 * a];
    o[0] = o[0] * (1 - m) + rust[0] * m;
    o[1] = o[1] * (1 - m) + rust[1] * m;
    o[2] = o[2] * (1 - m) + rust[2] * m;
  });
  c.scratches(10, 30, () => 'rgba(0,0,0,0.3)');
  dirt(c, 0.4, [10, 6, 4]);
};

GEN.GRATING = (c) => {
  c.fill('#050506');
  const g = c.g;
  const pitch = 32;
  for (let y = 0; y < S; y += pitch) {
    g.fillStyle = '#6e7176';
    g.fillRect(0, y, S, 6);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, y, S, 1);
  }
  for (let x = 0; x < S; x += pitch) {
    g.fillStyle = '#54575c';
    g.fillRect(x, 0, 4, S);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x, 0, 1, S);
  }
  c.pixels((x, y, o) => {
    const k = 0.7 + 0.5 * c.n(1, x, y);
    o[0] *= k;
    o[1] *= k;
    o[2] *= k;
  });
};

GEN.HAZARD = (c) => {
  const g = c.g;
  c.fill('#17171a');
  const w = 32;
  g.fillStyle = '#c9a117';
  for (let i = -S; i < S * 2; i += w * 2) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + w, 0);
    g.lineTo(i + w - S, S);
    g.lineTo(i - S, S);
    g.fill();
  }
  c.pixels((x, y, o) => {
    const a = c.n(0, x, y);
    const b = c.n(1, x + 5, y + 9);
    const chip = a * 0.6 + b * 0.5 > 0.78 ? 0.35 : 1;
    const k = (0.72 + 0.4 * b) * chip;
    o[0] *= k;
    o[1] *= k;
    o[2] *= k * 0.9;
  });
  c.scratches(20, 30, () => 'rgba(0,0,0,0.3)');
};

GEN.CORRUGATED = (c) => {
  c.pixels((x, y, o) => {
    const ridge = 0.55 + 0.45 * Math.cos((x / 16) * TAU);
    const k = 0.35 + 0.65 * ridge;
    const n = 0.8 + 0.4 * c.n(1, x, y);
    const rust = c.n(0, x, y * 0.4) > 0.66 ? 1 : 0;
    o[0] = 78 * k * n + rust * 26;
    o[1] = 82 * k * n + rust * 8;
    o[2] = 86 * k * n;
  });
  c.scratches(14, 60, () => 'rgba(0,0,0,0.25)');
  dirt(c, 0.5, [12, 8, 6]);
};

GEN.CONCRETE = (c) => {
  c.pixels((x, y, o) => {
    const a = c.n(0, x, y);
    const b = c.n(1, x, y);
    const f = c.n(2, x, y);
    const v = 112 + 40 * a + 22 * b + 18 * (f - 0.5);
    o[0] = v;
    o[1] = v * 0.98;
    o[2] = v * 0.94;
  });
  const g = c.g;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(0, 0, S, 2);
  g.fillRect(0, 0, 2, S);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      c.wrap(i * 64 + 30, j * 64 + 30, 6, 6, () => {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.beginPath();
        g.arc(i * 64 + 32, j * 64 + 32, 3.2, 0, TAU);
        g.fill();
      });
    }
  }
  c.speckle(260, (r) => (r < 0.7 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.12)'), 1.4);
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    let x = c.r() * S;
    let y = c.r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 14; k++) {
      x += c.rr(-9, 9);
      y += c.rr(2, 12);
      g.lineTo(x, y);
    }
    g.stroke();
  }
};

GEN.TILE = (c) => {
  const g = c.g;
  c.fill('#30343a');
  const n = 4;
  const t = S / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = u01(hash2(i * 13 + 5, j * 29 + 1));
      const v = 170 + 30 * (h - 0.5);
      g.fillStyle = rgbS(v, v + 4, v + 8);
      g.fillRect(i * t + 2, j * t + 2, t - 3, t - 3);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(i * t + 2, j * t + 2, t - 3, 1);
    }
  }
  c.scratches(24, 28, (r) => (r < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.2)'));
  dirt(c, 0.5, [20, 18, 12]);
};

GEN.CARPET = (c) => {
  const g = c.g;
  c.fill('#4a1f2a');
  const p = 64;
  for (let j = 0; j < S / p; j++) {
    for (let i = 0; i < S / p; i++) {
      const cx = i * p + p / 2;
      const cy = j * p + p / 2;
      g.fillStyle = '#2d3a4d';
      g.beginPath();
      g.moveTo(cx, cy - 26);
      g.lineTo(cx + 26, cy);
      g.lineTo(cx, cy + 26);
      g.lineTo(cx - 26, cy);
      g.fill();
      g.fillStyle = '#7a5a2a';
      g.beginPath();
      g.moveTo(cx, cy - 12);
      g.lineTo(cx + 12, cy);
      g.lineTo(cx, cy + 12);
      g.lineTo(cx - 12, cy);
      g.fill();
      g.strokeStyle = '#7a5a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 30, cy - 30);
      g.lineTo(cx + 30, cy + 30);
      g.moveTo(cx + 30, cy - 30);
      g.lineTo(cx - 30, cy + 30);
      g.stroke();
    }
  }
  c.pixels((x, y, o) => {
    const f = c.n(2, x * 2, y * 2);
    const d = c.n(0, x, y);
    const k = (0.72 + 0.5 * f) * (0.75 + 0.4 * d);
    o[0] *= k;
    o[1] *= k;
    o[2] *= k;
  });
};

GEN.WOOD = (c) => {
  c.pixels((x, y, o) => {
    const plank = Math.floor(x / 64);
    const h = u01(hash2(plank * 7 + 2, 9));
    const grain = c.n(1, x * 0.35 + plank * 40, y * 4 + plank * 17);
    const ring = 0.5 + 0.5 * Math.sin((c.n(0, x, y * 0.3) * 18 + grain * 4) * 3.1);
    const v = 0.55 + 0.35 * ring + 0.2 * (h - 0.5);
    o[0] = 122 * v;
    o[1] = 76 * v;
    o[2] = 42 * v;
    if (x % 64 < 2) {
      o[0] *= 0.25;
      o[1] *= 0.25;
      o[2] *= 0.25;
    }
  });
  c.scratches(10, 40, () => 'rgba(0,0,0,0.2)');
};

GEN.PIPE = (c) => {
  c.pixels((x, y, o) => {
    const u = x / S;
    const shade = 0.25 + 0.75 * Math.pow(Math.sin(u * Math.PI), 0.8);
    const hl = Math.pow(Math.max(0, Math.cos((u - 0.32) * Math.PI * 1.4)), 10) * 0.5;
    const band = (y % 128) < 6 || (y % 128) > 122 ? 0.55 : 1;
    const n = 0.85 + 0.3 * c.n(1, x, y);
    const v = (shade + hl) * band * n;
    o[0] = 120 * v;
    o[1] = 124 * v;
    o[2] = 128 * v;
  });
  c.speckle(100, () => 'rgba(150,70,25,0.5)', 1.6);
  c.scratches(8, 30, () => 'rgba(0,0,0,0.25)');
};

GEN.GLASS = (c) => {
  const g = c.g;
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, '#0d1a24');
  grd.addColorStop(0.5, '#101e2a');
  grd.addColorStop(1, '#09131b');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(180,220,255,0.07)';
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(90, 0);
  g.lineTo(S - 20, S);
  g.lineTo(S - 70, S);
  g.fill();
  g.fillStyle = '#2a2f35';
  g.fillRect(0, 0, S, 4);
  g.fillRect(0, 0, 4, S);
  g.fillRect(0, 126, S, 4);
  g.fillRect(126, 0, 4, S);
};

GEN.LIGHT_PANEL = (c) => {
  const g = c.g;
  g.fillStyle = '#fff6e8';
  g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, S * 0.75);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(255,200,150,0.55)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(S / 2 - 1, 0, 2, S);
  const e = c.em();
  e.fillStyle = '#fff';
  e.fillRect(0, 0, S, S);
};

function lamp(c, inner, outer) {
  const g = c.g;
  const grd = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.55, outer);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const e = c.em();
  e.fillStyle = '#fff';
  e.fillRect(0, 0, S, S);
}

GEN.LAMP_WARM = (c) => lamp(c, '#fffbe8', '#ffb260');
GEN.LAMP_COOL = (c) => lamp(c, '#ffffff', '#b6d6ff');
GEN.LAMP_RED = (c) => lamp(c, '#ffb0a0', '#ff2c18');
GEN.GLOW_WHITE = (c) => lamp(c, '#ffffff', '#ffffff');

function screen(c, fg, bg, lines) {
  const g = c.g;
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  const e = c.em();
  const words = ['LOAD', 'OK', 'SYS', 'NAV', 'PWR', 'TEMP', 'O2', 'LOG', 'SYNC', 'BUS', 'ERR', 'PING', 'CORE', 'HAB', 'DOCK'];
  for (let i = 0; i < lines; i++) {
    const y = 14 + (i * (S - 24)) / lines;
    const len = 3 + Math.floor(c.r() * 5);
    let s = i === 0 ? '> HELIOS-9 // SYS.LOG' : '';
    if (i > 0) {
      for (let k = 0; k < len; k++) s += words[Math.floor(c.r() * words.length)] + (c.r() < 0.5 ? ' ' : '.' + Math.floor(c.r() * 99) + ' ');
    }
    c.text(s.slice(0, 24), 8, y, 17, fg, { weight: 'normal' });
    c.text(s.slice(0, 24), 8, y, 17, '#fff', { weight: 'normal', em: true });
  }
  e.fillStyle = 'rgba(0,0,0,0.5)';
  for (let y = 0; y < S; y += 3) e.fillRect(0, y, S, 1);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  e.fillStyle = 'rgba(255,255,255,0.12)';
  e.globalCompositeOperation = 'lighter';
  e.fillRect(0, 0, S, S);
  e.globalCompositeOperation = 'source-over';
}

GEN.SCREEN_GREEN = (c) => screen(c, '#5dff8a', '#03150a', 13);
GEN.SCREEN_AMBER = (c) => screen(c, '#ffb43a', '#150b02', 13);

GEN.LED_RACK = (c) => {
  const g = c.g;
  c.fill('#15171b');
  const e = c.em();
  const rows = 16;
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    g.fillStyle = r % 4 === 0 ? '#23262c' : '#1b1d22';
    g.fillRect(2, y + 1, S - 4, h - 2);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(2, y + 1, S - 4, 1);
    for (let k = 0; k < 6; k++) {
      g.fillStyle = '#07080a';
      g.fillRect(150 + k * 14, y + 4, 10, h - 8);
    }
    for (let i = 0; i < 12; i++) {
      if (c.r() < 0.55) {
        const col = c.r();
        const color = col < 0.55 ? '#38ff6a' : col < 0.8 ? '#ffb02e' : col < 0.92 ? '#ff3a2a' : '#4aa8ff';
        g.fillStyle = color;
        g.fillRect(10 + i * 11, y + 6, 5, 4);
        e.fillStyle = '#fff';
        e.fillRect(10 + i * 11, y + 6, 5, 4);
      }
    }
  }
};

GEN.VENT = (c) => {
  const g = c.g;
  c.fill('#17181b');
  for (let y = 18; y < S - 18; y += 14) {
    g.fillStyle = '#4a4d52';
    g.fillRect(16, y, S - 32, 8);
    g.fillStyle = '#080808';
    g.fillRect(16, y + 8, S - 32, 3);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(16, y, S - 32, 1);
  }
  g.strokeStyle = '#3a3d42';
  g.lineWidth = 6;
  g.strokeRect(5, 5, S - 10, S - 10);
  for (const [x, y] of [[12, 12], [S - 12, 12], [12, S - 12], [S - 12, S - 12]]) c.bolt(x, y, 3.2);
  dirt(c, 0.4);
};

GEN.DOOR = (c) => {
  const g = c.g;
  c.fill('#4e5a54');
  panels(c, 256, [78, 90, 82], 0, 'rgba(0,0,0,0.7)', false);
  g.fillStyle = '#c9a117';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, S - 18);
    g.lineTo(i * 32 + 16, S - 18);
    g.lineTo(i * 32 + 8, S - 4);
    g.lineTo(i * 32 - 8, S - 4);
    g.fill();
  }
  g.fillStyle = '#07090b';
  g.beginPath();
  g.arc(S / 2, 84, 40, 0, TAU);
  g.fill();
  g.strokeStyle = '#2b3430';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = 'rgba(120,180,200,0.15)';
  g.beginPath();
  g.arc(S / 2 - 10, 74, 22, 0, TAU);
  g.fill();
  g.fillStyle = '#8a8f93';
  g.fillRect(S - 60, 130, 10, 38);
  c.text('04', S / 2, 168, 30, '#d8d2bf', { align: 'center' });
  c.scratches(14, 30, () => 'rgba(0,0,0,0.3)');
  dirt(c, 0.5, [10, 8, 4]);
};

function stripe(c, base, band, w) {
  const g = c.g;
  c.fill(base);
  g.fillStyle = band;
  g.fillRect(0, 100, S, w);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 100, S, 2);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 100 + w, S, 2);
  dirt(c, 0.45, [10, 8, 6]);
}

GEN.STRIPE_RED = (c) => stripe(c, '#9a968a', '#a02820', 44);
GEN.STRIPE_BLUE = (c) => stripe(c, '#9a9a94', '#2a4f8a', 44);

GEN.CABLES = (c) => {
  const g = c.g;
  c.fill('#0a0a0b');
  const cols = ['#161618', '#7a1f1a', '#1f3f7a', '#c9a117', '#2d2f33', '#3c6a3c', '#555a60'];
  let x = 0;
  while (x < S) {
    const w = 10 + Math.floor(c.r() * 8);
    g.fillStyle = cols[Math.floor(c.r() * cols.length)];
    g.fillRect(x, 0, w, S);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(x + 2, 0, 2, S);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + w - 2, 0, 2, S);
    x += w;
  }
  for (let y = 40; y < S; y += 128) {
    g.fillStyle = '#25272b';
    g.fillRect(0, y, S, 12);
  }
  dirt(c, 0.3);
};

function neon(c, color, glow, shapes) {
  const g = c.g;
  c.fill('#050407');
  const e = c.em();
  for (const draw of shapes) {
    for (const [ctx, col, w] of [[g, glow, 22], [g, glow, 12], [g, color, 5], [e, '#ffffff', 5]]) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = w > 10 ? 0.25 : 1;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      draw(ctx);
      ctx.restore();
    }
  }
}

GEN.NEON_PINK = (c) => neon(c, '#ffd0ee', '#ff2aa0', [
  (g) => { g.beginPath(); g.arc(S / 2, S / 2, 70, 0, TAU); g.stroke(); },
  (g) => { g.beginPath(); g.moveTo(30, 200); g.lineTo(90, 150); g.lineTo(130, 190); g.lineTo(226, 90); g.stroke(); },
]);
GEN.NEON_CYAN = (c) => neon(c, '#d8ffff', '#12d6ff', [
  (g) => { g.strokeRect(46, 46, 164, 164); },
  (g) => { g.beginPath(); g.moveTo(70, 128); g.lineTo(186, 128); g.moveTo(128, 70); g.lineTo(128, 186); g.stroke(); },
]);

GEN.FOLIAGE = (c) => {
  const g = c.g;
  c.cutout = true;
  g.clearRect(0, 0, S, S);
  const frond = (ang, len, w, shade) => {
    g.save();
    g.translate(S / 2, S - 4);
    g.rotate(ang);
    g.fillStyle = `rgb(${24 + shade * 20},${70 + shade * 60},${28 + shade * 18})`;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w, -len * 0.5, 0, -len);
    g.quadraticCurveTo(-w, -len * 0.5, 0, 0);
    g.fill();
    g.strokeStyle = `rgba(160,220,140,0.5)`;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -len * 0.95);
    g.stroke();
    g.restore();
  };
  for (let i = 0; i < 26; i++) frond(c.rr(-1.15, 1.15), c.rr(110, 235), c.rr(18, 38), c.r());
  for (let i = 0; i < 10; i++) frond(c.rr(-0.5, 0.5), c.rr(80, 150), c.rr(12, 22), c.r());
};

GEN.SOIL = (c) => {
  c.pixels((x, y, o) => {
    const a = c.n(0, x, y);
    const b = c.n(1, x, y);
    const f = c.n(2, x, y);
    const v = 0.55 + 0.7 * a * b + 0.3 * f;
    o[0] = 58 * v;
    o[1] = 44 * v;
    o[2] = 32 * v;
  });
  c.speckle(220, (r) => (r < 0.5 ? 'rgba(130,120,105,0.7)' : 'rgba(20,14,10,0.6)'), 2.2);
};

GEN.FOAM = (c) => {
  c.pixels((x, y, o) => {
    const e = 0.5 + 0.5 * Math.cos((x / 32) * TAU) * Math.cos((y / 32) * TAU);
    const v = 28 + 40 * e * (0.8 + 0.4 * c.n(2, x, y));
    o[0] = v;
    o[1] = v;
    o[2] = v * 1.05;
  });
};

GEN.CRATE = (c) => {
  const g = c.g;
  c.fill('#6e6a3a');
  panels(c, 128, [112, 106, 58], 0.2, 'rgba(0,0,0,0.7)', true);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 118, S, 20);
  c.text('FRAGILE', S / 2, 128, 22, '#e8e2c4', { align: 'center' });
  c.text('THIS SIDE UP', 128, 40, 18, '#e8e2c4', { align: 'center' });
  g.fillStyle = '#e8e2c4';
  g.fillRect(100, 180, 56, 6);
  g.beginPath();
  g.moveTo(128, 160);
  g.lineTo(150, 180);
  g.lineTo(106, 180);
  g.fill();
  dirt(c, 0.55, [10, 8, 4]);
};

GEN.POSTER_SPACE = (c) => {
  const g = c.g;
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, '#102a5a');
  grd.addColorStop(0.6, '#a2462a');
  grd.addColorStop(1, '#e8a14a');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) {
    g.fillStyle = `rgba(255,255,255,${c.rr(0.3, 0.9)})`;
    g.fillRect(c.r() * S, c.r() * S * 0.6, 1.5, 1.5);
  }
  g.fillStyle = '#e8c98a';
  g.beginPath();
  g.arc(170, 150, 52, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(120,70,40,0.7)';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(170, 150, 84, 16, -0.35, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.arc(184, 160, 52, 0, TAU);
  g.fill();
  g.fillStyle = '#f2efe6';
  g.save();
  g.translate(64, 170);
  g.rotate(-0.7);
  g.beginPath();
  g.moveTo(0, -30);
  g.quadraticCurveTo(12, -8, 8, 22);
  g.lineTo(-8, 22);
  g.quadraticCurveTo(-12, -8, 0, -30);
  g.fill();
  g.fillStyle = '#c23a2a';
  g.fillRect(-12, 18, 24, 6);
  g.restore();
  c.text('VISIT TITAN', S / 2, 26, 30, '#f4e6b8', { align: 'center' });
  c.text('SATURN LINES', S / 2, S - 18, 18, '#2a1408', { align: 'center' });
  g.strokeStyle = '#f4e6b8';
  g.lineWidth = 4;
  g.strokeRect(4, 4, S - 8, S - 8);
  c.pixels((x, y, o) => {
    const k = 0.62 + 0.3 * c.n(1, x, y);
    o[0] *= k;
    o[1] *= k;
    o[2] *= k;
  });
};

GEN.POSTER_KIDS = (c) => {
  const g = c.g;
  c.fill('#c9b998');
  const q = S / 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const crayon = (col) => {
    g.strokeStyle = col;
    g.lineWidth = 3.2;
  };
  // Note: four drawings, one per quadrant; each is picked by the quad uv rect.
  g.save();
  g.translate(0, 0);
  g.fillStyle = '#efe6d2';
  g.fillRect(6, 6, q - 12, q - 12);
  crayon('#d64a2a');
  g.strokeRect(34, 70, 60, 40);
  g.beginPath();
  g.moveTo(28, 70); g.lineTo(64, 38); g.lineTo(100, 70); g.stroke();
  crayon('#e8b81a');
  g.beginPath(); g.arc(102, 30, 11, 0, TAU); g.stroke();
  crayon('#2a8a3a');
  g.beginPath(); g.moveTo(20, 112); g.lineTo(110, 112); g.stroke();
  g.restore();
  g.save();
  g.translate(q, 0);
  g.fillStyle = '#efe6d2';
  g.fillRect(6, 6, q - 12, q - 12);
  crayon('#2a4fc8');
  for (let i = 0; i < 4; i++) {
    const x = 26 + i * 26;
    g.beginPath(); g.arc(x, 44, 7, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(x, 51); g.lineTo(x, 84); g.moveTo(x - 12, 62); g.lineTo(x + 12, 62);
    g.moveTo(x, 84); g.lineTo(x - 8, 106); g.moveTo(x, 84); g.lineTo(x + 8, 106); g.stroke();
  }
  g.restore();
  g.save();
  g.translate(0, q);
  g.fillStyle = '#efe6d2';
  g.fillRect(6, 6, q - 12, q - 12);
  crayon('#7a2ac8');
  g.beginPath(); g.moveTo(64, 20); g.quadraticCurveTo(84, 60, 78, 96); g.lineTo(50, 96); g.quadraticCurveTo(44, 60, 64, 20); g.stroke();
  crayon('#d64a2a');
  g.beginPath(); g.moveTo(50, 96); g.lineTo(38, 110); g.moveTo(78, 96); g.lineTo(90, 110); g.stroke();
  crayon('#e8b81a');
  g.beginPath(); g.moveTo(64, 98); g.lineTo(58, 118); g.lineTo(70, 118); g.lineTo(64, 98); g.stroke();
  for (let i = 0; i < 8; i++) g.strokeRect(14 + c.r() * 100, 14 + c.r() * 60, 2, 2);
  g.restore();
  g.save();
  g.translate(q, q);
  g.fillStyle = '#efe6d2';
  g.fillRect(6, 6, q - 12, q - 12);
  crayon('#2a8a3a');
  g.beginPath(); g.arc(64, 64, 40, 0, TAU); g.stroke();
  crayon('#d64a2a');
  g.beginPath(); g.arc(50, 54, 4, 0, TAU); g.arc(78, 54, 4, 0, TAU); g.stroke();
  g.beginPath(); g.arc(64, 70, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.restore();
  c.pixels((x, y, o) => {
    const k = 0.7 + 0.3 * c.n(1, x, y);
    o[0] *= k;
    o[1] *= k;
    o[2] *= k;
  });
};

GEN.POSTER_NOTICE = (c) => {
  const g = c.g;
  c.fill('#8a6a46');
  c.pixels((x, y, o) => {
    const f = 0.7 + 0.5 * c.n(2, x, y);
    o[0] *= f;
    o[1] *= f;
    o[2] *= f;
  });
  const sheets = [[14, 14, 100, 120, '#e8e4d8'], [130, 22, 110, 90, '#d8d4c2'], [20, 150, 84, 90, '#e8dca8'], [124, 130, 112, 108, '#e8e4d8']];
  let i = 0;
  for (const [x, y, w, h, col] of sheets) {
    g.save();
    g.translate(x + w / 2, y + h / 2);
    g.rotate(c.rr(-0.05, 0.05));
    g.fillStyle = col;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#b02a1e';
    g.fillRect(-w / 2 + 6, -h / 2 + 6, w - 12, 14);
    g.fillStyle = '#3a3a3a';
    for (let k = 0; k < 6; k++) g.fillRect(-w / 2 + 8, -h / 2 + 30 + k * 11, (w - 16) * c.rr(0.5, 1), 4);
    g.fillStyle = '#c0261a';
    g.beginPath();
    g.arc(0, -h / 2 + 4, 4, 0, TAU);
    g.fill();
    g.restore();
    i++;
  }
  void i;
};

GEN.ARCADE = (c) => {
  const g = c.g;
  c.fill('#0c0a18');
  const e = c.em();
  const cols = ['#ff2aa0', '#12d6ff', '#ffd400', '#7a2aff'];
  for (let i = 0; i < 6; i++) {
    const col = cols[i % cols.length];
    g.fillStyle = col;
    g.fillRect(0, 20 + i * 38, S, 6);
    e.fillStyle = '#fff';
    e.fillRect(0, 20 + i * 38, S, 6);
  }
  for (let i = 0; i < 40; i++) {
    const x = c.r() * S;
    const y = c.r() * S;
    g.fillStyle = cols[i % 4];
    g.fillRect(x, y, 3, 3);
    e.fillStyle = '#fff';
    e.fillRect(x, y, 3, 3);
  }
  g.fillStyle = '#ffd400';
  g.beginPath();
  g.arc(128, 128, 38, 0.25, TAU - 0.25);
  g.lineTo(128, 128);
  g.fill();
  e.fillStyle = '#fff';
  e.beginPath();
  e.arc(128, 128, 38, 0.25, TAU - 0.25);
  e.lineTo(128, 128);
  e.fill();
};

GEN.METER = (c) => {
  const g = c.g;
  c.fill('#1c1e22');
  const e = c.em();
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const cx = 64 + i * 128;
      const cy = 64 + j * 128;
      g.fillStyle = '#d8d0b0';
      g.beginPath(); g.arc(cx, cy, 50, 0, TAU); g.fill();
      g.strokeStyle = '#08080a';
      g.lineWidth = 5; g.stroke();
      g.strokeStyle = '#303030';
      g.lineWidth = 2;
      for (let t = 0; t <= 10; t++) {
        const a = Math.PI * 0.8 + (t / 10) * Math.PI * 1.4;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38);
        g.lineTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46);
        g.stroke();
      }
      const a = Math.PI * 0.8 + c.r() * Math.PI * 1.4;
      g.strokeStyle = '#b02a1e';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.stroke();
      e.fillStyle = 'rgba(255,255,255,0.4)';
      e.beginPath(); e.arc(cx, cy, 48, 0, TAU); e.fill();
    }
  }
  c.scratches(20, 24, () => 'rgba(255,255,255,0.08)');
};

GEN.CONSOLE = (c) => {
  const g = c.g;
  c.fill('#24272c');
  const e = c.em();
  panels(c, 128, [40, 44, 50], 0.3, 'rgba(0,0,0,0.7)', false);
  const cols = ['#c8372a', '#d8b02a', '#2aa84a', '#2a78d8', '#e8e8e0'];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const x = 16 + i * 30;
      const y = 16 + j * 30;
      if (c.r() < 0.55) {
        const col = cols[Math.floor(c.r() * cols.length)];
        g.fillStyle = '#101114';
        g.fillRect(x - 2, y - 2, 20, 20);
        g.fillStyle = col;
        g.fillRect(x, y, 16, 16);
        if (c.r() < 0.6) {
          e.fillStyle = '#fff';
          e.fillRect(x, y, 16, 16);
        }
      } else if (c.r() < 0.5) {
        g.fillStyle = '#9a9ea4';
        g.beginPath(); g.arc(x + 8, y + 8, 6, 0, TAU); g.fill();
        g.strokeStyle = '#08090a';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x + 8, y + 8); g.lineTo(x + 8 + c.rr(-8, 8), y + 8 - 12); g.stroke();
      }
    }
  }
};

GEN.WARN_SIGNS = (c) => {
  const g = c.g;
  c.fill('#8a8a82');
  const cell = S / 2;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      g.fillStyle = '#1a1a1a';
      g.fillRect(i * cell + 8, j * cell + 8, cell - 16, cell - 16);
      g.fillStyle = '#e8c21a';
      g.beginPath();
      g.moveTo(cx, cy - 46);
      g.lineTo(cx + 46, cy + 36);
      g.lineTo(cx - 46, cy + 36);
      g.fill();
      g.fillStyle = '#111';
      const kind = j * 2 + i;
      if (kind === 0) {
        g.fillRect(cx - 3, cy - 20, 6, 30);
        g.fillRect(cx - 3, cy + 16, 6, 6);
      } else if (kind === 1) {
        g.beginPath();
        g.moveTo(cx + 6, cy - 22); g.lineTo(cx - 10, cy + 4); g.lineTo(cx, cy + 4); g.lineTo(cx - 6, cy + 26); g.lineTo(cx + 12, cy - 4); g.lineTo(cx + 2, cy - 4);
        g.fill();
      } else if (kind === 2) {
        g.beginPath(); g.arc(cx, cy + 8, 5, 0, TAU); g.fill();
        for (let k = 0; k < 3; k++) {
          const a = -Math.PI / 2 + k * (TAU / 3);
          g.beginPath(); g.moveTo(cx, cy + 8); g.arc(cx, cy + 8, 22, a - 0.5, a + 0.5); g.fill();
        }
      } else {
        g.beginPath(); g.arc(cx, cy + 4, 14, 0, TAU); g.fill();
        g.fillStyle = '#e8c21a';
        g.fillRect(cx - 18, cy - 2, 36, 4);
      }
    }
  }
  dirt(c, 0.5, [10, 10, 8]);
};

GEN.BEAM = (c) => {
  const g = c.g;
  c.fill('#8a7418');
  panels(c, 256, [150, 124, 26], 0, 'rgba(0,0,0,0.5)', false);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, S, 14);
  g.fillRect(0, S - 14, S, 14);
  for (let i = 0; i < 8; i++) {
    c.bolt(16 + i * 32, 7, 2.6, '#2a2208');
    c.bolt(16 + i * 32, S - 7, 2.6, '#2a2208');
  }
  dirt(c, 0.6, [12, 8, 2]);
};

GEN.SEAM_BAND = (c) => {
  const g = c.g;
  c.fill('#2e3035');
  g.fillStyle = '#17181b';
  g.fillRect(0, 0, S, 24);
  g.fillRect(0, S - 24, S, 24);
  for (let i = 0; i < 8; i++) {
    c.bolt(16 + i * 32, 12, 3);
    c.bolt(16 + i * 32, S - 12, 3);
  }
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(0, 24, S, 1);
  dirt(c, 0.5);
};

GEN.WATER = (c) => {
  c.pixels((x, y, o) => {
    const a = c.n(1, x, y);
    const b = c.n(1, x * 1.7 + 50, y * 1.3 + 20);
    const caustic = Math.pow(1 - Math.abs(a - b) * 2.2, 5);
    const v = 0.5 + 0.6 * Math.max(0, caustic);
    o[0] = 10 + 40 * v;
    o[1] = 34 + 90 * v;
    o[2] = 46 + 100 * v;
  });
};

GEN.LINO = (c) => {
  c.pixels((x, y, o) => {
    const a = c.n(1, x, y);
    o[0] = 150 + 30 * a;
    o[1] = 146 + 30 * a;
    o[2] = 128 + 25 * a;
  });
  const cols = ['#c8b878', '#7a8a6a', '#9a6a4a', '#d8d0b8', '#6a7a8a'];
  for (let i = 0; i < 420; i++) {
    const x = c.r() * S;
    const y = c.r() * S;
    c.g.fillStyle = cols[Math.floor(c.r() * cols.length)];
    c.g.globalAlpha = 0.5;
    c.wrap(x, y, 4, 4, () => c.g.fillRect(x, y, c.rr(1.5, 4), c.rr(1.5, 3)));
    c.g.globalAlpha = 1;
  }
  c.scratches(20, 30, () => 'rgba(0,0,0,0.12)');
  dirt(c, 0.4, [14, 12, 6]);
};

GEN.FABRIC = (c) => {
  c.pixels((x, y, o) => {
    const wv = 0.75 + 0.25 * Math.sin(x * 2.2) * Math.sin(y * 2.2);
    const n = 0.8 + 0.4 * c.n(1, x, y);
    o[0] = 150 * wv * n;
    o[1] = 84 * wv * n;
    o[2] = 52 * wv * n;
  });
};

GEN.PLASTIC = (c) => {
  c.pixels((x, y, o) => {
    const n = c.n(2, x, y);
    const v = 150 + 14 * n;
    o[0] = v;
    o[1] = v;
    o[2] = v;
  });
  c.scratches(8, 30, () => 'rgba(0,0,0,0.12)');
};

GEN.METAL_BRIGHT = (c) => {
  c.pixels((x, y, o) => {
    const streak = c.n(1, x * 0.2, y * 3);
    const v = 150 + 60 * streak + 20 * Math.sin(y * 0.05);
    o[0] = v;
    o[1] = v * 1.01;
    o[2] = v * 1.04;
  });
  c.scratches(14, 40, () => 'rgba(0,0,0,0.12)');
};

GEN.BLACK = (c) => {
  c.pixels((x, y, o) => {
    const v = 8 + 8 * c.n(2, x, y);
    o[0] = v;
    o[1] = v;
    o[2] = v * 1.05;
  });
};

// Note: builds all layers into one Uint8Array of RGBA layers; calls onProgress(layer, total) between layers.
export async function buildTextureBank(onProgress = null, yieldFn = null) {
  const bank = [
    makeNoise(0x1234, 4, 4),
    makeNoise(0x5678, 12, 3),
    makeNoise(0x9abc, 40, 2),
  ];
  const data = new Uint8Array(S * S * 4 * LAYER_COUNT);
  for (let li = 0; li < LAYER_COUNT; li++) {
    const name = LAYER_NAME_LIST[li];
    const c = new Ctx(bank, 0x9e37 + li * 131);
    const gen = GEN[name];
    if (gen) gen(c);
    else c.fill('#808080');
    const img = c.g.getImageData(0, 0, S, S).data;
    const em = c.ec ? c.eg.getImageData(0, 0, S, S).data : null;
    const base = li * S * S * 4;
    for (let i = 0; i < S * S; i++) {
      const o = base + i * 4;
      data[o] = img[i * 4];
      data[o + 1] = img[i * 4 + 1];
      data[o + 2] = img[i * 4 + 2];
      data[o + 3] = c.cutout ? img[i * 4 + 3] : em ? em[i * 4] : 0;
    }
    if (onProgress) onProgress(li + 1, LAYER_COUNT);
    if (yieldFn) await yieldFn();
  }
  return data;
}

// Note: ASCII glyph atlas on a 16x6 grid; atlas.uv(code) returns [u0, v0, u1, v1] with v up.
export function buildFontAtlas() {
  const cols = 16;
  const rows = 6;
  const cw = 32;
  const ch = 48;
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = `bold 38px "VT323","Courier New",monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let code = 32; code < 128; code++) {
    const k = code - 32;
    const x = (k % cols) * cw + cw / 2;
    const y = Math.floor(k / cols) * ch + ch / 2 + 2;
    g.fillText(String.fromCharCode(code), x, y);
  }
  return {
    canvas: c,
    aspect: 0.5,
    layer: 121,
    uv(code) {
      const k = code - 32;
      const cx = k % cols;
      const cy = Math.floor(k / cols);
      const eps = 0.5;
      const u0 = (cx * cw + eps) / c.width;
      const u1 = ((cx + 1) * cw - eps) / c.width;
      const vTop = 1 - (cy * ch + eps) / c.height;
      const vBot = 1 - ((cy + 1) * ch - eps) / c.height;
      return [u0, vBot, u1, vTop];
    },
  };
}

export { L, TEX as TEXTURE_SIZE };
