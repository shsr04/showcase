// Note: composes one vignette panel as a single picture on one canvas (items 312, 374, 396).

import { portraitCanvas, PORTRAIT_W, PORTRAIT_H } from '../portrait.js';

export const VW = 1280;
export const VH = 720;
const SERIF = "'Palatino Linotype', 'Book Antiqua', Georgia, 'Times New Roman', serif";
const DISPLAY = "'Rockwell Extra Bold', Rockwell, Clarendon, 'Bookman Old Style', Georgia, serif";
const INK = '#2a1a12';
const PAPER = '#efe0bb';
const TACK = '#6a6a66';
const RED = '#9a3a2a';
const RED_D = '#6e2318';
const CREAM = '#f4e9d0';
const TAU = Math.PI * 2;
export const MARK_WORD = { dead: 'dead', fallen: 'fallen', memory: 'in memory', started: 'started it' };

const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const span = (t, at, len) => Math.min(1, Math.max(0, (t - at) / len));

// Note: wraps a text to a width in the current font.
function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Note: sizes one likeness from its portrait scale and lettering.
function measure(ctx, c, n) {
  const k = c.big ? 4 : c.small || n >= 5 ? 2 : 3;
  const pw = PORTRAIT_W * k;
  const ph = PORTRAIT_H * k;
  const fs = k >= 4 ? 22 : k === 3 ? 19 : 15;
  ctx.font = `700 ${fs}px ${SERIF}`;
  const w = Math.max(pw + 20, Math.min(250, ctx.measureText(c.name).width + 24));
  ctx.font = `italic 700 ${fs - 4}px ${SERIF}`;
  const traits = [...(c.role ? wrap(ctx, c.role, w - 16) : []), ...(c.traits ? wrap(ctx, c.traits.join(' · '), w - 16) : [])];
  const head = c.mark === 'wanted' ? Math.round(fs * 2.2) : 0;
  const top = 10 + head;
  const h = top + ph + 8 + (fs + 4) + traits.length * (fs - 1) + 10;
  return { k, pw, ph, fs, w, h, top, head, traits };
}

// Note: draws one likeness as a paper tacked into the scene, lettered with name, traits and mark.
function likeness(ctx, c, m, x, y, tilt, t, delay) {
  const a = ease(span(t, 250 + delay, 600));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x + m.w / 2, y + m.h / 2 + (1 - a) * 24);
  ctx.rotate(tilt);
  ctx.translate(-m.w / 2, -m.h / 2);
  ctx.shadowColor = 'rgba(10, 6, 4, 0.55)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = c.mark === 'memory' ? '#d8c093' : PAPER;
  ctx.fillRect(0, 0, m.w, m.h);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, m.w - 3, m.h - 3);
  const px = (m.w - m.pw) / 2;
  const cv = portraitCanvas(c.portrait.look, c.portrait.marks || [], 1);
  ctx.imageSmoothingEnabled = false;
  if (c.mark === 'fallen' || c.mark === 'dead' || c.mark === 'memory' || c.darker) ctx.filter = c.darker ? 'grayscale(0.9) sepia(0.5) brightness(0.55)' : 'grayscale(0.8) sepia(0.5) brightness(0.8)';
  ctx.drawImage(cv, px, m.top, m.pw, m.ph);
  ctx.filter = 'none';
  ctx.strokeRect(px - 1.5, m.top - 1.5, m.pw + 3, m.ph + 3);
  if (m.head) {
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Note: the header shrinks until it fits the poster's width.
    ctx.letterSpacing = '3px';
    let size = Math.round(m.fs * 1.7);
    do {
      ctx.font = `900 ${size}px ${DISPLAY}`;
      size -= 1;
    } while (ctx.measureText('WANTED').width > m.w - 28 && size > 8);
    ctx.fillText('WANTED', m.w / 2 + 1, 10 + m.head / 2 + 2);
    ctx.letterSpacing = '0px';
  }
  if (c.mark === 'dead') {
    ctx.strokeStyle = 'rgba(42, 26, 18, 0.85)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(px, m.top + m.ph);
    ctx.lineTo(px + m.pw, m.top);
    ctx.stroke();
  }
  ctx.fillStyle = c.nemesis ? RED_D : INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let ty = m.top + m.ph + 8 + m.fs;
  ctx.font = `700 ${m.fs}px ${SERIF}`;
  ctx.fillText(c.name, m.w / 2, ty, m.w - 10);
  ctx.font = `italic 700 ${m.fs - 4}px ${SERIF}`;
  ctx.fillStyle = RED_D;
  for (const line of m.traits) {
    ty += m.fs - 1;
    ctx.fillText(line, m.w / 2, ty);
  }
  // Note: tacks in the top corners.
  ctx.fillStyle = TACK;
  for (const tx of [9, m.w - 9]) {
    ctx.beginPath();
    ctx.arc(tx, 8, 3.4, 0, TAU);
    ctx.fill();
  }
  const word = MARK_WORD[c.mark] && MARK_WORD[c.mark].toUpperCase();
  if (word) {
    ctx.save();
    ctx.translate(m.w / 2, m.top + m.ph * 0.78);
    ctx.rotate(-0.18);
    ctx.font = `900 ${Math.round(m.fs * 1.15)}px ${DISPLAY}`;
    const sw = ctx.measureText(word).width + 18;
    ctx.globalAlpha = 0.92 * ease(span(t, 700 + delay, 250));
    ctx.fillStyle = c.mark === 'memory' ? '#2a1a12' : RED;
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 3;
    ctx.fillRect(-sw / 2, -m.fs * 0.9, sw, m.fs * 1.4);
    ctx.strokeRect(-sw / 2, -m.fs * 0.9, sw, m.fs * 1.4);
    ctx.fillStyle = CREAM;
    ctx.textBaseline = 'middle';
    ctx.fillText(word, 0, -m.fs * 0.2);
    ctx.restore();
  }
  ctx.restore();
}

