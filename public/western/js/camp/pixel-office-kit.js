// Note: shared pieces of the office and close-up panels (items 378, 380, 381, 383): materials as functions of the hit point, props in metres, limbs and heads from projected joints, and layers that sit in a rendered scene.

import { C } from '../palette.js';
import { Px, step, dith, NONE, text, signText, textWidth } from './pixel-art.js';
import { box, noise, shadeOf } from './pixel-3d.js';

// Note: true when the point (x, y) is inside the rectangle R as [x0, x1, y0, y1].
export const inRect = (x, y, R) => x > R[0] && x < R[1] && y > R[2] && y < R[3];

// Note: planks with seams, grain, knots and nails; along is the coordinate across the boards, across the one along them.
export function boards(c, along, across, width = 0.19, fine = 1) {
  const u = along / width;
  const i2 = Math.floor(u);
  const f2 = u - i2;
  if (f2 < 0.08) return { c: step(c, -2) };
  const base = noise(i2, 7) < 0.3 ? step(c, -1) : c;
  if (noise(i2 * 3 + Math.floor(f2 * 10 * fine), Math.floor(across * 14)) > (fine > 1 ? 0.8 : 0.9)) return { c: step(base, -1) };
  if (noise(i2, Math.floor(across * 2)) > 0.97 && Math.abs(f2 - 0.5) < 0.2) return { c: step(base, -2) };
  return { c: base };
}

// Note: plaster with fine flecks and the odd hairline crack.
export function plaster(x, y, c = C.PLASTER) {
  const n = noise(Math.floor(x * 30), Math.floor(y * 30));
  if (n > 0.975) return { c: step(c, -1) };
  if (n < 0.012) return { c: step(c, 1) };
  if (noise(Math.floor(x * 3), 5) > 0.9 && Math.abs(((y * 7 + x * 3) % 1) - 0.5) < 0.04) return { c: step(c, -1) };
  return { c };
}

// Note: a material that reads a small picture laid on a face: u and v from the hit point by the given functions; NONE falls back to base.
export const sheet = (tex, uv, base = C.PLASTER_L) => (p, n) => {
  const [u, v] = uv(p, n);
  const c = tex.get(Math.floor(u * tex.w), Math.floor(v * tex.h));
  return { c: c === NONE ? base : c };
};

// Note: a paper lying flat on a surface: its box is a hair thick; the picture reads from its top face, turned by rot (radians) about its centre.
export function paper(cx, y, cz, w, d, tex, rot = 0, base = C.PLASTER_L, torn = false) {
  const rad = Math.hypot(w, d) / 2;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return box([cx - rad, y, cz - rad], [cx + rad, y + 0.004, cz + rad], (p, n) => {
    if (n[1] <= 0) return null;
    const dx = p[0] - cx;
    const dz = p[2] - cz;
    const u = (dx * cs + dz * sn) / w + 0.5;
    const v = (-dx * sn + dz * cs) / d + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const c = tex.get(Math.floor(u * tex.w), Math.floor(v * tex.h));
    if (c === NONE && torn) return null;
    return { c: c === NONE ? base : c };
  });
}

// Note: a lamp on a surface at (x, y, z): its foot, glass and a warm light at the flame that casts shadows.
export function lamp(x, y, z, { power = 2.2, reach = 1.4 } = {}) {
  return {
    boxes: [
      box([x - 0.07, y, z - 0.07], [x + 0.07, y + 0.06, z + 0.07], () => ({ c: C.IRON })),
      box([x - 0.035, y + 0.06, z - 0.035], [x + 0.035, y + 0.11, z + 0.035], () => ({ c: C.IRON_L })),
      box([x - 0.06, y + 0.11, z - 0.06], [x + 0.06, y + 0.28, z + 0.06], () => ({ emit: C.GOLD_L }), { noShadow: true }),
      box([x - 0.045, y + 0.28, z - 0.045], [x + 0.045, y + 0.3, z + 0.045], () => ({ c: C.IRON })),
    ],
    light: { pos: [x, y + 0.2, z], power, reach, shadows: true },
  };
}

// Note: the screen direction from one world point toward another, for the way a sprite is lit.
export function toward(cam, a, b) {
  const [ax, ay] = cam.project(a);
  const [bx, by] = cam.project(b);
  const n = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / n, (by - ay) / n];
}

// Note: keeps a sprite layer only where nothing nearer than its depth was rendered, so the desk or a doorframe hides what stands behind it.
export function masked(L, info, depth, slack = 0.06) {
  const out = new Px(L.w, L.h);
  for (let i = 0; i < L.a.length; i++) {
    if (L.a[i] === NONE) continue;
    const h = info[i];
    if (!h || h.t > depth - slack) out.a[i] = L.a[i];
  }
  return out;
}

// Note: a limb as a tapered capsule between two world points, lit from the screen direction light; soft gives flat colour with one shaded side and a bright edge, for hands and fingers that must stay clean.
export function limb(L, cam, a, b, ra, rb, c, light, depth = 0.5, soft = false) {
  const [ax, ay, ad] = cam.project(a);
  const [bx, by, bd] = cam.project(b);
  const sa = Math.max(0.6, (cam.f / ad) * ra);
  const sb = Math.max(0.6, (cam.f / bd) * rb);
  const n = Math.hypot(bx - ax, by - ay) || 1;
  const nx = -(by - ay) / n;
  const ny = (bx - ax) / n;
  const quad = (k0, k1) => [[ax + nx * sa * k0, ay + ny * sa * k0], [bx + nx * sb * k0, by + ny * sb * k0], [bx + nx * sb * k1, by + ny * sb * k1], [ax + nx * sa * k1, ay + ny * sa * k1]];
  if (!soft) {
    L.ellipse(ax, ay, sa, sa, c);
    L.ellipse(bx, by, sb, sb, c);
    L.lit(quad(1, -1), c, { ...light, depth });
    return;
  }
  // Note: the side whose normal faces the light is the lit one; soft draws in two passes ('fill' then 'shade') so overlapping joints do not blotch.
  const s = nx * light.lx + ny * light.ly >= 0 ? 1 : -1;
  if (soft === true) {
    limb(L, cam, a, b, ra, rb, c, light, depth, 'fill');
    limb(L, cam, a, b, ra, rb, c, light, depth, 'shade');
    return;
  }
  if (soft === 'shade') {
    L.poly(quad(-0.3 * s, -s), step(c, -1));
    L.poly(quad(0.8 * s, s), step(c, 1));
    return;
  }
  L.ellipse(ax, ay, sa, sa, c);
  L.ellipse(bx, by, sb, sb, c);
  L.poly(quad(1, -1), c);
}

