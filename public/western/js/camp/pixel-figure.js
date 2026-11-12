// Note: people in the pixel storyboard panels (item 312): a full figure of about seven and a half heads in the colours of the character's look, lit from one side with a selective outline, with a face, a hat and a gun belt at any size.

import { C } from '../palette.js';
import { Px, step } from './pixel-art.js';

// Note: the hair styles that fall below the ears (a woman's loose hair, braids or plait among them), which a figure draws as long hair.
export const LONG_HAIR = new Set(['long', 'loose', 'braids', 'plait']);

// Note: a limb as a tapered band along a centre line.
function band(pts, w) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / n;
    const ny = (b[0] - a[0]) / n;
    left.push([pts[i][0] + nx * w[i], pts[i][1] + ny * w[i]]);
    right.push([pts[i][0] - nx * w[i], pts[i][1] - ny * w[i]]);
  }
  return [...left, ...right.reverse()];
}

// Note: item 376: the nemesis is never shadowed; his face gets a key light: the skin and hair lifted a step (two for the darkest skin), no brim shadow, and a glint in the eye.
const DARKEST = new Set([C.WOOD, C.WOOD_D, C.ADOBE_D]);
export const faceLit = (lk) => (lk && lk.kind === 'nemesis' && !lk.keyLight ? { ...lk, skin: step(lk.skin, DARKEST.has(lk.skin) ? 2 : 1), hair: step(lk.hair, 1), keyLight: true } : lk);

const PLAIN = { skin: C.ADOBE, hair: C.WOOD_D, coat: C.WOOD_D, vest: C.RED_D, shirt: C.PLASTER, hat: C.DARK, band: C.WOOD, legs: C.IRON, bandana: null, badge: false, beard: 'none', moustache: 'thin', hatStyle: 'round', hairStyle: 'short' };

