// Note: the nemesis's wanted poster as a thing in the world (item 392 panel 2): the paper with its printed face, and the boxes that make it peel off a plank wall, one edge curling out and the top corner torn and lifted.

import { C, rgb } from '../palette.js';
import { Px, step, text, textWidth, signText, NONE } from './pixel-art.js';
import { pixelFigure } from './pixel-figure.js';
import { box, noise } from './pixel-3d.js';
import { vnoise } from './graves-world.js';

export const POSTER = { w: 0.5, h: 0.7, x: 0.1, y: 1.15, z: 0.012 };
const TEXW = 120;
const TEXH = 168;

// Note: a name to a number, so the reward is always the same for the same man.
const hash = (str) => [...String(str)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

// Note: a colour index to a brightness from 0 to 1.
const lum = (i) => { const [r, g, b] = rgb(i); return (r * 0.3 + g * 0.59 + b * 0.11) / 255; };

// Note: the likeness: the nemesis drawn large from his look, then printed as an engraving in four inks on the paper; the face stays light and every feature reads.
function likeness(look, w, h) {
  const src = pixelFigure(200, 330, 100, 270, 235, look, 'stand', { lx: -0.2, ly: -0.5, brim: 0 });
  const out = new Px(w, h);
  const inks = [C.SHADOW, C.DARK, C.WOOD_D, C.WOOD, C.PLANK, C.SAND, C.PLASTER];
  const x0 = 100 - Math.floor(w / 2);
  const y0 = 28;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = src.get(x0 + x, y0 + y);
    if (p === NONE) { out.a[y * w + x] = C.PLASTER; continue; }
    const l = lum(p);
    // Note: skin keeps a light tone so the face reads; the rest of the picture is printed darker.
    const skin = look && (p === look.skin || p === step(look.skin, -1) || p === step(look.skin, 1)) ? 0.4 : 0;
    out.a[y * w + x] = inks[Math.max(0, Math.min(inks.length - 1, Math.floor((l + skin) * (inks.length - 1) * 1.15)))];
  }
  return out;
}

// Note: the sheet: aged paper, the heading, the likeness in a frame, the name, the crime and the reward.
export function posterTexture(name, look) {
  const t = new Px(TEXW, TEXH);
  for (let y = 0; y < TEXH; y++) for (let x = 0; x < TEXW; x++) {
    const stain = vnoise(x / 14, y / 12);
    const edge = Math.min(x, y, TEXW - 1 - x, TEXH - 1 - y);
    let c = C.PLASTER;
    if (stain > 0.62 || edge < 2 + noise(x, y) * 3) c = step(C.PLASTER, -1);
    if (stain > 0.8 || (edge < 1 && noise(y, x) > 0.4)) c = C.SAND_L;
    if (noise(x * 3, y * 5) > 0.992) c = C.SAND;
    t.a[y * TEXW + x] = c;
  }
  const ink = C.SHADOW;
  // Note: a double rule round the sheet.
  t.rect(4, 4, TEXW - 8, 1, ink); t.rect(4, TEXH - 5, TEXW - 8, 1, ink);
  t.rect(4, 4, 1, TEXH - 8, ink); t.rect(TEXW - 5, 4, 1, TEXH - 8, ink);
  t.rect(7, 7, TEXW - 14, 1, ink); t.rect(7, TEXH - 8, TEXW - 14, 1, ink);
  t.rect(7, 7, 1, TEXH - 14, ink); t.rect(TEXW - 8, 7, 1, TEXH - 14, ink);
  // Note: the heading in bold capitals with a red shadow and an outline, stars either side.
  const hw = textWidth('WANTED', 4);
  signText(t, 'WANTED', Math.round((TEXW - hw) / 2), 11, ink, { scale: 4, shadow: C.RED });
  const dw = textWidth('DEAD OR ALIVE', 1);
  text(t, 'DEAD OR ALIVE', Math.round((TEXW - dw) / 2), 34, C.RED_D, 1);
  t.rect(14, 36, 14, 1, ink); t.rect(TEXW - 28, 36, 14, 1, ink);
  // Note: the likeness in a thick frame.
  const lw = 70;
  const lh = 60;
  const lx = Math.round((TEXW - lw) / 2);
  const ly = 43;
  t.rect(lx - 3, ly - 3, lw + 6, lh + 6, ink);
  t.rect(lx - 1, ly - 1, lw + 2, lh + 2, C.PLASTER);
  const face = likeness(look, lw, lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) t.set(lx + x, ly + y, face.a[y * lw + x]);
  // Note: the name, one line big if it fits, else two.
  const nm = String(name || 'UNKNOWN').toUpperCase();
  const room = TEXW - 20;
  const words = nm.split(' ');
  let lines = [nm];
  let sc = 2;
  if (textWidth(nm, 2) > room) lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [nm];
  if (lines.some((ln) => textWidth(ln, 2) > room) || lines.length > 1) sc = 1;
  let y = ly + lh + 8;
  for (const ln of lines) {
    signText(t, ln, Math.round((TEXW - textWidth(ln, sc)) / 2), y, ink, { scale: sc, shadow: C.SAND });
    y += sc * 5 + 3;
  }
  const fw = textWidth('FOR MURDER', 1);
  text(t, 'FOR MURDER', Math.round((TEXW - fw) / 2), y + 1, ink, 1);
  // Note: the reward line near the foot.
  const amount = String(500 * (1 + (hash(nm) % 9)));
  const rw = textWidth('REWARD', 1);
  text(t, 'REWARD', Math.round((TEXW - rw) / 2), TEXH - 31, C.RED_D, 1);
  const money = `$${amount}`;
  signText(t, money, Math.round((TEXW - textWidth(money, 2)) / 2), TEXH - 23, ink, { scale: 2, shadow: C.SAND });
  return t;
}