// Note: a world polygon through the camera, lit.
export function wpoly(L, cam, pts, c, light, extra = {}) {
  L.lit(pts.map((p) => cam.project(p).slice(0, 2)), c, { ...light, ...extra });
}

// Note: a hand from a wrist point, a reach direction and the back-of-hand direction (up): a palm, four fingers of three joints that curl a little more at each joint, a thumb, knuckles and nails, all projected through the camera; curl bends the fingers down toward the palm's side.
export function hand(L, cam, wrist, dir, up, light, skin, { curl = 0.3, size = 0.09, thumb = 1, spread = 1 } = {}) {
  const nd = Math.hypot(dir[0], dir[1], dir[2]);
  const d = dir.map((v) => v / nd);
  const dp = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const u0 = up.map((v, i) => v - d[i] * dp);
  const nu = Math.hypot(u0[0], u0[1], u0[2]);
  const u = u0.map((v) => v / nu);
  const sd = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const at = (f, s, h) => [wrist[0] + d[0] * f + sd[0] * s + u[0] * h, wrist[1] + d[1] * f + sd[1] * s + u[1] * h, wrist[2] + d[2] * f + sd[2] * s + u[2] * h];
  const sz = size;
  const dark = step(skin, -1);
  // Note: the palm and the back of the hand, a little wider across the knuckles than at the wrist.
  const palm = [at(0, -sz * 0.4, 0), at(sz * 0.4, -sz * 0.5, 0), at(sz * 1.0, -sz * 0.52, 0), at(sz * 1.05, sz * 0.52, 0), at(sz * 0.4, sz * 0.5, 0), at(0, sz * 0.4, 0)].map((q) => cam.project(q).slice(0, 2));
  L.poly(palm, skin);
  L.poly([palm[3], palm[4], palm[5], [palm[5][0], palm[5][1] + 1], [palm[4][0], palm[4][1] + 2]], dark);
  const segs = [];
  const fl = [0.8, 1.0, 0.95, 0.74];
  for (let k = 0; k < 4; k++) {
    const s = (k - 1.5) * sz * 0.34 * spread;
    const ln = sz * fl[k];
    const cv = curl * (0.8 + k * 0.1);
    const j0 = at(sz * 1.0, s * 0.85, 0);
    const j1 = at(sz * 1.0 + ln * 0.42, s, -ln * cv * 0.12);
    const j2 = at(sz * 1.0 + ln * 0.74, s * 1.04, -ln * cv * 0.4);
    const j3 = at(sz * 1.0 + ln * 0.94, s * 1.07, -ln * cv * 0.78);
    const w0 = sz * 0.115;
    segs.push([j0, j1, w0, w0 * 0.92], [j1, j2, w0 * 0.92, w0 * 0.84], [j2, j3, w0 * 0.84, w0 * 0.74]);
    const [kx, ky] = cam.project(j0);
    L.set(kx, ky, step(skin, 1));
    const [nx, ny] = cam.project(j3);
    L.set(nx, ny, step(skin, 2));
    for (const j of [j1, j2]) { const [jx, jy] = cam.project(j); L.set(jx, jy, dark); }
  }
  const t0 = at(sz * 0.25, -sz * 0.5 * thumb, -sz * 0.05);
  const t1 = at(sz * 0.7, -sz * 0.78 * thumb, -sz * 0.15);
  const t2 = at(sz * 1.05, -sz * 0.82 * thumb, -sz * 0.35);
  segs.push([t0, t1, sz * 0.14, sz * 0.11], [t1, t2, sz * 0.11, sz * 0.09]);
  for (const mode of ['fill', 'shade']) for (const [p0, p1, r0, r1] of segs) limb(L, cam, p0, p1, r0, r1, skin, light, 0.5, mode);
}


// Note: the shadow a layer's shapes cast on what is already drawn: each pixel offset by (dx, dy) darkens the scene there unless the layer itself covers it.
export function castShadow(px, L, dx, dy, k = -2) {
  const mark = new Uint8Array(L.a.length);
  for (let i = 0; i < L.a.length; i++) {
    if (L.a[i] === NONE) continue;
    const gx = (i % L.w) + dx;
    const gy = ((i / L.w) | 0) + dy;
    if (gx < 0 || gy < 0 || gx >= L.w || gy >= L.h || L.a[gy * L.w + gx] !== NONE) continue;
    mark[gy * L.w + gx] = 1;
  }
  for (let i = 0; i < mark.length; i++) if (mark[i] && px.a[i] !== NONE) px.a[i] = step(px.a[i], dith(i % L.w, (i / L.w) | 0, 0.55) ? k : k + 1);
}