// Note: draws one figure into a fresh layer the size of the scene; returns the layer so the scene can outline it, cast its shadow and lay it over the ground.
// Note: light: { lx, ly } points at the light, cool shades the far side blue (dusk and lamplight).
export function pixelFigure(w, h, x, foot, height, look, pose = 'stand', o = {}) {
  look = faceLit(look);
  const L = new Px(w, h);
  const lk = look ? { ...PLAIN, ...look, legs: o.legs ?? C.IRON } : { ...PLAIN, coat: o.coat ?? PLAIN.coat, hat: o.hat ?? PLAIN.hat, vest: o.vest ?? PLAIN.vest };
  const dir = o.dir || 1;
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.6, cool: !!o.cool };
  const H = height / 7.5;
  const X = (u) => x + u * H * dir;
  const Y = (v) => foot - v * H;
  const P = (list) => list.map(([u, v]) => [X(u), Y(v)]);
  const big = H >= 9;
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  // Note: a walker seen from behind keeps the feet under the body and strides: one foot planted, the other trailing with the heel up.
  const backWalk = !!o.back && pose === 'walk';
  const legW = backWalk ? 0.4 : { stand: 0.42, draw: 0.6, gun: 0.62, walk: 0.75, limp: 0.36, hatoff: 0.36, raise: 0.4 }[pose] ?? 0.42;
  // Note: which foot trails comes from where the walker stands in the frame, so a group never steps in lockstep.
  const trailing = o.stride === 'left' ? -1 : o.stride === 'right' ? 1 : (Math.round(x / Math.max(1, H)) & 1 ? 1 : -1);

  // Note: legs and boots.
  for (const s of [-1, 1]) {
    const k = s * legW;
    // Note: the trailing leg is bent at the knee, so its boot rides higher and shows its sole.
    const lift = backWalk && s === trailing ? 0.55 : 0;
    lit(P([[k - 0.4 + (s > 0 ? 0.3 : 0), 3.8], [k + 0.4 - (s < 0 ? 0.3 : 0), 3.8], [k + 0.36, 2.1 + lift * 0.4], [k + 0.3, 0.95 + lift], [k - 0.3, 0.95 + lift], [k - 0.34, 2.1 + lift * 0.4]]), backWalk && s === trailing ? step(lk.legs, -1) : lk.legs, { depth: 0.45 });
    // Note: seen from behind a boot has no toe: a square heel and sole.
    const boot = o.back ? [[k - 0.34, 1.05], [k + 0.34, 1.05], [k + 0.32, 0.28], [k + 0.4, 0.14], [k + 0.4, 0], [k - 0.4, 0], [k - 0.4, 0.14]] : [[k - 0.34, 1.05], [k + 0.34, 1.05], [k + 0.32, 0.28], [k + 0.5 * dir * s * 0 + 0.46, 0.14], [k + 0.48, 0], [k - 0.42, 0], [k - 0.42, 0.2]];
    lit(P(boot.map(([u, v]) => [u, v + lift])), C.WOOD_D, { depth: 0.5 });
    if (lift) {
      // Note: the sole of the raised boot, pale with wear, and the heel block under it.
      L.rect(X(k - 0.36), Y(lift + 0.06), Math.max(1, H * 0.72), Math.max(1, H * 0.12), C.PLANK);
      L.rect(X(k - 0.36), Y(lift - 0.02), Math.max(1, H * 0.28), Math.max(1, H * 0.1), C.DARK);
      continue;
    }
    if (big) {
      L.rect(X(k - 0.42), Y(0.12), Math.max(1, H * 0.25), Math.max(1, H * 0.12), C.SHADOW);
      L.set(o.back ? X(k) : X(k - 0.52), Y(0.2), C.GOLD_L);
      if (!o.back) L.line(X(k - 0.3), Y(2.15), X(k + 0.2), Y(2.0), step(lk.legs, -1));
    }
  }

  // Note: the shirt, the vest and its buttons; seen from behind, only the coat's back.
  if (!o.back) lit(P([[-0.55, 6.05], [0.55, 6.05], [0.6, 3.7], [-0.6, 3.7]]), lk.shirt, { depth: 0.3, edge: false });
  if (lk.vest != null && !o.back) {
    for (const s of [-1, 1]) lit(P([[s * 0.08, 5.3], [s * 0.6, 6.0], [s * 0.66, 3.75], [s * 0.05, 3.7]]), lk.vest, { depth: 0.5 });
    if (big) for (let i = 0; i < 4; i++) L.set(X(0.12), Y(5.1 - i * 0.38), C.GOLD_L);
    if (big) L.line(X(0.15), Y(4.75), X(0.5), Y(4.55), C.GOLD);
  }

  // Note: the gun belt, its cartridge loops and buckle.
  lit(P([[-0.72, 3.98], [0.72, 3.98], [0.74, 3.6], [-0.74, 3.6]]), C.WOOD, { depth: 0.3, edge: false });
  if (big) for (let u = -0.62; u <= 0.62; u += 0.16) L.set(X(u), Y(3.8), C.GOLD);
  if (!o.back) L.rect(X(-0.1) - (dir < 0 ? H * 0.2 : 0), Y(3.98), Math.max(1, H * 0.2), Math.max(1, H * 0.38), C.GOLD_L);

  // Note: the duster; the gun side is swept back clear of the holster.
  for (const s of o.back ? [] : [-1, 1]) {
    const gunSide = s === 1;
    const panel = gunSide
      ? [[0.42, 6.15], [1.05, 6.0], [1.12, 5.1], [1.08, 4.3], [0.92, 3.9], [1.22, 1.55], [0.98, 1.4], [0.7, 3.7], [0.55, 4.6], [0.5, 5.6]]
      : [[-0.42, 6.15], [-1.05, 6.0], [-1.14, 5.1], [-1.18, 3.4], [-1.3, 1.5], [-0.7, 1.4], [-0.55, 3.6], [-0.5, 4.8], [-0.5, 5.6]];
    lit(P(panel), lk.coat, { depth: gunSide ? 0.55 : 0.4 });
    if (big) {
      if (!o.back) L.line(...P(gunSide ? [[0.45, 6.1], [0.6, 5.3]] : [[-0.45, 6.1], [-0.6, 5.3]]).flat(), step(lk.coat, -2));
      for (let i = 0; i < 2; i++) L.line(...P(gunSide ? [[0.92, 3.3 - i * 0.7], [1.05, 2.6 - i * 0.6]] : [[-0.8 - i * 0.1, 3.1 - i * 0.6], [-1.0 - i * 0.1, 2.3 - i * 0.5]]).flat(), step(lk.coat, -1));
    }
  }
  // Note: the coat's back is one closed panel across both sides, shoulders rounded and wide, hanging straight to the hem, in the one coat colour; only thin lines mark the collar, the yoke, the centre seam and the vent.
  if (o.back) {
    lit(P([[-0.42, 6.22], [-0.82, 6.16], [-1.08, 5.98], [-1.16, 5.5], [-1.18, 4.3], [-1.22, 2.6], [-1.26, 1.45], [1.26, 1.45], [1.22, 2.6], [1.18, 4.3], [1.16, 5.5], [1.08, 5.98], [0.82, 6.16], [0.42, 6.22]]), lk.coat, { depth: 0.16 });
    L.line(X(-0.95), Y(5.4), X(0.95), Y(5.4), step(lk.coat, -1));
    L.line(X(0), Y(5.9), X(0), Y(3.3), step(lk.coat, -1));
    L.line(X(0), Y(3.3), X(0), Y(1.5), step(lk.coat, -2));
    L.set(X(-0.05), Y(1.46), step(lk.coat, -2));
    // Note: the gun belt from behind: a plain strap across the coat with the cartridge loops running round, and no buckle.
    lit(P([[-1.02, 3.98], [1.02, 3.98], [1.04, 3.6], [-1.04, 3.6]]), C.WOOD, { depth: 0.3, edge: false });
    if (big) for (let u = -0.9; u <= 0.9; u += 0.16) L.set(X(u), Y(3.8), C.GOLD);
    lit(P([[-0.5, 6.32], [0.5, 6.32], [0.56, 5.92], [-0.56, 5.92]]), step(lk.coat, 1), { depth: 0.4, edge: false });
  }
  if (lk.badge && !o.back) {
    const [bx, by] = [X(-0.62), Y(5.35)];
    const r = Math.max(1, Math.round(H * 0.16));
    L.rect(bx - r, by, r * 2 + 1, 1, C.GOLD);
    L.rect(bx, by - r, 1, r * 2 + 1, C.GOLD);
    L.set(bx, by, C.GOLD_L);
    if (r > 1) { L.set(bx - 1, by - 1, C.GOLD_L); L.set(bx + 1, by + 1, C.GOLD); }
  }

  // Note: the holster with the revolver's grip.
  if (pose !== 'gun' && !o.back) {
    lit(P([[0.78, 3.72], [1.02, 3.75], [1.04, 2.7], [0.9, 2.55], [0.8, 2.7]]), C.WOOD, { depth: 0.5 });
    lit(P([[0.8, 3.72], [0.98, 3.72], [1.0, 4.22], [0.88, 4.32], [0.78, 4.1]]), C.DARK, { depth: 0.4, hi: true });
  }

  // Note: the arms by pose: shoulder, elbow, wrist.
  const ARMS = {
    stand: [[[1.0, 5.85], [1.2, 4.7], [1.14, 3.55]], [[-1.0, 5.85], [-1.22, 4.7], [-1.16, 3.55]]],
    limp: [[[1.0, 5.85], [1.45, 5.0], [1.7, 4.3]], [[-1.0, 5.85], [-1.5, 6.4], [-1.9, 6.8]]],
    walk: [[[1.0, 5.85], [1.1, 4.7], [0.8, 3.7]], [[-1.0, 5.85], [-1.3, 4.7], [-1.5, 3.8]]],
    draw: [[[1.0, 5.85], [1.42, 4.75], [1.1, 4.05]], [[-1.0, 5.85], [-1.3, 4.75], [-1.25, 3.7]]],
    gun: [[[1.0, 5.85], [1.9, 5.65], [2.75, 5.6]], [[-1.0, 5.85], [-1.22, 4.7], [-1.16, 3.55]]],
    hatoff: [[[1.0, 5.85], [1.05, 4.8], [0.3, 4.9]], [[-1.0, 5.85], [-1.05, 4.8], [-0.3, 4.9]]],
    raise: [[[1.0, 5.85], [1.6, 6.6], [1.55, 7.6]], [[-1.0, 5.85], [-1.22, 4.7], [-1.16, 3.55]]],
    hold: [[[1.0, 5.85], [1.25, 4.8], [1.9, 4.6]], [[-1.0, 5.85], [-1.22, 4.7], [-1.16, 3.55]]],
  }[pose] || [[[1.0, 5.85], [1.2, 4.7], [1.14, 3.55]], [[-1.0, 5.85], [-1.22, 4.7], [-1.16, 3.55]]];
  for (const arm of ARMS) {
    const a = P(arm);
    lit(band(a, [H * 0.26, H * 0.21, H * 0.17]), lk.coat, { depth: 0.45 });
    const [ex, ey] = a[1];
    const [wx, wy] = a[2];
    const ang = Math.atan2(wy - ey, wx - ex);
    if (big) L.line(ex - Math.cos(ang + 1.57) * H * 0.15, ey - Math.sin(ang + 1.57) * H * 0.15, ex + Math.cos(ang) * H * 0.12, ey + Math.sin(ang) * H * 0.12, step(lk.coat, -1));
    const hx = wx + Math.cos(ang) * H * 0.2;
    const hy = wy + Math.sin(ang) * H * 0.2;
    lit([[hx - H * 0.17, hy - H * 0.2], [hx + H * 0.17, hy - H * 0.2], [hx + H * 0.19, hy + H * 0.18], [hx - H * 0.15, hy + H * 0.22]], lk.skin, { depth: 0.45 });
    if (big) L.set(hx + Math.cos(ang + 1.4) * H * 0.2, hy + Math.sin(ang + 1.4) * H * 0.2, lk.skin);
  }
  if (pose === 'gun') {
    const [wx, wy] = [X(3.0), Y(5.62)];
    L.rect(Math.min(wx, wx + H * 0.95 * dir), wy - H * 0.12, H * 0.95, Math.max(1, H * 0.16), C.IRON);
    L.rect(Math.min(wx, wx + H * 0.2 * dir), wy, Math.max(1, H * 0.2), H * 0.38, C.WOOD_D);
    L.rect(Math.min(wx, wx + H * 0.9 * dir), wy - H * 0.12, H * 0.9, 1, C.STONE_L);
  }
  if (pose === 'hatoff') {
    const [cx, cy] = [X(0), Y(4.95)];
    L.lit([[cx - H * 0.5, cy], [cx - H * 0.45, cy - H * 0.65], [cx + H * 0.45, cy - H * 0.65], [cx + H * 0.5, cy]], lk.hat, light);
    L.lit([[cx - H * 0.95, cy - 1], [cx + H * 0.95, cy - 1], [cx + H * 0.9, cy + H * 0.3], [cx - H * 0.9, cy + H * 0.3]], lk.hat, light);
  }
  if (lk.bandana != null && !o.back) lit(P([[-0.42, 6.15], [0.42, 6.15], [0.05, 5.5]]), lk.bandana, { depth: 0.4 });

  head(L, x, Y(6.0), H, lk, dir, light, { back: !!o.back, hatless: pose === 'hatoff' || o.hatless, wounds: o.wounds || [], brim: lk.keyLight ? 0 : o.brim ?? (H >= 20 ? 0.45 : 0.6) });
  return L;
}

