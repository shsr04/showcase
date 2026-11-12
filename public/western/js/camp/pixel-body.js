// Note: people who are not standing, for the storyboard panels (item 312): a body lying in the dust, face up or down, and a man kneeling over it; both are built from the side figure's head and hat.

import { C } from '../palette.js';
import { Px, step, NONE, rotated } from './pixel-art.js';
import { pixelSide, faceLit, LONG_HAIR } from './pixel-figure.js';

// Note: a limb as a tapered band along a centre line.
function band(pts, w) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    left.push([pts[i][0] - ((b[1] - a[1]) / n) * w[i], pts[i][1] + ((b[0] - a[0]) / n) * w[i]]);
    right.push([pts[i][0] + ((b[1] - a[1]) / n) * w[i], pts[i][1] - ((b[0] - a[0]) / n) * w[i]]);
  }
  return [...left, ...right.reverse()];
}

// Note: a person lying on the ground with the middle of the body at (xc, yc): head to the right or left (head = 1 or -1), face up or down; the light (lx, ly) is given as it falls on the lying body.
export function pixelLying(w, h, xc, yc, height, look, o = {}) {
  const head = o.head || 1;
  const up = o.face !== 'down';
  const ang = head > 0 ? Math.PI / 2 : -Math.PI / 2;
  const dir = up ? -head : head;
  // Note: the light turned back into the standing figure's frame, so it lands on the right side of the lying body.
  const lx = o.lx ?? -1;
  const ly = o.ly ?? -0.5;
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  const fig = pixelSide(w, h, xc, yc + height / 2, height, look, o.pose || 'stand', { dir, lx: lx * c - ly * s, ly: lx * s + ly * c, cool: o.cool, hatless: o.hatless ?? true, coat: o.coat, hat: o.hat, girth: o.girth ?? 1.2 });
  const out = rotated(fig, xc, yc, ang);
  // Note: a lit face when asked: the head is lightened a step, so that it reads against the dust.
  if (o.bright) {
    const Hh = height / 7.5;
    out.shift(xc + head * 3.1 * Hh - Hh * 1.3, yc - Hh * 1.2, Hh * 2.6, Hh * 2.4, 1, 1);
  }
  return out;
}

// Note: a hat lying on the ground at a screen point: the brim a flat ellipse, the crown a short dome with a band, a shadow in the dust beside it.
export function hatDown(L, x, y, S, c, light = {}) {
  const s = Math.max(1.5, S * 0.17);
  const k = Math.sign(light.lx ?? -1) || -1;
  L.wash(x - k * s * 0.4, y - s * 0.1, s * 3.4, s * 0.55, C.SAND_D, 0.7);
  L.ellipse(x, y - s * 0.2, s * 1.6, s * 0.38, step(c, -1));
  L.ellipse(x, y - s * 0.28, s * 1.5, s * 0.3, c);
  L.rect(x - s * 0.62, y - s * 0.86, s * 1.24, s * 0.62, c);
  L.rect(x - s * 0.62, y - s * 0.92, s * 1.24, Math.max(1, s * 0.14), step(c, 1));
  L.rect(x - s * 0.62, y - s * 0.42, s * 1.24, Math.max(1, s * 0.16), C.DARK);
  L.rect(x - k * s * 0.62, y - s * 0.86, Math.max(1, s * 0.1), s * 0.6, step(c, -2));
}