// Note: a map of the country on parchment, as a picture to lay on a desk: rivers, ridges, trails, towns with names, a compass and the named place ringed in red ink and labelled; torn edges leave NONE.
export function mapTex(w, h, place = '', { px: ax = 0.62, py: ay = 0.5, ring = true, torn = true, seed = 3 } = {}) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, C.PLASTER);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = noise(Math.floor(x / 5) + seed, Math.floor(y / 5));
    if (n > 0.72 && dith(x, y, 0.5)) t.set(x, y, C.SAND_L);
    else if (n < 0.1 && dith(x, y, 0.4)) t.set(x, y, C.PLASTER_L);
  }
  // Note: ridges as rows of little peaks, a river with a bend, and the dotted trail between two towns.
  for (let k = 0; k < 14; k++) {
    const mx = Math.round(w * 0.08 + noise(k, seed) * w * 0.34);
    const my = Math.round(h * 0.12 + noise(k, seed + 4) * h * 0.7);
    t.line(mx - 3, my + 2, mx, my - 2, C.WOOD);
    t.line(mx, my - 2, mx + 3, my + 2, C.WOOD);
    t.set(mx + 1, my, C.SAND_D);
  }
  for (let x = 0; x < w; x++) {
    const y = Math.round(h * 0.7 + Math.sin(x / (w / 7)) * h * 0.1 - x * 0.12);
    t.set(x, y, C.GLASS);
    t.set(x, y + 1, C.BLUE);
  }
  const sx = ax * w;
  const sy = ay * h;
  const fx = w * 0.18;
  const fy = h * 0.72;
  for (let i = 0; i < 36; i++) {
    const u = i / 36;
    if (i % 2) t.set(Math.round(fx + (sx - fx) * u + Math.sin(u * 9) * 2), Math.round(fy + (sy - fy) * u + Math.cos(u * 6) * 2), C.RED_D);
  }
  for (const [tx, ty, name] of [[0.2, 0.26, 'FORT'], [0.14, 0.72, 'WELLS'], [0.82, 0.78, 'MESA']]) {
    t.rect(Math.round(w * tx) - 1, Math.round(h * ty) - 1, 3, 3, C.DARK);
    text(t, name, Math.round(w * tx) + 3, Math.round(h * ty) - 2, C.WOOD_D, 1);
  }
  // Note: the compass rose at a corner: a cross with a north tip.
  const [cx, cy] = [Math.round(w * 0.9), Math.round(h * 0.2)];
  t.line(cx - 6, cy, cx + 6, cy, C.WOOD_D);
  t.line(cx, cy - 7, cx, cy + 6, C.WOOD_D);
  t.poly([[cx - 2, cy - 2], [cx, cy - 8], [cx + 2, cy - 2]], C.RED_D);
  text(t, 'N', cx - 1, cy - 15, C.DARK, 1);
  // Note: the place: a dot, a ring of ink drawn by hand (a little uneven) and its name in bold.
  if (place) {
    t.rect(Math.round(sx) - 2, Math.round(sy) - 2, 5, 5, C.DARK);
    if (ring) for (let a = 0; a < 90; a++) {
      const an = (a / 90) * Math.PI * 2.15;
      const rr = 11 + Math.sin(an * 2) * 1.2 + a * 0.012;
      const rx = Math.round(sx + Math.cos(an) * rr * 1.25);
      const ry = Math.round(sy + Math.sin(an) * rr);
      t.rect(rx, ry, 2, 2, C.RED);
    }
    const label = String(place).slice(0, 14);
    const lw = textWidth(label, 2);
    const lx = Math.max(3, Math.min(w - lw - 4, Math.round(sx - lw / 2)));
    signText(t, label, lx, Math.round(sy) + 15, C.DARK, { scale: 2, shadow: C.SAND_D });
  }
  // Note: a double rule round the sheet, then ragged tears and the fold lines.
  t.rect(3, 3, w - 6, 1, C.WOOD);
  t.rect(3, h - 4, w - 6, 1, C.WOOD);
  t.rect(3, 3, 1, h - 6, C.WOOD);
  t.rect(w - 4, 3, 1, h - 6, C.WOOD);
  for (let x = 0; x < w; x++) { t.rect(x, h / 2, 1, 1, dith(x, 0, 0.5) ? C.SAND_D : C.PLASTER_L); }
  for (let y = 0; y < h; y++) { t.rect(w / 2, y, 1, 1, dith(0, y, 0.5) ? C.SAND_D : C.PLASTER_L); }
  if (torn) {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (d < 3 && noise(x * 3 + seed, y * 3) > 0.35 + d * 0.25) t.a[y * w + x] = NONE;
    }
  }
  return t;
}

// Note: a folder of manila card with its tab, a name on the tab and a red CLOSED stamp across the cover, as a picture to lay on a desk.
export function folderTex(w, h, label = 'CASE') {
  const t = new Px(w, h);
  t.rect(0, 6, w, h - 6, C.SAND_L);
  t.rect(0, 0, Math.round(w * 0.38), 7, C.SAND_L);
  t.rect(0, 6, w, 1, C.SAND);
  t.rect(0, 0, 1, h, C.SAND);
  t.rect(w - 1, 6, 1, h, C.SAND_D);
  t.rect(0, h - 1, w, 1, C.SAND_D);
  for (let y = 7; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (noise(Math.floor(x / 2), Math.floor(y / 2)) > 0.9) t.set(x, y, C.SAND);
  text(t, label, 3, 1, C.WOOD_D, 1);
  const sx = Math.round(w * 0.16);
  const sy = Math.round(h * 0.42);
  const sw = textWidth('CLOSED', 3) + 8;
  t.rect(sx - 4, sy, sw, 21, C.RED);
  t.rect(sx - 3, sy + 1, sw - 2, 19, C.SAND_L);
  text(t, 'CLOSED', sx, sy + 3, C.RED, 3);
  for (let i = 0; i < 40; i++) t.set(sx + Math.round(noise(i, 1) * sw), sy + Math.round(noise(i, 2) * 14), C.SAND_L);
  return t;
}

// Note: a letter in a hand, as a picture: a date line, a greeting, slanting lines of writing and a signature with a flourish; the paper creased once.
export function letterTex(w, h, ink = C.DARK) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, C.PLASTER);
  t.rect(0, 0, w, 1, C.PLASTER_L);
  for (let y = 0; y < h; y++) if (noise(y, 4) > 0.8) t.rect(0, y, w, 1, C.PLASTER_L);
  t.rect(w - 14, 3, 11, 1, ink);
  t.rect(4, 8, 14, 1, ink);
  for (let y = 13; y < h - 10; y += 3) {
    let x = 4;
    while (x < w - 5) {
      const l = 2 + Math.floor(noise(x, y) * 5);
      t.rect(x, y + (noise(x, y + 1) > 0.7 ? 1 : 0), l, 1, ink);
      x += l + 2;
    }
  }
  t.line(w - 22, h - 6, w - 6, h - 9, ink);
  t.line(w - 20, h - 8, w - 8, h - 6, ink);
  t.rect(0, Math.round(h / 2), w, 1, C.SAND_L);
  return t;
}