// Note: the head, front-facing and turned a pixel or two toward dir: skin, ears, hair, eyes, brows, nose, mouth, beard, moustache, scar, and the hat whose brim shades the eyes.
function head(L, x, chinY, H, lk, dir, light, o) {
  const hw = H * 0.4;
  const hh = H * 0.55;
  const cx = o.back ? x : x + dir * Math.max(0, H * 0.04);
  const cy = chinY - hh;
  const lt = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  // Note: the neck.
  lt([[x - H * 0.18, chinY - 1], [x + H * 0.18, chinY - 1], [x + H * 0.2, chinY + H * 0.2], [x - H * 0.2, chinY + H * 0.2]], step(lk.skin, -1), { depth: 0.6 });
  // Note: hair behind, long hair down the sides.
  if (LONG_HAIR.has(lk.hairStyle)) lt([[cx - hw - 1, cy - hh * 0.5], [cx + hw + 1, cy - hh * 0.5], [cx + hw + 1, chinY + H * 0.25], [cx - hw - 1, chinY + H * 0.25]], lk.hair, { depth: 0.5 });
  const face = [[cx - hw, cy - hh * 0.6], [cx - hw * 0.85, cy - hh], [cx + hw * 0.85, cy - hh], [cx + hw, cy - hh * 0.6], [cx + hw, cy + hh * 0.2], [cx + hw * 0.55, chinY - 0.5], [cx - hw * 0.55, chinY - 0.5], [cx - hw, cy + hh * 0.2]];
  for (const s of [-1, 1]) L.ellipse(cx + s * (hw + 0.6), cy, Math.max(0.8, H * 0.08), Math.max(1, H * 0.13), step(lk.skin, -1));
  if (!o.back) {
    // Note: a face keeps one step of shade at most, so it always reads (item 376).
    lt(face, lk.skin, { depth: 0.3, edge: false });
  }
  if (o.back) {
    // Note: the back of the head: a short block of hair from the hat to the nape with a ragged lower edge, an ear on each side, and the collar just below; no oval of shaded face.
    // Note: the skull narrows to the nape, the hair stops there, and below it only the neck shows down to the collar, so no jaw or chin is drawn.
    const nape = cy + hh * 0.55;
    const skull = [[cx - hw, cy - hh * 0.6], [cx + hw, cy - hh * 0.6], [cx + hw * 0.95, cy + hh * 0.15], [cx + hw * 0.6, nape], [cx - hw * 0.6, nape], [cx - hw * 0.95, cy + hh * 0.15]];
    lt(skull, lk.hairStyle === 'bald' ? step(lk.skin, -1) : lk.hair, { depth: 0.4 });
    for (const s2 of [-1, 1]) L.ellipse(cx + s2 * (hw + 0.3), cy + hh * 0.02, Math.max(0.7, H * 0.06), Math.max(1, H * 0.11), step(lk.skin, -1));
    // Note: the neck sits in the shade of the brim and the collar, two steps darker than the skin, so it never reads as a face.
    lt([[cx - hw * 0.34, nape], [cx + hw * 0.34, nape], [cx + hw * 0.38, chinY + H * 0.2], [cx - hw * 0.38, chinY + H * 0.2]], step(lk.skin, -2), { depth: 0.5 });
    hat(L, cx, cy, H, lk, light, o);
    return;
  }
  if (H < 6) {
    hat(L, cx, cy, H, lk, light, o);
    return;
  }
  const ey = Math.round(cy - hh * 0.02);
  const ex = Math.max(1, Math.round(hw * 0.45));
  // Note: hair at the temples and on top when bare-headed.
  if (lk.hairStyle !== 'bald') {
    L.rect(cx - hw, cy - hh, 1, hh * 0.9, lk.hair);
    L.rect(cx + hw - 1, cy - hh, 1, hh * 0.9, lk.hair);
    if (o.hatless) lt([[cx - hw - 1, cy - hh * 0.55], [cx - hw * 0.6, cy - hh * 1.1], [cx + hw * 0.6, cy - hh * 1.1], [cx + hw + 1, cy - hh * 0.55], [cx + hw * 0.4, cy - hh * 0.75], [cx - hw * 0.5, cy - hh * 0.72]], lk.hair, { depth: 0.4 });
  }
  // Note: brows, eyes, nose, mouth; a large head gets lids, whites, a shaped nose, cheekbones and lips.
  const brow = step(lk.hair, -1);
  const dk = step(lk.skin, -2);
  const md = step(lk.skin, -1);
  const lt2 = step(lk.skin, 1);
  const big = H >= 13;
  for (const s of [-1, 1]) {
    const px = Math.round(cx + s * ex);
    if (big) {
      const bw = Math.max(1, Math.round(H * 0.14));
      L.rect(px - bw, ey - Math.round(H * 0.13), bw * 2 + 1, 2, brow);
      L.set(px + s * (bw + 1), ey - Math.round(H * 0.11), brow);
      L.rect(px - bw + 1, ey - 1, bw * 2 - 1, 1, dk);
      L.rect(px - bw + 1, ey, bw * 2 - 1, 1, C.BONE);
      L.rect(px - 1, ey, 2, 1, C.VOID);
      L.set(px + s * -1, ey, step(lk.eyes ?? C.WOOD_D, 0));
      L.rect(px - bw + 1, ey + 1, bw * 2 - 1, 1, md);
      // Note: the cheekbone's shade under the eye.
      L.rect(px - (s < 0 ? bw : 0), ey + Math.round(H * 0.16), bw, 1, md);
    } else {
      L.rect(px - (H >= 14 ? 1 : 0), ey - Math.max(2, Math.round(H * 0.12)), H >= 14 ? 3 : 2, 1, brow);
      L.set(px, ey, C.VOID);
      if (H >= 14) { L.set(px - s, ey, C.BONE); L.set(px, ey - 1, dk); }
    }
  }
  const nx = Math.round(cx + dir * 1);
  const nl = Math.max(1, Math.round(H * (big ? 0.2 : 0.16)));
  L.rect(nx, ey + 1, 1, nl, md);
  if (big) {
    L.rect(nx - dir, ey + 2, 1, nl - 1, lt2);
    L.rect(nx - 2, ey + nl + 1, 5, 1, md);
    L.set(nx - 2, ey + nl, dk);
    L.set(nx + 2, ey + nl, dk);
  } else L.set(nx - dir, ey + 1 + nl, dk);
  const my = Math.round(cy + hh * 0.45);
  const mw = Math.max(2, Math.round(hw * 0.7));
  L.rect(Math.round(cx - hw * 0.35), my, mw, 1, dk);
  if (big) {
    L.rect(Math.round(cx - hw * 0.25), my + 1, Math.round(hw * 0.5), 1, lt2);
    L.rect(Math.round(cx - hw * 0.2), my + 3, Math.round(hw * 0.4), 1, md);
    L.line(cx - hw * 0.5, ey + nl - 1, cx - hw * 0.45, my - 1, md);
    L.line(cx + hw * 0.5, ey + nl - 1, cx + hw * 0.45, my - 1, md);
  }
  if (lk.beard === 'full') lt([[cx - hw, cy + hh * 0.15], [cx - hw * 0.5, my - 1], [cx + hw * 0.5, my - 1], [cx + hw, cy + hh * 0.15], [cx + hw * 0.7, chinY + H * 0.12], [cx, chinY + H * 0.22], [cx - hw * 0.7, chinY + H * 0.12]], lk.hair, { depth: 0.4, edge: false });
  if (lk.beard === 'stubble') L.wash(cx - hw, cy + hh * 0.2, hw * 2, hh * 0.85, step(lk.skin, -2), 0.3);
  if (lk.beard === 'goatee') L.rect(cx - 1, my + 1, 3, Math.max(2, H * 0.14), lk.hair);
  if (lk.beard === 'chops') for (const s of [-1, 1]) L.rect(s < 0 ? cx - hw : cx + hw - 2, cy - hh * 0.2, 2, hh * 0.85, lk.hair);
  if (lk.moustache !== 'none') {
    const mw2 = lk.moustache === 'handlebar' ? hw * 0.95 : lk.moustache === 'walrus' ? hw * 0.75 : hw * 0.55;
    const mh = (lk.moustache === 'walrus' ? 2 : 1) * (H >= 18 ? 2 : 1);
    L.rect(Math.round(cx - mw2), my - mh, Math.round(mw2 * 2) + 1, mh, step(lk.hair, -1));
    if (H >= 18) L.rect(Math.round(cx - mw2 + 1), my - mh, Math.round(mw2 * 2) - 1, 1, lk.hair);
    if (lk.moustache === 'handlebar') { L.set(cx - mw2 - 1, my - mh - 1, lk.hair); L.set(cx + mw2 + 1, my - mh - 1, lk.hair); }
  }
  if (lk.scar === 'cheek') L.line(cx + hw * 0.5, ey + 1, cx + hw * 0.7, my, C.ADOBE_L);
  if (lk.scar === 'brow') L.line(cx - ex - 1, ey - 3, cx - ex, ey + 1, C.ADOBE_L);
  for (const wnd of o.wounds) if (wnd === 'head') L.rect(cx - hw, cy - hh * 0.6, hw * 2, Math.max(1, H * 0.12), C.BONE);
  hat(L, cx, cy, H, lk, light, o, ey);
}

