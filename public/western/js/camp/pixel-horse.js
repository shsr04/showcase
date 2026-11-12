// Note: a horse in side view for the storyboard panels (item 312): head, arched neck, mane, ears, a deep barrel, four legs with knee, hock, fetlock and hoof, and a tail; poses stand, walk, trot, gallop; with a saddle and, if asked, a seated rider from a look.

import { C } from '../palette.js';
import { Px, step, dith, NONE } from './pixel-art.js';
import { pixelSide, faceLit } from './pixel-figure.js';

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

// Note: a closed outline rounded through its control points (Catmull-Rom), so the big shapes of the horse have no flat facets.
function smooth(pts, per = 4) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let t = 0; t < per; t++) {
      const s = t / per;
      const s2 = s * s;
      const s3 = s2 * s;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * s + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * s2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * s3)));
    }
  }
  return out;
}

// Note: coats the panels give horses, with the mane and tail colour that goes with each.
export const COATS = [
  { coat: C.WOOD, mane: C.DARK },
  { coat: C.ADOBE, mane: C.WOOD_D },
  { coat: C.DARK, mane: C.SHADOW },
  { coat: C.STONE, mane: C.IRON },
  { coat: C.SAND, mane: C.PLASTER },
  { coat: C.WOOD_L, mane: C.WOOD_D },
];

// Note: the legs by pose, as joints in metres from the point where the horse stands (u forward, v up): front legs shoulder, knee, fetlock, hoof; hind legs hip, stifle, hock, fetlock, hoof; near leg first. The body is lifted by lift metres and tipped by tilt.
const POSES = {
  stand: {
    lift: 0, tilt: 0, drop: 0, tail: 0,
    fn: [[0.58, 1.0], [0.62, 0.52], [0.6, 0.19], [0.62, 0.0]],
    ff: [[0.5, 1.0], [0.5, 0.52], [0.48, 0.19], [0.5, 0.0]],
    hn: [[-0.66, 1.15], [-0.5, 0.82], [-0.78, 0.5], [-0.74, 0.18], [-0.7, 0.0]],
    hf: [[-0.6, 1.15], [-0.4, 0.82], [-0.64, 0.5], [-0.6, 0.18], [-0.56, 0.0]],
  },
  walk: {
    lift: 0, tilt: 0.01, drop: 0.12, tail: 0.15,
    fn: [[0.58, 1.0], [0.84, 0.66], [0.7, 0.46], [0.66, 0.3]],
    ff: [[0.5, 1.0], [0.4, 0.52], [0.36, 0.19], [0.38, 0.0]],
    hn: [[-0.66, 1.15], [-0.46, 0.82], [-0.84, 0.5], [-0.9, 0.18], [-0.9, 0.0]],
    hf: [[-0.6, 1.15], [-0.34, 0.82], [-0.52, 0.55], [-0.46, 0.3], [-0.38, 0.12]],
  },
  walk2: {
    lift: 0, tilt: 0.01, drop: 0.12, tail: 0.1,
    fn: [[0.58, 1.0], [0.72, 0.52], [0.84, 0.2], [0.9, 0.0]],
    ff: [[0.5, 1.0], [0.6, 0.7], [0.4, 0.54], [0.34, 0.34]],
    hn: [[-0.66, 1.15], [-0.42, 0.82], [-0.52, 0.52], [-0.5, 0.22], [-0.46, 0.04]],
    hf: [[-0.6, 1.15], [-0.52, 0.8], [-0.84, 0.54], [-0.86, 0.2], [-0.84, 0.0]],
  },
  trot: {
    lift: 0.16, tilt: 0, drop: 0.18, tail: 0.3,
    fn: [[0.58, 1.0], [0.9, 0.84], [0.96, 0.58], [1.0, 0.46]],
    ff: [[0.5, 1.0], [0.46, 0.5], [0.42, 0.22], [0.44, 0.1]],
    hn: [[-0.66, 1.15], [-0.4, 0.86], [-0.5, 0.5], [-0.48, 0.2], [-0.46, 0.06]],
    hf: [[-0.6, 1.15], [-0.62, 0.8], [-0.98, 0.64], [-1.04, 0.36], [-1.04, 0.2]],
  },
  gallop: {
    lift: -0.22, tilt: 0.05, drop: 0.38, tail: 1,
    fn: [[0.58, 1.0], [1.0, 0.88], [1.3, 0.62], [1.42, 0.5]],
    ff: [[0.5, 1.0], [0.84, 0.76], [1.0, 0.46], [1.08, 0.36]],
    hn: [[-0.66, 1.15], [-0.42, 0.95], [-0.96, 0.78], [-1.3, 0.64], [-1.44, 0.58]],
    hf: [[-0.6, 1.15], [-0.5, 0.86], [-0.92, 0.6], [-1.12, 0.4], [-1.2, 0.28]],
  },
};