// Note: an envelope with a hand-lettered line and a seal of red wax.
export function envelopeTex(w, h) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, C.SAND_L);
  t.line(0, 0, Math.round(w / 2), Math.round(h * 0.52), C.SAND);
  t.line(w - 1, 0, Math.round(w / 2), Math.round(h * 0.52), C.SAND);
  t.rect(0, h - 1, w, 1, C.SAND_D);
  t.ellipse(w / 2, h * 0.5, 3.4, 3.4, C.RED_D);
  t.ellipse(w / 2 - 0.4, h * 0.5 - 0.4, 2.4, 2.4, C.RED);
  t.set(w / 2 - 1, h * 0.5 - 1, C.RED_L);
  t.rect(5, h - 9, Math.round(w * 0.5), 1, C.DARK);
  t.rect(5, h - 6, Math.round(w * 0.35), 1, C.DARK);
  return t;
}

// Note: a tintype: a small dark plate with a grey bust of the man, from his look: face, hat, moustache and coat in the cold greys of the old plates.
export function tinTex(w, h, look) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, C.IRON);
  t.rect(1, 1, w - 2, h - 2, C.STONE);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (dith(x, y, ((y / h) * 0.6))) t.set(x, y, C.IRON_L);
  const lk = look || {};
  const cx = w / 2;
  t.poly([[cx - w * 0.38, h - 1], [cx - w * 0.3, h * 0.66], [cx + w * 0.3, h * 0.66], [cx + w * 0.38, h - 1]], C.IRON);
  t.rect(cx - 1, h * 0.66, 3, h * 0.12, C.BONE);
  t.ellipse(cx, h * 0.46, w * 0.2, h * 0.2, C.STONE_L);
  t.ellipse(cx, h * 0.5, w * 0.16, h * 0.17, C.BONE);
  if (lk.hat != null) {
    t.rect(cx - w * 0.32, h * 0.3, w * 0.64, 2, C.SHADOW);
    t.rect(cx - w * 0.2, h * 0.14, w * 0.4, h * 0.17, C.SHADOW);
  } else t.rect(cx - w * 0.2, h * 0.28, w * 0.4, 2, C.IRON);
  t.rect(cx - w * 0.1, h * 0.43, 2, 1, C.SHADOW);
  t.rect(cx + w * 0.06, h * 0.43, 2, 1, C.SHADOW);
  if (lk.moustache && lk.moustache !== 'none') t.rect(cx - w * 0.1, h * 0.56, w * 0.2, 1, C.SHADOW);
  return t;
}

// Note: a revolver lying on a surface from its joints: frame, barrel, cylinder, grip and trigger guard, drawn through the camera; base is the grip's heel, dir the way the barrel points on the surface, y the height of its axis.
export function revolver(L, cam, base, dir, light, y = 0.02) {
  const P = (f, h = 0) => [base[0] + dir[0] * f, y + h, base[2] + dir[2] * f];
  limb(L, cam, P(0.0, 0.012), P(0.12, 0.005), 0.016, 0.015, C.IRON, light, 0.5, true);
  limb(L, cam, P(0.1, 0.0), P(0.3, 0.0), 0.0095, 0.008, C.STONE, light, 0.5, true);
  limb(L, cam, P(0.075, 0.0), P(0.115, 0.0), 0.0215, 0.0215, C.IRON_L, light, 0.5, true);
  limb(L, cam, P(0.0, 0.012), P(-0.06, -0.006), 0.017, 0.015, C.WOOD, light, 0.5, true);
  limb(L, cam, P(0.0, -0.01), P(0.05, -0.008), 0.004, 0.004, C.IRON, light, 0.5, true);
  const [hx, hy] = cam.project(P(0.012, 0.03));
  L.set(hx, hy, C.IRON_L);
  const [mx, my] = cam.project(P(0.3, 0.01));
  L.set(mx, my, C.STONE_L);
}