// Note: lays the cast out centred, on two sides or at one edge.
function cast(ctx, all, bottom, t, at, p) {
  // Note: a memorial likeness hangs above the marker, or at the top centre without one.
  const tops = all.filter((c) => c.top);
  const list = all.filter((c) => !c.top);
  tops.forEach((c) => {
    const m = measure(ctx, c, 1);
    const marker = p.art.report && p.art.report.marker;
    const K = VW / 320;
    likeness(ctx, c, m, marker ? marker.x * K - m.w / 2 : (VW - m.w) / 2, marker ? Math.max(10, marker.y * K - m.h - 14) : 22, 0, t, 0);
  });
  const n = list.length;
  if (!n) return;
  const ms = list.map((c) => measure(ctx, c, n));
  const gap = 24;
  const total = ms.reduce((s, m) => s + m.w, 0) + gap * (n - 1);
  const sides = list.some((c) => c.side);
  let x = at === 'left' ? 56 : at === 'right' ? VW - 56 - total : (VW - total) / 2;
  if (sides && n > 1) {
    const left = list.filter((c) => c.side === 'left');
    const right = list.filter((c) => c.side !== 'left');
    let lx = 18;
    let rx = VW - 18 - right.reduce((s, c) => s + ms[list.indexOf(c)].w + gap, -gap);
    list.forEach((c, i) => {
      const m = ms[i];
      const onLeft = left.includes(c);
      likeness(ctx, c, m, onLeft ? lx : rx, bottom - m.h, (i % 2 ? 1 : -1) * 0.02, t, i * 180);
      if (onLeft) lx += m.w + gap;
      else rx += m.w + gap;
    });
    return;
  }
  ms.forEach((m, i) => {
    likeness(ctx, list[i], m, x, bottom - m.h, (i % 2 ? 1 : -1) * 0.02, t, i * 180);
    x += m.w + gap;
  });
}

// Note: inks the caption on a pinned paper scrap and returns its top; a lift leaves room for choice buttons.
function lettering(ctx, text, cls, t, lift) {
  const a = ease(span(t, 350, 600));
  const end = cls === 'is-end';
  const size = end ? 64 : cls === 'is-oath' ? 27 : 28;
  ctx.font = `${end ? 900 : cls === 'is-oath' ? 'italic 700' : 700} ${size}px ${end ? DISPLAY : SERIF}`;
  ctx.letterSpacing = end ? '14px' : '0px';
  const lines = wrap(ctx, text, 940);
  const lh = size * 1.34;
  const w = Math.min(1000, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 64);
  const h = lines.length * lh + 34;
  const top = VH - 40 - lift - h;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(VW / 2, top + h / 2 + (1 - a) * 12);
  ctx.rotate(end ? 0 : -0.012);
  ctx.shadowColor = 'rgba(10, 6, 4, 0.6)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = PAPER;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
  ctx.fillStyle = TACK;
  for (const tx of [-w / 2 + 16, w / 2 - 16]) {
    ctx.beginPath();
    ctx.arc(tx, -h / 2 + 14, 3.4, 0, TAU);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = INK;
  lines.forEach((line, i) => ctx.fillText(line, end ? 7 : 0, -h / 2 + 17 + i * lh));
  ctx.letterSpacing = '0px';
  ctx.restore();
  return top;
}

// Note: inks the itemized costs on the bill sheet the painter reported.
function bill(ctx, p) {
  const sheet = p.art.report && p.art.report.bill;
  if (!sheet || !p.art.billLines) return;
  const K = VW / 320;
  const [x, y, w, h] = [sheet.x * K, sheet.y * K, sheet.w * K, sheet.h * K];
  for (let size = 16; size >= 9; size--) {
    ctx.font = `700 ${size}px ${SERIF}`;
    const rows = p.art.billLines.flatMap((l) => wrap(ctx, l, w - 16));
    if (rows.length * (size + 3) + 26 > h && size > 9) continue;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('BILL', x + 8, y + 5);
    ctx.fillRect(x + 6, y + size + 8, w - 12, 2);
    rows.forEach((row, i) => ctx.fillText(row, x + 8, y + size + 14 + i * (size + 3)));
    ctx.restore();
    return;
  }
}

// Note: draws the whole panel at time t in ms.
export function composeVignette(ctx, base, p, t = 99999) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0, VW, VH);
  bill(ctx, p);
  const lift = p.choice ? 74 : 0;
  const top = p.caption ? lettering(ctx, p.caption, p.captionCls || '', t, lift) - 24 : VH - 36 - lift;
  cast(ctx, p.cast, top, t, p.castAt, p);
}

// Note: true while anything in the panel is still moving at time t.
export const moving = (p, t) => t < SETTLE;

// Note: when the likenesses have settled, in ms.
const SETTLE = 2600;

// Note: draws the panel and keeps it moving while it is on screen; with reduced motion it draws once, finished.
export function animateVignette(cv, ctx, base, p) {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    composeVignette(ctx, base, p);
    return;
  }
  const born = performance.now();
  const draw = () => {
    if (!cv.isConnected && performance.now() - born > ATTACH_MS) return;
    const t = performance.now() - born;
    composeVignette(ctx, base, p, t);
    if (moving(p, t)) requestAnimationFrame(draw);
  };
  draw();
}

// Note: how long a new canvas may wait to be attached before its loop stops, in ms.
const ATTACH_MS = 300;
