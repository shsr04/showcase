// Note: the office and close-up panels (items 378, 380, 381, 383): built as places in metres and filmed through a camera.

import { C } from '../palette.js';
import { Px, step, dith, text, signText, rotated, NONE } from './pixel-art.js';
import { pixelFigure, pixelSide } from './pixel-figure.js';
import { camera3, box, render, noise } from './pixel-3d.js';
import { PW, PH, place, puff } from './pixel-kit.js';
import { inRect, boards, plaster, sheet, paper, lamp, toward, masked, limb, hand, glint, haze, billTex, reportTex, mapTex, tinTex, folderTex, letterTex, envelopeTex, castShadow, revolver, horse, starMat, drawStar, marchLayer } from './pixel-office-kit.js';

// Note: the office room of the window shot, in the same metres: the front wall along z = 0 with its window and door, the back wall at z = -4.5, the desk where the sheriff sits; rooms of other panels are built from these pieces.
const WINR = [1.0, 4.4, 0.9, 2.8];
const DOORR = [6.2, 7.2, 0, 2.3];
const DESK = [4.0, 5.7, -3.1, -2.35];

// Note: the back wall's wanted bills, rack and hooks as one material.
function officeBack(bills) {
  return (p) => {
    const [x, y] = p;
    if (y < 1.0) return y > 0.95 ? { c: C.WOOD_D } : boards(C.WOOD_D, x, y, 0.3);
    if (inRect(x, y, [1.3, 1.85, 1.45, 2.2])) return sheet(bills[0], (q) => [(q[0] - 1.3) / 0.55, (2.2 - q[1]) / 0.75])(p);
    if (inRect(x, y, [2.1, 2.5, 1.6, 2.1])) return sheet(bills[1], (q) => [(q[0] - 2.1) / 0.4, (2.1 - q[1]) / 0.5])(p);
    if (inRect(x, y, [5.2, 6.6, 1.35, 2.2])) {
      // Note: the rifle rack: a dark board, three long guns with iron barrels and wooden stocks, a rail and a brass plate.
      const lx = ((x - 5.2) % 0.45) - 0.225;
      const gun = Math.abs(lx) < 0.035 && x < 6.45;
      if (gun) return y > 1.85 ? { c: Math.abs(lx) < 0.012 ? C.BONE : C.STONE_L, ambient: 4 } : { c: Math.abs(lx) < 0.012 ? C.PLANK_L : C.PLANK, ambient: 4 };
      if (Math.abs(y - 1.9) < 0.025 || Math.abs(y - 1.55) < 0.025) return { c: C.WOOD_L, ambient: 4 };
      if (Math.abs(x - 5.9) < 0.1 && Math.abs(y - 2.1) < 0.04) return { c: C.GOLD, ambient: 4 };
      return { c: C.SHADOW };
    }
    if (inRect(x, y, [3.1, 3.3, 1.6, 1.8])) return { c: C.WOOD_D };
    return plaster(x, y, C.ADOBE_D);
  };
}

// Note: the room's shell: floor, back wall, side walls, ceiling beams and the front wall with the window and the door as holes.
function officeShell(bills) {
  const front = (p, n) => {
    const [x, y] = p;
    if (n && n[2] > 0 && !inRect(x, y, [DOORR[0] - 0.08, DOORR[1] + 0.08, -1, DOORR[3] + 0.08]) && !inRect(x, y, WINR) && !inRect(x, y, [WINR[0] - 0.09, WINR[1] + 0.09, WINR[2] - 0.05, WINR[3] + 0.1])) return { ...boards(C.WOOD, x, y, 0.19), ambient: 6.5 };
    if (inRect(x, y, WINR) || inRect(x, y, DOORR)) return null;
    if (inRect(x, y, [WINR[0] - 0.09, WINR[1] + 0.09, WINR[2] - 0.05, WINR[3] + 0.1])) return { c: C.WOOD_D };
    if (inRect(x, y, [DOORR[0] - 0.08, DOORR[1] + 0.08, -1, DOORR[3] + 0.08])) return { c: C.WOOD_D };
    return y < 1.0 ? boards(C.WOOD_D, x, y, 0.3) : plaster(x, y, C.ADOBE_D);
  };
  return [
    box([-0.2, 0, -0.12], [9.2, 3.3, 0], front),
    box([-0.2, -0.1, -4.4], [9.2, 0, -0.12], (p) => boards(C.WOOD, p[2], p[0], 0.22)),
    box([-0.2, 0, -4.5], [9.2, 3.3, -4.4], officeBack(bills)),
    box([-0.3, 0, -4.4], [-0.2, 3.3, -0.12], (p) => (p[1] < 1 ? boards(C.WOOD_D, p[2], p[1], 0.3) : plaster(p[2], p[1], C.ADOBE_D))),
    box([9.2, 0, -4.4], [9.3, 3.3, -0.12], (p) => (p[1] < 1 ? boards(C.WOOD_D, p[2], p[1], 0.3) : plaster(p[2], p[1], C.ADOBE_D))),
    box([-0.2, 3.2, -4.4], [9.2, 3.3, -0.12], (p) => ({ c: (p[0] % 0.8) < 0.15 ? C.WOOD_D : C.WOOD })),
  ];
}

// Note: the sheriff's desk: a top of planks over drawers and a kneehole, at the window shot's place.
function officeDesk(extra = []) {
  const [x0, x1, z0, z1] = DESK;
  return [
    box([x0, 0.74, z0], [x1, 0.8, z1], (p, n) => (n[1] > 0 ? boards(C.WOOD_L, p[2], p[0], 0.14) : { c: C.WOOD_D })),
    box([x0 + 0.04, 0, z0], [x0 + 0.5, 0.74, z1 - 0.02], (p, n) => (n[2] > 0 && inRect(p[0] - x0, p[1], [0.1, 0.44, 0.1, 0.34]) ? { c: C.WOOD_D } : n[2] > 0 && Math.hypot(p[0] - x0 - 0.27, p[1] - 0.22) < 0.025 ? { c: C.GOLD } : { c: C.WOOD })),
    box([x1 - 0.5, 0, z0], [x1 - 0.04, 0.74, z1 - 0.02], (p, n) => (n[2] > 0 && inRect(p[0] - (x1 - 0.5), p[1], [0.06, 0.4, 0.4, 0.68]) ? { c: C.WOOD_D } : n[2] > 0 && Math.hypot(p[0] - (x1 - 0.27), p[1] - 0.54) < 0.025 ? { c: C.GOLD } : { c: C.WOOD })),
    box([x0 + 0.5, 0.3, z0], [x1 - 0.5, 0.74, z0 + 0.04], () => ({ c: C.WOOD_D })),
    ...extra,
  ];
}

// Note: the street seen through the open door at night: the boardwalk, its edge and the far side with a lit window or two.
function officeNight() {
  return [
    box([-12, -0.1, 0], [70, 0, 3.8], (p) => ({ ...boards(C.WOOD, p[2], p[0], 0.22), ambient: 6.5 })),
    box([-12, -0.38, 3.8], [70, 0, 3.86], () => ({ c: C.WOOD_D, ambient: 6.5 })),
    box([-12, -0.5, 3.86], [70, -0.38, 40], (p) => ({ ambient: 6.5, c: noise(Math.floor(p[0] * 4), Math.floor(p[2] * 4)) > 0.8 ? C.SAND : C.SAND_D })),
    box([-12, 3.0, 0], [70, 3.1, 3.95], () => ({ c: C.WOOD_D })),
    box([-12, -0.4, 15], [70, 6.5, 15.3], (p) => {
      const seg = Math.floor((p[0] + 12) / 7);
      if (p[1] > 4.6 + noise(seg, 1) * 1.8) return null;
      const wx = (p[0] + 12) % 7;
      if (p[1] > 1.4 && p[1] < 2.6 && Math.abs(wx - 2) < 0.5) return noise(seg, 2) > 0.45 ? { emit: C.GOLD } : { c: C.SHADOW };
      return boards([C.WOOD, C.ADOBE, C.WOOD_L][seg % 3], p[0], p[1], 0.25);
    }),
  ];
}

// Note: the sheriff's office seen from the street, in the window shot's metres: the front along z = 0 with its glazed window, closed door and hanging shingle, the porch roof on posts, the boardwalk and the street; open is a door standing ajar. sign is the painted shingle.
function officeStreet({ open = false, crepe = false } = {}) {
  const sign = new Px(64, 18);
  sign.rect(0, 0, 64, 18, C.PLANK);
  sign.rect(0, 0, 64, 1, C.PLANK_L);
  sign.rect(0, 17, 64, 1, C.WOOD_D);
  signText(sign, 'SHERIFF', 5, 4, C.DARK, { scale: 2, shadow: C.PLANK_L });
  const front = (p) => {
    const [x, y] = p;
    if (inRect(x, y, WINR)) return (Math.abs(x - 2.7) < 0.03 || Math.abs(y - 1.85) < 0.03) ? { c: C.WOOD_D } : { c: (Math.floor((x + y * 0.8) * 9) % 7 === 0) ? C.GLASS : C.IRON, k: 0.8 };
    if (inRect(x, y, [WINR[0] - 0.09, WINR[1] + 0.09, WINR[2] - 0.07, WINR[3] + 0.1])) return { c: C.WOOD_D };
    if (!open && inRect(x, y, DOORR)) return Math.hypot(x - 6.35, y - 1.0) < 0.035 ? { c: C.GOLD_L, k: 1.3 } : (inRect(x, y, [6.3, 7.1, 1.3, 2.1]) || inRect(x, y, [6.3, 7.1, 0.25, 1.1]) ? { c: C.WOOD_D } : boards(C.WOOD_L, x, y, 0.2));
    if (open && inRect(x, y, DOORR)) return null;
    if (inRect(x, y, [DOORR[0] - 0.1, DOORR[1] + 0.1, -1, DOORR[3] + 0.1])) return { c: C.WOOD_D };
    return boards(C.WOOD, x, y, 0.19);
  };
  return [
    box([-12, 0, -0.12], [70, 4.2, 0], front),
    box([-12, 0, -0.6], [70, 4.0, -0.12], () => ({ c: C.SHADOW })),
    box([-12, -0.1, 0], [70, 0, 3.8], (p) => boards(C.WOOD, p[2], p[0], 0.22)),
    box([-12, -0.38, 3.8], [70, 0, 3.86], () => ({ c: C.WOOD_D })),
    box([-60, -0.5, 3.86], [70, -0.38, 60], (p) => ({ c: noise(Math.floor(p[0] * 6), Math.floor(p[2] * 6)) > 0.88 ? C.SAND_L : noise(Math.floor(p[0] * 3), Math.floor(p[2] * 3)) > 0.8 ? C.SAND : C.SAND_D })),
    box([-12, 3.0, 0], [70, 3.1, 3.95], (p) => ({ c: (((p[0] % 0.6) + 0.6) % 0.6) < 0.12 ? C.SHADOW : C.WOOD_D })),
    box([-12, 3.1, 0], [70, 4.0, 0.1], () => ({ c: C.WOOD })),
    ...[-1.4, 2.3, 5.4, 8.7, 12, 15.3].map((x0) => box([x0, 0, 3.62], [x0 + 0.16, 3.0, 3.78], (p, n) => ({ c: n[0] > 0 ? C.WOOD_L : C.WOOD }))),
    // Note: the shingle hanging out from the front on two chains.
    box([5.6, 2.08, 0.32], [5.66, 2.7, 1.6], (p) => ({ c: sign.get(Math.floor(((p[2] - 0.32) / 1.28) * 64), Math.floor(((2.7 - p[1]) / 0.62) * 18)) })),
    box([5.6, 2.7, 0.42], [5.63, 3.0, 0.45], () => ({ c: C.IRON })),
    box([5.6, 2.7, 1.47], [5.63, 3.0, 1.5], () => ({ c: C.IRON })),
    ...(open ? [box([7.1, 0, -1.0], [7.18, 2.3, -0.12], () => ({ c: C.WOOD_D }))] : []),
    ...(crepe ? [box([6.5, 1.4, 0.0], [6.9, 2.0, 0.02], () => ({ c: C.SHADOW })), box([6.45, 1.95, 0.0], [6.95, 2.0, 0.03], () => ({ c: C.IRON }))] : []),
  ];
}