// Note: a saddled horse in profile at a ground point: barrel, neck, head, four legs, mane, tail, blanket, saddle, bedroll, saddlebag and reins; H is the withers' height in pixels, dir 1 faces right; lit by the light direction (lx, ly).
export function horse(L, x0, foot, H, dir, coat, light) {
  const X = (u) => x0 + u * H * dir;
  const Y = (v) => foot - v * H;
  const P = (list) => list.map(([u, v]) => [X(u), Y(v)]);
  const far = step(coat, -1);
  const lit = (pts, c, extra = {}) => L.lit(P(pts), c, { ...light, ...extra });
  // Note: the far legs first, then the body, then the near legs, so the barrel overlaps the tops of the legs.
  lit([[0.2, 0.6], [0.34, 0.6], [0.35, 0.34], [0.5, 0.16], [0.54, 0.02], [0.45, 0.02], [0.4, 0.14], [0.24, 0.32]], far, { depth: 0.6 });
  lit([[-0.4, 0.7], [-0.2, 0.6], [-0.18, 0.36], [-0.24, 0.28], [-0.24, 0.1], [-0.22, 0.0], [-0.32, 0.0], [-0.34, 0.1], [-0.36, 0.3], [-0.46, 0.44]], far, { depth: 0.6 });
  lit([[-0.55, 1.02], [0, 0.98], [0.38, 1.0], [0.54, 1.12], [0.66, 1.23], [0.66, 1.34], [0.73, 1.25], [0.92, 1.06], [1.04, 0.94], [1.03, 0.85], [0.95, 0.83], [0.83, 0.91], [0.72, 0.92], [0.64, 0.78], [0.52, 0.64], [0.47, 0.6], [0.25, 0.5], [-0.1, 0.5], [-0.4, 0.57], [-0.62, 0.72], [-0.64, 0.92]], coat, { depth: 0.3 });
  lit([[0.3, 0.6], [0.46, 0.6], [0.43, 0.32], [0.42, 0.1], [0.44, 0.0], [0.34, 0.0], [0.35, 0.1], [0.34, 0.32]], coat, { depth: 0.6 });
  lit([[-0.56, 0.78], [-0.32, 0.62], [-0.3, 0.4], [-0.36, 0.3], [-0.36, 0.1], [-0.34, 0.0], [-0.44, 0.0], [-0.46, 0.1], [-0.5, 0.3], [-0.62, 0.42]], coat, { depth: 0.6 });
  for (const u of [0.34, 0.45, -0.34, -0.44, -0.22, -0.32, 0.45, 0.54]) L.rect(X(u) - (dir < 0 ? H * 0.06 : 0), Y(0.04), H * 0.08, Math.max(1, H * 0.05), C.SHADOW);
  // Note: the tail, the mane, an eye and the blaze.
  lit([[-0.62, 0.96], [-0.74, 0.8], [-0.8, 0.35], [-0.72, 0.3], [-0.66, 0.7]], C.DARK, { depth: 0.6 });
  lit([[0.4, 1.02], [0.54, 1.12], [0.68, 1.27], [0.62, 1.12], [0.48, 1.02]], C.DARK, { depth: 0.6 });
  L.set(X(0.84), Y(1.08), C.VOID);
  L.line(X(0.78), Y(1.2), X(1.0), Y(0.96), step(coat, 2));
  // Note: the blanket, the saddle with its horn, the bedroll behind it, a saddlebag and the stirrup leather.
  lit([[-0.12, 1.0], [0.3, 1.0], [0.3, 0.8], [-0.1, 0.8]], C.RED_D, { depth: 0.4 });
  lit([[-0.05, 1.05], [0.28, 1.05], [0.3, 0.95], [0.1, 0.87], [-0.05, 0.9]], C.WOOD, { depth: 0.4 });
  lit([[0.25, 1.05], [0.3, 1.12], [0.33, 1.05]], C.WOOD_L, { depth: 0.5 });
  lit([[-0.42, 1.03], [-0.1, 1.06], [-0.1, 0.93], [-0.42, 0.9]], C.PLASTER, { depth: 0.5 });
  L.line(X(-0.32), Y(1.04), X(-0.32), Y(0.92), C.WOOD_D);
  L.line(X(-0.2), Y(1.05), X(-0.2), Y(0.93), C.WOOD_D);
  lit([[-0.08, 0.84], [0.16, 0.84], [0.14, 0.64], [-0.06, 0.64]], C.WOOD, { depth: 0.4 });
  L.line(X(0.04), Y(0.84), X(0.04), Y(0.64), C.WOOD_D);
  L.line(X(0.18), Y(0.9), X(0.2), Y(0.62), C.WOOD_D);
  // Note: the bridle and the rein down toward the rail.
  L.line(X(0.97), Y(0.95), X(0.78), Y(1.16), C.DARK);
  L.line(X(1.0), Y(0.88), X(1.25), Y(0.8), C.WOOD_D);
}

// Note: ray-marches a body built from smoothly joined primitives (capsules, ellipsoids, spheres) in world metres: the smooth union makes shoulders, elbows and the cloth between them one continuous surface; each primitive has a colour or a function of the hit point (seams, cuffs, wrinkles); lit by directional lights and shaded along the palette ramps with dither. prims: { t: 'cap', a, b, ra, rb } | { t: 'ell', c, r, frame } | { t: 'sph', c, r }, each with col and k (the blend radius). Returns a layer.
export function marchLayer(cam, prims, bounds, { lights, ambient = 0.28 }) {
  const L = new Px(cam.w, cam.h);
  const smin = (a, b, k) => {
    if (k <= 0) return Math.min(a, b);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  // Note: each primitive carries a bounding sphere (grown by its blend radius) so a ray only meets the primitives it passes near.
  const ps = prims.map((p) => {
    const kk = (p.k ?? 0.05) + 0.02;
    if (p.t === 'cap') {
      const ba = [p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]];
      const bb = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
      return { ...p, ba, bb, bc: [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2], br: Math.sqrt(bb) / 2 + Math.max(p.ra, p.rb) + kk };
    }
    if (p.t === 'sph') return { ...p, bc: p.c, br: p.r + kk };
    return { ...p, bc: p.c, br: Math.max(...p.r) + kk };
  });
  let lastId = 0;
  let cand = ps;
  const dist = (x, y, z) => {
    let d = 1e9;
    let best = 1e9;
    for (let i = 0; i < cand.length; i++) {
      const p = cand[i];
      let di;
      if (p.t === 'cap') {
        const pa0 = x - p.a[0];
        const pa1 = y - p.a[1];
        const pa2 = z - p.a[2];
        const h = Math.max(0, Math.min(1, (pa0 * p.ba[0] + pa1 * p.ba[1] + pa2 * p.ba[2]) / p.bb));
        const r0 = pa0 - p.ba[0] * h;
        const r1 = pa1 - p.ba[1] * h;
        const r2 = pa2 - p.ba[2] * h;
        di = Math.sqrt(r0 * r0 + r1 * r1 + r2 * r2) - (p.ra + (p.rb - p.ra) * h);
      } else if (p.t === 'sph') { const s0 = x - p.c[0]; const s1 = y - p.c[1]; const s2 = z - p.c[2]; di = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2) - p.r; }
      else {
        const v0 = x - p.c[0];
        const v2 = z - p.c[2];
        const q0 = v0 * p.frame.right[0] + v2 * p.frame.right[2];
        const q2 = v0 * p.frame.f[0] + v2 * p.frame.f[2];
        const q1 = y - p.c[1];
        const a0 = q0 / p.r[0];
        const a1 = q1 / p.r[1];
        const a2 = q2 / p.r[2];
        const k0 = Math.sqrt(a0 * a0 + a1 * a1 + a2 * a2);
        const b0 = a0 / p.r[0];
        const b1 = a1 / p.r[1];
        const b2 = a2 / p.r[2];
        const k1 = Math.sqrt(b0 * b0 + b1 * b1 + b2 * b2) || 1e-6;
        di = (k0 * (k0 - 1)) / k1;
      }
      if (di < best) { best = di; lastId = p.idx; }
      d = smin(d, di, p.k ?? 0.05);
    }
    return d;
  };
  let x0 = cam.w;
  let y0 = cam.h;
  let x1 = 0;
  let y1 = 0;
  for (const bx of [bounds[0][0], bounds[1][0]]) for (const by of [bounds[0][1], bounds[1][1]]) for (const bz of [bounds[0][2], bounds[1][2]]) {
    const [qx, qy] = cam.project([bx, by, bz]);
    x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cam.w - 1, Math.ceil(x1)); y1 = Math.min(cam.h - 1, Math.ceil(y1));
  ps.forEach((p, i) => { p.idx = i; });
  const o = cam.pos;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = cam.ray(x, y);
    let t0 = 1e9;
    let t1 = -1e9;
    cand = [];
    for (const p of ps) {
      const v0 = o[0] - p.bc[0];
      const v1 = o[1] - p.bc[1];
      const v2 = o[2] - p.bc[2];
      const bq = v0 * d[0] + v1 * d[1] + v2 * d[2];
      const disc = bq * bq - (v0 * v0 + v1 * v1 + v2 * v2 - p.br * p.br);
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      if (-bq + sq < 0) continue;
      cand.push(p);
      t0 = Math.min(t0, Math.max(0, -bq - sq));
      t1 = Math.max(t1, -bq + sq);
    }
    if (!cand.length) continue;
    let t = t0;
    let hit = false;
    for (let i = 0; i < 90 && t <= t1; i++) {
      const dd = dist(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
      if (dd < 0.002) { hit = true; break; }
      t += Math.max(0.0025, dd * 0.95);
    }
    if (!hit) continue;
    const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
    const id = lastId;
    const e = 0.004;
    const n0 = dist(p[0] + e, p[1], p[2]) - dist(p[0] - e, p[1], p[2]);
    const n1 = dist(p[0], p[1] + e, p[2]) - dist(p[0], p[1] - e, p[2]);
    const n2 = dist(p[0], p[1], p[2] + e) - dist(p[0], p[1], p[2] - e);
    const nl = Math.hypot(n0, n1, n2) || 1;
    const n = [n0 / nl, n1 / nl, n2 / nl];
    const pr = ps[id];
    const col = typeof pr.col === 'function' ? pr.col(p, n, pr) : pr.col;
    const base = typeof col === 'object' ? col.c : col;
    let level = ambient;
    for (const lg of lights) level += Math.max(0, n[0] * lg.dir[0] + n[1] * lg.dir[1] + n[2] * lg.dir[2]) * lg.power;
    if (typeof col === 'object' && col.k) level *= col.k;
    L.a[y * cam.w + x] = shadeOf(base, level, x, y, false);
  }
  return L;
}