// Note: a man kneeling on one knee, leaning forward over something in front of him, a hand reaching down to it; foot is where his planted boot is; dir is the way he faces.
export function pixelKneeling(w, h, x, foot, height, look, o = {}) {
  const L = new Px(w, h);
  const dir = o.dir || 1;
  // Note: item 376: the nemesis's face keeps its key light here too.
  look = faceLit(look);
  const lk = look ? { skin: C.ADOBE, hair: C.WOOD_D, coat: C.WOOD_D, vest: C.RED_D, legs: C.IRON, ...look } : { skin: C.ADOBE, hair: C.WOOD_D, coat: o.coat ?? C.WOOD_D, vest: null, hat: o.hat ?? C.DARK, legs: C.IRON };
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.5, cool: !!o.cool };
  const S = height / 1.8;
  const H = height / 7.5;
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  const P = (u, v) => [x + u * S * dir, foot - v * S];
  const lean = o.lean ?? 0.62;
  const hip = [-0.12, 0.64];
  const up = [Math.sin(lean), Math.cos(lean)];
  const perp = [Math.cos(lean), -Math.sin(lean)];
  const TR = (b, a) => P(hip[0] + perp[0] * b + up[0] * a, hip[1] + perp[1] * b + up[1] * a);
  const sh = [hip[0] + up[0] * 0.6, hip[1] + up[1] * 0.6];
  // Note: the rear leg, the knee in the dust and the shin along the ground behind; the front leg bent, the boot flat.
  lit(band([P(hip[0], hip[1]), P(-0.34, 0.14), P(-0.98, 0.08)], [S * 0.1, S * 0.075, S * 0.065]), step(lk.legs, -1), { depth: 0.5 });
  lit([P(-1.0, 0.0), P(-1.0, 0.14), P(-0.76, 0.14), P(-0.74, 0.0)], C.WOOD_D, { depth: 0.4 });
  lit(band([P(hip[0], hip[1]), P(0.46, 0.62), P(0.4, 0.14)], [S * 0.12, S * 0.095, S * 0.07]), lk.legs, { depth: 0.5 });
  lit([P(0.3, 0.2), P(0.5, 0.2), P(0.52, 0.1), P(0.72, 0.06), P(0.74, 0.0), P(0.28, 0.0)], C.WOOD_D, { depth: 0.4 });
  // Note: the coat's tail down behind the hip, the torso, a vest and a belt.
  lit([P(-0.1, 0.8), P(-0.5, 0.72), P(-0.74, 0.34), P(-0.52, 0.16), P(-0.2, 0.3)], lk.coat, { depth: 0.5 });
  lit([TR(-0.24, 0.0), TR(0.24, 0.0), TR(0.27, 0.35), TR(0.22, 0.56), TR(-0.04, 0.64), TR(-0.28, 0.5), TR(-0.3, 0.2)], lk.coat, { depth: 0.5 });
  if (lk.vest != null) lit([TR(0.14, 0.58), TR(0.26, 0.4), TR(0.25, 0.12), TR(0.12, 0.1)], lk.vest, { depth: 0.3, edge: false });
  lit([TR(-0.26, 0.08), TR(0.26, 0.08), TR(0.26, -0.02), TR(-0.26, -0.02)], C.WOOD, { depth: 0.3, edge: false });
  if (lk.badge) { const b = TR(0.2, 0.42); L.set(b[0], b[1], C.GOLD_L); L.set(b[0] + 1, b[1], C.GOLD); }
  // Note: the head and hat from the side figure, set on the shoulders and kept above them.
  const neck = P(sh[0] + 0.1, sh[1] + 0.05);
  const fig = pixelSide(w, h, neck[0], neck[1] + 6.0 * H, height, look || { ...lk, badge: false }, 'stand', { dir, lx: light.lx, ly: light.ly, cool: light.cool, coat: lk.coat, hat: lk.hat, hatless: o.hatless, girth: 1.0 });
  for (let y = 0; y < Math.round(neck[1] + 0.3 * H); y++) for (let xx = 0; xx < w; xx++) {
    const p = fig.a[y * w + xx];
    if (p !== NONE) L.set(xx, y, p);
  }
  // Note: the arm from the shoulder, elbow out, to the hand down on what he searches.
  const hand = o.hand ?? [1.05, 0.2];
  const s2 = P(sh[0], sh[1] - 0.04);
  lit(band([s2, P(sh[0] + 0.3, sh[1] - 0.34), P(hand[0], hand[1] + 0.06)], [S * 0.075, S * 0.062, S * 0.052]), step(lk.coat, 1), { depth: 0.45 });
  const [hx, hy] = P(hand[0], hand[1]);
  L.ellipse(hx, hy, Math.max(1, S * 0.05), Math.max(1, S * 0.045), lk.skin);
  return L;
}