// Note: a daylit sky from the zenith to the horizon, banded with dither and a few thin clouds.
const daySky = (d, x, y) => {
  const t = Math.max(0, d[1]);
  const c = t > 0.42 ? C.BLUE : t > 0.26 ? (dith(x, y, (0.42 - t) / 0.16) ? C.GLASS : C.BLUE) : t > 0.1 ? (dith(x, y, (0.26 - t) / 0.16) ? C.GLASS_L : C.GLASS) : (dith(x, y, (0.1 - t) / 0.1) ? C.PLASTER_L : C.GLASS_L);
  return noise(Math.floor(x / 9), Math.floor(y / 3)) > 0.93 && t > 0.15 && t < 0.5 ? C.PLASTER_L : c;
};

// Note: which way a figure at a world point faces on screen to look at another point: 1 to the right, -1 to the left.
const facing = (cam, from, to) => Math.sign(cam.project(to)[0] - cam.project(from)[0]) || 1;

// Note: a desk seen from the chair: a plank top in metres with the room's dark wall behind it and a lamp at the back; the camera looks down at the top from a seat's height; things are the boxes lying on it. Returns what the props that follow need.
function deskShot(px, { eye = [0, 0.55, 0.62], pitch = 0.7, yaw = Math.PI / 2, f = 330, lampAt = [-0.34, -0.3], lampY = 0, things = [], top = (p) => boards(C.WOOD, p[2], p[0], 0.2, 3), ambient = 0.07, power = 1.5, reach = 0.95 } = {}) {
  const cam = camera3(eye, yaw, pitch, f, PW, PH);
  const lp = lamp(lampAt[0], lampY, lampAt[1], { power, reach });
  const boxes = [
    box([-1.6, -0.12, -1.2], [1.6, 0, 1.0], top),
    // Note: a lamp raised off the desk (lampY above 0) is only a light, so its foot casts no shadow on the desk.
    ...(lampY > 0 ? [] : lp.boxes),
    ...things,
  ];
  const { px: scene, info } = render(cam, boxes, [lp.light], { ambient, sky: () => C.SHADOW });
  px.over(scene);
  const [gx, gy] = cam.project([lampAt[0], lampY + 0.2, lampAt[1]]);
  return { cam, info, lp, lamp: [gx, gy], lightDir: (at) => toward(cam, at, lp.light.pos) };
}

// Note: a pencil or pen lying on the desk: a thin wooden shaft with a dark tip, drawn from two world points.
function pencil(L, cam, a, b, light) {
  limb(L, cam, a, b, 0.0035, 0.0035, C.GOLD, light, 0.5, true);
  limb(L, cam, b, [b[0] + (b[0] - a[0]) * 0.1, b[1], b[2] + (b[2] - a[2]) * 0.1], 0.0035, 0.0006, C.WOOD_D, light, 0.5, true);
}

// Note: the successor of the oath panel as primitives in metres, standing at foot F facing the direction fd (x, z): a long coat on a chest and skirt, a hat and head, the left arm hanging and the right arm raised in the oath with the elbow bent; shoulders are spheres blended into the chest, and a cloth capsule runs from the waist up under the raised arm. Returns the primitives, their bounds, the right wrist and the back-of-hand direction.
function successorBody(F, fd, look) {
  const fl = Math.hypot(fd[0], fd[1]) || 1;
  const f = [fd[0] / fl, 0, fd[1] / fl];
  const right = [-f[2], 0, f[0]];
  const B = (lx, ly, lz) => [F[0] + right[0] * lx + f[0] * lz, ly, F[2] + right[2] * lx + f[2] * lz];
  const frame = { right, f };
  const lk = { skin: C.ADOBE, hair: C.WOOD_D, coat: C.WOOD_D, shirt: C.PLASTER, hat: C.DARK, band: C.WOOD, hatStyle: 'round', hairStyle: 'short', ...(look || {}) };
  const coat = step(lk.coat, -1);
  const dark = step(coat, -2);
  const loc = (p) => [(p[0] - F[0]) * right[0] + (p[2] - F[2]) * right[2], p[1], (p[0] - F[0]) * f[0] + (p[2] - F[2]) * f[2]];
  // Note: the coat's back: a centre seam, side seams, a vent at the hem and a stitched hem.
  const coatBack = (p) => {
    const q = loc(p);
    if (q[2] < 0 && Math.abs(q[0]) < 0.005 && q[1] > 0.62 && q[1] < 1.5) return dark;
    if (q[2] < 0 && q[1] < 0.78 && Math.abs(q[0]) < 0.012) return dark;
    if (q[2] < 0 && Math.abs(Math.abs(q[0]) - 0.13) < 0.004 && q[1] > 0.95 && q[1] < 1.42) return dark;
    if (q[1] < 0.66 && q[1] > 0.645) return step(coat, -1);
    if (q[2] < 0 && q[0] > 0.04 && q[1] > 1.08 && q[1] < 1.42 && Math.sin((q[1] - 0.45 * q[0]) * 95) > 0.93) return step(coat, -1);
    return coat;
  };
  const S = B(0.215, 1.455, 0.0);
  const E = B(0.5, 1.41, 0.06);
  const W = B(0.52, 1.67, 0.1);
  const S2 = B(-0.215, 1.455, 0);
  const E2 = B(-0.235, 1.17, 0.02);
  const W2 = B(-0.225, 0.93, 0.06);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Note: a sleeve: a seam along the back of the arm, a shirt cuff at the wrist end and creases round the elbow.
  const sleeve = (elbow, cuff) => (p, n, pr) => {
    const ba = sub(pr.b, pr.a);
    const len = Math.hypot(ba[0], ba[1], ba[2]);
    const u = [ba[0] / len, ba[1] / len, ba[2] / len];
    const w = sub(p, pr.a);
    const hh = dotp(w, u) / len;
    const rad = [w[0] - u[0] * dotp(w, u), w[1] - u[1] * dotp(w, u), w[2] - u[2] * dotp(w, u)];
    const bk = [-f[0], 0, -f[2]];
    const ref = [bk[0] - u[0] * dotp(bk, u), bk[1] - u[1] * dotp(bk, u), bk[2] - u[2] * dotp(bk, u)];
    const cs = dotp(rad, ref) / ((Math.hypot(rad[0], rad[1], rad[2]) * Math.hypot(ref[0], ref[1], ref[2])) || 1);
    if (cuff && hh > 0.9) return lk.shirt;
    if (cs > 0.97) return dark;
    const de = Math.hypot(p[0] - elbow[0], p[1] - elbow[1], p[2] - elbow[2]);
    if (de < 0.08 && Math.sin(de * 150) > 0.82) return step(coat, -1);
    return coat;
  };
  const headCol = (p) => (loc(p)[2] < 0.03 && lk.hairStyle !== 'bald' ? lk.hair : lk.skin);
  const brimR = { wide: 0.23, sombrero: 0.28, bowler: 0.14, flat: 0.21 }[lk.hatStyle] ?? 0.2;
  const prims = [
    { t: 'ell', c: B(0, 1.3, -0.02), r: [0.2, 0.25, 0.12], frame, col: coatBack, k: 0.07 },
    { t: 'ell', c: B(0, 0.92, -0.03), r: [0.21, 0.3, 0.13], frame, col: coatBack, k: 0.09 },
    { t: 'cap', a: B(0, 1.52, 0), b: B(0, 1.63, 0.01), ra: 0.055, rb: 0.05, col: lk.skin, k: 0.03 },
    { t: 'ell', c: B(0, 1.53, -0.005), r: [0.095, 0.04, 0.085], frame, col: coat, k: 0.03 },
    { t: 'ell', c: B(0, 1.585, 0.0), r: [0.062, 0.03, 0.06], frame, col: lk.shirt, k: 0.01 },
    { t: 'ell', c: B(0, 1.7, 0.015), r: [0.085, 0.11, 0.095], frame, col: headCol, k: 0.02 },
    { t: 'sph', c: B(0.088, 1.7, 0.0), r: 0.02, col: lk.skin, k: 0.01 },
    { t: 'sph', c: B(-0.088, 1.7, 0.0), r: 0.02, col: lk.skin, k: 0.01 },
    { t: 'ell', c: B(0, 1.78, 0.02), r: [brimR, 0.012, brimR], frame, col: lk.hat, k: 0.004 },
    { t: 'ell', c: B(0, 1.84, 0.01), r: [0.105, 0.075, 0.105], frame, col: (p) => (p[1] < 1.8 ? lk.band : lk.hat), k: 0.004 },
    { t: 'sph', c: S, r: 0.068, col: coat, k: 0.06 },
    { t: 'sph', c: S2, r: 0.068, col: coat, k: 0.06 },
    { t: 'cap', a: B(0.17, 1.1, 0.0), b: B(0.27, 1.4, 0.0), ra: 0.075, rb: 0.055, col: coat, k: 0.08 },
    { t: 'cap', a: S, b: E, ra: 0.058, rb: 0.048, col: sleeve(E, false), k: 0.05 },
    { t: 'sph', c: E, r: 0.05, col: (p) => (Math.sin(Math.hypot(p[0] - E[0], p[1] - E[1], p[2] - E[2]) * 150) > 0.82 ? step(coat, -1) : coat), k: 0.04 },
    { t: 'cap', a: E, b: W, ra: 0.046, rb: 0.036, col: sleeve(E, true), k: 0.04 },
    { t: 'cap', a: S2, b: E2, ra: 0.056, rb: 0.046, col: sleeve(E2, false), k: 0.05 },
    { t: 'cap', a: E2, b: W2, ra: 0.046, rb: 0.037, col: sleeve(E2, true), k: 0.04 },
    { t: 'sph', c: B(-0.225, 0.86, 0.07), r: 0.045, col: lk.skin, k: 0.02 },
  ];
  const bounds = [[F[0] - 0.7, 0.55, F[2] - 0.75], [F[0] + 0.8, 2.0, F[2] + 0.75]];
  return { prims, bounds, wrist: W, backOfHand: [-f[0], 0, -f[2]] };
}