// Note: a glint: a small cross of light with a bright heart, for polished metal.
export function glint(px, x, y, r = 3) {
  px.line(x - r, y, x + r, y, C.GOLD_L);
  px.line(x, y - r, x, y + r, C.GOLD_L);
  px.rect(x - 1, y - 1, 3, 3, C.BONE);
  px.set(x, y, C.BONE);
  px.set(x - r - 1, y, C.GOLD);
  px.set(x + r + 1, y, C.GOLD);
  px.set(x, y - r - 1, C.GOLD);
  px.set(x, y + r + 1, C.GOLD);
}

// Note: fine dust or smoke hanging in the air: speckles of one colour inside an ellipse, thinning to the rim.
export function haze(px, cx, cy, rx, ry, c, density, seed = 1) {
  px.wash(cx - rx, cy - ry, rx * 2, ry * 2, c, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d >= 1) return 0;
    const n = noise(Math.floor(x / 3) + seed, Math.floor(y / 3));
    return Math.max(0, (1 - d * d) * density * (0.55 + n * 0.9));
  });
}

// Note: a wanted bill, stamped by hand: title, the figure, the sum and the rule lines, as a small picture to lay on a wall or a desk.
export function billTex(w, h, name = '', { sum = '500', paper: bg = C.PLASTER_L } = {}) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, bg);
  t.rect(0, 0, w, 1, step(bg, -1));
  t.rect(0, h - 1, w, 1, step(bg, -1));
  t.rect(0, 0, 1, h, step(bg, -1));
  t.rect(w - 1, 0, 1, h, step(bg, -1));
  const sc = w >= 40 ? 2 : 1;
  const wide = 4 * sc * 6 - sc;
  text(t, 'WANTED', Math.round((w - wide) / 2), 2, C.RED_D, sc);
  const my = 3 + 5 * sc + 2;
  t.rect(3, my, w - 6, Math.round(h * 0.4), C.SAND);
  t.rect(3, my, w - 6, 1, C.WOOD);
  t.ellipse(w / 2, my + h * 0.2, w * 0.14, h * 0.13, C.ADOBE);
  t.rect(w / 2 - w * 0.16, my + h * 0.1, w * 0.32, 2, C.DARK);
  const ly = my + Math.round(h * 0.4) + 3;
  for (let y = ly; y < h - 8; y += 3) t.rect(4, y, Math.round((w - 8) * (0.5 + noise(y, w) * 0.5)), 1, C.WOOD);
  text(t, `$${sum}`, 4, h - 7, C.DARK, 1);
  return t;
}

// Note: a report in a clerk's hand: a heading, ruled lines of different length and a signature, as a small picture for a desk.
export function reportTex(w, h, ringed = false) {
  const t = new Px(w, h);
  t.rect(0, 0, w, h, C.PLASTER_L);
  t.rect(0, h - 1, w, 1, step(C.PLASTER_L, -1));
  t.rect(2, 2, Math.round(w * 0.5), 1, C.DARK);
  t.rect(2, 3, Math.round(w * 0.3), 1, C.IRON);
  for (let y = 7; y < h - 4; y += 3) t.rect(2, y, Math.round((w - 5) * (0.45 + noise(y, w * 3) * 0.55)), 1, noise(y * 3, 1) > 0.8 ? C.IRON_L : C.IRON);
  t.rect(w - 9, h - 4, 7, 1, C.SHADOW);
  if (ringed) for (let a = 0; a < 20; a++) t.set(Math.round(w * 0.5 + Math.cos(a / 3.2) * w * 0.34), Math.round(h * 0.55 + Math.sin(a / 3.2) * h * 0.2), C.RED);
  return t;
}