// Note: the horse at p (metres from the barrel's centre at the ground) onto the screen: x, foot row, pixels a metre, facing dir, tipped by tilt about the body.
export function pixelHorse(w, h, x, foot, S, o = {}) {
  const L = new Px(w, h);
  const dir = o.dir || 1;
  const pz = POSES[o.pose] || POSES.stand;
  const coat = o.coat ?? C.WOOD;
  const mane = o.mane ?? C.DARK;
  const light = { lx: o.lx ?? -0.8, ly: o.ly ?? -0.5, cool: !!o.cool };
  const drop = o.drop ?? pz.drop;
  const tilt = o.tilt ?? pz.tilt;
  const lift = pz.lift;
  const big = S >= 16;
  const far = (c) => step(c, -1);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // Note: a body point to the screen, tipped about the middle of the barrel and lifted.
  const T = (u, v) => {
    const du = u;
    const dv = v - 1.1;
    const tu = du * ct + dv * st;
    const tv = -du * st + dv * ct + 1.1 + lift;
    return [x + tu * S * dir, foot - tv * S];
  };
  // Note: a neck point: the neck and head turn about the withers by drop (a lowered head), then follow the body.
  const cd = Math.cos(drop);
  const sd = Math.sin(drop);
  const N = (u, v) => {
    const du = u - 0.45;
    const dv = v - 1.45;
    return T(0.45 + du * cd + dv * sd, 1.45 - du * sd + dv * cd);
  };
  const P = (pts) => pts.map(([u, v]) => T(u, v));
  const PN = (pts) => pts.map(([u, v]) => N(u, v));
  const lit = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  const wd = (m) => Math.max(0.85, m * S);

  // Note: a leg through its joints: thick at the top, narrow at the knee or hock and cannon, a bulge at the fetlock, a dark hoof under it; a sock on request.
  const leg = (j, c, widths, hoof, sock) => {
    const pts = P(j);
    lit(band(pts, widths.map(wd)), c, { depth: 0.55 });
    const n = pts.length;
    const [fx, fy] = pts[n - 2];
    const [hx, hy] = pts[n - 1];
    const ang = Math.atan2(hy - fy, hx - fx);
    const tipX = hx + Math.cos(ang) * S * 0.02;
    const tipY = hy + Math.sin(ang) * S * 0.02;
    const mx = fx + (hx - fx) * 0.25;
    const my = fy + (hy - fy) * 0.25;
    L.lit(band([[mx, my], [tipX, tipY]], [wd(0.05), wd(0.075)]), hoof, { ...light, depth: 0.5, edge: false });
    if (sock) L.lit(band([pts[n - 3], [mx, my]], [wd(0.05), wd(0.062)]), C.BONE, { ...light, depth: 0.5, edge: false });
    if (big) {
      const [kx, ky] = pts[1];
      L.set(kx - Math.cos(ang) * 0, ky, step(c, -2));
    }
  };
  const FW = [0.085, 0.06, 0.042, 0.05, 0.043];
  const HW = [0.15, 0.09, 0.062, 0.042, 0.05, 0.043];
  const hoofC = o.hoof ?? C.DARK;
  const sock = !!o.socks;

  // Note: the tail first, behind the rest: hanging with a little sway, or streaming out at a gallop.
  {
    const s = pz.tail;
    const dock = [-0.86, 1.4];
    const tip = [-0.96 - s * 1.0, 0.45 + s * 0.78];
    const mid = [-0.98 - s * 0.45, 1.0 + s * 0.2];
    const c1 = [-0.9 - s * 0.2, 1.3 + s * 0.05];
    L.lit(band(P([dock, c1, mid, tip]), [wd(0.07), wd(0.1), wd(0.12), wd(0.05)]), mane, { ...light, depth: 0.5 });
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = T(mid[0] - k * 0.03, mid[1] + 0.05);
      const [bx, by] = T(tip[0] - 0.04 + k * 0.025, tip[1] - 0.05);
      L.line(ax, ay, bx, by, k % 2 ? step(mane, 1) : step(mane, -1));
    }
  }
  // Note: the far legs in a darker coat, behind the body.
  leg(pz.hf, step(coat, -2), HW, far(hoofC), sock);
  leg(pz.ff, step(coat, -2), FW, far(hoofC), sock);

  // Note: the near legs go down before the body, so the chest and the haunch close over their tops.
  leg(pz.hn, step(coat, -1), HW, hoofC, sock);
  leg(pz.fn, step(coat, -1), FW, hoofC, sock);
  // Note: the body: a deep barrel, the croup rounded, the belly tucked up behind the girth.
  const body = [[0.5, 1.5], [0.16, 1.45], [-0.28, 1.47], [-0.6, 1.53], [-0.84, 1.44], [-0.92, 1.24], [-0.86, 1.02], [-0.6, 0.9], [-0.36, 0.86], [0.0, 0.78], [0.38, 0.76], [0.62, 0.82], [0.78, 0.98], [0.82, 1.24], [0.72, 1.42]];
  // Note: the body and the neck are one flat mask shaded down each column from the top contour, so the form is smooth and has no facets: a lit crest, the coat, then a dithered turn into the shaded belly.
  const M = new Px(w, h);
  M.poly(P(smooth(body, 6)), coat);
  M.poly(PN(smooth([[0.3, 1.5], [0.52, 1.76], [0.78, 2.0], [0.98, 2.15], [1.08, 2.08], [1.02, 1.88], [0.92, 1.6], [0.86, 1.36], [0.8, 1.2], [0.5, 1.3]], 5)), coat);
  for (let x = 0; x < w; x++) {
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) if (M.a[y * w + x] !== NONE) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0) continue;
    for (let y = y0; y <= y1; y++) {
      if (M.a[y * w + x] === NONE) continue;
      const t = (y - y0 + 0.5) / (y1 - y0 + 1);
      let c = coat;
      if (t < 0.1) c = dith(x, y, 0.6) ? step(coat, 1) : coat;
      else if (t > 0.9) c = dith(x, y, 0.55) ? step(coat, -2) : step(coat, -1);
      else if (t > 0.72) c = step(coat, -1);
      else if (t > 0.5 && dith(x, y, (t - 0.5) / 0.22)) c = step(coat, -1);
      L.a[y * w + x] = c;
    }
  }
  // Note: soft muscle highlights on the haunch and the shoulder.
  for (const [mu, mv, r] of [[-0.55, 1.28, 0.24], [0.5, 1.22, 0.2]]) {
    const [cx, cy] = T(mu, mv);
    L.wash(cx - r * S, cy - r * S, r * S * 2, r * S * 2, step(coat, 1), (x, y) => (L.get(x, y) === coat ? Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (r * S)) * 0.55 : 0));
  }
  if (S >= 11) {
    const [a1, b1] = T(0.42, 1.38);
    const [a2, b2] = T(0.56, 0.96);
    L.line(a1, b1, a2, b2, step(coat, -1));
    const [a3, b3] = T(-0.26, 1.35);
    const [a4, b4] = T(-0.24, 0.92);
    L.line(a3, b3, a4, b4, step(coat, -1));
  }

  // Note: the mane along the crest, ragged, and the forelock.
  const crest = [[1.0, 2.17], [0.9, 2.08], [0.8, 2.0], [0.7, 1.88], [0.6, 1.76], [0.5, 1.62], [0.4, 1.52]];
  const flow = o.flow ?? (pz.tail > 0.9 ? 0.34 : pz.tail * 0.22);
  const outer = crest.map(([u, v], i) => [u - 0.1 - flow * (0.6 + 0.4 * (i % 2)) + (i % 2) * 0.05, v + 0.08 + flow * 0.1 - (i % 2) * 0.03]);
  lit(PN([...crest, ...outer.reverse()]), mane, { depth: 0.5, hi: true });
  // Note: the head: poll, forehead, a straight nose to the muzzle, the jaw and cheek.
  lit(PN(smooth([[0.98, 2.15], [1.12, 2.1], [1.28, 1.93], [1.42, 1.77], [1.47, 1.69], [1.42, 1.62], [1.3, 1.62], [1.17, 1.7], [1.07, 1.8], [1.0, 1.9]], 3)), coat, { depth: 0.4, edge: true });
  // Note: a pale blaze or the muzzle's lighter tone, the eye, nostril and mouth.
  const m1 = N(1.43, 1.7);
  L.rect(m1[0] - (dir > 0 ? S * 0.07 : 0), m1[1] - 1, Math.max(1, S * 0.07), Math.max(1.5, S * 0.07), step(coat, 1));
  const eye = N(1.12, 1.97);
  L.set(eye[0], eye[1], C.VOID);
  if (big) L.set(eye[0] - dir, eye[1] - 1, step(coat, 2));
  const nos = N(1.46, 1.71);
  L.set(nos[0], nos[1], C.SHADOW);
  const mo1 = N(1.4, 1.63);
  const mo2 = N(1.28, 1.65);
  L.line(mo1[0], mo1[1], mo2[0], mo2[1], C.SHADOW);
  // Note: both ears, pricked, the far one darker.
  lit(PN([[0.99, 2.14], [0.96, 2.38], [1.07, 2.19]]), far(coat), { depth: 0.6, edge: false });
  lit(PN([[0.93, 2.14], [0.88, 2.4], [1.02, 2.2]]), coat, { depth: 0.6, edge: false });
  lit(PN([[1.05, 2.18], [1.2, 2.14], [1.14, 1.96], [1.1, 2.04]]), mane, { depth: 0.6, edge: false });

  // Note: tack: a saddle blanket, the saddle with its horn and cantle and a hanging fender with the stirrup, the girth, and the bridle with its reins.
  if (o.tack !== false) {
    const bl = o.blanket ?? C.RED;
    lit(P([[0.34, 1.5], [-0.34, 1.48], [-0.4, 1.0], [0.0, 0.94], [0.36, 1.0]]), bl, { depth: 0.4, edge: false });
    lit(P([[0.3, 1.56], [0.32, 1.68], [0.24, 1.72], [0.2, 1.6], [-0.2, 1.58], [-0.3, 1.74], [-0.38, 1.7], [-0.34, 1.52]]), C.WOOD_D, { depth: 0.4 });
    lit(P([[0.2, 1.5], [-0.26, 1.48], [-0.28, 1.0], [-0.04, 0.95], [0.18, 1.0]]), C.WOOD, { depth: 0.5, edge: true });
    const g1 = T(0.04, 1.46);
    const g2 = T(0.12, 0.78);
    L.line(g1[0], g1[1], g2[0], g2[1], C.WOOD_D);
    const s1 = T(0.0, 1.0);
    const s2 = T(0.02, 0.8);
    L.line(s1[0], s1[1], s2[0], s2[1], C.DARK);
    L.rect(s2[0] - S * 0.07, s2[1], S * 0.15, Math.max(1, S * 0.06), C.IRON_L);
    if (o.bedroll) lit(band(P([[-0.4, 1.75], [-0.46, 1.8]]), [wd(0.12), wd(0.12)]), o.bedroll, { depth: 0.4 });
    // Note: the bridle's cheek strap and noseband, and the bit.
    const c1 = N(1.1, 2.04);
    const c2 = N(1.28, 1.68);
    L.line(c1[0], c1[1], c2[0], c2[1], C.WOOD_D);
    const nb1 = N(1.36, 1.8);
    const nb2 = N(1.42, 1.64);
    L.line(nb1[0], nb1[1], nb2[0], nb2[1], C.WOOD_D);
    if (o.reins !== false && !o.rider) {
      const bit = N(1.36, 1.65);
      const hold = o.reinTo ?? [bit[0] - dir * S * 0.5, bit[1] + S * 0.9];
      L.line(bit[0], bit[1], (bit[0] + hold[0]) / 2, (bit[1] + hold[1]) / 2 + S * 0.08, C.WOOD_D);
      L.line((bit[0] + hold[0]) / 2, (bit[1] + hold[1]) / 2 + S * 0.08, hold[0], hold[1], C.WOOD_D);
    }
  }

  if (o.rider) rider(L, T, N, S, dir, light, o.rider, o);
  return L;
}