// Note: one elongated droplet along the ray it flew, drawn only where the mask allows when one is given.
function drop(px, x0, y0, a, rad, mask) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  for (let y = Math.floor(y0 - rad * 3); y <= y0 + rad * 3; y++) {
    for (let x = Math.floor(x0 - rad * 3); x <= x0 + rad * 3; x++) {
      if (x < 0 || y < 0 || x >= PW || y >= PH || (mask && !mask[y * PW + x])) continue;
      const ex = x - x0;
      const ey = y - y0;
      const dd = Math.hypot((ex * ca + ey * sa) / 2.1, -ex * sa + ey * ca);
      if (dd < rad) px.set(x, y, dd < rad * 0.45 && ex * ca + ey * sa < 0 ? C.RED : C.RED_D);
    }
  }
}

// Note: blood that reached the star: droplets flung from the pool land on the side facing it, with a streak running down the face of the star.
function bloodOnStar(px, r, origin, mask) {
  const pts = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) pts.push([i % PW, (i / PW) | 0]);
  if (!pts.length) return;
  const cxs = pts.reduce((n, p) => n + p[0], 0) / pts.length;
  const cys = pts.reduce((n, p) => n + p[1], 0) / pts.length;
  for (let k = 0; k < 26; k++) {
    const [x, y] = pts[Math.floor(r.next() * pts.length)];
    const facing = (x - cxs) * (origin[0] - cxs) + (y - cys) * (origin[1] - cys) > -60 * r.next();
    if (!facing) continue;
    drop(px, x, y, Math.atan2(y - origin[1], x - origin[0]), 0.9 + r.next() * 1.4, mask);
  }
  for (let k = 0; k < 3; k++) {
    const [x, y] = pts[Math.floor(r.next() * pts.length)];
    for (let j = 0; j < 9; j++) if (mask[(y + j) * PW + x]) px.set(x, y + j, C.RED_D);
  }
}

// Note: a bold blood spatter drawn in screen space: a big pool with flowing lobes, a wet sheen, and elongated droplets flung along their rays.
function bloodSpatter(px, r) {
  const [cx, cy] = [56, 52];
  const radius = (a) => 54 * (1 + 0.16 * Math.sin(2 * a + 1) + 0.11 * Math.sin(3 * a + 4) + 0.06 * Math.sin(5 * a))
    + 34 * Math.exp(-(((a - 0.75) / 0.2) ** 2)) + 26 * Math.exp(-(((a - 1.2) / 0.11) ** 2)) + 20 * Math.exp(-(((a - 0.15) / 0.13) ** 2));
  for (let y = 0; y < 150; y++) {
    for (let x = 0; x < 170; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy) / radius(Math.atan2(dy, dx)) + (noise(x >> 1, y >> 1) - 0.5) * 0.07;
      if (d >= 1) continue;
      const wet = 1 - d;
      let c = d > 0.95 ? C.DARK : C.RED_D;
      if (d < 0.5 && dith(x, y, 0.15 + wet * 0.35)) c = C.RED;
      if (d < 0.22 && dith(x + 1, y, 0.12)) c = C.RED_L;
      px.set(x, y, c);
    }
  }
  // Note: a glossy sheen across the upper left of the pool.
  for (let i = 0; i < 22; i++) px.set(30 + i, 36 - Math.round(Math.sin(i / 6) * 3) + (i >> 3), C.RED);
  const rays = Array.from({ length: 110 }, () => ({ a: -0.5 + 2.9 * r.next(), f: r.next() }));
  for (const q of rays) {
    const dist = 62 + 95 * q.f ** 1.2 + r.next() * 10;
    drop(px, cx + Math.cos(q.a) * dist, cy + Math.sin(q.a) * dist, q.a, 1.2 + 4.2 * (1 - q.f) ** 1.5, null);
  }
  return [cx, cy];
}