// Note: the sheriff's badge as a test in local coordinates (x, z in metres from its centre, one tip toward -z): a five-point star with a ball at each tip, a ring and a boss; returns the part it hit, the arm's angle and which facet of the arm, or null outside.
export function starTest(x, z, r = 0.04) {
  const d = Math.hypot(x, z);
  if (d > r * 1.35) return null;
  let ang = Math.atan2(z, x) + Math.PI / 2;
  ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const seg = (Math.PI * 2) / 5;
  const k = ang % seg;
  const t = Math.abs(k - seg / 2) / (seg / 2);
  const tipA = Math.round(ang / seg) * seg;
  const side = ang >= tipA ? 1 : -1;
  const edge = r * (0.4 + 0.6 * t) * 0.98;
  const dTip = Math.hypot(x - Math.sin(tipA) * r * 1.1, z + Math.cos(tipA) * r * 1.1);
  if (dTip < r * 0.2) return { part: dTip < r * 0.09 ? 'ballHi' : 'ball', ang: tipA, side };
  if (d < r * 0.17) return { part: d < r * 0.08 ? 'bossHi' : 'boss', ang: tipA, side };
  if (d > edge) return null;
  if (d < r * 0.5 && d > r * 0.4) return { part: 'ring', ang: tipA, side };
  return { part: 'face', ang: tipA, side };
}

// Note: a sheriff's star as a solid of radius R to the tips: a height field over its local x and z (one tip toward -z) with an edge of real thickness, five arms each with a ridge and two planar facets, a raised disc at the centre with an engraved ring, a second engraved ring across the arms; plus a little sphere on each tip.
export function starSolid(R) {
  const seg = (Math.PI * 2) / 5;
  const half = seg / 2;
  const rho = 0.37;
  const t = R * 0.11;
  const hr = R * 0.17;
  const nx = rho * R * Math.sin(half);
  const ny = R - rho * R * Math.cos(half);
  const cc = R * rho * R * Math.sin(half);
  const edgeAt = (phi) => cc / (nx * Math.cos(phi) + ny * Math.sin(phi));
  const top = (x, z) => {
    const d = Math.hypot(x, z);
    if (d > R * 1.02) return 0;
    let a = Math.atan2(x, -z);
    a = ((a % seg) + seg) % seg;
    const ad = Math.abs(a > half ? a - seg : a);
    if (d > edgeAt(ad)) return 0;
    const xa = d * Math.cos(ad);
    const ya = d * Math.sin(ad);
    let y = t + hr * Math.max(0, 1 - ya / (0.42 * R)) * (1 - 0.55 * xa / R);
    if (d > 0.5 * R && d < 0.57 * R) y -= R * 0.022;
    if (d < 0.3 * R) {
      y = t + hr + R * 0.06 + R * 0.035 * Math.sqrt(Math.max(0, 1 - (d / (0.3 * R)) ** 2));
      if (d > 0.19 * R && d < 0.235 * R) y -= R * 0.025;
    }
    return y;
  };
  const rb = R * 0.18;
  const balls = Array.from({ length: 5 }, (_, k) => ({ x: Math.sin(k * seg) * R * 0.98, y: rb, z: -Math.cos(k * seg) * R * 0.98, r: rb }));
  const groove = (x, z) => {
    const d = Math.hypot(x, z);
    return (d > 0.5 * R && d < 0.57 * R) || (d > 0.19 * R && d < 0.235 * R);
  };
  return { R, top, balls, groove, ymax: t + hr + R * 0.1 };
}