// Note: a man seen from behind, the head and the whole body facing the same way: hat from behind, hair down the nape with the ears, the collar, the coat's back with its yoke, centre seam and vent, sleeves with the backs of the hands, trousers and boot heels; dir turns the head a little toward that side, showing a sliver of cheek.
export function pixelBack(w, h, x, foot, height, look, o = {}) {
  const L = new Px(w, h);
  const dir = o.dir || 1;
  const lk = { skin: C.ADOBE, hair: C.WOOD_D, coat: o.coat ?? C.WOOD_D, hat: o.hat ?? C.DARK, band: C.WOOD, hatStyle: 'round', hairStyle: 'short', ...(look || {}), legs: o.legs ?? C.IRON };
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.5, cool: !!o.cool };
  const H = (height / 7.5) * 0.975;
  const X = (u) => x + u * H;
  const Y = (v) => foot - v * H;
  const P = (pts) => pts.map(([u, v]) => [X(u), Y(v)]);
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  const big = H >= 6;
  // Note: trousers and boots from behind: two legs, heels and soles.
  for (const s of [-1, 1]) {
    const a = s * 0.06;
    const b = s * 0.8;
    lit(P([[a, 3.9], [b, 3.9], [b - s * 0.04, 1.0], [a + s * 0.0, 1.0]]), lk.legs, { depth: 0.45 });
    lit(P([[a - s * 0.02, 1.1], [b, 1.1], [b + s * 0.06, 0.0], [a - s * 0.04, 0.0]]), C.WOOD_D, { depth: 0.5 });
    L.rect(Math.min(X(a - s * 0.04), X(b + s * 0.06)), Y(0.2), Math.abs(X(b + s * 0.06) - X(a - s * 0.04)), Math.max(1, H * 0.2), C.DARK);
  }
  // Note: the coat's back, flaring to the hem with a vent up the middle.
  lit(P([[-0.95, 6.0], [-0.4, 6.15], [0.4, 6.15], [0.95, 6.0], [1.1, 4.5], [1.2, 3.4], [1.32, 1.5], [0.05, 1.42], [-0.05, 1.42], [-1.32, 1.5], [-1.2, 3.4], [-1.1, 4.5]]), lk.coat, { depth: 0.3 });
  if (big) {
    L.line(X(0), Y(5.9), X(0), Y(1.5), step(lk.coat, -1));
    L.line(X(-0.95), Y(5.4), X(0.95), Y(5.4), step(lk.coat, -1));
    L.line(X(-1.05), Y(3.7), X(1.05), Y(3.7), step(lk.coat, -1));
    L.line(X(0.06), Y(3.6), X(0.1), Y(1.5), step(lk.coat, -2));
  }
  // Note: sleeves hanging at the sides, a cuff and the back of each hand.
  for (const s of [-1, 1]) {
    const arm = P([[s * 1.0, 5.85], [s * 1.22, 4.7], [s * 1.16, 3.7]]);
    lit(band(arm, [H * 0.27, H * 0.22, H * 0.18]), step(lk.coat, s * light.lx > 0 ? 1 : 0), { depth: 0.45 });
    const [hx, hy] = arm[2];
    L.rect(hx - H * 0.2, hy - 1, H * 0.4, Math.max(1, H * 0.12), C.PLASTER);
    L.ellipse(hx, hy + H * 0.2, H * 0.17, H * 0.22, lk.skin);
  }
  // Note: the turned-up collar, the neck and the head: skin under hair, ears, a sliver of cheek toward dir.
  lit(P([[-0.5, 6.2], [0.5, 6.2], [0.55, 5.95], [-0.55, 5.95]]), step(lk.coat, 1), { depth: 0.4, edge: false });
  const tx = dir * 0.07;
  lit(P([[-0.18 + tx, 6.5], [0.18 + tx, 6.5], [0.2, 6.15], [-0.2, 6.15]]), step(lk.skin, -1), { depth: 0.6 });
  lit(P([[-0.4 + tx, 6.9], [-0.3 + tx, 7.2], [0.3 + tx, 7.2], [0.4 + tx, 6.9], [0.38 + tx, 6.45], [0.2 + tx, 6.2], [-0.2 + tx, 6.2], [-0.38 + tx, 6.45]]), lk.skin, { depth: 0.2, edge: false });
  const hair = lk.hairStyle === 'bald' ? step(lk.skin, -1) : lk.hair;
  const down = LONG_HAIR.has(lk.hairStyle) ? 5.85 : 6.3;
  lit(P([[-0.42 + tx, 6.95], [-0.3 + tx, 7.25], [0.3 + tx, 7.25], [0.42 + tx, 6.95], [0.4 + tx, 6.45], [0.24 + tx, down], [-0.24 + tx, down], [-0.4 + tx, 6.45]]), hair, { depth: 0.2, edge: false });
  for (const s of [-1, 1]) L.ellipse(X(s * 0.45 + tx), Y(6.7), Math.max(0.8, H * 0.07), Math.max(1, H * 0.13), s === dir ? lk.skin : step(lk.skin, -1));
  L.rect(X(dir * 0.38 + tx) - (dir > 0 ? 0 : 1), Y(6.85), 1, Math.max(2, H * 0.4), lk.skin);
  // Note: the hat from behind: the crown with its band and the wide brim, the brim shading the nape.
  if (lk.hat != null) {
    const crown = { flat: 0.42, bowler: 0.48, pinched: 0.6 }[lk.hatStyle] ?? 0.55;
    const bw = { wide: 1.15, round: 0.95, pinched: 1.0, flat: 1.05, bowler: 0.75, sombrero: 1.3 }[lk.hatStyle] ?? 0.95;
    L.shift(Math.min(X(-0.4 + tx), X(0.4 + tx)), Y(7.0), H * 0.8, Math.max(1, H * 0.5), -1, 0.5);
    lit(P([[-0.38 + tx, 7.15], [-0.34 + tx, 7.15 + crown], [0.34 + tx, 7.15 + crown], [0.38 + tx, 7.15]]), lk.hat, { depth: 0.45 });
    L.rect(X(-0.37 + tx), Y(7.3), H * 0.74, Math.max(1, H * 0.1), lk.band ?? C.DARK);
    lit(P([[-bw + tx, 7.1], [-bw * 0.7 + tx, 7.24], [bw * 0.7 + tx, 7.24], [bw + tx, 7.1], [bw * 0.6 + tx, 6.98], [-bw * 0.6 + tx, 6.98]]), lk.hat, { depth: 0.4 });
  }
  return L;
}