// Note: the rider seated on the saddle: the head and hat from the side figure, his own torso leaning with the gait, the thigh bent over the fender, the shin, the boot in the stirrup, one hand on the reins.
function rider(L, T, N, S, dir, light, rd, o) {
  // Note: item 376: the nemesis's face keeps its key light here too.
  const look = faceLit(rd.look || null);
  const lk = look ? { skin: C.ADOBE, hair: C.WOOD_D, coat: C.WOOD_D, vest: C.RED_D, legs: C.IRON, ...look } : { skin: C.ADOBE, hair: C.WOOD_D, coat: rd.coat ?? C.WOOD_D, vest: null, hat: rd.hat ?? C.DARK, legs: rd.legs ?? C.IRON };
  const lean = rd.lean ?? 0;
  const seat = T(-0.02, 1.6);
  const hgt = 1.8 * S;
  const H = hgt / 7.5;
  const k = H * dir * 1.15;
  // Note: rider space in a seventh of his height: u forward, v up, the hip at the origin, the lean shearing everything above it.
  const R = (u, v) => [seat[0] + u * k + (v > 0 ? lean * v * H * dir : 0), seat[1] - v * H];
  const RP = (pts) => pts.map(([u, v]) => R(u, v));
  const lt = (pts, c, extra = {}) => L.lit(pts, c, { ...light, ...extra });
  // Note: the far leg first, a shade darker, behind the horse's barrel.
  lt(band([R(0, 0.1), R(1.2, -0.7), R(0.8, -2.7), R(1.0, -3.0)], [H * 0.62, H * 0.5, H * 0.42, H * 0.4]), step(lk.legs, -1), { depth: 0.5 });
  // Note: the torso in the coat, a vest and belt, then the head and hat from the figure.
  lt(RP([[-0.5, 2.3], [-0.2, 2.45], [0.32, 2.38], [0.55, 1.6], [0.5, 0.6], [0.4, 0.0], [-0.55, -0.1], [-0.62, 1.3]]), lk.coat, { depth: 0.5 });
  if (lk.vest != null) lt(RP([[0.32, 2.2], [0.5, 1.6], [0.46, 0.45], [0.3, 0.35]]), lk.vest, { depth: 0.3, edge: false });
  lt(RP([[-0.5, 0.3], [0.5, 0.3], [0.5, -0.05], [-0.5, -0.05]]), C.WOOD, { depth: 0.3, edge: false });
  if (lk.badge) { const b = R(0.36, 1.6); L.set(b[0], b[1], C.GOLD_L); }
  // Note: the head may be drawn a little large (head) so a face reads at a distance; it is set on the torso's neck.
  const Hf = H * (rd.head ?? 1);
  const figFoot = seat[1] - 2.0 * H + 6.0 * Hf;
  const fig = pixelSide(L.w, L.h, seat[0], figFoot, 7.5 * Hf, look || { ...lk, badge: false }, 'stand', { dir, lx: light.lx, ly: light.ly, cool: light.cool, coat: lk.coat, hat: lk.hat, girth: 1.15 * (H / Hf) });
  // Note: only the neck, head and hat are kept from the figure, sheared by the lean; a lit face is lightened a step.
  const cut = Math.round(seat[1] - 2.0 * H);
  const skins = [lk.skin, step(lk.skin, -1), step(lk.skin, -2)];
  for (let y = 0; y < cut; y++) for (let x = 0; x < L.w; x++) {
    const p = fig.a[y * L.w + x];
    if (p === NONE) continue;
    L.set(x + (lean ? Math.round(lean * (seat[1] - y) * dir) : 0), y, rd.bright && skins.includes(p) ? step(p, 2) : p);
  }
  // Note: the near leg over the fender: the thigh bent forward, the shin hanging, the boot in the stirrup, and the coat's skirt over the thigh.
  lt(band([R(0, 0.1), R(1.3, -0.6), R(1.0, -1.8), R(0.9, -2.7)], [H * 0.7, H * 0.55, H * 0.45, H * 0.4]), lk.legs, { depth: 0.5 });
  lt(RP([[-0.7, 0.3], [0.6, 0.5], [1.5, -0.1], [1.55, -0.9], [0.7, -1.1], [-0.5, -0.5], [-0.85, -0.1]]), lk.coat, { depth: 0.5 });
  lt(RP([[0.6, -2.5], [1.2, -2.5], [1.3, -2.85], [2.0, -2.95], [2.0, -3.35], [0.6, -3.35]]), C.WOOD_D, { depth: 0.4 });
  const sole = R(0.6, -3.35);
  L.rect(Math.min(sole[0], R(2.0, -3.35)[0]), sole[1], Math.abs(R(2.0, 0)[0] - R(0.6, 0)[0]), Math.max(1, H * 0.12), C.IRON_L);
  // Note: the arm forward to the hand on the reins.
  const sh = R(0.05, 2.05);
  const el = R(0.4, 0.9);
  const hand = R(1.7, 1.1);
  lt(band([sh, el, hand], [H * 0.3, H * 0.24, H * 0.2]), step(lk.coat, 1), { depth: 0.45 });
  L.ellipse(hand[0] + dir * H * 0.15, hand[1], H * 0.17, H * 0.17, lk.skin);
  if (o.reins !== false) {
    const bit = N(1.36, 1.65);
    L.line(bit[0], bit[1], (bit[0] + hand[0]) / 2, (bit[1] + hand[1]) / 2 + S * 0.07, C.WOOD_D);
    L.line((bit[0] + hand[0]) / 2, (bit[1] + hand[1]) / 2 + S * 0.07, hand[0], hand[1], C.WOOD_D);
  }
}