// Note: ray-casts a star solid placed in the world by a frame (origin o, right axis ex, surface normal n; its local z is ex x n) and lights it from a point: the height field is marched in steps sized by the height above it, spheres are hit exactly, normals come from the surface, each facet takes its own diffuse and specular, ridges shadow the facets beside them; the star's shadow also falls on what info shows near it. Draws into px.
export function drawStar(px, cam, info, frame, lightPos, { R = 0.035, power = 2, reach = 0.7, ambient = 0.12, shine = 40 } = {}) {
  const st = starSolid(R);
  const { o, ex, n } = frame;
  const ez = [ex[1] * n[2] - ex[2] * n[1], ex[2] * n[0] - ex[0] * n[2], ex[0] * n[1] - ex[1] * n[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const loc = (p) => { const v = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return [dot(v, ex), dot(v, n), dot(v, ez)]; };
  const dloc = (d) => [dot(d, ex), dot(d, n), dot(d, ez)];
  const eye = loc(cam.pos);
  const Lp = loc(lightPos);
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const world = (x, y, z) => [o[0] + ex[0] * x + n[0] * y + ez[0] * z, o[1] + ex[1] * x + n[1] * y + ez[1] * z, o[2] + ex[2] * x + n[2] * y + ez[2] * z];
  let x0 = cam.w;
  let y0 = cam.h;
  let x1 = 0;
  let y1 = 0;
  const m = 3.2;
  for (const sx of [-m, m]) for (const sz of [-m, m]) for (const sy of [0, 6 * R]) {
    const [qx, qy] = cam.project(world(sx * R, sy, sz * R));
    x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cam.w - 1, Math.ceil(x1)); y1 = Math.min(cam.h - 1, Math.ceil(y1));
  const sphereHit = (oo, d) => {
    let best = null;
    for (const b of st.balls) {
      const v = [oo[0] - b.x, oo[1] - b.y, oo[2] - b.z];
      const bq = dot(v, d);
      const cq = dot(v, v) - b.r * b.r;
      const disc = bq * bq - cq;
      if (disc < 0) continue;
      const tt = -bq - Math.sqrt(disc);
      if (tt > 1e-5 && (!best || tt < best.t)) best = { t: tt, b };
    }
    return best;
  };
  // Note: true when the segment from p toward the light meets the solid before the light.
  const blocked = (p, dirv, maxd) => {
    let tt = R * 0.015;
    while (tt < maxd) {
      const q = [p[0] + dirv[0] * tt, p[1] + dirv[1] * tt, p[2] + dirv[2] * tt];
      if (q[1] > st.ymax * 1.05) return false;
      if (q[1] < st.top(q[0], q[2])) return true;
      tt += Math.max(R * 0.02, (q[1] - st.top(q[0], q[2])) * 0.5);
    }
    return !!sphereHit(p, dirv);
  };
  // Note: the shadow on the surface around the star: each surface point on the star's plane that can not see the light darkens.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const h = info[y * cam.w + x];
    if (!h) continue;
    const q = loc(h.p);
    if (Math.abs(q[1]) > R * 0.12 || Math.abs(q[0]) > m * R || Math.abs(q[2]) > m * R) continue;
    const dl = nrm([Lp[0] - q[0], Lp[1] - q[1], Lp[2] - q[2]]);
    if (dl[1] > 0.02 && blocked(q, dl, 6 * R)) px.a[y * cam.w + x] = step(px.a[y * cam.w + x], dith(x, y, 0.65) ? -2 : -1);
  }
  let bright = null;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = dloc(cam.ray(x, y));
    // Note: the ray enters the star's bounding box in local space.
    let t0 = 0;
    let t1 = 1e9;
    const lo = [-1.2 * R, 0, -1.2 * R];
    const hi = [1.2 * R, st.ymax * 1.05, 1.2 * R];
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (eye[a] < lo[a] || eye[a] > hi[a]) ok = false; continue; }
      let ta = (lo[a] - eye[a]) / d[a];
      let tb = (hi[a] - eye[a]) / d[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (!ok || t0 > t1) continue;
    let tt = t0;
    let hit = null;
    for (let i = 0; i < 260 && tt <= t1; i++) {
      const q = [eye[0] + d[0] * tt, eye[1] + d[1] * tt, eye[2] + d[2] * tt];
      const hq = q[1] - st.top(q[0], q[2]);
      if (hq <= 0) {
        let lo2 = Math.max(t0, tt - R * 0.03);
        let hi2 = tt;
        for (let b = 0; b < 6; b++) {
          const mid = (lo2 + hi2) / 2;
          const qq = [eye[0] + d[0] * mid, eye[1] + d[1] * mid, eye[2] + d[2] * mid];
          if (qq[1] - st.top(qq[0], qq[2]) <= 0) hi2 = mid; else lo2 = mid;
        }
        hit = { t: hi2, kind: 'plate' };
        break;
      }
      tt += Math.min(R * 0.08, Math.max(R * 0.008, hq * 0.5));
    }
    const sph = sphereHit(eye, d);
    if (sph && (!hit || sph.t < hit.t)) hit = { t: sph.t, kind: 'ball', b: sph.b };
    if (!hit) continue;
    const p = [eye[0] + d[0] * hit.t, eye[1] + d[1] * hit.t, eye[2] + d[2] * hit.t];
    let nn;
    if (hit.kind === 'ball') nn = nrm([p[0] - hit.b.x, p[1] - hit.b.y, p[2] - hit.b.z]);
    else {
      const e = R * 0.012;
      nn = nrm([-(st.top(p[0] + e, p[2]) - st.top(p[0] - e, p[2])) / (2 * e), 1, -(st.top(p[0], p[2] + e) - st.top(p[0], p[2] - e)) / (2 * e)]);
    }
    const lv = [Lp[0] - p[0], Lp[1] - p[1], Lp[2] - p[2]];
    const dist = Math.hypot(lv[0], lv[1], lv[2]);
    const l = [lv[0] / dist, lv[1] / dist, lv[2] / dist];
    const org = [p[0] + nn[0] * R * 0.02, p[1] + nn[1] * R * 0.02, p[2] + nn[2] * R * 0.02];
    const lit = dot(nn, l) > 0 && !blocked(org, l, dist);
    const fall = power / (1 + (dist / reach) ** 2);
    const v = nrm([eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]]);
    const hv = nrm([l[0] + v[0], l[1] + v[1], l[2] + v[2]]);
    const spec = lit ? Math.max(0, dot(nn, hv)) ** shine : 0;
    let level = ambient + (lit ? Math.max(0, dot(nn, l)) * fall : 0) + spec * fall * 3;
    if (hit.kind === 'plate' && st.groove(p[0], p[2])) level *= 0.55;
    px.a[y * cam.w + x] = shadeOf(C.GOLD, level, x, y, false);
    if (spec > 0.35 && (!bright || spec > bright.s)) bright = { x, y, s: spec };
  }
  return bright;
}


// Note: a gold badge as a box material: bevelled arms catch the light by a specular term from the light and the eye, so the facets glint as the camera sees them; paint is the colour of the metal.
export function starMat(cx, cz, r, eye, lightPos, { tilt = 0.55, front = false } = {}) {
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return (p, n) => {
    // Note: a badge lying flat is tested in x and z; one pinned on a chest facing +z is tested in x and y with its tip up.
    if (front ? n[2] <= 0 : n[1] <= 0) return null;
    const h = front ? starTest(p[0] - cx, -(p[1] - cz), r) : starTest(p[0] - cx, p[2] - cz, r);
    if (!h) return null;
    if (h.part === 'ring') return { c: C.WOOD_D, k: 1.4 };
    // Note: the facet normal tips toward the arm's side, so one half of each arm faces the light and the other turns from it.
    const tx = Math.cos(h.ang);
    const tz = Math.sin(h.ang);
    const ball = h.part === 'ball' || h.part === 'ballHi' || h.part === 'boss' || h.part === 'bossHi';
    const tl = tilt * (ball ? 0.6 : 1) * h.side;
    const N = front ? norm([-tz * tl, tx * tl, 1]) : norm([-tz * tl, 1, tx * tl]);
    const L = norm([lightPos[0] - p[0], lightPos[1] - p[1], lightPos[2] - p[2]]);
    const V = norm([eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]]);
    const nl = N[0] * L[0] + N[1] * L[1] + N[2] * L[2];
    const R = [2 * nl * N[0] - L[0], 2 * nl * N[1] - L[1], 2 * nl * N[2] - L[2]];
    const spec = Math.max(0, R[0] * V[0] + R[1] * V[1] + R[2] * V[2]) ** 10;
    const hi = h.part === 'ballHi' || h.part === 'bossHi' ? 1.6 : 1;
    return { c: C.GOLD, k: 0.9 + 4.5 * spec + (nl > 0 ? nl * 0.9 : 0) * hi };
  };
}
