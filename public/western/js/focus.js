// Note: the focus blur of careful aim (SPEC items 184 and 185): the maths of the sharp window and the blur weight, with no DOM or Phaser. The window follows the accuracy corridor (item 183, weapons.js aimQuality) and is drawn by focusfx.js.
// Note: a focus state is { q, k }: q is the eased aim quality 0..1 (the window width), k the eased blur envelope 0..1 (zero outside careful aim).

import { clamp, angleDiff } from './rand.js';

const DEG = Math.PI / 180;

// Note: all numbers of the effect; style and strength are free (item 184).
export const FOCUS = {
  // Note: half angle of the sharp wedge at the widest aim (quality 0) and at the best (quality 1); shape bends the curve between them (above 1 it narrows the good aims faster), so a settled aim reads clearly tighter than an unsettled one.
  wide: 75 * DEG,
  narrow: 3 * DEG,
  shape: 1.4,
  // Note: the soft edge is this share of the half angle each side of it, never thinner than featherMin.
  feather: 0.4,
  featherMin: 2.5 * DEG,
  // Note: metres around the sheriff that stay sharp, and the soft edge of that ring.
  near: 1.3,
  nearFeather: 1,
  // Note: the most blur shows at the top of the envelope; dim pulls the blurred part a little darker so the eye settles on the middle.
  strength: 0.94,
  dim: 0.1,
  // Note: the window narrows at most rateQ of its range per second and widens at most rateWiden (a shot or a hit shows within a tenth of a second, never as one step); the envelope takes fadeIn to rise and fadeOut to fall.
  rateQ: 2.5,
  rateWiden: 8,
  fadeIn: 0.25,
  fadeOut: 0.35,
};

export const ease = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

const smooth = (a, b, x) => ease((x - a) / (b - a));

export const newFocus = () => ({ q: 0, k: 0 });

// Note: q follows the aim quality at a bounded speed (narrowing slowly, widening fast, so the picture never shows a tight window the corridor has already left); k rises while careful aim is held and falls when it ends.
export function stepFocusView(f, active, quality, dt) {
  const down = FOCUS.rateWiden * dt;
  const up = FOCUS.rateQ * dt;
  f.q = clamp(f.q + clamp(quality - f.q, -down, up), 0, 1);
  const rate = dt / (active ? FOCUS.fadeIn : FOCUS.fadeOut);
  f.k = clamp(f.k + clamp((active ? 1 : 0) - f.k, -rate, rate), 0, 1);
  return f;
}

// Note: the sharp window for a focus state; strength is 0 outside careful aim, so the effect is absent then.
export function focusWindow(f, facing) {
  // Note: a power of the missing quality, so a crouch or a held direction shows at every settle; the state itself is already rate limited.
  const half = FOCUS.narrow + (FOCUS.wide - FOCUS.narrow) * Math.pow(1 - clamp(f.q, 0, 1), FOCUS.shape);
  return {
    facing,
    half,
    feather: Math.max(FOCUS.featherMin, half * FOCUS.feather),
    near: FOCUS.near,
    nearFeather: FOCUS.nearFeather,
    strength: FOCUS.strength * ease(f.k),
    dim: FOCUS.dim * ease(f.k),
    q: f.q,
    k: f.k,
  };
}

// Note: 1 where the picture stays sharp, 0 where it is blurred: the wedge along the aim or the ring around the eye, whichever is sharper.
export function sharpWeight(win, eye, p) {
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const r = Math.hypot(dx, dy);
  const off = Math.abs(angleDiff(win.facing, Math.atan2(dy, dx)));
  const wedge = 1 - smooth(win.half - win.feather, win.half + win.feather, off);
  const ring = 1 - smooth(win.near, win.near + win.nearFeather, r);
  return Math.max(wedge, ring);
}

export const blurWeight = (win, eye, p) => win.strength * (1 - sharpWeight(win, eye, p));

// Note: nothing outside the field is ever touched: the weight is 0 wherever visible says the sheriff cannot see.
export const blurWeightAt = (win, eye, p, visible) => (win.strength > 0 && visible(p.x, p.y) ? blurWeight(win, eye, p) : 0);

// Note: inverse of ease on 0..1, so a stack of wedges at even alpha steps follows the same soft edge as sharpWeight.
const unease = (y) => 0.5 - Math.sin(Math.asin(1 - 2 * clamp(y, 0, 1)) / 3);

// Note: the nested wedges the canvas cuts the sharp window with, widest first; wedge j removes alpha so the stack leaves (steps - j) / steps of the blur, which is the edge of sharpWeight in steps. Returns [{ half, alpha }], and the last wedge is opaque.
export function windowWedges(win, steps = 5) {
  const out = [];
  for (let j = 1; j <= steps; j++) {
    const half = win.half - win.feather + 2 * win.feather * unease((steps - j + 0.5) / steps);
    out.push({ half: Math.max(0.002, half), alpha: 1 / (steps + 1 - j) });
  }
  return out;
}