export const OFFICE = {
  // Note: item 378 panel 1, built as a place in metres: the office front runs along x with its face at z = 0, the room behind it (z < 0), the boardwalk and the street before it; the camera stands low on the boardwalk and looks along the front.
  window(px, o, r) {
    const cam = camera3([-0.6, 1.55, 6.4], 0.98, 0.07, 250, PW, PH);
    const WIN = [1.0, 4.4, 0.9, 2.8];
    const DOOR = [6.2, 7.2, 0, 2.3];
    const inRect = (x, y, R) => x > R[0] && x < R[1] && y > R[2] && y < R[3];
    const F = [3.0, 1.43, -1.5];
    // Note: materials: planks with seams, grain and nails; plaster, paper, iron.
    const boards = (c, along, across, width = 0.19) => {
      const u = along / width;
      const i2 = Math.floor(u);
      const f2 = u - i2;
      if (f2 < 0.08) return { c: step(c, -2) };
      const tone = noise(i2, 7);
      const base = tone < 0.3 ? step(c, -1) : c;
      // Note: thin grain streaks and a knot now and then.
      const grain = noise(i2 * 3 + Math.floor(f2 * 4), Math.floor(across * 14));
      if (grain > 0.9) return { c: step(base, -1) };
      if (noise(i2, Math.floor(across * 2)) > 0.97 && Math.abs(f2 - 0.5) < 0.2) return { c: step(base, -2) };
      return { c: base };
    };
    const front = (p) => {
      const [x, y] = p;
      if (inRect(x, y, WIN) || inRect(x, y, DOOR)) return null;
      if (inRect(x, y, [WIN[0] - 0.09, WIN[1] + 0.09, WIN[2] - 0.05, WIN[3] + 0.1])) return { c: C.WOOD_D };
      if (inRect(x, y, [DOOR[0] - 0.08, DOOR[1] + 0.08, -1, DOOR[3] + 0.08])) return { c: C.WOOD_D };
      return boards(C.WOOD, x, y);
    };
    const backWall = (p) => {
      const [x, y] = p;
      if (y < 1.0) return y > 0.95 ? { c: C.WOOD_D } : boards(C.WOOD_D, x, y, 0.3);
      if (inRect(x, y, [1.3, 1.85, 1.45, 2.2])) return { c: (Math.floor((2.2 - y) * 30) % 4 === 1 && x > 1.4 && x < 1.75) ? C.WOOD_D : C.PLASTER_L };
      if (inRect(x, y, [2.1, 2.5, 1.6, 2.1])) return { c: (Math.floor((2.1 - y) * 30) % 4 === 1 && x > 2.15) ? C.WOOD_D : C.PLASTER };
      if (inRect(x, y, [5.2, 6.6, 1.35, 2.2])) return { c: Math.abs(((x - 5.2) % 0.35) - 0.17) < 0.03 ? C.IRON : Math.abs(y - 1.6) < 0.04 ? C.WOOD : C.PLASTER };
      return { c: C.PLASTER };
    };
    const sign = new Px(64, 18);
    sign.rect(0, 0, 64, 18, C.PLANK);
    sign.rect(0, 0, 64, 1, C.PLANK_L);
    sign.rect(0, 17, 64, 1, C.WOOD_D);
    text(sign, 'SHERIFF', 5, 4, C.DARK, 2);
    const boxes = [
      box([-12, 0, -0.12], [70, 4.2, 0], front),
      box([WIN[0] - 0.12, WIN[2] - 0.1, 0], [WIN[1] + 0.12, WIN[2], 0.1], () => ({ c: C.WOOD_L })),
      // Note: the room: floor, back wall, side walls, ceiling and the sheriff's desk.
      box([-0.2, -0.1, -4.4], [9.2, 0, -0.12], (p) => boards(C.WOOD, p[2], p[0], 0.22)),
      box([-0.2, 0, -4.5], [9.2, 3.3, -4.4], backWall),
      box([-0.3, 0, -4.4], [-0.2, 3.3, -0.12], (p) => (p[1] < 1 ? boards(C.WOOD_D, p[2], p[1], 0.3) : { c: C.PLASTER })),
      box([9.2, 0, -4.4], [9.3, 3.3, -0.12], () => ({ c: C.PLASTER })),
      box([-0.2, 3.2, -4.4], [9.2, 3.3, -0.12], (p) => ({ c: (p[0] % 0.8) < 0.15 ? C.WOOD_D : C.WOOD })),
      box([4.0, 0, -3.1], [5.7, 0.8, -2.35], (p, n) => ({ c: n[1] > 0 ? C.WOOD_L : C.WOOD })),
      // Note: the boardwalk, its edge, and the street.
      box([-12, -0.1, 0], [70, 0, 3.8], (p) => { const m = boards(C.WOOD, p[2], p[0], 0.22); if (noise(Math.floor(p[0] * 2), Math.floor(p[2] / 0.22)) > 0.97) m.c = C.SHADOW; return m; }),
      box([-12, -0.38, 3.8], [70, 0, 3.86], () => ({ c: C.WOOD_D })),
      box([-12, -0.5, 3.86], [70, -0.38, 40], (p) => ({ c: noise(Math.floor(p[0] * 4), Math.floor(p[2] * 4)) > 0.8 ? C.SAND : Math.abs(((p[2] - 6) % 2.2)) < 0.12 ? C.WOOD_D : C.SAND_D })),
      // Note: the porch roof with its rafters, and the posts along the edge.
      box([-12, 3.0, 0], [70, 3.1, 3.95], (p) => ({ c: (((p[0] % 0.6) + 0.6) % 0.6) < 0.12 ? C.SHADOW : C.WOOD_D })),
      ...[-1.4, 5.4, 8.7, 12, 15.3, 18.6, 21.9].map((x0) => box([x0, 0, 3.62], [x0 + 0.16, 3.0, 3.78], () => ({ c: C.WOOD }))),
      // Note: the shingle hanging out from the front on two chains, and the lantern by the door.
      box([5.6, 2.08, 0.32], [5.66, 2.7, 1.6], (p) => ({ c: sign.get(Math.floor(((p[2] - 0.32) / 1.28) * 64), Math.floor(((2.7 - p[1]) / 0.62) * 18)) })),
      box([5.6, 2.7, 0.42], [5.63, 3.0, 0.45], () => ({ c: C.IRON })),
      box([5.6, 2.7, 1.47], [5.63, 3.0, 1.5], () => ({ c: C.IRON })),
      box([5.25, 2.25, 0.08], [5.4, 2.5, 0.23], () => ({ emit: C.GOLD_L }), { noShadow: true }),
      // Note: the far side of the street, false fronts with a lit window here and there.
      box([-12, -0.4, 15], [70, 6.5, 15.3], (p) => {
        const seg = Math.floor((p[0] + 12) / 7);
        if (p[1] > 4.6 + noise(seg, 1) * 1.8) return null;
        const wx = ((p[0] + 12) % 7);
        if (p[1] > 1.4 && p[1] < 2.6 && Math.abs(wx - 2) < 0.5) return noise(seg, 2) > 0.45 ? { emit: C.GOLD } : { c: C.SHADOW };
        return boards([C.WOOD, C.ADOBE, C.WOOD_L][seg % 3], p[0], p[1], 0.25);
      }),
    ];
    // Note: the flash lights the room, and the outside only where its light passes through the window or the door.
    const through = (p) => {
      if (p[2] < 0.001) return true;
      const t = F[2] / (F[2] - p[2]);
      const q = [F[0] + (p[0] - F[0]) * t, F[1] + (p[1] - F[1]) * t];
      return inRect(q[0], q[1], WIN) || inRect(q[0], q[1], DOOR);
    };
    const lights = [
      { pos: F, power: 2.4, reach: 1.5, visible: through },
      { pos: [5.32, 2.37, 0.45], power: 1.2, reach: 1.1, visible: (p) => p[2] > -0.01 },
    ];
    const sky = (d, x, y) => (noise(x, y) > 0.985 ? C.GLASS_L : d[1] > 0.12 ? C.BLUE_D : dith(x, y, 0.5) ? C.BLUE : C.BLUE_D);
    const { px: scene, info } = render(cam, boxes, lights, { ambient: 0.17, sky });
    px.over(scene);
    // Note: a person standing at a world point, drawn only where the room is seen through the openings and nothing nearer is in the way.
    const stand = (foot3, look, pose, o2, inside) => {
      const [sx, sy, depth] = cam.project(foot3);
      const hgt = cam.scaleAt(foot3) * 1.8;
      const fig = pixelSide(PW, PH, sx, sy, hgt, look, pose, o2);
      const keep = (i) => {
        const h2 = info[i];
        if (!inside) return true;
        return h2 && h2.p[2] < -0.13 && h2.t > depth;
      };
      const L = new Px(PW, PH);
      for (let i = 0; i < fig.a.length; i++) if (fig.a[i] !== NONE && keep(i)) L.a[i] = fig.a[i];
      return L;
    };
    const facing = (from, to) => Math.sign(cam.project(to)[0] - cam.project(from)[0]) || 1;
    const nFoot = [2.0, 0, -1.4];
    const sFoot = [4.0, 0, -1.9];
    place(px, stand(sFoot, o.victim, 'reel', { dir: facing(sFoot, nFoot), lx: -1, ly: -0.2, hatless: true }, true), { lx: -1, lean: 0.24 * -facing(sFoot, nFoot), foot: cam.project(sFoot)[1], rim: 1 });
    place(px, stand(nFoot, o.nemesis, 'gun', { dir: facing(nFoot, sFoot), lx: 1, ly: -0.2 }, true), { lx: 1, rim: 1 });
    // Note: the muzzle flash and its smoke, where the gun is in the room.
    const [fx, fy] = cam.project(F);
    for (let a2 = 0; a2 < 18; a2++) {
      const ang = (a2 / 18) * Math.PI * 2;
      const l2 = a2 % 2 ? 5 : 11;
      px.line(fx, fy, fx + Math.cos(ang) * l2, fy + Math.sin(ang) * l2 * 0.8, a2 % 2 ? C.RED_L : C.GOLD);
    }
    px.ellipse(fx, fy, 3.5, 3, C.GOLD_L);
    px.ellipse(fx, fy, 1.5, 1.2, C.BONE);
    puff(px, fx - 6, fy - 6, 9, 5, C.STONE_L, 0.45);
    // Note: papers from the desk in the air.
    for (let k = 0; k < 6; k++) {
      const [qx, qy] = cam.project([4.2 + r.next() * 1.4, 1.0 + r.next() * 1.0, -2.6 + r.next() * 0.6]);
      px.rect(qx, qy, 2, 1, C.BONE);
    }
    // Note: the deputy on the boardwalk close to the camera, turned to the flash in the window; the flash catches his face and the near edge.
    const dFoot = [2.6, 0, 4.5];
    const winMid = [2.7, 1.8, 0];
    const dDir = facing(dFoot, winMid);
    const dep = stand(dFoot, o.deputy, 'draw', { dir: dDir, lx: dDir, ly: 0, cool: true }, false);
    place(px, dep, { lx: dDir, ly: 0, rim: 2 });
  },

  // Note: item 378 panel 3: the office after the shot, filmed from inside at a low eye by the door: the desk and the slumped sheriff large in the upper frame, the lamp beside him the key light with gunsmoke hanging in its beam, the overturned chair and his hat on the floor in the foreground, moonlight on the boards from the open door.
  office(px, o, r) {
    const S = [4.95, 0, -3.85];
    const cp = [6.5, 1.1, -0.35];
    const yaw = Math.atan2(-(-3.4 - cp[2]), S[0] - cp[0]) - 0.12;
    const cam = camera3(cp, yaw, 0.17, 300, PW, PH);
    const bills = [billTex(22, 30, 'x', { sum: '500' }), billTex(16, 20, 'x', { sum: '250' })];
    const lp = lamp(4.35, 0.8, -3.0, { power: 3.4, reach: 1.5 });
    const M = [7, 4, 9];
    const throughMoon = (p) => {
      if (p[2] > 0.001) return true;
      const t = M[2] / (M[2] - p[2]);
      return inRect(M[0] + (p[0] - M[0]) * t, M[1] + (p[1] - M[1]) * t, DOORR);
    };
    const desk = officeDesk([...lp.boxes, paper(5.2, 0.8, -2.75, 0.34, 0.25, reportTex(22, 16), 0.5), paper(4.7, 0.804, -2.5, 0.3, 0.22, reportTex(18, 14), -0.3), box([5.4, 0.8, -3.0], [5.47, 0.88, -2.93], () => ({ c: C.SHADOW }))]);
    for (const b of desk) { const m = b.mat; b.mat = (p, n) => { const q = m(p, n); return q && n[2] > 0 && q.ambient == null ? { ...q, ambient: 7 } : q; }; }
    const boxes = [
      ...officeShell(bills),
      ...desk,
      // Note: the chair he sits in: a seat, a high back and a post on a foot, set behind the desk.
      box([4.65, 0.42, -4.1], [5.25, 0.48, -3.5], () => ({ c: C.WOOD_D, ambient: 4 })),
      box([4.65, 0.48, -4.15], [5.25, 1.25, -4.08], () => ({ c: C.WOOD, ambient: 4 })),
      box([4.92, 0.0, -3.9], [4.98, 0.42, -3.84], () => ({ c: C.IRON })),
      // Note: the visitor's chair kicked over in the foreground, its legs in the air, and the dead man's hat on the boards.
      box([6.4, 0, -3.0], [6.44, 0.46, -2.5], () => ({ c: C.WOOD, ambient: 6 })),
      box([6.0, 0, -3.0], [6.44, 0.04, -2.5], () => ({ c: C.WOOD_L, ambient: 6 })),
      box([5.9, 0, -3.0], [6.0, 0.04, -2.96], () => ({ c: C.WOOD, ambient: 6 })),
      box([5.9, 0, -2.54], [6.0, 0.04, -2.5], () => ({ c: C.WOOD, ambient: 6 })),
      // Note: the revolver on the boards where he dropped it.
      box([4.3, 0, -3.3], [4.52, 0.03, -3.26], () => ({ c: C.IRON_L })),
    ];
    const lights = [lp.light, { pos: M, power: 1.0, reach: 12, visible: throughMoon }];
    const { px: scene, info } = render(cam, boxes, lights, { ambient: 0.12, sky: () => C.BLUE_D });
    px.over(scene);
    // Note: the dead sheriff in his chair: a standing sprite set low so the desk hides him below the belly, slumped sideways about the hip; the lamp on his left lights his face.
    const [sx, sy] = cam.project([S[0], -0.4, S[2]]);
    const sc = cam.scaleAt([S[0], -0.4, S[2]]);
    const [lx, ly] = toward(cam, [S[0], 1.0, S[2]], [4.35, 1.0, -3.0]);
    const look = o.victim ? { ...o.victim, badge: true } : null;
    const fig = pixelFigure(PW, PH, sx, sy, sc * 1.8, look, 'stand', { lx, ly, cool: false, hatless: true });
    const hh = (sc * 1.8) / 7.5;
    fig.ellipse(sx - hh * 0.35, sy - hh * 4.75, hh * 0.45, hh * 0.6, C.RED_D);
    fig.ellipse(sx - hh * 0.35, sy - hh * 4.75, hh * 0.22, hh * 0.3, C.RED);
    fig.line(sx - hh * 0.3, sy - hh * 4.3, sx - hh * 0.28, sy - hh * 3.9, C.RED_D);
    const hipY = cam.project([S[0], 0.5, S[2]])[1];
    const slump = rotated(fig, sx, hipY, -0.2);
    place(px, masked(slump, info, Math.hypot(S[0] - cam.pos[0], 0.6 - cam.pos[1], S[2] - cam.pos[2])), { lx, ly, rim: 1 });
    // Note: the sheriff's hat fallen on the desk's near edge, drawn from its brim and crown through the camera: a tilted brim, a dented crown with a band, lit from the lamp.
    const hc = [5.15, 0.82, -2.55];
    const [hx, hy] = cam.project(hc);
    const hs = cam.scaleAt(hc);
    const H2 = new Px(PW, PH);
    H2.lit([[hx - 0.24 * hs, hy], [hx - 0.1 * hs, hy - 0.08 * hs], [hx + 0.14 * hs, hy - 0.09 * hs], [hx + 0.25 * hs, hy - 0.01 * hs], [hx + 0.12 * hs, hy + 0.06 * hs], [hx - 0.12 * hs, hy + 0.06 * hs]], C.WOOD_L, { lx, ly, depth: 0.4 });
    H2.lit([[hx - 0.1 * hs, hy - 0.03 * hs], [hx - 0.08 * hs, hy - 0.16 * hs], [hx + 0.06 * hs, hy - 0.17 * hs], [hx + 0.1 * hs, hy - 0.03 * hs]], C.PLANK, { lx, ly, depth: 0.5 });
    H2.rect(hx - 0.1 * hs, hy - 0.07 * hs, 0.2 * hs, Math.max(1, 0.03 * hs), C.DARK);
    place(px, H2, { lx, ly, rim: 1 });
    // Note: the lamp's glow and a bright beam of gunsmoke rising in its light, with thinner smoke along the beams and papers still falling.
    const [lampX, lampY] = cam.project([4.35, 1.0, -3.0]);
    px.glow(lampX, lampY, 28, 1.2, true);
    haze(px, lampX, lampY - 22, 20, 30, C.GOLD, 0.45, 5);
    haze(px, lampX + 6, lampY - 30, 34, 16, C.PLASTER_L, 0.4, 2);
    haze(px, ...cam.project([5.4, 2.9, -2.8]).slice(0, 2), 110, 7, C.STONE_L, 0.4, 3);
    haze(px, ...cam.project([5.0, 2.45, -3.5]).slice(0, 2), 70, 6, C.STONE_L, 0.32, 7);
    for (let k = 0; k < 7; k++) {
      const [qx, qy] = cam.project([4.0 + r.next() * 1.6, 0.9 + r.next() * 1.3, -2.6 - r.next() * 0.8]);
      px.rect(qx, qy, 3, 2, r.chance(0.5) ? C.BONE : C.PLASTER);
      px.set(qx, qy + 2, C.STONE);
    }
  },

  // Note: the failure ending's first panel: the old sheriff's office left empty, the chair pushed back, the lamp cold, papers yellowing on the desk and dust in the grey light from the window.
  abandoned(px, o, r) {
    const cp = [6.5, 1.1, -0.35];
    const yaw = Math.atan2(-(-3.4 - cp[2]), 4.95 - cp[0]) - 0.12;
    const cam = camera3(cp, yaw, 0.17, 300, PW, PH);
    const bills = [billTex(22, 30, 'x', { sum: '500' }), billTex(16, 20, 'x', { sum: '250' })];
    const lp = lamp(4.35, 0.8, -3.0);
    // Note: the lamp has burnt out, so its chimney is dull glass instead of a flame.
    const coldLamp = lp.boxes.map((b) => (b.mat && b.mat([0, 0, 0], [0, 0, 1])?.emit ? { ...b, mat: () => ({ c: C.STONE }) } : b));
    const desk = officeDesk([...coldLamp, paper(5.2, 0.8, -2.75, 0.34, 0.25, reportTex(22, 16), 0.5), paper(4.7, 0.804, -2.5, 0.3, 0.22, reportTex(18, 14), -0.3), paper(4.45, 0.806, -2.7, 0.26, 0.2, reportTex(16, 12), 0.9)]);
    for (const b of desk) { const m = b.mat; b.mat = (p, n) => { const q = m(p, n); return q && q.ambient == null ? { ...q, ambient: 5 } : q; }; }
    const boxes = [
      ...officeShell(bills),
      ...desk,
      // Note: the empty chair, pushed back from the desk and turned toward the door.
      box([4.75, 0.42, -4.3], [5.35, 0.48, -3.7], () => ({ c: C.WOOD_D, ambient: 4 })),
      box([4.75, 0.48, -4.36], [5.35, 1.25, -4.3], () => ({ c: C.WOOD, ambient: 4 })),
      box([5.02, 0.0, -4.04], [5.08, 0.42, -3.98], () => ({ c: C.IRON })),
    ];
    // Note: grey daylight falls through the window and the door; the room has no other light.
    const through = (L, R) => (p) => p[2] > 0.001 || inRect(L[0] + (p[0] - L[0]) * (L[2] / (L[2] - p[2])), L[1] + (p[1] - L[1]) * (L[2] / (L[2] - p[2])), R);
    const W = [2.7, 2.4, 6];
    const D = [6.7, 2.6, 7];
    const lights = [{ pos: W, power: 1.6, reach: 12, visible: through(W, WINR) }, { pos: D, power: 1.0, reach: 12, visible: through(D, DOORR) }];
    const { px: scene } = render(cam, boxes, lights, { ambient: 0.12, sky: () => C.STONE_L, cool: false });
    px.over(scene);
    // Note: dust hangs in the window light and a cobweb spans the corner above the desk.
    haze(px, ...cam.project([3.6, 1.8, -2.2]).slice(0, 2), 90, 40, C.STONE_L, 0.22, 11);
    haze(px, ...cam.project([5.0, 1.0, -2.9]).slice(0, 2), 60, 18, C.PLASTER_L, 0.18, 13);
    const [cx, cy] = cam.project([3.9, 3.15, -4.35]);
    for (let k = 0; k < 5; k++) px.line(cx, cy, cx + 6 + k * 4, cy + 14 - k * 3, C.STONE_L);
    for (let k = 1; k < 4; k++) px.line(cx + k * 3, cy + k * 3, cx + k * 5, cy + k, C.STONE_L);
    for (let k = 0; k < 9; k++) {
      const [qx, qy] = cam.project([3.8 + r.next() * 2.2, 0.82, -3.0 + r.next() * 0.6]);
      px.set(qx, qy, C.STONE);
    }
  },

  // Note: item 378 panel 4: a macro shot of the dead sheriff's star on the floorboards, the camera a hand's breadth off the planks and tilted down; one lamp low and to the left makes the metal glint, and the deputy's hand comes into the frame from the right.
  star(px, o, r) {
    const eye = [0.04, 0.27, 0.1];
    const cam = camera3(eye, Math.PI / 2, 1.05, 300, PW, PH);
    const LP = [-0.34, 0.16, -0.12];
    const SC = [0, -0.02];
    const boxes = [
      box([-2, -0.1, -3], [2, 0, 1], (p) => {
        return boards(C.WOOD, p[0], p[2], 0.15, 9);
      }),
      // Note: a spent brass case rolled against a plank seam.
      box([-0.1, 0, 0.05], [-0.085, 0.013, 0.1], (p, n) => ({ c: n[1] > 0 ? C.GOLD_L : C.GOLD, k: 1.5 })),
    ];
    const lights = [{ pos: LP, power: 1.9, reach: 0.7, shadows: true }];
    const { px: scene, info } = render(cam, boxes, lights, { ambient: 0.1, sky: () => C.SHADOW });
    px.over(scene);
    const origin = bloodSpatter(px, r);
    const before = px.a.slice();
    // Note: the sheriff's star as a solid lying on the boards, ray-cast with its own facets, edge, ball tips and cast shadow.
    const bright = drawStar(px, cam, info, { o: [SC[0], 0, SC[1]], ex: [1, 0, 0], n: [0, 1, 0] }, LP, { R: 0.036, power: 2.2, reach: 0.7, ambient: 0.2 });
    // Note: a spark of light where the brightest facet meets the lens.
    if (bright) glint(px, bright.x, bright.y, 4);
    bloodOnStar(px, r, origin, px.a.map((v, i) => v !== before[i]));
    // Note: the deputy's hand and cuff coming in from the right over the planks, fingers curled toward the star; its shadow falls across the floor away from the lamp.
    const look = { skin: C.ADOBE, coat: C.IRON, shirt: C.PLASTER, ...(o.deputy || {}) };
    const L = new Px(PW, PH);
    const [lx, ly] = toward(cam, [0.1, 0.05, 0], LP);
    const light = { lx, ly, cool: false };
    const wrist = [0.2, 0.05, -0.05];
    limb(L, cam, [0.6, 0.18, -0.2], [0.4, 0.09, -0.1], 0.04, 0.034, look.coat, light, 0.45);
    limb(L, cam, [0.4, 0.09, -0.1], wrist, 0.032, 0.028, look.shirt, light, 0.5);
    hand(L, cam, wrist, [-0.95, -0.22, 0.1], [0.1, 0.97, 0.1], light, look.skin, { curl: 0.5, size: 0.095, thumb: 1 });
    const sh = new Px(PW, PH);
    const cs = (px2) => { for (let i = 0; i < px2.a.length; i++) if (px2.a[i] !== NONE) { const x = i % PW; const y = (i / PW) | 0; const gx = x + 14; const gy = y + 10; if (gx < PW && gy < PH && L.a[gy * PW + gx] === NONE) sh.a[gy * PW + gx] = 1; } };
    cs(L);
    for (let i = 0; i < sh.a.length; i++) if (sh.a[i] === 1 && px.a[i] !== NONE) px.a[i] = step(px.a[i], dith(i % PW, (i / PW) | 0, 0.5) ? -2 : -1);
    place(px, L, { lx, ly, rim: 1 });
  },

  // Note: item 380 panel 2 and item 381 panel 2: the star pinned on the coat, at true scale (a star 6.5 cm across, a lapel 8 cm wide, buttons 2 cm, a hand 19 cm long) filmed from 40 cm in three-quarter view; the pinner's hand presses the star from the right, or with no pinner the wearer's own hand comes up from the belt.
  badge(px, o, r) {
    const lk = { skin: C.ADOBE, coat: C.IRON, vest: C.RED_D, shirt: C.PLASTER, bandana: null, ...(o.who || {}) };
    const pin = o.pinner || null;
    const cam = camera3([0.2, 1.33, 0.37], 2.0, 0.0, 300, PW, PH);
    const LP = [-0.32, 1.75, 0.55];
    const SX = 0.105;
    const SY = 1.3;
    const coat = step(lk.coat, -1);
    // Note: the coat front as one material in metres: the opening widening toward the collar, shirt with a placket and pearl buttons, the vest with its 2 cm buttons and a watch chain, lapels 8 cm wide rolled back with stitching and a buttonhole, a stand collar.
    const open = (y) => Math.max(0.008, (0.07 * (y - 1.05)) / 0.45);
    const front = (p) => {
      const [x, y] = p;
      const ax = Math.abs(x);
      const fold = 0.95 + 0.07 * Math.sin(x * 21 + y * 6);
      if (y > 1.42 && ax < 0.08) return ax < 0.058 ? { c: lk.shirt, k: 0.95 } : { c: step(lk.shirt, -1), k: 0.9 };
      if (ax < open(y)) {
        if (y > 1.24 + ax * 0.9) {
          if (Math.hypot(x, y - 1.28) < 0.0055 || Math.hypot(x, y - 1.36) < 0.0055 || Math.hypot(x, y - 1.44) < 0.0055) return { c: C.BONE, k: 1.2 };
          return { c: ax < 0.003 ? step(lk.shirt, -1) : lk.shirt, k: 0.95 };
        }
        if (Math.hypot(x, y - 1.18) < 0.011 || Math.hypot(x, y - 1.1) < 0.011) return { c: C.GOLD_L, k: 1.3 };
        return { c: lk.vest, k: 0.9 };
      }
      if (y > 1.24 && ax < open(y) + 0.08) {
        if (ax < open(y) + 0.006) return { c: step(coat, -2), k: 1 };
        if (Math.abs(ax - open(y) - 0.068) < 0.0018) return { c: step(coat, -2), k: 1 };
        if (x < 0 && Math.abs(y - 1.31) < 0.0025 && ax > open(y) + 0.02 && ax < open(y) + 0.05) return { c: C.SHADOW, k: 1 };
        return { c: step(coat, 1), k: fold * 1.1 };
      }
      if (x > 0.09 && x < 0.2 && Math.abs(y - 1.22) < 0.003) return { c: step(coat, -2), k: 1 };
      return { c: coat, k: fold };
    };
    const boxes = [box([-0.6, 0.7, -0.3], [0.6, 1.9, 0], front)];
    const lights = [{ pos: LP, power: 1.0, reach: 1.4, shadows: true }];
    const { px: scene, info } = render(cam, boxes, lights, { ambient: 0.12, sky: () => C.SHADOW });
    px.over(scene);
    // Note: the same solid star as in the macro panel, pinned on the cloth facing out, its edge, facets and cast shadow lit from the lamp.
    const bright = drawStar(px, cam, info, { o: [SX, SY, 0.0], ex: [1, 0, 0], n: [0, 0, 1] }, LP, { R: 0.03, power: 1.7, reach: 1.2, ambient: 0.2, shine: 30 });
    if (bright) glint(px, bright.x, bright.y, 4);
    // Note: the pinning hand and its sleeve at the same scale: a 19 cm hand, a sleeve 4.5 cm in radius, a shirt cuff; thumb behind the cloth, fingers pressing the star's edge.
    const sleeveLook = pin || lk;
    const sk = pin ? pin.skin ?? C.ADOBE : lk.skin;
    const L = new Px(PW, PH);
    const [lx, ly] = toward(cam, [SX, SY, 0.1], LP);
    const light = { lx, ly, cool: false };
    const wrist = pin ? [0.25, 1.47, 0.055] : [0.14, 1.09, 0.05];
    const dir = pin ? [-0.66, -0.74, -0.09] : [-0.25, 0.96, -0.1];
    const e1 = pin ? [0.4, 1.62, 0.09] : [0.2, 0.9, 0.08];
    const e2 = pin ? [0.35, 1.56, 0.082] : [0.17, 0.98, 0.07];
    limb(L, cam, e1, e2, 0.045, 0.038, sleeveLook.coat, light, 0.45);
    limb(L, cam, e2, wrist, 0.034, 0.03, sleeveLook.shirt ?? C.PLASTER, light, 0.5);
    hand(L, cam, wrist, dir, [0.1, 0.2, 1], light, sk, { curl: 0.6, size: 0.095, thumb: 0.8, spread: 0.85 });
    // Note: the hand's shadow falls on the cloth away from the lamp.
    const sh = new Px(PW, PH);
    for (let i = 0; i < L.a.length; i++) if (L.a[i] !== NONE) { const gx = (i % PW) + 5; const gy = ((i / PW) | 0) + 4; if (gx < PW && gy < PH && L.a[gy * PW + gx] === NONE) sh.a[gy * PW + gx] = 1; }
    for (let i = 0; i < sh.a.length; i++) if (sh.a[i] === 1 && px.a[i] !== NONE) px.a[i] = step(px.a[i], dith(i % PW, (i / PW) | 0, 0.5) ? -2 : -1);
    place(px, L, { lx, ly, rim: 1 });
  },

  // Note: item 380 panel 4: the successor's map on the desk under the lamp, the named place ringed and labelled; a revolver and a box of cartridges beside it, the camera looking down from the chair.
  trail(px, o, r) {
    const where = o.place || '';
    const tex = mapTex(212, 146, where, { px: 0.6, py: 0.46, ring: !!where, seed: 4 });
    const things = [
      paper(-0.02, 0.0, -0.22, 0.54, 0.37, tex, 0.07, C.PLASTER, true),
      // Note: a box of cartridges with its label on the lid, and brass rounds loose beside it.
      box([0.44, 0, -0.34], [0.56, 0.045, -0.23], (p, n) => (n[1] > 0 ? { c: Math.abs(p[0] - 0.5) < 0.045 && Math.abs(p[2] + 0.285) < 0.035 ? C.PLASTER_L : C.RED_D } : { c: n[2] > 0 && p[1] > 0.012 && p[1] < 0.034 && Math.abs(p[0] - 0.5) < 0.045 ? C.PLASTER_L : C.RED_D })),
      ...[0, 1, 2, 3, 4].map((i) => box([0.34 + i * 0.02, 0, -0.1 - i * 0.006], [0.352 + i * 0.02, 0.012, -0.055 - i * 0.006], (p, n) => ({ c: p[2] > -0.07 - i * 0.006 ? C.RED_L : n[1] > 0 ? C.GOLD_L : C.GOLD, k: 1.3 }))),
    ];
    const d = deskShot(px, { things, pitch: 0.62, eye: [0, 0.5, 0.62], lampAt: [-0.4, -0.32], power: 2, reach: 1.1 });
    const L = new Px(PW, PH);
    const [lx, ly] = d.lightDir([0.05, 0.02, 0.0]);
    const light = { lx, ly, cool: false };
    revolver(L, d.cam, [0.2, 0, 0.1], [0.3, 0, -0.95], light, 0.02);
    pencil(L, d.cam, [-0.12, 0.004, 0.0], [-0.26, 0.004, -0.07], light);
    castShadow(px, L, 3, 3);
    place(px, L, { lx, ly, rim: 1 });
    px.glow(d.lamp[0], d.lamp[1], 22, 1.1, true);
  },

  // Note: item 383 panel 2: a torn fragment of map on the desk, off-centre to the right so the portrait sits beside it, the named place ringed; the camera looks down closer than on the trail panel.
  word(px, o, r) {
    const tex = mapTex(204, 144, o.place || '', { px: 0.55, py: 0.45, ring: !!o.place, seed: 9 });
    const things = [
      paper(0.24, 0.0, -0.16, 0.44, 0.31, tex, -0.12, C.PLASTER, true),
    ];
    const d = deskShot(px, { things, pitch: 0.82, eye: [0.02, 0.58, 0.4], lampAt: [-0.36, -0.3], power: 2, reach: 1.1 });
    const L = new Px(PW, PH);
    const [lx, ly] = d.lightDir([0.1, 0.02, -0.1]);
    pencil(L, d.cam, [-0.02, 0.004, 0.12], [-0.16, 0.004, 0.0], { lx, ly, cool: false });
    castShadow(px, L, 3, 3);
    place(px, L, { lx, ly, rim: 1 });
    px.glow(d.lamp[0], d.lamp[1], 22, 1.1, true);
  },

  // Note: item 383 panel 1 (a settled case): a closed case's papers spread on the desk under the lamp, seen from the chair: a folder stamped CLOSED, reports, a wanted bill and one line ringed in ink, with the inkwell and pen.
  papers(px, o, r) {
    const bill = billTex(46, 62, 'x', { sum: '500' });
    for (let a = 0; a < 70; a++) bill.set(Math.round(23 + Math.cos(a / 11) * 20), Math.round(40 + Math.sin(a / 11) * 7), C.RED);
    const things = [
      paper(-0.12, 0.0, -0.2, 0.34, 0.24, folderTex(120, 85), 0.06, C.SAND_L),
      paper(0.2, 0.006, -0.17, 0.21, 0.28, reportTex(66, 88, true), 0),
      paper(0.28, 0.0, -0.21, 0.19, 0.25, reportTex(60, 80), 0),
      paper(0.1, 0.016, -0.02, 0.13, 0.18, bill, -0.18),
      // Note: the inkwell: a squat pot of dark glass with a bright rim and a black mouth.
      box([0.34, 0, -0.02], [0.41, 0.05, 0.05], (p, n) => ({ c: n[1] > 0 && Math.hypot(p[0] - 0.375, p[2] - 0.015) < 0.018 ? C.SHADOW : n[1] > 0 ? C.STONE : C.IRON_L, k: 1.2 })),
    ];
    const d = deskShot(px, { things, pitch: 0.62, eye: [0, 0.44, 0.54], lampAt: [-0.36, -0.36], power: 2, reach: 1.1 });
    const L = new Px(PW, PH);
    const [lx, ly] = d.lightDir([0.0, 0.02, -0.15]);
    pencil(L, d.cam, [0.3, 0.05, 0.02], [0.14, 0.004, 0.09], { lx, ly, cool: false });
    castShadow(px, L, 3, 3);
    place(px, L, { lx, ly, rim: 1 });
    px.glow(d.lamp[0], d.lamp[1], 22, 1.1, true);
  },

  // Note: item 383 panel 1 (a dead associate): his few belongings on a plain dark blanket under one lamp: an open saddlebag spilling its contents, a letter, a tintype of his own face and a knife; the camera looks down from a hand's length above the desk.
  belongings(px, o, r) {
    const lkA = o.associate || null;
    // Note: a plain wool blanket: a dark woven grain with a narrow cream stripe near each end and fringe at the sides.
    const blanket = (p) => {
      if (Math.abs(p[0]) > 0.62) return { c: noise(Math.floor(p[2] * 110), 1) > 0.4 ? C.SAND : C.PLASTER, k: 0.9 };
      if (p[2] > 0.5 || p[2] < -0.55) return { c: C.SHADOW, k: 1 };
      if (Math.abs(p[2] - 0.3) < 0.01 || Math.abs(p[2] + 0.4) < 0.01) return { c: C.PLASTER, k: 0.9 };
      return { c: (Math.floor(p[0] * 130) + Math.floor(p[2] * 130)) % 3 === 0 ? C.WOOD : C.WOOD_D, k: 1 };
    };
    const leather = (c) => (p) => (noise(Math.floor(p[0] * 150), Math.floor(p[2] * 150 + p[1] * 90)) > 0.9 ? { c: step(c, -1) } : { c });
    const tin = tinTex(26, 32, lkA);
    const bag = { x0: -0.4, x1: -0.06, z0: -0.2, z1: 0.0, h: 0.1 };
    const things = [
      // Note: the saddlebag: leather walls round a dark mouth, a flap folded back behind it, a strap with a brass buckle hanging at the front.
      box([bag.x0, 0, bag.z0], [bag.x1, bag.h, bag.z1], (p, n) => {
        if (n[1] > 0) return (p[0] > bag.x0 + 0.025 && p[0] < bag.x1 - 0.025 && p[2] > bag.z0 + 0.025 && p[2] < bag.z1 - 0.025) ? { c: C.SHADOW, k: 1 } : { c: C.WOOD_L, k: 1.1 };
        if (n[2] > 0 && Math.abs(p[0] - (bag.x0 + bag.x1) / 2) < 0.012 && p[1] < bag.h) return { c: p[1] > 0.035 && p[1] < 0.06 ? C.GOLD_L : C.WOOD_D, k: 1.2 };
        return leather(C.WOOD)(p);
      }),
      box([bag.x0, 0, bag.z0 - 0.14], [bag.x1, 0.012, bag.z0], (p) => (Math.abs(p[2] - (bag.z0 - 0.07)) < 0.004 ? { c: C.WOOD_D } : leather(C.WOOD)(p))),
      // Note: what has spilled from it toward the front: a tobacco tin, brass rounds and a rolled red bandana.
      box([-0.02, 0, 0.03], [0.06, 0.03, 0.09], (p, n) => ({ c: n[1] > 0 ? (Math.abs(p[0] - 0.02) < 0.02 && Math.abs(p[2] - 0.06) < 0.012 ? C.RED : C.STONE) : C.IRON_L, k: 1 })),
      ...[0, 1, 2].map((i) => box([-0.16 + i * 0.022, 0, 0.04 + i * 0.01], [-0.146 + i * 0.022, 0.012, 0.085 + i * 0.01], (p, n) => ({ c: p[2] > 0.075 + i * 0.01 ? C.RED_L : n[1] > 0 ? C.GOLD_L : C.GOLD, k: 0.9 }))),
      box([-0.34, 0, 0.05], [-0.24, 0.026, 0.08], (p, n) => ({ c: n[1] > 0 ? C.RED : C.RED_D, k: 1 })),
      paper(0.32, 0.0, -0.12, 0.17, 0.215, letterTex(66, 82), 0.12),
      // Note: the tintype: a thin iron plate in a gold frame with his portrait, face up.
      box([0.04, 0, -0.2], [0.14, 0.008, -0.06], (p, n) => {
        if (n[1] <= 0) return { c: C.IRON };
        const u = (p[0] - 0.04) / 0.1;
        const v = (p[2] + 0.2) / 0.14;
        if (u < 0.09 || u > 0.91 || v < 0.07 || v > 0.93) return { c: C.GOLD, k: 1.2 };
        const c = tin.get(Math.floor(((u - 0.09) / 0.82) * tin.w), Math.floor(((v - 0.07) / 0.86) * tin.h));
        return { c: c === NONE ? C.IRON : c };
      }),
    ];
    const d = deskShot(px, { things, top: blanket, pitch: 0.72, eye: [0, 0.85, 0.75], f: 330, lampAt: [-0.5, 0.05], lampY: 0.4, power: 2.6, reach: 1.0, ambient: 0.09 });
    const L = new Px(PW, PH);
    const [lx, ly] = d.lightDir([0.0, 0.02, -0.1]);
    const light = { lx, ly, cool: false };
    // Note: the knife lies on the blanket's right: a long blade with a bright back, a brass guard and a bone handle.
    limb(L, d.cam, [0.18, 0.01, 0.12], [0.45, 0.01, 0.04], 0.02, 0.002, C.STONE_L, light, 0.5, true);
    limb(L, d.cam, [0.18, 0.011, 0.12], [0.45, 0.011, 0.04], 0.005, 0.001, C.BONE, light, 0.5, true);
    limb(L, d.cam, [0.12, 0.012, 0.14], [0.17, 0.012, 0.125], 0.016, 0.016, C.GOLD, light, 0.5, true);
    limb(L, d.cam, [0.02, 0.012, 0.17], [0.12, 0.012, 0.14], 0.016, 0.015, C.BONE, light, 0.5, true);
    castShadow(px, L, 3, 3);
    place(px, L, { lx, ly, rim: 1 });
    px.glow(d.lamp[0], d.lamp[1], 22, 1.1, true);
  },

  // Note: item 380 panel 1: the oath in the office by daylight, over the successor's shoulder: his back and raised hand at the left, a man holding the Bible before him against the rifle rack; the window's light falls across the back wall.
  oath(px, o, r) {
    const cam = camera3([0.6, 1.5, -0.4], 0.66, 0.03, 240, PW, PH);
    const bills = [billTex(22, 30, 'x', { sum: '500' }), billTex(16, 20, 'x', { sum: '250' })];
    const sun = { pos: [2.6, 2.4, 7], power: 5.5, reach: 9, shadows: true };
    // Note: a lamp on a bracket on the back wall beside the rifle rack: iron arm and a glass chimney that gives the fill light its source.
    const boxes = [
      ...officeShell(bills), ...officeNight(), ...officeDesk([paper(4.5, 0.8, -2.7, 0.3, 0.22, reportTex(22, 16), 0.3)]),
      box([5.3, 1.95, -4.4], [5.4, 2.0, -4.28], () => ({ c: C.IRON })),
      box([5.32, 2.0, -4.36], [5.38, 2.16, -4.3], () => ({ emit: C.GOLD_L }), { noShadow: true }),
    ];
    // Note: a lamp on a bracket by the rifle rack lights the man at the back, so his face reads.
    const fill = { pos: [5.35, 2.08, -4.2], power: 1.6, reach: 2.6 };
    const { px: scene, info } = render(cam, boxes, [sun, fill], { ambient: 0.22, sky: () => C.BLUE_D });
    px.over(scene);
    const sFoot = [1.2, 0, -1.9];
    const hFoot = [6.2, 0, -3.6];
    const [lx, ly] = [-0.6, -0.6];
    const man = (foot, look, pose, ex) => {
      const [sx, sy] = cam.project(foot);
      return pixelFigure(PW, PH, sx, sy, cam.scaleAt(foot) * 1.8, look, pose, { lx, ly, cool: false, ...ex });
    };
    // Note: the man with the Bible: dark coat, bare head, the book held out toward the successor in his near hand.
    const holder = man(hFoot, { skin: C.ADOBE_L, hair: C.STONE_L, coat: C.DARK, vest: C.IRON, shirt: C.PLASTER_L, hat: null, band: C.DARK, hatStyle: 'round', hairStyle: 'short', beard: 'none', moustache: 'thin', badge: false }, 'hold', { dir: -1, hatless: true });
    const [hx, hy] = cam.project(hFoot);
    const hs = cam.scaleAt(hFoot);
    place(px, masked(holder, info, Math.hypot(hFoot[0] - cam.pos[0], hFoot[1] - cam.pos[1], hFoot[2] - cam.pos[2]) - 0.5), { lx, ly, rim: 1 });
    const bookX = hx - (1.9 * hs * 1.8) / 7.5;
    const bookY = hy - (4.6 * hs * 1.8) / 7.5;
    const bw = hs * 0.26;
    const bh = hs * 0.34;
    px.rect(bookX - bw / 2, bookY - bh * 0.8, bw, bh, C.SHADOW);
    px.rect(bookX - bw / 2, bookY - bh * 0.8, 1, bh, C.IRON);
    px.rect(bookX + bw / 2 - 1, bookY - bh * 0.8, 1, bh, C.PLASTER);
    px.rect(bookX - 1, bookY - bh * 0.6, 2, bh * 0.4, C.GOLD);
    px.rect(bookX - bw * 0.2, bookY - bh * 0.5, bw * 0.4, 1, C.GOLD);
    // Note: the successor from behind, built as a body in metres and ray-marched: shoulders, upper arm, elbow and forearm are one smooth surface, the coat's cloth stretching up from the waist to the raised arm's underside, a seam down the sleeve and the back, wrinkles at the bent elbow; his hand is drawn at the end of the forearm.
    const body = successorBody(sFoot, [hFoot[0] - sFoot[0], hFoot[2] - sFoot[2]], o.who || null);
    const keyDir = [0.25, 0.45, 0.85];
    const L = marchLayer(cam, body.prims, body.bounds, { lights: [{ dir: keyDir, power: 0.85 }, { dir: [0.9, 0.3, -0.3], power: 0.3 }], ambient: 0.22 });
    const [wlx, wly] = toward(cam, body.wrist, [2.6, 2.4, 7]);
    hand(L, cam, body.wrist, [0.0, 1.0, 0.05], body.backOfHand, { lx: wlx, ly: wly, cool: false }, (o.who && o.who.skin) ?? C.ADOBE, { curl: 0.08, size: 0.095, thumb: 0.9, spread: 1.1 });
    place(px, L, { lx, ly, rim: 1 });
    // Note: dust turning in the window's beam.
    for (let k = 0; k < 40; k++) px.set(60 + r.next() * 180, 20 + r.next() * 100, C.PLASTER_L);
  },

  // Note: item 380 panel 3: the office's memorial wall, seen head-on from the middle of the room: a board of black crepe with a hat on a peg and a pinned star for every fallen sheriff, a candle burning on the shelf below, and the successor seen from behind at the left, hat off, facing it.
  vow(px, o, r) {
    const n = Math.max(1, Math.min(8, Array.isArray(o.fallen) ? o.fallen.length : (o.fallen | 0) || 1));
    const cam = camera3([5.5, 1.4, -1.3], Math.PI / 2 + 0.08, -0.04, 215, PW, PH);
    const eye = cam.pos;
    const flame = [4.6, 1.65, -4.2];
    const span = Math.min(3.4, Math.max(2.4, n * 0.62 + 0.5));
    const wallX0 = 5.5 - span / 2;
    const wallX1 = wallX0 + span;
    const gap = Math.min(0.66, (span - 0.4) / n);
    const sc = Math.min(1, gap / 0.55);
    const xs = Array.from({ length: n }, (_, i) => wallX0 + span / 2 + (i - (n - 1) / 2) * gap);
    const things = [];
    for (const hx of xs) {
      things.push(box([hx - 0.03, 2.0, -4.34], [hx + 0.03, 2.07, -4.16], () => ({ c: C.IRON_L })));
      // Note: the hat on its peg: a flat brim and a crown with a band; below it the star pinned on the crepe.
      things.push(box([hx - 0.25 * sc, 2.07, -4.33], [hx + 0.25 * sc, 2.1, -3.9], (p, nn) => ({ c: nn[1] > 0 ? C.WOOD_L : C.WOOD_D })));
      things.push(box([hx - 0.13 * sc, 2.1, -4.28], [hx + 0.13 * sc, 2.3, -4.02], (p, nn) => ({ c: p[1] < 2.16 ? C.DARK : nn[1] > 0 ? C.PLANK : C.WOOD_L })));
      things.push(box([hx - 0.08 * sc, 1.7, -4.34], [hx + 0.08 * sc, 1.86, -4.335], starMat(hx, 1.78, 0.062 * sc, eye, flame, { front: true })));
    }
    const boxes = [
      ...officeShell([billTex(22, 30, 'x'), billTex(16, 20, 'x')]),
      // Note: the board of black crepe, with a gold braid round it, hung on the back wall.
      box([wallX0, 1.45, -4.4], [wallX1, 2.5, -4.34], (p) => {
        const edge = Math.min(p[0] - wallX0, wallX1 - p[0], p[1] - 1.45, 2.5 - p[1]);
        if (edge < 0.03) return { c: C.GOLD, k: 1.2 };
        return { c: (Math.floor(p[0] * 30) % 3 === 0) ? C.IRON : C.DARK, k: 1 + 0.25 * Math.sin(p[0] * 20) };
      }),
      box([wallX0 + 0.2, 1.36, -4.4], [wallX0 + 1.3, 1.4, -4.05], (p, nn) => ({ c: nn[1] > 0 ? C.WOOD_L : C.WOOD })),
      box([4.55, 1.4, -4.25], [4.6, 1.56, -4.2], () => ({ c: C.PLASTER_L })),
      box([4.56, 1.56, -4.245], [4.59, 1.62, -4.225], () => ({ emit: C.GOLD_L }), { noShadow: true }),
      ...things,
    ];
    const lights = [{ pos: flame, power: 3, reach: 2.2, shadows: true }, { pos: [2.5, 2.8, 0], power: 0.7, reach: 9, visible: (p) => p[2] < 0.001 }];
    const { px: scene, info } = render(cam, boxes, lights, { ambient: 0.08, sky: () => C.BLUE_D });
    px.over(scene);
    const [cx, cy] = cam.project([4.57, 1.62, -4.23]);
    px.glow(cx, cy, 24, 1.2, true);
    // Note: the successor from behind before the wall, bare-headed, the candle's light on his shoulder.
    const foot = [4.3, 0, -3.5];
    const [sx, sy] = cam.project(foot);
    const [lx, ly] = toward(cam, [foot[0], 1.4, foot[2]], flame);
    const fig = pixelFigure(PW, PH, sx, sy, cam.scaleAt(foot) * 1.8, o.who || null, 'stand', { back: true, dir: 1, lx, ly, cool: true, hatless: true });
    place(px, masked(fig, info, Math.hypot(foot[0] - cam.pos[0], 0, foot[2] - cam.pos[2]) - 0.3), { lx, ly, rim: 1 });
  },

  // Note: item 381 panel 1: the new deputy's oath on the boardwalk in the day, seen from the street at a low eye: he stands with his back to us, his right hand raised, the sheriff before him with the star ready, and townsfolk in loose knots on the porch and in the street, all turned toward the ceremony.
  boardwalk(px, o, r) {
    const cam = camera3([4.2, 1.05, 7.2], Math.PI / 2 + 0.02, -0.04, 250, PW, PH);
    const sun = { pos: [-7, 11, 26], power: 4.2, reach: 80, shadows: true };
    // Note: a hitching rail in the street with its posts, where a boy can sit.
    const rail = [
      box([4.9, 0, 4.2], [5.02, 1.0, 4.32], () => ({ c: C.WOOD })),
      box([7.2, 0, 4.2], [7.32, 1.0, 4.32], () => ({ c: C.WOOD })),
      box([4.9, 0.92, 4.2], [7.32, 1.0, 4.32], (p, n) => ({ c: n[1] > 0 ? C.WOOD_L : C.WOOD })),
      box([4.9, 0.45, 4.2], [7.32, 0.52, 4.32], () => ({ c: C.WOOD })),
    ];
    const boxes = [...officeStreet({ open: true }), ...rail];
    const { px: scene, info } = render(cam, boxes, [sun], { ambient: 0.32, sky: daySky });
    px.over(scene);
    const dayLook = (c, h) => ({ coat: c, hat: h, vest: C.PLASTER, shirt: C.PLASTER_L, skin: C.ADOBE_L, hair: C.WOOD_D, legs: C.IRON, band: C.DARK, hatStyle: 'round', hairStyle: 'short', beard: 'none', moustache: 'none', badge: false });
    const lx = -0.7;
    const ly = -0.6;
    const dist = (f) => Math.hypot(f[0] - cam.pos[0], f[1] - cam.pos[1], f[2] - cam.pos[2]);
    const put = (foot, layer, k = -0.5) => place(px, masked(layer, info, dist(foot) + k), { lx, ly, rim: 1, shadow: { foot: cam.project(foot)[1], sx: 0.5, sy: 0.18 } });
    const fig = (foot, look, pose, ex, hgt = 1.8, mk = pixelFigure) => {
      const [sx, sy] = cam.project(foot);
      return mk(PW, PH, sx, sy, cam.scaleAt(foot) * hgt, look, pose, { lx, ly, cool: false, ...ex });
    };
    const ceremony = [3.0, 1.2, 2.0];
    // Note: the onlookers: each spec is a spot, a view (side on, facing the ceremony, or back to us watching it) and a height; the woman in the doorway and the boy on the rail come first.
    const coats = [C.WOOD, C.IRON, C.RED_D, C.GREEN_D, C.BLUE_D, C.WOOD_L, C.STONE, C.ADOBE_D, C.DARK];
    const hats = [C.WOOD_D, C.PLANK, C.DARK, C.WOOD_L, C.STONE_L, C.IRON];
    const specs = [
      { at: [6.4, 0, 0.25], view: 'side', woman: true },
      { at: [5.5, 0.58, 4.26], view: 'side', hgt: 0.85, kid: true },
      { at: [4.5, 0, 0.8], view: 'side' },
      { at: [4.85, 0, 1.0], view: 'back' },
      { at: [2.0, 0, 1.5], view: 'side' },
      { at: [1.5, 0, 3.0], view: 'back' },
      { at: [1.0, 0, 3.0], view: 'back' },
      { at: [7.6, 0, 1.4], view: 'side' },
      { at: [1.2, 0, 1.9], view: 'side' },
    ];
    const n = Math.max(0, Math.min(specs.length, o.crowd ?? 6));
    for (const sp of specs.slice(0, n)) {
      const foot = sp.at;
      const toward2 = Math.sign(cam.project(ceremony)[0] - cam.project(foot)[0]) || 1;
      let look = dayLook(r.pick(coats), r.pick(hats));
      if (sp.woman) look = { ...look, coat: C.GREEN_D, hat: null, hairStyle: 'long', hair: C.WOOD_D, vest: null, shirt: C.PLASTER_L };
      if (sp.kid) look = { ...look, coat: C.BLUE_D, hat: C.WOOD_L, hatStyle: 'flat', vest: null };
      const layer = sp.view === 'back' ? fig(foot, look, 'stand', { back: true, dir: r.chance(0.5) ? 1 : -1 }, sp.hgt || 1.8) : fig(foot, look, 'stand', { dir: toward2, hatless: !!sp.woman }, sp.hgt || 1.8, pixelSide);
      put(foot, layer);
    }
    // Note: the sheriff, front-on, the star held out at his chest, and the deputy before him, back to us, hand raised.
    const sFoot = [3.3, 0, 1.3];
    const dFoot = [2.6, 0, 2.6];
    const sheriff = fig(sFoot, o.sheriff || null, 'hold', { dir: -1 });
    const [sx, sy] = cam.project(sFoot);
    const sh = (cam.scaleAt(sFoot) * 1.8) / 7.5;
    put(sFoot, sheriff, -0.4);
    const stx = sx - 1.9 * sh;
    const sty = sy - 4.6 * sh;
    px.rect(stx - 1, sty - 2, 3, 5, C.GOLD_L);
    px.rect(stx - 2, sty - 1, 5, 3, C.GOLD_L);
    px.set(stx, sty, C.BONE);
    put(dFoot, fig(dFoot, o.deputy || null, 'raise', { back: true, dir: 1 }), -0.4);
  },

  // Note: item 378 panel 5: the street at first light for the new sheriff's ride: the camera low in the street looking along it into the rising sun, long shadows toward us, his horse saddled at the hitching rail, a church against the dawn; the portrait sits over the middle of the street.
  face(px, o, r) {
    const cam = camera3([9.0, 1.2, 7.6], Math.PI + 0.05, -0.01, 250, PW, PH);
    const sunDir = [-0.985, 0.14, -0.1];
    const sunAt = [cam.pos[0] + sunDir[0] * 160, cam.pos[1] + sunDir[1] * 160, cam.pos[2] + sunDir[2] * 160];
    const sun = { pos: sunAt, power: 9, reach: 3000, shadows: true };
        const boxes = [
      ...officeStreet({ crepe: true }),
      // Note: the hitching rail and its posts in the street.
      box([0.2, 0, 4.7], [0.35, 1.2, 4.85], () => ({ c: C.WOOD })),
      box([4.2, 0, 4.7], [4.35, 1.2, 4.85], () => ({ c: C.WOOD })),
      box([0.2, 1.05, 4.7], [4.35, 1.15, 4.85], (p, n) => ({ c: n[1] > 0 ? C.WOOD_L : C.WOOD })),
      // Note: the far side of the street: a row of false fronts with a few windows lit, and a church with a steeple at the end of the row.
      box([-40, -0.4, 15], [20, 6.5, 15.3], (p) => {
        const seg = Math.floor((p[0] + 40) / 6);
        if (p[1] > 4.2 + noise(seg, 1) * 2) return null;
        const wx = (p[0] + 40) % 6;
        if (p[1] > 1.3 && p[1] < 2.5 && Math.abs(wx - 2) < 0.5) return noise(seg, 2) > 0.5 ? { emit: C.GOLD } : { c: C.SHADOW };
        return boards([C.WOOD, C.ADOBE, C.WOOD_L][seg % 3], p[0], p[1], 0.25);
      }),
      box([-46, -0.5, 12], [-38, 5, 20], (p) => boards(C.PLASTER, p[0], p[1], 0.3)),
      box([-43, 5, 14], [-41, 11, 16.5], (p) => boards(C.PLASTER, p[0], p[1], 0.3)),
      box([-42.6, 11, 14.4], [-41.4, 13, 16.1], () => ({ c: C.WOOD_D })),
      box([-42.2, 13, 14.8], [-41.8, 14.6, 15.7], () => ({ c: C.WOOD_D })),
      box([-70, -0.5, 30], [-20, 0.6, 33], () => ({ c: C.SAND_D })),
    ];
    // Note: the sky as dawn: from night blue above through green-grey and peach to gold at the sun, a disc and its glow.
    const sky = (d, x, y) => {
      const t = Math.max(0, d[1]);
      const dot = d[0] * sunDir[0] + d[1] * sunDir[1] + d[2] * sunDir[2];
      if (dot > 0.9994) return C.BONE;
      if (dot > 0.9975) return C.GOLD_L;
      let c = t > 0.5 ? C.BLUE_D : t > 0.32 ? (dith(x, y, (0.5 - t) / 0.18) ? C.BLUE : C.BLUE_D) : t > 0.2 ? (dith(x, y, (0.32 - t) / 0.12) ? C.GLASS : C.BLUE) : t > 0.1 ? (dith(x, y, (0.2 - t) / 0.1) ? C.PLASTER_L : C.GLASS) : (dith(x, y, (0.1 - t) / 0.1) ? C.GOLD_L : C.PLASTER_L);
      if (dot > 0.985 && dith(x, y, (dot - 0.985) / 0.0125)) c = c === C.PLASTER_L ? C.GOLD_L : C.PLASTER_L;
      return noise(Math.floor(x / 11), Math.floor(y / 3)) > 0.9 && t > 0.2 ? step(c, 1) : c;
    };
    const { px: scene, info } = render(cam, boxes, [sun], { ambient: 0.28, sky });
    px.over(scene);
    // Note: ground mist near the sun, brightening the far street.
    const [sx, sy] = cam.project(sunAt);
    px.wash(0, sy - 14, PW, 34, C.GOLD_L, (x, y) => Math.max(0, 0.55 - Math.abs(y - sy) / 34 - Math.abs(x - sx) / 520));
    // Note: the deputy's horse, saddled at the rail, backlit: its rim catches the sun, its shadow runs toward us.
    const foot = [2.0, 0, 5.7];
    const [hx, hy] = cam.project(foot);
    const H = cam.scaleAt(foot) * 1.5;
    const [lx, ly] = [-0.5, -0.5];
    const L = new Px(PW, PH);
    horse(L, hx, hy, H, 1, C.WOOD, { lx, ly, cool: true });
    place(px, L, { lx: -0.3, ly: -0.7, rim: 2, shadow: { foot: hy, sx: -0.1, sy: 1.1 } });
  },

};