// Note: the poster as boxes on a wall at z = 0: a column of paper every 2.5 cm that eases away from the wall toward the right edge, the torn corner as curled stacked scraps showing the blank back, nails at the top, and a few older scraps pasted beneath.
export function posterBoxes(tex, tearSeed = 4) {
  const { w, h, x, y, z } = POSTER;
  const out = [];
  const N = 40;
  const dx = w / N;
  const peelFrom = 0.45;
  const gap = (u) => (u < peelFrom ? 0 : 0.14 * ((u - peelFrom) / (1 - peelFrom)) ** 2.2);
  // Note: the tear: a ragged diagonal across the top right corner; paper above it is gone from the sheet.
  const tearV = (u) => (u < 0.68 ? 2 : 1 - 0.27 * ((u - 0.68) / 0.32) + (noise(Math.floor(u * 40 / 3), tearSeed) - 0.5) * 0.07);
  const back = (p) => {
    const g = noise(Math.floor(p[0] * 60), Math.floor(p[1] * 60));
    return { c: g > 0.85 ? C.SAND : g < 0.2 ? step(C.SAND_L, -1) : C.SAND_L };
  };
  for (let i = 0; i < N; i++) {
    const x0 = x + i * dx;
    const u = (i + 0.5) / N;
    const zz = z + gap(u);
    out.push(box([x0, y, zz], [x0 + dx * 1.35, y + h, zz + 0.004], (p, n) => {
      const uu = (p[0] - x) / w;
      const vv = (y + h - p[1]) / h;
      if (1 - vv > tearV(uu)) return null;
      if (n[2] < 0.5) return null;
      const c = tex.get(Math.max(0, Math.min(TEXW - 1, Math.floor(uu * TEXW))), Math.max(0, Math.min(TEXH - 1, Math.floor(vv * TEXH))));
      return { c: c === NONE ? C.PLASTER : c, k: 1.1 };
    }));
  }
  // Note: the torn flap: three wide slabs that step out together from the tear, each cut to the torn outline, showing the blank back of the paper.
  const U0 = 0.68;
  for (let k = 0; k < 3; k++) {
    const u0 = U0 + (k * (1 - U0)) / 3;
    const u1 = U0 + ((k + 1) * (1 - U0)) / 3;
    const off = z + gap((u0 + u1) / 2) + 0.03 + k * 0.045;
    out.push(box([x + u0 * w, y + h * (1 - 0.3), off], [x + u1 * w, y + h + 0.015 * (k + 1), off + 0.006], (p, n) => {
      const uu = (p[0] - x) / w;
      if ((p[1] - y) / h < tearV(uu) || n[2] < 0.5) return null;
      return back(p);
    }));
  }
  // Note: nails at the top corners of the sheet that still hold.
  for (const nx of [0.06, 0.5]) out.push(box([x + w * nx - 0.008, y + h - 0.06, z + 0.004], [x + w * nx + 0.008, y + h - 0.044, z + 0.02], () => ({ c: C.IRON_L }), { noShadow: true }));
  // Note: older scraps still pasted to the boards below and beside.
  const scrap = (sx, sy, sw, sh, c) => out.push(box([sx, sy, 0.004], [sx + sw, sy + sh, 0.009], (p) => {
    const g = noise(Math.floor(p[0] * 50), Math.floor(p[1] * 50));
    if (g > 0.93 && p[1] > sy + sh * 0.5) return null;
    const line = Math.floor((p[1] - sy) * 40) % 4 === 0 && noise(Math.floor(p[0] * 30), Math.floor(p[1] * 40)) > 0.35;
    return { c: line ? C.WOOD : step(c, noise(Math.floor(p[0] * 20), Math.floor(p[1] * 20)) > 0.7 ? -1 : 0) };
  }, { noShadow: true }));
  scrap(x - 0.55, y + 0.1, 0.22, 0.3, C.PLASTER);
  scrap(x - 0.4, y - 0.15, 0.18, 0.12, C.SAND_L);
  scrap(x + w + 0.18, y + 0.35, 0.12, 0.2, C.PLASTER);
  return out;
}