function hat(L, cx, cy, H, lk, light, o, ey = null) {
  if (o.hatless || lk.hat == null) return;
  const hh = H * 0.55;
  const brimY = cy - hh * 0.55;
  const bw = { wide: 1.15, round: 0.95, pinched: 1.0, flat: 1.05, bowler: 0.75, sombrero: 1.3 }[lk.hatStyle] ?? 0.95;
  const crown = { flat: 0.42, bowler: 0.5, pinched: 0.6 }[lk.hatStyle] ?? 0.55;
  // Note: the brim's shadow over the brow and eyes.
  if (ey != null && !o.back) L.shift(cx - H * 0.45, brimY, H * 0.9, Math.max(1, ey - brimY - 1), -1, o.brim ?? 0.5);
  L.lit([[cx - H * 0.38, brimY], [cx - H * 0.34, brimY - H * crown], [cx, brimY - H * crown + 1], [cx + H * 0.34, brimY - H * crown], [cx + H * 0.38, brimY]], lk.hat, { ...light, depth: 0.45 });
  if (lk.hatStyle === 'pinched' && H >= 10) L.set(cx, brimY - H * crown + 1, step(lk.hat, -2));
  L.rect(cx - H * 0.37, brimY - Math.max(1, H * 0.12), H * 0.74, Math.max(1, H * 0.1), lk.band ?? C.DARK);
  L.lit([[cx - H * bw, brimY + 1], [cx - H * bw * 0.7, brimY - H * 0.08], [cx + H * bw * 0.7, brimY - H * 0.08], [cx + H * bw, brimY + 1], [cx + H * bw * 0.6, brimY + H * 0.12], [cx - H * bw * 0.6, brimY + H * 0.12]], lk.hat, { ...light, depth: 0.4 });
  // Note: from behind the brim's far edge catches the light as a rim over the crown line, the crown's back face has a crease and a lit top, and the brim throws a thin shade on the hair below.
  if (o.back) {
    L.line(cx - H * bw * 0.7, brimY - H * 0.08, cx + H * bw * 0.7, brimY - H * 0.08, step(lk.hat, 2));
    L.line(cx - H * 0.3, brimY - H * crown + 1, cx + H * 0.3, brimY - H * crown + 1, step(lk.hat, 1));
    L.line(cx, brimY - H * crown + 2, cx, brimY - H * 0.14, step(lk.hat, -1));
    L.shift(cx - H * 0.36, brimY + H * 0.12, H * 0.72, 2, -1, 0.7);
  }
}

// Note: a figure seen side on, facing dir (1 to the right): the far limbs a shade darker behind the body, the face in profile under the hat brim.
// Note: poses: stand, walk, draw (hand over the holster), gun (arm out with the revolver), reel (struck, arms flung back).
export function pixelSide(w, h, x, foot, height, look, pose = 'stand', o = {}) {
  look = faceLit(look);
  const L = new Px(w, h);
  const lk = look ? { ...PLAIN, ...look, legs: o.legs ?? C.IRON } : { ...PLAIN, coat: o.coat ?? PLAIN.coat, hat: o.hat ?? PLAIN.hat, vest: o.vest ?? PLAIN.vest };
  const dir = o.dir || 1;
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.6, cool: !!o.cool };
  const H = height / 7.5;
  // Note: a body side on is drawn a little stouter than true, so it reads as a man and not a post.
  const girth = o.girth ?? 1.3;
  const X = (u) => x + u * H * dir * girth;
  const Y = (v) => foot - v * H;
  const P = (list) => list.map(([u, v]) => [X(u), Y(v)]);
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  const big = H >= 7;
  const far = (c) => step(c, -1);
  const stride = { walk: 0.55, draw: 0.32, gun: 0.42, reel: 0.3, stand: 0.12 }[pose] ?? 0.15;

  const leg = (front, c) => {
    const k = front ? stride : -stride;
    lit(band(P([[0, 3.7], [k * 0.7, 2.1], [k, 0.95]]), [H * 0.3, H * 0.26, H * 0.2]), c, { depth: 0.4 });
    lit(P([[k - 0.28, 1.05], [k + 0.16, 1.05], [k + 0.2, 0.32], [k + 0.52, 0.2], [k + 0.56, 0], [k - 0.3, 0], [k - 0.32, 0.18]]), front ? C.WOOD_D : C.DARK, { depth: 0.4 });
    if (big) L.set(X(k - 0.38), Y(0.18), C.GOLD_L);
  };
  const ARM = {
    stand: [[0.02, 5.75], [0.12, 4.6], [0.1, 3.6]],
    walk: [[0.02, 5.75], [0.3, 4.65], [0.45, 3.8]],
    draw: [[0.02, 5.75], [-0.2, 4.65], [0.0, 3.95]],
    gun: [[0.05, 5.75], [0.9, 5.62], [1.7, 5.58]],
    reel: [[0.0, 5.75], [-0.6, 6.3], [-1.05, 6.85]],
    // Note: point (arm out ahead and a little up), throw (arm following through ahead and down), hat (hand holding a hat to the chest), jaw (hand to the jaw): each from the near shoulder, toward the way he faces.
    point: [[0.05, 5.75], [0.9, 5.95], [1.75, 6.1]],
    throw: [[0.05, 5.75], [0.85, 5.35], [1.6, 4.55]],
    hat: [[0.02, 5.75], [0.45, 5.0], [0.5, 5.55]],
    jaw: [[0.0, 5.75], [0.4, 4.9], [0.4, 6.3]],
  };
  const FAR_ARM = { stand: ARM.stand, walk: [[0.0, 5.75], [-0.25, 4.65], [-0.4, 3.8]], draw: [[0.0, 5.75], [0.15, 4.6], [0.3, 3.75]], gun: [[0.0, 5.75], [0.1, 4.6], [0.15, 3.6]], reel: [[0.0, 5.75], [0.5, 6.4], [0.75, 7.0]] };
  const arm = (pts, c, hand = true) => {
    const a = P(pts);
    lit(band(a, [H * 0.24, H * 0.2, H * 0.16]), c, { depth: 0.45 });
    if (!hand) return;
    const [ex, ey] = a[1];
    const [wx, wy] = a[2];
    const ang = Math.atan2(wy - ey, wx - ex);
    const hx = wx + Math.cos(ang) * H * 0.17;
    const hy = wy + Math.sin(ang) * H * 0.17;
    L.ellipse(hx, hy, H * 0.15, H * 0.15, lk.skin);
  };

  arm(FAR_ARM[pose] || ARM.stand, far(lk.coat));
  leg(false, far(lk.legs));
  leg(true, lk.legs);
  // Note: the duster in profile, its tail flaring behind; the vest shows at the front.
  const coat = [[-0.5, 6.0], [-0.2, 6.15], [0.32, 6.08], [0.52, 5.3], [0.48, 4.3], [0.38, 3.75], [0.52, 1.65], [0.1, 1.5], [-0.85, 1.45], [-0.68, 3.5], [-0.6, 5.0]];
  lit(P(coat), lk.coat, { depth: 0.5 });
  if (lk.vest != null) lit(P([[0.3, 5.85], [0.46, 5.3], [0.44, 3.95], [0.3, 3.85]]), lk.vest, { depth: 0.3, edge: false });
  lit(P([[-0.45, 3.98], [0.45, 3.98], [0.45, 3.65], [-0.45, 3.65]]), C.WOOD, { depth: 0.3, edge: false });
  if (big) for (let u = -0.35; u <= 0.35; u += 0.15) L.set(X(u), Y(3.82), C.GOLD);
  if (pose !== 'gun') {
    lit(P([[-0.12, 3.7], [0.12, 3.7], [0.14, 2.75], [-0.02, 2.6], [-0.12, 2.75]]), C.WOOD, { depth: 0.5 });
    lit(P([[-0.1, 3.7], [0.1, 3.7], [0.0, 4.25], [-0.16, 4.2]]), C.DARK, { depth: 0.4 });
  }
  if (big) L.line(X(-0.2), Y(3.3), X(-0.45), Y(1.7), step(lk.coat, -1));
  if (lk.badge) L.set(X(0.36), Y(5.3), C.GOLD_L);
  arm(ARM[pose] || ARM.stand, step(lk.coat, 1));
  if (pose === 'hat') {
    const [hx, hy] = P([ARM.hat[2]])[0];
    L.ellipse(hx, hy - H * 0.08, H * 0.5, Math.max(1, H * 0.1), lk.hat ?? C.DARK);
    L.ellipse(hx, hy - H * 0.28, H * 0.27, H * 0.2, lk.hat ?? C.DARK);
  }
  if (pose === 'gun') {
    const [gx, gy] = [X(1.82), Y(5.6)];
    L.rect(Math.min(gx, gx + H * 0.75 * dir), gy - Math.max(1, H * 0.08), H * 0.75, Math.max(1, H * 0.14), C.IRON);
    L.rect(Math.min(gx, gx - H * 0.12 * dir), gy, Math.max(1, H * 0.16), H * 0.3, C.WOOD_D);
  }
  // Note: the neck and the head in profile.
  lit(P([[-0.1, 6.0], [0.16, 6.0], [0.14, 6.35], [-0.12, 6.35]]), step(lk.skin, -1), { depth: 0.5 });
  const skull = P([[-0.4, 6.75], [-0.3, 7.2], [0.0, 7.35], [0.3, 7.25], [0.38, 7.0], [0.52, 6.78], [0.4, 6.68], [0.42, 6.56], [0.36, 6.4], [0.3, 6.3], [0.05, 6.28], [-0.3, 6.4]]);
  lit(skull, lk.skin, { depth: 0.3, edge: false });
  // Note: hair at the back of the head and above the ear.
  if (lk.hairStyle !== 'bald') lit(P([[-0.42, 6.62], [-0.38, 7.2], [0.0, 7.36], [0.0, 7.1], [-0.12, 6.95], [-0.2, 6.5]]), lk.hair, { depth: 0.4, edge: false });
  if (LONG_HAIR.has(lk.hairStyle)) lit(P([[-0.42, 6.9], [-0.15, 6.9], [-0.2, 6.0], [-0.48, 6.1]]), lk.hair, { depth: 0.4 });
  L.ellipse(X(-0.08), Y(6.82), Math.max(0.6, H * 0.07), Math.max(0.8, H * 0.1), step(lk.skin, -1));
  L.set(X(0.27), Y(6.95), C.VOID);
  if (lk.keyLight) L.set(X(0.3), Y(6.97), C.BONE);
  if (H >= 9) L.set(X(0.25), Y(7.06), step(lk.hair, -1));
  if (lk.beard === 'full' || lk.beard === 'chops') lit(P([[-0.02, 6.75], [0.25, 6.6], [0.36, 6.42], [0.3, 6.27], [0.05, 6.27], [-0.15, 6.45]]), lk.hair, { depth: 0.4, edge: false });
  if (lk.beard === 'goatee') L.set(X(0.34), Y(6.32), lk.hair);
  if (lk.moustache !== 'none') L.rect(Math.min(X(0.32), X(0.44)), Y(6.66), Math.max(1, H * 0.12), 1, step(lk.hair, -1));
  if (lk.bandana != null) lit(P([[-0.15, 6.05], [0.2, 6.05], [0.3, 5.7], [0.0, 5.75]]), lk.bandana, { depth: 0.3 });
  // Note: the hat from the side: a long thin brim and the crown.
  if (!o.hatless && lk.hat != null) {
    const crown = { flat: 0.42, bowler: 0.48, pinched: 0.58 }[lk.hatStyle] ?? 0.52;
    const reach = { wide: 0.85, sombrero: 1.0, bowler: 0.5 }[lk.hatStyle] ?? 0.72;
    lit(P([[-0.36, 7.15], [-0.3, 7.15 + crown], [0.08, 7.12 + crown], [0.34, 7.15 + crown - 0.05], [0.38, 7.15]]), lk.hat, { depth: 0.45 });
    L.rect(Math.min(X(-0.36), X(0.38)), Y(7.28), H * 0.74, Math.max(1, H * 0.08), lk.band ?? C.DARK);
    lit(P([[-reach, 7.18], [-0.2, 7.24], [0.3, 7.22], [reach + 0.1, 7.12], [reach, 7.06], [0.0, 7.1], [-reach + 0.05, 7.08]]), lk.hat, { depth: 0.35 });
    if (!lk.keyLight) L.shift(Math.min(X(-0.1), X(0.55)), Y(7.08), H * 0.65, Math.max(1, H * 0.22), -1, 0.5);
  }
  return L;
}
